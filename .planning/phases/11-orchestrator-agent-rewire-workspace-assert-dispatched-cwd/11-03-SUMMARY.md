---
phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd
plan: 03
subsystem: cjs-bridge
tags: [cjs-bridge, worktree-safety, fanIn-delegation, adr-0004, d-05, d-06]

# Dependency graph
requires:
  - phase: 09-jj-side-parallel-verbs
    provides: vcs.workspace.parallel.fanIn body on jj backend; FanInResult shape contract
  - phase: 10-git-side-parallel-verbs-classifier-extension
    provides: vcs.workspace.parallel.fanIn body on git backend; cross-backend FanInResult uniform shape
  - phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd
    plan: 01
    provides: bookmark-free jj-side fanIn; workspace.list() as source-of-truth idiom
provides:
  - CJS-side consumer migration complete — executeWorktreeWaveCleanupPlan body collapses to single vcs.workspace.parallel.fanIn delegation
  - reconstructHandleFromLegacyPlan helper (frozen pure-JSON Handle adapter) — Pattern S6
  - Reason taxonomy on pending[]: merge_conflict | crashed_agent | incomplete_queued | unexpected_error (post-A3)
  - cmdWorktreeCleanupWave CLI alias retired (alongside its gsd-tools.cjs dispatcher case)
  - ADR-0004 _deps={} injection seam preserved verbatim — public signature unchanged
