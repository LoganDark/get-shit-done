# Roadmap: GSD jj-port

**Mode:** standard
**Granularity:** coarse (5 phases)
**Created:** 2026-05-09

## Overview

Port GSD from a git-only toolkit to a dual-backend (git + jj) toolkit while preserving full upstream feature parity. The roadmap follows a strict horizontal-layers + Branch-by-Abstraction sequence: introduce the `VcsAdapter` seam with a 1:1 git backend first (Phase 1), migrate every existing git call site to that seam while still git-only (Phase 2), then land the jj backend in three layered passes — squash/refs/conflict core (Phase 3), workspaces and hooks (Phase 4), command translations and brownfield validation (Phase 5). Skipping ahead to land jj logic before the seam exists at every call site is the highest-risk anti-pattern called out in PITFALLS.md and ARCHITECTURE.md, so each phase strictly unblocks the next.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Adapter Foundation + Git Backend** - VcsAdapter interface, git-only 1:1 backend, parameterized test harness, lint guard. No call site changes. No jj code.
- [ ] **Phase 2: Bulk Call-Site Migration (Still Git-Only)** - Every `execSync('git …')` in `sdk/src/query/*.ts` and `bin/lib/*.cjs` migrated to the adapter; first upstream rebase validates the mechanical-edits hypothesis.
- [x] **Phase 3: jj Backend Core — Squash, Refs, Conflict** - Complete: 7 plans landed; jj-colocated CI lane active as allow-failure (CI-01); jj 0.41.0 backend implements every adapter contract verb (JJ-01..07, SQUASH-01..07, REFS-01..06, CONFLICT-01..03, TEST-08, CI-01..02 all Complete).
- [x] **Phase 4: Workspaces + Octopus Structure + Hooks** - Complete: 7 plans landed; jj workspace.{add,forget,prune,reap} bodies + acquireJjWriteLock RAII + lazy octopus helpers + pre-commit/pre-push hook wiring + SDK query bridge + cr-01 fold-in (WS-01..13, HOOK-01..05, CI-04 all Complete; HOOK-02/03 carry known-gap caveat re: colocated pre-commit per 04-LEARNINGS Open Q1).
- [ ] **Phase 5: Command Translations + Brownfield Validation + CI Hardening** - Every upstream command verified end-to-end on jj; workflow markdown and agent prompts rewritten; brownfield commands dogfood-validated; CI matrix graduates jj-backend to required-blocking.

## Phase Details

### Phase 1: Adapter Foundation + Git Backend
**Goal**: Land the `VcsAdapter` seam with a git-only backend and a parameterized test harness — zero behavioral change for existing call sites, zero jj code, but every future migration plugs into a stable contract.
**Depends on**: Nothing (first phase)
**Requirements**: VCS-01, VCS-02, VCS-03, VCS-04, VCS-05, VCS-06, VCS-07, GIT-01, GIT-02, GIT-03, TEST-01, TEST-02, TEST-03, TEST-04, TEST-06, TEST-07
**Success Criteria** (what must be TRUE):
  1. `createVcsAdapter(cwd, opts)` constructs a frozen plain-object adapter from `sdk/src/vcs/index.ts` with namespaced sub-objects (`vcs.commit`, `vcs.workspace.*`, `vcs.refs.*`, `vcs.hooks.*`, `vcs.gitOnly.*`), and the TS source compiles to `dist-cjs/` consumable from `bin/lib/*.cjs` via plain `require()`.
  2. The git backend at `sdk/src/vcs/backends/git.ts` answers every adapter contract method with byte-identical `{ exitCode, stdout, stderr }` to the corresponding pre-migration inline `execSync('git …')` call (snapshot diff against pre-migration behavior is empty).
  3. The `vcsTest(kind)` fixture + `describe.for([...BACKENDS])` harness exists in test helpers and runs the adapter contract suite against the `git` backend; `GSD_TEST_BACKENDS` env var selects backend subsets; CI rule "skipped-test count must not increase from main" is enforced.
  4. The lint guard "jj-backend never shells out to mutating git verbs" ships with the adapter package and fails CI on violation, even though no jj backend exists yet.
  5. `vcs.gitOnly.createAnnotatedTag()` (and other git-specific escape hatches) are reachable on the git backend; calls into `vcs.gitOnly.*` are typed such that a future jj backend errors clearly and statically when invoked.
