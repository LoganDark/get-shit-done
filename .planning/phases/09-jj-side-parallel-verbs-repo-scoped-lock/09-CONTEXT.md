# Phase 9: jj-side parallel verbs + repo-scoped lock - Context

**Gathered:** 2026-05-15
**Status:** Ready for planning

> **Phase name note:** the ROADMAP name still reads "+ repo-scoped lock" but D-02 below drops `acquireJjRepoLock`. The lock clause in the phase name is now stale; a follow-up edit to `.planning/ROADMAP.md` should rename to **"jj-side parallel verbs"** (or **"jj-side parallel verbs + reap classifier extension"**). Planner should treat the lock as out-of-scope regardless of phase-name wording.

<domain>
## Phase Boundary

The jj backend gains the new `vcs.workspace.parallel.{dispatch,fanIn}` verbs in a new `sdk/src/vcs/jj/parallel.ts` composition layer that wraps existing `octopus.ts` + `reap.ts` + `workspace.merge` primitives. The cross-backend `VcsWorkspaceParallel` interface lands on `VcsAdapterCommon`. `WAVE_WORKTREE_MANIFEST` extends with `plan_id`, `agent_id`, `backend` (backwards-compatible). The reap classifier extends from 1 → 2 `IncompleteWorkEntry.reason` values to surface in-tree conflicts from N-parent octopus merges. jj-side contract tests (TEST-13 jj + TEST-14 `divergent()` topology proof) ship.

Phase 10 ships the matching git-side bodies + finalizes `FanInResult` cross-backend coupling. Phase 9 ships the contract; Phase 10 ships the second implementation.

</domain>

<decisions>
## Implementation Decisions

### Concurrency model — challenged premises, scope reduced

- **D-01 (PARALLEL-03 DROPPED):** No liveness probe. The orchestrator awaits all `Agent()` promise resolutions before calling `vcs.workspace.parallel.fanIn`; when an Agent() resolves, that subagent's Node process has exited. There is no production scenario where fanIn fires while a workspace is mid-write. The originally-feared "partial-wave failure with one agent still running" (Pitfall 3) was a TEST fixture scenario, not a production code path. `FanInResult` does NOT carry `liveWorkspaces` / `partial: true` fields. Cascade: REQUIREMENTS.md PARALLEL-03 entry should be moved to "Out of Scope" or deleted; Phase 10's PARALLEL-03 git-side line in `Plans` likewise drops.
- **D-02 (PARALLEL-04 DROPPED):** No `acquireJjRepoLock`. jj is lock-free by design — concurrent ops produce divergent op-log entries that auto-merge. In `octopus.ts`'s topology, each subagent has a distinct change at distinct change_id (`subagent N` — `octopus.ts:215`); agents squash into THEIR OWN `@-`, never into a shared ancestor. The only operations touching shared ancestors (`createPhaseStructure`, `fanIn`'s N-parent `jj new`, main-bookmark advance) all execute in single orchestrator-side processes — no inter-process contention exists. Pitfall 1's "concurrent squash against shared ancestor diverges" assumed a topology that v1.3 doesn't create. Cascade: REQUIREMENTS.md PARALLEL-04 entry deletes; `sdk/src/vcs/jj/lock.ts` is NOT extended; no `.jj/repo/gsd-parallel-lock` sentinel. The existing per-workspace `acquireJjWriteLock` stays unchanged.
- **D-03 (TEST-14 reframed):** `jj log -r 'divergent()' --no-graph` post-fanIn-must-be-empty stays as a topology assertion — proof that the octopus structure produces non-divergent change_ids, NOT proof of lock effectiveness. If TEST-14 ever fails in CI, that's the signal to revisit D-02 (preemptive lock would be one fix); it is not preemptive defense.

### fanIn signature + Handle shape

