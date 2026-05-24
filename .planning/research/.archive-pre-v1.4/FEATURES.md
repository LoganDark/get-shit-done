# Feature Research — v1.3 jj octopus merge for subagents fully functional

**Domain:** dual-backend VCS adapter (git + jj 0.41) for a TypeScript SDK + CJS-runtime hybrid; cross-backend parallel-subagent-dispatch verbs (`vcs.parallel.dispatch` / `vcs.parallel.fanIn` — final names TBD by planner)
**Researched:** 2026-05-15
**Confidence:** HIGH on existing-substrate surface (octopus.ts/reap.ts/workspace.merge already shipped); HIGH on A3 fix-path catalog (3 paths documented in `project_a3_colocated_pre_commit_gap` memory + v1.1-REQUIREMENTS status table); MEDIUM on final verb-name choice and result-shape edge cases (conflict-on-fan-in, mid-execution cancellation); MEDIUM on the right concurrency-cap policy (existing config knob is binary, not numeric)

## Scope-anchoring premise

v1.3 is a **subsequent** milestone to a fully-shipped dual-backend adapter (v1.0 + v1.1 + v1.2). The substrate already exists:

- **jj side** — `sdk/src/vcs/jj/octopus.ts` (310 LOC: `createPhaseStructure`, `createSubagentHead`, `createSubagentSlot`) + `sdk/src/vcs/jj/reap.ts` (198 LOC: `performJjReap`). Both shipped in v1.0 Phase 4 (WS-05..12), with verified tests at `sdk/src/vcs/__tests__/jj-octopus.test.ts` (7 `it()` blocks) and `jj-reap.test.ts` (5 `it()` blocks). These are **jj-namespaced** today — promoted-to-`parallel.*` is mechanical.
- **git side** — raw `git worktree add` / `git merge --no-ff` / `git worktree remove` lives in `get-shit-done/workflows/execute-phase.md` (steps 3, 5.5; ~lines 521–810). `gsd-sdk query worktree.cleanup-wave` (v1.1 WAVE-01) already wraps the cleanup-half of the flow inside the adapter — but **dispatch is still raw git in workflow markdown**.
- **cross-backend verbs already exist** — `workspace.add/remove/list/forget/prune/reap/merge` (v1.0 WS-* + v1.1 VCS-12/VCS-13). `vcs.parallel.*` is a coordination layer composing these primitives; it does NOT add new low-level VCS operations.

v1.3 is a **lift-and-collapse** milestone: take the workflow-markdown dispatch+cleanup loop and the jj-namespaced helpers, lift them BOTH into cross-backend `vcs.parallel.*` verbs. Collapse the single acknowledged raw-git exception (PROJECT.md Key Decisions row 14) to zero. Flip the `parallelization` config knob to ON by default. Close A3 colocated pre-commit gap inherited from v1.0 Phase 4 (last known caveat from v1.0).

**Defining premise:** workflows must never branch on `vcs.kind` for parallel-dispatch reasons; the orchestrator calls `vcs.parallel.dispatch(plan)` once and gets back a uniform result shape regardless of backend; the agent prompts dispatched into worktrees/workspaces use only adapter-emitted env vars (cwd-is-cwd) and never inspect backend kind.

Three existing precedents establish the architectural direction:

1. **v1.1 WAVE-01 + PROMPT-04** — `gsd-sdk query worktree.cleanup-wave` collapsed the cleanup-half of the workflow loop into the adapter, deleting 242 LOC of raw-git fallbacks. v1.3 finishes the job on the dispatch-half.
2. **v1.2 unified revision model + `lint-vcs-no-commit-id`** — established the pattern of "first lint green-run = milestone completeness proof." v1.3's `lint-vcs-no-raw-git` going from 1 allowlist entry → 0 IS the architectural proof that the workflow-markdown raw-git block is gone.
3. **Phase 4 D-25** — "any subagent in any wave triggers structure creation; single-subagent dispatch still gets a one-child octopus for forward-compat." The jj side already enforces this; v1.3 extends the same shape to the cross-backend verb.

## Industry survey — how dual-backend orchestration tools fan out parallel dispatch and reap results

### Pattern 1: "Worktrees + per-task branch + final merge" (Claude Code's `isolation="worktree"`, `git-spice`, `git-branchless`)

