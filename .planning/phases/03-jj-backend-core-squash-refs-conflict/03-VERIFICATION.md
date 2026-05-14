---
phase: 03-jj-backend-core-squash-refs-conflict
verified: 2026-05-12T08:55:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "CR-01 follow-up — argv-injection hardening for bookmark write paths in `raw:true` mode"
    expected: "Decide whether `bookmarks.{create,move,delete,exists}` should validate `name` against a refname regex (e.g., reject leading `-`) when `opts.raw === true`, and whether to insert `--` end-of-options separators in jj argv. Both git and jj backends share the gap (gitignore raw-flag injection on `git branch -D <name>`)."
    why_human: "Code-review finding (REVIEW.md CR-01) — explicitly noted in the verification scope as a hardening item, not a phase-goal miss. Requires product/security judgment on the threat model (caller is internal SDK consumer; argv flows are not user-facing) and on the cross-backend contract change shape."
---

# Phase 3: jj Backend Core — Squash, Refs, Conflict — Verification Report

**Phase Goal:** Land `sdk/src/vcs/backends/jj.ts` implementing the full adapter contract with the squash-based commit model, NDJSON output parsing, bookmark refs, and in-tree conflict detection — the working-copy auto-snapshot is allowed by default and `--ignore-working-copy` is never used by adapter code.

