# Phase 4: Workspaces + Octopus Structure + Hooks — Pattern Map

**Mapped:** 2026-05-13
**Files analyzed:** 14 (10 to modify, 4 to create)
**Analogs found:** 14 / 14 (every new file has a concrete in-repo analog; Phase 4 is wiring, not invention)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `sdk/src/vcs/types.ts` (MOD) | type / surface contract | shape commit | own existing body (lines 152-265, 318-361) | self — extension |
| `sdk/src/vcs/backends/jj.ts` (MOD, primary edit target) | adapter backend / verb impl | request-response (argv) | own `commit()`/`bookmarks.*` lines 141-236, 578-637; `workspace.list()` 813-818 | self — fill stubs |
| `sdk/src/vcs/backends/git.ts` (MOD, mirror) | adapter backend / verb impl | request-response (argv) | own `workspace.add/forget/list/prune` 451-512; `commit()` 99-186 | self — extend |
| `sdk/src/vcs/backends.ts` (MOD, allowlist) | config / verb gate | static map | own `BACKENDS_AVAILABLE_FOR_VERB` lines 41-112 | self — flip entries |
| `sdk/src/vcs/hook-bridge.ts` (MOD, JSDoc only) | utility (hook fire) | request-response | own body 7-42 | self — no shape change |
| `sdk/src/vcs/expr.ts` (MOD, refname validator extraction) | utility / validator | pure-function | own `validateBookmarkName` lines 38-61 | self — lift to shared module |
| `sdk/src/vcs/jj/lock.ts` (NEW) | utility (advisory lock RAII) | request-response | `hook-bridge.ts` `fireHook` (sidecar pattern); Node `fs.openSync(O_EXCL)` idiom | role-match (utility) |
| `sdk/src/vcs/jj/reap.ts` (NEW) | service (probe + abandon + forget + rm batch) | batch | `worktree-safety.cjs` `executeWorktreePrunePlan` lines 154-217 | exact (batch reap + plan/execute split) |
| `sdk/src/vcs/jj/octopus.ts` (NEW, optional) | service / orchestrator helper | request-response | `bookmarks.create` lines 594-601 + `commit()` 141-236 | role-match (composes existing verbs) |
| `sdk/src/vcs/jj/incomplete-work.ts` (NEW) | utility (markdown append/parse) | file-I/O | `parseJjWorkspaceList` lines 31-51 (line-delimited parse); `worktree-safety.cjs` plan-then-execute split | role-match (parser + writer) |
| `sdk/src/vcs/jj/pre-push.ts` (NEW) | service (inline jj-pre-push replication) | request-response | `bookmarks.list()` lines 578-593 (NDJSON enumerate) + `fireHook` invocation | role-match |
| `sdk/src/query/hooks.ts` (NEW, SDK query bridge) | controller / SDK query | request-response | existing `sdk/src/query/commit.ts`, `sdk/src/query/workspace.ts` | exact (query file shape) |
| `sdk/src/vcs/__tests__/jj-workspace.test.ts` (MOD) | test (vitest) | test-fixture | own body 1-129 | self — fill real assertions |
| `tests/helpers.cjs` (MOD, multi-workspace fixture) | test fixture (CJS) | test-setup | own `vcsTest(kind)` lines 223-307 | self — extend |
| `sdk/src/vcs/__tests__/baseline-parity.test.ts` (MOD) | test (vitest baseline) | test-fixture | own body 1-562 + matching `.snap.json` shape | self — add workspace rows |
| `.github/workflows/test.yml` (MOD) | CI config | config | own matrix lines 56-90 | self — add 1 axis |

## Pattern Assignments

### `sdk/src/vcs/types.ts` (type extension — shape commit)

**Analog:** own existing body. Phase 4 adds:
- `acquireWriteLock(workspace: string, opts?: { timeout?: number }): { release(): void }`
- `VcsIncompleteSubagentsError` (new error class)
- Optional: `workspace.reap(opts: { phaseNamePrefix: string }): ReapResult`
- Optional: `WorkspaceAdd.name?: string` (so `--name <NAME>` flows through verb input)

**Error-class pattern** (lines 320-345 — copy verbatim shape for `VcsIncompleteSubagentsError`):
```typescript
export class VcsBookmarkDivergentError extends Error {
  readonly name = 'VcsBookmarkDivergentError';
  readonly bookmarkName: string;
  readonly divergentTargets: readonly string[];
  readonly hint?: string;

  constructor(fields: {
    bookmarkName: string;
    divergentTargets: readonly string[];
    hint?: string;
  }) {
    super(
      `bookmark '${fields.bookmarkName}' is divergent across ${fields.divergentTargets.length} targets`
    );
    this.bookmarkName = fields.bookmarkName;
    this.divergentTargets = fields.divergentTargets;
    this.hint = fields.hint;
  }
}
```
For `VcsIncompleteSubagentsError`, mirror this shape with `readonly entries: readonly IncompleteWorkEntry[]; readonly phaseDir: string; readonly hint?: string;` and a constructor that formats the count into the message.

