# Cloudflare Workers

STOP. Your knowledge of Cloudflare Workers APIs and limits may be outdated. Always retrieve current documentation before any Workers, KV, R2, D1, Durable Objects, Queues, Vectorize, AI, or Agents SDK task.

## Docs

- https://developers.cloudflare.com/workers/
- MCP: `https://docs.mcp.cloudflare.com/mcp`

For all limits and quotas, retrieve from the product's `/platform/limits/` page. eg. `/workers/platform/limits`

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Local development via turbo (Vite + Worker in `apps/web` via `@cloudflare/vite-plugin`, http://localhost:5173) |
| `pnpm dev:web` | The same dev server without turbo (`pnpm --filter @timetracker/web dev`) |
| `pnpm build` | `turbo run build` — Vite bundles for `apps/web` and `apps/extension` (no typecheck) |
| `pnpm typecheck` | `turbo run typecheck` — `tsc -b` in `apps/web`, `tsc --noEmit` in `apps/extension` + `packages/core` |
| `pnpm lint` | `turbo run lint` — per-workspace `eslint .` with `@timetracker/eslint-config` |
| `pnpm check` | `apps/web`: `tsc -b && vite build && wrangler deploy --dry-run` |
| `pnpm test:e2e` | Playwright suite in `apps/web` (spins up `pnpm dev`) |
| `pnpm run deploy` | `turbo run deploy` — build, then `wrangler deploy` from `apps/web` (use `run` — bare `pnpm deploy` hits pnpm's built-in) |
| `pnpm cf-typegen` | Generate `apps/web/worker-configuration.d.ts` from `apps/web/wrangler.jsonc` bindings |
| `cd apps/web && npx wrangler tail` | Stream live worker logs (wrangler runs where `wrangler.jsonc` lives) |

Run `pnpm cf-typegen` after changing bindings in `apps/web/wrangler.jsonc`.

## Node.js Compatibility

https://developers.cloudflare.com/workers/runtime-apis/nodejs/

## Errors

- **Error 1102** (CPU/Memory exceeded): Retrieve limits from `/workers/platform/limits/`
- **All errors**: https://developers.cloudflare.com/workers/observability/errors/

## Product Docs

Retrieve API references and limits from:
`/kv/` · `/r2/` · `/d1/` · `/durable-objects/` · `/queues/` · `/vectorize/` · `/workers-ai/` · `/agents/`

## Project shape

pnpm workspaces + Turborepo. pnpm 10.33 (pinned via `packageManager`), Node >= 22. Every workspace dependency is `catalog:` (versions in `pnpm-workspace.yaml`) or `workspace:*`. Turbo tasks: `build`, `typecheck`, `lint`, `dev`, `deploy` (`turbo.json`).

- `apps/web` — `@timetracker/web`: the SPA (`src/react-app`) + Hono Worker (`src/worker`) deployed as one Worker with static assets; owns `wrangler.jsonc`, `migrations/`, `seeds/`, `e2e/`, `.dev.vars`.
- `apps/extension` — `@timetracker/extension`: MV3 Chrome extension, separate Vite build to `apps/extension/dist`.
- `packages/core` — `@timetracker/core`: Zod schemas, task recurrence, brand mark; TypeScript source via an exports map, no build step (`@timetracker/core/schemas`).
- `packages/tsconfig` — `@timetracker/tsconfig`: base / dom / worker / library presets (no root tsconfig).
- `packages/eslint-config` — `@timetracker/eslint-config`: shared flat config incl. the design-system guards.

Generated, never hand-edited: `apps/web/worker-configuration.d.ts` (`pnpm cf-typegen`), `apps/web/public` icons + `apps/extension/icons` (`pnpm generate-icons`), `pnpm-lock.yaml`.

Git hooks via lefthook: pre-commit `eslint --fix` on staged TS, commit-msg commitlint (conventional; `design`/`polish` allowed), pre-push `pnpm lint` + `pnpm typecheck`.

`CLAUDE.md` carries the full guidance; keep the two in step.
