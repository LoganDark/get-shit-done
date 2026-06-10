# Roadmap: GSD jj-port

**Mode:** standard
**Created:** 2026-05-09
**Last milestone shipped:** 2026-05-24 (v1.3 — jj octopus merge for subagents fully functional)

## Overview

Port GSD from a git-only toolkit to a dual-backend (git + jj) toolkit while preserving full upstream feature parity. v1.0 + v1.1 shipped both backends and every structural verb. v1.2 closes the identity-contract gap: the cross-backend `VcsAdapter` exposes ONE concept of "a revision" — `commit_id` on git, `change_id` on jj — and the jj backend never volunteers `commit_id` from any cross-backend verb. v1.3 lifts parallel-subagent dispatch into new cross-backend `vcs.workspace.parallel.*` adapter verbs (both backends), flips `parallelization: true` by default, closes the A3 colocated pre-commit gap inherited from v1.0, and adds a CI parallel-path lane plus a final dogfood phase that exercises the new dispatcher against this very repo on an isolated bookmark. **v1.4 drives every outstanding fork-internal todo, deferred item, and known drift to zero so the next upstream rebase lands on a clean, fully-tested, fully-documented baseline.** Upstream pull itself is out of scope for v1.4 — operator performs the pull as a separate action post-v1.4.

## Milestones

- ✅ **v1.0 MVP** — Phases 1, 2, 2.1, 3, 03.1, 4, 5, 6 (shipped 2026-05-14) — see `.planning/MILESTONES.md`
- ✅ **v1.1 first upstream sync** — Phase 7 (shipped 2026-05-14) — see `.planning/milestones/v1.1-ROADMAP.md`
- ✅ **v1.2 jujutsu is change-only — never commit id anywhere** — Phase 8 (shipped 2026-05-15) — see `.planning/milestones/v1.2-ROADMAP.md`
- ✅ **v1.3 jj octopus merge for subagents fully functional** — Phases 9-14 (shipped 2026-05-24) — see `.planning/milestones/v1.3-ROADMAP.md`
- ⏳ **v1.4 Clean, consistent state for next upstream pull** — Phase 14.1 + Phases 15-18 (planning) — see Phase Details below

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

<details>
<summary>✅ v1.3 jj octopus merge for subagents fully functional (Phases 9-14) — SHIPPED 2026-05-24</summary>

- [x] **Phase 9: jj-side parallel verbs** — Define `VcsWorkspaceParallel` types, lift `octopus.ts` + `reap.ts` behind the new `vcs.workspace.parallel.*` jj-side composition layer (`sdk/src/vcs/jj/parallel.ts`), extend the reap classifier with `'merge-in-tree-conflict'`, wire into `backends/jj.ts`, and validate the octopus-topology non-divergence assertion. (5/5 plans, completed 2026-05-15)
- [x] **Phase 10: git-side parallel verbs + classifier extension** — Lift the workflow-markdown raw-git worktree dispatch+merge+cleanup body into a new `sdk/src/vcs/git/parallel.ts` adapter-internal sidecar; ship the cross-backend `FanInResult` contract (jj+git same-PR coupling), extend the manifest schema, validate git N-parent octopus. (6/6 plans, completed 2026-05-16)
- [x] **Phase 11: Orchestrator + agent rewire + workspace.assert-dispatched-cwd** — Delete the raw-git blocks in `execute-phase.md` and `quick.md`, ship the `workspace.assert-dispatched-cwd` SDK verb, collapse the worktree-aware blocks in `gsd-executor.md`, rename `worktree-path-safety.md` to `dispatch-cwd-safety.md`, wire `maxConcurrency` from workflow call sites. (11/11 plans, completed 2026-05-16)
- [x] **Phase 12: A3 colocated pre-commit fix (parallel track)** — Closes the gap inherited from v1.0 Phase 4. Path 1 chosen at discuss-phase by re-reading Phase 4 LEARNINGS Open Q1 (archived `51ee72a3`); jj backend's `commit()` always fires `.githooks/<stage>` in colocated mode with `GSD_HOOK_SKIP_COLOCATED` opt-out; HOOK-07 fires-exactly-once regression test shipped. (3/3 plans, completed 2026-05-21)
- [x] **Phase 13: CI parallel-path lane + lint close-gate** — New CI matrix lane `parallel-e2e` running synthetic 2-plan phases on both backends (required-blocking on jj-colocated); one-shot `scripts/audit-workflow-raw-git.cjs` close-gate evidence; `lint-vcs-no-raw-git.allow.json` diff recorded (+1). CI-06 gap (test discovery non-recursive) closed inline at v1.3 close 2026-05-24. (4/4 plans, completed 2026-05-22)
- [x] **Phase 14: Default flip + dogfood validation** — Install template default flips `parallelization: false` → `true`; CONFIG-02 `parallelization_disabled` envelope at the CLI bridge with strict-equal-`false` brownfield safety; real dogfood ran end-to-end on this repo on isolated bookmark `gsd/phase-14-dogfood` (jj-cell + git-cell both 0 conflicts; main bookmark unchanged per Pitfall 10); recovery anchor captured. (5/5 plans, completed 2026-05-24)

</details>

<details>
<summary>⏳ v1.4 Clean, consistent state for next upstream pull (Phase 14.1 + Phases 15-18) — PLANNING</summary>

