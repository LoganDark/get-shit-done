/**
 * format-migration/types.ts — public types for the .planning/ SHA↔change_id rewriter.
 *
 * Plan 06-02 deliverable. Wave 2 (orchestration substrate consumed by 06-03's
 * SDK verb handler and 06-04's BROWN-01 dogfood).
 *
 * Cross-references:
 *   - 06-RESEARCH.md §"Pattern 1: Regex-Pluck" + §"Pattern 2: Orphan Ancestor Walk"
 *   - 06-CONTEXT.md D-01 (orphan-handling policy)
 *   - 06-CONTEXT.md D-04 (idempotency invariants .1/.2/.3)
 *   - 06-RESEARCH.md §Open Q #4 (idempotency probe via commit-message marker)
 */

/**
 * Direction of migration. The arrow encodes "source → target":
 *   - 'git→jj': rewriter looks for git SHAs and replaces with jj change_ids.
 *   - 'jj→git': rewriter looks for jj change_ids and replaces with git SHAs.
 */
export type MigrationDirection = 'git→jj' | 'jj→git';

/**
 * Result of a single ID resolution attempt against the target VCS.
 *
 *   - 'resolved': direct hit; `targetId` holds the counterpart ID in the target VCS.
 *   - 'ancestor': the source ID has no direct target counterpart, but a source-side
 *                 ancestor does; `targetId` is the ancestor's target ID, and
 *                 `childrenInTarget` lists that ancestor's direct children in the
 *                 target VCS (jj-side only; empty on git target — see orphan.ts).
 *   - 'unresolvable': ancestor walk hit the root without finding a counterpart.
 */
export interface ResolveResult {
  kind: 'resolved' | 'ancestor' | 'unresolvable';
  targetId?: string;
  childrenInTarget?: string[];
}

/**
 * Orphan record — one per match that resolved to 'ancestor' or 'unresolvable'.
 * Captured by rewrite.ts and aggregated by run.ts, then emitted by report.ts
 * into `.planning/intel/06-migration-report.md`.
 */
export interface Orphan {
  /** Original ID as it appeared in source-content (pre-rewrite). */
  original: string;
  /** For kind='ancestor', the resolved ancestor's target-VCS ID. Undefined otherwise. */
  resolved?: string;
  /** Direct children of `resolved` in the target VCS (jj-only; empty on git target). */
  childrenInTarget?: string[];
  /** Byte offset within the source file where `original` was matched (regex match.index). */
  offset: number;
  /** Absolute path of the file containing the orphan match. */
  filePath: string;
  kind: 'ancestor' | 'unresolvable';
}

/**
 * Top-level result returned by runMigration. Stable shape consumed by:
 *   - 06-03 SDK verb handler (envelope wrapper)
 *   - 06-04 BROWN-01 dogfood assertions
 */
export interface MigrationResult {
  ok: true;
  /** false when marker-probe fast-exit triggered (RESEARCH Open Q #4 Option A). */
  migrated: boolean;
  filesChanged: number;
  filesScanned: number;
  orphans: {
    count: number;
    ancestorResolved: number;
    unresolvable: number;
    reportPath: string;
  };
  /** Adapter recorded in config.json before the migration; 'absent' if config absent. */
  previousAdapter: 'git' | 'jj' | 'absent';
  /** Adapter recorded in config.json after the migration. */
  newAdapter: 'git' | 'jj';
  commitHash: string;
}

/**
 * Caller-supplied options.
 *
 *   - force: bypass pre-flight dirty/conflicts refusal (RESEARCH Pitfall 4)
 *   - native: opaque to the rewriter; used by 06-03 verb handler when --native
 *             is set (jj init --no-colocate path); kept here so the type is
 *             stable as the verb evolves.
 *   - workstream: forwards to planningPaths(projectDir, workstream).
 */
export interface RunMigrationOpts {
  force?: boolean;
  native?: boolean;
  workstream?: string;
}

/**
 * Stable commit-message marker embedded in every migration commit. The marker
 * lets `run.ts` cheaply detect a prior migration via `vcs.log({maxCount:1})`
 * subject inspection (RESEARCH Open Q #4 Option A) — no need to scan all
 * `.planning/` files to discover the prior migration ran to commit.
 *
 * The version suffix `v1` is intentional — if the rewriter's encoding ever
 * changes (e.g., a different breadcrumb syntax), bump to `v2` so old commits
 * remain probe-able as "v1 migration ran" without colliding with the new shape.
 */
export const MIGRATION_COMMIT_MARKER = '[gsd-migrate-vcs v1]';
