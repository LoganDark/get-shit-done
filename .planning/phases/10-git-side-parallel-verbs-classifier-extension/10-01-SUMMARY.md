---
phase: 10-git-side-parallel-verbs-classifier-extension
plan: 01
subsystem: docs/cascade-amendments
tags:
  - cascade-amendments
  - documentation
  - phase-10
dependency_graph:
  requires:
    - .planning/phases/10-git-side-parallel-verbs-classifier-extension/10-CONTEXT.md (D-09/D-10/D-11 verbatim wording)
    - Phase 9 close (FanInResult shape locked at D-08, IncompleteWorkEntry.reason enum widened)
  provides:
    - Authoritative ROADMAP Phase 10 SC3 wording (per-branch loop, halt-on-conflict, idempotent re-call)
    - Authoritative REQUIREMENTS PARALLEL-02 git-side clause (per-branch 2-parent loop)
    - Authoritative REQUIREMENTS TEST-15 reframed wording (loop happy-path proof)
  affects:
    - Plan 10-02 (sidecar body executor reads SC3 + PARALLEL-02 for verification framing)
    - Plan 10-03 (wire-in executor reads SC3)
    - Plan 10-04 (contract-tests executor reads TEST-13/TEST-15 for fixture scope)
tech_stack:
  added: []
  patterns:
    - Doc-only cascade amendment (line-level string replacement; zero code change)
    - Verbatim-from-CONTEXT amendment (no planner re-interpretation)
key_files:
  created:
    - .planning/phases/10-git-side-parallel-verbs-classifier-extension/10-01-SUMMARY.md
  modified:
    - .planning/ROADMAP.md (Phase 10 SC3 line — D-09 amendment)
    - .planning/REQUIREMENTS.md (PARALLEL-02 git-side clause — D-10; TEST-15 bullet — D-11; cross-phase REQ-IDs note — Rule 1 stale-prose follow-on)
decisions:
  - Reframe TEST-15 (D-11 alternative) chosen over delete to preserve REQ-ID in Traceability table without renumbering
  - Cross-phase REQ-IDs note (REQUIREMENTS.md line 139) prose updated to match reframed TEST-15 (Rule 1 — stale prose was a documentation bug)
metrics:
  duration_minutes: 5
  tasks_completed: 2
  files_modified: 2
  files_created: 1
  completed_date: "2026-05-15"
---

# Phase 10 Plan 01: Cascade-Amendment Doc Edits Summary

**One-liner:** Cascade-amendment line edits to ROADMAP and REQUIREMENTS so Phase 10's authoritative success criteria and PARALLEL-02 / TEST-15 wording reflect user-locked decisions D-09 / D-10 / D-11 (per-branch 2-parent loop, not octopus form) before downstream Plans 10-02/03/04 read them as truth.

## Objective Recap

The Phase 10 sidecar body (Plan 10-02) and the contract-test fixture (Plan 10-04) executors will read ROADMAP.md SC3 and REQUIREMENTS.md PARALLEL-02 + TEST-15 as their verification source of truth. Those files currently encoded the original (now-rejected) octopus-form proposal. CONTEXT.md D-09 / D-10 / D-11 mandated three amendments. This plan shipped them verbatim per CONTEXT.md wording.

## Strings Replaced

### D-09 — ROADMAP.md Phase 10 SC3 (line ~93)

**OLD:**

> 3. `git merge --no-ff <p1> <p2> <p3>` octopus form for N≥3 verified on test-fixture across CI git versions; `git worktree remove --force` is forbidden in the cross-backend path (non-force only).

**NEW:**

> 3. Per-branch 2-parent `git merge --no-ff <agentBookmark>` loop verified on test-fixture across CI git versions; halt-on-conflict + re-call via `merge-base --is-ancestor` skip; `git worktree remove --force` is forbidden in the cross-backend path (non-force only).

### D-10 — REQUIREMENTS.md PARALLEL-02 git-side sentence (line ~16)

**OLD (within the PARALLEL-02 bullet):**

> git uses N-parent `git merge --no-ff <p1>...<pN>` + batched `git update-ref -d`.

**NEW:**

> git iterates per-branch 2-parent `git merge --no-ff <agentBookmark>` + per-success `git branch -D`; halts on first conflict; idempotent under re-call via `merge-base --is-ancestor` skip.

### D-11 — REQUIREMENTS.md TEST-15 bullet (line ~68)

**OLD:**

