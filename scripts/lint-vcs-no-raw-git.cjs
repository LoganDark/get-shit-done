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
const { parseAllowlist } = require('./lib/allowlist-parser.cjs');

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

// Phase 8 Plan 1 D-03: consume shared per-entry allowlist parser. The parser
// throws on schema violations (missing reason/owner; both path+glob; neither).
const ALLOW = parseAllowlist(
  require('./lint-vcs-no-raw-git.allow.json'),
  'lint-vcs-no-raw-git',
);
const ALLOW_FILES = ALLOW.files;
const ALLOW_GLOB_REGEXES = ALLOW.globRegexes;
// WR-11: support both JS-style (`//`) and shell-style (`#`) line annotations
// so shell scripts can opt out of the new shell-mode scan with the same
// `vcs-lint:allow-git-here <reason>` escape hatch.
const ALLOW_LINE_ANNOTATION = /(?:\/\/|#)\s*vcs-lint:allow-git-here\s*\S/;

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.jj', 'dist', 'dist-cjs', '.pnpm-store',
]);
// WR-11: scan shell scripts too — the policy ("no raw git anywhere")
// applies to all repo code, not just JS/TS/YAML. `.githooks/` files are
// already in the allowlist; helper scripts in scripts/*.sh would otherwise
// invoke `git` undetected.
// 19-10 (Pitfall 8 / T-19-26): `.cts` added — the adopted tree's production
// sources are src/*.cts; without it every gate passes vacuously green over
// the new tree. Positive-detection proof lives in
// tests/scripts/lint-vcs-no-raw-git-fixture.test.cjs (planted .cts violation
// MUST be reported).
const SCAN_EXT = /\.(cjs|cts|js|mjs|ts|yml|yaml|sh|bash)$/;

// 19-10 (T-19-28): `pnpm run build:lib` emits gitignored .cjs artifacts under
// gsd-core/bin/lib/ (compiled from the src/*.cts sources this scanner already
// covers). Scanning the emitted copies would double-report every src/ finding
// as a phantom violation in generated code nobody hand-edits. Skip them; the
// two checked-in lib files stay scanned (gsd-core/bin/gsd-tools.cjs is outside
// lib/ and stays scanned too).
const EMITTED_LIB_PREFIX = 'gsd-core/bin/lib/';
const EMITTED_LIB_CHECKED_IN = new Set([
  'gsd-core/bin/lib/legacy-cleanup.cjs',
  'gsd-core/bin/lib/package-identity.cjs',
]);
function isEmittedArtifact(rel) {
  return rel.startsWith(EMITTED_LIB_PREFIX) && !EMITTED_LIB_CHECKED_IN.has(rel);
}

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

// WR-11: shell-script-only patterns. Bare `git <subcommand>` is too noisy to
// scan inside JS/TS/YAML where comments and string descriptions routinely
// reference `git` as English text. In genuine shell-script files (.sh/.bash),
// match only the start-of-statement form: line start (after optional leading
// whitespace) or a shell statement separator (`;`, `&&`, `||`, `|`, `(`).
// Word boundary + the requirement that a real subcommand verb follows
// (one or more letters) keeps the pattern from triggering on prose like
// `the git tool` (no `;`/`&&` prefix at column 0) or path-like `git/foo`.
// VCS-audit 2026-07-08: widened to also match option-leading invocations
// (`git -C <dir> <cmd>`, `git --git-dir=… <cmd>`, `git -c k=v <cmd>`) — the
// letter-only tail made every `git -C` call invisible to both this lint and
// scripts/audit-workflow-raw-git.cjs (which reuses the regex byte-identically).
const SHELL_GIT_PATTERNS = [
  {
    re: /(?:^|[ \t;&|(])git[ \t]+(?:[a-zA-Z]|-)/,
    label: "shell `git <cmd>`",
  },
];
const SHELL_EXT = /\.(sh|bash)$/;

// Phase 8 Plan 1 D-03: globToRegExp extracted to scripts/lib/glob-to-regex.cjs
// and consumed transitively via the shared allowlist parser. ALLOW_GLOB_REGEXES
// is computed by parseAllowlist() above; no inline glob compilation needed here.

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
  // WR-11: in shell-script files, also scan for bare `git <cmd>` invocations.
  // The shell pattern is too noisy for JS/TS/YAML where prose and comments
  // reference `git` as English text.
  const isShell = SHELL_EXT.test(filepath);
  const patterns = isShell ? GIT_PATTERNS.concat(SHELL_GIT_PATTERNS) : GIT_PATTERNS;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (ALLOW_LINE_ANNOTATION.test(line)) continue;
    // Skip shell comments (`#`-prefixed) — they routinely reference `git` as text.
    if (isShell && /^\s*#/.test(line)) continue;
    for (const { re, label } of patterns) {
      if (re.test(line)) hits.push({ line: i + 1, label, snippet: line.trim().slice(0, 200) });
    }
  }
  if (hits.length === 0) return null;
  return { file: rel, hits };
}

const walked = [];
findFiles(SCAN_ROOT, walked);
// 19-10 (T-19-28): drop emitted gsd-core/bin/lib artifacts BEFORE scanning so
// they are neither scanned nor counted (the checked-in exceptions survive).
const files = walked.filter(
  (f) => !isEmittedArtifact(path.relative(SCAN_ROOT, f).split(path.sep).join('/')),
);
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
