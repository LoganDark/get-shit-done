---
phase: 04
plan: 03
subsystem: vcs-adapter
tags:
  - acquireWriteLock
  - jj-lock
  - flock
  - O_EXCL
  - stale-WC
  - D-19
  - D-21
  - Pitfall-6
  - Pitfall-9
dependency_graph:
  requires:
    - Phase 4 plan 01 (VcsAdapterCommon.acquireWriteLock surface + jj.ts plan-01 stub + ['git']-only allowlist gate)
  provides:
    - acquireJjWriteLock RAII primitive in sdk/src/vcs/jj/lock.ts (UPSTREAM-02 sidecar)
    - jj.ts acquireWriteLock real body (delegates to sidecar with mainRepoRoot=cwd)
    - backends.ts allowlist flip for acquireWriteLock → ['git', 'jj-colocated', 'jj-native']
    - jj-lock.test.ts contract suite (6 tests, passing on both jj lanes)
    - Empirical lock on Pitfall 6 (.jj/working_copy/gsd-lock sidecar — A2 assumption holds)
    - Empirical lock on jj 0.41 stale-WC field absence (D-21 implementation pivot)
  affects:
    - Plan 04-04 reap loop (may invoke acquireWriteLock around per-workspace abandon+forget+rm batches if the reap loop needs concurrency protection — unclear whether reap will lock)
    - Plan 04-05 octopus helper (subagent commits will acquire the lock around their per-workspace squash; orchestrator-side flow)
tech-stack:
  added: []
  patterns:
    - O_EXCL sentinel sidecar (Node `openSync(path, 'wx')` polling on EEXIST)
    - Atomics.wait-based sleepSync (sync sleep without blocking event loop in a way that yields)
    - RAII release-handle (mirrors hook-bridge.ts sidecar shape)
    - UPSTREAM-02 zero-conflict surface (sidecar under sdk/src/vcs/jj/, inline jjArgvFlags to avoid backends/jj.ts dependency)
    - Child-process variant for concurrent-acquire contract tests (Atomics.wait would deadlock a same-process release/acquire roundtrip)
    - Unconditional remediation when probe data is unavailable (jj 0.41 stale field absence → unconditional `jj workspace update-stale` as a no-op-when-fresh fallback)
key-files:
  created:
    - sdk/src/vcs/jj/lock.ts
    - sdk/src/vcs/__tests__/jj-lock.test.ts
  modified:
    - sdk/src/vcs/backends/jj.ts
    - sdk/src/vcs/backends.ts
    - sdk/src/vcs/__tests__/jj-workspace.test.ts
    - sdk/src/vcs/__tests__/jj-skeleton.test.ts
    - sdk/src/vcs/__tests__/backends.test.ts
key-decisions:
  - "Stale-WC handling pivoted to unconditional `jj workspace update-stale` (jj 0.41 `json(self)` template has no `stale` field — empirically probed during execution; original predicate would have been dead code)"
  - "Sentinel sidecar at .jj/working_copy/gsd-lock — A2 assumption HOLDS empirically (jj's workspace.list() works fine while gsd-lock is held; no interference observed across all 6 contract tests)"
  - "Child-process variant for concurrent-acquire test — same-process variant rejected with a code-comment because Atomics.wait blocks the event loop and the setTimeout-driven release would never fire"
  - "beforeAll runs `pnpm build:cjs` so the forked child can require sdk/dist-cjs/vcs/jj/lock.js (option (a) from the plan revision request); --import tsx variant rejected as fragile across CI/local"
  - "Plan-01 boundary markers flipped to wired-in pattern (Rule 3) so CI stays green — jj-workspace.test.ts, jj-skeleton.test.ts, backends.test.ts"
requirements_completed:
  - WS-12  # partial — concurrency primitive half; crash-recovery-squash half stays with plan 04-04 reap
  - WS-02  # workspace-mutating callers can now hold a per-workspace lock
