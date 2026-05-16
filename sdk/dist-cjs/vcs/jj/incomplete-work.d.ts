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
import type { IncompleteWorkEntry } from '../types.js';
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
export declare function appendIncomplete(phaseDir: string, entry: IncompleteWorkEntry): void;
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
export declare function readIncomplete(phaseDir: string): IncompleteWorkEntry[];
/**
 * Test helper: clear the queue file (overwrite to empty). Production callers
 * do NOT use this — humans empty the queue by reviewing and deleting entries.
 * Exported for unit-test isolation between cases.
 */
export declare function __testOnlyClearIncomplete(phaseDir: string): void;
//# sourceMappingURL=incomplete-work.d.ts.map