import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { createJjAdapter } from '../backends/jj.js';

/**
 * Phase 3 plan 03-05 Task 2: integration tests for `findConflicts()` on the
 * jj backend.
 *
 * Coverage:
 *  - Clean repo: both scopes return []
 *  - Conflicted repo: scope:'all' surfaces the conflicted commit;
 *    scope:'working-copy' filters to @
 *  - rev is commit_id (40-char hex, NOT change_id)
 *  - paths array populated via `jj resolve --list -r <rev>` (PRIMARY path —
 *    empirically verified working on jj 0.41 during plan execution)
 *  - ⚠️ CRITICAL: uses `conflicts()` PLURAL revset (RESEARCH Q1 correction;
 *    upstream docs say singular `conflict()` — doc-fix in plan 03-07)
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

describe.skipIf(!jjAvailable)('Phase 3 plan 03-05 Task 2 — findConflicts on jj', () => {
  let cleanDir: string;
  let conflictDir: string;

  beforeAll(() => {
    // Clean repo — no conflicts
    cleanDir = mkdtempSync(join(tmpdir(), 'gsd-vcs-conflicts-clean-'));
    execSync('jj git init --colocate', { cwd: cleanDir, stdio: 'pipe' });
    execSync('jj config set --repo user.email "test@test.com"', { cwd: cleanDir, stdio: 'pipe' });
    execSync('jj config set --repo user.name "Test"', { cwd: cleanDir, stdio: 'pipe' });

    // Conflict repo — build a merge with diverging content on one file.
    // Sequence (verified locally during plan execution):
    //   1. baseline commit on @, then `jj describe -m 'baseline'`
    //   2. `jj new -m 'branchA'`; modify f.txt
    //   3. `jj new -m 'branchB' '@-'` (sibling on baseline); modify f.txt
    //   4. `jj new <branchA-cid> <branchB-cid> -m 'merge'` (octopus = conflict)
    conflictDir = mkdtempSync(join(tmpdir(), 'gsd-vcs-conflicts-merge-'));
    execSync('jj git init --colocate', { cwd: conflictDir, stdio: 'pipe' });
    execSync('jj config set --repo user.email "test@test.com"', { cwd: conflictDir, stdio: 'pipe' });
    execSync('jj config set --repo user.name "Test"', { cwd: conflictDir, stdio: 'pipe' });

    writeFileSync(join(conflictDir, 'f.txt'), 'baseline\n');
    execSync(`jj describe -m 'baseline'`, { cwd: conflictDir, stdio: 'pipe' });
    execSync(`jj new -m 'branchA'`, { cwd: conflictDir, stdio: 'pipe' });
    writeFileSync(join(conflictDir, 'f.txt'), 'branchA content\n');
    // Snapshot branchA's change_id before moving off
    const branchA = execSync(
      `jj log -r '@' -T 'change_id.short()' --no-graph -n 1`,
      { cwd: conflictDir, encoding: 'utf8' },
    ).trim();
    execSync(`jj new -m 'branchB' '@-'`, { cwd: conflictDir, stdio: 'pipe' });
    writeFileSync(join(conflictDir, 'f.txt'), 'branchB conflicting content\n');
    const branchB = execSync(
      `jj log -r '@' -T 'change_id.short()' --no-graph -n 1`,
      { cwd: conflictDir, encoding: 'utf8' },
    ).trim();
    // Create the merge — jj surfaces the diverging content as a conflict.
    execSync(`jj new ${branchA} ${branchB} -m 'merge'`, { cwd: conflictDir, stdio: 'pipe' });
  });

  afterAll(() => {
    if (cleanDir) rmSync(cleanDir, { recursive: true, force: true });
    if (conflictDir) rmSync(conflictDir, { recursive: true, force: true });
  });

  describe('clean repo', () => {
    it('returns [] on scope:all', () => {
      const vcs = createJjAdapter(cleanDir);
      expect(vcs.findConflicts({ scope: 'all' })).toEqual([]);
    });
    it('returns [] on scope:working-copy', () => {
      const vcs = createJjAdapter(cleanDir);
      expect(vcs.findConflicts({ scope: 'working-copy' })).toEqual([]);
    });
  });

  describe('conflict repo (merge with diverging content)', () => {
    it('scope:all returns at least one ConflictResult', () => {
      const vcs = createJjAdapter(conflictDir);
      const conflicts = vcs.findConflicts({ scope: 'all' });
      expect(conflicts.length).toBeGreaterThanOrEqual(1);
    });

    it('scope:all returns commit_id (40-char hex, NOT change_id)', () => {
      const vcs = createJjAdapter(conflictDir);
      const conflicts = vcs.findConflicts({ scope: 'all' });
      for (const c of conflicts) {
        expect(c.rev).toMatch(/^[a-f0-9]{40}$/);
      }
    });

    it('scope:all returns paths populated via `jj resolve --list`', () => {
      const vcs = createJjAdapter(conflictDir);
      const conflicts = vcs.findConflicts({ scope: 'all' });
      // The conflict scenario only touches f.txt — every conflicted commit
      // surfaced should report f.txt in its paths.
      for (const c of conflicts) {
        expect(c.paths).toContain('f.txt');
      }
    });

    it('scope:all preserves `scope` field on each result', () => {
      const vcs = createJjAdapter(conflictDir);
      const conflicts = vcs.findConflicts({ scope: 'all' });
      for (const c of conflicts) {
        expect(c.scope).toBe('all');
      }
    });

    it('scope:working-copy surfaces @ (the merge commit) since @ is conflicted', () => {
      const vcs = createJjAdapter(conflictDir);
      const conflicts = vcs.findConflicts({ scope: 'working-copy' });
      // @ is the merge — it is conflicted. Working-copy scope filters to @.
      expect(conflicts.length).toBe(1);
      expect(conflicts[0].scope).toBe('working-copy');
      expect(conflicts[0].paths).toContain('f.txt');
    });
  });
});
