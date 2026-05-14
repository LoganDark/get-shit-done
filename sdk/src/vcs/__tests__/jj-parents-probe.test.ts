/**
 * Phase 6 plan 06-01 probe — RESEARCH Assumption A6 (new, symmetric to A5):
 * jj `x-` revset operator returns ONLY direct parents (depth-1 ancestry),
 * not transitive ancestors.
 *
 * Closes A6 with real-binary evidence so plan 06-02's orphan walker can
 * call `expr.parents(expr.rev(cursor))` → `(<inner>)-` and trust it
 * returns a depth-1 frontier (no ancestor filtering in JS required).
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

function jjCmd(cwd: string, args: string): string {
  return execSync(`jj ${args} --no-pager --color never --quiet`, {
    cwd,
    encoding: 'utf8',
  }).trim();
}

describe.skipIf(!jjAvailable).sequential(
  'Phase 6 probe A6: jj x- operator returns ONLY direct parents (depth-1 ancestry)',
  () => {
    let dir: string;
    let changeA: string;
    let changeB: string;
    let changeC: string;

    beforeAll(() => {
      dir = mkdtempSync(
        join(tmpdir(), `gsd-phase6-a6-${Math.random().toString(36).slice(2, 10)}-`),
      );
      execSync('jj git init --colocate', { cwd: dir, stdio: 'pipe' });
      execSync('jj config set --repo user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
      execSync('jj config set --repo user.name "Test"', { cwd: dir, stdio: 'pipe' });
      // Build A → B → C lineage via squash (matches the A5 probe).
      writeFileSync(join(dir, 'a.txt'), 'A\n');
      jjCmd(dir, `squash -B @ -k -m 'A'`);
      changeA = jjCmd(dir, `log -r '@-' -T 'change_id' --no-graph -n 1`);
      writeFileSync(join(dir, 'b.txt'), 'B\n');
      jjCmd(dir, `squash -B @ -k -m 'B'`);
      changeB = jjCmd(dir, `log -r '@-' -T 'change_id' --no-graph -n 1`);
      writeFileSync(join(dir, 'c.txt'), 'C\n');
      jjCmd(dir, `squash -B @ -k -m 'C'`);
      changeC = jjCmd(dir, `log -r '@-' -T 'change_id' --no-graph -n 1`);
    });

    afterAll(() => {
      if (dir) rmSync(dir, { recursive: true, force: true });
    });

    it('jj revset (B)- returns ONLY direct parents — A, not the root', () => {
      const out = jjCmd(dir, `log -r '(${changeB})-' -T 'change_id ++ "\\n"' --no-graph`);
      const ids = out.split(/\n+/).filter((s) => s.length > 0);
      // depth-1: only A, not the implicit root() ancestor of A.
      expect(ids).toContain(changeA);
      expect(ids).not.toContain(changeB); // x- does not include x itself
      expect(ids).not.toContain(changeC); // and definitely not the descendant
      expect(ids.length).toBe(1);
    });

    it('jj revset (C)- returns ONLY B', () => {
      const out = jjCmd(dir, `log -r '(${changeC})-' -T 'change_id ++ "\\n"' --no-graph`);
      const ids = out.split(/\n+/).filter((s) => s.length > 0);
      expect(ids).toContain(changeB);
      expect(ids).not.toContain(changeA); // transitive ancestor excluded
      expect(ids).not.toContain(changeC);
      expect(ids.length).toBe(1);
    });

    it('ancestors (::x) DOES include transitive parents — establishes that x- is strictly stricter', () => {
      const out = jjCmd(dir, `log -r '::${changeC}' -T 'change_id ++ "\\n"' --no-graph`);
      const ids = out.split(/\n+/).filter((s) => s.length > 0);
      expect(ids).toContain(changeA);
      expect(ids).toContain(changeB);
      expect(ids).toContain(changeC);
    });
  },
);
