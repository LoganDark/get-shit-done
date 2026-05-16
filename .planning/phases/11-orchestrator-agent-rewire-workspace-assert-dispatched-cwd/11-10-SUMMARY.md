---
phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd
plan: 10
subsystem: workflow-orchestrator
tags: [gap-closure, blocker, execute-phase, dispatch, regression-test, run-2, revision-1, prompt-06]

# Dependency graph
requires:
  - phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd/11-05
    provides: execute-phase.md raw-git block replaced with workspace.parallel.{dispatch,fan-in} structural collapse (the host of the run-1 BLOCKERs)
  - phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd/11-08
    provides: HANDLE_OK FATAL guard + EXPECTED_BRANCH empty/HEAD pre-check + tests/quick-md-parallel-dispatch.test.cjs CR-02/CR-03 regression net (which this plan extends)
provides:
  - Functional workspace.parallel.dispatch invocation in execute-phase.md (WAVE_WORKTREE_PLANS_JSON built from accumulator; --phase via bash variable)
  - Regression net symmetric across QUICK and EXEC for all three CR-02 sub-invariants (plan-shape, numeric --phase, HANDLE_OK guard)
  - Word-split rationale comment in execute-phase.md (T-11-10-04 / WARNING 4 closure)
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "JSON construction from shell accumulator via `printf '%s\\n' $VAR | jq -R . | jq -sc 'map(...)'` — secure form per T-11-10-01 (raw-input mode quotes correctly, no naive string concatenation)"
    - "Bash-variable expansion `${PHASE_NUMBER}` inside fenced bash blocks vs workflow-substitution `{phase_number}` placeholder in agent-prompt literals (run-1 BLOCKER root cause)"
    - "Intentional unquoted-variable word-splitting documented with inline comment + threat-model citation when load-bearing (T-11-10-04 invariant pattern)"
    - "Load-bearing test verification via `jj restore --from @-- <file>` to revert one of two task commits, confirm new tests fail, then restore via `jj restore --from @- <file>` (no `git stash` per project_no_raw_git)"

key-files:
  created: []
  modified:
    - get-shit-done/workflows/execute-phase.md
    - tests/quick-md-parallel-dispatch.test.cjs

key-decisions:
  - "Comment-line increments WAVE_WORKTREE_PLANS_JSON grep count from 2 → 3. Plan's acceptance criterion expected 2 (construction + use site); the actual count is 3 because the inline 5-line comment block above the construction (mandated by Edit 1's action body to document T-11-10-04 word-split rationale) starts with `# WAVE_WORKTREE_PLANS_JSON: ...` and matches the same grep. Structural intent (construction + use site) is met; the extra hit is the rationale-comment header that the plan itself required. Documented as Rule 1 deviation."
  - "Load-bearing test verification used `jj restore --from @-- get-shit-done/workflows/execute-phase.md` (revert from grandparent — the commit before the Task 1 fix), then `jj restore --from @- ...` to restore from parent (the Task 1 fix commit). NO `git stash` — that would directly contradict project_no_raw_git per WARNING 2 of the plan revision."
  - "Task commits structured as fix(11-10) + test(11-10) per project conventions; the implementation and the regression net land in separate commits so a future bisect can isolate which side regressed."

requirements-completed: [PROMPT-06, PARALLEL-06]

# Metrics
duration: 3min
completed: 2026-05-16
---

# Phase 11 Plan 10: PROMPT-06 gap-closure (run-2) Summary

**Closed run-1 BLOCKER cluster A: the parallel-dispatch invocation in `get-shit-done/workflows/execute-phase.md` is now structurally functional on both dimensions. Constructed `WAVE_WORKTREE_PLANS_JSON` from the `WAVE_WORKTREE_PLANS` plan-id accumulator via a `printf | jq -R . | jq -sc 'map({agentId, planId})'` pipeline matching the workspace-parallel-dispatch.ts:73 contract. Replaced the literal workflow-substitution placeholder `--phase "{phase_number}"` (which bash does NOT expand inside a fenced bash block — the verb saw the 14-character literal string and returned `{ok:false, reason:'phase_number_required'}`) with the established bash-variable form `--phase "${PHASE_NUMBER}"`. Extended the existing `tests/quick-md-parallel-dispatch.test.cjs` `EXEC` carry-over describe-block with three new assertions (plan-shape, numeric --phase, accumulator-source) that would have caught both BLOCKERs at commit time — verified load-bearing by reverting the fix via `jj restore --from @-- ...` and confirming all three new tests fail. Pre-existing 7 tests stay green; regression net is now symmetric across QUICK and EXEC for all three CR-02 sub-invariants.**

