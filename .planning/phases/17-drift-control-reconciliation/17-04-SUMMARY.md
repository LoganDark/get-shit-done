---
phase: 17-drift-control-reconciliation
plan: 17.04
subsystem: planning-truth-reconciliation
tags: [reconciliation, truth-source, project-md, two-pass, project-01, ip-4]
dependency-graph:
  requires:
    - .planning/REQUIREMENTS.md (v1.4 active milestone)
    - .planning/milestones/v1.1-REQUIREMENTS.md
    - .planning/milestones/v1.2-REQUIREMENTS.md
    - .planning/milestones/v1.3-REQUIREMENTS.md
    - .planning/MILESTONES.md
    - .planning/STATE.md
    - 17.03 committed (DOCS-09 close-gate passed at ≥99% pass rate)
  provides:
    - .planning/intel/project-validated-truth.md (machine truth source enumerating 168 REQ-IDs across all 5 milestones)
    - .planning/PROJECT.md ### Validated narrative reconciled against truth source
    - Phase 17 complete; v1.4 milestone-close prerequisite (PROJECT-01) closed
  affects:
    - .planning/PROJECT.md (bounded diff: cited truth file + added Phase 17 section + Pending Phase 18 subsection + MERGE-08 marker update + A3 caveat closure annotation)
tech-stack:
  added: []
  patterns:
    - two-pass-doc-reconciliation (machine intel artifact + human-edited narrative citing it; Pitfall 8 + CF-06)
    - inline-computation-vs-script (REQUIREMENTS.md PROJECT-01 OOS clause + YAGNI per RESEARCH §PROJECT-01)
    - hand-curated-parenthetical-preservation (narrative voice owned by PROJECT.md; truth source enumeration owned by intel artifact)
