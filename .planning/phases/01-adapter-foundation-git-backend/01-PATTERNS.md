# Phase 1: Adapter Foundation + Git Backend - Pattern Map

**Mapped:** 2026-05-09
**Files analyzed:** 12 files to be created + 4 files to be modified
**Analogs found:** 14 / 16 (2 files have no direct analog — `expr.ts` brand pattern, `parse/git-rev.ts` translator)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `sdk/src/vcs/index.ts` (NEW) | factory | request-response | `sdk/src/query-gsd-tools-runtime.ts` | role-match (factory composition; not frozen-object) |
| `sdk/src/vcs/types.ts` (NEW) | type-definitions | n/a | `sdk/src/types.ts` | exact (sole `types.ts` in sdk/src; same module convention) |
| `sdk/src/vcs/exec.ts` (NEW) | utility (spawn wrapper) | request-response | `get-shit-done/bin/lib/core.cjs:725-758` (and identical `worktree-safety.cjs:11-49`) | exact (byte-identity reference per GIT-02) |
| `sdk/src/vcs/expr.ts` (NEW) | utility (branded type + factories) | n/a | (no exact analog; closest is `sdk/src/errors.ts` for module shape) | role-match for shape only |
| `sdk/src/vcs/backends.ts` (NEW) | config (constants + parser) | n/a | `sdk/src/errors.ts` (small enum + helper module) | role-match |
| `sdk/src/vcs/hook-bridge.ts` (NEW) | utility (subprocess hook) | request-response | `core.cjs` execGit caller pattern | role-match |
| `sdk/src/vcs/parse/git-rev.ts` (NEW) | utility (translator) | transform | (no analog — pure stringification) | none |
| `sdk/src/vcs/parse/jj-rev.ts` (NEW, stub) | utility (translator stub) | transform | (none — Phase 3 fills) | none |
| `sdk/src/vcs/backends/git.ts` (NEW) | service (backend impl) | CRUD / request-response | `get-shit-done/bin/lib/commands.cjs:300-415` (execGit-based commit pipeline) + `worktree-safety.cjs:78-107` (porcelain parse) | exact (this is the lift target) |
| `sdk/src/vcs/__tests__/vcs-fixture.ts` (NEW) | test (vitest fixture) | n/a | `sdk/src/query/commit.test.ts:14-30` (beforeEach tmp git repo) | role-match (no existing `test.extend` usage in sdk/src) |
| `sdk/src/vcs/__tests__/adapter-contract.test.ts` (NEW) | test (parameterized) | n/a | `sdk/src/query/init.test.ts:374` (sole `describe.each` user) | role-match |
| `tests/helpers.cjs` (MODIFY) | test-helper (CJS) | n/a | `tests/helpers.cjs:86-104` `createTempGitProject` | exact (extending the same file) |
| `tests/vcs-adapter-contract.test.cjs` (NEW) | test (`node --test`) | n/a | `tests/bug-2545-copilot-unreplaced-paths.test.cjs:22-37` shape | role-match |
| `scripts/lint-vcs-no-raw-git.cjs` (NEW) | tooling (lint scanner) | batch | `scripts/lint-no-source-grep.cjs:73-175` | exact (RESEARCH explicitly names this template) |
| `scripts/lint-vcs-no-raw-git.allow.json` (NEW) | config (allowlist data) | n/a | (no JSON-config analog in scripts/) | none — fresh artifact |
| `sdk/tsconfig.cjs.json` (NEW) | config (build) | n/a | `sdk/tsconfig.json` | exact (mirror + override 4 fields) |
| `sdk/package.json` (MODIFY) | config | n/a | self (existing scripts block) | exact |
| `.github/workflows/test.yml` (MODIFY) | ci-config | n/a | `.github/workflows/test.yml:21-35` (lint-tests job) | exact (extending existing job) |

---

## Pattern Assignments

### `sdk/src/vcs/exec.ts` (utility, request-response)

**Analog:** `get-shit-done/bin/lib/core.cjs` (lines 725–758) — five-field shape with `timedOut`/`error` extras.
**Cross-check analog:** `get-shit-done/bin/lib/worktree-safety.cjs` lines 11–49 — identical implementation under the name `execGitDefault`. RESEARCH Pitfall 4 names this the byte-identity reference.

