# Phase 15: Adapter surface extensions + rename - Pattern Map

**Mapped:** 2026-05-24 (post-Phase-14.1 codebase; line numbers verified live)
**Files analyzed:** 16 new/modified (8 SDK source, 3 CLI registration, 1 audit script, 1 audit sidecar JSON, 3 test files)
**Analogs found:** 16 / 16 (every new/modified file has a verified analog)

**Verification stance:** Every line number in this map was re-read against the live source after Phase 14.1 landed (commits `tvkykqy` + `vlmlsqq` + `rwrpszp`, 2026-05-24). The prior PATTERNS.md drifted on `FanInResult` (cited :539 but live state is :552-560 with 6 fields) and on the parallel.ts freeze idiom. All anchors below are direct quotes from current files.

## File Classification

| New/Modified File | Plan | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|------|-----------|----------------|---------------|
| `sdk/src/vcs/types.ts` | 15.01, 15.02, 15.03, 15.04 | type-contract / interface | n/a (declarations) | self (existing `VcsRefs` + `FanInResult` shapes) | exact (modify in-place) |
| `sdk/src/vcs/backends.ts` | 15.01, 15.02, 15.03, 15.04 | capability-matrix string-literal map | n/a (declarations) | self (existing matrix rows at :49-138) | exact (string-key add/flip) |
| `sdk/src/vcs/backends/jj.ts` | 15.01, 15.02, 15.03, 15.04 | adapter backend (jj wire-in) | request-response (vcsExec sync) | self (existing `rootCommits` body :964-980; `parallel` wire-in :1257-1264) | exact |
| `sdk/src/vcs/backends/git.ts` | 15.01, 15.02, 15.03, 15.04 | adapter backend (git wire-in) | request-response (vcsExec sync) | self (existing `rootCommits` body :526-564; `parallel` wire-in :738-745) | exact |
| `sdk/src/vcs/jj/parallel.ts` | 15.04 | UPSTREAM-02 sidecar (orchestration) | request-response (vcsExec sync) | self (`performJjParallelFanIn` :287-508 — sibling export) | exact |
| `sdk/src/vcs/git/parallel.ts` | 15.04 | adapter-internal sidecar (git orchestration) | request-response (vcsExec sync) | self (`performGitParallelFanIn`) | exact |
| `sdk/src/vcs/jj/workspace-cleanup.ts` | 15.04 Wave 1 | UPSTREAM-02 sidecar (NEW helper) | filesystem-I/O + vcsExec | `sdk/src/vcs/jj/conflict-paths.ts` (template) + `sdk/src/vcs/jj/reap.ts:170-189` (per-workspace teardown body) | role-match + body-pattern reuse |
| `sdk/src/query/workspace-parallel-cancel.ts` | 15.04 | CLI bridge (query handler) | request-response (stdin/file → adapter call → JSON envelope) | `sdk/src/query/workspace-parallel-fan-in.ts` | exact (same `--handle @-/@<path>` shape) |
| `sdk/src/query/command-static-catalog-domain.ts` | 15.04 | CLI registration (catalog) | n/a (table entry) | self (existing :71-74 dispatch + fan-in entries) | exact |
| `sdk/src/query/command-manifest.non-family.ts` | 15.04 | CLI registration (manifest) | n/a (table entry) | self (existing :61-62 dispatch + fan-in entries) | exact |
| `sdk/src/query/command-aliases.generated.ts` | 15.04 | CLI registration (aliases) | n/a (table entry) | self (existing :156-157 dispatch + fan-in entries) | exact |
| `scripts/audit-root-commits-rename.cjs` | 15.01 | one-shot audit script (stdout-only) | batch / transform | `scripts/audit-id-namespace.cjs` (v1.2 audit precedent) | exact (Phase 8 rename audit precedent) |
| `.planning/phases/15-adapter-surface-extensions-rename/rootCommits-rename-audit.json` | 15.01 | sidecar audit JSON artifact | n/a (data) | `.planning/intel/id-namespace-audit.json` (v1.2 schema precedent) | role-match (D-09 schema extends precedent with `byExtension` + `specialCases` + `idempotencyHash`) |
| `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts` (MODIFIED — new describe blocks) | 15.04 | test (vitest) | event-driven (test runner) | self (`PARALLEL-08 SC5 scenario 1` describe at :474-545) | exact (SC5 pattern is the canonical template) |
| `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts` (MODIFIED — new describe blocks) | 15.04 | test (vitest) | event-driven (test runner) | self (SC5 git counterpart at :737-958 per RESEARCH §"Setup + ScrarOnly Live SC5 ref") | exact |
| `sdk/src/vcs/__tests__/adapter-contract.test.ts` (MODIFIED — new it blocks) | 15.02, 15.03 | test (vitest cross-backend) | event-driven (test runner) | self (existing `describe.for(selectedBackends())` shape :28-37) | exact |
| `sdk/src/vcs/__tests__/jj-workspace-cleanup.test.ts` (NEW) | 15.04 Wave 1 | test (vitest, jj-only) | event-driven (test runner) | `sdk/src/vcs/__tests__/jj-id-alphabet-probe.test.ts` (small focused jj-skipIf shape) | exact (single-purpose jj sidecar probe template) |

## Pattern Assignments

### `sdk/src/vcs/types.ts` (type-contract, 4 plans amend in-place)

**Analog:** self — Phase 14.1's `mainBookmarks?: readonly string[]` add at :478 + :515 is the most recent in-place edit precedent.

