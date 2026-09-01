# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev              # Start Vite + Cloudflare Worker dev server (http://localhost:5173) via @cloudflare/vite-plugin
pnpm build            # TypeScript compile + Vite bundle
pnpm build:ext        # Build browser extension to dist/extension/
pnpm zip:ext          # Build + package dist/timetracker-extension.zip for Chrome Web Store upload
pnpm ext:id           # Print the dev extension ID derived from extension/.keys/extension.pem
pnpm email:dev        # React Email preview server for src/worker/emails/ templates (http://localhost:3333)
pnpm seed:demo        # Seed the LOCAL dev workspace with data that exercises drafting, pacing and digests (needs `pnpm dev` running)
pnpm lint             # ESLint
pnpm check            # Full validation: typecheck + build + wrangler dry-run deploy
pnpm run deploy       # Deploy to Cloudflare Workers (use `run` — `pnpm deploy` hits pnpm's built-in)
pnpm cf-typegen       # Regenerate TS types from wrangler.jsonc bindings (run after binding changes)
npx wrangler tail     # Stream live worker logs
pnpm test:e2e         # Run Playwright e2e tests (spins up `pnpm dev` against localhost:5173)
```

No unit test framework is configured. Playwright e2e tests live in `e2e/` and drive the app through a real browser against the Vite dev server.

### CI / merging

`.github/workflows/e2e.yml` runs the Playwright suite on every push to `main` and every PR (applies local D1 migrations, then `pnpm test:e2e`). This `e2e` check is a **required branch-protection check** — `gh pr merge` is blocked until it reports `pass`; poll `gh pr checks <PR#>` rather than assuming an immediate merge succeeds.

### Deploy sequence

1. Land the PR (CI green, then merge + `git pull --ff-only` on `main`).
2. If the change added a file in `migrations/`, apply it to the **remote** D1 database first: `npx wrangler d1 migrations apply time-tracker --remote` (the `db`/`migrate` skills default to local).
3. `pnpm check` (dry-run validation), then `pnpm run deploy`.
4. Smoke-check: `curl -s -o /dev/null -w "%{http_code}" https://timetracker.run/` should be `200`.

Migrations must land before the worker code that queries their new columns/tables — D1 is one shared remote database, not a per-deploy migration step.

## Architecture

Full-stack TypeScript time tracker (Toggl-like) running entirely on Cloudflare's edge platform.

### Layout

- `src/react-app/` — React 19 SPA (Vite, TailwindCSS v4, shadcn/ui)
- `src/worker/` — Hono backend on Cloudflare Workers
- `src/shared/schemas.ts` — Zod schemas shared by both sides
- `extension/` — Browser extension (separate Vite build)
- `migrations/` — Cloudflare D1 SQL migration files

### Backend (`src/worker/`)

