# Phase 6: Brownfield jj Migration — Pattern Map

**Mapped:** 2026-05-14
**Files analyzed:** 17 new / 5 modified
**Analogs found:** 17/17 (all 17 new files have a strong analog; the 5 modified files are edits-in-place, not requiring an analog beyond the file itself)

This map drives the planner's 4-plan split:
- **Plan 06-01** (foundation): schema parity edit, `expr.children`, `initMigrateVcs`, empirical probes
- **Plan 06-02** (rewriter library): `sdk/src/vcs/format-migration/` (8 files: 5 source + 4 tests)
- **Plan 06-03** (migration command + greenfield gate): SDK verb + workflow markdown + `new-project.md` edit
- **Plan 06-04** (BROWN-01 dogfood + BROWN-02 retro): manual workflow + rebase-log seed

---

## File Classification

### NEW files (17 total)

| New File | Role | Data Flow | Closest Analog | Match Quality | Plan |
|----------|------|-----------|----------------|---------------|------|
| `sdk/src/vcs/format-migration/index.ts` | barrel re-export | n/a | `sdk/src/vcs/index.ts` (re-exports block, lines 77-88) | exact (re-export shape) | 06-02 |
| `sdk/src/vcs/format-migration/run.ts` | orchestrator handler | request-response (sync core, async I/O edges) | `sdk/src/query/config-mutation.ts:191-251` (configSet — lock + read + write + atomicWriteConfig) | exact (lock + read-modify-write + atomic write) | 06-02 |
| `sdk/src/vcs/format-migration/walk.ts` | utility (file enumeration) | batch / file-I/O | none in tree — closest is `node:fs.readdirSync(dir, { recursive: true })` stdlib usage; gsd uses this in `sdk/src/query/helpers.ts` (path resolution) but no glob walker exists today | no-analog (use stdlib pattern from RESEARCH §"Don't Hand-Roll") | 06-02 |
| `sdk/src/vcs/format-migration/rewrite.ts` | pure transform (string→string) | transform | `sdk/src/query/commit.ts:44-66` (`sanitizeCommitMessage` — pure regex-replace string transformer) | exact (pure-function regex transformer shape) | 06-02 |
| `sdk/src/vcs/format-migration/resolve.ts` | utility (id resolver + cache) | request-response | `sdk/src/vcs/parse/jj-id.ts:33-67` (`commitIdOf`/`changeIdOf` direct call); resolver wraps these with cache | role-match (analog is the underlying primitive, not the cache layer) | 06-02 |
| `sdk/src/vcs/format-migration/orphan.ts` | utility (ancestor walk) | event-driven (loop until resolve) | `sdk/src/query/log.ts:57-80` (`parseSingle` — calls `vcs.log({ maxCount: n+1 })` to walk history depth-wise) | role-match (analog walks fixed-depth; orphan walks until-condition) | 06-02 |
| `sdk/src/vcs/format-migration/report.ts` | utility (markdown writer) | file-I/O | `sdk/src/query/state-mutation.ts:237-…` (`syncStateFrontmatter` — pure-string builder + write); RESEARCH defers report layout to D-05 | role-match (md-builder shape, no analog produces a fresh advisory md) | 06-02 |
| `sdk/src/vcs/format-migration/__tests__/rewrite.test.ts` | unit test (pure function) | request-response | `sdk/src/vcs/__tests__/expr.test.ts:1-60` (factory + parser round-trip, no mocks, pure) | exact (pure-function vitest, no fs/exec mocks) | 06-02 |
| `sdk/src/vcs/format-migration/__tests__/orphan.test.ts` | unit test (mocked adapter) | request-response | `sdk/src/query/restore.test.ts:1-62` (vi.mock createVcsAdapter + vcsExec, dispatches per backend) | exact (mock vcs.log to feed ancestor chain) | 06-02 |
| `sdk/src/vcs/format-migration/__tests__/round-trip.test.ts` | integration test (real jj) | request-response | `sdk/src/vcs/__tests__/synth-planning-fixture.ts:121-138` (`synthPlanningFixture` + `vcs-fixture.ts` jj-colocated init) | exact (this is the fixture's documented purpose — see fixture line 8-16) | 06-02 |
| `sdk/src/vcs/format-migration/__tests__/idempotency.test.ts` | unit test (pure + fixture) | request-response | same as rewrite.test.ts + uses synth-planning-fixture | exact | 06-02 |
| `sdk/src/query/migrate-vcs.ts` | SDK verb handler | request-response | `sdk/src/query/restore.ts:1-83` (Phase 5 plan 05-01 thin SDK shim — argv parse + dispatch + envelope) | exact (Phase 5 11-shim shape; mutation-with-side-effects flavor matches `configSet`) | 06-03 |
| `sdk/src/query/migrate-vcs.test.ts` | unit test (mocked adapter) | request-response | `sdk/src/query/restore.test.ts:1-62` (vi.mock pattern) | exact | 06-03 |
| `sdk/src/query/migrate-vcs.integration.test.ts` | integration test (built binary) | request-response | `sdk/src/vcs/__tests__/gsd-sdk-binary-shape.integration.test.ts:1-172` (spawnSync built binary against tmp repo) | exact (black-box, post-flip envelope assertions) | 06-03 |
| `get-shit-done/workflows/migrate-vcs.md` | workflow markdown (slash cmd surface) | request-response | `get-shit-done/workflows/undo.md:1-332` (purpose / required_reading / process / step blocks / success_criteria; gsd-sdk query verb dispatch; backend-aware prose) | exact (small command shape: purpose + 5-step process + success_criteria + per-backend pitfall callouts) | 06-03 |
| `.planning/intel/06-migration-report.md` | runtime-emitted advisory doc | (output of migration) | no direct analog — file is generated by `format-migration/report.ts`; **shape only** mirrors `.planning/phases/*/*-LEARNINGS.md` markdown table form (see e.g. `04-LEARNINGS.md` Open-Q table) | role-match (md table writer) | 06-04 |
| `.planning/intel/rebase-log.md` | manual per-week journal | append-only md | RESEARCH §"BROWN-02 Retro File Shape" already specs this (3-col table) — no in-tree analog | no-analog (RESEARCH locks the shape; planner copies verbatim) | 06-04 |

### MODIFIED files (5 total)

| Modified File | What Changes | Reference Lines | Plan |
|---------------|--------------|-----------------|------|
| `sdk/src/query/config-schema.ts` | Add `'vcs.adapter'` to `VALID_CONFIG_KEYS` Set (1-line insert in the literal at lines 18-76) | line 18-76 (existing literal) | 06-01 |
| `get-shit-done/bin/lib/config-schema.cjs` | Mirror the above (CI parity-tested per #2653) | line 16-77 (existing literal) | 06-01 |
| `sdk/src/vcs/expr.ts` | Add `children(rev: RevisionExpr): RevisionExpr` factory (mirrors `range` at lines 67-69) + parse case for `'children'` kind in `parseExpr` | lines 43-81 (factory frozen object) + lines 96-108 (parseExpr switch) | 06-01 |
| `sdk/src/query/init.ts` | Append `initMigrateVcs` handler near `initIngestDocs` (lines 1164-1182) and add `has_jj: pathExists(projectDir, '.jj')` peer field to `initIngestDocs` itself if reused by `new-project.md` | lines 1164-1182 (template) | 06-01 (has_jj) + 06-03 (initMigrateVcs) |
| `sdk/src/query/command-manifest.non-family.ts` | Register `migrate-vcs` (mutation: true, outputMode: 'json') | lines 47-58 (the Phase 5 11-shim block — append parallel entry) | 06-03 |
| `sdk/src/query/command-static-catalog-foundation.ts` | Import + register `migrateVcsQuery` in `MUTATION_SURFACES_STATIC_CATALOG` | lines 14-25 (Phase 5 shim imports) + lines 77-90 (registration block) | 06-03 |
| `get-shit-done/workflows/new-project.md` | Replace silent `git init` at lines 108-112 with branching gate (has_jj × has_git × --jj × --git matrix) | lines 108-112 (replacement site) | 06-03 |
| `.planning/STATE.md` | Lift the "use git not jj" memory rule (single-line update) post BROWN-01 dogfood | n/a (manual edit) | 06-04 |

---

## Pattern Assignments

### `sdk/src/query/migrate-vcs.ts` — SDK verb handler

**Plan:** 06-03
**Role:** SDK query verb handler (mutation; outputMode 'json')
**Closest analog:** `sdk/src/query/restore.ts` (Phase 5 plan 05-01 shim — chosen over `commit.ts` because the file is short, single-purpose, and the most recent SDK-verb shape blessed by Phase 5)

**Imports pattern** (from `restore.ts:18-21`):
```typescript
import { createVcsAdapter } from '../vcs/index.js';
import { vcsExec } from '../vcs/exec.js';
import { validateRefname } from '../vcs/refs-validator.js';
import type { QueryHandler } from './utils.js';
```

For migrate-vcs, expand to:
```typescript
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createVcsAdapter } from '../vcs/index.js';
import { atomicWriteConfig } from './config-mutation.js';        // NEW: must be exported (RESEARCH Option A)
import { planningPaths } from './helpers.js';
import { acquireStateLock, releaseStateLock } from './state-mutation.js';
import { sanitizeCommitMessage } from './commit.js';              // RESEARCH §Security V14
import { runMigration } from '../vcs/format-migration/index.js';
import { GSDError, ErrorClassification } from '../errors.js';
import type { QueryHandler } from './utils.js';
```

**Argv parse pattern** (from `restore.ts:23-50`):
```typescript
export const restoreQuery: QueryHandler = async (args, projectDir) => {
  let cwd = projectDir;
  let from: string | undefined;
  const files: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) {
      cwd = args[i + 1];
      i++;
    } else if (args[i] === '--from' && args[i + 1]) {
      from = args[i + 1];
      i++;
    } else if (!args[i].startsWith('--')) {
      files.push(args[i]);
    }
  }

  if (files.length === 0) {
    return { data: { ok: false, error: 'restore: at least one file argument required' } };
  }

  if (from !== undefined) {
    try { validateRefname(from); } catch (err) {
      return { data: { ok: false, error: (err as Error).message } };
    }
  }
```

Adapt for migrate-vcs (flags: `--target <jj|git>`, `--native`, `--force`, `--cwd`):
- Validate `--target` against the literal set `['git', 'jj']` (RESEARCH §Security V5).
- Empty/absent `--target` → derive from `current_adapter` per the table in RESEARCH §"Determining the target VCS" (git/absent → default jj; jj → refuse).
- Return `{ data: { ok: false, error } }` envelope on any validation failure (matches restore.ts pattern).

**Atomic-mutation pattern** (from `config-mutation.ts:191-251`):
```typescript
// D6: Lock protection for read-modify-write (match CJS config.cjs:296)
const paths = planningPaths(projectDir, workstream);
const lockPath = await acquireStateLock(paths.config);
let previousValue: unknown;
try {
  let config: Record<string, unknown> = {};
  try {
    const raw = await readFile(paths.config, 'utf-8');
    config = JSON.parse(raw) as Record<string, unknown>;
  } catch { /* empty config */ }

  previousValue = getValueAtPath(config, keyPath);
  setConfigValue(config, keyPath, parsedValue);
  await atomicWriteConfig(paths.config, config);
} finally {
  await releaseStateLock(lockPath);
}
```

Migration handler hoists the entire migration (rewriter walk + report emit + adapter flip + commit) inside this lock. Per RESEARCH §"Don't Hand-Roll" and §Anti-Patterns, the lock MUST cover the full migration duration, not just the config write.

**Backend cache-invalidation pattern** (RESEARCH Pitfall 6, lines 442-453):
After the adapter flip, construct a fresh adapter with explicit kind so the migration commit lands on the target backend:
```typescript
// Source: sdk/src/vcs/index.ts:20-31 (createVcsAdapter accepts opts.kind override)
const newVcs = createVcsAdapter(cwd, { kind: target });
await newVcs.commit({ files: [...dirtyFiles, paths.config, reportPath], message });
```

**Error envelope return shape** (from `restore.ts:55-81`):
```typescript
return {
  data: {
    ok: result.exitCode === 0,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    files,
    from,
    backend: 'git',
  },
};
```

For migrate-vcs return shape (per RESEARCH §"CLI Surface" + §"Summary" step):
```typescript
return {
  data: {
    ok: true,
    migrated: true,
    filesChanged: results.size,
    orphans: { count, resolved, unresolvable, reportPath },
    previousAdapter: oldTarget,
    newAdapter: target,
    commitHash: commitResult.hash,
  },
};
```

---

### `sdk/src/vcs/format-migration/run.ts` — orchestrator

**Plan:** 06-02
**Role:** orchestrator (in-memory walk → report → atomic commit)
**Closest analog:** `sdk/src/query/config-mutation.ts:191-251` (configSet's lock + read + transform + atomic-write + release pattern)

**Phase 1 (read + transform, all in memory)** — follow rewrite.ts pure-function calls.

**Phase 2 (write all dirty files)** — sequential `writeFile` loop; no atomic temp-rename per file (the single `vcs.commit` is the atomic boundary, not the per-file write).

**Phase 3 (flip config)** — use `atomicWriteConfig` (RESEARCH §"Don't Hand-Roll"; must be exported from config-mutation.ts as part of this plan):
```typescript
const config = JSON.parse(await readFile(paths.config, 'utf8'));
config.vcs ??= {};
config.vcs.adapter = target;
await atomicWriteConfig(paths.config, config);
```

**Phase 4 (emit report)** — call into `report.ts`.

**Phase 5 (single commit)** — RESEARCH §"Pattern 3: Atomic Multi-File Commit":
```typescript
const newVcs = createVcsAdapter(cwd, { kind: target });   // fresh adapter post-flip (Pitfall 6)
await newVcs.commit({
  files: [...results.keys(), paths.config, reportPath],
  message: sanitizeCommitMessage(`chore(vcs): migrate ${oldTarget} → ${target} [gsd-migrate-vcs v1]`),
  noVerify: false,
});
```

The `[gsd-migrate-vcs v1]` marker is a stable idempotency probe per RESEARCH Open Question #4.

**Pre-flight checks** before Phase 1 (RESEARCH Pitfall 4):
- Call `vcs.status({ scope: 'working-copy' })`; refuse if dirty and not `--force`.
- Call `vcs.findConflicts({ scope: 'all' })`; refuse if conflicts and not `--force`.

**Hook firing** (RESEARCH Open Question #5 — chosen workaround):
Before `newVcs.commit(...)` on the jj backend, call the `vcs.hooks.fire('pre-commit', ctx)` primitive from Phase 4 plan 04-06 (`sdk/src/vcs/hook-bridge.ts`). The A3 colocated gap stays open; this plan-local workaround addresses only the migration commit.

---

### `sdk/src/vcs/format-migration/rewrite.ts` — pure regex transformer

**Plan:** 06-02
**Role:** pure function `(content, direction, resolveFn) → { content, orphans }`
**Closest analog:** `sdk/src/query/commit.ts:44-66` (`sanitizeCommitMessage` — pure-input pure-output multi-regex-replace string transformer)

**Pattern excerpt from commit.ts:44-66:**
```typescript
export function sanitizeCommitMessage(text: string): string {
  if (!text || typeof text !== 'string') return '';

  let sanitized = text;

  // Strip null bytes
  sanitized = sanitized.replace(/\0/g, '');

  // Strip zero-width characters that could hide instructions
  sanitized = sanitized.replace(/[\u200B-\u200F\u2028-\u202F\uFEFF\u00AD]/g, '');

  // Neutralize XML/HTML tags that mimic system boundaries
  sanitized = sanitized.replace(/<(\/?)?(?:system|assistant|human)>/gi,
    (_match, slash) => `＜${slash || ''}system-text＞`);
  ...
}
```

Apply same shape to migrateContent. Two regexes per RESEARCH §"Pattern 1" + Pitfall 5:
```typescript
// Lookbehind/lookahead prevents partial matches inside larger hex strings (RESEARCH line 259).
const GIT_SHA_RE = /(?<![0-9a-fA-F])([0-9a-f]{7,40})(?![0-9a-fA-F])/g;
const JJ_CID_RE  = /(?<![k-z])([k-z]{8,12})(?![k-z])/g;

export function migrateContent(
  content: string,
  direction: 'git→jj' | 'jj→git',
  resolve: (id: string) => ResolveResult,
): { content: string; orphans: Orphan[] } {
  const re = direction === 'git→jj' ? GIT_SHA_RE : JJ_CID_RE;
  const orphans: Orphan[] = [];
  const out = content.replace(re, (match, id, offset) => {
    const r = resolve(id);
    if (r.kind === 'resolved') return r.targetId;
    if (r.kind === 'ancestor') {
      orphans.push({ original: id, resolved: r.targetId, offset, kind: 'ancestor' });
      return `${r.targetId}\`[was ${direction === 'git→jj' ? 'sha' : 'cid'}:${id}]\``;
    }
    orphans.push({ original: id, resolved: null, offset, kind: 'unresolvable' });
    return `\`[orphan:${id}]\``;
  });
  return { content: out, orphans };
}
```

**No I/O in this module.** Pure. All file reads/writes happen in `run.ts`.

---

### `sdk/src/vcs/format-migration/orphan.ts` — ancestor walk

**Plan:** 06-02
**Role:** async ancestor walker; uses `vcs.log` adapter API
**Closest analog:** `sdk/src/query/log.ts:57-80` (`parseSingle` — calls `vcs.log({ maxCount: n+1 })` to walk history by depth)

**Pattern excerpt from log.ts:60-72:**
```typescript
const tildeMatch = raw.match(/^(?:HEAD|@)~(\d+)$/);
if (tildeMatch) {
  const n = parseInt(tildeMatch[1], 10);
  if (n === 0) return expr.head();
  // Pull n+1 log entries; the last one is HEAD~n.
  const entries = vcs.log({ maxCount: n + 1 });
  if (entries.length <= n) {
    throw new Error(`parseRangeArg: ${raw} exceeds repo depth (${entries.length} commits available)`);
  }
  return expr.rev(entries[n].hash);
}
```

For orphan.ts the walk is unbounded-until-condition (RESEARCH §"Pattern 2"):
```typescript
import { commitIdOf, changeIdOf } from '../parse/jj-id.js';
import { expr } from '../expr.js';
import { VcsExecError } from '../exec.js';
import type { VcsAdapter } from '../types.js';

