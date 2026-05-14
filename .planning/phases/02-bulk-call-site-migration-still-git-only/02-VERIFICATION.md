---
phase: 02-bulk-call-site-migration-still-git-only
verified: 2026-05-09T07:05:00Z
status: passed
score: 8/8 truths verified (with 2 explicit deferrals user-approved + accepted as gates)
overrides_applied: 0
re_verification: null
gaps: []
deferred:
  - truth: "First post-migration upstream rebase performed with conflict count tracked in `.planning/intel/rebase-log.md`."
    addressed_in: "Post-Phase-5 milestone-end task"
    evidence: "02-12-DEFERRED.md records user sign-off 2026-05-11 ('Approve as-is'). REQUIREMENTS.md MIGR-04 marked 'Recorded as deferred to milestone-end task (post-Phase-5) per Phase 2 plan 02-12'. ROADMAP SC4 reframing text is queued verbatim for phase-transition runner. Per CONTEXT D-17/D-18 the deferral is a user choice, not a code gap."
  - truth: "jj-native rebase recipe documented in `docs/upstream-rebase.md`."
    addressed_in: "Post-Phase-5 milestone-end task"
    evidence: "02-12-DEFERRED.md records this as a retrospective doc, written after the actual rebase. REQUIREMENTS.md UPSTREAM-01 marked 'Recorded as deferred'. ROADMAP SC5 reframing text queued verbatim."
human_verification: []
---

# Phase 02: Bulk Call-Site Migration (Still Git-Only) Verification Report

**Phase Goal:** Migrate every existing `execSync('git …')` call site in the SDK and CLI runtime to the adapter — still git-only — and verify the "mechanical edits = clean rebase" hypothesis with the first post-migration upstream rebase.

**Verified:** 2026-05-09T07:05:00Z
**Status:** passed
**Re-verification:** No — initial verification
**Branch verified:** `phase/02-migration`

## Goal Achievement Summary

The phase goal has two halves:

1. **Migration half** — Every existing `execSync('git …')` call site migrated to the adapter, still git-only. **VERIFIED** in codebase.
2. **Rebase-validation half** — Verify the "mechanical edits = clean rebase" hypothesis with the first post-migration upstream rebase. **DEFERRED** to post-Phase-5 milestone-end task per CONTEXT D-17/D-18 with full user sign-off recorded 2026-05-11.

