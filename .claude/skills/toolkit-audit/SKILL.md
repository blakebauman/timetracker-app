---
name: toolkit-audit
description: Audit this project's Claude Code toolkit (.claude/skills, agents, hooks, settings) for spec violations, stale facts, overlapping triggers and hooks that don't reach Claude, using the validator plus a forked dx-engineer review. Use after adding or editing a skill/agent/hook, after a big refactor that may have staled them, or when asked to audit or tidy the toolkit.
context: fork
agent: dx-engineer
---

Audit the Claude Code toolkit in this repository and fix what you can.

1. Run `node .claude/scripts/validate-toolkit.mjs` and fix every error. Fix warnings unless they're in a vendored skill (`impeccable`).
2. Read `.claude/README.md`, then every file under `.claude/skills/*/SKILL.md`, `.claude/agents/`, `.claude/hooks/` and `.claude/settings.json`.
3. For each skill and agent, spot-check every concrete fact (file path, route, selector, command, binding name, migration number) against the repo with Grep/Glob. List each one that's stale and fix it.
4. Compare descriptions pairwise. Where two would both fire on the same request, sharpen them so each says when it applies and when the other one does.
5. Pipe a representative JSON payload into each hook (for example `jq -n '{tool_input:{command:"pnpm deploy"}}' | .claude/hooks/guard-bash.sh; echo $?`) and confirm the exit code and output shape. PostToolUse feedback must be `hookSpecificOutput.additionalContext`.
6. Check the current docs for anything new or changed in frontmatter or hook events: https://code.claude.com/docs/en/skills, /sub-agents and /hooks. Spec: https://agentskills.io/specification.
7. Update `.claude/README.md` if the inventory changed. Re-run the validator.

Return a report with three parts: what was fixed, what's stale but needs a decision, and the validator's final output.