const MAX_DEPTH = 1000;

export async function resolveAncestor(
  vcs: VcsAdapter,
  cwd: string,
  orphan: string,
  direction: 'git→jj' | 'jj→git',
): Promise<{ ancestor: string; childrenInTarget: string[] } | null> {
  let cursor = orphan;
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    // First-parent walk in source VCS.
    const parents = vcs.log({ rev: expr.parents(expr.rev(cursor)), maxCount: 1 });
    if (parents.length === 0) return null;  // hit root
    cursor = parents[0].hash;
    try {
      const targetId = direction === 'git→jj' ? changeIdOf(cwd, cursor) : commitIdOf(cwd, cursor);
      // Direct children in TARGET VCS DAG.
      const children = vcs.log({ rev: expr.children(expr.rev(targetId)), maxCount: 100 });
      return { ancestor: targetId, childrenInTarget: children.map((c) => c.hash) };
    } catch (e) {
      if (e instanceof VcsExecError && e.exitCode !== 0) continue;  // not in target, keep walking
      throw e;
    }
  }
  return null;
}
```

**Dependency:** `expr.children(rev)` factory — does not exist; plan 06-01 adds it to `sdk/src/vcs/expr.ts`. See §"Shared Patterns → expr.children factory" below.

**Note on `expr.parents`:** Verify whether the existing parent factory at `expr.parent()` (no-arg, line 47-49) suffices, or whether a parameterised `expr.parents(rev)` factory is also missing. RESEARCH §"Pattern 2" uses `expr.parents(expr.rev(cursor))` — planner confirms during plan 06-01 implementation.

---

### `sdk/src/vcs/format-migration/resolve.ts` — cached id resolver

**Plan:** 06-02
**Role:** thin cache layer around `commitIdOf`/`changeIdOf`
**Closest analog:** `sdk/src/vcs/parse/jj-id.ts:33-67` (the underlying primitives this module wraps)

**Pattern from jj-id.ts:33-49:**
```typescript
export function commitIdOf(cwd: string, changeId: string): string {
  const args = jjIdArgv(cwd, 'log', '-r', changeId, '-T', 'commit_id', '--no-graph', '-n', '1');
  const r = vcsExec(cwd, 'jj', args);
  if (r.exitCode !== 0) {
    throw new VcsExecError(
      `jj-id.commitIdOf failed for change ${changeId}: ${r.stderr || r.stdout}`,
      { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr, timedOut: r.timedOut, args }
    );
  }
  return r.stdout.trim();
}
```

The resolver wraps these with a `Map<string, ResolveResult>` cache (per RESEARCH §Standard Stack "Alternatives Considered" — `Track dirty.` and per-id calls are the right granularity; ~200 distinct IDs estimate). On `VcsExecError`, delegate to `orphan.ts:resolveAncestor`.

---

### `sdk/src/vcs/format-migration/walk.ts` — file enumerator

**Plan:** 06-02
**Role:** glob expansion → file path list
**Closest analog:** none in codebase — RESEARCH §"Don't Hand-Roll" explicitly directs to `node:fs.readdirSync(dir, { recursive: true, withFileTypes: true })` (Node 20+ stdlib; no new dep). Glob set fixed per RESEARCH §"`.planning/` Surface Inventory":
```typescript
const IN_SCOPE_GLOBS = [
  '.planning/STATE.md',
  '.planning/phases/**/*.md',
  '.planning/intel/**/*.md',
  '.planning/research/**/*.md',
  '.planning/debug/**/*.md',
  '.planning/todos/**/*.md',
];
const OUT_OF_SCOPE = new Set([
  '.planning/config.json',
  '.planning/ROADMAP.md',
  '.planning/PROJECT.md',
  '.planning/REQUIREMENTS.md',
]);
```

**Security pattern:** Use `realpath`/`fs.lstatSync` symlink check before write (RESEARCH §Security threat-pattern "Symlinked file under `.planning/` writing outside repo").

---

### `sdk/src/vcs/format-migration/__tests__/rewrite.test.ts` — pure-fn vitest

**Plan:** 06-02
**Role:** unit test, no I/O, no mocks
**Closest analog:** `sdk/src/vcs/__tests__/expr.test.ts:1-39`

**Pattern excerpt:**
```typescript
import { describe, it, expect } from 'vitest';
import { expr, parseExpr } from '../expr.js';

