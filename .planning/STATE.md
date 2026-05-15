---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: jj octopus merge for subagents fully functional
status: planning
last_updated: "2026-05-15T10:00:00.000Z"
last_activity: 2026-05-15
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-15 at v1.3 open)

**Core value:** Every upstream GSD command works correctly on a jj-only repo without git — full GSD workflow on a jj backend with no degradation in behavior or test coverage.
**Current focus:** v1.3 — Phase 9 ready for planning (jj-side parallel verbs + repo-scoped lock)

## Current Position

Phase: 9 — jj-side parallel verbs + repo-scoped lock (not yet planned)
Plan: —
Status: Roadmap complete; awaiting `/gsd-plan-phase 9`
Last activity: 2026-05-15 — Milestone v1.3 roadmap recorded (6 phases, 29 requirements mapped)

## Performance Metrics

**Velocity:**

- Total plans completed: 68 (v1.0: 56 + v1.1: 5 + v1.2: 3 + v1.3: 0)
- Average duration: see per-milestone table
- Total execution time: 3 milestones shipped (v1.0, v1.1, v1.2)

**By Milestone:**

| Milestone | Phases | Plans | Status |
|-----------|--------|-------|--------|
| v1.0 | 8 | 56 | Shipped 2026-05-14 |
| v1.1 | 1 (Phase 7) | 5 | Shipped 2026-05-14 |
| v1.2 | 1 (Phase 8) | 3 | Shipped 2026-05-15 |
| v1.3 | 6 (Phases 9–14) | 0 | Planning |

*Updated after each plan completion*

## Accumulated Context

### Roadmap Evolution

- **v1.3 opened 2026-05-15:** 6-phase shape derived from 29 requirements; verb namespace locked at `vcs.workspace.parallel.*` (Tension 1 resolved); A3 fix path deferred to Phase 12 discuss-phase decision (Tension 3 NOT pre-decided); no migration command for default-flip (subagent workspaces ephemeral); lint allowlist framing locked at +0/+1 (production entries stay); dogfood is LAST (Pitfall 10); CI parallel-path lane (Phase 13) ships BEFORE default-flip (Phase 14).
- v1.2 closed 2026-05-15: Phase 8 (3/3 plans) — SEED-001 inverted, `lint-vcs-no-commit-id.cjs` enforcing 1032 files / 0 violations.
- v1.1 closed 2026-05-14: Phase 7 (5/5 plans) — 8 new VcsAdapter verbs, wave-cleanup wired, raw-git fallbacks deleted.
- v1.0 closed 2026-05-14: 8 phases (53/56 plans) — dual-backend foundation complete.

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. v1.3-specific decisions (locked at roadmap time):

- **Verb namespace** locked at `vcs.workspace.parallel.*` (sub-sub-namespace under `workspace`, precedent: `refs.bookmarks.*`). Not top-level `vcs.parallel.*`.
- **A3 fix path** NOT pre-decided at roadmap time. Phase 12 discuss-phase chooses Path A / Path B / Path 1 by re-reading Phase 4 LEARNINGS Open Q1 (archived `51ee72a3`). Path C (version-probe) rejected.
- **No migration command** for default-flip. Subagent workspaces are ephemeral; nothing to migrate. Only gate is CONFIG-02 pre-flight refusal on explicit `false`.
- **Lint allowlist framing**: `lint-vcs-no-raw-git.allow.json` net change is +0 or +1 (optional addition is `sdk/src/vcs/git/parallel.ts` adapter-internal). The 23 production entries stay. The "collapse to zero" target is `.md` shell-fence blocks (workflow-markdown raw-git), validated via one-shot `scripts/audit-workflow-raw-git.cjs` (Phase 13).
- **Dogfood phase is LAST** (Pitfall 10 blast-radius). Phase 14, after CI green.
- **CI parallel-path lane ships BEFORE default-flip** (CI-05/06 in Phase 13 → CONFIG-01/02 in Phase 14). Validates verbs in real CI before user-observable flip.
- **Same-PR coupling on `FanInResult` shape**: PARALLEL-02 jj-side contract + git-side contract must ship together (per v1.2 retro precedent). Phase 10 finalizes the cross-backend shape.

### Pending Todos

None yet for v1.3. Phase 9 discuss/plan steps will surface plan-level todos.

