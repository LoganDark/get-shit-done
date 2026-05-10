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

function setupFixture(steps, mode = 'init-with-initial-commit') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-baseline-'));
  if (mode === 'fresh-dir') {
    // No git init; the call site itself runs `git init`. Used by
    // sdk/src/init-runner.ts:139 baseline (Plan 02-06 Task 4).
    return dir;
  }
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
  {
    id: 'worktree-safety-cjs-122-rev-parse-git-dir',
    source: 'get-shit-done/bin/lib/worktree-safety.cjs:122',
    fixture: [],
    args: ['rev-parse', '--git-dir'],
  },
  {
    id: 'worktree-safety-cjs-123-rev-parse-common-dir',
    source: 'get-shit-done/bin/lib/worktree-safety.cjs:123',
    fixture: [],
    args: ['rev-parse', '--git-common-dir'],
  },
  {
    id: 'worktree-safety-cjs-198-worktree-prune',
    source: 'get-shit-done/bin/lib/worktree-safety.cjs:198',
    fixture: [],
    args: ['worktree', 'prune'],
  },
  {
    id: 'init-ts-1009-status-porcelain',
    source: 'sdk/src/query/init.ts:1009',
    fixture: ['echo u > untracked.txt'],
    args: ['status', '--porcelain'],
  },
  {
    id: 'init-ts-1019-version',
    source: 'sdk/src/query/init.ts:1019',
    fixture: [],
    args: ['--version'],
  },
  {
    id: 'init-ts-1138-status-porcelain',
    source: 'sdk/src/query/init.ts:1138',
    fixture: [],
    args: ['status', '--porcelain'],
  },
  {
    id: 'check-ship-ready-ts-38-status',
    source: 'sdk/src/query/check-ship-ready.ts:38',
    fixture: ['echo u > untracked.txt'],
    args: ['status', '--porcelain'],
  },
  {
    id: 'check-ship-ready-ts-41-current-branch',
    source: 'sdk/src/query/check-ship-ready.ts:41',
    fixture: [],
    args: ['rev-parse', '--abbrev-ref', 'HEAD'],
  },
  {
    id: 'check-ship-ready-ts-50-config-get',
    source: 'sdk/src/query/check-ship-ready.ts:50',
    fixture: ['git config branch.main.merge refs/heads/main'],
    args: ['config', '--get', 'branch.main.merge'],
  },
  {
    id: 'check-ship-ready-ts-55-verify-ref',
    source: 'sdk/src/query/check-ship-ready.ts:55',
    fixture: [],
    args: ['rev-parse', '--verify', 'main'],
  },
  {
    id: 'check-ship-ready-ts-60-remote',
    source: 'sdk/src/query/check-ship-ready.ts:60',
    fixture: ['git remote add origin https://x.invalid/y.git'],
    args: ['remote'],
  },
  {
    id: 'init-runner-ts-139-init',
    source: 'sdk/src/init-runner.ts:139',
    fixture: [],
    args: ['init'],
    captureMode: 'fresh-dir', // git init runs in a fresh dir without a prior init
  },
  {
    id: 'progress-ts-286-rev-list-count',
    source: 'sdk/src/query/progress.ts:286',
    fixture: ['echo a > a.txt', 'git add a.txt', 'git commit -m c1', 'echo b > b.txt', 'git add b.txt', 'git commit -m c2'],
    args: ['rev-list', '--count', 'HEAD'],
  },
  {
    id: 'progress-ts-290-rev-list-root',
    source: 'sdk/src/query/progress.ts:290',
    fixture: ['echo a > a.txt', 'git add a.txt', 'git commit -m c1'],
    args: ['rev-list', '--max-parents=0', 'HEAD'],
  },
  // Site 293 takes a runtime SHA; the args+fixture below are the structural
  // baseline (initial-commit SHA fixed, then probe show -s --format=%as on
  // the root). The baseline's expected.stdout is the iso-date of the initial
  // commit, which varies per run — match.stdout uses a regex.
  {
    id: 'progress-ts-293-show-format',
    source: 'sdk/src/query/progress.ts:293',
    fixture: [],
    args: ['show', '-s', '--format=%as', 'HEAD'],
  },
  {
    id: 'check-decision-coverage-ts-385-log-pretty',
    source: 'sdk/src/query/check-decision-coverage.ts:385',
    // Three commits with realistic GSD-shaped subject+body lines so the
    // recorded `--pretty=%s%n%b` byte-output is meaningful for parity
    // assertions. Initial commit is created by setupFixture; these are
    // additional commits on top.
    fixture: [
      'echo a > a.txt',
      'git add a.txt',
      'git commit -m "feat(auth): add login route" -m "Implements D-12 token rotation."',
      'echo b > b.txt',
      'git add b.txt',
      'git commit -m "fix(verify): handle empty hostname" -m "Closes review F7 path traversal guard."',
      'echo c > c.txt',
      'git add c.txt',
      'git commit -m "docs(plan): record D-08 mechanical-only" -m "Body line for D-08 honoring."',
    ],
    args: ['log', '-n', '200', '--pretty=%s%n%b'],
  },
  // Plan 02-07: graphify.cjs (594 LOC, 2 sites). Site 373 reads HEAD via
  // `git rev-parse HEAD` for a resolved SHA; site 384 counts commits across
  // a range expression (`from..to`). Site 384 is the first production
  // consumer of expr.range (the gap-fill factory from plan 02-03).
  {
    id: 'graphify-cjs-373-rev-parse-head',
    source: 'get-shit-done/bin/lib/graphify.cjs:373',
    fixture: [],
    args: ['rev-parse', 'HEAD'],
  },
  {
    id: 'graphify-cjs-384-rev-list-count-range',
    source: 'get-shit-done/bin/lib/graphify.cjs:384',
    // Three additional commits on top of the initial-commit fixture so
    // `main..HEAD` (note: `main` here means the initial commit; we capture
    // against the initial-commit SHA since that's what `built_at_commit`
    // would store at first build) yields a non-trivial count. Args use
    // `HEAD~3..HEAD` so the count is deterministic (= 3) regardless of
    // commit SHAs.
    fixture: [
      'echo a > a.txt',
      'git add a.txt',
      'git commit -m c1',
      'echo b > b.txt',
      'git add b.txt',
      'git commit -m c2',
      'echo c > c.txt',
      'git add c.txt',
      'git commit -m c3',
    ],
    args: ['rev-list', '--count', 'HEAD~3..HEAD'],
  },
];

