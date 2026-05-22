---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: jj octopus merge for subagents fully functional
status: executing
stopped_at: Phase 13 context gathered
last_updated: "2026-05-22T20:11:43.201Z"
last_activity: 2026-05-22 -- Phase 13 planning complete
progress:
  total_phases: 5
  completed_phases: 4
  total_plans: 29
  completed_plans: 25
  percent: 80
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-15 at v1.3 open)

**Core value:** Every upstream GSD command works correctly on a jj-only repo without git — full GSD workflow on a jj backend with no degradation in behavior or test coverage.
**Current focus:** Phase 13 — CI parallel-path lane + lint close-gate

## Current Position

Phase: 13
Plan: Not started
Status: Ready to execute
Last activity: 2026-05-22 -- Phase 13 planning complete

## Performance Metrics

**Velocity:**

- Total plans completed: 93 (v1.0: 56 + v1.1: 5 + v1.2: 3 + v1.3: 0)
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
| Phase 09 P01 | 6min | 1 tasks | 1 files |
| Phase 9 P02 | 7min | 3 tasks | 4 files |
| Phase 9 PP03 | 10min | 2 tasks | 2 files |
| Phase 09-jj-side-parallel-verbs P09.04 | 11min | 1 tasks | 1 files |
| Phase 09-jj-side-parallel-verbs P09.05 | 25min | 1 tasks | 2 files |
| Phase 10 P01 | 5min | 2 tasks | 2 files |
| Phase 10 P02 | 10min | 2 tasks | 2 files |
| Phase 10-git-side-parallel-verbs-classifier-extension P03 | 5min | 2 tasks | 2 files |
| Phase 10-git-side-parallel-verbs-classifier-extension P04 | 10min | 1 tasks | 2 files |
| Phase 10 P05 | 15min | 2 tasks | 2 files |
| Phase 10 P06 | 5min | 1 tasks | 1 files |
| Phase 11 P1 | 12min | 2 tasks | 2 files |
| Phase 11 P02 | 10min | 4 tasks | 7 files |
| Phase 11 P03 | 22min | 2 tasks | 4 files |
| Phase 11 P04 | 17min | 2 tasks | 7 files |
| Phase 11 P05 | 15min | 1 tasks | 1 files |
| Phase 11 P06 | 10min | 1 tasks | 1 files |
| Phase 11 P09 | 18min | 4 tasks | 5 files |
| Phase 11 P07 | 20min | 3 tasks | 4 files |
| Phase 11 P11-08 | 15min | 4 tasks | 3 files |
| Phase 11 P11-10 | 3min | 2 tasks | 2 files |
| Phase 12 P01 | 3min | 2 tasks | 2 files |
| Phase 12 P02 | 5min | 1 tasks | 1 files |
| Phase 12 P03 | 2min | 1 tasks | 1 files |

## Accumulated Context

### Roadmap Evolution

