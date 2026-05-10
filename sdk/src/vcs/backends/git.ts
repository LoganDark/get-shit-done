/**
 * Git backend implementation of the VcsAdapter contract.
 *
 * GIT-01: every method behaviorally equivalent to the existing execSync('git …') call sites in
 *         bin/lib/*.cjs (commands.cjs:300-415 cmdCommit, init.cjs:1519/1538/1641, etc.).
 * GIT-02: byte-identical { exitCode, stdout, stderr } to pre-migration shape via vcsExec.
 * GIT-03: vcs.gitOnly.createAnnotatedTag and gitOnly.version are reachable on this branch only.
 *
 * RESEARCH Pitfall 5: vcs.workspace.list delegates to worktree-safety.cjs::readWorktreeList,
 *                     does NOT duplicate the porcelain parser. ADR-0004 owns the policy seam.
 * RESEARCH Pitfall 4: ExecResult is the 5-field shape; adapter exposes 3-field projections only
 *                     where the typed result calls for them (commit, push, fetch, hooks).
 * RESEARCH Open Q1:   findConflicts({scope:'all'}) returns [] on git — Phase 3 jj backend
 *                     implements the real `conflict()` revset semantics.
 *
 * D-08:  vcs.commit auto-advances the active branch — native git behavior of `git commit` on
 *        a checked-out branch already does this; adapter is a thin wrapper, no extra logic.
 * D-14:  __vcsTestOnly snapshot/restore implements RESEARCH Pattern 3 (strategy 3).
 */

import { resolve as resolvePath } from 'node:path';
import { execGit } from '../exec.js';
import type { ExecResult } from '../exec.js';
import { fireHook } from '../hook-bridge.js';
import { expr } from '../expr.js';
import { toGitRev } from '../parse/git-rev.js';
import { readWorktreeList } from '../parse/worktree-list.js';
import { __vcsTestOnly } from '../types.js';
import type {
  GitVcsAdapter,
  CommitInput,
  CommitResult,
  LogOpts,
  LogEntry,
  StatusOpts,
  StatusResult,
  StatusEntry,
  DiffOpts,
  DiffResult,
  Bookmark,
  WorkspaceAdd,
  WorkspaceInfo,
  HookStage,
  HookContext,
  ConflictResult,
  PushOpts,
  FetchOpts,
  RevisionExpr,
  SnapshotHandle,
  VcsTestOnly,
} from '../types.js';

// CR-04: previously this module reached out to
// `../../../../get-shit-done/bin/lib/worktree-safety.cjs` via `createRequire`.
// That path resolves correctly for in-repo execution but fails for any
// downstream consumer who installed `@gsd-build/sdk` from npm — the CLI's
// bin/lib/ tree is not bundled into the SDK package's `files` list. The
// porcelain parser the adapter needs now lives in `parse/worktree-list.ts`
// inside the SDK, removing the cross-package seam entirely. ADR-0004 still
// names worktree-safety.cjs as the policy owner for CLI-side decisions
// (prune, health, inventory); only the read-only view was duplicated.

