---
name: docs-sync
description: Bring CLAUDE.md, docs/*.md, ROADMAP.md, READMEs and the .claude skills/agents back in line with the code on this branch, in a forked docs-sync agent that edits documentation only. Use before a PR that changes routes, schema, MCP tools, user-visible behaviour, scripts or the deploy flow, or when someone says the docs are stale.
context: fork
agent: docs-sync
argument-hint: "[git range, default origin/main...HEAD]"
---

Sync this repository's documentation with its code.

Range: `$ARGUMENTS`. If it's empty, use `origin/main...HEAD` plus uncommitted changes (`git diff HEAD`).

1. Read the diff for that range and map every code change to the docs that describe it, using the table in your instructions.
2. Grep the docs, `.claude/skills` and `.claude/agents` for every identifier, path, route, env var and command the diff renamed or removed, and fix each stale reference.
3. Edit only Markdown, in each file's existing voice. Then run `node .claude/scripts/validate-toolkit.mjs` if you touched `.claude/`.
4. Return a table of file → change → the code change that required it, followed by any place where the code looks wrong and the doc looks right.
