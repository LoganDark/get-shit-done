# Roadmap: GSD jj-port

**Mode:** standard
**Created:** 2026-05-09
**Last milestone shipped:** 2026-06-11 (v1.5 — tactical cleanup + test-flake, Phase 18 carry-through)

## Overview

Port GSD from a git-only toolkit to a dual-backend (git + jj) toolkit while preserving full upstream feature parity. v1.0 + v1.1 shipped both backends and every structural verb. v1.2 closes the identity-contract gap: the cross-backend `VcsAdapter` exposes ONE concept of "a revision" — `commit_id` on git, `change_id` on jj — and the jj backend never volunteers `commit_id` from any cross-backend verb. v1.3 lifts parallel-subagent dispatch into new cross-backend `vcs.workspace.parallel.*` adapter verbs (both backends), flips `parallelization: true` by default, closes the A3 colocated pre-commit gap inherited from v1.0, and adds a CI parallel-path lane plus a final dogfood phase that exercises the new dispatcher against this very repo on an isolated bookmark. **v1.4 drives every outstanding fork-internal todo, deferred item, and known drift to zero so the next upstream rebase lands on a clean, fully-tested, fully-documented baseline.** Upstream pull itself is out of scope for v1.4 — operator performs the pull as a separate action post-v1.4.

## Milestones

- ✅ **v1.0 MVP** — Phases 1, 2, 2.1, 3, 03.1, 4, 5, 6 (shipped 2026-05-14) — see `.planning/MILESTONES.md`
- ✅ **v1.1 first upstream sync** — Phase 7 (shipped 2026-05-14) — see `.planning/milestones/v1.1-ROADMAP.md`
- ✅ **v1.2 jujutsu is change-only — never commit id anywhere** — Phase 8 (shipped 2026-05-15) — see `.planning/milestones/v1.2-ROADMAP.md`
- ✅ **v1.3 jj octopus merge for subagents fully functional** — Phases 9-14 (shipped 2026-05-24) — see `.planning/milestones/v1.3-ROADMAP.md`
- ✅ **v1.4 Clean, consistent state for next upstream pull** — Phase 14.1 + Phases 15-17 + Phase 19 (shipped 2026-06-10; Phase 18 deferred to v1.5+) — see `.planning/milestones/v1.4-ROADMAP.md`
- ✅ **v1.5 Tactical cleanup + test-flake (Phase 18 carry-through)** — Phase 18 re-scoped against the post-Phase-19 tree (shipped 2026-06-11) — see `.planning/milestones/v1.5-ROADMAP.md`

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1, 2, 2.1, 3, 03.1, 4, 5, 6) — SHIPPED 2026-05-14</summary>

- [x] **Phase 1: Adapter Foundation + Git Backend** — VcsAdapter interface, git-only 1:1 backend, parameterized test harness, no-raw-git lint guard. (5/5 plans, completed 2026-05-09)
- [x] **Phase 2: Bulk Call-Site Migration (Still Git-Only)** — Every `execSync('git …')` in `sdk/src/query/*.ts` and `bin/lib/*.cjs` migrated to the adapter. (12/12 plans)
- [x] **Phase 2.1 (INSERTED): VCS Abstraction Audit — Drop Git-Only Concepts** — Reshape cross-backend surface; `expr.commit` → `expr.rev`, `currentBranch` → `currentBookmarks`, gitDir/gitCommonDir → `gitOnly` namespace. (9/9 plans)
- [x] **Phase 3: jj Backend Core — Squash, Refs, Conflict** — `sdk/src/vcs/backends/jj.ts` implementing every adapter contract verb (jj-colocated CI lane as allow-failure). (7/7 plans, completed 2026-05-12)
- [x] **Phase 03.1 (INSERTED): make tests run faster** — vitest parallelism baseline + L1/L2 levers + final ratio recorded. (5/4 plans)
- [x] **Phase 4: Workspaces + Octopus Structure + Hooks** — `vcs.workspace.{add,forget,prune,reap}` bodies + `acquireJjWriteLock` RAII + lazy octopus helpers + pre-commit/pre-push hook wiring + SDK `hooks.fire` bridge. (7/7 plans, completed 2026-05-13). Known gap: A3 colocated pre-commit (closed in v1.3 Phase 12).
- [x] **Phase 5: Command Translations + Brownfield Validation + CI Hardening** — Every upstream command verified end-to-end on jj; workflow markdown and agent prompts rewritten; CI matrix graduates jj-backend to required-blocking. (8/5 original + 3 gap-closure plans)
- [x] **Phase 6: Brownfield jj Migration** — Sticky `vcs.adapter` flip + `.planning/` SHA→change_id rewriter + `/gsd-migrate-vcs` command + dogfood validation. (4/4 plans)

