# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev              # Start Vite + Cloudflare Worker dev server (http://localhost:5173) via @cloudflare/vite-plugin
pnpm build            # TypeScript compile + Vite bundle
pnpm build:ext        # Build browser extension to dist/extension/
pnpm zip:ext          # Build + package dist/timetracker-extension.zip for Chrome Web Store upload
pnpm ext:id           # Print the dev extension ID derived from extension/.keys/extension.pem
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
- `auth.ts` — Better Auth config: email/password + bearer tokens (extension), plus `admin` (site-wide role: list/ban/impersonate), `organization` (workspace = organization; owner/admin/member roles, email invites via the `EMAIL` send_email binding + `mimetext`), twoFactor (TOTP), passkey, magic link, email OTP, and Google social login. DB hook auto-creates a personal workspace on signup. `session.freshAge` is explicitly `0` — Better Auth's `list-sessions` endpoint 403s (`SESSION_NOT_FRESH`) once a session passes the default 1-day freshness window otherwise, which broke the Settings → Active Sessions card for every returning user; freshness is re-imposed on sensitive ops (`update-user`, `unlink-account`).
- `middleware/workspace.ts` — Extracts workspace context from every authenticated request; all route handlers expect `c.get('workspace')`
- `routes/` — One file per resource: `time-entries`, `projects` (includes `POST /recolor`, AI-assisted), `clients`, `tasks`, `tags` (includes color), `favorites`, `recurring`, `reports` (summary/grouped/weekly/detailed, rounding in SQL), `saved-reports`, `settings` (per-user prefs on the auth `user` row), `calendar` (Google sync + auto-track toggle + `POST /convert`), `ai` (`/quick-entry` NL parse, `/summary` draft; rate-limited), `assistant` (`GET /nudges` deterministic, `POST /track-event`, memory list/delete — chat is NOT here, see ChatAgent below), `integrations` (Workfront/Dynamics push, SSRF-guarded), `admin` (`DELETE /users/:id`), `websocket`
- `db/queries.ts` — Direct SQL helpers for D1; `ENTRY_SELECT` is the canonical JOIN for time entries; `broadcast()` sends WebSocket events via Durable Object; `upsertTags()` auto-assigns a deterministic color to new tags
- `durable-objects/TimerRoomDO.ts` — Stateful WebSocket server; one DO per workspace, syncs timer state across browser tabs
- `durable-objects/ChatAgent.ts` — the Assistant's chat: an `AIChatAgent` (Agents SDK + `@cloudflare/ai-chat`) DO, one per workspace, streaming `@cf/meta/llama-4-scout-17b-16e-instruct` over `workers-ai-provider` with tool calling (`lib/assistant-tools.ts` — start/stop/log/track/delete/summarize/remember; writes require human approval via AI SDK `needsApproval`). Persists capped history + resumable streams in DO SQLite; per-workspace rate limit; prompt treats calendar/entry/memory text as untrusted data. Frontend connects with `useAgent`/`useAgentChat` (`components/assistant/AssistantPanel.tsx`). Durable memory: `lib/assistant-memory.ts` + `assistant_memory` table (keyword recall, no embeddings).
- `lib/colors.ts` — Shared swatch palette. `DISTINCT_COLORS` is hue-alternated (not simply hue-ordered) so auto-assigned colors read as visually distinct even for 2-3 items; `TAG_COLORS` is the same set in hue order for the manual picker grid.
- `lib/ai.ts` — Workers AI calls (`@cf/meta/llama-3.1-8b-instruct-fp8`, `json_schema` response mode): quick-entry NL parsing, AI summary drafting, and `runProjectColorAssignment` (color-by-project-name, palette-validated, always falls back to the deterministic spread on a bad/missing AI response — AI assist is a best-effort enhancement, never the only path).
- `lib/calendar-autotrack.ts` / `lib/recurring.ts` — Cron-driven materializers (see below).
- `lib/assistant.ts` — the Assistant: deterministic nudge computation (untracked/current/upcoming calendar meetings via the same Google read-through as `routes/calendar.ts`, long-running timer, empty weekday timesheet) plus the grounding-context builder for its chat. Nudge dismissals and seen-markers live client-side (`stores/assistantStore.ts`, persisted); the global UI (launcher in `TimerBar`, right-side sheet in `AppShell`, and `AssistantNudgeNotifier` — one-time toast + hidden-tab browser notification per new nudge, toggleable under Settings → Productivity) is `react-app/components/assistant/`. Global shortcut `⌘I`/`Ctrl+I` toggles the panel (input-focused, contextual suggestion chips). **Branding: the feature is called "Assistant" — never "Aski" (retired codename) or "AI Assistant".**

