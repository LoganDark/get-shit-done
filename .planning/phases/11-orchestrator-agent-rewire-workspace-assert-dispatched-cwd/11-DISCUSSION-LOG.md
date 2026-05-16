# Phase 11: Orchestrator + agent rewire + workspace.assert-dispatched-cwd - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-16
**Phase:** 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd
**Areas discussed:** CLI shape for parallel dispatch/fan-in, workspace.assert-dispatched-cwd scope, executeWorktreeWaveCleanupPlan body after delegation, maxConcurrency source-of-truth

---

## Area 1 — CLI shape for parallel dispatch/fan-in

### First-pass options (presented but rejected by user framing)

| Option | Description | Selected |
|--------|-------------|----------|
| File-based, repurpose WAVE_WORKTREE_MANIFEST | Dispatch writes Handle to `--manifest <path>`; fan-in reads it back; mirrors existing `worktree.cleanup-wave` precedent. | ✗ |
| Pure stdout/stdin, no implicit files | Dispatch reads plan from stdin/--plan, writes Handle to stdout; workflow `tee`s. | ✗ |
| Two flags: --handle <path> --results <path> | Rename WAVE_WORKTREE_MANIFEST → WAVE_PARALLEL_HANDLE to make role explicit. | ✗ |

**User correction (free-text):** "hold on, why are we using temp files at all for this? I thought I told you before that we shouldn't have any persistent state other than the workspaces/bookmarks/heads themselves"

→ Saved as project memory `project_no_orchestrator_sidecar_state` and added to MEMORY.md index. Triggered re-ask with discovery-based framing.

### Re-ask: discovery model + agent_id location

| Option | Description | Selected |
|--------|-------------|----------|
| Bookmark name encodes agent_id; fan-in lists by prefix | `gsd/phase-NN/agent-MM` naming convention; fan-in lists current bookmarks, filters by phase prefix. | ✗ |
| Workspace name encodes agent_id; bookmark is incidental | Discovery via `vcs.workspace.list()` filtered by name prefix; bookmark hygiene decoupled. | ✗ |
| Caller passes scope (phase number or prefix); fan-in lists+filters | Fan-in CLI takes `--phase NN`; most explicit, no implicit convention. | ✗ |

**User's choice (free-text):** "If we preserve the invariant that subagent workspaces are located at their respective heads, the bookmark is nothing more than a convenience. Let's do that. In fact we don't need bookmarks for them on jj at all since their heads are already part of the merge before they even start, and all the heads are already direct parents of the merge for cleanup after every subagent is done."

→ Triggered Area-1 follow-up about whether jj bookmarks retire entirely (Phase 9 amendment).

### Follow-up: jj bookmark retire scope

| Option | Description | Selected |
|--------|-------------|----------|
| Retire the jj bookmarks entirely | Phase 11 amends Phase 9 parallel.ts: drop eager `jj bookmark create` (lines 224-244) AND batched-delete in fanIn (lines 447-465). Discovery purely via `vcs.workspace.list()` + each workspace's @. Git keeps `worktree-agent-*` branches as load-bearing backend asymmetry. | ✓ |
| Keep jj bookmarks; just don't depend on them externally | Bookmarks stay as debugging affordance; workflow + executor stop reading them. | ✗ |
| Retire jj bookmarks AND replace `worktree-agent-*` with detached-HEAD on git | Symmetric full retire; out-of-scope for Phase 11. | ✗ |

**Locked decisions:** D-01 (no orchestrator-managed sidecar state; dispatch stdout → shell var, fan-in discovers via `vcs.workspace.list()`, results via stdin/--results), D-02 (Phase 9 jj bookmark retire; cross-phase amendment).

---

## Area 2 — `workspace.assert-dispatched-cwd` scope

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal: cwd is a dispatched workspace, full stop | Verb checks cwd matches a non-primary entry from `vcs.workspace.list()`. Returns `{ ok, workspaceName, workspacePath, isPrimary }`. | ✓ |
| Workspace + base-stability | Adds: workspace's @ is descendant of dispatch-time base; closes protected-ref deny-list gap structurally. | ✗ |
| Full replacement: workspace + base-stability + abs-path predicate | Verb subsumes step 0b #3099 via `assertPathInside(absPath)` mode; two call modes. | ✗ |

**User's choice:** Minimal.

**Locked decisions:** D-03 (verb shape: minimal predicate), D-04 (gsd-executor.md 4 guards collapse to single call; `<destructive_git_prohibition>` stays as-is).

---

## Area 3 — `executeWorktreeWaveCleanupPlan` body after delegation

| Option | Description | Selected |
|--------|-------------|----------|
| Drop them; delegate to parallel.fan-in; trust the new contract | Body = single `parallel.fanIn` call; all 7 guards drop; `pending[]` rebuilt from FanInResult shape; ADR-0004 preserved. Tradeoff: #3091 deletion-blind defense moves to agent's `<task_commit_protocol>` step 6. | ✓ |
| Drop most; preserve deletions_detected as a parallel.fanIn pre-condition | Body adds `deletions_detected` pre-check; preserves #3091 protection at orchestrator layer. | ✗ |
| Keep the 7-guard body; only refactor merge+remove+delete tail | Body keeps pre-merge guards; conservative; doesn't really "shrink to single delegation". | ✗ |

**User's choice:** Drop them; delegate; trust new contract.

**Locked decisions:** D-05 (single delegation; all 7 guards drop; signature preserved; pending[] rebuilt from FanInResult), D-06 (load-bearing tradeoff: #3091 defense moves to agent-side per-commit deletion check).

---

## Area 4 — `maxConcurrency` source-of-truth

| Option | Description | Selected |
|--------|-------------|----------|
| Always pass `undefined`; no workflow knob | Workflow site passes nothing; runtime cap (sequential Agent() pattern) is the only cap; PARALLEL-06 honored at adapter field only. | ✓ |
| Read `workflow.max_concurrency` config knob, default unset | Adds one config knob; power-user cap per repo. | ✗ |
| Hardcode a sensible cap (e.g. 4) in the workflow | Predictable resource ceiling; arbitrary without dogfood data. | ✗ |

**User's choice:** Always pass undefined; no workflow knob.

**Locked decisions:** D-07 (no config knob; workflow exposure deferred until Phase 14 dogfood metrics).

---

## Claude's Discretion

- Exact CLI flag naming for results input on `workspace.parallel.fan-in` (`--results @file` vs always-stdin vs both).
- Whether `vcs.workspace.list()` already exposes phase-scope filtering or if a new `--phase NN` flag handles it.
- Internal helper naming inside `worktree-safety.cjs` for the legacy-plan-shape → synthetic-Handle adapter.
- Whether D-02's cross-phase amendment is its own dedicated SDK plan or rides on top of the assert-dispatched-cwd plan (recommendation: dedicated plan for commit-history clarity).
- Whether `<destructive_git_prohibition>` gets cross-backend-renamed (recommendation: stay git-anchored).
- Test-flip count on `cmd-parallel-jj.test.ts` post-D-02 (planner/research-time count).

## Deferred Ideas

- `workflow.max_concurrency` config knob — deferred to Phase 14 dogfood data.
- Cross-backend rename/extension of `<destructive_git_prohibition>` — out of Phase 11 scope.
- Whether to drop `worktree.cleanup-wave` CLI alias entirely vs keep as thin shim around `workspace.parallel.fan-in` — planner-level decision during research.
