---
phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd
plan: 08
subsystem: workflow-quick-execute-phase
tags: [workflow, quick, execute-phase, parallel-dispatch, gap-closure, fatal-guard, cr-02, cr-03]

# Dependency graph
requires:
  - phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd/11-05
    provides: execute-phase.md workspace.parallel.dispatch+fan-in wiring (the mostly-correct mirror this plan hardens)
  - phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd/11-06
    provides: quick.md workspace.parallel.dispatch+fan-in wiring (the silently-broken site this plan fixes)
provides:
  - quick.md dispatch invariant — flat [{agentId,planId}] plan-JSON array + numeric --phase 0 sentinel + HANDLE_OK FATAL guard
  - execute-phase.md HANDLE_OK FATAL guard symmetric with quick.md
  - both workflow files EXPECTED_BRANCH empty/HEAD pre-check (CR-03)
  - tests/quick-md-parallel-dispatch.test.cjs regression-pins every CR-02 + CR-03 invariant
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Plan JSON shape: flat array of {agentId, planId} objects matching workspace-parallel-dispatch.ts:73 contract — NO {plans:[...]} wrapper, NO id/planFile field names"
    - "Quick-mode --phase: numeric sentinel 0 (no real phase; the verb does Number() and rejects NaN with {ok:false, reason:'phase_number_required'})"
    - "Post-dispatch FATAL guard pattern: HANDLE_OK=$(jq -r '.ok // \"true\"') then [ \"$HANDLE_OK\" = \"false\" ] && exit 1 — load-bearing default value handles the Handle's no-.ok happy path"
    - "Pre-dispatch EXPECTED_BRANCH guard pattern: [ -z \"$EXPECTED_BRANCH\" ] || [ \"$EXPECTED_BRANCH\" = \"HEAD\" ] — refuses dispatch on detached HEAD before validateMainBookmark can throw"

key-files:
  created:
    - tests/quick-md-parallel-dispatch.test.cjs
  modified:
    - get-shit-done/workflows/quick.md
    - get-shit-done/workflows/execute-phase.md

key-decisions:
  - "Used numeric --phase 0 sentinel for quick mode (not a widening of the verb to accept strings). Smaller blast radius — verb stays strictly numeric; quick mode picks a value that satisfies Number() + !Number.isNaN and won't collide with real phase numbers (which start at 1)."
  - "Dropped the $pfile shell variable from the jq -nc construction; planFile is not on the SDK contract (the verb's plan items are {agentId, planId, workspacePath?}). The Agent() prompt block at quick.md:685-690 references QUICK_DIR/${quick_id}-PLAN.md directly via shell interpolation — no shell variable needed."
  - "Placed the EXPECTED_BRANCH empty/HEAD pre-check OUTSIDE the 'if [ \"${USE_WORKTREES:-true}\" != \"false\" ]' conditional in quick.md per the plan's explicit guidance. Rationale: even when worktrees are disabled, EXPECTED_BRANCH may flow downstream; failing loud here is correct because there is no recovery path without a named branch."
  - "FATAL message body is byte-identical across quick.md and execute-phase.md; indentation differs (2 vs 5 leading spaces because execute-phase.md's surrounding code block uses a 3-space markdown inset). The Task 4 symmetry test extracts the FATAL text via /FATAL: orchestrator is on detached HEAD[^\\n\"]*/ which strips leading whitespace, so symmetry holds at the message-body level."
  - "Committed each CR sub-defect as a separate atomic commit (Task 1 = CR-02 quick.md; Task 2 = CR-02 execute-phase.md; Task 3 = CR-03 both files; Task 4 = regression test) per the plan's explicit guidance on logical-disjoint splits. Preserves per-CR closure trail in commit history."

requirements-completed: [PROMPT-07, PARALLEL-06]

# Metrics
duration: 15min
completed: 2026-05-16
---

# Phase 11 Plan 08: CR-02 + CR-03 BLOCKER gap closure Summary

**Closed VERIFICATION.md CR-02 and CR-03 BLOCKERs. The Phase 11 `quick.md` rewire shipped by Plan 11-06 was structurally correct but silently broken in three independent ways at lines 670-675: wrong plan-JSON shape, non-numeric `--phase "quick"`, and a FATAL guard that missed `{ok:false}` payloads. Additionally both `quick.md` and `execute-phase.md` lacked an EXPECTED_BRANCH empty/HEAD pre-check, letting `validateMainBookmark` (jj/parallel.ts:121-125) surface a Node stack trace on detached HEAD. All four invariants are now in place and pinned by `tests/quick-md-parallel-dispatch.test.cjs` (7/7 green). PROMPT-07 advances from BLOCKED → SATISFIED; PARALLEL-06 advances from PARTIAL → SATISFIED at the SC-2b/CR-02 workflow-exercise level.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 4 (CR-02 quick / CR-02 execute-phase / CR-03 both / regression test)
- **Files modified:** 2 (`quick.md`, `execute-phase.md`)
- **Files created:** 1 (`tests/quick-md-parallel-dispatch.test.cjs`)

