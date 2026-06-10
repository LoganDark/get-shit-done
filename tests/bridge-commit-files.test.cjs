'use strict';

/**
 * tests/bridge-commit-files.test.cjs — Phase 19 plan 19-11 Task 2.
 *
 * Replaces tests/bug-2767-gsd-sdk-commit-files-flag.test.cjs (the fork SDK
 * CLI it exercised retired with upstream ADR-0174; ledgered in
 * 19-MERGE-AUDIT.md). The #2767 semantics survive through the PORT-02
 * bridge: `gsd-tools query commit <message> --files <subset>` must commit
 * ONLY the named files — never silently widen to `.planning/` — and the
 * subject must be the message argument alone (no positional-path leakage).
 *
 * Backend: a tmp jj repo with `vcs.adapter: jj` pinned in
 * `.planning/config.json`, so the test also pins the unified-revision-model
 * envelope shape on jj (19-06/19-07: `id`, never `hash`, and no full
 * commit_id surfaces from the jj backend).
 *
 * Raw `jj` invocations here are fixture setup / cross-checks (the same
 * pattern as tests/helpers.cjs's jj lanes) — the no-raw-git rule covers git.
 */

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createTempDir, cleanup, runGsdTools } = require('./helpers.cjs');

function jjAvailable() {
  try {
    execFileSync('jj', ['--version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function jj(cwd, args) {
  return execFileSync('jj', args, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

/** Parse the trailing JSON object from gsd-tools stdout. */
function parseEnvelope(output) {
  const lastBrace = output.indexOf('{');
  assert.ok(lastBrace >= 0, `expected JSON envelope in output, got:\n${output}`);
  return JSON.parse(output.slice(lastBrace));
}

describe(
  'bug-2767 semantics through the bridge: gsd-tools query commit --files (tmp jj repo)',
  { skip: jjAvailable() ? false : 'jj not on PATH' },
  () => {
    let tmpDir;

    before(() => {
      tmpDir = createTempDir('gsd-bridge-2767-');
      jj(tmpDir, ['git', 'init', '--colocate', '.']);
      jj(tmpDir, ['config', 'set', '--repo', 'user.email', 'test@test.com']);
      jj(tmpDir, ['config', 'set', '--repo', 'user.name', 'Test']);
      fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
      // Pin the jj adapter (colocated repos auto-detect git without the pin).
      fs.writeFileSync(
        path.join(tmpDir, '.planning', 'config.json'),
        JSON.stringify({ vcs: { adapter: 'jj' }, commit_docs: true }),
      );
      fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'state\n');
      fs.writeFileSync(path.join(tmpDir, 'foo.md'), 'foo body\n');
      fs.writeFileSync(path.join(tmpDir, 'bar.md'), 'bar body\n');
      fs.writeFileSync(path.join(tmpDir, 'baz.md'), 'baz body\n');
    });

    after(() => {
      if (tmpDir) cleanup(tmpDir);
    });

    test('--files <subset> commits EXACTLY the named files with a clean subject', () => {
      const message = 'test(#2767): bridge commit --files subset';
      const r = runGsdTools(['query', 'commit', message, '--files', 'foo.md', 'bar.md'], tmpDir);
      assert.equal(r.exitCode, 0, `bridge commit failed: ${r.output || r.stderr}`);
      const json = parseEnvelope(r.output);
      assert.equal(json.committed, true, `commit failed: ${JSON.stringify(json)}`);
      assert.equal(json.reason, 'committed');

      // Unified revision model (19-06/19-07): the envelope key is `id`
      // (short change_id on jj) — never `hash`, never a full 40-hex
      // commit_id leaked from the colocated git side.
      assert.ok(typeof json.id === 'string' && json.id.length > 0, `expected non-empty id, got: ${JSON.stringify(json)}`);
      assert.ok(!('hash' in json), 'envelope must not carry the retired git-only `hash` key');
      assert.ok(!('commit_id' in json), 'envelope must not surface a commit_id key on jj');
      assert.ok(!/^[0-9a-f]{40}$/.test(json.id), 'id must not be a full 40-hex commit_id');

      // jj-side cross-check: the recorded commit (@-) contains EXACTLY the
      // two named files — baz.md and .planning/ must NOT leak in (#2767).
      const summary = jj(tmpDir, ['diff', '-r', '@-', '--summary']).split('\n').filter(Boolean).sort();
      assert.deepEqual(summary, ['A bar.md', 'A foo.md']);

      // Subject is the message argument only — no positional-path leakage.
      const subject = jj(tmpDir, ['log', '--no-graph', '-r', '@-', '-T', 'description.first_line()']);
      assert.equal(subject, message);

      // The unrelated working-copy changes survive uncommitted.
      const wc = jj(tmpDir, ['diff', '-r', '@', '--summary']);
      assert.match(wc, /baz\.md/, 'baz.md must remain in the working copy');
      assert.match(wc, /\.planning\//, '.planning/ changes must remain in the working copy');
    });

    test('no --files: falls back to the .planning/ catch-all scope only', () => {
      const message = 'chore(#2767): planning sync (default scope)';
      const r = runGsdTools(['query', 'commit', message], tmpDir);
      assert.equal(r.exitCode, 0, `bridge commit failed: ${r.output || r.stderr}`);
      const json = parseEnvelope(r.output);
      assert.equal(json.committed, true, `commit failed: ${JSON.stringify(json)}`);

      // Every committed path is under .planning/; baz.md stays out.
      const summary = jj(tmpDir, ['diff', '-r', '@-', '--summary']).split('\n').filter(Boolean);
      assert.ok(summary.length > 0, 'default-scope commit must record .planning/ changes');
      for (const line of summary) {
        assert.match(line, /^\w+ \.planning\//, `default scope must only commit .planning/ paths, got: ${line}`);
      }
      const wc = jj(tmpDir, ['diff', '-r', '@', '--summary']);
      assert.match(wc, /baz\.md/, 'baz.md must remain in the working copy after the default-scope commit');
    });
  },
);