**Live anchors verified (read against current source 2026-05-24):**
- `VcsRefs` interface: lines 336-367 (insertion site for new `idAlphabet` property + `matchPrefix` method; rename target `rootCommits` at :363).
- `VcsWorkspaceParallel` interface: lines 453-456 (add `cancel(handle): CancelResult` as the third method after `fanIn`).
- `ParallelDispatchHandle` interface: lines 504-537 (cancel's input shape; carries `mainBookmarks?: readonly string[]` at :515 post-14.1).
- `FanInResult` interface: lines 552-560 (6-field shape; precedent for `failedReaped` + `surplusBookmarks` field names that `CancelResult` mirrors).
- Insertion point for new `CancelResult` interface: after `FanInResult` at line 560, before the `__vcsTestOnly` block at :562.

**VcsRefs pattern to extend** (lines 336-367 verbatim):
```typescript
export interface VcsRefs {
  readonly head: RevisionExpr;
  readonly parent: RevisionExpr;
  bookmarks: VcsBookmarks;
  // ... existing methods including currentBookmarks, mergeBase, etc.
  resolveShort(rev: RevisionExpr): string;
  countCommits(opts: { rev?: RevisionExpr }): number;
  rootCommits(opts: { rev?: RevisionExpr }): string[];  // ← 15.01 RENAME to rootRevisions
  exists(rev: RevisionExpr): boolean;
  isIgnored(path: string): boolean;
  remotes(): string[];
}
```

**Hard-rename precedent (Phase 14.1 commit `tvkykqy`):** Single atomic commit touched `mainBookmark: string` → `mainBookmarks?: readonly string[]` across 15 sites. TSC closure was the audit trail; no deprecation alias. Plan 15.01 follows the same atomic-commit-after-audit pattern.

**Per-plan additions to VcsRefs:**
- 15.02: `readonly idAlphabet: string;` (mirror `readonly head: RevisionExpr` shape at :337).
- 15.03: `matchPrefix(id: RevisionExpr, prefix: string): boolean;` (mirror `exists(rev): boolean` shape at :364).

**Per-plan additions to VcsWorkspaceParallel** (lines 453-456):
```typescript
export interface VcsWorkspaceParallel {
  dispatch(opts: ParallelDispatchOpts): ParallelDispatchHandle;
  fanIn(handle: ParallelDispatchHandle, results: readonly ParallelAgentResult[]): FanInResult;
  // 15.04 ADD AS THIRD METHOD:
  cancel(handle: ParallelDispatchHandle): CancelResult;
}
```

**New CancelResult interface** (15.04, ADD after line 560 — mirrors FanInResult shape):
```typescript
// Lifted verbatim from FanInResult :552-560 styling
export interface CancelResult {
  abandoned: readonly string[];
  failedReaped: readonly string[];     // ← name mirrors FanInResult :558
  surplusBookmarks: readonly string[]; // ← name mirrors FanInResult :559
  surplusWorkspaces: readonly string[];
}
```

---

### `sdk/src/vcs/backends.ts` (capability matrix, 4 plans)

**Analog:** self — existing `BACKENDS_AVAILABLE_FOR_VERB` table at lines 42-138.

**Critical: TSC does NOT catch the string-key rename** (Pitfall 1; v1.2 retro CR-01 precedent). The `'refs.rootCommits'` literal at line 79 must be flipped to `'refs.rootRevisions'` in the same commit as the TS interface rename, or runtime fails on first call.

**Live anchor verified — line 79 today:**
```typescript
// sdk/src/vcs/backends.ts:79 (current state — Plan 15.01 flips this)
'refs.rootCommits': Object.freeze(['git', 'jj-colocated'] as const),
```

**Existing matrix rows around the insertion point** (lines 76-82):
```typescript
'refs.currentBookmarks': Object.freeze(['git', 'jj-colocated'] as const),
'refs.resolveShort':     Object.freeze(['git', 'jj-colocated'] as const),
'refs.countCommits':     Object.freeze(['git', 'jj-colocated'] as const),
'refs.rootCommits':      Object.freeze(['git', 'jj-colocated'] as const), // ← 15.01 flip key
'refs.exists':           Object.freeze(['git', 'jj-colocated'] as const),
'refs.isIgnored':        Object.freeze(['git'] as const), // jj-side throws VcsNotImplementedError
'refs.remotes':          Object.freeze(['git', 'jj-colocated'] as const),
```

**Per-plan additions to capability matrix:**
- 15.01: rename string-literal key `'refs.rootCommits'` → `'refs.rootRevisions'`.
- 15.02: add `'refs.idAlphabet': Object.freeze(['git', 'jj-colocated'] as const),`.
- 15.03: add `'refs.matchPrefix': Object.freeze(['git', 'jj-colocated'] as const),`.
- 15.04: add `'workspace.parallel.cancel': Object.freeze(['git', 'jj-colocated'] as const),`.

---

### `sdk/src/vcs/backends/jj.ts` (jj backend, 4 plans)

**Analog:** self — existing `rootCommits` body at :964-980; existing `parallel` namespace wire-in at :1257-1264.

**Live anchors verified:**
- `const refs: VcsRefs = Object.freeze({...})` block opens at line 776 (new `idAlphabet` + `matchPrefix` insertions go here).
- `rootCommits` body lives at lines 964-980 inside the refs freeze block (15.01 renames in place).
- `parallel: Object.freeze({...})` block at lines 1257-1264 (15.04 adds `cancel` as third entry).

**Existing rootCommits body** (verbatim from :964-980):
```typescript
rootCommits: ({ rev }: { rev?: RevisionExpr }): string[] => {
  const target = rev ? toJjRev(rev) : '@';
  const args = jjArgv(
    'log',
    '-r',
    `root() & ::${target}`,
    '-T',
    'change_id ++ "\\n"',
    '--no-graph',
  );
  const r = vcsExec(cwd, 'jj', args);
  if (r.exitCode !== 0) return [];
  return r.stdout
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
},
```

**Existing parallel namespace** (verbatim from :1255-1264) — 15.04 adds `cancel` as third entry:
```typescript
// Phase 9 (VCS-16, PARALLEL-01/02): cross-backend parallel namespace.
// Delegates to UPSTREAM-02 sidecar in sdk/src/vcs/jj/parallel.ts.
parallel: Object.freeze({
  dispatch: (opts: ParallelDispatchOpts): ParallelDispatchHandle =>
    performJjParallelDispatch({ mainRepoRoot: cwd, vcs: { workspace }, ...opts }),
  fanIn: (
    handle: ParallelDispatchHandle,
    results: readonly ParallelAgentResult[],
  ): FanInResult => performJjParallelFanIn(cwd, handle, results),
  // 15.04 ADD AS THIRD ENTRY:
  // cancel: (handle: ParallelDispatchHandle): CancelResult =>
  //   performJjParallelCancel(cwd, handle),
}),
```

**Per-plan body additions inside the refs freeze block:**
- 15.01: rename `rootCommits:` → `rootRevisions:` (body unchanged).
- 15.02: add `idAlphabet: 'k-z',` near top of refs block (mirror :337 `readonly head` styling).
- 15.03: add `matchPrefix: (id, prefix) => { ... }` body using k-z alphabet, lower-only, throws on wrong-alphabet/empty.

---

### `sdk/src/vcs/backends/git.ts` (git backend, 4 plans)

**Analog:** self — existing `rootCommits` body at :526; existing `parallel` namespace wire-in at :738-745.

**Live anchors verified:**
- `const refs = Object.freeze({...})` block opens at line 554 (new `idAlphabet` + `matchPrefix` insertions go here).
- `rootCommits` declared as `const rootCommits = (opts) => {...}` at line 526; spread into refs at line 564 via short-hand `rootCommits,` (this short-hand will need renaming at BOTH definition and reference sites).
- `parallel: Object.freeze({...})` block at lines 738-745 (15.04 adds `cancel` as third entry).

**Existing git parallel namespace** (verbatim from :736-745) — mirror jj for 15.04:
```typescript
// Phase 10 (VCS-18, PARALLEL-01/02): cross-backend parallel namespace.
// Delegates to adapter-internal sidecar in sdk/src/vcs/git/parallel.ts.
parallel: Object.freeze({
  dispatch: (opts: ParallelDispatchOpts): ParallelDispatchHandle =>
    performGitParallelDispatch({ mainRepoRoot: cwd, vcs: { workspace }, ...opts }),
  fanIn: (
    handle: ParallelDispatchHandle,
    results: readonly ParallelAgentResult[],
  ): FanInResult => performGitParallelFanIn(cwd, handle, results),
  // 15.04 ADD AS THIRD ENTRY:
  // cancel: (handle: ParallelDispatchHandle): CancelResult =>
  //   performGitParallelCancel(cwd, handle),
}),
```

**Per-plan additions:**
- 15.01: rename `const rootCommits = ...` at :526 → `const rootRevisions = ...`; rename short-hand reference at :564 → `rootRevisions,`.
- 15.02: add `idAlphabet: '0-9a-f',` near top of refs block (line ~555).
- 15.03: add `matchPrefix: (id, prefix) => { ... }` body using `[0-9a-fA-F]` alphabet, case-insensitive, throws on wrong-alphabet/empty.

---

### `sdk/src/vcs/jj/parallel.ts` (UPSTREAM-02 sidecar — 15.04 adds `performJjParallelCancel` export)

**Analog:** self — `performJjParallelFanIn` (lines 287-508) is the sibling export pattern. The frozen pure-JSON return shape at lines 500-507 is the precedent for `CancelResult`.

**Live anchors verified:**
- File header (UPSTREAM-02 sidecar discipline notes): lines 1-46.
- Imports including `vcsExec` from `'../exec.js'` + `existsSync`/`readdirSync` from `'node:fs'`: lines 48-65.
- `jjArgvFlags` inline helper: lines 67-75 (verbatim copy from `octopus.ts:39-47`).
- `validateAgentId` inline regex validator: lines 105-111.
- `validateMainBookmark` inline regex validator: lines 120-130 (post-14.1; used by fan-in two-pass loop).
- `derivePhaseRoot` exported helper: lines 143-150 (cancel can reuse; do not re-derive).
- Handle construction with **post-14.1 freeze idiom** at line 251: `mainBookmarks: Object.freeze([...(mainBookmarks ?? [])]) as readonly string[],`
- Two-pass validate-then-mutate fan-in loop at lines 428-449 (Pattern 7; precedent for any cancel pre-flight validation).
- FanInResult frozen pure-JSON return at lines 500-507 (Pattern 8; canonical `CancelResult` template).

**FanInResult return shape — verbatim from :500-507** (15.04 mirrors this for `CancelResult`):
```typescript
return Object.freeze({
  merged: Object.freeze(merged.slice()) as readonly string[],
  conflicted,
  conflictedPaths: Object.freeze(conflictedPaths.slice()) as readonly string[],
  incompleteQueued,
  failedReaped: Object.freeze(failedReaped.slice()) as readonly string[],
  surplusBookmarks: Object.freeze(surplusBookmarks.slice()) as readonly string[],
}) satisfies FanInResult;

// CancelResult mirror to add as new export:
return Object.freeze({
  abandoned: Object.freeze(abandoned.slice()) as readonly string[],
  failedReaped: Object.freeze(failedReaped.slice()) as readonly string[],
  surplusBookmarks: Object.freeze(surplusBookmarks.slice()) as readonly string[],
  surplusWorkspaces: Object.freeze(surplusWorkspaces.slice()) as readonly string[],
}) satisfies CancelResult;
```

**Two-pass validate-then-mutate idiom (verbatim from :428-449)** — apply if cancel needs pre-flight validation:
```typescript
const mainBookmarks = handle.mainBookmarks ?? [];
if (mainBookmarks.length > 0) {
  // Pass 1: validate every name. Throws on first invalid; no side effects yet.
  for (const name of mainBookmarks) {
    validateMainBookmark(name);
  }
  // Pass 2: advance each. Partial-state on mid-iteration failure is documented
  // above; no atomic rollback at this layer.
  for (const name of mainBookmarks) {
    const setArgs = [
      ...jjArgvFlags(mainRepoRoot),
      'bookmark', 'set', name, '-r', '@',
    ];
    const setRes = vcsExec(mainRepoRoot, 'jj', setArgs);
    if (setRes.exitCode !== 0) {
      throw new Error(
        `parallel.fanIn: main-bookmark advance (${name}) failed: ${setRes.stderr || setRes.stdout}`,
      );
    }
  }
}
```

**`performJjParallelCancel` signature (15.04 NEW export):**
```typescript
import { cleanupSubagentWorkspaces } from './workspace-cleanup.js';

export function performJjParallelCancel(
  mainRepoRoot: string,
  handle: ParallelDispatchHandle,
): CancelResult {
  // body delegates to cleanupSubagentWorkspaces helper +
  // optional surplus-bookmark sweep
}
```

---

### `sdk/src/vcs/git/parallel.ts` (adapter-internal sidecar — 15.04 adds `performGitParallelCancel` export)

**Analog:** self — `performGitParallelFanIn` is the sibling pattern.

**Live anchors verified:**
- File header (D-01..D-16 contract block): lines 1-81.
- Imports including `vcsExec`, `validateRefname` (from `refs-validator.js`), `appendIncomplete` (from `../jj/incomplete-work.js`), `derivePhaseRoot` (from `../jj/parallel.js`): lines 83-98.
- Inline `validateAgentId` regex validator: lines 113-119 (UPSTREAM-02-style copy of jj/parallel.ts:105-111).

**Cancel body composition** (uses `worktree remove --force` + `branch -D` — no shared helper because git's `worktree remove --force` already handles tree cleanup; orphan-dirs are a jj-only problem per PROJECT.md OOS):
```typescript
export function performGitParallelCancel(
  mainRepoRoot: string,
  handle: ParallelDispatchHandle,
): CancelResult {
  // Inline teardown. Per-workspace:
  //   vcsExec(mainRepoRoot, 'git', ['worktree', 'remove', '--force', ws.path])
  //   vcsExec(mainRepoRoot, 'git', ['branch', '-D', '--', `worktree-agent-${ws.agentId}`])
  // ...
}
```

---

### `sdk/src/vcs/jj/workspace-cleanup.ts` (NEW UPSTREAM-02 sidecar — 15.04 Wave 1)

**Analog (template):** `sdk/src/vcs/jj/conflict-paths.ts` — sidecar header shape, `jjArgvFlags` inline copy, single exported helper function.
**Analog (body pattern):** `sdk/src/vcs/jj/reap.ts:174-189` — `jj workspace forget` + `rmSync` per-workspace teardown loop.

**conflict-paths.ts template — verbatim from :1-30** (sidecar header + UPSTREAM-02 pattern):
```typescript
/**
 * sdk/src/vcs/jj/conflict-paths.ts — Phase 9 (VCS-17, UPSTREAM-02)
 *
 * [... contract block ...]
 *
 * UPSTREAM-02 sidecar discipline: this file does NOT import from
 * `backends/jj.ts`. The mandatory-flags prefix is inlined verbatim per the
 * `octopus.ts:39-47` / `reap.ts:33-41` template.
 */

import { vcsExec } from '../exec.js';

/**
 * Inline mandatory-flags prefix — copy of `backends/jj.ts::jjArgv`'s flag
 * portion. UPSTREAM-02: avoids the backends import.
 */
function jjArgvFlags(repo: string): string[] {
  return ['--repository', repo, '--no-pager', '--color', 'never', '--quiet'];
}
```

**reap.ts body pattern — verbatim from :170-189** (per-workspace teardown):
```typescript
const forgetArgs = [
  ...jjArgvFlags(opts.mainRepoRoot),
  'workspace', 'forget', '--', entry.name,
];
const forgetRes = vcsExec(opts.mainRepoRoot, 'jj', forgetArgs);
if (forgetRes.exitCode !== 0) {
  throw new Error(
    `reap: jj workspace forget ${entry.name} failed: ${forgetRes.stderr || forgetRes.stdout}`,
  );
}
// Pitfall 3: jj workspace forget does NOT remove the on-disk dir.
// reap rm's it here for the empty-head case so the orchestrator
// observes a clean tree.
if (existsSync(entry.path)) {
  rmSync(entry.path, { recursive: true, force: true });
}
```

**Cancel-side adaptation (key divergences from reap):**
1. Cancel does NOT throw on forget failure — best-effort push to `failedReaped[]` only on `rm-rf` failure (the visible state-leak surface). Reap's "throw on forget failure" matches its strict empty-head contract; cancel's idempotency contract (D-03/D-06) requires soft-fail.
2. Cancel does NOT delegate to `enumerateConflictedPaths` or `hasInTreeConflict` — cancel tears down regardless of conflict state (D-04 contract divergence: "tear down everything explicitly requested" vs reap's W3(a) "leave conflicted workspaces for inspection").
3. Cancel uses `try/catch` around `rmSync` (not bare call) — pushes the workspace name to `failedReaped[]` on permission errors. `force: true` makes ENOENT already a no-op.

**Helper signature (RECONCILIATION FLAGGED — CONTEXT D-05 literal vs RESEARCH A1 recommendation):**
- **CONTEXT D-05 literal:** `cleanupSubagentWorkspaces(phaseRoot: string, phaseNumber: number): CleanupSubagentWorkspacesResult`
- **RESEARCH A1 + Open Q1 recommendation:** `cleanupSubagentWorkspaces(mainRepoRoot: string, phaseNumber: number, workspaces?: readonly { name: string; path: string }[]): CleanupSubagentWorkspacesResult`

**Why the divergence matters:** Per Pitfall 4 (RESEARCH §"Common Pitfalls"), `dispatch()` allows per-item `workspacePath: '/tmp/...'` overrides; pure `readdirSync(phaseRoot/.claude/jj-workspaces/)` enumeration misses overridden paths. The Handle's `workspaces[]` array is the authoritative source. The 3-arg variant lets `cancel(handle)` pass the authoritative list while `dogfood-restore.sh` (Phase 16 consumer) falls back to `readdirSync` when no Handle survived the restore. Additionally `jjArgvFlags + jj workspace forget` need the **repo root**, not the phase root (which sits 3 levels deep inside `.planning/phases/{N-slug}/`).

**Planner decision required:** Pick 2-arg (matches CONTEXT D-05 literally; brittle to phase-dir layout — body must derive `mainRepoRoot` via `join(phaseRoot, '..', '..', '..')`) OR 3-arg + rename to `mainRepoRoot` (resolves Pitfall 4 + matches conflict-paths.ts/reap.ts signature pattern). Record the choice in plan 15.04 CONTEXT amendment so downstream consumers (Phase 16 CLEANUP-02) stay aligned.

**Octopus path convention (live anchor):** `sdk/src/vcs/jj/octopus.ts:300-302`:
```typescript
const workspaceName = `phase-${phaseTag}-subagent-${opts.idx}`;
// default path:
opts.workspacePath ?? join(mainRepoRoot, '.claude/jj-workspaces', workspaceName);
```

---

### `sdk/src/query/workspace-parallel-cancel.ts` (NEW CLI bridge — 15.04)

**Analog:** `sdk/src/query/workspace-parallel-fan-in.ts` (1-128) — same `--cwd` + `--handle @-/@<path>` flag set, same `resolveFileOrStdin` helper shape, same `QueryHandler` export shape, same `{ data: result }` flat envelope.

**Verbatim header + imports from workspace-parallel-fan-in.ts:1-41:**
```typescript
/**
 * sdk/src/query/workspace-parallel-fan-in.ts — Phase 11 plan 02 Task 2b
 *
 * CLI bridge for `vcs.workspace.parallel.fanIn`. [...]
 *
 * Flags:
 *   --cwd <path>        optional; defaults to projectDir
 *   --handle <input>    required: ParallelDispatchHandle as JSON.
 *                       "@-"       → read from stdin
 *                       "@<path>"  → read from file
 *                       (no inline string form — per RESEARCH Open Q2 RESOLVED)
 * [...]
 */

import { readFileSync } from 'node:fs';
import { createVcsAdapter } from '../vcs/index.js';
import type {
  ParallelAgentResult,
  ParallelDispatchHandle,
} from '../vcs/types.js';
import type { QueryHandler } from './utils.js';
```

**Verbatim helper from workspace-parallel-fan-in.ts:43-55** (cancel uses identical shape minus the inline-rejection comment can stay the same):
```typescript
function resolveFileOrStdin(raw: string): string {
  if (raw === '@-') {
    return readFileSync(0, 'utf-8');
  }
  if (raw.startsWith('@')) {
    return readFileSync(raw.slice(1), 'utf-8');
  }
  throw new Error(
    `expected @<path> or @- but got inline string (inline JSON form is not accepted)`,
  );
}
```

**Verbatim handler shape from workspace-parallel-fan-in.ts:57-127** — cancel mirrors with no `--results` flag:
```typescript
export const workspaceParallelCancelQuery: QueryHandler = async (args, projectDir) => {
  let cwd = projectDir;
  let handleRaw: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) {
      cwd = args[++i];
    } else if (args[i] === '--handle' && args[i + 1]) {
      handleRaw = args[++i];
    }
  }

  if (handleRaw === undefined) {
    return { data: { ok: false, reason: 'handle_required' } };
  }

  let handle: ParallelDispatchHandle;
  try {
    const handleText = resolveFileOrStdin(handleRaw);
    handle = JSON.parse(handleText);
  } catch (err) {
    return {
      data: {
        ok: false,
        reason: 'handle_json_parse_failed',
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }

  const vcs = createVcsAdapter(cwd);
  const cancelResult = vcs.workspace.parallel.cancel(handle);

  return { data: cancelResult };
};
```

---

### `sdk/src/query/command-static-catalog-domain.ts` (CLI registration site 1 of 3 — 15.04)

**Analog:** self — existing dispatch + fan-in entries at lines 71-74.

**Verbatim existing entries (verified live):**
```typescript
// sdk/src/query/command-static-catalog-domain.ts:21-22 (imports)
import { workspaceParallelDispatchQuery } from './workspace-parallel-dispatch.js';
import { workspaceParallelFanInQuery } from './workspace-parallel-fan-in.js';
// 15.04 ADD: import { workspaceParallelCancelQuery } from './workspace-parallel-cancel.js';

// sdk/src/query/command-static-catalog-domain.ts:71-74 (catalog entries)
['workspace.parallel.dispatch', workspaceParallelDispatchQuery],
['workspace parallel.dispatch', workspaceParallelDispatchQuery],
['workspace.parallel.fan-in', workspaceParallelFanInQuery],
['workspace parallel.fan-in', workspaceParallelFanInQuery],
// 15.04 ADD (after :74):
// ['workspace.parallel.cancel', workspaceParallelCancelQuery],
// ['workspace parallel.cancel', workspaceParallelCancelQuery],
```

---

### `sdk/src/query/command-manifest.non-family.ts` (CLI registration site 2 of 3 — 15.04)

**Analog:** self — existing dispatch + fan-in entries at lines 61-62.

**Verbatim existing entries (verified live):**
```typescript
// sdk/src/query/command-manifest.non-family.ts:60-62
{ canonical: 'workspace.assert-dispatched-cwd', aliases: ['workspace assert-dispatched-cwd'], mutation: false, outputMode: 'json' },
{ canonical: 'workspace.parallel.dispatch',     aliases: ['workspace parallel.dispatch'],     mutation: true,  outputMode: 'json' },
{ canonical: 'workspace.parallel.fan-in',       aliases: ['workspace parallel.fan-in'],       mutation: true,  outputMode: 'json' },
// 15.04 ADD (after :62, matching aligned column-format of the existing rows):
// { canonical: 'workspace.parallel.cancel',     aliases: ['workspace parallel.cancel'],       mutation: true,  outputMode: 'json' },
```

---

### `sdk/src/query/command-aliases.generated.ts` (CLI registration site 3 of 3 — 15.04)

**Analog:** self — existing dispatch + fan-in entries at lines 156-157.

**Verbatim existing entries (verified live):**
```typescript
// sdk/src/query/command-aliases.generated.ts:155-157
{ canonical: 'workspace.assert-dispatched-cwd', aliases: ['workspace assert-dispatched-cwd'], mutation: false },
{ canonical: 'workspace.parallel.dispatch', aliases: ['workspace parallel.dispatch'], mutation: true },
{ canonical: 'workspace.parallel.fan-in', aliases: ['workspace parallel.fan-in'], mutation: true },
// 15.04 ADD (after :157):
// { canonical: 'workspace.parallel.cancel', aliases: ['workspace parallel.cancel'], mutation: true },
```

---

### `scripts/audit-root-commits-rename.cjs` (NEW one-shot audit script — 15.01)

**Analog:** `scripts/audit-id-namespace.cjs` (1-200) — v1.2 Phase 8 rename audit precedent; same regex+walker shape, same `Object.freeze` enum pattern, same pure unit-testable function organization.

**Verbatim header pattern from audit-id-namespace.cjs:1-13:**
```javascript
#!/usr/bin/env node
/**
 * audit-id-namespace.cjs (Phase 8 Plan 1, D-01)
 *
 * Pure regex+walker audit of every commit_id-reachable surface in the codebase.
 * Emits a human-readable verdict-table markdown to stdout (default), or a
 * structured JSON sidecar with --json (the JSON IS the literal seed for
 * scripts/lint-vcs-no-commit-id.allow.json — D-01 single-source-of-truth).
 *
 * Mirrors scripts/audit-workflow-script-paths.cjs structure (regex+walker,
 * Object.freeze enum, pure unit-testable function). Re-runnable at Plan 3
 * close-gate for Success Criterion 6 verification.
 */

'use strict';
```

**Verbatim file-walker pattern from audit-id-namespace.cjs:50-66:**
```javascript
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.jj', 'dist', 'dist-cjs', '.pnpm-store',
]);

const SCAN_EXT = /\.(cjs|js|mjs|ts|md)$/;

function findFiles(dir, results) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findFiles(full, results);
    else if (entry.isFile() && SCAN_EXT.test(entry.name)) results.push(full);
  }
}
```

**Audit script for rootCommits rename (15.01 D-13 — STDOUT ONLY per `feedback_avoid_jj_auto_tracked_output` memory):**
```javascript
#!/usr/bin/env node
// scripts/audit-root-commits-rename.cjs — one-shot pre-rename audit (15.01)
// STDOUT ONLY. Caller redirects to .planning/phases/15-.../rootCommits-rename-audit.json
// via shell `>`. Script never writes into the colocated-jj working tree.
// Discarded post-milestone (single-purpose, not a recurring CI lint).

const { execSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const PATTERN = '\\brootCommits\\b';
const EXCLUDES = [
  'node_modules', '.git', '.jj', 'dist-cjs/',
  '.planning/research/.archive-pre-v1.4/',
  '.planning/milestones/v1.2-research/',
];
const EXTENSIONS = ['ts', 'cjs', 'js', 'md', 'json'];

// [...build hits array via grep -rn...]

const out = {
  generatedAt: new Date().toISOString(),
  totalCount: hits.length,
  byExtension,         // D-09 grouped schema
  specialCases,        // D-11 explicit backends.ts:79 surfacing
  carveOuts: [
    { path: '.planning/research/.archive-pre-v1.4/', reason: 'historical-prose, pre-rename research artifacts (ROADMAP Phase 15 SC1 carve-out)' },
    { path: '.planning/milestones/v1.2-research/', reason: 'historical-prose, v1.2 deferred-item research (ROADMAP Phase 15 SC1 carve-out)' },
  ],
  idempotencyHash,     // D-12 MD5 over sorted {file,line} tuples + per-ext counts
};

process.stdout.write(JSON.stringify(out, null, 2) + '\n');
```

**Live grep baseline (verified 2026-05-24):** 28 total hits (19 `.ts` + 6 `.js` + 3 `.cjs`) when restricted to code extensions only across the repo (excluding `node_modules`, `.git`, `.jj`, `dist-cjs`). Combined with `.md` + `.json` extensions across the planning folder the working `totalCount` will exceed the 26-site figure in CONTEXT D-09 — Plan 15.01 must re-verify the exact count at execute time and update CONTEXT/RESEARCH accordingly.

---

### `.planning/phases/15-adapter-surface-extensions-rename/rootCommits-rename-audit.json` (NEW audit sidecar — 15.01)

**Analog (schema precedent):** `.planning/intel/id-namespace-audit.json` (v1.2 Phase 8 audit). D-09 schema extends the precedent with `byExtension` + `specialCases` + `carveOuts` + `idempotencyHash` fields per D-10..D-12.

**Verbatim header from id-namespace-audit.json:1-12:**
```json
{
  "$schema_version": 1,
  "scanned_at": "2026-05-15T05:35:33.308Z",
  "verdicts": {
    "safe": [
      {
        "audit_row": 10,
        "path": "sdk/src/vcs/__tests__/adapter-contract.test.ts",
        "line": 163,
        "surface": "40_char_hex_literal",
        "callerUse": "expect(vcs.refs.exists(expr.rev('ffffffffffffffffffffffffffffffffffffffff'))).toBe(false);"
      },
```

**D-09 schema (per CONTEXT) — grouped-by-extension shape:** see CONTEXT line 53-72 for the literal template. Sidecar is written by Plan 15.01 task via shell redirection (`node scripts/audit-root-commits-rename.cjs > .planning/phases/15-.../rootCommits-rename-audit.json`), not by the script itself — Pitfall 8 mitigation per `feedback_avoid_jj_auto_tracked_output`.

---

### `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts` (MODIFIED — 15.04 adds cancel describe blocks)

**Analog:** self — the PARALLEL-08 SC5 scenario describe at lines 474-545 is the canonical Phase 14.1 template that 15.04 mirrors verbatim.

**Setup helper to reuse (lines 64-87):**
```typescript
function setupJjRepo(): string {
  const dir = mkdtempSync(
    join(
      tmpdir(),
      `gsd-jj-parallel-${Math.random().toString(36).slice(2, 10)}-`,
    ),
  );
  execSync('jj git init --colocate', { cwd: dir, stdio: 'pipe' });
  execSync('jj config set --repo user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
  execSync('jj config set --repo user.name "Test"', { cwd: dir, stdio: 'pipe' });
  writeFileSync(join(dir, 'seed.txt'), 'seed\n');
  execSync('jj squash -B @ -k -m "seed"', { cwd: dir, stdio: 'pipe' });
  // Materialize .planning/phases/09-test/ so derivePhaseRoot(repo, 9) resolves
  mkdirSync(join(dir, '.planning', 'phases', '09-test'), { recursive: true });
  return dir;
}
```

**Verbatim describe-block template from :474-489** (Pattern A — `describe.sequential.skipIf(!jjAvailable)`; Pattern B — random-prefix mkdtemp via setupJjRepo; per-describe `beforeAll`+`afterAll`):
```typescript
describe.sequential.skipIf(!jjAvailable)(
  'workspace.parallel — bookmark-less / empty mainBookmarks (PARALLEL-08 SC5 scenario 1)',
  () => {
    let dir: string;
    let vcs: ReturnType<typeof createJjAdapter>;

    beforeAll(() => {
      // setupJjRepo() is bookmark-less by construction — no `jj bookmark
      // create main` in the seed (Pitfall 5).
      dir = setupJjRepo();
      vcs = createJjAdapter(dir);
    });

    afterAll(() => {
      if (dir) rmSync(dir, { recursive: true, force: true });
    });

    it('empty mainBookmarks: fan-in skips bookmark set, merge lands at @', { timeout: 30000 }, () => {
      // ... dispatch + simulate work + fan-in + assert ...
    });
  },
);
```

**15.04 cancel scenarios (3 minimum) — substitute `cancel(handle)` for `fanIn(handle, results)`:**
1. `cancel(handle) tears down N=2 dispatched workspaces; no agents run` — assert all paths exist pre-cancel, all gone post-cancel, `abandoned.length === 2`.
2. `cancel(handle) is idempotent — second call returns all-empty arrays` — D-03 invariant.
3. `cancel(handle) returns frozen CancelResult — survives JSON round-trip` — Phase 9 D-05 invariant (`Object.isFrozen` + `JSON.parse(JSON.stringify(result))`).

**CRITICAL — Pitfall 7 (stale `mainBookmark` references):** `15-04-PLAN.md` lines 151 and 404 still carry `mainBookmark: string` and `mainBookmark: 'main'` literals. The 15.04 executor MUST either pre-amend these (recommended; planner-level edit) or patch as the opening task. Cancel scenarios should OMIT `mainBookmarks` entirely (the cancel verb does not need bookmark-driven advance — the scenarios test workspace teardown, which is bookmark-orthogonal).

---

### `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts` (MODIFIED — 15.04 mirror)

**Analog:** self — git counterpart of SC5 scenarios (RESEARCH §"Architecture Patterns System Architecture Diagram" cites `cmd-parallel-git.test.ts:737-958` as the SC5 site; same Pattern A + Pattern B shape as jj counterpart).

**Adapt jj template:** swap `createJjAdapter(dir)` for `createGitAdapter(dir)`; setup helper materializes a `git init` repo with worktree-agent-* branches available; cancel scenarios mirror jj scenarios with the same 3-test set.

---

### `sdk/src/vcs/__tests__/adapter-contract.test.ts` (MODIFIED — 15.02 + 15.03 add cross-backend assertions)

**Analog:** self — existing `describe.for(selectedBackends())` block at lines 28-46 is the cross-backend template.

**Verbatim cross-backend describe shape from :28-37:**
```typescript
describe.for(selectedBackends())('VcsAdapter contract — backend=%s', (kind) => {
  const { test, setupHooks } = makeBackendFixture(kind);
  setupHooks();
  // Cache the kind-binding of verbReady so test-level skipIf reads tighter.
  const ready = (verb: string): boolean => verbReady(verb, kind);

  test('vcs.kind matches backend kind', ({ vcs }) => {
    if (kind === 'git') expect(vcs.kind).toBe('git');
    else expect(vcs.kind).toBe('jj');
  });
  // ... more tests guarded by ready('verb') ...
});
```

**15.02 add inside the existing `describe.for` block:**
```typescript
test.skipIf(!ready('refs.idAlphabet'))('vcs.refs.idAlphabet returns expected literal', ({ vcs }) => {
  if (kind === 'git') expect(vcs.refs.idAlphabet).toBe('0-9a-f');
  else expect(vcs.refs.idAlphabet).toBe('k-z');
});
```

**15.03 add cross-product test (5 rules × 2 backends = 10 cases minimum per CF-04):**

Reuse the existing `toBeIdOf` matcher precedent at `tests/__tools__/vitest-matchers.ts:38-59` (registered via `setupFiles` in `sdk/vitest.config.ts`; available in every SDK test). Per `feedback_vitest_extend_over_free_fn` memory: prefer `expect.extend`-based matchers over free-function wrappers.

**toBeIdOf signature (lines 39-58 of vitest-matchers.ts):**
```typescript
expect.extend({
  toBeIdOf(received: unknown, kindOrOpts: ToBeIdOfKind | ToBeIdOfOpts) {
    // [...] alphabet = kind === 'git' ? /^[0-9a-f]+$/ : /^[k-z]+$/;
    // [...] pass = isString && lengthOk && shapeOk;
    return { pass, message: () => ... };
  },
});
```

**5 rules per backend (10 cases total minimum):**
1. canonical-alphabet prefix → `true`
2. wrong-alphabet prefix → `throws`
3. empty prefix → `throws`
4. prefix longer than id → `false`
5. case-discipline matches backend (git: case-insensitive; jj: lower-only throws on uppercase)

---

### `sdk/src/vcs/__tests__/jj-workspace-cleanup.test.ts` (NEW — 15.04 Wave 1)

**Analog:** `sdk/src/vcs/__tests__/jj-id-alphabet-probe.test.ts` (1-77) — same single-purpose jj-only skipIf shape, same `mkdtempSync` + `execSync 'jj git init --colocate'` setup, same focused test scope.

**Verbatim template from jj-id-alphabet-probe.test.ts:1-47:**
```typescript
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

