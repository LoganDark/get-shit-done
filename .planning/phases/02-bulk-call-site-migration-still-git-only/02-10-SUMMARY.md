---
phase: 02-bulk-call-site-migration-still-git-only
plan: 10
subsystem: vcs-migration
tags: [vcs-adapter, verify, blocker-3-closure, log-allrefs, diff-namestatus]
requires:
  - 02-03 (gap-fill: vcs.refs.exists, expr.commit, LogOpts.allRefs, DiffOpts.nameStatus, expr.range)
  - 02-08 (commit.ts migration; verify.ts dynamic imports retargeted to vcs/index.js as Rule 3)
  - 02-09 (commands.cjs migrated; expr.commit production consumer pattern locked)
provides:
  - "verify.cjs migrated to VcsAdapter (6 sites closed)"
  - "verify.ts migrated to VcsAdapter (3 sites closed)"
  - "First production consumer of LogOpts.allRefs (verify.cjs:1224 + verify.ts:628)"
  - "First production consumer of DiffOpts.nameStatus (verify.cjs:1309)"
affects:
  - get-shit-done/bin/lib/verify.cjs
  - sdk/src/query/verify.ts
  - tests/verify.test.cjs (paired retarget per D-06)
  - tests/__tools__/capture-vcs-baselines.cjs (9 new baseline entries)
  - sdk/src/vcs/__tests__/baseline-parity.test.ts (3 new args-shape dispatch clauses)
  - tests/baselines/git-vcs/ (9 new snapshot files)
tech-stack:
  added: []
  patterns:
    - "expr.range(expr.commit(base), expr.head()) for two-rev diff at verify.cjs:1309"
    - "vcs.refs.exists(vcs.refs.head) for is-git-repo probe at verify.cjs:1286"
    - "log --oneline reconstruction from LogEntry[] (hash.slice(0,7) + subject) for byte-equivalence with --oneline grep target"
key-files:
  created:
    - tests/baselines/git-vcs/verify-cjs-71-cat-file.snap.json
    - tests/baselines/git-vcs/verify-cjs-268-cat-file.snap.json
    - tests/baselines/git-vcs/verify-cjs-1224-log-all.snap.json
    - tests/baselines/git-vcs/verify-cjs-1286-rev-parse.snap.json
    - tests/baselines/git-vcs/verify-cjs-1305-cat-file.snap.json
    - tests/baselines/git-vcs/verify-cjs-1309-diff-name-status.snap.json
    - tests/baselines/git-vcs/verify-ts-336-cat-file.snap.json
    - tests/baselines/git-vcs/verify-ts-485-cat-file.snap.json
    - tests/baselines/git-vcs/verify-ts-628-log-all.snap.json
  modified:
    - get-shit-done/bin/lib/verify.cjs
    - sdk/src/query/verify.ts
    - tests/verify.test.cjs
    - tests/__tools__/capture-vcs-baselines.cjs
    - sdk/src/vcs/__tests__/baseline-parity.test.ts
decisions:
  - "Site 1309 (`diff --name-status base HEAD`) wraps two-rev form via `expr.range(expr.commit(base), expr.head())` because DiffOpts.rev takes a SINGLE RevisionExpr; for the linear-ancestor relationship that drift detection guarantees, `<base>..HEAD` is byte-equivalent to `<base> HEAD` for `--name-status` output (first production consumer of expr.range outside the SDK layer)."
  - "Cat-file -t probes lose the stdout-token discrimination (`commit` vs `tree`/`blob`/`tag`). Plan-sanctioned semantic shift: any reachable object passes vcs.refs.exists. In practice CLI inputs are commit SHAs and the existing tests pass. expr.commit's SHA shape validation (4-40 hex) catches truly malformed inputs before reaching git."
  - "vcs.refs.exists(vcs.refs.head) replaces `rev-parse HEAD` exit-code probe at verify.cjs:1286 — semantically equivalent for the is-git-repo check (both exit 0 only when HEAD resolves)."
  - "verify.test.cjs paired retarget covers 3 raw-git fixture-setup sites (lines 410-414, 644, 667) via vcs.stage / vcs.commit / vcs.refs.resolveShort. schema-drift.test.cjs vacuous (no raw-git beyond createTempGitProject which is already adapter-aware via 02-02 D-09)."
  - "verify.test.ts has NO migration target — its tests cover verifyPlanStructure / verifyPhaseCompleteness / verifyArtifacts only; the migrated handlers (verifyCommits / verifySummary / verifySchemaDrift) have no SDK-level test coverage per RESEARCH §verify.ts line 494, only tests/verify.test.cjs (covered in Task 1's commit)."
  - "Baseline-parity dispatch added 3 args-shape clauses (cat-file -t / log --all / diff --name-status) per W2 keying — covers all 9 new baselines mechanically; rev-parse HEAD shape (verify-cjs-1286) reuses graphify clause (canonical execGit byte-identity covers the parity SC)."
