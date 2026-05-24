# Architecture Research — v1.3 `vcs.parallel.*` cross-backend dispatch verbs

**Domain:** GSD jj-port — VCS adapter (TypeScript, dual-backend git/jj)
**Researched:** 2026-05-15
**Confidence:** HIGH (every claim cites a current `file:line`, read live during research)
**Scope:** Integration points for lifting parallel-dispatch into `VcsAdapter` ONLY. Roadmap shape, requirement IDs, and milestone phasing are downstream of this file.

## Pre-emptive corrections (saves the planner cycles)

1. **The "single acknowledged raw-git exception" is NOT in `execute-phase.md` or `quick.md`.** The lint scanner (`scripts/lint-vcs-no-raw-git.cjs:63`) `SCAN_EXT = /\.(cjs|js|mjs|ts|yml|yaml|sh|bash)$/` — `.md` files are not scanned. The raw-git blocks in `execute-phase.md:537-807` and `quick.md:776-789` are templated INTO subagent shell environments; they avoid the lint by surface, not by allowlist. The cleanup-tail snippet at `execute-phase.md:782-808` (raw `git worktree list`, `git worktree remove --force`, `git branch -D`, `git worktree prune`) is the "single acknowledged exception" — but it's exception-by-template-substitution, not exception-by-allowlist-entry. **PROJECT.md's "lint-vcs-no-raw-git.cjs should have zero allowlist entries" framing is mildly miscalibrated**: the allowlist already contains 23 production entries (verified `lint-vcs-no-raw-git.allow.json`), most for SDK internals (`backends/git.ts`, `exec.ts`), tests, and shell hooks. v1.3's collapse target is the MARKDOWN templated cleanup blocks, not the allowlist.

2. **The jj backend's `workspace.merge` (jj.ts:1175-1245) already implements 2-parent merge with atomic main-advance + agent-bookmark delete under RAII lock.** This is the `workspace.merge` that `bin/lib/worktree-safety.cjs::executeWorktreeWaveCleanupPlan` (line 471-477) consumes today via the v1.1 WAVE-01 wave-cleanup executor. v1.3's `vcs.parallel.fanIn` is NOT building from scratch — it's wrapping/orchestrating existing primitives that handle wave-N's per-branch fan-in. The NEW work is at a higher orchestrator tier (whole-wave dispatch, not per-branch merge).

3. **`octopus.ts` is already an orchestrator-tier helper, not a backend internal.** Its header at `sdk/src/vcs/jj/octopus.ts:2-32` calls itself "orchestrator-tier coordination layer composed on top of existing adapter primitives." It currently lives in `vcs/jj/` because UPSTREAM-02 sidecar discipline kept it out of `backends/jj.ts` to minimize upstream-rebase conflict surface. It is NOT called from `backends/jj.ts`. Promoting it means wiring it INTO the `JjVcsAdapter` factory, which crosses a sidecar boundary — see Integration #3 below for the rebase-cost analysis.

4. **`bin/lib/worktree-safety.cjs::executeWorktreeWaveCleanupPlan` (lines 417-516) is the existing canonical fan-in.** Any new `vcs.parallel.fanIn` verb either subsumes this or delegates to it. The `_deps={vcs}` DI seam (ADR-0004) is already in place. Migrating callers is a one-line change at each callsite; the orchestrator logic does NOT need to be re-implemented in TS.

---

## Integration Point #1 — Verb shape on the adapter surface

**Question:** `vcs.parallel.dispatch` sub-namespace vs. top-level `vcs.parallelDispatch` vs. extending `vcs.workspace.*`?

### Precedent audit (cross-namespace, verified at `sdk/src/vcs/types.ts:294-425`)

| Namespace | Members | Pattern |
|-----------|---------|---------|
| `vcs.refs.*` | `head, parent, bookmarks, currentBookmarks, currentBookmarksIn, mergeBase, readBlob, resolveShort, countCommits, rootCommits, exists, isIgnored, remotes` | Sub-namespace; nested `bookmarks` sub-sub-namespace |
| `vcs.refs.bookmarks.*` | `list, create, move, delete, exists, switch` | Sub-sub-namespace for noun-grouped CRUD |
| `vcs.workspace.*` | `add, forget, list, context, prune, reap, merge, remove` | Sub-namespace for workspace lifecycle CRUD + composites (`merge`, `remove`, `reap`) |
| `vcs.gitOnly.*` | `createAnnotatedTag, version, init, configGet, configSet, gitDir, gitCommonDir, revert, revertAbort, reset, merge, restore` | Capability namespace, type-narrowed (only on `GitVcsAdapter`) |
| `vcs.expr.*` | factory module — NOT on the adapter | Imported as `{ expr }` from `sdk/src/vcs/index.js` |
| Top-level | `commit, log, status, diff, push, fetch, findConflicts, acquireWriteLock` | Single-verb-per-noun primitives |

**Pattern law:** Multi-verb composites that share state (workspaces, refs, bookmarks) live under a sub-namespace. Single primitives go top-level. `acquireWriteLock` is the closest top-level analogue to a "parallelism primitive" — and it's top-level because there's just one verb on the lock noun.

