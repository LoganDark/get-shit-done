/**
 * tests/__tools__/vitest.d.ts (Phase 8 Plan 2, D-02a)
 *
 * TypeScript module augmentation for the `toBeIdOf` custom matcher
 * registered in tests/__tools__/vitest-matchers.ts.
 *
 * Both `Assertion` and `AsymmetricMatchersContaining` are augmented —
 * the latter is required for composability inside `expect.objectContaining({...})`
 * (the D-02 deciding case).
 *
 * Picked up via sdk/tsconfig.json `include` glob (Step 4 of this task).
 *
 * Source: https://vitest.dev/guide/extending-matchers#typescript-extension
 */

import type { VcsKind, VcsBackendKey } from '../../sdk/src/vcs/types.js';

/**
 * The matcher accepts either the cross-backend `VcsKind` (the canonical
 * 'git' | 'jj' literal) or the more granular `VcsBackendKey`
 * ('git' | 'jj-colocated' | 'jj-native') so `describe.for(selectedBackends())`
 * closures can pass their loop variable directly.
 */
type ToBeIdOfKind = VcsKind | VcsBackendKey;

interface CustomMatchers<R = unknown> {
	toBeIdOf(kind: ToBeIdOfKind | { kind: ToBeIdOfKind; allowShort?: boolean }): R;
}

declare module 'vitest' {
	interface Assertion<T = unknown> extends CustomMatchers<T> {}
	interface AsymmetricMatchersContaining extends CustomMatchers {}
}
