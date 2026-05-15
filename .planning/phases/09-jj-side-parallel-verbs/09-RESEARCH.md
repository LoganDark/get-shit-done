# Phase 9: jj-side parallel verbs — Research

**Researched:** 2026-05-15
**Domain:** jj backend composition layer (TS-only sidecar) — types, octopus topology, reap classifier extension, contract tests
**Confidence:** HIGH (all findings verified against in-tree code with file:line citations; jj 0.41 revset functions verified against local `jj help -k revsets`)

## Summary

Phase 9 is a **composition layer**, not new primitives. Every building block already exists in-tree:

- `sdk/src/vcs/jj/octopus.ts` ships `createPhaseStructure` + `createSubagentSlot` + `createSubagentHead` (Phase 4 plan 05).
- `sdk/src/vcs/jj/reap.ts` ships `performJjReap` with the existing `'crashed-with-uncommitted-work'` reason emitter (Phase 4 plan 04).
- `sdk/src/vcs/backends/jj.ts:1175-1245` ships the 2-parent `workspace.merge` that fanIn lifts to N-parent.
- `sdk/src/vcs/backends/jj.ts:580-603` ships `findConflicts({scope})` using the `conflicts()` jj 0.41 revset — the substrate D-11 reuses for the in-tree-conflict probe.
- `IncompleteWorkEntry.reason` is currently typed `string` (types.ts:246) — D-09's "widen 1→2" requires **tightening** to a string-literal union, not loosening.

The composition file `sdk/src/vcs/jj/parallel.ts` is net-new. It exports two pure functions, `performJjParallelDispatch(opts)` and `performJjParallelFanIn(handle, results)`, both returning frozen pure-JSON data. `backends/jj.ts` wires them into `workspace.parallel = Object.freeze({ dispatch, fanIn })`. Types (`VcsWorkspaceParallel`, `ParallelDispatchHandle`, `ParallelAgentResult`, `FanInResult`) land in `sdk/src/vcs/types.ts` adjacent to `VcsWorkspace` at line 392. The cross-backend interface gets a git-side stub that throws `VcsNotImplementedError` to satisfy `VcsAdapterCommon` until Phase 10 ships the body (same-PR coupling applies to the type contract, not necessarily the implementation in the same commit).

**Primary recommendation:** Treat Phase 9 as wiring + a single new TS file. No new SDK primitives, no new revset functions, no new vcsExec patterns — every move composes existing infrastructure. The non-trivial work is (a) extending `IncompleteWorkEntry.reason` from a free-form `string` to a string-literal union without breaking existing readers and writers, (b) wiring the conflict probe inside `performJjReap`'s existing branch structure, and (c) the test-fixture mechanism for forcing an in-tree conflict on an N-parent octopus merge.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Concurrency model — challenged premises, scope reduced**

- **D-01 (PARALLEL-03 DROPPED):** No liveness probe. The orchestrator awaits all `Agent()` promise resolutions before calling `vcs.workspace.parallel.fanIn`; when an Agent() resolves, that subagent's Node process has exited. There is no production scenario where fanIn fires while a workspace is mid-write. `FanInResult` does NOT carry `liveWorkspaces` / `partial: true` fields.
- **D-02 (PARALLEL-04 DROPPED):** No `acquireJjRepoLock`. jj is lock-free by design. In `octopus.ts`'s topology, each subagent has a distinct change at distinct change_id; agents squash into THEIR OWN `@-`, never into a shared ancestor. The only operations touching shared ancestors (`createPhaseStructure`, `fanIn`'s N-parent `jj new`, main-bookmark advance) all execute in single orchestrator-side processes — no inter-process contention exists. `sdk/src/vcs/jj/lock.ts` is NOT extended; no `.jj/repo/gsd-parallel-lock` sentinel. Existing per-workspace `acquireJjWriteLock` stays unchanged.
- **D-03 (TEST-14 reframed):** `jj log -r 'divergent()' --no-graph` post-fanIn-must-be-empty stays as a **topology assertion** — proof that the octopus structure produces non-divergent change_ids, NOT proof of lock effectiveness.

**fanIn signature + Handle shape**

- **D-04:** Signature locked at `fanIn(handle, results): FanInResult` (two args). Honors REQUIREMENTS PARALLEL-02 normative wording.
- **D-05:** `ParallelDispatchHandle` is frozen pure JSON data — `Object.freeze` on return; no closures, methods, Symbols, or class instances. Survives `gsd-sdk query` JSON serialization round-trip cleanly.
- **D-06:** Handle field set: `{ phaseRoot, workspaces: [{ name, path, baseRev, agentId, baselineOpId? }], manifest, phaseNumber, mainBookmark }`. No `lockToken`. `baselineOpId` reserved as documented-undefined-for-now for forward-compat.
- **D-07:** Results-arg shape: `Array<{ agentId: string, exitCode: number, lastChangeId?: string, stderr?: string }>`. Locked in Phase 9 with same-PR coupling to Phase 10 git-side.
- **D-08:** `FanInResult` shape: `{ merged: ChangeId[], conflicted: boolean, conflictedPaths: string[], incompleteQueued: number, failedReaped: string[], surplusBookmarks: string[] }`. No `liveWorkspaces`. No `partial`. `conflicted: boolean` distinguishes in-tree-conflict-success from crash.

**Reap classifier extension**

- **D-09:** `IncompleteWorkEntry.reason` extends from 1 → 2 values: `'crashed-with-uncommitted-work'` (existing) + `'merge-in-tree-conflict'` (new). NOT 1 → 3.
- **D-10:** Enum extension + jj-side conflict probe land in **Phase 9, in `sdk/src/vcs/jj/reap.ts`** (Option A). Phase 10 only adds the git-side producer.
- **D-11:** jj-side conflict probe form: `jj log -r 'conflicts()' --no-graph -T 'change_id ++ "\n"'` scoped to the merge change. Existing `vcs.findConflicts()` (Phase 3 CONFLICT-01..03) revset infrastructure is the substrate — reuse, do not re-implement.

**Sidecar discipline (carry-forward)**

- **D-12:** `sdk/src/vcs/jj/parallel.ts` does NOT import from `backends/jj.ts`. Inline `jjArgvFlags` like `octopus.ts:45` and `lock.ts:62`. UPSTREAM-02 zero-conflict-surface convention.
- **D-13:** Squash-only commit model; never `--ignore-working-copy`. (The conflict probe is a read — does not need the no-op-mutation flag.)
- **D-14:** change_id-only on cross-backend surface. `ParallelDispatchHandle.workspaces[].baseRev` JSDoc per PARALLEL-05: "change_id on jj; stable across `jj rebase`. commit_id on git; stable across `git rebase`. Cross-backend semantics: rebase-stable revision pointer to the parent change the workspace forked from." `scripts/lint-vcs-no-commit-id.cjs` enforces.

**Test pattern (carry-forward)**

- **D-15:** Vitest Pattern A — `describe.sequential.skipIf(!jjAvailable)` for cross-backend contract tests. Pattern B (random-prefix `mkdtemp`) for parallel-* fixture files. Never `retry: N`; never `describe.skip`.
- **D-16:** TEST-13 jj contract test scenarios: N=2, N=3, N=4 dispatch; clean fan-in; fan-in with one in-tree-conflict (asserts `conflicted: true` + `conflictedPaths` populated + `IncompleteWorkEntry.reason === 'merge-in-tree-conflict'` queued); fan-in with one crashed worker. TEST-14 asserts `divergent()` revset empty post-fanIn for all N in {2,3,4}.

### Claude's Discretion

