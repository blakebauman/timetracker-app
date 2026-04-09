#!/bin/bash
# Print existing table patterns as a reference for new migrations
DBFILE=$(ls /Users/blake/Sites/PlayGround/time-tracker-app/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite 2>/dev/null | grep -v metadata | head -1)
if [ -n "$DBFILE" ]; then
  echo "Existing tables:"
  sqlite3 "$DBFILE" ".tables" 2>/dev/null
else
  echo "(dev DB not initialised yet — run pnpm dev first)"
fi
