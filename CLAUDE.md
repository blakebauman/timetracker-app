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

## Architecture

Full-stack TypeScript time tracker (Toggl-like) running entirely on Cloudflare's edge platform.

### Layout

- `src/react-app/` — React 19 SPA (Vite, TailwindCSS v4, shadcn/ui)
- `src/worker/` — Hono backend on Cloudflare Workers
- `src/shared/schemas.ts` — Zod schemas shared by both sides
- `extension/` — Browser extension (separate Vite build)
- `migrations/` — Cloudflare D1 SQL migration files

### Backend (`src/worker/`)

- `index.ts` — Hono app entry; mounts all route groups and auth middleware
- `auth.ts` — Better Auth config (email/password + bearer tokens; DB hook auto-creates workspace on user signup)
- `middleware/workspace.ts` — Extracts workspace context from every authenticated request; all route handlers expect `c.get('workspace')`
- `routes/` — One file per resource (`time-entries`, `projects`, `clients`, `tasks`, `tags`, `reports`, `websocket`)
- `db/queries.ts` — Direct SQL helpers for D1; `ENTRY_SELECT` is the canonical JOIN for time entries; `broadcast()` sends WebSocket events via Durable Object
- `durable-objects/TimerRoomDO.ts` — Stateful WebSocket server; one DO per workspace, syncs timer state across browser tabs

### Database

Cloudflare D1 (SQLite). Direct SQL — no ORM (Drizzle is only a peer dep for Better Auth's adapter). Add schema changes as new migration files in `migrations/`. Run `wrangler types` after modifying `wrangler.jsonc` bindings.

Multi-tenant: every row is scoped to a `workspace_id`. Better Auth tables use camelCase column names; all other tables use snake_case.

### Frontend (`src/react-app/`)

- `App.tsx` — React Router v7 routes; `AuthGuard` wraps protected pages
- `lib/api.ts` — Typed fetch client for all backend endpoints
- `lib/auth-client.ts` — Better Auth browser client
- `lib/idb.ts` — IndexedDB wrapper; caches timer state and queues mutations when offline
- `stores/timerStore.ts` / `stores/uiStore.ts` — Zustand stores for running timer and UI state
- Server state via TanStack Query; local/offline state via Zustand + IndexedDB

### Browser Extension (`extension/`)

Built separately with its own `vite.config.ts`. Auth uses the **standard better-auth client** (`extension/lib/auth-client.ts`, `makeAuthClient(baseURL)`) with the server's `bearer()` plugin: the popup calls `authClient.signIn.email` / `getSession` / `signOut`, the session token arrives in the `set-auth-token` response header, and the client persists it to `chrome.storage.local` so the background service worker can reuse it for badge polling. There is no refresh flow — on a 401 the service worker clears the token and the popup drops back to the login form. The extension is trusted server-side by its pinned origin: `chrome-extension://<id>` (ID pinned via the manifest `key`, see `extension/.keys/README.md`) is listed in `trustedOrigins` in `src/worker/auth.ts`; CSRF/origin checks stay on for the cookie-based web app. The API base URL is user-configurable but validated against an allow-list (`extension/lib/apiUrl.ts`: `timetracker.run`, `*.workers.dev`, `localhost`) so the token is never sent to an arbitrary origin.

Docs: `extension/README.md` (overview + local dev), `extension/PUBLISHING.md` (Chrome Web Store flow — note the extension ID/`trustedOrigins` reconciliation after first upload), `extension/PRIVACY.md` (privacy-policy draft), `extension/SECURITY_AUDIT.md` (security model). The signing key lives in `extension/.keys/` (private key gitignored). Package for the store with `pnpm zip:ext`.

### Real-time

WebSocket endpoint at `/api/ws` upgrades to a Durable Object (`TimerRoomDO`). Frontend connects on mount and listens for `timer_update` events to sync the running timer across tabs.

## Cloudflare Workers Notes

Your knowledge of Cloudflare Workers APIs and limits may be outdated. Always retrieve current documentation before any Workers, D1, Durable Objects, or related task.

- Docs: https://developers.cloudflare.com/workers/
- Node.js compat flag is enabled (`nodejs_compat`) — most Node built-ins are available
- **Error 1102** (CPU/memory exceeded): check `/workers/platform/limits/`
- After changing bindings in `wrangler.jsonc`, run `pnpm cf-typegen` to update `worker-configuration.d.ts`
