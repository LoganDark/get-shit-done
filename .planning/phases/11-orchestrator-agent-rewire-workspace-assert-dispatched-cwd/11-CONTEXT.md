# Phase 11: Orchestrator + agent rewire + workspace.assert-dispatched-cwd - Context

**Gathered:** 2026-05-16
**Status:** Ready for planning (includes cross-phase amendment to Phase 9 jj/parallel.ts — see D-02)

<domain>
## Phase Boundary

Workflow markdown (`execute-phase.md`, `quick.md`) and the executor agent prompt (`gsd-executor.md`) stop carrying raw-git worktree dispatch + cleanup bodies and instead drive the `vcs.workspace.parallel.{dispatch,fanIn}` adapter verbs shipped in Phases 9/10. The new `workspace.assert-dispatched-cwd` SDK verb collapses the four worktree-aware guards in `gsd-executor.md:412-555` into a single backend-opaque call. `bin/lib/worktree-safety.cjs::executeWorktreeWaveCleanupPlan` body shrinks to a single delegation through `parallel.fanIn` (ADR-0004 `_deps={}` seam preserved). `worktree-path-safety.md` renames to `dispatch-cwd-safety.md` with a backend-agnostic body. `maxConcurrency` is plumbed end-to-end on the adapter input but workflow sites pass `undefined`.

**Scope-shaping invariant (load-bearing across all decisions below):** Only persistent state is workspaces / bookmarks / HEADs themselves. No orchestrator-managed sidecar files: the `WAVE_WORKTREE_MANIFEST` mktemp pattern in `execute-phase.md` and the `QUICK_WORKTREE_MANIFEST` analog in `quick.md` are eliminated. Fan-in discovers the workspace set from VCS state directly via `vcs.workspace.list()`.

**Cross-phase amendment:** Phase 9's `sdk/src/vcs/jj/parallel.ts` eager `jj bookmark create gsd/phase-{NN}-subagent-{idx}` loop (lines 224-244) and matching batched-delete in fanIn (lines 447-465) retire. Subagent heads referenced via `vcs.workspace.list()` + each workspace's `@`. Phase 9 contract tests (`cmd-parallel-jj.test.ts`) that assert bookmark presence flip to workspace-listing assertions. Git side keeps `worktree-agent-*` branches as the load-bearing backend asymmetry (git can't track anonymous worktree heads ergonomically).

</domain>

<decisions>
## Implementation Decisions

### CLI surface + state model

- **D-01:** `WAVE_WORKTREE_MANIFEST` (and `QUICK_WORKTREE_MANIFEST`) mktemp files are eliminated. The orchestrator shell holds the `ParallelDispatchHandle` JSON in a shell variable only — no file on disk. `workspace.parallel.dispatch` CLI prints Handle JSON to stdout; orchestrator iterates `.workspaces[]` in shell scope to spawn `Agent()` calls. `workspace.parallel.fan-in` CLI discovers the workspace set via `vcs.workspace.list()` filtered by phase scope; transient `ParallelAgentResult[]` array is fed via stdin (or `--results @file`). No Handle/manifest file passes between dispatch and fan-in. Rationale: only persistent state is VCS state; orchestrator-managed sidecars duplicate and rot.

- **D-02 (cross-phase amendment):** Phase 11 amends Phase 9 `sdk/src/vcs/jj/parallel.ts`: drop the eager `jj bookmark create gsd/phase-{NN}-subagent-{idx}` loop (lines 224-244) AND the matching batched-delete in `performJjParallelFanIn` (lines 447-465). The merge structure already references subagent heads as parents via `octopus.createPhaseStructure` + per-slot `createSubagentSlot` — bookmarks are wasted work on jj. Existing Phase 9 contract tests (`sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts`) that assert bookmark presence flip to workspace-listing assertions. Git side keeps `worktree-agent-*` branches because git worktrees can't track anonymous heads ergonomically — documented as the load-bearing backend asymmetry.

### assert-dispatched-cwd contract

- **D-03:** `workspace.assert-dispatched-cwd` is the minimal predicate. Verb checks cwd resolves to a non-primary entry from `vcs.workspace.list()`. Returns `{ ok, workspaceName, workspacePath, isPrimary }`. No HEAD-namespace regex, no protected-ref deny-list, no base-stability assertion, no abs-path predicate. The four guards' INTENT (don't commit on main, don't drift cwd, don't write outside workspace) lives implicitly: if cwd resolves to a non-primary dispatched workspace, the agent is in the right place by construction.

