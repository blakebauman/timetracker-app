#!/bin/bash
# Remind to apply migration after writing a new .sql file in migrations/
data=$(cat)
file=$(echo "$data" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('file_path',''))" 2>/dev/null)

if [[ "$file" =~ migrations/.*\.sql$ ]]; then
  echo ""
  echo "[hook] Migration file written: $file"
  echo "Apply locally:  npx wrangler d1 migrations apply DB --local"
  echo "Apply to prod:  npx wrangler d1 migrations apply DB --remote"
fi
exit 0