- `index.ts` — Hono app entry; mounts all route groups and auth middleware, and exports the worker's `scheduled()` handler (see Cron below) plus both DO classes alongside `fetch`. Requests to `/agents/*` are intercepted **before** Hono: after auth, the agent-instance URL segment is rewritten to the caller's workspace id (tenant isolation for chat) and handed to the Agents SDK's `routeAgentRequest`.
- `auth.ts` — Better Auth config: passwordless sign-in (email OTP + magic link) + bearer tokens (extension), plus `admin` (site-wide role: list/ban/impersonate), `organization` (workspace = organization; owner/admin/member roles, email invites via the `EMAIL` send_email binding + `mimetext`), passkey, and Google social login. All outgoing email bodies are React Email templates (`src/worker/emails/*.tsx`, shared brand tokens in `emails/theme.ts`) rendered in `sendEmail` via `render`/`toPlainText` from the consolidated `react-email` package (v6 — do NOT add the deprecated `@react-email/components`); preview with `pnpm email:dev`. Email/password is dev/e2e-only, gated on `ENABLE_PASSWORD_AUTH` (set in `.dev.vars` + CI, never deployed) — the e2e `signUp` helper and the seed demo login use the API endpoints directly. TOTP twoFactor was removed with passwords (its enable flow requires one). DB hook auto-creates a personal workspace on signup. `session.freshAge` is explicitly `0` — Better Auth's `list-sessions` endpoint 403s (`SESSION_NOT_FRESH`) once a session passes the default 1-day freshness window otherwise, which broke the Settings → Active Sessions card for every returning user; freshness is re-imposed on sensitive ops (`update-user`, `unlink-account`, `delete-user`). Workspace membership is re-verified against `member` on every request (`middleware/workspace.ts` `resolveWorkspace`, shared with the `/agents/*` gate) — Better Auth only clears `activeOrganizationId` on self-removal.
- `middleware/workspace.ts` — Extracts workspace context from every authenticated request; all route handlers expect `c.get('workspace')`
- `routes/` — One file per resource: `time-entries`, `projects` (includes `POST /recolor`, AI-assisted, and `GET /pacing`), `clients`, `tasks` (the planning model — see Tasks below), `tags` (includes color), `favorites`, `recurring`, `drafts` (proposed entries awaiting review — see Drafting below), `reports` (summary/grouped/weekly/detailed, rounding in SQL), `saved-reports`, `planner` (per-user planned allocations for the Planner view: cell upsert + bulk import), `settings` (per-user prefs on the auth `user` row, incl. digest prefs + `POST /digest/send`), `calendar` (multi-provider sync — `/:provider/connect|callback`, `GET /status` per provider, auto-track toggle, `POST /convert`), `ai` (`/quick-entry` NL parse, `/summary` draft; rate-limited), `assistant` (`GET /nudges` deterministic, `POST /track-event`, memory list/delete — chat is NOT here, see ChatAgent below), `api-keys` (workspace keys for MCP; session-only), `integrations` (Workfront/Dynamics push, SSRF-guarded), `admin` (`DELETE /users/:id`), `websocket`
- `db/queries.ts` — Direct SQL helpers for D1; `ENTRY_SELECT` is the canonical JOIN for time entries; `broadcast()` sends WebSocket events via Durable Object; `upsertTags()` auto-assigns a deterministic color to new tags
- `durable-objects/TimerRoom.ts` — Stateful WebSocket server; one DO per workspace, syncs timer state across browser tabs
- `durable-objects/ChatAgent.ts` — the Assistant's chat: an `AIChatAgent` (Agents SDK + `@cloudflare/ai-chat`) DO, one per workspace, streaming `@cf/meta/llama-4-scout-17b-16e-instruct` over `workers-ai-provider` with tool calling (`lib/assistant-tools.ts` — start/stop/log/track/delete/summarize/remember; writes require human approval via AI SDK `needsApproval`). Persists capped history + resumable streams in DO SQLite; per-workspace rate limit; prompt treats calendar/entry/memory text as untrusted data. Frontend connects with `useAgent`/`useAgentChat` (`components/assistant/AssistantPanel.tsx`). Durable memory: `lib/assistant-memory.ts` + `assistant_memory` table (keyword recall, no embeddings).
- `lib/colors.ts` — Shared swatch palette. `DISTINCT_COLORS` is hue-alternated (not simply hue-ordered) so auto-assigned colors read as visually distinct even for 2-3 items; `TAG_COLORS` is the same set in hue order for the manual picker grid.
- `lib/ai.ts` — Workers AI calls (`@cf/meta/llama-3.1-8b-instruct-fp8`, `json_schema` response mode): quick-entry NL parsing, AI summary drafting, and `runProjectColorAssignment` (color-by-project-name, palette-validated, always falls back to the deterministic spread on a bad/missing AI response — AI assist is a best-effort enhancement, never the only path).
- `lib/calendar-autotrack.ts` / `lib/recurring.ts` / `lib/digest.ts` — Cron-driven jobs (see below).
- `lib/calendar-providers.ts` / `lib/calendar-connections.ts` / `lib/google-calendar.ts` / `lib/microsoft-calendar.ts` — **Calendar sync is multi-provider**: Google Calendar and Outlook / Microsoft 365, each optional, and a workspace may connect BOTH (one `integrations` row per provider, keyed by `type`). Everything downstream — ghost blocks, auto-track, nudges, day drafting — calls `fetchWorkspaceEvents()` and never knows the source. Two Microsoft-only traps, both handled and both silent if reintroduced: refresh tokens **rotate** (Google's don't), and Graph returns **local-naive timestamps** that must be read as UTC via `Prefer: outlook.timezone` — the latter looks correct on a Worker (UTC) and is wrong for every user west of it. See `docs/CALENDAR_SYNC.md`.
- `lib/drafts.ts` — **Drafting a day.** Deterministic candidates (calendar events that ended untracked, uncovered stretches in the day's working window, weekday habits from the last 8 weeks) → **one** AI enrichment call for description + project → validation with a deterministic fallback. Drafts live in their own `draft_entries` table, never behind a status column on `time_entries`: a draft must never reach a report, invoice, project total or integration push, and a separate table makes that structural rather than a promise every aggregate query has to keep. Confirming inserts a real entry and deletes the draft; `POST /drafts/confirm` optionally scales the batch to a reported day total (`scaleDurations`), moving each entry's *end*, never its start. Regeneration is idempotent by unique index on the calendar event and on the slot.
- `routes/tasks.ts` + `src/shared/task-recurrence.ts` — **Tasks.** Tasks are the *plan* side of the timer, `time_entries` the *actual* side. `tasks` carries `due_date` (a local `YYYY-MM-DD` — a due date is a **day**, never an instant), `priority` (1–4, default 4), `sort_order` (REAL, fractional index so a drag writes one row), a self-referencing `parent_id` (**one level only**, enforced in `routes/tasks.ts` since SQLite can't express it), `completed_at`, `recur_rule`, and `description` (the task's **own** notes — distinct from a time entry's description, which goes to a client; conflating them puts acceptance criteria on an invoice line). Three invariants are server-side: the task row's `tracked_seconds` **includes its subtasks'** (a parent is a container; without the rollup it reads as zero all sprint), completing a repeating task **spawns the next occurrence inside the same `PUT`** from the client-supplied `completedOn` local date (no cron, and the UTC worker never guesses a due date), and the rule moves to the new occurrence so reopening the old one can't mint a second. Recurrence vocabulary + local-date arithmetic live in `src/shared/task-recurrence.ts`, shared by worker and client. Quick-add token parsing (`tomorrow`, `fri`, `3d`, `p1`, `#project`) is **deterministic, no AI** — same reasoning as pacing: capture must be instant and repeatable.
- `lib/pacing.ts` — Project budget pacing: share of budget spent, burn per **working** day over a trailing 14-day window, working days left, projected total and overrun. **No AI** — pacing goes in front of a client, so it must be reproducible from the entries alone. One computation feeds `GET /api/projects/pacing`, the `budget_risk` nudge, and the digest.
- `lib/mailer.ts` — Shared `sendEmail` (React Email → MIME → the `EMAIL` binding). Used by both `auth.ts` and the digest cron. **Bodies are base64-encoded by hand**: left to itself mimetext (3.0.28) writes raw UTF-8 while declaring `Content-Transfer-Encoding: 7bit`, and the 8-bit bytes get mangled downstream (a `·` arrived as a replacement character, an en dash as a literal `\u2013`); asking it for `base64`/`quoted-printable` sets the header without transforming the body. This assumes mimetext passes `data` through untouched — re-check on any mimetext upgrade, since a version that honours `encoding` would double-encode.
- `lib/api-keys.ts` — Workspace API keys (`tt_live_…`) for MCP. SHA-256 only; the plaintext is shown once at creation and is unrecoverable. Membership is re-verified against `member` on every resolution — a key outlives the session that minted it.
- `lib/assistant.ts` — the Assistant: deterministic nudge computation (untracked/current/upcoming calendar meetings via the same Google read-through as `routes/calendar.ts`, long-running timer, empty weekday timesheet) plus the grounding-context builder for its chat. Nudge dismissals and seen-markers live client-side (`stores/assistantStore.ts`, persisted); the global UI (launcher in `TimerBar`, right-side sheet in `AppShell`, and `AssistantNudgeNotifier` — one-time toast + hidden-tab browser notification per new nudge, toggleable under Settings → Productivity) is `react-app/components/assistant/`. Global shortcut `⌘I`/`Ctrl+I` toggles the panel (input-focused, contextual suggestion chips). **Branding: the feature is called "Assistant" — never "Aski" (retired codename) or "AI Assistant".**

### MCP server (`src/worker/mcp/`)

`/mcp` is intercepted in `index.ts` **before** Hono (like `/agents/*`), authenticated by an API key rather than a session, and served by `agents/mcp`'s `createMcpHandler` — Streamable HTTP, stateless, no Durable Object. A fresh `McpServer` is built per request bound to the resolved workspace. Two invariants: **no tool takes a workspace id** (it's fixed at construction, so nothing a model invents reaches a tenant boundary), and **write tools are registered only for a `read_write` key** (a read key isn't shown them at all). Every tool wraps a helper the REST API already uses, so a chat answer and a Reports answer can't disagree.

The server advertises `title` "TimeTracker", `websiteUrl`, a description and `icons` (absolute URLs to the app's own public assets — the mark reads on light and dark, so no `theme` variants), plus `instructions` telling a model the things the tool schemas can't: pass `timezoneOffsetMinutes` or ranges silently mean UTC days, look up project ids rather than guessing, and a draft is a proposal rather than tracked time. `serverInfo.name` stays the lowercase `timetracker` — clients key their config off it, so it must not follow the display name. Every tool carries `readOnlyHint`/`destructiveHint`/`idempotentHint`/`openWorldHint` so clients can badge them and soften approval prompts for reads.

### Cron (`scheduled()` handler, `*/5 * * * *`)

Configured in `wrangler.jsonc` under `triggers.crons`. Three independent jobs run every 5 minutes:
- **Calendar auto-track** (`runAutoTrack`): for workspaces with a connected Google Calendar and auto-track enabled, materializes calendar events that have already ended into time entries. Idempotent via `time_entries.calendar_event_id`.
- **Recurring entries** (`runRecurring`): materializes each active `recurring_entries` template's occurrence once its scheduled UTC time has passed for the day. Idempotent via `recurring_entries.last_materialized` (UTC date). Schedules are stored in UTC weekday + minutes-of-day; the client converts to/from the browser's local timezone (`lib/recurrence.ts`).

- **Email digests** (`runDigests`): the opt-in morning briefing and Monday weekly summary. The cron has no request to read a timezone from, so it works off `user.digest_tz_offset` (reconciled client-side in `useHydrateSettings` when it drifts, so a DST change doesn't send an hour off for months). Exactly-once per day by comparing `digest_daily_sent`/`digest_weekly_sent` against the user's **local** date — the cron ticks twelve times inside the target hour.

All three jobs iterate their subjects independently and swallow per-subject errors, so one broken connection, template or address never blocks the rest of the sweep.

### Database

Cloudflare D1 (SQLite). Direct SQL — no ORM (Drizzle is only a peer dep for Better Auth's adapter). Add schema changes as new migration files in `migrations/`. Run `wrangler types` after modifying `wrangler.jsonc` bindings.

Multi-tenant: every row is scoped to a `workspace_id`. Better Auth tables use camelCase column names; all other tables use snake_case.

**Dev seed data is NOT a migration.** Sample data + the demo login (`blake.bauman@gmail.com` / `TestPassApps2026`) live in `seeds/dev-seed.sql`, applied to your **local** D1 only: `npx wrangler d1 execute time-tracker --local --file=seeds/dev-seed.sql`. It was moved out of `migrations/` (0005/0006 are now no-ops) so `wrangler d1 migrations apply --remote` can never seed a known-credential account into production. Never add seed/demo data as a tracked migration.

### Frontend (`src/react-app/`)

- `App.tsx` — React Router v7 routes; `AuthGuard` wraps protected pages
- `lib/api.ts` — Typed fetch client for all backend endpoints
- `lib/auth-client.ts` — Better Auth browser client
- `lib/idb.ts` — IndexedDB wrapper; caches timer state and queues mutations when offline
- `stores/timerStore.ts` / `stores/uiStore.ts` — Zustand stores for running timer and UI state. `uiStore` also persists calendar prefs (`weekStart`, `showWeekends`, `showGaps`), `autoAssignColors`, and the `productivity` block (idle-detection, not-tracking reminders, pomodoro — settings are client-only, no server sync; idle detection additionally defers to same-user activity heartbeats relayed cross-session via `TimerRoom` (`lib/activitySync.ts`) and never fires in a hidden tab).
- `components/tasks/` — the planning surface: `TaskBoardList` (Today / Upcoming / All), `TaskViewTabs` (the view switcher — a `tablist` with counts, **not** the shared `SegmentedControl`, which is a `radiogroup` and right only for a setting; counts are of top-level tasks so they match the rows below, and overdue tints Today's count rather than adding a second badge), `TaskRow` (priority-tinted checkbox, due chip, clamped notes line, **persistent** start control — a primary action must not be hover-revealed), `TaskDialog` (one form for create **and** edit, so a new field can't land creatable-but-not-editable), `QuickAddTask` (inline capture, not a dialog), `TaskRail` (the rail beside the Timer's calendar; registers rows with FullCalendar's `Draggable` so a task can be dropped onto a slot — the drop is handled in `CalendarBody`). `LogTaskTimeSheet` is mounted **once in `AppShell`** and driven by `uiStore.logTimeTaskId`, because the toast that opens it fires from three places.
- `components/drafts/` — the review flow: `DraftReviewDialog` (card stack, one proposal at a time, ending on the day's-total card) and `DraftDayButton` (Timer header). The button lives in its own module so the header's static import doesn't defeat the dialog's lazy chunk.
- `pages/TimerWorkspace.tsx` — the unified Timer tab hosting five interchangeable views (calendar / split / list / timesheet / planner) behind one shared header (`TimerWorkspaceHeader.tsx`); `/calendar` redirects here. The Planner view (`components/planner/`) is per-user planned hours per project/task per day with inline plan-vs-actual (`project_allocations` table, `routes/planner.ts`).
- `components/calendar/` — FullCalendar wrapper (`timeGrid` + `dayGrid` plugins: week/5-day/day/month). `lib/calendarMapping.ts` builds three event kinds on the same grid: real entries, unconfirmed Google "ghost" events, and clickable "untracked gap" blocks (`buildGapEvents`) between same-day completed entries.
- `hooks/useTimer.ts` — timer lifecycle (start/stop/discard/editElapsed/stopTimerAt). Stop is **optimistic**: `patchStopInCache` marks the entry completed in the TanStack Query cache before `clearTimer()` so day/Today totals don't visibly dip during the refetch round-trip.
- Server state via TanStack Query; local/offline state via Zustand + IndexedDB

### Design system

Tailwind v4 (OKLCH tokens in `index.css`) + shadcn/ui. Three conventions worth knowing before touching UI:

- **Icon buttons use the `Button` size tokens** (`icon-xs` = 24px, `icon-sm` = 32px, `icon-lg` = 40px), never `size="icon"` with an ad-hoc `h-N w-N` override — the two drift out of sync with labeled buttons of the equivalent `size="sm"`/`"lg"`. Prefer icon-only actions (with `aria-label` + `title`) over icon+label buttons in dense toolbars (Reports header, Timer header) to cut visual noise; keep the label when the button conveys current state (date range, rounding mode).
- **Layering is a named scale**, not raw numbers: `z-sticky` / `z-overlay` / `z-portal` / `z-tooltip` (DESIGN.md §7). A bare `z-50` fails lint.
- **Theme is "soft tones", not shadcn defaults.** Dark mode is a soft charcoal with a faint cool tint (not near-black), light mode a warm off-white (not pure white or AI-cream) — see `index.css` `:root`/`.dark`. The brand red (`--primary`) and the project/tag color palette (`lib/colorUtils.ts` `DISTINCT_COLORS`, mirrored server-side in `worker/lib/colors.ts`) are unchanged by this; only the neutral ground/surface/border ramp was softened.
- **Motion is one scale and one curve.** `duration-fast` / `-base` / `-slow` (150/200/300ms, tokens in `index.css`) chosen by how far a thing travels, always with `ease-out-quart`. A bare `transition-colors` silently falls back to Tailwind's default curve, which is not part of the system — pair every transition with a duration and the easing. `prefers-reduced-motion` is handled globally in `index.css`, but anything whose timing is coordinated in JS (a `setTimeout` waiting on an animation) must check the preference itself, since the CSS rule can't reach it. Two shared components exist so these don't get hand-rolled: **`Spinner`** (`ui/spinner.tsx`, sizes `sm`/`default`/`lg`) for "this action is working" — never a raw `<Loader2 className="animate-spin" />` — and `Skeleton` for "this surface hasn't loaded". "A timer is running" has exactly two forms, `animate-recording-pulse` (the Stop disc's ring) and `animate-running-dot` (dense surfaces); both loop at 1.6s. See DESIGN.md §6. **ESLint enforces the motion, focus-ring, font-size and z-index rules** (`no-restricted-syntax` in `packages/eslint-config/base.js`) — each had been swept clean by hand and grown back, because nothing failed when it did.

### Browser Extension (`extension/`)

Built separately with its own `vite.config.ts`. Auth uses the **standard better-auth client** (`extension/lib/auth-client.ts`, `makeAuthClient(baseURL)`) with the server's `bearer()` plugin: the popup calls `authClient.signIn.email` / `getSession` / `signOut`, the session token arrives in the `set-auth-token` response header, and the client persists it to `chrome.storage.local` so the background service worker can reuse it for badge polling. There is no refresh flow — on a 401 the service worker clears the token and the popup drops back to the login form. The extension is trusted server-side by its pinned origin: `chrome-extension://<id>` (ID pinned via the manifest `key`, see `extension/.keys/README.md`) is listed in `trustedOrigins` in `src/worker/auth.ts`; CSRF/origin checks stay on for the cookie-based web app. The API base URL is user-configurable but validated against an allow-list (`extension/lib/apiUrl.ts`: `timetracker.run`, `*.workers.dev`, `localhost`) so the token is never sent to an arbitrary origin.

Docs: `extension/README.md` (overview + local dev), `extension/PUBLISHING.md` (Chrome Web Store flow — note the extension ID/`trustedOrigins` reconciliation after first upload), `extension/PRIVACY.md` (privacy-policy draft), `extension/SECURITY_AUDIT.md` (security model). The signing key lives in `extension/.keys/` (private key gitignored). Package for the store with `pnpm zip:ext`.

### Real-time

Two WebSocket surfaces: `/api/ws` upgrades to `TimerRoom` (frontend connects on mount, listens for `timer_update` events to sync the running timer across tabs); `/agents/*` upgrades to the `ChatAgent` DO for the Assistant's streaming chat (Agents SDK).

## Docs

`docs/ARCHITECTURE.md` is the internal deep-dive (request lifecycle, auth model, DO/cron/data-model detail); `docs/USER_GUIDE.md` is the end-user feature guide — update both when shipping user-facing or architectural changes. `docs/CALENDAR_SYNC.md` covers Google Calendar setup + auto-track; `docs/MCP.md` covers the MCP connector (key creation, per-client setup incl. the Claude Desktop `mcp-remote` bridge, tool reference, troubleshooting); `ROADMAP.md` tracks deferred work (keep it honest — move items out when they ship).

## Design context

`PRODUCT.md` (register, users, purpose, brand personality, anti-references) and `DESIGN.md` (color/typography/component tokens, the "soft tones" theme, the icon-button convention) are the source of truth for any UI/UX work. Read them before touching styling — they carry decisions made across this project's design passes (e.g. the rejection of cream/AI-dashboard defaults, the one-accent-color rule) that aren't otherwise visible from the code alone.

## Cloudflare Workers Notes

Your knowledge of Cloudflare Workers APIs and limits may be outdated. Always retrieve current documentation before any Workers, D1, Durable Objects, or related task.

- Docs: https://developers.cloudflare.com/workers/
- Node.js compat flag is enabled (`nodejs_compat`) — most Node built-ins are available
- **Error 1102** (CPU/memory exceeded): check `/workers/platform/limits/`
- After changing bindings in `wrangler.jsonc`, run `pnpm cf-typegen` to update `worker-configuration.d.ts`
