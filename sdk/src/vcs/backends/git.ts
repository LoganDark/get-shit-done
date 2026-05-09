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

import { createRequire } from 'node:module';

import { execGit } from '../exec.js';
import type { ExecResult } from '../exec.js';
import { fireHook } from '../hook-bridge.js';
import { expr } from '../expr.js';
import { toGitRev } from '../parse/git-rev.js';
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

// ─── CJS interop: load worktree-safety.cjs eagerly via createRequire ─────────
//
// W-2 fix (RESEARCH Pitfall 5): worktree-safety.cjs is CommonJS in
// get-shit-done/bin/lib. The dist-cjs/ build emits CommonJS, so __filename
// works at runtime; the ESM dist (dist/) uses import.meta.url. Resolve once at
// module load and stash any error so workspace.list() can surface a clear
// recovery message instead of a confusing "not available" fallback.

// CJS output (dist-cjs/) has __filename injected by Node as a local; ESM (dist/, vitest)
// has import.meta.url. Source is dual-compiled. tsconfig.cjs.json sets module=commonjs,
// which forbids the literal `import.meta` syntax (TS1343). To stay valid under both
// configs without two source files, use `eval` to defer parsing of the ESM-only form
// to runtime — and only enter that branch when the CJS-only `__filename` is absent.
// In CJS, eval'd `import.meta.url` would itself throw a SyntaxError, but we never reach
// it because `__filename` is defined.
function getCallerSpecifier(): string {
  // CJS modules: Node injects `__filename` into the module wrapper. eval sees
  // lexical scope, so it picks up the wrapper's local. `node -e '…'` evaluation
  // sets __filename to the literal '[eval]', which createRequire rejects — so
  // we filter for absolute-path-looking values.
  try {
    // eslint-disable-next-line no-eval
    const v = eval('typeof __filename !== "undefined" ? __filename : null') as string | null;
    if (v && (v.startsWith('/') || /^[A-Za-z]:[\\/]/.test(v))) return v;
  } catch {
    // ignore — fall through to ESM
  }
  // ESM: import.meta.url. Defer parsing to runtime via eval. In a CJS host (where
  // __filename was missing or non-path, e.g. `node -e '…'`), eval'ing `import.meta`
  // throws SyntaxError; catch and fall back to a process-cwd anchor so createRequire
  // still gets an absolute path. This is best-effort: relative require() targets that
  // assume a specific module location may resolve oddly under `node -e` evaluation,
  // but production CJS loads (any actual file) use the __filename branch above.
  try {
    // eslint-disable-next-line no-eval
    return eval('import.meta.url') as string;
  } catch {
    return process.cwd() + '/';
  }
}
const requireCjs = createRequire(getCallerSpecifier());

interface WorktreeSafetyModule {
  readWorktreeList: (
    cwd: string,
    deps?: { execGit?: typeof execGit },
  ) => {
    ok: boolean;
    reason?: string;
    porcelain?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    entries: Array<Record<string, any>>;
  };
}

