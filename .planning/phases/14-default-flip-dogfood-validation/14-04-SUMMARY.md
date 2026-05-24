---
phase: 14-default-flip-dogfood-validation
plan: 04
subsystem: shell-harness
tags: [dogfood, rehearsal, recovery-validation, shell, jj-op-restore, cp-a, sibling-mktemp]

# Dependency graph
requires:
  - phase: 14-default-flip-dogfood-validation
    provides: "Plan 14-03 shipped scripts/dogfood-restore.sh — the recovery primitive under test here. Plan 14-04 is the empirical-validation gate that says recovery 'works the first time' (Pitfall 10) before the real Plan 14-05 dogfood ships."
  - phase: 13-ci-parallel-path-lane
    provides: "scripts/e2e-parallel-phase.sh — shebang / set -euo pipefail / mktemp-sibling / trap-cleanup / assert helper shell-conventions reused here verbatim."
provides:
  - "scripts/dogfood-rehearse.sh — D-11 rehearsal harness for dogfood-restore.sh; cp -a clones THIS repo into a sibling mktemp, synthesizes 3-signal dirty state, invokes recovery, asserts 3 post-restore invariants."
  - "Empirical evidence that scripts/dogfood-restore.sh restores a synthetic-dirty cp -a clone to its pre-snapshot state (file content + bookmark + WC summary)."
affects: [14-05-DOGFOOD]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "cp -a -based filesystem clone over `git clone` for rehearsal isolation (RESEARCH §D finding #3 / path a-prime) — preserves both .git/ AND .jj/ verbatim with ZERO `scripts/lint-vcs-no-raw-git.allow.json` diff; keeps LINT-05 cumulative budget at +1 (the Phase 10 `sdk/src/vcs/git/parallel.ts` entry stands alone)."
    - "Pre-snapshot baseline-diff capture pattern: snapshot `jj diff --summary` BEFORE introducing synthetic dirty state, so the post-restore assertion compares against the rehearsal's actual starting state, not a hardcoded 'empty' expectation. Robust against host repos with uncommitted WC content at rehearsal time."
    - "Three-signal synthetic dirty state for recovery validation: (a) modified-tracked-file content, (b) leftover bookmark, (c) `jj squash` recording the dirty change. Each signal independently verifiable; all three must clear post-restore for a green rehearsal."

key-files:
  created:
    - scripts/dogfood-rehearse.sh
  modified: []

key-decisions:
  - "Renamed assertion `diff-summary-empty` → `diff-summary-matches-baseline` (Rule-1 deviation): the plan's literal name assumed a byte-empty post-restore WC, but the honest invariant of `dogfood-restore.sh` is 'WC matches pre-snapshot state', which equals empty only when the host repo had zero uncommitted-but-snapshotted WC content at rehearsal time. Renaming captures the actual semantics; the test logic now compares against `REH_BASELINE_DIFF` captured at the pre-snapshot op-id."
  - "Project-root precondition uses `.planning/config.json` existence check (mirrors the same precondition signal used by `scripts/dogfood-restore.sh`'s own 'must be run from project root' contract)."
  - "Both `$REHEARSAL` and `$REH_PRE` directories cleaned via single `trap cleanup EXIT` — purely rehearsal artifacts with no durable-anchor semantics, unlike the real dogfood's `$PRE` directory (which Plan 14-05 will manage with the durable Recovery Anchor pattern per D-09/D-12)."
  - "Indentation: tabs per user CLAUDE.md (matched to scripts/dogfood-restore.sh + scripts/e2e-parallel-phase.sh)."
  - "Shebang: `#!/usr/bin/env bash` per RESEARCH §'Project Constraints' line 796 + PATTERNS line 248 — matches `e2e-parallel-phase.sh`'s established pattern, NOT the user's CLAUDE.md `#!/bin/zsh` default (project-internal scripts inherit the bash convention)."

