---
phase: 02-bulk-call-site-migration-still-git-only
reviewed: 2026-05-11T00:00:00Z
depth: standard
files_reviewed: 35
files_reviewed_list:
  - get-shit-done/bin/lib/commands.cjs
  - get-shit-done/bin/lib/core.cjs
  - get-shit-done/bin/lib/graphify.cjs
  - get-shit-done/bin/lib/init.cjs
  - get-shit-done/bin/lib/verify.cjs
  - get-shit-done/bin/lib/worktree-safety.cjs
  - scripts/lint-vcs-no-raw-git.allow.json
  - sdk/src/init-e2e.integration.test.ts
  - sdk/src/init-runner.ts
  - sdk/src/lifecycle-e2e.integration.test.ts
  - sdk/src/query/check-decision-coverage.ts
  - sdk/src/query/check-ship-ready.ts
  - sdk/src/query/commit.test.ts
  - sdk/src/query/commit.ts
  - sdk/src/query/init.ts
  - sdk/src/query/progress.ts
  - sdk/src/query/verify.ts
  - sdk/src/vcs/__tests__/adapter-contract.test.ts
  - sdk/src/vcs/__tests__/baseline-parity.test.ts
  - sdk/src/vcs/__tests__/expr.test.ts
  - sdk/src/vcs/__tests__/git-backend.test.ts
  - sdk/src/vcs/backends/git.ts
  - sdk/src/vcs/expr.ts
  - sdk/src/vcs/parse/git-rev.ts
  - sdk/src/vcs/parse/jj-rev.ts
  - sdk/src/vcs/types.ts
  - tests/__tools__/capture-vcs-baselines.cjs
  - tests/bug-3281-worktree-git-timeout.test.cjs
  - tests/commands.test.cjs
  - tests/commit-files-deletion.test.cjs
  - tests/enh-3170-graphify-commit-staleness.test.cjs
  - tests/helpers.cjs
  - tests/verify.test.cjs
  - tests/workspace.test.cjs
findings:
  critical: 2
  warning: 7
  info: 4
  total: 13
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-05-11
**Depth:** standard
**Files Reviewed:** 35 (rendered above; test files reviewed for affecting-tests only)
**Status:** issues_found

## Summary

Phase 2 is a bulk mechanical call-site migration: `execSync('git …')` swapped to
`VcsAdapter` verbs and a structured `expr.commit(sha)` / `expr.range(from,to)`
RevisionExpr factory. The mechanical-only invariant (D-08) is broadly upheld —
most sites are 1:1 swaps with adequate semantic-preservation comments.

The two BLOCKERs below are real correctness/safety defects introduced by this
phase: an unprotected `git add` argv path inside the adapter's own `commit()`
helper (option-injection vector), and a silent contract drift where
`LogOpts.format` is part of the public type but completely ignored by the git
backend implementation (callers pass `format: 'oneline'` expecting oneline
output and silently receive full structured logs). The remaining WARNINGs are
small but tractable: dead subprocess imports, semantic-shift call sites the
plan acknowledges but where the implementation goes further than the note
allows, and one parser regex that is byte-fragile on Windows-style paths
with column numbers.

Pre-existing bugs (e.g. `commitToSubrepo` in `sdk/src/query/commit.ts` never
operated on sub-repos pre-Phase-2 either) are called out as INFO so the
record is complete, but are explicitly NOT classified as Phase-2 regressions.

## Critical Issues

### CR-01: `vcs.commit({files: …})` calls `git add` without `--` separator (option-injection vector)

**File:** `sdk/src/vcs/backends/git.ts:94-103`
**Issue:** The `commit()` helper stages files via
`execGit(cwd, ['add', ...input.files])` — note the missing `'--'` argv element.
The peer entry points `vcs.stage` (line 383) and `vcs.unstage` (line 386) both
correctly inject `'--'` before user-supplied paths to neutralise filenames
that start with `-` (e.g. `-A.md`, the canonical option-injection trap that
the `#3061` follow-up tests explicitly cover). The `files` branch inside
`commit` is the one remaining `git add` call site in the adapter without
this guard. A caller routing through `vcs.commit({files: ['-A.md'], …})` —
which is the documented contract surface in types.ts:30-34 — silently invokes
`git add -A.md`, parsed by git as the `-A`/`--all` flag plus a stray
`.md` pathspec. Result: every tracked modification in the worktree is staged,
not the named file. The commit then captures the wrong scope. This is exactly
the same class of bug the `#3061` follow-ups in `commit.test.ts:419-431`
fence off for the `stage` path; the `commit` path is unfenced.

