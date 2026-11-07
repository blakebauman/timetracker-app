---
name: db
description: Query the LOCAL D1 dev database (SQLite) for this checkout to inspect data, debug a query, or confirm schema and migration state. Accepts a SQL query or a table name. Use for "what's in the local db", "show me the tasks table", "is migration N applied locally". Never touches production — for that, see the prod-check skill.
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/context.sh) Bash(sqlite3 *)
argument-hint: "<SQL query | table name>"
---

# Local D1

Target: `$ARGUMENTS`

```!
${CLAUDE_SKILL_DIR}/scripts/context.sh
```

- A table name means run `sqlite3 "$DB" ".schema <table>"`, then `SELECT * FROM <table> LIMIT 20`.
- A query: run it as given with `sqlite3 -header -column "$DB" "<query>"`. Run read queries freely. **Ask before any write** (`INSERT`/`UPDATE`/`DELETE`/DDL), since the local DB holds the dev logins.
- No argument: ask what to inspect.
- App tables are snake_case and scoped by `workspace_id`, so filter on it unless you're doing a deliberate full dump. Better Auth tables (`user`, `session`, `account`, `member`, `organization`, …) are camelCase. The workspace row is in `workspaces`.
- If the newest migration file isn't in the applied list, apply it with `cd apps/web && npx wrangler d1 migrations apply time-tracker --local`.
- Dev seed data lives in `apps/web/seeds/dev-seed.sql`, applied `--local` only.
