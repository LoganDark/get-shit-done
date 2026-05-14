---
phase: 03-jj-backend-core-squash-refs-conflict
plan: 03
subsystem: vcs-adapter
tags: [jj, refs, bookmarks, gsd-prefix, divergence, vcs-adapter, ndjson]

requires:
  - phase: 03-jj-backend-core-squash-refs-conflict
    plan: 01
    provides: jj.ts skeleton + addPrefix/stripPrefix helpers + per-verb allowlist machinery
  - phase: 03-jj-backend-core-squash-refs-conflict
    plan: 02
    provides: production parsers + __vcsTestOnly snapshot/restore body + allowlist admits jj-colocated for snapshot lane
provides:
  - "vcs.refs.{head, parent} (revexpr-only, no jj invocation) — JjVcsAdapter parity with Git"
  - "vcs.refs.bookmarks.{list, create, move, delete, exists} bodies; D-03 gsd/ prefix discipline exhaustive; D-04 raw escape opt-in"
  - "vcs.refs.{currentBookmarks, resolveShort, countCommits, rootCommits, exists, remotes} bodies"
  - "VcsBookmarkDivergentError throw via parse/jj-bookmark.ts on multi-target bookmark records (D-02)"
  - "VcsBookmarks interface extension — every mutator + switch accept {raw?: boolean} (D-04)"
  - "BACKENDS_AVAILABLE_FOR_VERB flipped for 11 refs.* verbs (every verb with a body in this plan)"
  - ".planning/phases/.../03-03-AUDIT.md — per-caller classification for switch + isIgnored confirming no jj-reachable callers"
affects: [03-04, 03-05, 03-06, 03-07]

tech-stack:
  added: []
  patterns:
    - "addPrefix(name, opts?.raw) — single-source-of-truth gsd/ prefix add (5 write-path call sites)"
    - "stripPrefix(name) — single-source-of-truth gsd/ prefix strip (read-path, threaded into parseJjBookmarkRecord)"
    - "parseJjBookmarkRecord pure parser — divergent-check unit-testable without jj binary"
    - "Per-kind contract-test branching (vcs.kind === 'jj' vs 'git') for tests where backends' initial state differs structurally"

key-files:
  created:
    - "sdk/src/vcs/parse/jj-bookmark.ts (64 LOC — parseJjBookmarkRecord, D-02 throw)"
    - "sdk/src/vcs/__tests__/jj-refs.test.ts (251 LOC — 5 parser-level + 17 live integration tests)"
    - ".planning/phases/03-jj-backend-core-squash-refs-conflict/03-03-AUDIT.md (per-caller classification for switch + isIgnored)"
  modified:
    - "sdk/src/vcs/types.ts (VcsBookmarks methods accept opts?:{raw?:boolean} — D-04 contract extension)"
    - "sdk/src/vcs/backends/git.ts (bookmarks mutators accept-and-ignore opts.raw — D-04 no-op on git)"
    - "sdk/src/vcs/backends/jj.ts (refs + bookmarks real bodies; +210 / -55 LOC; notImpl call sites 27 → 11)"
    - "sdk/src/vcs/backends.ts (BACKENDS_AVAILABLE_FOR_VERB allowlist flipped for 11 refs.* verbs)"
    - "sdk/src/vcs/__tests__/jj-skeleton.test.ts (throw expectations replaced — was-stub-now-wired)"
    - "sdk/src/vcs/__tests__/backends.test.ts (allowlist assertion updated for the flip)"
    - "sdk/src/vcs/__tests__/adapter-contract.test.ts (per-kind branching for jj-shape differences)"

