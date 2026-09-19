---
name: check
description: Run the full validation suite (TypeScript typecheck + Vite build + wrangler dry-run) and fix any errors found.
allowed-tools: Bash(pnpm check) Bash(pnpm lint)
argument-hint: "[--lint-only]"
---

Run the full project validation suite:

```bash
pnpm check
```

This runs `tsc -b` → `vite build` → `wrangler deploy --dry-run` in sequence, inside `apps/web` (the root script delegates via `pnpm --filter @timetracker/web check`).

Current TypeScript issues (if any):
```!
cd /Users/blake/Projects/timetracker-app && pnpm typecheck 2>&1 | grep -E "error TS|✖" | head -40 || true
```

## Rules
- Fix root-cause errors — never use `// @ts-ignore` or unsafe type casts.
- For type mismatches: check `packages/core/src/schemas.ts` (`@timetracker/core/schemas`) first — Zod schemas are the source of truth.
- For build errors: read the Vite/Rollup output to find the specific failing module.
- For wrangler dry-run errors: usually a binding issue — run `pnpm cf-typegen` if bindings in `apps/web/wrangler.jsonc` changed.
- If `--lint-only` argument is passed, run `pnpm lint` instead of the full suite.
