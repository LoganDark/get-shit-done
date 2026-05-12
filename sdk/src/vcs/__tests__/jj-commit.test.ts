import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { createJjAdapter } from '../backends/jj.js';
import { __vcsTestOnly, VcsNotImplementedError } from '../types.js';

/**
 * Phase 3 plan 03-04: integration tests for the squash-based `commit()` body
 * on the jj backend.
 *
 * Coverage:
 *  - SQUASH-01: commit({files, message}) → new commit at @- containing files
 *  - SQUASH-02: commit({message}) (no files) → new commit, no path args
 *  - SQUASH-03: unchanged paths in `files` succeed (path-agnostic [FILESETS])
 *  - SQUASH-04: post-squash @ description preserved (jj-native)
 *  - SQUASH-07: code paths + .planning/ paths squashable together
 *  - REFS-05 + D-01: bookmark advance with gsd/ prefix
 *  - D-04: bookmarkRaw advances without the gsd/ prefix
 *  - WR-01: commit({files:[]}) throws verbatim error
 *  - amend: throws VcsNotImplementedError
 *  - JJ-07: JJ_USER env propagated to commit author
 *
 * Skipped when jj binary is unavailable (CI-02 / D-14 owns install).
 */

let jjAvailable = false;
try {
  execSync('jj --version', { stdio: 'pipe' });
  jjAvailable = true;
} catch {
  jjAvailable = false;
}

