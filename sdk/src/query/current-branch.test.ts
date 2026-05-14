/**
 * Unit tests for currentBranchQuery (Plan 05-01 Task 2, D-33 batch 1).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const currentBookmarksMock = vi.fn();
const createVcsAdapterMock = vi.fn();

vi.mock('../vcs/index.js', () => ({
  createVcsAdapter: (...a: unknown[]) => createVcsAdapterMock(...a),
}));

import { currentBranchQuery } from './current-branch.js';

beforeEach(() => {
  currentBookmarksMock.mockReset();
  createVcsAdapterMock.mockReset();
  createVcsAdapterMock.mockReturnValue({
    kind: 'git',
    refs: { currentBookmarks: currentBookmarksMock },
  });
  currentBookmarksMock.mockReturnValue(['main']);
});

describe('currentBranchQuery', () => {
  it('returns bookmarks from adapter', async () => {
    const res = await currentBranchQuery([], '/repo');
    expect(currentBookmarksMock).toHaveBeenCalled();
    expect(res.data).toMatchObject({ ok: true, bookmarks: ['main'] });
  });

  it('returns empty array for detached/anonymous head', async () => {
    currentBookmarksMock.mockReturnValue([]);
    const res = await currentBranchQuery([], '/repo');
    expect((res.data as { bookmarks: string[] }).bookmarks).toEqual([]);
  });

  it('honours --cwd', async () => {
    await currentBranchQuery(['--cwd', '/other'], '/repo');
    expect(createVcsAdapterMock).toHaveBeenCalledWith('/other');
  });
});
