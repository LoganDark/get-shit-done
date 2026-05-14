---
phase: 05-command-translations-brownfield-validation-ci-hardening
verified: 2026-05-13T22:30:00Z
status: gaps_found
score: 3/5 success criteria verified
overrides_applied: 0
gaps:
  - truth: "Every CMD-* upstream command runs end-to-end on a jj-only repo with passing integration tests (ROADMAP SC #1)"
    status: partial
    reason: "16 CMD integration tests exist and (per SUMMARYs) pass under jj 0.41, BUT three of the new SDK verbs they exercise are demonstrably broken at the CLI boundary: (a) `gsd-sdk query log/diff --range <X..Y>` throws `Invalid RevisionExpr` because log.ts:47 and diff.ts:62 cast raw argv to RevisionExpr without going through `expr.range()` / `expr.rev()`; (b) `gsd-sdk query push --bookmark <name>` throws `Invalid RevisionExpr` on both backends via push.ts:61's identical cast (cmd-ship-jj.test.ts:108-111 actually asserts the throw — knowingly locked in); (c) `gsd-sdk query revert --abort` is silently no-op'd (no flag handler exists). The unit tests mock createVcsAdapter so they never reach the toGitRev/toJjRev failure paths. Workflows that depend on push, log --range, diff --range, or revert --abort fail at runtime."
    artifacts:
      - path: "sdk/src/query/log.ts:47"
        issue: "CR-02: `rev: range as unknown as RevisionExpr | undefined` — cast without encoding; toGitRev throws on every workflow call"
      - path: "sdk/src/query/diff.ts:62"
        issue: "CR-02: same RevisionExpr cast hazard"
      - path: "sdk/src/query/push.ts:61"
        issue: "WR-03: `ref: bookmark as unknown as RevisionExpr | undefined` — cmd-ship-jj.test.ts:108-111 documents the bug by asserting .rejects.toThrow(/Invalid RevisionExpr/)"
      - path: "sdk/src/query/revert.ts:34-49"
        issue: "CR-04: --abort flag silently consumed; no abort handler; workflow undo.md:240 calls revert --abort believing it's recovering"
    missing:
      - "log.ts/diff.ts must route --range through expr.range()/expr.rev() (or add expr.raw() escape hatch) before forwarding to vcs"
      - "push.ts must wrap --bookmark with expr.bookmark() before forwarding to vcs.push"
      - "revert.ts must handle --abort flag, short-circuit positional rev requirement, dispatch git revert --abort on git backend"
      - "Add integration test that runs the actual built gsd-sdk binary against a tmp repo (not mocked createVcsAdapter) to catch these contract failures"

  - truth: "All workflow markdown + agent definitions rewritten to be VCS-agnostic with correct JSON unwrap paths (ROADMAP SC #2)"
    status: failed
    reason: "CR-01: The `gsd-sdk query` CLI unwraps `result.data` before serialization at query-dispatch.ts:239 (verified: `dispatchSuccess(formatSuccess(result.data, ...))`). Empirically, `gsd-sdk query head-ref` prints `{\"ok\":true,\"head\":\"...\"}` — not `{\"data\":{...}}`. But 24 invocations across 5 rewritten files (3 workflows + 2 agents from plan 05-03) pipe through `jq -r '.data.X'` paths that read null. Per-file count: undo.md=4, complete-milestone.md=8, code-review.md=3, gsd-executor.md=7, gsd-code-fixer.md=2. (Note: plan 05-02's execute-phase.md and quick.md use the correct `.raw` / `.nameOnly` forms — bug is confined to 05-03's output.) Workflows depending on log/diff/status/head-ref/current-branch/branch-list output silently degrade: empty TASK_COMMIT, no phase-commits found, no branch detected, etc."
    artifacts:
      - path: "get-shit-done/workflows/undo.md"
        issue: "4 occurrences of `.data.X` jq paths (CR-01); MODE=last/phase/plan log queries all read null"
      - path: "get-shit-done/workflows/complete-milestone.md"
        issue: "8 occurrences; CURRENT_BRANCH empty → later `git checkout $CURRENT_BRANCH` errors; phase-branch detection no-ops"
      - path: "get-shit-done/workflows/code-review.md"
        issue: "3 occurrences; phase-commit discovery returns null → falls through to '--files flag' warning even on success path"
      - path: "agents/gsd-executor.md"
        issue: "7 occurrences; TASK_COMMIT / COMMIT_HASH blank in SUMMARY.md commit-hash column; untracked-file detection no-ops"
      - path: "agents/gsd-code-fixer.md"
        issue: "2 occurrences; worktree-setup branch-detection short-circuits to 'detached HEAD'"
    missing:
      - "Grep-and-rewrite pass across agents/*.md + get-shit-done/workflows/*.md replacing `.data.X` → `.X` (or use `--pick X` where applicable)"
      - "Spot-run each rewritten command against the in-repo gsd-sdk binary to confirm non-null output before declaring fix complete"

  - truth: "Workflow rewrites correctly preserve git path-scoped reset semantics (ROADMAP SC #2 — correctness sub-criterion)"
    status: failed
    reason: "CR-03: `gsd-sdk query reset --ref HEAD --mode mixed -- .planning/` silently discards the path filter. reset.ts (sdk/src/query/reset.ts:29-49) parses only --cwd/--ref/--mode; no `--` separator handling, no trailing-positional collection, no `paths` field on GitOnlyOps.reset (types.ts:369). The original raw-git form was path-scoped (`git reset --mixed HEAD -- .planning/` unstages ONLY .planning/); the rewrite unstages the entire index. complete-milestone.md uses this pattern 4 times (lines 690/700/721/731) in the 'strip .planning/ from staging if commit_docs is false' branch — runs AFTER `gsd-sdk query merge --squash` has just staged code + planning files together. Intended behavior: unstage only planning. Actual behavior: unstage everything. Follow-up commit either errors (nothing staged) or commits empty change. Also undo.md:243."
    artifacts:
      - path: "sdk/src/query/reset.ts:29-49"
        issue: "No -- separator parsing; no paths field forwarded to gitOnly.reset"
      - path: "sdk/src/vcs/types.ts:369"
        issue: "GitOnlyOps.reset signature `{ref, mode}` — no paths field"
      - path: "get-shit-done/workflows/complete-milestone.md:690,700,721,731"
        issue: "4 sites silently discarding `-- .planning/` filter; unstages entire index"
      - path: "get-shit-done/workflows/undo.md:243"
        issue: "Same pattern; CR-03 applies"
    missing:
      - "Extend reset.ts argv-loop with `--` separator collecting trailing positionals into `paths: string[]`"
      - "Extend GitOnlyOps.reset signature with `paths?: string[]` field"
      - "Extend git.ts reset impl to append `-- <paths>` to argv when paths.length > 0"
      - "Add unit test asserting `--ref HEAD --mode mixed -- .planning/` reaches gitOnly.reset with paths: ['.planning/']"

