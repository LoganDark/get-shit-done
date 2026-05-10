---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Phase 2 context gathered
last_updated: "2026-05-10T02:30:40.571Z"
last_activity: 2026-05-10 -- Phase 2 planning complete
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 17
  completed_plans: 5
  percent: 29
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-09)

**Core value:** Every upstream GSD command works correctly on a jj-only repo without git — full GSD workflow on a jj backend with no degradation in behavior or test coverage.
**Current focus:** Phase 01 — adapter-foundation-git-backend

## Current Position

Phase: 2
Plan: Not started
Status: Ready to execute
Last activity: 2026-05-10 -- Phase 2 planning complete

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**

- Total plans completed: 5
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 5 | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01 P01 | 2m49s | 2 tasks | 4 files |
| Phase 01 P02 | ~12m | 4 tasks | 14 files |
| Phase 01 P03 | ~12m | 3 tasks | 14 files |
| Phase 01 P04 | ~10m | 3 tasks | 6 files |
| Phase 01 P05 | ~6m | 3 tasks | 5 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Pre-Phase-1: VCS adapter abstraction (frozen-object factory, TypeScript-first with `dist-cjs/` build target) is the highest-leverage move; Branch-by-Abstraction over Strangler Fig because git is deep in the SDK.
- Pre-Phase-1: jj backend uses squash-based commit model (`jj squash -B @ -k -m`); `jj commit` is never invoked.
- Pre-Phase-1: Working-copy auto-snapshot is allowed by default; `--ignore-working-copy` is never passed by adapter code.
- Pre-Phase-1: Orchestrator pre-creates each subagent's head change and workspace (octopus structure created lazily on first fan-out).
- Pre-Phase-1: Hooks Tier 1 only in v1 — colocated default + jj-native non-colocated direct trigger; PATH-shim wrapper deferred to v2.
- [Phase ?]: Plan 01-01: introduced sdk/src/vcs/_placeholder.ts as a one-line stub to satisfy tsc's empty-include guard (TS18003); plan 01-02 may delete it once real adapter modules land
- [Phase 01-02]: Plan 01-02: dist-cjs needs `package.json {type:commonjs}` shim — without it Node 25's require(esm) interop loads compiled CJS as null-prototype ESM; build:cjs script writes the shim
- [Phase 01-02]: Plan 01-02: parseBackendsEnv returns structured `{available, requested, unavailable}` (B-4 shape) so callers can warn instead of silently running zero tests
- [Phase 01-02]: Plan 01-02: createGitAdapterStub returns a frozen object whose every method throws GSDError('not yet implemented') — plan 03 swaps in real createGitAdapter without changing factory signature
- [Phase 01-02]: Plan 01-02: deleted sdk/src/vcs/_placeholder.ts (real adapter modules now satisfy tsc empty-include guard)
- [Phase 01-03]: Plan 01-03: dual-build module specifier resolution uses eval-guarded `__filename`/`import.meta.url` and filters for absolute-path-looking values — `node -e '…'` sets __filename to '[eval]' which createRequire rejects, so we fall through to a process.cwd() anchor.
- [Phase 01-03]: Plan 01-03: vcs.findConflicts({scope:'all'}) returns [] on git — RESEARCH Open Q1 documents the asymmetry; Phase 3 jj backend implements the real `conflict()` revset semantics.
- [Phase 01-03]: Plan 01-03: vcs.refs.bookmarks.list returns Bookmark[] with rev='' (RESEARCH Open Q2) — Phase 1 promotes to per-item rev-parse only when a caller demands resolved revs.
- [Phase 01-03]: Plan 01-03: snapshot/restore uses strategy 3 (refs/gsd/test-snapshot + reset --hard + clean -fdx) — only strategy that pins HEAD without touching index/working-tree intermediates, matters for vitest parallel-module fixture restore.
- [Phase 01-03]: Plan 01-03 [Rule 3]: get-shit-done/bin/lib/worktree-safety.cjs now exports readWorktreeList — promoted from internal helper to module surface so VcsAdapter.workspace.list can DI it (ADR-0004 alignment, RESEARCH Pitfall 5).
- [Phase 01-03]: Plan 01-03: capture-vcs-baselines.cjs moved to tests/__tools__/ (rather than deleted) — Phase 2 will expand the baseline corpus as it migrates each call site.
- [Phase ?]: Plan 01-04: vcs-fixture seeds an initial empty commit before snapshotting (W-5) so HEAD~1 / vcs.refs.parent resolves on the first test in any describe block.
- [Phase ?]: Plan 01-04: tests/helpers.cjs uses Object.defineProperty lazy getters for BACKENDS_AVAILABLE / parseBackendsEnv re-exports — defers dist-cjs require until first access, keeps pre-build guard friendly for non-VCS tests.
- [Phase ?]: Plan 01-04: skip-count CI guard uses W-3 dual-defense — workflow YAML pins fetch-depth: 0 on lint-tests checkout AND scripts/check-skip-count.cjs hard-fails under CI=true if origin/main is missing.
- [Phase 01-05]: Plan 01-05: no-raw-git lint guard uses W-4 isolated-fixture pattern — `--scan-root <dir>` argv lets fixture tests scan os.tmpdir() trees so production-mode and fixture-mode scans cannot collide; `__lint-fixture-vcs-*` in .gitignore is belt-and-suspenders against accidental repo-root pollution.
- [Phase 01-05]: Plan 01-05 [Rule 2]: extended allowlist to cover sdk/src/init-runner.ts (Phase 2 migration target — sibling to sdk/src/query/init.ts), sdk/src/**/*.integration.test.ts glob (legitimate fixture-seeding sites), and tests/__tools__/capture-vcs-baselines.cjs (plan-03 regenerator helper). Without these, the lint would fire on Phase 1's land state — RESEARCH Pitfall 2.
- [Phase 01-05]: Plan 01-05: D-17/D-18 (whole-repo default-deny on ALL git invocations, not just mutating verbs) tightens VCS-07's literal wording. REQUIREMENTS.md VCS-07 marked Complete (01-05) with the tightening noted inline.

### Pending Todos

None yet.

### Blockers/Concerns

- **Requirement-count discrepancy:** REQUIREMENTS.md self-reports "78 v1 requirements across 13 categories" but actually contains 86 requirements across 15 categories (added SQUASH and BROWN as separate sections during requirement definition, plus larger category sizes). Roadmap maps the actual 86. REQUIREMENTS.md footer should be reconciled at next phase transition.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none — first milestone)* | | | |

## Session Continuity

Last session: 2026-05-10T00:57:15.729Z
Stopped at: Phase 2 context gathered
Resume file: .planning/phases/02-bulk-call-site-migration-still-git-only/02-CONTEXT.md

## Known Pre-Existing Test Failures (Non-Blocking)

- `sdk/src/query/commit.test.ts:304` — "fatal: failed to write commit object" during git init/commit setup. Not introduced by 01-02; surfaced when running the full unit suite. Out of scope per executor SCOPE BOUNDARY.
- `sdk/src/query/config-mutation.test.ts:441` — `expect(raw.commit_docs).toBe(true)` failing. Not introduced by 01-02. Out of scope.

These should be triaged in a future maintenance plan.
