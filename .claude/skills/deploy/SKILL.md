---
name: deploy
description: Ship main to production (timetracker.run) — preflight, D1 backup and remote migrations when needed, pnpm check, pnpm run deploy, and the smoke check. Use only when the user asks to deploy or approves a merge-and-deploy plan.
disable-model-invocation: true
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/preflight.sh) Bash(pnpm check) Bash(pnpm run deploy) Bash(pnpm backup:d1) Bash(curl -s *)
argument-hint: "[--skip-check]"
---

# Deploy

Arguments: `$ARGUMENTS`

```!
${CLAUDE_SKILL_DIR}/scripts/preflight.sh
```

Any `STOP` above is a blocker. Resolve it or ask. Never deploy from a feature branch.

## Sequence

1. **Pending remote migrations:** `cd apps/web && npx wrangler d1 migrations list time-tracker --remote`. If any are unapplied:
   1. `pnpm backup:d1` (a hook refuses a remote apply without a backup from the last 6 hours).
   2. Read each pending file. Flag anything destructive (`DROP`, a table rebuild, a `DELETE`) and get explicit confirmation for it.
   3. `cd apps/web && npx wrangler d1 migrations apply time-tracker --remote`.
   Migrations go first because the code being deployed reads them.
2. Unless `--skip-check`: `pnpm check`. Fix failures on a branch and PR, never directly on main.
3. `pnpm run deploy`. Never bare `pnpm deploy`, which is pnpm's built-in. Capture the version ID from the output.
4. Smoke:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://timetracker.run/   # 200
   curl -s https://timetracker.run/api/health                         # {"ok":true}
   ```
5. Report the commit, migrations applied, version ID and smoke results. If smoke fails: `cd apps/web && npx wrangler rollback` restores the previous version, but a migration doesn't roll back with it. Say which state D1 is in.

When the user has already approved a merge-and-deploy plan ("yes", "proceed"), run the whole sequence without re-asking at each step. Still stop on anything surprising: a red check, a destructive migration, a failed smoke.

## Also check

- A new DO class has a `migrations` tag in `apps/web/wrangler.jsonc`.
- A binding changed: `pnpm cf-typegen` was run and committed.
- A new secret: `cd apps/web && npx wrangler secret put <NAME>` before the deploy that reads it (a hook asks first).
