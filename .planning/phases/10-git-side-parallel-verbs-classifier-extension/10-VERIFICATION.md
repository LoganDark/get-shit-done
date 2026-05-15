---
phase: 10-git-side-parallel-verbs-classifier-extension
verified: 2026-05-15T13:25:00Z
status: gaps_found
score: 2/5 must-haves verified
overrides_applied: 0
gaps:
  - truth: "SC2 — Cross-backend FanInResult shape `{merged, conflicted, conflictedPaths, incompleteQueued, failedReaped, surplusBookmarks}` is identical on both backends; `conflicted: boolean` distinguishes in-tree-conflict-success from crash."
    status: partial
    reason: "Type shape uniformity holds (single FanInResult interface in sdk/src/vcs/types.ts:533-541 used by both backends). However the second clause — that `conflicted` boolean correctly distinguishes in-tree-conflict-success from crash — is FALSIFIED by CR-01. STEP 1 of performGitParallelFanIn at sdk/src/vcs/git/parallel.ts:323 iterates handle.workspaces UNCONDITIONALLY without consulting results[].exitCode. A crashed agent that committed N partial commits before crashing has its branch tip != baseRev, so the ancestor probe at line 335 does NOT skip it; the merge at line 347 then proceeds and the partial work is silently merged into main. STEP 2's reap classifier never runs for that workspace (it was already merged in STEP 1). The orchestrator gets `conflicted: false` and never learns the crash happened. The very distinction the SC requires (conflict-vs-crash) is not enforced."
    artifacts:
      - path: "sdk/src/vcs/git/parallel.ts"
        issue: "STEP 1 fan-in loop at line 323 lacks a `crashedAgents.has(ws.agentId) → continue` filter. Result: crashed agents with committed work get silently merged + 'reaped' with no queue entry. CR-01 in 10-REVIEW.md."
    missing:
      - "Filter crashed agents (results[].exitCode !== 0) OUT of STEP 1's merge loop before the merge-base probe; route them exclusively through STEP 2's classifier so the crashed-with-uncommitted-work queue entry is the only side effect."
      - "Regression test scenario: dispatch N=2, agent-1 commits cleanly + exits 0, agent-2 commits a partial change + exits 1; assert merged.length===1 (agent-1 only), incompleteQueued>=1, queue entry subagentName matches agent-2, agent-2's branch is NOT in main's ancestry."
  - truth: "SC3 — Per-branch 2-parent merge loop verified on test-fixture; halt-on-conflict + re-call via merge-base --is-ancestor skip; `git worktree remove --force` is forbidden in the cross-backend path (non-force only)."
    status: partial
    reason: "Per-branch loop, halt-on-conflict, and ancestor-probe re-call ARE structurally present and tested (Scenarios 4 and 6 both pass). Non-force `worktree remove` is honored at parallel.ts:391 and parallel.ts:452 (no `--force` flag in either call). HOWEVER — surplus-bookmark cleanup pollutes cross-handle: STEP 3 audit at parallel.ts:461 enumerates EVERY `worktree-agent-*` branch in the repo, not just THIS handle's. CR-02 documents three real failure modes including in-flight conflict branches falsely reported as surplus. The contract field `surplusBookmarks` semantically means 'branches that outlived a fan-in cleanup' but currently means 'any alive worktree-agent-* in the repo'. Phase 10's contract is mis-shapen on this field."
    artifacts:
      - path: "sdk/src/vcs/git/parallel.ts"
        issue: "Lines 461-469 use repo-scoped `for-each-ref refs/heads/worktree-agent-*` instead of handle-scoped. CR-02 in 10-REVIEW.md."
    missing:
      - "Scope STEP 3 sweep to expectedNames = new Set(handle.workspaces.map(ws => `worktree-agent-${ws.agentId}`)); skip alive branches not in this set."
      - "Test scenario: pre-seed an unrelated `worktree-agent-foo` branch in the repo before dispatch; assert it does NOT appear in surplusBookmarks after fanIn."
  - truth: "SC5 — vitest skip-count baseline unchanged; no retry config added; CI lint guards remain green."
    status: failed
    reason: "Skip-count gate IS green (`check-skip-count: current=18 baseline(origin/main)=18`). No `retry: N` config in vitest.config.ts. BUT — the new test file at sdk/src/vcs/__tests__/cmd-parallel-git.test.ts:355 introduces `expect(crashEntry?.changeIdShort).toMatch(/^[0-9a-f]{12}$/)` which trips `scripts/lint-vcs-no-commit-id.cjs` with exit code 1. That script runs in `pretest` (package.json:65) AND in CI (.github/workflows/test.yml:73). Plan 10.03 SUMMARY claimed 'lint-vcs-no-commit-id exits 0' but that was BEFORE Plan 10.04 added the test file containing the regex. Plan 10.04 SUMMARY did not re-verify this lint after adding the regex. CI is blocked for Phase 10."
    artifacts:
      - path: "sdk/src/vcs/__tests__/cmd-parallel-git.test.ts"
        issue: "Line 355: hex-shape regex `/^[0-9a-f]{12}$/` against changeIdShort field violates lint-vcs-no-commit-id.cjs."
      - path: "scripts/lint-vcs-no-commit-id.allow.json"
        issue: "Missing entry for `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts` (peer test files like cmd-parallel-jj.test.ts may need similar review)."
    missing:
      - "Either: (a) add `// vcs-lint:allow-commit-id-here <reason>` annotation on the offending line; (b) add the test path to scripts/lint-vcs-no-commit-id.allow.json with reason+owner; or (c) replace the regex assertion with the documented `expect(value).toBeIdOf(kind)` custom matcher."
      - "After fix: confirm `node scripts/lint-vcs-no-commit-id.cjs` exits 0."
