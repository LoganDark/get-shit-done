---
phase: 19-upstream-merge-conflict-resolution-fork-abstraction-audit
plan: 06
subsystem: cli
tags: [vcs, cli-bridge, gsd-tools, command-router, envelope-parity, port]

# Dependency graph
requires:
  - phase: 19-upstream-merge-conflict-resolution-fork-abstraction-audit
    provides: "19-05: src/vcs/**.cts ported (34 modules + planning-shim), build:lib green, gsd-core/bin/lib/vcs/index.cjs emits createVcsAdapter"
provides:
  - "PORT-02 CLI bridge: src/vcs-command-router.cts — 19-verb table re-expressing the fork's registered vcs query handlers over gsd-core/bin/lib/vcs with envelope parity (jq-load-bearing field names, null-for-absent-optionals where the fork emitted null, handler-envelope-exits-0 semantics)"
  - "gsd-tools.cjs dispatch wired: 15 head-command cases → routeVcsCommand (routeStateCommand family precedent); `query` meta-prefix + #3243 dotted normalization reach every verb; all pre-existing upstream cases byte-identical"
  - "Zero surviving gsd-sdk spawn paths (BLOCKER-3 sweep ledgered: 9 hits, all docblocks)"
  - "Early regression net live: tests/vcs-cjs-smoke.test.cjs + tests/vcs-adapter-contract.test.cjs re-pointed at built artifacts, 47/47 green across git + jj-colocated + jj-native lanes"
  - "Per-family dispatch smoke evidenced on both backends (ledger appendix table; T-19-17 honored — probes only, repo untouched)"
affects: [19-07 (commit/commit-to-subrepo internals migration + call-site migration), 19-08 (workflow re-wiring can now call gsd_run query <verb> without Unknown-command risk), 19-10/19-11 (baseline re-derivation: class-B rows for these test files cleared), 19-13 (hand-edited .cjs inventory + ledger completeness)]

# Tech tracking
tech-stack:
  added: []
  patterns: [family-command-router for vcs verbs (routeStateCommand precedent with async handlers + injected core.output), fork-envelope byte-parity port of CLI handlers, retired-SDK dependency collapse at port time (loadConfig → planningPaths config read, helpers inlined)]

key-files:
  created:
    - src/vcs-command-router.cts
  modified:
    - gsd-core/bin/gsd-tools.cjs
    - .gitignore
    - tests/vcs-cjs-smoke.test.cjs
    - tests/vcs-adapter-contract.test.cjs
    - .planning/phases/19-upstream-merge-conflict-resolution-fork-abstraction-audit/19-MERGE-AUDIT.md

key-decisions:
  - "Verb surface corrected against the 19-03 ledger (authoritative over the plan letter): branch-create/branch-delete/rev-parse/rm/bare-workspace have NO fork-side handlers (speculative plan entries; phantom-verb rule honored); the real bridgeable set is 19 verbs"
  - "commit-to-subrepo handler ships in the router for envelope parity, but gsd-tools' pre-existing upstream case keeps dispatch ownership until 19-07 — same locked-decision treatment as commit (preserve-upstream-cases-byte-identical wins over the plan's dispatch-everything wording)"
  - "worktree.cleanup-wave needs no bridge: the fork handler was a spawnSync back-bridge INTO gsd-tools' own worktree cleanup-wave case, which survives upstream-side"
  - "Retired-SDK collapses inside the router: loadConfig → planningPaths(cwd).config direct read (strict ===false parallelization check preserved per Phase 14 D-03), helpers.resolvePathUnderProject inlined with name-tagged Error replacing GSDError, planning-shim sanitizeCommitMessage consumed (first 19-05 collapse-plan consumer)"
  - "Rule 1 fix in the contract test: c7bd6bee asserted nonexistent .hash — adapter contract is id (hex on git, [k-z] change_id on jj, docblock says Do-NOT-assume-hex); fixed to per-backend alphabet asserts; latent fork-side bug masked by stale-dist-cjs class-B module-load error (fork had no unit-CI lane)"

patterns-established:
  - "Mutation-verb smoke via argv-validation probes: typed ok:false envelopes returned before any adapter call prove dispatch reachability with zero repo mutation (T-19-17 template for later plans)"

requirements-completed: []  # PORT-02 is phase-scoped (no v1.4 REQUIREMENTS.md row — 19-01..19-05 precedent)

# Metrics
duration: ~19min
completed: 2026-06-10
---

# Phase 19 Plan 06: VCS CLI Bridge (vcs-command-router + gsd-tools wiring) Summary

