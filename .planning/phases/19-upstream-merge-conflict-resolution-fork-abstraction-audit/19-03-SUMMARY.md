---
phase: 19-upstream-merge-conflict-resolution-fork-abstraction-audit
plan: 03
subsystem: infra
tags: [jj, merge-resolution, harvest, conflict-buckets, config-schema, audit-ledger]

# Dependency graph
requires:
  - phase: 19-upstream-merge-conflict-resolution-fork-abstraction-audit
    provides: "19-01: live 19-MERGE-AUDIT.md ledger + resolved packaging surface; 19-02: vetted install, node_modules present, build:lib green, gsd-tools dispatch alive"
provides:
  - harvest/ reference tree (50 files, all byte-verified against c7bd6bee) — 27 vcs-facing query handlers, 10 bin/lib CJS reference implementations, 9 workflow base→fork delta diffs, 4 misc payloads
  - Buckets A/B/C fully cleared — 55 conflicts resolved as upstream deletions (72 → 17 remaining, all bucket D/E/F/G)
  - gsd-core/templates/config.json = fork content (Phase-14 flat-boolean parallelization:true flip survives)
  - gsd-core/bin/shared/config-schema.manifest.json carries grafted vcs.adapter validKey (the 19-02 "unknown config key: vcs" warning is gone)
  - 89 new ledger rows + Harvest manifest appendix + canonical-sweep amendment
affects: [19-04 (D/E/F/G buckets), 19-05 (vcs port), 19-06 (CLI bridge consumes harvest/query-handlers), 19-07 (consumes harvest/bin-lib), 19-08 (consumes harvest/workflow-deltas), 19-13 (ledger completeness proof)]

# Tech tracking
tech-stack:
  added: []
  patterns: [harvest-before-delete with cmp byte-verification against jj revisions, environmental (untracked-content) sweep exclusions kept distinct from tracked-fixture exclusions]

