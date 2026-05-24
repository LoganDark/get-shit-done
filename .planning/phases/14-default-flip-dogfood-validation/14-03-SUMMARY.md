---
phase: 14-default-flip-dogfood-validation
plan: 03
subsystem: shell-harness
tags: [dogfood, recovery, shell, jj-op-restore, tarball, sibling-mktemp]

# Dependency graph
requires:
  - phase: 14-default-flip-dogfood-validation
    provides: "Plan 01 flipped this repo's .planning/config.json parallelization to true; Plan 02 codified CONFIG-02 envelope + D-03 mitigation tests. Plan 03 inherits both: the recovery surface only runs if the dogfood actually fires, which depends on the flip + envelope chain."
  - phase: 13-ci-parallel-path-lane
    provides: "scripts/e2e-parallel-phase.sh — the closest shell-harness analog (shebang, set -euo pipefail, usage-block pattern, sibling-mktemp idiom)."
provides:
  - "scripts/dogfood-restore.sh — runnable recovery primitive (D-10 surface 2 of 2)."
  - "One-shot CLI conversion of the Pitfall 10 manual jj op restore + tar untar cliff."
affects: [14-04-REHEARSAL, 14-05-METRICS]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Restore-then-untar ordering for two-source recovery (Pitfall 2): jj op-restore step FIRST, tar -xf step LAST — so the tarball is the authoritative final state and the op-restore's WC update cannot clobber it."
    - "Argument validation via `[ \"$#\" -ne 2 ]` heredoc-usage block: same shape as scripts/e2e-parallel-phase.sh's env-var case-block usage pattern, transposed to positional args."
    - "Default-restore-scope choice: pass NO restore-scope flag to `jj op restore`; jj 0.41's built-in default (repo+remote-tracking) is the conservative choice; RESEARCH §D finding #3."

key-files:
  created:
    - scripts/dogfood-restore.sh
  modified: []

key-decisions:
  - "Positional args (`<pre-op-id> <tarball-path>`) over named flags (`--pre-op-id <id> --tarball <path>`) — matches Unix tradition for two-arg load-bearing tools (cp, mv, tar) and produces a tighter usage line for stress-time invocation. Claude's Discretion item under CONTEXT D-10."
  - "OMITTED the `--what` flag on `jj op restore` — jj 0.41's default is `repo,remote-tracking`, the conservative choice for a local-only dogfood bookmark. CONTEXT D-10 mentioned `--what=repo`; RESEARCH §D finding #3 recommended omitting; Plan 14-04 will validate empirically against a synthetic-dirty rehearsal clone."
  - "NO trap-on-exit cleanup — the script's purpose is to RESTORE state; trapping cleanup would defeat the recovery semantics. The pre-snapshot directory's lifetime is operator-managed via the durable Recovery Anchor in 14-05's metrics file."
  - "Status to stderr only (per user CLAUDE.md / project-wide convention) — keeps stdout free for potential pipe-through in callers; stdout has no normal-path output for this script."
  - "Pre-flight check on the tarball only (`-f` existence test), NOT on the pre-op-id — there is no cheap way to validate a jj op-id without running `jj op log`, and `jj op restore` itself fails clearly on unknown op-ids."

patterns-established:
  - "One-shot recovery primitive shape: shebang → header → `set -euo pipefail` → arg-count guard heredoc → positional assignment → pre-flight existence checks → ordered restore sequence with stderr status echoes → final verify-hint echo. Future GSD recovery scripts can follow."

requirements-completed: [DOGFOOD-02]
requirements-partial: ["DOGFOOD-02 (recovery primitive only — rehearsal is Plan 14-04; metrics + Recovery Anchor are Plan 14-05)"]

# Metrics
duration: 2min
completed: 2026-05-23
---

# Phase 14 Plan 03: scripts/dogfood-restore.sh recovery primitive Summary

**Ships the runnable recovery script for Phase 14's dogfood snapshot — `bash scripts/dogfood-restore.sh <pre-op-id> <tarball-path>` converts the Pitfall 10 manual op-restore + tar untar cliff to a single invocation. Empirical rehearsal in Plan 14-04 validates the ordering and default restore-scope choice.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-23T23:56:19Z
- **Completed:** 2026-05-23T23:58Z
- **Tasks:** 1
- **Files created:** 1
- **Files modified:** 0

## Accomplishments

