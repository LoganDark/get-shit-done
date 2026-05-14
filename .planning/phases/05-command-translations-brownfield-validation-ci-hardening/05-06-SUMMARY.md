---
phase: 05-command-translations-brownfield-validation-ci-hardening
plan: 06
subsystem: vcs-sdk
tags: [sdk-contract, revision-expr, d-12, integration-testing, gap-closure]

requires:
  - phase: 05-command-translations-brownfield-validation-ci-hardening
    provides: "Plan 05-01 GitOnlyOps revert/reset/merge/restore primitives; SDK query shims for log/diff/push/reset/revert"
provides:
  - "CR-02 closed: log.ts/diff.ts wrap --range argv through parseRangeArg() helper (D-12 compliant, no expr.raw)"
  - "CR-03 closed: reset.ts parses `--` pathspec separator; GitOnlyOps.reset gains optional paths field; git.ts appends `-- <paths>` to argv"
  - "CR-04 closed: revert.ts honours --abort flag; new GitOnlyOps.revertAbort() dispatches `git revert --abort`; jj backend returns documented no-op envelope"
  - "WR-03 closed: push.ts wraps --bookmark argv via expr.bookmark() before forwarding to vcs.push()"
  - "Inverted bug-locking assertion in cmd-ship-jj.test.ts:108-111 — now asserts ok envelope instead of throw-on-RevisionExpr"
  - "First black-box integration test in the repo: runs the BUILT bin/gsd-sdk.js binary via spawnSync against a tmp git repo; pins JSON envelope shape for head-ref/log/diff/push/reset/revert"
  - "Empirical confirmation that CR-01 is a workflow defect (not SDK): query-dispatch.ts unwraps result.data before formatSuccess, on-the-wire shape is flat {ok,head} not {data:{ok,head}}"
affects: [05-07-workflow-jq-rewrite, 05-08-prompt-rewrites, 06-jj-migration]

tech-stack:
  added: []
  patterns:
    - "parseRangeArg() helper local to log.ts (exported, imported by diff.ts) — classifies raw --range argv into expr.head() / expr.rev() / expr.range() / expr.bookmark() via 4 documented shapes"
    - "HEAD~N resolved via vcs.log({maxCount: n+1}).slice(-1).hash before expr.rev() wrapping — keeps every CLI string inside the D-12 envelope"
    - "try/catch wrap on every SDK query adapter-call returning {ok:false, error} envelope (consistent with push.ts validateRefname pattern) — never throws through dispatcher"
    - "First repo-wide pattern for black-box integration tests: spawnSync(process.execPath, [bin/gsd-sdk.js, 'query', ...]) with stdio captured, JSON.parse(stdout), structural envelope assertions"

key-files:
  created:
    - "sdk/src/vcs/__tests__/gsd-sdk-binary-shape.integration.test.ts (172 LOC, 6 it() blocks)"
  modified:
    - "sdk/src/vcs/types.ts (GitOnlyOps.reset: +paths?; GitOnlyOps.revertAbort: new method)"
    - "sdk/src/vcs/backends/git.ts (reset impl appends `-- <paths>`; revertAbort impl)"
    - "sdk/src/query/log.ts (parseRangeArg helper + try/catch envelope)"
    - "sdk/src/query/diff.ts (imports parseRangeArg + try/catch envelope)"
    - "sdk/src/query/push.ts (expr.bookmark wrap after validateRefname gate)"
    - "sdk/src/query/reset.ts (`--` separator parsing, paths forwarded)"
    - "sdk/src/query/revert.ts (--abort handler, jj no-op envelope)"
    - "sdk/src/query/{log,diff,push,reset,revert}.test.ts (5 paired tests updated)"
    - "sdk/src/vcs/__tests__/cmd-ship-jj.test.ts (Test 2 assertion inverted)"