fs.mkdirSync(OUT, { recursive: true });

for (const b of baselines) {
  const cwd = setupFixture(b.fixture, b.captureMode);
  try {
    const expected = capture5Field(cwd, b.args);
    const fixtureSpec = b.captureMode === 'fresh-dir'
      ? { mode: 'fresh-dir', setup: b.fixture || [] }
      : {
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
    } else if (b.id === 'progress-ts-293-show-format') {
      // Plan 02-06 Task 3: `git show -s --format=%as <sha>` returns the
      // commit's author iso-date (YYYY-MM-DD); the date is the wall-clock
      // capture date so a regex match is appropriate.
      stdoutMatch = 'regex:^[0-9]{4}-[0-9]{2}-[0-9]{2}$';
    } else if (b.id === 'init-runner-ts-139-init') {
      // Plan 02-06 Task 4: `git init` stdout embeds the tmp-dir path so a
      // regex match is the durable assertion (matches the format git emits
      // for both `Initialized empty` and `Reinitialized` cases).
      stdoutMatch = 'regex:^(Initialized|Reinitialized) (empty )?Git repository in ';
    } else if (b.id === 'progress-ts-290-rev-list-root') {
      // Plan 02-06 Task 3: `rev-list --max-parents=0 HEAD` emits the root
      // commit SHA. The author timestamp is wall-clock so the SHA is
      // non-deterministic across captures — a regex is the durable assertion.
      stdoutMatch = 'regex:^[0-9a-f]{40}$';
    } else if (b.id === 'graphify-cjs-373-rev-parse-head') {
      // Plan 02-07: `rev-parse HEAD` emits the full HEAD SHA (40 hex chars).
      // The SHA is non-deterministic (depends on initial-commit author timestamp);
      // regex match is the durable assertion.
      stdoutMatch = 'regex:^[0-9a-f]{40}$';
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