**Fix:**
```typescript
if (input.files && input.files.length > 0) {
  const addRes = execGit(cwd, ['add', '--', ...input.files]);  // add '--'
  if (addRes.exitCode !== 0) { … }
}
```
Then add a regression test mirroring `commit.test.ts:419-431` but routing
through `vcs.commit({files: [dashName], message: …})` instead of the
`commit` query handler (the query handler is already safe because it goes
through `vcs.stage`).

### CR-02: `LogOpts.format` is part of the public contract but the git backend silently ignores it

**File:** `sdk/src/vcs/backends/git.ts:156-192` (declared in `sdk/src/vcs/types.ts:69-76`)
**Issue:** `LogOpts.format` is typed as `'oneline' | 'full' | 'json'`. The
`log()` implementation never reads `opts.format` — it unconditionally uses
the hard-coded `LOG_FORMAT = '--format=%H%x09%P%x09…'`. Three callers in
Phase 2 pass `format: 'oneline'`:

  - `sdk/src/query/verify.ts:659` — verifySchemaDrift
  - `get-shit-done/bin/lib/verify.cjs:1257` — cmdVerifySchemaDrift
  - (none in progress.ts, but the comment at progress.ts:294-296 wrongly
    suggests it does)

Each caller then reconstructs an "oneline-equivalent" by `slice(0,7)`-ing the
hash plus `subject`. The reconstruction is NOT byte-identical to
`git log --oneline`:

  1. `git log --oneline` uses the repo's auto-disambiguated short SHA
     length (`core.abbrev`, typically ≥7 but can be wider on large repos).
     The reconstruction hardcodes 7.
  2. `git log --oneline` shows decoration ref names when `log.decorate` is
     configured; the reconstruction omits decorations entirely.

The contract leak is the real issue: a type that exposes
`format: 'oneline' | …` silently lying to callers about backend support
guarantees that future migration plans (Phase 3 jj backend; Phase 4 multi-
format consumers) will land on this footgun. The phase preserves verbatim
existing call sites, but it ALSO declares `format?` on the public type —
and the type declaration is new in Phase 2 (git.ts diff: +406 lines, types.ts: +78).

**Fix:** Either (a) honour the field in the implementation, or (b) remove
`format?` from `LogOpts` and force callers to do the projection themselves.
Recommended (a):

```typescript
const FORMAT_STRUCTURED = '--format=%H%x09%P%x09%an%x09%aI%x09%s%n%b';
const log = (opts: LogOpts = {}): LogEntry[] => {
  let args: string[];
  if (opts.format === 'oneline') {
    args = ['log', '--oneline'];  // no -z, parse line-by-line
    // … line-mode parser returns {hash, subject} only, parents/author/date/body undefined …
  } else {
    args = ['log', '-z', FORMAT_STRUCTURED];
  }
  …
};
```
And update the three callers' reconstruction comments to drop the
"byte-equivalent" claim, which is false.

## Warnings

### WR-01: Dead `execSync`/`execFileSync`/`spawnSync` imports in CLI modules post-migration

**File:** `get-shit-done/bin/lib/core.cjs:8`, `get-shit-done/bin/lib/init.cjs:7`
**Issue:** Both files still `require('child_process')` and destructure
`execSync` (and in `core.cjs`, also `execFileSync` / `spawnSync`), but post-
Phase-2 there are zero call sites in either file (verified by
`grep -n 'execSync(|execFileSync(|spawnSync(' core.cjs init.cjs` returns
empty). The whole point of the no-raw-git invariant (D-12 / Phase 1 plan 05)
is that these handles aren't supposed to be reachable from migrated modules
— leaving the import keeps the seam open for future drift. The
`lint-vcs-no-raw-git` scanner flags the `git` string, not the
`child_process` import, so it won't catch a regression that just adds back
an `execSync('git status')` line.
**Fix:** Drop the destructured names that are unused. For `core.cjs`:
```javascript
// before: const { execSync, execFileSync, spawnSync } = require('child_process');
// after:  (remove the line entirely)
```
For `init.cjs`: remove line 7 (`const { execSync } = require('child_process');`).

### WR-02: `parseDiffCheckPath` regex truncates paths when git emits column numbers

