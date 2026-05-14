/**
 * Backend matrix constants and GSD_TEST_BACKENDS env parser.
 * D-15: TS source of truth; tests/helpers.cjs require()s the compiled
 * dist-cjs/vcs/backends.js.
 *
 * RESEARCH Open Q5: BACKENDS_DECLARED has all three keys (TEST-03);
 * BACKENDS_AVAILABLE is the subset with a real impl. Phase 1: AVAILABLE = ['git'];
 * Phase 3 adds 'jj-colocated' and 'jj-native'.
 */
import type { VcsBackendKey } from './types.js';
export declare const BACKENDS_DECLARED: readonly VcsBackendKey[];
export declare const BACKENDS_AVAILABLE: readonly VcsBackendKey[];
/**
 * Phase 3 D-12: per-verb allowlist for backend availability. Maps each
 * JjVcsAdapter contract verb to the set of backends where it is implemented.
 * The contract-test fixture (`vcs-fixture.ts::makeBackendFixture` +
 * `vcsTest(kind)` consumers) consults this map and THROWS
 * (`VcsNotImplementedError`) — not skips — when a verb isn't yet implemented
 * on the target backend. Skip-not-throw is rejected because TEST-06's
 * skip-count guard would silently mask drift.
 *
 * Plan 03-01 seeds every entry with `['git']` only. Verb-group plans
 * (03-03..03-06) flip entries to include `'jj-colocated'` as their bodies
 * land. Phase 5 deletes this map entirely when CI-01 graduates the
 * jj-colocated lane from allow-failure to required-blocking.
 *
 * Verb key shape: dot-separated path on the adapter (e.g.,
 * `'refs.bookmarks.create'`). Cross-backend verbs only — gitOnly verbs are
 * statically narrowed via `vcs.kind === 'git'` and not gated here.
 */
export declare const BACKENDS_AVAILABLE_FOR_VERB: Readonly<Record<string, readonly VcsBackendKey[]>>;
export interface ParseBackendsResult {
    /** Backends that will actually run (intersection of requested and BACKENDS_AVAILABLE). */
    available: VcsBackendKey[];
    /** Backends the caller asked for via env var (empty when env unset / empty). */
    requested: string[];
    /** Backends in `requested` that are not in BACKENDS_AVAILABLE — caller should warn. */
    unavailable: string[];
}
/**
 * Parse GSD_TEST_BACKENDS into a structured record. B-4: consumers MUST inspect
 * `unavailable.length` and warn (or fail under CI) when the user requested specific
 * backends but none are available — silently exiting 0 with zero tests run violates
 * the spirit of TEST-03/TEST-04.
 *
 * Empty/undefined env → run all available; `requested` stays empty so callers know
 * the user did not ask for filtering.
 */
export declare function parseBackendsEnv(envValue: string | undefined): ParseBackendsResult;
//# sourceMappingURL=backends.d.ts.map