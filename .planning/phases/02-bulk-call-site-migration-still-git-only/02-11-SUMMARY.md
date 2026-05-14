---
phase: 02-bulk-call-site-migration-still-git-only
plan: 11
subsystem: vcs-migration
tags: [vcs-adapter, core, closing, hotspot-audit, lint-clean, helper-deletion]
requires:
  - 02-04 (worktree-safety.cjs migrated; deps.execGit consumers retired)
  - 02-09 (commands.cjs migrated; execGit re-export removed from consumer)
  - 02-10 (verify.cjs/verify.ts migrated; only core.cjs hotspot remained)
provides:
  - "core.cjs migrated to VcsAdapter (1 site closed: line 603 isGitIgnored)"
  - "execGit helper + DEFAULT_GIT_TIMEOUT_MS deleted (helper had zero remaining consumers)"
  - "Phase 2 production-source migration COMPLETE: zero raw-git in non-test source"
  - "Lint guard exits 0 on phase/02-migration (broken-lint state opened in 02-02 closes here)"
  - "UPSTREAM-03 hotspot-discipline audit verification gate PASSES (D-08 invariant verified)"
  - "Phase 2 ready to merge to main"
affects:
  - get-shit-done/bin/lib/core.cjs
  - tests/__tools__/capture-vcs-baselines.cjs (1 new baseline entry)
  - sdk/src/vcs/__tests__/baseline-parity.test.ts (1 new args-shape dispatch clause)
  - tests/baselines/git-vcs/core-cjs-603-check-ignore.snap.json (created)
  - .planning/phases/02-bulk-call-site-migration-still-git-only/02-11-AUDIT.md (created)
tech-stack:
  added: []
  patterns:
    - "vcs.refs.isIgnored(path) replaces execFileSync('git', ['check-ignore', '-q', '--no-index', '--', path]) — boolean adapter return contracts the success/failure ternary to a single line"
    - "Helper-deletion mechanics: canary grep across consumers (require(...core.cjs...).execGit + deps.execGit) BEFORE deletion ensures zero downstream breakage"
    - "Dead-arg cleanup at internal call sites is part of the helper-deletion mechanical contract (D-08): when a deps.execGit pass-through is rendered dead by a downstream consumer's adapter migration, removing the dead arg alongside the helper deletion is mechanical, not opportunistic"
key-files:
  created:
    - tests/baselines/git-vcs/core-cjs-603-check-ignore.snap.json
    - .planning/phases/02-bulk-call-site-migration-still-git-only/02-11-AUDIT.md
  modified:
    - get-shit-done/bin/lib/core.cjs
    - tests/__tools__/capture-vcs-baselines.cjs
    - sdk/src/vcs/__tests__/baseline-parity.test.ts
key-decisions:
  - "core.cjs:603 isGitIgnored migrated to vcs.refs.isIgnored(path) — adapter's boolean return shape contracts the prior try/catch (success → set true / catch → set false) into a single set(key, ignored)/return ignored line. The catch branch is preserved for any unexpected adapter throw (e.g., dist-cjs load failure or non-git cwd surfacing as a thrown error rather than the documented exit-code 1)."
  - "execGit helper + DEFAULT_GIT_TIMEOUT_MS deleted as a single mechanical unit — the constant was a private dependency of execGit (one reference, inside execGit's body) and is dead after deletion. Per D-08, mechanical removal of the helper + its private constant is in scope for this commit."
  - "Internal core.cjs callers (resolveWorktreeRoot, pruneOrphanedWorktrees) drop their now-dead deps.execGit pass — worktree-safety.cjs's resolveWorktreeContext / planWorktreePrune / executeWorktreePrunePlan all consume deps.vcs after plan 02-04. The dead-arg removal is part of the helper-deletion mechanical contract, NOT opportunistic cleanup (without it, the helper deletion would cascade-break the file at module-load time because execGit is referenced before its definition was removed)."
  - "Paired test retarget NOT performed (D-08 vacuous-paired precedent from 02-07/02-09): tests/core.test.cjs, tests/profile-output.test.cjs, tests/bug-2772-gitmodules-path-intersection.test.cjs all return 0 matches for `grep -cE \"execSync\\(['\\\"]git \"`. None reference isGitIgnored. The worktree tests in core.test.cjs use `execSyncLocal` (an aliased import) which is allowlisted via the tests/**/*.test.cjs glob. Including no-op edits would violate D-08."
  - "child_process imports (execSync, execFileSync, spawnSync) left intact in the top-of-file destructure even though all three are now unused — D-08 forbids opportunistic import pruning. A future cleanup plan (or the deferred-tracker 02-12) can remove them."
  - "UPSTREAM-03 audit window: b12e7ffe^..HEAD (Phase 2 migration commits only). Excluding pre-Phase-2 commits on main is correct: the audit verifies Phase 2's mechanical-edits invariant, not unrelated churn that landed on main during the long-lived branch's lifetime. Per RESEARCH §Hotspot Audit Mechanics line 813."
