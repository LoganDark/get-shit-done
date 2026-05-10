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
import { expr } from '../expr.js';
import { execGit } from '../exec.js';
import { readWorktreeList as readWorktreePorcelain } from '../parse/worktree-list.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
// HERE = sdk/src/vcs/__tests__/  → repo root is 4 levels up.
const BASELINES_DIR = join(HERE, '..', '..', '..', '..', 'tests', 'baselines', 'git-vcs');

interface Baseline {
  id: string;
  source: string;
  // `mode: 'fresh-dir'` indicates the call site itself runs `git init` (Plan
  // 02-06 Task 4 — init-runner.ts:139). All other baselines use the
  // standard init+initial-commit fixture shape.
  fixture: { config?: string[]; setup: string[]; mode?: 'fresh-dir' };
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

function initFixture(baseline: Baseline): string {
  const dir = mkdtempSync(join(tmpdir(), 'gsd-baseline-test-'));
  if (baseline.fixture.mode === 'fresh-dir') {
    // The captured call site itself runs `git init` (sdk/src/init-runner.ts:139).
    return dir;
  }
  const setup = baseline.fixture.setup ?? [];
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
      const cwd = initFixture(baseline);
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
        } else if (
          args[0] === 'rev-list' &&
          args.includes('--count') &&
          !args.some((a) => a.includes('..'))
        ) {
          // Plan 02-06 Task 3: vcs.refs.countCommits({rev}) wraps
          // `git rev-list --count <rev>`. Plan 02-07 disambiguates range
          // forms (`A..B`) from single-rev forms (`HEAD`) — the range
          // shape routes through the dedicated dispatch clause below.
          const n = vcs.refs.countCommits({ rev: vcs.refs.head });
          expect(String(n)).toBe(baseline.expected.stdout);
        } else if (
          args[0] === 'rev-list' &&
          args.some((a) => a.startsWith('--max-parents='))
        ) {
          // Plan 02-06 Task 3: vcs.refs.rootCommits({rev}) wraps
          // `git rev-list --max-parents=0 <rev>`. Returns a string[] of root
          // SHAs. Compare the joined newline output against the captured
          // baseline (or against the regex match for non-deterministic SHAs).
          const roots = vcs.refs.rootCommits({ rev: vcs.refs.head });
          const joined = roots.join('\n');
          if (baseline.match?.stdout?.startsWith('regex:')) {
            const re = new RegExp(baseline.match.stdout.slice('regex:'.length));
            expect(joined).toMatch(re);
          } else {
            expect(joined).toBe(baseline.expected.stdout);
          }
        } else if (
          args[0] === 'show' &&
          args.includes('-s') &&
          args.some((a) => a.startsWith('--format=%as'))
        ) {
          // Plan 02-06 Task 3 / Blocker-3 closure: progress.ts:293 wraps
          // `git show -s --format=%as <sha>` via vcs.log({rev: expr.commit(sha),
          // maxCount:1}) and slices entries[0].date.slice(0,10). The runtime
          // SHA target here is HEAD's first parent or the root — for the
          // baseline, we use HEAD itself (the captured fixture has only the
          // initial commit). Resolve HEAD's sha via vcs.refs.resolveShort
          // expanded back to full via the adapter's structured contract.
          // Match form: regex `^YYYY-MM-DD$` (date drift is wall-clock).
          // Resolve full HEAD sha via execGit fallback for the lookup target,
          // wrap as expr.commit, then call vcs.log.
          const headRes = execGit(cwd, ['rev-parse', 'HEAD']);
          const fullSha = headRes.stdout.trim();
          const entries = vcs.log({ rev: expr.commit(fullSha), maxCount: 1 });
          const date = entries[0]?.date?.slice(0, 10) ?? '';
          if (baseline.match?.stdout?.startsWith('regex:')) {
            const re = new RegExp(baseline.match.stdout.slice('regex:'.length));
            expect(date).toMatch(re);
          } else {
            expect(date).toBe(baseline.expected.stdout);
          }
        } else if (args[0] === 'init' && args.length === 1) {
          // Plan 02-06 Task 4: vcs.gitOnly.init() wraps `git init`.
          // The canonical execGit call above already initialized the dir,
          // so this re-invocation hits git's "Reinitialized existing"
          // branch — both stdout strings match the regex pattern recorded
          // on the baseline.
          vcs.gitOnly.init(); // returns void; throws on non-zero exit
          // Behavior assertion is the canonical exit-code check above; the
          // adapter side just confirms init() runs cleanly to completion.
          expect(true).toBe(true);
        } else if (
          args[0] === 'rev-parse' &&
          args.length === 2 &&
          args[1] === 'HEAD'
        ) {
          // Plan 02-07: graphify.cjs:373 wraps `git rev-parse HEAD` via
          // `vcs.refs.resolveShort(vcs.refs.head)` (full→short SHA shape
          // change is documented inline at the call site). The adapter call
          // returns a 7+ hex string; the canonical execGit call (above)
          // captures the full 40-hex form for the SAME fresh fixture.
          // Assert the adapter result is a hex prefix of the canonical
          // run's stdout (not baseline.expected.stdout, which was recorded
          // against a different fixture instance).
          const got = execGit(cwd, baseline.args);
          const fullSha = got.stdout.trim();
          const short = vcs.refs.resolveShort(vcs.refs.head);
          expect(short).toMatch(/^[0-9a-f]+$/);
          expect(fullSha.startsWith(short)).toBe(true);
        } else if (
          args[0] === 'rev-list' &&
          args.includes('--count') &&
          args.some((a) => a.includes('..'))
        ) {
          // Plan 02-07: graphify.cjs:384 wraps `git rev-list --count A..B`
          // via `vcs.refs.countCommits({rev: expr.range(expr.commit(from),
          // expr.commit(to))})`. Site 384 is the first production consumer of
          // the expr.range factory introduced in plan 02-03. The captured
          // fixture builds 3 commits on top of the initial commit and
          // probes `HEAD~3..HEAD` (exit 0, stdout "3"). For the adapter
          // assertion, resolve HEAD and HEAD~3 to full SHAs and pass through
          // expr.commit + expr.range to exercise the same code path.
          const headRes = execGit(cwd, ['rev-parse', 'HEAD']);
          const baseRes = execGit(cwd, ['rev-parse', 'HEAD~3']);
          const headSha = headRes.stdout.trim();
          const baseSha = baseRes.stdout.trim();
          const n = vcs.refs.countCommits({
            rev: expr.range(expr.commit(baseSha), expr.commit(headSha)),
          });
          expect(String(n)).toBe(baseline.expected.stdout);
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