**Plans**: 5 plans
- [x] 01-01-PLAN.md — Build pipeline (sdk/tsconfig.cjs.json, pnpm scripts, pretest hook, dist-cjs files array)
- [x] 01-02-PLAN.md — Adapter types, exec, expr, parse/git-rev, parse/jj-rev, backends, hook-bridge, index (factory + auto-detect)
- [x] 01-03-PLAN.md — Git backend implementation (sdk/src/vcs/backends/git.ts) + wire into createVcsAdapter + tests/baselines/git-vcs/ scaffold
- [x] 01-04-PLAN.md — Test harness (vitest fixture + describe.for contract suite + tests/helpers.cjs vcsTest + node --test variant + skip-count CI guard)
- [x] 01-05-PLAN.md — No-raw-git lint guard (whole-repo default-deny scanner + JSON allowlist + CI integration)

### Phase 2: Bulk Call-Site Migration (Still Git-Only)
**Goal**: Migrate every existing `execSync('git …')` call site in the SDK and CLI runtime to the adapter — still git-only — and verify the "mechanical edits = clean rebase" hypothesis with the first post-migration upstream rebase.
**Depends on**: Phase 1
**Requirements**: MIGR-01, MIGR-02, MIGR-03, MIGR-04, TEST-05, UPSTREAM-01, UPSTREAM-02, UPSTREAM-03
**Success Criteria** (what must be TRUE):
  1. Zero `execSync('git …')` (or equivalent inline git invocations) remain in non-test source under `sdk/src/query/*.ts` and `get-shit-done/bin/lib/*.cjs` — verified by repo-wide grep audit landing in the lint guard.
  2. Every existing git-touching test in `tests/` is retargeted onto the `vcs` fixture (no raw git invocations in test setup) and continues to pass against the git backend with no skipped-count regression.
  3. Each call-site migration is mechanical (Branch-by-Abstraction) — call-by-call diff swaps `execSync('git …')` for the adapter equivalent without changing surrounding logic; reviewed via per-file commit history, not bulk rewrites.
  4. The first upstream rebase performed after the migration completes with conflict count tracked and recorded in `.planning/intel/rebase-log.md` (or equivalent), and conflicts are concentrated in the adapter call-site layer (mechanical) rather than scattered across surrounding logic.
  5. `UPSTREAM-01` jj-native rebase workflow is documented in `docs/upstream-rebase.md` (or equivalent), and `sdk/src/vcs/jj/` and `sdk/src/vcs/parse/jj-*.ts` sidecar paths exist as zero-conflict surfaces (even if empty), establishing the convention before Phase 3 lands jj code.
**Plans**: 12 plans
- [x] 02-01-PLAN.md — Triage commit.test.ts:304 (gpgsign fixture fix; opens D-03/D-04 gate)
- [x] 02-02-PLAN.md — Helpers migration + day-one allowlist shrink + sdk/src/vcs/jj/ sidecar (D-09, D-13, D-15)
- [x] 02-03-PLAN.md — Adapter gap-fill: 17 forward-complete verbs + expr.range factory
- [x] 02-04-PLAN.md — Smoke-test (worktree-safety.cjs:80) + complete worktree-safety.cjs migration (D-01, D-02)
- [x] 02-05-PLAN.md — Migrate init.cjs + init.ts (byte-symmetric ports; 6 sites)
- [x] 02-06-PLAN.md — Migrate progress.ts, check-ship-ready.ts, init-runner.ts (9 sites; async→sync flip)
- [x] 02-07-PLAN.md — Migrate graphify.cjs (first expr.range consumer in production)
- [x] 02-08-PLAN.md — Migrate commit.ts + commit.test.ts (gate from 02-01 closes)
- [x] 02-09-PLAN.md — Migrate commands.cjs (1,028 LOC, 14 sites; 6 paired tests)
- [x] 02-10-PLAN.md — Migrate verify.cjs + verify.ts (1,390 + 692 LOC; cat-file/log-all/diff-name-status gap-fills)
- [x] 02-11-PLAN.md — Migrate core.cjs (LAST, largest hotspot; delete execGit helper) + UPSTREAM-03 hotspot audit
- [x] 02-12-PLAN.md — Deferred-tracker for MIGR-04 + UPSTREAM-01 (deferred to milestone-end per D-17); user sign-off 2026-05-11

### Phase 2.1: VCS Abstraction Audit — Drop Git-Only Concepts (INSERTED)

