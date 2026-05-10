---
phase: 02-bulk-call-site-migration-still-git-only
plan: 06
subsystem: vcs-adapter

tags: [vcs-adapter, query-handlers, init-runner, paired-test-retarget, branch-by-abstraction, ascending-loc, blocker-1-fix, blocker-3-closure]

requires:
  - phase: 02-bulk-call-site-migration-still-git-only (plan 05)
    provides: "init.cjs + init.ts byte-symmetric migration; baseline-parity args-shape dispatch pattern; relative-path require shape from bin/lib/*.cjs to dist-cjs"
  - phase: 02-bulk-call-site-migration-still-git-only (plan 03)
    provides: "vcs.refs.{currentBranch,countCommits,rootCommits,exists,isIgnored,remotes,resolveShort,bookmarks.exists,bookmarks.switch}; vcs.gitOnly.{init,configGet,configSet,version}; vcs.workspace.context (Blocker-4 shape); expr.commit (Blocker-3); LogOpts.allRefs"
  - phase: 01-adapter-foundation-git-backend
    provides: "createVcsAdapter, expr factories, baseline-capture tooling, baseline-parity dispatch table"
provides:
  - "sdk/src/query/check-ship-ready.ts (5 sites: 38, 41, 50, 55, 60) — fully adapter-routed (vcs.status / refs.currentBranch / gitOnly.configGet / refs.bookmarks.exists / refs.remotes); zero raw-git"
  - "sdk/src/query/check-decision-coverage.ts (1 site: 385) — vcs.log({maxCount}) + reconstruction; Iteration-1 Blocker-1 closed; ROADMAP success criterion 1 advances"
  - "sdk/src/query/progress.ts (3 sites: 286, 290, 293) — vcs.refs.countCommits / refs.rootCommits / vcs.log with expr.commit(firstCommit); Blocker-3 consumed in production"
  - "sdk/src/init-runner.ts (1 site: 139) — sync vcs.gitOnly.init() replaces async wrapper; private execGit helper deleted as dead code"
  - "10 new baselines under tests/baselines/git-vcs/; 8 new args-shape dispatch clauses in baseline-parity.test.ts"
  - "vcs.log(): LogEntry.body now populated from per-commit %b payload via `git log -z --format=...%n%b` (Rule 3 contract extension; the 02-03 LogEntry shape already declared body? as optional — this commit makes it actually populated)"
affects: [02-07-and-onward, 02-08-commit-ts, 02-11-core-cjs]

tech-stack:
  added: []
  patterns:
    - "Outer-try around createVcsAdapter for null-on-no-git semantics: check-ship-ready and progress wrap createVcsAdapter() + every adapter call in nested try/catch so a non-repo cwd or transient adapter failure leaves the prior runSyncSafe-style defaults stand. Mechanical-only translation of the original shape (D-08)."
    - "Args-shape baseline-parity dispatch growth: adding 4 new shapes for check-ship-ready (rev-parse --abbrev-ref / config --get / rev-parse --verify / remote), 1 for check-decision-coverage (log --pretty=%s%n%b), 3 for progress (rev-list --count / rev-list --max-parents= / show -s --format=%as), and 1 for init-runner (init). Each clause asserts the adapter's call returns the same byte-shape (or regex-shape for non-deterministic outputs) as the captured execGit baseline."
    - "Fresh-dir baseline mode for self-bootstrapping calls: setupFixture in capture-vcs-baselines.cjs gains an opt-in `mode: 'fresh-dir'` parameter for baselines whose call site itself runs `git init` (init-runner.ts:139). The standard mode is unchanged so the prior 16 baselines re-capture identically. baseline-parity.test.ts's initFixture takes the Baseline object to honor `fixture.mode`."
    - "vcs.log() body-populated extension: changed LOG_FORMAT to `%H%x09%P%x09%an%x09%aI%x09%s%n%b` and switched to `git log -z` so per-commit body (which can contain newlines) survives the entry separator. LogEntry.body was already declared `body?: string` in 02-03 — this commit just makes the field actually populated. The 4 prior callers (git-backend.test.ts × 3, adapter-contract.test.ts × 1) only consume hash/subject/parents — verified safe."
    - "expr.commit production consumption (Blocker-3 closure): progress.ts:293 wraps `firstCommit` (runtime SHA from rootCommits) via expr.commit() to construct a structured RevisionExpr. D-12 holds — no expr.raw escape hatch. Baseline-parity dispatch for `show -s --format=%as` mirrors the consumer's call shape via execGit('rev-parse HEAD') -> expr.commit -> vcs.log."

