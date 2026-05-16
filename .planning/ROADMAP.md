# Roadmap: GSD jj-port

**Mode:** standard
**Created:** 2026-05-09
**Last milestone opened:** 2026-05-15 (v1.3 — jj octopus merge for subagents fully functional)

## Overview

Port GSD from a git-only toolkit to a dual-backend (git + jj) toolkit while preserving full upstream feature parity. v1.0 + v1.1 shipped both backends and every structural verb. v1.2 closes the identity-contract gap: the cross-backend `VcsAdapter` exposes ONE concept of "a revision" — `commit_id` on git, `change_id` on jj — and the jj backend never volunteers `commit_id` from any cross-backend verb. v1.3 lifts parallel-subagent dispatch into new cross-backend `vcs.workspace.parallel.*` adapter verbs (both backends), flips `parallelization: true` by default, closes the A3 colocated pre-commit gap inherited from v1.0, and adds a CI parallel-path lane plus a final dogfood phase that exercises the new dispatcher against this very repo on an isolated bookmark.

## Milestones

- ✅ **v1.0 MVP** — Phases 1, 2, 2.1, 3, 03.1, 4, 5, 6 (shipped 2026-05-14) — see `.planning/MILESTONES.md`
- ✅ **v1.1 first upstream sync** — Phase 7 (shipped 2026-05-14) — see `.planning/milestones/v1.1-ROADMAP.md`
- ✅ **v1.2 jujutsu is change-only — never commit id anywhere** — Phase 8 (shipped 2026-05-15) — see `.planning/milestones/v1.2-ROADMAP.md`
- 🚧 **v1.3 jj octopus merge for subagents fully functional** — Phases 9, 10, 11, 12, 13, 14 (opened 2026-05-15)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1, 2, 2.1, 3, 03.1, 4, 5, 6) — SHIPPED 2026-05-14</summary>

- [x] **Phase 1: Adapter Foundation + Git Backend** — VcsAdapter interface, git-only 1:1 backend, parameterized test harness, no-raw-git lint guard. (5/5 plans, completed 2026-05-09)
- [x] **Phase 2: Bulk Call-Site Migration (Still Git-Only)** — Every `execSync('git …')` in `sdk/src/query/*.ts` and `bin/lib/*.cjs` migrated to the adapter. (12/12 plans)
- [x] **Phase 2.1 (INSERTED): VCS Abstraction Audit — Drop Git-Only Concepts** — Reshape cross-backend surface; `expr.commit` → `expr.rev`, `currentBranch` → `currentBookmarks`, gitDir/gitCommonDir → `gitOnly` namespace. (9/9 plans)
- [x] **Phase 3: jj Backend Core — Squash, Refs, Conflict** — `sdk/src/vcs/backends/jj.ts` implementing every adapter contract verb (jj-colocated CI lane as allow-failure). (7/7 plans, completed 2026-05-12)
- [x] **Phase 03.1 (INSERTED): make tests run faster** — vitest parallelism baseline + L1/L2 levers + final ratio recorded. (5/4 plans)
- [x] **Phase 4: Workspaces + Octopus Structure + Hooks** — `vcs.workspace.{add,forget,prune,reap}` bodies + `acquireJjWriteLock` RAII + lazy octopus helpers + pre-commit/pre-push hook wiring + SDK `hooks.fire` bridge. (7/7 plans, completed 2026-05-13). Known gap: A3 colocated pre-commit (closed in v1.3 Phase 12).
- [x] **Phase 5: Command Translations + Brownfield Validation + CI Hardening** — Every upstream command verified end-to-end on jj; workflow markdown and agent prompts rewritten; CI matrix graduates jj-backend to required-blocking. (8/5 original + 3 gap-closure plans)
- [x] **Phase 6: Brownfield jj Migration** — Sticky `vcs.adapter` flip + `.planning/` SHA→change_id rewriter + `/gsd-migrate-vcs` command + dogfood validation. (4/4 plans)

</details>

<details>
<summary>✅ v1.1 first upstream sync (Phase 7) — SHIPPED 2026-05-14</summary>

