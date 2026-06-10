'use strict';

/**
 * Regression test for #2384.
 *
 * During execute-phase, the orchestrator merges per-plan worktree branches into
 * main. The pre-merge deletion check (git diff --diff-filter=D HEAD...WT_BRANCH)
 * only catches files deleted on the worktree branch. A post-merge audit is also
 * required to catch deletions that made it into the merge commit (e.g., files
 * that were in the common ancestor but deleted by the merged worktree) and to
 * provide a revert safety net.
 *
 * After #3797: execute-phase.md delegates worktree cleanup to the SDK's
 * worktree.cleanup-wave command, which implements pre-merge deletion checks
 * (diff --diff-filter=D) internally via executeWorktreeWaveCleanupPlan.
 * The manual post-merge shell audit (MERGE_DEL_COUNT, git reset --hard) has
 * been removed from the workflow — it was part of the SDK-absence fallback.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const EXECUTE_PHASE = path.join(
  __dirname, '..', 'gsd-core', 'workflows', 'execute-phase.md'
);

/**
 * Parse execute-phase.md into a structured contract object.
 * Returns typed boolean fields so tests can assert on structure
 * rather than raw text.
 */
function parseExecutePhaseContract(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  return {
    // 19-12 (jj fork): wave merge + deletion audit are delegated to the
    // cross-backend workspace.parallel.fan-in verb (Phase 11 rewiring;
    // worktree.cleanup-wave is its git-substrate ancestor). The deletion
    // audit itself moved to the per-commit `query diff --name-status`
    // D-filter in agents/gsd-executor.md (D-06).
    delegatesToCleanupWave: lines.some(l => l.includes('workspace.parallel.fan-in')),
    // Fail-closed: the fan-in result guard exits 1 on conflicted/failedReaped
    // rather than swallowing SDK refusals.
    cleanupWaveFailClosed:
      /\[ "\$CONFLICTED" = "true" \] \|\| \[ "\$FAILED_REAPED" -gt 0 \][\s\S]{0,200}?exit 1/.test(content),
    // Does the workflow export/reference WAVE_WORKTREE_MANIFEST for the SDK?
    passesWaveManifest: lines.some(l => l.includes('WAVE_WORKTREE_MANIFEST')),
  };
}

describe('execute-phase.md — post-merge deletion audit (#2384)', () => {
  const contract = parseExecutePhaseContract(EXECUTE_PHASE);

  test('execute-phase delegates wave merge to workspace.parallel.fan-in (which handles deletion audit)', () => {
    // After #3797 the audit lived in worktree.cleanup-wave; the jj fork's
    // Phase 11 rewiring (re-applied 19-08) delegates to the cross-backend
    // workspace.parallel.fan-in verb instead, and the per-commit deletion
    // audit lives in gsd-executor.md's `query diff --name-status` D-filter.
    assert.ok(
      contract.delegatesToCleanupWave,
      'execute-phase.md must delegate to gsd_run query workspace.parallel.fan-in (#2384/#3797; 19-12 re-point)',
    );
  });

  test('execute-phase fan-in guard exits 1 (fail-closed for blocked merges)', () => {
    // If fan-in reports conflicted or failedReaped, the workflow exits 1
    // rather than swallowing the refusal.
    assert.ok(
      contract.cleanupWaveFailClosed,
      'execute-phase.md must exit 1 on conflicted/failedReaped fan-in results (#2384/#3797; 19-12 re-point)',
    );
  });

  test('execute-phase still has pre-merge deletion check (via guard before worktree.cleanup-wave)', () => {
    // The primary deletion guard is now in worktree-safety.cjs (SDK).
    // The workflow must still enforce WAVE_WORKTREE_MANIFEST so the SDK
    // has the info it needs to validate branches.
    assert.ok(
      contract.passesWaveManifest,
      'execute-phase.md must pass WAVE_WORKTREE_MANIFEST to worktree.cleanup-wave',
    );
  });
});
