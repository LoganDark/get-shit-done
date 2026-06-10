---
phase: 19-upstream-merge-conflict-resolution-fork-abstraction-audit
plan: 05
subsystem: vcs
tags: [jj, vcs-adapter, port, cts, build-at-publish, execGitVcs, format-migration]

# Dependency graph
requires:
  - phase: 19-upstream-merge-conflict-resolution-fork-abstraction-audit
    provides: "19-04: zero-conflict tree, green pre-port build:lib, frozen 12,860/153 pre-port unit baseline"
provides:
  - "PORT-01 module layer: all 34 fork vcs production modules from c7bd6bee sdk/src/vcs/ live at src/vcs/**.cts (mechanical .ts→.cts + relative .js→.cjs translation, execGit→execGitVcs rename)"
  - "pnpm run build:lib exit 0 with the ported tree; gsd-core/bin/lib/vcs/**.cjs emitted (index, backends/{jj,git}, {jj,git}/parallel, parse/* x8, format-migration/* x9)"
  - "Emitted index.cjs loads under require(); createVcsAdapter(process.cwd()).kind === 'jj' on this repo (sticky vcs.adapter config path)"
  - ".gitignore directory line /gsd-core/bin/lib/vcs/ — emitted vcs artifacts never snapshotted by jj"
  - "format-migration/planning-shim.cts — byte-identical fork bodies of atomicWriteConfig/acquireStateLock/releaseStateLock/sanitizeCommitMessage (retired SDK query layer)"
affects: [19-06 (CLI bridge requires createVcsAdapter emit), 19-07 (call-site migration imports src/vcs), 19-11 (test port re-points at src/vcs + planning-shim), 19-12 (sdk/ residue deletion now safe for vcs tree), 19-13 (ledger completeness proof parses the 36 new rows)]

# Tech tracking
tech-stack:
  added: []
  patterns: [mechanical .ts→.cts port with .js→.cjs specifier rewrite incl. inline import() type positions, port-time dependency shim for retired-layer imports with byte-identical bodies + ledgered collapse plan, directory-level gitignore for emitted module families]

key-files:
  created:
    - src/vcs/types.cts
    - src/vcs/index.cts
    - src/vcs/exec.cts
    - src/vcs/expr.cts
    - src/vcs/backends.cts
    - src/vcs/refs-validator.cts
    - src/vcs/hook-bridge.cts
    - src/vcs/backends/jj.cts
    - src/vcs/backends/git.cts
    - src/vcs/git/parallel.cts
    - src/vcs/jj/parallel.cts (+ octopus, reap, workspace-cleanup, incomplete-work, pre-push, lock, conflict-paths)
    - src/vcs/parse/ (8 parsers)
    - src/vcs/format-migration/ (8 ported modules + planning-shim.cts)
  modified:
    - .gitignore
    - .planning/phases/19-upstream-merge-conflict-resolution-fork-abstraction-audit/19-MERGE-AUDIT.md

key-decisions:
  - "Plan/research headcount '36 production modules' is an over-count: the authoritative `jj file list -r c7bd6bee sdk/src/vcs` inventory (excluding __tests__/ and .gitkeep) and the research's own chunk table (7+2+9+8+8) both sum to 34. Ported 34, 1:1 inventory-verified; file-count gate adapted from '>= 36' to 'inventory 1:1 + 35 on-disk incl. shim'"
  - "run.cts's four retired-SDK query-layer imports resolved Rule-3 style: atomicWriteConfig + acquireStateLock/releaseStateLock (+ private lock helpers) + sanitizeCommitMessage shimmed byte-identically into src/vcs/format-migration/planning-shim.cts; planningPaths re-pointed at upstream's canonical src/planning-workspace.cts (same (cwd, ws?)→PlanningPaths 7-key contract incl. GSD_WORKSTREAM env defaulting)"
  - "execGit→execGitVcs rename applied via word-boundary sweep across the 4 referencing modules; the one comment naming core.cjs's own execGit signature restored so the byte-identity reference stays accurate"
  - "gitignore uses a single directory line /gsd-core/bin/lib/vcs/ (deviation from upstream per-file enumeration): auto-covers future vcs modules, drift-impossible; ledgered"
  - "Build deferred until after the gitignore line landed so jj never snapshotted emitted artifacts; pre-commit typecheck used tsc --noEmit instead"

patterns-established:
  - "Port-time dependency shim: when a mechanically-ported module imports from a retired layer, carry byte-identical bodies in a sibling shim with provenance header + ledger row + explicit collapse plan (19-06/19-07), instead of either porting the dependency fan-out or editing semantics"

