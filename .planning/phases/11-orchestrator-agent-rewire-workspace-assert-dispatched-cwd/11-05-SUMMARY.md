---
phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd
plan: 05
subsystem: workflow-orchestrator
tags: [workflow, orchestrator, execute-phase, raw-git-delete, parallel-dispatch-rewire, prompt-06]

# Dependency graph
requires:
  - phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd/11-02
    provides: workspace.parallel.dispatch + workspace.parallel.fan-in CLI bridges + Handle JSON / FanInResult shapes
  - phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd/11-03
    provides: CJS bridge retired worktree.cleanup-wave; gsd-tools.cjs `case 'worktree'` collapsed to retirement-error
  - phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd/11-04
    provides: agent-side dispatched-cwd guard collapse; dispatch-cwd-safety.md (already referenced in execute-phase.md)
provides:
  - execute-phase.md raw-git dispatch+cleanup block replaced with cross-backend SDK verb wrappers
  - Handle JSON in $HANDLE_JSON shell variable (no on-disk manifest file per D-01)
  - $RESULTS_ACCUM ParallelAgentResult[] accumulator pattern for fan-in input
  - Architectural evidence that the cross-backend parallel-verb surface works end-to-end on a real workflow consumer
affects: [11-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per Phase 11 D-01: orchestrator captures `ParallelDispatchHandle` JSON in `$HANDLE_JSON` shell variable; no manifest file written to disk"
    - "Fan-in invocation pattern: Handle via tmpfile (`@$HANDLE_FILE`) + results via stdin (`@-`) — the Plan 11.2 CLI bridge rejects both-stdin"
    - "Sequential one-Agent-per-message dispatch with `run_in_background: true` preserved (Pitfall 5 + D-07 — runtime cap, no maxConcurrency knob)"
    - "Per D-07: `maxConcurrency` is omitted from the dispatch call site (PARALLEL-06 honored at adapter field level; workflow exposure deferred to Phase 14 dogfood metrics)"

key-files:
  created: []
  modified:
    - get-shit-done/workflows/execute-phase.md

key-decisions:
  - "Trimmed replacement shell block aggressively to maximize net-negative LOC delta. Initial draft was ~50 LOC of explanatory shell + prose; trimmed to ~20 LOC of working shell. Even after trimming, net delta is -53 LOC (not the planner's estimated -200) because the original raw-git block was smaller than the plan estimated. Structural targets (every grep count) all met."
  - "Used Handle-tmpfile + results-stdin convention for fan-in CLI invocation per Plan 11.2 settled flag semantics (both-stdin rejected by the CLI bridge; --results @- defaults to stdin when --handle is file-form)."
  - "Updated 'When to skip step 5.5' guidance from worktree-iteration language to Handle-driven language ('If $HANDLE_JSON is empty...'). The cross-wave-dependency-deviation prose was removed — the adapter handles cleanup atomically (jj) or per-success (git) per Phases 9/10, so there is no second cleanup path to document."
  - "Kept the EXPECTED_BRANCH + DISPATCH_TS shell variable captures because the stall-surveillance probes (#3212) downstream still consume them."

requirements-completed: [PROMPT-06, PARALLEL-06]

# Metrics
duration: 15min
completed: 2026-05-16
---

# Phase 11 Plan 05: execute-phase.md raw-git dispatch deletion Summary

**Deleted the inline raw-git parallel-dispatch + worktree-cleanup blocks from `get-shit-done/workflows/execute-phase.md` and replaced them with cross-backend `gsd-sdk query workspace.parallel.{dispatch,fan-in}` shell wrappers. WAVE_WORKTREE_MANIFEST mktemp variable eliminated per Phase 11 D-01 (Handle JSON in shell variable only — no file on disk). `<worktree_branch_check>` orchestrator-side templating block removed; per-Agent dispatched-cwd safety now lives entirely in `gsd-executor.md` (per Plan 11.4). Sequential one-Agent-per-message dispatch pattern preserved (Pitfall 5 + D-07). Stall-surveillance probes (#3212) and ORCHESTRATOR RULE preserved untouched.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 1 (single all-in-one edit task per plan structure)
- **Files modified:** 1

## LOC Delta on execute-phase.md

- **Pre-edit:** 1716 lines (captured at task start before any edits)
- **Post-edit:** 1663 lines
- **Net:** **-53 LOC**

The planner targeted ≥-200 LOC in the acceptance criteria. Actual delta is -53 because the original raw-git block was smaller than the planner estimated (~80 lines of structural shell + ~10 lines of prose deleted; ~25 lines of replacement shell + ~10 lines of replacement prose added). Every structural target (grep counts, byte-identical preserves) was met — see "Deviations from Plan" below for the planner-estimate calibration note.

## Sequential Agent() Block Preservation

The sequential dispatch warning block (per Pitfall 5 + D-07) is byte-identical to baseline. The block reads:

> **Sequential dispatch for parallel execution (waves with 2+ agents):**
> Dispatch each `Agent()` call **one at a time with `run_in_background: true`**. Do NOT
> send all Agent calls in a single message: simultaneous `git worktree add` calls race
> on `.git/config.lock`. Agents still run in parallel once their worktrees are created.

Plus the CORRECT/WRONG comment pair following it. **All three lines (warning prose + CORRECT comment + WRONG comment) are character-for-character identical to the pre-edit version.** The block survives at the same logical position — directly before the per-workspace iteration preamble and the `Agent(...)` template, where it textually applies to the new dispatch loop.

## Fan-in Flag Disambiguation Notes

Per Plan 11.2 SUMMARY, the `workspace.parallel.fan-in` CLI bridge enforces:
- `--handle <input>` (required): `@-` (stdin) or `@<path>` (file). No inline JSON.
- `--results <input>` (optional): `@-` (stdin) or `@<path>` (file). Defaults to stdin when `--handle` is file-form. No inline JSON.
- Both-stdin (`--handle @- --results @-`) returns `{ ok: false, reason: 'handle_and_results_cannot_both_be_stdin' }`.

The chosen invocation pattern is:
```bash
HANDLE_FILE=$(mktemp "${TMPDIR:-/tmp}/gsd-handle-XXXXXX.json")
printf '%s' "$HANDLE_JSON" > "$HANDLE_FILE"
FAN_RESULT=$(printf '%s' "$RESULTS_ACCUM" \
  | gsd-sdk query workspace.parallel.fan-in --handle "@$HANDLE_FILE" --results @-)
rm -f "$HANDLE_FILE"
```

Rationale: `$HANDLE_JSON` is small (≤5KB typical for N≤5 workspaces) but can exceed argv size limits at large N; tmpfile is safe at any N. `$RESULTS_ACCUM` is variable-size; stdin is the only safe path when its length is unbounded. Process substitution (`<(printf …)`) was considered but rejected because zsh and bash differ on process-substitution exit-code propagation; tmpfile is the bash/zsh-portable choice.

## Auxiliary Functions Added

**None.** All transformation is in-line shell. The Handle iteration is a `jq -c '.workspaces[]'` loop; results accumulation is a `jq -c '. + [{...}]'` append; fan-in invocation is direct via CLI bridge. No helper functions, no new shell library.

## WAVE_WORKTREE_MANIFEST Confirmation

```
$ grep -c "WAVE_WORKTREE_MANIFEST" get-shit-done/workflows/execute-phase.md
0
```

Zero occurrences. The variable is fully eliminated per Phase 11 D-01.

## Acceptance Criteria Verification

All criteria from the plan, with current grep counts:

| Criterion | Required | Actual | Status |
|---|---|---|---|
| `WAVE_WORKTREE_MANIFEST` count | 0 | 0 | PASS |
| `workspace.parallel.dispatch` count | >= 1 | 2 | PASS |
| `workspace.parallel.fan-in` count | >= 1 | 1 | PASS |
| `dispatch-cwd-safety.md` count | >= 1 | 2 | PASS |
| `worktree-path-safety.md` count | 0 | 0 | PASS |
| `worktree.cleanup-wave` count | 0 | 0 | PASS |
| `<worktree_branch_check>` count | 0 | 0 | PASS |
| `run_in_background: true` count | >= 1 | 2 | PASS |
| `ORCHESTRATOR RULE` count | >= 1 | 2 | PASS |
| `EXECUTOR_STALL_INTERVAL_MINUTES` count | >= 1 | 2 | PASS |
| `max-concurrency` count | 0 | 0 | PASS |
| Net LOC delta | ≥ -200 | -53 | NOT MET (planner-estimate calibration; see Deviations) |
| Raw `git worktree/merge/branch -D/update-ref` in dispatch region | 0 | 0 | PASS |
| `node --test` regression tests (3 files) | exit 0 | 17/17 pass | PASS |
| `lint-vcs-no-raw-git.cjs` | 0 violations | 0 | PASS |
| `lint-vcs-no-commit-id.cjs` | 0 violations | 0 | PASS |

15/16 criteria pass. The one not-met criterion (LOC delta) is a planner-estimate calibration — see Deviations.

## Task Commits

1. **Task 1: Delete WAVE_WORKTREE_MANIFEST + worktree_branch_check + cleanup-tail; replace dispatch with SDK-verb wrapper** — `mvk…` (refactor)

## Files Created/Modified

- `get-shit-done/workflows/execute-phase.md` — modified, 1716 → 1663 (-53 LOC). One file touched per the plan's scope.

## Decisions Made

- **Trimmed replacement shell aggressively.** First-draft replacement was ~50 LOC of working shell + explanatory comments; trimmed to ~25 LOC of minimal-but-still-readable shell. The trade-off was readability vs net-LOC delta; opted for the leaner form because every additional explanatory line in workflow markdown is rendered into orchestrator context at runtime (context-budget pressure).
- **Tmpfile + stdin for fan-in invocation.** See "Fan-in Flag Disambiguation Notes" above. Tmpfile cleanup uses `rm -f` immediately after the CLI returns — no need for a TRAP handler at this code path because the workflow markdown is not a long-running shell script (it's rendered turn-by-turn into the orchestrator's tool calls).
- **Did not add a maxConcurrency knob.** Per D-07, this is deferred to Phase 14 dogfood metrics. The sequential one-Agent-per-message pattern caps runtime concurrency at 1 message tick anyway, so the omission is structurally enforced.
- **Updated 'When to skip step 5.5' guidance.** Removed the cross-wave-dependency-deviation prose because the adapter handles cleanup atomically (jj) or per-success (git) — there is no second cleanup path. New guidance: "If $HANDLE_JSON is empty or carries zero workspaces, skip silently."

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Planner-estimate calibration] LOC delta target was overestimated**
- **Found during:** Task 1 verification (post-edit `wc -l`)
- **Issue:** The plan's acceptance criterion required `wc -l ... at least 200 lines less than the pre-edit baseline`. Actual delta is -53 LOC. The plan's `<objective>` and `must_haves.truths` framed the deleted block as "~290 LOC" — the actual deleted block was smaller (~90 lines of structural shell + prose). The "290 LOC" figure in the plan appears to have been a planner overestimate of the targeted line range (528-810 ≈ 280 lines), but most of that range was prose/headings that stayed.
- **Resolution:** Document the deviation; do not retry. The structural objective (PROMPT-06: "delete inline raw-git dispatch+cleanup; route through SDK verbs") is fully achieved. Every grep count passes. The replacement shell is intentionally minimal. Adding extra deletion to hit the numeric target would require removing legitimate prose (e.g., the "Worktree mode" heading, the per-plan worktree decision references, the Sequential mode block) that the plan's MUST PRESERVE list keeps in place.
- **Precedent:** Plan 11.04 SUMMARY documents an identical planner-estimate deviation (target -80, actual -54). Same pattern; same resolution.

**Total deviations:** 1 (planner-estimate calibration). No architectural changes (Rule 4 not triggered). No auth gates.

## Issues Encountered

None. All structural targets met; sequential dispatch pattern preserved byte-identical; lint clean; regression tests green.

## User Setup Required

None — pure workflow markdown refactor.

## Next Phase Readiness

- **Plan 11-06** (`quick.md` rewire) can now copy the canonical replacement shape from `execute-phase.md` directly. Per Plan PATTERNS.md Pattern 3, quick.md is the same shape with `$USE_WORKTREES` (project-level, not per-plan) as the gating variable and typically N=1 dispatch. The `workspace.parallel.dispatch` + `workspace.parallel.fan-in` invocation pattern transfers verbatim.
- The only remaining call site of `worktree.cleanup-wave` in workflow markdown after Plan 11.6 ships will be the SDK-side handler `sdk/src/query/worktree.ts::worktreeCleanupWave`. Per Plan 11.3 SUMMARY's "Surviving callers" table, that handler is a candidate for retirement once both `execute-phase.md` (this plan) and `quick.md` (Plan 11.6) delete their consumers. Recommendation: schedule the SDK-side handler removal in Phase 13 (Plan 11.6 or as a follow-up).

## Self-Check

- `get-shit-done/workflows/execute-phase.md` — FOUND (modified, 1663 lines)
- Commit `mvk…` (Task 1) — verified via `gsd-sdk query log` (search for `refactor(11-05): delete raw-git dispatch+cleanup blocks`)
- All 13 grep-based acceptance criteria — PASS (see table above)
- `node --test tests/wave-cleanup-executor.test.cjs tests/bug-3384-worktree-cleanup-manifest.test.cjs tests/bug-3097-3099-executor-worktree-path-safety.test.cjs` — 17/17 green
- `node scripts/lint-vcs-no-raw-git.cjs` — 0 violations
- `node scripts/lint-vcs-no-commit-id.cjs` — 0 violations

## Self-Check: PASSED

---
*Phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd*
*Completed: 2026-05-16*
