# Git Touchpoints — Porting Surface Scan

**Generated:** 2026-05-09 during /gsd-new-project setup
**Method:** ripgrep across full repo for git invocations, `.git/` paths, exec patterns, and ref terminology
**Purpose:** Inform scope/roadmap for jj VCS port. Will drift as upstream churns — refresh before major planning.

## Headline Numbers

| Surface                                          | Files | Hits  |
|--------------------------------------------------|------:|------:|
| `git <subcommand>` invocations (any context)     |   198 | 1,234 |
| `.git/` or `.git\b` references                   |    72 |   253 |
| Programmatic exec (`exec*('git`, `runGit`, etc.) |    36 |   244 |
| Ref/branch terms (`HEAD`, `origin/`, `refs/…`)   |    83 |   488 |

Counts include tests, docs, CI, agent prompts, and source. Source is the porting surface; the rest is co-load.

## Source-Code Hotspots (the actual port targets)

### Top concentration in `get-shit-done/bin/lib/` (CLI runtime, .cjs)

| File                                  | LOC   | git subs | .git refs | HEAD/refs |
|---------------------------------------|------:|---------:|----------:|----------:|
| `core.cjs`                            | 2,036 |        6 |         8 |         6 |
| `verify.cjs`                          | 1,390 |        9 |         1 |         8 |
| `commands.cjs`                        | 1,028 |        3 |         — |        15 |
| `worktree-safety.cjs`                 |   338 |        1 |         — |         9 |
| `init.cjs`                            |     — |        3 |         5 |         3 |
| `graphify.cjs`                        |     — |        1 |         — |         3 |
| `drift.cjs`                           |     — |        4 |         — |         — |

These five files concentrate the lion's share of programmatic git use in the CLI. ~5,100 LOC across the top set.

### `sdk/src/query/` (TypeScript SDK — newer, partially decomposed)

| File                                   | git subs | HEAD/refs |
|----------------------------------------|---------:|----------:|
| `commit.ts`                            |        3 |         8 |
| `commit.test.ts`                       |       30 |        32 |
| `init.ts`                              |        2 |         3 |
| `verify.ts`                            |        — |         6 |
| `progress.ts`                          |        — |         4 |
| `check-ship-ready.ts`                  |        6 |         2 |
| `config-query.ts`                      |        1 |         — |

`commit.ts` (318 LOC) is the canonical commit-handler — natural seam to port.

### Hooks (.git-specific by definition)

