---
phase: 12-a3-colocated-pre-commit-fix-parallel-track
plan: 02
subsystem: testing
tags: [jj, hooks, pre-commit, vitest, regression-test, colocated]

# Dependency graph
requires:
  - phase: 12-a3-colocated-pre-commit-fix-parallel-track
    provides: "12-01 cascade-amendment: ROADMAP SC2/SC3 + REQUIREMENTS HOOK-06/HOOK-07 reworded from .git/hooks/pre-commit to .githooks/pre-commit"
  - phase: 05-command-translations
    provides: "Path 1 fix shipped by plan 05-01 — jj backend commit() unconditionally fires .githooks/<stage> with GSD_HOOK_SKIP_COLOCATED=1 opt-out (sdk/src/vcs/backends/jj.ts:249-289)"
provides:
  - "HOOK-07 fires-exactly-once regression coverage in the jj-colocated describe block of sdk/src/vcs/__tests__/jj-hooks.test.ts"
  - "A counter-hook-body test that locks the shipped Path 1 behavior so a future double-fire (or re-introduced D-10 colocated no-op) fails CI"
affects: [phase-13-ci-integration, phase-12-hook-idempotency-audit]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Counter-hook-body assertion: a pre-commit hook that appends one constant line per fire (>> append, not truncate); marker line count === 1 proves exactly-once"

key-files:
  created: []
  modified:
    - "sdk/src/vcs/__tests__/jj-hooks.test.ts — added HOOK-07 it() block inside the jj-colocated describe block; added readFileSync to the existing node:fs import"

key-decisions:
  - "Placed the HOOK-07 it() between the GSD_HOOK_SKIP_COLOCATED test and the observational A3 test — a sibling inside the existing jj-colocated describe block, per plan action (D-04: no new file/fixture/helper)"
  - "Used the counter-hook-body pattern (echo fired >> markerPath) over the marker-absence-delta alternative — it is the SC2-verbatim 'fires exactly once' proof and is self-contained within one it()"
  - "Treated the tdd=\"true\" plan as a single test-add commit (no separate RED/GREEN): Path 1 production code already shipped at jj.ts:249-289, so the regression test is EXPECTED to pass on first run (plan acceptance_criteria: 'reports 1 test passing')"

patterns-established:
  - "Exactly-once hook-fire regression: reset marker (safeUnlink) before each commit, split marker on newline, filter trailing empty string, assert length === 1 — twice across two independent commits to prove per-commit (not cumulative) firing"

requirements-completed: [HOOK-07]

# Metrics
duration: 5min
completed: 2026-05-21
---

# Phase 12 Plan 02: HOOK-07 fires-exactly-once regression test Summary

**HOOK-07 regression test in the jj-colocated block of jj-hooks.test.ts — a counter-hook body proves vcs.commit() fires .githooks/pre-commit exactly once per commit across two independent commits, locking the already-shipped Path 1 fix against a future double-fire.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-21T03:22:55Z
- **Completed:** 2026-05-21T03:27:55Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Added the `'HOOK-07: colocated vcs.commit fires .githooks/pre-commit exactly once'` `it()` block as a sibling inside the existing `describe('jj-colocated: pre-commit always fires from adapter (D-32 — D-10 retired)', …)` block at `jj-hooks.test.ts:167` — no new test file, no new fixture, no new helper (CONTEXT D-04).
- The test uses a counter hook body (`echo fired >> "${markerPath}"`) — an APPEND, not a truncate — so a future double-fire would leave 2 marker lines and break the test. The net-new assertion over the sibling `:199` test is the exact line-count check (`=== 1`), not mere file existence.
- The edge assertion fires a second independent `vcs.commit()` (distinct `co-hook07-b.txt` staged file) and re-asserts the freshly-reset marker has exactly 1 line — proving "once per commit", not a cumulative count drift.
- The new block reuses the shared `beforeAll` colocated fixture (`dir`/`vcs`), the module-level `writeHook`/`safeUnlink` helpers, and the `describe.skipIf(!jjAvailable)` suite-skip guard. It introduces no raw `git ` shell invocation — only `vcs.commit`, `writeHook`, `safeUnlink`, and `node:fs` calls.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add HOOK-07 fires-exactly-once regression test to the jj-colocated block** - `lwzqpyvt` (test)

**Plan metadata:** committed separately (docs: complete plan)

_Note: this tdd-flagged plan produced a single `test(...)` commit — the Path 1 production code being guarded (`sdk/src/vcs/backends/jj.ts:249-289`) was already shipped by Phase 5 plan 05-01, so there is no separate GREEN/feat commit. The regression test passes on first run by design._

## Files Created/Modified

- `sdk/src/vcs/__tests__/jj-hooks.test.ts` - Added the HOOK-07 `it()` block inside the jj-colocated describe block (counter-hook-body exactly-once proof across two commits); added `readFileSync` to the existing `node:fs` import statement (no new import line).

## Decisions Made

- **Single test-add commit for a tdd-flagged plan:** the plan frontmatter carries `tdd="true"`, but the entire purpose (per `must_haves` D-01 and the objective) is to lock *already-shipped* behavior. Path 1 is live at `jj.ts:249-289`. The plan-level TDD gate's "fail-fast if RED passes" rule does not apply here because there is no implementation step separate from the test — the production code already exists, and the plan's `acceptance_criteria` explicitly expects "1 test passing." Committed as one `test(...)` commit.
- **Counter-hook-body over marker-absence-delta:** PATTERNS.md offered two viable patterns for the net-new "fires exactly once" assertion. Chose the counter hook body (the SC2-verbatim proof) — it is self-contained in one `it()` and directly catches a double-fire, whereas the marker-absence-delta would pair with the opt-out test's zero-fire clause.
- **Placement between the opt-out test and the observational A3 test:** the plan action permitted either position; placed before the A3 observational test to keep the three positive-fire tests grouped ahead of the observational one.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The HOOK-07 test passed on first vitest run; the full `jj-hooks.test.ts` suite passed (9/9, up from 8 before this plan). `jj` is available on this runner, so the suite ran rather than skipped.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- HOOK-07 regression coverage is in place and green; ready for Phase 13 CI integration where the `parallel-e2e` lane validates the regression on a colocated fixture.
- Phase 12 plan 03 (the SC4 `12-HOOK-IDEMPOTENCY-AUDIT.md` standalone audit artifact) remains; it does not depend on this plan's test code.
- No production source file was modified — `sdk/src/vcs/backends/jj.ts` and `sdk/src/vcs/hook-bridge.ts` are untouched, satisfying the plan's verification invariant.

## Self-Check: PASSED

- `sdk/src/vcs/__tests__/jj-hooks.test.ts` — modified, verified present (HOOK-07 `it()` block added; full suite 9/9 green).
- `grep -c "describe('jj-colocated"` returns 1 (no second describe block created).
- `grep -c "mkdtempSync("` returns 2 (unchanged — shared fixture reused, no new fixture).
- No NEW raw-git invocation introduced (all 7 `git ` matches are pre-existing: `jj git init` subcommands and the A3 observational test's pre-existing `.git/hooks` prose/comment lines).
- Task 1 commit `lwzqpyvt` (`test(12-02): add HOOK-07 fires-exactly-once regression …`) verified present in `gsd-sdk query log`; no file deletions introduced (`@-..@` name-status has no `D` rows).

---
*Phase: 12-a3-colocated-pre-commit-fix-parallel-track*
*Completed: 2026-05-21*