- [x] **Phase 7: Reconcile fork capabilities with upstream** — 8 new VcsAdapter verbs (VCS-08..VCS-15 — currentBookmarksIn, mergeBase, diff{diffFilter}, status{cwd}, workspace.merge with atomic main-advance, workspace.remove, bookmarks.delete{force}, readBlob); wave-cleanup executor wired through them; raw-git workflow .md fallbacks deleted; github-release-notes.cjs migrated to cross-backend; strict-green test triage on both backends. (5/5 plans). Full details: `.planning/milestones/v1.1-ROADMAP.md`.

</details>

<details>
<summary>✅ v1.2 jujutsu is change-only — never commit id anywhere (Phase 8) — SHIPPED 2026-05-15</summary>

- [x] **Phase 8: Unified Revision Model — Audit → Test-Prep → Flip → Lint Guard → Close-Gate** — Audit (101 sites classified via closed verdict enum) + `toBeIdOf` vitest matcher + FLIP-01..04 surface flip (7 jj.ts template flips + 3 NDJSON parser flips + `LogEntry.hash`/`CommitResult.hash` hard-renamed to `.id`, no aliases) + `scripts/lint-vcs-no-commit-id.cjs` CI-blocking (1032 files / 0 violations — FLIP completeness proof) + PROMPT-05 invariant verified (zero id-reason `vcs.kind` branches remain) + LINT-03 closes empty (no boundary-I/O accessor exists, SEED-001 inversion holds) + MIGR-06 close-gate rewriter pass. (3/3 plans, completed 2026-05-15). Full details: `.planning/milestones/v1.2-ROADMAP.md`.

</details>

<details open>
<summary>🚧 v1.3 jj octopus merge for subagents fully functional (Phases 9, 10, 11, 12, 13, 14) — IN PROGRESS</summary>

- [ ] **Phase 9: jj-side parallel verbs** — One-line description: Define `VcsWorkspaceParallel` types, lift `octopus.ts` + `reap.ts` behind the new `vcs.workspace.parallel.*` jj-side composition layer (`sdk/src/vcs/jj/parallel.ts`), extend the reap classifier with `'merge-in-tree-conflict'`, wire into `backends/jj.ts`, and validate the octopus-topology non-divergence assertion. (PARALLEL-03 + PARALLEL-04 dropped at discuss-phase 2026-05-15 per `09-CONTEXT.md` D-01/D-02 — no liveness probe, no `acquireJjRepoLock`.)
- [ ] **Phase 10: git-side parallel verbs + classifier extension** — Lift the workflow-markdown raw-git worktree dispatch+merge+cleanup body into a new `sdk/src/vcs/git/parallel.ts` adapter-internal sidecar; ship the cross-backend `FanInResult` contract (jj+git same-PR coupling), extend the manifest schema, validate git N-parent octopus.
- [ ] **Phase 11: Orchestrator + agent rewire + workspace.assert-dispatched-cwd** — Delete the raw-git blocks in `execute-phase.md` and `quick.md`, ship the `workspace.assert-dispatched-cwd` SDK verb, collapse the worktree-aware blocks in `gsd-executor.md`, rename `worktree-path-safety.md` to `dispatch-cwd-safety.md`, wire `maxConcurrency` from workflow call sites.
- [ ] **Phase 12: A3 colocated pre-commit fix (parallel track)** — Closes the gap inherited from v1.0 Phase 4. Picks ONE of three documented fix paths at discuss-phase by re-reading Phase 4 LEARNINGS Open Q1 (archived `51ee72a3`); ships fix + regression test on a colocated jj fixture.
- [ ] **Phase 13: CI parallel-path lane + lint close-gate** — New CI matrix lane `parallel-e2e` running synthetic 2-plan phases on both backends (required-blocking on jj-colocated); one-shot `scripts/audit-workflow-raw-git.cjs` close-gate evidence; `lint-vcs-no-raw-git.allow.json` diff recorded (+0 or +1).
- [ ] **Phase 14: Default flip + dogfood validation** — Install template default flips `parallelization: false` → `true`; `parallel.dispatch` pre-flight refuses explicit `false`; dogfood phase spins up 2-3 synthetic plans on an isolated bookmark and records metrics in `.planning/intel/v1.3-dogfood-metrics.md`.

