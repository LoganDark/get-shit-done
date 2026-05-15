---
phase: 10-git-side-parallel-verbs-classifier-extension
reviewed: 2026-05-15T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - scripts/lint-vcs-no-raw-git.allow.json
  - sdk/src/vcs/__tests__/cmd-parallel-git.test.ts
  - sdk/src/vcs/backends/git.ts
  - sdk/src/vcs/git/parallel.ts
  - sdk/src/vcs/jj/parallel.ts
findings:
  critical: 2
  warning: 6
  info: 4
  total: 12
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-05-15T00:00:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Phase 10 ships the git-side parallel-dispatch sidecar plus reap-classifier extension. The structural mirror against `sdk/src/vcs/jj/parallel.ts` is solid: pure-JSON frozen handle/return, sole-`vcsExec` discipline, no `backends/` import, eager branch creation via the `workspace.add` DI seam, and per-call (non-cumulative) `merged: string[]` semantics. Cross-backend `FanInResult` shape parity holds.

However, two correctness defects survive the test suite because the crashed-worker scenario chosen for proof has a branch tip equal to `baseRev` (so the ancestor-probe shortcut hides the issue):

1. **STEP 1 of `performGitParallelFanIn` does NOT consult `results[].exitCode`** — it merges every workspace's branch unconditionally. A crashed agent that committed partial work before dying will have its work silently merged into main, then "reaped" with no queue entry (because the branch is gone post-cleanup). The jj-side sidecar correctly orders reap AFTER the merge, but jj can recover via the change_id; on git the work is in main and the orchestrator never learns there was a crash.
2. **STEP 3 surplus-bookmark audit is repo-scoped, not handle-scoped** — `for-each-ref refs/heads/worktree-agent-*` enumerates every matching branch in the repo, including unrelated leftovers from prior phases or concurrent processes. These appear in `surplusBookmarks` for THIS handle's fanIn result.

Several smaller issues affect defense-in-depth (`branch -D` missing `--` separator), conflict-state classification (in-flight conflict branches reported as "surplus"), and test rigor (uncaptured stderr from `execSync`/`spawnSync` calls in the test file).

The lint-allowlist entry conforms to the solo-dev `{path, reason, owner}` schema with no `expires`, per the project override.

## Critical Issues

### CR-01: STEP 1 fan-in merge loop ignores `results[].exitCode` — crashed agents with committed work get silently merged

**File:** `sdk/src/vcs/git/parallel.ts:323-403`
**Issue:** `performGitParallelFanIn` STEP 1 iterates `handle.workspaces` without consulting the `results` argument. Any workspace whose `agentBookmark` has commits beyond `baseRev` is merged into main, regardless of whether the agent exited with code 0 or crashed mid-task.

The crashed-worker test (`cmd-parallel-git.test.ts:313-362`) does not surface this defect because the crashed agent (`agent-2`) writes `dirty.txt` but never `git commit`s it. Its branch tip therefore equals `baseRev`, so the `merge-base --is-ancestor` probe at line 335 returns exit 0 (the agent's branch IS an ancestor of HEAD: it's the same commit), and STEP 1 skips it before STEP 2 can classify it as crashed.

The real failure mode is an agent that commits N partial changes then crashes (e.g. SIGKILL after a successful intermediate `commit`). Sequence:
1. `results[i].exitCode = 1` for the crashed agent.
2. STEP 1 probe: branch tip != HEAD → not ancestor → process normally.
3. `git merge --no-ff` succeeds on the partial commits → main now contains broken work.
4. Per-success cleanup deletes the branch and removes the workspace.
5. STEP 2 finds `result.exitCode !== 0`, looks up ws, runs `rev-parse worktree-agent-<id>` → fails (branch deleted), pushes to `failedReaped`. **No queue entry written.**

The orchestrator's `phaseMergeFor` gate at `backends/git.ts:131-141` will pass (queue empty) and the broken work ships.

The jj-side sidecar (`jj/parallel.ts:509-533`) avoids this by filtering crashed agents OUT of the merge parents argv via `currentHeads.get(ws.name)` only being consulted for non-crashed ws, then routing crashed ones through `performJjReap`. The git-side fanIn must add the equivalent gate.

**Fix:**
```typescript
// At the top of STEP 1's loop, skip workspaces whose result.exitCode !== 0.
const crashedAgents = new Set(
  results.filter((r) => r.exitCode !== 0).map((r) => r.agentId),
);
for (const ws of handle.workspaces) {
  if (crashedAgents.has(ws.agentId)) continue; // routed through STEP 2 below
  const agentBookmark = `worktree-agent-${ws.agentId}`;
  // ... existing probe + merge body ...
}
```