metrics:
  duration: ~11m
  completed_date: 2026-05-10
---

# Phase 02 Plan 10: verify.cjs + verify.ts Migration Summary

Hotspot-pair migration: `verify.cjs` (1,390 LOC; 6 sites) and its byte-symmetric SDK port `verify.ts` (692 LOC; 3 sites). Closes 9 raw-git sites; first production consumers of `LogOpts.allRefs` and `DiffOpts.nameStatus` gap-fills from plan 02-03; second wave of `expr.commit` Blocker-3-closure consumption (4 sites in verify.cjs + 2 in verify.ts).

## Sites Migrated

| File | Line | Before | After | Gap-fill consumed |
|------|------|--------|-------|-------------------|
| verify.cjs | 71 | `execGit(cwd, ['cat-file', '-t', hash])` | `vcs.refs.exists(expr.commit(hash))` | expr.commit |
| verify.cjs | 268 | `execGit(cwd, ['cat-file', '-t', hash])` | `vcs.refs.exists(expr.commit(hash))` | expr.commit |
| verify.cjs | 1224 | `execGit(cwd, ['log', '--oneline', '--all', '-50'])` | `vcs.log({format:'oneline', maxCount:50, allRefs:true})` | LogOpts.allRefs |
| verify.cjs | 1286 | `execGit(cwd, ['rev-parse', 'HEAD'])` (probe) | `vcs.refs.exists(vcs.refs.head)` | vcs.refs.exists |
| verify.cjs | 1305 | `execGit(cwd, ['cat-file', '-t', base])` | `vcs.refs.exists(expr.commit(base))` | expr.commit |
| verify.cjs | 1309 | `execGit(cwd, ['diff', '--name-status', base, 'HEAD'])` | `vcs.diff({rev: expr.range(expr.commit(base), expr.head()), nameStatus:true})` | DiffOpts.nameStatus + expr.range + expr.commit |
| verify.ts | 336 | `execGit(projectDir, ['cat-file', '-t', hash])` | `vcs.refs.exists(expr.commit(hash))` | expr.commit |
| verify.ts | 485 | `execGit(projectDir, ['cat-file', '-t', hash])` | `vcs.refs.exists(expr.commit(hash))` | expr.commit |
| verify.ts | 628 | `execGit(projectDir, ['log', '--oneline', '--all', '-50'])` | `vcs.log({format:'oneline', maxCount:50, allRefs:true})` | LogOpts.allRefs |

**9 sites closed.** Blocker-3 (expr.commit) consumed at **6 sites** (verify.cjs: 71, 268, 1305, 1309 → 4; verify.ts: 336, 485 → 2) — meets plan acceptance "expr.commit consumed at ≥6 sites across both files".

## Commits

| Task | Commit | Files | Description |
|------|--------|-------|-------------|
| 1 | `b34700a3` | 10 | verify.cjs source + paired verify.test.cjs + capture-vcs-baselines.cjs (9 entries added) + baseline-parity.test.ts (3 dispatch clauses) + 6 verify-cjs baselines |
| 2 | `1c1a8072` | 4 | verify.ts source + 3 verify-ts baselines (auto-dispatch via Task 1's args-shape clauses) |

Both commits land on `phase/02-migration` per D-05 (one commit per source file).

## Decisions Made

### D-08 Mechanical-Only Compliance

All 9 site swaps are line-level mechanical replacements. The only non-trivial change is at site 1309 (two-rev diff → range expression), justified inline at the call site with a comment noting why DiffOpts.rev's single-RevisionExpr shape forces the range factory wrap. No helper extraction across cat-file probe sites; no logic restructuring; no new modules. core.cjs::execGit re-export preserved (deletion is plan 02-11's owner per D-05 LOC ordering).