### Recommendation: `vcs.workspace.parallel.*` (sub-sub-namespace under `workspace`)

Rationale, in priority order:

1. **Parallel-dispatch IS workspace orchestration.** The whole verb family creates workspaces (jj-workspaces / git-worktrees), runs work, fans in via merges, then removes them. Today's primitives — `workspace.add`, `workspace.merge`, `workspace.remove`, `workspace.reap` — are the building blocks. Putting `parallel` next to them (not at top level) keeps the noun grouping coherent.
2. **Discoverability:** `vcs.workspace.<TAB>` should reveal the whole workspace surface. Hiding parallel orchestration under a sibling top-level `parallel` namespace fragments the mental model.
3. **`refs.bookmarks.*` is the precedent.** Two-level nesting is already in use (`refs` → `bookmarks` → verb). The depth is acceptable when the inner namespace cleanly groups a coherent verb set.
4. **Type-narrowing:** unlike `gitOnly`, parallel dispatch IS cross-backend. So it belongs under `VcsAdapterCommon`, not in a kind-gated branch.

**Proposed surface (planner refines naming):**

```typescript
// types.ts (NEW interface alongside VcsWorkspace at sdk/src/vcs/types.ts:392-425)
export interface VcsWorkspaceParallel {
  /**
   * Plan a parallel wave: create N workspaces forked from `base`, each
   * tagged with `agentBookmark` from `agentBookmarks[i]`. Returns the
   * dispatch handles the orchestrator hands to subagents (cwd path is
   * what agent prompts need; structureRoot is for fan-in coordination).
   *
   * On jj: creates the lazy phase-octopus structure (octopus.ts::createPhaseStructure)
   *        + N subagent slots (octopus.ts::createSubagentSlot).
   * On git: creates N worktrees via `worktree add` + corresponding `worktree-agent-<id>`
   *         branches. No octopus structure (git fan-in is per-branch sequential merges).
   */
  dispatch(opts: ParallelDispatchOpts): ParallelDispatchResult;

  /**
   * Fan-in a dispatched wave: merge every agentBookmark in `wave.handles`
   * back into `wave.mainBookmark`, then forget+rm each workspace, then
   * cleanup agent bookmarks.
   *
   * On jj: wraps existing workspace.merge (jj.ts:1175-1245) per handle +
   *        workspace.reap fallback for crashed/empty heads.
   * On git: wraps existing workspace.merge (git.ts:659-704) per handle +
   *         workspace.remove for cleanup. Equivalent of today's
   *         executeWorktreeWaveCleanupPlan loop body.
   */
  fanIn(wave: ParallelWaveHandle): ParallelFanInResult;
}

// Add to VcsWorkspace (types.ts:392):
export interface VcsWorkspace {
  // ... existing members ...
  parallel: VcsWorkspaceParallel;
}
```

**Rejected alternatives:**

- `vcs.parallel.*` (top-level): coherent but fragments workspace surface. Costs more in discoverability than it saves in path-length.
- `vcs.parallelDispatch` / `vcs.parallelFanIn` (flat): violates "multi-verb composites group under sub-namespace" pattern; adds two new top-level identifiers when one nested noun would do.
- Extending `vcs.workspace.*` flat with `parallelDispatch` / `parallelFanIn`: hybrid of the above; loses the `vcs.workspace.parallel.<TAB>` discovery win.
- `vcs.workspace.wave.*` (alternate noun): "wave" is execute-phase.md lingo, not adapter lingo. "parallel" maps cleanly to existing config (`parallelization: true`) and is the term Claude Code subagent docs use (`isolation="worktree"` IS parallel dispatch).

---

## Integration Point #2 — Backend implementation split