let jjAvailable = false;
try {
  execSync('jj --version', { stdio: 'pipe' });
  jjAvailable = true;
} catch {
  jjAvailable = false;
}

describe.skipIf(!jjAvailable)('cleanupSubagentWorkspaces helper', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(
      join(tmpdir(), `gsd-15-workspace-cleanup-${Math.random().toString(36).slice(2, 10)}-`),
    );
    // colocated init (matches existing fixture pattern in vcs-fixture.ts)
    execSync('jj git init --colocate', { cwd: dir, stdio: 'pipe' });
    // ... seed + materialize phase dir
  });

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('idempotency: missing dirs are not errors', () => { /* ... */ });
  it('UPSTREAM-02: helper does not import from backends/jj.ts', () => { /* import-graph assertion */ });
  it('Handle-authoritative enumeration: covers non-standard workspacePath overrides (Pitfall 4)', () => { /* ... */ });
  it('readdirSync fallback: helper enumerates phase-NN-subagent-* when workspaces[] omitted', () => { /* ... */ });
});
```

---

## Shared Patterns

### Pattern S1: UPSTREAM-02 Sidecar Discipline (all `sdk/src/vcs/jj/*.ts` sidecars)

**Source:** `sdk/src/vcs/jj/conflict-paths.ts:17-30` (canonical template) + `sdk/src/vcs/jj/reap.ts:34-42` (same inline `jjArgvFlags`) + `sdk/src/vcs/jj/incomplete-work.ts` (sidecar without flag prefix — fs-only).
**Apply to:** `sdk/src/vcs/jj/workspace-cleanup.ts` (NEW — 15.04 Wave 1).

```typescript
// VERBATIM template from conflict-paths.ts:17-30 — copy header + jjArgvFlags into workspace-cleanup.ts
/**
 * UPSTREAM-02 sidecar discipline: this file does NOT import from
 * `backends/jj.ts`. The mandatory-flags prefix is inlined verbatim per the
 * `octopus.ts:39-47` / `reap.ts:33-41` template.
 */