deferred: []
---

# Phase 10: git-side parallel verbs + classifier extension Verification Report

**Phase Goal:** git backend exposes the same `vcs.workspace.parallel.*` verb surface; the cross-backend `FanInResult` shape ships uniform on both backends; the raw-git worktree dispatch+merge+cleanup body lives in a single adapter-internal TS file.

**Verified:** 2026-05-15T13:25:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (mapped to ROADMAP Success Criteria)

| # | Truth (verbatim from ROADMAP SC) | Status | Evidence |
|---|----------------------------------|--------|----------|
| 1 | `sdk/src/vcs/git/parallel.ts` exists as single adapter-internal sidecar; `backends/git.ts` wires it via `workspace = Object.freeze({...parallel: …})`; internal `git worktree add` serialization prevents `.git/config.lock` race on N=8 dispatch | VERIFIED (with note) | File exists (480 lines). backends/git.ts:33 imports performGitParallelDispatch + performGitParallelFanIn from '../git/parallel.js'. backends/git.ts:736-745 wires `parallel: Object.freeze({ dispatch, fanIn })` inside the `workspace = Object.freeze(...)` block. Plain sync `for` loop with sync vcsExec at parallel.ts:180-223 IS the structural protection (D-05 inline comment block at lines 163-179 cites Pitfall 5 + spawnSync). NOTE: the SC's specific empirical bound "manifest length == 8 in 20 sequential runs" is not a written test scenario — the structural protection is in place but the empirical proof bound is not exercised. Treated as satisfied because the structural mechanism is the contract; the bound is restating it. |
| 2 | Cross-backend `FanInResult` shape is identical on both backends; `conflicted: boolean` distinguishes in-tree-conflict-success from crash | FAILED | Type shape: VERIFIED — single `interface FanInResult` in sdk/src/vcs/types.ts:533-541 used unchanged by both backends; six fields match across backends. Crash-vs-conflict distinction: FAILED — see CR-01. STEP 1 at parallel.ts:323 does not consult `results[].exitCode`; crashed agents with committed work merge silently into main and `conflicted` returns `false` despite a real crash having occurred. The boolean does NOT distinguish what the SC says it must distinguish. |
| 3 | Per-branch 2-parent merge loop verified; halt-on-conflict + re-call via merge-base --is-ancestor; non-force `worktree remove` only | PARTIAL | Loop, halt-on-conflict, ancestor-probe re-call: VERIFIED (parallel.ts:323-403; tests Scenarios 4 + 6 pass). Non-force discipline: VERIFIED (parallel.ts:391, parallel.ts:452 use `worktree remove` without `--force`). BUT surplusBookmarks contract field is mis-implemented — see CR-02. Repo-scoped `for-each-ref` at parallel.ts:461 conflates handles. The "field semantics" half of the cross-backend contract is broken. |
| 4 | `IncompleteWorkEntry.reason` git-side producer for `'merge-in-tree-conflict'` lands here via `git merge` exit code + `git diff --name-only --diff-filter=U` | VERIFIED | Producer fires inside fanIn loop at parallel.ts:351-378. Exit-code + regex check at line 348-349. `diff --name-only --diff-filter=U` at line 361. `appendIncomplete(handle.phaseRoot, entry)` with `reason: 'merge-in-tree-conflict'` at line 374-376. `'partial-wave-live-workspace'` is NOT added to the enum (verified absent). Test Scenario 4 asserts the queue entry is written. |
| 5 | New parallel-* test files use Pattern B mkdtemp; skip-count baseline unchanged; no `retry: N` in vitest config | FAILED | mkdtemp Pattern B: VERIFIED (mkdtempSync with random suffix at test setup). Skip-count: VERIFIED (`check-skip-count: current=18 baseline=18`). retry: NONE in vitest.config.ts (only a comment in the test file mentioning the rule). HOWEVER — the test file added in Plan 10.04 introduces a hex-shape regex at line 355 that violates `lint-vcs-no-commit-id.cjs` (CI gate at .github/workflows/test.yml:73 + pretest hook in package.json:65). Lint exits 1 — CI is broken. Plan 10.03 SUMMARY's "lint exit 0" claim was true at Plan 10.03 close but Plan 10.04 introduced the regression and did not re-verify. |

