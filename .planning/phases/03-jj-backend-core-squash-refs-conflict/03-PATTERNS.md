# Phase 3: jj Backend Core — Squash, Refs, Conflict - Pattern Map

**Mapped:** 2026-05-12
**Files analyzed:** 17 (5 net-new SDK source files, 1 net-new helper dir, 1 docs file, 1 baselines dir, 9 modify targets)
**Analogs found:** 14 / 17 (3 net-new files have no analog — explicit "scaffold from scratch" tasks for the planner)

This map answers, per file, exactly which existing file the planner should tell sub-agents to mirror, and which lines/blocks to copy the pattern from. It is paired with `03-RESEARCH.md` (which holds the per-method jj argv shapes and NDJSON field schemas) and `03-CONTEXT.md` (which holds the locked decisions). Read all three side-by-side.

## File Classification

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `sdk/src/vcs/backends/jj.ts` (CREATE) | backend (factory) | request-response (shell-out) | `sdk/src/vcs/backends/git.ts` | exact role, exact data flow — verb-by-verb mirror |
| `sdk/src/vcs/parse/jj-log.ts` (CREATE) | parser (NDJSON → LogEntry[]) | transform (string → struct[]) | `sdk/src/vcs/parse/worktree-list.ts::parseWorktreePorcelainEntries` | exact role (porcelain parser); flow is the same shape (line-based split + per-block field extraction) |
| `sdk/src/vcs/parse/jj-op-log.ts` (CREATE, stub) | parser (NDJSON → OpLogEntry[]) | transform | `sdk/src/vcs/parse/worktree-list.ts` | role-match; stub-shape mirrors the `parseFoo`-then-`readFoo(cwd)` split |
| `sdk/src/vcs/parse/jj-workspace-list.ts` (CREATE) | parser (NDJSON → WorkspaceInfo[]) | transform | `sdk/src/vcs/parse/worktree-list.ts` | exact role — same target type `WorkspaceInfo` |
| `sdk/src/vcs/parse/jj-id.ts` (CREATE) | translator (change_id ↔ commit_id) | pure transform | `sdk/src/vcs/parse/jj-rev.ts` + `sdk/src/vcs/parse/git-rev.ts` | role-match — pure stateless string translator in `parse/` |
| `sdk/src/vcs/jj/jj-argv.ts` (CREATE, optional helper) | helper (constant-prefix builder) | pure transform | NONE — Phase 1/2 git backend inlines flag list; jj needs the prefix every call so a one-helper module is the lift | **scaffold from scratch** — short |
| `docs/test-triage/jj-bugs.md` (CREATE) | docs (per-test verdict log) | docs | NONE in repo at this exact shape | **scaffold from scratch** — schema in CONTEXT.md `<specifics>` |
| `tests/baselines/jj-vcs/` (CREATE dir + per-verb snap files) | test fixtures | snapshot diff | `tests/baselines/git-vcs/*.snap.json` | exact role — mirror layout, change `git` → `jj` in `command`/`args` |
| `sdk/src/vcs/types.ts` (MODIFY) | adapter contract | type definitions | (self) — additive change | exact — append `CommitInput.bookmark`/`bookmarkRaw` + `VcsBookmarkDivergentError` + `VcsNotImplementedError` |
| `sdk/src/vcs/index.ts` (MODIFY) | factory + auto-detect | request-response | (self) — current `resolveKind` function | exact — replace `if (kind === 'jj') throw` with `createJjAdapter(cwd)`; rewrite `resolveKind` per D-17 |
| `sdk/src/vcs/backends.ts` (MODIFY) | matrix constants | static data | (self) | exact — flip `BACKENDS_AVAILABLE`; add per-verb allowlist (D-12) |
| `sdk/src/vcs/backends/git.ts` (MODIFY) | git backend | request-response | (self) | exact — accept-and-ignore `input.bookmark` / `input.bookmarkRaw` in `commit()` (git auto-advances natively) |
| `sdk/src/vcs/__tests__/vcs-fixture.ts` (MODIFY) | test fixture | setup/teardown | (self) | exact — add `initJjRepo()` peer of `initGitRepo()`; drop the `kind !== 'git'` throw |
| `sdk/src/vcs/__tests__/backends.test.ts` (MODIFY) | test | unit assertion | (self) | exact — update `BACKENDS_AVAILABLE` expected value |
| `sdk/src/vcs/__tests__/baseline-parity.test.ts` (MODIFY) | test | dispatch | (self) — args-shape dispatch chain | exact — add jj-backend dispatch lane gated by baseline file location (`jj-vcs/` vs `git-vcs/`) |
| `tests/helpers.cjs` (MODIFY) | test fixture | setup/teardown | (self) | role-match — add `createTempJjProject()` mirroring the existing `createTempGitProject()` (locate first via `grep` — see Pattern Assignment) |
| `.github/workflows/test.yml` (MODIFY) | CI workflow | matrix execution | (self — the existing `test` job) | exact — add `backend:` matrix axis + `Install jj` step gated by `matrix.backend == 'jj-colocated'` + `continue-on-error` on jj rows |
| `.planning/config.json` (MODIFY) | config | static data | (self) | role-match — add `vcs.adapter: 'auto'` field per D-17 |

---

## Pattern Assignments

### `sdk/src/vcs/backends/jj.ts` (CREATE, backend, request-response)

**Analog:** `sdk/src/vcs/backends/git.ts` (663 LOC reference impl)

**Whole-file structural mirror.** jj.ts is a verb-by-verb structural copy of git.ts with three substitutions:
1. `execGit(cwd, args)` → `vcsExec(cwd, 'jj', jjArgv(...args))` (`jjArgv` prepends `['--repository', cwd, '--no-pager', '--color', 'never', '--quiet']` — see `03-RESEARCH.md` §"Mandatory jj flags").
2. `toGitRev(rev)` → `toJjRev(rev)` (existing in `sdk/src/vcs/parse/jj-rev.ts`).
3. Per-verb argv shape per `03-RESEARCH.md` §"Per-Method Implementation Notes".

