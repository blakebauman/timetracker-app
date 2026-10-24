#!/bin/bash
# Pre-PR state: branch and base, other work in flight, what would be committed.
root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"
cd "$root" || exit 0
branch=$(git branch --show-current)
echo "Branch: ${branch:-detached}"
[ "$branch" = main ] && echo "STOP: on main — create a branch from origin/main first."
commits=$(git log --format='%h %s' origin/main..HEAD 2>/dev/null | head -20)
if [ -n "$commits" ]; then
  echo "Commits the PR would contain (anything not from this task means a stacked base):"
  echo "$commits" | sed 's/^/  /'
fi
echo
echo "Working tree:"
git status --short | head -40
echo
open=$(gh pr list --head "$branch" --json number,url,baseRefName -q '.[] | "#\(.number) → \(.baseRefName) \(.url)"' 2>/dev/null)
[ -n "$open" ] && echo "Open PR for this branch: $open"
echo "Worktrees: $(git worktree list | wc -l | tr -d ' ')"
