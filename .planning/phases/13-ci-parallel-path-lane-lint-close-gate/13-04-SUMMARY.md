---
phase: 13-ci-parallel-path-lane-lint-close-gate
plan: 04
subsystem: infra
tags: [ci, github-actions, workflow, jj, parallel-dispatch, lint-bookkeeping]

# Dependency graph
requires:
  - phase: 13-ci-parallel-path-lane-lint-close-gate (plan 13-02)
    provides: scripts/audit-workflow-raw-git.cjs — the CI-06 baseline-regression audit script
  - phase: 13-ci-parallel-path-lane-lint-close-gate (plan 13-03)
    provides: scripts/e2e-parallel-phase.sh — the CI-05 parallel-dispatch end-to-end harness
  - phase: 13-ci-parallel-path-lane-lint-close-gate (plan 13-01)
    provides: SC2/SC3 re-baselined to the 127-hit baseline-regression-guard framing
provides:
  - .github/workflows/parallel-e2e.yml — the standalone CI-05 lane (parallel-e2e matrix job + CI-06 audit step + parallel-e2e-gate blocking job)
  - parallel-e2e-gate — the job name to register as a required branch-protection check (D-04 blocking guarantee)
  - 13-LINT05-ALLOWLIST-DIFF.md — the recorded LINT-05 allowlist +1 diff for the v1.3 milestone close commit
affects: [phase-14-default-flip, milestone-v1.3-close]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inverted-polarity matrix continue-on-error — git allow-fail / jj-colocated required, the inverse of test.yml"
    - "needs:-gated all-green summary job (parallel-e2e-gate) as the required branch-protection check, not the matrix job"
    - "Single-concern standalone workflow file with its own CI-03 header, namespaced concurrency group, and paths: filter"

key-files:
  created:
    - .github/workflows/parallel-e2e.yml
    - .planning/phases/13-ci-parallel-path-lane-lint-close-gate/13-LINT05-ALLOWLIST-DIFF.md
  modified: []

key-decisions:
  - "A2 red-cell confirmation: the needs.<job>.result aggregate model holds — a failed continue-on-error:true git cell does not flip the aggregate, a failed non-continue-on-error jj-colocated cell does; no outputs+fromJSON fallback was needed"
  - "parallel-e2e.yml trigger set: push to [main, release/**, hotfix/**] + paths-filtered pull_request to main + workflow_dispatch (RESEARCH Open Q3 recommendation)"
  - "LINT-05 is pure bookkeeping — Phase 13 made zero changes to lint-vcs-no-raw-git.allow.json; the +1 was already spent in Phase 10"

patterns-established:
  - "Inverted-polarity CI lane: a standalone workflow file when blocking polarity is the inverse of test.yml"
  - "Gate job over matrix job: register the needs:-gated if:always() summary job as the required check"

requirements-completed: [CI-05, CI-06, LINT-05]

# Metrics
duration: 4min
completed: 2026-05-22
---

# Phase 13 Plan 04: CI parallel-path lane + LINT-05 close-gate Summary

**Standalone `parallel-e2e.yml` CI lane runs the synthetic 2-plan parallel phase end-to-end on git and jj-colocated, runs the CI-06 raw-git-in-markdown audit, and enforces required-blocking on jj-colocated via a `needs:`-gated `parallel-e2e-gate` job; the LINT-05 allowlist +1 diff is recorded for the v1.3 close commit.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-05-22T21:04:14Z
- **Completed:** 2026-05-22T21:08:20Z
- **Tasks:** 2
- **Files modified:** 2 (both created)

## Accomplishments

- Shipped `.github/workflows/parallel-e2e.yml` — a new standalone single-concern workflow (D-03) defining the `parallel-e2e` matrix job over `backend: [git, jj-colocated]`, with inverted `continue-on-error` polarity (git allow-fail, jj-colocated required — the inverse of `test.yml`).
- The lane builds the SDK, runs the Wave-1 harness (`scripts/e2e-parallel-phase.sh`) once per backend cell with `GSD_SDK` pointed at the repo-checkout SDK, and runs the CI-06 audit step (`node scripts/audit-workflow-raw-git.cjs`) as the milestone-completeness raw-git regression guard.
- Added the `parallel-e2e-gate` job (D-04 option b — `needs: [parallel-e2e]`, `if: always()`) that inspects `needs.parallel-e2e.result` and fails the workflow unless the aggregate is `success` — the actual blocking guarantee, since a matrix cell alone cannot enforce branch protection.
- Recorded the LINT-05 allowlist `+1` diff in `13-LINT05-ALLOWLIST-DIFF.md` as v1.3 milestone-close evidence; confirmed `lint-vcs-no-raw-git.allow.json` is byte-unchanged at 24 entries (23 production + the Phase-10 `sdk/src/vcs/git/parallel.ts` entry).

## Task Commits

Each task was committed atomically:

1. **Task 1: Write parallel-e2e.yml — the parallel-e2e matrix job + CI-06 audit step** — `omxt` (feat)
2. **Task 2: Add the parallel-e2e-gate blocking job and record the LINT-05 allowlist diff** — `zywn` (feat)

**Plan metadata:** committed separately with this SUMMARY.

## Files Created/Modified

- `.github/workflows/parallel-e2e.yml` — the CI-05 parallel-e2e lane: the inverted-polarity 2-backend matrix job (runs the Wave-1 harness per backend + the CI-06 audit step), plus the `parallel-e2e-gate` blocking job. Carries a CI-03 boundary header, a namespaced `concurrency` group, a `paths:`-filtered PR trigger, and verbatim action SHA pins from `test.yml`. No `pull_request_target`, no write `permissions:`.
- `.planning/phases/13-ci-parallel-path-lane-lint-close-gate/13-LINT05-ALLOWLIST-DIFF.md` — LINT-05 bookkeeping: records the allowlist's 24-entry count, the single non-production `sdk/src/vcs/git/parallel.ts` entry with its verbatim `reason`, the `+1` net diff attributed to Phase 10, and that the 23 production entries are byte-unchanged.