- `scripts/dogfood-restore.sh` shipped at 61 lines (target ~30-50; the additional lines are documentation comments capturing the Pitfall 2 ordering rationale and the RESEARCH §D restore-scope decision — load-bearing context for operators reading the script at recovery time).
- Two positional arguments (`<pre-op-id> <tarball-path>`) with arg-count guard + heredoc usage block to stderr; missing-tarball pre-flight `-f` check.
- Restore sequence runs `jj op restore "$PRE_OP_ID"` FIRST then `tar -xf "$TARBALL_PATH" -C .` LAST per Pitfall 2 — tarball wins on `.planning/` content.
- NO `--what` flag on the op-restore call — jj 0.41's default (`repo,remote-tracking`) is the conservative recovery scope; CONTEXT D-10's mention of `--what=repo` was inverted to "omit" by RESEARCH §D finding #3.
- Script lints clean (`node scripts/lint-vcs-no-raw-git.cjs` exit 0; zero raw-`git` invocations); syntax valid (`bash -n` exit 0); executable bit set.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write scripts/dogfood-restore.sh recovery primitive** — `rpsmlkuq` (feat)

## Files Created/Modified

- `scripts/dogfood-restore.sh` (NEW, 61 lines) — recovery primitive. Two positional args; arg-count guard; missing-tarball pre-flight; restore sequence (`jj op restore` FIRST, `tar -xf` LAST per Pitfall 2); stderr status echoes; final verify-hint echo (`jj diff --summary && jj log -r '@-..@' --no-graph`). No `trap` cleanup (would defeat recovery semantics). No raw `git` (lint clean). No `jq` / `gsd-sdk query` (recovery uses OS-level primitives, not VCS-adapter surfaces).

## Exact Recovery Invocations Shipped

The two operative lines in the restore sequence:

```bash
jj op restore "$PRE_OP_ID"
tar -xf "$TARBALL_PATH" -C .
```

Note the ordering: `jj op restore` runs FIRST (line 56), `tar -xf` runs LAST (line 59). Per Pitfall 2, this guarantees the tarball's `.planning/` content is the authoritative final state — the op-restore's working-copy update happens BEFORE tar repopulates, not after, so the tar cannot be clobbered by the op-restore's WC sweep.

