/**
 * Phase 6 plan 06-01 probe — RESEARCH Assumption A1:
 * jj change_id alphabet excludes hex digits (k-z reversed-base32 only).
 *
 * Closes A1 with real-binary evidence so plan 06-02 can rely on the
 * disjointness of git-SHA regex /[0-9a-f]{7,40}/ vs jj-change-id regex
 * /[k-z]{8,12}/ without manual collision review.
 *
 * Skipped when jj binary is unavailable.
 */

import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

let jjAvailable = false;
try {
  execSync('jj --version', { stdio: 'pipe' });
  jjAvailable = true;
} catch {
  jjAvailable = false;
}

describe.skipIf(!jjAvailable)('Phase 6 probe A1: jj change_id alphabet excludes hex digits', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(
      join(tmpdir(), `gsd-phase6-a1-${Math.random().toString(36).slice(2, 10)}-`),
    );
    // Colocated init (matches existing fixture pattern in vcs-fixture.ts).
    execSync('jj git init --colocate', { cwd: dir, stdio: 'pipe' });
    execSync('jj config set --repo user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
    execSync('jj config set --repo user.name "Test"', { cwd: dir, stdio: 'pipe' });
    // Seed 3 squash commits — D-04 raw escape: raw jj inside probe tests is
    // allowed (no-raw-git lint guards GIT, not jj).
    for (const i of [1, 2, 3]) {
      writeFileSync(join(dir, `f${i}.txt`), `seed ${i}\n`);
      execSync(`jj squash -B @ -k -m 'seed ${i}'`, { cwd: dir, stdio: 'pipe' });
    }
  });

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('all change_ids in all() match /^[k-z]+$/ — no hex digits, no a-j', () => {
    const out = execSync(
      `jj log -r 'all()' -T 'change_id ++ "\\n"' --no-graph --no-pager --color never --quiet`,
      { cwd: dir, encoding: 'utf8' },
    );
    const ids = out
      .trim()
      .split(/\n+/)
      .filter((s) => s.length > 0);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      // Must contain ONLY chars in [k-z]. NOT hex (would be [0-9a-f]).
      expect(id).toMatch(/^[k-z]+$/);
      // Explicit anti-assertion: no hex digit (0-9 or a-j) appears.
      expect(id).not.toMatch(/[0-9a-j]/);
    }
  });

  it('commit_id for the same revision IS hex-shaped (disjointness confirmed)', () => {
    const out = execSync(
      `jj log -r '@' -T 'commit_id ++ "\\n"' --no-graph --no-pager --color never --quiet`,
      { cwd: dir, encoding: 'utf8' },
    );
    const commitId = out.trim().split(/\n+/)[0];
    expect(commitId).toMatch(/^[0-9a-f]+$/);
    expect(commitId).not.toMatch(/[g-z]/);
  });
});