**Score:** 2/5 truths verified (SC1 + SC4 only; SC2/SC3/SC5 have gaps).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `sdk/src/vcs/git/parallel.ts` | Adapter-internal sidecar with performGitParallelDispatch + performGitParallelFanIn | EXISTS, SUBSTANTIVE, WIRED | 480 lines. Both exports present; signatures verified (`performGitParallelFanIn(mainRepoRoot, handle, results)` mirrors jj-side at jj/parallel.ts:308-315). No imports from `../backends/`. No `import { spawnSync } from 'node:child_process'`. vcsExec is the sole subprocess primitive. Wired via backends/git.ts:33+736-745. |
| `sdk/src/vcs/backends/git.ts` (wire-in) | Replaces Phase 9 throwing stub with real Object.freeze({dispatch, fanIn}) | EXISTS, SUBSTANTIVE, WIRED | Lines 736-745 contain real wire-in. Stub messages "is not yet implemented on the git backend" absent. Comment cites Phase 10 / VCS-18 / PARALLEL-01/02. Mirrors backends/jj.ts wire-in shape. |
| `sdk/src/vcs/jj/parallel.ts` (export change) | derivePhaseRoot exported for cross-backend reuse | EXISTS | Verified — git-side parallel.ts:97 imports `derivePhaseRoot` from '../jj/parallel.js'. CJS dist exposes the function. |
| `sdk/src/vcs/types.ts` (FanInResult) | Uniform shape for both backends | EXISTS, SUBSTANTIVE | Single `interface FanInResult` at lines 533-541; 6 fields match SC2 enumeration. |
| `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts` | TEST-13 git contract suite, 6 scenarios, all passing | EXISTS, SUBSTANTIVE, RUNS GREEN | 507 lines; 6 it() blocks (3 N-loop + 1 conflict + 1 crash + 1 idempotency). vitest run: 6 passed (6) in 3.5s. Pattern B mkdtemp present. |
| `scripts/lint-vcs-no-raw-git.allow.json` | +1 entry for sidecar with {path, reason, owner} schema, no `expires` | EXISTS, SUBSTANTIVE | Pre: 23 entries, Post: 24 entries. New entry verified to have no `expires` field. lint-vcs-no-raw-git.cjs exits 0. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| backends/git.ts (workspace.parallel.dispatch) | git/parallel.ts::performGitParallelDispatch | DI curry `{ mainRepoRoot: cwd, vcs: { workspace }, ...opts }` | WIRED | Line 740 |
| backends/git.ts (workspace.parallel.fanIn) | git/parallel.ts::performGitParallelFanIn | direct call `(cwd, handle, results)` | WIRED | Line 744 |
| git/parallel.ts (fanIn merge loop) | jj/incomplete-work.ts::appendIncomplete | `import { appendIncomplete } from '../jj/incomplete-work.js'` | WIRED | parallel.ts:96 import; parallel.ts:376 + 442 calls |
| git/parallel.ts (dispatch) | jj/parallel.ts::derivePhaseRoot | `import { derivePhaseRoot } from '../jj/parallel.js'` | WIRED | parallel.ts:97; line 152 call |
| Test scenarios | wired GitVcsAdapter | `createGitAdapter()` + `vcs.workspace.parallel.dispatch/.fanIn` | WIRED | Test runs prove end-to-end wiring |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| SDK builds | `pnpm -C sdk build` | exit 0 (tsc + tsc -p tsconfig.cjs.json) | PASS |
| Contract tests pass | `pnpm vitest run src/vcs/__tests__/cmd-parallel-git.test.ts` (from sdk/) | 6 passed (6) in 3.5s | PASS |
| Skip-count baseline preserved | `node scripts/check-skip-count.cjs` | exit 0; current=18, baseline(origin/main)=18 | PASS |
| Raw-git lint allowlisted | `node scripts/lint-vcs-no-raw-git.cjs` | exit 0; 1076 files, 0 violations | PASS |
| Commit-id lint clean | `node scripts/lint-vcs-no-commit-id.cjs` | **exit 1**; 1 violation at cmd-parallel-git.test.ts:355 (hex-shape regex `/^[0-9a-f]{12}$/`) | **FAIL** |