**Imports / module-level constant pattern** (`core.cjs:725-729`):
```javascript
// Default timeout for worktree-related git subprocess calls (matches worktree-safety.cjs).
// Prevents `git worktree list --porcelain` and similar calls from blocking the parent
// process indefinitely when git is stalled (locked index, hung remote, NFS mount freeze).
// Callers can override via an options bag if needed.
const DEFAULT_GIT_TIMEOUT_MS = 10000;
```

**Core pattern — the five-field execGit** (`core.cjs:742-758`, copy verbatim, port to TS):
```javascript
function execGit(cwd, args, options = {}) {
  const timeout = options.timeout ?? DEFAULT_GIT_TIMEOUT_MS;
  const result = spawnSync('git', args, {
    cwd,
    stdio: 'pipe',
    encoding: 'utf-8',
    timeout,
  });
  const timedOut = result.signal === 'SIGTERM' && result.error?.code === 'ETIMEDOUT';
  return {
    exitCode: result.status ?? 1,
    stdout: (result.stdout ?? '').toString().trim(),
    stderr: (result.stderr ?? '').toString().trim(),
    timedOut,
    error: result.error ?? null,
  };
}
```

**TS port specifics:**
- Use `import { spawnSync } from 'node:child_process'` (same convention as `sdk/src/query/commit.ts:21`).
- Five-field `ExecResult` interface mirrors lines 751–757 exactly. Do **not** reduce to three fields like `commit.ts:37-48` does — RESEARCH Pitfall 4 calls this out as the trap.
- `VcsExecError` class lives in this same file. Carries `{exitCode, stdout, stderr, timedOut, error, args}` so callers can rebuild the diagnostic. Follow the `GSDError` shape from `sdk/src/errors.ts:43-51` (`extends Error`, `readonly` discriminator field set in constructor).
- Default timeout constant (`DEFAULT_VCS_TIMEOUT_MS = 10000`) at module top, matches both `core.cjs:729` and `worktree-safety.cjs:15`.

**JSDoc preamble pattern** (verbatim from `core.cjs:731-741`):
```
/**
 * Execute a git command with a bounded timeout.
 *
 * Return shape: { exitCode, stdout, stderr, timedOut, error }
 *   - timedOut: true when spawnSync reports SIGTERM + ETIMEDOUT — callers must
 *               branch on this to surface a structured warning (PRED.k302).
 *   - error:    spawnSync error object or null
 *
 * Backward-compatible: existing callers that only read exitCode/stdout/stderr
 * continue to work unchanged.
 */
```

---

### `sdk/src/vcs/types.ts` (type-definitions, n/a)

**Analog:** `sdk/src/types.ts` — sole `types.ts` in the sdk module; sets the convention.

**Imports/module convention** (`sdk/src/types.ts:1-9`):
```typescript
/**
 * Core type definitions for GSD-1 PLAN.md structures.
 *
 * These types model the YAML frontmatter + XML task bodies
 * that make up a GSD plan file.
 */

// ─── Frontmatter types ───────────────────────────────────────────────────────
```

**Conventions to copy:**
- Section banner comment style: `// ─── <name> ───…` (also used by `errors.ts:18`, `commit.ts:26,50,86`).
- All exports are `export interface` / `export type` / `export enum` — no runtime code in types.ts.
- JSDoc on every exported interface, with a one-line preamble.
- Discriminated union via literal-type field (see `GSDEvent` union on `types.ts:762-796`, `type: GSDEventType.X` is the discriminator). For VCS this is `kind: 'git' | 'jj'` per D-06.

**Discriminated-union pattern** (verbatim shape from `types.ts:762-796`):
```typescript
/**
 * Discriminated union of all GSD events.
 */
export type GSDEvent =
  | GSDSessionInitEvent
  | GSDSessionCompleteEvent
  | …;
```
Adapt for `VcsAdapter = GitVcsAdapter | JjVcsAdapter` per CONTEXT.md D-06/D-07 + RESEARCH "Pattern 1".

**Branded type pattern** (no existing analog in sdk/src — verified via grep `readonly __brand` returned no matches): introduced fresh in this phase per D-09 (`type RevisionExpr = string & { readonly __brand: unique symbol }`). The shape is standard TS idiom; no copy-from needed.

