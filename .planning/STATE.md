---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: Clean, consistent state for next upstream pull
status: executing
stopped_at: Phase 14.1 context gathered
last_updated: "2026-05-24T19:43:19.198Z"
last_activity: 2026-05-24 -- Phase 15 planning complete
progress:
  total_phases: 2
  completed_phases: 0
  total_plans: 4
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-24 at v1.4 open)

**Core value:** Every upstream GSD command works correctly on a jj-only repo without git — full GSD workflow on a jj backend with no degradation in behavior or test coverage.
**Current focus:** Phase 15 — Adapter surface extensions + rename (NAMING-01 + VCS-21 + VCS-22 + PARALLEL-07)

## Current Position

Phase: 15 — Adapter surface extensions + rename (not started)
Plan: —
Status: Ready to execute
Last activity: 2026-05-24 -- Phase 15 planning complete

## Performance Metrics

**Velocity:**

- Total plans completed: 98 (v1.0: 56 + v1.1: 5 + v1.2: 3 + v1.3: 34)
- Average duration: see per-milestone table
- Total execution time: 4 milestones shipped (v1.0, v1.1, v1.2, v1.3)

**By Milestone:**

| Milestone | Phases | Plans | Status |
|-----------|--------|-------|--------|
| v1.0 | 8 | 56 | Shipped 2026-05-14 |
| v1.1 | 1 (Phase 7) | 5 | Shipped 2026-05-14 |
| v1.2 | 1 (Phase 8) | 3 | Shipped 2026-05-15 |
| v1.3 | 6 (Phases 9–14) | 34 | Shipped 2026-05-24 |
| v1.4 | 4 (Phases 15–18) | 0/13 | Planning |

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
| Phase 13 P01 | 4min | 2 tasks | 3 files |
| Phase 13 P02 | 7min | 2 tasks | 2 files |
| Phase 13 P03 | 9min | 2 tasks | 1 files |
| Phase 13 P04 | 4min | 2 tasks | 2 files |
| Phase 14 P01 | 2min | 2 tasks | 2 files |
| Phase 14 P02 | 14min | 2 tasks | 3 files |
| Phase 14 P03 | 2min | 1 tasks | 1 files |
| Phase 14 P05 | 8min | 3 tasks | 3 files |

## Accumulated Context

### Roadmap Evolution

- **v1.4 roadmap created 2026-05-23:** 4-phase shape (Phases 15-18) derived from research synthesis, 13 plans estimated, 25 v1.4 requirements mapped 100% (no orphans). Phase 15 = adapter surface extensions + rename (NAMING-01, VCS-21, VCS-22, PARALLEL-07; sequential plans on shared types.ts); Phase 16 = workflow + invariant tooling (LINT-06, CLEANUP-02; parallel-safe, consumes Phase 15 helper); Phase 17 = drift control + reconciliation (DOCS-08 fix → DRIFT-01/02 tests → DOCS-01..07/09 batched → PROJECT-01 reconciliation LAST per IP-4); Phase 18 = tactical cleanup + test-flake (CLEANUP-01 transition.md gate FIRST per Pitfall 2, CLEANUP-03..07 per-WR commits per Pitfall 10, TEST-17 narrow scope per Pitfall 9). One clarification vs research recommendation: PARALLEL-07's plan extracts the shared `cleanupSubagentWorkspaces` helper as its Wave 1 (single-owner per IP-5), then Phase 16 CLEANUP-02 consumes the same helper — avoids cross-phase dependency inversion.
- **Phase 9 discuss 2026-05-15:** PARALLEL-03 (liveness probe) and PARALLEL-04 (repo-scoped lock) dropped at premise level. Orchestrator awaits `Agent()` completion before fanIn → no production scenario where a workspace is mid-write. In `octopus.ts` topology each subagent owns a distinct change at distinct change_id → agents never squash into shared ancestors → no inter-process contention. fanIn signature locked at two-arg `fanIn(handle, results)` with frozen-JSON Handle per SDK pure-data convention. Reap classifier widens 1→2 in `reap.ts` during Phase 9; Phase 10 adds git-side producer. See `09-CONTEXT.md`.
- **v1.3 opened 2026-05-15:** 6-phase shape derived from (originally 29, now 27) requirements; verb namespace locked at `vcs.workspace.parallel.*` (Tension 1 resolved); A3 fix path deferred to Phase 12 discuss-phase decision (Tension 3 NOT pre-decided); no migration command for default-flip (subagent workspaces ephemeral); lint allowlist framing locked at +0/+1 (production entries stay); dogfood is LAST (Pitfall 10); CI parallel-path lane (Phase 13) ships BEFORE default-flip (Phase 14).
- v1.2 closed 2026-05-15: Phase 8 (3/3 plans) — SEED-001 inverted, `lint-vcs-no-commit-id.cjs` enforcing 1032 files / 0 violations.
- v1.1 closed 2026-05-14: Phase 7 (5/5 plans) — 8 new VcsAdapter verbs, wave-cleanup wired, raw-git fallbacks deleted.
- v1.0 closed 2026-05-14: 8 phases (53/56 plans) — dual-backend foundation complete.

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. v1.4-specific decisions (locked at roadmap time):

