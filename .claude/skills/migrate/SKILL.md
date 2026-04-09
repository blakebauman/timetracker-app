---
name: migrate
description: Create the next D1 database migration file following project conventions, then output apply commands for local and remote.
allowed-tools: Glob Bash(ls migrations/) Write
argument-hint: "<description of schema change>"
---

Create a new Cloudflare D1 migration. Arguments: `$ARGUMENTS`

## Existing migrations

```!
ls /Users/blake/Sites/PlayGround/time-tracker-app/migrations/ 2>/dev/null | sort
```

## Steps

1. Find the next sequence number from the list above (e.g. if `0006_...` is last, use `0007`).
2. Create `migrations/<next_number>_<descriptive_snake_case_name>.sql`.
3. If no argument was given, ask the user what schema change they need before writing.

## Conventions

```!
cat /Users/blake/Sites/PlayGround/time-tracker-app/.claude/skills/migrate/scripts/conventions.sh | bash
```

- **snake_case** column names for all app tables (Better Auth tables use camelCase — don't touch those)
- Every app table must have `workspace_id TEXT NOT NULL REFERENCES workspaces(id)`
- Primary keys: `id TEXT PRIMARY KEY` (app layer generates nanoid)
- Timestamps: `created_at TEXT NOT NULL DEFAULT (datetime('now'))`, `updated_at TEXT NOT NULL DEFAULT (datetime('now'))`

## After writing the file

```bash
# Apply locally
npx wrangler d1 migrations apply DB --local

# Apply to production
npx wrangler d1 migrations apply DB --remote
```
