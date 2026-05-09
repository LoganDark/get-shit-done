/**
 * RevisionExpr factory + parser round-trip tests.
 * Verifies D-09 (branded), D-10 (factory-only), D-12 (no `expr.raw`).
 */

import { describe, it, expect } from 'vitest';
import { expr, parseExpr } from '../expr.js';

describe('expr factories', () => {
  it('head() round-trips through parseExpr', () => {
    expect(parseExpr(expr.head())).toEqual({ kind: 'head' });
  });

  it('parent() round-trips through parseExpr', () => {
    expect(parseExpr(expr.parent())).toEqual({ kind: 'parent' });
  });

  it('bookmark(name) round-trips through parseExpr', () => {
    expect(parseExpr(expr.bookmark('main'))).toEqual({ kind: 'bookmark', name: 'main' });
  });

  it('bookmark with colon throws', () => {
    expect(() => expr.bookmark('a:b')).toThrow(/invalid name/);
  });

  it('remote(branch, remoteName) round-trips through parseExpr', () => {
    expect(parseExpr(expr.remote('main', 'origin'))).toEqual({
      kind: 'remote',
      remote: 'origin',
      name: 'main',
    });
  });

  it('expr has no raw escape hatch (D-12)', () => {
    expect((expr as unknown as { raw?: unknown }).raw).toBeUndefined();
  });
});