## CR-02 sub-defects closed (post-edit quotes)

### quick.md after Task 1 + Task 3 (lines 665-684 region)

```bash
EXPECTED_BASE=$(gsd-sdk query head-ref --cwd . --pick head)
DISPATCH_TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EXPECTED_BRANCH=$(gsd-sdk query current-branch --cwd . --pick branch)
if [ -z "$EXPECTED_BRANCH" ] || [ "$EXPECTED_BRANCH" = "HEAD" ]; then
  echo "FATAL: orchestrator is on detached HEAD or branch query returned empty — refusing to dispatch (validateMainBookmark would throw on empty/HEAD)." >&2
  echo "RECOVERY: check out a named branch/bookmark on the orchestrator before re-running." >&2
  exit 1
fi
if [ "${USE_WORKTREES:-true}" != "false" ]; then
  QUICK_PLAN_JSON=$(jq -nc --arg aid "${quick_id}" --arg pid "${quick_id}" \
    '[{agentId:$aid,planId:$pid}]')
  # Phase sentinel 0 for quick mode (no real phase number; the verb requires Number()-able input — see workspace-parallel-dispatch.ts:63-65).
  HANDLE_JSON=$(printf '%s' "$QUICK_PLAN_JSON" \
    | gsd-sdk query workspace.parallel.dispatch \
        --phase 0 --main-bookmark "$EXPECTED_BRANCH" --plan @-)
  [ -z "$HANDLE_JSON" ] && { echo "FATAL: workspace.parallel.dispatch returned empty Handle JSON" >&2; exit 1; }
  HANDLE_OK=$(echo "$HANDLE_JSON" | jq -r '.ok // "true"')
  [ "$HANDLE_OK" = "false" ] && { echo "FATAL: workspace.parallel.dispatch failed: $HANDLE_JSON" >&2; exit 1; }
  RESULTS_ACCUM='[]'   # ParallelAgentResult[]; one appended per Agent() return
fi
```

Three CR-02 sub-defects closed in one atomic edit (Task 1):

