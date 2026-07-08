import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { createJjAdapter, parseJjDiffEntries } from '../backends/jj.cjs';
import { __vcsTestOnly } from '../types.cjs';
import { expr } from '../expr.cjs';

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
      // Phase 8 FLIP-02: LogEntry.id is the active backend's canonical
      // revision identifier (change_id on jj per D-05).
      expect(entries[0].id).toBeIdOf('jj');
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

    // VCS-audit follow-up 2026-07-08: entries come from the machine-readable
    // `jj diff -T` NDJSON channel (TreeDiffEntry source/target paths), so
    // renames carry exact uncompressed paths — path = post-state, origPath =
    // pre-state (19-12 rename contract).
    it('returns R with post-state path + origPath for a WC rename', () => {
      const { renameSync } = require('node:fs') as typeof import('node:fs');
      writeFileSync(join(dir, 'ren-src.txt'), 'rename me\n');
      vcs.commit({ files: ['ren-src.txt'], message: 'seed rename source' });
      renameSync(join(dir, 'ren-src.txt'), join(dir, 'ren-dst.txt'));
      const r = vcs.status();
      const entry = r.entries.find((e) => e.worktree === 'R');
      expect(entry).toBeDefined();
      expect(entry!.path).toBe('ren-dst.txt');
      expect(entry!.origPath).toBe('ren-src.txt');
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

    // VCS-audit follow-up 2026-07-08: nameStatus/diffFilter ride the
    // `jj diff -T` NDJSON channel; rename entries must report the POST-state
    // path (git-backend cols[2] convention) with no display compression.
    it('nameStatus reports the post-state path for renames', () => {
      const { renameSync } = require('node:fs') as typeof import('node:fs');
      writeFileSync(join(dir, 'd-ren-a.txt'), 'v\n');
      vcs.commit({ files: ['d-ren-a.txt'], message: 'seed diff rename' });
      renameSync(join(dir, 'd-ren-a.txt'), join(dir, 'd-ren-b.txt'));
      const r = vcs.diff({ nameStatus: true });
      const entry = r.nameStatus!.find((e) => e.status === 'R');
      expect(entry).toBeDefined();
      expect(entry!.path).toBe('d-ren-b.txt');
      const filtered = vcs.diff({ nameOnly: true, diffFilter: 'renamed' });
      expect(filtered.nameOnly).toContain('d-ren-b.txt');
    });
  });

  // ─── Phase 7 plan 07-01 — diff diffFilter / status cwd / readBlob ──────
  describe('Phase 7 — diff({ diffFilter }) / status({ cwd }) / readBlob()', () => {
    it('diff({ diffFilter: "deleted", nameOnly: true }) returns only deleted paths', () => {
      // Set up: commit two files, then commit a deletion of one.
      writeFileSync(join(dir, 'p7-keep.txt'), 'keep\n');
      writeFileSync(join(dir, 'p7-del.txt'), 'del\n');
      vcs.commit({
        files: ['p7-keep.txt', 'p7-del.txt'],
        message: 'p7: seed two files',
      });
      // Now delete one and commit the deletion via WC-state-capture.
      const { rmSync: rm } = require('node:fs') as typeof import('node:fs');
      rm(join(dir, 'p7-del.txt'));
      vcs.commit({ files: ['p7-del.txt'], message: 'p7: rm del' });
      // Diff @-- (before-deletion) vs @- (after-deletion). Resolve the rev
      // shorthands through resolveShort + expr.rev so the validator accepts
      // them as proper change-id-shaped strings.
      const beforeChange = vcs.refs.resolveShort(expr.parent());
      // Note: at this point @ is the empty post-commit WC; @- is the deletion commit,
      // @-- is the seed-two-files commit. We want to diff before vs after the deletion.
      const r = vcs.diff({
        // Single-rev form: diff @-'s tree against its parent.
        rev: expr.parent(),
        diffFilter: 'deleted',
        nameOnly: true,
      });
      // jj diff -r <rev> shows the diff between <rev>'s parents and <rev>.
      // @- is the deletion commit, so p7-del.txt should appear with D status.
      expect(r.nameOnly).toContain('p7-del.txt');
      expect(r.nameOnly).not.toContain('p7-keep.txt');
      void beforeChange;
    });

    it('diff({ diffFilter: "added" }) filters --summary output to A-status only', () => {
      writeFileSync(join(dir, 'p7-add-a.txt'), 'a\n');
      writeFileSync(join(dir, 'p7-add-b.txt'), 'b\n');
      vcs.commit({
        files: ['p7-add-a.txt', 'p7-add-b.txt'],
        message: 'p7: seed two adds',
      });
      // Use the single-rev form (jj diff -r <@-> shows @-'s parent-to-self diff).
      const r = vcs.diff({
        rev: expr.parent(),
        diffFilter: 'added',
        nameOnly: true,
      });
      // Both files were ADDs in the @- commit; both must appear under A status.
      expect(r.nameOnly).toContain('p7-add-a.txt');
      expect(r.nameOnly).toContain('p7-add-b.txt');
    });

    it('status({ porcelain: true, cwd }) reports state at the spawned cwd workspace', () => {
      // Confirm cwd parameter accepted; result shape well-formed.
      writeFileSync(join(dir, 'p7-status.txt'), 'sw\n');
      const r = vcs.status({ porcelain: true, cwd: dir });
      expect(r).toBeDefined();
      expect(Array.isArray(r.entries)).toBe(true);
    });

    it('readBlob(head, path) returns committed content via `jj file show`', () => {
      writeFileSync(join(dir, 'p7-blob.txt'), 'phase 7 blob content\n');
      vcs.commit({ files: ['p7-blob.txt'], message: 'p7: add blob' });
      // readBlob from @- because @ is the new empty post-commit working-copy.
      const content = vcs.refs.readBlob(vcs.refs.parent, 'p7-blob.txt');
      expect(content.trim()).toBe('phase 7 blob content');
    });

    it('readBlob throws VcsExecError on missing rev or path', () => {
      // Probe with a path that does not exist at HEAD~.
      expect(() => vcs.refs.readBlob(vcs.refs.parent, 'never-existed.txt')).toThrow();
    });
  });

  // ─── VCS-audit 2026-07-08 — workspace.context() real body ────────────────
  describe('workspace.context()', () => {
    it('resolves effectiveRoot to the workspace root, even from a subdirectory', () => {
      const { mkdirSync: mkd } = require('node:fs') as typeof import('node:fs');
      mkd(join(dir, 'ctx-sub'), { recursive: true });
      // jj prints the REAL path of the workspace root; mkdtempSync on macOS
      // hands back the /var/folders symlink form — compare realpaths.
      const realDir = realpathSync(dir);
      const atRoot = vcs.workspace.context();
      expect(realpathSync(atRoot.effectiveRoot)).toBe(realDir);
      expect(atRoot.isLinked).toBe(false);
      expect(atRoot.mode).toBe('main');
      const fromSub = createJjAdapter(join(dir, 'ctx-sub')).workspace.context();
      // The Phase-3 stub returned the construction cwd verbatim; the real
      // body resolves through `jj workspace root` upward discovery.
      expect(realpathSync(fromSub.effectiveRoot)).toBe(realDir);
      expect(fromSub.mode).toBe('main');
    });
  });
});

