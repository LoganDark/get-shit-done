/**
 * jj backend implementation of VcsAdapter (Phase 3).
 *
 * Phase 3 D-08 shape commit: every verb is present but throws
 * VcsNotImplementedError. Verb-group plans 03-02..03-06 fill the bodies in
 * the D-10 order: parsers (03-02) -> refs (03-03) -> commit/squash (03-04) ->
 * status/log/diff/findConflicts (03-05) -> push/fetch/workspace (03-06).
 *
 * Invariants enforced by this file (verified via grep in CI):
 *   - JJ-02: argv-array invocation only via `jjArgv()` helper.
 *   - JJ-03 / D-05: `--ignore-working-copy` is NEVER passed. The helper
 *     `jjArgv()` is the single source of mandatory flags; adding the flag
 *     anywhere outside it would be caught by Pitfall 5 in 03-RESEARCH.md.
 *   - SQUASH-05: `jj commit` is NEVER used; squash is the sole commit primitive.
 *
 * Each read method snapshots `@` at start (auto-snapshot — see PITFALLS.md
 * #2). Callers needing safe multi-step state inspection follow the
 * pre-probe discipline from Phase 2.1 D-06 (the `stagedOrUnstaged` pattern
 * in `bin/lib/commands.cjs`).
 */

import { expr } from '../expr.js';
import { vcsExec, VcsExecError } from '../exec.js';
import type { ExecResult } from '../exec.js';
import { toJjRev } from '../parse/jj-rev.js';
import { parseJjLog } from '../parse/jj-log.js';
import { parseJjWorkspaceList } from '../parse/jj-workspace-list.js';
import { __vcsTestOnly, VcsNotImplementedError } from '../types.js';
import type {
  Bookmark,
  CommitInput,
  CommitResult,
  ConflictResult,
  DiffOpts,
  DiffResult,
  FetchOpts,
  JjVcsAdapter,
  LogEntry,
  LogOpts,
  PushOpts,
  RevisionExpr,
  SnapshotHandle,
  StatusOpts,
  StatusResult,
  VcsBookmarks,
  VcsRefs,
  VcsTestOnly,
  VcsWorkspace,
  WorkspaceAdd,
  WorkspaceContext,
  WorkspaceInfo,
} from '../types.js';

