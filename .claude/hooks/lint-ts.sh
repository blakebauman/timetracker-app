#!/bin/bash
# Run ESLint (errors only) on edited TypeScript files for fast feedback
data=$(cat)
file=$(echo "$data" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('file_path',''))" 2>/dev/null)

if [[ "$file" =~ \.(ts|tsx)$ ]] && [[ "$file" != *"node_modules"* ]]; then
  result=$(cd /Users/blake/Sites/PlayGround/time-tracker-app && npx eslint --quiet "$file" 2>&1)
  if [ -n "$result" ]; then
    echo "[lint] $file"
    echo "$result" | head -25
  fi
fi
exit 0