Per the verifier brief, the rebase deferral is a satisfied gate (tracker file `02-12-DEFERRED.md` exists, contains all required content, user signed off), not a failure. The mechanical-edits invariant (D-08) — which is the load-bearing condition for the eventual rebase to be clean — was independently verified by the UPSTREAM-03 hotspot audit in plan 02-11 (CLEAN verdict, zero D-08 violations).

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Zero `execSync('git …')` in `sdk/src/query/*.ts` (non-test) and `get-shit-done/bin/lib/*.cjs` | VERIFIED | `grep -rEn "execSync\(['\"]git " sdk/src/query/ get-shit-done/bin/lib/` returns 0 non-comment matches in production sources. The only 2 hits are docstring quotations in `sdk/src/query/commit.test.ts` lines 31 + 197 (comments stating "no execSync('git ...') remain"). |
| 2 | Lint guard `lint-vcs-no-raw-git.cjs` exits 0 | VERIFIED | `node scripts/lint-vcs-no-raw-git.cjs` → `ok lint-vcs-no-raw-git: 890 files scanned, 0 violations` — exit 0. Broken-lint state from D-13 day-one shrink is closed. |
| 3 | `execGit` helper deleted from `bin/lib/core.cjs` | VERIFIED | `grep -rn "function execGit(" get-shit-done/bin/lib/` returns 0 matches. Helper deletion is documented in commit 73fc5499 (02-11 closing migration). |
| 4 | Sidecar `sdk/src/vcs/jj/.gitkeep` exists (UPSTREAM-02, D-15) | VERIFIED | `test -f sdk/src/vcs/jj/.gitkeep` → OK. Created in commit 300dd02f (02-02). |
| 5 | `expr.raw()` invariant holds (Phase 1 D-12) | VERIFIED | `grep -rn "expr\.raw(" sdk/src/` returns 0 callable matches; only 3 hits are comments stating "D-12 forbids `expr.raw()`". The 17-verb gap-fill (02-03) + `expr.range` factory absorbed every site. |
| 6 | Baseline parity coverage — every per-site baseline round-trips clean (D-10) | VERIFIED | `cd sdk && pnpm exec vitest run src/vcs/__tests__/baseline-parity.test.ts` → 55/55 pass in 10.15s. 55 baseline JSON files present in `tests/baselines/git-vcs/`. |
| 7 | D-06 paired-test atomicity — source migration + paired test retarget land together | VERIFIED | Spot-checked 3 commits: 021d7823 (commit.ts) touches `sdk/src/query/commit.ts` + `commit.test.ts` + 7 baselines + parity dispatch in one commit; b34700a3 (verify.cjs) touches `verify.cjs` + `verify.test.cjs` + 6 baselines in one commit; 4093a4b1 (commands.cjs) touches `commands.cjs` + `commands.test.cjs` + `commit-files-deletion.test.cjs` + `workspace.test.cjs` in one commit. Each commit message documents vacuous-paired exceptions (e.g., quick-branching, bug-2767, bug-2916 use execFileSync not the regex pattern). |
| 8 | D-08 mechanical-only invariant — UPSTREAM-03 hotspot audit CLEAN | VERIFIED | `02-11-AUDIT.md` Summary: "Final Verdict: CLEAN; Hotspots audited: 3 (core.cjs, verify.cjs, commands.cjs); D-08 violations: 0; Documented Rule-2 deviations surfaced: 1 (commands.cjs `stagedOrUnstaged` #2014 invariant safeguard, plan-sanctioned in 02-09 SUMMARY)." |
| 9 | D-09 helpers closure — `createTempGitProject` body uses zero raw git | VERIFIED | `grep -cE "execSync\(['\"]git (init\|config)" tests/helpers.cjs` returns 0. The 4 raw-git bootstrap calls were retired in commit cf59c6cb (02-03 Task 4 / W2 fix). The body uses `vcs.gitOnly.init()` + `vcs.gitOnly.configSet(...)` + `vcs.commit(...)`. |
| 10 | Deferred tracker integrity — `02-12-DEFERRED.md` present + complete + user-approved | VERIFIED | File exists at canonical path; contains "MIGR-04", "UPSTREAM-01", "D-17", "D-18", "milestone-end", "Phase 5"; references `.planning/intel/rebase-log.md` + `docs/upstream-rebase.md`; contains verbatim replacement text for ROADMAP SC4 + SC5; user sign-off recorded ("Approve as-is", 2026-05-11) in 02-12-SUMMARY.md. REQUIREMENTS.md rows for MIGR-04 + UPSTREAM-01 reference back to the tracker. |
| 11 | Plan 02-04 deferral surface — paired worktree tests still pass against git | VERIFIED | `node --test tests/prune-orphaned-worktrees.test.cjs` → 4/4 pass, 0 skipped; `node --test tests/bug-2774-worktree-cleanup-workspace-safety.test.cjs` → 7/7 pass, 0 skipped. Both files retain raw `execSync('git ...')` test setup (worktree add -b / merge / checkout / branch -m verbs not yet in adapter). They are allowlisted via the `tests/**/*.test.cjs` glob in `scripts/lint-vcs-no-raw-git.allow.json`. Per ROADMAP SC2's "no skipped-count regression" sub-clause, this is consistent: tests pass, count is unchanged. Per 02-04 SUMMARY: extending the adapter for these verbs is a follow-up plan, not in 02-04's mechanical-only scope. |

**Score:** 11/11 truths verified.

## Roadmap Success Criteria

