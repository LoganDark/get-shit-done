# Phase 9: jj-side parallel verbs + repo-scoped lock - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-15
**Phase:** 09-jj-side-parallel-verbs-repo-scoped-lock
**Areas discussed:** Liveness probe primitive, Repo-lock release contract, Reap classifier scope, fanIn signature + Handle shape

Mode: advisor (USER-PROFILE.md present; `vendor_philosophy: pragmatic` → `standard` calibration tier). Four `gsd-advisor-researcher` agents spawned in parallel; synthesized tables presented; user challenged the premises of two areas and the discussion bifurcated.

---

## Liveness probe primitive (PARALLEL-03)

| Option | Description | Selected |
|--------|-------------|----------|
| A. op log + baseline op id + 5s grace | `jj op log` filtered by `workspace_name` template keyword; per-workspace baseline op id captured at dispatch; 5s grace for unflushed auto-snapshots; returns `{partial: true, liveWorkspaces}` | |
| B. Filesystem mtime pre-filter | stat() on `.jj/working_copy/{checkout,tree_state}`; couples adapter to jj-internal FS layout | |
| C. Wallclock cutoff threshold | Op-log entry < 30s old = live; subagent runtimes vary 10x so fixed window is wrong | |
| D. Atomic-or-nothing | fanIn refuses to merge anything until all workspaces quiescent; would force orchestrator spin-wait inside fanIn, violating single-threaded adapter invariant | |

**User's first response:** "what is liveness what? you spawned the agents you would know when they finish" — challenged the premise of PARALLEL-03 entirely.

**Re-asked with three options including "drop entirely":**

| Option | Description | Selected |
|--------|-------------|----------|
| Drop PARALLEL-03 entirely | Orchestrator awaits Agent() before fanIn; no liveness probe needed | ✓ |
| Keep as cheap defense-in-depth | Single readdir(); refuse fanIn on failure; no `partial: true` recovery contract | |
| Keep as originally specified | Full probe + recovery contract | |

**User's choice:** Drop PARALLEL-03 entirely. The orchestrator-awaits-Agent() invariant makes the "subagent still writing while fanIn fires" scenario impossible in production. PITFALLS.md Pitfall 3 was reasoning from a test fixture, not a real code path.

**Notes:** Cascade — PARALLEL-03 deletes from REQUIREMENTS.md; Phase 10 git-side liveness probe also drops. `FanInResult.liveWorkspaces` and `partial` fields removed from D-08.

---

## Repo-scoped lock release contract (PARALLEL-04)

| Option | Description | Selected |
|--------|-------------|----------|
| A. Sentinel-only, no PID liveness | Dispatch creates sentinel, fanIn unlinks; no automatic stale recovery | |
| B. Serialized opaque handle round-trips | Dispatch returns lockToken JSON; fd can't be inherited cross-process, so token is advisory metadata only | |
| C. Sentinel + PID-liveness stale detection | JSON sentinel with `{pid, ppid, hostname, startedAt}`; `process.kill(pid, 0)` ESRCH ⇒ steal; matches `acquireJjWriteLock` ergonomics | |
| D. Third 'session' verb wrapping dispatch+fanIn | True RAII; inverts control flow (SDK would have to spawn subagents); breaks short-lived-Node invariant | |

**User's first response:** "what is this jj repo lock thing? jj is inherently parallel" — challenged the premise of PARALLEL-04 entirely.

**Re-asked with three options including "drop entirely":**

| Option | Description | Selected |
|--------|-------------|----------|
| Drop PARALLEL-04 entirely (no acquireJjRepoLock) | Trust jj's lock-free design; TEST-14 stays as topology assertion | ✓ |
| Keep as cheap belt-and-suspenders | Implement anyway; held only at fanIn (no cross-process problem) | |
| Drop the lock but keep the TEST-14 assertion | Same as "drop entirely" — bundled into the chosen option | |

**User's choice:** Drop PARALLEL-04 entirely. In `octopus.ts`'s topology each subagent owns a distinct change at distinct change_id; agents squash into THEIR OWN @-, never into a shared ancestor. The orchestrator-only operations (`createPhaseStructure`, `fanIn`, bookmark advance) execute in single processes — no inter-process contention exists. Pitfall 1's "shared-ancestor concurrent-squash diverges" was reasoning from a topology v1.3 doesn't create.