describe('expr factories', () => {
  it('head() round-trips through parseExpr', () => {
    expect(parseExpr(expr.head())).toEqual({ kind: 'head' });
  });
  it('expr has no raw escape hatch (D-12)', () => {
    expect((expr as unknown as { raw?: unknown }).raw).toBeUndefined();
  });
});
```

Apply same flat structure for rewrite.test.ts:
- describe('migrateContent', …)
- it('passes through content with no SHA matches', …)
- it('rewrites git SHAs to change_ids when direction=git→jj', …)
- it('handles ancestor-resolution sentinel with [was sha:X] breadcrumb', …)
- it('handles unresolvable sentinel with [orphan:X] placeholder', …)
- it('does NOT match partial SHA inside longer hex string (lookbehind/lookahead)', …)
- it('is idempotent: re-run on already-migrated content is a no-op', …)

---

### `sdk/src/vcs/format-migration/__tests__/orphan.test.ts` — mocked-adapter vitest

**Plan:** 06-02
**Closest analog:** `sdk/src/query/restore.test.ts:1-62`

**Pattern excerpt (lines 1-30 of restore.test.ts):**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const restoreMock = vi.fn();
const vcsExecMock = vi.fn();
const createVcsAdapterMock = vi.fn();

vi.mock('../vcs/index.js', () => ({
  createVcsAdapter: (...a: unknown[]) => createVcsAdapterMock(...a),
}));
vi.mock('../vcs/exec.js', () => ({
  vcsExec: (...a: unknown[]) => vcsExecMock(...a),
}));

import { restoreQuery } from './restore.js';

beforeEach(() => {
  restoreMock.mockReset();
  vcsExecMock.mockReset();
  createVcsAdapterMock.mockReset();
  createVcsAdapterMock.mockReturnValue({
    kind: 'git',
    gitOnly: { restore: restoreMock },
  });
  restoreMock.mockReturnValue({ exitCode: 0, stdout: '', stderr: '' });
  vcsExecMock.mockReturnValue({ exitCode: 0, stdout: '', stderr: '' });
});
```

