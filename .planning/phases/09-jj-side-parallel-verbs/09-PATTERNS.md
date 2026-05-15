# Phase 9: jj-side parallel verbs — Pattern Map

**Mapped:** 2026-05-15
**Files analyzed:** 8 (3 net-new + 5 modified, plus manifest schema extension)
**Analogs found:** 8 / 8 (every file has a direct in-tree precedent)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `sdk/src/vcs/jj/parallel.ts` (NEW) | composition / sidecar | request-response (pure fns over `vcsExec`) | `sdk/src/vcs/jj/octopus.ts` + `sdk/src/vcs/jj/reap.ts` | exact (same tier, same sidecar discipline) |
| `sdk/src/vcs/jj/conflict-paths.ts` (NEW) | sidecar / helper extraction | request-response | `sdk/src/vcs/backends/jj.ts:524-557` (`enumerateConflictedPaths`) | exact (verbatim extraction) |
| `sdk/tests/vcs/jj/parallel.contract.test.ts` (NEW) | test | event-driven fixture | `sdk/src/vcs/__tests__/jj-octopus.test.ts` + `sdk/src/vcs/__tests__/jj-reap.test.ts` | exact (Pattern A/B template already established) |
| `sdk/src/vcs/types.ts` (MOD) | type declarations | type-only | `VcsWorkspace` block at lines 392-425; `VcsBookmarks` sub-namespace at 356-379 | exact (sub-namespace precedent) |
| `sdk/src/vcs/jj/reap.ts` (MOD — extend classifier) | classifier extension | request-response | itself (lines 130-194 — insert NEW branch between empty? and crashed branches) | exact (self-pattern; insert sibling probe) |
| `sdk/src/vcs/backends/jj.ts` (MOD — wire `workspace.parallel`) | adapter wiring | dispatch | `sdk/src/vcs/backends/jj.ts:1135-1157` (`workspace.reap` wrapper delegating to sidecar) | exact |
| `sdk/src/vcs/backends/git.ts` (MOD — throwing stub) | adapter wiring (stub) | dispatch / throw | `VcsNotImplementedError` callsites in `backends/jj.ts:125, 166, 789, 1023` (8 hits) | exact (existing stub idiom) |
| `sdk/src/vcs/jj/incomplete-work.ts` (MOD — parse-time validation) | parser tightening | request-response | itself, lines 60-76 (existing throw-on-malformed-line) | exact (extend existing throw branch) |
| `WAVE_WORKTREE_MANIFEST` schema (MOD — additive fields) | manifest schema | file-I/O | `get-shit-done/bin/lib/worktree-safety.cjs:319-342` (`normalizeCleanupManifestEntry`) | partial (reader; SDK-side writer is net-new) |

---

## Pattern Assignments

### `sdk/src/vcs/jj/parallel.ts` (composition / sidecar, request-response)

**Primary analog:** `sdk/src/vcs/jj/octopus.ts` (header + `jjArgvFlags` template + `resolveChangeId` helper).
**Secondary analog:** `sdk/src/vcs/jj/reap.ts` (composing performJjReap call, plus the `if-empty / else` classifier branch shape that fanIn extends).

**Header pattern** (copy verbatim shape from `octopus.ts:1-32` and `reap.ts:1-26`):
```typescript
/**
 * sdk/src/vcs/jj/parallel.ts — Phase 9 (VCS-17, PARALLEL-01/02 jj-side)
 *
 * Composition layer over octopus.ts + reap.ts + jj-native N-parent merge.
 * UPSTREAM-02 sidecar: does NOT import from backends/jj.ts (that would
 * create a merge conflict on every upstream-rebase cycle).
 *
 * Pure functions; both return frozen JSON (D-05).
 */
```

**Imports pattern** (`octopus.ts:34-37` template — note `node:` prefix on stdlib, `.js` suffix on relative imports for ESM resolution):
```typescript
import { vcsExec } from '../exec.js';
import { expr } from '../expr.js';
import type { RevisionExpr, ParallelDispatchHandle, ParallelAgentResult, FanInResult } from '../types.js';
import { createPhaseStructure, createSubagentSlot } from './octopus.js';
import { performJjReap } from './reap.js';
import { join } from 'node:path';
```

**`jjArgvFlags` inline (sidecar discipline — UPSTREAM-02)** — copy verbatim from `octopus.ts:39-47` / `reap.ts:33-41`:
```typescript
function jjArgvFlags(repo: string): string[] {
    return ['--repository', repo, '--no-pager', '--color', 'never', '--quiet'];
}
```