- `sdk/src/vcs/types.ts` exact placement of `VcsWorkspaceParallel` interface within the file.
- Field-ordering inside `ParallelDispatchHandle` and `FanInResult`.
- Whether `baselineOpId` survives D-01 dropping. Recommend keeping as documented "reserved; populated for forward-compat with future re-introduced liveness probe."
- Exact wording of the new `IncompleteWorkEntry.reason` JSDoc enum.
- Test-fixture mechanism for forcing in-tree-conflict (planner choice — likely a pre-arranged file with conflicting content per workspace, then octopus-merge).

### Deferred Ideas (OUT OF SCOPE)

- Re-introducing `acquireJjRepoLock` as defense-in-depth.
- Liveness probe (`partial: true, liveWorkspaces[]`) — deferred to v1.4+ if dogfood reveals need.
- `vcs.workspace.parallel.cancel(handle)` mid-execution graceful abandonment.
- Hook idempotency audit (HOOK-07 sub-clause) — Phase 12 concern.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **PARALLEL-01 (jj-side)** | `vcs.workspace.parallel.dispatch(plan): ParallelDispatchHandle` ships on jj. Composes `octopus.createPhaseStructure` + N× `createSubagentSlot`. | See §"Existing Primitives Map" — `octopus.ts:102-189` ships `createPhaseStructure`; `octopus.ts:280-324` ships `createSubagentSlot`. Composition target: `performJjParallelDispatch(opts)` in new `jj/parallel.ts`. |
| **PARALLEL-02 (jj-side)** | `vcs.workspace.parallel.fanIn(handle, results): FanInResult` ships on jj. Uses one N-parent `jj new <p1>...<pN>` octopus form + batched `jj bookmark delete`. | See §"N-parent Octopus Merge" — extend the 2-parent shape at `backends/jj.ts:1180-1188` to N parents. `findConflicts({scope:'working-copy'})` probe at `:1199` already classifies conflicts correctly. |
| **PARALLEL-05** | `ParallelDispatchHandle.workspaces[].baseRev` JSDoc documents stability semantics across `jj rebase`. | See §"change_id Stability" — change_ids are stable across `jj rebase` by jj's design; commit_ids are not. Document inline on the handle's `baseRev` field per D-14 wording. |
| **VCS-16** | New `VcsWorkspaceParallel` interface in `sdk/src/vcs/types.ts`. | See §"Cross-Backend Interface Surface" — lives adjacent to `VcsWorkspace` at line 392; mirrors `VcsBookmarks` sub-namespace pattern. Git-side stub throws `VcsNotImplementedError` until Phase 10. |
| **VCS-17** | New `sdk/src/vcs/jj/parallel.ts` composition layer; sidecar discipline. | See §"Sidecar Discipline" — inline `jjArgvFlags` per `octopus.ts:45` / `lock.ts:62` template; import `vcsExec` from `../exec.js`, `expr` from `../expr.js`, types from `../types.js`. NO import from `backends/jj.ts`. |
| **VCS-19** | `WAVE_WORKTREE_MANIFEST` extends with `plan_id`, `agent_id`, `backend`. Backwards-compatible. | See §"Manifest Schema Extension" — current reader at `get-shit-done/bin/lib/worktree-safety.cjs:319-342` (`normalizeCleanupManifestEntry`) already preserves unknown fields. `agent_id` ALREADY exists (line 336). Net-new: `plan_id`, `backend`. |
| **TEST-13 (jj)** | jj contract tests at `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts`. | See §"Test Fixture Patterns" — Pattern A (`describe.sequential.skipIf(!jjAvailable)`) per `jj-octopus.test.ts:45`; Pattern B random-prefix `mkdtemp` per same file:54. |
| **TEST-14** | `jj log -r 'divergent()' --no-graph` empty post-fanIn for N ∈ {2,3,4}. | See §"divergent() Revset" — verified real jj 0.41 revset function via local `jj help -k revsets`. No prior `divergent()` usage in codebase — fresh assertion. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Cross-backend `parallel.dispatch` / `parallel.fanIn` verb declaration | SDK adapter interface (`types.ts`) | — | `VcsAdapterCommon` owns the cross-backend contract; both backends satisfy it. |
| jj-side composition (octopus structure + N-parent fanIn + reap wiring) | SDK adapter body (`vcs/jj/parallel.ts`) | — | UPSTREAM-02 sidecar; orchestrator-tier coordination expressed as pure functions over `vcsExec` + existing primitives. |
| In-tree-conflict classification | SDK adapter sidecar (`vcs/jj/reap.ts`) | — | Reap is the single cross-backend home for `IncompleteWorkEntry` writes; git backend already imports from here (`backends/git.ts:32`). |
| Workspace manifest writing | Orchestrator workflow (currently `execute-phase.md`) | SDK (`parallel.dispatch`) writes new shape | Phase 9 ships the writer-side schema; Phase 11 deletes the workflow-markdown writer. |
| Test fixtures (`divergent()`, in-tree conflict) | SDK tests (`__tests__/`) | — | Vitest contract tests; shared `vcs-fixture.ts` infrastructure. |
| Pre-flight `parallelization` config check | NOT in Phase 9 | Phase 14 (CONFIG-02) | Configuration gate is a Phase 14 deliverable per ROADMAP. |

## Standard Stack

### Core (already in-tree)

| Component | File / Symbol | Purpose | [VERIFIED] |
|-----------|---------------|---------|------------|
| `createPhaseStructure` | `sdk/src/vcs/jj/octopus.ts:102-189` | Lazy parent+merge slot creation; idempotent via marker bookmarks. | [VERIFIED: code read] |
| `createSubagentSlot` | `sdk/src/vcs/jj/octopus.ts:280-324` | Inserts subagent head + creates workspace. Returns `{ headChange, workspaceName, workspacePath }`. | [VERIFIED: code read] |
| `createSubagentHead` | `sdk/src/vcs/jj/octopus.ts:206-266` | Lower-level head insertion; `createSubagentSlot` consumes. | [VERIFIED: code read] |
| `performJjReap` | `sdk/src/vcs/jj/reap.ts:117-198` | Empty-head probe + abandon-or-queue. Phase 9 extends classifier between the existing `empty?` and `else` branches. | [VERIFIED: code read] |
| `appendIncomplete` / `readIncomplete` | `sdk/src/vcs/jj/incomplete-work.ts:36-78` | Markdown queue file writer/reader; line format `- {name}: head=…, workspace=…, reason=…`. | [VERIFIED: code read] |
| `findConflicts({scope})` | `sdk/src/vcs/backends/jj.ts:580-603` | Uses `conflicts()` revset (PLURAL); calls `enumerateConflictedPaths(rev)`. The substrate for D-11. | [VERIFIED: code read] |
| `workspace.merge` (2-parent) | `sdk/src/vcs/backends/jj.ts:1175-1245` | Atomic 2-parent merge + main-advance + agent-bookmark delete under `acquireJjWriteLock`. Phase 9 fanIn lifts to N-parent — does NOT call this directly. | [VERIFIED: code read] |
| `vcsExec` | `sdk/src/vcs/exec.ts` | Sole subprocess primitive. Inline `spawnSync` is forbidden in adapter code. | [CITED: CONTEXT D-12] |
| `expr.rev(id)` | `sdk/src/vcs/expr.ts:90-95` | The only legitimate way to wrap a runtime change_id string into a `RevisionExpr`. | [VERIFIED: code read] |

### Net-New Files

| File | Purpose | LoC estimate |
|------|---------|--------------|
| `sdk/src/vcs/jj/parallel.ts` | Composition layer: `performJjParallelDispatch` + `performJjParallelFanIn`. | ~200-300 |
| `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts` | TEST-13 jj contract + TEST-14 `divergent()` assertion. | ~300-400 |

