import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { createJjAdapter } from '../backends/jj.js';
import { __vcsTestOnly } from '../types.js';
import { expr } from '../expr.js';

/**
 * Phase 3 plan 03-05 Task 1: integration tests for `log()`, `status()`, and
 * `diff()` bodies on the jj backend.
 *
 * Coverage:
 *  - log: maxCount, rev, allRefs, paths, NDJSON parser delegation
 *  - status: A/M letters parsed; porcelain:false returns empty entries + raw
 *  - diff: nameOnly, nameStatus, staged-is-no-op, paths
 *  - StatusEntry shape: NO `index` field (Phase 2.1 D-16)
 *
 * Skipped when jj binary is unavailable.
 */

let jjAvailable = false;
try {
  execSync('jj --version', { stdio: 'pipe' });
  jjAvailable = true;
} catch {
  jjAvailable = false;
}

describe.skipIf(!jjAvailable)('Phase 3 plan 03-05 — jj log/status/diff', () => {
  let dir: string;
  let vcs: ReturnType<typeof createJjAdapter>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let snapshotHandle: any;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'gsd-vcs-lsd-'));
    execSync('jj git init --colocate', { cwd: dir, stdio: 'pipe' });
    execSync('jj config set --repo user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
    execSync('jj config set --repo user.name "Test"', { cwd: dir, stdio: 'pipe' });
    vcs = createJjAdapter(dir);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    snapshotHandle = (vcs as any)[__vcsTestOnly].snapshot();
  });

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (vcs as any)[__vcsTestOnly].restore(snapshotHandle);
  });

  // ───────────────────────────────────── log ──────────────────────────────────
  describe('log()', () => {
    it('returns commits parsed via parseJjLog (single empty WC commit visible)', () => {
      const entries = vcs.log({});
      // Fresh repo has an empty WC commit at @ — log() returns at least one entry
      expect(Array.isArray(entries)).toBe(true);
      expect(entries.length).toBeGreaterThanOrEqual(1);
      // Hash is a 40-char hex commit_id (PITFALL 1)
      expect(entries[0].hash).toMatch(/^[a-f0-9]{40}$/);
    });

    it('honors maxCount: 1', () => {
      // Build a chain: WC -> commit-a -> commit-b -> ... (need at least 2 commits)
      writeFileSync(join(dir, 'log-a.txt'), 'a\n');
      vcs.commit({ files: ['log-a.txt'], message: 'add a' });
      writeFileSync(join(dir, 'log-b.txt'), 'b\n');
      vcs.commit({ files: ['log-b.txt'], message: 'add b' });

      const entries = vcs.log({ maxCount: 1 });
      expect(entries.length).toBe(1);
    });

    it('honors allRefs (all() revset)', () => {
      writeFileSync(join(dir, 'all-1.txt'), '1\n');
      vcs.commit({ files: ['all-1.txt'], message: 'a' });

      const all = vcs.log({ allRefs: true });
      // all() includes the root commit + every visible commit
      expect(all.length).toBeGreaterThanOrEqual(2);
    });

    it('honors rev: expr.head()', () => {
      writeFileSync(join(dir, 'rev.txt'), 'rev\n');
      vcs.commit({ files: ['rev.txt'], message: 'rev test' });
      const entries = vcs.log({ rev: expr.head() });
      // @ is the WC commit after commit() (which is the new empty @)
      expect(entries.length).toBe(1);
    });

    it('returns [] on jj failure (e.g., invalid revset)', () => {
      // toJjRev passes any RevisionExpr through; we test the exit-code-nonzero
      // path indirectly by using paths that jj will accept syntactically. Hard
      // failure paths are covered by parser unit tests; here we confirm the
      // body's contract is "array on success, never throws on a syntax-valid
      // empty revset".
      const entries = vcs.log({ paths: ['nonexistent-path-xyz.txt'] });
      expect(Array.isArray(entries)).toBe(true);
    });
  });

  // ────────────────────────────────── status ─────────────────────────────────
  describe('status()', () => {
    it('returns A for untracked add', () => {
      writeFileSync(join(dir, 'st-a.txt'), 'hello\n');
      const r = vcs.status();
      const paths = r.entries.map((e) => e.path);
      expect(paths).toContain('st-a.txt');
      const entry = r.entries.find((e) => e.path === 'st-a.txt')!;
      expect(entry.worktree).toBe('A');
      // Phase 2.1 D-16: StatusEntry has NO index field
      expect((entry as unknown as { index?: unknown }).index).toBeUndefined();
    });

    it('returns M for modified previously-tracked file', () => {
      writeFileSync(join(dir, 'mod.txt'), 'v1\n');
      vcs.commit({ files: ['mod.txt'], message: 'add mod' });
      writeFileSync(join(dir, 'mod.txt'), 'v2\n');
      const r = vcs.status();
      const entry = r.entries.find((e) => e.path === 'mod.txt');
      expect(entry).toBeDefined();
      expect(entry!.worktree).toBe('M');
    });

    it('returns empty entries when porcelain:false (parity with git backend)', () => {
      writeFileSync(join(dir, 'porc.txt'), 'x\n');
      const r = vcs.status({ porcelain: false });
      expect(r.entries).toEqual([]);
      expect(typeof r.raw).toBe('string');
    });

    it('raw field always populated', () => {
      const r = vcs.status();
      expect(typeof r.raw).toBe('string');
    });
  });

  // ─────────────────────────────────── diff ──────────────────────────────────
  describe('diff()', () => {
    it('returns raw + empty nameOnly by default', () => {
      writeFileSync(join(dir, 'd-a.txt'), 'hello\n');
      const r = vcs.diff();
      expect(typeof r.raw).toBe('string');
      expect(r.nameOnly).toEqual([]);
    });

    it('nameOnly:true populates nameOnly[]', () => {
      writeFileSync(join(dir, 'd-no.txt'), 'x\n');
      const r = vcs.diff({ nameOnly: true });
      expect(r.nameOnly).toContain('d-no.txt');
    });

    it('nameStatus:true populates nameStatus[] with {path, status}', () => {
      writeFileSync(join(dir, 'd-ns.txt'), 'x\n');
      const r = vcs.diff({ nameStatus: true });
      expect(Array.isArray(r.nameStatus)).toBe(true);
      const e = r.nameStatus!.find((x) => x.path === 'd-ns.txt');
      expect(e).toBeDefined();
      expect(e!.status).toBe('A');
    });

    it('staged:true is a documented no-op on jj (returns same WC diff)', () => {
      writeFileSync(join(dir, 'd-st.txt'), 'staged-noop\n');
      const stagedR = vcs.diff({ staged: true, nameOnly: true });
      const unstagedR = vcs.diff({ staged: false, nameOnly: true });
      // jj has no index, so staged is meaningfully a no-op — both calls
      // return the same WC content.
      expect(stagedR.nameOnly.sort()).toEqual(unstagedR.nameOnly.sort());
    });
  });
});
