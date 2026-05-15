---
phase: 10-git-side-parallel-verbs-classifier-extension
plan: 03
subsystem: vcs-adapter-wire-in
tags:
  - wire-in
  - lint-allowlist
  - cross-backend-symmetry
requirements:
  - PARALLEL-01
  - PARALLEL-02
  - VCS-18
dependency_graph:
  requires:
    - "Plan 10.02 sidecar exports (performGitParallelDispatch, performGitParallelFanIn)"
    - "Phase 9 D-08 FanInResult shape (locked)"
    - "Phase 9 throwing-stub framing at backends/git.ts:723-734 (now removed)"
  provides:
    - "Real workspace.parallel.{dispatch,fanIn} bodies on the GitVcsAdapter"
    - "Cross-backend FanInResult shape ships uniform on git (Phase 10 close-gate)"
    - "Wire-in target for Plan 10.04 contract tests"
  affects:
    - "Plan 10.04 (cmd-parallel-git.test.ts contract tests) — exercises this wired adapter end-to-end"
    - "Phase 11 (orchestrator rewire) — workflow markdown can now call vcs.workspace.parallel.* on the git backend"
tech_stack:
  added: []
  patterns:
    - "Object.freeze({dispatch, fanIn}) wire-in mirroring backends/jj.ts:1257-1264 verbatim"
    - "Sidecar import discipline (cross-backend type imports + sidecar function imports grouped at top)"
    - "Type imports added (ParallelDispatchOpts, ParallelDispatchHandle, ParallelAgentResult, FanInResult) — already locked at Phase 9"
key_files:
  created: []
  modified:
    - sdk/src/vcs/backends/git.ts
    - scripts/lint-vcs-no-raw-git.allow.json
decisions:
  - "Deleted VcsNotImplementedError import from backends/git.ts (zero remaining references after stub removal — grep -c == 0)"
  - "Inserted sidecar import line at line 33, immediately after the existing readIncomplete cross-import (line 32) for visual grouping of sidecar cross-imports"
  - "Preserved file-local 2-space indentation despite project tabs preference — file uses spaces throughout (133 lines tested), tabs would have broken file consistency"
metrics:
  duration: ~5min
  completed: 2026-05-15
---

# Phase 10 Plan 03: backend wire-in (git-side parallel verbs) — Summary

Real `vcs.workspace.parallel.{dispatch,fanIn}` bodies wired into the GitVcsAdapter — the Phase 9 throwing stub at backends/git.ts:723-734 is replaced with an Object.freeze delegating to the Plan 10.02 sidecar; the cross-backend FanInResult contract now ships uniform on both backends.

## What Shipped

- **`sdk/src/vcs/backends/git.ts`** (MODIFIED, 3 hunks):
  - Line 33: NEW import line `import { performGitParallelDispatch, performGitParallelFanIn } from '../git/parallel.js';` (immediately after the existing `readIncomplete` cross-import at line 32).
  - Type imports block: ADDED `ParallelDispatchOpts`, `ParallelDispatchHandle`, `ParallelAgentResult`, `FanInResult` to the existing `import type { ... } from '../types.js'` block.
  - Type imports block: REMOVED `VcsNotImplementedError` from the runtime imports (grep count: 0 remaining references after stub removal — the import would be orphan).
  - Lines 721-729 (formerly 717-734): REPLACED the 6-line stale comment + 12-line throwing-stub block with the 9-line wire-in body. The wire-in is a verbatim mirror of `backends/jj.ts:1257-1264` with three literal substitutions (`Phase 9` → `Phase 10`, `VCS-16` → `VCS-18`, `UPSTREAM-02 sidecar in sdk/src/vcs/jj/parallel.ts` → `adapter-internal sidecar in sdk/src/vcs/git/parallel.ts`) and the sidecar export names swapped (`performJj*` → `performGit*`).

- **`scripts/lint-vcs-no-raw-git.allow.json`** (MODIFIED, 1 hunk): single new entry inserted immediately after the `sdk/src/vcs/backends/git.ts` entry (grouped readability for the two adapter-internal git-side entries). Schema is `{path, reason, owner}` — NO `expires` field per the solo-dev override at the file's `$migration_note`. Pre-edit `entries.length`: 23. Post-edit `entries.length`: 24. Net diff: +1 (matches the framing-locked `+0/+1` invariant from STATE.md and `lint-vcs-no-raw-git.allow.json` net-change rule).

## Plan Output Spec (verbatim from plan's `<output>` block)