For orphan.test.ts, mock `vcs.log` to return a constructed ancestry chain plus mock `commitIdOf`/`changeIdOf` (from `../parse/jj-id.js`) to throw `VcsExecError` on the first N cursor values and succeed on the (N+1)th. Assert: resolved ancestor + direct-children list.

---

### `sdk/src/vcs/format-migration/__tests__/round-trip.test.ts` — integration test

**Plan:** 06-02
**Role:** real jj binary against synthetic `.planning/` fixture; verifies git→jj→git is idempotent modulo ancestor-walk breadcrumbs
**Closest analog:** `sdk/src/vcs/__tests__/synth-planning-fixture.ts:121-138` + `vcs-fixture.ts:42-59` (jj-colocated init)

**Pattern excerpt from synth-planning-fixture.ts:121-138:**
```typescript
export function synthPlanningFixture(
  kind: 'jj-colocated' | 'jj-native' = 'jj-colocated',
): SynthPlanningFixture {
  const prefix = kind === 'jj-colocated' ? 'gsd-synth-jj-colo-' : 'gsd-synth-jj-native-';
  const dir = kind === 'jj-colocated' ? initJjColocated(prefix) : initJjNative(prefix);
  seedPlanningSkeleton(dir);
  const vcs = createVcsAdapter(dir, { kind: 'jj' });
  const cleanup = () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* gone */ } };
  return { dir, vcs, cleanup };
}
```

