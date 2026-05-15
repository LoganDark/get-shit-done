# Project Research Summary — v1.3 jj octopus merge for subagents fully functional

**Project:** GSD jj-port
**Domain:** Cross-backend (git + jj) VCS adapter — lift parallel-subagent-dispatch into new `vcs.parallel.*` (or `vcs.workspace.parallel.*`) verbs, flip `parallelization: true`, close A3 colocated pre-commit gap
**Researched:** 2026-05-15
**Confidence:** HIGH on substrate, integration shape, and pitfalls; MEDIUM on final verb-namespace shape, A3 fix-path choice, and lint-collapse framing (three cross-dimension tensions documented below)

## Executive Summary

v1.3 is a **lift-and-collapse** milestone, not a build-from-scratch one. The hard pieces — `sdk/src/vcs/jj/octopus.ts` (createPhaseStructure / createSubagentSlot), `sdk/src/vcs/jj/reap.ts` (performJjReap), `workspace.merge` with atomic main-advance (v1.1 VCS-12), and `worktree-safety.cjs::executeWorktreeWaveCleanupPlan` (v1.1 WAVE-01) — are already shipped and verified. v1.3 promotes the jj-namespaced helpers to a cross-backend verb surface on `VcsAdapter`, lifts the raw-git worktree dispatch block out of `execute-phase.md` into the git backend, deletes the workflow-markdown raw-git shell-fence blocks, and flips `parallelization: true` as the new default. **No new npm dependencies are needed**; every primitive (spawnSync, vitest@3.1.1 `describe.sequential.skipIf`, `toBeIdOf` matcher, the existing `acquireJjWriteLock` RAII helper) already ships.

