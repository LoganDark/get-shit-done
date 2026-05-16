---
phase: 10-git-side-parallel-verbs-classifier-extension
verified: 2026-05-15T23:45:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 2/5
  gaps_closed:
    - "SC2 — Cross-backend `FanInResult` shape; `conflicted: boolean` distinguishes in-tree-conflict-success from crash (closed by 10-05 STEP 1 crashedAgentIds gate + Scenario A regression)"
    - "SC3 — Per-branch 2-parent merge loop; halt-on-conflict + ancestor-probe re-call; non-force worktree remove + handle-scoped surplus audit (closed by 10-05 STEP 3 expectedNames filter + Scenario B regression)"
    - "SC5 — vitest skip-count baseline unchanged; CI lint guards remain green (closed by 10-06 toBeIdOf matcher swap at line 355)"
  gaps_remaining: []
  regressions: []
deferred: []
---

# Phase 10: git-side parallel verbs + classifier extension — Re-Verification Report

**Phase Goal:** git backend exposes the same `vcs.workspace.parallel.*` verb surface; the cross-backend `FanInResult` shape ships uniform on both backends; the raw-git worktree dispatch+merge+cleanup body lives in a single adapter-internal TS file.

**Verified:** 2026-05-15T23:45:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (Wave 4 plan 10-05 + Wave 5 plan 10-06).
**Previous status (2026-05-15T13:25:00Z):** gaps_found, score 2/5.

## Goal Achievement

### Observable Truths (mapped to ROADMAP Success Criteria)

