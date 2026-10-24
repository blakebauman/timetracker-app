#!/bin/bash
# Decide which reviewer agents a diff needs. Deterministic routing, so the
# same diff always gets the same panel.
#   scope.sh            # current branch vs origin/main (plus uncommitted)
#   scope.sh <pr#>      # a GitHub PR
root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"
cd "$root" || exit 0
if [[ "${1:-}" =~ ^[0-9]+$ ]]; then
  files=$(gh pr diff "$1" --name-only 2>/dev/null)
  echo "Target: PR #$1 ($(gh pr view "$1" --json title,baseRefName -q '.title + " → " + .baseRefName' 2>/dev/null))"
else
  files=$( { git diff --name-only origin/main...HEAD; git diff --name-only HEAD; git ls-files --others --exclude-standard; } 2>/dev/null | sort -u)
  echo "Target: $(git branch --show-current) vs origin/main (committed + uncommitted)"
fi
[ -z "$files" ] && { echo "No changed files."; exit 0; }
echo "Changed files: $(echo "$files" | wc -l | tr -d ' ')"
echo "$files" | sed 's/^/  /' | head -60

has() { echo "$files" | grep -qE "$1"; }
echo
echo "Reviewers:"
echo "  code-reviewer       always"
has '^apps/web/src/worker/(auth|middleware|routes|mcp|integrations|lib/(api-keys|assistant|untrusted))|^apps/extension/|wrangler\.jsonc|security-headers' \
  && echo "  security-reviewer   auth/routes/MCP/integrations/Assistant/extension touched"
has '^apps/web/src/react-app/' && echo "  react-expert        frontend touched"
has '^apps/web/(migrations|wrangler\.jsonc)|durable-objects/|src/worker/index\.ts|scheduled' \
  && echo "  cloudflare-expert   migrations / bindings / DO / cron touched"
has '^apps/web/src/|^packages/core/src/|^scripts/|^package\.json|\.github/' \
  && echo "  docs-sync           (report-only) code changed — check docs drift"
has '^apps/web/e2e/' && echo "  e2e-engineer        specs touched — check CI-safety and polling"
