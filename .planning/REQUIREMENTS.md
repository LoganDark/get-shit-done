# Requirements: GSD jj-port v1.4 — Clean, consistent state for next upstream pull

**Defined:** 2026-05-24
**Core Value:** Every upstream GSD command works correctly on a jj-only repo without git — full GSD workflow on a jj backend with no degradation in behavior or test coverage.

**Milestone framing:** v1.4 drives every outstanding fork-internal todo, deferred item, and known drift to zero so the next upstream rebase lands on a clean, fully-tested, fully-documented baseline. **NOT new feature work.** Upstream pull itself is OUT OF SCOPE (separate operator action post-v1.4).

## v1.4 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Tactical Cleanup

Five `v14-*` todos from `.planning/todos/pending/` + Phase 14 code-review WR-01..05 advisories + test-flake fix. Each closes a specific deferred follow-up filed at v1.3 close (2026-05-24).

- [ ] **CLEANUP-01**: `get-shit-done/workflows/transition.md:166` HIGH-RISK site applies the `assert_clean_wc` final-gate + commit-adjacency pattern from `execute-phase.md` / `plan-phase.md` (closes `v14-transition-md-update-gap`)
- [ ] **CLEANUP-02**: Orphan `.claude/jj-workspaces/phase-*-subagent-*` FS directories are reaped on `vcs.workspace.parallel.fan-in` success branch AND via `scripts/dogfood-restore.sh` post-restore cleanup; cross-backend test via `vcs-fixture.ts` Pattern B mkdtemp covers both jj-cell and git-cell paths (closes `v14-orphan-jj-workspace-dirs`)
- [ ] **CLEANUP-03**: `scripts/dogfood-restore.sh` enforces project-root precondition before `tar -xf` via explicit assertion (e.g., `[ -f .planning/STATE.md ]`) (closes Phase 14 WR-01)
- [ ] **CLEANUP-04**: `scripts/dogfood-restore.sh` resolves the tar-overlay additive-vs-clean ambiguity — either `rm -rf .planning && tar -xf` (clean overlay) or document the asymmetry as intended (closes Phase 14 WR-02)
- [ ] **CLEANUP-05**: `sdk/src/query/workspace-parallel-dispatch.ts` validates `JSON.parse(planText)` is an array via `Array.isArray(plan)` guard; returns `{ok:false, reason:'plan_not_array'}` envelope on non-arrays (closes Phase 14 WR-03)
- [ ] **CLEANUP-06**: `--max-concurrency` accepts NaN no longer — `Number.isNaN` guard mirrors the existing `--phase` guard (closes Phase 14 WR-04)
- [ ] **CLEANUP-07**: CONFIG-02 test tmpDir leaks fixed — `afterEach(() => rm(tmpDir, {recursive: true, force: true}))` added to `describe('CONFIG-02 — parallelization_disabled')` blocks in `cmd-parallel-{jj,git}.test.ts` (closes Phase 14 WR-05; 6 leaked dirs per run eliminated)

### Test Isolation

