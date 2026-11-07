#!/bin/bash
# PostToolUse(Edit|Write|MultiEdit): fast, file-scoped feedback after an edit.
#
# Everything goes back as hookSpecificOutput.additionalContext. Plain stdout on
# exit 0 is NOT shown to Claude for PostToolUse — it only reaches the debug log —
# which is why the hooks this replaced (lint-ts.sh, migration-reminder.sh) were
# printing lint errors and migration reminders that nobody ever read.
set -u
input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
[ -z "$file" ] || [ ! -f "$file" ] && exit 0
session=$(printf '%s' "$input" | jq -r '.session_id // "none"')

top=$(git -C "$(dirname "$file")" rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-$PWD}")
rel="${file#"$top"/}"
notes=()

# Once-per-session reminders, so a run of edits to one area doesn't repeat itself.
once() {
  local mark="${TMPDIR:-/tmp}/claude-tt-${session}-$1"
  [ -e "$mark" ] && return 1
  : >"$mark"
}

case "$rel" in
  *.ts|*.tsx)
    # Skipped silently where deps aren't installed (a fresh worktree).
    if [[ "$rel" != *node_modules* ]] && [ -x "$top/node_modules/.bin/eslint" ]; then
      lint=$(cd "$top" && pnpm exec eslint --quiet --no-warn-ignored "$file" 2>&1 | head -30)
      [ -n "$lint" ] && notes+=("ESLint errors in $rel (the pre-commit hook will reject these):
$lint")
    fi
    ;;
esac

case "$rel" in
  apps/web/src/worker/routes/*|apps/web/src/worker/index.ts|apps/web/src/worker/mcp/*)
    # User rule: no z-suffixed endpoints (/healthz, /readyz, /authz, ...).
    if grep -nE "[\"'\`]/(api/)?[a-z-]*(health|ready|live|auth|status|metric|version)z[\"'\`/?]" "$file" >/dev/null 2>&1; then
      notes+=("$rel adds a z-suffixed route (e.g. /healthz). Use the plain word: /health, /ready, /auth.")
    fi
    once docs-api && notes+=("API surface changed ($rel). Before the PR: docs/ARCHITECTURE.md (routes), docs/MCP.md if an MCP tool changed, docs/USER_GUIDE.md if users see it — or run the docs-sync skill.")
    ;;
  apps/web/migrations/*.sql)
    notes+=("Migration $rel: apply locally with \`cd apps/web && npx wrangler d1 migrations apply time-tracker --local\`. Remote apply happens AFTER the PR merges and AFTER \`pnpm backup:d1\` — and before deploying worker code that reads the new columns. Every app table needs workspace_id; snake_case columns.")
    ;;
  apps/web/wrangler.jsonc)
    notes+=("wrangler.jsonc changed: run \`pnpm cf-typegen\` if a binding changed. A new or renamed Durable Object class also needs a \`migrations\` tag entry, and DO deletes are two-deploy operations (read the comments in that block).")
    ;;
  apps/web/e2e/*.spec.ts)
    if [[ "$(basename "$rel")" != zz-* && "$(basename "$rel")" != _verify_* ]] && grep -nE "page\.screenshot|/private/tmp|scratchpad" "$file" >/dev/null 2>&1; then
      notes+=("$rel is a committed spec but writes a screenshot or a local path — it will ENOENT on CI. Move visual checks into a throwaway zz-*.spec.ts.")
    fi
    ;;
  .claude/*)
    v=$(cd "$top" && node .claude/scripts/validate-toolkit.mjs "$file" 2>&1)
    [ -n "$v" ] && notes+=("Toolkit validation for $rel:
$v")
    ;;
  CLAUDE.md|docs/*|ROADMAP.md|DESIGN.md|PRODUCT.md) ;;
  apps/web/src/react-app/components/*|apps/web/src/react-app/pages/*)
    once docs-ui && notes+=("UI changed. If this is user-visible, docs/USER_GUIDE.md probably needs a line. DESIGN.md is the source of truth for tokens/radius/motion.")
    ;;
esac

[ ${#notes[@]} -eq 0 ] && exit 0
ctx=$(printf '%s\n\n' "${notes[@]}")
jq -n --arg c "$ctx" '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$c}}'