The fixture is **purpose-built** for Phase 6 — see fixture lines 8-16:
> Phase 5 (per CONTEXT D-31) does NOT run jj against this repo's real history; the dogfood-on-this-repo BROWN-01 / BROWN-02 requirements were re-bucketed to Phase 6 (sticky-adapter flip + `.planning/` SHA→change_id rewriter). The brownfield COMMANDS still need integration coverage on jj — D-34 locks the strategy: exercise each command against a synthetic `.planning/` skeleton in a fresh tmpdir.

Round-trip test creates fixture, plants known git SHAs in the skeleton's `*-SUMMARY.md` files (via writeFileSync), invokes runMigration(git→jj), then runMigration(jj→git), asserts: post-2nd-flip content matches pre-1st-flip content modulo any `[was sha:…]` breadcrumbs that ancestor-walk produced.

**Cleanup safety:** `cleanup()` MUST run in `afterAll` / `afterEach` even if tests fail — see vcs-fixture.ts:140-145 `afterAll(() => { if (sharedDir) rmSync(sharedDir, { recursive: true, force: true }); … })`.

---

### `sdk/src/query/migrate-vcs.integration.test.ts` — built-binary black-box

**Plan:** 06-03
**Role:** spawnSync against the built `bin/gsd-sdk.js` to verify on-the-wire JSON envelope shape
**Closest analog:** `sdk/src/vcs/__tests__/gsd-sdk-binary-shape.integration.test.ts:1-172` (Phase 5 plan 05-06 — the **canonical** post-shim contract test for SDK envelopes)

**Pattern excerpt from gsd-sdk-binary-shape.integration.test.ts:26-46:**
```typescript
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const SDK_BIN = path.resolve(__dirname, '../../../../bin/gsd-sdk.js');
const SDK_CLI = path.resolve(__dirname, '../../../dist/cli.js');

function runGsdSdk(args: string[]): { stdout: string; stderr: string; status: number } {
  const result = spawnSync(process.execPath, [SDK_BIN, ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status ?? -1 };
}
```

**Built-binary pre-flight gate** (lines 47-56):
```typescript
beforeAll(() => {
  if (!existsSync(SDK_CLI)) {
    throw new Error(`integration: ${SDK_CLI} missing — run \`pnpm --filter @gsd-build/sdk build\` first.`);
  }
  if (!existsSync(SDK_BIN)) { throw new Error(`integration: ${SDK_BIN} missing.`); }
  // ... tmpdir setup
});
```

**Envelope assertion pattern** (lines 84-94):
```typescript
it('CR-01 root claim: head-ref envelope is flat (top-level .head, NOT .data.head)', () => {
  const { stdout, status } = runGsdSdk(['query', 'head-ref', '--cwd', tmpDir]);
  expect(status).toBe(0);
  const parsed = JSON.parse(stdout);
  expect(parsed.ok).toBe(true);
  expect(typeof parsed.head).toBe('string');
  expect(parsed.head.length).toBeGreaterThanOrEqual(7);
  expect(parsed).not.toHaveProperty('data');
});
```

Apply to migrate-vcs: seed a tmpdir with synth-planning-fixture, invoke `gsd-sdk query migrate-vcs --target jj --cwd <tmp>`, assert envelope has `parsed.ok === true`, `parsed.migrated === true`, `parsed.newAdapter === 'jj'`, and **NO `.data` wrapper** (CR-01 invariant per the binary-shape test). The atomicity invariant: `parsed.commitHash` must reference a commit whose tree contains BOTH the rewritten prose files AND the flipped config.json.

---

### `get-shit-done/workflows/migrate-vcs.md` — slash command surface

**Plan:** 06-03
**Role:** workflow markdown; auto-discovered from filename per RESEARCH §"Don't Hand-Roll"
**Closest analog:** `get-shit-done/workflows/undo.md` (smallish — 332 lines — bidirectional-flag command with backend-aware prose; closer match than `quick.md` at 1127 lines, which is workflow-orchestrator-heavy)

**Structural skeleton** (from undo.md lines 1-44, 282-318):
```markdown
<purpose>
[1–3 sentences: command intent + backend semantic shifts]
</purpose>

<required_reading>
@~/.claude/get-shit-done/references/ui-brand.md
@~/.claude/get-shit-done/references/gate-prompts.md
</required_reading>

<process>

<step name="banner" priority="first">
Display the stage banner:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► MIGRATE VCS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
</step>

<step name="parse_arguments">
Parse $ARGUMENTS for: --target, --native, --force, --cwd.
If --target absent: derive from current_adapter (git/absent → jj; jj → ERROR).
</step>

