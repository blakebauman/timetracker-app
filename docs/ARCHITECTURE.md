# Architecture (internal)

Deep-dive for people working on the codebase. `CLAUDE.md` is the terse operating manual (commands, conventions, deploy sequence); this doc is the narrative: how a request flows, where state lives, and why the pieces are shaped the way they are.

## System overview

One Cloudflare Worker serves everything: static SPA assets, the REST API, two WebSocket endpoints, scheduled jobs, and outbound email.

```
Browser SPA (React 19) ─┬─ /api/*        → Hono app (REST, workspace-scoped)
Chrome extension ───────┤─ /api/ws       → TimerRoomDO (timer sync WebSocket)
                        ├─ /agents/*     → ChatAgent DO (Assistant chat, Agents SDK)
                        └─ /*            → static assets (SPA fallback)
Cron (*/5 min) ─────────── scheduled()   → auto-track + recurring materializers
```

- **Runtime:** Cloudflare Workers (`nodejs_compat`), custom domain `timetracker.run`
- **Data:** Cloudflare D1 (SQLite, direct SQL — no ORM), plus per-DO SQLite for the chat agent
- **Bindings** (`wrangler.jsonc`): `DB` (D1), `TIMER_ROOM` + `CHAT_AGENT` (Durable Objects), `AI` (Workers AI), `EMAIL` (send_email)

## Request lifecycle

`src/worker/index.ts` exports `{ fetch, scheduled }` and both DO classes. The fetch handler branches **before** Hono for `/agents/*`:

1. **`/agents/*`** — authenticates the session, resolves the caller's workspace, then **rewrites the agent-instance segment of the URL to that workspace id** before calling `routeAgentRequest` (Agents SDK). This is the tenant-isolation guarantee for chat: a client can name any instance it likes; it always lands on its own workspace's `ChatAgent`.
2. **Everything else** — the Hono app. `/api/auth/*` goes to the Better Auth handler (with in-isolate rate limiting on credential endpoints). All other `/api/*` route groups sit behind `middleware/workspace.ts`, which resolves `{ userId, workspaceId }` from the session (cookie or bearer token) and puts them on context. **Every query in every route filters by `workspace_id`** — this is the multi-tenancy model; there is no row-level magic beyond discipline plus the e2e tenant-isolation suite.
3. Non-API paths fall through to static assets with SPA `not_found_handling` (`run_worker_first` covers `/api/*` and `/agents/*`).

### Route groups (`src/worker/routes/`)

| Mount | File | Notes |
|---|---|---|
| `/api/time_entries` | `time-entries.ts` | CRUD, `/current` (running), `/suggestions`, bulk ops, `/:id/stop` |
| `/api/projects` | `projects.ts` | CRUD + `POST /recolor` (AI color assignment) |
| `/api/clients`, `/api/tasks`, `/api/tags`, `/api/favorites`, `/api/recurring` | one file each | plain CRUD (tags: rename/recolor/delete only — created implicitly via entries) |
| `/api/reports` | `reports.ts` | `summary`, `grouped` (group→subGroup), `weekly`, `detailed`; rounding applied in SQL |
| `/api/saved-reports` | `saved-reports.ts` | per-user saved report configs |
| `/api/planner` | `planner.ts` | per-user planned allocations (project+task per day): `GET ?since&until`, `PUT /` cell upsert (0 deletes), `POST /bulk` (CSV import / copy-week) |
| `/api/settings` | `settings.ts` | per-user prefs stored on the Better Auth `user` row |
| `/api/calendar` | `calendar.ts` | Google OAuth connect/callback/status/disconnect, `GET /events` (read-through), `PATCH /auto-track`, `POST /convert` |
| `/api/ai` | `ai.ts` | `POST /quick-entry` (NL→entry), `POST /summary` (AI report draft); rate-limited |
| `/api/assistant` | `assistant.ts` | `GET /nudges`, `POST /track-event`, memory list/delete. **Chat is NOT here** — see the Assistant below |
| `/api/integrations` | `integrations.ts` | Workfront/Dynamics adapters, `POST /push`, SSRF-guarded, outbound rate limits |
| `/api/admin` | `admin.ts` | `DELETE /users/:id` (site-admin user removal + orphan cleanup); list/ban/impersonate go through Better Auth's admin plugin client-side |
| `/api/ws` | `websocket.ts` | upgrade → `TimerRoomDO` (`idFromName(workspaceId)`) |

