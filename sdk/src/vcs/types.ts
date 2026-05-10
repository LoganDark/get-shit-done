/**
 * VcsAdapter type contract.
 * Authoritative TypeScript interface; both backends and all consumers compile against it.
 *
 * Phase 1 designs the forward-complete surface (D-04): every namespace any later phase needs.
 * Git backend implements all of it; jj backend (Phase 3) implements everything except gitOnly.
 */

import type { ExecResult, ExecOptions } from './exec.js';
export type { ExecResult, ExecOptions };

// ─── Discriminator ───────────────────────────────────────────────────────────

export type VcsKind = 'git' | 'jj';
export type VcsBackendKey = 'git' | 'jj-colocated' | 'jj-native';

// ─── RevisionExpr (branded) ──────────────────────────────────────────────────

declare const __vcsRevisionBrand: unique symbol;
export type RevisionExpr = string & { readonly [__vcsRevisionBrand]: 'RevisionExpr' };

// ─── Inputs / outputs ────────────────────────────────────────────────────────

export interface CommitInput {
  /**
   * Path set to commit.
   * - `undefined`: run `git commit -am` (all tracked modifications).
   * - `[…paths]` (≥1 entry): `git add <paths…>` then `git commit -m`.
   * - `[]` (empty array): REJECTED with a structured error — see WR-01. Pass
   *   `undefined` for `-am` semantics, or at least one path for path-set
   *   semantics. The empty-array case used to silently fall through to `-am`,
   *   which is a data-correctness footgun.
   */
  files?: string[];
  message: string;
  allowEmpty?: boolean;
}

export interface CommitResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  hash: string | null;
}

export interface LogOpts {
  rev?: RevisionExpr;
  maxCount?: number;
  paths?: string[];
  format?: 'oneline' | 'full' | 'json';
  // Plan 02-03 Task 2 gap-fill: emit `git log --all` semantics when true.
  allRefs?: boolean;
}

export interface LogEntry {
  hash: string;
  parents: string[];
  author: string;
  date: string;
  subject: string;
  body?: string;
}

export interface StatusOpts {
  porcelain?: boolean;
}

export interface StatusEntry {
  path: string;
  index: string;
  worktree: string;
}
export interface StatusResult {
  entries: StatusEntry[];
  raw: string;
}

export interface DiffOpts {
  staged?: boolean;
  nameOnly?: boolean;
  rev?: RevisionExpr;
  paths?: string[];
  // Plan 02-03 Task 2 gap-fill: emit `git diff --name-status` semantics when true.
  nameStatus?: boolean;
}
export interface DiffNameStatusEntry {
  path: string;
  status: 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U' | 'X' | 'B';
}
export interface DiffResult {
  raw: string;
  nameOnly: string[];
  // Populated when DiffOpts.nameStatus is true; undefined otherwise (preserves
  // existing call-site shape for nameOnly-only consumers).
  nameStatus?: DiffNameStatusEntry[];
}

export interface Bookmark {
  name: string;
  rev: string;
}

export interface WorkspaceInfo {
  path: string;
  rev: string;
  locked: boolean;
}
export interface WorkspaceAdd {
  path: string;
  baseRef?: RevisionExpr;
}

export type HookStage = 'pre-commit' | 'pre-push';
export interface HookContext {
  env?: Record<string, string>;
  stagedFiles?: string[];
}

export interface ConflictResult {
  rev: string;
  paths: string[];
  scope: 'all' | 'working-copy';
}

export interface PushOpts {
  remote?: string;
  ref?: RevisionExpr;
  force?: boolean;
}
export interface FetchOpts {
  remote?: string;
  ref?: string;
}

// ─── Common surface ──────────────────────────────────────────────────────────

export interface VcsAdapterCommon {
  readonly cwd: string;
  commit(input: CommitInput): CommitResult;
  log(opts?: LogOpts): LogEntry[];
  status(opts?: StatusOpts): StatusResult;
  diff(opts?: DiffOpts): DiffResult;
  refs: VcsRefs;
  workspace: VcsWorkspace;
  hooks: VcsHooks;
  findConflicts(opts: { scope: 'all' | 'working-copy' }): ConflictResult[];
  push(opts?: PushOpts): ExecResult;
  fetch(opts?: FetchOpts): ExecResult;
  // Plan 02-03 Task 1 gap-fill (RESEARCH §Forward-Complete Gaps Summary):
  // top-level stage / unstage verbs symmetric on git and jj backends.
  stage(files: string[]): ExecResult;
  unstage(files: string[]): ExecResult;
}