#### Imports pattern (copy from git.ts lines 21-53)

```typescript
import { spawnSync } from 'node:child_process';                  // Phase 3 may not need spawnSync — git.ts uses it only for untrimmed status; jj has no analog
import { resolve as resolvePath } from 'node:path';
import { vcsExec } from '../exec.js';                            // (git.ts uses execGit; jj.ts uses vcsExec with bin='jj')
import type { ExecResult } from '../exec.js';
import { expr } from '../expr.js';
import { toJjRev } from '../parse/jj-rev.js';                    // ← was toGitRev for git.ts
import { parseJjLog } from '../parse/jj-log.js';                 // ← NEW
import { parseJjWorkspaceList } from '../parse/jj-workspace-list.js';   // ← NEW
import { __vcsTestOnly } from '../types.js';
import type {
  JjVcsAdapter,                                                  // ← was GitVcsAdapter
  CommitInput,
  CommitResult,
  // … same list as git.ts ImportsTypeBlock at lines 30-49 …
  VcsBookmarkDivergentError,                                     // ← NEW (added to types.ts in plan 1)
  VcsNotImplementedError,                                        // ← NEW (added to types.ts or sibling errors.ts)
} from '../types.js';
```

#### Factory header (copy from git.ts lines 84-86)

```typescript
export function createJjAdapter(cwd: string): JjVcsAdapter {
  // ─── helpers ────────────────────────────────────────────────────────────
  const jjArgv = (...subcommand: string[]): string[] =>
    ['--repository', cwd, '--no-pager', '--color', 'never', '--quiet', ...subcommand];

  const addPrefix = (name: string, raw?: boolean): string =>
    raw ? name : `gsd/${name}`;
  const stripPrefix = (name: string): string =>
    name.startsWith('gsd/') ? name.slice('gsd/'.length) : name;
  // ─── commit ──────────────────────────────────────────────────────────────
  // …
}
```

`jjArgv` is the **central place** that enforces "never `--ignore-working-copy`" (D-05). Adding the flag anywhere outside this helper is the lint trip-wire per RESEARCH §Pitfall 5.

#### `commit()` — copy structure from git.ts lines 87-175

The git.ts `commit` body has four blocks: empty-files validation, files-list staging (read-tree + add), commit-args construction, post-hash resolution. The jj.ts version keeps the **empty-files validation block verbatim** (git.ts:95-100 — same `WR-01` message) and replaces the rest with the squash form per `03-RESEARCH.md` §`commit()`:

```typescript
const commit = (input: CommitInput): CommitResult => {
  // WR-01 verbatim (git.ts:95-100):
  if (input.files !== undefined && input.files.length === 0) {
    throw new Error(
      'commit({files:[]}) is ambiguous; pass files: undefined for the all-changes form, ' +
        'or pass at least one path to commit a specific path set.',
    );
  }
  if (input.amend) throw new VcsNotImplementedError('amend: not yet supported on jj backend (deferred per Phase 3 §Q5)');
  // SQUASH-01 / SQUASH-02: jj squash <files> -B @ -k -m '<msg>'
  const squashArgs = jjArgv('squash', '-B', '@', '-k', '-m', input.message);
  if (input.files && input.files.length > 0) squashArgs.push(...input.files);
  const squashRes = vcsExec(cwd, 'jj', squashArgs);
  if (squashRes.exitCode !== 0) {
    return { exitCode: squashRes.exitCode, stdout: squashRes.stdout, stderr: squashRes.stderr, hash: null };
  }
  // Resolve new commit's commit_id: `jj log -T 'commit_id' --no-graph -r '@-' -n 1`
  const hashRes = vcsExec(cwd, 'jj', jjArgv('log', '-r', '@-', '-T', 'commit_id', '--no-graph', '-n', '1'));
  // D-01 / D-04: bookmark advance
  if (input.bookmark || input.bookmarkRaw) {
    const bmName = input.bookmarkRaw ?? addPrefix(input.bookmark!);
    const advRes = vcsExec(cwd, 'jj', jjArgv('bookmark', 'set', bmName, '-r', '@-', '-B'));
    // merge advance stderr into return (do not silently swallow)
    if (advRes.exitCode !== 0) {
      return { ...squashRes, stderr: `${squashRes.stderr}\n${advRes.stderr}`, hash: hashRes.exitCode === 0 ? hashRes.stdout : null };
    }
  }
  return { exitCode: squashRes.exitCode, stdout: squashRes.stdout, stderr: squashRes.stderr, hash: hashRes.exitCode === 0 ? hashRes.stdout : null };
};
```

#### `log()` — mirror git.ts lines 184-219

