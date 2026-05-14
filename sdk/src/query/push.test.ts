/**
 * Unit tests for pushQuery (Plan 05-01 Task 2, D-33 batch 1).
 * Mocks createVcsAdapter to assert argv parsing + adapter delegation shape.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const pushMock = vi.fn();
const createVcsAdapterMock = vi.fn();

vi.mock('../vcs/index.js', () => ({
  createVcsAdapter: (...a: unknown[]) => createVcsAdapterMock(...a),
}));

import { pushQuery } from './push.js';

beforeEach(() => {
  pushMock.mockReset();
  createVcsAdapterMock.mockReset();
  createVcsAdapterMock.mockReturnValue({
    kind: 'git',
    push: pushMock,
  });
  pushMock.mockReturnValue({ exitCode: 0, stdout: 'ok', stderr: '' });
});

describe('pushQuery', () => {
  it('dispatches with no flags (defaults)', async () => {
    const res = await pushQuery([], '/repo');
    expect(createVcsAdapterMock).toHaveBeenCalledWith('/repo');
    expect(pushMock).toHaveBeenCalledWith({ remote: undefined, ref: undefined, force: false });
    expect(res.data).toMatchObject({ ok: true, exitCode: 0 });
  });

  it('parses --remote, --bookmark, --force and validates refname', async () => {
    const res = await pushQuery(
      ['--remote', 'origin', '--bookmark', 'feature/x', '--force'],
      '/repo',
    );
    expect(pushMock).toHaveBeenCalledWith({
      remote: 'origin',
      ref: 'feature/x',
      force: true,
    });
    expect(res.data).toMatchObject({ ok: true, remote: 'origin', bookmark: 'feature/x', force: true });
  });

  it('honours --cwd override', async () => {
    await pushQuery(['--cwd', '/other', '--remote', 'origin'], '/repo');
    expect(createVcsAdapterMock).toHaveBeenCalledWith('/other');
  });

  it('rejects bookmark args that fail validateRefname BEFORE invoking adapter', async () => {
    const res = await pushQuery(['--bookmark', '-D'], '/repo');
    expect(pushMock).not.toHaveBeenCalled();
    expect(res.data).toMatchObject({ ok: false });
    expect((res.data as { error: string }).error).toMatch(/leading '-'/);
  });

  it('returns shape with ok/exitCode/stdout/stderr on non-zero exit', async () => {
    pushMock.mockReturnValue({ exitCode: 1, stdout: '', stderr: 'rejected' });
    const res = await pushQuery(['--remote', 'origin'], '/repo');
    expect(res.data).toMatchObject({ ok: false, exitCode: 1, stderr: 'rejected' });
  });
});
