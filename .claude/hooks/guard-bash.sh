#!/bin/bash
# PreToolUse(Bash): the project's one-way doors, enforced rather than remembered.
#
# exit 2 + stderr  -> the command is blocked and Claude reads why
# JSON "ask"       -> the user is asked, whatever the permission mode
# exit 0           -> no opinion; the normal permission flow applies
#
# A PreToolUse deny holds even in bypassPermissions/auto mode, which is the
# point: these are the mistakes that can't be undone by the next commit.
set -u
cmd=$(jq -r '.tool_input.command // empty')
[ -z "$cmd" ] && exit 0

# The command with quoted strings and heredoc bodies removed, so a commit
# message or an echo that merely *mentions* `--no-verify` doesn't trip a rule.
bare=$(printf '%s' "$cmd" | perl -0pe "s/<<-?\s*['\"]?(\w+)['\"]?.*?^\s*\1\s*\$//gms; s/'[^']*'//gs; s/\"[^\"]*\"//gs")

block() { echo "Blocked by .claude/hooks/guard-bash.sh: $1" >&2; exit 2; }
ask() {
  jq -n --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"ask",permissionDecisionReason:$r}}'
  exit 0
}

# Backups live in the main checkout even when Claude works in a worktree.
project="${CLAUDE_PROJECT_DIR:-$PWD}"
common=$(git -C "$project" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
main_root=$([ -n "$common" ] && dirname "$common" || echo "$project")

recent_backup() {
  # A production export from the last 6 hours, in either checkout.
  find "$main_root/backups" "$project/backups" -maxdepth 1 -name 'time-tracker-*.sql.gz' -mmin -360 2>/dev/null | grep -q .
}

# --- pnpm's built-in `deploy` is not our deploy -------------------------------
if [[ "$bare" =~ (^|[[:space:];&|])pnpm[[:space:]]+deploy([[:space:]]|$) ]]; then
  block "\`pnpm deploy\` runs pnpm's built-in (workspace copy), not ours. Use \`pnpm run deploy\` — after \`pnpm check\` (see the deploy skill)."
fi

# --- remote D1 ----------------------------------------------------------------
if [[ "$cmd" =~ wrangler[[:space:]]+d1 ]] && [[ "$cmd" =~ --remote ]]; then
  if [[ "$cmd" =~ seeds/ ]] || [[ "$cmd" =~ dev-seed ]]; then
    block "the dev seed carries a known-credential demo login. It is LOCAL-only (--local), never --remote."
  fi
  if [[ "$cmd" =~ migrations[[:space:]]+apply ]]; then
    recent_backup || block "remote migrations are one-way. Run \`pnpm backup:d1\` first (no export under backups/ in the last 6h), then retry. See docs/RUNBOOK.md."
    ask "Applying migrations to the PRODUCTION D1 (backup found). Confirm the migration has landed on main and is additive."
  fi
  if [[ "$cmd" =~ d1[[:space:]]+execute ]]; then
    upper=$(printf '%s' "$cmd" | tr '[:lower:]' '[:upper:]')
    if [[ "$cmd" =~ --file ]] || [[ "$upper" =~ (INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|VACUUM)[[:space:]] ]]; then
      recent_backup || block "a write to the PRODUCTION D1. Run \`pnpm backup:d1\` first (no export in the last 6h)."
      ask "This writes to the PRODUCTION D1 database. Confirm."
    fi
  fi
fi

# --- design-system tokens ----------------------------------------------------
if [[ "$bare" =~ shadcn(@[^[:space:]]+)?[[:space:]]+init ]]; then
  block "\`shadcn init\` overwrites the hand-written tokens in apps/web/src/react-app/index.css. Use \`shadcn add <component>\` from apps/web."
fi

# --- git: hooks and main are not optional ------------------------------------
if [[ "$bare" =~ git[[:space:]].*--no-verify ]]; then
  block "lefthook runs eslint, commitlint and the pre-push typecheck. Fix what it reports instead of skipping it."
fi
if [[ "$bare" =~ git[[:space:]]+push ]]; then
  if [[ "$bare" =~ (^|[[:space:]:])main([[:space:]]|$) ]] || { [[ "$bare" =~ (--force|[[:space:]]-f([[:space:]]|$)) ]] && [ "$(git -C "$project" branch --show-current 2>/dev/null)" = main ]; }; then
    block "main moves only through a PR (the e2e check is required). Push a branch and open a PR."
  fi
  if [[ "$bare" =~ --force([[:space:]]|$) ]]; then
    ask "Force-push rewrites the remote branch. Prefer --force-with-lease. Confirm."
  fi
fi

# --- production secrets and local state --------------------------------------
if [[ "$bare" =~ wrangler[[:space:]]+secret[[:space:]]+(put|delete|bulk) ]]; then
  ask "This changes a PRODUCTION Worker secret."
fi
if [[ "$bare" =~ rm[[:space:]].*\.wrangler/state ]]; then
  ask "This deletes the local D1 database (apps/web/.wrangler/state) and every local account in it."
fi

exit 0