### Blockers/Concerns

- **Pitfall 1 (Phase 9 critical):** Concurrent `jj squash` from N workspaces against shared ancestor diverges silently. Phase 4 `acquireJjWriteLock` is per-workspace, not per-repo. Phase 9 MUST ship `acquireJjRepoLock` at `.jj/repo/gsd-parallel-lock` with distinct sentinel + contract (held across full dispatch→fanIn window). Cross-workspace contract test required (TEST-14: `divergent()` revset empty post-fan-in).
- **Pitfall 2 (Phase 9+10 same-PR coupling):** In-tree conflicts on octopus merge get classified as crashes by reap unless `FanInResult.conflicted: boolean` ships. `IncompleteWorkEntry.reason` enum extends from 1 → 3 values. Same-PR coupling between jj-side + git-side per v1.2 retro pattern.
- **Pitfall 3 (Phase 9+10):** Partial-wave failure with one agent still running needs a liveness probe before reap. `git worktree remove --force` forbidden in cross-backend path; non-force only. Returns `{partial: true, liveWorkspaces: [...]}` if any workspace is mid-write.
- **Pitfall 5 (Phase 10):** `.git/config.lock` race on simultaneous `git worktree add`. Internal serialization in `sdk/src/vcs/git/parallel.ts` (not prompt-text rule).
- **Pitfall 10 (Phase 14 last):** Dogfood blast-radius — pre-snapshot via `jj op log` + `.planning/` tarball, isolated bookmark only, synthetic plans, loud-fail rollback.
- **Carry-forward (A3, Phase 12):** jj 0.41 doesn't auto-fire `.git/hooks/pre-commit` after `jj squash` colocated. Three fix paths in Phase 4 LEARNINGS Open Q1 (archived `51ee72a3`). Chosen at Phase 12 discuss-phase.

## Deferred Items

Items acknowledged and carried forward from previous milestone close (status updated at v1.3 open):

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Architecture | Orchestrator parallelization rewrite (raw-git worktree dispatch → cross-backend `vcs.workspace.parallel.*`) | **IN-SCOPE for v1.3 Phases 9–11** | v1.0 → v1.1 → v1.2 (now closing in v1.3) |
| Hooks | A3 colocated pre-commit gap (jj 0.41 doesn't auto-fire `.git/hooks/pre-commit` after `jj squash` colocated) | **IN-SCOPE for v1.3 Phase 12** | v1.0 → v1.1 → v1.2 (now closing in v1.3) |
| Lint | LINT-04 markdown / `.planning/` prose-level lint (separate from `lint-vcs-no-commit-id.cjs`) | Reframed as v1.3 LINT-04 one-shot `audit-workflow-raw-git.cjs` (Phase 13) | v1.2 |
| API | TEST-13 (v1.2 deferred) `vcs.refs.matchPrefix(id, prefix)` alphabet-aware short-prefix matching | Still deferred — no consumer in v1.3 | v1.2 |
| Naming | NAMING-01 cosmetic rename `rootCommits` → `rootRevisions` | Still deferred (low value, high churn) | v1.2 |
| API | API-01 public `vcs.refs.idAlphabet` introspection | Still deferred (no consumer) | v1.2 |
| API | `vcs.workspace.parallel.cancel(handle)` mid-execution graceful abandonment | Deferred to v1.4+; surfaces if dogfood (Phase 14) reveals need | v1.3 open |
| Lint | Workflow call-presence lint (`vcs.parallel.*` must be called in dispatch sections) | Deferred to v1.4 | v1.3 open |

## Session Continuity

Last session: 2026-05-15T10:00:00.000Z
Stopped at: v1.3 roadmap complete (6 phases written, 29 requirements mapped, STATE + REQUIREMENTS traceability updated)
Resume file: .planning/ROADMAP.md (Phase Details section) → `.planning/phases/09-jj-parallel-verbs-repo-lock/` (to be created by `/gsd-plan-phase 9`)

## Operator Next Steps

- Run `/gsd-plan-phase 9` to discuss + plan the first v1.3 phase (jj-side parallel verbs + repo-scoped lock).
- Phase 12 (A3 fix) is an independent parallel track — may be planned/executed in parallel with Phases 9/10/11; joins at Phase 13 CI integration.