- **D-04:** Signature locked at `fanIn(handle, results): FanInResult` (two args). Honors REQUIREMENTS PARALLEL-02 normative wording; rejects ARCHITECTURE.md's one-arg `fanIn(wave)` draft (v1.2-era exploration, predates the requirements lock).
- **D-05:** `ParallelDispatchHandle` is frozen pure JSON data — `Object.freeze` on return; no closures, methods, Symbols, or class instances. Survives `gsd-sdk query` JSON serialization round-trip cleanly. Rejects callable-handle Option C (would require carving a JSON-serialization escape hatch into the SDK CLI surface).
- **D-06:** Handle field set: `{ phaseRoot, workspaces: [{ name, path, baseRev, agentId, baselineOpId? }], manifest, phaseNumber, mainBookmark }`. No `lockToken` (D-02 dropped the lock). `baselineOpId` field reserved on workspaces[] but unused under D-01; planner may omit if D-01 also removes future liveness re-introduction; recommend keeping as documented-undefined-for-now for forward-compat.
- **D-07:** Results-arg shape: `Array<{ agentId: string, exitCode: number, lastChangeId?: string, stderr?: string }>`. Locked in Phase 9 with same-PR coupling to Phase 10 git-side (cross-backend FanInResult contract). `lastChangeId` is optional — crash-recovery via reap already handles "no clean final commit."
- **D-08:** `FanInResult` shape: `{ merged: ChangeId[], conflicted: boolean, conflictedPaths: string[], incompleteQueued: number, failedReaped: string[], surplusBookmarks: string[] }`. No `liveWorkspaces`. No `partial`. `conflicted: boolean` distinguishes "in-tree-conflict-success" from "crash" (Pitfall 2 surface that survives D-01/D-02 dropping).

### Reap classifier extension

- **D-09:** `IncompleteWorkEntry.reason` extends from 1 → 2 values: `'crashed-with-uncommitted-work'` (existing) + `'merge-in-tree-conflict'` (new). NOT 1 → 3 — `'partial-wave-live-workspace'` is dropped because D-01 drops the liveness probe entirely. REQUIREMENTS SC4 (Phase 10) text "extended from 1 → 3 values" needs amending to "1 → 2 values."
- **D-10:** Enum extension + jj-side conflict probe land in **Phase 9, in `sdk/src/vcs/jj/reap.ts`** (Option A from the comparison table). Reap.ts is already cross-backend by import — it's the natural single source of truth for incomplete-work classification. Phase 10 only adds the git-side producer (parses `git merge` exit code + `git diff --name-only --diff-filter=U`). Dead git-side enum branch in main between Phases 9 and 10 is contained: the D-14 phase-merge gate treats unknown reasons as fail-safe block.
- **D-11:** jj-side conflict probe form: `jj log -r 'conflicts()' --no-graph -T 'change_id ++ "\n"'` scoped to the merge change. Existing `vcs.refs.conflicts()` (Phase 3 CONFLICT-01..03) revset infrastructure is the substrate — reuse, do not re-implement.

### Sidecar discipline (carried forward — not re-decided)

- **D-12 (carry):** `sdk/src/vcs/jj/parallel.ts` does NOT import from `backends/jj.ts`. Inline `jjArgvFlags` like `octopus.ts:45` and `lock.ts:62`. UPSTREAM-02 zero-conflict-surface convention.
- **D-13 (carry):** Squash-only commit model; never `--ignore-working-copy` (`project_squash_model` memory). The conflict probe MUST use `--ignore-working-copy --at-op=@` to avoid mutating op log mid-fanIn. (Actually only the no-op-mutation flag matters here — the probe is a read, not a write.)
- **D-14 (carry):** change_id-only on cross-backend surface. `ParallelDispatchHandle.workspaces[].baseRev` JSDoc per PARALLEL-05: "change_id on jj; stable across `jj rebase`. commit_id on git; stable across `git rebase`. Cross-backend semantics: rebase-stable revision pointer to the parent change the workspace forked from." This satisfies the v1.2 unified revision model invariant (`scripts/lint-vcs-no-commit-id.cjs` enforces).

### Test pattern (carried forward)

- **D-15 (carry):** Vitest Pattern A — `describe.sequential.skipIf(!jjAvailable)` for cross-backend contract tests. Pattern B (random-prefix `mkdtemp`) for parallel-* fixture files per Pitfall 9. Never `retry: N`; never `describe.skip`.
- **D-16:** TEST-13 jj contract test scenarios (per ROADMAP SC1 + SC2): N=2, N=3, N=4 dispatch; clean fan-in; fan-in with one in-tree-conflict (asserts `conflicted: true` + `conflictedPaths` populated + `IncompleteWorkEntry.reason === 'merge-in-tree-conflict'` queued); fan-in with one crashed worker (asserts `reason === 'crashed-with-uncommitted-work'`). TEST-14 asserts `divergent()` revset empty post-fanIn for all N in {2,3,4}.

### Claude's Discretion