### Net-New Types in `types.ts`

| Type | Purpose | Cross-backend |
|------|---------|---------------|
| `VcsWorkspaceParallel` | Interface adding `dispatch` + `fanIn`. Lives under `VcsWorkspace.parallel` (sub-sub-namespace). | Yes — both backends satisfy. |
| `ParallelDispatchOpts` | Input to `dispatch`: `{ plan, maxConcurrency? }`. | Yes. |
| `ParallelDispatchHandle` | D-06 shape. Frozen JSON. | Yes. |
| `ParallelAgentResult` | D-07 shape: `{ agentId, exitCode, lastChangeId?, stderr? }`. | Yes. |
| `FanInResult` | D-08 shape: `{ merged, conflicted, conflictedPaths, incompleteQueued, failedReaped, surplusBookmarks }`. | Yes. |

### Type Tightening (existing type)

| Type | Current shape | Phase 9 shape | Risk |
|------|---------------|---------------|------|
| `IncompleteWorkEntry.reason` (`types.ts:246`) | `string` (free-form) | `'crashed-with-uncommitted-work' \| 'merge-in-tree-conflict'` (string-literal union) | Existing writer `reap.ts:187` already emits a literal `'crashed-with-uncommitted-work'` — no migration. Existing reader `incomplete-work.ts:75` does `m[4].trim()` and shoves into `reason` field — will widen to `as IncompleteWorkEntry['reason']` cast; planner must decide whether to validate parse-time. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff | Rejection reason |
|------------|-----------|----------|------------------|
| Composition layer in `jj/parallel.ts` | Inline in `backends/jj.ts` | Fewer files | UPSTREAM-02 sidecar discipline; backends/jj.ts is the upstream-merge conflict surface. |
| String-literal union for `reason` | Keep as `string` | Less restrictive | D-09 invariant: enum is closed; phase-merge gate at `D-14` (`backends/jj.ts:182-194`) treats unknown reasons fail-safe. |
| Call `workspace.merge` N times sequentially in fanIn | One verb, simpler | Defeats the parallelism; produces N 2-parent merges instead of one N-parent octopus. | PITFALLS.md Pitfall 4: octopus form is invariant, not optimization. |
| New SDK verb `vcs.refs.conflicts()` | Cleaner API | Net-new surface for no caller | D-11: reuse `findConflicts({scope})` — the existing substrate. |

**Installation:** None. No new npm dependencies; no new system tools. Pure TS composition over existing primitives.

## Package Legitimacy Audit

> Not applicable — Phase 9 installs no external packages.

## Existing Primitives Map

This section is the load-bearing "read the code" output requested by the upstream prompt. Every cited line is verified by direct file read.

### `sdk/src/vcs/jj/octopus.ts`

```typescript
// File header (lines 39-47): sidecar discipline template
function jjArgvFlags(repo: string): string[] {
    return ['--repository', repo, '--no-pager', '--color', 'never', '--quiet'];
}

// Lines 68-79: PhaseStructureResult
export interface PhaseStructureResult {
    parentChange: string;  // change_id of parent slot
    mergeChange: string;   // change_id of merge slot
    created: boolean;      // true on first call, false on idempotent re-entry
}

// Line 102: signature
export function createPhaseStructure(
    mainRepoRoot: string,
    parentRevset: string,
    phaseNum: number,
): PhaseStructureResult

// Lines 108-109: marker bookmark naming convention
const mergeMarkerBookmark = `gsd/phase-${phaseTag}-merge-marker`;
const parentMarkerBookmark = `gsd/phase-${phaseTag}-parent-marker`;

// Line 280: signature
export function createSubagentSlot(
    mainRepoRoot: string,
    vcs: { workspace: { add(input: WorkspaceAdd): unknown } },
    opts: {
        parentChange: string;
        mergeChange: string;
        idx: number;
        phaseNum: number;
        workspacePath?: string;
    },
): { headChange: string; workspaceName: string; workspacePath: string }

// Line 300-302: naming + path defaults
const workspaceName = `phase-${phaseTag}-subagent-${opts.idx}`;
const workspacePath = opts.workspacePath ?? join(mainRepoRoot, '.claude/jj-workspaces', workspaceName);
```

**Key invariants** (from header at `octopus.ts:1-32`):

- Workspace names are `phase-{NN}-subagent-{idx}` (zero-padded phase number per D-04).
- Marker bookmarks are `gsd/phase-{NN}-merge-marker` + `gsd/phase-{NN}-parent-marker`.
- All `jj new` invocations use `--no-edit` (WS-10) — orchestrator's `@` is never edited.
- `createPhaseStructure` is **idempotent** via the marker bookmarks — re-entry returns `created: false`.

**What's missing for Phase 9:**

- Agent-bookmark creation per subagent (e.g. `gsd/phase-{NN}-subagent-{idx}`). `createSubagentSlot` does NOT create an agent bookmark today. fanIn's "batched bookmark delete" implies agents commit *to* a bookmark — Phase 9 `performJjParallelDispatch` must either (a) create agent bookmarks at dispatch time so subagent `vcs.commit` calls advance them, or (b) defer bookmark creation to the subagent's first `vcs.commit`. **Recommendation:** option (a), eager creation at dispatch — gives fanIn a deterministic delete list and matches the git-side `worktree-agent-*` branch convention.

### `sdk/src/vcs/jj/reap.ts`

```typescript
// Lines 117-198: performJjReap body
export function performJjReap(opts: PerformJjReapOpts): ReapResult {
    const abandoned: { name: string; changeId: string; path: string }[] = [];
    const incomplete: IncompleteWorkEntry[] = [];
    for (const entry of opts.entries) {
        if (!entry.name.startsWith(opts.phaseNamePrefix)) continue;
        const parent = parentOf(opts.mainRepoRoot, entry.headChange);
        const empty = isEmptyHead(opts.mainRepoRoot, parent, entry.headChange);
        if (empty) {
            // abandon + forget + rm (lines 132-159)
        } else {
            // CURRENT classifier emits 'crashed-with-uncommitted-work' for ALL non-empty heads
            // (line 187). Phase 9 inserts conflict-probe BEFORE this branch.
            const queueEntry: IncompleteWorkEntry = {
                subagentName: entry.name,
                changeIdShort: entry.headChange.slice(0, 8),
                workspacePath: entry.path,
                reason: 'crashed-with-uncommitted-work',
            };
        }
    }
    return { abandoned, incomplete };
}
```

**Phase 9 insertion point:** between line 130 (`const empty = isEmptyHead(...)`) and line 131 (`if (empty)`). New ordering:

```
if (empty)         → abandon + forget + rm        (unchanged)
else if (conflict) → squash as incomplete, reason='merge-in-tree-conflict'  (NEW)
else               → squash as incomplete, reason='crashed-with-uncommitted-work'  (existing branch at lines 160-194)
```

The conflict probe is a new helper modeled on `isEmptyHead` (`reap.ts:54-70`):

```typescript
function hasInTreeConflict(mainRepoRoot: string, headChange: string): boolean {
    const args = [
        ...jjArgvFlags(mainRepoRoot),
        'log', '-r', `conflicts() & ${headChange}`,
        '-T', 'change_id ++ "\n"', '--no-graph',
    ];
    const r = vcsExec(mainRepoRoot, 'jj', args);
    if (r.exitCode !== 0) {
        throw new Error(`reap: conflict probe failed: ${r.stderr || r.stdout}`);
    }
    return r.stdout.trim().length > 0;
}
```

