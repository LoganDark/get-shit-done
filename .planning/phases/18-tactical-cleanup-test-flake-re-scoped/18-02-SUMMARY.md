---
phase: 18-tactical-cleanup-test-flake-re-scoped
plan: 02
subsystem: cli-validation
tags: [vcs-command-router, input-validation, asvs-v5, bash-hardening, vitest, tmpdir-hygiene, jj]

# Dependency graph
requires:
  - phase: 19-upstream-merge
    provides: src/vcs-command-router.cts PORT-02 router (relocated CLEANUP-05/06 target), src/vcs/__tests__ relocated test suite, gsd-core/bin/lib emitted artifacts
provides:
  - plan_not_array fail-closed envelope on workspace.parallel.dispatch (CLEANUP-05 / Phase 14 WR-03)
  - max_concurrency_invalid fail-closed envelope on workspace.parallel.dispatch (CLEANUP-06 / Phase 14 WR-04)
  - dogfood-restore.sh project-root assertion pre-mutation (CLEANUP-03 / Phase 14 WR-01)
  - dogfood-restore.sh tar-overlay asymmetry documented as intended, option (b) (CLEANUP-04 / Phase 14 WR-02)
  - CONFIG-02 tests leak zero gsd-cfg02-* tmp dirs (CLEANUP-07 / Phase 14 WR-05)
affects: [18-03, future upstream pulls touching vcs-command-router]

# Tech tracking
tech-stack:
  added: []
  patterns: [fail-closed envelope guards returning BEFORE createVcsAdapter, describe-scoped let tmpDir + afterEach rm for vitest tmp hygiene]

key-files:
  created: []
  modified:
    - src/vcs-command-router.cts
    - src/vcs/__tests__/cmd-parallel-max-concurrency-cli.test.ts
    - scripts/dogfood-restore.sh
    - src/vcs/__tests__/cmd-parallel-jj.test.ts
    - src/vcs/__tests__/cmd-parallel-git.test.ts
    - gsd-core/bin/lib/vcs-command-router.cjs

key-decisions:
  - "CLEANUP-06 reason string locked as max_concurrency_invalid (RESEARCH Open Q1): snake_case like peers; phase_number_required NOT reused because --max-concurrency is an optional flag, not a required field; contract tests pin it"
  - "CLEANUP-04 resolved as option (b) documented asymmetry: jj op restore is the actual rollback; additive tar overlay accepted; destructive rm -rf clean-overlay rejected as new risk in a recovery primitive (Phase 14 P05 production-validated)"
  - "CLEANUP-03 assertion placed BEFORE the tarball-existence check (plan-checker revision over RESEARCH's post-tarball anchor) so the wrong-cwd verify is non-tautological"
  - "Phase 14 info findings (5 items) left untouched per scope fence (RESEARCH Pitfall 6) — opportunistic-only, default skip"

patterns-established:
  - "Dispatch input guards: fail-closed {data:{ok:false, reason:<snake_case>}} envelopes returning before adapter creation, pinned by vi.mock recordedDispatchOpts.length===0 contract tests"
  - "Vitest tmpDir hygiene: describe-scoped let tmpDir + afterEach(async () => rm(tmpDir, {recursive:true, force:true}))"

requirements-completed: [CLEANUP-03, CLEANUP-04, CLEANUP-05, CLEANUP-06, CLEANUP-07]

# Metrics
duration: 9min
completed: 2026-06-10
---

# Phase 18 Plan 02: Phase 14 review-followup hardening (WR-01..05) Summary

**Two fail-closed input-validation envelopes (`plan_not_array`, `max_concurrency_invalid`) in the dispatch router with 6 pinning contract tests, dogfood-restore.sh project-root assertion + documented tar-overlay asymmetry, and CONFIG-02 tmpDir leak elimination — 5 per-WR commits in the locked order.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-06-10T21:58:02Z
- **Completed:** 2026-06-10T22:07:00Z
- **Tasks:** 3 (5 per-WR commits + 1 artifact-rebuild commit)
- **Files modified:** 6

## Accomplishments

