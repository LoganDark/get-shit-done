/**
 * backends.ts unit tests.
 * Verifies BACKENDS_DECLARED/AVAILABLE values, BACKENDS_AVAILABLE_FOR_VERB
 * per-verb allowlist (Phase 3 D-12), and parseBackendsEnv structured shape.
 * B-4: parseBackendsEnv exposes `unavailable` so callers can warn instead of
 * silently running zero tests.
 */

import { describe, it, expect } from 'vitest';
import {
  BACKENDS_DECLARED,
  BACKENDS_AVAILABLE,
  BACKENDS_AVAILABLE_FOR_VERB,
  parseBackendsEnv,
} from '../backends.js';

describe('BACKENDS constants', () => {
  it('BACKENDS_DECLARED is [git, jj-colocated, jj-native]', () => {
    expect([...BACKENDS_DECLARED]).toEqual(['git', 'jj-colocated', 'jj-native']);
  });
  it('BACKENDS_AVAILABLE is [git, jj-colocated] in Phase 3', () => {
    expect([...BACKENDS_AVAILABLE]).toEqual(['git', 'jj-colocated']);
  });
});

describe('BACKENDS_AVAILABLE_FOR_VERB (Phase 3 D-12 per-verb allowlist)', () => {
  it('seeds every cross-backend verb with [git] only at plan 03-01 land time', () => {
    expect(BACKENDS_AVAILABLE_FOR_VERB.commit).toEqual(['git']);
    expect(BACKENDS_AVAILABLE_FOR_VERB.log).toEqual(['git']);
    expect(BACKENDS_AVAILABLE_FOR_VERB['refs.bookmarks.list']).toEqual(['git']);
  });
  it('declares at least 25 verb keys (full VcsAdapterCommon surface)', () => {
    expect(Object.keys(BACKENDS_AVAILABLE_FOR_VERB).length).toBeGreaterThanOrEqual(25);
  });
  it('is frozen (callers cannot mutate at runtime)', () => {
    expect(Object.isFrozen(BACKENDS_AVAILABLE_FOR_VERB)).toBe(true);
  });
  it('includes __vcsTestOnly.snapshot / restore (vcs-fixture probes these)', () => {
    expect(BACKENDS_AVAILABLE_FOR_VERB['__vcsTestOnly.snapshot']).toEqual(['git']);
    expect(BACKENDS_AVAILABLE_FOR_VERB['__vcsTestOnly.restore']).toEqual(['git']);
  });
});

describe('parseBackendsEnv', () => {
  it('undefined → all-available + empty requested', () => {
    expect(parseBackendsEnv(undefined)).toEqual({
      available: ['git', 'jj-colocated'],
      requested: [],
      unavailable: [],
    });
  });

  it("'' → all-available + empty requested (treated like undefined)", () => {
    expect(parseBackendsEnv('')).toEqual({
      available: ['git', 'jj-colocated'],
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

  it("'git,jj-colocated' → available=[git, jj-colocated], unavailable=[]", () => {
    expect(parseBackendsEnv('git,jj-colocated')).toEqual({
      available: ['git', 'jj-colocated'],
      requested: ['git', 'jj-colocated'],
      unavailable: [],
    });
  });

  it("'jj-native' alone → available=[], unavailable=[jj-native] (Phase 4 owns jj-native)", () => {
    expect(parseBackendsEnv('jj-native')).toEqual({
      available: [],
      requested: ['jj-native'],
      unavailable: ['jj-native'],
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