key-decisions:
  - "Extracted parseJjBookmarkRecord to parse/jj-bookmark.ts (not inlined in jj.ts) — mirrors parse/jj-log.ts shape and makes the D-02 divergent-check unit-testable without a real jj binary. The plan offered planner discretion; parity with the other NDJSON parsers wins."
  - "notImpl(verb) helper still in use for the still-deferred verbs (commit/log/status/diff/findConflicts/push/fetch/workspace.*/switch/isIgnored) — refs.bookmarks.switch + refs.isIgnored use a direct `throw new VcsNotImplementedError(...)` because they carry per-verb auditability prose referring to 03-03-AUDIT.md. Mixed inline+helper is intentional."
  - "countCommits template emits `commit_id ++ \"\\n\"` rather than the plan's suggested `\"\\n\"`. The plan's template produced a single trailing newline per commit that vcsExec's stdout-trim then ate, miscounting as zero. Switching to a per-line commit_id emit keeps each commit's contribution non-empty after trim and counts via `.split('\\n').filter(Boolean).length` — same idiom every other parser in this file uses."
  - "refs.exists nonexistent-SHA probe uses `ffff...ffff` instead of `0000...0000` (in the adapter-contract test). jj uses `0000...0000` as its synthetic root commit id (`root()` revset resolves to it), so the all-zeros probe returns true on jj — a real cross-backend semantic difference, not a bug. Documented inline in the test comment."
  - "Per-kind branching in adapter-contract tests where jj's initial state differs structurally (jj has no implicit `main` bookmark; jj's currentBookmarks() is [] post-init because @ is anonymous). Mirrors the deviation pattern from plan 03-01 (BACKENDS_AVAILABLE flip required adapter-contract.test.ts adjustments)."
  - "Format-migration tracker (D-19) — no entries appended. Plan 03-03 ships no new .planning/ revision-id-encoding format. The bookmark name munging is in-memory only (per the plan's `<objective>` text)."

patterns-established:
  - "parseJjBookmarkRecord(line, stripPrefix) — pure NDJSON-line parser used by both the live backend's bookmarks.list and the deterministic unit-test pipeline. Mirrors the parse/jj-log.ts / parse/jj-op-log.ts / parse/jj-workspace-list.ts shape."
  - "Per-kind contract-test branching: when initial state differs between backends, use `if (vcs.kind === 'jj') { /* jj-specific setup */ } else { /* git-implicit-state path */ }` inside a single test rather than splitting into per-backend describe blocks. Keeps the cross-backend property assertion in one place."

requirements-completed: [REFS-01, REFS-02, REFS-03, REFS-04, REFS-06]

duration: ~11min
completed: 2026-05-12
---

# Phase 03 Plan 03: jj Refs + Bookmarks Bodies Summary

**Production bodies for every `vcs.refs.*` + `vcs.refs.bookmarks.*` verb on the jj backend except `switch` + `isIgnored` (audit-confirmed deferred); D-02 `VcsBookmarkDivergentError` throws via the new `parse/jj-bookmark.ts` pure parser; D-03 `gsd/` prefix discipline exhaustive across 5 write call sites and 2 read call sites; D-04 `{raw:true}` escape extends `VcsBookmarks` additively; `BACKENDS_AVAILABLE_FOR_VERB` flipped to admit `jj-colocated` for 11 refs.* verbs.**

## Performance

- **Duration:** ~11 min (2 atomic task commits)
- **Tasks:** 2/2
- **Files modified/created:** 10 (3 created, 7 modified)
- **Lint guard (no raw git):** 0 violations / 902 files
- **JJ-03 invariant (`--ignore-working-copy` absent excluding comments):** 0 occurrences
- **SQUASH-05 invariant (`jj commit` never invoked):** 0 occurrences in jj.ts
- **TypeScript compile:** `tsc -p tsconfig.cjs.json --noEmit` exit 0
- **Skip-count guard:** current=18 baseline=18 (no change)

## Accomplishments

- **`refs.head` / `refs.parent` remain revexpr-only.** Both are now equal to `expr.head()` / `expr.parent()` respectively on the jj adapter (no jj invocation), matching the git adapter's surface. Pinned by `jj-refs.test.ts:refs.head equals expr.head()` and `:refs.parent equals expr.parent()`.