</details>

<details>
<summary>✅ v1.1 first upstream sync (Phase 7) — SHIPPED 2026-05-14</summary>

- [x] **Phase 7: Reconcile fork capabilities with upstream** — 8 new VcsAdapter verbs (VCS-08..VCS-15 — currentBookmarksIn, mergeBase, diff{diffFilter}, status{cwd}, workspace.merge with atomic main-advance, workspace.remove, bookmarks.delete{force}, readBlob); wave-cleanup executor wired through them; raw-git workflow .md fallbacks deleted; github-release-notes.cjs migrated to cross-backend; strict-green test triage on both backends. (5/5 plans). Full details: `.planning/milestones/v1.1-ROADMAP.md`.

</details>

<details>
<summary>✅ v1.2 jujutsu is change-only — never commit id anywhere (Phase 8) — SHIPPED 2026-05-15</summary>

- [x] **Phase 8: Unified Revision Model — Audit → Test-Prep → Flip → Lint Guard → Close-Gate** — Audit (101 sites classified via closed verdict enum) + `toBeIdOf` vitest matcher + FLIP-01..04 surface flip (7 jj.ts template flips + 3 NDJSON parser flips + `LogEntry.hash`/`CommitResult.hash` hard-renamed to `.id`, no aliases) + `scripts/lint-vcs-no-commit-id.cjs` CI-blocking (1032 files / 0 violations — FLIP completeness proof) + PROMPT-05 invariant verified (zero id-reason `vcs.kind` branches remain) + LINT-03 closes empty (no boundary-I/O accessor exists, SEED-001 inversion holds) + MIGR-06 close-gate rewriter pass. (3/3 plans, completed 2026-05-15). Full details: `.planning/milestones/v1.2-ROADMAP.md`.

</details>

<details>
<summary>✅ v1.3 jj octopus merge for subagents fully functional (Phases 9-14) — SHIPPED 2026-05-24</summary>

- [x] **Phase 9: jj-side parallel verbs** — Define `VcsWorkspaceParallel` types, lift `octopus.ts` + `reap.ts` behind the new `vcs.workspace.parallel.*` jj-side composition layer (`sdk/src/vcs/jj/parallel.ts`), extend the reap classifier with `'merge-in-tree-conflict'`, wire into `backends/jj.ts`, and validate the octopus-topology non-divergence assertion. (5/5 plans, completed 2026-05-15)
- [x] **Phase 10: git-side parallel verbs + classifier extension** — Lift the workflow-markdown raw-git worktree dispatch+merge+cleanup body into a new `sdk/src/vcs/git/parallel.ts` adapter-internal sidecar; ship the cross-backend `FanInResult` contract (jj+git same-PR coupling), extend the manifest schema, validate git N-parent octopus. (6/6 plans, completed 2026-05-16)
- [x] **Phase 11: Orchestrator + agent rewire + workspace.assert-dispatched-cwd** — Delete the raw-git blocks in `execute-phase.md` and `quick.md`, ship the `workspace.assert-dispatched-cwd` SDK verb, collapse the worktree-aware blocks in `gsd-executor.md`, rename `worktree-path-safety.md` to `dispatch-cwd-safety.md`, wire `maxConcurrency` from workflow call sites. (11/11 plans, completed 2026-05-16)
- [x] **Phase 12: A3 colocated pre-commit fix (parallel track)** — Closes the gap inherited from v1.0 Phase 4. Path 1 chosen at discuss-phase by re-reading Phase 4 LEARNINGS Open Q1 (archived `51ee72a3`); jj backend's `commit()` always fires `.githooks/<stage>` in colocated mode with `GSD_HOOK_SKIP_COLOCATED` opt-out; HOOK-07 fires-exactly-once regression test shipped. (3/3 plans, completed 2026-05-21)
- [x] **Phase 13: CI parallel-path lane + lint close-gate** — New CI matrix lane `parallel-e2e` running synthetic 2-plan phases on both backends (required-blocking on jj-colocated); one-shot `scripts/audit-workflow-raw-git.cjs` close-gate evidence; `lint-vcs-no-raw-git.allow.json` diff recorded (+1). CI-06 gap (test discovery non-recursive) closed inline at v1.3 close 2026-05-24. (4/4 plans, completed 2026-05-22)
- [x] **Phase 14: Default flip + dogfood validation** — Install template default flips `parallelization: false` → `true`; CONFIG-02 `parallelization_disabled` envelope at the CLI bridge with strict-equal-`false` brownfield safety; real dogfood ran end-to-end on this repo on isolated bookmark `gsd/phase-14-dogfood` (jj-cell + git-cell both 0 conflicts; main bookmark unchanged per Pitfall 10); recovery anchor captured. (5/5 plans, completed 2026-05-24)

