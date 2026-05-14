---
phase: 03-jj-backend-core-squash-refs-conflict
reviewed: 2026-05-11T00:00:00Z
depth: standard
files_reviewed: 35
files_reviewed_list:
  - .github/workflows/test.yml
  - docs/test-triage/jj-bugs.md
  - sdk/src/vcs/__tests__/adapter-contract.test.ts
  - sdk/src/vcs/__tests__/backends.test.ts
  - sdk/src/vcs/__tests__/exec-env-passthrough.test.ts
  - sdk/src/vcs/__tests__/index.test.ts
  - sdk/src/vcs/__tests__/jj-commit.test.ts
  - sdk/src/vcs/__tests__/jj-findconflicts.test.ts
  - sdk/src/vcs/__tests__/jj-parsers.test.ts
  - sdk/src/vcs/__tests__/jj-push-fetch.test.ts
  - sdk/src/vcs/__tests__/jj-refs.test.ts
  - sdk/src/vcs/__tests__/jj-skeleton.test.ts
  - sdk/src/vcs/__tests__/jj-snapshot-restore.test.ts
  - sdk/src/vcs/__tests__/jj-status-log-diff.test.ts
  - sdk/src/vcs/__tests__/jj-workspace.test.ts
  - sdk/src/vcs/__tests__/sticky-resolver.test.ts
  - sdk/src/vcs/__tests__/types.test.ts
  - sdk/src/vcs/__tests__/vcs-fixture.ts
  - sdk/src/vcs/backends.ts
  - sdk/src/vcs/backends/git.ts
  - sdk/src/vcs/backends/jj.ts
  - sdk/src/vcs/exec.ts
  - sdk/src/vcs/index.ts
  - sdk/src/vcs/parse/jj-bookmark.ts
  - sdk/src/vcs/parse/jj-id.ts
  - sdk/src/vcs/parse/jj-log.ts
  - sdk/src/vcs/parse/jj-op-log.ts
  - sdk/src/vcs/parse/jj-workspace-list.ts
  - sdk/src/vcs/types.ts
  - tests/fixtures/jj-ndjson/jj-bookmark-list-divergent.ndjson
  - tests/fixtures/jj-ndjson/jj-log-3-commits.ndjson
  - tests/fixtures/jj-ndjson/jj-log-conflict.ndjson
  - tests/fixtures/jj-ndjson/jj-op-log-2-ops.ndjson
  - tests/fixtures/jj-ndjson/jj-workspace-list-default.ndjson
  - tests/helpers.cjs
  - tests/vcs-adapter-contract.test.cjs
findings:
  critical: 1
  warning: 8
  info: 6
  total: 15
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-05-11
**Depth:** standard
**Files Reviewed:** 35
**Status:** issues_found

## Summary

The jj backend implementation is well-structured: every adapter invocation
routes through `jjArgv()` (single source of mandatory flags), parsers throw
typed errors on contract drift, `RevisionExpr` is brand-validated, and
D-02/D-03/D-04 prefix discipline is correctly woven through the bookmark
namespace. Project invariants verified by direct code inspection:

- No raw `git` shell-outs in `backends/jj.ts` or `parse/jj-*.ts` (only
  `jj git push`/`jj git fetch`/`jj git remote list`, which are jj subcommands).
- No `--ignore-working-copy` flag anywhere — `jjArgv()` is locked.
- `jj squash`, never `jj commit` (SQUASH-05 holds in `commit()`).
- `findConflicts` uses the PLURAL `conflicts()` revset (jj.ts:417-419).
- `parseJjBookmarkRecord` throws `VcsBookmarkDivergentError` on `target.length > 1`.

That said, several real defects surface in the cross-backend bookmark write
paths (argv-injection in raw mode), in path-argument handling for `jj log`
and `jj diff` (no `--` end-of-options separator), in divergent-bookmark
detection on the `currentBookmarks` template read path (bypasses
D-02 enforcement), and in `commit()` result reporting when the post-squash
hash resolution fails. Findings below.

