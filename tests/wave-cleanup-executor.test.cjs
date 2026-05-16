'use strict';
/**
 * Phase 11 Plan 03 (D-05): wave-cleanup executor regression tests, flipped
 * to assert the new fanIn-delegation behavior shape.
 *
 * Per Phase 11 D-05, the 7 pre-merge guards retired; reason taxonomy on
 * `pending[]` is now:
 *   - 'merge_conflict'      — FanInResult.conflictedPaths
 *   - 'crashed_agent'       — FanInResult.failedReaped
 *   - 'incomplete_queued'   — FanInResult.incompleteQueued > 0
 *   - 'unexpected_error'    — adapter threw
 *
 * Test strategy:
 *   1. Empty-plan contract preserved EXACTLY — new body still returns the
 *      same shape (no adapter call required).
 *   2. Original "branch-drift" regression INTENT (catch executor-side guard
 *      violations) preserved via option (b) — mock the adapter at the
 *      `_deps.vcs` boundary so we drive a synthetic FanInResult that
 *      surfaces the equivalent failure as `merge_conflict`. The MOCK
 *      adapter replaces the seven inline guards; the regression survives
 *      as "non-clean FanInResult → non-empty pending[] with the correct
 *      reason taxonomy."
 *   3. Clean-merge contract preserved via a mock FanInResult that reports
 *      no conflicts / no failed reaps — body must return ok:true.
 *
 * The previous live-fixture-driven branch-drift + happy-path tests on real
 * adapters belonged to the per-entry-guard era; with the body delegating
 * to a single SDK primitive, the executor's contract is best exercised
 * via the adapter-mock boundary it was designed to expose (ADR-0004
 * `_deps={}` seam).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const wsafety = require('../get-shit-done/bin/lib/worktree-safety.cjs');

function makeMockVcs(fanInImpl) {
  return {
    workspace: {
      parallel: {
        fanIn: fanInImpl,
      },
    },
  };
}

test('empty-plan returns ok:true with reason:empty_plan', () => {
  // PRESERVED CONTRACT (Phase 7 WAVE-01 -> Phase 11 D-05): empty entries
  // returns the same shape on the new code path. No adapter call needed.
  const r = wsafety.executeWorktreeWaveCleanupPlan(
    { entries: [], action: 'skip', repoRoot: '/repo/main' },
  );
  assert.equal(r.ok, true);
  assert.equal(r.reason, 'empty_plan');
  assert.deepEqual(r.entries, []);
  assert.deepEqual(r.pending, []);
});

test('clean fanIn -> ok:true, pending empty (Phase 11 D-05 happy path)', () => {
  // Mock the adapter at the ADR-0004 _deps={} seam: fanIn returns a
  // clean FanInResult. Body must surface ok:true and no pending entries.
  let captured;
  const vcs = makeMockVcs((handle, results) => {
    captured = { handle, results };
    return {
      merged: ['abc123'],
      conflicted: false,
      conflictedPaths: [],
      incompleteQueued: 0,
      failedReaped: [],
      surplusBookmarks: [],
    };
  });
  const plan = {
    repoRoot: '/repo/main',
    action: 'cleanup_wave',
    phaseNumber: 11,
    entries: [{
      worktree_path: '/repo/.claude/worktrees/agent-a1',
      branch: 'worktree-agent-a1',
      expected_base: 'abc123',
      main_bookmark: 'main',
    }],
  };
  const r = wsafety.executeWorktreeWaveCleanupPlan(plan, { vcs });
  assert.equal(r.ok, true);
  assert.equal(r.pending.length, 0);
  assert.equal(r.entries.length, 1);
  // The synthetic Handle was reconstructed with workspaces of the right shape.
  assert.equal(captured.handle.workspaces.length, 1);
  assert.equal(captured.handle.workspaces[0].path, '/repo/.claude/worktrees/agent-a1');
  assert.equal(captured.handle.workspaces[0].baseRev, 'abc123');
  assert.equal(captured.handle.workspaces[0].agentId, 'a1');
  // Results array sized to entries; default exitCode 0 per Plan 11.03 A3.
  assert.equal(captured.results.length, 1);
  assert.equal(captured.results[0].exitCode, 0);
  assert.equal(captured.results[0].agentId, 'a1');
});

test('merge-conflict fanIn -> ok:false, pending[merge_conflict] (regression INTENT preserved per A3)', () => {
  // Per Phase 11 D-05 the 7 pre-merge guards retire; original 'branch_drift'
  // reason is no longer producible. The regression INTENT (catch executor
  // pre-merge guard violations) survives as "non-clean FanInResult surfaces
  // a meaningful pending[] entry with the new taxonomy."
  //
  // Option (b) flip from Plan 11-03 Task 2: drive a synthetic
  // 'merge-in-tree-conflict' via the mocked adapter — the regression INTENT
  // is preserved, the SHAPE moves to the adapter boundary.
  const vcs = makeMockVcs(() => ({
    merged: [],
    conflicted: true,
    conflictedPaths: ['src/foo.ts', 'src/bar.ts'],
    incompleteQueued: 0,
    failedReaped: [],
    surplusBookmarks: [],
  }));
  const plan = {
    repoRoot: '/repo/main',
    action: 'cleanup_wave',
    phaseNumber: 11,
    entries: [{
      worktree_path: '/repo/.claude/worktrees/agent-a1',
      branch: 'worktree-agent-a1',
      expected_base: 'abc123',
      main_bookmark: 'main',
    }],
  };
  const r = wsafety.executeWorktreeWaveCleanupPlan(plan, { vcs });
  assert.equal(r.ok, false);
  assert.equal(r.pending.length, 2);
  for (const p of r.pending) {
    assert.equal(p.reason, 'merge_conflict');
    assert.ok(typeof p.file === 'string' && p.file.length > 0);
  }
});

test('failed-reap fanIn -> ok:false, pending[crashed_agent] (new reason per A3)', () => {
  // FanInResult.failedReaped surfaces as a new 'crashed_agent' pending entry.
  // This is the post-D-05 producible reason that replaces the prior
  // 'unexpected_error'-via-thrown-merge case.
  const vcs = makeMockVcs(() => ({
    merged: [],
    conflicted: false,
    conflictedPaths: [],
    incompleteQueued: 0,
    failedReaped: ['a1', 'a2'],
    surplusBookmarks: [],
  }));
  const plan = {
    repoRoot: '/repo/main',
    action: 'cleanup_wave',
    phaseNumber: 11,
    entries: [
      { worktree_path: '/wt/a1', branch: 'worktree-agent-a1', expected_base: 'abc', main_bookmark: 'main' },
      { worktree_path: '/wt/a2', branch: 'worktree-agent-a2', expected_base: 'abc', main_bookmark: 'main' },
    ],
  };
  const r = wsafety.executeWorktreeWaveCleanupPlan(plan, { vcs });
  assert.equal(r.ok, false);
  assert.equal(r.pending.length, 2);
  for (const p of r.pending) {
    assert.equal(p.reason, 'crashed_agent');
    assert.ok(typeof p.subagentName === 'string');
  }
});

test('incomplete-queued fanIn -> pending[incomplete_queued] surfaced once', () => {
  const vcs = makeMockVcs(() => ({
    merged: ['abc'],
    conflicted: false,
    conflictedPaths: [],
    incompleteQueued: 3,
    failedReaped: [],
    surplusBookmarks: [],
  }));
  const plan = {
    repoRoot: '/repo/main',
    action: 'cleanup_wave',
    phaseNumber: 11,
    entries: [{
      worktree_path: '/wt/a1',
      branch: 'worktree-agent-a1',
      expected_base: 'abc',
      main_bookmark: 'main',
    }],
  };
  const r = wsafety.executeWorktreeWaveCleanupPlan(plan, { vcs });
  // ok stays true (no conflict, no failed reap) but pending carries the queued tally.
  assert.equal(r.ok, true);
  assert.equal(r.pending.length, 1);
  assert.equal(r.pending[0].reason, 'incomplete_queued');
  assert.equal(r.pending[0].count, 3);
});

test('adapter throw -> pending[unexpected_error], ok:false', () => {
  const vcs = makeMockVcs(() => {
    throw new Error('synthetic adapter failure');
  });
  const plan = {
    repoRoot: '/repo/main',
    action: 'cleanup_wave',
    phaseNumber: 11,
    entries: [{
      worktree_path: '/wt/a1',
      branch: 'worktree-agent-a1',
      expected_base: 'abc',
      main_bookmark: 'main',
    }],
  };
  const r = wsafety.executeWorktreeWaveCleanupPlan(plan, { vcs });
  assert.equal(r.ok, false);
  assert.deepEqual(r.entries, []);
  assert.equal(r.pending.length, 1);
  assert.equal(r.pending[0].reason, 'unexpected_error');
  assert.ok(/synthetic adapter failure/.test(r.pending[0].message));
});
