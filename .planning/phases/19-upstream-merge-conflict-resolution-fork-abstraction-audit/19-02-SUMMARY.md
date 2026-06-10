---
phase: 19-upstream-merge-conflict-resolution-fork-abstraction-audit
plan: 02
subsystem: infra
tags: [pnpm, supply-chain, registry-vetting, tsc, build-at-publish, gsd-tools, dispatch-smoke]

# Dependency graph
requires:
  - phase: 19-upstream-merge-conflict-resolution-fork-abstraction-audit
    provides: "19-01: resolved conflict-free root package.json (@opengsd/gsd-core@1.4.3, pnpm@11.3.0 pin, fallow dropped, vitest revived), both stale lockfiles deleted, live 19-MERGE-AUDIT.md ledger"
provides:
  - Registry vetting appendix in 19-MERGE-AUDIT.md (15/15 packages OK, zero FLAGGED, T-19-04 typosquat screen applied)
  - Human legitimacy sign-off recorded (blocking checkpoint APPROVED 2026-06-10)
  - Fresh pnpm-lock.yaml (lockfileVersion 9.0, 15 importers, zero fallow) — committed
  - pnpm-workspace.yaml as pnpm 11 allowBuilds store (esbuild) — committed, distinct from the 19-01-dropped workspace manifest
  - Upstream build chain proven green in-tree (pnpm run build:lib exit 0, noEmitOnError, sentinel present) BEFORE any vcs-port work
  - gsd-tools.cjs dispatch surface alive (--help exit 0; query state.load returns JSON envelope)
affects: [19-03 onward (all port work now attributable against a green baseline), 19-04 baseline test run, 19-06 query-surface extension, 19-13 completeness proof]

# Tech tracking
tech-stack:
  added: [node_modules via single vetted pnpm install (pnpm 11.3.0, 411 packages in .pnpm), esbuild build-script approval via pnpm-workspace.yaml allowBuilds]
  patterns: [pre-install registry vetting table as blocking-human-gate evidence, build-sentinel check (gsd-core/bin/lib/semver-compare.cjs) before port work]

key-files:
  created:
    - pnpm-lock.yaml
    - pnpm-workspace.yaml
  modified:
    - .planning/phases/19-upstream-merge-conflict-resolution-fork-abstraction-audit/19-MERGE-AUDIT.md

key-decisions:
  - "Operator-performed install accepted as the phase's single vetted install: executor verified idempotence (pnpm install -> 'Already up to date') instead of blindly re-installing"
  - "pnpm-workspace.yaml kept and committed as pnpm 11's allowBuilds store (esbuild: true) — NOT a resurrection of the workspace manifest dropped in 19-01"
  - "unknown config key 'vcs' warning from upstream gsd-tools classified as expected later-plan port work, not a 19-02 defect"

patterns-established:
  - "Build bring-up appendix in the ledger records install provenance + approval timestamp so 19-13 can prove T-19-SC end-to-end"

requirements-completed: []  # MERGE-03 is phase-spanning (advanced here, proven complete at 19-13); like MERGE-01/02 it has no row in .planning/REQUIREMENTS.md (v1.4 table), so requirements.mark-complete was skipped

# Metrics
duration: ~22min (Task 1 ~9min pre-checkpoint + Task 3 ~13min continuation)
completed: 2026-06-10
---

# Phase 19 Plan 02: Dependency Vetting Gate + Single Install + Build Bring-up Summary

**All 15 manifest dependencies registry-vetted (zero FLAGGED) and human-approved at the blocking checkpoint; the operator's single pnpm install verified idempotent and ledgered; upstream's `src/*.cts` build chain proven green in-tree (`pnpm run build:lib` exit 0, sentinel present) and the gsd-tools `query` dispatch surface alive — before any vcs-port work begins.**

## Performance

- **Duration:** ~22 min executor time across two sessions (checkpoint pause in between)
- **Task 1 session:** 2026-06-10 ~09:46–09:55 UTC
- **Task 3 continuation:** 2026-06-10 09:59–10:12 UTC
- **Tasks:** 3 (2 auto + 1 blocking human checkpoint)
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- **Registry vetting appendix (Task 1):** one row per manifest package (15/15), each with latest version, range satisfiability, last-publish date, maintainer identity, and an explicit OK verdict. T-19-04 typosquat screen applied (`eslint-plugin-n` and unscoped `typescript-eslint` verified by maintainer identity, not name). `fallow` confirmed absent. Zero installs performed during vetting.
- **Blocking human gate honored (Task 2):** checkpoint `gate="blocking-human"` was NOT auto-approved; operator responded "approved" on 2026-06-10 with no removals/replacements.
- **Single vetted install landed (Task 3):** operator performed `pnpm install` themselves (pnpm 11.3.0 = the `packageManager` pin); executor confirmed idempotence ("Already up to date", 139ms — zero mutations), so the phase's effective install count is one and every installed package was human-approved first (T-19-SC).
- **Fresh lockfile committed:** `pnpm-lock.yaml` lockfileVersion 9.0, 15 importer specifiers matching the manifest exactly, zero `fallow` references, `qs >= 6.15.2` override honored. `package-lock.json` absent.
- **Build gate green:** `pnpm run build:lib` (tsc, `noEmitOnError`) exits 0; sentinel `gsd-core/bin/lib/semver-compare.cjs` exists. Artifact accounting verified: 97 `.cts` (1 declaration-only) → 96 emitted `.cjs`, all gitignored; only `legacy-cleanup.cjs` + `package-identity.cjs` are tracked under `gsd-core/bin/lib/` and the build never touches them.
- **Dispatch smoke:** `node gsd-core/bin/gsd-tools.cjs --help` exit 0; `query state.load` exit 0 returning the JSON config+state envelope — the `query` meta-prefix and dotted-command normalization (gsd-tools.cjs:344-368) work against the built lib.
- **Ledger updated:** "Build bring-up (19-02 Task 3)" appendix records checkpoint approval, install provenance, lockfile facts, the `pnpm-workspace.yaml` reclassification, build/smoke results, and tree state.