requirements-completed: []  # PORT-01 is phase-scoped (no v1.4 REQUIREMENTS.md row — 19-01..19-04 precedent); module layer done here, CLI bridge (PORT-02) lands 19-06

# Metrics
duration: ~16min
completed: 2026-06-10
---

# Phase 19 Plan 05: Fork VCS Layer Port (sdk/src/vcs → src/vcs/**.cts) Summary

**All 34 fork vcs production modules (core contract, jj+git backends, parallel verbs, 8 parsers, format-migration) ported byte-for-behavior from pinned revision c7bd6bee into upstream's build-at-publish architecture as src/vcs/**.cts — build:lib green, emitted gsd-core/bin/lib/vcs/index.cjs loads under require(), and createVcsAdapter detects jj on this repo.**

## Performance

- **Duration:** ~16 min (2026-06-10 11:21–11:37 UTC)
- **Tasks:** 2
- **Files:** 35 created (34 ported + 1 shim), 2 modified (.gitignore, ledger)

## Accomplishments

- **Scripted relocation:** every module extracted with `jj file show -r c7bd6bee` (revision is the contract, not the on-disk survivors), written to `src/vcs/<path>.cts` with relative `.js`→`.cjs` specifier rewrite — including the two inline `import('../types.js')` type positions in backends/git.cts the line-oriented `from`/`require` rewrite missed (caught by `tsc --noEmit`, swept tree-wide).
- **Naming-hazard mitigation (T-19-13):** `execGit` → `execGitVcs` in exec.cts and its 3 consumer modules (index re-export, backends/git.cts import + ~62 call/comment sites, parse/worktree-list.cts) before any consumer exists. The exec.cts docblock line citing core.cjs's own `execGit(cwd, args, options)` signature was restored post-sweep so the byte-identity reference stays truthful.
- **Pitfall 10 honored:** `ExecResult { exitCode, stdout, stderr, timedOut, error }` untouched (WR-06 `EXIT_CODE_SIGNAL_KILLED = -1` sentinel intact); upstream's `src/shell-command-projection.cts` untouched.
- **Compile gate:** `pnpm run build:lib` (tsc strict, noEmitOnError, ES2022/nodenext) exits 0 with the ported tree — fork modules compile under upstream's compiler settings unmodified.
- **Emit + smoke:** `gsd-core/bin/lib/vcs/**.cjs` emitted with all nested subdirs. Require smoke: `createVcsAdapter` is a function on the emitted index. Detection smoke (exact call): `require('./gsd-core/bin/lib/vcs/index.cjs').createVcsAdapter(process.cwd()).kind === 'jj'` — resolves via the sticky `.planning/config.json` `vcs.adapter: "jj"` path (resolver priority 3), no config write-back triggered.
- **Ignore coverage:** single `/gsd-core/bin/lib/vcs/` directory line; `jj st` post-build shows zero gsd-core/bin/lib/ paths.
- **Ledger:** 36 new rows — 34 `ported-to:src/vcs/...` module rows + 1 `ported-to:...planning-shim.cts` row (Rule 3) + 1 gitignore convention-deviation row, all six-prefix parseable for the 19-13 completeness proof.

## Task Commits

Each task committed file-scoped on top of the stack above merge change `vpzlrrlv` (36c417ee, untouched):

1. **Task 1: Scripted relocation + mechanical translation (34 modules + shim)** - `96bfc15d` / change `tzonpkvr` (feat)
2. **Task 2: Gitignore coverage + build green + emitted-artifact smoke** - `928ee573` / change `vsuylnlr` (feat)

## Deviations from Plan

### Auto-fixed Issues

**1. [Plan-assumption correction] Module headcount 36 → 34**
- **Found during:** Task 1 read_first (authoritative inventory)
- **Issue:** plan must_haves/verify say "36 production modules" with a `>= 36` file-count gate, but `jj file list -r c7bd6bee sdk/src/vcs` excluding `__tests__/` and `.gitkeep` yields exactly 34 — and the research's own Porting Map chunk table (7+2+9+8+8) also sums to 34. The plan's expected layout list likewise enumerates 34. "36" was an over-count carried from the research headline
- **Fix:** ported all 34, verified 1:1 against the authoritative inventory (diff of expected vs on-disk = empty); file-count gate satisfied as 35 on-disk .cts (34 ported + planning-shim). The 1:1 match is the real T-19-14 anti-skip gate and it holds exactly
- **Files modified:** n/a (verification interpretation)
- **Commit:** 96bfc15d

