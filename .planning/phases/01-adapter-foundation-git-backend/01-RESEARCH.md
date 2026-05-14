# Phase 1: Adapter Foundation + Git Backend - Research

**Researched:** 2026-05-09
**Domain:** VCS abstraction seam for a Node 22 / TypeScript / pnpm workspace, dual-runtime (vitest for sdk, `node --test` for repo-root CJS suite). Git-only backend; jj is Phase 3.
**Confidence:** HIGH on inventory, build pipeline, lint pattern. HIGH on test harness shape. MEDIUM on the discriminated-`gitOnly` typing — multiple valid encodings exist, planner should pick.

---

## Summary

The adapter seam is **partially built already**: `core.cjs` and `worktree-safety.cjs` each define an `execGit(cwd, args, options)` that returns `{ exitCode, stdout, stderr, timedOut, error }`, and `core.cjs` exports it. `commands.cjs`, `verify.cjs`, `graphify.cjs`, `worktree-safety.cjs` consume that exported `execGit`. On the SDK side, `sdk/src/query/commit.ts` defines its own near-identical `execGit` returning `{ exitCode, stdout, stderr }`. **Phase 1's job is to lift these two shapes into one canonical adapter at `sdk/src/vcs/`, route the existing `execGit` exports to it, and stand up the contract for the namespaces Phase 2 will migrate everything onto.** No call site changes in Phase 1.

The repo runs **two test runners**: vitest for `sdk/src/**/*.test.ts` (and integration tests), and `node --test` for `tests/*.test.cjs`. The `vcsTest` harness must work on **both**, because `tests/helpers.cjs` is consumed by `node --test` suites, and most of the worktree-edge-case bug tests (`bug-2774`, `bug-2075`, etc.) live there. CONTEXT.md D-15 already locks "tests/helpers.cjs provides the `vcsTest` fixture" — this means the harness lives in CJS and works for both runners; the **vitest `describe.for(...)`** approach the requirements describe is for the **sdk-side** adapter contract suite (TypeScript). This split is non-obvious and was not surfaced in earlier research; it's the most important new finding.

vitest 3.2.4 is installed (`sdk/node_modules/vitest`); `describe.for` was added in vitest 3.0 so the API is available. The build pipeline is currently ESM-only (`sdk/tsconfig.json` → `module: NodeNext`, `outDir: dist/`); D-01 locks adding a sibling `tsconfig.cjs.json` that includes only `src/vcs/**/*.ts` and emits to `dist-cjs/`. **No `bin/lib/*.cjs` currently consumes anything from `sdk/dist`** (verified via grep) — Phase 1 establishes the consumption path, Phase 2 starts using it.

**Primary recommendation:** Treat Phase 1 as five tightly sequenced workstreams: (1) build pipeline (`tsconfig.cjs.json` + `dev` script + `pnpm -F sdk build:cjs`), (2) adapter types and frozen-object factory in `sdk/src/vcs/`, (3) git-backend implementation that delegates to `core.cjs`'s existing `execGit` for byte-identity, (4) test harness that extends both `tests/helpers.cjs` (CJS-side, requires `dist-cjs/`) and a new `sdk/src/vcs/__tests__/vcs-fixture.ts` (TS-side, imports source), (5) lint guard `scripts/lint-vcs-no-raw-git.cjs` modeled on `lint-no-source-grep.cjs` plus an exempt-allowlist JSON.

---

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Build Pipeline & dist-cjs Wiring:**
- D-01: Add `sdk/tsconfig.cjs.json` extending `sdk/tsconfig.json` with `module: "commonjs"`, `outDir: "dist-cjs"`, and `include: ["src/vcs/**/*.ts"]` — narrow scope to the adapter only. Keep existing `sdk/tsconfig.json` (ESM, `dist/`) unchanged. `pnpm -F sdk build` runs both `tsc` invocations in parallel.
- D-02 (Test imports): Vitest unit tests (`*.test.ts`) import TS source from `sdk/src/vcs/` directly. Integration tests (`*.integration.test.cjs`) `require()` the built `dist-cjs/` artifact.
- D-03: `pnpm -F sdk dev` script runs `tsc -w` and `tsc -p tsconfig.cjs.json -w` in parallel.

**Adapter Contract Scope:**
- D-04 (Forward-complete surface): Phase 1 designs and git-implements every namespace any later phase will need: `vcs.commit`, `vcs.log`, `vcs.status`, `vcs.diff`, `vcs.refs.{head,parent}`, `vcs.refs.bookmarks.{list,create,move,delete,exists}`, `vcs.workspace.{add,forget,list}`, `vcs.hooks.fire`, `vcs.findConflicts`, `vcs.push`, `vcs.fetch`, `vcs.gitOnly.*`.
- D-05: `vcs.workspace.{add,forget,list}` wraps `git worktree add/remove/list/lock`. `vcs.hooks.fire(stage, ctx)` shells out to `.githooks/<stage>` synchronously.
- D-06 (Discriminator): `vcs.kind: 'git' | 'jj'` is a runtime literal field; TS narrows the union via this field.
- D-07 (gitOnly typing — branch-typed): `vcs.gitOnly.*` exists statically only on the git branch of the discriminated union. `JjVcsAdapter` has no `gitOnly` property. Calling `vcs.gitOnly.x()` against an unnarrowed `VcsAdapter` is a compile error.
- D-08: `vcs.commit({...})` advances the active branch (git) / bookmark (jj) on both backends.

**RevisionExpr Design:**
- D-09: `type RevisionExpr = string & { readonly __brand: unique symbol }`.
- D-10: Single `expr` namespace export from `sdk/src/vcs/expr.ts`: `expr.head()`, `expr.parent()`, `expr.bookmark(name)`, `expr.remote(branch, remote)`. `vcs.refs.head` and `vcs.refs.parent` are derived accessors.
- D-11: `sdk/src/vcs/parse/git-rev.ts` exports `toGitRev(expr): string`; `sdk/src/vcs/parse/jj-rev.ts` exports `toJjRev(expr): string`.
- D-12: `expr.raw()` is **not** added in Phase 1.

**Test Fixture, Matrix, Snapshot Baseline:**
- D-13 (Per-describe tmp repo): one tmp repo per describe block; fixture snapshots clean state at block start, restores between tests.
- D-14: `vcs.test.snapshot(): SnapshotHandle` and `vcs.test.restore(handle)` are part of the adapter contract under a `__testOnly` symbol-gated namespace.
- D-15: `sdk/src/vcs/backends.ts` exports `BACKENDS` list and backend-kind types. `tests/helpers.cjs` provides the `vcsTest` fixture, tmp-repo lifecycle, and `GSD_TEST_BACKENDS` env filter at fixture load.
- D-16: Two distinct snapshot mechanisms: (a) vitest `expect(...).toMatchSnapshot()` for adapter contract tests; (b) JSON baselines under `tests/baselines/git-vcs/<call-site>.snap.json` populated in Phase 2.

**Lint Guard (D-17/D-18/D-19 — tightens VCS-07):**
- D-17: ALL git invocations from jj-reachable code are forbidden, not just mutating verbs (read-only git on a colocated jj repo can still perturb jj state).
- D-18: `scripts/lint-vcs-no-raw-git.cjs` (pattern-matches `lint-no-source-grep.cjs`) scans entire repo for any git invocation; default-deny with explicit allowlist (`scripts/lint-vcs-no-raw-git.allow.json`). Exempt: GitHub Actions workflows, upstream-tracking docs, git backend itself, `gitOnly` impl, baseline-capture harness.
- D-19: CI-only (not pre-commit) during migration phases.

### Claude's Discretion
- Build pipeline structure (D-01) was already locked.
- Concrete namespace decomposition (D-04): final method signatures within the forward-complete surface are the planner's call.
- Concrete restore-primitive impl (D-14): backend-specific implementation detail of `vcs.test.snapshot()` / `vcs.test.restore()` is planner/researcher's call.