**Goal:** Reshape the cross-backend VcsAdapter type surface so it only exposes operations with a direct jj equivalent. Move git-only concepts (stage/unstage/hooks/gitDir/gitCommonDir/StatusEntry.index/currentBranch terminology/CommitInput.pathspec) to `vcs.gitOnly.*` after narrowing, or hard-remove them. Adopt change-first identifier semantics on the cross-backend surface (`expr.commit` → `expr.rev`). Mechanically refactor every caller. Still git-only — no jj backend code (Phase 3 owns that). Pre-Phase-3 cleanup that fixes what Phase 1's "forward-complete adapter" claim got wrong.
**Requirements**: None new — audit/cleanup of VCS-01..VCS-06 from Phase 1/Phase 2. Plans reference decision IDs D-01..D-22 from `02.1-CONTEXT.md`.
**Depends on:** Phase 2
**Plans:** 9/9 plans complete

Plans:
- [x] 02.1-01-PLAN.md — Shape commit: types.ts + expr.ts + parse/{git,jj}-rev.ts + backends/git.ts + hook-bridge.ts atomic (D-01..D-22)
- [x] 02.1-02-PLAN.md — Rename expr.commit → expr.rev across 46 consumer sites (D-13)
- [x] 02.1-03-PLAN.md — Rename currentBranch → currentBookmarks (string|null → string[]) across 11 sites (D-15)
- [x] 02.1-04-PLAN.md — Collapse CommitInput.pathspec onto files (WC-state-capture) + caller-side #2014 pre-probe (D-02/D-04/D-06)
- [x] 02.1-05-PLAN.md — Drop StatusEntry.index from test assertions (D-16) (no-op closure — plan 01 already removed type field, no consumers)
- [x] 02.1-06-PLAN.md — Move gitDir/gitCommonDir to vcs.gitOnly (D-18); worktree-safety.cjs primary consumer
- [x] 02.1-07-PLAN.md — Remove vcs.hooks public surface test consumers (D-07; cosmetic — Phase 4 owns internal invocation)
- [x] 02.1-08-PLAN.md — Hard-remove vcs.stage and vcs.unstage callers via Pattern E (D-03)
- [x] 02.1-09-PLAN.md — Baseline-parity sweep + allowlist re-tighten + 02.1-LEARNINGS.md (D-22, phase close)

### Phase 3: jj Backend Core — Squash, Refs, Conflict
**Goal**: Land `sdk/src/vcs/backends/jj.ts` implementing the full adapter contract with the squash-based commit model, NDJSON output parsing, bookmark refs, and in-tree conflict detection — the working-copy auto-snapshot is allowed by default and `--ignore-working-copy` is never used by adapter code.
**Depends on**: Phase 2
**Requirements**: JJ-01, JJ-02, JJ-03, JJ-04, JJ-05, JJ-06, JJ-07, SQUASH-01, SQUASH-02, SQUASH-03, SQUASH-04, SQUASH-05, SQUASH-06, SQUASH-07, REFS-01, REFS-02, REFS-03, REFS-04, REFS-05, REFS-06, CONFLICT-01, CONFLICT-02, CONFLICT-03, TEST-08, CI-01, CI-02
**Success Criteria** (what must be TRUE):
  1. Every adapter call site migrated in Phase 2 passes its full test suite against the jj backend in the parameterized matrix — `vcs.commit({ files, message })` resolves to `jj squash <files> -B @ -k -m '<message>'` (and the no-`files` form to the same minus path filter), `jj commit` is never invoked anywhere in the adapter, and revsets are translated internally so call sites never see jj-specific syntax.
  2. `vcs.refs.bookmarks.{list,create,move,delete,exists}` and `vcs.refs.{head,parent}` work end-to-end on jj with the `gsd/` namespace prefix on jj bookmarks (mirroring git branch names on the git backend), and `vcs.commit()` auto-advances the active bookmark to the new commit on both backends.
  3. `vcs.findConflicts({ scope: 'all' })` (via `jj log -r 'conflicts()'`) and `{ scope: 'working-copy' }` (via `jj st`-style inspection) correctly surface in-tree conflicts that jj's conflict-tolerant model preserves silently, and the verify gate consumes the `'all'` scope.
  4. NDJSON output parsing (`-T 'json(self) ++ "\n"' --no-graph`) for `log`, `op log`, `workspace list` is centralized in `sdk/src/vcs/parse/jj-*.ts` with snapshot tests pinned against the supported jj version range; argv-array invocation only (no shell-string concatenation), and `--repository`, `--no-pager`, `--color never`, `--quiet` are passed uniformly.
  5. CI matrix runs both backends (`git` + `jj-colocated`) with `jj` installed via release-tarball install step; jj-backend tests are gated as allow-failure (graduated to required-blocking in Phase 5); worktree-edge-case bug tests (`bug-2924/2774/3097/3099/2075/2431/2015/2388`) are re-triaged with each test's destination (jj-mapped, git-only with rationale, or carries-verbatim) recorded.