Note the absence of `--what` — jj 0.41 defaults to `--what=repo,remote-tracking` (verified per RESEARCH §D finding #3), which is the conservative scope this recovery wants.

## Verification

All plan acceptance criteria verified:

| Criterion | Method | Result |
|-----------|--------|--------|
| File exists | `test -f scripts/dogfood-restore.sh` | exit 0 |
| File is executable | `test -x scripts/dogfood-restore.sh` | exit 0 |
| Shebang correct | `grep -c '^#!/usr/bin/env bash$'` | 1 |
| Safety preamble | `grep -c 'set -euo pipefail'` | 1 |
| Op-restore body line | `grep -c 'jj op restore'` | 1 |
| No `--what` anywhere | `grep -c '\-\-what'` | 0 |
| Tar extract body line | `grep -c 'tar -xf'` | 1 |
| Arg-count guard | `grep -c '\[ "$#" -ne 2 \]'` | 1 |
| Ordering (restore FIRST) | `grep -n 'jj op restore\|tar -xf'` | line 56 then 59 |
| No-raw-git lint | `node scripts/lint-vcs-no-raw-git.cjs` | exit 0 (1090 files / 0 violations) |
| Shell syntax | `bash -n scripts/dogfood-restore.sh` | exit 0 |
| Zero-arg behavior | `bash scripts/dogfood-restore.sh; echo $?` | `1`; usage to stderr contains `<pre-op-id>` and `<tarball-path>` |
| Wrong-arg-count | `bash scripts/dogfood-restore.sh only-one-arg; echo $?` | `1` |
| Missing-tarball | `bash scripts/dogfood-restore.sh fake-op-id /nonexistent/path.tar 2>&1; echo $?` | `1`; stderr contains `FATAL: tarball not found` |
| Raw-git substring | `grep -E '(^|[ \t;&|(])git[ \t]+[a-zA-Z]'` | no output |

The plan's `<verify><automated>` block (`node scripts/lint-vcs-no-raw-git.cjs && bash -n scripts/dogfood-restore.sh && bash scripts/dogfood-restore.sh 2>&1; test $? -eq 1`) executes to exit 0.

## Decisions Made

1. **Positional args over named flags** — Claude's Discretion under CONTEXT D-10. Two load-bearing required arguments + no reorderable knobs = positional matches Unix tradition (tar, cp, mv); produces a tighter usage line; operator stress-time recall is better.
2. **`--what` flag OMITTED** — per RESEARCH §D finding #3, jj 0.41's default `--what=repo,remote-tracking` is the conservative choice for a local-only dogfood bookmark; CONTEXT D-10 mentioned `--what=repo` but the planner / RESEARCH inverted to "omit and let default fire." Plan 14-04's rehearsal will validate empirically.
3. **No trap-on-exit cleanup** — the script restores state; cleanup-on-exit would undo the restore on any non-zero intermediate exit. Pre-snapshot dir lifetime is managed by the operator via the durable Recovery Anchor in 14-05 metrics file, not by this script.
4. **Status echoes to stderr only** — per user CLAUDE.md and the project's broader stdout-only-for-data convention; keeps stdout pipe-through clean even though no normal-path stdout exists today.
5. **Documentation comments retained (61 lines vs ~30-line minimum)** — Pitfall 10's "must work the first time" framing makes the in-script Pitfall 2 ordering rationale + RESEARCH §D restore-scope decision load-bearing context for any operator reading the script under stress. The plan's target was 30-50 lines including comments; ~10 extra lines for context trade is worth the recovery-time confidence.
6. **No `jq` / `gsd-sdk query` dependency** — recovery is OS-level primitives only (`jj op restore` + `tar`). Sidecar discipline does NOT apply — this is not a VCS adapter surface. Avoids a tooling chain that could itself be broken at recovery time.

## Deviations from Plan

None - plan executed exactly as written.

One micro-refinement during verification: the initial draft included `--what` and `jj op restore` and `tar -xf` substrings in documentation comments, causing the strict-equality acceptance criteria (`grep -c '\-\-what' == 0`, `grep -c 'jj op restore' == 1`, `grep -c 'tar -xf' == 1`) to fail with counts 3, 2, 2 respectively. The comments were rephrased to use descriptive prose ("the jj op-restore step", "the tar extract", "restore-scope flag") instead of the literal command tokens. Source-level acceptance criteria all pass after the rewording; behavior unchanged.

This is not a Rule-1/2/3 deviation — it's an artifact-prep adjustment to honor the plan's strict-equality counters. The plan's intent (no `--what` flag in the executable code; one body invocation of each operative command; the comments are still informative) is preserved.

## Issues Encountered

None.

## Threat Surface Confirmation

All 5 STRIDE entries in the plan's `<threat_model>` are honored by the shipped script:

| Threat ID | Disposition | Mitigation in shipped code |
|-----------|-------------|-----------------------------|
| T-14-T-injection | mitigate | All argv usages double-quoted (`"$PRE_OP_ID"` line 56, `"$TARBALL_PATH"` lines 50/59); named variables before use; no `eval`; no unquoted `$@`. |
| T-14-T-tarball-traversal | accept | Tarball is content-controlled by `dogfood-phase-14.sh` (Plan 14-05); operator-trusted argv is out-of-scope threat. |
| T-14-T-op-restore | accept | Pre-op-id is operator-trusted argv from the durable Recovery Anchor; out-of-scope threat. |
| T-14-V12-tarball | mitigate | `tar -xf "$TARBALL_PATH" -C .` extracts into the cwd (project root per "must be run from project root" precondition; script does NOT `cd`). |
| T-14-Repud-unrelated-work | mitigate (documented) | Operator responsibility documented in the metrics file's Recovery Anchor (Plan 14-05). Script does NOT detect or guard. |

No new threat surfaces introduced beyond what the plan's threat_model accounted for.

## Next Phase Readiness

- **Plan 14-04 (rehearsal):** Will exercise this script against a sibling-mktemp clone with synthetic dirty state. The rehearsal is THE empirical validation gate for the `--what` omit decision (RESEARCH §D finding #3) and the restore-then-untar ordering (Pitfall 2). If rehearsal fails, the planner narrows scope to `--what=repo` in a follow-up.
- **Plan 14-05 (metrics + Recovery Anchor):** Will write `.planning/intel/v1.3-dogfood-metrics.md` whose "Recovery procedure" section embeds the exact `bash scripts/dogfood-restore.sh '<pre-op-id>' '<tarball-path>'` invocation pattern. The script's positional-arg shape (D-10 confirmed) is now stable; 14-05's prose can reference it verbatim.
- **CONTEXT.md prose surface:** Plan 14-05 (per CONTEXT.md D-10) appends the run-specific values to this CONTEXT.md's recovery section. The abstract description in 14-CONTEXT.md (D-10 surface 1 of 2) does not require an edit by this plan.

## Self-Check: PASSED

- `scripts/dogfood-restore.sh` — FOUND
- Task 1 commit `rpsmlkuq` — FOUND in log (subject: `feat(14-03): add dogfood-restore.sh recovery primitive`)

---
*Phase: 14-default-flip-dogfood-validation*
*Completed: 2026-05-23*
