/**
 * parse-worktree-list.test.ts (CR-04 + WR-03)
 *
 * Unit-tests the SDK-local porcelain parser that replaced the cross-package
 * `require('../../../../get-shit-done/bin/lib/worktree-safety.cjs')` seam.
 * The fixtures here are synthetic porcelain strings (no real git repo
 * required) so we can exhaustively assert HEAD/locked/branch capture
 * without depending on the host git's worktree-list output shape.
 */

import { describe, it, expect } from 'vitest';

import { parseWorktreePorcelainEntries } from '../parse/worktree-list.js';

describe('parseWorktreePorcelainEntries (CR-04 / WR-03)', () => {
  it('parses a single entry with HEAD and branch', () => {
    const porcelain =
      'worktree /tmp/repo\nHEAD deadbeefcafebabedeadbeefcafebabedeadbeef\nbranch refs/heads/main\n';
    const r = parseWorktreePorcelainEntries(porcelain);
    expect(r).toEqual([
      {
        path: '/tmp/repo',
        head: 'deadbeefcafebabedeadbeefcafebabedeadbeef',
        branch: 'main',
        locked: false,
      },
    ]);
  });

  it('parses multiple entries separated by blank lines', () => {
    const porcelain =
      'worktree /tmp/repo\nHEAD aaaa\nbranch refs/heads/main\n\n' +
      'worktree /tmp/repo-wt\nHEAD bbbb\nbranch refs/heads/feature/x\n';
    const r = parseWorktreePorcelainEntries(porcelain);
    expect(r.length).toBe(2);
    expect(r[0].path).toBe('/tmp/repo');
    expect(r[1].path).toBe('/tmp/repo-wt');
    expect(r[1].branch).toBe('feature/x');
  });

  it('captures `locked` (presence-only) and `locked <reason>`', () => {
    const porcelainPresenceOnly =
      'worktree /tmp/wt-a\nHEAD aaaa\nbranch refs/heads/a\nlocked\n';
    const porcelainWithReason =
      'worktree /tmp/wt-b\nHEAD bbbb\nbranch refs/heads/b\nlocked manual\n';
    expect(parseWorktreePorcelainEntries(porcelainPresenceOnly)[0].locked).toBe(true);
    expect(parseWorktreePorcelainEntries(porcelainWithReason)[0].locked).toBe(true);
  });

  it('detached worktree: branch is null but HEAD is captured', () => {
    const porcelain = 'worktree /tmp/detached\nHEAD aaaa\ndetached\n';
    const r = parseWorktreePorcelainEntries(porcelain);
    expect(r[0].branch).toBe(null);
    expect(r[0].head).toBe('aaaa');
    expect(r[0].locked).toBe(false);
  });

  it('skips blocks with no `worktree <path>` header', () => {
    const porcelain = 'note: this is not a worktree block\n\nworktree /tmp/repo\nHEAD aaaa\n';
    const r = parseWorktreePorcelainEntries(porcelain);
    expect(r.length).toBe(1);
    expect(r[0].path).toBe('/tmp/repo');
  });

  it('returns [] for empty/garbage input', () => {
    expect(parseWorktreePorcelainEntries('')).toEqual([]);
    expect(parseWorktreePorcelainEntries('\n\n')).toEqual([]);
  });
});
