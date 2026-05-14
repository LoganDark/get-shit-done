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

import { describe, it, expect, vi } from 'vitest';
import { migrateContent, findEligibleZones, GIT_SHA_RE, JJ_CID_RE } from '../rewrite.js';
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

// ─── B-07: zone-targeting + skip kind ──────────────────────────────────────

describe('migrateContent — B-07 zone-targeting (prose is never rewritten)', () => {
  it('does NOT rewrite hex substrings inside English words in prose', () => {
    // `cceeded` is 7 lowercase hex chars inside `succeeded`. Pre-B-07 this
    // tripped the regex and produced an `[orphan:cceeded]` breadcrumb.
    // Post-B-07 the prose zone is excluded entirely — no resolver call,
    // no edit.
    const resolveSpy = vi.fn<(id: string) => ResolveResult>(() => ({ kind: 'unresolvable' }));
    const input = 'A push that "succeeded" but the remote did not show your work.';
    const r = migrateContent(input, 'git→jj', resolveSpy, '/tmp/x.md');
    expect(r.content).toBe(input);
    expect(r.orphans).toEqual([]);
    expect(resolveSpy).not.toHaveBeenCalled();
  });

  it('does NOT rewrite real SHAs that appear only in prose (no backticks)', () => {
    const resolveSpy = vi.fn<(id: string) => ResolveResult>(() => ({
      kind: 'resolved',
      targetId: 'kkkkkkkkmmmm',
    }));
    const input = 'See commit abc1234 for the fix.';
    const r = migrateContent(input, 'git→jj', resolveSpy, '/tmp/x.md');
    expect(r.content).toBe(input);
    expect(r.orphans).toEqual([]);
    expect(resolveSpy).not.toHaveBeenCalled();
  });

  it('DOES rewrite SHAs in inline backtick spans (canonical GSD convention)', () => {
    const resolveSpy = vi.fn<(id: string) => ResolveResult>(() => ({
      kind: 'resolved',
      targetId: 'kkkkkkkkmmmm',
    }));
    const input = 'See `abc1234` for the fix.';
    const r = migrateContent(input, 'git→jj', resolveSpy, '/tmp/x.md');
    expect(r.content).toBe('See `kkkkkkkkmmmm` for the fix.');
    expect(resolveSpy).toHaveBeenCalledWith('abc1234');
  });

  it('does NOT rewrite SHAs inside fenced code blocks (illustrative content)', () => {
    const resolveSpy = vi.fn<(id: string) => ResolveResult>(() => ({
      kind: 'resolved',
      targetId: 'kkkkkkkkmmmm',
    }));
    const input = [
      'Prose before.',
      '```',
      'git log --oneline',
      'abc1234 fix something',
      '```',
      'Prose after.',
    ].join('\n');
    const r = migrateContent(input, 'git→jj', resolveSpy, '/tmp/x.md');
    expect(r.content).toBe(input);
    expect(resolveSpy).not.toHaveBeenCalled();
  });

  it('does NOT rewrite content inside tilde-fenced code blocks', () => {
    const resolveSpy = vi.fn<(id: string) => ResolveResult>(() => ({
      kind: 'resolved',
      targetId: 'kkkkkkkkmmmm',
    }));
    const input = ['Prose.', '~~~', 'abc1234', '~~~', 'After.'].join('\n');
    const r = migrateContent(input, 'git→jj', resolveSpy, '/tmp/x.md');
    expect(r.content).toBe(input);
    expect(resolveSpy).not.toHaveBeenCalled();
  });

  it('does NOT rewrite backticked content with mixed payload (only purely-hex spans)', () => {
    // `abc1234 fix` is a mixed-content span — the rewriter conservatively
    // leaves it alone rather than splicing inside a backtick. Users who
    // want the SHA rewritten put it in its own backtick.
    const resolveSpy = vi.fn<(id: string) => ResolveResult>(() => ({
      kind: 'resolved',
      targetId: 'kkkkkkkkmmmm',
    }));
    const input = 'See `abc1234 fix` for the change.';
    const r = migrateContent(input, 'git→jj', resolveSpy, '/tmp/x.md');
    expect(r.content).toBe(input);
    expect(resolveSpy).not.toHaveBeenCalled();
  });

  it('rewrites frontmatter values on allowlisted commit-bearing keys', () => {
    const resolveSpy = vi.fn<(id: string) => ResolveResult>(() => ({
      kind: 'resolved',
      targetId: 'kkkkkkkkmmmm',
    }));
    const input = [
      '---',
      'resolution_commit: abc1234',
      'status: resolved',
      '---',
      'Body — `abc1234` appears here too.',
    ].join('\n');
    const r = migrateContent(input, 'git→jj', resolveSpy, '/tmp/x.md');
    // Both occurrences rewritten (frontmatter value + backticked body span).
    expect(r.content).toBe([
      '---',
      'resolution_commit: kkkkkkkkmmmm',
      'status: resolved',
      '---',
      'Body — `kkkkkkkkmmmm` appears here too.',
    ].join('\n'));
  });

  it('does NOT rewrite frontmatter values on non-allowlisted keys', () => {
    const resolveSpy = vi.fn<(id: string) => ResolveResult>(() => ({
      kind: 'resolved',
      targetId: 'kkkkkkkkmmmm',
    }));
    const input = [
      '---',
      'author_email: abc1234@example.com',
      'note: deadbeef placeholder',
      '---',
      'Body without backtick.',
    ].join('\n');
    const r = migrateContent(input, 'git→jj', resolveSpy, '/tmp/x.md');
    expect(r.content).toBe(input);
    expect(resolveSpy).not.toHaveBeenCalled();
  });
});

