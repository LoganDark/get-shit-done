# Milestones

## v1.3 jj octopus merge for subagents fully functional (Shipped: 2026-05-24)

**Phases completed:** 6 phases, 34 plans, 56 tasks

**Key accomplishments:**

- Extracted `enumerateConflictedPaths` into the `sdk/src/vcs/jj/conflict-paths.ts` UPSTREAM-02 sidecar, extended `performJjReap`'s classifier from 2 → 3 branches with a new `'merge-in-tree-conflict'` emitter, and tightened `incomplete-work.ts` to reject unknown `reason` values at parse time — closing the wave-2 gate from plan 01 and providing the conflict-paths helper that plan 03's `jj/parallel.ts` will consume.
- Composition file `sdk/src/vcs/jj/parallel.ts` and JjVcsAdapter wire-in — `workspace.parallel.{dispatch,fanIn}` shipped, UPSTREAM-02 sidecar discipline preserved, W1 (agentId pre-write validation) + W3 (a) (octopus-conflict joint-assertion producer) gates live.
- GitVcsAdapter satisfies the cross-backend `VcsWorkspaceParallel` interface via a throwing-stub `Object.freeze({dispatch, fanIn})` — both members raise `VcsNotImplementedError` with a Phase 10 breadcrumb, closing the wave-2 compile gate left open by plan 09-01.
- One-liner:
- One-liner:
- 1. [Combined Tasks 1 and 2 into a single commit]
- 1. [Rule 3 — File-local convention] Preserved 2-space indentation in backends/git.ts despite tabs project preference
- 1. [Rule 1 - Bug] Fixed git `workspace.add` ignoring the `name` field
- STEP 1 gate (CR-01/SC2):
- Before:
- 1. [Rule 1 - Bug] Plan-suggested filter pattern would never match
- Ship the new VCS-20 `workspace.assert-dispatched-cwd` SDK verb plus CLI bridges for the existing Phase 9/10 `vcs.workspace.parallel.{dispatch,fanIn}` adapter verbs — three thin handlers mirroring `head-ref.ts`'s shape, registered through both the static catalog and the non-family manifest, surfaced through `gsd-sdk query` with `mutation` and `outputMode: 'json'` set correctly.
- executeWorktreeWaveCleanupPlan body collapses from a 7-verb per-entry guard loop to a single `vcs.workspace.parallel.fanIn` delegation; ADR-0004 `_deps={}` seam preserved; cmdWorktreeCleanupWave CLI alias retired; tests flipped to the adapter-mock boundary.
- 1. [Rule 1 - LOC delta target was a planner estimate, not a load-bearing acceptance]
- Deleted the inline raw-git parallel-dispatch + worktree-cleanup blocks from `get-shit-done/workflows/execute-phase.md` and replaced them with cross-backend `gsd-sdk query workspace.parallel.{dispatch,fan-in}` shell wrappers. WAVE_WORKTREE_MANIFEST mktemp variable eliminated per Phase 11 D-01 (Handle JSON in shell variable only — no file on disk). `<worktree_branch_check>` orchestrator-side templating block removed; per-Agent dispatched-cwd safety now lives entirely in `gsd-executor.md` (per Plan 11.4). Sequential one-Agent-per-message dispatch pattern preserved (Pitfall 5 + D-07). Stall-surveillance probes (#3212) and ORCHESTRATOR RULE preserved untouched.
- None.
- Closed VERIFICATION.md CR-01 BLOCKER (the verb halted every jj agent because `safeRealpath(WorkspaceInfo.path)` compared an fs realpath against a workspace NAME on jj), CR-04 WARNING (FATAL branch had no diagnostic dump), and WR-03 INFO (dispatch-cwd-safety.md documented backend asymmetry as a known wart). Backend-opaque cross-backend contract restored. VCS-20 and PROMPT-08 ready to flip BLOCKED → SATISFIED.
- Closed VERIFICATION.md CR-02 and CR-03 BLOCKERs. The Phase 11 `quick.md` rewire shipped by Plan 11-06 was structurally correct but silently broken in three independent ways at lines 670-675: wrong plan-JSON shape, non-numeric `--phase "quick"`, and a FATAL guard that missed `{ok:false}` payloads. Additionally both `quick.md` and `execute-phase.md` lacked an EXPECTED_BRANCH empty/HEAD pre-check, letting `validateMainBookmark` (jj/parallel.ts:121-125) surface a Node stack trace on detached HEAD. All four invariants are now in place and pinned by `tests/quick-md-parallel-dispatch.test.cjs` (7/7 green). PROMPT-07 advances from BLOCKED → SATISFIED; PARALLEL-06 advances from PARTIAL → SATISFIED at the SC-2b/CR-02 workflow-exercise level.
- Selected: Option A — case removed entirely.
- Closed run-1 BLOCKER cluster A: the parallel-dispatch invocation in `get-shit-done/workflows/execute-phase.md` is now structurally functional on both dimensions. Constructed `WAVE_WORKTREE_PLANS_JSON` from the `WAVE_WORKTREE_PLANS` plan-id accumulator via a `printf | jq -R . | jq -sc 'map({agentId, planId})'` pipeline matching the workspace-parallel-dispatch.ts:73 contract. Replaced the literal workflow-substitution placeholder `--phase "{phase_number}"` (which bash does NOT expand inside a fenced bash block — the verb saw the 14-character literal string and returned `{ok:false, reason:'phase_number_required'}`) with the established bash-variable form `--phase "${PHASE_NUMBER}"`. Extended the existing `tests/quick-md-parallel-dispatch.test.cjs` `EXEC` carry-over describe-block with three new assertions (plan-shape, numeric --phase, accumulator-source) that would have caught both BLOCKERs at commit time — verified load-bearing by reverting the fix via `jj restore --from @-- ...` and confirming all three new tests fail. Pre-existing 7 tests stay green; regression net is now symmetric across QUICK and EXEC for all three CR-02 sub-invariants.
- Closed VERIFICATION.md (re-verification pass 2) PROMPT-08 BLOCKER + class-wide regression-test gap. `agents/gsd-executor.md` is now raw-git-free at the read-side surface — `git rev-parse --show-toplevel` retired from line 431 in favor of a jq read of `primaryWorkspacePath` from the SDK verb's envelope. New `tests/agent-prompts-no-raw-git.test.cjs` pins the READ-ONLY raw-git deny-list at the agent-prompt-file layer with a narrow-by-design regex that does not false-fire on the preserved `<destructive_git_prohibition>` block. PROMPT-08 / VCS-20 ready to flip BLOCKED → SATISFIED on verifier re-run.
- ROADMAP Phase 12 SC2/SC3 and REQUIREMENTS HOOK-06/HOOK-07 rewritten from git's `.git/hooks/pre-commit` namespace to the GSD-managed `.githooks/pre-commit` convention that the jj adapter's `fireHook` actually shells.
- HOOK-07 regression test in the jj-colocated block of jj-hooks.test.ts — a counter-hook body proves vcs.commit() fires .githooks/pre-commit exactly once per commit across two independent commits, locking the already-shipped Path 1 fix against a future double-fire.
- ROADMAP SC2/SC3, CONTEXT.md D-08 + Phase Boundary, and REQUIREMENTS LINT-04/CI-06 re-baselined from a false "zero raw-git hits" assertion to a baseline-regression-guard framing built on the verified 127-hit baseline.
- `scripts/audit-workflow-raw-git.cjs` ships as the LINT-04 deliverable — a stdout-only baseline-regression guard that scans bash/sh/zsh markdown fences under `workflows/`, `references/`, and `agents/`, carries the frozen per-file 127-hit baseline as an `Object.freeze`d constant, and exits non-zero only when a file's raw-git count exceeds its baseline — backed by a 7-case `node:test` unit test.
- `scripts/e2e-parallel-phase.sh` — a 357-line bash harness that drives the `workspace.parallel.{dispatch,fan-in}` CLI bridges against a throwaway colocated repo for both `git` and `jj-colocated` backends, asserting 6 per-backend lane criteria including the Phase 12 A3 hook-fire proof, and contains zero raw `git` (LINT-05 +1 budget intact).
- Standalone `parallel-e2e.yml` CI lane runs the synthetic 2-plan parallel phase end-to-end on git and jj-colocated, runs the CI-06 raw-git-in-markdown audit, and enforces required-blocking on jj-colocated via a `needs:`-gated `parallel-e2e-gate` job; the LINT-05 allowlist +1 diff is recorded for the v1.3 close commit.
- Install template parallelization block flattened to flat boolean `true` (was nested 6-key object); this repo's `.planning/config.json` flipped permanently from `false` to `true` so Phase 14's dogfood (Plan 05) can dispatch.
- Fourth validation envelope (`parallelization_disabled`) added to the `workspace.parallel.dispatch` CLI bridge with strict-equal-`false` brownfield safety, plus 6 D-03 mitigation contract tests across both backend test files.
- Ships the runnable recovery script for Phase 14's dogfood snapshot — `bash scripts/dogfood-restore.sh <pre-op-id> <tarball-path>` converts the Pitfall 10 manual op-restore + tar untar cliff to a single invocation. Empirical rehearsal in Plan 14-04 validates the ordering and default restore-scope choice.
- `scripts/dogfood-rehearse.sh` exercises `scripts/dogfood-restore.sh` against a synthetic-dirty `cp -a` clone of THIS repo; three assertions green (`diff-summary-matches-baseline`, `bookmark-gone`, `state-md-restored`) prove the recovery primitive is ready for the real Plan 14-05 dogfood.
- `scripts/dogfood-phase-14.sh` ran end-to-end against THIS repo on isolated bookmark `gsd/phase-14-dogfood`; jj-cell dispatch_ms=6209 / fan_in_ms=780 / conflict_count=0 and git-cell dispatch_ms=390 / fan_in_ms=1276 / conflict_count=0; main bookmark unchanged (`umkprsyvnxwq` ≡ `umkprsyvnxwq`, Pitfall 10 blast-radius bounded); recovery anchor (pre_op_id=`9db977b62aca…`, tarball SHA-256=`873522cf59a7…`) durable in two surfaces.

---

## v1.2 jujutsu is change-only — never commit id anywhere (Shipped: 2026-05-15)

**Phases completed:** 1 phases, 3 plans, 18 tasks

**Key accomplishments:**

- Audit script emits .md + JSON sidecar (D-01 single-source-of-truth) classifying 101 commit_id-reachable sites into 7 closed verdict buckets, plus the lint-vcs-no-commit-id scanner with shared per-entry allowlist parser (D-03/D-04 — expires dropped) — all gated for Plan 2's FLIP
- Unified revision contract delivered: every cross-backend VcsAdapter verb on the jj backend now emits change_id (k-z alphabet) per the FLIP-01..04 surface flip; LogEntry.id + CommitResult.id hard-renamed with NO alias; custom toBeIdOf vitest matcher landed for cross-backend test ergonomics (D-02); golden-parity baselines re-recorded confirm git backend is unaffected.
- v1.2 milestone closed: the cross-backend VcsAdapter exposes ONE revision concept (commit_id on git, change_id on jj); jj backend never volunteers commit_id from any cross-backend verb; architectural enforcement via lint guard now active in CI + pretest, with first green run validating Plan 2's FLIP completed cleanly.

---

Record of shipped milestones for the GSD jj-port fork.

---

## v1.1 — first upstream sync

**Shipped:** 2026-05-14
**Phases:** 1 (Phase 7)
**Plans:** 5 of 5 completed (100%)
**Stats:** 21 commits, 35 files modified, +6,615 / -331 LOC, 1-day milestone

**Goal:** Reconcile fork capabilities with the upstream code surface brought in by the May 2026 merge — fill the adapter gaps the merge exposed and bring new upstream test surfaces green on jj.

**What landed:**

- **Plan 07-01:** Eight new `VcsAdapter` verbs across types + git + jj backends (VCS-08..VCS-15): `refs.bookmarks.currentIn`, `refs.mergeBase` (returns `change_id` on jj via `fork_point(x)` revset), `diff({ diffFilter })` with typed enum, `status({ cwd })` scoped variant, `workspace.merge` (2-parent `jj new` with atomic main-bookmark advance + agent-bookmark delete per D-03), `workspace.remove` (forget + `fs.rm -rf`), `refs.bookmarks.delete({ force })`, plus a planner-judgment fold-in of `refs.readBlob` (VCS-15) needed by Plan 04. 100 new tests pass on both backends.
- **Plan 07-02:** Wave-cleanup executor at `get-shit-done/bin/lib/worktree-safety.cjs:402` rewritten from `{ ok: false, reason: 'not_implemented_in_jj_port' }` stub to real ~80 LOC orchestration through the new verbs. Manifest schema widened with optional `main_bookmark` field + fallback resolution via `currentBookmarksIn`. WAVE-01 closes.
- **Plan 07-03:** Hard-deleted 242 LOC of dead raw-git fallback bodies from `execute-phase.md` (-117) and `quick.md` (-125). The `if command -v gsd-sdk … else <raw-git> fi` wrappers collapse to a single unconditional `gsd-sdk query worktree.cleanup-wave` line. PROMPT-04 closes.
- **Plan 07-04:** `scripts/changeset/github-release-notes.cjs` migrated from `cp.execFileSync('git', …)` to cross-backend `vcs.refs.exists` + `vcs.diff` + `vcs.refs.readBlob` (first production consumer of VCS-15). Inline `vcs-lint:allow-git-here` annotation dropped; lint guard clean repo-wide. MIGR-05 closes.
- **Plan 07-05:** Strict-green test-surface triage achieved 150/150 pass on both git and jj-colocated backends across the 9 new upstream test files (installer-migrations, shell-command-projection + bug-3413/3441/3442, query-raw-output-projection). Single delta: `execGit` upstream block carved out via `describe.skip` because the fork removed the raw-git helper per `project_no_raw_git`. TEST-09/10/11 close. D-16 8th-verb escape hatch was NOT engaged.

**Known follow-ups** (deferred to v1.2):

- **Orchestrator parallelization rewrite** — `get-shit-done/workflows/execute-phase.md` lines ~714+ still uses raw-git `worktree add`/`merge --no-ff`/`worktree remove` for parallel agent dispatch. CONTEXT D-12 described the future-intended fan-in path via `sdk/src/vcs/jj/octopus.ts` + `reap.ts` but the orchestrator hasn't been rewired. `parallelization: true` was flipped on briefly mid-execute, then reverted to false when the gap surfaced; tracked in `07-CONTEXT.md` Deferred Ideas and in the `project_no_parallelization_yet` memory.
- **Change-id-only on jj adapter surface** — see `SEED-001`. The adapter currently exposes both `change_id` and `commit_id` on jj depending on the verb (Plan 02 hit the cross-namespace pain). Move `commit_id` behind a `vcs.jjOnly.commitIdOf` escape hatch; make `change_id` canonical on the cross-backend surface. Targeted v1.2 candidate.
- **A3 colocated pre-commit gap** (inherited from v1.0) — jj 0.41 doesn't auto-fire `.git/hooks/pre-commit` after `jj squash` in colocated mode. Three fix paths documented in Phase 4 LEARNINGS Open Q1; still not addressed.

**Other notable deviations** (per per-plan SUMMARY.md files):

- Plan 02 discovered that `workspace.merge`'s built-in agent-bookmark delete doesn't cover all cases — git `branch -D` fails silently while the worktree is still checked out — so the executor calls `bookmarks.delete({ force: true })` as an explicit cleanup step. Plan 01's contract test had a gap that Plan 02 caught.
- Plan 02 had to relax its happy-path cross-backend assertion from strict-equivalence to presence-only because `workspace.merge` returns a `change_id` (per D-05) but `bookmarks.list().rev` returns a `commit_id` — the cross-namespace pain that became SEED-001's motivation.
- Plan 04 swapped planner-specified `expr.rev` calls for `expr.bookmark` because `expr.rev` validates hex-shape (SHA / change_id), but `github-release-notes.cjs`'s input domain is git refnames (tag names, branch names).
- Plan 05's "strict-green" close-gate held on the first attempt: no Phase 7.1 INSERTED needed.

---

## v1.0 — Port GSD from git-only to dual-backend (git + jj)

**Shipped:** 2026-05-14
**Phases:** 8 (1, 2, 2.1, 3, 03.1, 4, 5, 6)
**Plans:** 53 of 56 completed
**Progress:** 100% (milestone-complete via Phase 6)

**Goal:** Every upstream GSD command works correctly on a jj-only repo without git — full GSD workflow on a jj backend with no degradation in behavior or test coverage.

**What landed:**

- **Phase 1**: VcsAdapter interface + git backend (byte-identity baselines, parameterized test harness, no-raw-git lint guard).
- **Phase 2**: Bulk call-site migration of every `execSync('git …')` in `sdk/src/query/*.ts` and `bin/lib/*.cjs` to the adapter.
- **Phase 2.1** (inserted): VCS abstraction audit — dropped git-only concepts (`expr.commit` → `expr.rev`, `currentBranch` → `currentBookmarks`, `gitDir`/`gitCommonDir` → `gitOnly` namespace).
- **Phase 3**: jj backend core — squash-based commit model, refs, conflict revset; jj-colocated CI lane active as allow-failure.
- **Phase 03.1** (inserted): test perf — vitest parallelism baseline.
- **Phase 4**: Workspaces + octopus structure + hooks (jj `workspace.{add,forget,prune,reap}`, pre-commit/pre-push wiring, SDK `hooks.fire` bridge).
- **Phase 5**: Command translations + brownfield validation + CI hardening; CI matrix graduates jj lane to required-blocking.
- **Phase 6**: Brownfield jj migration — sticky `vcs.adapter` flip, `.planning/` SHA→change_id rewriter, `/gsd-migrate-vcs` command, B-01..B-09 SDK safety fixes.

**Known follow-ups** (deferred to v1.1, now mostly addressed):

- ~~Wave-cleanup executor needs adapter verbs to replace upstream's raw-git path (stubbed in `worktree-safety.cjs`).~~ **Addressed in v1.1 Plan 07-02.**
- ~~Workflow `.md` raw-git fallbacks remain in source as unreachable code; drop once adapter verbs land.~~ **Addressed in v1.1 Plan 07-03.**
- ~~`scripts/changeset/github-release-notes.cjs` lint-annotated as dev-only.~~ **Addressed in v1.1 Plan 07-04 (migrated to cross-backend adapter).**
- A3 colocated pre-commit gap (jj 0.41 doesn't auto-fire `.git/hooks/pre-commit` after `jj squash` in colocated mode) — 3 fix paths documented in Phase 4 LEARNINGS Open Q1. **Still open; carries into v1.2.**
