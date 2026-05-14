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

import { spawnSync } from 'node:child_process';
import { resolve as resolvePath } from 'node:path';
import { execGit } from '../exec.js';
import type { ExecResult } from '../exec.js';
import { expr } from '../expr.js';
import { toGitRev } from '../parse/git-rev.js';
import { readWorktreeList } from '../parse/worktree-list.js';
import {
  __vcsTestOnly,
  VcsIncompleteSubagentsError,
} from '../types.js';
import { readIncomplete } from '../jj/incomplete-work.js';
import { validateRefname } from '../refs-validator.js';
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
  ReapResult,
  WorkspaceAdd,
  WorkspaceInfo,
  ConflictResult,
  PushOpts,
  FetchOpts,
  RevisionExpr,
  SnapshotHandle,
  VcsTestOnly,
} from '../types.js';
// Phase 2.1 D-07: hook-bridge import removed — the helper is now module-private
// to hook-bridge.ts; Phase 4 wires internal invocation from inside this
// backend's commit() / push() implementations. HookStage / HookContext type
// imports likewise removed (no remaining consumer in this module).

// CR-04: previously this module reached out to
// `../../../../get-shit-done/bin/lib/worktree-safety.cjs` via `createRequire`.
// That path resolves correctly for in-repo execution but fails for any
// downstream consumer who installed `@gsd-build/sdk` from npm — the CLI's
// bin/lib/ tree is not bundled into the SDK package's `files` list. The
// porcelain parser the adapter needs now lives in `parse/worktree-list.ts`
// inside the SDK, removing the cross-package seam entirely. ADR-0004 still
// names worktree-safety.cjs as the policy owner for CLI-side decisions
// (prune, health, inventory); only the read-only view was duplicated.