Add a regression test: dispatch N=2, agent-1 commits cleanly + exits 0, agent-2 commits a partial change + exits 1. Assert `result.merged.length === 1` (agent-1 only), `result.incompleteQueued >= 1`, and that the queue entry's `subagentName` matches agent-2's workspace name.

### CR-02: STEP 3 surplus-bookmark audit is repo-scoped, conflates handles

**File:** `sdk/src/vcs/git/parallel.ts:456-469`
**Issue:** The final audit runs `git for-each-ref --format=%(refname:short) refs/heads/worktree-agent-*` and adds every matching branch to `surplusBookmarks` (after dedup against the in-loop pushes). This pattern matches every `worktree-agent-*` branch in the repo — not just the ones this handle owns. Three real-world failure modes:

1. **Cross-handle contamination:** A previous phase's (or a concurrent orchestrator's) leftover `worktree-agent-foo` branch surfaces in THIS fanIn's `surplusBookmarks`, prompting the caller to clean up branches it does not own.
2. **In-flight conflict branches reported as surplus:** When the STEP 1 loop halts on conflict (D-02), the conflicting agent's branch AND every later un-processed agent's branch are still alive. STEP 3 picks them all up and labels them surplus, but they are intentional — the conflicted branch is needed for resolution, the later branches are needed for the next fanIn re-call. The `surplusBookmarks` field is documented as "branches that outlived a fan-in cleanup" (test comment at line 491-498), so reporting in-flight branches misuses the field's semantics.
3. **Re-call ordering:** On the second fanIn re-call, the agent that previously conflicted (and was then resolved by user) is correctly skipped via the ancestor probe — but its branch is still alive (the user committed the merge but not necessarily a `branch -D`). STEP 3 reports it as surplus, which the test scenario 6 (line 499) actually relies on — but this pollutes the contract: the field now means "any alive `worktree-agent-*`," not "branches that escaped cleanup."

**Fix:** Scope the sweep to this handle's agent IDs only, OR restrict to a per-phase prefix (e.g. `refs/heads/worktree-agent-phase-{NN}-*`). The first option preserves backward semantics:
```typescript
const expectedNames = new Set(
  handle.workspaces.map((ws) => `worktree-agent-${ws.agentId}`),
);
const listResult = vcsExec(mainRepoRoot, 'git', [
  'for-each-ref', '--format=%(refname:short)', 'refs/heads/worktree-agent-*',
]);
if (listResult.exitCode === 0) {
  const alive = listResult.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
  for (const bm of alive) {
    if (!expectedNames.has(bm)) continue; // not OUR handle's bookmark
    if (!surplusBookmarks.includes(bm)) surplusBookmarks.push(bm);
  }
}
```

Update scenario 6's assertion to reflect the corrected semantic: in a clean re-call, all of THIS handle's branches that are still alive are surplus by definition, but unrelated branches MUST NOT appear.

## Warnings

### WR-01: `git branch -D <name>` cleanup uses no `--` end-of-options separator

**File:** `sdk/src/vcs/git/parallel.ts:398`
**Issue:** `vcsExec(mainRepoRoot, 'git', ['branch', '-D', agentBookmark])` is missing the `--` separator. Compare `backends/git.ts:712` which uses `['branch', '-D', '--', opts.agentBookmark]` with explicit `validateRefname` and `--` for defense-in-depth.

`agentBookmark` here is constructed as `worktree-agent-${agentId}` and `agentId` was validated against `/^[A-Za-z0-9._/-]+$/` at dispatch time, so today no leading-dash branch name can reach this call. But the in-file invariant is silent — a future caller composing a fanIn handle by hand (or any future change to `validateAgentId` to accept additional characters) loses the safety net.

**Fix:**
```typescript
const delRes = vcsExec(mainRepoRoot, 'git', ['branch', '-D', '--', agentBookmark]);
```

### WR-02: `merge-in-tree-conflict` queue entry uses agent's branch tip SHA, not the conflicted merge head

