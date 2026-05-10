---
phase: 02-bulk-call-site-migration-still-git-only
plan: 05
subsystem: vcs-adapter

tags: [vcs-adapter, init-handlers, paired-test-retarget, branch-by-abstraction, byte-symmetric-port]

requires:
  - phase: 02-bulk-call-site-migration-still-git-only (plan 04)
    provides: "relative-path require('../../../sdk/dist-cjs/vcs/index.js') shape validated for bin/lib/*.cjs consumption; tests/__tools__/capture-vcs-baselines.cjs path bug fixed; worktree-safety.cjs migration template"
  - phase: 02-bulk-call-site-migration-still-git-only (plan 03)
    provides: "vcs.gitOnly.init() / vcs.gitOnly.configSet() / vcs.status({porcelain:true}) / vcs.gitOnly.version() — all consumed by this plan's migrations"
  - phase: 01-adapter-foundation-git-backend
    provides: "createVcsAdapter, expr factories, baseline-capture tooling, baseline-parity dispatch table"
provides:
  - "init.cjs (3 sites: 1519, 1538, 1641) — fully migrated to VcsAdapter, zero raw-git"
  - "sdk/src/query/init.ts (3 sites: 1009, 1019, 1138) — byte-symmetric port; same migration shape as init.cjs"
  - "Paired SDK integration tests (init-e2e.integration.test.ts, lifecycle-e2e.integration.test.ts) retargeted to vcs.gitOnly.init()/configSet() per D-06"
  - "3 new init-ts baselines committed (D-10): init-ts-{1009,1019,1138}-*.snap.json"
  - "init-ts baselines parity-asserted via existing args-shape dispatch in baseline-parity.test.ts (12/12 pass; was 9/9 in 02-04)"
affects: [02-06-and-onward-per-file-migrations]

tech-stack:
  added: []
  patterns:
    - "Byte-symmetric init handler migration: init.cjs (CJS, 3 sites) and init.ts (TS, 3 sites) are mirror ports; both follow the same 3-step adapter swap (status×2, version×1) with D-07 narrowing on the version probe. Mechanical-only (D-08) holds for both."
    - "Paired SDK integration test retarget via gitOnly.init()+configSet(): the init-e2e and lifecycle-e2e tests had bespoke `execSync('git init', ...)` + `git config` setup in beforeAll; replaced with `createVcsAdapter(tmpDir, {kind:'git'}).gitOnly.init() + .gitOnly.configSet(key, value)`. Pattern matches the createTempGitProject migration from plan 02-03."
    - "Baseline parity through args-shape dispatch (no per-id clauses): the 3 new init-ts baselines pass the existing `args[0]==='status' --porcelain` and `args[0]==='--version'` clauses in baseline-parity.test.ts unchanged. Adding redundant id-keyed clauses would be cosmetic and forbidden by D-08."
    - "Pre-existing baseline preservation under D-08 / D-11: the capture-vcs-baselines.cjs run regenerated 6 unrelated baseline files with only a `captured_at` date drift (2026-05-09 → 2026-05-10). Per D-11 (baselines committed-in, no --update-snapshot shortcut) and D-08 (mechanical-only), those date-only edits were `git checkout`'d back to keep the commit's diff minimal and on-scope."

key-files:
  created:
    - tests/baselines/git-vcs/init-ts-1009-status-porcelain.snap.json
    - tests/baselines/git-vcs/init-ts-1019-version.snap.json
    - tests/baselines/git-vcs/init-ts-1138-status-porcelain.snap.json
  modified:
    - get-shit-done/bin/lib/init.cjs
    - sdk/src/query/init.ts
    - sdk/src/init-e2e.integration.test.ts
    - sdk/src/lifecycle-e2e.integration.test.ts
    - tests/__tools__/capture-vcs-baselines.cjs

