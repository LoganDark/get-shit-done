---
phase: 19-upstream-merge-conflict-resolution-fork-abstraction-audit
plan: 10
subsystem: lint-gates-invariant-tooling
tags: [lint, allowlist, baseline, cts, pitfall-8, merge-05, jj, raw-git, commit-id]

# Dependency graph
requires:
  - phase: 19-upstream-merge-conflict-resolution-fork-abstraction-audit
    provides: "19-09: launcher git-first leg flagged for allowlist accounting + pre-commit lints wired known-RED (21 raw-git + 30 commit-id hits); 19-08: workspace.parallel.{dispatch,fan-in} wired into execute-phase/quick fences; 19-07: substrate dispositions for shell-command-projection/worktree-safety/worktree-base-ref + graphify/verify migrations"
provides:
  - "All four fork invariant gates exit 0 over the adopted tree: lint-vcs-no-raw-git, lint-vcs-no-commit-id, audit-workflow-raw-git, lint-vcs-parallel-call-presence"
  - "The .cts blindness booby trap (Pitfall 8 / T-19-26) is CLOSED with mechanical proof: both scanners' SCAN_EXT include cts and the extended fixture test plants .cts violations that MUST be reported by each scanner"
  - "Both allowlists re-pointed at the adopted tree (src/*.cts re-points + substrate/CI/fixture additions); every legacy sdk/** and get-shit-done/** entry RETAINED under the pending-19-12-residue-deletion ledger row"
  - "audit-workflow-raw-git frozen baseline machine-re-derived: 230 hits / 93 files (replaces the obsolete 127-hit fork-path map); derivation transcript + one count-rationale row per file in the ledger appendix"
  - "T-19-28 walk-ignore: emitted gitignored gsd-core/bin/lib artifacts excluded from both scanners (checked-in legacy-cleanup.cjs + package-identity.cjs stay scanned), fixture-proven"
  - "One-shot scripts dispositioned: audit-id-namespace re-pointed (src + gsd-core/workflows, +cts) and runs green; audit-root-commits-rename + migr-06-close-gate marked HISTORICAL (retained, inactive)"
  - "The 19-09 known-RED pre-commit lint wiring flips green (both wired lints now exit 0 on this tree)"
affects: [19-12 (strips legacy allowlist entries after residue deletion; re-runs both gates), 19-13 (ledger completeness proof parses the new rows)]

# Tech tracking
tech-stack:
  added: []
  patterns: ["baseline re-derivation by the script's OWN counter with transcript pasted into the ledger (Don't-Hand-Roll rule)", "emitted-artifact walk-ignore: prefix match on gsd-core/bin/lib/ with an explicit checked-in exception set, shared shape across both scanners", "positive-detection fixture tests as the anti-vacuity guard for scanner extension widening"]

key-files:
  created:
    - tests/scripts/lint-vcs-no-raw-git-fixture.test.cjs (ported from tests/ + extended)
  modified:
    - scripts/lint-vcs-no-raw-git.cjs
    - scripts/lint-vcs-no-commit-id.cjs
    - scripts/lint-vcs-no-raw-git.allow.json
    - scripts/lint-vcs-no-commit-id.allow.json
    - scripts/audit-workflow-raw-git.cjs
    - scripts/lint-vcs-parallel-call-presence.cjs
    - tests/scripts/lint-vcs-parallel-call-presence.test.cjs (+ 5 fixture-tree renames)
    - scripts/audit-id-namespace.cjs
    - scripts/audit-root-commits-rename.cjs
    - scripts/migr-06-close-gate.cjs
    - .planning/phases/19-upstream-merge-conflict-resolution-fork-abstraction-audit/19-MERGE-AUDIT.md
    - .planning/phases/19-upstream-merge-conflict-resolution-fork-abstraction-audit/deferred-items.md

key-decisions:
  - "Launcher snippet allowlisted (not pattern-weakened): the deliberate git-first leg in _runtime-launcher.snippet.sh keeps its raw-git hit; allowlist entry cites the 19-09 three-stage-resolution ledger row, exactly per the plan's fallback instruction"
  - "hooks/gsd-workflow-guard.js got a FRESH substrate disposition row (file was never audited in 19-09): single read-only `git branch --show-current` probe, fail-open degrade class"
  - "New audit baseline shape: 230/93 dominated by the launcher embed (+1 per embedded file) — the research expectation 'fork-rewired files near zero' did not survive 19-09's embed sync; per-file embed/content split computed mechanically and ledgered"
  - "audit-id-namespace RE-POINTED (live invariant: re-runnable commit_id-surface enumerator); audit-root-commits-rename + migr-06-close-gate marked HISTORICAL — their targets (completed 15.01 rename; archived Phase 8 dir) cannot recur"
  - "Phantom-entry rule honored: no commit-id allowlist entries minted for src/vcs-command-router.cts or src/vcs/parse/jj-log.cts (zero hits under the widened scan); ledgered as no-entry decisions"