**Notes:** Cascade — PARALLEL-04 deletes from REQUIREMENTS.md; `sdk/src/vcs/jj/lock.ts` is NOT extended; no `.jj/repo/gsd-parallel-lock` sentinel; ROADMAP Phase 9 SC3 deletes; SC1/SC2 lose the "under the repo-scoped lock" clause. TEST-14 reframed as topology assertion per D-03 in CONTEXT.md.

---

## Reap classifier extension scope

| Option | Description | Selected |
|--------|-------------|----------|
| A. Phase 9 lands enum (3 values) + jj probe in reap.ts; Phase 10 adds git producer | Single source of truth ships with first backend; reap.ts already cross-backend; dead branch contained by D-14 gate fail-safe | ✓ |
| B. Joint Phase 9+10 PR | Honors v1.2 same-PR coupling literally; couples jj/git at review time; blocks Phase 9 on Phase 10 readiness | |
| C. Phase 9 puts probe in jj/parallel.ts (not reap.ts) | Split-brain classifier during P9; two producers writing IncompleteWorkEntry with diverging shapes | |

**User's first response:** "what does this mean?" — didn't understand the question.

**Re-asked with plain-English framing** ("third bucket name 'merge-in-tree-conflict'... where does the enum extension PR land?"):

**User's choice:** Option A.

**Notes:** Because PARALLEL-03 dropped, the third reason value `'partial-wave-live-workspace'` also dropped. Enum extends 1 → 2 values (not 1 → 3): `'crashed-with-uncommitted-work'` (existing) + `'merge-in-tree-conflict'` (new). REQUIREMENTS Phase 10 SC4 text "1 → 3 values" needs amending to "1 → 2."

---

## fanIn signature + ParallelDispatchHandle shape

| Option | Description | Selected |
|--------|-------------|----------|
| A. Two-arg static-data: `fanIn(handle, results)` | Frozen JSON handle; honors REQUIREMENTS normative wording + SDK pure-data convention; survives `gsd-sdk query` serialization | ✓ |
| B. One-arg with `pendingResults` pre-attached to handle | Requires mutating a "frozen" handle; contradicts REQUIREMENTS PARALLEL-02 two-arg signature | |
| C. Callable handle (`dispatch(plan)` returns `{workspaces, fanIn(results)}`) | Disqualifying: closures don't survive JSON serialization across `gsd-sdk query` boundary | |

**User's choice:** A.

**Notes:** Handle shape locked at `{phaseRoot, workspaces[{name,path,baseRev,agentId,baselineOpId?}], manifest, phaseNumber, mainBookmark}`. No `lockToken` because PARALLEL-04 dropped. Results-arg shape `Array<{agentId, exitCode, lastChangeId?, stderr?}>`. FanInResult `{merged, conflicted, conflictedPaths, incompleteQueued, failedReaped, surplusBookmarks}` — same shape locks Phase 10 via same-PR coupling.

---

## Claude's Discretion

- Exact placement of `VcsWorkspaceParallel` interface within `sdk/src/vcs/types.ts` (planner choice — likely line 392+ region per ARCHITECTURE.md).
- Field-ordering inside `ParallelDispatchHandle` / `FanInResult` (planner choice).
- Whether `baselineOpId` survives D-01 dropping (planner choice — keep as forward-compat reservation or strip as YAGNI).
- Exact JSDoc wording of the new `IncompleteWorkEntry.reason` enum.
- Test-fixture mechanism for forcing in-tree-conflict in TEST-13 (planner choice — likely a pre-arranged conflicting file per workspace, then octopus-merge).

## Deferred Ideas

- Re-introducing `acquireJjRepoLock` as defense-in-depth — deferred. Add later if a future topology change creates a shared-ancestor concurrent-mutation pattern.
- Liveness probe with `partial: true, liveWorkspaces[]` recovery contract — deferred to v1.4+ if Phase 14 dogfood reveals a real crash-recovery scenario.
- `baselineOpId` per workspace in handle — deferred-or-included at planner discretion.
- `vcs.workspace.parallel.cancel(handle)` mid-execution graceful abandonment — already deferred in REQUIREMENTS Out of Scope.

## Process notes

- Two of four advisor-research recommendations (Areas 1 + 2) ended up rejected at the premise level by the user. The research was still useful for understanding the option-space — but the user's domain knowledge (orchestrator-awaits-Agent() invariant; jj's lock-free design under octopus topology) trumped the research-driven "ship the recommended option" path.
- Liveness-probe agent caught a factual error in the original gray-area prompt (`jj op log --workspace <name>` doesn't exist in 0.41; filter is template-side via `workspace_name` keyword added in 0.40). This correction stands even though the area was dropped — relevant if the probe is ever re-introduced.
