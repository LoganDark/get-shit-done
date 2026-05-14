---
phase: 02-bulk-call-site-migration-still-git-only
fixed_at: 2026-05-11T15:05:00Z
review_path: .planning/phases/02-bulk-call-site-migration-still-git-only/02-REVIEW.md
iteration: 1
findings_in_scope: 9
fixed: 9
skipped: 0
status: all_fixed
---

# Phase 2: Code Review Fix Report

**Fixed at:** 2026-05-11T15:05:00Z
**Source review:** `.planning/phases/02-bulk-call-site-migration-still-git-only/02-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 9 (2 Critical + 7 Warning; Info findings out of scope per `fix_scope=critical_warning`)
- Fixed: 9
- Skipped: 0

All Critical and Warning findings landed as atomic `fix(02): …` commits on `phase/02-migration`. Each commit was verified with the file-scoped test suite (`pnpm vitest run` over the touched test files) plus `tsc --noEmit` for type-checked changes and `node -c` for `.cjs` files. The full SDK suite has some pre-existing failures in golden-parity tests that subprocess-invoke `gsd-tools.cjs` against the stale `dist-cjs/` artifacts (the colocated `.jj` directory in this repo causes `createVcsAdapter` auto-detect to throw `jj backend not yet implemented (Phase 3)` in `dist-cjs/vcs/index.js:22`). Those failures are infrastructure issues unrelated to this fix pass — they also reproduce on the pre-fix commit (`5358d51a docs(02): phase verification passed`).

## Fixed Issues

### CR-01: `vcs.commit({files: …})` calls `git add` without `--` separator (option-injection vector)

**Files modified:** `sdk/src/vcs/backends/git.ts`, `sdk/src/vcs/__tests__/git-backend.test.ts`
**Commit:** `vwkqzzzpnsxkqxxwopyuusuusoootlzy`
**Applied fix:** Injected `'--'` into the `execGit(cwd, ['add', '--', ...input.files])` argv inside `commit()`, matching the existing `vcs.stage` / `vcs.unstage` guard. Added a regression test mirroring the `#3061` fence in `commit.test.ts:419-431` — drops both a `-A.md` (the canonical option-injection trap) and an untracked sibling, asserts only `-A.md` ends up committed (would have failed pre-fix because misparsing `-A.md` as `-A` would have swept the whole worktree).

### CR-02: `LogOpts.format` is part of the public contract but the git backend silently ignores it

