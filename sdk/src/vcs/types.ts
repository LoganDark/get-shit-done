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
   * Phase 2.1 D-02 + D-04: path set whose WC state to capture (mix of
   * adds/mods/dels). Git backend synthesizes via `git add -A -- <paths>`; jj
   * backend (Phase 3) records the WC-state directly via
   * `jj squash <paths> -B @ -k -m '<msg>'`.
   *
   * - `undefined`: capture all tracked changes (`git commit -am`).
   * - `[…paths]` (≥1 entry): WC-state-capture for those paths only.
   * - `[]` (empty array): REJECTED (WR-01 preserved) — pass `undefined` for
   *   `-am` semantics, or ≥1 path for path-set semantics. The empty-array
   *   case used to silently fall through to `-am`, a data-correctness footgun.
   *
   * Phase 2.1 D-02: the legacy commit-scope-narrowing field has been
   * removed; callers that previously composed `stage(...)` then
   * `commit({...narrow-scope...})` collapse to a single
   * `commit({files:[...]})` call.
   */
  files?: string[];
  message: string;
  allowEmpty?: boolean;
  /**
   * Plan 02-08 gap-fill (Rule 3 — blocking issue closure): when true, the
   * commit emits `git commit --amend --no-edit` and the `message` field is
   * IGNORED (HEAD's existing message is preserved). Required by
   * sdk/src/query/commit.ts's `--amend` code path; without this, the
   * migration cannot preserve commit handler semantics.
   */
  amend?: boolean;
  /**
   * Phase 2.1 D-08: the only public knob for skipping pre-commit hook
   * firing. Cross-backend. Git: passes `--no-verify` to `git commit`. Jj
   * (Phase 3): skips internal `fireHook` invocation post-squash.
   */
  noVerify?: boolean;
  /**
   * Phase 3 D-01: when set, the jj backend advances exactly this bookmark to
   * the new commit via `jj bookmark set gsd/<name> -r <new> -B` after squash.
   * Git backend: ignored (git's `commit` on a checked-out branch auto-advances
   * natively). Caller passes unprefixed name; adapter adds `gsd/`.
   */
  bookmark?: string;
  /**
   * Phase 3 D-04: raw-name escape — same as `bookmark` but adapter does NOT
   * add the `gsd/` prefix. For upstream-tracking bookmarks (main, trunk).
   * Git backend: ignored.
   */
  bookmarkRaw?: string;
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
  // Plan 02-03 Task 2 gap-fill: emit `git log --all` semantics when true.
  allRefs?: boolean;
  // NOTE (Phase 2 CR-02): `format?: 'oneline' | 'full' | 'json'` was declared
  // here historically but never honoured by the git backend (the implementation
  // unconditionally used the structured `LOG_FORMAT`). Removed to narrow the
  // public contract to what is actually implemented. Callers that previously
  // passed `format: 'oneline'` already reconstructed an "oneline-equivalent"
  // from structured LogEntry[] (slice(0,7) of hash + subject); that
  // reconstruction is now the documented shape.
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
  worktree: string;
  // Phase 2.1 D-16: `index` REMOVED — meaningless cross-backend after
  // stage/unstage drop (D-03). Sites that probed git's index character
  // either no longer have callers (audited) or now use raw git inside an
  // allowlisted test file (not the adapter).
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
  /**
   * Phase 2.1 D-08: the only public knob for skipping pre-push hook firing.
   * Cross-backend. Git: passes `--no-verify` to `git push`. Jj (Phase 3):
   * skips internal `fireHook` invocation pre-push.
   */
  noVerify?: boolean;
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
  findConflicts(opts: { scope: 'all' | 'working-copy' }): ConflictResult[];
  push(opts?: PushOpts): ExecResult;
  fetch(opts?: FetchOpts): ExecResult;
  // Phase 2.1 D-03: `stage(files)` and `unstage(files)` REMOVED entirely —
  // not even moved to gitOnly. Callers refactor onto `commit({files})` with
  // WC-state-capture semantics (D-02 + D-04). Tests that genuinely need to
  // probe git's index use raw git inside an allowlisted test file.
  // Phase 2.1 D-07: the public `hooks` namespace has been REMOVED. `fireHook`
  // is now a private helper in hook-bridge.ts; Phase 4 (HOOK-01..05) wires
  // internal invocations from commit() / push().
}

