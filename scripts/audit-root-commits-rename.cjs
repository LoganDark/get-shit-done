#!/usr/bin/env node
/**
 * audit-root-commits-rename.cjs (Phase 15 Plan 01, D-13)
 *
 * One-shot pre-rename audit script for the `rootCommits` → `rootRevisions`
 * symbol rename (NAMING-01). Emits the D-09 grouped-by-extension JSON shape
 * to STDOUT ONLY. The caller (Plan 15.01 audit task) redirects the stdout
 * stream into the JSON sidecar at
 * `.planning/phases/15-adapter-surface-extensions-rename/rootCommits-rename-audit.json`.
 *
 * STDOUT-ONLY CONTRACT (Pitfall 8 / memory `feedback_avoid_jj_auto_tracked_output`):
 * - The script body NEVER calls `fs.writeFile`, `fs.writeFileSync`, or
 *   `fs.appendFile` — it only writes to `process.stdout`. The sidecar file
 *   is materialized by the shell `>` redirection in the audit task.
 * - This prevents jj from auto-tracking an in-tree write that would race
 *   the audit/rename commit adjacency invariant (D-12).
 *
 * SINGLE-PURPOSE: discarded after Phase 15 milestone close (not a recurring
 * CI lint). Mirrors `scripts/audit-id-namespace.cjs` shape (regex+walker,
 * Object.freeze enum, pure unit-testable helper function exported via
 * `module.exports` so the node:test sibling can assert shape invariants).
 *
 * Schema fields (per CONTEXT D-09):
 *   generatedAt        ISO timestamp
 *   totalCount         number of in-scope `\brootCommits\b` line hits
 *   byExtension        { ts, cjs, js, md, json } → array of {file, line, snippet}
 *   specialCases       Array of {file, line, kind, snippet, reason?} — surfaces
 *                      capability-matrix string literal AND historical-prose
 *                      carve-outs explicitly (D-11)
 *   carveOuts          Array of {path, reason} (ROADMAP Phase 15 SC1 carve-out list)
 *   idempotencyHash    MD5 over sorted {file, line} tuples + per-extension counts
 *                      — catches the "new ref added between audit and rename"
 *                      failure mode (D-12)
 */

'use strict';

const { createHash } = require('node:crypto');
const path = require('node:path');

const PATTERN = '\\brootCommits\\b';

const EXTENSIONS = Object.freeze(['ts', 'cjs', 'js', 'md', 'json']);

// CONTEXT D-13 carve-out directory list. These dirs are passed to grep via
// --exclude-dir so the walker never descends into them. The audit MUST scope
// to the same exclusion set the rename gate uses, or `specialCases` will
// silently drift from `byExtension`. Both `dist` and `dist-cjs` are excluded
// because they hold compiled output that will be regenerated post-rename;
// matching them at audit time would pollute totalCount with stale symbols.
const EXCLUDE_DIRS = Object.freeze([
	'node_modules',
	'.git',
	'.jj',
	'dist',
	'dist-cjs',
	'.archive-pre-v1.4',
	'v1.2-research',
	'research',
	'intel',
	'milestones',
	'seeds',
	'15-adapter-surface-extensions-rename',
]);

// File-level excludes: the audit script + its sibling test contain the literal
// substring "rootCommits" in JSDoc/header comments naming the rename target.
// They're self-references, not API consumers — they ship with the audit and
// will be discarded together post-milestone. Excluding them by basename keeps
// the post-rename grep gate clean without making them an outside-of-audit
// concern.
const EXCLUDE_FILES = Object.freeze([
	'audit-root-commits-rename.cjs',
	'audit-root-commits-rename.test.cjs',
]);

// CONTEXT D-09 carveOuts surfaced in the JSON envelope so reviewers can
// confirm which trees were intentionally skipped at audit time.
const CARVE_OUT_RECORDS = Object.freeze([
	Object.freeze({
		path: '.planning/research/.archive-pre-v1.4/',
		reason: 'historical-prose, pre-rename research artifacts (ROADMAP Phase 15 SC1 carve-out)',
	}),
	Object.freeze({
		path: '.planning/milestones/v1.2-research/',
		reason: 'historical-prose, v1.2 deferred-item research (ROADMAP Phase 15 SC1 carve-out)',
	}),
]);

