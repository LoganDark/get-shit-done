# Phase 10: git-side parallel verbs + classifier extension - Context

**Gathered:** 2026-05-15
**Status:** Ready for planning (REQUIREMENTS + ROADMAP need amending per D-01 cascade — see "Cascade Effects" below)

<domain>
## Phase Boundary

The git backend gains the `vcs.workspace.parallel.{dispatch,fanIn}` verb bodies in a new `sdk/src/vcs/git/parallel.ts` adapter-internal sidecar, replacing the Phase 9 throwing stubs at `backends/git.ts:723-734`. The cross-backend `FanInResult` shape (locked at Phase 9 D-08 — `{merged, conflicted, conflictedPaths, incompleteQueued, failedReaped, surplusBookmarks}`) ships uniform on both backends.

**Reframe vs Phase 9 ROADMAP framing:** `parallel.fanIn` is a halt-on-conflict, re-callable LOOP, not a single atomic merge. The cross-backend contract is *"fan in agent work into main; halt cleanly on first conflict; be idempotent under re-call after user resolves."* Internal loop shape is per-backend:

- **jj-side (already shipped Phase 9):** loop has ONE iteration — the N-parent `jj new -r @ -r <p1>..-r <pN>`. Returns done in one shot.
- **git-side (this phase):** loop iterates N times — one 2-parent `git merge --no-ff <agentBookmark>` per workspace, halts on first conflict, re-callable via `git merge-base --is-ancestor` skip.

The Phase 9 jj-side body STAYS UNCHANGED — D-01 reshapes git substrate only. The `FanInResult` shape jj already populates remains correct under the loop reframe (jj's loop body produces `merged: [<oneMergeChangeId>]`; git's loop body produces `merged: [<sha>, <sha>, ...]` with up to N entries).

The reap classifier extension from Phase 9 D-09 (`IncompleteWorkEntry.reason` widened to `'crashed-with-uncommitted-work' | 'merge-in-tree-conflict'`) gets its git-side producer landed here per Phase 9 D-10's same-PR coupling clause. The `'merge-in-tree-conflict'` producer fires inside the loop on `git merge` exit code != 0 + non-empty `git diff --name-only --diff-filter=U`.

</domain>

<decisions>
## Implementation Decisions

### fanIn form + conflict handling (Areas 1 & 2 — collapsed)