**Workspace interface pattern** (lines 258-265):
```typescript
export interface VcsWorkspace {
  add(input: WorkspaceAdd): WorkspaceInfo;
  forget(path: string): void;
  list(): WorkspaceInfo[];
  context(): WorkspaceContext;
  prune(): ExecResult;
}
```
Phase 4 adds `reap(opts: { phaseNamePrefix: string }): ReapResult` after `prune()`.

**VcsAdapterCommon pattern** (lines 187-205): add `acquireWriteLock(workspace: string, opts?: { timeout?: number }): { release(): void };` after `fetch(opts?: FetchOpts): ExecResult;`.

---

### `sdk/src/vcs/backends/jj.ts` lines 791-840 (PRIMARY EDIT TARGET — fill workspace stubs)

**Analog:** existing verbs in the same file. The stubs at 792-800 and 836-840 throw `VcsNotImplementedError`; Phase 4 replaces each body.

**Imports pattern** (lines 22-55) — extend with:
```typescript
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fireHook } from '../hook-bridge.js';
```

**`workspace.add` body pattern — mirror `bookmarks.create` (lines 594-601) + git-side `workspace.add` (git.ts:453-465):**

`bookmarks.create` (jj.ts:594-601) is the exec/error shape to copy:
```typescript
create: (name: string, rev: RevisionExpr, opts?: { raw?: boolean }): void => {
  const actualName = addPrefix(name, opts?.raw);
  const args = jjArgv('bookmark', 'create', actualName, '-r', toJjRev(rev));
  const r = vcsExec(cwd, 'jj', args);
  if (r.exitCode !== 0) {
    throw new Error(`refs.bookmarks.create failed: ${r.stderr || r.stdout}`);
  }
},
```

`git.ts:453-465` is the return-shape parity (fetch entry from list after add):
```typescript
add: (input: WorkspaceAdd): WorkspaceInfo => {
  const baseRevArg = input.baseRef ? [toGitRev(input.baseRef)] : [];
  const r = execGit(cwd, ['worktree', 'add', input.path, ...baseRevArg]);
  if (r.exitCode !== 0) {
    throw new Error(`workspace.add failed: ${r.stderr || r.stdout}`);
  }
  const head = execGit(input.path, ['rev-parse', 'HEAD']);
  return {
    path: input.path,
    rev: head.exitCode === 0 ? head.stdout : '',
    locked: false,
  };
},
```

Phase 4 jj-side combine: `mkdirSync(dirname(input.path), { recursive: true })` first (D-17 / Pitfall 4 in RESEARCH), then `jjArgv('workspace', 'add', input.path, '-r', toJjRev(input.baseRef))` (+ `--name` if `input.name` is provided). Append the `--` separator before `input.path` if the path could ever be user-influenced (security threat row in RESEARCH).

**`workspace.forget` body** — mirror `bookmarks.delete` (jj.ts:610-617):
```typescript
delete: (name: string, opts?: { raw?: boolean }): void => {
  const actualName = addPrefix(name, opts?.raw);
  const args = jjArgv('bookmark', 'delete', actualName);
  const r = vcsExec(cwd, 'jj', args);
  if (r.exitCode !== 0) {
    throw new Error(`refs.bookmarks.delete failed: ${r.stderr || r.stdout}`);
  }
},
```

Phase 4: `args = jjArgv('workspace', 'forget', name)` — name is resolved via `workspace.list()` (because jj forgets by name, not path). **Pitfall 3 (RESEARCH):** do NOT `rm -rf` the on-disk dir from `forget()`; that's `reap()`'s responsibility.

**`workspace.list` body — already correct (lines 813-818); no Phase 4 change.** This is the template for any new read-path NDJSON verb.

**`workspace.prune` body** — git.ts:511 is `execGit(cwd, ['worktree', 'prune'])`. jj has no `jj workspace prune` command. Either route to `reap()` or throw `VcsNotImplementedError` with a pointer to `reap`. Planner picks; recommend keep as no-op `{ exitCode: 0, stdout: '', stderr: '', timedOut: false, error: null }` returning the standard `ExecResult` shape.

---

### `sdk/src/vcs/backends/jj.ts` line ~207 (commit() hook-fire wire-in)

**Analog:** the existing `commit()` body at lines 141-236, specifically the bookmark-advance block at 211-228 that already handles a post-squash optional step with `mergedStderr` accumulation.