## Task Commits

1. **Task 1: Registry-vet every manifest dependency** - `519933f1` / change `kxlqulvo` (docs)
2. **Task 2: Human legitimacy sign-off** - no commit (human gate; APPROVED 2026-06-10)
3. **Task 3: Install verification + build bring-up + dispatch smoke + ledger note** - `292310f1` / change `yltqluzq` (chore)

## Files Created/Modified

- `pnpm-lock.yaml` - Fresh lockfile from the fork-controlled, human-approved manifest (never hand-merged; T-19-05 satisfied)
- `pnpm-workspace.yaml` - pnpm 11 build-approval store (`allowBuilds: esbuild: true`), generated by the operator's install flow
- `.planning/phases/19-upstream-merge-conflict-resolution-fork-abstraction-audit/19-MERGE-AUDIT.md` - Dependency vetting appendix (Task 1) + build bring-up appendix (Task 3)

## Decisions Made

- **Did not blindly re-install:** since the operator had already run `pnpm install`, the executor verified state (node_modules complete: 15 direct deps + 411 `.pnpm` entries; lockfile consistent) and ran one sanctioned idempotence check instead of a second effective install.
- **`pnpm-workspace.yaml` kept:** it is pnpm 11's `allowBuilds` approval store for esbuild's postinstall (vitest transitive), not a workspace manifest; deleting it would re-prompt build approval on every install. The 19-01 `dropped:no-workspaces-remain-post-sdk-retirement` ledger row still stands for the old artifact.
- **`unknown config key: vcs` warning is expected:** upstream's config schema does not know the fork's `vcs` adapter key yet; extending that schema is later-plan port work (the fork-abstraction port), not a defect in this plan's gate.

## Deviations from Plan

### Deviation: install performed by operator, not executor

- **Found during:** Task 3 resume
- **Plan said:** "Run `pnpm install`"
- **What happened:** the operator ran the install themselves while responding to the Task 2 checkpoint (and `build:lib` ran via the `prepare` script). The executor verified rather than repeated: idempotence check returned "Already up to date" with zero mutations.
- **Why acceptable:** the threat model's requirement is that human approval precede the install of every package — satisfied (the operator both approved AND performed the install). Effective install count for the phase remains one.
- **Files affected:** none beyond plan scope; ledger records provenance.

### Observed side artifact (documented, kept)

- The operator's install wrote `pnpm-workspace.yaml` (`allowBuilds: esbuild: true`) — not in the plan's file list. Classified as a legitimate pnpm 11 approval store, committed and ledgered (see Decisions). No other unexpected tree changes: conflict count unchanged at 72; only the two pnpm files were added.

## Issues Encountered

None. Build was green on first explicit run (the prepare-script run the operator observed had already proven it compilable).

## User Setup Required

None remaining — the authentication-free install and build are complete.

## Next Phase Readiness

- **19-03 onward unblocked:** upstream `src/*.cts` compiles in-tree with `noEmitOnError`, so any TypeScript error appearing during the vcs port is attributable to the port, not the baseline.
- **Do NOT run the node:test suite yet:** `tests/helpers.cjs` still carries conflict markers; baseline run happens in 19-04 (plan constraint honored — suite not executed here).
- **72 unresolved conflicts remain** (expected; buckets A–G resolve in 19-03/19-04 onward). `vpzlrrlv` and below untouched.

## Self-Check: PASSED

- `pnpm-lock.yaml` exists; `package-lock.json` absent; `pnpm-workspace.yaml` = 2-line allowBuilds store
- `gsd-core/bin/lib/semver-compare.cjs` exists (sentinel)
- Plan Task 3 verify chain re-run end-to-end: `pnpm run build:lib && test -f ... && gsd-tools --help && test -f pnpm-lock.yaml` → ALL PASS
- Commits `519933f1` (kxlqulvo) and `292310f1` (yltqluzq) present in `jj log`
- `jj resolve --list` = 72 paths (unchanged by this plan)
- 19-MERGE-AUDIT.md contains both "Dependency vetting (pre-install)" and "Build bring-up (19-02 Task 3)" sections

---
*Phase: 19-upstream-merge-conflict-resolution-fork-abstraction-audit*
*Completed: 2026-06-10*