**Note on conflicted-paths enumeration:** if the conflict-classifier path also needs to enumerate the conflicted paths (to populate `IncompleteWorkEntry` or surface in `FanInResult.conflictedPaths`), reuse `enumerateConflictedPaths(rev)` from `backends/jj.ts` — but that lives in the backend file and importing from there violates UPSTREAM-02. **Recommendation:** inline a minimal `jj resolve --list -r <rev>` invocation in `reap.ts`, matching the sidecar-discipline pattern. (Or: extract `enumerateConflictedPaths` into `vcs/jj/conflict-paths.ts` as part of Phase 9 — preserves sidecar discipline AND DRY.)

### `sdk/src/vcs/backends/jj.ts::workspace.merge` (lines 1175-1245)

The 2-parent shape. Phase 9 fanIn does **not** call this — it inlines an N-parent variant in `jj/parallel.ts`:

```
1. jj new -r @ -r <p1> -r <p2> ... -r <pN> -m "phase N merge: N parents"
2. resolve change_id of new @ via `jj log -r @ -T 'change_id ++ "\n"' --no-graph -n 1`
3. findConflicts({scope: 'working-copy'}) — populates FanInResult.conflicted + conflictedPaths
4. if !conflicted: jj bookmark set <mainBookmark> -r @
5. if !conflicted: jj bookmark delete -- <agentBookmark-1> <agentBookmark-2> ... <agentBookmark-N>  (one invocation, batched)
```

D-08 mandates `surplusBookmarks` is populated post-step-5 by re-listing `gsd/phase-{NN}-subagent-*` bookmarks and asserting none survived.

**No write-lock needed in Phase 9 fanIn** (per D-02). The lock at `backends/jj.ts:1176` (`acquireJjWriteLock(cwd, ...)`) on 2-parent merge is per-workspace; the N-parent fanIn runs in a single orchestrator-side process and does not contend.

### `sdk/src/vcs/jj/incomplete-work.ts`

```typescript
// Line 22-23: import shape
import type { IncompleteWorkEntry } from '../types.js';

// Line 36-39: appendIncomplete writes a single line
const line = `- ${entry.subagentName}: head=${entry.changeIdShort}, workspace=${entry.workspacePath}, reason=${entry.reason}\n`;

// Line 59: ENTRY_RE regex
const ENTRY_RE = /^\s*-\s+([^:]+):\s+head=([^,]+),\s+workspace=([^,]+),\s+reason=(.*)$/;

// Line 71-76: reader output
entries.push({
    subagentName: m[1].trim(),
    changeIdShort: m[2].trim(),
    workspacePath: m[3].trim(),
    reason: m[4].trim(),  // free-form string today
});
```

**Phase 9 risk:** if `IncompleteWorkEntry.reason` is tightened to a literal union, the reader's `m[4].trim()` becomes a string that needs validation before assigning to `reason`. **Recommendation:** add a parser-side check that throws on unknown reason (consistent with `incomplete-work.ts:66-68` malformed-line policy). This makes the D-14 phase-merge gate (`backends/jj.ts:182-194`, `backends/git.ts:121-138`) fail-safe — unknown reason = blocked.

## Architecture Patterns

### System Architecture Diagram

```
                              orchestrator (long-lived Node process)
                                              │
                                              ▼
              gsd-sdk query workspace.parallel.dispatch {plan,maxConcurrency?}
                                              │
                          ┌───────────────────┴────────────────────┐
                          ▼                                        ▼
              createJjAdapter(repoRoot)              jj/parallel.ts: performJjParallelDispatch
                          │                                        │
                          │           ┌────────────────────────────┼────────────────────────────┐
                          │           ▼                            ▼                            ▼
                          │  octopus.createPhaseStructure    N× createSubagentSlot      write WAVE_WORKTREE_MANIFEST
                          │   (idempotent via markers)       (head + workspace.add)      (plan_id, agent_id, backend)
                          │           │                            │                            │
                          │     parent + merge slots         N agent bookmarks                  │
                          │     change_ids                   N workspace paths            JSON on disk
                          │           └────────────────────────────┼────────────────────────────┘
                          │                                        ▼
                          │                          ParallelDispatchHandle (frozen JSON)
                          │                                        │
                          ▼                                        ▼
              orchestrator dispatches N× Agent() promises   handle stored, awaited
                          │                                        │
                          │      [N agents run in parallel,        │
                          │       each in its own workspace,       │
                          │       each squashes into its           │
                          │       own subagent change @-]          │
                          │                                        │
                          ▼                                        ▼
                  Promise.all(agents) resolves          [orchestrator-awaits-Agent() invariant]
                          │
                          ▼
              gsd-sdk query workspace.parallel.fan-in handle results
                                              │
                                              ▼
                            jj/parallel.ts: performJjParallelFanIn
                                              │
            ┌─────────────────────────────────┼─────────────────────────────────┐
            ▼                                 ▼                                 ▼
   N-parent jj new                    findConflicts                       performJjReap
   -r @ -r <p1> ... -r <pN>           ({scope: 'working-copy'})           (entries from handle)
   -m "phase N merge"                          │                                 │
            │                                  │                                 ├── if conflict change has children
   resolve change_id @                     [paths populated]               │       in subagent set:
            │                                  │                                 │     reason='merge-in-tree-conflict'
            ├──── conflicted? ── yes ──┐       │                                 ├── elif head non-empty:
            │                          │       │                                 │     reason='crashed-with-uncommitted-work'
            │                          ▼       │                                 └── else: abandon + forget + rm
            │              FanInResult.conflicted=true                                 │
            │              FanInResult.conflictedPaths=[…]                       writes incomplete-work.md
            │              NO bookmark advance, NO agent-bookmark delete         appends queue entries
            │                                                                          │
            ▼ no                                                                       │
   jj bookmark set <mainBookmark> -r @  ◄────────────────────────────────────────────┤
   jj bookmark delete <agentBookmark-1> ... <agentBookmark-N>  (one batched invocation)│
            │                                                                          │
            ▼                                                                          │
   re-list gsd/phase-{NN}-subagent-* bookmarks → surplusBookmarks                       │
            │                                                                          │
            └──────────────────────────────────────┬───────────────────────────────────┘
                                                   ▼
                              FanInResult (frozen JSON)
                                {merged, conflicted, conflictedPaths,
                                 incompleteQueued, failedReaped, surplusBookmarks}
```

### Recommended Project Structure

```
sdk/src/vcs/
├── types.ts                              # +VcsWorkspaceParallel, +Parallel* types, tighten IncompleteWorkEntry.reason
├── backends/
│   ├── jj.ts                             # +workspace.parallel wire-in (Object.freeze({dispatch, fanIn}))
│   └── git.ts                            # +workspace.parallel stub throwing VcsNotImplementedError (Phase 10 ships body)
├── jj/
│   ├── parallel.ts                       # NEW: performJjParallelDispatch, performJjParallelFanIn
│   ├── reap.ts                           # MODIFIED: insert conflict-probe branch before crash branch
│   ├── octopus.ts                        # UNTOUCHED (consumed by parallel.ts)
│   ├── incomplete-work.ts                # MODIFIED: optional reason-parse validation (planner discretion)
│   └── conflict-paths.ts                 # NEW (recommended): extracted enumerateConflictedPaths for sidecar use
└── __tests__/
    ├── cmd-parallel-jj.test.ts           # NEW: TEST-13 jj contract + TEST-14 divergent() assertion
    └── jj-reap.test.ts                   # MODIFIED: add 'merge-in-tree-conflict' classifier case
```

### Pattern 1: Sidecar Discipline (UPSTREAM-02)

**What:** Files in `sdk/src/vcs/jj/` MUST NOT import from `backends/jj.ts`.
**When to use:** Every new file under `vcs/jj/`.
**Example:** [VERIFIED: code read]