key-files:
  created:
    - tests/baselines/git-vcs/check-ship-ready-ts-38-status.snap.json
    - tests/baselines/git-vcs/check-ship-ready-ts-41-current-branch.snap.json
    - tests/baselines/git-vcs/check-ship-ready-ts-50-config-get.snap.json
    - tests/baselines/git-vcs/check-ship-ready-ts-55-verify-ref.snap.json
    - tests/baselines/git-vcs/check-ship-ready-ts-60-remote.snap.json
    - tests/baselines/git-vcs/check-decision-coverage-ts-385-log-pretty.snap.json
    - tests/baselines/git-vcs/progress-ts-286-rev-list-count.snap.json
    - tests/baselines/git-vcs/progress-ts-290-rev-list-root.snap.json
    - tests/baselines/git-vcs/progress-ts-293-show-format.snap.json
    - tests/baselines/git-vcs/init-runner-ts-139-init.snap.json
  modified:
    - sdk/src/query/check-ship-ready.ts
    - sdk/src/query/check-decision-coverage.ts
    - sdk/src/query/progress.ts
    - sdk/src/init-runner.ts
    - sdk/src/vcs/backends/git.ts
    - sdk/src/vcs/__tests__/baseline-parity.test.ts
    - tests/__tools__/capture-vcs-baselines.cjs

key-decisions:
  - "vcs.log() body-population landed inside Task 2's commit (Rule 3 — blocking issue): the migration of check-decision-coverage.ts:385 needs LogEntry.body populated to reconstruct the byte-equivalent `%s%n%b` output. The 02-03 LogEntry shape declared `body?: string` as optional but git-backend never populated it. Without populating body, the byte-equivalence the Blocker-1 fix requires would be unreachable from the contract. The fix is strictly additive (4 prior callers verified safe by grep — none rely on body being undefined). Bundled with Task 2's commit because it is the direct enabler of that migration."
  - "Removed runSyncSafe helper from check-ship-ready.ts but kept boolSyncSafe: runSyncSafe had four git callers (sites 38, 41, 50, 60) — all migrated. boolSyncSafe still has two non-git callers (`gh --version`, `which gh`) — those are tool-availability probes for `gh`, out-of-scope for VcsAdapter (the adapter contract is git/jj only). Keeping boolSyncSafe + execSync import for the `gh` probes is the minimum-edit path under D-08."
  - "Paired test retarget for the 4 source files is vacuous: check-ship-ready.test.ts uses non-git tmpdirs (test 4 explicitly relies on non-git behavior); check-decision-coverage.test.ts has bespoke decision-coverage setup that doesn't directly exercise recentCommitMessages's git invocation; progress.test.ts uses non-git tmpdirs and the migrated code's outer try/catch leaves defaults; init-runner.ts's integration tests (init-e2e, lifecycle-e2e) were already retargeted in 02-05 and remain skip-gated by GSD_ENABLE_E2E. D-06 is satisfied — no test retarget commit needed; the existing tests continue to pass against the migrated source."
  - "vcs.log({format: '%s%n%b'}) NOT used: the LogOpts.format type union is `'oneline' | 'full' | 'json'` — passing the string `%s%n%b` is a type error. Instead, the migration uses the default LOG_FORMAT (which now populates body) and reconstructs via `entries.map(e => `${e.subject}\\n${e.body??''}`).join('\\n').trim()`. The reconstruction is byte-equivalent to the prior `git log --pretty=%s%n%b` output (verified by the new baseline-parity dispatch clause). Avoiding the format-string passthrough keeps D-12 (no string-passthrough escape hatches) intact at the type-level."
  - "Date-only drift on prior baselines restored at every Task: running `node tests/__tools__/capture-vcs-baselines.cjs` regenerates all baselines (the loop has no per-id filter), drifting `captured_at` on 6 unrelated files from earlier dates to today. Per D-08 mechanical-only and D-11 (no `--update-snapshot` shortcut), those date-only edits were `git checkout`'d back at every Task to keep each commit's diff minimal and on-scope. Only the 10 NEW baselines land across this plan's 4 commits."
  - "init-runner.ts's containing async method retains its `async` keyword (D-08): RESEARCH §sdk/src/init-runner.ts (lines 516-522) explicitly recommended NOT removing the async modifier even when the line-139 awaited call becomes sync. The method has other awaits (`this.tools.configSet`, `this.tools.commit`, `mkdir`, `writeFile`) so the keyword stays semantically required. The flip touches body only."

