---
phase: 19-upstream-merge-conflict-resolution-fork-abstraction-audit
plan: 11
subsystem: test-revival-vitest-port
tags: [vitest, jj, port-01, merge-04, toBeIdOf, golden-baselines, node-test, bridge, a4]

# Dependency graph
requires:
  - phase: 19-upstream-merge-conflict-resolution-fork-abstraction-audit
    provides: "19-10: four lint gates green, .cts trap closed, src/vcs/__tests__/** raw-git allowlist glob pre-pointed; 19-06/19-07: PORT-02 router + unified-revision (id) envelopes; 19-08/19-09: rewired workflows/agents the guard tests re-validate; 19-05: ported src/vcs/*.cts; 19-02: vitest ^3.1.1 installed"
provides:
  - "Vitest revived: fork-owned root vitest.config.ts (unit+integration projects, toBeIdOf setupFiles, esbuild.include +cts, maxWorkers:2) replacing upstream's dead ./sdk config"
  - "Full fork jj/vcs suite (59 assets, set-identical to c7bd6bee inventory) live at src/vcs/__tests__: default cell 578 passed/11 skipped, GSD_TEST_BACKENDS=git,jj cell 559 passed/0 skipped, both exit 0"
  - "PORT-01 test-proven: cmd-parallel-jj (13) + cmd-parallel-git (14) dispatch/fan-in, jj-hooks (9, exactly-once firing), adapter-contract (26, toBeIdOf) all named-passing"
  - "ASSUMPTION A4 RESOLVED (partial-hold, config-level fix — no .test.cts fallback): vite resolves .cjs→.cts but needs esbuild.include widening + 3 import-equals→interop-default conversions"
  - "Fork node:test guard set green in upstream layout: quick-md-parallel-dispatch + agent-prompts-no-raw-git re-validate the 19-08/19-09 rewired prompts mechanically"
  - "tests/bridge-commit-files.test.cjs: bug-2767 --files subset semantics proven through gsd-tools query commit on a tmp jj repo (id-not-hash envelope)"
  - "50 golden baselines harness-re-captured (never hand-edited); baseline-parity 50/50"
  - "scripts/dogfood-restore.sh orphan cleanup re-pointed at the bridge (run_gsd_tools + GSD_TOOLS_BIN test seam)"
affects: [19-12 (full-suite green + skip baseline + residue deletion; migr-06-close-gate test imports sdk/ residue; bug-2798/bug-3019 silent-skip triage), 19-13 (ledger completeness proof; hand-edited .cjs appendix grew 12 rows)]

# Tech tracking
tech-stack:
  added: []
  patterns: ["vitest .cts transform via esbuild.include widening (vite default filter excludes .cts)", "router VCS_VERB_TABLE as drop-in replacement for retired fork query handlers ((args, projectDir) → {data} contract)", "GSD_TOOLS_BIN env seam for shell-script CLI injection in tests", "maxWorkers cap for sync-spawn-heavy suites (birpc 60s RPC starvation under full parallelism)"]

