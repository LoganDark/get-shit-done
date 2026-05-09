---
phase: 01-adapter-foundation-git-backend
fixed_at: 2026-05-09T00:00:00Z
review_path: .planning/phases/01-adapter-foundation-git-backend/01-REVIEW.md
iteration: 1
findings_in_scope: 16
fixed: 16
skipped: 0
status: all_fixed
---

# Phase 1: Code Review Fix Report

**Fixed at:** 2026-05-09
**Source review:** `.planning/phases/01-adapter-foundation-git-backend/01-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 16 (4 Critical + 12 Warning)
- Fixed: 16
- Skipped: 0

All four Critical findings and all twelve Warning findings landed.
WR-03 (always-empty `rev`/`locked` from `workspace.list`) and WR-08
(`getCallerSpecifier` cwd fallback) were folded into CR-04's commit
because CR-04 deleted the entire cross-package require block they
described. IN-03 (placeholder `_env`/`_stagedFiles` in `fireHook`) was
folded into WR-04's commit since both findings sit on the same five
lines — out-of-scope but free.

## Fixed Issues

### CR-01: Lint scanner misses `execSync('git', ...)` and `execSync('git')` (no trailing space)

**Files modified:** `scripts/lint-vcs-no-raw-git.cjs`, `tests/lint-vcs-no-raw-git-fixture.test.cjs`
**Commit:** `74e2e83e`
**Applied fix:** Tightened the regexes to match the closing quote/backtick directly (the same shape `spawnSync` uses), so `execSync('git')` and `execSync(\`git\`)` no longer slip past. Added a fixture test asserting exit 1 on the bare-quote form.

### CR-02: `vcs.status({porcelain:true})` mis-parses paths with whitespace

**Files modified:** `sdk/src/vcs/backends/git.ts`, `sdk/src/vcs/__tests__/git-backend.test.ts`
**Commit:** `aeb7d471`
**Applied fix:** Parse structured entries from `git -c core.quotePath=false status --porcelain -z` (NUL-separated, paths verbatim) instead of slicing newline-mode output. Preserve byte-identity `raw` from a separate newline call so GIT-02 baselines still match. Added a test that creates `a b.txt` (literal space) and asserts the path round-trips.

### CR-03: `findConflicts({scope:'working-copy'})` mis-parses Windows-style paths

**Files modified:** `sdk/src/vcs/backends/git.ts`, `sdk/src/vcs/__tests__/git-backend.test.ts`
**Commit:** `4cecf255`
**Applied fix:** Replaced `indexOf(':')` slicing with a regex matching the trailing `:<line>:` pattern. Extracted the parser into an exported `parseDiffCheckPath` helper and added unit tests for `C:\foo\bar.txt:42:`, POSIX paths containing literal `:`, and the empty/no-match case.

### CR-04: Published package omits `worktree-safety.cjs` — `workspace.list()` is broken for downstream consumers

**Files modified:** `sdk/src/vcs/backends/git.ts`, `sdk/src/vcs/parse/worktree-list.ts` (new), `sdk/src/vcs/__tests__/parse-worktree-list.test.ts` (new)
**Commit:** `0fec20ed`
**Applied fix:** Moved the read-only worktree-list porcelain parser into `sdk/src/vcs/parse/worktree-list.ts`, eliminating the cross-package `createRequire('../../../../get-shit-done/bin/lib/worktree-safety.cjs')` seam. The new parser also captures `HEAD <sha>` and `locked` lines, so `WorkspaceInfo.rev` and `.locked` are populated non-trivially (closes WR-03 in the same commit). The whole `getCallerSpecifier` / `eval('import.meta.url')` block was deleted, which also closes WR-08. ADR-0004 still names worktree-safety.cjs as the policy owner for CLI-side decisions; only the read-only view was duplicated.

### WR-01: `commit({files: []})` silently falls through to `git commit -am`

**Files modified:** `sdk/src/vcs/backends/git.ts`, `sdk/src/vcs/types.ts`, `sdk/src/vcs/__tests__/git-backend.test.ts`
**Commit:** `1c8d0d19`
**Applied fix:** Throw a structured "ambiguous" error on `files: []` (chose the reject semantic over the silent no-op since silent acceptance was the original footgun). Documented all three cases on `CommitInput.files` JSDoc: `undefined` → `-am`, ≥1 path → `git add` then `git commit -m`, `[]` → reject. Added a test.

### WR-02: `gitOnly.version()` does not check exit code

**Files modified:** `sdk/src/vcs/backends/git.ts`
**Commit:** `ad256f5d`
**Applied fix:** Throw on non-zero exit (mirrors `createAnnotatedTag`'s exit-check) instead of returning empty string when git is missing from PATH or fails to spawn.

### WR-03: `workspace.list()` always returns `rev: ''` and `locked: false`

**Files modified:** `sdk/src/vcs/parse/worktree-list.ts`, `sdk/src/vcs/backends/git.ts`, `sdk/src/vcs/__tests__/parse-worktree-list.test.ts`
**Commit:** `0fec20ed` (folded into CR-04)
**Applied fix:** The new SDK-local porcelain parser captures `HEAD <sha>` and `locked` lines from `git worktree list --porcelain`. The adapter now passes `e.head` and `e.locked` directly into `WorkspaceInfo`. Added unit tests for the locked / detached / multi-entry cases.

### WR-04: `fireHook` invokes the hook script directly — broken on Windows

**Files modified:** `sdk/src/vcs/hook-bridge.ts`
**Commit:** `2be5aea5`
**Applied fix:** On `process.platform === 'win32'`, route through `bash -c '<hookPath>'` unless the hook is a Windows-native executable (`.exe`/`.cmd`/`.bat`). POSIX path is unchanged. Bash-safe path quoting handles embedded single-quotes via the standard `'\\''` escape.

### WR-05: hard-coded `/bin/sh` in baseline tests

**Files modified:** `sdk/src/vcs/__tests__/baseline-parity.test.ts`, `tests/__tools__/capture-vcs-baselines.cjs`
**Commit:** `743ab856`
**Applied fix:** Replaced `shell: '/bin/sh'` with `shell: true` in both `initFixture` and `setupFixture`. POSIX runners still route through `/bin/sh`; Windows runners route through `cmd.exe` instead of ENOENT'ing.

### WR-06: `vcsExec` returns `exitCode: 1` for signal-killed processes

**Files modified:** `sdk/src/vcs/exec.ts`
**Commit:** `e477c07f`
**Applied fix:** Exported `EXIT_CODE_SIGNAL_KILLED = -1` as the sentinel and replaced `result.status ?? 1` with `result.status ?? EXIT_CODE_SIGNAL_KILLED`. Callers that branch on `exitCode !== 0` continue to behave identically (-1 is non-zero); callers that need to distinguish "killed" from "exited 1" now have a stable check. Documented the new field semantic in the `ExecResult` JSDoc.

> **Requires human verification:** This is a semantic-only change to a load-bearing exec wrapper. All existing tests pass (no test asserted the exact `1` collapse), but downstream Phase 2/3 callers should be audited if any relied on the prior collision.

### WR-07: `expr.bookmark` allows non-refname names like `-D`, `foo..bar`, `@{`

**Files modified:** `sdk/src/vcs/expr.ts`, `sdk/src/vcs/__tests__/expr.test.ts`
**Commit:** `1a033ded`
**Applied fix:** Replaced the colon-only check with the full git-check-ref-format(1) rule set: reject empty, leading `-`, `@{`, `..`, ASCII control bytes / spaces / `~^:?*[\\`, trailing `/` or `.lock`, and any path component starting with `.` or ending in `.lock`. Applied the same rules to the branch component of `expr.remote`. Added 9 new validation tests.

### WR-08: `getCallerSpecifier()` cwd fallback

**Commit:** `0fec20ed` (folded into CR-04)
**Applied fix:** The entire `getCallerSpecifier` / `eval` / `createRequire` block was deleted as part of CR-04 (the cross-package require it served is gone, replaced by `import { readWorktreeList } from '../parse/worktree-list.js'`). The buggy fallback no longer exists.

### WR-09: `parseFrontmatter` regex skips keys starting with underscore

**Files modified:** `tests/helpers.cjs`
**Commit:** `e71e9fe3`
**Applied fix:** Widened the leading-char class from `[A-Za-z]` to `[A-Za-z_]` so frontmatter keys like `_internal:` are no longer silently dropped into the "skip block-list items" branch. Numeric leading chars are still rejected (refused as more likely a mis-indented list item than a real key).

### WR-10: `globToRegExp` `**` semantics + missing `-` escape

**Files modified:** `scripts/lint-vcs-no-raw-git.cjs`
**Commit:** `26609cea`
**Applied fix:** Changed the translation of `**/` (intermediate) to `(?:[^/]+/)*` (zero-or-more full path components — gitignore(5)-compatible) and `**` at end-of-pattern to `.+` (require at least one character so `prefix/**` does NOT silently match a top-level file literally named `prefix`). Added `-` to the escape set defensively (the existing escape set covered `[]`, so embedded char classes like `[a-z]` survive as literal text). The "exits 0 on the current repo" fixture test is the binding lock-in for the new semantic.

### WR-11: lint scanner does not scan shell scripts

**Files modified:** `scripts/lint-vcs-no-raw-git.cjs`, `scripts/lint-vcs-no-raw-git.allow.json`, `tests/lint-vcs-no-raw-git-fixture.test.cjs`
**Commit:** `d0de4ac5`
**Applied fix:** Added `.sh`/`.bash` to `SCAN_EXT` and a shell-mode pattern matching start-of-statement bare `git <subcommand>` (line start, after `;`, `&&`, `||`, `|`, `(`, or whitespace). The shell pattern is intentionally NOT applied to JS/TS/YAML where prose and comments routinely reference `git` as text — that produced 130+ false positives in initial testing. Skip shell `#`-prefixed comment lines for the same reason. Extended `ALLOW_LINE_ANNOTATION` to also accept `# vcs-lint:allow-git-here`. Allowlisted `scripts/{base64,prompt-injection,secret}-scan.sh` with rationale (`$comment_wr_11`) — they compute the diff between $base and HEAD via git as part of the scan-report-only workflow and cannot route through the JS-side adapter. Added 3 fixture tests (positive, annotation, JS-prose-negative).

### WR-12: `tsconfig.cjs.json` `include` is too narrow

**Files modified:** `sdk/tsconfig.cjs.json`
**Commit:** `35fad609`
**Applied fix:** Added `src/errors.ts` to the `include` list (it was being compiled transitively but was invisible to readers of the tsconfig). Documented the rationale in `$wr12_comment` so a future contributor reading the tsconfig understands why a non-vcs file is in the list. The `pnpm run build:cjs` + `tests/vcs-cjs-smoke.test.cjs` round-trip continues to load `dist-cjs/errors.js` correctly.

## Skipped Issues

None — all 16 in-scope findings were fixed.

## Bonus

### IN-03: Unused locals `_env` and `_stagedFiles` in `fireHook`

**Commit:** `2be5aea5` (folded into WR-04)
**Applied fix:** Replaced the placeholder `_env`/`_stagedFiles` `void`-suppressed allocations with a single `TODO(D-05/HOOK-05)` comment and `void ctx`. The runtime no longer clones `process.env` on every hook invocation. Out of scope (Info tier) but free since both findings sit on the same five lines.

---

_Fixed: 2026-05-09_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
