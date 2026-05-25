# PROJECT-VALIDATED-TRUTH

**Generated:** 2026-05-25
**Generator:** Phase 17.04 inline computation (NOT a recurring script — REQUIREMENTS.md PROJECT-01 OOS clause; see plan decision PROJECT-01-form)
**Source:**

- `.planning/REQUIREMENTS.md` (v1.4 active milestone)
- `.planning/milestones/v1.1-REQUIREMENTS.md` (covers v1.0 + v1.1 REQ-IDs)
- `.planning/milestones/v1.2-REQUIREMENTS.md`
- `.planning/milestones/v1.3-REQUIREMENTS.md`
- `.planning/STATE.md` (status snapshot)
- `.planning/MILESTONES.md` (shipped-milestone summaries)

**Status taxonomy:**

- ✓ Validated (shipped + verified)
- ⏳ Pending (not yet shipped; future phase)
- ⏸️ Deferred-by-design (intentionally not shipped; v1.5+ candidate)

---

## v1.0 — Dual-backend foundation (Shipped 2026-05-14, 8 phases, 53/56 plans)

86 REQ-IDs validated. Per `.planning/milestones/v1.1-REQUIREMENTS.md` Traceability table; per-phase distribution in v1.1-REQUIREMENTS.md footer.

### Adapter Foundation (Phase 1) — 7 REQ-IDs

- ✓ **VCS-01** — `VcsAdapter` interface in `sdk/src/vcs/types.ts` (Phase 1.02)
- ✓ **VCS-02** — `createVcsAdapter(cwd, opts)` factory with namespaced sub-objects (Phase 1.02)
- ✓ **VCS-03** — Backend auto-detection (`.jj` first, `.git` fallback, `GSD_VCS` env) (Phase 1.02)
- ✓ **VCS-04** — Single spawn wrapper in `sdk/src/vcs/exec.ts` (Phase 1.02)
- ✓ **VCS-05** — `RevisionExpr` canonical revset/ref primitive (Phase 1.02)
- ✓ **VCS-06** — TypeScript-first with CJS build target to `dist-cjs/` (Phase 1)
- ✓ **VCS-07** — Lint guard "jj-backend never shells out to mutating git verbs" (Phase 1.05)

### Git Backend (Phase 1) — 3 REQ-IDs

- ✓ **GIT-01** — `sdk/src/vcs/backends/git.ts` 1:1 git-only baseline (Phase 1.03)
- ✓ **GIT-02** — Byte-identical `{exitCode, stdout, stderr}` for migrated call sites (Phase 1.03)
- ✓ **GIT-03** — `vcs.gitOnly.*` escape hatches (Phase 1.03)

### Call-Site Migration (Phase 2) — 4 REQ-IDs

- ✓ **MIGR-01** — All `execSync('git …')` in `sdk/src/query/*.ts` migrated (Phase 2)
- ✓ **MIGR-02** — All `execSync('git …')` in `get-shit-done/bin/lib/*.cjs` migrated (cosmetic sweep landed Phase 5 plan 05-05) (Phase 2)
- ✓ **MIGR-03** — Migration is mechanical (Branch-by-Abstraction) (Phase 2)
- ✓ **MIGR-04** — First upstream rebase post-migration verifies "mechanical edits = clean rebase" hypothesis (recorded as deferred per Phase 2 plan 02-12) (Phase 2)

### jj Backend (Phase 3) — 7 REQ-IDs

- ✓ **JJ-01** — `sdk/src/vcs/backends/jj.ts` against `jj` binary (Phase 3.01)
- ✓ **JJ-02** — jj invocations always pass `--repository`, `--no-pager`, `--color never`, `--quiet`; argv-only (Phase 3.01)
- ✓ **JJ-03** — Defaults to allowing WC auto-snapshot; `--ignore-working-copy` NEVER passed (Phase 3.01)
- ✓ **JJ-04** — NDJSON output parsing via `-T 'json(self) ++ "\n"' --no-graph` (Phase 3.02)
- ✓ **JJ-05** — jj binary discovery at adapter construction (Phase 3.01)
- ✓ **JJ-06** — jj version is "track latest, no floor" (Phase 3.01)
- ✓ **JJ-07** — `JJ_USER` / `JJ_EMAIL` env propagated (Phase 3.04)

### Squash Commit Model (Phase 3) — 7 REQ-IDs

