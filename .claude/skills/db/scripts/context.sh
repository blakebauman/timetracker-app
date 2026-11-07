#!/bin/bash
# Locate the local D1 SQLite file for this checkout and list its tables.
# Each worktree has its own apps/web/.wrangler/state — and so its own data.
root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"
db=$(ls "$root"/apps/web/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite 2>/dev/null | grep -v metadata | head -1)
if [ -z "$db" ]; then
  echo "NOT FOUND — start \`pnpm dev\` once in this checkout, then apply migrations:"
  echo "  cd apps/web && npx wrangler d1 migrations apply time-tracker --local"
  exit 0
fi
echo "DB=$db"
echo
echo "Tables:"
sqlite3 "$db" ".tables"
echo
echo "Applied migrations (newest 3):"
sqlite3 "$db" "SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 3" 2>/dev/null
echo "Newest migration file: $(ls "$root"/apps/web/migrations | sort | tail -1)"
