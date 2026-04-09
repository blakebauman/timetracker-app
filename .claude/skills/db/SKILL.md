---
name: db
description: Query the local Cloudflare D1 dev database (SQLite) to inspect data, debug issues, or verify schema state. Accepts an optional SQL query as argument.
allowed-tools: Bash(sqlite3 *) Bash(ls *)
argument-hint: "<SQL query or table name>"
---

Query the local Cloudflare D1 dev database. Query/target: `$ARGUMENTS`

## Dev database location

```!
ls /Users/blake/Sites/PlayGround/time-tracker-app/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite 2>/dev/null | grep -v metadata || echo "NOT FOUND — run 'pnpm dev' first to initialise the local DB"
```

## Schema snapshot

```!
DBFILE=$(ls /Users/blake/Sites/PlayGround/time-tracker-app/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite 2>/dev/null | grep -v metadata | head -1); [ -n "$DBFILE" ] && sqlite3 "$DBFILE" ".tables" || true
```

## Key tables

| Table | Notable columns |
|---|---|
| `user` | `id, name, email, createdAt` (camelCase — Better Auth) |
| `account` | `accountId, password` |
| `workspaces` | `id, name, userId` |
| `clients` | `id, name, workspace_id` |
| `projects` | `id, name, color, client_id, workspace_id` |
| `tasks` | `id, name, project_id, workspace_id, estimated_minutes` |
| `time_entries` | `id, description, start_time, end_time, duration, project_id, task_id, workspace_id` |
| `tags` | `id, name, workspace_id` |

## Instructions

- If an argument was provided, run that SQL query (or `SELECT * FROM <table> LIMIT 20` if it's just a table name).
- If no argument, ask the user what they want to inspect.
- All app tables are scoped by `workspace_id` — always include it in WHERE clauses unless doing a full dump.
- Use `sqlite3 "<path>" ".schema <table>"` to inspect column definitions.
