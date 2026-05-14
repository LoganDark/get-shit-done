# GSD jj-port

## What This Is

A hard fork of [`gsd-build/get-shit-done`](https://github.com/gsd-build/get-shit-done) that ports GSD from git to **Jujutsu (jj) VCS** while preserving full feature parity with upstream. The fork tracks upstream main via live rebase (jj's anonymous-branch model). PRs back to upstream are not currently intended but not foreclosed.

## Core Value

**Every upstream GSD command works correctly on a jj-only repo without git** — the user can run their full GSD workflow (new project, plan, execute, ship, hotfix, complete-milestone, multi-workspace) against a jj backend with no degradation in behavior or test coverage.

## Current State

**Between milestones.** v1.0 MVP shipped 2026-05-14 (8/8 phases delivered the full dual-backend port). v1.1 first upstream sync shipped 2026-05-14 (1 phase, 5 plans — closed the gaps the May 2026 upstream merge exposed). Next milestone awaits scoping via `/gsd-new-milestone`.

`SEED-001` (change-id-only on jj adapter surface; commit_id behind a `vcs.jjOnly.*` escape hatch) is planted and will auto-surface during the next milestone's seed-scan if the theme matches.

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

### Active

*No active milestone. Run `/gsd-new-milestone` to scope v1.2.*

**Open follow-ups for v1.2 candidacy** (tracked but not committed):

- **Orchestrator parallelization rewrite** — `get-shit-done/workflows/execute-phase.md` worktree dispatch + cleanup loop (~lines 714+) uses raw-git `worktree add` / `merge --no-ff` / `worktree remove`. Phase 7 CONTEXT D-12 described the future-intended fan-in via `sdk/src/vcs/jj/octopus.ts` + `reap.ts` but the orchestrator hasn't been rewired. `parallelization` config knob stays `false` until this lands. Tracked in `project_no_parallelization_yet` memory.
- **A3 colocated pre-commit gap** — jj 0.41 doesn't auto-fire `.git/hooks/pre-commit` after `jj squash` in colocated mode. Three fix paths documented in Phase 4 LEARNINGS Open Q1. Inherited from v1.0 → v1.1 → carries into v1.2.
- **SEED-001: change-id-only on jj adapter surface** — adapter currently exposes both change_id and commit_id on jj (Plan 02 of Phase 7 hit the cross-namespace pain). Move commit_id behind `vcs.jjOnly.commitIdOf(rev)` escape hatch. Auto-surfaces during `/gsd-new-milestone` if the milestone theme matches.

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
| change_id canonical for tracked identity; commit_id for immutable snapshots | jj-idiomatic; aligned with `.planning/` migration intent | ⚠️ Revisit — dual surface is inconsistent across verbs (SEED-001) |
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
*Last updated: 2026-05-14 after v1.1 milestone close. v1.0 + v1.1 requirements consolidated under Validated. Active is empty pending v1.2 scoping. SEED-001 + parallelization-rewrite + A3-gap tracked as v1.2 candidates.*
