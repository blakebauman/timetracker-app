---
name: migrate
description: Create a new D1 database migration file with the correct sequence number, then provide the commands to apply it locally and in production.
---

Create a new Cloudflare D1 migration for this project.

Steps:
1. List `migrations/` to find the highest existing sequence number (format: `XXXX_name.sql`).
2. Create `migrations/<next_number>_<descriptive_snake_case_name>.sql` with the schema change.
3. Follow these conventions:
   - All app tables: snake_case columns, always include `workspace_id TEXT NOT NULL`
   - Primary keys: `id TEXT PRIMARY KEY` (use nanoid/cuid at the app layer)
   - Timestamps: `created_at TEXT NOT NULL DEFAULT (datetime('now'))`, `updated_at TEXT NOT NULL DEFAULT (datetime('now'))`
   - Soft deletes where appropriate: `deleted_at TEXT`
   - FK references to `workspace_id` for multi-tenancy isolation
4. After writing the file, output:

```bash
# Apply locally (dev)
npx wrangler d1 migrations apply DB --local

# Apply to production
npx wrangler d1 migrations apply DB --remote
```

If the user hasn't described the schema change yet, ask what table/columns they need before writing the file.