## Performance

- **Duration:** ~3 min
- **Tasks:** 2 (one fix, one test)
- **Files modified:** 2

## Pre/Post Grep Proof

### Edit 1 — WAVE_WORKTREE_PLANS_JSON construction (T-11-10-01 secure-jq form)

**Pre-edit (run-1 state, from `jj file show @-- get-shit-done/workflows/execute-phase.md`):**
```
$ grep -nE 'WAVE_WORKTREE_PLANS_JSON=\$\(printf' get-shit-done/workflows/execute-phase.md
(no output)
$ grep -c 'WAVE_WORKTREE_PLANS_JSON' get-shit-done/workflows/execute-phase.md
1   # use-site only (line 536, the printf inside HANDLE_JSON construction)
```

**Post-edit:**
```
$ grep -nE 'WAVE_WORKTREE_PLANS_JSON=\$\(printf' get-shit-done/workflows/execute-phase.md
541:   WAVE_WORKTREE_PLANS_JSON=$(printf '%s\n' $WAVE_WORKTREE_PLANS | jq -R . | jq -sc 'map({agentId: ., planId: .})')

$ grep -n 'WAVE_WORKTREE_PLANS_JSON' get-shit-done/workflows/execute-phase.md
536:   # WAVE_WORKTREE_PLANS_JSON: build the dispatch plan-array from the per-plan-worktree-gate.md:94
541:   WAVE_WORKTREE_PLANS_JSON=$(printf '%s\n' $WAVE_WORKTREE_PLANS | jq -R . | jq -sc 'map({agentId: ., planId: .})')
542:   HANDLE_JSON=$(printf '%s' "$WAVE_WORKTREE_PLANS_JSON" \

$ grep -c 'jq -R \. | jq -sc' get-shit-done/workflows/execute-phase.md
1

$ grep -F 'intentionally unquoted' get-shit-done/workflows/execute-phase.md
   # intentionally unquoted here so word-splitting feeds each plan-id as a separate jq -R . input.
```

### Edit 2 — --phase bash-variable form

**Pre-edit:**
```
$ grep -nF -e '--phase "{phase_number}"' get-shit-done/workflows/execute-phase.md
538:         --phase "{phase_number}" --main-bookmark "$EXPECTED_BRANCH" --plan @-)
$ grep -nF -e '--phase "${PHASE_NUMBER}"' get-shit-done/workflows/execute-phase.md
312:gsd-sdk query state.begin-phase --phase "${PHASE_NUMBER}" --name "${PHASE_NAME}" --plans "${PLAN_COUNT}"
```

**Post-edit:**
```
$ grep -nF -e '--phase "${PHASE_NUMBER}"' get-shit-done/workflows/execute-phase.md
312:gsd-sdk query state.begin-phase --phase "${PHASE_NUMBER}" --name "${PHASE_NAME}" --plans "${PLAN_COUNT}"
544:         --phase "${PHASE_NUMBER}" --main-bookmark "$EXPECTED_BRANCH" --plan @-)
$ grep -cF -e '--phase "{phase_number}"' get-shit-done/workflows/execute-phase.md
0
```

The bash-block literal placeholder is gone; agent-prompt-literal uses of `{phase_number}` at :565, :573, :695 are preserved (those are correctly substituted by the orchestrator at Agent-spawn time — only the bash-block use was broken).

### EXPECTED_BRANCH pre-check and HANDLE_OK guard unchanged

Both Plan 11-08 closures preserved byte-identical:
```
$ grep -nE '\[ -z "\$EXPECTED_BRANCH" \] \|\| \[ "\$EXPECTED_BRANCH" = "HEAD" \]' get-shit-done/workflows/execute-phase.md
531:   if [ -z "$EXPECTED_BRANCH" ] || [ "$EXPECTED_BRANCH" = "HEAD" ]; then
$ grep -nF 'HANDLE_OK=$(echo "$HANDLE_JSON" | jq -r' get-shit-done/workflows/execute-phase.md
545:   HANDLE_OK=$(echo "$HANDLE_JSON" | jq -r '.ok // "true"')
```