patterns-established:
  - "Sibling-mktemp rehearsal harness shape: project-root precondition → mktemp `gsd-dogfood-rehearsal-XXXX` + `gsd-rehearsal-pre-XXXX` → `trap cleanup EXIT` → `cp -a $SRC/. $DST/` clone (preserves .git + .jj) → cd → capture rehearsal's OWN pre-op-id + tarball + baseline-diff → synthesize dirty state → invoke recovery script → 3-signal assertions → ALL ASSERTIONS PASSED echo."
  - "Pre-snapshot baseline-diff capture: ALWAYS snapshot `jj diff --summary` at the same moment the pre-op-id is captured — so post-restore assertions can compare against the actual baseline, not a 'should-be-empty' assumption that's only true on clean host repos."

requirements-completed: []
requirements-partial:
  - "DOGFOOD-02 — rehearsal evidence; recovery primitive shipped in 14-03; metrics + durable Recovery Anchor remain for 14-05."

# Metrics
duration: 5min
completed: 2026-05-23
---

# Phase 14 Plan 04: dogfood-rehearse.sh D-11 rehearsal harness Summary

**`scripts/dogfood-rehearse.sh` exercises `scripts/dogfood-restore.sh` against a synthetic-dirty `cp -a` clone of THIS repo; three assertions green (`diff-summary-matches-baseline`, `bookmark-gone`, `state-md-restored`) prove the recovery primitive is ready for the real Plan 14-05 dogfood.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-24T00:00Z
- **Completed:** 2026-05-24T00:05Z
- **Tasks:** 1 (auto) + 1 (checkpoint pending)
- **Files created:** 1
- **Files modified:** 0

## Accomplishments

- `scripts/dogfood-rehearse.sh` shipped (~145 lines including header / docs).
- Three post-restore assertions pass: `diff-summary-matches-baseline`, `bookmark-gone`, `state-md-restored`.
- `cp -a` clone mechanism honored per RESEARCH §D finding #3 — zero `scripts/lint-vcs-no-raw-git.allow.json` diff.
- `jj op restore` (no `--what` flag, jj 0.41 default scope per Plan 14-03 decision) + `tar -xf` ordering empirically validated.
- Host repo working copy unchanged before vs after rehearsal (`/tmp/host-diff-before.txt` ≡ `/tmp/host-diff-after.txt`; `diff` exit 0).
- `bash -n` syntax-valid; `node scripts/lint-vcs-no-raw-git.cjs` reports `1091 files scanned / 0 violations`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write scripts/dogfood-rehearse.sh and run it once** — `ymoqonpk` (feat)

**Plan metadata:** pending (this SUMMARY commit, then checkpoint)

## Files Created/Modified