[Claude Code's worktree isolation](https://docs.claude.com/en/docs/claude-code/sub-agents) creates a `worktree-agent-<id>` branch per agent, isolates the working tree on disk, and the orchestrator merges back after all agents complete. This is what GSD's `execute-phase.md` already does — raw git in workflow markdown. The contract: **fan-out = `git worktree add` per agent; fan-in = `git merge --no-ff` per branch back to orchestrator's branch; cleanup = `git worktree remove` per agent**.

[git-spice](https://github.com/abhinav/git-spice) and [git-branchless](https://github.com/arxanas/git-branchless) treat parallel branches as first-class graph nodes but **don't dispatch agents** — they let the user execute manually then offer batch operations. GSD's parallel verb is closer to a coordinated CI runner than to these tools.

**Verdict for v1.3 git backend:** Pattern 1 is what's already there. Lift it into the adapter verb body. No new behavior — just relocation from `.md` to `.ts`.

### Pattern 2: "Jujutsu octopus merge for N-way fan-in" (jj-vcs, `jj new -A -B` chain)

[Jujutsu's octopus merges](https://docs.jj-vcs.dev/latest/concepts/) are first-class — `jj new <parent1> <parent2> <parent3> ...` creates an N-parent merge change. The pattern verified in Phase 4 RESEARCH on jj 0.41 and shipped in `sdk/src/vcs/jj/octopus.ts`:

```
parent (anchor)
├── subagent-1 head ──┐
├── subagent-2 head ──┤
└── subagent-3 head ──┴──> merge slot (N-way octopus)
```

Subagent heads are inserted between parent and merge via `jj new -A <parent> -B <merge> --no-edit`. The merge slot becomes an N-parent change as more subagent heads are inserted. The orchestrator's `@` stays one beyond the merge slot (WS-10 invariant: never `jj edit` during structure creation).

**Per jj docs Working Copy and `--no-edit`:** workspaces are jj's first-class "worktree" primitive. Each workspace has its own `@`. `jj workspace add --name <NAME> --revision <rev> <path>` is the verified primitive (v1.0 WS-01). No content-addressed branch contention — change_ids are namespaced per workspace.

**Verdict for v1.3 jj backend:** Pattern 2 is the canonical jj idiom. `sdk/src/vcs/jj/octopus.ts` already implements it. Lift the helpers from `jj-namespaced` to the backend's `parallel.*` verb bodies. No new behavior on the jj side either.

### Pattern 3: "Promise.all-style result aggregation; cap concurrency from config" (Bazel, Buck2, Nx, Turbo)

Modern build systems ([Bazel](https://bazel.build/docs/build-event-protocol), [Buck2](https://buck2.build/docs/concepts/build_observability/), [Nx](https://nx.dev/concepts/task-pipeline-configuration), [Turbo](https://turborepo.com/docs/reference/run)) cap parallel-task concurrency via a `--jobs N` flag (default: `$(nproc)`) and aggregate per-task results into a typed `Result<T, E>[]` shape. Failures don't cancel siblings; the result list carries pass/fail per task. Per-task working dir is exposed via an env var (`$BUILD_WORKSPACE_DIRECTORY` on Bazel, `$NX_TASK_TARGET_PROJECT` on Nx) — the task itself doesn't know which sandboxing primitive was used.

**Verdict for v1.3 result shape:** the verb returns `ParallelDispatchResult[]` where each entry has `{ planId, status: 'success' | 'failed' | 'incomplete', workspaceName, revAfter, summaryPath }`. Concurrency is bounded but not cancelling-on-failure (matches GSD's existing wave-fail-handler in `execute-phase.md` step 7). Per-task env vars: `GSD_WORKSPACE_PATH` (cwd), `GSD_WORKSPACE_REV` (canonical revision id — unified per v1.2), `GSD_PLAN_ID`. **No `GSD_BACKEND_KIND` env var** — leaks backend (anti-feature).

### Pattern 4: jj's "anonymous head" vs git's "named branch" for in-progress work

[jj's docs on working with branches](https://docs.jj-vcs.dev/latest/branches/) note that anonymous heads are jj's default, while git requires a named branch for every concurrent line of work. For the subagent dispatch case: on jj, the subagent's `@` is just the subagent head change (no bookmark needed); on git, the agent's working tree HEAD points at `worktree-agent-<id>` branch. The cross-backend verb hides this — both look like "isolated cwd, the agent commits to whatever HEAD it's on, fan-in is the adapter's problem."

**Verdict for v1.3:** the cross-backend verb's input contract does NOT specify a branch name. The git backend invents `worktree-agent-<id>`-namespace names internally; the jj backend uses workspace names (`phase-{NN}-subagent-{idx}`). Caller never sees either.

## Existing substrate inventory (what already exists; v1.3 lifts, does not re-implement)

| Surface | Status | File:line | v1.3 disposition |
|---------|--------|-----------|-------------------|
| `sdk/src/vcs/jj/octopus.ts:createPhaseStructure` | Shipped v1.0 Phase 4 (WS-05) | `octopus.ts:102-189` | Lift into `vcs.parallel.dispatch` body (jj branch) |
| `sdk/src/vcs/jj/octopus.ts:createSubagentHead` | Shipped v1.0 Phase 4 (WS-06) | `octopus.ts:206-266` | Lift into `vcs.parallel.dispatch` body (jj branch) |
| `sdk/src/vcs/jj/octopus.ts:createSubagentSlot` | Shipped v1.0 Phase 4 (WS-06+WS-07) | `octopus.ts:280-324` | Lift into `vcs.parallel.dispatch` body (jj branch) |
| `sdk/src/vcs/jj/reap.ts:performJjReap` | Shipped v1.0 Phase 4 (WS-11/12) | `reap.ts:117-198` | Lift into `vcs.parallel.fanIn` body (jj branch — reap path for failed/incomplete heads) |
| `vcs.workspace.merge({branch, mainBookmark, agentBookmark, ff: false})` | Shipped v1.1 (VCS-12) | `types.ts:222-235` + `jj.ts:1180-1226` | Compose inside `vcs.parallel.fanIn` per-branch merge step (called N times for N subagents) |
| `vcs.workspace.add/remove/list/forget/prune` | Shipped v1.0 (WS-01..04) | `types.ts:382-409` | Compose inside `vcs.parallel.dispatch` (jj branch — create workspaces) |
| `gsd-sdk query worktree.cleanup-wave` + manifest schema | Shipped v1.1 (WAVE-01) | `bin/lib/worktree-safety.cjs:402` | Compose inside `vcs.parallel.fanIn` (git branch — wraps the existing cleanup loop) |
| raw `git worktree add` / `merge --no-ff` / `remove` in `execute-phase.md` lines ~521–810 | Shipped v1.0 (raw git, single allowlist exception) | `workflows/execute-phase.md` | **DELETE in v1.3** — the verb's git branch absorbs this code path into `sdk/src/vcs/backends/git.ts` |
| `WAVE_WORKTREE_MANIFEST` JSON schema (worktrees[], main_bookmark) | Shipped v1.1 (WAVE-01 widening) | `bin/lib/worktree-safety.cjs:402` + `execute-phase.md:528` | **Extend** to carry `plan_id`, `agent_id`, and `backend` (git/jj) — becomes the verb's runtime state |
| `lint-vcs-no-raw-git.cjs` + allowlist with one entry | Shipped v1.0 Phase 1 (with v1.1 PROMPT-04 trim) | `scripts/lint-vcs-no-raw-git.cjs` + `lint-vcs-no-raw-git.allow.json` | **Drop the last allowlist entry** when v1.3's git-backend verb lands — first 0-entry green run = milestone-completeness proof (mirrors v1.2 lint-no-commit-id pattern) |

## Feature Landscape

### Table Stakes (must ship to deliver "jj octopus merge for subagents fully functional")

Without these, the milestone hasn't met its goal — workflows still call raw git for parallel dispatch, or `parallelization` cannot flip on by default.

#### Category A: Cross-backend `vcs.parallel.*` verb surface

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **`vcs.parallel.dispatch(plan): ParallelDispatchHandle`** — input contract | THE milestone goal. Without it, the orchestrator still composes worktree+branch+ref-manipulation in workflow markdown. Input: `{ phaseDir, phaseNum, plans: PlanSlot[], parentRev: RevisionExpr, mainBookmark: string }` where `PlanSlot = { planId: string, agentPrompt: string, isolationOverride?: false }`. | **L** | Composes `octopus.createPhaseStructure` + N×`createSubagentSlot` on jj; composes `git worktree add` per slot on git. Depends on `workspace.add` (v1.0). Input contract is the spec for the planner. |
| **`vcs.parallel.fanIn(handle, results): FanInResult`** — fan-in contract | Counterpart of `dispatch`. Input: handle from dispatch + per-plan completion results. Per plan: invokes `workspace.merge` (jj) or wraps `worktree.cleanup-wave` (git). Output: `{ merged: {planId, mergeRev}[], conflicted: {planId, conflict}[], incompleteQueued: IncompleteWorkEntry[] }`. | **L** | Composes `vcs.workspace.merge` (v1.1 VCS-12) + `vcs.workspace.reap` (v1.0 WS-11/12). The fan-in is N sequential merges (NOT one N-way octopus on git — git's `merge --no-ff` is 2-way; jj's octopus is naturally N-way but Phase 4 RESEARCH established 2-way-per-subagent flow). |
| **Unified `ParallelDispatchHandle` shape (backend-opaque)** | Workflow code must NOT branch on `vcs.kind` to interpret the handle. Handle carries: `{ runId: string, phaseDir, workspaces: ParallelWorkspace[], structureRevs: {parent, merge} }`. The `structureRevs` field is `null` on git (no octopus structure); jj populates it. | **M** | The `null`-on-git asymmetry is the unavoidable consequence of the backend difference. Document as a positive-contract field, not a `vcs.kind === 'jj'` branch. |
| **`ParallelWorkspace` per-slot shape** | Each spawned agent needs cwd + canonical rev to write commits against. Shape: `{ planId: string, name: string, path: string, baseRev: RevisionExpr, headRev: RevisionExpr (post-completion) }`. | **S** | `headRev` populated by fan-in (post-completion). Mirrors `WorkspaceInfo` from v1.0 + adds `planId`. |
| **Manifest schema extension** — `plan_id`, `agent_id`, `backend` fields | The v1.1 WAVE-01 manifest is the runtime state. v1.3 needs to attribute each entry to a plan and a backend (so the verb's fan-in can dispatch to the right backend-specific merge path). | **S** | Backwards-compat: existing fields preserved; new fields optional with sensible defaults. |
| **`vcs.parallel.fanIn` handles conflicts cleanly** — no auto-abandon | v1.1 VCS-12 D-02 established the conflict-return semantics: in-tree conflict at `@` after merge returns `{ok: false, conflicted: true, ...}` with NO auto-abandon. v1.3 inherits this per-merge; the verb aggregates the conflict list and returns it. Caller decides resolution. | **S** | Inherited from `workspace.merge`. |
| **`vcs.parallel.fanIn` handles incomplete work via reap** — crash-recovery composition | Subagent crashes (no SUMMARY.md, no completion signal) result in `incomplete-work.md` queue entries via `performJjReap` (jj) or the existing `worktree.cleanup-wave` failure-handling path (git). The verb composes reap; caller gets `incompleteQueued` array. | **S** | Reuses v1.0 WS-12 + WS-11; D-14 phase-merge gate inherited (caller blocked from committing phase-merge while queue non-empty). |

#### Category B: Orchestrator rewire (workflow markdown deletions)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Delete the raw-git block in `execute-phase.md` lines ~521-810** | PROJECT.md Key Decisions row 14 calls this out as "single acknowledged raw-git exception, tracked for rewrite." v1.3 closes it. The block becomes a single `vcs.parallel.dispatch` call + a single `vcs.parallel.fanIn` call. | **M** | Estimated -200 to -300 LOC from `execute-phase.md`; mirrors v1.1 PROMPT-04's -242 LOC pattern. |
| **Delete equivalent raw-git block in `quick.md`** | `quick.md` has its own worktree dispatch (single-agent, line 676+). Same lift applies. | **S** | Single-agent case must work — the verb's input contract supports `plans.length === 1` (one-child octopus per Phase 4 D-25). |
| **Flip `parallelization: true` as the new default in `.planning/config.json` projection** | PROJECT.md Active list: "`parallelization` config knob flips on by default once v1.3 closes." | **S** | The knob exists; the value flips. Memory `project_no_parallelization_yet` tracks. |
| **Subagent agent-prompt update: gsd-executor + gsd-debugger** | Today's prompts mention `worktree`-specific HEAD-assertion and `worktree-agent-<id>` namespace (e.g., `execute-phase.md:570-585` runs `git symbolic-ref` inside the agent). v1.3 makes these adapter-mediated: agent prompts read `GSD_WORKSPACE_PATH`/`GSD_WORKSPACE_REV` env vars; the cross-backend `current-branch`/`head-ref` SDK verbs handle the backend-specific introspection. | **M** | Per PROJECT.md Active: "jj-workspace semantics no longer leak through prompts." The TODO comment at `execute-phase.md:569` ("HEAD-assertion block is git-mode-only by construction") becomes deletable. |
| **`lint-vcs-no-raw-git.allow.json` drops to 0 entries** | The milestone-completeness proof (per v1.2 lint-pattern). First green run with 0 allowlist entries = "raw-git block deleted, verb absorbed it." | **S** | Mechanical — remove the last entry. |

#### Category C: A3 colocated pre-commit gap closure (Phase 4 carry-forward)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Pick ONE of three documented fix paths and ship it** | jj 0.41 colocated mode does NOT auto-fire `.git/hooks/pre-commit` after `jj squash`. D-10 no-op left colocated users with no pre-commit path. PROJECT.md Active: "Bundled with v1.3 per user decision." | **see per-path complexity** | The three paths are mutually exclusive — pick one. See "A3 fix-path enumeration" table below. |
| **Regression test on colocated repo** | Without a test, the fix is unverifiable. New test in `sdk/src/vcs/__tests__/jj-hooks.test.ts` (or new `jj-colocated-hooks.test.ts`): create a colocated fixture, install a `.git/hooks/pre-commit` that fails loudly, `jj squash`, assert the hook ran. | **S** | Fixture infrastructure already exists in `jj-hooks.test.ts`. |

#### A3 fix-path enumeration (table stakes — pick one; the others become anti-features post-decision)

Sources: memory `project_a3_colocated_pre_commit_gap`, RETROSPECTIVE.md v1.0 known follow-ups, `v1.1-REQUIREMENTS.md:303` HOOK-03 status row, PROJECT.md row 14 Key Decisions.

| Path | What it does | Complexity | Trade-offs | Verdict candidate |
|------|--------------|------------|------------|-------------------|
| **A: Remove the D-10 no-op** | Make `fireHook('pre-commit')` always shell `.githooks/pre-commit` (or `.git/hooks/pre-commit`) directly on jj, regardless of colocation. Treats colocated and non-colocated identically. | **S** | + Simple, mirrors non-colocated path. + Predictable.<br>− Duplicates work if jj 0.41 ever DOES auto-fire (no current evidence it will).<br>− Possible double-fire if upstream jj adds auto-fire in a future version. | **MEDIUM differentiator candidate** — simplest, but lowest forward-compat. |
| **B: Shell `.git/hooks/pre-commit` explicitly in colocated mode** | Adapter detects colocation (via `.git` directory presence in jj repo), then explicitly shells `.git/hooks/pre-commit` post-squash. Non-colocated path stays as-is (uses `.githooks/`). | **M** | + Routes to git-native hook location in colocated mode (matches user expectation: "I have `.git/hooks/pre-commit`, fire it").<br>+ Surface-area-minimal change.<br>− Adds a colocation-detection branch inside the adapter (`fs.existsSync('.git')` is the canonical probe per Phase 4 plan 04-06 SUMMARY).<br>− If user has BOTH `.git/hooks/` and `.githooks/`, which wins? Document the precedence. | **STRONG table-stakes candidate** — explicit, matches user mental model. |
| **C: Version-probe** | Feature-detect jj's auto-fire behavior at runtime. If jj version ≥ X (whichever fixes the upstream gap), no-op as before; else shell explicitly. | **L** | + Forward-compatible (auto-converges as jj fixes the gap).<br>+ Zero behavior change for non-colocated.<br>− No upstream fix exists yet (jj 0.41 is current; no public PR for auto-fire as of this research's pub-date check on jj-vcs/jj GitHub issues). Probe has no jj-version threshold to gate on yet.<br>− Adds runtime cost (version-string parsing per `fireHook` call) unless cached.<br>− Tests are version-conditional, complicating CI. | **DEFER — differentiator only** when an upstream fix lands. v1.3 should not pre-build for a non-existent jj version. |

**Recommended pick (planner judgment): Path B** — explicit shell of `.git/hooks/pre-commit` in colocated mode. Strongest match for user mental model ("the hook file exists at `.git/hooks/pre-commit`; fire it"). Path A is simpler but loses the `.githooks/` vs `.git/hooks/` distinction. Path C is premature.

Per `quality_gate`: A3 fix paths enumerated with trade-offs ✓. Differentiator (Path C — version-probe) vs table stakes (Path B — explicit shell) is explicit.

#### Category D: CI parallel-path lane (new matrix lane)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **CI matrix lane: parallel phase E2E on both backends** | PROJECT.md Active list: "new CI matrix lane runs a parallel phase end-to-end on both backends; required-blocking on jj-colocated." Validates the verb in real CI before flipping default. | **M** | New lane in `.github/workflows/test.yml`. Run a synthetic 2-plan phase, assert fan-in landed and reap is clean. |
| **Required-blocking gate on jj-colocated lane only** | Mirrors v1.0 Phase 5 CI-04 pattern (jj-colocated lane required-blocking, jj-native allow-failure). Solo-dev project; required-blocking on the dogfood platform. | **S** | Standard GitHub Actions `required` flag. |
| **Add lint guard for `vcs.parallel.*` call presence in workflows** (defense-in-depth) | The orchestrator must ACTUALLY call `vcs.parallel.dispatch` — not silently fall back to a vestigial path. Lint scans workflow `.md` for the verb name; if zero occurrences in dispatch sections, fail. | **S** | Mirrors `lint-workflow-script-paths.cjs` pattern from v1.0. Optional — could be deferred to v2 if dogfood proves it isn't needed. |

#### Category E: Dogfood phase (separate, final)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Dogfood phase spins up 2-3 synthetic plans on this very repo** | PROJECT.md Active list: "last phase of v1.3 spins up 2-3 synthetic plans on this very repo, runs them in parallel via the new dispatcher, validates clean fan-in + reap + agent-bookmark cleanup, records metrics in `.planning/intel/`." | **M** | Self-validating. The plans don't need to be meaningful changes — minimal commits that exercise the dispatch + fan-in surface end-to-end. |
| **Metrics record** at `.planning/intel/v1.3-dogfood-metrics.md` | Captures: wall-clock dispatch latency, per-plan merge latency, reap latency, conflict-incidence on parallel waves. Establishes baseline for future regression. | **S** | Mirrors v1.0 Phase 6 intel docs (`06-dogfood-log.md`, `06-foundation-probes.md`). |

### Differentiators (capabilities the unified parallel surface unlocks; not blocking for v1.3 "useful")

Capabilities that v1.3 enables but aren't load-bearing. Defer if scope tightens.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Numeric concurrency cap** (`workflow.parallel_max_concurrency`) | Today the config knob is binary (`parallelization: true/false`). A numeric cap (e.g., `parallel_max_concurrency: 4`) lets the orchestrator throttle when the phase has 10+ plans in one wave. Without it, the runtime's natural agent-concurrency limit (Claude Code's default ~3-4 concurrent agents) sets the cap implicitly. | **M** | The verb accepts an optional `maxConcurrency?: number` in the `dispatch` input. Default: undefined (uses runtime's natural limit). Source from config when undefined. Defer if v1.3 dogfood reveals the implicit cap is enough. |
| **Subagent agent-prompt env-var harmonization** | Standardize on `GSD_WORKSPACE_PATH`, `GSD_WORKSPACE_REV`, `GSD_PLAN_ID`, `GSD_PHASE_DIR` as the four env vars every subagent prompt reads. No `GSD_BACKEND_KIND` (anti-feature — leaks backend). Today's prompts use `{worktree_path}` template placeholders + runtime detection inside the prompt body. | **M** | Cross-cutting; affects every parallel-dispatched agent prompt. Mechanical sweep with grep. Could be a follow-on cleanup; not blocking for the verb to land. |
| **Documented rebase-stability semantic on `ParallelDispatchHandle.workspaces[].baseRev`** | Mirrors v1.2's `LogEntry.id` rebase-stability doc. The handle's `baseRev` is canonical (commit_id on git, change_id on jj); after fan-in, callers can compare base+head across the namespace using `===`. | **S** | Doc work; consequence of v1.2's unified revision model. |
| **Verb composition: `vcs.parallel.dispatch → workspace.list → fanIn` chain works without backend awareness** | A consumer of the adapter (e.g., a future GSD-as-library use case) can orchestrate a parallel run from external code without ever importing the backend type. | **S** | Consequence-of-flip; emerges naturally from the verb design. Worth a doc/JSDoc note. |
| **Cleaner workflow `.md` — no inline backend conditionals for parallel** | v1.2 PROMPT-05 deleted id-reason `vcs.kind` branches. v1.3 deletes parallel-reason `vcs.kind` branches. The 4 KEEP-annotated sites from v1.2 are NOT parallel-reason; they're capability narrows (`gitOnly.*`) which stay. | **S** | Audit produces the deletion list; mechanical. |
| **`vcs.parallel.cancel(handle)` — mid-execution cancellation surface** | Today, mid-execution cancellation is handled by the orchestrator's prompt-resilience layer + the runtime's agent-cancellation primitives. The verb has no direct cancel surface. A future addition would let the orchestrator gracefully abandon in-flight workspaces (call reap on each in-progress entry). | **M** | Defer to v1.4+ unless dogfood reveals a need. Today's recovery (manual `jj workspace forget` / `git worktree remove`) is good enough. |

### Anti-Features (commonly tempting but explicitly out of scope for v1.3)

| Feature | Why Tempting | Why Problematic | Alternative |
|---------|--------------|-----------------|-------------|
| **`GSD_BACKEND_KIND` env var passed to subagent prompts** | "Subagent prompts can do backend-specific things." | This re-creates the `vcs.kind` branching pattern that v1.2 deleted, but at the subagent-prompt level. Subagent prompts should be backend-opaque (cwd-is-cwd, ref-is-ref). If a subagent needs backend-specific knowledge, it imports `vcs.kind` from the adapter at runtime — but that should be vanishingly rare. | Emit only `GSD_WORKSPACE_PATH`, `GSD_WORKSPACE_REV`, `GSD_PLAN_ID`, `GSD_PHASE_DIR`. Backend kind is the adapter's problem, not the agent's. |
| **`vcs.parallel.dispatch` accepts a per-plan `branchName` override on git backend** | "Some plans want stable branch names for external review." | The cross-backend verb cannot accept git-specific arguments without becoming a `vcs.kind`-aware caller. The branch name is an implementation detail of the git backend; jj doesn't have an equivalent (workspace names ARE the analog, and they're auto-generated). | If a caller genuinely needs a stable git branch name, they don't want parallel dispatch — they want a single `workspace.add` + manual orchestration. The parallel verb is for "spawn N, merge N back, done." |
| **Cross-machine dispatch (distributed parallel agents)** | "Why not run agents on a build farm?" | GSD is a single-developer-on-a-single-machine tool. Cross-machine adds: network state sync, distributed locking, distributed worktree namespacing — none of which the adapter has primitives for. Massive scope creep. | Out of scope. If the day comes that this matters, it's a v3+ redesign, not a v1.3 differentiator. |
| **Dynamic concurrency rebalancing** | "Throttle harder when CPU spikes; lift cap when idle." | The runtime (Claude Code, Codex, etc.) sets the agent-concurrency cap. The adapter's job is to expose a static `maxConcurrency` input, not to monitor system load. Dynamic rebalancing would require a process-spawn layer the adapter doesn't have. | Honor the runtime's natural concurrency limit + optional static cap. Anything more is a runtime concern, not an adapter concern. |
| **Auto-cancel sibling agents on first failure** | "Fail fast." | GSD's existing wave-fail-handler (`execute-phase.md` step 7) does NOT cancel siblings — it surfaces the failure and asks the user. Auto-cancel would conflict with that pattern and erase work-in-progress for agents that haven't yet committed. | Preserve existing behavior: report per-plan pass/fail in the result; orchestrator decides whether to continue or stop. The result shape is `{success, failed, incomplete}[]` not `{success, aborted-due-to-sibling}[]`. |
| **`vcs.parallel.dispatch` as a typed event stream / Promise of streams** | "Modern async — give me events as agents complete." | The verb is called from a synchronous CLI runtime (`gsd-sdk query parallel.dispatch ...`). Streams add interface complexity and `gsd-sdk` doesn't have a streaming-output mode today. The orchestrator's existing heartbeat lines (`[checkpoint] phase ... wave ... plan ... complete`, line 688 of execute-phase.md) are the in-band stream. | Sync, returns when all agents complete. The runtime + heartbeat lines provide observability. |
| **`vcs.parallel.dispatch` spawns the Agent() processes itself** | "Make the SDK fully self-contained." | The Agent() spawn primitive is a runtime concern (Claude Code's `Agent(...)`, Codex's equivalent, etc.). The SDK is runtime-agnostic. Pulling spawn into the SDK would force runtime-specific code into the cross-backend surface. | Adapter creates the workspaces + structure; orchestrator (in workflow markdown) spawns the agents using the runtime's primitive; adapter cleans up via `fanIn`. Clean separation of concerns. |
| **Auto-promote `octopus.ts`/`reap.ts` exports to the public adapter `vcs.octopus.*` / `vcs.reap.*` surface** | "Just expose the existing helpers under the cross-backend namespace." | This bakes in the jj-specific octopus structure as cross-backend API. Git's parallel doesn't have an octopus structure at all (it's N independent worktrees + N sequential 2-way merges). A `vcs.octopus.*` surface that's null on git creates the `vcs.kind === 'jj'` branching pattern v1.2 deleted. | The cross-backend surface is `vcs.parallel.dispatch` / `vcs.parallel.fanIn` (lifecycle verbs, not structure verbs). The octopus structure is an internal implementation detail of the jj branch. |
| **Removing `git worktree` from the git backend entirely** | "If `parallel.dispatch` always uses it, why not absorb it?" | The git backend's `worktree.cleanup-wave` (v1.1 WAVE-01) is still needed for the cross-wave-dependency-deviation path documented in `execute-phase.md` lines ~747-808. Removing it breaks that escape valve. | Keep `vcs.worktree.*` (git-only namespace) as-is for the deviation path; `vcs.parallel.*` (cross-backend) composes it for the happy path. |

## Per-Verb Behavior Contract (input → output shape spec)

Per `downstream_consumer`: this is the spec the planner / requirements step picks features off of. Each row defines a behavior the verb must satisfy.

### `vcs.parallel.dispatch(input): ParallelDispatchHandle`

| Aspect | Specification |
|--------|---------------|
| **Input shape** | `{ phaseDir: string, phaseNum: number, plans: { planId: string, agentPrompt: string, isolationOverride?: false }[], parentRev: RevisionExpr, mainBookmark: string, maxConcurrency?: number }` |
| **Pre-condition** | `parentRev` resolves; `mainBookmark` exists; `plans.length ≥ 1`; phaseNum ≥ 0; `.planning/phases/{NN}-…/` dir exists at `phaseDir`. |
| **Behavior (jj)** | (1) `octopus.createPhaseStructure(parentRev, phaseNum)` — idempotent; gets/creates parent+merge slots. (2) For each plan: `octopus.createSubagentSlot({ parentChange, mergeChange, idx, phaseNum })` — creates head + workspace. (3) Returns handle with all slot info populated. |
| **Behavior (git)** | (1) Capture EXPECTED_BASE = `vcs.refs.head`. (2) For each plan: `git worktree add <.claude/git-worktrees/phase-{NN}-subagent-{idx}> -b worktree-agent-<id> <EXPECTED_BASE>` (sequentially — avoid `.git/config.lock` contention; mirrors existing `execute-phase.md:535-543` sequential-dispatch comment). (3) Returns handle with `structureRevs: null`, workspaces populated. |
| **Output shape** | `{ runId: string, phaseDir: string, structureRevs: { parent: RevisionExpr, merge: RevisionExpr } \| null, workspaces: { planId: string, name: string, path: string, baseRev: RevisionExpr, headRev: RevisionExpr \| null }[], manifestPath: string }` |
| **Post-condition** | `workspaces.length === plans.length`; every workspace has a writable on-disk path; manifest file persisted to `manifestPath`. |
| **Failure modes** | (1) `parentRev` doesn't resolve → throw `VcsExecError`. (2) Workspace creation fails halfway → partial workspaces remain; caller invokes `fanIn` with empty results to clean up. (3) Disk-space exhaustion → throw with which workspace failed. |
| **Concurrency cap** | If `maxConcurrency` undefined: defer to runtime's natural agent-cap. If set: limit Agent() spawn to N at a time (orchestrator-side; verb just exposes the input). |

### `vcs.parallel.fanIn(handle, results): FanInResult`

| Aspect | Specification |
|--------|---------------|
| **Input shape** | `{ handle: ParallelDispatchHandle, results: { planId: string, status: 'success' \| 'failed' \| 'incomplete', summaryPath?: string }[] }` |
| **Pre-condition** | Every workspace in `handle.workspaces` appears in `results` (or in the implicit "incomplete" bucket via missing entry). |
| **Behavior (jj — per plan with status 'success')** | (1) Resolve workspace's current `@` rev. (2) `vcs.workspace.merge({ branch: expr.rev(headRev), message: 'phase {NN}-{plan}: merge subagent into main', ff: false, mainBookmark, agentBookmark: null })` — composes VCS-12. (3) If conflict: returned `{ok: false, conflicted: true}` propagates into `conflicted[]` array. |
| **Behavior (jj — per plan with status 'failed' or 'incomplete')** | (1) Workspace entry passes to `performJjReap` as part of the batch. (2) `performJjReap` probes empty-tree → abandon path OR non-empty → squash + queue + `incomplete-work.md` append. |
| **Behavior (jj — after all per-plan)** | (1) Resolve final merge rev for phase. (2) Phase-bookmark advance (`gsd/phase-{NN}` → merge) via `vcs.commit({bookmarkRaw, phaseMergeFor})` — inherited from Phase 4 WS-09. (3) Cleanup parent/merge marker bookmarks. |
| **Behavior (git — per plan with status 'success')** | (1) `git merge --no-ff <worktree-agent-<id>> -m 'phase {NN}-{plan}: merge subagent into main'` — composes existing `worktree.cleanup-wave` per-entry path. (2) Conflict → returned in `conflicted[]`. |
| **Behavior (git — per plan with status 'failed' or 'incomplete')** | Workspace's branch is force-deleted (`git branch -D worktree-agent-<id>`); worktree is removed; no fan-in merge. The plan's intermediate commits are NOT preserved on git (this is an asymmetry with jj's crash-recovery queue — see asymmetry note below). |
| **Behavior (git — after all per-plan)** | Wraps existing `worktree.cleanup-wave` post-validation (branch-drift guard, expected-base verification — `execute-phase.md:758-775`). |
| **Output shape** | `{ merged: { planId: string, mergeRev: RevisionExpr }[], conflicted: { planId: string, conflictPaths: string[] }[], incompleteQueued: IncompleteWorkEntry[], failedReaped: { planId: string, workspaceName: string }[] }` |
| **Post-condition** | All workspaces removed (success or reap path); `incomplete-work.md` queue updated; phase-bookmark advanced (jj) or orchestrator's branch advanced via the wave's merges (git); `lint-vcs-no-raw-git.cjs` reports 0 violations. |
| **Failure modes** | (1) Concurrent in-tree conflict during merge: returned in `conflicted[]` (no auto-abandon per VCS-12 D-02). (2) Mid-fan-in cancellation: partial state preserved; caller can re-invoke with the same handle for idempotent retry (mirrors `octopus.createPhaseStructure` idempotency). (3) `incomplete-work.md` queue non-empty → caller blocked from committing phase-merge (D-14 / VcsIncompleteSubagentsError). |

### Asymmetry note (git vs jj crash-recovery)

The git backend does NOT preserve intermediate commits from a crashed/failed agent. The worktree's branch is force-deleted and the on-disk dir removed. The jj backend DOES preserve incomplete work via the squash-into-incomplete + queue pattern (Phase 4 D-12/D-13).

**Why the asymmetry is acceptable:** git worktrees with no completion signal are GSD's existing behavior (see `execute-phase.md:718-725`: "If no activity, report the plan as failed and route to the failure handler"). The crash-recovery queue is a jj-specific affordance from the squash-model semantics — git doesn't have an equivalent native primitive. v1.3 does NOT need to invent one.

**Document in the verb's JSDoc:** "On git backend, agents that fail to commit a SUMMARY.md before cancellation lose their work. On jj backend, the squash-into-incomplete pattern preserves the work to `incomplete-work.md` for human review."

## Feature Dependencies

```
v1.0 substrate (workspace.add/remove/list/forget/prune/reap, octopus.ts, reap.ts)
    └──blocks──> Lift to vcs.parallel.* verb bodies

v1.1 substrate (workspace.merge, worktree.cleanup-wave, manifest schema)
    └──blocks──> Lift to vcs.parallel.fanIn verb body

v1.2 unified revision model
    └──blocks──> ParallelDispatchHandle.workspaces[].baseRev type (canonical id)
    └──blocks──> result shape's revs are uniform across backends

vcs.parallel.dispatch verb (Cat A.1)
    └──blocks──> vcs.parallel.fanIn (needs the handle shape)
    └──blocks──> Manifest schema extension (Cat A.5)
    └──blocks──> Orchestrator rewire (Cat B.1, B.2)

vcs.parallel.fanIn verb (Cat A.2)
    └──blocks──> Orchestrator rewire (Cat B.1, B.2)
    └──blocks──> lint-vcs-no-raw-git allowlist drop to 0 (Cat B.5)
    └──blocks──> CI parallel-path lane (Cat D.1)

Orchestrator rewire (Cat B.1, B.2)
    └──blocks──> Subagent prompt env-var update (Cat B.4)
    └──blocks──> parallelization: true default flip (Cat B.3)

A3 fix path B (Cat C.1)
    └──independent of──> Cat A/B/D — can ship in any phase order
    └──blocks──> A3 regression test (Cat C.2)

CI parallel-path lane (Cat D.1)
    └──depends-on──> Orchestrator rewire (Cat B.1, B.2) + parallelization flip (Cat B.3)
    └──blocks──> Dogfood phase (Cat E.1)

Dogfood phase (Cat E.1)
    └──depends-on──> Everything above
    └──finalizes──> the milestone (mirrors v1.0 Phase 6 dogfood gate)
```

### Dependency Notes

- **Lift BEFORE rewire:** the verbs must exist + be tested before workflow markdown deletes the raw-git block. Plan order: Phase 1 = lift jj-namespaced helpers + git raw-git wrap → Phase 2 = orchestrator rewire + delete raw-git allowlist entry → Phase 3 = A3 fix + CI lane → Phase 4 (dogfood).
- **A3 fix is independent of the verb work:** the A3 colocated pre-commit gap is an adapter-internal change (`fireHook` body modification + colocation detection). It does NOT depend on `vcs.parallel.*` and can ship in any phase order. Bundle with v1.3 for milestone-narrative cohesion, but Phase ordering is flexible.
- **Lint allowlist drop is the milestone-completeness proof:** mirrors v1.2 `lint-vcs-no-commit-id`'s pattern ("first green run = milestone complete"). Without the lint-allowlist drop, the raw-git block could silently remain.
- **Manifest schema extension is backwards-compatible:** v1.1's `worktree.cleanup-wave` consumes the existing schema; v1.3 adds optional fields. No coordinated migration needed.

## MVP Definition

### Launch With (v1.3)

Minimum viable v1.3 — what's needed to declare "jj octopus merge for subagents fully functional."

- [ ] **`vcs.parallel.dispatch(input)` cross-backend verb** — both backends; input/output shape per the contract table above.
- [ ] **`vcs.parallel.fanIn(handle, results)` cross-backend verb** — both backends; composes `workspace.merge` (jj) / `worktree.cleanup-wave` (git) per plan.
- [ ] **Unified `ParallelDispatchHandle` / `ParallelWorkspace` / `FanInResult` types** in `sdk/src/vcs/types.ts` — backend-opaque shape.
- [ ] **Manifest schema extension** — `plan_id`, `agent_id`, `backend` fields added; v1.1 consumers unaffected.
- [ ] **Conflict-on-fan-in returns clean** — inherits VCS-12 D-02 no-auto-abandon semantics.
- [ ] **Incomplete-work queue composition** — fan-in invokes reap for failed/incomplete plans; D-14 phase-merge gate preserved.
- [ ] **Delete raw-git block in `execute-phase.md` (~lines 521-810)** — replace with single `vcs.parallel.dispatch` + single `vcs.parallel.fanIn` call.
- [ ] **Delete raw-git block in `quick.md`** — same lift for single-agent dispatch path.
- [ ] **`lint-vcs-no-raw-git.allow.json` reaches 0 entries** — milestone-completeness proof (mirrors v1.2 lint-pattern).
- [ ] **Flip `parallelization: true` as default** in config projection.
- [ ] **Subagent prompts use `GSD_WORKSPACE_PATH` / `GSD_WORKSPACE_REV` / `GSD_PLAN_ID` env vars** — no inline backend detection.
- [ ] **A3 fix path B shipped: explicit shell of `.git/hooks/pre-commit` in colocated mode** (planner-judgment-overridable to Path A if scope tightens).
- [ ] **A3 regression test on colocated repo** — install hook, `jj squash`, assert fire.
- [ ] **CI parallel-path lane** — runs synthetic 2-plan phase E2E on both backends; required-blocking on jj-colocated.
- [ ] **Dogfood phase** — 2-3 synthetic plans on this very repo; metrics recorded in `.planning/intel/v1.3-dogfood-metrics.md`.
- [ ] **Validation:** strict-green on both backend lanes; no skip-count regressions; `lint-vcs-no-raw-git` at 0 entries; A3 fix verified.

### Add After Validation (v1.4+)

Features deferred from v1.3 because they're consequence-of-flip or non-blocking.

- [ ] **Numeric concurrency cap** (`maxConcurrency` honored from config) — add only if v1.3 dogfood reveals the runtime's natural cap is insufficient.
- [ ] **`vcs.parallel.cancel(handle)` surface** — mid-execution graceful abandonment. Add only if user-facing workflow surfaces a need.
- [ ] **Lint guard for `vcs.parallel.*` call presence** — defense-in-depth that the orchestrator actually calls the verb. Add only if a regression slips past CI.
- [ ] **A3 path C (version-probe)** — flip from path B to path C when an upstream jj fix lands that makes auto-fire work in colocated mode.

### Future Consideration (v2+)

- [ ] **Cross-machine distributed dispatch** — out of scope (anti-feature).
- [ ] **Dynamic concurrency rebalancing** — out of scope (anti-feature).
- [ ] **Streaming event API for `vcs.parallel.dispatch`** — defer until the CLI runtime supports streaming output.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| `vcs.parallel.dispatch` verb | HIGH (the milestone goal) | LARGE | P1 |
| `vcs.parallel.fanIn` verb | HIGH (the milestone goal) | LARGE | P1 |
| Unified Handle / Workspace / FanInResult types | HIGH (cross-backend contract) | SMALL | P1 |
| Manifest schema extension | MEDIUM (runtime state continuity) | SMALL | P1 |
| Delete raw-git block in execute-phase.md | HIGH (evidence the abstraction works) | MEDIUM | P1 |
| Delete raw-git block in quick.md | MEDIUM (sweep-completeness) | SMALL | P1 |
| `lint-vcs-no-raw-git` allowlist drop to 0 | HIGH (architectural enforcement) | SMALL | P1 |
| Flip `parallelization: true` default | HIGH (PROJECT.md exit condition) | SMALL | P1 |
| Subagent prompt env-var harmonization | MEDIUM (no backend leakage in prompts) | MEDIUM | P1 |
| A3 fix path B (explicit shell of .git/hooks/pre-commit) | HIGH (closes v1.0 carry-forward) | MEDIUM | P1 |
| A3 regression test | HIGH (verifies the fix) | SMALL | P1 |
| CI parallel-path lane | HIGH (pre-flip-default validation) | MEDIUM | P1 |
| Dogfood phase + metrics | HIGH (real-world validation) | MEDIUM | P1 |
| Numeric concurrency cap | MEDIUM (only if natural cap insufficient) | MEDIUM | P2 |
| `vcs.parallel.cancel` | LOW (no surfaced need yet) | MEDIUM | P3 |
| A3 path C (version-probe) | LOW (no upstream jj fix exists) | LARGE | P3 |
| Streaming event API | LOW (runtime doesn't support) | LARGE | P3 |

## Competitor / Prior Art Comparison

| Feature | Claude Code worktree | git-spice / branchless | Bazel / Buck2 | jj octopus | v1.3 GSD jj-port |
|---------|----------------------|------------------------|---------------|------------|-------------------|
| Dispatch primitive | `Agent(isolation="worktree")` | manual `git worktree add` | `bazel build //...` (task graph) | `jj new -A -B` per agent | **`vcs.parallel.dispatch(plan)`** (cross-backend; jj→octopus, git→worktree) |
| Fan-in primitive | orchestrator merges back | manual `git merge` | implicit (build outputs collected) | N-parent `jj new`, or per-agent `workspace.merge` | **`vcs.parallel.fanIn(handle, results)`** (per-agent merge, NOT N-way octopus — matches v1.1 VCS-12 shape) |
| Per-agent working dir | git worktree, on-disk path | git worktree | sandbox, `$BUILD_WORKSPACE_DIRECTORY` | jj workspace, `@` per workspace | **adapter-mediated workspace; `GSD_WORKSPACE_PATH` env var** |
| Backend leakage in agent prompts | high (worktree HEAD-assertion in prompt body) | n/a (no agent) | none (sandbox-opaque) | n/a (jj-only) | **none** — subagent prompts use only env vars + adapter verbs |
| Concurrency cap | runtime's natural limit | n/a | numeric `--jobs N` from config | n/a (jj is single-process) | **runtime's natural limit + optional static `maxConcurrency`** |
| Per-task result shape | success/fail per agent + SUMMARY.md spot-checks | n/a | `Result<T, E>[]` per task | n/a | **`{merged, conflicted, incompleteQueued, failedReaped}` aggregate** |
| Conflict during fan-in | manual git merge resolution | manual | n/a (no merges) | first-class `jj resolve` flow | **VCS-12 D-02: no auto-abandon; returned in `conflicted[]` for caller resolution** |
| Mid-execution cancellation | runtime kills agent; orchestrator cleans worktree | manual | sandbox cleanup | manual `jj workspace forget` | **out of scope for v1.3** (deferred to v1.4+ `vcs.parallel.cancel`) |
| Crash-recovery for non-committing agents | work lost | work lost | work lost (sandbox dropped) | squash-into-incomplete + queue | **asymmetric: git loses, jj preserves to `incomplete-work.md`** (acceptable per Phase 4 D-12; documented) |

## Sources

### Industry / prior-art references
- [Claude Code worktree isolation docs](https://docs.claude.com/en/docs/claude-code/sub-agents) — Pattern 1 (`isolation="worktree"`, `worktree-agent-<id>` namespace)
- [git-spice](https://github.com/abhinav/git-spice) and [git-branchless](https://github.com/arxanas/git-branchless) — branch-graph-as-data, no agent dispatch
- [Bazel Build Event Protocol](https://bazel.build/docs/build-event-protocol), [Buck2 build observability](https://buck2.build/docs/concepts/build_observability/), [Nx task pipeline](https://nx.dev/concepts/task-pipeline-configuration), [Turbo runtime](https://turborepo.com/docs/reference/run) — Pattern 3 (concurrency cap from config, Result aggregation, sandbox-opaque env vars)
- [Jujutsu docs — concepts (octopus merges)](https://docs.jj-vcs.dev/latest/concepts/) — N-parent merges as first-class primitive
- [Jujutsu docs — working copies and workspaces](https://docs.jj-vcs.dev/latest/working-copy/) — `jj workspace add --name --revision`
- [Jujutsu docs — branches and anonymous heads](https://docs.jj-vcs.dev/latest/branches/) — anonymous heads vs named branches contrast

### jj-vcs upstream issue review (re: A3 fix-path C version-probe feasibility)
- jj-vcs/jj GitHub issues searched for "colocated pre-commit" + "git hook auto-fire" + "post-squash hook" — no resolved issue found that adds auto-fire to colocated mode as of jj 0.41. Confirms path C has no jj-version threshold to gate on yet; path B is the practical pick.

### In-tree references (file:line, repo-local)
- `sdk/src/vcs/jj/octopus.ts:1-324` — `createPhaseStructure`, `createSubagentHead`, `createSubagentSlot` (already shipped; lift target)
- `sdk/src/vcs/jj/reap.ts:1-198` — `performJjReap` (already shipped; lift target)
- `sdk/src/vcs/types.ts:185-262, 296-301, 382-409` — existing `WorkspaceInfo`, `WorkspaceMergeOpts`, `WorkspaceMergeResult`, `IncompleteWorkEntry`, `ReapResult`, `VcsWorkspace` interface
- `sdk/src/vcs/backends/jj.ts:1180-1226` — `workspace.merge` body (composed inside `vcs.parallel.fanIn` jj branch)
- `get-shit-done/workflows/execute-phase.md:521-810` — raw-git worktree dispatch+merge+cleanup block (deletion target)
- `get-shit-done/workflows/quick.md:660-810` (approx) — single-agent worktree dispatch block (deletion target)
- `get-shit-done/bin/lib/worktree-safety.cjs:402` — `worktree.cleanup-wave` executor (composed inside `vcs.parallel.fanIn` git branch)
- `sdk/src/vcs/__tests__/jj-octopus.test.ts` and `jj-reap.test.ts` — existing test surface; v1.3 adds cross-backend wrappers + git-side parity tests
- `.planning/PROJECT.md` Active list + Key Decisions row 14 — v1.3 scope statement, raw-git exception tracking
- `.planning/MILESTONES.md` v1.1 known-follow-ups #1 — orchestrator parallelization rewrite carry-forward
- `.planning/RETROSPECTIVE.md` v1.0 known-follow-ups #4 — A3 colocated pre-commit gap (three fix paths documented)
- `~/.claude/projects/-Users-LoganDark-Documents-Projects-get-shit-done/memory/project_a3_colocated_pre_commit_gap.md` — A3 fix-path catalog (paths A/B/C)
- `~/.claude/projects/-Users-LoganDark-Documents-Projects-get-shit-done/memory/project_no_parallelization_yet.md` — config knob status, dispatch-vs-substrate gap
- `.planning/milestones/v1.1-REQUIREMENTS.md:303` — HOOK-03 status row: "three fix paths documented as v2 work in 04-LEARNINGS Open Questions" (Phase 4 source is archived; memory + retrospective preserve the verdicts)
- `scripts/lint-vcs-no-raw-git.cjs` + allowlist JSON — milestone-completeness-proof enforcer

---
*Feature research for: cross-backend parallel-subagent-dispatch verbs on the dual-backend VCS adapter (v1.3)*
*Researched: 2026-05-15*