**`resolveChangeId` helper** — copy verbatim from `octopus.ts:49-66`:
```typescript
function resolveChangeId(mainRepoRoot: string, revset: string): string {
    const args = [
        ...jjArgvFlags(mainRepoRoot),
        'log', '-r', revset, '-T', 'change_id ++ "\\n"', '--no-graph', '-n', '1',
    ];
    const r = vcsExec(mainRepoRoot, 'jj', args);
    if (r.exitCode !== 0 || !r.stdout.trim()) {
        throw new Error(`parallel.resolveChangeId(${revset}) failed: ${r.stderr || r.stdout}`);
    }
    return r.stdout.trim();
}
```

**Error-handling pattern** — every `vcsExec` site mirrors `reap.ts:63-68`:
```typescript
const r = vcsExec(mainRepoRoot, 'jj', args);
if (r.exitCode !== 0) {
    throw new Error(`parallel.<operation>: <context>: ${r.stderr || r.stdout}`);
}
```

**Frozen-JSON return pattern** — copy shape from RESEARCH.md §"Pattern 2" (verified against `backends/jj.ts:1372` adapter-freeze, and against the inner-map freeze idiom in `workspace.list` parsers):
```typescript
return Object.freeze({
    phaseRoot,
    workspaces: Object.freeze(
        workspaceEntries.map((w) => Object.freeze({
            name: w.workspaceName,
            path: w.workspacePath,
            baseRev: w.headChange,            // D-14: change_id on jj; document via JSDoc on the type
            agentId: w.agentId,
            // baselineOpId: omitted under D-01 OR kept undefined per planner discretion (D-06)
        }))
    ),
    manifest: manifestPath,
    phaseNumber,
    mainBookmark,
}) satisfies ParallelDispatchHandle;
```

**`expr.rev` brand-wrapping pattern** — copy from `octopus.ts:319`:
```typescript
vcs.workspace.add({
    path: workspacePath,
    baseRef: expr.rev(headChange),  // brand the raw change_id into RevisionExpr
    name: workspaceName,
});
```

**Composition call pattern (`createPhaseStructure` + N× `createSubagentSlot`)** — see `octopus.ts:102-189` for the function being called; `parallel.ts` is the caller-tier:
```typescript
const { parentChange, mergeChange } = createPhaseStructure(mainRepoRoot, '@-', phaseNumber);
const slots = plan.map((item, idx) =>
    createSubagentSlot(mainRepoRoot, vcs, { parentChange, mergeChange, idx: idx + 1, phaseNum: phaseNumber }),
);
```

**`fanIn` N-parent `jj new` invocation** — extend `backends/jj.ts:1180-1188` 2-parent shape to N parents:
```typescript
// 2-parent precedent: jjArgv('new', '-r', '@', '-r', branchRev, '-m', opts.message)
const parentArgs: string[] = ['new', '-r', '@'];
for (const ws of handle.workspaces) parentArgs.push('-r', ws.baseRev);
parentArgs.push('-m', `phase ${handle.phaseNumber} merge: ${handle.workspaces.length} parents`);
const newRes = vcsExec(mainRepoRoot, 'jj', [...jjArgvFlags(mainRepoRoot), ...parentArgs]);
```

**Note on `acquireJjWriteLock`:** the 2-parent `workspace.merge` body at `backends/jj.ts:1176` acquires a per-workspace lock. Phase 9 `fanIn` does **NOT** call `acquireJjWriteLock` (D-02 dropped the repo-scoped lock; the per-workspace lock is irrelevant in single-orchestrator-process fanIn).

---

### `sdk/src/vcs/jj/conflict-paths.ts` (sidecar extraction, request-response)

**Analog:** `sdk/src/vcs/backends/jj.ts:524-557` — verbatim extraction of `enumerateConflictedPaths`.

