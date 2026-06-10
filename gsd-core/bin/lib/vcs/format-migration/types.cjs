"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MIGRATION_COMMIT_MARKER = void 0;
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
exports.MIGRATION_COMMIT_MARKER = '[gsd-migrate-vcs v1]';
