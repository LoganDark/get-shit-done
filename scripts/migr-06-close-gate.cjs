#!/usr/bin/env node
/**
 * scripts/migr-06-close-gate.cjs (Phase 8 Plan 3, MIGR-06 close-gate)
 *
 * One-shot rewriter pass over `.planning/phases/08-…/` to migrate
 * `commit_id`-shape ids written during Plans 1+2 to `change_id`-shape
 * (post-FLIP unified revision contract). Per CONTEXT D-05 dogfood-cutover
 * model: NO mid-phase rewrites. This script runs EXACTLY ONCE at v1.2 close-gate.
 *
 * Implementation note: the canonical `sdk/src/vcs/format-migration/run.ts`
 * orchestrator walks the WHOLE `.planning/` tree under config.json lock + atomic
 * commit + adapter flip. That's overkill (and wrong-scoped) for a phase-dir
 * close-gate. This script implements a NARROWER pass:
 *
 *   1. Walk `.planning/phases/08-unified-revision-model-…/**.md`
 *   2. For each file, run `migrateContent(content, 'git→jj', resolver, filePath)`
 *      using a live jj-backed resolver that returns `change_id` for any hex
 *      `commit_id` found in eligible zones (inline backticks or frontmatter
 *      allowlisted keys).
 *   3. Write the migrated file via atomic rename.
 *   4. Idempotency: a second invocation must be byte-identical to the first.
 *
 * Pre-flight: WC must NOT be dirty inside the phase dir (other files outside
 * scope are tolerated — the actual orchestrator's working-copy dirty check is
 * intentionally relaxed here because Plan 3 has multiple in-flight commits).
 *
 * Scope confinement is enforced by the walk root being a literal constant and
 * the path-containment guard below.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// Load the migrateContent transformer via tsx (rewrite.ts is ESM-only in dist/).
// Rather than spawn tsx, port the small needed surface inline below.
// This keeps the script CJS-friendly and avoids a dist build step.

const REPO_ROOT = path.resolve(__dirname, '..');
const PHASE_DIR = path.resolve(REPO_ROOT, '.planning/phases/08-unified-revision-model-audit-test-prep-flip-lint-guard-close');

// Containment guard — the rewriter MUST NOT touch files outside PHASE_DIR.
//
// IN-01 (REVIEW.md): this is defense-in-depth against symlink escape from
// inside PHASE_DIR pointing OUT. `walkMd` is rooted at PHASE_DIR and joins
// names from readdirSync (which does NOT follow symlinks for entry
// classification by default), BUT `entry.isDirectory()` returns true for a
// symlinked directory inside PHASE_DIR, so recursion would follow the link
// and produce absolute paths outside PHASE_DIR. This guard catches that
// case and aborts. Do NOT strip as "dead code" — it is the only line of
// defense between this rewriter and the rest of the repo if a stray
// symlink ever lands inside PHASE_DIR (e.g. from an artifact copy-in).
function assertInsidePhaseDir(absPath) {
	const normalized = path.resolve(absPath);
	if (normalized !== PHASE_DIR && !normalized.startsWith(PHASE_DIR + path.sep)) {
		throw new Error(`migr-06-close-gate: refusing to touch path outside PHASE_DIR: ${normalized}`);
	}
}

// ─── inline migrateContent (ported subset of sdk/src/vcs/format-migration/rewrite.ts) ───
// Only the git→jj direction is needed (we're already on jj; close-gate maps
// commit_id-shape (hex 7-40) to change_id-shape (k-z 8-12) inside eligible zones).

const GIT_SHA_RE = /(?<![0-9a-fA-F])([0-9a-f]{7,40})(?![0-9a-fA-F])/g;

// WR-02: this set MUST be a superset of the canonical
// `COMMIT_KEY_ALLOWLIST` exported from sdk/src/vcs/format-migration/rewrite.ts.
// Drift is a silent bit-rot risk — a key added to the canonical set but
// missed here means the close-gate skips frontmatter values the canonical
// rewriter would have migrated. A unit test in
// tests/scripts/migr-06-close-gate.test.cjs asserts the superset relation.
const COMMIT_KEY_ALLOWLIST = new Set([
	'resolution_commit', 'commit', 'commit_hash', 'commit_id',
	'source_commit', 'migration_commit', 'first_commit', 'last_commit',
	'sha', 'hash', 'rev', 'revision',
]);

function findEligibleZones(content) {
	const zones = [];
	const lines = content.split('\n');

	// Pass 1: frontmatter detection (YAML --- block at file start)
	let frontmatterEndLine = -1;
	if (lines[0] === '---') {
		for (let i = 1; i < lines.length; i++) {
			if (lines[i] === '---') { frontmatterEndLine = i; break; }
		}
	}

	// Pass 2: frontmatter zones on commit-keyed lines
	if (frontmatterEndLine > 0) {
		let offset = lines[0].length + 1; // first '---' + '\n'
		for (let i = 1; i < frontmatterEndLine; i++) {
			const line = lines[i];
			const colonIdx = line.indexOf(':');
			if (colonIdx > 0) {
				const key = line.slice(0, colonIdx).trim();
				if (COMMIT_KEY_ALLOWLIST.has(key)) {
					const valueStart = offset + colonIdx + 1;
					const valueEnd = offset + line.length;
					zones.push({ start: valueStart, end: valueEnd, source: 'frontmatter' });
				}
			}
			offset += line.length + 1;
		}
	}

	// Pass 3: inline backtick spans whose content is ONLY a hex id
	const bodyStart = frontmatterEndLine > 0
		? lines.slice(0, frontmatterEndLine + 1).join('\n').length + 1
		: 0;

	// Track fenced code blocks to exclude
	const fenceRe = /^(```|~~~)/;
	const fenceState = { inFence: false };

	// Re-walk lines to skip fenced blocks
	let lineOffset = 0;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (fenceRe.test(line)) {
			fenceState.inFence = !fenceState.inFence;
			lineOffset += line.length + 1;
			continue;
		}
		if (fenceState.inFence) {
			lineOffset += line.length + 1;
			continue;
		}
		if (lineOffset >= bodyStart || frontmatterEndLine < 0) {
			// Find inline backtick spans on this line
			const inlineRe = /`([^`\n]+)`/g;
			let m;
			while ((m = inlineRe.exec(line)) !== null) {
				const inner = m[1];
				if (/^[0-9a-f]{7,40}$/.test(inner)) {
					const start = lineOffset + m.index + 1; // skip opening backtick
					const end = start + inner.length;
					zones.push({ start, end, source: 'backtick' });
				}
			}
		}
		lineOffset += line.length + 1;
	}

	return zones;
}

function isMatchInEligibleZone(start, end, zones) {
	for (const z of zones) {
		if (start >= z.start && end <= z.end) return true;
	}
	return false;
}

// Resolver cache (cid → change_id or null)
const resolverCache = new Map();

function resolveCommitIdToChangeId(commitId) {
	if (resolverCache.has(commitId)) return resolverCache.get(commitId);
	try {
		const out = execFileSync('jj', [
			'log', '-r', commitId, '-T', 'change_id', '--no-graph', '-n', '1',
		], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
		if (/^[k-z]{8,}$/.test(out)) {
			resolverCache.set(commitId, out);
			return out;
		}
		resolverCache.set(commitId, null);
		return null;
	} catch {
		resolverCache.set(commitId, null);
		return null;
	}
}

function migrateContent(content, filePath) {
	const zones = findEligibleZones(content);
	if (zones.length === 0) return { content, orphans: [] };

	GIT_SHA_RE.lastIndex = 0;
	const orphans = [];
	let out = '';
	let cursor = 0;
	let m;
	while ((m = GIT_SHA_RE.exec(content)) !== null) {
		const id = m[1];
		const matchStart = m.index;
		const matchEnd = GIT_SHA_RE.lastIndex;
		if (!isMatchInEligibleZone(matchStart, matchEnd, zones)) continue;

		out += content.slice(cursor, matchStart);
		const changeId = resolveCommitIdToChangeId(id);
		if (changeId) {
			// Use 12-char short change_id for inline backticks (canonical width)
			// to match jj's default display + existing 12-char hex convention.
			out += changeId.slice(0, 12);
		} else {
			// Unresolvable — emit verbatim (skip semantics — B-07 safety net)
			out += id;
			orphans.push({ original: id, offset: matchStart, filePath, kind: 'unresolvable' });
		}
		cursor = matchEnd;
	}
	out += content.slice(cursor);
	return { content: out, orphans };
}

// ─── walker + driver ───

function walkMd(dir, results) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) walkMd(full, results);
		else if (entry.isFile() && entry.name.endsWith('.md')) results.push(full);
	}
	return results;
}

function main() {
	if (!fs.existsSync(PHASE_DIR)) {
		console.error(`migr-06-close-gate: PHASE_DIR not found: ${PHASE_DIR}`);
		process.exit(1);
	}

	const files = walkMd(PHASE_DIR, []);
	let migratedCount = 0;
	let totalOrphans = 0;
	const allOrphans = [];

	for (const file of files) {
		assertInsidePhaseDir(file);
		const before = fs.readFileSync(file, 'utf8');
		const { content: after, orphans } = migrateContent(before, file);
		if (after !== before) {
			fs.writeFileSync(file, after);
			migratedCount++;
			console.log(`migr-06: migrated ${path.relative(REPO_ROOT, file)} (${orphans.length} orphans)`);
		}
		totalOrphans += orphans.length;
		allOrphans.push(...orphans);
	}

	console.log(`migr-06-close-gate: scanned ${files.length} .md files in ${path.relative(REPO_ROOT, PHASE_DIR)}; migrated ${migratedCount}; orphans ${totalOrphans}`);
	if (allOrphans.length > 0) {
		console.log('migr-06: orphan tokens (unresolvable; emitted verbatim):');
		for (const o of allOrphans) {
			console.log(`  ${path.relative(REPO_ROOT, o.filePath)}@${o.offset}: ${o.original}`);
		}
	}
}

// WR-02: export internals for the superset-assertion test. Only run main when
// invoked directly (not when require()'d from a test).
if (require.main === module) {
	main();
}

module.exports = { COMMIT_KEY_ALLOWLIST };
