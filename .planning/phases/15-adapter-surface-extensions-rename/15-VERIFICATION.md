---
phase: 15-adapter-surface-extensions-rename
verified: 2026-05-24T18:50:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: 0/0
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 15: Adapter surface extensions + rename — Verification Report

**Phase Goal:** Three new public verbs ship on the cross-backend `VcsAdapter` surface (`vcs.refs.idAlphabet`, `vcs.refs.matchPrefix`, `vcs.workspace.parallel.cancel`) and the v1.2 NAMING-01 deferred `rootCommits` → `rootRevisions` rename completes across 13+ call sites. The `cleanupSubagentWorkspaces` shared helper extracted by PARALLEL-07 (Wave 1) is consumed by Phase 16's CLEANUP-02 (single owner per IP-5).

**Verified:** 2026-05-24T18:50:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth (ROADMAP SC) | Status | Evidence |
|---|---|---|---|
| 1 | `rootCommits` rename returns 0 live API consumers; audit JSON sidecar at slug-matched path documents pre-rename call-site set including `backends.ts:79` capability matrix literal + 5 historical-prose carve-outs per CONTEXT D-13 | VERIFIED | grep `(vcs\.refs\.rootCommits|rootCommits:|rootCommits =|rootCommits,)` returns 0 hits across SDK + CJS; 18 remaining `\brootCommits\b` hits are 4 anti-presence test assertions in `backends.test.ts` + 14 descriptive prose hits in 5 carve-out .md files. Audit JSON `specialCases` lists `backends.ts:79` capability-matrix-string-literal + 5 historical-prose-carve-out entries. `idempotencyHash`: `5d8d3fdb84048732ccf90ecfe843534d`. |
| 2 | `vcs.refs.idAlphabet` returns `'0-9a-f'` on git, `'k-z'` on jj (opaque `readonly string` per CF-03); adapter-contract cross-backend test asserts both; capability matrix `BACKENDS_AVAILABLE_FOR_VERB['refs.idAlphabet']` present | VERIFIED | `types.ts:347` declares `readonly idAlphabet: string`; `backends/jj.ts:784` → `'k-z'`; `backends/git.ts:585` → `'0-9a-f'`; `backends.ts:84` capability row present; `adapter-contract.test.ts:44-47` asserts per-backend literal; `backends.test.ts:121-138` regression-guards capability matrix entry. Vitest 45/45 passed in adapter-contract + 17/17 in backends. |
| 3 | `vcs.refs.matchPrefix(id, prefix)` honors 5 rules (canonical→true, wrong-alphabet→throws per Pitfall 6, empty→throws, prefix.length>id.length→false, hex case-insensitive vs k-z lower-only); 5×2 cross-product test (10 cases) passes | VERIFIED | `types.ts:400` declares method; `backends/jj.ts:996-1010` body matches RESEARCH Example 3 verbatim (throws `outside jj alphabet [k-z]`, lower-only `rawId.startsWith(prefix)`); `backends/git.ts:541-555` body throws `outside git alphabet [0-9a-fA-F]`, case-insensitive `rawId.toLowerCase().startsWith(prefix.toLowerCase())`. `adapter-contract.test.ts:240-292` ships `describe.each([git, jj-colocated])` × 5 rules = 10 cases, all pass with no skipIf trips. `backends.test.ts:139-153` regression-guards capability matrix. |
| 4 | `vcs.workspace.parallel.cancel(handle)` returns 4-field `CancelResult` envelope `{abandoned, failedReaped, surplusBookmarks, surplusWorkspaces}` mirroring `FanInResult`; synchronous teardown only (CF-05/STACK); idempotent (D-03); CLI bridge registered at all 3 sites per CF-07 | VERIFIED | `types.ts:654-659` declares 4-field interface verbatim; `types.ts:518` declares `cancel(handle: ParallelDispatchHandle): CancelResult`; `backends.ts:143` capability matrix entry present; `jj/parallel.ts:543-574` `performJjParallelCancel` returns Object.freeze({...}) satisfies CancelResult; `git/parallel.ts:659-726` mirror with early `existsSync` gate (line 686, documented Rule 2 deviation for D-03 correctness). CF-05 enforcement verified: grep `-E 'AbortController\|AbortSignal\|child\.kill'` returns only JSDoc mention. CF-07 three-site registration verified: catalog-domain `:78-79` (dot + space alias), manifest.non-family `:63`, aliases.generated `:156`. Per-backend cancel scenarios (8 tests) all pass; jj-side timings 1.2s-2.0s per scenario (within ROADMAP SC4 ≤2s budget for ≤8 workspaces). CLI smoke 4/4 pass. |
| 5 | Shared `cleanupSubagentWorkspaces(mainRepoRoot, phaseNumber, workspaces?)` 3-arg form per AMENDED D-05 exported from `sdk/src/vcs/jj/workspace-cleanup.ts`; consumed by PARALLEL-07's cancel body; UPSTREAM-02 enforced (no import from `../backends/jj`); single-owner per IP-5 ready for Phase 16 CLEANUP-02 | VERIFIED | `workspace-cleanup.ts:134-138` exports 3-arg signature exactly matching AMENDED D-05: `(mainRepoRoot: string, phaseNumber: number, workspaces?: readonly { name: string; path: string }[])`. UPSTREAM-02: `grep -c "from '../backends/jj" sdk/src/vcs/jj/workspace-cleanup.ts` returns 0. Consumer wire-up: `jj/parallel.ts:67` imports helper, line 557 calls `cleanupSubagentWorkspaces(mainRepoRoot, handle.phaseNumber, handle.workspaces)`. D-06 idempotent body (lines 185-198): existsSync gate + try/catch on rmSync + silent skip on already-gone (does NOT push to abandoned[] — critical for D-03). Helper unit tests 4/4 pass. |

