/**
 * format-migration/__tests__/resolve.test.ts — unit tests for the async
 * resolver, with focus on the B-07 source-side existence safety net.
 *
 * Mock surfaces:
 *   - vcs.refs.exists (the source-side existence probe)
 *   - parse/jj-id.ts commitIdOf / changeIdOf (target translation)
 *   - deps.ancestor (orphan walk)
 *
 * The resolver under test is internal-cached; we verify that:
 *   1. exists()=false short-circuits to kind:'skip' without invoking the
 *      target-side translation or the ancestor walker.
 *   2. exists()=true + successful target lookup yields kind:'resolved'.
 *   3. exists()=true + target VcsExecError + ancestor null yields 'unresolvable'.
 *   4. exists() throwing is treated as nonexistent (returns 'skip').
 *   5. The cache memoizes per-id: a second call for the same id does NOT
 *      re-invoke the existence check.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const existsMock = vi.fn();
const commitIdOfMock = vi.fn();
const changeIdOfMock = vi.fn();
const ancestorMock = vi.fn();

vi.mock('../../parse/jj-id.js', () => ({
  commitIdOf: (...a: unknown[]) => commitIdOfMock(...a),
  changeIdOf: (...a: unknown[]) => changeIdOfMock(...a),
}));

import { createIdResolver } from '../resolve.js';
import { VcsExecError } from '../../exec.js';
import type { VcsAdapter } from '../../types.js';

function makeVcsStub() {
  return {
    refs: {
      exists: (...a: unknown[]) => existsMock(...a),
    },
  } as unknown as VcsAdapter;
}

beforeEach(() => {
  existsMock.mockReset();
  commitIdOfMock.mockReset();
  changeIdOfMock.mockReset();
  ancestorMock.mockReset();
});

describe('createIdResolver — B-07 source-side existence safety net', () => {
  it("returns kind:'skip' when source-side exists() is false (no target/ancestor calls)", async () => {
    existsMock.mockReturnValue(false);
    const resolver = createIdResolver({
      cwd: '/repo',
      vcs: makeVcsStub(),
      direction: 'git→jj',
      ancestor: ancestorMock,
    });

    const r = await resolver.resolve('cceeded');
    expect(r).toEqual({ kind: 'skip' });
    expect(existsMock).toHaveBeenCalledTimes(1);
    expect(changeIdOfMock).not.toHaveBeenCalled();
    expect(commitIdOfMock).not.toHaveBeenCalled();
    expect(ancestorMock).not.toHaveBeenCalled();
  });

  it("returns kind:'skip' when exists() throws (malformed input treated as nonexistent)", async () => {
    existsMock.mockImplementation(() => {
      throw new Error('not a valid revision shape');
    });
    const resolver = createIdResolver({
      cwd: '/repo',
      vcs: makeVcsStub(),
      direction: 'git→jj',
      ancestor: ancestorMock,
    });

    const r = await resolver.resolve('notarealhash');
    expect(r).toEqual({ kind: 'skip' });
    expect(changeIdOfMock).not.toHaveBeenCalled();
  });

  it("returns kind:'resolved' when exists() is true and target lookup succeeds (git→jj)", async () => {
    existsMock.mockReturnValue(true);
    changeIdOfMock.mockReturnValue('kkkkkkkkmmmm');
    const resolver = createIdResolver({
      cwd: '/repo',
      vcs: makeVcsStub(),
      direction: 'git→jj',
      ancestor: ancestorMock,
    });

    const r = await resolver.resolve('abc1234');
    expect(r).toEqual({ kind: 'resolved', targetId: 'kkkkkkkkmmmm' });
    expect(changeIdOfMock).toHaveBeenCalledWith('/repo', 'abc1234');
    expect(ancestorMock).not.toHaveBeenCalled();
  });

  it("returns kind:'resolved' on jj→git direction (commitIdOf path)", async () => {
    existsMock.mockReturnValue(true);
    commitIdOfMock.mockReturnValue('abc1234');
    const resolver = createIdResolver({
      cwd: '/repo',
      vcs: makeVcsStub(),
      direction: 'jj→git',
      ancestor: ancestorMock,
    });

    const r = await resolver.resolve('kkkkkkkkmmmm');
    expect(r).toEqual({ kind: 'resolved', targetId: 'abc1234' });
    expect(commitIdOfMock).toHaveBeenCalledWith('/repo', 'kkkkkkkkmmmm');
  });

  it("falls back to ancestor walk on target VcsExecError; returns 'unresolvable' on null", async () => {
    existsMock.mockReturnValue(true);
    changeIdOfMock.mockImplementation(() => {
      throw new VcsExecError('changeIdOf failed', {
        exitCode: 1,
        backend: 'jj',
        argv: ['log'],
      });
    });
    ancestorMock.mockResolvedValue(null);
    const resolver = createIdResolver({
      cwd: '/repo',
      vcs: makeVcsStub(),
      direction: 'git→jj',
      ancestor: ancestorMock,
    });

    const r = await resolver.resolve('abc1234');
    expect(r).toEqual({ kind: 'unresolvable' });
    expect(ancestorMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to ancestor walk on target VcsExecError; returns 'ancestor' on hit", async () => {
    existsMock.mockReturnValue(true);
    changeIdOfMock.mockImplementation(() => {
      throw new VcsExecError('changeIdOf failed', {
        exitCode: 1,
        backend: 'jj',
        argv: ['log'],
      });
    });
    ancestorMock.mockResolvedValue({
      ancestor: 'kkkkkkkkmmmm',
      childrenInTarget: ['kid1', 'kid2'],
    });
    const resolver = createIdResolver({
      cwd: '/repo',
      vcs: makeVcsStub(),
      direction: 'git→jj',
      ancestor: ancestorMock,
    });

    const r = await resolver.resolve('abc1234');
    expect(r).toEqual({
      kind: 'ancestor',
      targetId: 'kkkkkkkkmmmm',
      childrenInTarget: ['kid1', 'kid2'],
    });
  });

  it('caches per-id: second call for same id does not re-invoke exists() or target lookup', async () => {
    existsMock.mockReturnValue(true);
    changeIdOfMock.mockReturnValue('kkkkkkkkmmmm');
    const resolver = createIdResolver({
      cwd: '/repo',
      vcs: makeVcsStub(),
      direction: 'git→jj',
      ancestor: ancestorMock,
    });

    await resolver.resolve('abc1234');
    await resolver.resolve('abc1234');
    expect(existsMock).toHaveBeenCalledTimes(1);
    expect(changeIdOfMock).toHaveBeenCalledTimes(1);
  });

  it("caches 'skip' results too — second call for nonexistent id does NOT re-probe", async () => {
    existsMock.mockReturnValue(false);
    const resolver = createIdResolver({
      cwd: '/repo',
      vcs: makeVcsStub(),
      direction: 'git→jj',
      ancestor: ancestorMock,
    });

    await resolver.resolve('cceeded');
    await resolver.resolve('cceeded');
    expect(existsMock).toHaveBeenCalledTimes(1);
  });

  it('rethrows non-VcsExecError errors from target translation', async () => {
    existsMock.mockReturnValue(true);
    changeIdOfMock.mockImplementation(() => {
      throw new TypeError('unrelated programmer bug');
    });
    const resolver = createIdResolver({
      cwd: '/repo',
      vcs: makeVcsStub(),
      direction: 'git→jj',
      ancestor: ancestorMock,
    });

    await expect(resolver.resolve('abc1234')).rejects.toThrow(/unrelated/);
  });
});
