---
phase: 05-command-translations-brownfield-validation-ci-hardening
reviewed: 2026-05-13T22:10:00Z
depth: standard
files_reviewed: 47
files_reviewed_list:
  - .github/workflows/test.yml
  - agents/gsd-code-fixer.md
  - agents/gsd-executor.md
  - get-shit-done/bin/lib/core.cjs
  - get-shit-done/bin/lib/init.cjs
  - get-shit-done/bin/lib/verify.cjs
  - get-shit-done/workflows/code-review.md
  - get-shit-done/workflows/complete-milestone.md
  - get-shit-done/workflows/execute-phase.md
  - get-shit-done/workflows/quick.md
  - get-shit-done/workflows/undo.md
  - sdk/src/query/branch-list.test.ts
  - sdk/src/query/branch-list.ts
  - sdk/src/query/command-manifest.non-family.ts
  - sdk/src/query/command-static-catalog-foundation.ts
  - sdk/src/query/current-branch.test.ts
  - sdk/src/query/current-branch.ts
  - sdk/src/query/diff.test.ts
  - sdk/src/query/diff.ts
  - sdk/src/query/head-ref.test.ts
  - sdk/src/query/head-ref.ts
  - sdk/src/query/log.test.ts
  - sdk/src/query/log.ts
  - sdk/src/query/merge.test.ts
  - sdk/src/query/merge.ts
  - sdk/src/query/push.test.ts
  - sdk/src/query/push.ts
  - sdk/src/query/reset.test.ts
  - sdk/src/query/reset.ts
  - sdk/src/query/restore.test.ts
  - sdk/src/query/restore.ts
  - sdk/src/query/revert.test.ts
  - sdk/src/query/revert.ts
  - sdk/src/query/status.test.ts
  - sdk/src/query/status.ts
  - sdk/src/vcs/__tests__/cmd-complete-milestone-jj.test.ts
  - sdk/src/vcs/__tests__/cmd-discuss-phase-jj.test.ts
  - sdk/src/vcs/__tests__/cmd-execute-phase-jj.test.ts
  - sdk/src/vcs/__tests__/cmd-hotfix-jj.test.ts
  - sdk/src/vcs/__tests__/cmd-import-jj.test.ts
  - sdk/src/vcs/__tests__/cmd-ingest-docs-jj.test.ts
  - sdk/src/vcs/__tests__/cmd-map-codebase-jj.test.ts
  - sdk/src/vcs/__tests__/cmd-new-project-jj.test.ts
  - sdk/src/vcs/__tests__/cmd-pause-work-jj.test.ts
  - sdk/src/vcs/__tests__/cmd-plan-phase-jj.test.ts
  - sdk/src/vcs/__tests__/cmd-pr-branch-jj.test.ts
  - sdk/src/vcs/__tests__/cmd-quick-jj.test.ts
  - sdk/src/vcs/__tests__/cmd-resume-work-jj.test.ts
  - sdk/src/vcs/__tests__/cmd-ship-jj.test.ts
  - sdk/src/vcs/__tests__/cmd-undo-jj.test.ts
  - sdk/src/vcs/__tests__/cmd-verify-work-jj.test.ts
  - sdk/src/vcs/__tests__/exec-env-passthrough.test.ts
  - sdk/src/vcs/__tests__/git-revert.test.ts
  - sdk/src/vcs/__tests__/jj-commit.test.ts
  - sdk/src/vcs/__tests__/jj-hooks.test.ts
  - sdk/src/vcs/__tests__/jj-lock.test.ts
  - sdk/src/vcs/__tests__/jj-octopus.test.ts
  - sdk/src/vcs/__tests__/jj-push-fetch.test.ts
  - sdk/src/vcs/__tests__/jj-workspace.test.ts
  - sdk/src/vcs/__tests__/synth-planning-fixture.test.ts
  - sdk/src/vcs/__tests__/synth-planning-fixture.ts
  - sdk/src/vcs/backends/git.ts
  - sdk/src/vcs/backends/jj.ts
  - sdk/src/vcs/types.ts
findings:
  critical: 6
  warning: 11
  info: 7
  total: 24
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-05-13T22:10:00Z
**Depth:** standard
**Files Reviewed:** 47
**Status:** issues_found

## Summary

Phase 5 lands a large surface change: 11 new SDK query verbs, the D-32 A3
hook-fix in `jj.commit()`, four new `gitOnly` primitives (revert/reset/merge/
restore), VCS-agnostic rewrites of five workflow `.md` files and two agent
`.md` files, a brownfield synthetic-jj fixture with 17 integration tests, the
CI matrix change adding jj-colocated/jj-native lanes, and a cosmetic MIGR-02
sweep across three cjs files.

The structural work — adapter narrowing, argv parsing, validateRefname use,
mock test scaffolding — is competent. **However, the workflow rewrites and
agent prompts contain systemic bugs that will break the shipped surfaces on
first execution.** Two issues dominate:

1. **The `gsd-sdk query` JSON envelope has no `.data` wrapper at the CLI
   stdout layer** (`query-dispatch.ts:239` unwraps `result.data` before
   `formatSuccess`), yet every rewritten workflow + both agent prompts use
   `jq -r '.data.X'` paths. **Every** workflow consumer of the new `log`,
   `diff`, `status`, `current-branch`, `head-ref` JSON output will read
   `null`. This is the dominant Critical-tier defect — verified empirically
   against the in-repo `gsd-sdk` binary.

