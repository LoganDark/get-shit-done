# GSD jj-port

## What This Is

A hard fork of [`gsd-build/get-shit-done`](https://github.com/gsd-build/get-shit-done) that ports GSD from git to **Jujutsu (jj) VCS** while preserving full feature parity with upstream. The fork tracks upstream main via live rebase (jj's anonymous-branch model). PRs back to upstream are not currently intended but not foreclosed.

## Core Value

**Every upstream GSD command works correctly on a jj-only repo without git** — the user can run their full GSD workflow (new project, plan, execute, ship, hotfix, complete-milestone, multi-workspace) against a jj backend with no degradation in behavior or test coverage.

## Current State

**v1.4 in progress — Phase 16 SHIPPED 2026-05-25 (2/2 plans, 5/5 SC verified, 11/11 must_haves): LINT-06 + CLEANUP-02 closed.** New CI lint `scripts/lint-vcs-parallel-call-presence.cjs` enforces FILE-level pairing of `workspace.parallel.dispatch` ⇔ `workspace.parallel.fan-in` literals in bash/sh/zsh shell fences under `get-shit-done/workflows/` (mirrors `lint-vcs-no-raw-git.cjs` shape; fence regex byte-identical to `audit-workflow-raw-git.cjs:48-49` per CF-06; per-entry `{path, reason, owner}` allowlist via `scripts/lib/allowlist-parser.cjs` — `expires` field actively rejected per `feedback_solo_dev_no_expires`; 5 fixture scenarios including Pitfall 7 prose-only false-positive guard). New CLI bridge `sdk/src/query/cleanup-subagent-workspaces.ts` registered at all three sites (catalog + manifest + aliases.generated per CF-02). `performJjParallelFanIn` clean-path branch calls `cleanupSubagentWorkspaces` directly (TS-direct, not bridge); conflicted branch UNCHANGED + inline `W3 (a) / CF-03 / AP-5` comment per SC4 forensic-preservation contract. `scripts/dogfood-restore.sh` gets idempotent last-position step calling the new CLI bridge with `--all-phases` enumeration + trap-with-WARN + diagnostic echo (per D-11/D-12/D-13). Post-execution code review surfaced 2 BLOCKER (CR-01: crashed-agent workspaces leaked through clean-path reap; CR-02: stderr-merge corrupted dogfood-restore metrics) + 5 WARNING — ALL 7 in-scope findings fixed in 5 follow-up atomic commits; the W3 (a) preservation contract now covers the mixed-clean-with-crashed scenario, not just the all-conflicted scenario. v14-orphan-jj-workspace-dirs todo closed. **v1.4 OPEN: jj workspace dispatch shape bug** discovered during Phase 16 dogfood: `jj workspace add -r <baseRef>` auto-creates an empty WC commit on top of `<baseRef>`, breaking SDK `commit()`'s `jj squash -B @ -k` assumption that `@` == dispatched-base. Subagent commits stacked as DESCENDANTS of named "subagent N" change instead of squashing into position-before-base. Fan-in still worked (work reachable via @-) but topology was wonky. User manually fanned-in. Fix needed: `jj edit <baseRef> && jj abandon <auto-empty>` after `jj workspace add` in `sdk/src/vcs/backends/jj.ts:1055-1083`; `jj workspace update-stale` in `performJjParallelFanIn` post-merge. **Phase 15 SHIPPED 2026-05-24 (4/4 plans, 5/5 SC verified): NAMING-01 + VCS-21 + VCS-22 + PARALLEL-07 closed.** Adapter-surface extensions + the v1.2-deferred `rootCommits` → `rootRevisions` rename landed: 35 in-scope `\brootCommits\b` hits (ts/cjs/js) flipped atomically with a pre-rename JSON sidecar audit at `.planning/phases/15-adapter-surface-extensions-rename/rootCommits-rename-audit.json`; capability matrix string literal at `sdk/src/vcs/backends.ts:79` flipped (Pitfall 3 / v1.2 retro CR-01 prevention); 5 historical-prose `.md` files (PROJECT.md, STATE.md, ROADMAP.md, REQUIREMENTS.md, 14.1-01-SUMMARY.md) registered as `specialCases[*]` carve-outs per CONTEXT D-13. Three new public verbs ship on the cross-backend `VcsAdapter` surface: `vcs.refs.idAlphabet` (`'0-9a-f'` git / `'k-z'` jj, opaque `readonly string` per CF-03); `vcs.refs.matchPrefix(id, prefix): boolean` (alphabet-aware, throws on wrong-alphabet/empty-prefix per CF-04, false on `prefix.length > id.length`, hex case-insensitive / k-z lower-only — 10-case cross-product test 5 rules × 2 backends); `vcs.workspace.parallel.cancel(handle): CancelResult` (synchronous teardown only per CF-05 STACK; 4-field envelope `{abandoned, failedReaped, surplusBookmarks, surplusWorkspaces}` per D-01, mirrors `FanInResult` naming verbatim; D-03 idempotency — second cancel returns all-empty arrays). Shared `cleanupSubagentWorkspaces(mainRepoRoot, phaseNumber, workspaces?: readonly { name: string; path: string }[])` helper extracted to `sdk/src/vcs/jj/workspace-cleanup.ts` (UPSTREAM-02 sidecar — no imports from `../backends/jj`; D-05 AMENDED 2026-05-24 to 3-arg form per user ratification of Open Q1; Phase 16 CLEANUP-02 consumer-ready). New CLI bridge `sdk/src/query/workspace-parallel-cancel.ts` registered at all three sites per CF-07 (catalog-domain + manifest.non-family + aliases.generated). **v1.3 SHIPPED (2026-05-24).** v1.0 MVP shipped 2026-05-14 (8/8 phases). v1.1 first upstream sync shipped 2026-05-14 (1 phase, 5 plans). v1.2 (jujutsu is change-only — never commit id anywhere) shipped 2026-05-15 (1 phase, 3 plans, 14 reqs). v1.3 (jj octopus merge for subagents fully functional) shipped 2026-05-24 (6 phases, 32 plans): jj + git backends expose `vcs.workspace.parallel.{dispatch,fanIn}` with uniform `FanInResult` shape, orchestrator + agents rewired through the adapter (zero raw-git in workflow markdown), A3 colocated pre-commit gap closed, CI parallel-path lane + LINT-05 close-gate green on both backends, and Phase 14 (default flip + dogfood) shipped 2026-05-24 (5/5 plans, 18/18 must-haves verified): install-template `parallelization` flattened to flat boolean `true`, CONFIG-02 envelope ships at the CLI bridge with strict-equal-`false` (`{ok:false, reason:'parallelization_disabled'}` peer to the existing three validation envelopes), real dogfood ran end-to-end on this very repo via isolated `gsd/phase-14-dogfood` bookmark (0 conflicts both backends, main untouched per Pitfall 10), durable metrics baseline + recovery anchor committed to `.planning/intel/v1.3-dogfood-metrics.md`, recovery primitive `scripts/dogfood-restore.sh` validated by rehearsal step (3/3 assertions PASS). Code review CR-01 (latent `jq .ok//"true"` envelope-guard bug — didn't fire because parallelization=true during dogfood) fixed inline. One v1.4 follow-up filed: orphan `.claude/jj-workspaces/phase-{N}-subagent-*` FS dirs survive `jj op restore` (cleanup contract gap). **Phase 14.1 emergency gap-closure shipped 2026-05-24 (1/1 plans, 12/12 must-haves verified):** `ParallelDispatch{Opts,Handle}.mainBookmark: string` hard-renamed to optional `mainBookmarks?: readonly string[]` across SDK + CLI bridge + both backend bodies + both workflow files; bookmark-less jj `@` and detached-HEAD git become first-class working states for parallel dispatch + fan-in; jj fan-in adds two-pass all-or-nothing validate-then-advance loop; git fan-in adds STEP 1.5 post-merge `update-ref` loop guarded on `!conflicted`; CR-03 lint polarity flipped (now asserts preflight ABSENT as a regression net); PARALLEL-08 satisfied; MERGE-08 filed as deferred-item REQ-ID for the deliberate D-03 OOS asymmetry on `WorkspaceMergeOpts.mainBookmark`.