- ✓ **SQUASH-01** — `vcs.commit({files,message})` on jj implements as `jj squash <files> -B @ -k -m` (Phase 3.04)
- ✓ **SQUASH-02** — `vcs.commit({message})` (no files) squashes all `@` content into commit before `@` (Phase 3.04)
- ✓ **SQUASH-03** — Unchanged paths in `files` faithfully included in squash (Phase 3.04)
- ✓ **SQUASH-04** — `@`'s description preserved post-squash (Phase 3.04)
- ✓ **SQUASH-05** — `jj commit` NEVER used; squash is sole commit primitive (Phase 3.01, re-verified 3.04 + 3.07)
- ✓ **SQUASH-06** — Conflicted state surfaced via return value; no auto-resolve/undo (Phase 3.04)
- ✓ **SQUASH-07** — `.planning/*` + code paths squashed together in single commit (Phase 3.04)

### Refs + Bookmarks (Phase 3) — 6 REQ-IDs

- ✓ **REFS-01** — `vcs.refs.head` returns `RevisionExpr` (Phase 3.03)
- ✓ **REFS-02** — `vcs.refs.parent` returns `@-` (Phase 3.03)
- ✓ **REFS-03** — Full bookmarks API (`list/create/move/delete/exists`) (Phase 3.03)
- ✓ **REFS-04** — `gsd/` namespace prefix on jj bookmarks (Phase 3.03)
- ✓ **REFS-05** — `vcs.commit()` auto-advances active bookmark (Phase 3.04)
- ✓ **REFS-06** — Tags on jj = named bookmarks under `gsd/release/<version>` (Phase 3.03)

### Conflict Detection (Phase 3) — 3 REQ-IDs

- ✓ **CONFLICT-01** — `vcs.findConflicts({scope:'all'})` (Phase 3.05; doc-fix `conflict()→conflicts()` Phase 3.07)
- ✓ **CONFLICT-02** — `vcs.findConflicts({scope:'working-copy'})` (Phase 3.05)
- ✓ **CONFLICT-03** — Verify gate uses `scope:'all'` (Phase 3.05)

### Workspaces + Octopus + Path Safety (Phase 4) — 13 REQ-IDs

- ✓ **WS-01** — `vcs.workspace.add(path,{atRevision})` (Phase 4.01, 4.02)
- ✓ **WS-02** — `vcs.workspace.forget(path)` cleanup (Phase 4.01, 4.02)
- ✓ **WS-03** — `vcs.workspace.list()` with `@` change IDs (Phase 4.01, 4.02)
- ✓ **WS-04** — Default workspace path layout siblings of main repo (Phase 4.01, 4.02)
- ✓ **WS-05** — Lazy phase setup; parent+merge octopus created on first dispatch (Phase 4.05)
- ✓ **WS-06** — Orchestrator pre-creates each subagent's head change + workspace (Phase 4.05)
- ✓ **WS-07** — Orchestrator tracks subagent head change IDs for reaping (Phase 4.05)
- ✓ **WS-08** — Plans within a phase use same octopus structure recursively (Phase 4.05)
- ✓ **WS-09** — Phase bookmark advances to `merge` change (Phase 4.05)
- ✓ **WS-10** — Orchestrator's main workspace `@` sits one beyond `merge` (Phase 4.05)
- ✓ **WS-11** — Auto reap post-phase: `jj show` → `jj abandon` if empty → `jj workspace forget` (Phase 4.04)
- ✓ **WS-12** — Crashed-subagent uncommitted work squashed as `'subagent N: incomplete work'` (Phase 4.03, 4.04)
- ✓ **WS-13** — Workspace-path-safety guards against jj workspaces (preserves bug-3097/3099/2774/2075 spirit) (Phase 4.02)

### Hooks (Phase 4) — 5 REQ-IDs

- ✓ **HOOK-01** — `vcs.hooks.fire(stage, ctx)` primitive (Phase 4.06)
- ✓ **HOOK-02** — Hook trigger on jj after each `jj squash` (Phase 4.06; jj-native verified; colocated gap surfaced as 04-LEARNINGS A3, **CLOSED in v1.3 Phase 12 via HOOK-06**)
- ✓ **HOOK-03** — Tier 1 colocated no-op + non-colocated direct shell of `.githooks/<stage>` (Phase 4.06; **A3 closed v1.3 Phase 12**)
- ✓ **HOOK-04** — Pre-push hook integration on `jj git push` (Phase 4.06)
- ✓ **HOOK-05** — Tier 2 `jj-with-hooks` PATH wrapper deferred to v2 per HOOK2-01 (Phase 4.06)

