/**
 * RevisionExpr factory + parser round-trip tests.
 * Verifies D-09 (branded), D-10 (factory-only), D-12 (no `expr.raw`).
 */

import { describe, it, expect } from 'vitest';
import { expr, parseExpr } from '../expr.js';
import { toGitRev } from '../parse/git-rev.js';
import { toJjRev } from '../parse/jj-rev.js';

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

describe('expr.range factory (02-03 Task 2)', () => {
  it('round-trips via toGitRev to A..B form', () => {
    const r = expr.range(expr.head(), expr.bookmark('main'));
    expect(toGitRev(r)).toBe('HEAD..main');
  });
  it('round-trips via toJjRev (jj also uses .. for ranges)', () => {
    const r = expr.range(expr.head(), expr.bookmark('main'));
    expect(toJjRev(r)).toMatch(/\.\./);
  });
  it('parent..head translates to git form HEAD~1..HEAD', () => {
    const r = expr.range(expr.parent(), expr.head());
    expect(toGitRev(r)).toBe('HEAD~1..HEAD');
  });
});

describe('expr.rev factory (02-03 Task 2 — Blocker 3; 2.1-01 widened to accept jj change_id)', () => {
  const SHA = 'abc1234deadbeef000000000000000000000aaaa';
  it('round-trips via toGitRev — emits SHA verbatim', () => {
    expect(toGitRev(expr.rev(SHA))).toBe(SHA);
  });
  it('round-trips via toJjRev — emits SHA verbatim', () => {
    expect(toJjRev(expr.rev(SHA))).toBe(SHA);
  });
  it('accepts a 7-char short SHA', () => {
    expect(toGitRev(expr.rev('abc1234'))).toBe('abc1234');
  });
  it('throws on non-SHA input (D-12 — no string passthrough)', () => {
    expect(() => expr.rev('not-a-sha')).toThrow(/hex-SHA or change-id shaped string/);
    expect(() => expr.rev('')).toThrow(/hex-SHA or change-id shaped string/);
    expect(() => expr.rev('xyz')).toThrow(/hex-SHA or change-id shaped string/);
  });
  it('throws on too-short input (<4 hex chars)', () => {
    expect(() => expr.rev('abc')).toThrow(/hex-SHA or change-id shaped string/);
  });
  it('accepts jj change_id alphabet shape', () => {
    expect(() => expr.rev('kxnvqropmlkz')).not.toThrow();
  });
});
