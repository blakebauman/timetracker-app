#!/bin/bash
# PreToolUse(Edit|Write|MultiEdit): files Claude must not hand-edit.
# Each block says what to do instead, so the denial is a redirect, not a wall.
set -u
input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty')
[ -z "$file" ] && exit 0
tool=$(printf '%s' "$input" | jq -r '.tool_name')

project="${CLAUDE_PROJECT_DIR:-$PWD}"
# Path relative to whichever checkout (main or a worktree) holds the file.
top=$(git -C "$(dirname "$file")" rev-parse --show-toplevel 2>/dev/null || echo "$project")
rel="${file#"$top"/}"

block() { echo "Blocked by .claude/hooks/guard-files.sh: $rel — $1" >&2; exit 2; }

case "$rel" in
  apps/web/worker-configuration.d.ts)
    block "generated from wrangler.jsonc. Edit apps/web/wrangler.jsonc, then run \`pnpm cf-typegen\`." ;;
  pnpm-lock.yaml)
    block "generated. Change the catalog in pnpm-workspace.yaml / a package.json, then run \`pnpm install\`." ;;
  apps/web/public/*.png|apps/web/public/*.ico|apps/web/public/logo.svg|apps/extension/icons/*.png)
    block "generated from packages/core's brand mark. Run \`pnpm generate-icons\`." ;;
  .dev.vars|*/.dev.vars|*.dev.vars.*)
    [[ "$rel" == *.example ]] || block "holds local secrets. Tell the user which key to set rather than writing it." ;;
  apps/extension/.keys/*)
    [[ "$rel" == */README.md ]] || block "the extension signing key. It pins the extension ID; never rewrite it." ;;
  backups/*)
    block "plaintext production exports. Read-only evidence for a restore drill." ;;
  apps/web/migrations/*.sql)
    # A migration that is already on main has been (or will be) applied to the
    # remote database. Editing it changes nothing there and forks local from prod.
    if git -C "$top" cat-file -e "origin/main:$rel" 2>/dev/null; then
      block "already on main, so it has shipped to the remote D1. Migrations are one-way: add the next numbered file (the migrate skill)."
    fi
    if [ "$tool" = "Write" ] && printf '%s' "$input" | jq -r '.tool_input.content // empty' | grep -q 'TestPassApps2026'; then
      block "seed/demo data never goes in a migration (remote apply would create a known-credential login). Put it in apps/web/seeds/dev-seed.sql."
    fi
    ;;
esac
exit 0