```typescript
// sdk/src/vcs/jj/parallel.ts (header pattern from octopus.ts:39-47)
import { vcsExec } from '../exec.js';
import { expr } from '../expr.js';
import { performJjReap } from './reap.js';
import { createPhaseStructure, createSubagentSlot } from './octopus.js';
import type {
    ParallelDispatchOpts, ParallelDispatchHandle,
    ParallelAgentResult, FanInResult, RevisionExpr,
} from '../types.js';

function jjArgvFlags(repo: string): string[] {
    // Inline mandatory-flags prefix. UPSTREAM-02 sidecar discipline:
    // this file does NOT import from `backends/jj.ts`.
    return ['--repository', repo, '--no-pager', '--color', 'never', '--quiet'];
}
```

### Pattern 2: Frozen JSON Return

**What:** Every cross-`gsd-sdk query`-boundary return value is `Object.freeze`'d pure JSON.
**When to use:** Both Phase 9 verbs' return shapes.
**Example:** [VERIFIED: code read at `backends/jj.ts:1372`, `git.ts:927`]

```typescript
return Object.freeze({
    phaseRoot,
    workspaces: Object.freeze(
        workspaceEntries.map((w) => Object.freeze({
            name: w.workspaceName,
            path: w.workspacePath,
            baseRev: w.headChange,
            agentId: w.agentId,
            // baselineOpId: omitted under D-01; planner decides whether to include as undefined or strip entirely
        }))
    ),
    manifest: manifestPath,
    phaseNumber,
    mainBookmark,
}) satisfies ParallelDispatchHandle;
```

### Pattern 3: Wrap Runtime change_ids via `expr.rev`

**What:** Never pass a raw change_id string into adapter methods accepting `RevisionExpr`.
**When to use:** Anywhere `parallel.ts` hands a resolved change_id back to the adapter.
**Example:** [VERIFIED: `octopus.ts:319` already uses this]

```typescript
vcs.workspace.add({
    path: workspacePath,
    baseRef: expr.rev(headChange),  // brand the raw change_id
    name: workspaceName,
});
```

### Anti-Patterns to Avoid