patterns-established:
  - "Closing-migration commit pattern: when a file's last raw-git invocation migrates AND the file's helper had downstream consumers retired by prior plans, the helper definition deletion lands in the same commit as the last call-site swap (atomic 'this file is now adapter-shaped, including helper retirement')"
  - "Helper-deletion canary grep: BEFORE deleting any re-exported helper, run two greps — `require(...core.cjs...).execGit` (consumer destructure) and `deps.execGit` (DI seam). Both must return 0 (or only comment matches) before deletion proceeds"
  - "UPSTREAM-03 hotspot-audit grep recipe (D-16): per-hotspot diff filtered to non-mechanical-shape lines, then per-line review for D-08 compliance — surfaces every adapter-shape adaptation as a category, with each category traced to its plan-sanctioned justification (mechanical adapter-swap or documented Rule-N deviation)"
requirements-completed:
  - MIGR-02
  - MIGR-03
  - TEST-05
  - UPSTREAM-03
metrics:
  duration: ~13m
  completed_date: 2026-05-10
---

# Phase 02 Plan 11: core.cjs (CLOSING) + UPSTREAM-03 Hotspot Audit Summary

**The closing migration commit. core.cjs (2,036 LOC, largest hotspot) site 603 routed through `vcs.refs.isIgnored`; the `execGit` helper deleted (every prior consumer migrated by plans 02-04/02-09/02-10); lint guard now exits 0 on phase/02-migration; UPSTREAM-03 hotspot-discipline audit verifies the D-08 mechanical-only invariant holds across all three hotspots.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-05-10T06:15:00Z
- **Completed:** 2026-05-10T06:28:35Z
- **Tasks:** 2
- **Files modified:** 5 (4 in Task 1 + 1 in Task 2)

## Accomplishments

- core.cjs (2,036 LOC, largest hotspot) site 603 (`isGitIgnored`) migrated to `vcs.refs.isIgnored(path)`
- `execGit` helper at lines 742-758 + `DEFAULT_GIT_TIMEOUT_MS` constant DELETED (every prior consumer retired by plans 02-04/02-09/02-10; canary grep confirmed 0 matches)
- Internal core.cjs callers (`resolveWorktreeRoot`, `pruneOrphanedWorktrees`) dropped their dead `deps.execGit` pass — worktree-safety.cjs's policy functions all consume `deps.vcs` after plan 02-04
- Phase 2 production-source migration **COMPLETE**: zero `execSync('git …')` in non-test source under `sdk/src/query/*.ts` or `get-shit-done/bin/lib/*.cjs`
- `node scripts/lint-vcs-no-raw-git.cjs` exits **0** on `phase/02-migration` — broken-lint state opened day-one in plan 02-02 (D-13) CLOSES here. Allowlist matches its post-Phase-2 steady state (D-14)
- UPSTREAM-03 hotspot-discipline audit verification gate executed (D-16): all three hotspots (core.cjs, verify.cjs, commands.cjs) pass the D-08 mechanical-only invariant. 32 surfaced diff hunks across all hotspots, all traced to plan-sanctioned mechanical adaptations or documented Rule-2 deviations
- Phase 2 is **ready to merge to main**

## Sites Migrated

| File | Line | Before | After | Gap-fill consumed |
|------|------|--------|-------|-------------------|
| core.cjs | 603 | `execFileSync('git', ['check-ignore', '-q', '--no-index', '--', targetPath], { cwd, stdio: 'pipe' })` | `vcs.refs.isIgnored(targetPath)` | (none — Phase 1 forward-complete verb) |

