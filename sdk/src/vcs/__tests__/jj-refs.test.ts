/**
 * Phase 3 plan 03-03 — integration tests for refs.* + refs.bookmarks.* on
 * the jj backend. Runs against a real jj 0.41 binary in a tmp colocated repo.
 *
 * Gating: the entire suite skips when `jj --version` is unavailable
 * (`describe.skipIf(!jjAvailable)`). The parser-level divergence test below
 * runs unconditionally (no jj binary needed) — that's the canonical D-02
 * coverage that always executes in CI.
 *
 * D-03 round-trip: every `create` test followed by `list` confirms the
 * `gsd/` prefix is stripped on read. D-04 round-trip: `{raw:true}` creates
 * preserve the name verbatim through list.
 *
 * D-02 divergence: the parser-level test feeds the
 * `jj-bookmark-list-divergent.ndjson` fixture through `parseJjBookmarkRecord`
 * and confirms the `VcsBookmarkDivergentError` throw path lights up.
 * Reproducing live divergence via real jj is jj-version-dependent and
 * flaky to script; the parser-level pin gives deterministic coverage of
 * the typed-error contract.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createJjAdapter } from '../backends/jj.js';
import { expr } from '../expr.js';
import {
  VcsBookmarkDivergentError,
  VcsNotImplementedError,
  __vcsTestOnly,
} from '../types.js';
import { parseJjBookmarkRecord } from '../parse/jj-bookmark.js';

// ─── parser-level divergent test (always runs) ─────────────────────────────

describe('Phase 3 plan 03-03 — parseJjBookmarkRecord (D-02 divergence)', () => {
  // Same strip helper as backends/jj.ts uses on the read path.
  const stripPrefix = (name: string): string =>
    name.startsWith('gsd/') ? name.slice('gsd/'.length) : name;

  const fixturePath = join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'tests',
    'fixtures',
    'jj-ndjson',
    'jj-bookmark-list-divergent.ndjson',
  );
  const lines = readFileSync(fixturePath, 'utf-8')
    .split('\n')
    .filter(Boolean);

  it('strips gsd/ prefix on a single-target bookmark (D-03 read half)', () => {
    // Line 0: {"name":"gsd/phase-3","target":["2f5d3b9b..."]}
    const bookmark = parseJjBookmarkRecord(lines[0], stripPrefix);
    expect(bookmark.name).toBe('phase-3');
    expect(bookmark.rev).toBe('2f5d3b9b1c0d4e5f6a7b8c9d0e1f2a3b4c5d6e7f');
  });

  it('throws VcsBookmarkDivergentError on a multi-target bookmark (D-02)', () => {
    // Line 1: {"name":"gsd/divergent-example","target":["aaaa...","bbbb..."]}
    expect(() => parseJjBookmarkRecord(lines[1], stripPrefix)).toThrow(
      VcsBookmarkDivergentError,
    );
  });

  it('VcsBookmarkDivergentError carries bookmarkName + divergentTargets', () => {
    try {
      parseJjBookmarkRecord(lines[1], stripPrefix);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(VcsBookmarkDivergentError);
      const err = e as VcsBookmarkDivergentError;
      expect(err.bookmarkName).toBe('gsd/divergent-example');
      expect(err.divergentTargets).toEqual([
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      ]);
    }
  });

  it('preserves a raw (non-gsd-prefixed) bookmark name (D-04 read half)', () => {
    // Line 2: {"name":"main","target":["1111..."]}
    const bookmark = parseJjBookmarkRecord(lines[2], stripPrefix);
    expect(bookmark.name).toBe('main');
    expect(bookmark.rev).toBe('1111111111111111111111111111111111111111');
  });

  it('throws a typed Error with line-preview on malformed NDJSON (T-03.02-01 mitigation)', () => {
    expect(() => parseJjBookmarkRecord('{not json}', stripPrefix)).toThrow(
      /malformed NDJSON/,
    );
  });
});

// ─── live integration tests against jj 0.41 ─────────────────────────────────

let jjAvailable = false;
try {
  execSync('jj --version', { stdio: 'pipe' });
  jjAvailable = true;
} catch {
  // jj not available; describe.skipIf below will skip the entire suite.
}

describe.skipIf(!jjAvailable)(
  'Phase 3 plan 03-03 — refs namespace on jj (live)',
  () => {
    let dir: string;
    let vcs: ReturnType<typeof createJjAdapter>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let snapshotHandle: any;

    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), 'gsd-vcs-refs-'));
      execSync('jj git init --colocate', { cwd: dir, stdio: 'pipe' });
      execSync('jj config set --repo user.email "test@test.com"', {
        cwd: dir,
        stdio: 'pipe',
      });
      execSync('jj config set --repo user.name "Test"', {
        cwd: dir,
        stdio: 'pipe',
      });
      // Seed: write a file and squash it into a commit so refs.head /
      // refs.parent / refs.exists / refs.rootCommits all have meaningful state.
      writeFileSync(join(dir, 'seed.txt'), 'seed\n');
      execSync(`jj squash -B @ -k -m "seed commit"`, {
        cwd: dir,
        stdio: 'pipe',
      });
      vcs = createJjAdapter(dir);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      snapshotHandle = (vcs as any)[__vcsTestOnly].snapshot();
    });

    beforeEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vcs as any)[__vcsTestOnly].restore(snapshotHandle);
    });

    afterAll(() => {
      if (dir) rmSync(dir, { recursive: true, force: true });
    });

    // ─── refs.head / refs.parent (no jj call) ────────────────────────────
    it('refs.head equals expr.head() (revexpr only, no jj invocation)', () => {
      expect(vcs.refs.head).toBe(expr.head());
    });
    it('refs.parent equals expr.parent() (revexpr only, no jj invocation)', () => {
      expect(vcs.refs.parent).toBe(expr.parent());
    });

    // ─── refs.exists ─────────────────────────────────────────────────────
    it('refs.exists(expr.head()) returns true on a non-empty repo', () => {
      expect(vcs.refs.exists(expr.head())).toBe(true);
    });
    it('refs.exists(expr.parent()) returns true (parent of @ is the seed commit)', () => {
      expect(vcs.refs.exists(expr.parent())).toBe(true);
    });

    // ─── refs.resolveShort ───────────────────────────────────────────────
    it('refs.resolveShort(expr.parent()) returns non-empty hex string', () => {
      const short = vcs.refs.resolveShort(expr.parent());
      expect(short.length).toBeGreaterThan(0);
      expect(short).toMatch(/^[a-f0-9]+$/);
    });

    // ─── refs.countCommits ───────────────────────────────────────────────
    it('refs.countCommits({rev: expr.head()}) returns >= 1', () => {
      const n = vcs.refs.countCommits({ rev: expr.head() });
      expect(n).toBeGreaterThanOrEqual(1);
    });

    // ─── refs.rootCommits ────────────────────────────────────────────────
    it('refs.rootCommits({}) returns at least one commit_id', () => {
      const roots = vcs.refs.rootCommits({});
      expect(roots.length).toBeGreaterThanOrEqual(1);
      expect(roots[0]).toMatch(/^[a-f0-9]+$/);
    });

    // ─── refs.remotes ────────────────────────────────────────────────────
    it('refs.remotes() returns [] on a fresh repo (no remotes configured)', () => {
      expect(vcs.refs.remotes()).toEqual([]);
    });

    // ─── refs.isIgnored — VcsNotImplementedError ─────────────────────────
    it('refs.isIgnored throws VcsNotImplementedError (audit-confirmed no jj caller)', () => {
      expect(() => vcs.refs.isIgnored('whatever')).toThrow(VcsNotImplementedError);
    });

    // ─── refs.bookmarks — D-03 + D-04 round-trip ─────────────────────────
    it('bookmarks.create + list strips gsd/ prefix on read (D-03 round-trip)', () => {
      vcs.refs.bookmarks.create('phase-3', expr.parent());
      const list = vcs.refs.bookmarks.list();
      const names = list.map((b) => b.name);
      expect(names).toContain('phase-3'); // stripped
      expect(names).not.toContain('gsd/phase-3'); // unprefixed form returned
    });

    it('bookmarks.create with {raw:true} preserves the name verbatim (D-04 round-trip)', () => {
      vcs.refs.bookmarks.create('upstream-track', expr.parent(), { raw: true });
      const names = vcs.refs.bookmarks.list().map((b) => b.name);
      expect(names).toContain('upstream-track'); // no gsd/ added
      expect(names).not.toContain('gsd/upstream-track');
    });

    it('bookmarks.exists threads through addPrefix (D-03 + D-04 both probed)', () => {
      vcs.refs.bookmarks.create('exists-test', expr.parent());
      // With default (prefix-add) path — bookmark exists under gsd/exists-test
      expect(vcs.refs.bookmarks.exists('exists-test')).toBe(true);
      // With {raw:true} — looks up literal 'exists-test', which does NOT exist
      expect(vcs.refs.bookmarks.exists('exists-test', { raw: true })).toBe(false);
    });

    it('bookmarks.move threads through addPrefix (D-03 write half)', () => {
      vcs.refs.bookmarks.create('to-move', expr.parent());
      vcs.refs.bookmarks.move('to-move', expr.parent()); // same target — should succeed
      expect(vcs.refs.bookmarks.exists('to-move')).toBe(true);
    });

    it('bookmarks.delete threads through addPrefix (D-03 write half)', () => {
      vcs.refs.bookmarks.create('to-delete', expr.parent());
      expect(vcs.refs.bookmarks.exists('to-delete')).toBe(true);
      vcs.refs.bookmarks.delete('to-delete');
      expect(vcs.refs.bookmarks.exists('to-delete')).toBe(false);
    });

    it('bookmarks.switch throws VcsNotImplementedError (audit-confirmed no jj caller)', () => {
      expect(() => vcs.refs.bookmarks.switch('whatever')).toThrow(VcsNotImplementedError);
    });

    // ─── refs.currentBookmarks ───────────────────────────────────────────
    it('currentBookmarks() returns names at @- with gsd/ stripped (D-03 read half)', () => {
      vcs.refs.bookmarks.create('phase-current', expr.parent());
      const current = vcs.refs.currentBookmarks();
      expect(current).toContain('phase-current'); // stripped, not 'gsd/phase-current'
    });

    it('currentBookmarks() returns [] when no bookmarks point at @-', () => {
      // Fresh repo (post-restore) has no bookmarks
      expect(vcs.refs.currentBookmarks()).toEqual([]);
    });
  },
);
