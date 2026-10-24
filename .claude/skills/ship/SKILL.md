---
name: ship
description: Take finished work on a branch to a green, review-ready PR against main — validate, panel-review, sync docs, conventional commit, push, open the PR, and poll the required e2e check. Merge and deploy only with the user's go-ahead. Use when the user says "ship it", "open a PR" or "get this merged".
disable-model-invocation: true
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/preflight.sh) Bash(git status *) Bash(git diff *) Bash(git log *) Bash(gh pr checks *) Bash(gh pr view *)
argument-hint: "[short description of the change]"
---

# Ship

Change: `$ARGUMENTS`

```!
${CLAUDE_SKILL_DIR}/scripts/preflight.sh
```

## Before committing

- **Unexpected changes:** if the working tree has edits that aren't part of this task, stop and ask. Commit the user's work separately or bundle it with attribution in the PR body. Never silently absorb or discard it.
- **Base:** the PR targets `main`. Never stack on another feature branch. If this work depends on an open PR, wait for it to land or put both in one PR.
- Run the `check` skill (lint → `pnpm check` → `check:bundle`). For runtime changes, also run the `verify` skill and say what you observed.
- Run the `pr-review` skill and fix every confirmed finding at or above "broken flow". List the rest in the PR body.
- Docs: if `pr-review`'s docs-sync reported drift, delegate the edits to the **docs-sync** agent.
- New specs: `grep -rn "page.screenshot\|/private/tmp\|scratchpad" apps/web/e2e/` returns nothing, and every throwaway `zz-*` spec is deleted.

## Commit, push, PR

1. Conventional commit: `type(scope): summary` (≤ 120 chars). Types are in `.commitlintrc.json` (`design` and `polish` are allowed). The body explains *why*. End with the attribution trailer from the session's instructions. lefthook runs eslint and commitlint, and a hook blocks `--no-verify`.
2. `git push -u origin <branch>` (pre-push runs lint and typecheck).
3. `gh pr create --base main` with a body that covers what changed and why, how it was verified, migrations (if any, plus the remote-apply note), and anything deferred. No competitor or reference product names.
4. Poll `gh pr checks <n>` until it settles (`e2e` is required; CI runs lint, typecheck, build and audit). For a red e2e, read `gh run view <id> --log-failed`. If the failure rotates and looks like contention, `gh run rerun <id> --failed` once. A repeat on the same spec is a real bug.

## Merge and deploy (only with the user's go-ahead)

`gh pr merge <n> --squash --delete-branch`, then confirm the change is on `origin/main` (`git fetch && git log origin/main -1`). Then `git switch main && git pull --ff-only` and run the `deploy` skill. One approval of the whole plan covers the whole sequence. Stop only on surprises.