### Requirements Coverage

| Requirement | Source Plan | Description (REQUIREMENTS.md) | Status | Evidence |
|-------------|------------|------------------------------|--------|----------|
| PARALLEL-01 | 10-02, 10-03 | `vcs.workspace.parallel.dispatch` ships on both backends; git wraps `git worktree add` with internal serialization | SATISFIED | parallel.ts performGitParallelDispatch exists; sync for-loop serialization in place; wire-in at backends/git.ts:738-740 |
| PARALLEL-02 | 10-01, 10-02, 10-03 | `vcs.workspace.parallel.fanIn(handle, results): FanInResult` ships on both backends; git iterates per-branch 2-parent merge; halts on first conflict; idempotent under re-call | PARTIAL | Loop + halt + idempotency: SATISFIED. Crash-vs-conflict boolean discrimination: BLOCKED by CR-01. SurplusBookmarks contract: BLOCKED by CR-02. |
| VCS-18 | 10-02, 10-03 | New sdk/src/vcs/git/parallel.ts adapter-internal sidecar; joined to lint-vcs-no-raw-git allowlist | SATISFIED | File exists, 480 LOC; allowlist entry present (24 total entries) |
| TEST-13 | 10-04 | Cross-backend contract tests for PARALLEL-01 + PARALLEL-02 at cmd-parallel-{git,jj}.test.ts; N=2/3/4 + clean fan-in + in-tree-conflict + crashed-worker | SATISFIED (with caveat) | All 6 scenarios pass on host. NOTE: the crashed-worker scenario as-written (uncommitted dirty tree) does NOT exercise CR-01's failure mode (committed-work-then-crash); a regression test is needed to surface CR-01. |
| TEST-15 | 10-01, 10-04 | git per-branch loop happy-path: N successful 2-parent merges produce N entries in merged[] for N ∈ {2, 3, 4} | SATISFIED | Scenarios 1/2/3 verify merged.length === N for each N. |
| TEST-16 | 10-04 | Pattern B random-prefix mkdtemp; NEVER retry: N; NEVER describe.skip; skip-count baseline preserved | SATISFIED | mkdtempSync + random suffix verified; no retry, no .skip, no .only; skip-count green. |

No orphaned requirements — all 6 IDs from REQUIREMENTS.md Phase 10 list (PARALLEL-01, PARALLEL-02, VCS-18, TEST-13, TEST-15, TEST-16) are claimed by at least one plan.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| sdk/src/vcs/__tests__/cmd-parallel-git.test.ts | 355 | Hex-shape regex `/^[0-9a-f]{12}$/` against id-bearing field | BLOCKER | Trips lint-vcs-no-commit-id.cjs (exit 1); CI gate at .github/workflows/test.yml:73 will fail; pretest hook in package.json:65 will fail |
| sdk/src/vcs/git/parallel.ts | 230 | `mkdtemp` for manifest dir is never cleaned up (per WR-06 in 10-REVIEW) | INFO | Cosmetic /tmp leak; not regressing existing behavior (jj-side has same pattern) |
| sdk/src/vcs/git/parallel.ts | 398 | `git branch -D <name>` without `--` end-of-options separator (WR-01 in 10-REVIEW) | WARNING | Defense-in-depth gap; current validateAgentId regex blocks leading-dash exploits but in-file invariant is silent |

### Code-Review Cross-Reference