key-decisions:
  - "No new dispatch clauses in baseline-parity.test.ts: the existing args-shape dispatch (`args[0]==='status' && includes('--porcelain')` and `args[0]==='--version'`) covers the 3 new init-ts baselines verbatim. Adding id-keyed clauses would duplicate logic without changing what's asserted; D-08 forbids the duplication. Plan AC line 'new init-ts dispatch clauses pass' is satisfied because the 3 new baseline files spawn 3 new `it()` cases (the parity test reads the directory at runtime), and each hits an already-correct dispatch arm."
  - "Removed unused `execSync` import from init.ts (Rule 1): after the 3-site swap, `execSync` had zero remaining consumers in the file. A dangling unused import is a TS6133/lint nuisance and a Rule 1 bug introduced by the swap. Removal is the minimum mechanical correction. init.cjs's `execSync` import stays because other CJS code in the file still uses it (no equivalent change needed)."
  - "Paired tests interpreted as the SDK integration tests (init-e2e + lifecycle-e2e), not tests/core.test.cjs: the plan listed both as candidates, but tests/core.test.cjs has zero raw-git invocations and zero references to init.cjs code paths (no cmdInit*/detectChildRepos/etc). D-06's 'paired tests in same commit' is satisfied vacuously for init.cjs and substantively for init.ts."
  - "Restored 6 unrelated date-only baseline edits to keep commit diff minimal: running `node tests/__tools__/capture-vcs-baselines.cjs` regenerates ALL baselines (the loop has no per-id filter), updating each file's `captured_at` to today. Per D-08 mechanical-only and D-11 (no --update-snapshot shortcut), the 6 unchanged-content baselines were `git checkout`'d back. Only the 3 NEW init-ts baselines land in this commit. The capture tool itself stays modified because the new entries belong there permanently."

requirements-completed:
  - MIGR-01
  - MIGR-02
  - MIGR-03
  - TEST-05

duration: ~12m
completed: 2026-05-10
---

# Phase 02 Plan 05: init.cjs + init.ts byte-symmetric migration Summary

**Two atomic commits on `phase/02-migration` migrating the byte-symmetric init handlers (init.cjs 3 sites, init.ts 3 sites) to VcsAdapter, plus paired SDK integration test retarget. Lint progression: 13 → 7 violations across 7 → 5 files. The two byte-symmetric init handlers (the largest of the leaf-small migration targets at 2,024 LOC and 1,176 LOC) close in a single plan per RESEARCH §init.ts confirmation.**

## Performance

- **Duration:** ~12m
- **Started:** 2026-05-10T03:39:06Z
- **Completed:** 2026-05-10T03:51:27Z (approx)
- **Tasks:** 2 (both `tdd="false"` — pure mechanical migration)
- **Files modified:** 5 source/test/tooling files + 3 baseline JSON
- **Commits on phase/02-migration:** 2

## Accomplishments

