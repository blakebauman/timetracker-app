#!/bin/bash
# Read-only production health: the smoke endpoints, the live deployments, and
# whether remote D1 is missing any migration in this checkout.
root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"
cd "$root/apps/web" || exit 0
echo "GET /            → $(curl -s -o /dev/null -w '%{http_code} in %{time_total}s' https://timetracker.run/)"
echo "GET /api/health  → $(curl -s -m 10 https://timetracker.run/api/health)"
echo
echo "Recent deployments:"
npx --no-install wrangler deployments list 2>&1 | tail -n 12
echo
echo "Remote D1 migrations not yet applied:"
npx --no-install wrangler d1 migrations list time-tracker --remote 2>&1 | tail -n 8