- **`refs.bookmarks.{list, create, move, delete, exists}` bodies landed.** Each write path threads through `addPrefix(name, opts?.raw)` (5 call sites); the read path (`list`) threads through `stripPrefix` via the new `parseJjBookmarkRecord` helper. The `{raw:true}` escape opts out of the prefix add (D-04).

- **D-02 `VcsBookmarkDivergentError` throws via `parse/jj-bookmark.ts`.** The pure-function parser detects `target.length > 1` on `jj bookmark list -T 'json(self) ++ "\n"'` NDJSON records and surfaces the error with `bookmarkName` + `divergentTargets`. Deterministic unit-test coverage feeds the plan 03-02 `jj-bookmark-list-divergent.ndjson` fixture through the parser.

- **`refs.currentBookmarks` reads at `@-` with `gsd/` stripped.** Uses `jj log -r @- -T 'bookmarks.join("\n")' --no-graph -n 1`; strips local-divergent `*` markers; strips the `gsd/` prefix per D-03. Returns `[]` for an empty WC (jj's natural anonymous-head state).

- **`refs.{resolveShort, countCommits, rootCommits, exists, remotes}` bodies landed.** `resolveShort` uses `commit_id.short()` template; `countCommits` emits one commit_id per line and counts non-empty lines (the plan's `"\n"`-only template was eaten by vcsExec's trim); `rootCommits` uses `root() & ::<rev>` revset; `exists` is an exit-0 + non-empty-stdout probe with a literal `"x"` template; `remotes` uses `jj git remote list -T 'name ++ "\n"'`.

- **`refs.bookmarks.switch` + `refs.isIgnored` deferred — audit confirmed.** Both throw `VcsNotImplementedError`. The audit (`03-03-AUDIT.md`) records every caller: `commands.cjs:319/321` (switch) and `core.cjs:613` (isIgnored) all pin `createVcsAdapter(cwd, { kind: 'git' })`, statically routing through the git branch. Test callers either guard with `if (kind !== 'git') throw` (baseline-parity) or are git-backend-scoped.

- **`BACKENDS_AVAILABLE_FOR_VERB` flipped for 11 refs.* verbs.** The allowlist now admits `jj-colocated` for `refs.bookmarks.list/create/move/delete/exists`, `refs.currentBookmarks`, `refs.resolveShort`, `refs.countCommits`, `refs.rootCommits`, `refs.exists`, `refs.remotes`. `refs.bookmarks.switch` + `refs.isIgnored` stay `['git']` only (audit-pinned).

- **REFS-06 (annotated tags) confirmed by absence.** The jj backend has no `createAnnotatedTag` method — the verb lives only on `vcs.gitOnly.createAnnotatedTag` (typed-narrowed via `vcs.kind === 'git'`). REQUIREMENTS REFS-06 spec ("tags-on-jj are bookmarks under `gsd/release/*`") is satisfied structurally: no code change needed; the bookmarks namespace + `gsd/` prefix discipline is the implementation surface.

## Task Commits

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Fill refs.* + refs.bookmarks bodies; extend VcsBookmarks for D-04; flip allowlist; add tests | `nsuzyopqpqottmlnmkwopklmprluxtlk` | 9 files (2 new + 7 modified) |
| 2 | Audit confirms no jj-reachable caller for switch + isIgnored | `kvnwywutzlpmlqqmvutvwpzspvpsrvyr` | 1 new file (03-03-AUDIT.md) |

## Files Created/Modified

### Created (3)

- `sdk/src/vcs/parse/jj-bookmark.ts` — pure-function `parseJjBookmarkRecord(line, stripPrefix)` with D-02 `VcsBookmarkDivergentError` throw + T-03.02-01 malformed-NDJSON line-preview Error
- `sdk/src/vcs/__tests__/jj-refs.test.ts` — 5 parser-level unit tests (always run) + 17 live integration tests against jj 0.41 (`describe.skipIf(!jjAvailable)`)
- `.planning/phases/03-jj-backend-core-squash-refs-conflict/03-03-AUDIT.md` — per-caller classification for `switch` + `isIgnored` confirming no jj-reachable callers

### Modified (7)

- `sdk/src/vcs/types.ts` — `VcsBookmarks` methods extended with `opts?:{raw?:boolean}` on `create`/`move`/`delete`/`exists`/`switch` (D-04 contract extension)
- `sdk/src/vcs/backends/git.ts` — bookmarks mutators accept-and-ignore `opts.raw` (no-op on git); added JSDoc explaining D-04 ignore semantics
- `sdk/src/vcs/backends/jj.ts` — refs + bookmarks real bodies replace `notImpl(...)` stubs; helpers (`addPrefix`/`stripPrefix`/`toJjRev`) actively used (the plan-01 `void`-shim no-ops removed for these three); `notImpl` literal occurrences in jj.ts drop from 27 → 11 (commit + 4 log/status/diff/findConflicts + push/fetch + 5 workspace.* + 2 leftover for switch/isIgnored that throw directly)
- `sdk/src/vcs/backends.ts` — `BACKENDS_AVAILABLE_FOR_VERB` flipped for 11 refs.* verbs to admit `jj-colocated`; comment block explains why `switch` + `isIgnored` stay `['git']`-only
- `sdk/src/vcs/__tests__/jj-skeleton.test.ts` — throw expectations replaced: bookmarks/refs verbs with bodies now expect `not.toThrow(VcsNotImplementedError)`; `switch` + `isIgnored` keep the throw assertion
- `sdk/src/vcs/__tests__/backends.test.ts` — allowlist assertion updated for the flip (per-verb expected values now reflect plan-03 reality)
- `sdk/src/vcs/__tests__/adapter-contract.test.ts` — per-kind branching for tests where jj initial state differs from git (no implicit `main` bookmark, anonymous `@`); nonexistent-SHA probe switched from `0000...` to `ffff...` (jj uses all-zeros as synthetic root commit id)

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| 03-03-D-A | Extract `parseJjBookmarkRecord` to `parse/jj-bookmark.ts` (vs inline in jj.ts) | Mirrors `parse/jj-log.ts` / `parse/jj-op-log.ts` / `parse/jj-workspace-list.ts` layout; makes the D-02 divergent-check unit-testable without spawning jj. The plan offered planner discretion (action text §F: "extract to parse/jj-bookmark.ts for parity"); chosen path matches the recommendation. |
| 03-03-D-B | `countCommits` template uses `commit_id ++ "\n"` (not the plan's `"\n"`) | The plan's suggested `"\n"`-only template emits a single trailing newline per commit; `vcsExec` trims trailing whitespace from stdout, so a single-commit invocation collapsed to empty stdout (counted 0). Using `commit_id ++ "\n"` makes each commit's emission non-empty after trim. The count flips to `.split('\n').filter(Boolean).length` — same idiom used by `rootCommits` and `remotes` in this same file. Discovered during Task 1 vitest run (Rule 1 — bug auto-fix). |
| 03-03-D-C | `refs.exists` nonexistent-SHA probe in contract test uses `ffff...ffff` (not `0000...0000`) | jj's synthetic root commit has id `0000000000000000000000000000000000000000` (`root()` revset resolves to it). On git this is the sentinel for "doesn't exist". The cross-backend probe needs a value that's non-existent on both backends — `ffff...ffff` works on both (jj exit 1 with "doesn't exist"; git exit non-zero from `cat-file -t`). Documented inline in the test. |
| 03-03-D-D | Per-kind branching in adapter-contract tests where initial state differs | jj's `initJjRepo` has no implicit bookmark (anonymous `@`); git's `initGitRepo` has `main`. The `bookmarks: create, exists, list, delete` test originally read `before[0].name` for the base — works on git, throws on jj (empty list). The `currentBookmarks` test asserted `length > 0` — true on git, false on jj. Both fixed by `if (vcs.kind === 'jj')`-branching inside the test body, preserving the cross-backend property assertion in a single place rather than splitting describe blocks. |
| 03-03-D-E | Direct `throw new VcsNotImplementedError(...)` for `switch` + `isIgnored` (not the `notImpl(verb)` helper) | These two throws carry per-verb prose pointing to `03-03-AUDIT.md` and the future Phase-4 reshape trigger. The `notImpl(verb)` helper produces a stock message; the per-verb prose is intentional documentation. Other still-stubbed verbs (commit, log, etc.) keep the helper because they're temporary. |
| 03-03-D-F | Format-migration tracker (D-19) — no entries appended | Plan 03-03 ships no new `.planning/` revision-id-encoding format. The `gsd/` prefix munging is in-memory only (per the plan's `<objective>` text §"Format-migration tracker"). No tracker entries needed. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] `countCommits` returned 0 on a single-commit revision**

- **Found during:** Task 1 first vitest run (`jj-refs.test.ts:refs.countCommits({rev: expr.head()}) returns >= 1` failed with `expected 0 to be greater than or equal to 1`)
- **Issue:** The plan's suggested template `'"\n"'` emits one literal newline per matched commit. `vcsExec` trims trailing whitespace from stdout, so a single-commit invocation produces empty stdout post-trim, and the `match(/\n/g)?.length` count returned 0.
- **Fix:** Switched template to `'commit_id ++ "\n"'` so each commit emits a non-empty line. Count is now `.split('\n').filter(Boolean).length` — same idiom used by `rootCommits` and `remotes` in this same file.
- **Files modified:** `sdk/src/vcs/backends/jj.ts` (Task 1 commit)
- **Verification:** All 22 `jj-refs.test.ts` tests pass.

**2. [Rule 1 — Bug] adapter-contract test failures from BACKENDS_AVAILABLE_FOR_VERB flip**

- **Found during:** Task 1 verify (full vitest run after allowlist flip)
- **Issue:** Three previously-skipped contract tests now ran on jj-colocated and failed because they encoded git-specific initial state assumptions:
  - `bookmarks: create, exists, list, delete` — read `before[0].name` from a non-empty bookmarks list (git has implicit `main`; jj has no implicit bookmark)
  - `currentBookmarks returns non-empty` — assumes attached branch (git always attached after init; jj's `@` is anonymous)
  - `refs.exists` — used `0000...0000` as nonexistent-SHA probe (jj uses all-zeros as synthetic root commit id)
- **Fix:** Added per-kind branching inside each test body. `bookmarks.create` test uses `expr.parent()` directly as base on jj; `currentBookmarks` seeds a bookmark and re-probes on jj while keeping the git assertion; `refs.exists` switches the probe SHA to `ffff...ffff`. Each fix preserves the cross-backend property under test. Documented inline.
- **Files modified:** `sdk/src/vcs/__tests__/adapter-contract.test.ts` (Task 1 commit)
- **Verification:** All 21 contract tests pass (8 still skipped behind verbReady gates for plans 03-04..03-06).
- **Pattern note:** Mirrors plan 03-01's deviation #1 — flipping `BACKENDS_AVAILABLE`-style allowlists surfaces test assertions that were write-once-against-git. The Phase 5 graduation step (allowlist removal) will likely surface a few more.

**3. [Rule 1 — Bug] `jj-skeleton.test.ts` throw expectations outdated by Task 1's body wiring**

- **Found during:** Task 1 verify (vitest run after replacing notImpl stubs)
- **Issue:** Plan 03-01's `jj-skeleton.test.ts` asserts every refs.* + refs.bookmarks.* verb throws `VcsNotImplementedError`. Plan 03-03 replaces 11 of those stubs with real bodies that no longer throw the stub error — they throw `VcsExecError` (when the verb spawns jj) or return a value (when probing a non-existent cwd produces a non-zero exit that maps to `return 0` / `return []` / `return false`).
- **Fix:** Replaced each affected `toThrow(VcsNotImplementedError)` assertion with `not.toThrow(VcsNotImplementedError)`. The `switch` + `isIgnored` verbs keep the original `toThrow` assertion. Each updated line has an inline note pointing to 03-03-AUDIT.md (for switch/isIgnored) or "wired in plan 03-03" (for the rest).
- **Files modified:** `sdk/src/vcs/__tests__/jj-skeleton.test.ts` (Task 1 commit)
- **Verification:** All 34 jj-skeleton tests pass.

**4. [Rule 1 — Bug] `backends.test.ts` allowlist assertion outdated**

- **Found during:** Task 1 verify
- **Issue:** Plan 03-01 seeded an assertion that `BACKENDS_AVAILABLE_FOR_VERB['refs.bookmarks.list']` deep-equals `['git']`. Plan 03-03's flip invalidates this.
- **Fix:** Updated the assertion to expect `['git', 'jj-colocated']` and added complementary assertions pinning the deliberately-not-flipped verbs (`switch` + `isIgnored`) at `['git']`. Renamed the test description to reflect the plan-03 reality.
- **Files modified:** `sdk/src/vcs/__tests__/backends.test.ts` (Task 1 commit)
- **Verification:** All 12 backends.test.ts tests pass.

### Environmental Constraints

None this plan — the execution environment had fork capacity throughout. The plan-02 environmental note about fork starvation has self-resolved.

## Authentication Gates

None.

## Q4 / Open-Question Resolutions

Nothing carried forward from plans 03-01 / 03-02 needed resolution in plan 03-03 (Q4 was a parser/snapshot question owned by plan 03-02; this plan consumes the locked snapshot/restore contract via `__vcsTestOnly` and the integration suite passes against jj 0.41).

## Issues Encountered

- **`pnpm exec vitest` is the canonical invocation, not `node ./node_modules/.bin/vitest`.** The latter fails with `SyntaxError: missing ) after argument list` because pnpm's bin wrapper is a POSIX shell script not a node script. Documented for future executor runs.

## Invariant Verification

| Invariant | Source | Check | Result |
|-----------|--------|-------|--------|
| JJ-03 / D-05: `--ignore-working-copy` absent | T-03-02 | `grep -v '^\s*\(\*\|//\)' sdk/src/vcs/backends/jj.ts \| grep -c -- "--ignore-working-copy"` | 0 ✓ |
| SQUASH-05: `jj commit` never invoked | T-03-03 | `grep -E "vcsExec.*'commit'" sdk/src/vcs/backends/jj.ts \| wc -l` | 0 ✓ |
| D-02 throw site present | T-03.03-02 | `grep -E "VcsBookmarkDivergentError" sdk/src/vcs/parse/jj-bookmark.ts \| wc -l` | 4 (1 import + 1 throw + 2 docstring) ✓ |
| D-03 addPrefix exhaustive (5 sites: create + move + delete + exists + comment) | T-03.03-03 | `grep -cE "addPrefix\(" sdk/src/vcs/backends/jj.ts` | 5 ✓ |
| D-03 stripPrefix exhaustive (2 sites: bookmarks.list via parser + currentBookmarks) | T-03.03-03 | `grep -E "stripPrefix" sdk/src/vcs/backends/jj.ts sdk/src/vcs/parse/jj-bookmark.ts \| wc -l` | 7 (across both files; 2 functional read-site invocations + decl + usages) ✓ |
| D-04 raw escape in VcsBookmarks | 03-CONTEXT.md D-04 | `grep -c "raw?: boolean" sdk/src/vcs/types.ts` | 5 ✓ |
| Allowlist flipped (refs.bookmarks.list) | T-03.03 | `grep -E "'refs\.bookmarks\.list': Object\.freeze\(\['git', 'jj-colocated'\]" sdk/src/vcs/backends.ts` | match ✓ |
| Allowlist switch + isIgnored stay git-only | T-03.03 | `grep -E "'refs\.bookmarks\.switch': Object\.freeze\(\['git'\]" sdk/src/vcs/backends.ts` | match ✓ |
| TypeScript compiles | T-03-01 | `pnpm exec tsc -p tsconfig.cjs.json --noEmit` | exit 0 ✓ |
| Lint guard (no raw git) | UPSTREAM-02 | `node scripts/lint-vcs-no-raw-git.cjs` | 0 violations / 902 files ✓ |
| Skip-count guard | TEST-06 | `node scripts/check-skip-count.cjs` | current=18 baseline=18 ✓ |
| Vitest suite | T-03-01 | `pnpm exec vitest run src/vcs/__tests__/` | 274 passed / 8 skipped (verbReady-gated for 03-04..03-06) ✓ |
| cjs harness | TEST-06 | `node --test tests/vcs-adapter-contract.test.cjs` | vcs[git] 7/7 + vcs[jj-colocated] 7/7 = 14/14 ✓ |

## Known Stubs

The following verbs still throw `VcsNotImplementedError` on the jj backend — by design, owned by later plans:

| Verb | Owning plan | Stub form |
|------|-------------|-----------|
| `commit` | 03-04 | `notImpl('commit')` |
| `log` | 03-05 | `notImpl('log')` |
| `status` | 03-05 | `notImpl('status')` |
| `diff` | 03-05 | `notImpl('diff')` |
| `findConflicts` | 03-05 | `notImpl('findConflicts')` |
| `push` | 03-06 | `notImpl('push')` |
| `fetch` | 03-06 | `notImpl('fetch')` |
| `workspace.{add, forget, list, context, prune}` | 03-06 | `notImpl('workspace.*')` |
| `refs.bookmarks.switch` | Phase 4 (if WS-* needs it) | direct `throw new VcsNotImplementedError(...)` with 03-03-AUDIT.md reference |
| `refs.isIgnored` | Phase 4 (if a jj-side caller surfaces) | direct `throw new VcsNotImplementedError(...)` with 03-03-AUDIT.md reference |

Plan 03-03's deliberate stubs are the bottom two; the rest are inherited from plan 03-01's shape commit.

## Format-Migration Tracker (D-19)

Plan 03-03 ships **no new `.planning/` revision-id-encoding format**. The `gsd/` bookmark name munging is in-memory only (per the plan's `<objective>` §"Format-migration tracker"). No entries appended to the `<format_migration_tracker>` section of `03-CONTEXT.md`.

## Next Plan Readiness

Plan 03-04 (`commit`/squash semantics + bookmark advance per D-01) is unblocked:

- `refs.bookmarks.move` works end-to-end — plan 03-04's "advance the named bookmark after squash" wiring consumes it directly with `addPrefix(name, opts?.raw)` plumbed through `CommitInput.bookmark` / `CommitInput.bookmarkRaw` (the optional fields landed in plan 03-01).
- `VcsBookmarkDivergentError` is the typed error plan 03-04 catches when a post-squash `bookmarks.move` would trip the divergent state.
- The `jj op log` / `jj op restore` snapshot lane is hot (plan 03-02) so 03-04's commit tests can use the per-test hermetic-state rewind.

Plan 03-05 (log/status/diff/findConflicts) is unblocked:

- `parseJjLog` from plan 03-02 already returns the production-shape `LogEntry[]` — plan 03-05's `log` body just wires the spawn + parser + the same `LogOpts` argv translation that lives in `git.ts`.
- The 2 leftover `void parseJjLog; void parseJjWorkspaceList;` shims at the bottom of `jj.ts` mark the remaining unused imports — plan 03-05 consumes parseJjLog, plan 03-06 consumes parseJjWorkspaceList, and the shims drop in those plans' commits.

## Self-Check: PASSED

- All 3 created files exist:
  - `sdk/src/vcs/parse/jj-bookmark.ts` ✓
  - `sdk/src/vcs/__tests__/jj-refs.test.ts` ✓
  - `.planning/phases/03-jj-backend-core-squash-refs-conflict/03-03-AUDIT.md` ✓
- All 2 task commits exist in `git log --oneline`:
  - `nsuzyopqpqottmlnmkwopklmprluxtlk` (Task 1) ✓
  - `kvnwywutzlpmlqqmvutvwpzspvpsrvyr` (Task 2) ✓

---
*Phase: 03-jj-backend-core-squash-refs-conflict*
*Completed: 2026-05-12*