<step name="preflight">
INIT=$(gsd-sdk query init.migrate-vcs)
# parse: has_git, has_jj, current_adapter, jj_available, dirty, conflicts
# Refuse if dirty or conflicts and not --force.
# Refuse if target == jj and !jj_available with clear error.
</step>

<step name="run_migration">
gsd-sdk query migrate-vcs --target <T> [--native] [--force]
# Single SDK call. Handler drives rewriter + report + atomic commit + adapter flip.
</step>

<step name="summary">
Display completion banner + summary table:
  ✓ N files rewritten
  ✓ K orphans resolved (ancestor walk) — see .planning/intel/06-migration-report.md
  ✓ M orphans unresolvable — see report's "unresolvable" section
  ✓ Adapter flipped: <old> → <new>
  ✓ Migration commit: <hash/change_id>
</step>

</process>

<success_criteria>
- [ ] --target validated against [jj, git]; absent → derived from current_adapter
- [ ] Refuses if jj missing when target=jj
- [ ] Refuses if dirty/conflicts unless --force
- [ ] All in-scope .planning/ files walked; idempotent on already-migrated
- [ ] config.json vcs.adapter flipped in the SAME commit as prose rewrites (atomicity)
- [ ] .planning/intel/06-migration-report.md emitted with orphan table
- [ ] Round-trip safe: /gsd-migrate-vcs --target <old> flips back
- [ ] Bidirectional contract documented in summary output
</success_criteria>
```

**Backend-aware prose pattern** (from undo.md:222 — the `> **Backend semantic shift (...)** ...` blockquote):
Use the same `> **Backend semantic shift (...).**` callout format for the Phase 6 colocated/native distinction, the round-trip-after-rebase pitfall (RESEARCH Pitfall 2), and the A3 hook gap workaround.

---

### `sdk/src/query/init.ts` — append `initMigrateVcs`

**Plan:** 06-01 (has_jj field on initIngestDocs) + 06-03 (full initMigrateVcs)
**Closest analog:** `sdk/src/query/init.ts:1164-1182` (`initIngestDocs` — the smallest/newest probe-shaped init handler)

**Pattern excerpt (lines 1164-1182):**
```typescript
// ─── initIngestDocs ───────────────────────────────────────────────────────

/**
 * Init handler for ingest-docs workflow.
 * Mirrors `initResume` shape but without current-agent-id lookup — the
 * ingest-docs workflow reads `project_exists`, `planning_exists`, `has_git`,
 * and `project_path` to branch between new-project vs merge-milestone modes.
 */
export const initIngestDocs: QueryHandler = async (_args, projectDir) => {
  const config = await loadConfig(projectDir);
  const result: Record<string, unknown> = {
    project_exists: pathExists(projectDir, '.planning/PROJECT.md'),
    planning_exists: pathExists(projectDir, '.planning'),
    has_git: pathExists(projectDir, '.git'),
    project_path: '.planning/PROJECT.md',
    commit_docs: config.commit_docs,
  };
  return { data: withProjectRoot(projectDir, result, config as Record<string, unknown>) };
};
```

**Plan 06-01 edit (single line in initIngestDocs):**
```typescript
has_jj: pathExists(projectDir, '.jj'),   // NEW — peer to has_git
```

**Plan 06-03 append (new handler near line 1182, mirroring research §"`init.migrate-vcs` handler shape" lines 758-794):**
```typescript
export const initMigrateVcs: QueryHandler = async (_args, projectDir) => {
  const config = await loadConfig(projectDir);
  const cwd = projectDir;
  let currentAdapter: 'git' | 'jj' | 'auto' | 'absent' = 'absent';
  try {
    const raw = await readFile(join(cwd, '.planning', 'config.json'), 'utf8');
    const json = JSON.parse(raw);
    currentAdapter = json?.vcs?.adapter ?? 'absent';
  } catch { /* leave as 'absent' */ }

  let jjAvailable = false;
  try { execSync('jj --version', { stdio: 'pipe' }); jjAvailable = true; } catch { /* false */ }

  const vcs = createVcsAdapter(cwd);
  const status = await vcs.status({ scope: 'working-copy' });
  const conflicts = await vcs.findConflicts({ scope: 'all' });

  return {
    data: {
      has_git: pathExists(cwd, '.git'),
      has_jj: pathExists(cwd, '.jj'),
      current_adapter: currentAdapter,
      jj_available: jjAvailable,
      dirty: status.entries.length > 0,
      conflicts: conflicts.length > 0,
      project_path: cwd,
      commit_docs: config.commit_docs,
    },
  };
};
```

---

### `get-shit-done/workflows/new-project.md` — replace silent git init

**Plan:** 06-03
**Edit site:** lines 108-112 (current content shown in RESEARCH lines 630-635 and the file at this same range)

**Current content (lines 106-112) verbatim:**
```markdown
**If `project_exists` is true:** Error — project already initialized. Use `/gsd-progress`.

**If `has_git` is false:** Initialize git:

```bash
git init
```
```

**Replacement (per RESEARCH §"Greenfield Gate Wiring" lines 637-650 + CONTEXT D-02):**
```markdown
**If `project_exists` is true:** Error — project already initialized. Use `/gsd-progress`.