1. **Plan-JSON shape:** `{plans:[{id,planFile}]}` wrapper → flat `[{agentId,planId}]` array. Matches the `readonly {agentId, planId, workspacePath?}[]` contract at `workspace-parallel-dispatch.ts:73`. The `$pfile` variable was dropped from the `jq` invocation — `planFile` is not on the SDK contract, and the Agent() prompt block already references the plan path via direct shell interpolation.
2. **Numeric --phase:** literal `--phase "quick"` → `--phase 0`. Zero is the natural sentinel (Number()-able, doesn't collide with real phase numbers which start at 1). Comment line documents the rationale at the call site.
3. **FATAL guard:** the single `[ -z "$HANDLE_JSON" ]` check now has a sibling `HANDLE_OK=$(echo "$HANDLE_JSON" | jq -r '.ok // "true"')` extraction with FATAL on `=false`. The `// "true"` default is load-bearing: when the verb succeeds the Handle has no `.ok` field, so `jq -r '.ok'` prints `null`, the default substitutes `"true"`, and the `= "false"` branch correctly does not fire. When the verb fails with `{ok:false, reason:...}`, the FATAL branch fires.

### execute-phase.md after Task 2 + Task 3 (lines 530-541 region)

```bash
   EXPECTED_BRANCH=$(gsd-sdk query current-branch --cwd . --pick branch)
   if [ -z "$EXPECTED_BRANCH" ] || [ "$EXPECTED_BRANCH" = "HEAD" ]; then
     echo "FATAL: orchestrator is on detached HEAD or branch query returned empty — refusing to dispatch (validateMainBookmark would throw on empty/HEAD)." >&2
     echo "RECOVERY: check out a named branch/bookmark on the orchestrator before re-running." >&2
     exit 1
   fi
   HANDLE_JSON=$(printf '%s' "$WAVE_WORKTREE_PLANS_JSON" \
     | gsd-sdk query workspace.parallel.dispatch \
         --phase "{phase_number}" --main-bookmark "$EXPECTED_BRANCH" --plan @-)
   [ -z "$HANDLE_JSON" ] && { echo "FATAL: workspace.parallel.dispatch returned empty Handle JSON" >&2; exit 1; }
   HANDLE_OK=$(echo "$HANDLE_JSON" | jq -r '.ok // "true"')
   [ "$HANDLE_OK" = "false" ] && { echo "FATAL: workspace.parallel.dispatch failed: $HANDLE_JSON" >&2; exit 1; }
```

execute-phase.md gains the symmetric `HANDLE_OK` guard (Task 2) and the EXPECTED_BRANCH pre-check (Task 3). The dispatch line itself (numeric `--phase "{phase_number}"`, plan-JSON shape already correct from Plan 11-05) was untouched — only the surrounding guards were hardened.

## CR-03 BLOCKER closed (post-edit grep proof)

```
$ grep -E 'FATAL: orchestrator is on detached HEAD.*' get-shit-done/workflows/quick.md
  echo "FATAL: orchestrator is on detached HEAD or branch query returned empty — refusing to dispatch (validateMainBookmark would throw on empty/HEAD)." >&2

$ grep -E 'FATAL: orchestrator is on detached HEAD.*' get-shit-done/workflows/execute-phase.md
     echo "FATAL: orchestrator is on detached HEAD or branch query returned empty — refusing to dispatch (validateMainBookmark would throw on empty/HEAD)." >&2
```

The FATAL text from `FATAL:` onward is byte-identical across both files. Leading-whitespace difference (2 vs 5 spaces) is the markdown surround — quick.md's block is at column 0, execute-phase.md's block is inset 3 spaces inside a numbered list. The Task 4 symmetry test extracts via `/FATAL: orchestrator is on detached HEAD[^\n"]*/` which strips leading whitespace and verifies the message body is bytes-identical.

## Regression test landed

`tests/quick-md-parallel-dispatch.test.cjs`: 7 tests in 3 describes covering CR-02 quick.md (3 tests), CR-02 execute-phase.md carry-over (1 test), CR-03 (3 tests — quick.md, execute-phase.md, symmetry).

```
$ node --test tests/quick-md-parallel-dispatch.test.cjs
▶ CR-02 quick.md dispatch shape
  ✔ plan JSON is a flat array (no {plans:[...]} wrapper) (0.283083ms)
  ✔ --phase is numeric (sentinel 0 for quick mode) (0.099291ms)
  ✔ HANDLE_OK FATAL guard catches {ok:false} payload (0.05ms)
✔ CR-02 quick.md dispatch shape (1.077416ms)
▶ CR-02 execute-phase.md carry-over
  ✔ HANDLE_OK FATAL guard symmetric on execute-phase.md (0.068958ms)
✔ CR-02 execute-phase.md carry-over (0.133209ms)
▶ CR-03 EXPECTED_BRANCH empty/HEAD pre-check
  ✔ quick.md refuses to dispatch on detached HEAD or empty branch (0.10675ms)
  ✔ execute-phase.md refuses to dispatch on detached HEAD or empty branch (0.059458ms)
  ✔ both files use byte-identical FATAL message (symmetry guard) (0.141875ms)
✔ CR-03 EXPECTED_BRANCH empty/HEAD pre-check (0.395208ms)
ℹ tests 7
ℹ suites 3
ℹ pass 7
ℹ fail 0
```

The test follows the canonical Phase 11 markdown-content regression pattern from `tests/bug-3097-3099-executor-worktree-path-safety.test.cjs` (`fs.readFileSync` + `assert.match` / `assert.doesNotMatch` over rendered product files).

## Acceptance Criteria Verification

| Criterion | Required | Actual | Status |
|---|---|---|---|
| `{plans:\[` in quick.md | 0 | 0 | PASS |
| `agentId:\$aid,planId:\$pid` in quick.md | ≥1 | 1 | PASS |
| `--phase "quick"` in quick.md | 0 | 0 | PASS |
| `--phase 0[^0-9]` in quick.md | ≥1 | 1 | PASS |
| `HANDLE_OK` in quick.md | ≥1 | 2 | PASS |
| `HANDLE_OK.*=.*false` in quick.md | ≥1 | 1 | PASS |
| `HANDLE_OK` in execute-phase.md | ≥1 | 2 | PASS |
| `HANDLE_OK.*=.*false` in execute-phase.md | ≥1 | 1 | PASS |
| `\[ -z "\$EXPECTED_BRANCH" \] \|\| \[ "\$EXPECTED_BRANCH" = "HEAD" \]` in quick.md | ≥1 | 1 | PASS |
| `\[ -z "\$EXPECTED_BRANCH" \] \|\| \[ "\$EXPECTED_BRANCH" = "HEAD" \]` in execute-phase.md | ≥1 | 1 | PASS |
| FATAL message byte-identical | yes | yes | PASS |
| `node --test tests/quick-md-parallel-dispatch.test.cjs` | exit 0 | 7/7 pass | PASS |
| `workspace.parallel.dispatch` in quick.md | ≥1 | 2 | PASS |
| `workspace.parallel.dispatch` in execute-phase.md | ≥1 | 2 | PASS |

14/14 criteria PASS.

## Task Commits

1. **Task 1: Fix quick.md dispatch — CR-02 three sub-defects** — `xlyuxyuwtzyw` (fix)
2. **Task 2: Add symmetric HANDLE_OK guard in execute-phase.md — CR-02 carry-over** — `llulukyoqvvq` (fix)
3. **Task 3: Add EXPECTED_BRANCH empty/HEAD pre-check to both files — CR-03** — `mksyxprsmmxs` (fix)
4. **Task 4: Regression test pinning all CR-02/CR-03 invariants** — `ulktuvnzroto` (test)

## Files Created/Modified

- `get-shit-done/workflows/quick.md` — modified by Tasks 1 and 3
- `get-shit-done/workflows/execute-phase.md` — modified by Tasks 2 and 3
- `tests/quick-md-parallel-dispatch.test.cjs` — created by Task 4 (78 lines)

## Decisions Made

- **Phase sentinel 0 for quick mode (not verb widening).** The plan offered "choose a numeric-phase sentinel for quick mode (e.g. 0) OR widen the verb's --phase to accept non-numeric tags." Chose sentinel because the verb's strict-numeric contract is correctly defensive; widening would degrade the contract repo-wide for one consumer's convenience. Quick mode picks 0 (no real phase) and documents the choice inline.
- **Disjoint per-CR commits.** Tasks 1/2/3/4 are 4 separate atomic commits even though Tasks 1 and 3 touch the same file (quick.md). Per the plan's explicit guidance — "Same wave, separate commits" — this preserves a clean per-CR closure trail in git/jj log for the verifier re-run.
- **No raw git anywhere.** All commits routed through `gsd-sdk query commit` per the jj-port hard rule. Zero raw `git add` / `git commit` invocations.

## Deviations from Plan

None. Every task action followed the plan verbatim. No Rule 1/2/3/4 deviations encountered. No auth gates.

## Issues Encountered

None. The downstream `.workspaces[]` consumer in quick.md was confirmed unaffected by the plan-array shape change (the consumer reads the Handle's `.workspaces` field, not the input plan shape — those are independent). The Agent() prompt's plan-file reference flows via direct shell interpolation, so dropping the `$pfile` variable did not break the prompt.

## User Setup Required

None — pure workflow-markdown and test-file changes.

## Next Phase Readiness

- **PROMPT-07** ready to flip BLOCKED → SATISFIED on verifier re-run. The `quick.md:660-810` raw-git replacement now produces a real Handle (N=1 with `.workspaces[]` length 1) instead of a `{ok:false, reason:'phase_number_required'}` payload silently consumed.
- **PARALLEL-06** ready to flip PARTIAL → SATISFIED at the workflow-exercise level (SC-2b/CR-02). The contract-level pass was already SATISFIED in 11-02; the workflow-side dysfunctional dispatch was the structural reason SC-5 scored PARTIAL.
- **SC-2b** ready to flip FAILED → VERIFIED on the next verifier re-run.
- **Detached-HEAD scenarios** on both workflow paths now produce a clean FATAL + RECOVERY message instead of a Node stack trace from `validateMainBookmark`.
- The Phase 11 verifier's other gaps (CR-01 jj-correctness, CR-04 diagnostic dump, WR-01 manifest writer) are addressed in separate gap-closure plans (11-07, 11-09) per the verifier's "2 closure plans" recommendation.

## Self-Check

- `get-shit-done/workflows/quick.md` — FOUND (post-edit)
- `get-shit-done/workflows/execute-phase.md` — FOUND (post-edit)
- `tests/quick-md-parallel-dispatch.test.cjs` — FOUND (created)
- Commit `xlyuxyuwtzyw` (Task 1) — FOUND via `gsd-sdk query log`
- Commit `llulukyoqvvq` (Task 2) — FOUND via `gsd-sdk query log`
- Commit `mksyxprsmmxs` (Task 3) — FOUND via `gsd-sdk query log`
- Commit `ulktuvnzroto` (Task 4) — FOUND via `gsd-sdk query log`
- `node --test tests/quick-md-parallel-dispatch.test.cjs` — 7/7 green
- All 14 grep-based acceptance criteria — PASS (see table above)

## Self-Check: PASSED

---
*Phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd*
*Completed: 2026-05-16*