10-REVIEW.md identified 2 BLOCKER + 6 WARNING + 4 INFO findings.

**BLOCKER alignment with verification:**

- **CR-01 (crashed-agent partial-commit silently merged) — confirmed by code reading.** SC2's "conflicted boolean distinguishes in-tree-conflict-success from crash" requires a working classifier. Code at parallel.ts:323 does not gate on results[].exitCode before merging. The crashed-worker test scenario does not surface this because the simulated crash is uncommitted-only (branch tip == baseRev → ancestor probe skips it). The real failure mode (partial commits) is unexercised. → SC2 must-have: FAILED, BLOCKER.

- **CR-02 (repo-scoped surplus-bookmark sweep) — confirmed by code reading.** SC3's "verified on test-fixture" loop semantics ship correctly, but the surplusBookmarks field of the cross-backend FanInResult is overpopulated (cross-handle pollution) and underspecified (in-flight conflict branches reported as "surplus"). The contract field is mis-implemented even though the merge loop is correct. → SC3 must-have: PARTIAL, BLOCKER on the field-semantics half.

**WARNING alignment:**

- WR-01 (`branch -D` missing `--`): defense-in-depth issue, not goal-blocking. Surfaced as anti-pattern.
- WR-02 (`merge-in-tree-conflict` queue entry uses agent branch tip vs jj's merge change): cross-backend semantic divergence on `changeIdShort`. Field is documented but undocumented divergence may surprise consumers. WARNING — not goal-blocking under SC2 strictly.
- WR-03 (no MERGE_HEAD pre-flight in fanIn): future-defense; not blocking SC3 today.
- WR-04 (cleanup error context loss): observability gap.
- WR-05 (test scenario 6 conflates first-call assertions): test-rigor gap.
- WR-06 (manifest mkdtemp leak): pre-existing jj-side pattern; not a regression.

### Human Verification Required

None — all gaps in this verification are programmatically detectable (code inspection + lint script + test runs). The closure plan can be authored without human UAT.

### Gaps Summary

Phase 10 ships substantial structural correctness — the sidecar exists, is wired, the test suite passes, the merge-loop semantics are correct, the FanInResult type shape is uniform. However three goal-relevant defects survive:

1. **SC2's crash-vs-conflict distinction is broken (BLOCKER).** STEP 1 of `performGitParallelFanIn` does not gate on `results[].exitCode` before merging an agent's branch. Crashed agents with committed partial work get silently merged into main and the orchestrator never learns. The test that should have caught this (Scenario 5 crashed-worker) instead exercises uncommitted dirty work where branch tip == baseRev so the ancestor probe shortcut hides the defect. CR-01 in 10-REVIEW.md.

2. **SC3's surplusBookmarks contract is mis-shapen (BLOCKER on field semantics).** STEP 3 audit at parallel.ts:461 is repo-scoped not handle-scoped; in-flight conflict branches AND any pre-existing `worktree-agent-*` branches in the repo are reported as surplus. The cross-backend contract field gives consumers no way to distinguish "branch escaped cleanup" from "branch is still alive intentionally." CR-02 in 10-REVIEW.md.

3. **SC5's CI lint gate is failing (BLOCKER).** Plan 10.04 added `expect(crashEntry?.changeIdShort).toMatch(/^[0-9a-f]{12}$/)` at cmd-parallel-git.test.ts:355. This trips `lint-vcs-no-commit-id.cjs` which runs in `pretest` (package.json:65) and CI (test.yml:73). Plan 10.03's claim of "commit-id lint exits 0" was true AT Plan 10.03 close, but Plan 10.04 introduced the regex regression and did not re-verify. The fix is straightforward (allowlist entry, inline annotation, or matcher swap) but the gate is currently red.

The "structural" goal achievement (sidecar exists, contract surface ships, tests run green) holds. The "behavioral" goal achievement (the contract surface MEANS what the SC text says it means) is incomplete: the boolean field meaning is broken (SC2), the array field meaning is broken (SC3), and the CI gate that proves the change ships is currently failing (SC5).

Recommended path: author a closure plan that (a) adds the crashed-agent gate to STEP 1 + a regression test that commits-then-crashes; (b) scopes STEP 3 to handle.workspaces; (c) chooses one of the three lint-fix paths for cmd-parallel-git.test.ts:355.

---

_Verified: 2026-05-15T13:25:00Z_
_Verifier: Claude (gsd-verifier)_
