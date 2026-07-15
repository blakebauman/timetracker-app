# Time Tracker

A Toggl-like time tracking app built on Cloudflare Workers, Hono, React 19, and Shadcn UI. Runs entirely on Cloudflare's edge.

**Live:** https://timetracker.run

## Features

- **Time tracking** — one-click start/stop, projects, tasks, clients, tags, billable flags, and inline editing (including editing a running timer's elapsed time from the top bar).
- **Real-time sync** — the running timer syncs across browser tabs via a Durable Object WebSocket.
- **Offline support** — timer state is cached and mutations are queued in IndexedDB, then replayed when back online.
- **Calendar** — Toggl-style week/day calendar view (FullCalendar), plus optional **Google Calendar sync** (click a calendar event to confirm it into a tracked entry — see [docs/CALENDAR_SYNC.md](docs/CALENDAR_SYNC.md)).
- **Reports** — summaries and CSV export.
- **Browser extension** — MV3 Chrome extension for start/stop from the toolbar.

## Stack

- **Frontend:** React 19, Vite, TailwindCSS v4, shadcn/ui, Zustand, TanStack Query
- **Backend:** Hono on Cloudflare Workers, Cloudflare D1 (SQLite), Durable Objects
- **Auth:** Better Auth — email/password, two-factor (TOTP), and passkeys, plus bearer tokens for the extension
- **Extension:** MV3 Chrome extension with background service worker

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

# Production
npx wrangler d1 migrations apply time-tracker
```

After modifying bindings in `wrangler.jsonc`:

```bash
pnpm cf-typegen      # Regenerate worker-configuration.d.ts
```