**Extraction excerpt** (the function body to lift wholesale; this satisfies RESEARCH Open Q3 / A3):
```typescript
// sdk/src/vcs/jj/conflict-paths.ts (extracted from backends/jj.ts:524-557)
import { vcsExec } from '../exec.js';

function jjArgvFlags(repo: string): string[] {
    return ['--repository', repo, '--no-pager', '--color', 'never', '--quiet'];
}

/**
 * Enumerate the conflicted-path list at a revision. Primary path:
 * `jj resolve --list -r <rev>`. Fallback: `jj diff -r <rev> --summary`
 * filtered for the `C` status letter (IN-04: `U` removed — jj 0.41 never
 * emits it on diff --summary). WR-04: returns `['<UNRESOLVABLE>']` when
 * conflicts() flagged the rev but no enumeration form succeeded — caller
 * gates downstream behavior on that sentinel.
 */
export function enumerateConflictedPaths(cwd: string, rev: string): string[] {
    const primaryArgs = [...jjArgvFlags(cwd), 'resolve', '--list', '-r', rev];
    const primary = vcsExec(cwd, 'jj', primaryArgs);
    if (primary.exitCode === 0 && primary.stdout.trim().length > 0) {
        return primary.stdout
            .split('\n').map((s) => s.trim()).filter(Boolean)
            .map((line) => { const m = /^(\S+)/.exec(line); return m ? m[1] : line; });
    }
    const fallbackArgs = [...jjArgvFlags(cwd), 'diff', '-r', rev, '--summary'];
    const fallback = vcsExec(cwd, 'jj', fallbackArgs);
    if (fallback.exitCode !== 0) return ['<UNRESOLVABLE>'];
    const paths = fallback.stdout.split('\n').filter(Boolean)
        .map((line) => { const m = /^C (.+)$/.exec(line); return m ? m[1] : ''; })
        .filter(Boolean);
    return paths.length > 0 ? paths : ['<UNRESOLVABLE>'];
}
```

**Backends-side rewire** (after extraction, replace `backends/jj.ts:524-557` body with an import-and-bind):
```typescript
import { enumerateConflictedPaths as _enumerateConflictedPaths } from '../jj/conflict-paths.js';
const enumerateConflictedPaths = (rev: string): string[] => _enumerateConflictedPaths(cwd, rev);
```

**Why extract:** `jj/parallel.ts` (sidecar) and `jj/reap.ts` (sidecar) both need this helper. Importing it directly from `backends/jj.ts` violates UPSTREAM-02. The extracted sidecar gives sidecar-tier callers a single source of truth.

---

### `sdk/src/vcs/jj/reap.ts` (classifier extension — MOD)

**Analog:** itself — insert a NEW sibling branch between the existing `if (empty)` (`reap.ts:131-159`) and the existing `else` crashed-work branch (`reap.ts:160-194`).

**New helper to add** (modeled on `isEmptyHead` at `reap.ts:54-70`):
```typescript
/**
 * D-11: in-tree conflict probe. Reuses jj 0.41's `conflicts()` revset
 * (PLURAL — see backends/jj.ts:562-567 for the naming-correction record).
 * Returns true iff `headChange` has any in-tree conflict.
 */
function hasInTreeConflict(mainRepoRoot: string, headChange: string): boolean {
    const args = [
        ...jjArgvFlags(mainRepoRoot),
        'log', '-r', `conflicts() & ${headChange}`,
        '-T', 'change_id ++ "\\n"', '--no-graph',
    ];
    const r = vcsExec(mainRepoRoot, 'jj', args);
    if (r.exitCode !== 0) {
        throw new Error(`reap: conflict probe failed: ${r.stderr || r.stdout}`);
    }
    return r.stdout.trim().length > 0;
}
```

**Classifier ordering** (insert between existing lines 130 and 131):
```typescript
const parent = parentOf(opts.mainRepoRoot, entry.headChange);
const empty = isEmptyHead(opts.mainRepoRoot, parent, entry.headChange);
if (empty) {
    // existing branch (lines 131-159) — abandon + forget + rm
} else if (hasInTreeConflict(opts.mainRepoRoot, entry.headChange)) {
    // NEW (D-09/D-10/D-11): squash as incomplete, reason 'merge-in-tree-conflict'.
    // Conflicted-paths enumeration via enumerateConflictedPaths from
    // ../jj/conflict-paths.ts (after extraction).
    const conflictedPaths = enumerateConflictedPaths(opts.mainRepoRoot, entry.headChange);
    // ... mirror the existing squash-and-queue branch shape, swapping reason literal ...
    const queueEntry: IncompleteWorkEntry = {
        subagentName: entry.name,
        changeIdShort: entry.headChange.slice(0, 8),
        workspacePath: entry.path,
        reason: 'merge-in-tree-conflict',
    };
    appendIncomplete(opts.phaseDir, queueEntry);
    incomplete.push(queueEntry);
} else {
    // existing branch (lines 160-194) — squash as incomplete,
    // reason 'crashed-with-uncommitted-work'
}
```

