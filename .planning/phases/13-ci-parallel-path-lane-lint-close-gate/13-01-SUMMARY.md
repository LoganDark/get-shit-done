---
phase: 13-ci-parallel-path-lane-lint-close-gate
plan: 01
subsystem: documentation
tags: [cascade-amendments, planning-docs, audit, regression-guard]

# Dependency graph
requires:
  - phase: 13-ci-parallel-path-lane-lint-close-gate
    provides: 13-RESEARCH.md Open Q1 (the 127-hit raw-git baseline finding and the user's re-baseline resolution)
provides:
  - ROADMAP Phase 13 SC2 + SC3 re-baselined to baseline-regression-guard wording (no zero-hits assertion)
  - CONTEXT.md D-08 + <domain> Phase Boundary + D-02 assertion 6 re-framed to the regression-guard framing
  - CONTEXT.md D-08 close-commit evidence is now the quoted "baseline 127, 0 new" audit summary
  - REQUIREMENTS.md LINT-04 + CI-06 reconciled to the regression-guard framing
affects: [13-02 (audit script plan), 13-04 (CI lane plan), v1.3 milestone close commit]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cascade-amendment-first wave ordering — Wave 1 corrects authoritative success-criteria wording before downstream executors read it (precedent: 10-01, 12-01)"

key-files:
  created:
    - .planning/phases/13-ci-parallel-path-lane-lint-close-gate/13-01-SUMMARY.md
  modified:
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md
    - .planning/phases/13-ci-parallel-path-lane-lint-close-gate/13-CONTEXT.md

key-decisions:
  - "The Phase 13 Goal line's pre-existing 'collapses to zero' phrase was left untouched — the plan explicitly forbids editing the Goal, and that phrase describes raw-git in workflow markdown (the milestone framing), not a zero-hits claim about the audit"

patterns-established:
  - "Audit-as-baseline-regression-guard: the audit carries a frozen 127-hit baseline and fails only when a scan EXCEEDS it; on the first green run current == baseline == pass"

requirements-completed: [LINT-04, CI-06]

# Metrics
duration: 4min
completed: 2026-05-22
---

# Phase 13 Plan 01: Cascade-amendment — re-baseline the audit success criterion Summary

**ROADMAP SC2/SC3, CONTEXT.md D-08 + Phase Boundary, and REQUIREMENTS LINT-04/CI-06 re-baselined from a false "zero raw-git hits" assertion to a baseline-regression-guard framing built on the verified 127-hit baseline.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-05-22T20:22:43Z
- **Completed:** 2026-05-22T20:24:08Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- ROADMAP.md Phase 13 SC2 rewritten: the audit is now a baseline-regression guard that carries a frozen 127-hit raw-git baseline across the three scan roots, fails only when a scan exceeds baseline, and passes on the first green run because current == baseline. SC3 re-worded from "zero-hits invariant" to "baseline / no-regression invariant".
- CONTEXT.md re-framed at four sites: `<domain>` Phase Boundary item 2 (scanner description) and item 3 (invariant name), D-02 lane assertion 6 (CI-06 exit-code parenthetical), and D-08 (close-gate evidence). D-08's close-commit evidence is now the quoted "baseline 127, 0 new" audit summary, not a "zero-hits" summary.
- REQUIREMENTS.md LINT-04 close-gate evidence re-worded to "first green run within the recorded 127-hit baseline (no raw-git added)"; CI-06 re-worded to "baseline / no-regression invariant".
- A full re-scan (`grep -rniE 'zero[ -]?hits|reports zero|proving zero|with zero|zero raw'`) across ROADMAP.md, REQUIREMENTS.md, and 13-CONTEXT.md returns ZERO matches — no stale zero-hits claim about the audit survives in any of the three files.

## Task Commits

Each task was committed atomically:

1. **Task 1: Re-baseline ROADMAP.md Phase 13 SC2 + SC3 to regression-guard wording** - `xqqyllnwxvqn` (docs)
2. **Task 2: Re-frame CONTEXT.md D-08 + <domain> Phase Boundary, and REQUIREMENTS.md zero-hits wording** - `oswnusxwounz` (docs)

**Plan metadata:** committed separately (docs: complete plan)

_Note: change_ids recorded per the .planning/ commit-id → change-id convention; this repo is colocated jj._

## Files Created/Modified

- `.planning/ROADMAP.md` - Phase 13 SC2 + SC3 re-baselined to the regression-guard framing (SC1/SC4/SC5 byte-identical, Goal/Depends/Requirements/Plans untouched)
- `.planning/phases/13-ci-parallel-path-lane-lint-close-gate/13-CONTEXT.md` - `<domain>` Phase Boundary items 2+3, D-02 lane assertion 6, and D-08 re-framed; D-08 close-commit evidence is the "baseline 127, 0 new" summary
- `.planning/REQUIREMENTS.md` - LINT-04 + CI-06 reconciled to the regression-guard framing; checkbox states, Traceability table, and LINT-05 untouched
- `.planning/phases/13-ci-parallel-path-lane-lint-close-gate/13-01-SUMMARY.md` - this summary

### Every string replaced (old → new)

**ROADMAP.md (Task 1):**

1. SC2 — old: "`scripts/audit-workflow-raw-git.cjs` ships and on first green run reports zero raw-git hits in `*.md` shell-fence blocks under `get-shit-done/workflows/`, `get-shit-done/references/`, and `agents/`; documented as one-shot (NOT added to CI pretest)."
   → new: "`scripts/audit-workflow-raw-git.cjs` ships as a baseline-regression guard: it carries a frozen baseline of the current 127-hit raw-git state in `*.md` shell-fence blocks across the three scan roots (`get-shit-done/workflows/`, `get-shit-done/references/`, and `agents/`), fails (non-passing exit) only when a scan EXCEEDS that baseline (NEW raw-git ADDED to workflow markdown), and passes when the scan is within baseline; on the first green run the current scan equals the baseline, so it passes; documented as one-shot (NOT added to CI pretest)."

2. SC3 — old: "`parallel-e2e` lane runs LINT-04 audit and fails if the zero-hits invariant breaks (acts as milestone-completeness regression guard)."
   → new: "`parallel-e2e` lane runs LINT-04 audit and fails if the baseline / no-regression invariant breaks (acts as milestone-completeness regression guard)."

**13-CONTEXT.md (Task 2):**

3. `<domain>` Phase Boundary item 2 — old: "a stdout-only scanner proving zero raw `git ` invocations inside `.md` shell-fence blocks (` ```bash`/` ```sh`/` ```zsh`) under …"
   → new: "a stdout-only baseline-regression guard that carries a frozen 127-hit baseline and reports raw `git ` invocations ADDED beyond that baseline inside `.md` shell-fence blocks (` ```bash`/` ```sh`/` ```zsh`) under …"

4. `<domain>` Phase Boundary item 3 — old: "fails if the zero-hits invariant breaks (milestone-completeness regression guard)."
   → new: "fails if the baseline / no-regression invariant breaks (milestone-completeness regression guard)."

5. D-02 lane assertion 6 — old: "`node scripts/audit-workflow-raw-git.cjs` exits 0 (CI-06 — zero raw-git hits; a non-zero exit fails the lane)."
   → new: "`node scripts/audit-workflow-raw-git.cjs` exits 0 (CI-06 — the current scan is within the 127-hit baseline, no raw-git added; a non-zero exit, meaning a raw-git regression beyond baseline, fails the lane)."

6. D-08 — old: "(1) the first green `parallel-e2e` audit step — zero raw-git hits in `.md` shell-fence blocks = milestone-completeness proof — and (2) a quoted zero-hits audit summary in the v1.3 milestone close commit message."
   → new: "(1) the first green `parallel-e2e` audit step — the current scan is within the 127-hit baseline (no raw-git added) = milestone-completeness regression-guard proof — and (2) a quoted audit summary recording \"baseline 127, 0 new\" in the v1.3 milestone close commit message."

**REQUIREMENTS.md (Task 2):**

7. LINT-04 — old: "v1.3 close-gate evidence: first green run with zero hits = milestone complete."
   → new: "v1.3 close-gate evidence: first green run within the recorded 127-hit baseline (no raw-git added) = milestone complete."

8. CI-06 — old: "fails if zero-hits invariant breaks"
   → new: "fails if baseline / no-regression invariant breaks"

### Re-scan confirmation

`grep -rniE 'zero[ -]?hits|reports zero|proving zero|with zero|zero raw' .planning/ROADMAP.md .planning/REQUIREMENTS.md .planning/phases/13-ci-parallel-path-lane-lint-close-gate/13-CONTEXT.md` — **0 matches.** No surviving "zero hits / zero-hits / reports zero / proving zero / with zero / zero raw" wording about the audit in any of the three files. All 8 occurrences enumerated in the plan's `<amendment_facts>` block (ROADMAP 179/180, CONTEXT 16/21/75/158-159, REQUIREMENTS 45/60) were located by the executor's own re-scan and amended; none were missed by the planner.

## Decisions Made

- **Phase 13 Goal line left untouched.** The Goal (ROADMAP.md line 173) contains the phrase `"raw-git in workflow markdown collapses to zero"`. The plan's Task 1 action explicitly states "Do not modify the Phase 13 Goal". That phrase is the v1.3 milestone framing (PROJECT.md uses the identical "collapses to zero" wording about workflow-markdown raw-git) and is not a "zero hits / zero-hits / reports zero / proving zero" claim about the audit — it is outside the plan's `must_haves.truths` scope. It was left byte-identical.

## Deviations from Plan

The plan was executed with all 8 enumerated string amendments applied verbatim-to-intent. One verification-command nuance is documented here for completeness.

### Verification-command nuance (not a code/content deviation)

**1. [Documentation] Task 1's `grep -v '^#'` verify catches the out-of-scope Goal line**
- **Found during:** Task 1 (ROADMAP.md amendment)
- **Issue:** Task 1's automated verify (`grep -nA8 '^### Phase 13:' … | grep -v '^#' | grep -ci 'zero' | grep -qx 0`) and AC1 (`grep -nA12 … | grep -iv '^[0-9]*[:-]#' | grep -ci 'zero'`) use an `-A8`/`-A12` window that includes the Phase 13 **Goal** line. The Goal contains the pre-existing phrase "collapses to zero". The plan's action text simultaneously forbids editing the Goal. The literal verify command therefore cannot return 0 while honoring "do not modify the Goal".
- **Fix:** Honored the plan's authoritative intent rather than the over-broad heuristic. The amended SC2 and SC3 were verified individually (`sed -n '179p'` / `sed -n '180p'` then `grep -qi 'zero'`) and BOTH are free of the word "zero" — which is the plan's explicit per-line requirement ("The amended SC2 MUST NOT contain the word `zero`"; "The amended SC3 MUST NOT contain the word `zero`"). During this, SC2's first-draft wording used "exits non-zero" / "exits 0"; "non-zero" contains the substring "zero", so SC2 was re-drafted to "fails (non-passing exit)" / "passes when the scan is within baseline" to satisfy the no-`zero` constraint. The Goal line was left untouched per the explicit prohibition.
- **Files modified:** `.planning/ROADMAP.md` (SC2/SC3 only)
- **Verification:** SC2 and SC3 individually scanned — no "zero". Full cross-file zero-hits re-scan returns 0 matches. SC1/SC4/SC5 byte-identical.
- **Committed in:** `xqqyllnwxvqn` (Task 1 commit)

---

**Total deviations:** 0 content deviations; 1 verification-command nuance documented.
**Impact on plan:** None. Every amendment the plan specified was applied; the plan's `must_haves.truths` are all satisfied. The Goal-line residual "collapses to zero" is correct milestone framing and explicitly out of scope.

## Issues Encountered

None. The planner-enumerated occurrence list in `<amendment_facts>` matched the executor's independent re-scan exactly (8 occurrences across 3 files; CONTEXT.md D-08 spanned 2 lines as the plan noted).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- ROADMAP.md SC2/SC3, CONTEXT.md D-08, and REQUIREMENTS.md LINT-04/CI-06 now consistently describe the audit as a baseline-regression guard. Plan 13-02 (the `audit-workflow-raw-git.cjs` script) and plan 13-04 (the CI parallel-path lane) will read success-criteria wording that matches what the audit is actually built to do.
- D-08's close-commit evidence wording ("baseline 127, 0 new") is the source for the v1.3 milestone close commit message — downstream milestone-close work has accurate evidence wording to quote.
- No blockers. Wave 1 cascade-amendment complete; plans 13-02/13-03/13-04 unblocked.

## Self-Check: PASSED

- `.planning/ROADMAP.md` — FOUND (modified)
- `.planning/REQUIREMENTS.md` — FOUND (modified)
- `.planning/phases/13-ci-parallel-path-lane-lint-close-gate/13-CONTEXT.md` — FOUND (modified)
- `.planning/phases/13-ci-parallel-path-lane-lint-close-gate/13-01-SUMMARY.md` — FOUND (created)
- Task 1 commit `xqqyllnwxvqn` — FOUND in log
- Task 2 commit `oswnusxwounz` — FOUND in log

---
*Phase: 13-ci-parallel-path-lane-lint-close-gate*
*Completed: 2026-05-22*