### Test Infrastructure (Phases 1+3) — 8 REQ-IDs

- ✓ **TEST-01** — `vcsTest(kind)` parameterized fixture (Phase 1)
- ✓ **TEST-02** — `test.extend({vcs, cwd})` per-test backend + isolated tmp WD (Phase 1)
- ✓ **TEST-03** — Backend matrix `git`, `jj-colocated`, `jj-native` (Phase 1)
- ✓ **TEST-04** — `GSD_TEST_BACKENDS` env var selector (Phase 1)
- ✓ **TEST-05** — All ~80 git-touching tests migrated to `vcs` fixture (Phase 2)
- ✓ **TEST-06** — CI rule: skip count must not increase from `main` (Phase 1)
- ✓ **TEST-07** — Test fixtures support both git + jj initial states (Phase 1)
- ✓ **TEST-08** — Worktree-edge-case bug tests re-triaged (Phase 3.06)

### Command-Level Translations (Phase 5) — 11 REQ-IDs

- ✓ **CMD-01** — `/gsd-new-project` on jj-only repo (Phase 5.02)
- ✓ **CMD-02** — `/gsd-plan-phase` end-to-end on jj (Phase 5.02)
- ✓ **CMD-03** — `/gsd-execute-phase` orchestrator + octopus merge (Phase 5.02)
- ✓ **CMD-04** — `/gsd-discuss-phase`, `/gsd-verify-work`, `/gsd-complete-milestone` (Phase 5.02 + 5.03 + 5.06 + 5.07)
- ✓ **CMD-05** — `/gsd-quick` single-squash bypass (Phase 5.02)
- ✓ **CMD-06** — `/gsd-undo` translates `git reset` to surgical `jj abandon` (Phase 5.03 + 5.06 + 5.07)
- ✓ **CMD-07** — `/gsd-pr-branch` revset-filtered `jj duplicate` onto new bookmark (Phase 5.03)
- ✓ **CMD-08** — `/gsd-hotfix` via `jj new <past-change-id>` + bookmark + push (Phase 5.03 + 5.06 + 5.07)
- ✓ **CMD-09** — `/gsd-ship` explicit `vcs.push()` + bookmark-based release tags (Phase 5.03 + 5.06 + 5.07)
- ✓ **CMD-10** — `/gsd-resume-work`, `/gsd-pause-work`, `/gsd-import`, `/gsd-ingest-docs`, `/gsd-map-codebase` on jj (Phase 5.04)
- ✓ **CMD-11** — Hotfix, canary, complete-milestone, multi-workspace flows preserved (Phase 5.03 + 5.06 + 5.07)

### Workflow + Agent Prompt Rewrites (Phase 5) — 3 REQ-IDs

- ✓ **PROMPT-01** — Workflow markdown VCS-agnostic across execute-phase, quick, undo, complete-milestone, code-review (Phase 5.02 + 5.03 + 5.07)
- ✓ **PROMPT-02** — Agent definitions VCS-agnostic across gsd-executor + gsd-code-fixer (Phase 5.03 + 5.07)
- ✓ **PROMPT-03** — Multi-runtime variants via `bin/install.js` transform pipeline (Phase 5.05)

### Brownfield Priority (Phase 6) — 2 REQ-IDs

- ✓ **BROWN-01** — Brownfield commands verified against this repo (Phase 6)
- ✓ **BROWN-02** — First weekly upstream rebase recorded (Phase 6)

### Greenfield + Migration (Phase 6) — 3 REQ-IDs

- ✓ **GREEN-01..03** — Greenfield jj defaults + brownfield-stays-on-git invariant + `/gsd-migrate-vcs` (Phase 6; per PROJECT.md narrative)

### Upstream Tracking (Phase 2) — 3 REQ-IDs

- ✓ **UPSTREAM-01** — jj-native rebase workflow documented (recorded as deferred to milestone-end task per Phase 2 plan 02-12) (Phase 2)
- ✓ **UPSTREAM-02** — Fork-specific code organized in sidecar files (`sdk/src/vcs/jj/`, parse/jj-*.ts) for zero-conflict surface (Phase 2)
- ✓ **UPSTREAM-03** — Hotspot files only see adapter call-site swaps inline (Phase 2)

