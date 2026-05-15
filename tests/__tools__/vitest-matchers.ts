/**
 * tests/__tools__/vitest-matchers.ts (Phase 8 Plan 2, TEST-12, D-02/D-02a)
 *
 * Vitest custom matcher `toBeIdOf` for cross-backend revision identifier
 * assertions. Replaces the per-backend friction that drove v1.1 Plan 02 to
 * relax cross-backend equality to `toBeTruthy()` (Pitfall 3).
 *
 * Composable inside `expect.objectContaining(...)` via the
 * `AsymmetricMatchersContaining` augmentation (vitest.d.ts).
 *
 * Registered via `setupFiles` in sdk/vitest.config.ts — loads once per
 * vitest process, automatic for every test file.
 *
 * Source: https://vitest.dev/guide/extending-matchers
 */

import { expect } from 'vitest';
import type { VcsKind, VcsBackendKey } from '../../sdk/src/vcs/types.js';

/**
 * Accept the broader `VcsBackendKey` (`'git' | 'jj-colocated' | 'jj-native'`)
 * in addition to `VcsKind` so `describe.for(selectedBackends())` closures
 * can pass their loop variable directly. Both `jj-*` keys collapse to the
 * jj alphabet/length for matcher purposes — there is no shape distinction
 * between colocated and native jj revision ids.
 */
type ToBeIdOfKind = VcsKind | VcsBackendKey;

interface ToBeIdOfOpts {
	kind: ToBeIdOfKind;
	allowShort?: boolean;
}

function normalizeKind(k: ToBeIdOfKind): VcsKind {
	return k === 'git' ? 'git' : 'jj';
}

expect.extend({
	toBeIdOf(received: unknown, kindOrOpts: ToBeIdOfKind | ToBeIdOfOpts) {
		const opts: ToBeIdOfOpts = typeof kindOrOpts === 'string'
			? { kind: kindOrOpts }
			: kindOrOpts;
		const kind = normalizeKind(opts.kind);
		const allowShort = opts.allowShort ?? false;
		const min = allowShort ? 7 : (kind === 'git' ? 40 : 12);
		const max = kind === 'git' ? 40 : 32;
		const alphabet = kind === 'git' ? /^[0-9a-f]+$/ : /^[k-z]+$/;
		const isString = typeof received === 'string';
		const lengthOk = isString && received.length >= min && received.length <= max;
		const shapeOk = isString && alphabet.test(received);
		const pass = isString && lengthOk && shapeOk;
		return {
			pass,
			message: () => pass
				? `expected ${JSON.stringify(received)} NOT to be a ${kind} id (${kind === 'git' ? '[0-9a-f]' : '[k-z]'} alphabet, ${min}-${max} chars)`
				: `expected ${JSON.stringify(received)} to be a ${kind} id (alphabet ${kind === 'git' ? '[0-9a-f]' : '[k-z]'}, ${min}-${max} chars); got ${isString ? `len=${received.length}, alphabet match=${shapeOk}` : `typeof ${typeof received}`}`,
		};
	},
});