**The fork's 19 registered vcs verbs now dispatch end-to-end through `node gsd-core/bin/gsd-tools.cjs query <verb>` → routeVcsCommand → gsd-core/bin/lib/vcs adapter with fork-envelope parity, evidenced by a per-family smoke on both backends and a 47/47-green built-artifact regression net — workflows can be rewired in 19-08 with zero Unknown-command risk.**

## Performance

- **Duration:** ~19 min (2026-06-10 11:34–11:53 UTC)
- **Tasks:** 3
- **Files:** 1 created, 5 modified

## Accomplishments

- **Router (Task 1):** `src/vcs-command-router.cts` re-expresses every harvested fork handler byte-for-behavior over `./vcs/index.cjs`: status, log, diff, head-ref, current-branch, branch-list, push, merge, reset, restore, revert, commit-to-subrepo, hooks.fire, migrate-vcs, workspace.assert-dispatched-cwd, workspace.parallel.{dispatch,fan-in,cancel}, cleanup-subagent-workspaces. Envelope rules preserved exactly: identical top-level field names, null where the fork emitted null (assert-dispatched-cwd failure branch), file-or-stdin-only handle inputs, strict `=== false` parallelization gate, WR-03/WR-04/WR-05 argv-loop fixes carried.
- **Wiring (Task 2):** family case group in gsd-tools.cjs (15 head commands) → `await routeVcsCommand(...)` with `core.output` injection (@file >50KB spill + --raw for free). `query` meta-prefix and #3243 dotted→spaced normalization verified live: `query head-ref` → parseable JSON (`{ok:true, head:"mvv"}` — jj change_id shortest on this repo); `query state.load` still dispatches; `node -c` green.
- **Chain integrity (T-19-15):** BLOCKER-3 sweep — 9 `gsd-sdk|resolveGsdToolsPath` hits under src + gsd-core/bin, all comment/docblock provenance; zero executable spawn paths to the retired binary.
- **Regression net (Task 3):** both fork tests re-pointed in place (cmp-verified byte-identical to c7bd6bee before edit): dist-cjs requires → `gsd-core/bin/lib/vcs/*.cjs`. 47/47 pass (vcs[git] 15, vcs[jj-colocated] 15, vcs[jj-native] 15 short-circuit, 2 smoke) — clears 3 class-B rows from the 19-04 frozen baseline.
- **Per-family dispatch smoke (PORT-02 evidence):** 18 invocations per cell on a jj-native tmp cell and a `GSD_VCS=git`-pinned colocated tmp cell — read-only verbs real, mutation verbs probed via argv-validation envelopes that return before any adapter call. Full table in the ledger appendix; cells removed; `jj st` on this repo confirmed untouched (T-19-17).

## Task Commits

Each task committed file-scoped on top of the stack above merge change `vpzlrrlv` (untouched):

1. **Task 1: src/vcs-command-router.cts (19-verb table + envelope parity)** - `8f163e1f` / change `tzztvosw` (feat)
2. **Task 2: gsd-tools.cjs wiring + PORT-02/sweep ledger rows** - `cd99eb01` / change `mvvqrlvy` (feat)
3. **Task 3: regression-net port + smoke evidence + .cjs inventory** - `0c58e86c` / change `lmzxuspr` (test)

## Deviations from Plan

### Auto-fixed Issues

**1. [Plan-assumption correction] Verb surface 23 → 19 (phantom verbs dropped)**
- **Found during:** Task 1 read_first (harvest + fork registry at c7bd6bee)
- **Issue:** the plan's action lists `branch-create`, `branch-delete`, `rev-parse`, `rm`, and a bare `workspace` verb — none exist fork-side. The 19-03 ledger already recorded the authoritative registered set ("the plan's speculative rev-parse/rm verbs do not exist fork-side"); fork `workspace.ts` is a planning-paths module, not a verb. `worktree.cleanup-wave` (in the fork registry) needs no bridge — its fork handler spawnSync'd back INTO gsd-tools' own surviving `worktree cleanup-wave` case
- **Fix:** implemented all 19 verbs that actually exist; phantom-verb rule (plan context) honored by inventing nothing
- **Files modified:** n/a (scope interpretation, ledgered)
- **Commit:** 8f163e1f

**2. [Plan-conflict resolution] commit-to-subrepo dispatch stays with the upstream case**
- **Found during:** Task 2 (gsd-tools.cjs read_first)
- **Issue:** Task 2 says "dispatch the verbs from Task 1" AND "preserve every existing upstream case byte-identical" — gsd-tools already has a `commit-to-subrepo` case (commands.cmdCommitToSubrepo). A duplicate case label is the only way to do both
- **Fix:** mirrored the plan's own locked `commit` decision: router carries the fork-envelope handler (reachable for 19-07 wiring), upstream case keeps dispatch ownership until its internals migrate in 19-07. Ledgered
- **Files modified:** gsd-core/bin/gsd-tools.cjs (comment documents the carve-out)
- **Commit:** cd99eb01