| # | Truth (verbatim from ROADMAP SC) | Status | Evidence |
|---|----------------------------------|--------|----------|
| 1 | `sdk/src/vcs/git/parallel.ts` exists as single adapter-internal sidecar; `backends/git.ts` wires it via `workspace = Object.freeze({...parallel: …})`; internal `git worktree add` serialization prevents `.git/config.lock` race on N=8 dispatch | VERIFIED (regression check) | Already-verified in initial run. Sidecar exists at 706 LOC (was 480; +226 from regression-test additions are in test file, sidecar grew via gate-closure comments + Set-construction). `backends/git.ts` Object.freeze wire-in at lines 736-745 unchanged. Sync for-loop serialization at parallel.ts:180-223 unchanged. |
| 2 | Cross-backend `FanInResult` shape `{merged, conflicted, conflictedPaths, incompleteQueued, failedReaped, surplusBookmarks}` is identical on both backends; `conflicted: boolean` distinguishes in-tree-conflict-success from crash | VERIFIED (gap closed) | **Shape uniformity:** unchanged — single `interface FanInResult` in sdk/src/vcs/types.ts:533-541 used by both backends. **Crash-vs-conflict distinction (the previously-failing half):** CLOSED. parallel.ts:336-338 constructs `crashedAgentIds = new Set<string>(results.filter((r) => r.exitCode !== 0).map((r) => r.agentId))` before the STEP 1 loop. parallel.ts:341 contains `if (crashedAgentIds.has(ws.agentId)) continue;` as the first statement inside the `for (const ws of handle.workspaces)` loop body. Comment block at lines 324-335 explicitly cites CR-01 / SC2 / T-10-05-01. **Regression test:** Scenario A at line 532 `'workspace.parallel — committed-then-crashed agent (CR-01 regression)'` / `'routes committed-then-crashed agent through STEP 2 classifier, not STEP 1 merge'` exercises the precise failure mode (agent-2 commits partial work then exits 1) and asserts `result.merged.length === 1`, the classifier queue entry exists, and `git merge-base --is-ancestor agent2Tip HEAD` returns non-0 (the partial work is NOT in main's ancestry). Test passes (370ms). |
| 3 | Per-branch 2-parent `git merge --no-ff <agentBookmark>` loop verified on test-fixture; halt-on-conflict + re-call via `merge-base --is-ancestor` skip; `git worktree remove --force` is forbidden in the cross-backend path (non-force only) | VERIFIED (gap closed) | **Loop, halt, ancestor-probe re-call, non-force discipline:** unchanged from initial verification (parallel.ts:340-421, two `worktree remove` calls at lines 409 and 470 both lack `--force`). **SurplusBookmarks contract (the previously-failing half):** CLOSED. parallel.ts:493-495 constructs `expectedNames = new Set<string>(handle.workspaces.map((ws) => \`worktree-agent-${ws.agentId}\`))` inside the `if (listResult.exitCode === 0)` block. parallel.ts:498 contains `if (!expectedNames.has(bm)) continue;` BEFORE the existing `surplusBookmarks.includes(bm)` dedup. Comment block at lines 480-490 explicitly cites CR-02 / SC3 and the field-semantics contract ("surplusBookmarks is BY DEFINITION a subset of this handle's expected agent bookmarks"). **Regression test:** Scenario B at line 632 `'workspace.parallel — handle-scoped surplus audit (CR-02 regression)'` / `'pre-seeded unrelated worktree-agent-foo branch is not flagged as surplus'` pre-seeds an unrelated `worktree-agent-foo` branch BEFORE dispatch and asserts `result.surplusBookmarks` does NOT contain it AND `result.surplusBookmarks.length === 0`. Test passes (377ms). |
| 4 | `IncompleteWorkEntry.reason` git-side producer for `'merge-in-tree-conflict'` lands here via `git merge` exit code + `git diff --name-only --diff-filter=U` | VERIFIED (regression check) | Already-verified in initial run. Producer at parallel.ts:369-396 (line numbers shifted by +18 from the comment-block addition; `appendIncomplete(handle.phaseRoot, entry)` with `reason: 'merge-in-tree-conflict'` at line 394). Scenario 4 in-tree-conflict joint assertion still passes (342ms). |
| 5 | New `parallel-*` test files use Pattern B `mkdtemp`; skip-count baseline unchanged; no `retry: N` in vitest config | VERIFIED (gap closed) | **Pattern B mkdtemp:** unchanged from initial (verified via `mkdtempSync` + random suffix in test setup). **Skip-count:** `node scripts/check-skip-count.cjs` exits 0 with `current=18 baseline(origin/main)=18`. **retry: N:** none in vitest.config.ts. **CI lint gates (the previously-failing half):** CLOSED. Line 355 of cmd-parallel-git.test.ts now reads `expect(crashEntry?.changeIdShort).toBeIdOf({ kind: 'git', allowShort: true });` (was `toMatch(/^[0-9a-f]{12}$/)`). `node scripts/lint-vcs-no-commit-id.cjs` exits 0 with `ok lint-vcs-no-commit-id: 1038 files scanned, 0 violations` (was exit 1). |

**Score:** 5/5 truths verified.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `sdk/src/vcs/git/parallel.ts` | Sidecar with performGitParallelDispatch + performGitParallelFanIn + STEP 1 crashed-agent gate + STEP 3 handle-scoped sweep | EXISTS, SUBSTANTIVE, WIRED | 706 LOC. `crashedAgentIds` literal appears exactly 2× (construction at line 336; loop-body filter at line 341). `expectedNames` literal appears exactly 2× (construction at line 493; filter at line 498). Both anchor in the correct STEP regions per the planned ordering. |
| `sdk/src/vcs/backends/git.ts` (wire-in) | `Object.freeze({dispatch, fanIn})` real wire-in | EXISTS, SUBSTANTIVE, WIRED | Unchanged from initial verification. Lines 736-745. |
| `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts` | 4 original `it()` + 2 new regression `it()` = 6 literal blocks; vitest reports 8 runtime tests | EXISTS, SUBSTANTIVE, RUNS GREEN | 701 LOC. `grep -c "^\s*it("` returns 6. Vitest verbose listing shows 8 named tests passing: N=2/N=3/N=4 (from describe.each-equivalent for-loop) + in-tree-conflict + crashed-worker (existing Scenario 5) + idempotency + CR-01 regression + CR-02 regression. Total `8 passed (8)` in 5.01s. |
| `tests/__tools__/vitest-matchers.ts` (toBeIdOf signature) | Single union-typed `kindOrOpts: ToBeIdOfKind \| ToBeIdOfOpts` arg | EXISTS, SUBSTANTIVE | Lines 38-59. Signature confirms options-object form `{ kind: 'git', allowShort: true }` is the call shape that actually applies `allowShort=true` (the two-arg positional form mandated by 10-05/10-06 plans does NOT match the matcher's signature; executor documented Rule-1 deviation in both summaries). The form used at both line 355 and line 602 of the test file (`toBeIdOf({ kind: 'git', allowShort: true })`) matches the matcher's actual contract. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `performGitParallelFanIn` STEP 1 loop body | `results[]` exitCode classifier | `crashedAgentIds.has(ws.agentId)` early-continue at line 341 | WIRED | Pattern match confirmed (`grep -q "crashedAgentIds\.has(ws\.agentId)"` true). Comment block at lines 324-335 cites CR-01/SC2/T-10-05-01. |
| `performGitParallelFanIn` STEP 3 sweep | `handle.workspaces`-scoped audit | `expectedNames.has(bm)` filter at line 498 | WIRED | Pattern match confirmed (`grep -q "expectedNames\.has("` true). Filter is placed BEFORE the `surplusBookmarks.includes(bm)` dedup as planned. Comment block at lines 480-490 cites CR-02/SC3 and the field-semantics contract. |
| Scenario A test | STEP 2 classifier | agent-2 commits real content + reports `exitCode: 1`; readIncomplete asserts queue entry exists with `reason: 'crashed-with-uncommitted-work'` | WIRED | Test passes; assertions include `result.merged.length === 1`, `incompleteQueued >= 1`, queue entry's `subagentName === agent2WorkspaceName`, and the branch-ancestry proof `spawnSync('git', ['merge-base', '--is-ancestor', agent2Tip, 'HEAD'], { cwd: dir }).status` not-toBe 0. |
| Scenario B test | STEP 3 sweep | pre-seed `git branch worktree-agent-foo HEAD` before dispatch; assert it is absent from `result.surplusBookmarks` post-fanIn | WIRED | Test passes; assertions include `result.surplusBookmarks` does NOT contain `'worktree-agent-foo'`, the branch is STILL ALIVE in the repo (defensive sanity via `spawnSync('git', ['for-each-ref', ...], {cwd: dir})` argv form per executor Rule-3 deviation — `execSync` with shell parens fails on `%(refname:short)`), AND `result.surplusBookmarks.length === 0`. |
| crashEntry?.changeIdShort assertion | `toBeIdOf` custom matcher | options-object form `{ kind: 'git', allowShort: true }` | WIRED | Line 355 of cmd-parallel-git.test.ts. Same form at line 602 (Scenario A). Matcher registered globally via `sdk/vitest.config.ts setupFiles`. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| SDK builds | `pnpm -C sdk build` | exit 0 (tsc + tsc -p tsconfig.cjs.json) | PASS |
| Contract tests pass | `pnpm vitest run src/vcs/__tests__/cmd-parallel-git.test.ts` (from sdk/) | exit 0; `Tests 8 passed (8)` in 5.01s; CR-01 + CR-02 regression scenarios both listed and green | PASS |
| Skip-count baseline preserved | `node scripts/check-skip-count.cjs` | exit 0; `current=18 baseline(origin/main)=18` | PASS |
| Raw-git lint allowlisted | `node scripts/lint-vcs-no-raw-git.cjs` | exit 0; 1076 files scanned, 0 violations | PASS |
| **Commit-id lint clean (was the SC5 blocker)** | `node scripts/lint-vcs-no-commit-id.cjs` | **exit 0**; 1038 files scanned, 0 violations | **PASS (was FAIL in initial verification)** |

### Requirements Coverage

| Requirement | Source Plan | Description (REQUIREMENTS.md) | Status | Evidence |
|-------------|------------|------------------------------|--------|----------|
| PARALLEL-01 | 10-02, 10-03 | `vcs.workspace.parallel.dispatch` ships on both backends; git wraps `git worktree add` with internal serialization | SATISFIED | parallel.ts performGitParallelDispatch exists; sync for-loop serialization in place; wire-in at backends/git.ts:738-740 |
| PARALLEL-02 | 10-01, 10-02, 10-03, **10-05** | `vcs.workspace.parallel.fanIn(handle, results): FanInResult` ships on both backends; git iterates per-branch 2-parent merge; halts on first conflict; idempotent under re-call; `conflicted: boolean` distinguishes in-tree-conflict-success from crash | SATISFIED (gap closed) | Loop + halt + idempotency: unchanged. Crash-vs-conflict boolean discrimination: CLOSED by 10-05 (crashedAgentIds gate + Scenario A regression). SurplusBookmarks contract: CLOSED by 10-05 (expectedNames filter + Scenario B regression). |
| VCS-18 | 10-02, 10-03 | New `sdk/src/vcs/git/parallel.ts` adapter-internal sidecar; joined to `lint-vcs-no-raw-git` allowlist | SATISFIED | File exists, 706 LOC; allowlist entry present; raw-git lint exits 0 (1076 files, 0 violations) |
| TEST-13 | 10-04, **10-05** | Cross-backend contract tests for PARALLEL-01 + PARALLEL-02 at cmd-parallel-{git,jj}.test.ts; N=2/3/4 + clean fan-in + in-tree-conflict + crashed-worker | SATISFIED (gap closed) | 8 runtime tests pass on host. CR-01 + CR-02 regression scenarios exercise the failure modes the original crashed-worker scenario could not surface. |
| TEST-15 | 10-01, 10-04 | git per-branch loop happy-path: N successful 2-parent merges produce N entries in `merged[]` for N ∈ {2, 3, 4} | SATISFIED | N=2/3/4 describe.each-equivalent for-loop scenarios verify `merged.length === N` for each N. |
| TEST-16 | 10-04, **10-06** | Pattern B random-prefix mkdtemp; NEVER retry: N; NEVER describe.skip; skip-count baseline preserved; no hex-shape regex on id-bearing fields | SATISFIED (gap closed) | mkdtempSync + random suffix verified; no retry, no .skip, no .only; skip-count green; lint-vcs-no-commit-id green (was the SC5 blocker; closed by 10-06 matcher swap at line 355). |

All 6 Phase 10 requirement IDs from REQUIREMENTS.md are SATISFIED. No orphans.

### Anti-Patterns Found (re-verification)

| File | Line | Pattern | Severity | Impact | Disposition |
|------|------|---------|----------|--------|-------------|
| sdk/src/vcs/__tests__/cmd-parallel-git.test.ts | 355 (was) | Hex-shape regex `/^[0-9a-f]{12}$/` | BLOCKER (was) | Tripped `lint-vcs-no-commit-id.cjs` | **RESOLVED** by 10-06 matcher swap |
| sdk/src/vcs/git/parallel.ts | 230 | `mkdtemp` for manifest dir is never cleaned up (WR-06 in 10-REVIEW) | INFO | Cosmetic /tmp leak; not a regression (jj-side has the same pattern) | Unchanged — not goal-blocking |
| sdk/src/vcs/git/parallel.ts | 416 | `git branch -D <name>` without `--` end-of-options separator (WR-01 in 10-REVIEW) | WARNING | Defense-in-depth gap; current validateAgentId regex blocks leading-dash exploits | Unchanged — not goal-blocking; documented in 10-REVIEW.md |

No NEW anti-patterns introduced by 10-05 or 10-06. The previously-blocking anti-pattern at line 355 is fully resolved.

### Plan-Executor Rule-1 Deviations (documented, accepted)

Both 10-05 and 10-06 plans MANDATED the literal two-arg matcher form `toBeIdOf('git', { allowShort: true })`. The matcher's actual signature in `tests/__tools__/vitest-matchers.ts:38-59` is a SINGLE union-typed `kindOrOpts` arg — the two-arg form silently drops the trailing object and defaults `allowShort` to false, rejecting the 12-char short SHA. Both executors documented this Rule-1 deviation in their respective SUMMARYs and used the options-object form `toBeIdOf({ kind: 'git', allowShort: true })` instead. This form is verified working (both tests pass; lint exits 0). The verifier accepts the deviation as semantically equivalent for SC2/SC5 closure — the intent (no hex regex; custom matcher in use; `allowShort` actually applied) is satisfied.

### Code-Review Cross-Reference (10-REVIEW.md)

10-REVIEW.md identified 2 BLOCKER (CR-01, CR-02) + 6 WARNING (WR-01..WR-06) + 4 INFO (IN-01..IN-04) findings.

**BLOCKER status:**

- **CR-01 (crashed-agent partial-commit silently merged):** **RESOLVED** by 10-05 STEP 1 `crashedAgentIds` gate at parallel.ts:341. Regression test Scenario A proves the fix exercises the committed-then-crashed failure mode.
- **CR-02 (repo-scoped surplus-bookmark sweep):** **RESOLVED** by 10-05 STEP 3 `expectedNames` filter at parallel.ts:498. Regression test Scenario B proves the pre-seeded unrelated branch is excluded.

**WARNING status (unchanged from initial verification — not goal-blocking):**

- WR-01 (`branch -D` missing `--`): defense-in-depth issue, not blocking SC1-5.
- WR-02 (`merge-in-tree-conflict` queue entry semantic mismatch across backends): documented divergence, not blocking SC2 strictly.
- WR-03 (no MERGE_HEAD pre-flight): future-defense.
- WR-04 (cleanup error context loss): observability gap.
- WR-05 (test scenario 6 first-call assertions): test-rigor gap.
- WR-06 (manifest mkdtemp leak): pre-existing jj-side pattern.

### Human Verification Required

None. All gap closures were programmatically verifiable (code reading + lint scripts + test runs). The CR-01/CR-02 regression scenarios encode the previously-uncovered failure modes as automated tests; future regressions would surface in CI rather than requiring human inspection.

### Re-Verification Summary

The three BLOCKER gaps from the initial verification at 2026-05-15T13:25:00Z are all CLOSED:

1. **SC2 (CR-01) — CLOSED.** `crashedAgentIds` gate filters crashed agents out of STEP 1's merge loop before the `merge-base --is-ancestor` probe. The previously-falsified second clause of SC2 ("conflicted boolean distinguishes in-tree-conflict-success from crash") is now enforced by code (gate at parallel.ts:341) and proven by test (Scenario A asserts `result.merged.length === 1` AND queue entry exists AND agent-2's tip is NOT in main's ancestry).

2. **SC3 (CR-02) — CLOSED.** `expectedNames` filter scopes the STEP 3 surplus sweep to this handle's expected agent bookmarks. The previously-mis-shapen contract field is now correct (sweep at parallel.ts:498). Pre-seeded unrelated `worktree-agent-foo` branches are excluded, proven by Scenario B (`result.surplusBookmarks` is empty AND the branch is still alive in the repo, proving exclusion-by-filter rather than exclusion-by-deletion).

3. **SC5 — CLOSED.** Line 355 hex-shape regex replaced with `toBeIdOf({ kind: 'git', allowShort: true })` matcher call. `node scripts/lint-vcs-no-commit-id.cjs` exits 0 (was 1). No allowlist diff; no inline annotation; matcher swap is the architecturally-correct fix per the lint script's own diagnostic at scripts/lint-vcs-no-commit-id.cjs:135.

No regressions detected. SC1 and SC4 (already VERIFIED in initial run) remain green. Score: 5/5 truths verified — phase goal fully achieved.

All ROADMAP success criteria, REQUIREMENTS.md IDs, and PLAN must-haves verify against the actual codebase. Phase 10 may proceed to commit/PR.

---

_Re-verified: 2026-05-15T23:45:00Z_
_Verifier: Claude (gsd-verifier)_
_Previous: 2026-05-15T13:25:00Z (gaps_found, 2/5)_
