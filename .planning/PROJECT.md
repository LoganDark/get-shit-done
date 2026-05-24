# GSD jj-port

## What This Is

A hard fork of [`gsd-build/get-shit-done`](https://github.com/gsd-build/get-shit-done) that ports GSD from git to **Jujutsu (jj) VCS** while preserving full feature parity with upstream. The fork tracks upstream main via live rebase (jj's anonymous-branch model). PRs back to upstream are not currently intended but not foreclosed.

## Core Value

**Every upstream GSD command works correctly on a jj-only repo without git** — the user can run their full GSD workflow (new project, plan, execute, ship, hotfix, complete-milestone, multi-workspace) against a jj backend with no degradation in behavior or test coverage.

## Current State

**v1.3 SHIPPED (2026-05-24).** v1.0 MVP shipped 2026-05-14 (8/8 phases). v1.1 first upstream sync shipped 2026-05-14 (1 phase, 5 plans). v1.2 (jujutsu is change-only — never commit id anywhere) shipped 2026-05-15 (1 phase, 3 plans, 14 reqs). v1.3 (jj octopus merge for subagents fully functional) shipped 2026-05-24 (6 phases, 32 plans): jj + git backends expose `vcs.workspace.parallel.{dispatch,fanIn}` with uniform `FanInResult` shape, orchestrator + agents rewired through the adapter (zero raw-git in workflow markdown), A3 colocated pre-commit gap closed, CI parallel-path lane + LINT-05 close-gate green on both backends, and Phase 14 (default flip + dogfood) shipped 2026-05-24 (5/5 plans, 18/18 must-haves verified): install-template `parallelization` flattened to flat boolean `true`, CONFIG-02 envelope ships at the CLI bridge with strict-equal-`false` (`{ok:false, reason:'parallelization_disabled'}` peer to the existing three validation envelopes), real dogfood ran end-to-end on this very repo via isolated `gsd/phase-14-dogfood` bookmark (0 conflicts both backends, main untouched per Pitfall 10), durable metrics baseline + recovery anchor committed to `.planning/intel/v1.3-dogfood-metrics.md`, recovery primitive `scripts/dogfood-restore.sh` validated by rehearsal step (3/3 assertions PASS). Code review CR-01 (latent `jq .ok//"true"` envelope-guard bug — didn't fire because parallelization=true during dogfood) fixed inline. One v1.4 follow-up filed: orphan `.claude/jj-workspaces/phase-{N}-subagent-*` FS dirs survive `jj op restore` (cleanup contract gap).

## Most Recent Milestone: v1.3 jj octopus merge for subagents fully functional — SHIPPED 2026-05-24

**Goal (achieved):** All subagent dispatch machinery routes through the `VcsAdapter` via new high-level `vcs.parallel.*` verbs. Git backend implements them via raw-git worktree+merge under the hood (the single remaining acknowledged raw-git exception collapses to zero). jj backend implements them via the already-shipped `octopus.ts` + `reap.ts` helpers, promoted from jj-namespaced to backend `parallel.*` verb bodies. `parallelization: true` flips on by default for both backends. Workflows never branch on `vcs.kind` for parallel-dispatch reasons.

**Next milestone:** v1.4 — scope set during `/gsd-new-milestone`. Five v14-* todos already filed for promotion (docs drift cleanup, drift-control tests, `performJjReap` test flake, review followups, orphan workspace dir cleanup, transition.md update gap).

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

**v1.2 — unified revision model on cross-backend adapter (Phase 8):**

- ✓ **AUDIT-01..04** Whole-repo `commit_id`-namespace audit: 101 sites classified via closed verdict enum (safe/flip-clean/needs-rename/needs-resolveShort/boundary-io/historical-prose/unclear); jj 0.41 NDJSON `change_id` schema probe (Risk 4) recorded green — v1.2
- ✓ **FLIP-01..04** Cross-backend surface flip: 7 jj.ts template flips + 3 NDJSON parser flips + `LogEntry.hash`/`CommitResult.hash` hard-renamed to `.id` (no aliases; ~14 production + ~25 test consumers swept); PITFALL 1 doc inverted to positive-contract; JSDoc updated — v1.2
- ✓ **LINT-01..02** `scripts/lint-vcs-no-commit-id.cjs` ships with default-deny patterns + per-entry `{path|glob, reason, owner}` allowlist; shared `scripts/lib/allowlist-parser.cjs` consumed by both lints; pre-existing `lint-vcs-no-raw-git.allow.json` migrated to per-entry schema (D-03); `expires` field dropped repo-wide (D-04 spec delta); CI-blocking on jj-colocated lane — v1.2
- ✓ **LINT-03** Conditional resolved as verified end state — Plan 1 audit found 2 boundary-io sites in `jj-id.ts` reverse-resolve helper, below 5-site threshold; `jj-internal.ts` NOT created; SEED-001 "no escape hatch" inversion holds — v1.2
- ✓ **PROMPT-05** Workflow `vcs.kind === 'jj'` id-reason branches: zero deletions (set was empty per audit, as predicted); 4 KEEP sites annotated with discriminator citations (capability/allowlist non-id reasons) — v1.2
- ✓ **TEST-12** Vitest `toBeIdOf(kind)` custom matcher at `tests/__tools__/vitest-matchers.ts` (D-02 `expect.extend` form, NOT free function `expectIdShape`); module augmentation in `vitest.d.ts`; registered via `setupFiles` (D-02a); REQUIREMENTS-12 text updated to reflect actual API (D-02b); golden-parity baselines re-recorded — v1.2
- ✓ **MIGR-06** Close-gate `.planning/` rewriter pass at `scripts/migr-06-close-gate.cjs`: single B-07-style rewrite scoped to Phase 8 dir only; idempotent; one-time prose hex grep recorded with 10 grandfathered hits — v1.2

### Active (v1.4 — TBD; will be set during `/gsd-new-milestone`)

Both v1.0/v1.1/v1.2 carry-forwards closed in v1.3:

- **Orchestrator parallelization rewrite** — ✓ **CLOSED in v1.3 Phases 9–11 + 14 (2026-05-15 → 2026-05-23).** `vcs.workspace.parallel.{dispatch,fanIn}` shipped on both backends; `execute-phase.md` / `quick.md` raw-git worktree blocks deleted; `parallelization: true` default-flipped in the install template + this repo per Phase 14 plan 01; CONFIG-02 `parallelization_disabled` envelope at the CLI bridge with strict-equal-`false` brownfield safety; dogfood run on this repo (Phase 14 plan 05) clean on both backends (0 conflicts; main bookmark untouched per Pitfall 10).
- **A3 colocated pre-commit gap** — ✓ **CLOSED in v1.3 Phase 12 (2026-05-21).** jj 0.41 doesn't auto-fire `.git/hooks/pre-commit` after `jj squash` in colocated mode. Path 1 (chosen from the three Phase 4 LEARNINGS Open Q1 fix paths) makes the jj backend's `commit()` always fire the adapter-managed `.githooks/<stage>` hook in colocated mode, with `GSD_HOOK_SKIP_COLOCATED` as the env opt-out. HOOK-06/HOOK-07 validated; HOOK-07 fires-exactly-once regression test + SC4 hook-idempotency audit shipped.

v1.4 requirements get set during `/gsd-new-milestone`. The five v14-* todos already in `.planning/todos/pending/` (docs drift cleanup, drift-control tests, `performJjReap` test flake, review followups, orphan jj-workspace dirs, `transition.md` update gap) are the seed list; `/gsd-new-milestone` will promote them into v1.4 phases.

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
*Last updated: 2026-05-24 — v1.3 closed with Phase 14 (default flip + dogfood validation) complete: 5/5 plans, 18/18 must-haves verified, real dogfood ran on this very repo via isolated `gsd/phase-14-dogfood` bookmark (jj-cell dispatch_ms=6209 / fan_in_ms=780 / 0 conflicts; git-cell dispatch_ms=390 / fan_in_ms=1276 / 0 conflicts), Pitfall 10 main-untouched invariant proven (`MAIN_BEFORE`≡`MAIN_AFTER`), durable recovery anchor committed (`pre_op_id` + `tarball_sha256` + sibling `mktemp` path), CONFIG-02 envelope shipped at CLI bridge with strict-equal-`false`, CR-01 (latent `jq .ok//"true"` guard bug) fixed inline. v1.3 = 6 phases (9–14) + 32 plans + 27 requirements (CONFIG-01/02, DOGFOOD-01/02, PARALLEL-01/02/05/06, VCS-16..20, PROMPT-06..09, LINT-04..05, HOOK-06..07, CI-05..06, TEST-13..16). One v1.4 follow-up filed: orphan `.claude/jj-workspaces/phase-{N}-subagent-*` FS dirs survive `jj op restore`. NOTE: `### Validated` carries pre-Phase-11 drift — `/gsd:docs-update` reconciliation recommended at v1.4 kickoff.*
