---
name: prod-check
description: Read-only production health check for timetracker.run — smoke endpoints, recent deployments, unapplied remote D1 migrations, then logs and D1 query cost when something looks off. Use after a deploy, when the user reports production errors or slowness, or asks "is prod ok". Never writes to production.
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/health.sh)
argument-hint: "[symptom to investigate]"
---

# Production check

Symptom (optional): `$ARGUMENTS`

Run `${CLAUDE_SKILL_DIR}/scripts/health.sh`. It makes network calls and needs a wrangler login. If wrangler reports an auth error, ask the user to run `! cd apps/web && npx wrangler login`.

Healthy looks like: `/` is `200`, `/api/health` is `{"ok":true}`, the newest deployment matches the expected commit, and no migrations are unapplied.

## When something's off (all read-only, from `apps/web`)

- **Errors:** `npx wrangler tail --format pretty --status error`, while reproducing. Right after a deploy, ~4 "Durable Object reset because its code was updated" plus `websocket:close` are the expected TimerRoom reconnect.
- **Slow or expensive D1:** `npx wrangler d1 insights time-tracker --sort-by reads --timePeriod 1d --json`. Rank by rows read per run, because prod is small and totals mislead.
- **Request volume:** steady state is roughly ≤ 300 req/hour. Thousands mean a runaway poller (the extension once polled at 1/s). Use the Cloudflare analytics GraphQL API or the Workers Observability tools, grouping by `$metadata.origin`. Cron invocations have origin `cron`, not `scheduled`.
- **A pending migration** with code already deployed means the code is reading columns that don't exist yet. Hand the backup → apply sequence to the `deploy` skill. Don't apply it from here.

Report the status line per check, then evidence and a likely cause for anything abnormal. Any fix goes through a PR plus `deploy`.
