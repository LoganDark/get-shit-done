'use strict';
/**
 * Fixture test for the lint-vcs-no-raw-git scanner (Phase 1 plan 05, VCS-07 / D-17 / D-18).
 *
 * 19-10 (Phase 19, MERGE-05): ported from the fork's tests/lint-vcs-no-raw-git-fixture.test.cjs
 * (byte-identical at c7bd6bee) to tests/scripts/ and EXTENDED with the .cts
 * positive-detection proofs (Pitfall 8 / T-19-26): both scanners' SCAN_EXT now
 * include `.cts`, and a planted .cts violation MUST be reported — otherwise the
 * gates pass vacuously green over the adopted src/*.cts production tree. Also
 * covers the T-19-28 emitted-artifact walk-ignore (gsd-core/bin/lib generated
 * files skipped; checked-in exceptions still scanned).
 *
 * Verifies BOTH directions:
 *  - exits 0 on the real repo (allowlist re-pointed at the adopted tree in 19-10)
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

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'lint-vcs-no-raw-git.cjs');
const COMMIT_ID_SCRIPT = path.join(REPO_ROOT, 'scripts', 'lint-vcs-no-commit-id.cjs');

test('lint-vcs-no-raw-git exits 0 on the current repo (19-10 re-pointed allowlist)', () => {
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

test('lint-vcs-no-raw-git scans .cts files and REPORTS a planted spawnSync("git") violation (19-10 Pitfall 8)', () => {
  // T-19-26 positive-detection proof: before 19-10 the SCAN_EXT regex omitted
  // `.cts`, so the whole adopted src/*.cts production tree was invisible to the
  // gate (vacuously green). This test plants a violation in a `.cts` file and
  // asserts it is REPORTED — if the extension ever regresses out of SCAN_EXT,
  // this test fails, not the production tree.
  const fixDir = fs.mkdtempSync(path.join(os.tmpdir(), '__lint-fixture-vcs-'));
  const fixFile = path.join(fixDir, 'bad.cts');
  try {
    fs.writeFileSync(
      fixFile,
      "import { spawnSync } from 'node:child_process';\n" +
      "spawnSync('git', ['status'], { cwd: '.' });\n"
    );
    const r = spawnSync(process.execPath, [SCRIPT, '--scan-root', fixDir], { encoding: 'utf-8' });
    assert.equal(
      r.status, 1,
      'expected exit 1 (.cts violation must be reported) but got ' + r.status +
      '\nstderr: ' + r.stderr + '\nstdout: ' + r.stdout
    );
    assert.match(r.stderr, /bad\.cts/);
    assert.match(r.stderr, /spawnSync\('git/);
  } finally {
    fs.rmSync(fixDir, { recursive: true, force: true });
  }
});

test('lint-vcs-no-commit-id scans .cts files and REPORTS a planted .commit_id access (19-10 Pitfall 8)', () => {
  // Same T-19-26 closure for the second scanner: a `.cts` file volunteering
  // commit_id must be reported by lint-vcs-no-commit-id.
  const fixDir = fs.mkdtempSync(path.join(os.tmpdir(), '__lint-fixture-vcs-'));
  const fixFile = path.join(fixDir, 'bad.cts');
  try {
    fs.writeFileSync(
      fixFile,
      "declare const entry: { commit_id: string };\n" +
      "export const leaked = entry.commit_id;\n"
    );
    const r = spawnSync(process.execPath, [COMMIT_ID_SCRIPT, '--scan-root', fixDir], { encoding: 'utf-8' });
    assert.equal(
      r.status, 1,
      'expected exit 1 (.cts violation must be reported) but got ' + r.status +
      '\nstderr: ' + r.stderr + '\nstdout: ' + r.stdout
    );
    assert.match(r.stderr, /bad\.cts/);
    assert.match(r.stderr, /commit_id/);
  } finally {
    fs.rmSync(fixDir, { recursive: true, force: true });
  }
});

test('emitted gsd-core/bin/lib artifacts are walk-ignored; checked-in exceptions stay scanned (19-10 T-19-28)', () => {
  // The build emits gitignored .cjs artifacts under gsd-core/bin/lib/ compiled
  // from the scanned src/*.cts sources — scanning them would double-report
  // every src/ finding. A violation in an emitted-path file must NOT be
  // reported; the same violation in the checked-in exception
  // gsd-core/bin/lib/legacy-cleanup.cjs MUST be.
  const fixDir = fs.mkdtempSync(path.join(os.tmpdir(), '__lint-fixture-vcs-'));
  const libDir = path.join(fixDir, 'gsd-core', 'bin', 'lib');
  fs.mkdirSync(libDir, { recursive: true });
  const violation =
    "const { execSync } = require('child_process');\n" +
    "execSync('git status', { cwd: '.' });\n";
  try {
    fs.writeFileSync(path.join(libDir, 'emitted.cjs'), violation);
    const rIgnored = spawnSync(process.execPath, [SCRIPT, '--scan-root', fixDir], { encoding: 'utf-8' });
    assert.equal(
      rIgnored.status, 0,
      'expected exit 0 (emitted artifact walk-ignored) but got ' + rIgnored.status +
      '\nstderr: ' + rIgnored.stderr
    );

    fs.writeFileSync(path.join(libDir, 'legacy-cleanup.cjs'), violation);
    const rException = spawnSync(process.execPath, [SCRIPT, '--scan-root', fixDir], { encoding: 'utf-8' });
    assert.equal(
      rException.status, 1,
      'expected exit 1 (checked-in exception still scanned) but got ' + rException.status +
      '\nstderr: ' + rException.stderr
    );
    assert.match(rException.stderr, /legacy-cleanup\.cjs/);
    assert.doesNotMatch(rException.stderr, /emitted\.cjs/);
  } finally {
    fs.rmSync(fixDir, { recursive: true, force: true });
  }
});

test('lint-vcs-no-raw-git scans shell scripts and flags bare `git <cmd>` (WR-11)', () => {
  const fixDir = fs.mkdtempSync(path.join(os.tmpdir(), '__lint-fixture-vcs-'));
  const fixFile = path.join(fixDir, 'badscript.sh');
  try {
    fs.writeFileSync(
      fixFile,
      "#!/usr/bin/env bash\n" +
      "git status\n"
    );
    const r = spawnSync(process.execPath, [SCRIPT, '--scan-root', fixDir], { encoding: 'utf-8' });
    assert.equal(
      r.status, 1,
      'expected exit 1 (violation) but got ' + r.status + '\nstderr: ' + r.stderr
    );
    assert.match(r.stderr, /shell `git/);
  } finally {
    fs.rmSync(fixDir, { recursive: true, force: true });
  }
});

test('shell-mode `# vcs-lint:allow-git-here` exempts a single line (WR-11)', () => {
  const fixDir = fs.mkdtempSync(path.join(os.tmpdir(), '__lint-fixture-vcs-'));
  const fixFile = path.join(fixDir, 'annotated.sh');
  try {
    fs.writeFileSync(
      fixFile,
      "#!/usr/bin/env bash\n" +
      "git status # vcs-lint:allow-git-here intentional probe\n"
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

test('lint-vcs-no-raw-git ignores bare `git <cmd>` in JS prose/comments', () => {
  // The shell pattern is shell-extension-only — a JS file that mentions
  // `git status` in a comment or a string must not trigger.
  const fixDir = fs.mkdtempSync(path.join(os.tmpdir(), '__lint-fixture-vcs-'));
  const fixFile = path.join(fixDir, 'innocent.js');
  try {
    fs.writeFileSync(
      fixFile,
      "// instructs the user to run: git status\n" +
      "console.log('Run `git fetch` to update the working copy');\n"
    );
    const r = spawnSync(process.execPath, [SCRIPT, '--scan-root', fixDir], { encoding: 'utf-8' });
    assert.equal(
      r.status, 0,
      'expected exit 0 (prose mentions are not invocations) but got ' + r.status + '\nstderr: ' + r.stderr
    );
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