2. **`gsd-sdk query log --range <X..Y>` and `gsd-sdk query diff --range
   <X..Y>` throw `Invalid RevisionExpr` for every non-encoded argument** —
   the verb takes a raw string from argv and casts it `as unknown as
   RevisionExpr | undefined`, but `RevisionExpr` requires a structured
   encoding (`range:from..to`, `rev:<sha>`, `head:`, etc. per `expr.ts`).
   `parseExpr` then throws on the bare `HEAD~5..HEAD` form that every
   workflow caller passes. Verified empirically.

Both defects share a root cause: the SDK contract layer was not exercised
against a real `gsd-sdk query` invocation during the rewrite. The unit
tests in `*.test.ts` mock `createVcsAdapter` and never reach the
`formatSuccess` / `toGitRev` pipeline, so the failure mode is invisible at
the test layer.

Beyond these two, there are several secondary defects: an unguarded `reset
--mode mixed -- <paths>` invocation that silently discards the path
arguments and resets the whole index (complete-milestone × 4 sites), an
unimplemented `revert --abort` flag the undo workflow depends on, a glob-
prefix path-containment check (`code-review.md` line 137) that admits
sibling-directory traversal, and a small set of test/correctness issues
documented below.

The MIGR-02 cjs sweep is comment-only and safe. The CI matrix change is
sound. The synthetic fixture is well-bounded for the D-34 scope.

## Critical Issues

### CR-01: All workflow + agent jq paths reading `.data.X` will return null

**File:** `agents/gsd-executor.md:354,484,524,532,539,572,641` ; `agents/gsd-code-fixer.md:223,501` ; `get-shit-done/workflows/code-review.md:218-219,234,339-340,449` ; `get-shit-done/workflows/complete-milestone.md:175,182,189,191,645,654,680,712` ; `get-shit-done/workflows/undo.md:54,91,104,214`
**Issue:** The `gsd-sdk query` CLI unwraps `result.data` before serialization (verified at `sdk/src/query/query-dispatch.ts:239`: `dispatchSuccess(formatSuccess(result.data, ...))`). Empirically: `gsd-sdk query head-ref` prints `{"ok":true,"head":"…"}` — NOT `{"data":{"ok":true,"head":"…"}}`. Every workflow that pipes the output through `jq -r '.data.X'` will read `null` (or empty under `// empty`), silently degrading the workflow:

- `agents/gsd-executor.md:484` — `jq -r '.data.raw // .data.stdout // ""'` returns `""`; the "modified files" probe always reports nothing.
- `agents/gsd-executor.md:501,524` — `jq -r '.data.head // empty' | cut -c1-7` returns empty; `TASK_COMMIT` / `COMMIT_HASH` becomes blank. The SUMMARY.md commit-hash column will be empty.
- `agents/gsd-executor.md:532,539` — status entries / diff name-status filtering reads `null`. Untracked-file detection and post-commit deletion check both silently no-op.
- `agents/gsd-executor.md:641` — self-check commit-existence probe reads `null`; the check always passes (or always fails depending on grep semantics).
- `agents/gsd-code-fixer.md:223,501` — `current-branch` and `head-ref` both return empty; the worktree-setup branch-detection short-circuits to "detached HEAD not supported".
- `workflows/complete-milestone.md:680,712` — `CURRENT_BRANCH` is empty; `git checkout "$CURRENT_BRANCH"` later errors out.
- `workflows/complete-milestone.md:645,654` — branch-list filtering reads `null`; no phase branches are detected, so the merge/cleanup loop never executes.
- `workflows/undo.md:54,91,104` — log entries read `null`; the `--last`, `--phase`, `--plan` modes all show empty commit lists.
- `workflows/code-review.md:218-219,233-234,339-340` — phase-commit discovery reads `null`; the git-diff fallback never finds any phase commits, and the workflow falls all the way to the "use --files flag" warning even when the SUMMARY-extract path would have succeeded.

**Fix:** Every `.data.X` path must become `.X` (drop the `.data` prefix). For status:
```bash
# WRONG (current):
gsd-sdk query status --porcelain | jq -r '.data.raw // .data.stdout // ""'
# CORRECT:
gsd-sdk query status --porcelain | jq -r '.raw // ""'
```
For log:
```bash
# WRONG:
gsd-sdk query log --max-count 5 | jq -r '.data.entries[] | (.hash[0:7] + " " + .subject)'
# CORRECT:
gsd-sdk query log --max-count 5 | jq -r '.entries[] | (.hash[0:7] + " " + .subject)'
```
For head-ref / current-branch:
```bash
# WRONG:
$(gsd-sdk query head-ref | jq -r '.data.head // empty' | cut -c1-7)
# CORRECT (and idiomatic — --pick exists for exactly this):
$(gsd-sdk query head-ref --pick head | cut -c1-7)
# OR plain jq:
$(gsd-sdk query head-ref | jq -r '.head // empty' | cut -c1-7)
```
A single grep-and-rewrite pass across `agents/*.md`, `get-shit-done/workflows/*.md` is sufficient — the `.data.` literal appears nowhere it should not be removed. Verify the fix by spot-running each rewritten command against the in-repo `gsd-sdk` and confirming non-null output.

---

### CR-02: `gsd-sdk query log --range` and `gsd-sdk query diff --range` throw `Invalid RevisionExpr` on every workflow callsite

