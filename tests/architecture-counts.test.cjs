'use strict';

// allow-test-rule: pending-migration-to-typed-ir [#2974]
// Tracked in #2974 for migration to typed-IR assertions per CONTRIBUTING.md
// "Prohibited: Raw Text Matching on Test Outputs". Per-file review may
// reclassify some entries as source-text-is-the-product during migration.

/**
 * Locks docs/ARCHITECTURE.md (and translations) prose-count claims against
 * the filesystem live at test runtime. Both sides computed at test runtime
 * — no hardcoded numbers.
 *
 * Cross-linked to `tests/command-count-sync.test.cjs` (single-responsibility
 * per Phase 17 CF-03) and `tests/inventory-counts.test.cjs` (sibling drift
 * guard — headline counts).
 *
 * Per-locale exact-string regex per Phase 17 D-06; all-strict lockstep on
 * prose-count-carrying locales per D-04 (pt-BR carved out by structural
 * reality — no numeric prose-counts in docs/pt-BR/ARCHITECTURE.md per
 * RESEARCH key finding #2). Rounded-bucket installer LOC assertion per
 * D-03 (nearest 1000).
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

const EN_LABELS = {
	// EN defers commands + workflows to INVENTORY.md (lines 121, 143) —
	// those are tested by tests/inventory-counts.test.cjs and
	// tests/command-count-sync.test.cjs. EN ARCHITECTURE.md asserts only
	// `Total agents` directly (line 181).
	agents:       /\*\*Total agents:\*\*\s+(\d+)/,
	installerLoc: /The installer \(`bin\/install\.js`,\s+~([\d,]+)\s+lines\)/,
};

const JA_LABELS = {
	commands:     /\*\*コマンド総数:\*\*\s+(\d+)/,
	workflows:    /\*\*ワークフロー総数:\*\*\s+(\d+)/,
	agents:       /\*\*エージェント総数:\*\*\s+(\d+)/,
	installerLoc: /インストーラー（`bin\/install\.js`、約([\d,]+)行）/,
};

const KO_LABELS = {
	commands:     /\*\*전체 명령어 수:\*\*\s+(\d+)/,
	workflows:    /\*\*전체 워크플로우 수:\*\*\s+(\d+)/,
	agents:       /\*\*전체 에이전트 수:\*\*\s+(\d+)/,
	installerLoc: /인스톨러\(`bin\/install\.js`,\s+~([\d,]+)줄\)/,
};

// pt-BR excluded — file has no numeric prose-counts (verified 2026-05-25,
// RESEARCH key finding #2). D-04 lockstep applies only to prose-count-
// carrying locales by structural reality.
const LOCALES = [
	{ id: 'en',    file: 'docs/ARCHITECTURE.md',       labels: EN_LABELS },
	{ id: 'ja-JP', file: 'docs/ja-JP/ARCHITECTURE.md', labels: JA_LABELS },
	{ id: 'ko-KR', file: 'docs/ko-KR/ARCHITECTURE.md', labels: KO_LABELS },
];

const DIMENSIONS = [
	{ key: 'commands',  dir: 'commands/gsd',            filter: (f) => f.endsWith('.md') },
	{ key: 'workflows', dir: 'get-shit-done/workflows', filter: (f) => f.endsWith('.md') },
	{ key: 'agents',    dir: 'agents',                  filter: (f) => /^gsd-.*\.md$/.test(f) },
];

function fsCount(relDir, filter) {
	return fs
		.readdirSync(path.join(ROOT, relDir))
		.filter((name) => fs.statSync(path.join(ROOT, relDir, name)).isFile())
		.filter(filter)
		.length;
}

function installerLoc() {
	return fs.readFileSync(path.join(ROOT, 'bin/install.js'), 'utf8').split('\n').length - 1;
}

for (const locale of LOCALES) {
	describe(`docs/ARCHITECTURE.md (${locale.id}) prose counts match filesystem`, () => {
		const body = fs.readFileSync(path.join(ROOT, locale.file), 'utf8');

		for (const dim of DIMENSIONS) {
			if (!locale.labels[dim.key]) continue;
			test(`${locale.id}: ${dim.key} count matches ${dim.dir}/`, () => {
				const re = locale.labels[dim.key];
				const m = body.match(re);
				assert.ok(m, `${locale.file} missing prose-count for ${dim.key} (expected pattern: ${re})`);
				const documented = parseInt(m[1], 10);
				const actual = fsCount(dim.dir, dim.filter);
				assert.strictEqual(
					documented,
					actual,
					`${locale.file} ${dim.key}=${documented} disagrees with ${dim.dir}/=${actual}`,
				);
			});
		}

		test(`${locale.id}: install.js LOC rounded-bucket match`, () => {
			const re = locale.labels.installerLoc;
			const m = body.match(re);
			assert.ok(m, `${locale.file} missing installer-LOC prose (expected pattern: ${re})`);
			const documented = parseInt(m[1].replace(/[^\d]/g, ''), 10);
			const actual = installerLoc();
			const documentedBucket = Math.round(documented / 1000) * 1000;
			const actualBucket     = Math.round(actual / 1000) * 1000;
			assert.strictEqual(
				documentedBucket,
				actualBucket,
				`${locale.file} installer LOC bucket ${documentedBucket} disagrees with bin/install.js bucket ${actualBucket} (actual: ${actual})`,
			);
		});
	});
}