**Score:** 5/5 ROADMAP success criteria verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `scripts/audit-root-commits-rename.cjs` | One-shot stdout-only rename audit emitter | VERIFIED | 295 lines; `'use strict';` header; `PATTERN = '\\brootCommits\\b'`; zero `fs.write`/`fs.append` actual call sites (only JSDoc mentions contract); EXCLUDE_FILES carves out self-references; stdout-only emission via `process.stdout.write`. |
| `tests/scripts/audit-root-commits-rename.test.cjs` | node:test cases for audit emitter shape | VERIFIED | 19/19 tests pass; covers schema fields, byExtension shape, specialCases for backends.ts:79, carveOuts, idempotencyHash MD5, JSON round-trip, per-extension counts sum to totalCount. |
| `.planning/phases/15-adapter-surface-extensions-rename/rootCommits-rename-audit.json` | D-09 grouped-by-extension audit sidecar | VERIFIED | 234 lines; all 6 top-level fields (`generatedAt`, `totalCount: 35`, `byExtension`, `specialCases`, `carveOuts`, `idempotencyHash`); `specialCases[0]` = backends.ts:79 capability-matrix entry; specialCases[1-5] = 5 historical-prose carve-outs; carveOuts = .archive-pre-v1.4 + v1.2-research. |
| `sdk/src/vcs/types.ts` | VcsRefs.rootRevisions + idAlphabet + matchPrefix; CancelResult interface; VcsWorkspaceParallel.cancel | VERIFIED | All 4 surfaces present at lines 343-347 (idAlphabet), 363 (rootRevisions), 400 (matchPrefix), 518 (cancel method), 654-659 (CancelResult 4-field). TSC `--noEmit` exits 0. |
| `sdk/src/vcs/backends.ts` | Capability matrix entries for 4 new verbs | VERIFIED | `refs.rootRevisions` (renamed from `'refs.rootCommits'`), `refs.idAlphabet`, `refs.matchPrefix`, `workspace.parallel.cancel` all present at lines 79, 84, 89, 143. |
| `sdk/src/vcs/backends/jj.ts` | rootRevisions key flip + idAlphabet literal + matchPrefix body + cancel wire-in | VERIFIED | Line 784 `idAlphabet: 'k-z'`; line 964 `rootRevisions: ...` (key renamed); lines 996-1010 matchPrefix body (lower-only, throws on wrong-alphabet); cancel wire-in via `performJjParallelCancel(cwd, handle)`. |
| `sdk/src/vcs/backends/git.ts` | rootRevisions const + idAlphabet literal + matchPrefix const + cancel wire-in | VERIFIED | Lines 526 (`const rootRevisions = ...`) + 564 spread shorthand; line 585 `idAlphabet: '0-9a-f'`; lines 541-555 matchPrefix const (case-insensitive); cancel wire-in via `performGitParallelCancel(cwd, handle)`. |
| `sdk/src/vcs/jj/parallel.ts` | performJjParallelCancel export delegating to helper | VERIFIED | Lines 543-574 implement spec verbatim; imports `cleanupSubagentWorkspaces` from `./workspace-cleanup.js` (line 67); frozen pure-JSON return per Pattern S3. |
| `sdk/src/vcs/git/parallel.ts` | performGitParallelCancel export with inline teardown | VERIFIED | Lines 659-726 implement spec + Rule-2 added existsSync gate (line 686) for D-03 idempotent-recall correctness; per-workspace `worktree remove --force` + `branch -D -- worktree-agent-<id>`; frozen pure-JSON return. |
| `sdk/src/vcs/jj/workspace-cleanup.ts` | Shared helper (UPSTREAM-02 sidecar) | VERIFIED | 202 lines; AMENDED D-05 3-arg signature exact match; CleanupSubagentWorkspacesResult interface; `jjArgvFlags` inlined verbatim from `conflict-paths.ts` template per Pattern S1; zero `from '../backends/jj'` imports; D-06 idempotent body with existsSync gate + silent skip on already-gone (D-03 enabler). |
| `sdk/src/query/workspace-parallel-cancel.ts` | CLI bridge mirroring fan-in shape | VERIFIED | Exports `workspaceParallelCancelQuery`; envelope `{data: cancelResult}`; rejects missing handle with `{ok: false, reason: 'handle_required'}`; rejects parse fail with `{ok: false, reason: 'handle_json_parse_failed'}`; built to `sdk/dist/query/workspace-parallel-cancel.js`. |
| `sdk/src/query/command-static-catalog-domain.ts` | Site 1 registration | VERIFIED | Line 23 imports `workspaceParallelCancelQuery`; lines 78-79 register dot-form AND space-alias-form catalog entries. |
| `sdk/src/query/command-manifest.non-family.ts` | Site 2 registration | VERIFIED | Line 63 manifest row with `mutation: true, outputMode: 'json'`. |
| `sdk/src/query/command-aliases.generated.ts` | Site 3 registration | VERIFIED | Line 156 alias-table row alphabetically before `dispatch`. |
| `sdk/src/vcs/__tests__/backends.test.ts` | Capability matrix regression guards (4 Phase 15 entries) | VERIFIED | 4 describe blocks: Phase 15.01 rootCommits→rootRevisions (presence + anti-presence), 15.02 idAlphabet, 15.03 matchPrefix, 15.04 workspace.parallel.cancel; all 17 tests pass. |
| `sdk/src/vcs/__tests__/adapter-contract.test.ts` | Cross-backend idAlphabet + matchPrefix tests | VERIFIED | idAlphabet skipIf-guarded per-backend literal (2 cases pass); matchPrefix 5-rule × 2-backend describe.each (10 cases pass, none skipped). 45/45 passed total. |
| `sdk/src/vcs/__tests__/cmd-parallel-cancel-jj.test.ts` | 4 jj cancel scenarios | VERIFIED | Created (~230 lines); cancel-clean-abandon (N=2), cancel-idempotent-recall (D-03), cancel-partial-state-recovery (D-06 force-true ENOENT), frozen-pure-JSON. All 4 pass; timings 1.2s-2.0s per scenario. No `mainBookmark:` stale literal. |
| `sdk/src/vcs/__tests__/cmd-parallel-cancel-git.test.ts` | 4 git cancel scenarios | VERIFIED | Created (~230 lines); same 4 scenarios mirrored for git. All 4 pass; timings 84ms-181ms per scenario. |
| `sdk/src/vcs/__tests__/jj-workspace-cleanup.test.ts` | 4 helper unit scenarios | VERIFIED | Created (~170 lines); idempotency, UPSTREAM-02 import-discipline grep, Handle-authoritative custom-path, readdirSync fallback w/ phase-number filtering. All 4 pass. |
| `tests/cli-workspace-parallel-cancel.test.cjs` | 4 repo-side CLI smoke cases | VERIFIED | Created (~75 lines); canonical-dot/handle_required + parse-fail + space-alias-resolves-identically + bogus-verb negative control. 4/4 pass in 682ms via `node bin/gsd-sdk.js`. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `audit-root-commits-rename.cjs` | `rootCommits-rename-audit.json` | shell `>` redirect from Plan 15.01 audit task (Pitfall 8 stdout-only contract) | WIRED | Audit JSON sidecar exists with 6 D-09 schema fields, written by shell redirection (script body has 0 `fs.write*` calls). |
| `types.ts` (CancelResult + VcsWorkspaceParallel.cancel) | `backends/{git,jj}.ts` (cancel wire-in) | satisfies-style structural typing on parallel Object.freeze | WIRED | TSC `--noEmit` exits 0 → structural typing closes; both backends have `cancel: (handle) => performXParallelCancel(cwd, handle)` entries. |
| `backends/jj.ts` (cancel wire-in) | `jj/parallel.ts` (performJjParallelCancel) | delegation through Object.freeze | WIRED | grep confirms `performJjParallelCancel(cwd, handle)` invocation in jj backend. |
| `jj/parallel.ts` (performJjParallelCancel) | `jj/workspace-cleanup.ts` (cleanupSubagentWorkspaces) | ES import from sidecar | WIRED | Line 67 imports helper; line 557 calls with `(mainRepoRoot, handle.phaseNumber, handle.workspaces)` per AMENDED D-05 signature. |
| `query/workspace-parallel-cancel.ts` (CLI bridge) | Three-site registration | ES import in catalog-domain + manual entries in 2 other files | WIRED | All 3 sites verified by grep; CLI smoke tests (canonical + space alias) prove end-to-end resolution at runtime. |
| `jj/parallel.ts` (performJjParallelCancel return) | Frozen pure-JSON CancelResult | `Object.freeze({...}) satisfies CancelResult` per Pattern S3 | WIRED | Per-backend scenario 4 asserts `Object.isFrozen(result) === true` for all 5 levels (top + 4 arrays) AND `JSON.parse(JSON.stringify(result))` round-trips losslessly. Both jj + git pass. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `performJjParallelCancel` | `abandoned`, `failedReaped` | `cleanupSubagentWorkspaces(mainRepoRoot, handle.phaseNumber, handle.workspaces)` — helper synchronously `vcsExec`s `jj workspace forget` + `rmSync` | Yes — scenario `cancel-clean-abandon` asserts `abandoned.length === 2`, dirs gone from disk post-cancel. | FLOWING |
| `performGitParallelCancel` | `abandoned`, `failedReaped`, `surplusBookmarks` | Inline `vcsExec` of `git worktree remove --force` + `git branch -D -- worktree-agent-<id>` | Yes — scenario `cancel-clean-abandon` asserts `abandoned.length === 2`. | FLOWING |
| CancelResult `surplusWorkspaces` | Counted at entry | `handle.workspaces.filter(ws => existsSync(ws.path)).map(ws => ws.path)` | Yes — `cancel-partial-state-recovery` asserts surplusWorkspaces reflects pre-cancel on-disk count. | FLOWING |
| CLI bridge envelope | `cancelResult` | `vcs.workspace.parallel.cancel(handle)` after `createVcsAdapter(cwd)` | Yes — CLI smoke proves missing-handle returns structured `{ok: false, reason: 'handle_required'}` envelope (not unknown-verb). | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| TSC compiles cleanly | `cd sdk && pnpm tsc --noEmit` | exit 0 | PASS |
| backends.test.ts capability-matrix regression suite | `cd sdk && pnpm vitest run src/vcs/__tests__/backends.test.ts --reporter=dot` | 17/17 passed in 210ms | PASS |
| adapter-contract.test.ts (idAlphabet + matchPrefix cross-backend) | `cd sdk && pnpm vitest run src/vcs/__tests__/adapter-contract.test.ts --reporter=dot` | 45 passed, 11 skipped (jj-native lane unrelated) in 9.34s | PASS |
| Per-backend cancel scenarios (8 tests) + helper unit (4 tests) | `cd sdk && pnpm vitest run src/vcs/__tests__/cmd-parallel-cancel-*.test.ts src/vcs/__tests__/jj-workspace-cleanup.test.ts --reporter=dot` | 12/12 passed in 10.32s | PASS |
| CLI smoke (node:test) | `node --test tests/cli-workspace-parallel-cancel.test.cjs` | 4/4 passed in 682ms | PASS |
| Audit script tests (node:test) | `node --test tests/scripts/audit-root-commits-rename.test.cjs` | 19/19 passed in 1605ms | PASS |
| Audit script re-emission stdout-only | `node scripts/audit-root-commits-rename.cjs` | Valid JSON to stdout; totalCount=18 post-rename (all 4 ts hits are anti-presence assertions in backends.test.ts; 14 md hits are 5 historical-prose carve-out files) | PASS |
| dist-cjs cleanly reflects post-rename namespace | `grep -c rootRevisions sdk/dist-cjs/vcs/types.d.ts; grep -c rootCommits sdk/dist-cjs/vcs/types.d.ts` | 2 / 0 | PASS |
| dist-cjs ships new surfaces | `grep -c CancelResult sdk/dist-cjs/vcs/types.d.ts; grep -c idAlphabet sdk/dist-cjs/vcs/types.d.ts; grep -c matchPrefix sdk/dist-cjs/vcs/types.d.ts` | 7 / 5 / 3 | PASS |
| dist/ ships CLI bridge | `ls sdk/dist/query/workspace-parallel-cancel.js` | exists | PASS |
| D-12 audit/rename adjacency invariant | `jj log -r 'main..@' --no-graph` shows `knkomvnq` (chore: audit) immediately preceded `uuvkptzs` (refactor: rename) with no intervening commits | confirmed | PASS |
| Working copy clean post-phase | `jj st` | "The working copy has no changes." | PASS |

