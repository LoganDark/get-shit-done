---
phase: 02-bulk-call-site-migration-still-git-only
plan: 02
subsystem: testing

tags: [vcs-adapter, lint-allowlist, sidecar, helpers-migration, branch-by-abstraction]

requires:
  - phase: 01-adapter-foundation-git-backend
    provides: "createVcsAdapter factory + dist-cjs build target + lazy _loadVcs getter pattern in tests/helpers.cjs"
  - phase: 02-bulk-call-site-migration-still-git-only (plan 01)
    provides: "phase/02-migration long-lived branch (D-12); commit.test.ts gpgsign triage gate closed (D-03/D-04)"
provides:
  - "tests/helpers.cjs::createTempGitProject post-init commit step routes through VcsAdapter (partial D-09 migration)"
  - "Day-one allowlist shrink: 9 entries removed, lint intentionally broken on phase/02-migration (D-13)"
  - "sdk/src/vcs/jj/.gitkeep zero-conflict sidecar surface (UPSTREAM-02 / D-15)"
affects: [02-03-helpers-closing-migration, 02-04-and-onward-per-file-migrations, 03-jj-backend]

tech-stack:
  added: []
  patterns:
    - "Helpers-migration partial pattern: post-init steps migrate via VcsAdapter while allowlist-permitted bootstrap (init + config) stays raw-git pending gap-fill verbs"
    - "Live-progress-tracker allowlist (D-14): every still-raw-git source file is a lint violation; allowlist shape matches post-Phase-2 steady state"
    - "Zero-conflict sidecar via .gitkeep: Phase 3 deletes on first real .ts module (mirrors Phase 1 _placeholder.ts precedent)"

key-files:
  created:
    - sdk/src/vcs/jj/.gitkeep
  modified:
    - tests/helpers.cjs
    - scripts/lint-vcs-no-raw-git.allow.json

key-decisions:
  - "Mechanical-only invariant honored (D-08): all three commits are pure mechanical edits; no surrounding-logic refactors"
  - "Partial helpers migration accepted (D-09): bootstrap (init + 3x config) remains raw inside the allowlisted file; closing migration scheduled for plan 02-03 once vcs.gitOnly.init() and vcs.gitOnly.configSet(...) gap-fill verbs land"
  - "Allowlist edits limited to globs array (the 9 target entries all lived in globs, not files); no entry reorderings, no comment edits, no scanner edits"
  - "docs-init.ts entry removal contributes 0 new lint violations (file has zero raw-git invocations) — bookkeeping per D-14 only"

patterns-established:
  - "tests/helpers.cjs lazy _loadVcs() destructure inside function body: keeps dist-cjs require deferred (Phase 1 STATE.md note: pre-build-guard friendly for non-VCS tests)"
  - "Allowlist as live progress tracker (D-14): broken lint on phase/02-migration is the forcing function; main stays green throughout"
  - "Sidecar dir creation pattern: empty dir + .gitkeep with UPSTREAM-* / Phase-N / deletion-cue comments"

requirements-completed: [TEST-05, UPSTREAM-02, MIGR-03]

duration: ~9m
completed: 2026-05-09
---

# Phase 02 Plan 02: helpers + day-one allowlist shrink + jj sidecar Summary

**Three coordinated mechanical commits on `phase/02-migration` that establish the Phase 2 working surface: `createTempGitProject` commits via VcsAdapter, the lint allowlist shrinks to its post-Phase-2 steady state (lint now intentionally broken on the migration branch), and `sdk/src/vcs/jj/` exists as a zero-conflict sidecar for Phase 3.**

## Performance

- **Duration:** ~9m
- **Started:** 2026-05-09T03:00:00Z (approx, immediately after 02-01 metadata commit)
- **Completed:** 2026-05-09T03:09:00Z
- **Tasks:** 3
- **Files modified:** 2 (1 modified, 1 created sidecar dir + file)
- **Commits on phase/02-migration:** 3 (one per task) + 1 plan metadata commit

## Accomplishments