requirements-completed:
  - MIGR-01
  - MIGR-03
  - TEST-05

duration: ~6m
completed: 2026-05-10
---

# Phase 02 Plan 06: Migrate four small TS files in ascending LOC order Summary

**Four atomic commits on `phase/02-migration` close 10 raw-git invocations across `check-ship-ready.ts` (5), `check-decision-coverage.ts` (1, Blocker-1 fix), `progress.ts` (3), and `init-runner.ts` (1, async-to-sync flip). 10 new baselines committed; 8 new args-shape dispatch clauses extend baseline-parity.test.ts. The vcs.log() backend gains body-population (Rule 3 contract extension bundled into Task 2 because the migration depends on it). expr.commit consumed in production for Blocker-3 closure. docs-init.ts NOT migrated (zero raw-git verified at iteration-1 revision time; per CONTEXT note the zero-violation file contributed 0 to close).**

## Performance

- **Duration:** ~6m active work (effective; ~61m wall-clock including vitest waits)
- **Started:** 2026-05-10T03:56:24Z
- **Tasks:** 4 (all `tdd="false"` — pure mechanical migration)
- **Files modified:** 7 source/test/tooling files + 10 baseline JSON
- **Commits on phase/02-migration:** 4

## Accomplishments

- **check-ship-ready.ts migrated (5 sites):** sites 38, 41, 50, 55, 60 all routed through the adapter (`vcs.status` / `vcs.refs.currentBranch` / `vcs.gitOnly.configGet` / `vcs.refs.bookmarks.exists` / `vcs.refs.remotes`). The runSyncSafe helper was removed (no remaining git callers); boolSyncSafe retained for `gh --version` / `which gh` (non-git probes, out-of-scope for VcsAdapter). The outer try/catch around `createVcsAdapter` preserves the prior null-on-no-git semantics.
- **check-decision-coverage.ts migrated (1 site, Blocker-1 fix):** site 385 (`recentCommitMessages`) routed through `vcs.log({maxCount: limit})` with byte-equivalent reconstruction. Function signature unchanged (still `async (projectDir, limit?) => Promise<string>`); error semantics preserved (try/catch -> '' on failure). Unused `execFile`/`promisify`/`node:child_process` imports removed.
- **progress.ts migrated (3 sites, Blocker-3 closure):** sites 286, 290, 293 routed through `vcs.refs.countCommits` / `vcs.refs.rootCommits` / `vcs.log({rev: expr.commit(firstCommit), maxCount: 1})`. The runtime SHA `firstCommit` wraps via the structured `expr.commit()` factory from 02-03 — D-12 holds (no `expr.raw()`). The dynamic `await import('./commit.js').execGit` import is removed.
- **init-runner.ts migrated (1 site, async-to-sync flip):** site 139 flipped from `await this.execGit(['init'])` to sync `vcs.gitOnly.init()` after `vcs.kind === 'git'` narrow (D-07). The dead-code private `execGit` async helper (11 lines) deleted; the `node:child_process` `execFile` import removed (no remaining users). The containing method's `async` keyword preserved per RESEARCH §init-runner.ts recommendation (D-08).
- **vcs.log() backend body-population (Rule 3 contract extension, bundled with Task 2):** `LOG_FORMAT` extended to `%H%x09%P%x09%an%x09%aI%x09%s%n%b` and `git log -z` for NUL-separated entries. `LogEntry.body` is now populated from the per-commit `%b` payload. Strictly additive: the 4 prior callers consume only hash/subject/parents — none rely on body being undefined.
- **10 new baselines committed (D-10):** captured before each migration; asserted post-migration via 8 new args-shape dispatch clauses in `baseline-parity.test.ts`. 22/22 baseline-parity tests pass (was 12 in 02-05; +10 = +5 check-ship-ready + 1 check-decision-coverage + 3 progress + 1 init-runner).
- **Lint progression:** `node scripts/lint-vcs-no-raw-git.cjs` count drops from 7 violations / 5 files to 5 violations / 3 files. Files exiting the violation set: `check-decision-coverage.ts`, `init-runner.ts`. Note: `check-ship-ready.ts` and `progress.ts` were not reported by the lint scanner pre-migration (their wrappers `runSyncSafe`/`execGit` are not pattern-matched by the scanner), but the per-file zero-raw-git invariant is now satisfied for both.
- **Test suite green:**
  - `cd sdk && pnpm exec vitest run src/query/check-ship-ready.test.ts` → 5/5 pass
  - `cd sdk && pnpm exec vitest run src/query/check-decision-coverage.test.ts` → 21/21 pass
  - `cd sdk && pnpm exec vitest run src/query/progress.test.ts` → 11/11 pass
  - `cd sdk && pnpm exec vitest run src/vcs/__tests__/baseline-parity.test.ts` → 22/22 pass
  - `cd sdk && pnpm exec vitest run src/vcs/__tests__/` → 135/135 pass (was 129 in 02-05)
  - `cd sdk && pnpm exec vitest run src/init-e2e.integration.test.ts src/lifecycle-e2e.integration.test.ts` → tests skip cleanly under `describe.skipIf(!cliAvailable || !gsdToolsAvailable || !e2eEnabled)`; test file collection succeeds
  - `pnpm build && pnpm build:cjs` exit 0 at every commit boundary
