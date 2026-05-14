---
phase: 01-adapter-foundation-git-backend
reviewed: 2026-05-09T00:00:00Z
depth: standard
files_reviewed: 36
files_reviewed_list:
  - .github/workflows/test.yml
  - get-shit-done/bin/lib/worktree-safety.cjs
  - scripts/check-skip-count.cjs
  - scripts/lint-vcs-no-raw-git.allow.json
  - scripts/lint-vcs-no-raw-git.cjs
  - sdk/package.json
  - sdk/src/vcs/__tests__/adapter-contract.test.ts
  - sdk/src/vcs/__tests__/backends.test.ts
  - sdk/src/vcs/__tests__/baseline-parity.test.ts
  - sdk/src/vcs/__tests__/exec.test.ts
  - sdk/src/vcs/__tests__/expr.test.ts
  - sdk/src/vcs/__tests__/git-backend.test.ts
  - sdk/src/vcs/__tests__/index.test.ts
  - sdk/src/vcs/__tests__/parse-git-rev.test.ts
  - sdk/src/vcs/__tests__/types-gitonly.test-d.ts
  - sdk/src/vcs/__tests__/vcs-fixture.ts
  - sdk/src/vcs/backends.ts
  - sdk/src/vcs/backends/git.ts
  - sdk/src/vcs/exec.ts
  - sdk/src/vcs/expr.ts
  - sdk/src/vcs/hook-bridge.ts
  - sdk/src/vcs/index.ts
  - sdk/src/vcs/parse/git-rev.ts
  - sdk/src/vcs/parse/jj-rev.ts
  - sdk/src/vcs/types.ts
  - sdk/tsconfig.cjs.json
  - tests/__tools__/capture-vcs-baselines.cjs
  - tests/baselines/git-vcs/.gitkeep
  - tests/baselines/git-vcs/commands-cjs-994-diff-cached.snap.json
  - tests/baselines/git-vcs/commit-ts-execGit-3field.snap.json
  - tests/baselines/git-vcs/init-cjs-1519-status-porcelain.snap.json
  - tests/baselines/git-vcs/init-cjs-1538-version.snap.json
  - tests/baselines/git-vcs/init-cjs-1641-status-porcelain.snap.json
  - tests/helpers.cjs
  - tests/lint-vcs-no-raw-git-fixture.test.cjs
  - tests/vcs-adapter-contract.test.cjs
  - tests/vcs-cjs-smoke.test.cjs
findings:
  critical: 4
  warning: 12
  info: 5
  total: 21
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-05-09
**Depth:** standard
**Files Reviewed:** 36
**Status:** issues_found

## Summary

The Phase 1 VCS adapter foundation lands a clean type contract, branded
`RevisionExpr` with locked git/jj translators, a frozen-everywhere git backend,
a default-deny lint scanner, and a baseline-parity harness. The shape of the
code is solid and matches the planning artefacts (D-04 through D-19).

The defects below are concentrated in four areas:

1. **Lint scanner has bypass holes.** The `lint-vcs-no-raw-git.cjs` regex set
   does not catch every shape a `child_process` call can take to invoke `git`,
   so the "no raw git anywhere" guard is not airtight. This is the headline
   guard that motivates Phase 1 and Phase 2 — bypass holes here defeat the
   entire migration policy (D-17 / D-18).
2. **Cross-platform correctness regressions.** `findConflicts` mis-parses
   Windows paths, `fireHook` will not execute shebang scripts on Windows, and
   the baseline-parity harness hard-codes `/bin/sh`. The CI matrix only runs
   linux/macos, so these break silently when a hypothetical Windows runner or
   downstream consumer is added (the workflow comment explicitly notes a
   "dedicated windows-compat workflow on a weekly schedule").
3. **Status-porcelain parser is wrong for paths with whitespace/quotes.**
   `vcs.status({porcelain:true})` slices `line.slice(3)` and assumes raw paths.
   `git status --porcelain` quotes paths containing spaces, tabs, or special
   bytes unless `-z` is supplied — the adapter does not. This will silently
   feed mangled paths to every downstream consumer that does not parse `raw`.
4. **Published-package layout will break `workspace.list()`.** The `sdk/package.json`
   `files` field does NOT include `get-shit-done/bin/lib/worktree-safety.cjs`,
   yet `backends/git.ts` reaches outside the package (4 directories up) to
   `require()` it. In a downstream `npm install`, that path resolves into
   `node_modules/@gsd-build/` and the file is absent — `workspace.list()` will
   throw the documented "unreachable" error in every published consumer.