## Three New EXEC Carry-Over Assertions

Added to the existing `test.describe('CR-02 execute-phase.md carry-over', ...)` block at `tests/quick-md-parallel-dispatch.test.cjs`. The original HANDLE_OK symmetry test (:49-52) is preserved unchanged; the new tests are siblings.

**(1) plan-shape carry-over** — pins `WAVE_WORKTREE_PLANS_JSON` construction + `{agentId, planId}` fields, forbids `{plans:[...]}` wrapper.

**(2) numeric --phase carry-over** — pins `--phase "${PHASE_NUMBER}"`, forbids the literal `--phase "{phase_number}"` placeholder.

**(3) accumulator-source carry-over** — pins that `WAVE_WORKTREE_PLANS_JSON` is built from the `$WAVE_WORKTREE_PLANS` accumulator (per-plan-worktree-gate.md:94 contract).

## Load-Bearing Test Verification

Per the plan's acceptance criterion (Task 2): the new assertions must FAIL when Task 1's edit is temporarily reverted, proving they are not vacuously green.

**Procedure (used `jj restore`, NOT `git stash` per project_no_raw_git / WARNING 2):**

1. After both tasks committed (HEAD = `mvk` working copy on top of Task 2 commit `kuo`):
   ```bash
   $ jj restore --from '@--' get-shit-done/workflows/execute-phase.md
   Working copy  (@) now at: mvkxwqno 2aac6f84 (no description set)
   Parent commit (@-)      : tqqqwkmw 6fdf9017 fix(11-10): construct WAVE_WORKTREE_PLANS_JSON ...
   Added 0 files, modified 1 files, removed 0 files
   $ grep -cF -e '--phase "{phase_number}"' get-shit-done/workflows/execute-phase.md
   1   # the literal placeholder is back
   $ grep -c 'WAVE_WORKTREE_PLANS_JSON=' get-shit-done/workflows/execute-phase.md
   0   # the construction is gone (only the use-site remains, which references undef)
   ```

2. Re-run tests:
   ```
   ▶ CR-02 execute-phase.md carry-over
     ✔ HANDLE_OK FATAL guard symmetric on execute-phase.md  (still passes — unaffected by revert)
     ✖ plan-shape: WAVE_WORKTREE_PLANS_JSON is constructed with {agentId,planId} fields (Plan 11-10 run-2 carry-over)
       AssertionError: expected /WAVE_WORKTREE_PLANS_JSON=\$\(/ to match EXEC
     ✖ numeric --phase: bash variable ${PHASE_NUMBER}, never the literal {phase_number} placeholder (Plan 11-10 run-2 carry-over)
       AssertionError: CR-02 carry-over: literal --phase "{phase_number}" is the workflow placeholder, NOT expanded in bash blocks ...
     ✖ accumulator-source: WAVE_WORKTREE_PLANS_JSON is built from the WAVE_WORKTREE_PLANS plan-id accumulator (Plan 11-10 run-2 carry-over)
       AssertionError: CR-02 carry-over: WAVE_WORKTREE_PLANS_JSON must be built from the WAVE_WORKTREE_PLANS plan-id accumulator ...
   ```

All 3 new tests FAIL (acceptance criterion required ≥ 2; got 3). Original 7 tests continue to pass.

3. Restore the fix:
   ```bash
   $ jj restore --from '@-' get-shit-done/workflows/execute-phase.md
   Added 0 files, modified 1 files, removed 0 files
   $ node --test tests/quick-md-parallel-dispatch.test.cjs 2>&1 | tail -8
   ℹ tests 10
   ℹ suites 3
   ℹ pass 10
   ℹ fail 0
   ```

10/10 green after restore. The three new assertions are confirmed load-bearing.

## Word-Split Rationale Comment (WARNING 4 closure)

The Edit 1 action body required documenting WARNING 4's load-bearing invariant: `$WAVE_WORKTREE_PLANS` is intentionally unquoted so word-splitting feeds each plan-id as a separate `jq -R .` input line. The comment is at execute-phase.md:537-540:

```
   # WAVE_WORKTREE_PLANS_JSON: build the dispatch plan-array from the per-plan-worktree-gate.md:94
   # accumulator. Plan IDs are filename-derived (matches glob 11-NN) — `$WAVE_WORKTREE_PLANS` is
   # intentionally unquoted here so word-splitting feeds each plan-id as a separate jq -R . input.
   # Adding quotes would put the entire space-joined list into a single jq line. The attack surface
   # for shell-meta injection is empty by construction; see Plan 11-10 D-04 / T-11-10-04.
```

`grep -F 'intentionally unquoted' get-shit-done/workflows/execute-phase.md` returns the comment line. The threat-model citation (T-11-10-04) is embedded inline.

## PROMPT-06 Status

This plan flips requirement PROMPT-06 from BLOCKED → SATISFIED. The structural collapse from Plan 11-05 + the run-1 guards from Plan 11-08 + this run-2 dispatch-line fix together make the execute-phase.md parallel-dispatch path end-to-end functional. The regression net is symmetric across QUICK and EXEC for all three CR-02 sub-invariants, so future edits cannot silently re-introduce either BLOCKER.

REQUIREMENTS.md line 120 (PROMPT-06 marked "Complete") is now consistent with verifier truth — no revert needed. The note in `must_haves.truths` (item 5 of the plan) is honored: the table stays "Complete" because the gap closes here.

## Task Commits

1. **Task 1 — fix(11-10):** construct WAVE_WORKTREE_PLANS_JSON and use `${PHASE_NUMBER}` in execute-phase.md dispatch — change `tqqqwkmwyysw` (full id; short `tqq`)
2. **Task 2 — test(11-10):** extend EXEC carry-over with plan-shape, numeric --phase, accumulator-source pins — change `kuomysqqzkty` (full id; short `kuo`)

## Files Created/Modified

- `get-shit-done/workflows/execute-phase.md` — modified (Edit 1: insert WAVE_WORKTREE_PLANS_JSON construction with word-split rationale comment; Edit 2: `--phase "{phase_number}"` → `--phase "${PHASE_NUMBER}"`)
- `tests/quick-md-parallel-dispatch.test.cjs` — modified (file-level docstring run-2 paragraph + three new `test.test(...)` cases inside the existing CR-02 execute-phase.md carry-over describe-block)

## Decisions Made

- **Comment-line increments WAVE_WORKTREE_PLANS_JSON grep count to 3 (not 2).** See Deviations below — structural intent met; the rationale-comment header that the plan itself required is the third hit.
- **Used `jj restore --from @--` (grandparent) for the load-bearing revert** — the working-copy commit `@` (auto-empty `mvk`) is on top of Task 2 (`kuo`) on top of Task 1 (`tqq`), so `@--` is the pre-fix state. Restoring from `@-` would have left Task 1's fix intact. Used `jj restore --from @-` (parent) afterwards to restore the fix. No `git stash` at any point (per WARNING 2 of the plan revision; project_no_raw_git is the absolute rule plan 11-11 is enforcing in the sibling closure).
- **Two separate commits (fix + test).** Per project commit-type conventions: fix= a bug fix to working code; test= test-only changes. Separating them means a future bisect can isolate which side regressed without running both. The plan's two-task structure naturally produced this split.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Acceptance-criterion count off-by-one] WAVE_WORKTREE_PLANS_JSON grep count is 3, not 2**

