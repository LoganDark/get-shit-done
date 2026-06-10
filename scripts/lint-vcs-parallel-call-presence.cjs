#!/usr/bin/env node
/**
 * lint-vcs-parallel-call-presence.cjs (Phase 16 plan 16.01, LINT-06)
 *
 * FILE-level pairing lint for workspace.parallel.dispatch <-> workspace.parallel.fan-in
 * literals in bash/sh/zsh fences under gsd-core/workflows/ (19-10 re-point).
 *
 * Scope: SHELL FENCE not prose mention (Pitfall 7 / CF-04). A workflow .md file
 * that contains `workspace.parallel.dispatch` inside any bash/sh/zsh fence MUST
 * also contain `workspace.parallel.fan-in` inside any bash/sh/zsh fence in the
 * SAME file, and vice versa (D-02 bidirectional). The pairing is FILE-level —
 * NOT fence-scoped, NOT section-scoped, NOT proximity-scoped (D-01; empirically
 * justified by execute-phase.md putting the two calls in different `##` sections
 * across different fences).
 *
 * Fence regex: BYTE-IDENTICAL to scripts/audit-workflow-raw-git.cjs:48-49
 * (CF-06 — shared-lib extraction forbidden per REQUIREMENTS.md §Out of Scope L92).
 *
 * Per-entry allowlist via scripts/lib/allowlist-parser.cjs is the SOLE opt-out
 * mechanism in v1.4 — no inline escape annotation today per D-09 (pure YAGNI;
 * when a real cancel-only / fanIn-only consumer emerges, both the lint regex AND
 * the annotation syntax get added together).
 *
 * IP-2 (cancel/fanIn-only exclusion): see .planning/research/PITFALLS.md §IP-2 —
 * deferred per D-09, no inline escape annotation today.
 *
 * Exit 0 = clean. Exit 1 = unpaired files (with file:1 diagnostics — pairing is
 * file-scoped so the diagnostic anchors at line 1).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { parseAllowlist } = require('./lib/allowlist-parser.cjs');

// Pass --scan-root <dir> to scan an isolated tree (used by the fixture tests in
// tests/scripts/lint-vcs-parallel-call-presence.test.cjs to avoid repo-root
// pollution). Mirrors the lint-vcs-no-raw-git.cjs:32-41 pattern verbatim.
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

// Phase 8 Plan 1 D-03: shared per-entry allowlist parser; throws on schema
// violations (missing reason/owner; both path+glob; neither; expires field).
const ALLOW = parseAllowlist(
	require('./lint-vcs-parallel-call-presence.allow.json'),
	'lint-vcs-parallel-call-presence',
);
const ALLOW_FILES = ALLOW.files;
const ALLOW_GLOB_REGEXES = ALLOW.globRegexes;

// Byte-identical to scripts/audit-workflow-raw-git.cjs:48-49 (CF-06 — audit
// and lint must agree on what counts as a fence; shared-lib extraction
// forbidden per REQUIREMENTS.md §Out of Scope L92).
const FENCE_OPEN = /^\s*(```+|~~~+)\s*(bash|sh|zsh)\b/i;
const FENCE_CLOSE = /^\s*(```+|~~~+)\s*$/;
// D-03: narrower than audit's 3-root scope (which includes references/ and
// agents/) — workflows only, to avoid Pitfall 7 false-positives on prose-only
// references in non-dispatch workflows. (19-10: re-pointed from the retired
// get-shit-done/ layout to the adopted upstream gsd-core/ layout.)
const SCAN_ROOTS = ['gsd-core/workflows'];

// Content-driven literal substring detection (CF-04). NO regex anchors —
// the fence walker already scopes to bash content. Hyphenated fan-in per
// the existing literal in execute-phase.md:775.
const PARALLEL_DISPATCH_RE = /workspace\.parallel\.dispatch/;
const PARALLEL_FAN_IN_RE = /workspace\.parallel\.fan-in/;

// Recursive *.md walker. Tolerates missing scan-root via the try/catch.
// T-13-04 defense-in-depth: skip symbolic-link directories so a stray symlink
// inside a SCAN_ROOT cannot make the walk read files outside the repo
// (ASVS V12; threat_model T-16.01-01).
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

function isAllowed(rel) {
	if (ALLOW_FILES.has(rel)) return true;
	for (const re of ALLOW_GLOB_REGEXES) if (re.test(rel)) return true;
	return false;
}

// Per-file scanner: track fence state, accumulate per-file booleans
// `hasDispatch` / `hasFanIn`. After the walk: `violation = hasDispatch !== hasFanIn`
// (XOR — exactly one literal present indicates an unpaired file).
// Shell-comment lines (`#`-prefixed) inside a fence are skipped (mirrors
// audit-workflow-raw-git.cjs:124).
function scanFile(absPath, scanRoot) {
	const rel = path.relative(scanRoot, absPath).split(path.sep).join('/');
	const lines = fs.readFileSync(absPath, 'utf8').split('\n');
	let inFence = false;
	let hasDispatch = false;
	let hasFanIn = false;
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i];
		if (!inFence && FENCE_OPEN.test(line)) { inFence = true; continue; }
		if (inFence && FENCE_CLOSE.test(line)) { inFence = false; continue; }
		if (!inFence) continue;
		if (/^\s*#/.test(line)) continue; // shell comment — skip
		if (PARALLEL_DISPATCH_RE.test(line)) hasDispatch = true;
		if (PARALLEL_FAN_IN_RE.test(line)) hasFanIn = true;
	}
	return { path: rel, hasDispatch, hasFanIn };
}

const files = [];
for (const root of SCAN_ROOTS) findMarkdown(path.resolve(SCAN_ROOT, root), files);

const violations = [];
for (const abs of files) {
	const scanned = scanFile(abs, SCAN_ROOT);
	if (scanned.hasDispatch === scanned.hasFanIn) continue; // both or neither — paired or absent
	if (isAllowed(scanned.path)) continue;
	violations.push(scanned);
}

if (violations.length === 0) {
	console.log('ok lint-vcs-parallel-call-presence: ' + files.length + ' files scanned in ' + SCAN_ROOT + ', 0 violations');
	process.exit(0);
}

process.stderr.write('\nERROR lint-vcs-parallel-call-presence: ' + violations.length + ' unpaired file(s)\n\n');
for (const v of violations) {
	// Diagnostic anchored at line 1 since pairing is file-scoped (D-01 per <specifics>).
	process.stderr.write('  ' + v.path + ':1  missing paired call ' +
		'(has ' + (v.hasDispatch ? 'dispatch' : 'fan-in') + ' literal but no ' +
		(v.hasDispatch ? 'fan-in' : 'dispatch') + ' literal in any fence)\n');
}
process.stderr.write('\nFix: add the missing literal in a bash/sh/zsh fence, OR\n');
process.stderr.write('     add the file to scripts/lint-vcs-parallel-call-presence.allow.json with PR rationale.\n');
process.exit(1);