export interface VcsRefs {
  readonly head: RevisionExpr;
  readonly parent: RevisionExpr;
  bookmarks: VcsBookmarks;
  /**
   * Phase 2.1 D-15: renamed (and retyped) from the prior single-string
   * accessor. Both backends can have 0..N bookmarks/branches pointing at
   * the same revision;
   * empty array means anonymous head (jj) or detached HEAD (git). Consumers
   * that previously took the value as `string | null` now adopt array
   * semantics — most take `[0] ?? null` for UI surfacing or check
   * `.length === 0` for detached/anonymous detection.
   */
  currentBookmarks(): string[];
  resolveShort(rev: RevisionExpr): string;
  countCommits(opts: { rev?: RevisionExpr }): number;
  rootCommits(opts: { rev?: RevisionExpr }): string[];
  exists(rev: RevisionExpr): boolean;
  isIgnored(path: string): boolean;
  remotes(): string[];
}

export interface VcsBookmarks {
  list(): Bookmark[];
  /**
   * Phase 3 D-04 raw-name escape: when `opts.raw === true` the jj backend
   * does NOT add its internal `gsd/` prefix (used for upstream-tracking
   * bookmarks like `main`/`trunk`). On the git backend the flag is accepted
   * and IGNORED — git branches use unprefixed names natively, there is no
   * `gsd/` prefix to escape.
   */
  create(name: string, rev: RevisionExpr, opts?: { raw?: boolean }): void;
  move(name: string, rev: RevisionExpr, opts?: { raw?: boolean }): void;
  delete(name: string, opts?: { raw?: boolean }): void;
  exists(name: string, opts?: { raw?: boolean }): boolean;
  // Plan 02-03 Task 1 gap-fill (RESEARCH §Forward-Complete Gaps Summary);
  // Phase 3 D-04 extended `opts` with the raw-name escape.
  switch(name: string, opts?: { create?: boolean; raw?: boolean }): void;
}

// Phase 2.1 D-18: workspace.context() return shape — cross-backend fields only.
// gitDir and gitCommonDir moved to vcs.gitOnly.gitDir() / vcs.gitOnly.gitCommonDir()
// (accessed after `vcs.kind === 'git'` narrowing). The single production
// consumer of linked-worktree detection (worktree-safety.cjs) is already
// git-specific per ADR-0004 and adopts the narrowing pattern.
export interface WorkspaceContext {
  effectiveRoot: string;
  mode: 'main' | 'linked';
  isLinked: boolean;
}

export interface VcsWorkspace {
  add(input: WorkspaceAdd): WorkspaceInfo;
  forget(path: string): void;
  list(): WorkspaceInfo[];
  // Plan 02-03 Task 2 gap-fill (RESEARCH §Forward-Complete Gaps Summary):
  context(): WorkspaceContext;
  prune(): ExecResult;
}

// Phase 2.1 D-07: the public hooks namespace interface has been DELETED.
// `fireHook` is now a private helper inside hook-bridge.ts; HookStage /
// HookContext remain exported (the hook-bridge module uses them) but are
// not part of any public adapter surface. Phase 4 (HOOK-01..05) wires
// internal invocation from commit() / push() in the backends.

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
  // Phase 2.1 D-18: moved from WorkspaceContext. The raw path strings the
  // underlying `git rev-parse --git-dir` / `--git-common-dir` produce; consumers
  // (worktree-safety.cjs:122-123) narrow on `vcs.kind === 'git'` first.
  gitDir(): string;          // for main repo == gitCommonDir; for linked worktree == .git/worktrees/<name>
  gitCommonDir(): string;    // absolute path to the main repo's .git directory
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

// ─── Error classes (Phase 3 D-02 + planner's-discretion) ────────────────────

/**
 * Phase 3 D-02: jj's `name??` divergent-bookmark state surfaces as this typed
 * error rather than being swallowed by `bookmark set`. Thrown from any read
 * or write touching bookmarks when `jj bookmark list` reports a multi-element
 * `target` array. Without this, concurrent op-log updates in multi-workspace
 * flows become invisible corruption.
 */
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

/**
 * Phase 3 D-08 + D-12: thrown by a JjVcsAdapter verb whose body has not yet
 * landed (per the D-10 verb-group ordering). The per-verb allowlist
 * (`BACKENDS_AVAILABLE_FOR_VERB` in backends.ts) gates fixture access
 * throw-not-skip, so a verb absent from the allowlist throws this typed
 * error rather than silently skipping (TEST-06 skip-count guard).
 *
 * Distinct from VcsExecError (which is for non-zero exit-code shell-outs).
 */
export class VcsNotImplementedError extends Error {
  readonly name = 'VcsNotImplementedError';
  constructor(message: string) {
    super(message);
  }
}