- `sdk/src/vcs/types.ts` exact placement of `VcsWorkspaceParallel` interface within the file (planner choice — likely alongside `VcsWorkspace` at line 392+ per ARCHITECTURE.md Integration #1).
- Field-ordering inside `ParallelDispatchHandle` and `FanInResult` (planner choice — semantic ordering for readability).
- Whether `baselineOpId` survives D-01 dropping. Recommend keeping as documented "reserved; populated for forward-compat with future re-introduced liveness probe." Planner may strip if it adds noise.
- Exact wording of the new `IncompleteWorkEntry.reason` JSDoc enum.
- Test-fixture mechanism for forcing in-tree-conflict (planner choice — likely a pre-arranged file with conflicting content per workspace, then octopus-merge).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project framing + requirements

- `.planning/PROJECT.md` — v1.3 milestone framing; lift-and-collapse posture; unified revision model invariant.
- `.planning/REQUIREMENTS.md` §"Cross-backend parallel-dispatch verbs (PARALLEL)" — PARALLEL-01, PARALLEL-02, PARALLEL-05 are normative for Phase 9. **PARALLEL-03 and PARALLEL-04 are DROPPED per D-01 / D-02** — REQUIREMENTS.md needs amending before planner reads it as authoritative.
- `.planning/REQUIREMENTS.md` §"Backend implementations (VCS)" — VCS-16 (interface), VCS-17 (`sdk/src/vcs/jj/parallel.ts` composition), VCS-19 (manifest extension).
- `.planning/REQUIREMENTS.md` §"Test infrastructure (TEST)" — TEST-13 (jj contract tests), TEST-14 (`divergent()` revset assertion — reframed per D-03).
- `.planning/ROADMAP.md` §"Phase 9: jj-side parallel verbs + repo-scoped lock" — Success Criteria 1, 2, 5 still apply. **SC3 (acquireJjRepoLock contention test) DROPPED per D-02. SC1/SC2 clauses "under the repo-scoped lock" should be amended to remove the lock reference.**
- `.planning/STATE.md` §"Decisions" + §"Blockers/Concerns" — Pitfall 1 + Pitfall 3 references should be marked CHALLENGED/SUPERSEDED-BY-09-CONTEXT in a follow-up STATE update.

### Research

- `.planning/research/PITFALLS.md` §"Pitfall 1" — original "concurrent jj squash diverges" concern. **Phase 9 discuss-phase rejected the premise** (D-02). Pitfall 1's "shared-ancestor concurrent-squash" topology is not what `octopus.ts:215` creates. Pitfall stays in research for historical context; downstream agents should NOT treat it as live.
- `.planning/research/PITFALLS.md` §"Pitfall 2" — in-tree-conflict probe. Survives — `FanInResult.conflicted: boolean` lands per D-08.
- `.planning/research/PITFALLS.md` §"Pitfall 3" — partial-wave failure / liveness probe. **Phase 9 discuss-phase rejected the premise** (D-01). The orchestrator-awaits-Agent() invariant makes this scenario impossible in production. Pitfall stays for historical context.
- `.planning/research/PITFALLS.md` §"Pitfall 5" — `.git/config.lock` race on `git worktree add`. Phase 10 concern, not Phase 9.
- `.planning/research/ARCHITECTURE.md` §"Pre-emptive corrections" — single-acknowledged-raw-git framing; reap.ts is already cross-backend by import; UPSTREAM-02 sidecar discipline.
- `.planning/research/ARCHITECTURE.md` §"Integration Point #1" — verb namespace law (`vcs.workspace.parallel.*`); proposed `VcsWorkspaceParallel` interface surface.
- `.planning/research/ARCHITECTURE.md` §"Integration Point #2" — asymmetric sidecars; `sdk/src/vcs/jj/parallel.ts` (NEW) consumed by `backends/jj.ts`.
- `.planning/research/ARCHITECTURE.md` §"Integration Point #3" — octopus.ts + reap.ts stay where they are; `jj/parallel.ts` is the composition layer.
- `.planning/research/SUMMARY.md` — executive summary; no new deps; principal risks at coordination boundary.

### SDK code references

- `sdk/src/vcs/types.ts:294-425` — existing `VcsRefs` / `VcsWorkspace` / `VcsRefsBookmarks` interfaces; precedent for `VcsWorkspaceParallel` placement.
- `sdk/src/vcs/jj/octopus.ts` — `createPhaseStructure`, `createSubagentSlot`, `createSubagentHead`. Composed by new `jj/parallel.ts::performJjParallelDispatch`. Sidecar-discipline header at lines 2-32 explains UPSTREAM-02 constraints. `octopus.ts:215` carries the `subagent N` change naming convention.
- `sdk/src/vcs/jj/reap.ts` — `performJjReap` body (lines 117+). Phase 9 extends the classifier per D-09/D-10/D-11. `isEmptyHead` probe at lines 60-69 stays.
- `sdk/src/vcs/jj/incomplete-work.ts` — `IncompleteWorkEntry` type. D-09 widens `reason` from 1 → 2 string literals.
- `sdk/src/vcs/jj/lock.ts` — existing per-workspace `acquireJjWriteLock` (lines 80+). **Not extended in Phase 9** (D-02 dropped the new repo-scoped lock).
- `sdk/src/vcs/backends/jj.ts` — JjVcsAdapter factory; `workspace.merge` body at lines 1175-1245 (consumed by `parallel.fanIn`); existing `workspace.reap` wiring at lines 1135-1157.
- `sdk/src/vcs/__tests__/` — directory layout for new `cmd-parallel-{git,jj}.test.ts` per TEST-13.
- `scripts/lint-vcs-no-commit-id.cjs` — v1.2 CI-blocking enforcer; new `parallel.ts` must pass.
- `scripts/lint-vcs-no-raw-git.cjs` + `scripts/lint-vcs-no-raw-git.allow.json` — 23 production entries. **Phase 9 adds NO new entries** (parallel.ts is TS-only, inside SDK, no raw-git invocations).

### Cross-phase coupling (informational, not Phase 9 deliverables)

- Phase 10 same-PR coupling: `FanInResult` cross-backend shape (D-08), `IncompleteWorkEntry.reason` enum value `'merge-in-tree-conflict'` (D-09/D-10) — git-side producers land in Phase 10's PR.
- Phase 12 (A3 colocated pre-commit fix) — INDEPENDENT track. Phase 9 does NOT touch `sdk/src/vcs/backends/jj.ts::commit`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`sdk/src/vcs/jj/octopus.ts::createPhaseStructure`** — orchestrator-tier helper; idempotent re-entry via `gsd/phase-{NN}-merge-marker` bookmark. `performJjParallelDispatch` calls it once per phase, then N× `createSubagentSlot` for the N workspaces.
- **`sdk/src/vcs/jj/octopus.ts::createSubagentSlot`** — inserts subagent head via `jj new -A <parent> -B <merge> -m 'subagent N' --no-edit`, then `vcs.workspace.add({...})`. Returns the workspace handle + agent-bookmark.
- **`sdk/src/vcs/jj/reap.ts::performJjReap`** — workspace.reap body (`backends/jj.ts:1135-1157`); Phase 9 extends classifier per D-09/D-10/D-11. Probe `isEmptyHead` at lines 60-69 stays untouched; new conflict probe is a sibling.
- **`sdk/src/vcs/backends/jj.ts::workspace.merge`** (lines 1175-1245) — 2-parent `jj new` with atomic main-advance + agent-bookmark delete (D-03 atomicity). `performJjParallelFanIn` lifts this to N-parent (`jj new <p1>...<pN>`) + batched bookmark delete.
- **`sdk/src/vcs/jj/incomplete-work.ts::appendIncomplete` / `readIncomplete`** — already cross-backend home for IncompleteWorkEntry. `backends/git.ts:32` already imports from here (intentional per ARCHITECTURE.md "Integration Point #3").
- **`sdk/src/vcs/jj/lock.ts::acquireJjWriteLock`** — per-workspace lock stays in place for subagent `vcs.commit` calls. Phase 9 does NOT extend this file (D-02).

### Established Patterns

- **Sidecar discipline (UPSTREAM-02):** sidecar files in `sdk/src/vcs/jj/` MUST NOT import from `backends/jj.ts`. Inline `jjArgvFlags` (`octopus.ts:45`, `lock.ts:62` show the template). `jj/parallel.ts` follows.
- **Single SDK shape law (`sdk/src/vcs/types.ts:290-321`):** every cross-`gsd-sdk query`-boundary return is pure JSON. No closures, methods, Symbols. `ParallelDispatchHandle` honors this (D-05).
- **`vcsExec` is the sole subprocess primitive.** Inline raw `spawnSync` is not allowed in adapter code. `jj/parallel.ts` calls `vcsExec` (path through `exec.ts` for `vcs.kind` + flag normalization).
- **`expr.rev(...)` for revset literals** — already in use in `octopus.ts:36`; new code uses it for revision parameters.
- **`workspace_name` template keyword** — added in jj 0.40; available for op log scoping if liveness ever re-introduced.

### Integration Points

- **`sdk/src/vcs/types.ts`** — new `VcsWorkspaceParallel` interface adjacent to `VcsWorkspace` (line 392+ region). New types: `ParallelDispatchOpts`, `ParallelDispatchHandle`, `ParallelAgentResult`, `FanInResult`.
- **`sdk/src/vcs/jj/parallel.ts`** (NEW FILE) — `performJjParallelDispatch(opts): ParallelDispatchHandle` + `performJjParallelFanIn(handle, results): FanInResult`. Pure functions. Composes octopus.ts + reap.ts + workspace.merge via `vcsExec`.
- **`sdk/src/vcs/backends/jj.ts`** — adapter factory; wire new `workspace.parallel = Object.freeze({ dispatch, fanIn })`. Imports `jj/parallel.ts` per `import { performJjReap } from '../jj/reap.js'` pattern at line 33.
- **`sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts`** (NEW) — TEST-13 jj contract; Pattern A `describe.sequential.skipIf(!jjAvailable)`. Pattern B `mkdtemp` for fixture isolation.
- **`bin/lib/worktree-safety.cjs`** — `WAVE_WORKTREE_MANIFEST` writer; manifest extension fields (`plan_id`, `agent_id`, `backend`) per VCS-19 are backwards-compatible (existing reader at worktree-safety.cjs ignores unknown fields).

</code_context>

<specifics>
## Specific Ideas

- **TEST-14 reframed (D-03):** `jj log -r 'divergent()' --no-graph` post-fanIn must be empty — this is a **topology assertion**, not a lock-effectiveness assertion. It proves the octopus structure (`createPhaseStructure` + N `createSubagentSlot` + N-parent `jj new`) produces non-divergent change_ids. If it ever fails in CI, the response is to investigate the topology, not to add a lock.
- **Naming follows existing convention:** workspace names are `phase-{NN}-subagent-{idx}` (zero-padded per `octopus.ts:30`, D-04 invariant). Agent bookmarks are `gsd/phase-{NN}-subagent-{idx}`.
- **Pre-emptive correction (from ARCHITECTURE.md):** Phase 9 does NOT touch `lint-vcs-no-raw-git.allow.json`. The 23 production entries stay; no entries are added (parallel.ts is TS-only). Phase 10 may add ONE entry for `sdk/src/vcs/git/parallel.ts` (its own decision, not Phase 9's).
- **REQUIREMENTS.md needs amending** before planner reads it as authoritative: drop PARALLEL-03 + PARALLEL-04; amend PARALLEL-02 enum count from "1 → 3" to "1 → 2"; rename "+ repo-scoped lock" out of Phase 9 title. Recommend doing this as a small `docs(09)` commit immediately after this CONTEXT.md lands and BEFORE `/gsd-plan-phase 9` runs.

</specifics>

<deferred>
## Deferred Ideas

- **Re-introducing `acquireJjRepoLock` as defense-in-depth** — Deferred. If a future topology change creates a shared-ancestor concurrent-mutation pattern (currently impossible in octopus form), revisit. The infrastructure to add it (sibling function in `lock.ts`, sentinel under `.jj/repo/`, PID-liveness recovery via `process.kill(pid, 0)`) is well-understood — adding it later is cheap if needed.
- **Liveness probe (`partial: true, liveWorkspaces[]`)** — Deferred to v1.4+ IF dogfood (Phase 14) reveals a crash-recovery scenario where the orchestrator needs to fanIn against partially-active workspaces. Today the orchestrator-awaits-Agent() contract makes this impossible.
- **`baselineOpId` per workspace in handle** — Marked Claude's-Discretion (D-06). Planner may include as forward-compat reservation or strip as YAGNI noise.
- **`vcs.workspace.parallel.cancel(handle)` mid-execution graceful abandonment** — already in REQUIREMENTS.md "Out of Scope" / STATE.md "Deferred Items"; surfaces from dogfood (Phase 14) if needed; not a Phase 9 concern.
- **Hook idempotency audit (HOOK-07 sub-clause)** — Phase 12 concern (A3 fix path choice). Not Phase 9.

</deferred>

---

*Phase: 9-jj-side-parallel-verbs*
*Context gathered: 2026-05-15*
