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

export const BACKENDS_DECLARED: readonly VcsBackendKey[] = Object.freeze([
  'git',
  'jj-colocated',
  'jj-native',
] as const);
export const BACKENDS_AVAILABLE: readonly VcsBackendKey[] = Object.freeze([
  'git',
  'jj-colocated',
] as const);

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
export const BACKENDS_AVAILABLE_FOR_VERB: Readonly<
  Record<string, readonly VcsBackendKey[]>
> = Object.freeze({
  // VcsAdapterCommon top-level verbs
  commit: Object.freeze(['git'] as const),
  log: Object.freeze(['git'] as const),
  status: Object.freeze(['git'] as const),
  diff: Object.freeze(['git'] as const),
  findConflicts: Object.freeze(['git'] as const),
  push: Object.freeze(['git'] as const),
  fetch: Object.freeze(['git'] as const),
  // VcsRefs
  'refs.currentBookmarks': Object.freeze(['git'] as const),
  'refs.resolveShort': Object.freeze(['git'] as const),
  'refs.countCommits': Object.freeze(['git'] as const),
  'refs.rootCommits': Object.freeze(['git'] as const),
  'refs.exists': Object.freeze(['git'] as const),
  'refs.isIgnored': Object.freeze(['git'] as const),
  'refs.remotes': Object.freeze(['git'] as const),
  // VcsBookmarks
  'refs.bookmarks.list': Object.freeze(['git'] as const),
  'refs.bookmarks.create': Object.freeze(['git'] as const),
  'refs.bookmarks.move': Object.freeze(['git'] as const),
  'refs.bookmarks.delete': Object.freeze(['git'] as const),
  'refs.bookmarks.exists': Object.freeze(['git'] as const),
  'refs.bookmarks.switch': Object.freeze(['git'] as const),
  // VcsWorkspace
  'workspace.add': Object.freeze(['git'] as const),
  'workspace.forget': Object.freeze(['git'] as const),
  'workspace.list': Object.freeze(['git'] as const),
  'workspace.context': Object.freeze(['git'] as const),
  'workspace.prune': Object.freeze(['git'] as const),
  // Test-only snapshot/restore (gated separately so per-test fixture
  // setup can probe verb availability before invoking them — see
  // sdk/src/vcs/__tests__/vcs-fixture.ts). Phase 3 plan 03-02 flipped both
  // entries to include 'jj-colocated' once the real `jj op log`/
  // `jj op restore`-backed body landed in backends/jj.ts. This unlocks
  // the contract-test fixture lane for jj-colocated, enabling per-test
  // hermetic state rewind for verb-group plans 03-03..03-06.
  '__vcsTestOnly.snapshot': Object.freeze(['git', 'jj-colocated'] as const),
  '__vcsTestOnly.restore': Object.freeze(['git', 'jj-colocated'] as const),
});

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
export function parseBackendsEnv(envValue: string | undefined): ParseBackendsResult {
  if (envValue === undefined || envValue === '') {
    return { available: [...BACKENDS_AVAILABLE], requested: [], unavailable: [] };
  }
  const requested = envValue
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const isAvailable = (k: string): k is VcsBackendKey =>
    (BACKENDS_AVAILABLE as readonly string[]).includes(k);
  const available = requested.filter(isAvailable);
  const unavailable = requested.filter((k) => !isAvailable(k));
  return { available, requested, unavailable };
}