**Plans**: 7 plans
- [x] 03-01-PLAN.md — Shape commit: types/exec/backends/index/parser stubs/config/fixture/triage-doc scaffold (JJ-01/02/03/05/06, SQUASH-05)
- [x] 03-02-PLAN.md — NDJSON parsers (real impls) + jj-id translator + __vcsTestOnly snapshot/restore (JJ-04)
- [x] 03-03-PLAN.md — Refs namespace: head/parent/bookmarks CRUD + currentBookmarks + resolveShort/exists/countCommits/rootCommits/remotes (REFS-01..04, REFS-06)
- [x] 03-04-PLAN.md — Squash commit + bookmark advance + JJ-07 env (SQUASH-01..07, REFS-05, JJ-07)
- [x] 03-05-PLAN.md — Status, log, diff, findConflicts (conflicts() plural) (CONFLICT-01..03)
- [x] 03-06-PLAN.md — Push/fetch + workspace stubs + TEST-08 bug-test triage execution (TEST-08)
- [x] 03-07-PLAN.md — Wrap-up: CI matrix activation + conflict()→conflicts() doc-fix + phase-close invariants (CI-01, CI-02)

### Phase 03.1: make tests run faster (INSERTED)

**Goal:** Profile the `sdk/` vitest integration project (7 files; `sdk/src/**/*.integration.test.ts`), then apply the largest wall-clock speedup achievable without breaking semantics. Baseline + fix ship in the same phase per CONTEXT D-02. Success = ratio recorded against local M-series median-of-3 baseline; D-05 semantics gates (test-count parity, no .skip/.only/.todo added, 3x back-to-back all-pass) must all hold. Final ratio is recorded in this line after Plan 04 lands.
**Requirements**: None formally mapped (TEST-06 spirit applies — skip count must not increase, asserted manually from --reporter=json numPendingTests per CONTEXT D-05a)
**Depends on:** Phase 3
**Plans:** 5/4 plans complete

Plans:
- [x] 03.1-01-PLAN.md — Baseline harness (sdk/scripts/profile-integration.mjs) + pre-fix median-of-3 baseline data committed to .planning/intel/vitest-integration-baseline.md
- [x] 03.1-02-PLAN.md — L1 lever attempt: pool: 'threads' on integration project (with measured keep-or-revert decision per D-09)
- [x] 03.1-03-PLAN.md — L2 lever attempt: isolate: false on integration project (with pre-flip transitive-import audit + shuffle-order Pitfall 3 check + keep-or-revert per D-09)
- [x] 03.1-04-PLAN.md — Final verification: 3x median-of-3, compute pre/post ratio, write 03.1-SUMMARY.md, update this ROADMAP line with the ratio

**Cross-cutting constraints:**
- No changes to scripts/run-tests.cjs, tests/helpers.cjs, .github/workflows/test.yml, cjs `tests/*.test.cjs`, vitest unit project, or backend matrix (D-07)
- Post-flip 3-of-3 runs all reported `success: true` (D-05c flakiness gate)

### Phase 4: Workspaces + Octopus Structure + Hooks
**Goal**: Land the orchestrator-creates-heads-and-workspaces flow with lazy octopus-merge structure, batch reap of empty heads, workspace-path-safety guards, and the v1 hook strategy (Tier 1: colocated default + jj-native non-colocated direct trigger). Subagent fan-out works end-to-end on jj, and pre-commit/pre-push hooks fire at the right moments on both backends.
**Depends on**: Phase 3
**Requirements**: WS-01, WS-02, WS-03, WS-04, WS-05, WS-06, WS-07, WS-08, WS-09, WS-10, WS-11, WS-12, WS-13, HOOK-01, HOOK-02, HOOK-03, HOOK-04, HOOK-05, CI-04
**Success Criteria** (what must be TRUE):
  1. The orchestrator can dispatch a multi-subagent phase on jj where each subagent's head change and workspace are pre-created (`jj new -A parent -B merge -m 'subagent N'` + `jj workspace add -r <head_id>`), the orchestrator's main `@` sits one beyond the merge change during execution, and the `parent + merge` octopus structure is created lazily on first fan-out (single-plan phases without fan-out remain linear chains).
  2. After phase merge, the adapter automatically inspects each tracked subagent head, `jj abandon`s empty heads, surfaces non-empty heads for review, and `jj workspace forget`s each subagent workspace in a single batch reap; the phase bookmark advances exactly to the `merge` change (not one beyond).
  3. If a subagent crashes mid-work with uncommitted snapshot content, the adapter squashes the work as `'subagent N: incomplete work'` to preserve files into the head's lineage, then surfaces it for human review (no silent data loss).
  4. Workspace-path-safety guards (preserving the spirit of `bug-3097/3099`, `bug-2774`, `bug-2075`) pass on jj workspaces, and `vcs.workspace.{add,forget,list}` work uniformly on both backends with the default sibling-path layout.
  5. `vcs.hooks.fire('pre-commit', ctx)` is invoked after every `jj squash` (the sole jj commit primitive); in colocated mode the call is a no-op because git's `.git/hooks/pre-commit` fires via colocation; in non-colocated mode the adapter triggers `.githooks/pre-commit` directly post-squash; pre-push hook fires on `jj git push` via `acarapetis/jj-pre-push`-style integration; the v1 hook interface is shaped to accommodate a future Tier 2 PATH-shim wrapper without breaking change.