(1) **Exact line where the import was inserted:** line 33 of `sdk/src/vcs/backends/git.ts`. Verified via `grep -n "performGitParallelDispatch, performGitParallelFanIn" sdk/src/vcs/backends/git.ts` → `33:import { performGitParallelDispatch, performGitParallelFanIn } from '../git/parallel.js';`. Placement is immediately after the existing `readIncomplete` cross-import at line 32, visually grouping the two sidecar cross-imports together.

(2) **VcsNotImplementedError import — DELETED.** Justification via `grep -c "VcsNotImplementedError" sdk/src/vcs/backends/git.ts` after stub removal returned `0` (zero remaining references in the file body). The import would have been an orphan, which TypeScript permits but lint rules and reviewer expectations do not. Deletion was the correct internally-consistent state per the plan's acceptance criterion. The change to the import block:

```diff
 import {
   __vcsTestOnly,
   VcsIncompleteSubagentsError,
-  VcsNotImplementedError,
 } from '../types.js';
```

(3) **Pre-edit and post-edit `entries.length` from `scripts/lint-vcs-no-raw-git.allow.json`:** pre-edit `23` → post-edit `24` (+1 net). Verified via `node -e "console.log(require('./scripts/lint-vcs-no-raw-git.allow.json').entries.length)"` → `24`. The +1 is the single new entry for `sdk/src/vcs/git/parallel.ts`. All 23 prior production entries are byte-identical (the diff shows ONLY the new line insertion).

(4) **Three exit-0 verifications confirmed:**
- `pnpm -C sdk build` → exit 0 (both `tsc` ESM and `tsc -p tsconfig.cjs.json` CJS emit cleanly with zero TS errors). The CJS dist at `sdk/dist-cjs/vcs/backends/git.js` loads via `node -e "require('./sdk/dist-cjs/vcs/backends/git.js')"` without resolution failure (the new `'../git/parallel.js'` import resolves correctly post-build).
- `node scripts/lint-vcs-no-raw-git.cjs` → exit 0 (`ok lint-vcs-no-raw-git: 1075 files scanned in /Users/LoganDark/Documents/Projects/get-shit-done, 0 violations`). The new allowlist entry covers the raw-git invocations introduced by the Plan 10.02 sidecar; without this entry the lint would have failed on the sidecar's `vcsExec(... 'git', ['merge', '--no-ff', ...])` call patterns at parallel.ts:347/391/etc.
- `node scripts/lint-vcs-no-commit-id.cjs` → exit 0 (`ok lint-vcs-no-commit-id: 1037 files scanned in /Users/LoganDark/Documents/Projects/get-shit-done, 0 violations`). The Plan 10.02 sidecar honors the v1.2 unified revision model — the `changeIdShort` field receives short SHAs from `git rev-parse` (the unified `.id` slot per v1.2), not separately-named commit_id fields.

## Deviations from Plan

### Process deviations

None — Tasks 1 and 2 each shipped as their own commit per the plan's per-task commit protocol. No tasks were combined this time (unlike Plan 10.02 where Tasks 1+2 collapsed into one commit on the same new file — here the two files have orthogonal concerns: source-code wire-in vs. lint allowlist).

### Code deviations

**1. [Rule 3 — File-local convention] Preserved 2-space indentation in backends/git.ts despite tabs project preference**
- **Found during:** Task 1 — `awk 'NR<=200 && /^\t/ {tabs++} /^  / {spaces++}'` returned `tabs=0 spaces=133` for the file.
- **Issue:** Project preference is tabs ("always use tabs for indentation unless impossible"). Plan instructed "Indentation: tabs (project convention). The surrounding code uses tabs in the editor representation; preserve."
- **Fix:** Used 2-space indentation matching the rest of the file. The plan's "tabs (project convention)" instruction conflicts with the file's actual style. Mixing tabs and spaces in a TS source file would have broken the file's internal consistency, failed any tab-style linter (e.g., Prettier with `useTabs: false`), and produced a visually-broken diff under any default-rendering reviewer tool. The plan's clause "preserve" wins over the abstract convention statement when the file's local style is space-based — this is exactly the "unless impossible" carve-out in the global tabs rule.
- **Files modified:** `sdk/src/vcs/backends/git.ts` (the wire-in block and the type-imports addition).
- **Tracked as deviation, not a bug:** the plan's literal text said "tabs", but the plan also said "preserve" — the latter is the controlling clause given the file's actual content.

## Architecture Notes — Cross-backend symmetry achieved

With this wire-in landed, the `vcs.workspace.parallel.*` namespace is now reachable on BOTH backends with identical surface area:

| Surface | jj-side (Phase 9) | git-side (Phase 10.03) |
|---|---|---|
| `dispatch(opts): ParallelDispatchHandle` | `performJjParallelDispatch({ mainRepoRoot: cwd, vcs: { workspace }, ...opts })` | `performGitParallelDispatch({ mainRepoRoot: cwd, vcs: { workspace }, ...opts })` |
| `fanIn(handle, results): FanInResult` | `performJjParallelFanIn(cwd, handle, results)` | `performGitParallelFanIn(cwd, handle, results)` |
| Wire-in shape | `Object.freeze({ dispatch, fanIn })` | `Object.freeze({ dispatch, fanIn })` (verbatim mirror) |
| Sidecar location | `sdk/src/vcs/jj/parallel.ts` | `sdk/src/vcs/git/parallel.ts` |
| Frozen pure-JSON returns (D-13/D-16) | yes | yes (Plan 10.02 inheritance) |
| Cross-backend FanInResult 6-field shape | populated | populated (loop-shape divergence per D-01 — `merged: string[]` carries up to N short SHAs vs jj's one change_id; field set is bit-for-bit identical) |

The Phase 9 close-gate framing ("git-side throwing stub awaits Phase 10") is now SATISFIED. Workflows can call `vcs.workspace.parallel.dispatch(...)` / `vcs.workspace.parallel.fanIn(...)` on a git adapter without branching on `vcs.kind`. The cross-backend `FanInResult` contract ships uniform on both backends — Plan 10.04 contract tests can now exercise the wired adapter end-to-end.

## Self-Check: PASSED

**Files modified verified to exist:**
- ✅ `sdk/src/vcs/backends/git.ts` (FOUND)
- ✅ `scripts/lint-vcs-no-raw-git.allow.json` (FOUND)

**Commits exist (verified via `gsd-sdk query log --max-count 5`):**
- ✅ Task 1: `nmkpuktqsynoxqzouzpwyxzkokvoslnw` — `feat(10-03): wire git-side parallel sidecar into GitVcsAdapter`
- ✅ Task 2: `szuqvrqtwvnrqxztrqkrsmpzmmvqnrlw` — `chore(10-03): allowlist sdk/src/vcs/git/parallel.ts in lint-vcs-no-raw-git`

**Build state:**
- ✅ `pnpm -C sdk build` exits 0 (both ESM + CJS emit clean)
- ✅ `node -e "require('./sdk/dist-cjs/vcs/backends/git.js')"` resolves (new `'../git/parallel.js'` import works in CJS dist)

**Lint gates:**
- ✅ `node scripts/lint-vcs-no-raw-git.cjs` exits 0 (1075 files scanned, 0 violations) — net +1 allowlist entry covers the sidecar
- ✅ `node scripts/lint-vcs-no-commit-id.cjs` exits 0 (1037 files scanned, 0 violations) — sidecar honors v1.2 unified revision model

**Wire-in fidelity gates:**
- ✅ `grep -q "performGitParallelDispatch({ mainRepoRoot: cwd, vcs: { workspace }, ...opts })" sdk/src/vcs/backends/git.ts` — dispatch curry shape matches jj-side
- ✅ `grep -q "performGitParallelFanIn(cwd, handle, results)" sdk/src/vcs/backends/git.ts` — fanIn 3-arg shape matches jj-side
- ✅ `grep -q "// Phase 10 (VCS-18, PARALLEL-01/02): cross-backend parallel namespace." sdk/src/vcs/backends/git.ts` — wire-in comment present
- ✅ `grep -c "workspace.parallel.dispatch is not yet implemented on the git backend" sdk/src/vcs/backends/git.ts` → 0 (stub message gone)
- ✅ `grep -c "workspace.parallel.fanIn is not yet implemented on the git backend" sdk/src/vcs/backends/git.ts` → 0 (stub message gone)
- ✅ `grep -c "VcsNotImplementedError" sdk/src/vcs/backends/git.ts` → 0 (no orphan import; no orphan reference)

**Allowlist gates:**
- ✅ Total `entries.length` = 24 (was 23 pre-edit; +1 net)
- ✅ Single entry where `path === "sdk/src/vcs/git/parallel.ts"` (`filter().length === 1`)
- ✅ Entry has `path`, `reason`, `owner` and DOES NOT have `expires` (solo-dev override)
- ✅ Reason mentions both "VCS adapter internals" and "git-side parallel-dispatch substrate"

## Next Plan

- **Plan 10.04 — Contract tests:** New `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts` exercising the now-wired GitVcsAdapter — N=2/3/4 dispatch + clean fanIn + in-tree-conflict joint assertion + crashed-worker classification + idempotency re-call. Pattern A `describe.sequential.skipIf(!gitAvailable)` + Pattern B `mkdtemp` per TEST-13 / TEST-16. The wire-in landed in this plan is the prerequisite — without it, the test suite would test the Phase 9 throwing stub instead of the real body.