git.ts uses a tab-separated `--format` template + NUL record terminator. jj.ts uses NDJSON template + `\n` record terminator (per JJ-04). Use the `parseJjLog` parser from `sdk/src/vcs/parse/jj-log.ts` (see that file's pattern below). The dispatch on `opts.maxCount` / `opts.rev` / `opts.allRefs` / `opts.paths` exactly mirrors git.ts:185-191.

```typescript
const log = (opts: LogOpts = {}): LogEntry[] => {
  const args = ['log', '-T', 'json(self) ++ "\n"', '--no-graph'];
  if (opts.maxCount) args.push('-n', String(opts.maxCount));
  if (opts.allRefs) args.push('-r', 'all()');
  if (opts.rev) args.push('-r', toJjRev(opts.rev));
  if (opts.paths && opts.paths.length > 0) args.push(...opts.paths);   // jj uses positional path filter, no `--`
  const r = vcsExec(cwd, 'jj', jjArgv(...args));
  if (r.exitCode !== 0) return [];
  return parseJjLog(r.stdout);
};
```

#### `status()`, `diff()`, `findConflicts()`, `push()`, `fetch()`, `refs.bookmarks.*`, `refs.currentBookmarks()`, `refs.resolveShort()`, `refs.countCommits()`, `refs.rootCommits()`, `refs.exists()`, `refs.isIgnored()`, `refs.remotes()`, `workspace.{add,forget,list,context,prune}`

Each method's argv shape lives in `03-RESEARCH.md` §"Per-Method Implementation Notes". The **structural pattern for each method** is identical to its git.ts counterpart at these line ranges:

| Method | git.ts ref | Mirror pattern from git.ts |
|--------|-----------|----------------------------|
| `status` | 234-274 | spawnSync block at 244-246 is git-specific (porcelain trim); jj.ts uses straight `vcsExec` for `jj st` |
| `diff` | 277-311 | argv builder pattern + post-parse name-status loop (298-308) — jj parser is the same letter-extraction shape on `jj diff --summary` |
| `bookmarks.list` | 315-324 | execGit + split-filter-map pattern; jj NDJSON-parses + applies `stripPrefix` + checks `target.length > 1` per D-02 |
| `bookmarks.create` | 325-330 | throw-on-nonzero pattern; jj.ts wraps name through `addPrefix` first |
| `bookmarks.move` | 331-336 | same — wrap name through `addPrefix` |
| `bookmarks.delete` | 337-342 | same — wrap name through `addPrefix` |
| `bookmarks.exists` | 343-346 | `vcsExec` exit-0 probe pattern — works identically on jj |
| `bookmarks.switch` | 348-354 | jj.ts throws `VcsNotImplementedError` (see RESEARCH §`bookmarks.switch`) |
| `currentBookmarks` | 365-371 | empty-array on detached; jj uses `jj log -r @- -T 'bookmarks.join("\n")' --no-graph -n 1` + split/filter/stripPrefix |
| `resolveShort` | 373-379 | throw-on-nonzero + `.trim()` |
| `countCommits` | 381-387 | `parseInt` + NaN-guard pattern |
| `rootCommits` | 389-394 | split-filter-map pattern |
| `refs.exists` | 396-402 | exit-0 probe pattern — works on jj `log -T '"x"' -n 1` |
| `isIgnored` | 404-409 | jj.ts throws `VcsNotImplementedError` (audit point per RESEARCH) |
| `remotes` | 411-415 | split-filter-map pattern — `jj git remote list -T 'name ++ "\n"'` |
| `findConflicts` | 502-539 | early-return pattern + Set-based path dedup; jj uses `conflicts()` revset (NOT `conflict()` — see RESEARCH §Q1) |
| `push` | 542-551 | args-array assembly pattern; jj uses `jj git push` |
| `fetch` | 553-558 | same — `jj git fetch` |
| `workspace.list` | 454-464 | parse-then-map pattern; jj.ts uses `parseJjWorkspaceList` |
| `workspace.{add,forget,prune,context}` | 435-453, 469-493 | jj.ts: `add`/`forget`/`prune` throw `VcsNotImplementedError`; `context` returns `{effectiveRoot: cwd, mode: 'main', isLinked: false}` (Phase 4 owns real semantics) |

#### `__vcsTestOnly` snapshot/restore — mirror git.ts lines 625-641

git.ts uses `refs/gsd/test-snapshot` + `reset --hard` + `clean -fdx`. jj.ts uses `jj op log` IDs + `jj op restore` (cleaner per RESEARCH §`[__vcsTestOnly]`).

```typescript
const testOnly: VcsTestOnly = Object.freeze({
  snapshot: (): SnapshotHandle => {
    const r = vcsExec(cwd, 'jj', jjArgv('op', 'log', '--no-graph', '-T', 'id ++ "\n"', '-n', '1'));
    if (r.exitCode !== 0) throw new Error(`__vcsTestOnly.snapshot: ${r.stderr}`);
    return { id: r.stdout.split('\n')[0], kind: 'jj' };
  },
  restore: (handle: SnapshotHandle): void => {
    const r = vcsExec(cwd, 'jj', jjArgv('op', 'restore', handle.id));
    if (r.exitCode !== 0) throw new Error(`__vcsTestOnly.restore: ${r.stderr}`);
  },
});
```

#### Final freeze block — copy from git.ts lines 646-660

Same `Object.freeze({ kind, cwd, commit, log, status, diff, refs, workspace, findConflicts, push, fetch, [__vcsTestOnly]: testOnly })` shape — **omit `gitOnly`** (jj has no `gitOnly` namespace per types.ts:276-279).

---

### `sdk/src/vcs/parse/jj-log.ts` (CREATE, parser)

**Analog:** `sdk/src/vcs/parse/worktree-list.ts` (98 LOC reference parser)

`worktree-list.ts` is the only parser in the repo today that has the same shape we need: a pure `parseFoo(raw: string) => Entry[]` function plus an optional `readFoo(cwd)` runner that calls `vcsExec` then `parseFoo`. Mirror that split.

#### File header / imports pattern (copy from worktree-list.ts lines 1-26)

```typescript
/**
 * SDK-local NDJSON parser for `jj log -T 'json(self) ++ "\n"' --no-graph`.
 *
 * Phase 3 JJ-04: every jj backend log read goes through this parser.
 * NDJSON-field shapes verified locally against jj 0.41.0 (see 03-RESEARCH.md
 * §"jj log -T 'json(self) ++ \"\\n\"' --no-graph -r <revset>").
 *
 * NOTE (RESEARCH Pitfall 2): vcsExec trims trailing whitespace (exec.ts:105).
 * The NDJSON template emits a trailing `\n` on the final record; the trim
 * removes it. Use `.split('\n').filter(Boolean)` (mirrors git.ts:196-198).
 */

import type { LogEntry } from '../types.js';
```

#### Parse signature + block-split pattern (mirror worktree-list.ts lines 54-74)

```typescript
export function parseJjLog(raw: string): LogEntry[] {
  if (!raw) return [];
  const lines = raw.split('\n').filter(Boolean);                  // mirrors git.ts:196-198, worktree-list.ts:56
  const entries: LogEntry[] = [];
  for (const line of lines) {
    let record: any;
    try { record = JSON.parse(line); }
    catch { continue; }                                          // Or: throw VcsParseError — planner picks
    // Map jj field names → LogEntry contract:
    const description: string = record.description ?? '';
    const nlIdx = description.indexOf('\n');
    const subject = nlIdx === -1 ? description : description.slice(0, nlIdx);
    const body = nlIdx === -1 ? '' : description.slice(nlIdx + 1);
    const entry: LogEntry = {
      hash: record.commit_id ?? '',                              // PITFALL 1: hash = commit_id, NOT change_id
      parents: Array.isArray(record.parents) ? record.parents : [],
      author: record.author?.name ?? '',
      date: record.author?.timestamp ?? '',
      subject: subject.replace(/\n$/, ''),
    };
    if (body.length > 0) entry.body = body;
    entries.push(entry);
  }
  return entries;
}
```

NDJSON field shapes are in `03-RESEARCH.md` §"jj log -T 'json(self) ++ \"\\n\"' --no-graph -r <revset>".

---

### `sdk/src/vcs/parse/jj-workspace-list.ts` (CREATE, parser)

**Analog:** `sdk/src/vcs/parse/worktree-list.ts` (whole file — same `WorkspaceInfo[]` return type)

Same NDJSON split-and-map pattern as `jj-log.ts`. Map jj fields → `WorkspaceInfo` per `03-RESEARCH.md` §"jj workspace list -T 'json(self) ++ \"\\n\"'":

```typescript
import type { WorkspaceInfo } from '../types.js';

export function parseJjWorkspaceList(raw: string): WorkspaceInfo[] {
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map((line): WorkspaceInfo => {
    const r = JSON.parse(line);
    return {
      path: r.name,                                              // Phase 3 §Q3: path = name as placeholder for single-workspace case
      rev: r.target?.commit_id ?? '',
      locked: false,                                             // RESEARCH Pitfall 4: jj has no lock primitive
    };
  });
}
```

---

### `sdk/src/vcs/parse/jj-op-log.ts` (CREATE, parser — STUB only in Phase 3)

**Analog:** `sdk/src/vcs/parse/worktree-list.ts` (same parser-shape; no production consumer in Phase 3)

Land the parser as a stub for Phase 4/5 op-log-based undo (JJOP-01). Function signature and split-and-map skeleton only — emit a typed `OpLogEntry[]` with the fields from `03-RESEARCH.md` §"jj op log -T 'json(self) ++ \"\\n\"' --no-graph" (id, parents, time, description, hostname, username, is_snapshot, workspace_name, attributes).

---

### `sdk/src/vcs/parse/jj-id.ts` (CREATE, pure translator)

**Analog:** `sdk/src/vcs/parse/jj-rev.ts` lines 1-39 + `sdk/src/vcs/parse/git-rev.ts` lines 1-37

Both existing translators are pure-stateless string mappers. jj-id.ts is the **same shape**: takes an input string (change_id or commit_id) and emits the other, using a single `jj log -r <input> -T 'commit_id'` (forward) or `-T 'change_id'` (reverse) probe.

```typescript
/**
 * change_id ↔ commit_id translator for the jj backend.
 *
 * Phase 3 only needs the commit_id direction (LogEntry.hash = commit_id per
 * PITFALL 1). The change_id direction lands as a Phase 4 read-time helper if
 * `vcs.jjOnly.commitIdOf(change)` materializes (CONTEXT.md "Deferred Ideas").
 *
 * Both probes use `jj log -r <input> -T '<field>' --no-graph -n 1`. Mirrors
 * the single-probe shape of `parse/jj-rev.ts::toJjRev` (pure-stateless +
 * single switch).
 */

import { vcsExec } from '../exec.js';

export function commitIdOf(cwd: string, changeId: string): string { /* … */ }
export function changeIdOf(cwd: string, commitId: string): string { /* … */ }
```

Header / imports pattern: copy from `parse/jj-rev.ts` lines 1-8.

---

### `sdk/src/vcs/jj/jj-argv.ts` (CREATE, helper — OPTIONAL)

**Analog:** NONE — git backend inlines the empty arg-prefix; jj needs a constant prefix on every call so a one-helper module is the lift.

**Scaffold from scratch.** Planner's discretion whether to inline `jjArgv` as a local closure inside `createJjAdapter` (recommended for tightness) or export from `sdk/src/vcs/jj/jj-argv.ts` (recommended if any future jj-side caller outside `backends/jj.ts` ever needs the prefix — UPSTREAM-02 zero-conflict sidecar pattern).

Body sketch is in `03-RESEARCH.md` §"jjArgv()". Six lines plus JSDoc.

---

### `sdk/src/vcs/types.ts` (MODIFY, additive)

**Analog:** (self) — types.ts is its own contract; additions follow the existing field-and-error-class shape.

**Add to `CommitInput`** (insert after `noVerify?: boolean;` at line 58):

```typescript
  /**
   * Phase 3 D-01: when set, the jj backend advances exactly this bookmark to
   * the new commit via `jj bookmark set gsd/<name> -r <new> -B` after squash.
   * Git backend: ignored (git's `commit` on a checked-out branch auto-advances
   * natively). Caller passes unprefixed name; adapter adds `gsd/`.
   */
  bookmark?: string;
  /**
   * Phase 3 D-04: raw-name escape — same as `bookmark` but adapter does NOT
   * add the `gsd/` prefix. For upstream-tracking bookmarks (main, trunk).
   * Git backend: ignored.
   */
  bookmarkRaw?: string;
```

**Add `VcsBookmarkDivergentError`** (mirror `VcsExecError` shape at `sdk/src/vcs/exec.ts` lines 51-76 — that's the nearest in-repo precedent for a custom-fields error class):

```typescript
export class VcsBookmarkDivergentError extends Error {
  readonly name = 'VcsBookmarkDivergentError';
  readonly bookmarkName: string;
  readonly divergentTargets: string[];
  readonly hint?: string;

  constructor(fields: { bookmarkName: string; divergentTargets: string[]; hint?: string }) {
    super(`bookmark '${fields.bookmarkName}' is divergent across ${fields.divergentTargets.length} targets`);
    this.bookmarkName = fields.bookmarkName;
    this.divergentTargets = fields.divergentTargets;
    this.hint = fields.hint;
  }
}
```

Field signature follows `VcsExecError` (`sdk/src/vcs/exec.ts:51-76`): `readonly name` initializer, `readonly` fields, constructor takes a fields object. Planner decides whether `hint?: string` carries an actionable recovery message (CONTEXT.md "Claude's Discretion").

**Add `VcsNotImplementedError`** (same shape — extend `Error`, single `message` constructor arg; or extend `VcsExecError` if call-site error handling should treat it uniformly per RESEARCH "Claude's Discretion"). Recommendation: bare `extends Error` so the error class clearly signals "verb not landed yet, not an exec failure."

---

### `sdk/src/vcs/index.ts` (MODIFY, factory + auto-detect)

**Analog:** (self) — current `createVcsAdapter` and `resolveKind` at lines 20-39

**Replace `if (kind === 'jj') throw` (lines 22-26) with**:

```typescript
if (kind === 'jj') return createJjAdapter(cwd);
```

(Plus the corresponding `import { createJjAdapter } from './backends/jj.js';` at the top.)

**Rewrite `resolveKind` per D-17** (sticky preference + git-default-when-both). The current shape at lines 31-39 is a single-pass cascade; the new shape adds the config-read step in the middle:

```typescript
function resolveKind(cwd: string, opts: CreateVcsAdapterOpts): VcsKind {
  if (opts.kind) return opts.kind;
  const envOverride = process.env.GSD_VCS;
  if (envOverride === 'git' || envOverride === 'jj') return envOverride;
  // Phase 3 D-17: sticky preference via .planning/config.json `vcs.adapter`.
  const sticky = readVcsAdapterFromConfig(cwd);             // 'git' | 'jj' | 'auto' | undefined
  if (sticky === 'git' || sticky === 'jj') return sticky;
  // 'auto' or absent: detect, defaulting to git when both present (was .jj-first in Phase 1 D-04).
  const hasGit = existsSync(join(cwd, '.git'));
  const hasJj = existsSync(join(cwd, '.jj'));
  if (hasGit) return 'git';            // git wins ties — D-17
  if (hasJj) return 'jj';
  return 'git';                        // greenfield default
}
```

Storage location for the config field is the planner's call per CONTEXT.md "Claude's Discretion"; recommendation is `.planning/config.json` `vcs.adapter` (RESEARCH §"Sticky Preference Storage"). The `readVcsAdapterFromConfig` helper is a thin `JSON.parse(readFileSync(...))` wrapper — there's no in-repo analog yet for reading project config from inside `sdk/src/vcs/`; planner picks (recommended: inline helper, swallow `ENOENT` / `JSON.parse` failures by returning `undefined`).

---

### `sdk/src/vcs/backends.ts` (MODIFY, matrix constants + per-verb allowlist)

**Analog:** (self) — flip `BACKENDS_AVAILABLE` from `['git']` (line 18) to `['git', 'jj-colocated']`.

**Per-verb allowlist (D-12) — net-new structure**, no existing analog. Recommendation (planner's discretion per RESEARCH A8):

```typescript
/**
 * Phase 3 D-12: per-verb allowlist for `jj-colocated`. Maps each adapter
 * verb to the set of backends where it is implemented. The contract-test
 * fixture (`vcs-fixture.ts::makeBackendFixture`) consults this and
 * THROWS (not skips) when a verb isn't yet implemented on the target
 * backend — skip-not-throw would let TEST-06's skip-count guard silently
 * mask drift.
 *
 * Plan 1 lands the map with every verb listing only `git`; verb-group
 * plans flip entries to add `jj-colocated` as they land. Phase 5 deletes
 * the map entirely when CI-01 graduates jj to required-blocking.
 */
export const BACKENDS_AVAILABLE_FOR_VERB: Readonly<Record<string, readonly VcsBackendKey[]>> = Object.freeze({
  commit:        ['git'],
  log:           ['git'],
  status:        ['git'],
  diff:          ['git'],
  findConflicts: ['git'],
  push:          ['git'],
  fetch:         ['git'],
  'refs.bookmarks.list':       ['git'],
  'refs.bookmarks.create':     ['git'],
  // … etc per verb listed in 03-RESEARCH.md §"Adapter Contract Surface" …
});
```

---

### `sdk/src/vcs/backends/git.ts` (MODIFY, no-op acceptance of new CommitInput fields)

**Analog:** (self) — `commit()` at lines 87-175

git.ts already destructures `input.files`, `input.message`, `input.amend`, `input.allowEmpty`, `input.noVerify`. The new `input.bookmark` and `input.bookmarkRaw` fields require **zero structural change** to the body — TypeScript's structural typing accepts the new optional fields and the body simply doesn't read them. Plan 1 may add a JSDoc note above the function header noting "Phase 3 D-01/D-04: `input.bookmark` / `input.bookmarkRaw` are ignored on git — `git commit` on a checked-out branch auto-advances natively."

---

### `sdk/src/vcs/__tests__/vcs-fixture.ts` (MODIFY, test fixture)

**Analog:** (self) — `initGitRepo()` at lines 20-29 + `setupHooks()` at lines 47-75

**Add `initJjRepo()`** mirroring `initGitRepo()` (lines 20-29). The pattern is exactly:

```typescript
function initJjRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gsd-vcs-jj-'));
  execSync('jj git init --colocate', { cwd: dir, stdio: 'pipe' });
  execSync('jj config set --user user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
  execSync('jj config set --user user.name "Test"', { cwd: dir, stdio: 'pipe' });
  // No "initial commit" — jj's `@` is born empty.
  return dir;
}
```

**Drop the `kind !== 'git'` throw (line 54-56)** and dispatch on `kind`:

```typescript
beforeAll(() => {
  if (kind === 'git') {
    sharedDir = initGitRepo();
    sharedAdapter = createVcsAdapter(sharedDir, { kind: 'git' });
  } else if (kind === 'jj-colocated') {
    sharedDir = initJjRepo();
    sharedAdapter = createVcsAdapter(sharedDir, { kind: 'jj' });
  } else {
    throw new Error(`backend '${kind}' not yet implemented (BACKENDS_AVAILABLE=${BACKENDS_AVAILABLE.join(',')})`);
  }
  const testApi = (sharedAdapter as any)[__vcsTestOnly];
  snapshotHandle = testApi.snapshot();
});
```

The snapshot/restore mechanism inside `beforeEach` (lines 63-68) is **kind-agnostic** — it dispatches through `[__vcsTestOnly]`, and the jj backend's snapshot/restore implementation (see `jj.ts` pattern above) handles the jj-side rewind via `jj op restore`.

---

### `sdk/src/vcs/__tests__/baseline-parity.test.ts` (MODIFY, parameterized backend matrix)

**Analog:** (self) — the args-shape-keyed dispatch chain at lines 116-556 (Phase 2 LEARNINGS Pattern #11)

D-11 specifies that **baseline-parity is the one test running `jj-colocated` from plan 1**. The dispatch chain doesn't need a structural rewrite — it needs an outer loop over `BACKENDS_AVAILABLE` (mirroring how `adapter-contract.test.ts` dispatches per-backend), plus a per-backend baseline directory:

```typescript
// New constant pair:
const BASELINES_GIT_DIR = join(HERE, '..', '..', '..', '..', 'tests', 'baselines', 'git-vcs');
const BASELINES_JJ_DIR  = join(HERE, '..', '..', '..', '..', 'tests', 'baselines', 'jj-vcs');

// Outer describe.for over backends — pattern from RESEARCH §"vcsTest(kind)"
describe.for(BACKENDS_AVAILABLE)('GIT-02 / JJ-equivalent byte-identity baselines (%s)', (backend) => {
  const baselineDir = backend === 'git' ? BASELINES_GIT_DIR : BASELINES_JJ_DIR;
  // … existing per-file dispatch chain, with backend-aware initFixture …
});
```

The per-args-shape dispatch lanes (lines 116-556) stay byte-stable. Each lane that runs an adapter call (e.g. lines 113, 130-141, 153-158) gets a `backend === 'git'` guard if it's git-specific, or stays neutral if the shape applies cross-backend. Recommendation: planner adds **new** dispatch lanes for jj-specific args shapes (e.g. `args[0] === 'squash'`) in the same file, mirroring the existing per-shape conditional style.

---

### `sdk/src/vcs/__tests__/backends.test.ts` (MODIFY, unit assertion)

**Analog:** (self) — line 17 `expect([...BACKENDS_AVAILABLE]).toEqual(['git'])`

One-line update: `['git']` → `['git', 'jj-colocated']`. Also rename the test label from `"BACKENDS_AVAILABLE is [git] in Phase 1"` → `"BACKENDS_AVAILABLE is [git, jj-colocated] in Phase 3"`.

---

### `tests/helpers.cjs` (MODIFY, test fixture)

**Analog:** existing `createTempGitProject()` (locate via Grep — based on convention naming; not opened in this pass to keep tokens bounded)

**Planner action:** open `tests/helpers.cjs`, locate the git-side fixture function, and add a `createTempJjProject()` peer. The shape should mirror `vcs-fixture.ts::initJjRepo()` (above) but conform to whatever return shape `createTempGitProject()` uses (likely `{ dir, vcs }` or similar). Grep targets to use:

```bash
grep -n "createTempGit\|gitInit\|initFixture\|beforeEach" tests/helpers.cjs
```

This file is large (per Phase 2 LEARNINGS); use the Grep-then-targeted-Read pattern, do NOT load the whole file. The pattern lift is one function definition.

---

### `.github/workflows/test.yml` (MODIFY, CI matrix)

**Analog:** (self) — the `test:` job at lines 56-127

**Three additive blocks:**

1. **`fail-fast: true` → `false`** at line 61 (so a jj-colocated lane failure doesn't kill the git lane).

2. **Add `backend:` matrix axis** at line 62-72:

```yaml
strategy:
  fail-fast: false
  matrix:
    os: [ubuntu-latest]
    node-version: [22, 24]
    backend: [git, jj-colocated]
    include:
      - os: macos-latest
        node-version: 24
        backend: git                      # only git on macos
```

3. **Add `Install jj` step** between line 108 (`Install dependencies`) and line 111 (`Build SDK dist`):

```yaml
      - name: Install jj
        if: matrix.backend == 'jj-colocated'
        shell: bash
        run: |
          JJ_VERSION=v0.41.0
          JJ_ARCH=$(uname -m)
          curl -fsSL "https://github.com/jj-vcs/jj/releases/download/${JJ_VERSION}/jj-${JJ_VERSION#v}-${JJ_ARCH}-unknown-linux-musl.tar.gz" \
            | tar xz -C "$RUNNER_TEMP"
          echo "$RUNNER_TEMP" >> "$GITHUB_PATH"
          jj --version
```

4. **Add `continue-on-error` + `env: GSD_TEST_BACKENDS`** to the test job (around line 56 and line 125-127):

```yaml
  test:
    runs-on: ${{ matrix.os }}
    timeout-minutes: 10
    continue-on-error: ${{ matrix.backend == 'jj-colocated' }}   # D-11 allow-failure
    # …
      - name: Run tests with coverage
        shell: bash
        env:
          GSD_TEST_BACKENDS: ${{ matrix.backend }}
        run: npm run test:coverage
```

`GSD_TEST_BACKENDS` is already plumbed through `parseBackendsEnv` (`sdk/src/vcs/backends.ts:38-51`) — no SDK-side change needed.

---

### `.planning/config.json` (MODIFY, sticky preference storage)

**Analog:** (self) — additive field

```json
{
  "...": "...",
  "vcs": {
    "adapter": "auto"
  }
}
```

Three legal values: `"git"`, `"jj"`, `"auto"` (default). Read by `createVcsAdapter` per the `resolveKind` rewrite above.

---

### `tests/baselines/jj-vcs/*.snap.json` (CREATE directory + files)

**Analog:** `tests/baselines/git-vcs/*.snap.json` (existing directory — used by `baseline-parity.test.ts` at line 30)

**Planner action:** mirror the existing layout exactly. Each baseline file is a JSON with `{id, source, fixture, command, args, expected, match?}` per the `Baseline` interface at `baseline-parity.test.ts` lines 32-49. For jj baselines, set `command: 'jj'` and `args` to the literal jj argv shape (e.g. `['log', '-T', 'json(self) ++ "\n"', '--no-graph', '-r', '@', '-n', '1']`).

`tests/__tools__/capture-vcs-baselines.cjs` is the existing baseline-capture tool (per CONTEXT.md "Reusable Assets"); planner extends it to capture jj-side baselines in plan 1 (atomic with the test.yml matrix activation). Do NOT load `capture-vcs-baselines.cjs` here — extend it with a `jj`-side capture loop mirroring the `git`-side one when plan 1 lands. Grep target:

```bash
grep -n "git-vcs\|spawnSync\|capture\|baseline" tests/__tools__/capture-vcs-baselines.cjs
```

---

### `docs/test-triage/jj-bugs.md` (CREATE, docs)

**Analog:** NONE in repo at this exact shape — scaffold from CONTEXT.md `<specifics>` schema.

**Scaffold from scratch.** Schema is locked in CONTEXT.md `<specifics>` line 232:

```markdown
| bug-id | test path | jj behavior observed | verdict (jj-mapped / git-only / carries-verbatim) | rationale | follow-up phase |
```

Plan 1 creates the file with the header + the 7 bug rows from RESEARCH §"Bug-Test Triage Table" with `verdict` and `jj behavior observed` columns left as TODO. Verb-group plans fill them in as each test surfaces under the jj-colocated lane (D-16). The wrap-up plan (D-10g) asserts every row has a non-TODO verdict.

---

## Shared Patterns

### Pattern: `vcsExec` + 5-field ExecResult — applies to every adapter method

**Source:** `sdk/src/vcs/exec.ts` lines 80-110 (the `vcsExec` function)

**Apply to:** every method in `sdk/src/vcs/backends/jj.ts`

```typescript
const r = vcsExec(cwd, 'jj', jjArgv(...args));
if (r.exitCode !== 0) {
  // Return-shape: { exitCode, stdout, stderr, hash: null } for commit;
  //               throw for refs.bookmarks.*;
  //               return [] for list-returning verbs (log, status, diff).
}
```

The 5-field shape (`exitCode`, `stdout`, `stderr`, `timedOut`, `error`) is locked by Phase 1. jj.ts inherits the contract; no new fields.

### Pattern: split-filter-map for newline-delimited output

**Source:** `sdk/src/vcs/backends/git.ts` lines 196-198 (log `.split('\x00').filter(Boolean).map(...)`) and lines 393, 414, 519 (other list parsers)

**Apply to:** `jj-log.ts`, `jj-workspace-list.ts`, `jj-op-log.ts`, every `refs.*` verb returning `string[]`

```typescript
r.stdout.split('\n').filter(Boolean).map((line) => /* parse */)
```

RESEARCH Pitfall 2: vcsExec trims trailing whitespace, so the trailing `\n` after the final NDJSON record is gone — `.filter(Boolean)` covers the edge case anyway.

### Pattern: throw-on-nonzero for void verbs

**Source:** `sdk/src/vcs/backends/git.ts` lines 325-330 (`bookmarks.create`), 331-336 (`bookmarks.move`), 337-342 (`bookmarks.delete`)

**Apply to:** every void-returning verb in jj.ts (`bookmarks.create`, `move`, `delete`, etc.)

```typescript
const r = vcsExec(cwd, 'jj', jjArgv(/* args */));
if (r.exitCode !== 0) {
  throw new Error(`bookmarks.create failed: ${r.stderr || r.stdout}`);
}
```

### Pattern: exit-0 probe for boolean verbs

**Source:** `sdk/src/vcs/backends/git.ts` lines 396-402 (`refs.exists`), 343-346 (`bookmarks.exists`)

**Apply to:** `refs.exists`, `refs.bookmarks.exists`, `refs.isIgnored` (if implemented)

```typescript
const r = vcsExec(cwd, 'jj', jjArgv(/* args */));
return r.exitCode === 0;
```

### Pattern: WR-01 empty-files validation

**Source:** `sdk/src/vcs/backends/git.ts` lines 95-100

**Apply to:** `commit` in jj.ts — copy the throw verbatim (same error message; the ambiguity is cross-backend).

### Pattern: Object.freeze namespaces inside a factory + final freeze

**Source:** `sdk/src/vcs/backends/git.ts` lines 314-355 (`bookmarks`), 417-428 (`refs`), 434-494 (`workspace`), 561-622 (`gitOnly`), 625-641 (`testOnly`), 646-660 (final adapter)

**Apply to:** every namespace block in jj.ts. Drop the `gitOnly` freeze; everything else mirrors 1:1.

### Pattern: `gsd/` prefix add/strip helpers (NEW shared pattern — Phase 3 introduces)

**Source:** NONE — net-new. Recommended canonical pinning:

```typescript
const addPrefix = (name: string, raw?: boolean): string =>
  raw ? name : `gsd/${name}`;
const stripPrefix = (name: string): string =>
  name.startsWith('gsd/') ? name.slice('gsd/'.length) : name;
```

**Apply to:** every bookmark read/write path in jj.ts per D-03 — exhaustive add on write, exhaustive strip on read. Pinned by round-trip test (D-03) and audited via grep: every `bookmark` argv must thread through `addPrefix`; every bookmark name returned from a parsed jj output must thread through `stripPrefix`.

### Pattern: Divergent-target detection (NEW — Phase 3 introduces)

**Source:** NONE — D-02 introduces.

**Apply to:** every read path that parses a `jj bookmark list` NDJSON record (`refs.bookmarks.list`, internally anywhere the adapter parses bookmark targets).

```typescript
if (Array.isArray(record.target) && record.target.length > 1) {
  throw new VcsBookmarkDivergentError({
    bookmarkName: record.name,
    divergentTargets: record.target,
  });
}
const rev = record.target[0];
```

### Pattern: `VcsNotImplementedError` throw for deferred verbs

**Source:** New — added to types.ts in plan 1.

**Apply to:** every jj.ts verb that is in the contract but doesn't have a Phase 3 production caller yet — at minimum: `bookmarks.switch`, `refs.isIgnored` (audit point), `workspace.add`, `workspace.forget`, `workspace.prune`, `CommitInput.amend === true` path.

```typescript
throw new VcsNotImplementedError('refs.bookmarks.switch: deferred to Phase 4');
```

Per D-12, throw-not-skip is the locked invariant.

---

## No Analog Found

Files with no close existing analog in the codebase. Planner should treat these as "scaffold from scratch" tasks and use the schemas in `03-RESEARCH.md` / `03-CONTEXT.md` instead.

| File | Role | Data Flow | Reason no analog |
|------|------|-----------|------------------|
| `sdk/src/vcs/jj/jj-argv.ts` (if extracted) | helper (constant prefix builder) | pure transform | Phase 1 git backend has no `gitArgv` peer — git's only mandatory flag is none, so the prefix concept is new. Body is six lines per RESEARCH §"jjArgv()". |
| `docs/test-triage/jj-bugs.md` | docs (per-test verdict log) | docs | First doc of this exact shape in the repo. Schema is locked in CONTEXT.md `<specifics>` line 232. |
| `sdk/src/vcs/backends.ts::BACKENDS_AVAILABLE_FOR_VERB` (the per-verb allowlist) | matrix mechanism | static data | No existing mechanism for per-verb backend gating; D-12 introduces. Recommended shape sketched above. Planner's discretion per RESEARCH A8 (could alternatively be a per-test `it.skipIf` or a fixture-level `expect.fail.on(kind)`). |

---

## Bug-Test File Locations (TEST-08 / D-16)

Per CONTEXT.md, worktree-bug tests are re-triaged per-test as they surface under the jj-colocated lane. Confirmed paths in the repo:

| Bug | File path (absolute via repo root) |
|-----|------------------------------------|
| 2924 | `tests/bug-2924-worktree-head-attachment.test.cjs` |
| 2774 | `tests/bug-2774-worktree-cleanup-workspace-safety.test.cjs` |
| 3097/3099 | `tests/bug-3097-3099-executor-worktree-path-safety.test.cjs` (single file covers both bug IDs) |
| 2075 | `tests/bug-2075-worktree-deletion-safeguards.test.cjs` |
| 2431 | `tests/bug-2431-worktree-locked-surfacing.test.cjs` |
| 2015 | `tests/bug-2015-worktree-base-branch.test.cjs` |
| 2388 | `tests/bug-2388-plan-phase-no-branch-rename.test.cjs` |

All 7 files exist as `.test.cjs` files under `tests/` (verified via `find`). RESEARCH §"Bug-Test Triage Table" hypothesizes all 7 are `carries-verbatim` (markdown structural assertions, no `git ` shell-out in the assertion bodies); per-test verdicts confirm or refute during plan execution.

---

## Metadata

**Analog search scope:**
- `sdk/src/vcs/` (recursive): types.ts, exec.ts, expr.ts, index.ts, backends.ts, backends/git.ts, parse/git-rev.ts, parse/jj-rev.ts, parse/worktree-list.ts
- `sdk/src/vcs/__tests__/`: vcs-fixture.ts, baseline-parity.test.ts, backends.test.ts (header), adapter-contract.test.ts (referenced via grep only)
- `tests/`: bug-* test file discovery via `find` (verified 7/7 present)
- `.github/workflows/`: test.yml (the closest analog for the CI matrix addition)

**Files scanned (read in full):** 9
**Files scanned (read in part):** 2 (RESEARCH.md, REQUIREMENTS.md)
**Files referenced via grep / find only:** 4 (tests/helpers.cjs, tests/__tools__/capture-vcs-baselines.cjs, adapter-contract.test.ts, .planning/config.json)

**Pattern extraction date:** 2026-05-12
