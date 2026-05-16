---
phase: 10-git-side-parallel-verbs-classifier-extension
reviewed: 2026-05-15T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - sdk/src/vcs/git/parallel.ts
  - sdk/src/vcs/jj/parallel.ts
  - sdk/src/vcs/backends/git.ts
  - sdk/src/vcs/__tests__/cmd-parallel-git.test.ts
  - scripts/lint-vcs-no-raw-git.allow.json
status: clean
previous_review:
  date: 2026-05-16
  warnings_fixed: [WR-01, WR-03, WR-04, WR-05, WR-06]
  warnings_skipped: [WR-02]
  status_at_close: warnings_resolved
findings:
  critical: 0
  warning: 0
  info: 3
  total: 3
---

# Phase 10: Code Review Report (Pass 3 — post-fix verification)

**Reviewed:** 2026-05-15
**Depth:** standard
**Files Reviewed:** 5
**Status:** clean

## Summary

Third review pass on Phase 10 following `/gsd-code-review 10 --fix` application. All five fixed warnings (WR-01, WR-03, WR-04, WR-05, WR-06) verified structurally present and correct at their claimed locations. WR-02 confirmed as intentional cross-backend semantic divergence (per CONTEXT D-06/D-08) — recorded as `skipped_intentional`, not re-raised. No new defects introduced by the fixes. Three INFO items from the prior pass survive as minor maintainability notes; one (IN-03) is fully resolved and dropped.

## Fix Verification (spot-check)

| ID    | Location                                            | Status   | Evidence                                                                                                            |
| ----- | --------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| WR-01 | `sdk/src/vcs/git/parallel.ts:449`                   | verified | `vcsExec(... ['branch', '-D', '--', agentBookmark])` — `--` separator present.                                      |
| WR-03 | `sdk/src/vcs/git/parallel.ts:321-326`               | verified | `git rev-parse --verify --quiet MERGE_HEAD` probe runs at fanIn entry; throws on exit 0 (before any state mutation).|
| WR-04 | `sdk/src/vcs/git/parallel.ts:434-442`               | verified | Captures `removeRes`; non-zero exit emits first stderr line to `process.stderr` with bookmark + exit code.          |
| WR-05 | `sdk/src/vcs/git/parallel.ts:512-535` + test 612-620 | verified | STEP 2 clean-WC path calls `branch -D --` after successful worktree remove; regression assertion `not.toContain('worktree-agent-agent-2')` at test line 620. |
| WR-06 | `sdk/src/vcs/git/parallel.ts:512-519`               | verified | STEP 2 captures `removeResStep2` and surfaces first stderr line on non-zero exit (was previously discarded).        |
| WR-02 | (cross-backend `merged: string[]` semantic)         | skipped_intentional | Per CONTEXT D-06/D-08 + D-13 carry, divergent merged[] population (git: per-loop SHAs; jj: single change_id) is contractually locked. Not a defect; documented in JSDoc at `git/parallel.ts:60-64` and exercised by the N∈{2,3,4} clean scenarios. |

## Post-fix Audit (over-correction / new lint surface)

- **WR-03 probe scope:** runs in `mainRepoRoot` cwd. MERGE_HEAD lives in `mainRepoRoot/.git/`, so the probe correctly targets the merge target. No leak into agent worktrees. Clean.
- **WR-04 / WR-06 stderr surfacing:** both writes are guarded by `stderrFirstLine.length > 0`, so empty-stderr non-zero exits (rare but possible) do not emit blank lines. Order of operations: stderr write fires BEFORE `surplusBookmarks.push` in WR-04, so transcript ordering aligns with the contract field semantics. Clean.
- **WR-05 clean-WC branch delete:** unconditional `vcsExec(... 'branch', '-D', '--', agentBookmark)` with no exit-code check. This is consistent with WR-04's "non-fatal cleanup" pattern (worktree gone → branch delete is best-effort). If `branch -D` fails (e.g., race with concurrent cleanup), the leftover branch will be re-picked up by STEP 3's audit and routed to `surplusBookmarks`, which is the contract's correct fallback. Clean.
- **CR-01 regression test (lines 546-621):** covers both the original SC2 gate AND the new WR-05 assertion in one `it` block. Joint-assertion lock-in (W3 (a) / Pitfall 7) preserved. Clean.
- **Dirty-tree STEP 2 path (D-07 expected case):** when `removeResStep2.exitCode !== 0` and the worktree survives (dirty WC), the agent branch is intentionally NOT deleted; STEP 3's audit will then list `worktree-agent-<id>` in `surplusBookmarks`, alongside the `crashed-with-uncommitted-work` queue entry for the same agent. This is the same dual-surfacing pattern WR-05's comment endorses for the clean-WC path's failure mode, and the contract surfaces (queue + surplusBookmarks) are non-overlapping by purpose. No defect.

## Info

### IN-01: Inline validateAgentId duplicated across git/parallel.ts and jj/parallel.ts

**File:** `sdk/src/vcs/git/parallel.ts:112-118`, `sdk/src/vcs/jj/parallel.ts:92-98`
**Issue:** Both sidecars re-declare a byte-identical `validateAgentId` function with the same regex `/^[A-Za-z0-9._/-]+$/` and same error-message shape. Both copies cite `worktree-safety.cjs:334` as the policy source. Drift between them would silently widen one backend's input class versus the other.
**Fix:** Extract to a tiny shared helper at `sdk/src/vcs/parallel-validators.ts` (one file, one export). Both sidecars import from there. Preserves UPSTREAM-02 sidecar discipline (still no import from `backends/*`); the new module is a sibling, not a backend.

### IN-02: setupGitRepo / setup helpers are file-local in cmd-parallel-git.test.ts

**File:** `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts:84-103`
**Issue:** `setupGitRepo` is locally scoped. The jj-side analog `setupJjRepo` (in cmd-parallel-jj.test.ts) is also file-local. Any future third backend would re-implement the same Pattern B `mkdtemp` + seed-commit boilerplate.
**Fix:** When a third backend (or e2e suite) needs the same fixture shape, hoist to `sdk/src/vcs/__tests__/parallel-fixtures.ts`. Not urgent — two copies is below the duplication threshold for refactor pressure.

### IN-04: merged: string[] semantic divergence is doc-only, not enforced at the type

**File:** `sdk/src/vcs/git/parallel.ts:60-67` (D-13 carry doc), `sdk/src/vcs/types.ts` (FanInResult definition)
**Issue:** The cross-backend `FanInResult.merged: readonly string[]` field carries N short SHAs on git and a single change_id on jj. The shape is a flat string array; the semantic difference is enforceable only via JSDoc, not the type. A caller writing cross-backend code that expects "one merge id" gets surprising behavior on git when N>1.
**Fix:** Out of scope for v1 — the divergence is contractually locked at D-13 and tested. If the orchestrator ever surfaces this to user-facing UX, consider a typed wrapper at the consumer boundary that names the kind explicitly (e.g., `{ kind: 'git-per-branch'; shas: string[] } | { kind: 'jj-octopus'; changeId: string }`). Tracking note only.

## Dropped from prior pass

- **IN-03 (missing `stdio: 'pipe'`):** all `execSync` / `spawnSync` calls in `cmd-parallel-git.test.ts` now consistently pass `stdio: 'pipe'`. Resolved incidentally during the WR-05 regression-test addition. No remaining instances.

---

_Reviewed: 2026-05-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
