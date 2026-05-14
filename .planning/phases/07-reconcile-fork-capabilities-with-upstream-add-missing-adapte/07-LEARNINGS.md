# Phase 7 LEARNINGS — first upstream sync (v1.1 milestone)

**Date:** 2026-05-14
**Phase close:** GREEN (strict-green close-gate satisfied via documented carve-out path)

## Summary

Phase 7 landed its five PROJECT.md deliverables — 8 new adapter verbs (Plan 01), wave-cleanup executor wire (Plan 02), workflow .md raw-git fallback hard-delete (Plan 03), github-release-notes.cjs cross-backend migration (Plan 04), and upstream test-surface triage (Plan 05). The strict-green close-gate per D-15 is satisfied. No Phase 7.1 INSERTED was needed — D-16's escape hatch did not fire.

## Test-surface triage (TEST-09, TEST-10, TEST-11)

### Triage matrix

| Test file | git pass/total | jj-colo pass/total | Delta? | Root cause | Disposition |
|-----------|----------------|---------------------|--------|------------|-------------|
| `tests/installer-migration-report.test.cjs` | (subset of 94) | (subset of 94) | none | n/a | green |
| `tests/installer-migration-authoring.test.cjs` | (subset of 94) | (subset of 94) | none | n/a | green |
| `tests/installer-migration-install-integration.test.cjs` | (subset of 94) | (subset of 94) | none | n/a | green |
| `tests/installer-migrations.test.cjs` | (subset of 94) | (subset of 94) | none | n/a | green |
| **installer-migration aggregate** | **94/94** | **94/94** | **none** | RESEARCH A3 confirmed (zero VCS refs across all 4 files) | **green** |
| `tests/shell-command-projection-dispatch.test.cjs` | 12/17 → 12/12 after skip | 12/17 → 12/12 after skip | **none (same 5 fail identically on both lanes)** | fork-wide carve-out: jj-port removed upstream `execGit` per `project_no_raw_git` (shell-command-projection.cjs:375) | **green** after `describe.skip` w/ `// allow-skip:` annotation |
| `tests/bug-3413-shell-command-projection.test.cjs` | all pass | all pass | none | n/a (zero VCS refs) | green |
| `tests/bug-3441-path-action-projection.test.cjs` | all pass | all pass | none | n/a (zero VCS refs) | green |
| `tests/bug-3442-shim-projection-drift-guard.test.cjs` | all pass | all pass | none | n/a (zero VCS refs) | green |
| **shell-projection / bug-3413/3441/3442 aggregate** | **48/48** | **48/48** | **none** | (after carve-out) | **green** |
| `sdk/src/query-raw-output-projection.test.ts` | 8/8 | 8/8 | none | n/a (zero VCS refs) | green |

**Totals (after carve-out):** git 150/150, jj-colocated 150/150, no backend deltas.

### Per-delta root-cause analysis

#### Delta 1 — `shell-command-projection-dispatch.test.cjs` `describe('execGit', …)` block

**Failure mode:** 5 of 17 tests in this file fail with `TypeError: execGit is not a function`. The test imports `execGit` from `get-shit-done/bin/lib/shell-command-projection.cjs`, but the fork removed that helper.

**Why it fails:** RESEARCH A3 flagged this file as one of two test surfaces that reference any VCS-adjacent helper. The `execGit` wrapper was a raw-git invocation site (`spawnSync('git', argv, …)`). The jj-port-wide `project_no_raw_git` invariant (recorded in user-global MEMORY.md) excludes raw-git from the source tree by lint guard (`scripts/lint-vcs-no-raw-git.cjs`); when upstream's first introduction of `execGit` was merged into the fork, the wrapper was deleted with a rationale comment at `shell-command-projection.cjs:375`:

> *"jj-port: upstream's `execGit` raw-git wrapper has been removed from the shell-projection seam (project_no_raw_git). All VCS reads/writes route through `createVcsAdapter()`. The other shell-projection helpers (`execTool`, `execNpm`, `platformWriteSync`, etc.) remain — they cover non-VCS subprocess and file I/O, which the rule does not touch."*

