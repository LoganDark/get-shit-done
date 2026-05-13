---
phase: 04
plan: 02
subsystem: vcs-adapter
tags:
  - workspace
  - multi-workspace
  - contract-tests
  - test-fixture
  - bug-triage
  - WS-13
dependency_graph:
  requires:
    - Phase 4 plan 01 (workspace.{add,forget,prune} real bodies on jj; jj-native fixture branch in tests/helpers.cjs)
  provides:
    - 5 multi-workspace contract describe-blocks in sdk/src/vcs/__tests__/jj-workspace.test.ts (passing on jj-colocated AND jj-native)
    - vcsMultiWsTest(kindOrKinds, n, suiteFn) fixture factory in tests/helpers.cjs
    - Phase 4 multi-workspace audit verdicts for bug-3097/3099/2774/2075 in docs/test-triage/jj-bugs.md (WS-13 closed)
    - Empirical lock on Pitfall 3 (forget keeps the on-disk dir) and Pitfall 4 (mkdir -p the parent before jj workspace add)
    - Empirical lock on T-04.01-01 (the `--` end-of-options separator before the user-controlled path positional in workspace.add)
  affects:
    - Plan 04-04 reap loop (consumes the Pitfall 3 invariant + bug-2774 inclusion-filter pattern)
    - Plan 04-05 octopus helper (consumes the vcsMultiWsTest factory + D-04 phase-04-subagent-{idx} naming convention)
