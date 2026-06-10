# Requirements: GSD jj-port v1.5 — Tactical cleanup + test-flake (Phase 18 carry-through)

**Defined:** 2026-06-10
**Core Value:** Every upstream GSD command works correctly on a jj-only repo without git — full GSD workflow on a jj backend with no degradation in behavior or test coverage.

**Milestone framing:** v1.5 executes the Phase 18 scope deferred at v1.4 close (2026-06-10), re-scoped against the post-Phase-19 tree. All 7 deferred REQ-IDs were audited against the post-merge tree on 2026-06-10: **none were subsumed by Phase 19** — every fix is still missing; only the target file paths changed (`sdk/` retired, `get-shit-done/` → `gsd-core/`, SDK query handlers collapsed into `src/vcs-command-router.cts`). REQ-IDs are carried over verbatim from v1.4 (see `.planning/milestones/v1.4-REQUIREMENTS.md` for the original wording). **NOT new feature work.**

**Re-scope audit evidence (2026-06-10):**

- `gsd-core/workflows/transition.md` (upstream's rewrite, 694 lines): zero `assert_clean_wc` occurrences, zero commit steps — mutates ROADMAP/PROJECT/STATE then prints "Phase {X} marked complete". The fork's gates DID survive the merge in `gsd-core/workflows/execute-phase.md:1676` and `plan-phase.md`.
- `scripts/dogfood-restore.sh`: "must be run from the project root" exists only as a comment (line 25); plain `tar -xf "$TARBALL_PATH" -C .` at line 74 with no assertion and no overlay decision.
- `src/vcs-command-router.cts` `workspace.parallel.dispatch` handler: has `plan_json_parse_failed` envelope (~line 1177) but no `Array.isArray` check; `maxConcurrency = Number(args[++i])` at line 1141 with no NaN guard (the adjacent `phaseNumber` guard at line 1145 is the pattern to mirror).
- `src/vcs/__tests__/cmd-parallel-{jj,git}.test.ts` CONFIG-02 describe blocks: per-test `mkdtemp` with zero `afterEach` cleanup.
- `src/vcs/__tests__/jj-reap.test.ts:79` inclusion-filter test: no per-test timeout; suite now runs under root `vitest.config.ts` with `maxWorkers: 2` (19-11), so the original flake conditions changed — re-verify before fixing.

## v1.5 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Tactical Cleanup

- [x] **CLEANUP-01**: `gsd-core/workflows/transition.md` (upstream's post-merge rewrite) applies the `assert_clean_wc` final-gate + commit-adjacency pattern surviving in `gsd-core/workflows/execute-phase.md:1676` / `plan-phase.md`. Scope note from re-scope audit: upstream's rewrite has NO commit step at all, so this includes adding an immediate `gsd_run query commit` after each mutating step (`update_roadmap`-equivalent, PROJECT.md evolution, STATE.md update), not just the terminal gate. Gate lands immediately before the "Phase {X} marked complete" / milestone-complete terminal banners. (closes `v14-transition-md-update-gap`)
- [ ] **CLEANUP-03**: `scripts/dogfood-restore.sh` enforces project-root precondition before mutating (before `jj op restore` + `tar -xf`) via explicit assertion (e.g., `[ -f .planning/STATE.md ]`) (closes Phase 14 WR-01)
- [ ] **CLEANUP-04**: `scripts/dogfood-restore.sh` resolves the tar-overlay additive-vs-clean ambiguity — either `rm -rf .planning && tar -xf` (clean overlay) or document the asymmetry as intended (closes Phase 14 WR-02)
- [ ] **CLEANUP-05**: `src/vcs-command-router.cts` `workspace.parallel.dispatch` handler validates the parsed plan is an array via `Array.isArray(plan)` guard; returns `{ok:false, reason:'plan_not_array'}` envelope on non-arrays (peer to the existing `plan_json_parse_failed` envelope); contract test covers the envelope shape (closes Phase 14 WR-03; original target `sdk/src/query/workspace-parallel-dispatch.ts` retired by Phase 19 — handler now lives in the PORT-02 router)
- [ ] **CLEANUP-06**: `--max-concurrency` accepts NaN no longer — `Number.isNaN` guard in `src/vcs-command-router.cts` mirrors the existing `--phase` guard at line 1145; contract test covers the envelope/error shape (closes Phase 14 WR-04)
- [ ] **CLEANUP-07**: CONFIG-02 test tmpDir leaks fixed — `afterEach(() => rm(tmpDir, {recursive: true, force: true}))` added to `describe('CONFIG-02 — parallelization_disabled')` blocks in `src/vcs/__tests__/cmd-parallel-{jj,git}.test.ts` (closes Phase 14 WR-05; 6 leaked dirs per run eliminated)

### Test Isolation

- [ ] **TEST-17**: `src/vcs/__tests__/jj-reap.test.ts > workspace.reap > inclusion-filter` no longer times out at 5s under parallel test load. **Re-verification gate first**: the suite moved from `sdk/vitest.config.ts` to root `vitest.config.ts` with `maxWorkers: 2` (19-11) — reproduce the flake under the current config before fixing; if it cannot be reproduced in 3+ full-suite runs, close as resolved-by-restructure with the runs recorded as evidence. If it reproduces: per-test fix only — `it(..., 15_000)` timeout extension preferred, `{ concurrent: false }` opt-out as fallback; diff ≤5 LOC, ≤1 file, root `vitest.config.ts` UNTOUCHED, `scripts/check-skip-count.cjs` green. Broader test-perf sweep (`project_test_perf_pain_vitest`) stays out of scope. (closes `v14-jj-reap-test-flake`)

## Out of Scope

| Item | Reason |
|------|--------|
| MERGE-08 (`WorkspaceMergeOpts.mainBookmark` revision) | Deferred-by-design until a real non-test caller of `vcs.workspace.merge` emerges (filed v1.4 Phase 14.1; see archived v1.4 REQUIREMENTS) |
| Broader test-perf sweep beyond TEST-17 | `project_test_perf_pain_vitest` longstanding pain stays deferred; only the specific `jj-reap > inclusion-filter` flake is in scope |
| Phase 14 info findings (5 items in `v14-review-followups.md`) | Addressed opportunistically only when an adjacent file is touched — never forced into the milestone |
| Next upstream pull | Separate operator action; v1.5 leaves the tree clean for it |
| Untracked `sdk/` + `get-shit-done/` on-disk leftovers | jj tracks zero files under either (verified 2026-06-10); stale build artifacts/node_modules — operator may delete at leisure, no plan needed |

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| CLEANUP-01 | Phase 18 (plan 18.01) | Active |
| CLEANUP-03 | Phase 18 (plan 18.02) | Active |
| CLEANUP-04 | Phase 18 (plan 18.02) | Active |
| CLEANUP-05 | Phase 18 (plan 18.02) | Active |
| CLEANUP-06 | Phase 18 (plan 18.02) | Active |
| CLEANUP-07 | Phase 18 (plan 18.02) | Active |
| TEST-17 | Phase 18 (plan 18.03) | Active |

Coverage: 7/7 mapped (no orphans).

---
*Last updated: 2026-06-10 — v1.5 opened as a minimal milestone (operator decision: re-scope + execute deferred Phase 18 without full new-milestone ceremony). All 7 REQ-IDs carried from v1.4 with file paths re-scoped against the post-Phase-19 tree; re-scope audit found zero items subsumed by Phase 19.*