**Bookmark-advance pattern** (lines 211-228) is the closest analog for "post-squash side effect that may fail without overturning the squash":
```typescript
if (input.bookmark !== undefined || input.bookmarkRaw !== undefined) {
  const bmName = input.bookmarkRaw !== undefined
    ? input.bookmarkRaw
    : addPrefix(input.bookmark!);
  const advArgs = jjArgv('bookmark', 'set', bmName, '-r', '@-', '--allow-backwards');
  const advRes = vcsExec(cwd, 'jj', advArgs);
  if (advRes.exitCode !== 0) {
    return {
      exitCode: squashRes.exitCode,
      stdout: squashRes.stdout,
      stderr: `${mergedStderr}\n[bookmark advance failed]: ${advRes.stderr || advRes.stdout}`,
      hash,
    };
  }
}
```

Phase 4 hook fire (insert AFTER squash success at ~207, BEFORE the bookmark advance at 211 — RESEARCH HOOK-02 row pins this ordering):
```typescript
if (!input.noVerify) {
  const isColocated = existsSync(join(cwd, '.git')) && existsSync(join(cwd, '.jj'));
  if (!isColocated) {
    const hookRes = fireHook(cwd, 'pre-commit', { stagedFiles: input.files });
    if (hookRes.exitCode !== 0) {
      mergedStderr = `${mergedStderr}\n[pre-commit hook failed]: ${hookRes.stderr || hookRes.stdout}`;
      // Mirror T-03.04-03 mitigation pattern from bookmark-advance: squash
      // already succeeded; failure goes to stderr, exitCode stays squashRes's.
    }
  }
}
```

**Imports needed at top of file:** `fireHook` from `'../hook-bridge.js'`, `existsSync` from `'node:fs'`, `join` from `'node:path'`. The `fireHook` symbol is currently module-private inside `hook-bridge.ts` (line 19 says `function fireHook(...)` with NO `export`); Phase 4 must add `export` to that declaration. JSDoc at hook-bridge.ts:17 ("Phase 4 (HOOK-01..05) will wire internal invocations") confirms this is the planned activation moment.

---

### `sdk/src/vcs/backends/jj.ts` `push()` lines 500-548 (pre-push hook wire-in)

**Analog:** the existing `push()` body, which already routes through `jjArgv` and `vcsExec`. Phase 4 inserts a hook fire BEFORE the `vcsExec` call.

**Push pattern** (lines 524-548) — insert pre-push fire before the final `return vcsExec(...)`:
```typescript
const push = (opts: PushOpts = {}): ExecResult => {
  const args: string[] = ['git', 'push'];
  if (opts.remote) args.push('--remote', opts.remote);
  if (opts.ref) { /* ... bookmark gate, lines 527-544 ... */ }
  return vcsExec(cwd, 'jj', jjArgv(...args));
};
```

Phase 4 insertion (right before `return vcsExec`):
```typescript
if (!opts.noVerify) {
  const hookRes = fireHook(cwd, 'pre-push', {});
  if (hookRes.exitCode !== 0) {
    return {
      exitCode: hookRes.exitCode,
      stdout: hookRes.stdout,
      stderr: `[pre-push hook failed]: ${hookRes.stderr || hookRes.stdout}`,
      timedOut: false,
      error: null,
    };
  }
}
```
Sidecar option per CONTEXT D-08 / Claude's Discretion: delegate enumeration of would-push bookmarks to `sdk/src/vcs/jj/pre-push.ts` (see analog below) before `fireHook` fires, so the `acarapetis/jj-pre-push` semantic ("only fire when there are bookmarks to push") is preserved.

---

### `sdk/src/vcs/backends/git.ts` mirror (lines 99-186 commit, 560-569 push, 451-512 workspace)

**Analog:** git backend's own `commit()` already passes `--no-verify` through (line 164 — `if (input.noVerify) args.push('--no-verify');`). Phase 4 adds symmetric `acquireWriteLock` no-op and `workspace.reap()` mapped to existing `git worktree` cleanup loop.

**Push pattern** (git.ts:560-569) — already has `noVerify` wired:
```typescript
const push = (opts: PushOpts = {}): ExecResult => {
  const args = ['push'];
  if (opts.force) args.push('--force');
  if (opts.noVerify) args.push('--no-verify');
  if (opts.remote) args.push(opts.remote);
  if (opts.ref) args.push(toGitRev(opts.ref));
  return execGit(cwd, args);
};
```
No Phase 4 change to push body. The `--no-verify` already suppresses git's own pre-push fire; `fireHook` is NOT explicitly invoked on git side (git's own hooks fire natively via `git push`).

**Workspace.reap on git side** — `git worktree remove` loop. Use `snapshotWorktreeInventory` (worktree-safety.cjs:253) for enumeration and `executeWorktreePrunePlan` (worktree-safety.cjs:154-217) as the closest "plan + execute" analog.