**UI hint**: no
**Plans**: 7 plans
- [x] 04-01-PLAN.md — Shape commit: types.ts + jj.ts workspace stubs replacement + git.ts mirror + backends.ts allowlist + CI matrix axis (jj-native lane) + fireHook export
- [x] 04-02-PLAN.md — jj workspace.add/forget/prune contract tests + vcsMultiWsTest fixture + WS-13 multi-workspace bug-audit
- [x] 04-03-PLAN.md — acquireWriteLock primitive (jj/lock.ts) + concurrent-acquire/timeout/stale-recovery tests (D-19, D-21)
- [x] 04-04-PLAN.md — workspace.reap (jj/reap.ts) + incomplete-work queue + phase-merge VcsIncompleteSubagentsError gate (D-12 corrected, D-13, D-14)
- [x] 04-05-PLAN.md — Lazy octopus helpers (jj/octopus.ts) — createPhaseStructure/createSubagentHead/createSubagentSlot using jj new -A -B --no-edit
- [x] 04-06-PLAN.md — Hook wiring: commit() pre-commit + push() pre-push + pre-push.ts inline replication + SDK query bridge (HOOK-01..05, CI-04)
- [x] 04-07-PLAN.md — cr-01 fold-in (refname validator lift + `--` separator) + Phase 4 invariant battery + REQUIREMENTS/ROADMAP/LEARNINGS close (D-24)

**Closure (2026-05-13):** All 5 success criteria affirmed via Phase 4 plans 01-07. Detailed evidence in `.planning/phases/04-workspaces-octopus-structure-hooks/04-LEARNINGS.md`. Known gap: A3 assumption refuted by plan 04-06 — jj 0.41 colocated mode does NOT auto-fire `.git/hooks/pre-commit` after `jj squash`, so the D-10 colocated no-op needs a follow-up (three fix paths in 04-LEARNINGS Open Q1; deferred as Rule 4 architectural decision for Phase 5 dogfood to surface). jj-native CI lane stays allow-failure (D-22; graduates to required-blocking in Phase 5 alongside jj-colocated per CI-01).