### Deferred Ideas (OUT OF SCOPE)
- **Phase 1 smoke-test migration of a single call site:** strict zero migration in Phase 1 unless planner sees specific value.
- **`vcs.test.*` namespace expansion beyond snapshot/restore:** add as needed in Phase 2; don't over-design.
- **REQUIREMENTS.md footer count and VCS-07 wording reconciliation:** next phase transition.
- **Lint guard pre-commit integration:** post-Phase-2.

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VCS-01 | `VcsAdapter` interface in `sdk/src/vcs/types.ts` with full operation contract | "Adapter Shape" + "Architecture Patterns" sections; existing `{exitCode, stdout, stderr}` shape from `core.cjs` is the byte-identity reference |
| VCS-02 | `createVcsAdapter(cwd, opts)` factory in `sdk/src/vcs/index.ts` returning frozen plain object with namespaced sub-objects | "Frozen Plain Object Factory" pattern; existing exec patterns at `core.cjs:742-758` and `commit.ts:37-48` |
| VCS-03 | Backend auto-detection (`.jj` first, `.git` fallback, `GSD_VCS` env override) | Repo IS colocated (.jj + .git both exist); auto-detect logic from research/ARCHITECTURE.md ; spec must NOT trip on this until Phase 3 lands jj backend |
| VCS-04 | Single spawn wrapper `sdk/src/vcs/exec.ts` with `{exitCode, stdout, stderr}` and `VcsExecError` | Existing `execGit` at `core.cjs:742-758` and `worktree-safety.cjs:31-49` already implement this shape with extras (`timedOut`, `error`); adapter exec must preserve all five fields for byte-identity |
| VCS-05 | `RevisionExpr` branded type + `expr.*` factory | D-09/D-10/D-11 lock the design |
| VCS-06 | TypeScript-first with CJS build target → `dist-cjs/` for `bin/lib/*.cjs` consumption | D-01 locks `sdk/tsconfig.cjs.json`; existing pipeline ESM-only (verified) |
| VCS-07 | Lint guard "jj-backend never shells out to mutating git verbs" | TIGHTENED by D-17/D-18: any git invocation in jj-reachable code is forbidden, not just mutating |
| GIT-01 | `sdk/src/vcs/backends/git.ts` implements every adapter operation 1:1 with existing `execSync('git …')` | 26 `execGit(...)` call sites across 5 files (commands, verify, graphify, worktree-safety, core); 5 inline `execSync('git …')` in `init.cjs` (3) and `commands.cjs` (1) and `core.cjs` (1) — all in production source. SDK-side: 5 in `commit.ts`, 4 in `init.ts`. |
| GIT-02 | Byte-identical `{exitCode, stdout, stderr}` to pre-migration | Achievable by routing git backend through the same `spawnSync('git', args, ...)` shape; baseline capture harness landed in Phase 1, baselines populated in Phase 2 (D-16) |
| GIT-03 | `vcs.gitOnly.createAnnotatedTag()` + escape hatches; jj backend statically errors | D-07 locks branch-typed gitOnly; planner picks discriminated-union encoding |
| TEST-01 | `vcsTest(kind)` fixture in test helpers; `describe.for([...BACKENDS])` parameterization | vitest 3.2.4 supports `describe.for`; harness must straddle both runners (vitest + `node --test`) |
| TEST-02 | `test.extend({vcs, cwd})` per-test backend instance + isolated tmp dir | vitest `test.extend` for sdk-side; `tests/helpers.cjs` `createTempGitProject` already provides the CJS-side primitive |
| TEST-03 | Backend matrix axis includes `git`, `jj-colocated`, `jj-native` | Phase 1 ships only `git` axis populated; matrix scaffold accepts the three keys |
| TEST-04 | `GSD_TEST_BACKENDS` env var selects subset (default: all) | Standard env-flag parsing; D-15 places the parse at fixture load |
| TEST-06 | CI rule: skip count must not increase from `main` | Existing CI infra runs `node scripts/lint-no-source-grep.cjs`; new check is a count-diff against `git diff origin/main` of `.skip|xit|it.todo` patterns |
| TEST-07 | Test fixtures support both git and jj initial states | Phase 1 git side; jj-init scaffold accepted but not implemented |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Adapter type contract | SDK (sdk/src/vcs/types.ts) | — | Authoritative TS interface; both backends and all consumers compile against it |
| Backend implementations | SDK (sdk/src/vcs/backends/*.ts) | — | Single source of truth in TS; emitted to `dist-cjs/` for CJS consumers |
| Spawn wrapper | SDK (sdk/src/vcs/exec.ts) | — | Centralizes `{exitCode, stdout, stderr}` contract and `VcsExecError` |
| Hook firing primitive | SDK (sdk/src/vcs/hook-bridge.ts) | — | Backend-agnostic primitive; git backend shells `.githooks/<stage>` |
| Workspace operations | SDK (sdk/src/vcs/backends/git.ts: workspace.*) | CJS adapter `worktree-safety.cjs` (delegated) | Per ADR-0004, worktree porcelain parsing already lives in `worktree-safety.cjs`; Phase 1 decision (D-05): `vcs.workspace.*` wraps `git worktree …` directly via the adapter; the `worktree-safety.cjs` SAFETY POLICY (path-validation, prune logic, ADR-0004 metadata-prune-only default) stays at the CJS seam — `vcs.workspace.*` is a thinner "verb" layer above it. Phase 2 will route `worktree-safety.cjs`'s internal `execGit` calls through the adapter. |
| Test harness (vitest, sdk-side) | sdk/src/vcs/__tests__/vcs-fixture.ts | — | TypeScript fixture for adapter contract suite; uses `test.extend` and `describe.for` |
| Test harness (node --test, repo-side) | tests/helpers.cjs (extended) | sdk/dist-cjs/vcs (consumed) | Existing `createTempGitProject` is the primitive; `vcsTest(kind)` is a new export that wraps a tmp repo + adapter binding; `node --test` doesn't have `describe.for` so the CJS-side fixture loops backends manually |
| Snapshot/restore primitive (D-14) | sdk/src/vcs/backends/git.ts (under `__testOnly`) | — | Symbol-gated; git impl: `git rev-parse HEAD` + `git reset --hard <ref> && git clean -fdx` |
| Lint guard | scripts/lint-vcs-no-raw-git.cjs + scripts/lint-vcs-no-raw-git.allow.json | CI workflow (.github/workflows/test.yml lint-tests job) | Default-deny scan; exempt-list JSON; CI-only per D-19 |
| Baseline capture harness | tests/baselines/git-vcs/ + tests/helpers.cjs (load+assert utility) | — | Phase 1 scaffolds the directory + utility; Phase 2 populates baselines |

---

## Standard Stack

### Core (already present, no install)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ^5.7.0 (sdk devDep) | Adapter source language | Locked by SDK convention; matches D-01 build target |
| vitest | 3.2.4 (sdk devDep, verified installed) | sdk-side test runner with `describe.for` and `test.extend` | `describe.for` shipped in vitest 3.0; `test.extend` is GA. Source: vitest changelog. [VERIFIED: node -e check on installed package] |
| node:child_process | Node 22 builtin | Spawn primitive | Existing `core.cjs:742` and `commit.ts:37` already use `spawnSync('git', args, {cwd, stdio: 'pipe', encoding: 'utf-8', timeout})`. Adapter MUST match this exact invocation shape for byte-identity. |
| Node built-in test runner | Node 22 builtin | repo-side `tests/*.test.cjs` | `scripts/run-tests.cjs` invokes `node --test --test-concurrency=4 tests/*.test.cjs`. NOT vitest — important. |
| pnpm workspace | 11.0.8 | Monorepo orchestration | `pnpm -F sdk build` is the existing pattern; `pnpm -F sdk build:cjs` is the new addition |

### Supporting (no new dependencies needed for Phase 1)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `concurrently` or `npm-run-all` | — | Parallel `tsc -w` + `tsc -p tsconfig.cjs.json -w` for dev script | D-03 only; planner can also use `tsc -b` build-mode if both configs become a project graph |

**No new dependencies should be installed in Phase 1.** STACK.md research explicitly forbids it ("Avoid heavy npm deps") and the research's primary recommendation is "shell out to `jj` CLI binary; do not add execa/simple-git". Same applies to git side: existing `spawnSync` patterns are already in use.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Two separate tsconfig files | `tsc --build` project references | Slightly cleaner but adds project-graph cognitive load and re-tooling; D-01 locks two-tsconfig-parallel approach |
| `concurrently` (devDep) | Two terminal panes | Adds a dep just for `dev`; if avoidable, encode in `pnpm` script via `&` (POSIX-only) or punt and document "run two `tsc -w` in two panes" |
| `describe.for` | `describe.each` | `describe.each` works in vitest pre-3.0 but per ARCHITECTURE.md and D-13: `describe.for` parameterizes the whole suite (`beforeAll`/`afterAll` run once per backend) — the chosen primitive. |

**Installation:**

```bash
# No npm installs in Phase 1.
# Build commands the planner will add to sdk/package.json:
#   "build:cjs": "tsc -p tsconfig.cjs.json"
#   "build": "tsc && tsc -p tsconfig.cjs.json"     (overwrites existing)
#   "dev":   "tsc -w & tsc -p tsconfig.cjs.json -w"  (or via concurrently)
```

**Version verification:** vitest 3.2.4 confirmed via `cat sdk/node_modules/vitest/package.json` [VERIFIED: filesystem read]. Node engines `>=22.0.0` confirmed in both `sdk/package.json` and root `package.json` [VERIFIED]. TypeScript `^5.7.0` confirmed in sdk devDeps [VERIFIED].

---

## Package Legitimacy Audit

Phase 1 installs **no** new packages. All required tooling is already in `sdk/devDependencies` (`typescript`, `vitest`, `@types/node`, `@types/ws`) and verified present in `sdk/node_modules/`.

| Package | Registry | Disposition |
|---------|----------|-------------|
| (none — Phase 1 ships zero new deps) | — | N/A |

If the planner decides D-03 needs `concurrently` (one option for the parallel `tsc -w` script), it must run the legitimacy gate at that time. `concurrently` is a long-established package (10+ years on npm, ~6M weekly downloads, source repo `open-cli-tools/concurrently`) — would clear the gate, but Phase 1 should prefer a zero-dep approach (POSIX `&` background or direct user instruction) given the "no heavy deps" constraint.

---

## Architecture Patterns

### System Architecture Diagram

```
                      ┌────────────────────────────────────────┐
                      │  Call sites (UNCHANGED in Phase 1)     │
                      │  bin/lib/*.cjs   sdk/src/query/*.ts    │
                      │  tests/*.test.cjs   .githooks/*        │
                      └──────────────────┬─────────────────────┘
                                         │
                              [Phase 2 will switch this edge to
                               vcs.commit() / vcs.log() / etc.]
                                         │
                                         ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │  createVcsAdapter(cwd, opts) — sdk/src/vcs/index.ts             │
   │  Backend auto-detect: .jj? .git? GSD_VCS env override           │
   │  Returns Object.freeze({...}) typed as VcsAdapter union          │
   └────────────────┬─────────────────────────────────┬──────────────┘
                    │                                 │
            kind === 'git'                    kind === 'jj' (Phase 3)
                    ▼                                 ▼
   ┌─────────────────────────────────┐  ┌──────────────────────────────┐
   │  GitVcsAdapter                   │  │  JjVcsAdapter                │
   │  sdk/src/vcs/backends/git.ts     │  │  sdk/src/vcs/backends/jj.ts  │
   │  HAS .gitOnly                    │  │  NO .gitOnly (static error)  │
   │  Forward-complete: commit, log,  │  │  Phase 3+ implementation     │
   │   status, diff, refs.bookmarks., │  │                              │
   │   workspace., hooks.fire,        │  │                              │
   │   findConflicts, push, fetch     │  │                              │
   └─────────────┬───────────────────┘  └──────────────────────────────┘
                 │
                 ▼
   ┌─────────────────────────────────┐  ┌──────────────────────────────┐
   │  exec.ts (sdk/src/vcs/)         │  │  RevisionExpr (sdk/src/vcs/  │
   │  spawnSync wrapper, returns     │  │   expr.ts + parse/git-rev.ts)│
   │  {exitCode, stdout, stderr,     │  │  Branded string; factory     │
   │   timedOut, error}              │  │  funcs only; backend-side    │
   │  VcsExecError class              │  │  parse to dialect            │
   └─────────────────────────────────┘  └──────────────────────────────┘
                 │
                 ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │  spawnSync('git', args, {cwd, stdio: 'pipe', encoding: 'utf-8', │
   │              timeout: 10000})                                    │
   │  ── byte-identical to core.cjs:742 and commit.ts:37 ──           │
   └─────────────────────────────────────────────────────────────────┘

   Build pipeline:
       sdk/tsconfig.json       ──tsc──▶  sdk/dist/      (ESM, full SDK)
       sdk/tsconfig.cjs.json   ──tsc──▶  sdk/dist-cjs/  (CJS, vcs only — D-01)
                                              │
                                              ▼
                                  Phase 2: bin/lib/*.cjs require()s this
                                  Phase 1: only the adapter test harness consumes it

   Test runners (TWO of them — important):
       sdk-side:    vitest 3.2.4 (sdk/vitest.config.ts; describe.for + test.extend)
                    Reads sdk/src/vcs/__tests__/*.test.ts (TS source directly per D-02)
       repo-side:   node --test (scripts/run-tests.cjs)
                    Reads tests/*.test.cjs; consumes dist-cjs/vcs via require()

   Lint guard (Phase 1 ships):
       scripts/lint-vcs-no-raw-git.cjs
            scans whole repo for /\bgit\s+<verb>/ or spawn(['"]git['"])
            consults scripts/lint-vcs-no-raw-git.allow.json (default-deny)
            CI-only via .github/workflows/test.yml lint-tests job (D-19)
```

### Recommended Project Structure

```
sdk/
├── tsconfig.json                       # existing, unchanged (ESM)
├── tsconfig.cjs.json                   # NEW (D-01) — narrow scope, dist-cjs/
├── package.json                        # extend scripts: build, build:cjs, dev
└── src/
    └── vcs/                            # NEW directory
        ├── index.ts                    # createVcsAdapter() factory + auto-detect
        ├── types.ts                    # VcsAdapter discriminated union
        ├── exec.ts                     # spawn wrapper + VcsExecError
        ├── expr.ts                     # RevisionExpr brand + factories (D-09/D-10)
        ├── backends.ts                 # BACKENDS list + VcsKind type (D-15)
        ├── hook-bridge.ts              # vcs.hooks.fire primitive
        ├── parse/
        │   ├── git-rev.ts              # toGitRev(expr): string (D-11)
        │   └── jj-rev.ts               # toJjRev(expr): string (stub for Phase 3)
        ├── backends/
        │   ├── git.ts                  # createGitAdapter() — full impl
        │   └── jj.ts                   # NOT IN PHASE 1 — file does not exist yet
        └── __tests__/
            ├── adapter-contract.test.ts        # describe.for([...BACKENDS])
            ├── git-only.test.ts                # GitVcsAdapter-specific cases
            ├── exec.test.ts                    # exec.ts unit tests
            ├── expr.test.ts                    # RevisionExpr brand + factories
            ├── parse-git-rev.test.ts           # toGitRev unit tests
            └── vcs-fixture.ts                  # test.extend({vcs, cwd}) — TS fixture

dist-cjs/
└── vcs/                                # tsc output of src/vcs/*.ts
    ├── index.{js,d.ts}
    ├── types.{js,d.ts}
    ├── exec.{js,d.ts}
    ├── expr.{js,d.ts}
    ├── backends.{js,d.ts}
    ├── hook-bridge.{js,d.ts}
    ├── parse/{git-rev,jj-rev}.{js,d.ts}
    └── backends/git.{js,d.ts}

tests/
├── helpers.cjs                         # EXTEND: add vcsTest(kind), BACKENDS env parse, snapshot/restore wiring (D-15)
├── baselines/
│   └── git-vcs/                        # NEW DIRECTORY (empty) — Phase 2 populates
│       └── .gitkeep
└── vcs-adapter-contract.test.cjs       # NEW — node --test variant of contract suite (CJS-side)

scripts/
├── lint-vcs-no-raw-git.cjs             # NEW — pattern-match lint-no-source-grep.cjs (D-18)
├── lint-vcs-no-raw-git.allow.json      # NEW — explicit exempt list (D-18)
└── (lint-no-source-grep.cjs)           # existing — reference pattern

.github/workflows/test.yml              # MODIFY — add `node scripts/lint-vcs-no-raw-git.cjs` step (D-19)
```

### Pattern 1: Frozen Plain-Object Factory with Discriminated Union

**What:** Adapter is a plain object literal frozen at construction; backend identity is a literal field on the object that TS uses to narrow the union type.

**When to use:** This is the locked decision (D-06/D-07). All adapter consumers use it.

**Example (pseudocode for planner — actual signatures in types.ts):**

```typescript
// sdk/src/vcs/types.ts (sketch)

export type VcsKind = 'git' | 'jj';

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;            // matches core.cjs:750-757
  error: Error | null;          // matches core.cjs:756
}

interface VcsAdapterCommon {
  readonly cwd: string;
  commit(input: CommitInput): CommitResult;
  log(opts: LogOpts): LogEntry[];
  status(opts?: StatusOpts): StatusResult;
  diff(opts: DiffOpts): DiffResult;
  refs: {
    head: RevisionExpr;
    parent: RevisionExpr;
    bookmarks: {
      list(): Bookmark[];
      create(name: string, rev: RevisionExpr): void;
      move(name: string, rev: RevisionExpr): void;
      delete(name: string): void;
      exists(name: string): boolean;
    };
  };
  workspace: {
    add(input: WorkspaceAdd): WorkspaceInfo;
    forget(path: string): void;
    list(): WorkspaceInfo[];
  };
  hooks: { fire(stage: HookStage, ctx: HookContext): ExecResult };
  findConflicts(opts: { scope: 'all' | 'working-copy' }): ConflictResult[];
  push(opts: PushOpts): ExecResult;
  fetch(opts: FetchOpts): ExecResult;
}

export interface GitVcsAdapter extends VcsAdapterCommon {
  readonly kind: 'git';
  gitOnly: {
    createAnnotatedTag(name: string, message: string, rev: RevisionExpr): void;
    // …other git-only escape hatches
  };
}

export interface JjVcsAdapter extends VcsAdapterCommon {
  readonly kind: 'jj';
  // NO gitOnly property — calling vcs.gitOnly.x() on JjVcsAdapter is a TS error
}

export type VcsAdapter = GitVcsAdapter | JjVcsAdapter;
```

[CITED: this shape derives from CONTEXT.md D-06/D-07/D-08 + research/ARCHITECTURE.md "Recommended Adapter Shape" lines 75-165]

**Source/Note:** The factory must call `Object.freeze(adapterObject)`. Frozen-plain-object pattern survives the CJS↔ESM boundary cleanly (no `instanceof` brittleness across module realms — this is the documented hazard called out in research/ARCHITECTURE.md §"Why frozen object factory, not a class"). [VERIFIED: matches existing pattern in research]

### Pattern 2: Static Discrimination of `gitOnly` (D-07)

**What:** `gitOnly` exists as a property only on `GitVcsAdapter`. The discriminated union with `kind` literal field makes call sites narrow before reaching for git-specific ops.

**Why three encodings exist:** The planner picks one. All three satisfy D-07.

| Encoding | Pros | Cons |
|----------|------|------|
| (A) Discriminated union via `interface` extension (above) | Most idiomatic TS; narrowing is automatic via `kind` check | Requires consumers to write `if (vcs.kind === 'git') { vcs.gitOnly.x() }` |
| (B) `gitOnly?: GitOnlyOps` on a single interface, with conditional return type tied to `kind` | Single interface; less file count | Uses conditional types that can confuse consumers; narrowing is fuzzier |
| (C) Branded backend kind + nominal type guards | Strongest static guarantees | Most ceremony; TS needs hand-rolled type guards |

**Recommendation:** (A) — matches D-06 ("`vcs.kind: 'git' | 'jj'` is a runtime literal field… TS type discriminates the union via this field") most cleanly. [ASSUMED — D-06 is locked but the encoding within the discrimination is planner-discretion per CONTEXT.md "Claude's Discretion"]

**Example narrowing in a future Phase 2 caller:**

```typescript
const vcs = createVcsAdapter(cwd);

// vcs.gitOnly.createAnnotatedTag(...)  // ❌ TS error: 'gitOnly' does not exist on type 'JjVcsAdapter'

if (vcs.kind === 'git') {
  vcs.gitOnly.createAnnotatedTag(name, message, rev);  // ✅ narrowed to GitVcsAdapter
}
```

### Pattern 3: Snapshot/Restore as Symbol-Gated `__testOnly` Namespace (D-14)

**What:** `vcs[__testOnly].snapshot(): SnapshotHandle` and `vcs[__testOnly].restore(handle)`. The symbol keeps test-only surface out of public API; users can't import the symbol from non-test code.

**Implementation (git backend) — planner picks one:**

| Strategy | Implementation | Snapshot speed | Restore correctness |
|----------|---------------|----------------|---------------------|
| (1) `git rev-parse HEAD` + `git stash --include-untracked` then `git reset --hard <ref> && git clean -fdx` | Fast; loses untracked-but-ignored files | Strong — matches what tests typically want |
| (2) Whole-repo `cp -r` to a sibling directory; restore via `cp -r` back | Very slow on large repos; correct for everything including `.git/` internals | Heaviest hammer; only justified for tests that mutate refs/HEAD |
| (3) `git rev-parse HEAD` + checkpoint via `git update-ref refs/gsd/test-snapshot HEAD`; restore via `git reset --hard refs/gsd/test-snapshot && git clean -fdx` | Fast; cleanly named ref | Doesn't capture working-tree dirty state — assumes tests start clean |

**Recommendation:** (3) for the contract suite (tests start clean per D-13 "snapshots clean state at block start"). Add (1) variant only if a specific test needs to preserve untracked-but-tracked-after-revert state. [ASSUMED — D-14 explicitly leaves this to planner/researcher]

### Anti-Patterns to Avoid

- **Anti-pattern: Adding a runtime stub `gitOnly` to `JjVcsAdapter` "for symmetry."** Defeats D-07 — the whole point is forcing call sites to narrow. CONTEXT.md `<specifics>` flags this explicitly: "Resist the temptation to add a runtime-throwing `gitOnly` on `JjVcsAdapter`."
- **Anti-pattern: Using `expr.raw(...)` as a string-passthrough escape.** Forbidden in Phase 1 by D-12. If a Phase 2 migration uncovers a missing factory, expand the factory (`expr.range(from, to)`, `expr.ancestor(rev, n)`) rather than a raw escape.
- **Anti-pattern: Class-based adapter with subclass per backend.** `class VcsAdapter { ... } class GitAdapter extends VcsAdapter { ... }` breaks across CJS/ESM module realm boundaries; mocking is harder. Locked: frozen plain object factory.
- **Anti-pattern: Calling `Object.freeze` shallowly and exposing mutable nested objects.** Each nested namespace (`vcs.refs`, `vcs.workspace`, etc.) must itself be `Object.freeze`d; `Object.freeze` is shallow.
- **Anti-pattern: Treating `tests/*.test.cjs` as vitest tests.** They're `node --test` (`scripts/run-tests.cjs`). Trying to import vitest from there will fail. The CJS-side `vcsTest` fixture in `tests/helpers.cjs` is a hand-rolled loop, not `describe.for`.
- **Anti-pattern: Using `npm-run-all` or `concurrently` without checking for existing usage.** Repo currently has zero `concurrently`/`npm-run-all` usage in scripts. Either add as a sdk devDep with the legitimacy gate or use a different parallelization mechanism (POSIX `&`, sequential build with `tsc -b`).
- **Anti-pattern: Lint guard that scans `bin/lib/*.cjs` and flags every existing `execGit` call.** Phase 1 has zero call-site migration (D-04 says forward-complete surface, not migration). The lint guard's allowlist (D-18) MUST exempt the existing call sites at first, OR the lint guard runs only against future jj-reachable code (decision: planner refines D-18's scope-of-default-deny — Phase 1 isn't yet ready to fail on existing call sites until Phase 2 migrates them).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Spawning git subprocess | New `runGit(args)` helper | Existing `core.cjs` `execGit` shape mirrored at `sdk/src/vcs/exec.ts` | core.cjs:742 already has the canonical shape with `timedOut` and `error` fields; the adapter MUST match for byte-identity (GIT-02) |
| Worktree porcelain parsing | New parser | Existing `worktree-safety.cjs` `parseWorktreeEntries` (per ADR-0004) | Already battle-tested; D-05 + ADR-0004 say `vcs.workspace.*` delegates here |
| Frontmatter parsing for hook scripts | New YAML parser | N/A (hook scripts are bash, no frontmatter) | Phase 1 doesn't modify hook scripts |
| Lint scanner | New regex engine | Pattern of `scripts/lint-no-source-grep.cjs` | CONTEXT.md `<code_context>` calls this out: "D-18's lint script follows the same shape as `scripts/lint-no-source-grep.cjs`" |
| Test concurrency | Hand-rolled subprocess pool | `node --test --test-concurrency=4` (existing `scripts/run-tests.cjs`) | Already in use |
| Git-rev parsing | A toGitRev that re-implements `HEAD` / `@-` / `origin/main` semantics | Pass through to git via the spawn wrapper; let git resolve | D-11: `toGitRev` is a string-builder that emits git syntax, not a resolver. Resolution is git's job. |
| Symbol gating for test-only namespace | `Object.defineProperty` with non-enumerable | Plain `const __testOnly = Symbol('vcs-test-only')` exported from a `*.test-internal.ts` file | TS handles the visibility; symbol equality is the runtime gate |

**Key insight:** The repo has already paid the cost of building the canonical `execGit(cwd, args, options)` shape twice (`core.cjs` and `worktree-safety.cjs`) and is about to pay it a third time at `commit.ts`. Phase 1 unifies these into one source-of-truth at `sdk/src/vcs/exec.ts`. Phase 2 routes the existing `execGit` exports through the adapter (or makes them adapter-bound aliases). **Don't pay the cost a fourth time** — port `core.cjs:742-758` verbatim into `exec.ts`, including the `timedOut`/`error`/`timeout` extras.

---

## Common Pitfalls

### Pitfall 1: Two test runners, one fixture (the hidden trap of CONTEXT.md D-15)

**What goes wrong:** D-15 says `tests/helpers.cjs` provides the `vcsTest` fixture. But `tests/*.test.cjs` runs under `node --test` (no `describe.for`, no `test.extend`), while `sdk/src/**/*.test.ts` runs under vitest. If the planner writes a vitest-flavored fixture in `helpers.cjs`, it won't run in either runner correctly: vitest can't find `helpers.cjs` as a module to import (it's CJS in a path it doesn't auto-discover), and `node --test` doesn't have `describe.for`.

**Why it happens:** "test helpers" sounds like one fixture; the requirements/CONTEXT use vitest API (`describe.for`, `test.extend`) while pointing at the CJS file.

**How to avoid:**
- **Two fixture files, one shared primitive.** `tests/helpers.cjs` exports a CJS-flavored `vcsTest(kind, fn)` that takes a callback and loops over backends manually (no `describe.for`). `sdk/src/vcs/__tests__/vcs-fixture.ts` exports a vitest `test.extend({vcs, cwd})` and a `BACKENDS` constant for `describe.for`.
- **Single source for `BACKENDS` array and parsing of `GSD_TEST_BACKENDS`.** This lives in `sdk/src/vcs/backends.ts` (TS source) and the CJS-side helpers `require('../sdk/dist-cjs/vcs/backends.cjs')` to consume it. Same env var, same default, same parsing.
- **Single source for tmp-repo lifecycle.** A `createTempVcsRepo(kind)` function — TS impl in `vcs-fixture.ts`, CJS impl in `helpers.cjs` — both call the same git/jj init shell-out sequence (already exists at `helpers.cjs:90-101` for git).

**Warning signs:**
- Tests run green on one runner only, or vitest reports "module not found" for `helpers.cjs`.
- A bug fix that updates the fixture in one place but not the other; tests pass against `git` matrix but skip on `jj` matrix silently.

### Pitfall 2: Lint guard fires on Phase 1 itself

**What goes wrong:** D-18 says "default-deny on `git` invocations." But Phase 1 ships a **git backend** that contains many `git` invocations, and Phase 1 ships a **test harness** that initializes tmp git repos. If the lint runs after Phase 1 lands, it flags everything in `sdk/src/vcs/backends/git.ts` and `tests/helpers.cjs:90-101`.

**Why it happens:** The default-deny rule is forward-looking ("once jj backend lands, prevent regression"); the allowlist must be primed in Phase 1.

**How to avoid:**
- Initial allowlist (`scripts/lint-vcs-no-raw-git.allow.json`) MUST exempt all of:
  - `sdk/src/vcs/backends/git.ts`
  - `sdk/src/vcs/parse/git-rev.ts`
  - `sdk/src/vcs/exec.ts` (it spawns git, but only via argv; that's the wrapper)
  - `sdk/src/vcs/__tests__/**` (test harness inits tmp repos)
  - `tests/helpers.cjs` (CJS-side init)
  - `tests/*.test.cjs` files that init tmp git repos (current pattern)
  - All existing `bin/lib/*.cjs` files that have `execGit` calls (Phase 2 migrates them)
  - All `.github/workflows/*.yml` (CI side stays git per CI-03)
  - `.githooks/pre-commit`, `.githooks/pre-push` (the hook scripts themselves)
  - `docs/upstream-rebase.md` (when it exists), `.planning/intel/git-touchpoints.md` (intentional documentation of git surface)
- The allowlist is a **glob list with regex match per line content**, not a file list. Files can be wholly exempted; specific lines (`// vcs-lint:allow-git-here <reason>`) can be exempted inline. Pattern from `// allow-test-rule:` in `lint-no-source-grep.cjs`.
- CI failure mode: lint output prints the file:line and offers a fix ("either route through `vcs.gitOnly.*` or add to allow.json with rationale").

**Warning signs:** Phase 1 PR fails CI on its own newly-added files. (If this happens, the allowlist is too tight — extend it.)

### Pitfall 3: `dist-cjs/` build doesn't emit until first build

**What goes wrong:** The TS-side test harness (`vcs-fixture.ts`) imports from source — works without a build. But the CJS-side test harness (`tests/helpers.cjs`) requires `dist-cjs/vcs/backends.js` for the `BACKENDS` constant and types. Until someone runs `pnpm -F sdk build:cjs`, the CJS-side tests fail with "module not found."

**Why it happens:** First-time consumers don't know to run the build before tests.

**How to avoid:**
- Add `pretest` script to root `package.json`: extend the existing `pretest: "pnpm run build:sdk"` to also run `build:cjs`. Confirm the existing `pretest` (verified: `"pretest": "pnpm run build:sdk"` exists and runs before `npm test`).
- D-03's `dev` script handles local-loop dev; the `pretest` hook handles "developer just cloned, runs `pnpm test`."
- The CJS-side fixture has a runtime check: `try { require('../sdk/dist-cjs/vcs/backends.cjs'); } catch { throw new Error('Run pnpm -F sdk build first'); }` with a friendly error.

**Warning signs:** Test run in fresh checkout reports `ERR_MODULE_NOT_FOUND` from `tests/helpers.cjs`.

### Pitfall 4: `commit.ts`'s execGit is incomplete vs. core.cjs's execGit

**What goes wrong:** `sdk/src/query/commit.ts:37-48` returns `{ exitCode, stdout, stderr }` — three fields. `get-shit-done/bin/lib/core.cjs:742-758` returns `{ exitCode, stdout, stderr, timedOut, error }` — five fields. If the adapter standardizes on the three-field shape, `core.cjs`'s callers lose timeout-detection capability when Phase 2 migrates them.

**Why it happens:** Two parallel implementations evolved separately; commit.ts was ported "from core.cjs lines 531-542" per its own comment, but at a different time when the timeout extras hadn't been added.

**How to avoid:**
- **Adapter `ExecResult` MUST be the five-field shape** (matches `core.cjs:742-758`). Make `timedOut: false` and `error: null` the defaults when the spawn doesn't fire those branches. byte-identity to `core.cjs` is what GIT-02 requires.
- Default `timeout` value: 10000ms (matches `DEFAULT_GIT_TIMEOUT_MS` in both `core.cjs:729` and `worktree-safety.cjs:15`). Adapter `exec()` accepts an optional `timeout` argument with this default.
- `VcsExecError` carries `{exitCode, stdout, stderr, timedOut, error, args}` so callers can rebuild the diagnostic.

**Warning signs:** Phase 2 migration of `worktree-safety.cjs` discovers it can't surface "PRED.k302 timeout" warnings anymore because the adapter dropped `timedOut`. Avoid by reading the existing exec shapes verbatim during Phase 1 and using the **superset**.

### Pitfall 5: vcs.workspace.* duplicates worktree-safety.cjs's safety logic

**What goes wrong:** D-05 says "vcs.workspace.{add,forget,list} wraps git worktree add/remove/list/lock." But ADR-0004 already established that `worktree-safety.cjs` owns the safety policy (path validation, metadata-prune-only default, locked-surfacing per `bug-2431`). If the planner naively wraps `git worktree` directly in `vcs.workspace`, the safety policy bifurcates.

**Why it happens:** Easy to read D-05 as "implement worktree primitives in the adapter" and miss the ADR-0004 layering.

**How to avoid:**
- `vcs.workspace.list()` calls `readWorktreeList(repoRoot, {execGit})` from `worktree-safety.cjs` (existing API). Phase 1 imports that function as a dependency injection; Phase 2 routes its internal `execGit` through the adapter.
- `vcs.workspace.add({path, baseRef})` shells out to `git worktree add` directly via the adapter exec. Path-safety guards (bug-3097/3099, bug-2774) live in `worktree-safety.cjs`'s own helpers; adapter does not duplicate them — Phase 1 just exposes the verb.
- Document the layering in the adapter's docstring: "`vcs.workspace.*` is a verb-level seam over `git worktree`. The Worktree Safety Policy Module (ADR-0004) is the policy seam above it. Path validation, prune policy, and locked-surfacing live in `worktree-safety.cjs`, not here."

**Warning signs:** A path-safety bug regression fix lands in `vcs.workspace` instead of in `worktree-safety.cjs`. (Means the policy seam is being bypassed.)

### Pitfall 6: BACKENDS list and GSD_TEST_BACKENDS parsing diverge between CJS and TS

**What goes wrong:** Two definitions of `BACKENDS` (one in CJS, one in TS) drift. CI runs `GSD_TEST_BACKENDS=git pnpm test` and one runner respects it but the other defaults to `git,jj-colocated,jj-native`.

**Why it happens:** Different files, hand-edited.

**How to avoid:**
- TS source-of-truth: `sdk/src/vcs/backends.ts` exports `BACKENDS_DEFAULT: VcsKind[]`, `parseBackendsEnv(envValue: string|undefined): VcsKind[]`.
- CJS-side `tests/helpers.cjs` `require('../sdk/dist-cjs/vcs/backends.js')` and uses the same exports. **Never re-implements** the parsing.
- Phase 1 only populates the `'git'` element of `BACKENDS_DEFAULT` (jj-* keys exist but their backend implementations throw "not yet implemented in Phase 1"). Phase 3 fills them in.

**Warning signs:** Set `GSD_TEST_BACKENDS=git`, run tests, and the CJS-side prints "running on git, jj-colocated, jj-native" — desync detected.

---

## Runtime State Inventory

> Phase 1 is greenfield (new files in `sdk/src/vcs/`); does NOT rename or migrate existing data. **No runtime state inventory required.** This section is included for completeness and to document that the audit was performed.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | None — no databases, no persisted state | None |
| Live service config | None — no external services touched | None |
| OS-registered state | None — no Task Scheduler / launchd / systemd entries | None |
| Secrets/env vars | New env var `GSD_TEST_BACKENDS` introduced; no existing secret renamed | Document in test harness README |
| Build artifacts | NEW: `sdk/dist-cjs/` directory will be created. Add to `.gitignore` if not already covered (verify: existing `.gitignore` already excludes `dist/` — `dist-cjs/` likely needs explicit addition) | Add `sdk/dist-cjs/` to `.gitignore`; add to `sdk/package.json` `files` array if SDK is published consuming `dist-cjs/` (currently `files: ["dist", "shared", "prompts"]` per `sdk/package.json`) — Phase 1 does NOT add `dist-cjs` to the published files list because the only consumer is `bin/lib/*.cjs` which lives in the same workspace, not a downstream npm consumer |

**Important nuance:** The existing `package.json` `files` whitelist (`["bin", "commands", "get-shit-done", "agents", "hooks", "scripts", "sdk/src", "sdk/shared", "sdk/prompts", "sdk/dist", "sdk/package.json", "sdk/tsconfig.json"]`) doesn't include `sdk/dist-cjs/`. The planner must decide:
- Option A: Add `sdk/dist-cjs/` to the root `package.json` `files` array so npm-published `get-shit-done-cc` includes the CJS artifact.
- Option B: Don't ship `dist-cjs/` in the npm tarball; expect consumers to build it locally via `prepublishOnly` (existing `prepublishOnly: "pnpm run build:hooks && pnpm run build:sdk"` already runs `build:sdk`; extending it to build CJS is one line).

**Recommendation:** Option A, with `prepublishOnly` extended to ensure `dist-cjs/` is built before publish. [ASSUMED — planner verifies the npm-published consumption path matters, given that this is a hard-fork not republishing under the upstream name (per `out_of_scope` in REQUIREMENTS.md). May be Option B-acceptable.]

---

## Code Examples

Verified patterns from existing repo source:

### Existing execGit shape (THE byte-identity reference for GIT-02)

```javascript
// Source: get-shit-done/bin/lib/core.cjs:742-758 [VERIFIED via Read]

const DEFAULT_GIT_TIMEOUT_MS = 10000;

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

The adapter's `exec.ts` MUST use this exact `spawnSync('git', args, {cwd, stdio: 'pipe', encoding: 'utf-8', timeout})` invocation form. The five-field return is the canonical `ExecResult`.

### Existing tmp-git-repo init (the harness primitive)

```javascript
// Source: tests/helpers.cjs:86-104 [VERIFIED via Read]

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

The new `vcsTest(kind)` fixture wraps this for the `git` axis; jj axes (`jj-colocated`, `jj-native`) get their own init sequences in Phase 3.

### Existing lint scanner pattern (the lint-vcs-no-raw-git.cjs template)

```javascript
// Source: scripts/lint-no-source-grep.cjs:73-137 (selected) [VERIFIED via Read]

const ALLOW_ANNOTATION = /\/\/\s*allow-test-rule:\s*\S/;

function check(filepath) {
  const content = fs.readFileSync(filepath, 'utf-8');
  if (ALLOW_ANNOTATION.test(content)) return null;
  const violations = [];
  // ... pattern matchers
  if (violations.length === 0) return null;
  return { file: rel, violations };
}

function findTestFiles(dir) { /* recursive readdir */ }