- **Found during:** Task 1 verification (running the source-assertion grep counts in the plan's acceptance criteria)
- **Issue:** The plan's acceptance criterion (Task 1, criterion 2) states: `grep -c 'WAVE_WORKTREE_PLANS_JSON' get-shit-done/workflows/execute-phase.md` returns 2 (the construction site + the `printf '%s' "$WAVE_WORKTREE_PLANS_JSON"` use site). Actual count is **3**: the inline 5-line comment block that the action body ITSELF mandates (Edit 1) starts with `# WAVE_WORKTREE_PLANS_JSON: build the dispatch plan-array...`, and that comment-header line also matches the bare `grep -c 'WAVE_WORKTREE_PLANS_JSON'`.
- **Fix:** No code change needed. The structural intent (construction line + use site) is met; the extra hit is the WARNING 4 rationale-comment header, which the plan's own Edit 1 action body required. The other Task 1 criterion that grep-pins the construction shape (`grep -nE 'WAVE_WORKTREE_PLANS_JSON=\\$\\(printf'`) returns exactly one hit as expected. Documented here so a future reader doesn't read the bare-count `=2` literally and remove the rationale comment to satisfy the count.
- **Files modified:** None (interpretive deviation only)
- **Commit:** N/A

**Total deviations:** 1 (acceptance-criterion off-by-one due to plan-mandated comment). No architectural changes (Rule 4 not triggered). No auth gates. No Rule 2 or 3 fixes.

## Issues Encountered

None. All structural targets met; load-bearing test verification succeeded (3/3 new assertions failed under revert); broader regression suite green (`tests/quick-md-parallel-dispatch.test.cjs` + `tests/wave-cleanup-executor.test.cjs` + `tests/jj-parallel-no-manifest-write.test.cjs` → 19/19 passing).

## User Setup Required

None — pure workflow markdown + test-file refactor.

## Deferred Items

The plan's `must_haves.truths` item 7 enumerates items deferred to future plans:

- **REVIEW.md WR-01:** `dispatch-cwd-safety.md` protected-ref doc overstatement — documentation cleanup; not goal-blocking for PROMPT-06.
- **REVIEW.md WR-02:** N+1 `jj workspace root --name` subprocess in `workspace-assert-dispatched-cwd.ts` — performance optimization; not correctness-blocking.
- **REVIEW.md WR-04:** `cleanFanIn` predicate duplicated literal in `worktree-safety.cjs:485-491` — DRY hygiene; not correctness-blocking.
- **REVIEW.md WR-05:** `tests/wave-cleanup-executor.test.cjs` missing combined `conflicted: true + failedReaped.length > 0` failure mode — additional coverage; current single-failure-mode tests pass.
- **REVIEW.md IN-02:** `dispatch-cwd-safety.md` recovery section omits orchestrator-side retry guidance — documentation completeness.
- **REVIEW.md IN-03:** "Phase 11 D-01 retired the manifest" rationale duplicated across 4 sites — documentation hygiene.

None individually goal-blocking for PROMPT-06; PROMPT-06 closes here.

## Next Phase Readiness

- **Plan 11-11** (sibling gap-closure for PROMPT-08 / agent-side raw-git removal in gsd-executor.md:431) is a separate file-disjoint plan and can land in parallel or after this plan. The two BLOCKERs surfaced in 11-VERIFICATION.md `gaps:` are independent — this plan closes the dispatch-line cluster; 11-11 closes the diagnostic-dump cluster.
- After 11-11 lands, the verifier re-pass should flip both PROMPT-06 and PROMPT-08 BLOCKED → SATISFIED, bringing Phase 11 SC-2 from PARTIAL → VERIFIED.

## Self-Check

- `get-shit-done/workflows/execute-phase.md` — FOUND (modified — `grep -F 'WAVE_WORKTREE_PLANS_JSON=$(printf'` returns 1 hit; `grep -F '--phase "${PHASE_NUMBER}"'` returns 1 hit in the dispatch block + 1 hit at :312 unchanged; `grep -cF '--phase "{phase_number}"'` returns 0)
- `tests/quick-md-parallel-dispatch.test.cjs` — FOUND (modified — file-level docstring extended; three new `test.test(...)` cases inside the existing CR-02 EXEC carry-over describe-block; `node --test` returns 10/10 green)
- Task 1 commit `tqqqwkmwyysw` (`fix(11-10): construct WAVE_WORKTREE_PLANS_JSON...`) — verified via `gsd-sdk query log --max-count 5`
- Task 2 commit `kuomysqqzkty` (`test(11-10): extend EXEC carry-over...`) — verified via `gsd-sdk query log --max-count 5`
- All grep-based acceptance criteria — PASS (with one interpretive deviation on `grep -c 'WAVE_WORKTREE_PLANS_JSON' = 3` not 2, documented under Deviations)
- `node --test tests/quick-md-parallel-dispatch.test.cjs` — 10/10 green
- `node --test tests/quick-md-parallel-dispatch.test.cjs tests/wave-cleanup-executor.test.cjs tests/jj-parallel-no-manifest-write.test.cjs` — 19/19 green
- Load-bearing test revert verification — 3/3 new tests FAIL under revert; 7/7 original tests still pass; full green after restore
- `quick.md` untouched — `jj diff --stat` shows no `quick.md` entry
- `gsd-executor.md` untouched (Plan 11-11 scope) — `jj diff --stat` shows no `gsd-executor.md` entry

## Self-Check: PASSED

---
*Phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd*
*Completed: 2026-05-16*