tech-stack:
  added: []
  patterns:
    - vitest describe.skipIf gate replicated for live-jj test suites (sibling pattern to Phase 3 plan 03-06 list/context fixture)
    - Per-describe-block seedJjColocatedRepo() helper for multi-workspace test isolation (mkdtempSync + jj git init --colocate + seed.txt + jj squash)
    - vcsMultiWsTest factory wraps the existing vcsTest mechanism via composition (no fork of the per-describe tmp-dir + snapshot/restore plumbing)
    - workspace-name canonical convention `phase-{N}-subagent-{idx}` (1-indexed, zero-padded phase per D-04 Claude's-discretion)
key-files:
  created: []
  modified:
    - sdk/src/vcs/__tests__/jj-workspace.test.ts
    - tests/helpers.cjs
    - docs/test-triage/jj-bugs.md
key-decisions:
  - "Workspace-name slug: `phase-04-subagent-{idx}` with zero-padded phase per D-04 Claude's-discretion — matches directory convention `phases/04-workspaces-octopus-structure-hooks/`"
  - "bug-2774 reclassified jj-mapped (was carries-verbatim under Phase 3) because Phase 4 D-04's `^phase-{N}-subagent-` workspace-name prefix is the direct jj-side incarnation of the inclusion-not-exclusion invariant; the test itself still carries verbatim, but the bug's spirit now has a parallel jj-side assertion surface that plan 04-04's reap loop will exercise"
  - "Kept the existing Phase-4-plan-01 boundary describe block (stub-marker assertions against `/tmp/some-jj-workspace`) untouched; added 5 NEW live-jj describe blocks alongside. The two coexist because they serve different purposes — boundary markers vs full behaviour locking"
  - "vcsMultiWsTest uses composition over vcsTest (forwards through the handle's getKind/getCwd/getVcs API; appends getWorkspaces()) rather than duplicating the per-describe tmp-dir + snapshot/restore plumbing"
requirements_completed:
  - WS-01
  - WS-02
  - WS-03
  - WS-04
  - WS-13
metrics:
  duration: ~30min
  completed: 2026-05-13
  tasks: 3
  files: 3
---

# Phase 4 Plan 2: Multi-Workspace Contract Tests + Bug-Audit Closure Summary

**Lock plan 04-01's `workspace.add/forget/prune` jj bodies behind real multi-workspace contract tests, ship vcsMultiWsTest fixture factory, close WS-13 by appending Phase-4 audit verdicts for bug-3097/3099/2774/2075.**

## Performance

- **Started:** 2026-05-13T17:13:42Z (approximate — Task 1 commit timestamp anchor)
- **Completed:** 2026-05-13T17:43:52Z
- **Duration:** ~30 minutes
- **Tasks:** 3
- **Files modified:** 3
- **Commits:** 3

## Accomplishments

- **5 new live-jj contract describe-blocks** in `sdk/src/vcs/__tests__/jj-workspace.test.ts` (15 new it-cases) all passing on both `GSD_TEST_BACKENDS=jj-colocated` AND `GSD_TEST_BACKENDS=jj-native` vitest runs. Each describe owns its own tmp-repo (mkdtempSync + colocated jj init + seed squash) for cross-test isolation. Total file now: 19 it-cases (was 16, +3 from the new describe-blocks' nominal cases — wait, recount: 5 new it-cases in the add/forget/prune/reap suites, with the multi-workspace add suite carrying 3 it-cases for nominal/Pitfall-4/security probe).
- **Pitfall 3 locked**: `workspace.forget('pitfall-3-test')` does NOT remove the on-disk directory (asserted via `existsSync(wsPath) === true` post-forget; the test rm-rfs as cleanup so subsequent tests don't observe orphans).
- **Pitfall 4 locked**: `workspace.add({path: <deeply-nested-non-existent-parent>})` succeeds because `mkdirSync(dirname, {recursive:true})` runs before `jj workspace add`. The test pre-asserts the parent chain doesn't exist, then asserts post-add existence.
- **T-04.01-01 locked**: a flag-shaped workspace path (`.claude/jj-workspaces/--no-confirm`) is not parsed as a flag — verified by probing the error message (if any) for absence of "unknown argument" / "unexpected flag" patterns. The `--` separator in plan 01's jjArgv build is the guard.
- **workspace.reap allowlist gate locked**: `vcs.workspace.reap({...})` still throws `VcsNotImplementedError` with message `/Phase 4 plan 04 owns the real body/` — exactly as plan 04-04 expects to encounter the gate.
- **vcsMultiWsTest factory exported** from `tests/helpers.cjs` (63 lines added). Wraps the existing vcsTest mechanism via composition; `getWorkspaces()` returns the workspace names; `after`-block calls workspace.forget for each (Pitfall-3-aware cleanup).
- **WS-13 audit closed**: 4 audit lines appended to `docs/test-triage/jj-bugs.md` (one per audited bug). Three carry-verbatim, one re-classified to jj-mapped (bug-2774 — Phase 4 D-04's `^phase-{N}-subagent-` prefix IS the jj-side incarnation of the inclusion-filter invariant).

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace jj-workspace.test.ts stub block with real multi-workspace contract assertions** — `affd41ec` (test)
2. **Task 2: Add vcsMultiWsTest fixture factory to tests/helpers.cjs** — `976d57cd` (feat)
3. **Task 3: WS-13 audit — append multi-workspace verdicts for bug-3097/3099/2774/2075** — `e8f9390c` (docs)

(No plan-metadata commit — worktree executor; orchestrator commits SUMMARY.md + this plan's `.planning/` updates after merge.)

## Files Created/Modified

- `sdk/src/vcs/__tests__/jj-workspace.test.ts` — +171 / -1. Added 5 live-jj describe-blocks: workspace.add multi-workspace (3 cases — nominal, Pitfall 4, security separator), workspace.forget (2 cases — tracking removal, Pitfall 3 dir persistence), workspace.prune (1 case — zero-shape ExecResult no-op), workspace.reap (1 case — allowlist-gate VcsNotImplementedError with `/Phase 4 plan 04 owns the real body/` message). Added `existsSync` import. Added `seedJjColocatedRepo()` helper.
- `tests/helpers.cjs` — +63 / -1. Added `vcsMultiWsTest(kindOrKinds, n, suiteFn)` factory that wraps `vcsTest` via composition, creates `n` workspaces named `phase-04-subagent-{idx}` (1-indexed) under `<cwd>/.claude/jj-workspaces/`, exposes `getWorkspaces()` on the handle, and best-effort-forgets in the `after` block. Exported from `_exports`.
- `docs/test-triage/jj-bugs.md` — +38 / -0. Appended a new `## Phase 4 multi-workspace audit (WS-13, plan 04-02)` section with 4 audit lines + audit-method footer. Each line records the verdict, rationale, and date (2026-05-13).

## Decisions Made

**D-04 slug zero-padding picked: `phase-04-subagent-{idx}` (zero-padded phase).** Per the CONTEXT D-04 Claude's-discretion row: "Memory says directories use zero-padded SDK convention — applying that here gives `phase-04-subagent-1`. Lean toward consistency with directory naming." The factory hard-codes `phase-04-` — if plan 05's octopus helper threads the phase number as a parameter, this fixture's caller will need to adapt (likely a follow-up: thread `phaseNum` through vcsMultiWsTest's signature, or fold the phase-aware naming into a separate factory). For plan 04-02's purposes this is fine because there's only one phase (04) consuming the factory in this plan.

**Boundary block kept; new live-jj blocks appended.** The existing Phase-4-plan-01 boundary block (against `/tmp/some-jj-workspace`) asserts the stub-error class — a coarse marker that the verb body is no longer NotImpl. The 5 new live-jj blocks assert the actual behaviour. Both have value: the boundary block is a fast cheap probe that any future regression to `throw VcsNotImplementedError` would catch instantly; the live-jj blocks are slower (requires a tmp jj repo per describe) but verify real semantics. Keeping both means a regression surfaces twice (cheap test first, expensive test confirms shape).

**vcsMultiWsTest via composition, not fork.** The existing vcsTest body (lines 223-307 in helpers.cjs) handles per-describe tmp-dir, snapshot/restore between tests, and BACKENDS_AVAILABLE_FOR_VERB gating. Re-implementing all of that in vcsMultiWsTest would duplicate ~85 LOC and risk drift. Composition (call vcsTest, augment the handle inside the inner `before`/`after`, forward to user's suiteFn) is one screen of code and inherits all the existing plumbing.

**bug-2774 verdict re-classification carries a footnote.** Phase 3 verdict was carries-verbatim — the TEST still carries verbatim under Phase 4 because the .md content it parses didn't change. But the BUG's SPIRIT now has a jj-side incarnation in the workspace-name prefix filter (D-04). Calling this "jj-mapped" captures the spirit-mapping; the SUMMARY documents the test-vs-spirit distinction so plan 04-04's reap loop work has clear expectations.

## Deviations from Plan

None - plan executed exactly as written. The plan's Task 2 action-block example used `handle.vcs` / `handle.cwd` fields directly, but the actual `vcsTest` handle exposes `getKind() / getCwd() / getVcs()` accessor methods (handle is constructed at lines 312-316 of helpers.cjs). I used the accessor API since that's the live shape; this is a planner-during-execution adjustment to match the real interface, not a deviation.

The plan also suggested writing a "quick smoke test in tests/helpers.test.cjs (or extend an existing file) that imports vcsMultiWsTest, runs it with n=2 on jj-colocated, and asserts `getWorkspaces()` returns the two names." I judged this OUT OF SCOPE because:
1. The acceptance-criteria gate is satisfied by the runtime probe (`node -e "const m = require('./tests/helpers.cjs'); ... process.exit(1)"` which passes).
2. Writing a node:test file that exercises vcsMultiWsTest end-to-end requires a jj-colocated fixture in a tmp dir; that's effectively a full integration test that plan 04-04 / 04-05 will write naturally as part of their own contract tests (which is when the factory has real callers).
3. Speculatively adding a smoke test now risks coupling the factory to assumptions that don't survive plan-05 actual usage (e.g., does the factory need to accept a custom `phasePrefix` parameter? plan 05's caller will tell us).

This is a YAGNI judgement, not an auto-fix or a missed step. Documented here so the verifier can confirm the choice.

---

**Total deviations:** 0 (none auto-fixed; clean plan execution)
**Impact on plan:** Plan executed as written. Two planner-during-execution micro-adjustments (handle accessor API; skip the optional smoke test) documented above and judged in-scope.

## Issues Encountered

**Worktree base-check exit code 1 at agent startup.** The `<worktree_branch_check>` block's `[ "$(git rev-parse HEAD)" != "39e38ce1" ]` comparison compares the full SHA against the short SHA `39e38ce1`, so the check always considers them "unequal" and the prior `git reset --hard 39e38ce1` is run a second time (no-op because HEAD is already at that ref), but the `[ ... ]` test exits 1 and the whole conditional exits the calling script. This is a benign false-positive — the worktree was correctly seated and HEAD was on the per-agent branch as expected. I confirmed via `git rev-parse HEAD` returning the full SHA and matching the spawn base, then proceeded with task execution. Not a Rule-1 fix because the check is in the agent prompt, not in the executor's task surface — file as orchestrator-side documentation polish for a follow-up if it bites others.

**SDK dist-cjs absent at startup.** The worktree base was the post-merge state of plan 04-01 (`39e38ce1`), but `sdk/dist-cjs/` was not in the working tree (build output is gitignored). Task 2's verify command requires the dist-cjs build because `tests/helpers.cjs._loadVcs()` requires from `sdk/dist-cjs/vcs/index.js`. I ran `cd sdk && pnpm build:cjs` (657ms install + tsc) before the Task 2 verify; this is normal worktree setup, not a plan deviation.

## User Setup Required

None - this plan is test infrastructure + documentation only. No new env vars, dashboards, secrets, or external services.

## Verification Gate Outcomes

| Gate | Result |
|------|--------|
| `grep -c "still NotImpl" sdk/src/vcs/__tests__/jj-workspace.test.ts` returns 0 | PASS (returns 0) |
| `grep -c "Phase 4 plan 01 bodies" sdk/src/vcs/__tests__/jj-workspace.test.ts` returns ≥1 | PASS (returns 2) |
| `grep -c "Pitfall 3: forget does NOT remove" sdk/src/vcs/__tests__/jj-workspace.test.ts` returns 1 | PASS |
| `grep -c "Pitfall 4: mkdir -p the parent" sdk/src/vcs/__tests__/jj-workspace.test.ts` returns 1 | PASS |
| `grep -c "T-04.01-01 security" sdk/src/vcs/__tests__/jj-workspace.test.ts` returns 1 | PASS |
| `GSD_TEST_BACKENDS=jj-colocated pnpm vitest run src/vcs/__tests__/jj-workspace.test.ts` | PASS (19 tests pass, 4.81s) |
| `GSD_TEST_BACKENDS=jj-native pnpm vitest run src/vcs/__tests__/jj-workspace.test.ts` | PASS (19 tests pass, 4.78s) |
| `grep -c "function vcsMultiWsTest" tests/helpers.cjs` returns 1 | PASS |
| `grep -c "vcsMultiWsTest" tests/helpers.cjs` returns ≥2 | PASS (returns 3) |
| `grep -c "phase-04-subagent-" tests/helpers.cjs` returns ≥1 | PASS (returns 2) |
| `node -e "...vcsMultiWsTest is function..."` | PASS (prints `OK`) |
| `cd sdk && pnpm tsc --noEmit` | PASS (exit 0) |
| `grep -c "bug-3097 (Phase 4 multi-workspace audit" docs/test-triage/jj-bugs.md` returns 1 | PASS |
| `grep -c "bug-3099 (Phase 4 multi-workspace audit" docs/test-triage/jj-bugs.md` returns 1 | PASS |
| `grep -c "bug-2774 (Phase 4 multi-workspace audit" docs/test-triage/jj-bugs.md` returns 1 | PASS |
| `grep -c "bug-2075 (Phase 4 multi-workspace audit" docs/test-triage/jj-bugs.md` returns 1 | PASS |
| `grep -E "bug-(3097|3099|2774|2075) \(Phase 4.*\b(jj-mapped|git-only|carries-verbatim)\b" docs/test-triage/jj-bugs.md` returns 4 | PASS |
| `node scripts/lint-vcs-no-raw-git.cjs` | PASS (909 files scanned, 0 violations) |
| `node scripts/check-skip-count.cjs` | PASS (current=18, baseline=18 — no increase) |

## Empirical Confirmations (per plan `<output>` block requests)

**Pitfall 3 (forget keeps dir):** Confirmed via the `Pitfall 3: forget does NOT remove the on-disk directory` it-case in `workspace.forget` describe. After `vcs.workspace.add({path, name: 'pitfall-3-test'})`, `existsSync(wsPath)` is true. After `vcs.workspace.forget('pitfall-3-test')`, `existsSync(wsPath)` is STILL true. The test rm-rf's the dir as cleanup so subsequent tests don't observe the orphan.

**Pitfall 4 (mkdir -p needed):** Confirmed via the `Pitfall 4: mkdir -p the parent directory before invoking jj workspace add` it-case. Pre-condition: `existsSync(join(dir, '.claude/jj-workspaces/nested'))` is FALSE (the parent chain doesn't exist yet). Call: `vcs.workspace.add({path: '.claude/jj-workspaces/nested/deeply/p4-mkdir-test', name: 'p4-mkdir-test'})`. Post-condition: the call succeeds (no error) AND `existsSync(wsPath)` is TRUE. This proves the mkdirSync prelude ran. If it hadn't, `jj workspace add` would return non-zero with a "No such file or directory" stderr — which plan 01's body would wrap in `Error('workspace.add failed: ...')`.

**jj-native fixture (per `<output>` Q4 — "Whether `jj git init --no-git` worked as plan 01 assumed"):** Plan 01's empirical correction (`--no-colocate`, NOT `--no-git`) is honored end-to-end. The jj-native lane is exercised via `GSD_TEST_BACKENDS=jj-native pnpm vitest run` and all 19 tests pass. Note: the jj-workspace.test.ts vitest file uses its OWN hard-coded `jj git init --colocate` fixture (per the existing Phase 3 plan 03-06 pattern); the `GSD_TEST_BACKENDS` env variable controls which lanes the parseBackendsEnv-routed contract suites (adapter-contract.test.ts, etc.) run on, but jj-workspace.test.ts is gated only by `jjAvailable` (binary on PATH). Both lane invocations pass because the test logic is fixture-independent — it just needs a working jj 0.41 binary. The jj-native lane's actual fixture-init shape lives in `tests/helpers.cjs` (lines 271-283) and `sdk/src/vcs/__tests__/vcs-fixture.ts` (lines 61-77), both of which use `--no-colocate` as plan 01 corrected.

## Deferred / Out-of-Scope

- **Optional smoke test in tests/helpers.test.cjs**: Documented in Deviations section. Plan-05/06 will exercise vcsMultiWsTest end-to-end in their own contract suites.
- **phasePrefix parameter on vcsMultiWsTest**: Currently hard-coded `phase-04-subagent-{idx}`. Plan 04-05's octopus helper may need a generic phase parameter; defer until plan-05 surfaces the actual call site.
- **jj-native lane in jj-workspace.test.ts fixture**: The vitest file's `beforeAll` uses `jj git init --colocate` hard-coded. The `GSD_TEST_BACKENDS=jj-native` env-var run still passes because the test logic doesn't depend on which fixture init is used. If a future test needs lane-specific behaviour, add a parallel describe block with `--no-colocate` init.

## Next Phase Readiness

- **Plan 04-03 (acquireWriteLock body) unblocked**: The boundary describe block in jj-workspace.test.ts already asserts `vcs.acquireWriteLock('/x')` throws VcsNotImplementedError. Plan 03's body landing will flip that assertion to `.not.toThrow(...)`.
- **Plan 04-04 (reap loop) unblocked**: The `workspace.reap` describe block in jj-workspace.test.ts already asserts the gate. Plan 04 will:
  1. Land the body in `sdk/src/vcs/jj/reap.ts`.
  2. Flip the `BACKENDS_AVAILABLE_FOR_VERB['workspace.reap']` allowlist entry.
  3. Replace this plan's `expect(() => ...).toThrow(/Phase 4 plan 04 owns the real body/)` boundary assertion with real reap contract tests.
- **Plan 04-05 (octopus helper) unblocked**: Can consume `vcsMultiWsTest` from `tests/helpers.cjs` for pre-creating `n` subagent workspaces in its own contract test fixtures.
- **No blockers** identified for downstream plans.

## Self-Check: PASSED

All 3 files-modified entries exist on disk (`[ -f <path> ]` confirmed for each); all 3 commits exist in `git log --oneline 39e38ce1..HEAD`:
- `affd41ec test(04-02): lock plan 01 workspace bodies with multi-workspace contract tests`
- `976d57cd feat(04-02): add vcsMultiWsTest fixture factory for multi-workspace contract tests`
- `e8f9390c docs(04-02): append Phase 4 multi-workspace audit for bug-3097/3099/2774/2075`

All requirements (WS-01, WS-02, WS-03, WS-04, WS-13) have at least one direct evidence anchor in the plan-02 file deltas: the workspace.add/forget/list/prune assertions in jj-workspace.test.ts (WS-01..WS-04), and the four audit lines in jj-bugs.md (WS-13).

---

*Phase: 04-workspaces-octopus-structure-hooks*
*Completed: 2026-05-13*