- **D-01:** git-side `fanIn` is a **loop of 2-parent `git merge --no-ff <agentBookmark>` per workspace**, NOT an octopus form. The cross-backend contract is "fan in; halt on conflict; be re-callable" — internal loop shape is per-backend. Rejects ROADMAP SC3's "git N-parent octopus form" wording; rejects the synthesized Option D (post-refusal `merge-tree` enumeration); rejects Option C's chained-merge-as-fallback (no fallback because there's no octopus to fall back from in the first place). Rationale: user-driven reframe — "we should keep the current git behavior; for git the existing behavior is fine" — lifts the existing `bin/lib/worktree-safety.cjs::executeWorktreeWaveCleanupPlan:417-516` body into TS without changing its merge shape.

- **D-02:** On the first per-branch merge that conflicts, **halt the loop and return**. Leave the primary worktree in mid-merge state (MERGE_HEAD set, conflict markers in tree, index has unmerged entries). User resolves with normal git tooling (`git add` → `git commit` of the merge, OR `git merge --abort`). Matches the existing 2-parent `workspace.merge` precedent at `sdk/src/vcs/backends/git.ts:660-705`. The Phase-10-discuss synthesized "snapshot-then-abort to `gsd/phase-NN-conflict-snapshot` branch" idea (Area 2 Option C in the research) is **dropped**.

- **D-03:** `fanIn` is **idempotent / re-callable**. Mechanism: stateless probe — for each entry in `handle.workspaces`, run `git merge-base --is-ancestor <agentBookmarkTip> HEAD` (or equivalent SDK verb routing); if already an ancestor, skip that workspace entirely. The same `handle` is passed on every re-call; the orchestrator/user does not curate the handle between calls. No sidecar state file is written for re-call progress tracking.

- **D-04:** **Per-success cleanup in the loop.** Each successful 2-parent merge immediately fires `git worktree remove <path>` (non-force per ROADMAP SC1) + `git branch -D <agentBookmark>` for THAT workspace before the loop advances to the next. On conflict halt, already-merged workspaces are already cleaned up; the failing workspace + any remaining unmerged ones survive. On final clean recall, a closing `git worktree prune` + `surplusBookmarks` audit catches anything that slipped through.

### Concurrency / serialization

- **D-05:** `performGitParallelDispatch`'s worktree-create loop is a **plain `for`-loop with sync `vcsExec`**. Mirrors `sdk/src/vcs/jj/parallel.ts:204` exactly. `spawnSync` blocks the event loop → intra-process serialization comes from the runtime, not from any explicit mechanism. No async semaphore, no flock sentinel, no `proper-lockfile` dep. Inline comment at the loop header cites PITFALLS Pitfall 5 (`.git/config.lock` race) and notes that intra-process serialization is `spawnSync`-derived, so any future refactor to async `vcsExec` is forced to revisit the decision rather than silently regress. Rationale: TEST-15's "manifest length == 8 in 20 sequential runs" asserts against a single-process N=8 dispatch — exactly the shape where `spawnSync` already serializes. Vitest per-file-process parallelism cannot race because Pattern B `mkdtemp` gives each test file its own repo. Production orchestrator is single-process-per-wave by construction.

### Crashed-agent work capture (reap classifier git-side producer)

- **D-06:** When `result.exitCode !== 0` for an agent, the git-side reap-equivalent **stores the agent's branch-tip SHA in `IncompleteWorkEntry.changeIdShort`** (the unified `.id` slot per v1.2 model — commit_id on git, change_id on jj). Workspace path goes in `workspacePath` (the human-inspection handle). Reason classification mirrors jj's empty-head probe:
  - branch tip == `baseRev` AND `git status --porcelain` clean → emit `abandoned`-style entry (no incomplete-work queue write)
  - branch tip != `baseRev` OR `git status --porcelain` non-empty → emit `IncompleteWorkEntry(reason='crashed-with-uncommitted-work', changeIdShort: <branchTipShortSha>, workspacePath, subagentName)`

- **D-07:** **Non-force `worktree remove` refusing dirty trees is a feature, not a bug.** When a crashed agent left a dirty tree, fanIn's cleanup attempt fails loud (per ROADMAP SC1 — `--force` forbidden); the worktree survives on disk with all its dirty content intact; the IncompleteWorkEntry's `workspacePath` is the human-inspection handle (PITFALLS Pitfall 3 — "preserve partial work" — structurally implemented by this refusal). `failedReaped` in `FanInResult` carries the agent NAME (matches `jj/parallel.ts:530`), not branch or path — those live in the queue entry.

- **D-08:** The `'merge-in-tree-conflict'` producer fires inside the fanIn loop body, NOT inside reap. When `git merge --no-ff <agentBookmark>` exits non-zero with conflict marker output (`/CONFLICT|Automatic merge failed/i` per existing precedent at `backends/git.ts:683`), fanIn:
  1. Enumerates conflictedPaths via `git diff --name-only --diff-filter=U`
  2. Appends `IncompleteWorkEntry(reason='merge-in-tree-conflict', changeIdShort: <agentBookmarkTipShortSha>, workspacePath: <agentWorktreePath>, subagentName)` to the phase queue
  3. Returns `FanInResult` with `conflicted: true`, `conflictedPaths` populated, `merged: [<allSuccessSoFar>]`, loop halts
  
  Reap.ts's git-side branch (if it grows one) handles only crashed-agent classification (D-06), not merge conflicts. Symmetric with jj-side where merge-in-tree-conflict is appended by `parallel.fanIn` directly (`jj/parallel.ts:413-425`) and reap handles only crashed-agent change_id classification.

### Cascade effects (REQUIREMENTS + ROADMAP amendments needed before planner reads them)

- **D-09:** **ROADMAP Phase 10 SC3 amends.** Current text reads: "`git merge --no-ff <p1> <p2> <p3>` octopus form for N≥3 verified on test-fixture across CI git versions; `git worktree remove --force` is forbidden in the cross-backend path (non-force only)." Should read: "Per-branch 2-parent `git merge --no-ff <agentBookmark>` loop verified on test-fixture across CI git versions; halt-on-conflict + re-call via `merge-base --is-ancestor` skip; `git worktree remove --force` is forbidden in the cross-backend path (non-force only)."

- **D-10:** **REQUIREMENTS.md PARALLEL-02 git-side wording amends.** Current text reads: "git uses N-parent `git merge --no-ff <p1>...<pN>` + batched `git update-ref -d`." Should read: "git iterates per-branch 2-parent `git merge --no-ff <agentBookmark>` + per-success `git branch -D`; halts on first conflict; idempotent under re-call via `merge-base --is-ancestor` skip."

- **D-11:** **REQUIREMENTS.md TEST-15 amends or drops.** Current text reads: "git N-parent octopus fixture. `git merge --no-ff <p1> <p2> <p3>` octopus form for N≥3 verified cross-version (ARCHITECTURE-researcher's open question)." Either delete TEST-15 (PARALLEL-02 git-side test in TEST-13 already proves the loop happy-path) OR reframe as: "git per-branch loop happy-path: N successful 2-parent merges produce N entries in `merged[]` for N ∈ {2, 3, 4} verified cross-version."

- **D-12:** **PROJECT.md target features bullet** ("Git backend implementation — new `parallel.*` verb bodies wrap the existing raw-git `worktree add` / `merge --no-ff` / `worktree remove` flow inside the adapter") — already accurate under D-01; no edit needed.

### Carry-forward from Phase 9 (do not re-decide)

- **D-13 (carry):** `FanInResult` shape `{merged, conflicted, conflictedPaths, incompleteQueued, failedReaped, surplusBookmarks}` is locked by Phase 9 D-08. `merged: string[]` — git fills with up to N short SHAs in loop order; jj fills with one change_id (already shipped). `conflicted: boolean` — true when the git loop halts on a merge conflict, OR true when jj's single N-parent merge conflicts (jj path unchanged).
- **D-14 (carry):** `ParallelDispatchHandle` is frozen pure JSON (Phase 9 D-05); shape locked at D-06. `workspaces[].baseRev` JSDoc semantics: commit_id on git, change_id on jj — rebase-stable revision pointer per v1.2 unified revision model.
- **D-15 (carry):** `IncompleteWorkEntry.reason` enum is widened to 2 values by Phase 9 in `sdk/src/vcs/jj/reap.ts` (the cross-backend home per ARCHITECTURE.md Integration Point #3). Phase 10 adds the git-side producer for `'merge-in-tree-conflict'` — does NOT re-extend the enum.
- **D-16 (carry):** No raw `child_process` in `sdk/src/vcs/git/parallel.ts`. `vcsExec` is the sole subprocess primitive. SDK shape law: pure-JSON returns; no closures/methods/Symbols.
- **D-17 (carry):** Pattern B random-prefix `mkdtemp` for `cmd-parallel-git.test.ts` fixture isolation per PITFALLS Pitfall 9 and TEST-16. No `retry: N`, no `describe.skip`.

### Claude's Discretion

- File layout inside `sdk/src/vcs/git/parallel.ts`: pure functions or named-export object; exact name of the loop-skip helper (e.g., `isAlreadyMerged` vs `ancestorOf`); whether to extract per-merge cleanup to a helper or inline it.
- Whether `surplusBookmarks` is populated incrementally inside the loop (each failed `git branch -D` adds to the field) or audit-only on the final-clean recall via `git for-each-ref refs/heads/worktree-agent-*` post-loop. Recommendation: populate incrementally so a re-call that finishes cleanly returns the full audit in one place.
- Exact behavior on D-06's "branch tip != baseRev AND `git status --porcelain` clean" edge case — agent committed work but no dirty tree. Recommended: queue as `'crashed-with-uncommitted-work'` even though the tree is clean (the committed work IS uncommitted-from-main-perspective).
- Whether `lint-vcs-no-raw-git.allow.json` gets the new `sdk/src/vcs/git/parallel.ts` entry text exactly as ARCHITECTURE.md §"Integration Point #4" proposes, or with planner-tweaked reason wording.
- Order of operations in dispatch: create all worktrees first, then return the handle, vs. create-worktree-and-eagerly-create-branch interleaved (jj-side eagerly creates agent bookmarks after the slot loop completes — git-side can mirror or inline per-slot).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project framing + requirements

- `.planning/PROJECT.md` — v1.3 milestone framing; lift-and-collapse posture; cross-backend symmetry pressure (every behavioral difference must be load-bearing or it's a defect).
- `.planning/REQUIREMENTS.md` §"Cross-backend parallel-dispatch verbs (PARALLEL)" — PARALLEL-01 + PARALLEL-02 git-side wording needs amending per D-10 before planner reads as authoritative.
- `.planning/REQUIREMENTS.md` §"Backend implementations (VCS)" — VCS-18 (new `sdk/src/vcs/git/parallel.ts` + allowlist entry).
- `.planning/REQUIREMENTS.md` §"Test infrastructure (TEST)" — TEST-13 git contract tests; TEST-15 amends or drops per D-11; TEST-16 (Pattern B + no-retry budget).
- `.planning/ROADMAP.md` §"Phase 10: git-side parallel verbs + classifier extension" — SC3 wording amends per D-09.
- `.planning/STATE.md` §"Decisions" + §"Blockers/Concerns" — Pitfall 5 still load-bearing for the dispatch loop; Pitfall 4 (batch agent-bookmark cleanup) reframes under D-04 (per-success cleanup, not batched delete).

### Phase 9 contracts (locked surface — read first)

- `.planning/phases/09-jj-side-parallel-verbs/09-CONTEXT.md` D-04..D-09 — `FanInResult` shape, Handle shape, reap classifier enum widening, sidecar discipline, change_id-only on cross-backend surface.
- `sdk/src/vcs/jj/parallel.ts` (lines 1-50 header, 308-543 fanIn body) — symmetric reference; the git-side D-01 loop reframe means git's fanIn body DIVERGES structurally (loop vs single op) while producing the same `FanInResult` shape.
- `sdk/src/vcs/types.ts` — `VcsWorkspaceParallel`, `ParallelDispatchOpts`, `ParallelDispatchHandle`, `ParallelAgentResult`, `FanInResult`, `IncompleteWorkEntry` (all locked by Phase 9; Phase 10 consumes without extending).
- `sdk/src/vcs/jj/reap.ts` — Phase 9 widened the `IncompleteWorkEntry.reason` union here; Phase 10's git-side producer writes to the same cross-backend queue file via `appendIncomplete` (`sdk/src/vcs/jj/incomplete-work.ts` is the cross-backend home per ARCHITECTURE.md Integration Point #3).

### Research

- `.planning/research/ARCHITECTURE.md` §"Pre-emptive corrections" #1 + §"Integration Point #4" — the "no allowlist entries" target is markdown-template-substitution raw-git, NOT the 23 production allowlist entries; Phase 10 ADDS ONE entry for `sdk/src/vcs/git/parallel.ts` per ARCHITECTURE.md's pre-written reason string.
- `.planning/research/ARCHITECTURE.md` §"Integration Point #2" — asymmetric sidecars; `sdk/src/vcs/git/parallel.ts` is the NEW file; `backends/git.ts` consumes it via the same import pattern jj uses (`import { performJjReap } from '../jj/reap.js'` at line 33).
- `.planning/research/PITFALLS.md` §"Pitfall 2" — in-tree-conflict probe; survives Phase 10 unchanged but the producer site is the fanIn loop body (D-08), not reap.
- `.planning/research/PITFALLS.md` §"Pitfall 3" — partial-wave failure / "preserve partial work"; D-07 structurally implements this via non-force `worktree remove` refusing dirty trees.
- `.planning/research/PITFALLS.md` §"Pitfall 4" — batch agent-bookmark cleanup race; D-04 (per-success cleanup) sidesteps the batched-delete shape on git; jj-side keeps its batched delete (already shipped).
- `.planning/research/PITFALLS.md` §"Pitfall 5" — `.git/config.lock` race; D-05 (plain sequential for-loop) inherits the structural protection from `spawnSync`.
- `.planning/research/SUMMARY.md` — executive summary; no new deps; risks at coordination boundary.

### SDK code references

- `sdk/src/vcs/backends/git.ts:570-582` — existing `workspace.add` body (per-worktree create). Phase 10's `performGitParallelDispatch` calls this in a loop.
- `sdk/src/vcs/backends/git.ts:660-705` — existing 2-parent `workspace.merge` body (the per-branch merge primitive `performGitParallelFanIn`'s loop body wraps). D-02 inherits this body's conflict-leaves-tree-mid-merge precedent.
- `sdk/src/vcs/backends/git.ts:706-715` — existing `workspace.remove` (non-force / force). Phase 10's per-success cleanup calls the non-force form per D-04 / ROADMAP SC1.
- `sdk/src/vcs/backends/git.ts:723-734` — the Phase 9 throwing stub for `workspace.parallel.{dispatch,fanIn}`. Phase 10 replaces with a wire-in to `sdk/src/vcs/git/parallel.ts`.
- `bin/lib/worktree-safety.cjs:417-516` — the existing `executeWorktreeWaveCleanupPlan` body. ~100 LOC of orchestrator-tier merge-loop logic that D-01 lifts into TS. Phase 11 (orchestrator rewire) eventually deletes the CJS body in favor of the TS adapter verb; Phase 10 only adds the TS body.
- `get-shit-done/workflows/execute-phase.md:521-810` — workflow-markdown raw-git block (dispatch + merge + cleanup-tail). Phase 10 does NOT delete this; Phase 11 does. Phase 10 only ships the verb body that Phase 11 will then call from the workflow.
- `sdk/src/vcs/__tests__/` — directory layout for `cmd-parallel-git.test.ts` per TEST-13 git-side.
- `scripts/lint-vcs-no-commit-id.cjs` — v1.2 CI-blocking enforcer; new `git/parallel.ts` must pass.
- `scripts/lint-vcs-no-raw-git.cjs` + `scripts/lint-vcs-no-raw-git.allow.json` — Phase 10 adds ONE entry (net +1 vs +0 — the only allowlist diff this phase makes); the 23 production entries are NOT touched.

### Cross-phase coupling (informational, not Phase 10 deliverables)

- Phase 11: workflow-markdown raw-git deletion + `workspace.assert-dispatched-cwd` SDK verb + worktree-path-safety doc rename. Phase 10 does NOT touch `execute-phase.md` or `quick.md`.
- Phase 12 (A3 colocated pre-commit fix) — INDEPENDENT track. Phase 10 does NOT touch `sdk/src/vcs/backends/jj.ts::commit` or hook firing.
- Phase 14: default flip + dogfood validation. Phase 10's deliverables must be CI-green on both backends before Phase 13's `parallel-e2e` lane goes required-blocking.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`sdk/src/vcs/backends/git.ts:570-582` (`workspace.add`)** — per-worktree create primitive. `performGitParallelDispatch`'s slot loop calls this once per plan item via the `vcs.workspace.add(...)` closure passed in (same DI pattern jj-side uses).
- **`sdk/src/vcs/backends/git.ts:660-705` (`workspace.merge`)** — 2-parent `git merge --no-ff -m <msg> <branch>` + post-merge HEAD `rev-parse` + `git branch -D` agentBookmark. Returns `{ok, conflicted, changeId, stderr}`. `performGitParallelFanIn`'s loop body calls this once per workspace; on `conflicted:true` halts and queues the IncompleteWorkEntry per D-08.
- **`sdk/src/vcs/backends/git.ts:706-715` (`workspace.remove`)** — non-force / force wrapper around `git worktree remove`. D-04's per-success cleanup uses the non-force form.
- **`sdk/src/vcs/jj/incomplete-work.ts::appendIncomplete` / `readIncomplete`** — cross-backend queue file home (despite the `jj/` path). git-side `'merge-in-tree-conflict'` and `'crashed-with-uncommitted-work'` writes go through `appendIncomplete` per D-08 and D-06.
- **`bin/lib/worktree-safety.cjs:417-516`** — the existing `executeWorktreeWaveCleanupPlan` body is the merge-loop reference Phase 10 lifts into TS. Not deleted by Phase 10 (Phase 11 deletes it); but consult its loop shape, error handling, and cleanup ordering as the source of truth for D-01's loop body.
- **`sdk/src/vcs/jj/parallel.ts:194-244`** — jj-side dispatch loop shape. D-05's plain-for-loop serialization mirrors this exactly.
- **`sdk/src/vcs/jj/parallel.ts:308-543`** — jj-side fanIn body. NOT a 1:1 reference for git-side (jj does one N-parent merge in one shot; git iterates 2-parent merges). DO mirror: validators inline (sidecar discipline), `Object.freeze` on return, frozen pure-JSON `FanInResult`, queue write via `appendIncomplete`.

### Established Patterns

- **Asymmetric sidecars (ARCHITECTURE.md Integration Point #2):** `sdk/src/vcs/jj/` exists for UPSTREAM-02 sidecar discipline; `sdk/src/vcs/git/` is NEW in Phase 10 but exists for code-organization reasons (not upstream-rebase pressure). Phase 10 creates the directory and adds `parallel.ts` only. No other files migrate.
- **Single SDK shape law:** `ParallelDispatchHandle` and `FanInResult` are pure-JSON `Object.freeze`'d returns. No closures/methods/Symbols (D-14 carry).
- **`vcsExec` is the sole subprocess primitive:** no raw `child_process` in `git/parallel.ts` (D-16 carry).
- **`expr.rev(...)` for revision-literal arguments:** Use for any `<rev>` placeholder in argv (matches `octopus.ts:36` precedent).
- **`workspace.add` DI seam (ADR-0004):** the `vcs` closure pattern jj-side uses to call `workspace.add` from inside the sidecar (`createSubagentSlot(mainRepoRoot, vcs, {...})` at `octopus.ts:174-198`) carries over: `performGitParallelDispatch(opts & {mainRepoRoot, vcs: {workspace: {add, remove}}})`.

### Integration Points

- **`sdk/src/vcs/git/parallel.ts`** (NEW FILE) — `performGitParallelDispatch(opts): ParallelDispatchHandle` + `performGitParallelFanIn(mainRepoRoot, handle, results): FanInResult`. Pure functions. Composes the existing `workspace.add` / `workspace.merge` / `workspace.remove` primitives via the `vcs` DI closure.
- **`sdk/src/vcs/backends/git.ts`** — replaces the Phase 9 throwing stub at lines 723-734 with a wire-in: `parallel: Object.freeze({ dispatch: (opts) => performGitParallelDispatch({ mainRepoRoot: cwd, vcs: {workspace}, ...opts }), fanIn: (handle, results) => performGitParallelFanIn(cwd, handle, results) })`. Imports `performGitParallelDispatch` and `performGitParallelFanIn` from `'../git/parallel.js'` (same pattern as jj's import at backends/jj.ts:34).
- **`sdk/src/vcs/__tests__/cmd-parallel-git.test.ts`** (NEW) — TEST-13 git contract: Pattern A `describe.sequential.skipIf(!gitAvailable)`. Pattern B `mkdtemp` for fixture isolation. Scenarios per TEST-13 (mirroring jj-side): N=2/3/4 dispatch, clean fan-in, fan-in halting on one in-tree-conflict (asserts `conflicted:true` + `conflictedPaths` populated + queue entry with `reason='merge-in-tree-conflict'`), fan-in with one crashed worker (asserts `failedReaped` carries name + queue entry with `reason='crashed-with-uncommitted-work'`), idempotency re-call (after resolving the conflict, re-call fanIn → merges remaining → `merged` length grows). TEST-15 scenarios per D-11 (loop happy-path proof) absorbed here.
- **`scripts/lint-vcs-no-raw-git.allow.json`** — net +1 entry. Reason text per ARCHITECTURE.md §"Integration Point #4" recommendation: "VCS adapter internals — git-side parallel-dispatch substrate; raw `git worktree`/`merge`/`branch -D` are the substrate the cross-backend `workspace.parallel.*` surface wraps."

</code_context>

<specifics>
## Specific Ideas

- **"Loop until done" cross-backend abstraction:** the user's reframe — "perform one merge at a time in a loop until it reports that the last merge has succeeded" — generalizes both backends. jj's loop body does the whole octopus in one call and returns done; git's loop body does ONE 2-parent merge per iteration. The `FanInResult` shape doesn't change; only the population pattern differs (jj fills `merged` with one entry, git fills with up to N).
- **Re-call semantics example:** dispatch N=3 (agents A, B, C). First `fanIn` call: A merges clean, B conflicts → halt. Returns `{merged: [<shaA>], conflicted: true, conflictedPaths: ['src/x.ts', ...], incompleteQueued: 1, ...}`. A's worktree + branch are gone (D-04 per-success cleanup); B and C survive. User resolves B's conflict, commits the merge manually. Second `fanIn` call with the SAME handle: `merge-base --is-ancestor` skips A (already merged) and skips B (now merged via user's manual commit); merges C clean. Returns `{merged: [<shaC>], conflicted: false, ...}`. C's worktree + branch cleaned up.
- **`merged: string[]` is per-call, not cumulative across re-calls.** The orchestrator/caller is responsible for accumulating across re-calls if it needs a total count. The handle stays the input; the result is per-invocation.
- **No octopus on git, ever.** Phase 10 sets the precedent: the git substrate uses N sequential 2-parent merges. Future phases that might want octopus form on git for other reasons (e.g., merge-commit count optimization) should treat it as a separate decision and re-open this.
- **The existing 2-parent `workspace.merge` at `backends/git.ts:660-705` is the unit primitive `performGitParallelFanIn` composes over.** Don't re-implement merge logic; call through `vcs.workspace.merge(...)` per workspace inside the loop.

</specifics>

<deferred>
## Deferred Ideas

- **Octopus form on git for merge-count optimization** — Deferred. If a future requirement surfaces (e.g., dogfood reveals merge-commit-count growth as a problem), revisit. The infrastructure to add it is contained (a single `performGitParallelFanIn` variant flag).
- **Snapshot branch (`gsd/phase-NN-conflict-snapshot`) for preserved-and-clean-tree conflict diagnostics** — Deferred to v1.4+. The synthesized Area-2 Option C had appeal but adds new ref-namespace governance the user does not want to take on without dogfood-driven evidence. If Phase 14 dogfood reveals that mid-merge primary-worktree wedge is hostile to the orchestrator's autonomy in practice, revisit.
- **Aligning the existing 2-parent `workspace.merge` at `backends/git.ts:660-705` to a clean-tree-on-conflict policy** — Deferred. The 2-parent path's current leave-tree-mid-merge behavior is acceptable under D-02's reaffirmation of the precedent. A future cleanup phase might revisit if a workflow surfaces the wedge.
- **Sidecar state file for `fanIn` re-call progress** — Deferred (rejected at decision time). D-03's stateless `merge-base --is-ancestor` probe makes a state file unnecessary. If re-call probes ever become expensive (e.g., N>>4 workspaces), a state-file optimization can be added without changing the contract.
- **`vcs.workspace.parallel.cancel(handle)` mid-execution graceful abandonment** — Already in REQUIREMENTS.md Out of Scope / STATE.md Deferred Items; not a Phase 10 concern.
- **Cross-backend `surplusBookmarks` audit shape under per-success cleanup** — Claude's Discretion (see D-04 + Claude's Discretion). Recommended: incremental population inside the git loop; final clean recall returns the full audit.

</deferred>

---

*Phase: 10-git-side-parallel-verbs-classifier-extension*
*Context gathered: 2026-05-15*