// Plan truths #15-19: 5 in-scope active-doc files that retain their descriptive
// prose narrating the rename work itself. Each carries a per-file reason that
// the grep gate consults via specialCases so the gate exits 0 across all 5
// extensions even when these files match.
const HISTORICAL_PROSE_FILES = Object.freeze({
	'./.planning/PROJECT.md':
		'milestone narrative naming the rename target — describes the work, does not consume the API',
	'./.planning/STATE.md':
		'status-tracking prose naming the rename target — describes the work, does not consume the API',
	'./.planning/ROADMAP.md':
		'roadmap phase narrative + SC1 gate-definition backtick literal — describes the work and defines the verification gate',
	'./.planning/REQUIREMENTS.md':
		'NAMING-01 spec text + cross-reference prose naming the rename target — defines and bounds the work',
	'./.planning/phases/14.1-drop-mandatory-bookmark-on-parallel-dispatch-fan-in-emergenc/14.1-01-SUMMARY.md':
		'closed-phase summary historical narrative naming Phase 15.01 — modifying it would falsify the historical record',
});

/**
 * Run grep and return all matching {file, line, snippet} hits. The grep walker
 * is preferred over a Node fs walker for this one-shot audit because grep is
 * already battle-tested for include/exclude semantics and the perf difference
 * is irrelevant at this hit count.
 *
 * @returns {{file:string,line:number,snippet:string}[]}
 */
function collectHits(repoRoot) {
	const { spawnSync } = require('node:child_process');
	const excludeArgs = EXCLUDE_DIRS.map((d) => `--exclude-dir=${d}`);
	const fileExcludeArgs = EXCLUDE_FILES.map((f) => `--exclude=${f}`);
	const includeArgs = EXTENSIONS.map((ext) => `--include=*.${ext}`);
	// `-E` (POSIX extended regex) is portable across BSD/macOS grep AND
	// GNU grep. `\b` word-boundary works in both. Avoiding `-P` keeps the
	// script working on BSD grep (the default on macOS) without needing
	// GNU coreutils on PATH. Use spawnSync directly (no shell) so the
	// PATTERN regex never round-trips through shell metacharacter parsing.
	const argv = [
		'-rnE',
		PATTERN,
		...includeArgs,
		...excludeArgs,
		...fileExcludeArgs,
		'.',
	];

	const res = spawnSync('grep', argv, {
		cwd: repoRoot,
		encoding: 'utf8',
	});

	if (res.error) throw res.error;
	// grep exit codes: 0 = matches found, 1 = no matches, ≥2 = error
	if (res.status === 1) return [];
	if (res.status !== 0) {
		throw new Error(`grep failed (exit ${res.status}): ${res.stderr}`);
	}
	const stdout = res.stdout;

	const hits = [];
	for (const rawLine of stdout.split('\n')) {
		if (!rawLine) continue;
		// grep -rn output: ./path/to/file:LINE:rest-of-line
		const firstColon = rawLine.indexOf(':');
		if (firstColon < 0) continue;
		const secondColon = rawLine.indexOf(':', firstColon + 1);
		if (secondColon < 0) continue;
		const file = rawLine.slice(0, firstColon);
		const lineNum = Number.parseInt(rawLine.slice(firstColon + 1, secondColon), 10);
		if (!Number.isFinite(lineNum)) continue;
		const snippet = rawLine.slice(secondColon + 1).trim();
		hits.push({ file, line: lineNum, snippet });
	}
	return hits;
}

/**
 * Group hits by file extension. Files outside EXTENSIONS are dropped — the
 * include-args above guarantee we only see EXTENSIONS, but this is a defensive
 * filter in case grep returns something unexpected.
 *
 * @param {{file:string,line:number,snippet:string}[]} hits
 * @returns {Record<string, {file:string,line:number,snippet:string}[]>}
 */
function groupByExtension(hits) {
	const buckets = Object.fromEntries(EXTENSIONS.map((ext) => [ext, []]));
	for (const hit of hits) {
		const ext = path.extname(hit.file).slice(1).toLowerCase();
		if (!buckets[ext]) continue;
		buckets[ext].push(hit);
	}
	// Sort each bucket by (file, line) for deterministic output.
	for (const ext of EXTENSIONS) {
		buckets[ext].sort((a, b) => {
			if (a.file !== b.file) return a.file < b.file ? -1 : 1;
			return a.line - b.line;
		});
	}
	return buckets;
}

