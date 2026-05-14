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
 * On `VcsExecError`, the async resolver delegates to `deps.ancestor(...)` (the
 * `orphan.ts:resolveAncestor` walker). On null ancestor → `unresolvable`.
 */

import { commitIdOf, changeIdOf } from '../parse/jj-id.js';
import { VcsExecError } from '../exec.js';
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
          // Unknown on the target side — walk ancestors.
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
