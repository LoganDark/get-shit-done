/**
 * Phase 6 plan 06-01 probe — RESEARCH Assumption A5:
 * jj `x+` revset operator returns ONLY direct children (depth-1), not
 * transitive descendants.
 *
 * Closes A5 with real-binary evidence so plan 06-02's orphan walker can
 * call `expr.children(rev)` → `<inner>+` and trust it returns a depth-1
 * frontier (no descendant filtering in JS required).
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
  'Phase 6 probe A5: jj x+ operator returns ONLY direct children (depth-1)',
  () => {
    let dir: string;
    let changeA: string;
    let changeB: string;
    let changeC: string;

    beforeAll(() => {
      dir = mkdtempSync(
        join(tmpdir(), `gsd-phase6-a5-${Math.random().toString(36).slice(2, 10)}-`),
      );
      execSync('jj git init --colocate', { cwd: dir, stdio: 'pipe' });
      execSync('jj config set --repo user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
      execSync('jj config set --repo user.name "Test"', { cwd: dir, stdio: 'pipe' });
      // Build A → B → C lineage via squash. After each squash, @- is the
      // newly-squashed commit and @ is the new empty working-copy commit.
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

    it('children of A returns ONLY B, not C', () => {
      const out = jjCmd(dir, `log -r '${changeA}+' -T 'change_id ++ "\\n"' --no-graph`);
      const ids = out.split(/\n+/).filter((s) => s.length > 0);
      expect(ids).toContain(changeB);
      expect(ids).not.toContain(changeC);
      expect(ids).not.toContain(changeA); // x+ does not include x itself
    });

    it('children of B returns ONLY C', () => {
      const out = jjCmd(dir, `log -r '${changeB}+' -T 'change_id ++ "\\n"' --no-graph`);
      const ids = out.split(/\n+/).filter((s) => s.length > 0);
      expect(ids).toContain(changeC);
      expect(ids).not.toContain(changeA);
      expect(ids).not.toContain(changeB);
    });

    it('descendants (x::) DOES include transitive children — establishes that x+ is strictly stricter', () => {
      const out = jjCmd(dir, `log -r '${changeA}::' -T 'change_id ++ "\\n"' --no-graph`);
      const ids = out.split(/\n+/).filter((s) => s.length > 0);
      expect(ids).toContain(changeA); // x:: includes x
      expect(ids).toContain(changeB);
      expect(ids).toContain(changeC);
    });
  },
);
