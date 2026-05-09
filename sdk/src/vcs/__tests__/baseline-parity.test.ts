/**
 * baseline-parity.test.ts (Plan 01-03 Task 3 — B-1 / GIT-02 SC-2)
 *
 * Loads each tests/baselines/git-vcs/*.snap.json, recreates the fixture, runs the
 * adapter's equivalent vcs.* method, and asserts byte-identity against `expected`.
 *
 * For non-deterministic stdout (e.g., `git --version` differs by host), the JSON's
 * `match.stdout` is `regex:<pattern>` and we compare with a regex; otherwise exact.
 *
 * The test also asserts the underlying execGit call (5-field shape) byte-equals
 * the recorded baseline — that's the lowest-level GIT-02 contract. The adapter's
 * verb-level equivalence (e.g. vcs.diff({staged:true,nameOnly:true}) matches the
 * raw `git diff --cached --name-only` stdout) is asserted separately.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createVcsAdapter } from '../index.js';
import { execGit } from '../exec.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
// HERE = sdk/src/vcs/__tests__/  → repo root is 4 levels up.
const BASELINES_DIR = join(HERE, '..', '..', '..', '..', 'tests', 'baselines', 'git-vcs');

interface Baseline {
  id: string;
  source: string;
  fixture: { config: string[]; setup: string[] };
  command: string;
  args: string[];
  expected: {
    exitCode: number;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    error: 'Error' | null;
  };
  match?: { stdout?: string };
}

function initFixture(setup: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'gsd-baseline-test-'));
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' });
  execSync('git config commit.gpgsign false', { cwd: dir, stdio: 'pipe' });
  execSync('git config tag.gpgsign false', { cwd: dir, stdio: 'pipe' });
  execSync('git commit --allow-empty -m initial', { cwd: dir, stdio: 'pipe' });
  // WR-05: `shell: true` routes through cmd.exe on Windows and /bin/sh elsewhere.
  // The hard-coded `/bin/sh` path used to ENOENT on Windows runners.
  for (const cmd of setup) execSync(cmd, { cwd: dir, stdio: 'pipe', shell: true });
  return dir;
}

describe('GIT-02 byte-identity baselines (B-1)', () => {
  const files = readdirSync(BASELINES_DIR).filter((f) => f.endsWith('.snap.json'));
  expect(files.length).toBeGreaterThanOrEqual(5);

  for (const f of files) {
    const baseline: Baseline = JSON.parse(readFileSync(join(BASELINES_DIR, f), 'utf-8'));
    it(`${baseline.id} matches ${baseline.source}`, () => {
      const cwd = initFixture(baseline.fixture.setup ?? []);
      try {
        // Direct execGit (5-field) is the canonical GIT-02 equivalent.
        const got = execGit(cwd, baseline.args);
        const norm = {
          exitCode: got.exitCode,
          stdout: got.stdout,
          stderr: got.stderr,
          timedOut: got.timedOut,
          error: got.error ? 'Error' : null,
        };
        if (baseline.match?.stdout?.startsWith('regex:')) {
          const re = new RegExp(baseline.match.stdout.slice('regex:'.length));
          expect(norm.stdout).toMatch(re);
          // Compare remaining fields exactly (omit stdout from both).
          const { stdout: _gotOut, ...restGot } = norm;
          const { stdout: _expOut, ...restExp } = baseline.expected;
          void _gotOut;
          void _expOut;
          expect(restGot).toEqual(restExp);
        } else {
          expect(norm).toEqual(baseline.expected);
        }

        // Adapter-level equivalence (the actual GIT-02 SC: the adapter's API surface).
        const vcs = createVcsAdapter(cwd);
        if (vcs.kind !== 'git') throw new Error('expected git adapter');
        const args = baseline.args;
        if (
          args[0] === 'diff' &&
          args.includes('--cached') &&
          args.includes('--name-only')
        ) {
          const d = vcs.diff({ staged: true, nameOnly: true });
          expect(d.nameOnly.join('\n')).toBe(baseline.expected.stdout);
        } else if (args[0] === 'status' && args.includes('--porcelain')) {
          const s = vcs.status({ porcelain: true });
          expect(s.raw).toBe(baseline.expected.stdout);
        } else if (args[0] === '--version') {
          const v = vcs.gitOnly.version();
          expect(v).toMatch(/^git version /);
        }
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });
  }
});