## Critical Issues

### CR-01: `bookmarks.create/move/delete/exists` with `raw:true` allows argv-flag injection

**File:** `sdk/src/vcs/backends/jj.ts:526-558`
**Issue:** The four mutating bookmark verbs accept `name: string` directly
from callers and forward it verbatim into the jj argv when `opts.raw === true`
(D-04 escape hatch). There is no validation: a caller-supplied `name` of
`-r`, `--delete`, `--allow-backwards`, etc. would land in argv at the
flag position and jj would interpret it as an option rather than as a
refname. The git backend (`git.ts:331-373`) has the same shape (no `--`
separator on `git branch`/`-D`/`-f`). The cross-backend `bookmarks.create`
contract has no validator on `name`; only `RevisionExpr` is brand-validated,
not the bookmark name string itself.

In the default (non-raw) path the `gsd/` prefix from `addPrefix(name)` blocks
the leading-`-` attack incidentally, but the `raw:true` path is the supported
seam for upstream-tracking bookmarks (`main`, `trunk`) and is the dangerous
one. Today only adapter-internal call sites use `raw:true`, but the type
signature accepts any string from any caller.

**Fix:** Centralize a `validateBookmarkName` call at the adapter entry to
each of the four verbs, mirroring `expr.bookmark()`'s factory validator. The
existing validator in `sdk/src/vcs/expr.ts:36-56` already enforces refname
rules including leading-`-` rejection.
```ts
// In backends/jj.ts (and symmetrically in backends/git.ts):
import { validateBookmarkNameForArgv } from '../expr.js'; // export it

create: (name: string, rev: RevisionExpr, opts?: { raw?: boolean }): void => {
  validateBookmarkNameForArgv(name);   // throw on leading '-' / control bytes
  const actualName = addPrefix(name, opts?.raw);
  const args = jjArgv('bookmark', 'create', actualName, '-r', toJjRev(rev));
  // ...
},
```
Alternative: insert a `--` end-of-options separator before `<name>` where
jj accepts it (`jj bookmark create -- <name>`). Verify on jj 0.41 before
relying on that form. The validator approach is cross-backend, version-
independent, and matches the existing `expr.bookmark()` discipline.

## Warnings

### WR-01: `log({paths})` and `diff({paths})` lack `--` end-of-options separator

**File:** `sdk/src/vcs/backends/jj.ts:232, 322`
**Issue:** Both verbs use `args.push(...opts.paths)` to trail path filters
after the rev args, with the JSDoc comment "jj has no `--` separator like
git uses; paths follow the rev args." A path token starting with `-` (e.g.,
`-rfoo` or `--config=x`) would be parsed by jj's CLI as a flag, not a path.
The git backend explicitly inserts `--` (`git.ts:202, 298`) precisely to
neutralize this. Even if jj's current parser is positional-after-revset
internally, a future jj version that becomes stricter would silently change
behavior here.

**Fix:** Insert `--` before path args, then validate that jj 0.41 accepts
it. If jj rejects `--`, the alternative is to validate each path against
a leading-`-` deny rule:
```ts
if (opts.paths && opts.paths.length > 0) {
  for (const p of opts.paths) {
    if (p.startsWith('-')) {
      throw new Error(`log/diff: path '${p}' must not start with '-' (argv-flag risk)`);
    }
  }
  args.push(...opts.paths);
}
```

### WR-02: `currentBookmarks()` does not surface divergent bookmarks