**`acquireWriteLock` git no-op pattern** (synthesise — kernel-enforces via `.git/index.lock`):
```typescript
acquireWriteLock: (_workspace: string, _opts?: { timeout?: number }): { release(): void } => {
  return { release: () => {} };
},
```

---

### `sdk/src/vcs/backends.ts` lines 41-112 (per-verb allowlist flip)

**Analog:** existing `BACKENDS_AVAILABLE_FOR_VERB` map. Phase 4 mechanical edits:

```typescript
// Phase 3 (current):
'workspace.add':    Object.freeze(['git'] as const),
'workspace.forget': Object.freeze(['git'] as const),
'workspace.prune':  Object.freeze(['git'] as const),

// Phase 4 (after each verb body lands):
'workspace.add':    Object.freeze(['git', 'jj-colocated', 'jj-native'] as const),
'workspace.forget': Object.freeze(['git', 'jj-colocated', 'jj-native'] as const),
'workspace.prune':  Object.freeze(['git', 'jj-colocated', 'jj-native'] as const),
'workspace.reap':   Object.freeze(['git', 'jj-colocated', 'jj-native'] as const),  // NEW
'acquireWriteLock': Object.freeze(['git', 'jj-colocated', 'jj-native'] as const),  // NEW
```

Also: `BACKENDS_AVAILABLE` at lines 18-21 must add `'jj-native'` once the native lane lands (it currently lists only `'git', 'jj-colocated'`).

---

### `sdk/src/vcs/hook-bridge.ts` (visibility flip — JSDoc only otherwise)

**Analog:** own body lines 1-42. **The only Phase 4 source change is `function fireHook(...)` → `export function fireHook(...)` at line 19.** The JSDoc at lines 17-18 ("Phase 4 (HOOK-01..05) will wire internal invocations from commit() / push()") becomes live wiring; the comment itself can be updated to past tense.

No body change. The Phase 1 D-05 / WR-04 Windows-shebang handling at lines 31-40 is preserved verbatim.

---

### `sdk/src/vcs/expr.ts` (refname validator lift — D-24 cr-01 fold-in)

**Analog:** own `validateBookmarkName` at lines 38-61 — already exhaustive and is the validator to lift into a shared module callable from `refs.bookmarks.{create,move,delete,exists}` write paths on BOTH backends when `opts.raw === true`.

**Current shape (keep verbatim):**
```typescript
const REFNAME_FORBIDDEN_BYTE_OR_SET = /[\x00-\x1f\x7f ~^:?*[\\]/;
function validateBookmarkName(name: string): void {
  if (!name) throw new Error(`expr.bookmark: empty name`);
  if (REFNAME_FORBIDDEN_BYTE_OR_SET.test(name)) {
    throw new Error(`expr.bookmark: invalid name '${name}' (forbidden byte or character)`);
  }
  if (name.startsWith('-')) {
    throw new Error(`expr.bookmark: invalid name '${name}' (leading '-')`);
  }
  // ... lines 46-60 ...
}
```

Phase 4 D-24 fold-in: rename to `validateRefname` (or export `validateBookmarkName` as-is, renaming optional). Threaded through `bookmarks.create/move/delete/exists` on BOTH backends when `opts.raw === true`. Insert `--` end-of-options separator before the name positional in argv (git: `['branch', '--', name]` form; jj: `['bookmark', 'create', '--', name, '-r', ...]` — verify with `jj bookmark --help` whether `--` end-of-options is honoured before the subcommand verb).

**Defense-in-depth:** apply validator on non-raw paths too (the `gsd/` prefix is incidental protection, not contract).

---

### `sdk/src/vcs/jj/lock.ts` (NEW — D-19 RAII flock)

**Closest analog:** `hook-bridge.ts` (the sidecar pattern: a single-purpose utility file colocated with the backend). Use Node `fs.openSync` with `O_EXCL`:

```typescript
// Pattern source: hook-bridge.ts structure + Node-stdlib idiom
import { openSync, closeSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface LockHandle { release(): void; }

export function acquireJjWriteLock(
  workspacePath: string,
  opts?: { timeout?: number }
): LockHandle {
  // Pitfall 6 (RESEARCH): do NOT lock .jj/working_copy/checkout directly;
  // sidecar at .jj/working_copy/gsd-lock.
  const sentinel = join(workspacePath, '.jj', 'working_copy', 'gsd-lock');
  mkdirSync(join(workspacePath, '.jj', 'working_copy'), { recursive: true });
  const deadline = Date.now() + (opts?.timeout ?? 30_000);
  let fd: number | null = null;
  while (Date.now() < deadline) {
    try {
      fd = openSync(sentinel, 'wx');
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      // tight poll with small sleep — orchestrator-side timeout caps total wait
    }
  }
  if (fd === null) throw new Error(`acquireWriteLock timed out: ${sentinel}`);
  return {
    release: () => {
      closeSync(fd!);
      if (existsSync(sentinel)) unlinkSync(sentinel);
    },
  };
}
```

