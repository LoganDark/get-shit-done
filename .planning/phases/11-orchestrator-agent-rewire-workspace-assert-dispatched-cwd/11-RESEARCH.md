# Phase 11: Orchestrator + agent rewire + workspace.assert-dispatched-cwd — Research

**Researched:** 2026-05-16
**Domain:** Consumer migration of the cross-backend `vcs.workspace.parallel.*` surface (shipped Phase 9 + Phase 10) into workflow markdown (`execute-phase.md`, `quick.md`), the executor agent prompt (`gsd-executor.md`), the CJS bridge (`bin/lib/worktree-safety.cjs`), and one new SDK query verb (`workspace.assert-dispatched-cwd`). Plus a cross-phase amendment that retires the Phase 9 eager-bookmark loop.
**Confidence:** HIGH — every claim traces to a `file:line` read live during research, CONTEXT.md locked-decision, or Phase 9/10 shipped surface. No new API design here; this phase is rewires + deletions + one thin SDK verb.

## Summary

Phase 11 is a **consumer-side migration**, not new architecture. Phases 9+10 already shipped the `vcs.workspace.parallel.{dispatch,fanIn}` verbs on both backends — Phase 11 deletes the ~440 LOC of raw-git templated shell that today is replicated across `execute-phase.md` (~290) and `quick.md` (~150), replaces it with `gsd-sdk query workspace.parallel.{dispatch,fan-in}` calls, collapses four worktree-aware guards in `gsd-executor.md:412-555` into a single `gsd-sdk query workspace.assert-dispatched-cwd --cwd .` call, and shrinks `executeWorktreeWaveCleanupPlan` to a single `vcs.workspace.parallel.fanIn` delegation while preserving its ADR-0004 `_deps={}` injection seam.

Three SDK CLI registrations land: `workspace.assert-dispatched-cwd` (NEW thin verb — wraps `vcs.workspace.list()` for the agent precondition), `workspace.parallel.dispatch` (CLI bridge to the existing adapter verb), and `workspace.parallel.fan-in` (CLI bridge that takes a `ParallelDispatchHandle` JSON + a `ParallelAgentResult[]` array — Handle stays in shell variable per D-01, results fed via stdin or `--results @file`). The `worktree.cleanup-wave` CLI alias either becomes a thin shim around `workspace.parallel.fan-in` for back-compat or is removed; planner decides.

A **cross-phase amendment (D-02)** retires the Phase 9 eager-bookmark-create loop at `sdk/src/vcs/jj/parallel.ts:224-244` and the matching batched delete at `:447-465`. Subagent heads are referenced by `vcs.workspace.list()` + each workspace's `@`. Phase 9 contract tests in `cmd-parallel-jj.test.ts` that assert bookmark presence flip to workspace-listing assertions; TEST-14 `divergent()` stays. Recommendation: land D-02 as its own SDK plan EARLY in the Phase 11 sequence so the test-shape cascade is visible in commit history.

The load-bearing tradeoff (D-06): the orchestrator-side `deletions_detected` pre-check in `executeWorktreeWaveCleanupPlan` drops. The agent's `<task_commit_protocol>` step 6 (per-commit `gsd-sdk query diff --name-status --range "HEAD~1..HEAD"`) becomes the load-bearing defense against #3091-class destructive merges. Acceptable because per-commit is finer-grained than per-merge.

