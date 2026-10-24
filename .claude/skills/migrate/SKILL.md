---
name: migrate
description: Create the next numbered Cloudflare D1 migration in apps/web/migrations following this repo's conventions (workspace scoping, snake_case, IF NOT EXISTS, a why-comment header), apply it locally, and spell out the remote sequence. Use when a change needs a new table, column or index. Never edits a migration that already shipped.
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/next.sh) Bash(cd apps/web && npx wrangler d1 migrations apply time-tracker --local) Write
argument-hint: "<description of the schema change>"
---

# New D1 migration

Change: `$ARGUMENTS` (if empty, ask what the schema change is before writing anything).

```!
${CLAUDE_SKILL_DIR}/scripts/next.sh
```

## Write `apps/web/migrations/<NEXT>_<snake_case_name>.sql`

- **Header comment first:** what the table or column is *for* and any non-obvious decision, like the style reference above. This is where the data model gets documented.
- `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`. Prefer additive changes. SQLite `ALTER TABLE … ADD COLUMN` can't add `NOT NULL` without a default.
- `id TEXT PRIMARY KEY`. The worker generates it with `crypto.randomUUID()`.
- Every app table has `workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE`. Per-user rows also have `user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE` (Better Auth's table is quoted `"user"`, with camelCase columns).
- Columns are snake_case. Timestamps use `TEXT NOT NULL DEFAULT (datetime('now'))`. Local days are `TEXT` `YYYY-MM-DD` and times of day are `INTEGER` minutes after local midnight, never UTC instants for something the user means locally.
- Add indexes for the query that will read the table, leading with `workspace_id`. Uniqueness that the app relies on for idempotency belongs in a `UNIQUE INDEX`.
- **Never** seed or demo data (that goes in `apps/web/seeds/dev-seed.sql`, local only). **Never** edit a migration already on `main` (a hook blocks it). Write a new one.

## Then

1. Apply locally: `cd apps/web && npx wrangler d1 migrations apply time-tracker --local`.
2. Update the code that reads it, and `packages/core/src/schemas.ts` if the API shape changes.
3. Tell the user the remote sequence, which runs **after the PR merges and before the deploy** of code that reads the new columns:
   ```bash
   pnpm backup:d1
   cd apps/web && npx wrangler d1 migrations apply time-tracker --remote
   ```