- `.githooks/pre-commit`, `.githooks/pre-push` — git lifecycle hooks
- `hooks/lib/git-cmd.js` — token-walk classifier for `git <subcommand>` detection (used by hook gates, not by GSD's own git invocations). **Does NOT centralize GSD's own git calls** — those are scattered as raw shell strings.
- `hooks/gsd-validate-commit.sh`, `hooks/gsd-session-state.sh` — bash hooks that grep git state

jj has no direct analog to git hooks; needs design (signal pre-commit/pre-push moments via wrapper command or jj operation log polling).

### Workflow & Agent Markdown (instruction surface — NOT executable code, but feeds LLM prompts)

| File                                       | git mentions |
|--------------------------------------------|-------------:|
| `get-shit-done/workflows/execute-phase.md` |           58 |
| `get-shit-done/workflows/quick.md`         |           46 |
| `agents/gsd-code-fixer.md`                 |           37 |
| `get-shit-done/workflows/complete-milestone.md` |      36 |
| `agents/gsd-executor.md`                   |           24 |
| `get-shit-done/workflows/undo.md`          |           15 |
| `get-shit-done/workflows/code-review.md`   |           11 |

These files instruct LLM agents to run shell git. Porting requires rewriting prompts to instruct jj equivalents (or routing via a VCS-abstracted helper command).

## Worktree / Workspace Entanglement

`worktree`/`workspace` mentions in `sdk/src/`: 139 across 16 files. Heavy concentration in:

- `sdk/src/query/workspace.ts`, `workspace.test.ts`
- `sdk/src/query/init.ts` (22 mentions)
- `sdk/src/query/sub-repos-root.integration.test.ts` (15 mentions)
- `sdk/src/query/helpers.ts`, `helpers.test.ts`

GSD treats git worktrees as a first-class primitive for parallel-phase execution. **jj has `jj workspace`** with overlapping but non-identical semantics:
- jj workspaces share the working-copy commit pointer differently
- No detached HEAD concept; jj uses change IDs
- Stagger/locking semantics differ (no `.git/index.lock` analog)

Many bug-fix tests reference worktree edge cases (`bug-2924-worktree-head-attachment`, `bug-2774-worktree-cleanup-workspace-safety`, `bug-3097-3099-executor-worktree-path-safety`, etc.) — these encode hard-won git-worktree knowledge that needs jj-equivalent thinking.

## Test Surface (run via `node scripts/run-tests.cjs`)

Roughly **80+ test files** exercise git behavior directly:

- worktree lifecycle (create, lock, prune, cleanup, safety)
- commit boundary, branching defaults, base-branch detection
- cherry-pick / hotfix flows
- gitignored-planning rescue
- pre-commit/pre-push hook gates
- `.gitmodules` path safety

Tests use real git repos in temp dirs. Porting strategy options:
1. **Replace** with jj-equivalent tests (highest fidelity, most work)
2. **Mirror** — keep git tests, add parallel jj tests
3. **Abstract** — introduce VCS adapter, run same tests against both backends

## CI / GitHub Workflows

`.github/workflows/*.yml` (release, hotfix, canary, test, install-smoke, security-scan, branch-cleanup, auto-branch) all use git on GitHub — these stay git, since GitHub *is* git. Fork's CI keeps git fluent on the upstream side; jj is a local-developer-experience layer.

## Other Co-Loaded Surfaces

- **`.changeset/`** — changesets tooling is git-aware (uses `git log` to detect changed packages). Likely keep on git side.
- **`scripts/changeset/lint.cjs`**, **`scripts/diff-touches-shipped-paths.cjs`** — git-diff-driven scripts.
- **`bin/install.js`** — installer, 7 git mentions. User-facing entry point.

## Centralization Status

**No single `execGit()` seam exists.** Searches for `execGit|runGit|gitExec|spawnGit|exec.*'git` find 244 hits but most are *direct* `execSync('git …')` or `child_process.execSync('git …')` calls scattered through `bin/lib/*.cjs` and `sdk/src/query/*.ts`.

This is the single largest leverage point: **introduce a VCS adapter with two implementations (`git`, `jj`) and migrate call sites incrementally**. Without it, porting is grep-and-replace across thousands of lines and stays brittle.

## Estimated Porting Buckets

Rough mental sizing (not a roadmap, just scope intuition):

| Bucket                                               | Files (~) | Effort     |
|------------------------------------------------------|----------:|------------|
| VCS adapter abstraction (new module + interface)     |      1–2  | M          |
| Port `bin/lib/{core,verify,commands,worktree-safety,init}.cjs` to adapter | 5    | L          |
| Port `sdk/src/query/{commit,init,verify,progress}.ts` & co | 6–8     | M          |
| Worktree → workspace semantic mapping                |     ~16  | L (design-heavy) |
| Hooks (git → jj operation log triggers or wrapper)   |      ~5  | M (design-heavy) |
| Workflow/agent markdown — rewrite prompts            |    ~30+  | L (mechanical, lots of files) |
| Test suite — strategy decision required first        |    ~80+  | XL         |
| CI — stays mostly git-side                            |    minimal | S          |

## Caveats

- Counts are upper bounds — multi-language doc files inflate (zh-CN, ja-JP, ko-KR, pt-BR mirrors of english docs).
- This snapshot reflects upstream `vtnolxpzlkkytzykynnttxmvpylqzuzt` (pnpm migration). Refresh after each upstream pull before major planning.
- "git mentions in markdown" overcounts because the same workflow doc is mirrored across i18n locales.

## Refresh Command

```bash
# Re-run when needed:
rg -c '\bgit\s+(commit|log|status|diff|rebase|merge|branch|checkout|push|pull|fetch|reset|stash|cherry-pick|reflog|show|init|clone|tag|worktree|notes|blame|ls-files|rev-parse|rev-list|describe|config|remote|add|rm|mv)' --glob '!node_modules' --glob '!.jj' --glob '!.git'
```