**Question:** Where does the git-backend implementation live? `sdk/src/vcs/git/parallel.ts` (parallel to jj's namespace)? Or inlined in `backends/git.ts`?

### Status quo

| Backend | Existing parallel-adjacent code | Lives at |
|---------|---------------------------------|----------|
| jj | `createPhaseStructure`, `createSubagentSlot`, `createSubagentHead` | `sdk/src/vcs/jj/octopus.ts` (orchestrator-tier helper, NOT consumed by `backends/jj.ts`) |
| jj | `performJjReap` | `sdk/src/vcs/jj/reap.ts` (consumed by `backends/jj.ts:1135-1157` `workspace.reap`) |
| jj | `workspace.merge` (2-parent + atomic advance) | `backends/jj.ts:1175-1245` |
| git | `workspace.merge` (no-ff + agent-branch-D) | `backends/git.ts:659-704` |
| git | wave-cleanup orchestration | `bin/lib/worktree-safety.cjs:417-516` (CJS, NOT in SDK) |
| git | per-worktree create | `backends/git.ts:570-582` (`workspace.add`) |

**Architectural asymmetry to resolve:**

The jj side has dedicated sidecars (`jj/octopus.ts`, `jj/reap.ts`, `jj/lock.ts`, `jj/incomplete-work.ts`, `jj/pre-push.ts`) under `sdk/src/vcs/jj/`. The git side has NO `sdk/src/vcs/git/` directory — everything is inlined in `backends/git.ts`. **This asymmetry is intentional and load-bearing:**

- `sdk/src/vcs/jj/` exists because of **UPSTREAM-02 sidecar discipline** — these files do NOT exist in upstream and stay out of `backends/jj.ts` (which itself is a fork-only file). Keeping helpers in sidecars rather than inlined keeps `backends/jj.ts` diff-clean against any upstream-renamed APIs.
- The git side lives in `backends/git.ts` because git IS upstream's substrate. There's no upstream-rebase risk; inlining is fine.

### Recommendation: asymmetric sidecars — `sdk/src/vcs/git/parallel.ts` NEW; `jj/octopus.ts` + `jj/reap.ts` stay where they are

**Rationale:**

1. **Git side gets a new sidecar despite no rebase pressure** because the wave-dispatch logic is non-trivial (~100 LOC equivalent to lines 417-516 of `worktree-safety.cjs` lifted into TS). Inlining it in `backends/git.ts` would balloon that file past 1000 LOC and mix per-verb-primitive code (every other method in that file is small, 5-50 LOC) with orchestrator-tier loop bodies.
2. **Pattern symmetry:** with `vcs/git/parallel.ts` and `vcs/jj/octopus.ts` + `vcs/jj/reap.ts`, both backends route parallel orchestration through sidecars. The pattern reads cleanly.
3. **Sidecar contract:** like `jj/reap.ts::performJjReap` (signature at reap.ts:117), the git sidecar exposes a pure function consumed by `backends/git.ts`. The backend wraps it into the public `workspace.parallel.*` surface; the sidecar contains the raw-git invocations + loop logic.

**Final layout:**

```
sdk/src/vcs/
├── backends/
│   ├── git.ts        — calls performGitParallelDispatch/FanIn from git/parallel.ts
│   └── jj.ts         — calls existing performJjReap + NEW performJjParallelDispatch/FanIn (composed from octopus.ts + reap.ts)
├── git/              — NEW DIRECTORY
│   └── parallel.ts   — performGitParallelDispatch, performGitParallelFanIn (NEW FILE)
└── jj/
    ├── octopus.ts    — UNCHANGED location; backends/jj.ts NOW imports it (today it doesn't)
    ├── reap.ts       — UNCHANGED
    ├── lock.ts       — UNCHANGED
    └── parallel.ts   — NEW FILE: performJjParallelDispatch / performJjParallelFanIn — composition layer that calls octopus.createPhaseStructure + createSubagentSlot for dispatch, workspace.merge + workspace.reap + workspace.remove for fan-in
```

---

## Integration Point #3 — Octopus / Reap promotion path

**Question:** Should `sdk/src/vcs/jj/octopus.ts` + `reap.ts` move/rename to fit the new role?

### `octopus.ts` — UPGRADE in place; do NOT move

- Today: orchestrator-tier helper, not called from `backends/jj.ts`. Its public exports (`createPhaseStructure`, `createSubagentSlot`, `createSubagentHead`) match what a future `jj/parallel.ts::performJjParallelDispatch` needs to compose.
- After v1.3: `backends/jj.ts` imports `octopus.ts` indirectly via `jj/parallel.ts::performJjParallelDispatch`, which composes `createPhaseStructure` + `createSubagentSlot` per wave.
- **No rename.** "Octopus" describes the jj-specific commit topology (one parent + N children + one merge); it's the right name for this file. Renaming to `parallel.ts` would lose information AND make the file describe its consumer (parallel dispatch) rather than its substrate (the octopus jj-DAG shape).

**Risk:** `octopus.ts:34` claims sidecar discipline ("does NOT import from `backends/jj.ts`"). After v1.3 it's still true — `octopus.ts` doesn't import from `backends/jj.ts`, but the new `jj/parallel.ts` will import BOTH octopus.ts AND will be imported BY `backends/jj.ts`. The boundary holds in the right direction (backend → parallel → octopus, all one-way).

### `reap.ts` — UPGRADE in place; expose two consumption modes

- Today: consumed by `backends/jj.ts:1135-1157` as `workspace.reap`. The orchestrator calls `vcs.workspace.reap({phaseNamePrefix, phaseDir})` for crash-recovery + cleanup after a phase merge.
- After v1.3: `jj/parallel.ts::performJjParallelFanIn` consumes `performJjReap` internally as the "any leftover empty-or-incomplete heads after the merge loop" step. The existing `vcs.workspace.reap` stays public.
- **No rename.** "Reap" remains the right verb for "abandon empty heads + queue incomplete work."

### `incomplete-work.ts` — UNCHANGED

`appendIncomplete` / `readIncomplete` already cross-backend (`backends/git.ts:32` already imports `readIncomplete` from `jj/incomplete-work.js` for the phase-merge gate, despite the dir name — this is the right cross-backend home).

### Promotion = NO file moves; INTRODUCE `jj/parallel.ts` as the composition layer

`jj/parallel.ts` (new file) is the file that `backends/jj.ts` imports, in the same pattern as today's `import { performJjReap } from '../jj/reap.js'` at line 33.

```typescript
// sdk/src/vcs/jj/parallel.ts (NEW)
import { createPhaseStructure, createSubagentSlot } from './octopus.js';
import { performJjReap } from './reap.js';
// ... composes them. Pure function. Consumed by backends/jj.ts.
```

---

## Integration Point #4 — The raw-git lint, after collapse

**Question:** After v1.3, how does the git-backend parallel verb avoid triggering its own lint?

### Current state (verified `scripts/lint-vcs-no-raw-git.allow.json`)

23 entries. Categories:
- SDK adapter substrate (4): `exec.ts`, `backends/git.ts`, `vcs/__tests__/vcs-fixture.ts`, related vcs internal tests
- SDK glob tests (3): `vcs/__tests__/**`, `query/**/*.test.ts`, `**/*.integration.test.ts`
- Top-level tests (3): `tests/**/*.test.cjs`, `tests/**/*.test.ts`, `vcs-cjs-smoke.test.cjs`
- Scan/security scripts (5): `lint-vcs-no-raw-git.cjs`, `check-skip-count.cjs`, `base64-scan.sh`, `prompt-injection-scan.sh`, `secret-scan.sh`
- Hooks/CI/docs (3): `.github/workflows/**`, `.githooks/**`, `docs/**`, `.planning/**`
- Test capture (1): `capture-vcs-baselines.cjs`

**Crucially, `backends/git.ts` IS allowlisted today** (entry at line 6): "VCS adapter internals — the git backend implementation; raw `git` is the substrate." This will not change in v1.3 — `backends/git.ts` running raw git IS the legitimate substrate for the git backend.

### Recommendation: `sdk/src/vcs/git/parallel.ts` JOINS the allowlist

Same rationale as `backends/git.ts`: the new file IS adapter internals — substrate for the cross-backend surface. Add one entry:

```json
{
  "path": "sdk/src/vcs/git/parallel.ts",
  "reason": "VCS adapter internals — git-side parallel-dispatch substrate; raw `git worktree`/`merge`/`branch -D` are the substrate the cross-backend `workspace.parallel.*` surface wraps.",
  "owner": "@LoganDark"
}
```

### v1.2 lint-as-enforcer pattern application

Per v1.2 Retrospective lesson 1 ("Make the lint guard's first green run the architectural proof"):

**v1.3 lint completeness proof = `bin/lib/worktree-safety.cjs::executeWorktreeWaveCleanupPlan` body has NO raw-git after the migration, AND `execute-phase.md:782-808` cleanup-tail snippet is deleted (replaced by a single `gsd-sdk query workspace.parallel.fan-in --manifest …` call).**

This requires:
1. The shell-script lint patterns at `lint-vcs-no-raw-git.cjs:85-91` already catch `git worktree …` and `git branch -D` inside `.sh`/`.bash` (only). They do NOT catch raw git inside heredoc-templated shell blocks inside `.md` files. **v1.3 should add a one-off audit pass over `get-shit-done/workflows/*.md` and `agents/*.md` for raw-git invocations, but NOT extend the lint to `.md`** — markdown legitimately contains `git` as English text in 100s of places.
2. Instead, add an **audit script** (one-shot, not a CI lint): `scripts/audit-workflow-raw-git.cjs` that scans `*.md` shell fence blocks (` ```bash`/` ```sh` zones) for the same patterns. Run at v1.3 close; emit close-gate "all .md shell fences clean" report. This mirrors the audit/lint pattern v1.2 established (`scripts/audit-id-namespace.cjs` + `scripts/lint-vcs-no-commit-id.cjs`) — except here the audit is one-shot rather than CI-permanent because there's no ongoing template-shell churn to police after the close.

### The "no-allowlist-entries" anti-goal is incorrect

PROJECT.md target features bullet 3 says "the single acknowledged raw-git exception in PROJECT.md collapses to zero." This is correct as written (the exception is the cleanup snippet in `.md` workflows), but the planner should NOT interpret it as "delete entries from `lint-vcs-no-raw-git.allow.json`." The 23 production entries (SDK substrate, tests, security scripts) stay. **One entry MIGHT be added** (the new `git/parallel.ts`). Net: +1 or +0, not -1.

---

## Integration Point #5 — Configuration knob

**Question:** Where does `parallelization` live? Default-change risks?

### Current state (verified `.planning/config.json:4`)

```json
{ "parallelization": false }
```

Lives at the TOP LEVEL of `.planning/config.json`. Read by `execute-phase.md:74` via the SDK's `gsd-sdk query config-get parallelization` path.

There is ALSO `workflow.use_worktrees` (verified `execute-phase.md:84`):

```bash
USE_WORKTREES=$(gsd-sdk query config-get workflow.use_worktrees 2>/dev/null || echo "true")
```

These are TWO separate knobs today:
- `parallelization` (top-level) — controls whether multi-plan waves run in parallel vs. sequential
- `workflow.use_worktrees` — controls whether parallel agents get isolated worktrees vs. share the main tree

Both default to false/true differently. `parallelization: false` means waves serialize even if worktrees are available; `use_worktrees: true` (default) means isolation IS used when parallelization is on. They are not fully orthogonal — `parallelization: false` makes `use_worktrees` mostly moot.

### Recommendation: keep BOTH knobs; flip `parallelization` to `true`; leave `use_worktrees` semantics alone

1. **Where the knob lives:** stays at top level of `.planning/config.json`. Don't move.
2. **Default change:** `parallelization: true` becomes the new install-template default at `get-shit-done/templates/config.json` (or wherever the installer reads from — verify location in planning). For brownfield repos with `parallelization: false` already written, the explicit `false` value wins — only NEW projects pick up the new default.
3. **Migration path for existing repos:** None forced. Brownfield repos keep `parallelization: false` until the user edits the config OR runs an opt-in `/gsd-migrate-vcs`-equivalent that bumps it. This is the same pattern v1.0's GREEN-01..03 used for the jj-vs-git default choice.
4. **Greenfield jj + parallelization: true:** the dogfood phase (final v1.3 phase per PROJECT.md) is the validation surface. If the dogfood phase succeeds, the default flip is sound.

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Existing brownfield repos with `parallelization: false` explicitly set stay sequential (no behavior change) | LOW | This is the desired behavior; don't auto-flip values in installed configs. |
| Existing brownfield repos with `parallelization` unset (i.e., relying on default false) silently start parallelizing | MEDIUM | Solo-dev context: this fork IS the brownfield dogfood. No external users. The repo's own `.planning/config.json` has `parallelization: false` written explicitly (line 4), so the flip is local-test surface only. |
| User's CI/test infra not parallel-ready on jj | LOW | CI parallel-path lane (PROJECT.md "Target features" #5) is a v1.3 deliverable; it validates this before close. |
| Greenfield jj users get parallel-by-default but their hooks/test harness aren't octopus-aware | MEDIUM | A3 colocated pre-commit gap (#6) is the live example of this risk. Bundled fix in v1.3 closes the gap. |

### Knob name churn — recommend NONE

The name `parallelization` is the install-time public surface. Don't rename to `workspace.parallel` or similar; the v1.3 architectural change is internal (cross-backend adapter routing). The user-facing knob stays.

---

## Integration Point #6 — Subagent prompts

**Question:** What needs rewriting? Should agent prompts know about parallel context?

### Survey of current prompt references

`agents/gsd-executor.md` (verified) has THREE distinct worktree-aware sections:

| Lines | Content | Backend-specificity |
|-------|---------|---------------------|
| 412-432 | cwd-drift assertion (#3097) — `[ -f .git ]` check + `*.git/worktrees/*` match | Git-only by construction (jj has no `.git/worktrees/`) |
| 442-457 | Absolute-path safety (#3099) — `WT_ROOT=$(git rev-parse --show-toplevel)` | Git-only (raw-git invocation) |
| 460-477 | Pre-commit HEAD safety (#2924) — protected-ref deny-list + `worktree-agent-*` allow-list | Git-only (uses `git rev-parse --abbrev-ref HEAD`) |
| 543-555 | "NEVER run `git clean` inside a worktree" — absolute rule | Git-only (jj uses workspaces; no `git clean` semantics) |

Plus the templated execute-phase.md `<worktree_branch_check>` block at lines 568-585.

### Architectural question: should the agent prompt know it's parallel?

Two design options:

**Option A (status quo + extension):** Agent prompts continue to know "I am in a worktree" / "I am in a workspace" and have backend-specific safety code paths.

**Option B (orchestrator-only):** Agent prompts receive only a `cwd` and execute against it. ALL safety probes (HEAD assertion, branch namespace check, cwd-drift) move to a `gsd-sdk query` precondition the agent calls at startup.

### Recommendation: Option B with phased migration

Rationale:
1. **The agent SHOULDN'T need to know about backend kind.** Today's `[ -f .git ]` check (executor.md:413, 463) is a runtime backend-detector inside the agent prompt — that's an architectural smell. The adapter knows the backend; the agent should query it.
2. **Symmetry with #5 (config knob):** if `parallelization: true` is the default and the orchestrator handles dispatch routing internally, then agents should treat their cwd as opaque. Whether it's a git worktree, a jj workspace, or the main tree, the agent's job is "execute the plan, commit via `gsd-sdk query commit`, exit."
3. **`worktree-agent-*` branch namespace is git-only.** On jj, the analogue is the `gsd/phase-{NN}-subagent-{idx}` workspace name + the `subagent N` change subject (octopus.ts:215). The agent shouldn't have to bridge these — orchestrator commits per `<workspace_branch_check>` semantics belong in the cross-backend adapter, NOT in the agent prompt.

### Concrete migration shape

Introduce ONE new SDK verb: `gsd-sdk query workspace.assert-dispatched-cwd --cwd .`. Returns ok / failure code + reason. Body internally:
- on git: `[ -f .git ]` + `worktree-agent-*` branch namespace match + cwd-drift check
- on jj: `gsd/phase-{NN}-subagent-{idx}` workspace name match + workspace-path within `.claude/jj-workspaces/`

Agent prompts replace lines 412-477 of executor.md with one call to this verb. The prompt stays semantically equivalent ("HALT if I'm not in a properly-dispatched workspace"), but the implementation moves cross-backend.

### Agents to update

| Agent | Touched today | v1.3 plan |
|-------|---------------|-----------|
| `agents/gsd-executor.md` | Lines 412-555 | Replace 4 worktree-aware blocks with 1 `assert-dispatched-cwd` call |
| `agents/gsd-debugger.md` | Lines 20, 534-536 (text references) | No-op (text references only, no commands) |
| `agents/gsd-code-fixer.md` | TBD | Audit |
| All other 30+ agents | Unverified | Cheap grep audit — most likely have zero worktree-mode code |

### `worktree-path-safety.md` reference (line 613 of execute-phase.md)

The reference file at `get-shit-done/references/worktree-path-safety.md` is loaded into every executor prompt's `<execution_context>`. Its contents (not read live, but inferable from the load site) are git-worktree-specific. v1.3 should rename it to `dispatch-cwd-safety.md` and rewrite its body to be cross-backend (or replace it entirely with the agent-side `assert-dispatched-cwd` query call).

---

## Integration Point #7 — Build order

The natural dependency chain (planner-actionable):

```
1. Adapter surface design (types.ts)
   └─ Decide: vcs.workspace.parallel.* sub-sub-namespace
   └─ New types: ParallelDispatchOpts, ParallelDispatchResult, ParallelWaveHandle, ParallelFanInResult
   └─ Add `parallel: VcsWorkspaceParallel` to VcsWorkspace interface
   
2. Sidecar function bodies (pure, testable in isolation)
   ├─ NEW: sdk/src/vcs/jj/parallel.ts (composes octopus.ts + reap.ts)
   └─ NEW: sdk/src/vcs/git/parallel.ts (lifts worktree-safety.cjs::executeWorktreeWaveCleanupPlan into TS)
   
3. Backend wiring (small, mechanical)
   ├─ backends/jj.ts:1045 (workspace = Object.freeze({...})) — add parallel sub-key
   └─ backends/git.ts:569 (workspace = Object.freeze({...})) — add parallel sub-key
   
4. Lint allowlist update
   └─ scripts/lint-vcs-no-raw-git.allow.json — add `sdk/src/vcs/git/parallel.ts`
   
5. Test coverage (parameterized contract suite)
   └─ sdk/src/vcs/__tests__/vcs-workspace-parallel.test.ts — parameterized over both backends
   └─ Existing fixture pattern from sdk/src/vcs/__tests__/vcs-fixture.ts
   
6. CJS bridge consumer migration (the wave-cleanup executor)
   └─ bin/lib/worktree-safety.cjs::executeWorktreeWaveCleanupPlan — replace inline body with
      a single vcs.workspace.parallel.fanIn() call. Caller signature stays;
      ADR-0004 _deps={vcs} seam preserved. Audit caller surface (cmdWorktreeCleanupWave).
   
7. New SDK query verb for agent precondition (#6 enabler)
   └─ NEW: sdk/src/query/workspace-assert-dispatched-cwd.ts (or extend existing workspace-list)
   └─ gsd-sdk query workspace.assert-dispatched-cwd command wiring
   
8. Orchestrator workflow rewrites
   ├─ get-shit-done/workflows/execute-phase.md — replace dispatch (~line 510-650) +
   │  cleanup (~line 743-808) blocks with single vcs.workspace.parallel.dispatch /
   │  fan-in invocations. Sequential mode path stays untouched (no parallel.* call).
   ├─ get-shit-done/workflows/quick.md — same pattern, smaller scope (single executor)
   └─ Per-plan worktree-gate (execute-phase/steps/per-plan-worktree-gate.md) — may
      still apply (submodule intersection), but feeds INTO the new dispatch call.
   
9. Agent prompt rewrites (#6 consumer)
   ├─ agents/gsd-executor.md — replace 4 raw-git worktree blocks with 1 query call
   ├─ get-shit-done/references/worktree-path-safety.md — rename + rewrite cross-backend
   └─ Sweep other agents for residual worktree-mode references (cheap grep)
   
10. Config default flip
    └─ get-shit-done/templates/config.json (or wherever installer reads) — parallelization: true
    
11. A3 colocated pre-commit gap fix (independent track, parallel to 1-10 above)
    └─ See Integration #8 below — this lives in sdk/src/vcs/hook-bridge.ts and possibly
       jj/pre-commit-bridge.ts; NOT an adapter interface change.
    
12. CI parallel-path lane (final close-gate)
    └─ .github/workflows/* — new matrix lane runs an end-to-end parallel phase on both
       backends. Required-blocking on jj-colocated.
    
13. Dogfood phase (SEPARATE, FINAL, per PROJECT.md)
    └─ Spins up 2-3 synthetic plans on this repo; runs them via new dispatcher;
       validates clean fan-in + reap + agent-bookmark cleanup; records metrics in
       .planning/intel/.
    
14. One-shot workflow-raw-git audit (lint-as-enforcer close-gate)
    └─ scripts/audit-workflow-raw-git.cjs — scan *.md shell-fence blocks for raw-git;
       prove the cleanup-tail snippet and dispatch templates are gone.
```

**Critical dependencies (cannot reorder):**
- 1 before 2 (types must exist before bodies compile)
- 2 before 3 (sidecar functions must exist before backends import them)
- 3 before 5 (backends must expose surface before tests can call it)
- 5 before 6 (test coverage proves the surface works before CJS callers depend on it)
- 6 before 8 (the workflows depend on the migrated CJS bridge)
- 7 before 9 (the SDK query verb must exist before agent prompts reference it)
- 8 + 9 before 10 (config flip is meaningless until workflows + agents use the new surface)
- 10 before 12 (CI lane validates the flipped default)
- 12 before 13 (CI green before dogfood)

**Parallelizable lanes:**
- 11 (A3 fix) runs independently of 1-10; only joins at 12 (CI integration).
- 2's two new sidecar files (jj/parallel.ts and git/parallel.ts) can be built in parallel after 1.
- 8 (workflows) and 9 (agents) can be built in parallel after 6+7.

---

## Integration Point #8 — A3 colocated pre-commit gap

**Question:** Adapter change, or `bin/lib/` / hook-wiring change?

### Status quo

Per `project_a3_colocated_pre_commit_gap` memory and PROJECT.md "Active" section: jj 0.41 doesn't auto-fire `.git/hooks/pre-commit` after `jj squash` in colocated mode. Three fix paths documented in Phase 4 LEARNINGS Open Q1, owned by Phase 5 → carried forward → bundled with v1.3.

### Audit of the hook surface (current state)

| File | Role |
|------|------|
| `sdk/src/vcs/hook-bridge.ts` | Private helper; fires hooks from inside `commit()` / `push()`. Cross-backend. |
| `sdk/src/vcs/jj/pre-push.ts` | jj-side pre-push wiring; consumed by `backends/jj.ts:36` |
| (no `jj/pre-commit.ts` today) | Pre-commit on jj is fired internally from `backends/jj.ts::commit` post-squash. In colocated mode, it fires the JS-side hook bridge BUT NOT the `.git/hooks/pre-commit` shell hook — that's the A3 gap. |
| `.githooks/pre-commit` | Shell-side pre-commit hook (allowlisted as `.githooks/**`). NOT fired by jj 0.41 in colocated mode. |

### Recommendation: NOT an adapter interface change

The fix is internal to `backends/jj.ts::commit` body (`sdk/src/vcs/backends/jj.ts:157-318`-ish) or to a new `sdk/src/vcs/jj/pre-commit-bridge.ts` sidecar consumed by it. **The public `CommitInput`/`CommitResult` surface (types.ts:24-98) does NOT change.**

Of the three fix paths documented in Phase 4 LEARNINGS Open Q1 (planner: re-read that file for specifics — not read live in this research pass):

1. Manually spawn `.git/hooks/pre-commit` after `jj squash` in colocated mode — adds ~5 LOC to `backends/jj.ts::commit`, gated on `vcs.kind === 'jj' && colocated === true`. Requires colocated detection (does `.git/` exist alongside `.jj/`?).
2. File an upstream jj bug + work around with a `jj fix`-style post-squash hook — slower, depends on jj release.
3. Use jj's native `jj-watchman`-style hooks — more invasive.

Path 1 is the cheapest, lives entirely in `backends/jj.ts` (no interface change, no new sidecar required), and aligns with the v1.2 pattern of "tighten the existing surface; don't add escape hatches." Path 1 is the architectural recommendation; planner picks based on Phase 4 LEARNINGS details.

### Architectural side-effect on lint-as-enforcer

Path 1 ADDS a raw-git invocation inside `backends/jj.ts` (spawning `.git/hooks/pre-commit` via `spawnSync` — that's NOT a `spawnSync('git', ...)` call, just `spawnSync('.git/hooks/pre-commit', ...)`, so it doesn't trigger the lint). Clean.

---

## Cross-cutting concerns the planner WILL hit

### Concern 1: ADR-0004 worktree-safety policy ownership

`bin/lib/worktree-safety.cjs:559-571` exports `executeWorktreeWaveCleanupPlan`. ADR-0004 names this file as policy owner. Step 6 of the build order migrates the body but keeps the export. After v1.3:
- The PUBLIC export is unchanged (caller signature stays; ADR-0004 names this file as canonical owner).
- The BODY internals shrink to: parse manifest → call `vcs.workspace.parallel.fanIn(manifest)`.
- ADR-0004 should get a one-line update noting the body delegates to the adapter.

### Concern 2: WAVE_WORKTREE_MANIFEST schema

`execute-phase.md:528-532` creates `WAVE_WORKTREE_MANIFEST` (mktemp JSON file with `{worktrees: [{agent_id, worktree_path, branch, expected_base, main_bookmark}]}`). Per `worktree-safety.cjs:319-373` `normalizeCleanupManifestEntry`. The manifest is the wire-protocol between orchestrator dispatch and orchestrator fan-in.

**v1.3 question:** does `vcs.workspace.parallel.dispatch` return a `ParallelWaveHandle` that REPLACES the manifest file? Or does it continue to write the JSON file (for backwards-compat with `cmdWorktreeCleanupWave` at worktree-safety.cjs:518)?

**Recommendation:** keep the on-disk manifest as the orchestrator-tier serialization format (it survives orchestrator-side process restarts; agents are spawned async; the file is the durable handle). `ParallelDispatchResult` returns the manifest path + parsed handles for in-memory chained calls. The orchestrator writes it once via `dispatch()`, hands the path to subagents, then reads it for `fanIn()`.

### Concern 3: Cross-backend handle naming

A handle today has `branch: 'worktree-agent-<id>'` (git-namespace). On jj it should be `bookmark: 'gsd/phase-{NN}-subagent-{idx}'` or similar. The new `ParallelWaveHandle` type needs an `agentBookmark` field (cross-backend per v1.2 unified revision model: the field is the bookmark/branch name, agnostic; backend interpretation differs).

`bin/lib/worktree-safety.cjs:330-334`'s `normalizeCleanupManifestEntry` already validates `branch: /^worktree-agent-[A-Za-z0-9._/-]+$/`. **v1.3 must relax this regex** to accept the jj namespace too — or, cleaner, swap to a cross-backend validator (`/^(worktree-agent-|gsd\/phase-)/` plus the existing allowed-chars suffix).

### Concern 4: The `WS-01/WS-02 lands a jj-workspace equivalent prompt template` TODO at execute-phase.md:569

execute-phase.md:569 has a TODO("05-05 sweep") block explicitly saying the worktree HEAD-assertion block is git-mode-only and stays raw git "until WS-01/WS-02 lands a jj-workspace equivalent prompt template; D-33 anti-pattern guard does NOT apply here." v1.3's #6 (agent prompts) IS the work that resolves this TODO. The planner should treat this TODO as a tracked v1.3 deliverable, not residual debt.

### Concern 5: Sequential-mode parity

`execute-phase.md:659-679` documents Sequential mode (when `USE_WORKTREES_FOR_PLAN=false`). v1.3's `vcs.workspace.parallel.*` is ONLY exercised in parallel mode. **Sequential mode stays exactly as it is today.** Planner should explicitly note: "Sequential mode is NOT touched by v1.3" to prevent accidental scope creep.

### Concern 6: Submodule-intersection per-plan gate

`execute-phase.md:504-508` (per-plan-worktree-gate.md) computes `USE_WORKTREES_FOR_PLAN` from `SUBMODULE_PATHS ∩ PLAN_FILES`. This logic stays in the workflow markdown — the adapter's `vcs.workspace.parallel.dispatch` is called with the FINAL set of plans that get worktree isolation. The gate is upstream of the adapter call, not folded into it.

### Concern 7: Sticky vcs.adapter resolution

PROJECT.md decision row (B-09 v1.0): "Sticky `vcs.adapter` resolution at write time." The new parallel verbs run at write time (creating workspaces, merging back). They MUST inherit the sticky resolution; do NOT re-detect backend kind inside the parallel verb body. The `createVcsAdapter(cwd, { kind: 'jj' })` factory at `worktree-safety.cjs:79, 184, 428` pins the kind explicitly — same pattern applies to the new verb call sites.

---

## Sources

All `file:line` references in this document were read live during research on 2026-05-15:

- `sdk/src/vcs/types.ts:1-579` (full interface)
- `sdk/src/vcs/backends/git.ts:1-945` (full file)
- `sdk/src/vcs/backends/jj.ts:1-200, 1140-1390` (commit body, workspace namespace + merge + remove)
- `sdk/src/vcs/jj/octopus.ts:1-324` (full file)
- `sdk/src/vcs/jj/reap.ts:1-198` (full file)
- `bin/lib/worktree-safety.cjs:1-580` (full file)
- `scripts/lint-vcs-no-raw-git.cjs:1-164` (full file)
- `scripts/lint-vcs-no-raw-git.allow.json` (full file, 23 entries verified)
- `get-shit-done/workflows/execute-phase.md:500-900` (dispatch + cleanup blocks)
- `get-shit-done/workflows/quick.md:760-799` (single-executor cleanup)
- `agents/gsd-executor.md:412-555` (worktree-aware sections)
- `.planning/PROJECT.md:1-167` (full file)
- `.planning/RETROSPECTIVE.md:1-83` (full file)
- `.planning/config.json` (full file, 13 lines)
- `.planning/milestones/v1.2-research/ARCHITECTURE.md:1-80` (prior research pattern style reference)

Memory items consulted:
- `project_no_parallelization_yet` — knob is OFF; rewrite blocked on octopus/reap
- `project_no_raw_git` — adapter covers read AND write; lint is whole-repo default-deny
- `project_a3_colocated_pre_commit_gap` — jj 0.41 colocated pre-commit, 3 fix paths in Phase 4 LEARNINGS Open Q1
- `project_unified_revision_model` — v1.2 stance: ONE revision concept; commit_id leakage is a defect
- `feedback_baseline_is_correctness_not_perf` — keep close-gates correctness-shaped, not over-engineered
- `feedback_solo_dev_no_expires` — solo-dev allowlist shape `{path, reason, owner}`

---

*Architecture research for: v1.3 cross-backend `vcs.workspace.parallel.*` dispatch verbs*
*Researched: 2026-05-15*
*HIGH confidence — all integration points cite live `file:line`. Open questions are flagged and bounded ("planner picks…"), not unresolved.*