**1 site closed.** Per-plan call-site progression:

| Plan | Sites closed | Hotspot? |
|------|-------------|----------|
| 02-04 (worktree-safety.cjs) | 3 | No (338 LOC, smoke-test) |
| 02-05 (init.cjs + init.ts) | 6 | No (init pair) |
| 02-06 (4 small TS files) | 10 | No (ascending-LOC) |
| 02-07 (graphify.cjs) | 2 | No (594 LOC) |
| 02-08 (commit.ts) | 5 | No |
| 02-09 (commands.cjs) | 14 | Yes (1,028 LOC) |
| 02-10 (verify.cjs + verify.ts) | 9 | Yes (1,390 LOC + 692 LOC) |
| **02-11 (core.cjs)** | **1** | **Yes (2,036 LOC, LARGEST)** |
| **TOTAL** | **50** | |

## Task Commits

Each task was committed atomically on `phase/02-migration`:

1. **Task 1: Migrate core.cjs (1 site + delete execGit helper) + paired tests** — `xoowpwpslxkznozvkqnopkxxluulkslw` (refactor)
2. **Task 2: UPSTREAM-03 hotspot-discipline audit (D-16 verify gate)** — `lywtqwolqszolkwymystzptmtuslmymm` (docs)

**Plan metadata:** (this commit) — docs: complete plan

## Files Created/Modified

### Created

- `tests/baselines/git-vcs/core-cjs-603-check-ignore.snap.json` — Phase 1 D-10 baseline for `git check-ignore -q --no-index -- node_modules/foo` (exit 0, empty stdout under -q quiet flag)
- `.planning/phases/02-bulk-call-site-migration-still-git-only/02-11-AUDIT.md` — UPSTREAM-03 hotspot-discipline audit report (236 lines, all hotspots CLEAN)

### Modified

- `get-shit-done/bin/lib/core.cjs` — site 603 migrated, execGit helper + DEFAULT_GIT_TIMEOUT_MS deleted, internal callers' dead deps.execGit removed, module.exports.execGit removed, top-of-file createVcsAdapter import added
- `tests/__tools__/capture-vcs-baselines.cjs` — 1 new baseline entry (`core-cjs-603-check-ignore`)
- `sdk/src/vcs/__tests__/baseline-parity.test.ts` — 1 new args-shape dispatch clause for `args[0] === 'check-ignore' && args.includes('-q') && args.includes('--no-index')`

## Decisions Made

### Vacuous Paired Tests (D-08 Precedent)

The plan's 3 paired tests (`tests/core.test.cjs`, `tests/profile-output.test.cjs`, `tests/bug-2772-gitmodules-path-intersection.test.cjs`) were NOT retargeted. Per the D-08 vacuous-paired precedent established in 02-07 (graphify.test.cjs) and 02-09 (3 vacuous tests):

```bash
$ grep -cE "execSync\(['\"]git " tests/core.test.cjs tests/profile-output.test.cjs tests/bug-2772-gitmodules-path-intersection.test.cjs
tests/core.test.cjs:0
tests/profile-output.test.cjs:0
tests/bug-2772-gitmodules-path-intersection.test.cjs:0
```

None match the AC's `execSync(['"]git ` pattern. The worktree tests in core.test.cjs use `execSyncLocal` (an aliased `const { execSync: execSyncLocal } = require('child_process')`) which is allowlisted via the `tests/**/*.test.cjs` glob. None reference the migrated `isGitIgnored` function directly.

Including no-op edits would violate D-08 mechanical-only.

### child_process Imports Left Intact

The top-of-file destructure `const { execSync, execFileSync, spawnSync } = require('child_process')` is preserved even though all three are now unused after the helper deletion. Per D-08, opportunistic import pruning is forbidden. A future cleanup pass (or the 02-12 deferred-tracker) can remove the dead imports.

### UPSTREAM-03 Audit Window

