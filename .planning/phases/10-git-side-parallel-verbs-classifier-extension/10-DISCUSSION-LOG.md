# Phase 10: git-side parallel verbs + classifier extension - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-15
**Phase:** 10-git-side-parallel-verbs-classifier-extension
**Areas discussed:** Octopus form / failure policy / path enumeration; Primary-worktree state on conflict; `workspace.add` serialization; Crashed-agent work capture
**Mode:** Advisor (research-backed comparison tables via 4 parallel `gsd-advisor-researcher` agents); calibration tier `standard`; `NON_TECHNICAL_OWNER=false`

---

## Octopus form + failure policy + conflict-path enumeration

| Option | Description | Selected |
|--------|-------------|----------|
| D — octopus + post-refusal `merge-tree` enumeration | Always one N-parent `git merge --no-ff <p1>..<pN>`; on refusal run pairwise `merge-tree --write-tree` probes to populate `conflictedPaths`. Preserves single-N-parent DAG symmetry with jj. ~130 LOC; git ≥2.38 floor. (Researcher recommendation.) | |
| B — octopus + empty paths on refusal | Always octopus; refusal → `conflicted:true, conflictedPaths:[]`. Regex extends to match `/Should not be doing an octopus/i`. ~80 LOC. Asymmetric empty-paths-on-refusal vs jj. | |
| A — pre-probe before octopus | Pairwise `merge-tree` probes BEFORE running octopus; never invoke octopus if probe predicts refusal. ~150 LOC. Probe/actual divergence risk. | |
| C — sequential 2-way fallback on refusal | Octopus first; on refusal chain sequential 2-way merges. ~200 LOC. Breaks DAG-shape symmetry with jj. | |
| **User-driven reframe (NONE OF THE ABOVE)** | git-side fanIn is a **loop of 2-parent merges**, NOT octopus. No octopus on git ever. The cross-backend contract is "fan in; halt on conflict; be re-callable." Internal loop shape is per-backend (jj: 1 iteration N-parent; git: N iterations 2-parent). | **✓ (D-01)** |

**User's choice:** Free-text reframe — "we should keep the current git behavior and only do the octopus merge strategy with jj... we can just perform one merge at a time in a loop until it reports that the last merge has succeeded -- that way, jj can have its one merge and git can have its arbitrarily many merges, and if a merge fails then that conflict can be resolved and the merge completed before continuing with the others."

**Notes:** Reframe collapses Areas 1 & 2 into a single decision. Cascades: ROADMAP SC3 + REQUIREMENTS PARALLEL-02 git-side wording + TEST-15 need amending (see CONTEXT.md D-09..D-11). The synthesized "snapshot-branch" idea from Area 2 Option C drops as a consequence.

---

## Primary-worktree state on fan-in conflict

| Option | Description | Selected |
|--------|-------------|----------|
| C — snapshot-then-abort | Synthetic commit on `gsd/phase-NN-conflict-snapshot` branch, then `git merge --abort`. Tree clean post-return; full diagnostic preserved as real git object. (Researcher recommendation.) | |
| A — leave-as-is (jj-symmetric) | Leave MERGE_HEAD set + markers in primary worktree. Mirrors `backends/git.ts:660-705` precedent. | **✓ (D-02)** |
| B — auto-abort + report paths only | Enumerate `conflictedPaths` then `git merge --abort`. Tree clean but markers + 3-stage index gone. | |
| D — stash-then-abort | `git stash push --include-untracked` then `--abort`. Fragile across git versions. | |

**User's choice:** Free-text — "shouldn't we preserve the existing git behavior?" — selects A (leave-as-is, matches existing 2-parent `workspace.merge` precedent at `backends/git.ts:660-705`).

**Notes:** Implies user resolves with normal git tooling (`git add` → `git commit` of merge, OR `git merge --abort`). The "orchestrator autonomy wedge" concern raised in research is accepted as a trade-off; the orchestrator's re-call (D-03) is what completes the merge after user resolves.

---