### CI / Release (Phases 3+4+5) — 4 REQ-IDs

- ✓ **CI-01** — CI matrix runs both backends; jj-colocated graduates to required-blocking (Phase 3.07 allow-failure → Phase 5)
- ✓ **CI-02** — jj install via release tarballs (Phase 3.07)
- ✓ **CI-03** — GitHub Actions stay on git per architectural boundary (Phase 5.05)
- ✓ **CI-04** — Pre-push validation via `vcs.hooks.fire('pre-push')` (Phase 4.06)

---

## v1.1 — first upstream sync (Shipped 2026-05-14, 1 phase / Phase 7, 5/5 plans)

14 REQ-IDs validated.

### Adapter Verbs (Phase 7) — 8 REQ-IDs

- ✓ **VCS-08** — `refs.bookmarks.currentIn(cwd): string[]` scoped current-bookmark probe (Phase 7.01)
- ✓ **VCS-09** — `refs.mergeBase(a, b)` returns `change_id` on jj via `fork_point(x)` revset; `commit_id` on git (Phase 7.01)
- ✓ **VCS-10** — `diff({diffFilter})` typed enum (`'added'|'modified'|'deleted'|'renamed'|'typechange'`) (Phase 7.01)
- ✓ **VCS-11** — `status({cwd})` optional scoped cwd (Phase 7.01)
- ✓ **VCS-12** — `workspace.merge` 2-parent `jj new` with atomic main-bookmark advance + agent-bookmark delete (D-03) (Phase 7.01)
- ✓ **VCS-13** — `workspace.remove(path, {force})` composite forget+rm (Phase 7.01)
- ✓ **VCS-14** — `refs.bookmarks.delete(name, {force})` extends with force flag (Phase 7.01)
- ✓ **VCS-15** — `refs.readBlob(rev, path)` (8th-verb fold-in per planner judgment on RESEARCH Open Q4) (Phase 7.01)

### Wave-Cleanup Executor (Phase 7) — 1 REQ-ID

- ✓ **WAVE-01** — `executeWorktreeWaveCleanupPlan` rewired through new verbs (Phase 7.02)

### Workflow Hard-Delete (Phase 7) — 1 REQ-ID

- ✓ **PROMPT-04** — Workflow .md raw-git `else`-branch fallbacks deleted (-242 LOC) (Phase 7.03)

### Cross-Backend Migration (Phase 7) — 1 REQ-ID

- ✓ **MIGR-05** — `scripts/changeset/github-release-notes.cjs` migrated to cross-backend adapter (Phase 7.04)

### Upstream Test-Surface Triage (Phase 7) — 3 REQ-IDs

- ✓ **TEST-09** — installer-migration test surfaces green on both backends (Phase 7.05)
- ✓ **TEST-10** — shell-command-projection + bug-3413/3441/3442 green on both backends (Phase 7.05)
- ✓ **TEST-11** — `query-raw-output-projection.test.ts` green on both backends (Phase 7.05)

---

## v1.2 — jujutsu is change-only (Shipped 2026-05-15, 1 phase / Phase 8, 3/3 plans)

14 REQ-IDs validated.

### Audit (Phase 8) — 4 REQ-IDs

- ✓ **AUDIT-01** — Whole-repo `commit_id` namespace audit in `sdk/src/`; verdict enum (safe/flip-clean/needs-rename/needs-resolveShort/boundary-io/historical-prose/unclear) (Phase 8)
- ✓ **AUDIT-02** — Audit of `get-shit-done/bin/lib/*.cjs` + `scripts/` (Phase 8)
- ✓ **AUDIT-03** — Audit of `sdk/src/vcs/__tests__/` + `tests/__tools__/` (Phase 8)
- ✓ **AUDIT-04** — Audit of `get-shit-done/workflows/*.md`, `commands/*.md`, agent prompts, `.planning/` prose (Phase 8)

### Surface Flip (Phase 8) — 4 REQ-IDs

- ✓ **FLIP-01** — 7 jj backend template flips + 3 NDJSON parser flips (Phase 8)
- ✓ **FLIP-02** — `LogEntry.hash` → `LogEntry.id` hard rename (no alias) (Phase 8)
- ✓ **FLIP-03** — `CommitResult.hash` → `CommitResult.id` hard rename (no alias) (Phase 8)
- ✓ **FLIP-04** — PITFALL 1 doc inverted to positive-contract (Phase 8)

