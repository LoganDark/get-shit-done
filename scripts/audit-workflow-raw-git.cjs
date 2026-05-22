#!/usr/bin/env node
/**
 * audit-workflow-raw-git.cjs (Phase 13 plan 13-02, LINT-04)
 *
 * Scans `.md` shell-fence blocks (the bash / sh / zsh labelled fences) under
 * `get-shit-done/workflows/`, `get-shit-done/references/`, and `agents/` for
 * raw `git <cmd>` invocations.
 *
 * This is a BASELINE-REGRESSION GUARD, not a zero-assertion audit. v1.3's
 * PROMPT-06..09 removed raw-git only from the parallel-dispatch path; 127
 * unrelated raw-git invocations remain across 30 workflow-markdown files. A
 * zero-assertion audit cannot pass. Instead, the audit carries a FROZEN per-file
 * baseline capturing the 2026-05-22 127-hit state (the BASELINE constant below)
 * and exits non-zero ONLY when a scanned file's current raw-git count EXCEEDS
 * its baseline count — i.e. NEW raw-git was added to workflow markdown. On the
 * first green run, current == baseline == pass. (Per RESEARCH.md Open Q1 user
 * resolution; plan 13-01 re-baselined ROADMAP SC2/SC3 + CONTEXT.md D-08 to this
 * same framing.)
 *
 * The audit is the CI-06 gate (plan 13-04 wires it into the parallel-e2e lane).
 * It is NOT in `npm pretest` (D-07 — one-shot / CI-06-only).
 *
 * Stdout-only (CONTEXT.md D-06): this is a colocated-jj repo; any file written
 * into the working tree is auto-snapshotted. The audit writes NOTHING to disk —
 * a human-readable `.md` report to stdout by default, machine-readable JSON to
 * stdout under `--json`. It invokes no VCS — a pure file-walker, so
 * `lint-vcs-no-raw-git.cjs` does not flag it.
 *
 * Modeled structurally on scripts/audit-id-namespace.cjs (shebang, header
 * docblock, `'use strict'`, node:fs/node:path imports, the recursive walker,
 * parseArgv, emitMarkdown/emitJson, escapeMarkdownCell verbatim, the
 * `require.main` guard, the `module.exports` of pure functions). The deliberate
 * divergence flagged by the pattern map: the CLI guard ends with
 * `process.exit(result.ok ? 0 : 1)` — `audit-id-namespace.cjs` never exits.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Reuse the production lint's start-of-statement detection verbatim
// (scripts/lint-vcs-no-raw-git.cjs:87 SHELL_GIT_PATTERNS). Byte-identical on
// purpose — the audit and the lint must agree on what "raw git" means.
const SHELL_GIT_RE = /(?:^|[ \t;&|(])git[ \t]+[a-zA-Z]/;
// Fence open: ```bash / ```sh / ```zsh (three-or-more backticks or tildes,
// case-insensitive). Fence close: a bare fence (no language label).
const FENCE_OPEN = /^\s*(```+|~~~+)\s*(bash|sh|zsh)\b/i;
const FENCE_CLOSE = /^\s*(```+|~~~+)\s*$/;
const SCAN_ROOTS = ['get-shit-done/workflows', 'get-shit-done/references', 'agents'];

// The frozen per-file raw-git baseline. A fence-aware scan re-run by the
// executor on 2026-05-22 reproduced this map exactly (TOTAL = 127 hits across
// 30 files). D-09 / phase-scope-decision: a per-file count map, NOT a bare
// total — a removal in one file must never mask an addition in another. An
// embedded `Object.freeze`d constant in committed source does NOT violate
// CONTEXT.md D-06: D-06 forbids the audit WRITING transient output at runtime;
// a static, version-controlled baseline is source, not runtime output (the
// migr-06-close-gate.cjs embedded-constant precedent).
const BASELINE = Object.freeze({
	'agents/gsd-code-fixer.md': 6,
	'agents/gsd-code-reviewer.md': 1,
	'agents/gsd-debugger.md': 7,
	'get-shit-done/references/git-integration.md': 6,
	'get-shit-done/references/planning-config.md': 4,
	'get-shit-done/references/tdd.md': 3,
	'get-shit-done/workflows/add-tests.md': 2,
	'get-shit-done/workflows/ai-integration-phase.md': 2,
	'get-shit-done/workflows/audit-fix.md': 3,
	'get-shit-done/workflows/check-todos.md': 1,
	'get-shit-done/workflows/code-review-fix.md': 2,
	'get-shit-done/workflows/code-review.md': 3,
	'get-shit-done/workflows/complete-milestone.md': 9,
	'get-shit-done/workflows/diagnose-issues.md': 1,
	'get-shit-done/workflows/eval-review.md': 2,
	'get-shit-done/workflows/execute-phase.md': 11,
	'get-shit-done/workflows/execute-plan.md': 2,
	'get-shit-done/workflows/fast.md': 2,
	'get-shit-done/workflows/forensics.md': 9,
	'get-shit-done/workflows/ingest-docs.md': 1,
	'get-shit-done/workflows/milestone-summary.md': 5,
	'get-shit-done/workflows/new-workspace.md': 5,
	'get-shit-done/workflows/pr-branch.md': 12,
	'get-shit-done/workflows/progress.md': 1,
	'get-shit-done/workflows/quick.md': 11,
	'get-shit-done/workflows/remove-workspace.md': 2,
	'get-shit-done/workflows/session-report.md': 2,
	'get-shit-done/workflows/ship.md': 8,
	'get-shit-done/workflows/spec-phase.md': 2,
	'get-shit-done/workflows/validate-phase.md': 2,
});

// Recursive *.md walker. Tolerates a missing scan-root directory via the
// try/catch returning early (mirrors audit-id-namespace.cjs findFiles).
// T-13-04 defense-in-depth: skip symbolic-link directories so a stray symlink
// inside a SCAN_ROOT cannot make the walk read files outside the repo (the
// migr-06-close-gate.cjs assertInsidePhaseDir containment posture; ASVS V12).
function findMarkdown(dir, out) {
	let entries;
	try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
	for (const entry of entries) {
		if (entry.isSymbolicLink()) continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) findMarkdown(full, out);
		else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full);
	}
}

// Per-file scanner: read the file, track fence state, and count raw-git hits
// inside bash/sh/zsh fences only. Returns the repo-relative path (forward-slash
// separated so it matches the BASELINE keys on every OS), the hit count, and
// the hit-line list for the `.md` report. Shell-comment lines (`#`-prefixed)
// inside a fence are skipped (mirrors lint-vcs-no-raw-git.cjs:133).
function scanFile(absPath, repoRoot) {
	const rel = path.relative(repoRoot, absPath).split(path.sep).join('/');
	const lines = fs.readFileSync(absPath, 'utf8').split('\n');
	const hits = [];
	let inFence = false;
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i];
		if (!inFence && FENCE_OPEN.test(line)) { inFence = true; continue; }
		if (inFence && FENCE_CLOSE.test(line)) { inFence = false; continue; }
		if (!inFence) continue;
		if (/^\s*#/.test(line)) continue; // shell comment — skip
		if (SHELL_GIT_RE.test(line)) {
			hits.push({ line: i + 1, snippet: line.trim().slice(0, 200) });
		}
	}
	return { path: rel, count: hits.length, hits };
}

// Core: walk all scan roots, scanFile each, build the per-file current-count
// map, then apply the per-file REGRESSION RULE (baseline_design): a file is a
// regression iff its current count EXCEEDS its baseline count (a path absent
// from the baseline is treated as baseline 0). `ok` is true iff there are zero
// regressions — raw-git REMOVED is never a regression. The `baseline` argument
// is injectable (defaults to the BASELINE constant) so the unit test can pass a
// synthetic baseline and verify the comparison independent of the frozen map.
function auditWorkflowRawGit({ scanRoots, repoRoot, baseline = BASELINE }) {
	const files = [];
	for (const root of scanRoots) findMarkdown(path.resolve(repoRoot, root), files);

	const currentCounts = {};
	let totalCurrent = 0;
	for (const abs of files) {
		const scanned = scanFile(abs, repoRoot);
		if (scanned.count > 0) {
			currentCounts[scanned.path] = scanned.count;
			totalCurrent += scanned.count;
		}
	}

	const regressions = [];
	for (const [rel, current] of Object.entries(currentCounts)) {
		const base = Object.prototype.hasOwnProperty.call(baseline, rel) ? baseline[rel] : 0;
		if (current > base) regressions.push({ path: rel, baseline: base, current });
	}
	regressions.sort((a, b) => a.path.localeCompare(b.path));

	return {
		ok: regressions.length === 0,
		scannedFiles: files.length,
		totalCurrent,
		currentCounts,
		regressions,
	};
}

function parseArgv(argv) {
	const out = { json: false };
	for (let i = 2; i < argv.length; i += 1) {
		if (argv[i] === '--json') out.json = true;
	}
	return out;
}

// IN-02 (REVIEW.md): full markdown-table cell escaping copied verbatim from
// audit-id-namespace.cjs. Order matters: escape `\` first so subsequently
// inserted backslashes (from the `|` escape) are NOT re-escaped.
function escapeMarkdownCell(s) {
	return String(s)
		.replace(/\\/g, '\\\\')
		.replace(/\|/g, '\\|')
		.replace(/`/g, '\\`')
		.replace(/\r\n|\r|\n/g, '<br>');
}

function emitMarkdown(result) {
	const lines = [
		'# Workflow raw-git audit — Phase 13 (LINT-04)',
		'',
		`**Generated:** ${new Date().toISOString().slice(0, 10)}`,
		'**Mode:** baseline-regression guard (frozen 127-hit baseline; fails only on raw-git ADDED beyond baseline)',
		`**Files scanned:** ${result.scannedFiles}`,
		`**Current raw-git hits:** ${result.totalCurrent}`,
		`**Regressions:** ${result.regressions.length}`,
		`**Result:** ${result.ok ? 'PASS — within baseline' : 'FAIL — raw-git regression detected'}`,
		'',
	];
	if (result.regressions.length > 0) {
		lines.push(
			'## Regressions',
			'',
			'A scanned file\'s current raw-git count exceeds its frozen baseline — NEW raw-git was added to workflow markdown.',
			'',
			'| File | Baseline | Current |',
			'|------|----------|---------|',
		);
		for (const r of result.regressions) {
			lines.push(`| \`${escapeMarkdownCell(r.path)}\` | ${r.baseline} | ${r.current} |`);
		}
	} else {
		lines.push('No regressions — every scanned file is within its frozen raw-git baseline.');
	}
	return lines.join('\n') + '\n';
}

function emitJson(result) {
	return JSON.stringify({
		$schema_version: 1,
		scanned_at: new Date().toISOString(),
		ok: result.ok,
		scannedFiles: result.scannedFiles,
		totalCurrent: result.totalCurrent,
		currentCounts: result.currentCounts,
		regressions: result.regressions,
	}, null, 2) + '\n';
}

// Only run when invoked as a script (not when required as a module by tests).
if (require.main === module) {
	const argv = parseArgv(process.argv);
	const repoRoot = path.resolve(__dirname, '..');
	const result = auditWorkflowRawGit({ scanRoots: SCAN_ROOTS, repoRoot, baseline: BASELINE });
	process.stdout.write(argv.json ? emitJson(result) : emitMarkdown(result));
	// CI-06: non-zero exit fails the parallel-e2e lane (the regression-guard
	// exit code — the deliberate divergence from audit-id-namespace.cjs).
	process.exit(result.ok ? 0 : 1);
}

module.exports = {
	auditWorkflowRawGit,
	scanFile,
	findMarkdown,
	emitMarkdown,
	emitJson,
	SHELL_GIT_RE,
	BASELINE,
};
