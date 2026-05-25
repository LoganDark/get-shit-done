---
phase: 17-drift-control-reconciliation
plan: 17.01
subsystem: docs
tags: [drift-control, docs, prose-fix, locale-parity, architecture-md, inventory-md]

requires:
  - phase: 14.1
    provides: PARALLEL-08 audit closure (B1 quick task) — clean workflow raw-git audit, prerequisite for Phase 17 plan-phase start
provides:
  - EN docs/ARCHITECTURE.md prose counts aligned with live filesystem (references=60, hooks=12, cli-modules=59, agents=33, installer ~11,000 LOC)
  - ja-JP docs/ja-JP/ARCHITECTURE.md prose counts aligned (commands=68, workflows=89, agents=33, installer 約11,000行)
  - ko-KR docs/ko-KR/ARCHITECTURE.md prose counts aligned (commands=68개, workflows=89개, agents=33개, installer ~11,000줄)
  - docs/INVENTORY.md Commands + Workflows headlines aligned with filesystem (68 + 89)
  - DOCS-08 closed; D-04 all-strict locale lockstep satisfied; Wave 2 (17.02) drift-test gate open for day-1 GREEN landing
affects: [17.02, 17.03, 17.04]

tech-stack:
  added: []
  patterns:
    - "D-04 all-strict locale lockstep: en + ja-JP + ko-KR prose counts move atomically (pt-BR carved out per RESEARCH key finding #2 — no numeric prose-counts)"
    - "D-03 rounded-bucket installer LOC: nearest-1000 (~11,000 lines tolerates ±499 from 10978 live)"
    - "Pitfall 4 strict ordering: drift FIX commits BEFORE drift TEST (Wave 1 → Wave 2)"

key-files:
  created:
    - .planning/phases/17-drift-control-reconciliation/17-01-SUMMARY.md
  modified:
    - docs/ARCHITECTURE.md
    - docs/INVENTORY.md
    - docs/ja-JP/ARCHITECTURE.md
    - docs/ko-KR/ARCHITECTURE.md

key-decisions:
  - "Per-task atomic commits (executor protocol) split the plan's single-commit narrative into two commits — Task 1 for EN+INVENTORY, Task 2 for ja-JP+ko-KR. Both land before Wave 2 starts so the Pitfall 4 same-PR coupling intent is fully satisfied."
  - "pt-BR untouched: 81-line summary with NO numeric prose-counts (RESEARCH key finding #2); D-04 lockstep policy applies only to prose-count-carrying locales by structural-reality."
  - "INVENTORY.md Commands+Workflows headlines (67→68, 88→89) swept alongside ARCHITECTURE.md edits per RESEARCH key finding #5 / DRIFT-02 line 520; would have RED'd inventory-counts.test.cjs otherwise."

patterns-established:
  - "All-strict locale prose-count parity (D-04): en + ja-JP + ko-KR move in lockstep; future translator must update all 3 together or break CI when Wave 2 lands."
  - "Rounded-bucket installer LOC assertion (D-03): nearest-1000 tolerates incidental installer churn from non-drift commits."

requirements-completed: [DOCS-08]

duration: 2min
completed: 2026-05-25
---

# Phase 17 Plan 17.01: Align ARCHITECTURE.md + INVENTORY.md prose counts with filesystem (DOCS-08) Summary

