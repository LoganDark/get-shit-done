/**
 * Unit tests for restoreQuery (Plan 05-01 Task 2, D-33 batch 1).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const restoreMock = vi.fn();
const vcsExecMock = vi.fn();
const createVcsAdapterMock = vi.fn();

vi.mock('../vcs/index.js', () => ({
  createVcsAdapter: (...a: unknown[]) => createVcsAdapterMock(...a),
}));
vi.mock('../vcs/exec.js', () => ({
  vcsExec: (...a: unknown[]) => vcsExecMock(...a),
}));

import { restoreQuery } from './restore.js';

beforeEach(() => {
  restoreMock.mockReset();
  vcsExecMock.mockReset();
  createVcsAdapterMock.mockReset();
  createVcsAdapterMock.mockReturnValue({
    kind: 'git',
    gitOnly: { restore: restoreMock },
  });
  restoreMock.mockReturnValue({ exitCode: 0, stdout: '', stderr: '' });
  vcsExecMock.mockReturnValue({ exitCode: 0, stdout: '', stderr: '' });
});

describe('restoreQuery', () => {
  it('errors when no files given', async () => {
    const res = await restoreQuery([], '/repo');
    expect(restoreMock).not.toHaveBeenCalled();
    expect(res.data).toMatchObject({ ok: false });
  });

  it('rejects --from arg that fails validateRefname', async () => {
    const res = await restoreQuery(['--from', '-D', 'a.txt'], '/repo');
    expect(restoreMock).not.toHaveBeenCalled();
    expect(res.data).toMatchObject({ ok: false });
  });

  it('dispatches gitOnly.restore on git backend with files + from', async () => {
    const res = await restoreQuery(['--from', 'main', 'a.txt', 'b.txt'], '/repo');
    expect(restoreMock).toHaveBeenCalledWith({ files: ['a.txt', 'b.txt'], from: 'main' });
    expect(res.data).toMatchObject({ ok: true, backend: 'git', files: ['a.txt', 'b.txt'] });
  });

  it('dispatches jj restore via vcsExec on jj backend (default --from @-)', async () => {
    createVcsAdapterMock.mockReturnValue({ kind: 'jj' });
    const res = await restoreQuery(['a.txt'], '/repo');
    expect(vcsExecMock).toHaveBeenCalledWith('/repo', 'jj', ['restore', '--from', '@-', '--', 'a.txt']);
    expect(res.data).toMatchObject({ ok: true, backend: 'jj', from: '@-' });
  });

  it('honours --cwd', async () => {
    await restoreQuery(['--cwd', '/other', 'a.txt'], '/repo');
    expect(createVcsAdapterMock).toHaveBeenCalledWith('/other');
  });
});