</details>

## Phase Details

### Phase 9: jj-side parallel verbs

**Goal**: jj backend exposes the new `vcs.workspace.parallel.*` verb surface (composed from already-shipped `octopus.ts` + `reap.ts` + `workspace.merge` primitives) and the reap classifier extends to surface in-tree-conflicts. PARALLEL-03 (liveness) and PARALLEL-04 (repo-scoped lock) are dropped per `09-CONTEXT.md` D-01/D-02 — the orchestrator-awaits-`Agent()` invariant makes liveness moot in production, and octopus topology gives each subagent a distinct change so no shared-ancestor contention exists.
**Depends on**: Phase 8 (v1.2 unified revision model)
**Requirements**: PARALLEL-01 (jj-side), PARALLEL-02 (jj-side), PARALLEL-05, VCS-16, VCS-17, VCS-19, TEST-13 (jj contract tests), TEST-14
**Success Criteria** (what must be TRUE):

  1. `gsd-sdk query workspace.parallel.dispatch` on a jj fixture creates N workspaces via `octopus.createPhaseStructure` + N× `createSubagentSlot`.
  2. `gsd-sdk query workspace.parallel.fan-in` on a jj fixture produces a single N-parent octopus merge + batched bookmark delete in one operation; `surplusBookmarks` is empty on both N=2 and N=4 contract scenarios.
  3. New `VcsWorkspaceParallel` interface compiles + dist-cjs emits both new verbs; `ParallelDispatchHandle.workspaces[].baseRev` JSDoc states change_id stability semantics across `jj rebase`. `ParallelDispatchHandle` is frozen pure JSON (no closures/methods/Symbols).
  4. `IncompleteWorkEntry.reason` enum widens from 1 → 2 values in `sdk/src/vcs/jj/reap.ts` (`'crashed-with-uncommitted-work'` existing + `'merge-in-tree-conflict'` new); jj-side conflict probe via `vcs.refs.conflicts()` revset wired into `performJjReap`. (Phase 10 adds the git-side producer.)
  5. `WAVE_WORKTREE_MANIFEST` carries `plan_id`, `agent_id`, `backend` fields; existing v1.1 consumers (worktree-safety.cjs) read it without behavior change.
  6. TEST-14 topology assertion: `jj log -r 'divergent()' --no-graph` empty post-fanIn for N ∈ {2, 3, 4} — proves the octopus structure produces non-divergent change_ids (reframed from lock-effectiveness test per D-03).

**Plans**: 5 plans

  - [x] 09.01-PLAN.md — Cross-backend type surface (VcsWorkspaceParallel + Parallel* types; IncompleteWorkEntry.reason union tightening; VcsWorkspace.parallel field) [Wave 1]
  - [x] 09.02-PLAN.md — Reap classifier extension + conflict-paths sidecar extraction + incomplete-work parse-time validation [Wave 1]
  - [x] 09.03-PLAN.md — sdk/src/vcs/jj/parallel.ts composition layer (performJjParallelDispatch + performJjParallelFanIn) + JjVcsAdapter wire-in [Wave 2]
  - [x] 09.04-PLAN.md — GitVcsAdapter throwing stub (workspace.parallel.{dispatch,fanIn} throw VcsNotImplementedError until Phase 10) [Wave 2]
  - [x] 09.05-PLAN.md — Contract tests cmd-parallel-jj.test.ts (TEST-13 N=2/3/4 scenarios + TEST-14 divergent() topology assertion) [Wave 3]

### Phase 10: git-side parallel verbs + classifier extension

