---
phase: 18-tactical-cleanup-test-flake-re-scoped
plan: 04
subsystem: workflows
tags: [jj, vcs-adapter, assert-clean-wc, status-porcelain, jq, gap-closure]

# Dependency graph
requires:
  - phase: 18-tactical-cleanup-test-flake-re-scoped (plan 18-01)
    provides: the assert_clean_wc gates (transition.md + execute-phase.md) whose .raw-keyed predicate this plan corrects
provides:
  - entries-keyed assert_clean_wc fences in transition.md, execute-phase.md, plan-phase.md (cross-backend porcelain contract — empty entries[] = clean)
  - entries-keyed dirty-tree guard in undo.md execute_revert (/gsd-undo usable on jj)
  - 12-run dual-backend fixture matrix proving clean-silent + dirty-FATAL behavior on jj AND git
  - deferred-items.md section 3 — raw-asymmetry decision, dormant .raw checks, REQ-18-04-A (swallowed exec failure)
affects: [transition, execute-phase, plan-phase, undo, milestone-close, UAT]

# Tech tracking
tech-stack:
  added: []
  patterns: ["WC-cleanliness predicates key on status --porcelain `.entries` (empty = clean), never `.raw` — `.raw` is display-only backend stdout (human-readable `jj st` text on jj)", "per-entry jq error alternative `[.entries[] | (.path // error(...))]` so empty streams stay clean-silent and pathless entries abort"]

key-files:
  created: []
  modified:
    - gsd-core/workflows/transition.md
    - gsd-core/workflows/execute-phase.md
    - gsd-core/workflows/plan-phase.md
    - gsd-core/workflows/undo.md
    - .planning/phases/18-tactical-cleanup-test-flake-re-scoped/deferred-items.md

key-decisions:
  - "jj status({porcelain:true}).raw NOT normalized to porcelain lines — contract pinned by router statusVerb, gsd-executor.md display sites, and jj-status-log-diff.test.ts; .raw is display-only, entries[] is the cleanliness contract"
  - "Dormant .raw checks at execute-phase.md ~307 and quick.md ~208 left in place — git-mode-only branching blocks (branching_strategy != none), cannot fire on jj today"
  - "Swallowed-exec-failure hole deferred as REQ-18-04-A — fixing it changes the live status-verb contract, out of workflow-markdown scope"

patterns-established:
  - "Backend-exercised meta-assertion in dual-backend fixtures: assert the adapter actually in play via a backend-shaped raw probe before trusting the matrix (closes the 18-01 wrong-backend verification escape)"

requirements-completed: [CLEANUP-01]

# Metrics
duration: 6min
completed: 2026-06-11
---

# Phase 18 Plan 04: assert_clean_wc entries-keyed predicate fix Summary

**UAT test 5 blocker closed: all three assert_clean_wc fences + the /gsd-undo dirty guard now key dirty detection on the structured `entries[]` array instead of `.raw`, so a clean jj working copy passes silently (exit 0) while every dirty and probe-failure mode still FATALs — proven by a 12-run dual-backend mktemp fixture matrix.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-06-11T06:22:47Z
- **Completed:** 2026-06-11T06:29:06Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Re-keyed the DIRTY predicate in `transition.md`, `execute-phase.md`, and `plan-phase.md` assert_clean_wc fences on `[.entries[] | (.path // error("entry missing path"))]` — the cross-backend porcelain contract (empty = clean). `.raw` is never consulted; the unreachable "entries empty but raw says dirty" fallback (`|| DIRTY_PATHS="$DIRTY"`) is removed. The three probe lines (STATUS_JSON= / DIRTY_PATHS=) are byte-identical across all three files (diff-verified).
- Re-keyed the `undo.md` execute_revert dirty-tree guard on the same entries predicate — `/gsd-undo` no longer unconditionally aborts on a clean jj working copy.
- Preserved every fail-closed branch: non-zero query exit, non-ok envelope, missing/non-array `entries`, an entry without `.path`, and unparseable JSON all abort with FATAL — a broken probe never resolves to "clean".
- Behaviorally verified all three fences on BOTH backends with adapter-pinned ephemeral fixtures (the 18-01 escape — unpinned adapter exercising only git — is guarded by an explicit backend meta-assertion).
- Documented the jj `.raw` asymmetry decision, the two dormant git-mode-only `.raw` checks, and the swallowed-exec-failure hole (REQ-18-04-A) in deferred-items.md.

## Task Commits

Each task was committed atomically (jj change ids; the `query commit` envelope reports the new empty @ per the known v15-query-commit-envelope-defects quirk, so created commits were probed via `query log`):

1. **Task 1: Re-key all three assert_clean_wc fences + the undo.md dirty guard on entries[]** - `uxpxzztx` (fix)
2. **Task 2: Behavioral dual-backend fixture verification + asymmetry/deferred notes** - `poommzxw` (docs)

## Files Created/Modified

- `gsd-core/workflows/transition.md` - assert_clean_wc fence: entries-keyed probe, banner "before transition completion" unchanged
- `gsd-core/workflows/execute-phase.md` - assert_clean_wc fence: identical probe lines, banner "before phase completion" unchanged
- `gsd-core/workflows/plan-phase.md` - §16 fence: identical probe lines, banner "before phase planning declaration" + its shorter categorize-comment variant preserved
- `gsd-core/workflows/undo.md` - execute_revert dirty-tree guard: entries-keyed jq predicate, fail-on-broken-probe sentence, .raw warning added; HARD CONSTRAINT + backend-semantic-shift callout untouched
- `.planning/phases/18-tactical-cleanup-test-flake-re-scoped/deferred-items.md` - section 3: raw-asymmetry, dormant checks, REQ-18-04-A