### Phase 5: Command Translations + Brownfield Validation + CI Hardening
**Goal**: Verify every upstream GSD command end-to-end on jj, rewrite all workflow markdown and agent prompts to be VCS-agnostic (with multi-runtime parity), validate brownfield commands by dogfooding on this very repo, and graduate the CI jj-backend lane from allow-failure to required-blocking. After this phase, the project achieves full feature parity.
**Depends on**: Phase 4
**Requirements**: CMD-01, CMD-02, CMD-03, CMD-04, CMD-05, CMD-06, CMD-07, CMD-08, CMD-09, CMD-10, CMD-11, PROMPT-01, PROMPT-02, PROMPT-03, BROWN-01, BROWN-02, CI-03
**Success Criteria** (what must be TRUE):
  1. Every CMD-* upstream command runs end-to-end on a jj-only repo with passing integration tests: `/gsd-new-project` initializes jj when `.git` is absent; `/gsd-plan-phase` and `/gsd-execute-phase` exercise the lazy octopus structure; `/gsd-quick` uses single `jj squash -B @ -k -m '…'` on the orchestrator `@` (no phase setup, no workspace, no octopus); `/gsd-undo` translates `git reset` to surgical `jj abandon <change>` per individual commit; `/gsd-pr-branch` filters out `.planning/`-only commits via revset and materializes via `jj duplicate` onto a new bookmark; `/gsd-hotfix` uses `jj new <past-change-id>` then standard squash flow with `gsd/hotfix/<id>` bookmark; `/gsd-ship` performs explicit `vcs.push()` (no auto-push); hotfix/canary/complete-milestone/multi-workspace flows preserved per upstream.
  2. All workflow markdown files (`get-shit-done/workflows/*.md` — `execute-phase.md`, `quick.md`, `complete-milestone.md`, `undo.md`, `code-review.md`, etc.) and agent definitions (`agents/*.md` — `gsd-code-fixer.md`, `gsd-executor.md`, etc.) that previously instructed shell git invocations are rewritten to use VCS-agnostic helper commands or backend-aware language; multi-runtime variants (Codex / Gemini / OpenCode) are synced in lockstep with Claude variants (no per-runtime drift).
  3. Brownfield commands (`/gsd-map-codebase`, `/gsd-import`, `/gsd-ingest-docs`, `/gsd-resume-work`, `/gsd-pause-work`, `/gsd-ship`, `/gsd-pr-branch`, `/gsd-undo`) pass integration tests against synthetic jj fixtures covering each command's decision tree; full dogfood validation against this repo's jj backend is re-bucketed to Phase 6 per CONTEXT D-31 (depends on the Phase 6 SHA→change_id rewriter).
  4. The first weekly upstream rebase performed after brownfield validation is recorded with conflict count and a brief retro; CI matrix graduates jj-backend tests from allow-failure to required-blocking; GitHub Actions workflows (`canary`, `release-sdk`, `hotfix`, `branch-cleanup`, `auto-branch`, etc.) remain git-side per CI-03 and are explicitly flagged in the docs as "stays on git — GitHub *is* git".
  5. The full v1 commitment holds: every upstream GSD command works correctly on a jj-only repo without git, with no regression in test coverage on the git side and no `.skip` accumulation on either side.
**Plans**: 8 plans (5 original + 3 gap-closure)
- [x] 05-01-PLAN.md — Foundational infra: A3 fix (D-32) + 11 new SDK query verbs + D-31 deferral edits to ROADMAP/REQUIREMENTS
- [x] 05-02-PLAN.md — Daily-driver commands (CMD-01..05): execute-phase.md + quick.md rewrites + 5 integration tests
- [x] 05-03-PLAN.md — Lifecycle commands (CMD-06..09, CMD-11): undo/complete-milestone/code-review.md + agent prompt rewrites + 6 integration tests
- [x] 05-04-PLAN.md — Brownfield commands (CMD-10): synth-planning-fixture + 5 integration tests (D-34 coverage gap documented)
- [x] 05-05-PLAN.md — CI hardening + close: 7 flake fixes + 10-green soak + matrix flip + MIGR-02 cosmetic sweep + PROMPT-03 closure
- [x] 05-06-PLAN.md — Gap closure: SDK contract fixes (CR-02 RevisionExpr cast in log/diff; WR-03 in push; CR-03 reset paths; CR-04 revert --abort) + black-box integration test against built gsd-sdk binary
- [x] 05-07-PLAN.md — Gap closure: CR-01 24-site `.data.X → .X` workflow + agent sweep across undo/complete-milestone/code-review/gsd-executor/gsd-code-fixer + CR-06 path-traversal boundary fix in code-review.md
- [x] 05-08-PLAN.md — Gap closure: REQUIREMENTS.md status-table propagation for CMD-01..11 + PROMPT-01..02 (PR-01 process gap)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Adapter Foundation + Git Backend | 5/5 | Complete | 2026-05-09 |
| 2. Bulk Call-Site Migration (Still Git-Only) | 12/12 | Plans Complete (ready for phase-level verifier) |  |
| 3. jj Backend Core — Squash, Refs, Conflict | 7/7 | Complete | 2026-05-12 |
| 4. Workspaces + Octopus Structure + Hooks | 7/7 | Complete | 2026-05-13 |
| 5. Command Translations + Brownfield Validation + CI Hardening | 0/5 | Planned (5 plans) | - |

### Phase 6: Brownfield jj Migration — greenfield jj-default + sticky vcs.adapter flip + .planning SHA→change_id rewriter