- **`expr.raw(…)`:** forbidden — does not exist. Use `expr.rev(id)` for runtime revision strings.
- **Inline `spawnSync`:** forbidden in adapter code. Use `vcsExec`.
- **Importing from `backends/jj.ts` in sidecar files:** UPSTREAM-02 violation — creates merge conflicts on every upstream-rebase cycle.
- **Sequential `workspace.merge` calls inside fanIn:** defeats the parallelism and produces N 2-parent merges instead of one N-parent octopus. Use one `jj new -r @ -r <p1> ... -r <pN>` invocation.
- **`git worktree remove --force` or `jj workspace forget` mid-flight:** PARALLEL-03 dropped, but the underlying invariant "do not touch live workspaces" still applies — orchestrator awaits Agent() completion before fanIn.
- **Volunteering commit_id on cross-backend surface:** lint-vcs-no-commit-id.cjs CI-blocking; `ParallelDispatchHandle.workspaces[].baseRev` carries change_id on jj per D-14.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Octopus structure creation | Custom `jj new -A -B` sequences | `octopus.createPhaseStructure` + `octopus.createSubagentSlot` | Idempotency markers + WS-10 invariant already encoded; revset gotchas (`~` vs `-`, `subject(glob:…)`) already discovered and pinned. |
| Empty-head probe | Custom diff parser | `reap.ts:isEmptyHead` (private helper — extend reap, don't duplicate) | The `jj diff --from --to -s` form was specifically corrected from the wrong `-r` form at plan time (`reap.ts:13-20`). |
| Conflict revset | Hand-built `conflicts() & X` queries scattered through code | Existing `findConflicts({scope})` machinery; D-11 says reuse the revset substrate | The revset is `conflicts()` PLURAL — comment at `backends/jj.ts:562-567` notes upstream docs say singular `conflict()` but jj 0.41 only accepts plural. |
| Incomplete-work queue file format | Custom JSON / YAML | `appendIncomplete` / `readIncomplete` markdown line format | Already cross-backend (`backends/git.ts:32` imports `readIncomplete`); D-14 gate already wired. |
| Frozen-JSON return shape | Custom class instances or closures | `Object.freeze({...})` per project convention | `gsd-sdk query` JSON serialization round-trip breaks anything that isn't pure JSON (D-05). |
| Refname validation | Custom regex on agent-bookmark names | `validateRefname` from `refs-validator.js` (used at `backends/jj.ts:1209`, `:1226`) | Shared rules; centralized so jj + git apply same constraints. |
| `acquireJjRepoLock` (defense in depth) | DO NOT ADD per D-02 | Trust jj's lock-free design + orchestrator-only shared-ancestor mutation | Pitfall 1 premise rejected; topology guarantees no contention. |
| Liveness probe (`partial: true`, `liveWorkspaces`) | DO NOT ADD per D-01 | Orchestrator-awaits-Agent() invariant | Pitfall 3 premise rejected; impossible in production. |

**Key insight:** Phase 9 is **pure composition**. Every novel system primitive is already in-tree from Phases 3/4/7. The only invention is the *arrangement* (the `parallel.ts` composition file + the classifier branch) and the *types* (`VcsWorkspaceParallel`, `ParallelDispatchHandle`, `FanInResult`).

## Manifest Schema Extension (VCS-19)

**Current schema** (read from `worktree-safety.cjs:319-342`, [VERIFIED: code read]):

```json
{
  "worktrees": [
    {
      "agent_id": "<string>",          // ALREADY EXISTS at :336
      "worktree_path": "<string>",     // :321-323
      "branch": "<string>",            // :324 — pattern /^worktree-agent-[A-Za-z0-9._/-]+$/
      "expected_base": "<string>",     // :325
      "main_bookmark": "<string>|null" // :330-332, optional
    }
  ]
}
```

**Phase 9 extension** (VCS-19, backwards-compatible additions):

```json
{
  "worktrees": [
    {
      "agent_id": "<string>",
      "worktree_path": "<string>",
      "branch": "<string>",
      "expected_base": "<string>",
      "main_bookmark": "<string>|null",
      "plan_id": "<string>",                  // NEW: identifies the plan within the phase
      "backend": "jj" | "git"                 // NEW: which adapter created the workspace
    }
  ]
}
```

**Backwards-compatibility findings** [VERIFIED: code read at `worktree-safety.cjs:359-366`]:

- `normalizeCleanupManifestEntry` keeps only the fields it explicitly extracts — unknown fields are **dropped**, not preserved. This means existing v1.1 readers will NOT carry `plan_id`/`backend` through to the cleanup planner — but they will not error either.
- The new fields' **absence** from a manifest produced by old code (e.g., a workflow-markdown writer not yet migrated) will not break the new schema's readers — the new fields' parser logic must tolerate `undefined`.

**Writer-side ownership:**

- Today: `execute-phase.md:528-530` initializes `WAVE_WORKTREE_MANIFEST` and `:651` describes the append protocol. Workflow-markdown owns the writer.
- Phase 9: `performJjParallelDispatch` writes the manifest. The handle's `manifest` field stores the absolute path.
- Phase 11 (per ROADMAP): the workflow-markdown writer at `execute-phase.md:521-810` is deleted entirely — the manifest write moves fully into the SDK.

**Risk for planner:** Phase 9 and Phase 11 must not race. Phase 9 ships the SDK-side writer; Phase 11 deletes the workflow writer. If Phase 9 ships first and the workflow markdown still ALSO writes the manifest, you get a double-write. **Recommendation:** Phase 9 SDK writer uses `mkstemp`-style unique path; the handle.manifest path is authoritative; the workflow's `WAVE_WORKTREE_MANIFEST` env var stays set for backwards-compat through Phase 10, then collapses in Phase 11.

## change_id Stability (PARALLEL-05)

**Claim:** "change_ids are stable across `jj rebase` by design (vs commit_ids which are not)."

**Verification:**

- [CITED: jj docs glossary] — `jj help -k glossary` references "change ID" as "A persistent identifier for a [change](#change). Unlike a commit ID, the change ID stays the same when the commit is rewritten."
- [VERIFIED: code read at `sdk/src/vcs/backends/jj.ts:343`] `mergeBase` documentation states: "returns change_id on jj (via fork_point(x) revset) … User override of recommendation — change_id chosen for jj despite known rebase-stability tradeoff." This codebase comment confirms the team's understanding: change_id IS rebase-stable; the "tradeoff" referenced is about `mergeBase` semantics specifically, not change_id stability in general.
- [CITED: v1.2 unified revision model — `.planning/STATE.md`] — `lint-vcs-no-commit-id.cjs` enforces change_id on every cross-backend surface; this entire architectural commitment is predicated on change_id rebase-stability.

**JSDoc canonical wording (per D-14):** Use verbatim on the new type:

```typescript
export interface ParallelDispatchHandle {
    // ...
    workspaces: readonly Array<Readonly<{
        name: string;
        path: string;
        /**
         * change_id on jj; stable across `jj rebase`.
         * commit_id on git; stable across `git rebase`.
         * Cross-backend semantics: rebase-stable revision pointer to the
         * parent change the workspace forked from. (PARALLEL-05, D-14.)
         */
        baseRev: string;
        agentId: string;
        /**
         * Reserved for forward-compat with a future re-introduced liveness
         * probe. Currently always `undefined` (D-01 dropped PARALLEL-03 at
         * Phase 9 discuss-phase 2026-05-15). Planner may strip this field
         * if YAGNI noise outweighs forward-compat value.
         */
        baselineOpId?: string;
    }>>;
}
```

## Cross-Backend Interface Surface (VCS-16)

**Pattern reference** [VERIFIED: code read at `types.ts:356-379`]: `VcsBookmarks` is the precedent for a sub-namespace inside a top-level adapter namespace. `VcsWorkspaceParallel` mirrors this pattern:

```typescript
// Insert in types.ts after WorkspaceMergeOpts/WorkspaceMergeResult (around line 235)
// or after VcsWorkspace (line 425) — Claude's discretion per CONTEXT.

export interface VcsWorkspaceParallel {
    dispatch(opts: ParallelDispatchOpts): ParallelDispatchHandle;
    fanIn(handle: ParallelDispatchHandle, results: readonly ParallelAgentResult[]): FanInResult;
}

// Extend VcsWorkspace (currently lines 392-425):
export interface VcsWorkspace {
    add(input: WorkspaceAdd): WorkspaceInfo;
    forget(path: string): void;
    list(): WorkspaceInfo[];
    context(): WorkspaceContext;
    prune(): ExecResult;
    reap(opts: { phaseNamePrefix: string; phaseDir: string }): ReapResult;
    merge(opts: WorkspaceMergeOpts): WorkspaceMergeResult;
    remove(path: string, opts?: { force?: boolean }): void;
    parallel: VcsWorkspaceParallel;   // NEW (VCS-16)
}
```

### Git-side Stub Question

**The cross-phase coupling question:** does Phase 9 land just the type (Phase 10 ships the git body), or does Phase 9 land a git-side throwing stub?

**Recommendation:** Phase 9 lands a git-side stub that throws `VcsNotImplementedError`. Rationale:

- `VcsAdapterCommon` is a structural interface — Phase 9 cannot extend `VcsWorkspace` with `parallel` and leave git's `workspace` literal missing the field without a TypeScript error.
- `VcsNotImplementedError` is the existing precedent ([VERIFIED: code read at `types.ts:565-578`]) for "verb declared on cross-backend surface, not yet implemented on this backend." It is distinct from `VcsExecError`.
- Phase 10's PR replaces the throwing stub with the real body — a small, focused diff that's easy to review.

**Stub shape:**

```typescript
// In sdk/src/vcs/backends/git.ts inside the workspace = Object.freeze({...}) block
parallel: Object.freeze({
    dispatch(): never {
        throw new VcsNotImplementedError(
            'workspace.parallel.dispatch is not yet implemented on the git backend; Phase 10 ships the body',
        );
    },
    fanIn(): never {
        throw new VcsNotImplementedError(
            'workspace.parallel.fanIn is not yet implemented on the git backend; Phase 10 ships the body',
        );
    },
}),
```

## Sidecar Discipline (UPSTREAM-02) — `jj/parallel.ts` Skeleton

```typescript
/**
 * sdk/src/vcs/jj/parallel.ts — Phase 9 (VCS-17, PARALLEL-01/02 jj-side)
 *
 * Composition layer over octopus.ts + reap.ts + jj-native N-parent merge.
 * UPSTREAM-02 sidecar: does NOT import from backends/jj.ts.
 *
 * Pure functions; both return frozen JSON.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { vcsExec } from '../exec.js';
import { expr } from '../expr.js';
import { createPhaseStructure, createSubagentSlot } from './octopus.js';
import { performJjReap } from './reap.js';
import type {
    ParallelDispatchOpts, ParallelDispatchHandle,
    ParallelAgentResult, FanInResult,
} from '../types.js';

function jjArgvFlags(repo: string): string[] {
    return ['--repository', repo, '--no-pager', '--color', 'never', '--quiet'];
}

export function performJjParallelDispatch(
    opts: {
        mainRepoRoot: string;
        plan: ParallelDispatchOpts['plan'];
        phaseNumber: number;
        mainBookmark: string;
        // vcs adapter injected so createSubagentSlot can call workspace.add
        // without parallel.ts importing from backends/jj.ts
        vcs: { workspace: { add(input: { path: string; baseRef?: any; name?: string }): unknown } };
    },
): ParallelDispatchHandle {
    // 1. createPhaseStructure (idempotent)
    // 2. for each plan-item in opts.plan: createSubagentSlot
    // 3. create agent bookmarks (gsd/phase-{NN}-subagent-{idx}) eagerly
    // 4. write manifest with new schema (plan_id, agent_id, backend: 'jj')
    // 5. return Object.freeze({...})
}

export function performJjParallelFanIn(
    mainRepoRoot: string,
    handle: ParallelDispatchHandle,
    results: readonly ParallelAgentResult[],
): FanInResult {
    // 1. N-parent jj new -r @ -r <p1> ... -r <pN> -m "phase NN merge"
    // 2. resolve change_id of new @
    // 3. findConflicts via inline `conflicts() & @` revset
    // 4. if conflicted: return early with conflicted=true, conflictedPaths populated
    // 5. jj bookmark set <mainBookmark> -r @
    // 6. batched jj bookmark delete <agent-1> <agent-2> ... <agent-N>
    // 7. performJjReap to classify any failed/crashed workspaces from `results`
    // 8. re-list gsd/phase-{NN}-subagent-* bookmarks → surplusBookmarks
    // 9. return Object.freeze({merged, conflicted, conflictedPaths,
    //                          incompleteQueued, failedReaped, surplusBookmarks})
}
```

## Test Fixture Patterns

### Pattern A — `describe.sequential.skipIf(!jjAvailable)` [VERIFIED: `jj-octopus.test.ts:45`]

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

let jjAvailable = false;
try { execSync('jj --version', { stdio: 'pipe' }); jjAvailable = true; } catch {}

describe.sequential.skipIf(!jjAvailable)(
    'workspace.parallel — TEST-13 jj contract',
    () => {
        // Pattern B: random-prefix mkdtemp guards against parallel-test-FILE
        // collisions on /tmp (Pitfall 9).
        let dir: string;
        beforeAll(() => {
            dir = mkdtempSync(join(tmpdir(), `gsd-jj-parallel-${Math.random().toString(36).slice(2,10)}-`));
            execSync('jj git init --colocate', { cwd: dir, stdio: 'pipe' });
            execSync('jj config set --repo user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
            execSync('jj config set --repo user.name "Test"', { cwd: dir, stdio: 'pipe' });
            writeFileSync(join(dir, 'seed.txt'), 'seed\n');
            execSync('jj squash -B @ -k -m "seed"', { cwd: dir, stdio: 'pipe' });
        });
        afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

        // TEST-13: N ∈ {2, 3, 4}
        for (const N of [2, 3, 4] as const) {
            it(`N=${N}: dispatch creates N workspaces with distinct change_ids`, () => { /* ... */ });
            it(`N=${N}: clean fan-in returns merged.length===N, conflicted===false`, () => { /* ... */ });
            it(`N=${N}: post-fanIn divergent() revset is empty`, () => {
                // TEST-14 — verify via raw `jj log -r 'divergent()' --no-graph` from dir
                const r = execSync(`jj --repository ${dir} log -r 'divergent()' --no-graph -T 'change_id ++ "\\n"'`,
                                   { cwd: dir, encoding: 'utf-8' });
                expect(r.trim()).toBe('');
            });
            it(`N=${N}: post-fanIn surplusBookmarks is empty`, () => { /* ... */ });
        }

        it('one in-tree conflict: conflicted===true, conflictedPaths populated, queue entry reason="merge-in-tree-conflict"', () => { /* ... */ });
        it('one crashed worker: queue entry reason="crashed-with-uncommitted-work", reaping succeeds', () => { /* ... */ });
    },
);
```

### Forcing an In-Tree Conflict in a Fixture (Claude's Discretion per CONTEXT)

**Recommended mechanism:** pre-arrange conflicting file content per subagent workspace, then octopus-merge.

```
Setup:
  1. seed/CONFLICT.txt = "base content\n"  (committed under @-)
  2. dispatch N=2 workspaces — both fork from same parent slot
  3. in workspace 1: write CONFLICT.txt = "version A\n"; jj squash -B @ -k -m "subagent 1 work"
  4. in workspace 2: write CONFLICT.txt = "version B\n"; jj squash -B @ -k -m "subagent 2 work"
  5. fanIn() → jj new -r @ -r <head1> -r <head2> → in-tree conflict on CONFLICT.txt

Assertions:
  - FanInResult.conflicted === true
  - FanInResult.conflictedPaths contains 'CONFLICT.txt'
  - readIncomplete(phaseDir) contains one entry with reason === 'merge-in-tree-conflict'
  - jj log -r 'conflicts() & @' --no-graph reports the merge change non-empty
  - jj log -r 'divergent()' --no-graph is STILL empty (TEST-14 holds: in-tree conflict ≠ divergent change)
```

### Forcing a Crashed Worker (TEST-13 scenario 4)

**Mechanism** [model: `jj-reap.test.ts:115-138`]: write a file directly into the workspace dir and trigger jj's auto-snapshot via `jj st`, then pass an exit-code-non-zero result for that agent to `fanIn`. The classifier's existing `'crashed-with-uncommitted-work'` branch (`reap.ts:160-194`) fires.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Liveness probe + `partial: true` recovery contract | NONE — orchestrator-awaits-Agent() invariant | 2026-05-15 (Phase 9 discuss D-01) | `FanInResult` shape loses `liveWorkspaces` / `partial`. |
| `acquireJjRepoLock` at fanIn | NONE — jj is lock-free under octopus topology | 2026-05-15 (Phase 9 discuss D-02) | `sdk/src/vcs/jj/lock.ts` untouched. |
| TEST-14 as lock-effectiveness test | TEST-14 as topology-correctness assertion | 2026-05-15 (Phase 9 discuss D-03) | Same revset (`divergent()`), reframed semantics. |
| One-arg `fanIn(wave)` (ARCHITECTURE.md draft) | Two-arg `fanIn(handle, results)` per REQUIREMENTS | 2026-05-15 (Phase 9 discuss D-04) | Reflects pure-JSON handle invariant. |
| `IncompleteWorkEntry.reason: string` (free-form) | String-literal union 2 values | Phase 9 | Tighter type; reader-side parse validation recommended. |
| Workflow-markdown manifest writer | SDK-side `parallel.dispatch` writes the manifest | Phase 9 (writer) + Phase 11 (delete workflow writer) | Same-PR coupling considerations across Phase 9/10/11. |

**Deprecated/outdated** (do NOT reintroduce per locked decisions):

- `acquireJjRepoLock` infrastructure (sentinel under `.jj/repo/`, PID-liveness recovery via `process.kill(pid, 0)`).
- `partial: true` / `liveWorkspaces[]` fields on any return shape.
- `'partial-wave-live-workspace'` as an `IncompleteWorkEntry.reason` literal — the third value is OUT.
- `jj op log --workspace <name>` syntax — confirmed by upstream researcher to not exist on jj 0.41 (workspace-filter is template-side via `workspace_name`, added in 0.40). Surfaces only as historical note.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `IncompleteWorkEntry.reason` reader at `incomplete-work.ts:75` accepts arbitrary trimmed strings and the D-14 phase-merge gate trips on **non-empty** queue regardless of reason value. | Type Tightening, Manifest writer ownership | If gate logic actually checks specific reason values, tightening the union may surface latent bugs. Mitigation: read `backends/jj.ts:182-194` and `backends/git.ts:121-138` at plan-time to confirm. |
| A2 | jj 0.41's N-parent `jj new -r @ -r <p1> -r <p2> ... -r <pN>` produces a single non-divergent change with N parents (extends the verified 2-parent shape at `backends/jj.ts:1183`). | Architecture diagram, fanIn step 1 | If jj forbids `-r @ -r X -r Y -r Z` for N>2, fanIn needs a different N-parent invocation form. Mitigation: empirical probe at plan-time with N=3, N=4. |
| A3 | `enumerateConflictedPaths(rev)` from `backends/jj.ts` can be either inlined into `jj/parallel.ts` or extracted to a new `vcs/jj/conflict-paths.ts` sidecar without breaking existing callers. | Phase 9 insertion point, Recommended Project Structure | If the function carries non-trivial state or backend coupling, extraction may bloat scope. Mitigation: read the function body and consumer list at plan-time. |
| A4 | The git-side throwing stub of `workspace.parallel.{dispatch,fanIn}` shipping in Phase 9 will not break any existing git-backend consumer because no current consumer calls these verbs (they're net-new). | Git-side Stub Question | If any existing test exercises `workspace.parallel` on the git backend, the stub flips it red. Mitigation: grep `workspace.parallel` across the test suite at plan-time. Already verified: no hits as of 2026-05-15. |
| A5 | `WAVE_WORKTREE_MANIFEST` reader at `worktree-safety.cjs:319-342` will tolerate the new `plan_id` and `backend` fields' **absence** silently (so old-writer + new-reader compatibility works during Phase 9→10→11 staging). | Manifest Schema Extension | If a downstream consumer hard-requires `plan_id`/`backend`, mixed-version writes break. Mitigation: confirm at plan-time that `plan_id`/`backend` consumers are net-new (Phase 11), not retrofitted. |

## Open Questions (RESOLVED)

1. **Agent bookmark creation timing.**
   - What we know: `createSubagentSlot` (`octopus.ts:280-324`) creates the head and workspace but **does not** create an agent bookmark.
   - What's unclear: Should `performJjParallelDispatch` create `gsd/phase-{NN}-subagent-{idx}` bookmarks eagerly so that subagent `vcs.commit` calls advance them, or defer to first-commit-time?
   - Recommendation: eager creation in `performJjParallelDispatch`. Gives fanIn a deterministic delete list (D-08's `surplusBookmarks` assertion) and mirrors the git-side `worktree-agent-*` branch convention. Plan-time task: confirm subagent `vcs.commit` accepts pre-existing bookmark.

2. **`baselineOpId` field disposition.**
   - What we know: CONTEXT D-06 calls it "reserved on workspaces[] but unused under D-01" and explicitly defers to planner.
   - What's unclear: Forward-compat value vs. YAGNI noise.
   - Recommendation: keep as documented-undefined-for-now. Liveness probe is deferred to v1.4+; if re-introduced, having the field already declared avoids a schema break. Cost: one optional JSDoc line.

3. **`enumerateConflictedPaths` reuse strategy.**
   - What we know: helper exists in `backends/jj.ts` (called from `findConflicts` at `:599`); reusing from `jj/parallel.ts` violates UPSTREAM-02 if direct-imported.
   - What's unclear: extract to sidecar (`vcs/jj/conflict-paths.ts`) vs. inline minimally in `parallel.ts` and `reap.ts`.
   - Recommendation: extract. Single source of truth, sidecar-compatible, ~30-50 LoC; cost low.

4. **Manifest writer race during phased rollout.**
   - What we know: Phase 9 SDK writer + workflow-markdown writer at `execute-phase.md:528-651` both exist between Phase 9 ship and Phase 11 delete-workflow.
   - What's unclear: Does the workflow markdown still run when `parallel.dispatch` is called? In Phase 9, only the SDK calls `parallel.dispatch`; the workflow markdown still owns its own dispatch loop until Phase 11.
   - Recommendation: in Phase 9, the new SDK manifest is at `handle.manifest` (a fresh `mktemp` path); the workflow-markdown's `WAVE_WORKTREE_MANIFEST` stays unchanged. No race because no consumer reads both simultaneously. Document this explicitly in `parallel.ts` JSDoc.

5. **Phase 10 same-PR coupling — does this PR also need the git-side `FanInResult` body?**
   - What we know: CONTEXT and ROADMAP both say `FanInResult` shape requires same-PR coupling.
   - What's unclear: "Same-PR coupling on the shape" can mean either (a) the type lands in Phase 9, body in Phase 10 in the same PR, or (b) type AND body land in same PR (so Phase 9 PR = Phase 9 + Phase 10 PR).
   - Recommendation: read (a). Phase 9 ships the type + jj body + git-side throwing stub. Phase 10 replaces the stub with a real body — that's the "git-side" PR. Both PRs satisfy the cross-backend contract because the *type* is fixed at Phase 9. This matches the ROADMAP Phase 10 description: "git backend exposes the same `vcs.workspace.parallel.*` verb surface; the cross-backend `FanInResult` shape ships uniform on both backends" — read as Phase 10 is responsible for the git body landing uniform to the Phase 9 type.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| jj | All Phase 9 production code + tests | ✓ | 0.41.0 [VERIFIED: `jj --version` on this machine] | — |
| Node.js | SDK runtime | ✓ | — (inherited from project) | — |
| Vitest | TEST-13 / TEST-14 | ✓ | — (existing project framework) | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

## Security Domain

Phase 9 does not touch authentication, session management, access control, input validation surfaces, or cryptography. The composition layer is pure code arrangement over existing primitives.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | partial | Refname validation reused from `refs-validator.js` (already in-tree); user-influenced positional args after `--` separator per existing `backends/jj.ts:1052-1062` and `:1080-1082` pattern. |
| V6 Cryptography | no | — |

**Known patterns** (carry-forward from existing adapter discipline):

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Argv injection via attacker-controlled path or bookmark name | Tampering | `--` end-of-options separator before user-influenced positional; `validateRefname` before any bookmark write. Already in `backends/jj.ts:1052-1062`, `:1080-1082`, `:1209`, `:1226`. |
| Path traversal on workspace creation | Tampering | `octopus.ts:302` defaults workspace path to `{mainRepoRoot}/.claude/jj-workspaces/{name}`; opt-in override exists but is internal-orchestrator-only. |

## Sources

### Primary (HIGH confidence — in-tree code, file:line cited)

- `sdk/src/vcs/jj/octopus.ts` — full file (`createPhaseStructure`, `createSubagentSlot`, `createSubagentHead`).
- `sdk/src/vcs/jj/reap.ts` — full file (`performJjReap`, `isEmptyHead`, `parentOf`).
- `sdk/src/vcs/jj/incomplete-work.ts` — full file (`appendIncomplete`, `readIncomplete`, ENTRY_RE format).
- `sdk/src/vcs/jj/lock.ts` — full file (per-workspace `acquireJjWriteLock`; per D-02 NOT extended).
- `sdk/src/vcs/backends/jj.ts:580-603` (`findConflicts({scope})`); `:1135-1157` (`workspace.reap` wrapper); `:1175-1245` (`workspace.merge` 2-parent shape); `:1045` (`workspace = Object.freeze({...})`); `:1372` (top-level adapter freeze).
- `sdk/src/vcs/backends/git.ts:32` (cross-backend import of `readIncomplete`); `:569` (`workspace = Object.freeze({...})`); `:121-138` (D-14 phase-merge gate).
- `sdk/src/vcs/types.ts:185-262` (Workspace types + `IncompleteWorkEntry` + `ReapResult`); `:294-321` (`VcsAdapterCommon`); `:392-425` (`VcsWorkspace`); `:565-578` (`VcsNotImplementedError`).
- `sdk/src/vcs/expr.ts:43-96` (`expr.rev` factory).
- `sdk/src/vcs/__tests__/jj-octopus.test.ts:30-77` (Pattern A + B fixture template).
- `sdk/src/vcs/__tests__/jj-reap.test.ts:40-138` (classifier scenario template).
- `get-shit-done/bin/lib/worktree-safety.cjs:319-373` (manifest reader; `normalizeCleanupManifestEntry`).
- `get-shit-done/workflows/execute-phase.md:528-651` (current manifest writer in workflow markdown).

### Secondary (HIGH confidence — local jj installation probe)

- `jj 0.41.0` `jj help -k revsets` — confirms `conflicts()` (PLURAL) and `divergent()` are real revset functions.

### Tertiary (referenced — not independently verified this session)

- `.planning/research/PITFALLS.md` Pitfalls 1, 2, 3, 4, 5, 9 — cited from session context per CONTEXT.md mapping.
- `.planning/research/ARCHITECTURE.md` Integration Points #1, #2, #3 — cited from CONTEXT.md.
- v1.2 `lint-vcs-no-commit-id.cjs` — enforces change_id-only on cross-backend surface (`STATE.md` decision record).

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — every primitive verified by direct file read with line citations.
- Architecture: HIGH — sidecar discipline, frozen-JSON convention, and composition pattern are all already in-tree precedents.
- Pitfalls: HIGH — D-01/D-02 dropped at premise; D-09/D-10/D-11 classifier extension well-bounded; Pitfall 2 and 4 are the live concerns and both have explicit mitigations encoded in D-08 (`conflicted: boolean` + `surplusBookmarks`).
- Test fixtures: MEDIUM-HIGH — Pattern A/B templates verified in-tree; the in-tree-conflict fixture mechanism is recommended but not empirically validated this session.

**Research date:** 2026-05-15
**Valid until:** 2026-06-15 (30 days — Phase 9 stack is in-tree code, low drift risk; jj 0.41 confirmed locally).

## RESEARCH COMPLETE
