---
phase: 09-jj-side-parallel-verbs
verified: 2026-05-15T16:10:00Z
status: passed
score: 6/6 must-haves verified
overrides_applied: 0
---

# Phase 9: jj-side Parallel Verbs Verification Report

**Phase Goal:** jj backend exposes the new `vcs.workspace.parallel.*` verb surface (composed from already-shipped `octopus.ts` + `reap.ts` + `workspace.merge` primitives) and the reap classifier extends to surface in-tree-conflicts. PARALLEL-03 (liveness) and PARALLEL-04 (repo-scoped lock) are dropped per `09-CONTEXT.md` D-01/D-02.

**Verified:** 2026-05-15T16:10:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| #   | Truth (ROADMAP Success Criterion)                                                                                                                                                                                                              | Status     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SC1 | `gsd-sdk query workspace.parallel.dispatch` on a jj fixture creates N workspaces via `octopus.createPhaseStructure` + N× `createSubagentSlot`.                                                                                                 | ✓ VERIFIED | `sdk/src/vcs/jj/parallel.ts:192` calls `createPhaseStructure(mainRepoRoot, '@-', phaseNumber)`; `:204-222` dispatch loop calls `createSubagentSlot(...)` per plan item. Test `cmd-parallel-jj.test.ts` lines 125-176 dispatch N ∈ {2,3,4} workspaces and asserts `handle.workspaces.length === N` plus distinct change_ids. All three pass (4140ms / 4556ms / 5893ms).                                                                |
| SC2 | `gsd-sdk query workspace.parallel.fan-in` on a jj fixture produces a single N-parent octopus merge + batched bookmark delete in one operation; `surplusBookmarks` is empty on both N=2 and N=4 contract scenarios.                             | ✓ VERIFIED | `parallel.ts:358-371` builds N-parent `jj new -r @ -r <p1> -r <p2> ...` argv (single invocation). `parallel.ts:458-462` issues ONE batched `jj bookmark delete -- <names>` call. Tests assert `result.surplusBookmarks.length === 0` on N=2/3/4 clean scenarios (lines 173-176). All pass.                                                                                                                                          |
| SC3 | New `VcsWorkspaceParallel` interface compiles + dist-cjs emits both new verbs; `ParallelDispatchHandle.workspaces[].baseRev` JSDoc states change_id stability semantics across `jj rebase`. `ParallelDispatchHandle` is frozen pure JSON.       | ✓ VERIFIED | `types.ts:453-456` declares `VcsWorkspaceParallel` with both verbs. `types.ts:502-507` carries D-14 canonical JSDoc: "`change_id on jj; stable across jj rebase. commit_id on git; stable across git rebase. ... rebase-stable revision pointer ... (PARALLEL-05, D-14.)`". `dist-cjs/vcs/jj/parallel.js` exports `performJjParallelDispatch` AND `performJjParallelFanIn` (grep count = 4). `parallel.ts:270-289` `Object.freeze`s outer handle + each workspace entry. |
| SC4 | `IncompleteWorkEntry.reason` enum widens from 1 → 2 values; jj-side conflict probe via `vcs.refs.conflicts()` revset wired into `performJjReap`.                                                                                                | ✓ VERIFIED | `types.ts:259`: `reason: 'crashed-with-uncommitted-work' \| 'merge-in-tree-conflict'`. `reap.ts:88` adds `hasInTreeConflict` helper using `'log -r conflicts() & <head>' ...`. `reap.ts:228` emits `reason: 'merge-in-tree-conflict'` in new classifier branch. Tests cover both reason values.                                                                                                                                       |
| SC5 | `WAVE_WORKTREE_MANIFEST` carries `plan_id`, `agent_id`, `backend` fields; existing v1.1 consumers (worktree-safety.cjs) read it without behavior change.                                                                                       | ✓ VERIFIED | `parallel.ts:254-264` writes manifest body with `agent_id`, `plan_id`, `backend: 'jj' as const`, `worktree_path`, `branch: worktree-agent-${agentId}`, `expected_base`, `main_bookmark`. `validateAgentId` (regex `/^[A-Za-z0-9._/-]+$/`) called BEFORE manifest write (lines 180-182) so `worktree-safety.cjs:334` reader cannot silently drop entries.                                                                            |
| SC6 | TEST-14 topology assertion: `jj log -r 'divergent()' --no-graph` empty post-fanIn for N ∈ {2, 3, 4}.                                                                                                                                            | ✓ VERIFIED | `cmd-parallel-jj.test.ts:184-194` runs `jj --repository ${dir} log -r 'divergent()' --no-graph -T 'change_id ++ "\n"'` and asserts `.trim() === ''`. Runs inside each per-N `describe.sequential.skipIf(!jjAvailable)` block (W2 per-N lifecycle) for N ∈ {2,3,4}. All three pass.                                                                                                                                                  |

