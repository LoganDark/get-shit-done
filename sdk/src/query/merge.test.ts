/**
 * Unit tests for mergeQuery (Plan 05-01 Task 2, D-33 batch 1).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mergeMock = vi.fn();
const createVcsAdapterMock = vi.fn();

vi.mock('../vcs/index.js', () => ({
  createVcsAdapter: (...a: unknown[]) => createVcsAdapterMock(...a),
}));

import { mergeQuery } from './merge.js';

beforeEach(() => {
  mergeMock.mockReset();
  createVcsAdapterMock.mockReset();
  createVcsAdapterMock.mockReturnValue({
    kind: 'git',
    gitOnly: { merge: mergeMock },
  });
  mergeMock.mockReturnValue({ exitCode: 0, stdout: '', stderr: '' });
});

describe('mergeQuery', () => {
  it('errors when <ref> positional missing', async () => {
    const res = await mergeQuery([], '/repo');
    expect(mergeMock).not.toHaveBeenCalled();
    expect(res.data).toMatchObject({ ok: false });
  });

  it('rejects ref that fails validateRefname BEFORE invoking adapter', async () => {
    const res = await mergeQuery(['-D'], '/repo');
    expect(mergeMock).not.toHaveBeenCalled();
    expect(res.data).toMatchObject({ ok: false });
    expect((res.data as { error: string }).error).toMatch(/leading '-'/);
  });

  it('dispatches gitOnly.merge with all flags', async () => {
    const res = await mergeQuery(['feature/x', '--squash', '--no-ff', '--no-commit'], '/repo');
    expect(mergeMock).toHaveBeenCalledWith({
      ref: 'feature/x', squash: true, noFf: true, noCommit: true,
    });
    expect(res.data).toMatchObject({ ok: true, ref: 'feature/x' });
  });

  it('returns typed error on jj backend', async () => {
    createVcsAdapterMock.mockReturnValue({ kind: 'jj' });
    const res = await mergeQuery(['feature/x'], '/repo');
    expect(mergeMock).not.toHaveBeenCalled();
    expect(res.data).toMatchObject({ ok: false });
    expect((res.data as { error: string }).error).toMatch(/not yet supported on jj backend/);
  });

  it('honours --cwd', async () => {
    await mergeQuery(['feature/x', '--cwd', '/other'], '/repo');
    expect(createVcsAdapterMock).toHaveBeenCalledWith('/other');
  });
});