## Decisions Made

- **A2 red-cell confirmation result:** The `needs.<job>.result` aggregate behaves exactly as the documented GitHub model — a matrix cell carrying `continue-on-error: true` that fails reports its conclusion as `success`, so a failed git cell does **not** flip the aggregate; a failed jj-colocated cell (no `continue-on-error`) **does** flip it to `failure`. Requiring the aggregate to be `success` is therefore exactly "the jj-colocated cell passed." The aggregate model is reliable; the `outputs:` + `fromJSON` per-cell-output fallback that RESEARCH named was **not** needed. The A2 confirmation was a reasoned analysis of the documented semantics — no temporary red-cell step was added to the committed workflow (the plan explicitly forbids leaving one in).
- **Trigger set:** `push` to `[main, 'release/**', 'hotfix/**']`, `pull_request` to `main` with a `paths:` filter (scoped to `sdk/src/vcs/**`, `sdk/src/query/workspace-parallel-*.ts`, `get-shit-done/workflows/**`, and the three lane-owned files), and `workflow_dispatch` — the RESEARCH Open Q3 recommendation. The `paths:` filter scopes the expensive lane (15 min, two backends, a jj install) to PRs that can affect parallel-dispatch behavior.
- **LINT-05 is pure bookkeeping:** Phase 13 made zero changes to `lint-vcs-no-raw-git.allow.json`. The `+1` budget was already spent in Phase 10. Both Wave-1 files are raw-git-clean (the harness routes all VCS through `gsd-sdk query`; the audit invokes no VCS), so no new allowlist entry was required.

## Deviations from Plan

None - plan executed exactly as written.

Both tasks followed the plan's `<lane_design>` and `<lint05_bookkeeping>` specifications. The locked constraints (D-03 standalone file, D-04 gate-job blocking guarantee, CI-06 audit step, verbatim SHA pins, the byte-unchanged 24-entry allowlist) were all honored without deviation.

## Issues Encountered

None. Several verification commands emitted `FAIL` lines during execution that were investigated and proven to be **false positives in the ad-hoc check scripts themselves**, not defects in the deliverables:

- The plan's `grep -q "continue-on-error: \${{ matrix.backend == 'git' }}"` verify command did not match under one shell's basic-regex handling of the `${{ }}` GitHub-expression syntax (literal `{`/`}` braces are regex-hostile). A byte-exact `String.split("\n").includes(...)` check confirmed the line is present and correct on line 62.
- A `grep 'parallel-e2e-gate'` "gate present in Task 1" warning matched the **comment text** ("the `parallel-e2e-gate` job below") on line 54, not an actual job key. A `^  parallel-e2e-gate:` job-key regex confirmed no real gate job existed after Task 1.
- A "gate job carries continue-on-error" check matched the gate job's **explanatory comment** describing the matrix cell's `continue-on-error` semantics; a comment-stripped key scan confirmed the only real `continue-on-error:` mapping key is line 62 on the matrix job.

No YAML parser (`yaml`/`js-yaml`/python `yaml`) was resolvable in the environment; the plan's acceptance criterion explicitly allows the structural greps as the alternative. A context-aware structural validation (tabs, indentation parity, trailing whitespace, top-level keys, job-key set under `jobs:`, trailing newline) passed.

## User Setup Required

**FLAG FOR USER — branch-protection registration (config outside the repo):** The `parallel-e2e-gate` job is the blocking guarantee for the CI-05 lane, but Phase 13 cannot register it. At v1.3 ship time, **register `parallel-e2e-gate` as a required status check** in the `gsd-build/get-shit-done` GitHub branch-protection settings for `main` (and any protected `release/**` / `hotfix/**` branches). Do **not** register `parallel-e2e` (the matrix job) — GitHub counts `continue-on-error: true` and skipped matrix cells as passing, so registering the matrix job would let a failed jj-colocated cell silently pass branch protection. The gate job's `if: always()` + aggregate-result inspection is the actual enforcement.

No external service environment variables or dashboard configuration are required beyond that one branch-protection check registration.

## Next Phase Readiness

- The CI parallel-path lane (CI-05) and the CI-06 regression guard ship before the Phase 14 `parallelization` default flip, exactly as the v1.3 roadmap sequences it — the parallel-dispatch verbs now have a real-CI safety net on both backends before the user-observable flip.
- LINT-05 is recorded and ready for the v1.3 milestone close commit to quote (`+1` net diff, allowlist byte-unchanged at 24 entries).
- Phase 13 is complete (4/4 plans). Phase 14 (CONFIG-01/02 default flip + DOGFOOD-01/02) is the final v1.3 phase.
- One ship-time follow-up is open: registering `parallel-e2e-gate` as a required branch-protection check (see User Setup Required above) — config outside the repo, not blocking phase completion.

## Self-Check: PASSED

- `FOUND: .github/workflows/parallel-e2e.yml`
- `FOUND: .planning/phases/13-ci-parallel-path-lane-lint-close-gate/13-LINT05-ALLOWLIST-DIFF.md`
- `FOUND: omxt` (Task 1 commit — `omxtpqlxqrslumwwxqpkspnzopwnuzlk`)
- `FOUND: zywn` (Task 2 commit — `zywnmzvxzlyksmqlznrstxuskmlyvwks`)

---
*Phase: 13-ci-parallel-path-lane-lint-close-gate*
*Completed: 2026-05-22*
