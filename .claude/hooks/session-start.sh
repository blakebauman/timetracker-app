#!/bin/bash
# SessionStart: where am I, and what's unfinished. Plain stdout is added to
# Claude's context for this event. Local git only — no network, so it is fast
# and works offline. On `compact` it also restates the rules that most often
# get lost in a summary.
set -u
source=$(jq -r '.source // "startup"')
dir="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$dir" 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

branch=$(git branch --show-current)
dirty=$(git status --porcelain | wc -l | tr -d ' ')
echo "## Repo state (session $source)"
if git rev-parse -q --verify origin/main >/dev/null; then
  read -r behind ahead < <(git rev-list --left-right --count origin/main...HEAD 2>/dev/null)
  echo "- Branch \`${branch:-detached}\`: $ahead ahead / $behind behind origin/main (as of the last fetch); $dirty uncommitted path(s)."
fi
[ "$branch" = main ] && echo "- On main: branch before committing — main moves only through PRs targeting main (no stacked PRs)."
worktrees=$(( $(git worktree list | wc -l) - 1 ))
[ "$worktrees" -gt 0 ] && echo "- $worktrees other worktree(s) exist; other work may be in flight. Don't touch their branches, a rebase in progress, or the shared stash."

new_migrations=$(git diff --name-only --diff-filter=A origin/main...HEAD -- apps/web/migrations 2>/dev/null)
[ -n "$new_migrations" ] && echo "- This branch adds migration(s): $(echo $new_migrations | tr '\n' ' ')— after merge: \`pnpm backup:d1\`, then apply --remote BEFORE \`pnpm run deploy\`."

common=$(git rev-parse --path-format=absolute --git-common-dir)
newest=$(ls -t "$(dirname "$common")"/backups/time-tracker-*.sql.gz 2>/dev/null | head -1)
if [ -n "$newest" ]; then
  age=$(( ( $(date +%s) - $(stat -f %m "$newest" 2>/dev/null || stat -c %Y "$newest") ) / 86400 ))
  [ "$age" -ge 7 ] && echo "- Newest production backup is ${age} days old (weekly cadence — docs/RUNBOOK.md)."
fi

if [ "$source" = compact ]; then
  cat <<'EOF'

## Rules that survive compaction
- Every app query is scoped by workspace_id; drafts never reach reports/totals/pushes.
- Dates the user sees are LOCAL (YYYY-MM-DD / minutes after local midnight); the UTC worker never derives "today".
- Migrations are one-way: new numbered file only; `pnpm backup:d1` before any --remote apply; migrations land before code that reads them.
- `pnpm run deploy`, never `pnpm deploy`. `pnpm check` first. Smoke: / → 200, /api/health → {"ok":true}.
- No z-suffixed endpoints. No `shadcn init`. Generated files: cf-typegen / pnpm install / generate-icons.
- Feature name is "Assistant". No competitor or reference product names in code, commits, PRs or docs.
- Throwaway specs are zz-*.spec.ts and are deleted; committed specs never write screenshots or local paths.
EOF
fi
exit 0
