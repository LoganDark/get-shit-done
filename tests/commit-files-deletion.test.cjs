/**
 * Regression test for #2014: gsd-tools commit --files silently deletes
 * planning files when a filename passed via --files does not exist on disk.
 *
 * Prior to this fix, when --files STATE.md was passed and STATE.md did not
 * exist on disk, the code called `git rm --cached --ignore-unmatch STATE.md`
 * which staged and committed a deletion. The caller passed explicit --files
 * expecting only those specific files to be staged -- missing files should
 * be skipped, not deleted.
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { createTempGitProject, cleanup, runGsdTools } = require('./helpers.cjs');
// Plan 02-09 D-06 paired retarget: setup (stage + commit) and post-state
// probes (diff between adjacent commits) route through the VcsAdapter.
const { createVcsAdapter } = require('../sdk/dist-cjs/vcs/index.js');
const { expr } = require('../sdk/dist-cjs/vcs/index.js');

describe('commit --files: missing files must not stage deletions (#2014)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempGitProject();
    // Commit STATE.md so it exists in git history
    fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), '# State\n\nInitial state.\n');
    const vcs = createVcsAdapter(tmpDir, { kind: 'git' });
    // Plan 2.1-04: vcs.commit({files}) captures WC state via `git add -A --
    // <files>` then `git commit -m`; the upstream stage is no longer required.
    // The #2014 invariant under test (caller-side pre-probe in cmdCommit)
    // remains intact — see assertions below.
    vcs.commit({ message: 'add STATE.md', files: ['.planning/STATE.md'] });
    // Delete STATE.md from disk -- now missing but tracked in git
    fs.unlinkSync(path.join(tmpDir, '.planning', 'STATE.md'));
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  // Plan 02-09 D-06: post-state diff probe via vcs.diff({rev, nameStatus}).
  // The structured DiffNameStatusEntry[] form replaces the prior raw
  // `git diff HEAD~1 HEAD --name-status` text-grep. expr.range(parent, head)
  // translates to `HEAD~1..HEAD` per the plan-02-03 range gap-fill.
  function nameStatusBetween(cwd) {
    const probe = createVcsAdapter(cwd, { kind: 'git' });
    try {
      return probe.diff({ rev: expr.range(expr.parent(), expr.head()), nameStatus: true })
        .nameStatus ?? [];
    } catch {
      // No HEAD~1 (only one commit) — treat as no diff.
      return null;
    }
  }

  test('passing --files for a missing tracked file does not commit a deletion', () => {
    // STATE.md is tracked in git but deleted from disk.
    // commit --files .planning/STATE.md should skip it (no deletion committed).
    runGsdTools(
      ['commit', 'test commit', '--files', '.planning/STATE.md'],
      tmpDir
    );

    // Check via vcs.diff({range, nameStatus}): the new commit (HEAD) must
    // NOT have deleted STATE.md. Returns null if HEAD~1 is missing, which
    // is also acceptable (no second commit landed).
    const entries = nameStatusBetween(tmpDir);
    if (entries === null) return;
    assert.ok(
      !entries.some(e => e.status === 'D' && e.path === '.planning/STATE.md'),
      'commit --files must not commit a deletion of a missing file, entries were:\n' + JSON.stringify(entries)
    );
  });

  test('passing --files for a file that exists stages and commits it normally', () => {
    // Create ROADMAP.md -- this file exists, should be staged normally
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), '# Roadmap\n\nPhase 01.\n');

    const result = runGsdTools(
      ['commit', 'add roadmap', '--files', '.planning/ROADMAP.md'],
      tmpDir
    );

    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.committed, true, 'should have committed when file exists');

    // Verify ROADMAP.md was added in the commit
    const entries = nameStatusBetween(tmpDir);
    assert.ok(
      entries && entries.some(e => e.status === 'A' && e.path === '.planning/ROADMAP.md'),
      'ROADMAP.md should appear as added in the commit, entries were:\n' + JSON.stringify(entries)
    );
  });

  test('--files with mix of existing and missing files only stages the existing ones', () => {
    // ROADMAP.md exists on disk, STATE.md does not
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), '# Roadmap\n');

    runGsdTools(
      ['commit', 'partial files', '--files', '.planning/ROADMAP.md', '.planning/STATE.md'],
      tmpDir
    );

    // The commit must not include a deletion of STATE.md
    const entries = nameStatusBetween(tmpDir);
    if (entries === null) return; // nothing committed is fine
    assert.ok(
      !entries.some(e => e.status === 'D' && e.path === '.planning/STATE.md'),
      'missing file in --files list must not be committed as a deletion'
    );
  });
});
