/**
 * Unit tests for branchListQuery (Plan 05-01 Task 2, D-33 batch 1).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const listMock = vi.fn();
const createVcsAdapterMock = vi.fn();

vi.mock('../vcs/index.js', () => ({
  createVcsAdapter: (...a: unknown[]) => createVcsAdapterMock(...a),
}));

import { branchListQuery } from './branch-list.js';

beforeEach(() => {
  listMock.mockReset();
  createVcsAdapterMock.mockReset();
  createVcsAdapterMock.mockReturnValue({
    kind: 'git',
    refs: { bookmarks: { list: listMock } },
  });
  listMock.mockReturnValue([
    { name: 'main', rev: 'abc' },
    { name: 'gsd/phase-5', rev: 'def' },
    { name: 'feature/x', rev: 'ghi' },
  ]);
});

describe('branchListQuery', () => {
  it('returns all bookmarks with no flags', async () => {
    const res = await branchListQuery([], '/repo');
    expect(listMock).toHaveBeenCalled();
    expect((res.data as { bookmarks: unknown[] }).bookmarks).toHaveLength(3);
  });

  it('applies --prefix client-side filter', async () => {
    const res = await branchListQuery(['--prefix', 'gsd/'], '/repo');
    const bookmarks = (res.data as { bookmarks: { name: string }[] }).bookmarks;
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].name).toBe('gsd/phase-5');
  });

  it('rejects --prefix that fails validateRefname', async () => {
    const res = await branchListQuery(['--prefix', '-D'], '/repo');
    expect(listMock).not.toHaveBeenCalled();
    expect(res.data).toMatchObject({ ok: false });
  });

  it('honours --cwd', async () => {
    await branchListQuery(['--cwd', '/other'], '/repo');
    expect(createVcsAdapterMock).toHaveBeenCalledWith('/other');
  });
});