deferred:
  - truth: "BROWN-01/02 dogfood validation against this repo's jj backend"
    addressed_in: "Phase 6"
    evidence: "REQUIREMENTS.md lines 277-278 + ROADMAP.md Phase 6 stub lines 175-178: explicitly re-bucketed per CONTEXT D-31 (depends on Phase 6 SHA→change_id rewriter). Plan 05-01 landed the deferral edits."
  - truth: "CI matrix flip from continue-on-error to required-blocking (ROADMAP SC #4 second half)"
    addressed_in: "Phase 5 deferred / future"
    evidence: "Plan 05-05 SUMMARY explicitly documents 'CI matrix flip (D-36 step 2 second-half) is NOT landed in this plan — the 10-consecutive-green soak window cannot be observed from inside an isolated worktree against remote GitHub Actions runs. The proposed YAML diff is captured in this SUMMARY... the existing conditional carries a new comment block pointing readers to the soak file.' .github/workflows/test.yml:88 still reads `continue-on-error: ${{ matrix.backend == 'jj-colocated' || matrix.backend == 'jj-native' }}`. User context confirms this is an accepted COMPLETE-WITH-CAVEAT — soak observation deferred indefinitely; no active CI for this fork."

human_verification:
  - test: "Run `gsd-sdk query head-ref | jq -r '.head'` against the in-repo SDK binary"
    expected: "Non-null short revision string; confirms CR-01 root claim"
    why_human: "Verifier cannot run pnpm build + invoke binary; spot-check is fast for human"
  - test: "Run `gsd-sdk query log --range HEAD~2..HEAD --max-count 2`"
    expected: "Either valid JSON entries OR clear error message; if CR-02 is real, will print `Error: Invalid RevisionExpr: 'HEAD~2..HEAD'`"
    why_human: "Empirical SDK invocation; review code review's claim"
  - test: "Confirm the CI matrix deferral is acceptable for milestone close"
    expected: "User confirms the COMPLETE-WITH-CAVEAT framing (analogous to Phase 4's A3) is acceptable"
    why_human: "Soak observation is a 10-day calendar gate; no automated test can drive it"
---

# Phase 5: Command Translations + Brownfield Validation + CI Hardening — Verification Report

