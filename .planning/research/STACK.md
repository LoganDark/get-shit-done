# Stack Research — v1.3 `vcs.parallel.*` cross-backend verbs

**Domain:** TypeScript VCS adapter — wiring layer for new cross-backend `vcs.parallel.dispatch(plan)` / `vcs.parallel.fanIn(branches)` verbs on top of an already-shipped two-backend (git + jj) adapter
**Researched:** 2026-05-15
**Confidence:** HIGH

## TL;DR

**No new npm dependencies are needed.** This milestone is pure WIRING: lift two already-shipped sidecar helpers (`sdk/src/vcs/jj/octopus.ts`, `sdk/src/vcs/jj/reap.ts`) behind a new cross-backend verb surface, add a symmetric raw-git body inside `sdk/src/vcs/backends/git.ts`, and rewire `execute-phase.md` to call the new verbs. Every primitive needed — `spawnSync` for `jj`/`git` invocations, `vitest@3.1.1` for tests (`describe.sequential.skipIf` already used for jj-octopus / jj-reap suites), `node:fs`/`node:os`/`node:path` for workspace dir management, the existing `acquireJjWriteLock` RAII helper for the under-lock atomic sequences — already ships with the adapter. Parallelism happens **OUT-OF-PROCESS** (Claude Code `Agent()` subagents writing into separate workspaces); the adapter itself runs sequential `spawnSync` against the `jj` / `git` binaries. There is no in-process parallelism to add and therefore no `worker_threads` / `child_process.fork` need.

The only version question worth verifying is the jj binary floor. Per `project_a3_colocated_pre_commit_gap` memory + Phase 4 LEARNINGS Open Q1, the A3 colocated pre-commit fix may require a jj-version bump above 0.41 if the chosen fix path is "wait for upstream jj". The other two fix paths (synthetic-hook bridge in adapter, or document-and-skip) keep the 0.41 floor intact. Roadmapper picks the path during planning.

## Recommended Stack

### Core Technologies — already present, no changes needed

| Technology | Version | Purpose | Why no change |
|------------|---------|---------|---------------|
| Node.js | ≥22.0.0 (matches `package.json` `engines`) | Runtime host for SDK adapter + CLI shims | Already required by upstream. `spawnSync` lives in `node:child_process`, available since Node 0.x. No new Node feature surface needed. |
| TypeScript | ≥5.7.0 (matches `sdk/package.json` `devDependencies`) | Type-checks new `VcsAdapterCommon.parallel` namespace + return shapes | Already shipped. New verb additions are pure interface extensions on `sdk/src/vcs/types.ts`. |
| pnpm | 11+ (matches `packageManager: pnpm@11.0.8`) | Workspace + dependency manager | Already shipped. No new packages to add. |
| `jj` binary | ≥0.41 (current floor) | Runtime backend for octopus structure + reap; invoked via `spawnSync` from `sdk/src/vcs/exec.ts` | Already shipped. The `octopus.ts` and `reap.ts` helpers were empirically verified on jj 0.41 (per file headers). A3 fix may push the floor higher — see "Version Compatibility" below. |
| `git` binary | upstream baseline | Runtime backend for `worktree add`/`merge --no-ff`/`worktree remove` chain currently inlined in `execute-phase.md` lines ~714+, to be lifted into `git.ts` `parallel.*` verbs | Already shipped. The lift is mechanical — copy the bash from `execute-phase.md` into `execGit(cwd, [...])` calls. |

### Supporting Libraries — already present, exhaustive

