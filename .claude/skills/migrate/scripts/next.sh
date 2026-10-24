#!/bin/bash
# Print the newest migrations, the next sequence number, and the most recent
# migration as a style reference.
root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"
dir="$root/apps/web/migrations"
last=$(ls "$dir" | grep -E '^[0-9]{4}_' | sort | tail -1)
n=$((10#${last%%_*} + 1))
echo "Newest migrations:"
ls "$dir" | sort | tail -5 | sed 's/^/  /'
printf '\nNEXT=%04d\n' "$n"
if git -C "$root" rev-parse -q --verify origin/main >/dev/null; then
  main_last=$(git -C "$root" ls-tree --name-only origin/main apps/web/migrations/ | xargs -n1 basename | sort | tail -1)
  [ "$main_last" != "$last" ] && echo "NOTE: origin/main's newest is $main_last — another branch may claim the same number; re-check before merging."
fi
# Another branch (or worktree) may already have claimed this number.
claimed=$(git -C "$root" log --all --format= --name-only --diff-filter=A -- "apps/web/migrations/$(printf '%04d' "$n")_*" 2>/dev/null | sort -u)
if [ -n "$claimed" ]; then
  echo "TAKEN on another branch: $claimed"
  echo "  -> use the next free number, and tell the user so the merge order is deliberate."
fi
echo
echo "Style reference ($last):"
sed -n '1,40p' "$dir/$last"
