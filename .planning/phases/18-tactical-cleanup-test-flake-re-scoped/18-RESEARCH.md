# Phase 18: Tactical cleanup + test-flake (re-scoped) - Research

**Researched:** 2026-06-10
**Domain:** Repo-internal cleanup — workflow markdown gates, bash script hardening, TypeScript CLI input guards, vitest test hygiene
**Confidence:** HIGH (every claim verified against the live tree this session; zero external dependencies)

## Summary

This phase is 100% repo-internal: no new packages, no external APIs, no web research needed. All seven REQ-IDs were verified against the live post-Phase-19 tree this session, confirming the 2026-06-10 re-scope audit line-for-line: `gsd-core/workflows/transition.md` (694 lines) has zero `assert_clean_wc` occurrences and zero `gsd_run query commit` calls despite seven mutating steps; `scripts/dogfood-restore.sh` has a comment-only root precondition (line 25/42) and a plain `tar -xf "$TARBALL_PATH" -C .` (line 74); `src/vcs-command-router.cts` has the `--max-concurrency` NaN hole at line 1141 and no `Array.isArray` check after the plan `JSON.parse` at line 1180; both `cmd-parallel-{jj,git}.test.ts` CONFIG-02 describes leak 3 tmpDirs each per run; and `jj-reap.test.ts:79` has no per-test timeout — but the flake's preconditions were doubly removed by 19-11 (`maxWorkers: 2` AND `testTimeout: 30_000` replacing the 5s default), making verdict (b) resolved-by-restructure the likely TEST-17 outcome.

Two non-obvious findings change the plans' mechanics. First (CLEANUP-01): `gsd-tools query config-set` writes `.planning/config.json` to disk WITHOUT committing (verified `gsd-core/bin/lib/config.cjs:379-426`), and transition.md Routes B1/B run `config-set workflow._auto_chain_active false` (lines 552, 606) inside `offer_next_phase` — so the graft needs commit-adjacency for those two call sites too, not just the three obvious mutation clusters, or the gate placed before `offer_next_phase` will pass and the banner will still print over a dirty WC. Second (CLEANUP-07): the leaked `tmpDir` is a per-test `const` declared INSIDE each `it` body, so the literal `afterEach(() => rm(tmpDir, ...))` from the acceptance criteria mechanically requires hoisting `tmpDir` to a describe-scoped `let` — a required enabling edit, not scope creep.

All four lint gates were run this session and are green at baseline (no-raw-git 0/1073 files, call-presence 0/107, no-commit-id 0/1026, audit-workflow-raw-git ok with transition.md frozen at 1 hit). The vitest contract tests need NO build step (vite resolves `.cjs` specifiers to `.cts` sources — there is no `src/vcs-command-router.cjs` on disk); the node:test suite and any CLI-level smoke DO need `pnpm run build:lib` because the emitted `gsd-core/bin/lib/vcs-command-router.cjs` artifact is what `gsd-tools.cjs` requires (19-06 stale-dist precedent).

**Primary recommendation:** Execute exactly the closed acceptance sets in the three source todos, using the surviving execute-phase.md:1569-1719 commit-adjacency + gate pattern verbatim for 18.01, the existing `cmd-parallel-max-concurrency-cli.test.ts` vi.mock harness for 18.02's contract tests, and 3+ recorded full-suite runs (`GSD_TEST_BACKENDS=git,jj npx vitest run`) for 18.03's re-verify gate.

## Locked Constraints (from REQUIREMENTS.md / ROADMAP.md / STATE.md)

No `18-CONTEXT.md` exists (phase dir is empty). The following are locked upstream decisions the planner MUST honor:

### Locked Decisions
- **Closed acceptance set (v1.4 Pitfall 1):** The 3 source todos' `## Acceptance criteria` sections + the 7 REQ-IDs are the spec. Do NOT add bullets at plan time. Warning sign: any PLAN.md whose `must_haves` count exceeds the source todo's acceptance count.
- **Plan split is locked at 3 plans** (REQUIREMENTS Traceability + ROADMAP): 18.01 = CLEANUP-01 (HIGHEST PRIORITY per Pitfall 2); 18.02 = CLEANUP-03..07 with per-WR commits, order prod-code guards (05, 06) → script fixes (03, 04) → test fixes (07) per Pitfall 10; 18.03 = TEST-17 re-verify-then-fix.
- **CLEANUP-01 scope widened (re-scope audit):** upstream's rewrite has NO commit steps at all — the fix adds immediate `gsd_run query commit` after each mutating step (`update_roadmap`-equivalent, PROJECT.md evolution, STATE.md update), not just the terminal gate. Gate lands immediately before the "Phase {X} marked complete" / milestone-complete terminal banners.
- **TEST-17 re-verification gate FIRST:** reproduce under root `vitest.config.ts` (`maxWorkers: 2`) before fixing; if not reproducible in 3+ full-suite runs → close as resolved-by-restructure with runs recorded as evidence. If it reproduces: per-test fix only — diff ≤5 LOC, ≤1 file, root `vitest.config.ts` UNTOUCHED, `scripts/check-skip-count.cjs` green. No `retry: N`, no broader vitest reorg (Pitfall 9; `project_test_perf_pain_vitest` sweep stays out of scope).
- **Phase 14 info findings (5 items in v14-review-followups.md):** opportunistic only when an adjacent file is touched — never forced.

### Out of Scope (verbatim from REQUIREMENTS.md)
- MERGE-08 (`WorkspaceMergeOpts.mainBookmark` revision) — deferred-by-design.
- Broader test-perf sweep beyond TEST-17.
- Next upstream pull (separate operator action).
- Untracked `sdk/` + `get-shit-done/` on-disk leftovers (operator may delete at leisure).

## Project Constraints (environment + conventions)

No `./CLAUDE.md` exists in the project root (verified this session) and no `.claude/skills/` directory exists. Operative constraints from `.planning/config.json` + standing fork conventions:

- **jj colocated repo, `vcs.adapter: jj`:** NEVER run raw `git` commands (even reads perturb colocated jj state). Use `jj` read-only commands or the `gsd-tools` bridge (`node gsd-core/bin/gsd-tools.cjs query ...`). The `19-01…19-13` resolution stack sits on merge change `vpzlrrlv` — never rewrite/squash/abandon it or below.
- **Commit verb:** `gsd-tools query commit` is jj-safe post-B-08 (routes through the adapter); use it for all commits, with `--files` scoping.
- **Code style:** `src/vcs-command-router.cts` uses 2-space indent, single quotes, semicolons — match the surrounding file, NOT global tab preference. `src/vcs/__tests__/*.test.ts`, `scripts/*.cjs`, and `scripts/dogfood-restore.sh` use tabs. `dogfood-restore.sh` is `#!/usr/bin/env bash` — keep bash (existing script; zsh rule applies to new scripts only).
- **No tooling output files into the working tree** (`feedback_avoid_jj_auto_tracked_output`): audit/scanner runs are stdout-only; test fixtures live in mktemp dirs.
- **Fork docs never recommend the upstream installer**: the global-install caveat in SC1 must say `node bin/install.js --claude --global` (from this clone), never `npx get-shit-done-cc@latest`.
- **`commit_docs: true`, `mode: yolo`, `workflow.nyquist_validation: true`** (key present and true → Validation Architecture section required).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CLEANUP-01 | transition.md commit-adjacency + assert_clean_wc gate | §CLEANUP-01 findings: full mutating-step inventory with line numbers, gate pattern source (execute-phase.md:1676-1719), config-set commit gap, banner inventory, launcher/`gsd_run` bootstrap status, audit-baseline impact |
| CLEANUP-03 | dogfood-restore.sh project-root assertion | §CLEANUP-03/04: insertion point, WR-01 literal, test-fixture compatibility proof (fixture already seeds `.planning/STATE.md`) |
| CLEANUP-04 | tar-overlay additive-vs-clean resolution | §CLEANUP-03/04: both options analyzed against the existing node:test; recommendation (b) with rationale |
| CLEANUP-05 | `Array.isArray(plan)` guard + `plan_not_array` envelope | §CLEANUP-05/06: exact insertion point (after router line 1189), envelope convention, vi.mock test harness |
| CLEANUP-06 | `--max-concurrency` NaN guard + contract test | §CLEANUP-05/06: line 1141 hole, line 1145 pattern to mirror, reason-string open decision, harness extension plan |
| CLEANUP-07 | CONFIG-02 afterEach tmpDir cleanup | §CLEANUP-07: exact describe/`it` structure both files, required `let` hoist, import additions, verification command |
| TEST-17 | jj-reap inclusion-filter flake re-verify-then-fix | §TEST-17: current config analysis (5s default gone twice over), reproduction commands, per-test timeout precedent, 15_000 literal conflict, skip-count baseline 22 |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| WC-cleanliness gate + commit adjacency | Workflow markdown (`gsd-core/workflows/transition.md`) | `gsd-tools` CLI bridge (`query commit`, `query diff`, `query phase.complete`) | The orchestrator-agent executes workflow bash fences; mutations happen via bridge verbs, so commits must be grafted into the workflow text, not the CLI |
| Restore-script preconditions | Shell script (`scripts/dogfood-restore.sh`) | node:test (`tests/scripts/dogfood-restore-orphan-cleanup.test.cjs`) | Pure bash hardening; the existing test exercises the production script end-to-end |
| Dispatch input validation | CLI router (`src/vcs-command-router.cts`) | vitest contract tests (`src/vcs/__tests__/`) | Envelopes return BEFORE `createVcsAdapter` — backend-agnostic, testable with vi.mock, no repo fixture needed |
| Test tmpDir hygiene | vitest test files only | — | Zero production code touched |
| Flake re-verification | vitest runner + root `vitest.config.ts` (read-only) | `scripts/check-skip-count.cjs` | Config is locked UNTOUCHED; only a per-test option object may change |

## Standard Stack

No new libraries. Everything needed is already in the tree:

### Core (existing, verified this session)
| Tool | Version | Purpose | Verified |
|------|---------|---------|----------|
| jj | 0.41.0 | colocated VCS; test fixtures `jj git init --colocate` | `jj --version` [VERIFIED: local] |
| node | 26.2.0 | runtime | `node --version` [VERIFIED: local] |
| pnpm | 11.3.0 | package manager (pinned 19-01) | `pnpm --version` [VERIFIED: local] |
| vitest | 3.2.6 (devDep `^3.1.1`) | src/vcs/__tests__ suite | `npx vitest --version` [VERIFIED: local] |
| jq | 1.7.1 | gate fence JSON parsing | `jq --version` [VERIFIED: local] |
| node:test | bundled | tests/ suite via `scripts/run-tests.cjs` | package.json scripts [VERIFIED: repo] |

## Package Legitimacy Audit

**Not applicable** — this phase installs zero external packages. No `npm install`/`pnpm add` occurs in any plan. (Seam check skipped accordingly.)

## CLEANUP-01 — transition.md commit-adjacency + gate

### Mutating-step inventory (verified against the 694-line file)

| # | Step (line) | Mutates | Commit graft needed |
|---|------------|---------|---------------------|
| 1 | `update_roadmap_and_state` (L161-179) | `gsd_run query phase.complete` → ROADMAP.md + STATE.md (+ REQUIREMENTS.md traceability) | YES — immediately after `TRANSITION=$(gsd_run query phase.complete ...)` at L167 |
| 2 | `evolve_project` (L188-273) | PROJECT.md inline edits | YES — at end of step |
| 3 | `graduation_scan` (L275-295) | delegates to `graduation.md`, which writes STATE.md `graduation_backlog` with NO commit of its own (verified: zero `query commit` lines in graduation.md) | covered by #7's STATE.md commit (graduation runs before steps 4-7) |
| 4 | `update_current_position_after_transition` (L297-316) | STATE.md progress bar | one STATE.md commit after #7 covers 3-7 (see below) |
| 5 | `update_project_reference` (L318-333) | STATE.md Project Reference | ↑ |
| 6 | `review_accumulated_context` (L335-377) | STATE.md Accumulated Context | ↑ |
| 7 | `update_session_continuity_after_transition` (L379-397) | STATE.md Session Continuity | YES — single commit sweeping all STATE.md edits incl. graduation backlog |
| 8 | `offer_next_phase` Routes B1 (L552) + B (L606) | `gsd_run query config-set workflow._auto_chain_active false` → `.planning/config.json` | YES — see config-set finding below |

