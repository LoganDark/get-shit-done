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
export const BACKENDS_AVAILABLE: readonly VcsBackendKey[] = Object.freeze(['git'] as const);

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