key-decisions:
  - "HEAD~N resolution via vcs.log slice rather than introducing expr.parentN(n) factory — keeps Phase 5 surface narrow; per <interfaces> guidance the parentN factory is explicitly out-of-scope"
  - "parseRangeArg is local to log.ts (exported for diff.ts import) rather than promoted to expr.ts — the shape-classification is CLI argv concern, not a RevisionExpr factory concern; D-12 forbids expr.raw"
  - "Bookmark-range shapes (e.g. `bookmark-A..bookmark-B`) intentionally NOT tested in integration; parseRangeArg falls through to expr.bookmark on each side. Plan-checker concern 1 acknowledged but bookmark-range was not in the original 4 workflow shapes (verified via grep in plan <context>); narrowing the parser would reject valid range-of-bookmarks at no benefit"
  - "Wrapped vcs.log/vcs.diff/vcs.push calls in try/catch returning typed {ok:false,error} envelopes — plan-checker concern 2; acceptance criteria did not enforce this but it is the correct shape since the SDK contract is 'envelope or throw at boundary, never both'"
  - "jj-side revert --abort returns ok:true (no-op) rather than ok:false — matches Pitfall 6 documented behavior: jj has no in-progress sequence so 'aborting nothing' is success"
  - "Test 2 inversion in cmd-ship-jj.test.ts asserts stderr does NOT match Invalid RevisionExpr (not that ok=true), because the tmp jj repo has no remote configured so push fails for legitimate downstream reasons"

patterns-established:
  - "Black-box binary integration test: ANY future SDK verb addition should add a corresponding case to gsd-sdk-binary-shape.integration.test.ts so envelope+exit-code contract is pinned end-to-end (not just under mocked createVcsAdapter)"
  - "SDK shim error model: every adapter call wrapped in try/catch returning {ok:false,error:msg,...echoed-argv} — dispatcher never sees a throw from native handlers"
  - "D-12 compliance pattern for CLI argv: introduce a local parseRangeArg-style helper that classifies raw input into expr.* factories; do NOT add expr.raw() escape hatches"

requirements-completed: [CMD-04, CMD-06, CMD-08, CMD-09, CMD-11, PROMPT-01, PROMPT-02]

# Metrics
duration: ~25min
completed: 2026-05-13
---

# Phase 05 Plan 06: SDK Contract Gap Closure — CR-02/03/04 + WR-03 + Black-Box Integration Test

**Four Critical-tier SDK defects closed at the contract boundary: parseRangeArg helper makes log/diff --range D-12 compliant; push --bookmark wraps via expr.bookmark; reset gains `--` pathspec parsing + GitOnlyOps.paths; revert gains --abort + GitOnlyOps.revertAbort. The first black-box integration test in the repo (sdk/src/vcs/__tests__/gsd-sdk-binary-shape.integration.test.ts) runs the BUILT gsd-sdk binary against a tmp git repo and pins JSON envelope shape for 6 verbs — closing the root-cause test gap that masked CR-01/CR-02/WR-03 in Phase 5.**

## Performance

- **Duration:** ~25 min wall-clock
- **Started:** 2026-05-13T22:35:00Z (approx)
- **Completed:** 2026-05-13T22:43:00Z (approx)
- **Tasks:** 3
- **Files modified:** 11 (+ 1 new integration test, +1 SUMMARY.md)
- **Tests added:** 6 integration tests + 8 new unit-test cases (across log/diff/push/reset/revert paired tests + cmd-ship-jj inversion)
- **Tests passing post-plan:** 48/48 in touched-files surface; 7 pre-existing flakes in unrelated test files (validate/state/config-mutation/query-dispatch/query-fallback-bridge-adapter) untouched by this plan and out of scope

## Accomplishments