D-21 stale-WC handling: after the lock is acquired, run `jj workspace update-stale` via `vcsExec(workspacePath, 'jj', jjArgv('workspace', 'update-stale'))` if `vcs.workspace.list()` reports the workspace as stale. **Beware Pitfall 9 (RESEARCH):** the `list()` probe must run with `-R <main_repo_root>` to avoid re-snapshot recursion.

---

### `sdk/src/vcs/jj/reap.ts` (NEW — workspace.reap impl)

**Closest analog:** `get-shit-done/bin/lib/worktree-safety.cjs:154-217` — `executeWorktreePrunePlan` is the closest "plan, then execute" batch op.

**Pattern from worktree-safety.cjs** (planWorktreePrune line 125, executeWorktreePrunePlan line 154, snapshotWorktreeInventory line 253) — Phase 4 jj-side mirrors the three-function split:
1. **Inventory:** `vcs.workspace.list()` filtered by `^phase-{N}-subagent-` prefix (D-04 inclusion-filter pattern per #2774).
2. **Plan:** for each tracked entry, run the empty-tree probe (`jj diff --from <parent> --to <head> -s` from MAIN workspace per D-15 / RESEARCH §"Empty-tree probe"). Build a plan: `{abandon: [...], incomplete: [...]}`.
3. **Execute:** for each `abandon` entry: `jj abandon <head>` → `jj workspace forget <name>` → `rm -rf <path>` (Pitfall 3). For each `incomplete` entry: `jj squash -B @ -k -m 'subagent N: incomplete work'` → append to `incomplete-work.md` → leave dir intact.

**Empty-tree probe (corrected per RESEARCH Pitfall 2 — `-r` + `--from` mutually exclusive on jj 0.41):**
```typescript
// Source: synthesised; CONTEXT D-12 sketch CORRECTED
function isEmptyHead(repoRoot: string, parentChange: string, headChange: string): boolean {
  const args = jjArgv('diff', '--from', parentChange, '--to', headChange, '-s');
  const r = vcsExec(repoRoot, 'jj', args); // MUST run from main, NOT subagent ws
  if (r.exitCode !== 0) throw new VcsExecError(/* ... */);
  return r.stdout.trim().length === 0;
}
```

**Crash squash invocation pattern** — mirror existing `commit()` squash at jj.ts:171:
```typescript
// Existing pattern (jj.ts:171):
const squashArgs = jjArgv('squash', '-B', '@', '-k', '-m', input.message);

// Phase 4 crash-squash (targeted at the crashed head; planner picks exact targeting flags):
const squashArgs = jjArgv('squash', '-r', headChange, '-k', '-m', `subagent ${idx}: incomplete work`);
```

---

### `sdk/src/vcs/jj/octopus.ts` (NEW, optional — orchestrator-side lazy fan-out helper)

**Closest analog:** `bookmarks.create` (jj.ts:594-601) composed with `commit()` (jj.ts:141-236). The helper coordinates three existing primitives:
1. `jj new -A <parent> -B <merge> -m 'subagent N' --no-edit` (RESEARCH WS-06: `-A` + `-B` combine for octopus)
2. `vcs.workspace.add({path, baseRef: <head>, name: 'phase-{N}-subagent-{idx}'})` — the new Phase 4 add body
3. `vcs.refs.bookmarks.create('phase-{N}', <merge_change>, {raw: false})` — existing bookmark-create body

**Multi-rev `jj new` invocation pattern** (synthesised from RESEARCH §"WS-06"):
```typescript
const args = jjArgv('new', '-A', toJjRev(parent), '-B', toJjRev(merge), '-m', `subagent ${idx}`, '--no-edit');
const r = vcsExec(cwd, 'jj', args);
if (r.exitCode !== 0) throw new Error(`octopus.createSubagentHead failed: ${r.stderr || r.stdout}`);
// Resolve the new change_id via `jj log -r @+ -T change_id` or similar (planner picks).
```

---

### `sdk/src/vcs/jj/incomplete-work.ts` (NEW — crash queue file)

**Closest analog (parse):** `parseJjWorkspaceList` (sdk/src/vcs/parse/jj-workspace-list.ts:31-51) — line-delimited parse with malformed-line typed error:
```typescript
export function parseJjWorkspaceList(raw: string): WorkspaceInfo[] {
  if (!raw) return [];
  const lines = raw.split('\n').filter(Boolean);
  const entries: WorkspaceInfo[] = [];
  for (const line of lines) {
    let record: RawJjWorkspaceListRecord;
    try {
      record = JSON.parse(line) as RawJjWorkspaceListRecord;
    } catch {
      throw new Error(`parseJjWorkspaceList: malformed NDJSON line ...`);
    }
    entries.push({ /* ... */ });
  }
  return entries;
}
```

**Closest analog (append):** any markdown append pattern in `.planning/state.ts` or `sdk/src/query/state-mutation.ts`. Plain `fs.appendFileSync(path, entry + '\n')` is sufficient. Per D-13, entries take form `- {subagentName}: head={change_id_short}, workspace={path}, reason={crash_reason}`. Per D-06, change_ids only (NO commit_ids — Phase 4 D-19 format-migration tracker entry).

**Append-and-read pattern:**
```typescript
import { readFileSync, appendFileSync, existsSync } from 'node:fs';

export function appendIncomplete(phaseDir: string, entry: IncompleteWorkEntry): void {
  const path = `${phaseDir}/incomplete-work.md`;
  appendFileSync(path, `- ${entry.subagentName}: head=${entry.changeIdShort}, workspace=${entry.workspacePath}, reason=${entry.reason}\n`);
}

export function readIncomplete(phaseDir: string): IncompleteWorkEntry[] {
  const path = `${phaseDir}/incomplete-work.md`;
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, 'utf-8');
  // Parse `- name: head=<id>, workspace=<path>, reason=<msg>` lines (mirror parseJjWorkspaceList typed-error shape).
  // ...
}
```

---

### `sdk/src/vcs/jj/pre-push.ts` (NEW — inline acarapetis/jj-pre-push replication)

**Closest analog:** `bookmarks.list()` (jj.ts:578-593) for enumeration, `fireHook` invocation for the actual hook fire.

**Bookmark enumeration pattern (jj.ts:578-593):**
```typescript
list: (): Bookmark[] => {
  const args = jjArgv('bookmark', 'list', '-T', 'json(self) ++ "\\n"');
  const r = vcsExec(cwd, 'jj', args);
  if (r.exitCode !== 0) {
    throw new VcsExecError(`refs.bookmarks.list failed: ${r.stderr || r.stdout}`, { /* ... */ });
  }
  const lines = r.stdout.split('\n').filter(Boolean);
  return lines.map((line) => parseJjBookmarkRecord(line, stripPrefix));
},
```

Phase 4 inline replication (≈30 LOC per RESEARCH Pitfall 7 + Don't-Hand-Roll row):
```typescript
export function firePrePushHook(cwd: string, remote: string | undefined): ExecResult {
  // 1. Enumerate would-push bookmarks: bookmarks with a tracked remote that
  //    are locally-ahead. Use `jj bookmark list -T 'json(self) ++ "\n"'`
  //    (already lifted into bookmarks.list shape above) and filter to those
  //    where target.commit_id !== remote_targets[remote].commit_id.
  // 2. If 0 bookmarks to push: return success without firing.
  // 3. Else: fireHook(cwd, 'pre-push', { stagedFiles: [...] }).
  // 4. Return hook's ExecResult — caller (jj.ts push()) bails on non-zero.
}
```

---

### `sdk/src/query/hooks.ts` (NEW — SDK query bridge per D-08)

**Closest analog:** existing `sdk/src/query/commit.ts` and `sdk/src/query/workspace.ts`. Phase 4 follows the same SDK-query shape so `gsd-sdk query hooks.fire <stage>` resolves through the existing dispatcher.

Action: read `sdk/src/query/commit.ts` for the canonical query handler shape (it'll have `export async function commit(...)` + a registration entry in `command-manifest.ts`). The bridge calls the now-exported `fireHook(cwd, stage, ctx)` from `sdk/src/vcs/hook-bridge.ts`.

**Open Question 2 (RESEARCH):** accept `--cwd` flag with default to `process.cwd()`. Default behaviour mirrors existing `git hook run pre-commit` at `execute-phase.md:689` (workflow markdown rewrite is Phase 5's PROMPT-*; Phase 4 just ships the query so Phase 5 has a target to swap onto).

---

### `sdk/src/vcs/__tests__/jj-workspace.test.ts` (MOD — fill real assertions)

**Analog:** own body lines 1-129. The current file has stub assertions plus `Phase 3 — workspace.add/forget/prune still NotImpl` at line 106. Phase 4 deletes the NotImpl block (lines 106-129) and replaces with real multi-workspace tests.

**Fixture-init pattern (lines 40-54)** — extend for multi-workspace:
```typescript
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'gsd-vcs-ws-list-'));
  execSync('jj git init --colocate', { cwd: dir, stdio: 'pipe' });
  execSync('jj config set --repo user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
  execSync('jj config set --repo user.name "Test"', { cwd: dir, stdio: 'pipe' });
  writeFileSync(join(dir, 'seed.txt'), 'seed\n');
  execSync('jj squash -B @ -k -m "seed"', { cwd: dir, stdio: 'pipe' });
  vcs = createJjAdapter(dir);
});
```

Phase 4 multi-workspace extension (planner's discretion per CONTEXT — recommend `vcsMultiWsTest(kind, n)` factory in `tests/helpers.cjs`): after `seed.txt` is committed, call `vcs.workspace.add({ path: join(dir, '.claude/jj-workspaces/phase-04-subagent-1'), baseRef: expr.head(), name: 'phase-04-subagent-1' })` × N before each describe block.

---

### `tests/helpers.cjs` lines 223-307 (vcsTest extension)

**Analog:** existing `vcsTest(kindOrKinds, suiteFn)` at line 223. Phase 4 adds (planner's discretion per CONTEXT):

```javascript
// New factory beside vcsTest — vcsMultiWsTest(kind, n, suiteFn).
function vcsMultiWsTest(kind, n, suiteFn) {
  // Reuse vcsTest's per-describe tmp repo + snapshot/restore (lines 250-298).
  // Inside the `before`, after initJjRepo / initGitRepo, loop n times to call
  // vcs.workspace.add({ path: ..., name: `phase-04-subagent-${idx}` }).
  // The handle exposed to suiteFn gains a getWorkspaces(): string[] method.
}
```

The existing single-workspace `vcsTest` body at 249-306 is the verbatim pattern to wrap.

**`initJjRepo` for jj-native (currently throws at line 272):**
```javascript
// Phase 4: add a jj-native branch to the `else` (line 271).
} else if (kind === 'jj-native') {
  sharedDir = createTempDir('gsd-vcs-cjs-jj-native-');
  ex('jj git init --no-git', { cwd: sharedDir, stdio: 'pipe' }); // OR `jj init` — verify with `jj git init --help` on 0.41
  ex('jj config set --repo user.email "test@test.com"', { cwd: sharedDir, stdio: 'pipe' });
  ex('jj config set --repo user.name "Test"', { cwd: sharedDir, stdio: 'pipe' });
  sharedAdapter = vcsLib.createVcsAdapter(sharedDir, { kind: 'jj' });
} else {
  throw new Error("backend '" + kind + "' not yet implemented...");
}
```

Parallel addition in `vcs-fixture.ts` (lines 87-94) — TS-side mirrors the same dispatch (`else if (kind === 'jj-native') { sharedDir = initJjNativeRepo(); /* ... */ }`).

---

### `sdk/src/vcs/__tests__/baseline-parity.test.ts` lines 1-562 (workspace verb baselines)

**Analog:** existing baseline rows for `workspace.prune` (line 166 — `const r = vcs.workspace.prune();`). Phase 4 adds matching rows for `workspace.add`, `workspace.forget`, `workspace.list`, `workspace.reap`, `acquireWriteLock`. Each verb gets a baseline `.snap.json` file under `tests/baselines/jj-vcs/` (Phase 3 D-19 layout) for jj-colocated AND jj-native axes.

**Baseline-row pattern** (line 160-176):
```typescript
if (args[0] === 'worktree' && /* match prune call */) {
  // Plan 02-04 Task 2: vcs.workspace.prune() runs `git worktree prune`
  const r = vcs.workspace.prune();
  expect(r).toEqual({
    exitCode: baseline.expected.exitCode,
    stdout: baseline.expected.stdout,
    stderr: baseline.expected.stderr,
    timedOut: baseline.expected.timedOut,
    // ...
  });
}
```
Phase 4 adds `workspace.add`, `workspace.forget`, `workspace.reap`, `acquireWriteLock` rows with the same `r === baseline.expected` shape.

---

### `.github/workflows/test.yml` lines 56-90 (CI matrix axis)

**Analog:** existing matrix at lines 72-79:
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
        backend: git
```

Phase 4 edit per D-22 / RESEARCH "CI matrix axis addition":
```yaml
backend: [git, jj-colocated, jj-native]   # added 'jj-native'
continue-on-error: ${{ matrix.backend == 'jj-colocated' || matrix.backend == 'jj-native' }}
```

Lines 129-138 (install jj step): `if: matrix.backend == 'jj-colocated'` → `if: matrix.backend == 'jj-colocated' || matrix.backend == 'jj-native'` (both lanes need the binary; the lane difference is fixture init, not install).

---

## Shared Patterns

### Mandatory jj flags via `jjArgv()`

**Source:** `sdk/src/vcs/backends/jj.ts:68-76`
**Apply to:** every new jj invocation in jj.ts, jj/lock.ts, jj/reap.ts, jj/octopus.ts, jj/pre-push.ts
```typescript
const jjArgv = (...subcommand: string[]): string[] => [
  '--repository', cwd, '--no-pager', '--color', 'never', '--quiet',
  ...subcommand,
];
```
NO `--ignore-working-copy` (D-05 + RESEARCH "Don't add `--ignore-working-copy`" anti-pattern row).

### vcsExec error shape

**Source:** `sdk/src/vcs/exec.ts` — `VcsExecError` + `{ exitCode, stdout, stderr, timedOut, error }`
**Apply to:** every adapter shell-out in jj.ts and the new sidecars. Mirror the `bookmarks.list` error-throw shape (jj.ts:582-590):
```typescript
if (r.exitCode !== 0) {
  throw new VcsExecError(`<verb> failed: ${r.stderr || r.stdout}`, {
    exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr,
    timedOut: r.timedOut, args,
  });
}
```

### Hook-fire with `noVerify` opt-out

**Source:** `sdk/src/vcs/types.ts:169-178` (`PushOpts.noVerify`); `sdk/src/vcs/backends/git.ts:164` (`if (input.noVerify) args.push('--no-verify');`)
**Apply to:** jj.ts `commit()` post-squash (HOOK-02 — line ~207), jj.ts `push()` pre-`jj git push` (line ~547).
**Pattern (jj-side, mirror bookmark-advance stderr-merge shape from jj.ts:211-228):**
```typescript
if (!input.noVerify) {
  const isColocated = existsSync(join(cwd, '.git')) && existsSync(join(cwd, '.jj'));
  if (!isColocated) {  // D-10 colocated detection
    const hookRes = fireHook(cwd, 'pre-commit', { stagedFiles: input.files });
    if (hookRes.exitCode !== 0) {
      mergedStderr = `${mergedStderr}\n[pre-commit hook failed]: ${hookRes.stderr || hookRes.stdout}`;
    }
  }
}
```

### Argv injection defense

**Source:** `sdk/src/vcs/expr.ts:24-61` (`validateBookmarkName`); `git.ts:139` (`-- ` separator before paths)
**Apply to:** every Phase 4 verb that accepts a user-influenced string (workspace path, bookmark name when `opts.raw`). Insert `--` end-of-options separator immediately before the user-controlled positional. Run refname validator BEFORE the argv build.

### NDJSON parse for jj list-like commands

**Source:** `sdk/src/vcs/parse/jj-workspace-list.ts:31-51`, `sdk/src/vcs/backends/jj.ts:813-818`
**Apply to:** any new list/enumerate verb in jj/pre-push.ts, jj/reap.ts (workspace enumeration). Template form: `-T 'json(self) ++ "\\n"'`. NOT `--no-graph` for `jj workspace list` (Pitfall 5 in RESEARCH).

### Per-verb allowlist flip on body landing

**Source:** `sdk/src/vcs/backends.ts:41-112`
**Apply to:** each new/filled verb body (workspace.{add,forget,prune,reap}, acquireWriteLock). Flip `['git']` → `['git', 'jj-colocated', 'jj-native']` only AFTER the contract test passes on the target backend. Per-plan grain so a flaky verb doesn't gate the whole flip.

### Sidecar under `sdk/src/vcs/jj/` for upstream-rebase zero-conflict surface

**Source:** Phase 2.1 D-15 / UPSTREAM-02 convention referenced in CONTEXT canonical_refs (lines 126-127). The pattern is "any net-new file that's not in upstream goes under `sdk/src/vcs/jj/`".
**Apply to:** lock.ts, reap.ts, octopus.ts, incomplete-work.ts, pre-push.ts. The shape commit on types.ts is unavoidably in shared territory (no jj-only sidecar for type extensions).

---

## No Analog Found

None. Every Phase 4 file has at least a role-match analog. The "newest" surface is `acquireWriteLock`'s RAII handle pattern, which has no direct in-repo precedent — but the closest substrate is `hook-bridge.ts`'s single-purpose-utility sidecar shape combined with Node-stdlib `fs.openSync(O_EXCL)` (well-documented in the wider Node ecosystem; flagged as RESEARCH A2 assumption requiring empirical confirmation against concurrent acquires).

---

## Metadata

**Analog search scope:**
- `sdk/src/vcs/**` (backends, parsers, expr, hook-bridge, types, query bridges, tests)
- `tests/helpers.cjs` + `tests/baselines/`
- `get-shit-done/bin/lib/worktree-safety.cjs`
- `.github/workflows/test.yml`
- `sdk/src/query/*` (for SDK query bridge analog)

**Files scanned:** 17 (full reads) + grep-only on ≈40 more (sdk/src/query/* directory listing).

**Key cross-file invariants Phase 4 inherits:**
- JJ-02: argv-array only via `jjArgv()`
- JJ-03 / D-05: no `--ignore-working-copy`
- D-03/D-04: bookmark `gsd/` prefix discipline (apply only on Phase-4 phase-bookmark writes — orchestrator helpers)
- D-15: hooks fire AFTER squash success, BEFORE bookmark advance (in `commit()`)
- TEST-06: throw-not-skip — per-verb allowlist is the gate

**Pattern extraction date:** 2026-05-13