**File:** `sdk/src/query/log.ts:34-47` ; `sdk/src/query/diff.ts:43-62`
**Issue:** Both `logQuery` and `diffQuery` accept a raw `--range` argv value and cast it as `RevisionExpr` (the branded string type) without going through `expr.range(from, to)` / `expr.rev(id)`:
```ts
// log.ts:46
rev: range as unknown as RevisionExpr | undefined,
// diff.ts:62
rev: range as unknown as RevisionExpr | undefined,
```
But `RevisionExpr` is encoded — `expr.head()` produces `"head:"`, `expr.range(a, b)` produces `"range:<a>..<b>"`. The git-backend translator `toGitRev()` calls `parseExpr()`, which throws `Invalid RevisionExpr: 'X'` whenever the string has no `<kind>:` prefix (`expr.ts:93`).

Empirical verification (in-repo `gsd-sdk` binary):
- `gsd-sdk query log --range "HEAD~5..HEAD" --max-count 3` → `Error: Invalid RevisionExpr: 'HEAD~5..HEAD'`
- `gsd-sdk query log --range "HEAD" --max-count 1` → `Error: Invalid RevisionExpr: 'HEAD'`
- `gsd-sdk query diff --range "HEAD~1..HEAD"` → `Error: Invalid RevisionExpr: 'HEAD~1..HEAD'`

Every workflow callsite passes the bare argv form:
- `complete-milestone.md:181` — `gsd-sdk query diff --name-status --range "${FIRST_COMMIT}..${LAST_COMMIT}"`
- `complete-milestone.md:188,190` — `gsd-sdk query log --range "${FIRST_COMMIT}" --max-count 1`
- `code-review.md:233` — `gsd-sdk query diff --name-only --range "${DIFF_BASE}..HEAD"`
- `execute-phase.md` rewrites (deletion check, name-only diff sites)
- `agents/gsd-executor.md:531` — `gsd-sdk query diff --name-status --range "HEAD~1..HEAD"`
- `agents/gsd-code-fixer.md` — implicit via SDK calls

All of these fail at runtime. Combined with CR-01 (silent null) this is catastrophic for any workflow that depends on log/diff scoping.

**Fix:** Inside `log.ts` / `diff.ts`, parse the raw argv string into an encoded `RevisionExpr` before forwarding. The minimal correct shape:
```ts
// In log.ts and diff.ts:
import { expr } from '../vcs/expr.js';

// In the arg-loop, replace the raw assignment with:
let rangeExpr: RevisionExpr | undefined;
// ...
} else if (args[i] === '--range' && args[i + 1]) {
  const raw = args[i + 1];
  // Heuristics: SHA-shaped → expr.rev(); 'HEAD'/'@' → expr.head();
  //             'HEAD~N'/'@-' → encode as 'rev:HEAD~N' via expr.rev-equivalent factory;
  //             'A..B' range → expr.range(parseSingle(A), parseSingle(B)).
  rangeExpr = parseRangeArg(raw); // new helper local to log.ts/diff.ts
  i++;
}
```
Or, more pragmatically, extend `expr.ts` with an `expr.raw(rawString): RevisionExpr` escape hatch tagged as "CLI-only" (the D-12 forbidden-raw rule was for library callers; CLI tooling must accept raw user input). Either approach is acceptable; the current cast-and-pray is a bug.

Add an integration test (not a mock) that runs the actual built `gsd-sdk` binary against a tmp git repo with a known commit and asserts `gsd-sdk query log --range HEAD~1..HEAD --max-count 1` returns a non-error response. The unit tests in `log.test.ts` / `diff.test.ts` mock `createVcsAdapter` and never reach the `toGitRev` failure path, which is why this regression slipped.

---

### CR-03: `gsd-sdk query reset --ref HEAD --mode mixed -- .planning/` silently discards the path filter and resets the entire index

**File:** `get-shit-done/workflows/complete-milestone.md:690,700,721,731` ; `get-shit-done/workflows/undo.md:243`
**Issue:** The reset workflow needs to strip `.planning/` from a staged merge — the original raw-git form was `git reset --mixed HEAD -- .planning/`, which is path-scoped (only the index entries under `.planning/` are reset). The Phase 5 rewrite became:
```bash
gsd-sdk query reset --ref HEAD --mode mixed -- .planning/ 2>/dev/null || true
```
But `reset.ts` (`sdk/src/query/reset.ts:29-49`) only parses `--cwd`, `--ref`, `--mode`. There is NO `--` separator handling, NO trailing-positional collection, and NO `paths` field on `GitOnlyOps.reset` (`types.ts:369` — `{ref, mode}` only). The `-- .planning/` tokens are silently dropped. The verb then calls `git reset --mixed HEAD` (no pathspec), which:
- **Unstages every file in the index, not just `.planning/`** — destroys whatever the orchestrator already staged for the milestone commit.
- The user-visible failure is "the milestone commit is missing files that were intentionally staged"; debugging this from a green workflow run is hard.

Worst-case scenario: complete-milestone's "Strip .planning/ from staging if commit_docs is false" branch (lines 689-691) runs after the per-branch `gsd-sdk query merge --squash`. The merge has just staged code AND planning files together. The intended behavior is "unstage only planning". The actual behavior is "unstage EVERYTHING". The follow-up `gsd-sdk query commit` then either errors (nothing staged) or commits an empty change.

**Fix:** Either (a) extend `reset.ts` + `gitOnly.reset` with a `paths?: string[]` field and pass it through to `git reset --<mode> <ref> -- <paths>`, OR (b) replace these four sites with an explicit `gsd-sdk query restore --staged -- .planning/` (also requires extending `restoreQuery` with a `--staged` flag, since the current implementation passes `--source` only). The least-churn fix is (a):
```ts
// types.ts — extend GitOnlyOps.reset signature
reset(opts: { ref: string; mode: 'soft' | 'mixed' | 'hard'; paths?: string[] }): ExecResult;
// git.ts — append paths to argv
reset: (opts): ExecResult => {
  const args = ['reset', `--${opts.mode}`, opts.ref];
  if (opts.paths && opts.paths.length > 0) args.push('--', ...opts.paths);
  return execGit(cwd, args);
},
// reset.ts — add `-- <paths>` collection (mirror diff.ts's inPaths pattern)
```
And add a unit test asserting that `--ref HEAD --mode mixed -- .planning/` reaches `gitOnly.reset` with `paths: ['.planning/']`.