- **docs-init.ts NOT migrated:** verified at execution time to have ZERO raw-git invocations (`grep -nE "execSync\\(['\"]git |execFile\\(['\"]git |spawnSync\\(['\"]git " sdk/src/query/docs-init.ts` returns nothing). Per the plan's <objective> and CONTEXT, the file's allowlist removal in 02-02 contributes 0 violations to close.

## Migrated Sites Inventory

| File | Sites | Site lines | Adapter calls | Closes |
|------|------:|------------|---------------|--------|
| `sdk/src/query/check-ship-ready.ts` | 5 | 38, 41, 50, 55, 60 | `vcs.status`, `vcs.refs.currentBranch`, `vcs.gitOnly.configGet`, `vcs.refs.bookmarks.exists`, `vcs.refs.remotes` | All 5 raw-git sites; runSyncSafe helper deleted |
| `sdk/src/query/check-decision-coverage.ts` | 1 | 385 | `vcs.log({maxCount})` + reconstruction | Blocker-1 (iteration 1); ROADMAP SC-1 advances |
| `sdk/src/query/progress.ts` | 3 | 286, 290, 293 | `vcs.refs.countCommits`, `vcs.refs.rootCommits`, `vcs.log` with `expr.commit(firstCommit)` | All 3 sites + dynamic execGit import; Blocker-3 closed in production |
| `sdk/src/init-runner.ts` | 1 | 139 | `vcs.gitOnly.init()` (sync) after `vcs.kind === 'git'` narrow | The site + the dead-code execGit private helper (11 LOC); execFile import dropped |

**Total: 10 raw-git sites closed; 1 dead-code helper removed; 2 imports dropped.**

## Task Commits

Each task committed atomically on `phase/02-migration` in strict ascending-LOC order:

| # | Hash       | LOC | File                                              | Message subject                                       |
|--:|------------|----:|---------------------------------------------------|-------------------------------------------------------|
| 1 | 9ade44a2   | 103 | `sdk/src/query/check-ship-ready.ts`               | migrate sdk/src/query/check-ship-ready.ts to VcsAdapter |
| 2 | 1c8da8e5   | 554 | `sdk/src/query/check-decision-coverage.ts`        | migrate sdk/src/query/check-decision-coverage.ts to VcsAdapter |
| 3 | c49cd1ac   | 566 | `sdk/src/query/progress.ts`                       | migrate sdk/src/query/progress.ts to VcsAdapter       |
| 4 | 2144b879   | 734 | `sdk/src/init-runner.ts`                          | migrate sdk/src/init-runner.ts:139 to VcsAdapter      |

## Files Created/Modified

| File | Tasks | Net change |
|------|------:|-----------:|
| `sdk/src/query/check-ship-ready.ts` | 1 | +28 / -16 (adapter swap + runSyncSafe deletion + boolSyncSafe simplified) |
| `sdk/src/query/check-decision-coverage.ts` | 2 | +13 / -8 (createVcsAdapter import; execFile imports removed; recentCommitMessages reshape) |
| `sdk/src/query/progress.ts` | 3 | +21 / -10 (createVcsAdapter+expr import; site swaps; dynamic import dropped) |
| `sdk/src/init-runner.ts` | 4 | +6 / -19 (createVcsAdapter import; site swap; dead-helper deletion + execFile import removed) |
| `sdk/src/vcs/backends/git.ts` | 2 | +18 / -10 (LOG_FORMAT body extension + parser update) |
| `sdk/src/vcs/__tests__/baseline-parity.test.ts` | 1, 2, 3, 4 | +94 / -3 (8 new dispatch clauses + initFixture mode-aware) |
| `tests/__tools__/capture-vcs-baselines.cjs` | 1, 2, 3, 4 | +60 / -3 (10 new baseline entries + fresh-dir mode + 2 new regex match cases) |
| `tests/baselines/git-vcs/check-ship-ready-ts-38-status.snap.json` | 1 | new (32 LOC, exact match) |
| `tests/baselines/git-vcs/check-ship-ready-ts-41-current-branch.snap.json` | 1 | new (28 LOC, exact match — `master`) |
| `tests/baselines/git-vcs/check-ship-ready-ts-50-config-get.snap.json` | 1 | new (32 LOC, exact match — `refs/heads/main`) |
| `tests/baselines/git-vcs/check-ship-ready-ts-55-verify-ref.snap.json` | 1 | new (29 LOC, exact match — exit 128 fatal) |
| `tests/baselines/git-vcs/check-ship-ready-ts-60-remote.snap.json` | 1 | new (32 LOC, exact match — `origin`) |
| `tests/baselines/git-vcs/check-decision-coverage-ts-385-log-pretty.snap.json` | 2 | new (40 LOC, exact match — joined commit subjects+bodies) |
| `tests/baselines/git-vcs/progress-ts-286-rev-list-count.snap.json` | 3 | new (35 LOC, exact match — `3`) |
| `tests/baselines/git-vcs/progress-ts-290-rev-list-root.snap.json` | 3 | new (32 LOC, regex match — 40-hex SHA) |
| `tests/baselines/git-vcs/progress-ts-293-show-format.snap.json` | 3 | new (29 LOC, regex match — `YYYY-MM-DD`) |
| `tests/baselines/git-vcs/init-runner-ts-139-init.snap.json` | 4 | new (20 LOC, fresh-dir mode, regex match — `(Re)Initialized ... Git repository in `) |

## Decisions Made

