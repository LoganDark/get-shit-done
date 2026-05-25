'use strict';

// allow-test-rule: pending-migration-to-typed-ir [#2974]
// Tracked in #2974 for migration to typed-IR assertions per CONTRIBUTING.md
// "Prohibited: Raw Text Matching on Test Outputs". Per-file review may
// reclassify some entries as source-text-is-the-product during migration.

/**
 * Locks docs/INVENTORY.md `## Commands` table-row count against
 * `commands/gsd/*.md` filesystem count.
 *
 * Cross-linked to `tests/architecture-counts.test.cjs` (single-responsibility
 * per Phase 17 CF-03; separate failure messages, single test concern here)
 * and `tests/inventory-counts.test.cjs` (sibling — asserts headline counts
 * only; this file asserts table-row count).
 *
 * Both sides computed at test runtime — no hardcoded numbers.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const INVENTORY_MD = path.join(ROOT, 'docs', 'INVENTORY.md');
const INVENTORY = fs.readFileSync(INVENTORY_MD, 'utf8');
const COMMANDS_DIR = path.join(ROOT, 'commands/gsd');

function commandsTableRowCount() {
	// Extract the `## Commands (N shipped)` section through the next
	// `## ` heading (or EOF).
	const start = INVENTORY.indexOf('## Commands ');
	assert.ok(start >= 0, 'docs/INVENTORY.md is missing the "## Commands " heading');
	const next = INVENTORY.indexOf('\n## ', start + 1);
	const section = INVENTORY.slice(start, next === -1 ? INVENTORY.length : next);
	// Count rows matching `| `/gsd-...` `
	const matches = section.match(/^\|\s+`\/gsd-[^`]+`/gm) || [];
	return matches.length;
}

function filesystemCommandCount() {
	return fs
		.readdirSync(COMMANDS_DIR)
		.filter((name) => fs.statSync(path.join(COMMANDS_DIR, name)).isFile())
		.filter((name) => name.endsWith('.md'))
		.length;
}

describe('docs/INVENTORY.md ## Commands table row count matches commands/gsd/', () => {
	test('row count equals filesystem command file count', () => {
		const documented = commandsTableRowCount();
		const actual = filesystemCommandCount();
		assert.strictEqual(
			documented,
			actual,
			`INVENTORY.md ## Commands table has ${documented} rows but commands/gsd/ has ${actual} .md files`,
		);
	});
});
