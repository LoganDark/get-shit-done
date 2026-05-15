#!/usr/bin/env node
/**
 * audit-id-namespace.cjs (Phase 8 Plan 1, D-01)
 *
 * Pure regex+walker audit of every commit_id-reachable surface in the codebase.
 * Emits a human-readable verdict-table markdown to stdout (default), or a
 * structured JSON sidecar with --json (the JSON IS the literal seed for
 * scripts/lint-vcs-no-commit-id.allow.json — D-01 single-source-of-truth).
 *
 * Mirrors scripts/audit-workflow-script-paths.cjs structure (regex+walker,
 * Object.freeze enum, pure unit-testable function). Re-runnable at Plan 3
 * close-gate for Success Criterion 6 verification.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const AUDIT_VERDICT = Object.freeze({
	SAFE: 'safe',
	FLIP_CLEAN: 'flip-clean',
	NEEDS_RENAME: 'needs-rename',
	NEEDS_RESOLVE_SHORT: 'needs-resolveShort',
	BOUNDARY_IO: 'boundary-io',
	HISTORICAL_PROSE: 'historical-prose',
	UNCLEAR: 'unclear',
});

const PATTERNS = Object.freeze([
	{ re: /['"`]commit_id['"`]/, kind: 'literal_commit_id' },
	{ re: /\.commit_id\b/, kind: 'field_access' },
	{ re: /['"]LogEntry\['?["]hash["']?\]?\b/, kind: 'log_entry_hash' },
	{ re: /['"]CommitResult\['?["]hash["']?\]?\b/, kind: 'commit_result_hash' },
	{ re: /\.hash\b/, kind: 'hash_field_access' },
	// WR-03: match hex-shape regex in BOTH forms — JS regex literal (/[0-9a-f]{N}/)
	// AND string form used with new RegExp(...) or .test() ('[0-9a-f]{N}'). The
	// character class [`'"\/] covers all three opening delimiters.
	{ re: /[`'"\/]\^?\[0-9a-f\]\{[0-9]+(?:,[0-9]+)?\}/, kind: 'hex_regex' },
	{ re: /['"][0-9a-f]{40}['"]/, kind: '40_char_hex_literal' },
	{ re: /\.slice\(\s*0\s*,\s*(?:7|8|12)\s*\)/, kind: 'short_slice' },
]);

const SKIP_DIRS = new Set([
	'node_modules', '.git', '.jj', 'dist', 'dist-cjs', '.pnpm-store',
]);

// Audit scans BOTH code and markdown — code for surface flip, markdown for AUDIT-04 prose grep.
const SCAN_EXT = /\.(cjs|js|mjs|ts|md)$/;

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

function auditIdNamespace({ scanRoots, repoRoot }) {
	const findings = [];
	const files = [];
	for (const root of scanRoots) {
		findFiles(path.resolve(repoRoot, root), files);
	}
	let rowCounter = 0;
	for (const file of files) {
		const content = fs.readFileSync(file, 'utf8');
		const lines = content.split('\n');
		const rel = path.relative(repoRoot, file).split(path.sep).join('/');
		for (let i = 0; i < lines.length; i += 1) {
			const line = lines[i];
			for (const { re, kind } of PATTERNS) {
				if (re.test(line)) {
					rowCounter += 1;
					findings.push({
						audit_row: rowCounter,
						path: rel,
						line: i + 1,
						surface: kind,
						callerUse: line.trim().slice(0, 200),
						verdict: null, // verdict assignment is HUMAN per D-01; null means "to be filled in .md"
					});
					break; // one finding per line is enough; first match wins
				}
			}
		}
	}
	return { ok: findings.length === 0, findings };
}

function parseArgv(argv) {
	const out = { json: false };
	for (let i = 2; i < argv.length; i += 1) {
		if (argv[i] === '--json') out.json = true;
	}
	return out;
}

function emitMarkdown(result) {
	const lines = [
		'# Id Namespace Audit — Phase 8 (D-01)',
		'',
		`**Generated:** ${new Date().toISOString().slice(0, 10)}`,
		`**Total findings:** ${result.findings.length}`,
		'',
		'## Verdict legend',
		'',
		'- `safe` — no flip needed; already correct',
		'- `flip-clean` — straightforward rename or template flip',
		'- `needs-rename` — type-level rename (e.g., `LogEntry.hash` → `LogEntry.id`)',
		'- `needs-resolveShort` — `.slice(0, 7|8|12)` site that should use `vcs.refs.resolveShort()`',
		'- `boundary-io` — legitimate backend-private `commit_id` access (LINT-03 conditional driver)',
		'- `historical-prose` — markdown prose example; grandfathered (LINT-04 deferred)',
		'- `unclear` — needs investigation',
		'',
		'## Findings',
		'',
		'| # | File:line | Pattern | Caller use | Verdict | Notes |',
		'|---|-----------|---------|------------|---------|-------|',
	];
	for (const f of result.findings) {
		lines.push(`| ${f.audit_row} | \`${f.path}:${f.line}\` | \`${f.surface}\` | \`${f.callerUse.replace(/\|/g, '\\|')}\` | ${f.verdict ?? 'TBD'} | |`);
	}
	return lines.join('\n') + '\n';
}

function emitJson(result) {
	// All 7 verdict buckets present even when empty (per D-01 — lint seeder reads
	// verdicts['boundary-io'] regardless of population).
	const verdicts = Object.fromEntries(Object.values(AUDIT_VERDICT).map((v) => [v, []]));
	for (const f of result.findings) {
		const verdictKey = f.verdict ?? 'unclear';
		if (!verdicts[verdictKey]) verdicts[verdictKey] = [];
		verdicts[verdictKey].push({
			audit_row: f.audit_row,
			path: f.path,
			line: f.line,
			surface: f.surface,
			callerUse: f.callerUse,
		});
	}
	return JSON.stringify({
		$schema_version: 1,
		scanned_at: new Date().toISOString(),
		verdicts,
	}, null, 2) + '\n';
}

// Only run when invoked as a script (not when required as a module by tests).
if (require.main === module) {
	const argv = parseArgv(process.argv);
	const REPO_ROOT = path.resolve(__dirname, '..');
	const SCAN_ROOTS = [
		'sdk/src',
		'get-shit-done/bin/lib',
		'scripts',
		'tests/__tools__',
		'get-shit-done/workflows',
		'commands',
		'agents',
	];
	const result = auditIdNamespace({ scanRoots: SCAN_ROOTS, repoRoot: REPO_ROOT });
	process.stdout.write(argv.json ? emitJson(result) : emitMarkdown(result));
}

module.exports = { auditIdNamespace, AUDIT_VERDICT, PATTERNS, findFiles, emitMarkdown, emitJson };