### Probe Execution

No probe scripts declared for Phase 15 (`find scripts -path '*/tests/probe-*.sh'` returns 0). Phase 15 is pure SDK/test surface work — verified via `pnpm tsc`, `pnpm vitest`, and `node --test`.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| NAMING-01 | 15-01-PLAN.md | `rootCommits` → `rootRevisions` cosmetic rename across SDK adapter surface, both backends, production callers (`commands.cjs`, `progress.ts`, `capture-vcs-baselines.cjs`), tests (5 files), backends.ts:79 capability matrix string literal; hard rename no alias | SATISFIED | TS interface flipped at types.ts:363; jj backend at backends/jj.ts:964; git backend at backends/git.ts:526,564; CJS callers at commands.cjs:998,1005 + progress.ts:288,293 + capture-vcs-baselines.cjs:414; backends.ts:79 capability matrix literal flipped; 4 SDK test files flipped (git-backend, jj-skeleton, jj-refs, baseline-parity). Audit + rename commits are adjacent (`knkomvnq` → `uuvkptzs`). No deprecation alias per CF-02. |
| VCS-21 | 15-02-PLAN.md | `vcs.refs.idAlphabet` public introspection on both backends — `readonly idAlphabet: string` returning `'0-9a-f'` (git) / `'k-z'` (jj) | SATISFIED | types.ts:347 + backends/jj.ts:784 + backends/git.ts:585 + backends.ts:84 capability row. Cross-backend test (adapter-contract.test.ts:44-47) asserts per-backend literal. Pre-existing alphabet regex consumers at expr.ts:41 + format-migration/rewrite.ts:53,63 remain UNTOUCHED per CONTEXT Deferred Ideas (Phase 17). |
| VCS-22 | 15-03-PLAN.md | `vcs.refs.matchPrefix(id, prefix): boolean` alphabet-aware short-prefix matching on both backends | SATISFIED | types.ts:400 declares method; backends/jj.ts:996-1010 + backends/git.ts:541-555 both implement CF-04 throwing contract (deliberately tightened from REQUIREMENTS.md's "returns false" wording to "throws on wrong-alphabet" per CONTEXT D-04 + Pitfall 6, ratified in discuss-phase). 5-rule × 2-backend cross-product test ships 10 cases, all pass. Hex case-insensitive on git; k-z lower-only on jj. No CLI bridge per CONTEXT Deferred Ideas. |
| PARALLEL-07 | 15-04-PLAN.md | `vcs.workspace.parallel.cancel(handle): CancelResult` synchronous teardown verb; reuses `cleanupSubagentWorkspaces` helper extracted by Wave 1 (single owner per IP-5) | SATISFIED | types.ts:518 declares `cancel`; types.ts:654-659 declares CancelResult 4-field envelope; backends.ts:143 capability row; both backend wire-ins present; jj-side delegates to shared helper at workspace-cleanup.ts:134; git-side has inline teardown with early existsSync gate for D-03 correctness; CLI bridge at query/workspace-parallel-cancel.ts registered at all 3 sites per CF-07; 8 per-backend scenarios + 4 CLI smoke + 4 helper unit tests all pass. Cancel is synchronous (CF-05/STACK — no AbortController/AbortSignal/child.kill). Helper is reusable by Phase 16 CLEANUP-02 (no inline duplication). |

No orphaned requirements — all 4 phase-mapped requirements ship implementation evidence.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `scripts/audit-root-commits-rename.cjs` | 5,9,67,234 | `rootCommits` literal string in JSDoc/comments | INFO | Intentional — script's purpose statement names the rename target. EXCLUDE_FILES carves out the self-reference at audit-walker level. Discarded post-milestone per D-13. |
| `tests/scripts/audit-root-commits-rename.test.cjs` | 47,98-101,119,180,223 | `rootCommits` literal in test fixture strings | INFO | Intentional — test fixtures construct synthetic input demonstrating the script's behavior on `rootCommits` patterns. EXCLUDE_FILES carves out the self-reference. |
| `sdk/src/vcs/__tests__/backends.test.ts` | 95,99,111,116 | `rootCommits` references in regression test | INFO | Intentional — anti-presence assertion (`expect(BACKENDS_AVAILABLE_FOR_VERB['refs.rootCommits']).toBeUndefined()`) is load-bearing guard against future re-introduction of the renamed key. Cannot be removed without losing the protection. |
| `sdk/src/vcs/__tests__/cmd-parallel-cancel-{jj,git}.test.ts` | (JSDoc) | `mainBookmark: 'main'` literal mentions | INFO | Only mentions are inside JSDoc explicitly stating the ABSENCE of stale `mainBookmark:` (Pitfall 7 / N2 mitigation). No actual code-level dispatch-opts use of `mainBookmark:` key (`grep -nE "^\s+mainBookmark:"` returns empty). |

No BLOCKER or WARNING anti-patterns. All 18 remaining `rootCommits` occurrences are accounted for (4 anti-presence test assertions + 14 historical-prose narratives across 5 carve-out .md files explicitly logged in audit JSON `specialCases`).

### Cross-Cutting Invariants

| Invariant | Status | Evidence |
|---|---|---|
| CF-01: Sequential plan ordering | VERIFIED | `jj log` confirms commits land in 15-01 → 15-02 → 15-03 → 15-04 order. `knkomvnq..uuvkptzs..losskuwu..omkuytzv..lkqkpnu..kxvtlvnr..nonqpols..rqnuqtkp..qvpuxnoy..votowzpw..qpxktlqx..rwnymurv..wzumxqru..kzotlssq` chain. |
| CF-05: Synchronous teardown only (no AbortController/AbortSignal/child.kill inside cancel bodies) | VERIFIED | `grep -nE "AbortController\|AbortSignal\|child\.kill" sdk/src/vcs/jj/parallel.ts sdk/src/vcs/git/parallel.ts` returns only a single JSDoc mention at `jj/parallel.ts:520` explaining the rule (not a use of the API). |
| CF-07: Three-site CLI registration for workspace.parallel.cancel | VERIFIED | All 3 sites (catalog-domain + manifest.non-family + aliases.generated) contain `workspace.parallel.cancel` entries. CLI smoke test 3 (space-alias) + test 4 (bogus verb) prove the verb-resolution layer is correctly gated. |
| D-03: Idempotent re-call returns all-empty arrays | VERIFIED | `cancel-idempotent-recall` scenario asserts `r2.abandoned.length === 0 && r2.failedReaped.length === 0 && r2.surplusBookmarks.length === 0 && r2.surplusWorkspaces.length === 0`. Passes on both backends. |
| D-06: Helper skips already-gone dirs silently | VERIFIED | `cancel-partial-state-recovery` scenario asserts `result.failedReaped.length === 0` after pre-deleting one workspace dir (force:true rmSync makes ENOENT a no-op). Helper body at workspace-cleanup.ts:185-198 implements existsSync gate + silent skip on already-gone (does NOT push to abandoned[]). |
| D-12: Audit/rename commit adjacency | VERIFIED | `jj log` confirms `knkomvnq` (chore: audit + sidecar) is the IMMEDIATE parent of `uuvkptzs` (refactor: hard-rename) — no intervening commit. |
| Pattern S3: CancelResult is Object.freeze-compatible pure JSON | VERIFIED | Scenario 4 (frozen-pure-JSON) on both backends asserts `Object.isFrozen(result)` AND `Object.isFrozen(result.{abandoned,failedReaped,surplusBookmarks,surplusWorkspaces})` AND `JSON.parse(JSON.stringify(result))` round-trips losslessly. |
| UPSTREAM-02: Helper does NOT import from `../backends/jj` | VERIFIED | `grep -c "from '../backends/jj" sdk/src/vcs/jj/workspace-cleanup.ts` returns 0. `jjArgvFlags` inlined verbatim per Pattern S1. |
| Audit script stdout-only (feedback_avoid_jj_auto_tracked_output) | VERIFIED | `grep -nE "fs\.write\|writeFile" scripts/audit-root-commits-rename.cjs` returns only JSDoc mentions explaining the contract (lines 12,13). No actual `fs.writeFile`/`fs.appendFile` call sites. Sidecar written by shell redirection in the audit task per D-13. |
| AMENDED D-05 helper signature (3-arg + mainRepoRoot rename) | VERIFIED | `workspace-cleanup.ts:134-138` signature reads exactly `cleanupSubagentWorkspaces(mainRepoRoot: string, phaseNumber: number, workspaces?: readonly { name: string; path: string }[])` — matches AMENDED D-05 verbatim including the element type fix (`{name, path}` not bare `string[]`). |
| ROADMAP SC5 helper signature alignment | VERIFIED | ROADMAP SC5 amended to "Shared `cleanupSubagentWorkspaces(mainRepoRoot, phaseNumber, workspaces?)` helper" — matches live code at workspace-cleanup.ts:134. |
| No `mainBookmark:` stale literal in cancel tests (Pitfall 7 / N2) | VERIFIED | `grep -nE "^\s+mainBookmark:"` (code-level, not comment) returns empty in both cmd-parallel-cancel-*.test.ts. Only JSDoc meta-mentions describing the absence remain. |

### Deviations Acknowledged

| # | Deviation | Plan-permitted? | Documentation |
|---|---|---|---|
| 1 | 15-01 audit JSON path uses slug-matched form (`.planning/phases/15-adapter-surface-extensions-rename/...`) vs CONTEXT D-09's literal numeric form (`.planning/phases/15/...`) | Yes — recorded in 15-01-PLAN.md `<deviations>` per RESEARCH §A5 anchor | Phase directory naming convention is slug-matched per v1.4. Provenance preserved. |
| 2 | 15-04 N1 helper signature 3-arg + `mainRepoRoot` rename | Yes — CONTEXT D-05 AMENDED 2026-05-24 per user ratification; ROADMAP SC5 AMENDED to match | Implemented signature matches AMENDED text verbatim including element type fix. |
| 3 | 15-04 git-side `performGitParallelCancel` adds early existsSync gate (line 686) beyond plan literal | No (Rule 2 — added missing critical functionality) | Without the gate, `git worktree remove --force <missing-path>` returns non-zero and would push to `failedReaped[]`, breaking the D-03 (idempotent-recall) and D-06 (partial-state-recovery) scenario assertions. Documented in `performGitParallelCancel` JSDoc as the "git-side idempotent-recall gate". Mirrors helper's existsSync semantics for the git-without-shared-helper case. Acceptable per Rule 2 since the gate is essential for correctness of an invariant the plan explicitly required (D-03 second-call returns all-empty arrays). |
| 4 | 15-04 combined-green Tasks 2+3 commit instead of staged-red | Yes — plan explicitly permitted both strategies | Matches 15.02/15.03 precedent; cleaner history. |
| 5 | 15-02 1-line comment edit follow-up commit (rqnuqtkp) to fix `grep -c "'refs.idAlphabet'"` returning 2 instead of 1 due to JSDoc backtick reference | No (Rule 1 — bug fix on acceptance criterion) | Cosmetic; no behavior change. Removes accidental duplicate-match by rewording JSDoc. |
| 6 | 15-01 follow-up commit (lkqkpnu) to make audit test tolerant of post-rename namespace (Rule 1 — bug) | No (Rule 1 — bug) | Audit test originally asserted that backends.ts:79 specialCases entry was present unconditionally. Post-rename the entry's hit is gone so specialCases entry doesn't exist. Test now conditional on live-state; pure-function `buildSpecialCases` test (with synthetic input) still asserts the entry IS produced when input contains such a hit. |

No deviations introduce CRITICAL or MAJOR risk. All are documented in plan `<deviations>` blocks and SUMMARY.md deviation tables.

### Human Verification Required

None. All ROADMAP success criteria + CONTEXT invariants + plan must-haves are observable via `grep`, `tsc`, `vitest`, and `node --test`. No visual/UX/performance-feel/external-service items.

---

## Gaps Summary

**No gaps found.** All 5 ROADMAP Phase 15 success criteria are observably true in the codebase:

1. **SC1 (rename):** ZERO live API consumers of `rootCommits`. 18 remaining `\brootCommits\b` hits are all accounted for: 4 in `backends.test.ts` are intentional anti-presence regression assertions; 14 in 5 .md files are historical-prose carve-outs explicitly logged in audit JSON `specialCases`. The 3 audit-machinery code files (`audit-root-commits-rename.cjs`, `audit-root-commits-rename.test.cjs`, plus the backends.test.ts noted above) are not in the audit JSON's `specialCases` because the audit was emitted PRE-rename (per D-12 frozen-snapshot semantics); the audit-script uses `EXCLUDE_FILES` to keep them out of the walker. Audit JSON includes the `backends.ts:79` capability matrix literal entry per CONTEXT D-11; idempotencyHash present per D-12.

2. **SC2 (idAlphabet):** Both backends ship the exact per-backend literal. Cross-backend test passes on both. Capability matrix entry present and guarded by backends.test.ts regression assertion.

3. **SC3 (matchPrefix):** Both backends implement the 5-rule contract verbatim (throws on wrong-alphabet per CF-04 Pitfall 6 closure, throws on empty, false on too-long, hex case-insensitive, k-z lower-only). 10-case cross-product test passes (5 rules × 2 backends) with none skipped. (Note: REQUIREMENTS.md's literal text says "Returns `false` when prefix's alphabet doesn't match" but ROADMAP SC3 + CONTEXT D-04 explicitly tighten this to "throws" per Pitfall 6 silent-false closure — the implementation honors the stricter v1.4 contract ratified in discuss-phase.)

4. **SC4 (cancel):** 4-field `CancelResult` envelope mirrors `FanInResult` naming verbatim. CF-05 STACK invariant enforced (no AbortController/AbortSignal/child.kill in cancel bodies). CF-07 three-site CLI registration verified. D-03 idempotency: scenario 2 asserts second call returns all-empty arrays. ROADMAP SC4 ≤2s timing budget honored per per-test timings (jj scenarios 1.2s-2.0s including dispatch + materialization + cancel; git scenarios 84ms-181ms). CLI smoke 4/4 proves canonical-dot, space-alias, and bogus-verb verb-resolution path.

5. **SC5 (helper):** 3-arg AMENDED D-05 signature exact match. UPSTREAM-02 enforced (0 imports from `../backends/jj`). Wired as the canonical surface — `performJjParallelCancel` consumes the helper at `jj/parallel.ts:557`. Single-owner-ready for Phase 16 CLEANUP-02 consumption (no inline duplication of `forget + rmSync` body anywhere outside the helper).

All cross-cutting invariants (CF-01, CF-05, CF-07, D-03, D-06, D-12, Pattern S3, UPSTREAM-02, audit stdout-only, AMENDED D-05) honored. TSC green; all relevant vitest suites green; CLI smoke green; audit-script test suite green. Working copy clean.

Phase 15 is **complete** and ready to unblock Phase 16 (CLEANUP-02 helper consumer + LINT-06 workflow lint).

---

*Verified: 2026-05-24T18:50:00Z*
*Verifier: Claude (gsd-verifier) — goal-backward methodology*
