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
  // Phase 3 plan 03-04 flipped `commit` to admit 'jj-colocated' — the
  // squash-based commit body (SQUASH-01..07) + bookmark advance (D-01/D-04)
  // + JJ-07 env propagation now live in backends/jj.ts.
  commit: Object.freeze(['git', 'jj-colocated'] as const),
  // Phase 3 plan 03-05 Task 1 flipped log/status/diff to admit 'jj-colocated':
  // log delegates to parseJjLog (plan 03-02); status hand-parses `jj status`
  // human-readable output (per RESEARCH §status()); diff wraps `jj diff` +
  // `--summary` parser. opts.staged is a documented no-op on jj (no index).
  log: Object.freeze(['git', 'jj-colocated'] as const),
  status: Object.freeze(['git', 'jj-colocated'] as const),
  diff: Object.freeze(['git', 'jj-colocated'] as const),
  // Phase 3 plan 03-05 Task 2 flipped findConflicts to admit 'jj-colocated':
  // uses jj's `conflicts()` PLURAL revset (RESEARCH Q1 correction;
  // CONTEXT/REQUIREMENTS/ROADMAP still say singular `conflict()`, doc-fix
  // deferred to plan 03-07 wrap-up). Path enumeration via `jj resolve --list
  // -r <rev>` (primary, empirically verified on jj 0.41) with `jj diff
  // --summary` fallback.
  findConflicts: Object.freeze(['git', 'jj-colocated'] as const),
  push: Object.freeze(['git'] as const),
  fetch: Object.freeze(['git'] as const),
  // VcsRefs — plan 03-03 flipped every verb with a real body to admit
  // 'jj-colocated'. `refs.isIgnored` stays git-only: the single production
  // caller pins `kind:'git'` (see 03-03-AUDIT.md), and the jj backend
  // throws `VcsNotImplementedError`.
  'refs.currentBookmarks': Object.freeze(['git', 'jj-colocated'] as const),
  'refs.resolveShort': Object.freeze(['git', 'jj-colocated'] as const),
  'refs.countCommits': Object.freeze(['git', 'jj-colocated'] as const),
  'refs.rootCommits': Object.freeze(['git', 'jj-colocated'] as const),
  'refs.exists': Object.freeze(['git', 'jj-colocated'] as const),
  'refs.isIgnored': Object.freeze(['git'] as const), // jj-side: VcsNotImplementedError (audit-confirmed no jj caller)
  'refs.remotes': Object.freeze(['git', 'jj-colocated'] as const),
  // VcsBookmarks — plan 03-03 flipped every mutator + list to admit
  // 'jj-colocated'. `refs.bookmarks.switch` stays git-only: both production
  // callers in commands.cjs pin `kind:'git'` (see 03-03-AUDIT.md), and the
  // jj backend throws `VcsNotImplementedError`.
  'refs.bookmarks.list': Object.freeze(['git', 'jj-colocated'] as const),
  'refs.bookmarks.create': Object.freeze(['git', 'jj-colocated'] as const),
  'refs.bookmarks.move': Object.freeze(['git', 'jj-colocated'] as const),
  'refs.bookmarks.delete': Object.freeze(['git', 'jj-colocated'] as const),
  'refs.bookmarks.exists': Object.freeze(['git', 'jj-colocated'] as const),
  'refs.bookmarks.switch': Object.freeze(['git'] as const), // jj-side: VcsNotImplementedError (audit-confirmed no jj caller)
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
