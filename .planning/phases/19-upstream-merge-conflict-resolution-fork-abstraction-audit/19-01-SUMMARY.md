---
phase: 19-upstream-merge-conflict-resolution-fork-abstraction-audit
plan: 01
subsystem: infra
tags: [jj, merge-resolution, packaging, pnpm, vitest, github-actions, audit-ledger]

# Dependency graph
requires:
  - phase: none (Wave 0/1 of Phase 19)
    provides: merge change vpzlrrlv with 75 two-sided conflicts; locked upstream-canonical strategy from 19-CONTEXT.md
provides:
  - 19-MERGE-AUDIT.md live disposition ledger (parseable six-prefix vocabulary, empty fixture-exclusion list, empty skip-count + hand-edited-.cjs appendices)
  - Resolved conflict-free root package.json (@opengsd/gsd-core@1.4.3, pnpm@11.3.0 pinned, fallow dropped, vitest ^3.1.1 revived)
  - All lockfiles/workspace manifests/rollout artifacts/org-automation CI dispositioned and deleted (16 files)
  - Conflict count 75 -> 72 (package.json, package-lock.json, sdk/package.json resolved)
affects: [19-02 install gate, 19-04 test.yml resolution, 19-10, 19-12 parallel-e2e re-point, 19-13 completeness proof, all later Phase 19 marker sweeps]

# Tech tracking
tech-stack:
  added: [vitest ^3.1.1 (devDep declared, NOT installed), pnpm@11.3.0 packageManager pin]
  patterns: [six-prefix ledger disposition vocabulary (ported-to/re-applied-at/dropped/adopted-upstream/substrate/merged), canonical marker-sweep command with --hidden]

key-files:
  created:
    - .planning/phases/19-upstream-merge-conflict-resolution-fork-abstraction-audit/19-MERGE-AUDIT.md
  modified:
    - package.json (conflict resolved: upstream shape + operator overlays)
  deleted:
    - package-lock.json, pnpm-lock.yaml, pnpm-workspace.yaml, sdk/package.json
    - next-branch-files.tar.gz, rollout-next-phase1.sh, rollout-next-phase2.sh
    - 9x .github/workflows/ org-automation files

key-decisions:
  - "Fixture-exclusion list frozen EMPTY: 75 marker hits are set-identical to the 75 conflicted paths; no tracked file legitimately contains marker text"
  - "Canonical marker sweep requires --hidden (plan's literal command misses .github/ conflicts); recorded in ledger"
  - "mutation.yml deleted despite testing code: PR-gating is wired to upstream's next-branch release train; Stryker stays runnable locally via npm run test:mutation"
  - "pnpm pinned at 11.3.0 (locally installed version), superseding the fork-side 11.0.8 pin that survived the merge"

patterns-established:
  - "Ledger rows tagged with (19-NN) plan provenance inside justification for 19-13 traceability"
  - "File-scoped jj commits (jj commit -m <msg> <paths>) keep per-task commits atomic while the WC carries 72 live conflicts"

requirements-completed: []  # MERGE-01/MERGE-02 are phase-spanning (advanced here, proven complete at 19-13); they do not exist as rows in .planning/REQUIREMENTS.md (v1.4 table) so requirements.mark-complete was skipped

# Metrics
duration: 11min
completed: 2026-06-10
---

# Phase 19 Plan 01: Packaging/Identity Resolution + Disposition Ledger Summary

**Opened the live 19-MERGE-AUDIT.md disposition ledger (20 rows, six-prefix parseable vocabulary, empty fixture-exclusion baseline) and resolved the full packaging surface: upstream-shaped @opengsd/gsd-core@1.4.3 manifest with pnpm@11.3.0 pin, fallow dropped pre-install, vitest ^3.1.1 revived, and 16 lockfile/rollout/org-CI files deleted — conflicts 75 → 72, zero installs executed.**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-06-10T09:41:20Z
- **Completed:** 2026-06-10T09:52:00Z
- **Tasks:** 2
- **Files modified:** 19 (1 created, 2 modified, 16 deleted)

## Accomplishments

- **Ledger live from Wave 0** (MERGE-02 precondition): four-column schema, six disposition prefixes verbatim, and two appendices (skip-count re-derivations; hand-edited .cjs inventory) ready for 19-04..19-13 appends.
- **Fixture-exclusion list frozen EMPTY with proof:** `rg -l --hidden --no-ignore-vcs --glob '!.jj/**' --glob '!.git/**' '^(<<<<<<<|%%%%%%%|>>>>>>>)'` returns exactly the 75 genuinely-conflicted paths (set-identity verified by `comm` in both directions). Later marker sweeps need no exclusion globs.
- **package.json conflict-free and upstream-shaped:** upstream manifest wholesale + exactly the five operator overlays (identity mirror, pnpm pin, fallow drop, vitest revival, scripts/engines untouched). No `gsd-sdk` bin entry survives.
- **Packaging surface fully dispositioned:** stale `package-lock.json` (fork-deleted side), workspace-era `pnpm-lock.yaml` + `pnpm-workspace.yaml`, phantom `sdk/package.json`, and upstream's three next-branch rollout artifacts all deleted with ledger rows.
- **Org-automation CI dropped, 9/9 with named signals:** next-branch release train (auto-backmerge, mutation, pr-target-validator), PR-policy bots (auto-close-unsolicited-prs, close-draft-prs-sweep), Discord webhook secret (discord-changelog), duplicate-issue sweeps (duplicate-check, duplicate-sweep, remove-duplicate-label). `test.yml` (19-04) and fork `parallel-e2e.yml` (19-12) kept.
- **Threat register satisfied:** T-19-01 (fallow removed before any install), T-19-02 (org-secret workflows deleted with signals named), T-19-03 (ledger open with parseable vocabulary), T-19-SC (zero installs — node_modules still absent).