## Current Milestone: v1.4 — Clean, consistent state for next upstream pull

**Goal:** Drive every outstanding fork-internal todo, deferred item, and known drift to zero so the next upstream rebase lands on a clean, fully-tested, fully-documented baseline. Upstream pull itself is OUT OF SCOPE for v1.4 — the operator performs the pull as a separate action once v1.4 ships.

**Target features:**

- **5 v14-* todos from `.planning/todos/pending/`** — `v14-transition-md-update-gap` (apply `assert_clean_wc` + commit-adjacency to `transition.md:166` HIGH-RISK site); `v14-orphan-jj-workspace-dirs` (reap `.claude/jj-workspaces/phase-*-subagent-*` FS dirs on `vcs.workspace.parallel.fan-in` success + via `scripts/dogfood-restore.sh` recovery); `v14-review-followups` (Phase 14 code-review WR-01..05 hardening — bash project-root assertion, tar-overlay semantics, JSON-parse Array.isArray guard, `--max-concurrency` NaN guard, CONFIG-02 test-tmpDir cleanup); `v14-jj-reap-test-flake` (fix `jj-reap.test.ts > inclusion-filter` 5s timeout under parallel test load — narrow scope per todo); `v14-docs-verify-only-followups` (resolve 45 `/gsd:docs-update --verify-only` failures across 8 themes; re-verify pass rate ≥99%).
- **5 deferred items pulled in** — `vcs.refs.matchPrefix(id, prefix)` alphabet-aware short-prefix matching (v1.2 TEST-13 deferred); `rootCommits` → `rootRevisions` cosmetic rename (v1.2 NAMING-01); `vcs.refs.idAlphabet` public introspection (v1.2 API-01, first consumer is `matchPrefix`); `vcs.workspace.parallel.cancel(handle)` mid-execution graceful abandonment (v1.3 open deferral); workflow call-presence lint that `vcs.parallel.*` is called in dispatch sections (v1.3 open deferral, mirrors `lint-vcs-no-raw-git.cjs` shape).
- **Drift control + reconciliation** — implement `tests/architecture-counts.test.cjs` + `tests/command-count-sync.test.cjs` (lock prose counts in ARCHITECTURE.md / INVENTORY.md to live filesystem state, prevents the kind of drift documented in v14-docs-verify-only-followups theme 6); fix `ARCHITECTURE.md` prose-count drift across en + 4 translations (44→68 commands, 46→89 workflows, 16→33 agents, 17→60 lib modules, ~3000→10,978 install.js LOC — forced by the new drift tests); reconcile PROJECT.md `### Validated` against MILESTONES.md + per-phase SUMMARYs (pre-Phase-11 drift noted at v1.3 close, separate workstream from docs cleanup per discuss).

**Out of scope (explicit):**

- **Next upstream pull itself** — v1.4 ends in a clean state ready for upstream rebase; operator performs the pull as a separate action.
- **Broader test-perf sweep** — only the specific `jj-reap.test.ts > inclusion-filter` flake is in scope; the `project_test_perf_pain_vitest` longstanding pain stays deferred.
- **No new feature work** — strictly cleanup, deferred-item harvest, drift control, and consistency.