**2. [Rule 3 - Blocking] format-migration/run.ts imports four helpers from the retired SDK query layer**
- **Found during:** Task 1 pre-port specifier scan
- **Issue:** `run.ts` imports `atomicWriteConfig` (config-mutation), `acquireStateLock`/`releaseStateLock` (state-mutation), `planningPaths` (helpers), `sanitizeCommitMessage` (commit) from `sdk/src/query/` — retired upstream (ADR-0174), no `src/` counterpart; the mechanical port cannot compile. Porting those modules wholesale cascades into the entire SDK (errors, frontmatter, state, workspace, model-catalog, ...)
- **Fix:** new `src/vcs/format-migration/planning-shim.cts` carrying byte-identical fork bodies of the three fork-only helpers (incl. private `isLockProcessDead`, `_heldStateLocks` + process-exit cleanup); `planningPaths` re-pointed at upstream's canonical `src/planning-workspace.cts` (identical 7-key PlanningPaths shape, GSD_WORKSTREAM/GSD_PROJECT env defaulting; run.cts consumes only `paths.config`). Provenance header documents the collapse plan (19-06/19-07). Ledgered as its own `ported-to:` row
- **Files modified:** src/vcs/format-migration/planning-shim.cts (new), src/vcs/format-migration/run.cts (import block only)
- **Commit:** 96bfc15d

**3. [Rule 1 - Bug] Inline `import('../types.js')` type specifiers missed by the first rewrite pass**
- **Found during:** Task 1 typecheck (`tsc --noEmit` → TS2307 x2 in backends/git.cts)
- **Issue:** the scripted rewrite covered `from '...'` and `require('...')` forms; backends/git.cts uses two inline `import('../types.js')` type expressions
- **Fix:** third sed form for `import('<rel>.js')`; tree-wide rg confirms zero remaining relative `.js` specifiers in any form; tsc exits 0
- **Files modified:** src/vcs/backends/git.cts
- **Commit:** 96bfc15d

### Sanctioned-edit notes (not deviations)

- exec.cts docblock line restored to cite core.cjs's `execGit` after the word-boundary rename sweep, plus a 3-line note explaining the port-time rename — comment-only, keeps the byte-identity reference accurate.
- Build deliberately deferred to Task 2 (after the .gitignore line) so jj never auto-tracked emitted artifacts; Task 1's compile gate ran as `tsc --noEmit`.

## Authentication Gates

None.

## Known Stubs / Forward Pointers

No new stubs. Fork-inherited markers carried verbatim (byte-for-behavior port): `hook-bridge.cts:13` TODO(D-05/HOOK-05) PATH-shim forward pointer; "placeholder" mentions in format-migration are domain vocabulary (orphan-rewrite placeholders), not unimplemented code. `planning-shim.cts` is a deliberate temporary home — collapse into canonical upstream helpers tracked in its header and the ledger row (19-06/19-07).

## Verification Results

- File count: 35 .cts under src/vcs (34 ported + shim); inventory diff vs `jj file list -r c7bd6bee` = **1:1 MATCH**
- Zero relative `.js` specifiers (all forms: from / require / inline import())
- `export function execGit\b` absent from exec.cts; `execGitVcs` exported and consumed (index 1, exec 2, worktree-list 2, backends/git 64 references)
- `timedOut` present in exec.cts (ExecResult shape preserved)
- `pnpm run build:lib` exit 0; `gsd-core/bin/lib/vcs/index.cjs` + backends/jj.cjs + backends/git.cjs + git/parallel.cjs + jj/parallel.cjs + parse/* + format-migration/* all emitted
- Require smoke green; jj-detection smoke green (`.kind === 'jj'` via sticky config)
- `jj st | grep gsd-core/bin/lib/` → zero hits (ignore line effective)
- 36 ledger rows appended (34 module + shim + gitignore-deviation), six-prefix parseable
- `vpzlrrlv` (36c417ee) untouched; both task commits stack above it; no bookmark moves, no op restore

## Next Phase Readiness

- **19-06 unblocked:** `createVcsAdapter` emit exists at the exact path the CLI bridge requires; the 19-04 baseline class-A rows (adapter-not-built) can now clear.
- **19-11 note:** ported tests must import `planning-shim.cjs` for `_heldStateLocks` test access where fork tests imported state-mutation.
- **19-12 note:** sdk/src/vcs residue is now fully superseded on the production side (tests still reference it until 19-11).

## Self-Check: PASSED

- Files exist: 19-05-SUMMARY.md (this file), all 35 src/vcs .cts files, gsd-core/bin/lib/vcs/index.cjs (emitted, ignored)
- Commits present in `jj log`: 96bfc15d (tzonpkvr), 928ee573 (vsuylnlr)
- build:lib exit 0; both smokes green; ledger row counts verified (35 ported-to:src/vcs/ + 1 gitignore row)

---
*Phase: 19-upstream-merge-conflict-resolution-fork-abstraction-audit*
*Completed: 2026-06-10*