**Goal**: git backend exposes the same `vcs.workspace.parallel.*` verb surface; the cross-backend `FanInResult` shape ships uniform on both backends; the raw-git worktree dispatch+merge+cleanup body lives in a single adapter-internal TS file.
**Depends on**: Phase 9 (jj-side verb contracts + types must ship first; same-PR coupling on `FanInResult` shape per v1.2 retro precedent — git-side `parallel.fanIn` MUST land alongside the jj-side contract this phase finalizes)
**Requirements**: PARALLEL-01 (git-side), PARALLEL-02 (git-side), VCS-18, TEST-13 (git contract tests), TEST-15, TEST-16
**Success Criteria** (what must be TRUE):

  1. `sdk/src/vcs/git/parallel.ts` exists as a single adapter-internal sidecar; `backends/git.ts` wires it via `workspace = Object.freeze({...parallel: …})`; internal `git worktree add` serialization prevents `.git/config.lock` race on N=8 dispatch (manifest length == 8 in 20 sequential runs).
  2. Cross-backend `FanInResult` shape `{merged, conflicted, conflictedPaths, incompleteQueued, failedReaped, surplusBookmarks}` is identical on both backends; `conflicted: boolean` distinguishes in-tree-conflict-success from crash.
  3. Per-branch 2-parent `git merge --no-ff <agentBookmark>` loop verified on test-fixture across CI git versions; halt-on-conflict + re-call via `merge-base --is-ancestor` skip; `git worktree remove --force` is forbidden in the cross-backend path (non-force only).
  4. `IncompleteWorkEntry.reason` enum (widened to 2 values in Phase 9) gets its git-side producer landed here: `git merge` exit code + `git diff --name-only --diff-filter=U` populates `'merge-in-tree-conflict'` correctly. (`'partial-wave-live-workspace'` is NOT added — PARALLEL-03 dropped at Phase 9 discuss.)
  5. New `parallel-*` test files use Pattern B random-prefix `mkdtemp`; vitest skip-count baseline unchanged (`scripts/check-skip-count.cjs` green); no `retry: N` added to vitest config.

**Plans**: 6 plans (4 original + 2 gap-closure)
Plans:
**Wave 1**

- [x] 10-01-PLAN.md — Cascade-amendment doc edits (ROADMAP SC3 + REQUIREMENTS PARALLEL-02 + TEST-15) per CONTEXT D-09/D-10/D-11
- [x] 10-02-PLAN.md — Ship sdk/src/vcs/git/parallel.ts sidecar (performGitParallelDispatch + performGitParallelFanIn with halt-on-conflict + re-callable loop + crash classifier)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 10-03-PLAN.md — Wire backends/git.ts to the sidecar (replace Phase 9 throwing stub) + single +1 allowlist entry

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 10-04-PLAN.md — Author cmd-parallel-git.test.ts contract tests (TEST-13 N=2/3/4 + conflict + crash + idempotency re-call)

**Wave 4** *(gap closure — blocked on Wave 3 + initial verification)*

- [x] 10-05-PLAN.md — Close SC2 + SC3 gaps: STEP 1 crashed-agent gate (CR-01) + STEP 3 handle-scoped surplus sweep (CR-02) in sdk/src/vcs/git/parallel.ts; +2 regression tests in cmd-parallel-git.test.ts

**Wave 5** *(gap closure — blocked on Wave 4 completion; same-file dep)*

- [x] 10-06-PLAN.md — Close SC5 lint gap: swap hex regex `/^[0-9a-f]{12}$/` at cmd-parallel-git.test.ts:355 for `toBeIdOf('git', { allowShort: true })` custom matcher; unblocks lint-vcs-no-commit-id CI gate

### Phase 11: Orchestrator + agent rewire + workspace.assert-dispatched-cwd