## Task Commits

Each task was committed atomically on top of the planning stack above merge change `vpzlrrlv` (file-scoped `jj commit`):

1. **Task 1: Open 19-MERGE-AUDIT.md ledger + fixture-exclusion list** - `b20c4bf1` / change `kkuupnvm` (docs)
2. **Task 2: Resolve packaging/identity surface + drop rollout artifacts and org-automation CI** - `5ac1011b` / change `opnomsuw` (feat)

## Files Created/Modified

- `.planning/phases/19-upstream-merge-conflict-resolution-fork-abstraction-audit/19-MERGE-AUDIT.md` - Live disposition ledger; 20 rows after this plan
- `package.json` - Resolved root manifest (upstream shape + operator decisions)
- Deleted: `package-lock.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `sdk/package.json`, `next-branch-files.tar.gz`, `rollout-next-phase1.sh`, `rollout-next-phase2.sh`, 9 org-automation workflow files (all intentional, all ledgered)

## Decisions Made

- **mutation.yml judged org-automation, not code-CI:** it runs Stryker (code testing) but its trigger/diff-base wiring is upstream's `next`-branch release train (`git fetch origin next`, `--since origin/next`). Deleted with the signal named; local mutation testing unaffected (`npm run test:mutation` script kept).
- **pnpm pin = 11.3.0** (locally installed, per plan instruction `pnpm --version`), superseding the fork-side `pnpm@11.0.8` that had clean-merged into the conflicted manifest.
- **`.changeset/` gets a single `adopted-upstream` row** (465 archived fragments, research Open Q7) rather than per-file rows.
- **Ledger justifications carry `(19-NN)` plan provenance** so the 19-13 completeness proof can attribute every row.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan's literal marker-sweep command misses hidden directories**
- **Found during:** Task 1 (fixture-exclusion list build)
- **Issue:** `rg -l '^(<<<<<<<|%%%%%%%|>>>>>>>)' --no-ignore-vcs` skips hidden paths, silently omitting the two conflicted `.github/` files (`ISSUE_TEMPLATE/config.yml`, `workflows/test.yml`) — a sweep that later plans rely on would under-count
- **Fix:** Canonical sweep recorded in the ledger as `rg -l --hidden --no-ignore-vcs --glob '!.jj/**' --glob '!.git/**' ...`; re-verified 75 hits == 75 conflicted paths
- **Files modified:** 19-MERGE-AUDIT.md (sweep command documented)
- **Verification:** `comm` both directions empty against `jj resolve --list`
- **Committed in:** b20c4bf1 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug in a verification command)
**Impact on plan:** Required for the fixture-exclusion list to be trustworthy as the baseline for all later marker sweeps. No scope creep.

## Issues Encountered

- `pnpm --version` initially failed inside the repo because pnpm tries to parse the (then-conflicted) root `package.json`; probed from a neutral cwd instead. Gone now that the manifest is resolved.

## User Setup Required

None - no external service configuration required. (The single vetted `pnpm install` happens in 19-02 behind the blocking human legitimacy checkpoint.)

## Next Phase Readiness

- **19-02 unblocked:** manifest is resolved BEFORE any install (Pitfall 6 honored); the legitimacy checkpoint can now vet the exact dependency set that will be installed; fresh `pnpm-lock.yaml` will be generated there.
- **All later plans:** ledger is live and parseable; marker-sweep baseline frozen (empty exclusion list); `vpzlrrlv` and everything below it untouched (verified: 36c417ee unchanged).
- **Remaining conflicts:** 72 (expected — resolved by 19-03 onward per the wave plan).

## Self-Check: PASSED

- 19-MERGE-AUDIT.md exists; header regex `\| *path *\| *origin side *\| *disposition *\| *justification *\|` matches (1)
- package.json: node assertions (identity/packageManager/fallow/vitest/no-gsd-sdk-bin) all pass
- All 7 root/sdk deletions confirmed absent; 9 workflow deletions confirmed; test.yml + parallel-e2e.yml present
- Commits b20c4bf1 (kkuupnvm) and 5ac1011b (opnomsuw) present in `jj log`
- `jj resolve --list` = 72 paths; decrease is exactly {package.json, package-lock.json, sdk/package.json}
- node_modules absent (no install executed)

---
*Phase: 19-upstream-merge-conflict-resolution-fork-abstraction-audit*
*Completed: 2026-06-10*