**Files modified:** `sdk/src/vcs/types.ts`, `sdk/src/query/verify.ts`, `sdk/src/vcs/__tests__/baseline-parity.test.ts`, `get-shit-done/bin/lib/verify.cjs`
**Commit:** `tuptyptxvxovossoozpqwowqpwyuwooy`
**Applied fix:** Chose option (b) per phase-context guidance — narrowed the contract to what is actually implemented. Removed `format?: 'oneline' | 'full' | 'json'` from `LogOpts` and dropped `format: 'oneline'` from the three real callers (`verify.cjs:1257`, `verify.ts:659`, and the `baseline-parity.test.ts:550` parity gate that drives the captured baseline). Each caller already reconstructed an "oneline-equivalent" from structured `LogEntry[]` (`slice(0,7)` of hash + subject); the inline comments now explicitly note the reconstruction is NOT byte-identical to `git log --oneline` (hardcoded 7-char SHA vs the repo's `core.abbrev`, no decoration refs). Option (b) was chosen over (a) because every existing caller was happy with the structured shape — honouring `format` in the backend would have added a parallel parser path no one had needed yet, and option (c) (reserved-for-future-use) would have left the footgun open.

### WR-01: Dead `execSync`/`execFileSync`/`spawnSync` imports in CLI modules post-migration

**Files modified:** `get-shit-done/bin/lib/core.cjs`, `get-shit-done/bin/lib/init.cjs`
**Commit:** `llmwvzulmrnplvkklpmklyknvywouzvn`
**Applied fix:** Dropped the `child_process` destructure line in both files (replaced with a brief comment explaining why it was removed). Post-Phase-2 CLOSING migration neither file has any remaining `execSync` / `execFileSync` / `spawnSync` call sites — the import was dead weight that kept a seam open for future drift. The `lint-vcs-no-raw-git` scanner is string-based and would not have caught a regression that reintroduced `execSync('git status')` while the destructured names were still in scope.

### WR-02: `parseDiffCheckPath` regex truncates paths when git emits column numbers

**Files modified:** `sdk/src/vcs/backends/git.ts`, `sdk/src/vcs/__tests__/git-backend.test.ts`
**Commit:** `qkqpmupsznqmmuslmuwtvpuymonoousw`
**Applied fix:** Swapped `^(.*):\d+:\s` (greedy) for `^(.+?):\d+(?::\d+)?:\s` (non-greedy with optional column slot). Non-greedy `.+?` makes the path stop at the first `:line` slot rather than greedily consuming `:col:` into the path group; the optional `(?::\d+)?` accommodates both the pre-2.31 (`path:line: …`) and ≥ 2.31 (`path:line:col: …`) `git diff --check` diagnostic forms. Added three new test cases for the column-included form (POSIX, Windows drive-letter, POSIX-with-embedded-colon paths) — pre-fix, the greedy regex would have captured `<path>:<line>` instead of `<path>` for these.

### WR-03: `vcs.refs.exists(vcs.refs.head)` mis-classifies initialised-but-empty repos as "not a git repo"

**Files modified:** `get-shit-done/bin/lib/verify.cjs`
**Commit:** `kzsnzywrxrrytuovvstunuoswusttoyv`
**Applied fix:** Chose option 1 (update the comment to enumerate the three failure modes explicitly) over option 2 (switching the probe to `vcs.workspace.context()`). Option 2 would have been a behavioral change — `workspace.context()` succeeds on empty-repo where the current `vcs.refs.exists(vcs.refs.head)` returns false, so the skip gate would no longer fire on post-`git init` pre-first-commit state. For the drift-detection gate that conflation is harmless, so the safest fix was to document the drift (a) cwd not a git repo, (b) repo with no HEAD yet, (c) git binary missing — and point future callers wanting a TRUE repo probe at `vcs.workspace.context()`. No behavior change.

### WR-04: `commit.gpgsign false` set in commit.test.ts setup but NOT in helpers.cjs `createTempGitProject`

**Files modified:** `tests/helpers.cjs`
**Commit:** `zwvlyztlmuorutvqvmonvquntslysvkw`
**Applied fix:** Added `vcs.gitOnly.configSet('tag.gpgsign', 'false')` to the bootstrap sequence in `createTempGitProject`, symmetric with the Phase 2 D-03 fix already present in `commit.test.ts:beforeEach`. Without this, any CJS-side test that creates a temp project via the helper and exercises `vcs.gitOnly.createAnnotatedTag` would fail on developer machines with `tag.gpgsign = true` set globally.

### WR-05: `findConflicts(scope: 'all')` silently returns `[]` for git

**Files modified:** `sdk/src/vcs/backends/git.ts`, `sdk/src/vcs/__tests__/git-backend.test.ts`
**Commit:** `kxuooovykuzmkuvzxqmruntlqwrqtprl`
**Applied fix:** Chose option (a) — return populated results from `git ls-files --unmerged` for `scope: 'all'` on git. The function now collapses per-stage entries (stages 1/2/3) into a single entry per unmerged path, returning `[{ rev: 'INDEX', paths: [...], scope: 'all' }]` when conflicts exist. Phase 3 jj backend will still implement the full `conflict()` revset semantics; this is the git-side approximation that fixes the CONFLICT-03 silently-passing bug. The new test drives a real two-branch merge that conflicts on a single path and asserts the path appears exactly once in the result (the per-stage de-duplication invariant). Chose option (a) over option (b) (throw-on-`scope: all`-for-git) because (a) gives the verify gate real fail-closed semantics rather than just blocking the call site.

### WR-06: `vcs.commit({files: ['.']})` in `helpers.cjs:111` triggers the same option-injection vector

**Files modified:** `tests/helpers.cjs`
**Commit:** `kslooostyornutxsywnwrtvskuuuukno`
**Applied fix:** Switched `createTempGitProject` from `vcs.commit({files: ['.'], message})` to the explicit two-step `vcs.stage(['.'])` + `vcs.commit({message})` shape. CR-01 already closed the option-injection hole inside `commit({files})` by adding `--` to the `git add` argv, so this is defense in depth — `vcs.stage` has always passed `--` through, and the bare `commit` path goes through `-am` with no `git add` side effect, so any future test that drops a `-`-prefixed file into the temp dir before calling this helper is safe regardless of CR-01 status. Verified all 153 cjs-side tests still pass.

### WR-07: `vcs.refs.exists(expr.commit(hash))` semantic shift from commit-only to any-object

**Files modified:** `get-shit-done/bin/lib/verify.cjs`, `sdk/src/query/verify.ts`
**Commit:** `pznrkznvlqzoxnkywqqqnnuzpxqyurlw`
**Applied fix:** Chose the documentation route over the rename / new-verb routes. Renaming `all_valid` / `valid` / `invalid` / `total` schema fields would have been a breaking change to the JSON CLI contract; adding a `vcs.refs.objectType(rev)` verb to re-tighten the predicate to commit-only would have been scope creep for a Phase 2 fix pass. The pragmatic middle ground is to document the semantic drift inline at both call sites (`verify.cjs:285` and `verify.ts:326`) so future readers and Phase 3 work know the `valid`/`invalid` field names describe REACHABILITY, not commit-only existence. The future-enhancement hook for the `objectType` verb is named explicitly in the comment so this can be re-tightened later without breaking the JSON contract.

---

_Fixed: 2026-05-11T15:05:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