**Squash-and-queue subpattern to mirror** (`reap.ts:165-190`):
```typescript
const idxMatch = /-subagent-(\d+)/.exec(entry.name);
const idx = idxMatch ? idxMatch[1] : '?';
const message = `subagent ${idx}: incomplete work`;
const squashArgs = [
    ...jjArgvFlags(opts.mainRepoRoot),
    'squash', '-r', entry.headChange, '-k', '-m', message,
];
// ...same exit-code throw...
appendIncomplete(opts.phaseDir, queueEntry);
incomplete.push(queueEntry);
```

**Convention to follow:** NEW branch leaves the on-disk dir and workspace tracking intact (mirror `reap.ts:191-194` comment), exactly like the existing crashed-work branch — the user reviews the queue entry before deciding to discard.

---

### `sdk/src/vcs/backends/jj.ts` (adapter wiring — MOD)

**Analog:** the existing `workspace.reap` wrapper at `backends/jj.ts:1135-1157` — same shape: thin adapter call that delegates to a sidecar.

**Pattern excerpt** (`backends/jj.ts:1135-1157`):
```typescript
reap: (opts: { phaseNamePrefix: string; phaseDir: string }): ReapResult => {
  const allEntries = workspace.list();
  const tracked = allEntries
    .filter((e) => e.path.startsWith(opts.phaseNamePrefix))
    .map((e) => ({ name: e.path, headChange: e.rev,
                   path: join(cwd, '.claude/jj-workspaces', e.path) }));
  return performJjReap({
    mainRepoRoot: cwd,
    phaseNamePrefix: opts.phaseNamePrefix,
    phaseDir: opts.phaseDir,
    entries: tracked,
  });
},
```

**Wire-in shape** (inside `workspace = Object.freeze({...})` block, ending at `backends/jj.ts:1275`):
```typescript
// Phase 9 (VCS-16, PARALLEL-01/02): cross-backend parallel namespace.
// Delegates to UPSTREAM-02 sidecar in sdk/src/vcs/jj/parallel.ts.
parallel: Object.freeze({
    dispatch: (opts: ParallelDispatchOpts): ParallelDispatchHandle =>
        performJjParallelDispatch({ mainRepoRoot: cwd, vcs: { workspace }, ...opts }),
    fanIn: (handle: ParallelDispatchHandle, results: readonly ParallelAgentResult[]): FanInResult =>
        performJjParallelFanIn(cwd, handle, results),
}),
```

**Import (top of file, alongside `import { performJjReap } from '../jj/reap.js';`)**:
```typescript
import { performJjParallelDispatch, performJjParallelFanIn } from '../jj/parallel.js';
```

---

### `sdk/src/vcs/backends/git.ts` (throwing stub — MOD)

**Analog:** existing `VcsNotImplementedError` callsites in `backends/jj.ts:125, 166, 789, 1023` (eight instances total — search `grep -n "VcsNotImplementedError" sdk/src/vcs/backends/jj.ts`).

**Stub pattern** (mirror RESEARCH §"Git-side Stub Question" — the imports + the `parallel: Object.freeze({...})` block goes inside the existing `workspace = Object.freeze({...})` ending around `git.ts:line near end of workspace block`):
```typescript
import { VcsNotImplementedError } from '../types.js';

// inside workspace = Object.freeze({ ... reap, merge, remove, ...
parallel: Object.freeze({
    dispatch(): never {
        throw new VcsNotImplementedError(
            'workspace.parallel.dispatch is not yet implemented on the git backend; Phase 10 ships the body',
        );
    },
    fanIn(): never {
        throw new VcsNotImplementedError(
            'workspace.parallel.fanIn is not yet implemented on the git backend; Phase 10 ships the body',
        );
    },
}),
```

**Type definition for `VcsNotImplementedError`** (already exists, no extension needed) — `types.ts:573-578`:
```typescript
export class VcsNotImplementedError extends Error {
    readonly name = 'VcsNotImplementedError';
    constructor(message: string) { super(message); }
}
```

---

### `sdk/src/vcs/types.ts` (type declarations — MOD)

**Analog A (sub-namespace shape):** `VcsBookmarks` at `types.ts:356-379` — precedent for a typed sub-namespace inside an adapter top-level property.

**Analog B (Workspace verb-list extension point):** `VcsWorkspace` at `types.ts:392-425`.

**Analog C (existing `IncompleteWorkEntry`):** `types.ts:242-247` — currently `reason: string`. Phase 9 tightens to literal union.

