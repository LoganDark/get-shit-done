/**
 * format-migration/__tests__/orphan.test.ts — mocked-adapter vitest for
 * resolveAncestor. NO jj binary needed; NO real filesystem state.
 *
 * Test strategy (analog: src/query/restore.test.ts:1-62 vi.mock pattern):
 *   - vi.mock '../parse/jj-id.js' to stub `commitIdOf` / `changeIdOf`
 *   - Build a synthetic `vcs.log` mock that returns canned parent chains
 *     based on the requested revset.
 *
 * Required cases (Task 2 done criteria — 5+):
 *   1. resolves orphan via 1-step ancestor walk
 *   2. returns null if walk hits source-VCS root
 *   3. walks past N intermediate non-resolving ancestors
 *   4. respects MAX_DEPTH safety bound
 *   5. jj→git direction: childrenInTarget is empty list (git has no children
 *      translator per plan 06-01 Task 2)
 *
 * NOTE: all IDs in these tests are shape-valid for `expr.rev`'s permissive
 * validator (/^[0-9a-fA-F]{4,40}$|^[k-z]{4,40}$/). The walker calls
 * expr.parents(expr.rev(cursor)) on every step, and the rev factory rejects
 * malformed inputs — so synthetic test IDs must look like real SHAs/change_ids.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock jj-id BEFORE importing orphan.ts so the resolver hooks land first.
const commitIdOfMock = vi.fn<(cwd: string, id: string) => string>();
const changeIdOfMock = vi.fn<(cwd: string, id: string) => string>();
vi.mock('../../parse/jj-id.js', () => ({
  commitIdOf: (cwd: string, id: string) => commitIdOfMock(cwd, id),
  changeIdOf: (cwd: string, id: string) => changeIdOfMock(cwd, id),
}));

import { resolveAncestor } from '../orphan.js';
import { VcsExecError } from '../../exec.js';
import type { VcsAdapter, LogEntry, LogOpts, RevisionExpr } from '../../types.js';

/** Build a VcsExecError with non-zero exit (the contract for "ID unknown"). */
function notFound(id: string): VcsExecError {
  return new VcsExecError(`unknown id ${id}`, {
    exitCode: 1,
    stdout: '',
    stderr: `revision '${id}' not found`,
    timedOut: false,
    args: [],
  });
}

/**
 * Build a minimal VcsAdapter mock with a programmable `log` impl. The
 * `logImpl` callback receives the structured LogOpts the SUT passes and
 * returns the canned LogEntry[] for that case.
 */
function mockAdapter(logImpl: (opts?: LogOpts) => LogEntry[]): VcsAdapter {
  const adapter = {
    kind: 'jj' as const,
    cwd: '/tmp/test',
    log: logImpl,
    // The rest of the VcsAdapter surface is unused by resolveAncestor; cast
    // through unknown to satisfy the type checker.
  } as unknown as VcsAdapter;
  return adapter;
}

beforeEach(() => {
  commitIdOfMock.mockReset();
  changeIdOfMock.mockReset();
});

describe('resolveAncestor — happy paths', () => {
  it('resolves orphan via 1-step ancestor walk (git→jj)', async () => {
    // Shape-valid synthetic SHA-like IDs for git→jj direction. Walker logs
    // `parents(rev(<id>))` to step one parent; then probes the parent in
    // target. On resolved-target it logs `children(rev(<targetId>))` to
    // capture children.
    const ORPHAN = 'abcd1234';
    const PARENT_HASH = 'deadbeef';
    const PARENT_CHANGE = 'kxnzlnrntwou';
    const CHILD_1 = 'lmnopqrstuvw';
    const CHILD_2 = 'mnopqrstuvwx';

    const logCalls: string[] = [];
    const vcs = mockAdapter((opts) => {
      const rev = (opts?.rev ?? '') as unknown as string;
      logCalls.push(rev);
      if (rev === `parents:rev:${ORPHAN}`) {
        return [{ hash: PARENT_HASH, parents: [], author: '', date: '', subject: '' }];
      }
      if (rev === `children:rev:${PARENT_CHANGE}`) {
        return [
          { hash: CHILD_1, parents: [], author: '', date: '', subject: '' },
          { hash: CHILD_2, parents: [], author: '', date: '', subject: '' },
        ];
      }
      return [];
    });
    // Mock: changeIdOf throws for the orphan, succeeds for the parent.
    changeIdOfMock.mockImplementation((_cwd: string, id: string) => {
      if (id === PARENT_HASH) return PARENT_CHANGE;
      throw notFound(id);
    });

    const result = await resolveAncestor(vcs, '/tmp/test', ORPHAN, 'git→jj');
    expect(result).toEqual({
      ancestor: PARENT_CHANGE,
      childrenInTarget: [CHILD_1, CHILD_2],
    });
    // Walker asked for parents (depth-1 via expr.parents) and then children
    // (depth-1 via expr.children).
    expect(logCalls).toEqual([
      `parents:rev:${ORPHAN}`,
      `children:rev:${PARENT_CHANGE}`,
    ]);
  });

  it('walks past N intermediate non-resolving ancestors (chain depth 3)', async () => {
    // orphan → p1 → p2 → p3 resolves. changeIdOf throws for p1, p2; returns for p3.
    const ORPHAN = 'abcd0001';
    const P1 = 'abcd0002';
    const P2 = 'abcd0003';
    const P3 = 'abcd0004';
    const P3_CHANGE = 'kxnzlnrntwou';

    const vcs = mockAdapter((opts) => {
      const rev = (opts?.rev ?? '') as unknown as string;
      if (rev === `parents:rev:${ORPHAN}`) return [{ hash: P1, parents: [], author: '', date: '', subject: '' }];
      if (rev === `parents:rev:${P1}`)     return [{ hash: P2, parents: [], author: '', date: '', subject: '' }];
      if (rev === `parents:rev:${P2}`)     return [{ hash: P3, parents: [], author: '', date: '', subject: '' }];
      if (rev === `children:rev:${P3_CHANGE}`) return [];
      return [];
    });
    changeIdOfMock.mockImplementation((_cwd, id) => {
      if (id === P3) return P3_CHANGE;
      throw notFound(id);
    });

    const result = await resolveAncestor(vcs, '/tmp/test', ORPHAN, 'git→jj');
    expect(result).toEqual({ ancestor: P3_CHANGE, childrenInTarget: [] });
    // Walked 3 parent steps before resolving.
    expect(changeIdOfMock).toHaveBeenCalledTimes(3);
  });
});