- **Phase 9 discuss 2026-05-15:** PARALLEL-03 (liveness probe) and PARALLEL-04 (repo-scoped lock) dropped at premise level. Orchestrator awaits `Agent()` completion before fanIn → no production scenario where a workspace is mid-write. In `octopus.ts` topology each subagent owns a distinct change at distinct change_id → agents never squash into shared ancestors → no inter-process contention. fanIn signature locked at two-arg `fanIn(handle, results)` with frozen-JSON Handle per SDK pure-data convention. Reap classifier widens 1→2 in `reap.ts` during Phase 9; Phase 10 adds git-side producer. See `09-CONTEXT.md`.
- **v1.3 opened 2026-05-15:** 6-phase shape derived from (originally 29, now 27) requirements; verb namespace locked at `vcs.workspace.parallel.*` (Tension 1 resolved); A3 fix path deferred to Phase 12 discuss-phase decision (Tension 3 NOT pre-decided); no migration command for default-flip (subagent workspaces ephemeral); lint allowlist framing locked at +0/+1 (production entries stay); dogfood is LAST (Pitfall 10); CI parallel-path lane (Phase 13) ships BEFORE default-flip (Phase 14).
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
- [Phase ?]: Phase 9 Plan 01: VcsWorkspaceParallel type contract landed; wave-2 compile gate active (backends/jj.ts + incomplete-work.ts fail tsc until plans 02/03/04 wire parallel field + closed-union reason)
- [Phase ?]: Phase 9 Plan 01: kept baselineOpId? on ParallelDispatchHandle.workspaces[] as documented forward-compat reservation (D-06 planner discretion) rather than YAGNI-stripping
- [Phase ?]: Phase 9 plan 02: enumerateConflictedPaths sidecar extraction + three-branch reap classifier + parse-time reason validator — UPSTREAM-02 preserved end-to-end
- [Phase ?]: Phase 9 plan 03: workspace.parallel composition layer landed — performJjParallel{Dispatch,FanIn} in sdk/src/vcs/jj/parallel.ts; UPSTREAM-02 preserved; W1 agentId pre-write validation + W3 (a) octopus-conflict joint-assertion producer wired; wave-2 tsc gate on JjVcsAdapter closed (git.ts remains until plan 04)
- [Phase ?]: Mirrored RESEARCH §Stub pattern verbatim — single Object.freeze with two throwing members at the end of the workspace freeze block (plan 09-04)
- [Phase ?]: Imported VcsNotImplementedError into the existing types.js import group rather than adding a new import line (plan 09-04)
- [Phase 09]: Phase 9 plan 05: Three plan 03 fanIn bugs (stale baseRev slot heads; enumerateConflictedPaths called without conflicts() gate; jj bookmark list --no-graph invalid) Rule-1 fixed during integration; TEST-13 jj + TEST-14 divergent() gate green (7/7 passing)
- [Phase 10]: Phase 10 Plan 01: cascade-amendment doc edits — D-09 (ROADMAP SC3) + D-10 (REQUIREMENTS PARALLEL-02 git-side) + D-11 (REQUIREMENTS TEST-15 reframe) shipped verbatim per CONTEXT.md; no octopus-form language survives in either authoritative file
- [Phase ?]: Phase 10 Plan 02: combined Tasks 1+2 into a single commit on the new sdk/src/vcs/git/parallel.ts (stub-then-fill commit had no reviewable value)
- [Phase ?]: Phase 10 Plan 02: omit baseRef from workspace.add DI call (ParallelDispatchOpts.plan items per types.ts:464-469 do not carry baseRef; mirrors jj-side default-to-HEAD behavior)
- [Phase ?]: Phase 10 Plan 03: backend wire-in landed — backends/git.ts:723-734 throwing stub replaced with Object.freeze({dispatch, fanIn}) delegating to Plan 10.02 sidecar; cross-backend FanInResult contract now ships uniform on git
- [Phase ?]: Phase 10 Plan 03: deleted VcsNotImplementedError import from backends/git.ts (zero remaining references after stub removal); preserved file-local 2-space indentation despite project tabs preference
- [Phase ?]: Phase 10 Plan 03: lint allowlist net diff is +1 (entries: 23 -> 24) — single new entry for sdk/src/vcs/git/parallel.ts; honors framing-locked +0/+1 invariant from STATE.md
- [Phase ?]: Phase 10 Plan 05: closed SC2/CR-01 (crashedAgentIds gate in STEP 1) + SC3/CR-02 (expectedNames filter in STEP 3); 6 literal it blocks / 8 vitest passes; pre-existing lint-vcs-no-commit-id failure at line 355 deliberately deferred to plan 10-06
- [Phase ?]: Phase 10 Plan 06: SC5 closed via toBeIdOf matcher swap at line 355; zero allowlist diff; zero annotations
- [Phase ?]: Phase 11 Plan 01: jj-side bookmark plumbing retired per D-02; FanInResult.surplusBookmarks contract preserved; test assertions flipped to vcs.workspace.list() source-of-truth; validateAgentBookmarkName helper deleted as dead code
- [Phase ?]: Phase 11 Plan 01: clean-branch workspace-count assertion deviated from plan's literal '=== 0' to '=== handle.workspaces.length' because Phase 9 fanIn does not abandon clean-agent workspaces (cleanup wiring is downstream Phase 11 work); will flip back to 0 when 11.04/11.05 wires clean-workspace cleanup
- [Phase ?]: Phase 11 Plan 02: 3 SDK CLI bridges shipped (workspace.assert-dispatched-cwd + parallel.dispatch + parallel.fan-in); list()[0]===primary convention is load-bearing for the minimal predicate
- [Phase ?]: Phase 11 Plan 02: emit null (not undefined) for absent optional JSON fields so envelope shape stays stable across JSON.stringify
- [Phase ?]: Phase 11 Plan 04: collapsed 4 gsd-executor.md worktree-aware guards (#2924/#3097/#3099/namespace) into one workspace.assert-dispatched-cwd verb call; D-06 deletion check + destructive_git_prohibition byte-identical
- [Phase ?]: Phase 11 Plan 04: renamed references/worktree-path-safety.md to dispatch-cwd-safety.md with backend-agnostic body documenting the verb shape; regression test flipped per A5 (file name preserved to retain bug-NNNN traceability)
- [Phase ?]: Phase 11 Plan 05: deleted raw-git dispatch+cleanup blocks in execute-phase.md; rewired to workspace.parallel.{dispatch,fan-in}; WAVE_WORKTREE_MANIFEST eliminated per D-01; sequential Agent() pattern preserved
- [Phase ?]: Plan 11.6: Quick.md routes parallel dispatch through workspace.parallel.{dispatch,fan-in} SDK verbs (PROMPT-07 + D-09). Pitfall 3 honored — uses project-level USE_WORKTREES, not per-plan USE_WORKTREES_FOR_PLAN. Workflow-markdown consumer migration (PROMPT-06/07/08/09) complete.
- [Phase ?]: Phase 11 Plan 09: WR-01 manifest writer retired in jj/parallel.ts; WR-02 ok-derivation honors incompleteQueued; IN-02 workspace.* verbs documented in --help; WR-04 worktree dispatcher case removed (Option A — zero live callers)
- [Phase 11]: Phase 11 Plan 07: CR-01/CR-04/WR-03 jj-correctness gap-closure shipped. OQ-1 chosen Option A (narrow on vcs.kind inside the verb body) over Option B (extend WorkspaceInfo) — smaller blast radius and milestone framing scopes vcs.kind avoidance to workflows not internal SDK verbs. VCS-20 + PROMPT-08 ready to flip BLOCKED → SATISFIED on verifier re-run.
- [Phase ?]: Phase 11 Plan 08: closed CR-02 (quick.md dispatch plan-array shape + numeric --phase 0 + HANDLE_OK guard) and CR-03 (EXPECTED_BRANCH empty/HEAD pre-check in both workflows); regression test pinned; PROMPT-07 + PARALLEL-06 ready to flip
- [Phase ?]: Phase 11 Plan 10: PROMPT-06 BLOCKER cluster A closed — constructed WAVE_WORKTREE_PLANS_JSON via jq -R . | jq -sc pipeline + switched --phase to ${PHASE_NUMBER}; regression test extended with 3 new EXEC carry-over assertions (load-bearing-verified via jj restore --from @--)
- [Phase 12]: Phase 12 Plan 01: cascade-amendment doc edits — ROADMAP Phase 12 SC2/SC3 + REQUIREMENTS HOOK-06/HOOK-07 rewritten from .git/hooks/pre-commit to .githooks/pre-commit per CONTEXT D-02/D-03; SC3 drops the jj-colocated-hooks.test.ts alternative filename and points at the in-file jj-hooks.test.ts:167 extension (D-04) — The jj adapter's fireHook shells .githooks/<stage>, not git's .git/hooks/<stage>; authoritative phase docs must name the real fire surface so the Wave-2 test/audit plans cite correct wording (Phase 10 plan 10-01 cascade-amendment precedent)
- [Phase 12]: Phase 12 Plan 02: HOOK-07 fires-exactly-once regression test added as a sibling it() inside the existing jj-colocated describe block at jj-hooks.test.ts:167 (D-04 — no new file/fixture/helper); counter-hook body (echo fired >> markerPath) asserts marker line count === 1 across two independent vcs.commit() calls — the sibling :199 test only asserts the hook marker EXISTS (>=1 fire); HOOK-07's net-new exact-count assertion catches a future double-fire or a re-introduced D-10 colocated no-op
- [Phase 12]: Phase 12 Plan 02: treated the tdd-flagged plan as a single test(...) commit with no separate RED/GREEN — Path 1 production code is already shipped at jj.ts:249-289 (Phase 5 plan 05-01); the regression test guards shipped behavior and is EXPECTED to pass on first run per the plan's acceptance_criteria, so the plan-level TDD fail-fast-on-passing-RED rule does not apply
- [Phase 12]: Phase 12 Plan 03: classified all 5 hook operations as idempotent — every operation in .githooks/pre-commit + pre-push is a read-only inspection (staged-diff read, env-var read, commit-history read) feeding an accept/reject decision; none mutate index/working-tree/refs, so the jj.ts:264-266 idempotency assumption holds for the installed scripts
- [Phase 12]: Phase 12 Plan 03: recorded the SC4 empty-finding baseline explicitly per D-05 (0 non-idempotent operations, dated 2026-05-21); standalone artifact at 12-HOOK-IDEMPOTENCY-AUDIT.md so a future contributor adding a non-idempotent hook op has a dated prior record to reconcile against

### Pending Todos

None yet for v1.3. Phase 9 discuss/plan steps will surface plan-level todos.

### Blockers/Concerns

- **~~Pitfall 1~~ (SUPERSEDED 2026-05-15 by Phase 9 D-02):** Pitfall posited "concurrent `jj squash` from N workspaces against shared ancestor diverges silently." Phase 9 discuss rejected the premise: `octopus.ts` topology gives each subagent a distinct change at distinct change_id; agents only squash into their own `@-`. The orchestrator-only operations (`createPhaseStructure`, fanIn, bookmark advance) run in single processes. No inter-process contention exists. No `acquireJjRepoLock`. TEST-14 stays as a topology assertion (not lock-effectiveness).
- **Pitfall 2 (Phase 9+10 same-PR coupling):** In-tree conflicts on octopus merge get classified as crashes by reap unless `FanInResult.conflicted: boolean` ships. `IncompleteWorkEntry.reason` enum extends from 1 → **2** values (`'crashed-with-uncommitted-work'` + `'merge-in-tree-conflict'`; `'partial-wave-live-workspace'` dropped because Pitfall 3 superseded). Phase 9 lands enum + jj producer in `reap.ts`; Phase 10 adds git producer.
- **~~Pitfall 3~~ (SUPERSEDED 2026-05-15 by Phase 9 D-01):** Pitfall posited "partial-wave failure with one agent still running needs a liveness probe before reap." Phase 9 discuss rejected the premise: the orchestrator awaits `Agent()` completion before calling fanIn, so no production scenario has a workspace mid-write. No `PARALLEL-03`. `FanInResult` does NOT carry `liveWorkspaces` / `partial: true`. `git worktree remove --force` is still forbidden in the cross-backend path (non-force only) — that constraint survives independent of the dropped probe.
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

Last session: 2026-05-22T12:35:55.942Z
Stopped at: Phase 13 context gathered
Resume file: 

.planning/phases/13-ci-parallel-path-lane-lint-close-gate/13-CONTEXT.md

- Phase 12 (A3 fix) is an independent parallel track — may be planned/executed in parallel with Phases 9/10/11; joins at Phase 13 CI integration.
