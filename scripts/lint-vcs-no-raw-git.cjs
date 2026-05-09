#!/usr/bin/env node
/**
 * lint-vcs-no-raw-git.cjs (Phase 1 plan 05, VCS-07 / D-17 / D-18)
 *
 * Enforces "no raw git anywhere" — default-deny scanner across the whole repo.
 *
 * D-17 tightens VCS-07: any `git` invocation (read OR write) is forbidden when reachable
 * from jj-backend code. Read-only git against a colocated jj repo can perturb jj state
 * (lock contention, implicit `jj git import` semantics, working-copy snapshot timing).
 *
 * D-18: scan whole repo with explicit JSON allowlist (scripts/lint-vcs-no-raw-git.allow.json).
 * D-19: CI-only (not pre-commit during migration phases).
 *
 * Inline escape: add `// vcs-lint:allow-git-here <reason>` on the offending line.
 *
 * Exit 0 = clean. Exit 1 = violations (with file:line diagnostics).
 */

'use strict';

const fs = require('fs');
const path = require('path');

// W-4: SCAN_ROOT defaults to the repo root (1 level up from scripts/).
// Pass --scan-root <dir> to scan an isolated tree (used by the fixture test in
// tests/lint-vcs-no-raw-git-fixture.test.cjs to avoid repo-root pollution and
// parallel-run flakiness). Allowlist paths are still resolved relative to the
// scan root, which means an isolated fixture tree is NOT covered by the
// production allowlist — that's the intended behavior: the fixture file MUST
// be reported as a violation.
function parseArgv(argv) {
  const out = { scanRoot: null };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--scan-root' && argv[i + 1]) { out.scanRoot = argv[i + 1]; i += 1; }
  }
  return out;
}
const ARGV = parseArgv(process.argv);
const REPO_ROOT = path.resolve(__dirname, '..');
const SCAN_ROOT = ARGV.scanRoot ? path.resolve(ARGV.scanRoot) : REPO_ROOT;

const ALLOW = require('./lint-vcs-no-raw-git.allow.json');
const ALLOW_FILES = new Set(ALLOW.files || []);
const ALLOW_GLOBS = ALLOW.globs || [];
const ALLOW_LINE_ANNOTATION = /\/\/\s*vcs-lint:allow-git-here\s*\S/;

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.jj', 'dist', 'dist-cjs', '.pnpm-store',
]);
const SCAN_EXT = /\.(cjs|js|mjs|ts|yml|yaml)$/;

const GIT_PATTERNS = [
  { re: /spawnSync\s*\(\s*['"]git['"]/, label: "spawnSync('git', …)" },
  { re: /spawn\s*\(\s*['"]git['"]/,     label: "spawn('git', …)" },
  { re: /execFileSync\s*\(\s*['"]git['"]/, label: "execFileSync('git', …)" },
  { re: /execFile\s*\(\s*['"]git['"]/,  label: "execFile('git', …)" },
  // CR-01: tighten regex to also catch `execSync('git')`, `execSync(\`git\`)` (no trailing
  // whitespace) — match whitespace OR the closing quote/backtick directly, the same
  // shape the spawnSync patterns use.
  { re: /execSync\s*\(\s*['"`]git(?:\s|['"`])/, label: "execSync('git…', …)" },
  { re: /\bexec\s*\(\s*['"`]git(?:\s|['"`])/,   label: "exec('git…', …)" },
];

function globToRegExp(glob) {
  // Translate a simple glob (* and **) to a RegExp anchored at start and end.
  //
  // WR-10:
  //   - `**/` (intermediate)  → `(?:[^/]+/)*` — zero or more full path components.
  //     This matches the gitignore(5) semantic: `**/foo` matches `foo`,
  //     `a/foo`, and `a/b/foo`.
  //   - `**` at end-of-pattern → `.+` (require at least one char). Without
  //     the `+`, the allowlist entry `sdk/**` would also match a top-level
  //     file literally named `sdk` (since the trailing `**` would match the
  //     empty suffix and consume the trailing `/` as well — but with our
  //     handling the prefix already includes the literal `/`, so the body
  //     would still need to match SOMETHING after that slash).
  //   - Defensively escape `-`. The escape set already covers `[]`, so an
  //     embedded glob char class like `[a-z]` survives as literal `\[a\-z\]`
  //     in the regex output (a no-op match for the literal bracket text).
  let re = '';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          // `**/` — zero or more full path components followed by `/`.
          re += '(?:[^/]+/)*';
          i += 3;
        } else {
          // Trailing `**` — require at least one character so that
          // `prefix/**` does not match `prefix` (zero suffix).
          re += '.+';
          i += 2;
        }
      } else {
        re += '[^/]*';
        i += 1;
      }
    } else if ('.+?^${}()|[]\\-'.includes(c)) {
      re += '\\' + c;
      i += 1;
    } else {
      re += c;
      i += 1;
    }
  }
  return new RegExp('^' + re + '$');
}
const ALLOW_GLOB_REGEXES = ALLOW_GLOBS.map(globToRegExp);

function isAllowed(rel) {
  if (ALLOW_FILES.has(rel)) return true;
  for (const re of ALLOW_GLOB_REGEXES) if (re.test(rel)) return true;
  return false;
}

function findFiles(dir, results) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findFiles(full, results);
    else if (entry.isFile() && SCAN_EXT.test(entry.name)) results.push(full);
  }
}

function checkFile(filepath) {
  // W-4: when SCAN_ROOT is the repo root (production CI run), relative paths match
  // the allowlist. When SCAN_ROOT is an isolated tmp directory (fixture test),
  // the scanner's allowlist would normally not match — which is exactly the
  // intended behavior: the fixture file MUST be reported as a violation.
  const rel = path.relative(SCAN_ROOT, filepath).split(path.sep).join('/');
  if (isAllowed(rel)) return null;
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.split('\n');
  const hits = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (ALLOW_LINE_ANNOTATION.test(line)) continue;
    for (const { re, label } of GIT_PATTERNS) {
      if (re.test(line)) hits.push({ line: i + 1, label, snippet: line.trim().slice(0, 200) });
    }
  }
  if (hits.length === 0) return null;
  return { file: rel, hits };
}

const files = [];
findFiles(SCAN_ROOT, files);
const violations = files.map(checkFile).filter(Boolean);

if (violations.length === 0) {
  console.log('ok lint-vcs-no-raw-git: ' + files.length + ' files scanned in ' + SCAN_ROOT + ', 0 violations');
  process.exit(0);
}

const totalHits = violations.reduce((n, v) => n + v.hits.length, 0);
process.stderr.write('\nERROR lint-vcs-no-raw-git: ' + totalHits + ' violation(s) across ' + violations.length + ' file(s)\n\n');
for (const v of violations) {
  process.stderr.write('  ' + v.file + '\n');
  for (const h of v.hits) {
    process.stderr.write('    ' + v.file + ':' + h.line + '  ' + h.label + '\n');
    process.stderr.write('      ' + h.snippet + '\n');
  }
  process.stderr.write('\n');
}
process.stderr.write('Fix: route through the VcsAdapter (createVcsAdapter(cwd).…), or\n');
process.stderr.write('     add a "// vcs-lint:allow-git-here <reason>" annotation on the offending line, or\n');
process.stderr.write('     add the file/glob to scripts/lint-vcs-no-raw-git.allow.json with PR rationale.\n');
process.exit(1);