Steps 4-7 are four consecutive STATE.md-only edits; the requirement's phrasing ("STATE.md update" as one logical mutating step) supports ONE commit after step 7 rather than four micro-commits. Recommended messages mirror execute-phase.md style: `docs(phase-${completed_phase}): complete phase via transition` (#1, files: `.planning/ROADMAP.md .planning/STATE.md .planning/REQUIREMENTS.md`), `docs(phase-${completed_phase}): evolve PROJECT.md after transition` (#2, files: `.planning/PROJECT.md`), `docs(phase-${completed_phase}): update STATE.md after transition` (#7, files: `.planning/STATE.md`).

### The config-set commit gap (load-bearing, found this session)

`gsd-tools query config-set` writes `.planning/config.json` via `platformWriteSync` and does NOT commit (`gsd-core/bin/lib/config.cjs:379-426`, unconditional write-back inside `withPlanningLock`) [VERIFIED: repo]. When the auto-chain flag actually flips `true → false` (exactly Route B's scenario at milestone close), config.json genuinely changes on disk AFTER any gate placed before `offer_next_phase`. Two-part fix:

1. Add `gsd_run query commit "chore: clear auto-advance chain flag" --files .planning/config.json || true` immediately after BOTH config-set lines (L552 and L606). The `|| true` mirrors `close_phase_todos`' tolerant style (execute-phase.md:1645) — when the flag was already `false` the rewrite is byte-identical (canonical `JSON.stringify(config, null, 2)` formatting, and this repo's config.json is already in that form), jj sees no change, and the commit becomes a harmless no-op.
2. Place the `assert_clean_wc` gate as a new `<step name="assert_clean_wc">` between `update_session_continuity_after_transition` and `offer_next_phase`. Between gate and banners only read-only queries (`roadmap.analyze` L413, `workstream.list` L432) and the now-committed config-sets run. Document this rationale in the step prose (the SC says "immediately before the terminal banners"; per-route gate duplication across 5 banner variants would be worse — note the deviation explicitly in the plan).

### Terminal banner inventory (all inside `offer_next_phase`, L399-650)

| Route | Mode | Banner | Line |
|-------|------|--------|------|
| A (next phase exists) | yolo | `Phase [X] marked complete.` (×2 variants: CONTEXT exists / not) | L465, L477 |
| A | interactive | `## ✓ Phase [X] Complete` (×2 variants) | L493, L517 |
| B1 (workstream collision) | all | `## ✓ Phase {X}: {Phase Name} Complete` | L565 |
| B (milestone complete) | yolo | `Phase {X} marked complete.` | L612 |
| B | interactive | `## ✓ Phase {X}: {Phase Name} Complete` | L626 |

### Gate pattern to copy (verbatim source)

`gsd-core/workflows/execute-phase.md:1676-1719` — `<step name="assert_clean_wc">` with:
- `DIRTY=$(gsd_run query diff --name-only 2>/dev/null | jq -r '.nameOnly // [] | join("\n")')`
- categorized `PLANNING_DIRTY` / `OTHER_DIRTY` grep split
- `FATAL: working copy is dirty before phase completion.` + per-category diagnostics + remediation list + `exit 1`
- "Why unconditional and not just `.planning/`" prose + "Do not bypass" prose

Adapt the wording for transition: "before declaring transition complete" / list the transition-specific mutating steps in the preamble (the pattern at plan-phase.md:1764-1804 shows how to re-word the case list per workflow). The bash fence in execute-phase uses TABS for indentation inside the fence — copy byte-style.

### `gsd_run` bootstrap status

