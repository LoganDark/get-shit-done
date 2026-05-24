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
  /**
   * Phase 4 plan 04 D-14: phase-merge gate. When set, vcs.commit() reads
   * `${phaseDir}/incomplete-work.md` BEFORE the squash/commit and throws
   * VcsIncompleteSubagentsError if the queue is non-empty.
   *
   * Orchestrator passes this only on the final phase-merge squash (the one
   * that advances `gsd/phase-{N}` to the merge change per WS-09). Subagent-tier
   * squashes do NOT set this. Both backends honour the gate; the queue file
   * format is git/jj-agnostic (markdown line-delimited).
   */
  phaseMergeFor?: {
    phaseDir: string;
  };
}

export interface CommitResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  /**
   * The active backend's canonical revision identifier for the newly-created commit.
   * - On git: `commit_id` (40-char hex). Snapshot-stable.
   * - On jj: `change_id` (12-char [k-z] reverse-base32). Rebase-stable.
   * Null when the commit failed.
   */
  id: string | null;
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
  /**
   * The active backend's canonical revision identifier.
   * - On git: `commit_id` (40-char hex). Snapshot-stable.
   * - On jj: `change_id` (12-char [k-z] reverse-base32). Rebase-stable.
   * Do NOT assume hex form. For short display, use `vcs.refs.resolveShort(expr.rev(id))`
   * (backend-aware short-prefix); never `.slice(0, 7)`.
   */
  id: string;
  parents: string[];
  author: string;
  date: string;
  subject: string;
  body?: string;
}

