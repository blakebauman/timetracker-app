---
name: check
description: Run the repo's validation gates in CI order — eslint, the apps/web typecheck + build + secrets tripwire + wrangler dry-run, and the first-load bundle budget — then fix root causes of whatever fails. Use before committing or opening a PR, after a dependency bump, or when asked to "check", "validate" or "make CI green". Pass --lint-only for just eslint, or --quick to skip the build.
allowed-tools: Bash(pnpm lint) Bash(pnpm typecheck) Bash(pnpm check) Bash(pnpm check:bundle) Bash(pnpm exec eslint *)
argument-hint: "[--lint-only | --quick]"
---

# Check

Arguments: `$ARGUMENTS`

Run the gates in this order and stop at the first that fails. Fix it, then re-run that gate before moving on.

1. `pnpm lint`: per-workspace eslint with the shared config. It includes the design-system guards (motion, focus ring, font size, z-index, `useTimerStore` selectors).
2. `--quick`: `pnpm typecheck` (all three workspaces), then stop.
   Otherwise `pnpm check`: in `apps/web`, `tsc -b` → `vite build` → the no-secrets-in-client tripwire → `wrangler deploy --dry-run`.
3. `pnpm check:bundle`: the gzipped first-load budget CI enforces. It reads the build from step 2.
4. `--lint-only`: step 1 only.

`pnpm check` typechecks only `apps/web`, so CI's `pnpm typecheck` also covers `apps/extension` and `packages/core`. When those changed, run `pnpm typecheck` too.

## Fixing

- Root causes only: no `// @ts-ignore`, no `as any`, no `eslint-disable` to quiet a guard. A design-system lint error means use the token the rule names. See CLAUDE.md "Design system".
- Type mismatches: `packages/core/src/schemas.ts` (`@timetracker/core/schemas`) is the source of truth.
- Build errors that only show in `vite build` usually mean a client import of a server-only value.
- Dry-run errors usually come from a binding: run `pnpm cf-typegen` after a `wrangler.jsonc` change.
- Bundle over budget: find what newly entered the entry chunk and load it on demand. Raising `BUDGET_KB` is the user's call.

Report each gate as pass or fail with the failing output verbatim, then what you changed.
