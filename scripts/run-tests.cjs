#!/usr/bin/env node
// Cross-platform test runner — resolves test file globs via Node
// instead of relying on shell expansion (which fails on Windows PowerShell/cmd).
// Propagates NODE_V8_COVERAGE so c8 collects coverage from the child process.
'use strict';

const { readdirSync } = require('fs');
const { join } = require('path');
const { execFileSync } = require('child_process');

const testDir = join(__dirname, '..', 'tests');
// Recursive: collects tests/*.test.cjs AND tests/<subdir>/*.test.cjs (e.g.
// tests/scripts/audit-workflow-raw-git.test.cjs added in Phase 13 for CI-06).
// Node >=22 (project minimum) supports { recursive: true }.
const files = readdirSync(testDir, { recursive: true })
  .filter(f => f.endsWith('.test.cjs'))
  .sort()
  .map(f => join('tests', f));

if (files.length === 0) {
  console.error('No test files found in tests/');
  process.exit(1);
}

const concurrency = process.env.TEST_CONCURRENCY
  ? `--test-concurrency=${process.env.TEST_CONCURRENCY}`
  : '--test-concurrency=4';

try {
  execFileSync(process.execPath, ['--test', concurrency, ...files], {
    stdio: 'inherit',
    env: { ...process.env },
  });
} catch (err) {
  process.exit(err.status || 1);
}