affects: [11-05, 11-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Body-shrink + adapter-mock testing — pre-merge guards moved into the adapter primitive; tests assert at the _deps.vcs boundary, not the inline per-entry loop"
    - "Synthetic Handle reconstruction with Object.freeze on outer + inner (Pattern S6) mirroring sdk/src/vcs/jj/parallel.ts:270-289"
    - "exitCode 0 synthetic results array — legacy callers without per-agent results surface failures only via FanInResult.conflictedPaths / failedReaped (A3)"

key-files:
  created: []
  modified:
    - get-shit-done/bin/lib/worktree-safety.cjs
    - get-shit-done/bin/gsd-tools.cjs
    - tests/wave-cleanup-executor.test.cjs
    - tests/bug-3384-worktree-cleanup-manifest.test.cjs

key-decisions:
  - "Branch-drift test flipped via Option (b) — adapter-mock at _deps.vcs surfaces equivalent failure as merge_conflict. Option (a) would require an end-to-end live fixture for every reason; Option (b) keeps the regression INTENT at the contract boundary the executor was designed to expose."
  - "Replaced the 5 stale execGit-injection tests in bug-3384 with adapter-boundary contract tests. The old tests asserted against a pre-Phase-7 internals layout (execGit DI was removed in v1.1 WAVE-01); they had been broken on main since then. The regression INTENT (don't broad-discover worktrees) is now satisfied at the Handle scope assertion."
  - "Also retired the gsd-tools.cjs `case 'worktree'` dispatcher case (Rule 3 blocking fix). With cmdWorktreeCleanupWave gone, leaving the case would error at module load via the deleted require. Replaced with a structured error message pointing callers at workspace.parallel.fan-in."
  - "Dropped the unused `expr` import (Rule 2 cleanup) — the inline RevisionExpr construction retired with the per-entry guard loop."

requirements-completed: []

# Metrics
duration: 22min
completed: 2026-05-16
---

# Phase 11 Plan 03: CJS-side fanIn delegation Summary

**executeWorktreeWaveCleanupPlan body collapses from a 7-verb per-entry guard loop to a single `vcs.workspace.parallel.fanIn` delegation; ADR-0004 `_deps={}` seam preserved; cmdWorktreeCleanupWave CLI alias retired; tests flipped to the adapter-mock boundary.**

## Performance

- **Duration:** ~22 min
- **Tasks:** 2
- **Files modified:** 4 (worktree-safety.cjs, gsd-tools.cjs, wave-cleanup-executor.test.cjs, bug-3384-worktree-cleanup-manifest.test.cjs)

## LOC Delta

- `get-shit-done/bin/lib/worktree-safety.cjs`: **579 → 522** (**net –57 LOC**, meets ≥50 acceptance criterion)
- Functional code reduction is larger than the raw delta suggests — ~120 LOC of inline per-entry-loop body was replaced by ~25 LOC of fanIn delegation; the remainder is documentation comments explaining the D-05/D-06 retirement.

## Task Commits

1. **Task 1: Shrink executeWorktreeWaveCleanupPlan to fanIn delegation + add reconstructHandleFromLegacyPlan helper** — `ymtzxuvt` (refactor)
   - Body collapses to single `vcs.workspace.parallel.fanIn(handle, results)` call inside try/catch.
   - `reconstructHandleFromLegacyPlan` private helper constructs a frozen pure-JSON ParallelDispatchHandle from the legacy plan shape (Pattern S6 — Object.freeze on outer + inner).
   - 7 pre-merge guards removed: every reason literal that previously existed in the per-entry loop is gone from the source.
   - Reason taxonomy on returned `pending[]`: `merge_conflict` (from FanInResult.conflictedPaths) | `crashed_agent` (from failedReaped) | `incomplete_queued` (from incompleteQueued count) | `unexpected_error` (outer catch).
   - `cmdWorktreeCleanupWave` CLI handler deleted from the module AND its export.
   - `case 'worktree'` dispatcher in `gsd-tools.cjs` collapsed to a structured retirement-error pointing callers at `workspace.parallel.fan-in` (Rule 3 — required to keep the file syntactically valid after the export removal).
   - Unused `expr` import dropped (Rule 2 cleanup).
2. **Task 2: Flip wave-cleanup and bug-3384 tests to fanIn-delegation shape** — `wounqyqm` (test)
   - `wave-cleanup-executor.test.cjs`: 7 tests at the new fanIn boundary. Empty-plan contract preserved exactly. Branch-drift INTENT preserved via Option (b) — adapter mock surfaces the equivalent failure as `merge_conflict`. New scenarios for `crashed_agent`, `incomplete_queued`, `unexpected_error`, plus a Handle-reconstruction shape assertion.
   - `bug-3384-worktree-cleanup-manifest.test.cjs`: 4 tests on the Handle scope as source-of-truth. The 5 stale execGit-injection tests (pre-Phase-7, broken on main since the v1.1 WAVE-01 rewrite) were replaced by adapter-boundary tests that observe `handle.workspaces.length === N` and the explicit per-path list.
   - All 10 tests pass on `node --test`.

## Files Created/Modified

- `get-shit-done/bin/lib/worktree-safety.cjs` — 579 → 522 (–57 LOC); body shrunk, helper added, CLI retired, expr import dropped.
- `get-shit-done/bin/gsd-tools.cjs` — `case 'worktree'` dispatcher case replaced with retirement-error message (10 LOC net delta).
- `tests/wave-cleanup-executor.test.cjs` — rewritten as 7 adapter-mock-boundary tests against the new fanIn delegation.
- `tests/bug-3384-worktree-cleanup-manifest.test.cjs` — rewritten as 4 Handle-scope source-of-truth tests; stale execGit tests retired.

## Branch-Drift Test Flip — Option (a) vs (b) Decision

**Selected: Option (b) — adapter mock at `_deps.vcs` boundary.**

**Why:** Option (a) would have required spinning up a live workspace fixture that produces a synthetic FanInResult containing a non-empty `conflictedPaths` or `failedReaped` — which is significantly harder to drive deterministically than just stubbing the adapter call. Option (b) honors ADR-0004's `_deps={}` injection seam, which is the explicit boundary the executor exposes for testing. The regression INTENT (catch executor-side guard violations) survives intact: a non-clean FanInResult now produces a non-empty `pending[]` with the new reason taxonomy, and the test asserts that.

The original `branch_drift` reason literal is no longer producible from the new code path (per Assumption A3), so option (a) at the live-fixture level cannot reproduce the original assertion shape no matter what — the migration to the merge_conflict / crashed_agent / incomplete_queued / unexpected_error taxonomy is by design.

## Collateral Damage Check

- `tests/worktree-safety.test.cjs` and `tests/worktree-safety-policy.test.cjs` — 11 pre-existing failures unchanged. Verified by running the suite on the parent commit (`@-`) before Task 1: same 8/19 pass rate. These tests reference workflow markdown content and old execGit injection patterns — both predate Phase 11 by multiple milestones and are unrelated to this plan. Filed for future cleanup, not in scope.

## Surviving callers of `worktree.cleanup-wave`

Per the plan's back-compat audit acceptance criterion, surviving call-sites are documented below:

| File | Status |
|---|---|
| `sdk/src/query/command-static-catalog-domain.ts` (2 entries) | **Expected** — SDK-side route preserves until Plans 11.5/11.6 rewrite the workflow markdown call sites that target it. |
| `sdk/src/query/workspace-parallel-dispatch.ts` (comment ref) | **Expected** — comment cross-reference; no code dependency. |
| `get-shit-done/workflows/quick.md` | **Expected** — known caller, deleted in Plan 11.6 (PROMPT-07). |
| `get-shit-done/workflows/execute-phase.md` | **Expected** — known caller, deleted in Plan 11.5 (PROMPT-06). |
| `get-shit-done/bin/gsd-tools.cjs` (3 mentions) | **Self-documentation** — comments in the retirement-error message pointing callers at the replacement. |
| `get-shit-done/bin/lib/worktree-safety.cjs` (1 mention) | **Self-documentation** — comment in the exports block. |

No unexpected surviving callers.

## Decisions Made

- **Replaced gsd-tools.cjs `case 'worktree'` body with structured retirement-error (Rule 3).** With `cmdWorktreeCleanupWave` removed from `worktree-safety.cjs`'s exports, the existing case body would error at `module.exports` resolution — leaving the case in place but emitting an `error()` keeps the dispatcher table consistent and gives a clear signal to any internal caller that still hits the path.
- **Retired the stale execGit-injection tests in bug-3384.** Those tests had been broken on main since v1.1 WAVE-01 (post-Phase-7) replaced execGit DI with adapter DI. Reviving them on the new code path would require either resurrecting the long-removed execGit injection point (architectural change) or repeatedly mocking dead code paths. Replacing them with Handle-scope assertions preserves the regression INTENT against the actual current implementation.
- **Did not touch `sdk/src/query/worktree.ts::worktreeCleanupWave` (the SDK-side handler).** The plan explicitly scopes the CJS bridge alias deletion to `worktree-safety.cjs`; the SDK-side route is still the front door for workflow markdown until Plans 11.5/11.6 ship their rewrite. Plan acceptance criteria lists this exact path as an expected-surviving caller.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] `gsd-tools.cjs` dispatcher case would break at runtime after export removal**
- **Found during:** Task 1, post-edit verification of `node -e "require('./get-shit-done/bin/gsd-tools.cjs')"`.
- **Issue:** Removing `cmdWorktreeCleanupWave` from `worktree-safety.cjs`'s exports leaves `gsd-tools.cjs:989` calling a function that no longer exists. The plan's `files_modified` lists only `worktree-safety.cjs` + the two test files, but leaving the caller broken would surface as a Rule 3 issue (downstream dispatcher fails on first invocation).
- **Fix:** Collapsed the `case 'worktree'` body to a structured `error()` call pointing callers at `gsd-sdk query workspace.parallel.fan-in`. Mentioned in Decisions Made above.
- **Files modified:** `get-shit-done/bin/gsd-tools.cjs`
- **Verification:** `node -e "require('./get-shit-done/bin/gsd-tools.cjs')"` exits cleanly (the require side-effect prints the dispatcher banner, which is the file's existing behavior).
- **Committed in:** `ymtzxuvt` (Task 1 commit)

**2. [Rule 2 — Missing Critical] Unused `expr` import after guard-loop removal**
- **Found during:** Task 1
- **Issue:** Once the per-entry guard loop retires, the file's import `const { createVcsAdapter, expr } = require('../../../sdk/dist-cjs/vcs/index.js')` no longer uses `expr`. Strict-TS / lint would flag this; even without strict mode, a stale import on a load-bearing seam is a smell.
- **Fix:** Dropped `expr` from the import; updated the comment to cite the D-05 reason for the retirement.
- **Files modified:** `get-shit-done/bin/lib/worktree-safety.cjs`
- **Committed in:** `ymtzxuvt` (Task 1 commit)

**3. [Rule 1 — Bug] Reason literals leaked into header documentation**
- **Found during:** Task 1, post-edit grep verification
- **Issue:** Initial pass had the four-line header comment block listing the retired reason names (`branch_drift, deletions_detected, worktree_dirty, no_main_bookmark`) as a recap. The plan's acceptance criterion `grep -nE "branch_drift|..." | grep -v '^#' | wc -l` returned 3 instead of the required 0 because the doc comments use `//` not `#`.
- **Fix:** Reworded the header comment block to refer to "the seven pre-merge guards" without listing the literals. Functionally identical, satisfies the grep-as-defined criterion.
- **Files modified:** `get-shit-done/bin/lib/worktree-safety.cjs`
- **Committed in:** `ymtzxuvt` (Task 1 commit)

**4. [Rule 1 — Bug] Stale execGit-DI tests in bug-3384 cannot pass against the post-Phase-7 code path**
- **Found during:** Task 2 baseline test run
- **Issue:** Five of the bug-3384 tests inject `{ execGit: fn }` as `_deps`. The Phase 7 WAVE-01 rewrite (v1.1) replaced the per-entry execGit DI with a single `_deps.vcs` adapter injection; the execGit DI was deleted from the executor body. Those 5 tests have been failing on main since v1.1 ship; they assert against a code path that no longer exists.
- **Fix:** Replaced with adapter-mock tests that exercise the new fanIn boundary while preserving the regression INTENT (no broad-discovery beyond declared scope).
- **Files modified:** `tests/bug-3384-worktree-cleanup-manifest.test.cjs`
- **Committed in:** `wounqyqm` (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (2 Rule-1 bugs, 1 Rule-2 missing cleanup, 1 Rule-3 blocking-fix-cascade). All within scope of D-05's body shrink; no architectural changes (Rule 4 not triggered).

## Issues Encountered

- **`jj new` / `jj abandon` reverted my unstaged Task-2 edits during a baseline-check probe.** Mid-Task-2, I created a temporary `tmp-baseline-check` commit on `@-` to verify the worktree-safety tests' failure baseline pre-existed my changes, then abandoned it. Because my Task-2 edits weren't yet committed and lived only in the working copy, `jj abandon @` rewound the working copy to its parent state — discarding my edits. **Re-applied the edits and re-ran tests successfully.** Lesson: don't probe the working tree by creating throwaway descendants of `@-` when uncommitted work is in flight; use a fresh worktree or write the diff out first.

## User Setup Required

None — pure refactor + test rewrite.

## Next Phase Readiness

- The CJS-side consumer migration is complete. After Plans 11.4 (`agents/gsd-executor.md` collapse), 11.5 (`execute-phase.md` rewire), and 11.6 (`quick.md` rewire) ship:
  - The only paths into worktree cleanup will be `executeWorktreeWaveCleanupPlan(plan, _deps)` (in-process tests + back-compat code) and `gsd-sdk query workspace.parallel.fan-in` (new orchestrator/quick paths).
  - The `sdk/src/query/worktree.ts::worktreeCleanupWave` SDK-side handler and its catalog entries become candidates for retirement once 11.5/11.6 delete the workflow markdown call sites.
- Reason-taxonomy reference for downstream plans: pending[] entries on the new path carry one of four reasons — `merge_conflict` (file: <path>), `crashed_agent` (subagentName: <name>), `incomplete_queued` (count: <N>), `unexpected_error` (message: <string>).

## Self-Check: PASSED

- `get-shit-done/bin/lib/worktree-safety.cjs` — FOUND (modified, 522 lines)
- `get-shit-done/bin/gsd-tools.cjs` — FOUND (modified)
- `tests/wave-cleanup-executor.test.cjs` — FOUND (rewritten, 10 tests pass)
- `tests/bug-3384-worktree-cleanup-manifest.test.cjs` — FOUND (rewritten, 4 tests pass)
- Commit `ymtzxuvt` (Task 1) — FOUND in `jj log`
- Commit `wounqyqm` (Task 2) — FOUND in `jj log`
- `node --test tests/wave-cleanup-executor.test.cjs tests/bug-3384-worktree-cleanup-manifest.test.cjs` — 10/10 green
- `node -e "require('./get-shit-done/bin/lib/worktree-safety.cjs')"` — exits 0
- `node -e "require('./get-shit-done/bin/gsd-tools.cjs')"` — exits 0 (banner-only side effect)
- Empty-plan contract verified: `m.executeWorktreeWaveCleanupPlan({entries: []})` returns `{ok:true,action:'skip',reason:'empty_plan',entries:[],pending:[]}` exactly.
- All 7 acceptance grep criteria pass (signature=1, reconstructHandle=3, fanIn=4, 7-guard reasons=0, cmd removed=0, Object.freeze=3, LOC delta=-57).

---
*Phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd*
*Completed: 2026-05-16*