**Fixed 9 EN drift sites + 4 ja-JP sites + 4 ko-KR sites in ARCHITECTURE.md + 2 INVENTORY.md headlines — DOCS-08 closed, D-04 all-strict locale lockstep satisfied, Wave 2 drift-test gate now opens to day-1 GREEN.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-25T21:56:42Z
- **Completed:** 2026-05-25T21:58:42Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- EN ARCHITECTURE.md: 5 drift sites fixed (L185 references-60, L267 hooks-12 + 12-hook roster, L282 cli-modules-59, L337 33-agent / 12 advanced / agents-33-shipped, L599 installer ~11,000 lines).
- INVENTORY.md: Commands headline 67→68, Workflows headline 88→89 (pre-existing drift swept alongside per RESEARCH §DRIFT-02 line 520).
- ja-JP ARCHITECTURE.md: 4 drift sites fixed (L116 commands 44→68, L127 workflows 46→89, L137 agents 16→33, L427 installer 約3,000行→約11,000行).
- ko-KR ARCHITECTURE.md: 4 drift sites fixed (L116 commands 44개→68개, L127 workflows 46개→89개, L137 agents 16개→33개, L427 installer ~3,000줄→~11,000줄).
- pt-BR ARCHITECTURE.md: NOT modified (verified 81-line summary with zero numeric prose-counts; structural carve-out per RESEARCH key finding #2).
- `tests/inventory-counts.test.cjs` passes green (6/6 tests) post-edit.

## Task Commits

Each task was committed atomically via `gsd-sdk query commit`:

1. **Task 1: Fix EN docs/ARCHITECTURE.md drift sites + INVENTORY.md headlines** — change `ryo` (working-copy at time of squash); jj log subject: `docs(17-17.01): align EN ARCHITECTURE.md + INVENTORY.md prose counts with filesystem` (docs)
2. **Task 2: Fix ja-JP + ko-KR ARCHITECTURE.md prose-count drift (D-04 lockstep)** — change `ryo` (working-copy at time of squash); jj log subject: `docs(17-17.01): align ja-JP + ko-KR ARCHITECTURE.md prose counts with filesystem (D-04 lockstep)` (docs)

_Note: The SDK `commit` verb in jj-port mode reports the post-squash working-copy change id (`ryo` here) rather than a per-commit hash. The `jj log` history confirms two distinct, ordered commits: Task 1's EN+INVENTORY commit landed first, then Task 2's ja-JP+ko-KR commit on top._

## Files Created/Modified

- `docs/ARCHITECTURE.md` — 5 lines edited (L185, L267, L282, L337, L599); lines 121/143/181 deliberately unchanged per D-02 (already correct).
- `docs/INVENTORY.md` — 2 lines edited (L57 Commands headline, L167 Workflows headline).
- `docs/ja-JP/ARCHITECTURE.md` — 4 lines edited (L116, L127, L137, L427).
- `docs/ko-KR/ARCHITECTURE.md` — 4 lines edited (L116, L127, L137, L427).
- `.planning/phases/17-drift-control-reconciliation/17-01-SUMMARY.md` — this summary.

## Decisions Made

- **Per-task atomic commits over single-commit narrative.** The plan's `<verification>` block (line 232) framed the output as "a single commit" but the executor protocol (`<task_commit_protocol>`) mandates one commit per task. Resolution: two atomic commits, both landing before Wave 2 starts, preserving the Pitfall 4 same-PR coupling intent. Recorded here so Wave 2's must-haves can cite "Wave 1's two commits landed" verbatim.
- **pt-BR exclusion preserved.** Confirmed via `wc -l docs/pt-BR/ARCHITECTURE.md` = 81 lines and full read — no numeric prose-counts to update. D-04 lockstep applies only to prose-count-carrying locales by structural-reality.
- **INVENTORY.md headlines swept in this plan.** RESEARCH key finding #5 + §DRIFT-02 line 520 flagged the 67/68 + 88/89 drift; including it here prevents `tests/inventory-counts.test.cjs` from REDing after the architecture edits and keeps a single atomic surface for the Wave 1 closure.

## Deviations from Plan

None of substance. The per-task atomic commit split (noted above) is a procedural reconciliation between two parts of the spec, not a content deviation — all 17 prose-count edits across 4 files landed exactly as enumerated in §DOCS-08 + CONTEXT D-02..D-04.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Wave 2 (Plan 17.02 / DRIFT-01 + DRIFT-02) gate is **OPEN**. The drift tests authored in 17.02 will be day-1 GREEN against the post-17.01 filesystem state per Pitfall 4 strict ordering.
- All prose-count-carrying ARCHITECTURE.md locales (en + ja-JP + ko-KR) now align with the live filesystem counts table from §DOCS-08 (commands=68, workflows=89, agents=33, references=60, lib=59, hooks=12, installer ~11,000 LOC).
- No blockers for downstream waves; D-11 strict sequential flow continues to 17.02.

## Self-Check: PASSED

- `docs/ARCHITECTURE.md` modified (5 sites verified via forward + reverse grep) — FOUND
- `docs/INVENTORY.md` modified (Commands + Workflows headlines verified) — FOUND
- `docs/ja-JP/ARCHITECTURE.md` modified (4 sites verified via forward + reverse grep) — FOUND
- `docs/ko-KR/ARCHITECTURE.md` modified (4 sites verified via forward + reverse grep) — FOUND
- `docs/pt-BR/ARCHITECTURE.md` NOT modified — VERIFIED (only ja-JP + ko-KR appear in the diff name-status)
- `tests/inventory-counts.test.cjs` exits 0 (6 tests pass) — FOUND
- Both Task 1 + Task 2 commits present in `gsd-sdk query log` — FOUND

---
*Phase: 17-drift-control-reconciliation*
*Completed: 2026-05-25*