**Greenfield VCS gate (ROADMAP SC #1 / #7):**

Parse $ARGUMENTS for `--jj`, `--jj=native`, `--jj=colocated`, `--git`.

| has_jj | has_git | --jj | --git | Action |
|--------|---------|------|-------|--------|
| true   | (any)   | (any)| (any) | Set `vcs.adapter=jj` in config.json; banner: "Detected .jj/ — using jj backend"; continue |
| false  | true    | (any)| (any) | Use existing git (default vcs.adapter behavior); continue |
| false  | false   | absent | absent | ERROR: "Empty directory — pass --git or --jj (default --jj initializes colocated)" |
| false  | false   | set    | absent | Run `jj git init --colocate` (or `--no-colocate` when `--jj=native`); set `vcs.adapter=jj`; continue |
| false  | false   | absent | set  | Run `git init`; continue (vcs.adapter unset → resolver default per Phase 3 D-17) |

The SC #1 jj-binary smoke check (`jj --version`) gates the has_jj=true branch — if jj binary fails, surface clear error instead of falling back silently to git.
```

**No analog file needed for the edit itself** — it's an in-place replacement. The pattern is "branch on init JSON flags", which is identical to existing edits in `new-project.md` at lines 116-138 (the `needs_codebase_map` AskUserQuestion fork at line 118-127).

---

## Shared Patterns

### Authentication / Authorization

**Not applicable.** No auth surface in Phase 6 — local filesystem + VCS binary only.

### Error Handling — `{ ok: false, error }` envelope

**Source:** `sdk/src/query/restore.ts:40-50` (the canonical Phase 5 shim shape)
**Apply to:** All new SDK verb handlers and the migration orchestrator (where the boundary surfaces to the workflow)

```typescript
if (files.length === 0) {
  return { data: { ok: false, error: 'restore: at least one file argument required' } };
}

if (from !== undefined) {
  try {
    validateRefname(from);
  } catch (err) {
    return { data: { ok: false, error: (err as Error).message } };
  }
}
```

**For migrate-vcs:**
- Argv validation failure → `{ ok: false, error: 'migrate-vcs: <reason>' }`.
- Pre-flight refusal (dirty/conflicts/jj missing) → `{ ok: false, error: 'migrate-vcs: <state> — pass --force to override' }`.
- Mid-migration orphan unresolvable → still `ok: true` but `orphans.unresolvable > 0`; the report contains details. Unresolvable orphans are NOT a hard error per CONTEXT D-01.

### Atomic config + read-modify-write lock

**Source:** `sdk/src/query/config-mutation.ts:191-251` (configSet)
**Apply to:** `migrate-vcs.ts` and `format-migration/run.ts`

The lock acquired at `paths.config` MUST cover the **entire** migration duration (walk + write + commit), not just the config write. RESEARCH §"Don't Hand-Roll" + Anti-Pattern "Skipping the lock" lock this in.

```typescript
const paths = planningPaths(projectDir, workstream);
const lockPath = await acquireStateLock(paths.config);
try {
  // ALL migration phases (walk, write files, atomicWriteConfig, vcs.commit) inside this try.
} finally {
  await releaseStateLock(lockPath);
}
```

### Commit-message sanitization

**Source:** `sdk/src/query/commit.ts:44-66` (`sanitizeCommitMessage`)
**Apply to:** migration commit message string in `run.ts` (RESEARCH §Security "Commit message injection")

```typescript
import { sanitizeCommitMessage } from '../../query/commit.js';

const message = sanitizeCommitMessage(`chore(vcs): migrate ${oldTarget} → ${target} [gsd-migrate-vcs v1]`);
await newVcs.commit({ files, message });
```

### Backend-explicit-kind adapter construction (post-flip)

**Source:** `sdk/src/vcs/index.ts:20-31` (`createVcsAdapter(cwd, { kind })`)
**Apply to:** `format-migration/run.ts` Phase 5 (the migration commit)

RESEARCH Pitfall 6 (lines 442-453): adapter is frozen at construction; the pre-flip adapter would commit to the OLD backend after the config.json flip. Always reconstruct with explicit `{ kind: target }` post-flip.

### Schema parity edits (mandatory pair)

**Source:** RESEARCH §"vcs.adapter Write Semantics" Option A + Pitfall 7
**Apply to:** plan 06-01 — both files in the SAME commit:
- `sdk/src/query/config-schema.ts` line 18-76 `VALID_CONFIG_KEYS` Set
- `get-shit-done/bin/lib/config-schema.cjs` line 16-77 mirror

Failing to edit both atomically triggers `tests/config-schema-sdk-parity.test.cjs` per #2653.

### `expr.children` factory addition

**Source:** `sdk/src/vcs/expr.ts:67-69` (existing `range` factory shape)
**Apply to:** plan 06-01

**Pattern from expr.ts:67-69:**
```typescript
range(from: RevisionExpr, to: RevisionExpr): RevisionExpr {
  return brand(`range:${from as unknown as string}..${to as unknown as string}`);
},
```

**Add (mirroring the same brand+encoded-form approach):**
```typescript
children(rev: RevisionExpr): RevisionExpr {
  return brand(`children:${rev as unknown as string}`);
},
```

**Then extend `parseExpr` (lines 96-108) with a `'children'` case** that returns `{ kind: 'children', inner: <parsed-rev> }`. The per-backend translators (`parse/jj-rev.ts` for jj — emits `<inner>+`; `parse/git-rev.ts` for git — emits `<inner>^@` or first-parent equivalent) need parallel updates. **Planner confirms the git-side mapping during plan 06-01 implementation** — RESEARCH Assumption A5 covers jj-side semantics but no git-side analog is documented.

### Static-catalog + manifest registration (Phase 5 shim pattern)

**Source:** `sdk/src/query/command-static-catalog-foundation.ts:14-25, 77-90` + `command-manifest.non-family.ts:47-58`
**Apply to:** plan 06-03 — register `migrate-vcs` verb

**Pattern from command-manifest.non-family.ts:47-58:**
```typescript
// Phase 5 plan 05-01 Task 3 (D-33 batch 1): 11 new VCS command verbs.
{ canonical: 'push',           aliases: [], mutation: true,  outputMode: 'json' },
{ canonical: 'reset',          aliases: [], mutation: true,  outputMode: 'json' },
...
{ canonical: 'restore',        aliases: [], mutation: true,  outputMode: 'json' },
```

**Add (appended to the same block):**
```typescript
// Phase 6 plan 06-03: bidirectional VCS migration command.
{ canonical: 'migrate-vcs',    aliases: [], mutation: true,  outputMode: 'json' },
```

**Pattern from command-static-catalog-foundation.ts:14-25, 77-90:**
```typescript
// Phase 5 plan 05-01 Task 3 (D-33 batch 1): 11 new query verb shims.
import { pushQuery } from './push.js';
...
import { restoreQuery } from './restore.js';
...
// Phase 5 plan 05-01 Task 3 (D-33 batch 1): 11 new query verb registrations.
['push', pushQuery],
['reset', resetQuery],
...
['restore', restoreQuery],
```

**Add:**
```typescript
import { migrateVcsQuery } from './migrate-vcs.js';
...
['migrate-vcs', migrateVcsQuery],
```

Also register `init.migrate-vcs` if the init handler lives in init.ts (it does — RESEARCH §"`init.migrate-vcs` handler shape"). The init-handler registration site is in `command-manifest.init.ts`; planner audits that file in plan 06-03 task 1.

---

## No Analog Found

Files with no close match in the existing codebase. The planner falls back to RESEARCH patterns for these.

| New File | Role | Why No Analog | Fallback Source |
|----------|------|---------------|------------------|
| `sdk/src/vcs/format-migration/walk.ts` | recursive `.planning/` glob walker | The codebase has no existing recursive glob walker; `planningPaths` does single-path resolution. | RESEARCH §"Don't Hand-Roll" → `node:fs.readdirSync(dir, { recursive: true, withFileTypes: true })` stdlib usage; glob set fixed in §"`.planning/` Surface Inventory" line 728-744 |
| `sdk/src/vcs/format-migration/report.ts` | markdown table emitter for ancestor-walk orphans | No existing handler writes a per-migration advisory report. Closest distant analog: `sdk/src/query/state-mutation.ts:237-...` (`syncStateFrontmatter` — md-string builder), but role differs (state vs intel). | RESEARCH §"Sample report row shape" (CONTEXT lines 125-129) + D-01 (orphan-handling + report contents) |
| `.planning/intel/rebase-log.md` | manual per-week journal | Phase 6's BROWN-02 file is brand-new; no in-tree analog. | RESEARCH §"BROWN-02 Retro File Shape" lines 830-840 — 3-col table (Date / Conflicts / Notes), single seed row at first weekly rebase |
| `.planning/intel/06-migration-report.md` | runtime-emitted advisory doc | Path mirrors the existing `.planning/intel/git-touchpoints.md` shape (single intel doc per concern), but no programmatic-emitter analog. | RESEARCH §"Sample report row shape" (CONTEXT lines 125-129); planner picks markdown table vs JSON per D-05 |

---

## Metadata

**Analog search scope:**
- `sdk/src/query/**/*.ts` (all 100+ verb handlers — focused on Phase 5 plan 05-01 shims; latest patterns)
- `sdk/src/vcs/**/*.ts` (parse layer, expr factory, backends, fixtures)
- `sdk/src/vcs/__tests__/**/*.ts` (vcs-fixture, synth-planning-fixture, expr.test, gsd-sdk-binary-shape.integration.test)
- `get-shit-done/workflows/*.md` (focus on smaller commands: undo, ship, quick — not the orchestrator-heavy plan-phase/execute-phase)
- `.planning/phases/05-*/05-RESEARCH.md` (Phase 5 plan-01 11-shim shape — read indirectly via plan 06 RESEARCH)

**Files scanned for analog matches:** 38 source files, 12 test files, 4 workflow markdowns

**Key codebase patterns identified:**
1. **Phase 5 11-shim shape** (Phase 5 plan 05-01): SDK verb handlers are thin (50-100 LOC), do argv parse + `createVcsAdapter` + dispatch + `{ data: { ok, ... } }` envelope. Migration command follows this shape; the heavy lifting goes into the `format-migration/` library, not the verb file.
2. **Atomic mutation + state lock**: `configSet` (config-mutation.ts:191-251) is the canonical read-modify-write pattern. Migration extends it from milliseconds to seconds duration but uses the same lock.
3. **Pure-string transformers**: `sanitizeCommitMessage` (commit.ts:44-66) is the shape for `rewrite.ts:migrateContent`. Pure in / pure out + multi-regex `.replace()` calls.
4. **expr factory + per-backend translator pair**: `expr.range` (expr.ts:67-69) shows the brand-and-encode pattern; `expr.children` follows it with parallel updates to `parse/jj-rev.ts` and `parse/git-rev.ts`.
5. **synth-planning-fixture + jj-colocated**: `synth-planning-fixture.ts` was built in Phase 5 plan 05-04 D-34 explicitly for Phase 6 BROWN-01 deferral. Round-trip integration tests consume this fixture verbatim.
6. **Black-box binary contract test**: `gsd-sdk-binary-shape.integration.test.ts` (Phase 5 plan 05-06) is the analog for the post-flip envelope assertion. Use spawnSync against the built `bin/gsd-sdk.js`, not programmatic dispatch.
7. **Workflow markdown auto-discovery**: No edit to `command-static-catalog-domain.ts` is needed for the slash command — the markdown file's filename IS the slash command name (RESEARCH §"Don't Hand-Roll" — verified against existing patterns).

**Pattern extraction date:** 2026-05-14

---

## Mapping Notes for the Planner

- **Plan 06-01 should land FIRST.** It contains the schema parity edit (`vcs.adapter` in both `.ts` and `.cjs`), the `expr.children` factory addition, the `has_jj` peer field on `initIngestDocs`, and an empirical jj-revset probe (RESEARCH Assumptions A1, A5). Plan 06-02 and 06-03 both depend on `expr.children`.
- **Plan 06-02 (rewriter library)** has zero CLI surface. It is purely the `sdk/src/vcs/format-migration/` package (5 source files + 4 tests). The library exposes `runMigration(cwd, target, opts) → MigrationResult` and pure helpers.
- **Plan 06-03 (migration command)** consumes the plan 06-02 library and wires it into the SDK verb + workflow markdown. Also lands the greenfield gate edit to `new-project.md:108-112` and the `initMigrateVcs` handler.
- **Plan 06-04 (BROWN-01 + BROWN-02)** is manual/checkpoint-gated. It produces the first `.planning/intel/rebase-log.md` entry, runs the sibling-clone dogfood validation (RESEARCH §"BROWN-01 Dogfood Safety Strategy"), and lifts the "use git not jj" memory rule via a single `.planning/STATE.md` line edit.
- **All four plans MUST execute under the "use git not jj" memory rule** (RESEARCH Assumption A10). The rule lifts only after BROWN-01 dogfood gate in plan 06-04. The plans' implementation phases use raw `git commit`; the migration command itself is what enables jj inside this repo, not its development.
- **Cross-cutting test gates per RESEARCH §Validation Architecture:** Each plan must pass `cd sdk && pnpm test --filter <plan-relevant-pattern>`, then the phase gate runs the full suite + `lint-vcs-no-raw-git.cjs` + `tests/config-schema-sdk-parity.test.cjs` before `/gsd-verify-work`.