key-files:
  created:
    - .planning/phases/19-upstream-merge-conflict-resolution-fork-abstraction-audit/harvest/ (query-handlers/ 27, bin-lib/ 10, workflow-deltas/ 9, misc/ 4)
  modified:
    - .planning/phases/19-upstream-merge-conflict-resolution-fork-abstraction-audit/19-MERGE-AUDIT.md
    - gsd-core/templates/config.json (fork content applied wholesale)
    - gsd-core/bin/shared/config-schema.manifest.json (vcs.adapter validKey grafted)
  deleted:
    - 76 bucket A/B paths (35 conflicted sdk/ + 31 clean sdk/src/query survivors + 10 get-shit-done/bin)
    - 10 bucket C paths (9 get-shit-done/workflows/*.md + get-shit-done/templates/config.json)

key-decisions:
  - "Harvest enumeration is ground-truth-driven: 27 handlers (not the plan's ~23 estimate); rev-parse/rm verbs do not exist fork-side; exact list + 2 grep false-positive exclusions recorded in the ledger"
  - "Task 2 scope extended to the 31 clean sdk/src/query survivors (fork-added post-base, merged silently) because the plan's verify demands the whole directory gone; every one ledgered (18 harvested verb handlers, 13 superseded tests)"
  - "Fork template has NO vcs block — plan acceptance over-claimed; vcs.adapter is project-config validated via the schema manifest, where the graft landed"
  - "Canonical marker sweep amended: --glob '!node_modules/**' (untracked third-party content post-19-02-install) + explicit path argument (rg falls back to reading never-EOF stdin when invoked non-interactively)"

patterns-established:
  - "Clean-survivor deletions get the same ledger discipline as conflict resolutions (origin side: 'fork (clean survivor)')"

requirements-completed: []  # MERGE-01/MERGE-02 are phase-spanning (advanced here, proven complete at 19-13); no rows in .planning/REQUIREMENTS.md v1.4 table, so requirements.mark-complete skipped (19-01/19-02 precedent)

# Metrics
duration: ~39min
completed: 2026-06-10
---

# Phase 19 Plan 03: Harvest + Bulk Bucket A/B/C Clearing Summary

**Harvested every piece of fork reference content later waves need (50 byte-verified files from c7bd6bee), then cleared buckets A/B/C as upstream deletions — 55 conflicts resolved (72 → 17, all remaining are genuine-merge buckets D/E/F/G) — with the two easily-forgotten fork JSON payloads re-homed at their gsd-core paths in the same plan: the Phase-14 `parallelization: true` template flip and the `vcs.adapter` schema validKey (gsd-tools no longer warns on the fork's config).**

## Performance

- **Duration:** ~39 min (2026-06-10 10:05–10:44 UTC; includes a ~10-min stuck-verification detour, see Issues)
- **Tasks:** 3
- **Files:** 50 created, 3 modified, 86 deleted

## Accomplishments

- **Harvest-before-delete honored end-to-end (T-19-06/Pitfall 3):** every deletion in this plan is either a byte-verified harvest copy or an explicitly-ledgered drop. All 50 harvest files `cmp`-verified against fresh `jj file show -r c7bd6bee` output; nothing was sourced from conflicted working-copy text (T-19-07).
- **Bucket A cleared (35 conflicts + 31 survivors):** all sdk/ conflicts resolved as upstream deletion per ADR-0174 adoption; `sdk/src/query` is gone entirely; `sdk/src/vcs` (99 files, the 19-05 port source) untouched.
- **Bucket B cleared (10):** fork gsd-tools.cjs + 9 bin/lib CJS deleted after harvesting; the fork dispatch case list was verified a strict subset of upstream's, so no dispatch case is lost.
- **Bucket C cleared (10):** 9 workflows + templates/config.json deleted; their base→fork deltas live as labeled unified diffs ready for 19-08 re-application.
- **Payload 1 re-homed:** upstream's delta vs base on templates/config.json verified ZERO, so fork content applied wholesale at `gsd-core/templates/config.json`; `parallelization === true` asserted by node.
- **Payload 2 re-homed:** `vcs.adapter` grafted into upstream's schema manifest validKeys (the ONLY fork-only key — `parallelization` was already present upstream); all 107 upstream keys retained; JSON.parse green; runtime smoke confirms the 19-02 `unknown config key: vcs` warning is gone.
- **Ledger discipline:** 89 new rows (1 harvest + 76 Task 2 + 12 Task 3), all six-prefix parseable, every row tagged `(19-03 Task N)`; plus the Harvest manifest appendix and the canonical-sweep amendment.

## Task Commits

Each task committed file-scoped on top of the planning stack above merge change `vpzlrrlv`:

1. **Task 1: Harvest fork reference content** - `af54de8f` / change `usryqskn` (chore)
2. **Task 2: Resolve buckets A+B as upstream deletions** - `a69979a1` / change `pyosnoly` (feat)
3. **Task 3: Resolve bucket C + re-home fork JSON payloads** - `1026718d` / change `rosomtqq` (feat)

## Files Created/Modified

- `harvest/query-handlers/*.ts` (27) - vcs verb handler + adapter-using envelope sources incl. the verb registry (`command-manifest.non-family.ts`)
- `harvest/bin-lib/*.cjs` (10) - line-annotated `// (was: <git cmd>)` migration references for 19-07
- `harvest/workflow-deltas/*.md.diff` (9) - labeled unified base→fork diffs for 19-08
- `harvest/misc/` (4) - fork vitest.config.ts, full fork schema manifest, fork template config, config-schema-delta.diff (direction-annotated)
- `gsd-core/templates/config.json` - fork content (flat-boolean parallelization flip)
- `gsd-core/bin/shared/config-schema.manifest.json` - +`vcs.adapter` validKey
- `19-MERGE-AUDIT.md` - 89 rows + harvest appendix + sweep amendment

## Decisions Made

- **27 handlers harvested, not ~23:** enumeration via `jj file list` + adapter-usage grep is ground truth; the plan's named `rev-parse`/`rm` verbs do not exist fork-side (verified against the fork verb registry). Two grep hits excluded as false positives with reasons ledgered (`command-static-catalog-foundation.ts`, `workspace.ts`).
- **31 clean survivors deleted with bucket A:** fork-added post-base files in `sdk/src/query` merged silently and were not conflicts, but the plan's verify (`[ ! -e sdk/src/query ]`) and the SDK-retirement strategy require the whole directory gone. All 18 non-test handlers were already harvested; 13 tests ledgered as superseded by 19-06 bridge tests.
- **`worktree.ts` harvested despite no adapter usage** (spawns gsd-tools — it is the don't-sever-chain reference for the worktree verb family).
- **Unified diffs with `--label`** instead of the plan's bare `diff` for workflow deltas — same content, patch-tool-ready for 19-08.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical reference] Harvested `command-manifest.non-family.ts` as 27th query-handler reference**
- **Found during:** Task 2 (classifying conflicted query files)
- **Issue:** the fork's vcs VERB REGISTRY (verb name/aliases/mutation flag/outputMode) lives in this file; it is 19-06 registration metadata but was not grep-positive for adapter usage, so Task 1's enumeration missed it
- **Fix:** harvested (byte-verified) before deletion; appendix updated
- **Files modified:** harvest/query-handlers/command-manifest.non-family.ts, 19-MERGE-AUDIT.md
- **Commit:** a69979a1 (jj recorded delete+harvest-copy as a rename — same tree result)

**2. [Rule 3 - Blocking] Task 2 deletion scope extended to the 31 clean sdk/src/query survivors**
- **Found during:** Task 2 (the plan's action lists only conflicted paths, but its verify requires `sdk/src/query` absent)
- **Issue:** 31 fork-added-post-base files merged cleanly (no conflict) and would have failed the verify
- **Fix:** deleted with the directory; one ledger row each (no blind deletions — must_haves truth holds)
- **Commit:** a69979a1

**3. [Rule 1 - Bug] Plan acceptance over-claims a fork `vcs` block in templates/config.json**
- **Found during:** Task 3 pre-check
- **Issue:** acceptance criteria expect the template to carry "the fork `vcs` block"; the fork template at c7bd6bee has NO vcs key (verified by grep) — `vcs.adapter` is project-level config validated via the schema manifest
- **Fix:** template applied byte-identical to fork content; the vcs.adapter capability survives via the manifest graft (where it actually belongs); divergence recorded in the ledger row
- **Commit:** 1026718d

**4. [Rule 1 - Bug] Canonical marker-sweep command hangs/over-scans post-install**
- **Found during:** overall plan verification
- **Issue:** (a) `node_modules/` exists since 19-02 and `--no-ignore-vcs` un-ignores it (17k+ untracked third-party files, false-hit risk); (b) `rg` without a path argument falls back to reading stdin when invoked non-interactively — with a never-EOF stdin the sweep hangs indefinitely
- **Fix:** canonical command amended in the ledger: `--glob '!node_modules/**'` (environmental exclusion of untracked content — the tracked-fixture exclusion list stays EMPTY) + explicit `.` path argument; re-run: 17 hits set-identical to the 17 conflicted paths
- **Files modified:** 19-MERGE-AUDIT.md (sweep amendment)
- **Committed in:** final docs commit

---

**Total deviations:** 4 auto-fixed (2 bugs in plan assumptions/verification commands, 1 scope extension required by the plan's own verify, 1 missing reference file). No scope creep beyond the plan's stated intent; no architectural changes.

## Issues Encountered

- Two marker-sweep attempts ran 10+ minutes before diagnosis: `rg` invoked without a path argument in a non-interactive shell reads stdin (which never closes) instead of walking the tree. Fixed per Deviation 4; the amended command completes in under a second.

## Verification Results

- `jj resolve --list` = 17 paths, exactly buckets D/E/F/G (11 docs/D + 3 packaging-CI/E + 3 tests/F + 1 agents/G — bucket E's package.json/package-lock.json were already resolved in 19-01)
- Marker sweep (amended canonical command): 17 hits, set-identical to the conflict list both directions — no harvest file or 19-03-touched file contains marker text
- `gsd-core/templates/config.json`: parses, `parallelization === true`, byte-matches fork content
- `gsd-core/bin/shared/config-schema.manifest.json`: parses, 108 validKeys (107 upstream + vcs.adapter), runtime smoke shows no unknown-config-key warning
- `vpzlrrlv` = `36c417ee` unchanged; all work stacked above it

## Next Phase Readiness

- **19-04 unblocked:** the remaining 17 conflicts are exactly the genuine-merge set (D/E/F/G); tests/helpers.cjs et al. still carry markers as expected (the node:test suite must NOT run until 19-04 resolves them).
- **19-06/19-07/19-08 inputs in place:** envelope references, CJS migration references, and workflow deltas all sit in harvest/ with byte-verified provenance.
- **19-05 port source intact:** `sdk/src/vcs` 99/99 files untouched.

## Self-Check: PASSED

- harvest/: 27 + 10 + 9 + 4 files present; spot re-verified byte-match after commit
- Deleted paths absent: get-shit-done/bin (gone), sdk/src/query (gone), 9 workflows + templates/config.json (gone)
- Commits `af54de8f` (usryqskn), `a69979a1` (pyosnoly), `1026718d` (rosomtqq) present in `jj log`
- `jj resolve --list` = 17; zero sdk/, get-shit-done/ paths
- Ledger: 89 rows tagged (19-03 Task N); six-prefix vocabulary maintained

---
*Phase: 19-upstream-merge-conflict-resolution-fork-abstraction-audit*
*Completed: 2026-06-10*