### Lint Guard (Phase 8) — 3 REQ-IDs

- ✓ **LINT-01** — `scripts/lint-vcs-no-commit-id.cjs` default-deny + per-entry allowlist (Phase 8)
- ✓ **LINT-02** — Per-entry `{path|glob, reason, owner}` allowlist schema; `expires` dropped repo-wide per D-04 (Phase 8)
- ✓ **LINT-03** — Resolved as verified end state: 2 boundary-io sites under 5-site threshold; `jj-internal.ts` NOT created; SEED-001 "no escape hatch" inversion holds (Phase 8)

### Workflow Refactor (Phase 8) — 1 REQ-ID

- ✓ **PROMPT-05** — Zero `vcs.kind === 'jj'` id-reason branches deleted (set was empty per audit); 4 KEEP sites annotated with non-id reasons (Phase 8)

### Test Infrastructure (Phase 8) — 1 REQ-ID

- ✓ **TEST-12** — Vitest `toBeIdOf(kind)` custom matcher via `expect.extend` (D-02 form) (Phase 8)

### .planning/ Format Pass (Phase 8) — 1 REQ-ID

- ✓ **MIGR-06** — Close-gate `.planning/` rewriter at `scripts/migr-06-close-gate.cjs`; idempotent; one-time prose hex grep with 10 grandfathered hits (Phase 8)

---

## v1.3 — jj octopus merge for subagents (Shipped 2026-05-24, 6 phases / Phases 9–14, 34 plans)

27 REQ-IDs validated. (29 originally; PARALLEL-03 + PARALLEL-04 dropped at Phase 9 discuss-phase 2026-05-15.)

### Cross-Backend Parallel-Dispatch Verbs (Phases 9+10+11) — 4 REQ-IDs

- ✓ **PARALLEL-01** — `vcs.workspace.parallel.dispatch(plan): ParallelDispatchHandle` on both backends (Phase 9 jj-side + Phase 10 git-side)
- ✓ **PARALLEL-02** — `vcs.workspace.parallel.fanIn(handle, results): FanInResult` on both backends (Phase 9 jj-side + Phase 10 git-side)
- ✓ **PARALLEL-05** — `baseRev` JSDoc documents stability semantics across `jj rebase` (Phase 9)
- ✓ **PARALLEL-06** — `dispatch({plan, maxConcurrency})` numeric cap honored (Phase 11)

(PARALLEL-03 + PARALLEL-04 dropped at Phase 9 discuss-phase per D-01/D-02 — orchestrator-awaits-Agent() makes liveness scenario impossible; octopus topology gives each subagent distinct change.)

### Backend Implementations (Phases 9+10+11) — 5 REQ-IDs

- ✓ **VCS-16** — New `VcsWorkspaceParallel` interface in types.ts (Phase 9)
- ✓ **VCS-17** — New `sdk/src/vcs/jj/parallel.ts` composition layer (Phase 9)
- ✓ **VCS-18** — New `sdk/src/vcs/git/parallel.ts` adapter-internal entry (Phase 10)
- ✓ **VCS-19** — `WAVE_WORKTREE_MANIFEST` schema extension (Phase 9)
- ✓ **VCS-20** — `gsd-sdk query workspace.assert-dispatched-cwd` SDK verb (Phase 11)

### Workflow + Agent Rewire (Phase 11) — 4 REQ-IDs

- ✓ **PROMPT-06** — `execute-phase.md` raw-git block deleted (~290 LOC) (Phase 11)
- ✓ **PROMPT-07** — `quick.md` raw-git block deleted (~150 LOC) (Phase 11)
- ✓ **PROMPT-08** — `gsd-executor.md` worktree-aware blocks collapsed to `workspace.assert-dispatched-cwd` query (Phase 11)
- ✓ **PROMPT-09** — `worktree-path-safety.md` renamed to `dispatch-cwd-safety.md` (Phase 11)

### A3 Colocated Pre-Commit Fix (Phase 12) — 2 REQ-IDs

