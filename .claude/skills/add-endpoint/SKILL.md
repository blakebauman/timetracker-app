---
name: add-endpoint
description: Add a new REST resource or endpoint end to end the way this repo does it — Zod schema in packages/core, a Hono router under apps/web/src/worker/routes mounted in index.ts, workspace scoping, rate limiting where it calls AI/email/outbound, cross-tab broadcast, the typed client in lib/api.ts, a TanStack Query hook with invalidation, an e2e spec including tenant isolation, and docs. Use when building a new API route or resource.
argument-hint: "<resource and what it does>"
---

# Add an endpoint

Resource: `$ARGUMENTS`

Work through these steps in order. [references/templates.md](references/templates.md) has the code shapes, taken from `routes/days-off.ts` and `hooks/useDaysOff.ts`. Read one real router before writing yours, because the templates are a reminder and the code is the authority.

1. **Name it.** Plain nouns, kebab-case path, mounted at `/api/<resource>`. **Never a trailing "z"** (`/health`, not `/healthz`). Don't rename an existing path for consistency: `/api/time_entries` keeps its underscore because clients depend on it.
2. **Schema.** Add request and response Zod schemas plus `z.input` types to `packages/core/src/schemas.ts`, so worker and client share one definition. Local dates use `LocalDateSchema`. Bound every string and array.
3. **Storage.** If it needs a table or column, run the `migrate` skill first.
4. **Router:** `apps/web/src/worker/routes/<resource>.ts`.
   - Typed `Hono<{ Bindings: Env; Variables: { workspaceId: string; userId: string } }>`, validated with `zValidator` from `../lib/validate` (not `@hono/zod-validator` directly).
   - Every statement filters on `c.get("workspaceId")`, and per-user data also on `c.get("userId")`. Any id taken from the body (project, task, tag) must be checked as belonging to the same workspace before it's written.
   - Rules that REST, MCP and the Assistant share live in `src/worker/lib/<resource>.ts`. The route stays transport only.
   - After a write, call `ctx.waitUntil(broadcast(env, workspaceId, "<resource>:changed", null, clientId(c)))` so other tabs refetch.
   - If it calls Workers AI, sends email or does outbound HTTP, mount a `rateLimit(...)` from `middleware/rate-limit.ts` on it in `index.ts`. Outbound URLs go through `integrations/url-guard.ts`.
5. **Mount** it in `apps/web/src/worker/index.ts` next to the other `.route("/api/…")` calls, so it sits behind the workspace middleware.
6. **Client.** Add a typed namespace to `apps/web/src/react-app/lib/api.ts`. Add `hooks/use<Resource>.ts` with one shared query key, plus mutations that invalidate every derived query family (see `invalidateDerived` in `useDaysOff.ts`) and handle `isQueuedOffline`. If other tabs should update, listen for the broadcast in `hooks/useWebSocket.ts`.
7. **MCP / Assistant** (only if asked): wrap the same `lib/` helper. MCP tools take no workspace id and register writes only for `read_write` keys. Assistant tools take no Python-keyword parameter names and need a `ToolCard` entry.
8. **Spec.** Delegate to the **e2e-engineer** agent: one spec for the happy path through the UI or API, plus a tenant-isolation case where a second `signUp` gets a 404 or an empty list for the first workspace's ids.
9. **Docs.** Add the route to `docs/ARCHITECTURE.md` and the CLAUDE.md "Backend → routes" list, `docs/USER_GUIDE.md` if it's user-visible, and `docs/MCP.md` if it's exposed there. The `docs-sync` skill can do this.
10. Run the `check` skill.