The architectural payoff is the v1.2-style **"first green lint run = milestone completeness proof"** pattern applied to `lint-vcs-no-raw-git`: after v1.3, workflow markdown contains zero executable raw-git inside shell fences, and the orchestrator calls one `vcs.parallel.dispatch` + one `vcs.parallel.fanIn` regardless of backend (mirroring v1.2's "workflows never branch on `vcs.kind` for id reasons" invariant — v1.3 extends to "for parallel-dispatch reasons"). Bundled in the same milestone: the A3 colocated pre-commit gap (carried from v1.0 Phase 4) closes via one of three documented fix paths.

The principal risks are not at the substrate level (proven) but at the **coordination boundary**: concurrent `jj squash` from N workspaces against a shared ancestor can interleave at the operation-log level and silently diverge (Pitfall 1 — requires a new repo-scoped lock distinct from Phase 4's per-workspace lock); in-tree conflicts during fan-in get classified as crashes if `parallel.fanIn` doesn't surface a `conflicted: boolean` field (Pitfall 2); partial-wave failure with one agent still running mid-dispatch needs a liveness gate before reap (Pitfall 3); `parallelization: true` default-flip strands brownfield repos without a pre-flight check + migration command (Pitfall 8); and the dogfood phase risks corrupting this very repo if a dispatcher bug surfaces under N≥3 (Pitfall 10 — must be last, isolated bookmark, synthetic plans only).

## Key Findings

### Stack additions

**No new dependencies.** Every primitive needed is already shipped in the repo.

- Node ≥22 + TypeScript ≥5.7 — unchanged
- `spawnSync` via existing `vcsExec`/`execGit` wrappers — sole subprocess primitive; adapter stays single-threaded by design (`acquireJjWriteLock` invariant)
- `jj` binary ≥0.41 — N-parent octopus form (`jj new <p1> ... <pN>`) verified; floor may rise only if A3 Path C is chosen (NOT recommended)
- `vitest@3.1.1` + `describe.sequential.skipIf(!jjAvailable)` (Pattern A) + `toBeIdOf('jj'|'git')` matcher (v1.2) — established test pattern; mirror for new `parallel-*` test files

Rejected explicitly: `p-limit`/`p-queue`/`p-map` (in-adapter parallelism violates per-workspace lock invariant), `worker_threads` (single-threaded adapter is load-bearing), `execa`/`cross-spawn` (sync `spawnSync` suffices), `simple-git`/`isomorphic-git`/libgit2 (would bypass `lint-vcs-no-raw-git`).

**Locking primitive note:** STACK says "no new primitives"; PITFALLS argues a NEW repo-scoped lock (sentinel `.jj/repo/gsd-parallel-lock`) is required. Reconciled as: "new file-based lock function inside existing `sdk/src/vcs/jj/lock.ts` module, not a new dep." See Tension 5.

See `STACK.md` for full detail.

### Feature table stakes

Must ship (without these the milestone goal is unmet):

- `vcs.parallel.dispatch(plan): ParallelDispatchHandle` — cross-backend; jj composes octopus.createPhaseStructure + N×createSubagentSlot; git wraps `git worktree add` with internal serialization (Pitfall 5)
- `vcs.parallel.fanIn(handle, results): FanInResult` — composes existing `workspace.merge` (jj) + `worktree.cleanup-wave` (git); MUST return `{merged, conflicted, incompleteQueued, failedReaped, surplusBookmarks}` (Pitfalls 2 + 4)
- Unified backend-opaque types using v1.2 unified-revision model (canonical `id` field, change_id on jj, commit_id on git)
- WAVE_WORKTREE_MANIFEST schema extension — `plan_id`, `agent_id`, `backend` fields, backwards-compatible
- Delete raw-git worktree dispatch + cleanup blocks in `execute-phase.md` (~521-810) and `quick.md` (~660-810)
- Subagent prompt collapse — `gsd-executor.md:412-555` → one cross-backend `workspace.assert-dispatched-cwd` query call; rename + rewrite `references/worktree-path-safety.md` to `dispatch-cwd-safety.md`
- `parallelization: true` becomes new install-template default
- A3 colocated pre-commit fix — pick ONE of three documented paths (Tension 3)
- A3 regression test on colocated fixture
- CI parallel-path lane — synthetic 2-plan phase E2E both backends; required-blocking on jj-colocated
- Dogfood phase LAST — 2-3 synthetic plans; metrics to `.planning/intel/v1.3-dogfood-metrics.md`

Differentiators (defer if scope tightens):
- Numeric `maxConcurrency` cap — only if dogfood reveals natural agent-cap insufficient
- Rebase-stability docs on `ParallelDispatchHandle.workspaces[].baseRev`
- Lint guard for `vcs.parallel.*` call-presence in workflows

Anti-features (explicit): `GSD_BACKEND_KIND` env var (re-creates vcs.kind branching at agent level), cross-machine dispatch, `vcs.parallel.cancel`, streaming event API, auto-cancel-siblings-on-failure, A3 Path C (no upstream jj fix to gate on).

See `FEATURES.md` for full detail.

### Architecture approach

The verbs land on `VcsAdapterCommon` (cross-backend) backed by **asymmetric sidecars** that mirror existing jj-side convention:

1. `sdk/src/vcs/types.ts` — new `VcsWorkspaceParallel` interface under `VcsWorkspace.parallel` (precedent: `refs.bookmarks.*`)
2. `sdk/src/vcs/jj/parallel.ts` (NEW) — composition layer; imports octopus.ts + reap.ts + workspace.merge; consumed by `backends/jj.ts`
3. `sdk/src/vcs/git/parallel.ts` (NEW DIR + FILE) — lifts ~100 LOC `executeWorktreeWaveCleanupPlan` body into TS; consumed by `backends/git.ts`; joins lint allowlist as adapter-internal substrate
4. `backends/jj.ts` + `backends/git.ts` — mechanical wiring (`workspace = Object.freeze({...parallel: …})`)
5. `bin/lib/worktree-safety.cjs::executeWorktreeWaveCleanupPlan` — body shrinks to one-line delegation; public export unchanged (ADR-0004 owner stays)
6. `execute-phase.md` + `quick.md` — raw-git blocks deleted; replaced with single `gsd-sdk query workspace.parallel.dispatch` + `… fan-in` calls
7. `agents/gsd-executor.md` — 4 worktree-aware blocks → 1 `workspace.assert-dispatched-cwd` call
8. CI matrix lane + lint close-gate + config flip + dogfood

Build-order critical path: types → sidecars → backends → tests → CJS migration → workflow rewrites → agent rewrites → config flip → CI lane → dogfood. A3 fix is an independent parallel track; joins at CI integration.

See `ARCHITECTURE.md` for full detail.

### Watch Out For (Critical Pitfalls)

Top 5 of 10 documented in `PITFALLS.md`:

1. **Concurrent `jj squash` from N workspaces against shared ancestor diverges silently** — Phase 4 `acquireJjWriteLock` is per-workspace NOT per-repo; new repo-scoped lock required (`.jj/repo/gsd-parallel-lock`, distinct sentinel). Detection: `jj log -r 'divergent()' --no-graph` must be empty post-fan-in.
2. **In-tree conflicts on octopus merge classified as "crash" by reap** — jj's conflict-tolerant return stores conflict markers as tree content; `isEmptyHead` returns non-empty. Fix: `parallel.fanIn` returns explicit `{conflicted: boolean, conflictedPaths: string[]}`; extend `IncompleteWorkEntry.reason` enum from 1 → 3 values.
3. **Partial-wave failure with one agent still running causes silent data loss** — current reap assumes quiescent post-wave. Fix: liveness probe (jj op log timestamp / git worktree mtime); return `{partial: true, liveWorkspaces: [...]}`; forbid `git worktree remove --force` in standard cross-backend path.
4. **N-way fan-in must be true octopus + batch bookmark delete** — sequential 2-parent merges defeat parallelism AND race on agent-bookmark cleanup (v1.1 Plan 02 precedent). Use one `jj new <p1>...<pN>` + one batched `jj bookmark delete <n1>...<nN>` under the new repo-scoped lock; mirror with git's octopus `git merge --no-ff` form + batched `git update-ref -d`.
5. **`.git/config.lock` race on simultaneous `git worktree add`** — currently documented as prompt-text-only serialization rule at `execute-phase.md:535-543`; once that markdown is deleted, the verb's internal loop must enforce serialization. Emit `[checkpoint] worktree N/M created` events. Cross-backend symmetry: serialize on jj side too to avoid behavioral asymmetry tests can't catch.

Plus Pitfalls 6 (A3 path — see Tension 3), 7 (lint regression watch post-collapse), 8 (default-flip strands brownfield — needs pre-flight + migration command), 9 (test flakiness — Pattern B random-prefix mkdtemp; never `retry: N`; never `describe.skip`), 10 (dogfood blast-radius — last phase, isolated bookmark, synthetic plans, pre-snapshot recovery).

## Cross-Dimension Tensions

Five tensions surfaced between the 4 researchers. Each requires a decision; recommendations follow but the roadmapper has final authority.

### Tension 1 — Verb-namespace shape

- **ARCHITECTURE recommends:** `vcs.workspace.parallel.dispatch` / `vcs.workspace.parallel.fanIn` (sub-sub-namespace under `workspace`; precedent `refs.bookmarks.*`)
- **FEATURES uses (planner-overridable):** `vcs.parallel.dispatch` / `vcs.parallel.fanIn` (top-level)
- **STACK:** name-agnostic

**Recommended position:** **`vcs.workspace.parallel.*`** (ARCHITECTURE position). The verbs compose `workspace.add/merge/remove/reap` — putting them in a sibling top-level namespace fragments discovery surface and breaks the noun-coherence pattern. Two-level nesting cost paid in exchange for `vcs.workspace.<TAB>` revealing the whole workspace surface in one place. Defensible.

**Classification:** SPEC-level (belongs in roadmap/requirements; not load-bearing for CONTEXT).

### Tension 2 — Phase count + shape

- **FEATURES:** 5 phases (lift verbs / orchestrator rewire / A3 / CI / dogfood)
- **PITFALLS:** 10 phases (A lock → B jj → C git → D classifier → E orchestrator → F tests → G A3 parallel → H lint close-gate → I default-flip → J dogfood)
- **ARCHITECTURE:** 14 build-order steps with critical-path dependencies + parallelizable lanes

**Trade-off:** Fewer-larger = narrative cohesion + matches v1.0-v1.2 phase shape but higher per-phase plan density. More-smaller = single architectural concern per phase + clearer verification but multiplies phase-transition ceremony.

**Must-honor sequencing constraints (from ARCHITECTURE):**
- Types → bodies → backends → tests → CJS migration → workflow → agents → config flip → CI → dogfood
- `workspace.assert-dispatched-cwd` SDK verb before agent prompt rewrites
- CI green before dogfood (Pitfall 10 blast-radius)
- A3 fix independent — parallel track joining at CI
- Dogfood is ALWAYS last

**Recommended position:** **Surface trade-off, roadmapper picks.** A 6-7-phase shape is defensible middle ground (Phase 1 lock+jj-verbs / 2 git-verbs+classifier / 3 orchestrator+agent-rewire / 4 A3 parallel / 5 CI+lint-close / 6 default-flip+dogfood) but the planner's plan-density preference rules.

**Classification:** SPEC-level (roadmap's decision).

### Tension 3 — A3 fix path

- **FEATURES recommends Path B:** explicit shell of `.git/hooks/pre-commit` in colocated mode; detect via `fs.existsSync('.git')`; matches user mental model; defines `.git/hooks/` vs `.githooks/` precedence
- **PITFALLS recommends Path 1:** always-fire from adapter regardless of colocation; override env `GSD_HOOK_SKIP_COLOCATED` for future jj-auto-fire case; ~5 LOC delete of D-10 colocated branch; lowest upstream-rebase conflict risk; depends on hook idempotency as documented requirement

These are **different recommendations from the same source material** — both reading Phase 4 LEARNINGS Open Q1 but with different letter/number labeling. Substantive difference: Path B routes colocation-aware (probe `.git`, then shell file), Path 1 always fires + overrides via env. Both agree Path C (version-probe / wait-for-upstream) is rejected.

**Trade-off:**
- Path B: explicit, matches user mental model, surfaces precedence question, adds colocation-detection branch
- Path 1: simpler, trades complexity for hook idempotency requirement, override env is clean test seam, dup-fire risk benign per Phase 4 LEARNINGS guidance

**Recommended position:** **Surface to discuss-phase; do NOT pre-decide.** Both defensible. Choice rests on whether user prioritizes (a) explicit colocation-routing or (b) simpler code + hook contract. Phase 4 LEARNINGS Open Q1 source (archived `51ee72a3:.planning/phases/04-…/04-LEARNINGS.md`) should be re-read at discuss-phase.

**Classification:** CONTEXT-level (belongs in discuss-phase decision log; shapes milestone narrative).

### Tension 4 — Raw-git lint allowlist framing

- **PROJECT.md:** "single acknowledged raw-git exception collapses to zero" — implies `lint-vcs-no-raw-git.allow.json` entry count drops by one
- **ARCHITECTURE correction:** lint's `SCAN_EXT` regex does NOT cover `.md`; raw-git blocks in `execute-phase.md:537-807` + `quick.md:776-789` are NOT in allowlist — they're exception-by-template-substitution. The 23 production allowlist entries stay. Actual collapse target is `.md` shell-fence blocks. Net allowlist change is +0 or +1 (new `sdk/src/vcs/git/parallel.ts` adapter-internal). Recommends NEW one-shot `scripts/audit-workflow-raw-git.cjs` scanning `.md` shell-fence blocks rather than extending CI lint to `.md`.

**Recommended position:** **PROJECT.md framing needs correction before requirements lock.** Current phrasing risks planner interpreting as "delete from allowlist" when actual target is `.md` cleanup. Two corrections:
1. Reframe bullet: "raw-git in workflow-markdown shell-fence blocks collapses to zero; net change to `lint-vcs-no-raw-git.allow.json` is +0 or +1 (new `sdk/src/vcs/git/parallel.ts` adapter-internal entry)."
2. Add v1.3 deliverable: one-shot audit script `scripts/audit-workflow-raw-git.cjs` (close-gate evidence; not CI-permanent).

**Classification:** CONTEXT-level (PROJECT.md correction before requirements; affects milestone-completeness proof framing — load-bearing per v1.2 retrospective).

### Tension 5 — Locking primitives

- **STACK:** "no new deps, no new primitives needed"
- **PITFALLS:** NEW repo-scoped lock required, distinct sentinel `.jj/repo/gsd-parallel-lock`, distinct contract held across entire dispatch→fanIn window

**Recommended position:** **Reconcile — both right at different levels.** STACK is right that no new npm dep / new module is needed (new lock lives inside existing `sdk/src/vcs/jj/lock.ts` as sibling function `acquireJjRepoLock` next to existing `acquireJjWriteLock`, both consuming `node:fs` primitives already in use). PITFALLS is right that the new lock is architecturally distinct — different sentinel path, different scope, different timeout characteristics. Frame as: "new lock function inside existing module; new sentinel path; new contract." Not a stack addition; an architectural primitive.

**Classification:** SPEC-level (lock-function design belongs in jj-verbs phase plan; primitive's existence flagged in CONTEXT but contract/test plan in roadmap).

## Implications for Roadmap

### Must-honor sequencing constraints (non-negotiable)

1. Types before bodies before backends before tests
2. Backend verbs before CJS consumer migration
3. CJS migration before workflow rewrites
4. `workspace.assert-dispatched-cwd` SDK verb before agent prompt rewrites
5. Workflows + agents updated before config flip
6. CI parallel-path lane before dogfood
7. Dogfood ALWAYS last (Pitfall 10)
8. A3 fix independent parallel track; joins at CI integration

### Suggested 6-phase shape (illustrative; roadmapper picks final)

**Phase 1: New repo-scoped lock + lift jj parallel verbs**
- Rationale: Pitfall 1 lock gates everything; jj-side lift is largest single piece
- Delivers: `acquireJjRepoLock` primitive; `jj/parallel.ts` sidecar; jj backend wiring; types; contract test for cross-workspace squash with `divergent()` revset empty assertion
- Research flag: **Moderate research recommended** — new lock contract; cross-workspace race not previously characterized

**Phase 2: Git parallel verbs + reap classifier extension**
- Rationale: Git lift mechanical; classifier (Pitfall 2) same-PR coupled with jj-side per v1.2 retro
- Delivers: `git/parallel.ts` sidecar with internal serialization (Pitfall 5); git backend wiring; extended `IncompleteWorkEntry.reason` enum; cross-backend contract tests including N=4 surplus-bookmarks==0
- Research flag: Skip — well-documented; only git N-parent octopus needs explicit fixture

**Phase 3: Orchestrator + CJS-bridge + agent rewire**
- Rationale: Once verbs exist, consumer migration is mechanical sweep
- Delivers: `worktree-safety.cjs` body shrunk; `execute-phase.md` + `quick.md` raw-git deleted (~-300 LOC); `gsd-executor.md:412-555` collapsed; `workspace.assert-dispatched-cwd` SDK verb shipped
- Research flag: Skip — pure mechanical lift

**Phase 4: A3 colocated pre-commit fix (parallel track)**
- Rationale: Independent of 1-3; touches different files; joins at CI
- Delivers: chosen fix-path implementation + regression test; hook idempotency audit
- Research flag: **Re-read Phase 4 LEARNINGS Open Q1 source** at planning time

**Phase 5: CI parallel-path lane + lint close-gate**
- Rationale: Validates verb in real CI before flipping default; runs lint sweep + audit-regex completeness
- Delivers: new CI matrix lane; `scripts/audit-workflow-raw-git.cjs`; allowlist `$comment_v1_3_close`; removal sweep recorded
- Research flag: Skip — established patterns

**Phase 6: Default flip + migration + dogfood**
- Rationale: Flip needs pre-flight + migration BEFORE dogfood; dogfood always last (Pitfall 10)
- Delivers: `parallelization: true` default; `gsd-migrate-parallelization` command + brownfield-regression fixture; pre-flight in `parallel.dispatch`; dogfood with synthetic plans on isolated bookmark; metrics; pre-snapshot recovery procedure
- Research flag: **Moderate research** — brownfield migration patterns (precedent `/gsd-migrate-vcs`)

### Research Flags Summary

| Phase | Need | Reason |
|-------|------|--------|
| 1 | Moderate | New repo-scoped lock contract; cross-workspace race probe on jj 0.41 |
| 2 | Skip | Mechanical; git N-parent octopus fixture only |
| 3 | Skip | Established mechanical-sweep pattern |
| 4 (A3) | Re-read source | Phase 4 LEARNINGS Open Q1 (archived commit `51ee72a3`) for path-choice ground truth |
| 5 | Skip | v1.0 CI-04 + v1.2 lint-as-enforcer established |
| 6 | Moderate | Default-flip is contract change; pre-flight + migration test fixture |

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Every primitive verified via live `file:line`; no new deps; negative findings documented |
| Features | HIGH (substrate); MEDIUM (final verb-name, edge-case result-shape) | Existing surfaces shipped + tested; tension on naming, planner-decisions on cancel/conflict-during-fan-in shape |
| Architecture | HIGH | Live `file:line` everywhere; pre-emptive corrections (lint-allowlist framing, ADR-0004 ownership) saved cycles; build-order graph documented |
| Pitfalls | HIGH (codebase-grounded); MEDIUM (Pitfall 3 liveness probe primitive, Pitfall 9 test-flake budget) | Each cites prior incident or jj 0.41 verified behavior |

**Overall confidence:** HIGH on what to build; MEDIUM on three cross-dimension tensions needing decisions before requirements lock.

### Gaps to Address

- **A3 fix-path source re-read** — Phase 4 LEARNINGS Open Q1 (archived `51ee72a3`) at discuss-phase to ground FEATURES vs PITFALLS recommendation disagreement (Tension 3)
- **PROJECT.md "collapses to zero" framing** — needs correction before requirements lock (Tension 4)
- **Verb-namespace shape** — recommend `vcs.workspace.parallel.*` (Tension 1); lock at requirements time
- **Liveness probe primitive** (Pitfall 3) — exact mechanism needs empirical Phase 1/2 probe
- **Phase count** — synthesizer suggests 6 as middle ground; roadmapper picks (Tension 2)

## Sources

### Primary (HIGH — live `file:line` cited)

- `sdk/src/vcs/types.ts:1-579`
- `sdk/src/vcs/backends/git.ts:1-945` + `jj.ts:1045-1390`
- `sdk/src/vcs/jj/octopus.ts:1-324` + `reap.ts:1-198` + `lock.ts:80-152`
- `sdk/src/vcs/exec.ts`
- `sdk/src/vcs/__tests__/jj-octopus.test.ts:41-47` (Pattern A)
- `bin/lib/worktree-safety.cjs:402, 417-516, 559-571`
- `get-shit-done/workflows/execute-phase.md:521-810` + `quick.md:660-810`
- `agents/gsd-executor.md:412-555`
- `scripts/lint-vcs-no-raw-git.cjs:63, 85-91` + `lint-vcs-no-raw-git.allow.json`
- `.planning/PROJECT.md:1-167` + `RETROSPECTIVE.md:1-83` + `MILESTONES.md` (v1.1 Plan 02) + `STATE.md:79-80`

### Secondary (MEDIUM)

- jj-vcs.dev (octopus, working-copies, branches)
- Claude Code worktree-isolation docs
- Bazel/Buck2/Nx/Turbo fan-out + concurrency-cap patterns
- Phase 4 LEARNINGS Open Q1 (archived `51ee72a3`)

### Tertiary (LOW — flagged)

- A3 Path C feasibility (no upstream jj fix; rejected by all relevant researchers)
- Liveness probe primitive choice (Pitfall 3)
- Default-flip release-train shape (Pitfall 8)

### Project memory consulted

`project_no_parallelization_yet`, `project_no_raw_git`, `project_a3_colocated_pre_commit_gap`, `project_squash_model`, `project_unified_revision_model`, `project_test_perf_pain_vitest`, `feedback_baseline_is_correctness_not_perf`, `feedback_solo_dev_no_expires`, `feedback_sdk_commit_jj_safe`, `project_migration_boundary`.