</details>

<details>
<summary>✅ v1.4 Clean, consistent state for next upstream pull (Phase 14.1 + Phases 15-17 + 19; Phase 18 deferred) — SHIPPED 2026-06-10</summary>

- [x] **Phase 14.1: Drop mandatory bookmark on parallel dispatch + fan-in (emergency)** — Replace required `mainBookmark: string` with optional `mainBookmarks?: readonly string[]` (default `[]` → no advance) on `ParallelDispatchOpts` / `ParallelDispatchHandle`. jj fan-in skips the `jj bookmark set` step when list is empty; iterates with all-or-nothing validation when non-empty. git fan-in (already detached-HEAD-safe mechanically — `merge --no-ff` operates on current HEAD whether detached or not) drops the dead-weight required field; advances via `git update-ref refs/heads/<name> HEAD` per provided name when non-empty. Workflow `workflows/execute-phase.md` drops the `current-branch` FATAL preflight. Operating on `@` (jj) / current HEAD (git, including detached) becomes a first-class working state. Requirements: PARALLEL-08. (1 plan) (completed 2026-05-24)
- [x] **Phase 15: Adapter surface extensions + rename** — Hard-rename `rootCommits` → `rootRevisions` across 13+ call sites (with pre-rename JSON sidecar audit per Pitfall 3); add `vcs.refs.idAlphabet` introspection (`'0-9a-f'` git, `'k-z'` jj); add `vcs.refs.matchPrefix(id, prefix): boolean` alphabet-aware short-prefix matching (throws on wrong-alphabet per Pitfall 6); add `vcs.workspace.parallel.cancel(handle): CancelResult` synchronous teardown of materialized workspaces (no signal handling — STACK-lens semantics per Pitfall 5; extracts `cleanupSubagentWorkspaces` helper as Wave 1). Sequential plans within phase (file-overlap on `types.ts`). Requirements: NAMING-01, VCS-21, VCS-22, PARALLEL-07. (4 plans) (completed 2026-05-25)
- [x] **Phase 16: Workflow + invariant tooling** — Ship `scripts/lint-vcs-parallel-call-presence.cjs` (content-driven detection of `workspace.parallel.dispatch` / `workspace.parallel.fan-in` literals in shell fences; default-deny + per-entry `{path|glob, reason, owner}` allowlist; CI-blocking in `parallel-e2e.yml`, NOT pretest per audit-workflow-raw-git.cjs D-07 precedent); reap orphan `.claude/jj-workspaces/phase-*-subagent-*` FS dirs on `vcs.workspace.parallel.fan-in` clean-path success branch (preserves W3 (a) inspection contract on conflicted branch) AND via `scripts/dogfood-restore.sh` post-restore step (consumes `cleanupSubagentWorkspaces` helper extracted in Phase 15). Parallel-safe within phase (file-disjoint). Requirements: LINT-06, CLEANUP-02. (2 plans) (completed 2026-05-25)
- [x] **Phase 17: Drift control + reconciliation** — Wave 1 = ARCHITECTURE.md prose-count fixes across en + 3 translations (44→68 commands, 46→89 workflows, 16→33 agents, 17→60 lib modules, ~3000→10,978 install.js LOC) BEFORE drift tests RED per Pitfall 4; Wave 2 = `tests/architecture-counts.test.cjs` + `tests/command-count-sync.test.cjs` (`node:test` framework, verbatim copy of `tests/inventory-counts.test.cjs` shape, live-scan not snapshot); Wave 3 = remaining docs-update themes 1-7+9 (per-theme triage per Pitfall 12 — ADR supersession notes for theme 3, change-id-anchored references for theme 5); Wave 4 = PROJECT.md `### Validated` reconciliation LAST per IP-4 (so v1.4's own REQ-IDs are in truth source; two-pass approach per Pitfall 8 — machine-generated `.planning/intel/project-validated-truth.md` + human-edited narrative). Requirements: DOCS-08, DRIFT-01, DRIFT-02, DOCS-01..07, DOCS-09, PROJECT-01. (4 plans) (completed 2026-05-25)
- [x] **Phase 19: Upstream merge conflict resolution + fork-abstraction audit** — Post-v1.4 operator-initiated upstream pull (out of v1.4 scope per Overview, tracked here for continuity). Resolve all ~76 conflicted files in merge change `vpzlrrlv` (upstream `03764dbc` ← fork `c7bd6bee`) to 0 conflicts, **adopting upstream's restructure** (SDK retirement, `gsd-core/`, `src/*.cts`) to keep future pulls cheap, while porting the fork's VCS abstraction (jj support: VcsAdapter, unified revision model, `workspace.parallel.*`, `.githooks` bridge) into the new upstream architecture and migrating upstream's raw-git call sites through it. See Phase Details. (plans TBD) (completed 2026-06-10)
- [x] **Phase 18: Tactical cleanup + test-flake** — DEFERRED TO v1.5+ at milestone close 2026-06-10 (never planned or executed; 0/3 plans). Requirements CLEANUP-01, CLEANUP-03..07, TEST-17 marked Deferred in the archived REQUIREMENTS. **Promoted into v1.5 on 2026-06-10** after a re-scope audit against the post-merge tree (verdict: zero items subsumed by Phase 19; all 7 fixes still missing at relocated paths) — see the v1.5 section below. Full original scope: `.planning/milestones/v1.4-ROADMAP.md` Phase Details. (completed 2026-06-10)

</details>

<details>
<summary>✅ v1.5 Tactical cleanup + test-flake (Phase 18 carry-through) — SHIPPED 2026-06-11</summary>

- [x] **Phase 18: Tactical cleanup + test-flake (re-scoped)** — All 7 v1.4-deferred REQ-IDs (CLEANUP-01, CLEANUP-03..07, TEST-17) closed against the post-Phase-19 tree: transition.md commit-adjacency fences + `assert_clean_wc` final-gate (18-04 gap closure re-keyed all gate predicates on status `entries[]`, never `.raw`); dispatch-router `plan_not_array` + `max_concurrency_invalid` fail-closed envelopes; dogfood-restore.sh root assertion + documented tar-overlay asymmetry; CONFIG-02 tmpDir leak elimination; TEST-17 closed as resolved-by-restructure. UAT 6/6. Close-day fixes: 18-REVIEW CR-01 (plan-phase.md gate routing) + `query commit` envelope defects (`CommitResult.id`, absolute `--files`). (4/4 plans, completed 2026-06-11). Full details: `.planning/milestones/v1.5-ROADMAP.md`.

</details>

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 2.1 → 3 → 03.1 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18

Note: Phase 12 (A3 fix) is an independent parallel track and may execute concurrently with Phases 9/10/11; the dependency ordering above is the canonical record sequence, not a serial execution constraint for Phase 12.

v1.4 executed 15 → 16 → 17 as planned; Phase 19 (upstream merge, operator-initiated) jumped the queue ahead of Phase 18, which was then deferred to v1.5+ at milestone close. v1.5 (opened 2026-06-10, shipped 2026-06-11) carried Phase 18 through, re-scoped against the post-merge tree.

| Milestone | Phases | Plans | Status   | Shipped    |
|-----------|--------|-------|----------|------------|
| v1.0 MVP  | 8      | 53/56 | Complete | 2026-05-14 |
| v1.1 first upstream sync | 1 | 5/5 | Complete | 2026-05-14 |
| v1.2 jujutsu is change-only — never commit id anywhere | 1 | 3/3 | Complete | 2026-05-15 |
| v1.3 jj octopus merge for subagents fully functional | 6 | 34/34 | Complete | 2026-05-24 |
| v1.4 Clean, consistent state for next upstream pull | 5 | 24/24 (Phase 18's 3 deferred) | Complete | 2026-06-10 |
| v1.5 Tactical cleanup + test-flake (Phase 18 carry-through) | 1 | 4/4 | Complete | 2026-06-11 |

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 9. jj-side parallel verbs | 5/5 | Complete   | 2026-05-15 |
| 10. git-side parallel verbs + classifier extension | 6/6 | Complete    | 2026-05-16 |
| 11. Orchestrator + agent rewire + workspace.assert-dispatched-cwd | 11/11 | Complete    | 2026-05-16 |
| 12. A3 colocated pre-commit fix (parallel track) | 3/3 | Complete    | 2026-05-21 |
| 13. CI parallel-path lane + lint close-gate | 4/4 | Complete   | 2026-05-22 |
| 14. Default flip + dogfood validation | 5/5 | Complete    | 2026-05-24 |
| 15. Adapter surface extensions + rename | 4/4 | Complete    | 2026-05-25 |
| 16. Workflow + invariant tooling | 2/2 | Complete    | 2026-05-25 |
| 17. Drift control + reconciliation | 4/4 | Complete    | 2026-05-25 |
| 18. Tactical cleanup + test-flake (re-scoped, v1.5) | 4/4 | Complete    | 2026-06-11 |
| 19. Upstream merge conflict resolution + fork-abstraction audit | 13/13 | Complete    | 2026-06-10 |

## Next

v1.5 shipped 2026-06-11. Next milestone not yet opened — run `/gsd-new-milestone` to scope v1.6. Known carry-ins (see PROJECT.md Active for the full list):

- **MERGE-08** — deferred-by-design until a real `vcs.workspace.merge` caller emerges (see archived v1.4 REQUIREMENTS).
- **REQ-18-04-A** — swallowed backend exec failure presents as clean status envelope (status-verb contract change; Phase 18 deferred-items.md §3).
- **18-REVIEW deferred findings** — WR-01..04 + IN-01..04 (warnings/info accepted as tech debt at v1.5 close).
- **Operator manual actions** — ✅ squash done 2026-06-11: conflict resolutions squashed into merge change `vpzlrrlv` (no conflicted changes remain anywhere — jj won't push conflicts; `jj-vcs` synced to origin; the 19-01…19-13 fix/docs commits remain as ordinary history). Still open: optional `/gsd-secure-phase 19` (security enforcement enabled, no SECURITY.md); reinstall (`node bin/install.js --claude --global`) to propagate the close-day CR-01 + envelope fixes.

---
*Last updated: 2026-06-11 — v1.5 closed and archived to `.planning/milestones/v1.5-ROADMAP.md` (Phase 18 carry-through: all 7 deferred REQ-IDs closed, UAT 6/6; close-day fixes: 18-REVIEW CR-01 gate routing + query-commit envelope defects). Prior entry: v1.5 opened 2026-06-10 (minimal milestone; re-scope audit found zero Phase 18 items subsumed by Phase 19); v1.4 closed and archived 2026-06-10 to `.planning/milestones/v1.4-ROADMAP.md`.*
