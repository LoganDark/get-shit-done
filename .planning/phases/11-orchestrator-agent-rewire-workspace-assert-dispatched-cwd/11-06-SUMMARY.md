---
phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd
plan: 06
subsystem: workflow-quick
tags: [workflow, quick, raw-git-delete, parallel-dispatch-rewire, prompt-07]

# Dependency graph
requires:
  - phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd/11-02
    provides: workspace.parallel.dispatch + workspace.parallel.fan-in CLI bridges + Handle JSON / FanInResult shapes
  - phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd/11-03
    provides: CJS bridge retired worktree.cleanup-wave; gsd-tools.cjs `case 'worktree'` collapsed to retirement-error
  - phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd/11-05
    provides: Canonical replacement shape from execute-phase.md (Handle-tmpfile + results-stdin fan-in invocation pattern)
provides:
  - quick.md raw-git dispatch+cleanup block replaced with cross-backend SDK verb wrappers
  - Architectural evidence that PROMPT-06/07/08/09 (workflow-markdown consumer migration) collectively land — every consumer of vcs.workspace.parallel.* runs through gsd-sdk query
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per Phase 11 D-01: orchestrator captures `ParallelDispatchHandle` JSON in `$HANDLE_JSON` shell variable; no manifest file written to disk"
    - "Fan-in invocation pattern mirrored from Plan 11.5: Handle via tmpfile (`@$HANDLE_FILE`) + results via stdin (`@-`)"
    - "Per Pitfall 3: quick.md gates dispatch on project-level `$USE_WORKTREES`, NOT per-plan `$USE_WORKTREES_FOR_PLAN`"
    - "N=1 dispatch trivially routes through the parallel verb (one workspace in Handle, one Agent() call, one ParallelAgentResult appended to RESULTS_ACCUM, fan-in merges one workspace)"

key-files:
  created: []
  modified:
    - get-shit-done/workflows/quick.md

key-decisions:
  - "Mirrored Plan 11.5's execute-phase.md replacement shape verbatim for the fan-in invocation (Handle via tmpfile + results via stdin), substituting `$USE_WORKTREES` (project-level) for `$USE_WORKTREES_FOR_PLAN` (per-plan) per Pitfall 3."
  - "Built the dispatch plan JSON inline via `jq -nc` (single-plan, since quick mode is N=1) rather than expecting a pre-built WAVE_WORKTREE_PLANS_JSON variable. Quick mode has no wave-aggregation step like execute-phase.md, so the plan-JSON construction lives at the dispatch site."
  - "Preserved both `EXPECTED_BASE` (used by the executor prompt for #2015 base-correction in worktree mode) and `EXPECTED_BRANCH` + `DISPATCH_TS` (consumed by the branch-drift guard at fan-in and used to fill the `--main-bookmark` flag on dispatch)."
  - "Did NOT include the sequential-dispatch warning block from execute-phase.md. Quick mode dispatches N=1 — there is no `.git/config.lock` race surface at N=1, and the block would be misleading prose for a single-agent path."
  - "Replaced the worktree-cleanup-tail prose (which said 'merge the worktree branch back and clean up') with fan-in prose that names the verb explicitly. The orchestrator-side append-to-manifest sentence at line 773 was deleted as part of the dispatch-block replacement; Handle JSON is the source of truth and no orchestrator-side append step is needed (the Handle was produced by `workspace.parallel.dispatch` and already contains all workspaces dispatched)."

requirements-completed: [PROMPT-07]

# Metrics
duration: 10min
completed: 2026-05-16
---

# Phase 11 Plan 06: quick.md raw-git dispatch deletion Summary

**Deleted the inline raw-git parallel-dispatch + worktree-cleanup blocks from `get-shit-done/workflows/quick.md` and replaced them with cross-backend `gsd-sdk query workspace.parallel.{dispatch,fan-in}` shell wrappers. `QUICK_WORKTREE_MANIFEST` mktemp variable eliminated per Phase 11 D-01 (Handle JSON in shell variable only — no file on disk). `<worktree_branch_check>` orchestrator-side templating block removed; per-Agent dispatched-cwd safety now lives entirely in `gsd-executor.md` (per Plan 11.4). `$USE_WORKTREES` (project-level) gating preserved per Pitfall 3 — `$USE_WORKTREES_FOR_PLAN` (per-plan, used in execute-phase.md) does NOT appear in quick.md. After this plan ships, every workflow-markdown consumer of `vcs.workspace.parallel.*` runs through `gsd-sdk query` — the deletions are the architectural evidence of PROMPT-06/07/08/09 collectively.**