describe('resolveAncestor — null-returning paths', () => {
  it('returns null if walk hits source-VCS root (parent list empty)', async () => {
    // Empty parent list == hit root. resolveAncestor returns null without
    // calling changeIdOf at all (we never had a parent to probe).
    const ORPHAN = 'abcd9999';
    const vcs = mockAdapter(() => []);
    const result = await resolveAncestor(vcs, '/tmp/test', ORPHAN, 'git→jj');
    expect(result).toBeNull();
    expect(changeIdOfMock).not.toHaveBeenCalled();
  });

  it('respects MAX_DEPTH safety bound (orphan never resolves, walker terminates)', async () => {
    // Each step returns a fresh parent (shape-valid SHA-like); changeIdOf
    // always throws. The walker bounds at MAX_DEPTH=1000 and returns null.
    let stepCount = 0;
    const vcs = mockAdapter((opts) => {
      const rev = (opts?.rev ?? '') as unknown as string;
      if (rev.startsWith('parents:')) {
        stepCount++;
        // Generate a shape-valid SHA-shaped string.
        const hex = stepCount.toString(16).padStart(8, '0');
        return [{ hash: hex, parents: [], author: '', date: '', subject: '' }];
      }
      return [];
    });
    changeIdOfMock.mockImplementation((_cwd, id) => {
      throw notFound(id);
    });

    const result = await resolveAncestor(vcs, '/tmp/test', 'abcd0000', 'git→jj');
    expect(result).toBeNull();
    // Walker bounded at MAX_DEPTH=1000 — should NOT loop forever.
    expect(stepCount).toBe(1000);
    expect(changeIdOfMock).toHaveBeenCalledTimes(1000);
  });
});

describe('resolveAncestor — jj→git direction asymmetry', () => {
  it('jj→git: childrenInTarget is empty (git has no expr.children translator)', async () => {
    // jj→git uses commitIdOf (not changeIdOf); resolveAncestor skips the
    // expr.children lookup entirely because plan 06-01 Task 2 chose to throw
    // on the git side of expr.children. The walker leaves childrenInTarget=[].
    const ORPHAN = 'kxnzlnrntwou'; // jj change_id alphabet
    const PARENT_CHANGE = 'mnopqrstuvwx';
    const PARENT_SHA = 'deadbeef';

    const vcs = mockAdapter((opts) => {
      const rev = (opts?.rev ?? '') as unknown as RevisionExpr | undefined;
      const revStr = rev as unknown as string;
      if (revStr === `parents:rev:${ORPHAN}`) {
        return [{ hash: PARENT_CHANGE, parents: [], author: '', date: '', subject: '' }];
      }
      // jj→git never asks the adapter for `children:` — assert no other call.
      throw new Error(`unexpected log({ rev: ${String(rev)} })`);
    });
    commitIdOfMock.mockImplementation((_cwd, id) => {
      if (id === PARENT_CHANGE) return PARENT_SHA;
      throw notFound(id);
    });

    const result = await resolveAncestor(vcs, '/tmp/test', ORPHAN, 'jj→git');
    expect(result).toEqual({ ancestor: PARENT_SHA, childrenInTarget: [] });
  });
});

describe('resolveAncestor — non-VcsExecError errors propagate', () => {
  it('rethrows unexpected errors from commitIdOf/changeIdOf', async () => {
    const ORPHAN = 'abcd5555';
    const PARENT = 'deadbeef';
    const vcs = mockAdapter((opts) => {
      const rev = (opts?.rev ?? '') as unknown as string;
      if (rev === `parents:rev:${ORPHAN}`) {
        return [{ hash: PARENT, parents: [], author: '', date: '', subject: '' }];
      }
      return [];
    });
    changeIdOfMock.mockImplementation(() => {
      // Non-VcsExecError — should propagate, not be swallowed as "keep walking".
      throw new Error('boom: filesystem failure');
    });

    await expect(
      resolveAncestor(vcs, '/tmp/test', ORPHAN, 'git→jj'),
    ).rejects.toThrow(/boom: filesystem failure/);
  });
});
