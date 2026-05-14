# Architecture Research — VCS Adapter for GSD jj-port

**Domain:** VCS abstraction layer for a CLI/SDK toolkit (Node.js + TypeScript), dual backend (git + jj)
**Researched:** 2026-05-09
**Confidence:** HIGH on adapter shape / migration sequencing (well-trodden territory). MEDIUM on jj-specific hook design (no widely-deployed prior art exists yet — we are mostly inventing on top of `jj op log`). LOW on lefthook-style jj support (not yet shipped upstream as of research date).

---

## Executive Recommendation

A **shape-not-class** adapter: a frozen `VcsAdapter` plain object literal returned from a factory `createVcsAdapter(opts)`. Two implementations (`createGitAdapter`, `createJjAdapter`) live behind that factory. The adapter exposes **typed, mode-explicit methods** (sync vs async per call, not blanket), returns **structured results** for any operation whose output GSD already parses, and returns **raw bytes** for pass-through (e.g., `git diff` to stdout).

Module home is **`sdk/src/vcs/`** (TypeScript-first, single source of truth). The CJS runtime in `bin/lib/` consumes a `dist-cjs/` build via plain `require()`. **No hand-maintained CJS twin.** Test helpers (`tests/helpers.cjs`) likewise consume the built CJS.

Migration is **strangler-fig over a branch-by-abstraction core**: introduce the adapter with a git-only backend that wraps existing `execSync` semantics 1:1, migrate call sites file-by-file behind the same interface, *then* land the jj backend once the seam exists everywhere.

---

## System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                       Call sites (unchanged shape)                    │
│  bin/lib/{core,verify,commands,worktree-safety,init}.cjs              │
│  sdk/src/query/{commit,init,verify,progress,*}.ts                     │
│  tests/helpers.cjs   .githooks/*   hooks/lib/git-cmd.js               │
└──────────────────────────────┬───────────────────────────────────────┘
                               │  vcs.commit({...}), vcs.workspace.add(...)
                               │  vcs.log({...}), vcs.refs.head()
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       VcsAdapter (factory output)                     │
│  Public surface — frozen object of typed functions                    │
│  Methods grouped: refs / commit / log / status / diff / workspace /   │
│                   hooks / raw-exec                                    │
└────────────┬─────────────────────────────┬───────────────────────────┘
             │                             │
             ▼                             ▼
┌────────────────────────────┐ ┌──────────────────────────────────────┐
│  createGitAdapter()        │ │  createJjAdapter()                   │
│  Wraps spawnSync('git', …) │ │  Wraps spawnSync('jj', …)            │
│  Existing parsing logic    │ │  Translates GSD intents to jj verbs  │
│  preserved verbatim        │ │  + `jj git` colocation passthrough   │
└────────────┬───────────────┘ └─────────────────────┬────────────────┘
             │                                       │
             ▼                                       ▼
┌────────────────────────────┐ ┌──────────────────────────────────────┐
│   exec.ts (shared)         │ │  hook-bridge.ts (shared)             │
│   spawnSync wrapper, error │ │  pre-commit/pre-push trigger logic   │
│   model, stderr capture    │ │  (git: shells .githooks; jj: wrap)   │
└────────────────────────────┘ └──────────────────────────────────────┘
```

**Layering rule.** Call sites speak only the public adapter shape. Backends speak `exec.ts` and `hook-bridge.ts`. Backends never call each other. Tests inject an adapter via fixture, never via module mock.

---

## Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| `VcsAdapter` shape (`sdk/src/vcs/types.ts`) | Authoritative TypeScript interface — every method GSD uses | Discriminated `interface` with namespaced sub-objects (`adapter.workspace.add(...)` etc.) |
| `createVcsAdapter(opts)` factory (`index.ts`) | Auto-detect backend (`.jj` first, `.git` fallback, env override `GSD_VCS=git\|jj`) | Returns `Object.freeze(...)` of one of the two implementations |
| `createGitAdapter` (`backends/git.ts`) | Wrap existing `execSync('git ...')` semantics; output parsing identical to current call sites | Uses `exec.ts` for spawn; parses to structured types |
| `createJjAdapter` (`backends/jj.ts`) | Translate GSD intents to `jj` verbs; bridge through `jj git` for hosting ops; expose change-id-based refs | Uses `exec.ts`; depth-limited translation table |
| `exec.ts` | One-place spawn wrapper; uniform error type; preserves the **`{exitCode, stdout, stderr}` triplet** returned by today's `execGit` for migration neutrality | `spawnSync` (sync) and an `execAsync` twin for long-running ops |
| `hook-bridge.ts` | Ports the pre-commit/pre-push moments to whichever backend is active | git: invoke `.githooks/<name>`; jj: invoke same script driven by op-log delta or wrapper `jj` shim |
| `dist-cjs/` build output | CJS consumed by `bin/lib/*.cjs` and `tests/helpers.cjs` | tsc emits CJS via second tsconfig |

---

## Recommended Adapter Shape — Concrete Skeleton

```ts
// sdk/src/vcs/types.ts

export type VcsKind = 'git' | 'jj';

/** Uniform exec result — matches existing execGit() return shape exactly. */
export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface CommitInput {
  message: string;
  files?: string[];           // pathspec; empty = error (never implicit `.`)
  amend?: boolean;
  noVerify?: boolean;
}
export interface CommitResult {
  committed: boolean;
  hash: string | null;        // git: short SHA. jj: change-id short prefix.
  reason?: string;
  files?: string[];
}

