"use strict";
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
 *   {"name":"gsd/phase-3","target":["<change_id>"]}
 *   {"name":"gsd/divergent","target":["<a>","<b>"]}   // divergent
 *   {"name":"main","target":["<change_id>"]}         // raw / no-prefix bookmark
 *
 * Phase 8 D-05 unified contract: `Bookmark.rev` carries the active backend's
 * canonical revision identifier — `change_id` on jj. The parser accepts
 * string ids transparently, so the FLIP work is in the template-emission
 * caller (jj.ts `bookmark list` invocation) — verified to emit change_id
 * via the standard `json(self)` template per .planning/intel/jj-041-ndjson-probe.md.
 *
 * (RESEARCH §"jj bookmark list" — the `target` field is always an array;
 * length-1 is the steady-state, length>1 is the D-02 divergence signal.)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseJjBookmarkRecord = parseJjBookmarkRecord;
const types_cjs_1 = require("../types.cjs");
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
function parseJjBookmarkRecord(line, stripPrefix) {
    let record;
    try {
        record = JSON.parse(line);
    }
    catch (e) {
        const preview = line.length > 80 ? line.slice(0, 80) + '...' : line;
        throw new Error(`parseJjBookmarkRecord: malformed NDJSON line: ${preview} (${e.message})`);
    }
    // IN-02: type-shape validation — JSON.parse returns `any` and an
    // upstream contract drift like `{"name":null,"target":[...]}` would
    // otherwise propagate null through stripPrefix.startsWith (TypeError)
    // or into VcsBookmarkDivergentError.bookmarkName silently. Mirror the
    // T-03.02-01 "throw on contract drift" pattern used for JSON.parse
    // failures.
    if (typeof record.name !== 'string') {
        const preview = line.length > 80 ? line.slice(0, 80) + '...' : line;
        throw new Error(`parseJjBookmarkRecord: contract drift — record.name is not a string (got ${typeof record.name}): ${preview}`);
    }
    const recordName = record.name;
    // IN-03 (REVIEW.md): mirror the record.name contract-drift check above —
    // if record.target is not an array (string, null, number, object, etc.)
    // throw loudly rather than silently collapsing to rev: ''. The pinned
    // NDJSON shape (jj 0.41.0) ALWAYS emits target as an array; a non-array
    // value indicates either a tampered fixture or a future jj-version
    // template change, and either case should surface as a typed error at
    // the parser boundary instead of poisoning callers with empty-string
    // revs.
    if (!Array.isArray(record.target)) {
        const preview = line.length > 80 ? line.slice(0, 80) + '...' : line;
        throw new Error(`parseJjBookmarkRecord: contract drift — record.target is not an array (got ${typeof record.target}): ${preview}`);
    }
    if (record.target.length > 1) {
        throw new types_cjs_1.VcsBookmarkDivergentError({
            bookmarkName: recordName,
            divergentTargets: record.target,
        });
    }
    const firstTarget = record.target.length > 0 ? record.target[0] : '';
    return { name: stripPrefix(recordName), rev: firstTarget };
}