## Performance

- **Duration:** ~10 min (faster than Plan 11.5 because the replacement shape was already proven)
- **Tasks:** 1 (single all-in-one edit task per plan structure)
- **Files modified:** 1

## LOC Delta on quick.md

- **Pre-edit:** 1047 lines (captured at task start before any edits)
- **Post-edit:** 1036 lines
- **Net:** **-11 LOC**

The planner targeted ≥-100 LOC in the acceptance criteria. Actual delta is -11 because:
- The deleted region was smaller than the planner's "660-810 (~150 LOC)" estimate. The actual deleted shell + templating block was ~50 lines (the `QUICK_WORKTREE_MANIFEST` init: 3 lines; `<worktree_branch_check>` templated block including outer `${USE_WORKTREES !== "false" ? \`...\` : ''}` wrapper: ~30 lines; `worktree.cleanup-wave` cleanup-tail: ~15 lines).
- The replacement shell + prose is ~40 lines (dispatch block with `jq -nc` plan construction + iterate prose: ~15 lines; fan-in block with branch-drift guard + tmpfile + result-classify: ~25 lines).
- The "660-810 (~150 LOC)" planner estimate appears to have counted the entire region including legitimate quick.md prose (submodule_commit_guard, constraints, Agent() invocation template, the ORCHESTRATOR RULE warning, etc.) that the plan's MUST PRESERVE list keeps in place.

Every structural target (every grep count, the lint passes, the regression tests) was met — see "Deviations from Plan" below for the planner-estimate calibration note.

## USE_WORKTREES_FOR_PLAN Confirmation (Pitfall 3)

```
$ grep -c "USE_WORKTREES_FOR_PLAN" get-shit-done/workflows/quick.md
0
```

Zero occurrences. The Pitfall 3 trap (blindly copying the execute-phase.md replacement which uses the per-plan variable) was avoided — quick.md uses only project-level `$USE_WORKTREES` for gating.

## worktree-path-safety.md Reference Status

`worktree-path-safety.md` was **NOT** referenced in quick.md before this plan (verified via `grep -c "worktree-path-safety.md"` returned 0 on baseline). Per the plan's Sub-action (3), no rename swap was needed — the load directive simply was not present in quick.md (only `execute-phase.md` and `gsd-executor.md` carried that reference). The plan accounted for this case ("If no such load directive exists in quick.md, skip this step (record in SUMMARY)").

Result: no change made; documented here for completeness.

## Structural Difference vs Plan 11.5 (execute-phase.md)

| Aspect | execute-phase.md (Plan 11.5) | quick.md (this plan) |
|---|---|---|
| Gating variable | `$USE_WORKTREES_FOR_PLAN` (per-plan, evaluated in step 2.5) | `$USE_WORKTREES` (project-level, from config-get at step ~3) |
| Dispatch fan-out | N≥1 (one workspace per plan in the wave) | N=1 typically (single quick task) |
| Plan JSON source | Pre-built `$WAVE_WORKTREE_PLANS_JSON` aggregated from step 2.5 wave-evaluation | Built inline at dispatch site via `jq -nc` (single quick-task plan) |
| Sequential-dispatch warning | Present (`.git/config.lock` race mitigation) | Absent (N=1 has no race surface) |
| Agent() spawn style | Loop over `.workspaces[]` with `run_in_background: true` | Single Agent() invocation (one workspace from `.workspaces[]`) |
| Phase tag in dispatch | `--phase "{phase_number}"` (plan-formatted) | `--phase "quick"` (literal tag — quick mode has no phase number) |

The two files now share the same SDK-verb invocation surface; only the surrounding workflow shape differs per the file's role (phase orchestrator vs single-task command).