- ✓ **HOOK-06** — A3 colocated pre-commit fix landed; jj 0.41 colocated `jj squash` reliably fires `.githooks/pre-commit` (Phase 12; closes v1.0 Phase 4 04-LEARNINGS Open Q1)
- ✓ **HOOK-07** — Regression test on colocated jj fixture; fires exactly once; `GSD_HOOK_SKIP_COLOCATED` env opt-out (Phase 12)

### Lint Close-Gate (Phase 13) — 2 REQ-IDs

- ✓ **LINT-04** — `scripts/audit-workflow-raw-git.cjs` baseline-regression guard; frozen 127-hit per-file baseline; 7-case node:test unit test (Phase 13)
- ✓ **LINT-05** — `lint-vcs-no-raw-git.allow.json` net +0/+1 budget (Phase 13)

### CI Parallel-Path Lane (Phase 13) — 2 REQ-IDs

- ✓ **CI-05** — New `parallel-e2e` CI matrix lane on both backends; required-blocking on jj-colocated (Phase 13)
- ✓ **CI-06** — `parallel-e2e` runs LINT-04 audit script (Phase 13)

### Test Infrastructure (Phases 9+10) — 4 REQ-IDs

- ✓ **TEST-13** — Cross-backend contract tests at `cmd-parallel-{git,jj}.test.ts` (Phase 9 jj-side + Phase 10 git-side)
- ✓ **TEST-14** — Topology assertion: post-fan-in `divergent()` MUST be empty on jj (Phase 9)
- ✓ **TEST-15** — git per-branch loop happy-path: N successful 2-parent merges for N ∈ {2,3,4} (Phase 10)
- ✓ **TEST-16** — Pattern B random-prefix mkdtemp; no `retry: N`; no skip-count regressions (Phase 10)

### Default Config Flip (Phase 14) — 2 REQ-IDs

- ✓ **CONFIG-01** — Install template default `parallelization` flipped `false` → `true` (Phase 14)
- ✓ **CONFIG-02** — `parallel.dispatch` pre-flight refuses on `parallelization: false`; fourth validation envelope (Phase 14)

### Dogfood Validation (Phase 14) — 2 REQ-IDs

- ✓ **DOGFOOD-01** — 2-3 synthetic plans on isolated bookmark `gsd/phase-14-dogfood`; clean fan-in (no `divergent()`); manifest schema correctness (Phase 14)
- ✓ **DOGFOOD-02** — Metrics recorded to `.planning/intel/v1.3-dogfood-metrics.md`; pre-snapshot recovery procedure documented (Phase 14)

---

## v1.4 — Clean, consistent state for next upstream pull (CURRENT MILESTONE)

26 REQ-IDs total per `.planning/REQUIREMENTS.md` Traceability table (MERGE-08 listed but Deferred-by-design). All status as of 2026-05-25.

### Shipped (as of 2026-05-25)

**Phase 14.1 — emergency gap-closure (Shipped 2026-05-24, 1/1 plans):**

- ✓ **PARALLEL-08** — Drop mandatory `mainBookmark: string` on `ParallelDispatch{Opts,Handle}`; replaced with optional `mainBookmarks?: readonly string[]` (default `[]` → no advance); bookmark-less jj `@` and detached-HEAD git first-class for parallel dispatch + fan-in; jj fan-in two-pass all-or-nothing validate+advance; git fan-in STEP 1.5 post-merge `update-ref` per-name loop guarded on `!conflicted`; workflow `current-branch` FATAL preflight removed (Phase 14.1 plan 14.1-01)

**Phase 15 — adapter surface extensions + rename (Shipped 2026-05-24, 4/4 plans, 5/5 SC):**

- ✓ **NAMING-01** — v1.2-deferred `rootCommits` → `rootRevisions` cosmetic rename across 35 in-scope `.ts`/`.cjs`/`.js` hits; capability matrix string literal at `sdk/src/vcs/backends.ts:79` flipped; 5 historical-prose `.md` carve-outs per D-13; pre-rename JSON sidecar audit (Phase 15 plan 15.01)
- ✓ **VCS-21** — `vcs.refs.idAlphabet` public introspection; opaque `readonly string` (`'0-9a-f'` git / `'k-z'` jj) per CF-03 (Phase 15 plan 15.02)
- ✓ **VCS-22** — `vcs.refs.matchPrefix(id, prefix): boolean` alphabet-aware probe; CF-04 throwing contract; 10-case 5-rule × 2-backend cross-product test (Phase 15 plan 15.03)
- ✓ **PARALLEL-07** — `vcs.workspace.parallel.cancel(handle): CancelResult` synchronous-teardown verb; 4-field envelope `{abandoned, failedReaped, surplusBookmarks, surplusWorkspaces}`; D-03 idempotency invariant; shared `cleanupSubagentWorkspaces` 3-arg helper extracted to UPSTREAM-02 sidecar at `sdk/src/vcs/jj/workspace-cleanup.ts`; CF-07 three-site CLI registration (Phase 15 plan 15.04)