**Score:** 6/6 ROADMAP success criteria verified.

### Required Artifacts

| Artifact                                              | Expected                                                                            | Exists | Substantive | Wired | Data Flows | Status     |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------- | ------ | ----------- | ----- | ---------- | ---------- |
| `sdk/src/vcs/types.ts`                                | 5 new exports + `VcsWorkspace.parallel` + tightened `IncompleteWorkEntry.reason`    | ✓      | ✓ (688 LOC) | ✓     | ✓          | ✓ VERIFIED |
| `sdk/src/vcs/jj/conflict-paths.ts`                    | UPSTREAM-02 sidecar export `enumerateConflictedPaths(cwd, rev)`                     | ✓      | ✓ (73 LOC)  | ✓     | ✓          | ✓ VERIFIED |
| `sdk/src/vcs/jj/reap.ts`                              | 3-branch classifier with `hasInTreeConflict` helper                                 | ✓      | ✓           | ✓     | ✓          | ✓ VERIFIED |
| `sdk/src/vcs/jj/incomplete-work.ts`                   | `KNOWN_REASONS` parse-time validator (JSONL format per CR-01 fix)                   | ✓      | ✓           | ✓     | ✓          | ✓ VERIFIED |
| `sdk/src/vcs/jj/parallel.ts`                          | `performJjParallelDispatch` + `performJjParallelFanIn` composition layer            | ✓      | ✓ (543 LOC) | ✓     | ✓          | ✓ VERIFIED |
| `sdk/src/vcs/backends/jj.ts`                          | `workspace.parallel = Object.freeze({ dispatch, fanIn })` wire-in                   | ✓      | ✓           | ✓     | ✓          | ✓ VERIFIED |
| `sdk/src/vcs/backends/git.ts`                         | Throwing `parallel: Object.freeze({...})` stub with Phase 10 breadcrumb             | ✓      | ✓           | ✓     | n/a        | ✓ VERIFIED |
| `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts`       | TEST-13 + TEST-14 contract suite (≥ 250 LOC; 412 actual; W2/W3 lock-in)             | ✓      | ✓ (429 LOC) | ✓     | ✓          | ✓ VERIFIED |

### Key Link Verification

