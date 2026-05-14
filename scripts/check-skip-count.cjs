#!/usr/bin/env node
/**
 * check-skip-count.cjs (Phase 1 plan 04, TEST-06)
 *
 * Enforces: skipped-test count must not increase from origin/main.
 * Counts occurrences of `.skip`, `xit/xdescribe/xtest`, and `.todo` across:
 *   - tests/*.test.cjs
 *   - sdk/src/**\/*.test.ts (and *.integration.test.cjs)
 *
 * Exempt: any line matching `// allow-skip:<reason>` is not counted.
 *
 * Exit 0: current count ≤ main count, OR origin/main not available LOCALLY (warn + skip).
 * Exit 1: current count > main count (diagnostic lists the new skips), OR origin/main
 *         not available under CI=true (W-3 fix — silent exit 0 on missing baseline lets
 *         a misconfigured workflow regress freely).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const SKIP_PATTERNS = [
  /\b(it|test|describe)\.skip\b/g,
  /\b(xit|xdescribe|xtest)\b/g,
  /\b(it|test|describe)\.todo\b/g,
];
const ALLOW_ANNOTATION = /\/\/\s*allow-skip:\s*\S/;

function findTestFiles(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'dist-cjs' || entry.name === '.git' || entry.name === '.jj') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findTestFiles(full, results);
    else if (/\.test\.(cjs|ts|mjs|js)$/.test(entry.name) || /\.integration\.test\.(cjs|ts)$/.test(entry.name)) results.push(full);
  }
  return results;
}

function countSkips(content) {
  let total = 0;
  for (const lineRaw of content.split('\n')) {
    if (ALLOW_ANNOTATION.test(lineRaw)) continue;
    for (const re of SKIP_PATTERNS) {
      re.lastIndex = 0;
      const m = lineRaw.match(re);
      if (m) total += m.length;
    }
  }
  return total;
}

function countAllInWorkingTree() {
  const files = findTestFiles(REPO_ROOT);
  let total = 0;
  const perFile = [];
  for (const f of files) {
    const content = fs.readFileSync(f, 'utf-8');
    const n = countSkips(content);
    if (n > 0) perFile.push({ file: path.relative(REPO_ROOT, f), count: n });
    total += n;
  }
  return { total, perFile };
}

function countAllOnRef(ref) {
  // Get all matching files at ref via `git ls-tree -r --name-only <ref>`, then `git show <ref>:<file>` per file.
  let names;
  try {
    names = execSync('git ls-tree -r --name-only ' + ref, { cwd: REPO_ROOT, encoding: 'utf-8' }).split('\n').filter(Boolean);
  } catch {
    return null; // ref not available
  }
  const matching = names.filter((n) => /\.test\.(cjs|ts|mjs|js)$/.test(n) || /\.integration\.test\.(cjs|ts)$/.test(n));
  let total = 0;
  for (const f of matching) {
    let content;
    try {
      content = execSync('git show ' + ref + ':' + f, { cwd: REPO_ROOT, encoding: 'utf-8' });
    } catch {
      continue;
    }
    total += countSkips(content);
  }
  return total;
}

const current = countAllInWorkingTree();
const baseline = countAllOnRef('origin/main');

if (baseline === null) {
  // W-3: under CI, missing baseline is a hard error so a misconfigured workflow
  // (no fetch-depth: 0) cannot accidentally regress skip counts.
  if (process.env.CI === 'true') {
    process.stderr.write('ERROR check-skip-count: origin/main not available under CI=true.\n');
    process.stderr.write('  The .github/workflows/test.yml checkout step must use `fetch-depth: 0`,\n');
    process.stderr.write('  or this job must run after a `git fetch origin main` step.\n');
    process.stderr.write('  Current skip count: ' + current.total + ' (cannot compare without a baseline).\n');
    process.exit(1);
  }
  console.log('check-skip-count: origin/main not available — skipping baseline check (warn).');
  console.log('  Current skip count: ' + current.total);
  process.exit(0);
}

if (current.total <= baseline) {
  console.log('ok check-skip-count: current=' + current.total + ' baseline(origin/main)=' + baseline);
  process.exit(0);
}

process.stderr.write('\nERROR check-skip-count: ' + (current.total - baseline) + ' new skip(s) since origin/main\n');
process.stderr.write('  current=' + current.total + '  baseline=' + baseline + '\n');
process.stderr.write('  Per-file skip counts (current branch):\n');
for (const f of current.perFile) {
  process.stderr.write('    ' + f.file + ' (' + f.count + ')\n');
}
process.stderr.write('  To exempt a specific skip add a `// allow-skip: <reason>` comment on the same line.\n');
process.exit(1);