**Goal**: Workflows + agents call only the new cross-backend `vcs.workspace.parallel.*` verbs; the ~440 LOC of raw-git block in `execute-phase.md` (~290) and `quick.md` (~150) is deleted; subagent prompts never inspect backend kind.
**Depends on**: Phase 10 (both backend verb bodies must ship before consumer migration)
**Requirements**: VCS-20, PROMPT-06, PROMPT-07, PROMPT-08, PROMPT-09, PARALLEL-06
**Success Criteria** (what must be TRUE):

  1. `gsd-sdk query workspace.assert-dispatched-cwd --cwd .` returns ok/fail backend-opaquely; `agents/gsd-executor.md` lines 412-555 (4 worktree-aware blocks) collapse to one call to this verb.
  2. `get-shit-done/workflows/execute-phase.md` lines 521-810 are deleted (raw-git block); replaced with one `workspace.parallel.dispatch` + one `workspace.parallel.fan-in` call. Same shape applied to `quick.md` lines 660-810.
  3. `get-shit-done/references/worktree-path-safety.md` renamed to `dispatch-cwd-safety.md`; body rewritten to be backend-agnostic; all referrers updated.
  4. `bin/lib/worktree-safety.cjs::executeWorktreeWaveCleanupPlan` body shrinks to a single delegation through the new cross-backend verb; ADR-0004 ownership preserved; public export signature unchanged.
  5. `dispatch({ plan, maxConcurrency })` input field honored end-to-end from workflow call sites (default `undefined` → runtime's natural cap).

**Plans**: TBD

### Phase 12: A3 colocated pre-commit fix (parallel track)

**Goal**: jj 0.41 colocated `jj squash` reliably fires `.git/hooks/pre-commit`. The gap inherited from v1.0 Phase 4 closes. Independent parallel track joining at CI integration (Phase 13).
**Depends on**: Nothing in v1.3 directly — touches `sdk/src/vcs/backends/jj.ts::commit` (or a new `sdk/src/vcs/jj/pre-commit-bridge.ts` sidecar), NOT the new parallel-verb surface. Independent of Phases 9/10/11. Joins at Phase 13 CI integration where the parallel-path lane validates the fix on a colocated fixture.
**Requirements**: HOOK-06, HOOK-07
**Success Criteria** (what must be TRUE):

  1. **CONTEXT-level decision recorded at discuss-phase**: ONE of Path A ("remove D-10 no-op"), Path B ("explicit shell of `.git/hooks/pre-commit` in colocated mode"), or Path 1 ("always-fire + `GSD_HOOK_SKIP_COLOCATED` env opt-out") is chosen after re-reading Phase 4 LEARNINGS Open Q1 (archived `51ee72a3`). Path C (version-probe) is rejected. CONTEXT.md records the rationale.
  2. On a colocated jj fixture, installing a sentinel `.git/hooks/pre-commit` and running `vcs.commit` (or direct `jj squash`) fires the hook exactly once (or zero times if `GSD_HOOK_SKIP_COLOCATED` opt-out applies and the chosen path uses it).
  3. Regression test at `sdk/src/vcs/__tests__/jj-colocated-hooks.test.ts` (or extension of existing `jj-hooks.test.ts`) is green on jj-colocated CI lane.
  4. If chosen path relies on hook idempotency (Path 1 variant), an audit of repo hooks for non-idempotent operations is recorded as Phase 12 close-gate evidence.
  5. The public `CommitInput`/`CommitResult` adapter surface is unchanged (fix lives in the jj backend body, not as an interface change).

**Plans**: TBD

### Phase 13: CI parallel-path lane + lint close-gate

**Goal**: A new CI matrix lane runs synthetic parallel phases end-to-end on both backends and is required-blocking on jj-colocated; the v1.3 "raw-git in workflow markdown collapses to zero" architectural proof is recorded as one-shot audit evidence (not promoted to permanent CI).
**Depends on**: Phase 11 (workflows + agents updated) + Phase 12 (A3 fix joins here)
**Requirements**: CI-05, CI-06, LINT-04, LINT-05
**Success Criteria** (what must be TRUE):

  1. New CI matrix lane `parallel-e2e` runs a synthetic 2-plan phase end-to-end on both backends; required-blocking on jj-colocated, optional on git-only.
  2. `scripts/audit-workflow-raw-git.cjs` ships and on first green run reports zero raw-git hits in `*.md` shell-fence blocks under `get-shit-done/workflows/`, `get-shit-done/references/`, and `agents/`; documented as one-shot (NOT added to CI pretest).
  3. `parallel-e2e` lane runs LINT-04 audit and fails if the zero-hits invariant breaks (acts as milestone-completeness regression guard).
  4. `lint-vcs-no-raw-git.allow.json` net diff is +0 or +1 (the optional addition is the new `sdk/src/vcs/git/parallel.ts` adapter-internal entry with reason "git backend `parallel.*` verb body — adapter-internal substrate, not workflow-facing"). The 23 existing production entries are NOT touched. Diff recorded in milestone close commit.
  5. A3 fix from Phase 12 is exercised on the jj-colocated `parallel-e2e` lane (hook fires correctly during a parallel-dispatched phase's `jj squash` calls).

**Plans**: TBD

### Phase 14: Default flip + dogfood validation

**Goal**: Install template default flips `parallelization: true`; the dogfood phase exercises the new dispatcher against this very repo on an isolated bookmark with synthetic plans, records metrics, and proves blast-radius is bounded (Pitfall 10).
**Depends on**: Phase 13 (CI parallel-path lane green on both backends — Pitfall 10 mandates dogfood is LAST)
**Requirements**: CONFIG-01, CONFIG-02, DOGFOOD-01, DOGFOOD-02
**Success Criteria** (what must be TRUE):

  1. Install template `get-shit-done/templates/config.json` (or wherever the installer reads from) sets `parallelization: true` for greenfield repos; existing repos with explicit `parallelization: false` keep `false` (config-wins-over-default; no migration command needed because subagent workspaces are ephemeral).
  2. `vcs.workspace.parallel.dispatch` pre-flight reads the `parallelization` config and refuses with a clear error message if explicitly `false` (no silent-no-op footgun).
  3. Dogfood run: 2-3 synthetic plans dispatched on an isolated bookmark (NOT main) via the new dispatcher; clean fan-in confirmed (`jj log -r 'divergent()' --no-graph` empty); agent bookmarks cleaned; manifest schema correct on both jj and git fixtures.
  4. Pre-snapshot via `jj op log -n 200 > pre.oplog` + `.planning/` tarball captured BEFORE the dogfood run; recovery procedure documented in the dogfood phase's CONTEXT.md.
  5. Metrics recorded to `.planning/intel/v1.3-dogfood-metrics.md`: dispatch time, fan-in time, conflict rate. (Partial-wave incidence and lock-wait durations dropped — PARALLEL-03/04 dropped at Phase 9 discuss.) Establishes baseline for v1.4+ regression comparison.

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 2.1 → 3 → 03.1 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14

Note: Phase 12 (A3 fix) is an independent parallel track and may execute concurrently with Phases 9/10/11; the dependency ordering above is the canonical record sequence, not a serial execution constraint for Phase 12.

| Milestone | Phases | Plans | Status   | Shipped    |
|-----------|--------|-------|----------|------------|
| v1.0 MVP  | 8      | 53/56 | Complete | 2026-05-14 |
| v1.1 first upstream sync | 1 | 5/5 | Complete | 2026-05-14 |
| v1.2 jujutsu is change-only — never commit id anywhere | 1 | 3/3 | Complete | 2026-05-15 |
| v1.3 jj octopus merge for subagents fully functional | 6 | 0/5 | Planning | — |

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 9. jj-side parallel verbs | 5/5 | Complete   | 2026-05-15 |
| 10. git-side parallel verbs + classifier extension | 6/6 | Complete   | 2026-05-16 |
| 11. Orchestrator + agent rewire + workspace.assert-dispatched-cwd | 0/0 | Not started | - |
| 12. A3 colocated pre-commit fix (parallel track) | 0/0 | Not started | - |
| 13. CI parallel-path lane + lint close-gate | 0/0 | Not started | - |
| 14. Default flip + dogfood validation | 0/0 | Not started | - |

## Next

v1.3 opened 2026-05-15. Phase 9 ready for `/gsd-plan-phase 9`.

---
*Last updated: 2026-05-15 — Phase 9 discuss-phase dropped PARALLEL-03 (liveness probe) and PARALLEL-04 (acquireJjRepoLock) at the premise level; coverage now 27/27 (PARALLEL-01/02/05/06, VCS-16..20, PROMPT-06..09, LINT-04..05, HOOK-06..07, CI-05..06, TEST-13..16, CONFIG-01..02, DOGFOOD-01..02). Phase 9 renamed "+ repo-scoped lock" → "jj-side parallel verbs"; SC count 5→6 (TEST-14 split out as explicit SC6 topology assertion). Phase 10 enum SC reframed (1→2 not 1→3). v1.0 + v1.1 + v1.2 archived under collapsed `<details>`.*