---

### `sdk/src/vcs/index.ts` (factory, request-response)

**Analog:** `sdk/src/query-gsd-tools-runtime.ts` — sole "compose-a-runtime-from-parts" factory in sdk/src.

**Factory composition pattern** (`query-gsd-tools-runtime.ts:16-83`):
```typescript
export interface GSDToolsRuntime {
  bridge: QueryRuntimeBridge;
}

export function createGSDToolsRuntime(opts: {
  projectDir: string;
  gsdToolsPath: string;
  // …
}): GSDToolsRuntime {
  const registry = createRegistry(opts.eventStream, opts.sessionId);
  const queryToolsErrorFactory = createQueryToolsErrorFactory();
  const subprocessAdapter = new QuerySubprocessAdapter({…});
  // …compose
  return { bridge };
}
```

**Conventions to copy:**
- `export interface FooRuntime { … }` followed by `export function createFooRuntime(opts: {…}): FooRuntime`.
- Single-options-bag parameter (not positional args), documented inline.
- Factory body is straight-line composition; no try/catch.

**Adaptations for VCS factory (per D-06/D-07 + RESEARCH):**
- `createVcsAdapter(cwd: string, opts?: { kind?: VcsKind }): VcsAdapter` — return-type is the discriminated union.
- Auto-detect via `existsSync('.jj') ? 'jj' : 'git'` with `GSD_VCS` env override (VCS-03). Use `import { existsSync } from 'node:fs'` (same convention as `worktree-safety.cjs:7` and `sdk/src/query/commit.ts:20-21`).
- **Wrap the returned object in `Object.freeze(...)`** at construction — RESEARCH anti-pattern: shallow freeze leaks. Each nested namespace (`vcs.refs`, `vcs.workspace`, `vcs.refs.bookmarks`) must be `Object.freeze`d independently.
- Phase 1 throws `new GSDError('jj backend not yet implemented', ErrorClassification.Blocked)` if `kind === 'jj'` reaches the constructor. Use `sdk/src/errors.ts:43-51` `GSDError` directly.

---

### `sdk/src/vcs/backends/git.ts` (service, CRUD / request-response)

**Primary analog:** `get-shit-done/bin/lib/commands.cjs:300-415` — the `cmdCommit` block. Demonstrates the exact existing call pattern that this backend lifts (stage → commit → resolve hash, all via `execGit(cwd, [...])`).

**Existing exec call-site shape** (`commands.cjs:305-352`):
```javascript
const currentBranch = execGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
// …
const create = execGit(cwd, ['checkout', '-b', branchName]);
execGit(cwd, ['checkout', branchName]);
// …
execGit(cwd, ['rm', '--cached', '--ignore-unmatch', file]);
execGit(cwd, ['add', file]);
const commitResult = execGit(cwd, commitArgs);
const hashResult = execGit(cwd, ['rev-parse', '--short', 'HEAD']);
```

This is the verbatim shape the git backend must reproduce per GIT-01 ("1:1 with existing `execSync('git …')`" call sites). Each verb on `vcs.commit / vcs.refs / vcs.refs.bookmarks / vcs.log / vcs.status / vcs.diff / vcs.workspace` resolves to one or more `exec(cwd, ['<verb>', ...])` invocations against the wrapper from `sdk/src/vcs/exec.ts`.

**Inline `execSync('git …')` callers to mirror behaviorally** (per RESEARCH "26 execGit + 5 inline" inventory):
- `commands.cjs:994` — `execSync('git diff --cached --name-only', { cwd, encoding: 'utf-8' })` → `vcs.diff({ staged: true, nameOnly: true })`.
- `init.cjs:1519, 1641` — `execSync('git status --porcelain', …)` → `vcs.status({ porcelain: true })`.
- `init.cjs:1538` — `execSync('git --version', …)` → `vcs.gitOnly.version()` (or surface in adapter init detection).
- `core.cjs:931+` (and `commands.cjs:917-924`) — `execGit(cwd, ['rev-list', '--count', 'HEAD'])`, `['rev-list', '--max-parents=0', 'HEAD']`, `['show', '-s', '--format=%as', firstCommit]` → cover via `vcs.log({…})`.