---

### CR-04: `gsd-sdk query revert --abort` is silently no-op'd; the workflow believes it's recovering from mid-sequence conflict

**File:** `get-shit-done/workflows/undo.md:240` ; `sdk/src/query/revert.ts:34-49`
**Issue:** The undo workflow's error-recovery path runs:
```bash
gsd-sdk query revert --abort 2>/dev/null
```
But `revert.ts` only parses `--cwd`, `--no-commit`, and a single positional `<rev>`. The arg-loop:
```ts
} else if (!args[i].startsWith('--') && rev === undefined) {
  rev = args[i];
}
```
treats `--abort` as a flag (because it starts with `--`), but there is no handler for it — it's silently consumed and ignored. The verb then proceeds to `if (!rev) { return { ok: false, error: '<rev> argument required' }; }`. Since stderr is discarded with `2>/dev/null` and the error envelope only surfaces in stdout, the workflow sees no failure and continues to the next cleanup step.

**On git backend:** `git revert --abort` is a real recovery command that drops an in-progress revert sequence. The workflow's intent is to call this when a multi-step revert hits a conflict mid-way. The current rewrite drops the call entirely; mid-sequence conflicts will leave the user with a partially-applied revert and no automated recovery.

**Fix:** Extend `revert.ts` (and `gitOnly.revert`) with an `--abort` flag that dispatches `git revert --abort` (no rev required) and short-circuits the positional-rev requirement:
```ts
// revert.ts
let abort = false;
// ...
} else if (args[i] === '--abort') {
  abort = true;
}
// ...
if (abort) {
  if (vcs.kind === 'git') {
    const r = vcs.gitOnly.revertAbort(); // new method
    return { data: { ok: r.exitCode === 0, ...r } };
  }
  // jj: no in-progress sequence to abort — return success no-op with note
  return { data: { ok: true, backend: 'jj', note: 'jj has no revert sequence; abort is a no-op' } };
}
if (!rev) { ... }
```
Or, if the undo workflow's recovery path is only ever reachable on git, document this in the workflow and replace the `gsd-sdk query revert --abort` line with a `vcs.kind === 'git'` branch that shells `git revert --abort` directly (acceptable per the existing TODO-block pattern used elsewhere).

---

### CR-05: `restore --from HEAD~1 <file>` throws on a common git restore idiom because `validateRefname` rejects `~`

**File:** `sdk/src/query/restore.ts:44-49` ; `sdk/src/query/merge.ts:43-48`
**Issue:** Both `restoreQuery` and `mergeQuery` run `validateRefname()` on user-supplied ref arguments. But `validateRefname`'s forbidden-byte regex `REFNAME_FORBIDDEN_BYTE_OR_SET = /[\x00-\x1f\x7f ~^:?*[\\]/` rejects `~` (intentional — `~` is forbidden in raw refnames). However, `HEAD~1`, `HEAD~5`, `@~3`, etc. are *rev-expressions*, not refnames, and are perfectly valid as `git restore --source` / `git merge` arguments.

Empirical verification:
```
> validateRefname('HEAD~1')
expr.bookmark: invalid name 'HEAD~1' (forbidden byte or character)
```

So `gsd-sdk query restore --from HEAD~1 src/foo.ts` (a documented usage pattern in agent prompts) errors out before the adapter is ever called. Same for `gsd-sdk query merge HEAD~1`.

The validator was added for argv-injection defense ("no leading `-`, no embedded NUL/space/control"). Repurposing it to gate every ref string is over-broad: `git restore` and `git merge` accept rev-expressions, not just refnames. The git CLI itself distinguishes refnames (for `git branch foo`) from rev-expressions (for `git checkout HEAD~1`).

**Fix:** Replace `validateRefname(ref)` in `restore.ts:46` and `merge.ts:46` with a narrower argv-injection check that allows tilde, caret, and `@{N}`-shape sequences but still rejects leading `-` / control bytes / spaces:
```ts
function validateRevArgv(s: string): void {
  if (!s) throw new Error('empty rev');
  if (s.startsWith('-')) throw new Error(`rev '${s}' begins with '-'`);
  if (/[\x00-\x1f\x7f ]/.test(s)) throw new Error(`rev '${s}' contains control bytes or space`);
  // Refname-forbidden bytes (~^:?*[\\) are PERMITTED for rev-expressions.
}
```
Apply at restore.ts:46 and merge.ts:46. Keep the strict `validateRefname` for `bookmark` / `branch-list --prefix` / explicit bookmark-create paths where it makes sense.

Without this fix, the restore-rollback path in `gsd-code-fixer.md:88` (`gsd-sdk query restore <file>`) works (no `--from`), but any callsite that passes `--from HEAD~1` is unusable, and the merge verb cannot be used with rev-expression refs at all.

---

### CR-06: `code-review.md` path-traversal check uses glob-prefix without boundary; admits sibling-directory escape