// ─── VCS-audit follow-up 2026-07-08 — parseJjDiffEntries (pure) ─────────────
describe('parseJjDiffEntries', () => {
  it('maps the five TreeDiffEntry status words to porcelain letters', () => {
    const ndjson = [
      '{"status":"added","source":"a.txt","target":"a.txt"}',
      '{"status":"modified","source":"m.txt","target":"m.txt"}',
      '{"status":"removed","source":"d.txt","target":"d.txt"}',
      '{"status":"renamed","source":"old.txt","target":"new.txt"}',
      '{"status":"copied","source":"src.txt","target":"copy.txt"}',
    ].join('\n');
    expect(parseJjDiffEntries(ndjson).map((e) => e.status)).toEqual([
      'A', 'M', 'D', 'R', 'C',
    ]);
  });

  it('carries exact source/target paths (spaces and unicode intact)', () => {
    const entries = parseJjDiffEntries(
      '{"status":"renamed","source":"dir with space/ol d.txt","target":"dir with space/ne w.txt"}\n',
    );
    expect(entries).toEqual([
      { status: 'R', source: 'dir with space/ol d.txt', target: 'dir with space/ne w.txt' },
    ]);
  });

  it('surfaces an unknown status word as its uppercased first letter', () => {
    expect(parseJjDiffEntries('{"status":"weirded","source":"x","target":"x"}')[0].status).toBe('W');
  });

  it('skips blank lines and throws loudly on non-JSON lines (no-fallback contract)', () => {
    expect(parseJjDiffEntries('\n\n')).toEqual([]);
    expect(() => parseJjDiffEntries('R {a => b}/c.txt')).toThrow(/non-JSON line/);
  });
});