## Fixture Verification Transcripts

All under `mktemp -d "${TMPDIR:-/tmp}/gsd-18-04-gate-XXXXXX"` with trap-rm; both fixtures `jj git init --colocate` + repo-scoped user config; gate scripts extracted verbatim from the live workflow files with a `gsd_run()` shim pointing at this clone's `gsd-tools.cjs`; `GSD_VCS` unset; fixture A pinned `{"vcs":{"adapter":"jj"}}`, fixture B pinned `{"vcs":{"adapter":"git"}}`.

### Backend meta-assertion (clean-state raws)

- Fixture A (jj) raw: `The working copy has no changes.|Working copy  (@) : lxkqmvlo 2038e4c2 (empty) (no description set)|Parent commit (@-): yvsqysuo 6bd9ef93 seed 18-04 gate fixture (jj adapter)` — jj-shaped (contains "Working copy") ✓
- Fixture B (git) raw: `` (empty — git porcelain on clean) — NOT jj-shaped ✓

### 12-run gate matrix (3 fences x 2 backends x 2 states)

| Run | Fixture | Gate | State | Expected | Result |
|-----|---------|------|-------|----------|--------|
| 1 | A (jj) | transition | clean | exit 0, silent | PASS |
| 2 | A (jj) | execute-phase | clean | exit 0, silent | PASS |
| 3 | A (jj) | plan-phase | clean | exit 0, silent | PASS |
| 4 | A (jj) | transition | dirty | exit 1, "before transition completion" + dirty-synthetic.txt | PASS |
| 5 | A (jj) | execute-phase | dirty | exit 1, "before phase completion" + dirty-synthetic.txt | PASS |
| 6 | A (jj) | plan-phase | dirty | exit 1, "before phase planning declaration" + dirty-synthetic.txt | PASS |
| 7 | B (git) | transition | clean | exit 0, silent | PASS |
| 8 | B (git) | execute-phase | clean | exit 0, silent | PASS |
| 9 | B (git) | plan-phase | clean | exit 0, silent | PASS |
| 10 | B (git) | transition | dirty | exit 1, banner + path | PASS |
| 11 | B (git) | execute-phase | dirty | exit 1, banner + path | PASS |
| 12 | B (git) | plan-phase | dirty | exit 1, banner + path | PASS |

Runs 1-3 are the exact 18-UAT.md test 5 failure mode (clean jj WC) now passing.

### undo.md guard predicate (fixture A, jj, command-level)

- Clean: exit 0, empty output ✓
- Dirty: exit 0, emits `dirty-synthetic.txt` ✓ (workflow prose then aborts on non-empty output)

### Residue

Zero `gsd-18-04-*` directories left in TMPDIR post-run (trap-rm verified).

## Verification Results

- `! grep -rn "then .raw else" gsd-core/workflows/` — PASS (zero .raw-keyed gate predicates anywhere in workflows/)
- STATUS_JSON/DIRTY_PATHS probe lines byte-identical across the three fence files — PASS (diff of extracted lines: empty)
- Raw fallback `|| DIRTY_PATHS="$DIRTY"` gone from all three — PASS
- `jq -r '.raw // ""'` gone from undo.md — PASS
- `node scripts/audit-workflow-raw-git.cjs` — PASS at the frozen 230-hit baseline (0 regressions)
- `node scripts/lint-vcs-no-raw-git.cjs` — PASS (1073 files, 0 violations)
- `node scripts/lint-vcs-parallel-call-presence.cjs` — PASS (107 files, 0 violations)
- Live-repo proof: corrected entries predicate on THIS repo (vcs.adapter jj) resolves clean once the orchestrator's pending STATE.md update is committed (see Issues Encountered) — the 18-UAT.md test 5 reproduction now passes

## Decisions Made

- jj `.raw` left as human-readable backend stdout (asymmetry documented, not normalized) — live consumer contract pinned by router/executor-display/test surfaces
- Dormant `.raw` checks (execute-phase.md ~307, quick.md ~208) left in place — git-mode-only branches
- Swallowed-exec-failure hole deferred as REQ-18-04-A — status-verb contract change out of workflow-markdown scope

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The Task 2 automated verify's live-repo clean probe initially returned non-empty `entries`: a pre-existing `.planning/STATE.md` modification (the execute-phase orchestrator's "Phase 18 execution started" position update, written before this executor was spawned and intentionally left for the plan-completion metadata commit). Not a leak from this plan's tasks — it is swept by this plan's final `docs(18-04)` metadata commit, after which the live-repo probe resolves CLEAN (re-verified post-commit; see Self-Check).

## Global-Install Caveat (operator action)

The installed copies at `~/.claude/gsd-core/workflows/` still carry the pre-fix `.raw`-keyed fences until the operator reinstalls from this clone:

```
node bin/install.js --claude --global
```

Never use the upstream npx installer — it lacks the fork's jj fixes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 18 UAT test 5 blocker gap closed — all 4 plans complete; phase completion and v1.5 milestone close unblocked (the transition/execute-phase gates this plan fixed are the very gates the close runs through)
- REQ-18-04-A (swallowed backend exec failure presents as clean envelope) filed in deferred-items.md for a future status-verb contract fix

## Self-Check: PASSED

- All 5 modified files + SUMMARY exist on disk ([ -f ] verified)
- Both task commits present in the log: `uxpxzztx` (Task 1 fix), `poommzxw` (Task 2 docs)
- Plan-level verification re-run post-tasks: workflow-wide grep clean, probe-line byte-identity, audit 230-hit baseline, both vcs lints green

---
*Phase: 18-tactical-cleanup-test-flake-re-scoped*
*Completed: 2026-06-11*
