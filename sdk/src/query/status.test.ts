/**
 * Unit tests for statusQuery (Plan 05-01 Task 2, D-33 batch 1).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const statusMock = vi.fn();
const createVcsAdapterMock = vi.fn();

vi.mock('../vcs/index.js', () => ({
  createVcsAdapter: (...a: unknown[]) => createVcsAdapterMock(...a),
}));

import { statusQuery } from './status.js';

beforeEach(() => {
  statusMock.mockReset();
  createVcsAdapterMock.mockReset();
  createVcsAdapterMock.mockReturnValue({ kind: 'git', status: statusMock });
  statusMock.mockReturnValue({ entries: [], raw: '' });
});

describe('statusQuery', () => {
  it('dispatches with no flags (porcelain: false)', async () => {
    const res = await statusQuery([], '/repo');
    expect(statusMock).toHaveBeenCalledWith({ porcelain: false });
    expect(res.data).toMatchObject({ ok: true, porcelain: false });
  });

  it('parses --porcelain', async () => {
    await statusQuery(['--porcelain'], '/repo');
    expect(statusMock).toHaveBeenCalledWith({ porcelain: true });
  });

  it('accepts --short as alias for --porcelain', async () => {
    await statusQuery(['--short'], '/repo');
    expect(statusMock).toHaveBeenCalledWith({ porcelain: true });
  });

  it('honours --cwd', async () => {
    await statusQuery(['--cwd', '/other'], '/repo');
    expect(createVcsAdapterMock).toHaveBeenCalledWith('/other');
  });

  it('returns entries + raw from adapter', async () => {
    statusMock.mockReturnValue({ entries: [{ path: 'a', worktree: 'M' }], raw: ' M a\n' });
    const res = await statusQuery(['--porcelain'], '/repo');
    expect((res.data as { entries: unknown[]; raw: string }).entries).toHaveLength(1);
    expect((res.data as { raw: string }).raw).toBe(' M a\n');
  });
});