- **Bundled vcs.log body-population into Task 2's commit (Rule 3 blocker):** the migration of check-decision-coverage.ts:385 needs `LogEntry.body` populated to reconstruct byte-equivalent output. 02-03 declared `body?: string` as optional but git-backend never populated it. Without this, the Blocker-1 fix's byte-equivalence requirement is unreachable. Strictly additive — verified safe by grepping the 4 prior callers.
- **Kept boolSyncSafe + execSync import in check-ship-ready.ts:** `gh --version` and `which gh` are tool-availability probes for `gh` (the GitHub CLI), not for git. They are out-of-scope for VcsAdapter. Keeping the helper + import for those two non-git callers is minimum-edit under D-08.
- **Did NOT use vcs.log({format: '%s%n%b'}):** the LogOpts.format type union is `'oneline' | 'full' | 'json'` — string passthrough would be a type error AND a D-12 violation (string passthrough escape hatch). Instead, populate body in the default format and reconstruct via map+join. Functionally byte-equivalent to the prior raw `git log --pretty=%s%n%b` (verified by the new baseline-parity dispatch clause).
- **expr.commit production consumption (Blocker-3 closure):** progress.ts:293 wraps `firstCommit` (the runtime SHA from `vcs.refs.rootCommits`) via `expr.commit()` rather than passing the raw string. This is the first production consumption of the structured-SHA factory introduced in 02-03 Task 2.
- **Paired test retarget vacuous for all 4 files:** check-ship-ready.test.ts uses non-git tmpdirs by design (test 4 explicitly tests non-git behavior); check-decision-coverage.test.ts has bespoke decision-coverage setup that doesn't directly exercise recentCommitMessages's git invocation; progress.test.ts uses non-git tmpdirs and the migrated code's outer try/catch leaves defaults; init-runner.ts's integration tests were already retargeted in 02-05. D-06 is satisfied — no test retarget edits needed; existing tests continue to pass.
- **Date-only drift restored at every Task:** running `capture-vcs-baselines.cjs` regenerates all baselines (no per-id filter), drifting `captured_at` on unrelated files from prior dates to today. Per D-08 / D-11, those drift edits are `git checkout`'d back at every Task. Only the 10 new baselines land in this plan's commits.
- **init-runner's containing async method keeps `async`:** RESEARCH §init-runner.ts explicitly recommends NOT removing the async modifier; the method has other awaits (`this.tools.configSet`, `this.tools.commit`, etc.) that semantically require it. The flip touches body only.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — blocking issue] Extended vcs.log() to populate LogEntry.body**

- **Found during:** Task 2 (Blocker-1 migration of check-decision-coverage.ts:385)
- **Issue:** The plan's IMPORTANT contract verification section directed verifying whether `vcs.log` exposes body content; the answer was no — git-backend's `log()` ignored body even though `LogEntry.body` was declared `body?: string` in 02-03. Without populating body, the byte-equivalent reconstruction the Blocker-1 fix requires would be unreachable.
- **Fix:** Changed LOG_FORMAT to `%H%x09%P%x09%an%x09%aI%x09%s%n%b` and switched the call to `git log -z` (NUL-separated entries so body's embedded newlines don't collide with the entry separator). Parser updated to split on `\x00` for entries, find the first `\n` to separate `head`-line from body, and populate `body` only when there is body text. Strictly additive: the 4 prior callers (git-backend.test.ts × 3 + adapter-contract.test.ts × 1) consume only `hash`/`subject`/`parents` — verified safe by grep before the change.
- **Files modified:** `sdk/src/vcs/backends/git.ts`
- **Commit:** Task 2 (1c8da8e5) — bundled with the migration commit because it is the direct enabler of that migration; isolating it into a separate gap-fill commit would inflate the plan's commit count without changing the diff content.

### Rule 4 (architectural) deviations

None.

### Plan-spec deviations (scope-bounded interpretation)

**2. [Plan-spec interpretation] Did NOT use `vcs.log({format: '%s%n%b'})` despite the plan's example code suggesting it**

- **What plan asked for:** Task 2's example used `vcs.log({maxCount: limit, format: '%s%n%b'})`.
- **What was done:** Used `vcs.log({maxCount: limit})` (no `format` option) and reconstruction via `entries.map(e => `${e.subject}\n${e.body??''}`).join('\n').trim()`.
- **Why:** `LogOpts.format` is type-union'd to `'oneline' | 'full' | 'json'` only. Passing the string `%s%n%b` would be a type error AND would require introducing a string-passthrough escape hatch — D-12 forbids that explicitly. The plan's IMPORTANT contract verification section anticipated this and authorized the fallback path: "If vcs.log returns only structured LogEntry[], reconstruct via .join('\n') over subject + body."
- **How the AC is satisfied:** the new baseline-parity dispatch clause for `log --pretty=%s%n%b` reconstructs the same way the consumer does and asserts byte-equality with `baseline.expected.stdout`. 22/22 baseline-parity tests pass.

