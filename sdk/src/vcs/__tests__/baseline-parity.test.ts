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
import { readWorktreeList as readWorktreePorcelain } from '../parse/worktree-list.js';

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
        } else if (
          args[0] === 'worktree' &&
          args.includes('list') &&
          args.includes('--porcelain')
        ) {
          // Plan 02-04 Task 1 (D-01 smoke-test): the SDK-local parser at
          // sdk/src/vcs/parse/worktree-list.ts is the migration target for
          // get-shit-done/bin/lib/worktree-safety.cjs:80. Compare its
          // porcelain output against the captured raw-git baseline.
          const result = readWorktreePorcelain(cwd);
          expect(result.ok).toBe(true);
          // Same regex match as the baseline (path + sha vary across runs).
          expect(result.porcelain).toMatch(/^worktree [^\n]+\nHEAD [0-9a-f]{40}\nbranch refs\/heads\/[^\n]+$/);
        } else if (
          args[0] === 'rev-parse' &&
          (args.includes('--git-dir') || args.includes('--git-common-dir'))
        ) {
          // Plan 02-04 Task 2: vcs.workspace.context() exposes gitDir and
          // gitCommonDir as absolute paths (path.resolve'd in the adapter).
          // The raw baseline is a relative `.git` because cwd IS the repo
          // root; the adapter's absolute form must end with `/.git` (or its
          // OS-native equivalent) for a non-linked main worktree.
          const ctx = vcs.workspace.context();
          const which = args.includes('--git-dir') ? ctx.gitDir : ctx.gitCommonDir;
          // Adapter applies path.resolve(cwd, '.git'); equivalent in absolute form.
          const expectedAbsolute = require('node:path').resolve(cwd, baseline.expected.stdout);
          expect(which).toBe(expectedAbsolute);
        } else if (
          args[0] === 'worktree' &&
          args.includes('prune')
        ) {
          // Plan 02-04 Task 2: vcs.workspace.prune() runs `git worktree prune`
          // and returns an ExecResult. Compare exitCode/stdout/stderr against
          // the captured baseline.
          const r = vcs.workspace.prune();
          expect({
            exitCode: r.exitCode,
            stdout: r.stdout,
            stderr: r.stderr,
            timedOut: r.timedOut,
          }).toEqual({
            exitCode: baseline.expected.exitCode,
            stdout: baseline.expected.stdout,
            stderr: baseline.expected.stderr,
            timedOut: baseline.expected.timedOut,
          });
        } else if (
          args[0] === 'rev-parse' &&
          args.includes('--abbrev-ref') &&
          args.includes('HEAD')
        ) {
          // Plan 02-06 Task 1: vcs.refs.currentBranch() wraps
          // `git rev-parse --abbrev-ref HEAD`, returning string | null.
          // The baseline records the raw stdout (e.g. "master"); the adapter
          // returns the same name (or null when detached).
          const name = vcs.refs.currentBranch();
          expect(name).toBe(baseline.expected.stdout);
        } else if (args[0] === 'config' && args.includes('--get')) {
          // Plan 02-06 Task 1: vcs.gitOnly.configGet returns the value (exit 0)
          // or null (exit 1). Baseline records exit 0 + value for this shape.
          const key = args[args.indexOf('--get') + 1];
          const value = vcs.gitOnly.configGet(key);
          expect(value).toBe(baseline.expected.stdout);
        } else if (
          args[0] === 'rev-parse' &&
          args.includes('--verify') &&
          !args.includes('--abbrev-ref')
        ) {
          // Plan 02-06 Task 1: vcs.refs.bookmarks.exists wraps
          // `git rev-parse --verify --quiet <name>`. The baseline captures
          // either the resolved sha (exit 0) or a fatal stderr (exit 128).
          const name = args[args.indexOf('--verify') + 1];
          const exists = vcs.refs.bookmarks.exists(name);
          expect(exists).toBe(baseline.expected.exitCode === 0);
        } else if (args[0] === 'remote' && args.length === 1) {
          // Plan 02-06 Task 1: vcs.refs.remotes() wraps `git remote`.
          const remoteList = vcs.refs.remotes();
          expect(remoteList.join('\n')).toBe(baseline.expected.stdout);
        } else if (args[0] === 'log' && args.includes('--pretty=%s%n%b')) {
          // Plan 02-06 Task 2 (Blocker-1 fix): check-decision-coverage.ts:385
          // routes through vcs.log({maxCount}) and reconstructs the byte-
          // equivalent `--pretty=%s%n%b` output as `subject\nbody` per entry,
          // joined by `\n`, then trimmed to match the captured baseline.
          // The contract extension landed in this commit populates LogEntry.body.
          const limit = parseInt(args[args.indexOf('-n') + 1], 10);
          const entries = vcs.log({ maxCount: limit });
          const reconstructed = entries
            .map((e) => `${e.subject}\n${e.body ?? ''}`)
            .join('\n')
            .trim();
          expect(reconstructed).toBe(baseline.expected.stdout);
        }
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });
  }
});
