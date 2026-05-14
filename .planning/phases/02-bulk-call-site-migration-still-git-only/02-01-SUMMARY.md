---
phase: 02-bulk-call-site-migration-still-git-only
plan: 01
subsystem: testing

tags: [vitest, gpgsign, fixture-isolation, triage, vcs]

requires:
  - phase: 01-adapter-foundation-git-backend
    provides: "Canonical gpgsign-disabler fixture pattern at sdk/src/vcs/__tests__/git-backend.test.ts:31-32"
provides:
  - "21/21 commit.test.ts tests pass on developer machines with global commit.gpgsign=true"
  - "Triage gate (D-03/D-04) opened for plan 02-08 paired commit.ts source + commit.test.ts test migration"
affects: [02-08-commit-ts-migration, future-fixture-bootstrap-work]

tech-stack:
  added: []
  patterns:
    - "Per-test gpgsign disabler block (commit.gpgsign + tag.gpgsign) inside beforeEach"

key-files:
  created: []
  modified:
    - sdk/src/query/commit.test.ts

key-decisions:
  - "Mechanical-only fix per D-08: only fixture lines added; no test bodies, helpers, allowlists, or call sites touched"
  - "Inline insertion (no helper extraction) — keeps the diff to 3 lines and mirrors git-backend.test.ts:31-32 verbatim"

patterns-established:
  - "Phase 2 fixture-isolation pattern: every test that runs `git commit` in a temp repo MUST disable both commit.gpgsign and tag.gpgsign in the per-test config to be hermetic against developer global git config"

requirements-completed: [MIGR-03]

duration: ~1m
completed: 2026-05-10
---

# Phase 02 Plan 01: commit.test.ts gpgsign triage Summary

**Mechanical 3-line fixture fix in `commit.test.ts` beforeEach — disables `commit.gpgsign`/`tag.gpgsign` per temp repo so the 9 pre-existing failures triggered by global `commit.gpgsign=true` (RESEARCH §commit.test.ts:304 Triage) stop firing on developer machines.**

## Performance

- **Duration:** ~1m
- **Started:** 2026-05-10T02:56:18Z
- **Completed:** 2026-05-10T02:58:18Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Reproduced the `commit.test.ts:304` failure locally (9 of 21 tests failing with `gpg: skipped … No secret key` / `fatal: failed to write commit object`).
- Added the canonical Phase-1 disabler block (`git config commit.gpgsign false` + `git config tag.gpgsign false`) inside the existing `beforeEach`, after the existing `user.name` config line.
- Verified 21/21 tests now pass via `cd sdk && pnpm exec vitest run src/query/commit.test.ts`.
- Closed D-03/D-04 gate: plan 02-08 may now pair `commit.ts` source migration with `commit.test.ts` test retargeting in a single per-file commit (D-06).

## Task Commits

Each task was committed atomically on `phase/02-migration`:

1. **Task 1: Add gpgsign disablers to commit.test.ts beforeEach** — `rulrvmvoypsluwwlsokvplqrtosypzqx` (fix)

**Plan metadata commit:** (final docs commit, see git log)

## Files Created/Modified

- `sdk/src/query/commit.test.ts` — beforeEach now disables both `commit.gpgsign` and `tag.gpgsign` in the temp git repo. 3 lines added (1 single-line comment + 2 `execSync` invocations); zero test-body changes.

## Decisions Made

- **Mechanical-only invariant honored (D-08):** Only the two `execSync` lines and one explanatory single-line comment were added. No test bodies, no helper extractions, no call-site migrations, no allowlist edits. The diff is exactly 3 added lines.
- **Inline insertion vs helper extraction:** Plan called for verbatim insertion of git-backend.test.ts:31-32 — no helper function. Rationale (per D-08): refactor-style helper extractions are explicitly forbidden during Phase 2 migration commits to keep the rebase surface clean.
- **Single-line comment included:** Added `// Phase 2 D-03 fix: isolate fixture from global commit.gpgsign=true` to make the rationale discoverable from the source. Within the ≤4 added-lines acceptance criterion.

## Deviations from Plan

None — plan executed exactly as written.

The plan specified an exact 2-line insertion (with optional 1-line comment). I included the optional single-line comment so a future reader sees the D-03 rationale at the call site. The total added-line count (3) is within the plan's `≤4 added lines` acceptance criterion.

## Issues Encountered

None during the fix. The local repro of the original failure matched RESEARCH §commit.test.ts:304 Triage exactly:

- 9 failing tests, all at `execSync('git commit -m "init"', …)` lines (216, 304, etc.).
- Error stream: `gpg: skipped "Test User <test@test.com>": No secret key` → `fatal: failed to write commit object`.
- Cause: developer machine has global `commit.gpgsign=true`; CI machines don't, which is why this only surfaced locally.
- Fix: per-test config override disables gpgsign in the temp repo, isolating from global config.

## User Setup Required

None — no external configuration changed.

## Next Phase Readiness

- **Plan 02-02 (helpers + day-one allowlist shrink + gap-fill verbs)** is ready to begin. Plan 02-01 did not touch shared helpers or the lint allowlist (forbidden by D-08 within this plan's scope).
- **Plan 02-08 (commit.ts paired migration)** is unblocked per D-03/D-04. The retargeting of `commit.test.ts` from raw `execSync('git …')` onto the `vcsTest` fixture happens in that later plan, paired atomically with the `commit.ts` source migration (D-06).
- **`config-mutation.test.ts:441`** remains the second pre-existing failure noted in STATE.md. It does not depend on git/vcs and is explicitly out of Phase 2 scope (deferred maintenance).

## Self-Check: PASSED

- `sdk/src/query/commit.test.ts` exists and contains both new `git config (commit|tag).gpgsign false` lines in the `beforeEach` block: confirmed via `git diff main..HEAD`.
- Commit `rulrvmvoypsluwwlsokvplqrtosypzqx` exists on `phase/02-migration`: confirmed via `git log --oneline -3`.
- `cd sdk && pnpm exec vitest run src/query/commit.test.ts` exits 0 with 21/21 passing: confirmed in execution output (Test Files 1 passed (1); Tests 21 passed (21)).
- Diff scope: only `sdk/src/query/commit.test.ts` modified in commit `rulrvmvoypsluwwlsokvplqrtosypzqx` (no other file touched). 3 added lines, 0 removed.
- Branch: `phase/02-migration` per D-12.

---

*Phase: 02-bulk-call-site-migration-still-git-only*
*Completed: 2026-05-10*