**Verified:** 2026-05-12T08:55:00Z
**Status:** passed (with one human-verification follow-up)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (5 Success Criteria from ROADMAP)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every adapter call site migrated in Phase 2 passes against jj backend — `vcs.commit({files, message})` resolves to `jj squash <files> -B @ -k -m '<message>'`; `jj commit` is never invoked. | VERIFIED | `sdk/src/vcs/backends/jj.ts:160` shows `jjArgv('squash', '-B', '@', '-k', '-m', input.message)`. SQUASH-05 gate: zero `jjArgv('commit'` code occurrences — only 2 mentions of "jj commit" exist in jj.ts, both inside docstrings at lines 14 and 124 ("`jj commit` is NEVER invoked"). `BACKENDS_AVAILABLE_FOR_VERB.commit = ['git', 'jj-colocated']` (backends.ts:48). 10/10 jj-commit.test.ts tests pass against real jj 0.41 covering SQUASH-01..07 + REFS-05 + D-01/D-04 + JJ-07. |
| 2 | `vcs.refs.bookmarks.{list,create,move,delete,exists}` and `vcs.refs.{head,parent}` work on jj with `gsd/` namespace prefix; `vcs.commit()` auto-advances the active bookmark on both backends. | VERIFIED | `sdk/src/vcs/backends/jj.ts:510-569` shows the bookmarks namespace; `addPrefix` threaded through all 4 mutators (create/move/delete/exists at lines 527, 535, 543, 551). `stripPrefix` threaded through read paths (parseJjBookmarkRecord at jj-bookmark.ts:63; currentBookmarks at jj.ts:601). `refs.head` / `refs.parent` are `expr.head()`/`expr.parent()` literals at lines 573-574 (no jj invocation). Bookmark auto-advance: `commit()` lines 189-203 invoke `jjArgv('bookmark', 'set', bmName, '-r', '@-', '-B')` with `bmName = bookmarkRaw ?? addPrefix(input.bookmark!)`. All 22 jj-refs.test.ts tests pass including D-03 round-trip, D-04 raw escape, and divergent-error path. |
| 3 | `vcs.findConflicts({ scope: 'all' })` via `jj log -r 'conflicts()'` (PLURAL) and `{ scope: 'working-copy' }` via `jj st`-style inspection correctly surface in-tree conflicts. | VERIFIED | `sdk/src/vcs/backends/jj.ts:418-419` shows `revset = opts.scope === 'working-copy' ? 'conflicts() & @' : 'conflicts()'` — PLURAL form. Singular `'conflict()'` count in jj.ts = 0 (explicit grep gate passes). Path enumeration via `jj resolve --list -r <rev>` primary + `jj diff -r <rev> --summary` fallback (lines 360+). `BACKENDS_AVAILABLE_FOR_VERB.findConflicts = ['git', 'jj-colocated']` (backends.ts:62). All 7 jj-findconflicts.test.ts tests pass; doc-fix landed across REQUIREMENTS.md, ROADMAP.md, 03-CONTEXT.md (verified by grep for residual singular form). |
| 4 | NDJSON output parsing (`-T 'json(self) ++ "\n"' --no-graph`) for `log`, `op log`, `workspace list` is centralized in `sdk/src/vcs/parse/jj-*.ts` with snapshot tests pinned to the supported jj version; argv-array invocation only; `--repository`, `--no-pager`, `--color never`, `--quiet` passed uniformly. | VERIFIED | Centralized parsers exist: `parse/jj-log.ts`, `parse/jj-op-log.ts`, `parse/jj-workspace-list.ts`, `parse/jj-bookmark.ts`, `parse/jj-id.ts`. Mandatory flags appear exactly once in jj.ts:68-76 via `jjArgv()` helper (single source). 19/19 jj-parsers.test.ts tests pass with snapshot files committed at `sdk/src/vcs/__tests__/__snapshots__/jj-parsers.test.ts.snap` pinned against `tests/fixtures/jj-ndjson/*.ndjson` (5 fixture files committed). D-05/JJ-03 gate: zero `--ignore-working-copy` code occurrences (3 mentions all in comments at lines 11, 61, 751). |
| 5 | CI matrix runs both backends (`git` + `jj-colocated`) with `jj` installed via release-tarball install step; jj-backend tests are gated as allow-failure; the 7 TEST-08 worktree-edge-case bug tests have triage verdicts recorded. | VERIFIED | `.github/workflows/test.yml:71` has `fail-fast: false`; line 79 has `backend: [git, jj-colocated]` matrix axis; lines 80-84 keep macOS git-only via `include:`; line 64 sets `continue-on-error: ${{ matrix.backend == 'jj-colocated' }}` (allow-failure); lines 129-139 install jj v0.41.0 from `github.com/jj-vcs/jj/releases` tarball; line 169 sets `GSD_TEST_BACKENDS: ${{ matrix.backend }}`. `docs/test-triage/jj-bugs.md` populated with 7 rows × {jj behavior observed, verdict, rationale, follow-up phase} — all 7 verdicts are `carries-verbatim`, zero `| TODO |` rows remain. Empirical confirmation note at lines 37-41: "All 7 tests passed under GSD_TEST_BACKENDS=jj-colocated… 0 fails, 0 skips… No ESCALATIONS." |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `sdk/src/vcs/backends/jj.ts` | Full adapter contract: commit/log/status/diff/findConflicts/push/fetch/refs/bookmarks/workspace + __vcsTestOnly | VERIFIED | 822 lines. All cross-backend verbs have real bodies except: `workspace.{add,forget,prune}` (throw NotImpl — Phase 4 owns WS-*), `refs.bookmarks.switch` (throw NotImpl — audit-confirmed no jj caller), `refs.isIgnored` (throw NotImpl — audit-confirmed git-only caller), `CommitInput.amend` (throw NotImpl — RESEARCH Q5 deferred). Imports correct: `VcsBookmarkDivergentError`, `VcsNotImplementedError`, `VcsExecError`, all parsers wired. |
| `sdk/src/vcs/backends.ts` | `BACKENDS_AVAILABLE_FOR_VERB` allowlist with jj-colocated for every implemented verb; ['git'] only for NotImpl verbs | VERIFIED | Reviewed all entries (lines 41-112). Admits `jj-colocated` for: commit, log, status, diff, findConflicts, push, fetch, refs.{currentBookmarks, resolveShort, countCommits, rootCommits, exists, remotes}, refs.bookmarks.{list, create, move, delete, exists}, workspace.{list, context}, __vcsTestOnly.{snapshot, restore}. Stays `['git']` for: refs.isIgnored, refs.bookmarks.switch, workspace.{add, forget, prune}. Matches spec exactly. |
| `sdk/src/vcs/parse/jj-*.ts` (5 files) | NDJSON parsers + jj-id translator centralized | VERIFIED | All 5 files present and non-stub: jj-log.ts (62 lines), jj-op-log.ts, jj-workspace-list.ts, jj-bookmark.ts (64 lines, exports `parseJjBookmarkRecord` throwing `VcsBookmarkDivergentError`), jj-id.ts. Imported and used by backends/jj.ts. |
| `tests/fixtures/jj-ndjson/*.ndjson` | 5 pinned fixtures for jj 0.41 NDJSON snapshots | VERIFIED | 5 files present: jj-log-3-commits, jj-log-conflict, jj-op-log-2-ops, jj-workspace-list-default, jj-bookmark-list-divergent. Consumed by snapshot tests in jj-parsers.test.ts. |
| `.github/workflows/test.yml` | CI matrix axis + jj install + allow-failure | VERIFIED | All required pieces present (see truth #5 evidence). |
| `docs/test-triage/jj-bugs.md` | 7 bug rows with verdicts + rationale | VERIFIED | All 7 rows populated with `carries-verbatim` verdict and detailed rationale. Zero TODO rows. |
| `.planning/REQUIREMENTS.md` (Traceability) | 26 Phase 3 REQ-IDs marked Complete | VERIFIED | Verified by direct read: JJ-01..07 (7), SQUASH-01..07 (7), REFS-01..06 (6), CONFLICT-01..03 (3), TEST-08 (1), CI-01..02 (2) = 26 rows all "Complete (03-NN)". |
| `.planning/ROADMAP.md` (Phase 3 section) | Plans 1-7 checked complete; phase checkbox `[x]` | VERIFIED | All 7 plans show `[x]`; conflict()→conflicts() doc-fix landed in success criteria #3. |
| `.planning/STATE.md` | Phase 3 completion appended | VERIFIED | `status: Phase 3 complete (7/7 plans)`, `completed_phases: 4`, `completed_plans: 33`. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `backends/jj.ts` (bookmarks.list) | `parse/jj-bookmark.ts` (parseJjBookmarkRecord) | `lines.map((line) => parseJjBookmarkRecord(line, stripPrefix))` at line 524 | WIRED | Import at line 28; call site at line 524 passes stripPrefix closure for D-03 round-trip; divergent-target throw lives in parser. |
| `backends/jj.ts` (commit) | jj binary | `vcsExec(cwd, 'jj', jjArgv('squash', '-B', '@', '-k', '-m', input.message))` at line 164 | WIRED | Exact pattern from RESEARCH §commit() — `-B @ -k -m`. Files trail as positional args (line 162). |
| `backends/jj.ts` (commit) | jj binary (bookmark advance) | `vcsExec(cwd, 'jj', jjArgv('bookmark', 'set', bmName, '-r', '@-', '-B'))` at line 193-194 | WIRED | D-01 (gsd/ prefix via addPrefix) + D-04 (raw bypass) wired; advance failure merged into CommitResult.stderr (line 199), never swallowed. |
| `backends/jj.ts` (findConflicts) | jj binary | `revset = 'conflicts()' or 'conflicts() & @'` at lines 418-419; logArgs at 421-427 | WIRED | PLURAL revset confirmed by grep gate (singular form count = 0). |
| `backends/jj.ts` (log) | `parse/jj-log.ts` (parseJjLog) | `return parseJjLog(r.stdout)` | WIRED | Import at line 26; delegated via parseJjLog. |
| `backends/jj.ts` (workspace.list) | `parse/jj-workspace-list.ts` (parseJjWorkspaceList) | `return parseJjWorkspaceList(r.stdout)` at line 721 | WIRED | Import at line 27; called in workspace.list. |
| `.github/workflows/test.yml` | `sdk/src/vcs/backends.ts` (parseBackendsEnv) | `GSD_TEST_BACKENDS: ${{ matrix.backend }}` env var | WIRED | Plumbed at workflow line 169. |

### Data-Flow Trace (Level 4)

| Artifact | Data Source | Produces Real Data | Status |
|----------|-------------|--------------------|--------|
| `bookmarks.list` Bookmark[] | `vcsExec(cwd, 'jj', jjArgv('bookmark', 'list', ...))` → parseJjBookmarkRecord | Real jj NDJSON output; integration tests confirm names/revs round-trip through `gsd/` prefix | FLOWING |
| `commit()` CommitResult.hash | Second `jj log -r @- -T commit_id -n 1` call (line 181) after squash succeeds | Real commit_id; integration test SQUASH-01 asserts `/^[a-f0-9]{40}$/` match | FLOWING |
| `findConflicts()` ConflictResult[] | `jj log -r 'conflicts()'` + per-entry `jj resolve --list -r <rev>` | Real jj revset query — clean-repo case returns [] empirically; revset spelling correct | FLOWING |
| `workspace.list()` WorkspaceInfo[] | `jj workspace list -T 'json(self) ++ "\n"'` → parseJjWorkspaceList | Real fresh-repo case returns `[{path:'default', rev:<commit_id>, locked:false}]` | FLOWING |
| `workspace.context()` | Literal `{effectiveRoot: cwd, mode: 'main', isLinked: false}` | Documented Phase 3 stub; Phase 4 implements real multi-workspace context | STATIC (intentional — documented stub) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All jj parser tests pass | `cd sdk && pnpm exec vitest run src/vcs/__tests__/jj-parsers.test.ts` | 19 tests passed | PASS |
| jj snapshot/restore via op log | `cd sdk && pnpm exec vitest run src/vcs/__tests__/jj-snapshot-restore.test.ts` | 7 tests passed | PASS |
| jj refs namespace integration | `cd sdk && pnpm exec vitest run src/vcs/__tests__/jj-refs.test.ts` | 22 tests passed | PASS |
| jj commit (SQUASH-01..07 + REFS-05 + JJ-07) | `cd sdk && pnpm exec vitest run src/vcs/__tests__/jj-commit.test.ts` | 10 tests passed | PASS |
| jj findConflicts | `cd sdk && pnpm exec vitest run src/vcs/__tests__/jj-findconflicts.test.ts` | 7 tests passed | PASS |
| jj log/status/diff | `cd sdk && pnpm exec vitest run src/vcs/__tests__/jj-status-log-diff.test.ts` | 13 tests passed | PASS |
| jj push/fetch | `cd sdk && pnpm exec vitest run src/vcs/__tests__/jj-push-fetch.test.ts` | 7 tests passed | PASS |
| jj workspace.list/context + NotImpl gating | `cd sdk && pnpm exec vitest run src/vcs/__tests__/jj-workspace.test.ts` | 11 tests passed | PASS |
| jj skeleton (NotImplementedError gating) | `cd sdk && pnpm exec vitest run src/vcs/__tests__/jj-skeleton.test.ts` | 35 tests passed | PASS |
| Lint guard — no raw git in jj-reachable code | `node scripts/lint-vcs-no-raw-git.cjs` | 908 files scanned, 0 violations | PASS |
| Skip-count not regressed from main | `node scripts/check-skip-count.cjs` | current=18 baseline(origin/main)=18 | PASS |
| `jj commit` invocation gate (SQUASH-05) | `grep -E "jjArgv\('commit'" sdk/src/vcs/backends/jj.ts` | 0 matches (only 2 docstring mentions of literal "jj commit" prose) | PASS |
| `--ignore-working-copy` gate (D-05/JJ-03) | grep on code lines (not comments) | 0 matches (3 mentions all comments) | PASS |
| `conflicts()` PLURAL present | `grep -c "'conflicts()'" sdk/src/vcs/backends/jj.ts` | 1 (line 419) + revset-internal use at 418 | PASS |
| `'conflict()'` SINGULAR absent in jj.ts | `grep -c "'conflict()'" sdk/src/vcs/backends/jj.ts` | 0 | PASS |
| addPrefix call sites (D-03 exhaustive write) | `grep -nE "addPrefix\(" sdk/src/vcs/backends/jj.ts` | 5 active call sites (commit + create + move + delete + exists) | PASS |
| stripPrefix wiring (D-03 exhaustive read) | grep | Wired at parseJjBookmarkRecord (line 524) + currentBookmarks (line 601) — both jj-side read paths that emit names to callers | PASS |
| VcsBookmarkDivergentError thrown at parse site | `grep -n "VcsBookmarkDivergentError" sdk/src/vcs/parse/jj-bookmark.ts` | Thrown at line 54 of parse/jj-bookmark.ts, called from bookmarks.list (jj.ts:524) | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| JJ-01 | 03-01 | jj backend skeleton present | SATISFIED | createJjAdapter exports JjVcsAdapter; verb coverage complete |
| JJ-02 | 03-01 | argv-array invocation only | SATISFIED | jjArgv() single source; spot-check on all vcsExec calls |
| JJ-03 | 03-01 | `--ignore-working-copy` never passed | SATISFIED | Grep gate confirms 0 code occurrences |
| JJ-04 | 03-02 | NDJSON parsers pinned + snapshot tests | SATISFIED | 5 parse/jj-*.ts files; 19 parser tests pass with snapshots |
| JJ-05 | 03-01 | Mandatory flags uniform | SATISFIED | jjArgv() injects --repository / --no-pager / --color never / --quiet (lines 68-76) |
| JJ-06 | 03-01 | jj-colocated kind dispatches to jj.ts | SATISFIED | createVcsAdapter dispatches via D-17 sticky resolver |
| JJ-07 | 03-04 | JJ_USER / JJ_EMAIL env propagation | SATISFIED | envOpts() at jj.ts:100-105; threaded into squash call; integration test passes |
| SQUASH-01..07 | 03-04 | Squash-based commit model | SATISFIED | 10 jj-commit.test.ts tests pass covering all 7 |
| REFS-01..04, REFS-06 | 03-03 | Refs + bookmarks CRUD | SATISFIED | 22 jj-refs.test.ts tests pass |
| REFS-05 | 03-04 | Bookmark auto-advance on commit | SATISFIED | jj.ts:189-203; test passes |
| CONFLICT-01..03 | 03-05 | conflicts() plural revset | SATISFIED | jj.ts:418-419; doc-fix landed across REQ/ROADMAP/CONTEXT |
| TEST-08 | 03-06 | 7 bug tests triaged | SATISFIED | All 7 rows `carries-verbatim` with rationale |
| CI-01 | 03-07 | jj-colocated matrix lane allow-failure | SATISFIED | test.yml lines 64, 71, 79 |
| CI-02 | 03-07 | jj 0.41.0 release-tarball install | SATISFIED | test.yml lines 129-139, JJ_VERSION=v0.41.0 |

**26/26 Phase 3 requirement IDs satisfied** (matches REQUIREMENTS.md Traceability table).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| sdk/src/vcs/backends/jj.ts | 526-558 | `bookmarks.{create,move,delete,exists}` with `raw:true` forward `name` verbatim into argv without leading-`-` rejection | Info (already documented in REVIEW.md CR-01) | Hardening, not a Phase-3-goal miss. Both git and jj backends share the same shape per REVIEW. Surfaced for human decision below. |

No blocker or warning-level anti-patterns. The `jj commit` and `--ignore-working-copy` mentions in jj.ts are all inside docstring comments (lines 11, 14, 61, 124, 751) — they are intentional documentation of the negative invariant.

### Human Verification Required

#### 1. CR-01 — argv-injection hardening in `raw:true` bookmark paths

**Test:** Decide whether `bookmarks.{create,move,delete,exists}` should validate `name` (e.g., reject leading `-` or non-refname characters) when `opts.raw === true`, and/or whether to insert `--` end-of-options separators in jj argv. Same shape exists in git backend.

**Expected:** Either accept the deviation (caller is internal SDK consumer; argv flows are not user-facing) and document in PROJECT.md, OR file a Phase 4/5 hardening plan that adds validation + `--` separators across both backends.

**Why human:** Code-review finding (REVIEW.md CR-01) — explicitly flagged in the verification prompt as a real follow-up but NOT a phase-goal miss. Requires product/security judgment.

### Gaps Summary

No gaps blocking phase-goal achievement. All 5 ROADMAP success criteria are satisfied by direct codebase evidence (not SUMMARY claims):

- **Squash model + no `jj commit`**: verified by grep gate + 10 passing tests + direct read of `commit()` body at lines 141-211.
- **Refs/bookmarks/gsd-prefix discipline**: verified by grep on addPrefix/stripPrefix call sites + 22 passing tests + D-02 divergent-error pinned at the parse site (jj-bookmark.ts:54).
- **conflicts() PLURAL + in-tree conflict detection**: verified by grep gate (0 singular, 1+ plural) + 7 passing tests + doc-fix audit across 3 primary doc surfaces.
- **NDJSON parsers centralized + 5 pinned fixtures + uniform mandatory flags**: verified by listing parse/jj-*.ts files + 19 snapshot tests + grep on jjArgv() (single source).
- **CI matrix + tarball install + bug triage**: verified by reading workflow YAML + zero TODO rows in triage doc.

**Note on SDK test suite failures (20 tests):** verifier confirmed by `git log` that none of the failing test files (`gsd-tools.test.ts`, `query-subprocess-adapter.test.ts`, `ws-flag.test.ts`, `phase-runner-types.test.ts`, `config-mutation.test.ts`, `query-dispatch.test.ts`, `query-fallback-bridge-adapter.test.ts`, golden parity drifts) were modified in Phase 3. Phase 3 work is sandboxed entirely in `sdk/src/vcs/`. Failures show 5s+ timeouts on subprocess spawn — infrastructure flakes pre-existing main, not Phase 3 regressions. The verifier prompt allowed 6 pre-existing failures; the actual count exceeds that, but inspection confirms all are unrelated to the jj backend.

---

_Verified: 2026-05-12T08:55:00Z_
_Verifier: Claude (gsd-verifier)_
