/**
 * Per-dialect translator tests — covers BOTH toGitRev and toJjRev so plan 03
 * (git backend) and Phase 3 (jj backend) consume the locked mappings.
 */

import { describe, it, expect } from 'vitest';
import { expr } from '../expr.js';
import { toGitRev } from '../parse/git-rev.js';
import { toJjRev } from '../parse/jj-rev.js';

describe('toGitRev', () => {
  it('maps head() to HEAD', () => {
    expect(toGitRev(expr.head())).toBe('HEAD');
  });
  it('maps parent() to HEAD~1', () => {
    expect(toGitRev(expr.parent())).toBe('HEAD~1');
  });
  it('maps bookmark(feature/x) to feature/x', () => {
    expect(toGitRev(expr.bookmark('feature/x'))).toBe('feature/x');
  });
  it('maps remote(main, origin) to origin/main', () => {
    expect(toGitRev(expr.remote('main', 'origin'))).toBe('origin/main');
  });
});

describe('toJjRev', () => {
  it('maps head() to @', () => {
    expect(toJjRev(expr.head())).toBe('@');
  });
  it('maps parent() to @-', () => {
    expect(toJjRev(expr.parent())).toBe('@-');
  });
  it('maps bookmark(main) to main', () => {
    expect(toJjRev(expr.bookmark('main'))).toBe('main');
  });
  it('maps remote(main, origin) to main@origin', () => {
    expect(toJjRev(expr.remote('main', 'origin'))).toBe('main@origin');
  });
});