export interface WorkspaceAdd {
  path: string;
  baseRef?: string;           // git: commit-ish; jj: revset
  name?: string;              // jj workspace name; git: derived from path
}
export interface WorkspaceInfo {
  path: string;
  name: string;
  head: string;               // commit SHA or change-id
  locked: boolean;            // git: from .git/worktrees/<n>/locked; jj: synthesized via lockfile
}

export interface VcsAdapter {
  readonly kind: VcsKind;
  readonly cwd: string;       // project root the adapter is bound to

  // Refs / queries — ALL SYNC (cheap; preserves CLI ergonomics)
  refs: {
    head(): string;                                // sha or change-id
    headShort(): string;
    isAncestor(a: string, b: string): boolean;
    listBranches(): string[];
    resolve(refish: string): string | null;
  };

  status: {
    stagedFiles(pathspec?: string[]): string[];   // git: `diff --cached --name-only`; jj: filtered diff vs parent
    workingTreeDirty(): boolean;
  };

  // Commit — SYNC
  commit(input: CommitInput): CommitResult;

  // Log — SYNC, structured
  log(opts: { range?: string; limit?: number; pathspec?: string[] }): Array<{
    hash: string;
    parents: string[];
    author: { name: string; email: string; date: string };
    subject: string;
    body: string;
  }>;

  diff: {
    nameOnly(opts: { staged?: boolean; range?: string; pathspec?: string[] }): string[];
    raw(opts: { staged?: boolean; range?: string }): string;   // returns the literal patch text
  };

  // Workspace — MIXED (add can be slow on jj; expose async variants)
  workspace: {
    list(): WorkspaceInfo[];
    add(input: WorkspaceAdd): WorkspaceInfo;
    addAsync(input: WorkspaceAdd): Promise<WorkspaceInfo>;
    remove(path: string, opts?: { force?: boolean }): void;
    lock(path: string, reason: string): void;
    unlock(path: string): void;
    pruneOrphaned(): { removed: string[]; kept: string[] };
  };

  // Hooks — single primitive both backends implement
  hooks: {
    fire(moment: 'pre-commit' | 'pre-push', ctx: { stagedFiles: string[]; remote?: string }): ExecResult;
  };

  // Escape hatch — for the long tail of GSD calls we don't want to enumerate
  raw(args: string[]): ExecResult;     // git backend: literal `git <args>`. jj: error or translation if recognized.
  rawAsync(args: string[]): Promise<ExecResult>;
}
```

**Why frozen object factory, not a class.** Three reasons:
1. **CJS consumption is trivial** — `const { createVcsAdapter } = require('@gsd/sdk/vcs')` works, no `new`, no prototype gotchas across the CJS/ESM seam (a real hazard called out by every dual-package guide — see Sources).
2. **Mocking in tests is direct** — pass a partial object literal as the adapter; no class extension, no `vi.mock`.
3. **Tree-shake friendliness for the SDK** — sub-objects can be lazily constructed inside the factory.

**Why namespaced sub-objects (`vcs.workspace.add(...)`) not flat (`vcs.workspaceAdd(...)`).** Discoverability for agents reading the file. Reduces the top-level surface from ~30 methods to ~8 namespaces. Mirrors how `simple-git` evolved — it started flat and grew sub-namespaces.

**Why preserve `{exitCode, stdout, stderr}` exactly.** This is the existing return shape of the inline `execGit` in `commit.ts` (lines 37–48). Keeping it byte-for-byte means migration is `s/execGit(cwd, args)/vcs.raw(args)/` — purely mechanical for the long tail, and the structured methods can be adopted at leisure without churning every site at once.

---

## Module Layout — CJS + TS Strategy

**Decision: TypeScript-first, single source, CJS build artifact for runtime.**

```
sdk/src/vcs/
├── index.ts                     # createVcsAdapter() factory + auto-detect
├── types.ts                     # VcsAdapter interface + all input/output types
├── exec.ts                      # spawnSync wrapper, ExecResult, VcsExecError
├── hook-bridge.ts               # pre-commit/pre-push trigger primitive
├── parse/
│   ├── git-log.ts               # parse `git log --pretty=format:...`
│   ├── git-status.ts            # parse `git status --porcelain=v2`
│   ├── jj-log.ts                # parse `jj log -T '...'` (jj templates)
│   └── jj-status.ts             # parse `jj st`
├── backends/
│   ├── git.ts                   # createGitAdapter()
│   └── jj.ts                    # createJjAdapter() + jj→git intent translation
└── __tests__/
    ├── adapter.contract.test.ts # parameterized: runs both backends through the same suite
    ├── git.unit.test.ts         # git-only edge cases
    └── jj.unit.test.ts          # jj-only edge cases (working-copy auto-snapshot, etc.)

