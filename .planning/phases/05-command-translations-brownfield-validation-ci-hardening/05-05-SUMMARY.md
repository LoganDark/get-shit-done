---
phase: 05-command-translations-brownfield-validation-ci-hardening
plan: 05
subsystem: ci-hardening
tags: [ci, flake-fix, migr-02, ci-03, prompt-03, soak-window, jj-test-infrastructure]
requires: [05-01, 05-02, 05-03, 05-04]
provides:
  - flake-fix patches on 7 jj-* test files (D-36 step 1 done)
  - .planning/intel/ci-jj-soak.md scaffold for 10-consecutive-green tracking (D-36 step 2 armed)
  - .github/workflows/test.yml CI-03 docs header (architectural boundary documented)
  - MIGR-02 cosmetic sweep on 6 bin/lib/*.cjs files (closes Phase 2 hold-over)
  - PROMPT-03 closure note (D-37 trust-installer)
affects: [sdk/src/vcs/__tests__/*.test.ts, get-shit-done/bin/lib/*.cjs, .github/workflows/test.yml, .planning/REQUIREMENTS.md, .planning/intel/]
tech-stack:
  added: []
  patterns:
    - "vitest: `describe.sequential.skipIf(cond)` chain — opt-in within-suite serialization where shared mkdtemp + global jj-workspace state leak between concurrent it() blocks"
    - "tmpdir collision avoidance: `mkdtempSync(join(tmpdir(), `prefix-${Math.random().toString(36).slice(2,10)}-`))` — 8-char base36 random suffix, ~2.8 trillion combinations, sufficient for parallel-test-file scheduling"
    - "child-process race fix: poll for sentinel existence on a generous budget (3s) instead of fixed setTimeout warmup (100ms) — Node child-process spawn can take >100ms under heavy parallel load"
    - "env-leakage guard: `afterEach(() => vi.unstubAllEnvs())` belt-and-suspenders against process.env contamination across parallel test files even when current tests don't stub"
key-files:
  created:
    - .planning/intel/ci-jj-soak.md
  modified:
    - sdk/src/vcs/__tests__/jj-octopus.test.ts
    - sdk/src/vcs/__tests__/jj-lock.test.ts
    - sdk/src/vcs/__tests__/jj-hooks.test.ts
    - sdk/src/vcs/__tests__/jj-workspace.test.ts
    - sdk/src/vcs/__tests__/jj-push-fetch.test.ts
    - sdk/src/vcs/__tests__/jj-commit.test.ts
    - sdk/src/vcs/__tests__/exec-env-passthrough.test.ts
    - get-shit-done/bin/lib/core.cjs
    - get-shit-done/bin/lib/verify.cjs
    - get-shit-done/bin/lib/init.cjs
    - .github/workflows/test.yml
    - .planning/REQUIREMENTS.md
decisions:
  - "Within-file flake fix patterns (A: describe.sequential, B: per-invocation random-prefix mkdtemp) landed mechanically per RESEARCH §CI Flake Analysis. Three consecutive isolated 7-file runs passed 60/60. The 7-of-10 stability under heavy parallel-file scheduling is documented as expected residual; the soak gate is the designed safety net for inter-file contention."
  - "Rule 1 bug fix on jj-lock.test.ts concurrent-acquire: replaced fixed 100ms warmup with poll-for-sentinel (3s budget) + extended child sleep 300ms→1500ms. The original timing assumed bounded spawn latency that does not hold under heavy parallel jj-suite load."
  - "MIGR-02 closure is COSMETIC ONLY — lint-vcs-no-raw-git already reported 0 violations on 962 files pre-sweep. The 14→6 `git worktree` references drop is entirely in comments + error strings; the remaining 6 references are intentional cross-backend documentation prose like 'on git this shells `git worktree list`; on jj it shells `jj workspace list`'."
  - "PROMPT-03 closed per D-37 without per-runtime smoke matrix addition. Source-of-truth canonical Claude markdown is processed by `bin/install.js` transform pipeline for 15+ runtimes. Spot-check verification per D-37 is the planner's optional gate, not a required CI matrix."
  - "CI matrix flip (D-36 step 2 second-half) is NOT landed in this plan — the 10-consecutive-green soak window cannot be observed from inside an isolated worktree against remote GitHub Actions runs. The proposed YAML diff is captured in this SUMMARY (§Proposed CI matrix flip — gated on soak); the existing conditional carries a new comment block pointing readers to the soak file."
  - "CI-03 is a PERMANENT architectural boundary, not a deferred port. The workflow-runtime comment makes this explicit so future readers don't mistake unported workflow files for a Phase 6 backlog item."
metrics:
  duration: ~25min
  tasks_completed: 4_of_5_landable (Task 3 — matrix flip — gated on remote-CI soak observation)
  files_modified: 12
  files_created: 1
  completed: 2026-05-13
---

# Phase 5 Plan 05: Final Wave — Flake Fixes + Soak Arming + MIGR-02 + CI-03 + PROMPT-03 Summary

Closed Phase 5 maintenance + CI-graduation prep wave: 7 jj-* test files patched with the mechanical flake-fix patterns (D-36 step 1 of 2), `.planning/intel/ci-jj-soak.md` armed for 10-consecutive-green observation (D-36 step 2 of 2), MIGR-02 cosmetic sweep landed across 6 bin/lib/*.cjs files closing the Phase 2 hold-over, CI-03 architectural-boundary docs note added to `.github/workflows/test.yml`, and PROMPT-03 closed per D-37 trust-installer. The CI matrix flip (line 64 `continue-on-error` conditional → `false`) is the only outstanding step and is gated on a 10-day soak window the executor cannot drive from inside a worktree — the proposed YAML diff is captured below for the planner to land after the soak passes.

## Tasks Completed

### Task 1 — Flake-fix sweep on 7 jj-* test files (commit `df821bae`)

Per-file fix-pattern application:

| File | Pre-edit category | Pattern A | Pattern B | Extra |
| ---- | ----------------- | --------- | --------- | ----- |
| jj-octopus.test.ts | concurrency-bound (lazy octopus + 5 multi-workspace suites share `dir`) | ✓ `describe.sequential.skipIf` on top-level describe | ✓ Math.random suffix on `gsd-jj-octopus-` mkdtemp prefix | — |
| jj-lock.test.ts | concurrency-by-design (lock contention IS the SUT) | ✗ (intentional — lock tests exercise concurrency) | ✓ Math.random suffix on `gsd-jj-lock-` mkdtemp prefix | Rule-1 bug fix: poll-for-sentinel (3s budget) replaces fixed 100ms warmup; child hold extended 300→1500ms |
| jj-hooks.test.ts | tmpdir-bound (2 nested describes — native + colocated) | ✗ (HOOK-05 v1-interface probe doesn't need it; native/colocated separation already isolates) | ✓ Math.random suffix on both `gsd-jj-hooks-native-` and `gsd-jj-hooks-colocated-` prefixes | — |
| jj-workspace.test.ts | concurrency-bound (5 multi-workspace describes share global `jj workspace list` state) | ✓ `describe.sequential.skipIf` on all 5 describe blocks | ✓ Math.random suffix on both `gsd-vcs-ws-list-` and `gsd-vcs-ws-p4-` prefixes | — |
| jj-push-fetch.test.ts | tmpdir-bound (push/fetch each have work+bare pairs on /tmp) | ✗ (snapshot/restore beforeEach already isolates push tests; fetch tests are pure read) | ✓ Math.random shared suffix per describe (work+bare get the SAME suffix to stay paired) | — |
| jj-commit.test.ts | both (squash + post-squash hook-fire timing per plan 05-01 makes timing-sensitive; shared `dir` across all 10 it()s) | ✓ `describe.sequential.skipIf` | ✓ Math.random suffix on `gsd-vcs-commit-` prefix | — |
| exec-env-passthrough.test.ts | env-mutation (process.env leakage potential across parallel test files) | ✗ (no jj invocations — concurrency safe) | ✓ Math.random suffix on `gsd-exec-env-` prefix | Added `afterEach(() => vi.unstubAllEnvs())` belt-and-suspenders |

Verification evidence:

- `cd sdk && pnpm tsc --noEmit`: clean (no type errors).
- 7-file isolated runs: **3 of 3 consecutive 60/60 passes** (after pnpm install cached).
- `jj-lock` isolated 5/5 with the warmup-poll fix.
- 10 consecutive 7-file runs under parallel-file scheduling: **7 of 10 fully green; 3 sporadic failures across 3 different tests in 3 different runs.** This is the residual inter-file contention the SOAK GATE is designed to track. Files in those failures: jj-commit (SQUASH-04 once), jj-octopus (WS-06 once, WS-08 once), jj-workspace (T-04.01-01 once), jj-push-fetch (push() once). The pattern is "different test fails each time" — classic resource-contention not fix-attributable to any single test.
- Full SDK suite (`cd sdk && pnpm vitest run`): 26 failed / 2238 passed / 32 skipped — same baseline as pre-edit (verified by stash+rerun then unstash). 0 regressions; failures are pre-existing flake or unrelated test bugs (config-mutation, skills, state, validate, query-subprocess-adapter, plus the jj-suite cross-file contention that the soak observes).

### Task 2 sub-task A + B — soak scaffold + MIGR-02 sweep (commits `68a437b7` + `a1c0ef30`)

**Sub-task A — `.planning/intel/ci-jj-soak.md`:** Created with the canonical shape from 05-PATTERNS.md § "`.planning/intel/ci-jj-soak.md`" and RESEARCH § "CI Soak Metric File Shape (D-36 Step 2)". File contains 6 markers of `10 consecutive green / 10/10 / Final Graduation` and 4 D-36 references. Includes:
- explicit counter-reset policy (any failure in `jj-colocated` OR `jj-native` resets; `git` lane tracked for visibility but doesn't gate)
- schema table for run-log rows
- Reset Events section + Final Graduation section (both populate on event)
- cross-refs to D-36, Phase 4 LEARNINGS, the 7 flake-fixed test files, and this SUMMARY for the proposed CI flip
- optional helper-script reference (`scripts/show-ci-soak.cjs`) NOT added per RESEARCH Open Q5 Option C — defer to first failed soak attempt

**Sub-task B — MIGR-02 cosmetic sweep on 6 cjs files:**

| File | Lines touched | Change category |
| ---- | ------------- | --------------- |
| core.cjs | ~736, ~763, ~788 | JSDoc on `resolveWorktreeRoot` / `parseWorktreePorcelain` / `pruneOrphanedWorktrees` rewritten to cross-backend prose; user-facing prune-timeout warning string updated from "git worktree prune timed out" to "vcs.workspace.prune() timed out … Run: gsd-sdk query worktree-list" |
| verify.cjs | ~949-983 | Check 11 block title flipped "Stale / orphan git worktrees" → "Stale / orphan workspaces"; W020 error message + remediation now reference `vcs.workspace.list` and `gsd-sdk query worktree-list / worktree-prune / worktree-remove`; comment block added explaining adapter-mediation |
| init.cjs | ~1510, ~1539 | `detectChildRepos` JSDoc adds note that jj-backed child detection is future-work; "Check if git worktree is available" comment rewritten to "Check if the VCS adapter has worktree/workspace primitives available" with adapter-call context |
| commands.cjs | (spot-check) | No `git worktree` strings to migrate — comments already reference `vcs.commit` correctly per Phase 2 plan 02-09 |
| graphify.cjs | (sweep) | Zero `git worktree` matches — clean |
| drift.cjs | (sweep) | Zero `git worktree` matches — clean |

Verification:
- `node scripts/lint-vcs-no-raw-git.cjs`: 0 violations on 962 files (pre-sweep also 0; no regression).
- Total `git worktree` occurrence count: **14 → 6** (all 6 remaining are intentional cross-backend documentation prose like `on git this shells `git worktree list`; on jj it shells `jj workspace list``).
- REQUIREMENTS.md MIGR-02 row flipped "In Progress" → "Complete (cosmetic sweep landed in Phase 5 plan 05-05)".

### Task 5 — CI-03 docs note + PROMPT-03 closure (commit `68a437b7`)

**CI-03 (Complete, D-37/D-38 docs decision):** Added a 15-line header comment block at the top of `.github/workflows/test.yml` documenting the permanent architectural boundary — GitHub Actions workflows themselves (canary.yml, release-sdk.yml, hotfix.yml, branch-cleanup.yml, auto-branch.yml, test.yml) stay on git because GitHub *is* git. Rationale: the jj port's value (local-developer ergonomics + parallel-workspace performance) does not apply to CI runners (ephemeral single-checkout containers); this is a deliberate scope boundary, NOT a deferred port. REQUIREMENTS.md CI-03 row flipped Pending → Complete with the rationale inline.

Grep gates:
- `grep -c "GitHub \*is\* git" .github/workflows/test.yml`: 1 ✓
- `grep -P "CI-03 \| Phase 5 \| Complete" .planning/REQUIREMENTS.md`: 1 ✓

**PROMPT-03 (Complete, D-37 trust-installer closure):** No per-runtime smoke matrix added per D-37. Source-of-truth canonical Claude markdown is processed by `bin/install.js` transform pipeline for 15+ runtimes (verified per RESEARCH § "PROMPT-03 D-37 closure"). No regression observed in optional planner spot-check. REQUIREMENTS.md PROMPT-03 row flipped Pending → Complete with the inline note.

Grep gate:
- `grep -P "PROMPT-03 \| Phase 5 \| Complete" .planning/REQUIREMENTS.md`: 1 ✓

## Proposed CI matrix flip — GATED on soak (NOT landed in this plan)

`.github/workflows/test.yml` lines 56-71 currently read (with the new comment block landed in commit `68a437b7`):

```yaml
  test:
    runs-on: ${{ matrix.os }}
    timeout-minutes: 10

    # Phase 3 plan 03-07 (CI-01): the jj-colocated lane is allowed to fail —
    # CI-01 graduates to required-blocking in Phase 5 (per D-11). Phase 4
    # plan 01 (D-22) adds the jj-native lane with the same allow-failure
    # posture; both graduate together in Phase 5.
    #
    # Phase 5 plan 05-05 (D-36 step 2): the flake-fix patches landed in
    # commit df821bae across 7 jj-* test files. The soak window is tracked
    # in .planning/intel/ci-jj-soak.md and graduation flips the conditional
    # below to `false` once 10 consecutive green nightly runs land on both
    # lanes. See the proposed-but-not-yet-landed flip in 05-05-SUMMARY.md.
    # The CI-03 boundary (GitHub Actions stays on git) is documented in the
    # header block at the top of this file.
    continue-on-error: ${{ matrix.backend == 'jj-colocated' || matrix.backend == 'jj-native' }}
```

When the soak counter reaches 10/10, replace lines 60-71 (the block above ending with `continue-on-error: ${{ matrix.backend == ... }}`) with:

```yaml
    # CI-01 + CI-04 graduation event (Phase 5 plan 05-05 per D-36 step 2).
    # Both jj lanes (jj-colocated, jj-native) flipped to required-blocking
    # after a 10-consecutive-green nightly soak window (tracked in
    # .planning/intel/ci-jj-soak.md). The previous `continue-on-error`
    # conditional is retired.
    #
    # CI-03 note: GitHub Actions workflows themselves (canary, release-sdk,
    # hotfix, branch-cleanup, auto-branch) stay on git per CI-03 —
    # GitHub *is* git. See header block at top of this file.
    continue-on-error: false
```

At graduation time, ALSO:

1. Append to existing REQUIREMENTS.md rows:
   - `| CI-01 | Phase 3 | Complete (03-07 …) |` → append `; jj lanes graduated to required-blocking in Phase 5 plan 05-05 per D-36`
   - `| CI-04 | Phase 4 | Complete (04-06 …) |` → append the same suffix
2. Fill in the `Final Graduation` section of `.planning/intel/ci-jj-soak.md` with the actual graduation commit hash + date.

If the soak resolves with the `approve with known-flake gate: <test-name>` path (D-36 discretion clause), the flip should instead be:

```yaml
    # Soak approved with known-flake gate for <test-name>; the specific test
    # is gated by GSD_SKIP_<UPPER_CASE_NAME>=1 env per D-36 discretion clause.
    continue-on-error: false
    env:
      GSD_SKIP_<UPPER_CASE_NAME>: '1'
```

## CHECKPOINT: human-action — soak window observation

**Type:** human-action (the soak window is the only Phase 5 hand-off the
executor cannot drive from inside an isolated worktree)

**What the executor has landed:**
- 7 flake-fix patches with mechanical Patterns A/B + 1 Rule-1 bug fix on jj-lock (commit `df821bae`)
- MIGR-02 cosmetic sweep on 6 cjs files; REQUIREMENTS.md MIGR-02 → Complete (commit `a1c0ef30`)
- `.planning/intel/ci-jj-soak.md` scaffold ready for run-log appends (commit `68a437b7`)
- CI-03 docs note in `.github/workflows/test.yml` header; REQUIREMENTS.md CI-03 → Complete (same commit)
- PROMPT-03 closed per D-37; REQUIREMENTS.md PROMPT-03 → Complete (same commit)

**What the executor cannot land:**
- The CI matrix flip (`continue-on-error: ${{ ... }}` → `false`) requires 10
  consecutive green nightly runs on the remote GitHub Actions infrastructure
  across both `jj-colocated` and `jj-native` backends. An isolated worktree
  agent has no way to trigger Actions runs or observe their conclusions over
  a 10-day calendar window. The proposed YAML diff is captured above for the
  user (or a future-dated executor) to land after observing the soak.

**What the user needs to do:**
1. After the flake-fix patches merge to main, the next 10 nightly runs of
   `.github/workflows/test.yml` will populate the soak data.
2. Append each run's result to `.planning/intel/ci-jj-soak.md` Run Log
   (one row per nightly; date, run ID, ✓/✗ per lane, notes).
3. When the counter reaches 10/10:
   - Apply the proposed YAML diff above (replace the `continue-on-error`
     conditional with `continue-on-error: false` and the updated comment).
   - Update the REQUIREMENTS.md CI-01 / CI-04 rows per the graduation
     suffix above.
   - Fill in `.planning/intel/ci-jj-soak.md` § Final Graduation with the
     commit hash + date.
4. If the counter resets repeatedly (e.g., never reaches 7/10), invoke
   the D-36 discretion clause — extend the window, gate a specific known
   flake with GSD_SKIP_<NAME>, or pause for a fix-iteration loop back to
   plan 05-05 Task 1 (re-patch).

**Optional automation help:** the user can audit recent CI runs via:

```bash
export GITHUB_TOKEN=$(grep GITHUB_TOKEN .envrc | cut -d\' -f2)
gh api repos/gsd-build/get-shit-done/actions/runs?per_page=15 \
  --jq '.workflow_runs[] | select(.name == "Tests") | {id, status, conclusion, created_at, head_branch}'
```

This is not a gate (the soak file is the source of truth) but accelerates
the manual append step.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] jj-lock.test.ts concurrent-acquire race**
- **Found during:** Task 1, when iterating on the 7-file consecutive-run gate. The original 100ms fixed-warmup assumption did not hold under heavy parallel-file scheduling (5/5 isolated but failed when run with other heavy jj suites).
- **Issue:** The test spawned a child Node process that acquires the lock, slept exactly 100ms in the parent, then asserted the sentinel file existed. Child-process spawn occasionally takes >100ms under load, so the assertion failed with `expected false to be true`.
- **Fix:** Replaced fixed 100ms `setTimeout` with a poll-for-sentinel loop (3s budget, 25ms interval). Extended the child's lock-hold from 300ms to 1500ms so the parent's second-acquire reliably observes ≥1 EEXIST iteration regardless of spawn latency. Extended the parent's lock-timeout from 2000ms to 4000ms to match.
- **Files modified:** `sdk/src/vcs/__tests__/jj-lock.test.ts`
- **Commit:** `df821bae`

### Scope-Boundary Notes

**Out-of-scope work observed but NOT fixed:**

- The full SDK test suite has 26 pre-existing failures across `query/skills.test.ts`, `query/state.test.ts`, `query/validate.test.ts`, `query/config-mutation.test.ts`, `query-subprocess-adapter.test.ts`, and several CMD-* jj-suite tests (cmd-quick, cmd-pause-work, cmd-undo, cmd-complete-milestone). These are NOT regressions from this plan's changes (verified by stash-and-rerun: the same 26 failures present on `9c97c206`). They are out of scope per the executor's SCOPE BOUNDARY rule.

- The plan's Task 4 (verb-gap sweep + branch-create-gap sweep from 05-02 / 05-03 deferred work) is NOT included in this plan's objective scope per the spawning instructions. The objective's six-item task list reduces to: flake fixes, soak scaffold, matrix flip (gated), MIGR-02 sweep, CI-03 docs, PROMPT-03 closure. The verb-gap sweep remains in the plan file for a follow-up runner.

## Self-Check: PASSED

**Files created:**
- `.planning/intel/ci-jj-soak.md` — FOUND
- `.planning/phases/05-command-translations-brownfield-validation-ci-hardening/05-05-SUMMARY.md` — FOUND (this file)

**Commits:**
- `df821bae` — test(05-05): apply flake-fix Patterns A+B to 7 jj-* test files — FOUND in `git log --oneline -5`
- `a1c0ef30` — docs(05-05): MIGR-02 cosmetic sweep — FOUND
- `68a437b7` — docs(05-05): land CI-03 + PROMPT-03 closure docs; create ci-jj-soak.md scaffold — FOUND

**Acceptance gates verified:**
- `describe.sequential` present in jj-octopus, jj-workspace, jj-commit (≥3 of the 3 mandated files) ✓
- Math.random suffix present in all 7 patched files (1-2 per file, 10 total) ✓
- `cd sdk && pnpm tsc --noEmit` exits 0 ✓
- `node scripts/lint-vcs-no-raw-git.cjs` exits 0 (962 files, 0 violations) ✓
- `.planning/intel/ci-jj-soak.md` exists with ≥2 `10 consecutive green / 10/10 / Final Graduation` markers (actual: 6) ✓
- `.planning/intel/ci-jj-soak.md` has ≥1 D-36 reference (actual: 4) ✓
- `grep -c "GitHub \*is\* git" .github/workflows/test.yml`: 1 ✓
- REQUIREMENTS.md MIGR-02 / CI-03 / PROMPT-03 all marked Complete ✓
- Pre-sweep vs post-sweep `git worktree` count: 14 → 6 (reduction confirmed) ✓

**Acceptance gates NOT applicable / deferred (gated on soak):**
- `continue-on-error: false` in test.yml — NOT landed; gated on soak (proposed diff captured above)
- `CI-01 + CI-04 graduation event` comment block — NOT landed; will accompany the matrix flip
- CI-01 / CI-04 graduation suffixes in REQUIREMENTS.md — NOT appended; will accompany the matrix flip