import { vcsExec } from '../exec.js';

/**
 * Inline mandatory-flags prefix — copy of `backends/jj.ts::jjArgv`'s flag
 * portion. UPSTREAM-02: avoids the backends import.
 */
function jjArgvFlags(repo: string): string[] {
  return ['--repository', repo, '--no-pager', '--color', 'never', '--quiet'];
}
```

**Enforcement:** Plan 15.04 Wave 1 unit test asserts `workspace-cleanup.ts` has zero `from '../backends/jj'` imports (greppable; can be enforced via existing `lint-vcs-no-raw-git.allow.json` or as an inline test).

---

### Pattern S2: Three-Site CLI Bridge Registration (load-bearing — Pitfall 6)

**Sources (verified live 2026-05-24):**
1. `sdk/src/query/command-static-catalog-domain.ts:21-22` (imports) + `:71-74` (catalog entries with dot AND space alias forms).
2. `sdk/src/query/command-manifest.non-family.ts:61-62` (mutation flag + outputMode declaration).
3. `sdk/src/query/command-aliases.generated.ts:156-157` (alias lookup entry).

**Apply to:** Plan 15.04 — `workspace.parallel.cancel` bridge. ALL THREE sites must be touched in the SAME commit; missing any one breaks runtime verb resolution. RESEARCH note: 15.03 `matchPrefix` does NOT get a CLI bridge (Deferred Ideas — no production caller in v1.4).

**Verification gate** (per Pitfall 6): after registration, `gsd-sdk query workspace.parallel.cancel --help` must NOT error "unknown verb".

---

### Pattern S3: Frozen Pure-JSON Return Shape (Phase 9 D-05 invariant)

**Source:** `sdk/src/vcs/jj/parallel.ts:500-507` (`FanInResult` freeze) + `sdk/src/vcs/git/parallel.ts:617-625` (git mirror per RESEARCH §"Architecture Patterns").
**Apply to:** all four new `CancelResult` returns (`performJjParallelCancel` + `performGitParallelCancel`) and any CLI-envelope-bearing return shape.

```typescript
// VERBATIM precedent from jj/parallel.ts:500-507
return Object.freeze({
  merged: Object.freeze(merged.slice()) as readonly string[],
  conflicted,
  conflictedPaths: Object.freeze(conflictedPaths.slice()) as readonly string[],
  incompleteQueued,
  failedReaped: Object.freeze(failedReaped.slice()) as readonly string[],
  surplusBookmarks: Object.freeze(surplusBookmarks.slice()) as readonly string[],
}) satisfies FanInResult;
```

**Test invariant** (per Pattern 8 + Example 9): every cancel scenario asserts `Object.isFrozen(result) === true` AND `JSON.parse(JSON.stringify(result))` round-trips losslessly. No closures/methods/Symbols/class instances permitted.

---

### Pattern S4: Two-Pass Validate-Then-Mutate (Phase 14.1 idiom; Pattern 7)

**Source:** `sdk/src/vcs/jj/parallel.ts:428-449` (fan-in `mainBookmarks` two-pass loop).
**Apply to:** Any iteration in `cancel` that does pre-flight input validation (RESEARCH §Pattern 7 documents this as a tool for optional cancel-side validation; cancel's primary `handle.workspaces` iteration does NOT need it because the agentIds were validated at dispatch time, but the planner may add a defensive pass if 15.04 introduces new caller inputs).

---

### Pattern S5: SC5 Scenario Test Template (Phase 14.1 lock-in)

**Source:** `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts:474-545` (jj SC5 scenario 1).
**Apply to:** Both new cancel describe blocks (`cmd-parallel-jj.test.ts` + `cmd-parallel-git.test.ts`).

**Required structural rules** (D-15 / 09-CONTEXT lock-in):
- Pattern A: `describe.sequential.skipIf(!jjAvailable|!gitAvailable)(...)` per scenario.
- Pattern B: random-prefix `mkdtemp` via `setupJjRepo()` / `setupGitRepo()` (parallel-test-FILE collision guard, D-15 / Pitfall 9).
- Per-scenario `beforeAll` (fresh mkdtemp) + `afterAll` (`rmSync`) — state cannot leak across cases.
- Never use retry config; never use a `skip` modifier on describe/it/test (D-15 / Pitfall 9). Flakes fixed at fixture level.

---

### Pattern S6: Hard-Rename Atomic-Commit + Pre-Audit Gate (Pitfall 1 + Pattern 1)

**Source:** Phase 14.1 commit `tvkykqy` (`mainBookmark` → `mainBookmarks?: readonly string[]` across 15 sites in single commit) + Phase 8 NAMING `LogEntry.hash` → `.id` precedent.
**Apply to:** Plan 15.01 (`rootCommits` → `rootRevisions` across 26+ sites).

**Audit/rename adjacency invariant** (D-12 `idempotencyHash`): audit-generation and rename-commit must be adjacent in commit order. No third commit between them. If a new `rootCommits` reference is added in the interim, regenerate the audit JSON and re-commit the rename atomically. The `idempotencyHash` (MD5 over sorted `{file, line}` tuples + per-extension counts) is the structural fingerprint that catches the gap.

**Per-extension grep gate** (D-10) — must exit 0 BEFORE the rename commit lands:
```bash
for ext in ts cjs js md json; do
  count=$(grep -rc "\brootCommits\b" --include="*.$ext" \
    --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.jj \
    --exclude-dir=dist-cjs --exclude-dir=".archive-pre-v1.4" \
    --exclude-dir="v1.2-research" . | grep -v ":0$" | wc -l)
  echo "$ext: $count files"
