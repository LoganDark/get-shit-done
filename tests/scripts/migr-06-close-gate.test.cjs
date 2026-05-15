'use strict';

/**
 * WR-02 regression test: assert that the inline `COMMIT_KEY_ALLOWLIST` in
 * scripts/migr-06-close-gate.cjs is a SUPERSET of the canonical
 * `COMMIT_KEY_ALLOWLIST` exported from
 * sdk/src/vcs/format-migration/rewrite.ts.
 *
 * The close-gate script intentionally duplicates the rewriter's allowlist
 * inline (rewrite.ts is ESM-only and the close-gate is a CJS one-shot —
 * the maintainer rationale is documented in migr-06-close-gate.cjs's
 * header comment). The duplication is acceptable IF and only IF the close
 * gate set never drifts into a strict subset of the canonical one: a key
 * that exists canonically but is missed by the close gate means
 * frontmatter values on that key would not be rewritten at close-gate time.
 *
 * Test strategy: load the canonical set from rewrite.ts via a tsx
 * subprocess (rewrite.ts is ESM with `import.meta.url`-using transitive
 * deps), JSON-serialize the names, then assert every canonical key is
 * present in the close-gate's exported Set.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

test('migr-06-close-gate COMMIT_KEY_ALLOWLIST is a superset of rewrite.ts COMMIT_KEY_ALLOWLIST (WR-02)', () => {
	const { COMMIT_KEY_ALLOWLIST: closeGateSet } = require(
		path.join(REPO_ROOT, 'scripts', 'migr-06-close-gate.cjs'),
	);

	assert.ok(closeGateSet instanceof Set, 'close-gate must export a Set');

	// Load canonical set via tsx. We print the set as a JSON array of strings
	// from a one-liner; if rewrite.ts ever stops exporting the symbol the
	// spawn will exit non-zero and this test fails loudly.
	const canonicalJson = execFileSync(
		'npx',
		[
			'tsx',
			'-e',
			"import { COMMIT_KEY_ALLOWLIST } from './sdk/src/vcs/format-migration/rewrite.ts'; process.stdout.write(JSON.stringify([...COMMIT_KEY_ALLOWLIST]))",
		],
		{ cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
	);
	const canonical = JSON.parse(canonicalJson);
	assert.ok(Array.isArray(canonical) && canonical.length > 0, 'canonical set must be non-empty');

	const missing = canonical.filter(key => !closeGateSet.has(key));
	assert.deepEqual(
		missing,
		[],
		`migr-06-close-gate.cjs COMMIT_KEY_ALLOWLIST is missing canonical keys: ${JSON.stringify(missing)}. ` +
			`Add them to scripts/migr-06-close-gate.cjs to keep the close-gate's coverage at least as wide as ` +
			`sdk/src/vcs/format-migration/rewrite.ts. Drift in the OTHER direction (close-gate has MORE keys) is fine.`,
	);
});
