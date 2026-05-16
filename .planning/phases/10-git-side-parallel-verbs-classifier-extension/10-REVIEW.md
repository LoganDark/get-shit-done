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
status: issues_found
previous_review:
  date: 2026-05-15
  blockers_closed: [CR-01, CR-02]
  status_at_close: gaps_resolved
findings:
  critical: 0
  warning: 6
  info: 4
  total: 10
---

# Phase 10: Code Review Report (re-review)

**Reviewed:** 2026-05-15T00:00:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Re-review of Phase 10 after the gap-closure plans 10-05 (CR-01 / CR-02
structural gates) and 10-06 (`toBeIdOf` matcher swap).

Spot-check confirms both prior BLOCKERs are structurally closed:

- **CR-01 closure verified** at `git/parallel.ts:336-341`:
  `crashedAgentIds` Set is built from
  `results.filter(r => r.exitCode !== 0).map(r => r.agentId)` and the
  fan-in loop body short-circuits with `if (crashedAgentIds.has(ws.agentId))
  continue;` BEFORE the `merge-base --is-ancestor` probe at line 353. The
  new regression test at `cmd-parallel-git.test.ts:546-611`
  ("committed-then-crashed agent") commits partial work before the
  simulated crash (moving the branch tip past `baseRev` so the ancestor
  probe would NOT have skipped it under the pre-fix code) and asserts
  `merge-base --is-ancestor agent2Tip HEAD` returns non-zero — falsifying
  the silent-merge defect.

- **CR-02 closure verified** at `git/parallel.ts:493-502`:
  `expectedNames` Set is built from `handle.workspaces` and the audit
  filter `if (!expectedNames.has(bm)) continue;` (line 498) narrows the
  repo-wide `for-each-ref` glob to handle-owned bookmarks only. The new
  regression test at `cmd-parallel-git.test.ts:654-700`
  ("handle-scoped surplus audit") pre-seeds an unrelated
  `worktree-agent-foo` branch before dispatching and asserts (i) it does
  NOT appear in `surplusBookmarks`, (ii) it is still alive in the repo
  post-fanIn.

The gap closures themselves did not introduce a new BLOCKER, but they
exposed two latent defense-in-depth issues in STEP 2's crashed-agent
classifier branch (WR-07, WR-08) that the new regression test scenarios
do NOT cover. The prior WARNINGs are mostly persistent (re-evaluated
below).

Lint allowlist still conforms to the solo-dev `{path, reason, owner}`
schema (no `expires`).

## Warnings

### WR-01: `git branch -D <name>` cleanup still missing `--` end-of-options separator

**File:** `sdk/src/vcs/git/parallel.ts:416`
**Status:** Persists from prior review (was WR-01).
**Issue:** `vcsExec(mainRepoRoot, 'git', ['branch', '-D', agentBookmark])`
is still missing the `--` separator. `backends/git.ts:712` uses
`['branch', '-D', '--', opts.agentBookmark]`. Defense-in-depth gap if
`validateAgentId`'s character class is ever loosened.

**Fix:**
```typescript
const delRes = vcsExec(mainRepoRoot, 'git', ['branch', '-D', '--', agentBookmark]);
```

### WR-02: `merge-in-tree-conflict` queue entry uses agent's branch tip SHA, not the conflicted merge head

**File:** `sdk/src/vcs/git/parallel.ts:385-394`
**Status:** Persists from prior review (was WR-02).
**Issue:** When a per-branch merge conflicts at line 369, the queue
entry's `changeIdShort` is sourced from `git rev-parse <agentBookmark>`
(the pre-merge agent branch tip). The jj-side counterpart at
`jj/parallel.ts:418-423` stores the MERGE change_id and names the
subagent `phase-{NN}-merge`. The git-side stores the AGENT branch tip
and names it `ws.name`. Cross-backend consumers cannot interpret
`changeIdShort` for `reason==='merge-in-tree-conflict'` uniformly —
on git it identifies the source branch, on jj it identifies the
wedged merge state.

**Fix:** Either capture HEAD before the conflict reset and use that, or
document the per-backend divergence on the `IncompleteWorkEntry`
type. Whichever path is chosen, the field's meaning needs to be
recoverable from the type alone.

### WR-03: fanIn still does not validate that no merge is already in progress

**File:** `sdk/src/vcs/git/parallel.ts:302-344`
**Status:** Persists from prior review (was WR-03).
**Issue:** No `MERGE_HEAD` probe at the top of `performGitParallelFanIn`.
If a caller re-invokes fanIn without first resolving the wedged merge
(or after a partial `git merge --abort`), the next `git merge --no-ff`
exits non-zero with "You have not concluded your merge (MERGE_HEAD
exists)". The mergeConflicted regex at line 367 will not match this
stderr, so the fallthrough at line 369 fires and queues another
`merge-in-tree-conflict` entry — with `conflictedPaths` derived from
the wrong state (the previous wedged merge's unmerged index entries,
not anything from this call).

