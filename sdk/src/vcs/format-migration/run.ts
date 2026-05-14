/**
 * format-migration/run.ts — top-level orchestrator for the .planning/
 * SHA↔change_id rewriter.
 *
 * Pipeline (RESEARCH §"Pattern 3: Atomic Multi-File Commit"):
 *
 *   1. Read config.json (NO lock — readFile is atomic for small files) →
 *      infer source adapter + direction.
 *      Marker-probe fast-exit: if HEAD subject contains MIGRATION_COMMIT_MARKER
 *      and target matches current adapter, return {ok:true, migrated:false}.
 *      (RESEARCH Open Q #4 Option A.)
 *   2. Pre-flight: refuse on dirty WC or in-tree conflicts unless opts.force.
 *      (RESEARCH Pitfall 4.) MUST run BEFORE acquireStateLock — otherwise
 *      `.planning/config.json.lock` shows up as an untracked file and the
 *      dirty check falsely refuses the run (B-01).
 *   3. Acquire state-lock on .planning/config.json for the WRITE phase
 *      (walk + write + commit). RESEARCH §Anti-Pattern "Skipping the lock".
 *   4. Walk + async pre-pass to resolve every ID into a cache.
 *   5. Sync rewrite pass on every file using the populated cache.
 *   6. Write every dirty file (sequential writeFile loop — the single
 *      commit is the atomic boundary, not per-file writes).
 *   7. Flip config.json's vcs.adapter via atomicWriteConfig.
 *   8. Emit migration report at .planning/intel/06-migration-report.md.
 *   9. RECONSTRUCT vcs adapter with explicit { kind: target } (RESEARCH Pitfall 6).
 *      On jj target, fire pre-commit hook explicitly to work around A3 colocated
 *      hook gap (RESEARCH Open Q #5 — resolved via SDK fireHook primitive).
 *  10. Single atomic commit of all dirty files + config.json + report.md with
 *      MIGRATION_COMMIT_MARKER in the message.
 *
 * Bookmark tracking is INTENTIONALLY NOT performed here. `jj git init
 * --colocate` creates only `<branch>@origin` (remote-tracking); the local
 * bookmark must be tracked separately via `jj bookmark track`. Doing this
 * automatically inside migrate-vcs adds a hidden side effect: the user
 * may want different tracking semantics (multi-remote, mirrored origin,
 * delayed-until-first-push, etc.). Consumers that filter local bookmarks
 * (e.g. /gsd-pr-branch) handle the empty case themselves with an
 * actionable error pointing at `jj bookmark track`.
 *
 * Locking architecture:
 *   acquireStateLock(paths.config) wraps the WRITE phase (Steps 3–10) in a
 *   try/finally. The read-only marker probe (Step 1) and dirty-tree
 *   pre-flight (Step 2) run BEFORE the lock so the lockfile itself isn't
 *   visible to vcs.status() (B-01). A second concurrent invocation that
 *   reaches Step 3 waits up to ~10s for the lock then retries.
 *
 * Deviations from the 06-02-PLAN.md prose (documented for SUMMARY traceability):
 *   - Plan said `vcs.hooks.fire('pre-commit', ctx)` — adapter has no such method.
 *     Use `fireHook(cwd, 'pre-commit')` from `../hook-bridge.js` (the SDK's
 *     Phase 4 plan 06 D-07-exported primitive). This is the API surface
 *     RESEARCH §Open Q #5 actually meant.
 *   - Plan said `vcs.status({scope:'working-copy'})` — StatusOpts has no
 *     `scope` field; only `porcelain`. Use `vcs.status()` (default returns WC
 *     entries) and check `entries.length`.
 *   - VcsAdapter methods (log/status/diff/findConflicts/commit) are SYNC in
 *     this codebase. Plan pseudo-code used `await` on them — works because
 *     awaiting a non-Promise is a no-op, but kept literal-sync here.
 *   - LogEntry shape has `subject` (single field, not `message`). Marker
 *     probe inspects `subject`.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { relative, resolve as pathResolve, sep as pathSep } from 'node:path';
import { createVcsAdapter } from '../index.js';
import { atomicWriteConfig } from '../../query/config-mutation.js';
import {
  acquireStateLock,
  releaseStateLock,
} from '../../query/state-mutation.js';
import { planningPaths } from '../../query/helpers.js';
import { sanitizeCommitMessage } from '../../query/commit.js';
import { fireHook } from '../hook-bridge.js';
import { walkInScope } from './walk.js';
import { migrateContent, GIT_SHA_RE, JJ_CID_RE } from './rewrite.js';
import { createIdResolver, syncResolveFromCache } from './resolve.js';
import { resolveAncestor } from './orphan.js';
import { emitReport } from './report.js';
import { MIGRATION_COMMIT_MARKER } from './types.js';
import type {
  MigrationDirection,
  MigrationResult,
  Orphan,
  ResolveResult,
  RunMigrationOpts,
} from './types.js';

export async function runMigration(
  cwd: string,
  target: 'git' | 'jj',
  opts: RunMigrationOpts = {},
): Promise<MigrationResult> {
  // Canonicalize cwd so subsequent relative-path math matches the canonical
  // form `walkInScope` returns. On macOS, /var/folders symlinks to
  // /private/var/folders, and walk.ts realpathSyncs its inputs — without
  // this matching realpath in run.ts, dirty file paths and paths.config
  // wouldn't share a common prefix and Step 9's repo-relative conversion
  // would emit `../../../../private/...` (which jj rejects as fileset).
  let canonicalCwd = cwd;
  try {
    canonicalCwd = realpathSync(pathResolve(cwd));
  } catch {
    canonicalCwd = pathResolve(cwd);
  }
  const paths = planningPaths(canonicalCwd, opts.workstream);

  // ─── Step 1: read config (no lock), infer direction, marker-probe fast-exit ─
  let config: Record<string, unknown> = {};
  try {
    const raw = await readFile(paths.config, 'utf-8');
    config = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    /* config absent — treat as 'absent' */
  }
  const previousAdapter = readVcsAdapter(config) ?? 'absent';
  const sourceKind: 'git' | 'jj' = previousAdapter === 'jj' ? 'jj' : 'git';

  if (sourceKind === target) {
    // Marker-probe fast-exit (RESEARCH Open Q #4 Option A): if HEAD's
    // commit subject already carries the migration marker AND target
    // matches the current adapter, no work to do.
    //
    // Backend semantic shift: `log({ maxCount: 1 })` with NO revset on jj
    // returns `@` (the working-copy commit), which is empty after a squash
    // — the actual migration commit lives at `@-` (parent of WC). On git,
    // HEAD is the most recent commit by default. To probe symmetrically,
    // we look at the LAST FEW commits (maxCount: 2) on jj so we catch
    // both `@` and `@-`; git's default-HEAD walk already returns the
    // migration commit at index 0.
    try {
      const vcsProbe = createVcsAdapter(canonicalCwd, { kind: sourceKind });
      const recent =
        sourceKind === 'jj'
          ? // jj: probe both @ and @- (one of them is the migration commit)
            vcsProbe.log({ maxCount: 2 })
          : vcsProbe.log({ maxCount: 1 });
      const markerHit = recent.find((e) => (e.subject ?? '').includes(MIGRATION_COMMIT_MARKER));
      if (markerHit) {
        return {
          ok: true,
          migrated: false,
          filesChanged: 0,
          filesScanned: 0,
          orphans: {
            count: 0,
            ancestorResolved: 0,
            unresolvable: 0,
            reportPath: '',
          },
          previousAdapter: previousAdapter === 'absent' ? 'absent' : sourceKind,
          newAdapter: target,
          commitHash: markerHit.hash ?? '',
        };
      }
    } catch {
      /* fall through to the explicit-already-on-target error */
    }
    throw new Error(
      `migrate-vcs: already on ${target} (previousAdapter=${previousAdapter})`,
    );
  }

  const direction: MigrationDirection =
    sourceKind === 'git' && target === 'jj' ? 'git→jj' : 'jj→git';

  // ─── Step 2: pre-flight refusal on dirty / conflicts (NO LOCK YET) ────
  // B-01 (.planning/intel/06-dogfood-log.md): this check MUST run before
  // acquireStateLock — otherwise the lockfile itself shows up in
  // vcs.status() as an untracked file and unforced runs falsely refuse.
  const vcs = createVcsAdapter(canonicalCwd, { kind: sourceKind });
  if (!opts.force) {
    const status = vcs.status();
    if (status.entries.length > 0) {
      throw new Error(
        'migrate-vcs: working tree is dirty — commit/stash or pass --force',
      );
    }
    const conflicts = vcs.findConflicts({ scope: 'all' });
    if (conflicts.length > 0) {
      throw new Error(
        'migrate-vcs: in-tree conflicts present — resolve or pass --force',
      );
    }
  }

  // ─── Step 3: acquire state-lock for the WRITE phase ──────────────────
  const lockPath = await acquireStateLock(paths.config);
  try {
    // ─── Step 4: walk + async pre-pass to populate ID cache ─────────────
    const files = walkInScope(canonicalCwd);
    const idCache = new Map<string, ResolveResult>();
    const asyncResolver = createIdResolver({
      cwd: canonicalCwd,
      vcs,
      direction,
      ancestor: resolveAncestor,
    });

    // Use the SAME regex literal that migrateContent uses, but a local copy
    // so the module-scoped lastIndex isn't shared between this pre-pass and
    // the rewrite loop. (Both regexes are stateful; cloning via constructor
    // is cleaner than relying on every consumer to reset lastIndex.)
    const sourceRe =
      direction === 'git→jj'
        ? new RegExp(GIT_SHA_RE.source, GIT_SHA_RE.flags)
        : new RegExp(JJ_CID_RE.source, JJ_CID_RE.flags);

    const fileContents = new Map<string, string>();
    for (const f of files) {
      const content = await readFile(f, 'utf-8');
      fileContents.set(f, content);
      sourceRe.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = sourceRe.exec(content)) !== null) {
        const id = m[1];
        if (!idCache.has(id)) {
          idCache.set(id, await asyncResolver.resolve(id));
        }
      }
    }

    // ─── Step 5: sync rewrite pass over every file ──────────────────────
    const syncResolve = syncResolveFromCache(idCache);
    const dirty = new Map<string, { content: string; orphans: Orphan[] }>();
    const totalOrphans: Orphan[] = [];
    for (const f of files) {
      const original = fileContents.get(f) as string;
      const out = migrateContent(original, direction, syncResolve, f);
      if (out.content !== original) {
        dirty.set(f, out);
      }
      totalOrphans.push(...out.orphans);
    }

    // ─── Step 6: write dirty files (single-commit is the atomic boundary) ─
    for (const [f, { content }] of dirty) {
      await writeFile(f, content, 'utf-8');
    }

    // ─── Step 7: flip config.json's vcs.adapter ─────────────────────────
    const newConfig: Record<string, unknown> = {
      ...config,
      vcs: {
        ...((config.vcs as Record<string, unknown> | undefined) ?? {}),
        adapter: target,
      },
    };
    await atomicWriteConfig(paths.config, newConfig);

    // ─── Step 8: emit migration report ──────────────────────────────────
    const reportPath = await emitReport({
      cwd: canonicalCwd,
      direction,
      orphans: totalOrphans,
      filesScanned: files.length,
      filesChanged: dirty.size,
    });

    // ─── Step 9: reconstruct adapter on TARGET (RESEARCH Pitfall 6) ─────
    const newVcs = createVcsAdapter(canonicalCwd, { kind: target });

    // A3 colocated pre-commit hook gap workaround (RESEARCH Open Q #5):
    // jj 0.41 does not auto-fire .git/hooks/pre-commit after `jj squash` in
    // colocated mode. When migrating TO jj, explicitly fire the hook before
    // the commit so user expectations are preserved. fireHook treats missing
    // hooks as exit-0 success, so this is safe on greenfield repos.
    if (target === 'jj') {
      fireHook(canonicalCwd, 'pre-commit');
    }

    // ─── Step 10: single atomic commit ──────────────────────────────────
    // jj's fileset parser rejects absolute paths whose realpath escapes the
    // repo root (it tries to express them as `../../../...` and barfs on
    // ".." components). Git's pathspec accepts them, but to keep both
    // backends symmetric we convert every path to repo-relative form with
    // POSIX separators. cwd is canonicalised before relativizing so symlinked
    // tmpdirs (e.g. /var/folders → /private/var/folders on macOS) round-trip
    // correctly.
    const message = sanitizeCommitMessage(
      `chore(vcs): migrate ${sourceKind} -> ${target} ${MIGRATION_COMMIT_MARKER}`,
    );
    const absoluteFiles = [...dirty.keys(), paths.config, reportPath];
    const commitFiles = absoluteFiles.map((p) =>
      toRepoRelative(p, canonicalCwd),
    );
    const commitResult = newVcs.commit({
      files: commitFiles,
      message,
    });
    if (commitResult.exitCode !== 0) {
      throw new Error(
        `migrate-vcs: commit failed (exit ${commitResult.exitCode}): ${commitResult.stderr || commitResult.stdout || '(no stderr)'}`,
      );
    }

    const ancestorCount = totalOrphans.filter((o) => o.kind === 'ancestor').length;
    const unresolvableCount = totalOrphans.filter((o) => o.kind === 'unresolvable').length;

    return {
      ok: true,
      migrated: true,
      filesChanged: dirty.size,
      filesScanned: files.length,
      orphans: {
        count: totalOrphans.length,
        ancestorResolved: ancestorCount,
        unresolvable: unresolvableCount,
        reportPath,
      },
      previousAdapter: previousAdapter === 'absent' ? 'absent' : sourceKind,
      newAdapter: target,
      commitHash: commitResult.hash ?? '',
    };
  } finally {
    await releaseStateLock(lockPath);
  }
}