**File:** `sdk/src/vcs/backends/git.ts:72-75`
**Issue:** The exported helper claims to handle Windows drive-letter paths
and POSIX `:`-in-path by matching the LAST `:<digits>:` (per CR-03 comment).
But the regex `/^(.*):\d+:\s/` only handles the
`<path>:<line>: <description>` shape. Modern git (≥ 2.31) emits
`<path>:<line>:<column>: <description>` (note the second `:<col>:`). With
the trailing `:\s` anchor, the regex still matches — but greedy `.*` now
captures `<path>:<line>` because the last `:\d+:\s` slot consumes `:col:`.
Net effect: the reported path is `<actual-path>:<line>`, not
`<actual-path>`. The downstream `Set<string>` of conflict paths
de-duplicates by this corrupted key, and the `findConflicts()` caller
returns `paths: ["<file>:<line1>", "<file>:<line2>", …]` instead of
`paths: ["<file>"]`.
**Fix:** Anchor against the trailing description marker, not just `\s`, and
allow an optional column number:
```typescript
export function parseDiffCheckPath(line: string): string | null {
  // Format: <path>:<line>[:<col>]: <description>
  const m = line.match(/^(.+?):\d+(?::\d+)?:\s/);
  return m && m[1] ? m[1] : null;
}
```
Note the swap to non-greedy `.+?` so the path stops at the first `:<line>`,
and the optional `(?::\d+)?` accommodates both pre- and post-2.31 git.

### WR-03: `vcs.refs.exists(vcs.refs.head)` mis-classifies initialised-but-empty repos as "not a git repo"

**File:** `get-shit-done/bin/lib/verify.cjs:1334` (and equivalently
`sdk/src/query/verify.ts`, the SDK port of cmdVerifyCodebaseDrift if/when
landed)
**Issue:** The migration replaces `git rev-parse HEAD` (original) with
`vcs.refs.exists(vcs.refs.head)` (new). For an init'd repo with no commits
yet (e.g. immediately after `git init`, before the first commit), both
calls fail — same exit code, same "skipped" outcome. The semantic
preservation works for this specific test. HOWEVER, the in-line comment
at lines 1325-1328 claims `vcs.refs.exists(vcs.refs.head)` is "the repo-
existence probe (boolean return; non-throwing for non-git cwd)". That
claim is over-broad: `vcs.refs.exists` returns false for THREE distinct
runtime states — (a) cwd is not a git repo, (b) cwd IS a git repo but
HEAD doesn't resolve to a commit, (c) git binary is missing from PATH —
and the caller treats all three identically as "not-a-git-repo". For
codebase-drift detection that conflation is harmless, but the comment
documents the probe in a way that invites future callers (Phase 3 jj
backend, etc.) to reuse it for genuine "is this a git repo?" tests
where the conflation matters. Promote the docstring to a real probe
like `vcs.workspace.context()` (which throws cleanly on non-repo) for
those callers, or split the comment to enumerate the three failure
modes.
**Fix:** Either:
1. Update the comment at verify.cjs:1325-1328 to enumerate the failure
   modes explicitly, OR
2. Switch the probe to:
   ```javascript
   try { vcs.workspace.context(); }
   catch { emit({skipped: true, reason: 'not-a-git-repo', …}); return; }
   ```
   which is genuinely a repo probe (throws for non-repo, succeeds for
   empty-repo OR populated-repo — closer to the original `rev-parse
   --git-dir` shape that the pre-migration code SHOULD have used).

### WR-04: `commit.gpgsign false` set in commit.test.ts setup but NOT in helpers.cjs `createTempGitProject`

**File:** `tests/helpers.cjs:96-103` vs `sdk/src/query/commit.test.ts:71-78`
**Issue:** `commit.test.ts:beforeEach` sets BOTH `commit.gpgsign false`
AND `tag.gpgsign false` on every fresh fixture (lines 76-77, called out
as "Phase 2 D-03 fix"). The shared `tests/helpers.cjs:createTempGitProject`
only sets `commit.gpgsign false` (line 102) and OMITS `tag.gpgsign false`.
Any CJS-side test that creates a temp project via `createTempGitProject`
AND subsequently invokes a code path that calls
`vcs.gitOnly.createAnnotatedTag` will fail on developer machines with
`tag.gpgsign = true` set globally (git tag -a refuses to write the tag
object). The Phase 2 commit message explicitly notes the fix; it just
wasn't applied symmetrically.
**Fix:** Add line to helpers.cjs:103:
```javascript
vcs.gitOnly.configSet('tag.gpgsign', 'false');
```