// ─── Parse helpers (CR-03) ──────────────────────────────────────────────────
//
// `git diff --check` emits lines shaped like `path:line: <marker description>`.
// On Windows, `path` can contain a drive-letter colon (`C:\foo\bar.txt:42: …`),
// and POSIX filesystems may also contain literal `:` in paths. Splitting at the
// FIRST colon truncates Windows paths to the drive letter and collapses POSIX
// paths to their prefix. Match the LAST `:<digits>:` pattern instead.
//
// Exported for unit testing — the real call site is local to findConflicts.
export function parseDiffCheckPath(line: string): string | null {
  const m = line.match(/^(.*):\d+:\s/);
  return m && m[1] ? m[1] : null;
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function createGitAdapter(cwd: string): GitVcsAdapter {
  // ─── commit ──────────────────────────────────────────────────────────────
  const commit = (input: CommitInput): CommitResult => {
    // WR-01: explicit `files: []` is ambiguous — the previous behaviour fell
    // through to `git commit -am` (commit ALL tracked modifications) which
    // is a data-correctness footgun for any caller that meant "this list of
    // paths". Reject with a structured error so callers must opt in to one
    // semantic or the other (`undefined` → `-am`, ≥1 path → `git add` then
    // `git commit -m`).
    if (input.files !== undefined && input.files.length === 0) {
      throw new Error(
        'commit({files:[]}) is ambiguous; pass files: undefined for `git commit -am`, ' +
          'or pass at least one path to commit a specific path set.',
      );
    }
    if (input.files && input.files.length > 0) {
      const addRes = execGit(cwd, ['add', ...input.files]);
      if (addRes.exitCode !== 0) {
        return {
          exitCode: addRes.exitCode,
          stdout: addRes.stdout,
          stderr: addRes.stderr,
          hash: null,
        };
      }
    }
    // Plan 02-08 gap-fill: amend takes precedence and uses `--amend --no-edit`
    // (HEAD's message is preserved; input.message is ignored). When not amending
    // and no `files` were staged, fall through to `-am` for "commit all tracked
    // modifications" UNLESS a pathspec is set — pathspec callers (e.g. the
    // commit handler) staged paths explicitly upstream and want only those
    // staged paths committed, NOT a `-am` sweep over the whole worktree.
    let args: string[];
    if (input.amend) {
      args = ['commit', '--amend', '--no-edit'];
    } else if (input.files && input.files.length > 0) {
      args = ['commit', '-m', input.message];
    } else if (input.pathspec && input.pathspec.length > 0) {
      // Already-staged-paths path: commit ONLY what is currently staged within
      // the pathspec, without `-am` (which would auto-stage tracked mods).
      args = ['commit', '-m', input.message];
    } else {
      args = ['commit', '-am', input.message];
    }
    if (input.allowEmpty) args.push('--allow-empty');
    if (input.noVerify) args.push('--no-verify');
    // Plan 02-08 gap-fill: pathspec narrows the commit's scope without staging.
    // Used by sdk/src/query/commit.ts to guarantee the commit captures only the
    // paths the handler staged, even when the caller's index had unrelated
    // entries pre-staged (#3061).
    if (input.pathspec && input.pathspec.length > 0) {
      args.push('--', ...input.pathspec);
    }
    const commitRes = execGit(cwd, args);
    if (commitRes.exitCode !== 0) {
      return {
        exitCode: commitRes.exitCode,
        stdout: commitRes.stdout,
        stderr: commitRes.stderr,
        hash: null,
      };
    }
    const hashRes = execGit(cwd, ['rev-parse', 'HEAD']);
    return {
      exitCode: commitRes.exitCode,
      stdout: commitRes.stdout,
      stderr: commitRes.stderr,
      hash: hashRes.exitCode === 0 ? hashRes.stdout : null,
    };
  };

  // ─── log ─────────────────────────────────────────────────────────────────
  // %x09 = TAB, field separator for the structured fields. Subject is on the
  // first record line; body follows on subsequent lines (may be empty). With
  // `-z`, each commit record is NUL-terminated, so body's embedded newlines
  // do not collide with the entry separator (Plan 02-06 Task 2 contract
  // extension: `body` is now populated whenever the commit has body text).
  const LOG_FORMAT = '--format=%H%x09%P%x09%an%x09%aI%x09%s%n%b';
  const log = (opts: LogOpts = {}): LogEntry[] => {
    const args = ['log', '-z', LOG_FORMAT];
    if (opts.maxCount) args.push(`-n${opts.maxCount}`);
    // Plan 02-03 Task 2 gap-fill: --all surfaces commits reachable from any ref,
    // not just the current HEAD. Mirrors verify.cjs:1224 / verify.ts:628 usage.
    if (opts.allRefs) args.push('--all');
    if (opts.rev) args.push(toGitRev(opts.rev));
    if (opts.paths && opts.paths.length > 0) args.push('--', ...opts.paths);
    const r = execGit(cwd, args);
    if (r.exitCode !== 0) return [];
    // `-z` uses NUL between records. r.stdout is trimmed by execGit, so the
    // trailing terminator is gone — split safely on `\x00` and filter empty.
    return r.stdout
      .split('\x00')
      .filter(Boolean)
      .map((record): LogEntry => {
        // record = "<hash>\t<parents>\t<author>\t<date>\t<subject>\n<body>"
        // The first newline divides subject-line from body. Body may be empty.
        const nlIdx = record.indexOf('\n');
        const head = nlIdx === -1 ? record : record.slice(0, nlIdx);
        const body = nlIdx === -1 ? '' : record.slice(nlIdx + 1);
        const parts = head.split('\t');
        const [hash, parents, author, date, ...subjectParts] = parts;
        const entry: LogEntry = {
          hash: hash ?? '',
          parents: parents ? parents.split(' ').filter(Boolean) : [],
          author: author ?? '',
          date: date ?? '',
          subject: subjectParts.join('\t'),
        };
        // Populate body only when there is body text (preserves existing
        // `body?: string` optional shape — no opt-in flag needed).
        if (body.length > 0) entry.body = body;
        return entry;
      });
  };

  // ─── status ──────────────────────────────────────────────────────────────
  // CR-02: porcelain v1 (no `-z`) C-style-quotes paths containing spaces, tabs,
  // control bytes, or non-ASCII (controlled by core.quotePath). Slicing line[3..]
  // verbatim mangles those paths and also breaks rename entries (` -> ` syntax).
  // Use `-z` for the structured-entry path so paths arrive verbatim, NUL-separated.
  // The 5-field `raw` field still preserves the user-visible porcelain text from a
  // separate (newline-mode) call so byte-identity baselines are unaffected.
  const status = (opts: StatusOpts = {}): StatusResult => {
    if (opts.porcelain === false) {
      const r = execGit(cwd, ['status']);
      return { entries: [], raw: r.stdout };
    }
    // Parse path-safe entries from `-z` output; preserve byte-identity `raw` from
    // the newline-mode `--porcelain` call (matches GIT-02 baselines).
    const rawRes = execGit(cwd, ['status', '--porcelain']);
    const zRes = execGit(cwd, ['-c', 'core.quotePath=false', 'status', '--porcelain', '-z']);
    const entries: StatusEntry[] = [];
    if (zRes.exitCode === 0 && zRes.stdout.length > 0) {
      // `-z` records: XY <space> path NUL [origPath NUL when XY indicates rename/copy]
      // Note vcsExec trims trailing whitespace; NUL bytes survive trimming.
      const tokens = zRes.stdout.split('\0');
      // The trailing element after the final NUL is an empty string we ignore.
      for (let i = 0; i < tokens.length; i += 1) {
        const tok = tokens[i];
        if (!tok) continue;
        const index = tok[0] ?? ' ';
        const worktree = tok[1] ?? ' ';
        const path = tok.slice(3);
        entries.push({ path, index, worktree });
        // Rename/copy entries are followed by a second token holding origPath.
        // Consume it so it is not interpreted as a fresh entry.
        if (index === 'R' || index === 'C' || worktree === 'R' || worktree === 'C') {
          i += 1;
        }
      }
    }
    return { entries, raw: rawRes.stdout };
  };

  // ─── diff ────────────────────────────────────────────────────────────────
  const diff = (opts: DiffOpts = {}): DiffResult => {
    const args = ['diff'];
    if (opts.staged) args.push('--cached');
    if (opts.nameOnly) args.push('--name-only');
    // Plan 02-03 Task 2 gap-fill: --name-status emits one line per changed
    // path prefixed by a single status letter (A/M/D/R/C/T/U/X/B). Mirrors
    // verify.cjs:1309 usage. Mutually exclusive with --name-only at the git
    // CLI level; if both are set, --name-status wins (callers should pick one).
    if (opts.nameStatus) args.push('--name-status');
    if (opts.rev) args.push(toGitRev(opts.rev));
    if (opts.paths && opts.paths.length > 0) args.push('--', ...opts.paths);
    const r = execGit(cwd, args);
    const result: DiffResult = {
      raw: r.stdout,
      nameOnly: opts.nameOnly ? r.stdout.split('\n').filter(Boolean) : [],
    };
    if (opts.nameStatus) {
      // Format: "<STATUS>\t<path>" per line; rename/copy entries use
      // "<STATUS><score>\t<oldpath>\t<newpath>" — for rename/copy we report
      // the new path (post-state), matching what consumers care about.
      const entries: import('../types.js').DiffNameStatusEntry[] = [];
      for (const line of r.stdout.split('\n')) {
        if (!line) continue;
        const cols = line.split('\t');
        if (cols.length < 2) continue;
        const statusRaw = cols[0];
        const letter = statusRaw[0] as import('../types.js').DiffNameStatusEntry['status'];
        // Rename/copy: status is "R<score>" or "C<score>", new path is cols[2].
        const path = (letter === 'R' || letter === 'C') && cols.length >= 3 ? cols[2] : cols[1];
        entries.push({ path, status: letter });
      }
      result.nameStatus = entries;
    }
    return result;
  };

  // ─── refs.bookmarks ──────────────────────────────────────────────────────
  const bookmarks = Object.freeze({
    list: (): Bookmark[] => {
      const r = execGit(cwd, ['branch', '--format=%(refname:short)']);
      if (r.exitCode !== 0) return [];
      // RESEARCH Open Q2: rev not resolved in Phase 1 — empty string for now.
      // Future caller demand promotes to per-item `git rev-parse <name>`.
      return r.stdout
        .split('\n')
        .filter(Boolean)
        .map((name) => ({ name: name.trim(), rev: '' }));
    },
    create: (name: string, rev: RevisionExpr): void => {
      const r = execGit(cwd, ['branch', name, toGitRev(rev)]);
      if (r.exitCode !== 0) {
        throw new Error(`bookmarks.create failed: ${r.stderr || r.stdout}`);
      }
    },
    move: (name: string, rev: RevisionExpr): void => {
      const r = execGit(cwd, ['branch', '-f', name, toGitRev(rev)]);
      if (r.exitCode !== 0) {
        throw new Error(`bookmarks.move failed: ${r.stderr || r.stdout}`);
      }
    },
    delete: (name: string): void => {
      const r = execGit(cwd, ['branch', '-D', name]);
      if (r.exitCode !== 0) {
        throw new Error(`bookmarks.delete failed: ${r.stderr || r.stdout}`);
      }
    },
    exists: (name: string): boolean => {
      const r = execGit(cwd, ['rev-parse', '--verify', '--quiet', name]);
      return r.exitCode === 0;
    },
    // Plan 02-03 Task 1 gap-fill: switch / checkout (with optional create).
    switch: (name: string, opts: { create?: boolean } = {}): void => {
      const args = opts.create ? ['checkout', '-b', name] : ['checkout', name];
      const r = execGit(cwd, args);
      if (r.exitCode !== 0) {
        throw new Error(`bookmarks.switch failed: ${r.stderr || r.stdout}`);
      }
    },
  });

  // Plan 02-03 Task 1 gap-fill (RESEARCH §Forward-Complete Gaps Summary):
  // 7 read-only verbs on vcs.refs.* — each mirrors the existing factory shape
  // (call execGit, parse the standard 5-field result, return typed scalar).
  const currentBranch = (): string | null => {
    const r = execGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
    if (r.exitCode !== 0) return null;
    const name = r.stdout.trim();
    if (!name || name === 'HEAD') return null; // detached
    return name;
  };

  const resolveShort = (rev: RevisionExpr): string => {
    const r = execGit(cwd, ['rev-parse', '--short', toGitRev(rev)]);
    if (r.exitCode !== 0) {
      throw new Error(`refs.resolveShort failed: ${r.stderr || r.stdout}`);
    }
    return r.stdout.trim();
  };

  const countCommits = (opts: { rev?: RevisionExpr }): number => {
    const target = opts.rev ? toGitRev(opts.rev) : 'HEAD';
    const r = execGit(cwd, ['rev-list', '--count', target]);
    if (r.exitCode !== 0) return 0;
    const n = parseInt(r.stdout.trim(), 10);
    return Number.isNaN(n) ? 0 : n;
  };

  const rootCommits = (opts: { rev?: RevisionExpr }): string[] => {
    const target = opts.rev ? toGitRev(opts.rev) : 'HEAD';
    const r = execGit(cwd, ['rev-list', '--max-parents=0', target]);
    if (r.exitCode !== 0) return [];
    return r.stdout.split('\n').filter(Boolean).map((s) => s.trim());
  };

  const refExists = (rev: RevisionExpr): boolean => {
    // `cat-file -t <rev>` exits 0 with the type when the object exists,
    // non-zero otherwise. Both outcomes are valid completions; we only need
    // the exit code as a yes/no probe.
    const r = execGit(cwd, ['cat-file', '-t', toGitRev(rev)]);
    return r.exitCode === 0;
  };

  const isIgnored = (p: string): boolean => {
    // `--no-index` lets us probe paths that aren't in the index. Exit 0 = ignored,
    // exit 1 = not ignored, exit ≥128 = error. Treat the 0/1 outcomes only.
    const r = execGit(cwd, ['check-ignore', '-q', '--no-index', '--', p]);
    return r.exitCode === 0;
  };

  const remotes = (): string[] => {
    const r = execGit(cwd, ['remote']);
    if (r.exitCode !== 0) return [];
    return r.stdout.split('\n').filter(Boolean).map((s) => s.trim());
  };

  const refs = Object.freeze({
    head: expr.head(),
    parent: expr.parent(),
    bookmarks,
    currentBranch,
    resolveShort,
    countCommits,
    rootCommits,
    exists: refExists,
    isIgnored,
    remotes,
  });

  // Plan 02-03 Task 1 gap-fill: top-level stage / unstage verbs.
  const stage = (files: string[]): ExecResult => {
    return execGit(cwd, ['add', '--', ...files]);
  };
  const unstage = (files: string[]): ExecResult => {
    return execGit(cwd, ['rm', '--cached', '--ignore-unmatch', '--', ...files]);
  };

  // ─── workspace ───────────────────────────────────────────────────────────
  const workspace = Object.freeze({
    add: (input: WorkspaceAdd): WorkspaceInfo => {
      const baseRevArg = input.baseRef ? [toGitRev(input.baseRef)] : [];
      const r = execGit(cwd, ['worktree', 'add', input.path, ...baseRevArg]);
      if (r.exitCode !== 0) {
        throw new Error(`workspace.add failed: ${r.stderr || r.stdout}`);
      }
      const head = execGit(input.path, ['rev-parse', 'HEAD']);
      return {
        path: input.path,
        rev: head.exitCode === 0 ? head.stdout : '',
        locked: false,
      };
    },
    forget: (path: string): void => {
      const r = execGit(cwd, ['worktree', 'remove', path]);
      if (r.exitCode !== 0) {
        throw new Error(`workspace.forget failed: ${r.stderr || r.stdout}`);
      }
    },
    list: (): WorkspaceInfo[] => {
      // CR-04 + WR-03: read+parse `git worktree list --porcelain` via the
      // SDK-local helper, no cross-package require. WR-03: the parser now
      // captures `HEAD <sha>` and `locked` lines, so `rev` and `locked`
      // are populated non-trivially instead of always-empty/always-false.
      const result = readWorktreeList(cwd);
      if (!result.ok) return [];
      return result.entries.map(
        (e): WorkspaceInfo => ({ path: e.path, rev: e.head, locked: e.locked }),
      );
    },
    // Plan 02-03 Task 2 — Blocker 4: workspace.context returns the same path
    // strings worktree-safety.cjs:122-123 reads via raw `git rev-parse`. The
    // gitDir/gitCommonDir distinction is what lets the consumer detect linked
    // worktrees (gitDir !== gitCommonDir).
    context: () => {
      const top = execGit(cwd, ['rev-parse', '--show-toplevel']);
      const gd = execGit(cwd, ['rev-parse', '--git-dir']);
      const cd = execGit(cwd, ['rev-parse', '--git-common-dir']);
      // For a non-repo cwd these calls fail; surface a structured error so
      // callers don't get a silent empty-string answer that masquerades as
      // valid path data.
      if (top.exitCode !== 0 || gd.exitCode !== 0 || cd.exitCode !== 0) {
        throw new Error(
          `workspace.context: not a git repo at ${cwd}: ${top.stderr || gd.stderr || cd.stderr}`,
        );
      }
      const effectiveRoot = resolvePath(cwd, top.stdout.trim());
      const gitDir = resolvePath(cwd, gd.stdout.trim());
      const gitCommonDir = resolvePath(cwd, cd.stdout.trim());
      const isLinked = gitDir !== gitCommonDir;
      return {
        effectiveRoot,
        mode: (isLinked ? 'linked' : 'main') as 'main' | 'linked',
        isLinked,
        gitDir,
        gitCommonDir,
      };
    },
    // Plan 02-03 Task 2 gap-fill: `git worktree prune` removes stale
    // .git/worktrees/<name> entries whose worktree directories no longer exist.
    prune: (): ExecResult => execGit(cwd, ['worktree', 'prune']),
  });

  // ─── hooks ───────────────────────────────────────────────────────────────
  const hooks = Object.freeze({
    fire: (stage: HookStage, ctx?: HookContext): ExecResult => fireHook(cwd, stage, ctx),
  });

  // ─── findConflicts ───────────────────────────────────────────────────────
  const findConflicts = (opts: { scope: 'all' | 'working-copy' }): ConflictResult[] => {
    if (opts.scope === 'all') {
      // RESEARCH Open Q1: git has no first-class equivalent of `jj log -r 'conflict()'`.
      // Phase 1 returns []; Phase 3 jj backend implements the real semantics.
      // The verify gate (CONFLICT-03) consumes 'all' scope and will exercise jj-side
      // logic in Phase 3.
      return [];
    }
    // working-copy scope: `git diff --check` reports leftover conflict markers.
    const r = execGit(cwd, ['diff', '--check']);
    if (r.exitCode === 0) return [];
    const paths = new Set<string>();
    for (const line of r.stdout.split('\n')) {
      const p = parseDiffCheckPath(line);
      if (p) paths.add(p);
    }
    return paths.size > 0
      ? [{ rev: 'WORKING-COPY', paths: [...paths], scope: 'working-copy' }]
      : [];
  };

  // ─── push / fetch ────────────────────────────────────────────────────────
  const push = (opts: PushOpts = {}): ExecResult => {
    const args = ['push'];
    if (opts.force) args.push('--force');
    if (opts.remote) args.push(opts.remote);
    if (opts.ref) args.push(toGitRev(opts.ref));
    return execGit(cwd, args);
  };

  const fetch = (opts: FetchOpts = {}): ExecResult => {
    const args = ['fetch'];
    if (opts.remote) args.push(opts.remote);
    if (opts.ref) args.push(opts.ref);
    return execGit(cwd, args);
  };

  // ─── gitOnly ─────────────────────────────────────────────────────────────
  const gitOnly = Object.freeze({
    createAnnotatedTag: (name: string, message: string, rev: RevisionExpr): void => {
      const r = execGit(cwd, ['tag', '-a', name, '-m', message, toGitRev(rev)]);
      if (r.exitCode !== 0) {
        throw new Error(`gitOnly.createAnnotatedTag failed: ${r.stderr || r.stdout}`);
      }
    },
    version: (): string => {
      // WR-02: throw on non-zero exit so callers get a loud signal when git is
      // missing from PATH, instead of an empty-string return that every caller
      // would have to re-validate. Mirrors the createAnnotatedTag exit-check.
      const r = execGit(cwd, ['--version']);
      if (r.exitCode !== 0) {
        throw new Error(
          `gitOnly.version failed: ${r.stderr || r.error?.message || 'no git on PATH'}`,
        );
      }
      return r.stdout;
    },
    // Plan 02-03 Task 2 gap-fill: bootstrap-path verbs (init / configGet /
    // configSet). These exist on the gitOnly branch because the equivalent
    // jj operations are structurally different (jj git init, jj config get/set
    // with different namespace semantics) — Phase 3 will add jj-symmetric
    // shapes when needed.
    init: (): void => {
      const r = execGit(cwd, ['init']);
      if (r.exitCode !== 0) {
        throw new Error(`gitOnly.init failed: ${r.stderr || r.stdout}`);
      }
    },
    configGet: (key: string): string | null => {
      // `git config --get <key>` exits 0 with the value, 1 when key is unset,
      // ≥2 on error. Treat exit 1 as "unset" → null; treat ≥2 as failure.
      const r = execGit(cwd, ['config', '--get', key]);
      if (r.exitCode === 0) return r.stdout.trim();
      if (r.exitCode === 1) return null;
      throw new Error(`gitOnly.configGet failed: ${r.stderr || r.stdout}`);
    },
    configSet: (key: string, value: string): void => {
      const r = execGit(cwd, ['config', key, value]);
      if (r.exitCode !== 0) {
        throw new Error(`gitOnly.configSet failed: ${r.stderr || r.stdout}`);
      }
    },
  });

  // ─── __vcsTestOnly snapshot/restore (D-14, RESEARCH Pattern 3 / strategy 3) ─
  const testOnly: VcsTestOnly = Object.freeze({
    snapshot: (): SnapshotHandle => {
      const head = execGit(cwd, ['rev-parse', 'HEAD']);
      if (head.exitCode !== 0) {
        throw new Error(`__vcsTestOnly.snapshot: rev-parse HEAD failed: ${head.stderr}`);
      }
      execGit(cwd, ['update-ref', 'refs/gsd/test-snapshot', head.stdout]);
      return { id: head.stdout, kind: 'git' };
    },
    restore: (handle: SnapshotHandle): void => {
      const reset = execGit(cwd, ['reset', '--hard', handle.id]);
      if (reset.exitCode !== 0) {
        throw new Error(`__vcsTestOnly.restore: reset failed: ${reset.stderr}`);
      }
      execGit(cwd, ['clean', '-fdx']);
    },
  });

  const adapter = Object.freeze({
    kind: 'git' as const,
    cwd,
    commit,
    log,
    status,
    diff,
    refs,
    workspace,
    hooks,
    findConflicts,
    push,
    fetch,
    stage,
    unstage,
    gitOnly,
    [__vcsTestOnly]: testOnly,
  }) as unknown as GitVcsAdapter;

  return adapter;
}
