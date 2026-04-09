---
name: db
description: Query the local Cloudflare D1 dev database (SQLite) to inspect data, debug issues, or verify schema. Use this when you need to look at actual data in the local dev environment.
---

Query the local Cloudflare D1 dev database.

The database is a SQLite file managed by Miniflare at:
```
.wrangler/state/v3/d1/miniflare-D1DatabaseObject/
```

Steps:
1. Find the correct `.sqlite` file (exclude `metadata.sqlite`):
   ```bash
   ls .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite | grep -v metadata
   ```
2. Run the requested query with `sqlite3`:
   ```bash
   sqlite3 "<path>" "<SQL query>"
   ```

Key tables:
- `user` (camelCase cols — Better Auth) — `id, name, email, createdAt`
- `account` (camelCase cols) — `accountId, password`
- `workspaces` — `id, name, userId`
- `clients` — `id, name, workspace_id`
- `projects` — `id, name, color, client_id, workspace_id`
- `tasks` — `id, name, project_id, workspace_id, estimated_minutes`
- `time_entries` — `id, description, start_time, end_time, duration, project_id, task_id, workspace_id`
- `tags` — `id, name, workspace_id`

All app tables are scoped by `workspace_id`.

If the dev server hasn't been run yet, the `.sqlite` file may not exist — remind the user to run `pnpm dev` first.