**File:** `get-shit-done/workflows/code-review.md:135-141`
**Issue:** The `--files` override path-containment check is:
```bash
ABS_PATH=$(realpath -m "${file_path}" 2>/dev/null || echo "${file_path}")
if [[ "$ABS_PATH" != "$REPO_ROOT"* ]]; then
  echo "Error: File path outside repository, skipping: ${file_path}"
  continue
fi
```
The glob `"$REPO_ROOT"*` admits `/repo` AND `/repobad` as matches. If `REPO_ROOT=/Users/foo/myproject`, then `/Users/foo/myproject-secret/passwd` passes the containment test (it has the same prefix string and no `/` boundary). A user-supplied `--files` with a malicious sibling path can route reviewer attention at files outside the project root.

The `gsd-executor.md` setup_worktree step (line 451) uses the correct boundary form:
```bash
if [[ "$ABS_PATH" != "$WT_ROOT" && "$ABS_PATH" != "$WT_ROOT/"* ]]; then
```
which rejects `/repo` (when target is `/repobad`) because of the trailing `/`. The code-review.md form omits the trailing-slash boundary entirely.

**Fix:**
```bash
if [[ "$ABS_PATH" != "$REPO_ROOT" && "$ABS_PATH" != "$REPO_ROOT/"* ]]; then
  echo "Error: File path outside repository, skipping: ${file_path}"
  continue
fi
```
This requires the file to be EITHER the repo root itself OR strictly inside it (with `/` boundary). Note also that the fallback `|| echo "${file_path}"` returns the unresolved input when `realpath` is unavailable; combined with the buggy glob, a user passing `--files=../../etc/passwd` on a system without coreutils may pass the check entirely (depending on what `${REPO_ROOT}` resolves to). Strengthen the failure semantics: if `realpath -m` fails, **reject the path** rather than fall back to the unresolved string.

---

## Warnings

### WR-01: `branch-list --prefix` validator strips trailing `/` but does not validate empty `--prefix` strings

**File:** `sdk/src/query/branch-list.ts:32-43`
**Issue:** The validator strips `gsd/` → `gsd` for refname checking, but `--prefix ""` (empty string) passes through unchecked (the empty-prefix branch `if (probe.length > 0)` skips validation entirely). The downstream `.filter((b) => b.name.startsWith(prefix as string))` with `prefix = ""` matches every bookmark — equivalent to "no prefix", which may be the intended behavior, but it's not documented and the test suite (`branch-list.test.ts`) doesn't cover the empty-prefix case.

**Fix:** Either explicitly document `--prefix ""` as "match all" (with a test case asserting it), OR treat empty `--prefix` as an error:
```ts
if (prefix === '') {
  return { data: { ok: false, error: 'branch-list: --prefix requires a non-empty value' } };
}
if (probe.length > 0) validateRefname(probe);
```

---

### WR-02: `diff.ts` ignores `--cached` / `--name-only` ordering corner case when `--` separator appears mid-flag

**File:** `sdk/src/query/diff.ts:33-55`
**Issue:** The arg-loop sets `inPaths = true` when it sees `--`, then all subsequent args go to `paths`. But if the caller writes `gsd-sdk query diff --name-only -- --cached file.ts`, the `--cached` token after `--` is added to `paths` as a literal filename (correct git semantics — `git diff -- --cached` looks for a file literally named `--cached`). However, the `--quiet` branch (line 52) is documented as "parsed but unused" — this is fine, but the test suite never asserts that an unknown flag like `--foo` simply gets ignored without error. A typo'd `--name-onlu` (with trailing 'u') would silently fall through every branch and leave the call with all defaults, which is hard to debug.

**Fix:** Add an explicit "unknown flag" branch that warns to stderr (does not error):
```ts
} else if (args[i].startsWith('--')) {
  process.stderr.write(`diff: ignoring unknown flag '${args[i]}'\n`);
}
```
Apply the same pattern to `log.ts`, `status.ts`, etc. — silent ignores in argv parsers are a debugging tax.

---

### WR-03: `push.ts` uses `ref: bookmark as unknown as RevisionExpr | undefined` — same RevisionExpr cast hazard as log/diff

**File:** `sdk/src/query/push.ts:61`
**Issue:** Similar to CR-02, but lower-impact because the jj backend's `push()` runs `toJjRev(opts.ref)` only when ref is set and then gates on `isBookmarkLike` regex (`jj.ts:611-612`). The cast is a type-lie: `bookmark` is a refname like `feature/x`, not an encoded RevisionExpr. On the git backend, `toGitRev()` is called and will throw `Invalid RevisionExpr: 'feature/x'` exactly as in CR-02.

The `cmd-ship-jj.test.ts` Test 2 actually documents this:
```ts
await expect(
  pushQuery(['--remote', 'origin', '--bookmark', 'release/v1.0'], dir),
).rejects.toThrow(/Invalid RevisionExpr/);
```
— the test *asserts that the verb throws*, which means the contract was knowingly broken and locked in. This is a pre-existing constraint the SUMMARY documents, but it means **`gsd-sdk query push --remote origin --bookmark <name>` is unusable on either backend today** (jj throws via `toJjRev`, git throws via `toGitRev`). Every workflow that calls `gsd-sdk query push --remote X --bookmark Y` is broken.

**Fix:** In `push.ts`, route the bookmark string through `expr.bookmark(name)` before forwarding:
```ts
import { expr } from '../vcs/expr.js';
// ...
const result = vcs.push({
  remote,
  ref: bookmark ? expr.bookmark(bookmark) : undefined,
  force,
});
```
The `validateRefname(bookmark)` call upstream (line 47) already gates the input shape, so `expr.bookmark()` won't throw on legitimate input. Update the failing tests to expect success rather than `/Invalid RevisionExpr/`.