**Phase 16 — workflow + invariant tooling (Shipped 2026-05-25, 2/2 plans, 5/5 SC, 11/11 must_haves):**

- ✓ **LINT-06** — `scripts/lint-vcs-parallel-call-presence.cjs` FILE-level bidirectional pairing of `workspace.parallel.dispatch` ⇔ `workspace.parallel.fan-in` in bash/sh/zsh shell fences under `get-shit-done/workflows/`; fence-walker regex byte-identical to `audit-workflow-raw-git.cjs:48-49` per CF-06; per-entry allowlist `{path, reason, owner}` with `expires` actively rejected per `feedback_solo_dev_no_expires`; 5 D-14 fixture scenarios including Pitfall 7 prose-only false-positive guard; CI step adjacent to existing CI-06 audit in `parallel-e2e.yml` (Phase 16 plan 16.01)
- ✓ **CLEANUP-02** — Orphan FS dir reap closing v14-orphan-jj-workspace-dirs gap; TWO consumer call sites of the Phase 15 PARALLEL-07-extracted `cleanupSubagentWorkspaces` helper: (1) TS-direct from `performJjParallelFanIn` clean-path; CR-01 follow-up filters `crashedAgentIds` so W3 (a) preservation contract covers mixed-clean-with-crashed; (2) CLI bridge from `scripts/dogfood-restore.sh` via new `gsd-sdk query cleanup-subagent-workspaces` with `--phase <N>` OR `--all-phases`; conflicted-branch UNCHANGED per W3 (a) / CF-03 / AP-5; single owner per IP-5 (Phase 16 plan 16.02)

**Phase 17 — drift control + reconciliation (Shipped 2026-05-25, IN PROGRESS through plan 17.04):**

- ✓ **DOCS-08** — Fixed ARCHITECTURE.md prose-count drift across en + 4 translations (44→68 commands, 46→89 workflows, 16→33 agents, 17→60 lib modules, ~3000→10,978 install.js LOC) — landed Wave 1 before DRIFT-01/02 tests so they pass day-1 GREEN per Pitfall 4 (Phase 17 plan 17.01)
- ✓ **DRIFT-01** — `tests/architecture-counts.test.cjs` exists; asserts ARCHITECTURE.md headline counts match live filesystem `readdirSync` results across en + 4 translations (Phase 17 plan 17.02)
- ✓ **DRIFT-02** — `tests/command-count-sync.test.cjs` exists; asserts INVENTORY.md `## Commands` table row-count matches live `commands/gsd/*.md` count (Phase 17 plan 17.02)
- ✓ **DOCS-01** — Replaced 14 author-machine path leaks `node /Users/diego/Dev/get-shit-done/…` → `$HOME/.claude/get-shit-done/…` in ja-JP + ko-KR superpowers plans (Phase 17 plan 17.03)
- ✓ **DOCS-02** — Updated 3 translation specs (ja-JP, ko-KR, pt-BR) to reference single `commands/gsd/workspace.md` with subcommands instead of 3 non-existent split files (Phase 17 plan 17.03)
- ✓ **DOCS-03** — Reconciled ADR 0009 + ADR 0010 drift via "Superseded by" supersession notes per ADR convention (Phase 17 plan 17.03)
- ✓ **DOCS-04** — Fixed 5 renamed-hook / missing-helper references (`gsd-read-before-edit.js` → `hooks/gsd-read-guard.js`; removed `gsd-commit-docs.js` hook claim; fixed `doc-conflict-engine.md` prefix; decided on `verify-reapply-patches.cjs`; fixed `npm run build` claims) (Phase 17 plan 17.03)
- ✓ **DOCS-05** — Resolved `docs/test-triage/jj-bugs.md` references to archived phase-3 planning artifacts (anchored to closure change_ids per Theme 5) (Phase 17 plan 17.03)
- ✓ **DOCS-06** — Fixed 3 translation date/link mismatches in pt-BR superpowers docs (Phase 17 plan 17.03)
- ✓ **DOCS-07** — Fixed 3 singleton failures (CHANGELOG.md L389, CONTEXT.md L610, ja-JP AGENTS.md L389) (Phase 17 plan 17.03)
- ✓ **DOCS-09** — Close-gate `/gsd:docs-update --verify-only` re-run with pass rate ≥ 99% confirmed (Phase 17 plan 17.03)
- ✓ **PROJECT-01** — Reconciled `.planning/PROJECT.md` `### Validated` against MILESTONES.md + per-milestone REQUIREMENTS files + STATE.md snapshot. Two-pass per Pitfall 8: machine pass produced THIS truth file; human pass edited PROJECT.md narrative citing it. PROJECT.md is NOT regenerate-overwrite output; hand-curated parentheticals preserved (Phase 17 plan 17.04 — THIS file IS the artifact)

