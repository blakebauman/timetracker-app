#!/bin/bash
# Local-only deploy preflight: branch, sync with origin, cleanliness, what's
# about to ship, and the migrations a deploy of this commit would expect.
root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"
cd "$root" || exit 0
git fetch -q origin main 2>/dev/null || echo "WARN: git fetch failed — origin state below may be stale"
branch=$(git branch --show-current)
echo "Branch: $branch"
[ "$branch" != main ] && echo "STOP: deploys go out from main after the PR merges (git switch main && git pull --ff-only)."
read -r behind ahead < <(git rev-list --left-right --count origin/main...HEAD)
echo "vs origin/main: $ahead ahead, $behind behind"
[ "$ahead" != 0 ] && echo "STOP: local commits not on origin/main would ship unreviewed."
[ "$behind" != 0 ] && echo "STOP: behind origin/main — git pull --ff-only first."
dirty=$(git status --porcelain | grep -v '^??' | wc -l | tr -d ' ')
[ "$dirty" != 0 ] && echo "STOP: $dirty modified tracked file(s) — the build would include uncommitted changes."
echo
echo "Shipping:"
git log --oneline -5
echo
echo "Newest migration files:"
ls apps/web/migrations | sort | tail -3 | sed 's/^/  /'
newest=$(ls -t backups/time-tracker-*.sql.gz 2>/dev/null | head -1)
echo "Newest backup: ${newest:-none}"