**Primary recommendation:** Sequence Phase 11 as 6 plans: (1) D-02 cross-phase amendment + Phase 9 test-flip; (2) new SDK verb + CLI registrations; (3) `worktree-safety.cjs` body shrink; (4) `gsd-executor.md` guard collapse + `worktree-path-safety.md` rename + body rewrite; (5) `execute-phase.md` rewire; (6) `quick.md` rewire. Plans 4-5-6 can be parallelized once 1-2-3 land.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VCS-20 | `gsd-sdk query workspace.assert-dispatched-cwd` SDK verb — backend-opaque sanity check that calling process is inside a dispatched workspace. | New thin handler at `sdk/src/query/workspace-assert-dispatched-cwd.ts`; wraps `vcs.workspace.list()`; returns `{ ok, workspaceName, workspacePath, isPrimary }` per D-03. Catalog registration alongside `worktree.cleanup-wave` at `command-static-catalog-domain.ts:63`. |
| PROMPT-06 | Delete raw-git block in `execute-phase.md:521-810` (~290 LOC). | Block verified at execute-phase.md lines 521-820 (the lines extend further than the original "510-810" estimate; the cleanup-tail snippet ends ~line 808 and "When to skip step 5.5" notes run to ~820). Replacement: ~30 LOC shell block — Handle JSON to shell var via dispatch CLI, sequential `Agent()` loop preserved per D-07 / Pitfall 5 mitigation, fan-in CLI with results array via stdin. |
| PROMPT-07 | Delete raw-git block in `quick.md:660-810` (~150 LOC). | Block verified at quick.md lines 660-810 (Step 6 spawn + Step 6.0 cleanup). Quick mode typically N=1; same parallel verbs work at N=1 trivially. `QUICK_WORKTREE_MANIFEST` mktemp eliminated per D-01. |
| PROMPT-08 | Collapse `gsd-executor.md:412-555` worktree-aware blocks (4 blocks) to one `workspace.assert-dispatched-cwd` call. | Lines 412-440 (step 0a cwd-drift sentinel), 442-458 (step 0b abs-path safety), 460-481 (step 0 HEAD-namespace + protected-ref deny-list), and a fourth implicit block — the `[ -f .git ]` worktree-detection scattered through these. All four collapse to one call at the start of `<task_commit_protocol>` per D-04. `<destructive_git_prohibition>` (lines 542-574) STAYS per D-04 (it's about ambient destructive ops inside the workspace, not workspace-locating). |
| PROMPT-09 | Rename `references/worktree-path-safety.md` → `dispatch-cwd-safety.md`; rewrite body backend-agnostic; update all referrers. | Body to rewrite verified at 89 lines (3 sections). Referrers verified by `grep -rn worktree-path-safety`: `execute-phase.md:586` (text reference in `<worktree_branch_check>`), `execute-phase.md:590` (text in `<parallel_execution>`), `execute-phase.md:613` (the load via `@~/.claude/get-shit-done/references/worktree-path-safety.md`), `docs/INVENTORY.md:302`, `docs/test-triage/jj-bugs.md:21,73`, `.changeset/fix-3097-3099-executor-worktree-path.md:11`, and the test file `tests/bug-3097-3099-executor-worktree-path-safety.test.cjs` (4 internal hits — test asserts the file exists + contains sentinel/path-guard content; test must flip to assert the new file name + the single-verb-call shape). |
| PARALLEL-06 | `dispatch({ plan, maxConcurrency })` input field honored end-to-end. | Field already declared on `ParallelDispatchOpts` at `sdk/src/vcs/types.ts:464-469`. Both backend bodies currently ignore it (jj serializes via single orchestrator process; git serializes via `spawnSync` per Pitfall 5). Phase 11 plumbs it through the CLI surface — dispatch CLI accepts `--max-concurrency N`; workflow call sites pass `undefined` per D-07. No backend body change required; the field is advisory. |

</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Workspace dispatch (create N workspaces, hand back Handle) | SDK adapter (`vcs.workspace.parallel.dispatch`) | CLI bridge (`gsd-sdk query workspace.parallel.dispatch`) | Phase 9/10 already locked the verb on the adapter; Phase 11 only adds the CLI bridge. |
| Subagent process spawn (Claude Code `Agent()` calls) | Workflow orchestrator (`execute-phase.md`, `quick.md`) | — | `Agent()` is a Claude Code runtime primitive; the orchestrator owns the loop. Sequential one-`Agent()`-per-message dispatch preserved per D-07 / Pitfall 5. |
| Workspace fan-in (merge all back into main, classify failures) | SDK adapter (`vcs.workspace.parallel.fanIn`) | CLI bridge (`gsd-sdk query workspace.parallel.fan-in`) | Adapter owns merge mechanics; CLI bridge accepts Handle JSON + results array, prints `FanInResult` JSON. |
| Workspace-set discovery for fan-in | SDK adapter (`vcs.workspace.list()`) | CLI bridge (inside fan-in handler) | D-01 invariant: no orchestrator-managed sidecar files. Fan-in CLI calls `vcs.workspace.list()` filtered by phase-scope (either internally via `gsd/phase-{NN}-` prefix, or via a new `--phase NN` flag). |
| Dispatched-cwd predicate (agent precondition) | SDK verb (`workspace.assert-dispatched-cwd`) | Agent prompt (one call at start of `<task_commit_protocol>`) | D-03 minimal predicate: cwd resolves to a non-primary entry in `vcs.workspace.list()`. Agent stays backend-opaque. |
| Per-commit deletion check (#3091 defense) | Agent prompt (`<task_commit_protocol>` step 6) | — | D-06 load-bearing tradeoff: defense moves from orchestrator-side `executeWorktreeWaveCleanupPlan` pre-check to agent-side per-commit check. Step 6 already exists at `gsd-executor.md:527-537` and uses `gsd-sdk query diff --name-status --range "HEAD~1..HEAD"`. |
| Destructive-op prohibition (no `git clean` / `git rm`) | Agent prompt (`<destructive_git_prohibition>`) | — | Stays git-anchored per D-04. Cross-backend extension (jj abandon, jj op restore) is out-of-scope. |

## Standard Stack

This is a consumer-migration phase — no new libraries. The stack is the already-shipped surface:

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `sdk/src/vcs/types.ts::VcsWorkspaceParallel` | Phase 9 locked | Cross-backend dispatch/fanIn interface | Already shipped on both backends |
| `sdk/src/vcs/jj/parallel.ts::performJjParallel{Dispatch,FanIn}` | Phase 9 shipped | jj-side bodies | `octopus.ts` + `reap.ts` composition layer |
| `sdk/src/vcs/git/parallel.ts::performGitParallel{Dispatch,FanIn}` | Phase 10 shipped | git-side bodies | Loop of 2-parent merges; halt-on-conflict; re-callable |
| `sdk/src/vcs/jj/incomplete-work.ts::{appendIncomplete,readIncomplete}` | Phase 4 shipped | Cross-backend queue file home | Despite the `jj/` path — cross-backend per ARCHITECTURE.md Integration #3 |
| `bin/lib/worktree-safety.cjs::executeWorktreeWaveCleanupPlan` | Phase 7 shipped | Caller stays; body shrinks per D-05 | ADR-0004 policy owner; `_deps={}` injection seam |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `sdk/src/query/head-ref.ts` | Phase 5 shipped | Precedent for thin `--cwd` flag-plumbing | The shape `workspace.assert-dispatched-cwd` mirrors |
| `sdk/src/query/worktree.ts::worktreeCleanupWave` | Phase 7 shipped | Existing CLI handler that shells to gsd-tools | Precedent for "CLI handler that just routes to the CJS executor" — but the new fan-in handler routes directly to the SDK verb instead |
| `sdk/src/query/command-static-catalog-domain.ts:63` | shipped | Catalog registration site | Three new entries land alongside `worktree.cleanup-wave` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Stateless `vcs.workspace.list()` discovery in fan-in | Read Handle JSON from disk (manifest file at `WAVE_WORKTREE_MANIFEST`) | D-01 invariant locks discovery: persistent state is VCS state only, no orchestrator-managed sidecars. The `manifest` field on the Handle survives as informational metadata but is NOT the source of truth for fan-in. |
| `--results @file` flag for fan-in results array | Always-stdin | Both are reasonable. Recommendation (planner discretion per CONTEXT.md): **support BOTH** — `--results @file` is consistent with existing `--manifest <path>` pattern at `worktree.cleanup-wave`; default to stdin when `--results` is absent. This matches `gsd-sdk query commit` which accepts either flag-supplied or stdin-piped input. |
| New `--phase NN` flag on fan-in CLI for workspace filtering | Filter inside the verb using the Handle's `phaseNumber` field | The Handle already carries `phaseNumber` per `types.ts:495`. Fan-in CLI just trusts the Handle. No new `--phase` flag needed. `vcs.workspace.list()` does not currently filter — fan-in filters in-handler by `gsd/phase-{phaseTag}-` workspace-name prefix per the existing jj/parallel.ts:489-493 surplus-bookmark sweep pattern. |

**Installation:** No new packages. Phase 11 is pure migration / rewire.

**Version verification:** No npm packages installed. Verified all referenced SDK surfaces against the live tree on 2026-05-16:
- `sdk/src/vcs/types.ts:447-518` — `ParallelDispatchHandle` / `ParallelAgentResult` / `FanInResult` types present.
- `sdk/src/vcs/jj/parallel.ts:543` lines — `performJjParallelDispatch` + `performJjParallelFanIn` exported.
- `sdk/src/vcs/git/parallel.ts` — git-side bodies present (Phase 10 shipped).
- `bin/lib/worktree-safety.cjs:417-516` (`executeWorktreeWaveCleanupPlan`) + `:518-556` (`cmdWorktreeCleanupWave`) — both present.

## Package Legitimacy Audit

No external packages installed by this phase. Skipped per protocol's skip condition.

## Architecture Patterns

### System Architecture Diagram

```
                       ┌──────────────────────────────────┐
                       │  execute-phase.md / quick.md     │
                       │  (workflow orchestrator)          │
                       └────────┬─────────────────────────┘
                                │
                                │  ① gsd-sdk query workspace.parallel.dispatch
                                │     --phase NN --main-bookmark <name> --plan @file
                                ▼
                       ┌──────────────────────────────────┐
                       │  CLI bridge (NEW)                │
                       │  query/workspace-parallel-       │
                       │  dispatch.ts                      │
                       └────────┬─────────────────────────┘
                                │  invokes vcs.workspace.parallel.dispatch
                                ▼
        ┌────────────────────────────────────────────────────────────┐
        │  SDK adapter (Phase 9/10 shipped)                          │
        │  • jj/parallel.ts::performJjParallelDispatch              │
        │  • git/parallel.ts::performGitParallelDispatch            │
        │  returns ParallelDispatchHandle (frozen JSON)              │
        └────────┬─────────────────────────────────────────────────┘
                 │  stdout: { phaseRoot, workspaces:[{name,path,baseRev,agentId}], … }
                 ▼
        ┌──────────────────────────────────┐
        │  HANDLE_JSON shell var            │
        │  (orchestrator; no disk file)     │
        └────────┬─────────────────────────┘
                 │
                 │  ② sequential Agent() loop (D-07 / Pitfall 5 mitigation)
                 │     for ws in .workspaces[]: Agent(cwd=ws.path, …)
                 ▼
        ┌────────────────────────────────────────────────────────────┐
        │  N subagent processes (Claude Code Agent() instances)     │
        │  each runs gsd-executor.md prompt in its workspace path    │
        │                                                            │
        │  ③ at startup:                                             │
        │     gsd-sdk query workspace.assert-dispatched-cwd --cwd . │
        │     → returns { ok, workspaceName, workspacePath, isPrimary }
        │     → halt if !ok                                          │
        │                                                            │
        │  ④ per task commit (step 6 D-06 defense):                 │
        │     gsd-sdk query diff --name-status --range "HEAD~1..HEAD"
        │     → warn on unexpected deletions                         │
        └────────┬─────────────────────────────────────────────────┘
                 │  results: [{agentId, exitCode, lastChangeId?, stderr?}, …]
                 │  (orchestrator collects via Agent() return)
                 ▼
        ┌──────────────────────────────────┐
        │  RESULTS_JSON shell var           │
        └────────┬─────────────────────────┘
                 │
                 │  ⑤ gsd-sdk query workspace.parallel.fan-in
                 │     --handle @<(echo "$HANDLE_JSON")
                 │     --results @<(echo "$RESULTS_JSON")
                 ▼
        ┌──────────────────────────────────┐
        │  CLI bridge (NEW)                 │
        │  query/workspace-parallel-fan-in.ts
        └────────┬─────────────────────────┘
                 │  invokes vcs.workspace.parallel.fanIn(handle, results)
                 ▼
        ┌────────────────────────────────────────────────────────────┐
        │  SDK adapter (Phase 9/10 shipped)                          │
        │  jj: single N-parent jj new + batched bookmark delete      │
        │  git: loop of 2-parent merges, halt-on-conflict             │
        │  returns FanInResult                                        │
        └────────┬─────────────────────────────────────────────────┘
                 │  { merged, conflicted, conflictedPaths, incompleteQueued,
                 │    failedReaped, surplusBookmarks }
                 ▼
        ┌──────────────────────────────────┐
        │  orchestrator branches on result  │
        │  on conflict: halt + surface to user
        │  on clean:    advance to next wave
        └──────────────────────────────────┘

         Parallel path (CJS bridge):
                bin/lib/worktree-safety.cjs::executeWorktreeWaveCleanupPlan(plan, _deps={})
                  │
                  │  D-05: body shrinks to reconstructHandleFromLegacyPlan(plan)
                  │        + vcs.workspace.parallel.fanIn(handle, results)
                  │  ADR-0004 _deps={} seam preserved
                  │  pending[] return-shape rebuilt from FanInResult.conflictedPaths /
                  │  failedReaped / incompleteQueued
                  ▼
                  (same FanInResult; same downstream classifier)
```

### Recommended Project Structure

```
sdk/src/query/
├── workspace-assert-dispatched-cwd.ts   # NEW — thin handler (~30 LOC, mirrors head-ref.ts)
├── workspace-parallel-dispatch.ts       # NEW — CLI bridge, accepts --plan/--phase/etc, prints Handle JSON
├── workspace-parallel-fan-in.ts         # NEW — CLI bridge, accepts --handle/--results, prints FanInResult JSON
├── worktree.ts                          # existing — keep or alias as thin shim to fan-in
└── command-static-catalog-domain.ts     # +3 entries alongside line 63

get-shit-done/
├── references/
│   └── dispatch-cwd-safety.md           # RENAMED from worktree-path-safety.md, body rewritten
└── workflows/
    ├── execute-phase.md                 # lines 521-810 deleted, replaced with ~30 LOC
    └── quick.md                         # lines 660-810 deleted, replaced with ~30 LOC

agents/
└── gsd-executor.md                      # lines 412-555 collapse to one workspace.assert-dispatched-cwd call

bin/lib/
└── worktree-safety.cjs                  # executeWorktreeWaveCleanupPlan body shrinks per D-05;
                                          # cmdWorktreeCleanupWave decision: keep as alias OR remove

sdk/src/vcs/jj/parallel.ts               # D-02 amendment: drop lines 224-244 (eager bookmark create)
                                          # and lines 447-465 (batched delete)

sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts
                                         # bookmark-presence assertions flip to workspace-listing
                                          # TEST-14 divergent() assertion stays
```

### Pattern 1: Thin SDK query handler (mirror head-ref.ts)

**What:** A query handler that accepts `--cwd`, builds the adapter, calls one method, returns shaped JSON.
**When to use:** Any new SDK CLI verb that bridges to an existing adapter surface.
**Example:**
```typescript
// Source: sdk/src/query/head-ref.ts (Phase 5 plan 05-01 Task 2)
import { createVcsAdapter } from '../vcs/index.js';
import type { QueryHandler } from './utils.js';

export const workspaceAssertDispatchedCwdQuery: QueryHandler = async (args, projectDir) => {
  let cwd = projectDir;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) { cwd = args[++i]; }
  }
  const vcs = createVcsAdapter(cwd);
  const workspaces = vcs.workspace.list();           // WorkspaceInfo[] — { path, rev, locked }
  const ctx = vcs.workspace.context();               // { effectiveRoot, mode, isLinked }
  // Identify which entry matches cwd; primary == first entry by convention on jj,
  // the entry with mode === 'main' on git per WorkspaceContext shape.
  const match = workspaces.find((w) => w.path === ctx.effectiveRoot);
  const isPrimary = !ctx.isLinked;  // ctx.mode === 'main' equivalent
  return {
    data: {
      ok: match !== undefined && !isPrimary,
      workspaceName: match?.path.split('/').pop() ?? null,
      workspacePath: match?.path ?? null,
      isPrimary,
    },
  };
};
```

### Pattern 2: Workflow shell block — Handle JSON in shell var (D-01)

**What:** Capture dispatch CLI's JSON output to a shell variable, iterate `.workspaces[]` via `jq`, sequential `Agent()` loop.
**When to use:** Both `execute-phase.md` and `quick.md` replacement blocks.
**Example:**
```bash
# Replacement for execute-phase.md:521-580 (dispatch + WAVE_WORKTREE_MANIFEST mktemp).
# Builds plan array from this wave's plan_ids, calls dispatch, holds Handle in shell var.
PLAN_JSON=$(jq -nc --argjson ids "$WAVE_PLAN_IDS" '[$ids[] | {agentId: ., planId: .}]')
HANDLE_JSON=$(gsd-sdk query workspace.parallel.dispatch \
  --phase "$PHASE_NUMBER" \
  --main-bookmark "$EXPECTED_BRANCH" \
  --plan "$PLAN_JSON")
# (Optional: --max-concurrency "$MAX" — workflow passes nothing; runtime cap applies.)

# Validate: dispatch returned ok and N workspaces.
N=$(echo "$HANDLE_JSON" | jq '.workspaces | length')
[ "$N" = "0" ] && { echo "FATAL: dispatch returned no workspaces" >&2; exit 1; }

# Replacement for execute-phase.md:535-650 (sequential Agent() loop).
# Sequential one-Agent()-per-message dispatch preserved per D-07 / Pitfall 5.
# Each Agent() runs in the workspace cwd; the agent's first step is
# workspace.assert-dispatched-cwd — no orchestrator-side guards needed.
RESULTS_JSON='[]'
for i in $(seq 0 $((N - 1))); do
  WS_NAME=$(echo "$HANDLE_JSON" | jq -r ".workspaces[$i].name")
  WS_PATH=$(echo "$HANDLE_JSON" | jq -r ".workspaces[$i].path")
  AGENT_ID=$(echo "$HANDLE_JSON" | jq -r ".workspaces[$i].agentId")
  # [checkpoint] heartbeat preserved from line 515
  echo "[checkpoint] phase $PHASE_NUMBER wave $N/$M plan $AGENT_ID starting"
  # Agent() invocation (Claude Code primitive — one per message, run_in_background)
  # ... (Agent() text body stays substantially the same; cwd is now $WS_PATH)
  # On Agent() return, append {agentId, exitCode, lastChangeId?, stderr?} to RESULTS_JSON.
done

# Replacement for execute-phase.md:743-808 (worktree.cleanup-wave + cleanup-tail snippet).
# Fan-in: pipe results via stdin; pass Handle via process substitution (or --handle @file).
FAN_RESULT=$(echo "$RESULTS_JSON" \
  | gsd-sdk query workspace.parallel.fan-in --handle @<(echo "$HANDLE_JSON"))
CONFLICTED=$(echo "$FAN_RESULT" | jq -r '.conflicted')
if [ "$CONFLICTED" = "true" ]; then
  echo "FAN-IN HALTED on in-tree conflict — see $(echo "$FAN_RESULT" | jq -r '.conflictedPaths | join(", ")')" >&2
  echo "Resolve conflicts manually, then re-run the same command (fan-in is idempotent per D-03)."
  exit 1
fi
```

### Pattern 3: Synthetic-Handle reconstruction in CJS bridge (D-05)

**What:** Inside `executeWorktreeWaveCleanupPlan`, reconstruct a `ParallelDispatchHandle` from the legacy `plan.entries[]` shape so it can feed `vcs.workspace.parallel.fanIn`.
**When to use:** Inside the body shrink. Internal helper; not exported.
**Example:**
```javascript
// Source: D-05 + Claude's Discretion item (helper naming)
function reconstructHandleFromLegacyPlan(plan) {
  // legacy plan.entries[i] shape: {worktree_path, branch, expected_base, main_bookmark, ...}
  // Synthetic ParallelDispatchHandle satisfying types.ts:483-518.
  const phaseTag = String(plan.phaseNumber ?? 0).padStart(2, '0');
  return Object.freeze({
    phaseRoot: plan.repoRoot,
    phaseNumber: plan.phaseNumber ?? 0,
    mainBookmark: plan.entries[0]?.main_bookmark ?? '',
    manifest: '',  // legacy callers had no manifest path — empty string per the field's
                   // documented "absolute path to WAVE_WORKTREE_MANIFEST" semantics
    workspaces: Object.freeze(plan.entries.map((e, i) => Object.freeze({
      name: `legacy-${i + 1}`,
      path: e.worktree_path,
      baseRev: e.expected_base,
      agentId: e.branch.replace(/^worktree-agent-/, ''),  // best-effort agentId from branch name
      baselineOpId: undefined,
    }))),
  });
}

function executeWorktreeWaveCleanupPlan(plan, _deps = {}) {
  const entries = Array.isArray(plan?.entries) ? plan.entries : [];
  if (entries.length === 0) {
    return { ok: true, action: plan?.action ?? 'skip', reason: 'empty_plan', entries: [], pending: [] };
  }
  const vcs = _deps.vcs ?? createVcsAdapter(plan.repoRoot, {});
  const handle = reconstructHandleFromLegacyPlan(plan);
  // Synthesize results — legacy callers don't track per-agent exit codes; assume all clean.
  // Crashed-agent classification (D-06) moves to agent-side per-commit defense.
  const results = handle.workspaces.map((ws) => ({ agentId: ws.agentId, exitCode: 0 }));
  const fanIn = vcs.workspace.parallel.fanIn(handle, results);
  // Rebuild the pending[] return shape from FanInResult fields so callers
  // (wave-cleanup-executor.test.cjs, bug-3384-worktree-cleanup-manifest.test.cjs) stay green.
  const pending = [];
  for (const path of fanIn.conflictedPaths) {
    pending.push({ reason: 'merge_conflict', file: path });
  }
  for (const name of fanIn.failedReaped) {
    pending.push({ reason: 'crashed_agent', subagentName: name });
  }
  // ... etc — see "Risk register" for the contract-mapping table.
  return { ok: fanIn.conflicted === false && fanIn.failedReaped.length === 0,
           action: plan.action, entries: handle.workspaces, pending };
}
```

### Anti-Patterns to Avoid

- **Writing a manifest file from dispatch CLI and reading it from fan-in CLI:** Violates D-01. Persistent state is VCS state only.
- **Inspecting `vcs.kind` inside agent prompts:** Anti-feature per REQUIREMENTS.md Out-of-Scope (`GSD_BACKEND_KIND` env var). The cross-backend verb hides the asymmetry.
- **Parallel `Agent()` dispatch (multiple `Agent()` calls in one orchestrator message):** Still forbidden per Pitfall 5 (`.git/config.lock` race). The runtime cap from sequential `run_in_background: true` is the load-bearing structural justification for D-07.
- **Adding a `workflow.max_concurrency` config knob:** Deferred to Phase 14 per D-07. Don't propose during planning.
- **Cross-backend renaming of `<destructive_git_prohibition>` to `<destructive_vcs_prohibition>`:** Out of Phase 11 scope per D-04. Future cleanup phase if useful.
- **Removing the per-commit deletion check at `gsd-executor.md:527-537`:** It becomes load-bearing per D-06. Don't weaken it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Workspace discovery for fan-in | Walk filesystem / parse `git worktree list --porcelain` from shell | `vcs.workspace.list()` already cross-backend; filter by `gsd/phase-{NN}-` prefix in fan-in body | Phase 9/10 shipped this; raw-git in shell is exactly what Phase 11 deletes. |
| Subagent process spawning | A `worker_threads`-based adapter scheduler | Claude Code's `Agent()` primitive in workflow markdown | Out-of-scope per REQUIREMENTS Out-of-Scope row. Parallelism lives at the Agent() boundary, not inside the adapter. |
| Handle JSON persistence | mktemp manifest file as wire-protocol between dispatch and fan-in | Shell variable in orchestrator scope | D-01 invariant — no orchestrator-managed sidecars. |
| Fan-in results format | Bespoke shell-line format | JSON array fed via stdin (or `--results @file`) | Matches the `ParallelAgentResult[]` adapter signature exactly; no parser to write. |
| Subagent precondition check | Replicate the 4 worktree-aware guards in every agent prompt | One `gsd-sdk query workspace.assert-dispatched-cwd --cwd .` call | D-04 collapse; backend stays opaque. |
| Per-commit deletion defense | Re-implement `git diff --diff-filter=D` in the orchestrator post-merge | Agent-side `gsd-sdk query diff --name-status --range "HEAD~1..HEAD"` (existing step 6) | D-06 — finer-grained per-commit detection beats per-merge orchestrator check. |
| ADR-0004 worktree-safety policy ownership | Move the policy to a new file | Keep `worktree-safety.cjs` as canonical owner; shrink body to delegation only | Public signature preserved per D-05 / Concern 1 in ARCHITECTURE.md. |

**Key insight:** Phase 11 is mostly DELETIONS. The right architectural instinct is "what can I delete?" not "what should I build?" The only NEW code is one ~30-LOC SDK query handler (`workspace-assert-dispatched-cwd.ts`) and two thin CLI bridges. Everything else is body-shrink + rewire.

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no persistent data stores rename their schema this phase. `incomplete-work.md` queue file shape is unchanged. | None |
| Live service config | None — no external services (n8n, Tailscale, etc.) carry references to renamed identifiers | None |
| OS-registered state | None — no OS task registrations carry the old name. | None |
| Secrets/env vars | `WAVE_WORKTREE_MANIFEST` and `QUICK_WORKTREE_MANIFEST` env vars are eliminated per D-01. They were set via `export WAVE_WORKTREE_MANIFEST=$(mktemp ...)` in shell, not persisted across processes. **Code edit only** — no migration; their lifecycle is per-wave / per-task. | Code edit to `execute-phase.md` (line 528-532) and `quick.md` (line 666-670). Tests `tests/bug-3384-worktree-cleanup-manifest.test.cjs` (lines 215, 218, 220, 226, 230, 232) hard-assert presence of these envvar names in workflow markdown — those assertions FLIP to "the new dispatch verb is called and its Handle JSON shell variable shape matches" rather than asserting the mktemp manifest path pattern. Test `tests/bug-3425-worktree-cleanup-cwd-pin.test.cjs:27` asserts presence of the `gsd-sdk query worktree.cleanup-wave --manifest "$WAVE_WORKTREE_MANIFEST"` line — must flip to assert the new `workspace.parallel.fan-in` call. |
| Build artifacts | `sdk/dist-cjs/vcs/types.d.ts:448`, `sdk/dist-cjs/vcs/jj/parallel.d.ts:11,49`, `sdk/dist-cjs/vcs/git/parallel.d.ts:86` reference `WAVE_WORKTREE_MANIFEST` in JSDoc. These regenerate from the TS source on the next `pnpm build`. The TS sources at `sdk/src/vcs/types.ts:497` and `sdk/src/vcs/jj/parallel.ts:11,157,246` keep the JSDoc references (the SDK still WRITES a manifest file from `dispatch`; the field stays for SDK-side observability — the CHANGE is that orchestrators no longer treat it as a wire-protocol input to fan-in). | Reinstall on dist-cjs after build; SDK-side manifest persists per the type contract — only workflow markdown stops touching it. |

**The canonical question — answered:** After every file in the repo is updated, what runtime systems still have the old string cached, stored, or registered? **Answer: only the SDK's own manifest writer at `sdk/src/vcs/jj/parallel.ts:252-265`, which is intentional and unchanged. The orchestrator's removal of the mktemp pattern is purely shell-state.**

## Common Pitfalls

### Pitfall 1: Test-flip cascade for D-02 cross-phase amendment

**What goes wrong:** Phase 9 tests assert `surplusBookmarks.length === 0` AFTER fan-in deletes the eager-created bookmarks. Once D-02 drops the eager create at `:224-244` AND the batched delete at `:447-465`, the bookmarks never exist — but the assertion still passes trivially (no bookmarks → no surplus). The REAL test-coverage gap: nothing asserts that the workspace SET is properly cleaned up after fan-in. Tests must FLIP to `jj workspace list` equivalents.
**Why it happens:** D-02 changes WHAT we track (workspaces, not bookmarks), but `surplusBookmarks` is a vestigial field on `FanInResult` (Phase 9 D-08 locked it before D-02 was decided). The field doesn't disappear, but its meaning shifts: it becomes "any `gsd/phase-{NN}-subagent-*` bookmarks that somehow showed up despite us never creating them" — effectively always-empty. The orphan workspaces are the real risk.
**How to avoid:** After dropping the eager bookmark create, replace the post-fanIn `bookmark list` assertion (currently at `parallel.ts:478-493`) with a `vcs.workspace.list()` assertion filtered by the `phase-{phaseTag}-subagent-` workspace-name prefix. Workspaces should be reaped/forgotten by the existing reap path on the clean fan-in branch (which still runs per D-02 — only the bookmark side retires).
**Warning signs:** Phase 9 tests still pass after the D-02 amendment but offer no real coverage. CI shows "8/8 tests green" but Phase 11 dogfood reveals stale subagent workspaces accumulating across waves.

### Pitfall 2: D-06 load-bearing defense relies on per-commit, not per-merge — easy to miss in code review

**What goes wrong:** D-05 drops the orchestrator-side `deletions_detected` pre-check that historically caught a class of bugs where an agent committed a deletion of a critical file and the orchestrator merged blindly (#3091-class). The new defense is at the AGENT side — `gsd-executor.md:527-537` runs `gsd-sdk query diff --name-status --range "HEAD~1..HEAD"` after every commit and warns on `D`-status entries. **Reviewers reading the Phase 11 PR will see the orchestrator-side check DELETED and may not realize the agent-side check is the new defense.**
**Why it happens:** The orchestrator-side check is in `worktree-safety.cjs:442-450` (one block). The agent-side check is in `gsd-executor.md:527-537` (existing, unchanged). The PR diff shows a deletion in worktree-safety.cjs and zero changes in gsd-executor.md — making the defense relocation invisible.
**How to avoid:** The Phase 11 SUMMARY.md must explicitly call out D-06 as a load-bearing tradeoff. The PLAN.md for the worktree-safety.cjs body-shrink plan must include a verification step: "confirm `gsd-executor.md:527-537` is unchanged AND that no plan in this phase modifies the `<task_commit_protocol>` step 6 deletion-check block."
**Warning signs:** A future agent prompt refactor weakens or removes the per-commit deletion check, silently re-opening the #3091 risk. Mitigation: a guard test that asserts `agents/gsd-executor.md` contains the literal `gsd-sdk query diff --name-status --range "HEAD~1..HEAD"` invocation (or its semantic equivalent under the SDK's eventual `--diff-filter` pass-through sweep TODO).

### Pitfall 3: `quick.md` uses `${USE_WORKTREES}` not `${USE_WORKTREES_FOR_PLAN}` — single-plan model

**What goes wrong:** `execute-phase.md` per-plan-worktree-gate (step 2.5) computes a per-plan `USE_WORKTREES_FOR_PLAN`; `quick.md` is single-plan and uses the project-level `USE_WORKTREES` directly at line 666 and line 766. A planner who copies the execute-phase.md replacement block verbatim into quick.md will introduce an undefined variable reference.
**Why it happens:** The two workflows have similar shape but different scoping — execute-phase.md iterates a wave of plans; quick.md is one task = one plan = one executor.
**How to avoid:** The quick.md rewrite reads `USE_WORKTREES` not `USE_WORKTREES_FOR_PLAN`. The dispatch CLI is still called (it works at N=1 trivially per D-09) but only inside the `[ "$USE_WORKTREES" != "false" ]` branch.
**Warning signs:** `quick.md` rewrite calls `workspace.parallel.dispatch` even when `USE_WORKTREES=false` and gets back a Handle for a workspace it doesn't need. Smoke test by setting `workflow.use_worktrees=false` in `.planning/config.json` and running a quick task.

### Pitfall 4: `cmdWorktreeCleanupWave` back-compat — third-party callers

**What goes wrong:** The CLI alias `gsd-sdk query worktree.cleanup-wave` is currently registered at `sdk/src/query/command-static-catalog-domain.ts:63-64` and consumed by `execute-phase.md:774` + `quick.md:787`. Phase 11 deletes both call sites in workflow markdown. But other callers may exist — tests, external scripts, downstream forks.
**Why it happens:** The CLI alias has been in the codebase since Phase 7 and might be referenced from places not surveyed in CONTEXT.md.
**How to avoid:** Before removing `cmdWorktreeCleanupWave`, grep the whole repo for `worktree.cleanup-wave` and `worktree cleanup-wave`. If only the two workflow callers + the two catalog registrations exist, removal is safe. Otherwise: keep the alias as a thin shim that calls `workspace.parallel.fan-in` internally (per the Deferred Ideas section of CONTEXT.md). The shim is ~10 LOC.
**Warning signs:** External script breakage post-Phase 11 close. Mitigation: emit a deprecation warning if the alias is invoked, pointing users at the new verb.

### Pitfall 5: `vcs.workspace.list()` does NOT filter by phase — fan-in must filter in-handler

**What goes wrong:** `vcs.workspace.list()` returns ALL workspaces (`WorkspaceInfo[]` per `types.ts:185-189` — just `{path, rev, locked}` shape). When the fan-in CLI runs, the list includes the primary workspace + any old workspaces from prior phases or other features. Without filtering, fan-in attempts to merge unrelated workspaces and reap unrelated heads.
**Why it happens:** The Phase 4 `workspace.list()` API has no scoping arg — it's a thin wrapper over `jj workspace list -T json` / `git worktree list --porcelain`.
**How to avoid:** Fan-in CLI filters in-handler by workspace-name prefix using the Handle's `phaseNumber` field. The prefix is `phase-{phaseTag}-subagent-` per `octopus.ts:30` zero-padded convention. The pattern is already in `jj/parallel.ts:489-493` (surplus-bookmark sweep) — reuse the same prefix logic. NO new `--phase NN` flag is needed; the Handle carries `phaseNumber` already.
**Warning signs:** Fan-in on a repo with multiple active phases merges/reaps the wrong workspaces. Smoke test: dispatch a phase-11 wave while a phase-12 wave is also dispatched (unlikely in production due to Phase 12's independent track, but plausible during dogfood).

### Pitfall 6: `workspace.list()` does not distinguish "currently dispatched" from "stale"

**What goes wrong:** If a previous fan-in failed (in-tree conflict halt per D-02 from Phase 10) and the user manually aborted without re-calling fan-in, the workspace still appears in `vcs.workspace.list()`. The new `workspace.assert-dispatched-cwd` verb returning `ok:true` for a STALE dispatched workspace could mislead an agent into thinking it's been freshly spawned.
**Why it happens:** D-03 deliberately keeps the predicate minimal — "cwd resolves to a non-primary entry in workspace.list()". A stale entry satisfies this.
**How to avoid:** This is acceptable per D-03 — the four guards being collapsed never distinguished "dispatched this wave" from "currently exists." The agent's correctness rests on the orchestrator's invariant that workspaces between waves are cleaned up by fan-in. Phase 11 doesn't reintroduce per-wave tracking; the minimal predicate is enough.
**Warning signs:** Confusion during incident response when a user manually inspects a stale workspace. Mitigation lives outside Phase 11 — a future `workspace.parallel.cancel(handle)` verb (deferred to v1.4+).

## Code Examples

### Workspace.assert-dispatched-cwd handler (new — mirror head-ref pattern)

```typescript
// Source: NEW — sdk/src/query/workspace-assert-dispatched-cwd.ts
//          Mirror precedent: sdk/src/query/head-ref.ts (Phase 5)
import { createVcsAdapter } from '../vcs/index.js';
import type { QueryHandler } from './utils.js';

export const workspaceAssertDispatchedCwdQuery: QueryHandler = async (args, projectDir) => {
  let cwd = projectDir;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) {
      cwd = args[i + 1];
      i++;
    }
  }
  const vcs = createVcsAdapter(cwd);
  const ctx = vcs.workspace.context();              // {effectiveRoot, mode, isLinked}
  const workspaces = vcs.workspace.list();          // WorkspaceInfo[] — {path, rev, locked}
  // A "dispatched workspace" is a non-primary entry whose path matches cwd's effectiveRoot.
  const match = workspaces.find((w) => w.path === ctx.effectiveRoot);
  const isPrimary = ctx.mode === 'main';
  return {
    data: {
      ok: match !== undefined && !isPrimary,
      workspaceName: match ? match.path.split('/').pop() ?? null : null,
      workspacePath: match?.path ?? null,
      isPrimary,
    },
  };
};
```

### Agent-side collapse (replacement for gsd-executor.md:412-481)

```bash
# Replaces the four worktree-aware blocks (steps 0a/0b/0 cwd-drift/abs-path/HEAD-namespace).
# Lives at the start of <task_commit_protocol>, before "1. Check modified files".
DISPATCH_CHECK=$(gsd-sdk query workspace.assert-dispatched-cwd --cwd .)
OK=$(echo "$DISPATCH_CHECK" | jq -r '.ok')
if [ "$OK" != "true" ]; then
  IS_PRIMARY=$(echo "$DISPATCH_CHECK" | jq -r '.isPrimary')
  WS_NAME=$(echo "$DISPATCH_CHECK" | jq -r '.workspaceName // "<unknown>"')
  echo "FATAL: cwd is not a dispatched subagent workspace (isPrimary=$IS_PRIMARY, workspaceName=$WS_NAME)." >&2
  echo "RECOVERY: cd into the workspace path the orchestrator passed to this Agent() invocation." >&2
  exit 1
fi
# All four invariants (HEAD attached to per-agent ref; cwd not drifted to primary;
# absolute paths land inside workspace; protected-ref deny-list) hold by construction:
# being in a non-primary dispatched workspace means the dispatch invariants are intact.
```

### Workflow fan-in shell block (replacement for execute-phase.md:743-808)

```bash
# Step 5.5 replacement. Reads HANDLE_JSON + RESULTS_JSON from shell scope (set in step 3
# replacement block above). No mktemp manifest file. No cleanup-tail snippet.
FAN_RESULT=$(echo "$RESULTS_JSON" \
  | gsd-sdk query workspace.parallel.fan-in --handle @<(echo "$HANDLE_JSON") 2>&1) || {
    echo "FATAL: fan-in invocation failed: $FAN_RESULT" >&2
    exit 1
  }
CONFLICTED=$(echo "$FAN_RESULT" | jq -r '.conflicted')
MERGED=$(echo "$FAN_RESULT" | jq -r '.merged | length')
INCOMPLETE=$(echo "$FAN_RESULT" | jq -r '.incompleteQueued')
FAILED_REAPED=$(echo "$FAN_RESULT" | jq -r '.failedReaped | length')
echo "[checkpoint] phase $PHASE_NUMBER wave $N/$M fan-in: merged=$MERGED conflicted=$CONFLICTED incomplete=$INCOMPLETE failedReaped=$FAILED_REAPED"
if [ "$CONFLICTED" = "true" ]; then
  echo "FAN-IN HALTED on in-tree conflict. Conflicted paths:" >&2
  echo "$FAN_RESULT" | jq -r '.conflictedPaths[]' >&2
  echo "RECOVERY: resolve conflicts in the primary workspace, then re-run this command (fan-in is idempotent per Phase 10 D-03)." >&2
  exit 1
fi
if [ "$INCOMPLETE" != "0" ] || [ "$FAILED_REAPED" != "0" ]; then
  echo "WARNING: fan-in classified $INCOMPLETE incomplete-work entries + $FAILED_REAPED crashed-and-reaped agents." >&2
  echo "Inspect $(jq -r '.phaseRoot' <<<"$HANDLE_JSON")/incomplete-work.md before continuing." >&2
fi
```

### CJS bridge body shrink (per D-05)

See **Pattern 3** above for the full reconstructHandleFromLegacyPlan shape and pending[] rebuild.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw-git templated shell block in workflow markdown (`execute-phase.md:521-810`, `quick.md:660-810`) | Single `gsd-sdk query workspace.parallel.{dispatch,fan-in}` calls | Phase 11 (this phase) | -440 LOC across both files; backend-opaque; cross-backend by construction |
| Four worktree-aware guards in agent prompt (`gsd-executor.md:412-481`) | One `gsd-sdk query workspace.assert-dispatched-cwd --cwd .` call | Phase 11 (this phase) | Agents stop running raw `git symbolic-ref` / `git rev-parse` / `[ -f .git ]` probes |
| `WAVE_WORKTREE_MANIFEST` / `QUICK_WORKTREE_MANIFEST` mktemp files as orchestrator-side wire-protocol | `ParallelDispatchHandle` JSON in shell variable; `vcs.workspace.list()` for discovery | Phase 11 (this phase) | No orchestrator-managed sidecar files per D-01 |
| Eager `jj bookmark create gsd/phase-{NN}-subagent-{idx}` in jj/parallel.ts dispatch + batched delete in fanIn | Workspaces referenced via `vcs.workspace.list()` + each workspace's `@` directly | Phase 11 D-02 cross-phase amendment | Bookmarks are wasted work on jj — octopus topology already references heads as parents |
| Orchestrator-side `deletions_detected` pre-check at `worktree-safety.cjs:442-450` | Agent-side per-commit deletion check at `gsd-executor.md:527-537` | Phase 11 D-06 load-bearing tradeoff | Finer-grained (per-commit vs per-merge); acceptable risk |
| `gsd-sdk query worktree.cleanup-wave --manifest <path>` CLI | `gsd-sdk query workspace.parallel.fan-in --handle @- --results @-` | Phase 11 (this phase) | Old alias either kept as thin shim or removed; planner decides per Pitfall 4 |
| `worktree-path-safety.md` referenced in `<execution_context>` | `dispatch-cwd-safety.md` (renamed) — body collapsed to describe the one verb call + its return shape | Phase 11 D-08 | One paragraph per former section ("the verb catches this failure mode by construction") |

**Deprecated/outdated:**
- The Phase 9 D-08 invariant "`surplusBookmarks` is empty post clean fan-in" still holds, but trivially — after D-02 retires bookmark creation, the field is always empty by construction. The field STAYS on `FanInResult` (Phase 9/10 locked the shape; Phase 11 does not extend it) but becomes vestigial on jj. Git side still populates it normally (git keeps `worktree-agent-*` branches per D-02 cross-backend asymmetry).
- The line numbers in CONTEXT.md and ROADMAP.md (e.g. "lines 521-810") are approximate. Verified live: the workflow blocks extend slightly further than documented (~820 in execute-phase.md). Planner should re-grep for the block boundaries (`# Worktree mode` / `# Sequential mode` fences) rather than trust the line numbers verbatim.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `vcs.workspace.list()` is the right discovery mechanism on BOTH backends for fan-in (no separate `--phase NN` flag needed). | Architecture Patterns / Don't Hand-Roll | LOW — the Handle's `phaseNumber` field is already part of the contract; filtering by name prefix is the same logic used in `jj/parallel.ts:489-493` for surplus-bookmark sweep. Planner verifies by reading `sdk/src/vcs/backends/git.ts::workspace.list` to confirm it returns the workspace path in a comparable shape. |
| A2 | The four worktree-aware guards being collapsed are ONLY at `gsd-executor.md:412-481` — no other agent prompts have analogous blocks. | Phase Requirements / Code Examples | MEDIUM — ARCHITECTURE.md Integration #6 audit table flags `gsd-debugger.md` (lines 20, 534-536 — text references only), `gsd-code-fixer.md` (TBD), and "30+ other agents — cheap grep audit." Planner runs a one-shot grep across `agents/*.md` for `worktree-agent-` / `[ -f .git ]` / `worktree-path-safety.md` and adds a sweep task if any other agent has the pattern. Expected: zero hits beyond gsd-executor.md. |
| A3 | The synthetic `pending[]` rebuild in `executeWorktreeWaveCleanupPlan` body-shrink keeps `wave-cleanup-executor.test.cjs` + `bug-3384-worktree-cleanup-manifest.test.cjs` green WITHOUT modification. | Architecture Patterns (Pattern 3) | MEDIUM — the existing test assertions check `pending[0].reason ∈ { 'branch_drift', 'deletions_detected', 'worktree_dirty', 'no_main_bookmark', 'merge_conflict', 'merge_failed', 'unexpected_error' }`. After D-05 + D-06, only `merge_conflict` and `unexpected_error` are producible from the new path. Tests that assert other reasons will need adjustment. Planner adds a test-flip task to either (a) update test expectations or (b) preserve the old reason taxonomy in the synthetic pending[] rebuild via best-effort mapping. |
| A4 | `--handle @-` / `--handle @<(echo ...)` process-substitution syntax works in zsh and bash equivalently for the fan-in CLI. | Code Examples | LOW — process substitution `<(...)` is bash/zsh-portable. The recommendation that fan-in CLI ALSO accept `--handle @<path>` and stdin fallback covers shells without process substitution. CLI signature: `--handle @-` reads from stdin; `--handle @<path>` reads from path; `--handle <json-string>` reads inline (escape-quoting hell — discouraged but supported). |
| A5 | Test `tests/bug-3097-3099-executor-worktree-path-safety.test.cjs` (which asserts the literal name `worktree-path-safety.md` exists + contains the cwd-drift sentinel + abs-path guard text) is the only test that breaks on the rename + body rewrite per D-08/D-09. | Phase Requirements (PROMPT-09) | MEDIUM — the test asserts: (a) execute-phase.md references `worktree-path-safety.md` in `<execution_context>`; (b) the file exists; (c) the file contains specific sentinel patterns. After rename + body rewrite, all three assertions break. The test must FLIP to assert: (a) execute-phase.md references `dispatch-cwd-safety.md`; (b) the file exists; (c) the file references the `workspace.assert-dispatched-cwd` verb. The original bug it regresses against (#3097/#3099 cwd-drift + abs-path) is still defended — but now by the SDK verb, not by inline shell sentinels. The test's INTENT survives; its shape changes. |
| A6 | The `WAVE_WORKTREE_MANIFEST` field on `ParallelDispatchHandle` (currently `manifest: string`, per `types.ts:497`) survives Phase 11 unchanged — the SDK still writes the manifest as adapter-internal observability, even though the orchestrator stops touching it. | Runtime State Inventory (Build artifacts) | LOW — the manifest writer at `sdk/src/vcs/jj/parallel.ts:252-265` and `sdk/src/vcs/git/parallel.ts:225` is INSIDE the adapter; removing it would change the Phase 9/10 type contract and require a wave-2 amendment to both backends. Cheaper: keep the field, document the orchestrator no longer treats it as wire-protocol input to fan-in. Future cleanup phase can drop if dogfood proves no consumer remains. |
| A7 | The Phase 10 git-side `worktree-agent-*` branch namespace stays as the load-bearing backend asymmetry (git can't track anonymous worktree heads ergonomically). | Domain / Architecture Patterns | LOW — explicit in CONTEXT.md D-02 last sentence. Git keeps eager branch creation in `git/parallel.ts`; only jj retires its bookmark loop. Cross-backend symmetry tension is resolved by "git uses branches because it must; jj doesn't because it can." |

**If this table seems large:** Most assumptions are low-risk and verifiable by the planner via a single grep or a single file read. The Phase 11 architecture itself is locked by CONTEXT.md D-01..D-09; the assumptions above are about implementation-level details that the planner refines without re-opening the locked decisions.

## Open Questions (RESOLVED)

1. **Should `cmdWorktreeCleanupWave` be removed entirely OR kept as a thin shim around `workspace.parallel.fan-in`?**
   - What we know: Only two production callers (execute-phase.md:774, quick.md:787) — both delete in Phase 11. The test files `tests/bug-3425-worktree-cleanup-cwd-pin.test.cjs` and `tests/bug-3384-worktree-cleanup-manifest.test.cjs` reference the literal CLI string but those tests pivot in Phase 11 anyway.
   - What's unclear: Whether external (out-of-repo) callers exist. Solo-dev repo per CLAUDE.md framing — unlikely.
   - RESOLVED: REMOVE the alias entirely. Implemented by Plan 11-03 Task 1 step (4) — `cmdWorktreeCleanupWave` deleted. Whole-repo grep audit added to Plan 11-03 acceptance criteria to confirm no surviving callers outside the in-flight 11-05/11-06 deletions.

2. **Should the new fan-in CLI accept `--handle @file`, `--handle @-` (stdin), AND inline `--handle '<json>'` — or just two of the three?**
   - What we know: `--handle @-` (stdin) is required because process substitution wraps stdin; `--handle @<path>` is natural for debugging.
   - What's unclear: Whether inline `--handle '<json-escaped-string>'` adds enough value to justify the escape-quoting complexity.
   - RESOLVED: NO inline. Plan 11-02 Task 2 implements `--handle @-` (stdin) and `--handle @<path>` (file) ONLY, mirroring the `gsd-sdk query commit --files @-` precedent. Inline JSON omitted to dodge escape-quoting hell.

3. **Should the test-flip for `cmd-parallel-jj.test.ts` happen IN the D-02 amendment plan or in a separate test-flip plan?**
   - What we know: D-02 amendment retires the bookmark loops AND changes test expectations. Atomic = land both together.
   - What's unclear: Whether the test changes are LARGE enough to merit a separate plan for review-readability.
   - RESOLVED: TOGETHER. Plan 11-01 lands the bookmark-plumbing retirement (Task 1) AND the contract-test assertion flip (Task 2) atomically — no transient broken state.

4. **Does the orchestrator need to retain backwards compatibility for repos where a wave is mid-dispatch when Phase 11 ships?**
   - What we know: Subagent workspaces are ephemeral per `project_ephemeral_subagent_workspaces` memory. No on-disk state survives across orchestrator versions.
   - What's unclear: Whether ANY user is mid-dispatch during a Phase 11 deploy (highly unlikely solo-dev).
   - RESOLVED: NO back-compat shim. Subagent workspaces are ephemeral (locked memory `project_ephemeral_subagent_workspaces`); next-wave-onward uses the new path; any in-flight wave finishes on the old shell already templated into its Agent() body. No plan adds a shim.

5. **Should the SDK CLI emit a JSON wrapper `{ok, data: {...}}` around the Handle/FanInResult, or print them flat?**
   - What we know: `gsd-sdk query head-ref` returns `{ ok: true, head }` flat (top-level fields, no wrapper). `gsd-sdk query worktree.cleanup-wave` returns `{ ok, plan: {...}, result: {...} }` with a wrapper.
   - What's unclear: Which precedent to mirror.
   - RESOLVED: FLAT. Plan 11-02 Task 2 mirrors `head-ref.ts`: `workspaceParallelDispatchQuery` returns `{ data: handle }` (flat — orchestrator accesses `.workspaces[]` directly via jq, not `.data.handle.workspaces[]`); `workspaceParallelFanInQuery` returns `{ data: fanInResult }` similarly.


**Audit follow-up (RESOLVED — closed by Plan 11-04 Task 1 step (4)):** Assumption A2 noted `gsd-debugger.md` and `gsd-code-fixer.md` plus "30+ other agents" as MEDIUM-risk for analogous worktree-aware blocks. Plan 11-04 Task 1 step (4) adds a one-shot `grep -lE "worktree-agent-|worktree-path-safety|workspace-aware|cwd-drift|abs-path guard" agents/*.md` audit. Any agent file other than `gsd-executor.md` matching is recorded in the SUMMARY for follow-up; PROMPT-08's scope remains `gsd-executor.md` only.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `jj` | jj-side `vcs.workspace.parallel.*` invocations + D-02 amendment tests | ✓ (assumed — repo IS jj-port) | 0.41+ | — |
| `git` | git-side `vcs.workspace.parallel.*` invocations | ✓ (assumed) | 2.0+ | — |
| `jq` | Workflow shell blocks parsing Handle JSON / FanInResult JSON | ✓ (already used at `execute-phase.md:702-709` and `gsd-executor.md:484-487`) | any modern | — |
| `pnpm` + `tsx` | SDK build for the new query handler | ✓ (project standard per global instructions) | repo-locked | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (SDK side) + `node:test` (CJS side at `tests/`) |
| Config file | `sdk/vitest.config.ts` (SDK); `tests/*.test.cjs` runs via node test runner |
| Quick run command | `cd sdk && pnpm vitest run src/vcs/__tests__/cmd-parallel-jj.test.ts src/query/workspace-assert-dispatched-cwd.test.ts` |
| Full suite command | `pnpm test` (root) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VCS-20 | `workspace.assert-dispatched-cwd` returns `{ok, workspaceName, workspacePath, isPrimary}` on primary cwd (ok=false) and on dispatched cwd (ok=true) | unit | `pnpm vitest run sdk/src/query/workspace-assert-dispatched-cwd.test.ts` | ❌ Wave 0 |
| PROMPT-06 | `execute-phase.md` no longer contains `git worktree add`, `git worktree remove`, `WAVE_WORKTREE_MANIFEST` mktemp pattern | structural | `pnpm test -- tests/execute-phase-no-raw-git.test.cjs` (new) OR rely on Phase 13's audit-workflow-raw-git.cjs | ❌ Wave 0 (or defer to Phase 13) |
| PROMPT-07 | `quick.md` no longer contains the raw-git block | structural | same shape as PROMPT-06 | ❌ Wave 0 (or defer) |
| PROMPT-08 | `gsd-executor.md` contains exactly ONE `workspace.assert-dispatched-cwd` call AND no `git rev-parse --abbrev-ref HEAD` / `git symbolic-ref` / `[ -f .git ]` invocations | structural | `pnpm test -- tests/gsd-executor-asserts-dispatched-cwd.test.cjs` (new) | ❌ Wave 0 |
| PROMPT-09 | `dispatch-cwd-safety.md` exists, `worktree-path-safety.md` does not, referrers updated | structural | flip existing `tests/bug-3097-3099-executor-worktree-path-safety.test.cjs` | ✓ (exists, must flip) |
| PARALLEL-06 | `workspace.parallel.dispatch --max-concurrency N` CLI flag plumbs through to `ParallelDispatchOpts.maxConcurrency` field | unit | extend `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts` with a `maxConcurrency: 2` scenario | ✓ (test file exists, add scenario) |
| D-02 amendment | `sdk/src/vcs/jj/parallel.ts` no longer creates eager bookmarks; `cmd-parallel-jj.test.ts` workspace-listing assertions pass | unit | `pnpm vitest run src/vcs/__tests__/cmd-parallel-jj.test.ts` | ✓ (test exists; assertions flip) |
| D-05 body shrink | `executeWorktreeWaveCleanupPlan` synthetic-pending rebuild keeps `wave-cleanup-executor.test.cjs` + `bug-3384-worktree-cleanup-manifest.test.cjs` green | regression | `node --test tests/wave-cleanup-executor.test.cjs tests/bug-3384-worktree-cleanup-manifest.test.cjs` | ✓ (tests exist; assertions may need adjustment per A3) |

### Sampling Rate

- **Per task commit:** `pnpm vitest run <specific test file>` (~5-15 sec depending on N parametrization)
- **Per wave merge:** `pnpm test` (full suite)
- **Phase gate:** Full suite green on both jj and git lanes before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `sdk/src/query/workspace-assert-dispatched-cwd.ts` — new handler (~30 LOC)
- [ ] `sdk/src/query/workspace-assert-dispatched-cwd.test.ts` — covers VCS-20
- [ ] `sdk/src/query/workspace-parallel-dispatch.ts` — CLI bridge (~50 LOC, args parsing + invocation)
- [ ] `sdk/src/query/workspace-parallel-fan-in.ts` — CLI bridge (~60 LOC, stdin handling + `--handle @file` + `--results @file`)
- [ ] `tests/gsd-executor-asserts-dispatched-cwd.test.cjs` — structural test that the four blocks collapse (or PROMPT-08 rolls into the existing `bug-3097-3099` test pivot)
- [ ] No framework install required — vitest + node:test already in place

## Security Domain

> `security_enforcement` setting not surveyed live; treating as enabled per protocol default.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth surface in this phase |
| V3 Session Management | no | No session surface |
| V4 Access Control | no | No multi-tenant boundary |
| V5 Input Validation | yes | Handle JSON deserialization at fan-in CLI; results-array deserialization. Validate against `ParallelDispatchHandle` and `ParallelAgentResult[]` shapes before invoking adapter. Reject unknown fields. |
| V6 Cryptography | no | No crypto surface |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Maliciously-crafted Handle JSON fed to fan-in CLI via `--handle @<attacker-controlled-path>` (path traversal in `workspacePath`) | Tampering / EoP | Adapter already validates workspace paths via `vcs.workspace.list()` — fan-in only operates on workspaces the VCS itself reports as tracked. A bogus Handle workspacePath that doesn't match `vcs.workspace.list()` is a no-op or throws. |
| Shell injection via Handle field values that contain shell metacharacters (e.g. `workspaceName` with `$()`) | Tampering | Workflow shell blocks consume Handle fields via `jq -r` into shell vars — `jq -r` is not a shell evaluator. The risk window is the orchestrator constructing argv from these values. Best practice: pass workspace path to `Agent()` as a literal string parameter (Claude Code primitive), not interpolated into a shell command. |
| Stale workspace marked as "currently dispatched" by `workspace.assert-dispatched-cwd` (Pitfall 6 above) | Spoofing (weakly) | Acceptable per D-03 minimal-predicate decision. Future tightening if dogfood reveals incident potential. |
| Agent prompt collapse drops a defense the four original guards had | EoP / Tampering | D-04 explicitly preserves `<destructive_git_prohibition>` (which guards against `git clean`/`git rm`/`git reset --hard` inside workspace). The four collapsed guards were about workspace-LOCATING, not destructive-op prohibition — the latter survives intact. |
| Per-commit deletion check (D-06 load-bearing) silently weakens in future agent prompt refactor | Tampering | Phase 11 SUMMARY.md flags D-06 as load-bearing; future regression guard test asserts the deletion-check shell block exists in `gsd-executor.md`. See Pitfall 2 above. |

## Sources

### Primary (HIGH confidence)

- `.planning/phases/11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd/11-CONTEXT.md` — locked decisions D-01..D-09 + cross-phase amendment D-02
- `.planning/REQUIREMENTS.md` — PARALLEL-06, VCS-20, PROMPT-06..09 normative wording
- `.planning/STATE.md` — v1.3 milestone state, phase completion ledger, deferred items
- `.planning/ROADMAP.md` — Phase 11 success criteria + dependencies
- `.planning/phases/09-jj-side-parallel-verbs/09-CONTEXT.md` — D-04..D-09 carry-forward (FanInResult shape, Handle shape, reap classifier, sidecar discipline)
- `.planning/phases/10-git-side-parallel-verbs-classifier-extension/10-CONTEXT.md` — D-01..D-08 carry-forward (per-branch loop, halt-on-conflict, per-success cleanup)
- `.planning/research/ARCHITECTURE.md` — Integration Points #1..#8, build order, cross-cutting concerns
- `.planning/research/PITFALLS.md` Pitfall 5 — `.git/config.lock` race
- `agents/gsd-executor.md:412-574` — full block of four worktree-aware guards + destructive-git-prohibition
- `get-shit-done/workflows/execute-phase.md:500-820` — full raw-git dispatch + cleanup block
- `get-shit-done/workflows/quick.md:660-810` — full quick-mode dispatch + cleanup block
- `get-shit-done/bin/lib/worktree-safety.cjs:417-556` — `executeWorktreeWaveCleanupPlan` body + `cmdWorktreeCleanupWave` handler
- `get-shit-done/references/worktree-path-safety.md` — 89-line body to rewrite
- `sdk/src/vcs/types.ts:447-518` — `ParallelDispatchHandle`, `ParallelAgentResult`, `FanInResult`, `ParallelDispatchOpts` (with `maxConcurrency`) types
- `sdk/src/vcs/jj/parallel.ts:204-289, 308-543` — dispatch and fanIn bodies (D-02 amendment targets at 224-244 and 447-465)
- `sdk/src/query/head-ref.ts` — precedent for thin `--cwd` flag-plumbing handler
- `sdk/src/query/command-static-catalog-domain.ts:63` — catalog registration site
- `sdk/src/query/worktree.ts` — existing `worktreeCleanupWave` handler
- `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts` — Phase 9 contract tests (bookmark-presence assertions to flip)

### Secondary (MEDIUM confidence)

- Project memory items (CLAUDE.md auto-memory): `project_no_orchestrator_sidecar_state`, `project_ephemeral_subagent_workspaces`, `project_squash_model`, `project_no_raw_git`, `project_unified_revision_model`
- `tests/wave-cleanup-executor.test.cjs:30-150` + `tests/bug-3384-worktree-cleanup-manifest.test.cjs:215-232` — `pending[]` return-shape contract the synthetic rebuild must honor
- `tests/bug-3097-3099-executor-worktree-path-safety.test.cjs` — structural test that pivots in Phase 11

### Tertiary (LOW confidence)

- None — every claim verified against a live file in the working tree or a locked CONTEXT.md decision. No WebSearch / Context7 lookups required (this is a pure consumer-migration phase against an already-shipped surface).

## Metadata

**Confidence breakdown:**
- Sequencing recommendation (D-02 first, then SDK, then bridge, then consumers): HIGH — derived from CONTEXT.md Claude's Discretion item #4 plus Phase 10's "same-PR coupling" precedent.
- Shell snippets for workflow rewrites: HIGH — patterns mirror existing `gsd-sdk query` usage at `execute-phase.md:702-709` and `gsd-executor.md:524`.
- Pre-flight checks: HIGH — derived directly from REQUIREMENTS.md traceability table + Phase 9/10 SHIPPED status.
- Test-flip inventory for cmd-parallel-jj.test.ts: MEDIUM — survey identified only the `surplusBookmarks` assertion site (one block, parallel.ts:478-493); planner should re-grep for any other `bookmark` mentions before the D-02 plan.
- Risk register: HIGH — derived from CONTEXT.md D-05/D-06/D-08 and ARCHITECTURE.md Concern 1.
- Architecture (Architectural Responsibility Map): HIGH — every capability mapped to its already-shipped tier owner.

**Research date:** 2026-05-16
**Valid until:** 2026-06-15 (30 days — stable surface, locked decisions, no fast-moving dependencies)
