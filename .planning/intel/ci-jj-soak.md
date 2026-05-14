# CI jj-Backend Soak Window

<!--
  Source decision: D-36 step 2 (Phase 5 CONTEXT) — "fix-specific-flakes +
  N-consecutive-greens" graduation gate for CI-01 (jj-colocated lane,
  Phase 3 plan 03-07) and CI-04 (jj-native lane, Phase 4 plan 04-01).
  Both lanes graduate together from `continue-on-error: true` to required-
  blocking once this soak window completes 10 consecutive nightly green
  runs across both backends.

  This file is the human-auditable source-of-truth for the graduation
  decision. The GitHub Actions run history is the authoritative data
  (queryable via `gh api repos/gsd-build/get-shit-done/actions/runs`),
  but the soak counter advances HERE — the planner manually appends each
  nightly result.

  Created: 2026-05-13 (Phase 5 plan 05-05 Task 2 sub-task A).
-->

**Started:** 2026-05-13 (scaffold landed; first run row appended when next nightly completes)
**Target:** 10 consecutive green nightly runs across both `jj-colocated` and `jj-native` lanes (D-36 step 2)
**Status:** 0/10 consecutive (last update: 2026-05-13 — scaffold only, no runs yet)
**Counter policy:** Any failure in `jj-colocated` OR `jj-native` resets the counter to 0/10 and appends a Reset Event row. The `git` lane is tracked for visibility but does NOT gate the counter (graduation only flips jj lanes; git lane has always been required-blocking).

## Soak Tracking Schema

Each Run Log row records:

- `#` — sequential run index within the current attempt (resets on any failure)
- `Date` — UTC date of the nightly run (`YYYY-MM-DD`)
- `Run ID` — GitHub Actions run ID (clickable via `https://github.com/gsd-build/get-shit-done/actions/runs/<id>`)
- `jj-colocated`, `jj-native`, `git` — one of:
  - `✓` — all matrix cells for that lane succeeded
  - `✗` — at least one matrix cell failed
  - `–` — lane did not run (workflow_dispatch with constrained matrix)
- `Notes` — human gloss; cite specific failing tests on a `✗`

## Run Log

| # | Date       | Run ID | jj-colocated | jj-native | git | Notes                                              |
| - | ---------- | ------ | ------------ | --------- | --- | -------------------------------------------------- |
| _ | 2026-05-13 | _      | _            | _         | _   | scaffold landed; awaiting first post-flake-fix run |

## Reset Events

<!--
  When the counter resets, prepend a row here with:
  - Date the failure landed
  - Counter state when it reset (e.g., "5/10 → 0/10")
  - Failing test(s) identified
  - Fix-commit hash + plan/phase context (a Phase 6 maintenance plan is the
    natural home if a fix requires more than a cherry-pick)
-->

_(populate when the counter resets)_

## Final Graduation

**Date:** _TBD (set when the counter reaches 10/10)_
**Commit removing `continue-on-error: ${{ matrix.backend == 'jj-colocated' || matrix.backend == 'jj-native' }}` from `.github/workflows/test.yml`:** _TBD_
**Plan that landed the flip:** Phase 5 plan 05-05 Task 5 (proposed diff captured in 05-05-SUMMARY.md pending soak completion; planner re-runs the diff on the live workflow file at graduation time)

## Optional Helper

If manual updates become onerous, the planner may add `scripts/show-ci-soak.cjs` (~30 LOC) per RESEARCH Open Q5 Option C — it would scan the last N=15 workflow runs via `gh api` and emit a Markdown table row diff for human review. NOT in plan 05-05 scope; defer to the first failed soak attempt if needed.

## Cross-References

- D-36 step 2 (graduation gate): `.planning/phases/05-command-translations-brownfield-validation-ci-hardening/05-CONTEXT.md`
- Phase 4 LEARNINGS on jj-test flake categorization: `.planning/phases/04-workspaces-octopus-structure-hooks/04-LEARNINGS.md`
- The 7 flake-fixed test files (Phase 5 plan 05-05 Task 1, commit landing this scaffold): all under `sdk/src/vcs/__tests__/jj-*.test.ts` + `sdk/src/vcs/__tests__/exec-env-passthrough.test.ts`
- CI matrix flip diff (proposed but NOT landed pending soak): see Phase 5 plan 05-05 SUMMARY §"Proposed CI matrix flip (gated)"

## 10/10 | Final Graduation

When the counter reaches 10/10:
1. Land the matrix flip per the proposed diff in 05-05 SUMMARY.
2. Fill in the Date + Commit + Plan fields in the "Final Graduation" section above.
3. Update REQUIREMENTS.md: CI-01 / CI-04 phase notes append "; graduated to required-blocking in Phase 5 plan 05-05 per D-36" (already lands at flip time per plan 05-05 Task 5).
4. Append a one-line summary to `.planning/STATE.md` Accumulated Context (this is owned by the orchestrator, not this executor).
