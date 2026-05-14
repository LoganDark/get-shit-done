# Phase 2 Deferred: MIGR-04 + UPSTREAM-01

**Recorded:** 2026-05-10
**Plan:** 02-12
**Status:** Deferred to milestone-end task (post-Phase-5)

## What is deferred

| Requirement | Description | Trigger |
|-------------|-------------|---------|
| MIGR-04 | First upstream rebase post-migration verifies "mechanical edits = clean rebase"; conflict count tracked in `.planning/intel/rebase-log.md`. | User performs rebase manually after Phase 5 completes. |
| UPSTREAM-01 | jj-native rebase workflow documented in `docs/upstream-rebase.md` as a retro of the actual rebase. | User writes the recipe doc after performing the rebase. |

## Why deferred

Per CONTEXT D-17/D-18 (Phase 2 discuss-phase locked decisions): user
explicitly chose to perform and own the rebase post-v1. Quote from D-18:
"I'll try a rebase myself after all phases are complete." The
mechanical-edits invariant (D-08) is what Phase 2 actually delivers; the
rebase that validates it is a user-driven event after the migration matures
across Phase 3, 4, 5 churn. No Phase 2 success depends on the rebase
happening.

## Trigger conditions for the milestone-end task

1. Phases 1, 2, 3, 4, 5 are all complete (each phase's verify-pass landed).
2. User runs `/gsd-complete-milestone` or initiates the rebase manually.
3. The milestone-end task creates `.planning/intel/rebase-log.md` and
   `docs/upstream-rebase.md` as part of its execution.

## Artifacts to be created at trigger time

- `.planning/intel/rebase-log.md` — Conflict-count log from the first
  upstream rebase. Format: per-rebase entry with date, upstream HEAD
  resolved-into, conflict count, conflicts-per-file table, retro notes.
- `docs/upstream-rebase.md` — jj-native rebase recipe. Written as a
  retrospective of the actual rebase experience (not a speculative
  how-to).

## ROADMAP reframing (D-17 follow-up)

Phase 2 ROADMAP success criteria 4 and 5 (in `.planning/ROADMAP.md` Phase 2
section) reference the rebase + recipe doc. Per D-17, these MUST be
reframed at the next phase transition. The replacement text is recorded
verbatim below so the phase-transition runner (or user) can apply it
mechanically:

- **Success criterion 4 (replacement text):** "Phase 2 commits land
  mechanically (D-08 invariant verified by UPSTREAM-03 audit in plan
  02-11) — the validating rebase is deferred to a milestone-end task
  per D-17."
- **Success criterion 5 (replacement text):** "Sidecar conventions
  established (sdk/src/vcs/jj/ exists per UPSTREAM-02 in plan 02-02).
  The jj-native rebase recipe doc (UPSTREAM-01) is deferred to the
  milestone-end task per D-17."

The phase transition runner (`/gsd-transition` or equivalent) should
apply these reframings; this tracker records the intent AND the exact text.

## Cross-references

- CONTEXT D-17, D-18 (Phase 2 discuss-phase locked decisions)
- RESEARCH §Rebase Validation DEFERRED (Phase 2 research)
- REQUIREMENTS.md MIGR-04, UPSTREAM-01 (mark as "deferred to milestone-end" at next phase transition)
- ROADMAP.md Phase 2 success criteria 4 + 5 (to be reframed using the verbatim replacement text above)
- Future trigger: `/gsd-complete-milestone` post-Phase-5
