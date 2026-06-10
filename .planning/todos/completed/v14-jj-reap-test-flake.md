---
title: Fix vitest flake — jj-reap.test.ts inclusion-filter times out under parallel test load
source: phase-14 regression-gate run
created: 2026-05-24
priority: low
cross_backend: false
resolves_phase: 18
target_milestone: v1.4
---

## Summary

During Phase 14's `regression_gate` step (post-execution gate that runs prior phases' test files), the following vitest flake surfaced:

```
FAIL  |unit| src/vcs/__tests__/jj-reap.test.ts > workspace.reap — Phase 4 plan 04 (WS-11/WS-12/D-14) > inclusion-filter: ignores workspaces NOT matching phaseNamePrefix
Error: Test timed out in 5000ms.
```

**Repro behavior:**
- In the full regression run (3 test files run together): TIMES OUT at 5000ms
- In isolation (`pnpm vitest run src/vcs/__tests__/jj-reap.test.ts -t "inclusion-filter"`): PASSES in **636ms**

This is a **test isolation problem**, not a Phase 14 regression. Phase 14 didn't modify `jj-reap.test.ts` or any code paths it covers (the test exercises workspace inclusion filtering, which is Phase 4 / WS-11/WS-12/D-14 territory).

## Hypotheses for the flake

1. **Shared filesystem contention** — `cmd-parallel-jj.test.ts` and `cmd-parallel-git.test.ts` both use Pattern B random-prefix mkdtemp fixtures, but they create real jj/git repos via subprocess. Running them in parallel with `jj-reap.test.ts` (which also touches filesystem state) may saturate the I/O budget for the affected test, pushing it past 5s.
2. **Vitest parallel test-runner config** — `sdk/vitest.config.ts` (or the `vitest run --project unit` invocation) may be running too many tests concurrently for jj operations to complete within their default 5s timeout.
3. **`jj` subprocess startup cost** — `jj` cold-start is ~100-300ms; under parallel load with many concurrent invocations, cumulative latency may exceed budget.

User-level memory note: `project_test_perf_pain_vitest` says "sdk/ vitest is the slow suite; user wants parallelism as first lever". The flake is consistent with that observation.

## Acceptance criteria for the fix plan

- [ ] Reproduce: run the same 3-file vitest command Phase 14 ran and confirm the timeout fires
- [ ] Determine root cause via narrow bisection (try with `--no-file-parallelism`, try with increased timeout, try with `concurrent: false` on the test, etc.)
- [ ] Fix is ONE of:
  - (a) Mark `jj-reap.test.ts > inclusion-filter` with a higher `it.timeout(15_000)` if the test legitimately needs more time
  - (b) Switch the suite to `concurrent: false` if the test is fundamentally parallel-hostile
  - (c) Improve test isolation if the test is racing on a shared resource
- [ ] Confirm the flake doesn't re-surface in 3+ consecutive runs after fix
- [ ] No new tests regress

## References

- `sdk/src/vcs/__tests__/jj-reap.test.ts:77-86` — the failing test
- `sdk/vitest.config.ts` — vitest config that may need adjustment
- Phase 4 plan 04 (WS-11/WS-12/D-14) — the contract the test enforces
- Memory `project_test_perf_pain_vitest`
