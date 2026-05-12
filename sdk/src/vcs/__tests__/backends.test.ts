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
  it('plan 03-06 flipped push/fetch/workspace.list/workspace.context to admit jj-colocated; workspace.add/forget/prune stay git-only', () => {
    // Plan 03-04 flipped `commit`; plan 03-05 Task 1 flipped log/status/diff;
    // plan 03-05 Task 2 flipped findConflicts:
    expect(BACKENDS_AVAILABLE_FOR_VERB.commit).toEqual(['git', 'jj-colocated']);
    expect(BACKENDS_AVAILABLE_FOR_VERB.log).toEqual(['git', 'jj-colocated']);
    expect(BACKENDS_AVAILABLE_FOR_VERB.status).toEqual(['git', 'jj-colocated']);
    expect(BACKENDS_AVAILABLE_FOR_VERB.diff).toEqual(['git', 'jj-colocated']);
    expect(BACKENDS_AVAILABLE_FOR_VERB.findConflicts).toEqual(['git', 'jj-colocated']);
    // Plan 03-06 Task 1 flipped push/fetch (real `jj git push` / `jj git
    // fetch` bodies; opts.force on push and opts.ref on fetch are documented
    // no-ops — see backends/jj.ts JSDoc + 03-06-SUMMARY.md):
    expect(BACKENDS_AVAILABLE_FOR_VERB.push).toEqual(['git', 'jj-colocated']);
    expect(BACKENDS_AVAILABLE_FOR_VERB.fetch).toEqual(['git', 'jj-colocated']);
    // Plan 03-03 flipped refs.bookmarks.list to admit jj-colocated:
    expect(BACKENDS_AVAILABLE_FOR_VERB['refs.bookmarks.list']).toEqual([
      'git',
      'jj-colocated',
    ]);
    // refs.bookmarks.switch + refs.isIgnored stay git-only (audit-confirmed
    // no jj-reachable caller; jj backend throws VcsNotImplementedError):
    expect(BACKENDS_AVAILABLE_FOR_VERB['refs.bookmarks.switch']).toEqual(['git']);
    expect(BACKENDS_AVAILABLE_FOR_VERB['refs.isIgnored']).toEqual(['git']);
    // Plan 03-06 Task 1: workspace.list + workspace.context flipped (Phase 3
    // stubs — real semantics in Phase 4). workspace.add/forget/prune stay
    // ['git'] only (Phase 4 owns WS-*; jj backend throws VcsNotImplementedError):
    expect(BACKENDS_AVAILABLE_FOR_VERB['workspace.list']).toEqual(['git', 'jj-colocated']);
    expect(BACKENDS_AVAILABLE_FOR_VERB['workspace.context']).toEqual(['git', 'jj-colocated']);
    expect(BACKENDS_AVAILABLE_FOR_VERB['workspace.add']).toEqual(['git']);
    expect(BACKENDS_AVAILABLE_FOR_VERB['workspace.forget']).toEqual(['git']);
    expect(BACKENDS_AVAILABLE_FOR_VERB['workspace.prune']).toEqual(['git']);
  });
  it('declares at least 25 verb keys (full VcsAdapterCommon surface)', () => {
    expect(Object.keys(BACKENDS_AVAILABLE_FOR_VERB).length).toBeGreaterThanOrEqual(25);
  });
  it('is frozen (callers cannot mutate at runtime)', () => {
    expect(Object.isFrozen(BACKENDS_AVAILABLE_FOR_VERB)).toBe(true);
  });
  it('includes __vcsTestOnly.snapshot / restore (vcs-fixture probes these)', () => {
    // Phase 3 plan 03-02 flipped both entries to include jj-colocated once
    // the real jj op log / jj op restore body landed in backends/jj.ts.
    expect(BACKENDS_AVAILABLE_FOR_VERB['__vcsTestOnly.snapshot']).toEqual([
      'git',
      'jj-colocated',
    ]);
    expect(BACKENDS_AVAILABLE_FOR_VERB['__vcsTestOnly.restore']).toEqual([
      'git',
      'jj-colocated',
    ]);
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