export function createJjAdapter(cwd: string): JjVcsAdapter {
  // ─── helpers ────────────────────────────────────────────────────────────
  /**
   * The single source of mandatory jj flags (JJ-02). Every adapter
   * invocation goes through this helper. `--ignore-working-copy` is
   * deliberately ABSENT per D-05 (locked: never desync the WC).
   *
   * JJ-07: callers needing to inject `JJ_USER` / `JJ_EMAIL` pass them via
   * vcsExec's env option in plan 03-04 (commit/squash plan). The helper
   * itself stays env-agnostic.
   */
  const jjArgv = (...subcommand: string[]): string[] => [
    '--repository',
    cwd,
    '--no-pager',
    '--color',
    'never',
    '--quiet',
    ...subcommand,
  ];

  /**
   * D-03: `gsd/` prefix is adapter-internal. Callers pass unprefixed
   * names; the adapter adds the prefix on every write path. D-04 raw-name
   * escape: `raw === true` skips the addition.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const addPrefix = (name: string, raw?: boolean): string =>
    raw ? name : `gsd/${name}`;

  /**
   * D-03 strip half: every read path that emits a bookmark name to a
   * caller threads through this helper.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const stripPrefix = (name: string): string =>
    name.startsWith('gsd/') ? name.slice('gsd/'.length) : name;

  // ─── stub helper ────────────────────────────────────────────────────────
  const notImpl = (verb: string): never => {
    throw new VcsNotImplementedError(
      `${verb}: jj backend body not yet implemented (Phase 3 — see 03-PLAN sequence)`
    );
  };

  // ─── commit (plan 03-04) ────────────────────────────────────────────────
  const commit = (_input: CommitInput): CommitResult => notImpl('commit');

  // ─── log / status / diff / findConflicts (plan 03-05) ───────────────────
  const log = (_opts: LogOpts = {}): LogEntry[] => notImpl('log');
  const status = (_opts: StatusOpts = {}): StatusResult => notImpl('status');
  const diff = (_opts: DiffOpts = {}): DiffResult => notImpl('diff');
  const findConflicts = (
    _opts: { scope: 'all' | 'working-copy' }
  ): ConflictResult[] => notImpl('findConflicts');

  // ─── push / fetch (plan 03-06) ──────────────────────────────────────────
  const push = (_opts: PushOpts = {}): ExecResult => notImpl('push');
  const fetch = (_opts: FetchOpts = {}): ExecResult => notImpl('fetch');

  // ─── refs.bookmarks namespace (plan 03-03) ──────────────────────────────
  const bookmarks: VcsBookmarks = Object.freeze({
    list: (): Bookmark[] => notImpl('refs.bookmarks.list'),
    create: (_name: string, _rev: RevisionExpr): void =>
      notImpl('refs.bookmarks.create'),
    move: (_name: string, _rev: RevisionExpr): void =>
      notImpl('refs.bookmarks.move'),
    delete: (_name: string): void => notImpl('refs.bookmarks.delete'),
    exists: (_name: string): boolean => notImpl('refs.bookmarks.exists'),
    switch: (_name: string, _opts?: { create?: boolean }): void =>
      notImpl('refs.bookmarks.switch'),
  });

  // ─── refs namespace (plan 03-03) ────────────────────────────────────────
  const refs: VcsRefs = Object.freeze({
    head: expr.head(),
    parent: expr.parent(),
    bookmarks,
    currentBookmarks: (): string[] => notImpl('refs.currentBookmarks'),
    resolveShort: (_rev: RevisionExpr): string => notImpl('refs.resolveShort'),
    countCommits: (_opts: { rev?: RevisionExpr }): number =>
      notImpl('refs.countCommits'),
    rootCommits: (_opts: { rev?: RevisionExpr }): string[] =>
      notImpl('refs.rootCommits'),
    exists: (_rev: RevisionExpr): boolean => notImpl('refs.exists'),
    isIgnored: (_path: string): boolean => notImpl('refs.isIgnored'),
    remotes: (): string[] => notImpl('refs.remotes'),
  });

  // ─── workspace namespace (plan 03-06; stubs only — Phase 4 owns real semantics) ─
  const workspace: VcsWorkspace = Object.freeze({
    add: (_input: WorkspaceAdd): WorkspaceInfo => notImpl('workspace.add'),
    forget: (_path: string): void => notImpl('workspace.forget'),
    list: (): WorkspaceInfo[] => notImpl('workspace.list'),
    context: (): WorkspaceContext => notImpl('workspace.context'),
    prune: (): ExecResult => notImpl('workspace.prune'),
  });

  // ─── test-only snapshot/restore (plan 03-02) ───────────────────────────
  // RESEARCH §`[__vcsTestOnly]`: `jj op log` ids are stable snapshots of
  // the entire repo state. `jj op restore <id>` rewinds the workspace to
  // exactly that operation, which is cleaner than git's `reset --hard +
  // clean -fdx` strategy. D-05 still applies: no `--ignore-working-copy`.
  const testOnly: VcsTestOnly = Object.freeze({
    snapshot: (): SnapshotHandle => {
      const args = jjArgv('op', 'log', '--no-graph', '-T', 'id ++ "\\n"', '-n', '1');
      const r = vcsExec(cwd, 'jj', args);
      if (r.exitCode !== 0) {
        throw new VcsExecError(
          `__vcsTestOnly.snapshot: ${r.stderr || r.stdout}`,
          {
            exitCode: r.exitCode,
            stdout: r.stdout,
            stderr: r.stderr,
            timedOut: r.timedOut,
            args,
          }
        );
      }
      const id = r.stdout.split('\n').filter(Boolean)[0] ?? '';
      if (!id) {
        throw new Error('__vcsTestOnly.snapshot: jj op log returned empty id');
      }
      return { id, kind: 'jj' };
    },
    restore: (handle: SnapshotHandle): void => {
      if (handle.kind !== 'jj') {
        throw new Error(
          `__vcsTestOnly.restore: handle kind mismatch (got ${handle.kind}, expected jj)`
        );
      }
      const args = jjArgv('op', 'restore', handle.id);
      const r = vcsExec(cwd, 'jj', args);
      if (r.exitCode !== 0) {
        throw new VcsExecError(
          `__vcsTestOnly.restore: ${r.stderr || r.stdout}`,
          {
            exitCode: r.exitCode,
            stdout: r.stdout,
            stderr: r.stderr,
            timedOut: r.timedOut,
            args,
          }
        );
      }
      // Q4 (RESEARCH): jj op restore rewinds the jj op-log state but does
      // NOT necessarily delete untracked disk files materialized after the
      // snapshot. The integration test in __tests__/jj-snapshot-restore.test.ts
      // documents the observed behavior; if plan 03-07 wrap-up reveals a
      // cleanup gap, a follow-up `jj st`-driven removal lands here.
    },
  });

  // Mark imports used (silence TS unused warnings — they become real in
  // verb-group plans 03-03..03-06). `vcsExec` is now used by `testOnly`
  // (plan 03-02). Other refs compile away when verbs land.
  void jjArgv;
  void addPrefix;
  void stripPrefix;
  void toJjRev;
  void parseJjLog;
  void parseJjWorkspaceList;

  return Object.freeze({
    kind: 'jj' as const,
    cwd,
    commit,
    log,
    status,
    diff,
    refs,
    workspace,
    findConflicts,
    push,
    fetch,
    [__vcsTestOnly]: testOnly,
  });
}