### WR-05: `findConflicts(scope: 'all')` silently returns `[]` for git — design intent OK, but commits the implementation to "all" meaning "working-copy" on git forever

**File:** `sdk/src/vcs/backends/git.ts:461-468`
**Issue:** The git backend's `findConflicts({scope: 'all'})` returns `[]`
unconditionally with a comment that Phase 3 jj backend will implement
real semantics. The verify gate (CONFLICT-03) that consumes this will
silently pass on a git repo containing actual unmerged conflicts in the
index (e.g. mid-merge, mid-rebase) — `scope: 'all'` is the natural call
for "is there ANY conflict in this repo?", and `[]` translates to "no
conflicts" which is wrong. The verb shape is forward-compatible with jj,
but its git semantics are "I don't know" not "no conflicts found". Git
has approximations: `git ls-files --unmerged` lists index-side conflicts;
`git status --porcelain` `UU` entries flag working-copy conflicts. The
backend could surface index-side conflicts under `scope: 'all'` and still
preserve the Phase 3 jj-side full semantics.
**Fix:** Either (a) return a populated result from `git ls-files --unmerged`
for `scope: 'all'` on git, OR (b) THROW a structured error on git for
`scope: 'all'` so the verify gate fails closed rather than silently passing.
Recommended (a):
```typescript
if (opts.scope === 'all') {
  const r = execGit(cwd, ['ls-files', '--unmerged']);
  // ls-files --unmerged outputs: <mode> <sha> <stage>\t<path>
  // collect unique paths
  const paths = new Set<string>();
  for (const line of r.stdout.split('\n')) {
    const tab = line.indexOf('\t');
    if (tab > 0) paths.add(line.slice(tab + 1));
  }
  return paths.size > 0
    ? [{ rev: 'INDEX', paths: [...paths], scope: 'all' }]
    : [];
}
```

### WR-06: `vcs.commit({files: ['.']})` in `helpers.cjs:111` triggers the same option-injection vector when `.` happens to be the cwd of a worktree with a `-`-prefixed file

**File:** `tests/helpers.cjs:111`
**Issue:** Follow-up to CR-01. `createTempGitProject` calls
`vcs.commit({files: ['.'], message: 'initial commit'})`. The unguarded
`git add .` itself is harmless, but ANY future test that drops a file
named `-…` into the temp dir before invoking `createTempGitProject`-style
helpers — and then routes a commit through `vcs.commit({files: [<paths>]})`
— hits CR-01. Until CR-01 lands, helpers.cjs should switch to the
guarded path:
**Fix:**
```javascript
// before:
vcs.commit({ files: ['.'], message: 'initial commit' });
// after:
vcs.stage(['.']);                       // already passes through `--`
vcs.commit({ message: 'initial commit' });   // -am path; no add side effect
```

### WR-07: `vcs.refs.exists(expr.commit(hash))` semantic shift from commit-only to any-object — partially documented, but `cmdVerifyCommits` still names its result `all_valid`/`valid`/`invalid` as if commits-only

**File:** `get-shit-done/bin/lib/verify.cjs:285-300`, `sdk/src/query/verify.ts:326-364`
**Issue:** The pre-migration `cat-file -t <hash>` probe checked
`stdout.trim() === 'commit'` — so a tree/blob/tag hash that exists in the
object store was classified `invalid`. The new `vcs.refs.exists(expr.commit(hash))`
returns true for ANY reachable object. The phase context note
acknowledges this and rules it plan-sanctioned (RESEARCH §truth #1 — CLI
inputs are commit SHAs in practice). However, the result schema
(`{ all_valid, valid, invalid, total }`) and the verify-summary call site
(`commits_exist` field) STILL use the word "commit". If anyone passes a
tree SHA — e.g. a hand-edited SUMMARY.md citing a tree hash by mistake —
the new probe answers "valid"; the old probe answered "invalid". The
schema name lies to the caller. This is a pre-existing-shape-locked
naming, but the semantic that the name described has now drifted away
from the implementation.
**Fix:** Rename the schema field to `all_reachable`/`reachable`/`unreachable`
when forward-compat allows, OR (preserving the field names) add a
secondary cat-file probe that re-validates the type — small extra cost,
fidelity preserved:
```typescript
const exists = vcs.refs.exists(expr.commit(hash));
if (!exists) { invalid.push(hash); continue; }
// Extra type-check: keep the original commit-only semantic.
// (Would need a new adapter verb `vcs.refs.objectType(rev): 'commit' | ...`)
```
Logged as WARNING rather than BLOCKER because the phase context explicitly
sanctions the shift; the issue is documentation/naming consistency.