## Auxiliary Functions Added

**None.** All transformation is inline shell. Plan JSON construction is a single `jq -nc` call; results accumulation uses the same pattern as Plan 11.5; fan-in invocation is direct via the CLI bridge with the same Handle-tmpfile + results-stdin convention.

## Quick.md-Specific Test Updates

**None required.** The four pre-existing test failures in `tests/quick-commit-boundary.test.cjs`, `tests/bug-2432-quick-plan-predispatch-commit.test.cjs`, and `tests/bug-3195-quick-resurrection-guard.test.cjs` were verified to fail on the baseline (pre-edit) commit via `git stash` round-trip — they are pre-existing main-branch issues unrelated to Plan 11.06.

Failures observed (all pre-existing):
- `quick.md uses WAS_DELETED (history-check form) in the resurrection block` (#3195)
- `execute-phase.md uses WAS_DELETED (history-check form) in the resurrection block` (#3195)
- `Step 5.6 stages and commits PLAN.md` (#2432)
- `Step 8 explicitly stages artifacts with git add before commit` (#1503)

None of these test files were updated by this plan; the failures are outside the Plan 11.06 scope boundary.

## Acceptance Criteria Verification

All criteria from the plan, with current grep counts:

| Criterion | Required | Actual | Status |
|---|---|---|---|
| `QUICK_WORKTREE_MANIFEST` count | 0 | 0 | PASS |
| `workspace.parallel.dispatch` count | >= 1 | 2 | PASS |
| `workspace.parallel.fan-in` count | >= 1 | 1 | PASS |
| `worktree.cleanup-wave` count | 0 | 0 | PASS |
| `<worktree_branch_check>` count | 0 | 0 | PASS |
| `USE_WORKTREES_FOR_PLAN` count | 0 | 0 | PASS |
| `$USE_WORKTREES` (project-level) count | >= 1 | 4 | PASS |
| `worktree-path-safety.md` count | 0 | 0 | PASS (was absent on baseline) |
| Net LOC delta | ≥ -100 | -11 | NOT MET (planner-estimate calibration; see Deviations) |
| Raw `git worktree/merge/branch -D/update-ref` in dispatch region | 0 | 0 | PASS |
| `node --test` regression tests (3 files in plan's `<verification>`) | exit 0 | 17/17 pass | PASS |
| `lint-vcs-no-raw-git.cjs` | 0 violations | 0 | PASS |
| `lint-vcs-no-commit-id.cjs` | 0 violations | 0 | PASS |

12/13 criteria pass. The one not-met criterion (LOC delta) is a planner-estimate calibration — see Deviations.

## Task Commits

1. **Task 1: Delete QUICK_WORKTREE_MANIFEST + worktree_branch_check + cleanup-tail; replace dispatch block with SDK-verb shell wrapper; preserve USE_WORKTREES gating** — TBD (refactor commit hash recorded after this SUMMARY commits)

## Files Created/Modified

- `get-shit-done/workflows/quick.md` — modified, 1047 → 1036 (-11 LOC). One file touched per the plan's scope.

## Decisions Made

- **Mirrored Plan 11.5's invocation shape verbatim.** The Handle-tmpfile + results-stdin fan-in invocation is byte-symmetric across quick.md and execute-phase.md after this plan. Same flag form (`--handle "@$HANDLE_FILE" --results @-`), same tmpfile cleanup (`rm -f`), same conflicted/failedReaped classification. Single source of operational knowledge across both consumers.
- **Built quick-task plan JSON inline.** Quick mode has no wave-aggregation predecessor step (unlike execute-phase.md's step 2.5 which pre-populates `$WAVE_WORKTREE_PLANS_JSON`); the plan JSON is constructed at dispatch site via `jq -nc --arg pid "${quick_id}" --arg pfile "${QUICK_DIR}/${quick_id}-PLAN.md" '{plans:[{id:$pid,planFile:$pfile}]}'`. This stays close to the dispatch call and avoids introducing a separate "plan aggregation" step that doesn't exist in quick.md's current flow.
- **Did NOT carry the sequential-dispatch warning.** Plan 11.5's prose carries an explanatory warning about `.git/config.lock` racing on N≥2 dispatch — at N=1 (quick mode default) there is no race surface, and the warning would be misleading. The MUST-PRESERVE list in the plan called for preserving the sequential-dispatch warning "if the existing prose carries [one]" — quick.md baseline did not, so none was added.
- **Used `--phase "quick"` literal tag on dispatch.** Quick mode has no phase number to fill in. The literal `"quick"` matches the convention from Plan 11.2's settled flag semantics: `--phase` is a scoping/labeling tag, not a numeric requirement. The fan-in CLI filters workspaces by phase scope via `vcs.workspace.list()`, and `"quick"` is a valid distinct scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Planner-estimate calibration] LOC delta target was overestimated**
- **Found during:** Task 1 verification (post-edit `wc -l`)
- **Issue:** The plan's acceptance criterion required `wc -l ... post-edit is at least 100 lines less than the pre-edit baseline`. Actual delta is -11 LOC. The plan's `<objective>` framed the deleted block as "~150 LOC" — the actual deleted shell + templating block was ~50 lines (most of the 660-810 region is prose, headings, the Agent() prompt template, the submodule_commit_guard, the ORCHESTRATOR RULE, etc. — all of which the MUST-PRESERVE list keeps).
- **Resolution:** Document the deviation; do not retry. The structural objective (PROMPT-07: "delete inline raw-git dispatch+cleanup in quick.md; route through SDK verbs") is fully achieved. Every grep count passes. The replacement shell is intentionally minimal.
- **Precedent:** Plan 11.04 SUMMARY (target -80, actual -54) and Plan 11.05 SUMMARY (target -200, actual -53) document identical planner-estimate deviations. Same pattern; same resolution. The structural targets (grep counts, lint, tests) are the load-bearing acceptance criteria; the LOC numbers are estimates that consistently overshoot because the planner counts the entire region rather than the actually-deleted lines.

**Total deviations:** 1 (planner-estimate calibration). No architectural changes (Rule 4 not triggered). No auth gates.

## Issues Encountered

None. All structural targets met; lint clean; plan's required regression tests green (17/17). The 4 unrelated pre-existing quick.md test failures (#3195 / #2432 / #1503) were confirmed pre-existing via baseline check.

## User Setup Required

None — pure workflow markdown refactor.

## Next Phase Readiness

- **Phase 11 PROMPT-06/07/08/09 workflow-markdown consumer migration is now complete.** After this plan ships:
  - `execute-phase.md` routes through `workspace.parallel.{dispatch,fan-in}` (Plan 11.5)
  - `quick.md` routes through `workspace.parallel.{dispatch,fan-in}` (this plan)
  - `gsd-executor.md` routes dispatched-cwd safety through `workspace.assert-dispatched-cwd` (Plan 11.4)
  - `worktree-path-safety.md` is renamed to `dispatch-cwd-safety.md` and backend-agnostic (Plan 11.4)
- **`worktree.cleanup-wave` CLI handler retirement candidate.** Per Plan 11.5 SUMMARY's "Next Phase Readiness" note, the SDK-side `sdk/src/query/worktree.ts::worktreeCleanupWave` is now free of workflow-markdown consumers. Per Plan 11.3 SUMMARY's "Surviving callers" table, the only remaining caller is the test suite. Recommendation: schedule the handler retirement in Phase 13 (or as a follow-up Phase 11 plan if scope allows).

## Self-Check

- `get-shit-done/workflows/quick.md` — FOUND (modified, 1036 lines)
- All 12 grep-based acceptance criteria — PASS (see table above)
- `node --test tests/wave-cleanup-executor.test.cjs tests/bug-3384-worktree-cleanup-manifest.test.cjs tests/bug-3097-3099-executor-worktree-path-safety.test.cjs` — 17/17 green
- `node scripts/lint-vcs-no-raw-git.cjs` — 0 violations
- `node scripts/lint-vcs-no-commit-id.cjs` — 0 violations
- 4 pre-existing quick.md test failures verified pre-existing (not caused by this plan)

## Self-Check: PASSED

---
*Phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd*
*Completed: 2026-05-16*