## Critical Issues

### CR-01: Lint scanner misses `execSync('git', ...)` and `execSync('git')` (no trailing space)

**File:** `scripts/lint-vcs-no-raw-git.cjs:57-58`
**Issue:**
The patterns for `execSync` and `exec` require a literal whitespace after `git`:
```js
{ re: /execSync\s*\(\s*['"`]git\s/,   label: "execSync('git …', …)" },
{ re: /\bexec\s*\(\s*['"`]git\s/,     label: "exec('git …', …)" },
```
This matches `execSync('git status', ...)` but NOT:
- `execSync('git', { cwd: ... })` — git invoked with no args (git's default
  behaviour is to print usage, but `execSync('git rev-parse', ...)` with the
  args supplied via `args` option is also possible in `child_process.spawn`).
- `execSync(\`git\`)` — backtick with no trailing whitespace.
- `execSync(['git', 'status'].join(' '))` — dynamic construction.
- `const cmd = 'git status'; execSync(cmd, ...)` — variable indirection.

The first three are real bypass surfaces — a contributor moving an existing
call site can end up below the radar by trimming the trailing space. Compare
with the `spawnSync` patterns (lines 53-56), which match on `'git'` with a
closing quote and no required whitespace.

**Fix:** Tighten the regex to match the closing quote/backtick directly, the
same way `spawnSync` is matched:
```js
{ re: /execSync\s*\(\s*['"`]git(?:\s|['"`])/, label: "execSync('git…', …)" },
{ re: /\bexec\s*\(\s*['"`]git(?:\s|['"`])/,   label: "exec('git…', …)" },
```
Add a fixture test in `tests/lint-vcs-no-raw-git-fixture.test.cjs` that
synthesizes `execSync('git')` and asserts exit 1.

---

### CR-02: `vcs.status({porcelain:true})` mis-parses paths with whitespace, quotes, or special bytes

**File:** `sdk/src/vcs/backends/git.ts:189-203`
**Issue:**
```ts
for (const line of r.stdout.split('\n').filter(Boolean)) {
  const index = line[0] ?? ' ';
  const worktree = line[1] ?? ' ';
  const path = line.slice(3);
  entries.push({ path, index, worktree });
}
```
`git status --porcelain` (v1, no `-z`) **quotes** paths that contain control
bytes, spaces (in some configs), tabs, or non-ASCII unless
`core.quotePath=false`. Example default output for a file named `a b.txt`:

```
?? "a b.txt"
```

The parser slices off bytes 3..end and stores `"a b.txt"` (literal quotes
included) as the path. Renames also use ` -> ` syntax; this parser produces
garbage for those too. Every downstream consumer that reads `entries[i].path`
will receive the wrong string.

This is the canonical pre-migration parsing seam (the baselines include
`init-cjs-1519-status-porcelain` and `init-cjs-1641-status-porcelain` exactly
because parity matters here), so the regression silently breaks the
byte-identity premise of GIT-02 the moment a path with whitespace appears.

**Fix:** Either (a) pass `-z` and split on `\0` and treat paths verbatim, or
(b) detect a quoted path (`line[3] === '"'`) and decode the C-style escapes
git emits. Recommended option:
```ts
const args = opts.porcelain === false
  ? ['status']
  : ['-c', 'core.quotePath=false', 'status', '--porcelain', '-z'];
// then split on '\0' and parse XY + path-or-rename pairs
```
Add a test under `git-backend.test.ts` that creates `a b.txt` (space) and
asserts `entries[0].path === 'a b.txt'`.

---

### CR-03: `findConflicts({scope:'working-copy'})` mis-parses Windows-style paths

**File:** `sdk/src/vcs/backends/git.ts:328-331`
**Issue:**
```ts
for (const line of r.stdout.split('\n')) {
  const colon = line.indexOf(':');
  if (colon > 0) paths.add(line.slice(0, colon));
}
```
`git diff --check` emits `path:line: leftover conflict marker`. On Windows,
`path` can be `C:\foo\bar.txt:42:` — the first colon is the drive-letter
colon. This parser stores `"C"` as the path, losing the actual filename. Even
on POSIX, paths containing literal `:` (legal on most filesystems) collapse to
the prefix.

**Fix:** Find the LAST colon-line-colon pattern, e.g.
```ts
const m = line.match(/^(.*):(\d+):\s/);
if (m) paths.add(m[1]);
```
Add a Windows-path fixture test (skip on non-Windows but assert parser
correctness against a synthetic `C:\file.txt:1: …` line via a unit test that
calls into a private parse helper).

---

### CR-04: Published package omits `worktree-safety.cjs` — `workspace.list()` is broken for downstream consumers

**File:** `sdk/package.json:17-22`, `sdk/src/vcs/backends/git.ts:110-118`
**Issue:**
`backends/git.ts` reaches four levels up out of `sdk/dist-cjs/vcs/backends/`
to `require()` `../../../../get-shit-done/bin/lib/worktree-safety.cjs`. That
relative resolution works for in-repo execution (4 levels up from
`sdk/dist-cjs/vcs/backends/` is the repo root, where `get-shit-done/bin/lib/`
lives) but **fails for any downstream consumer who installed
`@gsd-build/sdk` from npm**:
- The `files` field in `sdk/package.json` is `["dist", "dist-cjs", "shared",
  "prompts"]` — `bin/lib/worktree-safety.cjs` is not packaged.
- 4 levels up from
  `node_modules/@gsd-build/sdk/dist-cjs/vcs/backends/git.js` is
  `node_modules/@gsd-build/`, where `get-shit-done/bin/lib/...` does not
  exist.

The code already includes a "if you see this in a downstream consumer …"
error message acknowledging this. Shipping a known-broken seam in a published
package is a defect — even if `workspace.list()` is documented as a Phase 1
gap, the type signature does not advertise that it throws on every published
consumer.

**Fix:** Either
- Move `worktree-safety.cjs` (or the parser parts the adapter uses) into
  `sdk/src/vcs/parse/worktree-list.ts` so the SDK is self-contained, OR
- Add a runtime fallback in `workspace.list()` that calls `git worktree list
  --porcelain` directly and parses inline (the parser is small) when
  `worktree-safety.cjs` is unreachable, OR
- Add `"../get-shit-done/bin/lib/worktree-safety.cjs"` to the package `files`
  list and adjust the pack layout so the file lands at a stable relative
  path inside the tarball.

The first option (move the parser into the SDK) eliminates the cross-package
seam entirely and is consistent with ADR-0004's policy ownership claim.

---

## Warnings

### WR-01: `commit({files: []})` silently falls through to `git commit -am`

**File:** `sdk/src/vcs/backends/git.ts:128, 140-142`
**Issue:**
The branch `input.files && input.files.length > 0` treats `files: []`
identically to `files: undefined` — both run `git commit -am`. A caller who
passes an explicit empty array probably means "commit nothing new" and a
silent fall-through to `-am` (which commits all tracked modifications) is a
data-correctness footgun.

**Fix:** Either reject `files: []` (`throw new Error('commit({files:[]}) is
ambiguous; pass undefined for -am or pass at least one path')`), or treat
`[]` as a no-op. Document the chosen semantic in the JSDoc on `CommitInput.files`.

---

### WR-02: `gitOnly.version()` does not check exit code

**File:** `sdk/src/vcs/backends/git.ts:361-364`
**Issue:**
```ts
version: (): string => {
  const r = execGit(cwd, ['--version']);
  return r.stdout;
},
```
If `git` is not on PATH or the spawn fails, `r.stdout` is `''`. The function
returns an empty string instead of throwing — every caller has to know to
re-validate. Compare with `gitOnly.createAnnotatedTag` which DOES throw on
non-zero exit (line 357-359).

**Fix:**
```ts
version: (): string => {
  const r = execGit(cwd, ['--version']);
  if (r.exitCode !== 0) {
    throw new Error(`gitOnly.version failed: ${r.stderr || r.error?.message || 'no git on PATH'}`);
  }
  return r.stdout;
},
```

---

### WR-03: `workspace.list()` always returns `rev: ''` and `locked: false`

**File:** `sdk/src/vcs/backends/git.ts:298-305`
**Issue:**
```ts
return result.entries.map(
  (e: any): WorkspaceInfo => ({
    path: e.path ?? e.worktree ?? '',
    rev: e.head ?? e.HEAD ?? e.rev ?? '',
    locked: !!e.locked,
  }),
);
```
But `worktree-safety.cjs::parseWorktreeEntries` (line 51-72) only emits
`{path, branch}`. None of the keys `head`, `HEAD`, `rev`, or `locked` are
ever populated, so the adapter unconditionally returns `rev: ''` and
`locked: false`. The contract test asserts only that the list is non-empty,
so the regression is invisible.

**Fix:** Either extend `parseWorktreeEntries` to capture `HEAD <hex>` and
`locked` lines from the porcelain output (they exist — `git worktree list
--porcelain` emits `HEAD <sha>` and `locked` lines), or document the gap in
the JSDoc on `WorkspaceInfo` and have the adapter call
`execGit(e.path, ['rev-parse', 'HEAD'])` per entry to fill `rev`. Returning
silently incorrect data is the worst option.

---

### WR-04: `fireHook` invokes the hook script directly — broken on Windows

**File:** `sdk/src/vcs/hook-bridge.ts:13-27`
**Issue:**
```ts
const hookPath = join(cwd, '.githooks', stage);
…
return vcsExec(cwd, hookPath, [], { timeout: 60_000 });
```
`spawnSync(hookPath, [])` on Windows cannot execute `#!/usr/bin/env bash`
shebang scripts directly — `CreateProcessW` does not honour shebangs. Git's
own hook runner shells through `sh.exe` for this reason. Phase 1 ships
`hooks.fire` as a contract surface and the adapter contract test exercises
it, but only on linux/macOS runners.

**Fix:** On Windows, route through `bash -c "$hookPath"` (with quoting) when
the hook file lacks a `.cmd`/`.exe`/`.bat` extension. Or document that
`hooks.fire` is POSIX-only for Phase 1 and have it return `exitCode: -1` /
throw a clear error when `process.platform === 'win32'`.

---

### WR-05: `baseline-parity.test.ts` and `capture-vcs-baselines.cjs` hard-code `/bin/sh`

**File:** `sdk/src/vcs/__tests__/baseline-parity.test.ts:54`,
`tests/__tools__/capture-vcs-baselines.cjs:34`
**Issue:**
```ts
for (const cmd of setup) execSync(cmd, { cwd: dir, stdio: 'pipe', shell: '/bin/sh' });
```
`/bin/sh` does not exist on Windows. The test will throw `ENOENT` rather
than running. The CI matrix is currently linux + macos only, so this works
today, but the comment in `.github/workflows/test.yml:65-71` hints at a
windows-compat workflow that will trip on this immediately.

**Fix:** Use `shell: true` (which routes through `cmd.exe` on Windows and
`/bin/sh` elsewhere), or split the setup recipe into `[bin, ...args]` arrays
and call `spawnSync` without a shell.

---

### WR-06: `vcsExec` returns `exitCode: 1` for signal-killed processes — collides with legitimate exit 1

**File:** `sdk/src/vcs/exec.ts:85`
**Issue:**
```ts
exitCode: result.status ?? 1,
```
When the child exits with status 1 (e.g. `git diff` finding differences,
which is a normal exit-1 case), the result is indistinguishable from a
process that was killed by signal (where `status` is `null`). Callers must
inspect `timedOut` and `error` to disambiguate, but `commit()`, `push()`,
`fetch()`, etc. only branch on `exitCode !== 0`.

**Fix:** Either expose the original `null` status (`exitCode: number | null`)
or use a sentinel like `-1` for null status so callers can branch on
`exitCode === -1` distinctly. The 5-field shape already has `error` and
`timedOut`, so a sentinel is acceptable; document it.

---

### WR-07: `expr.bookmark` rejects `:` but allows `/` and arbitrary unicode — git refname rules are stricter

**File:** `sdk/src/vcs/expr.ts:31-34`
**Issue:**
`expr.bookmark('feature/x')` is permitted (and tests assert it round-trips),
but `expr.bookmark('@')`, `expr.bookmark('foo..bar')`, `expr.bookmark('-D')`,
`expr.bookmark('foo bar')` all pass validation. When fed to
`git branch <name>`, these emit cryptic errors or — worse, in the case of
`-D` — get parsed as a flag (`git branch -D` deletes branches).

**Fix:** Validate against git's `refname` rules (see
`git-check-ref-format(1)`): reject `..`, leading `-`, `@{`, ASCII control
bytes, spaces, `~^:?*[`, trailing `/` or `.lock`. The factory is the right
place to enforce this so jj and git share the constraint.

---

### WR-08: `getCallerSpecifier()` falls back to `process.cwd() + '/'` — silently wrong require resolution

**File:** `sdk/src/vcs/backends/git.ts:86-91`
**Issue:**
The eval-based ESM detection has a fallback for a CJS host where
`__filename` is `[eval]`:
```ts
} catch {
  return process.cwd() + '/';
}
```
`createRequire(process.cwd() + '/')` resolves relative `require` paths
against the user's cwd, not the SDK's location. The downstream
`requireCjs('../../../../get-shit-done/bin/lib/worktree-safety.cjs')` is
then resolved relative to wherever the user happened to invoke node from,
which can succeed by accident in the repo and silently fail elsewhere.

**Fix:** When both `__filename` and `import.meta.url` are unavailable,
treat `worktreeSafety` as unreachable explicitly:
```ts
} catch {
  worktreeSafetyLoadError = new Error(
    'cannot resolve module specifier (no __filename or import.meta.url) — workspace.list() unavailable',
  );
  return null;  // signal unreachable
}
```
…and have the loader handle a `null` specifier as a clean failure rather
than guessing.

---

### WR-09: `parseFrontmatter` regex rejects keys starting with digit/underscore — silently skips lines

**File:** `tests/helpers.cjs:151-153`
**Issue:**
```js
const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
if (!match) continue; // skip block-list items, blank lines, comments
```
The skip is documented as "block-list items, blank lines, comments", but it
will also silently skip any frontmatter key that begins with a digit or
underscore. The frontmatter for THIS review starts with `phase:` — fine —
but a future addition like `_internal:` or a numbered key gets dropped
without warning.

**Fix:** Either widen the regex (`^[A-Za-z_][A-Za-z0-9_-]*:`) or assert
that any `key: value`-shaped line that the regex misses is one of the
expected skip patterns; bail out otherwise.

---

### WR-10: `globToRegExp` does not escape `-` — pattern `[a-z]` becomes a regex char class accidentally

**File:** `scripts/lint-vcs-no-raw-git.cjs:71`
**Issue:**
```js
} else if ('.+?^${}()|[]\\'.includes(c)) { re += '\\' + c; i += 1; }
```
The escape set includes `[` and `]`, so a glob `[abc]` is escaped into
literal `\[abc\]`. But the `-` character is NOT escaped. A glob like
`pattern-name` survives (since `-` outside a char class is harmless) but
`pat[a-z]name` becomes `pat\[a\-z\]name` in the result regex, which still
works — accidentally. More worryingly, the `*` handling:
```js
if (c === '*') {
  if (glob[i + 1] === '*') { re += '.*'; i += 2; if (glob[i] === '/') i += 1; }
  else { re += '[^/]*'; i += 1; }
}
```
`**` followed by no `/` (e.g. allowlist entry `sdk/**`) emits `.*` and
matches any number of path segments — including zero. So `sdk/**` matches
`sdk` (no separator). On the JSON allowlist this means `globs: ["sdk/**"]`
also matches a top-level file literally named `sdk` (if one existed). The
common glob convention is for `**` to require at least one path component;
git's `gitignore(5)` matches this stricter semantic.

**Fix:** Adopt `picomatch` or `minimatch` (already widespread in the JS
ecosystem) rather than maintaining a hand-rolled glob translator. If staying
hand-rolled, escape `-` defensively and require `**/` to match at least one
component.

---

### WR-11: `lint-vcs-no-raw-git.cjs` does not scan shell scripts (`.sh`, `.bash`)

**File:** `scripts/lint-vcs-no-raw-git.cjs:50`
**Issue:**
```js
const SCAN_EXT = /\.(cjs|js|mjs|ts|yml|yaml)$/;
```
Shell scripts (`.sh`, `.bash`) are not scanned. `.githooks/` contains shell
files (per the allowlist) but the workflow YAML *is* scanned. A future
contributor who writes a helper script in `scripts/foo.sh` invoking
`git status` will not be caught by this lint, even though the policy
("no raw git anywhere") explicitly applies to all repo code.

**Fix:** Add `sh|bash` to the extension regex and add shell-grep patterns
(`\bgit\s+\w`, with the same line-annotation escape hatch). Make sure
scripts that legitimately need git (e.g. `scripts/secret-scan.sh`) are in
the allowlist.

---

### WR-12: `tsconfig.cjs.json` `include` is too narrow to be self-documenting

**File:** `sdk/tsconfig.cjs.json:8`
**Issue:**
```json
"include": ["src/vcs/**/*.ts"],
```
This works only because TypeScript transitively compiles imported files
(`src/errors.ts` is imported via `'../errors.js'` and ends up in
`dist-cjs/`). A future contributor who reads only the tsconfig will assume
non-vcs SDK files are excluded from the CJS build. If a refactor breaks the
transitive import (e.g. `errors.ts` becomes ESM-only or moves), the CJS
build silently loses `dist-cjs/errors.js` with no warning until the
`require('@gsd-build/sdk/dist-cjs/vcs/index.js')` smoke test runs.

**Fix:** Add `src/errors.ts` (and any other transitively required files) to
`include` explicitly, OR add a build-time check that asserts every `.js`
emitted by `tsc -p tsconfig.cjs.json` matches an `.ts` file listed in
`include`. The smoke test in `tests/vcs-cjs-smoke.test.cjs` catches the
loadability question, but a missing transitive emit could pass with vitest
(which uses ESM dist) and fail only on the cjs-smoke path.

---

## Info

### IN-01: Documentation references wrong path for `capture-vcs-baselines.cjs`

**File:** `tests/__tools__/capture-vcs-baselines.cjs:11`
**Issue:**
```
Run: `node scripts/capture-vcs-baselines.cjs`
```
…but the file lives at `tests/__tools__/capture-vcs-baselines.cjs`. The
correct command is `node tests/__tools__/capture-vcs-baselines.cjs`.

**Fix:** Update the JSDoc comment.

---

### IN-02: `init-cjs-1538-version.snap.json` `expected.stdout` records a host-specific Apple Git version

**File:** `tests/baselines/git-vcs/init-cjs-1538-version.snap.json:22`
**Issue:**
```json
"expected": {
  "stdout": "git version 2.50.1 (Apple Git-155)",
  …
},
"match": { "stdout": "regex:^git version " }
```
The `expected.stdout` is the recording host's exact string. The parity test
compares with the regex (correct), but the JSON file gives a misleading
"this is the value to match" impression. A contributor regenerating the
baseline on linux will see a textual diff (`git version 2.43.0` vs the
Apple string) and assume something broke.

**Fix:** When `match.stdout` is a regex, store the regex pattern alone
(`expected.stdout: null` or `expected.stdout: "<regex-matched>"`) — or
update `capture-vcs-baselines.cjs` to write a sentinel value into
`expected.stdout` instead of the captured host string.

---

### IN-03: Unused locals `_env` and `_stagedFiles` in `fireHook`

**File:** `sdk/src/vcs/hook-bridge.ts:20-25`
**Issue:**
```ts
const _env = { ...process.env, ...(ctx?.env ?? {}) };
void _env;
const _stagedFiles = ctx?.stagedFiles ?? [];
void _stagedFiles;
```
Build-only no-ops with `void` to suppress unused-var lint. The runtime
allocates and discards a fresh env clone on every hook invocation. The
comment claims "Placeholder for v2 PATH-shim wrapper" but a TODO comment +
no allocation would be cheaper and clearer.

**Fix:**
```ts
// TODO(D-05/HOOK-05): when the PATH-shim wrapper lands, pass ctx.env and
// ctx.stagedFiles via env. For Phase 1 the hook contract is "fire and
// surface exit code only".
void ctx;
```

---

### IN-04: `commit-ts-execGit-3field` baseline duplicates `commands-cjs-994-diff-cached`

**File:** `tests/baselines/git-vcs/commit-ts-execGit-3field.snap.json`,
`tests/baselines/git-vcs/commands-cjs-994-diff-cached.snap.json`
**Issue:**
The two baselines have identical `fixture`, `command`, `args`, and
`expected` payloads — only `id` and `source` differ. The parity test
exercises the same code path twice. The intent (per the commit comment) is
"the SDK call site uses the same shape", but the duplicate snapshot adds
noise without coverage benefit.

**Fix:** Either delete one (and reference both source-line citations from
the surviving record's `source` field) or extend the SDK call-site baseline
with a parameter that actually differs (e.g. `args: ['diff', '--cached',
'--name-only', '--', 'a.txt']`).

---

### IN-05: `tests/baselines/git-vcs/.gitkeep` left behind after baselines were added

**File:** `tests/baselines/git-vcs/.gitkeep`
**Issue:**
The directory now contains 5 baseline files; `.gitkeep` (empty file used to
keep an otherwise-empty directory in git) is no longer needed.

**Fix:** Delete `tests/baselines/git-vcs/.gitkeep`.

---

_Reviewed: 2026-05-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
