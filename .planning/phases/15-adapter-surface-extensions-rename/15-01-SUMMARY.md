---
phase: 15-adapter-surface-extensions-rename
plan: 01
subsystem: vcs-adapter
tags: [rename, vcs-adapter, audit, hard-rename, naming, capability-matrix]

# Dependency graph
requires:
  - phase: 14.1-drop-mandatory-bookmark-on-parallel-dispatch-fan-in-emergenc
    provides: stable VcsAdapter surface post-PARALLEL-08 (no in-flight types.ts churn)
provides:
  - VcsRefs.rootRevisions(opts) method (renamed from rootCommits — identical shape)
  - BACKENDS_AVAILABLE_FOR_VERB['refs.rootRevisions'] capability matrix entry (Pitfall 3 flip)
  - One-shot audit script scripts/audit-root-commits-rename.cjs (stdout-only)
  - Audit JSON sidecar at .planning/phases/15-adapter-surface-extensions-rename/rootCommits-rename-audit.json (D-09 schema)
  - Regression test in sdk/src/vcs/__tests__/backends.test.ts guarding capability-matrix string-literal flip
affects: [15-02-idAlphabet, 15-03-matchPrefix, 15-04-cancel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pattern S6: Hard-rename atomic-commit + pre-audit gate (Pitfall 1 + Pattern 1)"
    - "Pattern S3: Frozen pure-JSON return shape preservation through rename"

key-files:
  created:
    - scripts/audit-root-commits-rename.cjs
    - tests/scripts/audit-root-commits-rename.test.cjs
    - .planning/phases/15-adapter-surface-extensions-rename/rootCommits-rename-audit.json
  modified:
    - sdk/src/vcs/types.ts (line 363, interface flip)
    - sdk/src/vcs/backends.ts (line 79, capability-matrix string literal flip)
    - sdk/src/vcs/backends/jj.ts (line 964, object-literal key)
    - sdk/src/vcs/backends/git.ts (lines 526 + 564, const + spread short-hand)
    - sdk/src/query/progress.ts (lines 288 + 293)
    - get-shit-done/bin/lib/commands.cjs (lines 998 + 1005, v1.2 retro CR-01 surface)
    - tests/__tools__/capture-vcs-baselines.cjs (line 414)
    - sdk/src/vcs/__tests__/git-backend.test.ts (lines 414 + 419)
    - sdk/src/vcs/__tests__/jj-skeleton.test.ts (lines 147 + 148)
    - sdk/src/vcs/__tests__/jj-refs.test.ts (lines 162 + 215-220)
    - sdk/src/vcs/__tests__/baseline-parity.test.ts (lines 234 + 238)
    - sdk/src/vcs/__tests__/backends.test.ts (new Phase 15.01 describe block)
    - sdk/dist-cjs/vcs/types.d.ts (+ .map, rebuilt)
    - sdk/dist-cjs/vcs/backends.js (+ .map, rebuilt)
    - sdk/dist-cjs/vcs/backends/git.js (+ .map, rebuilt)
    - sdk/dist-cjs/vcs/backends/jj.js (+ .map, rebuilt)

key-decisions:
  - "Audit JSON sidecar path uses slug-matched form (.planning/phases/15-adapter-surface-extensions-rename/) rather than CONTEXT D-09 numeric form — recorded in <deviations>"
  - "Audit script EXCLUDE_FILES carve-out for audit-root-commits-rename.cjs and its sibling test (the script's own JSDoc references the literal rootCommits string; this is a self-reference, not an API consumer)"
  - "Added dist directory to EXCLUDE_DIRS — TSC build emits sdk/dist/ alongside sdk/dist-cjs/, both regenerated post-rename"
  - "Test 'script run: specialCases includes backends.ts:79' rewritten to be conditional on live state (Rule 1 fix discovered post-rename — the unconditional pre-rename assertion correctly failed once the literal was renamed)"

patterns-established:
  - "Pattern S6 lock-in: per-extension grep gate exits 0 across *.ts/*.cjs/*.js/*.json with carve-out for .md historical-prose files registered in specialCases"
  - "specialCases dual-purpose: (a) Pitfall 3 anchors (capability-matrix string literals), (b) per-file historical-prose carve-outs with reason strings"

requirements-completed: [NAMING-01]

# Metrics
duration: 23min
completed: 2026-05-24
---

# Phase 15 Plan 01: rootCommits → rootRevisions hard rename Summary

**Hard-rename `rootCommits` → `rootRevisions` across 21 code sites + capability-matrix string literal, gated by stdout-only D-09 grouped-by-extension audit JSON with adjacent audit/rename commits and runtime regression test guarding the string-literal flip.**

## Performance

- **Duration:** ~23 min
- **Started:** 2026-05-25T00:34:00Z (approx)
- **Completed:** 2026-05-25T00:55:00Z (approx)
- **Tasks:** 3 (plan-defined) + 1 dist regen + 1 follow-up test fix = 5 commits
- **Files modified/created:** 14 source files + 3 new artifacts + 8 dist-cjs files + 1 audit-test fix = 26 total

## Accomplishments

- Clean `rootRevisions`-only namespace across SDK adapter surface, both backends, capability matrix, production CJS callers, and SDK tests
- Pitfall 3 string-literal flip at `sdk/src/vcs/backends.ts:79` proven correct via runtime anti-assertion in new regression test
- v1.2 retro CR-01 surface (`commands.cjs:1005`) flipped in the same atomic commit as the TS interface
- Pre-rename audit JSON sidecar persists provenance: 35 total hits (18 ts, 3 cjs, 14 md historical-prose) with D-12 idempotency MD5 hash
- D-12 audit/rename adjacency invariant honored: audit commit `knkomvnq` is the IMMEDIATE parent of rename commit `uuvkptzs`
- `dist-cjs/` regenerated cleanly: `types.d.ts` declares `rootRevisions` and contains 0 `rootCommits`

## Task Commits

Each task committed atomically in adjacency order:

1. **Task 1: Pre-rename audit script + node:test cases + sidecar** — `knkomvnqwuqp` (chore)
   - `scripts/audit-root-commits-rename.cjs` (stdout-only, D-13 enforcement)
   - `tests/scripts/audit-root-commits-rename.test.cjs` (19 node:test cases)
   - `.planning/phases/15-adapter-surface-extensions-rename/rootCommits-rename-audit.json` (D-09 envelope)

2. **Task 2: Hard rename across 11 source files** — `uuvkptzskpxv` (refactor)
   - TS interface: types.ts:363
   - Capability matrix: backends.ts:79
   - jj backend: backends/jj.ts:964
   - git backend: backends/git.ts:526,564
   - CJS callers: progress.ts, commands.cjs, capture-vcs-baselines.cjs
   - SDK tests: git-backend, jj-skeleton, jj-refs, baseline-parity (4 files)

3. **Task 2 build artifact: regenerate dist-cjs** — `losskuwuxqsr` (build)
   - 8 dist-cjs files (.js + .map + types.d.ts + .map)

4. **Task 3: Regression test for capability-matrix flip** — `omkuytzvkxxn` (test)
   - `sdk/src/vcs/__tests__/backends.test.ts` (new Phase 15.01 describe block; 2 tests)

5. **Follow-up: audit test live-state tolerance fix** — `lkqkpnukstsu` (fix)
   - `tests/scripts/audit-root-commits-rename.test.cjs` (Rule 1 auto-fix; see Deviations)

## Files Created/Modified

### Created (3)
- `scripts/audit-root-commits-rename.cjs` — one-shot stdout-only audit emitter. Discarded post-milestone.
- `tests/scripts/audit-root-commits-rename.test.cjs` — 19 node:test cases for audit-script shape invariants.
- `.planning/phases/15-adapter-surface-extensions-rename/rootCommits-rename-audit.json` — D-09 grouped-by-extension audit sidecar with idempotencyHash MD5.

### Modified (14)
- `sdk/src/vcs/types.ts` — VcsRefs.rootCommits → rootRevisions (1-line interface rename)
- `sdk/src/vcs/backends.ts` — capability matrix string-key flip at :79
- `sdk/src/vcs/backends/jj.ts` — refs object-literal key rename at :964
- `sdk/src/vcs/backends/git.ts` — const declaration + spread short-hand rename (:526, :564)
- `sdk/src/query/progress.ts` — comment + call-site renames (:288, :293)
- `get-shit-done/bin/lib/commands.cjs` — v1.2 retro CR-01 surface (:998, :1005)
- `tests/__tools__/capture-vcs-baselines.cjs` — adapter-equivalent comment (:414)
- `sdk/src/vcs/__tests__/git-backend.test.ts` — describe + it bodies (:414, :419)
- `sdk/src/vcs/__tests__/jj-skeleton.test.ts` — wired-in test (:147, :148)
- `sdk/src/vcs/__tests__/jj-refs.test.ts` — describe header + multiple it bodies (:162, :215-220)
- `sdk/src/vcs/__tests__/baseline-parity.test.ts` — comment + call-site (:234, :238)
- `sdk/src/vcs/__tests__/backends.test.ts` — new Phase 15.01 describe block (Task 3)
- `sdk/dist-cjs/vcs/types.d.ts` + 7 sibling .js / .map files (build artifact)

## Decisions Made

- **Audit script EXCLUDE_FILES carve-out**: Both `audit-root-commits-rename.cjs` and `audit-root-commits-rename.test.cjs` reference the literal substring `rootCommits` in JSDoc / file headers / test descriptions. These are self-references (the script's own purpose statement names the rename target); not API consumers. Adding them to a basename-level exclude keeps the post-rename grep gate clean.
- **`dist/` added to EXCLUDE_DIRS**: TSC builds emit both `sdk/dist/` and `sdk/dist-cjs/`. The original CONTEXT D-13 list only named `dist-cjs`; the live tree has both. Adding `dist` prevents stale-symbol pollution from showing up in totalCount.
- **Per-file specialCases historical-prose entries surface during audit**: All 5 in-scope `.md` files (PROJECT.md, STATE.md, ROADMAP.md, REQUIREMENTS.md, 14.1-01-SUMMARY.md) appear once per file in `specialCases` with per-file reason strings (plan truths #15-19). The grep gate is consequently 0 across all 4 code extensions; the 5 md files are explicitly registered as carve-outs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Audit test 'script run: specialCases includes backends.ts:79' too tight**

- **Found during:** Final end-to-end verification (after all 3 tasks committed)
- **Issue:** The test unconditionally asserts that the audit script's live run surfaces a capability-matrix entry at `backends.ts:79`. That assertion holds PRE-rename (the literal is there) but breaks POST-rename (the literal was renamed in Task 2). Post-rename the live grep correctly returns zero hits at `backends.ts:79`, so `specialCases` doesn't contain the entry — and the test failed.
- **Fix:** Renamed the test to `'script run: specialCases capability-matrix entry reflects live state'` and made the assertion conditional: IF the live tree has a hit at `backends.ts:79` → assert specialCases surfaces it; IF NOT → assert specialCases does NOT contain it (no false-positive). The synthetic-input contract (the audit script CORRECTLY surfaces the entry when its input includes such a hit) was already covered by a separate pure-function test (`buildSpecialCases surfaces backends.ts:79 capability-matrix-string-literal`).
- **Files modified:** `tests/scripts/audit-root-commits-rename.test.cjs`
- **Verification:** `node --test tests/scripts/audit-root-commits-rename.test.cjs` exits 0 (19/19 pass; was 18/19).
- **Committed in:** `lkqkpnukstsu` (separate fix commit, follow-up to Task 3)

**2. [Rule 3 - Blocking] Audit script grep portability — BSD vs GNU**

- **Found during:** Task 1 initial run of `scripts/audit-root-commits-rename.cjs`
- **Issue:** First draft used `grep -rnP "<pattern>"` (PCRE), which BSD/macOS grep does not support (`grep: invalid option -- P`).
- **Fix:** Switched to POSIX extended regex with `spawnSync('grep', ['-rnE', PATTERN, ...])`. `\b` word-boundary anchors work in both BSD and GNU grep with `-E`. Removed shell quoting concerns by avoiding `shell: true`. Added `dist` to EXCLUDE_DIRS at the same time (TSC build emits both `dist/` and `dist-cjs/`).
- **Files modified:** `scripts/audit-root-commits-rename.cjs` (in-progress pre-commit)
- **Verification:** Audit script runs cleanly on macOS BSD grep + Linux GNU grep both produce 35-hit output with identical shape.
- **Committed in:** `knkomvnqwuqp` (rolled into Task 1 audit commit)

**3. [Rule 2 - Missing critical] Audit script self-reference exclusion**

- **Found during:** Task 1 initial audit emission
- **Issue:** First run showed 38 hits — 3 extra came from the audit script and its sibling test (JSDoc comments naming `rootCommits` as the rename target). These are NOT API consumers but would pollute the post-rename grep gate (they intentionally name the literal as part of their purpose).
- **Fix:** Added `EXCLUDE_FILES = ['audit-root-commits-rename.cjs', 'audit-root-commits-rename.test.cjs']` and wired the basename-level `--exclude=` flag into `spawnSync` argv. Re-emit reduces to 35 hits (matches the in-scope manual grep count).
- **Files modified:** `scripts/audit-root-commits-rename.cjs` (in-progress pre-commit)
- **Verification:** `totalCount` matches manual grep: 35 = 18 ts + 3 cjs + 14 md.
- **Committed in:** `knkomvnqwuqp` (rolled into Task 1 audit commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 1 blocking, 1 missing critical)
**Impact on plan:** All three deviations were necessary for correctness. None expanded scope — they fixed (1) a too-tight test, (2) a portability constraint, (3) a self-reference false-positive. The plan's must_haves contract is fully satisfied.

## Issues Encountered

- **Parallel vitest hook timeout (pre-existing, infrastructure):** Running `pnpm vitest run` across 4 jj-spawning test files in parallel intermittently trips a 10s `beforeAll` hook timeout in `jj-refs.test.ts:150`. This is a known pre-existing parallel-test infrastructure issue (cf. memory `project_test_perf_pain_vitest` + `project_golden_parity_failures_block_03_1`). Confirmed unrelated to the rename: (a) the file passes individually (`pnpm vitest run jj-refs.test.ts` → 31/31 in 4.4s), (b) the file passes serially in the focused suite (`--no-file-parallelism` → 166/166 in 21s), (c) the timeout is in `mkdtempSync` + `execSync('jj git init --colocate')` setup, not in any code touched by this plan. Out of scope for this plan; deferred-items territory.

## Threat Mitigations Honored

Per the plan's `<threat_model>`:

| Threat ID | Mitigation Status | Evidence |
|-----------|-------------------|----------|
| T-15.01-01 (Tampering: backends.ts:79 string literal) | Mitigated | Audit JSON specialCases entry surfaces the line explicitly pre-rename; new `backends.test.ts` describe block asserts presence of `'refs.rootRevisions'` + anti-asserts absence of `'refs.rootCommits'` (load-bearing). |
| T-15.01-02 (Tampering: CJS callers) | Mitigated | Audit JSON `byExtension.cjs` enumerates `commands.cjs:998,1005` + `capture-vcs-baselines.cjs:414`; per-extension grep gate exits 0 across `*.cjs` post-rename. |
| T-15.01-03 (Tampering: audit sidecar jj-tracked) | Mitigated | Audit script is stdout-only (Pitfall 8); zero `fs.write*`/`fs.append*` actual call sites (only JSDoc references the contract); sidecar written by shell `>` redirection in audit task. Audit + sidecar committed together in `knkomvnq` separately from the rename `uuvkptzs` (adjacent commits). |
| T-15.01-04 (Tampering: new refs between audit and rename) | Mitigated | D-12 `idempotencyHash` MD5 over sorted `{file,line}` tuples + per-extension counts. Re-running audit during rename prep would change the hash if a new ref landed. Commit adjacency confirms zero intervening commits. |
| T-15.01-05 (DoS: grep) | Accepted | Audit runtime well under 5s on this repo. |
| T-15.01-06 (Info disclosure: stale dist-cjs symbols) | Mitigated | `pnpm --filter sdk build` ran post-rename; `grep -c rootRevisions sdk/dist-cjs/vcs/types.d.ts` = 1, `grep -c rootCommits` = 0; whole-tree `grep -rln rootCommits sdk/dist sdk/dist-cjs` = 0. |

## Validation Strategy (Nyquist Dimension 8) Status

Per `15-VALIDATION.md`:

| Validation Row | Status |
|----------------|--------|
| Plan 15.01 unit: `node --test tests/scripts/audit-root-commits-rename.test.cjs` | green (19/19) |
| Plan 15.01 structural-grep: per-extension `grep -c '\brootCommits\b'` post-rename across ts/cjs/js | green (0 across all 3 code extensions; .md historical-prose explicitly carved out via specialCases) |
| Plan 15.01 unit: `BACKENDS_AVAILABLE_FOR_VERB['refs.rootRevisions']` presence | green (vitest: 2/2 in Phase 15.01 describe block) |
| Plan 15.01 unit: `BACKENDS_AVAILABLE_FOR_VERB['refs.rootCommits']` anti-presence | green (same describe block) |
| Plan 15.01 structural-grep: dist-cjs/vcs/types.d.ts contains rootRevisions, zero rootCommits | green (1 / 0) |

## Audit JSON Pre-Rename Snapshot

- **Path:** `.planning/phases/15-adapter-surface-extensions-rename/rootCommits-rename-audit.json` (slug-matched form per RESEARCH §A5; deviates from CONTEXT D-09 numeric form — recorded in plan `<deviations>`)
- **totalCount:** 35 (live figure at audit time; PATTERNS N3 expected 28+ code-only)
- **byExtension:** ts=18, cjs=3, js=0, md=14, json=0
- **specialCases:** 6 entries (1 capability-matrix-string-literal at backends.ts:79 + 5 historical-prose-carve-out files; one per plan-truth-#15-19 file)
- **carveOuts:** 2 entries (.archive-pre-v1.4 + v1.2-research)
- **idempotencyHash:** committed in sidecar (MD5 hex)

## Grep Gate Output (Post-Rename, Code Surfaces)

```
ts: 0 files (excluding backends.test.ts regression-guard intentional refs)
cjs: 0 files
js: 0 files
json: 0 files
md: 5 files (PROJECT.md, STATE.md, ROADMAP.md, REQUIREMENTS.md, 14.1-01-SUMMARY.md
             — all registered as historical-prose-carve-out in specialCases)
```

The `backends.test.ts` file contains 4 intentional `rootCommits` references (describe block title, JSDoc, it() description, anti-assertion) — these are essential to the regression test's purpose (proving the string-literal key is gone). The audit JSON captures these in `byExtension.ts`; they are NOT in specialCases because they're test code intentionally referencing the removed name, not historical-prose carve-outs.

## dist-cjs Regeneration

```
$ pnpm --filter sdk build
$ grep -c rootRevisions sdk/dist-cjs/vcs/types.d.ts
1
$ grep -c rootCommits sdk/dist-cjs/vcs/types.d.ts
0
$ grep -rln rootCommits sdk/dist-cjs/ sdk/dist/
(none)
```

dist-cjs cleanly reflects post-rename namespace.

## Deviations from CONTEXT Path Form

CONTEXT D-09 cites `.planning/phases/15/rootCommits-rename-audit.json` (numeric phase dir). The phase directory under the v1.4 padded convention is the slug-matched `.planning/phases/15-adapter-surface-extensions-rename/`. This plan uses the slug-matched form so the audit sidecar lives inside the phase directory rather than creating a sibling polluting `.planning/phases/`. Provenance is preserved; only the path string differs from the CONTEXT literal. Recorded in plan `<deviations>` block.

## Self-Check

Before declaring complete, verified:

1. All 14 created/modified files exist on disk (✓)
2. All 5 task commits exist in jj log: `knkomvnq`, `uuvkptzs`, `losskuwu`, `omkuytzv`, `lkqkpnu` (✓)
3. D-12 adjacency: audit `knkomvnq` IMMEDIATELY precedes rename `uuvkptzs` (no commit between) (✓)
4. TSC clean (`pnpm --filter sdk tsc --noEmit` exit 0) (✓)
5. Focused vitest suite (serial) green (166/166) (✓)
6. New backends.test.ts Phase 15.01 describe green (2/2) (✓)
7. node:test audit suite green (19/19) (✓)
8. Per-extension grep gate exits 0 on ts/cjs/js/json (excluding intentional regression-guard refs in backends.test.ts) (✓)
9. dist-cjs cleanliness: 1 rootRevisions / 0 rootCommits in types.d.ts (✓)

## Next Phase Readiness

- Plan 15.02 (idAlphabet) inherits a clean `rootRevisions`-only namespace in `types.ts`, `backends.ts`, and both backend bodies.
- Plan 15.03 (matchPrefix) inherits same.
- Plan 15.04 (cancel + cleanupSubagentWorkspaces helper) inherits same.
- No rebase against in-flight rename required for downstream plans.
- Audit script + sidecar will be discarded at milestone close (per CF-02 / D-13 single-purpose contract).

## Self-Check: PASSED

---
*Phase: 15-adapter-surface-extensions-rename*
*Completed: 2026-05-24*