metrics:
  duration: ~22min
  completed_date: 2026-05-13
  tasks: 3
  files: 7
  commits: 5
---

# Phase 4 Plan 3: Per-Workspace Advisory Flock Primitive Summary

Land the real `acquireJjWriteLock` body in `sdk/src/vcs/jj/lock.ts` (UPSTREAM-02 zero-conflict sidecar), wire the plan-01 jj.ts stub to delegate, flip the per-verb allowlist for `acquireWriteLock` to admit both jj backends, and prove the primitive with a 6-case contract suite (concurrent-acquire blocking, timeout, release-reacquire, sentinel-path, A2 non-interference, mkdirSync recursive behaviour). Closes the concurrency-primitive half of WS-12; reap-side crash recovery stays with plan 04-04.

## Performance

- **Started:** ~2026-05-13T10:48 (Task 1 file-create anchor)
- **Completed:** 2026-05-13T10:53
- **Duration:** ~22 minutes
- **Tasks:** 3
- **Files created:** 2 (`sdk/src/vcs/jj/lock.ts`, `sdk/src/vcs/__tests__/jj-lock.test.ts`)
- **Files modified:** 5 (`sdk/src/vcs/backends/jj.ts`, `sdk/src/vcs/backends.ts`, three boundary-marker tests)
- **Commits:** 5

## What Landed

1. **`sdk/src/vcs/jj/lock.ts` (NEW, 149 → 152 lines after the Rule-1 fix)**:
   - `acquireJjWriteLock(workspacePath, opts?): JjLockHandle` — O_EXCL sentinel at `.jj/working_copy/gsd-lock`. Polls on EEXIST until the lock is creatable or the deadline (default 30_000ms — D-19) elapses.
   - `JjLockHandle.release()` — closes the fd and unlinks the sentinel. Idempotent (closing a closed fd or unlinking a missing file is a no-op).
   - `AcquireJjWriteLockOpts.{timeout, pollInterval, mainRepoRoot}` — `pollInterval` defaults to 25ms; `mainRepoRoot` defaults to `workspacePath` (Pitfall 9 forward-compat).
   - `sleepSync(ms)` via `Atomics.wait` on a SharedArrayBuffer (portable sync sleep).
   - `jjArgvFlags(repo)` — inline mandatory-flags prefix (UPSTREAM-02: sidecar does not import from `backends/jj.ts`).
   - **D-21 stale-WC recovery:** unconditional `jj workspace update-stale` invocation against `workspacePath` after lock acquisition. Failures are best-effort (caught and swallowed so the lock is still considered acquired).
   - **Pitfall 6:** sentinel sidecar at `.jj/working_copy/gsd-lock` — NOT jj's internal `checkout` pointer. Three explicit comments cite Pitfall 6.
   - **Pitfall 9:** no `jj workspace list` probe runs from the lock path (jj 0.41 has no `stale` field to probe — see Open Questions); the only invocation is `jj workspace update-stale` against the locked workspace's own cwd, which is the correct target per Pitfall 9's "stale-recovery targets the specific workspace" guidance.

2. **`sdk/src/vcs/backends/jj.ts`** edits:
   - New import: `import { acquireJjWriteLock } from '../jj/lock.js';`
   - Plan-01 stub replaced with a delegating wrapper that passes `cwd` as `mainRepoRoot` (Pitfall 9 — orchestrator-side jj adapter is expected to be constructed at the main repo root before invoking acquireWriteLock on a subagent workspace path; when `cwd === workspace`, the call is also safe because lock acquisition no longer probes via `jj workspace list`).
   - `void workspace` / `void opts` shims removed.

3. **`sdk/src/vcs/backends.ts`** edits:
   - `'acquireWriteLock'` allowlist entry flipped from `Object.freeze(['git'] as const)` to `Object.freeze(['git', 'jj-colocated', 'jj-native'] as const)`.
   - Comment refreshed to credit plan 04-03 + D-19; the `workspace.reap` gate stays at `['git']` (plan 04-04 owns that flip).