- **D-04:** `agents/gsd-executor.md:412-555` four worktree-aware guard blocks (step 0 #2924 HEAD/protected-ref; step 0a #3097 cwd-drift sentinel; step 0b #3099 abs-path; HEAD-attachment-namespace regex) collapse to one `gsd-sdk query workspace.assert-dispatched-cwd --cwd .` call + one branch on its return at the start of `<task_commit_protocol>`. The `<destructive_git_prohibition>` block stays as-is — it's about ambient `git clean` / `git rm` operations inside the workspace, not workspace-locating. The prohibition is git-specific by nature; cross-backend extension (to cover `jj abandon` etc.) is not in Phase 11 scope.

### executeWorktreeWaveCleanupPlan body shape

- **D-05:** `get-shit-done/bin/lib/worktree-safety.cjs::executeWorktreeWaveCleanupPlan` body becomes a single delegation to `vcs.workspace.parallel.fanIn(handle, results)`. All 7 pre-merge guards (branch_drift, deletions_detected, worktree_dirty, no_main_bookmark, merge, remove, bookmark.delete) drop. ADR-0004 `_deps={}` injection seam preserved (public signature `executeWorktreeWaveCleanupPlan(plan, _deps={})` unchanged). The CJS `pending[]` return shape is rebuilt from `FanInResult.conflictedPaths` / `failedReaped` / `incompleteQueued` so existing callers (`bug-3384-worktree-cleanup-manifest.test.cjs`, `wave-cleanup-executor.test.cjs`) keep their expected shape contract.

- **D-06 [load-bearing tradeoff]:** D-05 drops the orchestrator-side `deletions_detected` pre-check that caught #3091-class destructive merges (agent commits a deletion of a critical file; orchestrator merges blindly). Defense moves to the agent's `<task_commit_protocol>` step 6 in `agents/gsd-executor.md` which already runs `gsd-sdk query diff --name-status --range "HEAD~1..HEAD"` after every commit. Acceptable risk because the agent-side check fires per-commit (vs the orchestrator's per-merge), and hooks can carry additional load if needed. Worth flagging in CONTEXT so a future regression understands the load-bearing dependency.

### maxConcurrency wiring

- **D-07:** PARALLEL-06 is honored at the adapter field level — `dispatch({ plan, maxConcurrency })` accepts the field on both backends — but workflow call sites in `execute-phase.md` and `quick.md` always pass `undefined`. No `workflow.max_concurrency` config knob added. Runtime's natural agent-cap rules (Claude Code orchestrator's sequential `run_in_background: true` pattern, the `.git/config.lock` race mitigation that already forces one-Agent()-per-message dispatch) are the only cap. Workflow exposure deferred until dogfood data exists (Phase 14 `DOGFOOD-02` metrics).

### Documentation rename + body rewrite