## Most Recent Shipped Milestone: v1.3 jj octopus merge for subagents fully functional — SHIPPED 2026-05-24

**Goal (achieved):** All subagent dispatch machinery routes through the `VcsAdapter` via new high-level `vcs.parallel.*` verbs. Git backend implements them via raw-git worktree+merge under the hood (the single remaining acknowledged raw-git exception collapses to zero). jj backend implements them via the already-shipped `octopus.ts` + `reap.ts` helpers, promoted from jj-namespaced to backend `parallel.*` verb bodies. `parallelization: true` flips on by default for both backends. Workflows never branch on `vcs.kind` for parallel-dispatch reasons.

**Target features:**

- **New cross-backend high-level verbs on `VcsAdapter`** — `vcs.parallel.dispatch(plan)` / `vcs.parallel.fanIn(branches)` (final names TBD by planner). Both backends implement; workflows call the high-level form only.
- **jj backend implementation** — promote `sdk/src/vcs/jj/octopus.ts` + `reap.ts` from jj-namespaced helpers to the backend's `parallel.*` verb bodies. Cover edge cases: conflict during fan-in, partial-wave failure recovery, agent-bookmark cleanup races.
- **Git backend implementation** — new `parallel.*` verb bodies wrap the existing raw-git `worktree add` / `merge --no-ff` / `worktree remove` flow inside the adapter (not in workflow markdown). Raw-git in workflow-markdown shell-fence blocks collapses to zero; net change to `scripts/lint-vcs-no-raw-git.allow.json` is +0 or +1 (new `sdk/src/vcs/git/parallel.ts` adapter-internal entry — the 23 existing production allowlist entries stay).
- **One-shot audit script** — `scripts/audit-workflow-raw-git.cjs` scans `.md` shell-fence blocks for raw-git (workflow templates are not in the CI `lint-vcs-no-raw-git.cjs` scan extension). Recorded as v1.3 close-gate evidence; not promoted to permanent CI lint.
- **Orchestrator rewire** — `execute-phase.md`, `quick.md`, and any other workflow doing parallel agent dispatch call the new `vcs.parallel.*` verbs. The ~lines 521-810 raw-git block in `execute-phase.md` (and ~660-810 in `quick.md`) is deleted. `parallelization` config knob flips on by default.
- **Subagent prompt updates** — agent prompts that reference worktrees/workspaces (e.g., gsd-executor, gsd-debugger) are rewritten to use adapter terminology; jj-workspace semantics no longer leak through prompts.
- **A3 colocated pre-commit fix** — pick one of the three documented fix paths from Phase 4 LEARNINGS Open Q1; ship it. jj 0.41 colocated `jj squash` fires `.git/hooks/pre-commit` reliably.
- **CI parallel-path lane** — new CI matrix lane runs a parallel phase end-to-end on both backends; required-blocking on jj-colocated.
- **Dogfood phase (separate, final)** — last phase of v1.3 spins up 2-3 synthetic plans on this very repo, runs them in parallel via the new dispatcher, validates clean fan-in + reap + agent-bookmark cleanup, records metrics in `.planning/intel/`.

## Requirements

### Validated

**v1.0 — Dual-backend foundation:**

- ✓ Full GSD workflow on git (new-project → discuss → plan → execute → verify → ship) — upstream baseline
- ✓ Worktree-based parallel phase execution — upstream (Phase 4 added jj-workspace parallel substrate; orchestrator still uses raw-git worktree dispatch, see Active)
- ✓ Hotfix, canary, and milestone flows on git — upstream
- ✓ Multi-runtime support (Claude / Codex / Gemini / OpenCode) — upstream
- ✓ Hook-based commit validation (pre-commit, pre-push) — upstream
- ✓ **VCS-01..07** Adapter foundation (interface, factory, backend auto-detect, exec wrapper, RevisionExpr, dist-cjs build, no-raw-git lint guard) — v1.0
- ✓ **GIT-01..03** Git backend (1:1 baseline, byte-identical exec results, gitOnly escape hatches) — v1.0
- ✓ **MIGR-01..04** Bulk call-site migration (all `execSync('git …')` → adapter) — v1.0 Phase 2
- ✓ **JJ-01..07** jj backend core (squash commit model, NDJSON parsing, env propagation) — v1.0 Phase 3
- ✓ **SQUASH-01..07** Squash semantics, conflict-tolerant return — v1.0 Phase 3
- ✓ **REFS-01..06** Refs + bookmarks namespace (with `gsd/` prefix on jj) — v1.0 Phase 3
- ✓ **CONFLICT-01..03** In-tree conflict detection — v1.0 Phase 3
- ✓ **WS-01..13** Workspaces + octopus structure + workspace-path safety — v1.0 Phase 4
- ✓ **HOOK-01..05** Hook firing (pre-commit/pre-push) — v1.0 Phase 4 (caveat: A3 colocated pre-commit gap remains open, see Active)
- ✓ **CMD-01..11** Command translations (every upstream command on jj) — v1.0 Phase 5
- ✓ **PROMPT-01..03** Workflow markdown + agent prompts rewritten — v1.0 Phase 5
- ✓ **BROWN-01..02** Brownfield workflows on jj (dogfood validation) — v1.0 Phase 6
- ✓ **GREEN-01..03** Greenfield jj defaults + brownfield-stays-on-git invariant + `/gsd-migrate-vcs` — v1.0 Phase 6
- ✓ **TEST-01..08** Test parameterization + jj fixtures + bug-test triage — v1.0 Phases 1+3
- ✓ **UPSTREAM-01..03** Upstream rebase workflow + sidecar conventions + hotspot audit — v1.0 Phase 2
- ✓ **CI-01..04** CI matrix with jj-colocated lane required-blocking — v1.0 Phases 3+4+5