**3. [Plan-spec interpretation] Paired test retarget is vacuous for all 4 source files**

- **What plan asked for:** Each task's <files> list included the source file's paired `.test.ts`. Tasks 1-3 said "replace bespoke setup with SDK initFixture; preserve test names verbatim."
- **What was done:** No test file modifications across all 4 tasks. After grep verification, none of the four test files contained git-touching setup that needed retargeting:
  - check-ship-ready.test.ts uses non-git tmpdirs (test 4 explicitly relies on non-git behavior)
  - check-decision-coverage.test.ts has bespoke decision-coverage fixtures (PLAN.md/SUMMARY.md content); doesn't directly exercise recentCommitMessages's git call
  - progress.test.ts uses non-git tmpdirs and the migrated code's outer try/catch handles non-git case
  - init-runner.ts's integration tests were already retargeted in 02-05
- **Why:** D-06 ("source + tests in same commit") is satisfied vacuously when there are no paired tests to retarget. Mirrors 02-05's interpretation for tests/core.test.cjs vs init.cjs.
- **How the AC is satisfied:** the existing tests continue to pass against the migrated source. No regression in any of: 5 check-ship-ready tests, 21 check-decision-coverage tests, 11 progress tests, init-e2e/lifecycle-e2e (skipped under describe.skipIf as expected).

---

**Total deviations:** 1 auto-fixed (Rule 3) + 2 plan-spec interpretations.
**Impact on plan:** All deviations on-scope, verified, and consistent with D-08 mechanical-only.

## Issues Encountered

- **Vitest test-runner spawn count:** `pnpm exec vitest run` (full suite) on this machine spawns ~20 worker processes that linger after test exit. Doesn't affect correctness; just slows wall-clock duration when waiting for completion. Per-file `vitest run` invocations are clean.
- **Pre-existing test failures (out of scope per executor SCOPE BOUNDARY):** `src/golden/read-only-parity.integration.test.ts` has 2 failing tests comparing live `.planning/STATE.md` against an expected snapshot — the live state has progress=59% / 1 uat_gap entry, expected snapshot has progress=20% / 0 uat_gaps. Not introduced by this plan; the golden snapshots haven't been refreshed since prior phase work. Stays in deferred-maintenance bucket.

## User Setup Required

None — no external configuration changed.

## Next Phase Readiness

- **Plans 02-07 onward unblocked.** Per D-02 ascending-LOC ordering, the next migration targets (in order of remaining LOC) are:
  - `get-shit-done/bin/lib/commands.cjs` (1028 LOC, 3 git subs — site 994 + others)
  - `sdk/src/query/commit.ts` (commit.ts at ~480 LOC — gated on commit.test.ts:304 triage which closed in 02-01)
  - `get-shit-done/bin/lib/verify.cjs` (1390 LOC, 9 git subs)
  - `get-shit-done/bin/lib/core.cjs` (2036 LOC, 6 git subs — largest hotspot, last per D-02)