| # | Criterion (verbatim from ROADMAP.md Phase 2) | Status | Notes |
|---|---|---|---|
| 1 | Zero `execSync('git …')` remain in non-test source under `sdk/src/query/*.ts` and `get-shit-done/bin/lib/*.cjs` — verified by repo-wide grep audit landing in the lint guard. | VERIFIED | Truth #1 + #2 (lint guard scans 890 files, 0 violations). |
| 2 | Every existing git-touching test in `tests/` is retargeted onto the `vcs` fixture (no raw git invocations in test setup) and continues to pass against the git backend with no skipped-count regression. | VERIFIED (with documented partial deferral) | Truth #7, #9, #11. The 2 worktree test files (`prune-orphaned-worktrees.test.cjs`, `bug-2774-worktree-cleanup-workspace-safety.test.cjs`) still use raw git for setup because their fixtures need adapter verbs not yet shipped (worktree add -b/merge/checkout/branch-rename). Per 02-04 SUMMARY (key-decisions), this is an explicit scope-bounded deferral, not a regression: both tests pass, 0 skipped, allowlisted via the existing `tests/**/*.test.cjs` glob. Per the verifier brief, this is "acceptable deferral" — meets SC2's "no skipped-count regression" sub-clause. |
| 3 | Each call-site migration is mechanical (Branch-by-Abstraction) — call-by-call diff swaps without changing surrounding logic; reviewed via per-file commit history, not bulk rewrites. | VERIFIED | Truth #7 + #8. Per-file commit history present (one commit per source file, with paired tests). UPSTREAM-03 audit explicit CLEAN verdict. |
| 4 | The first upstream rebase performed after the migration completes with conflict count tracked and recorded in `.planning/intel/rebase-log.md`, and conflicts are concentrated in the adapter call-site layer (mechanical) rather than scattered across surrounding logic. | DEFERRED (user-approved) | Per CONTEXT D-17/D-18, deferred to post-Phase-5 milestone-end task. Verbatim replacement text recorded in `02-12-DEFERRED.md` for ROADMAP runner to apply at next phase transition. ROADMAP runner has NOT yet applied the splice; current ROADMAP still shows the original SC4. Not a code gap. |
| 5 | `UPSTREAM-01` jj-native rebase workflow documented in `docs/upstream-rebase.md`, and `sdk/src/vcs/jj/` and `sdk/src/vcs/parse/jj-*.ts` sidecar paths exist as zero-conflict surfaces (even if empty). | PARTIAL → DEFERRED (user-approved) | UPSTREAM-02 sidecar half is VERIFIED (truth #4 — `sdk/src/vcs/jj/.gitkeep` exists; `sdk/src/vcs/parse/jj-rev.ts` already shipped from Phase 1). UPSTREAM-01 recipe doc half is DEFERRED to milestone-end task per `02-12-DEFERRED.md`. Verbatim replacement text recorded for ROADMAP runner. |

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `sdk/src/vcs/jj/.gitkeep` | UPSTREAM-02 sidecar zero-conflict surface | VERIFIED | Exists per Check 4. |
| `tests/baselines/git-vcs/*.snap.json` | Per-site baselines (D-10), ~55 total post-Phase-2 | VERIFIED | 55 files present; all round-trip via baseline-parity test. |
| `.planning/phases/02-bulk-call-site-migration-still-git-only/02-12-DEFERRED.md` | Deferral tracker with verbatim ROADMAP reframing text | VERIFIED | Truth #10. Complete content match. |
| `.planning/phases/02-bulk-call-site-migration-still-git-only/02-11-AUDIT.md` | UPSTREAM-03 hotspot-discipline audit verdict | VERIFIED | CLEAN verdict for all 3 hotspots. |
| `get-shit-done/bin/lib/*.cjs` (47 files) | Zero raw `execSync('git ...')` | VERIFIED | Final grep returns exit 1 (no matches) across all 47 files. |
| `sdk/src/query/*.ts` (non-test) | Zero raw `execSync('git ...')` | VERIFIED | Same grep returns exit 1 in non-test sources. |
| `tests/helpers.cjs` `createTempGitProject` | Zero raw git in body | VERIFIED | Body uses `vcs.gitOnly.init/configSet` + `vcs.commit`. |

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `get-shit-done/bin/lib/*.cjs` consumers | `sdk/dist-cjs/vcs` | `require('../../../sdk/dist-cjs/vcs/...')` relative-path shape | WIRED | 02-04 SUMMARY documents this as the locked consumption shape; baseline-parity tests exercise it end-to-end (55 baselines pass through the live require path). |
| Paired test files | `tests/helpers.cjs` `vcsTest` fixture | `vcsTest('git', (handle) => …)` | WIRED | Spot-checked in commits 021d7823, b34700a3, 4093a4b1 — paired tests adopt `vcsTest` or `vcs.*` consumers in the same commit as their source migration. |
| `02-12-DEFERRED.md` | ROADMAP.md Phase 2 SC 4 + 5 (reframing-queued) | Verbatim replacement text in tracker for future splice | WIRED | Tracker contains exact strings; REQUIREMENTS.md MIGR-04 + UPSTREAM-01 rows reference the tracker; ROADMAP runner queued for next phase transition. |
| `REQUIREMENTS.md` MIGR-04 / UPSTREAM-01 entries | `02-12-DEFERRED.md` tracker | "see `.planning/phases/02-bulk-call-site-migration-still-git-only/02-12-DEFERRED.md`" cross-reference | WIRED | Both rows cross-reference the tracker explicitly. |

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Lint guard runs and exits clean | `node scripts/lint-vcs-no-raw-git.cjs` | `ok lint-vcs-no-raw-git: 890 files scanned, 0 violations`, exit 0 | PASS |
| Baseline parity suite passes | `cd sdk && pnpm exec vitest run src/vcs/__tests__/baseline-parity.test.ts` | 55/55 pass, 10.15s | PASS |
| Deferred worktree test 1 still passes against git | `node --test tests/prune-orphaned-worktrees.test.cjs` | 4/4 pass, 0 skipped, 0 fail | PASS |
| Deferred worktree test 2 still passes against git | `node --test tests/bug-2774-worktree-cleanup-workspace-safety.test.cjs` | 7/7 pass, 0 skipped, 0 fail | PASS |
| `execGit` function definition deleted | `grep -rn "function execGit(" get-shit-done/bin/lib/` | exit 1 (no matches) | PASS |
| `expr.raw(` callable removed | `grep -rn "expr\.raw(" sdk/src/` | only 3 doc-comment matches, no callables | PASS |
| Sidecar exists | `test -f sdk/src/vcs/jj/.gitkeep` | OK | PASS |

## Requirements Coverage

| Requirement | Description (abbrev.) | Status | Evidence |
|-------------|----------------------|--------|----------|
| MIGR-01 | All `execSync('git …')` in `sdk/src/query/*.ts` migrated | SATISFIED | Truth #1; lint guard exit 0 over all production source. |
| MIGR-02 | All `execSync('git …')` in `bin/lib/*.cjs` migrated (core, verify, commands, worktree-safety, init, graphify, drift) | SATISFIED | All 47 `bin/lib/*.cjs` files clean per grep + lint. Note: REQUIREMENTS.md row text + matrix entry are slightly stale (still says "*partial*" and "In Progress") but the footer correctly states "complete". Doc-lag warning, not code gap. |
| MIGR-03 | Migration is mechanical (Branch-by-Abstraction) | SATISFIED | Truth #8 (UPSTREAM-03 audit CLEAN, 0 D-08 violations). |
| MIGR-04 | First upstream rebase + conflict-count metric | RECORDED-AS-DEFERRED | `02-12-DEFERRED.md` records deferral; user sign-off 2026-05-11; ROADMAP SC4 reframing queued. Per verifier brief, this is an acceptable deferral, not a gap. |
| TEST-05 | All ~80 git-touching tests retargeted onto `vcs` fixture | SATISFIED (with 2 documented exceptions covered by allowlist glob) | Truth #7, #9, #11. Two worktree-fixture tests retain raw git for setup pending adapter verbs (worktree add -b/merge/checkout/branch-rename). Both pass, 0 skipped, exempt via existing `tests/**/*.test.cjs` allowlist glob. Per 02-04 SUMMARY this is scope-bounded mechanical-only adherence (D-08), not regression. |
| UPSTREAM-01 | jj-native rebase recipe in `docs/upstream-rebase.md` | RECORDED-AS-DEFERRED | `02-12-DEFERRED.md` records deferral; user sign-off; ROADMAP SC5 reframing queued. |
| UPSTREAM-02 | Sidecar `sdk/src/vcs/jj/` + `sdk/src/vcs/parse/jj-*.ts` zero-conflict surface | SATISFIED | Truth #4 (`sdk/src/vcs/jj/.gitkeep`); `sdk/src/vcs/parse/jj-rev.ts` shipped from Phase 1. |
| UPSTREAM-03 | Hotspot files only see adapter call-site swaps inline; no jj-specific logic | SATISFIED | Truth #8. `02-11-AUDIT.md` explicit CLEAN verdict for core.cjs, verify.cjs, commands.cjs. |

All 8 Phase 2 requirements accounted for: 6 SATISFIED + 2 RECORDED-AS-DEFERRED (with full trail and user sign-off).

## Anti-Patterns Found

Scanned all modified files for stub/TODO/placeholder markers. None of significance found in Phase 2 source migrations.

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `sdk/src/query/commit.test.ts:31,197` | `execSync('git ...')` string in JSDoc | INFO | Documentation comment explaining the migration; not a code stub. |
| `sdk/src/vcs/expr.ts:64,97` + `sdk/src/query/progress.ts:294` | Comment mentions `expr.raw()` forbidden | INFO | Comments enforcing the Phase 1 D-12 invariant; not stubs. |
| `commands.cjs` `stagedOrUnstaged` short-circuit | Rule-2 deviation (auto-add missing critical functionality) | INFO | Plan-sanctioned per 02-09 SUMMARY + UPSTREAM-03 audit. Preserves #2014 invariant byte-for-byte. Documented; not a hidden anti-pattern. |

Zero blockers, zero warnings.

## Human Verification Required

None for Phase 2. All Phase 2 deliverables are programmatically observable:

- Lint guard exit code is binary
- Grep for raw `execSync('git ...')` is deterministic
- Baseline parity test result is binary
- Tracker file existence + content is grep-checkable
- User sign-off for the deferred half is already recorded in `02-12-SUMMARY.md` (resume-signal "Approve as-is", 2026-05-11)

The rebase-validation half of the goal (MIGR-04 / UPSTREAM-01) is the user's own future task — that future task itself will require human verification when it runs post-Phase-5, but not now.

## Deferred Items

Two items are explicitly deferred to a post-Phase-5 milestone-end task per CONTEXT D-17/D-18 with user sign-off recorded:

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | MIGR-04: First upstream rebase + `.planning/intel/rebase-log.md` conflict-count log | Post-Phase-5 milestone-end task | `02-12-DEFERRED.md` records the deferral, trigger conditions, artifacts to create, and verbatim ROADMAP SC4 replacement text. User sign-off recorded 2026-05-11. |
| 2 | UPSTREAM-01: `docs/upstream-rebase.md` jj-native rebase recipe (written as retro of actual rebase) | Post-Phase-5 milestone-end task | Same tracker; verbatim ROADMAP SC5 replacement text queued. |

Per the verifier brief: "Treat the rebase deferral as a satisfied gate (tracker file exists, user sign-off recorded), not a failure." Both items meet that bar.

## Documentation Lag Warnings (Non-Blocking)

These do not affect goal achievement but should be reconciled at the next phase transition:

1. **REQUIREMENTS.md MIGR-02 row text** still says "*partial: worktree-safety.cjs complete (plan 02-04); 6 files outstanding*" — but all 6 files are now migrated. The traceability-matrix row shows "In Progress" while the footer correctly reads "complete". The lint guard's exit-0 status is the authoritative source.
2. **ROADMAP.md Phase 2 success criteria 4 + 5** still show the original wording. The verbatim replacement text recorded in `02-12-DEFERRED.md` is queued for the next phase-transition runner to apply mechanically. Until the transition runs, criterion 4 and 5 in ROADMAP read as if they require the rebase, but the project-level decision (D-17, D-18, user sign-off) is that they are reframed-pending.
3. **REQUIREMENTS.md footer count discrepancy** (78 vs 86) carried from Phase 1 — flagged for next-phase-transition reconciliation per `02-CONTEXT.md` deferred items.

## Gaps Summary

No code gaps. Phase 2's migration deliverables are all in the codebase and pass programmatic checks:

- All production `execSync('git ...')` sites migrated → lint exit 0.
- `execGit` helper deleted from core.cjs.
- 55 per-site baselines round-trip clean.
- D-06 paired-test atomicity holds in commit history.
- D-08 mechanical-only invariant verified by UPSTREAM-03 audit (CLEAN, 0 violations).
- Sidecar exists at `sdk/src/vcs/jj/.gitkeep`.
- Deferral tracker complete with user sign-off.
- 2 worktree test files with raw-git setup remain as documented scope-bounded deferral (verbs pending; both tests pass with 0 skipped against git).

The rebase-validation half of the phase goal is explicitly user-deferred to post-Phase-5 with full audit trail. Per verifier brief, this is a satisfied gate, not a failure.

## Phase 2 Verdict

**PASSED.** Phase 2 migration deliverables are present and verified in the codebase. The rebase-validation half is deferred-by-user-decision with a complete tracker, verbatim ROADMAP reframing text, and recorded sign-off. Documentation reconciliation tasks (MIGR-02 row text, ROADMAP SC4/SC5 splicing, footer count) are flagged for the next phase-transition runner.

Phase 2 is ready to merge `phase/02-migration` → `main` and proceed to Phase 3.

---

*Verified: 2026-05-09T07:05:00Z*
*Verifier: Claude (gsd-verifier, goal-backward methodology)*