| Library / Module | Version | Purpose | Already-shipped consumer to extend |
|------------------|---------|---------|-----------------------------------|
| `node:child_process` (`spawnSync`) | bundled | Single-call shell-out backing every adapter invocation | `sdk/src/vcs/exec.ts` line 19. Already routes `vcs.workspace.add`, `vcs.workspace.merge`, every octopus + reap call. New `parallel.*` bodies call the same `vcsExec()` / `execGit()` wrappers — no new import surface. |
| `node:fs` (`mkdtempSync`, `rmSync`, `existsSync`, `mkdirSync`) | bundled | Workspace dir lifecycle | Already used by `sdk/src/vcs/jj/reap.ts` (the `rmSync` for empty-head dirs) and `sdk/src/vcs/backends/jj.ts:1049` (`mkdirSync` parent-dir prep before `workspace.add`). New git-backend `parallel.*` body needs the same primitives for symmetry. |
| `node:path` (`join`, `basename`, `dirname`) | bundled | Workspace-path composition (`.claude/jj-workspaces/<name>` on jj, `worktree-agent-<id>/` on git) | Already used by `octopus.ts:37` and `backends/jj.ts:1149`. |
| `node:os` (`tmpdir`) | bundled | Test-fixture temp dirs | Already used by `__tests__/jj-octopus.test.ts:21` and `__tests__/jj-reap.test.ts:22`. The new `parallel.*` test files copy this pattern verbatim. |
| `vitest` | ^3.1.1 (matches `sdk/package.json`) | Test runner | Already shipped. Has `describe.sequential.skipIf(!jjAvailable)(...)` (Pattern A from Phase 5 plan 05-05 flake-fix) which is the exact shape new `parallel.*` tests need — see "Testing Patterns" below. |
| `expect.extend` custom matcher `toBeIdOf('jj' \| 'git')` | shipped v1.2 at `tests/__tools__/vitest-matchers.ts` | Cross-backend id-shape assertion | Already shipped. New `parallel.*` tests can assert `expect(result.mergeChange).toBeIdOf('jj')` / `toBeIdOf('git')` without ad-hoc regexes. |

### Development Tools — already present