**File:** `sdk/src/vcs/backends/jj.ts:577-602`
**Issue:** The project invariant states "D-02 `VcsBookmarkDivergentError`
thrown from every `jj bookmark list -T json(self)` parse site." `bookmarks.list`
correctly threads through `parseJjBookmarkRecord` and honors that contract.
But `currentBookmarks()` extracts bookmark names from the `log -r @- -T
'bookmarks.join("\n")'` template instead — a template that renders divergent
bookmarks as `name??` (jj's `??` suffix convention for divergent state). The
current code only strips the remote-ahead `*` suffix:
```ts
.map((s) => s.replace(/\*$/, ''))
.map(stripPrefix);
```
A divergent bookmark `gsd/feature` at `@-` would surface to the caller as
`feature??` (gsd/ stripped, `??` suffix retained), masquerading as a regular
bookmark name. The D-02 invariant ("divergence must surface as a typed
error, never silently") is bypassed on this read path.

**Fix:** Detect the `??` suffix and either throw `VcsBookmarkDivergentError`
or fall back to the structured `bookmark list -T json` form for any bookmark
at `@-`:
```ts
.map((s) => {
  if (s.endsWith('??')) {
    throw new VcsBookmarkDivergentError({
      bookmarkName: s.slice(0, -2),
      divergentTargets: [], // template form doesn't include targets; could re-query
    });
  }
  return s.replace(/\*$/, '');
})
.map(stripPrefix);
```
Or replace the template-based read with a json-self read (heavier but
divergence-aware).

### WR-03: `commit()` returns `hash: null` silently on hash-resolution failure

**File:** `sdk/src/vcs/backends/jj.ts:180-184`
**Issue:** After a successful squash (`squashRes.exitCode === 0`), the
function attempts a second invocation `jj log -r @- -T commit_id` to
resolve the new commit hash. If that probe fails (non-zero exit), the code
silently sets `hash = null` and continues to the bookmark-advance step.
Callers see `{exitCode: 0, stderr: <squash stderr>, hash: null}` — a
"commit succeeded but we lost track of its id" state with no diagnostic
about why. The git backend has the same null-on-failure shape, so this is
existing parity, but at minimum the failure mode should surface in stderr
for debuggability. The bookmark advance below it then uses `@-` to point
the bookmark at the (presumably) new commit anyway.

**Fix:** Append the hash-probe failure to stderr when it occurs:
```ts
const hashRes = vcsExec(cwd, 'jj', hashArgs);
let hash: string | null = null;
let mergedStderr = squashRes.stderr;
if (hashRes.exitCode === 0) {
  hash = hashRes.stdout.trim();
} else {
  mergedStderr = `${squashRes.stderr}\n[hash-probe failed]: ${hashRes.stderr || hashRes.stdout}`;
}
```
Then thread `mergedStderr` into the final return.

### WR-04: `enumerateConflictedPaths` may return `paths: []` for a commit flagged by `conflicts()` revset

**File:** `sdk/src/vcs/backends/jj.ts:364-391`
**Issue:** `findConflicts({scope:'all'})` first runs `jj log -r 'conflicts()'`
to find conflicted commits, then calls `enumerateConflictedPaths(entry.hash)`
on each to enumerate the affected paths. The primary form
(`jj resolve --list -r <rev>`) returns paths on success. The fallback
(`jj diff -r <rev> --summary` filtered for `C`/`U`) catches drift. But if
BOTH forms return zero matches for a commit that `conflicts()` flagged, the
function returns `[]` and `findConflicts` emits a `ConflictResult` with
`paths: []`. CONFLICT-03 (the verify gate) sees a conflict surfaced but no
paths to report — which file is conflicted is lost.

Compounding this: the fallback regex `/^[CU] (.+)$/` includes `U`, but jj's
`diff --summary` letter set on jj 0.41 does NOT emit `U` (the empirically
verified letters per the `parseDiffSummary` helper are `[AMDRCTUXB]`). The
`U` branch is dead on jj.

**Fix:** Treat a "conflicts() flagged this rev but paths enumerate empty"
state as a contract drift signal. Either throw a typed error, or include a
diagnostic marker in `paths` (e.g., `['<UNRESOLVABLE>']`) so the verify
gate doesn't silently pass. Also strip `U` from the fallback regex since
jj never emits it on `diff --summary`:
```ts
const m = /^C (.+)$/.exec(line);
```

### WR-05: `parseJjStatus` does not handle rename/copy or whitespace-padded lines

**File:** `sdk/src/vcs/backends/jj.ts:256-271`
**Issue:** The regex `/^([AMDRC]) (.+)$/` matches a single status letter,
exactly one space, then the path. jj 0.41 rename entries may render as
`R old -> new` (multiple tokens) or with multiple spaces between letter
and path depending on alignment. Today's `parseJjStatus`:
- Drops rename/copy entries silently (they don't match the single-space
  shape and the surrounding code has no second-token handling).
- Mis-parses any path with leading whitespace.

Test coverage in `jj-status-log-diff.test.ts` only exercises `A` and `M`
single-path entries, so the rename gap is untested.

**Fix:** Widen the regex to `^([AMDRC])\s+(.+)$` and add a rename-line
branch that captures both old and new paths (or canonicalizes on the new
path, matching the git backend's `(letter === 'R' || letter === 'C')`
post-state heuristic in `git.ts:316`).

### WR-06: `push()` ref-shape gate accepts `..` (range) inside bookmark-shape names

**File:** `sdk/src/vcs/backends/jj.ts:470`
**Issue:** The bookmark-shape gate is `/^[A-Za-z][\w\-/.]*$/`. This regex
admits names containing `..` because `.` is in the trailing character class.
A `RevisionExpr` shaped as a range (`range:from..to`) is normally rejected
by `toJjRev` upstream (which returns the range form like `<from>..<to>`),
but `toJjRev` for a range returns `<from>..<to>` joined by literal `..`. If
`from`/`to` are bookmark exprs, the resulting string starts with a letter
and contains `..` — passing the gate. The `--bookmark <name>` flag with a
`..`-containing argument would be a malformed bookmark name to jj. Low risk
(jj would error on the malformed name rather than execute the range), but
the gate intent ("bookmark-shaped, not a range") is not actually enforced.

**Fix:** Exclude `..` explicitly:
```ts
const isBookmarkLike =
  /^[A-Za-z][\w\-/.]*$/.test(refName) && !refName.includes('..');
```

### WR-07: `commit()` accepts both `bookmark` and `bookmarkRaw` but silently prefers `bookmarkRaw`

**File:** `sdk/src/vcs/backends/jj.ts:189-203`
**Issue:** The condition `if (input.bookmark !== undefined || input.bookmarkRaw !== undefined)` then
`input.bookmarkRaw !== undefined ? input.bookmarkRaw : addPrefix(input.bookmark!)` silently picks
`bookmarkRaw` when BOTH fields are set. The `CommitInput` type
(`types.ts:53-71`) does not document mutual exclusivity, and no validator
rejects the both-set case. A caller passing both fields under different code
paths (e.g., a conditional that sets one but forgets to clear the other)
would get the wrong bookmark advanced with no warning.

**Fix:** Throw on both-set at the top of `commit()`:
```ts
if (input.bookmark !== undefined && input.bookmarkRaw !== undefined) {
  throw new Error(
    'commit(): pass at most one of {bookmark, bookmarkRaw} — D-01 and D-04 are mutually exclusive.',
  );
}
```

### WR-08: `currentBookmarks()` strips `*` suffix but jj may emit other state suffixes

**File:** `sdk/src/vcs/backends/jj.ts:600`
**Issue:** Related to WR-02. The single `.replace(/\*$/, '')` only handles
the local-ahead-of-remote `*` marker. jj's templating language can emit
other suffixes (e.g., remote-tracking states like `@origin`) depending on
the template. The current template `bookmarks.join("\n")` should emit only
local bookmarks plain, but if a future jj version reshapes the default
template output, suffix drift would silently land in caller-visible names.

**Fix:** Replace the template with the structured `bookmark list -T json`
form filtered by `present(@-)`-style predicate, then thread through
`parseJjBookmarkRecord` (which already throws on divergence and returns
clean names). Heavier but contract-stable.

## Info

### IN-01: `parseJjLog` has dead `.replace(/\n$/, '')` after `slice(0, nlIdx)`

**File:** `sdk/src/vcs/parse/jj-log.ts:49`
**Issue:** `description.slice(0, nlIdx)` already excludes the newline at
position `nlIdx`, so the trailing `\n` cannot be present in the sliced
substring. The `.replace(/\n$/, '')` is unreachable / dead. When `nlIdx === -1`
(no newline at all), the full `description` is used and the replace runs,
but description without any newline can't end in `\n`. Dead code in both
branches.
**Fix:** Remove the `.replace(/\n$/, '')`.

### IN-02: `parseJjBookmarkRecord` does not validate `record.name` is a string

**File:** `sdk/src/vcs/parse/jj-bookmark.ts:44-56`
**Issue:** The record is typed `{ name: string; target: unknown }` but
`JSON.parse` returns `any`. A malformed line `{"name":null,"target":["x"]}`
would set `bookmarkName: null` in the `VcsBookmarkDivergentError` (when
target length > 1) or pass `null` through `stripPrefix` (which calls
`startsWith` on null → TypeError). The throw-on-malformed contract is in
place for parse failures, but not for type-shape failures.
**Fix:** Add an explicit `typeof record.name === 'string'` check; throw a
typed error on type drift the same way the JSON parse failure does.

### IN-03: `commit()` bookmark advance uses deprecated `-B` flag

**File:** `sdk/src/vcs/backends/jj.ts:193`
**Issue:** `jj bookmark set <name> -r @- -B` uses the short `-B` flag for
"allow backwards move." On jj 0.41 this is the documented form; on jj 0.42+
the canonical spelling is `--allow-backwards`. The pinned Renovate-bumpable
version in the CI workflow (`v0.41.0`) is safe today, but a Renovate bump
to 0.42 would break this call site.
**Fix:** Use the long form `--allow-backwards` (verify availability on jj
0.41 first) so Renovate bumps remain in-place compatible.

### IN-04: `findConflicts` fallback regex includes `U` (dead on jj)

**File:** `sdk/src/vcs/backends/jj.ts:387`
**Issue:** The fallback regex `/^[CU] (.+)$/` includes `U` (unmerged), but
`jj diff --summary` on jj 0.41 emits `A/M/D/R/C` only — never `U`. The `U`
branch is dead. See also WR-04.
**Fix:** Drop `U` from the regex: `/^C (.+)$/`.

### IN-05: `__vcsTestOnly.restore` JSDoc admits known disk-file leak post-restore

**File:** `sdk/src/vcs/backends/jj.ts:794-798`
**Issue:** The comment notes "jj op restore rewinds the jj op-log state but
does NOT necessarily delete untracked disk files materialized after the
snapshot." This is correctly documented and tested in
`jj-snapshot-restore.test.ts` (the test asserts the file *might* survive
the restore). Per-test hermeticity could be compromised in the contract
fixture if a previous test materialized untracked files that affect
status assertions in the next test (e.g., `vcs.status()` would surface
`A untracked.txt` from the prior test).
**Fix:** Phase 3 wrap-up has already flagged this for follow-up. Consider
appending a `jj st`-driven untracked-file cleanup step or document that
contract-suite tests using `vcs.status()` are sensitive to prior-test
untracked-file residue.

### IN-06: `parseJjStatus` `break` triggers on parent-commit line but not on EOF

**File:** `sdk/src/vcs/backends/jj.ts:265`
**Issue:** The early-`break` triggers on `Working copy  (@)` or `Parent
commit` markers, exiting the entry loop. If jj's output ever omits both
markers (e.g., empty WC, no parent), the loop iterates to EOF (which is
fine since `inSection` is false at the start and entries are gated by it).
But the regex `/^([AMDRC]) (.+)$/` against a final empty line is matched
against an empty string — `m === null`, skipped. Correct in steady state;
fragile to jj template changes that remove the trailing marker.
**Fix:** Defensive — replace the early-break with a state machine that
exits the section on any non-`[AMDRC]` line after entering.

---

_Reviewed: 2026-05-11_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