**Fix:**
```typescript
const mergeHeadProbe = vcsExec(mainRepoRoot, 'git',
  ['rev-parse', '--verify', '--quiet', 'MERGE_HEAD']);
if (mergeHeadProbe.exitCode === 0) {
  throw new Error(
    `parallel.fanIn: refusing to run with mid-merge state ` +
    `(MERGE_HEAD set); resolve via 'git commit' or ` +
    `'git merge --abort' first`,
  );
}
```

### WR-04: Per-success cleanup still loses stderr context on `worktree remove` failure

**File:** `sdk/src/vcs/git/parallel.ts:409-420`
**Status:** Persists from prior review (was WR-04).
**Issue:** When `git worktree remove` fails inside the success-cleanup
branch (line 410-411), `removeRes.stderr` is discarded and
`agentBookmark` is pushed to `surplusBookmarks` indistinguishably from
the loop-halt case. A caller reading `surplusBookmarks` cannot tell
"this branch escaped cleanup because of a real fs error" from "this
branch is alive because the loop halted on a sibling's conflict."

**Fix:** Either log stderr through a transcript surface or split the
surplus list into "expected-alive" vs "unexpected-cleanup-failure" at
the type level.

### WR-05: STEP 2's crashed-agent branch is never deleted; leaks into STEP 3's surplus audit

**File:** `sdk/src/vcs/git/parallel.ts:423-472`
**Status:** NEW finding — surfaced by the gap closures (interaction of
CR-01's STEP 1 gate with CR-02's expectedNames audit).
**Issue:** When STEP 2 classifies a crashed agent with COMMITTED work
and a CLEAN WC (the exact scenario the new CR-01 regression test at
`cmd-parallel-git.test.ts:546-611` constructs):

1. Line 460: queue entry written with `reason='crashed-with-uncommitted-work'`.
2. Line 470: `git worktree remove ws.path` runs unconditionally — and
   SUCCEEDS, because the WC is clean (the agent committed before
   crashing).
3. The agent's BRANCH `worktree-agent-<id>` is NEVER deleted in
   STEP 2.
4. STEP 3's audit at line 491-502 enumerates `refs/heads/worktree-agent-*`,
   matches against `expectedNames`, and pushes the orphaned branch to
   `surplusBookmarks`.

Net result: the same crashed agent gets BOTH a queue entry AND a
`surplusBookmarks` entry. The contract field `surplusBookmarks` is
documented as "branches that outlived a fan-in cleanup" — STEP 2 here
intentionally did not attempt branch cleanup (the queued entry is the
inspection handle per Pitfall 3 "preserve partial work"), so the audit
double-counts.

The pre-existing `cmd-parallel-git.test.ts:546-611` CR-01 regression
test does NOT assert `result.surplusBookmarks` content, so this
behavior is invisible to the suite. The existing crashed-worker
scenario at line 313 also misses it (dirty WC → worktree remove
refuses → branch + worktree both survive — same surplus leak, also
unasserted).

**Fix:** After STEP 2's `worktree remove` succeeds, delete the agent
branch explicitly (with `--` separator per WR-01):
```typescript
const removeRes = vcsExec(mainRepoRoot, 'git', ['worktree', 'remove', ws.path]);
if (removeRes.exitCode === 0) {
  // Branch is no longer in use; safe to delete. -D matches the per-
  // success cleanup at line 416 (force-delete because it's not merged
  // into main).
  vcsExec(mainRepoRoot, 'git', ['branch', '-D', '--', agentBookmark]);
}
failedReaped.push(ws.name);
```
Add an assertion to the CR-01 regression test:
`expect(result.surplusBookmarks).not.toContain('worktree-agent-agent-2')`.

### WR-06: STEP 2's `worktree remove` discards exit code AND stderr

**File:** `sdk/src/vcs/git/parallel.ts:470`
**Status:** NEW finding — adjacent to WR-05.
**Issue:** `vcsExec(mainRepoRoot, 'git', ['worktree', 'remove', ws.path]);`
runs as a statement-expression — the `ExecResult` is dropped on the
floor. No branch on `exitCode`, no inspection of `stderr`. Both
outcomes are presumed safe:

- success → falls through to `failedReaped.push(ws.name)` (the leak in
  WR-05);
- failure (D-07 dirty-tree refusal, the documented case) → also falls
  through to `failedReaped.push(ws.name)`.