- **Phase shape** = 4 phases (15-18) by surface-affinity grouping per research synthesis. Phase 15 = adapter; Phase 16 = workflow tooling; Phase 17 = drift control + reconciliation; Phase 18 = tactical cleanup + test-flake.
- **`cleanupSubagentWorkspaces` helper extraction** lives in Phase 15 plan 15.04 Wave 1 (PARALLEL-07's plan). Phase 16 plan 16.02 (CLEANUP-02) consumes the same helper. Single-owner per IP-5 (recovery script as third consumer in Phase 16). Alternative considered: extract in Phase 16 first, Phase 15 PARALLEL-07 consume cross-phase — rejected to avoid cross-phase dependency inversion in canonical execution order.
- **Strict Wave ordering in Phase 17** = Wave 1 (17.01 DOCS-08 prose fixes) → Wave 2 (17.02 DRIFT-01/02 tests) per Pitfall 4 prevention (no day-1 red CI). Reframed audit-as-baseline approach NOT used since fix is bounded (≤15 prose changes across 3 translations).
- **PROJECT.md reconciliation runs LAST** (Phase 17 plan 17.04) per IP-4 — captures v1.4's own REQ-IDs (NAMING-01, VCS-21, VCS-22, PARALLEL-07, LINT-06, CLEANUP-01..07, TEST-17, DRIFT-01/02, DOCS-01..09, PROJECT-01) in the truth source.
- **`transition.md` gate (CLEANUP-01) is HIGHEST PRIORITY within Phase 18** per Pitfall 2 — same false-clean-WC pattern as Phase 14 quick-task; high-risk repeat surface if other v1.4 workflow changes land before it.
- **PARALLEL-07 cancel semantics**: STACK lens (synchronous teardown only, no signal handling) adopted per Pitfall 5 reconciliation. The FEATURES "mixed SIGTERM/SIGKILL" alternative explicitly rejected — assumes a different exec layer than `spawnSync` provides. `CancelResult` shape mirrors `FanInResult` (structured, NOT void/boolean). Discuss-phase 15 confirms.
- **`idAlphabet` return shape** = opaque `readonly string` (`'0-9a-f'` git, `'k-z'` jj). Structured `{kind, chars, minLen, maxLen}` alternative rejected per ARCHITECTURE.md (typed enum would force callers to switch on backend kind, defeating unified-revision-model invariant). YAGNI: widen later if real consumer needs it.
- **Drift-test file count** = TWO separate files (`tests/architecture-counts.test.cjs` + `tests/command-count-sync.test.cjs`). INVENTORY.md theme 6 specifically names both; single-responsibility; separate failure messages. Cross-link via comment.
- **LINT-06 scope** = SHELL FENCE not prose mention per Pitfall 7 (reuse `audit-workflow-raw-git.cjs` fence-aware walker shape); content-driven literal substring detection; default-deny + per-file allowlist for legitimate non-dispatchers (`code-review.md`, `audit-fix.md`); CI-blocking in `parallel-e2e.yml` (NOT pretest per D-07 audit-workflow-raw-git.cjs precedent).
- Verb namespace locked at `vcs.workspace.parallel.*` (sub-sub-namespace under `workspace`, precedent: `refs.bookmarks.*`). Not top-level `vcs.parallel.*`. (Inherited from v1.3.)
- A3 fix path NOT pre-decided at roadmap time. Phase 12 discuss-phase chose Path 1. (v1.3 closed.)
- No migration command for default-flip. Subagent workspaces are ephemeral; nothing to migrate. Only gate is CONFIG-02 pre-flight refusal on explicit `false`. (v1.3 closed.)
- Lint allowlist framing: `lint-vcs-no-raw-git.allow.json` net change is +0 or +1 (optional addition is `sdk/src/vcs/git/parallel.ts` adapter-internal). The 23 production entries stay. The "collapse to zero" target is `.md` shell-fence blocks (workflow-markdown raw-git), validated via one-shot `scripts/audit-workflow-raw-git.cjs` (Phase 13). (v1.3 closed.)
- Dogfood phase is LAST (Pitfall 10 blast-radius). Phase 14, after CI green. (v1.3 closed.)
- CI parallel-path lane ships BEFORE default-flip (CI-05/06 in Phase 13 → CONFIG-01/02 in Phase 14). Validates verbs in real CI before user-observable flip. (v1.3 closed.)
- Same-PR coupling on `FanInResult` shape: PARALLEL-02 jj-side contract + git-side contract must ship together (per v1.2 retro precedent). Phase 10 finalizes the cross-backend shape. (v1.3 closed.)
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
- [Phase ?]: Phase 13 Plan 01: cascade-amendment doc edits — ROADMAP Phase 13 SC2/SC3 + CONTEXT D-08 + Phase Boundary + REQUIREMENTS LINT-04/CI-06 re-baselined from a false 'zero raw-git hits' assertion to the baseline-regression-guard framing (audit carries a frozen 127-hit baseline, fails only on raw-git ADDED beyond it; first green run current == baseline == pass) per RESEARCH Open Q1; the Phase 13 Goal line's 'collapses to zero' milestone framing left untouched (explicitly out of scope)
- [Phase 13]: Phase 13 Plan 02: shipped scripts/audit-workflow-raw-git.cjs (LINT-04) — baseline storage is an embedded Object.freeze const over a companion JSON; live-tree re-scan reproduced the 127-hit verified_baseline exactly (no drift); CI-gate exit process.exit(result.ok ? 0 : 1) is the deliberate divergence from audit-id-namespace.cjs
- [Phase 13]: Phase 13 Plan 02: discovered a pre-existing +4 skip-count regression on the Phase 13 branch (22 vs origin/main 18) from Phase 10/11 cmd-*.test.ts files — out of plan 13-02 scope, logged to deferred-items.md; plan 13-02's two new files add zero net skips
- [Phase 13]: Phase 13 Plan 03: git-backend repo init in the CI-05 harness routes through 'jj git init --colocate' (raw jj, lint-clean) — no gsd-sdk query verb runs git init and D-09 forbids raw git; a colocated repo is a valid .git repo and GSD_VCS=git pins the git adapter
- [Phase 13]: Phase 13 Plan 03: gsd-sdk query commit has NO --cwd flag (Open Q2 / Assumption A3 RESOLVED) — resolves projectDir from process.cwd(); harness runs per-workspace commits in cwd-pinned subshells, a .planning/ marker per workspace stops findProjectRoot redirecting to the repo root
- [Phase 13]: Phase 13 Plan 03 Rule-3 deviation: the plan d09_constraint wrongly claimed jj-git-init is no-raw-git-lint-clean — the lint regex matches the inner git substring; fixed by quoting the subcommand word, preserving D-09 (no allowlist entry, no escape hatch)
- [Phase 13]: CI-05 harness verified end-to-end green on both backends; the SC5 sentinel githooks pre-commit fired once per workspace, proving the Phase 12 A3 fix during a parallel-dispatched run
- [Phase 13]: Phase 13 Plan 04: A2 red-cell confirmation — the needs.<job>.result aggregate model holds; a failed continue-on-error:true git cell does not flip the aggregate, a failed non-continue-on-error jj-colocated cell does. parallel-e2e-gate requires aggregate=='success' (exactly 'jj-colocated passed'); no outputs+fromJSON fallback needed
- [Phase 13]: Phase 13 Plan 04: shipped standalone .github/workflows/parallel-e2e.yml (D-03) — inverted-polarity matrix (git allow-fail / jj-colocated required), CI-06 audit step, and the needs:-gated parallel-e2e-gate blocking job (D-04 option b); parallel-e2e-gate must be registered as a required branch-protection check (config outside repo)
- [Phase 13]: Phase 13 Plan 04: LINT-05 is pure bookkeeping — zero changes to lint-vcs-no-raw-git.allow.json; the +1 (24 entries, sdk/src/vcs/git/parallel.ts) landed in Phase 10; both Wave-1 files are raw-git-clean so no new entry was needed; recorded in 13-LINT05-ALLOWLIST-DIFF.md
- [Phase ?]: Phase 14 Plan 01: D-04 template flatten + D-03 brownfield flip — get-shit-done/templates/config.json parallelization collapsed from nested 6-key block to flat boolean true; this repo's .planning/config.json flipped permanently from false to true; D-05 honored (no greenfield/brownfield boundary added); feat-3167 stays green; in-the-wild invariant moves to Plan 14-02 contract-test fixtures
- [Phase 14]: Phase 14 Plan 02: CONFIG-02 envelope uses strict-equal-false (config.parallelization === false) per RESEARCH §A 'Critical caveat' — protects legacy nested-shape brownfield repos from loose-falsey trap. D-03 mitigation: 6 contract tests in cmd-parallel-{jj,git}.test.ts (3 it cases each) — Loose-falsey would mis-fire on the legacy {enabled: true, ...} object shape because SDK loadConfig does NOT do nested→flat normalization (unlike core.cjs:480-485 CJS); strict-equal-false keeps the failure mode unambiguous. 'does NOT fire' tests use try/catch to tolerate adapter throws on tmpDir non-repo (envelope returns BEFORE createVcsAdapter is called)
- [Phase ?]: Phase 14 Plan 03: scripts/dogfood-restore.sh ships as positional-arg recovery primitive (<pre-op-id> <tarball-path>); restore-then-untar ordering (jj op restore FIRST, tar -xf LAST per Pitfall 2); NO --what flag (jj 0.41 default repo+remote-tracking per RESEARCH §D finding #3)
- [Phase 14]: Phase 14 Plan 05 — hyphenated git-cell stderr labels (NOT "git cell") dodges the no-raw-git lint pattern without an allowlist entry; LINT-05 net diff stays at zero for the dogfood orchestrator + metrics + CONTEXT prose
- [Phase 14]: Phase 14 Plan 05 — post-dogfood, the WC sat on the synthetic octopus merge node; jj op restore to the recorded pre_op_id (9db977b62aca) reverted the dogfood scaffolding cleanly and the deliverables landed on a clean line of history. Net empirical validation of the recovery primitive in production.
- [Phase 14]: Phase 14 Plan 05 — pre-snapshot dir intentionally NOT trap-cleaned on EXIT (D-12 durability); rehearsal dirs ARE trap-cleaned in Plan 14-04. Dogfood anchor lives until OS GC of /tmp; rehearsal artifacts are ephemera.

### Pending Todos

v1.4 todos all promoted to REQ-IDs in `.planning/REQUIREMENTS.md` and mapped to phases per `.planning/ROADMAP.md` traceability table. Phase 15 discuss-phase will surface plan-level todos.

### Blockers/Concerns

**v1.4-specific blockers (from PITFALLS.md):**

- **Pitfall 1 (Scope creep, all phases):** Lock the closed acceptance set at REQUIREMENTS.md write time. The 5 v14-* todos' `## Acceptance criteria` sections are the spec; do NOT add bullets at plan-phase. Warning sign: any plan PLAN.md whose `must_haves` count exceeds the source todo's acceptance count.
- **Pitfall 2 (Phase 18 plan 18.01, transition.md gate):** v14-transition-md-update-gap is the highest-risk known recurrence site for the Phase 14 false-clean-WC pattern. Fix FIRST among workflow waves before any new workflow surface lands. Global-install caveat: `~/.claude/get-shit-done/workflows/` still has OLD workflow until reinstall.
- **Pitfall 3 (Phase 15 plan 15.01, rootCommits rename):** 13+ call sites including `backends.ts:79` capability matrix string literal. TypeScript compiler protects `.ts` only; CJS + workflow markdown + capability matrix surfaces are silent failure modes. Mandatory pre-rename JSON sidecar audit; per-extension `grep -c` exit 0 before commit.
- **Pitfall 4 (Phase 17 plans 17.01 → 17.02 ordering):** Codebase ALREADY HAS DRIFT in `docs/ja-JP/ARCHITECTURE.md` (44→68 commands, 46→89 workflows, 16→33 agents, 17→60 lib modules). Tests-first ships day-1 red CI. STRICT ORDERING: drift FIX (Wave 1 = 17.01) → drift TEST (Wave 2 = 17.02).
- **Pitfall 5 (Phase 15 plan 15.04, parallel.cancel):** STACK lens correct (synchronous teardown only, no signal handling). Cancel does NOT signal subagents (`spawnSync` exec layer can't accept AbortSignal per `sdk/src/vcs/exec.ts:19`; Phase 9 D-01 orchestrator-awaits-Agent invariant). Cancel return shape = structured `CancelResult` (NOT void/boolean); reuses shared `cleanupSubagentWorkspaces` helper.
- **Pitfall 6 (Phase 15 plan 15.03, matchPrefix):** THROW on wrong-alphabet prefix (not silent false); throw on empty prefix (caller bug); return false on `prefix.length > id.length`; hex case-insensitive (matches git); k-z lowercase-only (matches jj). Test cross-product mandatory.
- **Pitfall 7 (Phase 16 plan 16.01, call-presence lint):** Define scope by SHELL FENCE, not by prose mention. Reuse `audit-workflow-raw-git.cjs` fence-aware walker. False-positive risk on `code-review.md`/`audit-fix.md`/similar workflows that mention "wave" only in prose.
- **Pitfall 8 (Phase 17 plan 17.04, PROJECT.md reconciliation):** Two-pass approach — machine-generate truth source at `.planning/intel/project-validated-truth.md`, human-edit PROJECT.md narrative citing it. Preserve hand-curated parentheticals like "(caveat: A3 colocated pre-commit gap remains open, see Active)".
- **Pitfall 9 (Phase 18 plan 18.03, jj-reap test flake fix):** Per-test fix only. Diff ≤5 LOC, ≤1 file, `sdk/vitest.config.ts` UNTOUCHED, `scripts/check-skip-count.cjs` green. Out-of-scope reaffirmation in plan CONTEXT.md citing PROJECT.md OOS clause verbatim. No `retry: N`, no broader vitest reorg.
- **Pitfall 10 (Phase 18 plan 18.02, WR-NN review followups):** Per-WR commits (or per-WR delimited sections of one commit), each with its own verification test. Order: prod-code fixes (CLEANUP-05 Array.isArray, CLEANUP-06 Number.isNaN) FIRST, then script fixes, then test fixes (CLEANUP-07 afterEach rm). Info findings addressed opportunistically.
- **Pitfall 11 (Phase 15 plan 15.04 + Phase 16 plan 16.02, orphan-dirs ownership):** Single owner = dispatcher fanIn cleanup. Shared `cleanupSubagentWorkspaces(phaseRoot, phaseNumber)` helper consumed by: (1) dispatcher fanIn success branch, (2) recovery script, (3) cancel verb. One implementation, three consumers, no drift.
- **Pitfall 12 (Phase 17 plan 17.03, docs-update batched fix):** Triage-then-fix per theme. ADRs immutable; add append-only "## Update YYYY-MM-DD" supersession notes for theme 3. Phase 3 archived planning: anchor to closure change_ids (NOT deleted) for theme 5. Per-theme decisions in `.planning/intel/docs-update-fix-triage.md` BEFORE execute.

**Cross-phase integration pitfalls (from PITFALLS.md IP-1..IP-5):**

- **IP-1 (Rename + drift-test):** Phase 15 plan 15.01 ships rename BEFORE Phase 17 plan 17.02 ships drift-control-tests. Canonical phase order auto-resolves.
- **IP-2 (cancel + call-presence lint):** Lint excludes cancel from required-presence; lint enforces dispatch-call presence only. Phase 15 plan 15.04 + Phase 16 plan 16.01 file-disjoint, no coupling.
- **IP-3 (assert_clean_wc + docs-fix):** Theme 1 fix in Phase 17 plan 17.03 is single-step single-commit. Workflow MUST commit immediately after script returns; assert_clean_wc gate runs LAST.
- **IP-4 (Reconciliation + new REQ-IDs):** Phase 17 plan 17.04 PROJECT.md reconciliation runs LAST so v1.4's OWN REQ-IDs (NAMING-01, VCS-21, VCS-22, PARALLEL-07, LINT-06, CLEANUP-01..07, TEST-17, DRIFT-01/02, DOCS-01..09, PROJECT-01) land in truth source.
- **IP-5 (Cleanup helper across 3 consumers):** Wave 1 = extract `cleanupSubagentWorkspaces` helper as Phase 15 plan 15.04 Wave 1. Wave 2 = orphan-dirs todo (Phase 16 plan 16.02 CLEANUP-02) + cancel verb (already in 15.04 Wave 2) both call the new helper. Same code path, no drift.

**Inherited (v1.3 close + earlier):**

- **~~Pitfall 1~~ (SUPERSEDED 2026-05-15 by Phase 9 D-02):** Pitfall posited "concurrent `jj squash` from N workspaces against shared ancestor diverges silently." Phase 9 discuss rejected the premise: `octopus.ts` topology gives each subagent a distinct change at distinct change_id; agents only squash into their own `@-`. The orchestrator-only operations (`createPhaseStructure`, fanIn, bookmark advance) run in single processes. No inter-process contention exists. No `acquireJjRepoLock`. TEST-14 stays as a topology assertion (not lock-effectiveness).
- **Pitfall 2 (Phase 9+10 same-PR coupling):** In-tree conflicts on octopus merge get classified as crashes by reap unless `FanInResult.conflicted: boolean` ships. `IncompleteWorkEntry.reason` enum extends from 1 → **2** values (`'crashed-with-uncommitted-work'` + `'merge-in-tree-conflict'`; `'partial-wave-live-workspace'` dropped because Pitfall 3 superseded). Phase 9 lands enum + jj producer in `reap.ts`; Phase 10 adds git producer. (v1.3 closed.)
- **~~Pitfall 3~~ (SUPERSEDED 2026-05-15 by Phase 9 D-01):** Pitfall posited "partial-wave failure with one agent still running needs a liveness probe before reap." Phase 9 discuss rejected the premise: the orchestrator awaits `Agent()` completion before calling fanIn, so no production scenario has a workspace mid-write. No `PARALLEL-03`. `FanInResult` does NOT carry `liveWorkspaces` / `partial: true`. `git worktree remove --force` is still forbidden in the cross-backend path (non-force only) — that constraint survives independent of the dropped probe.
- **Pitfall 5 (Phase 10):** `.git/config.lock` race on simultaneous `git worktree add`. Internal serialization in `sdk/src/vcs/git/parallel.ts` (not prompt-text rule). (v1.3 closed.)
- **Pitfall 10 (Phase 14 last):** Dogfood blast-radius — pre-snapshot via `jj op log` + `.planning/` tarball, isolated bookmark only, synthetic plans, loud-fail rollback. (v1.3 closed.)
- **Carry-forward (A3, Phase 12):** jj 0.41 doesn't auto-fire `.git/hooks/pre-commit` after `jj squash` colocated. Three fix paths in Phase 4 LEARNINGS Open Q1 (archived `51ee72a3`). Chosen at Phase 12 discuss-phase. (v1.3 closed — Path 1 chosen.)

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260522-vx2 | test maintenance — triage of npm test failures (probe-only, no fix) | 2026-05-23 | xuxxkkqp | [260522-vx2-test-maintenance-need-to-make-sure-all-p](./quick/260522-vx2-test-maintenance-need-to-make-sure-all-p/) |
| 260523-ovw | structural fix: workflow assert_clean_wc gate + execute-phase update_roadmap reorder (Phase 14 post-mortem) | 2026-05-23 | swoylprp, plyvlkqt, uxuqqzto | [260523-ovw-investigate-how-that-happened-and-potent](./quick/260523-ovw-investigate-how-that-happened-and-potent/) |

## Deferred Items

All v1.3 deferred items in scope for v1.4 promoted to REQ-IDs in `.planning/REQUIREMENTS.md` (see Traceability table). No new deferrals being created in v1.4 — every prior-deferred item in scope has been promoted; this is a cleanup milestone.

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Architecture | Orchestrator parallelization rewrite (raw-git worktree dispatch → cross-backend `vcs.workspace.parallel.*`) | ✓ **CLOSED in v1.3 Phases 9–11 + 14** | v1.0 → v1.1 → v1.2 (closed in v1.3) |
| Hooks | A3 colocated pre-commit gap (jj 0.41 doesn't auto-fire `.git/hooks/pre-commit` after `jj squash` colocated) | ✓ **CLOSED in v1.3 Phase 12** | v1.0 → v1.1 → v1.2 (closed in v1.3) |
| Lint | LINT-04 markdown / `.planning/` prose-level lint (separate from `lint-vcs-no-commit-id.cjs`) | Reframed as v1.3 LINT-04 one-shot `audit-workflow-raw-git.cjs` (Phase 13) | v1.2 (closed in v1.3) |
| API | TEST-13 (v1.2 deferred) `vcs.refs.matchPrefix(id, prefix)` alphabet-aware short-prefix matching | **IN-SCOPE for v1.4 Phase 15 plan 15.03** (REQ: VCS-22) | v1.2 → v1.3 (promoted in v1.4) |
| Naming | NAMING-01 cosmetic rename `rootCommits` → `rootRevisions` | **IN-SCOPE for v1.4 Phase 15 plan 15.01** (REQ: NAMING-01) | v1.2 → v1.3 (promoted in v1.4) |
| API | API-01 public `vcs.refs.idAlphabet` introspection | **IN-SCOPE for v1.4 Phase 15 plan 15.02** (REQ: VCS-21) | v1.2 → v1.3 (promoted in v1.4) |
| API | `vcs.workspace.parallel.cancel(handle)` mid-execution graceful abandonment | **IN-SCOPE for v1.4 Phase 15 plan 15.04** (REQ: PARALLEL-07) | v1.3 open (promoted in v1.4) |
| Lint | Workflow call-presence lint (`vcs.parallel.*` must be called in dispatch sections) | **IN-SCOPE for v1.4 Phase 16 plan 16.01** (REQ: LINT-06) | v1.3 open (promoted in v1.4) |
| Docs | 45 docs failures across 8 themes from `/gsd-docs-update --verify-only` — author-machine path leaks, split-workspace-command translations, ADR drift, renamed hooks, archived planning refs, missing drift-control tests, translation date mismatches; see [v14-docs-verify-only-followups](./todos/pending/v14-docs-verify-only-followups.md) | **IN-SCOPE for v1.4 Phase 17 plans 17.01/17.02/17.03** (REQs: DOCS-01..09 + DRIFT-01/02) | v1.3 close (promoted in v1.4) |
| Tests | `performJjReap` test flake (Phase 14 dogfood observation); see [v14-jj-reap-test-flake](./todos/pending/v14-jj-reap-test-flake.md) | **IN-SCOPE for v1.4 Phase 18 plan 18.03** (REQ: TEST-17) | v1.3 close (promoted in v1.4) |
| Cleanup | Orphan `jj-workspace` directories left behind by dispatch; see [v14-orphan-jj-workspace-dirs](./todos/pending/v14-orphan-jj-workspace-dirs.md) | **IN-SCOPE for v1.4 Phase 16 plan 16.02** (REQ: CLEANUP-02) | v1.3 close (promoted in v1.4) |
| Reviews | Phase 14 review followups (CR-01 closed, additional WR-* items pending); see [v14-review-followups](./todos/pending/v14-review-followups.md) | **IN-SCOPE for v1.4 Phase 18 plan 18.02** (REQs: CLEANUP-03..07) | v1.3 close (promoted in v1.4) |
| Docs | `transition.md` update-gap (`update_roadmap_and_state` step lacks immediate commit); see [v14-transition-md-update-gap](./todos/pending/v14-transition-md-update-gap.md) | **IN-SCOPE for v1.4 Phase 18 plan 18.01** (REQ: CLEANUP-01) | v1.3 close (promoted in v1.4) |

## Session Continuity

Last session: 2026-05-24T19:43:19.192Z
Stopped at: Phase 14.1 context gathered
Resume file: 

.planning/phases/14.1-drop-mandatory-bookmark-on-parallel-dispatch-fan-in-emergenc/14.1-CONTEXT.md

- Phase 12 (A3 fix) is an independent parallel track — may be planned/executed in parallel with Phases 9/10/11; joins at Phase 13 CI integration. (v1.3 closed.)
- v1.4 phases (15-18) execute in canonical order; Phase 15 plan 15.04 (PARALLEL-07) extracts `cleanupSubagentWorkspaces` helper as Wave 1, consumed by Phase 16 plan 16.02 (CLEANUP-02) — single-owner per IP-5.

## Operator Next Steps

- Review v1.4 roadmap at `.planning/ROADMAP.md` (4 phases, 13 plans, 25 requirements)
- When ready, run `/gsd:plan-phase 15` to decompose Phase 15 (Adapter surface extensions + rename) into executable plans
- Plan 15.01 (rootCommits → rootRevisions hard rename) ships FIRST per Pitfall 3 sequencing — pre-rename JSON sidecar audit is Wave 1 of that plan