The hotspot audit grep was scoped to `b12e7ffe^..HEAD` (Phase 2 migration commits only) rather than `main..HEAD` (the full divergence). Excluding pre-Phase-2 commits on main is correct: the audit verifies Phase 2's mechanical-edits invariant. Pre-Phase-2 commits on main (the user's churn during the long-lived branch's lifetime) are out of scope per RESEARCH §Hotspot Audit Mechanics. This narrowed window cuts the audit's diff-volume from O(unbounded since branch creation) to O(Phase 2 migration commits) and makes the per-line review tractable.

### Audit Verdict — All Three Hotspots CLEAN

32 surfaced diff hunks across the three hotspots (after filtering). Categorization:

| Hotspot | Hunks | Categories |
|---------|-------|------------|
| core.cjs | 4 | execGit helper body deletion (5 lines) + isGitIgnored try/catch contraction (2 lines) + dead-arg removal (4 lines) + module.exports cleanup (1 line) |
| verify.cjs | 4 | exit-code probes → try/catch+boolean (cat-file, rev-parse, log, diff) — adapter-shape adaptation per 02-10 SUMMARY |
| commands.cjs | 7 | exit-code probes → try/catch+null (currentBranch, resolveShort, countCommits/rootCommits/log) + stagedOrUnstaged Rule-2 safeguard (#2014, plan-sanctioned per 02-09 SUMMARY) + adapter call-site swaps (subVcs.stage / subVcs.commit / subVcs.refs.resolveShort) |

Zero D-08 violations. One Rule-2 deviation surfaced (commands.cjs `stagedOrUnstaged` for #2014 invariant) — fully justified in 02-09 SUMMARY decisions.

## Deviations from Plan

None — plan executed exactly as written.

The plan's instructions (Step 4: "delete lines 742-758 entirely. Also remove `execGit` from any `module.exports = { … }` block") were followed verbatim. The dead-arg removal at internal core.cjs callers (`resolveWorktreeRoot`, `pruneOrphanedWorktrees`) is part of the helper-deletion mechanical contract — without it, the file would not module-load (execGit is referenced inside the function bodies before its definition was deleted). This is mechanical-required cleanup, not a deviation.

The vacuous-paired-test handling follows the D-08 precedent established in 02-07/02-09 and is documented in this SUMMARY's Decisions section.

## Verification

- `grep -cE "execFileSync\(['\"]git |execSync\(['\"]git |spawnSync\(['\"]git " get-shit-done/bin/lib/core.cjs` = **0** ✓
- `grep -nE "function execGit\(" get-shit-done/bin/lib/core.cjs` = **0** (helper deleted) ✓
- `grep -nE "vcs\.refs\.isIgnored\(" get-shit-done/bin/lib/core.cjs` = **2 matches** (1 in body comment + 1 in code) ✓
- `grep -rnE "require\([^)]*core\.cjs[^)]*\).*execGit" get-shit-done/bin/lib/ sdk/src/ scripts/ tests/` = **0** (canary check passes) ✓
- `grep -rnE "deps\.execGit" get-shit-done/bin/lib/` = **2 comment-only matches in worktree-safety.cjs** (no live code references) ✓
- `tests/baselines/git-vcs/core-cjs-603-check-ignore.snap.json` exists, parses, expected.exitCode=0 ✓
- `node --test tests/core.test.cjs tests/profile-output.test.cjs tests/bug-2772-gitmodules-path-intersection.test.cjs` → **225/225 pass** ✓
- `pnpm exec vitest run sdk/src/vcs/__tests__/baseline-parity.test.ts` → **55/55 pass** (54 from 02-10 + 1 new) ✓
- `node scripts/lint-vcs-no-raw-git.cjs` → **exits 0** (Phase 2 production-source success criterion 1 ✓)
- `02-11-AUDIT.md` exists, includes sections for core.cjs/verify.cjs/commands.cjs, all CLEAN, regex `Verdict:\\s*CLEAN` matches Final Verdict line in Summary ✓
- Commit diffs: Task 1 = 4 files (≤8 ✓), Task 2 = 1 file (exactly 1 ✓)

## Issues Encountered

The baseline-capture run (`node tests/__tools__/capture-vcs-baselines.cjs`) re-captured every baseline (regenerating `captured_at` timestamps and wall-clock-derived short SHAs in commit-stdout fixtures). This drifted 21 baseline JSONs that were unrelated to plan 02-11. Per D-08 (mechanical-only) and the plan's `Commit diff lists ≤8 files` AC, all 21 unrelated baseline drifts were reverted (`git checkout --`) before staging. Only the new `core-cjs-603-check-ignore.snap.json` and the 3 modified source/tool files (core.cjs, capture-vcs-baselines.cjs, baseline-parity.test.ts) were committed.

This is a pre-existing characteristic of the baseline-capture tool (each run re-times every fixture); the proper future fix is to make capture incremental (only re-capture entries that are missing, or accept a `--id` filter). Documented as a deferred maintenance item.

## Phase 2 Status (Closing Plan)

**Phase 2 production-source migration: COMPLETE.**

All Phase 2 success criteria 1–3 (per ROADMAP §Phase 2):

1. **Zero `execSync('git …')` in non-test source under `sdk/src/query/*.ts` and `get-shit-done/bin/lib/*.cjs`** — VERIFIED (lint guard exits 0).
2. **Every git-touching test in `tests/` retargeted onto `vcsTest` fixture / shared adapter-aware helpers** — DONE in 02-02 (helpers) + per-plan paired retargets. Vacuous tests handled per D-08 precedent.
3. **Per-file commit history with explicit per-file commit messages** — HONORED via D-05.

Success criteria 4 (rebase) and 5 (recipe doc) remain DEFERRED to a milestone-end task per CONTEXT D-17/D-18, to be reframed at the next phase transition.

UPSTREAM-02 (sidecar surface): satisfied by 02-02 (`sdk/src/vcs/jj/.gitkeep`).
UPSTREAM-03 (hotspot-discipline audit): satisfied by Task 2 of this plan (D-16 verification gate).

Plan 02-12 (deferred-tracker) follows to record any deferred items (config-mutation:441 triage, MIGR-04 + UPSTREAM-01 milestone-end task framing, REQUIREMENTS.md footer reconciliation) before the phase closes.

## Next Phase Readiness

- Phase 2 long-lived branch `phase/02-migration` is ready to merge to `main` after plan 02-12 (deferred-tracker) and Phase 2 verification complete
- Phase 3 can begin populating `sdk/src/vcs/jj/` (sidecar already exists per 02-02)
- The mechanical-only invariant (D-08) is verified across all three hotspots — the eventual user-driven rebase has the cleanest possible diff shape

## Self-Check

Verifying claims before marking complete:

- [x] `tests/baselines/git-vcs/core-cjs-603-check-ignore.snap.json` exists
- [x] `.planning/phases/02-bulk-call-site-migration-still-git-only/02-11-AUDIT.md` exists
- [x] Task 1 commit `xoowpwpslxkznozvkqnopkxxluulkslw` exists in git log
- [x] Task 2 commit `lywtqwolqszolkwymystzptmtuslmymm` exists in git log
- [x] core.cjs has zero `execSync\(['"]git |execFileSync\(['"]git |spawnSync\(['"]git ` matches
- [x] core.cjs has zero `function execGit\(` matches
- [x] core.cjs has 1 `vcs.refs.isIgnored(` code call (+ 1 reference in the comment block)
- [x] Lint guard exits 0
- [x] All paired tests pass (225/225 on Node test runner)
- [x] All baseline-parity tests pass (55/55 on vitest)
- [x] 02-11-AUDIT.md contains sections for core.cjs, verify.cjs, commands.cjs and a CLEAN verdict matching `Verdict:\\s*CLEAN`

## Self-Check: PASSED

All claimed files exist, all claimed commits exist on `phase/02-migration`:

```
$ git log --oneline -3 phase/02-migration
5376f2d3 docs(02-11): UPSTREAM-03 hotspot audit — clean (D-16)
73fc5499 refactor(02-11): migrate get-shit-done/bin/lib/core.cjs to VcsAdapter (CLOSING)
aeb32a4d docs(02-10): complete verify.cjs/verify.ts migration plan
```

D-05 (per-file commit), D-08 (mechanical-only), D-16 (hotspot-audit verify-gate) honored.

---
*Phase: 02-bulk-call-site-migration-still-git-only*
*Completed: 2026-05-10*