dist-cjs/vcs/                    # tsc output (CJS) — what bin/lib/*.cjs require()s
└── ...mirror of src/vcs/...
```

### CJS/TS Build Configuration

- **Primary compile.** Existing `sdk/src/` already builds to `sdk/dist/` (ESM-or-CJS depending on current config — confirm during phase 1). The vcs module rides that pipeline; no new tooling.
- **CJS consumers in `bin/lib/`.** They `require('../../sdk/dist-cjs/vcs')` — same path style they already use for `sdk/dist/...`. If the SDK currently emits ESM only, add a `tsc -p tsconfig.cjs.json` step that emits to `dist-cjs/`. This is a one-time configuration cost, not a per-file maintenance burden.
- **Why not hand-maintain a CJS twin.** The team already migrated to pnpm and is keen on reducing maintenance surface. A second hand-written copy is a divergence vector — every adapter bug-fix would need to land twice, and the migration of ~36 call sites is already large. Compile-from-TS avoids it entirely.
- **Why not pure CJS for the adapter (skip TS).** The SDK side (`sdk/src/query/*.ts`) is already TS and benefits from typed `CommitInput`/`CommitResult`. Going pure CJS sacrifices that and is harder to evolve as the adapter grows. The cost of one extra tsc target is low.
- **Test helpers (`tests/helpers.cjs`).** They `require('./sdk/dist-cjs/vcs')` exactly like `bin/lib/`. No special-case path.

### Backend Selection (auto-detect)

```ts
// sdk/src/vcs/index.ts (sketch)
export function createVcsAdapter(cwd: string, opts?: { kind?: VcsKind }): VcsAdapter {
  const kind = opts?.kind ?? process.env.GSD_VCS ?? autoDetect(cwd);
  return kind === 'jj' ? createJjAdapter(cwd) : createGitAdapter(cwd);
}

function autoDetect(cwd: string): VcsKind {
  // Walk up looking for .jj first (jj-native or colocated jj is in use locally),
  // then .git. This mirrors the user's PROJECT.md statement: ".jj-native takes
  // priority when present; colocated jj sees both, prefer the jj backend so
  // jj-native semantics are exercised in tests."
  if (findUp(cwd, '.jj')) return 'jj';
  if (findUp(cwd, '.git')) return 'git';
  throw new VcsExecError('no .git or .jj found from ' + cwd);
}
```

`GSD_VCS=git` env override is the test-matrix knob (see Test Parameterization below).

---

## Architectural Patterns

### Pattern 1 — Branch by Abstraction (Fowler)

**What.** Introduce an abstraction (the adapter) without changing behavior, migrate clients one at a time behind that abstraction, *then* introduce the second implementation. **Multi-implementation only happens after every caller talks to the seam.**

**When to use.** Exactly this scenario: large codebase, long-lived migration, must keep main branch shippable throughout.

**Why this over a big-bang rewrite.** With ~5,100 LOC of VCS-touching code in five hotspot files plus 244 exec patterns across 36 files, a big-bang touches everything at once. Test breakage compounds. Risk and review burden scale super-linearly with patch size. Branch by Abstraction lets each PR be small and bisectable.

**Why this over Strangler Fig alone.** Strangler Fig works at perimeter; here git is *deep* in the SDK (commit handlers, query handlers, test helpers). The interception point isn't the public CLI — it's the inline `spawnSync('git', ...)` calls at the bottom of the call stack. Branch by Abstraction is the recommended pattern for that depth.

**Trade-off.** Adapter exists in a "trivial" state for some weeks (git-only, mechanical pass-through). This is a feature, not a bug — it forces every caller to migrate before any jj-specific logic complicates the contract. If we let jj logic land first, every caller migration becomes a behavioral change.

### Pattern 2 — Translation Adapter (jj-side)

**What.** The jj backend translates GSD's git-shaped intents to jj verbs at the boundary. GSD code thinks in `commit({message, files})`; the jj backend internally maps that to `jj describe -m '...'` followed by (if needed) `jj new`. The translation happens *inside the backend*, never leaking to call sites.

**When to use.** When the source domain (git semantics) is rich enough that callers can't reasonably learn the target domain (jj). GSD has years of git-shaped logic — call sites stay git-shaped.

**Trade-off.** Some operations don't translate cleanly (e.g., `jj` snapshots automatically — there's no explicit `git add` analog). The translation will sometimes be lossy or require an extra jj operation. Document the impedance in `backends/jj.ts` per-method docstrings.

**Example impedance:**
- `git add file && git commit -m "msg"` → `jj` stages everything in working copy automatically; the adapter must `jj split` or `jj commit -- <pathspec>` to honor `files: [...]`.
- `git commit --amend` → `jj describe` (which IS `git commit --amend`) per the jj docs.
- `git rev-parse HEAD` → `jj log -r @ -T 'change_id'` or `jj log -r @ --no-graph -T 'commit_id'` depending on whether GSD wants the change-id or the underlying commit.

### Pattern 3 — Sync-First With Targeted Async

**What.** Default to `spawnSync` to match existing CLI ergonomics (`execSync` is the dominant pattern today). Expose `*Async` variants only for operations whose latency is meaningfully large on the jj side, specifically `workspace.addAsync`. This keeps the migration "boring" for 95% of call sites.

**When to use.** When the existing call sites are sync and their latency profile is acceptable. Don't async-paint the whole API just because async is fashionable.

**Trade-off.** Two surfaces for workspace ops. Acceptable: exact same input shape, just `await` flips on/off. The alternative (forcing all 36 call sites to `await`) is high-touch churn for no real benefit on most calls.

**Citation for "sync is fine here":** simple-git went promise-only and is universally usable for CLI tooling, but every example in the existing GSD codebase (e.g., `commit.ts` line 38) is `spawnSync`. Preserving sync is the lower-friction path *for this codebase*.

### Pattern 4 — Hybrid Output (Structured + Raw)

**What.** Methods whose output GSD already parses return structured types (`log()` returns `Array<{hash, ...}>`). Methods whose output GSD passes to the user verbatim (e.g., the contents of a diff) return raw strings. The escape hatch `vcs.raw(args)` always returns the `ExecResult` triplet.

**When to use.** Whenever there's an existing parser at the call site, lift it into the adapter. Otherwise, leave the data shape alone.

**Trade-off.** Two output styles in one adapter. Acceptable because the alternatives are worse: pure-structured forces parsing for everything (huge upfront cost, risks behavior drift on unparsed-today output); pure-raw throws away the existing parsing work and pushes complexity back into call sites.

### Pattern 5 — Hook Trigger Primitive

**What.** Both backends expose `vcs.hooks.fire('pre-commit', ctx)`. The git backend invokes `.githooks/pre-commit` directly (subprocess). The jj backend invokes the *same script* but is responsible for inferring the moment to fire it (op-log poll, or wrapped `jj` binary, or invoked manually from a `jj`-side workflow command).

**When to use.** When a foreign VCS lacks the source VCS's hook system but you control the invocation surface. GSD's hook scripts (`.githooks/pre-commit`, `.githooks/pre-push`) are bash; both backends can shell out to them.

**Concrete jj implementation strategy (graded):**
- **Tier 1 (ships first):** Colocated mode — when both `.git` and `.jj` exist (this very repo), git's hooks fire naturally on `jj git push` and `jj commit`-via-colocation. Adapter exposes `hooks.fire` as a no-op-when-colocated and lets git carry water. This works *today* and unblocks the v1 dogfood path.
- **Tier 2 (later):** Non-colocated — wrap `jj` invocations through a thin `jj-with-hooks` shim script that fires pre/post hooks before/after `jj commit`/`jj describe`/`jj git push`. Document the shim in install docs; do not require it for v1.
- **Tier 3 (someday):** Op-log polling — daemon-style. Out of scope for the port; flag for a future milestone.

**Trade-off.** Tier 1 punts on non-colocated jj users for v1. Acceptable per PROJECT.md: "Both colocated and non-colocated jj must work, but colocated is the default dogfood mode."

### Pattern 6 — Workspace Encapsulation (the leaky-edge fortress)

**What.** All worktree/workspace edge cases — locking, prune, path-safety guards (bug-3097/3099, bug-2774, bug-2924) — live entirely inside `vcs.workspace.*`. Call sites never touch `.git/worktrees/` or `.jj/workspace/` paths directly.

**Why this is critical.** PROJECT.md explicitly flags worktree edge cases as a hard-won bug-history surface. If those guards leak into call sites, the jj backend has to reimplement each guard separately. With encapsulation, the guards live once per backend.

**Concrete implementation:**
- `workspace.add` returns a `WorkspaceInfo` with `path` resolved and validated (no `..` traversal, no symlink attacks).
- `workspace.lock` synthesizes `.jj/workspace.lock` for jj (since jj doesn't lock natively) — adapter owns the lockfile semantics.
- `workspace.pruneOrphaned` is the home for the bug-2774 cleanup logic.

**Trade-off.** The workspace sub-API is the most complex part of the adapter. Unavoidable: that complexity exists in GSD today, the question is only where it lives. Concentrating it gives one bisect target instead of N.

---

## Migration Sequencing — Explicit Dependencies

This is the recommended phase order; each row's "Depends on" is a hard prerequisite.

| # | Phase | Scope | Depends on | Estimated size |
|---|-------|-------|------------|----------------|
| 1 | **Adapter scaffold (git-only)** | `sdk/src/vcs/{types,exec,index}.ts` + `backends/git.ts` implementing the full interface as 1:1 wrappers around existing inline `execSync` calls. CJS build target wired up. No call site migrations yet. | — | M (~600–900 LOC + tests) |
| 2 | **Test parameterization harness** | `vitest.config.ts` extended; `tests/helpers.cjs` exposes `withVcsBackend(kind, fn)`; one pilot test (e.g. `commit.test.ts`) demonstrates running on the git adapter. | 1 | S (harness only; pilot one test) |
| 3 | **`sdk/src/query/commit.ts` migration** | Replace inline `execGit` with `vcs.commit()` and `vcs.diff.nameOnly()`. This is the canonical migration — it's small (318 LOC), well-tested (commit.test.ts has 30 git-touching cases), and serves as the template for every other handler. | 1, 2 | S |
| 4 | **`sdk/src/query/*` migration (rest)** | `init.ts`, `verify.ts`, `progress.ts`, `check-ship-ready.ts`, `check-decision-coverage.ts`, `docs-init.ts`. Same template as commit.ts. | 3 | M |
| 5 | **`bin/lib/core.cjs` migration** | The 2,036-LOC center of gravity. Migrate `execGit` itself to delegate to the adapter; everything that already calls `execGit` from core.cjs flips backend automatically. This is the highest-leverage migration. | 1 (no need to wait on 3, but easier with a template) | M |
| 6 | **`bin/lib/{verify,commands,worktree-safety,init,graphify,drift}.cjs` migration** | Each file's call sites. `worktree-safety.cjs` is the design-heavy one — that's where the workspace sub-API earns its keep. | 5 | L |
| 7 | **Hook bridge git-side** | `vcs.hooks.fire('pre-commit', ...)` shells out to `.githooks/pre-commit`. Tests verify the fire moment matches existing behavior. | 1 | S |
| 8 | **`createJjAdapter` skeleton** | All methods exist, return `throw new VcsExecError('not yet implemented for jj')` initially, then port method-by-method. **First three to land:** `refs.head`, `commit`, `log` (touches the most tests). | 1 | M |
| 9 | **`createJjAdapter` workspace** | Most design-heavy method group. Locking semantics synthesized via lockfile. | 1, 8 (refs/commit) | L |
| 10 | **`createJjAdapter` hooks (Tier 1, colocated)** | Returns no-op when `.git` is also present (git fires hooks); error otherwise telling user to use the wrapper shim. | 7, 8 | S |
| 11 | **CI matrix flip** | `pnpm test` runs both backends. Initially `jj` is allowed-to-fail; gate it once parity is achieved. | 8, 9 | S (config) |
| 12 | **Workflow/agent prompt rewrites** | The 200+ git mentions across `.md` files. Mostly mechanical s/git/vcs-helper/, but high file count. | All preceding | L (volume, not depth) |

**Build order summary.** Adapter → harness → SDK migrations → CJS migrations → hooks → jj backend → CI → prompts. Each tier unblocks the next; nothing is parallel-blocked except inside steps 4 and 6, which are file-parallel within themselves.

**Rollback safety.** Through step 7, every change is reversible — adapter is git-only, behavior is byte-identical to today's inline execs (preserved by the `ExecResult` triplet). Step 8 onwards, the jj backend is gated behind `GSD_VCS=jj` or `.jj`-only repos; git-only repos see zero behavior change.

---

## Test Parameterization Strategy

**Vitest features used:**
- `describe.for(...)` to fan out a test suite over `[ {kind: 'git'}, {kind: 'jj'} ]`. (`describe.for` creates a suite per parameter set; this is the supported way to fan a whole `describe` block.)
- Per-test fixture via `test.extend(...)` to inject a built `VcsAdapter` instance bound to a per-test temp directory. The fixture handles `git init` or `jj git init` setup and teardown.
- `test.skipIf(...)` for backend-specific tests (e.g., a git-reflog edge case the jj backend doesn't expose).

**Skeleton:**

```ts
// tests/helpers/vcs-fixture.ts
import { test as base, describe } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createVcsAdapter, type VcsAdapter, type VcsKind } from '@gsd/sdk/vcs';

interface VcsFixture { vcs: VcsAdapter; cwd: string; }

export const vcsTest = (kind: VcsKind) => base.extend<VcsFixture>({
  cwd: async ({}, use) => {
    const dir = await mkdtemp(join(tmpdir(), 'gsd-test-'));
    await use(dir);
    await rm(dir, { recursive: true, force: true });
  },
  vcs: async ({ cwd }, use) => {
    if (kind === 'git') initGitRepo(cwd);
    else initJjRepo(cwd);
    await use(createVcsAdapter(cwd, { kind }));
  },
});

export const BACKENDS: VcsKind[] = (process.env.GSD_TEST_BACKENDS ?? 'git,jj')
  .split(',') as VcsKind[];

// Usage:
describe.for(BACKENDS)('commit handler [%s]', (kind) => {
  const test = vcsTest(kind);
  test('creates a commit with sanitized message', async ({ vcs, cwd }) => {
    // ...
  });
});
```

**Why `describe.for` over `test.each`.** `describe.for` parameterizes the whole suite, including any `beforeAll`/`afterAll` hooks. `test.each` only loops the test, which means the per-backend fixture setup runs N times, not once per backend. For the worktree-heavy tests this matters.

**Why a fixture per backend, not a global mock.** Avoids module-level mocking entirely. Tests get a real adapter against a real temp repo. This catches integration bugs (e.g., jj's auto-snapshot semantics) that mocks would mask.

**CI policy:**
- **PRs.** Both backends run by default. `GSD_TEST_BACKENDS=git` is the escape hatch for git-only PRs (e.g., changeset/release work).
- **During step 8 (jj-backend rollout).** Add a `jj-allowed-failure` job that's required-but-non-blocking; once parity is reached (gate criterion: 100% of migrated tests pass on both), flip to required-blocking.
- **Nightly.** Both backends, full matrix. Catches drift between backends that PRs miss.

**jj test fixture (initJjRepo) blueprint:**
```ts
function initJjRepo(cwd: string) {
  spawnSync('jj', ['git', 'init', cwd], { stdio: 'pipe' }); // colocated by default; matches dogfood
  // OR for non-colocated tests:
  // spawnSync('jj', ['init', cwd], { stdio: 'pipe' });
  spawnSync('jj', ['config', 'set', '--repo', 'user.name', 'Test'], { cwd });
  spawnSync('jj', ['config', 'set', '--repo', 'user.email', 't@t'], { cwd });
}
```

A small number of tests (worktree path-safety bug fixes) need explicit non-colocated mode. Parameterize those with a third axis: `describe.for([{kind:'git'},{kind:'jj-colocated'},{kind:'jj-native'}])`.

---

## Hook Abstraction — Final Design

**Public API (from the adapter):**
```ts
vcs.hooks.fire(moment: 'pre-commit' | 'pre-push', ctx: { stagedFiles: string[]; remote?: string }): ExecResult
```

**git backend implementation.** Subprocess `.githooks/pre-commit` (or `pre-push`) with `ctx.stagedFiles` joined newline-delimited on stdin. Inherit env. Capture stdout/stderr. Return `ExecResult`.

**jj backend implementation (Tier 1, ships v1).** Detect colocated mode by checking for `.git/`. If colocated: `fire()` is a no-op and returns `{exitCode: 0, stdout: 'colocated: hook fired by git', stderr: ''}` — git carries water. If non-colocated: return `{exitCode: 0, stdout: 'non-colocated jj: hook bridge not installed; install jj-with-hooks shim per docs', stderr: ''}` and rely on the shim (Tier 2).

**jj backend implementation (Tier 2, follow-up milestone).** Ship a `bin/jj-with-hooks` shell script that wraps `jj`, intercepts `commit`/`describe`/`git push` invocations, and shells out to `.githooks/<moment>` before/after the underlying jj call. Users alias `jj=jj-with-hooks` in shell config.

**Why not op-log polling for v1.** Daemon design is heavyweight; jj's op-log doesn't expose pre-commit hooks naturally (it sees operations *after* they complete); requires a long-running process the GSD CLI doesn't currently have. Defer.

**Test surface for hooks:**
- `vcs.hooks.fire('pre-commit', ...)` returns success when `.githooks/pre-commit` exits 0.
- Returns the script's exit code on failure.
- Receives stagedFiles correctly.
- (jj-colocated) is a no-op that doesn't double-fire.
- All three behaviors are testable via `describe.for(BACKENDS)`.

---

## Workspace Abstraction — Encapsulation Boundaries

**The non-negotiables (these MUST live inside `vcs.workspace.*`, not at call sites):**

1. **Path safety.** `add({path})` validates `path` resolves under the project root, not via symlink, no `..` traversal. (bug-3097/3099, bug-2774.)
2. **Locking.** `lock(path, reason)` synthesizes `.jj/workspaces/<name>/lock` for jj (since jj doesn't lock); reuses git's `.git/worktrees/<name>/locked` for git. Same caller signature.
3. **Prune.** `pruneOrphaned()` walks the worktree/workspace registry, detects orphans (path missing or unreachable), removes registry entries while honoring locks. Encapsulates the bug-2774 cleanup logic.
4. **HEAD attachment.** `WorkspaceInfo.head` is always defined and always points to a stable identifier. (bug-2924-worktree-head-attachment: detached HEAD on git becomes a synthetic ref-name to keep the contract uniform; jj returns the change-id.)
5. **Stagger logic.** The "no two parallel phases on the same branch" guard, currently in `worktree-safety.cjs`, becomes `vcs.workspace.add` returning an error if a workspace already exists at the same `baseRef` (configurable strict mode).

**Mapping table (git ↔ jj):**

| GSD intent | git verb | jj verb |
|------------|----------|---------|
| `workspace.add({path, baseRef})` | `git worktree add <path> <baseRef>` | `jj workspace add --revision <baseRef> <path>` (jj path semantics differ; resolve relative to project root inside adapter) |
| `workspace.list()` | `git worktree list --porcelain` | `jj workspace list` (parse jj's tabular output via `-T` template) |
| `workspace.remove(path)` | `git worktree remove <path>` (handle locked) | `jj workspace forget <name>` + `rm -rf <path>` (jj does not delete the dir) |
| `workspace.lock(path, reason)` | `git worktree lock <path> --reason "..."` | adapter writes `.jj/workspaces/<name>/lock` containing reason |
| `workspace.unlock(path)` | `git worktree unlock <path>` | adapter removes `.jj/workspaces/<name>/lock` |
| `workspace.pruneOrphaned()` | walk `.git/worktrees/*`, remove dead | walk `jj workspace list` vs filesystem, `jj workspace forget` dead |

**Why locking is synthesized for jj and not native.** jj's design philosophy is *no locking* (the search results confirm: "you don't need any locking"). GSD's stagger logic depends on locks. We could redesign GSD's stagger to use jj's snapshot model — but that's a much larger project. For v1, synthesize a lockfile and call sites are unchanged. Document that this is a GSD-imposed lock, not a jj-native one, in the lockfile contents (`reason: "GSD-stagger; jj does not lock natively"`).

---

## Data Flow

### Commit flow (post-migration)
```
sdk/src/query/commit.ts
    ↓ vcs.commit({message, files: ['.planning/']})
backends/git.ts (or jj.ts)
    ↓ exec(['add', '--', '.planning/'])  [git path]
    OR
    ↓ exec(['commit', '-m', msg, '--', '.planning/'])  [jj path: jj commit -- .planning/]
exec.ts
    ↓ spawnSync
    ↓ ExecResult
    ↑ structured CommitResult { committed, hash, files }
    ↑ (back to call site, same shape as today)
```

### Backend selection flow (call site startup)
```
[CLI invocation in CWD]
    ↓
createVcsAdapter(cwd)
    ↓ autoDetect: walk-up for .jj first, then .git
    ↓ env override: GSD_VCS=git|jj wins
    ↓
[Frozen VcsAdapter object returned, kind = 'git' or 'jj']
```

### Hook trigger flow
```
sdk/src/query/check-commit.ts (or pre-push handler)
    ↓ vcs.hooks.fire('pre-commit', { stagedFiles })
backends/git.ts → hook-bridge.ts
    ↓ spawn .githooks/pre-commit, pass stagedFiles via stdin
    ↓ ExecResult
    ↑ pass exitCode through to caller
```

---

## Anti-Patterns (specific to this project)

### Anti-Pattern 1 — "Make every method async"
**What people do.** Convert every `spawnSync` call to `spawnAsync`/promise-based on the migration.
**Why it's wrong.** Forces ~36 call sites to add `await` keywords, all `function` keywords to `async`, propagates up the call stack in CJS files. High touch, no benefit (most ops complete in <50ms locally).
**Do this instead.** Sync default, expose async only for `workspace.addAsync` and `rawAsync` where latency is documented to be high.

### Anti-Pattern 2 — "Class-based adapter with subclass per backend"
**What people do.** `class VcsAdapter { ... } class GitAdapter extends VcsAdapter { ... }`.
**Why it's wrong.** CJS/ESM dual packaging hates class identity (instanceof breaks across module boundaries). Mocking requires class extension. Tree-shaking is harder.
**Do this instead.** Plain object factory returning a frozen object. Mocking is `{ ...realAdapter, commit: vi.fn() }`.

### Anti-Pattern 3 — "Translate jj concepts to call sites"
**What people do.** Rename methods to "neutral" terms (`vcs.changeset()` instead of `vcs.commit()`, `vcs.workspace()` everywhere instead of allowing "worktree" terminology).
**Why it's wrong.** GSD has years of git-shaped logic, prompts, and bug-tests. Renaming churns everything for cosmetic neutrality. The adapter's job is translation at the boundary, not vocabulary harmonization throughout.
**Do this instead.** Public API uses git-flavored names where the existing call sites use them. The adapter translates internally. Document jj-isms in `backends/jj.ts` only.

### Anti-Pattern 4 — "Migrate first, define interface later"
**What people do.** Start migrating call sites to a thin shim, evolve the interface as you go.
**Why it's wrong.** Every interface change retro-touches every migrated site. Stalls progress.
**Do this instead.** Lock the `VcsAdapter` interface in step 1 before any migration. Treat changes to `types.ts` as breaking-change PRs requiring all call sites update in lockstep.

### Anti-Pattern 5 — "Defer hook design to v2"
**What people do.** Build the adapter for commit/log/workspace, leave hooks as a separate problem.
**Why it's wrong.** PROJECT.md HOOK-01/02/03 are part of v1. Late-binding hook semantics tend to need adapter-level changes (the `hooks.fire` primitive). Doing it in v2 means re-touching every backend.
**Do this instead.** Land the `hooks.fire` primitive in step 1 (git-side). The jj implementation can stub for now; the contract is fixed early.

### Anti-Pattern 6 — "Two test fixtures, two test suites"
**What people do.** Copy `commit.test.ts` to `commit.git.test.ts` and `commit.jj.test.ts`. Maintain in parallel.
**Why it's wrong.** Tests drift. Coverage diverges. Bug-fix-and-test changes need duplicating.
**Do this instead.** Single test file, parameterized via `describe.for(BACKENDS)`. Backend-specific tests live in dedicated `*.git.test.ts` / `*.jj.test.ts` files only when the behavior is intrinsically backend-specific.

---

## Scaling Considerations (this is a CLI, "scale" = call frequency and codebase size)

| Pressure | Mitigation |
|----------|------------|
| Adapter overhead vs raw exec | Negligible at single-call latency (<1ms function-call overhead vs ~30ms spawn). Don't memoize prematurely. |
| Many parallel workspaces (multi-phase exec) | `vcs.workspace.add` is the bottleneck — `addAsync` exists for the parallel case. Stagger logic stays at the orchestrator level, not the adapter. |
| Adapter growing as new GSD commands need new VCS ops | Add to `types.ts` first, both backends implement. Avoid ad-hoc `vcs.raw(['some','complex','args'])` long-term — it bypasses test coverage. Use `raw` as an escape hatch during migration; promote to typed methods in follow-up. |
| jj evolving (new versions changing output) | Pin version-tested templates in `parse/jj-log.ts` etc. Snapshot tests on parser output. Document minimum jj version in README. |

---

## Sources

### Adapter pattern & migration
- [bliki: Branch By Abstraction (Martin Fowler)](https://martinfowler.com/bliki/BranchByAbstraction.html) — HIGH confidence; canonical reference for this exact migration shape
- [Make Large Scale Changes Incrementally with Branch By Abstraction (continuousdelivery.com)](https://continuousdelivery.com/2011/05/make-large-scale-changes-incrementally-with-branch-by-abstraction/) — HIGH
- [Migrating Legacy Systems: Strangler Fig, Branch by Abstraction, and Parallel Run Explained](https://simranchawla.com/unlocking-legacy-systems-strangler-fig-branch-by-abstraction-and-parallel-run-explained/) — MEDIUM
- [Branch by abstraction pattern — AWS Prescriptive Guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/modernization-decomposing-monoliths/branch-by-abstraction.html) — HIGH

### TypeScript dual-package authoring
- [Dual CommonJS/ES module packages (Michael Hly)](https://michaelhly.com/posts/dual-es-commonjs-packaging) — MEDIUM
- [Supporting CommonJS and ESM with Typescript and Node (Evert Pot)](https://evertpot.com/universal-commonjs-esm-typescript-packages/) — MEDIUM
- [TypeScript Modules Reference](https://www.typescriptlang.org/docs/handbook/modules/reference.html) — HIGH (official)

### Vitest parameterization
- [Vitest Test API (describe.for)](https://vitest.dev/api/test) — HIGH
- [Vitest Test Context (test.extend fixtures)](https://vitest.dev/guide/test-context) — HIGH
- [Vitest with async fixtures and it.for/it.each (macwright.com)](https://macwright.com/2025/03/06/vitest-async-fixtures-and-for) — MEDIUM

### Jujutsu specifics
- [Jujutsu Architecture (official docs)](https://docs.jj-vcs.dev/latest/technical/architecture/) — HIGH
- [Working copy — Jujutsu docs](https://docs.jj-vcs.dev/latest/working-copy/) — HIGH
- [Git comparison — Jujutsu docs](https://docs.jj-vcs.dev/latest/git-comparison/) — HIGH
- [Does jj have git hook support? (jj-vcs/jj discussion #403)](https://github.com/jj-vcs/jj/discussions/403) — HIGH (definitive: no native hooks yet)
- [Integrate with pre-commit.com (jj-vcs/jj issue #405)](https://github.com/jj-vcs/jj/issues/405) — HIGH
- [Automating Pre-Push Checks with Jujutsu (Signals & Pixels)](https://www.aazuspan.dev/blog/automating-pre-push-checks-with-jujutsu/) — MEDIUM (real-world workaround)
- [Running Jujutsu with Claude Code Hooks (Matt Sanabria)](https://matthewsanabria.dev/posts/running-jujutsu-with-claude-code-hooks/) — MEDIUM
- [Jujutsu vs Git Worktrees: Key Differences (gist)](https://gist.github.com/ruvnet/60e5749c934077c7040ab32b542539d0) — MEDIUM
- [Jujutsu worktrees are very convenient! (Shaddy)](https://shaddy.dev/notes/jj-worktrees/) — MEDIUM

### JS git wrappers (interface design priors)
- [simple-git vs isomorphic-git vs nodegit comparison](https://npm-compare.com/isomorphic-git,nodegit,simple-git) — MEDIUM
- [isomorphic-git FAQ](https://isomorphic-git.org/docs/en/faq) — HIGH
- [agentic-jujutsu npm](https://www.npmjs.com/package/agentic-jujutsu) — LOW (only existing JS jj wrapper; small surface, embedded binary; not a pattern reference for our case)

### Multi-VCS prior art
- [Hg-Git Mercurial Plugin](https://hg-git.github.io/) — MEDIUM (translation-adapter pattern in the wild)
- [pre-commit framework (pre-commit.com)](https://pre-commit.com/) — HIGH (hook abstraction reference)

---

## Open Questions / Flags for Phase Research

1. **CJS build target — confirm sdk's current emit.** Is `sdk/dist/` already CJS, ESM, or hybrid? If ESM-only today, step 1 must add the `tsconfig.cjs.json` target *before* `bin/lib/*.cjs` can require the new module. Verify in phase 1 kickoff.
2. **jj version pinning.** Document minimum jj version in `package.json` engines or in install docs. jj is pre-1.0; output formats may shift. Snapshot the parsing tests against a pinned version.
3. **Detached HEAD analog on jj.** GSD's `bug-2924-worktree-head-attachment` test encodes detached-HEAD-recovery logic. The jj equivalent is "the working-copy commit is detached from any branch" — semantically present but exposed differently. Phase that touches `worktree-safety.cjs` migration needs a dedicated design pass.
4. **Hook ordering with colocated jj.** When both backends are present, do `.githooks/` fire on `jj commit` automatically (via colocation), or only on `jj git push`? Empirical confirmation needed during step 7 (the failure mode of "fires twice" is more disruptive than "fires once").
5. **`jj` binary discovery on user systems.** Is `jj` always on PATH? Should the adapter `which jj` at construction time and surface an explicit error like git does? Decide in step 8.

---

*Architecture research for: VCS adapter abstraction (git + jj), GSD jj-port fork*
*Researched: 2026-05-09*
