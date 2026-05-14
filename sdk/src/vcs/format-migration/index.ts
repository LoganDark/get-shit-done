/**
 * format-migration — public barrel.
 *
 * Plan 06-03 (SDK verb handler) imports `runMigration` and types from this
 * module. Internal modules (walk/rewrite/resolve/orphan/report) are NOT
 * re-exported — they are implementation details of the runMigration pipeline.
 */

export { runMigration } from './run.js';
export type {
  MigrationResult,
  MigrationDirection,
  Orphan,
  ResolveResult,
  RunMigrationOpts,
} from './types.js';
export { MIGRATION_COMMIT_MARKER } from './types.js';