This is one of the 05-05 sweep TODOs flagged in the test source (cmd-ship-jj.test.ts:108-111), but it should not have been deferred past Phase 5 close — the workflows ship today depending on a verb that throws.

---

### WR-04: `revert.ts` jj path bypasses `expr.rev()` validation, accepts arbitrary stringly-typed change_id

**File:** `sdk/src/query/revert.ts:71-87`
**Issue:** On the jj backend, the verb runs:
```ts
const result = vcsExec(cwd, 'jj', ['abandon', rev]);
```
where `rev` is the raw argv positional. The git backend goes through `vcs.gitOnly.revert({ rev, noCommit })` which itself does not validate the rev shape. There's no `validateRefname` / `validateRevArgv` gate on the rev positional on either path. A caller passing `--abort` (currently a separate bug per CR-04) or `-D` would land at `jj abandon -D` / `git revert -D`. `jj abandon` may interpret `-D` as a flag (not a change_id) and produce unexpected behavior; `git revert -D` is "delete a single-character branch" semantics.

**Fix:** Add a rev-argv guard before the dispatch:
```ts
if (rev.startsWith('-')) {
  return { data: { ok: false, error: `revert: rev '${rev}' begins with '-'` } };
}
```
Same pattern as `validateRevArgv` from CR-05. The fix is one-line and prevents an injection-style argv hazard.

---

### WR-05: `merge.ts` `--squash --no-ff` both set, contradictory at git CLI; verb accepts and forwards both

**File:** `sdk/src/query/merge.ts:29-31,60`
**Issue:** `git merge --squash --no-ff` is a contradiction (`--squash` implies no merge commit; `--no-ff` requires a merge commit). The git CLI accepts both and `--squash` wins silently. The query verb forwards both flags unconditionally:
```ts
if (squash) args.push('--squash');
if (noFf) args.push('--no-ff');
```
The unit test `merge.test.ts:40-46` actively asserts both flags forward together, locking in the silent-precedence behavior. Workflows that allow users to compose flags can produce surprising results.

**Fix:** Either (a) document the precedence explicitly in the verb's JSDoc with a warning, OR (b) emit a stderr warning and prefer one:
```ts
if (squash && noFf) {
  process.stderr.write('merge: --squash and --no-ff are contradictory; --squash wins (git semantics)\n');
}
```
Same advisory pattern as WR-02. Either is acceptable; silence is the worst choice.

---

### WR-06: `synth-planning-fixture.ts` does not seed `vcs.adapter` config inside every test that calls `revertQuery` / `pushQuery` against jj

**File:** `sdk/src/vcs/__tests__/synth-planning-fixture.ts:102` ; `cmd-pause-work-jj.test.ts:35` ; `cmd-resume-work-jj.test.ts:35`
**Issue:** The fixture writes `.planning/config.json` with `{ vcs: { adapter: 'jj' } }` (line 102) so backend detection sticks to jj. But the cmd-undo-jj / cmd-ship-jj / cmd-hotfix-jj tests duplicate this config write inline (cmd-undo-jj.test.ts:64-67) because they use a different tmpdir setup — they don't use the synth fixture. This split-brain is a maintenance hazard: a future test author adding a new CMD-* test in the synth-fixture style may forget the config write, and `revertQuery`/`pushQuery`/etc. will silently dispatch to the git backend (which on a colocated repo also has `.git`).

The synth fixture in lines 121-138 calls `createVcsAdapter(dir, { kind: 'jj' })` explicitly, which works for direct adapter use — but every query-verb test routes through `createVcsAdapter(cwd)` (no kind), which depends on the sticky config. The synth fixture's `config.json` write is present (line 102) but easy to miss in code review.

**Fix:** Add a dedicated test helper `synthPlanningFixtureWithQueryDispatch()` (or a `pinBackend` option to `synthPlanningFixture`) that asserts the config write succeeded AND verifies `createVcsAdapter(dir)` returns kind='jj' before yielding to the caller. This makes the sticky-adapter dependency explicit and self-testing:
```ts
export function synthPlanningFixture(kind, opts?: { ensureBackend?: 'jj' | 'git' }) {
  // ... existing setup ...
  if (opts?.ensureBackend) {
    const detected = createVcsAdapter(dir);
    if (detected.kind !== opts.ensureBackend) {
      throw new Error(`synthPlanningFixture: backend stickiness failed (got ${detected.kind}, want ${opts.ensureBackend})`);
    }
  }
  return { dir, vcs, cleanup };
}
```

---

### WR-07: `jj.ts:265` `existsSync(join(cwd, '.jj'))` should not be re-probed per-commit; cache or assert at adapter construction

**File:** `sdk/src/vcs/backends/jj.ts:264-265`
**Issue:** Inside the `commit()` hot path, the colocated-detection check runs:
```ts
const isColocated = existsSync(join(cwd, '.git')) && existsSync(join(cwd, '.jj'));
```
on every commit. Two `existsSync` syscalls per commit is a small constant cost, but the colocation state of a jj adapter is fixed at construction — it cannot change between `createJjAdapter(cwd)` and a subsequent `commit()`. The probe is wasted work and introduces a tiny TOCTOU surface: if the user does `rm -rf .git` between adapter creation and commit, the second commit sees a different colocation flag than the first.

**Fix:** Compute `isColocated` once at adapter construction, cache it in a closure binding inside `createJjAdapter`:
```ts
export function createJjAdapter(cwd: string): JjVcsAdapter {
  const isColocated = existsSync(join(cwd, '.git')) && existsSync(join(cwd, '.jj'));
  // ... use the cached value inside commit() ...
}
```
Eliminates 2 syscalls per commit and tightens the invariant.