**3. [Rule 1 - Bug] Contract test asserted a nonexistent `hash` field**
- **Found during:** Task 3 first test run (4 fails: `r.hash`/`entries[0].hash` undefined on git AND jj-colocated lanes)
- **Issue:** `CommitResult`/`LogEntry` carry `id` only — on the fork at c7bd6bee and in the port. The contract docblock explicitly forbids assuming hex form (the fork's own v1.2 lint-vcs-no-commit-id principle). The fork never caught this: the file hit a class-B module-load error against stale dist-cjs (19-04 baseline) and the fork had no unit-CI lane
- **Fix:** assertions flipped to `id` with per-backend alphabet regexes (`/^[0-9a-f]+$/` git, `/^[k-z]+$/` jj); test name updated to "produces a canonical revision id"; 47/47 green
- **Files modified:** tests/vcs-adapter-contract.test.cjs
- **Commit:** 0c58e86c

### Retired-SDK collapses (Rule 3 family, ledgered)

- Fork `loadConfig` (SDK) → direct `planningPaths(cwd).config` read inside the dispatch handler — preserves both the strict `=== false` semantics and the GSD_WORKSTREAM-aware path the SDK loader had.
- Fork `helpers.resolvePathUnderProject` + `GSDError` → inlined port with a name-tagged plain `Error` (`VcsPathValidationError`); envelope text unchanged.
- `sanitizeCommitMessage` consumed from `planning-shim.cjs` (first consumer of the 19-05 collapse plan; byte-identical fork body).
- Cosmetic: the reset error-hint string now names `gsd-tools query revert` instead of the retired `gsd-sdk query revert` (user-facing pointer to the live binary).

## Authentication Gates

None.

## Known Stubs / Forward Pointers

No new stubs. `commit-to-subrepo` router handler is intentionally dispatch-dormant until 19-07 (documented in the router header, the gsd-tools case comment, and the ledger). Fork-inherited jj-restore gap-fill comment carried verbatim in the restore handler.

## Verification Results

- `pnpm run build:lib` exit 0; `gsd-core/bin/lib/vcs-command-router.cjs` emitted (gitignored before first build, 19-05 practice); `routeVcsCommand` exported and loadable
- Every action-listed-and-existing verb registered (per-verb rg ≥ 1, 19/19); zero `checkout`/`"tag"`/`"stash"` hits; `: null` present where harvested handlers used it
- `node -c gsd-core/bin/gsd-tools.cjs` green; `query head-ref` parseable JSON on this jj repo; `query state.load` unsevered; gsd-sdk spawn sweep = zero executable paths
- `node -c` both test files; `node scripts/run-tests.cjs --files "tests/vcs-cjs-smoke.test.cjs tests/vcs-adapter-contract.test.cjs"` → 47 pass / 0 fail / 0 skip
- Smoke: one passing invocation per verb family on the jj cell and the git cell (ledger appendix table); no smoke invocation mutated this repo
- `vpzlrrlv` untouched; three task commits stack above it; no bookmark moves, no op restore

## Next Phase Readiness

- **19-07 unblocked:** the dispatch chain exists for every verb the call-site migration will route through; `commit`/`commit-to-subrepo` internals migration has its router-side envelope reference in place.
- **19-08 unblocked (PORT-02 goal):** workflows can be rewired to `gsd_run query <verb>` — every verb resolves, envelope shapes match what the fork workflow deltas' jq expressions parse.
- **19-10/19-11 note:** baseline class-B rows for tests/vcs-cjs-smoke (2) + tests/vcs-adapter-contract (1) and the two B/C cli-* verb-bridge rows (cli-workspace-parallel-cancel, cli-cleanup-subagent-workspaces) should re-derive against the now-live bridge.

## Self-Check: PASSED

- Files exist: 19-06-SUMMARY.md (this file), src/vcs-command-router.cts, gsd-core/bin/lib/vcs-command-router.cjs (emitted, ignored), both test files
- Commits present in `jj log`: 8f163e1f (tzztvosw), cd99eb01 (mvvqrlvy), 0c58e86c (lmzxuspr)
- build:lib exit 0; dispatch smokes green; 47/47 tests; ledger rows + appendix + inventory rows verified present

---
*Phase: 19-upstream-merge-conflict-resolution-fork-abstraction-audit*
*Completed: 2026-06-10*
