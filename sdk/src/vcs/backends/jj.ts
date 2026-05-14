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

import { basename, dirname, join } from 'node:path';
import { expr } from '../expr.js';
import { vcsExec, VcsExecError } from '../exec.js';
import type { ExecResult } from '../exec.js';
import { toJjRev } from '../parse/jj-rev.js';
import { parseJjLog } from '../parse/jj-log.js';
import { parseJjWorkspaceList } from '../parse/jj-workspace-list.js';
import { parseJjBookmarkRecord } from '../parse/jj-bookmark.js';
import { validateRefname } from '../refs-validator.js';
import { existsSync, mkdirSync } from 'node:fs';
import { acquireJjWriteLock } from '../jj/lock.js';
import { performJjReap } from '../jj/reap.js';
import { readIncomplete } from '../jj/incomplete-work.js';
import { fireHook } from '../hook-bridge.js';
import { firePrePushHook } from '../jj/pre-push.js';
import {
  __vcsTestOnly,
  VcsNotImplementedError,
  VcsBookmarkDivergentError,
  VcsIncompleteSubagentsError,
} from '../types.js';
import type {
  Bookmark,
  CommitInput,
  CommitResult,
  ConflictResult,
  DiffNameStatusEntry,
  DiffOpts,
  DiffResult,
  FetchOpts,
  JjVcsAdapter,
  LogEntry,
  LogOpts,
  PushOpts,
  ReapResult,
  RevisionExpr,
  SnapshotHandle,
  StatusEntry,
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
    // WR-07: D-01 (`bookmark`, prefixed via addPrefix) and D-04
    // (`bookmarkRaw`, no prefix) are mutually exclusive — they advance
    // the same bookmark slot under different prefix discipline. Today
    // both-set silently picks `bookmarkRaw`, which lets a caller-side
    // bug (one code path forgets to clear the other field) advance the
    // wrong bookmark without warning. Fail loudly instead.
    if (input.bookmark !== undefined && input.bookmarkRaw !== undefined) {
      throw new Error(
        'commit(): pass at most one of {bookmark, bookmarkRaw} — D-01 and D-04 are mutually exclusive.',
      );
    }
    // D-14 phase-merge gate. When `phaseMergeFor` is set, read the crash
    // queue at `${phaseDir}/incomplete-work.md` and throw before any squash
    // when the queue is non-empty. The orchestrator clears the file (by
    // reviewing entries and deleting them) before re-attempting the merge.
    // Subagent-tier squashes do not set this field; only the final
    // phase-merge squash that advances `gsd/phase-{N}` does (WS-09).
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
    let hash: string | null = null;
    // WR-03: when the deterministic hash probe fails after a successful
    // squash, surface the failure on stderr so callers can debug
    // `{hash: null}` (instead of guessing whether the commit even
    // landed). The squash itself succeeded, so we still proceed to the
    // bookmark-advance step below.
    let mergedStderr = squashRes.stderr;
    if (hashRes.exitCode === 0) {
      hash = hashRes.stdout.trim();
    } else {
      mergedStderr = `${squashRes.stderr}\n[hash-probe failed]: ${hashRes.stderr || hashRes.stdout}`;
    }

    // HOOK-02 / HOOK-03 / D-32 (Phase 5 plan 05-01): pre-commit fires AFTER
    // squash success, BEFORE bookmark advance, UNCONDITIONALLY (modulo the
    // GSD_HOOK_SKIP_COLOCATED=1 escape hatch).
    //
    // Phase 5 plan 05-01 retires the D-10 colocated no-op. The original D-10
    // assumption (A3) held that git's own .git/hooks/pre-commit would fire
    // automatically via colocation when post-squash `jj git export` updated
    // .git. Phase 4 plan 04-06 empirically refuted A3 on jj 0.41 colocated
    // mode — the export does NOT auto-fire .git/hooks/pre-commit after
    // `jj squash`. Without this fix, colocated dogfood users (the dominant
    // local-dev configuration) get no pre-commit at all.
    //
    // D-32 escape hatch: `GSD_HOOK_SKIP_COLOCATED=1` suppresses the fire in
    // colocated mode. Intended for the (currently hypothetical) case where a
    // future jj release adds auto-fire in colocated mode and the adapter's
    // direct fire would produce a duplicate. Idempotent hook bodies make this
    // moot in practice; the env var exists so developers can opt out without
    // a code change. NOT a security control — it is a developer-convenience
    // override (Pitfall 3 / threat T-05.01-04: accept-disposition).
    //
    // Non-colocated jj-native: adapter shells .githooks/<stage> directly via
    // fireHook (unchanged behaviour).
    //
    // noVerify (HOOK-01 contract): skips the fire entirely on both backends.
    if (!input.noVerify) {
      const skipColocated = process.env.GSD_HOOK_SKIP_COLOCATED === '1';
      const isColocated = existsSync(join(cwd, '.git')) && existsSync(join(cwd, '.jj'));
      // D-32 / A3 fix: always fire pre-commit; D-10 colocated no-op retired.
      // GSD_HOOK_SKIP_COLOCATED=1 is the escape hatch for the case where a
      // future jj release adds auto-fire behavior in colocated mode and
      // produces duplicate fires.
      if (!(skipColocated && isColocated)) {
        const hookRes = fireHook(cwd, 'pre-commit', { stagedFiles: input.files });
        if (hookRes.exitCode !== 0) {
          // T-03.04-03 mitigation pattern: squash already succeeded; report
          // hook failure via merged stderr, but exitCode reflects squashRes
          // (the squash itself didn't fail). Caller decides whether to treat
          // as error based on stderr presence.
          mergedStderr = `${mergedStderr}\n[pre-commit hook failed]: ${hookRes.stderr || hookRes.stdout}`;
        }
      }
    }

    // D-01 / D-04: bookmark advance. The squash already succeeded; an
    // advance failure here is reported via merged stderr (never silently
    // swallowed — T-03.04-03 mitigation).
    if (input.bookmark !== undefined || input.bookmarkRaw !== undefined) {
      const bmName = input.bookmarkRaw !== undefined
        ? input.bookmarkRaw
        : addPrefix(input.bookmark!);
      // IN-03: long form `--allow-backwards` (verified on jj 0.41) so a
      // Renovate bump past 0.41 — where the short `-B` may be retired
      // for the canonical spelling — remains in-place compatible.
      const advArgs = jjArgv('bookmark', 'set', bmName, '-r', '@-', '--allow-backwards');
      const advRes = vcsExec(cwd, 'jj', advArgs);
      if (advRes.exitCode !== 0) {
        return {
          exitCode: squashRes.exitCode,
          stdout: squashRes.stdout,
          stderr: `${mergedStderr}\n[bookmark advance failed]: ${advRes.stderr || advRes.stdout}`,
          hash,
        };
      }
    }

    return {
      exitCode: squashRes.exitCode,
      stdout: squashRes.stdout,
      stderr: mergedStderr,
      hash,
    };
  };

  // ─── log / status / diff / findConflicts (plan 03-05) ───────────────────

  /**
   * `vcs.log(opts)` — emits commits as `LogEntry[]` via the NDJSON parser
   * (`parseJjLog`, production from plan 03-02). Argv shape per RESEARCH
   * §`log()`:
   *  - `opts.maxCount` → `-n N`
   *  - `opts.allRefs` → `-r 'all()'`
   *  - `opts.rev` → `-r toJjRev(rev)`
   *  - `opts.paths` → trailing positional path filter, prefixed with the
   *    `--` end-of-options separator (WR-01: verified working on jj 0.41;
   *    neutralizes leading-`-` paths that would otherwise be parsed as
   *    flags by jj's CLI — same defense the git backend uses at git.ts:202).
   * PITFALL 1: `LogEntry.hash` is `commit_id` (40-char hex), NEVER
   * `change_id` — pinned by `parseJjLog`.
   */
  const log = (opts: LogOpts = {}): LogEntry[] => {
    const args: string[] = ['log', '-T', 'json(self) ++ "\\n"', '--no-graph'];
    if (opts.maxCount) args.push('-n', String(opts.maxCount));
    if (opts.allRefs) args.push('-r', 'all()');
    if (opts.rev) args.push('-r', toJjRev(opts.rev));
    if (opts.paths && opts.paths.length > 0) args.push('--', ...opts.paths);
    const r = vcsExec(cwd, 'jj', jjArgv(...args));
    if (r.exitCode !== 0) return [];
    return parseJjLog(r.stdout);
  };

  /**
   * Parse `jj status` human-readable output into `StatusEntry[]`.
   *
   * Phase 2.1 D-16: `StatusEntry` has NO `index` field — jj has no index.
   * The `worktree` letter is whatever jj prints (A/M/D/R/C).
   *
   * Output sample (jj 0.41):
   *   Working copy changes:
   *   A a.txt
   *   M b.txt
   *   Working copy  (@) : wttxkypv e4595a81 (no description set)
   *   Parent commit (@-): ...
   *
   * RESEARCH §`status()`: jj has no structured `--porcelain` analog; the
   * parser hand-rolls the human-readable lines starting with A/M/D/R/C
   * between the `Working copy changes:` header and the `Working copy  (@)`
   * (or `Parent commit`) separator.
   */
  const parseJjStatus = (raw: string): StatusEntry[] => {
    const lines = raw.split('\n');
    const entries: StatusEntry[] = [];
    let inSection = false;
    for (const line of lines) {
      if (line.startsWith('Working copy changes:')) {
        inSection = true;
        continue;
      }
      if (line.startsWith('Working copy  (@)') || line.startsWith('Parent commit')) break;
      if (!inSection) continue;
      // WR-05: widen the regex to tolerate (a) extra whitespace between
      // the status letter and the path (alignment-driven), and (b) the
      // rename arrow form `R old -> new`. For rename/copy we canonicalize
      // on the post-state (new path), matching the git backend's
      // `(letter === 'R' || letter === 'C') ? cols[2] : cols[1]` heuristic
      // at git.ts:316.
      const m = /^([AMDRC])\s+(.+)$/.exec(line);
      if (!m) {
        // IN-06: defensive — once inSection, any non-entry line ends
        // the section. The explicit `Working copy  (@)` / `Parent commit`
        // markers above remain for known steady-state output; this
        // catches future jj template reshapes that drop those markers.
        break;
      }
      const letter = m[1];
      const rest = m[2];
      if (letter === 'R' || letter === 'C') {
        const arrowIdx = rest.indexOf(' -> ');
        const path = arrowIdx >= 0 ? rest.slice(arrowIdx + ' -> '.length) : rest;
        entries.push({ path, worktree: letter });
      } else {
        entries.push({ path: rest, worktree: letter });
      }
    }
    return entries;
  };

  /**
   * `vcs.status(opts)` — parses `jj st` text output. Per git-backend parity,
   * `opts.porcelain === false` returns `{entries: [], raw: stdout}` so
   * callers wanting the raw human-readable form can read `.raw` without
   * entry parsing.
   */
  const status = (opts: StatusOpts = {}): StatusResult => {
    const r = vcsExec(cwd, 'jj', jjArgv('status'));
    if (r.exitCode !== 0) return { entries: [], raw: r.stderr || r.stdout };
    if (opts.porcelain === false) {
      return { entries: [], raw: r.stdout };
    }
    return { entries: parseJjStatus(r.stdout), raw: r.stdout };
  };

  /**
   * Parse `jj diff --summary` line-by-line into `DiffNameStatusEntry[]`.
   * Output sample: `M path/to/file.ts`, `A other.txt`, etc. The letter set
   * matches `DiffNameStatusEntry.status` (`A|M|D|R|C|T|U|X|B`).
   */
  const parseDiffSummary = (raw: string): DiffNameStatusEntry[] => {
    const entries: DiffNameStatusEntry[] = [];
    for (const line of raw.split('\n')) {
      const m = /^([AMDRCTUXB]) (.+)$/.exec(line);
      if (m) {
        entries.push({ path: m[2], status: m[1] as DiffNameStatusEntry['status'] });
      }
    }
    return entries;
  };

  /**
   * Phase 2.1 / Phase 3: `opts.staged` is a git-only concept (the index).
   * On jj there is no index — `opts.staged === true` is a documented no-op
   * (returns the same WC diff). Callers should narrow on `vcs.kind === 'git'`
   * before relying on staged-specific behavior. No Phase 3 caller exercises
   * this option against a jj backend (audit recorded in 03-05-AUDIT.md).
   *
   * Argv per RESEARCH §`diff()`:
   *  - `opts.nameOnly` → `--name-only`
   *  - `opts.nameStatus` → `--summary` (jj's name-status equivalent)
   *  - `opts.rev` → `-r toJjRev(rev)`
   *  - `opts.paths` → trailing positional, prefixed with `--` end-of-options
   *    separator (WR-01: verified working on jj 0.41; mirrors the git
   *    backend's argv shape at git.ts:298).
   */
  const diff = (opts: DiffOpts = {}): DiffResult => {
    const args: string[] = ['diff'];
    if (opts.nameOnly) args.push('--name-only');
    if (opts.nameStatus) args.push('--summary');
    if (opts.rev) args.push('-r', toJjRev(opts.rev));
    if (opts.paths && opts.paths.length > 0) args.push('--', ...opts.paths);
    // opts.staged: no-op on jj (no index concept). See JSDoc above.
    const r = vcsExec(cwd, 'jj', jjArgv(...args));
    if (r.exitCode !== 0) {
      return { raw: r.stderr || r.stdout, nameOnly: [] };
    }
    const result: DiffResult = {
      raw: r.stdout,
      nameOnly: opts.nameOnly
        ? r.stdout.split('\n').map((s) => s.trim()).filter(Boolean)
        : [],
    };
    if (opts.nameStatus) {
      result.nameStatus = parseDiffSummary(r.stdout);
    }
    return result;
  };

  /**
   * Phase 3 RESEARCH A3 (medium-risk → empirically resolved during plan
   * 03-05 execution): enumerate conflicted paths for a given revision.
   *
   * **PRIMARY form** (verified working on jj 0.41.0 locally during plan
   * execution): `jj resolve --list -r <rev>`. Output is one line per
   * conflicted path with the conflict description after several spaces:
   *
   *     f.txt    2-sided conflict
   *     other.md 3-sided conflict
   *
   * The regex `/^(\S+)/` extracts only the path token, discarding the
   * trailing diagnostic prose.
   *
   * **Fallback** (kept for resilience against future jj output reshaping):
   * `jj diff -r <rev> --summary` filtered for lines starting with `C`.
   * (IN-04: `U` was dropped from the regex — `jj diff --summary` on jj
   * 0.41 emits only `A/M/D/R/C/T/X/B`; the `U` branch was dead.) On jj
   * 0.41 the primary form succeeded for every probe, so this branch is
   * dormant in practice but provides soft-degradation against contract
   * drift.
   *
   * WR-04: the sentinel `'<UNRESOLVABLE>'` is returned when the
   * `conflicts()` revset flagged this rev but neither enumeration form
   * yielded paths. CONFLICT-03 (verify gate) thus cannot mistake an
   * empty array for "no conflicts" when the upstream revset clearly
   * said the commit IS conflicted — surface drift instead of silently
   * passing.
   */
  const enumerateConflictedPaths = (rev: string): string[] => {
    // Primary: jj resolve --list -r <rev>
    const primaryArgs = jjArgv('resolve', '--list', '-r', rev);
    const primary = vcsExec(cwd, 'jj', primaryArgs);
    if (primary.exitCode === 0 && primary.stdout.trim().length > 0) {
      return primary.stdout
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((line) => {
          // Output: `<path>   <conflict description>` — extract path only.
          const m = /^(\S+)/.exec(line);
          return m ? m[1] : line;
        });
    }
    // Fallback: jj diff -r <rev> --summary, filter for the C status
    // letter. IN-04: `U` removed — jj 0.41 never emits it on `diff
    // --summary`.
    const fallbackArgs = jjArgv('diff', '-r', rev, '--summary');
    const fallback = vcsExec(cwd, 'jj', fallbackArgs);
    if (fallback.exitCode !== 0) return ['<UNRESOLVABLE>'];
    const paths = fallback.stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const m = /^C (.+)$/.exec(line);
        return m ? m[1] : '';
      })
      .filter(Boolean);
    // WR-04: conflicts() flagged this rev but no enumeration form
    // yielded anything — surface the drift rather than silently
    // passing [] through to the verify gate.
    return paths.length > 0 ? paths : ['<UNRESOLVABLE>'];
  };

  /**
   * `vcs.findConflicts({scope})` — surfaces in-tree conflicted commits.
   *
   * ⚠️ **CRITICAL: jj's revset function is `conflicts()` PLURAL, not
   * `conflict()`.** All upstream docs (CONTEXT.md, REQUIREMENTS.md,
   * ROADMAP.md) currently say singular `conflict()`; the doc-fix is
   * scheduled for plan 03-07 wrap-up. Implementation here uses the correct
   * plural form from day one. See 03-RESEARCH.md §"Open Question Q1" for
   * the verification record.
   *
   * - `scope: 'all'` → revset `conflicts()` (every in-tree conflicted commit)
   * - `scope: 'working-copy'` → revset `conflicts() & @` (filter to @)
   *
   * Path enumeration uses `enumerateConflictedPaths(rev)` which dispatches
   * `jj resolve --list -r <rev>` (primary) with a `--summary`-based fallback.
   *
   * CONFLICT-03: the verify-gate caller invokes `findConflicts({scope:'all'})`
   * — already wired on the git backend (git.ts:520); flipping the allowlist
   * entry below makes the jj backend reachable through it without further
   * call-site change.
   */
  const findConflicts = (
    opts: { scope: 'all' | 'working-copy' }
  ): ConflictResult[] => {
    const revset = opts.scope === 'working-copy'
      ? 'conflicts() & @'
      : 'conflicts()';
    const logArgs = jjArgv(
      'log',
      '-r', revset,
      '-T', 'json(self) ++ "\\n"',
      '--no-graph',
    );
    const r = vcsExec(cwd, 'jj', logArgs);
    if (r.exitCode !== 0) return [];
    const entries = parseJjLog(r.stdout);
    if (entries.length === 0) return [];

    const results: ConflictResult[] = [];
    for (const entry of entries) {
      const paths = enumerateConflictedPaths(entry.hash);
      results.push({ rev: entry.hash, paths, scope: opts.scope });
    }
    return results;
  };

  // ─── push / fetch (plan 03-06) ──────────────────────────────────────────
  /**
   * `vcs.push(opts)` — wraps `jj git push` (NOT raw `git push`; `jj git push`
   * is a jj subcommand and is the only legal jj-side wrapper around the
   * git-remote protocol).
   *
   * Argv mapping (empirically verified against jj 0.41 during plan 03-06):
   *  - `opts.remote` → `--remote <name>`
   *  - `opts.ref`    → `--bookmark <name>` IFF the ref is bookmark-shaped
   *                    (matches `^[A-Za-z][\w\-/.]*$` after `toJjRev`).
   *                    Other shapes (`@`, `@-`, range exprs) are a documented
   *                    no-op — jj's default push behavior applies.
   *  - `opts.force`  → DOCUMENTED NO-OP. `jj git push` has NO `--force-with-lease`
   *                    flag. Its DEFAULT behavior IS already force-with-lease
   *                    semantics ("safety checks" per `jj git push --help`).
   *                    Accepted on the cross-backend surface for parity; adds
   *                    no flag to the argv. (Empirical correction to
   *                    RESEARCH A4 which speculated --force-with-lease existed.)
   *  - `opts.noVerify` → no-op on jj in Phase 3 (Phase 4 owns hook firing).
   *
   * T-03.06-01 mitigation: the bookmark-shape regex gates the `--bookmark`
   * path; non-matching refs proceed without the flag. The regex disallows
   * leading `-` (rules out flag-injection like `--bookmark='--delete'`).
   */
  const push = (opts: PushOpts = {}): ExecResult => {
    const args: string[] = ['git', 'push'];
    if (opts.remote) args.push('--remote', opts.remote);
    if (opts.ref) {
      const refName = toJjRev(opts.ref);
      // Bookmark-shape gate (T-03.06-01): only letter-leading, refname-safe
      // names get `--bookmark`. `@`, `@-`, `from..to` ranges fall through.
      // WR-06: `.` is in the trailing character class to admit refname
      // dots (e.g. `release/v1.2`), but that also lets the range token
      // `..` slip through when both range ends are bookmark-shaped (e.g.
      // `from..to` joined by toJjRev). Exclude `..` explicitly so the
      // gate intent ("bookmark-shaped, not a range") is actually
      // enforced.
      const isBookmarkLike =
        /^[A-Za-z][\w\-/.]*$/.test(refName) && !refName.includes('..');
      if (isBookmarkLike) {
        args.push('--bookmark', refName);
      }
      // else: documented no-op — jj's default push behavior applies. Phase 4
      // may reshape if a real caller needs per-rev push selectivity.
    }
    // opts.force: documented no-op (see JSDoc above). No flag added.
    // HOOK-04 (Phase 4 plan 06): pre-push fires BEFORE jj git push. Inline
    // replication of acarapetis/jj-pre-push trigger logic (CI-02 — no Python
    // runtime dep). When the hook returns non-zero, abort the push. noVerify
    // (HOOK-01 contract) suppresses the fire.
    if (!opts.noVerify) {
      const hookRes = firePrePushHook(cwd, { remote: opts.remote });
      if (hookRes.exitCode !== 0) {
        return {
          exitCode: hookRes.exitCode,
          stdout: hookRes.stdout,
          stderr: `[pre-push hook failed]: ${hookRes.stderr || hookRes.stdout}`,
          timedOut: false,
          error: null,
        };
      }
    }
    return vcsExec(cwd, 'jj', jjArgv(...args));
  };

  /**
   * `vcs.fetch(opts)` — wraps `jj git fetch`.
   *
   * Argv mapping (empirically verified against jj 0.41 during plan 03-06):
   *  - `opts.remote` → `--remote <name>`
   *  - `opts.ref`    → DOCUMENTED NO-OP (RESEARCH A6). `jj git fetch` has
   *                    `--branch <glob>` (glob filter on bookmark names) but
   *                    no per-ref selectivity in the git-style sense. The
   *                    cross-backend `opts.ref` field has no clean
   *                    translation; jj fetches all configured remote refs.
   *                    Audit (T-03.06-02 mitigation): no jj-reachable caller
   *                    passes opts.ref to fetch — recorded in 03-06-AUDIT.md.
   */
  const fetch = (opts: FetchOpts = {}): ExecResult => {
    const args: string[] = ['git', 'fetch'];
    if (opts.remote) args.push('--remote', opts.remote);
    // opts.ref: documented no-op on jj (see JSDoc above).
    return vcsExec(cwd, 'jj', jjArgv(...args));
  };

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
      // D-24 cr-01 fold-in: validate the post-prefix name BEFORE argv build.
      // Rejects '-D', '--force-delete', '--push-option=evil', etc. Applied for
      // both raw (opts.raw === true) and non-raw paths — the gsd/ prefix is
      // incidental protection, not contract. Defense-in-depth pair: the `--`
      // end-of-options separator below catches anything the validator misses
      // and isolates the positional from any preceding flag-bearing tokens.
      validateRefname(actualName);
      const args = jjArgv('bookmark', 'create', '-r', toJjRev(rev), '--', actualName);
      const r = vcsExec(cwd, 'jj', args);
      if (r.exitCode !== 0) {
        throw new Error(`refs.bookmarks.create failed: ${r.stderr || r.stdout}`);
      }
    },
    move: (name: string, rev: RevisionExpr, opts?: { raw?: boolean }): void => {
      const actualName = addPrefix(name, opts?.raw);
      // D-24 cr-01 fold-in: see bookmarks.create above for rationale.
      validateRefname(actualName);
      const args = jjArgv('bookmark', 'move', '--to', toJjRev(rev), '--', actualName);
      const r = vcsExec(cwd, 'jj', args);
      if (r.exitCode !== 0) {
        throw new Error(`refs.bookmarks.move failed: ${r.stderr || r.stdout}`);
      }
    },
    delete: (name: string, opts?: { raw?: boolean }): void => {
      const actualName = addPrefix(name, opts?.raw);
      // D-24 cr-01 fold-in: see bookmarks.create above for rationale.
      validateRefname(actualName);
      const args = jjArgv('bookmark', 'delete', '--', actualName);
      const r = vcsExec(cwd, 'jj', args);
      if (r.exitCode !== 0) {
        throw new Error(`refs.bookmarks.delete failed: ${r.stderr || r.stdout}`);
      }
    },
    exists: (name: string, opts?: { raw?: boolean }): boolean => {
      const actualName = addPrefix(name, opts?.raw);
      // D-24 cr-01 fold-in: validator on read-side probes too. A probe like
      // bookmarks.exists('-D') would otherwise pass '-D' as a positional to
      // `jj bookmark list`, which jj may interpret as a flag depending on
      // version. Reject the shape upfront.
      validateRefname(actualName);
      // `jj bookmark list <name>` exits 0 even when the bookmark is absent
      // (just emits an empty list). The presence probe combines exit-0 with
      // non-empty stdout.
      const args = jjArgv('bookmark', 'list', '--', actualName);
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
        .map((s) => {
          // WR-02 (D-02 enforcement on this read path): jj renders
          // divergent bookmarks with a trailing `??` suffix in template
          // output. Surface as `VcsBookmarkDivergentError` rather than
          // letting `feature??` masquerade as a regular bookmark name
          // after stripPrefix. `divergentTargets` is left empty here
          // because the template form doesn't expose the targets; callers
          // who need them can re-query through `bookmarks.list()`.
          if (s.endsWith('??')) {
            throw new VcsBookmarkDivergentError({
              bookmarkName: stripPrefix(s.slice(0, -2)),
              divergentTargets: [],
            });
          }
          // WR-08: jj's `bookmarks` template appends `*` when the local
          // bookmark is ahead of its remote-tracking counterpart. Strip
          // only this known marker; any other non-refname suffix is
          // contract drift and surfaces as a typed error so a future jj
          // template reshape can't silently leak state markers into
          // caller-visible names.
          const stripped = s.replace(/\*$/, '');
          // Refname grammar (the conservative slice we admit on this
          // template-driven read path): leading alnum, then
          // `[A-Za-z0-9._/-]*`. Anything else signals template drift.
          if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(stripped)) {
            throw new Error(
              `currentBookmarks: template contract drift — '${s}' has an unrecognized suffix or shape (expected refname after '*'/'??' marker strip)`,
            );
          }
          return stripped;
        })
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

  // ─── workspace namespace (plan 04-01 fills add/forget/prune real bodies) ─
  // Phase 3 left add/forget/prune as VcsNotImplementedError stubs. Plan 04-01
  // replaces them with real bodies on jj. reap() + acquireWriteLock are added
  // as Phase 4 stubs that throw — plans 04-03 (lock) and 04-04 (reap) ship
  // the real bodies; per-verb allowlist gates contract access (TEST-06
  // skip-not-throw).
  const workspace: VcsWorkspace = Object.freeze({
    add: (input: WorkspaceAdd): WorkspaceInfo => {
      // D-17 (RESEARCH Pitfall 4): jj workspace add does NOT auto-create
      // intermediate directories. mkdir -p the parent before invoking.
      mkdirSync(dirname(input.path), { recursive: true });
      // D-04: --name <NAME> threaded from input.name (Phase 4 type extension);
      // defaults to basename(input.path) per jj's own default when --name omitted.
      // Security (T-04.01-01 mitigate): insert `--` end-of-options separator
      // before user-influenced positional `input.path` so an attacker-controlled
      // path like '--no-confirm' cannot be parsed as a flag.
      const args = jjArgv('workspace', 'add');
      if (input.baseRef) {
        args.push('-r', toJjRev(input.baseRef));
      }
      if (input.name) {
        args.push('--name', input.name);
      }
      args.push('--', input.path);
      const r = vcsExec(cwd, 'jj', args);
      if (r.exitCode !== 0) {
        throw new Error(`workspace.add failed: ${r.stderr || r.stdout}`);
      }
      // Return shape parity with git backend (git.ts:453-465): fetch the new
      // workspace's entry from list() rather than re-deriving change_id.
      const entries = workspace.list();
      const wsName = input.name ?? basename(input.path);
      const entry = entries.find((e) => e.path === wsName);
      return entry ?? { path: input.path, rev: '', locked: false };
    },
    forget: (workspaceNameOrPath: string): void => {
      // jj workspace forget takes the workspace NAME (not path). Resolve path → name
      // via list() when the caller hands us a path.
      const entries = workspace.list();
      const matchByName = entries.find((e) => e.path === workspaceNameOrPath);
      const name = matchByName?.path ?? basename(workspaceNameOrPath);
      // Security (T-04.01-02 mitigate): `--` separator before user-influenced positional.
      const args = jjArgv('workspace', 'forget', '--', name);
      const r = vcsExec(cwd, 'jj', args);
      if (r.exitCode !== 0) {
        throw new Error(`workspace.forget failed: ${r.stderr || r.stdout}`);
      }
      // PITFALL 3 (RESEARCH): forget does NOT remove the on-disk dir.
      // The caller (typically vcs.workspace.reap()) is responsible for `rm -rf`
      // of the workspace path for the empty-head case. workspace.forget() itself
      // does not remove the directory — that's a separate concern owned by reap().
    },
    /**
     * `vcs.workspace.list()` — parses `jj workspace list -T 'json(self) ++
     * "\n"'` NDJSON via `parseJjWorkspaceList` (production from plan 03-02).
     *
     * On a fresh single-workspace colocated repo this returns a one-element
     * array `[{path: 'default', rev: <40-char-commit_id>, locked: false}]`.
     * `locked` is always false (jj has no lock primitive — PITFALL 4).
     *
     * Phase 4 reshapes when multi-workspace flows land. Phase 3 just needs
     * the contract-passing single-workspace case for cross-backend parity.
     */
    list: (): WorkspaceInfo[] => {
      const args = jjArgv('workspace', 'list', '-T', 'json(self) ++ "\\n"');
      const r = vcsExec(cwd, 'jj', args);
      if (r.exitCode !== 0) return [];
      return parseJjWorkspaceList(r.stdout);
    },
    /**
     * `vcs.workspace.context()` — Phase 3 stub returning the cross-backend
     * shape literally. T-03.06-03: `mode: 'main'` is a documented Phase-3
     * boundary; Phase 4 implements real multi-workspace context (effectiveRoot
     * resolution when @ points into a linked workspace, isLinked detection
     * via `.jj/working_copy/<name>` sentinel files, etc.).
     *
     * No jj invocation — pure literal, returned frozen so callers cannot
     * mutate the shape (matches Object.freeze convention used throughout
     * the adapter).
     */
    context: (): WorkspaceContext =>
      Object.freeze({
        effectiveRoot: cwd,
        mode: 'main' as const,
        isLinked: false,
      }),
    prune: (): ExecResult => {
      // jj has no `jj workspace prune` subcommand (verified locally on 0.41).
      // The equivalent is `vcs.workspace.reap({...})` (Phase 4 verb) which
      // batches abandon+forget+rm. workspace.prune() returns a documented
      // success no-op for cross-backend surface parity; callers needing
      // actual reap semantics call workspace.reap() instead.
      return { exitCode: 0, stdout: '', stderr: '', timedOut: false, error: null };
    },
    reap: (opts: { phaseNamePrefix: string; phaseDir: string }): ReapResult => {
      // Phase 4 plan 04: delegate to the UPSTREAM-02 sidecar in
      // sdk/src/vcs/jj/reap.ts. Inventory via workspace.list(), filter by
      // phaseNamePrefix (D-04 / #2774 inclusion-filter pattern), resolve
      // workspace-name → on-disk path via the orchestrator-locked layout
      // `.claude/jj-workspaces/<name>` per D-16. If D-18 is ever relaxed,
      // this path-resolution policy moves to a caller-supplied override
      // layer; for now it's encoded inline as the only conformant layout.
      const allEntries = workspace.list();
      const tracked = allEntries
        .filter((e) => e.path.startsWith(opts.phaseNamePrefix))
        .map((e) => ({
          name: e.path,
          headChange: e.rev,
          path: join(cwd, '.claude/jj-workspaces', e.path),
        }));
      return performJjReap({
        mainRepoRoot: cwd,
        phaseNamePrefix: opts.phaseNamePrefix,
        phaseDir: opts.phaseDir,
        entries: tracked,
      });
    },
  });

  /**
   * vcs.acquireWriteLock(workspace, opts?) — Phase 4 plan 03 wiring.
   * Delegates to sdk/src/vcs/jj/lock.ts::acquireJjWriteLock (UPSTREAM-02 sidecar).
   *
   * Pitfall 9 (RESEARCH): the stale-WC probe inside acquireJjWriteLock must run
   * against the MAIN repo root (not the locked workspace) to avoid auto-snapshot
   * recursion. The adapter passes its own `cwd` as `mainRepoRoot` — orchestrator
   * callers should construct this jj adapter at the main repo path before
   * invoking acquireWriteLock on a subagent workspace path. When `cwd ===
   * workspace`, the probe runs against the same repo (safe — no recursion
   * because acquireWriteLock does not fire hooks; see Pitfall 9 second half).
   */
  const acquireWriteLock = (
    workspace: string,
    opts?: { timeout?: number },
  ): { release(): void } => {
    return acquireJjWriteLock(workspace, {
      timeout: opts?.timeout,
      mainRepoRoot: cwd,
    });
  };

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
      //
      // IN-05 — caller responsibility: contract-suite tests that
      // assert on `vcs.status()` after a `restore()` are sensitive to
      // prior-test untracked-file residue (e.g., an `A untracked.txt`
      // entry surfaces from a file materialized in the previous test
      // and not deleted by op-restore). Authors of such tests must
      // either: (a) delete the file via fs.unlinkSync before
      // assertion, (b) seed and restore from a snapshot taken AFTER
      // the suspect file was materialized, or (c) phrase the
      // assertion to tolerate the residue. Phase 4 may add an
      // opt-in `restore({clean: true})` once the orchestrator has a
      // real caller need.
    },
  });

  // All parser imports are now actively consumed: `parseJjLog` by `log()`
  // (plan 03-05) and `findConflicts()`, `parseJjWorkspaceList` by
  // `workspace.list()` (this plan 03-06), `parseJjBookmarkRecord` by
  // `bookmarks.list()` (plan 03-03). The prior `void parseJjWorkspaceList`
  // unused-import shim is gone.

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
    acquireWriteLock,
    [__vcsTestOnly]: testOnly,
  });
}
