---
phase: 18-tactical-cleanup-test-flake-re-scoped
plan: 03
subsystem: testing
tags: [vitest, jj, test-flake, re-verification, jj-reap, test-isolation]

# Dependency graph
requires:
  - phase: 19-upstream-merge
    provides: root vitest.config.ts (19-11 locked — maxWorkers 2 + unit testTimeout 30_000), src/vcs/__tests__ relocated suite
  - phase: 18-tactical-cleanup-test-flake-re-scoped (plan 18-02)
    provides: CONFIG-02 tmpDir hygiene (zero gsd-cfg02-* leakage into shared TMPDIR during full-suite runs)
provides:
  - "TEST-17 verdict (b): jj-reap inclusion-filter flake NOT reproducible under the current locked config — closed as resolved-by-restructure with 5-run evidence"
  - "Phase 18 post-merge integration gate evidence: 3 consecutive full-suite runs at 618/618 tests passing with 18-01 + 18-02 changes on the tree"
  - "Deferred item: intermittent birpc onTaskUpdate unhandled error (exit 1, zero test failures) logged to phase deferred-items.md"
affects: [future test-perf phase (project_test_perf_pain_vitest), v1.5 milestone close]

# Tech tracking
tech-stack:
  added: []
  patterns: [re-verify-then-fix gate — reproduce a recorded flake under current config BEFORE applying any fix; private-TMPDIR-per-run suite isolation (TMPDIR=$(mktemp -d) prefix)]

key-files:
  created:
    - .planning/phases/18-tactical-cleanup-test-flake-re-scoped/deferred-items.md
  modified: []

key-decisions:
  - "TEST-17 verdict (b) resolved-by-restructure: inclusion-filter passed all 5 invocations (419-473ms, never near any timeout); 19-11 removed the flake's preconditions twice over (maxWorkers 2 + unit testTimeout 30_000 replaced the 5s default)"
  - "Exit-1 runs with 618/618 passing classified as the distinct birpc RPC-starvation phenomenon, NOT a TEST-17 reproduction — deferred per Pitfall 9 scope fence"
  - "Zero source/test/config edits: vitest.config.ts byte-identical, jj-reap.test.ts untouched, stale 15_000 literal moot (fix path never fired)"

patterns-established:
  - "Re-verify gate: a recorded flake whose preconditions were removed by config restructure must be re-reproduced under the NEW config before any fix lands"

requirements-completed: [TEST-17]

# Metrics
duration: 10min
completed: 2026-06-10
---

# Phase 18 Plan 03: TEST-17 jj-reap flake re-verify-then-fix Summary

**Verdict (b) — the jj-reap inclusion-filter flake is NOT reproducible under the 19-11 config (3 full-suite runs + regression-gate shape + isolation control, inclusion-filter 419-473ms every time): closed as resolved-by-restructure with zero file edits.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-06-10T22:07:46Z
- **Completed:** 2026-06-10T22:17:30Z
- **Tasks:** 2
- **Files modified:** 0 source/test/config files (2 planning docs created: this SUMMARY + deferred-items.md)

## Accomplishments

- Ran the full re-verification gate BEFORE touching anything: 3 consecutive full-suite runs (`TMPDIR=$(mktemp -d) GSD_TEST_BACKENDS=git,jj npx vitest run`), the original Phase 14 3-file regression-gate shape, and the isolation control — the TEST-17 timeout never fired
- Declared verdict (b) on recorded evidence and closed todo `v14-jj-reap-test-flake` as resolved-by-restructure; tree left untouched (Pitfall 9 envelope trivially satisfied — 0 LOC diff)
- These full-suite runs double as the phase's post-merge integration gate: plans 18-01 (transition.md workflow edits) and 18-02 (router guards + script hardening + test cleanup) were already on this tree, and the suite ran 618/618 three times over both backends with them included
- Surfaced and ledgered the one confound honestly: an intermittent unhandled birpc error (`[vitest-worker]: Timeout calling "onTaskUpdate"`) flipped 2 of 3 run exit codes to 1 with **zero test failures** — distinct from TEST-17, out of scope per Pitfall 9, logged to `deferred-items.md`

## Run Evidence (Task 1 gate)

All runs on this tree (18-01 + 18-02 already landed), fresh `mktemp -d` TMPDIR per suite invocation:

| # | Command shape | Exit | Tests | Suite duration | inclusion-filter result |
|---|---------------|------|-------|----------------|-------------------------|
| 1 | full suite, `GSD_TEST_BACKENDS=git,jj` | 1* | 618 passed / 0 failed (61 files) | 111.92s | PASS 435ms |
| 2 | full suite, `GSD_TEST_BACKENDS=git,jj` | 0 | 618 passed / 0 failed (61 files) | 103.41s | PASS 464ms |
| 3 | full suite, `GSD_TEST_BACKENDS=git,jj` | 1* | 618 passed / 0 failed (61 files) | 113.06s | PASS 442ms |
| 4 | Phase 14 regression-gate 3-file shape (`jj-reap` + `cmd-parallel-jj` + `cmd-parallel-git`) | 0 | 32 passed / 0 failed (3 files) | 49.40s | PASS 473ms |
| 5 | isolation control (`--project unit ... -t 'inclusion-filter'`) | 0 | 1 passed / 4 skipped | 1.20s | PASS 419ms |

\* Exit 1 caused by exactly one unhandled `Error: [vitest-worker]: Timeout calling "onTaskUpdate"` (birpc RPC starvation — the phenomenon described in the 19-11 `vitest.config.ts` comments), with all 618 tests reported passing. No test timed out; no test failed. See Issues Encountered + `deferred-items.md`.