- **D-09 partial helpers migration:** `tests/helpers.cjs::createTempGitProject` now consumes the VcsAdapter for the post-init commit step; bootstrap raw-git (init + 3x config) stays inside this allowlisted file pending plan 02-03 gap-fill. Function signature unchanged; all 14 callers continue working unchanged. `node --test tests/core.test.cjs` reports 182/182 pass after the migration (no regressions).
- **D-13 day-one allowlist shrink:** Removed exactly 9 entries from `scripts/lint-vcs-no-raw-git.allow.json` (the broad `get-shit-done/bin/lib/**/*.cjs` glob + 7 `sdk/src/query/*.ts` entries + `sdk/src/init-runner.ts`). All Phase 1 D-18 steady-state entries (sdk/src/vcs/exec.ts, backends/git.ts, parse/git-rev.ts, parse/jj-rev.ts, all `__tests__/**`, tests/helpers.cjs, capture-vcs-baselines, scripts/lint-vcs-no-raw-git.cjs, scripts/check-skip-count.cjs, scripts/run-tests.cjs, base64/secret/prompt-injection scan scripts, .github/workflows, .githooks, docs, .planning) intact.
- **D-12 broken-lint state established:** `node scripts/lint-vcs-no-raw-git.cjs` exits 1 with **14 violations across 8 files** (broken intentionally on `phase/02-migration`; `main` stays green; CI on `phase/02-migration` only triggers on PR to main per RESEARCH §Day-One Allowlist Shrink CI behavior). The full violation list is the live work surface for plans 02-04 through 02-11.
- **D-15 / UPSTREAM-02 sidecar landed:** `sdk/src/vcs/jj/` exists with a `.gitkeep` containing the canonical UPSTREAM-02 / Phase 3 / deletion-cue comment block. `cd sdk && pnpm build && pnpm build:cjs` both succeed (no tsc empty-include guard fires; `.gitkeep` is not a `.ts` source).

## Task Commits

Each task committed atomically on `phase/02-migration`:

1. **Task 1: tests/helpers.cjs createTempGitProject commits via VcsAdapter** — `743d50db` (refactor)
2. **Task 2: day-one allowlist shrink — remove 9 entries (D-13)** — `1ac03962` (chore)
3. **Task 3: create sdk/src/vcs/jj/ sidecar surface (UPSTREAM-02 / D-15)** — `300dd02f` (feat)

**Plan metadata commit:** (final docs commit — see git log entry created after this SUMMARY.md is written)

## Files Created/Modified

- `tests/helpers.cjs` — `createTempGitProject` (lines 86-110) now destructures `_loadVcs()`'s `vcs` module and runs `vcs.commit({ files: ['.'], message: 'initial commit' })` instead of `execSync('git add -A')` + `execSync('git commit -m …')`. Bootstrap (init + 3x config) unchanged. Diff contained to inside the function body.
- `scripts/lint-vcs-no-raw-git.allow.json` — `globs` array shrunk by 9 entries; `files` array untouched; comments untouched.
- `sdk/src/vcs/jj/.gitkeep` — new file (3 lines), creates the sidecar directory.

## Lint Violation Inventory (post-shrink, for downstream plan tracking)

**Total: 14 violations across 8 files** — this list is the work surface for plans 02-04 through 02-11.

| File | Violations | Notes |
|------|-----------:|-------|
| `get-shit-done/bin/lib/commands.cjs` | 1 | `git diff --cached --name-only` at L994 |
| `get-shit-done/bin/lib/core.cjs` | 2 | `check-ignore` at L603, generic `spawnSync('git', ...)` at L744 (hotspot per D-02) |
| `get-shit-done/bin/lib/init.cjs` | 3 | `git status --porcelain` ×2 (L1519, L1641), `git --version` at L1538 |
| `get-shit-done/bin/lib/worktree-safety.cjs` | 1 | generic `spawnSync('git', ...)` at L33 (D-01 smoke-test candidate) |
| `sdk/src/init-runner.ts` | 1 | `execFile('git', …)` at L675 |
| `sdk/src/query/check-decision-coverage.ts` | 1 | `execFile('git', ['log', …])` at L385 (RESEARCH note: research said 6, fresh grep confirms 1) |
| `sdk/src/query/commit.ts` | 2 | `spawnSync('git', …)` at L38 + `git -C … add` at L294 |
| `sdk/src/query/init.ts` | 3 | `git status --porcelain` ×2 (L1009, L1138), `git --version` at L1019 |

**Files in the removal set with ZERO violations** (entry removal is bookkeeping only — no source migration needed):

- `sdk/src/query/verify.ts` — 0 violations
- `sdk/src/query/progress.ts` — 0 violations
- `sdk/src/query/check-ship-ready.ts` — 0 violations
- `sdk/src/query/docs-init.ts` — 0 violations (confirmed in plan; `.git` only appears in an exclusion-paths array)

This inventory + the file/violation map is the canonical reference for downstream plans 02-04..02-11 to pick up.

## Decisions Made