---

### WR-08: Hash-probe stderr message format is ambiguous on hook-fire success in `jj.commit()`

**File:** `sdk/src/vcs/backends/jj.ts:235-237`
**Issue:** When the deterministic hash probe (`jj log -r @-`) fails AND the pre-commit hook also fails, the code accumulates both errors via string concatenation:
```ts
mergedStderr = `${squashRes.stderr}\n[hash-probe failed]: ${hashRes.stderr || hashRes.stdout}`;
// ... later ...
mergedStderr = `${mergedStderr}\n[pre-commit hook failed]: ${hookRes.stderr || hookRes.stdout}`;
```
The caller sees two markers in stderr but no way to tell which was the real failure cause, because `CommitResult.exitCode` is `squashRes.exitCode` (always 0 if squash succeeded). A caller who sees `[pre-commit hook failed]` in stderr cannot tell if `hash` is null or valid without reading the entire stderr string and parsing markers.

**Fix:** Make `CommitResult` carry typed warning slots so callers can branch cleanly:
```ts
interface CommitResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  hash: string | null;
  warnings?: { kind: 'hash-probe' | 'pre-commit-hook' | 'bookmark-advance'; message: string }[];
}
```
Less urgent than other findings but it's a real footgun for orchestrator-side error handling.

---

### WR-09: `commit-static-catalog-foundation.ts` ordering: 11 new query verbs added in `MUTATION_SURFACES_STATIC_CATALOG` but some are read-only

**File:** `sdk/src/query/command-static-catalog-foundation.ts:80-90`
**Issue:** The 11 new verbs are registered en bloc under `MUTATION_SURFACES_STATIC_CATALOG`:
```ts
['push', pushQuery],
['reset', resetQuery],
['revert', revertQuery],
['log', logQuery],
['status', statusQuery],
['diff', diffQuery],
['branch-list', branchListQuery],
['head-ref', headRefQuery],
['current-branch', currentBranchQuery],
['merge', mergeQuery],
['restore', restoreQuery],
```
But `log`, `status`, `diff`, `branch-list`, `head-ref`, `current-branch` are read-only (their manifest entries at `command-manifest.non-family.ts:51-56` correctly set `mutation: false`). Putting them in the `MUTATION_SURFACES_*` catalog conflates the namespace ("mutation surfaces" vs "decision routing / verify-decision / state-support") and makes the catalog file harder to read.

**Fix:** Split the registrations into the appropriate constant blocks:
- read-only (`log`, `status`, `diff`, `branch-list`, `head-ref`, `current-branch`) → `STATE_SUPPORT_STATIC_CATALOG` or a new `VCS_READ_STATIC_CATALOG`
- mutating (`push`, `reset`, `revert`, `merge`, `restore`) → keep in `MUTATION_SURFACES_STATIC_CATALOG`

Behavioral impact is zero — all four catalogs are merged into a single registry by `createRegistry()` — but the file is the source of truth for "is this verb mutating?" and the current grouping makes it look like every new verb is mutating.

---

### WR-10: `acquireJjWriteLock` concurrent-acquire test uses `expect(elapsed).toBeLessThan(3800)` — tight upper bound on CI

**File:** `sdk/src/vcs/__tests__/jj-lock.test.ts:155-157`
**Issue:** The flake-fix work landed a polling timeout of 3 seconds and asserts `elapsed < 3800ms`. With heavy CI load (24 concurrent matrix cells under ubuntu-latest) and the `pnpm build:cjs` happening in `beforeAll` (~30s on cold cache per the comment at line 49), this 200ms slack above the child's 1500ms hold + 3000ms poll deadline is fragile. The test will be the next flake category if CI nodes get even slower.

**Fix:** Either (a) raise the upper bound to `5000ms` with a comment explaining why (CI scheduling jitter dominates the 200ms slack), OR (b) drop the upper bound entirely and only assert the lower bound (`elapsed >= 50ms`) — the lower bound is what proves "the lock blocked"; the upper bound is mostly a smoke check that we don't wait forever, but the `timeout: 4000` arg already guarantees that. Option (b) is cleaner.

---

### WR-11: `git-revert.test.ts` does not exercise `--cwd` flag pass-through to multi-repo scenarios

**File:** `sdk/src/vcs/__tests__/git-revert.test.ts`
**Issue:** The test covers exit-code 0 success and `--no-commit` staging on a single tmpdir. It does NOT exercise `vcs.gitOnly.revert({rev: 'non-existent-sha'})`, which would return `exitCode != 0` from git — the caller-side contract has no failing-rev test case. A future regression where `gitOnly.revert` swallows stderr would not be caught by this test.

**Fix:** Add a "rev does not exist" case:
```ts
it('returns non-zero exitCode when rev does not exist', () => {
  const vcs = createVcsAdapter(dir, { kind: 'git' });
  if (vcs.kind !== 'git') throw new Error('narrowing failed');
  const r = vcs.gitOnly.revert({ rev: 'bogus-sha-1234', noCommit: false });
  expect(r.exitCode).not.toBe(0);
  expect(r.stderr.length).toBeGreaterThan(0);
});
```

---

## Info

### IN-01: `restore.test.ts` mocks `vcsExec` but does not assert error from `vcs.kind === 'jj'` + invalid `--from`

