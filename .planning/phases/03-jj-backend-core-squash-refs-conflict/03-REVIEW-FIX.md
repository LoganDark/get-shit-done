---
phase: 03-jj-backend-core-squash-refs-conflict
fixed_at: 2026-05-12T17:55:00Z
review_path: .planning/phases/03-jj-backend-core-squash-refs-conflict/03-REVIEW.md
iteration: 1
findings_in_scope: 15
fixed: 14
skipped: 1
status: partial
---

# Phase 03: Code Review Fix Report

**Fixed at:** 2026-05-12T17:55:00Z
**Source review:** `.planning/phases/03-jj-backend-core-squash-refs-conflict/03-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 15 (1 critical + 8 warning + 6 info; fix_scope=all)
- Fixed: 14
- Skipped: 1 (CR-01, deferred to dedicated future plan)

This run resumed an interrupted fix session. The setup_worktree recovery
sentinel pointed at `/tmp/sv-03-reviewfix-9DLcGP` on branch
`gsd-reviewfix/03-29956` with 10 fix commits already landed. On resume, the
final outstanding finding (IN-01) was confirmed already present in commit
`992614d2`. All 11 fix commits were fast-forward-merged into `main` and the
worktree was cleaned up.

## Verification gates re-run on resume

- **`pnpm exec vitest run` (full sdk suite):** 7 test files failed, 21
  tests failed, 2078 passed, 4 skipped. Triage:
  - 1 config-mutation default — pre-existing (per orchestrator override).
  - 5 golden-parity percent-calc drift in
    `src/golden/read-only-parity.integration.test.ts` — pre-existing (per
    orchestrator override).
  - 1 timeout in `src/vcs/__tests__/jj-status-log-diff.test.ts` `log() >
    honors maxCount: 1` — load-induced 5s timeout; re-run of just that
    file passes 13/13 in 3.2s (`maxCount:1` itself completes in 711ms).
    Flaky timing under full-parallel load, not a regression introduced by
    this fix session.
  - The remaining 14 failures are within the 6 pre-existing buckets
    (multiple sub-tests per file × the same root causes called out in the
    orchestrator override). No new regressions attributable to fixes in
    this run.
- **`node scripts/lint-vcs-no-raw-git.cjs`:** 908 files scanned, **0
  violations**.
- **JJ-03 (`--ignore-working-copy` grep):** 0 code usages; only docstring
  references describing the invariant.
- **SQUASH-05 (`jj commit` grep):** 0 hits.
- **`conflicts()` plural revset:** still in place in `findConflicts`.

## Fixed Issues

### IN-01: `parseJjLog` has dead `.replace(/\n$/, '')` after `slice(0, nlIdx)`

**Files modified:** `sdk/src/vcs/parse/jj-log.ts`
**Commit:** `992614d2`
**Applied fix:** Removed the unreachable `.replace(/\n$/, '')` and added an
inline comment explaining both branches (`slice(0, nlIdx)` already excludes
the newline; `nlIdx === -1` returns a string that by definition has no `\n`)
make the replace dead code.

### IN-02: `parseJjBookmarkRecord` does not validate `record.name` is a string

**Files modified:** `sdk/src/vcs/parse/jj-bookmark.ts`
**Commit:** `9699628f`
**Applied fix:** Added an explicit `typeof record.name === 'string'`
guard before consuming the field, throwing a typed contract-drift error
on type-shape failure (matching the parse-failure throw shape).

### IN-03: `commit()` bookmark advance uses deprecated `-B` short flag

**Files modified:** `sdk/src/vcs/backends/jj.ts`
**Commit:** `04684870`
**Applied fix:** Replaced `-B` with `--allow-backwards` on the
`jj bookmark set <name> -r @-` invocation so a Renovate bump to jj 0.42+
remains in-place compatible; verified on jj 0.41 that the long form is
also accepted.

### IN-05: `__vcsTestOnly.restore` JSDoc admits known disk-file leak

**Files modified:** `sdk/src/vcs/backends/jj.ts`
**Commit:** `dd38ac22`
**Applied fix:** Expanded the JSDoc on `__vcsTestOnly.restore` to
explicitly document the caller's responsibility: contract-suite tests
that call `vcs.status()` after `restore()` are sensitive to prior-test
untracked-file residue and must perform their own cleanup if hermeticity
is required.

### WR-01: `log({paths})` and `diff({paths})` lack `--` end-of-options separator

**Files modified:** `sdk/src/vcs/backends/jj.ts`
**Commit:** `4094d8d4`
**Applied fix:** Inserted `--` end-of-options separator before path args
in both `log()` and `diff()`. Verified jj 0.41 accepts `--` on `jj log`
and `jj diff`; this is the cross-version-safe form and matches the git
backend's invariant.

### WR-02 + WR-08: `currentBookmarks()` bypasses D-02 divergence and only strips `*`

**Files modified:** `sdk/src/vcs/backends/jj.ts`
**Commit:** `6efa67f4`
**Applied fix:** Replaced the loose suffix-strip with a strict bookmark
shape validator: any name ending in `??` now throws
`VcsBookmarkDivergentError` (D-02 invariant enforced on this read path);
any name carrying a state suffix other than the local-ahead `*` is
rejected as contract drift rather than silently passed through
`stripPrefix`.

### WR-03: `commit()` returns `hash: null` silently on hash-resolution failure

**Files modified:** `sdk/src/vcs/backends/jj.ts`
**Commit:** `94b30c4c`
**Applied fix:** When the post-squash `jj log -r @- -T commit_id` probe
exits non-zero, the failure is now appended to the merged stderr as
`[hash-probe failed]: <details>` so callers can diagnose the
"commit succeeded but lost id" state; `hash` remains `null` for git-backend
parity.

### WR-04 + IN-04: `enumerateConflictedPaths` can return empty for a flagged commit; dead `U` branch

**Files modified:** `sdk/src/vcs/backends/jj.ts`
**Commit:** `55d1aed2`
**Applied fix:** When `conflicts()` flags a rev but both the primary
(`jj resolve --list -r`) and fallback (`jj diff --summary` filtered for
`C`) enumerations return zero paths, the result is now surfaced as
`paths: ['<UNRESOLVABLE>']` so the verify gate cannot silently pass.
Dropped the dead `U` from the fallback regex (jj 0.41 `diff --summary`
emits `[AMDRCTXB]` but never `U`).

**Logic-bug note (requires human verification):** The `<UNRESOLVABLE>`
sentinel is a design choice — alternative was a typed error throw. The
verifier should manually confirm CONFLICT-03's downstream contract is
happy with the sentinel-path form rather than a thrown exception.

### WR-05 + IN-06: `parseJjStatus` narrow regex and brittle section exit

**Files modified:** `sdk/src/vcs/backends/jj.ts`
**Commit:** `bc2d547f`
**Applied fix:** Widened the entry regex from `/^([AMDRC]) (.+)$/` to
`/^([AMDRC])\s+(.+)$/` so jj's alignment whitespace and rename-form
multi-token paths are tolerated; replaced the marker-only early break
with a state machine that exits the section on any non-`[AMDRC]` line
after entry, defending against jj template reshapes that drop the
"Working copy" / "Parent commit" markers.

**Logic-bug note (requires human verification):** The rename/copy
handling here canonicalizes on the new-path token (git-backend parity);
verifier should confirm that's the intended caller-visible shape for
`R old -> new` lines.

### WR-06: `push()` ref-shape gate accepts `..` (range) inside bookmark-shape names

**Files modified:** `sdk/src/vcs/backends/jj.ts`
**Commit:** `a8989bb9`
**Applied fix:** Added an explicit `!refName.includes('..')` term to the
bookmark-shape gate so `from..to` range expressions stringified by
`toJjRev` are rejected at the `push()` boundary rather than landing in
the `--bookmark` argv.

### WR-07: `commit()` silently prefers `bookmarkRaw` when both fields set

**Files modified:** `sdk/src/vcs/backends/jj.ts`
**Commit:** `770fa28f`
**Applied fix:** Added a top-of-`commit()` guard that throws when both
`input.bookmark` and `input.bookmarkRaw` are non-`undefined`, making the
D-01/D-04 mutual exclusivity explicit at the API boundary.

## Skipped Issues

### CR-01: `bookmarks.create/move/delete/exists` with `raw:true` allows argv-flag injection

**File:** `sdk/src/vcs/backends/jj.ts:526-558`
**Reason:** skipped: deferred-to-todo. The orchestrator triaged this as a
cross-backend hardening item that requires a dedicated plan (validator
needs symmetric introduction in both `backends/jj.ts` AND `backends/git.ts`,
plus consideration of whether the existing `validateBookmarkName` in
`expr.ts` should be exported or whether a new argv-safety validator
distinct from the refname validator is the right shape). Captured at
`.planning/todos/pending/cr-01-raw-bookmark-argv-injection.md` (commit
`c8cd6ff3`).
**Original issue:** The four mutating bookmark verbs accept caller-supplied
`name: string` and forward it verbatim into argv when `opts.raw === true`.
A `name` of `-r`, `--delete`, `--allow-backwards`, etc. would land at a
flag position and be interpreted as an option. Today only adapter-internal
call sites use `raw:true`, but the type signature exposes the seam to any
caller.

---

_Fixed: 2026-05-12_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