### Pending (Phase 18 — tactical cleanup + test-flake)

- ⏳ **CLEANUP-01** — `get-shit-done/workflows/transition.md:166` HIGH-RISK site applies `assert_clean_wc` final-gate + commit-adjacency pattern (closes `v14-transition-md-update-gap`) (Phase 18 plan 18.01)
- ⏳ **CLEANUP-03** — `scripts/dogfood-restore.sh` enforces project-root precondition via `[ -f .planning/STATE.md ]` assertion (closes Phase 14 WR-01) (Phase 18 plan 18.02)
- ⏳ **CLEANUP-04** — `scripts/dogfood-restore.sh` resolves tar-overlay additive-vs-clean ambiguity (closes Phase 14 WR-02) (Phase 18 plan 18.02)
- ⏳ **CLEANUP-05** — `sdk/src/query/workspace-parallel-dispatch.ts` validates `JSON.parse(planText)` via `Array.isArray(plan)` guard (closes Phase 14 WR-03) (Phase 18 plan 18.02)
- ⏳ **CLEANUP-06** — `--max-concurrency` accepts NaN no longer via `Number.isNaN` guard (closes Phase 14 WR-04) (Phase 18 plan 18.02)
- ⏳ **CLEANUP-07** — CONFIG-02 test tmpDir leaks fixed via `afterEach(() => rm(tmpDir, {recursive: true, force: true}))` (closes Phase 14 WR-05) (Phase 18 plan 18.02)
- ⏳ **TEST-17** — `sdk/src/vcs/__tests__/jj-reap.test.ts > workspace.reap > inclusion-filter` no longer times out at 5s under parallel test load (closes `v14-jj-reap-test-flake`) (Phase 18 plan 18.03)

### Deferred-by-design (v1.5+)

- ⏸️ **MERGE-08** — `WorkspaceMergeOpts.mainBookmark` at `sdk/src/vcs/types.ts:226` retains the required-bookmark shape PARALLEL-08 dropped from parallel dispatch. Deliberate Phase 14.1 D-03 STRICT scope: `vcs.workspace.merge` has zero non-test production callers post-Phase 11 P03 migration. Surviving consumers are `jj-workspace.test.ts:406,436` + the git-side `currentBranch !== opts.mainBookmark` detached-HEAD blocker. Defer revision until a real downstream caller emerges needing the same bookmark-less / detached-HEAD freedom Phase 14.1 granted parallel-dispatch.

---

## Self-contained completeness

This file enumerates every REQ-ID across all 5 milestones (v1.0 + v1.1 + v1.2 + v1.3 + v1.4) with status, phase, and closure context. PROJECT.md `### Validated` cites this file as the structured truth source; the narrative voice and hand-curated parentheticals remain owned by PROJECT.md per CF-06 + Pitfall 8 two-pass discipline.

**Total v1.4 REQ-IDs:** 27 (per REQUIREMENTS.md Traceability footer says "26 total" — the count includes the 7 Phase 18 reqs listed in the same table; the truth file groups them by current status). MERGE-08 is enumerated here as a separate row even though the Traceability table folds it under PARALLEL-08's deferred-item carry-over.

**Grand total across all milestones:** 86 (v1.0) + 14 (v1.1) + 14 (v1.2) + 27 (v1.3) + 27 (v1.4) = 168 REQ-IDs enumerated.
