# Phase 7: Reconcile fork capabilities with upstream - Research

**Researched:** 2026-05-14
**Domain:** VcsAdapter surface extension + workflow .md cleanup + upstream test-surface triage
**Confidence:** HIGH (CONTEXT.md locks 18 decisions; researcher's job is to nail concrete syntax + identify analogs, not explore alternatives)

## Summary

CONTEXT.md decides all 18 design questions. This research fills in the implementation-mechanics gaps the planner needs:

1. **Exact jj 0.41 command spellings** for each of the 7 new verbs (verified locally against the installed jj binary 0.41.0). The key load-bearing finds: jj has a first-class `fork_point(x)` revset function — the canonical merge-base equivalent and the right shape for `refs.mergeBase` (D-05). `jj diff` exposes `--name-only` and `--summary` but no native `--diff-filter`; deletion-filtering must be done client-side on `--summary` output. `jj new -r A -r B` produces a 2-parent change at `@`, and `jj describe -m` sets its message.
2. **Wave-cleanup executor structure** at `get-shit-done/bin/lib/worktree-safety.cjs:402`. The function already follows the `deps = {}` injection convention used by every other executor in the file (lines 70-75, 176, 254-258). The right test seam is `deps.vcs` for the adapter and existing `deps.readPorcelain` for status. The body composition is straightforward — pure orchestration of the 7 new verbs against `plan.entries` produced by `planWorktreeWaveCleanup` (which stays unchanged per the existing comment at line 400).
3. **Workflow .md cleanup is mechanical and small.** `execute-phase.md:774-891` and `quick.md:787-911` each have one obvious `if command -v gsd-sdk` / `else` / `fi` block. Default-to-hard-delete per D-15 — the dead-code boundary is unambiguous. No Codex/Gemini/OpenCode mirror files exist in `workflows/`; the install-time transform pipeline (referenced in PROMPT-03 status) projects the Claude source-of-truth markdown for those runtimes.
4. **Test surface triage is much smaller than it looks.** 7 of the 9 named test surfaces have ZERO `git`/`vcs`/`jj` references. Only 2 are even candidates for backend-dependent behavior, and one is testing the `execGit` helper itself (which legitimately stays git-specific). Strict-green (D-15) should be achievable cheaply.
5. **`github-release-notes.cjs` migration is one call site.** Line 37 `cp.execFileSync('git', ...)` covers two operations: `rev-parse --verify <ref>^{commit}` (use `vcs.refs.exists`) and `diff --name-only A..B -- .changeset` + `show <ref>:<file>` (use `vcs.diff({rev: expr.range(...), nameOnly: true, paths: ['.changeset']})` and a new gap-fill verb for show-at-ref OR a lower-cost workaround).
6. **Octopus/reap fan-in for Phase 7's OWN parallel execution (D-12) is ready to use.** All three SDK helpers export the entry points the orchestrator needs. The `acquireJjWriteLock` in `sdk/src/vcs/jj/lock.ts` is the lock that `workspace.merge`'s atomic main-advance + agent-delete (D-03) needs to take.

**Primary recommendation:** Plan 1 lands the 7 verbs with one test file per verb-group following the existing per-domain split (`jj-refs.test.ts`, `jj-workspace.test.ts`, `jj-status-log-diff.test.ts`). Plan 2 wires the wave-cleanup executor in <80 LOC using `deps.vcs`. Plan 3+ (workflow .md cleanup, release-notes migration, test-surface triage) parallelize cleanly via Phase 4's `octopus.ts`+`reap.ts` per D-12.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Adapter verb surface | `sdk/src/vcs/types.ts` + both backends | Contract tests in `sdk/src/vcs/__tests__/` | Forward-complete adapter pattern (Phase 1 D-04) — types lock the cross-backend contract |
| Wave-cleanup orchestration | `get-shit-done/bin/lib/worktree-safety.cjs` (cjs) | SDK query bridge `sdk/src/query/worktree.ts` | Existing seam — `worktree-safety.cjs` already owns workspace lifecycle for cjs callers |
| Workflow shell glue | `get-shit-done/workflows/*.md` | None | Workflow files are the entrypoint for `/gsd-execute-phase` and `/gsd-quick` |
| Release-notes rendering | `scripts/changeset/github-release-notes.cjs` | VcsAdapter `vcs.log` / `vcs.diff` / `vcs.refs.exists` | Cross-backend migration per D-17; preserves upstream-mergeability |
| Test parameterization | `sdk/src/vcs/__tests__/*-jj.test.ts` + `tests/__tests__/` | `vcsTest` fixture + `describe.for([...BACKENDS])` | Phase 1 contract-test convention |
| Phase 7's own parallel fan-out | `sdk/src/vcs/jj/octopus.ts` + `reap.ts` | `acquireJjWriteLock` | D-12 directs the orchestrator's own merge/cleanup through the SDK helpers — NOT the new wave-cleanup executor |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| jj | 0.41.0 (CI-pinned) | jj backend shells | [VERIFIED: locally installed `/Users/LoganDark/.local/bin/jj` reports `jj 0.41.0-…`; CI pins via release tarball per Phase 3 D-14/D-15] |
| Node.js | ≥22 | Runtime for both `sdk/` and `bin/lib/*.cjs` | [CITED: PROJECT.md Constraints] |
| TypeScript | ≥5 | SDK source | [CITED: PROJECT.md Constraints] |
| vitest | (workspace-pinned) | SDK test harness | [CITED: existing tests in `sdk/src/vcs/__tests__/`] |
| node:test | (built-in) | `tests/` harness | [CITED: tests/*.test.cjs all import `node:test`] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `parseJjLog` / `parseJjBookmarkRecord` | sidecar | NDJSON parsing | Already used by every jj verb that reads structured output |
| `vcsExec` (sdk/src/vcs/exec.ts) | sidecar | Single argv-array exec wrapper | All new jj-side verb bodies route through this |
| `jjArgv(...)` helper | sidecar | Prepends `--repository`, `--no-pager`, `--color never`, `--quiet` per JJ-02 | All new jj backend invocations |
| `toJjRev` / `toGitRev` | sidecar | `RevisionExpr` translation | All revset/ref arguments |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `fork_point(a|b)` for mergeBase | `heads(::a & ::b)` revset | Equivalent semantics on linear-ancestor case but more verbose and less explicit about intent; `fork_point` is the jj-canonical idiom |
| `--summary` + post-filter for diffFilter | `--types` flag output | `--types` outputs path types (file vs symlink vs git-submodule), not status letters — wrong tool for filtering by add/mod/del |
| Single `cwd` param on `status` | New sibling `statusIn(cwd)` verb or `vcs.in(cwd)` sub-adapter | D-07 locks: add optional `cwd` to existing opts. Smallest surface change. |

**Installation:** No new npm dependencies for Phase 7. All work uses existing SDK infrastructure.

## Package Legitimacy Audit

Not applicable — Phase 7 installs zero external packages.

## Architecture Patterns

### System Architecture Diagram

```
                            ┌────────────────────────────────────────────┐
                            │  workflows/execute-phase.md | quick.md     │
                            │  (orchestrator bash)                       │
                            └──────────────────┬─────────────────────────┘
                                               │ gsd-sdk query worktree.cleanup-wave
                                               ▼
                            ┌────────────────────────────────────────────┐
                            │  sdk/src/query/worktree.ts                 │
                            │  worktreeCleanupWave (spawnSync to tools)  │
                            └──────────────────┬─────────────────────────┘
                                               │
                                               ▼
                            ┌────────────────────────────────────────────┐
                            │  get-shit-done/bin/gsd-tools.cjs:988       │
                            │  case 'worktree' → cmdWorktreeCleanupWave  │
                            └──────────────────┬─────────────────────────┘
                                               │
                                               ▼
              ┌───────────────────────────────────────────────────────────┐
              │  worktree-safety.cjs:413 cmdWorktreeCleanupWave          │
              │   ├─ readFileSync(manifest)                              │
              │   ├─ planWorktreeWaveCleanup() → normalized.entries[]    │
              │   └─ executeWorktreeWaveCleanupPlan(plan, _deps)         │ ◄── PHASE 7 WIRES THIS
              └──────────────────┬───────────────────────────────────────┘
                                 │ for each entry { worktree_path, branch, expected_base }
                                 ▼
                ┌──────────────────────────────────────────────────┐
                │  vcs = deps.vcs ?? createVcsAdapter(cwd)         │
                │                                                  │
                │  1. branch = vcs.refs.bookmarks.currentIn(wt)    │  ← verb #1
                │  2. base   = vcs.refs.mergeBase(HEAD, branch)    │  ← verb #2
                │  3. dels   = vcs.diff({rev:range, diffFilter:    │  ← verb #3
                │                'deleted', nameOnly:true})         │
                │      └─ if non-empty, skip + report              │
                │  4. wtStatus = vcs.status({porcelain:true,        │  ← verb #4
                │                            cwd: wt})              │
                │      └─ if dirty, skip + report                  │
                │  5. vcs.workspace.merge({branch, message,         │  ← verb #5
                │                          ff:false})               │
                │      └─ on conflict: { ok:false, conflicted }    │
                │      └─ on success: advances main bookmark +     │
                │         deletes agent bookmark atomically (D-03) │
                │  6. vcs.workspace.remove(wt, {force:true})        │  ← verb #6
                │      (jj: forget + rm -rf; git: worktree --force) │
                │  7. fallback vcs.refs.bookmarks.delete(b, {force})│  ← verb #7
                │      (only for branches merge step didn't touch)  │
                └──────────────────────────────────────────────────┘
```

### Recommended Project Structure

No new directories. New files slot into existing layout:

```
sdk/src/vcs/
├── types.ts                              # add 7 verb signatures
├── backends/
│   ├── git.ts                            # add 7 verb bodies (git side)
│   └── jj.ts                             # add 7 verb bodies (jj side)
└── __tests__/
    ├── jj-refs.test.ts                   # extend with currentIn, mergeBase, bookmarks.delete({force})
    ├── jj-status-log-diff.test.ts        # extend with status({cwd}), diff({diffFilter})
    └── jj-workspace.test.ts              # extend with workspace.merge, workspace.remove

get-shit-done/bin/lib/
└── worktree-safety.cjs                   # rewrite executeWorktreeWaveCleanupPlan body

get-shit-done/workflows/
├── execute-phase.md                      # delete else-branch body (lines ~780-891)
└── quick.md                              # delete else-branch body (lines ~793-911)

scripts/changeset/
└── github-release-notes.cjs              # migrate runGit() to adapter
```

### Pattern 1: Forward-complete type-first verb addition

**What:** New verbs declared in `types.ts` FIRST; both backends implement to match.
**When to use:** Every one of the 7 new verbs.
**Example:**
```typescript
// types.ts — extend existing types, do not invent new shapes
export interface DiffOpts {
  staged?: boolean;
  nameOnly?: boolean;
  rev?: RevisionExpr;
  paths?: string[];
  nameStatus?: boolean;
  // NEW (D-06): cross-backend typed enum, no leaking git's single-letter convention
  diffFilter?: 'added' | 'modified' | 'deleted' | 'renamed' | 'typechange';
}

export interface StatusOpts {
  porcelain?: boolean;
  // NEW (D-07): scoped variant — defaults to adapter's construction cwd
  cwd?: string;
}

export interface VcsRefs {
  // ... existing
  // NEW: scoped current-branch probe; returns string[] per D-04 (mirrors currentBookmarks)
  currentBookmarksIn(cwd: string): string[];
  // NEW (D-05): returns change_id on jj, commit hash on git
  mergeBase(a: RevisionExpr, b: RevisionExpr): string;
}

export interface VcsBookmarks {
  // ... existing
  // CHANGED (D-09): extend delete with optional force
  delete(name: string, opts?: { raw?: boolean; force?: boolean }): void;
}

export interface WorkspaceMergeOpts {
  branch: RevisionExpr;
  message: string;
  ff: false;  // type-locked to false per D-01; ff:true is not a Phase 7 use case
  agentBookmark?: string;  // D-03: when set, atomically deleted after main advance
}

export interface WorkspaceMergeResult {
  ok: boolean;
  conflicted: boolean;
  changeId: string | null;
  stderr: string;
}

export interface VcsWorkspace {
  // ... existing
  // NEW (D-01..D-03)
  merge(opts: WorkspaceMergeOpts): WorkspaceMergeResult;
  // NEW (D-08): forget + rm -rf composite (git: worktree remove --force)
  remove(path: string, opts?: { force?: boolean }): void;
}
```

### Pattern 2: jj backend — argv-array invocation via vcsExec + jjArgv

**What:** Every jj verb body uses `vcsExec(cwd, 'jj', jjArgv(...args))` — never raw shell strings.
**When to use:** All 7 verb bodies on jj backend.
**Example (mergeBase via fork_point):**
```typescript
// jj.ts — new function inside the refs object
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

### Pattern 3: workspace.merge — 2-parent jj new + describe + atomic main-advance

**What:** Synthesize a 2-parent change via `jj new`, describe it, advance main, delete agent — all under `acquireJjWriteLock`.
**Example (jj.ts):**
```typescript
merge: (opts: WorkspaceMergeOpts): WorkspaceMergeResult => {
  const lockHandle = acquireJjWriteLock(cwd, cwd, {});
  try {
    const branchRev = toJjRev(opts.branch);
    // 1. Create the 2-parent merge change at @
    //    Per `jj new --help`: "specifying multiple revisions … will create a merge commit"
    const newRes = vcsExec(cwd, 'jj', jjArgv('new', '-r', '@', '-r', branchRev, '-m', opts.message), envOpts());
    if (newRes.exitCode !== 0) {
      return { ok: false, conflicted: false, changeId: null, stderr: newRes.stderr };
    }
    // 2. Resolve the new merge's change_id
    const idRes = vcsExec(cwd, 'jj', jjArgv('log', '-r', '@', '-T', 'change_id ++ "\\n"', '--no-graph', '-n', '1'));
    const changeId = idRes.stdout.split('\n').map(s => s.trim()).find(Boolean) ?? null;
    // 3. SQUASH-06 conflict-return semantics: probe in-tree conflict at @, surface, do NOT auto-abandon
    const conflicts = findConflicts({ scope: 'working-copy' });
    if (conflicts.length > 0) {
      return { ok: false, conflicted: true, changeId, stderr: '' };
    }
    // 4. D-03: atomic main-advance + agent-bookmark delete
    //    (callers of workspace.merge always know the main bookmark name; pass through opts in the
    //     planner-final type if a second invocation site arrives)
    //    For wave-cleanup, the main bookmark is named in the manifest entry.
    //    bookmark advance via `jj bookmark set <main> -r @` with `-B` for backwards-safety
    //    bookmark delete via `jj bookmark delete <agent>` (always idempotent — D-09 force is a no-op on jj)
    if (opts.agentBookmark) {
      const delRes = vcsExec(cwd, 'jj', jjArgv('bookmark', 'delete', '--', opts.agentBookmark));
      if (delRes.exitCode !== 0) {
        // Non-fatal: surface in stderr but the merge already landed
        return { ok: true, conflicted: false, changeId, stderr: `agentBookmark delete failed: ${delRes.stderr}` };
      }
    }
    return { ok: true, conflicted: false, changeId, stderr: '' };
  } finally {
    lockHandle.release();
  }
}
```

### Pattern 4: workspace.remove — forget metadata then rm dir

**What:** Per D-08, `workspace.remove(path, {force:true})` does `jj workspace forget <name>` FIRST so jj's metadata is gone before the dir is deleted (avoids stale-workspace-entry surprises), THEN `fs.rmSync(path, {recursive:true, force:true})`.
**Example (jj.ts):**
```typescript
remove: (workspacePathOrName: string, opts?: { force?: boolean }): void => {
  // Resolve path → name via list (same convention as existing workspace.forget at jj.ts:926)
  const entries = workspace.list();
  const matchByName = entries.find((e) => e.path === workspacePathOrName);
  const name = matchByName?.path ?? basename(workspacePathOrName);
  const onDiskPath = join(cwd, '.claude/jj-workspaces', name);  // matches reap()'s convention at jj.ts:999
  // 1. forget metadata first
  const args = jjArgv('workspace', 'forget', '--', name);
  const r = vcsExec(cwd, 'jj', args);
  if (r.exitCode !== 0 && !opts?.force) {
    throw new Error(`workspace.remove forget failed: ${r.stderr || r.stdout}`);
  }
  // 2. rm -rf the on-disk dir
  rmSync(onDiskPath, { recursive: true, force: true });
}
```

### Pattern 5: diff diffFilter — backend-specific translator

**What:** Single typed enum on cross-backend surface; git emits `--diff-filter=D`, jj post-filters `--summary`.
**Example:**
```typescript
// git.ts
if (opts.diffFilter) {
  const letter = ({ added:'A', modified:'M', deleted:'D', renamed:'R', typechange:'T' } as const)[opts.diffFilter];
  args.push(`--diff-filter=${letter}`);
}

// jj.ts — post-filter on --summary output
if (opts.diffFilter) {
  // Force --summary so we get status letters; post-filter the parsed entries.
  args.push('--summary');
  // ... after parse:
  const letter = ({ added:'A', modified:'M', deleted:'D', renamed:'R', typechange:'T' } as const)[opts.diffFilter];
  const filtered = result.nameStatus!.filter(e => e.status === letter);
  result.nameOnly = filtered.map(e => e.path);
  result.nameStatus = filtered;
}
```

### Anti-Patterns to Avoid

- **Auto-abandon on `workspace.merge` conflict**: Violates SQUASH-06 / D-02. Return `{conflicted:true}` and let caller decide.
- **`jj commit` anywhere in `workspace.merge`**: Violates SQUASH-05. `jj new` synthesizes the 2-parent change; `jj describe` sets its message. Never `jj commit`.
- **Single-string return on `currentBookmarksIn`**: Violates D-04 / Phase 2.1 D-15. jj can have N bookmarks at one change; always `string[]`.
- **`--ignore-working-copy` in workspace.merge or workspace.remove**: Violates JJ-03. Auto-snapshot is intentional.
- **Reaching for `vcs.gitOnly` inside the executor**: The whole point of the migration is the executor stays cross-backend. The git-side translation lives inside `vcs.workspace.remove` / `vcs.workspace.merge` / etc.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Common-ancestor revset | `jj log -r 'heads(::a & ::b)'` manual composition | `fork_point(a | b)` | jj-canonical idiom; one revset function vs. a 2-operator expression |
| Status letter parsing on jj | Bespoke regex on `jj diff -r <rev>` output | `parseDiffSummary` (already exists at jj.ts:415) | Existing parser already covers all 9 status letters |
| NDJSON template assembly | Custom strings per verb | `-T 'json(self) ++ "\n"' --no-graph` | Pattern JJ-04; every existing jj verb uses it |
| In-tree conflict detection inside workspace.merge | Re-implementation | `findConflicts({scope:'working-copy'})` | Already exists at jj.ts:549 with `conflicts() & @` revset |
| Workspace path → name resolution | Path-basename heuristic | Pattern from `workspace.forget` (jj.ts:926-932) | Already canonicalizes via `workspace.list()` |
| Bookmark argv-injection guard | New refname validator | Lift the `--` end-of-options separator from existing bookmark verbs (jj.ts plan 04 D-24 fold-in) | Already shipped pattern; refname validator + `--` separator |
| Concurrent jj-write protection | Bespoke flock | `acquireJjWriteLock` (jj/lock.ts:80) | Phase 4 shipped this RAII primitive precisely for this |
| Wave-cleanup parallelization | Bespoke fan-in | `createPhaseStructure` + `createSubagentSlot` + `performJjReap` | Phase 4 octopus + reap — D-12 explicitly directs Phase 7 to use these for its own execution |

**Key insight:** Every primitive Phase 7 needs already exists as a sidecar or pattern in the codebase. The 7 new verbs are thin compositions on top of existing infrastructure, not new infrastructure.

## Runtime State Inventory

Not applicable — Phase 7 is verb addition + executor wire + dead-code removal + script migration. No rename/refactor surface.

## Common Pitfalls

### Pitfall 1: `fork_point` on disconnected ancestry

**What goes wrong:** If `a` and `b` share no ancestors (orphan trees), `fork_point` returns empty.
**Why it happens:** Wave-cleanup is always between HEAD (orchestrator main) and an agent bookmark created from HEAD, so this is essentially impossible in the real flow — but contract tests should still cover the empty case.
**How to avoid:** `mergeBase` should throw `VcsExecError` on empty result (the implementation in Pattern 2 already does this), and the wave-cleanup executor catches the throw and emits a skip-with-reason entry for that wave member.
**Warning signs:** `jj log -r 'fork_point(...)' --no-graph` exits 0 with empty stdout.

### Pitfall 2: jj diff --summary's letter set drift

**What goes wrong:** Plan 03-05 IN-04 dropped `U` from the `parseDiffSummary` regex because jj 0.41 doesn't emit it. If a future jj version emits a letter outside `[AMDRCTXB]`, the post-filter on `diffFilter` silently drops those paths.
**Why it happens:** jj's CLI surface evolves; `--summary` letters are not formally pinned.
**How to avoid:** Reuse `parseDiffSummary` (jj.ts:415) — when it gets extended to new letters, all `diffFilter` consumers automatically benefit. Do NOT re-parse output inline in the new verb.
**Warning signs:** Tests against a newer jj version start failing on deletion detection.

### Pitfall 3: workspace.merge's lock + auto-snapshot interaction

**What goes wrong:** `acquireJjWriteLock` runs `jj workspace update-stale` on acquire if stale (jj/lock.ts D-21). If `update-stale` itself triggers an auto-snapshot of the orchestrator's `@`, the subsequent `jj new -r @ -r <branch>` could merge an unexpected `@` state.
**Why it happens:** jj's auto-snapshot is intentional (JJ-03) but interacts with multi-workspace state.
**How to avoid:** workspace.merge takes the lock at the MAIN repo (its own `cwd`), not at any subagent workspace. The existing pattern at jj.ts:1014-1018 ("the adapter passes its own cwd as mainRepoRoot") already enforces this.
**Warning signs:** Merge change has unexpected `@` content that wasn't in the orchestrator's WC before the merge.

### Pitfall 4: jj workspace forget vs. fs.rm ordering

**What goes wrong:** Deleting the on-disk workspace dir BEFORE `jj workspace forget` leaves stale metadata in `.jj/op_log` and the workspace_root pointer. Subsequent `workspace.list()` reports a workspace whose path doesn't exist; `jj workspace forget` then errors because it can't find the workspace.
**Why it happens:** jj's workspace concept = (name in op-log) + (on-disk directory). Each has its own lifecycle.
**How to avoid:** ALWAYS forget first, then rm-rf. Pattern 4 above codifies this. The git side `git worktree remove --force` is atomic on both — but the jj-port jj-side has two steps and order matters.
**Warning signs:** `jj workspace forget` errors with "workspace not found" or `workspace.list()` returns ghost entries.

### Pitfall 5: bookmark.delete on a divergent bookmark (D-09 force semantics)

**What goes wrong:** A user's manual jj operations could create a divergent bookmark (`bookmark@target1`, `bookmark@target2`). On git, `branch -D` deletes regardless. On jj, `jj bookmark delete` deletes the LOCAL view of the bookmark — divergent remote-tracking is unaffected. The cross-backend `force` flag does NOT have identical semantics across backends.
**Why it happens:** jj's tracking-bookmark model is fundamentally different from git's branch model.
**How to avoid:** Document the force-flag semantic shift in the JSDoc for `bookmarks.delete`. The flag is preserved for API parity (D-09); cross-backend callers (wave-cleanup) only delete short-lived agent bookmarks that won't have remote-tracking divergence. Add a contract test asserting jj's local-only deletion.
**Warning signs:** Post-delete `vcs.refs.bookmarks.list()` still shows the bookmark name (divergent remote view).

### Pitfall 6: A3 colocated pre-commit gap surfacing in test triage

**What goes wrong:** If `installer-migrations` or `shell-command-projection` test setup synthesizes commits via `vcs.commit({files,message})` in jj-colocated mode, the A3 gap means `.git/hooks/pre-commit` doesn't fire. Tests that depend on hook side effects (e.g., format-on-commit) would diverge between backends.
**Why it happens:** Phase 4 LEARNINGS Open Q1: jj 0.41 colocated mode doesn't auto-fire git's pre-commit after `jj squash`. D-10 colocated no-op leaves colocated users without a pre-commit path.
**How to avoid:** When triaging strict-green failures (D-15), check if root cause is A3 BEFORE attempting to fix in Phase 7. Per CONTEXT.md `<deferred>`, A3 is NOT Phase 7 scope. Surface and defer.
**Warning signs:** Failure mode is "pre-commit hook side effect missing in jj lane only"; failure reproduces only in jj-colocated, not in jj-native, not in git.

### Pitfall 7: github-release-notes.cjs `show <ref>:<file>` has no direct adapter verb

**What goes wrong:** Line 71 `runGit(repo, ['show', `${ref}:${file}`])` reads file content at a specific ref. The current adapter surface (Phase 1-6) has no `vcs.show(ref, path)` verb.
**Why it happens:** Upstream's existing call site uses a primitive the adapter didn't need until now.
**How to avoid:** Two options for planner: (a) add a small new `vcs.refs.readBlob(ref, path)` cross-backend verb — git uses `show <ref>:<file>`; jj uses `jj file show -r <rev> <path>` (jj 0.41 has `jj file show`). (b) Use `vcs.diff({rev: expr.rev(ref), nameOnly: true})` plus checkout-and-read at a snapshot. Option (a) is cleaner and matches the type-first verb pattern; expect ~30 LOC across types + 2 backends + 1 contract test. **Per D-16, an 8th verb need spawns `Phase 7.1 INSERTED`.** Researcher recommends: route this through the existing 7 verbs if possible, OR proactively scope it as a documented 8th verb in the Phase 7 plan with a `Phase 7.1 INSERTED` escape hatch ready.

### Pitfall 8: workflow .md `else`-branch deletion changes indentation context

**What goes wrong:** The `else`-branch bodies are indented assuming they're inside the `if command -v gsd-sdk` block. Removing the `else` but leaving stray `done < "$WT_PATHS_FILE"` / `fi` lines turns the file into invalid bash.
**Why it happens:** Indented heredocs and matched `if/fi` pairs span ~120 lines per file.
**How to avoid:** Delete the entire `if`/`else`/`fi` block down to the closing `fi` — the bare `gsd-sdk query worktree.cleanup-wave --manifest "$X" || exit 1` line replaces the entire conditional. Confirm net diff = exactly one line where the `if` was, and ~117 deletions for execute-phase.md / ~125 for quick.md.
**Warning signs:** Post-edit `bash -n workflows/execute-phase.md` (won't catch this — markdown isn't shell) or visual diff shows unbalanced fi/done.

## Code Examples

### Reading change_id of @ on jj backend (NDJSON template)
```typescript
// Source: verified locally — jj log -r '@' -T 'json(self) ++ "\n"' --no-graph
const args = jjArgv('log', '-r', '@', '-T', 'change_id ++ "\\n"', '--no-graph', '-n', '1');
const r = vcsExec(cwd, 'jj', args);
return r.stdout.split('\n').map(s => s.trim()).find(Boolean);
```

### fork_point common-ancestor (jj 0.41)
```typescript
// Source: jj help -k revsets — "fork_point(x): The fork point of all commits in x.
//   The fork point is the common ancestor(s) of all commits in x …
//   It is equivalent to the revset heads(::x_1 & ::x_2 & ... & ::x_N)"
const r = vcsExec(cwd, 'jj', jjArgv(
  'log', '-r', `fork_point(${aJj} | ${bJj})`,
  '-T', 'change_id ++ "\\n"', '--no-graph', '-n', '1',
));
```

### 2-parent merge change creation (jj)
```typescript
// Source: jj new --help — "you can create a merge commit by specifying multiple
//   revisions … `jj new @ main` will create a new commit with the working copy
//   and the main bookmark as parents."
const newRes = vcsExec(cwd, 'jj', jjArgv(
  'new', '-r', '@', '-r', branchRev, '-m', message,
));
```

### Wave-cleanup executor body shape (worktree-safety.cjs:402 replacement)
```javascript
// Replaces the not_implemented_in_jj_port stub at lines 402-411.
function executeWorktreeWaveCleanupPlan(plan, _deps = {}) {
  const entries = Array.isArray(plan?.entries) ? plan.entries : [];
  if (entries.length === 0) {
    return { ok: true, action: plan?.action ?? 'skip', reason: 'empty_plan', entries: [], pending: [] };
  }
  const vcs = _deps.vcs ?? createVcsAdapter(plan.repoRoot, {});  // backend auto-detect
  const processed = [];
  const pending = [];
  for (const entry of entries) {
    try {
      // verb #1: confirm branch at worktree matches expectation
      const branches = vcs.refs.currentBookmarksIn(entry.worktree_path);
      if (!branches.includes(entry.branch)) {
        pending.push({ ...entry, reason: 'branch_drift', detected: branches });
        continue;
      }
      // verb #2 + #3: deletion guard
      const base = vcs.refs.mergeBase(vcs.refs.head, entry.branch);
      const dels = vcs.diff({
        rev: expr.range(expr.rev(base), expr.rev(entry.branch)),
        diffFilter: 'deleted',
        nameOnly: true,
      });
      if (dels.nameOnly.length > 0) {
        pending.push({ ...entry, reason: 'deletions_detected', files: dels.nameOnly });
        continue;
      }
      // verb #4: dirty-WC guard
      const wtStatus = vcs.status({ porcelain: true, cwd: entry.worktree_path });
      if (wtStatus.entries.length > 0) {
        pending.push({ ...entry, reason: 'worktree_dirty', entries: wtStatus.entries });
        continue;
      }
      // verb #5: 2-parent merge with atomic agent-bookmark cleanup (D-03)
      const merge = vcs.workspace.merge({
        branch: expr.rev(entry.branch),
        message: `chore: merge executor worktree (${entry.branch})`,
        ff: false,
        agentBookmark: entry.branch,  // D-03 atomic delete
      });
      if (!merge.ok) {
        pending.push({ ...entry, reason: merge.conflicted ? 'merge_conflict' : 'merge_failed', stderr: merge.stderr });
        continue;
      }
      // verb #6: rm worktree (composite forget + rm-rf on jj; worktree remove --force on git)
      vcs.workspace.remove(entry.worktree_path, { force: true });
      // verb #7 not needed here — D-03 already deleted agent bookmark inside merge().
      processed.push({ ...entry, mergedAs: merge.changeId });
    } catch (err) {
      pending.push({ ...entry, reason: 'unexpected_error', error: err.message });
    }
  }
  return { ok: pending.length === 0, action: plan.action, entries: processed, pending };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw-git fallback in `else` branch of workflows | Hard-delete; `gsd-sdk` is always installed | Phase 5 PROMPT-01 ratified gsd-sdk as always-present | Workflow files shed ~120 LOC each |
| `not_implemented_in_jj_port` stub | Real executor body via 7 verbs | Phase 7 (this phase) | Wave-cleanup works on both backends |
| `vcs-lint:allow-git-here` exception on release-notes | Cross-backend `vcs.log` / `vcs.diff` | D-17 | Preserves upstream-mergeability per D-18 |
| Sequential phase execution in this repo | Phase 4 octopus/reap fan-in for parallel waves | D-13 + Phase 7 first dogfood | First parallel-execution validation on the migrated repo |

**Deprecated / outdated in CONTEXT.md framing:**
- "No PRs back upstream" hard rule (PROJECT.md) → updated per D-18 to "not currently intended, but not foreclosed." Reshapes the github-release-notes decision (migrate, don't delete).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `fork_point(a | b)` works on disconnected ancestry by returning empty (vs. erroring) | Pitfall 1 | Low — wave-cleanup never sees disconnected ancestry; contract test should cover empty case anyway |
| A2 | `jj bookmark delete` on a non-existent bookmark exits 0 (idempotent) — making D-09's `force` truly a no-op on jj | D-09 / Pattern 3 | Medium — if jj exits non-zero on missing bookmark, `force:true` semantics need a try/catch wrapper |
| A3 | `installer-migrations` and `shell-command-projection` tests have ZERO VCS dependencies | §Test surface triage; Sources | Low — verified via grep across all 9 test files; only 2 reference git at all, both via `execGit` helper test which legitimately stays git-only |
| A4 | `github-release-notes.cjs`'s `show <ref>:<file>` operation has no direct adapter verb | Pitfall 7 | Medium — if planner doesn't surface this proactively, D-16 fires mid-execution. Recommended mitigation: scope an `vcs.refs.readBlob(ref, path)` 8th verb in the Plan 1 design, or accept the Phase 7.1 INSERTED escape |
| A5 | Multi-runtime markdown sync surface is empty for `workflows/` files (only Claude variants exist on disk) | §Multi-runtime markdown sync | Low — verified via `find get-shit-done/workflows -type d`; PROMPT-03 status (line 276 REQUIREMENTS.md) corroborates "source-of-truth Claude markdown is processed by bin/install.js transform pipeline for 15+ runtimes" — no per-runtime workflow .md files to keep in lockstep |
| A6 | `jj diff --summary` letter set on jj 0.41 is `{A,M,D,R,C,T,X,B}` (no `U`) | Pitfall 2 / Pattern 5 | Low — empirically verified by plan 03-05 IN-04 and codified in jj.ts:418 regex |
| A7 | `acquireJjWriteLock` is safe to take inside `workspace.merge` without deadlocking | Pitfall 3 / Pattern 3 | Low — already called by `vcs.commit()` (Phase 4); no recursion path exists |
| A8 | The wave-cleanup manifest entry shape (`worktree_path`, `branch`, `expected_base`) is stable and pre-populated by the workflow before this executor runs | §Code Examples; §System Architecture Diagram | Low — manifest is upstream-shaped, populated by `/gsd-execute-phase` and `/gsd-quick` workflows; reading `planWorktreeWaveCleanup` (worktree-safety.cjs:311-360) confirms the shape |
| A9 | Strict-green test triage (D-14/D-15) is achievable in Phase 7 without an 8th verb | §Summary | Medium — depends on whether the few VCS-touching tests (`shell-command-projection-dispatch` execGit call at line 48 with `/tmp/definitely-not-a-git-repo-8675309`) reveal divergent error-text expectations on jj. The `execGit` helper is by name git-specific; tests of it stay git-only — but if a test expects a specific git error string from a non-repo and that path fires on jj-colocated CI somehow, fix may require an adapter touch. Mitigation: planner schedules triage as Plan 5+ with budget to escalate to Phase 7.1 INSERTED |

## Open Questions

1. **`workspace.merge`'s message-on-conflict shape.**
   - What we know: D-02 locks `{ok:false, conflicted:true, change_id}` return shape. SQUASH-06 says don't auto-abandon.
   - What's unclear: should the conflicted change still get its description set (so subsequent `jj log` shows a meaningful subject), or should it be left with empty description?
   - Recommendation: set description (current Pattern 3 does this via `-m` to `jj new`). Phase 3's `commit()` conflict path leaves description set; mirror that.

2. **Per-verb contract-test depth.**
   - What we know: CONTEXT.md `<deferred>` defers this to planner.
   - What's unclear: should each verb have a happy-path test only, or also a failure-mode test (e.g., `workspace.merge` with conflicted result, `bookmarks.delete` with `force:true` on already-deleted)?
   - Recommendation: happy path + at least one explicit failure-mode test per verb. The 5 verbs with multiple branches (`merge`, `remove`, `mergeBase`, `diff{diffFilter}`, `bookmarks.delete{force}`) need 2-3 tests each; the 2 with one branch (`currentBookmarksIn`, `status{cwd}`) need 1.

3. **`expr.range` shape with mergeBase output on jj.**
   - What we know: D-05 locks `mergeBase` returns `change_id` on jj. `expr.range` is the consumer per CONTEXT canonical refs.
   - What's unclear: does `expr.range(expr.rev('<change_id>'), expr.rev(branch))` translate cleanly to `<change_id>..<branch_rev>` revset on jj backend, and identically to `<commit_hash>..<branch_ref>` on git?
   - Recommendation: write a smoke test in Plan 1 confirming the round-trip. Phase 2-03 `toJjRev` recursive range translation handles `range:<encoded>..<encoded>` (see STATE.md log: "range:<encoded>..<encoded> recursive translation in toGitRev/toJjRev avoids extending parseExpr"), so this should "just work" — but verify in a smoke test before depending on it across all 7 verbs.

4. **Should `vcs.refs.readBlob(ref, path)` be added as a proactive 8th verb?**
   - What we know: github-release-notes.cjs:71 needs `show <ref>:<file>` semantics. CONTEXT D-16 caps Phase 7 at 7 verbs and spawns Phase 7.1 INSERTED for 8th-verb needs.
   - What's unclear: is reaching for this verb during Plan 4 (github-release-notes migration) a "discovered need" that justifies Phase 7.1, or a "predictable need" that should be scoped into Phase 7's plan?
   - Recommendation: surface in discuss-phase as a possible Plan 1 addition. If user says yes, fold into Plan 1 verb-batch. If no, Plan 4 design accommodates the diff-and-checkout workaround AND has a documented `Phase 7.1 INSERTED` escape hatch.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `jj` | jj-side verb bodies, contract tests | ✓ | 0.41.0 | — (CI pins identical version) |
| `git` | git-side verb bodies, baseline parity | ✓ (assumed; repo carries .git) | (system) | — |
| `pnpm` | SDK build + tests | ✓ (assumed) | 11+ | — |
| `node` | SDK runtime, cjs runtime | ✓ (assumed) | ≥22 | — |
| `tsx` | TS execution (per user global CLAUDE.md) | ✓ (assumed) | — | — |

No missing dependencies; no blockers.

## Validation Architecture

Per `.planning/config.json` line 26: `"nyquist_validation": false`. **Section omitted per the spec.** Verification will follow phase-close gates (lint-vcs-no-raw-git, contract-test green on both backends, jj-colocated CI lane required-blocking).

## Security Domain

`security_enforcement` is not present in `.planning/config.json`, but per the spec absence = enabled. Phase 7 surface is internal adapter + workflow shell-glue, not user-facing.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | (no auth surface) |
| V3 Session Management | no | (no sessions) |
| V4 Access Control | no | (no privileged ops) |
| V5 Input Validation | yes | argv-array invocation only (JJ-02); `--` end-of-options separator before user-influenced positionals (Phase 4 D-24 fold-in); refname-shape validators on bookmark names |
| V6 Cryptography | no | (no crypto) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Argv injection via attacker-controlled bookmark name into `jj bookmark delete <name>` | Tampering | Refname-shape regex gate (existing pattern); `--` separator before positional (existing in jj.ts:914, 933) |
| Argv injection via worktree path into `jj workspace forget <name>` | Tampering | Existing `--` separator at jj.ts:933 (Phase 4 T-04.01-02 mitigation); new `workspace.remove` MUST mirror this |
| Path-traversal via `worktree_path` in manifest, used in `fs.rm` | Tampering | Resolve `path.join(cwd, '.claude/jj-workspaces', name)` before rm; never let manifest entries dictate absolute paths outside `.claude/jj-workspaces/`. Mirror Phase 5 CR-06 path-traversal-boundary fix at code-review.md line 137 |
| Atomic-merge race: orchestrator and a subagent both write the main bookmark | Race condition | `acquireJjWriteLock` on main repo cwd inside `workspace.merge` (Pitfall 3, Pattern 3) |

## Sources

### Primary (HIGH confidence)
- **`.planning/phases/07-…/07-CONTEXT.md`** — D-01..D-18 lock 18 design decisions. Verbatim source for verb shapes and phase scope. [VERIFIED: read in full]
- **`sdk/src/vcs/types.ts`** — cross-backend type contract; new verbs extend existing interfaces. [VERIFIED: read in full]
- **`sdk/src/vcs/backends/jj.ts:410-525`** — existing `diff` + `findConflicts` + `parseDiffSummary` patterns. [VERIFIED: read]
- **`sdk/src/vcs/backends/jj.ts:891-1008`** — existing `workspace.{add,forget,list,context,prune,reap}` patterns; new `workspace.merge` + `workspace.remove` follow these idioms. [VERIFIED: read]
- **`sdk/src/vcs/backends/git.ts:255-345`** — existing `status` + `diff` patterns on git side; `diffFilter` and `status({cwd})` extend these. [VERIFIED: read]
- **`get-shit-done/bin/lib/worktree-safety.cjs:382-451`** — the `_deps={}` injection pattern and the stubbed executor body. [VERIFIED: read]
- **`get-shit-done/workflows/execute-phase.md:760-891`** and **`quick.md:773-911`** — exact `if`/`else`/`fi` block boundaries to delete. [VERIFIED: read]
- **`scripts/changeset/github-release-notes.cjs` (in full, 203 lines)** — every git invocation goes through `runGit()` at line 37; 3 callers at lines 56 (`rev-parse --verify`), 63 (`diff --name-only A..B -- .changeset`), 71 (`show <ref>:<file>`). [VERIFIED: read]
- **jj 0.41 CLI help** (`jj log/diff/new/workspace --help`, `jj help -k revsets`) — exact flag set, `fork_point(x)` revset spec, `jj new -r A -r B` 2-parent semantics. [VERIFIED: local probe against jj 0.41.0 at `/Users/LoganDark/.local/bin/jj`]
- **Test surface scan** — `grep -c "git\|vcs\|jj" tests/installer-migration*.test.cjs tests/shell-command-projection*.test.cjs tests/bug-3413*.test.cjs tests/bug-3441*.test.cjs tests/bug-3442-shim*.test.cjs` returns 0 for 7 of 9 files; only `shell-command-projection-dispatch.test.cjs` (testing `execGit` itself) and `installer-migration-install-integration.test.cjs` (using `spawnSync` for the install runner, unrelated to VCS) have any references. [VERIFIED: shell scan]
- **Multi-runtime workflow files** — `find get-shit-done/workflows -type d` returns only `execute-phase/`, `discuss-phase/`, `execute-phase/steps`, `discuss-phase/modes`, `discuss-phase/templates`. No `codex/`, `gemini/`, `opencode/` subdirs. [VERIFIED: shell scan; corroborated by REQUIREMENTS.md PROMPT-03 status — install.js transform pipeline projects for runtimes]
- **`.planning/STATE.md`** — Phase 6 closure log; A3 colocated pre-commit gap status; format-migration tracker handoff. [VERIFIED: read in full]

### Secondary (MEDIUM confidence)
- **`.planning/MILESTONES.md` v1.0 retrospective** — confirms wave-cleanup executor stub and workflow .md raw-git fallbacks as the two known v1.0 → v1.1 carry-forwards. [VERIFIED: read]
- **`.planning/ROADMAP.md:208-216`** — Phase 7 placeholder; planner updates this once plans land. [VERIFIED: read]
- **`sdk/src/vcs/jj/{octopus,reap,lock}.ts`** — exports surface for D-12 fan-in. [VERIFIED: grep `^export `]

### Tertiary (LOW confidence)
- **`jj diff --summary` letter set on hypothetical future jj versions** — Pitfall 2 assumes plan 03-05 IN-04's empirical letter set holds. [ASSUMED: low risk — covered by existing parser]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every command spelling verified locally against jj 0.41.0 + existing codebase analogs
- Architecture: HIGH — CONTEXT.md locks shape; existing patterns codify implementation
- Pitfalls: HIGH — 6 of 8 pitfalls grounded in observed Phase 1-6 code patterns; 2 (A1, A2) flagged as Assumptions for early-execution verification

**Research date:** 2026-05-14
**Valid until:** 2026-06-14 (30 days for stable adapter contract; jj 0.41 unlikely to ship breaking changes in that window; CI pins exact version)
