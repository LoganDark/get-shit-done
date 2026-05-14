/**
 * Unit tests for diffQuery (Plan 05-01 Task 2, D-33 batch 1).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const diffMock = vi.fn();
const createVcsAdapterMock = vi.fn();

vi.mock('../vcs/index.js', () => ({
  createVcsAdapter: (...a: unknown[]) => createVcsAdapterMock(...a),
}));

import { diffQuery } from './diff.js';

beforeEach(() => {
  diffMock.mockReset();
  createVcsAdapterMock.mockReset();
  createVcsAdapterMock.mockReturnValue({ kind: 'git', diff: diffMock });
  diffMock.mockReturnValue({ raw: '', nameOnly: [], nameStatus: undefined });
});

describe('diffQuery', () => {
  it('dispatches with defaults', async () => {
    await diffQuery([], '/repo');
    expect(diffMock).toHaveBeenCalledWith({
      staged: false, nameOnly: false, nameStatus: false, rev: undefined, paths: undefined,
    });
  });

  it('parses --cached → staged, --range → rev, --name-only, --name-status', async () => {
    await diffQuery(['--cached', '--range', 'HEAD~1..HEAD', '--name-only', '--name-status'], '/repo');
    expect(diffMock).toHaveBeenCalledWith({
      staged: true, nameOnly: true, nameStatus: true, rev: 'HEAD~1..HEAD', paths: undefined,
    });
  });

  it('consumes trailing positionals after -- as paths', async () => {
    await diffQuery(['--name-only', '--', 'src/a.ts', 'src/b.ts'], '/repo');
    expect(diffMock).toHaveBeenCalledWith({
      staged: false, nameOnly: true, nameStatus: false, rev: undefined, paths: ['src/a.ts', 'src/b.ts'],
    });
  });

  it('honours --cwd', async () => {
    await diffQuery(['--cwd', '/other'], '/repo');
    expect(createVcsAdapterMock).toHaveBeenCalledWith('/other');
  });

  it('returns raw/nameOnly/nameStatus from adapter', async () => {
    diffMock.mockReturnValue({ raw: 'diff text', nameOnly: ['a'], nameStatus: [{ path: 'a', status: 'M' }] });
    const res = await diffQuery(['--name-status'], '/repo');
    expect(res.data).toMatchObject({ ok: true, raw: 'diff text', nameOnly: ['a'] });
  });
});