**`VcsWorkspaceParallel` placement** (after `VcsWorkspace` at line 425; Claude's discretion per CONTEXT D-06):
```typescript
// Phase 9 (VCS-16): cross-backend parallel-dispatch verb namespace.
// jj backend body: sdk/src/vcs/jj/parallel.ts (composition over octopus + reap).
// git backend: throwing stub in Phase 9; real body in Phase 10.
export interface VcsWorkspaceParallel {
    dispatch(opts: ParallelDispatchOpts): ParallelDispatchHandle;
    fanIn(handle: ParallelDispatchHandle, results: readonly ParallelAgentResult[]): FanInResult;
}

// Extension to VcsWorkspace at lines 392-425: append `parallel` member:
//     parallel: VcsWorkspaceParallel;   // NEW (Phase 9, VCS-16)
```

**`ParallelDispatchHandle` with PARALLEL-05 JSDoc** (verbatim wording per D-14, see RESEARCH §"change_id Stability"):
```typescript
export interface ParallelDispatchHandle {
    phaseRoot: string;
    phaseNumber: number;
    mainBookmark: string;
    manifest: string;  // absolute path to WAVE_WORKTREE_MANIFEST written at dispatch
    workspaces: readonly Readonly<{
        name: string;
        path: string;
        /**
         * change_id on jj; stable across `jj rebase`.
         * commit_id on git; stable across `git rebase`.
         * Cross-backend semantics: rebase-stable revision pointer to the
         * parent change the workspace forked from. (PARALLEL-05, D-14.)
         */
        baseRev: string;
        agentId: string;
        /**
         * Reserved for forward-compat with a future re-introduced liveness
         * probe. Currently always `undefined` — D-01 dropped PARALLEL-03 at
         * Phase 9 discuss-phase (2026-05-15). Planner may strip if YAGNI noise
         * outweighs forward-compat value.
         */
        baselineOpId?: string;
    }>[];
}
```

**`IncompleteWorkEntry` tightening** (replace existing `types.ts:242-247`):
```typescript
export interface IncompleteWorkEntry {
    subagentName: string;
    changeIdShort: string;
    workspacePath: string;
    /**
     * Phase 9 D-09: closed enum. Values:
     *  - 'crashed-with-uncommitted-work' (existing; reap.ts:187 emitter)
     *  - 'merge-in-tree-conflict' (new; reap.ts conflict-classifier branch)
     * Phase-merge gate at backends/jj.ts:182-194 / backends/git.ts:121-138
     * treats unknown reasons as fail-safe block (A1).
     */
    reason: 'crashed-with-uncommitted-work' | 'merge-in-tree-conflict';
}
```

**`FanInResult` and `ParallelAgentResult` (D-07 / D-08)** — fresh, no existing analog beyond `WorkspaceMergeResult` shape at `types.ts:230-235`:
```typescript
export interface ParallelDispatchOpts {
    plan: readonly { agentId: string; planId: string; workspacePath?: string }[];
    phaseNumber: number;
    mainBookmark: string;
    maxConcurrency?: number;
}

export interface ParallelAgentResult {
    agentId: string;
    exitCode: number;
    lastChangeId?: string;
    stderr?: string;
}

export interface FanInResult {
    merged: readonly string[];               // change_ids
    conflicted: boolean;
    conflictedPaths: readonly string[];
    incompleteQueued: number;
    failedReaped: readonly string[];
    surplusBookmarks: readonly string[];
}
```

---

### `sdk/src/vcs/jj/incomplete-work.ts` (parse-time validation — MOD)

**Analog:** itself, lines 60-76 — existing malformed-line throw branch is the model for tightening reason parsing.

**Existing pattern** (lines 60-76):
```typescript
for (const line of lines) {
    if (!line.trim()) continue;
    if (line.trimStart().startsWith('#')) continue;
    const m = ENTRY_RE.exec(line);
    if (!m) {
        throw new Error(
            `incomplete-work.md: malformed entry in ${p}: ${line.slice(0, 120)}`,
        );
    }
    entries.push({
        subagentName: m[1].trim(),
        changeIdShort: m[2].trim(),
        workspacePath: m[3].trim(),
        reason: m[4].trim(),                       // <-- currently free-form string
    });
}
```

**Phase 9 extension** (add a validated-reason check before push):
```typescript
const KNOWN_REASONS = new Set<IncompleteWorkEntry['reason']>([
    'crashed-with-uncommitted-work',
    'merge-in-tree-conflict',
]);

// inside the loop, before push:
const reasonRaw = m[4].trim();
if (!KNOWN_REASONS.has(reasonRaw as IncompleteWorkEntry['reason'])) {
    throw new Error(
        `incomplete-work.md: unknown reason "${reasonRaw}" in ${p}: ${line.slice(0, 120)}`,
    );
}
entries.push({
    subagentName: m[1].trim(),
    changeIdShort: m[2].trim(),
    workspacePath: m[3].trim(),
    reason: reasonRaw as IncompleteWorkEntry['reason'],
});
```

**Convention to follow:** throw on unknown reason (matches existing malformed-line policy) — keeps the D-14 phase-merge gate fail-safe per A1 in RESEARCH §"Assumptions Log".

---

### `sdk/tests/vcs/jj/parallel.contract.test.ts` (TEST-13 + TEST-14)

**Analog A (Pattern A/B fixture):** `sdk/src/vcs/__tests__/jj-octopus.test.ts:19-74`. Pattern A = `describe.sequential.skipIf(!jjAvailable)`. Pattern B = random-prefix `mkdtemp`.

**Analog B (classifier-scenario template):** `sdk/src/vcs/__tests__/jj-reap.test.ts:115-151` — exact template for "non-empty head: squashes as incomplete + appends to queue + leaves dir intact"; Phase 9 mirrors this for the `merge-in-tree-conflict` scenario.

**Fixture-skeleton pattern** (copy verbatim from `jj-octopus.test.ts:31-74`):
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { createJjAdapter } from '../../../src/vcs/backends/jj.js';
import { readIncomplete } from '../../../src/vcs/jj/incomplete-work.js';

let jjAvailable = false;
try { execSync('jj --version', { stdio: 'pipe' }); jjAvailable = true; } catch {}

describe.sequential.skipIf(!jjAvailable)(
    'workspace.parallel — TEST-13 jj contract + TEST-14 divergent() topology',
    () => {
        let dir: string;
        let vcs: ReturnType<typeof createJjAdapter>;
        beforeAll(() => {
            // Pattern B: random-prefix mkdtemp guards against parallel-test-FILE collisions.
            dir = mkdtempSync(join(tmpdir(),
                `gsd-jj-parallel-${Math.random().toString(36).slice(2, 10)}-`));
            execSync('jj git init --colocate', { cwd: dir, stdio: 'pipe' });
            execSync('jj config set --repo user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
            execSync('jj config set --repo user.name "Test"', { cwd: dir, stdio: 'pipe' });
            writeFileSync(join(dir, 'seed.txt'), 'seed\n');
            execSync('jj squash -B @ -k -m "seed"', { cwd: dir, stdio: 'pipe' });
            vcs = createJjAdapter(dir);
        });
        afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

        for (const N of [2, 3, 4] as const) {
            it(`N=${N}: dispatch creates ${N} workspaces with distinct change_ids`, () => { /* ... */ });
            it(`N=${N}: clean fan-in returns merged.length===${N}, conflicted===false`, () => { /* ... */ });
            it(`N=${N}: TEST-14 — post-fanIn divergent() revset is empty`, () => {
                const r = execSync(
                    `jj --repository ${dir} log -r 'divergent()' --no-graph -T 'change_id ++ "\\n"'`,
                    { cwd: dir, encoding: 'utf-8' },
                );
                expect(r.trim()).toBe('');
            });
            it(`N=${N}: post-fanIn surplusBookmarks is empty`, () => { /* ... */ });
        }

        it('one in-tree conflict: conflicted===true, conflictedPaths populated, queue entry reason="merge-in-tree-conflict"', () => { /* ... */ });
        it('one crashed worker: queue entry reason="crashed-with-uncommitted-work"', () => { /* ... */ });
    },
);
```

**In-tree-conflict fixture mechanism** (RESEARCH §"Forcing an In-Tree Conflict in a Fixture"):
```
1. seed/CONFLICT.txt = "base content\n" committed at @-
2. dispatch N=2 workspaces — both fork from same parent slot
3. workspace 1: writeFile CONFLICT.txt = "version A\n"; jj squash -B @ -k -m "subagent 1 work"
4. workspace 2: writeFile CONFLICT.txt = "version B\n"; jj squash -B @ -k -m "subagent 2 work"
5. fanIn() → N-parent jj new → in-tree conflict on CONFLICT.txt
```

**Crashed-worker fixture mechanism** (model: `jj-reap.test.ts:115-151`):
```
1. In workspace path: writeFile crashed-work.txt; execSync('jj st', { cwd: wsPath }) to trigger auto-snapshot.
2. Pass results=[{ agentId, exitCode: 1, stderr: 'crashed' }] to fanIn.
3. Assert IncompleteWorkEntry.reason === 'crashed-with-uncommitted-work' in queue.
```

---

### `WAVE_WORKTREE_MANIFEST` schema (additive fields — MOD)

**Reader analog:** `get-shit-done/bin/lib/worktree-safety.cjs:319-342` (`normalizeCleanupManifestEntry`).

**Existing reader excerpt** (`worktree-safety.cjs:319-342`):
```javascript
function normalizeCleanupManifestEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const worktreePath = typeof entry.worktree_path === 'string' ? entry.worktree_path
    : (typeof entry.path === 'string' ? entry.path : '');
  const branch = typeof entry.branch === 'string' ? entry.branch : '';
  const expectedBase = typeof entry.expected_base === 'string' ? entry.expected_base : '';
  const mainBookmark = typeof entry.main_bookmark === 'string' && entry.main_bookmark.length > 0
    ? entry.main_bookmark : null;
  if (!worktreePath || !branch || !expectedBase) return null;
  if (!/^worktree-agent-[A-Za-z0-9._/-]+$/.test(branch)) return null;
  return {
    agent_id: typeof entry.agent_id === 'string' ? entry.agent_id : null,
    worktree_path: worktreePath,
    branch,
    expected_base: expectedBase,
    main_bookmark: mainBookmark,
  };
}
```

**Convention to follow:** new fields (`plan_id`, `backend`) tolerate `undefined` on read (the reader returns only what it explicitly extracts; unknown fields drop silently per A5 in RESEARCH §"Assumptions Log"). The SDK-side writer (`performJjParallelDispatch`) emits the full new shape; the cjs reader is unchanged until Phase 11.

**SDK-side writer pattern** (no direct analog — net-new; Phase 9 owns this writer):
```typescript
// inside performJjParallelDispatch:
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Allocate a fresh manifest path to avoid race with the workflow-markdown
// writer at execute-phase.md:528-651 (Open Q4: phased rollout — workflow
// writer collapses in Phase 11).
const manifestDir = mkdtempSync(join(tmpdir(), `gsd-wave-manifest-`));
const manifestPath = join(manifestDir, 'wave-worktree-manifest.json');
writeFileSync(manifestPath, JSON.stringify({
    worktrees: slots.map((slot, i) => ({
        agent_id: opts.plan[i].agentId,
        plan_id: opts.plan[i].planId,                            // NEW (VCS-19)
        backend: 'jj' as const,                                  // NEW (VCS-19)
        worktree_path: slot.workspacePath,
        branch: `worktree-agent-${opts.plan[i].agentId}`,        // existing regex constraint
        expected_base: slot.headChange,
        main_bookmark: opts.mainBookmark,
    })),
}, null, 2), 'utf-8');
```

---

## Shared Patterns

### Sidecar discipline (UPSTREAM-02)
**Source:** `sdk/src/vcs/jj/octopus.ts:39-47` and `sdk/src/vcs/jj/reap.ts:33-41`
**Apply to:** `sdk/src/vcs/jj/parallel.ts`, `sdk/src/vcs/jj/conflict-paths.ts`
**Excerpt:**
```typescript
function jjArgvFlags(repo: string): string[] {
    return ['--repository', repo, '--no-pager', '--color', 'never', '--quiet'];
}
// File MUST NOT import from `backends/jj.ts`.
```

### Frozen-JSON return (Single SDK Shape Law)
**Source:** `sdk/src/vcs/backends/jj.ts:1372` (top-level adapter freeze); `sdk/src/vcs/types.ts:290-321` rule.
**Apply to:** `ParallelDispatchHandle`, `FanInResult`, every `Object.freeze` return path in `parallel.ts`.
**Excerpt:**
```typescript
return Object.freeze({ ... }) satisfies <Type>;
// inner arrays/objects: Object.freeze each element too.
```

### `vcsExec` sole subprocess primitive (no raw `spawnSync`)
**Source:** `sdk/src/vcs/jj/octopus.ts:59`, `sdk/src/vcs/jj/reap.ts:63`
**Apply to:** every subprocess call in `parallel.ts`, `conflict-paths.ts`, reap-classifier-extension.
**Excerpt:**
```typescript
const r = vcsExec(mainRepoRoot, 'jj', args);
if (r.exitCode !== 0) {
    throw new Error(`<context>: ${r.stderr || r.stdout}`);
}
```

### `expr.rev(...)` brand-wrap for runtime change_ids
**Source:** `sdk/src/vcs/jj/octopus.ts:319`
**Apply to:** any handoff of a resolved change_id into adapter API expecting `RevisionExpr`.
**Excerpt:**
```typescript
vcs.workspace.add({ ..., baseRef: expr.rev(headChange) });
```

### Test fixture Pattern A + B
**Source:** `sdk/src/vcs/__tests__/jj-octopus.test.ts:31-74`
**Apply to:** `parallel.contract.test.ts`
**Excerpt:** see Test analog section above. Never `retry: N`; never `describe.skip`.

### `VcsNotImplementedError` for stubs
**Source:** `sdk/src/vcs/types.ts:573-578` (class); `sdk/src/vcs/backends/jj.ts:125, 166, 789, 1023` (callsite idiom — 8 instances).
**Apply to:** `backends/git.ts` `parallel.dispatch` + `parallel.fanIn` stubs.
**Excerpt:**
```typescript
throw new VcsNotImplementedError(
    'workspace.parallel.dispatch is not yet implemented on the git backend; Phase 10 ships the body',
);
```

### Validate-then-cast on parser tightening
**Source:** `sdk/src/vcs/jj/incomplete-work.ts:60-69` (existing malformed-line throw).
**Apply to:** `incomplete-work.ts` reason-validation extension.
**Excerpt:**
```typescript
if (!KNOWN_REASONS.has(raw as IncompleteWorkEntry['reason'])) {
    throw new Error(`incomplete-work.md: unknown reason "${raw}" in ${p}: ${line.slice(0,120)}`);
}
```

### change_id-only on cross-backend surface (lint-vcs-no-commit-id enforced)
**Source:** `sdk/src/vcs/backends/jj.ts:343` mergeBase JSDoc; `.planning/STATE.md` decision record.
**Apply to:** all PARALLEL-related types in `types.ts`; especially `ParallelDispatchHandle.workspaces[].baseRev`.
**Excerpt** (JSDoc canonical text per D-14):
```
change_id on jj; stable across `jj rebase`.
commit_id on git; stable across `git rebase`.
Cross-backend semantics: rebase-stable revision pointer to the parent change
the workspace forked from. (PARALLEL-05, D-14.)
```

### Refname validation before bookmark writes
**Source:** `sdk/src/vcs/backends/jj.ts:1209, 1226` — `validateRefname` calls before `jj bookmark set` / `delete`.
**Apply to:** `parallel.ts` agent-bookmark creation (eager-at-dispatch per RESEARCH Open Q1) and batched bookmark delete in fanIn.
**Excerpt:**
```typescript
validateRefname(opts.mainBookmark);
const setRes = vcsExec(cwd, 'jj', jjArgv('bookmark', 'set', opts.mainBookmark, '-r', '@'));
```

### `--` end-of-options separator before user-influenced positional
**Source:** `sdk/src/vcs/backends/jj.ts:1052-1062, 1080-1082, 1230`
**Apply to:** `parallel.ts` batched `jj bookmark delete` invocation.
**Excerpt:**
```typescript
vcsExec(cwd, 'jj', [...jjArgvFlags(cwd), 'bookmark', 'delete', '--', ...agentBookmarkNames]);
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | — | — | Every Phase 9 file has a direct in-tree precedent. The composition layer is pure arrangement over existing primitives. |

---

## Metadata

**Analog search scope:**
- `sdk/src/vcs/jj/*` (5 sidecars: octopus, reap, incomplete-work, lock, pre-push)
- `sdk/src/vcs/backends/{jj,git}.ts` (workspace blocks; freeze patterns; stub idioms)
- `sdk/src/vcs/types.ts` (interface placement, sub-namespace shape, error classes)
- `sdk/src/vcs/__tests__/{jj-octopus,jj-reap}.test.ts` (fixture templates)
- `get-shit-done/bin/lib/worktree-safety.cjs` (manifest reader)

**Files scanned (direct Read):** 8 production + 2 test + 1 cjs reader
**Pattern extraction date:** 2026-05-15
**Confidence:** HIGH — every excerpt verified against a current in-tree file with explicit line citations.

## PATTERN MAPPING COMPLETE
