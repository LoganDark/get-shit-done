/**
 * Unit tests for resetQuery (Plan 05-01 Task 2, D-33 batch 1).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const resetMock = vi.fn();
const createVcsAdapterMock = vi.fn();

vi.mock('../vcs/index.js', () => ({
  createVcsAdapter: (...a: unknown[]) => createVcsAdapterMock(...a),
}));

import { resetQuery } from './reset.js';

beforeEach(() => {
  resetMock.mockReset();
  createVcsAdapterMock.mockReset();
  createVcsAdapterMock.mockReturnValue({
    kind: 'git',
    gitOnly: { reset: resetMock },
  });
  resetMock.mockReturnValue({ exitCode: 0, stdout: '', stderr: '' });
});

describe('resetQuery', () => {
  it('errors when --ref missing', async () => {
    const res = await resetQuery(['--mode', 'hard'], '/repo');
    expect(resetMock).not.toHaveBeenCalled();
    expect(res.data).toMatchObject({ ok: false });
    expect((res.data as { error: string }).error).toMatch(/--ref/);
  });

  it('errors when --mode missing', async () => {
    const res = await resetQuery(['--ref', 'HEAD~1'], '/repo');
    expect(res.data).toMatchObject({ ok: false });
    expect((res.data as { error: string }).error).toMatch(/--mode/);
  });

  it('errors on invalid --mode value', async () => {
    const res = await resetQuery(['--ref', 'HEAD', '--mode', 'bogus'], '/repo');
    expect(res.data).toMatchObject({ ok: false });
    expect((res.data as { error: string }).error).toMatch(/invalid --mode/);
  });

  it('dispatches gitOnly.reset on git backend', async () => {
    const res = await resetQuery(['--ref', 'HEAD~1', '--mode', 'hard'], '/repo');
    expect(resetMock).toHaveBeenCalledWith({ ref: 'HEAD~1', mode: 'hard' });
    expect(res.data).toMatchObject({ ok: true, ref: 'HEAD~1', mode: 'hard' });
  });

  it('returns typed error on jj backend (git-only escape hatch)', async () => {
    createVcsAdapterMock.mockReturnValue({ kind: 'jj' });
    const res = await resetQuery(['--ref', 'HEAD~1', '--mode', 'hard'], '/repo');
    expect(resetMock).not.toHaveBeenCalled();
    expect(res.data).toMatchObject({ ok: false });
    expect((res.data as { error: string }).error).toMatch(/not supported on jj backend/);
  });

  it('honours --cwd', async () => {
    await resetQuery(['--cwd', '/other', '--ref', 'HEAD', '--mode', 'soft'], '/repo');
    expect(createVcsAdapterMock).toHaveBeenCalledWith('/other');
  });
});
