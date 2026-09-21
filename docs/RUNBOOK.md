# Runbook — backups, restore, and production checks

Operational procedures for the one production deployment (`timetracker.run`,
one Cloudflare Worker, one D1 database). `CLAUDE.md` has the deploy sequence;
this document is what to do when something has to be recovered or verified.

## The data

Everything lives in one D1 database, `time-tracker` (id `d11526a2-…`): time
entries, projects, clients, tasks, drafts, saved reports, the Better Auth
tables (users, sessions, passkeys, memberships), encrypted calendar tokens and
integration credentials, API-key hashes. The two Durable Objects hold nothing
that matters across a restore: `TimerRoom` is stateless and `ChatAgent` keeps
a capped chat history per workspace.

Encrypted columns (`integrations.credentials`) are AES-GCM under a key derived
from the `AUTH_SECRET` worker secret. **A backup is useless for those rows
without the same `AUTH_SECRET`** — the secret is not in the repo, the export,
or the dashboard's readable view; keep a copy of it in the password manager.

## Recovery objectives

| | Target | What provides it |
|---|---|---|
| RPO (data loss window) | ≤ 5 min for the last 30 days | D1 Time Travel (continuous, paid plan — **confirm the account is on Workers Paid; Free keeps 7 days**) |
| RPO beyond 30 days / off-platform | last `pnpm backup:d1` run | weekly export + one before every remote migration |
| RTO | 30 minutes | the drill below, rehearsed |

## Backups

```bash
pnpm backup:d1              # backups/time-tracker-<stamp>.sql.gz, keeps the newest 8
pnpm backup:d1 --keep 12    # keep more
```

The script (`scripts/backup-d1.mjs`) runs `wrangler d1 export --remote`,
gzips the dump, prints the sizes and the `time_entries` / `user` /
`workspaces` row counts (it exits non-zero if those are zero — an empty export
means the wrangler login is wrong), and prunes old files. `backups/` is
gitignored. The export is **plaintext**: keep it on an encrypted disk, never
in a synced folder.

When to run it:

- **Before every `wrangler d1 migrations apply … --remote`.** Migrations are
  irreversible in practice (SQLite has no `DROP CONSTRAINT`; table rebuilds
  are one-way).
- **Weekly**, by hand or a personal reminder. Deliberately not a GitHub
  Action: the repository is public and deploys are manual, so there is no
  Cloudflare API token in GitHub today — a scheduled workflow would need one,
  which is a new standing credential. If automation is wanted later, the
  in-platform shape is a weekly cron in a *separate* Worker that calls the D1
  export API with a token scoped to that one database and writes to R2; no
  third party holds the token.

## Restore

Two tools, used in this order.

### 1. Time Travel (the last 30 days, in place)

Find the bookmark for the moment before the damage:

```bash
cd apps/web
npx wrangler d1 time-travel info time-tracker --timestamp="2026-09-20T14:00:00Z"
```

Restoring in place overwrites the live database. **Export first** (`pnpm
backup:d1`) so the post-incident state is not lost, then:

```bash
npx wrangler d1 time-travel restore time-tracker --timestamp="2026-09-20T14:00:00Z"
```

Users lose whatever they entered after that timestamp; tell them.

### 2. From an export (older than 30 days, or the database itself is gone)

Restore into a **fresh** database first, verify, then cut over — never
`execute` a dump straight into the live one.

```bash
cd apps/web
gunzip -k ../../backups/time-tracker-<stamp>.sql.gz
npx wrangler d1 create time-tracker-restore
npx wrangler d1 execute time-tracker-restore --remote --file=../../backups/time-tracker-<stamp>.sql
npx wrangler d1 execute time-tracker-restore --remote --command "SELECT count(*) FROM time_entries"
```

Compare the count with the one the backup script printed. To cut over, point
`d1_databases[0].database_id` in `wrangler.jsonc` at the new database, run
`pnpm check`, deploy, and re-apply any migrations newer than the export
(`wrangler d1 migrations apply time-tracker-restore --remote` — the
`d1_migrations` table travels with the dump, so only newer files run).

## The drill (do this once, then yearly)

1. `pnpm backup:d1` — note the row counts.
2. Restore the export into a fresh **local** database and compare:
   ```bash
   cd apps/web
   gunzip -k ../../backups/time-tracker-<stamp>.sql.gz
   rm -rf .wrangler/state/v3/d1/restore-drill && mkdir -p .wrangler/state/v3/d1/restore-drill
   npx wrangler d1 execute time-tracker --local --persist-to .wrangler/state/v3/d1/restore-drill --file=../../backups/time-tracker-<stamp>.sql
   npx wrangler d1 execute time-tracker --local --persist-to .wrangler/state/v3/d1/restore-drill --command "SELECT count(*) FROM time_entries"
   ```
3. `npx wrangler d1 time-travel info time-tracker --timestamp=<an hour ago>`
   returns a bookmark (proves Time Travel is on for this database).
4. Write the date and the counts at the bottom of this file.

## Production checks

```bash
curl -s https://timetracker.run/api/health                       # {"ok":true}
curl -s -o /dev/null -w "%{http_code}\n" https://timetracker.run/ # 200
curl -sI https://timetracker.run/ | grep -i content-security-policy   # script-src 'self'
cd apps/web && npx wrangler tail                                   # live logs; a cron tick logs "cron: job failed" only on failure
```

Rate limiting (see `docs/ARCHITECTURE.md` → Rate limiting): five bogus OTP
checks in a minute must end in 429 —

```bash
for i in 1 2 3 4 5; do curl -s -o /dev/null -w "%{http_code} " -X POST \
  https://timetracker.run/api/auth/email-otp/check-verification-otp \
  -H 'content-type: application/json' -H 'origin: https://timetracker.run' \
  -d '{"email":"nobody@example.com","otp":"000000"}'; done; echo
```

WebSocket origin gate (only observable here — the dev proxy swallows upgrade
requests before the worker sees them): a foreign Origin must be refused on
both upgrade paths —

```bash
curl -s -o /dev/null -w "%{http_code}\n" -H 'Upgrade: websocket' -H 'Connection: Upgrade' \
  -H 'Origin: https://evil.example' https://timetracker.run/api/ws                      # 403
curl -s -o /dev/null -w "%{http_code}\n" -H 'Upgrade: websocket' -H 'Connection: Upgrade' \
  -H 'Origin: https://evil.example' https://timetracker.run/agents/chat-agent/assistant # 403
```

`/api/health` is the endpoint to point an uptime monitor at. A `500` from any
API route carries an `X-Request-Id` (Cloudflare's ray id); search Workers
Logs for it.

## Secrets inventory

`wrangler secret list` (from `apps/web`) should show exactly:
`AUTH_SECRET`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, plus
`MICROSOFT_CALENDAR_*` if Outlook sync is enabled. Rotating `AUTH_SECRET`
invalidates every stored calendar token and integration credential (they are
encrypted under it) — users reconnect; rotating `BETTER_AUTH_SECRET` signs
everyone out.

## Drill log

| Date | Export rows (entries / users) | Restore verified | Notes |
|---|---|---|---|
| — | — | — | not yet run |