**File:** `sdk/src/vcs/git/parallel.ts:367-376`
**Issue:** When a per-branch merge conflicts, the queue entry's `changeIdShort` is set from `git rev-parse <agentBookmark>` (the agent's pre-merge branch tip). The jj-side equivalent (`jj/parallel.ts:419-423`) uses `mergeChangeId` (the merge change's id) and names the entry `phase-{NN}-merge`. The git-side stores the agent branch tip and names the entry `ws.name`.

This is a semantic mismatch across backends. The queue entry's `changeIdShort` for a `merge-in-tree-conflict` reason should identify the wedged merge state, not the source branch — the human inspecting the queue file needs to know "what does HEAD look like right now," and HEAD is in mid-merge with `MERGE_HEAD` set. The agent branch tip is recoverable via the workspace inventory; the wedged merge state is not labelled anywhere.

**Fix:** Either capture the post-merge HEAD before the conflict resets it (or use `MERGE_HEAD`'s value) and store that, OR document that on the git backend `changeIdShort` for `merge-in-tree-conflict` is the agent's branch tip while jj uses the merge change. Cross-backend consumers currently cannot interpret the field uniformly.

### WR-03: `merge-in-tree-conflict` fanIn does not validate that no merge is already in progress

**File:** `sdk/src/vcs/git/parallel.ts:323-347`
**Issue:** The docstring (lines 286-296) describes the re-call flow as "user resolves … commits the merge manually" before the second fanIn invocation. If the user re-runs fanIn WITHOUT resolving the wedged merge (or aborts via `git merge --abort` partially), the next fanIn call's `git merge --no-ff` will fail with "You have not concluded your merge (MERGE_HEAD exists)" rather than emitting a structured error.

The merge attempt's exit code path at line 351 falls into the `mergeConflicted || mergeRes.exitCode !== 0` branch and queues yet another `merge-in-tree-conflict` entry (with garbage `conflictedPaths` from `git diff --name-only --diff-filter=U` running in the wrong state).

**Fix:** Probe for `MERGE_HEAD` existence (`git rev-parse --verify MERGE_HEAD`) at the top of `performGitParallelFanIn` and throw a structured error if mid-merge state is detected:
```typescript
const mergeHeadProbe = vcsExec(mainRepoRoot, 'git', ['rev-parse', '--verify', '--quiet', 'MERGE_HEAD']);
if (mergeHeadProbe.exitCode === 0) {
  throw new Error(
    `parallel.fanIn: refusing to run with mid-merge state (MERGE_HEAD set); resolve via 'git commit' or 'git merge --abort' first`,
  );
}
```

### WR-04: Per-success cleanup loses error context on `worktree remove` failure

**File:** `sdk/src/vcs/git/parallel.ts:391-402`
**Issue:** When `git worktree remove` fails (e.g. dirty tree from a successful merge that left WC modifications, or fs permission error), the code pushes `agentBookmark` to `surplusBookmarks` and continues silently. The `removeRes.stderr` content is discarded — there is no transcript-side hint that the cleanup failed for a SPECIFIC reason vs. a benign "branch outlives worktree" case.

A user looking at `surplusBookmarks` cannot distinguish "this branch escaped cleanup because of an fs error worth investigating" from "this branch is alive because the conflict halted the loop." Both end up in the same array.

**Fix:** At minimum, log the stderr through whatever transcript surface exists (or surface via a new `cleanupErrors` field on `FanInResult`). Optionally, distinguish "expected surplus" (loop halt) from "unexpected surplus" (cleanup error) at the type level.

### WR-05: Test scenario 6 conflates assertions about agent-c's first-call state

**File:** `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts:441-457`
**Issue:** The first-call assertions at lines 446-455 do not verify that agent-c was NOT processed. They check `firstResult.merged.length === 1` (which only proves at most one merge happened) and `firstResult.conflicted === true` — but a defect where the loop continues past the conflict and incorrectly merges agent-c would show `merged.length === 2`. The test would then fail at line 446, but the failure message would be misleading ("expected 1, got 2") rather than localized to the halt-on-conflict invariant.

Add an explicit assertion: `expect(spawnSync('git', ['merge-base', '--is-ancestor', cSha, 'HEAD'], { cwd: dir }).status).not.toBe(0)` (already present at line 455) is good — but also assert that `worktree-agent-agent-c` branch still EXISTS post-first-call (proving cleanup did not run for it). Without that, the "halt cleanly without touching agent-c" invariant is implicit.

**Fix:** Add post-first-call assertion:
```typescript
expect(spawnSync('git', ['rev-parse', '--verify', 'worktree-agent-agent-c'], { cwd: dir }).status).toBe(0);
expect(existsSync(handle.workspaces[2].path)).toBe(true);
```

### WR-06: Manifest path leaks; `mkdtemp` directory never cleaned up

**File:** `sdk/src/vcs/git/parallel.ts:230-243` (and `jj/parallel.ts:252-265` already has the same defect)
**Issue:** Each call to `performGitParallelDispatch` allocates a fresh `mkdtemp(tmpdir(), 'gsd-wave-manifest-')` directory and writes one file into it. Nothing in the lifecycle removes this directory. Over many fanIn cycles (or many test iterations) `$TMPDIR` accumulates `gsd-wave-manifest-*` orphan directories until the OS reaper sweeps them.

This is not a correctness bug, but it surfaces in CI as `df -h /tmp` pressure on long-lived runners and as cosmetic leakage on dev machines. The jj-side has the same issue (carried forward from Phase 9), so this is not a regression — but Phase 10 doubles the leak rate (one per backend per dispatch) without adding cleanup.

**Fix:** Either include the manifest path in the handle's frozen surface and let the orchestrator unlink after fanIn completes, OR write the manifest INSIDE `handle.phaseRoot` (which has a defined lifecycle owned by the phase) instead of an opaque tmpdir.

## Info

### IN-01: Duplicate inline `validateAgentId` regex across both sidecars

**File:** `sdk/src/vcs/git/parallel.ts:112-118`, `sdk/src/vcs/jj/parallel.ts:92-98`
**Issue:** Both sidecars contain a verbatim copy of the same regex check with the same error message format. UPSTREAM-02 sidecar discipline forbids importing from `backends/`, but a shared validator under `sdk/src/vcs/refs-validator.ts` (which already exists and is imported by `backends/git.ts`) would not violate sidecar discipline — it lives in `sdk/src/vcs/`, not `sdk/src/vcs/backends/`.

**Fix:** Add `validateAgentId` to `sdk/src/vcs/refs-validator.ts` and import from both sidecars. Eliminates the drift hazard.

### IN-02: Test file duplicates `setupGitRepo` lifecycle pattern across four describe blocks

**File:** `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts:117-507`
**Issue:** The `beforeAll/afterAll` pair `dir = setupGitRepo(); afterAll(() => { if (dir) rmSync(dir, ...); })` is repeated four times. Considered acceptable per the W2 lifecycle lock-in comment (each describe must own its own fixture), but a test-helper that takes a callback could collapse the boilerplate without violating the lifecycle invariant.

**Fix (optional):**
```typescript
function withFreshRepo(name: string, body: (getCtx: () => { dir: string; vcs: ... }) => void) {
  describe.sequential.skipIf(!gitAvailable)(name, () => {
    let ctx: { dir: string; vcs: ReturnType<typeof createGitAdapter> };
    beforeAll(() => { const dir = setupGitRepo(); ctx = { dir, vcs: createGitAdapter(dir) }; });
    afterAll(() => { if (ctx?.dir) rmSync(ctx.dir, { recursive: true, force: true }); });
    body(() => ctx);
  });
}
```

### IN-03: `execSync` calls in the test omit `stdio: 'pipe'` for `git rev-parse`

**File:** `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts:415, 422, 428`
**Issue:** `execSync('git rev-parse HEAD', { cwd: handle.workspaces[i].path }).toString().trim()` defaults stdio to inherit; stderr from these calls leaks to the test runner's console if the rev-parse fails mid-test. Other calls in the same file use `stdio: 'pipe'` consistently.

**Fix:** Add `stdio: 'pipe'` to the three `git rev-parse HEAD` calls and the `spawnSync` calls at lines 453-455, 502-504 (which similarly default to inherit).

### IN-04: `merged: string[]` semantics differ across backends — git stores 12-char SHAs, jj stores full change_ids

**File:** `sdk/src/vcs/git/parallel.ts:384` vs `sdk/src/vcs/jj/parallel.ts:469`
**Issue:** Per the D-13 carry comment in the git-side header, this is intentional — git fills with up to N short SHAs, jj fills with one full change_id. But the cross-backend `FanInResult.merged: readonly string[]` type contract gives no signal that lengths and meanings differ. A consumer doing `result.merged[0]` and treating it as a stable revision identifier will get a 12-char short SHA on git (potential collisions) vs a full change_id on jj.

**Fix (docs):** Add a JSDoc comment on `FanInResult.merged` in `sdk/src/vcs/types.ts` documenting the per-backend shape and explicitly noting the short-SHA vs full-change_id divergence. Long-term: consider making this a structured type (`{ kind: 'sha' | 'change_id'; value: string }[]`) to surface the semantic gap at compile time.

---

_Reviewed: 2026-05-15T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