**Worktree porcelain parse** — DO NOT duplicate; consume `worktree-safety.cjs`. Existing exported function (lines 78-107):
```javascript
function readWorktreeList(repoRoot, deps = {}) {
  const execGit = deps.execGit || execGitDefault;
  const listResult = execGit(repoRoot, ['worktree', 'list', '--porcelain']);
  if (listResult.timedOut) {
    return { ok: false, reason: 'git_timed_out', porcelain: '', entries: [] };
  }
  if (listResult.exitCode !== 0) {
    return { ok: false, reason: 'git_list_failed', porcelain: '', entries: [] };
  }
  return { ok: true, reason: 'ok', porcelain: listResult.stdout, entries: parseWorktreeEntries(listResult.stdout) };
}
```
**Pattern for `vcs.workspace.list()` in git.ts:** call out to `readWorktreeList(repoRoot, { execGit: <adapter exec> })` via dependency injection (the `deps.execGit` hook is already in place — Phase 1 just passes the adapter's exec). Per RESEARCH Pitfall 5, the safety policy stays in `worktree-safety.cjs`; the adapter's `vcs.workspace.*` is a thinner verb layer.

**Frozen plain-object construction** (the locked D-06/D-07 shape — RESEARCH Pattern 1):
```typescript
export function createGitAdapter(cwd: string): GitVcsAdapter {
  const exec = (args: string[], opts?: ExecOpts) => vcsExec(cwd, args, opts);

  const refs = Object.freeze({
    head: gitHead, // RevisionExpr constant
    parent: gitParent,
    bookmarks: Object.freeze({
      list: () => { /* exec(['branch', '--format=%(refname:short)']) */ },
      create: (name, rev) => { /* exec(['branch', name, toGitRev(rev)]) */ },
      // …
    }),
  });
  // …compose all namespaces, each frozen…

  return Object.freeze({
    kind: 'git' as const,
    cwd,
    commit: (input) => { /* … */ },
    log: (opts) => { /* … */ },
    refs,
    workspace: Object.freeze({ /* … */ }),
    hooks: Object.freeze({ fire: (stage, ctx) => { /* … */ } }),
    findConflicts: (opts) => { /* … */ },
    push: (opts) => exec(['push', /* … */]),
    fetch: (opts) => exec(['fetch', /* … */]),
    gitOnly: Object.freeze({
      createAnnotatedTag: (name, msg, rev) => { /* … */ },
    }),
  });
}
```

---

### `sdk/src/vcs/__tests__/vcs-fixture.ts` (test, vitest fixture)

**Analog:** `sdk/src/query/commit.test.ts:14-30` — sole pattern in sdk/src for a vitest test that initializes a tmp git repo. There are NO existing `test.extend(...)` or `describe.for(...)` users in sdk/src/**/*.test.ts (verified via grep). One `describe.each` user at `sdk/src/query/init.test.ts:374`.

**Tmp-repo init pattern** (verbatim from `commit.test.ts:14-30`):
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'gsd-commit-'));
  execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.name "Test User"', { cwd: tmpDir, stdio: 'pipe' });
  await mkdir(join(tmpDir, '.planning'), { recursive: true });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});
```

**Adaptation to `test.extend({vcs, cwd})`** (TEST-02 — no existing fixture; introduce fresh per vitest 3.0 docs):
```typescript
import { test as base } from 'vitest';

export interface VcsFixture { vcs: VcsAdapter; cwd: string; }

