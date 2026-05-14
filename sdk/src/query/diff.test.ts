/**
 * Unit tests for diffQuery (Plan 05-01 Task 2, D-33 batch 1).
 *
 * Plan 05-06 Task 2 (CR-02 fix): assertions updated to expect encoded
 * RevisionExpr strings at the adapter boundary (parseRangeArg shared with
 * log.ts).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const diffMock = vi.fn();
const logMock = vi.fn();
const createVcsAdapterMock = vi.fn();

vi.mock('../vcs/index.js', () => ({
  createVcsAdapter: (...a: unknown[]) => createVcsAdapterMock(...a),
}));

import { diffQuery } from './diff.js';

beforeEach(() => {
  diffMock.mockReset();
  logMock.mockReset();
  createVcsAdapterMock.mockReset();
  createVcsAdapterMock.mockReturnValue({
    kind: 'git',
    diff: diffMock,
    // parseRangeArg may call vcs.log() to resolve HEAD~N.
    log: logMock,
  });
  diffMock.mockReturnValue({ raw: '', nameOnly: [], nameStatus: undefined });
  logMock.mockReturnValue([
    { hash: 'a'.repeat(40), parents: [], author: 'x', date: '2026', subject: 's0' },
    { hash: 'b'.repeat(40), parents: [], author: 'x', date: '2026', subject: 's1' },
  ]);
});

describe('diffQuery', () => {
  it('dispatches with defaults', async () => {
    await diffQuery([], '/repo');
    expect(diffMock).toHaveBeenCalledWith({
      staged: false, nameOnly: false, nameStatus: false, rev: undefined, paths: undefined,
    });
  });

  it('parses --cached → staged, --name-only, --name-status', async () => {
    await diffQuery(['--cached', '--name-only', '--name-status'], '/repo');
    expect(diffMock).toHaveBeenCalledWith({
      staged: true, nameOnly: true, nameStatus: true, rev: undefined, paths: undefined,
    });
  });

  it('CR-02 fix: --range HEAD~1..HEAD encodes through expr.range/rev/head', async () => {
    await diffQuery(['--range', 'HEAD~1..HEAD', '--name-only'], '/repo');
    const call = diffMock.mock.calls[0][0];
    expect(typeof call.rev).toBe('string');
    expect(call.rev).toMatch(/^range:rev:[0-9a-f]+\.\.head:$/);
    expect(call.nameOnly).toBe(true);
  });

  it('CR-02 fix: --range with empty side returns ok:false envelope (no throw)', async () => {
    const res = await diffQuery(['--range', 'HEAD..'], '/repo');
    expect(res.data).toMatchObject({ ok: false });
    expect((res.data as { error: string }).error).toMatch(/malformed range|one side empty/);
  });

  it('consumes trailing positionals after -- as paths', async () => {
    await diffQuery(['--name-only', '--', 'src/a.ts', 'src/b.ts'], '/repo');
    expect(diffMock).toHaveBeenCalledWith({
      staged: false, nameOnly: true, nameStatus: false, rev: undefined, paths: ['src/a.ts', 'src/b.ts'],
    });
  });

  it('honours --cwd', async () => {
    await diffQuery(['--cwd', '/other'], '/repo');
    expect(createVcsAdapterMock).toHaveBeenCalledWith('/other');
  });

  it('returns raw/nameOnly/nameStatus from adapter', async () => {
    diffMock.mockReturnValue({ raw: 'diff text', nameOnly: ['a'], nameStatus: [{ path: 'a', status: 'M' }] });
    const res = await diffQuery(['--name-status'], '/repo');
    expect(res.data).toMatchObject({ ok: true, raw: 'diff text', nameOnly: ['a'] });
  });
});