transition.md already defines `gsd_run` via the full launcher embed at L166 (inside `update_roadmap_and_state`), and already uses bare `gsd_run` in later fences (L304, L413, L432, L552, L606) without re-sourcing. New fences follow the same convention: use `gsd_run` directly, do NOT embed a second launcher. **This matters for the audit baseline:** `scripts/audit-workflow-raw-git.cjs` freezes `'gsd-core/workflows/transition.md': 1` (the single hit is the launcher's deliberate `git rev-parse --show-toplevel` first leg). Adding `gsd_run query ...` fences adds 0 raw-git hits → count stays 1 → green. Adding a second launcher embed would make it 2 → baseline regression → CI-06 gate fails. [VERIFIED: ran audit this session, ok:true]

### Verification approach for SC1 ("synthetic uncommitted file halts the flow")

Extract the gate fence into a temp script (gsd_run resolved via `RUNTIME_DIR` env or the launcher prefix), run it in a throwaway colocated fixture repo (`jj git init --colocate` + seeded `.planning/config.json`, same shape as `tests/scripts/dogfood-restore-orphan-cleanup.test.cjs:seedJjRepo`) with one uncommitted file present → expect exit 1 with `FATAL`; commit the file → expect exit 0. Do NOT create synthetic dirty files in THIS repo's working tree (jj auto-snapshot). The original todo's stale criterion `grep -c "gsd-sdk query diff --name-only"` is superseded by ROADMAP SC1's `gsd_run query diff --name-only` form (gsd-sdk retired by ADR-0174); the modern grep check is `grep -c "gsd_run query diff --name-only" gsd-core/workflows/transition.md` ≥ 1.

### Global-install caveat (SC1 final clause)

`~/.claude/gsd-core/` was last updated from this workspace 2026-06-10; after Phase 18 lands, the installed copy is stale again until the operator runs `node bin/install.js --claude --global` from this clone (never the upstream npx installer — fork rule). Document in the plan's SUMMARY/completion output.

## CLEANUP-05/06 — dispatch-handler guards (`src/vcs-command-router.cts`)

### Verified current state

- Arg loop L1131-1143; `maxConcurrency = Number(args[++i])` at **L1141** — no NaN guard. `--max-concurrency NaN` or `--max-concurrency banana` silently forwards `NaN` to the adapter.
- The pattern to mirror at **L1145**: `if (phaseNumber === undefined || Number.isNaN(phaseNumber)) { return { data: { ok: false, reason: 'phase_number_required' } }; }`
- `plan_required` L1148-1150; `parallelization_disabled` envelope L1164-1175 (config read happens BEFORE plan parse); `plan_json_parse_failed` envelope **L1177-1189**. After the try/catch, `plan` flows straight into `vcs.workspace.parallel.dispatch` at L1192 — `JSON.parse('{"a":1}')`, `'"str"'`, `'42'`, `'null'` all pass unchecked.
- Handler contract: `(args: string[], projectDir: string) → { data: ... }`; exported via `export = { routeVcsCommand, VCS_VERB_TABLE }` at L1493.
- File style: 2-space indent, single quotes, semicolons.

### Insertion points

**CLEANUP-05** — immediately after the parse try/catch (after L1189):

```ts
// Source: peer envelope shapes at vcs-command-router.cts:1145-1189
if (!Array.isArray(plan)) {
  return { data: { ok: false, reason: 'plan_not_array' } };
}
```

(`plan_not_array` reason string is locked by the REQ text.)

**CLEANUP-06** — after the arg loop, adjacent to the L1145 phase guard:

```ts
if (maxConcurrency !== undefined && Number.isNaN(maxConcurrency)) {
  return { data: { ok: false, reason: 'max_concurrency_invalid' } };
}
```

The `!== undefined` leg preserves the D-07 default-undefined contract (absent flag must still forward `undefined` — pinned by `cmd-parallel-max-concurrency-cli.test.ts:132-145`). **Open decision (planner):** the reason string. WR-04 says "the same guard" as `--phase`, but `--phase` folds NaN into `phase_number_required` (a required-field name, wrong connotation for an optional flag). No existing precedent for an invalid-optional-flag reason; `max_concurrency_invalid` is recommended; the contract test pins whatever ships.

### Test harness (exists, ideal)

`src/vcs/__tests__/cmd-parallel-max-concurrency-cli.test.ts` already: loads the handler from `VCS_VERB_TABLE['workspace.parallel.dispatch']` via dynamic `import('../../vcs-command-router.cjs')` with default-interop; `vi.mock('../index.cjs')` replaces `createVcsAdapter` with a recorder (`recordedDispatchOpts`); runs with `projectDir: '/tmp/irrelevant-cwd'` (config read throws → caught → dispatch allowed — verified the handler's catch at L1161-1163 makes missing config a non-issue). **Recommended:** add a sibling `describe` in this same file covering both new envelopes — assert `data.ok === false`, `data.reason` exact, and `recordedDispatchOpts.length === 0` (guard fires BEFORE the adapter). Inputs: `--plan '{"not":"an array"}'` / `'"string"'` / `'42'` / `'null'` for CLEANUP-05; `--max-concurrency NaN` and `--max-concurrency banana` for CLEANUP-06. ≤1 test file touched; no repo fixture, fully deterministic. (Alternative — duplicating into both `cmd-parallel-{jj,git}.test.ts` — is unnecessary: the envelopes are backend-agnostic and return before any adapter exists.)

Note: `scripts/lint-test-file-count.cjs` does NOT scan `src/vcs/__tests__/` (TEST_DIRS = `tests/` + retired `sdk/src`), so even a new file there wouldn't trip it; extending the existing file avoids the question entirely.

### Build question — answered

There is **no `src/vcs-command-router.cjs` on disk** (only `.cts`), so vitest's `import('../../vcs-command-router.cjs')` resolves through vite to the `.cts` source (root `vitest.config.ts` widened esbuild include to `.cts`, A4 verified 19-11). **Vitest contract tests need NO build.** However, the emitted artifact `gsd-core/bin/lib/vcs-command-router.cjs` EXISTS (ADR-457 `tsc -p tsconfig.build.json`, outDir `gsd-core/bin/lib`) and is what `gsd-tools.cjs` requires at runtime — it goes stale after router edits. Run `pnpm run build:lib` after editing the router before any CLI smoke test or node:test run (`pnpm test` runs it automatically via `pretest`; the 19-06 stale-dist module-load error is the cautionary precedent).

## CLEANUP-03/04 — dogfood-restore.sh

### Verified structure (121 lines, bash, tabs, `set -euo pipefail` at L29)

- L25 comment: "Pre-condition: must be run from the project root." — no enforcement.
- L31-45 usage gate (`$# -ne 2`); L47-48 positional parse; L56-63 `run_gsd_tools` with `GSD_TOOLS_BIN` injection seam; L65-68 tarball existence check; **L71 `jj op restore "$PRE_OP_ID"` (first mutation); L74 `tar -xf "$TARBALL_PATH" -C .` (second mutation)**; L96-121 orphan-cleanup + jq count reporting.

**CLEANUP-03 insertion point:** after the tarball check (L68), before L70-71 — guards BOTH mutations. WR-01's literal is the spec:

```bash
[ -f .planning/STATE.md ] || { echo "ERROR: dogfood-restore.sh must run from project root" >&2; exit 1; }
```

(tab-indented to match; `set -e`-safe via the `||` group). Also update the L25 comment to note the check is enforced.

**Test-fixture compatibility — PROVEN SAFE:** `tests/scripts/dogfood-restore-orphan-cleanup.test.cjs` runs the production script with `cwd: fixDir`, and its `seedJjRepo` helper ALREADY writes `.planning/STATE.md` into the fixture with the comment "Synthesizes a placeholder .planning/STATE.md so future Plan 18.02 WR-01 precondition is not retroactively violated" (lines 64-84). Both tests in that file pass the new assertion unmodified. The script's raw-git status is clean (`jj` + `tar` only; `.sh` IS scanned by lint-vcs-no-raw-git — verified 0 violations today).

**CLEANUP-04 options (closed pair from WR-02; discuss/planner picks):**

| Option | Edit | Risk | Test impact |
|--------|------|------|-------------|
| (a) clean overlay | `rm -rf .planning && tar -xf ...` between L71 and L74 | destroys `.planning/` if tarball is partial/corrupt — would want a `tar -tf` integrity pre-check first, which exceeds the WR's text | still passes (assertions never inspect `.planning` content post-run; the fixture tarball carries `.planning/placeholder.txt`) |
| (b) document asymmetry as intended | comment block at L73 explaining: `jj op restore` already rewinds tracked `.planning` state; tar overlay is additive top-up; post-snapshot files surviving is accepted | zero behavior change | none |

**Recommendation: (b).** Phase 14 P05's production run validated restore-then-untar empirically; the asymmetry never bit; (a) adds a destructive step to a recovery primitive — the worst place for new risk. (b) is one comment block, perfectly aligned with the minimal-milestone framing. [VERIFIED: repo history via STATE.md Phase 14 decisions]

## CLEANUP-07 — CONFIG-02 tmpDir leaks

### Verified structure (both files)

- `cmd-parallel-jj.test.ts`: `describe('CONFIG-02 — parallelization_disabled', ...)` at **L778**, three `it`s with `const tmpDir = await mkdtemp(join(tmpdir(), 'gsd-cfg02-jj-${random}-'))` at L780, L809, L842. No afterEach anywhere in the describe.
- `cmd-parallel-git.test.ts`: same-shape describe at **L1007**, `mkdtemp` at L1009, L1038, L1071 (prefix `gsd-cfg02-git-`).
- 3 + 3 = **6 leaked dirs per run** — matches WR-05 exactly.
- Imports (jj file L36-38, git file equivalent): vitest imports `describe, it, expect, beforeAll, afterAll` (NO `afterEach`); `node:fs/promises` imports `mkdtemp, mkdir, writeFile` (NO `rm`). Both files use tabs.

### Required mechanics (the acceptance literal forces this — not scope creep)

`tmpDir` is a per-test `const` inside each `it` body; `afterEach(() => rm(tmpDir, ...))` can't see it. Per file:

1. Add `afterEach` to the vitest import; add `rm` to the `node:fs/promises` import.
2. Inside the CONFIG-02 describe (scoped there — other describes in these files already have their own `beforeAll`/`afterAll` `rmSync` cleanup): hoist `let tmpDir: string;` and change each `const tmpDir = await mkdtemp(...)` to `tmpDir = await mkdtemp(...)`.
3. `afterEach(async () => { await rm(tmpDir, { recursive: true, force: true }); });`

(Sequential test execution within a file makes the shared `let` safe; vitest runs `it`s in a file serially by default.)

### Verification (per SC4 "test-run-then-inspect-tmp")

```bash
ls -d "${TMPDIR:-/tmp}"/gsd-cfg02-* 2>/dev/null | wc -l   # pre-clean any old leaks first
npx vitest run --project unit src/vcs/__tests__/cmd-parallel-jj.test.ts src/vcs/__tests__/cmd-parallel-git.test.ts -t 'CONFIG-02'
ls -d "${TMPDIR:-/tmp}"/gsd-cfg02-* 2>/dev/null | wc -l   # must be 0
```

## TEST-17 — jj-reap inclusion-filter flake

### Verified current state — flake preconditions removed TWICE by 19-11/19-12

The original failure was `Test timed out in 5000ms` under `sdk/vitest.config.ts` full worker parallelism. Root `vitest.config.ts` (fork-owned, 19-11 locked decision) now sets BOTH:
- `maxWorkers: 2` (root-level; the empirical sweet spot — zero birpc RPC starvation, ~110s suite), AND
- `testTimeout: 30_000` + `hookTimeout: 30_000` for the `unit` project (which includes `src/vcs/**/__tests__/**/*.test.{ts,cts}` → `jj-reap.test.ts`).

So the 5s default that fired no longer exists anywhere in the unit project, and the parallel-load condition is capped. The 19-13 phase gate ran the full suite green: **vitest 612/612 both backends, exit 0**. Verdict (b) resolved-by-restructure is the expected outcome; the 3+ recorded runs are the required evidence.

`jj-reap.test.ts` structure: `describe.skipIf(!jjAvailable)` wrapping 5 sequential `it`s sharing a `beforeAll` fixture repo; the inclusion-filter test at **L79-94** has no per-test timeout (inherits the project 30s). File uses tabs.

### Reproduction commands (for the re-verify gate)

```bash
# Full suite, both backends — the 19-13 phase-gate form; run 3+ times, record pass/fail + duration
GSD_TEST_BACKENDS=git,jj npx vitest run

# Default-backend full suite (19-11 baseline: 578 passed / 11 skipped)
npx vitest run

# The original Phase 14 regression-gate 3-file shape (modern paths)
npx vitest run src/vcs/__tests__/jj-reap.test.ts src/vcs/__tests__/cmd-parallel-jj.test.ts src/vcs/__tests__/cmd-parallel-git.test.ts

# Isolation control (todo recorded 636ms in isolation)
npx vitest run --project unit src/vcs/__tests__/jj-reap.test.ts -t 'inclusion-filter'
```

### If it DOES reproduce — fix-shape findings

- **Per-test timeout precedent (suite-wide, 15+ occurrences):** the options-object form `it('...', { timeout: 30000 }, () => {...})` — e.g. `cmd-parallel-jj.test.ts:141`, `cmd-parallel-cancel-git.test.ts:97`. Use this form, NOT the deprecated trailing-number form.
- **⚠️ The REQUIREMENTS literal `it(..., 15_000)` is now a timeout REDUCTION:** the unit project default is already 30_000. A meaningful extension must exceed 30s (e.g. `{ timeout: 60_000 }`). The 15_000 figure predates 19-11; honoring its intent (extend headroom) requires updating the number — flag this in the plan and record the deviation, staying within the ≤5 LOC / ≤1 file / config-untouched envelope.
- A timeout at 30s under maxWorkers:2 would indicate a real hang, not load latency — that finding would warrant the `{ concurrent: false }`-style fallback investigation rather than a bigger number (but vitest runs same-file `it`s serially already, so a genuine 30s hang means root-causing, and the narrow-fix envelope says record it and pick the least-invasive option).

### check-skip-count facts

`scripts/check-skip-count.cjs`: counts `(it|test|describe).skip`, `x(it|describe|test)`, `.todo` across all `*.test.{cjs,ts,mjs,js}`; `describe.skipIf` is NOT counted (`\b` boundary fails on `skipIf`); exempt annotation `// allow-skip: <reason>`; compares vs `origin/main` via raw git (script is allowlisted); warns-and-passes locally when `origin/main` unavailable, hard-fails under `CI=true`. Current baseline: **22** (19-13 evidence). None of the planned edits add skip patterns.

## Lint gates — baseline status (all run this session, 2026-06-10)

| Gate | Command | Status today | Phase-18 exposure |
|------|---------|--------------|-------------------|
| no-raw-git | `node scripts/lint-vcs-no-raw-git.cjs` | ok, 1073 files, 0 violations | scans `.sh` (dogfood-restore edits must stay git-free — they do: jj+tar only) and `.cts` (router has no git). Does NOT scan `.md` (`SCAN_EXT` = cjs/cts/js/mjs/ts/yml/yaml/sh/bash) — transition.md edits cannot trip it. `src/vcs/__tests__/**` + `tests/**/*.test.cjs` are allowlisted globs |
| no-commit-id | `node scripts/lint-vcs-no-commit-id.cjs` | ok, 1026 files, 0 violations | no planned edit touches revision-id surfaces |
| parallel-call-presence | `node scripts/lint-vcs-parallel-call-presence.cjs` | ok, 107 files, 0 violations | transition.md gains NO `workspace.parallel.*` literals (commit/diff/config-set only) → no pairing obligation created |
| audit-workflow-raw-git | `node scripts/audit-workflow-raw-git.cjs` | ok (230-hit frozen baseline; transition.md = 1) | adding `gsd_run` fences = +0 hits; adding a second launcher embed = REGRESSION. Don't. |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WC-dirty detection in workflow | new jj/git status parsing | the execute-phase.md:1686 fence verbatim (`gsd_run query diff --name-only` + jq) | cross-backend, already battle-tested by Phases 15-17 + 19 gates |
| Committing planning docs | raw `jj squash`/`jj describe` in fences | `gsd_run query commit "<msg>" --files <paths>` | jj-safe post-B-08; hooks fire correctly; matches 16 existing call sites |
| Dispatch-handler test fixtures | real jj/git repos for envelope tests | the `vi.mock('../index.cjs')` recorder harness in cmd-parallel-max-concurrency-cli.test.ts | envelopes return before `createVcsAdapter`; mock makes tests deterministic and subprocess-free |
| Gate verification fixture | scripting against this repo's WC | throwaway `jj git init --colocate` mktemp repo (seedJjRepo shape) | jj auto-snapshot makes in-repo synthetic dirt hazardous |

## Common Pitfalls

### Pitfall 1: Second launcher embed in transition.md
**What goes wrong:** copying execute-phase's gate step including its launcher bootstrap line adds a raw `git rev-parse` hit → audit-workflow-raw-git baseline regression (1 → 2) → CI-06 gate red.
**How to avoid:** transition.md's launcher already exists at L166; all new fences use bare `gsd_run` like L304/L413/L552 already do.
**Warning sign:** `node scripts/audit-workflow-raw-git.cjs` exits 1 naming transition.md.

### Pitfall 2: Gate passes, banner still lies (config-set dirt)
**What goes wrong:** gate placed before `offer_next_phase` while Routes B1/B's `config-set workflow._auto_chain_active false` (L552/L606) dirties config.json after the gate on real `true → false` flips.
**How to avoid:** commit-adjacency for both config-set call sites (`--files .planning/config.json || true`).
**Warning sign:** milestone-close transition leaves `.planning/config.json` dirty.

### Pitfall 3: afterEach without the `let` hoist
**What goes wrong:** pasting the acceptance-criteria `afterEach` literal next to per-`it` `const tmpDir` doesn't compile / references undefined variable.
**How to avoid:** hoist `let tmpDir` to describe scope first (see §CLEANUP-07 mechanics).

### Pitfall 4: Testing router edits against the stale emitted artifact
**What goes wrong:** CLI smoke (`gsd-tools query workspace parallel.dispatch ...`) or node:test run exercises `gsd-core/bin/lib/vcs-command-router.cjs` built BEFORE the edits → guards appear missing.
**How to avoid:** `pnpm run build:lib` after router edits; vitest alone doesn't need it (resolves `.cts` source).
**Warning sign:** vitest green but CLI/node:test behaviors diverge (19-06 precedent).

### Pitfall 5: TEST-17 fix shrinks the timeout
**What goes wrong:** applying the REQUIREMENTS' literal `15_000` REDUCES the effective timeout from the project's 30_000 default.
**How to avoid:** if (and only if) the flake reproduces, extend beyond 30_000 using the `{ timeout: N }` options-object precedent; record the deviation from the stale literal.

### Pitfall 6: Scope creep past the closed acceptance sets
**What goes wrong:** "while I'm here" additions (e.g., a workflow-text regression test for the transition gate mirroring `tests/bug-2384-post-merge-deletion-audit.test.cjs`, fixing the 5 info findings, refactoring CONFIG-02 fixtures).
**How to avoid:** v1.4 Pitfall 1 — todos' acceptance criteria are the spec. The bug-2384-style pin test is OPTIONAL planner discretion, not required; the 5 info findings are opportunistic-only (the `dogfood-restore.sh`-adjacent ones are NOT triggered since none of the 5 touch that file's edited regions... verify per-finding at plan time if tempted — default is skip).

## Code Examples

### Commit-adjacency graft (mirrors execute-phase.md:1573-1577)

```bash
# Source: gsd-core/workflows/execute-phase.md:1569-1577 (surviving pattern)
TRANSITION=$(gsd_run query phase.complete "${current_phase}")
gsd_run query commit "docs(phase-${current_phase}): complete phase via transition" --files .planning/ROADMAP.md .planning/STATE.md .planning/REQUIREMENTS.md
```

Plus the load-bearing-order prose: "The commit line above MUST run immediately after `phase.complete` — the mutating verb writes to disk but does NOT commit."

### Gate fence (copy-adapt from execute-phase.md:1685-1709; tabs inside fence)

```bash
DIRTY=$(gsd_run query diff --name-only 2>/dev/null | jq -r '.nameOnly // [] | join("\n")')
if [ -n "$DIRTY" ]; then
	PLANNING_DIRTY=$(echo "$DIRTY" | grep -E '^\.planning/|-SUMMARY\.md$|-VERIFICATION\.md$' || true)
	OTHER_DIRTY=$(echo "$DIRTY" | grep -vE '^\.planning/|-SUMMARY\.md$|-VERIFICATION\.md$' || true)
	echo "FATAL: working copy is dirty before transition completion." >&2
	# ... categorized diagnostics + remediation list, exit 1 (full text at execute-phase.md:1692-1707)
	exit 1
fi
```

### Router guards (style-matched: 2-space, single quotes, semicolons)

```ts
// CLEANUP-06 — after the arg loop (~L1144), peer to the L1145 phase guard:
if (maxConcurrency !== undefined && Number.isNaN(maxConcurrency)) {
  return { data: { ok: false, reason: 'max_concurrency_invalid' } };
}

// CLEANUP-05 — after the plan_json_parse_failed try/catch (~L1190):
if (!Array.isArray(plan)) {
  return { data: { ok: false, reason: 'plan_not_array' } };
}
```

### Contract test shape (extends the existing vi.mock harness)

```ts
// Source: src/vcs/__tests__/cmd-parallel-max-concurrency-cli.test.ts:73-106
it('returns {ok:false, reason:plan_not_array} for a JSON object plan; adapter never called', async () => {
	recordedDispatchOpts.length = 0;
	const dispatch = await loadWorkspaceParallelDispatchVerb();
	const res = await dispatch(['--phase', '18', '--plan', '{"not":"an array"}'], '/tmp/irrelevant-cwd');
	const data = res.data as { ok?: boolean; reason?: string };
	expect(data.ok).toBe(false);
	expect(data.reason).toBe('plan_not_array');
	expect(recordedDispatchOpts.length).toBe(0);
});
```

## Runtime State Inventory

Not a rename/migration phase, but the CLEANUP-01 target is a live workflow — checked the analogous categories:

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Installed global copy | `~/.claude/gsd-core/workflows/transition.md` carries the pre-fix text until reinstall | Document operator action `node bin/install.js --claude --global` (SC1 clause) — no plan task beyond documenting |
| Emitted build artifacts | `gsd-core/bin/lib/vcs-command-router.cjs` (gitignored, ADR-457) goes stale after router edits | `pnpm run build:lib` in plan 18.02 verification |
| Stored data / service config / secrets | None — no datastore, service, or env-var references any edited surface | None (verified: edits are file-local) |

## State of the Art (re-scope deltas the planner must respect)

| Old (v1.4 todo wording) | Current (post-Phase-19 tree) | Changed | Impact |
|--------------------------|------------------------------|---------|--------|
| `./get-shit-done/workflows/transition.md:166` | `gsd-core/workflows/transition.md` (upstream rewrite, 694 lines) | 19-03/19-08 | fix now ADDS commit steps, not just reorders |
| `gsd-sdk query diff --name-only` grep criterion | `gsd_run query diff --name-only` | ADR-0174 SDK retirement | acceptance grep re-expressed (ROADMAP SC1) |
| `sdk/src/query/workspace-parallel-dispatch.ts` | `src/vcs-command-router.cts` `VCS_VERB_TABLE['workspace.parallel.dispatch']` | 19-06 PORT-02 | guards + tests target the router |
| `sdk/vitest.config.ts`, 5s default timeout | root `vitest.config.ts`, `maxWorkers: 2`, unit `testTimeout: 30_000` | 19-11 | TEST-17 re-verify gate; `15_000` literal stale |
| `gsd-sdk` PATH shim in dogfood-restore tests | `GSD_TOOLS_BIN` injection seam | 19-11 | fixture already seeds `.planning/STATE.md` for WR-01 |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A single STATE.md commit after `update_session_continuity_after_transition` satisfies "each mutating step gains an immediate commit" for the 4-step STATE.md cluster (steps 4-7 + graduation backlog) | CLEANUP-01 | Low — if the verifier reads "each step" literally, split into per-step commits (mechanical) |
| A2 | `max_concurrency_invalid` is an acceptable reason string (no precedent exists for invalid-optional-flag envelopes) | CLEANUP-06 | None functional — contract test pins whatever ships; rename is trivial pre-merge |
| A3 | Option (b) documented-asymmetry is acceptable for CLEANUP-04 (REQ explicitly allows either) | CLEANUP-03/04 | None — (a) clean overlay also passes the existing test if chosen; both analyzed |
| A4 | TEST-17 will not reproduce (config changed twice over; 19-13 ran 612/612 green) | TEST-17 | None — the re-verify-first gate handles both verdicts by design |

All other claims in this document are [VERIFIED: repo] via direct file reads, line-number confirmation, or live command runs this session.

## Open Questions

1. **CLEANUP-06 reason string** — `max_concurrency_invalid` (recommended) vs `max_concurrency_nan` vs folding into a generic envelope. What we know: peer reasons are snake_case (`phase_number_required`, `plan_json_parse_failed`). Recommendation: planner locks `max_concurrency_invalid`; the contract test pins it.
2. **Gate placement vs "immediately before the banners"** — single gate step before `offer_next_phase` + committed config-sets (recommended) vs per-route gates duplicated across 5 banner variants. Recommendation: single step + explicit prose noting the read-only-queries-and-committed-config-set gap; record as a plan decision.
3. **CLEANUP-01 mode of SC1 verification** — fixture-repo script-extraction (recommended, see §verification) vs live-repo synthetic file (hazardous under jj auto-snapshot). Recommendation: fixture repo.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| jj | test fixtures, gate verification, this repo's VCS | ✓ | 0.41.0 | — (tests `describe.skipIf(!jjAvailable)` would skip, but it's present) |
| node | everything | ✓ | 26.2.0 | — |
| pnpm | build:lib, vitest invocation | ✓ | 11.3.0 | — |
| vitest | 18.02 contract tests, 18.03 runs | ✓ | 3.2.6 | — |
| jq | gate fence, dogfood-restore counts | ✓ | 1.7.1 | script has a documented "?" fallback |
| gsd-tools bridge | commit verb, query diff, phase.complete | ✓ | `gsd-core/bin/gsd-tools.cjs` + emitted lib present | — |