Note on counts: the suite is now **618 tests / 61 files** vs the 19-13 phase gate's 612 — the +6 are 18-02's new dispatch-guard contract tests, on-tree for all runs above.

## Verdict: (b) resolved-by-restructure

**The TEST-17 flake did not reproduce.** The original failure mode — `inclusion-filter` timing out at 5000ms under the retired `sdk/vitest.config.ts` full worker parallelism — is impossible under the current locked config because 19-11 removed both preconditions:

1. `maxWorkers: 2` caps parallel subprocess load (root-level, `vitest.config.ts:44`)
2. The unit project's `testTimeout: 30_000` replaced the 5s default the original flake fired against (`vitest.config.ts:58`)

Observed inclusion-filter timings (435/464/442/473/419ms) sit ~65x under the current budget and within noise of the original 636ms isolation baseline from the todo.

**Closure statement:** todo `v14-jj-reap-test-flake` (REQ TEST-17, ROADMAP SC5) is CLOSED as resolved-by-restructure, evidenced by the 5-run table above. The acceptance criterion "flake doesn't re-surface in 3+ consecutive runs" is satisfied at the test level: 3 consecutive full-suite runs with 618/618 passing and inclusion-filter green in each. No fix was needed; none was applied.

**Stale-literal note (locked deviation, recorded for completeness):** the REQUIREMENTS fix-shape literal `it(..., 15_000)` was never applied — verdict (a) did not fire, and had it fired the plan's locked deviation (`{ timeout: 60000 }` options-object form, since 15_000 would now REDUCE the effective timeout below the 30_000 project default) would have been used instead.

## Task Commits

1. **Tasks 1+2: re-verification gate + verdict (b) closure** — zero source edits by design; the only commit is the plan-completion docs commit below.

**Plan metadata:** `docs(18-03): close TEST-17 as resolved-by-restructure (verdict b)` — SUMMARY + deferred-items.md + tracking files.

## Files Created/Modified

- `.planning/phases/18-tactical-cleanup-test-flake-re-scoped/18-03-SUMMARY.md` - this closure record (the evidence transcript lives here, never as files in the working tree per `feedback_avoid_jj_auto_tracked_output`)
- `.planning/phases/18-tactical-cleanup-test-flake-re-scoped/deferred-items.md` - out-of-scope birpc finding (scope-boundary rule)
- **No source, test, or config file was touched.** `gsd-tools query diff --name-only` returned empty before the docs commit; `vitest.config.ts` is byte-identical to its pre-plan state.

## Decisions Made

- **Verdict (b) over chasing the exit-1 confound:** the verdict trigger in the plan is specific — "(a) REPRODUCED — any run shows the inclusion-filter timeout." It never did. The exit-1 results trace to a single unhandled runner-infrastructure error with zero test failures, which is a different defect class (worker→main RPC starvation, not a test timeout) and sits squarely inside the Pitfall 9 out-of-scope fence (`no broader vitest reorg; project_test_perf_pain_vitest sweep stays out of scope`). Logged to deferred-items.md instead of fixed.
- **No 4th+ run chasing 3 consecutive exit-0s:** the gate's question is about the TEST-17 flake, answered identically by all 5 invocations; additional runs would only re-sample the out-of-scope birpc phenomenon.

## Deviations from Plan

None - plan executed exactly as written (verdict-b path: zero edits, evidence recorded, closure declared). The deferred-items.md creation is the executor scope-boundary rule's required logging for an out-of-scope discovery, not a plan deviation.

## Issues Encountered

- **2 of 3 full-suite runs exited 1 with all 618 tests passing** — one unhandled `[vitest-worker]: Timeout calling "onTaskUpdate"` birpc error per affected run. 19-11 documented `maxWorkers: 2` as eliminating this; on this session's machine load it still fires intermittently (reduced to a single error per run vs systematic failure at full parallelism). Classified out of scope (Pitfall 9) and logged to `deferred-items.md` with a triage rule for future gate runs: "Tests N passed" + single onTaskUpdate unhandled error = this item, not a regression.
- **`scripts/check-skip-count.cjs` exits 1 locally (current=22, origin/main baseline=18).** Pre-existing, identical to the 18-02 finding: the count is exactly the documented 19-13 fork baseline of 22; the +4 vs origin/main dates to Phase 13-era files. This plan adds zero skip patterns (zero edits at all). Acceptance criterion "baseline 22 — no new skip patterns, no retry config" satisfied.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All three Phase 18 plans complete: 18-01 (CLEANUP-01), 18-02 (CLEANUP-03..07), 18-03 (TEST-17) — ready for phase verification/transition
- The full-suite triple-run here is fresh post-merge integration evidence for the phase gate (618/618 both backends ×3 with all Phase 18 changes on-tree)
- Caveat for any exit-code-keyed gate: the deferred birpc item can flip a green suite run to exit 1; check the failure summary before treating it as a regression
- Installed-GSD caveat (carried from 18-01/18-02): `~/.claude/gsd-core/` is stale until the operator re-runs `node bin/install.js --claude --global` from this clone

## Self-Check: PASSED

- `18-03-SUMMARY.md` and `deferred-items.md` exist on disk
- `vitest.config.ts` and `src/vcs/__tests__/jj-reap.test.ts` untouched (diff --name-only empty pre-commit)
- All 5 evidence runs recorded with exit code, counts, duration, and inclusion-filter timing

---
*Phase: 18-tactical-cleanup-test-flake-re-scoped*
*Completed: 2026-06-10*