key-files:
  created:
    - .planning/intel/project-validated-truth.md (357 lines; 5 milestone sections; 168 REQ-IDs enumerated)
  modified:
    - .planning/PROJECT.md (bounded diff: ### Validated section only; +21 lines net; rest of file untouched)
decisions:
  - id: PROJECT-01-form
    summary: "Truth source ships as INLINE researcher computation (NOT a permanent scripts/reconcile-project-validated.cjs)"
    rationale: "REQUIREMENTS.md PROJECT-01 OOS clause + YAGNI per RESEARCH §PROJECT-01 reusability analysis: one-shot prose sweep, no recurring SDK verb, premature abstraction at v1.4. Permanent script form remains a v1.5+ candidate if a second consumer emerges."
metrics:
  duration_minutes: 8
  completed_date: 2026-05-25
  commits: 2
  tasks_completed: 2
  files_changed: 2
---

# Phase 17 Plan 17.04: PROJECT.md ### Validated Reconciliation Summary

Two-pass reconciliation of `.planning/PROJECT.md` `### Validated` against `MILESTONES.md` + per-milestone REQUIREMENTS files + `STATE.md` snapshot per CF-06 + Pitfall 8: Pass 1 (machine) produced `.planning/intel/project-validated-truth.md` enumerating 168 REQ-IDs across all 5 milestones; Pass 2 (human) edited the PROJECT.md narrative citing the truth source while preserving hand-curated parentheticals and bounded-diffing the rest of the file.

## What Landed

**Task 1 — Pass 1 (machine) `docs(17.04): emit project-validated-truth.md machine truth source (PROJECT-01 pass 1/2)` (commit sqwvvtt):**

- New file `.planning/intel/project-validated-truth.md` (357 lines).
- One `## v{X.Y} — {name}` heading per milestone (5 total: v1.0, v1.1, v1.2, v1.3, v1.4).
- Per-bullet REQ-ID rows with status marker (✓ Validated / ⏳ Pending / ⏸️ Deferred-by-design), phase reference, and one-line description.
- v1.4 section split into three sub-sections per the IP-4 ordering invariant: Shipped (Phases 14.1, 15, 16, 17), Pending (Phase 18: CLEANUP-01, CLEANUP-03..07, TEST-17), Deferred-by-design (MERGE-08).
- Decision PROJECT-01-form enforced: NO `scripts/reconcile-project-validated.cjs` written; inline computation is the artifact.

**Task 2 — Pass 2 (human) `docs(17.04): reconcile PROJECT.md ### Validated against truth source (PROJECT-01 pass 2/2)` (commit pomkznp):**

- Added a leading citation line below `### Validated` pointing to the truth file: "Per-REQ-ID truth source: `.planning/intel/project-validated-truth.md` (machine pass, Phase 17.04). The narrative below is the human-curated voice; the truth file is the structured enumeration both surfaces agree on."
- Added new `**v1.4 — Drift control + reconciliation (Phase 17, 2026-05-25):**` sub-section enumerating DOCS-08, DRIFT-01, DRIFT-02, DOCS-01..07 + DOCS-09 (batched), PROJECT-01 self-reference.
- Added new `### Pending (v1.4 — Phase 18 tactical cleanup + test-flake, slated post-17.04)` sub-section listing 7 Phase 18 REQ-IDs with ⏳ status markers — NOT marked Validated per IP-4 (Phase 18 runs after Phase 17.04).
- Changed MERGE-08 marker from ⏳ to ⏸️ Deferred-by-design (taxonomy alignment with truth file) while preserving original Phase 14.1 D-03 STRICT OOS asymmetry narrative.
- Updated HOOK-01..05 A3 caveat parenthetical: `(caveat: A3 colocated pre-commit gap remains open, see Active)` → `(caveat: A3 colocated pre-commit gap remained open from Phase 4; closed in v1.3 Phase 12 via HOOK-06/HOOK-07)` — preserves narrative voice while reflecting STATE.md current status.
- All other PROJECT.md sections (Active, Out of Scope, Context, Constraints, Key Decisions, Evolution, footer) UNTOUCHED per CF-06 anti-pattern-avoidance.

## Two-Pass Discipline Honored

Per Pitfall 8 + CF-06: machine pass committed FIRST (commit sqwvvtt), human pass committed SECOND (commit pomkznp). Each commit is recoverable independently — the human pass can be reverted without losing the machine pass, and vice versa.

PROJECT.md is NOT regenerate-overwrite output. The narrative voice (parentheticals like "remains open", caveats like "see Active", footnote-style annotations like "Validated in Phase 14.1") is owned by PROJECT.md; the structured per-REQ-ID enumeration is owned by the truth source. Future re-reconciliations regenerate the truth source freely and edit PROJECT.md surgically.

## IP-4 Satisfied (Wave 4 runs LAST)

Per Integration Pattern IP-4: v1.4's own REQ-IDs that landed in Waves 1-3 of Phase 17 (DOCS-08 from 17.01; DRIFT-01, DRIFT-02 from 17.02; DOCS-01..07 + DOCS-09 from 17.03) appear in the reconciled truth source AND in the PROJECT.md narrative because this plan ran LAST. PROJECT-01 self-reference is also captured — the truth file IS the artifact that closes PROJECT-01.

## Verification Outcomes

**Task 1 acceptance gates (all passed):**

- `test -f .planning/intel/project-validated-truth.md` → exists ✓
- `grep -c "^# PROJECT-VALIDATED-TRUTH"` → 1 ✓
- `grep -cE "^## v1\.[0-4]"` → 5 ✓ (one per milestone)
- v1.4 Phase 15+16 REQ-IDs (PARALLEL-08..CLEANUP-02) → 9 mentions ✓
- v1.4 Phase 17 REQ-IDs (DOCS-08, DRIFT-01/02, DOCS-01..07, DOCS-09, PROJECT-01) → 13 mentions ✓
- v1.4 Phase 18 REQ-IDs (CLEANUP-01, CLEANUP-03..07, TEST-17) → 7 mentions ✓
- MERGE-08 present → 3 mentions ✓
- Status markers (✓/⏳/⏸️) → 172 hits ✓
- File length 357 lines (≥60 line min_lines artifact contract) ✓
- `scripts/reconcile-project-validated.cjs` does NOT exist (plan decision PROJECT-01-form enforced) ✓

**Task 2 acceptance gates (all passed):**

- `### Validated` section heading preserved → 1 ✓
- `project-validated-truth.md` cited in narrative → 2 hits (citation line + PROJECT-01 bullet) ✓
- Phase 15 REQ-IDs (NAMING-01, VCS-21, VCS-22, PARALLEL-07) → present in PROJECT.md ✓
- Phase 16 REQ-IDs (LINT-06, CLEANUP-02) → present ✓
- Phase 17 REQ-IDs (DOCS-08, DRIFT-01/02, DOCS-01..09, PROJECT-01) → present ✓
- Phase 18 REQ-IDs (CLEANUP-01, CLEANUP-03..07, TEST-17) → present in new `### Pending` section ✓
- MERGE-08 present and marked ⏸️ Deferred-by-design ✓
- A3 caveat parenthetical preserved with closure annotation ✓
- `git diff --stat` shows bounded change (only `### Validated` section modified; +21 net lines; rest of PROJECT.md untouched) ✓

**Plan-level verification:**

- Drift control + inventory tests still green: `node --test tests/inventory-counts.test.cjs tests/architecture-counts.test.cjs tests/command-count-sync.test.cjs` → 17/17 pass ✓
- Working copy clean post-commits.
- Two atomic commits in correct order (Pass 1 → Pass 2) ✓

## Deviations from Plan

**Inadvertent emoji concatenation on MERGE-08 marker — caught and fixed pre-commit (Rule 1 — Bug).**

During the Task 2 edit changing MERGE-08's status marker from ⏳ to ⏸️, the initial Edit tool diff display made it look like the result was `⏳⏸️` (both markers). On re-read of the file, the actual line was correctly `⏸️` only — the diff display was visually misleading (showing old-marker next to new-marker), and the file content was already correct. No retroactive fix needed; the misread led to a follow-up Edit attempt that failed (string not found), confirming the file was already correct. Documented here for forensic completeness.

No other deviations. Both tasks executed exactly per plan with no Rule 1/2/3 auto-fixes and no Rule 4 architectural changes triggered.

## Authentication Gates

None encountered. Pure docs+intel surface; no I/O, no network, no external CLI calls.

## Threat Surface Scan

No new threat surface introduced. The plan's `<threat_model>` enumerated T-17.04-01 (Tampering — hand-curated narrative voice), T-17.04-02 (Information Disclosure — accept; truth file enumerates already-public REQ-IDs), T-17.04-03 (Repudiation — mitigate via per-pass commit granularity). All three mitigations honored:

- T-17.04-01: Hand-curated parentheticals verified preserved via grep (`caveat: A3` returns 1 hit, narrative survives).
- T-17.04-02: `.planning/intel/` directory continues to be the public artifact convention (analogous to `id-namespace-audit.md`, `vcs-adapter-surface-audit.md`); no new disclosure.
- T-17.04-03: Two atomic commits (sqwvvtt machine + pomkznp human) provide independent revert points.

## Known Stubs

None. Plan ships substantive content end-to-end; no placeholder data, no hardcoded empty arrays, no TODO/FIXME annotations in the new artifact. The "self-contained completeness" footer of the truth file is intentionally substantive (167-line enumeration), not a stub.

## Phase 17 Close-Gate Status

Phase 17 (drift-control-reconciliation) closes 12 REQ-IDs across 4 plans:

- 17.01 — DOCS-08 (Wave 1, prose-fix-before-tests)
- 17.02 — DRIFT-01, DRIFT-02 (Wave 2, drift tests RED→GREEN against Wave 1 fix)
- 17.03 — DOCS-01..07, DOCS-09 (Wave 3, batched per-theme docs cleanup; close-gate confirmed ≥99% pass rate)
- 17.04 — PROJECT-01 (Wave 4, two-pass reconciliation; THIS plan)

Phase 18 (tactical cleanup + test-flake — CLEANUP-01, CLEANUP-03..07, TEST-17) remains the final v1.4 phase. v1.4 milestone-close prerequisites for PROJECT.md reconciliation are now satisfied.

## Self-Check: PASSED

- `.planning/intel/project-validated-truth.md` exists ✓
- `.planning/PROJECT.md` modified per spec ✓
- Commit sqwvvtt (Pass 1) exists in log ✓
- Commit pomkznp (Pass 2) exists in log ✓
- Two atomic commits in correct order (Pass 1 before Pass 2) ✓
- All acceptance gates from Task 1 and Task 2 verified ✓
- Drift / inventory tests still green (17/17 pass) ✓