**Goal:** Make jj the default for greenfield projects whose directory is already a jj repo, and define the explicit, one-way migration path for brownfield projects. After this phase, a user who runs `/gsd-new-project` inside a directory they have already initialized as a jj repo (`.jj/` present, with or without colocated `.git/`) gets a jj-native `.planning/` config without flag-juggling; a directory without `.jj/` keeps the current git default; an existing GSD project with `.planning/` already on disk stays on its current `vcs.adapter` unless and until the user explicitly opts into the migration tool, which rewrites SHA-based identifiers in planning files to jj change_ids and flips the sticky `vcs.adapter` config.
**Requirements**: BROWN-01, BROWN-02 (re-bucketed from Phase 5 per Phase 5 CONTEXT D-31), plus Phase 6 native scope (greenfield-init policy, sticky `vcs.adapter` flip, `.planning/` SHA→change_id rewriter, explicit migration command)
**Success Criteria** (what must be TRUE):
  1. **Greenfield default-to-jj policy**: `/gsd-new-project` invoked in a directory without an existing `.planning/` AND where `.jj/` exists on disk (i.e., the user has already run `jj init` or cloned via `jj git clone` — covers both jj-native and jj-colocated modes) writes `vcs.adapter: "jj"` into the new `.planning/config.json` at init time. If `.jj/` is absent, the existing default (git) is preserved — installation of the `jj` binary alone is NOT a signal of intent. If `.planning/` already exists, see SC #2. The decision is a single check at project init, NOT a runtime branch in every command (D-33 anti-pattern guard preserved). A `jj --version` smoke check still runs after the `.jj/` detection so the path that would import jj doesn't proceed with a broken binary; failure surfaces as a clear error, not a silent fallback to git.
  2. **Brownfield git-stays-on-git invariant**: For any project where `.planning/` already exists on disk, running any GSD command MUST NOT mutate `vcs.adapter` in `.planning/config.json`. Projects without an explicit `vcs.adapter` key are treated as git (current behavior). The sticky adapter flip is only triggered by the explicit migration command in success criterion #4.
  3. **`.planning/` SHA→change_id rewriter**: A library (likely `sdk/src/vcs/format-migration/`) that walks `.planning/` files known to embed git commit SHAs (state, summaries, planning intel, debug sessions, etc. — see `.planning/intel/format-migration-targets.md` if present, or inventory during Phase 6 discuss) and rewrites each SHA to the corresponding jj change_id. Round-trip safe (idempotent on already-migrated files; no-op on files with no SHAs).
  4. **Explicit migration command (`/gsd-migrate-vcs`)** — bidirectional, current-state-aware defaults: A new top-level command that, in one atomic operation, runs the rewriter from #3 against the project's `.planning/` directory AND flips `vcs.adapter` in `config.json`. Defaults are current-state-aware: if `vcs.adapter` is `git` or absent, default `--target jj` (colocated mode); if `vcs.adapter` is `jj`, require explicit `--target git`. The migration is **bidirectional** — round-trips (e.g., git→jj→rebase→git) MUST work; the rewriter uses `vcs.jjOnly.commitIdOf` and its inverse (both already in the jj backend's runtime translators per Phase 3) for both directions. Single atomic commit per run (rewrite + adapter flip committed together); partial-failure recovery is `git restore .` / `jj abandon` to discard uncommitted changes, then re-run (rewriter is idempotent on already-migrated files). The command refuses to run if `.jj/` is absent (the project isn't a jj repo yet — user must run `jj git init --colocate` first) OR if `jj --version` fails. Prints a clear summary of files touched.
  5. **Dogfood validation (BROWN-01)**: After running the migration command in #4 against this repo, every brownfield command (`/gsd-map-codebase`, `/gsd-import`, `/gsd-ingest-docs`, `/gsd-resume-work`, `/gsd-pause-work`, `/gsd-ship`, `/gsd-pr-branch`, `/gsd-undo`) runs end-to-end with observable behavior matching an equivalent git-only sibling clone (no degradation).
  6. **First weekly rebase retro (BROWN-02)**: First weekly upstream rebase recorded post-migration with conflict count + brief retro at `.planning/intel/rebase-log.md`.
  7. **Brand-new empty directory behavior**: `/gsd-new-project` invoked in a directory with no `.planning/`, no `.git/`, AND no `.jj/` (a literal empty dir) refuses to auto-init either VCS. The user must either (a) pass an explicit `--git` or `--jj` flag, which initializes the chosen VCS and writes the corresponding `vcs.adapter` value into `config.json`, OR (b) initialize the VCS themselves first (`git init` or `jj git init --colocate`) and re-run `/gsd-new-project`, which then follows SC #1's `.jj/`-detection rule. This REPLACES upstream's silent `git init` fallback (`get-shit-done/workflows/new-project.md:108-112`) — silent fallback would now hide the migration boundary behind an invisible default. Failure mode: clear error message listing the four options.
**Depends on:** Phase 5
**Plans:** 4 plans

