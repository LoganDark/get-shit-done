'use strict';

/**
 * tests/v15-query-commit-envelope.test.cjs — v15-query-commit-envelope-defects.
 *
 * Defect 1: the `gsd-tools query commit` success envelope's `id` must be the
 * CREATED commit's revision id (backend-computed CommitResult.id), never a
 * re-resolution of refs.head. On git, head after commit IS the created
 * commit, so the old behavior happened to be correct there. On jj, the
 * squash-model commit (`jj squash -B @ -k`) leaves @ as a NEW EMPTY change —
 * the old head-keyed envelope reported the same WC change_id for every
 * commit in a session instead of the created commit at @-.
 *
 * Defect 2: absolute --files paths previously reached the #2014
 * missing-path filter as `path.join(cwd, '/abs/path')`, which concatenates
 * on POSIX instead of re-rooting — every absolute path was filtered out and
 * the explicit-files short-circuit returned a silent `nothing_to_commit`
 * with exit 0, never attempting the commit. Absolute paths under the repo
 * root now normalize to repo-relative (realpath-aware, so macOS /var →
 * /private/var symlinked tmp roots resolve correctly); absolute paths
 * outside the repo root fail loudly with `reason: 'path_outside_repo'`.
 *
 * Defect 3: WC deletions were inexpressible via --files — the #2014
 * missing-path filter drops any path absent from disk, so a deleted path
 * always produced a misleading `nothing_to_commit` (or was silently dropped
 * from a mixed list). Fix: `--allow-deletions` opts in to committing missing
 * paths that the WC status reports as changed (pending deletions); without
 * the flag, behavior is unchanged but the envelope surfaces the dropped
 * paths via `skipped_deletions` + `hint`. The #2014 invariant itself stays
 * regression-tested in tests/commit-files-deletion.test.cjs.
 *
 * Raw `jj`/`git` invocations here are fixture setup / cross-checks
 * (tests/**\/*.test.cjs allowlist entry).
 */

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createTempDir, cleanup, runGsdTools } = require('./helpers.cjs');