**v1.1 — first upstream sync (Phase 7):**

- ✓ **VCS-08** `refs.bookmarks.currentIn(cwd): string[]` — v1.1
- ✓ **VCS-09** `refs.mergeBase(a, b)` — returns change_id on jj via `fork_point(x)` revset, commit hash on git — v1.1
- ✓ **VCS-10** `diff({ diffFilter })` typed enum (`'added' | 'modified' | 'deleted' | 'renamed' | 'typechange'`) — v1.1
- ✓ **VCS-11** `status({ cwd })` optional scoped cwd — v1.1
- ✓ **VCS-12** `workspace.merge({ branch, message, ff: false, mainBookmark, agentBookmark })` — 2-parent jj-new with atomic main-bookmark advance + agent-bookmark delete (D-03 atomicity) — v1.1
- ✓ **VCS-13** `workspace.remove(path, { force })` — composite forget+rm — v1.1
- ✓ **VCS-14** `refs.bookmarks.delete(name, { force })` — extends existing verb with force flag — v1.1
- ✓ **VCS-15** `refs.readBlob(rev, path)` — read file content at a revision (planner-judgment fold-in) — v1.1
- ✓ **WAVE-01** `executeWorktreeWaveCleanupPlan` wired through the new verbs — v1.1
- ✓ **PROMPT-04** Workflow .md raw-git `else`-branch fallbacks deleted (-242 LOC) — v1.1
- ✓ **MIGR-05** `scripts/changeset/github-release-notes.cjs` migrated to cross-backend adapter — v1.1
- ✓ **TEST-09..11** Upstream test surfaces (installer-migrations, shell-command-projection, query-raw-output-projection) strict-green on both backends — v1.1

**v1.4 — Clean, consistent state for next upstream pull (Phase 14.1 — emergency gap-closure):**

- ✓ **PARALLEL-08** Drop mandatory `mainBookmark: string` on `ParallelDispatch{Opts,Handle}` — replaced with optional `mainBookmarks?: readonly string[]` (default `[]` → no advance); bookmark-less jj `@` and detached-HEAD git are now first-class parallel dispatch + fan-in working states; jj fan-in two-pass all-or-nothing validate+advance; git fan-in STEP 1.5 post-merge `update-ref` per-name loop guarded on `!conflicted`; workflow `current-branch` FATAL preflight removed from `execute-phase.md` + `quick.md` symmetrically; CR-03 lint polarity flipped — Validated in Phase 14.1
- ⏳ **MERGE-08** `WorkspaceMergeOpts.mainBookmark` revision (paired with PARALLEL-08; deliberate D-03 STRICT OOS asymmetry, zero non-test production callers) — filed as Deferred in v1.4 Phase 14.1, awaits a real downstream caller

**v1.2 — unified revision model on cross-backend adapter (Phase 8):**

- ✓ **AUDIT-01..04** Whole-repo `commit_id`-namespace audit: 101 sites classified via closed verdict enum (safe/flip-clean/needs-rename/needs-resolveShort/boundary-io/historical-prose/unclear); jj 0.41 NDJSON `change_id` schema probe (Risk 4) recorded green — v1.2
- ✓ **FLIP-01..04** Cross-backend surface flip: 7 jj.ts template flips + 3 NDJSON parser flips + `LogEntry.hash`/`CommitResult.hash` hard-renamed to `.id` (no aliases; ~14 production + ~25 test consumers swept); PITFALL 1 doc inverted to positive-contract; JSDoc updated — v1.2
- ✓ **LINT-01..02** `scripts/lint-vcs-no-commit-id.cjs` ships with default-deny patterns + per-entry `{path|glob, reason, owner}` allowlist; shared `scripts/lib/allowlist-parser.cjs` consumed by both lints; pre-existing `lint-vcs-no-raw-git.allow.json` migrated to per-entry schema (D-03); `expires` field dropped repo-wide (D-04 spec delta); CI-blocking on jj-colocated lane — v1.2
- ✓ **LINT-03** Conditional resolved as verified end state — Plan 1 audit found 2 boundary-io sites in `jj-id.ts` reverse-resolve helper, below 5-site threshold; `jj-internal.ts` NOT created; SEED-001 "no escape hatch" inversion holds — v1.2
- ✓ **PROMPT-05** Workflow `vcs.kind === 'jj'` id-reason branches: zero deletions (set was empty per audit, as predicted); 4 KEEP sites annotated with discriminator citations (capability/allowlist non-id reasons) — v1.2
- ✓ **TEST-12** Vitest `toBeIdOf(kind)` custom matcher at `tests/__tools__/vitest-matchers.ts` (D-02 `expect.extend` form, NOT free function `expectIdShape`); module augmentation in `vitest.d.ts`; registered via `setupFiles` (D-02a); REQUIREMENTS-12 text updated to reflect actual API (D-02b); golden-parity baselines re-recorded — v1.2
- ✓ **MIGR-06** Close-gate `.planning/` rewriter pass at `scripts/migr-06-close-gate.cjs`: single B-07-style rewrite scoped to Phase 8 dir only; idempotent; one-time prose hex grep recorded with 10 grandfathered hits — v1.2

**v1.4 — Adapter surface extensions + rename (Phase 15, 2026-05-24):**