done
# Post-rename: all extensions must show 0.
```

---

### Pattern S7: Workspace Path Layout Convention

**Source:** `sdk/src/vcs/jj/octopus.ts:300-302` (jj default) + `sdk/src/vcs/git/parallel.ts:190` (git default, per RESEARCH §"Pitfall 4").
**Apply to:** `workspace-cleanup.ts` enumeration default path + helper unit tests.

```typescript
// VERBATIM from octopus.ts:300-302
const workspaceName = `phase-${phaseTag}-subagent-${opts.idx}`;
const workspacePath =
  opts.workspacePath ?? join(mainRepoRoot, '.claude/jj-workspaces', workspaceName);
```

**Helper enumeration patterns** (per CONTEXT Discretion item + RESEARCH Pitfall 4):
```typescript
// Default jj path: .claude/jj-workspaces/phase-{NN}-subagent-{idx}
// Default git path: .gsd-workspaces/phase-{NN}-subagent-{idx}
// User override via WorkspaceAdd.workspacePath — Pitfall 4: helper falls back
// to readdirSync only when handle.workspaces is omitted (best-effort recovery
// for dogfood-restore.sh).
```

---

## No Analog Found

**None.** Every new and modified file in Phase 15 has a verified analog in the existing codebase. The phase is structurally additive (3 new verbs + 1 rename) onto a 9-phase-mature adapter surface; every primitive (Object.freeze return shape, jjArgvFlags inline, UPSTREAM-02 sidecar, three-site CLI registration, frozen pure-JSON, hard-rename atomic-commit, vitest custom matcher) has at least one prior shipped instance to copy from.

---

## Open Pattern-Mapping Notes (deferred to planner)

### N1: Helper signature reconciliation (D-05 literal vs RESEARCH A1 recommendation)

CONTEXT D-05 literal: `(phaseRoot: string, phaseNumber: number) → CleanupSubagentWorkspacesResult`. RESEARCH A1 + Open Q1 recommend: `(mainRepoRoot: string, phaseNumber: number, workspaces?: readonly { name: string; path: string }[]) → CleanupSubagentWorkspacesResult`. The 3-arg variant + `mainRepoRoot` rename:
1. Resolves Pitfall 4 (`workspacePath` overrides) by accepting the authoritative Handle-supplied list.
2. Matches the existing sidecar signature pattern (`conflict-paths.ts::enumerateConflictedPaths(cwd, rev)` takes the repo root, not phase root).
3. Keeps Phase 16 `dogfood-restore.sh` callable via the readdirSync fallback path when `workspaces` is omitted.

**Planner decision:** record the choice in plan 15.04 CONTEXT amendment so Phase 16 CLEANUP-02 stays aligned. The PATTERNS.md presents both shapes; the planner picks.

### N2: Pitfall 7 — `15-04-PLAN.md` stale `mainBookmark` references

`15-04-PLAN.md` lines 151 and 404 carry post-14.1-stale `mainBookmark: string` / `mainBookmark: 'main'` literals. These will TSC-fail when 15.04 executes if not patched. Two paths:
1. **Pre-patch (RECOMMENDED — RESEARCH Open Q5):** planner amends 15-04-PLAN.md BEFORE execute starts. `mainBookmark: string` → `mainBookmarks?: readonly string[]` at :151; `mainBookmark: 'main'` → omit at :404 since cancel doesn't need it.
2. **Executor-patch:** 15.04 executor's FIRST task patches the plan it's executing.

Either path resolves the TSC-red risk. Pre-patch is simpler and one-time; executor-patch is more honest about ordering. Planner picks.

### N3: rootCommits hit count divergence

CONTEXT D-09 cites `totalCount: 26`. Live grep (verified 2026-05-24, code extensions only) shows 19 `.ts` + 6 `.js` + 3 `.cjs` = 28 code hits before counting `.md` + `.json`. Plan 15.01 execute step must:
1. Re-run the audit script at execute time.
2. Compare against the CONTEXT D-09 baseline.
3. Update CONTEXT/RESEARCH if drift is real (rather than rewriting the audit shape to match the old number).

### N4: `gsd-sdk query workspace.parallel.cancel --help` integration smoke

RESEARCH Wave 0 Gaps notes "Integration smoke for CLI bridge" at `tests/cli-workspace-parallel-cancel.test.cjs` (node --test). This new repo-side test file is not classified above because it lives under `tests/` (repo-level node-test domain), not `sdk/src/vcs/__tests__/` (SDK-level vitest domain). Planner should decide whether to ship the smoke as a new `.cjs` file or fold it into an existing `tests/cli-*.test.cjs` family.

---

## Metadata

**Analog search scope:**
- `sdk/src/vcs/` (types, backends, sidecars, query bridges, tests)
- `sdk/src/query/` (CLI bridges + three registration sites)
- `scripts/` (audit script precedents — `audit-id-namespace.cjs`, `audit-workflow-raw-git.cjs`, `audit-workflow-script-paths.cjs`)
- `.planning/intel/` (audit JSON sidecar precedents)
- `tests/__tools__/` (vitest custom matcher precedent)

**Files scanned (full reads):**
- `sdk/src/vcs/types.ts` (focused reads of :330-580 + :440-540)
- `sdk/src/vcs/backends.ts` :42-138
- `sdk/src/vcs/backends/jj.ts` :776, :964-980, :1245-1264
- `sdk/src/vcs/backends/git.ts` :554, :526, :730-746
- `sdk/src/vcs/jj/parallel.ts` :1-150, :200-509
- `sdk/src/vcs/git/parallel.ts` :1-120
- `sdk/src/vcs/jj/conflict-paths.ts` (full)
- `sdk/src/vcs/jj/reap.ts` :1-80, :170-200
- `sdk/src/vcs/jj/incomplete-work.ts` (full)
- `sdk/src/vcs/jj/octopus.ts` (grep)
- `sdk/src/vcs/exec.ts` :1-60
- `sdk/src/query/workspace-parallel-fan-in.ts` (full)
- `sdk/src/query/workspace-parallel-dispatch.ts` (full)
- `sdk/src/query/command-static-catalog-domain.ts` :15-100
- `sdk/src/query/command-manifest.non-family.ts` :50-75
- `sdk/src/query/command-aliases.generated.ts` :150-164
- `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts` :1-120, :460-580
- `sdk/src/vcs/__tests__/adapter-contract.test.ts` :1-50
- `sdk/src/vcs/__tests__/jj-id-alphabet-probe.test.ts` (full)
- `scripts/audit-id-namespace.cjs` :1-120
- `.planning/intel/id-namespace-audit.json` :1-25
- `tests/__tools__/vitest-matchers.ts` (full)
- `sdk/src/vcs/format-migration/rewrite.ts` (grep for alphabet sources)
- `sdk/src/vcs/expr.ts` (grep for SHA_OR_CHANGE_ID_RE)

**Pattern extraction date:** 2026-05-24
**Live source state:** post-Phase-14.1 (commits `tvkykqy` + `vlmlsqq` + `rwrpszp`; `ParallelDispatch{Opts,Handle}.mainBookmarks?: readonly string[]`; FanInResult 6-field at :552-560)