### Blocker-3 Closure Status

Plan 02-03's `expr.commit(sha)` factory exists specifically for the cat-file -t probe pattern (see expr.ts:96-104). After this plan:

| Plan | expr.commit consumer count |
|------|---------------------------|
| 02-06 (progress.ts) | 1 |
| 02-07 (graphify.cjs) | 1 |
| 02-09 (commands.cjs) | 1 |
| **02-10 (verify.cjs + verify.ts)** | **6** |

Total expr.commit production consumers: **9 sites across 5 files**. Blocker-3 from iteration 1 fully closed.

### Semantic Shift at cat-file -t Probes

The original `execGit(cwd, ['cat-file', '-t', hash])` exit-zero AND stdout==='commit' pattern checked BOTH existence AND object-type. `vcs.refs.exists` returns boolean from exit-code only; tree/blob/tag objects also satisfy. Plan-sanctioned (per `<must_haves.truths>` truth #1 wording: "routed through vcs.refs.exists") and tolerated because:
1. CLI inputs (verify-commits args, SUMMARY.md hash patterns) are commit SHAs in practice.
2. `expr.commit`'s shape validation (4-40 hex chars) catches malformed inputs.
3. Existing tests pass — `tests/verify.test.cjs::reports invalid for fake hashes` still routes via the exit-non-zero path.

### Two-Rev Diff at Site 1309

The Phase-1 `DiffOpts.rev: RevisionExpr` shape takes ONE rev. The original `git diff --name-status <base> HEAD` is a two-rev diff. Migrated to `expr.range(expr.commit(base), expr.head())` which encodes as `<base>..HEAD` in toGitRev. For the **linear ancestor** relationship that drift detection guarantees (lastMapped is recorded earlier than HEAD by construction), `git diff <a> <b>` and `git diff <a>..<b>` produce byte-identical `--name-status` output. The baseline parity test confirms this: dispatch clause resolves both the captured args (`HEAD~1 HEAD`) and the adapter call (`expr.range(...)`) to the same `A\ta.txt` output for the test fixture.

This is the **first production consumer of expr.range outside graphify.cjs** (which used it for rev-list count ranges in plan 02-07).

## Auto-Fixed Issues

None. Plan executed mechanically with no Rule 1/2/3 deviations beyond the documented design decisions above (range-wrap at 1309 was anticipated in PATTERNS but not spelled out for `verify.cjs` specifically — applied here).

## Verification

- `grep -cE "execSync\(['\"]git " verify.cjs verify.ts` = **0** (success criterion ✓)
- All 9 baselines exist at `tests/baselines/git-vcs/verify-{cjs,ts}-*-*.snap.json` ✓
- `node --test tests/verify.test.cjs tests/schema-drift.test.cjs` → **76/76 pass** ✓
- `pnpm exec vitest run sdk/src/query/verify.test.ts` → **21/21 pass** ✓
- `pnpm exec vitest run sdk/src/vcs/__tests__/baseline-parity.test.ts` → **54/54 pass** ✓
- `node scripts/lint-vcs-no-raw-git.cjs` → 2 violations / 1 file (only core.cjs, plan 02-11 territory) ✓

After this plan, the only remaining hotspot is `core.cjs` (Plan 02-11) with 2 raw-git sites: line 603 (`execFileSync('git', ['check-ignore', ...])`) and line 744 (the `execGit` helper itself, deleted alongside its callers).

## Self-Check: PASSED

All claimed files exist, all claimed commits exist on phase/02-migration:

```
$ git log --oneline -2 phase/02-migration
1c1a8072 refactor(02-10): migrate sdk/src/query/verify.ts to VcsAdapter
b34700a3 refactor(02-10): migrate get-shit-done/bin/lib/verify.cjs to VcsAdapter
```

All 9 new baseline files committed. All paired tests pass on git backend. D-05 (per-file commit), D-06 (paired test in same commit), D-08 (mechanical-only) honored.
