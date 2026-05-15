# Requirements: GSD jj-port — Milestone v1.3

**Defined:** 2026-05-15
**Milestone:** v1.3 jj octopus merge for subagents fully functional
**Core Value:** All subagent dispatch machinery routes through the `VcsAdapter` via new high-level `vcs.workspace.parallel.*` verbs. Git backend implements them via raw-git worktree+merge under the hood (lifted out of workflow markdown). jj backend implements them via the already-shipped `octopus.ts` + `reap.ts` helpers, composed inside a backend `parallel` sidecar. `parallelization: true` flips on by default for both backends. Workflows never branch on `vcs.kind` for parallel-dispatch reasons.

> v1.0 + v1.1 + v1.2 requirements are archived under `Validated` in `PROJECT.md` and in `.planning/milestones/v{X.Y}-REQUIREMENTS.md`. This file scopes v1.3 only.

## v1.3 Requirements

### Cross-backend parallel-dispatch verbs (PARALLEL)

The two new high-level verbs that define v1.3's deliverable surface. Verb namespace locked at `vcs.workspace.parallel.*` (sub-sub-namespace under `workspace`, precedent: `refs.bookmarks.*`).

- [x] **PARALLEL-01**: `vcs.workspace.parallel.dispatch(plan): ParallelDispatchHandle` ships on both backends. jj composes `octopus.createPhaseStructure` + N× `createSubagentSlot`. git wraps `git worktree add` with internal serialization (Pitfall 5 — `.git/config.lock` race). Returns `{ phaseRoot, workspaces: [{ name, path, baseRev, agentId }], manifest, phaseNumber, mainBookmark }`. Handle is frozen pure JSON data (D-05 in `09-CONTEXT.md`).
- [x] **PARALLEL-02**: `vcs.workspace.parallel.fanIn(handle, results): FanInResult` ships on both backends. jj uses one N-parent `jj new <p1>...<pN>` octopus form + batched `jj bookmark delete`. git uses N-parent `git merge --no-ff <p1>...<pN>` + batched `git update-ref -d`. Returns `{ merged, conflicted, conflictedPaths, incompleteQueued, failedReaped, surplusBookmarks }` — same shape on both backends; `conflicted: boolean` distinguishes in-tree-conflict-success from crash (Pitfall 2). `results` arg shape: `Array<{ agentId, exitCode, lastChangeId?, stderr? }>` (D-07 in `09-CONTEXT.md`).
- [x] **PARALLEL-05**: `ParallelDispatchHandle.workspaces[].baseRev` JSDoc documents stability semantics across `jj rebase` (rebase-stability differentiator — change_id stable on jj, commit_id stable on git per v1.2 unified revision model).
- [ ] **PARALLEL-06**: `dispatch({ plan, maxConcurrency })` input field honored — numeric cap on concurrent agent workspaces. Default `undefined` (no cap; runtime's natural agent-cap rules). Differentiator surfaced for the dogfood phase's measurement story.

> **PARALLEL-03 and PARALLEL-04 dropped at Phase 9 discuss (2026-05-15)** — see `.planning/phases/09-jj-side-parallel-verbs/09-CONTEXT.md` D-01 / D-02. The orchestrator-awaits-`Agent()` invariant makes the liveness scenario impossible in production; `octopus.ts`'s topology gives each subagent a distinct change so no shared-ancestor concurrent-squash exists. No `acquireJjRepoLock`, no `liveWorkspaces` field on `FanInResult`.

### Backend implementations (VCS)

Adapter interface + sidecar files. Mechanical wiring once the verb contracts in PARALLEL-* are set. REQ-IDs continue from v1.1's VCS-15.

- [x] **VCS-16**: New `VcsWorkspaceParallel` interface in `sdk/src/vcs/types.ts` exposing `dispatch` + `fanIn` + result types. Lives under `VcsWorkspace.parallel` (sub-sub-namespace).
- [x] **VCS-17**: New `sdk/src/vcs/jj/parallel.ts` composition layer. Imports `octopus.ts` + `reap.ts` + `workspace.merge`. Consumed by `backends/jj.ts`. Sidecar discipline (UPSTREAM-02): does NOT import from `backends/jj.ts`; inline `jjArgvFlags` per `octopus.ts:45` template.
- [ ] **VCS-18**: New `sdk/src/vcs/git/parallel.ts` (new dir + file). Lifts ~100 LOC `executeWorktreeWaveCleanupPlan` body into TS plus the worktree-dispatch loop currently in `execute-phase.md:521-810`. Consumed by `backends/git.ts`. Joins `lint-vcs-no-raw-git.allow.json` as a single adapter-internal entry with reason "git backend `parallel.*` verb body — adapter-internal substrate, not workflow-facing".
- [x] **VCS-19**: `WAVE_WORKTREE_MANIFEST` schema extension — adds `plan_id`, `agent_id`, `backend` fields. Backwards-compatible (existing consumers ignore new fields; reader tolerates absence).
- [ ] **VCS-20**: `gsd-sdk query workspace.assert-dispatched-cwd` SDK verb — backend-opaque sanity check that the calling process is running inside a dispatched workspace. Consumed by the rewritten subagent prompts (PROMPT-06).

### Workflow + agent rewire (PROMPT)

Continues v1.1's PROMPT-04 (-242 LOC raw-git fallback delete) and v1.2's PROMPT-05 (zero `vcs.kind === 'jj'` id branches) pattern. Deletions are the architectural evidence.

- [ ] **PROMPT-06**: Delete the raw-git worktree dispatch + cleanup block in `get-shit-done/workflows/execute-phase.md:521-810` (~290 LOC). Replace with one `gsd-sdk query workspace.parallel.dispatch` call + one `… fan-in` call.
- [ ] **PROMPT-07**: Delete the raw-git block in `get-shit-done/workflows/quick.md:660-810` (~150 LOC). Same single-verb replacement.
- [ ] **PROMPT-08**: Collapse `agents/gsd-executor.md:412-555` worktree-aware blocks (4 blocks) into one `workspace.assert-dispatched-cwd` query call. Agents receive only a cwd — backend kind is never exposed (anti-feature: no `GSD_BACKEND_KIND` env var).
- [ ] **PROMPT-09**: Rename `get-shit-done/references/worktree-path-safety.md` → `dispatch-cwd-safety.md`; rewrite body to be backend-agnostic. Update all referrers.

### Lint close-gate (LINT)

Audit script captures the "raw-git in workflow markdown collapses to zero" evidence. NOT promoted to permanent CI lint — close-gate evidence only.

- [ ] **LINT-04**: Ship `scripts/audit-workflow-raw-git.cjs` — scans `*.md` shell-fence blocks (` ```bash` / ` ```sh` / ` ```zsh`) under `get-shit-done/workflows/` + `get-shit-done/references/` + `agents/` for raw `git ` invocations. Emits both `.md` + JSON sidecar (per v1.2's D-01 single-source-of-truth pattern). v1.3 close-gate evidence: first green run with zero hits = milestone complete. Documented as one-shot; not added to CI pretest.
- [ ] **LINT-05**: `lint-vcs-no-raw-git.allow.json` net change is +0 or +1 — the single addition (if any) is the new `sdk/src/vcs/git/parallel.ts` adapter-internal entry. The 23 existing production entries are NOT touched (architecture-researcher's calibration; PROJECT.md framing corrected). Allowlist diff recorded in milestone close commit.

### A3 colocated pre-commit fix (HOOK)

Closes the gap inherited from v1.0 Phase 4. Path A vs B vs 1 not pre-decided at requirements time — re-read Phase 4 LEARNINGS Open Q1 (archived `51ee72a3`) at discuss-phase; CONTEXT.md records the chosen path with rationale. REQ-IDs continue from v1.0's HOOK-05.

- [ ] **HOOK-06**: A3 colocated pre-commit fix landed. jj 0.41 colocated `jj squash` reliably fires `.git/hooks/pre-commit` (whichever path; CONTEXT-level decision). Lives in `sdk/src/vcs/backends/jj.ts::commit` or new `sdk/src/vcs/jj/pre-commit-bridge.ts` sidecar — NOT an adapter interface change.
- [ ] **HOOK-07**: Regression test for HOOK-06 on a colocated jj fixture. Pre-commit hook fires exactly once (or zero times if `GSD_HOOK_SKIP_COLOCATED` env opt-out applies, depending on chosen path). Hook idempotency audit recorded if the chosen path relies on it (e.g., always-fire variant).

### CI parallel-path lane (CI)

Validates the verbs in real CI before flipping the default. REQ-IDs continue from v1.0's CI-04.

- [ ] **CI-05**: New CI matrix lane `parallel-e2e` runs a synthetic 2-plan phase end-to-end on both backends. Required-blocking on jj-colocated; optional on git-only.
- [ ] **CI-06**: `parallel-e2e` lane runs the LINT-04 audit script and fails if zero-hits invariant breaks. Acts as the milestone-completeness regression guard.

### Test infrastructure (TEST)

Continues v1.1's TEST-11 strict-green + v1.2's TEST-12 matcher. REQ-IDs continue from v1.2's TEST-12.

- [ ] **TEST-13**: Cross-backend contract tests for PARALLEL-01 + PARALLEL-02 at `sdk/src/vcs/__tests__/cmd-parallel-{git,jj}.test.ts`. Vitest Pattern A (`describe.sequential.skipIf(!available)`). Both backends run the same scenarios: N=2/3/4 dispatch, clean fan-in, fan-in with one in-tree-conflict, fan-in with one crashed worker.
- [ ] **TEST-14**: Topology assertion. Post-fan-in `jj log -r 'divergent()' --no-graph` MUST be empty on jj backend — proves the octopus structure (`createPhaseStructure` + N `createSubagentSlot` + N-parent `jj new`) produces non-divergent change_ids. Originally specified as a lock-effectiveness test; reframed per Phase 9 D-03 since PARALLEL-04 is dropped.
- [ ] **TEST-15**: git N-parent octopus fixture. `git merge --no-ff <p1> <p2> <p3>` octopus form for N≥3 verified cross-version (ARCHITECTURE-researcher's open question).
- [ ] **TEST-16**: Test-flake budget. New `parallel-*` test files use Pattern B random-prefix `mkdtemp` (per Pitfall 9). NEVER `retry: N`; NEVER `describe.skip`. Test counts on both backends MUST match baseline post-v1.3 (no skip-count regressions).

### Default config flip (CONFIG)

The user-observable success signal. New prefix.

- [ ] **CONFIG-01**: Install template default for `.planning/config.json` `parallelization` flips from `false` to `true`. Existing repos with explicit `false` keep `false` (config wins over default — no migration needed since subagent workspaces are ephemeral and no on-disk dispatcher state persists).
- [ ] **CONFIG-02**: `parallel.dispatch` pre-flight reads `parallelization` config and refuses with a clear error if `false`. Pre-flight removes the silent-no-op footgun.

### Dogfood validation (DOGFOOD)

Last phase. Synthetic plans on this very repo's jj backend. New prefix.

- [ ] **DOGFOOD-01**: Spin up 2-3 synthetic plans on an isolated bookmark (NOT main). Run them in parallel via the new `vcs.workspace.parallel.dispatch` + `fanIn`. Validate: clean fan-in (no `divergent()`), agent-bookmark cleanup, manifest schema correctness on both jj and git fixtures.
- [ ] **DOGFOOD-02**: Metrics recorded to `.planning/intel/v1.3-dogfood-metrics.md`: dispatch time, fan-in time, conflict rate, partial-wave incidence (if any). Pre-snapshot via `jj op log` + `.planning/` tarball before dogfood run; pre-snapshot recovery procedure documented.

## Out of Scope

Explicit exclusions per FEATURES + PITFALLS research and user decisions.

| Feature | Reason |
|---------|--------|
| `vcs.parallel.cancel` verb | Defer to v1.4+. Dogfood phase may reveal a need; if so, surfaces as v1.4 candidate. |
| Streaming event API on `dispatch` | Synchronous return shape suffices; streaming adds complexity without proven need. |
| Auto-cancel-siblings-on-failure | Out-of-band coordination concern; subagent layer handles via Agent() result inspection. |
| Cross-machine dispatch | Single-machine scope only. Distributed coordination is a different problem. |
| `GSD_BACKEND_KIND` env var to subagents | Re-creates `vcs.kind` branching at the agent level. Anti-feature per v1.2 unified-model invariant. |
| A3 Path C (version-probe / wait-for-upstream) | No upstream jj fix exists to gate on. Rejected by all relevant researchers. |
| Workflow call-presence lint (`vcs.parallel.*` must be called) | Differentiator deferred to v1.4 — builds on patterns not yet established. |
| `worker_threads` / `child_process.fork` in adapter | Single-threaded adapter is load-bearing per `acquireJjWriteLock` invariant. Parallelism lives at Agent() boundary, not inside the adapter. |
| `/gsd-migrate-parallelization` brownfield migration command | Subagent workspaces are ephemeral; nothing to migrate. Default-flip just changes "next time a phase has parallel plans, dispatch them in parallel." No pre-flight check needed beyond CONFIG-02's refusal-on-`false`. |
| Promotion of `octopus.ts` / `reap.ts` to cross-backend top-level | Stays jj-namespaced under `sdk/src/vcs/jj/`. Cross-backend surface is the new `parallel.*` verb composition layer, not the helpers themselves. |
| Pre-flight + warn-and-document for default-flip | Same as migration command — ephemeral state means no rich preflight is needed. CONFIG-02's explicit refusal-on-`false` is the only gate. |

## Traceability

Mapped during roadmap creation 2026-05-15. Updated 2026-05-15 after Phase 9 discuss-phase dropped PARALLEL-03 and PARALLEL-04. All 27 v1.3 requirements assigned to exactly one phase.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PARALLEL-01 | Phase 9 (jj-side) + Phase 10 (git-side, same-PR coupling on contract) | Complete |
| PARALLEL-02 | Phase 9 (jj-side) + Phase 10 (git-side, same-PR coupling on `FanInResult` shape) | Complete |
| ~~PARALLEL-03~~ | ~~Phase 9 + Phase 10~~ | **Dropped 2026-05-15 (Phase 9 D-01)** |
| ~~PARALLEL-04~~ | ~~Phase 9~~ | **Dropped 2026-05-15 (Phase 9 D-02)** |
| PARALLEL-05 | Phase 9 | Complete |
| PARALLEL-06 | Phase 11 | Pending |
| VCS-16 | Phase 9 | Complete |
| VCS-17 | Phase 9 | Complete |
| VCS-18 | Phase 10 | Pending |
| VCS-19 | Phase 9 | Complete |
| VCS-20 | Phase 11 | Pending |
| PROMPT-06 | Phase 11 | Pending |
| PROMPT-07 | Phase 11 | Pending |
| PROMPT-08 | Phase 11 | Pending |
| PROMPT-09 | Phase 11 | Pending |
| LINT-04 | Phase 13 | Pending |
| LINT-05 | Phase 13 | Pending |
| HOOK-06 | Phase 12 | Pending |
| HOOK-07 | Phase 12 | Pending |
| CI-05 | Phase 13 | Pending |
| CI-06 | Phase 13 | Pending |
| TEST-13 | Phase 9 (jj contract tests) + Phase 10 (git contract tests) | Pending |
| TEST-14 | Phase 9 | Pending |
| TEST-15 | Phase 10 | Pending |
| TEST-16 | Phase 10 | Pending |
| CONFIG-01 | Phase 14 | Pending |
| CONFIG-02 | Phase 14 | Pending |
| DOGFOOD-01 | Phase 14 | Pending |
| DOGFOOD-02 | Phase 14 | Pending |

**Note on cross-phase REQ-IDs:** PARALLEL-01, PARALLEL-02, and TEST-13 span two phases each. This reflects the must-honor sequencing constraint that the cross-backend `FanInResult` shape (PARALLEL-02 specifically) requires same-PR coupling between jj-side and git-side per v1.2 retro precedent — Phase 9 ships the jj implementation and the contract; Phase 10 ships the git implementation and finalizes the contract. Each phase has distinct deliverables (jj-side bodies + tests in Phase 9; git-side bodies + tests + N-parent octopus fixture in Phase 10) so the "exactly one phase" coverage rule is honored at the per-deliverable level even where the REQ-ID umbrella spans two.

**Coverage:**
- v1.3 requirements: 27 total (29 originally; PARALLEL-03 and PARALLEL-04 dropped at Phase 9 discuss-phase 2026-05-15)
- Mapped to phases: 27 ✓
- Unmapped: 0 ✓

**Phase distribution:**
- Phase 9 (jj parallel verbs): 7 requirements (PARALLEL-01/02/05 jj-side, VCS-16/17/19, TEST-13 jj/TEST-14)
- Phase 10 (git parallel verbs + classifier): 6 requirements (PARALLEL-01/02 git-side, VCS-18, TEST-13 git/TEST-15/TEST-16)
- Phase 11 (orchestrator + agent rewire): 6 requirements (PARALLEL-06, VCS-20, PROMPT-06..09)
- Phase 12 (A3 fix, parallel track): 2 requirements (HOOK-06, HOOK-07)
- Phase 13 (CI lane + lint close-gate): 4 requirements (CI-05, CI-06, LINT-04, LINT-05)
- Phase 14 (default flip + dogfood): 4 requirements (CONFIG-01, CONFIG-02, DOGFOOD-01, DOGFOOD-02)

---
*Requirements defined: 2026-05-15*
*Last updated: 2026-05-15 after Phase 9 discuss-phase — PARALLEL-03 + PARALLEL-04 dropped at premise level (orchestrator-awaits-Agent() invariant; octopus-topology no shared-ancestor contention). Coverage 27/27.*
