---
phase: 10-git-side-parallel-verbs-classifier-extension
plan: 05
subsystem: vcs/parallel
tags:
  - gap-closure
  - parallel-fanin
  - classifier
  - blocker
  - sc2
  - sc3
dependency_graph:
  requires:
    - 10-04
  provides:
    - performGitParallelFanIn STEP 1 crashedAgentIds gate (CR-01/SC2 closure)
    - performGitParallelFanIn STEP 3 expectedNames filter (CR-02/SC3 closure)
    - cmd-parallel-git.test.ts CR-01 regression scenario
    - cmd-parallel-git.test.ts CR-02 regression scenario
  affects:
    - sdk/src/vcs/git/parallel.ts
    - sdk/src/vcs/__tests__/cmd-parallel-git.test.ts
tech_stack:
  added: []
  patterns:
    - Set-based gate construction once at function entry (T-10-05-01 mitigation)
    - Handle-scoped audit via expectedNames (cross-handle pollution mitigation)
    - Joint-assertion test scenarios (W3 (a) / Pitfall 7 carry)
key_files:
  created: []
  modified:
    - sdk/src/vcs/git/parallel.ts
    - sdk/src/vcs/__tests__/cmd-parallel-git.test.ts
decisions:
  - "CR-01 closure: build crashedAgentIds Set once before STEP 1 loop; early-continue inside loop body before merge-base probe"
  - "CR-02 closure: build expectedNames Set inside the if(listResult.exitCode === 0) block; skip alive branches not in this handle's expected set; for-each-ref argv unchanged"
  - "Used documented options-object form toBeIdOf({ kind: 'git', allowShort: true }) — the plan-spec'd two-arg form does not exist in the matcher's signature (Rule 1 deviation)"
  - "Used spawnSync argv form for `git for-each-ref --format=%(refname:short)` in the test — execSync routes through /bin/sh -c which interprets parens as subshell (Rule 3 deviation)"
metrics:
  duration: "~15min"
  completed: "2026-05-15"
---

# Phase 10 Plan 05: Git fanIn crashed-agent gate + handle-scoped surplus sweep Summary

One-liner: closed Phase 10 SC2 (crash-vs-conflict distinction) and SC3 (handle-scoped surplus contract) by patching `performGitParallelFanIn`'s STEP 1 loop to filter crashed agents (`results[].exitCode !== 0`) before the merge-base probe, and patching STEP 3 to scope the surplus audit to `handle.workspaces` via an `expectedNames` Set — landed alongside two new regression `it` blocks in `cmd-parallel-git.test.ts` that exercise the exact failure modes documented in `10-VERIFICATION.md`.

## What landed

### Production code (`sdk/src/vcs/git/parallel.ts`)

**STEP 1 gate (CR-01/SC2):** Inserted `crashedAgentIds = new Set<string>(results.filter((r) => r.exitCode !== 0).map((r) => r.agentId))` immediately before the `for (const ws of handle.workspaces)` loop, with an explanatory comment block citing CR-01/SC2 and the threat model entry T-10-05-01. The first statement of the loop body is now `if (crashedAgentIds.has(ws.agentId)) continue;` — placed before the `agentBookmark` declaration so crashed agents bypass the merge-base probe entirely and are routed exclusively through STEP 2's classifier.