**Backend-delta check:** identical failure list on `GSD_TEST_BACKENDS=git` and `GSD_TEST_BACKENDS=jj-colocated`. Not a backend delta. The carve-out is structural (the function doesn't exist), not VCS-routing dependent.

**Adapter-verb-gap check (D-16):** no. The failure is NOT a "production code under test relies on a NEW verb not in VCS-08..VCS-15" pattern. The failure is "upstream test asserts the existence of a helper that the fork removed by design." D-16's escape hatch does NOT engage.

**Disposition (per CONTEXT D-14/D-15 + plan 07-05 `<critical_context>`):** legitimate fork carve-out. Skipped the `execGit` describe block via `describe.skip('execGit', …) // allow-skip:` annotation with a 13-line inline rationale block pointing at this LEARNINGS file. The `// allow-skip:` annotation exempts the line from `scripts/check-skip-count.cjs` so the baseline stays at 18. The carve-out is documented at both the test fixture level (inline comment) and the phase-LEARNINGS level (this entry).

**Commit:** `89d3534ae6d8` / change `rmutuwmtrprvpmuyvzrnzquslrulpxwm` (`test(07-05): skip upstream execGit tests — jj-port carve-out (project_no_raw_git)`).

### Legitimate carve-outs (exempt from strict-green)

| Surface | Carve-out kind | Why exempt | Mechanism |
|---------|----------------|------------|-----------|
| `tests/shell-command-projection-dispatch.test.cjs` → `describe('execGit', …)` | Fork-wide structural (jj-port removed `execGit`) | `project_no_raw_git` invariant predates Phase 7; the fork cannot re-introduce raw-git without violating its own lint guard | `describe.skip` + `// allow-skip:` annotation |

### A3 deferrals (Phase 4 LEARNINGS Open Q1)

None. No test failure rooted to the A3 colocated pre-commit gap (jj 0.41 not auto-firing `.git/hooks/pre-commit` after `jj squash`). The 9 surfaces under triage all bypass any `vcs.commit({files, message})` path that would surface A3 — the installer-migration tests use synthetic `applyMigrationAction` fixtures, the shell-projection tests use in-memory string transforms, and the SDK projection test is type-level. RESEARCH §Pitfall 6 hypothetical did not materialize.

### Adapter-verb-gap escape hatches (D-16) fired

None. Phase 7 closes at exactly 8 verbs (VCS-08..VCS-15 — 7 from CONTEXT, plus `readBlob` folded into Plan 01 per planner judgment). No Phase 7.1 INSERTED is needed.

## Phase 7 close-gate evidence

- [x] **VCS-08..VCS-15** contract tests green on both backends — Plan 01 evidence (30/30 cross-backend contract + 70/70 per-domain).
- [x] **WAVE-01** executor integration tests green on both backends — Plan 02 evidence (6/6 across `tests/wave-cleanup-executor.test.cjs`).
- [x] **PROMPT-04** workflow .md edits landed — Plan 03 evidence (242 LOC of dead raw-git fallback retired; collapsed `if/else/fi` to single unconditional `gsd-sdk query worktree.cleanup-wave …` line in both `execute-phase.md` and `quick.md`).
- [x] **MIGR-05** github-release-notes migration green — Plan 04 evidence (5 cross-backend adapter call sites; 0 raw-git references; 0 inline lint annotations; first production consumer of VCS-15 `readBlob`).
- [x] **TEST-09** installer-migration surfaces green on both backends — Plan 05 evidence (94/94 on each lane).
- [x] **TEST-10** shell-projection / bug-3413/3441/3442 surfaces green on both backends — Plan 05 evidence (48/48 on each lane after `execGit` carve-out skip).
- [x] **TEST-11** `query-raw-output-projection` green on both backends — Plan 05 evidence (8/8 on each lane).
- [x] `lint-vcs-no-raw-git` stays at 0 violations (1060 files scanned).
- [x] `check-skip-count` does not regress (current=18, baseline(origin/main)=18; the new `describe.skip` is annotated with `// allow-skip:` so it's exempt).

## Phase 7.1 INSERTED proposal

**Not applicable.** D-16's escape hatch did not engage. No adapter-verb gap beyond VCS-08..VCS-15 surfaced during Plan 05 triage. The only delta found (5 failing `execGit` tests in `shell-command-projection-dispatch.test.cjs`) is a structural fork carve-out — not a verb gap. Per the disposition policy in plan 07-05's `<critical_context>`:

> *Test fails for git-side-only structural reason … : document in 07-LEARNINGS.md and add a `describe.skipIf(!isGitBackend)` guard or similar. This is acceptable per D-14 framing ("document every delta").*

Substitute "fork-wide structural reason" for "git-side-only structural reason" and the disposition rule applies cleanly: same 5 tests fail on BOTH lanes, so the gating logic isn't `skipIf(!isGitBackend)` — it's an unconditional `describe.skip` with the rationale that the fork removed the function under test.

## Verification Snapshot (Plan 05 triage)

```
$ GSD_TEST_BACKENDS=git node --test \
    tests/installer-migration-report.test.cjs \
    tests/installer-migration-authoring.test.cjs \
    tests/installer-migration-install-integration.test.cjs \
    tests/installer-migrations.test.cjs
ℹ tests 94  pass 94  fail 0

$ GSD_TEST_BACKENDS=jj-colocated node --test \
    tests/installer-migration-report.test.cjs \
    tests/installer-migration-authoring.test.cjs \
    tests/installer-migration-install-integration.test.cjs \
    tests/installer-migrations.test.cjs
ℹ tests 94  pass 94  fail 0

$ GSD_TEST_BACKENDS=git node --test \
    tests/shell-command-projection-dispatch.test.cjs \
    tests/bug-3413-shell-command-projection.test.cjs \
    tests/bug-3441-path-action-projection.test.cjs \
    tests/bug-3442-shim-projection-drift-guard.test.cjs
ℹ tests 48  pass 48  fail 0  skipped 0

$ GSD_TEST_BACKENDS=jj-colocated node --test \
    tests/shell-command-projection-dispatch.test.cjs \
    tests/bug-3413-shell-command-projection.test.cjs \
    tests/bug-3441-path-action-projection.test.cjs \
    tests/bug-3442-shim-projection-drift-guard.test.cjs
ℹ tests 48  pass 48  fail 0  skipped 0

$ GSD_TEST_BACKENDS=git npx vitest run sdk/src/query-raw-output-projection.test.ts
 Test Files  1 passed (1)
      Tests  8 passed (8)

$ GSD_TEST_BACKENDS=jj-colocated npx vitest run sdk/src/query-raw-output-projection.test.ts
 Test Files  1 passed (1)
      Tests  8 passed (8)

$ node scripts/lint-vcs-no-raw-git.cjs
ok lint-vcs-no-raw-git: 1060 files scanned, 0 violations

$ node scripts/check-skip-count.cjs
ok check-skip-count: current=18 baseline(origin/main)=18
```

## Hand-off

Phase 7 closes GREEN. Per Plan 05 objective:

- **STATE.md and ROADMAP.md updates are NOT in scope for Plan 05** (the orchestrator owns those at phase-close time per the parallel-wave structure honored across Plans 1–4 + 5). REQUIREMENTS.md likewise stays untouched by this plan.
- The 5 plan SUMMARYs (07-01..07-05) collectively constitute the phase-close evidence record. The orchestrator can mark VCS-08..VCS-15, WAVE-01, PROMPT-04, MIGR-05, and TEST-09..TEST-11 complete on review of those SUMMARYs.
- The first upstream-sync milestone (v1.1) is unblocked: the merge surfaced 5 deliverables, all 5 landed in a single phase, strict-green close-gate is satisfied.