requirements-completed: []  # MERGE-05 is tracked at the ROADMAP plan line (not in REQUIREMENTS.md — Phase 19 phase-scoped REQ precedent per 19-09); legacy-entry strip in 19-12 completes the allowlist story

# Metrics
duration: ~30min
completed: 2026-06-10
---

# Phase 19 Plan 10: Lint-gate re-pointing + .cts booby-trap closure Summary

**All four fork invariant gates are green over the adopted tree with the Pitfall 8 vacuity hole closed mechanically: SCAN_EXT +cts in both scanners proven by planted-violation fixture tests, allowlists re-pointed line-by-line (legacy entries retained for the 19-12 residue), and the workflow raw-git baseline machine-re-derived at 230 hits / 93 files with a per-file rationale ledger.**

## Performance

- **Duration:** ~30 min (2026-06-10 13:30–14:00 UTC)
- **Tasks:** 3
- **Files:** ~19 touched (1 created via move+extend, 5 fixture renames, 13 modified)

## Accomplishments

- **Task 1 (.cts closure + allowlist re-point):** Both scanners now scan `.cts` and skip the build-emitted gitignored `gsd-core/bin/lib/**` artifacts (which accounted for 8 of the commit-id lint's 15 pre-fix violation files — phantom hits in generated code). Raw-git allowlist: +18 entries (3 src/vcs re-points + the `src/vcs/__tests__/**` glob re-point + the 3 19-07 substrate modules + launcher snippet + 2 hooks + 6 upstream CI/release scripts + tests/fixtures/index.cjs); commit-id allowlist: +16 entries (7 src/*.cts re-points + worktree-safety + UUID/sha256 false-positive class + `.planning/**` harvest glob + the fixture test self-reference). Every legacy `sdk/**`/`get-shit-done/**` entry retained. Fixture test ported to `tests/scripts/` and extended: a planted `.cts` `spawnSync('git')` and a planted `.cts` `.commit_id` access are each REPORTED (positive detection), and the emitted-artifact ignore is proven non-blanket (checked-in exception still flags). 10/10 tests pass.
- **Task 2 (scan roots + baseline):** `audit-workflow-raw-git.cjs` re-pointed to `gsd-core/{workflows,references}` + `agents`; the frozen baseline was re-derived by the script's OWN fence-aware counter (`auditWorkflowRawGit` with `baseline: {}`) — 230 hits / 93 files, replacing the obsolete 127-hit fork-path map. Regression rule byte-identical; first green run current == baseline. The `--json` derivation transcript plus one count-rationale row per baseline file (embed/content split computed from the script's own hit list) live in the ledger appendix. `lint-vcs-parallel-call-presence.cjs` re-pointed to `gsd-core/workflows` with the allowlist still EMPTY — green because 19-08 wired dispatch+fan-in literals into execute-phase.md and quick.md fences.
- **Task 3 (one-shot scripts):** `audit-id-namespace.cjs` re-pointed (`src` + `gsd-core/workflows`; dead `get-shit-done` roots dropped; SCAN_EXT +cts) and runs exit 0 emitting a 51-row diagnostic verdict table. `audit-root-commits-rename.cjs` (15.01 rename shipped; symbol gone) and `migr-06-close-gate.cjs` (Phase 8 dir archived; one-shot already fired) marked HISTORICAL via header comments — retained, never deleted. Hand-edited `.cjs` inventory appendix gained 10 rows, all `node -c` confirmed; 32/32 unit tests for the three scripts pass.

## Task Commits

Each task committed on top of the stack above merge change `vpzlrrlv` (untouched):

1. **Task 1: SCAN_EXT +cts + allowlist re-point + fixture proof** — `b929b0ee` / change `lzqypzul` (feat)
2. **Task 2: scan roots + machine-derived 230-hit baseline** — `9a0ded32` / change `srlnkrum` (feat)
3. **Task 3: one-shot scripts re-point / historical markers** — `1923747a` / change `uqytwrtz` (chore)

## Deviations from Plan

