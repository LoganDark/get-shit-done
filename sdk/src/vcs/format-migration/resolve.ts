/**
 * format-migration/resolve.ts — cached ID resolver + sync cache reader.
 *
 * Two-phase API:
 *   1. `createIdResolver(deps)` returns an ASYNC resolver. Caller runs a
 *      pre-pass over every file in scope, collecting every distinct ID match
 *      and resolving each via the async API (which delegates to
 *      `commitIdOf` / `changeIdOf` from `parse/jj-id.ts`). Results are
 *      memoized in a `Map<string, ResolveResult>`.
 *   2. `syncResolveFromCache(cache)` returns a SYNCHRONOUS reader suitable for
 *      passing to `rewrite.ts:migrateContent`. Cache misses throw.
 *
 * Rationale: `migrateContent` is pure-sync to keep the regex loop simple. The
 * async ↔ sync split lives here, not inside migrateContent.
 *
 * Resolution pipeline (per ID, post B-07 redesign):
 *   1. Source-side existence check (`vcs.refs.exists(...)`). If the ID does
 *      NOT exist as a commit on the SOURCE backend, return `{kind:'skip'}`
 *      WITHOUT ever consulting the target backend. This catches hex-shaped
 *      substrings that are not real commit hashes (e.g. `cceeded` inside
 *      `succeeded`) and prevents them from becoming orphan breadcrumbs.
 *   2. Target-side direct translation via `commitIdOf` / `changeIdOf`.
 *   3. On `VcsExecError` from step 2 → delegate to `deps.ancestor(...)` (the
 *      `orphan.ts:resolveAncestor` walker). On null ancestor → `unresolvable`.
 */

import { commitIdOf, changeIdOf } from '../parse/jj-id.js';
import { VcsExecError } from '../exec.js';
import { expr } from '../expr.js';
import type { VcsAdapter } from '../types.js';
import type {
  MigrationDirection,
  ResolveResult,
} from './types.js';

export interface IdResolver {
  resolve(id: string): Promise<ResolveResult>;
}

/**
 * Dependencies injected into createIdResolver. Pulled out as an interface so
 * tests can substitute mocks for `vcs`, the underlying jj-id helpers, and
 * the ancestor walker.
 */
export interface CreateIdResolverDeps {
  cwd: string;
  vcs: VcsAdapter;
  direction: MigrationDirection;
  ancestor: (
    vcs: VcsAdapter,
    cwd: string,
    id: string,
    direction: MigrationDirection,
  ) => Promise<{ ancestor: string; childrenInTarget: string[] } | null>;
}

/**
 * Build an async resolver that translates source-VCS IDs to target-VCS IDs
 * via `commitIdOf` / `changeIdOf`, falling back to ancestor walk on
 * VcsExecError, and caching every result.
 */
export function createIdResolver(deps: CreateIdResolverDeps): IdResolver {
  const cache = new Map<string, ResolveResult>();
  return {
    async resolve(id: string): Promise<ResolveResult> {
      const cached = cache.get(id);
      if (cached !== undefined) return cached;

      let result: ResolveResult;

      // ─── Step 1: source-side existence check (B-07 safety net) ────────
      // Before consulting the target backend, verify the candidate exists
      // as a commit on the SOURCE backend. Hex-shaped substrings of
      // English words (e.g. `cceeded` inside `succeeded`) and illustrative
      // placeholders (e.g. `deadbeef`) fail this check and short-circuit
      // to `kind:'skip'` — no orphan record, no breadcrumb, no edit.
      //
      // `vcs.refs.exists(...)` returns false on any "not a commit" outcome
      // (unknown ID, wrong shape, etc.). It does NOT throw for invalid
      // input — defensive try/catch covers exotic VcsExecError shapes.
      let sourceExists = false;
      try {
        // `expr.rev(id)` accepts both git-SHA-shaped and jj-change-id-shaped
        // strings and validates the surface shape. The backend's
        // `refs.exists()` returns false on unknown IDs; we treat any throw
        // as nonexistent too (covers malformed inputs and exotic backend
        // errors). The match is then emitted verbatim by `migrateContent`.
        sourceExists = deps.vcs.refs.exists(expr.rev(id));
      } catch {
        sourceExists = false;
      }
      if (!sourceExists) {
        result = { kind: 'skip' };
        cache.set(id, result);
        return result;
      }

      // ─── Step 2: target-side direct translation ───────────────────────
      try {
        // Direct translation: source-VCS id → target-VCS id.
        //   git→jj: source ID is a git SHA, target is jj change_id → changeIdOf
        //   jj→git: source ID is a jj change_id, target is git SHA → commitIdOf
        const targetId =
          deps.direction === 'git→jj'
            ? changeIdOf(deps.cwd, id)
            : commitIdOf(deps.cwd, id);
        result = { kind: 'resolved', targetId };
      } catch (err) {
        if (err instanceof VcsExecError) {
          // ─── Step 3: ancestor walk for legitimate orphans ──────────────
          // The ID exists on source but has no direct target counterpart
          // (e.g. the source-side history was rewritten post-migration).
          // Walk ancestors via `orphan.ts:resolveAncestor`.
          const walked = await deps.ancestor(deps.vcs, deps.cwd, id, deps.direction);
          result =
            walked === null
              ? { kind: 'unresolvable' }
              : {
                  kind: 'ancestor',
                  targetId: walked.ancestor,
                  childrenInTarget: walked.childrenInTarget,
                };
        } else {
          throw err;
        }
      }

      cache.set(id, result);
      return result;
    },
  };
}

/**
 * Wrap a populated cache as a synchronous resolver suitable for
 * `migrateContent`. Throws on cache miss — the caller is responsible for
 * pre-populating every ID the rewrite loop will see (via the async pre-pass
 * in `run.ts`).
 *
 * Exposed for run.ts's two-phase flow; also useful in tests that want to
 * pin a deterministic resolution map without running an async resolver.
 */
export function syncResolveFromCache(
  cache: Map<string, ResolveResult>,
): (id: string) => ResolveResult {
  return (id: string): ResolveResult => {
    const hit = cache.get(id);
    if (hit === undefined) {
      throw new Error(
        `syncResolveFromCache: cache miss for '${id}' — async pre-pass must populate every ID before sync rewrite`,
      );
    }
    return hit;
  };
}
