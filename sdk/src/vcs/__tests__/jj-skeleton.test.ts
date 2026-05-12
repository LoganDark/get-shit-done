/**
 * Phase 3 plan 03-01 Task 3: jj.ts skeleton + parser stub tests.
 *
 * Verifies:
 *   - createJjAdapter returns a frozen JjVcsAdapter with kind='jj' + cwd.
 *   - Every contract verb throws VcsNotImplementedError (D-08 stub shape).
 *   - refs.head / refs.parent are pure revexprs (no throw).
 *   - The returned adapter has NO gitOnly property (JjVcsAdapter contract).
 *   - Parser stubs return [] on empty input.
 */

import { describe, it, expect } from 'vitest';
import { createJjAdapter } from '../backends/jj.js';
import { expr } from '../expr.js';
import { __vcsTestOnly, VcsNotImplementedError } from '../types.js';
import { parseJjLog } from '../parse/jj-log.js';
import { parseJjOpLog } from '../parse/jj-op-log.js';
import { parseJjWorkspaceList } from '../parse/jj-workspace-list.js';

describe('Phase 3 plan 03-01: jj.ts skeleton', () => {
  const vcs = createJjAdapter('/tmp/never-exists');

  it('has kind=jj and the requested cwd', () => {
    expect(vcs.kind).toBe('jj');
    expect(vcs.cwd).toBe('/tmp/never-exists');
  });

  it('has no gitOnly property', () => {
    expect('gitOnly' in vcs).toBe(false);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(vcs)).toBe(true);
  });

  it('refs.head and refs.parent are revexprs (no throw)', () => {
    expect(vcs.refs.head).toBe(expr.head());
    expect(vcs.refs.parent).toBe(expr.parent());
  });

  // Top-level verbs
  it('commit() throws VcsNotImplementedError', () => {
    expect(() => vcs.commit({ message: 'x' })).toThrow(VcsNotImplementedError);
  });
  it('log() throws VcsNotImplementedError', () => {
    expect(() => vcs.log()).toThrow(VcsNotImplementedError);
  });
  it('status() throws VcsNotImplementedError', () => {
    expect(() => vcs.status()).toThrow(VcsNotImplementedError);
  });
  it('diff() throws VcsNotImplementedError', () => {
    expect(() => vcs.diff()).toThrow(VcsNotImplementedError);
  });
  it('findConflicts() throws VcsNotImplementedError', () => {
    expect(() => vcs.findConflicts({ scope: 'all' })).toThrow(VcsNotImplementedError);
  });
  it('push() throws VcsNotImplementedError', () => {
    expect(() => vcs.push()).toThrow(VcsNotImplementedError);
  });
  it('fetch() throws VcsNotImplementedError', () => {
    expect(() => vcs.fetch()).toThrow(VcsNotImplementedError);
  });

  // refs.bookmarks namespace
  it('refs.bookmarks.list() throws VcsNotImplementedError', () => {
    expect(() => vcs.refs.bookmarks.list()).toThrow(VcsNotImplementedError);
  });
  it('refs.bookmarks.create() throws VcsNotImplementedError', () => {
    expect(() => vcs.refs.bookmarks.create('x', expr.head())).toThrow(VcsNotImplementedError);
  });
  it('refs.bookmarks.move() throws VcsNotImplementedError', () => {
    expect(() => vcs.refs.bookmarks.move('x', expr.head())).toThrow(VcsNotImplementedError);
  });
  it('refs.bookmarks.delete() throws VcsNotImplementedError', () => {
    expect(() => vcs.refs.bookmarks.delete('x')).toThrow(VcsNotImplementedError);
  });
  it('refs.bookmarks.exists() throws VcsNotImplementedError', () => {
    expect(() => vcs.refs.bookmarks.exists('x')).toThrow(VcsNotImplementedError);
  });
  it('refs.bookmarks.switch() throws VcsNotImplementedError', () => {
    expect(() => vcs.refs.bookmarks.switch('x')).toThrow(VcsNotImplementedError);
  });

  // refs.* other
  it('refs.currentBookmarks() throws VcsNotImplementedError', () => {
    expect(() => vcs.refs.currentBookmarks()).toThrow(VcsNotImplementedError);
  });
  it('refs.resolveShort() throws VcsNotImplementedError', () => {
    expect(() => vcs.refs.resolveShort(expr.head())).toThrow(VcsNotImplementedError);
  });
  it('refs.countCommits() throws VcsNotImplementedError', () => {
    expect(() => vcs.refs.countCommits({})).toThrow(VcsNotImplementedError);
  });
  it('refs.rootCommits() throws VcsNotImplementedError', () => {
    expect(() => vcs.refs.rootCommits({})).toThrow(VcsNotImplementedError);
  });
  it('refs.exists() throws VcsNotImplementedError', () => {
    expect(() => vcs.refs.exists(expr.head())).toThrow(VcsNotImplementedError);
  });
  it('refs.isIgnored() throws VcsNotImplementedError', () => {
    expect(() => vcs.refs.isIgnored('x')).toThrow(VcsNotImplementedError);
  });
  it('refs.remotes() throws VcsNotImplementedError', () => {
    expect(() => vcs.refs.remotes()).toThrow(VcsNotImplementedError);
  });

  // workspace
  it('workspace.add() throws VcsNotImplementedError', () => {
    expect(() => vcs.workspace.add({ path: '/x' })).toThrow(VcsNotImplementedError);
  });
  it('workspace.forget() throws VcsNotImplementedError', () => {
    expect(() => vcs.workspace.forget('/x')).toThrow(VcsNotImplementedError);
  });
  it('workspace.list() throws VcsNotImplementedError', () => {
    expect(() => vcs.workspace.list()).toThrow(VcsNotImplementedError);
  });
  it('workspace.context() throws VcsNotImplementedError', () => {
    expect(() => vcs.workspace.context()).toThrow(VcsNotImplementedError);
  });
  it('workspace.prune() throws VcsNotImplementedError', () => {
    expect(() => vcs.workspace.prune()).toThrow(VcsNotImplementedError);
  });

  // __vcsTestOnly
  it('__vcsTestOnly.snapshot/restore throw VcsNotImplementedError', () => {
    const t = (vcs as any)[__vcsTestOnly];
    expect(() => t.snapshot()).toThrow(VcsNotImplementedError);
    expect(() => t.restore({ id: 'x', kind: 'jj' })).toThrow(VcsNotImplementedError);
  });
});

describe('Phase 3 plan 03-01: parser stubs', () => {
  it('parseJjLog returns [] for empty input', () => {
    expect(parseJjLog('')).toEqual([]);
  });
  it('parseJjOpLog returns [] for empty input', () => {
    expect(parseJjOpLog('')).toEqual([]);
  });
  it('parseJjWorkspaceList returns [] for empty input', () => {
    expect(parseJjWorkspaceList('')).toEqual([]);
  });
});
