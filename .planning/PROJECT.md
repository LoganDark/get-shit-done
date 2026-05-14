# GSD jj-port

## What This Is

A hard fork of [`gsd-build/get-shit-done`](https://github.com/gsd-build/get-shit-done) that ports GSD from git to **Jujutsu (jj) VCS** while preserving full feature parity with upstream. The fork tracks upstream main via live rebase (jj's anonymous-branch model) and is intended for personal use — no PRs flow back to upstream.

## Core Value

**Every upstream GSD command works correctly on a jj-only repo without git** — the user can run their full GSD workflow (new project, plan, execute, ship, hotfix, complete-milestone, multi-workspace) against a jj backend with no degradation in behavior or test coverage.

## Requirements

### Validated

<!-- Inferred from upstream working state — these are GSD capabilities that already work on git and must continue to work on git in this fork. -->

- ✓ Full GSD workflow on git (new-project → discuss → plan → execute → verify → ship) — upstream
- ✓ Worktree-based parallel phase execution — upstream (16 SDK files, ~80 tests)
- ✓ Hotfix, canary, and milestone flows on git — upstream
- ✓ Multi-runtime support (Claude / Codex / Gemini / OpenCode) — upstream
- ✓ Hook-based commit validation (pre-commit, pre-push) — upstream

### Active

<!-- v1 scope: every Validated capability above, but on jj as well as git. -->

**Adapter foundation**

- [x] **VCS-01**: VCS adapter interface defined in `sdk/src/vcs/` with explicit contract for every operation GSD performs (commit, log, status, branch/ref-equiv, worktree/workspace, diff, blame, stash, hook trigger) — *Validated in Phase 1*
- [x] **VCS-02**: Git backend implementation of the adapter, behaviorally equivalent to existing inline git calls — *Validated in Phase 1 (5 byte-identity baselines pass)*
- [ ] **VCS-03**: jj backend implementation of the adapter, behaviorally equivalent to git backend on every contract method
- [x] **VCS-04**: Backend selection mechanism (auto-detect via `.git`/`.jj` presence, override via config) — *Validated in Phase 1*
- [ ] **VCS-05**: Existing call sites in `bin/lib/{core,verify,commands,worktree-safety,init,graphify,drift}.cjs` migrated to the adapter
- [ ] **VCS-06**: Existing call sites in `sdk/src/query/{commit,init,verify,progress,check-ship-ready,check-decision-coverage,docs-init}.ts` migrated to the adapter

**Brownfield workflows on jj** (priority dogfood surface — this repo runs jj)

- [ ] **BROWN-01**: `/gsd-map-codebase` works on a jj repo
- [ ] **BROWN-02**: `/gsd-import` works on a jj repo
- [ ] **BROWN-03**: `/gsd-ingest-docs` works on a jj repo
- [ ] **BROWN-04**: `/gsd-resume-work` works on a jj repo
- [ ] **BROWN-05**: `/gsd-ship`, `/gsd-pr-branch`, `/gsd-undo` flows work on a jj repo

**Greenfield workflows on jj**

- [ ] **GREEN-01**: `/gsd-new-project` initializes a jj repo when no `.git` is present
- [ ] **GREEN-02**: `/gsd-plan-phase` and `/gsd-execute-phase` operate end-to-end on jj
- [ ] **GREEN-03**: `/gsd-verify-work` and `/gsd-complete-milestone` work on jj

**Worktree → jj-workspace mapping**

- [ ] **WS-01**: Adapter exposes a workspace primitive that maps `git worktree add/remove/list/lock` to `jj workspace add/forget/list` plus the locking semantics GSD relies on
- [ ] **WS-02**: Worktree-locking and stagger logic preserved (no `.git/index.lock` analog — design alternative)
- [ ] **WS-03**: Worktree-path-safety guards (`bug-3097/3099`, `bug-2774`, etc.) work against jj workspaces

**Hooks (jj-native)**

- [ ] **HOOK-01**: jj-native pre-commit equivalent fires on `jj commit`/`jj describe` via op-log polling or `jj util` wrapper — works without git colocation
- [ ] **HOOK-02**: jj-native pre-push equivalent fires on `jj git push` (or jj-native push when applicable)
- [ ] **HOOK-03**: Existing `.githooks/pre-commit`, `.githooks/pre-push` continue to fire when colocated jj is in use (via git side, no port needed)

**Test infrastructure**

- [ ] **TEST-01**: Existing ~80 git-touching tests retargeted to the adapter abstraction
- [ ] **TEST-02**: Tests parameterized to run against both `git` and `jj` backends (test matrix)
- [ ] **TEST-03**: jj test fixtures parallel to git fixtures in `tests/helpers.cjs`
- [ ] **TEST-04**: All worktree edge-case bug tests (`bug-2924`, `bug-2774`, `bug-2075`, `bug-2431`, `bug-3097/3099`, etc.) pass on jj backend

**Workflow / agent prompt updates**

- [ ] **PROMPT-01**: Workflow markdown that instructs git invocations (`workflows/execute-phase.md` 58 mentions, `workflows/quick.md` 46, `agents/gsd-code-fixer.md` 37, `agents/gsd-executor.md` 24, etc.) routed through adapter-aware language or VCS-agnostic helper commands
- [ ] **PROMPT-02**: Multi-runtime variants (Codex / Gemini / OpenCode) updated in lockstep with Claude variants

**Upstream-tracking ergonomics**

- [ ] **UPSTREAM-01**: jj-native rebase workflow documented for pulling upstream main onto fork commits
- [ ] **UPSTREAM-02**: Fork-specific code organized to minimize merge conflicts during rebase (overlay points, sidecar files, or clearly-scoped diffs)

### Out of Scope

- **Removing git support** — adapter keeps git first-class. Removing it breaks upstream rebase ergonomics and dual-backend test coverage.
- **Publishing to npm under upstream's name** — fork is for personal use; no `get-shit-done-cc` republish.
- **Upstreaming changes back to `gsd-build/get-shit-done`** — fork is one-way; rebrand decision deferred but no PRs intended either way.
- **Rebranding (package/skill names) right now** — deferred until usable; default to upstream names while iterating. Re-evaluate when first dogfooded.
- **Non-colocated jj as the only mode** — both colocated and non-colocated jj must work, but colocated is the default dogfood mode (this very repo).
- **Optimizing for non-Claude runtimes specifically** — Codex/Gemini/OpenCode parity preserved per upstream, but bug-fix priority on Claude when conflicts arise.

## Context

**Technical environment**

- Repo carries both `.git` and `.jj` directories (colocated jj already in use locally). Upstream is git-only on GitHub.
- Upstream codebase: ~30k+ LOC across `get-shit-done/bin/lib/*.cjs` (CLI runtime), `sdk/src/` (TypeScript SDK), `commands/` (Claude slash commands), `agents/` (subagent definitions), `hooks/` (lifecycle hooks), `scripts/` (build/lint), `tests/` (~80 git-touching test files, vitest harness).
- pnpm workspace, Node ≥22, vitest. Recently migrated from npm (commit `ae56863a`).
- No central `execGit()` seam exists upstream — git is invoked ad-hoc via raw shell strings throughout. The largest single-leverage move in this project is introducing that abstraction.

**Porting surface intel**

See `.planning/intel/git-touchpoints.md` for the full scan. Headlines:
- 1,234 `git <subcommand>` mentions across 198 files (incl. tests, docs, CI)
- 244 programmatic exec patterns across 36 files
- 139 worktree/workspace mentions in `sdk/src/` alone
- ~5,100 LOC in the top 5 .cjs/.ts hotspot files (`core.cjs`, `verify.cjs`, `commands.cjs`, `worktree-safety.cjs`, `commit.ts`)

**Prior art / framing**

- jj has `jj workspace` as the analog to git worktree. Semantics overlap but are not identical: jj workspaces share the working-copy commit pointer differently, no detached-HEAD model, change IDs instead of commit SHAs.
- jj has no native hook system. Common workarounds: git-colocation (hooks fire via git), op-log polling (detect new operations after the fact), wrapper commands (replace `jj` binary with a script that fires hooks before delegating).
- jj's anonymous-branch + automatic-rebase model is well-suited to upstream tracking — fork commits stay on top of upstream main, conflicts surface during normal `jj rebase`.

**User context**

- Solo developer, focused-sprint posture. Roadmap should be aggressive but with usable checkpoints (not multi-month all-or-nothing phases).
- Will dogfood the fork on this very repo (brownfield) — so brownfield workflows are higher priority than greenfield within full-parity scope.
- Identity (rebrand vs. upstream names) deferred — work under upstream names for now; revisit when first usable.

## Constraints

- **Tech stack**: Node ≥22, pnpm 11+, vitest, TypeScript ≥5 — match upstream exactly. Adapter must be implementable in CJS (for `bin/lib/`) and TS (for `sdk/src/`) without diverging.
- **VCS**: Two backends required: `git` (existing) and `jj`. Both must pass the same test suite.
- **Upstream merge ergonomics**: Fork-specific code must be organized to minimize rebase conflicts when pulling upstream — prefer adapter call-site changes (mechanical) over inline rewrites (conflict-prone).
- **Test parity**: Every existing git-touching test must run against both backends after adapter migration. No coverage regressions.
- **Runtime parity**: Multi-runtime support (Claude/Codex/Gemini/OpenCode) preserved per upstream. Claude-only optimizations not allowed unless explicitly scoped.
- **Dependencies**: Avoid adding heavy npm deps; prefer shelling out to `jj` binary (already required for users) or thin wrappers.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Hard fork (no upstream PRs) | jj-port is too invasive to upstream; user's personal preference | — Pending |
| Use `.planning/` for fork's GSD self-hosting | Collision-free with upstream's `.plans/` and `CONTEXT.md`; clean rebase surface | — Pending |
| VCS adapter abstraction (not direct git→jj substitution) | No central `execGit()` seam exists; adapter is highest-leverage move; preserves git for upstream rebase ergonomics and dual-backend tests | — Pending |
| Worktree → jj-workspace mapping (not drop or sequential) | Worktree-parallelism is core GSD value; jj has analogous primitive; semantic translation is doable | — Pending |
| Tests abstracted via adapter, run against both backends | Highest fidelity; preserves upstream regression coverage; pairs naturally with adapter-first architecture | — Pending |
| Hooks ported jj-native (not just relying on colocation) | Works for non-colocated jj users; future-proofs against upstream changing hook semantics | — Pending |
| Upstream tracking via jj live rebase | Native to user's VCS; minimizes conflict surface vs. merge-based sync | — Pending |
| Identity (package/skill names) deferred | Premature naming distracts from porting; revisit at first usable checkpoint | — Pending |
| Brownfield priority within full-parity scope | User dogfoods on this very repo; brownfield workflows ship value soonest | — Pending |
| Keep all upstream surfaces (i18n, all runtimes, full CI) | Full feature parity is the v1 commitment; scope cuts contradict that | — Pending |

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

**Phase 1 complete (2026-05-09):** Adapter Foundation + Git Backend landed — `sdk/src/vcs/` houses the `VcsAdapter` discriminated-union contract, `createGitAdapter` answers every method byte-identically to the pre-migration `execSync('git …')` baselines, the parameterized two-runner harness (vitest + node:test) is wired with a single source-of-truth `BACKENDS_AVAILABLE`, and the no-raw-git lint guard (whole-repo default-deny) is enforced in CI. Phase 2 (bulk call-site migration) is unblocked.

*Last updated: 2026-05-14
