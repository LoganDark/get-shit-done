/**
 * Unit tests for logQuery (Plan 05-01 Task 2, D-33 batch 1).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const logMock = vi.fn();
const createVcsAdapterMock = vi.fn();

vi.mock('../vcs/index.js', () => ({
  createVcsAdapter: (...a: unknown[]) => createVcsAdapterMock(...a),
}));

import { logQuery } from './log.js';

beforeEach(() => {
  logMock.mockReset();
  createVcsAdapterMock.mockReset();
  createVcsAdapterMock.mockReturnValue({
    kind: 'git',
    log: logMock,
  });
  logMock.mockReturnValue([{ hash: 'abc1234', parents: [], author: 'x', date: '2026', subject: 's' }]);
});

describe('logQuery', () => {
  it('dispatches with no flags', async () => {
    const res = await logQuery([], '/repo');
    expect(logMock).toHaveBeenCalledWith({ maxCount: undefined, allRefs: false, rev: undefined });
    expect(res.data).toMatchObject({ ok: true });
  });

  it('parses --max-count, --all, --range', async () => {
    await logQuery(['--max-count', '5', '--all', '--range', 'HEAD~5..HEAD'], '/repo');
    expect(logMock).toHaveBeenCalledWith({ maxCount: 5, allRefs: true, rev: 'HEAD~5..HEAD' });
  });

  it('ignores invalid --max-count value', async () => {
    await logQuery(['--max-count', 'not-a-number'], '/repo');
    expect(logMock).toHaveBeenCalledWith({ maxCount: undefined, allRefs: false, rev: undefined });
  });

  it('honours --cwd', async () => {
    await logQuery(['--cwd', '/other'], '/repo');
    expect(createVcsAdapterMock).toHaveBeenCalledWith('/other');
  });

  it('returns entries from adapter', async () => {
    const res = await logQuery([], '/repo');
    expect((res.data as { entries: unknown[] }).entries).toHaveLength(1);
  });
});
