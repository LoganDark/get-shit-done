/**
 * Phase 3 plan 03-01 Task 1: additive types surface tests.
 *
 * Verifies:
 *   - CommitInput accepts bookmark / bookmarkRaw fields (D-01 / D-04).
 *   - VcsBookmarkDivergentError + VcsNotImplementedError exported and
 *     instantiable, both `instanceof Error` (D-02 + planner's-discretion).
 */

import { describe, it, expect } from 'vitest';
import {
  VcsBookmarkDivergentError,
  VcsNotImplementedError,
} from '../types.js';
import type { CommitInput } from '../types.js';

describe('Phase 3 types — additive surface', () => {
  it('CommitInput accepts bookmark field', () => {
    const input = { message: 'm', bookmark: 'phase-3' } satisfies CommitInput;
    expect(input.bookmark).toBe('phase-3');
  });

  it('CommitInput accepts bookmarkRaw field', () => {
    const input = { message: 'm', bookmarkRaw: 'main' } satisfies CommitInput;
    expect(input.bookmarkRaw).toBe('main');
  });

  it('VcsBookmarkDivergentError carries bookmarkName and divergentTargets', () => {
    const err = new VcsBookmarkDivergentError({
      bookmarkName: 'gsd/x',
      divergentTargets: ['abc', 'def'],
    });
    expect(err.name).toBe('VcsBookmarkDivergentError');
    expect(err.bookmarkName).toBe('gsd/x');
    expect(err.divergentTargets.length).toBe(2);
    expect(err.message).toContain('divergent');
    expect(err).toBeInstanceOf(Error);
  });

  it('VcsNotImplementedError preserves message and name', () => {
    const err = new VcsNotImplementedError('refs.bookmarks.switch: deferred to Phase 4');
    expect(err.name).toBe('VcsNotImplementedError');
    expect(err.message).toContain('deferred to Phase 4');
    expect(err).toBeInstanceOf(Error);
  });
});
