---
phase: 02-bulk-call-site-migration-still-git-only
plan: 12
subsystem: planning-tracker
tags: [deferral, milestone-end, rebase, upstream-recipe, roadmap-reframing]
requires:
  - phase: 02
    provides: "Phase 2 production-source migration complete (02-11) — Phase 2 ready to close pending deferred-tracker for MIGR-04 + UPSTREAM-01"
provides:
  - "MIGR-04 (first upstream rebase + conflict-count metric) RECORDED-AS-DEFERRED to milestone-end task post-Phase-5"
  - "UPSTREAM-01 (jj-native rebase recipe) RECORDED-AS-DEFERRED to milestone-end task post-Phase-5"
  - "02-12-DEFERRED.md stable artifact at canonical path with verbatim ROADMAP reframing text for success criteria 4 + 5"
  - "User sign-off recorded for the deferral framing (checkpoint resume-signal 'Approve as-is', 2026-05-11)"
  - "Trail preserved for `/gsd-complete-milestone` (or equivalent) to pick up the rebase + recipe doc post-Phase-5"
affects:
  - "Next phase transition runner (will apply verbatim ROADMAP success criteria 4 + 5 reframing recorded in 02-12-DEFERRED.md)"
  - "/gsd-complete-milestone post-Phase-5 (will trigger the rebase + recipe doc + artifact creation)"
tech-stack:
  added: []
  patterns:
    - "Deferred-tracker plan pattern: when a phase contains requirement IDs that are user-driven events better executed post-milestone, the closing plan of the phase writes a stable tracker artifact (XX-YY-DEFERRED.md) that records the deferral, the trigger conditions, the artifacts to be created at trigger time, and verbatim replacement text for any ROADMAP success criteria that need reframing. The requirement IDs are mapped to this plan in the traceability matrix so phase verify-pass can confirm coverage. The requirements are marked RECORDED-AS-DEFERRED (not Done) in REQUIREMENTS.md."
key-files:
  created:
    - .planning/phases/02-bulk-call-site-migration-still-git-only/02-12-DEFERRED.md
  modified: []
key-decisions:
  - "MIGR-04 + UPSTREAM-01 RECORDED-AS-DEFERRED to milestone-end task post-Phase-5 per CONTEXT D-17/D-18 — user explicitly chose to perform the first upstream rebase manually after v1 phases complete and to write the recipe doc as a retro of the actual rebase experience. No Phase 2 success depends on the rebase happening; the mechanical-edits invariant (D-08) — what Phase 2 actually delivers — was independently verified by UPSTREAM-03 hotspot audit in 02-11."
  - "ROADMAP Phase 2 success criteria 4 + 5 are flagged for reframing at the next phase transition. The replacement text is recorded verbatim in 02-12-DEFERRED.md so the phase-transition runner (or user) can apply it mechanically without re-deriving intent. Reframing is NOT applied in this plan — that's the phase-transition runner's job per the tracker."
  - "User sign-off received via checkpoint resume-signal on 2026-05-11 (resume directive: 'Approve as-is') — full deferral framing in 02-12-DEFERRED.md accepted verbatim, no revisions needed."
  - "REQUIREMENTS.md status for MIGR-04 and UPSTREAM-01 set to 'Recorded as deferred to milestone-end task (post-Phase-5) per Phase 2 plan 02-12' — explicitly NOT the 'Done' / 'Complete' label, because they are not delivered. The traceability matrix can still confirm Phase 2 mapped every requirement ID."
patterns-established:
  - "Deferred-tracker artifact + verbatim-replacement-text contract: the tracker file contains user-observable content (the exact strings to splice into ROADMAP at the phase transition), not just intent — so a future runner can apply the reframing mechanically rather than re-deriving the new criterion wording from CONTEXT decisions."
  - "RECORDED-AS-DEFERRED vs Done in REQUIREMENTS.md traceability: requirements that are deferred-by-decision get an explicit deferred-status string in the traceability matrix, distinct from Complete/Pending — preserves the audit trail that the requirement was acknowledged and routed to a later milestone, not silently dropped."
requirements-completed: []
requirements-deferred:
  - MIGR-04
  - UPSTREAM-01
metrics:
  duration: ~2m (resume-only — tracker commit landed in prior session)
  completed_date: 2026-05-11
---

# Phase 02 Plan 12: Deferred-Tracker for MIGR-04 + UPSTREAM-01 Summary

**Recorded MIGR-04 (first upstream rebase + conflict-count metric) and UPSTREAM-01 (jj-native rebase recipe doc) as deferred-by-decision to a milestone-end task post-Phase-5 per CONTEXT D-17/D-18; user sign-off received via checkpoint on 2026-05-11; ROADMAP success criteria 4 + 5 verbatim replacement text preserved for the next phase-transition runner.**

