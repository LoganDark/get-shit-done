# Phase 18 deferred items

Out-of-scope discoveries logged during execution (scope-boundary rule). Not fixed in this phase.

## 1. Intermittent vitest birpc unhandled error at maxWorkers: 2 (exit 1 with all tests green)

- **Found during:** 18-03 Task 1 (TEST-17 re-verification gate, 2026-06-10)
- **Symptom:** 2 of 3 full-suite runs (`TMPDIR=$(mktemp -d) GSD_TEST_BACKENDS=git,jj npx vitest run`) printed exactly one unhandled error and exited 1 despite **618/618 tests passing**:

  ```
  Error: [vitest-worker]: Timeout calling "onTaskUpdate"
   ❯ Object.onTimeoutError node_modules/.pnpm/vitest@3.2.6_.../vitest/dist/chunks/rpc.-pEldfrD.js:53:10
  ```

- **Distinct from TEST-17:** this is runner-infrastructure RPC starvation (the birpc 60s hard timeout documented in `vitest.config.ts` 19-11 comments), NOT a test-level timeout. No test failed in any run; the TEST-17 inclusion-filter test passed in all runs at ~440ms.
- **Why deferred:** 19-11 found `maxWorkers: 2` to be the empirical sweet spot ("zero RPC starvation"), but on this machine/session the starvation still fires intermittently at 2 workers (1 error per affected run, down from systematic failure at full parallelism). Any fix (worker count, pool strategy, breaking up sync-spawn stretches) is the broader vitest perf sweep that Pitfall 9 and `project_test_perf_pain_vitest` explicitly fence out of Phase 18 scope.
- **Impact:** CI/phase gates that key on vitest exit code will intermittently see exit 1 with zero test failures. Triage rule: check the failure summary — "Tests N passed" + a single `Timeout calling "onTaskUpdate"` unhandled error means this item, not a regression.
- **Suggested future scope:** v1.5+ test-perf phase (`project_test_perf_pain_vitest`): consider `pool: 'forks'`, splitting the sync-spawn-heavy `cmd-parallel-jj.test.ts` (53-64s single file), or vitest upgrade with birpc timeout fixes.