## Info

### IN-01: `commitToSubrepo` in `sdk/src/query/commit.ts` does not actually operate on sub-repos (pre-existing bug carried forward)

**File:** `sdk/src/query/commit.ts:237-320`
**Issue:** The SDK port of `commitToSubrepo` does NOT iterate over
`config.sub_repos`, does NOT group files by sub-repo prefix, and does NOT
strip the sub-repo prefix from file paths before staging/committing —
all of which the CJS counterpart `commands.cjs:cmdCommitToSubrepo`
(lines 409-496) DOES do. The SDK function just runs a single `vcs.stage`
+ `vcs.commit` rooted at `projectDir`, which is what `commit` already
does. **Verified against pre-Phase-2 (021d7823^)** — the same defect
existed before the VcsAdapter migration (used `spawnSync('git', ['-C',
projectDir, …])` then, with the same lack of sub-repo iteration). So
NOT a Phase 2 regression — Phase 2's mechanical-only invariant correctly
preserved the broken shape. Filing as INFO so the defect is documented
for a follow-up phase to fix.

### IN-02: `format: 'oneline'` in `progress.ts:297` comment claims `format:'%as'` was the contract path — code uses no format arg at all

**File:** `sdk/src/query/progress.ts:292-303`
**Issue:** Comment at line 292-296 reads:
"vcs.log() with maxCount:1 + format:'%as' is the contract path for
 `show -s --format=%as <sha>`". The call site at line 297 is
`vcs.log({ rev: expr.commit(firstCommit), maxCount: 1 })` — note no
`format` field. The code works (LogEntry.date is `%aI`, sliced to 10
chars matches `%as`'s YYYY-MM-DD), but the comment is misleading. CR-02
covers the underlying contract issue; this is just the comment drift.
**Fix:** Update comment to reflect actual behavior:
"vcs.log() with maxCount:1 returns LogEntry.date populated from %aI;
 slice(0,10) extracts the YYYY-MM-DD prefix equivalent to %as."

### IN-03: `LOG_FORMAT` body parsing fragile if `-z` records contain literal `\n` in subject lines

**File:** `sdk/src/vcs/backends/git.ts:172-191`
**Issue:** The structured log parser splits each `-z` record on the
FIRST `\n` to separate the subject-line tuple from the body
(`record.indexOf('\n')`). Subjects can legitimately contain raw `\n`
in rare cases (e.g. commits authored via low-level plumbing). If a
subject contains `\n`, the parser treats everything after the first
`\n` as body — silently dropping the rest of the subject. Modern git
sanitises subjects to no-newline by default but `core.commentChar`
configs and plumbing-authored commits can bypass that.
**Fix:** This is an edge case noted for completeness; no immediate
action required. Document the assumption inline:
```typescript
// LOG_FORMAT places subject on the first line and body after %n. We
// assume subjects do not contain literal \n (true for `git commit -m`
// authored commits; not guaranteed for plumbing-authored commits).
```

### IN-04: `REFNAME_FORBIDDEN_BYTE_OR_SET` regex in expr.ts does not cover all of git's refname rules

**File:** `sdk/src/vcs/expr.ts:37`
**Issue:** The bookmark-name validator catches the common dangerous
sets (control bytes, space, `~^:?*[\\`) and per-component `.lock` /
leading-`.`. It does NOT catch:
  - Names ending with literal `.` (refname rule, e.g. `foo.`)
  - Names containing `@@{N}` (which `git rev-parse` interprets)
  - Names that are exactly `@` (a valid component but a refname keyword)
Probability of malicious crafting is low (the existing checks cover
the option-injection space), but completeness against
git-check-ref-format(1) is worth tightening.
**Fix:** Add to `validateBookmarkName`:
```typescript
if (name.endsWith('.')) {
  throw new Error(`expr.bookmark: invalid name '${name}' (trailing '.')`);
}
if (name === '@') {
  throw new Error(`expr.bookmark: '@' is a reserved refname`);
}
```

---

_Reviewed: 2026-05-11_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