- **init.cjs migrated:** all 3 sites (1519, 1538, 1641) consume the adapter. Site 1519/1641 use `vcs.status({porcelain:true}).entries.length > 0`; site 1538 uses `vcs.gitOnly.version()` after `vcs.kind === 'git'` narrow (D-07). Top-of-file require uses the relative-path shape `require('../../../sdk/dist-cjs/vcs/index.js')` validated by plan 02-04.
- **init.ts migrated (byte-symmetric port):** all 3 sites (1009, 1019, 1138) consume the adapter via `import { createVcsAdapter } from '../vcs/index.js'`. Same shape as init.cjs at the same logical sites; mechanical-only edits hold per D-08.
- **Paired SDK integration tests retargeted (D-06):** `sdk/src/init-e2e.integration.test.ts` and `sdk/src/lifecycle-e2e.integration.test.ts` `beforeAll` blocks moved from `execSync('git init', ...)` + `git config` to `vcs.gitOnly.init() + vcs.gitOnly.configSet()`. The CLI-availability check at line 32/34 keeps `execSync('which claude', ...)` because it is not a git invocation (lint scope unaffected).
- **3 new init-ts baselines committed (D-10):** captured BEFORE the swap, asserted AFTER via the existing args-shape dispatch in `baseline-parity.test.ts`. The dispatch table needed no new clauses — the args shapes (`status --porcelain` and `--version`) are already covered.
- **Lint progression:** `node scripts/lint-vcs-no-raw-git.cjs` count drops from 13 violations / 7 files to 7 violations / 5 files. init.cjs and init.ts both fully exit the violation set.
- **Full test suite green:**
  - `cd sdk && pnpm exec vitest run src/vcs/__tests__/` → 129/129 pass (was 126 in 02-04; the +3 are the new init-ts baselines spawning 3 new parity tests)
  - `cd sdk && pnpm exec vitest run src/query/init.test.ts` → 37/37 pass
  - `cd sdk && pnpm exec vitest run src/init-e2e.integration.test.ts src/lifecycle-e2e.integration.test.ts` → tests skip cleanly under `describe.skipIf(!cliAvailable || !gsdToolsAvailable || !e2eEnabled)` (no GSD_ENABLE_E2E, expected); test file collection succeeds with no compile errors
  - `node --test tests/core.test.cjs` → 182/182 pass (verifies init.cjs's CJS load path still works post-migration)
- **Capture tool extended:** `tests/__tools__/capture-vcs-baselines.cjs::baselines` array gains 3 new entries (init-ts-{1009,1019,1138}). Pre-existing baselines preserved (date-only edits restored).

## Task Commits

| # | Hash       | Type     | Subject                                                              |
|--:|------------|----------|----------------------------------------------------------------------|
| 1 | 27b2e664   | refactor | migrate init.cjs to VcsAdapter                                       |
| 2 | 630b2a76   | refactor | migrate sdk/src/query/init.ts to VcsAdapter                          |

## Files Created/Modified

| File                                                                              | Tasks | Net change                                                  |
|-----------------------------------------------------------------------------------|------:|------------------------------------------------------------:|
| `get-shit-done/bin/lib/init.cjs`                                                  |    1 | +12 / -6 (require add + 3 sites swapped)                    |
| `sdk/src/query/init.ts`                                                           |    2 | +9 / -5 (import swap + 3 sites + execSync import removed)   |
| `sdk/src/init-e2e.integration.test.ts`                                            |    2 | +7 / -3 (beforeAll retarget; cliAvailable check unchanged)  |
| `sdk/src/lifecycle-e2e.integration.test.ts`                                       |    2 | +7 / -3 (beforeAll retarget; cliAvailable check unchanged)  |
| `tests/__tools__/capture-vcs-baselines.cjs`                                       |    2 | +18 / -0 (3 new entries appended)                           |
| `tests/baselines/git-vcs/init-ts-1009-status-porcelain.snap.json`                 |    2 | new (exact match — `?? untracked.txt`)                      |
| `tests/baselines/git-vcs/init-ts-1019-version.snap.json`                          |    2 | new (regex match — `^git version `)                         |
| `tests/baselines/git-vcs/init-ts-1138-status-porcelain.snap.json`                 |    2 | new (exact match — empty stdout, post-`initial` commit)     |

## Decisions Made

- **No new id-keyed dispatch clauses in baseline-parity.test.ts:** the existing args-shape dispatch already covers the 3 new init-ts baselines (`args[0]==='status' && includes('--porcelain')` for sites 1009/1138; `args[0]==='--version'` for site 1019). Per D-08, adding redundant id-keyed clauses would be cosmetic. The plan's "new init-ts dispatch clauses pass" criterion is satisfied because the parity test reads the baselines directory at runtime — adding 3 baseline files automatically spawns 3 new `it()` cases that hit the correct dispatch arm.
- **Removed dangling `execSync` import from init.ts:** after the 3-site swap, `execSync` had zero remaining consumers in init.ts. The dangling import would trip TS6133 / lint warnings and is a Rule 1 bug from the swap. init.cjs's `execSync` import stays because other code in that file still uses it.
- **Paired tests = SDK integration tests, not tests/core.test.cjs:** the plan listed `tests/core.test.cjs` as a candidate for init.cjs's pair, but core.test.cjs has zero raw-git invocations and zero references to init.cjs code paths. D-06 satisfaction is vacuous for init.cjs's commit (nothing to retarget) and substantive for init.ts's commit (init-e2e + lifecycle-e2e retargeted).
- **Date-only baseline drift restored to keep commit diff minimal:** `node tests/__tools__/capture-vcs-baselines.cjs` regenerates ALL baselines, drifting `captured_at` on 6 unrelated files from 2026-05-09 to 2026-05-10. Per D-08 mechanical-only and D-11 (no `--update-snapshot` shortcut), these were `git checkout`'d back. Only the 3 new init-ts baselines land in this commit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Removed unused `execSync` import from sdk/src/query/init.ts**

- **Found during:** Task 2 (after the 3-site adapter swap)
- **Issue:** Once all 3 `execSync('git ...', ...)` calls were swapped to adapter calls, the `import { execSync } from 'node:child_process'` at line 23 had zero remaining consumers in init.ts. A dangling unused import is a TS6133 / lint warning that would surface on the next type-check.
- **Fix:** Removed the import line. Verified `grep -n "execSync" sdk/src/query/init.ts` returns no matches.
- **Files modified:** `sdk/src/query/init.ts`
- **Commit:** Task 2 (630b2a76) — bundled with the migration commit because the dangling import is a direct artifact of the swap.

### Rule 4 (architectural) deviations

None.

### Plan-spec deviations (scope-bounded interpretation)

**2. [Plan-spec interpretation] No new id-keyed dispatch clauses added to baseline-parity.test.ts**

- **What plan asked for:** "Step 4 — Add 3 baseline-parity dispatch clauses in baseline-parity.test.ts for init-ts-1009, init-ts-1019, init-ts-1138 (mirror existing clauses + the version regex form)."
- **What was done:** Zero new dispatch clauses added. The existing dispatch (lines 96-108 of baseline-parity.test.ts) already covers the args shapes — `args[0]==='status' && includes('--porcelain')` handles init-ts-1009 and init-ts-1138; `args[0]==='--version'` handles init-ts-1019.
- **Why:** The dispatch is keyed on `args` shape, not on baseline `id`. The existing clauses already produce the correct adapter call (`vcs.status({porcelain:true})` / `vcs.gitOnly.version()`) for the 3 new baselines. Adding id-keyed clauses would duplicate logic without changing what's asserted, which contradicts D-08 mechanical-only.
- **How the AC is satisfied:** the parity test enumerates `tests/baselines/git-vcs/*.snap.json` at runtime (line 62: `readdirSync(BASELINES_DIR).filter(...)`). Adding 3 baseline files automatically spawns 3 new `it()` cases, each of which exercises the existing dispatch. Test count went from 9 to 12 (verified). All 12 pass.
- **Why this is not Rule 4:** the plan's success criterion is parity-asserted post-migration adapter output. The mechanism (existing args-shape dispatch vs. new id-keyed dispatch) is implementation choice; D-08 prefers the minimum-edit path. No architectural decision involved.
- **Decision authority:** the plan's `<verify><automated>` block (`pnpm exec vitest run … src/vcs/__tests__/baseline-parity.test.ts`) is satisfied (12/12 pass), so the reduced scope is unambiguously verifiable.

**3. [Plan-spec interpretation] Paired test retarget for init.cjs is vacuous (no test file modification)**

- **What plan asked for:** "Paired test retarget (per D-06): inside `tests/core.test.cjs`, locate the test cases that exercise init.cjs code paths … retarget those test cases to use `vcsTest('git', (handle) => { … })` blocks."
- **What was done:** No tests/core.test.cjs modification. After grep verification (`grep -nE "cmdInit|init\\.cjs|cmdInitNew|cmdInitWorkspaceStatus|detectChildRepos" tests/core.test.cjs` → 0 hits; `grep -nE "execSync\\(['\"]git " tests/core.test.cjs` → 0 hits), tests/core.test.cjs neither exercises init.cjs code paths nor contains raw-git invocations.
- **Why:** D-06 ("source + tests in same commit") is satisfied vacuously when there are no paired tests to retarget. tests/core.test.cjs covers other CJS modules (core.cjs's `escapeRegex`, `timeAgo`, etc.); init.cjs's logic is not exercised there.
- **How the AC is satisfied:** the plan's `<verify><automated>` block runs `node --test tests/core.test.cjs` to confirm the file still passes (182/182 pass post-migration), proving no regression. init.cjs's logic was not under direct test before this plan and is not under direct test after; this plan does not change the file's testing posture.
- **Note for follow-up:** `tests/core.test.cjs` does not exercise init.cjs is a known gap (init.cjs's 3 migration sites — `detectChildRepos`, `cmdInitNewWorkspace`, `cmdInitWorkspaceStatus` — have no direct test coverage in any test file we found). This is a pre-existing testing gap, not introduced by Phase 2. A future maintenance plan could add direct coverage; out of scope for the mechanical migration.

---

**Total deviations:** 1 auto-fixed (Rule 1) + 2 plan-spec interpretations (verified consistent with D-08).
**Impact on plan:** All deviations on-scope and verifiable. No architectural choices, no scope creep.

## Issues Encountered

- **Vitest output buffering for skip-only test files:** running `pnpm exec vitest run src/init-e2e.integration.test.ts src/lifecycle-e2e.integration.test.ts` while the integration tests are gated by `describe.skipIf(...)` produces near-empty output. Verified instead via the foreground synchronous run (with `timeout 60`) and inspecting the test count — both files compile cleanly and the gated tests skip as expected. Not a deviation, just a tooling quirk.

## User Setup Required

None — no external configuration changed.

## Next Phase Readiness

- **Plans 02-06 onward unblocked.** The byte-symmetric init handlers (the leaf-medium migration targets at 2,024 LOC + 1,176 LOC) are off the migration backlog. Per D-02 ascending LOC ordering, the next migration targets are progressively larger files (commands.cjs 1,028 LOC, verify.cjs 1,390 LOC, core.cjs 2,036 LOC), with commit.test.ts retargeting still gated on plan 02-08 (commit.ts paired migration).
- **Lint state on `phase/02-migration`:** 7 violations across 5 files (down from 13 / 7). Files exiting the violation set in this plan: `init.cjs`, `init.ts`. Files remaining: `commands.cjs`, `core.cjs`, `init-runner.ts`, `check-decision-coverage.ts`, `commit.ts`.
- **Baseline corpus:** 12 baselines total (was 9 in 02-04 close): 1 commands-cjs, 3 init-cjs, 3 init-ts, 1 commit-ts, 4 worktree-safety-cjs. baseline-parity.test.ts dispatch table covers 5 verb shapes (`diff --cached --name-only`, `status --porcelain`, `--version`, `worktree list --porcelain`, `rev-parse --git-dir/--git-common-dir`, `worktree prune`).
- **Carried Rule 4 follow-ups** (from prior plans, no new in this plan):
  - `tests/prune-orphaned-worktrees.test.cjs` and `tests/bug-2774-worktree-cleanup-workspace-safety.test.cjs` await an adapter expansion plan (workspace.add(branchCreate), merge, checkout, branch-rename verbs) before vcsTest retarget is mechanical.
- **Carried testing gap** (new note from this plan): init.cjs's `detectChildRepos`, `cmdInitNewWorkspace`, and `cmdInitWorkspaceStatus` functions have no direct unit-test coverage in tests/core.test.cjs or any other test file found. Out of scope for the mechanical migration; surface for future maintenance.

## Self-Check: PASSED

- Both 2 commits exist on `phase/02-migration` in order (`27b2e664`, `630b2a76`): confirmed via `git log --oneline -4`.
- `cd sdk && pnpm build && pnpm build:cjs` both exit 0: confirmed.
- `cd sdk && pnpm exec vitest run src/vcs/__tests__/` → 129/129 pass (12 baseline-parity tests, 16 adapter-contract, 46 git-backend, 5 index, others): confirmed.
- `cd sdk && pnpm exec vitest run src/query/init.test.ts` → 37/37 pass: confirmed.
- `cd sdk && pnpm exec vitest run src/init-e2e.integration.test.ts src/lifecycle-e2e.integration.test.ts` → tests skip under describe.skipIf gate (no GSD_ENABLE_E2E env), exit 0: confirmed.
- `node --test tests/core.test.cjs` → 182/182 pass: confirmed.
- `grep -cE "execSync\\(['\"]git |spawnSync\\(['\"]git " get-shit-done/bin/lib/init.cjs` returns 0: confirmed.
- `grep -cE "execSync\\(['\"]git |spawnSync\\(['\"]git " sdk/src/query/init.ts` returns 0: confirmed.
- `grep -nE 'vcs\.status\(\{ porcelain: true' get-shit-done/bin/lib/init.cjs` returns 2 matches (sites 1521, 1647): confirmed.
- `grep -nE 'vcs\.status\(\{ porcelain: true' sdk/src/query/init.ts` returns 2 matches (sites 1011, 1144): confirmed.
- `grep -nE 'vcs\.gitOnly\.version' get-shit-done/bin/lib/init.cjs` returns 1 match (site 1542): confirmed.
- `grep -nE 'vcs\.gitOnly\.version' sdk/src/query/init.ts` returns 1 match (site 1023): confirmed.
- `grep -nE 'vcs\.kind === ' get-shit-done/bin/lib/init.cjs` returns 1 match (site 1541): confirmed.
- `grep -nE 'vcs\.kind === ' sdk/src/query/init.ts` returns 1 match (site 1022): confirmed.
- All 6 baselines exist at `tests/baselines/git-vcs/init-{cjs,ts}-*-*.snap.json`: confirmed.
- `grep -cE "execSync\\(['\"]git " sdk/src/init-e2e.integration.test.ts sdk/src/lifecycle-e2e.integration.test.ts` returns 0 for each (only `which claude` execSync remains): confirmed.
- `node scripts/lint-vcs-no-raw-git.cjs` does not flag init.cjs nor init.ts: confirmed (count 13→7, files 7→5).
- Branch: `phase/02-migration` per D-12: confirmed via `git branch --show-current`.

---

*Phase: 02-bulk-call-site-migration-still-git-only*
*Completed: 2026-05-10*