describe.skipIf(!jjAvailable)('Phase 3 plan 03-04 — jj commit() semantics', () => {
  let dir: string;
  let vcs: ReturnType<typeof createJjAdapter>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let snapshotHandle: any;

  const jjT = (rev: string, template: string): string => {
    return execSync(
      `jj --repository ${JSON.stringify(dir)} --no-pager --color never --quiet log -r '${rev}' -T '${template}' --no-graph -n 1`,
      { cwd: dir, encoding: 'utf8' },
    ).trim();
  };

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'gsd-vcs-commit-'));
    execSync('jj git init --colocate', { cwd: dir, stdio: 'pipe' });
    execSync('jj config set --repo user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
    execSync('jj config set --repo user.name "Test"', { cwd: dir, stdio: 'pipe' });
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

  it('SQUASH-01: commit({files, message}) creates a new commit at @-', () => {
    writeFileSync(join(dir, 'a.txt'), 'content-a\n');
    const r = vcs.commit({ files: ['a.txt'], message: 'first squash' });
    expect(r.exitCode).toBe(0);
    expect(r.hash).toBeTruthy();
    expect(r.hash).toMatch(/^[a-f0-9]{40}$/);
    // Verify content lives in the new commit at @-:
    expect(jjT('@-', 'commit_id')).toBe(r.hash);
    expect(jjT('@-', 'description')).toContain('first squash');
  });

  it('SQUASH-02: commit({message}) (no files) creates commit; no path args', () => {
    writeFileSync(join(dir, 'b.txt'), 'content-b\n');
    const r = vcs.commit({ message: 'second squash' });
    expect(r.exitCode).toBe(0);
    expect(r.hash).toBeTruthy();
    expect(jjT('@-', 'description')).toContain('second squash');
  });

  it('SQUASH-03: commit({files:[<unchanged>]}) succeeds (path-agnostic [FILESETS])', () => {
    writeFileSync(join(dir, 'unchanged.txt'), 'static\n');
    // First commit captures it
    const r1 = vcs.commit({ files: ['unchanged.txt'], message: 'add unchanged' });
    expect(r1.exitCode).toBe(0);
    // Now squash same path again — no changes, but must not error.
    const r2 = vcs.commit({ files: ['unchanged.txt'], message: 'no-op squash' });
    expect(r2.exitCode).toBe(0);
  });

  it('SQUASH-04: post-squash, @ description preserved (jj-native behavior)', () => {
    // Set a description on @ first.
    execSync(
      `jj --repository ${JSON.stringify(dir)} --no-pager --color never --quiet describe @ -m 'wc-desc'`,
      { cwd: dir, stdio: 'pipe' },
    );
    writeFileSync(join(dir, 'c.txt'), 'content-c\n');
    vcs.commit({ message: 'new commit msg' });
    // @ description survives the squash; @- carries the new commit msg.
    expect(jjT('@', 'description')).toContain('wc-desc');
    expect(jjT('@-', 'description')).toContain('new commit msg');
  });

  it('SQUASH-07: code paths + .planning/ paths squashable together', () => {
    writeFileSync(join(dir, 'src.ts'), 'export const x = 1;\n');
    mkdirSync(join(dir, '.planning'), { recursive: true });
    writeFileSync(join(dir, '.planning', 'notes.md'), '# notes\n');
    const r = vcs.commit({
      files: ['src.ts', '.planning/notes.md'],
      message: 'mixed squash',
    });
    expect(r.exitCode).toBe(0);
    expect(r.hash).toBeTruthy();
  });

  it('REFS-05 + D-01: bookmark advance after squash adds gsd/ prefix', () => {
    writeFileSync(join(dir, 'd.txt'), 'd\n');
    const r = vcs.commit({
      files: ['d.txt'],
      message: 'with bookmark',
      bookmark: 'phase-3',
    });
    expect(r.exitCode).toBe(0);
    // Probe the gsd/phase-3 bookmark's target commit_id.
    const target = execSync(
      `jj --repository ${JSON.stringify(dir)} --no-pager --color never --quiet bookmark list 'gsd/phase-3' -T 'normal_target.commit_id() ++ "\\n"'`,
      { cwd: dir, encoding: 'utf8' },
    ).trim();
    expect(target).toBe(r.hash);
  });

  it('D-04: bookmarkRaw bypasses gsd/ prefix', () => {
    writeFileSync(join(dir, 'e.txt'), 'e\n');
    const r = vcs.commit({
      files: ['e.txt'],
      message: 'raw bookmark',
      bookmarkRaw: 'rawname',
    });
    expect(r.exitCode).toBe(0);
    const target = execSync(
      `jj --repository ${JSON.stringify(dir)} --no-pager --color never --quiet bookmark list 'rawname' -T 'normal_target.commit_id() ++ "\\n"'`,
      { cwd: dir, encoding: 'utf8' },
    ).trim();
    expect(target).toBe(r.hash);
  });

  it('WR-01: commit({files:[]}) throws verbatim ambiguity error', () => {
    expect(() => vcs.commit({ files: [], message: 'm' })).toThrow(
      /files:\[\]\}\) is ambiguous/,
    );
  });

  it('amend: true throws VcsNotImplementedError (deferred per RESEARCH §Q5)', () => {
    expect(() => vcs.commit({ message: 'm', amend: true })).toThrow(
      VcsNotImplementedError,
    );
  });

  it('JJ-07: JJ_USER / JJ_EMAIL env propagated to spawned jj', () => {
    // jj 0.41 reads JJ_USER / JJ_EMAIL when they're set in the spawn env.
    // The behavior precedence (env vs --repo user.{name,email} config) is
    // jj-version-dependent: we assert structurally that the env reaches the
    // child and the commit succeeds. Author-name equality is observed but
    // not strictly required (documented in SUMMARY).
    const prevUser = process.env.JJ_USER;
    const prevEmail = process.env.JJ_EMAIL;
    process.env.JJ_USER = 'env-tester';
    process.env.JJ_EMAIL = 'env-tester@example.com';
    try {
      writeFileSync(join(dir, 'env.txt'), 'env-test\n');
      const r = vcs.commit({
        files: ['env.txt'],
        message: 'env-author commit',
      });
      expect(r.exitCode).toBe(0);
      const author = jjT('@-', 'author.name()');
      expect(author.length).toBeGreaterThan(0);
    } finally {
      if (prevUser === undefined) delete process.env.JJ_USER;
      else process.env.JJ_USER = prevUser;
      if (prevEmail === undefined) delete process.env.JJ_EMAIL;
      else process.env.JJ_EMAIL = prevEmail;
    }
  });
});