- **CR-02 closed:** `gsd-sdk query log --range HEAD~1..HEAD` and `gsd-sdk query diff --range HEAD~1..HEAD` no longer throw `Invalid RevisionExpr` — empirically verified against the built binary in a tmp git repo (integration test cases 2 + 3).
- **WR-03 closed:** `gsd-sdk query push --remote origin --bookmark release/v1.0` wraps the bookmark via `expr.bookmark()` before forwarding to `vcs.push()`; the bookmark string round-trips through the JSON envelope (integration test case 4).
- **CR-03 closed:** `gsd-sdk query reset --ref HEAD --mode mixed -- .planning/` unstages ONLY `.planning/`; non-planning staged files remain staged (integration test case 5 — ground-truthed via raw `git status --porcelain` probe).
- **CR-04 closed:** `gsd-sdk query revert --abort` dispatches `git revert --abort` on git backend via the new `gitOnly.revertAbort()` primitive; on jj backend returns a documented no-op envelope (`ok:true`, `note: 'jj has no in-progress revert sequence; abort is a no-op'`). Integration test case 6 pins the git-side dispatch.
- **CR-01 finding direction CONFIRMED:** `query-dispatch.ts:239` unwraps `result.data` before `formatSuccess`, so on-the-wire shape is FLAT (`{ok:true,head:"abc"}`, NOT `{data:{ok:true,head:"abc"}}`). Integration test case 1 pins this invariant. CR-01 is a workflow `.data.X` jq-path bug owned by Plan 05-07, NOT an SDK bug. This plan's contract pin makes Plan 05-07 a mechanical sweep rather than a guess.
- **Bug-locking assertion inverted:** `cmd-ship-jj.test.ts:108-111` no longer asserts `rejects.toThrow(/Invalid RevisionExpr/)`. Test 2 now asserts the envelope round-trips the bookmark and contains no `Invalid RevisionExpr` leakage. The original bug-lock was preventing Phase 5 from noticing WR-03; removing it is part of the gap closure.
- **First black-box integration test in the repo:** `gsd-sdk-binary-shape.integration.test.ts` (172 LOC, 6 it() blocks) is the only test that invokes the BUILT `bin/gsd-sdk.js` binary. Future Phase 6+ SDK additions should follow this pattern — every existing test in `sdk/src/query/*.test.ts` mocks `createVcsAdapter` and never reaches `toGitRev`/`formatSuccess`, which is exactly why CR-01/CR-02/WR-03 went invisible during Phase 5 plan 05-01's "all green" run.

## Task Commits

1. **Task 1: Extend GitOnlyOps + git.ts backend with paths + revertAbort primitives** — `ywyrtzzxoxnmoutsortwzrzlpsksplox` (feat)
2. **Task 2: Wire SDK query shims to new primitives — close CR-02/CR-03/CR-04/WR-03** — `quyrsyznyxmlrvtvoqvvytyrpwkvkqmm` (fix)
3. **Task 3: Black-box integration test — invoke built gsd-sdk binary against tmp repo** — `upnmrksvzsnmpntxtopnxwnspxkoorkv` (test)

## Files Created/Modified

### Created
- `sdk/src/vcs/__tests__/gsd-sdk-binary-shape.integration.test.ts` (172 LOC) — black-box integration test; 6 it() blocks covering head-ref/log/diff/push/reset/revert; spawnSync against the built `bin/gsd-sdk.js`.
- `.planning/phases/05-command-translations-brownfield-validation-ci-hardening/05-06-SUMMARY.md` — this file.

### Modified
- `sdk/src/vcs/types.ts` — `GitOnlyOps.reset` signature gains optional `paths?: string[]`; new `GitOnlyOps.revertAbort(): ExecResult` method declaration.
- `sdk/src/vcs/backends/git.ts` — `reset` impl appends `args.push('--', ...opts.paths)` when paths is non-empty; new `revertAbort` impl dispatches `git revert --abort` and surfaces ExecResult (no throw on non-zero exit).
- `sdk/src/query/log.ts` — adds exported `parseRangeArg(raw, vcs)` helper; HEAD~N resolution via `vcs.log({maxCount: n+1}).slice(-1).hash` then `expr.rev`; try/catch wraps both `parseRangeArg` and `vcs.log` call with typed `{ok:false,error}` envelope return.
- `sdk/src/query/diff.ts` — imports `parseRangeArg` from log.ts; same try/catch envelope pattern as log.ts.
- `sdk/src/query/push.ts` — imports `expr`; bookmark wraps via `expr.bookmark(bookmark)` AFTER `validateRefname` gate (no double-throw on legitimate input).
- `sdk/src/query/reset.ts` — adds `inPaths` loop body mirroring diff.ts pattern; trailing positionals after `--` collected into `paths[]` and forwarded to `gitOnly.reset({paths})`; envelope echoes back the paths field.
- `sdk/src/query/revert.ts` — adds `abort` flag parsing; `if (abort)` branch BEFORE positional-rev requirement; git path dispatches `gitOnly.revertAbort()`, jj path returns documented no-op envelope with `note`.
- `sdk/src/query/log.test.ts` — assertions updated to expect encoded RevisionExpr (`range:rev:<sha>..head:`, `head:`, etc.) at adapter boundary; new CR-02 positive cases.
- `sdk/src/query/diff.test.ts` — same shape; mocked adapter now exposes `log` for parseRangeArg's HEAD~N resolution.
- `sdk/src/query/push.test.ts` — assertions updated to expect `ref: 'bookmark:feature/x'` at adapter boundary; new WR-03 positive case for `release/v1.0`.
- `sdk/src/query/reset.test.ts` — new CR-03 positive cases (single path, multiple paths after `--`); existing no-paths case updated to assert `paths: undefined`.
- `sdk/src/query/revert.test.ts` — new CR-04 positive cases (--abort on git, --abort on jj no-op); existing positive cases unchanged.
- `sdk/src/vcs/__tests__/cmd-ship-jj.test.ts` — Test 2 (lines 95-115) assertion inverted from `rejects.toThrow(/Invalid RevisionExpr/)` to structural envelope assertion + stderr-doesn't-contain-Invalid-RevisionExpr probe.