### Cron (`scheduled()` handler, `*/5 * * * *`)

Configured in `wrangler.jsonc` under `triggers.crons`. Two independent jobs run every 5 minutes:
- **Calendar auto-track** (`runAutoTrack`): for workspaces with a connected Google Calendar and auto-track enabled, materializes calendar events that have already ended into time entries. Idempotent via `time_entries.calendar_event_id`.
- **Recurring entries** (`runRecurring`): materializes each active `recurring_entries` template's occurrence once its scheduled UTC time has passed for the day. Idempotent via `recurring_entries.last_materialized` (UTC date). Schedules are stored in UTC weekday + minutes-of-day; the client converts to/from the browser's local timezone (`lib/recurrence.ts`).

Both jobs iterate workspaces independently and swallow per-workspace errors, so one broken connection/template never blocks the rest of the sweep.

### Database

Cloudflare D1 (SQLite). Direct SQL — no ORM (Drizzle is only a peer dep for Better Auth's adapter). Add schema changes as new migration files in `migrations/`. Run `wrangler types` after modifying `wrangler.jsonc` bindings.

Multi-tenant: every row is scoped to a `workspace_id`. Better Auth tables use camelCase column names; all other tables use snake_case.

**Dev seed data is NOT a migration.** Sample data + the demo login (`blake.bauman@gmail.com` / `TestPassApps2026`) live in `seeds/dev-seed.sql`, applied to your **local** D1 only: `npx wrangler d1 execute time-tracker --local --file=seeds/dev-seed.sql`. It was moved out of `migrations/` (0005/0006 are now no-ops) so `wrangler d1 migrations apply --remote` can never seed a known-credential account into production. Never add seed/demo data as a tracked migration.

### Frontend (`src/react-app/`)

- `App.tsx` — React Router v7 routes; `AuthGuard` wraps protected pages
- `lib/api.ts` — Typed fetch client for all backend endpoints
- `lib/auth-client.ts` — Better Auth browser client
- `lib/idb.ts` — IndexedDB wrapper; caches timer state and queues mutations when offline
- `stores/timerStore.ts` / `stores/uiStore.ts` — Zustand stores for running timer and UI state. `uiStore` also persists calendar prefs (`weekStart`, `showWeekends`, `showGaps`), `autoAssignColors`, and the `productivity` block (idle-detection, not-tracking reminders, pomodoro — all client-only, no server sync).
- `pages/TimerWorkspace.tsx` — the unified Timer tab hosting four interchangeable views (calendar / split / list / timesheet) behind one shared header (`TimerWorkspaceHeader.tsx`); `/calendar` redirects here.
- `components/calendar/` — FullCalendar wrapper (`timeGrid` + `dayGrid` plugins: week/5-day/day/month). `lib/calendarMapping.ts` builds three event kinds on the same grid: real entries, unconfirmed Google "ghost" events, and clickable "untracked gap" blocks (`buildGapEvents`) between same-day completed entries.
- `hooks/useTimer.ts` — timer lifecycle (start/stop/discard/editElapsed/stopTimerAt). Stop is **optimistic**: `patchStopInCache` marks the entry completed in the TanStack Query cache before `clearTimer()` so day/Today totals don't visibly dip during the refetch round-trip.
- Server state via TanStack Query; local/offline state via Zustand + IndexedDB

### Design system

Tailwind v4 (OKLCH tokens in `index.css`) + shadcn/ui. Two conventions worth knowing before touching UI:

- **Icon buttons use the `Button` size tokens** (`icon-xs` = 24px, `icon-sm` = 32px, `icon-lg` = 40px), never `size="icon"` with an ad-hoc `h-N w-N` override — the two drift out of sync with labeled buttons of the equivalent `size="sm"`/`"lg"`. Prefer icon-only actions (with `aria-label` + `title`) over icon+label buttons in dense toolbars (Reports header, Timer header) to cut visual noise; keep the label when the button conveys current state (date range, rounding mode).
- **Theme is "soft tones", not shadcn defaults.** Dark mode is a soft charcoal with a faint cool tint (not near-black), light mode a warm off-white (not pure white or AI-cream) — see `index.css` `:root`/`.dark`. The brand red (`--primary`) and the project/tag color palette (`lib/colorUtils.ts` `DISTINCT_COLORS`, mirrored server-side in `worker/lib/colors.ts`) are unchanged by this; only the neutral ground/surface/border ramp was softened.

### Browser Extension (`extension/`)

Built separately with its own `vite.config.ts`. Auth uses the **standard better-auth client** (`extension/lib/auth-client.ts`, `makeAuthClient(baseURL)`) with the server's `bearer()` plugin: the popup calls `authClient.signIn.email` / `getSession` / `signOut`, the session token arrives in the `set-auth-token` response header, and the client persists it to `chrome.storage.local` so the background service worker can reuse it for badge polling. There is no refresh flow — on a 401 the service worker clears the token and the popup drops back to the login form. The extension is trusted server-side by its pinned origin: `chrome-extension://<id>` (ID pinned via the manifest `key`, see `extension/.keys/README.md`) is listed in `trustedOrigins` in `src/worker/auth.ts`; CSRF/origin checks stay on for the cookie-based web app. The API base URL is user-configurable but validated against an allow-list (`extension/lib/apiUrl.ts`: `timetracker.run`, `*.workers.dev`, `localhost`) so the token is never sent to an arbitrary origin.

Docs: `extension/README.md` (overview + local dev), `extension/PUBLISHING.md` (Chrome Web Store flow — note the extension ID/`trustedOrigins` reconciliation after first upload), `extension/PRIVACY.md` (privacy-policy draft), `extension/SECURITY_AUDIT.md` (security model). The signing key lives in `extension/.keys/` (private key gitignored). Package for the store with `pnpm zip:ext`.

### Real-time

Two WebSocket surfaces: `/api/ws` upgrades to `TimerRoomDO` (frontend connects on mount, listens for `timer_update` events to sync the running timer across tabs); `/agents/*` upgrades to the `ChatAgent` DO for the Assistant's streaming chat (Agents SDK).

## Docs

`docs/ARCHITECTURE.md` is the internal deep-dive (request lifecycle, auth model, DO/cron/data-model detail); `docs/USER_GUIDE.md` is the end-user feature guide — update both when shipping user-facing or architectural changes. `docs/CALENDAR_SYNC.md` covers Google Calendar setup + auto-track; `ROADMAP.md` tracks deferred work (keep it honest — move items out when they ship).

## Design context

`PRODUCT.md` (register, users, purpose, brand personality, anti-references) and `DESIGN.md` (color/typography/component tokens, the "soft tones" theme, the icon-button convention) are the source of truth for any UI/UX work. Read them before touching styling — they carry decisions made across this project's design passes (e.g. the rejection of cream/AI-dashboard defaults, the one-accent-color rule) that aren't otherwise visible from the code alone.

## Cloudflare Workers Notes

Your knowledge of Cloudflare Workers APIs and limits may be outdated. Always retrieve current documentation before any Workers, D1, Durable Objects, or related task.

- Docs: https://developers.cloudflare.com/workers/
- Node.js compat flag is enabled (`nodejs_compat`) — most Node built-ins are available
- **Error 1102** (CPU/memory exceeded): check `/workers/platform/limits/`
- After changing bindings in `wrangler.jsonc`, run `pnpm cf-typegen` to update `worker-configuration.d.ts`