- **Mechanical-only invariant honored (D-08):** Each task's diff is exactly the declared change — no opportunistic renames, no shared-helper extractions, no comment-only churn. Task 1 added 1 explanatory comment block + the destructure + the commit call (10 net added lines, 2 deleted). Task 2 removed exactly 9 lines, no additions. Task 3 added 3 lines (the .gitkeep).
- **Partial helpers migration accepted (D-09):** Per the plan's explicit scope: only the post-init commit step migrates in this plan. The bootstrap (init + 3x config) raw-git remains inside `tests/helpers.cjs` which is allowlisted (Phase 1 D-18 entry; survives D-14 steady-state). Closing migration uses `vcs.gitOnly.init()` + `vcs.gitOnly.configSet(...)` and lands in plan 02-03 once those gap-fill verbs exist.
- **Allowlist edits scoped to `globs`-only:** All 9 target entries lived in the `globs` array. The `files` array and the two `$comment` entries were not touched. The diff against `HEAD~1` is 9 deletions, zero additions.
- **`.gitkeep` chosen over stub TS module (D-15):** Per CONTEXT D-15 + RESEARCH §Pattern 4 verdict + Phase 1 `_placeholder.ts` deletion precedent. Lower-friction and lets Phase 3's first commit be a clean addition rather than a delete-and-replace.

## Deviations from Plan

None — plan executed exactly as written.

A minor observational note (not a deviation): `git diff main..HEAD -- scripts/lint-vcs-no-raw-git.allow.json` shows the allowlist file as wholly new (because `main` predates Phase 1's allowlist creation in commit `9c1344e8`). The acceptance criterion's spirit (only removals) was honored — verified instead via `git diff HEAD~1 HEAD -- scripts/lint-vcs-no-raw-git.allow.json` which shows exactly 9 `-` lines and 0 `+` lines.

## Issues Encountered

None. Build (`pnpm build:cjs`) was already current; downstream test (`tests/core.test.cjs`) passed first try after the helpers migration.

## User Setup Required

None — no external configuration changed.

## Next Phase Readiness

- **Plan 02-03 (helpers closing migration + gap-fill verbs)** is unblocked. It needs to (a) add `vcs.gitOnly.init()` and `vcs.gitOnly.configSet(...)` to the adapter (gap-fill), and (b) close the remaining 4 raw-git calls (init + 3x config) in `tests/helpers.cjs::createTempGitProject` so the bootstrap is fully adapter-aware. After 02-03, `tests/helpers.cjs` becomes zero-raw-git (the existing allowlist entry stays for the lazy-getter `require` pattern but `createTempGitProject` itself contains no `execSync('git …')`).
- **Plans 02-04 through 02-11** can now proceed in ascending-LOC-and-D-02 order against the 14-violation work surface above. Per D-06, each per-file plan migrates source + test in the same commit. Per D-05, all sites in a single source file migrate in one commit.
- **Lint state on `phase/02-migration` is broken** until every violation closes. This is by design per D-12. CI on `phase/02-migration` only triggers on PR-open to main per RESEARCH §Day-One Allowlist Shrink CI behavior; pushes to the branch don't run lint CI.
- **Phase 3 sidecar ready:** When the first jj backend `.ts` module lands at `sdk/src/vcs/jj/jj.ts`, the executor for that plan deletes `sdk/src/vcs/jj/.gitkeep` in the same commit (the `.gitkeep`'s comment cues this).

## Self-Check: PASSED

- `tests/helpers.cjs::createTempGitProject` contains `createVcsAdapter` and `vcs.commit({` calls, signature unchanged (line 86): confirmed via grep.
- `scripts/lint-vcs-no-raw-git.allow.json` no longer contains any of the 9 removed entries; all Phase 1 keepers (`sdk/src/vcs/exec.ts`, `sdk/src/vcs/backends/git.ts`, `tests/helpers.cjs`) remain: confirmed via `node -e "..."` verification one-liner from plan §verify.
- `sdk/src/vcs/jj/.gitkeep` exists, contains `UPSTREAM-02` and `Phase 3` strings, has 3 lines: confirmed via `test -f && grep -q && wc -l`.
- All three commits exist on `phase/02-migration` in order: `743d50db`, `1ac03962`, `300dd02f`: confirmed via `git log --oneline -3`.
- `node --test tests/core.test.cjs` exits 0 with 182/182 passing: confirmed in execution output (Tests 182, pass 182, fail 0).
- `cd sdk && pnpm build && pnpm build:cjs` both succeed: confirmed in execution output (no errors).
- `node scripts/lint-vcs-no-raw-git.cjs` exits 1 with 14 violations across 8 files: confirmed (this is the expected D-12 broken-lint state, recorded in the inventory table above).
- Branch: `phase/02-migration` per D-12.

---

*Phase: 02-bulk-call-site-migration-still-git-only*
*Completed: 2026-05-09*