**File:** `sdk/src/query/restore.test.ts:39-43`
**Issue:** The test "rejects --from arg that fails validateRefname" only asserts `ok: false` without checking the error string. A regression where the error message becomes a different shape (e.g., from `validateRefname` to a different validator per CR-05's fix) would still pass this test. Tighten the assertion:
```ts
expect((res.data as { error: string }).error).toMatch(/invalid|forbidden/i);
```

---

### IN-02: `synth-planning-fixture.ts` STATE.md uses `stopped_at: Phase 02-bar plan 02-01 (in-progress)` — non-canonical format

**File:** `sdk/src/vcs/__tests__/synth-planning-fixture.ts:101`
**Issue:** Real STATE.md `stopped_at` values produced by the orchestrator follow a different format (typically a short commit ID + plan ID, or a timestamp). The fixture uses a free-form prose string; future tests that parse `stopped_at` may break when the canonical format is locked. Add a comment documenting that this is illustrative-only and the parser must be loose:
```ts
// stopped_at format: free-form prose. Real orchestrator output uses
// `{commit_id_short}:{plan_id}` — when the parser locks the format,
// update this fixture.
```

---

### IN-03: `command-manifest.non-family.ts:48-58` 11 new entries lack JSDoc one-liners

**File:** `sdk/src/query/command-manifest.non-family.ts:48-58`
**Issue:** Every other entry in the manifest has either an inline comment or a logical-block comment explaining its purpose. The 11 new VCS entries get a single block-comment header (`// Phase 5 plan 05-01 Task 3 (D-33 batch 1): 11 new VCS command verbs.`) and the entries themselves are sparse. A reader scanning this file for "what does `push` do?" has to jump to `push.ts` to find out.

**Fix:** Add a one-line comment per entry, e.g.:
```ts
{ canonical: 'push', aliases: [], mutation: true, outputMode: 'json' }, // jj-or-git push w/ --remote/--bookmark/--force
```

---

### IN-04: `diff.ts:50` parsing branch `--quiet` is dead code

**File:** `sdk/src/query/diff.ts:50-53`
**Issue:** The `--quiet` branch is explicitly a "parsed but unused" stub (line 50-53). Dead code — remove it OR honor the flag semantically (e.g., set `data.raw = ''` to mimic `git diff --quiet` exit-code-only behavior). Leaving a no-op branch in the parser is confusing and a code-quality smell.

**Fix:** Delete lines 50-53 entirely. Document in JSDoc: "`--quiet` is not supported; callers should inspect `result.raw.length === 0`."

---

### IN-05: `synth-planning-fixture.test.ts:65-66` "log returns up to 5 entries" is too loose

**File:** `sdk/src/vcs/__tests__/synth-planning-fixture.test.ts:65-66`
**Issue:** The assertion `expect(entries.length).toBeLessThanOrEqual(5)` is so loose it would pass even with the wrong adapter wired in (any adapter that returns an array of 0-5 entries succeeds). For a fixture sanity test, the assertion should pin one specific value or at least be tighter — e.g., "exactly 0 entries on a fresh jj-colocated repo with no commits".

**Fix:** Compute the expected value from `vcs.refs.head` first:
```ts
const entries = fixture.vcs.log({ maxCount: 5 });
expect(Array.isArray(entries)).toBe(true);
// On a fresh jj-colocated repo: at most 1 root commit returned.
expect(entries.length).toBeLessThanOrEqual(1);
```

---

### IN-06: `code-review.md:218,339` log-query subject filter pattern has shell-escaping fragility

**File:** `get-shit-done/workflows/code-review.md:218-219,339-340`
**Issue:** The phase-commit filter:
```bash
jq -r ".data.entries[] | select(.subject | test(\"\\\(${PADDED_PHASE}\\\)|\\\(${PADDED_PHASE}-\")) | .hash"
```
mixes double-quoted shell expansion (`${PADDED_PHASE}`) with double-quoted jq expressions and over-escaped backslashes. If `PADDED_PHASE` ever contained a special character (it won't per the validator at line 28-32, but defense-in-depth), this would shell-inject. Setting aside CR-01 (the `.data.` is wrong), the jq filter mixes regex metacharacters and shell-interpolation in a way that's hard to verify by reading.

**Fix:** Move the filter to a small node helper or use `jq --arg` to pass the variable cleanly:
```bash
jq -r --arg pp "${PADDED_PHASE}" '.entries[] | select(.subject | test("\\(" + $pp + "\\)|\\(" + $pp + "-")) | .hash'
```
This is purely a readability / robustness fix; behavior is unchanged for valid inputs.

---

### IN-07: `agents/gsd-executor.md:692` worktree-branch deny-list regex misses `(release|hotfix)/.*` semantics

**File:** `agents/gsd-executor.md:467-469,692-694` ; same pattern in `workflows/quick.md` and `workflows/execute-phase.md`
**Issue:** The deny-list regex is:
```bash
echo "$ACTUAL_BRANCH" | grep -Eq '^(main|master|develop|trunk|release/.*)$'
```
which matches `release/v1.0` but NOT `hotfix/...` branches. Per the project's branching strategy (visible in `complete-milestone.md`), `hotfix/*` branches are also long-lived protected refs. If a user creates a worktree from a hotfix branch and the agent's HEAD assertion runs, it will accept `hotfix/v1.0-bug-fix` as a per-agent branch and proceed — risking destructive commits on a hotfix lane.

**Fix:** Extend the deny-list:
```bash
grep -Eq '^(main|master|develop|trunk|release/.*|hotfix/.*)$'
```
in all three sites. Low-impact for v1 but a known footgun.

---

_Reviewed: 2026-05-13T22:10:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