| From                              | To                                  | Via                                                                          | Status   | Details                                                                                                                                                                                                                                                                              |
| --------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `backends/jj.ts`                  | `jj/parallel.ts`                    | `import { performJjParallelDispatch, performJjParallelFanIn } from '../jj/parallel.js'` + `workspace.parallel: Object.freeze({...})` wire-in | ✓ WIRED  | `backends/jj.ts:34` imports both verbs; `:1257-1263` wires `parallel: Object.freeze({dispatch, fanIn})` inside `workspace = Object.freeze({...})` block.                                                                                                                              |
| `backends/git.ts`                 | `types.ts`                          | `VcsNotImplementedError` import                                              | ✓ WIRED  | `backends/git.ts:31` imports `VcsNotImplementedError`; `:723-731` throws on `dispatch` and `fanIn` with "Phase 10" breadcrumb (count = 2).                                                                                                                                            |
| `jj/parallel.ts`                  | `jj/octopus.ts`                     | `createPhaseStructure` + `createSubagentSlot` composition                    | ✓ WIRED  | `parallel.ts:48` imports both; `:192, 207` invokes them.                                                                                                                                                                                                                              |
| `jj/parallel.ts`                  | `jj/reap.ts`                        | `performJjReap` call from `fanIn`'s crashed branch                           | ✓ WIRED  | `parallel.ts:49` imports `performJjReap`; `:523` invokes for crashed agents.                                                                                                                                                                                                          |
| `jj/parallel.ts`                  | `jj/conflict-paths.ts`              | `enumerateConflictedPaths` for `FanInResult.conflictedPaths` population      | ✓ WIRED  | `parallel.ts:50` imports; `:405` invokes (gated on `conflicts()` revset probe to avoid WR-04 sentinel false-positive — plan 05 bug-fix 2).                                                                                                                                            |
| `jj/parallel.ts`                  | `jj/incomplete-work.ts`             | `appendIncomplete` for W3(a) merge-in-tree-conflict queue entry              | ✓ WIRED  | `parallel.ts:51` imports `appendIncomplete`; `:424` invokes inside `if (conflicted) {...}` branch.                                                                                                                                                                                    |
| `jj/parallel.ts`                  | `parse/jj-workspace-list.ts`        | `parseJjWorkspaceList` for re-resolved-current-head map (plan 05 fix 1)      | ✓ WIRED  | `parallel.ts:52, 342` — re-resolves `@` per workspace before N-parent merge. Bug-fix prevents merging empty dispatch-time slot heads.                                                                                                                                                  |
| `jj/reap.ts`                      | `jj/conflict-paths.ts`              | `enumerateConflictedPaths` for new conflict-classifier branch                | ✓ WIRED  | `reap.ts:32` imports; new branch invokes within the `hasInTreeConflict` true path.                                                                                                                                                                                                     |
| `cmd-parallel-jj.test.ts`         | `backends/jj.ts`                    | `createJjAdapter(dir).workspace.parallel.{dispatch,fanIn}` call surface      | ✓ WIRED  | Test imports `createJjAdapter`; exercises both verbs end-to-end across N ∈ {2,3,4} clean + conflict + crashed scenarios.                                                                                                                                                              |
| `cmd-parallel-jj.test.ts`         | `jj/incomplete-work.ts`             | `readIncomplete` to assert queue contents in D-16 joint assertion            | ✓ WIRED  | `cmd-parallel-jj.test.ts:281` reads queue and asserts `reason === 'merge-in-tree-conflict'`.                                                                                                                                                                                          |

### Sidecar Discipline (UPSTREAM-02)

| File                              | `from '../backends/jj'` import count | Status |
| --------------------------------- | ------------------------------------ | ------ |
| `sdk/src/vcs/jj/parallel.ts`      | 0                                    | ✓ CLEAN |
| `sdk/src/vcs/jj/conflict-paths.ts` | 0                                    | ✓ CLEAN |
| `sdk/src/vcs/jj/reap.ts`          | 0 (pre-existing)                     | ✓ CLEAN |

### Behavioral Spot-Checks