- **D-08:** `get-shit-done/references/worktree-path-safety.md` renames to `dispatch-cwd-safety.md`. Body rewrites backend-agnostic: describes the single `gsd-sdk query workspace.assert-dispatched-cwd --cwd .` call + its `{ ok, workspaceName, workspacePath, isPrimary }` return shape + the failure-mode it catches (cwd drifted to primary workspace, cwd outside any dispatched workspace). The three prior sections (#3097 cwd-drift sentinel, #3099 abs-path guard, #2924 HEAD/protected-ref) collapse to one paragraph each: "the verb catches this failure mode by construction." All referrers updated: `execute-phase.md` (existing `<execution_context>` `@~/.claude/get-shit-done/references/worktree-path-safety.md` reference), `quick.md` (analogous reference if present), `gsd-executor.md` (any `<execution_context>` reference).

### quick.md rewire (mirrors execute-phase.md)

- **D-09:** `get-shit-done/workflows/quick.md:660-810` follows the same pattern as `execute-phase.md`: replace the raw-git dispatch + cleanup block with one `gsd-sdk query workspace.parallel.dispatch` call (Handle JSON to shell variable) + Agent() loop over `.workspaces[]` + `gsd-sdk query workspace.parallel.fan-in` (results array via stdin). `QUICK_WORKTREE_MANIFEST` mktemp variable eliminated per D-01. Quick mode typically dispatches N=1 (single executor for a quick task) — the parallel verb still works at N=1, just trivially.

### Claude's Discretion

- Exact CLI flag naming for the results input on `workspace.parallel.fan-in`: `--results @file` vs always-stdin vs both. Planner picks per consistency with existing `gsd-sdk query` flag conventions.
- Whether `vcs.workspace.list()` already exposes phase-scope filtering, or if a new `--phase NN` flag on the fan-in CLI handles filtering. Either is acceptable; planner reads the existing workspace-list verb and decides.
- Naming of the legacy-plan-shape → synthetic-Handle adapter inside `worktree-safety.cjs` (e.g. `reconstructHandleFromLegacyPlan(plan)`). Internal helper; no public contract.
- Whether D-02's cross-phase amendment lands as its own dedicated SDK plan early in the Phase 11 plan sequence (so the test-flip cascade has clear blame) or rides on top of the assert-dispatched-cwd plan. Planner-level decision; recommendation: dedicated plan to keep Phase 9 test-shape changes visible in commit history.
- Whether `<destructive_git_prohibition>` in `gsd-executor.md` gets cross-backend-renamed (e.g. `<destructive_vcs_prohibition>`) and extended to mention `jj abandon` / `jj op restore` parallels, or stays git-anchored as it is today. Researcher's call — not asked in this discussion. Default: stay git-anchored.
- Phase 9 jj-side test surface adjustments (post-D-02 bookmark retire). The TEST-14 `divergent()` assertion stays intact (octopus topology is unchanged). Tests asserting `jj bookmark list` post-fanIn need flipping to `jj workspace list` equivalents. Planner-level: how many test assertions need touching is a research/plan-time count.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project framing + requirements

- `.planning/PROJECT.md` — v1.3 milestone framing; "Orchestrator rewire" target feature bullet; cross-backend symmetry pressure.
- `.planning/REQUIREMENTS.md` §"Cross-backend parallel-dispatch verbs (PARALLEL)" — PARALLEL-06 (`maxConcurrency` end-to-end).
- `.planning/REQUIREMENTS.md` §"Backend implementations (VCS)" — VCS-20 (`workspace.assert-dispatched-cwd` SDK verb).
- `.planning/REQUIREMENTS.md` §"Workflow + agent rewire (PROMPT)" — PROMPT-06 (execute-phase.md raw-git delete), PROMPT-07 (quick.md raw-git delete), PROMPT-08 (gsd-executor.md collapse), PROMPT-09 (rename + body rewrite).
- `.planning/ROADMAP.md` §"Phase 11" — 5 success criteria (assert-dispatched-cwd verb shape, raw-git deletes, reference rename + body rewrite, worktree-safety.cjs delegation, maxConcurrency end-to-end).
- `.planning/STATE.md` §"Decisions" — v1.3 verb namespace lock; A3 deferred to Phase 12; no migration command for default-flip.

### Phase 9/10 carry-forward contracts

- `.planning/phases/09-jj-side-parallel-verbs/09-CONTEXT.md` D-04..D-09 — `FanInResult` shape, `ParallelDispatchHandle` shape, reap classifier enum, sidecar discipline. Cross-phase amendment per D-02 below affects Phase 9's bookmark-create body but NOT the type contract.
- `.planning/phases/10-git-side-parallel-verbs-classifier-extension/10-CONTEXT.md` D-01..D-08 — git-side fanIn is per-branch 2-parent merge loop with halt-on-conflict + re-callable via merge-base-is-ancestor skip; per-success cleanup; non-force `worktree remove`; crashed-agent classification rules. All carry forward unchanged.

### SDK code references (consumer + amendment targets)

- `sdk/src/vcs/types.ts` — `VcsWorkspaceParallel`, `ParallelDispatchOpts`, `ParallelDispatchHandle`, `ParallelAgentResult`, `FanInResult` types (locked). Phase 11 consumes without extending.
- `sdk/src/vcs/jj/parallel.ts:224-244` — eager bookmark create loop (retire per D-02).
- `sdk/src/vcs/jj/parallel.ts:447-465` — batched bookmark delete in `performJjParallelFanIn` (retire per D-02).
- `sdk/src/vcs/git/parallel.ts` — git-side `performGitParallel{Dispatch,FanIn}`. Phase 11 consumer; body untouched.
- `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts` — Phase 9 contract tests. Bookmark-presence assertions flip per D-02; TEST-14 `divergent()` assertion stays.
- `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts` — Phase 10 contract tests. Untouched (no jj-bookmark dependency).
- `sdk/src/query/command-static-catalog-domain.ts:63` — existing `worktree.cleanup-wave` CLI registration. Precedent for `workspace.parallel.dispatch`, `workspace.parallel.fan-in`, `workspace.assert-dispatched-cwd` registrations.
- `sdk/src/query/command-manifest.non-family.ts` — non-family canonical command catalog (new entries land here).
- `sdk/src/query/workspace.ts` — existing workspace context resolution; check if `vcs.workspace.list()` exposes the shape fan-in needs.
- `sdk/src/query/head-ref.ts` — precedent for `--cwd` + `--pick` flag plumbing.

### Workflow + agent prompt targets

- `get-shit-done/workflows/execute-phase.md:515-820` — raw-git dispatch + worktree-cleanup-tail block to delete (~290 LOC). Sequential `run_in_background: true` Agent() pattern at lines 536-544 preserved (it's the runtime cap that justifies D-07).
- `get-shit-done/workflows/execute-phase.md:5xx-5yy` — the `gsd-sdk query worktree.cleanup-wave --manifest "$WAVE_WORKTREE_MANIFEST"` call site (step 5.5). Replaced by `gsd-sdk query workspace.parallel.fan-in` with results array via stdin.
- `get-shit-done/workflows/quick.md:660-810` — analogous raw-git block to delete (~150 LOC). Same shape as execute-phase.md.
- `agents/gsd-executor.md:412-555` — four worktree-aware guard blocks (step 0a #3097 cwd-drift sentinel, step 0b #3099 abs-path guard, step 0 #2924 HEAD/protected-ref deny-list, plus HEAD-attachment-namespace regex). Collapse to single `workspace.assert-dispatched-cwd` call per D-04.
- `agents/gsd-executor.md:<destructive_git_prohibition>` — stays as-is per D-04.
- `get-shit-done/references/worktree-path-safety.md` — rename target → `dispatch-cwd-safety.md`; body rewrite per D-08.
- `get-shit-done/bin/lib/worktree-safety.cjs:417-516` (`executeWorktreeWaveCleanupPlan`) — body collapses to single `parallel.fanIn` delegation per D-05. ADR-0004 `_deps={}` seam preserved.
- `get-shit-done/bin/lib/worktree-safety.cjs:cmdWorktreeCleanupWave` (around line 517+) — the CLI handler for `gsd-sdk query worktree.cleanup-wave`. Either kept as a thin alias to `workspace.parallel.fan-in` for back-compat or removed and aliased at the manifest layer; planner decides.

### Test references

- `tests/worktree-safety.test.cjs` + `tests/worktree-safety-policy.test.cjs` — existing CJS-side tests for worktree-safety.cjs. May need adjustments after D-05 body shrink.
- `tests/wave-cleanup-executor.test.cjs` — tests `executeWorktreeWaveCleanupPlan` return shape; the synthetic `pending[]` reconstruction in D-05 must keep these green.
- `tests/bug-3384-worktree-cleanup-manifest.test.cjs` — regression for #3384 (manifest-source-of-truth). May need flipping since the manifest is being eliminated; the regression INTENT (don't broad-discover worktrees) still applies — guarded by the phase-scope filter in `vcs.workspace.list()` per D-01.

### Research already in place

- `.planning/research/ARCHITECTURE.md` — written for Phase 9/10; carry-forward only.
- `.planning/research/PITFALLS.md` Pitfall 5 (`.git/config.lock` race) — sequential Agent() dispatch in `execute-phase.md:536-544` already enforces this; D-07 inherits the structural mitigation.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `sdk/src/query/head-ref.ts` — precedent for thin `--cwd` + `--pick` flag plumbing. `workspace.assert-dispatched-cwd` likely follows the same handler shape.
- `sdk/src/query/command-static-catalog-domain.ts:63` (`worktree.cleanup-wave` registration) — precedent for the new CLI command registrations.
- `sdk/src/vcs/jj/parallel.ts` workspace-discovery code at lines 313-358 (`getCurrentHeads()`) — the existing pattern for "iterate `jj workspace list -T json` and project per-workspace state." Fan-in CLI's discovery body can reuse this exact pattern.
- `bin/lib/worktree-safety.cjs::resolveWorktreeContext` / `parseWorktreePorcelain` — existing git worktree-listing helpers; informational reference for how the cross-backend `vcs.workspace.list()` should shape its output if it doesn't already.

### Established Patterns

- **Sequential one-Agent()-per-message dispatch** (`execute-phase.md:536-544`) is load-bearing for `.git/config.lock` race mitigation AND is the structural justification for D-07 (no `maxConcurrency` knob). Phase 11's workflow rewrite preserves this exact loop pattern — only the surrounding boilerplate (manifest mktemp, raw-git worktree-add) changes.
- **ADR-0004 `_deps={}` injection seam** (`bin/lib/worktree-safety.cjs::executeWorktreeWaveCleanupPlan(plan, _deps={})`) — public signature stays the same so tests can stub the adapter. D-05's body shrink respects this.
- **Phase-prefix scoping** for shared resources (e.g. existing `gsd/phase-{NN}-...` bookmark naming on jj). Used to scope `vcs.workspace.list()` filtering on fan-in per D-01.

### Integration Points

- **SDK CLI manifest** (`sdk/src/query/command-manifest.non-family.ts`): three new canonical commands land here — `workspace.assert-dispatched-cwd`, `workspace.parallel.dispatch`, `workspace.parallel.fan-in`. All `outputMode: 'json'` per Phase 9/10 convention.
- **Workflow markdown** (`execute-phase.md`, `quick.md`): the dispatch+cleanup block delete is a net-negative LOC change (~440 LOC across both files). Replacement is a ~30 LOC shell block per file. The orchestrator-rule and stall-surveillance probes (#3212) stay.
- **gsd-executor.md `<task_commit_protocol>` step 6** (`agents/gsd-executor.md:~525-540`): the existing deletion-check is the new load-bearing defense for #3091 per D-06. Don't weaken it during Phase 11.
- **Phase 9 jj-side tests** (`cmd-parallel-jj.test.ts`): assertions that check `jj bookmark list` post-fanIn for `gsd/phase-NN-subagent-N` cleanup flip to `jj workspace list` equivalents per D-02. TEST-14 `divergent()` stays.

</code_context>

<specifics>
## Specific Ideas

- User-stated invariant (Area 1): "we shouldn't have any persistent state other than the workspaces/bookmarks/heads themselves" — drove D-01's elimination of WAVE_WORKTREE_MANIFEST and the discovery-based fan-in shape. Saved as `project_no_orchestrator_sidecar_state` memory.
- User-stated framing (Area 1 follow-up): "we don't need bookmarks for them on jj at all since their heads are already part of the merge before they even start, and all the heads are already direct parents of the merge for cleanup after every subagent is done." — drove D-02's retire of Phase 9 eager bookmark create + batched delete. The merge structure created by `octopus.createPhaseStructure` IS the canonical reference; bookmarks are wasted work on jj.

</specifics>

<deferred>
## Deferred Ideas

- `workflow.max_concurrency` config knob exposure to workflow call sites. Per D-07, deferred until Phase 14 dogfood metrics give a sensible cap. Not in Phase 11.
- Cross-backend renaming/extension of `<destructive_git_prohibition>` in `gsd-executor.md` to cover jj-side destructive operations (`jj abandon`, `jj op restore`, etc.). Out of Phase 11 scope per D-04. Future cleanup phase if useful.
- Removing `worktree.cleanup-wave` CLI alias entirely (vs keeping as a thin shim around `workspace.parallel.fan-in`). Back-compat call sites may exist; planner-level decision during research/plan.

</deferred>

---

*Phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd*
*Context gathered: 2026-05-16*