export const test = base.extend<VcsFixture>({
  cwd: async ({}, use) => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'gsd-vcs-'));
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config commit.gpgsign false', { cwd: tmpDir, stdio: 'pipe' });
    await use(tmpDir);
    await rm(tmpDir, { recursive: true, force: true });
  },
  vcs: async ({ cwd }, use) => {
    const adapter = createVcsAdapter(cwd, { kind: 'git' });
    await use(adapter);
  },
});
```

**`describe.for([...BACKENDS])` parameterization** — no existing user in repo; introduce per TEST-01. Closest pattern is `init.test.ts:374` `describe.each([...])` which the planner can reference for the calling-convention shape.

---

### `tests/helpers.cjs` (test-helper, CJS — MODIFY/EXTEND)

**Analog:** `tests/helpers.cjs:86-104` — existing `createTempGitProject` is the CJS-side primitive D-15 references.

**Existing tmp-repo init** (verbatim — extend, do not replace):
```javascript
function createTempGitProject(prefix = 'gsd-test-') {
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), prefix));
  fs.mkdirSync(path.join(tmpDir, '.planning', 'phases'), { recursive: true });

  execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config commit.gpgsign false', { cwd: tmpDir, stdio: 'pipe' });

  fs.writeFileSync(
    path.join(tmpDir, '.planning', 'PROJECT.md'),
    '# Project\n\nTest project.\n'
  );

  execSync('git add -A', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git commit -m "initial commit"', { cwd: tmpDir, stdio: 'pipe' });

  return tmpDir;
}
```

**Module-export convention to extend** (verbatim from `helpers.cjs:173`):
```javascript
module.exports = { runGsdTools, createTempDir, createTempProject, createTempGitProject, cleanup, parseFrontmatter, isUsageOutput, TOOLS_PATH };
```
**Pattern for new exports:** add `vcsTest`, `BACKENDS_AVAILABLE`, `parseBackendsEnv` to this object. Do NOT introduce a second exports file.

**`vcsTest(kind, fn)` shape** — RESEARCH Pitfall 1 mandates a hand-rolled loop, NOT vitest API:
```javascript
const { describe, it } = require('node:test');

function vcsTest(kindOrKinds, suiteFn) {
  // Loop manually — node --test has no describe.for / test.extend
  const kinds = Array.isArray(kindOrKinds) ? kindOrKinds : [kindOrKinds];
  for (const kind of kinds) {
    describe(`vcs[${kind}]`, () => {
      let cwd;
      let vcs;
      // beforeEach equivalent via test() local setup
      suiteFn({ getKind: () => kind, getCwd: () => cwd, getVcs: () => vcs });
    });
  }
}
```
The CJS-side `vcsTest` MUST `require('../sdk/dist-cjs/vcs/backends.js')` (NOT re-implement) for `BACKENDS_AVAILABLE` and `parseBackendsEnv` — RESEARCH Pitfall 6 ("BACKENDS list and GSD_TEST_BACKENDS parsing diverge between CJS and TS").

**Pre-build guard** (RESEARCH Pitfall 3):
```javascript
let vcsModule;
try {
  vcsModule = require('../sdk/dist-cjs/vcs/index.js');
} catch (err) {
  throw new Error('VCS adapter not built. Run: pnpm -F sdk build:cjs');
}
```

---

### `tests/vcs-adapter-contract.test.cjs` (test, `node --test` CJS-side)

**Analog:** `tests/bug-2545-copilot-unreplaced-paths.test.cjs:22-37` — generic `describe(...)` + `test(...)` shape under `node --test`.

**Imports + describe/test pattern** (paraphrased from `bug-2545-…test.cjs:1-37`):
```javascript
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { vcsTest, cleanup } = require('./helpers.cjs');

