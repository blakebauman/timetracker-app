---
name: deploy
description: Validate then deploy the time-tracker app to Cloudflare Workers production. Always runs pnpm check first and confirms before deploying.
allowed-tools: Bash(pnpm check) Bash(pnpm deploy) Bash(npx wrangler d1 migrations apply *)
argument-hint: "[--skip-check]"
---

Deploy the time-tracker app to production (`timetracker.run`). Arguments: `$ARGUMENTS`

## Pre-flight

Pending migrations (unapplied to remote):
```!
cd /Users/blake/Sites/PlayGround/time-tracker-app && ls migrations/ | sort
```

Git status:
```!
git -C /Users/blake/Sites/PlayGround/time-tracker-app log --oneline -5
```

## Steps

1. Unless `--skip-check` was passed, run `pnpm check` and fix any errors before continuing.
2. Tell the user exactly what will be deployed (latest commit, any pending migrations).
3. **Ask the user to confirm** before running `pnpm deploy`.
4. If confirmed, run:
   ```bash
   pnpm deploy
   ```
5. If there are unapplied migrations, remind the user to run:
   ```bash
   npx wrangler d1 migrations apply DB --remote
   ```
6. Report the deployed worker URL from wrangler output.

## Checklist before deploying

- [ ] `pnpm check` passes
- [ ] Any new D1 migrations noted (must be applied separately with `--remote`)
- [ ] Any new DO classes have a migration entry in `wrangler.jsonc`
- [ ] `pnpm cf-typegen` run if bindings changed