## Performance

- **Duration:** ~2 min (resume-only — the tracker file write + commit `nytrwpnmuoonxlonvnzpvwsrroyosoqn` landed in the prior session; this session finalizes the plan metadata)
- **Started:** 2026-05-10 (tracker commit)
- **Completed:** 2026-05-11 (user sign-off + plan-metadata commit)
- **Tasks:** 1 (single human-action checkpoint task)
- **Files modified:** 1 (`02-12-DEFERRED.md`) + this SUMMARY + phase-level state-tracking files

## Accomplishments

- `02-12-DEFERRED.md` exists at the canonical path `.planning/phases/02-bulk-call-site-migration-still-git-only/02-12-DEFERRED.md` and contains:
  - The deferral table (MIGR-04 + UPSTREAM-01 with descriptions + triggers)
  - Rationale linked to CONTEXT D-17/D-18 ("I'll try a rebase myself after all phases are complete")
  - Trigger conditions for the milestone-end task (Phases 1–5 complete; `/gsd-complete-milestone` or manual user-initiated rebase)
  - Artifacts to be created at trigger time (`.planning/intel/rebase-log.md`, `docs/upstream-rebase.md`)
  - ROADMAP reframing intent for success criteria 4 + 5 WITH verbatim replacement text
  - Cross-references to CONTEXT, RESEARCH, REQUIREMENTS, ROADMAP, future trigger
- User sign-off received via checkpoint resume-signal on 2026-05-11 ("Approve as-is") — full deferral framing accepted verbatim, no revisions requested
- Phase 2 traceability for MIGR-04 + UPSTREAM-01 closed (mapped to plan 02-12, marked RECORDED-AS-DEFERRED in REQUIREMENTS.md, not silently dropped)
- Phase 2 (12/12 plans) is ready for the phase-level verifier to run

## Task Commits

The plan has a single human-action checkpoint task. The tracker file commit and the plan-metadata commit are recorded below.

1. **Task 1: Record MIGR-04 + UPSTREAM-01 deferral and surface to developer** — `nytrwpnmuoonxlonvnzpvwsrroyosoqn` (docs)
   - `docs(02-12): record MIGR-04 + UPSTREAM-01 deferral to milestone-end (D-17)`
   - Wrote `02-12-DEFERRED.md` with the verbatim structure prescribed in `<what-built>`
   - Surfaced to developer; awaited resume-signal

**Plan metadata:** (this commit) — `docs(02-12): complete deferred-tracker plan (user approval recorded)`

## Files Created/Modified

### Created

- `.planning/phases/02-bulk-call-site-migration-still-git-only/02-12-DEFERRED.md` (committed in `nytrwpnmuoonxlonvnzpvwsrroyosoqn`) — Phase 2 deferred-tracker recording MIGR-04 + UPSTREAM-01 deferral to milestone-end task post-Phase-5; contains verbatim ROADMAP success-criteria 4 + 5 replacement text
- `.planning/phases/02-bulk-call-site-migration-still-git-only/02-12-SUMMARY.md` (this file) — plan completion summary

### Modified (in plan-metadata commit)

- `.planning/STATE.md` — advanced plan position to 12/12, status executing → ready-to-verify, decision logged, progress recalculated, metric recorded
- `.planning/ROADMAP.md` — Phase 2 plan-row updated to `12/12`, plan 02-12 checked off, plan status row updated (success criteria 4 + 5 reframing is NOT applied here — that's the next phase transition's job per the tracker)
- `.planning/REQUIREMENTS.md` — MIGR-04 and UPSTREAM-01 traceability rows updated to "Recorded as deferred to milestone-end task (post-Phase-5) per Phase 2 plan 02-12" (NOT marked Complete/Done — they are deferred, not delivered)

## Decisions Made

### MIGR-04 + UPSTREAM-01 status framing: "Recorded as deferred", not "Done"

Both requirements are routed to a future milestone-end task, not delivered by Phase 2. Marking them Complete in REQUIREMENTS.md would falsely close them in the traceability matrix. The "Recorded as deferred" status preserves the audit trail (the requirement was acknowledged and explicitly routed forward, not silently dropped) while accurately reflecting that the underlying capability — the verified rebase + the retro-as-recipe doc — does not yet exist.

### ROADMAP success criteria 4 + 5 reframing deferred to the next phase transition

The tracker file records verbatim replacement text so the next phase-transition runner (or the user, manually) can splice the new criteria into ROADMAP mechanically. This plan does NOT modify ROADMAP success criteria 4 + 5 directly — doing so before the phase transition would be premature, and the tracker is the canonical source of the reframing intent. Phase 2 verify-pass should treat the reframing as queued, not pending action.