**Missing dependencies:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Frameworks | vitest 3.2.6 (`src/vcs/__tests__`, root `vitest.config.ts`, unit+integration projects) + node:test (`tests/`, via `scripts/run-tests.cjs`) |
| Config files | `vitest.config.ts` (LOCKED — must remain untouched per TEST-17), `tsconfig.build.json` |
| Quick run command | `npx vitest run --project unit <file> [-t '<pattern>']` |
| Full suite commands | `GSD_TEST_BACKENDS=git,jj npx vitest run` (~110s, 612 tests) and `pnpm test` (node:test, runs `build:lib` via pretest) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLEANUP-01 | gate halts on dirty WC; commits adjacent to mutations | scripted fixture check + grep | `grep -c 'gsd_run query diff --name-only' gsd-core/workflows/transition.md` ≥ 1; fixture-repo gate script exits 1 dirty / 0 clean; `node scripts/audit-workflow-raw-git.cjs` exit 0 | ❌ Wave 0 (fixture script is ephemeral, not committed — stdout-only rule) |
| CLEANUP-03 | wrong-cwd run aborts pre-mutation | manual-equivalent: `cd /tmp && bash <repo>/scripts/dogfood-restore.sh x y` → exit 1 with ERROR; existing node:test stays green | `node --test tests/scripts/dogfood-restore-orphan-cleanup.test.cjs` | ✅ |
| CLEANUP-04 | overlay semantics resolved | (b): comment-only, verified by review + existing test green | same as CLEANUP-03 | ✅ |
| CLEANUP-05 | `plan_not_array` envelope | unit (vi.mock) | `npx vitest run --project unit src/vcs/__tests__/cmd-parallel-max-concurrency-cli.test.ts` | ❌ Wave 0 — new `it`s in existing file |
| CLEANUP-06 | NaN `--max-concurrency` rejected; absent-flag undefined contract preserved | unit (vi.mock) | same file; existing D-07 test at L132 must stay green | ❌ Wave 0 — new `it`s in existing file |
| CLEANUP-07 | zero `gsd-cfg02-*` dirs after run | targeted run + tmp inspect | see §CLEANUP-07 verification block | ✅ (edits to existing describes) |
| TEST-17 | inclusion-filter stable under full-suite load | 3+ full-suite runs | `GSD_TEST_BACKENDS=git,jj npx vitest run` ×3, exit 0 each; `node scripts/check-skip-count.cjs` green (baseline 22) | ✅ |