export interface StatusOpts {
  porcelain?: boolean;
  // Phase 7 D-07 (VCS-11): scoped variant — defaults to adapter's construction cwd if omitted.
  // Internal exec routes spawned-process cwd to this path; git passes -C / jj uses --repository
  // anchored to adapter root while the spawned cwd selects the workspace.
  cwd?: string;
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

// Phase 7 D-06: typed enum for diff status filtering. No leaking of git's
// single-letter convention onto the cross-backend surface (Phase 2.1 D-01).
// Backends translate internally: git emits --diff-filter=<letter>; jj
// post-filters `jj diff --summary` output via parseDiffSummary.
export type DiffFilter = 'added' | 'modified' | 'deleted' | 'renamed' | 'typechange';

export interface DiffOpts {
  staged?: boolean;
  nameOnly?: boolean;
  rev?: RevisionExpr;
  paths?: string[];
  // Plan 02-03 Task 2 gap-fill: emit `git diff --name-status` semantics when true.
  nameStatus?: boolean;
  // Phase 7 D-06 (VCS-10): cross-backend typed enum, no leaking git's single-letter convention.
  diffFilter?: DiffFilter;
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
  /**
   * D-04 (Phase 4): when set on jj backend, becomes the `--name <NAME>` flag
   * value; defaults to path basename if omitted.
   */
  name?: string;
}

/**
 * Phase 7 D-01..D-03 (VCS-12): 2-parent merge change with atomic main-bookmark
 * advance + optional agent-bookmark delete.
 *
 * On jj backend: rendered as `jj new -r @ -r <branch> -m <message>` (preserves
 * both-parent provenance — the exact reason upstream chose `git merge --no-ff`
 * over fast-forward). After the merge change lands and findConflicts({scope:
 * 'working-copy'}) reports clean, `jj bookmark set <mainBookmark> -r @` advances
 * main atomically, then `jj bookmark delete -- <agentBookmark>` (if set) cleans
 * up. All three jj invocations live under one acquireJjWriteLock RAII.
 *
 * On git backend: mirrors upstream verbatim — `git merge --no-ff -m <message>
 * <branch>` (advances HEAD-tracking branch implicitly), then `git branch -D
 * <agentBookmark>` if set. The mainBookmark field is validated against the
 * current branch (throws VcsExecError if mismatch) because git's `merge --no-ff`
 * only advances the currently-checked-out branch — explicit safety > implicit
 * semantic.
 *
 * D-02 (SQUASH-06 conflict-return): in-tree conflict at @ after `jj new`
 * returns { ok: false, conflicted: true, changeId, stderr: '' } with NO
 * auto-abandon. Caller decides resolution path.
 */
export interface WorkspaceMergeOpts {
  branch: RevisionExpr;
  message: string;
  ff: false;  // D-01: type-locked false — ff:true is not a Phase 7 use case
  mainBookmark: string;  // D-03 atomic main-advance: REQUIRED. Caller names the main bookmark to advance after merge lands. Validated via validateRefname before reaching argv.
  agentBookmark?: string;  // D-03: atomically deleted after main bookmark advance
}

export interface WorkspaceMergeResult {
  ok: boolean;
  conflicted: boolean;  // D-02: SQUASH-06 conflict-return semantics (no auto-abandon)
  changeId: string | null;
  stderr: string;
}

/**
 * Phase 4 D-13 / WS-12: a single entry in the per-phase crash queue at
 * `.planning/phases/{N}/incomplete-work.md`. Records change_id (D-06: no
 * commit_id encoding — change_id native from day 1).
 */
export interface IncompleteWorkEntry {
  subagentName: string;
  changeIdShort: string;
  workspacePath: string;
  /**
   * Phase 9 D-09: closed enum. Values:
   *  - 'crashed-with-uncommitted-work' (existing; reap.ts:187 emitter — workspace
   *    head carried real work but the subagent never landed a clean final commit;
   *    crash-recovery path D-12).
   *  - 'merge-in-tree-conflict' (new; reap.ts conflict-classifier branch — the
   *    N-parent octopus merge produced in-tree conflicts on this subagent's
   *    change, surfaced via `jj log -r 'conflicts() & <change>'`).
   * The phase-merge gate at backends/jj.ts:182-194 / backends/git.ts:121-138
   * treats unknown reasons as fail-safe block (09-CONTEXT A1) — keeping the
   * union closed here makes the parse-time validator extension in plan 02 a
   * type-narrowing operation rather than an interface change.
   */
  reason: 'crashed-with-uncommitted-work' | 'merge-in-tree-conflict';
}

/**
 * Phase 4 D-19 / D-29 / WS-11: return shape of `vcs.workspace.reap()`.
 * `abandoned` lists workspaces whose heads were empty (probe per D-12/D-15)
 * and were abandoned + on-disk dir removed. `incomplete` lists workspaces
 * whose heads carried real work (crash-recovery D-12) and were squashed +
 * queued in `incomplete-work.md`; the phase-merge gate blocks while that
 * queue is non-empty (D-14 / VcsIncompleteSubagentsError).
 */
export interface ReapResult {
  /** Workspaces that were abandoned (empty head) + their on-disk dirs rm-rf'd. */
  abandoned: readonly { name: string; changeId: string; path: string }[];
  /** Workspaces whose heads had real work (crash recovery D-12); squashed and queued. */
  incomplete: readonly IncompleteWorkEntry[];
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
  /**
   * Phase 4 (D-19 / WS-12 partial / Pitfall 4): per-workspace advisory lock primitive.
   * On jj backend: O_EXCL sentinel under .jj/working_copy/gsd-lock (NOT .jj/working_copy/checkout
   * — that's jj's internal pointer file, perms 0600 — Pitfall 6 in RESEARCH).
   * On git backend: no-op (kernel-enforced via .git/index.lock).
   * Returns a RAII release-handle. Default timeout 30_000ms. Auto-runs
   * `jj workspace update-stale` on acquire if jj reports stale (D-21).
   */
  acquireWriteLock(workspace: string, opts?: { timeout?: number }): { release(): void };
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
  // Phase 7 D-04 (VCS-08): scoped current-bookmark probe; string[] mirrors currentBookmarks
  // (Phase 2.1 D-15). Spawned-process cwd selects the workspace; --repository stays pinned
  // to adapter root on jj.
  currentBookmarksIn(cwd: string): string[];
  // Phase 7 D-05 (VCS-09): returns change_id on jj (via fork_point(x) revset),
  // commit hash on git (via `git merge-base`). User override of recommendation —
  // change_id chosen for jj despite known rebase-stability tradeoff.
  mergeBase(a: RevisionExpr, b: RevisionExpr): string;
  // Phase 7 planner fold-in (VCS-15): read file content at a revision. Consumed by Plan 4
  // (github-release-notes.cjs:71 migration). git: `git show <rev>:<path>`; jj: `jj file show -r <rev> -- <path>`.
  readBlob(rev: RevisionExpr, path: string): string;
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
  /**
   * Phase 7 D-09 (VCS-14): extend opts with force?: boolean. On git, force=true → `branch -D`
   * (override), force=false/undefined → `branch -d` (safe). On jj, force is a documented no-op
   * — jj's `bookmark delete` already removes the LOCAL view regardless of state. Divergent
   * remote-tracking bookmarks are unaffected on jj (Pitfall 5 in 07-RESEARCH.md). The flag
   * is preserved for API parity with git's branch -D.
   */
  delete(name: string, opts?: { raw?: boolean; force?: boolean }): void;
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
  /**
   * Phase 4 (D-19 / WS-11): batch-reap empty subagent heads after a multi-subagent
   * phase merges. Inventories tracked workspaces by `phaseNamePrefix` (inclusion
   * filter per D-04 / #2774 pattern). Empty heads (zero diff vs parent — see
   * jj/reap.ts for the corrected `jj diff --from <parent> --to <head> -s` probe)
   * are abandoned and their workspaces forgotten. Non-empty heads (crash-recovery
   * path D-12) get squashed as 'subagent N: incomplete work' and appended to
   * .planning/phases/{N}/incomplete-work.md. Empty-tree probe MUST run from the
   * main workspace, NEVER from inside a subagent workspace (D-15 / Pitfall 1).
   */
  reap(opts: { phaseNamePrefix: string; phaseDir: string }): ReapResult;
  /**
   * Phase 7 D-01..D-03 (VCS-12): 2-parent merge change. On jj synthesized via
   * `jj new -r @ -r <branch>` + `jj describe -m`. On git mirrors `git merge
   * --no-ff -m <msg> <branch>`. Returns conflicted-result on in-tree conflict
   * (no auto-abandon, SQUASH-06). Atomic main-bookmark advance + optional
   * agent-bookmark delete under jj write lock (D-03).
   */
  merge(opts: WorkspaceMergeOpts): WorkspaceMergeResult;
  /**
   * Phase 7 D-08 (VCS-13): composite forget + rm -rf on jj; `worktree remove
   * --force` on git. Distinct from workspace.forget (Phase 4 metadata-only
   * primitive). Forget MUST run before rmSync on jj (Pitfall 4) — deleting
   * the on-disk dir first leaves stale metadata in .jj/op_log.
   */
  remove(path: string, opts?: { force?: boolean }): void;
  // Phase 9 (VCS-16, PARALLEL-01/02): cross-backend parallel-dispatch namespace.
  parallel: VcsWorkspaceParallel;
}

// ─── Parallel-dispatch namespace (Phase 9, VCS-16/17, PARALLEL-01/02) ────────

/**
 * Phase 9 (VCS-16): cross-backend parallel-dispatch verb namespace.
 *
 * jj backend body: sdk/src/vcs/jj/parallel.ts (composition over octopus + reap).
 * git backend: throwing stub in Phase 9; real body in Phase 10.
 *
 * Signature locked at `fanIn(handle, results): FanInResult` (two args — D-04;
 * rejects the v1.2-era one-arg `fanIn(wave)` ARCHITECTURE.md draft).
 */
export interface VcsWorkspaceParallel {
  dispatch(opts: ParallelDispatchOpts): ParallelDispatchHandle;
  fanIn(handle: ParallelDispatchHandle, results: readonly ParallelAgentResult[]): FanInResult;
}

/**
 * Phase 9 (VCS-16): dispatch options. `plan` enumerates the per-agent slots
 * to materialize; the adapter creates one workspace per entry. `maxConcurrency`
 * is advisory — backends MAY ignore (jj currently always serializes octopus
 * structure creation in a single orchestrator process).
 */
export interface ParallelDispatchOpts {
  plan: readonly { agentId: string; planId: string; workspacePath?: string }[];
  phaseNumber: number;
  /**
   * Phase 14.1 (PARALLEL-08): optional list of bookmark/branch names to advance
   * to the merge head after a successful fan-in. Empty or omitted → skip the
   * advance step entirely (CF-02/CF-03 — bookmark-less jj `@` and detached-HEAD
   * git working copies are first-class dispatch states). Non-empty → all-or-
   * nothing pre-validation runs over every name BEFORE any `jj bookmark set` /
   * `git update-ref` side effect; iteration then advances each name in argv
   * order. Validation throws on the first invalid name; partial advance is
   * possible only on a vcsExec failure mid-iteration of pass 2 (atomic
   * rollback is deferred — see fan-in body JSDoc).
   */
  mainBookmarks?: readonly string[];
  maxConcurrency?: number;
}

/**
 * Phase 9 (VCS-16, D-07): per-agent result rolled up by the orchestrator after
 * each `Agent()` promise resolves. Passed verbatim into `fanIn` so the adapter
 * can classify success / crash / in-tree-conflict per workspace.
 *
 * `lastChangeId` is optional — reap covers the crash-recovery case where the
 * subagent never landed a clean final commit.
 */
export interface ParallelAgentResult {
  agentId: string;
  exitCode: number;
  lastChangeId?: string;
  stderr?: string;
}

/**
 * Phase 9 (VCS-16, D-05, D-06): pure-JSON handle returned by `dispatch` and
 * consumed by `fanIn`. Survives `gsd-sdk query` JSON serialization round-trip
 * cleanly — no closures, methods, Symbols, or class instances. Runtime
 * `Object.freeze` lives in the adapter body (plan 03); the interface itself
 * only declares the shape.
 */
export interface ParallelDispatchHandle {
  phaseRoot: string;
  phaseNumber: number;
  /**
   * Phase 14.1 (PARALLEL-08): frozen mirror of the dispatch-time
   * `ParallelDispatchOpts.mainBookmarks`. `Object.freeze`d (CF-05 — preserves
   * pure-JSON cross-call immutability) in both backend Handle construction
   * sites. Empty/omitted → fan-in skips the advance step; non-empty → fan-in
   * runs all-or-nothing pre-validation then per-name advance via `jj bookmark
   * set <name> -r @` (jj) / `git update-ref refs/heads/<name> HEAD` (git).
   */
  mainBookmarks?: readonly string[];
  /** Absolute path to the WAVE_WORKTREE_MANIFEST written at dispatch (VCS-19). */
  manifest: string;
  workspaces: readonly Readonly<{
    name: string;
    path: string;
    /**
     * change_id on jj; stable across `jj rebase`.
     * commit_id on git; stable across `git rebase`.
     * Cross-backend semantics: rebase-stable revision pointer to the parent
     * change the workspace forked from. (PARALLEL-05, D-14.)
     */
    baseRev: string;
    agentId: string;
    /**
     * D-01 forward-compat reservation. Currently always `undefined` — Phase 9
     * discuss-phase dropped PARALLEL-03 (liveness probe) at premise level
     * (2026-05-15). Reserved on the shape so a future re-introduced liveness
     * probe can populate without a breaking interface change.
     */
    baselineOpId?: string;
  }>[];
}

/**
 * Phase 9 (VCS-16, D-08): result of `fanIn`. The `conflicted: boolean` field
 * is the load-bearing Pitfall-2 surface — distinguishes in-tree-conflict-success
 * (octopus merge produced conflicts that reap classified as
 * 'merge-in-tree-conflict' and queued for human review) from per-agent crash
 * (queued as 'crashed-with-uncommitted-work'). Neither sets `conflicted: true`
 * unless the merge itself produced in-tree conflicts at the phase-merge change.
 *
 * No `liveWorkspaces` field — D-01 dropped PARALLEL-03 (the orchestrator
 * awaits all Agent() resolutions before fanIn; no production scenario fires
 * fanIn while a workspace is mid-write). No `partial` field for the same
 * reason.
 */
export interface FanInResult {
  /** change_ids (jj) / commit_ids (git) of agent heads that landed cleanly. */
  merged: readonly string[];
  conflicted: boolean;
  conflictedPaths: readonly string[];
  incompleteQueued: number;
  failedReaped: readonly string[];
  surplusBookmarks: readonly string[];
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
  /**
   * Plan 05-01 Task 1.5 (D-33 batch 1): git-side revert primitive that the new
   * `gsd-sdk query revert` shim wraps. The jj backend dispatches `jj abandon`
   * directly inside the SDK query verb (destructive-semantics shift per
   * 05-RESEARCH.md Pitfall 6) and does NOT expose a parallel method here —
   * the gitOnly branch is reachable only after `vcs.kind === 'git'` narrowing.
   */
  revert(opts: { rev: string; noCommit: boolean }): ExecResult;
  /**
   * Phase 5 plan 05-06 Task 1 (CR-04 fix): drop an in-progress `git revert`
   * sequence. Wraps `git revert --abort`. Does NOT throw on non-zero exit —
   * caller inspects `exitCode` (zero = sequence dropped, non-zero = no
   * sequence in progress / git failure). The jj backend has no in-progress
   * revert sequence, so the `gsd-sdk query revert --abort` shim returns a
   * documented no-op envelope on jj WITHOUT calling this method.
   */
  revertAbort(): ExecResult;
  /**
   * Plan 05-01 Task 2 (D-33 batch 1, Rule 3 blocking issue closure): git-side
   * reset / merge / restore primitives that the new `gsd-sdk query reset|merge|
   * restore` shims wrap. No parallel jj method — the SDK shims return a clean
   * "not supported on jj backend" error after `vcs.kind === 'jj'` narrowing
   * fails. Args are always built via array (no shell-string concatenation).
   *
   * Phase 5 plan 05-06 Task 1 (CR-03 fix): path-scoped reset support. When
   * `paths` is non-empty, the impl appends `-- <paths>` to the git argv so
   * only those index entries are touched. Empty/missing → whole-index reset
   * (current behavior).
   */
  reset(opts: { ref: string; mode: 'soft' | 'mixed' | 'hard'; paths?: string[] }): ExecResult;
  merge(opts: { ref: string; squash?: boolean; noFf?: boolean; noCommit?: boolean }): ExecResult;
  restore(opts: { files: string[]; from?: string }): ExecResult;
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
 * Phase 4 D-14: thrown by `vcs.commit()` when a phase-merge squash is attempted
 * while `.planning/phases/{N}/incomplete-work.md` is non-empty. Caller must
 * empty the queue file (delete entries they've reviewed) before re-running.
 */
export class VcsIncompleteSubagentsError extends Error {
  readonly name = 'VcsIncompleteSubagentsError';
  readonly entries: readonly IncompleteWorkEntry[];
  readonly phaseDir: string;
  readonly hint?: string;

  constructor(fields: {
    entries: readonly IncompleteWorkEntry[];
    phaseDir: string;
    hint?: string;
  }) {
    super(
      `phase merge blocked: ${fields.entries.length} incomplete subagent ${fields.entries.length === 1 ? 'entry' : 'entries'} queued at ${fields.phaseDir}/incomplete-work.md`
    );
    this.entries = fields.entries;
    this.phaseDir = fields.phaseDir;
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