## `workspace.add` serialization mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| 1 — plain sequential `for`-loop (Recommended) | Mirrors `jj/parallel.ts:204`. `spawnSync` blocks event loop → naturally serial. Zero new code, zero deps. | **✓ (D-05)** |
| 3 — hand-rolled flock sentinel | Mirror `acquireJjWriteLock` pattern. Cross-process robust but solves problem TEST-15 doesn't assert. | |
| 2 — async semaphore concurrency=1 | Promise-based semaphore wrapping `git worktree add`. Pure ceremony today. | |
| 4 — proper-lockfile npm dep | Violates project's "avoid heavy npm deps" stance. | |

**User's choice:** Option 1 (Recommended).

**Notes:** TEST-15's "manifest length == 8 in 20 sequential runs" asserts against single-process N=8; `spawnSync` already serializes. Inline comment must cite PITFALLS Pitfall 5 so a future async-`vcsExec` refactor is forced to revisit.

---

## Crashed-agent work capture on git

| Option | Description | Selected |
|--------|-------------|----------|
| A — branch-tip SHA only; skip remove if dirty (Recommended) | Symmetric with jj reap: one `.id` short, one `workspacePath` for human inspection. Non-force `worktree remove` refusing dirty trees structurally implements Pitfall 3. | **✓ (D-06)** |
| C — auto-commit dirty to `gsd/crashed-<agentId>` ref | True jj-`@`-snapshot parity. But mutates ref namespace silently. | |
| B — branch-tip + `git status --porcelain` snapshot in entry | Self-describing but breaks IncompleteWorkEntry cross-backend shape. | |
| D — `git stash create` + ref anchor | GC fragility, double-id payload breaks single-`.id` invariant. | |

**User's choice:** Option A (Recommended).

**Notes:** `failedReaped` in `FanInResult` carries agent NAME (matches `jj/parallel.ts:530`). Edge case "branch tip == baseRev AND `git status --porcelain` clean" emits an `abandoned`-style entry mirroring jj's empty-head probe.

---

## Follow-up decisions (after reframe)

### Idempotency mechanism for re-called `fanIn`

| Option | Description | Selected |
|--------|-------------|----------|
| Probe `merge-base --is-ancestor` per workspace | For each entry in `handle.workspaces`, check whether its tip is already reachable from main; skip if yes. Stateless. | **✓ (D-03)** |
| Caller curates handle between calls | Caller constructs new handle omitting already-merged workspaces. | |
| Sidecar state file (`merge-progress.json`) | fanIn writes/reads a progress file in the phase dir. | |

**User's choice:** Stateless probe.

### Worktree + branch cleanup timing on the git side

| Option | Description | Selected |
|--------|-------------|----------|
| Per-success in the loop | Each successful merge → immediately `git worktree remove` + `git branch -D`. Matches existing `executeWorktreeWaveCleanupPlan` body. | **✓ (D-04)** |
| Batched at end of clean loop | No cleanup until loop terminates with zero conflicts. More atomic but lingers worktrees mid-conflict. | |
| Per-success + closing sweep on final clean call | Hybrid. | |

**User's choice:** Per-success in the loop.

---

## Claude's Discretion

Per CONTEXT.md `<decisions>` Claude's Discretion subsection:
- File layout inside `sdk/src/vcs/git/parallel.ts` (pure functions vs named-export object; helper names)
- Whether `surplusBookmarks` is populated incrementally inside the loop or audit-only on final-clean recall
- Behavior on "branch tip != baseRev AND `git status --porcelain` clean" edge case
- Exact text of the new `lint-vcs-no-raw-git.allow.json` entry (ARCHITECTURE.md proposes reason wording)
- Dispatch ordering: create-all-worktrees-then-return-handle vs. create-worktree-and-eagerly-create-branch interleaved

## Deferred Ideas

Per CONTEXT.md `<deferred>` section:
- Octopus form on git for merge-count optimization (Phase 14+ dogfood-driven if needed)
- Snapshot branch for preserved-and-clean-tree conflict diagnostics (v1.4+ dogfood-driven if needed)
- Aligning the existing 2-parent `workspace.merge` at `backends/git.ts:660-705` to a clean-tree-on-conflict policy (future cleanup phase if a workflow surfaces the wedge)
- Sidecar state file for `fanIn` re-call progress (rejected at decision time per D-03 stateless probe)
- `vcs.workspace.parallel.cancel(handle)` mid-execution abandonment (already in REQUIREMENTS Out of Scope)
- Cross-backend `surplusBookmarks` audit shape under per-success cleanup (Claude's Discretion)
