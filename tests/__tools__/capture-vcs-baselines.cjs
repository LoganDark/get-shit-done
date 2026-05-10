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
  // Plan 02-08: sdk/src/query/commit.ts (8 sites — 5 in commit/checkCommit
  // routed through the local execGit shim being deleted, plus the 3 sites in
  // commitToSubrepo that used `git -C <dir>` invocation form). The migration
  // moves cwd from `-C` arg position to the createVcsAdapter(projectDir, …)
  // factory, so baselines capture the normalized args (no `-C` prefix) — the
  // semantics are byte-identical to running the same command from that cwd.
  {
    id: 'commit-ts-148-add',
    source: 'sdk/src/query/commit.ts:148',
    // Stage a single file via `git add -- foo`. The `--` separator is the
    // option-injection guard the migration must preserve via vcs.stage.
    fixture: ['echo foo > foo.txt'],
    args: ['add', '--', 'foo.txt'],
  },
  {
    id: 'commit-ts-155-diff-cached',
    source: 'sdk/src/query/commit.ts:155',
    // After staging foo, `diff --cached --name-only -- foo` emits "foo".
    // Adapter equivalent: vcs.diff({staged:true, nameOnly:true, paths:['foo.txt']}).
    fixture: ['echo foo > foo.txt', 'git add -- foo.txt'],
    args: ['diff', '--cached', '--name-only', '--', 'foo.txt'],
  },
  {
    id: 'commit-ts-170-commit',
    source: 'sdk/src/query/commit.ts:170',
    // After staging foo, `commit -m test -- foo` records the commit. The
    // baseline captures stderr/exit shape; commit's stdout varies (sha7) so
    // we use a regex-tolerant match below.
    fixture: ['echo foo > foo.txt', 'git add -- foo.txt'],
    args: ['commit', '-m', 'test', '--', 'foo.txt'],
  },
  {
    id: 'commit-ts-179-rev-parse-short',
    source: 'sdk/src/query/commit.ts:179',
    // After committing, `rev-parse --short HEAD` emits the short SHA.
    // Adapter equivalent: vcs.refs.resolveShort(vcs.refs.head).
    fixture: ['echo foo > foo.txt', 'git add -- foo.txt', 'git commit -m foo'],
    args: ['rev-parse', '--short', 'HEAD'],
  },
  {
    id: 'commit-ts-211-diff-cached',
    source: 'sdk/src/query/commit.ts:211',
    // checkCommit's variant: `diff --cached --name-only` (no pathspec).
    // Adapter equivalent: vcs.diff({staged:true, nameOnly:true}).
    fixture: ['echo foo > foo.txt', 'git add -- foo.txt'],
    args: ['diff', '--cached', '--name-only'],
  },
  {
    id: 'commit-ts-294-add-c-form',
    source: 'sdk/src/query/commit.ts:294',
    // commitToSubrepo's `git -C <dir> add -- <files>` becomes
    // createVcsAdapter(<dir>).stage([files]). The baseline captures the
    // normalized form (no -C) since the migration moves cwd into the factory.
    fixture: ['echo bar > bar.txt'],
    args: ['add', '--', 'bar.txt'],
  },
  {
    id: 'commit-ts-301-commit-c-form',
    source: 'sdk/src/query/commit.ts:301',
    // commitToSubrepo's `git -C <dir> commit -m <msg> -- <files>` becomes
    // createVcsAdapter(<dir>).commit({message, files}). Normalized args drop -C.
    fixture: ['echo bar > bar.txt', 'git add -- bar.txt'],
    args: ['commit', '-m', 'sub', '--', 'bar.txt'],
  },
  {
    id: 'commit-ts-309-rev-parse-c-form',
    source: 'sdk/src/query/commit.ts:309',
    // commitToSubrepo's `git -C <dir> rev-parse --short HEAD` becomes
    // createVcsAdapter(<dir>).refs.resolveShort(refs.head). Normalized args drop -C.
    fixture: ['echo bar > bar.txt', 'git add -- bar.txt', 'git commit -m bar'],
    args: ['rev-parse', '--short', 'HEAD'],
  },
  // Plan 02-09: get-shit-done/bin/lib/commands.cjs (1,028 LOC, 14 sites — 13
  // captured here; the 14th at line 994 already has a baseline from Phase 1).
  // The cmdCommit block (305-352), commitFilesIfDeletion (398-413), and
  // cmdNewWorkspace (917-924) are the three sub-blocks. Per W1 fix from
  // iteration 1, baseline capture lands as a SEPARATE pre-stage commit so the
  // source-migration commit (Task 2) stays under the 15-file threshold.
  {
    id: 'commands-cjs-305-current-branch',
    source: 'get-shit-done/bin/lib/commands.cjs:305',
    // cmdCommit: `execGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])` reads
    // the current branch name to compare against the desired branchName.
    // Adapter equivalent: vcs.refs.currentBranch().
    fixture: [],
    args: ['rev-parse', '--abbrev-ref', 'HEAD'],
  },
  {
    id: 'commands-cjs-308-checkout-b',
    source: 'get-shit-done/bin/lib/commands.cjs:308',
    // cmdCommit: `execGit(cwd, ['checkout', '-b', branchName])` creates and
    // switches to a new branch when the desired branch doesn't exist.
    // Adapter equivalent: vcs.refs.bookmarks.switch(name, { create: true }).
    fixture: [],
    args: ['checkout', '-b', 'feature'],
  },
  {
    id: 'commands-cjs-310-checkout',
    source: 'get-shit-done/bin/lib/commands.cjs:310',
    // cmdCommit: `execGit(cwd, ['checkout', branchName])` switches to an
    // existing branch (taken when the -b form on line 308 errored because
    // the branch already existed). Adapter equivalent:
    // vcs.refs.bookmarks.switch(name).
    fixture: ['git branch feature'],
    args: ['checkout', 'feature'],
  },
  {
    id: 'commands-cjs-330-rm-cached',
    source: 'get-shit-done/bin/lib/commands.cjs:330',
    // cmdCommit (default mode, missing-file branch): `execGit(cwd, ['rm',
    // '--cached', '--ignore-unmatch', file])` stages a deletion when the
    // referenced file is missing on disk. Pitfall 2 / D-08: this stays as
    // ONE adapter call (vcs.unstage). Adapter equivalent: vcs.unstage([file]).
    fixture: ['echo foo > foo.txt', 'git add foo.txt', 'rm foo.txt'],
    args: ['rm', '--cached', '--ignore-unmatch', 'foo.txt'],
  },
  {
    id: 'commands-cjs-332-add',
    source: 'get-shit-done/bin/lib/commands.cjs:332',
    // cmdCommit (else branch): `execGit(cwd, ['add', file])` stages an
    // existing file. Pitfall 2 / D-08: this is the ELSE half of the
    // if(deletion){rm-cached}else{add} block — stays as a separate adapter
    // call (vcs.stage), NOT collapsed with the unstage at line 330. Adapter
    // equivalent: vcs.stage([file]).
    fixture: ['echo foo > foo.txt'],
    args: ['add', 'foo.txt'],
  },
  {
    id: 'commands-cjs-339-commit',
    source: 'get-shit-done/bin/lib/commands.cjs:339',
    // cmdCommit: `execGit(cwd, commitArgs)` performs the actual commit (with
    // optional --amend / --no-verify flags assembled inline above). Adapter
    // equivalent: vcs.commit({message, amend, noVerify}) — consumes the
    // CommitInput gap-fill landed in plan 02-08. Captured against the
    // common path (no --amend, no --no-verify) since the flag-set variants
    // exercise the same git invocation shape minus optional positional args.
    fixture: ['echo foo > foo.txt', 'git add foo.txt'],
    args: ['commit', '-m', 'test'],
  },
  {
    id: 'commands-cjs-352-rev-parse-short',
    source: 'get-shit-done/bin/lib/commands.cjs:352',
    // cmdCommit: `execGit(cwd, ['rev-parse', '--short', 'HEAD'])` reads the
    // short SHA of the just-recorded commit for the result payload. Adapter
    // equivalent: vcs.refs.resolveShort(vcs.refs.head).
    fixture: [],
    args: ['rev-parse', '--short', 'HEAD'],
  },
  {
    id: 'commands-cjs-398-add',
    source: 'get-shit-done/bin/lib/commands.cjs:398',
    // commitFilesIfDeletion (cmdCommitToSubrepo loop): `execGit(repoCwd,
    // ['add', relativePath])` stages a single file in a sub-repo. Adapter
    // equivalent: vcs.stage([relativePath]) on a per-sub-repo adapter
    // instance (cwd-via-factory pattern from 02-08).
    fixture: ['echo bar > bar.txt'],
    args: ['add', 'bar.txt'],
  },
  {
    id: 'commands-cjs-402-commit',
    source: 'get-shit-done/bin/lib/commands.cjs:402',
    // commitFilesIfDeletion: `execGit(repoCwd, ['commit', '-m', message])`
    // performs the commit in the sub-repo. Adapter equivalent:
    // vcs.commit({message}) on the sub-repo adapter instance.
    fixture: ['echo bar > bar.txt', 'git add bar.txt'],
    args: ['commit', '-m', 'msg'],
  },
  {
    id: 'commands-cjs-413-rev-parse-short',
    source: 'get-shit-done/bin/lib/commands.cjs:413',
    // commitFilesIfDeletion: `execGit(repoCwd, ['rev-parse', '--short',
    // 'HEAD'])` reads the short SHA after the sub-repo commit. Adapter
    // equivalent: vcs.refs.resolveShort(vcs.refs.head).
    fixture: [],
    args: ['rev-parse', '--short', 'HEAD'],
  },
  {
    id: 'commands-cjs-917-rev-list-count',
    source: 'get-shit-done/bin/lib/commands.cjs:917',
    // cmdStats: `execGit(cwd, ['rev-list', '--count', 'HEAD'])` counts total
    // commits for the repo statistics report. Adapter equivalent:
    // vcs.refs.countCommits({rev: vcs.refs.head}).
    fixture: ['echo a > a.txt', 'git add a.txt', 'git commit -m c1', 'echo b > b.txt', 'git add b.txt', 'git commit -m c2'],
    args: ['rev-list', '--count', 'HEAD'],
  },
  {
    id: 'commands-cjs-921-rev-list-root',
    source: 'get-shit-done/bin/lib/commands.cjs:921',
    // cmdStats: `execGit(cwd, ['rev-list', '--max-parents=0', 'HEAD'])`
    // resolves the root commit SHA(s) for the first-commit-date probe.
    // Adapter equivalent: vcs.refs.rootCommits({rev: vcs.refs.head}).
    fixture: ['echo a > a.txt', 'git add a.txt', 'git commit -m c1'],
    args: ['rev-list', '--max-parents=0', 'HEAD'],
  },
  // Site 924 takes a runtime SHA (resolved from line 921). The args+fixture
  // below probe `show -s --format=%as HEAD` against the initial commit
  // (structural baseline); the migrated code path uses
  // expr.commit(firstCommit) per Blocker 3 from iteration 1 — first
  // production consumer of expr.commit OUTSIDE the SDK layer (progress.ts
  // was the first overall, in plan 02-06). Mirrors the
  // progress-ts-293-show-format baseline shape.
  {
    id: 'commands-cjs-924-show-format',
    source: 'get-shit-done/bin/lib/commands.cjs:924',
    fixture: [],
    args: ['show', '-s', '--format=%as', 'HEAD'],
  },
  // Plan 02-10: get-shit-done/bin/lib/verify.cjs (1,390 LOC, 6 sites). The
  // cat-file -t probes (71/268/1305) take a runtime SHA and route through
  // vcs.refs.exists(expr.commit(hash)) per Blocker 3 from iteration 1
  // (structured factory closure). Site 1224 consumes LogOpts.allRefs gap-fill.
  // Site 1286 is the "is this a git repo" probe via vcs.refs.exists(vcs.refs.head).
  // Site 1309 consumes DiffOpts.nameStatus gap-fill.
  {
    id: 'verify-cjs-71-cat-file',
    source: 'get-shit-done/bin/lib/verify.cjs:71',
    // cmdVerifySummary: runtime SHA from a SUMMARY.md probe. Use HEAD's full
    // sha as a stand-in — the actual call site receives a 7-40 hex string
    // pattern-matched from arbitrary text. Captured args target HEAD because
    // capture-time the SHA isn't deterministic; the parity dispatch clause
    // probes via expr.commit(<full HEAD sha>).
    fixture: [],
    args: ['cat-file', '-t', 'HEAD'],
  },
  {
    id: 'verify-cjs-268-cat-file',
    source: 'get-shit-done/bin/lib/verify.cjs:268',
    // cmdVerifyCommits: same shape as 71, takes a list of hashes from CLI args.
    fixture: [],
    args: ['cat-file', '-t', 'HEAD'],
  },
  {
    id: 'verify-cjs-1224-log-all',
    source: 'get-shit-done/bin/lib/verify.cjs:1224',
    // cmdVerifySchemaDrift: walks all refs to check for push commits.
    // Adapter equivalent: vcs.log({format:'oneline', maxCount:50, allRefs:true}).
    fixture: [],
    args: ['log', '--oneline', '--all', '-50'],
  },
  {
    id: 'verify-cjs-1286-rev-parse',
    source: 'get-shit-done/bin/lib/verify.cjs:1286',
    // cmdVerifyCodebaseDrift: "is this a git repo" probe. Adapter equivalent:
    // vcs.refs.exists(vcs.refs.head) → boolean. Full HEAD sha output is
    // wall-clock dependent; baseline match is regex.
    fixture: [],
    args: ['rev-parse', 'HEAD'],
  },
  {
    id: 'verify-cjs-1305-cat-file',
    source: 'get-shit-done/bin/lib/verify.cjs:1305',
    // cmdVerifyCodebaseDrift: probe whether a recorded base SHA is reachable
    // before passing it to diff. Same shape as 71/268; expr.commit wrap.
    fixture: [],
    args: ['cat-file', '-t', 'HEAD'],
  },
  {
    id: 'verify-cjs-1309-diff-name-status',
    source: 'get-shit-done/bin/lib/verify.cjs:1309',
    // cmdVerifyCodebaseDrift: paired with 1305 (uses the same `base` SHA). The
    // baseline probes `git diff --name-status <base> HEAD`; for capture we use
    // HEAD as both ends so output is empty (no changes). Adapter equivalent:
    // vcs.diff({rev: expr.commit(base), nameStatus: true}).
    fixture: ['echo a > a.txt', 'git add a.txt', 'git commit -m c1'],
    args: ['diff', '--name-status', 'HEAD~1', 'HEAD'],
  },
  // Plan 02-10: sdk/src/query/verify.ts (692 LOC, 3 sites). Byte-symmetric
  // port of verify.cjs's 71/268/1224 sites — same gap-fill verbs.
  {
    id: 'verify-ts-336-cat-file',
    source: 'sdk/src/query/verify.ts:336',
    fixture: [],
    args: ['cat-file', '-t', 'HEAD'],
  },
  {
    id: 'verify-ts-485-cat-file',
    source: 'sdk/src/query/verify.ts:485',
    fixture: [],
    args: ['cat-file', '-t', 'HEAD'],
  },
  {
    id: 'verify-ts-628-log-all',
    source: 'sdk/src/query/verify.ts:628',
    fixture: [],
    args: ['log', '--oneline', '--all', '-50'],
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
    } else if (
      b.id === 'commit-ts-179-rev-parse-short' ||
      b.id === 'commit-ts-309-rev-parse-c-form'
    ) {
      // Plan 02-08: `rev-parse --short HEAD` emits a 7+ hex short SHA. The
      // SHA depends on the initial-commit author timestamp, so capture-time
      // and replay-time SHAs differ — regex match is the durable assertion.
      stdoutMatch = 'regex:^[0-9a-f]{7,}$';
    } else if (
      b.id === 'commit-ts-170-commit' ||
      b.id === 'commit-ts-301-commit-c-form'
    ) {
      // Plan 02-08: `git commit` stdout embeds the auto-generated short SHA
      // and a free-form summary line; non-deterministic. Match the canonical
      // first-line shape (`[<branch> <short-sha>] <message>`) loosely.
      stdoutMatch = 'regex:^\\[[^ ]+ [0-9a-f]{7,}\\]';
    } else if (
      b.id === 'commands-cjs-352-rev-parse-short' ||
      b.id === 'commands-cjs-413-rev-parse-short'
    ) {
      // Plan 02-09: `rev-parse --short HEAD` emits a 7+ hex short SHA. The
      // SHA depends on the initial-commit author timestamp, so capture-time
      // and replay-time SHAs differ — regex match is the durable assertion.
      // Mirrors plan 02-08's commit-ts-179 / commit-ts-309 pattern.
      stdoutMatch = 'regex:^[0-9a-f]{7,}$';
    } else if (
      b.id === 'commands-cjs-339-commit' ||
      b.id === 'commands-cjs-402-commit'
    ) {
      // Plan 02-09: `git commit -m <msg>` stdout embeds the auto-generated
      // short SHA and the branch name; non-deterministic. Match the canonical
      // first-line shape (`[<branch> <short-sha>] <message>`) loosely. Mirrors
      // plan 02-08's commit-ts-170 / commit-ts-301 pattern.
      stdoutMatch = 'regex:^\\[[^ ]+ [0-9a-f]{7,}\\]';
    } else if (b.id === 'commands-cjs-308-checkout-b') {
      // Plan 02-09: `git checkout -b <name>` emits its switch confirmation on
      // stderr (stdout is empty); the stdout assertion is therefore exact-empty.
      // No regex needed — falls through to the default 'exact' branch.
      stdoutMatch = 'exact';
    } else if (b.id === 'commands-cjs-310-checkout') {
      // Plan 02-09: `git checkout <name>` emits its switch confirmation on
      // stderr (stdout is empty); falls through to the default 'exact' branch.
      stdoutMatch = 'exact';
    } else if (b.id === 'commands-cjs-921-rev-list-root') {
      // Plan 02-09: `rev-list --max-parents=0 HEAD` emits the root commit SHA
      // (40 hex). The author timestamp is wall-clock so the SHA is non-
      // deterministic across captures — regex match is the durable assertion.
      // Mirrors plan 02-06's progress-ts-290 pattern.
      stdoutMatch = 'regex:^[0-9a-f]{40}$';
    } else if (b.id === 'commands-cjs-924-show-format') {
      // Plan 02-09: `git show -s --format=%as HEAD` returns the commit's
      // author iso-date (YYYY-MM-DD); the date is the wall-clock capture date
      // so a regex match is appropriate. Mirrors plan 02-06's progress-ts-293.
      stdoutMatch = 'regex:^[0-9]{4}-[0-9]{2}-[0-9]{2}$';
    } else if (
      b.id === 'verify-cjs-1286-rev-parse'
    ) {
      // Plan 02-10: `rev-parse HEAD` emits the full HEAD SHA (40 hex chars).
      // The SHA depends on the wall-clock initial-commit timestamp; regex
      // match is the durable assertion. Mirrors plan 02-07's
      // graphify-cjs-373-rev-parse-head pattern.
      stdoutMatch = 'regex:^[0-9a-f]{40}$';
    } else if (
      b.id === 'verify-cjs-71-cat-file' ||
      b.id === 'verify-cjs-268-cat-file' ||
      b.id === 'verify-cjs-1305-cat-file' ||
      b.id === 'verify-ts-336-cat-file' ||
      b.id === 'verify-ts-485-cat-file'
    ) {
      // Plan 02-10: `cat-file -t HEAD` emits the constant token "commit". The
      // probe is exit-code-driven (0 = exists, non-zero = absent), so stdout
      // is durable across captures.
      stdoutMatch = 'exact';
    } else if (
      b.id === 'verify-cjs-1224-log-all' ||
      b.id === 'verify-ts-628-log-all'
    ) {
      // Plan 02-10: `log --oneline --all -50` emits one line per ref-reachable
      // commit, each `<short-sha> <subject>`. Short SHAs depend on the
      // wall-clock initial-commit timestamp; the empty-fixture case yields a
      // single line for the initial commit. Match the canonical shape loosely.
      stdoutMatch = 'regex:^[0-9a-f]{7,} initial$';
    } else if (
      b.id === 'verify-cjs-1309-diff-name-status'
    ) {
      // Plan 02-10: `diff --name-status HEAD~1 HEAD` emits one line per changed
      // file (`<status>\t<path>`). The fixture creates one new file, so stdout
      // is the deterministic literal `A\ta.txt`. Use exact match.
      stdoutMatch = 'exact';
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