- [ ] **TEST-17**: `sdk/src/vcs/__tests__/jj-reap.test.ts > workspace.reap > inclusion-filter` no longer times out at 5s under parallel test load — fix via per-test `it.timeout()` extension, `describe.concurrent({concurrent: false})` opt-out, or move to `*.integration.test.ts` (per vitest's existing 120s timeout project). Narrow scope per todo — `project_test_perf_pain_vitest` broader sweep stays out of scope (closes `v14-jj-reap-test-flake`)

### Deferred-Item Harvest (API Additions)

Three v1.2/v1.3 deferred items pulled in. New public verbs on `VcsAdapter`. Strict ordering: `idAlphabet` ships before `matchPrefix` (the latter consumes the former); `parallel.cancel` ships last (most invasive, benefits from CLEANUP-02 helper extraction).

- [ ] **VCS-21**: `vcs.refs.idAlphabet` public introspection on both backends — `readonly idAlphabet: string` returning `'0-9a-f'` (git) / `'k-z'` (jj). Replaces the three ad-hoc duplications in `expr.ts:41`, `format-migration/rewrite.ts:63`, `parse/jj-id.ts`. (Continues v1.2 API-01 deferral)
- [ ] **VCS-22**: `vcs.refs.matchPrefix(id: RevisionExpr, prefix: string): boolean` alphabet-aware short-prefix matching on both backends. Returns `false` when prefix's alphabet doesn't match id's alphabet (well-defined no-match, composes cleanly in user code). Throws on empty prefix (caller bug). Returns `false` on `prefix.length > id.length` (no possible match). Hex case-insensitive (matches git); k-z lower-only (matches jj). (Continues v1.2 TEST-13 deferral)

### Deferred-Item Harvest (Parallel Verb)

- [ ] **PARALLEL-07**: `vcs.workspace.parallel.cancel(handle: ParallelDispatchHandle): CancelResult` — synchronous teardown of already-materialized workspaces from a prior `dispatch` call. Composes `workspace.forget` + `rm -rf` (jj) or `worktree remove --force` (git) + `bookmarks.delete({force:true})`. Does NOT signal subagent processes (the `spawnSync` exec layer can't accept AbortSignal; Phase 9 D-01 orchestrator-awaits-Agent invariant makes mid-flight cancel a non-problem). Reuses `cleanupSubagentWorkspaces` helper extracted by CLEANUP-02. Returns rich result envelope matching `WorkspaceMergeResult` shape. Does NOT inherit the bookmark requirement (PARALLEL-08) — cancel operates on `@` and the workspace SET only. (Continues v1.3 open deferral; STACK-lens semantics per v1.4 research synthesizer recommendation — discuss-phase confirms)
- [x] **PARALLEL-08**: Parallel-dispatch bookmark optionality + detached-HEAD support. The `ParallelDispatchOpts` / `ParallelDispatchHandle` contract MUST NOT require a bookmark name. Callers MAY pass an optional `mainBookmarks?: readonly string[]` list (default `[]`) of bookmarks/branches to advance after successful fan-in; an empty list / omitted argument means no advance is performed. Both backends MUST support dispatch + fan-in when the orchestrator is on a bookmark-less change (jj) OR detached HEAD (git). The single source of truth for the merge target is `@` (jj) / current HEAD (git); bookmarks are advisory and entirely optional. Why this is an emergency gap-closure: the bookmark requirement was baked in by Phase 11 (PARALLEL-01) "D-03 atomic main-advance: REQUIRED" — but parallel dispatch is fundamentally a working-copy operation; the underlying primitives (`@-` parent creation, `@` merge on jj; `git merge --no-ff` into current HEAD on git) operate on `@`/HEAD natively. Coupling the contract to a required bookmark name blocks two legitimate states: bookmark-less jj `@` (normal jj WIP) and git detached HEAD. The contract revision restores `@` / current HEAD as the only required reference. Acceptance: SDK type change (`mainBookmark` removed; `mainBookmarks?: readonly string[]` added); jj fan-in skips `bookmark set` when list empty + all-or-nothing validation when non-empty; git fan-in works on detached HEAD (merge logic unchanged — `merge --no-ff` already detached-safe) + optionally `update-ref` per name; workflow drops `current-branch` FATAL preflight; cross-backend tests cover empty-list, detached-HEAD, and all-or-nothing-validation scenarios. (Continues v1.3 gap-closure as emergency Phase 14.1)
- [ ] **MERGE-08**: `WorkspaceMergeOpts.mainBookmark` at `sdk/src/vcs/types.ts:226` retains the required-bookmark shape PARALLEL-08 dropped from `ParallelDispatchOpts`/`ParallelDispatchHandle`. Deferred-by-design per Phase 14.1 D-03 STRICT scope: `vcs.workspace.merge` has zero non-test production callers post-Phase 11 P03 migration (the previous orchestrator-tier consumer `executeWorktreeWaveCleanupPlan` migrated to `vcs.workspace.parallel.fanIn`). The only surviving consumers are `sdk/src/vcs/__tests__/jj-workspace.test.ts:406,436` (passing valid bookmark names, both targeting the merge verb directly) plus the git-side `currentBranch !== opts.mainBookmark` detached-HEAD blocker at `backends/git.ts:680-687`. Defer revision until a real caller emerges that needs the same bookmark-less / detached-HEAD freedom Phase 14.1 granted parallel-dispatch. Same gap class as PARALLEL-08; documented as deliberate strict-scope omission. Filed during v1.4 Phase 14.1 close.

### Deferred-Item Harvest (Rename)

- [ ] **NAMING-01**: `rootCommits` → `rootRevisions` cosmetic rename across SDK adapter surface (`sdk/src/vcs/types.ts`, both backends), production callers (`get-shit-done/bin/lib/progress.ts`, `commands.cjs`), tests (5 files), baseline helper, and any `backends.ts:79`-style capability matrix string literal. Hard rename, no deprecation alias (per v1.2 `LogEntry.hash` → `LogEntry.id` precedent). Pre-rename JSON sidecar audit per Pitfall 3 to avoid v1.2 retro CR-01 (CJS-side miss after TS hard rename) repeat. (Continues v1.2 NAMING-01 deferral)

### Deferred-Item Harvest (Workflow Lint)

- [ ] **LINT-06**: `scripts/lint-vcs-parallel-call-presence.cjs` ships as new CI scanner — content-driven detection (any `.md` under `get-shit-done/workflows/` containing `workspace.parallel.dispatch` or `workspace.parallel.fan-in` literal substring in a bash/sh fence MUST also contain the paired call within the same fence-block-cluster). Hard-fail in CI on missing call (CI-blocking, mirrors `lint-vcs-no-raw-git.cjs`). Per-entry `{path|glob, reason, owner}` JSON allowlist via `scripts/lib/allowlist-parser.cjs`. Slots into `.github/workflows/parallel-e2e.yml` adjacent to existing `audit-workflow-raw-git.cjs` CI-06 step. NOT promoted to `npm pretest`. (Continues v1.3 open deferral)

### Drift Control

Lock prose claims in ARCHITECTURE.md / INVENTORY.md to live filesystem state. Tests use `node:test` (per `tests/` convention), live-scan style (no snapshots, no hardcoded counts), copy `tests/inventory-counts.test.cjs` shape verbatim.

- [ ] **DRIFT-01**: `tests/architecture-counts.test.cjs` exists and asserts ARCHITECTURE.md headline counts (commands, workflows, agents, lib modules, install.js LOC) match live filesystem `readdirSync` results across en + 4 translations (`docs/ARCHITECTURE.md`, `docs/ja-JP/ARCHITECTURE.md`, `docs/ko-KR/ARCHITECTURE.md`, `docs/pt-BR/ARCHITECTURE.md`, `docs/zh-CN/ARCHITECTURE.md`)
- [ ] **DRIFT-02**: `tests/command-count-sync.test.cjs` exists and asserts INVENTORY.md `## Commands` table row-count matches live `commands/gsd/*.md` filesystem count

### Docs Drift Cleanup (45 verify-only failures, 8 themes)

Eight themes from `/gsd:docs-update --verify-only` audit captured in `v14-docs-verify-only-followups`. Wave 1 = prose fixes (DOCS-08) before Wave 2 = drift tests (DRIFT-01/02) per Pitfall 4 ordering.

- [ ] **DOCS-01**: Replace 14 author-machine path leaks `node /Users/diego/Dev/get-shit-done/get-shit-done/bin/gsd-tools.cjs` → `$HOME/.claude/get-shit-done/bin/gsd-tools.cjs` (or relative `get-shit-done/bin/gsd-tools.cjs`) in `docs/{ja-JP,ko-KR}/superpowers/plans/2026-03-18-materialize-new-project-config.md` (theme 1)
- [ ] **DOCS-02**: Update 3 translation specs (`docs/{ja-JP,ko-KR,pt-BR}/superpowers/specs/2026-03-20-multi-project-workspaces-design.md`) to reference single `commands/gsd/workspace.md` with appropriate subcommands instead of the 3 non-existent split files (theme 2; 7 sites)
- [ ] **DOCS-03**: Reconcile ADR 0009 (`docs/adr/0009-shell-command-projection-module.md`) + ADR 0010 (`docs/adr/0010-file-operation-engine-module.md`) drift from current code — update OR add "Superseded by" notes per ADR convention (theme 3; 7 issues)
- [ ] **DOCS-04**: Fix 5 renamed-hook / missing-helper references — `gsd-read-before-edit.js` → `hooks/gsd-read-guard.js`; remove `gsd-commit-docs.js` hook claim; fix `doc-conflict-engine.md` path prefix; decide on `verify-reapply-patches.cjs` (rebuild or remove claim); fix `npm run build` (no top-level `build` script) in `docs/USER-GUIDE.md`, `docs/FEATURES.md`, `docs/AGENTS.md`, `docs/CONTRIBUTING.md`, `CHANGELOG.md` (theme 4)
- [ ] **DOCS-05**: Resolve `docs/test-triage/jj-bugs.md` references to archived phase-3 planning artifacts (`03-07-PLAN.md`, `03-RESEARCH.md`, `03-06-PLAN.md`) — either rehydrate into archive subdirectory or update doc to reference closure commits (theme 5; 3 sites)
- [ ] **DOCS-06**: Fix 3 translation date/link mismatches in pt-BR superpowers docs — rename `docs/pt-BR/superpowers/plans/2026-03-23-materialize-new-project-config.md` to `2026-03-18` (or fix link target); fix `docs/pt-BR/superpowers/README.md` L7 03-18 vs 03-23 mismatch; fix circular ref in `docs/pt-BR/superpowers/specs/2026-03-20-multi-project-workspaces-design.md` (theme 7)
- [ ] **DOCS-07**: Fix 3 singleton failures — `CHANGELOG.md:389` `mutation-subprocess.integration.test.ts` (renamed/moved); `CONTEXT.md:610` `tests/lint-no-source-grep.cjs` → `scripts/lint-no-source-grep.cjs`; `docs/ja-JP/AGENTS.md:389` `USER-PROFILE.md` qualified path (theme 8)
- [x] **DOCS-08**: Fix ARCHITECTURE.md prose-count drift across en + 4 translations (44→68 commands, 46→89 workflows, 16→33 agents, 17→60 lib modules, ~3000→10,978 install.js LOC) — forced by DRIFT-01, ships in Wave 1 before the tests RED
- [ ] **DOCS-09**: Close-gate — re-run `/gsd:docs-update --verify-only` after Wave 1+2 land and confirm pass rate ≥ 99% (allowing legitimate skip-but-flag cases)

### PROJECT.md Reconciliation

Separate workstream from docs cleanup per `/gsd-new-milestone` discuss decision.

- [ ] **PROJECT-01**: Reconcile `.planning/PROJECT.md` `### Validated` requirements against `.planning/MILESTONES.md` + archived per-phase SUMMARYs (pre-Phase-11 drift noted at v1.3 close 2026-05-24). One-shot prose sweep — NOT a recurring SDK verb (YAGNI; no second consumer). Two-pass: machine-generate truth file from MILESTONES.md headings, human-edit narrative quality per Pitfall 8.

## v2 Requirements

No deferred items being created in v1.4. This is a cleanup milestone — every prior-deferred item that's in scope was promoted here; nothing new is being deferred.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Next upstream pull itself | v1.4 ends in clean state; operator performs the pull as a separate action post-v1.4 |
| Broader test-perf sweep beyond TEST-17 | `project_test_perf_pain_vitest` longstanding pain stays deferred; only the specific `jj-reap > inclusion-filter` flake is in scope |
| New feature work | v1.4 framing is strictly cleanup, deferred-item harvest, drift control, consistency |
| Vitest 4.x upgrade | Out of v1.4 scope (breaking config-shape changes per v4 changelog); defer to v1.5+ or post-upstream-pull |
| `vcsExecAsync` async exec primitive | PARALLEL-07's cancel is synchronous teardown only; the exec surface stays `spawnSync` per `sdk/src/vcs/exec.ts:19` |
| Mid-Agent process-kill cancellation | Phase 9 D-01 orchestrator-awaits-Agent invariant makes this a non-problem in production; would require AbortController-threaded exec layer (separate milestone if ever justified) |
| New shared `scripts/lib/` module | The two existing modules (`allowlist-parser.cjs`, `glob-to-regex.cjs`) are sufficient; do NOT extract a shared "fence-aware walker" — premature abstraction; two consumers do not justify a third file |
| Promoting any new lint to `npm pretest` | All new lints (LINT-06) go to `parallel-e2e.yml` only — matches LINT-04 placement |
| `countCommits` → `countRevisions` rename | NAMING-01 covers `rootCommits` only; `countCommits` is semantically different concept (counts vs identifies); leave as-is |
| `command-count-sync.test.cjs` merge into `architecture-counts.test.cjs` | User explicitly chose "Implement both tests" at scoping; implementation may elect one-file-with-two-describes during plan-phase if planner judgment, but REQ-IDs track two test scopes |
| ADR backfill / rehydration | DOCS-03 closes drift by reconciling or supersession-marking ADRs; full re-derivation of archived phase-3 artifacts is out of scope (DOCS-05 picks update-to-closure-commits path) |

## Traceability

Which phases cover which requirements. Updated during roadmap creation 2026-05-23.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PARALLEL-08 | Phase 14.1 (plan 14.1-01) | Complete |
| MERGE-08 | (deferred — v1.5+) | Deferred |
| NAMING-01 | Phase 15 (plan 15.01) | Pending |
| VCS-21 | Phase 15 (plan 15.02) | Pending |
| VCS-22 | Phase 15 (plan 15.03) | Pending |
| PARALLEL-07 | Phase 15 (plan 15.04) | Pending |
| LINT-06 | Phase 16 (plan 16.01) | Pending |
| CLEANUP-02 | Phase 16 (plan 16.02) | Pending |
| DOCS-08 | Phase 17 (plan 17.01) | Complete |
| DRIFT-01 | Phase 17 (plan 17.02) | Pending |
| DRIFT-02 | Phase 17 (plan 17.02) | Pending |
| DOCS-01 | Phase 17 (plan 17.03) | Pending |
| DOCS-02 | Phase 17 (plan 17.03) | Pending |
| DOCS-03 | Phase 17 (plan 17.03) | Pending |
| DOCS-04 | Phase 17 (plan 17.03) | Pending |
| DOCS-05 | Phase 17 (plan 17.03) | Pending |
| DOCS-06 | Phase 17 (plan 17.03) | Pending |
| DOCS-07 | Phase 17 (plan 17.03) | Pending |
| DOCS-09 | Phase 17 (plan 17.03) | Pending |
| PROJECT-01 | Phase 17 (plan 17.04) | Pending |
| CLEANUP-01 | Phase 18 (plan 18.01) | Pending |
| CLEANUP-03 | Phase 18 (plan 18.02) | Pending |
| CLEANUP-04 | Phase 18 (plan 18.02) | Pending |
| CLEANUP-05 | Phase 18 (plan 18.02) | Pending |
| CLEANUP-06 | Phase 18 (plan 18.02) | Pending |
| CLEANUP-07 | Phase 18 (plan 18.02) | Pending |
| TEST-17 | Phase 18 (plan 18.03) | Pending |

**Coverage:**

- v1.4 requirements: 26 total
- Mapped to phases: 26 ✓
- Unmapped: 0 ✓

**Phase distribution:**

- Phase 14.1 (Drop mandatory bookmark on parallel dispatch + fan-in): 1 requirement (PARALLEL-08)
- Phase 15 (Adapter surface extensions + rename): 4 requirements (NAMING-01, VCS-21, VCS-22, PARALLEL-07)
- Phase 16 (Workflow + invariant tooling): 2 requirements (LINT-06, CLEANUP-02)
- Phase 17 (Drift control + reconciliation): 12 requirements (DOCS-08, DRIFT-01, DRIFT-02, DOCS-01..07, DOCS-09, PROJECT-01)
- Phase 18 (Tactical cleanup + test-flake): 7 requirements (CLEANUP-01, CLEANUP-03..07, TEST-17)

---
*Requirements defined: 2026-05-24*
*Last updated: 2026-05-23 — Traceability table filled in during v1.4 roadmap creation (4 phases, 13 plans, 25 requirements mapped 100%, no orphans). Phase shape per research synthesis with one clarification: PARALLEL-07's plan extracts the `cleanupSubagentWorkspaces` shared helper as its Wave 1, consumed by Phase 16 CLEANUP-02 (single-owner per IP-5).*