let worktreeSafety: WorktreeSafetyModule | null = null;
let worktreeSafetyLoadError: Error | null = null;
try {
  // dist-cjs/vcs/backends/git.js is 4 levels deep from repo root:
  // sdk/dist-cjs/vcs/backends/git.js → ../../../../get-shit-done/bin/lib/worktree-safety.cjs
  // For the ESM dist (sdk/dist/vcs/backends/git.js) the relative path is the same.
  // For tests running from sdk/src/vcs/backends/git.ts (vitest), the same relative path
  // also resolves correctly because the source layout mirrors dist-cjs.
  worktreeSafety = requireCjs(
    '../../../../get-shit-done/bin/lib/worktree-safety.cjs',
  ) as WorktreeSafetyModule;
} catch (err) {
  worktreeSafetyLoadError = err instanceof Error ? err : new Error(String(err));
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function createGitAdapter(cwd: string): GitVcsAdapter {
  // ─── commit ──────────────────────────────────────────────────────────────
  const commit = (input: CommitInput): CommitResult => {
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
    const args: string[] =
      input.files && input.files.length > 0
        ? ['commit', '-m', input.message]
        : ['commit', '-am', input.message];
    if (input.allowEmpty) args.push('--allow-empty');
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
  // %x09 = TAB, used as field separator (subject can contain anything else).
  const LOG_FORMAT = '--format=%H%x09%P%x09%an%x09%aI%x09%s';
  const log = (opts: LogOpts = {}): LogEntry[] => {
    const args = ['log', LOG_FORMAT];
    if (opts.maxCount) args.push(`-n${opts.maxCount}`);
    if (opts.rev) args.push(toGitRev(opts.rev));
    if (opts.paths && opts.paths.length > 0) args.push('--', ...opts.paths);
    const r = execGit(cwd, args);
    if (r.exitCode !== 0) return [];
    return r.stdout
      .split('\n')
      .filter(Boolean)
      .map((line): LogEntry => {
        const parts = line.split('\t');
        const [hash, parents, author, date, ...subjectParts] = parts;
        return {
          hash: hash ?? '',
          parents: parents ? parents.split(' ').filter(Boolean) : [],
          author: author ?? '',
          date: date ?? '',
          subject: subjectParts.join('\t'),
        };
      });
  };

  // ─── status ──────────────────────────────────────────────────────────────
  const status = (opts: StatusOpts = {}): StatusResult => {
    const args = opts.porcelain === false ? ['status'] : ['status', '--porcelain'];
    const r = execGit(cwd, args);
    const entries: StatusEntry[] = [];
    if (opts.porcelain !== false) {
      for (const line of r.stdout.split('\n').filter(Boolean)) {
        // Porcelain v1: XY <space> path
        const index = line[0] ?? ' ';
        const worktree = line[1] ?? ' ';
        const path = line.slice(3);
        entries.push({ path, index, worktree });
      }
    }
    return { entries, raw: r.stdout };
  };

  // ─── diff ────────────────────────────────────────────────────────────────
  const diff = (opts: DiffOpts = {}): DiffResult => {
    const args = ['diff'];
    if (opts.staged) args.push('--cached');
    if (opts.nameOnly) args.push('--name-only');
    if (opts.rev) args.push(toGitRev(opts.rev));
    if (opts.paths && opts.paths.length > 0) args.push('--', ...opts.paths);
    const r = execGit(cwd, args);
    return {
      raw: r.stdout,
      nameOnly: opts.nameOnly ? r.stdout.split('\n').filter(Boolean) : [],
    };
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
  });

  const refs = Object.freeze({
    head: expr.head(),
    parent: expr.parent(),
    bookmarks,
  });

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
      // Pitfall 5: delegate to worktree-safety.cjs (ADR-0004 policy seam) — do NOT duplicate.
      // W-2 fix: surface the actual load error (with stack) instead of a generic "not available".
      if (!worktreeSafety || typeof worktreeSafety.readWorktreeList !== 'function') {
        const detail = worktreeSafetyLoadError
          ? `: ${worktreeSafetyLoadError.message}`
          : '';
        throw new Error(
          `worktree-safety.cjs unreachable in published mode — workspace.list() unavailable${detail}. ` +
            `If you see this in a downstream consumer of @gsd-build/get-shit-done, the package layout ` +
            `does not bundle bin/lib/worktree-safety.cjs alongside dist-cjs/. In-repo execution requires ` +
            `the file at get-shit-done/bin/lib/worktree-safety.cjs (4 levels up from sdk/dist-cjs/vcs/backends/git.js).`,
        );
      }
      const result = worktreeSafety.readWorktreeList(cwd, { execGit });
      if (!result.ok) return [];
      return result.entries.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (e: any): WorkspaceInfo => ({
          path: e.path ?? e.worktree ?? '',
          rev: e.head ?? e.HEAD ?? e.rev ?? '',
          locked: !!e.locked,
        }),
      );
    },
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
    // Output: "path:line: leftover conflict marker"
    const paths = new Set<string>();
    for (const line of r.stdout.split('\n')) {
      const colon = line.indexOf(':');
      if (colon > 0) paths.add(line.slice(0, colon));
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
      const r = execGit(cwd, ['--version']);
      return r.stdout;
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
    gitOnly,
    [__vcsTestOnly]: testOnly,
  }) as unknown as GitVcsAdapter;

  return adapter;
}
