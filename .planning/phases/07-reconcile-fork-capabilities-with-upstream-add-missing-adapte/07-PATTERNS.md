# Phase 7: Reconcile fork capabilities with upstream — Pattern Map

**Mapped:** 2026-05-14
**Files analyzed:** 12 (8 SDK / executor / contract + 2 workflow .md + 2 script-tier)
**Analogs found:** 12 / 12 (every file has a strong existing analog inside the same module)

CONTEXT.md and RESEARCH.md already cite analogs for several verbs. This file extends those citations with verbatim excerpts and pins per-file pattern assignments for the planner.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `sdk/src/vcs/types.ts` | type-contract | (no flow — declarations) | `sdk/src/vcs/types.ts` (self — extend in place) | exact (same file extended Phase 1→2.1→3→4→5) |
| `sdk/src/vcs/backends/git.ts` (7 verbs) | backend impl | request-response (argv → ExecResult → typed return) | self — `bookmarks.delete` git.ts:388-398, `status` git.ts:268-308, `diff` git.ts:311-345, `workspace.{add,forget,list}` git.ts:498-557 | exact |
| `sdk/src/vcs/backends/jj.ts` (7 verbs) | backend impl | request-response via `vcsExec(cwd,'jj',jjArgv(...))` | self — `bookmarks.delete` jj.ts:708-717, `currentBookmarks` jj.ts:750-803, `diff` jj.ts:441-462, `workspace.{add,forget,list}` jj.ts:897-959, `findConflicts` jj.ts:549-572 | exact |
| `sdk/src/vcs/__tests__/jj-refs.test.ts` (extend) | test | request-response + fixture | self — divergent-bookmark suite jj-refs.test.ts:39-87 (parser-level) + describe.skipIf-jjAvailable live suite (rest of file) | exact |
| `sdk/src/vcs/__tests__/jj-workspace.test.ts` (extend) | test | request-response | self — `describe.sequential.skipIf(!jjAvailable)` jj-workspace.test.ts:39-89 | exact |
| `sdk/src/vcs/__tests__/jj-status-log-diff.test.ts` (extend) | test | request-response | self — `describe.skipIf(!jjAvailable)` + snapshot/restore pattern jj-status-log-diff.test.ts:31-55 | exact |
| `tests/vcs-adapter-contract.test.cjs` (extend) | contract test | cross-backend parameterized | self — `vcsTest('auto', …)` + `verbReady(verb)` allowlist gate vcs-adapter-contract.test.cjs:21-88 | exact |
| `get-shit-done/bin/lib/worktree-safety.cjs` (rewrite executor body) | executor | event-driven (manifest → per-entry orchestration → result envelope) | self — `executeWorktreePrunePlan` style (deps-injection convention) at this same file; current stub at lines 382-411 codifies the 7 verb shape inline | exact |
| `get-shit-done/workflows/execute-phase.md` (delete else body) | workflow shell glue | shell pipeline | self — the file's own `if command -v gsd-sdk` block (lines 774-784) is the boundary | exact |
| `get-shit-done/workflows/quick.md` (delete else body) | workflow shell glue | shell pipeline | self — mirror at lines 787-796 | exact |
| `scripts/changeset/github-release-notes.cjs` (migrate runGit) | utility | batch transform (range → fragments → markdown) | adapter analog: `vcs.refs.exists` git.ts:460-466 + `vcs.diff({rev, nameOnly, paths})` git.ts:311-345; jj parallel: `vcs.diff` jj.ts:441-462 | role-match (existing fn, new shape) |
| `scripts/lint-vcs-no-raw-git.cjs` (drop allowlist entry) | config | (declarative removal) | self — `vcs-lint:allow-git-here` annotation (already inline at github-release-notes.cjs:37) is the only handle | exact |

## Pattern Assignments

### `sdk/src/vcs/types.ts` (type-contract)

**Analog:** the same file, two existing extension precedents:
- `DiffOpts` interface lines 135-142 (extended in Plan 02-03 with `nameStatus`).
- `VcsBookmarks.delete` line 294 (current shape with `{ raw? }`).
- `WorkspaceAdd` lines 165-173 (Phase 4 D-04 added `name?: string`).

