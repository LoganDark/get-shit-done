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

describe('expr.bookmark refname validation (WR-07)', () => {
  // Path-shaped names are permitted (e.g. feature/x).
  it('accepts path-shaped names', () => {
    expect(parseExpr(expr.bookmark('feature/x'))).toEqual({
      kind: 'bookmark',
      name: 'feature/x',
    });
  });

  it('rejects empty name', () => {
    expect(() => expr.bookmark('')).toThrow(/empty/);
  });
  it('rejects leading "-" (would be parsed as a flag, e.g. -D)', () => {
    expect(() => expr.bookmark('-D')).toThrow(/leading '-'/);
  });
  it('rejects "@" / "@{"', () => {
    expect(() => expr.bookmark('foo@{0}')).toThrow(/forbidden sequence/);
  });
  it('rejects ".." anywhere', () => {
    expect(() => expr.bookmark('foo..bar')).toThrow(/forbidden sequence/);
  });
  it('rejects spaces and tabs', () => {
    expect(() => expr.bookmark('foo bar')).toThrow(/forbidden/);
    expect(() => expr.bookmark('foo\tbar')).toThrow(/forbidden/);
  });
  it('rejects ASCII control bytes and ?, *, [, \\, ~, ^', () => {
    for (const bad of ['foo?', 'foo*', 'foo[', 'foo\\', 'foo~', 'foo^']) {
      expect(() => expr.bookmark(bad)).toThrow(/forbidden/);
    }
  });
  it('rejects trailing "/" and trailing ".lock"', () => {
    expect(() => expr.bookmark('foo/')).toThrow(/refname format/);
    expect(() => expr.bookmark('foo.lock')).toThrow(/refname format|component/);
  });
  it('rejects components starting with "."', () => {
    expect(() => expr.bookmark('.hidden')).toThrow(/refname format/);
    expect(() => expr.bookmark('a/.hidden')).toThrow(/component/);
  });
});