### User sign-off framing

The user's resume-signal was "Approve as-is" (received 2026-05-11), which accepts the full deferral framing in 02-12-DEFERRED.md verbatim. No revisions were requested. This is the gate that closes Phase 2 verify-pass for MIGR-04 / UPSTREAM-01 traceability — the developer's review IS the verification per the plan's `<acceptance_criteria>`.

## Deviations from Plan

None — plan executed exactly as written. The plan was a single human-action checkpoint that required:

1. Writing the tracker file with the prescribed structure (done in commit `nytrwpnmuoonxlonvnzpvwsrroyosoqn`)
2. Awaiting developer review (sign-off received 2026-05-11)
3. Finalizing the plan metadata (this commit)

All steps followed the plan verbatim.

## Issues Encountered

None.

## Verification

- `test -f .planning/phases/02-bulk-call-site-migration-still-git-only/02-12-DEFERRED.md` → exists ✓
- `grep -q "MIGR-04" .planning/phases/02-bulk-call-site-migration-still-git-only/02-12-DEFERRED.md` → matches ✓
- `grep -q "UPSTREAM-01" .planning/phases/02-bulk-call-site-migration-still-git-only/02-12-DEFERRED.md` → matches ✓
- `grep -q "D-17" .planning/phases/02-bulk-call-site-migration-still-git-only/02-12-DEFERRED.md` → matches ✓
- `grep -q "D-18" .planning/phases/02-bulk-call-site-migration-still-git-only/02-12-DEFERRED.md` → matches ✓
- `grep -q "milestone-end" .planning/phases/02-bulk-call-site-migration-still-git-only/02-12-DEFERRED.md` → matches ✓
- `grep -q "Phase 5" .planning/phases/02-bulk-call-site-migration-still-git-only/02-12-DEFERRED.md` → matches ✓
- Tracker references `.planning/intel/rebase-log.md` and `docs/upstream-rebase.md` as artifacts to be created at trigger time ✓
- Tracker contains verbatim replacement text for ROADMAP success criteria 4 and 5 ✓
- User sign-off recorded: "Approve as-is" resume-signal 2026-05-11 ✓
- Tracker commit `nytrwpnmuoonxlonvnzpvwsrroyosoqn` exists on `phase/02-migration` ✓

## Phase 2 Status (Closing — Phase 2 plan count 12/12)

This is the LAST plan in Phase 2. With this plan's metadata committed:

- Phase 2 plan count: **12 of 12 complete**
- Production-source migration (MIGR-01, MIGR-02, MIGR-03, TEST-05, UPSTREAM-02, UPSTREAM-03): complete (per 02-11 SUMMARY)
- Deferred-to-milestone-end (MIGR-04, UPSTREAM-01): recorded with full trail
- Phase 2 long-lived branch `phase/02-migration` is ready for the phase-level verifier to run, then merge to `main`

ROADMAP success criteria 4 + 5 reframing is queued (verbatim text in 02-12-DEFERRED.md); the next phase-transition runner applies it.

## Next Phase Readiness

- **Phase 2 verifier:** Ready to run. All 12 plans complete; production-source lint guard exits 0; all production source uses VcsAdapter; deferred requirements documented with trail.
- **Phase 2 → Phase 3 transition:** When the transition runs, it should (a) apply the verbatim ROADMAP success-criteria 4 + 5 reframing from 02-12-DEFERRED.md, (b) reconcile the REQUIREMENTS.md footer ("78 across 13" vs actual "86 across 15") flagged in STATE blockers, (c) begin populating `sdk/src/vcs/jj/` (sidecar already exists per 02-02).
- **Post-Phase-5 milestone-end task:** Will pick up MIGR-04 + UPSTREAM-01 per 02-12-DEFERRED.md.

## Self-Check

Verifying claims before marking complete:

- [x] `02-12-DEFERRED.md` exists at the canonical path
- [x] Tracker commit `nytrwpnmuoonxlonvnzpvwsrroyosoqn` exists in git log on `phase/02-migration`
- [x] Tracker contains MIGR-04, UPSTREAM-01, D-17, D-18, milestone-end, Phase 5
- [x] Tracker references `.planning/intel/rebase-log.md` and `docs/upstream-rebase.md` as future artifacts
- [x] Tracker contains verbatim replacement text for ROADMAP success criteria 4 + 5
- [x] User sign-off received 2026-05-11 ("Approve as-is")

## Self-Check: PASSED

All claimed files exist, the tracker commit is on `phase/02-migration`, user sign-off is recorded. Plan 02-12 is complete. Phase 2 plan execution is complete (12/12) and ready for the phase-level verifier.

---
*Phase: 02-bulk-call-site-migration-still-git-only*
*Completed: 2026-05-11*