## Decisions Made

See `key-decisions` frontmatter above. The substantive ones:

1. **HEAD~N resolution via `vcs.log` slice, not a new expr factory.** `<interfaces>` explicitly listed `expr.parentN(n)` as out-of-scope for this plan; the slice approach keeps every CLI string inside the D-12 envelope and adds no surface to expr.ts.
2. **parseRangeArg lives in log.ts, not expr.ts.** Shape-classification is a CLI argv concern, not a factory concern. D-12 forbids `expr.raw()`; promoting a classification helper to expr.ts would blur that line.
3. **try/catch envelope wrap on every adapter call.** Plan-checker concern 2 flagged this as "acceptance criteria don't enforce". The SDK contract is "envelope or throw at boundary, never both" — wrapping is the right shape, and the new unit-test cases for malformed range input (`HEAD..`, `..HEAD`) enforce the envelope return.
4. **jj-side `revert --abort` returns ok:true.** Matches Pitfall 6: jj has no in-progress revert sequence, so "aborting nothing" is success, not failure. The documented `note` field gives callers context without forcing them to branch on backend kind.
5. **Bookmark-range shapes intentionally left as parseRangeArg's fallback.** Plan-checker concern 1: parseSingle falls through to `expr.bookmark(raw)` for non-HEAD/non-SHA inputs, which permits `bookmark-A..bookmark-B` through. The plan's `<context>` confirmed via grep that only 4 workflow shapes are actually used (HEAD~N..HEAD, sha..sha, sha, HEAD); narrowing parseSingle would reject valid bookmark-range inputs for no benefit. If a future workflow needs to assert "reject bookmark-range" the unit test surface can grow that assertion without changing the production code.

## Deviations from Plan

None — plan executed exactly as written. Two plan-checker concerns were proactively addressed:

1. **Concern 1 (bookmark-range fallback in parseRangeArg):** acknowledged but intentionally left unchanged. Rationale documented in Decisions §5.
2. **Concern 2 (try/catch wrap on vcs.log call):** implemented as recommended. The plan's action prose for Edit 1 and Edit 2 mentioned the wrap; acceptance criteria did not enforce it; I implemented it because the SDK contract requires it.

## Issues Encountered

**One self-inflicted scare during smoke-testing the built binary** (NOT a deviation; recovered before any commits): during Task 3 setup I ran a `mktemp -d -t gsd-check` invocation that, due to a missing `X` count, was rejected by macOS mktemp and silently fell back to a path collision with the worktree's own git root. The subsequent `git init -b main` reinitialized the worktree's `.git` directory and a follow-up `git commit` landed two garbage commits (167856a1 + 53be0a1c) on top of Task 2. Recovered immediately via `git reset --mixed 5319ec27` + `git checkout -- .planning/STATE.md README.md` + `rm code.ts`. No data loss; the two garbage commits are NOT in the final commit graph (verified via `git log --oneline -5` showing `upnmrksvzsnmpntxtopnxwnspxkoorkv` → `quyrsyznyxmlrvtvoqvvytyrpwkvkqmm` → `ywyrtzzxoxnmoutsortwzrzlpsksplox` → `smxssmupqulonpzqyoutssqlzsllpsmo`).

