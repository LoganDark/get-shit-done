/**
 * format-migration/__tests__/idempotency.test.ts — D-04 invariants from
 * 06-CONTEXT.md.
 *
 *   D-04.1: file with no source-shape identifiers is untouched
 *   D-04.2: file already entirely in target shape is untouched
 *   D-04.3: file with mix is rewritten so ALL in-scope IDs reach target shape
 *
 *   Plus the double-application invariant: f(f(x)) === f(x) when the second
 *   pass sees only target-shape tokens.
 *
 * Pure-function tests against `migrateContent` (NO fs, NO exec, NO mocks).
 */

import { describe, it, expect } from 'vitest';
import { migrateContent } from '../rewrite.js';
import type { ResolveResult } from '../types.js';

const NEVER_RESOLVER = (): ResolveResult => {
  throw new Error('resolver should not be called — no in-scope IDs');
};

describe('D-04.1 — file with no source-shape identifiers is untouched', () => {
  it('git→jj direction, content has no hex tokens', () => {
    const input = '# Phase summary\n\nNothing to migrate here. Just prose.\n';
    const r = migrateContent(input, 'git→jj', NEVER_RESOLVER, '/x.md');
    expect(r.content).toBe(input);
    expect(r.orphans).toEqual([]);
  });

  it('jj→git direction, content has no [k-z] tokens', () => {
    const input = '# Phase summary\n\nNothing to migrate here. Just prose.\n';
    const r = migrateContent(input, 'jj→git', NEVER_RESOLVER, '/x.md');
    expect(r.content).toBe(input);
    expect(r.orphans).toEqual([]);
  });
});

describe('D-04.2 — file already entirely in target shape is untouched', () => {
  it('git→jj direction, content has only jj change_ids', () => {
    // In git→jj direction the regex looks for HEX. Pure [k-z] content yields
    // zero matches, so the resolver is never called and the output is
    // byte-identical to input.
    const input = 'Already on jj: `kxnzlnrntwou` and `lmnopqrstuvw`.\n';
    const r = migrateContent(input, 'git→jj', NEVER_RESOLVER, '/x.md');
    expect(r.content).toBe(input);
    expect(r.orphans).toEqual([]);
  });

  it('jj→git direction, content has only hex SHAs', () => {
    const input = 'Already on git: `abc1234` and `deadbeef`.\n';
    const r = migrateContent(input, 'jj→git', NEVER_RESOLVER, '/x.md');
    expect(r.content).toBe(input);
    expect(r.orphans).toEqual([]);
  });
});

describe('D-04.3 — file with mix is rewritten so ALL in-scope IDs reach target shape', () => {
  it('git→jj direction: every hex token in source shape becomes a change_id', () => {
    const input = 'First `abc1234` second `deadbeef` end.';
    // Provide deterministic resolution for both hex tokens.
    const cache = new Map<string, ResolveResult>([
      ['abc1234', { kind: 'resolved', targetId: 'kxnzlnrntwou' }],
      ['deadbeef', { kind: 'resolved', targetId: 'lmnopqrstuvw' }],
    ]);
    const resolve = (id: string) => {
      const r = cache.get(id);
      if (!r) throw new Error(`unexpected id ${id}`);
      return r;
    };
    const r = migrateContent(input, 'git→jj', resolve, '/x.md');
    expect(r.content).toBe('First `kxnzlnrntwou` second `lmnopqrstuvw` end.');
    expect(r.orphans).toEqual([]);

    // Sanity: after rewrite, a second git→jj pass finds no hex tokens. This
    // verifies the invariant "ALL in-scope IDs reach target shape" — there
    // are no leftover source-shape tokens after the first pass.
    const r2 = migrateContent(r.content, 'git→jj', NEVER_RESOLVER, '/x.md');
    expect(r2.content).toBe(r.content);
    expect(r2.orphans).toEqual([]);
  });
});

describe('Idempotent under double-application: f(f(x)) === f(x)', () => {
  it('two consecutive git→jj passes converge', () => {
    const input = 'mixed `abc1234` and `kxnzlnrntwou`.';
    // First pass: hex token resolves; jj token is invisible to the regex.
    const r1 = migrateContent(
      input,
      'git→jj',
      (id) =>
        id === 'abc1234'
          ? { kind: 'resolved', targetId: 'mmmmmmmmnnnn' }
          : { kind: 'unresolvable' },
      '/x.md',
    );
    // Second pass with a never-resolver: no hex remains, so resolver is unused
    // and output equals first-pass output.
    const r2 = migrateContent(r1.content, 'git→jj', NEVER_RESOLVER, '/x.md');
    expect(r2.content).toBe(r1.content);
    expect(r2.orphans).toEqual([]);
  });

  it('two consecutive jj→git passes converge', () => {
    const input = 'mixed `kxnzlnrntwou` and `abc1234`.';
    const r1 = migrateContent(
      input,
      'jj→git',
      (id) =>
        id === 'kxnzlnrntwou'
          ? { kind: 'resolved', targetId: 'deadbeef' }
          : { kind: 'unresolvable' },
      '/x.md',
    );
    const r2 = migrateContent(r1.content, 'jj→git', NEVER_RESOLVER, '/x.md');
    expect(r2.content).toBe(r1.content);
    expect(r2.orphans).toEqual([]);
  });
});