vcsTest('git', ({ getVcs, getCwd }) => {
  test('vcs.commit advances HEAD', () => {
    const vcs = getVcs();
    // …
  });
});
```

**Test runner invocation** (already in place — `scripts/run-tests.cjs:26-32`):
```javascript
execFileSync(process.execPath, ['--test', concurrency, ...files], {
  stdio: 'inherit',
  env: { ...process.env },
});
```
No change required to the runner; new test file is auto-picked up by the `*.test.cjs` glob in `run-tests.cjs:13`.

---

### `scripts/lint-vcs-no-raw-git.cjs` (tooling, batch)

**Analog:** `scripts/lint-no-source-grep.cjs:1-175` — RESEARCH explicitly names this the template (D-18, "matches existing `lint-no-source-grep.cjs` pattern").

**Imports + shebang + strict** (`lint-no-source-grep.cjs:1-25`):
```javascript
#!/usr/bin/env node
/**
 * lint-no-source-grep.cjs
 *
 * Enforces the "no source-grep tests" rule:
 * …
 *
 * Exit 0 = clean. Exit 1 = violations found (with diagnostics).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const TESTS_DIR = path.join(__dirname, '..', 'tests');
const ALLOW_ANNOTATION = /\/\/\s*allow-test-rule:\s*\S/;
```

**Allowlist annotation pattern** — copy the inline-comment escape (`lint-no-source-grep.cjs:28`):
```javascript
const ALLOW_ANNOTATION = /\/\/\s*allow-test-rule:\s*\S/;
// …
if (ALLOW_ANNOTATION.test(content)) return null;
```
For VCS lint use: `/\/\/\s*vcs-lint:allow-git-here\s*\S/` (per RESEARCH Pitfall 2).

**Per-file check function** (`lint-no-source-grep.cjs:73-137`):
```javascript
function check(filepath) {
  const content = fs.readFileSync(filepath, 'utf-8');
  const rel = path.relative(path.join(__dirname, '..'), filepath);

  if (ALLOW_ANNOTATION.test(content)) return null;

  const violations = [];

  // Pattern A: …
  if (PATTERN_A.test(content)) {
    violations.push({
      reason: 'description',
      fix: 'how to fix, or add // <annotation>',
    });
  }

  // …more patterns

  if (violations.length === 0) return null;
  return { file: rel, violations };
}
```

**Recursive file finder** (`lint-no-source-grep.cjs:139-150`):
```javascript
function findTestFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findTestFiles(full));
    } else if (entry.name.endsWith('.test.cjs')) {
      results.push(full);
    }
  }
  return results;
}
```
**Adaptation:** for VCS lint, scan the **whole repo** (not just `tests/`). Skip `node_modules`, `.git`, `.jj`, `dist`, `dist-cjs`. Match files by extension allowlist (`.cjs`, `.js`, `.ts`, `.mjs`, `.yml`).

**Driver + diagnostic emission** (`lint-no-source-grep.cjs:152-175`):
```javascript
const testFiles = findTestFiles(TESTS_DIR);
const violations = testFiles.map(check).filter(Boolean);

if (violations.length === 0) {
  console.log(`ok lint-no-source-grep: ${testFiles.length} test files checked, 0 violations`);
  process.exit(0);
}

const totalIssues = violations.reduce((n, v) => n + v.violations.length, 0);
process.stderr.write(`\nERROR lint-no-source-grep: ${totalIssues} violation(s) across ${violations.length} file(s)\n\n`);
for (const f of violations) {
  process.stderr.write(`  ${f.file}\n`);
  for (const v of f.violations) {
    process.stderr.write(`    Problem : ${v.reason}\n`);
    process.stderr.write(`    Fix     : ${v.fix}\n`);
  }
  process.stderr.write('\n');
}
process.exit(1);
```

**Pattern matchers to use (per D-17/D-18 "default-deny on any git invocation"):**
```javascript
const GIT_PATTERNS = [
  { re: /spawnSync\s*\(\s*['"]git['"]/, label: "spawnSync('git', …)" },
  { re: /spawn\s*\(\s*['"]git['"]/,     label: "spawn('git', …)" },
  { re: /execFileSync\s*\(\s*['"]git['"]/, label: "execFileSync('git', …)" },
  { re: /execFile\s*\(\s*['"]git['"]/,  label: "execFile('git', …)" },
  { re: /execSync\s*\(\s*['"`]git\s/,   label: "execSync('git …', …)" },
  { re: /\bexec\s*\(\s*['"`]git\s/,     label: "exec('git …', …)" },
];
```

**Allowlist-as-JSON pattern** — fresh artifact (no analog in scripts/). Recommended structure (matches RESEARCH "checked-in JSON file (`scripts/lint-vcs-no-raw-git.allow.json`)"):
```json
{
  "files": [
    "sdk/src/vcs/backends/git.ts",
    "sdk/src/vcs/parse/git-rev.ts",
    "sdk/src/vcs/exec.ts",
    "tests/helpers.cjs"
  ],
  "globs": [
    "sdk/src/vcs/__tests__/**",
    ".github/workflows/**",
    "get-shit-done/bin/lib/*.cjs",
    ".githooks/**",
    "docs/upstream-rebase.md",
    ".planning/intel/git-touchpoints.md"
  ]
}
```
Load via `require('./lint-vcs-no-raw-git.allow.json')` at script top.

---

### `sdk/tsconfig.cjs.json` (config, build)

**Analog:** `sdk/tsconfig.json` — mirror entirely except for D-01's four field overrides.

**Existing tsconfig** (`sdk/tsconfig.json:1-20`, full file):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts", "src/**/*.integration.test.ts", "dist", "node_modules"]
}
```

**Pattern for `sdk/tsconfig.cjs.json`** — per D-01, extend and override only these fields:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "commonjs",
    "moduleResolution": "node",
    "outDir": "dist-cjs"
  },
  "include": ["src/vcs/**/*.ts"],
  "exclude": ["src/vcs/**/*.test.ts", "src/vcs/__tests__/**", "dist", "dist-cjs", "node_modules"]
}
```