/**
 * Build the D-11 specialCases array. Two kinds:
 *   - capability-matrix-string-literal: backends.ts:79 (Pitfall 3 anchor)
 *   - historical-prose-carve-out: HISTORICAL_PROSE_FILES entries
 *
 * @param {{file:string,line:number,snippet:string}[]} hits
 * @returns {Array<{file:string,line?:number,kind:string,snippet?:string,reason:string}>}
 */
function buildSpecialCases(hits) {
	const cases = [];

	// (1) capability-matrix-string-literal — backends.ts at line 79 specifically
	const capabilityMatrixHits = hits.filter(
		(h) => h.file.endsWith('sdk/src/vcs/backends.ts') && h.line === 79,
	);
	for (const hit of capabilityMatrixHits) {
		cases.push({
			file: hit.file,
			line: hit.line,
			kind: 'capability-matrix-string-literal',
			snippet: hit.snippet,
			reason:
				'TSC does NOT validate string-key object access (Pitfall 3 / v1.2 retro CR-01). Manual flip required; '
				+ 'guarded by the new backends.test.ts regression test added in Task 3.',
		});
	}

	// (2) historical-prose-carve-out — one entry per file that ALSO appears in hits
	const seenHistoricalFiles = new Set();
	for (const hit of hits) {
		if (HISTORICAL_PROSE_FILES[hit.file] && !seenHistoricalFiles.has(hit.file)) {
			seenHistoricalFiles.add(hit.file);
			cases.push({
				file: hit.file,
				kind: 'historical-prose-carve-out',
				reason: HISTORICAL_PROSE_FILES[hit.file],
			});
		}
	}

	return cases;
}

/**
 * Compute D-12 MD5 idempotency hash over sorted {file, line} tuples plus
 * per-extension counts. Catches "new rootCommits ref landed between audit
 * and rename" failure mode — re-running audit would yield a different hash.
 *
 * @param {{file:string,line:number,snippet:string}[]} hits
 * @param {Record<string, {file:string,line:number,snippet:string}[]>} byExtension
 * @returns {string} 32-char lowercase hex MD5
 */
function computeIdempotencyHash(hits, byExtension) {
	const sortedTuples = hits
		.map((h) => `${h.file}:${h.line}`)
		.sort();
	const counts = Object.fromEntries(
		EXTENSIONS.map((ext) => [ext, byExtension[ext].length]),
	);
	const hashInput = JSON.stringify({ files: sortedTuples, counts });
	return createHash('md5').update(hashInput).digest('hex');
}

/**
 * Build the D-09 audit envelope. Pure function: takes hits, returns the
 * sorted-keys structured output that becomes the JSON sidecar.
 *
 * @param {{file:string,line:number,snippet:string}[]} hits
 * @param {string} generatedAt ISO timestamp; pass in for test determinism
 * @returns {object}
 */
function buildAuditEnvelope(hits, generatedAt) {
	const byExtension = groupByExtension(hits);
	const specialCases = buildSpecialCases(hits);
	const idempotencyHash = computeIdempotencyHash(hits, byExtension);
	return {
		generatedAt,
		totalCount: hits.length,
		byExtension,
		specialCases,
		carveOuts: CARVE_OUT_RECORDS.map((r) => ({ path: r.path, reason: r.reason })),
		idempotencyHash,
	};
}

// Only run when invoked as a script (not when required as a module by tests).
if (require.main === module) {
	const repoRoot = path.resolve(__dirname, '..');
	const hits = collectHits(repoRoot);
	const envelope = buildAuditEnvelope(hits, new Date().toISOString());
	process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
}

module.exports = {
	PATTERN,
	EXTENSIONS,
	EXCLUDE_DIRS,
	EXCLUDE_FILES,
	CARVE_OUT_RECORDS,
	HISTORICAL_PROSE_FILES,
	collectHits,
	groupByExtension,
	buildSpecialCases,
	computeIdempotencyHash,
	buildAuditEnvelope,
};
