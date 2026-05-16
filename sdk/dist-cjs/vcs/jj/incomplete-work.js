"use strict";
/**
 * sdk/src/vcs/jj/incomplete-work.ts — Phase 4 plan 04 (D-13 / D-14 / D-06)
 *
 * Crash queue file format. JSONL (one JSON object per line), append-only.
 * Path: .planning/phases/{N}/incomplete-work.md
 * Entry shape (per D-13):
 *   `{"subagentName":"...","changeIdShort":"...","workspacePath":"...","reason":"..."}`
 *
 * Phase 9 CR-01 fix: format switched from a delimiter-based markdown line
 * (`- name: head=..., workspace=..., reason=...`) to JSONL because the old
 * writer accepted `workspacePath` / `subagentName` strings containing the
 * `,` / `:` delimiters, while the reader's `[^:]+` / `[^,]+` regex did not —
 * silent round-trip corruption at the persistence boundary the D-14
 * phase-merge gate relies on for fail-safe blocking. JSONL is structurally
 * unambiguous and matches the `parseJjLog` / `parseJjWorkspaceList`
 * convention already used elsewhere in the sidecar.
 *
 * D-06: change_id native from day 1 — no SHA-style id is encoded; entries
 * carry change_id_short only. The Phase 3 D-19 format-migration tracker
 * extends with this file in the Phase 4 D-06 entry.
 *
 * D-14: vcs.commit() phase-merge path reads this file via readIncomplete() and
 * throws VcsIncompleteSubagentsError when the entries array is non-empty.
 *
 * The parser is analogous to parseJjWorkspaceList (PATTERNS.md): line-delimited,
 * malformed lines surface via typed error rather than silent skip.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.appendIncomplete = appendIncomplete;
exports.readIncomplete = readIncomplete;
exports.__testOnlyClearIncomplete = __testOnlyClearIncomplete;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const QUEUE_FILENAME = 'incomplete-work.md';
/**
 * Phase 9 D-09: closed-union allowlist for `IncompleteWorkEntry.reason`.
 * Mirrors the union declared in `types.ts:242-247`. Kept as a module-level
 * `Set` for O(1) lookup in `readIncomplete`'s hot path; `as const` on the
 * literal array would also work but Set carries the semantic intent better
 * (membership test, not ordering).
 *
 * Adding a new reason: extend the union in `types.ts` AND add the literal
 * here. The TypeScript checker enforces both halves stay in sync — adding
 * a member here that isn't in the union triggers TS2322; adding a member
 * to the union without updating this set silently shrinks `KNOWN_REASONS`
 * (acceptable: the parser then rejects the new value until this set is
 * widened — fail-loud is the intended posture).
 */
const KNOWN_REASONS = new Set([
    'crashed-with-uncommitted-work',
    'merge-in-tree-conflict',
]);
function queuePath(phaseDir) {
    return (0, node_path_1.join)(phaseDir, QUEUE_FILENAME);
}
/**
 * Append a crash-recovery entry to the queue file. Creates the file when
 * absent (appendFileSync creates with mode 0o666 modulo umask). Callers may
 * dedup by reading the file first; this function does not check for
 * duplicates.
 *
 * Phase 9 CR-02 fix: `mkdirSync(dirname(p), { recursive: true })` runs BEFORE
 * `appendFileSync` so callers (notably `performJjParallelFanIn`'s W3 (a)
 * producer at `parallel.ts:424`) cannot crash with `ENOENT` when
 * `derivePhaseRoot` returns the padded-numeric fallback dir for a phase that
 * has not yet been materialized on disk. Idempotent; covers `reap.ts:230`
 * at the same boundary.
 */
function appendIncomplete(phaseDir, entry) {
    // Phase 9 CR-01 fix: JSONL writer. JSON.stringify escapes embedded `,` /
    // `:` / `"` / newlines in any field, eliminating the round-trip corruption
    // the regex-based reader would silently absorb. Trailing `\n` so
    // append-then-append produces one valid JSONL object per line.
    const line = JSON.stringify({
        subagentName: entry.subagentName,
        changeIdShort: entry.changeIdShort,
        workspacePath: entry.workspacePath,
        reason: entry.reason,
    }) + '\n';
    const p = queuePath(phaseDir);
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(p), { recursive: true });
    (0, node_fs_1.appendFileSync)(p, line);
}
/**
 * Parse the queue file into structured entries.
 * Returns [] if the file is absent or empty.
 *
 * Line format (post-CR-01): one JSON object per line
 *   `{"subagentName":"...","changeIdShort":"...","workspacePath":"...","reason":"..."}`
 * Comments (lines starting with `#`) and blank lines are ignored — humans
 * empty the file by deleting entries, possibly preserving a header comment.
 *
 * Malformed entry lines (not blank, not comment, JSON.parse throws OR
 * required field missing) surface as a typed Error per the parseJjWorkspaceList
 * convention (T-04.04-04 mitigate).
 */
function readIncomplete(phaseDir) {
    const p = queuePath(phaseDir);
    if (!(0, node_fs_1.existsSync)(p))
        return [];
    const raw = (0, node_fs_1.readFileSync)(p, 'utf-8');
    const lines = raw.split('\n');
    const entries = [];
    for (const line of lines) {
        if (!line.trim())
            continue;
        if (line.trimStart().startsWith('#'))
            continue;
        // Phase 9 CR-01 fix: JSON.parse each non-blank, non-`#` line. The
        // writer at appendIncomplete emits exactly one JSON object per line
        // via JSON.stringify, which escapes embedded delimiter bytes so the
        // regex-based round-trip corruption defect is structurally
        // impossible to reproduce.
        let parsed;
        try {
            parsed = JSON.parse(line);
        }
        catch (err) {
            throw new Error(`incomplete-work.md: malformed entry in ${p}: ${line.slice(0, 120)} (${err.message})`);
        }
        if (!parsed
            || typeof parsed !== 'object'
            || typeof parsed.subagentName !== 'string'
            || typeof parsed.changeIdShort !== 'string'
            || typeof parsed.workspacePath !== 'string'
            || typeof parsed.reason !== 'string') {
            throw new Error(`incomplete-work.md: malformed entry in ${p}: ${line.slice(0, 120)}`);
        }
        const rec = parsed;
        // Phase 9 plan 02 task 3 (D-09): parse-time reason validation against
        // the closed 2-value union landed in types.ts. Unknown values fail
        // loudly here rather than silently propagating to the D-14 phase-merge
        // gate at backends/jj.ts:182-194 (which treats unknown reasons as
        // fail-safe block but offers no useful diagnostic). The cast
        // `as IncompleteWorkEntry['reason']` resolves cleanly against the
        // closed union — a free-form `string` would be rejected by tsc.
        if (!KNOWN_REASONS.has(rec.reason)) {
            throw new Error(`incomplete-work.md: unknown reason "${rec.reason}" in ${p}: ${line.slice(0, 120)}`);
        }
        entries.push({
            subagentName: rec.subagentName,
            changeIdShort: rec.changeIdShort,
            workspacePath: rec.workspacePath,
            reason: rec.reason,
        });
    }
    return entries;
}
/**
 * Test helper: clear the queue file (overwrite to empty). Production callers
 * do NOT use this — humans empty the queue by reviewing and deleting entries.
 * Exported for unit-test isolation between cases.
 */
function __testOnlyClearIncomplete(phaseDir) {
    const p = queuePath(phaseDir);
    if ((0, node_fs_1.existsSync)(p)) {
        (0, node_fs_1.writeFileSync)(p, '', 'utf-8');
    }
}
//# sourceMappingURL=incomplete-work.js.map