### Sampling Rate
- **Per task commit:** targeted vitest file run (or grep/audit for the workflow plan)
- **Per plan merge:** `GSD_TEST_BACKENDS=git,jj npx vitest run` + the four lint gates
- **Phase gate:** full vitest suite + `pnpm test` (node:test) + all four lint gates + `scripts/check-skip-count.cjs` green before `/gsd-verify-work`

### Wave 0 Gaps
- New contract `it`s in `src/vcs/__tests__/cmd-parallel-max-concurrency-cli.test.ts` — cover CLEANUP-05/06 envelopes (written GREEN alongside the guards per Pitfall 10 per-WR commit structure; this is a guard-addition, not TDD-RED territory — the guards and their pins land in the same per-WR commit)
- Ephemeral fixture-repo gate script for CLEANUP-01 SC1 verification (run-and-discard; never written into the working tree)

## Security Domain

`security_enforcement` is not disabled in config (absent = enabled), but this phase's surface is narrow:

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | CLEANUP-05/06 ARE input-validation hardening: `Array.isArray` + `Number.isNaN` guards on CLI-boundary JSON/argv inputs, fail-closed envelopes |
| V2/V3/V4 Auth/Session/Access | no | local CLI tooling, no auth surface |
| V6 Cryptography | no | none touched |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed plan JSON reaching the adapter (object/string/number/null) | Tampering/DoS | the CLEANUP-05 guard (this phase's deliverable) |
| NaN concurrency cap propagating into scheduling | DoS | the CLEANUP-06 guard |
| `tar -xf` into the wrong cwd (path-relative extraction outside project root) | Tampering | the CLEANUP-03 root assertion before both mutations |
| Prototype pollution via config keys | Tampering | already guarded in `config.cjs:399-414` (no action) |

## Sources

### Primary (HIGH confidence — direct reads/runs this session)
- `gsd-core/workflows/transition.md` (all 694 lines), `execute-phase.md:1569-1779`, `plan-phase.md:1755-1824`, `graduation.md` (grep)
- `src/vcs-command-router.cts:110-145, 1080-1260, 1480-1496`; `gsd-core/bin/lib/config.cjs:379-560`
- `src/vcs/__tests__/{cmd-parallel-jj,cmd-parallel-git,cmd-parallel-max-concurrency-cli,jj-reap}.test.ts`; `vitest.config.ts`; `src/vcs/backends.cts:160-191`
- `scripts/{dogfood-restore.sh,check-skip-count.cjs,audit-workflow-raw-git.cjs,lint-vcs-no-raw-git.cjs,lint-vcs-parallel-call-presence.cjs,lint-test-file-count.cjs}`; `scripts/lint-vcs-no-raw-git.allow.json`; `tests/scripts/dogfood-restore-orphan-cleanup.test.cjs`; `tsconfig.build.json`; `package.json`
- Live runs: all four lint/audit gates (green), tool version probes
- `.planning/{REQUIREMENTS,ROADMAP,STATE}.md`, the 3 source todos, Phase 19 SUMMARYs (19-11/19-12/19-13 — vitest commands, 612/612 evidence, skip-count 22)

### Secondary / Tertiary
- None — no external sources used or needed.

## Metadata

**Confidence breakdown:**
- CLEANUP-01 mechanics: HIGH — pattern source + target file read in full; config-set gap verified in code
- CLEANUP-03..07 mechanics: HIGH — every line number re-verified; test-fixture compatibility proven from fixture source
- TEST-17 verdict prediction: MEDIUM-HIGH — config analysis is solid, but "not reproducible" is by definition only provable by the 3+ runs the plan will execute
- Lint-gate exposure: HIGH — gates executed live at baseline

**Research date:** 2026-06-10
**Valid until:** next upstream pull or any edit to the audited files (line numbers are load-bearing; re-verify offsets at execute time if other work lands first)