> - [ ] **TEST-15**: git N-parent octopus fixture. `git merge --no-ff <p1> <p2> <p3>` octopus form for N≥3 verified cross-version (ARCHITECTURE-researcher's open question).

**NEW (D-11 reframe alternative):**

> - [ ] **TEST-15**: git per-branch loop happy-path: N successful 2-parent merges produce N entries in `merged[]` for N ∈ {2, 3, 4} verified cross-version.

## Files Touched

| File | Change | Commit |
|------|--------|--------|
| `.planning/ROADMAP.md` | SC3 amendment (D-09) | `wkwrnwtl` |
| `.planning/REQUIREMENTS.md` | PARALLEL-02 git-side clause (D-10) + TEST-15 bullet reframe (D-11) + cross-phase REQ-IDs prose follow-on | `wtuyvvmn` |

## No-Octopus Verification

After all edits:

```text
$ grep -c "octopus form for N\|N-parent octopus fixture\|N-parent .git merge --no-ff <p1>" \
    .planning/ROADMAP.md .planning/REQUIREMENTS.md
.planning/REQUIREMENTS.md:0
.planning/ROADMAP.md:0
```

Zero residual octopus-form language survives in either file.

All three amended strings are present:

- ROADMAP D-09 string (`Per-branch 2-parent`, `merge-base --is-ancestor`) — confirmed present
- REQUIREMENTS D-10 string (`per-branch 2-parent ... <agentBookmark>`) — confirmed present
- REQUIREMENTS D-11 string (`git per-branch loop happy-path: N successful 2-parent merges produce N entries in merged[]`) — confirmed present

## Acceptance Criteria

All criteria from the plan's `<acceptance_criteria>` blocks were verified:

**Task 1 (ROADMAP D-09):**

- [x] `grep -c "octopus form for N" .planning/ROADMAP.md` returns 0
- [x] `Per-branch 2-parent .git merge --no-ff <agentBookmark>. loop verified` present
- [x] `merge-base --is-ancestor` present in ROADMAP
- [x] Phase 10 section header line position preserved (single-line in-place replacement, ±0 line drift)

**Task 2 (REQUIREMENTS D-10 + D-11):**

- [x] `grep -c "N-parent .git merge --no-ff <p1>" .planning/REQUIREMENTS.md` returns 0
- [x] `per-branch 2-parent .git merge --no-ff <agentBookmark>.` present
- [x] `git per-branch loop happy-path: N successful 2-parent merges produce N entries in .merged[].` present
- [x] `grep -c "N-parent octopus fixture" .planning/REQUIREMENTS.md` returns 0
- [x] Traceability row `| TEST-15 | Phase 10 |` unchanged
- [x] PARALLEL-02 bullet still starts with `- [x] **PARALLEL-02**:` (checkbox state preserved)
- [x] TEST-15 bullet still starts with `- [ ] **TEST-15**:` (checkbox state preserved)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Stale "N-parent octopus fixture" prose in cross-phase REQ-IDs note**

- **Found during:** Task 2 verification (overall plan-level verification clause `grep -c "N-parent octopus fixture"` returned 1, not 0)
- **Issue:** REQUIREMENTS.md line 139 (the cross-phase REQ-IDs descriptive note below the Traceability table) listed Phase 10's deliverables as including "N-parent octopus fixture in Phase 10". This phrasing became false the moment D-11 reframed TEST-15 to a per-branch loop happy-path fixture.
- **Fix:** Replaced the phrase "N-parent octopus fixture" with "per-branch loop happy-path fixture" in the descriptive prose on line 139. Surrounding wording (sequencing constraint, same-PR coupling, REQ-ID umbrella explanation) preserved verbatim.
- **Files modified:** `.planning/REQUIREMENTS.md` (single in-line phrase replacement)
- **Commit:** Same commit as the D-10/D-11 amendments (`wtuyvvmn`)
- **Why this is Rule 1:** Documentation that contradicts what the rest of the file says is a correctness defect. The plan's overall verification clause explicitly required `grep -c "N-parent octopus fixture"` returns 0 across REQUIREMENTS.md — leaving the prose stale would have failed the plan's own verification gate. The amended prose is a faithful description of what Phase 10 now ships per the reframed TEST-15.

### Architectural Changes

None.

### Authentication Gates

None — purely doc edits, no external services touched.

## Authentication Gates

None.

## Threat Surface Scan

Doc-only changes. No network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. No threat flags emitted.

## Known Stubs

None — these are final wording amendments, not stubs.

## Self-Check: PASSED

**Files exist:**

- FOUND: `.planning/phases/10-git-side-parallel-verbs-classifier-extension/10-01-SUMMARY.md` (this file, created via Write before commit)
- FOUND: `.planning/ROADMAP.md` (modified)
- FOUND: `.planning/REQUIREMENTS.md` (modified)

**Commits exist** (jj change_id form, since vcs.adapter=jj):

- FOUND: `wkwrnwtl` — `docs(10-01): amend ROADMAP Phase 10 SC3 per D-09 (per-branch loop, drop octopus)`
- FOUND: `wtuyvvmn` — `docs(10-01): amend REQUIREMENTS PARALLEL-02 + TEST-15 per D-10/D-11 (loop, not octopus)`

**Verification gates:**

- ROADMAP residual octopus count = 0
- REQUIREMENTS residual octopus counts = 0 (all three patterns)
- All three amended strings present
- Traceability row preserved
- Both checkbox states preserved
