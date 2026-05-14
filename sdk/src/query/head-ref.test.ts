/**
 * Unit tests for headRefQuery (Plan 05-01 Task 2, D-33 batch 1).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const resolveShortMock = vi.fn();
const createVcsAdapterMock = vi.fn();

vi.mock('../vcs/index.js', () => ({
  createVcsAdapter: (...a: unknown[]) => createVcsAdapterMock(...a),
}));

import { headRefQuery } from './head-ref.js';

beforeEach(() => {
  resolveShortMock.mockReset();
  createVcsAdapterMock.mockReset();
  createVcsAdapterMock.mockReturnValue({
    kind: 'git',
    refs: { head: 'HEAD', resolveShort: resolveShortMock },
  });
  resolveShortMock.mockReturnValue('abc1234');
});

describe('headRefQuery', () => {
  it('returns the resolved short head', async () => {
    const res = await headRefQuery([], '/repo');
    expect(resolveShortMock).toHaveBeenCalledWith('HEAD');
    expect(res.data).toMatchObject({ ok: true, head: 'abc1234' });
  });

  it('honours --cwd', async () => {
    await headRefQuery(['--cwd', '/other'], '/repo');
    expect(createVcsAdapterMock).toHaveBeenCalledWith('/other');
  });
});