**STEP 3 gate (CR-02/SC3):** Replaced the body of the `if (listResult.exitCode === 0)` block. The new body builds `expectedNames = new Set<string>(handle.workspaces.map((ws) => \`worktree-agent-${ws.agentId}\`))` and applies `if (!expectedNames.has(bm)) continue;` BEFORE the existing `surplusBookmarks.includes(bm)` dedup. The for-each-ref argv is unchanged (`['for-each-ref', '--format=%(refname:short)', 'refs/heads/worktree-agent-*']`) — narrowing is client-side. Comment block above the construction cites CR-02/SC3 and explains the contract definition (`surplusBookmarks` is by definition a subset of this handle's expected agent bookmarks).

### Test code (`sdk/src/vcs/__tests__/cmd-parallel-git.test.ts`)

**Scenario A — CR-01 regression** at the new describe block `'workspace.parallel — committed-then-crashed agent (CR-01 regression)'`. The single `it` block titled `'routes committed-then-crashed agent through STEP 2 classifier, not STEP 1 merge'`:

- N=2 dispatch.
- agent-1: clean commit (`clean-a.txt`).
- agent-2: COMMITS partial work (`partial.txt`) BEFORE simulated crash — branch tip moves PAST baseRev, which is the precise condition the existing Scenario 5 fails to exercise (it only writes uncommitted dirty state where tip == baseRev).
- Captures `agent2Tip = git rev-parse worktree-agent-agent-2` from the main repo root before fanIn.
- fanIn with `[{ agentId: 'agent-1', exitCode: 0 }, { agentId: 'agent-2', exitCode: 1, stderr: 'simulated crash after partial commit' }]`.
- Joint assertions (single `it` block per W3 (a)):
  - `result.merged.length === 1` — agent-1 ONLY.
  - `result.incompleteQueued >= 1`.
  - `result.failedReaped` contains `agent2WorkspaceName`.
  - Queue entry with `reason === 'crashed-with-uncommitted-work'` AND `subagentName === agent2WorkspaceName`.
  - `crashEntry.changeIdShort` matches the `toBeIdOf({ kind: 'git', allowShort: true })` matcher (12-char short SHA, hex alphabet).
  - `crashEntry.workspacePath` truthy.
  - Branch-ancestry proof: `spawnSync('git', ['merge-base', '--is-ancestor', agent2Tip, 'HEAD'], { cwd: dir }).status` NOT 0 — the agent-2 partial commit was NOT silently absorbed.

**Scenario B — CR-02 regression** at the new describe block `'workspace.parallel — handle-scoped surplus audit (CR-02 regression)'`. The single `it` block titled `'pre-seeded unrelated worktree-agent-foo branch is not flagged as surplus'`:

- `beforeAll` calls `setupGitRepo()` then `execSync('git branch worktree-agent-foo HEAD', { cwd: dir, stdio: 'pipe' })` BEFORE `createGitAdapter(dir)`.
- N=2 dispatch.
- Both agents make distinct clean commits (`agent-1.txt`, `agent-2.txt`).
- fanIn with both exitCode 0.
- Joint assertions (single `it` block per W3 (a)):
  - `result.surplusBookmarks` does NOT contain `'worktree-agent-foo'`.
  - Defensive: `git for-each-ref refs/heads/worktree-agent-*` (via spawnSync argv) still lists `worktree-agent-foo` in the repo — proves the audit excluded it via the filter, not via deletion.
  - `result.surplusBookmarks.length === 0`.

## Test file count metrics

| Metric | Pre-patch | Post-patch | Notes |
| --- | --- | --- | --- |
| Literal `it(` blocks | 4 | 6 | Lines 143, 227, 313, 400 (pre) + 2 new appended at end of file |
| Vitest runtime tests reported | 6 | 8 | Pre-patch: 3 N-loop expansions + 1 conflict + 1 crash + 1 idempotency = 6; post-patch: same 6 + 2 new = 8. The `describe.each([2,3,4])`-equivalent `for (const N of [2,3,4])` at line 117 expands ONE literal `it(` into 3 runtime tests. |

## Full vitest output (final run, post both edits)

```
 RUN  v3.2.4 /Users/LoganDark/Documents/Projects/get-shit-done/sdk

 ✓ |unit| src/vcs/__tests__/cmd-parallel-git.test.ts (8 tests) 5016ms
   ✓ workspace.parallel — N=2 clean dispatch + fanIn > N=2: clean fanIn returns merged.length===2, conflicted===false, surplusBookmarks empty  375ms
   ✓ workspace.parallel — N=3 clean dispatch + fanIn > N=3: clean fanIn returns merged.length===3, conflicted===false, surplusBookmarks empty  588ms
   ✓ workspace.parallel — N=4 clean dispatch + fanIn > N=4: clean fanIn returns merged.length===4, conflicted===false, surplusBookmarks empty  793ms
   ✓ workspace.parallel — in-tree conflict joint assertion (D-17 carry, W3 (a)) > N=2 in-tree-conflict: conflicted===true AND conflictedPaths populated AND queue entry reason="merge-in-tree-conflict" — ALL THREE in ONE scenario  371ms
   ✓ workspace.parallel — crashed worker queue entry (D-06 + D-07) > one crashed worker (exitCode: 1, uncommitted work): queue entry reason="crashed-with-uncommitted-work" + workspace survives on disk (D-07)  328ms
   ✓ workspace.parallel — idempotency re-call (D-03; absorbs TEST-15 per D-11) > N=3 fanIn re-call after manual conflict resolution: first call halts at agent-b, second call merges only agent-c (per-call, NOT cumulative)  819ms
   ✓ workspace.parallel — committed-then-crashed agent (CR-01 regression) > routes committed-then-crashed agent through STEP 2 classifier, not STEP 1 merge  370ms
   ✓ workspace.parallel — handle-scoped surplus audit (CR-02 regression) > pre-seeded unrelated worktree-agent-foo branch is not flagged as surplus  396ms

 Test Files  1 passed (1)
      Tests  8 passed (8)
   Start at  23:29:48
   Duration  5.27s
```

## Confirmations

| Gate | Command | Result |
| --- | --- | --- |
| Vitest green | `pnpm vitest run src/vcs/__tests__/cmd-parallel-git.test.ts` (from `sdk/`) | 8 passed (8) — see full output above |
| SDK builds clean | `pnpm -C sdk build` | exit 0 (tsc + tsc -p tsconfig.cjs.json) |
| Raw-git lint clean | `node scripts/lint-vcs-no-raw-git.cjs` | exit 0; 1076 files scanned, 0 violations |
| Skip-count baseline preserved | `node scripts/check-skip-count.cjs` | exit 0; current=18, baseline(origin/main)=18 |
| Literal `it(` count | `grep -c -E "^\s*it\(" sdk/src/vcs/__tests__/cmd-parallel-git.test.ts` | 6 |
| STEP 1 gate identifiers placed correctly | manual grep on `crashedAgentIds` and `expectedNames` location vs `STEP 1` / `STEP 3` anchors | OK (in-order placement verified) |

## Lint-vcs-no-commit-id status (deliberately unchanged)

`node scripts/lint-vcs-no-commit-id.cjs` **REMAINS RED (exit 1)** at:

```
sdk/src/vcs/__tests__/cmd-parallel-git.test.ts:355  hex-shape regex literal or string
  expect(crashEntry?.changeIdShort).toMatch(/^[0-9a-f]{12}$/);
```

This is the **pre-existing** violation introduced by plan 10-04 (existing Scenario 5 "crashed worker" `it` block, not modified by plan 10-05). Per the plan's success_criteria: "DO NOT regress lint-vcs-no-commit-id (plan 10-06 will fix the pre-existing line 355 issue; do not introduce new violations)." This plan's two new regression scenarios use the `toBeIdOf` custom matcher (no new hex regex), so the violation count is unchanged at 1 — plan 10-06 closes it.

## Deviations from Plan

### Rule 1 — Bug: plan-mandated literal matcher syntax does not match the matcher's actual signature

**Found during:** Task 2 first vitest run.

**Issue:** Plan and orchestrator success_criteria mandate the literal syntax `expect(value).toBeIdOf('git', { allowShort: true })`. The `toBeIdOf` matcher in `tests/__tools__/vitest-matchers.ts:38-58` is defined with the signature `toBeIdOf(received: unknown, kindOrOpts: ToBeIdOfKind | ToBeIdOfOpts)` — a SINGLE options/kind argument. Calling it with two trailing args (`'git', { allowShort: true }`) silently drops the second arg, leaves `allowShort` at its `false` default, sets `min = 40` chars, and rejects the 12-char `changeIdShort` short-SHA. Vitest run reported: `expected "1f64f22ec03e" to be a git id (alphabet [0-9a-f], 40-40 chars); got len=12, alphabet match=true`.

**Fix:** Used the documented options-object form `expect(value).toBeIdOf({ kind: 'git', allowShort: true })` — the only call shape that actually applies the `allowShort=true` relaxation.

**Files modified:** `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts` (Scenario A assertion).

**Commit:** ktw (test commit).

**Verify-gate impact:** The plan's verify-gate `grep -q "toBeIdOf('git'"` checks for the literal substring with a string-literal kind arg. My fixed form `toBeIdOf({ kind: 'git'` satisfies the intent (no hex regex; matcher in use) — verified by `grep -q "toBeIdOf" sdk/src/vcs/__tests__/cmd-parallel-git.test.ts` (substring present). Recommend the verifier treats `toBeIdOf({ kind: 'git'` as semantically equivalent for re-verification of SC2.

### Rule 3 — Blocking: `execSync('git for-each-ref --format=%(refname:short) refs/heads/worktree-agent-*')` fails under `/bin/sh -c`

**Found during:** Task 2 first vitest run.

**Issue:** Scenario B's defensive sanity check called `execSync('git for-each-ref --format=%(refname:short) refs/heads/worktree-agent-*', { cwd: dir })`. `execSync(string, opts)` routes the command through `/bin/sh -c`, which interprets the `%(refname:short)` parens as a subshell invocation and the trailing `*` as a filesystem glob. Both expansions fail at the shell level, before git is invoked.

**Fix:** Replaced with `spawnSync('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads/worktree-agent-*'], { cwd: dir }).stdout.toString()` — argv form bypasses shell interpretation entirely. Added an inline comment explaining the choice.

**Files modified:** `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts` (Scenario B defensive sanity check).

**Commit:** ktw (test commit).

## Re-verification readiness

- **SC2 (CR-01):** SHOULD re-verify GREEN. STEP 1 now gates on `results[].exitCode`; Scenario A asserts the committed-then-crashed agent's tip is NOT in main's ancestry AND the classifier entry exists.
- **SC3 (CR-02):** SHOULD re-verify GREEN. STEP 3 now scopes the audit to `handle.workspaces`; Scenario B proves the pre-seeded unrelated branch is NOT reported as surplus.
- **SC5 (lint-vcs-no-commit-id):** REMAINS RED — plan 10-06's scope. Not regressed by this plan.

`gsd verify-phase 10` will still show SC5 failed until 10-06 lands.

## Threat surface scan

No new network endpoints, auth paths, or trust-boundary surfaces introduced. The two new gates are pure refinements to existing in-memory iteration; both Set constructions are local-scoped (never returned) per threat register T-10-05-01 mitigation. No `## Threat Flags` section needed.

## Self-Check: PASSED

Verified post-write:
- `sdk/src/vcs/git/parallel.ts` exists and contains both `crashedAgentIds` and `expectedNames` literals.
- `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts` exists with 6 literal `it(` blocks and both regression describe titles.
- Task 1 commit recorded (jj change id `ktw` for STEP 1 + STEP 3 gate patch).
- Task 2 commit recorded (jj change id `ktw` for regression scenarios).
- Vitest exit 0 with 8 passed; raw-git lint exit 0; skip-count exit 0; SDK build exit 0.