- ✓ **NAMING-01** v1.2-deferred `rootCommits` → `rootRevisions` cosmetic rename completed: 35 in-scope `.ts`/`.cjs`/`.js` hits flipped atomically (no alias per v1.2 NAMING-01 precedent); capability matrix string literal at `sdk/src/vcs/backends.ts:79` flipped (Pitfall 3 / v1.2 retro CR-01 prevention via `specialCases` audit entry); 5 historical-prose `.md` files (PROJECT.md, STATE.md, ROADMAP.md, REQUIREMENTS.md, 14.1-01-SUMMARY.md) registered as `historical-prose-carve-out` per CONTEXT D-13. Pre-rename JSON sidecar audit at `.planning/phases/15-adapter-surface-extensions-rename/rootCommits-rename-audit.json` (D-09 grouped-by-extension schema + D-12 idempotencyHash + audit/rename commit adjacency invariant) — v1.4 Phase 15
- ✓ **VCS-21** `vcs.refs.idAlphabet` public introspection on cross-backend `VcsAdapter` surface: opaque `readonly string` per CF-03 (`'0-9a-f'` git hex commit_id / `'k-z'` jj reverse-base32 change_id); cross-backend adapter-contract test asserts both backends; capability matrix entry `['git', 'jj-colocated']`. Consumed by `vcs.refs.matchPrefix` (VCS-22) and by composers building backend-aware regex patterns — v1.4 Phase 15
- ✓ **VCS-22** `vcs.refs.matchPrefix(id, prefix): boolean` alphabet-aware short-prefix probe on both backends: pure-string per-backend implementation (no closures over adapter state, hardcodes alphabet regex inline per `validateRefname` precedent / Pattern S3). CF-04 throwing contract — throws on wrong-alphabet (Pitfall 6 silent-false trap mitigated), throws on empty prefix (caller bug), returns false on `prefix.length > id.length` (definite no-match, not caller bug); git matches case-insensitive (matches `core.abbrev`), jj is lower-only (uppercase k-z throws). 10-case cross-product test (5 rules × 2 backends) — v1.4 Phase 15
- ✓ **PARALLEL-07** `vcs.workspace.parallel.cancel(handle): CancelResult` synchronous-teardown verb on both backends per CF-05 STACK lens (no signal handling — `spawnSync` exec layer can't accept AbortSignal). 4-field envelope `{abandoned, failedReaped, surplusBookmarks, surplusWorkspaces}` per D-01 (mirrors `FanInResult` field naming verbatim); D-03 idempotency invariant — second cancel on same handle returns all-empty arrays (helper skips already-gone dirs silently per D-06). Shared `cleanupSubagentWorkspaces(mainRepoRoot, phaseNumber, workspaces?: readonly { name: string; path: string }[])` helper extracted to UPSTREAM-02 sidecar at `sdk/src/vcs/jj/workspace-cleanup.ts` (NO imports from `../backends/jj`; D-05 AMENDED 2026-05-24 to 3-arg form per user ratification of Open Q1 + Pitfall 4 mitigation — `workspaces?` element type carries custom `workspacePath` overrides). New CLI bridge `sdk/src/query/workspace-parallel-cancel.ts` registered at all three sites per CF-07 (`command-static-catalog-domain.ts` + `command-manifest.non-family.ts` + `command-aliases.generated.ts`). Per-backend cancel scenarios + helper unit tests + repo-side CLI smoke (handle_required envelope + UNKNOWN_VERB negative control). Phase 16 CLEANUP-02 consumes the SAME helper (single-owner per IP-5) — v1.4 Phase 15
- ✓ **LINT-06** workflow call-presence lint at `scripts/lint-vcs-parallel-call-presence.cjs` (v1.4 Phase 16, 2026-05-25). FILE-level bidirectional pairing of `workspace.parallel.dispatch` ⇔ `workspace.parallel.fan-in` literal substrings inside bash/sh/zsh shell fences under `get-shit-done/workflows/` (D-01/D-02/D-03). Fence-walker regex constants `FENCE_OPEN`/`FENCE_CLOSE` byte-identically duplicated from `scripts/audit-workflow-raw-git.cjs:48-49` per CF-06 (shared-lib extraction FORBIDDEN per REQUIREMENTS.md §Out of Scope L92). Per-entry allowlist via `scripts/lib/allowlist-parser.cjs` with `{path, reason, owner}` schema; `expires` field actively rejected per `feedback_solo_dev_no_expires` (parser tightened in same phase; 2 regression tests in `tests/scripts/allowlist-parser.test.cjs`). Initial allowlist ships empty (`entries: []`) per D-08 with `$comment_ip2_cancel_exclusion` narrative stub for the cancel/fanIn-only edge. No inline escape annotation reserved per D-09 (pure YAGNI). 5 D-14 fixture scenarios at `tests/scripts/lint-vcs-parallel-call-presence.test.cjs` (paired pass / dispatch-only fail / fanin-only fail / prose-only pass per Pitfall 7 false-positive guard / allowlist suppress + no-expires parser throw). CI step `Lint — workflow call-presence (LINT-06)` at `.github/workflows/parallel-e2e.yml:135-137` adjacent to existing CI-06 audit step inside `parallel-e2e` matrix job (inherits jj-colocated blocking via `parallel-e2e-gate` aggregate); NOT promoted to `npm pretest` per D-07 CI-only precedent (matches `audit-workflow-raw-git.cjs` placement).
- ✓ **CLEANUP-02** orphan FS dir reap closing v14-orphan-jj-workspace-dirs cleanup-contract gap (v1.4 Phase 16, 2026-05-25). TWO new consumer call sites of the Phase 15 PARALLEL-07-extracted `cleanupSubagentWorkspaces` helper at `sdk/src/vcs/jj/workspace-cleanup.ts:134`: (1) **TS-direct call** from `performJjParallelFanIn` clean-path `else` branch in `sdk/src/vcs/jj/parallel.ts` (after `merged.push(mergeChangeId)`); CR-01 follow-up filters `crashedAgentIds` from the reap input so the W3 (a) preservation contract covers BOTH all-conflicted AND mixed-clean-with-crashed scenarios (test guard: `cmd-parallel-jj.test.ts:417` `existsSync === true` for crashed-agent workspaces post-clean-fanIn). Conflicted branch UNCHANGED + inline `W3 (a) / CF-03 / AP-5` comment at `parallel.ts:394-402` per SC4. (2) **CLI bridge call** from `scripts/dogfood-restore.sh` via new `sdk/src/query/cleanup-subagent-workspaces.ts` (three-site registration per CF-02 — catalog + manifest + aliases.generated). Bridge supports `--phase <N>` OR `--all-phases` (mutually exclusive per D-04; `--all-phases` enumerates `.claude/jj-workspaces/` via `readdirSync` filtered by `/^phase-(\d+)-subagent-\d+$/`, merges per-phase results to single `{abandoned, failedReaped}` envelope per D-06). Dogfood step lands STRICTLY LAST per D-11, trap-with-WARN per D-12, second diagnostic echo with counts per D-13; CR-02 follow-up separates stdout/stderr capture to avoid jq parse corruption when gsd-sdk emits "not in native registry" stderr warnings (WR-04 explicit WARN on jq failure, no more silent `?` fallback). Cross-backend tests in `sdk/src/vcs/__tests__/cmd-parallel-{jj,git}.test.ts` assert `existsSync(ws.path) === false` post-clean-fanIn (D-15); dogfood integration test at `tests/scripts/dogfood-restore-orphan-cleanup.test.cjs` seeds 2 distinct phase numbers per D-16. Single owner per IP-5: all 3 consumers (cancel verb at `parallel.ts:557-561`, fanIn clean-path, dogfood-restore.sh via bridge) call the helper directly — zero inline `rmSync` duplicates (`grep -rn 'rmSync.*phase-.*subagent' sdk/src/` returns 0 hits except in the helper itself). Helper docblock at `workspace-cleanup.ts` gains one-line consumer-completion cross-reference to `16-CONTEXT.md` per D-17.

### Active (v1.4 — Clean, consistent state for next upstream pull)

See `.planning/REQUIREMENTS.md` for the formal REQ-ID list and traceability. v1.4 scope groups into three themes:

1. **Tactical cleanup + test fix** — ~~five~~ four v14-* todos from `.planning/todos/pending/`: transition.md `assert_clean_wc` gate, ~~orphan `.claude/jj-workspaces/phase-*-subagent-*` FS dir reap~~ (CLOSED Phase 16 CLEANUP-02), Phase 14 code-review WR-01..05 hardening, `jj-reap.test.ts > inclusion-filter` flake fix, 45-failure `/gsd:docs-update --verify-only` cleanup.
2. **Deferred-item harvest** — ~~five~~ four v1.2/v1.3 deferred items pulled in: `vcs.refs.matchPrefix` (CLOSED Phase 15 VCS-22), `vcs.refs.idAlphabet` (CLOSED Phase 15 VCS-21), `rootCommits` → `rootRevisions` rename (CLOSED Phase 15 NAMING-01), `vcs.workspace.parallel.cancel(handle)` mid-execution graceful abandonment (CLOSED Phase 15 PARALLEL-07), ~~workflow call-presence lint (`vcs.parallel.*` must be called in dispatch sections)~~ (CLOSED Phase 16 LINT-06).
3. **Drift control + PROJECT.md reconciliation** — `tests/architecture-counts.test.cjs` + `tests/command-count-sync.test.cjs` drift-control tests, ARCHITECTURE.md prose-count fixes across en + 4 translations (forced by the new tests), PROJECT.md `### Validated` reconciliation against MILESTONES.md + per-phase SUMMARYs (separate workstream from docs cleanup).

**v1.4 NEW open item (discovered Phase 16):** `jj workspace add -r <baseRef>` creates auto-empty WC commit on top of `<baseRef>` — breaks SDK `commit()` squash-into-base assumption. Subagent commits stack as DESCENDANTS of named "subagent N" change instead of squashing into position-before-base. Fix shape: `jj edit <baseRef> && jj abandon <auto-empty>` after `jj workspace add` in `sdk/src/vcs/backends/jj.ts:1055-1083`; `jj workspace update-stale` on main repo in `performJjParallelFanIn` post-merge. Fan-in still works (work reachable via @-) but topology is wonky. Candidate for Phase 17 or v1.5.

Both v1.0/v1.1/v1.2 carry-forwards closed in v1.3:

- **Orchestrator parallelization rewrite** — ✓ **CLOSED in v1.3 Phases 9–11 + 14 (2026-05-15 → 2026-05-23).** `vcs.workspace.parallel.{dispatch,fanIn}` shipped on both backends; `execute-phase.md` / `quick.md` raw-git worktree blocks deleted; `parallelization: true` default-flipped in the install template + this repo per Phase 14 plan 01; CONFIG-02 `parallelization_disabled` envelope at the CLI bridge with strict-equal-`false` brownfield safety; dogfood run on this repo (Phase 14 plan 05) clean on both backends (0 conflicts; main bookmark untouched per Pitfall 10).
- **A3 colocated pre-commit gap** — ✓ **CLOSED in v1.3 Phase 12 (2026-05-21).** jj 0.41 doesn't auto-fire `.git/hooks/pre-commit` after `jj squash` in colocated mode. Path 1 (chosen from the three Phase 4 LEARNINGS Open Q1 fix paths) makes the jj backend's `commit()` always fire the adapter-managed `.githooks/<stage>` hook in colocated mode, with `GSD_HOOK_SKIP_COLOCATED` as the env opt-out. HOOK-06/HOOK-07 validated; HOOK-07 fires-exactly-once regression test + SC4 hook-idempotency audit shipped.

**Historical seeds (not future candidates):**

- **SEED-001 (subsumed and inverted by v1.2)** — original seed proposed an escape hatch (`vcs.jjOnly.commitIdOf`); v1.2 inverts that to "no escape hatch on cross-backend surface; commit_id leakage from jj is a defect." Seed is now historical context.

### Out of Scope

- **Removing git support** — adapter keeps git first-class. Removing it breaks upstream rebase ergonomics and dual-backend test coverage.
- **Publishing to npm under upstream's name** — fork is for personal use; no `get-shit-done-cc` republish.
- **Rebranding (package/skill names) right now** — deferred until usable; default to upstream names while iterating. Re-evaluate when first dogfooded (now achieved; defer further until v1.2 scoping if relevant).
- **Non-colocated jj as the only mode** — both colocated and non-colocated jj must work, but colocated is the default dogfood mode (this very repo).
- **Optimizing for non-Claude runtimes specifically** — Codex/Gemini/OpenCode parity preserved per upstream, but bug-fix priority on Claude when conflicts arise.

## Context

**Technical environment**

- Repo carries both `.git` and `.jj` directories (colocated jj). Upstream is git-only on GitHub.
- Upstream codebase: ~30k+ LOC across `get-shit-done/bin/lib/*.cjs` (CLI runtime), `sdk/src/` (TypeScript SDK with 2 fully-implemented backends — `vcs/backends/git.ts` and `vcs/backends/jj.ts` — at ~813 and ~1120 LOC respectively post-v1.1), `commands/` (slash commands), `agents/` (subagents), `hooks/` (lifecycle hooks), `scripts/` (build/lint), `tests/` (vitest + node --test).
- pnpm workspace, Node ≥22, vitest. The `parallelization` config knob is OFF — workspace-parallel substrate exists but the orchestrator hasn't been rewired to use it yet (see Active follow-ups).
- jj-colocated CI lane required-blocking since v1.0 Phase 5. v1.1 strict-green achieved on both lanes for all new upstream test surfaces.

**Prior art / framing**

- jj's anonymous-branch + automatic-rebase model is the upstream-tracking primitive. Fork commits stay on top of upstream main; conflicts surface during normal `jj rebase`.
- The fork uses change_id for tracked-identity surfaces (`.planning/` files, `vcs.commit()` returns, `vcs.workspace.merge()` returns, `vcs.refs.mergeBase()` per Phase 7 D-05) and commit_id for immutable-snapshot surfaces (`vcs.log()` LogEntry.hash, `vcs.refs.resolveShort()`, `vcs.workspace.list().rev`). SEED-001 captures the open question of whether this dual surface should collapse to change_id only.

**User context**

- Solo developer, focused-sprint posture. v1.0 and v1.1 both shipped 2026-05-14 — high velocity sustained through deliberate phase boundaries.
- Dogfooding on this very repo (brownfield). All v1.0 brownfield commands validated; v1.1 added the wave-cleanup executor end-to-end.

## Constraints

- **Tech stack**: Node ≥22, pnpm 11+, vitest, TypeScript ≥5 — match upstream.
- **VCS**: Two backends: `git` (1:1 baseline) and `jj`. Both pass the same parameterized test suite.
- **Upstream merge ergonomics**: Fork-specific code organized to minimize rebase conflicts when pulling upstream — adapter call-site changes (mechanical) over inline rewrites.
- **No raw git anywhere**: Whole-repo default-deny lint guard. Allowlist exceptions are temporary and tech-debt-tagged (post-v1.1: `execute-phase.md`/`quick.md` worktree-cleanup block at lines ~714+ is the only acknowledged exception, tracked for rewrite).
- **Test parity**: Every git-touching test runs against both backends. No skip-count regressions; baseline guard enforced in CI.
- **Runtime parity**: Multi-runtime support (Claude/Codex/Gemini/OpenCode) preserved per upstream. PROMPT-03 install-time pipeline handles per-runtime projections.
- **Dependencies**: Avoid adding heavy npm deps; prefer shelling out to `jj` binary via the adapter.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Hard fork (PRs back not currently intended but not foreclosed) | jj-port is invasive; user preference for jj; some surfaces preserved upstream-mergeable on purpose (e.g., MIGR-05 cross-backend migration over delete) | ✓ Good — v1.0+v1.1 shipped without upstream conflicts |
| Use `.planning/` for fork's GSD self-hosting | Collision-free with upstream `.plans/` and `CONTEXT.md` | ✓ Good — zero merge conflicts in two milestone cycles |
| VCS adapter abstraction (not direct git→jj substitution) | No central `execGit()` upstream; adapter highest-leverage move; preserves git for upstream rebase + dual-backend tests | ✓ Good — landed in v1.0, extended cleanly in v1.1 |
| Worktree → jj-workspace mapping (substrate parallel-ready since Phase 4) | Worktree-parallelism is core GSD value; jj `workspace.*` substrate exists | ⚠️ Revisit — substrate built; orchestrator not yet using it; SEED-001 candidate work |
| Tests abstracted via adapter, parameterized backends | Highest fidelity; preserves upstream regression coverage | ✓ Good — strict-green held in v1.1 close gate |
| Hooks ported jj-native (post-squash fire) | Works for non-colocated; future-proof against upstream hook changes | ⚠️ Revisit — A3 colocated pre-commit gap remains open from v1.0 |
| Upstream tracking via jj live rebase | Native; minimizes conflict surface | ✓ Good — first weekly upstream sync completed in v1.1 |
| Brownfield priority within full-parity scope | Dogfood on this very repo | ✓ Good — v1.0 BROWN-* validated; v1.1 sustained brownfield posture |
| Squash as sole jj commit primitive | jj's working-copy-aware semantics; `--ignore-working-copy` never used | ✓ Good — held through v1.0 + v1.1 |
| change_id canonical for tracked identity; commit_id for immutable snapshots | jj-idiomatic; aligned with `.planning/` migration intent | ✓ Superseded by v1.2 — cross-backend surface unified on `.id` (change_id on jj, commit_id on git); SEED-001 inverted |
| Unified revision model — cross-backend adapter exposes ONE revision concept (commit_id on git, change_id on jj); jj backend never volunteers commit_id from any cross-backend verb (v1.2) | Workflows must not branch on `vcs.kind` for id reasons; SEED-001's escape-hatch idea inverts to "leakage is a defect" | ✓ Shipped v1.2 — `scripts/lint-vcs-no-commit-id.cjs` CI-blocking; lint at 1032 files / 0 violations is the architectural enforcer |
| Sticky `vcs.adapter` resolution at write time (B-09 v1.0) | No `auto` ambiguity at write time | ✓ Good |
| No raw git anywhere (whole-repo lint guard) | Architectural invariant | ✓ Good — single acknowledged exception (orchestrator worktree dispatch), tracked for rewrite |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-25 — Phase 16 (workflow + invariant tooling) shipped 2026-05-25 (2/2 plans, 5/5 SC, 11/11 must_haves, 1 HUMAN-UAT resolved as skipped — fork is local-only, no GitHub CI binding to verify): LINT-06 (workflow call-presence lint at `scripts/lint-vcs-parallel-call-presence.cjs` + CI step adjacent to CI-06 audit + 5 D-14 fixtures including Pitfall 7 prose-only guard + per-entry `{path, reason, owner}` allowlist with `expires` actively rejected) + CLEANUP-02 (orphan FS dir reap on fanIn clean-path TS-direct + dogfood-restore.sh via new `gsd-sdk query cleanup-subagent-workspaces` CLI bridge with three-site registration; conflicted-branch UNCHANGED per W3 (a) / CF-03 / AP-5 preservation contract; CR-01 follow-up extends preservation to crashed-agent workspaces in mixed clean-with-crashed scenario). Post-execution code review: 2 BLOCKER + 5 WARNING all fixed in 5 atomic follow-up commits. New v1.4 open item filed: `jj workspace add` auto-empty WC bug breaks SDK squash-into-base assumption (fan-in still works, topology wonky; fix needs `jj edit <baseRef> && jj abandon <auto-empty>` post-add + `jj workspace update-stale` post-merge). Phase 15 (adapter-surface-extensions + rename) shipped 2026-05-24 (4/4 plans, 5/5 ROADMAP SC verified): NAMING-01 (`rootCommits` → `rootRevisions` hard rename across 35 in-scope code hits with pre-rename JSON sidecar audit + 5 historical-prose `.md` carve-outs per D-13), VCS-21 (`vcs.refs.idAlphabet` opaque `readonly string` introspection), VCS-22 (`vcs.refs.matchPrefix` alphabet-aware probe with CF-04 throwing contract + 10-case 5-rule × 2-backend cross-product test), PARALLEL-07 (`vcs.workspace.parallel.cancel(handle): CancelResult` synchronous-teardown verb + shared `cleanupSubagentWorkspaces` 3-arg helper at UPSTREAM-02 sidecar; D-03 idempotent-recall-empty-arrays invariant; CF-07 three-site CLI registration). CONTEXT D-05 AMENDED 2026-05-24 to 3-arg helper signature per user ratification of Open Q1. ROADMAP SC5 amended to match. Phase 16 CLEANUP-02 consumer-ready for the shared helper (single-owner per IP-5). Phase 14.1 emergency gap-closure shipped earlier same day (1/1 plans, 12/12 must-haves verified) — PARALLEL-08 satisfied (optional `mainBookmarks?: readonly string[]` replaces required `mainBookmark: string` on parallel dispatch + fan-in; bookmark-less jj `@` and detached-HEAD git become first-class parallel-dispatch working states; symmetric `current-branch` FATAL preflight removed from `execute-phase.md` + `quick.md`); MERGE-08 filed as Deferred (D-03 STRICT OOS asymmetry on `WorkspaceMergeOpts.mainBookmark`). v1.4 opened via `/gsd-new-milestone v1.4`. Scope: drive every outstanding fork-internal todo, deferred item, and known drift to zero so the next upstream rebase lands on a clean, fully-tested, fully-documented baseline. Three themes: (1) 5 v14-* todos from pending/ queue; (2) 5 v1.2/v1.3 deferred items pulled in (matchPrefix, idAlphabet, rootCommits→rootRevisions, parallel.cancel, workflow call-presence lint); (3) drift-control tests + ARCHITECTURE.md prose-count fixes + PROJECT.md `### Validated` reconciliation. Upstream pull itself is OUT OF SCOPE — v1.4 ends in clean state, operator performs the pull as a separate action. v1.3 shipped 2026-05-24: 6 phases (9–14), 34 plans, 27 requirements. NOTE: `### Validated` carries pre-Phase-11 drift, addressed in v1.4 by the PROJECT.md reconciliation workstream.*
