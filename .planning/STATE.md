---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: jj octopus merge for subagents fully functional
status: planning
last_updated: "2026-05-15T09:44:57.846Z"
last_activity: 2026-05-15
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-14)

**Core value:** Every upstream GSD command works correctly on a jj-only repo without git — full GSD workflow on a jj backend with no degradation in behavior or test coverage.
**Current focus:** Phase 08 — unified-revision-model-audit-test-prep-flip-lint-guard-close

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-05-15 — Milestone v1.3 started

## Performance Metrics

**Velocity:**

- Total plans completed: 65 (across v1.0 + v1.1)
- Average duration: see per-phase table
- Total execution time: 2 milestones, both shipped 2026-05-14

**By Phase (v1.0 + v1.1 archived):**

| Phase | Plans | Status |
|-------|-------|--------|
| 01–06 (v1.0) | 56 | Shipped |
| 07 (v1.1) | 5 | Shipped |
| 08 (v1.2) | TBD | Planning |

*Updated after each plan completion*

## Accumulated Context

### Roadmap Evolution

- v1.2 opened 2026-05-14: SEED-001 subsumed and inverted into v1.2's premise (no escape hatch on cross-backend surface; commit_id leakage from jj is a defect)
- Phase 8 mapped to all 14 v1.2 requirements (AUDIT-01..04, FLIP-01..04, LINT-01..03, PROMPT-05, TEST-12, MIGR-06) — single phase per research recommendation (SUMMARY + ARCHITECTURE)
- v1.1 closed: Phase 7 (5/5 plans) shipped 2026-05-14
- v1.0 closed: 8 phases (53/56 plans) shipped 2026-05-14

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- **v1.2 open (Phase 8):** Unified revision model — cross-backend `vcs.*` namespace exposes ONE revision concept (`commit_id` on git, `change_id` on jj); jj backend never volunteers `commit_id` from any cross-backend verb. Inversion of SEED-001's escape-hatch idea — leakage is a defect.
- **v1.2 phase shape:** Single phase (Phase 8) with sequential plans (audit → test-prep + flip → lint guard + prompt cleanup + close-gate). Lint script *development* parallelizable during Plan 1; first green run gates on Plan 2 close.
- **v1.2 dogfood cutover model:** Phase boundary marker — commits in `commit_id` shape during the phase; single rewriter pass at close-gate (MIGR-06). No mid-phase rewrites; avoids Pitfall 5 (mixed-shape `.planning/` corruption).
- **v1.2 LINT-03 boundary-I/O accessor:** Conditional. Build only if AUDIT identifies a real consumer; expected verdict is ZERO consumers (`github-release-notes.cjs` debunked as false-alarm in research). If zero, codify "no escape hatch exists" as the verified end state.
- **v1.2 rename strategy:** Hard rename, no aliases (`LogEntry.hash` → `LogEntry.id`; `CommitResult.hash` → `CommitResult.id`). Compiler errors are the forcing function. Per PITFALLS Pitfall 8.

### Pending Todos

None yet for v1.2.

### Blockers/Concerns

- **Audit Gap 1 (research):** SEED-001's `vcs.commit() → CommitResult.hash` is INCORRECTLY listed as already-correct in `FEATURES.md`; ARCHITECTURE.md proves it still uses `commit_id` template at `jj.ts:222-227`. FLIP-01 and FLIP-03 both touch this — Plan 2 success requires both flipping the template AND renaming the field.
- **Risk 4 (research, low severity):** jj 0.41 NDJSON `json(self)` template must emit `change_id` field for parser flips. AUDIT Plan 1 includes a one-shot probe; mitigation if absent is a two-pass parse or explicit `'json(self.change_id() ++ ...)'` template — bounded.
- **Pitfall 1 (carried risk):** silent stable-identity semantic flip on `LogEntry.hash` → `LogEntry.id` (snapshot-stable on git, rebase-stable on jj). Mitigated by hard rename (forcing function) + audit verdict-per-consumer classification (snapshot-needed / rebase-stable-needed / indifferent).
- **A3 colocated pre-commit gap (carried from v1.0):** jj 0.41 doesn't auto-fire `.git/hooks/pre-commit` after `jj squash` colocated. Three fix paths in Phase 4 LEARNINGS Open Q1. Carries past v1.2 — NOT in v1.2 scope.
- **Orchestrator parallelization rewrite (carried from v1.0):** `execute-phase.md` raw-git worktree dispatch (~lines 714+) → jj octopus + reap. `parallelization` knob stays `false` until rewired. Carries past v1.2 — NOT in v1.2 scope.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Architecture | Orchestrator parallelization rewrite (raw-git worktree dispatch → jj octopus + reap) | Carries past v1.2 | v1.0 → v1.1 → v1.2 open |
| Hooks | A3 colocated pre-commit gap (jj 0.41 doesn't auto-fire `.git/hooks/pre-commit` after `jj squash` colocated) | Carries past v1.2 | v1.0 → v1.1 → v1.2 open |
| Lint | LINT-04 markdown / `.planning/` prose-level lint (separate from `lint-vcs-no-commit-id.cjs`) | Deferred to v1.3 | v1.2 open |
| API | TEST-13 `vcs.refs.matchPrefix(id, prefix)` alphabet-aware short-prefix matching | Conditional on v1.2 audit verdict | v1.2 open |
| Naming | NAMING-01 cosmetic rename `rootCommits` → `rootRevisions` | Deferred (low value, high churn) | v1.2 open |
| API | API-01 public `vcs.refs.idAlphabet` introspection | Deferred (no consumer asks yet) | v1.2 open |

## Session Continuity

Last session: 2026-05-15T04:19:25.188Z
Stopped at: Phase 8 context gathered
Resume file: .planning/phases/08-unified-revision-model-audit-test-prep-flip-lint-guard-close/08-CONTEXT.md

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