/**
 * Read `vcs.adapter` from a parsed config. Returns the literal value if it's
 * 'git' or 'jj'; returns undefined for 'auto', absent, or any other shape.
 * (The createVcsAdapter resolveKind function already does its own normalization
 * for the runtime detection path — here we only need to distinguish the three
 * write-time-meaningful values.)
 */
function readVcsAdapter(config: Record<string, unknown>): 'git' | 'jj' | undefined {
  const vcs = config.vcs as Record<string, unknown> | undefined;
  if (!vcs) return undefined;
  const adapter = vcs.adapter;
  if (adapter === 'git' || adapter === 'jj') return adapter;
  return undefined;
}

/**
 * Convert an absolute path under `cwd` to a repo-relative POSIX path. Falls
 * back to the absolute path if `abs` is outside `cwd` (defensive — walk.ts
 * only enumerates under cwd, and paths.config / reportPath are constructed
 * from cwd).
 */
function toRepoRelative(abs: string, cwd: string): string {
  const rel = relative(cwd, abs);
  if (!rel || rel.startsWith('..')) return abs;
  // Normalize Windows backslashes to POSIX forward slashes (jj's fileset
  // parser expects POSIX; git accepts both but POSIX is unambiguous).
  return pathSep === '\\' ? rel.split('\\').join('/') : rel;
}
