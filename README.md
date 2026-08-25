# Time Tracker

A Toggl-like time tracking app built on Cloudflare Workers, Hono, React 19, and Shadcn UI. Runs entirely on Cloudflare's edge.

**Live:** https://timetracker.run

## Features

- **Time tracking** — one-click start/stop, projects, tasks, clients, tags, billable flags, and inline editing (including editing a running timer's elapsed time from the top bar). Manual entry, a weekly timesheet grid, AI quick-add from natural language, favorites for one-click starts, and recurring entry templates that materialize on schedule.
- **Timer workspace** — five views behind one header: list, Toggl-style calendar (FullCalendar week/5-day/day/month), split, timesheet, and planner — with clickable untracked-gap blocks between entries.
- **Google Calendar sync** — read-only: events show as ghost blocks you click to track, and an optional **auto-track** cron converts ended meetings into entries automatically ([docs/CALENDAR_SYNC.md](docs/CALENDAR_SYNC.md)).
- **Draft your day** — proposes the entries you're missing from calendar events that ended untracked, uncovered stretches in the day, and work you log on that weekday most weeks; you confirm them one card at a time, ending on a total that rescales the batch. Proposals are never counted as tracked time until confirmed.
- **Budget pacing** — share of budget spent, burn rate per working day, and whether the current rate overruns before the end date ("on pace to overrun by 14h · 12 working days left"). No AI — reproducible from the entries alone.
- **Email digests** — an opt-in morning briefing and Monday weekly summary: hours by project, budgets worth a look, anything awaiting review, and one AI-written paragraph.
- **MCP connector** — connect Claude, ChatGPT or any MCP client and ask about your time in plain language, or let it start timers and log entries ([docs/MCP.md](docs/MCP.md)).
- **The Assistant** — deterministic nudges (untracked/current/upcoming meetings, long-running timer, empty day) plus a tool-calling chat agent (Agents SDK Durable Object over Workers AI) that can start/stop timers, log or delete entries, summarize time, and remember preferences — with human approval on every write.
- **Reports** — summary/weekly/detailed with grouping, rounding modes, project billing rates + currency, saved report configs, CSV/Excel/print export, and AI-drafted narrative summaries.
- **Teams** — invite members by email into a shared workspace (owner/admin/member roles); site-admin panel for user management.
- **Real-time sync** — the running timer syncs across browser tabs (and the extension) via a Durable Object WebSocket.
- **Offline support** — timer state is cached and mutations are queued in IndexedDB, then replayed when back online.
- **Productivity tools** — idle detection, not-tracking reminders, pomodoro, browser notifications (all opt-in, device-local).
- **Integrations** — push entries to Adobe Workfront or Microsoft Dynamics.
- **Browser extension** — MV3 Chrome extension: toolbar start/stop, live badge, issue/PR title pre-fill on GitHub/Jira/Linear.

See [docs/USER_GUIDE.md](docs/USER_GUIDE.md) for the full feature guide.

## Stack

- **Frontend:** React 19, Vite, TailwindCSS v4, shadcn/ui, Zustand, TanStack Query
- **Backend:** Hono on Cloudflare Workers, Cloudflare D1 (SQLite), Durable Objects, Workers AI, Agents SDK, Email Service, cron triggers
- **Auth:** Better Auth — email/password, Google, magic link, email OTP, two-factor (TOTP), passkeys; organizations for team workspaces; bearer tokens for the extension
- **Extension:** MV3 Chrome extension with background service worker

## Documentation

| Doc | What it covers |
|---|---|
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | Every feature, by task — for users |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Internal deep-dive: routing, auth, DOs, cron, data model |
| [docs/CALENDAR_SYNC.md](docs/CALENDAR_SYNC.md) | Google Calendar setup, sync design, auto-track |
| [docs/MCP.md](docs/MCP.md) | MCP connector: API keys, per-client setup, tool reference, troubleshooting |
| [CLAUDE.md](CLAUDE.md) | Commands, conventions, deploy sequence |
| [PRODUCT.md](PRODUCT.md) / [DESIGN.md](DESIGN.md) | Product register + design system (source of truth for UI) |
| [ROADMAP.md](ROADMAP.md) | Deferred / planned work |
| [extension/README.md](extension/README.md) | Extension architecture, publishing, security audit |

## Development

Install dependencies:

```bash
pnpm install
```

Start the dev server (runs Vite + Cloudflare Worker together via `@cloudflare/vite-plugin`):

```bash
pnpm dev
```

App available at http://localhost:5173.

Secrets are loaded from `.dev.vars` (copy from `.dev.vars.example` if present):

```
AUTH_SECRET=<random string>   # also used to encrypt stored integration tokens
```

Optional Google Calendar sync needs `GOOGLE_CALENDAR_CLIENT_ID` / `GOOGLE_CALENDAR_CLIENT_SECRET` — see [docs/CALENDAR_SYNC.md](docs/CALENDAR_SYNC.md). The app runs fine without them; the feature just stays disabled.

Run the Playwright e2e suite (spins up `pnpm dev` against localhost:5173):

```bash
pnpm test:e2e
pnpm lint
```

## Build & Deploy

```bash
pnpm build           # TypeScript compile + Vite bundle
pnpm run deploy      # Deploy to Cloudflare Workers (use `run` — bare `pnpm deploy` hits pnpm's built-in)
pnpm check           # Typecheck + build + dry-run deploy (full validation)
```

Monitor live logs:

```bash
npx wrangler tail
```

## Browser Extension

```bash
pnpm build:ext       # Outputs to dist/extension/
```

Load `dist/extension/` as an unpacked extension in Chrome. The extension authenticates with the standard Better Auth client and the server's `bearer()` plugin: the popup calls `signIn.email` / `getSession`, the session token arrives in the `set-auth-token` response header, and it's persisted to `chrome.storage.local` for the background service worker (no cookies/CSRF). See [extension/README.md](extension/README.md).

## Database

Cloudflare D1 (SQLite). Migrations are in `migrations/`. Run after schema changes:

```bash
# Local
npx wrangler d1 migrations apply time-tracker --local

# Production (apply BEFORE deploying worker code that needs the new schema)
npx wrangler d1 migrations apply time-tracker --remote
```

Optional local sample data + demo login (never a migration — local only):

```bash
npx wrangler d1 execute time-tracker --local --file=seeds/dev-seed.sql
```

After modifying bindings in `wrangler.jsonc`:

```bash
pnpm cf-typegen      # Regenerate worker-configuration.d.ts
```