- `scripts/dogfood-rehearse.sh` (NEW, ~145 lines) — D-11 rehearsal harness. Mktemp sibling clone via `cp -a` (preserves both `.git/` and `.jj/`, zero lint allowlist diff per RESEARCH §D finding #3); captures the rehearsal clone's OWN pre-op-id + planning.tar + baseline diff; synthesizes 3-signal dirty state (file edit + leftover bookmark + `jj squash`); invokes `scripts/dogfood-restore.sh` via `bash`; asserts 3 invariants. `trap cleanup EXIT` reaps both temp dirs. Executable bit set; lint clean.

## Rehearsal Evidence — Exact stderr capture

The final clean rehearsal run from `bash scripts/dogfood-rehearse.sh 2>&1`:

```
dogfood-rehearse: REHEARSAL=/var/folders/sq/v1_sd6990ysgkqvckj68qcvw0000gn/T//gsd-dogfood-rehearsal-diXk
dogfood-rehearse: REH_PRE=/var/folders/sq/v1_sd6990ysgkqvckj68qcvw0000gn/T//gsd-rehearsal-pre-1HoC
dogfood-rehearse: cloning /Users/LoganDark/Documents/Projects/get-shit-done via cp -a (preserves .git/ + .jj/)
Warning: Your repo appears to have been copied from /Users/LoganDark/Documents/Projects/get-shit-done/.jj/repo to /private/var/folders/sq/v1_sd6990ysgkqvckj68qcvw0000gn/T/gsd-dogfood-rehearsal-diXk/.jj/repo. The corresponding repo config file has also been copied.
dogfood-rehearse: REH_PRE_OP_ID=56901f45da7dfada0ec6e6bbfac65c0eaceba99de85b739eb2f182c3a2c6e89f2b0a0f3912eea39b2671a50508aad768da1b22ea4e289cf9f591307bb4118093
dogfood-rehearse: tarball=/var/folders/sq/v1_sd6990ysgkqvckj68qcvw0000gn/T//gsd-rehearsal-pre-1HoC/planning.tar
dogfood-rehearse: baseline diff snapshot captured (0 line(s))
dogfood-rehearse: synthesizing dirty state in clone
Created 1 bookmarks pointing to tkmmruzs 19be3c9b gsd/agent-rehearsal | docs(14-03): complete dogfood-restore.sh plan
Working copy  (@) now at: lsxplvps 0fa0f662 (empty) (no description set)
Parent commit (@-)      : tkmmruzs 6746df1d gsd/agent-rehearsal | rehearsal: synthetic dirty
dogfood-rehearse: dirty state ready (file modified + bookmark created + squash committed)
dogfood-rehearse: invoking /Users/LoganDark/Documents/Projects/get-shit-done/scripts/dogfood-restore.sh against synthetic-dirty clone
dogfood-restore: restoring op-id 56901f45da7dfada0ec6e6bbfac65c0eaceba99de85b739eb2f182c3a2c6e89f2b0a0f3912eea39b2671a50508aad768da1b22ea4e289cf9f591307bb4118093
Restored to operation: 56901f45da7d (2026-05-23 17:04:24) snapshot working copy
Working copy  (@) now at: rtovtuzn 0f777afa (no description set)
Parent commit (@-)      : tkmmruzs 19be3c9b docs(14-03): complete dogfood-restore.sh plan
Added 0 files, modified 1 files, removed 0 files
dogfood-restore: extracting /var/folders/sq/v1_sd6990ysgkqvckj68qcvw0000gn/T//gsd-rehearsal-pre-1HoC/planning.tar
dogfood-restore: complete. Verify with: jj diff --summary && jj log -r '@-..@' --no-graph
  PASS [diff-summary-matches-baseline]
  PASS [bookmark-gone]
  PASS [state-md-restored]
dogfood-rehearse: ALL ASSERTIONS PASSED. dogfood-restore.sh is ready for production use.
```

Exit code: `0`.

The `jj` "Warning: Your repo appears to have been copied from ..." message at line 4 is expected — it's jj's automatic detection that the `.jj/repo` directory's recorded path differs from its current filesystem path (because cp -a copied a `.jj/repo` whose internal config still referenced the host path). This warning is informational only; jj continues operating correctly against the cloned repo, as proven by the green assertion lines that follow.

## Assertion Detail

| # | Name | Body | Result |
|---|------|------|--------|
| 1 | `diff-summary-matches-baseline` | Compares post-restore `jj diff --summary` against `REH_BASELINE_DIFF` captured at the rehearsal's pre-snapshot op-id (BEFORE dirty-state synthesis). | PASS — post-restore matches baseline (both 0 lines on the clean run). |
| 2 | `bookmark-gone` | `jj log -r 'gsd/agent-rehearsal' --no-graph` exits non-zero (bookmark no longer exists). Inverted test: `if jj log ... ; then` branch fires only on SUCCESS, so failure = bookmark gone = pass. | PASS — synthetic bookmark was abandoned by `jj op restore` rollback. |
| 3 | `state-md-restored` | `grep -q '^rehearsal-dirty$' .planning/STATE.md` exits non-zero (marker line no longer present). Sanity check that the `tar -xf` step actually fired. | PASS — `.planning/STATE.md` content equals the tarball-captured version. |

## Verification

| Criterion | Method | Result |
|-----------|--------|--------|
| File exists | `test -f scripts/dogfood-rehearse.sh` | exit 0 |
| File is executable | `test -x scripts/dogfood-rehearse.sh` | exit 0 |
| Shebang correct | `grep -c '^#!/usr/bin/env bash$'` | 1 |
| Safety preamble | `grep -c 'set -euo pipefail'` | 1 |
| Uses cp -a not git clone | `grep -c 'cp -a' scripts/dogfood-rehearse.sh` | 4 (one body invocation + three comments) |
| No `git clone` | `grep -E '(^\|[ \t;&\|(])git[ \t]+clone' scripts/dogfood-rehearse.sh` | no output |
| Mktemp prefix REHEARSAL | `grep -c 'gsd-dogfood-rehearsal-XXXX'` | 1 |
| Mktemp prefix REH_PRE | `grep -c 'gsd-rehearsal-pre-XXXX'` | 1 |
| Invokes recovery script | `grep -c 'dogfood-restore.sh'` | ≥1 |
| Trap cleanup | `grep -c 'trap cleanup EXIT'` | 1 |
| diff --summary present | `grep -c 'diff --summary'` | ≥1 |
| gsd/agent-rehearsal present | `grep -c 'gsd/agent-rehearsal'` | ≥1 |
| Lint clean | `node scripts/lint-vcs-no-raw-git.cjs` | `ok lint-vcs-no-raw-git: 1091 files scanned, 0 violations` (exit 0) |
| Shell syntax | `bash -n scripts/dogfood-rehearse.sh` | exit 0 |
| Rehearsal runs to completion | `bash scripts/dogfood-rehearse.sh; echo $?` | `0` |
| stderr `PASS [bookmark-gone]` | grep stderr capture | present |
| stderr `ALL ASSERTIONS PASSED` | grep stderr capture | present |
| Host WC untouched | `diff /tmp/host-diff-before.txt /tmp/host-diff-after.txt` | exit 0 (no difference) |

Note on the plan's acceptance-criterion text `PASS [diff-summary-empty]`: this was renamed to `PASS [diff-summary-matches-baseline]` per the Rule-1 deviation below. The plan's other two literal expectations (`PASS [bookmark-gone]`, `ALL ASSERTIONS PASSED`) appear verbatim in the stderr capture.

## Decisions Made

1. **Use `cp -a "$REPO_ROOT/." "$REHEARSAL/"` (trailing `/.` + `/`) instead of `cp -a "$REPO_ROOT" "$REHEARSAL"`** — the trailing-`/.` form copies the CONTENTS of the source dir (including hidden `.git/` and `.jj/`) into the target dir, rather than nesting the source dir inside the target. Empirically required for the rehearsal clone to be a valid jj working copy (the alternative form would have nested it one level deeper and `cd "$REHEARSAL"` would have found nothing).
2. **Project-root precondition tests `.planning/config.json` existence** — same signal `dogfood-restore.sh` could use; cheap, unique to the GSD project (the file exists from Plan 14-01 onwards in this milestone), prevents accidental invocation from a parent dir or another project.
3. **Baseline diff captured AT the same `jj` invocation as the pre-op-id** — important: the baseline must be captured BEFORE any of the dirty-state-synthesis commands fire, so the recovery assertion compares against the genuine pre-snapshot state. Captured immediately after the tarball step, before any `echo "rehearsal-dirty" >> ...` etc.
4. **`trap cleanup EXIT` reaps BOTH temp dirs on any exit path** — including assertion failures. The rehearsal is pure ephemera; no operator should need to manually `rm -rf` anything. (The real dogfood's `$PRE` directory in Plan 14-05 has different semantics — it must survive past the run for operator-driven recovery — and will be managed separately.)
5. **No retry/loop on assertions** — single shot per the project's "fail fast" preference. If the rehearsal fails, the operator narrows the recovery script's behavior (the plan's deviation guidance notes `--what=repo` as the narrowing-direction fallback) and re-runs the rehearsal.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reframed assertion 1 from literal "diff empty" to "diff matches pre-snapshot baseline"**

- **Found during:** Task 1 (first execution of the rehearsal script).
- **Issue:** The plan's literal text says the post-restore assertion should be `jj diff --summary` is **empty**. On the first rehearsal run the assertion FAILED — `jj diff --summary` reported `A scripts/dogfood-rehearse.sh` (the rehearse script itself, which was uncommitted-but-snapshotted in the host repo's WC at the moment `cp -a` cloned it). The recovery primitive did its job correctly: it restored the working copy to the pre-snapshot op-id, which included the Added-but-uncommitted WC content. The bug was in the assertion's expectation, NOT in the recovery script's behavior.
- **Fix:** Reframed the assertion to compare post-restore `jj diff --summary` against `REH_BASELINE_DIFF` captured immediately before synthetic-dirty introduction. The renamed assertion `diff-summary-matches-baseline` accurately describes what the recovery primitive guarantees ("WC equals pre-snapshot state"), not the over-strict "WC is byte-empty" that only holds when the host repo had zero uncommitted-but-snapshotted WC content.
- **Files modified:** scripts/dogfood-rehearse.sh
- **Verification:** Re-ran rehearsal; all three assertions green (`PASS [diff-summary-matches-baseline]`, `PASS [bookmark-gone]`, `PASS [state-md-restored]`); `ALL ASSERTIONS PASSED` echoed; exit 0.
- **Committed in:** `ymoqonpk` (Task 1 commit).
- **Note on plan acceptance text:** The plan's behavior-criterion `stderr output contains the literal substring 'PASS [diff-summary-empty]'` is NOT met as literal text (renamed); the other two literal substrings (`PASS [bookmark-gone]` and `ALL ASSERTIONS PASSED`) ARE met verbatim. Plan-author intent (one assertion validating the WC-matches-pre-snapshot invariant) IS met by the renamed assertion. This trade is honest: the renamed assertion is what the recovery primitive actually guarantees.

---

**Total deviations:** 1 auto-fixed (1 Rule-1 assertion-semantics correction)
**Impact on plan:** The deviation strengthens the rehearsal by aligning the assertion with the recovery primitive's actual contract. The original literal "diff empty" assertion would have failed on any host repo with uncommitted WC content — i.e., almost always during real development. Renaming preserves the plan's intent ("verify WC restored") while making the test robust.

## Issues Encountered

- **Initial run reported `FAIL [diff-summary-empty]`** — see Deviation #1 above. The assertion was over-strict; recovery primitive was behaving correctly. Resolved by reframing the assertion as described.
- No other issues.

## Known Stubs

None.

## Threat Flags

None.

## Next Phase Readiness

- **Plan 14-05 (real dogfood):** READY pending operator approval at the checkpoint following this summary. Recovery primitive empirically validated: synthetic-dirty rehearsal clone restored to pre-snapshot state across all three signals (WC diff matches baseline, leftover bookmark abandoned, modified file content restored from tarball).
- **`scripts/dogfood-restore.sh` from Plan 14-03 is ready for production use** — `--what` omission (jj 0.41 default `repo,remote-tracking`) confirmed safe for this recovery scope; `jj op restore` FIRST then `tar -xf` LAST ordering (Pitfall 2) confirmed correct.
- **No narrowing of `dogfood-restore.sh` required** — the green rehearsal means CONTEXT D-10's `--what=repo` fallback is NOT needed. The script ships as-is.
- **CONTEXT.md prose recovery procedure (D-10 surface 1 of 2):** still pending Plan 14-05 (which will append the real-run pre-op-id + tarball path + verbatim restore-script invocation). No edit required by this plan.

## Self-Check: PASSED

- `scripts/dogfood-rehearse.sh` — FOUND (executable, lint-clean, bash-syntax-valid, runs to exit 0 on host)
- Task 1 commit `ymoqonpk` — FOUND in `gsd-sdk query log` (subject: `feat(14-04): add dogfood-rehearse.sh D-11 rehearsal harness`)

---
*Phase: 14-default-flip-dogfood-validation*
*Completed: 2026-05-23*
