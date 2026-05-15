#!/usr/bin/env node
/**
 * lint-vcs-no-commit-id.cjs (Phase 8 Plan 1, LINT-01)
 *
 * Enforces "the jj backend never volunteers commit_id" — default-deny scanner
 * for commit_id literals, .commit_id field accesses, hex-shape regex literals,
 * 40-char hex string literals, and `commit_id.short()` / `commit_id.shortest()`
 * templates across the whole repo.
 *
 * Inline escape: add `// vcs-lint:allow-commit-id-here <reason>` on the offending line.
 *
 * Per-entry allowlist (Phase 8 D-03 + D-04 schema) at scripts/lint-vcs-no-commit-id.allow.json.
 * Required fields per entry: { path | glob, reason, owner }. The `expires` field is NOT
 * required (D-04 — solo-dev context). Pitfall 7 (allowlist hollowing) protection rests on
 * (a) per-entry reason + owner, (b) code-review of allowlist diffs, (c) periodic removal sweeps.
 *
 * First green run of this lint is the validation that Plan 2 FLIP-01..03 closed cleanly —
 * this lint is INTENTIONALLY NOT activated in CI by Plan 1 (would fail before FLIP lands).
 * Plan 3 wires the CI step.
 *
 * Exit 0 = clean. Exit 1 = violations (with file:line diagnostics).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { parseAllowlist } = require('./lib/allowlist-parser.cjs');

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

const ALLOW = parseAllowlist(
  require('./lint-vcs-no-commit-id.allow.json'),
  'lint-vcs-no-commit-id',
);
const ALLOW_FILES = ALLOW.files;
const ALLOW_GLOB_REGEXES = ALLOW.globRegexes;
const ALLOW_LINE_ANNOTATION = /(?:\/\/|#)\s*vcs-lint:allow-commit-id-here\s*\S/;

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.jj', 'dist', 'dist-cjs', '.pnpm-store',
]);
// Narrowed per RESEARCH §Replace — drop yml/yaml/sh/bash from raw-git lint scope.
// Markdown excluded per LINT-04 deferred (prose-level lint guard is a separate tool).
const SCAN_EXT = /\.(cjs|js|mjs|ts)$/;

const COMMIT_ID_PATTERNS = [
  { re: /['"`]commit_id['"`]/, label: "literal 'commit_id' string" },
  { re: /['"`]commit_id\.short(?:est)?\(\)['"`]/, label: "literal 'commit_id.short()' / '.shortest()' template" },
  { re: /\.commit_id\b/, label: ".commit_id field access" },
  // WR-03: Match hex-shape regex in BOTH forms:
  //   - JS regex literal:    /^[0-9a-f]{40}/
  //   - String passed to new RegExp(...) or .test(): '[0-9a-f]{40}' or "[0-9a-f]{40}"
  // The character class [`'"\/] covers all three opening delimiters.
  { re: /[`'"\/]\^?\[0-9a-f\]\{[0-9]+(?:,[0-9]+)?\}/, label: "hex-shape regex literal or string" },
  { re: /['"][0-9a-f]{40}['"]/, label: "40-char hex string literal" },
];

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

function isAllowed(rel) {
  if (ALLOW_FILES.has(rel)) return true;
  for (const re of ALLOW_GLOB_REGEXES) if (re.test(rel)) return true;
  return false;
}

function checkFile(filepath) {
  // WR-01: when SCAN_ROOT is the repo root (production CI run), relative paths
  // match the allowlist. When SCAN_ROOT is an isolated tmp directory (fixture
  // test), the scanner's allowlist would normally not match — which is exactly
  // the intended behavior: the fixture file MUST be reported as a violation.
  // Mirrors the documented convention in scripts/lint-vcs-no-raw-git.cjs:115-118.
  const rel = path.relative(SCAN_ROOT, filepath).split(path.sep).join('/');
  if (isAllowed(rel)) return null;
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.split('\n');
  const hits = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (ALLOW_LINE_ANNOTATION.test(line)) continue;
    for (const { re, label } of COMMIT_ID_PATTERNS) {
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
  console.log('ok lint-vcs-no-commit-id: ' + files.length + ' files scanned in ' + SCAN_ROOT + ', 0 violations');
  process.exit(0);
}

const totalHits = violations.reduce((n, v) => n + v.hits.length, 0);
process.stderr.write('\nERROR lint-vcs-no-commit-id: ' + totalHits + ' violation(s) across ' + violations.length + ' file(s)\n\n');
for (const v of violations) {
  process.stderr.write('  ' + v.file + '\n');
  for (const h of v.hits) {
    process.stderr.write('    ' + v.file + ':' + h.line + '  ' + h.label + '\n');
    process.stderr.write('      ' + h.snippet + '\n');
  }
  process.stderr.write('\n');
}
process.stderr.write('Fix: the cross-backend VcsAdapter exposes ONE revision concept (commit_id on git, change_id on jj).\n');
process.stderr.write('     Replace commit_id-shape access with the unified surface:\n');
process.stderr.write('       - .hash field on LogEntry / CommitResult       -> .id (per Phase 8 FLIP-02/03)\n');
process.stderr.write('       - .slice(0, 7|8|12) on an id field             -> vcs.refs.resolveShort(expr.rev(id))\n');
process.stderr.write('       - /^[0-9a-f]{N}/ regex on id-bearing field     -> expect(value).toBeIdOf(kind) custom matcher\n');
process.stderr.write('     OR add a `// vcs-lint:allow-commit-id-here <reason>` annotation on the offending line,\n');
process.stderr.write('     OR add the file/glob to scripts/lint-vcs-no-commit-id.allow.json with reason + owner.\n');
process.exit(1);