---

### `sdk/package.json` (config — MODIFY)

**Analog:** self — extend the `scripts` block (`sdk/package.json:36-43`).

**Existing scripts block** (verbatim):
```json
"scripts": {
  "build": "tsc",
  "check:alias-drift": "pnpm run build && node scripts/check-command-aliases-fresh.mjs",
  "prepublishOnly": "rm -rf dist && tsc && chmod +x dist/cli.js",
  "test": "vitest run",
  "test:unit": "vitest run --project unit",
  "test:integration": "vitest run --project integration"
}
```

**Pattern for additions (D-01/D-03):**
```json
"scripts": {
  "build": "tsc && tsc -p tsconfig.cjs.json",
  "build:esm": "tsc",
  "build:cjs": "tsc -p tsconfig.cjs.json",
  "check:alias-drift": "pnpm run build && node scripts/check-command-aliases-fresh.mjs",
  "dev": "tsc -w & tsc -p tsconfig.cjs.json -w",
  "prepublishOnly": "rm -rf dist dist-cjs && tsc && tsc -p tsconfig.cjs.json && chmod +x dist/cli.js",
  "test": "vitest run",
  "test:unit": "vitest run --project unit",
  "test:integration": "vitest run --project integration"
}
```
Note: `dev` script uses POSIX `&` (zero-dep approach per RESEARCH "Standard Stack — Alternatives Considered"). On Windows the user runs the two `tsc -w` commands in two terminals.

**`files` array to extend** (`sdk/package.json:17-21`):
```json
"files": ["dist", "shared", "prompts"]
```
**Pattern:** add `"dist-cjs"` if Option A from RESEARCH "Runtime State Inventory" is chosen. Phase 1 ships `dist-cjs/` as a published artifact for the in-workspace `bin/lib/*.cjs` consumers.

---

### `.github/workflows/test.yml` (ci-config — MODIFY)

**Analog:** self — extend the `lint-tests` job (`.github/workflows/test.yml:18-35`).

**Existing lint-tests job pattern** (verbatim):
```yaml
jobs:
  lint-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 2
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd  # v6.0.2
      - name: Set up Node.js
        uses: actions/setup-node@53b83947a5a98c8d113130e565377fae1a50d02f  # v6.3.0
        with:
          node-version: 24
      - name: Lint — no source-grep tests
        shell: bash
        run: node scripts/lint-no-source-grep.cjs
      - name: Lint — command contract (ADR-0002)
        shell: bash
        run: node scripts/lint-command-contract.cjs
```

**Pattern for the new step** (D-19 — add to the existing `lint-tests` job, do NOT introduce a new job):
```yaml
      - name: Lint — no raw git in jj-reachable code
        shell: bash
        run: node scripts/lint-vcs-no-raw-git.cjs
```

Conventions to copy:
- Pinned-SHA action references (full 40-char SHA + `  # vX.Y.Z` comment).
- `node-version: 24` matches the existing convention for static-lint jobs.
- `shell: bash` on every run step (Windows-portability convention per ADR-0002 era of the repo).

---

## Shared Patterns

### Section banner comments
**Source:** `sdk/src/types.ts:8`, `sdk/src/errors.ts:18,35,53`, `sdk/src/query/commit.ts:26,50,86`
**Apply to:** All new TypeScript files (`sdk/src/vcs/**/*.ts`)

```typescript
// ─── <Section Name> ──────────────────────────────────────────────────────────
```

Use this banner before each major export group (types, helpers, factory).

### Module-level JSDoc preamble
**Source:** `sdk/src/errors.ts:1-16`, `sdk/src/query/commit.ts:1-18`, `sdk/src/types.ts:1-7`
**Apply to:** All new `.ts` and `.cjs` files