| Behavior                                                          | Command                                                                                                          | Result                                | Status   |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------- | -------- |
| TypeScript compiles cleanly                                       | `cd sdk && pnpm exec tsc --noEmit`                                                                               | exit 0 (no output)                    | ✓ PASS   |
| Contract test suite + reap regression suite green                 | `pnpm exec vitest run --reporter=verbose --no-coverage src/vcs/__tests__/cmd-parallel-jj.test.ts src/vcs/__tests__/jj-reap.test.ts` | 12/12 tests pass (7 cmd-parallel-jj + 5 jj-reap; 27.84s) | ✓ PASS   |
| commit_id lint (D-14 wording must live in JSDoc only)             | `node scripts/lint-vcs-no-commit-id.cjs`                                                                         | 1036 files / 0 violations             | ✓ PASS   |
| dist-cjs emits new parallel verbs (SC3)                           | `grep -c "performJjParallel" sdk/dist-cjs/vcs/jj/parallel.js`                                                    | 4                                     | ✓ PASS   |
| `VcsWorkspaceParallel` / `FanInResult` exposed in .d.ts (SC3)     | `grep -c "VcsWorkspaceParallel\|FanInResult" sdk/dist-cjs/vcs/types.d.ts`                                        | 5                                     | ✓ PASS   |

### Probe Execution

No phase-declared shell probes (`scripts/*/tests/probe-*.sh`) for Phase 9 — the load-bearing behavioral gates are the vitest contract tests, which all pass.

### Requirements Coverage

| Requirement     | Source Plan        | Description                                                                                                                                            | Status      | Evidence                                                                                                                            |
| --------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| PARALLEL-01     | 09.02, 09.03       | `vcs.workspace.parallel.dispatch(plan): ParallelDispatchHandle` ships on jj (Phase 10 ships git side).                                                 | ✓ SATISFIED | `parallel.ts:164-290` body; `backends/jj.ts:1257-1260` wire-in. Test SC1 confirms N workspaces materialize.                          |
| PARALLEL-02     | 09.03              | `vcs.workspace.parallel.fanIn(handle, results): FanInResult` ships on jj with single N-parent `jj new` + batched bookmark delete.                     | ✓ SATISFIED | `parallel.ts:308-543` body. Test SC2 confirms single N-parent merge + batched delete; `surplusBookmarks.length === 0` across N=2/3/4. |
| PARALLEL-05     | 09.01              | `ParallelDispatchHandle.workspaces[].baseRev` JSDoc documents rebase stability.                                                                        | ✓ SATISFIED | `types.ts:502-507` carries canonical D-14 wording (`change_id on jj`, `commit_id on git`, `rebase-stable`, `(PARALLEL-05, D-14.)`).  |
| VCS-16          | 09.01, 09.04       | New `VcsWorkspaceParallel` interface in `types.ts` exposing `dispatch` + `fanIn` under `VcsWorkspace.parallel`.                                       | ✓ SATISFIED | `types.ts:453-456` declares interface; `:439` adds `parallel: VcsWorkspaceParallel` to `VcsWorkspace`.                              |
| VCS-17          | 09.01, 09.03       | New `sdk/src/vcs/jj/parallel.ts` composition layer over `octopus.ts` + `reap.ts`; UPSTREAM-02 sidecar discipline (no `backends/jj.ts` import).        | ✓ SATISFIED | File exists at 543 LOC; sidecar grep count = 0; inline `jjArgvFlags` at `:60-62` and `resolveChangeId` at `:68-80`.                  |
| VCS-19          | 09.01, 09.03       | `WAVE_WORKTREE_MANIFEST` schema extension: adds `plan_id`, `agent_id`, `backend` fields; backwards-compatible with worktree-safety.cjs reader.        | ✓ SATISFIED | `parallel.ts:254-264` writer emits all three fields; W1 `validateAgentId` (line 92) gates against worktree-safety.cjs:334 character class. |
| TEST-13 (jj)    | 09.05              | jj contract tests at `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts`: N=2/3/4 dispatch + clean fanIn + in-tree-conflict + crashed-worker scenarios.   | ✓ SATISFIED | 7 tests in file; all pass on machine with `jj` available. W2 per-N describe lifecycle; W3(a) D-16 joint assertion in ONE `it` block. |
| TEST-14         | 09.05              | Topology assertion: post-fanIn `jj log -r 'divergent()' --no-graph` MUST be empty for N ∈ {2,3,4}.                                                    | ✓ SATISFIED | `cmd-parallel-jj.test.ts:184-194` asserts `.trim() === ''` inside each per-N describe; all three pass.                              |