| Tool | Purpose | Already-shipped touchpoint to extend |
|------|---------|--------------------------------------|
| `scripts/lint-vcs-no-raw-git.cjs` | Whole-repo default-deny on `git` shell-outs | The current single allowlisted exception block in `execute-phase.md` lines ~714+ COLLAPSES TO ZERO once the `parallel.*` lift lands; remove the allowlist entry in `lint-vcs-no-raw-git.allow.json` as part of the close gate. |
| `scripts/lint-vcs-no-commit-id.cjs` | v1.2 architectural enforcer at 1032 files / 0 violations | New git-backend `parallel.*` body emits `commit_id` shapes (git's native id); new jj-backend body emits `change_id` (existing octopus.ts/reap.ts already do). Lint stays green by construction — but **add lint-test coverage** for the new file paths as part of the close gate (v1.2 retrospective Pattern: "Audit + lint must cover the same regex surface"). |
| `sdk/dist-cjs` build via `tsc -p tsconfig.cjs.json` | Dual-emit (ESM + CJS) so CJS-side `bin/lib/*.cjs` consumers can require the SDK | Already wired in `sdk/package.json` `build:cjs`. New `parallel.*` types in `types.ts` and impls in both backends emit through the existing pipeline — no build-script change. Verify post-build by checking `sdk/dist-cjs/vcs/backends/git.js` + `jj.js` carry the new functions; v1.2 retrospective Lesson 3 ("explicit grep-sweep over `.cjs` consumers AFTER TS rename") applies if any `.cjs` consumer wraps the new verbs. |

## Installation

```bash
# Nothing to install. Every primitive needed for v1.3 already ships in the
# repo. No `pnpm add ...` step in this milestone.
```

## Alternatives Considered

| Recommended (do nothing new) | Alternative | When the alternative would make sense |
|------------------------------|-------------|----------------------------------------|
| `spawnSync` via existing `vcsExec` / `execGit` wrappers | `node:child_process.spawn` (async) for parallel within-adapter dispatch | If we needed in-process parallel calls **from** the adapter (e.g., dispatch 3 `jj workspace add` calls simultaneously). We don't — parallelism happens at the Claude Code `Agent()` boundary OUT-OF-PROCESS, and `jj` working-copy contention (Phase 5 05-05 flake-fix) actively forbids concurrent jj calls against the same repo anyway. |
| `node:child_process` | `node:worker_threads` for race-condition reproduction in tests | If we couldn't reproduce race conditions any other way. We can: the existing `acquireJjWriteLock` test pattern + `describe.sequential` covers under-lock atomicity, and the git side's `.git/config.lock` contention pattern (referenced at `execute-phase.md:537`) is reproducible by running two `worktree add` calls in fast succession via existing `spawnSync` — no thread library needed. |
| `vitest` 3.1.1 built-in | Add `vitest-fixtures` / `@vitest/test-fixtures` style ecosystem libs | If shared fixture setup were heavyweight. It's not — `beforeAll` + `mkdtempSync` + `jj git init --colocate` (used in every jj test file today) is the established pattern and runs in <500ms per file. Adding a fixture lib would create a non-trivial upstream-rebase surface for zero gain. |
| Composite raw-git body inside `git.ts` `parallel.dispatch` | Extract raw-git body into a sidecar like `sdk/src/vcs/git/parallel.ts` mirroring `jj/octopus.ts` | If the git body grew >150 LOC OR if the body needed UPSTREAM-02 sidecar discipline (zero-conflict upstream-rebase surface). Neither holds: the git body is ~30 LOC (3 `execGit` calls), and it's NEW fork code with no upstream counterpart, so a sidecar would only add an import layer. **Keep it inline in `git.ts`.** Revisit if A3 colocated pre-commit fix grows the git body beyond ~80 LOC. |
| `child_process.spawnSync` per call | Long-lived `jj` REPL subprocess via `spawn` + stdin pipe (avoid startup overhead) | If startup overhead dominated wall-time. jj 0.41 cold-start is ~30-50ms per call; for v1.3's lifetime (3-5 `jj` calls per dispatch + 2-3 per fan-in), savings would be ~150-400ms total. Not worth the complexity surface (REPL state machine, deadlock recovery, stdin/stdout demuxing). |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `node:worker_threads` | The adapter is single-threaded by design — `vcsExec` is a serial `spawnSync` wrapper. Parallelism lives at the `Agent()` orchestration layer, OUT OF the adapter's process. Adding `worker_threads` here would conflate two architectural tiers and violate the existing `acquireJjWriteLock` invariant (one-writer-at-a-time on jj). | Existing `Agent(run_in_background: true)` dispatch with `isolation="worktree"` (git side) or `vcs.workspace.add()` per-subagent (jj side, via `octopus.createSubagentSlot`). |
| `child_process.exec` (the shell-string form) | Shell-string composition is the historical attack-surface root for raw-git/raw-jj injection in this codebase. v1.0 D-12 forbade it; the entire adapter uses argv-array `spawnSync` exclusively. | `vcsExec(cwd, 'jj', [...argv])` / `execGit(cwd, [...argv])` from `sdk/src/vcs/exec.ts`. New `parallel.*` bodies must follow the same argv-array discipline + `--` end-of-options separator for any user-influenced positional (cf. `octopus.ts:169` `bookmark create -r <rev> -- <name>`). |
| `simple-git`, `nodegit`, `isomorphic-git`, or any libgit2 binding | The whole-repo `lint-vcs-no-raw-git` default-deny is a default-deny on the literal string `git` AND on any in-process git access (per `project_no_raw_git`). Pulling in libgit2 / native-binding git would bypass the lint guard's intent AND add a heavy native dep that doesn't help with jj at all. | Continue shelling out to the `git` binary via `execGit`. |
| `jest`, `mocha`, `node:test` for new `parallel.*` suites | `node:test` is the upstream pattern for `tests/*.test.cjs` (legacy CJS surface) but the SDK side has been on `vitest` since v1.0 (vitest config at `sdk/vitest.config.ts`). Mixing runners adds a CI matrix surface for zero gain. Per `project_test_perf_pain_vitest`, perf pain is a separate concern not addressed by switching frameworks. | `vitest` with the established `describe.sequential.skipIf(!jjAvailable)` shape. |
| `execa` or `cross-spawn` | `spawnSync` works fine cross-platform for our use case (Linux/macOS CI matrix, no Windows path). `execa` adds a 200KB+ dep + Promise interface we don't want (the whole adapter is sync by D-12 convention). | `node:child_process.spawnSync` via existing `vcsExec` wrapper. |
| `tmp` / `tempy` for test fixtures | `mkdtempSync(join(tmpdir(), 'gsd-...'))` is the established pattern in every existing jj test file and does exactly what's needed. Adding a tmp-dir lib creates an unowned-by-anyone dependency surface. | Existing `node:fs.mkdtempSync` + `node:os.tmpdir()` pattern from `__tests__/jj-octopus.test.ts:21`. |

## Stack Patterns by Variant

**If the chosen A3 colocated pre-commit fix path is "synthetic hook bridge in adapter":**
- No version bumps. Add a private helper in `sdk/src/vcs/hook-bridge.ts` (already exists per `types.ts:266` — `HookStage` / `HookContext` types) that fires `.git/hooks/pre-commit` from `jj.ts` post-squash on detection of `.jj/.git`-colocation.
- Wire from the existing post-squash code path in `backends/jj.ts` `commit()` body; no new module.

**If the chosen A3 fix path is "wait for upstream jj":**
- Bump the floor jj version above 0.41 to whichever upstream release fixes it. Likely 0.42+ — verify against the jj-vcs/jj changelog at plan-time. Update CI matrix lane setup + `__tests__/*` `execSync('jj --version')` skip-gate to assert the new floor.

**If the chosen A3 fix path is "document and skip":**
- No code change. Document the gap in `agents/gsd-executor.md` / `references/worktree-path-safety.md` and ship.

**If `parallel.dispatch()` plan grows to need bulk-workspace pre-allocation:**
- Stay with sequential `vcsExec` calls — `describe.sequential` test discipline empirically prevents the jj working-copy contention that plagued Phase 5 05-05.
- DO NOT introduce async parallelism inside the adapter even if it looks like a clean dispatch loop. The performance ceiling is governed by jj cold-start × N subagents, not by adapter concurrency.

## Version Compatibility

| Package / Binary | Compatible With | Notes |
|------------------|-----------------|-------|
| `vitest@3.1.1` | TS 5.7+, Node ≥22 | `describe.sequential` (run blocks in declaration order, no concurrent within-file dispatch) verified in active suites at `sdk/src/vcs/__tests__/jj-octopus.test.ts:45`. Pattern A from Phase 5 plan 05-05 flake-fix. |
| `jj 0.41` | TypeScript adapter, Node ≥22 | Floor for v1.3 unless A3 fix path chooses "wait for upstream jj". Empirically verified primitives used by `octopus.ts` + `reap.ts`: `jj new -A <p> -B <m> --no-edit` (octopus.ts:217), `subject(exact:"…")` revset function (octopus.ts:159), `subject(glob:"…")` revset function (octopus.ts:249), `<parent>+ ~ <merge>` difference operator with `~` not `-` (octopus.ts:235 — explicit anti-Renovate-bump note), `jj diff --from <p> --to <h> -s` (reap.ts:61 — corrected form, NOT the `-r <h> --from <p>` form CONTEXT D-12 originally sketched). |
| `git` binary | upstream-tested baseline | `git worktree add` / `merge --no-ff` / `worktree remove` / `branch -D` already exercised by upstream + Phase 7 VCS-12 `workspace.merge` body. No new git verb introduced — the v1.3 git-backend `parallel.*` body composes verbs already in `git.ts`. |
| `@anthropic-ai/claude-agent-sdk@^0.2.84` | n/a | Agent dispatch lives outside the adapter; SDK version not a constraint on `parallel.*` verb shape. |

## Integration Points — Where the New Verbs Wire In

This section is for the roadmapper. It's not a stack recommendation but a stack-rooted map of which existing files the new verbs touch.

| Touchpoint | File | Role |
|------------|------|------|
| Adapter interface | `sdk/src/vcs/types.ts` | Add new namespace on `VcsAdapterCommon`: `parallel: { dispatch(plan): DispatchResult; fanIn(branches): FanInResult }`. Both backend interfaces (`GitVcsAdapter`, `JjVcsAdapter`) inherit through `VcsAdapterCommon`. Return shapes use the unified-revision model from v1.2 — `change_id` on jj, `commit_id` on git, both typed as `string` (the FLIP-01 `LogEntry.id`/`CommitResult.id` precedent). |
| jj backend body | `sdk/src/vcs/backends/jj.ts` (~1387 LOC) | New `parallel.dispatch` body imports `createPhaseStructure` + `createSubagentSlot` from `./jj/octopus.js` (already imported in spirit via `performJjReap` at line 33 — same import pattern). New `parallel.fanIn` body composes `workspace.merge` (Phase 7 VCS-12, already in jj.ts:1175) + `performJjReap` (line 33 import). Under `acquireJjWriteLock` RAII for atomicity, mirroring the existing `workspace.merge` body lines 1175-1235. |
| git backend body | `sdk/src/vcs/backends/git.ts` (~945 LOC) | New `parallel.dispatch` body wraps `execGit(cwd, ['worktree', 'add', ...])` (already used at line 572 in `workspace.add`). New `parallel.fanIn` body wraps `execGit(cwd, ['merge', '--no-ff', '-m', ..., branchRev])` (already used at line 678 in `workspace.merge`) + `execGit(cwd, ['worktree', 'remove', ...])` (line 645) + `execGit(cwd, ['branch', '-D', '--', name])` (line 692). All primitives already proven; the new code is composition, not invention. |
| Existing helpers (zero changes) | `sdk/src/vcs/jj/octopus.ts`, `sdk/src/vcs/jj/reap.ts` | Source code unchanged — they're already correct per their respective Phase 4/5 contract tests. Only their CALLER moves: from `jj-internal` test fixtures + (planned) orchestrator direct-use → from inside `backends/jj.ts` `parallel.*` verb bodies. The existing `__tests__/jj-octopus.test.ts` + `__tests__/jj-reap.test.ts` stay green by construction (they test the helpers directly, not via the new verbs). |
| Orchestrator rewire | `get-shit-done/workflows/execute-phase.md` (~1716 LOC) | Delete the raw-git `worktree add` / `merge --no-ff` / `worktree remove` blocks at lines 537-651 + ~714-810. Replace with single `gsd-sdk query vcs.parallel.dispatch ...` / `vcs.parallel.fan-in ...` calls. Pattern: same shape as v1.1 Plan 07-03 PROMPT-04 which deleted 242 LOC of dead raw-git fallback. The orchestrator stays `vcs.kind`-agnostic by design (PROMPT-05 invariant from v1.2). |
| CLI shim | `bin/gsd-sdk.js` + the CJS query layer | New `gsd-sdk query vcs.parallel.dispatch` / `vcs.parallel.fan-in` subcommands. Existing shim pattern from `worktree.cleanup-wave` (v1.1 Plan 07-02 — at `get-shit-done/bin/lib/worktree-safety.cjs:402`) is the template: argv → adapter call → JSON-serialized result on stdout. |
| Tests — backend contract | new `sdk/src/vcs/__tests__/parallel-{jj,git}.test.ts` (or parameterized) | Pattern A from Phase 5 plan 05-05: `describe.sequential.skipIf(!jjAvailable)` on the jj side; ordinary `describe` on the git side. Use `toBeIdOf('jj')` / `toBeIdOf('git')` for id-shape assertions (v1.2 D-02 custom matcher). Fixture pattern: `mkdtempSync` + `jj git init --colocate` for jj, `mkdtempSync` + `git init` for git. The existing `__tests__/jj-octopus.test.ts` is the structural template. |
| Tests — CI matrix | `.github/workflows/*.yml` | Add a new "parallel-path end-to-end" lane per PROJECT.md "CI parallel-path lane" goal; required-blocking on jj-colocated. Reuses the existing jj-colocated lane runner setup (no new tools, no new actions). |
| Lint allowlists | `lint-vcs-no-raw-git.allow.json` | DELETE the `execute-phase.md` allowlist entry once the lift is complete. The lint's first green run on `execute-phase.md` with zero allowlist entries IS the architectural close-gate proof (v1.2 retrospective Pattern: "Make the lint guard's first green run the architectural proof"). |

## Testing Patterns — vitest fixtures for git + jj parallel scenarios

These are not new deps — they're already-shipped vitest idioms used by `__tests__/jj-octopus.test.ts` and `__tests__/jj-reap.test.ts`. Restating here because the question specifically asked about parallel-scenario test patterns.

1. **`describe.sequential.skipIf(!jjAvailable)`** — Pattern A from Phase 5 plan 05-05. Use on every jj-side `parallel.*` test suite. Prevents within-file concurrent test dispatch which causes jj working-copy contention. The git side does NOT need this (git's `.git/config.lock` is OS-level kernel-enforced and forgiving of within-test sequencing).
2. **Per-block `mkdtemp` with random prefix** — Pattern B from Phase 5 plan 05-05, also already used at `__tests__/jj-octopus.test.ts:51-55`. Guards against parallel-test-FILE collisions on `/tmp`. Use shape: `mkdtempSync(join(tmpdir(), \`gsd-jj-parallel-${Math.random().toString(36).slice(2, 10)}-\`))`.
3. **Race-condition tests for `.git/config.lock` contention** — the `execute-phase.md:537` note ("simultaneous `git worktree add` calls race on `.git/config.lock`") is reproducible with two `spawnSync('git', ['worktree', 'add', ...])` calls in a tight loop. Pattern: assert one succeeds, the other returns a documented lock-contention error OR retries. **The new git-backend `parallel.dispatch` body should implement the same one-at-a-time discipline that `execute-phase.md:537` documents** ("CORRECT: one Agent() per message with run_in_background: true") — meaning the adapter takes the serialization responsibility, the orchestrator stops needing to know.
4. **Under-lock atomicity tests for jj** — Pattern from `jj-workspace.test.ts` / `jj-commit.test.ts` (existing `describe.sequential` suites). Use the existing `acquireJjWriteLock` helper from `sdk/src/vcs/jj/lock.ts` in the new `parallel.fanIn` body and assert lock acquisition + release in tests.
5. **`toBeIdOf('jj')` / `toBeIdOf('git')`** — v1.2 custom matcher at `tests/__tools__/vitest-matchers.ts`. Assert return-shape of `parallel.dispatch().parentChange` / `.mergeChange` / `.subagentHeads[]` and `parallel.fanIn().mergeRev` without backend-aware hex-vs-k-z regex branching.

## Sources

- `sdk/package.json` — verified deps (`vitest@^3.1.1`, `@types/node@^22.0.0`, `typescript@^5.7.0`) — HIGH confidence (source of truth, read this conversation)
- `package.json` — verified runtime deps (`@anthropic-ai/claude-agent-sdk@^0.2.84`, `ws@^8.20.0`); no test framework deps at top level — HIGH confidence
- `sdk/src/vcs/exec.ts` — verified `spawnSync` is the sole subprocess primitive (line 19, 106) — HIGH confidence
- `sdk/src/vcs/jj/octopus.ts` — verified zero npm imports; pure node + adapter-internal — HIGH confidence
- `sdk/src/vcs/jj/reap.ts` — verified zero npm imports; uses `node:fs` only — HIGH confidence
- `sdk/src/vcs/__tests__/jj-octopus.test.ts` lines 45, 51-55 — verified `describe.sequential.skipIf` + `mkdtemp` patterns in active use — HIGH confidence
- `sdk/src/vcs/backends/git.ts` lines 572, 645, 678, 692, 710 — verified all required `execGit` argv shapes already proven by `workspace.add` / `workspace.reap` / `workspace.merge` / `workspace.remove` — HIGH confidence
- `sdk/src/vcs/backends/jj.ts` line 33, 1175-1235, 1135-1157 — verified `performJjReap` import shape + `workspace.merge` under-lock RAII template + `workspace.reap` orchestrator-tier wrapper — HIGH confidence
- `get-shit-done/workflows/execute-phase.md` lines 537, 714-810 — verified the raw-git surface to lift (Agent-dispatch serialization rationale, the cleanup loop) — HIGH confidence
- `.planning/PROJECT.md` lines 13-29, 83-92 — milestone scope + carry-forwards — HIGH confidence
- `.planning/MILESTONES.md` lines 36-40 — v1.1 deferred follow-ups confirming this milestone's scope — HIGH confidence
- `.planning/RETROSPECTIVE.md` lines 20-48 — v1.2 lint-as-architectural-enforcer pattern + hard-rename-no-alias pattern (both apply to new `parallel.*` shape decisions) — HIGH confidence
- `project_a3_colocated_pre_commit_gap` memory (cited in PROJECT.md) — A3 fix path branches in "Stack Patterns by Variant" — MEDIUM confidence (memory snapshot; verify against Phase 4 LEARNINGS Open Q1 at planning time)
- `project_no_raw_git` memory — whole-repo default-deny rationale — HIGH confidence
- `project_test_perf_pain_vitest` memory — vitest is the established SDK runner; perf pain is orthogonal to v1.3 — HIGH confidence
- v1.2 `tests/__tools__/vitest-matchers.ts` referenced from RETROSPECTIVE line 15 — `toBeIdOf` matcher available — HIGH confidence

**Negative finding (HIGH confidence):** No new npm dependency is needed. I looked specifically for parallel-orchestration libs (`p-limit`, `p-queue`, `p-map`), race-condition libs (`async-mutex`, `proper-lockfile`), test-fixture libs (`tmp`, `tempy`, `@vitest/test-fixtures`), and subprocess-management libs (`execa`, `cross-spawn`). For each, the existing in-repo primitive already covers the use case better — see "What NOT to Use".

**Open question for roadmapper (not a stack question per se):** Final names for the two new verbs (`dispatch` / `fanIn` is the working set per PROJECT.md but explicitly "final names TBD by planner"). Stack-wise this is irrelevant — same imports, same primitives, same tests regardless of name. Flagging in case the planner wants to pre-decide before phase research opens.

---
*Stack research for: v1.3 cross-backend `vcs.parallel.*` adapter verbs*
*Researched: 2026-05-15*