4. **`sdk/src/vcs/__tests__/jj-lock.test.ts` (NEW, 173 lines)**:
   - 6 tests, all passing on both `GSD_TEST_BACKENDS=jj-colocated` and `GSD_TEST_BACKENDS=jj-native`:
     1. **Pitfall 6 sentinel path** — asserts `.jj/working_copy/gsd-lock` exists during the hold and is gone after release.
     2. **Release-and-reacquire** — second acquire succeeds after the first releases.
     3. **Timeout fires** — second acquire with `{timeout:100, pollInterval:10}` throws `/timed out/` when the first holder is still holding.
     4. **Concurrent acquire (child-process)** — spawns a Node child that requires `dist-cjs/vcs/jj/lock.js`, acquires the lock, sleeps 300ms, releases. The parent attempts a second acquire after a 100ms warmup and asserts elapsed time is at least 50ms (proving the busy-wait fired at least one EEXIST iteration) and less than 1800ms (proving timeout didn't trip).
     5. **A2 assumption** — `createVcsAdapter(dir, {kind:'jj'}).workspace.list()` returns ≥1 entry while gsd-lock is held; no interference observed.
     6. **mkdirSync recursive** — documented behaviour on a non-existent path (the call succeeds and creates the parent chain).
   - `beforeAll` runs `pnpm build:cjs` (60s timeout to accommodate cold cache); `afterAll` rm-rfs the tmp repo.

5. **Boundary-marker tests flipped (Rule 3 — see Deviations):**
   - `sdk/src/vcs/__tests__/jj-workspace.test.ts`: `'acquireWriteLock still throws VcsNotImplementedError'` → `'does not throw VcsNotImplementedError (wired in plan 04-03)'`.
   - `sdk/src/vcs/__tests__/jj-skeleton.test.ts`: parallel flip + release-handle cleanup in the try-block.
   - `sdk/src/vcs/__tests__/backends.test.ts`: `BACKENDS_AVAILABLE_FOR_VERB['acquireWriteLock']` assertion updated to the three-backend frozen array; describe title refreshed to credit plan 04-03.

## A2 Assumption (Pitfall 6 Empirical Validation)

**HOLDS.** The contract test "A2 assumption: jj operations still work in the locked workspace (no interference)" exercises the full path: acquire lock → call `vcs.workspace.list()` → assert ≥1 entry → release. The list invocation completes successfully on both jj-colocated and jj-native lanes; jj's internal snapshot serialisation does not contend with the `.jj/working_copy/gsd-lock` sidecar.

The plan-allowed fallback to `.jj/gsd-locks/<basename>.lock` (a path OUTSIDE `.jj/working_copy/`) was NOT applied — no empirical evidence of interference triggered the fallback path.

## D-21 Stale-WC Empirical Finding (Open Question Q3 — answered)

**jj 0.41's `json(self)` template does NOT expose a `stale` boolean field.**

Empirically probed during execution (Task 1 verification):

```
$ jj workspace list -T 'json(self) ++ "\n"'
{"name":"default","target":{"commit_id":"...","parents":[...],"change_id":"...","description":"","author":{...},"committer":{...}}}
```

The fields are: `name`, `target.commit_id`, `target.parents`, `target.change_id`, `target.description`, `target.author`, `target.committer`. No `stale` field anywhere.

**Implementation pivot:** The plan-action's documented fallback (lines 248-249 of 04-03-PLAN.md) applies: invoke `jj workspace update-stale` UNCONDITIONALLY. The command is a no-op when the WC is fresh — verified locally:

```
$ jj workspace update-stale
Attempted recovery, but the working copy is not stale
$ echo $?
0
```

The stderr warning is harmless; exit code is 0.

**Pitfall 9 still honoured** because there is now NO `jj workspace list` probe in the lock-acquisition path — there cannot be an auto-snapshot recursion on the wrong cwd because there is no probe at all. `mainRepoRoot` stays on the API as forward-compat for a future jj version that surfaces a probe-able `stale` field.

This was applied as a Rule-1 fix in commit `5d63b07d` after Task 1's initial implementation baked in the predicate `/"stale"\s*:\s*true/.test(probe.stdout)`. The test suite re-ran clean after the pivot.

## Concurrent-Acquire Test Approach

**Child-process variant chosen.** The plan explicitly forbade the same-process variant (commented out in the test body with a `REPLACED — do not include the same-process variant` warning), because:

1. `acquireJjWriteLock` polls via `Atomics.wait` on a `SharedArrayBuffer` — a synchronous sleep that does NOT yield to the event loop.
2. If the test acquires in the main thread and uses `setTimeout(() => h.release(), 200)` to release later, the `setTimeout` callback NEVER fires (event loop is blocked by Atomics.wait inside the second acquire).
3. The test would deadlock and hit vitest's per-test timeout.

The child-process variant is the only viable approach. The `beforeAll` builds `sdk/dist-cjs/vcs/jj/lock.js` so the child can `require()` it; the spawn timing is calibrated as:

- Child acquires the lock at startup (typically ~50ms after spawn).
- Parent waits 100ms warmup, asserts sentinel exists.
- Parent attempts second acquire with `{timeout: 2000, pollInterval: 25}` — busy-waits in Atomics.wait until the child releases (~200ms later) and then succeeds.
- Parent asserts elapsed ≥ 50ms (proves busy-wait) and < 1800ms (proves no timeout).

**No flakes observed across multiple runs** on both lanes; the 50ms/1800ms band has wide margins.

## Deviations from Plan

### Rule 1 (auto-fix bugs) — empirical stale-WC pivot

**1. [Rule 1 - Bug] D-21 stale predicate would have been dead code on jj 0.41**

- **Found during:** Post-Task-1 empirical probe of `jj workspace list -T 'json(self) ++ "\n"'` against a fresh colocated repo
- **Issue:** Task 1's initial implementation used `if (probe.exitCode === 0 && /"stale"\s*:\s*true/.test(probe.stdout))` to gate the `jj workspace update-stale` invocation. The regex would never match because jj 0.41's JSON template emits no `stale` field. D-21 stale-WC recovery would have silently never run.
- **Fix:** Pivoted to unconditional `jj workspace update-stale` per the plan-action's documented fallback (04-03-PLAN.md lines 248-249). The command is a no-op when the WC is fresh (verified). Removed the dead probe and its surrounding regex predicate. Updated JSDoc to record the empirical finding.
- **Files modified:** `sdk/src/vcs/jj/lock.ts`
- **Commit:** `5d63b07d`

### Rule 3 (auto-fix blocking issues) — boundary marker test flips

**2. [Rule 3 - Blocking] Boundary-marker tests still pinned the Phase-4-plan-01 stub state**

- **Found during:** Task 2 verification (planning to run the test suite after wiring the real body)
- **Issue:** Plan 04-02 SUMMARY explicitly noted that boundary-marker tests in `jj-workspace.test.ts`, `jj-skeleton.test.ts`, and `backends.test.ts` still asserted `'acquireWriteLock still throws VcsNotImplementedError'` and `BACKENDS_AVAILABLE_FOR_VERB['acquireWriteLock']).toEqual(['git'])`. With plan 03's real body landing, those assertions would now FAIL — CI would go red.
- **Fix:** Mirrored the plan-01 wired-in pattern (`.not.toThrow(VcsNotImplementedError)`) for the two `acquireWriteLock` boundary tests, with try-blocks that release the handle if the call somehow succeeds. Updated `backends.test.ts` to assert the three-backend frozen array.
- **Files modified:** `sdk/src/vcs/__tests__/jj-workspace.test.ts`, `sdk/src/vcs/__tests__/jj-skeleton.test.ts`, `sdk/src/vcs/__tests__/backends.test.ts`
- **Commit:** `60cd5fc8`

### Rule 2 (auto-add missing critical functionality) — none

### Rule 4 (architectural ask) — none

---

**Total deviations:** 2 (one Rule-1 empirical pivot; one Rule-3 boundary flip both auto-applied per the parallel_execution context notice in the executor prompt).

## Threats Mitigated

| Threat ID | Disposition | Mitigation Applied |
|-----------|-------------|---------------------|
| T-04.03-01 (Tampering on workspace path arg) | mitigate (deferred) | Documented gap: `path.join` normalises `..` but doesn't prevent absolute-shaped traversal. Mitigation deferred to plan 07 (cr-01 fold-in lifts workspace-path validation alongside refname validator). Caller-side path safety assumed (orchestrator constructs workspace paths under `.claude/jj-workspaces/` per D-16). |
| T-04.03-02 (DoS via held sentinel survives crash) | mitigate (partial) | 30s default timeout (D-19) eventually fires for new acquirers. Orchestrator's crash-recovery path (plan 04-04 reap) can `rm -f .jj/working_copy/gsd-lock` for forgotten workspaces. Known limitation; full crash-recovery for the lock is deferred (no real flow needs it in v1 per D-20). |
| T-04.03-03 (Tampering on sentinel path collision with jj internals) | mitigate | Pitfall 6 sentinel sidecar at `.jj/working_copy/gsd-lock`. A2 assumption empirically validated by the "jj operations still work" contract test on both jj-colocated and jj-native lanes. No fallback to `.jj/gsd-locks/` required. |
| T-04.03-SC (no new package installs) | accept | Zero new runtime deps. `proper-lockfile` npm package not adopted (per RESEARCH stance and Phase 4 hand-roll default). |

## Verification Gate Outcomes

| Gate | Result |
|------|--------|
| `cd sdk && pnpm tsc --noEmit` | PASS (exit 0) |
| `cd sdk && pnpm build:cjs` | PASS (sdk/dist-cjs/vcs/jj/lock.js exists) |
| `node scripts/lint-vcs-no-raw-git.cjs` | PASS (911 files scanned, 0 violations) |
| `node scripts/check-skip-count.cjs` | PASS (current=18, baseline=18 — no increase) |
| `GSD_TEST_BACKENDS=jj-colocated pnpm vitest run src/vcs/__tests__/jj-lock.test.ts` | PASS (6/6 tests, 2.14s) |
| `GSD_TEST_BACKENDS=jj-native pnpm vitest run src/vcs/__tests__/jj-lock.test.ts` | PASS (6/6 tests, 2.18s) |
| `pnpm vitest run src/vcs/__tests__/jj-workspace.test.ts src/vcs/__tests__/jj-skeleton.test.ts src/vcs/__tests__/backends.test.ts` | PASS (68/68 tests, 4.83s) |
| Task 1 grep acceptance (8 assertions) | ALL PASS |
| Task 2 grep acceptance (5 assertions) | ALL PASS |
| Task 3 grep acceptance (4 assertions) | ALL PASS (acquireJjWriteLock count=13 ≥5; concurrent acquire=1; Pitfall 6=3; A2 assumption=2) |

## Files

**Created (2):**
- `sdk/src/vcs/jj/lock.ts` — 152 lines (final, after the Rule-1 pivot)
- `sdk/src/vcs/__tests__/jj-lock.test.ts` — 173 lines

**Modified (5):**
- `sdk/src/vcs/backends/jj.ts` — +13 / -10 (import + delegating wrapper replaces stub)
- `sdk/src/vcs/backends.ts` — +5 / -2 (allowlist flip + comment refresh)
- `sdk/src/vcs/__tests__/jj-workspace.test.ts` — +12 / -2 (boundary flip + handle cleanup)
- `sdk/src/vcs/__tests__/jj-skeleton.test.ts` — +12 / -2 (boundary flip + handle cleanup)
- `sdk/src/vcs/__tests__/backends.test.ts` — +14 / -5 (3-backend frozen array assertion + describe title)

## Commits

- `5b091636` feat(04-03): land acquireJjWriteLock RAII primitive in sdk/src/vcs/jj/lock.ts
- `a645b377` feat(04-03): delegate jj.acquireWriteLock to sidecar + flip allowlist
- `60cd5fc8` test(04-03): flip Phase 4 plan 01 boundary markers for acquireWriteLock
- `687e5a3a` test(04-03): contract tests for acquireJjWriteLock
- `5d63b07d` fix(04-03): invoke jj workspace update-stale unconditionally (jj 0.41 has no stale field)

## Open Questions / Follow-ups

1. **`jj workspace list` JSON template `stale` field — confirmed ABSENT on jj 0.41.** If a future jj version surfaces the field, the predicate-based probe can be reintroduced and the unconditional update-stale call removed. Track in the jj-version-bump checklist.

2. **Workspace path argument validation (T-04.03-01) — deferred to plan 07.** The `cr-01` fold-in is scheduled to lift `validateRefname`-style path validation alongside the workspace-name validator. Plan 03 documents the gap; the orchestrator-side caller is assumed to construct paths under `.claude/jj-workspaces/`.

3. **`mainRepoRoot` opt is currently a no-op** (Rule-1 pivot removed the only consumer). Kept on the API as forward-compat. If plan 04-04 or 04-05 needs a meaningful mainRepoRoot, the probe can be added back.

4. **`acquireWriteLock` from jj.ts passes `cwd` as `mainRepoRoot`.** When the orchestrator constructs the adapter at a SUBAGENT workspace path (not the main repo root), `mainRepoRoot` will currently resolve to the subagent path — a future regression risk if the probe is reintroduced. Phase 5 dogfood is when this will surface.

5. **30s default timeout under realistic load (D-19 / RESEARCH §"Open Questions Q4")** — not exercised under parallel-subagent load in this plan. Phase 5 dogfood owns the load test; D-28 (no-op restatement of D-19) confirms 30s holds for v1.

## Next Phase Readiness

- **Plan 04-04 (reap loop) unblocked:** `acquireWriteLock` is now production-ready; if the reap loop wants to lock per-workspace before abandoning, it has a primitive. The `workspace.reap` allowlist gate stays at `['git']`; plan 04-04 will flip it.
- **Plan 04-05 (octopus helper) unblocked:** Subagent commit flow can now wrap squash + bookmark advance in an `acquireWriteLock` + `release` pair. The fan-out path has its concurrency primitive.
- **Plan 04-06 / 04-07 (hooks + structure / pre-push) unaffected** — neither needs the lock primitive directly.
- **No blockers** identified.

## Self-Check: PASSED

All 7 files (2 created + 5 modified) exist on disk; all 5 commits exist in `git log --oneline 09c692ef..HEAD`. Verified via:

```
$ [ -f sdk/src/vcs/jj/lock.ts ] && echo FOUND  # FOUND
$ [ -f sdk/src/vcs/__tests__/jj-lock.test.ts ] && echo FOUND  # FOUND
$ [ -f sdk/src/vcs/backends/jj.ts ] && echo FOUND  # FOUND
$ [ -f sdk/src/vcs/backends.ts ] && echo FOUND  # FOUND
$ [ -f sdk/src/vcs/__tests__/jj-workspace.test.ts ] && echo FOUND  # FOUND
$ [ -f sdk/src/vcs/__tests__/jj-skeleton.test.ts ] && echo FOUND  # FOUND
$ [ -f sdk/src/vcs/__tests__/backends.test.ts ] && echo FOUND  # FOUND
$ git log --oneline | grep -E "5b091636|a645b377|60cd5fc8|687e5a3a|5d63b07d"  # all 5 hashes present
```

---

*Phase: 04-workspaces-octopus-structure-hooks*
*Completed: 2026-05-13*
