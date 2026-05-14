/**
 * format-migration/__tests__/rewrite.test.ts — pure-function vitest for
 * `migrateContent`. NO fs, NO exec, NO adapter mocks. Resolver is a
 * caller-supplied sync function — every test pins it explicitly.
 *
 * Cases derived from 06-02-PLAN.md Task 1 "Required `it(...)` cases (7+)":
 *   1. Pass-through (no SHA matches)
 *   2. Direct git→jj resolved
 *   3. Direct jj→git resolved (symmetric)
 *   4. Ancestor breadcrumb on git→jj
 *   5. Unresolvable placeholder
 *   6. No partial-match within longer hex string (lookbehind/lookahead)
 *   7. Idempotency on already-migrated content (D-04.2 invariant)
 *   8. Alphabet disjointness (A1 probe consumption)
 *
 * Plus two extras that surfaced naturally from the implementation:
 *   - Ancestor breadcrumb on jj→git direction (label='cid')
 *   - Multiple matches in one file aggregate orphans correctly
 */

import { describe, it, expect } from 'vitest';
import { migrateContent, GIT_SHA_RE, JJ_CID_RE } from '../rewrite.js';
import type { ResolveResult, MigrationDirection } from '../types.js';

/** Helper: build a sync resolver that returns a fixed result for one ID. */
function fixedResolver(
  map: Record<string, ResolveResult>,
  fallback: ResolveResult = { kind: 'unresolvable' },
): (id: string) => ResolveResult {
  return (id) => map[id] ?? fallback;
}

describe('migrateContent — pass-through cases', () => {
  it('passes through content with no SHA matches (git→jj)', () => {
    const input = 'hello world — no IDs here';
    const r = migrateContent(input, 'git→jj', fixedResolver({}), '/tmp/x.md');
    expect(r.content).toBe(input);
    expect(r.orphans).toEqual([]);
  });

  it('passes through content with no change_id matches (jj→git)', () => {
    const input = 'hello world — no IDs here';
    const r = migrateContent(input, 'jj→git', fixedResolver({}), '/tmp/x.md');
    expect(r.content).toBe(input);
    expect(r.orphans).toEqual([]);
  });
});

describe('migrateContent — direct resolution', () => {
  it('rewrites git SHAs to change_ids when direction=git→jj', () => {
    const input = 'See `abc1234` here.';
    const r = migrateContent(
      input,
      'git→jj',
      fixedResolver({ abc1234: { kind: 'resolved', targetId: 'kxnzlnrntwou' } }),
      '/tmp/x.md',
    );
    expect(r.content).toBe('See `kxnzlnrntwou` here.');
    expect(r.orphans).toEqual([]);
  });

  it('rewrites change_ids to git SHAs when direction=jj→git', () => {
    const input = 'See `kxnzlnrntwou` here.';
    const r = migrateContent(
      input,
      'jj→git',
      fixedResolver({ kxnzlnrntwou: { kind: 'resolved', targetId: 'abc1234' } }),
      '/tmp/x.md',
    );
    expect(r.content).toBe('See `abc1234` here.');
    expect(r.orphans).toEqual([]);
  });
});

describe('migrateContent — ancestor breadcrumb', () => {
  it('handles ancestor resolution with `[was sha:...]` breadcrumb on git→jj', () => {
    const input = 'orphan ref `abc1234` mid-prose.';
    const r = migrateContent(
      input,
      'git→jj',
      fixedResolver({
        abc1234: {
          kind: 'ancestor',
          targetId: 'kxnzlnrntwou',
          childrenInTarget: ['kid1', 'kid2'],
        },
      }),
      '/tmp/x.md',
    );
    // The breadcrumb is the ancestor's targetId followed by an inline backtick
    // block recording the original. Note the trailing backtick is from the
    // surrounding `abc1234` markdown in the input — the rewriter only replaces
    // the bare ID, so the closing backtick from the input survives verbatim.
    expect(r.content).toBe('orphan ref `kxnzlnrntwou`[was sha:abc1234]`` mid-prose.');
    expect(r.orphans).toHaveLength(1);
    expect(r.orphans[0]).toMatchObject({
      original: 'abc1234',
      resolved: 'kxnzlnrntwou',
      kind: 'ancestor',
      childrenInTarget: ['kid1', 'kid2'],
      filePath: '/tmp/x.md',
    });
    // offset is the byte index of the SHA within input.
    expect(r.orphans[0].offset).toBe(input.indexOf('abc1234'));
  });

  it('handles ancestor resolution with `[was cid:...]` breadcrumb on jj→git', () => {
    const input = 'orphan ref `kxnzlnrntwou` here.';
    const r = migrateContent(
      input,
      'jj→git',
      fixedResolver({
        kxnzlnrntwou: { kind: 'ancestor', targetId: 'deadbeef' },
      }),
      '/tmp/x.md',
    );
    expect(r.content).toBe('orphan ref `deadbeef`[was cid:kxnzlnrntwou]`` here.');
    expect(r.orphans).toHaveLength(1);
    expect(r.orphans[0].kind).toBe('ancestor');
    expect(r.orphans[0].original).toBe('kxnzlnrntwou');
  });
});