// ─── Parse helpers (CR-03 / WR-02) ──────────────────────────────────────────
//
// `git diff --check` emits lines shaped like `path:line: <marker description>`
// in pre-2.31 git, and `path:line:col: <marker description>` in git ≥ 2.31.
// On Windows, `path` can contain a drive-letter colon (`C:\foo\bar.txt:42: …`),
// and POSIX filesystems may also contain literal `:` in paths. Splitting at the
// FIRST colon truncates Windows paths to the drive letter; matching the LAST
// `:\d+:\s` with greedy `.*` works for the 2-coord form but breaks the 3-coord
// (column-included) form because the greedy match consumes `:col:` into the
// path. Use non-greedy `.+?` so the path stops at the FIRST `:line` slot, and
// allow an optional `(?::\d+)?` column number.
//
// Exported for unit testing — the real call site is local to findConflicts.
export function parseDiffCheckPath(line: string): string | null {
  // Format: <path>:<line>[:<col>]: <description>
  const m = line.match(/^(.+?):\d+(?::\d+)?:\s/);
  return m && m[1] ? m[1] : null;
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function createGitAdapter(cwd: string): GitVcsAdapter {
  // ─── commit ──────────────────────────────────────────────────────────────
  /**
   * Phase 3 D-01 / D-04: `input.bookmark` and `input.bookmarkRaw` are
   * IGNORED on the git backend. Native `git commit` on a checked-out
   * branch auto-advances the branch ref to the new commit, so the explicit
   * bookmark-advance contract that the jj backend implements is a no-op
   * here. Callers writing cross-backend code may pass either field
   * unconditionally; git ignores both.
   *
   * The fields are declared on the cross-backend `CommitInput` type so
   * structural typing accepts them without per-backend type-narrowing.
   */
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
    // Phase 4 plan 04 D-14: phase-merge gate (cross-backend). Read the crash
    // queue at `${phaseDir}/incomplete-work.md` and throw before commit when
    // the queue is non-empty. The queue file format is git/jj-agnostic
    // (markdown line-delimited); both backends honour the gate. Reader lives
    // under sdk/src/vcs/jj/ only because that's where the format was authored
    // alongside the jj-side reap producer (no jj invocation in the parser).
    if (input.phaseMergeFor) {
      const entries = readIncomplete(input.phaseMergeFor.phaseDir);
      if (entries.length > 0) {
        throw new VcsIncompleteSubagentsError({
          entries,
          phaseDir: input.phaseMergeFor.phaseDir,
          hint:
            'review entries in incomplete-work.md and delete them before re-running the phase merge',
        });
      }
    }
    if (input.files && input.files.length > 0) {
      // Phase 2.1 #3061: reset the index to HEAD (or empty when there is no
      // HEAD yet) before staging the requested paths. Pre-staged entries that
      // the caller did not list in `files` would otherwise leak into the
      // commit, because bare `git commit -m` records the entire index. The
      // earlier `git commit -- <paths>` narrowing this replaces had no jj
      // equivalent (D-02). Trade-off: pre-staged unrelated entries become
      // worktree-only changes after the commit instead of remaining staged —
      // matches jj's index-less semantics; documented in 2.1-04-SUMMARY.md.
      const headExists =
        execGit(cwd, ['rev-parse', '--verify', '--quiet', 'HEAD']).exitCode === 0;
      const resetRes = execGit(cwd, ['read-tree', headExists ? 'HEAD' : '--empty']);
      if (resetRes.exitCode !== 0) {
        return {
          exitCode: resetRes.exitCode,
          stdout: resetRes.stdout,
          stderr: resetRes.stderr,
          hash: null,
        };
      }
      // Phase 2.1 D-04: WC-state-capture — `git add -A -- <paths>` records
      // adds/mods/dels for the given paths from the working copy in one shot.
      // Mirrors the Phase 3 jj backend's `jj squash <paths> -B @ -k -m '<msg>'`.
      // CR-01 (Phase 2 review): `--` separator still required to neutralise
      // filenames that begin with `-` — the peer commit-scope-narrowing field
      // is gone, but the `-A` flag still mandates the same option-injection
      // guard.
      const addRes = execGit(cwd, ['add', '-A', '--', ...input.files]);
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
    // and `files` were given, commit the WC-state-captured paths WITHOUT `-a`
    // (else unrelated tracked modifications would also be swept in). When no
    // `files` are given, fall through to `-am` for "commit all tracked
    // modifications".
    let args: string[];
    if (input.amend) {
      args = ['commit', '--amend', '--no-edit'];
    } else if (input.files && input.files.length > 0) {
      args = ['commit', '-m', input.message];
    } else {
      args = ['commit', '-am', input.message];
    }
    if (input.allowEmpty) args.push('--allow-empty');
    if (input.noVerify) args.push('--no-verify');
    // Phase 2.1 D-02: the commit-scope-narrowing branch (formerly appending
    // `-- <paths>` to `git commit`) is removed. Callers that need a narrow
    // commit scope now pass `files` and rely on D-04 WC-state-capture
    // semantics; the `-A` add stages exactly the requested paths and nothing
    // more.
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
  //
  // Phase 2.1 #3061: execGit's stdout.trim() strips the leading space when the
  // first porcelain entry is worktree-only (` M file`, ` D file`), corrupting
  // both the first parsed entry's path AND the `.raw` byte-identity field. Use
  // an untrimmed spawnSync directly for the porcelain calls so the first
  // entry's XY prefix survives.
  const status = (opts: StatusOpts = {}): StatusResult => {
    if (opts.porcelain === false) {
      const r = execGit(cwd, ['status']);
      return { entries: [], raw: r.stdout };
    }
    // Strip trailing newline(s) only (TrimEnd) so byte-identity baselines for
    // entries without a leading-space first entry stay byte-equal, while the
    // first entry's leading-space (worktree-only modifications/deletions)
    // survives — execGit's full .trim() corrupts the latter (Phase 2.1 #3061).
    const statusTrimEnd = (gitArgs: string[]): { exitCode: number; stdout: string } => {
      const r = spawnSync('git', gitArgs, { cwd, stdio: 'pipe', encoding: 'utf-8' });
      return { exitCode: r.status ?? -1, stdout: (r.stdout ?? '').toString().replace(/\n+$/, '') };
    };
    // Parse path-safe entries from `-z` output; preserve byte-identity `raw` from
    // the newline-mode `--porcelain` call (matches GIT-02 baselines).
    const rawRes = statusTrimEnd(['status', '--porcelain']);
    const zRes = statusTrimEnd(['-c', 'core.quotePath=false', 'status', '--porcelain', '-z']);
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
        // Phase 2.1 D-16: `index` is dropped from the public StatusEntry; the
        // local `index` variable still gates the rename/copy heuristic below.
        entries.push({ path, worktree });
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
  /**
   * Phase 3 D-04: `opts.raw` is accepted on every mutating bookmark method
   * but IGNORED on the git backend. Git branches use unprefixed names
   * (upstream convention) — there is no `gsd/` prefix to escape. The jj
   * backend uses this flag to opt out of its internal `gsd/` prefix munging.
   */
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
    create: (name: string, rev: RevisionExpr, _opts?: { raw?: boolean }): void => {
      // D-24 cr-01 fold-in: validate the user-supplied bookmark name BEFORE
      // it lands at a `git branch` positional. The git backend has no gsd/
      // prefix munging (D-04 — opts.raw is accepted but ignored), so the
      // local `actualName` binding mirrors jj.ts naming and exposes a clean
      // grep target for the Task 2 acceptance criteria. Defense-in-depth
      // pair: `--` end-of-options separator below.
      const actualName = name;
      validateRefname(actualName);
      const r = execGit(cwd, ['branch', '--', actualName, toGitRev(rev)]);
      if (r.exitCode !== 0) {
        throw new Error(`bookmarks.create failed: ${r.stderr || r.stdout}`);
      }
    },
    move: (name: string, rev: RevisionExpr, _opts?: { raw?: boolean }): void => {
      // D-24 cr-01 fold-in: see bookmarks.create above for rationale.
      const actualName = name;
      validateRefname(actualName);
      const r = execGit(cwd, ['branch', '-f', '--', actualName, toGitRev(rev)]);
      if (r.exitCode !== 0) {
        throw new Error(`bookmarks.move failed: ${r.stderr || r.stdout}`);
      }
    },
    delete: (name: string, _opts?: { raw?: boolean }): void => {
      // D-24 cr-01 fold-in: see bookmarks.create above for rationale. The
      // `-D` flag is positional-flag-shaped; `--` separator after it pins
      // actualName at the name positional regardless of name shape.
      const actualName = name;
      validateRefname(actualName);
      const r = execGit(cwd, ['branch', '-D', '--', actualName]);
      if (r.exitCode !== 0) {
        throw new Error(`bookmarks.delete failed: ${r.stderr || r.stdout}`);
      }
    },
    exists: (name: string, _opts?: { raw?: boolean }): boolean => {
      // D-24 cr-01 fold-in: validator rejects '-D'-shape names upfront.
      // `git rev-parse --verify --quiet -- <name>` is NOT used here because
      // rev-parse interprets `--` as the revs/paths separator (would treat
      // <name> as a pathspec, breaking the exists check). The leading-dash
      // rejection in the validator is what keeps the bare positional safe.
      const actualName = name;
      validateRefname(actualName);
      const r = execGit(cwd, ['rev-parse', '--verify', '--quiet', actualName]);
      return r.exitCode === 0;
    },
    // Plan 02-03 Task 1 gap-fill: switch / checkout (with optional create).
    // Phase 3 D-04: `opts.raw` accepted and ignored (git has no prefix to escape).
    switch: (name: string, opts: { create?: boolean; raw?: boolean } = {}): void => {
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
  // Phase 2.1 D-15: renamed from the prior single-string accessor (returning
  // `string | null`) to currentBookmarks returning `string[]`. Empty = anonymous head
  // (jj) or detached HEAD (git). Git always reports a single bookmark when
  // attached; the array shape gives both backends a uniform empty-detached
  // signal and accommodates jj's 0..N bookmarks-pointing-at-the-same-rev case.
  const currentBookmarks = (): string[] => {
    const r = execGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
    if (r.exitCode !== 0) return [];
    const name = r.stdout.trim();
    if (!name || name === 'HEAD') return []; // detached
    return [name];
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
    currentBookmarks,
    resolveShort,
    countCommits,
    rootCommits,
    exists: refExists,
    isIgnored,
    remotes,
  });

  // Phase 2.1 D-03: top-level stage / unstage verbs DELETED. Callers refactor
  // onto commit({files}) with WC-state-capture semantics (D-02 + D-04).

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
    // Phase 2.1 D-18: workspace.context returns cross-backend fields only —
    // effectiveRoot, mode, isLinked. The git-specific gitDir / gitCommonDir
    // path strings moved to vcs.gitOnly.gitDir() / vcs.gitOnly.gitCommonDir()
    // (the local rev-parse results are still needed here to compute isLinked).
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
      const gitDirResolved = resolvePath(cwd, gd.stdout.trim());
      const gitCommonDirResolved = resolvePath(cwd, cd.stdout.trim());
      const isLinked = gitDirResolved !== gitCommonDirResolved;
      return {
        effectiveRoot,
        mode: (isLinked ? 'linked' : 'main') as 'main' | 'linked',
        isLinked,
      };
    },
    // Plan 02-03 Task 2 gap-fill: `git worktree prune` removes stale
    // .git/worktrees/<name> entries whose worktree directories no longer exist.
    prune: (): ExecResult => execGit(cwd, ['worktree', 'prune']),
    reap: (opts: { phaseNamePrefix: string; phaseDir: string }): ReapResult => {
      // Phase 4 plan 04: git mirror of jj reap. Enumerate worktrees,
      // filter by basename prefix (D-04 / #2774 inclusion-filter pattern),
      // `git worktree remove` each. No empty-tree probe needed because git
      // worktrees do NOT auto-snapshot — uncommitted state in a git worktree
      // stays in its WC and surfaces independently via the orchestrator's
      // status probe. `incomplete` is always empty on the git side; the
      // crash-queue concern is a jj-side concept driven by auto-snapshot.
      void opts.phaseDir; // unused on git side
      const entries = workspace.list();
      const abandoned: { name: string; changeId: string; path: string }[] = [];
      for (const entry of entries) {
        // git workspace.list() returns the on-disk path (not a workspace
        // name); inclusion filter matches on basename.
        const name = entry.path.split('/').pop() ?? entry.path;
        if (!name.startsWith(opts.phaseNamePrefix)) continue;
        const removeRes = execGit(cwd, ['worktree', 'remove', entry.path]);
        if (removeRes.exitCode !== 0) {
          throw new Error(
            `git workspace.reap remove failed for ${entry.path}: ${removeRes.stderr || removeRes.stdout}`,
          );
        }
        abandoned.push({ name, changeId: entry.rev, path: entry.path });
      }
      return { abandoned, incomplete: [] };
    },
  });

  // Phase 4 D-19: kernel-enforced via .git/index.lock; the adapter primitive is
  // a no-op by design. Cross-backend callers get a release-handle for symmetry.
  const acquireWriteLock = (
    _workspace: string,
    _opts?: { timeout?: number },
  ): { release(): void } => {
    return { release: (): void => {} };
  };

  // Phase 2.1 D-07: the `hooks` Object.freeze block is DELETED. The hook
  // helper is now module-private to hook-bridge.ts; Phase 4 (HOOK-01..05)
  // will wire internal invocation from inside commit() / push() — Phase 2.1
  // leaves the wiring as a no-op (RESEARCH Open Question 1).

  // ─── findConflicts ───────────────────────────────────────────────────────
  const findConflicts = (opts: { scope: 'all' | 'working-copy' }): ConflictResult[] => {
    if (opts.scope === 'all') {
      // RESEARCH Open Q1: git has no first-class equivalent of `jj log -r 'conflict()'`.
      // Phase 3 jj backend implements the real revset semantics; on git we
      // approximate via `git ls-files --unmerged`, which surfaces index-side
      // conflict entries (mid-merge / mid-rebase / mid-cherry-pick). WR-05
      // (Phase 2 review): previously returned `[]` unconditionally, which the
      // verify gate (CONFLICT-03) interpreted as "no conflicts" — silently
      // passing on a git repo with actual unmerged entries in the index. We
      // now fail-closed by returning the populated list when conflicts exist.
      //
      // `git ls-files --unmerged` emits one line per stage entry:
      //   <mode> <sha> <stage>\t<path>
      // Collect unique paths (a single unmerged file produces multiple stage
      // entries — base/ours/theirs — and we want one entry per path).
      const r = execGit(cwd, ['ls-files', '--unmerged']);
      if (r.exitCode !== 0 || r.stdout.length === 0) return [];
      const paths = new Set<string>();
      for (const line of r.stdout.split('\n')) {
        const tab = line.indexOf('\t');
        if (tab > 0) paths.add(line.slice(tab + 1));
      }
      return paths.size > 0
        ? [{ rev: 'INDEX', paths: [...paths], scope: 'all' }]
        : [];
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
    // Phase 2.1 D-08: PushOpts.noVerify is the sole public knob for skipping
    // pre-push hook firing on the cross-backend surface.
    if (opts.noVerify) args.push('--no-verify');
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
    // Plan 05-01 Task 1.5 (D-33 batch 1): git-side revert primitive consumed by
    // sdk/src/query/revert.ts. The jj backend dispatches `jj abandon` directly
    // inside the SDK query verb (destructive-semantics shift per 05-RESEARCH.md
    // Pitfall 6) so does NOT have a parallel method here. Args are built via
    // array (no shell string), matching every other execGit call in this file.
    revert: (opts: { rev: string; noCommit: boolean }): ExecResult => {
      const args = ['revert'];
      if (opts.noCommit) args.push('--no-commit');
      args.push(opts.rev);
      return execGit(cwd, args);
    },
    // Plan 05-01 Task 2 (D-33 batch 1, Rule 3 closure): reset / merge / restore
    // primitives consumed by sdk/src/query/{reset,merge,restore}.ts SDK shims.
    // The jj backend exposes no parallel methods — the SDK shims return a
    // typed error after the `vcs.kind === 'jj'` branch is reached. Args
    // built via array; no shell-string concatenation in any path.
    reset: (opts: { ref: string; mode: 'soft' | 'mixed' | 'hard' }): ExecResult => {
      const args = ['reset', `--${opts.mode}`, opts.ref];
      return execGit(cwd, args);
    },
    merge: (opts: { ref: string; squash?: boolean; noFf?: boolean; noCommit?: boolean }): ExecResult => {
      const args = ['merge'];
      if (opts.squash) args.push('--squash');
      if (opts.noFf) args.push('--no-ff');
      if (opts.noCommit) args.push('--no-commit');
      args.push(opts.ref);
      return execGit(cwd, args);
    },
    restore: (opts: { files: string[]; from?: string }): ExecResult => {
      const args = ['restore'];
      if (opts.from) args.push('--source', opts.from);
      args.push('--', ...opts.files);
      return execGit(cwd, args);
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
    // Phase 2.1 D-18: moved off WorkspaceContext. Same `git rev-parse` calls
    // that the workspace.context() body issues; consumers (worktree-safety.cjs)
    // narrow on `vcs.kind === 'git'` before calling these.
    gitDir: (): string => {
      const r = execGit(cwd, ['rev-parse', '--git-dir']);
      if (r.exitCode !== 0) {
        throw new Error(`gitOnly.gitDir failed: ${r.stderr || r.stdout}`);
      }
      return resolvePath(cwd, r.stdout.trim());
    },
    gitCommonDir: (): string => {
      const r = execGit(cwd, ['rev-parse', '--git-common-dir']);
      if (r.exitCode !== 0) {
        throw new Error(`gitOnly.gitCommonDir failed: ${r.stderr || r.stdout}`);
      }
      return resolvePath(cwd, r.stdout.trim());
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

  // Phase 2.1 D-03 / D-07: `hooks`, `stage`, `unstage` no longer appear in
  // the public adapter shape. WC-state-capture commit({files}) absorbs the
  // staging surface; Phase 4 absorbs hook invocation internally.
  const adapter = Object.freeze({
    kind: 'git' as const,
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
    acquireWriteLock,
    gitOnly,
    [__vcsTestOnly]: testOnly,
  }) as unknown as GitVcsAdapter;

  return adapter;
}
