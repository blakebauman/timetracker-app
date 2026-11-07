---
name: pr-review
description: Panel review of the current branch or a PR number using this repo's reviewer agents in parallel — code-reviewer always, plus security-reviewer, react-expert, cloudflare-expert, docs-sync and e2e-engineer when the diff touches their area — then verify, dedupe and rank the findings. Use before opening or merging a PR, or when asked to "review my changes" against this codebase's invariants.
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/scope.sh *) Bash(${CLAUDE_SKILL_DIR}/scripts/scope.sh) Bash(git diff *) Bash(gh pr diff *)
argument-hint: "[pr-number]"
---

# Panel review

```!
${CLAUDE_SKILL_DIR}/scripts/scope.sh $ARGUMENTS
```

## Run the panel

Launch **every reviewer listed above in one message**, so they run in parallel. Each brief is self-contained, because the agents don't see this conversation:

- the target (branch vs `origin/main`, or `PR #N`) and the command to get the diff (`git diff origin/main...HEAD`, or `gh pr diff N`);
- the changed-file list above, scoped to the files in that agent's area;
- one line on the change's intent, taken from the commits or PR title;
- for **docs-sync**: "report only — list doc drift, do not edit";
- "Return only findings you verified, with file:line and a concrete failure scenario."

Don't add your own hypotheses to the briefs. A reviewer handed a hypothesis tends to confirm it.

## Merge the results

1. Dedupe findings that name the same defect.
2. Verify each remaining finding yourself: open the cited line and check that the failure scenario holds. Drop what doesn't, and say how many you dropped.
3. Rank by severity: data leak or tenant break > data loss or corruption > wrong numbers on a report or invoice > broken flow > drift and cleanup.
4. If the `ReportFindings` tool is available, report through it. Otherwise give a table: severity · file:line · finding · fix · reviewer.

Don't fix anything unless the user asks. Then fix in severity order and re-run `check`.