key-files:
  created:
    - src/vcs/__tests__/ (59 ported assets)
    - tests/bridge-commit-files.test.cjs
  modified:
    - vitest.config.ts (replaced)
    - tests/__tools__/{vitest-matchers.ts,vitest.d.ts,capture-vcs-baselines.cjs}
    - src/vcs-command-router.cts, src/planning-workspace.cts, src/vcs/format-migration/run.cts (import-equals → interop default)
    - tests/{jj-parallel-no-manifest-write,quick-md-parallel-dispatch,cli-workspace-parallel-cancel,cli-cleanup-subagent-workspaces,commands,verify,workspace,commit-files-deletion}.test.cjs
    - tests/scripts/dogfood-restore-orphan-cleanup.test.cjs, scripts/dogfood-restore.sh
    - tests/baselines/git-vcs/*.snap.json (50, harness-regenerated)
    - scripts/lint-vcs-no-commit-id.allow.json (+9 entries)
    - 19-MERGE-AUDIT.md, deferred-items.md
  deleted:
    - tests/wave-cleanup-executor.test.cjs (dropped: superseded by 19-07 substrate disposition)

key-decisions:
  - "A4 resolution: keep tests .test.ts (no fallback rename, publish build auto-excludes); fix at config (esbuild.include +cts) + 3 minimal production import-equals conversions (tsc emit equivalent under esModuleInterop)"
  - "wave-cleanup-executor.test.cjs DROPPED, not ported: it pins the fork D-05 fanIn-delegation body of executeWorktreeWaveCleanupPlan, which 19-07 deliberately did not port (worktree-safety.cts = git substrate; 5 upstream test files pin the adopted body; zero workflow callers of cleanup-wave; the D-05 invariant lives at the verb layer, pinned by cmd-parallel-{jj,git})"
  - "bug-3749* DROPPED, not ported: fork-SDK typed-IR helpers (parsePhasesFromFiles etc.) have zero hits in the adopted tree; the #1278/#3749 behavioral invariant is carried by upstream's adapter-routed strategy-branch block (src/commands.cts) and pinned by tests/commands.test.cjs:1369/1400 (verified passing)"
  - "maxWorkers:2 + 30s timeouts in vitest config: sync-spawn-heavy tests starve worker↔main RPC past birpc's hard 60s timeout at higher parallelism (exit 1 with all tests green); 2 workers = zero RPC errors, ~110s suite"
  - "research's '58 vitest tests' and '55 snaps' were over-counts (19-05 '36 modules' class): actual inventory = 56 runnable .test.ts + 1 .test-d.ts + 2 fixtures, and 50 snaps; completeness proven by set-identity with c7bd6bee, ledgered"

requirements-completed: []  # MERGE-04 partial (full-suite green + skip baseline land in 19-12) + PORT-01 are ROADMAP-plan-line REQs (Phase 19 phase-scoped precedent per 19-09/19-10) — not in REQUIREMENTS.md

# Metrics
duration: ~80min
completed: 2026-06-10
---

# Phase 19 Plan 11: Vitest revival + fork test-asset port Summary

**The fork's jj coverage core is alive against the ported modules: 59-asset vitest suite green on both backends (578/11sk default, 559/0sk git+jj cells) from src/vcs/__tests__ with the toBeIdOf matcher, the node:test guard set re-validating the rewired prompts, bug-2767 semantics re-proven through the bridge on jj, and all 50 golden baselines harness-re-captured — with A4 resolved at config level (esbuild .cts transform + 3 interop-import conversions) instead of the fallback rename.**

## Performance

- **Duration:** ~80 min (2026-06-10 13:57–15:17 UTC)
- **Tasks:** 2
- **Files:** ~135 touched (59 ported tests + 50 regenerated snaps + 1 new test + ~25 modified)

## Accomplishments

- **Task 1 (vitest revival):** Root `vitest.config.ts` rewritten fork-owned (unit + integration projects, matcher setupFiles, GSD_TEST_BACKENDS read at test time by `parseBackendsEnv`/`selectedBackends` exactly as in the fork config). Scripted 1:1 port of all 59 `sdk/src/vcs/__tests__` assets with mechanical rewrites: `../*.js` → `.cjs` production specifiers (vite resolves to `.cts` sources), intra-`__tests__` `./*.js` untouched, `execGit`→`execGitVcs`, repo-depth 4-up→3-up, jj-lock child require → built `gsd-core/bin/lib/vcs/jj/lock.cjs` + `pnpm run build:lib`. The 10 tests importing retired fork SDK query handlers re-pointed at the PORT-02 router's `VCS_VERB_TABLE` (identical `(args, projectDir) → {data}` contract); the gsd-sdk binary integration test retargeted at `gsd-core/bin/gsd-tools.cjs query` (envelope contract verified live: flat head-ref, entries[], reset path scoping, revert --abort, push bookmark round-trip). Publish build emits zero `__tests__` artifacts (`.test.ts` auto-excluded by the `.cts`-only build include).
- **Task 2 (node:test port + baselines):** Guard set green in upstream layout — `quick-md-parallel-dispatch` (9 CR-02/CR-03 assertions against the 19-08 rewired `gsd-core/workflows` fences) and `agent-prompts-no-raw-git` (5 PROMPT-08 assertions against the 19-09 rewired executor prompt, zero content edits needed) pass verbatim. CLI smokes retargeted at the bridge with two documented assertion adaptations (spaced-form normalization, router error surface). NEW `tests/bridge-commit-files.test.cjs` proves `query commit --files <subset>` commits exactly the named files on a tmp jj repo with the unified `id` envelope. Gate-script tests verified complete (70/70; parametric synthetic trees needed zero edits; presence fixtures landed in 19-10). All 50 golden snaps regenerated by the harness's own loop — `jj diff` confirms wholesale regeneration (only `captured_at` + regex-matched non-deterministic stdout changed); `baseline-parity` 50/50 post-capture.

## Task Commits

Each task committed on top of the stack above merge change `vpzlrrlv` (untouched):

1. **Task 1: vitest revival + 59-asset suite port** — `3f5cbfa8` / change `kztukmoz` (feat)
2. **Task 2: node:test guard set + bridge test + baseline re-capture** — `53b001ba` / change `tvrkrsxm` (feat)

## Deviations from Plan

**1. [A4 partial-hold — config fix, not fallback] vite resolves `.cjs`→`.cts` but does not transform `.cts`**
- **Found during:** Task 1 first vitest run
- **Issue:** resolution worked (A4 core claim held) but vite's default esbuild filter excludes `.cts` (parse failures); esbuild's ESM output additionally leaves TS `import x = require(…)` as bare `require()` (runtime crash under vite SSR)
- **Fix:** `esbuild.include: [/\.ts$/, /\.cts$/, /\.mts$/]` in vitest.config.ts + [Rule 3] 3 `import = require` → interop default imports in src/vcs-command-router.cts, src/planning-workspace.cts, src/vcs/format-migration/run.cts (tsc emit equivalent under esModuleInterop; build:lib green; upstream's house style elsewhere untouched). NO `.test.cts` rename, NO built-artifact fallback.
- **Commit:** 3f5cbfa8

**2. [Rule 1] cmd-hotfix-jj Test 3 pinned superseded pre-WR-03 behavior**
- **Found during:** Task 1 (deterministic failure)
- **Fix:** rewritten to the post-05-06 envelope contract (mirrors cmd-ship-jj Test 2); the fork file was never updated because the fork had no unit-CI lane
- **Commit:** 3f5cbfa8

**3. [Rule 1] vitest run-level flake: worker RPC starvation + 5s timeouts under full parallelism**
- **Found during:** Task 1 full runs (different files failed each run; all passed in isolation; birpc's hard 60s `onTaskUpdate` timeout flipped exit to 1 with all tests green)
- **Fix:** `maxWorkers: 2` (root-level; ignored inside projects) + testTimeout/hookTimeout 30s — empirically zero RPC errors, ~110s wall
- **Commit:** 3f5cbfa8

**4. [Plan deviation — drop instead of port] tests/wave-cleanup-executor.test.cjs DELETED**
- **Found during:** Task 2 (all 6 tests fail against the adopted module)
- **Issue:** the test pins the fork Phase 11 D-05 fanIn-delegation body of `executeWorktreeWaveCleanupPlan`; 19-07 dispositioned `src/worktree-safety.cts` as git-backend substrate (upstream body), pinned by 5 live upstream test files; zero gsd-core workflow/agent callers of `cleanup-wave` remain — the D-05 invariant lives at the workspace.parallel.fan-in verb layer (pinned by cmd-parallel-{jj,git} + presence lint)
- **Fix:** dropped with ledger row `dropped:superseded-by-19-07-substrate-disposition`
- **Commit:** 53b001ba

**5. [Plan deviation — drop instead of port] tests/bug-3749*.test.cjs NOT ported**
- **Found during:** Task 2 read of the c7bd6bee sources
- **Issue:** both files pin retired fork-SDK internals (sdk/src/query/commit.ts source-greps, ts-node typed-IR helpers with zero hits in the adopted tree, sdk/dist/cli.js binary); the behavioral invariant is carried by upstream's strategy-branch block and its passing tests (commands.test.cjs:1369/1400, verified)
- **Fix:** dropped with ledger row `dropped:superseded-by-upstream-coverage`
- **Commit:** 53b001ba

**6. [Rule 1 — class-B baseline fallout] scripts/dogfood-restore.sh still shelled the retired `gsd-sdk`**
- **Found during:** Task 2 (ported dogfood-restore-orphan-cleanup test failed; orphan cleanup WARN-degraded on every production run)
- **Fix:** script-relative `run_gsd_tools()` resolution of gsd-core/bin/gsd-tools.cjs with `GSD_TOOLS_BIN` as the test-injection seam; both test shims retargeted (CR-02 noisy-stderr mechanism preserved); bash -n + 2/2
- **Commit:** 53b001ba

**7. [Rule 1 — class-A/B baseline fallout] 6 live `sdk/dist-cjs` requires + 1 stale `hash` envelope pin**
- **Found during:** Task 2 systematic sweep (the plan's `sdk/dist-cjs → gsd-core/bin/lib/vcs` re-point)
- **Fix:** tests/{commands,verify,workspace,commit-files-deletion}.test.cjs re-pointed; the re-point unmasked the pre-19-07 `output.hash`/`head.hash` pin in commands.test.cjs — flipped to the unified `id` (19-07 contract); 185/185 across the 4 files
- **Commit:** 53b001ba

**8. [Rule 2 — gate compliance] commit-id allowlist re-points for the freshly-ported tests**
- **Found during:** Task 2 four-gate run (commit-id lint flagged 9 files: the 8 ported test files whose fork entries were per-file, plus the new bridge test's negative assertions)
- **Fix:** 8 re-point entries mirroring the fork reasons + 1 self-reference-class entry; legacy sdk/** entries retained (pending-19-12-residue-deletion); all four gates exit 0
- **Commit:** 53b001ba

**9. [Plan-expectation correction] inventory counts: 56 runnable tests (not ≥58), 50 snaps (not 55)**
- Research over-counts (same class as the 19-05 "36 modules" row). Completeness is proven by set-identity with the c7bd6bee inventory (`diff <(ls …)` empty) and harness-inventory coverage (zero orphan snaps); ledgered in the suite port row.

## Authentication Gates

None.

## Verification Results

- **Task 1 verify line:** PASS — `npx vitest run` exit 0 (56 files; 578 passed/11 skipped) + `GSD_TEST_BACKENDS=git,jj npx vitest run` exit 0 (559 passed/0 skipped) + `pnpm run build:lib` exit 0 + zero `__tests__` artifacts under gsd-core/bin/lib. PORT-01 named tests passing: cmd-parallel-jj (13), cmd-parallel-git (14), jj-hooks (9 incl. HOOK-07 exactly-once), adapter-contract (26, toBeIdOf). A4 outcome row in the ledger.
- **Task 2 verify line:** PASS (adapted: wave-cleanup-executor dropped per deviation 4) — `node -c` green on every ported/edited .cjs; runner subset (bridge-commit-files + quick-md-parallel-dispatch + agent-prompts-no-raw-git) 16/16; full ported node:test set 27/27; gate-script tests 70/70 + dogfood 2/2; re-pointed upstream-shape files 185/185.
- **Overall:** all four lint gates exit 0; baselines wholesale-regenerated by the harness with baseline-parity 50/50; threat register closed — T-19-29 (named PORT-01 tests in output + set-identity instead of the over-counted ≥58 figure), T-19-30 (harness-only re-capture + diff check), T-19-31 (zero build artifacts).
- jj discipline: two task commits stack linearly above `ac0fc8de` (19-10 tail); `vpzlrrlv` untouched; no bookmark moves, no op restore.

## Known Stubs / Forward Pointers

- **19-12:** tests/scripts/migr-06-close-gate.test.cjs imports the residual `sdk/src/vcs/format-migration/rewrite.ts` via ts-node — green today, must be reconciled when the sdk/ residue is deleted (HISTORICAL-marked script; drop or re-point candidate). Deferred item #6: bug-2798 + bug-3019 silently skip on the retired `sdk/dist/cli.js` gate (T-19-29 class) — re-target at gsd-tools or drop at the skip-baseline triage.
- **19-12:** legacy `sdk/**` allowlist entries (both lints) still pending strip after residue deletion; the 8 fork-side commit-id `sdk/src/vcs/__tests__/*` entries now have live re-pointed twins.
- The `WR-01 filesystem-level guard` describe in jj-parallel-no-manifest-write.test.cjs remains `skip: true` by design (fork-documented opportunistic upgrade hook).

## Self-Check: PASSED

- Files exist: vitest.config.ts (fork-owned), src/vcs/__tests__/ (59 files), tests/__tools__/vitest-matchers.ts, tests/bridge-commit-files.test.cjs, 19-11-SUMMARY.md — FOUND; tests/wave-cleanup-executor.test.cjs — correctly ABSENT
- Commits present in `jj log`: 3f5cbfa8 (kztukmoz), 53b001ba (tvrkrsxm)
- Verifies re-run clean post-commit (vitest exit 0 both cells; four gates exit 0; node -c loop green)

---
*Phase: 19-upstream-merge-conflict-resolution-fork-abstraction-audit*
*Completed: 2026-06-10*