- [x] **Phase 14.1: Drop mandatory bookmark on parallel dispatch + fan-in (emergency)** — Replace required `mainBookmark: string` with optional `mainBookmarks?: readonly string[]` (default `[]` → no advance) on `ParallelDispatchOpts` / `ParallelDispatchHandle`. jj fan-in skips the `jj bookmark set` step when list is empty; iterates with all-or-nothing validation when non-empty. git fan-in (already detached-HEAD-safe mechanically — `merge --no-ff` operates on current HEAD whether detached or not) drops the dead-weight required field; advances via `git update-ref refs/heads/<name> HEAD` per provided name when non-empty. Workflow `workflows/execute-phase.md` drops the `current-branch` FATAL preflight. Operating on `@` (jj) / current HEAD (git, including detached) becomes a first-class working state. Requirements: PARALLEL-08. (1 plan) (completed 2026-05-24)
- [ ] **Phase 15: Adapter surface extensions + rename** — Hard-rename `rootCommits` → `rootRevisions` across 13+ call sites (with pre-rename JSON sidecar audit per Pitfall 3); add `vcs.refs.idAlphabet` introspection (`'0-9a-f'` git, `'k-z'` jj); add `vcs.refs.matchPrefix(id, prefix): boolean` alphabet-aware short-prefix matching (throws on wrong-alphabet per Pitfall 6); add `vcs.workspace.parallel.cancel(handle): CancelResult` synchronous teardown of materialized workspaces (no signal handling — STACK-lens semantics per Pitfall 5; extracts `cleanupSubagentWorkspaces` helper as Wave 1). Sequential plans within phase (file-overlap on `types.ts`). Requirements: NAMING-01, VCS-21, VCS-22, PARALLEL-07. (4 plans)
- [x] **Phase 16: Workflow + invariant tooling** — Ship `scripts/lint-vcs-parallel-call-presence.cjs` (content-driven detection of `workspace.parallel.dispatch` / `workspace.parallel.fan-in` literals in shell fences; default-deny + per-entry `{path|glob, reason, owner}` allowlist; CI-blocking in `parallel-e2e.yml`, NOT pretest per audit-workflow-raw-git.cjs D-07 precedent); reap orphan `.claude/jj-workspaces/phase-*-subagent-*` FS dirs on `vcs.workspace.parallel.fan-in` clean-path success branch (preserves W3 (a) inspection contract on conflicted branch) AND via `scripts/dogfood-restore.sh` post-restore step (consumes `cleanupSubagentWorkspaces` helper extracted in Phase 15). Parallel-safe within phase (file-disjoint). Requirements: LINT-06, CLEANUP-02. (2 plans) (completed 2026-05-25)
- [x] **Phase 17: Drift control + reconciliation** — Wave 1 = ARCHITECTURE.md prose-count fixes across en + 3 translations (44→68 commands, 46→89 workflows, 16→33 agents, 17→60 lib modules, ~3000→10,978 install.js LOC) BEFORE drift tests RED per Pitfall 4; Wave 2 = `tests/architecture-counts.test.cjs` + `tests/command-count-sync.test.cjs` (`node:test` framework, verbatim copy of `tests/inventory-counts.test.cjs` shape, live-scan not snapshot); Wave 3 = remaining docs-update themes 1-7+9 (per-theme triage per Pitfall 12 — ADR supersession notes for theme 3, change-id-anchored references for theme 5); Wave 4 = PROJECT.md `### Validated` reconciliation LAST per IP-4 (so v1.4's own REQ-IDs are in truth source; two-pass approach per Pitfall 8 — machine-generated `.planning/intel/project-validated-truth.md` + human-edited narrative). Requirements: DOCS-08, DRIFT-01, DRIFT-02, DOCS-01..07, DOCS-09, PROJECT-01. (4 plans) (completed 2026-05-25)
- [ ] **Phase 19: Upstream merge conflict resolution + fork-abstraction audit** — Post-v1.4 operator-initiated upstream pull (out of v1.4 scope per Overview, tracked here for continuity). Resolve all ~76 conflicted files in merge change `vpzlrrlv` (upstream `03764dbc` ← fork `c7bd6bee`) to 0 conflicts, **adopting upstream's restructure** (SDK retirement, `gsd-core/`, `src/*.cts`) to keep future pulls cheap, while porting the fork's VCS abstraction (jj support: VcsAdapter, unified revision model, `workspace.parallel.*`, `.githooks` bridge) into the new upstream architecture and migrating upstream's raw-git call sites through it. See Phase Details. (plans TBD)
- [ ] **Phase 18: Tactical cleanup + test-flake** — Apply `assert_clean_wc` final-gate + commit-adjacency pattern to `transition.md:166` HIGH-RISK site FIRST among workflow waves per Pitfall 2; per-WR commits for Phase 14 code-review WR-01..05 hardening per Pitfall 10 (project-root assertion in dogfood-restore.sh, tar-overlay decision, JSON.parse Array.isArray guard, --max-concurrency NaN guard, CONFIG-02 test tmpDir cleanup); narrow-scope fix for `jj-reap.test.ts > inclusion-filter` 5s timeout flake per Pitfall 9 (≤5 LOC, ≤1 file, vitest.config.ts UNTOUCHED, check-skip-count green). Parallel-safe within phase (each touches different files). Requirements: CLEANUP-01, CLEANUP-03..07, TEST-17. (3 plans)

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

**Plans**: 11 plans (6 original + 3 gap-closure run 1 from 2026-05-16 + 2 gap-closure run 2 from 2026-05-16 re-verify)

  - [x] 11-01-PLAN.md — Retire jj-side bookmark plumbing per D-02 + flip cmd-parallel-jj.test.ts assertions [Wave 1]
  - [x] 11-02-PLAN.md — Ship workspace.assert-dispatched-cwd + workspace.parallel.dispatch + workspace.parallel.fan-in SDK CLI bridges (3 handlers + catalog/manifest registration) [Wave 2]
  - [x] 11-03-PLAN.md — Shrink worktree-safety.cjs::executeWorktreeWaveCleanupPlan to fanIn delegation; remove cmdWorktreeCleanupWave alias [Wave 2]
  - [x] 11-04-PLAN.md — Collapse gsd-executor.md worktree-aware guards to assert-dispatched-cwd call; rename worktree-path-safety.md → dispatch-cwd-safety.md [Wave 3]
  - [x] 11-05-PLAN.md — execute-phase.md raw-git delete + parallel-verb rewire (preserve sequential Agent() + orchestrator rule + stall surveillance) [Wave 3]
  - [x] 11-06-PLAN.md — quick.md raw-git delete + parallel-verb rewire (USE_WORKTREES gating, N=1 trivial) [Wave 3]
  - [x] 11-07-PLAN.md — Gap closure A: fix workspace-assert-dispatched-cwd.ts jj-side correctness (CR-01) + agent diagnostic dump (CR-04) + dispatch-cwd-safety.md doc cleanup (WR-03); flips VCS-20 + PROMPT-08 BLOCKED → SATISFIED [Wave 4]
  - [x] 11-08-PLAN.md — Gap closure B: fix quick.md dispatch shape + numeric --phase + HANDLE_OK guard (CR-02) + EXPECTED_BRANCH empty/HEAD pre-check in both quick.md and execute-phase.md (CR-03); flips PROMPT-07 BLOCKED → SATISFIED + PARALLEL-06 PARTIAL → SATISFIED [Wave 4]
  - [x] 11-09-PLAN.md — Gap closure C: retire orphaned WAVE_WORKTREE_MANIFEST write in jj/parallel.ts (WR-01) + fix worktree-safety.cjs ok-derivation (WR-02) + document workspace.* verbs in gsd-tools.cjs --help (IN-02) + uniformly deprecation-guard worktree case (WR-04); architectural completion of D-01 invariant [Wave 4]
  - [x] 11-10-PLAN.md — Gap closure D (run 2): execute-phase.md dispatch line — construct WAVE_WORKTREE_PLANS_JSON via jq pipeline (REVIEW CR-01) + replace literal --phase "{phase_number}" placeholder with bash variable ${PHASE_NUMBER} (REVIEW CR-02) + extend tests/quick-md-parallel-dispatch.test.cjs EXEC carry-over with plan-shape + numeric-phase assertions (REVIEW IN-01); flips PROMPT-06 BLOCKED → SATISFIED [Wave 5]
  - [x] 11-11-PLAN.md — Gap closure E (run 2): retire raw git rev-parse from agents/gsd-executor.md:431 (REVIEW CR-03 — violates project_no_raw_git) by extending workspace.assert-dispatched-cwd envelope with primaryWorkspacePath + agent prompt reads via jq + new class-wide regression test tests/agent-prompts-no-raw-git.test.cjs; flips PROMPT-08 BLOCKED → SATISFIED [Wave 5]

### Phase 12: A3 colocated pre-commit fix (parallel track)

**Goal**: jj 0.41 colocated `jj squash` reliably fires `.git/hooks/pre-commit`. The gap inherited from v1.0 Phase 4 closes. Independent parallel track joining at CI integration (Phase 13).
**Depends on**: Nothing in v1.3 directly — touches `sdk/src/vcs/backends/jj.ts::commit` (or a new `sdk/src/vcs/jj/pre-commit-bridge.ts` sidecar), NOT the new parallel-verb surface. Independent of Phases 9/10/11. Joins at Phase 13 CI integration where the parallel-path lane validates the fix on a colocated fixture.
**Requirements**: HOOK-06, HOOK-07
**Success Criteria** (what must be TRUE):

  1. **CONTEXT-level decision recorded at discuss-phase**: ONE of Path A ("remove D-10 no-op"), Path B ("explicit shell of `.git/hooks/pre-commit` in colocated mode"), or Path 1 ("always-fire + `GSD_HOOK_SKIP_COLOCATED` env opt-out") is chosen after re-reading Phase 4 LEARNINGS Open Q1 (archived `51ee72a3`). Path C (version-probe) is rejected. CONTEXT.md records the rationale.
  2. On a colocated jj fixture, installing a sentinel `.githooks/pre-commit` and running `vcs.commit` (or direct `jj squash`) fires the hook exactly once (or zero times if `GSD_HOOK_SKIP_COLOCATED` opt-out applies and the chosen path uses it).
  3. Regression test extends the existing `jj-colocated` describe block at `sdk/src/vcs/__tests__/jj-hooks.test.ts:167` (no new test file) and is green on the jj-colocated CI lane.
  4. If chosen path relies on hook idempotency (Path 1 variant), an audit of repo hooks for non-idempotent operations is recorded as Phase 12 close-gate evidence.
  5. The public `CommitInput`/`CommitResult` adapter surface is unchanged (fix lives in the jj backend body, not as an interface change).

**Plans**: 3 plans

**Wave 1** *(docs cascade-amendment — runs before test/audit so later plan task text references corrected wording)*

- [x] 12-01-PLAN.md — Cascade-amendment doc edits: ROADMAP Phase 12 SC2 + SC3 and REQUIREMENTS HOOK-06 + HOOK-07 rewritten from `.git/hooks/pre-commit` to `.githooks/pre-commit` per CONTEXT D-03

**Wave 2** *(blocked on Wave 1 completion; the two plans touch disjoint files and run in parallel)*

- [x] 12-02-PLAN.md — HOOK-07 regression test: extend the `jj-colocated` describe block at `jj-hooks.test.ts:167` with a fires-exactly-once sentinel assertion
- [x] 12-03-PLAN.md — SC4 hook idempotency audit: standalone `12-HOOK-IDEMPOTENCY-AUDIT.md` classifying `.githooks/pre-commit` + `.githooks/pre-push` operations

### Phase 13: CI parallel-path lane + lint close-gate

**Goal**: A new CI matrix lane runs synthetic parallel phases end-to-end on both backends and is required-blocking on jj-colocated; the v1.3 "raw-git in workflow markdown collapses to zero" architectural proof is recorded as one-shot audit evidence (not promoted to permanent CI).
**Depends on**: Phase 11 (workflows + agents updated) + Phase 12 (A3 fix joins here)
**Requirements**: CI-05, CI-06, LINT-04, LINT-05
**Success Criteria** (what must be TRUE):

  1. New CI matrix lane `parallel-e2e` runs a synthetic 2-plan phase end-to-end on both backends; required-blocking on jj-colocated, optional on git-only.
  2. `scripts/audit-workflow-raw-git.cjs` ships as a baseline-regression guard: it carries a frozen baseline of the current 127-hit raw-git state in `*.md` shell-fence blocks across the three scan roots (`get-shit-done/workflows/`, `get-shit-done/references/`, and `agents/`), fails (non-passing exit) only when a scan EXCEEDS that baseline (NEW raw-git ADDED to workflow markdown), and passes when the scan is within baseline; on the first green run the current scan equals the baseline, so it passes; documented as one-shot (NOT added to CI pretest).
  3. `parallel-e2e` lane runs LINT-04 audit and fails if the baseline / no-regression invariant breaks (acts as milestone-completeness regression guard).
  4. `lint-vcs-no-raw-git.allow.json` net diff is +0 or +1 (the optional addition is the new `sdk/src/vcs/git/parallel.ts` adapter-internal entry with reason "git backend `parallel.*` verb body — adapter-internal substrate, not workflow-facing"). The 23 existing production entries are NOT touched. Diff recorded in milestone close commit.
  5. A3 fix from Phase 12 is exercised on the jj-colocated `parallel-e2e` lane (hook fires correctly during a parallel-dispatched phase's `jj squash` calls).

**Plans**: 4 plans

Plans:
**Wave 1**

- [x] 13-01-PLAN.md — Cascade-amendment: re-baseline ROADMAP SC2/SC3 + CONTEXT.md D-08 to the regression-guard framing (resolves Open Q1; the 127-hit baseline) [Wave 1]
- [x] 13-02-PLAN.md — Ship scripts/audit-workflow-raw-git.cjs (LINT-04 — stdout-only baseline-regression-guard scanner, frozen per-file 127-hit baseline) + its node:test unit test [Wave 1]
- [x] 13-03-PLAN.md — Ship scripts/e2e-parallel-phase.sh (CI-05 — the parallel-dispatch E2E harness driving the gsd-sdk query CLI bridges on both backends) [Wave 1]

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 13-04-PLAN.md — Ship .github/workflows/parallel-e2e.yml (CI-05 lane + parallel-e2e-gate blocking job + CI-06 audit step) + record the LINT-05 allowlist +1 diff [Wave 2]

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

**Plans**: 5 plans

Plans:
**Wave 1** *(parallel-safe, no inter-dependencies — file-disjoint)*

- [x] 14-01-PLAN.md — Config flips (D-04 template flatten + D-03 this-repo flip); requirements: CONFIG-01
- [x] 14-02-PLAN.md — CONFIG-02 envelope (D-06 + D-07 + D-08) + D-03 mitigation contract tests in cmd-parallel-{jj,git}.test.ts; requirements: CONFIG-02

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 14-03-PLAN.md — `scripts/dogfood-restore.sh` recovery primitive (D-10 surface 2 of 2); requirements: DOGFOOD-02

**Wave 3** *(blocked on Wave 2 completion; human-verify checkpoint at the end)*

- [x] 14-04-PLAN.md — `scripts/dogfood-rehearse.sh` rehearsal step against `cp -a` clone (D-11); requirements: DOGFOOD-02

**Wave 4** *(blocked on Wave 3 approval; human-verify checkpoint at the end)*

- [x] 14-05-PLAN.md — `scripts/dogfood-phase-14.sh` (jj-cell + git-cell dogfood) + `.planning/intel/v1.3-dogfood-metrics.md` + post-execute CONTEXT.md recovery prose (D-01, D-02, D-09, D-10 surface 1, D-12); requirements: DOGFOOD-01, DOGFOOD-02

### Phase 14.1: Drop mandatory bookmark on parallel dispatch + fan-in (emergency)

**Goal**: Remove the required `mainBookmark: string` field from `ParallelDispatchOpts` / `ParallelDispatchHandle` across both backends, replacing it with optional `mainBookmarks?: readonly string[]` (default `[]` → no advance). Fan-in still merges into `@` (jj) / current HEAD (git — detached or branch). Only the *advance* step becomes opt-in. Drop the workflow's over-broad `current-branch` FATAL preflight so bookmark-less jj working copies and detached-HEAD git working copies are both first-class. Single source of truth: `@` / current HEAD; bookmarks are advisory. This is gap-closure for the v1.3 close: the bookmark requirement was baked in by Phase 11 (PARALLEL-01) and Phase 14 should have caught it but didn't surface until a real `--auto` chain hit a bookmark-less `@`.
**Depends on**: Phase 14 (v1.3 close — stable parallel-verb surface to revise; PARALLEL-01/02/04 must already have landed so this is a contract revision, not a new design)
**Requirements**: PARALLEL-08
**Success Criteria** (what must be TRUE):

  1. `ParallelDispatchOpts.mainBookmark` and `ParallelDispatchHandle.mainBookmark` are removed; replaced by optional `mainBookmarks?: readonly string[]` (default `[]`). SDK type-checks cleanly with no caller referencing the old field. Public type at `sdk/src/vcs/types.ts:467,496` is updated atomically. (Phase 14.1 D-03 STRICT scope: `WorkspaceMergeOpts.mainBookmark` is OUT OF SCOPE — filed as MERGE-08 deferred-item in REQUIREMENTS.md.)
  2. jj fan-in (`sdk/src/vcs/jj/parallel.ts:409-417`): when `mainBookmarks` is empty/omitted, the `jj bookmark set <name> -r @` step is skipped — fan-in completes with a merge into `@` and zero bookmark mutation. When non-empty, every name is validated via `validateMainBookmark` BEFORE any advance side effect; iteration is all-or-nothing (any single invalid name throws before any `bookmark set` runs).
  3. git fan-in (`sdk/src/vcs/git/parallel.ts`): works on detached HEAD without error. Merge still lands via `git merge --no-ff` into current HEAD (no logic change to the merge loop — `merge --no-ff` is already detached-HEAD-safe). No "no current branch" or "main bookmark missing" error path exists. When `mainBookmarks` is non-empty, each name advances via `git update-ref refs/heads/<name> HEAD` after successful merge.
  4. `workflows/execute-phase.md` AND `workflows/quick.md`: the `current-branch` FATAL preflight at the dispatch-block top (~lines 530-535 in execute-phase.md; ~lines 668-673 in quick.md: `EXPECTED_BRANCH=$(gsd-sdk query current-branch ...)`/`exit 1`) is removed from BOTH files in lockstep (per Phase 14.1 D-01 symmetric scope). The dispatch CLI invocations either omit `--main-bookmark` or pass an empty list. Bookmark-less jj `@` and detached-HEAD git working copies dispatch successfully.
  5. New cross-backend tests in `sdk/src/vcs/__tests__/cmd-parallel-{jj,git}.test.ts` cover: (a) dispatch+fan-in with empty `mainBookmarks` on bookmark-less jj `@` AND on detached-HEAD git; (b) dispatch+fan-in with valid non-empty list — each name advances; (c) non-empty list containing one invalid name — all-or-nothing rejection BEFORE any side effect (no partial bookmark moves).
  6. PARALLEL-07's new `vcs.workspace.parallel.cancel` verb (Phase 15.04) does NOT inherit the bookmark requirement — cancel operates on `@` and the workspace SET only, no bookmark advance step. If Phase 15.04's plan currently assumes otherwise, it is updated to reflect the revised contract.

**Plans**: 1 plan (tight surface change; type + jj fan-in fix + git fan-in cleanup + workflow preflight removal + tests grouped — single wave)

  - [x] 14.1-01-PLAN.md — Optional mainBookmarks across SDK + workflow + tests (PARALLEL-08). Touches `sdk/src/vcs/types.ts`, `sdk/src/vcs/jj/parallel.ts`, `sdk/src/vcs/git/parallel.ts`, `sdk/src/query/workspace-parallel-dispatch.ts`, `workflows/execute-phase.md`, `workflows/quick.md`, `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts`, `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts`, `tests/quick-md-parallel-dispatch.test.cjs`. Empty-list + detached-HEAD + all-or-nothing validation scenarios mandatory.

### Phase 15: Adapter surface extensions + rename

**Goal**: Three new public verbs ship on the cross-backend `VcsAdapter` surface (`vcs.refs.idAlphabet`, `vcs.refs.matchPrefix`, `vcs.workspace.parallel.cancel`) and the v1.2 NAMING-01 deferred `rootCommits` → `rootRevisions` rename completes across 13+ call sites. Pure adapter-surface work; no workflow markdown change. The `cleanupSubagentWorkspaces` shared helper extracted by PARALLEL-07 (Wave 1 of its plan) is consumed by Phase 16's CLEANUP-02 — single owner, three call sites per IP-5.
**Depends on**: Phase 14 (v1.3 close — all parallel-verb surfaces stable before extending them) + Phase 14.1 (PARALLEL-08 contract revision lands first so 15.04's new cancel verb does not inherit the bookmark requirement)
**Requirements**: NAMING-01, VCS-21, VCS-22, PARALLEL-07
**Success Criteria** (what must be TRUE):

  1. `grep -rn '\brootCommits\b' --include='*.ts' --include='*.cjs' --include='*.js' --include='*.md' --include='*.json'` (excluding `node_modules`, `.git`, `.jj`, `dist-cjs/`, `.planning/research/.archive-pre-v1.4/`, `.planning/milestones/v1.2-research/`) returns 0 hits AFTER the rename; pre-rename JSON sidecar audit at `.planning/phases/15/rootCommits-rename-audit.json` documents the full closed call-site set including `sdk/src/vcs/backends.ts:79` capability matrix string literal (Pitfall 3).
  2. `vcs.refs.idAlphabet` returns `'0-9a-f'` on git adapter, `'k-z'` on jj adapter (opaque `readonly string`); the adapter-contract cross-backend test asserts both.
  3. `vcs.refs.matchPrefix(id, prefix)` returns `true` for matching prefix in canonical alphabet, `false` for non-matching, **throws on wrong-alphabet prefix** (hex prefix against jj id, k-z prefix against git id) per Pitfall 6, throws on empty prefix (caller bug), returns `false` for `prefix.length > id.length`; hex matching case-insensitive (matches git), k-z matching lower-only (matches jj); cross-product test covers all five rules.
  4. `vcs.workspace.parallel.cancel(handle)` returns within ≤2s for handles with ≤8 workspaces; tears down materialized workspaces via `workspace.forget` + `rm -rf` (jj) or `worktree remove --force` (git) + `bookmarks.delete({force:true})`; does NOT signal subagent processes (`spawnSync` exec layer can't accept AbortSignal per STACK lens, Phase 9 D-01 invariant) per Pitfall 5; returns structured `CancelResult` envelope (`{abandoned: readonly string[], surplusBookmarks: readonly string[], surplusWorkspaces: readonly string[]}` mirroring `FanInResult` shape, NOT void/boolean); new CLI bridge `sdk/src/query/workspace-parallel-cancel.ts` registered at all three sites (catalog-domain + manifest.non-family + aliases.generated).
  5. Shared `cleanupSubagentWorkspaces(mainRepoRoot, phaseNumber, workspaces?)` helper exported from `sdk/src/vcs/jj/workspace-cleanup.ts` (or equivalent sidecar) is consumed by PARALLEL-07's cancel body; Phase 16 CLEANUP-02 imports the SAME helper for fanIn-success-branch reap (no inline duplication, single owner per IP-5). (Amended 2026-05-24 from the original 2-arg `(phaseRoot, phaseNumber)` form per Phase 15 Open Q1 RESOLVED — see CONTEXT D-05.)

**Plans**: 4 plans (sequential within phase — file-overlap on `sdk/src/vcs/types.ts` + `backends/git.ts` + `backends/jj.ts` forces sequential plan ordering, NOT parallel waves)

  - [x] 15-01-PLAN.md — `rootCommits` → `rootRevisions` hard rename (NAMING-01). Ships FIRST: smallest diff, clears namespace, doing it later forces same-file rebase. Pre-rename JSON sidecar audit per Pitfall 3 (the v1.2 "JSON sidecar as build-pipeline seed" pattern); per-extension `grep -c '\brootCommits\b'` must exit 0 before commit; archived `.planning/research/.archive-pre-v1.4/` + `.planning/milestones/v1.2-research/` treated as historical-prose carve-out. No alias (v1.2 NAMING-01 precedent).
  - [x] 15-02-PLAN.md — `vcs.refs.idAlphabet` (VCS-21). Three-line addition to refs namespace on both backends (`'0-9a-f'` git, `'k-z'` jj); JSDoc frames as opaque char-class regex body; cross-backend contract test asserts non-empty + matches backend's known alphabet.
  - [x] 15-03-PLAN.md — `vcs.refs.matchPrefix` (VCS-22). Consumes VCS-21 idAlphabet contract; pure-string per-backend implementation (no closures over adapter state, hard-codes alphabet regex inline matching `validateRefname` precedent); throws on wrong-alphabet + empty prefix; returns false on `prefix.length > id.length`; hex case-insensitive, k-z lower-only; test cross-product mandatory.
  - [x] 15-04-PLAN.md — `vcs.workspace.parallel.cancel` (PARALLEL-07). Ships LAST: largest plan, consumes settled types.ts diffs. **Wave 1 = extract `cleanupSubagentWorkspaces` helper** (Pitfall 11; single owner per IP-5). **Wave 2 = cancel verb body** using helper; synchronous teardown only (no signal handling per STACK lens + Phase 11 D-01 + Phase 9 PARALLEL-03 invariants); structured `CancelResult` (NOT void/boolean); new CLI bridge `workspace-parallel-cancel.ts` with three-site registration; per-backend test files cover cancel-clean-abandon, cancel-idempotent-recall, cancel-partial-state-recovery.

### Phase 16: Workflow + invariant tooling

**Goal**: Two file-disjoint invariant-tooling additions: a new CI lint that enforces workflows declaring `vcs.workspace.parallel.dispatch` / `fan-in` literals actually call the verbs (mirrors `lint-vcs-no-raw-git.cjs` shape), and the orphan FS dir reap that closes the v14-orphan-jj-workspace-dirs cleanup-contract gap on both the dispatcher fanIn success branch AND the recovery script.
**Depends on**: Phase 15 (CLEANUP-02 consumes `cleanupSubagentWorkspaces` helper extracted in Phase 15 PARALLEL-07 Wave 1 per IP-5 single-owner pattern)
**Requirements**: LINT-06, CLEANUP-02
**Success Criteria** (what must be TRUE):

  1. `scripts/lint-vcs-parallel-call-presence.cjs` exits 0 when scanning workflow markdown containing paired `workspace.parallel.dispatch` + `workspace.parallel.fan-in` literals in shell fences; exits 1 when fan-in literal is present but dispatch is missing within the same fence-block-cluster (or vice versa); content-driven detection via literal substring match in `bash`/`sh`/`zsh` fences (NOT heading-based tagging per Pitfall 7); per-entry `{path|glob, reason, owner}` allowlist consumed via `scripts/lib/allowlist-parser.cjs` (no `expires` per `feedback_solo_dev_no_expires`); inline escape annotation `vcs-lint:allow-parallel-call-absent-here <reason>`; fixture-based unit test under `tests/scripts/` covers Pitfall 7 false-positive cases (`code-review.md`, `audit-fix.md` discussing wave/parallel in prose only).
  2. New CI step in `.github/workflows/parallel-e2e.yml` runs the lint adjacent to the existing `audit-workflow-raw-git.cjs` CI-06 step; required-blocking on jj-colocated; NOT promoted to `npm pretest` (matches `audit-workflow-raw-git.cjs` D-07 CI-only precedent).
  3. After `vcs.workspace.parallel.fan-in` clean-path success branch on jj backend, no `.claude/jj-workspaces/phase-*-subagent-*` FS directories exist on disk; cross-backend test via `vcs-fixture.ts` Pattern B mkdtemp asserts post-fanIn `existsSync(ws.path) === false` for every workspace in the handle.
  4. **Conflicted branch behavior unchanged** per Pitfall Anti-Pattern 5 — `performJjParallelFanIn` conflicted branch preserves workspaces on disk for human inspection (W3 (a) joint-assertion contract); only the clean-path branch reaps. Documented inline at the code site.
  5. `scripts/dogfood-restore.sh` includes an idempotent post-restore step that removes any surviving `.claude/jj-workspaces/phase-*-subagent-*` directories (consumes the same `cleanupSubagentWorkspaces` helper that Phase 15 PARALLEL-07 extracted); end-to-end test asserts the dirs are gone after a synthetic `jj op restore` + orphan-survival fixture.

**Plans**: 2 plans (parallel-safe — file-disjoint)

  - [ ] 16.01-PLAN.md — LINT-06 workflow call-presence lint. New `scripts/lint-vcs-parallel-call-presence.cjs` + per-entry `.allow.json` + fixture-based unit test (Pattern B mkdtemp) + new step in `parallel-e2e.yml`. Pitfall 7 prevention: scope by SHELL FENCE not by prose mention (reuse `audit-workflow-raw-git.cjs` fence-aware walker shape); content-driven literal substring detection; per-file allowlist for legitimate non-dispatchers.
  - [x] 16.02-PLAN.md — CLEANUP-02 orphan FS dir reap. Extend `performJjParallelFanIn` clean-path branch with a direct call to the `cleanupSubagentWorkspaces` helper (do NOT touch conflicted branch per Pitfall Anti-Pattern 5); extend `scripts/dogfood-restore.sh` with idempotent post-restore step via the new CLI bridge `sdk/src/query/cleanup-subagent-workspaces.ts` (three-site registration per CF-02); consume `cleanupSubagentWorkspaces` helper from Phase 15 PARALLEL-07; new cross-backend test covers both jj-cell and git-cell fanIn-success-no-orphan-dirs + dogfood-restore-survival-cleanup scenarios.

### Phase 17: Drift control + reconciliation

**Goal**: Lock prose claims to filesystem state by shipping two `node:test` drift-control tests (verbatim copy of `tests/inventory-counts.test.cjs` shape); fix the underlying ARCHITECTURE.md prose-count drift across en + 3 translations BEFORE the tests RED (Pitfall 4 strict ordering); resolve the 45 `/gsd:docs-update --verify-only` failures across 8 themes with per-theme triage (Pitfall 12 ADR supersession notes for theme 3, change-id-anchored references for theme 5); reconcile PROJECT.md `### Validated` against MILESTONES.md + per-phase SUMMARYs LAST per IP-4 (so v1.4's own REQ-IDs land in the truth source).
**Depends on**: Phase 16 (drift fixes touch docs/ which is parallel-safe with adapter surface work; PROJECT.md reconciliation runs LAST so it captures v1.4's complete REQ-ID set)
**Requirements**: DOCS-08, DRIFT-01, DRIFT-02, DOCS-01, DOCS-02, DOCS-03, DOCS-04, DOCS-05, DOCS-06, DOCS-07, DOCS-09, PROJECT-01
**Success Criteria** (what must be TRUE):

  1. `tests/architecture-counts.test.cjs` + `tests/command-count-sync.test.cjs` exist and pass green on first land (Pitfall 4 day-1-red prevented); both use `node:test` framework (NOT vitest per Anti-Pattern 2 + `project_test_perf_pain_vitest` memory); both scan live filesystem at runtime (NOT hardcoded counts, NOT snapshots); architecture-counts walks `docs/ARCHITECTURE.md`, `docs/ja-JP/ARCHITECTURE.md`, `docs/ko-KR/ARCHITECTURE.md`, `docs/pt-BR/ARCHITECTURE.md` (zh-CN does NOT exist, do not create); command-count-sync asserts INVENTORY.md `## Commands` table row count == `commands/gsd/*.md` filesystem count.
  2. After ARCHITECTURE.md prose-count fixes land (Wave 1), the 5 known drift sites in `docs/ja-JP/ARCHITECTURE.md` (lines :116, :127, :137, :427), the parallel drifts in `docs/ko-KR/ARCHITECTURE.md`, `docs/pt-BR/ARCHITECTURE.md`, and en source are corrected (44→68 commands, 46→89 workflows, 16→33 agents, 17→60 lib modules, ~3000→10,978 install.js LOC); en source defers to INVENTORY.md per current pattern.
  3. `/gsd:docs-update --verify-only` re-run pass rate ≥ 99% (allowing legitimate skip-but-flag cases); themes 1, 2, 3, 4, 5, 6 (resolved by DRIFT-01/02), 7, 8 all closed per Pitfall 12 per-theme triage; theme 3 ADR drift handled via append-only "## Update YYYY-MM-DD" supersession notes (NOT in-place edit per Integration Gotcha "ADR immutability"); theme 5 phase-3 archived references anchored to change_ids/closure-commits (NOT deleted per Pitfall 12); per-theme decisions recorded in `.planning/intel/docs-update-fix-triage.md` BEFORE execute.
  4. `.planning/PROJECT.md` `### Validated` section reconciled: every REQ-ID present in `.planning/REQUIREMENTS.md` + `.planning/milestones/v*-REQUIREMENTS.md` has correct phase reference and status; v1.4's own REQ-IDs (NAMING-01, VCS-21, VCS-22, PARALLEL-07, LINT-06, CLEANUP-01..07, TEST-17, DRIFT-01/02, DOCS-01..09, PROJECT-01) appear in the reconciled `### Validated` list (per IP-4); hand-curated parentheticals like "(caveat: A3 colocated pre-commit gap remains open, see Active)" preserved per Pitfall 8.
  5. Machine-generated truth source at `.planning/intel/project-validated-truth.md` exists (two-pass approach per Pitfall 8 — machine generates the SoT, human edits PROJECT.md narrative citing it); PROJECT.md is NOT regenerate-overwrite output.

**Plans**: 4 plans (Wave 1 = 17.01 fixes prose; Wave 2 = 17.02 ships tests after fixes; Wave 3 = 17.03 batches remaining doc themes; Wave 4 = 17.04 reconciliation LAST per IP-4)

  - [ ] 17.01-PLAN.md — ARCHITECTURE.md prose-count fixes FIRST (Wave 1, DOCS-08). Per-translation fix: `ja-JP/ARCHITECTURE.md` (4 known drift sites :116, :127, :137, :427), `ko-KR/ARCHITECTURE.md`, `pt-BR/ARCHITECTURE.md`; en source defers to INVENTORY.md per current pattern (audit confirms :121, :143). zh-CN does NOT exist; do not create. Pitfall 4 prevention: drift FIX before drift TEST so day-1 CI is green.
  - [ ] 17.02-PLAN.md — Drift-control tests SECOND (Wave 2, DRIFT-01 + DRIFT-02). New `tests/architecture-counts.test.cjs` + `tests/command-count-sync.test.cjs` (verbatim copy of `tests/inventory-counts.test.cjs` shape); `node:test` framework; live-scan style; both files separate per scoping decision (single-responsibility, separate failure messages, INVENTORY.md theme 6 specifically names both); cross-link via comment. Tests are GREEN on land because 17.01 fixed drift first. Plan must-haves cite "17.01 committed before this plan starts" per Pitfall 4 same-PR coupling.
  - [ ] 17.03-PLAN.md — Batched docs-update themes (Wave 3, DOCS-01..07 + DOCS-09). Per-theme commits within one plan per Pitfall 12: theme 1 (14 author-machine path leaks in ja-JP/ko-KR superpowers plans), theme 2 (3 translation specs reference non-existent workspace command split), theme 3 (ADR 0009 + 0010 drift via append-only supersession notes), theme 4 (5 renamed-hook/missing-helper references), theme 5 (3 phase-3 archived references anchored to closure change_ids per Pitfall 12), theme 7 (3 pt-BR translation date/link mismatches), theme 8 (3 singleton failures). DOCS-09 = post-batch close-gate: re-run `/gsd:docs-update --verify-only`, confirm pass rate ≥ 99%. Per-theme decisions recorded in `.planning/intel/docs-update-fix-triage.md` BEFORE execute.
  - [ ] 17.04-PLAN.md — PROJECT.md `### Validated` reconciliation (Wave 4 = LAST, PROJECT-01). Two-pass approach per Pitfall 8: machine-generated truth source at `.planning/intel/project-validated-truth.md` (one bullet per REQ-ID with current status from STATE.md + milestones/v*-REQUIREMENTS.md); human-edited PROJECT.md narrative cites truth source and preserves hand-curated parentheticals like "(caveat: A3 colocated pre-commit gap remains open, see Active)". NOT a full regenerate-overwrite. Includes v1.4's OWN REQ-IDs per IP-4 (NAMING-01, VCS-21, VCS-22, PARALLEL-07, LINT-06, CLEANUP-01..07, TEST-17, DRIFT-01/02, DOCS-01..09, PROJECT-01) — this is why it runs LAST.

### Phase 18: Tactical cleanup + test-flake

**Goal**: Close the remaining v14-* todos that don't fold into Phases 15-17: the `transition.md:166` HIGH-RISK false-clean-WC site (Pitfall 2 — fix FIRST among workflow waves to prevent repeat-failure mode), the Phase 14 code-review WR-01..05 hardening followups (per-WR commits per Pitfall 10), and the narrow-scope `jj-reap.test.ts > inclusion-filter` flake fix (Pitfall 9 — ≤5 LOC, ≤1 file, vitest.config.ts UNTOUCHED).
**Depends on**: Phase 17 (canonical phase order 15 → 16 → 17 → 18; Phase 18 is the "everything else" bucket; each plan is file-disjoint from prior phases)
**Requirements**: CLEANUP-01, CLEANUP-03, CLEANUP-04, CLEANUP-05, CLEANUP-06, CLEANUP-07, TEST-17
**Success Criteria** (what must be TRUE):

  1. `get-shit-done/workflows/transition.md` line 166 HIGH-RISK site has the `assert_clean_wc` final-gate + commit-adjacency pattern applied (mirrors the existing fix in `execute-phase.md` / `plan-phase.md` from the Phase 14 quick-task); broadened gate scope covers ALL uncommitted paths (not just `.planning/`) per recent commit `3fe538c0`; verified by inserting a synthetic uncommitted file and confirming `transition.md` flow halts before terminal banner.
  2. `scripts/dogfood-restore.sh` enforces project-root precondition before `tar -xf` via explicit `[ -f .planning/STATE.md ]` assertion (CLEANUP-03 / Phase 14 WR-01); tar-overlay ambiguity resolved per CLEANUP-04 / Phase 14 WR-02 (either `rm -rf .planning && tar -xf` clean overlay OR documented asymmetry as intended).
  3. `sdk/src/query/workspace-parallel-dispatch.ts` returns `{ok:false, reason:'plan_not_array'}` envelope when `JSON.parse(planText)` is not an array (CLEANUP-05 / Phase 14 WR-03); `--max-concurrency` CLI flag rejects NaN via `Number.isNaN` guard mirroring existing `--phase` guard (CLEANUP-06 / Phase 14 WR-04); each guard has a contract test covering its envelope/error shape.
  4. `cmd-parallel-{jj,git}.test.ts` `describe('CONFIG-02 — parallelization_disabled')` blocks include `afterEach(() => rm(tmpDir, {recursive: true, force: true}))` (CLEANUP-07 / Phase 14 WR-05); 6 leaked dirs per run eliminated; verified via test-run-then-inspect-tmp check.
  5. `sdk/src/vcs/__tests__/jj-reap.test.ts > workspace.reap > inclusion-filter` no longer times out at 5s under parallel test load (TEST-17); fix is per-test only via `it.timeout(15_000)` (preferred) OR `describe.concurrent({concurrent: false})` opt-out OR move to `*.integration.test.ts` (last resort per Pitfall 9); diff ≤5 LOC, ≤1 file, `sdk/vitest.config.ts` UNTOUCHED; `scripts/check-skip-count.cjs` green; project_test_perf_pain_vitest broader sweep stays out of scope.

**Plans**: 3 plans (parallel-safe within phase — each plan touches different files)

  - [ ] 18.01-PLAN.md — CLEANUP-01 transition.md gate (HIGHEST PRIORITY per Pitfall 2). Apply Phase 14 quick-task pattern (`assert_clean_wc` final-gate + commit-adjacency reorder) to `transition.md:166`. Should land FIRST in any v1.4 wave that touches workflows; documents the global-install caveat (operator must `node bin/install.js --claude --global` to get the new gate) in the plan's SUMMARY.
  - [ ] 18.02-PLAN.md — v14-review-followups (CLEANUP-03..07 = Phase 14 WR-01..05). Per-WR commits per Pitfall 10 prevention; order per Pitfall 10: prod-code fixes (CLEANUP-05 Array.isArray, CLEANUP-06 Number.isNaN) FIRST, then script fixes (CLEANUP-03 project-root assertion, CLEANUP-04 tar-overlay decision), then test fixes (CLEANUP-07 afterEach rm). Each WR has its own contract test (envelope return, NaN-guard, tmpDir cleanup). 5 Phase 14 info findings NOT forced into milestone (addressed opportunistically only if adjacent file touched).
  - [ ] 18.03-PLAN.md — TEST-17 jj-reap.test.ts > inclusion-filter flake fix. Narrow scope per Pitfall 9: try `it('inclusion-filter: …', () => {...}, 15_000)` first (5 LOC max); fall back to `describe('workspace.reap …', { concurrent: false }, () => {...})` ONLY if (a) is verified insufficient via bisection. Diff ≤5 LOC, ≤1 file, `sdk/vitest.config.ts` UNTOUCHED, `scripts/check-skip-count.cjs` green. Plan CONTEXT.md cites `.planning/PROJECT.md` Out of Scope clause ("Broader test-perf sweep beyond TEST-17") verbatim.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 2.1 → 3 → 03.1 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18

Note: Phase 12 (A3 fix) is an independent parallel track and may execute concurrently with Phases 9/10/11; the dependency ordering above is the canonical record sequence, not a serial execution constraint for Phase 12.

v1.4 phase ordering: Phase 15 ships first (adapter surface highest-leverage; extracts shared helper consumed by Phase 16); Phase 16 second (file-disjoint with 15; consumes Phase 15 helper); Phase 17 third (drift fix Wave 1 → drift tests Wave 2 strict ordering per Pitfall 4; PROJECT.md reconciliation Wave 4 LAST per IP-4 to capture v1.4's own REQ-IDs); Phase 18 fourth (everything-else bucket; CLEANUP-01 transition.md is HIGHEST PRIORITY within the phase per Pitfall 2 but lands inside the phase's parallel wave).

| Milestone | Phases | Plans | Status   | Shipped    |
|-----------|--------|-------|----------|------------|
| v1.0 MVP  | 8      | 53/56 | Complete | 2026-05-14 |
| v1.1 first upstream sync | 1 | 5/5 | Complete | 2026-05-14 |
| v1.2 jujutsu is change-only — never commit id anywhere | 1 | 3/3 | Complete | 2026-05-15 |
| v1.3 jj octopus merge for subagents fully functional | 6 | 34/34 | Complete | 2026-05-24 |
| v1.4 Clean, consistent state for next upstream pull | 4 | 0/13 | Planning | — |

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 9. jj-side parallel verbs | 5/5 | Complete   | 2026-05-15 |
| 10. git-side parallel verbs + classifier extension | 6/6 | Complete    | 2026-05-16 |
| 11. Orchestrator + agent rewire + workspace.assert-dispatched-cwd | 11/11 | Complete    | 2026-05-16 |
| 12. A3 colocated pre-commit fix (parallel track) | 3/3 | Complete    | 2026-05-21 |
| 13. CI parallel-path lane + lint close-gate | 4/4 | Complete   | 2026-05-22 |
| 14. Default flip + dogfood validation | 5/5 | Complete    | 2026-05-24 |
| 15. Adapter surface extensions + rename | 4/4 | Complete    | 2026-05-25 |
| 16. Workflow + invariant tooling | 2/2 | Complete    | 2026-05-25 |
| 17. Drift control + reconciliation | 4/4 | Complete    | 2026-05-25 |
| 18. Tactical cleanup + test-flake | 0/3 | Not started | — |
| 19. Upstream merge conflict resolution + fork-abstraction audit | 13/13 | Complete   | 2026-06-10 |

## Next

v1.4 roadmap created 2026-05-24 — 4 phases, 13 plans, 25 requirements mapped 100%. Next: `/gsd:plan-phase 15` to decompose Phase 15 (Adapter surface extensions + rename) into executable plans, starting with the `rootCommits` → `rootRevisions` pre-rename JSON sidecar audit (Plan 15.01 Wave 1 per Pitfall 3).

### Phase 19: Upstream merge conflict resolution + fork-abstraction audit

**Goal:** The upstream merge change `vpzlrrlv` (upstream main `03764dbc` "Merge pull request #940 from open-gsd/hotfix/1.4.3" merged into fork main `c7bd6bee`, ~485 upstream commits incl. a full restructure) reaches 0 conflicts with functional code on **upstream's new layout** — upstream's restructure is ADOPTED (SDK retirement per their ADR-0174, `get-shit-done/` → `gsd-core/`, `src/*.cts` rewrite) so future upstream pulls stay cheap. The fork's only durable divergence is the VCS abstraction enabling jj support: `sdk/src/vcs/` (VcsAdapter, jj+git backends, unified revision model, `workspace.parallel.*`, `.githooks` bridge) is ported into upstream's architecture as `src/vcs/*.cts` (or closest idiomatic equivalent), upstream's raw-git call sites are migrated to route through it, fork jj-behavior tests are ported to upstream's test layout, and fork lint gates are re-pointed at the new tree. Build green (upstream's build), tests green on both backends, every disposition recorded in `19-MERGE-AUDIT.md`. Lessons from MERGE-REVIEW-upstream-2026-05-25.md apply: validate CJS parse correctness, check for silently dropped features, severed dispatch chains, and stale generated files.
**Requirements**: TBD (merge hygiene + fork-abstraction invariants: lint-vcs-no-raw-git, lint-vcs-no-commit-id, audit-workflow-raw-git baseline)
**Depends on:** Nothing in v1.4 (operator-initiated upstream pull; v1.4 phases 15-17 shipped; Phase 18 pending independently)
**Plans:** 13/13 plans complete

Constraints:

- Resolution happens in the working copy on top of merge change `vpzlrrlv` in workspace `get-shit-done-2`; the operator squashes into the merge change at the end (do NOT squash/rewrite the merge change itself).
- `gsd-sdk` is currently installed from the sibling `get-shit-done` checkout — this workspace must be fully resolved, building, and abstraction-clean before the installed copy is touched.

Plans:

- [x] 19-01-PLAN.md — Ledger bootstrap + packaging/identity resolution (pnpm pin, mirror upstream identity, drop fallow/rollout/org-CI)
- [x] 19-02-PLAN.md — Dependency vetting + BLOCKING human legitimacy checkpoint + single pnpm install + upstream build bring-up
- [x] 19-03-PLAN.md — Harvest fork reference content from c7bd6bee + mechanically clear conflict buckets A/B/C (accept upstream deletion)
- [x] 19-04-PLAN.md — Genuine merges: docs/translations, de-org'd CI, tests/helpers, research-synthesizer → ZERO conflicts + pre-port baseline
- [x] 19-05-PLAN.md — Port sdk/src/vcs (36 modules) → src/vcs/*.cts; gitignore; build green + adapter smoke
- [x] 19-06-PLAN.md — CLI bridge: src/vcs-command-router.cts + gsd-tools wiring + early regression net (PORT-02)
- [x] 19-07-PLAN.md — Migrate upstream execGit call sites + 5 outliers (incl. destructive reset --hard); substrate dispositions (AUDIT-01)
- [x] 19-08-PLAN.md — Workflow re-wiring: 9 fork deltas re-applied on gsd-core/workflows, three-way-aware, verb-smoked
- [x] 19-09-PLAN.md — Agents rewiring + jj-aware launcher fix (sync script) + .githooks rewrite + hook audit
- [x] 19-10-PLAN.md — Lint-gate re-pointing: SCAN_EXT +cts, allowlists, audit baseline re-derivation (MERGE-05)
- [x] 19-11-PLAN.md — Vitest revival + port ~75 jj/vcs test assets to upstream layout (PORT-01 proof)
- [x] 19-12-PLAN.md — Fork-test triage + sdk//get-shit-done/ residue deletion + skip re-baseline + full suites green (MERGE-04)
- [x] 19-13-PLAN.md — Phase gate: MERGE-02 ledger completeness proof + ordered verification run + ledger finalization

---
*Last updated: 2026-05-24 — v1.4 roadmap created. 4 phases (15-18), 13 plans, 25 requirements. Coverage: 25/25 mapped (no orphans). Phase shape derived from research synthesis with one clarification: PARALLEL-07's plan extracts the shared `cleanupSubagentWorkspaces` helper as its Wave 1, then CLEANUP-02 (Phase 16) consumes the same helper — avoiding cross-phase dependency inversion while preserving IP-5 single-owner pattern. Strict ordering enforced at roadmap level: (1) Phase 15 plan 15.01 ships rename FIRST (smallest diff, clears namespace, auto-resolves IP-1); (2) Phase 17 plan 17.01 ships ARCHITECTURE.md prose-count fixes BEFORE plan 17.02 ships drift tests (Pitfall 4 prevents day-1 red CI); (3) Phase 17 plan 17.04 ships PROJECT.md reconciliation LAST per IP-4 (captures v1.4's own REQ-IDs); (4) Phase 18 plan 18.01 (transition.md gate) is HIGHEST PRIORITY within Phase 18 per Pitfall 2 even though the phase is parallel-safe. v1.3 shipped 2026-05-24 (6 phases, 34 plans, 27 requirements).*
