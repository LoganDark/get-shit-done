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
import { parseJjBookmarkRecord } from '../parse/jj-bookmark.js';
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
  const addPrefix = (name: string, raw?: boolean): string =>
    raw ? name : `gsd/${name}`;

  /**
   * D-03 strip half: every read path that emits a bookmark name to a
   * caller threads through this helper.
   */
  const stripPrefix = (name: string): string =>
    name.startsWith('gsd/') ? name.slice('gsd/'.length) : name;

  /**
   * Phase 3 JJ-07: propagate `JJ_USER` / `JJ_EMAIL` from the calling
   * process env down into the spawned jj invocation when set. Returns
   * `undefined` (instead of an empty `{ env: {} }` object) when no env
   * vars are set, so vcsExec inherits process.env unchanged via spawnSync's
   * default behavior. Pinned by `exec-env-passthrough.test.ts` (Task 1).
   */
  const envOpts = (): { env?: Record<string, string> } | undefined => {
    const env: Record<string, string> = {};
    if (process.env.JJ_USER) env.JJ_USER = process.env.JJ_USER;
    if (process.env.JJ_EMAIL) env.JJ_EMAIL = process.env.JJ_EMAIL;
    return Object.keys(env).length > 0 ? { env } : undefined;
  };

  // ─── stub helper ────────────────────────────────────────────────────────
  const notImpl = (verb: string): never => {
    throw new VcsNotImplementedError(
      `${verb}: jj backend body not yet implemented (Phase 3 — see 03-PLAN sequence)`
    );
  };

  // ─── commit (plan 03-04) ────────────────────────────────────────────────
  /**
   * Squash-based commit: snapshot the working copy (jj's natural pre-command
   * behavior, NEVER suppressed per D-05), then squash `@`'s content into a
   * new commit between `@-` and `@` (effectively at `@-` after `-B @`).
   *
   * - SQUASH-01: `commit({files, message})` → `jj squash <files> -B @ -k -m '<msg>'`
   * - SQUASH-02: `commit({message})` (no files) → same minus path args.
   * - SQUASH-03: paths with no WC changes are accepted (jj is path-agnostic).
   * - SQUASH-04: `@` description is preserved (jj-native behavior).
   * - SQUASH-05: `jj commit` is NEVER invoked — squash is the sole primitive.
   * - SQUASH-06: conflicted-state commits surface via CommitResult.hash; the
   *   adapter does NOT auto-resolve. Phase 3 plan 05 wires findConflicts.
   * - SQUASH-07: code paths + `.planning/*` paths squashable in a single call.
   * - REFS-05 + D-01: `input.bookmark` triggers `jj bookmark set gsd/<name>
   *   -r @- -B` after the squash succeeds.
   * - D-04: `input.bookmarkRaw` triggers the same advance without the
   *   `gsd/` prefix (for upstream-tracking `main`/`trunk`).
   * - JJ-07: `JJ_USER` / `JJ_EMAIL` env propagated through `envOpts()`.
   * - WR-01: `commit({files:[]})` throws the same ambiguity error as the
   *   git backend (cross-backend invariant — copied verbatim from git.ts).
   * - `amend: true`: throws `VcsNotImplementedError` (RESEARCH Q5 — deferred
   *   to Phase 4/5 if a real caller emerges).
   * - `allowEmpty`: no-op on jj (squash naturally produces empty source =
   *   no-change, jj does not error). Field accepted and ignored.
   * - `noVerify`: no-op in Phase 3; Phase 4 owns hook firing internally.
   */
  const commit = (input: CommitInput): CommitResult => {
    // WR-01 verbatim from git.ts:106-110 (cross-backend ambiguity rule).
    if (input.files !== undefined && input.files.length === 0) {
      throw new Error(
        'commit({files:[]}) is ambiguous; pass files: undefined for the all-changes form, ' +
          'or pass at least one path to commit a specific path set.',
      );
    }
    if (input.amend) {
      throw new VcsNotImplementedError(
        'amend: not yet supported on jj backend (deferred per Phase 3 RESEARCH §Q5)',
      );
    }
    // allowEmpty / noVerify: documented no-ops on jj. See JSDoc above.

    // SQUASH-01 / SQUASH-02: argv-array invocation; files trail as positional
    // [FILESETS]... per `jj squash --help`. `-B @` places the new commit
    // BEFORE @ (i.e. between @- and @); `-k` keeps change_ids stable across
    // the operation so the orchestrator's tracked head ids remain valid.
    const squashArgs = jjArgv('squash', '-B', '@', '-k', '-m', input.message);
    if (input.files && input.files.length > 0) {
      squashArgs.push(...input.files);
    }
    const squashRes = vcsExec(cwd, 'jj', squashArgs, envOpts());
    if (squashRes.exitCode !== 0) {
      return {
        exitCode: squashRes.exitCode,
        stdout: squashRes.stdout,
        stderr: squashRes.stderr,
        hash: null,
      };
    }

    // Hash resolution: after `jj squash -B @ -k`, the new commit sits at @-
    // (the orchestrator's tracked WC `@` change-id is unchanged thanks to
    // `-k`, but its parent is now the newly-created squash commit).
    // Parsing the `Created new commit ...` stdout text is fragile across
    // jj versions; a second `jj log -r @- -T commit_id -n 1` call is the
    // deterministic form per RESEARCH §commit().
    const hashArgs = jjArgv(
      'log', '-r', '@-', '-T', 'commit_id', '--no-graph', '-n', '1',
    );
    const hashRes = vcsExec(cwd, 'jj', hashArgs);
    const hash = hashRes.exitCode === 0 ? hashRes.stdout.trim() : null;

    // D-01 / D-04: bookmark advance. The squash already succeeded; an
    // advance failure here is reported via merged stderr (never silently
    // swallowed — T-03.04-03 mitigation).
    if (input.bookmark !== undefined || input.bookmarkRaw !== undefined) {
      const bmName = input.bookmarkRaw !== undefined
        ? input.bookmarkRaw
        : addPrefix(input.bookmark!);
      const advArgs = jjArgv('bookmark', 'set', bmName, '-r', '@-', '-B');
      const advRes = vcsExec(cwd, 'jj', advArgs);
      if (advRes.exitCode !== 0) {
        return {
          exitCode: squashRes.exitCode,
          stdout: squashRes.stdout,
          stderr: `${squashRes.stderr}\n[bookmark advance failed]: ${advRes.stderr || advRes.stdout}`,
          hash,
        };
      }
    }

    return {
      exitCode: squashRes.exitCode,
      stdout: squashRes.stdout,
      stderr: squashRes.stderr,
      hash,
    };
  };

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
  // D-03 (gsd/ prefix discipline): every mutating write threads through
  // `addPrefix(name, opts?.raw)`; every read site that emits a name to a
  // caller threads through `stripPrefix(rawName)`.
  // D-04 (raw escape): `opts.raw === true` opts out of the prefix add on
  // mutating methods. Used for upstream-tracking bookmarks like `main`.
  // D-02 (divergence): `bookmarks.list` throws `VcsBookmarkDivergentError`
  // via `parseJjBookmarkRecord` when the `target` array reports >1 entry.
  const bookmarks: VcsBookmarks = Object.freeze({
    list: (): Bookmark[] => {
      const args = jjArgv('bookmark', 'list', '-T', 'json(self) ++ "\\n"');
      const r = vcsExec(cwd, 'jj', args);
      if (r.exitCode !== 0) {
        throw new VcsExecError(`refs.bookmarks.list failed: ${r.stderr || r.stdout}`, {
          exitCode: r.exitCode,
          stdout: r.stdout,
          stderr: r.stderr,
          timedOut: r.timedOut,
          args,
        });
      }
      const lines = r.stdout.split('\n').filter(Boolean);
      return lines.map((line) => parseJjBookmarkRecord(line, stripPrefix));
    },
    create: (name: string, rev: RevisionExpr, opts?: { raw?: boolean }): void => {
      const actualName = addPrefix(name, opts?.raw);
      const args = jjArgv('bookmark', 'create', actualName, '-r', toJjRev(rev));
      const r = vcsExec(cwd, 'jj', args);
      if (r.exitCode !== 0) {
        throw new Error(`refs.bookmarks.create failed: ${r.stderr || r.stdout}`);
      }
    },
    move: (name: string, rev: RevisionExpr, opts?: { raw?: boolean }): void => {
      const actualName = addPrefix(name, opts?.raw);
      const args = jjArgv('bookmark', 'move', actualName, '--to', toJjRev(rev));
      const r = vcsExec(cwd, 'jj', args);
      if (r.exitCode !== 0) {
        throw new Error(`refs.bookmarks.move failed: ${r.stderr || r.stdout}`);
      }
    },
    delete: (name: string, opts?: { raw?: boolean }): void => {
      const actualName = addPrefix(name, opts?.raw);
      const args = jjArgv('bookmark', 'delete', actualName);
      const r = vcsExec(cwd, 'jj', args);
      if (r.exitCode !== 0) {
        throw new Error(`refs.bookmarks.delete failed: ${r.stderr || r.stdout}`);
      }
    },
    exists: (name: string, opts?: { raw?: boolean }): boolean => {
      const actualName = addPrefix(name, opts?.raw);
      // `jj bookmark list <name>` exits 0 even when the bookmark is absent
      // (just emits an empty list). The presence probe combines exit-0 with
      // non-empty stdout.
      const args = jjArgv('bookmark', 'list', actualName);
      const r = vcsExec(cwd, 'jj', args);
      return r.exitCode === 0 && r.stdout.trim().length > 0;
    },
    switch: (_name: string, _opts?: { create?: boolean; raw?: boolean }): void => {
      // RESEARCH §`refs.bookmarks.switch`: no Phase 3 caller exercises this
      // on jj backends. The two production callers in get-shit-done/bin/lib/
      // commands.cjs:319/321 both pin `createVcsAdapter(cwd, { kind: 'git' })`
      // so the dispatch is statically git-only. Audit recorded in
      // 03-03-AUDIT.md; Phase 4 reshapes if WS-* needs it.
      throw new VcsNotImplementedError(
        'refs.bookmarks.switch: deferred — no Phase 3 caller exercises this on jj backend (see 03-03-AUDIT.md)',
      );
    },
  });

  // ─── refs namespace (plan 03-03) ────────────────────────────────────────
  const refs: VcsRefs = Object.freeze({
    head: expr.head(),
    parent: expr.parent(),
    bookmarks,

    currentBookmarks: (): string[] => {
      // jj's "current bookmark" semantics map to bookmarks at @- (the parent
      // of the working-copy commit), because @ is always the in-progress WC
      // commit. Multiple bookmarks can point at the same revision; the
      // template `bookmarks.join("\n")` emits each name on its own line.
      const args = jjArgv(
        'log',
        '-r',
        '@-',
        '-T',
        'bookmarks.join("\\n")',
        '--no-graph',
        '-n',
        '1',
      );
      const r = vcsExec(cwd, 'jj', args);
      if (r.exitCode !== 0) return [];
      return r.stdout
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        // jj appends `*` to a bookmark name when the local bookmark is ahead
        // of its remote-tracking counterpart. Strip for caller-visible name.
        .map((s) => s.replace(/\*$/, ''))
        .map(stripPrefix);
    },

    resolveShort: (rev: RevisionExpr): string => {
      const args = jjArgv(
        'log',
        '-r',
        toJjRev(rev),
        '-T',
        'commit_id.short()',
        '--no-graph',
        '-n',
        '1',
      );
      const r = vcsExec(cwd, 'jj', args);
      if (r.exitCode !== 0) {
        throw new Error(`refs.resolveShort failed: ${r.stderr || r.stdout}`);
      }
      return r.stdout.trim();
    },

    countCommits: ({ rev }: { rev?: RevisionExpr }): number => {
      const target = rev ? toJjRev(rev) : '::@';
      // Emit each commit's id on its own line so the count survives
      // vcsExec's stdout trim (a bare `"\n"` template would collapse to
      // empty stdout after trim and miscount as zero). `.split('\n')` +
      // `.filter(Boolean)` is the same idiom used by every other parser in
      // this file.
      const args = jjArgv('log', '-r', target, '-T', 'commit_id ++ "\\n"', '--no-graph');
      const r = vcsExec(cwd, 'jj', args);
      if (r.exitCode !== 0) return 0;
      return r.stdout.split('\n').filter(Boolean).length;
    },

    rootCommits: ({ rev }: { rev?: RevisionExpr }): string[] => {
      const target = rev ? toJjRev(rev) : '@';
      const args = jjArgv(
        'log',
        '-r',
        `root() & ::${target}`,
        '-T',
        'commit_id ++ "\\n"',
        '--no-graph',
      );
      const r = vcsExec(cwd, 'jj', args);
      if (r.exitCode !== 0) return [];
      return r.stdout
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    },

    exists: (rev: RevisionExpr): boolean => {
      const args = jjArgv(
        'log',
        '-r',
        toJjRev(rev),
        '-T',
        '"x"',
        '--no-graph',
        '-n',
        '1',
      );
      const r = vcsExec(cwd, 'jj', args);
      return r.exitCode === 0 && r.stdout.trim().length > 0;
    },

    isIgnored: (_path: string): boolean => {
      // RESEARCH §`refs.isIgnored`: the single production caller is
      // `get-shit-done/bin/lib/core.cjs` (ADR-0004) which constructs the
      // adapter via `createVcsAdapter(cwd, { kind: 'git' })` — statically
      // git-only. Audit recorded in 03-03-AUDIT.md. jj-side semantics
      // revisit in Phase 4 if a real caller surfaces.
      throw new VcsNotImplementedError(
        'refs.isIgnored: deferred — only git-side production caller (core.cjs) pins kind:git; jj-side semantics revisit in Phase 4 (see 03-03-AUDIT.md)',
      );
    },

    remotes: (): string[] => {
      const args = jjArgv('git', 'remote', 'list', '-T', 'name ++ "\\n"');
      const r = vcsExec(cwd, 'jj', args);
      if (r.exitCode !== 0) return [];
      return r.stdout
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    },
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

  // Mark imports used (silence TS unused warnings — these become real in
  // verb-group plans 03-04..03-05). `addPrefix`, `stripPrefix`, `toJjRev`,
  // `jjArgv`, and `vcsExec` are now actively used by the refs.* + bookmarks
  // implementations landed in plan 03-03. The two remaining void shims cover
  // parsers consumed by plans 03-05 (log) and 03-06 (workspace).
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