**Phase Goal:** Verify every upstream GSD command end-to-end on jj, rewrite all workflow markdown and agent prompts to be VCS-agnostic (with multi-runtime parity), validate brownfield commands by dogfooding on this very repo, and graduate the CI jj-backend lane from allow-failure to required-blocking. After this phase, the project achieves full feature parity.

**Verified:** 2026-05-13T22:30:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (ROADMAP Phase 5 Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every CMD-* upstream command runs end-to-end on a jj-only repo with passing integration tests | ⚠️ PARTIAL | 16 cmd-*-jj.test.ts files exist; SUMMARYs claim all pass under jj 0.41. BUT three new SDK verbs the workflows depend on are demonstrably broken at the CLI boundary (CR-02, WR-03, CR-04). cmd-ship-jj.test.ts:108-111 actively asserts pushQuery throws — bug locked in by test. |
| 2 | All workflow markdown + agent definitions rewritten to be VCS-agnostic | ✗ FAILED | All 5 target files rewritten and route through `gsd-sdk query <verb>` (no `if vcs.adapter == 'jj'` conditionals found). HOWEVER 24 `.data.X` jq paths across the 05-03 output read null at runtime (CR-01) because the CLI unwraps `result.data` before serialization. 05-02's outputs (execute-phase.md, quick.md) are correct. |
| 3 | Brownfield commands pass integration tests against synthetic jj fixtures | ✓ VERIFIED | synth-planning-fixture.ts exists; 5 brownfield CMD-10 tests landed (resume-work, pause-work, import, ingest-docs, map-codebase); per 05-04 SUMMARY 13/13 tests pass under jj 0.41 in 5.97s. D-34 coverage-gap prose present in each test file. BROWN-01/02 explicitly re-bucketed to Phase 6 in REQUIREMENTS.md:277-278 + ROADMAP.md Phase 6 stub. |
| 4 | CI matrix graduates jj-backend tests from allow-failure to required-blocking; GitHub Actions workflows stay on git per CI-03 | ⚠️ PARTIAL (deferred half) | CI-03 docs landed in test.yml:5 + :86 ("GitHub *is* git" prose present, REQUIREMENTS.md marks CI-03 Complete). CI matrix flip NOT landed (test.yml:88 still `continue-on-error: ${{ ... jj-colocated || jj-native }}`); plan 05-05 SUMMARY documents this as a deferred soak-gated step. First weekly rebase requirement is part of BROWN-02 → deferred to Phase 6. |
| 5 | Full v1 commitment: every upstream GSD command works correctly on jj-only repo with no regression and no `.skip` accumulation | ✗ FAILED | Cannot hold given Truth #1 and Truth #2 failures: workflows calling push, log --range, diff --range, revert --abort fail at runtime; 24 jq paths silently return null. Per plan 05-05 SUMMARY, full SDK suite shows "26 failed / 2238 passed / 32 skipped — same baseline as pre-edit"; no NEW regressions but the inherited flake baseline persists. |

**Score:** 2/5 fully verified (#3 SAT, plus #4 partial-acceptable via CI-03 docs landed). #1 PARTIAL, #2 + #5 FAILED. Counted strictly: 3/5 (treating #4 as PASS given deferred-gate context + user confirmation).

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | BROWN-01/02 dogfood validation against this repo's jj backend | Phase 6 | ROADMAP.md Phase 6 stub lines 175-178 absorb both BROWN reqs; REQUIREMENTS.md 277-278 re-bucket; user context confirms this is the documented D-31 deferral |
| 2 | CI matrix flip (continue-on-error → required-blocking) for jj-colocated + jj-native lanes | Phase 5 deferred indefinitely | Plan 05-05 SUMMARY documents the proposed YAML diff but explicit non-landing; user context confirms COMPLETE-WITH-CAVEAT framing (no active CI for this fork; 10-day soak observation deferred) |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `sdk/src/vcs/backends/jj.ts` (A3 fix) | GSD_HOOK_SKIP_COLOCATED + D-32 prose | ✓ VERIFIED | `grep -n "GSD_HOOK_SKIP_COLOCATED\|D-32"` returns 6 hits including the env probe at line 264 |
| `sdk/src/query/{push,reset,revert,log,status,diff,branch-list,head-ref,current-branch,merge,restore}.ts` | 11 new verbs | ✓ VERIFIED | All 11 files present, sized 0.8-3.0 KB each |
| Paired `*.test.ts` files for the 11 verbs | 11 unit tests | ✓ VERIFIED | All 11 present; mock createVcsAdapter pattern (which is the test gap that masked CR-01/CR-02) |
| `sdk/src/query/command-static-catalog-foundation.ts` registrations | 11 Map entries | ✓ VERIFIED | 11 entries for the new verbs present |
| `sdk/src/query/command-manifest.non-family.ts` entries | 11 manifest rows | ✓ VERIFIED | `grep -c "canonical: '...'"` = 11 |
| `sdk/src/vcs/__tests__/cmd-*-jj.test.ts` | 16 integration tests (5 + 6 + 5) | ✓ VERIFIED | 16 cmd-*-jj.test.ts files: new-project, plan-phase, execute-phase, discuss-phase, quick (Plan 05-02); undo, pr-branch, hotfix, ship, complete-milestone, verify-work (Plan 05-03); resume-work, pause-work, import, ingest-docs, map-codebase (Plan 05-04) |
| `sdk/src/vcs/__tests__/synth-planning-fixture.{ts,test.ts}` | Synth fixture factory | ✓ VERIFIED | Both files exist (6199 + 3394 bytes) |
| Workflow rewrites: `execute-phase.md` + `quick.md` (Plan 05-02) | VCS-agnostic, correct jq paths | ✓ VERIFIED | `.data.` paths absent; uses `.raw` / `.nameOnly` correctly |
| Workflow rewrites: `undo.md` + `complete-milestone.md` + `code-review.md` (Plan 05-03) | VCS-agnostic | ⚠️ ORPHANED | Files rewritten but JSON unwrap paths broken (CR-01) — surface exists but data flow disconnected |
| Agent rewrites: `gsd-code-fixer.md` + `gsd-executor.md` (Plan 05-03) | VCS-agnostic with prohibition prose preserved | ⚠️ ORPHANED | Files rewritten; prohibition prose grep returns 5 matches (git clean / git push --force preserved). BUT 7+2=9 `.data.X` jq paths broken (CR-01) |
| Pitfall 6 prose in `undo.md` | Destructive jj semantics paragraph | ✓ VERIFIED | Line 222: 'destructive on jj'; line 257 mentions `jj op log`/`jj op restore`; JJOP-01 v2 reference present |
| `.planning/intel/ci-jj-soak.md` | Soak tracker scaffold | ✓ VERIFIED | 4547-byte file present |
| `.github/workflows/test.yml` CI-03 docs | "GitHub is git" prose | ✓ VERIFIED | Line 5 + Line 86 carry the architectural-boundary note |
| `.github/workflows/test.yml` matrix flip to required-blocking | continue-on-error: false on jj lanes | ✗ NOT LANDED | Line 88 still `continue-on-error: ${{ matrix.backend == 'jj-colocated' || matrix.backend == 'jj-native' }}` — deferred per user context |
| `.planning/ROADMAP.md` Phase 5 criterion #3 amended | Synthetic-fixture phrasing | ✓ VERIFIED | Line 149 reads "pass integration tests against synthetic jj fixtures... re-bucketed to Phase 6 per CONTEXT D-31" |
| `.planning/REQUIREMENTS.md` BROWN re-bucketing | BROWN-01/02 → Phase 6 | ✓ VERIFIED | Lines 277-278 confirm; per-phase distribution line 292 updated |
| Flake-fix patches on 7 jj-* test files | describe.sequential / Math.random suffixes | ✓ VERIFIED | All 7 files have either `describe.sequential` or `Math.random().toString(36)` markers (per-file counts: 3/2/2/8/2/3/1) |
| MIGR-02 cosmetic sweep on 6 cjs files | Comment/error-string updates | ✓ VERIFIED | REQUIREMENTS.md:211 marks MIGR-02 Complete with cosmetic sweep note; lint-vcs-no-raw-git remains 0 violations per 05-05 SUMMARY |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| Workflows (Plan 05-03) → SDK query verbs | `jq -r '.data.X'` extraction | result.data unwrap layer | ✗ NOT_WIRED | CR-01: query-dispatch.ts:239 already strips `.data`; workflow paths read null |
| `log.ts` / `diff.ts` `--range` → adapter | `vcs.log({rev})` / `vcs.diff({rev})` | raw string cast to RevisionExpr | ✗ NOT_WIRED | CR-02: `as unknown as RevisionExpr` cast; toGitRev throws on any non-encoded string |
| `push.ts` `--bookmark` → `vcs.push()` | `ref: bookmark as RevisionExpr` | same cast hazard | ✗ NOT_WIRED | WR-03: cmd-ship-jj.test.ts:108-111 documents the throw |
| `revert.ts` `--abort` flag → adapter | git revert --abort dispatch | flag handler | ✗ NOT_WIRED | CR-04: no handler exists; argv-loop silently consumes --abort, then errors on missing positional rev |
| jj.ts commit() → fireHook (D-32 A3 fix) | unconditional fire modulo env | direct call | ✓ WIRED | Line 264 reads GSD_HOOK_SKIP_COLOCATED; line 266-267 doc comment cites D-32 |
| Static catalog → 11 new query verbs | Map entries | imports + Map | ✓ WIRED | Imports + 11 Map entries present |
| Manifest → 11 new query verbs | canonical/aliases/mutation/outputMode rows | non-family.ts | ✓ WIRED | 11 manifest rows present |
| Brownfield CMD-10 tests → synth-planning-fixture | import + use | factory call | ✓ WIRED | All 5 test files import synthPlanningFixture (per 05-04 SUMMARY) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| undo.md MODE=last log query | LOG entries | `gsd-sdk query log ... \| jq -r '.data.entries[]...'` | ✗ No — `.data.entries` is null (CR-01) | ✗ HOLLOW_PROP |
| complete-milestone.md branch detection | CURRENT_BRANCH var | `gsd-sdk query current-branch \| jq -r '.data.bookmarks // empty'` | ✗ No — null returned | ✗ HOLLOW_PROP |
| gsd-executor.md TASK_COMMIT capture | COMMIT_HASH var | `gsd-sdk query head-ref \| jq -r '.data.head // empty'` | ✗ No — null returned | ✗ HOLLOW_PROP |
| code-review.md phase-commit discovery | PHASE_COMMITS var | `gsd-sdk query log ... \| jq -r '.data.entries[]...'` | ✗ No — null returned | ✗ HOLLOW_PROP |
| execute-phase.md status check (Plan 05-02) | dirty-tree boolean | `gsd-sdk query status --porcelain \| jq -r '.raw // ""'` | ✓ Yes — correct path | ✓ FLOWING |
| quick.md commit cycle (Plan 05-02) | SDK commit call | `gsd-sdk query commit "..." --files <PLAN.md>` | ✓ Yes — direct verb invocation; no jq unwrap | ✓ FLOWING |
| Brownfield synth-fixture STATE.md read | stopped_at frontmatter | direct fs.readFile in test | ✓ Yes — bypasses SDK | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 11 new SDK verbs registered | `grep -c "canonical: '(push\|...)'" sdk/src/query/command-manifest.non-family.ts` | 11 | ✓ PASS |
| Pitfall 6 destructive-jj prose in undo.md | `grep "destructive\|jj op restore" undo.md` | 3 hits | ✓ PASS |
| No backend conditionals (D-33) | `grep -n "if vcs.adapter == 'jj'\|backend ==" workflows/*.md agents/*.md` | 0 hits | ✓ PASS |
| Prohibition prose preserved in gsd-executor.md | `grep -c "git clean\|git push --force"` | 5 | ✓ PASS |
| A3 fix landed | `grep -c "GSD_HOOK_SKIP_COLOCATED\|D-32" sdk/src/vcs/backends/jj.ts` | 6 | ✓ PASS |
| BROWN deferral edits in REQUIREMENTS.md | `grep "BROWN-01.*Phase 6"` | 1 hit (line 277) | ✓ PASS |
| ROADMAP criterion #3 amended (synthetic fixtures) | `grep "synthetic jj fixtures" .planning/ROADMAP.md` | 1 hit (line 149) | ✓ PASS |
| CI matrix continue-on-error flipped | `grep "continue-on-error: false" .github/workflows/test.yml` for jj lanes | Not landed (line 88 still conditional) | ✗ FAIL (deferred per user context) |
| CR-01: query-dispatch unwraps result.data | `grep "formatSuccess(result.data" sdk/src/query/query-dispatch.ts` | Line 239 | ✓ PASS (CR-01 confirmed) |
| CR-02: log/diff RevisionExpr cast hazard | `grep "as unknown as RevisionExpr" sdk/src/query/{log,diff,push}.ts` | 3 hits (log.ts:47, diff.ts:62, push.ts:61) | ✓ PASS (CR-02/WR-03 confirmed) |
| .data.X jq path count in 05-03 outputs | `grep -cE "\.data\." {undo,complete-milestone,code-review}.md gsd-{executor,code-fixer}.md` | 24 total (4+8+3+7+2) | ✓ PASS (CR-01 scope confirmed) |
| Flake-fix patterns landed on 7 files | `grep "describe.sequential\|Math.random(.toString" jj-{octopus,lock,hooks,workspace,push-fetch,commit}.test.ts exec-env-passthrough.test.ts` | 7+ hits per file | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CMD-01 | 05-02 | /gsd-new-project on jj | ⚠️ UNCERTAIN | Test cmd-new-project-jj.test.ts exists; workflow execute-phase.md rewritten with correct `.raw` paths. REQUIREMENTS.md still shows "Pending" (line 263) — no status update landed. |
| CMD-02 | 05-02 | /gsd-plan-phase on jj | ⚠️ UNCERTAIN | Test cmd-plan-phase-jj.test.ts exists. REQUIREMENTS.md still "Pending" (line 264). |
| CMD-03 | 05-02 | /gsd-execute-phase on jj | ⚠️ UNCERTAIN | Test cmd-execute-phase-jj.test.ts exists; A3 hand-off lands in execute-phase.md:689. REQUIREMENTS.md still "Pending" (line 265). |
| CMD-04 | 05-02 (discuss) + 05-03 (verify-work + complete-milestone) | /gsd-discuss-phase + spillovers | ✗ BLOCKED | cmd-discuss-phase-jj.test.ts + cmd-verify-work-jj.test.ts + cmd-complete-milestone-jj.test.ts exist. BUT complete-milestone.md has 8 `.data.X` paths (CR-01) and 4 broken reset --mode mixed -- .planning/ sites (CR-03). REQUIREMENTS.md still "Pending" (line 266). |
| CMD-05 | 05-02 | /gsd-quick on jj | ⚠️ UNCERTAIN | cmd-quick-jj.test.ts exists; quick.md rewritten with correct paths. REQUIREMENTS.md still "Pending" (line 267). |
| CMD-06 | 05-03 | /gsd-undo destructive jj semantics | ✗ BLOCKED | cmd-undo-jj.test.ts exists with Pitfall 6 invariant assertion. Pitfall 6 prose in undo.md:222. BUT 4 `.data.X` paths broken (CR-01), `revert --abort` silently no-op'd (CR-04), `reset --mode mixed -- ...` discards filter (CR-03 line 243). REQUIREMENTS.md still "Pending" (line 268). |
| CMD-07 | 05-03 | /gsd-pr-branch via revset + duplicate | ⚠️ UNCERTAIN | cmd-pr-branch-jj.test.ts exists. REQUIREMENTS.md still "Pending" (line 269). |
| CMD-08 | 05-03 | /gsd-hotfix on jj | ✗ BLOCKED | cmd-hotfix-jj.test.ts exists with gsd/hotfix/ assertion. BUT depends on push --bookmark which throws (WR-03). REQUIREMENTS.md still "Pending" (line 270). |
| CMD-09 | 05-03 | /gsd-ship explicit push | ✗ BLOCKED | cmd-ship-jj.test.ts:108-111 actively asserts pushQuery throws Invalid RevisionExpr — bug locked in by test. Per WR-03 every workflow calling `gsd-sdk query push --remote X --bookmark Y` fails at runtime. REQUIREMENTS.md still "Pending" (line 271). |
| CMD-10 | 05-04 | Brownfield commands on jj | ✓ SATISFIED | 5 synthetic-fixture tests pass per 05-04 SUMMARY (13/13 in 5.97s). D-34 coverage gap explicitly documented. REQUIREMENTS.md still "Pending" (line 272) — needs status update. |
| CMD-11 | 05-03 | /gsd-code-review + /gsd-complete-milestone CMD surface | ✗ BLOCKED | code-review.md has 3 `.data.X` paths broken (CR-01); path-traversal glob check has missing boundary (CR-06). REQUIREMENTS.md still "Pending" (line 273). |
| PROMPT-01 | 05-02 + 05-03 | Workflow markdown VCS-agnostic | ⚠️ PARTIAL | Plan 05-02 outputs correct (execute-phase.md, quick.md). Plan 05-03 outputs have CR-01 (24 broken jq paths) + CR-03 + CR-06. REQUIREMENTS.md still "Pending" (line 274). |
| PROMPT-02 | 05-03 | Agent definitions VCS-agnostic | ⚠️ PARTIAL | gsd-code-fixer.md + gsd-executor.md rewritten; prohibition prose preserved. BUT 9 `.data.X` paths broken (CR-01). Branch-create gap-fill is Path B sweep TODO (acceptable per 05-03 SUMMARY). REQUIREMENTS.md still "Pending" (line 275). |
| PROMPT-03 | 05-05 | Multi-runtime parity per D-37 | ✓ SATISFIED | REQUIREMENTS.md:276 marks Complete via trust-installer closure. |
| BROWN-01 | 05-04 (deferred to Phase 6) | Brownfield dogfood | DEFERRED | REQUIREMENTS.md:277 re-bucketed to Phase 6 per D-31. |
| BROWN-02 | 05-04 (deferred to Phase 6) | First weekly rebase | DEFERRED | REQUIREMENTS.md:278 re-bucketed to Phase 6 per D-31. |
| CI-03 | 05-05 | GitHub Actions stay on git | ✓ SATISFIED | REQUIREMENTS.md:279 marks Complete; test.yml header carries the boundary docs. |

**Summary:** 4 of 17 requirements SATISFIED (CMD-10, PROMPT-03, CI-03 + BROWN-01/02 deferred = 5 if counting deferrals as resolved); 5 PARTIAL/UNCERTAIN (CMD-01/02/03/05/07 — tests exist but no REQUIREMENTS.md status update); 7 BLOCKED (CMD-04/06/08/09/11 + PROMPT-01/02 by CR-01..CR-06).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `sdk/src/query/log.ts` | 47 | `rev: range as unknown as RevisionExpr` | 🛑 Blocker | CR-02: every workflow call to `gsd-sdk query log --range ...` throws |
| `sdk/src/query/diff.ts` | 62 | `rev: range as unknown as RevisionExpr` | 🛑 Blocker | CR-02: every `gsd-sdk query diff --range ...` throws |
| `sdk/src/query/push.ts` | 61 | `ref: bookmark as unknown as RevisionExpr` | 🛑 Blocker | WR-03: every `gsd-sdk query push --bookmark ...` throws; ship workflow broken |
| `sdk/src/query/reset.ts` | 29-49 | No `--` separator handling, no paths field | 🛑 Blocker | CR-03: silently unstages entire index instead of `.planning/` only |
| `sdk/src/query/revert.ts` | 34-49 | `--abort` flag silently consumed | 🛑 Blocker | CR-04: undo workflow conflict-recovery is silent no-op |
| Workflows × 5 + agents × 2 (Plan 05-03 outputs) | 24 sites | `jq -r '.data.X'` reading null | 🛑 Blocker | CR-01: surface exists but data flow disconnected at JSON unwrap |
| `get-shit-done/workflows/code-review.md` | 137 | Glob-prefix without `/` boundary in path-containment | ⚠️ Warning | CR-06: admits sibling-directory escape (e.g., `/repobad` when REPO_ROOT=/repo) |
| `sdk/src/query/restore.ts` | 46 | `validateRefname` rejects `~` in `--from HEAD~1` | ⚠️ Warning | CR-05: `gsd-sdk query restore --from HEAD~1 <file>` errors before adapter |
| `sdk/src/query/merge.ts` | 46 | Same `validateRefname` over-broadness for rev-expressions | ⚠️ Warning | CR-05: blocks merge with rev-expressions |
| `sdk/src/vcs/__tests__/cmd-ship-jj.test.ts` | 108-111 | `.rejects.toThrow(/Invalid RevisionExpr/)` locking in WR-03 bug | ⚠️ Warning | Test documents the bug as expected behavior, masking the real defect |
| `sdk/src/query/diff.ts` | 50-53 | `--quiet` parsed but unused (dead code) | ℹ️ Info | IN-04: confusing no-op branch |
| `get-shit-done/workflows/code-review.md` | 218,339 | jq filter with mixed shell-escaped backslashes | ℹ️ Info | IN-06: shell-escaping fragility |
| `agents/gsd-executor.md` | 467-469,692-694 | Deny-list regex missing `hotfix/*` | ℹ️ Info | IN-07: hotfix branch could be misidentified as per-agent branch |

### Human Verification Required

#### 1. CR-01 empirical confirmation

**Test:** `cd sdk && pnpm build && node bin/gsd-sdk-query.js head-ref --cwd .`
**Expected:** JSON output with top-level `head` key (NOT nested under `data`). Confirms the workflow `.data.head` paths read null.
**Why human:** Verifier cannot run `pnpm build` from inside a worktree without potentially modifying state; one-shot SDK invocation is fast for a human.

#### 2. CR-02 empirical confirmation

**Test:** `cd sdk && node bin/gsd-sdk-query.js log --range "HEAD~2..HEAD" --max-count 2 --cwd .`
**Expected:** Either valid log entries OR `Error: Invalid RevisionExpr: 'HEAD~2..HEAD'`. Per review, the second.
**Why human:** Empirical contract verification beyond unit-test mock layer.

#### 3. Acceptance of CI matrix deferral

**Test:** Decision: is the COMPLETE-WITH-CAVEAT framing for the CI matrix flip (analogous to Phase 4's A3 caveat) acceptable for closing Phase 5?
**Expected:** User confirms (per provided context) that this is an accepted deferral, not a blocker.
**Why human:** A 10-day soak observation is a calendar gate; no automated verification can drive it; this is a policy decision.

### Gaps Summary

Phase 5 delivered a large surface — 11 new SDK verbs, A3 fix landed, 5 workflow files + 2 agent files rewritten, 16 CMD integration tests, synth-planning fixture, MIGR-02 sweep, CI-03 docs, flake fixes on 7 jj-* test files, PROMPT-03 closure. The structural work is largely correct: file existence and basic shape pass; D-33 anti-pattern guard is clean (no backend conditionals); D-32 A3 fix landed verbatim; D-31 deferral edits landed in ROADMAP + REQUIREMENTS; prohibition prose preserved; synthetic fixture coverage gap is explicitly documented.

**However, the phase ships with 6 Critical-tier defects (per landed REVIEW.md) that prevent the workflows from actually running on either backend:**

1. **CR-01** (24 broken sites across 5 files): `.data.X` jq paths read null because the SDK CLI unwraps `result.data` before serialization. Confined to Plan 05-03's outputs (Plan 05-02 used the correct `.X` form). One grep-and-rewrite pass fixes it.
2. **CR-02** (log.ts:47, diff.ts:62): `--range` argv cast to RevisionExpr without encoding throws on every non-encoded input. Empirically verified by reviewer; affects every workflow site that passes `HEAD~N..HEAD` or `<sha>..<sha>`.
3. **WR-03** (push.ts:61): Same cast hazard on `--bookmark`. `cmd-ship-jj.test.ts:108-111` actually asserts `.rejects.toThrow(/Invalid RevisionExpr/)` — the test locks in the bug. Every `gsd-sdk query push --bookmark <name>` is broken.
4. **CR-03** (reset.ts:29-49 + types.ts:369 + 4 workflow sites): `--ref HEAD --mode mixed -- .planning/` silently discards the path filter; unstages entire index. The complete-milestone.md milestone-close flow can produce empty commits or worse.
5. **CR-04** (revert.ts + undo.md:240): `--abort` flag silently consumed; undo conflict recovery is a no-op.
6. **CR-06** (code-review.md:137): Glob-prefix without `/` boundary admits sibling-directory traversal (e.g., `/repobad` passes a `$REPO_ROOT=/repo` check).

These 6 issues share a root cause: **the SDK contract layer was not exercised against the actual built `gsd-sdk` binary during the rewrite.** The 22 paired unit tests in `sdk/src/query/*.test.ts` mock `createVcsAdapter`, never reaching the `toGitRev` / `toJjRev` / `formatSuccess` pipeline. A single integration test that runs `node bin/gsd-sdk-query.js <verb> ...` against a tmp repo would have caught CR-01/CR-02/WR-03 immediately.

**Additionally**, REQUIREMENTS.md still shows CMD-01..11 + PROMPT-01/02 as "Pending" (lines 263-275). The status table was not updated to reflect Phase 5's landings — only PROMPT-03 / CI-03 / MIGR-02 / BROWN re-bucketing got status updates. This is a process gap independent of the runtime defects.

**Deferred (not blocking):**
- BROWN-01/02 → Phase 6 per CONTEXT D-31 (planned deferral, documented in ROADMAP/REQUIREMENTS).
- CI matrix flip → indefinite (soak observation requires active remote CI; user confirms COMPLETE-WITH-CAVEAT framing acceptable, analogous to Phase 4 A3).

**Net verdict:** The phase goal — "every upstream GSD command works correctly on a jj-only repo" + "workflow markdown rewritten to be VCS-agnostic" — is **not achieved at runtime**. Files exist, tests pass against mocked adapters, but the actual end-to-end command paths fail at the JSON unwrap boundary (CR-01) and at the RevisionExpr boundary (CR-02/WR-03). The phase produces a corpus that *would* satisfy the goal once the 6 Critical-tier defects are fixed — most of them are mechanical one-line changes per the REVIEW's fix prescriptions.

Recommended path: a focused gap-closure plan (call it 05-06 or fold into a Phase 5 hotfix) that addresses CR-01..CR-06 as one mechanical pass + adds a single integration test running the actual `gsd-sdk` binary against a tmp repo. Estimated scope: 1-2 hours of executor time given the REVIEW's pinpoint fix prescriptions.

---

_Verified: 2026-05-13T22:30:00Z_
_Verifier: Claude (gsd-verifier)_