`db/queries.ts` holds the shared SQL helpers — `ENTRY_SELECT` is the canonical time-entry JOIN; `broadcast()` fans WebSocket events out through the DO; `upsertTags()` implicitly creates tags with deterministic colors.

## Auth (Better Auth, `src/worker/auth.ts`)

Plugins in play: **email OTP** and **magic link** (the primary passwordless sign-in paths), **bearer** (extension tokens via `set-auth-token` header), **admin** (site-wide `user.role === "admin"`: list/ban/impersonate/remove), **organization** (workspace = organization; owner/admin/member roles, email invites), **passkey**, Google social login. Email/password is disabled in production — `emailAndPassword.enabled` is gated on `ENABLE_PASSWORD_AUTH` (set only in `.dev.vars` and CI), which keeps the sign-up/sign-in endpoints alive for the e2e suite and the local seed demo login. TOTP two-factor was removed along with passwords (Better Auth's enable/disable flow requires the account password); its D1 tables remain but are unused.

Notable decisions:

- `session.freshAge = 0` — otherwise Better Auth's `list-sessions` 403s (`SESSION_NOT_FRESH`) after a day and breaks the Settings sessions card. Freshness is re-imposed selectively on sensitive ops (`update-user`, `unlink-account`).
- A DB hook auto-creates a personal workspace on signup.
- `trustedOrigins` includes the pinned `chrome-extension://<id>` origin — the extension is trusted by origin, CSRF stays on for the cookie web app (see `extension/SECURITY_AUDIT.md`).
- **Email** goes out through the `EMAIL` send_email binding (MIME built with `mimetext`, from `noreply@timetracker.run`): invites, OTP codes, magic links. Bodies are React Email templates (`src/worker/emails/*.tsx`) rendered on the worker with `render`/`toPlainText` from `react-email`; the plain-text MIME part is derived from the HTML, and `pnpm email:dev` serves a local template preview.
- Better Auth tables use camelCase columns; everything else is snake_case.

## Durable Objects

**`TimerRoomDO`** (`durable-objects/TimerRoomDO.ts`) — one per workspace, keyed `idFromName(workspaceId)`. Plain WebSocket room: tabs and the extension connect via `/api/ws`; REST mutations call `broadcast()` so every client sees `timer_update`/entry events live. Each socket is tagged with its authenticated `userId` (`serializeAttachment`, forwarded by `routes/websocket.ts` as `X-User-Id`); the one client→server message is a throttled `{type:"activity"}` heartbeat, relayed as `user_activity` to the same user's *other* sockets so idle detection on their open sessions knows they're active elsewhere (`react-app/lib/activitySync.ts`). No persistent storage of consequence — D1 is the source of truth; the DO is fan-out.

**`ChatAgent`** (`durable-objects/ChatAgent.ts`) — the Assistant's chat brain, one per workspace, built on the Agents SDK (`agents` + `@cloudflare/ai-chat`, `AIChatAgent` base class). Persists conversation history (capped at 100 messages) and resumable streams in its own DO SQLite. Runs `streamText` over Workers AI (`@cf/meta/llama-4-scout-17b-16e-instruct` via `workers-ai-provider`), max 5 tool steps, 800 output tokens, 4k char input cap, 15 msg/min per-workspace rate limit.

## The Assistant — three layers

1. **Nudges — deterministic, no AI** (`lib/assistant.ts`). `GET /api/assistant/nudges` computes: meeting happening now, untracked past meeting, meeting soon (all via the same Google Calendar read-through as `routes/calendar.ts`), long-running timer, empty weekday. Dismissals/seen-markers are client-side (`stores/assistantStore.ts`, persisted). `POST /track-event` is the one-click materializer (idempotent on `calendar_event_id`, AI-assisted project inference).
2. **Chat — ChatAgent DO** over `/agents/*` WebSocket. The frontend (`components/assistant/AssistantPanel.tsx`) uses `useAgent({ agent: "chat-agent" })` + `useAgentChat`. Tools (`lib/assistant-tools.ts`): `startTimer`, `stopTimer`, `logTimeEntry`*, `trackMeeting`*, `deleteEntry`*, `getTimeSummary`, `listProjects`, `rememberPreference`*, `searchMemory` — asterisked tools require **human approval** (AI SDK `needsApproval`, surfaced as in-chat confirm cards). Tool writes reuse the same D1 helpers + `broadcast()` as REST. The system prompt treats calendar/entry/memory text as untrusted data (prompt-injection hardening — audit phase 3).
3. **Memory** (`lib/assistant-memory.ts`, `assistant_memory` table) — per-workspace key/content facts, upsert-by-slug, pruned to 200, keyword recall (no embeddings). Reviewable/deletable via Settings and `GET/DELETE /api/assistant/memory`.

## Workers AI (non-chat) — `lib/ai.ts`

`@cf/meta/llama-3.1-8b-instruct-fp8` with `json_schema` response mode for: quick-entry NL parsing, AI summary drafting, and project color assignment. All three are **best-effort enhancements**: outputs are validated (palette membership, grounded project/task matching) and every path has a deterministic fallback — AI is never the only way a feature works.

## Cron (`scheduled()`, every 5 minutes)

Two independent, idempotent materializers, both iterating workspaces and swallowing per-workspace errors so one bad connection never blocks the sweep:

- **Calendar auto-track** (`lib/calendar-autotrack.ts`) — for workspaces with Google connected + auto-track on, converts *ended* calendar events into entries. Idempotent via `time_entries.calendar_event_id`.
- **Recurring entries** (`lib/recurring.ts`) — materializes each active template once its scheduled UTC time passes. Idempotent via `last_materialized` (UTC date). Schedules stored as UTC weekday + minutes-of-day; the client converts to local time (`react-app/lib/recurrence.ts`).

## Data model (D1)

Migrations live in `migrations/` (append-only; see `CLAUDE.md` for the deploy ordering rule). Core tables: `workspaces`, `clients`, `projects` (rate, budget, color), `tasks`, `time_entries` (+ `calendar_event_id`), `tags` + `time_entry_tags` (tag colors), `favorites`, `recurring_entries`, `saved_reports`, `project_allocations` (per-user planned hours; `task_id` uses `''` for "no task" so the 5-column UNIQUE supports `ON CONFLICT` upserts), `integrations` (encrypted tokens — AES-GCM keyed by `AUTH_SECRET`, `lib/crypto.ts`), `assistant_memory`, plus the Better Auth tables (user/session/account/organization/invitation/twoFactor/passkey).

**Seed data is not a migration.** `seeds/dev-seed.sql` is local-only (`npx wrangler d1 execute time-tracker --local --file=seeds/dev-seed.sql`); migrations 0005/0006 were retroactively no-op'd so remote applies can never seed demo credentials into prod.

## Frontend (`src/react-app/`)

- **Server state:** TanStack Query via the typed client in `lib/api.ts`. Mutations broadcast through the DO; other tabs invalidate on WebSocket events. Each tab stamps requests with a per-page `X-Client-Id` (`lib/api.ts` `CLIENT_ID`), which `broadcast()` echoes back as the message's `origin` so the originating tab skips the invalidate for its own write — it already has the result — instead of refetching the list twice per edit.
- **Entry list row identity:** rows are keyed by `DescriptionGroup.anchorId` (the group's earliest entry id), never by the description+project `key`. Keying by editable content meant an inline rename changed the key mid-mutation: the row unmounted on the optimistic patch, replaying its entrance animation and dropping the per-mutation callbacks that raise the "saved" tick and close the edit sheet. For the same reason the edit sheet is hosted by `EntryList` (driven by `uiStore.editEntryId`), not by the row it edits.
- **Local state:** Zustand — `timerStore` (running timer), `uiStore` (view prefs, calendar prefs, productivity settings), `assistantStore` (nudge dismissals, alert toggle). Device-local by design; account-level prefs go through `/api/settings`.
- **Offline:** `lib/idb.ts` + `useOfflineSync` queue mutations in IndexedDB and replay on reconnect; timer state is cached so a refresh offline doesn't lose the running timer. A queued mutation rejects with `ApiError { queued: true }`, which entry mutations treat as "not yet" rather than "failed" — the optimistic value stays on screen instead of rolling back under a failure toast and then silently reappearing when the queue drains.
- **Entry range validation:** `PUT /api/time_entries/:id` re-reads the stored `start`/`stop` and validates the *merged* range, because `UpdateTimeEntrySchema`'s refine can only compare fields present in the body and every inline edit sends one field. Inverted (`stop < start`) is rejected; zero-length is allowed on update — creating one is blocked, but one that already exists must stay editable.
- **Optimistic stop:** `useTimer.ts` patches the entry to completed in the Query cache *before* clearing the timer so day totals never visibly dip.
- **Timer workspace:** `pages/TimerWorkspace.tsx` — five views (list/calendar/split/timesheet/planner) behind one header; `lib/calendarMapping.ts` renders three event kinds on one grid (real entries, Google ghosts, untracked-gap blocks). `/calendar` redirects here.
- **Global chrome:** `AppShell` mounts the sidebar, command palette (⌘K), keyboard shortcuts, Assistant panel + nudge notifier, and `ProductivityManager` (idle detection, reminders, pomodoro).

Design tokens and conventions live in `DESIGN.md` / `PRODUCT.md` — read those before touching UI; they encode decisions (soft-tone ramp, one-accent rule, icon-button size tokens) that aren't recoverable from the code.

## Browser extension (`extension/`)

Separate Vite build. Popup authenticates with the standard Better Auth client + `bearer()` plugin; token lives in `chrome.storage.local`; the background service worker polls the running timer for the toolbar badge and clears the token on 401 (no refresh flow). Trusted server-side by pinned origin; API base URL is allow-listed. Full model: `extension/README.md`, `extension/SECURITY_AUDIT.md`, `extension/PUBLISHING.md`.

## Security posture (audit history)

Four hardening passes landed as PRs #64–#67 (see git history): cross-tenant IDOR closure on read-backs/tag writes/token cache; SPA headers + prod seed removal + re-gated sensitive auth ops; assistant prompt-injection/tool-abuse/cost-abuse hardening; SSRF guard + outbound rate limits + OAuth workspace binding + extension token clearing. The extension had its own audit (`extension/SECURITY_AUDIT.md`). Known accepted gap: auth rate limiting is in-isolate only (a cross-isolate attacker isn't throttled) — candidate for a DO/KV-backed limiter.

## Testing & CI

No unit test framework — the suite is Playwright e2e (`e2e/`) against `pnpm dev`, covering auth, tenant isolation, SSRF guards, timer sync, reports, assistant, calendar, and more. `.github/workflows/e2e.yml` runs it on every push/PR and is a **required** branch-protection check. Local port conflict tip and full deploy sequence: `CLAUDE.md`.

## Documentation map

| Doc | Audience | Contents |
|---|---|---|
| `README.md` | anyone | overview, features, dev setup |
| `CLAUDE.md` | agents/devs | commands, conventions, deploy sequence |
| `docs/ARCHITECTURE.md` | devs | this file |
| `docs/USER_GUIDE.md` | end users | every feature, by task |
| `docs/CALENDAR_SYNC.md` | devs/self-hosters | Google Calendar setup + sync/auto-track design |
| `PRODUCT.md` / `DESIGN.md` | design work | product register, design system (source of truth for UI) |
| `ROADMAP.md` | devs | deferred/planned work |
| `extension/*.md` | devs/publishers | extension architecture, security audit, store publishing, privacy policy |