function toolAvailable(tool) {
  try {
    execFileSync(tool, ['--version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function jj(cwd, args) {
  return execFileSync('jj', args, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

/** Parse the trailing JSON object from gsd-tools stdout. */
function parseEnvelope(output) {
  const firstBrace = output.indexOf('{');
  assert.ok(firstBrace >= 0, `expected JSON envelope in output, got:\n${output}`);
  return JSON.parse(output.slice(firstBrace));
}

describe(
  'v15 query commit envelope — jj backend (created-commit id + absolute --files)',
  { skip: toolAvailable('jj') ? false : 'jj not on PATH' },
  () => {
    let tmpDir;

    before(() => {
      tmpDir = createTempDir('gsd-v15-envelope-jj-');
      jj(tmpDir, ['git', 'init', '--colocate', '.']);
      jj(tmpDir, ['config', 'set', '--repo', 'user.email', 'test@test.com']);
      jj(tmpDir, ['config', 'set', '--repo', 'user.name', 'Test']);
      fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
      // Pin the jj adapter (colocated repos auto-detect git without the pin).
      fs.writeFileSync(
        path.join(tmpDir, '.planning', 'config.json'),
        JSON.stringify({ vcs: { adapter: 'jj' }, commit_docs: true }),
      );
      fs.writeFileSync(path.join(tmpDir, 'seed.txt'), 'seed\n');
      jj(tmpDir, ['squash', '-B', '@', '-k', '-m', 'seed']);
    });

    after(() => {
      if (tmpDir) cleanup(tmpDir);
    });

    test('Defect 1: envelope id is the created commit (@-), not the post-commit empty @', () => {
      const message = 'test(v15): created-commit id on jj';
      fs.writeFileSync(path.join(tmpDir, 'a.md'), 'a\n');
      const r = runGsdTools(['query', 'commit', message, '--files', 'a.md'], tmpDir);
      assert.equal(r.exitCode, 0, `commit failed: ${r.output || r.stderr}`);
      const json = parseEnvelope(r.output);
      assert.equal(json.committed, true, `commit failed: ${JSON.stringify(json)}`);
      assert.ok(typeof json.id === 'string' && json.id.length > 0, `expected non-empty id, got: ${JSON.stringify(json)}`);

      // The envelope id resolves to the commit whose description is the
      // message just passed (acceptance criterion for Defect 1).
      const desc = jj(tmpDir, ['log', '--no-graph', '-r', json.id, '-T', 'description.first_line()']);
      assert.equal(desc, message, `envelope id '${json.id}' must resolve to the created commit`);

      // ... and it is NOT @'s change_id (the old head-keyed defect shape).
      const wcChangeId = jj(tmpDir, ['log', '--no-graph', '-r', '@', '-T', 'change_id']);
      assert.ok(
        !wcChangeId.startsWith(json.id),
        `envelope id '${json.id}' must not be the post-commit empty @ change_id '${wcChangeId}'`,
      );
    });

    test('Defect 1: two consecutive commits report distinct ids (the observed session symptom)', () => {
      fs.writeFileSync(path.join(tmpDir, 'b.md'), 'b\n');
      const r1 = runGsdTools(['query', 'commit', 'test(v15): commit b', '--files', 'b.md'], tmpDir);
      const json1 = parseEnvelope(r1.output);
      assert.equal(json1.committed, true, JSON.stringify(json1));

      fs.writeFileSync(path.join(tmpDir, 'c.md'), 'c\n');
      const r2 = runGsdTools(['query', 'commit', 'test(v15): commit c', '--files', 'c.md'], tmpDir);
      const json2 = parseEnvelope(r2.output);
      assert.equal(json2.committed, true, JSON.stringify(json2));

      assert.notEqual(
        json1.id,
        json2.id,
        `consecutive commits must report distinct created-commit ids (old defect: both reported @'s stable change prefix)`,
      );
    });

    test('Defect 2: absolute --files path under the repo root commits (no silent nothing_to_commit)', () => {
      const message = 'test(v15): absolute path under root';
      fs.writeFileSync(path.join(tmpDir, 'abs.md'), 'abs\n');
      const r = runGsdTools(['query', 'commit', message, '--files', path.join(tmpDir, 'abs.md')], tmpDir);
      assert.equal(r.exitCode, 0, `commit failed: ${r.output || r.stderr}`);
      const json = parseEnvelope(r.output);
      assert.equal(
        json.committed,
        true,
        `absolute path under the repo root must commit, not '${json.reason}': ${JSON.stringify(json)}`,
      );

      // Cross-check: the created commit contains exactly the named file.
      const summary = jj(tmpDir, ['diff', '-r', '@-', '--summary']).split('\n').filter(Boolean);
      assert.deepEqual(summary, ['A abs.md']);
    });

    test('Defect 2: absolute --files path outside the repo root fails loudly', () => {
      let outsideDir;
      try {
        outsideDir = createTempDir('gsd-v15-outside-');
        const outsideFile = path.join(outsideDir, 'outside.md');
        fs.writeFileSync(outsideFile, 'outside\n');
        const r = runGsdTools(['query', 'commit', 'test(v15): outside path', '--files', outsideFile], tmpDir);
        const json = parseEnvelope(r.output);
        assert.equal(json.committed, false);
        assert.equal(
          json.reason,
          'path_outside_repo',
          `outside-root absolute path must reject loudly, got: ${JSON.stringify(json)}`,
        );
        assert.notEqual(json.reason, 'nothing_to_commit', 'silent no-op is the defect shape');
      } finally {
        if (outsideDir) cleanup(outsideDir);
      }
    });

    test('Defect 3: deleted --files path without the flag reports skipped_deletions', () => {
      fs.writeFileSync(path.join(tmpDir, 'del-a.md'), 'a\n');
      jj(tmpDir, ['squash', '-B', '@', '-k', '-m', 'seed del-a']);
      fs.unlinkSync(path.join(tmpDir, 'del-a.md'));

      const r = runGsdTools(['query', 'commit', 'test(v15): deletion no flag', '--files', 'del-a.md'], tmpDir);
      const json = parseEnvelope(r.output);
      assert.equal(json.committed, false, JSON.stringify(json));
      assert.equal(json.reason, 'nothing_to_commit', JSON.stringify(json));
      assert.deepEqual(json.skipped_deletions, ['del-a.md'], `envelope must name the dropped deletion: ${JSON.stringify(json)}`);
      assert.match(json.hint ?? '', /--allow-deletions/, `hint must point at the flag: ${JSON.stringify(json)}`);

      // The deletion stays a pending WC change (not lost, not committed).
      assert.match(jj(tmpDir, ['status']), /D del-a\.md/);
    });

    test('Defect 3: --allow-deletions commits the deletion (the T-19-02 incident shape)', () => {
      const message = 'test(v15): deletion with flag';
      const r = runGsdTools(['query', 'commit', message, '--files', 'del-a.md', '--allow-deletions'], tmpDir);
      assert.equal(r.exitCode, 0, `commit failed: ${r.output || r.error}`);
      const json = parseEnvelope(r.output);
      assert.equal(json.committed, true, JSON.stringify(json));
      assert.equal(json.skipped_deletions, undefined, 'nothing skipped when the flag is passed');

      // Cross-check: the created commit records exactly the deletion, and
      // the WC no longer carries it (the squash moved it out of @).
      const summary = jj(tmpDir, ['diff', '-r', json.id, '--summary']).split('\n').filter(Boolean);
      assert.deepEqual(summary, ['D del-a.md']);
      assert.doesNotMatch(jj(tmpDir, ['status']), /del-a\.md/);
    });

    test('Defect 3: mixed existing + deleted list without the flag commits the partial set and reports the rest', () => {
      fs.writeFileSync(path.join(tmpDir, 'del-b.md'), 'b\n');
      jj(tmpDir, ['squash', '-B', '@', '-k', '-m', 'seed del-b']);
      fs.unlinkSync(path.join(tmpDir, 'del-b.md'));
      fs.writeFileSync(path.join(tmpDir, 'mix.md'), 'mix\n');

      const r = runGsdTools(['query', 'commit', 'test(v15): mixed no flag', '--files', 'mix.md', 'del-b.md'], tmpDir);
      const json = parseEnvelope(r.output);
      assert.equal(json.committed, true, JSON.stringify(json));
      assert.deepEqual(json.skipped_deletions, ['del-b.md'], JSON.stringify(json));
      const summary = jj(tmpDir, ['diff', '-r', json.id, '--summary']).split('\n').filter(Boolean);
      assert.deepEqual(summary, ['A mix.md'], 'the deletion must NOT ride along without the flag');

      // Follow-up with the flag finishes the job (the self-correction path
      // the envelope hint instructs agents to take).
      const r2 = runGsdTools(['query', 'commit', 'test(v15): mixed follow-up', '--files', 'del-b.md', '--allow-deletions'], tmpDir);
      const json2 = parseEnvelope(r2.output);
      assert.equal(json2.committed, true, JSON.stringify(json2));
      const summary2 = jj(tmpDir, ['diff', '-r', json2.id, '--summary']).split('\n').filter(Boolean);
      assert.deepEqual(summary2, ['D del-b.md']);
    });

    test('Defect 3: never-existed path stays dropped even with --allow-deletions', () => {
      const r = runGsdTools(['query', 'commit', 'test(v15): garbage path', '--files', 'no-such-file.md', '--allow-deletions'], tmpDir);
      const json = parseEnvelope(r.output);
      assert.equal(json.committed, false, JSON.stringify(json));
      assert.equal(json.reason, 'nothing_to_commit', JSON.stringify(json));
      assert.equal(json.skipped_deletions, undefined, 'a path with no WC change is not a skipped deletion');
    });
  },
);

describe(
  'v15 query commit envelope — git backend (created-commit id + absolute --files)',
  { skip: toolAvailable('git') ? false : 'git not on PATH' },
  () => {
    let tmpDir;

    before(() => {
      tmpDir = createTempDir('gsd-v15-envelope-git-');
      git(tmpDir, ['init', '-q', '-b', 'main']);
      git(tmpDir, ['config', 'user.email', 'test@test.com']);
      git(tmpDir, ['config', 'user.name', 'Test']);
      git(tmpDir, ['config', 'commit.gpgsign', 'false']);
      fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, '.planning', 'config.json'),
        JSON.stringify({ vcs: { adapter: 'git' }, commit_docs: true }),
      );
      fs.writeFileSync(path.join(tmpDir, 'seed.txt'), 'seed\n');
      git(tmpDir, ['add', '.']);
      git(tmpDir, ['commit', '-q', '-m', 'seed']);
    });

    after(() => {
      if (tmpDir) cleanup(tmpDir);
    });

    test('Defect 1 parity: envelope id resolves to the created commit carrying the message', () => {
      const message = 'test(v15): created-commit id on git';
      fs.writeFileSync(path.join(tmpDir, 'a.md'), 'a\n');
      const r = runGsdTools(['query', 'commit', message, '--files', 'a.md'], tmpDir);
      assert.equal(r.exitCode, 0, `commit failed: ${r.output || r.stderr}`);
      const json = parseEnvelope(r.output);
      assert.equal(json.committed, true, JSON.stringify(json));
      assert.ok(typeof json.id === 'string' && json.id.length > 0);

      const subject = git(tmpDir, ['log', '-1', '--format=%s', json.id]);
      assert.equal(subject, message, `envelope id '${json.id}' must resolve to the created commit`);
      // On git, head after commit IS the created commit — the fix must not
      // change observable behavior here.
      const headShort = git(tmpDir, ['rev-parse', '--short', 'HEAD']);
      assert.equal(json.id, headShort);
    });

    test('Defect 2: absolute --files path under the repo root commits (no silent nothing_to_commit)', () => {
      const message = 'test(v15): absolute path under root (git)';
      fs.writeFileSync(path.join(tmpDir, 'abs.md'), 'abs\n');
      const r = runGsdTools(['query', 'commit', message, '--files', path.join(tmpDir, 'abs.md')], tmpDir);
      const json = parseEnvelope(r.output);
      assert.equal(
        json.committed,
        true,
        `absolute path under the repo root must commit, not '${json.reason}': ${JSON.stringify(json)}`,
      );
      const files = git(tmpDir, ['show', '--name-only', '--format=', 'HEAD']).split('\n').filter(Boolean);
      assert.deepEqual(files, ['abs.md']);
    });

    test('Defect 2: absolute --files path outside the repo root fails loudly', () => {
      let outsideDir;
      try {
        outsideDir = createTempDir('gsd-v15-outside-git-');
        const outsideFile = path.join(outsideDir, 'outside.md');
        fs.writeFileSync(outsideFile, 'outside\n');
        const r = runGsdTools(['query', 'commit', 'test(v15): outside path (git)', '--files', outsideFile], tmpDir);
        const json = parseEnvelope(r.output);
        assert.equal(json.committed, false);
        assert.equal(json.reason, 'path_outside_repo', JSON.stringify(json));
      } finally {
        if (outsideDir) cleanup(outsideDir);
      }
    });

    test('Defect 3 parity: deleted --files path without the flag reports skipped_deletions', () => {
      fs.writeFileSync(path.join(tmpDir, 'del-a.md'), 'a\n');
      git(tmpDir, ['add', 'del-a.md']);
      git(tmpDir, ['commit', '-q', '-m', 'seed del-a']);
      fs.unlinkSync(path.join(tmpDir, 'del-a.md'));

      const r = runGsdTools(['query', 'commit', 'test(v15): deletion no flag (git)', '--files', 'del-a.md'], tmpDir);
      const json = parseEnvelope(r.output);
      assert.equal(json.committed, false, JSON.stringify(json));
      assert.equal(json.reason, 'nothing_to_commit', JSON.stringify(json));
      assert.deepEqual(json.skipped_deletions, ['del-a.md'], JSON.stringify(json));
      assert.match(json.hint ?? '', /--allow-deletions/, JSON.stringify(json));
      // #2014 invariant intact: nothing was committed, the WC deletion stays.
      assert.match(git(tmpDir, ['status', '--porcelain']), /D del-a\.md/);
    });

    test('Defect 3 parity: --allow-deletions commits the deletion', () => {
      const r = runGsdTools(['query', 'commit', 'test(v15): deletion with flag (git)', '--files', 'del-a.md', '--allow-deletions'], tmpDir);
      assert.equal(r.exitCode, 0, `commit failed: ${r.output || r.error}`);
      const json = parseEnvelope(r.output);
      assert.equal(json.committed, true, JSON.stringify(json));
      assert.equal(json.skipped_deletions, undefined);

      const nameStatus = git(tmpDir, ['show', '--name-status', '--format=', 'HEAD']).split('\n').filter(Boolean);
      assert.deepEqual(nameStatus, ['D\tdel-a.md']);
      assert.doesNotMatch(git(tmpDir, ['status', '--porcelain']), /del-a\.md/);
    });

    test('Defect 3 parity: mixed list without the flag commits the partial set and reports the rest', () => {
      fs.writeFileSync(path.join(tmpDir, 'del-b.md'), 'b\n');
      git(tmpDir, ['add', 'del-b.md']);
      git(tmpDir, ['commit', '-q', '-m', 'seed del-b']);
      fs.unlinkSync(path.join(tmpDir, 'del-b.md'));
      fs.writeFileSync(path.join(tmpDir, 'mix.md'), 'mix\n');

      const r = runGsdTools(['query', 'commit', 'test(v15): mixed no flag (git)', '--files', 'mix.md', 'del-b.md'], tmpDir);
      const json = parseEnvelope(r.output);
      assert.equal(json.committed, true, JSON.stringify(json));
      assert.deepEqual(json.skipped_deletions, ['del-b.md'], JSON.stringify(json));
      const nameStatus = git(tmpDir, ['show', '--name-status', '--format=', 'HEAD']).split('\n').filter(Boolean);
      assert.deepEqual(nameStatus, ['A\tmix.md'], 'the deletion must NOT ride along without the flag');
    });

    test('Defect 3 parity: never-existed path stays dropped even with --allow-deletions', () => {
      const r = runGsdTools(['query', 'commit', 'test(v15): garbage path (git)', '--files', 'no-such-file.md', '--allow-deletions'], tmpDir);
      const json = parseEnvelope(r.output);
      assert.equal(json.committed, false, JSON.stringify(json));
      assert.equal(json.reason, 'nothing_to_commit', JSON.stringify(json));
      assert.equal(json.skipped_deletions, undefined);
    });
  },
);
