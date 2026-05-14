/**
 * NDJSON line parser for `jj bookmark list -T 'json(self) ++ "\n"'`.
 *
 * Phase 3 D-02 enforcement: when a record's `target` array has length > 1,
 * the bookmark is divergent across concurrent op-log updates and surfaces
 * as a typed `VcsBookmarkDivergentError` rather than being silently
 * collapsed to `target[0]`. Without this, multi-workspace divergence
 * becomes invisible corruption.
 *
 * Phase 3 D-03 round-trip: callers pass a `stripPrefix` function so the
 * returned `Bookmark.name` is the unprefixed (caller-visible) form.
 *
 * Split into its own module so the divergent-detection path can be unit-
 * tested with hand-rolled NDJSON fixtures without spinning up a real jj
 * binary — mirrors the layout pattern of `parse/jj-log.ts` /
 * `parse/jj-op-log.ts` / `parse/jj-workspace-list.ts`.
 *
 * Pinned NDJSON shape (jj 0.41.0, per `tests/fixtures/jj-ndjson/jj-bookmark-list-divergent.ndjson`):
 *   {"name":"gsd/phase-3","target":["<commit_id>"]}
 *   {"name":"gsd/divergent","target":["<a>","<b>"]}   // divergent
 *   {"name":"main","target":["<commit_id>"]}         // raw / no-prefix bookmark
 *
 * (RESEARCH §"jj bookmark list" — the `target` field is always an array;
 * length-1 is the steady-state, length>1 is the D-02 divergence signal.)
 */

import type { Bookmark } from '../types.js';
import { VcsBookmarkDivergentError } from '../types.js';

/**
 * Parse a single NDJSON record from `jj bookmark list -T 'json(self) ++ "\n"'`
 * into a typed `Bookmark`. Throws `VcsBookmarkDivergentError` when the
 * `target` array reports >1 entry (D-02). The caller-supplied `stripPrefix`
 * function maps raw `gsd/<name>` records back to caller-visible `<name>`.
 *
 * Throws a plain `Error` (with line preview) when the NDJSON line fails
 * to `JSON.parse` — mirrors T-03.02-01 tampering-mitigation pattern from
 * plan 03-02's parsers.
 */
export function parseJjBookmarkRecord(
  line: string,
  stripPrefix: (s: string) => string,
): Bookmark {
  let record: { name: unknown; target: unknown };
  try {
    record = JSON.parse(line);
  } catch (e) {
    const preview = line.length > 80 ? line.slice(0, 80) + '...' : line;
    throw new Error(
      `parseJjBookmarkRecord: malformed NDJSON line: ${preview} (${(e as Error).message})`,
    );
  }
  // IN-02: type-shape validation — JSON.parse returns `any` and an
  // upstream contract drift like `{"name":null,"target":[...]}` would
  // otherwise propagate null through stripPrefix.startsWith (TypeError)
  // or into VcsBookmarkDivergentError.bookmarkName silently. Mirror the
  // T-03.02-01 "throw on contract drift" pattern used for JSON.parse
  // failures.
  if (typeof record.name !== 'string') {
    const preview = line.length > 80 ? line.slice(0, 80) + '...' : line;
    throw new Error(
      `parseJjBookmarkRecord: contract drift — record.name is not a string (got ${typeof record.name}): ${preview}`,
    );
  }
  const recordName: string = record.name;
  if (Array.isArray(record.target) && record.target.length > 1) {
    throw new VcsBookmarkDivergentError({
      bookmarkName: recordName,
      divergentTargets: record.target as readonly string[],
    });
  }
  const firstTarget =
    Array.isArray(record.target) && record.target.length > 0
      ? (record.target[0] as string)
      : '';
  return { name: stripPrefix(recordName), rev: firstTarget };
}
