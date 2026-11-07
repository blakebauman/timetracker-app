# Claude Code toolkit

What Claude Code loads in this repo, and why each piece is the kind of thing it is. The split follows one rule:

- **A hook** handles anything that must *always* happen or *never* happen. Hooks are deterministic and fire in every permission mode.
- **A skill** is a procedure someone triggers, or that Claude picks up when a request matches its description.
- **A subagent** gets a fresh context: a review that shouldn't be anchored on the conversation, or a side task whose file reads shouldn't flood the main thread.

`pnpm check:claude` validates all of it, and CI runs the same check in the lint job. The `toolkit-audit` skill does the judgment half.

## Hooks (`settings.json` → `hooks/`)

| Event | Script | What it does |
|---|---|---|
| `SessionStart` | `session-start.sh` | Shows branch vs `origin/main`, uncommitted count, other worktrees, unshipped migrations and backup age. After a compaction it also restates the rules that most often get lost. |
| `PreToolUse` Bash | `guard-bash.sh` | **Blocks** bare `pnpm deploy`, `shadcn init`, `--no-verify`, pushes to `main`, and the dev seed `--remote`. **Blocks** remote D1 migrations or writes unless a `pnpm backup:d1` export exists from the last 6h, then **asks**. **Asks** before force-pushes, `wrangler secret` and deleting local D1 state. |
| `PreToolUse` Edit/Write | `guard-files.sh` | **Blocks** hand-edits to generated files (cf-typegen output, the lockfile, icons), secrets (`.dev.vars`, the extension key), `backups/`, any migration already on `origin/main`, and seed credentials in a migration. Each denial names the right command. |
| `PostToolUse` Edit/Write | `post-edit.sh` | Runs ESLint on the edited TS file, flags z-suffixed routes and screenshots in committed specs, gives migration/`wrangler.jsonc` follow-ups, validates `.claude/` edits, and gives a once-per-session docs nudge. |

Hook feedback reaches Claude only through `exit 2` + stderr (blocking) or `hookSpecificOutput.additionalContext` (JSON). Plain stdout from a `PostToolUse` hook is never shown to Claude. The previous hooks (`lint-ts.sh`, `migration-reminder.sh`) printed to stdout, so their output was silently dropped.

Personal permissions and the vendored `impeccable` design hook live in `settings.local.json` (gitignored).

## Skills (`skills/`, [Agent Skills spec](https://agentskills.io/specification))

| Skill | Invoked by | Purpose |
|---|---|---|
| `check` | you / Claude | lint → `pnpm check` → bundle budget; fix root causes |
| `verify` | you / Claude | drive the real app with a throwaway Playwright spec |
| `db` | you / Claude | query the **local** D1 for this checkout |
| `migrate` | you / Claude | next numbered migration, with cross-branch number-collision detection |
| `add-endpoint` | you / Claude | schema → router → client → hook → spec → docs, the repo's way |
| `pr-review` | you / Claude | parallel reviewer panel, routed by which paths the diff touches |
| `docs-sync` | you / Claude | forked `docs-sync` agent brings docs in line with the diff |
| `toolkit-audit` | you / Claude | forked `dx-engineer` audits this toolkit |
| `prod-check` | you / Claude | read-only production health |
| `ship` | **you only** | branch → checks → review → PR → green e2e (merge/deploy on approval) |
| `deploy` | **you only** | backup → remote migrations → `pnpm check` → `pnpm run deploy` → smoke |
| `impeccable` | you / Claude | vendored design skill (upstream; not edited here) |

Each skill's `name` matches its directory, and its description is ≤ 1024 chars and says *when* to use it. Bodies stay under 500 lines, with dynamic context in `scripts/` and detail in `references/`. Claude Code-only keys (`disable-model-invocation`, `context: fork`, `argument-hint`) are used where they buy something: side-effect gating and isolated context. A strict spec client would reject those keys.

## Subagents (`agents/`)

| Agent | Writes? | Use for |
|---|---|---|
| `code-reviewer` | no | correctness + this repo's invariants on a diff |
| `security-reviewer` | no | tenant isolation, auth, MCP scope, SSRF, prompt injection, bundle secrets |
| `cloudflare-expert` | no | Workers / D1 / DOs / limits / wrangler |
| `react-expert` | no | React / Query / Zustand / design-system usage |
| `devops-engineer` | CI/config | CI failures, release sequencing, prod health (hands one-way ops back) |
| `docs-sync` | docs only | documentation drift |
| `dx-engineer` | tooling/docs | scripts, onboarding, this toolkit |
| `e2e-engineer` | specs only | Playwright specs, de-flaking |

Reviewers are read-only by tool allowlist, not by instruction, so they can't "helpfully" fix what they were asked to judge.
