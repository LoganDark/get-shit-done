/**
 * backends.ts unit tests.
 * Verifies BACKENDS_DECLARED/AVAILABLE values and parseBackendsEnv structured shape.
 * B-4: parseBackendsEnv exposes `unavailable` so callers can warn instead of
 * silently running zero tests.
 */

import { describe, it, expect } from 'vitest';
import { BACKENDS_DECLARED, BACKENDS_AVAILABLE, parseBackendsEnv } from '../backends.js';

describe('BACKENDS constants', () => {
  it('BACKENDS_DECLARED is [git, jj-colocated, jj-native]', () => {
    expect([...BACKENDS_DECLARED]).toEqual(['git', 'jj-colocated', 'jj-native']);
  });
  it('BACKENDS_AVAILABLE is [git] in Phase 1', () => {
    expect([...BACKENDS_AVAILABLE]).toEqual(['git']);
  });
});

describe('parseBackendsEnv', () => {
  it('undefined → all-available + empty requested', () => {
    expect(parseBackendsEnv(undefined)).toEqual({
      available: ['git'],
      requested: [],
      unavailable: [],
    });
  });

  it("'' → all-available + empty requested (treated like undefined)", () => {
    expect(parseBackendsEnv('')).toEqual({
      available: ['git'],
      requested: [],
      unavailable: [],
    });
  });

  it("'git' → available=[git], requested=[git], unavailable=[]", () => {
    expect(parseBackendsEnv('git')).toEqual({
      available: ['git'],
      requested: ['git'],
      unavailable: [],
    });
  });

  it("'git,jj-colocated' → available=[git], unavailable=[jj-colocated]", () => {
    expect(parseBackendsEnv('git,jj-colocated')).toEqual({
      available: ['git'],
      requested: ['git', 'jj-colocated'],
      unavailable: ['jj-colocated'],
    });
  });

  it("'jj-colocated' alone → available=[], unavailable=[jj-colocated] (B-4 silent-zero-test fix)", () => {
    expect(parseBackendsEnv('jj-colocated')).toEqual({
      available: [],
      requested: ['jj-colocated'],
      unavailable: ['jj-colocated'],
    });
  });

  it("'git, git ' trims whitespace; does NOT dedup (caller decides)", () => {
    const r = parseBackendsEnv('git, git ');
    expect(r.available).toEqual(['git', 'git']);
    expect(r.requested).toEqual(['git', 'git']);
    expect(r.unavailable).toEqual([]);
    // Verify no leading/trailing whitespace.
    for (const k of r.requested) expect(k).toBe('git');
  });
});
