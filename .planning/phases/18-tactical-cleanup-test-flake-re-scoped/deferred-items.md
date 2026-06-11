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

## 2. `query commit` envelope defects (wrong id on jj; absolute --files silently no-op)

- **Found during:** Phase 18 UAT session + 18-04 gap-closure planning (2026-06-11)
- **Symptoms:** (a) success envelope `id` is the post-commit head — on jj that's the new empty `@`, not the squash-created `@-` (`src/commands.cts:746-752` discards the backend-computed `CommitResult.id`); (b) absolute `--files` paths are filtered out by the #2014 `path.join(cwd, f)` existence check and short-circuit to a silent `nothing_to_commit` (`src/commands.cts:643-653`).
- **Why deferred:** production CLI-bridge fixes with contract-test obligations — outside both the Phase 18 REQ fence (CLEANUP-01..07, TEST-17) and the 18-04 gap plan's workflow-markdown footprint.
- **Tracked at:** `.planning/todos/pending/v15-query-commit-envelope-defects.md` (full evidence + acceptance criteria).

## 3. 18-04 gate-fix residuals: jj `.raw` asymmetry, dormant `.raw` checks, swallowed exec failure (REQ-18-04-A)

- **Found during:** 18-04 (assert_clean_wc entries-keyed predicate fix, 2026-06-11)

**(a) jj `.raw` asymmetry — decided, NOT normalized.** `status({porcelain: true}).raw` on the jj backend remains human-readable `jj st` stdout ("The working copy has no changes.\nWorking copy (@)..."), NOT synthesized porcelain lines, because the contract is pinned by live consumers: the router status verb (`src/vcs-command-router.cts:217`) passes `raw` through verbatim, `agents/gsd-executor.md` (~lines 441/553) displays `.raw` as human-readable output, and `src/vcs/__tests__/jj-status-log-diff.test.ts` pins raw-as-backend-stdout ("raw field always populated"). Consequence: `.raw` is **display-only** and must never be used as a cleanliness predicate — the cross-backend porcelain contract is the structured `entries` array (empty = clean).

**(b) Two dormant `.raw`-keyed checks deliberately left in place:** `gsd-core/workflows/execute-phase.md` ~line 307 and `gsd-core/workflows/quick.md` ~line 208. Both sit inside branching blocks that only execute in git mode (`branching_strategy != "none"` implies a git working tree), so the jj false-dirty defect cannot fire there today. If those blocks ever grow a jj path, re-key them on `entries` the same way.

**(c) Swallowed-exec-failure hole (checker finding, deferred).** `src/vcs/backends/jj.cts` `status()` (~lines 429-441) catches a non-zero `jj st` exec and returns `{entries: [], raw: <stderr>}` instead of propagating failure, and `src/vcs-command-router.cts` statusVerb (~line 217) unconditionally emits `ok: true` — so a failed backend exec (stale workspace, lock contention) presents as a CLEAN envelope and silently passes the entries-keyed gate, where the old `.raw` predicate accidentally aborted (stderr text is non-empty). Follow-up REQ:
  - **REQ-18-04-A: propagate backend exec failure as ok:false (or a thrown error) through statusVerb/backends so the gate's existing non-ok FATAL branch catches it.**
  - **Why not fixed in 18-04:** it changes the live status-verb contract pinned by `src/vcs/__tests__/jj-status-log-diff.test.ts` and router consumers — production CLI-bridge work beyond the 18-04 gap plan's workflow-markdown scope.