Either outcome appends the same name to `failedReaped` regardless of
whether the worktree actually survived on disk. Callers reading
`failedReaped` cannot tell "agent crashed AND its workspace was
preserved for inspection" from "agent crashed AND its workspace was
cleaned up because the WC was clean." The `workspacePath` on the
queue entry is the only inspection handle, and a caller that walks
both surfaces in parallel gets ambiguous state.

**Fix:** Either inspect the exit code and branch on it (preserve the
worktree → don't push to `failedReaped` until the user dismisses, or
add a new sentinel), or document the field as "names of crashed
workspaces, regardless of cleanup outcome — see queue file for state
detail." The latter is cheaper but the field name then misleads.

## Info

### IN-01: Duplicate inline `validateAgentId` regex across both sidecars

**File:** `sdk/src/vcs/git/parallel.ts:112-118`,
`sdk/src/vcs/jj/parallel.ts:92-98`
**Status:** Persists from prior review (was IN-01).
**Issue:** Same regex `/^[A-Za-z0-9._/-]+$/` and same error message
shape duplicated across both sidecars. A shared validator under
`sdk/src/vcs/refs-validator.ts` (already exists and is imported by
`backends/git.ts`) would not violate UPSTREAM-02 sidecar discipline
(`refs-validator.ts` lives outside `backends/`).

### IN-02: `setupGitRepo` lifecycle pattern duplicated across SIX describe blocks now

**File:** `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts:124-130,
218-225, 304-310, 391-398, 537-543, 637-651`
**Status:** Persists from prior review (was IN-02), slightly worse —
two new describes (CR-01 and CR-02 regressions) reproduce the
boilerplate. Considered acceptable per the W2 lifecycle lock-in
requirement that each describe own its own fixture, but a helper that
takes a callback would collapse the pattern without violating the
invariant.

### IN-03: `execSync` and `spawnSync` calls in tests still omit `stdio: 'pipe'`

**File:** `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts:415, 422, 428,
453-455, 502-504, 579, 692`
**Status:** Persists from prior review (was IN-03), one new occurrence
at line 692 (`spawnSync('git', ['for-each-ref', ...], { cwd: dir })`
in the new CR-02 regression test missing `stdio: 'pipe'`), and a new
occurrence at line 579 (`execSync('git rev-parse worktree-agent-agent-2',
{ cwd: dir })` in the new CR-01 regression test) — stderr from these
defaults inherit and leaks to the test runner console if the rev-parse
or for-each-ref fails mid-test. Other calls in the same file use
`stdio: 'pipe'` consistently.

**Fix:** Add `stdio: 'pipe'` to the eight remaining occurrences.

### IN-04: `merged: string[]` semantic divergence still undocumented at the type

**File:** `sdk/src/vcs/git/parallel.ts:399-403` vs
`sdk/src/vcs/jj/parallel.ts:469`
**Status:** Persists from prior review (was IN-04).
**Issue:** Git fills `merged` with up to N 12-char short SHAs (one per
successful 2-parent merge); jj fills with one full change_id. The
cross-backend `FanInResult.merged: readonly string[]` type carries no
signal of the per-backend shape. Consumers indexing into this array
will get incompatible values.

**Fix (docs):** JSDoc on `FanInResult.merged` in
`sdk/src/vcs/types.ts` documenting the per-backend shape. Long-term:
structured type `{ kind: 'sha' | 'change_id'; value: string }[]`
surfaces the gap at compile time.

---

## Closed in this review

- **CR-01 (prior critical):** Closed at `git/parallel.ts:336-341`
  (crashedAgentIds gate) + new regression at
  `cmd-parallel-git.test.ts:546-611`. Spot-check: gate is positioned
  BEFORE the ancestor probe and scoped local-only (no closure leak).
- **CR-02 (prior critical):** Closed at `git/parallel.ts:493-502`
  (expectedNames filter) + new regression at
  `cmd-parallel-git.test.ts:654-700`. Spot-check: filter narrows the
  repo-wide glob to handle-owned bookmarks; the pre-seeded
  `worktree-agent-foo` is correctly excluded.
- **WR-05 (prior warning) "test scenario 6 conflates assertions
  about agent-c's first-call state":** Still not formally closed —
  the recommended `git rev-parse --verify worktree-agent-agent-c`
  + `existsSync(workspaces[2].path)` assertions are not present at
  line 446-455. However, the broader Phase 10 closure status moves
  this from a defense-in-depth gap into the larger
  surplusBookmarks-semantics conversation (now tracked under WR-05
  re-issued above). Marking superseded.
- **WR-06 (prior warning) "Manifest path leaks":** Same defect as
  Phase 9; deferred for cross-phase cleanup. Marking superseded by
  the carried Phase 9 issue rather than re-listing here.

---

_Reviewed: 2026-05-15T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