**REQUIREMENTS.md cross-reference (lines 109-131):** All 8 Phase 9 requirements mapped to this phase are marked Complete and verified present in code.

**Orphaned requirements:** None. PARALLEL-03 and PARALLEL-04 were dropped at Phase 9 discuss-phase (REQUIREMENTS.md:111-112) per `09-CONTEXT.md` D-01/D-02 — correctly out of scope for this phase.

### Anti-Patterns Found

| File                                  | Line | Pattern                              | Severity | Impact                                                                                                                                                                                                                  |
| ------------------------------------- | ---- | ------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (none)                                | —    | No debt markers (TBD/FIXME/XXX/TODO/HACK) found in Phase 9 modified files. | n/a      | Clean.                                                                                                                                                                                                                  |

REVIEW.md surfaced 14 findings (CR-01, CR-02, WR-01 through WR-08, IN-01 through IN-04). The two BLOCKERs are explicitly noted as already fixed by the verify-work prompt:
- **CR-01** (JSONL writer/parser): Fixed in commit `xtmzovwm`. `incomplete-work.ts:72-84` now uses `JSON.stringify` writer; `:116` uses `JSON.parse` reader.
- **CR-02** (`mkdir -p` in `appendIncomplete`): Fixed in commit `ltkzpsnp`. `incomplete-work.ts:83` calls `mkdirSync(dirname(p), { recursive: true })` before `appendFileSync`.

The 8 WARNINGs (input validation, surplus-bookmark probe robustness, tmpdir leak, duplicate detection, resumption protocol) and 4 INFOs (some of which are false positives — IN-01 claims `_enumerateConflictedPaths` is unused but it is used on `backends/jj.ts:537`) are documented in REVIEW.md but are not blocking for Phase 9 goal achievement. They surface real improvements that should land in follow-up work; none of them invalidates the phase goal "jj backend exposes `vcs.workspace.parallel.*`" or break any ROADMAP success criterion.

### Human Verification Required

None. All Phase 9 deliverables are verifiable programmatically:
- TypeScript compilation: verified
- Contract tests: 12/12 vitest scenarios pass against a real jj fixture
- Lint gates: `lint-vcs-no-commit-id.cjs` green
- Sidecar discipline: grep gates confirm no `backends/jj` imports in `jj/parallel.ts` or `jj/conflict-paths.ts`
- dist-cjs emit: artifacts contain both new verbs
- D-16 joint assertion shape: confirmed via source inspection (single `it` block at lines 227-295)
- W2 per-N describe lifecycle: confirmed via source inspection (for-loop wraps `describe.sequential.skipIf`, NOT `it`)
- Phase goal is "backend exposes new verb surface and reap classifier extends to surface in-tree-conflicts" — fully observable in code + tests, no UX/visual/runtime-only behavior remains unverified.

### Gaps Summary

No gaps. All 6 ROADMAP success criteria, all 8 phase requirements, all 8 required artifacts, all 10 key links verified. Sidecar discipline preserved. TypeScript compiles. Contract suite green (12/12). Both code-review BLOCKERs (CR-01, CR-02) confirmed fixed in committed code. PARALLEL-03/04 correctly dropped per Phase 9 discuss-phase decisions D-01/D-02.

Phase goal achieved: jj backend exposes `vcs.workspace.parallel.{dispatch, fanIn}` composed from `octopus.ts` + `reap.ts` + N-parent `jj new`; reap classifier extends to a 3-branch form (empty / in-tree-conflict / crashed-with-uncommitted-work); `WAVE_WORKTREE_MANIFEST` carries the v1.2 schema extension; git backend satisfies the type contract via throwing stubs with Phase 10 breadcrumb. Ready to proceed to Phase 10 (git-side parallel verbs).

---

_Verified: 2026-05-15T16:10:00Z_
_Verifier: Claude (gsd-verifier)_