describe('migrateContent — B-07 skip kind (resolver opt-out)', () => {
  it("emits the match verbatim and records NO orphan when resolve returns kind:'skip'", () => {
    const resolveSpy = vi.fn<(id: string) => ResolveResult>(() => ({ kind: 'skip' }));
    const input = 'See `deadbeef` here.';
    const r = migrateContent(input, 'git→jj', resolveSpy, '/tmp/x.md');
    expect(r.content).toBe('See `deadbeef` here.');
    expect(r.orphans).toEqual([]);
    expect(resolveSpy).toHaveBeenCalledWith('deadbeef');
  });

  it("skip and resolved mix correctly within one file", () => {
    const resolveSpy = vi.fn<(id: string) => ResolveResult>((id) => {
      if (id === 'deadbeef') return { kind: 'skip' };
      return { kind: 'resolved', targetId: 'kkkkkkkkmmmm' };
    });
    const input = 'Real `abc1234` and placeholder `deadbeef`.';
    const r = migrateContent(input, 'git→jj', resolveSpy, '/tmp/x.md');
    expect(r.content).toBe('Real `kkkkkkkkmmmm` and placeholder `deadbeef`.');
    expect(r.orphans).toEqual([]);
  });
});

describe('findEligibleZones — direct unit tests', () => {
  it('returns empty set for prose with no backticks or frontmatter', () => {
    const zones = findEligibleZones('plain prose with abc1234 in it');
    expect(zones).toEqual([]);
  });

  it('detects backticked hex spans only when the entire content is hex-shaped', () => {
    const input = '`abc1234` and `not hex content` and `kxnzlnrntwou`';
    const zones = findEligibleZones(input);
    // Two eligible zones: `abc1234` and `kxnzlnrntwou`.
    expect(zones).toHaveLength(2);
    expect(zones[0].source).toBe('backtick');
    expect(input.slice(zones[0].start, zones[0].end)).toBe('abc1234');
    expect(input.slice(zones[1].start, zones[1].end)).toBe('kxnzlnrntwou');
  });

  it('detects frontmatter values on allowlisted keys', () => {
    const input = ['---', 'resolution_commit: abc1234', '---', 'body'].join('\n');
    const zones = findEligibleZones(input);
    expect(zones).toHaveLength(1);
    expect(zones[0].source).toBe('frontmatter');
    expect(input.slice(zones[0].start, zones[0].end)).toBe('abc1234');
  });

  it('skips fenced code blocks entirely', () => {
    const input = ['Before.', '```', '`abc1234`', '```', 'After.'].join('\n');
    const zones = findEligibleZones(input);
    expect(zones).toEqual([]);
  });

  it('honors mid-line ``` as opening a fence and skips through to the close', () => {
    // Markdown sometimes uses ```lang at the start of a line — the regex
    // must treat that line as a fence delimiter.
    const input = ['Before.', '```bash', 'echo abc1234', '```', 'After `abc1234` is eligible.'].join('\n');
    const zones = findEligibleZones(input);
    expect(zones).toHaveLength(1);
    expect(zones[0].source).toBe('backtick');
    expect(input.slice(zones[0].start, zones[0].end)).toBe('abc1234');
  });

  it('does NOT mistake frontmatter on a non-allowlisted key', () => {
    const input = ['---', 'author: deadbeef', '---'].join('\n');
    const zones = findEligibleZones(input);
    expect(zones).toEqual([]);
  });
});