**Pattern — verb-signature extension (forward-complete adapter, Phase 1 D-04):**

Existing shape pattern at lines 135-142 (extend `DiffOpts` in place):
```typescript
export interface DiffOpts {
  staged?: boolean;
  nameOnly?: boolean;
  rev?: RevisionExpr;
  paths?: string[];
  // Plan 02-03 Task 2 gap-fill: emit `git diff --name-status` semantics when true.
  nameStatus?: boolean;
}
```

Existing pattern for `currentBookmarks: string[]` (Phase 2.1 D-15) at lines 274 — Plan 1 mirrors this shape for `currentBookmarksIn(cwd: string): string[]`:
```typescript
currentBookmarks(): string[];
```

Existing pattern for `bookmarks.delete` at line 294 — Plan 1 extends `opts` with `force?: boolean`:
```typescript
delete(name: string, opts?: { raw?: boolean }): void;
```

**Copy:** Add comment headers in the same Phase-N D-NN style ("Phase 7 D-04: …"). Extend in place — never invent new shapes.

---

### `sdk/src/vcs/backends/git.ts` (7 git impls)

**Analog (per verb):**

**(a) `refs.bookmarks.delete(name, { force })` — extend** — analog at git.ts:388-398:
```typescript
delete: (name: string, _opts?: { raw?: boolean }): void => {
  // D-24 cr-01 fold-in: see bookmarks.create above for rationale. The
  // `-D` flag is positional-flag-shaped; `--` separator after it pins
  // actualName at the name positional regardless of name shape.
  const actualName = name;
  validateRefname(actualName);
  const r = execGit(cwd, ['branch', '-D', '--', actualName]);
  if (r.exitCode !== 0) {
    throw new Error(`bookmarks.delete failed: ${r.stderr || r.stdout}`);
  }
},
```
The current body unconditionally uses `-D`. Plan 1 toggles `-d` vs `-D` on `opts?.force` to mirror upstream's `branch -d` (safe) / `branch -D` (force) split.