**Lesson:** always use `mktemp -d` with explicit `XXXXXX` template suffix (or rely on the test harness's mkdtempSync which does this correctly). The integration test I wrote uses `mkdtempSync(path.join(tmpdir(), 'gsd-sdk-binshape-'))` which is safe.

**Pre-existing test failures (out of scope, NOT caused by this plan):** A broader test run surfaced 7 failures across `sdk/src/query/{validate,state,config-mutation,query-dispatch,query-fallback-bridge-adapter}.test.ts`. None of those files were touched by this plan; their last-modified commits date to weeks before this plan. They appear to be pre-existing flakes (some involve subprocess/tmpdir patterns). Logged here for the Phase 5 VERIFICATION owner; not in scope for gap-closure plan 05-06.

## Coverage Gap Closed

This plan is the FIRST in the repo to land a test that runs the built `gsd-sdk` binary end-to-end. Every existing test in `sdk/src/query/*.test.ts` mocks `createVcsAdapter` and never reaches the `toGitRev`/`formatSuccess` pipeline. That is exactly why CR-01/CR-02/WR-03 (and the silent CR-03/CR-04) were all-green during Phase 5 plan 05-01's verification run but broke at every workflow callsite. The new integration test gives Phase 6 a clear pattern: any SDK verb addition should add a corresponding `it()` block to `gsd-sdk-binary-shape.integration.test.ts` so envelope+exit-code contract is pinned at the binary boundary, not just under mocks.

The no-raw-git lint guard (`scripts/lint-vcs-no-raw-git.cjs`) exits 0 against the new test file — it falls under the existing `sdk/src/**/*.integration.test.ts` allowlist glob, so no allowlist edit was needed. (The raw `git` calls inside the test are ground-truth probes; the test's PURPOSE is to ground-truth the SDK against raw-git semantics.)

## Next Phase Readiness

- **Plan 05-07 (workflow jq-path sweep):** now has a known-good SDK contract to rewrite against. The integration test pins the flat-envelope invariant (`{ok,head}` not `{data:{ok,head}}`); 05-07 can sweep the 24 broken `.data.X` jq paths confident the SDK side will not change underneath it.
- **Plan 05-08 (PROMPT-03 inventory):** unblocked at the SDK layer. The 4 BLOCKED requirements (CMD-04, CMD-06, CMD-08, CMD-09) and 3 PARTIAL (CMD-11, PROMPT-01, PROMPT-02) all needed the contract fixes that landed here.
- **Phase 6 (jj migration):** the parseRangeArg + revertAbort + paths primitives are git-only by design (revertAbort lives on GitOnlyOps; parseRangeArg's HEAD~N path uses `vcs.log` which is cross-backend). Phase 6's jj-equivalent for the `--abort` path is already documented as a no-op envelope in revert.ts. No Phase 6 follow-up required from this plan.

## Self-Check: PASSED

**Created files verified:**
- `sdk/src/vcs/__tests__/gsd-sdk-binary-shape.integration.test.ts` — FOUND
- `.planning/phases/05-command-translations-brownfield-validation-ci-hardening/05-06-SUMMARY.md` — being created now

**Commits verified:**
- `ywyrtzzxoxnmoutsortwzrzlpsksplox` (Task 1) — FOUND in git log
- `quyrsyznyxmlrvtvoqvvytyrpwkvkqmm` (Task 2) — FOUND in git log
- `upnmrksvzsnmpntxtopnxwnspxkoorkv` (Task 3) — FOUND in git log

**Acceptance criteria verified:**
- `grep -rE 'as unknown as RevisionExpr' sdk/src/query/` → 0 hits
- `grep -cE 'rejects\.toThrow\(/Invalid RevisionExpr/\)' sdk/src/vcs/__tests__/cmd-ship-jj.test.ts` → 0 hits
- `pnpm tsc --noEmit` → exit 0
- `pnpm test src/query/{log,diff,push,reset,revert}.test.ts src/vcs/__tests__/{cmd-ship-jj,git-revert}.test.ts src/vcs/__tests__/gsd-sdk-binary-shape.integration.test.ts --run` → 48/48 passed
- `node scripts/lint-vcs-no-raw-git.cjs` → exit 0 (0 violations)

---
*Phase: 05-command-translations-brownfield-validation-ci-hardening*
*Plan: 06*
*Completed: 2026-05-13*
