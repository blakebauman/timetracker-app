# Time Tracker

A Toggl-like time tracking app built on Cloudflare Workers, Hono, React 19, and Shadcn UI. Features real-time timer sync across browser tabs via Durable Objects WebSockets, a browser extension, and offline support via IndexedDB.

**Live:** https://timetracker.blakebauman.dev

## Stack

- **Frontend:** React 19, Vite, TailwindCSS v4, shadcn/ui, Zustand, TanStack Query
- **Backend:** Hono on Cloudflare Workers, Cloudflare D1 (SQLite), Durable Objects
- **Auth:** Better Auth (email/password + bearer token)
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
AUTH_SECRET=<random string>
```

## Build & Deploy

```bash
pnpm build           # TypeScript compile + Vite bundle
pnpm deploy          # Deploy to Cloudflare Workers
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

Load `dist/extension/` as an unpacked extension in Chrome. The extension authenticates via `/api/ext/sign-in` using bearer tokens (no cookies/CSRF).

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