- CLEANUP-05: `!Array.isArray(plan)` guard after the plan `JSON.parse` returns `{ok:false, reason:'plan_not_array'}` BEFORE `createVcsAdapter`; 4 contract tests (object/string/number/null plan inputs) prove `recordedDispatchOpts.length === 0`
- CLEANUP-06: `maxConcurrency !== undefined && Number.isNaN(maxConcurrency)` guard returns `{ok:false, reason:'max_concurrency_invalid'}`; the `!== undefined` leg preserves the D-07 absent-flag-forwards-undefined contract (pre-existing test verified still green); 2 contract tests (`NaN`, `banana`)
- CLEANUP-03: `[ -f .planning/STATE.md ] || { echo "ERROR: ..." >&2; exit 1; }` after the positional parse, before the tarball check and both mutations — wrong-cwd run verified: exit 1 with `ERROR: dogfood-restore.sh must run from project root` (the root assertion fires, not the tarball FATAL); both existing node:test cases green unmodified
- CLEANUP-04: multi-line comment block adjacent to `tar -xf` documents the additive-overlay asymmetry as intended (option b); zero behavior change
- CLEANUP-07: describe-scoped `let tmpDir` + `afterEach` async `rm` in both CONFIG-02 describes; verified 0 `gsd-cfg02-*` dirs survive a CONFIG-02 run (was 6 leaked per run); full-file runs of both test files green (27/27)

## Task Commits

Per-WR commits in the locked order (05, 06, 03, 04, 07), per v1.4 Pitfall 10. Change IDs (jj):

1. **WR-03/CLEANUP-05 plan_not_array guard + contract tests** - `nrzowuxruxop` (fix)
2. **WR-04/CLEANUP-06 max-concurrency NaN guard + contract tests** - `mvprqrmpnwoy` (fix)
3. **WR-01/CLEANUP-03 dogfood-restore project-root assertion** - `oxrpsqmrnnvo` (fix)
4. **WR-02/CLEANUP-04 document tar-overlay asymmetry as intended** - `tnqskvnwwppu` (docs)
5. **WR-05/CLEANUP-07 CONFIG-02 afterEach tmpDir cleanup** - `zltrqouyotmu` (test)
6. **rebuild emitted vcs-command-router.cjs artifact** - `oxymxwvs` (chore — tracked build artifact refreshed via `pnpm run build:lib` after router edits, Pitfall 4 / 19-06 stale-dist precedent)

## Files Created/Modified

- `src/vcs-command-router.cts` - two fail-closed guards in the `workspace.parallel.dispatch` handler, both returning before `createVcsAdapter(cwd)`
- `src/vcs/__tests__/cmd-parallel-max-concurrency-cli.test.ts` - new sibling `describe('CLEANUP-05/06 — dispatch input guards')` with 6 contract `it`s reusing the existing module-level vi.mock recorder (no duplicate vi.mock block)
- `scripts/dogfood-restore.sh` - root assertion after positional parse; L25 pre-condition comment notes enforcement; overlay-asymmetry comment block adjacent to `tar -xf`
- `src/vcs/__tests__/cmd-parallel-jj.test.ts` - CONFIG-02 describe: `let tmpDir` hoist, `afterEach` rm, `afterEach`/`rm` import additions
- `src/vcs/__tests__/cmd-parallel-git.test.ts` - byte-parallel same edits (prefix `gsd-cfg02-git-`)
- `gsd-core/bin/lib/vcs-command-router.cjs` - rebuilt emitted artifact (tracked)

## WR-01..05 Closure Table

This SUMMARY is the superseding closure record for todo `v14-review-followups` WR-01..05 — the original "14-REVIEW.md closure note" criterion is path-unsatisfiable (`.planning/phases/14-default-flip-dogfood-validation/14-REVIEW.md` was archived at the v1.4 milestone close; REQUIREMENTS.md re-scope wins on paths).

| WR | REQ | Fix | Commit |
|----|-----|-----|--------|
| WR-01 | CLEANUP-03 | project-root assertion pre-mutation in dogfood-restore.sh | `oxrpsqmrnnvo` |
| WR-02 | CLEANUP-04 | tar-overlay asymmetry documented as intended (option b) | `tnqskvnwwppu` |
| WR-03 | CLEANUP-05 | `plan_not_array` Array.isArray guard + 4 contract tests | `nrzowuxruxop` |
| WR-04 | CLEANUP-06 | `max_concurrency_invalid` Number.isNaN guard + 2 contract tests | `mvprqrmpnwoy` |
| WR-05 | CLEANUP-07 | CONFIG-02 afterEach tmpDir cleanup, 6 leaks/run → 0 | `zltrqouyotmu` |

