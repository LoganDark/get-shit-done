#!/usr/bin/env node
/**
 * Phase 03.1 baseline harness: median-of-3 wall-clock per integration test file.
 *
 * Re-run by every lever plan (Plans 02/03) and final verification (Plan 04) with
 * `--label <name> --append` to record post-flip numbers in the same markdown file.
 *
 * Reads: vitest's --reporter=json output (Jest-compatible schema; see RESEARCH).
 * Writes: .planning/intel/vitest-integration-baseline.md (or --out target).
 * Aborts: if any of the 3 runs has `success: false` (D-05c flakiness gate).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

// ── CLI parsing ─────────────────────────────────────────────────────────────
function parseArgs(argv) {
	const out = { label: 'baseline', outPath: null, append: false };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--label') {
			out.label = argv[++i];
		} else if (a === '--out') {
			out.outPath = argv[++i];
		} else if (a === '--append') {
			out.append = true;
		} else {
			process.stderr.write(`ERROR profile-integration: unknown argument: ${a}\n`);
			process.exit(2);
		}
	}
	if (!out.label) {
		process.stderr.write('ERROR profile-integration: --label requires a value\n');
		process.exit(2);
	}
	if (out.outPath === null) {
		out.outPath = join(REPO_ROOT, '.planning', 'intel', 'vitest-integration-baseline.md');
	}
	return out;
}

const { label, outPath, append } = parseArgs(process.argv.slice(2));

// ── Detect `claude` CLI availability ────────────────────────────────────────
let cliAvailable = false;
try {
	execFileSync('which', ['claude'], { stdio: ['ignore', 'ignore', 'ignore'] });
	cliAvailable = true;
} catch {
	cliAvailable = false;
}

// ── Temp dir setup ──────────────────────────────────────────────────────────
const TMP_DIR = join(REPO_ROOT, 'sdk', 'scripts', '.tmp', 'profile-integration');
mkdirSync(TMP_DIR, { recursive: true });
for (const i of [1, 2, 3]) {
	const p = join(TMP_DIR, `run-${i}.json`);
	if (existsSync(p)) rmSync(p);
}

// ── Build once before measurement loop ──────────────────────────────────────
// Isolates test wall-clock from `pretest: pnpm run build:sdk` rebuild cost
// (RESEARCH Pitfall 2 / "What pretest actually costs").
console.error('[profile-integration] building sdk once before measurement loop...');
execFileSync('pnpm', ['--filter', '@gsd-build/sdk', 'run', 'build'], {
	cwd: REPO_ROOT,
	stdio: 'inherit',
});

// ── Median-of-3 loop ────────────────────────────────────────────────────────
const runs = [];
for (const i of [1, 2, 3]) {
	const outFile = join(TMP_DIR, `run-${i}.json`);
	const startedAt = Date.now();
	console.error(`[profile-integration] run ${i}/3 starting...`);
	try {
		execFileSync(
			'pnpm',
			[
				'--filter', '@gsd-build/sdk', 'exec',
				'vitest', 'run',
				'--project', 'integration',
				'--reporter=json',
				'--outputFile', outFile,
			],
			{ cwd: REPO_ROOT, stdio: ['ignore', 'inherit', 'inherit'] },
		);
	} catch (err) {
		// vitest exits non-zero on failure; we still want to parse the JSON and
		// surface which test failed via the flakiness gate below.
		console.error(`[profile-integration] run ${i} exited non-zero — parsing JSON for diagnostics`);
	}
	const wall = Date.now() - startedAt;
	if (!existsSync(outFile)) {
		process.stderr.write(`\nERROR profile-integration: run ${i} produced no JSON output at ${outFile}\n`);
		process.stderr.write('  Vitest likely crashed before the reporter could write. Aborting.\n');
		process.exit(1);
	}
	const parsed = JSON.parse(readFileSync(outFile, 'utf-8'));
	runs.push({ parsed, wallClockMs: wall });
}

// ── D-05c flakiness gate ────────────────────────────────────────────────────
const failedRunIndices = [];
runs.forEach((r, idx) => {
	if (!r.parsed.success) failedRunIndices.push(idx + 1);
});
if (failedRunIndices.length > 0) {
	process.stderr.write(`\nERROR profile-integration: ${failedRunIndices.length} of 3 runs reported success=false (runs ${failedRunIndices.join(', ')})\n`);
	process.stderr.write('  Cannot record baseline — fix flakiness first.\n');
	for (const idx of failedRunIndices) {
		const r = runs[idx - 1].parsed;
		const failedFiles = (r.testResults || [])
			.filter((tr) => tr.status === 'failed' || (tr.assertionResults || []).some((a) => a.status === 'failed'))
			.map((tr) => tr.name);
		if (failedFiles.length > 0) {
			process.stderr.write(`  run ${idx} failures: ${failedFiles.join(', ')}\n`);
		}
	}
	process.exit(1);
}

// ── Cross-run sanity check (D-05 enforcement) ───────────────────────────────
const totals = new Set(runs.map((r) => r.parsed.numTotalTests));
if (totals.size !== 1) {
	process.stderr.write(`ERROR profile-integration: numTotalTests differs across runs (${[...totals].join(', ')})\n`);
	process.exit(1);
}
const numTotalTests = runs[0].parsed.numTotalTests;
const numPendingTests = runs[0].parsed.numPendingTests;

// Verify each run reports the same set of file paths.
function fileSetKey(parsed) {
	return (parsed.testResults || [])
		.map((tr) => tr.name)
		.sort()
		.join('|');
}
const fileSetKeys = new Set(runs.map((r) => fileSetKey(r.parsed)));
if (fileSetKeys.size !== 1) {
	process.stderr.write('ERROR profile-integration: file set differs across runs\n');
	process.exit(1);
}

// ── Aggregate per-file walls ────────────────────────────────────────────────
const byFile = new Map(); // file -> [wall_1, wall_2, wall_3]
for (const { parsed } of runs) {
	for (const tr of parsed.testResults || []) {
		const absName = tr.name;
		const relName = absName.startsWith(REPO_ROOT + '/')
			? absName.slice(REPO_ROOT.length + 1)
			: relative(REPO_ROOT, absName) || absName;
		const wall = tr.endTime - tr.startTime;
		const arr = byFile.get(relName) ?? [];
		arr.push(wall);
		byFile.set(relName, arr);
	}
}

function median3(xs) {
	const sorted = [...xs].sort((a, b) => a - b);
	return sorted[1];
}

let sumOfMedians = 0;
const rows = [];
for (const [file, walls] of [...byFile.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
	const m = median3(walls);
	sumOfMedians += m;
	rows.push({ file, walls, median: m });
}
const fileCount = rows.length;

// ── Build markdown section ──────────────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10);
const lines = [];

if (!append || !existsSync(outPath)) {
	// First write — emit document header + metadata triple.
	lines.push(`# Vitest Integration Baseline — sdk/ Phase 03.1`);
	lines.push(``);
	lines.push(`**Generated:** ${today} on Darwin (local M-series; \`os.availableParallelism()\` = ${os.availableParallelism()})`);
	lines.push(`**Method:** \`pnpm --filter @gsd-build/sdk exec vitest run --project integration --reporter=json\` × 3, median per file`);
	lines.push(`**Purpose:** Phase 03.1 baseline + per-lever post-flip records; ratio target for D-03.`);
	lines.push(``);
}

lines.push(`## ${label}`);
lines.push(``);
lines.push(`| Metric | Value |`);
lines.push(`|--------|------:|`);
lines.push(`| Total integration files | ${fileCount} |`);
lines.push(`| Total tests (\`numTotalTests\`) | ${numTotalTests} |`);
lines.push(`| Skip count (\`numPendingTests\`) | ${numPendingTests} |`);
lines.push(`| Median total wall-clock (ms) | ${sumOfMedians} |`);
lines.push(`| Run 1 outer wall-clock (ms) | ${runs[0].wallClockMs} |`);
lines.push(`| Run 2 outer wall-clock (ms) | ${runs[1].wallClockMs} |`);
lines.push(`| Run 3 outer wall-clock (ms) | ${runs[2].wallClockMs} |`);
lines.push(``);
lines.push(`| File | Run 1 (ms) | Run 2 (ms) | Run 3 (ms) | Median (ms) |`);
lines.push(`|------|-----------:|-----------:|-----------:|------------:|`);
for (const { file, walls, median } of rows) {
	lines.push(`| ${file} | ${walls[0]} | ${walls[1]} | ${walls[2]} | ${median} |`);
}
lines.push(`| **TOTAL (sum of medians)** | — | — | — | **${sumOfMedians}** |`);
lines.push(``);

if (!append || !existsSync(outPath)) {
	// Methodology Notes only on the first section.
	const e2eState = process.env.GSD_ENABLE_E2E
		? '`set` (' + process.env.GSD_ENABLE_E2E + ')'
		: '`unset` — some E2E tests will self-skip; baseline reflects that';
	lines.push(`### Methodology Notes`);
	lines.push(``);
	lines.push(`- \`pnpm --filter @gsd-build/sdk run build\` is invoked **once** before the 3-run loop (isolates test wall-clock from \`pretest: pnpm run build:sdk\` rebuild cost per RESEARCH Pitfall 2).`);
	lines.push(`- Each run writes JSON to \`sdk/scripts/.tmp/profile-integration/run-N.json\`; the script aborts before writing this markdown if any run has \`success: false\` (D-05c).`);
	lines.push(`- \`GSD_ENABLE_E2E\` env state at measurement time: ${e2eState}.`);
	lines.push(`- \`claude\` CLI availability at measurement time: detected via \`which claude\` exit code at script start; ${cliAvailable ? 'present' : 'absent (some E2E tests will self-skip)'}.`);
	lines.push(`- Re-run with \`node sdk/scripts/profile-integration.mjs --label <name> --append\` after each lever flip; the resulting file is the per-lever evidence record (D-09).`);
	lines.push(``);
}

const newSection = lines.join('\n');

mkdirSync(dirname(outPath), { recursive: true });
if (append && existsSync(outPath)) {
	const existing = readFileSync(outPath, 'utf-8');
	const sep = existing.endsWith('\n') ? '\n' : '\n\n';
	writeFileSync(outPath, existing + sep + newSection);
} else {
	writeFileSync(outPath, newSection);
}

console.log(`ok profile-integration: wrote ${label} section to ${outPath}`);
process.exit(0);