Plans:
- [x] 06-01-PLAN.md — Foundation: vcs.adapter schema parity (.ts + .cjs atomic per #2653) + expr.children factory + jj/git translators + has_jj on initNewProject/initIngestDocs + atomicWriteConfig export + empirical probes (A1 id-alphabet, A5 x+ direct-children)
- [x] 06-02-PLAN.md — Rewriter library: sdk/src/vcs/format-migration/ (walk + rewrite + resolve + orphan + report + run + barrel) + 4 paired tests (pure-fn rewrite, idempotency D-04, mocked-adapter orphan walk, real-jj round-trip on synth-planning-fixture)
- [x] 06-03-PLAN.md — /gsd-migrate-vcs SDK verb (current-state-aware --target defaults; --native; --force) + initMigrateVcs handler + catalog/manifest registration + workflow markdown + new-project.md greenfield gate (replaces lines 108-112 silent git init) + black-box integration test against built bin/gsd-sdk.js
- [ ] 06-04-PLAN.md — BROWN-01 sibling-clone dogfood validation (8 brownfield commands) + blocking checkpoint:human-verify gate + STATE.md memory-rule lift (Post-BROWN-01) + (conditional) in-place migration of THIS repo + BROWN-02 rebase-log.md seed

**Open questions for /gsd-discuss-phase 6:**
- Greenfield jj-default fires on `.jj/` detection. Should it ALSO require `.git/` to be present (colocated mode) for the A3 hook fix to apply, or accept non-colocated jj-only repos and accept the documented hook-firing trade-offs?
- What's the migration command's behavior if some `.planning/` SHAs no longer resolve to known change_ids (e.g., orphaned blob references from squashed-away commits)? Hard error vs. flag-and-continue vs. write-placeholder?
- Should `/gsd-new-project` print a one-line "Detected jj repo — using jj backend" banner so greenfield users see the auto-selection, or stay silent?
- Migration command naming: `/gsd-migrate-vcs`, `/gsd-vcs-migrate-to-jj`, or roll into existing `/gsd-config` with a `--migrate-to-jj` subcommand?

---
*Last updated: 2026-05-13 — Phase 5 planned (5 plans). Plans cover: P1 foundational infra (A3 D-32 fix + 11 new SDK query verbs + D-31 deferral edits moving BROWN-01/02 to Phase 6), P2 daily-driver CMD-01..05 + execute-phase.md/quick.md rewrites + 5 integration tests, P3 lifecycle CMD-06..09/11 + undo/complete-milestone/code-review + agent prompts + 6 tests (CMD-06 documents jj-destructive-undo semantic shift per Pitfall 6), P4 brownfield CMD-10 with synth-jj-fixtures + D-34 coverage-gap docs, P5 CI hardening + close (7 flake fixes + 10-green soak + required-blocking flip + MIGR-02 cosmetic sweep + PROMPT-03 trust-installer closure per D-37). Note: ROADMAP success criterion #3 will be amended by plan 05-01 per D-31 (BROWN dogfood re-bucketed to Phase 6); the legacy wording on line 149 remains in this file until 05-01 lands the edit.*
*Last updated: 2026-05-13 — Phase 4 plan execution complete (7/7). jj workspace.{add,forget,prune,reap} bodies + acquireJjWriteLock + lazy octopus helpers + pre-commit/pre-push hook wiring + SDK query bridge `gsd-sdk query hooks.fire` + cr-01 raw-bookmark argv-injection fold-in landed. WS-01..13, HOOK-01..05, CI-04 (19 IDs) all marked Complete in REQUIREMENTS.md. Known gap: A3 colocated-pre-commit empirical refutation (plan 04-06) — D-10 no-op leaves colocated users without a pre-commit path; three fix paths documented in 04-LEARNINGS Open Q1, deferred. jj-native CI lane continues as allow-failure (D-22).*
*Last updated: 2026-05-12 — Phase 3 plan execution complete (7/7). jj-colocated backend shipped: every adapter contract verb implemented; CI matrix lane active as allow-failure (CI-01 graduates to required-blocking in Phase 5); conflict()→conflicts() revset doc-bug fixed; bug-triage finalized (all 7 worktree-bug tests carries-verbatim). Format-migration tracker (03-CONTEXT.md) handed off to Phase 6.*
*Last updated: 2026-05-11 — Phase 2 plan execution complete (12/12). ROADMAP Phase 2 success criteria 4 + 5 reframing is queued in `.planning/phases/02-bulk-call-site-migration-still-git-only/02-12-DEFERRED.md` with verbatim replacement text; the next phase-transition runner applies the splice mechanically per CONTEXT D-17.*