**(b) `refs.currentBookmarksIn(cwd: string): string[]` — new** — analog at git.ts:429-435:
```typescript
const currentBookmarks = (): string[] => {
  const r = execGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (r.exitCode !== 0) return [];
  const name = r.stdout.trim();
  if (!name || name === 'HEAD') return []; // detached
  return [name];
};
```
Plan 1 wires the `cwd` parameter as the first arg to `execGit(targetCwd, [...])`. The argv pattern is `-C <wt>` per RESEARCH (or simply pass `targetCwd` as `execGit`'s first arg — it already accepts a per-call cwd).

**(c) `refs.mergeBase(a, b): string` — new** — analog: there is no existing `merge-base` call. Use the same shape as `resolveShort` (git.ts:437-443):
```typescript
const resolveShort = (rev: RevisionExpr): string => {
  const r = execGit(cwd, ['rev-parse', '--short', toGitRev(rev)]);
  if (r.exitCode !== 0) {
    throw new Error(`refs.resolveShort failed: ${r.stderr || r.stdout}`);
  }
  return r.stdout.trim();
};
```
Plan 1 swaps the argv to `['merge-base', toGitRev(a), toGitRev(b)]` and returns the trimmed commit hash (D-05: git returns commit hash, jj returns change_id).

**(d) `diff({ diffFilter })` — extend** — analog at git.ts:311-345 (full body excerpted above in the upstream reads). Plan 1 inserts after the `nameStatus` arg push:
```typescript
if (opts.diffFilter) {
  const letter = ({ added:'A', modified:'M', deleted:'D', renamed:'R', typechange:'T' } as const)[opts.diffFilter];
  args.push(`--diff-filter=${letter}`);
}
```

**(e) `status({ cwd })` — extend** — analog at git.ts:268-308 (full status body). The git side already uses `cwd` as the closure-captured first arg to `spawnSync` / `execGit`; Plan 1 changes `cwd` from closure-captured to per-call override: `const targetCwd = opts.cwd ?? cwd;` and routes `spawnSync('git', gitArgs, { cwd: targetCwd, … })`. **Note:** the `-z` two-call shape at lines 283-284 already uses `statusTrimEnd` — Plan 1 threads `targetCwd` into both calls.

**(f) `workspace.merge({ branch, message, ff: false })` — new** — analog: git has no current `workspace.merge` verb; the closest analog is the existing `gitOnly.merge` at git.ts:380 (declared in types.ts:384) which is a generic `merge(opts)` ExecResult shape. Plan 1's `workspace.merge` is cross-backend and mirrors upstream: `git merge --no-ff -m '<msg>' <branch>` then `git branch -D <agentBookmark>`. Argv shape pattern from git.ts:374:
```typescript
const r = execGit(cwd, ['branch', '--', actualName, toGitRev(rev)]);
if (r.exitCode !== 0) {
  throw new Error(`bookmarks.create failed: ${r.stderr || r.stdout}`);
}
```
Plan 1 wraps two `execGit` calls and returns the typed `WorkspaceMergeResult` shape declared in types.ts.

**(g) `workspace.remove(path, { force })` — new** — analog at git.ts:512-517:
```typescript
forget: (path: string): void => {
  const r = execGit(cwd, ['worktree', 'remove', path]);
  if (r.exitCode !== 0) {
    throw new Error(`workspace.forget failed: ${r.stderr || r.stdout}`);
  }
},
```
Plan 1's `workspace.remove` mirrors but appends `--force` when `opts?.force === true`: `['worktree', 'remove', '--force', path]`.

---

### `sdk/src/vcs/backends/jj.ts` (7 jj impls)

**(a) `refs.bookmarks.delete(name, { force })` — extend** — analog at jj.ts:708-717:
```typescript
delete: (name: string, opts?: { raw?: boolean }): void => {
  const actualName = addPrefix(name, opts?.raw);
  // D-24 cr-01 fold-in: see bookmarks.create above for rationale.
  validateRefname(actualName);
  const args = jjArgv('bookmark', 'delete', '--', actualName);
  const r = vcsExec(cwd, 'jj', args);
  if (r.exitCode !== 0) {
    throw new Error(`refs.bookmarks.delete failed: ${r.stderr || r.stdout}`);
  }
},
```
D-09: jj's `bookmark delete` already removes regardless of state, so `force` is a documented no-op on jj. Plan 1 widens the opts type only; the body is unchanged. Pitfall 5 (RESEARCH) — document divergent-bookmark non-equivalence in JSDoc.

**(b) `refs.currentBookmarksIn(cwd: string): string[]` — new** — analog at jj.ts:750-803 (full `currentBookmarks` body excerpted in upstream reads). The key tail is the divergent-bookmark `??` guard plus `*` strip + refname regex gate. Plan 1 copies the body verbatim; the only change is signature: accept `targetCwd: string` and pass it to `vcsExec(targetCwd, 'jj', args)`. The mandatory-flag prefix `jjArgv(...)` still uses the adapter's construction-time cwd in `--repository <cwd>` per JJ-02 — but the WC-snapshot path of jj 0.41 reads the workspace from the spawned process's actual cwd, which is the new `targetCwd`. **Verify in contract test that this matches `cwd`-passed semantics on the git side.**

**(c) `refs.mergeBase(a, b): string` — new** — analog: NDJSON template pattern from `currentBookmarks` (jj.ts:755-764) + the `fork_point` revset directly from RESEARCH §"Pattern 2":
```typescript
mergeBase: (a: RevisionExpr, b: RevisionExpr): string => {
  // fork_point(x) is the jj revset for the common ancestor(s) of x.
  // Equivalent to heads(::x_1 & ::x_2 & ...). Returns change_id per D-05.
  const aJj = toJjRev(a);
  const bJj = toJjRev(b);
  const args = jjArgv(
    'log',
    '-r', `fork_point(${aJj} | ${bJj})`,
    '-T', 'change_id ++ "\\n"',
    '--no-graph',
    '-n', '1',
  );
  const r = vcsExec(cwd, 'jj', args);
  if (r.exitCode !== 0) {
    throw new VcsExecError(`refs.mergeBase failed: ${r.stderr || r.stdout}`, { exitCode: r.exitCode });
  }
  const first = r.stdout.split('\n').map(s => s.trim()).find(Boolean);
  if (!first) throw new Error('refs.mergeBase: empty fork_point result');
  return first;
}
```
Verb pattern matches the existing `resolveShort`/`countCommits` argv shape (jj.ts:805-833).

**(d) `diff({ diffFilter })` — extend** — analog at jj.ts:441-462 (full body in upstream reads), plus `parseDiffSummary` at jj.ts:415-424 — DO NOT reinvent the parser. Plan 1 wires `if (opts.diffFilter)` to force `--summary` (jj.ts:444 already enables this on `nameStatus`) and post-filters the result:
```typescript
// jj.ts — post-filter on --summary output (RESEARCH §Pattern 5)
if (opts.diffFilter) {
  args.push('--summary'); // force; same arg path as nameStatus
}
// ... after parseDiffSummary:
if (opts.diffFilter && result.nameStatus) {
  const letter = ({ added:'A', modified:'M', deleted:'D', renamed:'R', typechange:'T' } as const)[opts.diffFilter];
  const filtered = result.nameStatus.filter(e => e.status === letter);
  result.nameOnly = filtered.map(e => e.path);
  result.nameStatus = filtered;
}
```

**(e) `status({ cwd })` — extend** — analog at jj.ts:401-408 (full body):
```typescript
const status = (opts: StatusOpts = {}): StatusResult => {
  const r = vcsExec(cwd, 'jj', jjArgv('status'));
  if (r.exitCode !== 0) return { entries: [], raw: r.stderr || r.stdout };
  if (opts.porcelain === false) {
    return { entries: [], raw: r.stdout };
  }
  return { entries: parseJjStatus(r.stdout), raw: r.stdout };
};
```
Plan 1 introduces `const targetCwd = opts.cwd ?? cwd;` and changes the `vcsExec` call to `vcsExec(targetCwd, 'jj', jjArgv('status'))`. The `jjArgv` mandatory `--repository <cwd>` prefix uses the *adapter's construction cwd* (closure-captured `cwd`) — this matches D-07's "defaults to the adapter's construction cwd if omitted" only when `opts.cwd` is unset. **Decision point for planner:** when `opts.cwd` IS set, does `--repository` switch too, or stay pinned to the adapter root? RESEARCH D-07 implies the call switches workspace context — pass `targetCwd` into both positions.

**(f) `workspace.merge` — new** — analog: combine `acquireJjWriteLock` (jj.ts:1011-1030 + jj/lock.ts:80) with the existing `findConflicts({scope:'working-copy'})` (jj.ts:549-572) for the conflict-return path. RESEARCH §"Pattern 3" gives the canonical body (cite verbatim — already in RESEARCH.md lines 236-273). Key existing-pattern excerpts to copy from:

Lock acquisition style (jj.ts:1022-1030):
```typescript
const acquireWriteLock = (
  workspace: string,
  opts?: { timeout?: number },
): { release(): void } => {
  return acquireJjWriteLock(workspace, {
    timeout: opts?.timeout,
    mainRepoRoot: cwd,
  });
};
```

Bookmark-delete argv-injection guard from jj.ts:712:
```typescript
const args = jjArgv('bookmark', 'delete', '--', actualName);
```

SQUASH-06 conflict-return is the existing semantic precedent: `findConflicts({scope:'working-copy'})` is the in-tree-conflict probe used by Phase 3 `commit()`.

**(g) `workspace.remove` — new** — analog: combine `workspace.forget` (jj.ts:926-942) with `rmSync` — RESEARCH §"Pattern 4" gives the canonical body (lines 280-294 of RESEARCH). The existing `forget` body to mirror (with on-disk path resolution from jj.ts:996-999 reap pattern):
```typescript
forget: (workspaceNameOrPath: string): void => {
  // jj workspace forget takes the workspace NAME (not path). Resolve path → name
  // via list() when the caller hands us a path.
  const entries = workspace.list();
  const matchByName = entries.find((e) => e.path === workspaceNameOrPath);
  const name = matchByName?.path ?? basename(workspaceNameOrPath);
  // Security (T-04.01-02 mitigate): `--` separator before user-influenced positional.
  const args = jjArgv('workspace', 'forget', '--', name);
  const r = vcsExec(cwd, 'jj', args);
  if (r.exitCode !== 0) {
    throw new Error(`workspace.forget failed: ${r.stderr || r.stdout}`);
  }
  // PITFALL 3 (RESEARCH): forget does NOT remove the on-disk dir.
},
```
Reap on-disk path resolution (jj.ts:993-1000):
```typescript
const tracked = allEntries
  .filter((e) => e.path.startsWith(opts.phaseNamePrefix))
  .map((e) => ({
    name: e.path,
    headChange: e.rev,
    path: join(cwd, '.claude/jj-workspaces', e.path),
  }));
```
Plan 1's `workspace.remove`: forget → resolve on-disk path via that `join(cwd, '.claude/jj-workspaces', name)` convention → `rmSync(path, { recursive: true, force: true })`. **Pitfall 4 (RESEARCH): forget MUST run before rmSync.**

---

### `sdk/src/vcs/__tests__/jj-refs.test.ts` (extend)

**Analog:** the file itself. Two skeletons to mirror:

**Skeleton A — parser-level always-runs test** (lines 39-87): wraps `parseJjBookmarkRecord` against a fixture. Plan 1 uses this for D-05's no-op divergent semantics if applicable.

**Skeleton B — `describe.skipIf(!jjAvailable)` live suite** (rest of file): boilerplate
```typescript
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'gsd-vcs-…-'));
  execSync('jj git init --colocate', { cwd: dir, stdio: 'pipe' });
  execSync('jj config set --repo user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
  execSync('jj config set --repo user.name "Test"', { cwd: dir, stdio: 'pipe' });
  vcs = createJjAdapter(dir);
  snapshotHandle = (vcs as any)[__vcsTestOnly].snapshot();
});
beforeEach(() => { (vcs as any)[__vcsTestOnly].restore(snapshotHandle); });
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });
```
Plan 1 adds new `describe.skipIf(!jjAvailable)('Phase 7 — currentBookmarksIn / mergeBase / bookmarks.delete({force})', …)` blocks following this exact skeleton.

---

### `sdk/src/vcs/__tests__/jj-workspace.test.ts` (extend)

**Analog:** the file itself, lines 39-89 — `describe.sequential.skipIf(!jjAvailable)` (note: SEQUENTIAL is required when multiple `it()` blocks mutate global per-repo workspace state; Plan 5 plan 05-05 Pattern A). Plan 1's new `workspace.merge` / `workspace.remove` tests use `describe.sequential.skipIf(!jjAvailable)`.

**Random-prefix mkdtemp (Phase 5 Pattern B, lines 47-51):**
```typescript
dir = mkdtempSync(
  join(
    tmpdir(),
    `gsd-vcs-ws-list-${Math.random().toString(36).slice(2, 10)}-`,
  ),
);
```
Plan 1 uses the same random-prefix idiom for new `workspace.merge` / `workspace.remove` test directories.

---

### `sdk/src/vcs/__tests__/jj-status-log-diff.test.ts` (extend)

**Analog:** lines 31-55 — snapshot/restore pattern:
```typescript
describe.skipIf(!jjAvailable)('Phase 3 plan 03-05 — jj log/status/diff', () => {
  let dir: string;
  let vcs: ReturnType<typeof createJjAdapter>;
  let snapshotHandle: any;
  beforeAll(() => { /* init + snapshot */ });
  afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });
  beforeEach(() => { (vcs as any)[__vcsTestOnly].restore(snapshotHandle); });
```
Plan 1 adds `describe` blocks for `diff({ diffFilter })` and `status({ cwd })` following this skeleton. The per-test mutation pattern is jj.ts-typical:
```typescript
writeFileSync(join(dir, 'log-a.txt'), 'a\n');
vcs.commit({ files: ['log-a.txt'], message: 'add a' });
```

---

### `tests/vcs-adapter-contract.test.cjs` (extend)

**Analog:** the file itself, lines 21-88. The `verbReady` allowlist gate plus `vcsTest('auto', …)` parameterized harness:

```javascript
vcsTest('auto', ({ getVcs, getCwd, getKind }) => {
  function verbReady(verb) {
    const lane = (helpers.BACKENDS_AVAILABLE_FOR_VERB && helpers.BACKENDS_AVAILABLE_FOR_VERB[verb]) || [];
    return lane.includes(getKind());
  }
  test('vcs.commit({files,message}) produces a hash', () => {
    if (!verbReady('commit')) return;
    const vcs = getVcs();
    const cwd = getCwd();
    fs.writeFileSync(path.join(cwd, 'a.txt'), 'a');
    const r = vcs.commit({ files: ['a.txt'], message: 'add a' });
    assert.equal(r.exitCode, 0);
    assert.match(r.hash, /^[0-9a-f]+$/);
  });
```
Plan 1 adds 7 new test blocks — one per new verb — and registers each verb name in `helpers.BACKENDS_AVAILABLE_FOR_VERB` so both backends run live.

---

### `get-shit-done/bin/lib/worktree-safety.cjs` (executor rewrite — Plan 2)

**Analog:** the file's existing executor convention. Current stub at lines 382-411 (read in full above) documents the 7-verb shape inline as a comment block — it is itself the spec. The body to replace is lines 402-411:
```javascript
function executeWorktreeWaveCleanupPlan(plan, _deps = {}) {
  const entries = Array.isArray(plan?.entries) ? plan.entries : [];
  return {
    ok: false,
    action: plan ? plan.action : 'skip',
    reason: 'not_implemented_in_jj_port',
    entries: [],
    pending: entries,
  };
}
```
**Result envelope to preserve** — `cmdWorktreeCleanupWave` (lines 413-451) reads `result.ok` / `result.action` / `result.entries` / `result.pending` from the return; the new body must keep these keys. Caller composes:
```javascript
const response = {
  ok: result.ok,
  plan: { action, discovery, reason, entries: plan.entries.length },
  result,
};
process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
if (!result.ok) { process.exitCode = 1; }
```

**Replacement body shape** — RESEARCH §"Wave-cleanup executor body shape" (RESEARCH.md lines 437-491) gives the canonical 60-LOC body. Copy that verbatim; key invariants:
- `_deps.vcs ?? createVcsAdapter(plan.repoRoot, {})` — backend auto-detect via existing seam.
- per-entry try/catch wraps each member; failures push to `pending` with `reason`.
- D-03: `vcs.workspace.merge({ …, agentBookmark: entry.branch })` does the atomic main-advance + agent-delete.
- Verb #7 (`bookmarks.delete({force})`) is NOT called in the happy path — D-03 already deletes inside `merge`.

---

### `get-shit-done/workflows/execute-phase.md` (hard-delete else body — Plan 3)

**Analog:** the file itself, lines 774-784 (the `if` block with the `gsd-sdk` call) vs. the `else` body following (~lines 785-891). RESEARCH Pitfall 8 (lines 397-402) pins the delete boundary:
> Delete the entire `if`/`else`/`fi` block down to the closing `fi` — the bare `gsd-sdk query worktree.cleanup-wave --manifest "$X" || exit 1` line replaces the entire conditional.

**The kept body shrinks to a single shell line** (replacing 117+ deletions):
```bash
gsd-sdk query worktree.cleanup-wave --manifest "$WAVE_WORKTREE_MANIFEST" || exit 1
```
Net diff: ~1 line replaces ~117 deletions. **Important:** the TODO(jj-port) comment block at lines 785-792 goes with the else body. Confirm balanced `if`/`fi` count after edit.

---

### `get-shit-done/workflows/quick.md` (hard-delete else body — Plan 3)

**Analog:** mirror of execute-phase.md. Lines 787-796 hold the same `if command -v gsd-sdk` block. Same single-line replacement; same TODO(jj-port) comment block discarded.

**Multi-runtime sync:** RESEARCH §"Multi-runtime workflow files" + Assumption A5 confirm no per-runtime workflow .md siblings exist on disk. PROMPT-03's install.js transform pipeline regenerates Codex/Gemini/OpenCode variants at install time — no extra files for Plan 3 to touch.

---

### `scripts/changeset/github-release-notes.cjs` (Plan 4 migration)

**Analog:** no existing in-tree caller has migrated a CommonJS dev script to the cross-backend adapter yet — Plan 4 is the first. The migration target is the `runGit` helper at lines 32-42 and its three call sites: `validateGitRef` (line 56), `changedFragmentPaths` (line 63), `readFileAtRef` (line 71).

**Adapter analogs to wire (cross-backend):**

For `rev-parse --verify <ref>^{commit}` (line 56) — use `vcs.refs.exists` (git.ts:460-466):
```typescript
const refExists = (rev: RevisionExpr): boolean => {
  const r = execGit(cwd, ['cat-file', '-t', toGitRev(rev)]);
  return r.exitCode === 0;
};
```

For `diff --name-only <from>..<to> -- .changeset` (line 63) — use `vcs.diff({ rev: expr.range(...), nameOnly: true, paths: ['.changeset'] })` — body shape from git.ts:311-345 (already excerpted above). The `expr.range` factory takes two `expr.rev(...)` arguments.

For `show <ref>:<file>` (line 71) — **Pitfall 7 (RESEARCH)**: no existing adapter verb. Two paths:
- (a) Add `vcs.refs.readBlob(ref, path)` as a proactive 8th verb — folds into Plan 1 verb-batch.
- (b) Workaround: walk via existing `vcs.diff` + a checkout-and-read pattern.
Per CONTEXT D-16, an 8th verb spawns `Phase 7.1 INSERTED`. Plan 4 design accommodates whichever way Plan 1 went.

**JSDoc note already present at lines 33-36** (precedent for "jj-port dev-only" framing):
```javascript
// jj-port: dev-only changeset tooling for cutting upstream releases. The
// fork does not publish releases, so this never runs during workflow
// execution. Migrate to createVcsAdapter().refs.exists / .diff when/if
// the fork starts producing its own release notes.
```
Plan 4 removes this stale comment because the migration lands.

---

### `scripts/lint-vcs-no-raw-git.cjs` (Plan 4 allowlist drop)

**Analog:** the allowlist mechanism is the inline `vcs-lint:allow-git-here <reason>` annotation pattern (per lint-vcs-no-raw-git.cjs lines 11-14, 47-48). The github-release-notes.cjs allowlist entry exists at the call site itself (github-release-notes.cjs:37):
```javascript
return cp.execFileSync('git', args, { // vcs-lint:allow-git-here dev-only changeset tooling — never runs in fork workflow
```
**Plan 4 deletion is mechanical:** removing the `cp.execFileSync('git', ...)` call (replaced by adapter calls) also removes the inline annotation — no separate allowlist file edit. **Verify:** there is no JSON allowlist file at `scripts/lint-vcs-no-raw-git.allow.json` containing a `github-release-notes.cjs` entry (CONTEXT D-17 says "drop the `vcs-lint:allow-git-here` exception entry from `scripts/lint-vcs-no-raw-git.cjs`'s allowlist" — but per source read, the allowlist is inline-annotation only, not a JSON file). Planner confirms with `grep -rn "github-release-notes" scripts/`.

## Shared Patterns

### Argv-array invocation (JJ-02, V5 ASVS)
**Source:** every adapter verb in `sdk/src/vcs/backends/{git,jj}.ts`.
**Apply to:** all 7 new verb bodies on both backends.

git side (git.ts:374):
```typescript
const r = execGit(cwd, ['branch', '--', actualName, toGitRev(rev)]);
```
jj side (jj.ts:712):
```typescript
const args = jjArgv('bookmark', 'delete', '--', actualName);
const r = vcsExec(cwd, 'jj', args);
```
**Rules:**
- No shell-string concatenation, ever.
- `--` end-of-options separator before any user-influenced positional (refname, path).
- `validateRefname(actualName)` BEFORE the argv lands at a `git branch` / `jj bookmark` positional.

### Exec error surface
**Source:** every verb body returns or throws based on `r.exitCode`.
**Apply to:** all 7 new verb bodies.

Throw on hard error (write verbs):
```typescript
if (r.exitCode !== 0) {
  throw new Error(`bookmarks.delete failed: ${r.stderr || r.stdout}`);
}
```
Return empty / [] on soft error (read verbs):
```typescript
if (r.exitCode !== 0) return [];
```
Special case (verbs that return structured result with `ok`/`stderr` — `workspace.merge`):
```typescript
if (newRes.exitCode !== 0) {
  return { ok: false, conflicted: false, changeId: null, stderr: newRes.stderr };
}
```

### Jj mandatory-flag prefix (JJ-02)
**Source:** `jjArgv(...)` helper inside `createJjAdapter` (jj.ts:73-100 region) and the UPSTREAM-02 sidecar mirror in `jj/octopus.ts:45-47` / `jj/reap.ts` / `jj/lock.ts`.
**Apply to:** every jj-side new verb body.

The helper prepends `--repository <cwd> --no-pager --color never --quiet` and (per JJ-03 / D-05) NEVER `--ignore-working-copy`.

### Jj write lock (Phase 4 / D-03 / Pitfall 3)
**Source:** `acquireJjWriteLock(cwd, { mainRepoRoot: cwd })` (jj.ts:1022-1030 / jj/lock.ts:80-112).
**Apply to:** `workspace.merge` on jj backend ONLY (write coverage for atomic main-advance + agent-delete).

```typescript
const lockHandle = acquireJjWriteLock(cwd, { mainRepoRoot: cwd });
try { /* … merge body … */ } finally { lockHandle.release(); }
```
RESEARCH Pitfall 3 — pass adapter's own `cwd` as `mainRepoRoot`, not any subagent workspace path.

### Contract test gating
**Source:** `BACKENDS_AVAILABLE_FOR_VERB` lookup in `tests/helpers.cjs` (referenced by vcs-adapter-contract.test.cjs:24-27).
**Apply to:** new verb tests in tests/vcs-adapter-contract.test.cjs and per-domain `__tests__/jj-*.test.ts` files.

Register the 7 new verbs in `helpers.BACKENDS_AVAILABLE_FOR_VERB` so D-12 throw-not-skip applies until both backends have green.

### `describe.sequential.skipIf(!jjAvailable)` for live jj tests
**Source:** jj-workspace.test.ts:39-89 (Phase 5 plan 05-05 Pattern A).
**Apply to:** every new jj-live test block that mutates per-repo global state (`workspace.merge`, `workspace.remove`).

Random-prefix mkdtemp (Pattern B) per call site:
```typescript
mkdtempSync(join(tmpdir(), `gsd-vcs-…-${Math.random().toString(36).slice(2, 10)}-`));
```

### Workflow .md hard-delete
**Source:** RESEARCH Pitfall 8.
**Apply to:** execute-phase.md and quick.md.

Delete the entire `if command -v gsd-sdk … else … fi` block; replace with the bare `gsd-sdk query worktree.cleanup-wave --manifest "$X" || exit 1` line. Confirm balanced `if`/`fi` count after edit.

## No Analog Found

None. Every Phase 7 file has a strong existing analog inside the same module — this phase is the textbook "extend an established pattern" shape.

The only borderline case is `workspace.merge` (no prior `merge` verb on the cross-backend surface), but `acquireJjWriteLock` + `findConflicts({scope:'working-copy'})` + the bookmark-delete argv shape compose into the body — every primitive exists.

`vcs.refs.readBlob(ref, path)` (Pitfall 7 from RESEARCH) is a *possible* 8th verb with no existing analog; CONTEXT D-16 explicitly defers via the Phase 7.1 INSERTED escape hatch. Planner decides whether to fold proactively into Plan 1 or accept the escape.

## Metadata

**Analog search scope:**
- `sdk/src/vcs/` (types, backends, __tests__, jj sidecar dir, parse helpers)
- `get-shit-done/bin/lib/worktree-safety.cjs`
- `get-shit-done/workflows/{execute-phase,quick}.md`
- `scripts/{changeset/github-release-notes,lint-vcs-no-raw-git}.cjs`
- `tests/vcs-adapter-contract.test.cjs` and parameterized harness in `tests/helpers.cjs`

**Files scanned:** 12 primary + 6 secondary (jj/lock.ts, jj/octopus.ts, jj/reap.ts, expr.ts, exec.ts, parse/jj-rev.ts).

**Strong analogs identified:** 12/12.

**Pattern extraction date:** 2026-05-14

**Confidence:** HIGH — every excerpt is verbatim from a file the researcher already read in full per RESEARCH §Sources; line ranges confirmed by direct Read calls during mapping.
