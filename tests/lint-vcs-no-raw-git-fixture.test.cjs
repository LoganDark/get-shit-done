'use strict';
/**
 * Fixture test for the lint-vcs-no-raw-git scanner (Phase 1 plan 05, VCS-07 / D-17 / D-18).
 *
 * Verifies BOTH directions:
 *  - exits 0 on the real repo (allowlist is primed for Phase 1 land state — RESEARCH Pitfall 2)
 *  - exits 1 on a synthesized fixture file containing execSync('git status', ...)
 *  - exits 0 when the fixture line carries the `// vcs-lint:allow-git-here <reason>` annotation
 *
 * W-4: fixtures live under os.tmpdir() with `__lint-fixture-vcs-` prefix and the scanner
 * is invoked with `--scan-root <fixDir>` so production-mode and fixture-mode scans cannot
 * collide. No repo-root pollution; tests can run in any order / in parallel.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'lint-vcs-no-raw-git.cjs');

test('lint-vcs-no-raw-git exits 0 on the current repo (Phase 1 land state)', () => {
  const r = spawnSync(process.execPath, [SCRIPT], { cwd: REPO_ROOT, encoding: 'utf-8' });
  assert.equal(
    r.status, 0,
    'expected exit 0 (clean) but got ' + r.status +
    '\nstderr: ' + r.stderr +
    '\nstdout: ' + r.stdout
  );
});

test('lint-vcs-no-raw-git exits 1 on a fixture containing execSync("git status")', () => {
  const fixDir = fs.mkdtempSync(path.join(os.tmpdir(), '__lint-fixture-vcs-'));
  const fixFile = path.join(fixDir, 'bad.cjs');
  try {
    fs.writeFileSync(
      fixFile,
      "const { execSync } = require('child_process');\n" +
      "execSync('git status', { cwd: '.' });\n"
    );
    const r = spawnSync(process.execPath, [SCRIPT, '--scan-root', fixDir], { encoding: 'utf-8' });
    assert.equal(
      r.status, 1,
      'expected exit 1 (violation) but got ' + r.status + '\nstderr: ' + r.stderr
    );
    assert.match(r.stderr, /lint-vcs-no-raw-git/);
    assert.match(r.stderr, /execSync\('git/);
  } finally {
    fs.rmSync(fixDir, { recursive: true, force: true });
  }
});

test('lint-vcs-no-raw-git exits 1 on a fixture containing execSync("git") (no trailing space)', () => {
  // CR-01: tightened regex must catch `execSync('git')` (no whitespace after `git`)
  // and `execSync(\`git\`)` — bypass surfaces that the original `git\s` pattern missed.
  const fixDir = fs.mkdtempSync(path.join(os.tmpdir(), '__lint-fixture-vcs-'));
  const fixFile = path.join(fixDir, 'bare.cjs');
  try {
    fs.writeFileSync(
      fixFile,
      "const { execSync } = require('child_process');\n" +
      "execSync('git', { cwd: '.' });\n" +
      "execSync(`git`, { cwd: '.' });\n"
    );
    const r = spawnSync(process.execPath, [SCRIPT, '--scan-root', fixDir], { encoding: 'utf-8' });
    assert.equal(
      r.status, 1,
      'expected exit 1 (violation) but got ' + r.status + '\nstderr: ' + r.stderr
    );
    assert.match(r.stderr, /lint-vcs-no-raw-git/);
    assert.match(r.stderr, /execSync\('git/);
  } finally {
    fs.rmSync(fixDir, { recursive: true, force: true });
  }
});

test('inline annotation `// vcs-lint:allow-git-here` exempts a single line', () => {
  const fixDir = fs.mkdtempSync(path.join(os.tmpdir(), '__lint-fixture-vcs-'));
  const fixFile = path.join(fixDir, 'annotated.cjs');
  try {
    fs.writeFileSync(
      fixFile,
      "const { execSync } = require('child_process');\n" +
      "execSync('git status', { cwd: '.' }); // vcs-lint:allow-git-here intentional probe\n"
    );
    const r = spawnSync(process.execPath, [SCRIPT, '--scan-root', fixDir], { encoding: 'utf-8' });
    assert.equal(
      r.status, 0,
      'expected exit 0 (annotation exempts) but got ' + r.status + '\nstderr: ' + r.stderr
    );
  } finally {
    fs.rmSync(fixDir, { recursive: true, force: true });
  }
});