```typescript
/**
 * <One-line title>
 *
 * <2-4 line description of purpose>
 *
 * @example
 * ```typescript
 * <minimal usage>
 * ```
 */
```

### Custom error class shape
**Source:** `sdk/src/errors.ts:43-51`
**Apply to:** `sdk/src/vcs/exec.ts` (`VcsExecError`)

```typescript
export class VcsExecError extends Error {
  readonly name = 'VcsExecError';
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly args: string[];

  constructor(message: string, fields: { exitCode: number; stdout: string; stderr: string; timedOut: boolean; args: string[] }) {
    super(message);
    this.exitCode = fields.exitCode;
    this.stdout = fields.stdout;
    this.stderr = fields.stderr;
    this.timedOut = fields.timedOut;
    this.args = fields.args;
  }
}
```

### Tmp-git-repo lifecycle (sdk-side)
**Source:** `sdk/src/query/commit.test.ts:14-30`
**Apply to:** `sdk/src/vcs/__tests__/vcs-fixture.ts` (the `cwd` fixture body)

```typescript
beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'gsd-vcs-'));
  execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.name "Test User"', { cwd: tmpDir, stdio: 'pipe' });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});
```

### Tmp-git-repo lifecycle (CJS-side)
**Source:** `tests/helpers.cjs:86-104` (already exists; reuse via `createTempGitProject`)
**Apply to:** `tests/helpers.cjs` (extension — wrap into `vcsTest` fixture)

### `import` style
**Source:** `sdk/src/query/commit.ts:20-24`, `sdk/src/query-gsd-tools-runtime.ts:1-10`
**Apply to:** All new `.ts` files

- Node builtins use the `node:` prefix: `import { spawnSync } from 'node:child_process'`, `import { readFile } from 'node:fs/promises'`.
- Internal imports omit extensions in source, but TS NodeNext requires `.js` extensions in compiled output — match `commit.ts:22-24` style: `import { GSDError } from '../errors.js'`.
- Type-only imports use `import type { … }`.

### Frozen-object construction (NEW — locked by D-06/D-07)
**Source:** No existing analog in sdk/src (verified — `Object.freeze` returns no matches in sdk/src). This pattern is introduced in Phase 1.
**Apply to:** `sdk/src/vcs/index.ts`, `sdk/src/vcs/backends/git.ts`

```typescript
// Each nested namespace MUST be Object.freeze'd independently.
// Object.freeze is shallow; mutability of nested namespaces leaks.
return Object.freeze({
  kind: 'git' as const,
  cwd,
  refs: Object.freeze({
    head: gitHead,
    parent: gitParent,
    bookmarks: Object.freeze({ list, create, move, delete: del, exists }),
  }),
  workspace: Object.freeze({ add, forget, list }),
  hooks: Object.freeze({ fire }),
  gitOnly: Object.freeze({ createAnnotatedTag }),
  // …
});
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `sdk/src/vcs/expr.ts` (RevisionExpr brand + factories) | utility | n/a | Branded-type pattern (`type X = string & { readonly __brand: unique symbol }`) is not used anywhere in `sdk/src` (verified via grep). The pattern is standard TS idiom; planner introduces fresh per D-09/D-10. |
| `sdk/src/vcs/parse/git-rev.ts` (toGitRev translator) | utility | transform | Pure structured-input → string translator with no existing analog. Planner authors against the `RevisionExpr` factory list per D-11. |
| `scripts/lint-vcs-no-raw-git.allow.json` (config data) | config | n/a | No JSON-based allowlist pattern exists in `scripts/`. Fresh artifact per D-18; structure proposed inline above. |

---

## Metadata

**Analog search scope:**
- `sdk/src/**/*.ts` (215+ files)
- `get-shit-done/bin/lib/*.cjs`
- `tests/*.test.cjs` and `tests/helpers.cjs`
- `scripts/*.cjs`
- `.github/workflows/*.yml`

**Files scanned:** ~250 (limited by Glob and targeted Grep, not full traversal)
**Pattern extraction date:** 2026-05-09
**Confidence:** HIGH on all analogs verified via direct Read; MEDIUM on the test-fixture shape (no existing `test.extend` user — pattern proposed against vitest 3.0+ docs cited in RESEARCH).
