/**
 * Unit tests for logQuery (Plan 05-01 Task 2, D-33 batch 1).
 *
 * Plan 05-06 Task 2 (CR-02 fix): assertions updated to expect encoded
 * RevisionExpr strings (e.g. `head:`, `range:<head:>..<rev:abc>`) at the
 * adapter boundary — D-12 forbids raw passthrough, so the SDK shim wraps
 * every CLI argv string through expr.* before forwarding.
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
  // Default log() return: a chain of 6 commits so HEAD~N resolution succeeds
  // for the common workflow shapes (HEAD~1, HEAD~5).
  logMock.mockReturnValue([
    { hash: 'a'.repeat(40), parents: [], author: 'x', date: '2026', subject: 's0' },
    { hash: 'b'.repeat(40), parents: [], author: 'x', date: '2026', subject: 's1' },
    { hash: 'c'.repeat(40), parents: [], author: 'x', date: '2026', subject: 's2' },
    { hash: 'd'.repeat(40), parents: [], author: 'x', date: '2026', subject: 's3' },
    { hash: 'e'.repeat(40), parents: [], author: 'x', date: '2026', subject: 's4' },
    { hash: 'f'.repeat(40), parents: [], author: 'x', date: '2026', subject: 's5' },
  ]);
});

describe('logQuery', () => {
  it('dispatches with no flags', async () => {
    const res = await logQuery([], '/repo');
    expect(logMock).toHaveBeenCalledWith({ maxCount: undefined, allRefs: false, rev: undefined });
    expect(res.data).toMatchObject({ ok: true });
  });

  it('parses --max-count and --all', async () => {
    await logQuery(['--max-count', '5', '--all'], '/repo');
    // Last log() call is the main entries fetch.
    expect(logMock).toHaveBeenLastCalledWith({ maxCount: 5, allRefs: true, rev: undefined });
  });

  it('CR-02 fix: --range HEAD~1..HEAD encodes through expr.range/rev/head', async () => {
    await logQuery(['--range', 'HEAD~1..HEAD', '--max-count', '1'], '/repo');
    // The shim resolves HEAD~1 via vcs.log({maxCount: 2}) and encodes the
    // range as `range:rev:<sha>..head:`. The last log() call passes the
    // encoded rev to the adapter; we match on the structural shape.
    const lastCall = logMock.mock.calls[logMock.mock.calls.length - 1][0];
    expect(typeof lastCall.rev).toBe('string');
    expect(lastCall.rev).toMatch(/^range:rev:[0-9a-f]+\.\.head:$/);
    expect(lastCall.maxCount).toBe(1);
  });

  it('CR-02 fix: --range HEAD encodes through expr.head (no range form)', async () => {
    await logQuery(['--range', 'HEAD'], '/repo');
    const lastCall = logMock.mock.calls[logMock.mock.calls.length - 1][0];
    expect(lastCall.rev).toBe('head:');
  });

  it('CR-02 fix: --range with malformed input returns ok:false envelope (no throw)', async () => {
    // 'A..B' where one side is empty.
    const res = await logQuery(['--range', '..HEAD'], '/repo');
    expect(res.data).toMatchObject({ ok: false });
    expect((res.data as { error: string }).error).toMatch(/malformed range|one side empty/);
  });

  it('ignores invalid --max-count value', async () => {
    await logQuery(['--max-count', 'not-a-number'], '/repo');
    expect(logMock).toHaveBeenLastCalledWith({ maxCount: undefined, allRefs: false, rev: undefined });
  });

  it('honours --cwd', async () => {
    await logQuery(['--cwd', '/other'], '/repo');
    expect(createVcsAdapterMock).toHaveBeenCalledWith('/other');
  });

  it('returns entries from adapter', async () => {
    const res = await logQuery([], '/repo');
    expect((res.data as { entries: unknown[] }).entries.length).toBeGreaterThan(0);
  });
});