**1. [Rule 1 - Bug] Presence-lint fixture trees renamed `get-shit-done` → `gsd-core`**
- **Found during:** Task 2 (post-re-point unit-test run: D-14 #2/#3 failed)
- **Issue:** the checked-in fixture trees mirror the production scan root by construction; after the SCAN_ROOTS re-point the scanner found nothing under the fixture roots and exited 0 where the tests expect 1.
- **Fix:** 5 fixture files moved to `*/gsd-core/workflows/`; 2 synthetic allowlist path strings in the test updated. 12/12 pass.
- **Commit:** 9a0ded32

**2. [Rule 2 - Missing critical functionality] Fresh substrate disposition for `hooks/gsd-workflow-guard.js`**
- **Found during:** Task 1 (whole-repo scan surfaced a raw `spawnSync('git', ['branch','--show-current'])` hit in a file the plan's "only 19-09-ledgered hook files" instruction did not cover — it was never audited in 19-09)
- **Fix:** allowlist entry + a NEW ledger disposition row (substrate: read-only probe, fail-open degrade — same class as gsd-worktree-path-guard.js) rather than leaving the gate red or silently glob-allowing hooks/.
- **Commit:** b929b0ee

**3. [Adaptation] Commit-id allowlist needed entries beyond the plan's named re-points**
- **Found during:** Task 1 (widened scan)
- **Issue:** the widened `.cts` scan surfaced false-positive classes the plan letter didn't enumerate: UUID v4 regex (observability), sha256 content-key regexes (research-store), synthetic SHA fixtures (worktree-base-ref tests), the `.planning/**` harvest copies, and the new fixture test's own planted literal.
- **Fix:** reasoned per-entry additions (each with a ledger row), per the plan's "remaining hits get reasoned allowlist entries" clause. Conversely, NO entries were minted for `src/vcs-command-router.cts` / `src/vcs/parse/jj-log.cts` (zero hits — phantom-entry rule).
- **Commit:** b929b0ee

**4. [Plan-expectation correction] Baseline shape: launcher embed dominates**
- **Found during:** Task 2 derivation
- **Issue:** research expected "fork-rewired files near zero"; in reality every embedded workflow file carries +1 from the 19-09 launcher embed's deliberate git-first leg (58 files are embed-only), so the baseline is 230/93 rather than a shrunken 127-class map.
- **Fix:** none needed — the embed leg is ledgered substrate; the per-file rationale rows make the composition auditable, and any future fix is a baseline reduction, never a regression.
- **Commit:** 9a0ded32

**5. [Scope boundary] Deferred item #5 filed: two old-form launcher embeds outside `gsd-core/workflows/`**
- **Found during:** Task 2 derivation (`agents/gsd-phase-researcher.md`, `gsd-core/references/planner-load-graph-context.md` carry the pre-19-09 `git rev-parse … || pwd` form with no jj leg)
- **Fix:** not fixed here (19-09's sync scope was workflows-only; extending it is out of this plan's files list); logged to deferred-items.md for 19-12/19-13.
- **Commit:** 9a0ded32

## Authentication Gates

None.

## Verification Results

- **Task 1 verify line:** PASS — both lints exit 0; fixture suite 10/10 via `run-tests.cjs --files`; `cts` present in both scanners; `pending-19-12-residue-deletion` greps in the ledger.
- **Task 2 verify line:** PASS — audit (230 within baseline, 0 regressions, exit 0) + presence lint (107 files, 0 violations) green; zero `get-shit-done/workflows` references remain in either script; baseline keys all `gsd-core/`/`agents/` paths; derivation transcript pasted in the ledger appendix.
- **Task 3 verify line:** PASS — `node -c` green on all three scripts; `audit-id-namespace` greps in the ledger (3 hits); re-pointed audit runs exit 0; 32/32 unit tests for the three scripts pass.
- **Overall:** all four gates exit 0 in one chain + the planted `.cts` violations are REPORTED (non-vacuous). The 19-09 known-RED pre-commit lint wiring is now green by construction (both wired lints exit 0).
- jj discipline: three task commits stack linearly above `fc9cedba` (19-09 tail); `vpzlrrlv` untouched; no bookmark moves, no op restore.

## Known Stubs / Forward Pointers

- **19-12:** strips the retained legacy `sdk/**` / `get-shit-done/**` allowlist entries (both files) after the residue deletion and re-runs both gates — the `pending-19-12-residue-deletion` ledger row is the contract. The `src/vcs/__tests__/**` allowlist glob is pre-pointed for the 19-11/19-12 test revival (matches nothing today, by design).
- **19-12/19-13:** deferred item #5 — 2 old-form launcher embeds outside workflows/ (jj-leg missing); fixing them later reduces the frozen baseline, never regresses it.
- Deferred items #2–#4 (build-state test re-baselines suggested "19-10/19-12") were NOT picked up here: this plan's locked files list is gate scripts + allowlists + ledger only; they remain filed for the 19-11/19-12 test-revival plans.

## Self-Check: PASSED

- Files exist: tests/scripts/lint-vcs-no-raw-git-fixture.test.cjs, 19-10-SUMMARY.md — FOUND; tests/lint-vcs-no-raw-git-fixture.test.cjs (old location) — correctly ABSENT
- Commits present in `jj log`: b929b0ee (lzqypzul), 9a0ded32 (srlnkrum), 1923747a (uqytwrtz)
- Verifies re-run clean post-commit (four gates exit 0; fixture 10/10; node -c all green)

---
*Phase: 19-upstream-merge-conflict-resolution-fork-abstraction-audit*
*Completed: 2026-06-10*