- **Lint state on `phase/02-migration`:** 5 violations across 3 files (down from 7 / 5). Files remaining: `commands.cjs`, `core.cjs` (× 2), `commit.ts` (× 2). Files exiting in this plan: `check-decision-coverage.ts`, `init-runner.ts`. (`check-ship-ready.ts` and `progress.ts` weren't lint-flagged pre-plan but the per-file zero-raw-git invariant is now also satisfied for both.)
- **Baseline corpus:** 22 baselines total (was 12 in 02-05 close): 1 commands-cjs, 3 init-cjs, 3 init-ts, 1 commit-ts, 4 worktree-safety-cjs, 5 check-ship-ready-ts, 1 check-decision-coverage-ts, 3 progress-ts, 1 init-runner-ts. baseline-parity.test.ts dispatch table covers 13 verb shapes (added in this plan: `rev-parse --abbrev-ref HEAD`, `config --get`, `rev-parse --verify`, `remote`, `log --pretty=%s%n%b`, `rev-list --count`, `rev-list --max-parents=`, `show -s --format=%as`, `init`).
- **Carried Rule 4 follow-ups (from prior plans, no new in this plan):**
  - `tests/prune-orphaned-worktrees.test.cjs` and `tests/bug-2774-worktree-cleanup-workspace-safety.test.cjs` await an adapter expansion plan (workspace.add(branchCreate), merge, checkout, branch-rename verbs).
- **Carried testing gap:** init.cjs's `detectChildRepos`/`cmdInitNewWorkspace`/`cmdInitWorkspaceStatus` still have no direct unit-test coverage (carried from 02-05).
- **New testing gap:** progress.ts's git-touching block (lines 286-298) is exercised only via integration paths; the unit tests use non-git tmpdirs so the migrated adapter calls hit the outer try/catch and skip directly to defaults. Functional, but the migrated code path's happy-path is not directly unit-asserted. Surface for future maintenance; out-of-scope for the mechanical migration.

## Self-Check: PASSED

- All 4 commits exist on `phase/02-migration` in ascending-LOC order (`9ade44a2`, `1c8da8e5`, `c49cd1ac`, `2144b879`): confirmed via `git log --oneline -6`.
- `cd sdk && pnpm build && pnpm build:cjs` both exit 0: confirmed.
- `cd sdk && pnpm exec vitest run src/vcs/__tests__/` → 135/135 pass: confirmed.
- `cd sdk && pnpm exec vitest run src/query/check-ship-ready.test.ts` → 5/5 pass: confirmed.
- `cd sdk && pnpm exec vitest run src/query/check-decision-coverage.test.ts` → 21/21 pass: confirmed.
- `cd sdk && pnpm exec vitest run src/query/progress.test.ts` → 11/11 pass: confirmed.
- `cd sdk && pnpm exec vitest run src/vcs/__tests__/baseline-parity.test.ts` → 22/22 pass: confirmed.
- `cd sdk && pnpm exec vitest run src/init-e2e.integration.test.ts src/lifecycle-e2e.integration.test.ts` → tests skip under describe.skipIf gate (no GSD_ENABLE_E2E env), exit 0: confirmed.
- `grep -cE "execSync\\(['\"]git " sdk/src/query/check-ship-ready.ts sdk/src/query/check-decision-coverage.ts sdk/src/query/progress.ts sdk/src/init-runner.ts` returns 0 for each: confirmed (4 zeros reported).
- `grep -nE "vcs\\.(status|refs\\.currentBranch|gitOnly\\.configGet|refs\\.bookmarks\\.exists|refs\\.remotes)" sdk/src/query/check-ship-ready.ts` returns 5 matches: confirmed.
- `grep -nE "vcs\\.log\\(|createVcsAdapter" sdk/src/query/check-decision-coverage.ts` returns 3 matches (1 import + 2 call lines): confirmed.
- `grep -nE "vcs\\.refs\\.countCommits|vcs\\.refs\\.rootCommits|vcs\\.log\\(" sdk/src/query/progress.ts` returns 3 matches; `expr\\.commit\\(` returns 1 production-line match: confirmed.
- `grep -nE "vcs\\.gitOnly\\.init\\(\\)" sdk/src/init-runner.ts` returns 1 match (line 144); `private execGit` returns 0 matches: confirmed.
- All 10 baselines exist at `tests/baselines/git-vcs/`: confirmed.
- `node scripts/lint-vcs-no-raw-git.cjs` reports 5 violations / 3 files (was 7 / 5): confirmed; `check-decision-coverage.ts` and `init-runner.ts` no longer in violation set.
- Branch: `phase/02-migration` per D-12: confirmed via `git branch --show-current`.
- `docs-init.ts` not modified in this plan: confirmed.

---

*Phase: 02-bulk-call-site-migration-still-git-only*
*Completed: 2026-05-10*