const violations = testFiles.map(check).filter(Boolean);
if (violations.length === 0) {
  console.log('ok lint-...');
  process.exit(0);
}
process.stderr.write(`\nERROR: ${totalIssues} violation(s)...\n\n`);
process.exit(1);
```

`scripts/lint-vcs-no-raw-git.cjs` follows this exact shape: read file, check allowlist, regex-match disallowed patterns (`spawnSync\(['"]git['"]`, `execSync\(['"]git\s`, `execFileSync\(['"]git['"]`, etc.), aggregate, exit non-zero with friendly diagnostics.

### Existing test runner invocation

```javascript
// Source: scripts/run-tests.cjs:26-32 [VERIFIED via Read]

execFileSync(process.execPath, ['--test', concurrency, ...files], {
  stdio: 'inherit',
  env: { ...process.env },
});
```

`tests/*.test.cjs` runs under `node --test`. **Not vitest.** The `vcsTest` fixture in `tests/helpers.cjs` MUST work with `node --test`'s `describe`/`it`/`test` API (which is similar but not identical to vitest's; no `test.extend`, no `describe.for`).

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Inline `execSync('git ...')` scattered across SDK and CJS | Centralized `execGit(cwd, args, options)` in `core.cjs`, exported and consumed by other CJS files | Pre-Phase-1 (already done in repo) | Adapter has a head start — just needs to lift this into TS at `sdk/src/vcs/exec.ts` |
| Two-runner test infrastructure (vitest for SDK, `node --test` for tests/) | Same — Phase 1 doesn't change runners | — | The `vcsTest` fixture must straddle both; D-15 places it in CJS for the harder side |
| ESM-only SDK build | ESM + narrow CJS dist for `vcs/` only (D-01) | Phase 1 introduces | `bin/lib/*.cjs` gain a stable `require()` target; rest of SDK stays ESM |
| Class-based VCS abstractions (common in Node ecosystem) | Frozen plain-object factory with discriminated union | Phase 1 chooses | Avoids CJS/ESM `instanceof` brittleness; locks the contract before any backend variation |

**Deprecated/outdated:**
- `simple-git` and similar wrapper libraries were considered but rejected (research/STACK.md). Adapter spawns git directly.
- Class-based + `extends` adapter pattern rejected (research/ARCHITECTURE.md anti-pattern 2).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Recommendation of encoding (A) for the discriminated union (`interface GitVcsAdapter extends VcsAdapterCommon`) over (B) and (C) | Architecture Patterns / Pattern 2 | Low — all three encodings satisfy D-07; planner picks. Wrong choice means slightly different ergonomics, not behavioral wrongness. |
| A2 | Recommendation of strategy (3) for snapshot/restore (`git update-ref refs/gsd/test-snapshot HEAD` + `git reset --hard refs/gsd/test-snapshot && git clean -fdx`) | Pattern 3 | Low — D-14 explicitly delegates this to planner. Wrong choice means slower test runs or insufficient state restoration; correctable in Phase 2. |
| A3 | `dist-cjs/` should be added to root `package.json` `files` array (Option A) for npm-published consumption | Runtime State Inventory | Medium — wrong choice means the published tarball can't be `require()`d from `bin/lib/*.cjs` after install. Mitigated by the fact that this is a hard fork, NOT republishing to npm under upstream name (REQUIREMENTS.md `out_of_scope`). Planner verifies. |
| A4 | The lint guard's initial allowlist must exempt all existing call sites in Phase 1 (because Phase 2 owns migration) | Pitfall 2 / D-18 scope | Low — D-19 keeps lint CI-only and D-18's allowlist is checked-in JSON, so over-tight allowlist is detected on first PR run. |
| A5 | vitest 3.2.4's `describe.for` semantic matches research/ARCHITECTURE.md description (parameterizes whole suite, hooks fire once per backend) | Pattern 1 / TEST-01 | Low — verified vitest 3.2.4 installed; `describe.for` is a stable vitest 3.0+ API. CITED via vitest docs (research/ARCHITECTURE.md sources list `https://vitest.dev/api/test`). |
| A6 | `concurrently` is acceptable as a sdk devDep IF the planner needs it for D-03 dev script | Standard Stack / Alternatives | Low — package is well-known and would clear legitimacy gate; Phase 1 should prefer zero-dep approach (POSIX `&` or sequential build) given "no heavy deps" project posture. |
| A7 | The `findConflicts` namespace's git impl uses `git diff --check` for working-copy scope and `git ls-files --unmerged` (or equivalent) for "all" scope | (forward-complete surface, GIT-01) | Medium — `git diff --check` finds whitespace+merge conflict markers; "all" scope on git is approximately "in-tree conflicts that exist in any commit reachable from HEAD." Planner must spec the exact git invocation against what the jj backend will produce in Phase 3 (`jj log -r 'conflict()'`). For Phase 1 the git impl just needs to be *something* sensible the test harness exercises. |

**If this table is empty:** It is not — A1 through A7 should be confirmed by the planner before locking task definitions.

---

## Open Questions (RESOLVED)

_Each item below is resolved by Phase 1 plans 01-01..01-05; the **RESOLVED:** marker pins the chosen disposition._

1. **`vcs.findConflicts` git semantics — what does "scope: 'all'" mean on git?**
   - What we know: jj backend will use `jj log -r 'conflict()'` (REQUIREMENTS.md CONFLICT-01). git side has no equivalent first-class concept; closest is `git diff --check` or scanning for `<<<<<<<` markers across files.
   - What's unclear: Does Phase 1's git backend need to scan every commit reachable from HEAD (expensive) or only the working copy (cheap, but doesn't match jj's "all" semantics)?
   - Recommendation: Phase 1 git impl returns `[]` for `scope: 'all'` (with a comment "no first-class git equivalent; use `git diff --check` for working-copy scope"). Phase 3 jj impl uses `jj log -r 'conflict()'`. The `verify` gate (CONFLICT-03) will exercise jj-side logic in Phase 3; git-side is a no-op. Plan should document this asymmetry explicitly.
   - **RESOLVED:** plan 01-03 implements `findConflicts({scope:'all'})` returning `[]` on git with an inline comment documenting the Phase 1 asymmetry; `{scope:'working-copy'}` parses `git diff --check`. Adapter-contract test in plan 01-04 asserts `findConflicts({scope:'all'}).toEqual([])` on git.

2. **`vcs.refs.bookmarks.*` on git — what maps to "bookmark"?**
   - What we know: REFS-04 says "git backend uses unprefixed branch names." So `bookmark create` → `git branch <name>`, `bookmark move` → `git branch -f <name> <rev>`, etc.
   - What's unclear: Does `bookmark.list()` on git return all local branches, or only branches with a specific prefix? jj's bookmark namespace is conceptually flat; git's branches include `main`, `develop`, feature branches.
   - Recommendation: Phase 1 git `bookmark.list()` returns all local branches (`git branch --format='%(refname:short)'`). The `gsd/` prefix (REFS-04) applies on jj, not git. Document.
   - **RESOLVED:** plan 01-03 `bookmarks.list()` runs `git branch --format=%(refname:short)`, splits stdout, returns `Bookmark[]` with `{name, rev: ''}` (rev unresolved in Phase 1; documented inline).

3. **Phase 1 deliberate scope for `vcs.push` and `vcs.fetch` — git only, no remote required for tests?**
   - What we know: D-04 includes `vcs.push` and `vcs.fetch` in the forward-complete surface.
   - What's unclear: Test harness can't easily exercise these without a remote. Should Phase 1 ship implementations that SHELL out (always succeed in unit tests if there's no remote — but that's not a real test), or stub them with an "always errors in test" guard?
   - Recommendation: Phase 1 ships `vcs.push` and `vcs.fetch` with full implementations (`git push`, `git fetch`); contract suite tests them against a tmp local "remote" repo (same `git init --bare` + `git remote add` pattern). This adds 2 fixture helpers but produces real coverage.
   - **RESOLVED:** plan 01-03 ships full `push`/`fetch` impls; plan 01-03 git-backend test (`git-backend.test.ts` test #12) sets up a `git init --bare` remote, `git remote add origin`, then asserts `vcs.push({remote:'origin',ref:expr.bookmark('main')})` returns exitCode 0 and the bare repo has the commit.

4. **`vcs.kind` runtime field on the frozen object — type-only or runtime?**
   - What we know: D-06 says "runtime literal field on the frozen adapter object."
   - What's unclear: This is a single property; not a question, just confirming. Discriminated union narrows correctly via `if (vcs.kind === 'git')`.
   - Recommendation: No-op — implement as locked.
   - **RESOLVED:** plan 01-02 sets `kind: 'git' as const` on the frozen GitVcsAdapter; the JjVcsAdapter type literal `kind: 'jj'` discriminates the union. Plan 01-02 task 1 test `(vcs.kind === 'git')` narrowing verified.

5. **The `BACKENDS` constant — does it ship Phase 1 with `['git', 'jj-colocated', 'jj-native']` populated, or only `['git']`?**
   - What we know: TEST-03 requires the matrix axis to include all three keys.
   - What's unclear: Phase 1 has no jj backend. Listing `jj-colocated` and `jj-native` in `BACKENDS` will cause `describe.for` to attempt to construct a jj adapter and fail.
   - Recommendation: Two constants: `BACKENDS_AVAILABLE` (Phase 1: `['git']`) and `BACKENDS_DECLARED` (`['git', 'jj-colocated', 'jj-native']`). The `vcsTest` fixture iterates `BACKENDS_AVAILABLE` ∩ env-filter. The matrix axis declaration in TEST-03 is satisfied by the type/constant existing. Phase 3 adds `'jj-colocated'` and `'jj-native'` to `BACKENDS_AVAILABLE`.
   - **RESOLVED:** plan 01-02 ships `BACKENDS_AVAILABLE = ['git']` and `BACKENDS_DECLARED = ['git', 'jj-colocated', 'jj-native']` in `sdk/src/vcs/backends.ts`. Plan 01-01 adds `dist-cjs` to `sdk/package.json` `files` array (downstream npm consumers receive the CJS artifact). `parseBackendsEnv` returns a structured `{available, requested, unavailable}` (per W-6 fix in revision) so the harness can warn when a requested backend is unavailable.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | All | ✓ | engines `>=22` enforced | — |
| pnpm | Build pipeline | ✓ | 11.0.8 | — |
| TypeScript | sdk build | ✓ | sdk devDep ^5.7 | — |
| vitest | sdk test | ✓ | 3.2.4 | — |
| git CLI | git backend tests, lint exemption verification | ✓ | (system git) | — |
| jj CLI | NOT required for Phase 1 (no jj backend) | ✓ (0.41.0 on this dev machine) | 0.41.0 | Phase 1 ships no jj code; jj absence does not block |
| `node --test` | repo-root CJS test suite | ✓ | Node 22 builtin | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

(jj 0.41.0 happens to be installed on the dev machine and the repo IS colocated, but Phase 1 deliberately ships zero jj code. The `vcs.kind === 'jj'` branch of the discriminated union exists as a type but no runtime impl is reachable.)

---

## Validation Architecture

> `.planning/config.json` has `"workflow.nyquist_validation": false`. This section is **not required**. Including a brief note for completeness so the planner has the test-framework summary in one place.

### Test Framework

| Property | Value |
|----------|-------|
| sdk-side | vitest 3.2.4 (`pnpm -F sdk test`, `pnpm -F sdk test:unit`, `pnpm -F sdk test:integration`) |
| repo-side | `node --test` via `scripts/run-tests.cjs` (`npm test` at root, `pnpm test` runs the same) |
| Quick run (sdk-side adapter) | `pnpm -F sdk test:unit -- src/vcs/__tests__/` |
| Quick run (repo-side harness) | `node --test --test-concurrency=4 tests/vcs-adapter-contract.test.cjs` |
| Full suite | `pnpm test` at root (runs both via `pretest: pnpm run build:sdk` then `node scripts/run-tests.cjs`) |

Skipped because nyquist_validation is false in config.

---

## Project Constraints (from CLAUDE.md)

Extracted directives the planner MUST honor:

1. **GitHub access:** Always set `GITHUB_TOKEN` from `.envrc` before any `gh` CLI call. Never use ambient `gh auth`. (Phase 1 doesn't invoke `gh`; relevant only if a planner-added task uses `gh`.)
2. **Issue tracker:** GitHub Issues at `gsd-build/get-shit-done`; use `.envrc` token; see `docs/agents/issue-tracker.md`.
3. **Triage labels:** Custom mapping (`confirmed` = AFK-agent-ready; `approved-enhancement`/`approved-feature` = human-ready; `needs-reproduction` = waiting on reporter).
4. **Domain docs:** Single-context repo. `CONTEXT.md` + `docs/adr/` at root. (Phase 1 may add a new ADR at `docs/adr/0008-vcs-adapter-seam-module.md` documenting the seam — planner discretion; matches the ADR pattern of 0004 and 0007.)

Additional constraints from CONTEXT.md (root domain doc, not phase CONTEXT.md):

5. **No unescaped RegExp interpolation:** `escapeRegex(someVar)` always; the utility is in `core.cjs`.
6. **No top-level `readFileSync` outside `test()` callbacks:** module-level reads abort the runner.
7. **No source-grep tests:** runtime behavior, not source string presence. (`scripts/lint-no-source-grep.cjs` enforces.)
8. **No global regex with `g` flag shared across functions:** `lastIndex` carries between calls; use non-global for boolean checks.
9. **ADR files need Status + Date headers:** `- **Status:** Accepted` and `- **Date:** YYYY-MM-DD` immediately after title.
10. **Step names in workflow XML use hyphens:** `<step name="extract-learnings">` not `<step name="extract_learnings">`.
11. **`allowed-tools` must include every tool the workflow uses:** if Phase 1 introduces a new GSD command (it doesn't), this applies.
12. **No `git config` mutations during gh operations.**

From CLAUDE.md section "User VCS preferences" (via memory):

13. **User uses Jujutsu (jj) for VCS** — prefer `jj` shell commands over `git` for interactive use; `.jj` lives alongside `.git`. (Affects how the user might run development commands during Phase 1, NOT how Phase 1 implements anything — Phase 1 is git-only by spec.)
14. **No raw git anywhere in jj-port** — VCS adapter must cover read AND write; lint guard is whole-repo default-deny on `git`, not just mutating verbs; even `git status` perturbs colocated jj state. (D-17/D-18 already lock this; planner's task list MUST include the lint guard task.)
15. **Squash model for GSD on jj** — user has a squash-centric commit model: `jj squash` (not `jj commit`), allow WC snapshots (never `--ignore-working-copy`), hooks fire after squash. (Phase 4 concern; Phase 1's `vcs.commit` and `vcs.hooks.fire` must be designed so Phase 3 jj impl can wire `jj squash -B @ -k -m` cleanly under the same call signature — D-08 confirms commit auto-advances bookmark on both backends.)

---

## Sources

### Primary (HIGH confidence)

- **`get-shit-done/bin/lib/core.cjs:742-758`** [VERIFIED via Read] — canonical `execGit` shape with `timedOut`/`error` extras; the byte-identity reference for GIT-02
- **`get-shit-done/bin/lib/worktree-safety.cjs:31-49`** [VERIFIED via Read] — duplicate `execGitDefault` with same shape; ADR-0004 establishes this is the worktree policy seam
- **`sdk/src/query/commit.ts:37-48`** [VERIFIED via Read] — three-field execGit (incomplete vs core.cjs); informs Pitfall 4
- **`tests/helpers.cjs:86-104`** [VERIFIED via Read] — `createTempGitProject` is the harness primitive
- **`scripts/run-tests.cjs:26-32`** [VERIFIED via Read] — `node --test` runner; confirms repo-root suite is NOT vitest
- **`scripts/lint-no-source-grep.cjs:73-137`** [VERIFIED via Read] — lint scanner pattern for D-18
- **`sdk/vitest.config.ts`** [VERIFIED via Read] — vitest project split (unit/integration); D-02 plugs into this
- **`vitest.config.ts` (root)** [VERIFIED via Read] — root vitest config; sdk projects split same as `sdk/vitest.config.ts`
- **`sdk/tsconfig.json`** [VERIFIED via Read] — existing ESM config; D-01 extends it
- **`sdk/package.json`** [VERIFIED via Read] — vitest 3.1.1 declared, 3.2.4 actually installed; TS 5.7
- **`sdk/node_modules/vitest/package.json`** [VERIFIED via filesystem] — vitest 3.2.4 installed (supports `describe.for` from 3.0)
- **`docs/adr/0004-worktree-workstream-seam-module.md`** [VERIFIED via Read] — Worktree Safety Policy Module + Worktree Root Resolution Adapter; constrains how `vcs.workspace.*` layers
- **`docs/adr/0007-sdk-package-seam-module.md`** [VERIFIED via Read] — SDK Package Seam Module; relevant to how `dist-cjs/` is consumed from `bin/lib`
- **`.planning/research/ARCHITECTURE.md`** [VERIFIED via Read, full file] — adapter shape design rationale, layering rules, anti-patterns
- **`.planning/research/PITFALLS.md`** [VERIFIED via Read, full file] — anti-patterns; the load-bearing one for Phase 1 is "skipping ahead to land jj logic before the seam exists"
- **`.planning/research/STACK.md`** [VERIFIED via Read, full file] — tech stack constraints (Node ≥22, TS ≥5, no heavy deps)
- **`.planning/intel/git-touchpoints.md`** [VERIFIED via Read, full file] — porting surface; informs forward-complete decision (D-04)
- **`.planning/REQUIREMENTS.md`** [VERIFIED via Read] — VCS-01..07, GIT-01..03, TEST-01..04, TEST-06, TEST-07 are Phase 1 scope
- **`.planning/phases/01-adapter-foundation-git-backend/01-CONTEXT.md`** [VERIFIED via Read, full file] — locked decisions D-01 through D-19

### Secondary (MEDIUM confidence)

- vitest 3.0 changelog: `describe.for` introduced as a supported parameterization primitive; `describe.each` predates it. [CITED: vitest.dev/api/test per research/ARCHITECTURE.md sources]
- ADR-0007 SDK Package Seam — implies `dist-cjs/` consumption path exists conceptually but is not yet realized (no `bin/lib/*.cjs` consumes any `sdk/dist*` per grep). [INFERRED from grep result + ADR text]

### Tertiary (LOW confidence)

- A2 (snapshot/restore strategy choice) is a recommendation among three viable; the planner verifies which produces the cleanest test ergonomics in practice.
- A7 (`findConflicts` git impl semantics) is a placeholder until Phase 3 surfaces the jj counterpart concretely.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every tool already installed, version-verified
- Inventory: HIGH — grep+read produced exhaustive list of git invocation patterns and existing exec wrappers
- Architecture (frozen-object factory + discriminated union): HIGH — locked by D-06/D-07; multiple valid encodings, planner picks
- Build pipeline: HIGH — locked by D-01/D-02/D-03; only thing planner picks is whether to use `concurrently`
- Test harness: HIGH — but planner must be aware of the **two-runner trap** (Pitfall 1) which is the most novel finding
- Lint guard: HIGH — pattern is `lint-no-source-grep.cjs`-shaped per D-18; allowlist scope is the only nuance
- Pitfalls: HIGH — derived from existing inconsistencies (Pitfall 4: commit.ts vs core.cjs execGit shape mismatch) and from research/PITFALLS.md
- gitOnly typing (Pattern 2 encoding choice): MEDIUM — three valid encodings; planner picks; no behavioral risk in choice
- Snapshot/restore strategy (Pattern 3): MEDIUM — three viable, planner picks
- `vcs.findConflicts` semantics: LOW — git-side semantics underdetermined, planner spec'd best-effort and revisits in Phase 3

**Research date:** 2026-05-09
**Valid until:** 2026-06-09 (30 days for stable; the only thing that could shift is upstream `core.cjs` evolution which would be caught in Phase 2's first upstream rebase — UPSTREAM-01)
