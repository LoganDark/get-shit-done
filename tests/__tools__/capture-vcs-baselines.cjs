#!/usr/bin/env node
/**
 * capture-vcs-baselines.cjs (Plan 01-03 Task 3 — B-1 / GIT-02)
 *
 * One-shot baseline capture: for each pre-migration `execSync('git …')` call site
 * named in RESEARCH.md, set up a deterministic tmp-git fixture, run the canonical
 * git invocation, and write a {exitCode, stdout, stderr, timedOut, error} record
 * into tests/baselines/git-vcs/<id>.snap.json.
 *
 * Run: `node scripts/capture-vcs-baselines.cjs`
 * Then commit the produced JSON files. The baseline-parity test asserts each
 * recorded shape matches the adapter's equivalent call byte-identically.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

// __dirname is tests/__tools__/, so the repo root is two levels up.
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(REPO_ROOT, 'tests', 'baselines', 'git-vcs');

function setupFixture(steps) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-baseline-'));
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' });
  execSync('git config commit.gpgsign false', { cwd: dir, stdio: 'pipe' });
  execSync('git config tag.gpgsign false', { cwd: dir, stdio: 'pipe' });
  execSync('git commit --allow-empty -m initial', { cwd: dir, stdio: 'pipe' });
  for (const s of steps || []) {
    // WR-05: `shell: true` routes through cmd.exe on Windows and /bin/sh elsewhere.
    execSync(s, { cwd: dir, stdio: 'pipe', shell: true });
  }
  return dir;
}

function capture5Field(cwd, args, opts) {
  const r = spawnSync('git', args, {
    cwd,
    stdio: 'pipe',
    encoding: 'utf-8',
    timeout: opts && opts.timeout ? opts.timeout : 10000,
  });
  const timedOut =
    r.signal === 'SIGTERM' && r.error && r.error.code === 'ETIMEDOUT';
  return {
    exitCode: r.status == null ? 1 : r.status,
    stdout: (r.stdout == null ? '' : r.stdout).toString().trim(),
    stderr: (r.stderr == null ? '' : r.stderr).toString().trim(),
    timedOut,
    error: r.error ? 'Error' : null,
  };
}

const baselines = [
  {
    id: 'commands-cjs-994-diff-cached',
    source: 'get-shit-done/bin/lib/commands.cjs:994',
    fixture: ['echo a > a.txt', 'git add a.txt'],
    args: ['diff', '--cached', '--name-only'],
  },
  {
    id: 'init-cjs-1519-status-porcelain',
    source: 'get-shit-done/bin/lib/init.cjs:1519',
    fixture: ['echo u > untracked.txt'],
    args: ['status', '--porcelain'],
  },
  {
    id: 'init-cjs-1538-version',
    source: 'get-shit-done/bin/lib/init.cjs:1538',
    fixture: [],
    args: ['--version'],
  },
  {
    id: 'init-cjs-1641-status-porcelain',
    source: 'get-shit-done/bin/lib/init.cjs:1641',
    fixture: [],
    args: ['status', '--porcelain'],
  },
  {
    id: 'commit-ts-execGit-3field',
    source: 'sdk/src/query/commit.ts:211 (checkCommit)',
    fixture: ['echo a > a.txt', 'git add a.txt'],
    args: ['diff', '--cached', '--name-only'],
  },
  {
    id: 'worktree-safety-cjs-80-list-porcelain',
    source: 'get-shit-done/bin/lib/worktree-safety.cjs:80',
    fixture: [],
    args: ['worktree', 'list', '--porcelain'],
  },
];

fs.mkdirSync(OUT, { recursive: true });

for (const b of baselines) {
  const cwd = setupFixture(b.fixture);
  try {
    const expected = capture5Field(cwd, b.args);
    const fixtureSpec = {
      init: 'git init',
      config: [
        'user.email=test@test.com',
        'user.name=Test',
        'commit.gpgsign=false',
        'tag.gpgsign=false',
      ],
      initial_commit: 'git commit --allow-empty -m initial',
      setup: b.fixture,
    };
    // For init-cjs-1538 (`git --version`), stdout differs across hosts; record
    // a regex-friendly placeholder in match.stdout so the parity test compares
    // the exact-text fields exactly and the version string with a regex.
    // For `worktree list --porcelain`, the stdout embeds the fixture's tmpdir
    // path and the initial-commit HEAD sha (both non-deterministic); use a
    // regex that asserts the porcelain shape without pinning the path/sha.
    let stdoutMatch = 'exact';
    if (b.id === 'init-cjs-1538-version') {
      stdoutMatch = 'regex:^git version ';
    } else if (
      b.args[0] === 'worktree' &&
      b.args[1] === 'list' &&
      b.args.includes('--porcelain')
    ) {
      stdoutMatch = 'regex:^worktree [^\\n]+\\nHEAD [0-9a-f]{40}\\nbranch refs/heads/[^\\n]+$';
    }
    const record = {
      id: b.id,
      source: b.source,
      captured_at: new Date().toISOString().slice(0, 10),
      fixture: fixtureSpec,
      command: 'git',
      args: b.args,
      expected,
      match: { stdout: stdoutMatch },
    };
    fs.writeFileSync(
      path.join(OUT, b.id + '.snap.json'),
      JSON.stringify(record, null, 2) + '\n',
    );
    console.log('wrote', b.id);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}