export interface VcsRefs {
  readonly head: RevisionExpr;
  readonly parent: RevisionExpr;
  bookmarks: VcsBookmarks;
  // Plan 02-03 Task 1 gap-fill (RESEARCH §Forward-Complete Gaps Summary):
  currentBranch(): string | null;
  resolveShort(rev: RevisionExpr): string;
  countCommits(opts: { rev?: RevisionExpr }): number;
  rootCommits(opts: { rev?: RevisionExpr }): string[];
  exists(rev: RevisionExpr): boolean;
  isIgnored(path: string): boolean;
  remotes(): string[];
}

export interface VcsBookmarks {
  list(): Bookmark[];
  create(name: string, rev: RevisionExpr): void;
  move(name: string, rev: RevisionExpr): void;
  delete(name: string): void;
  exists(name: string): boolean;
  // Plan 02-03 Task 1 gap-fill (RESEARCH §Forward-Complete Gaps Summary):
  switch(name: string, opts?: { create?: boolean }): void;
}

// Plan 02-03 Task 2 — Blocker 4 extension: workspace.context() return shape.
// gitDir/gitCommonDir let worktree-safety.cjs:122-123 migrate cleanly without
// semantics drift — they are the raw path strings the underlying
// `git rev-parse --git-dir` / `--git-common-dir` would have produced.
export interface WorkspaceContext {
  effectiveRoot: string;
  mode: 'main' | 'linked';
  isLinked: boolean;
  gitDir: string;        // for main repo == gitCommonDir; for linked worktree == .git/worktrees/<name>
  gitCommonDir: string;  // absolute path to the main repo's .git directory
}

export interface VcsWorkspace {
  add(input: WorkspaceAdd): WorkspaceInfo;
  forget(path: string): void;
  list(): WorkspaceInfo[];
  // Plan 02-03 Task 2 gap-fill (RESEARCH §Forward-Complete Gaps Summary):
  context(): WorkspaceContext;
  prune(): ExecResult;
}

export interface VcsHooks {
  fire(stage: HookStage, ctx?: HookContext): ExecResult;
}

// ─── Discriminated union (D-06/D-07 — branch-typed gitOnly) ─────────────────

export interface GitOnlyOps {
  createAnnotatedTag(name: string, message: string, rev: RevisionExpr): void;
  version(): string;
  // Plan 02-03 Task 2 gap-fill (RESEARCH §Forward-Complete Gaps Summary + W2):
  // bootstrap-path verbs that allow shared test helpers and init-runner.ts to
  // run on a fresh dir without raw-git fallbacks.
  init(): void;                                  // git init in cwd
  configGet(key: string): string | null;         // git config --get; null on exit 1
  configSet(key: string, value: string): void;   // git config <key> <value>; throw on non-zero
  // D-12: NO `raw` escape hatch in Phase 1. Add specific verbs as Phase 2 migration discovers them.
}

export interface GitVcsAdapter extends VcsAdapterCommon {
  readonly kind: 'git';
  readonly gitOnly: GitOnlyOps;
}

export interface JjVcsAdapter extends VcsAdapterCommon {
  readonly kind: 'jj';
  // NO gitOnly — accessing vcs.gitOnly on an unnarrowed VcsAdapter is a TS error.
}

export type VcsAdapter = GitVcsAdapter | JjVcsAdapter;

// ─── Test-only namespace (D-14, symbol-gated) ────────────────────────────────

export const __vcsTestOnly: unique symbol = Symbol.for('gsd.vcs.testOnly');

export interface SnapshotHandle {
  readonly id: string;
  readonly kind: VcsKind;
}

export interface VcsTestOnly {
  snapshot(): SnapshotHandle;
  restore(handle: SnapshotHandle): void;
}