**Info findings confirmation:** the 5 Phase 14 info findings in `v14-review-followups.md` were left untouched per the scope fence (RESEARCH Pitfall 6 — opportunistic-only is never forced; the fence wins even for info items 1-2 adjacent to the Task 1 arg-loop edits).

## Decisions Made

- **`max_concurrency_invalid` reason-string decision record (RESEARCH Open Q1, locked at plan time, shipped here):** WR-04's "same guard as --phase" could not reuse `phase_number_required` — that reason names a *required* field, while `--max-concurrency` is an *optional* flag whose absence is legal (D-07 forwards `undefined`). New snake_case reason `max_concurrency_invalid` follows the peer convention (`phase_number_required`, `plan_json_parse_failed`); the 2 contract tests pin it.
- **CLEANUP-04 = option (b):** documented asymmetry over clean overlay; `rm -rf .planning` in a recovery primitive is the worst place for new risk; Phase 14 P05 validated restore-then-untar empirically.
- **Root assertion placement before the tarball check:** a post-tarball placement would make the wrong-cwd verification tautological (dummy-arg runs would exit 1 at the tarball FATAL pre- and post-fix).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking/Hygiene] Committed the rebuilt tracked emitted artifact**
- **Found during:** Task 1 verification (`pnpm run build:lib`)
- **Issue:** `gsd-core/bin/lib/vcs-command-router.cjs` is a *tracked* file (the `vcs/` subdirectory is the gitignored part per the 19-05 ledger; RESEARCH's "gitignored" note was over-broad). The build refresh left the WC dirty, which would trip the phase-completion clean-WC gate.
- **Fix:** committed as a 6th `chore(18-02)` commit after the 5 per-WR commits
- **Files modified:** gsd-core/bin/lib/vcs-command-router.cjs
- **Verification:** `jj st` clean; both VCS lints green
- **Committed in:** `oxymxwvs`

---

**Total deviations:** 1 auto-fixed (1 blocking/hygiene)
**Impact on plan:** keeps the emitted CLI artifact in sync with the router source (exactly the 19-06 stale-dist failure mode the plan's build step exists to prevent). No scope creep.

## Issues Encountered

- **`scripts/check-skip-count.cjs` exits 1 locally (current=22, origin/main baseline=18).** Pre-existing condition, NOT introduced by this plan: the +4 regression vs origin/main dates to Phase 10/11 `cmd-*.test.ts` files and was logged to deferred-items in Phase 13 (see STATE.md Phase 13 Plan 02 decision); the documented fork baseline is 22 (19-13 evidence) and this plan's edits add zero skip patterns (none of the 4 flagged files are touched by this plan). Acceptance criterion "no new skip patterns; baseline 22" is satisfied: current count is exactly 22.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 18-03 (TEST-17 re-verify gate) can run independently; the CONFIG-02 tmpDir hygiene removes 6 dirs/run of TMPDIR noise from its full-suite runs
- All four lint/audit gates green post-plan (no-raw-git 0/1073, no-commit-id 0/1026, call-presence 0/107, audit-workflow-raw-git 230-hit baseline PASS)
- Installed-GSD caveat: `~/.claude/gsd-core/` copy is stale until the operator re-runs `node bin/install.js --claude --global` from this clone (not relevant to this plan's surfaces — none ship in the installed payload except via gsd-core/bin/lib, which installs from this repo)

## Self-Check: PASSED

- All 6 modified files exist on disk
- All 6 change IDs present in `jj log` (nrzowuxruxop, mvprqrmpnwoy, oxrpsqmrnnvo, tnqskvnwwppu, zltrqouyotmu, oxymxwvs)
- Working copy clean after final commit

---
*Phase: 18-tactical-cleanup-test-flake-re-scoped*
*Completed: 2026-06-10*
