/**
 * Unit tests for revertQuery (Plan 05-01 Task 2, D-33 batch 1).
 * Covers the CMD-06 destructive-semantics shift on jj path (Pitfall 6).
 *
 * Plan 05-06 Task 2 (CR-04 fix): new tests assert `--abort` dispatches
 * gitOnly.revertAbort() on git, and returns a documented no-op envelope on jj.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const revertGitMock = vi.fn();
const revertAbortMock = vi.fn();
const vcsExecMock = vi.fn();
const createVcsAdapterMock = vi.fn();

vi.mock('../vcs/index.js', () => ({
  createVcsAdapter: (...a: unknown[]) => createVcsAdapterMock(...a),
}));
vi.mock('../vcs/exec.js', () => ({
  vcsExec: (...a: unknown[]) => vcsExecMock(...a),
}));

import { revertQuery } from './revert.js';

beforeEach(() => {
  revertGitMock.mockReset();
  revertAbortMock.mockReset();
  vcsExecMock.mockReset();
  createVcsAdapterMock.mockReset();
  createVcsAdapterMock.mockReturnValue({
    kind: 'git',
    gitOnly: { revert: revertGitMock, revertAbort: revertAbortMock },
  });
  revertGitMock.mockReturnValue({ exitCode: 0, stdout: '', stderr: '' });
  revertAbortMock.mockReturnValue({ exitCode: 0, stdout: '', stderr: '' });
  vcsExecMock.mockReturnValue({ exitCode: 0, stdout: '', stderr: '' });
});

describe('revertQuery', () => {
  it('errors when <rev> positional missing (and no --abort)', async () => {
    const res = await revertQuery([], '/repo');
    expect(revertGitMock).not.toHaveBeenCalled();
    expect(res.data).toMatchObject({ ok: false });
    expect((res.data as { error: string }).error).toMatch(/<rev>/);
  });

  it('dispatches vcs.gitOnly.revert on git backend with --no-commit', async () => {
    const res = await revertQuery(['HEAD', '--no-commit'], '/repo');
    expect(revertGitMock).toHaveBeenCalledWith({ rev: 'HEAD', noCommit: true });
    expect(res.data).toMatchObject({ ok: true, rev: 'HEAD', noCommit: true, backend: 'git' });
  });

  it('dispatches jj abandon via vcsExec on jj backend (destructive)', async () => {
    createVcsAdapterMock.mockReturnValue({ kind: 'jj' });
    const res = await revertQuery(['abc123'], '/repo');
    expect(vcsExecMock).toHaveBeenCalledWith('/repo', 'jj', ['abandon', 'abc123']);
    expect(res.data).toMatchObject({ ok: true, rev: 'abc123', backend: 'jj', destructive: true });
  });

  it('CR-04 fix: --abort on git backend dispatches gitOnly.revertAbort()', async () => {
    revertAbortMock.mockReturnValue({ exitCode: 0, stdout: '', stderr: '' });
    const res = await revertQuery(['--abort'], '/repo');
    expect(revertAbortMock).toHaveBeenCalledWith();
    expect(revertGitMock).not.toHaveBeenCalled();
    expect(res.data).toMatchObject({
      ok: true,
      abort: true,
      backend: 'git',
      exitCode: 0,
    });
  });

  it('CR-04 fix: --abort surfaces non-zero exit (no in-progress sequence)', async () => {
    revertAbortMock.mockReturnValue({
      exitCode: 128,
      stdout: '',
      stderr: 'fatal: no operation in progress',
    });
    const res = await revertQuery(['--abort'], '/repo');
    expect(res.data).toMatchObject({
      ok: false,
      abort: true,
      backend: 'git',
      exitCode: 128,
      stderr: 'fatal: no operation in progress',
    });
  });

  it('CR-04 fix: --abort on jj backend returns documented no-op envelope', async () => {
    createVcsAdapterMock.mockReturnValue({ kind: 'jj' });
    const res = await revertQuery(['--abort'], '/repo');
    expect(vcsExecMock).not.toHaveBeenCalled();
    expect(res.data).toMatchObject({
      ok: true,
      abort: true,
      backend: 'jj',
    });
    expect((res.data as { note: string }).note).toMatch(/no in-progress revert sequence/);
  });

  it('honours --cwd', async () => {
    await revertQuery(['HEAD', '--cwd', '/other'], '/repo');
    expect(createVcsAdapterMock).toHaveBeenCalledWith('/other');
  });

  it('returns shape with ok/exitCode/stdout/stderr on non-zero exit', async () => {
    revertGitMock.mockReturnValue({ exitCode: 1, stdout: '', stderr: 'conflict' });
    const res = await revertQuery(['HEAD'], '/repo');
    expect(res.data).toMatchObject({ ok: false, exitCode: 1, stderr: 'conflict' });
  });
});