describe('migrateContent — unresolvable placeholder', () => {
  it('handles unresolvable with `[orphan:...]` placeholder', () => {
    const input = 'See `abc1234` here.';
    const r = migrateContent(
      input,
      'git→jj',
      fixedResolver({ abc1234: { kind: 'unresolvable' } }),
      '/tmp/x.md',
    );
    expect(r.content).toBe('See ``[orphan:abc1234]`` here.');
    expect(r.orphans).toHaveLength(1);
    expect(r.orphans[0]).toMatchObject({
      original: 'abc1234',
      kind: 'unresolvable',
      filePath: '/tmp/x.md',
    });
    expect(r.orphans[0].resolved).toBeUndefined();
    expect(r.orphans[0].childrenInTarget).toBeUndefined();
  });
});

describe('migrateContent — boundary correctness', () => {
  it('does NOT match partial SHA inside longer hex string (lookbehind/lookahead)', () => {
    // A full 40-char SHA must match as a single token, not as multiple 7-char
    // prefixes. (?<![0-9a-fA-F]) and (?![0-9a-fA-F]) on the regex enforce this.
    const fullSha = 'bae15ddeee32297cd54deab40eec317d8f961f86';
    const input = `commit \`${fullSha}\` landed.`;
    const r = migrateContent(
      input,
      'git→jj',
      fixedResolver({ [fullSha]: { kind: 'unresolvable' } }),
      '/tmp/x.md',
    );
    expect(r.orphans).toHaveLength(1);
    expect(r.orphans[0].original).toBe(fullSha);
  });

  it('aggregates multiple matches and preserves per-match offsets', () => {
    const input = 'First `abc1234` then `def5678` end.';
    const r = migrateContent(
      input,
      'git→jj',
      fixedResolver({
        abc1234: { kind: 'resolved', targetId: 'kkkkkkkkmmmm' },
        def5678: { kind: 'unresolvable' },
      }),
      '/tmp/x.md',
    );
    expect(r.content).toBe('First `kkkkkkkkmmmm` then ``[orphan:def5678]`` end.');
    expect(r.orphans).toHaveLength(1);
    expect(r.orphans[0].original).toBe('def5678');
    expect(r.orphans[0].offset).toBe(input.indexOf('def5678'));
  });
});

describe('migrateContent — alphabet disjointness (A1 probe consumption)', () => {
  it('jj→git regex does not match pure hex tokens (alphabet disjoint)', () => {
    // jj→git scans JJ_CID_RE which is /(?<![k-z])([k-z]{8,12})(?![k-z])/. A pure
    // hex string like 'abc1234' has letters a/b/c outside [k-z], so the regex
    // cannot match it. Resolver should never be called for any token.
    const input = 'See `abc1234` here.';
    const r = migrateContent(
      input,
      'jj→git',
      // Resolver intentionally throws — if migrateContent calls it, this test fails.
      () => {
        throw new Error('resolver should not be called for hex tokens in jj→git direction');
      },
      '/tmp/x.md',
    );
    expect(r.content).toBe(input);
    expect(r.orphans).toEqual([]);
  });

  it('git→jj regex does not match pure [k-z] tokens (alphabet disjoint)', () => {
    // Symmetric: GIT_SHA_RE is /(?<![0-9a-fA-F])([0-9a-f]{7,40})(?![0-9a-fA-F])/.
    // A pure [k-z] token like 'kxnzlnrntwou' has no hex digits, so cannot match.
    const input = 'See `kxnzlnrntwou` here.';
    const r = migrateContent(
      input,
      'git→jj',
      () => {
        throw new Error('resolver should not be called for [k-z] tokens in git→jj direction');
      },
      '/tmp/x.md',
    );
    expect(r.content).toBe(input);
    expect(r.orphans).toEqual([]);
  });
});

describe('migrateContent — idempotency (D-04.2 invariant)', () => {
  it('is idempotent: re-run on already-migrated content is a no-op', () => {
    // Content holds only jj change_ids; direction is git→jj (looking for SHAs).
    // Resolver is never invoked because the regex never matches.
    const input = 'Already migrated: `kxnzlnrntwou` and `mmmnnnppqqss`.';
    const direction: MigrationDirection = 'git→jj';
    const r = migrateContent(
      input,
      direction,
      () => {
        throw new Error('resolver should not be called when no matches present');
      },
      '/tmp/x.md',
    );
    expect(r.content).toBe(input);
    expect(r.orphans).toEqual([]);
  });
});

describe('migrateContent — regex stateful-lastIndex defence', () => {
  it('two calls in sequence reset lastIndex correctly', () => {
    // GIT_SHA_RE is module-scoped and stateful. migrateContent must reset
    // lastIndex on entry. Two back-to-back calls on different inputs must
    // both find their respective matches.
    GIT_SHA_RE.lastIndex = 7; // simulate a prior leaked lastIndex
    const r1 = migrateContent(
      'X `abc1234` Y',
      'git→jj',
      fixedResolver({ abc1234: { kind: 'resolved', targetId: 'kkkkkkkkmmmm' } }),
      '/tmp/x.md',
    );
    expect(r1.content).toBe('X `kkkkkkkkmmmm` Y');

    JJ_CID_RE.lastIndex = 99; // and again before the second call
    const r2 = migrateContent(
      'X `kxnzlnrntwou` Y',
      'jj→git',
      fixedResolver({ kxnzlnrntwou: { kind: 'resolved', targetId: 'abc1234' } }),
      '/tmp/x.md',
    );
    expect(r2.content).toBe('X `abc1234` Y');
  });
});
