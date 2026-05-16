// allow-test-rule: source-text-is-the-product
// Regression INTENT: don't broad-discover worktrees beyond the manifest /
// Handle scope (#3384). Per Phase 11 Plan 03 D-01, the WAVE_WORKTREE_MANIFEST
// mktemp sidecar is being eliminated; the regression INTENT is now satisfied
// by the `ParallelDispatchHandle.workspaces[]` field being the source of
// truth for which workspaces fanIn touches.

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const {
  planWorktreeWaveCleanup,
  executeWorktreeWaveCleanupPlan,
} = require('../get-shit-done/bin/lib/worktree-safety.cjs');

describe('bug #3384: worktree cleanup is manifest-scoped (Handle-scoped post Phase 11)', () => {
  test('cleanup plan includes only manifest entries and never discovers global agent worktrees', () => {
    const plan = planWorktreeWaveCleanup('/repo/main', {
      worktrees: [
        {
          agent_id: 'a1',
          worktree_path: '/repo/.claude/worktrees/agent-a1',
          branch: 'worktree-agent-a1',
          expected_base: 'abc123',
        },
      ],
    });

    assert.equal(plan.ok, true);
    assert.deepEqual(plan.entries.map((entry) => ({
      agent_id: entry.agent_id,
      worktree_path: entry.worktree_path,
      branch: entry.branch,
      expected_base: entry.expected_base,
    })), [{
      agent_id: 'a1',
      worktree_path: '/repo/.claude/worktrees/agent-a1',
      branch: 'worktree-agent-a1',
      expected_base: 'abc123',
    }]);
    assert.equal(plan.discovery, 'manifest');
  });

  test('cleanup plan rejects entries without expected base or disposable branch namespace', () => {
    const plan = planWorktreeWaveCleanup('/repo/main', {
      worktrees: [
        {
          agent_id: 'missing-base',
          worktree_path: '/repo/.claude/worktrees/agent-missing-base',
          branch: 'worktree-agent-missing-base',
        },
        {
          agent_id: 'feature-branch',
          worktree_path: '/repo/.claude/worktrees/agent-feature',
          branch: 'feature/user-work',
          expected_base: 'abc123',
        },
      ],
    });

    assert.equal(plan.ok, false);
    assert.equal(plan.reason, 'empty_manifest');
    assert.deepEqual(plan.entries, []);
  });

  test('executor calls vcs.workspace.parallel.fanIn with Handle.workspaces.length === N (Handle scope is source-of-truth)', () => {
    // Per Phase 11 D-01: the WAVE_WORKTREE_MANIFEST sidecar is eliminated; the
    // Handle's `workspaces[]` field is the source of truth for which workspaces
    // fanIn touches. The regression INTENT (don't broad-discover worktrees
    // beyond the declared scope) is now satisfied by verifying that the
    // synthetic Handle passed to fanIn contains exactly N entries — matching
    // the manifest, no more, no less.
    const fanInCalls = [];
    const mockVcs = {
      workspace: {
        parallel: {
          fanIn: (handle, results) => {
            fanInCalls.push({
              workspaceCount: handle.workspaces.length,
              workspacePaths: handle.workspaces.map((w) => w.path),
              workspaceAgentIds: handle.workspaces.map((w) => w.agentId),
              resultCount: results.length,
            });
            return {
              merged: ['abc'],
              conflicted: false,
              conflictedPaths: [],
              incompleteQueued: 0,
              failedReaped: [],
              surplusBookmarks: [],
            };
          },
        },
      },
    };

    const N = 3;
    const entries = [];
    for (let i = 1; i <= N; i++) {
      entries.push({
        agent_id: `a${i}`,
        worktree_path: `/repo/.claude/worktrees/agent-a${i}`,
        branch: `worktree-agent-a${i}`,
        expected_base: 'abc123',
        main_bookmark: 'main',
      });
    }
    const plan = {
      ok: true,
      repoRoot: '/repo/main',
      action: 'cleanup_wave',
      discovery: 'manifest',
      entries,
    };

    const result = executeWorktreeWaveCleanupPlan(plan, { vcs: mockVcs });
    assert.equal(result.ok, true);
    assert.equal(fanInCalls.length, 1, 'fanIn must be invoked exactly once');
    // Handle scope === manifest scope (no broad discovery).
    assert.equal(fanInCalls[0].workspaceCount, N);
    assert.deepEqual(fanInCalls[0].workspacePaths, [
      '/repo/.claude/worktrees/agent-a1',
      '/repo/.claude/worktrees/agent-a2',
      '/repo/.claude/worktrees/agent-a3',
    ]);
    assert.deepEqual(fanInCalls[0].workspaceAgentIds, ['a1', 'a2', 'a3']);
    // Results array shape mirrors the manifest scope (no extra entries).
    assert.equal(fanInCalls[0].resultCount, N);
  });

  test('executor preserves manifest-only scope: fanIn never receives workspaces outside the declared entries', () => {
    // Symmetric assertion: even with a small manifest the Handle scope is
    // strictly the entries we passed — no implicit discovery of sibling
    // worktree paths under `.claude/worktrees/`. This is the post-D-01
    // analog of the original #3384 regression which forbade `git worktree
    // list --porcelain | grep` style broad discovery.
    let observedScope = null;
    const mockVcs = {
      workspace: {
        parallel: {
          fanIn: (handle) => {
            observedScope = handle.workspaces.map((w) => w.path);
            return {
              merged: [],
              conflicted: false,
              conflictedPaths: [],
              incompleteQueued: 0,
              failedReaped: [],
              surplusBookmarks: [],
            };
          },
        },
      },
    };

    const plan = {
      ok: true,
      repoRoot: '/repo/main',
      action: 'cleanup_wave',
      discovery: 'manifest',
      entries: [{
        agent_id: 'only-one',
        worktree_path: '/repo/.claude/worktrees/agent-only-one',
        branch: 'worktree-agent-only-one',
        expected_base: 'abc123',
        main_bookmark: 'main',
      }],
    };

    executeWorktreeWaveCleanupPlan(plan, { vcs: mockVcs });
    assert.deepEqual(observedScope, ['/repo/.claude/worktrees/agent-only-one']);
  });
});
