/**
 * sdk/src/vcs/jj/incomplete-work.ts — Phase 4 plan 04 (D-13 / D-14 / D-06)
 *
 * Crash queue file format. Markdown, append-only.
 * Path: .planning/phases/{N}/incomplete-work.md
 * Entry shape (per D-13):
 *   `- {subagentName}: head={change_id_short}, workspace={path}, reason={reason}`
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

import { appendFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { IncompleteWorkEntry } from '../types.js';

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
const KNOWN_REASONS = new Set<IncompleteWorkEntry['reason']>([
	'crashed-with-uncommitted-work',
	'merge-in-tree-conflict',
]);

function queuePath(phaseDir: string): string {
	return join(phaseDir, QUEUE_FILENAME);
}

/**
 * Append a crash-recovery entry to the queue file. Creates the file when
 * absent (appendFileSync creates with mode 0o666 modulo umask). Callers may
 * dedup by reading the file first; this function does not check for
 * duplicates.
 */
export function appendIncomplete(phaseDir: string, entry: IncompleteWorkEntry): void {
	const line = `- ${entry.subagentName}: head=${entry.changeIdShort}, workspace=${entry.workspacePath}, reason=${entry.reason}\n`;
	appendFileSync(queuePath(phaseDir), line);
}

/**
 * Parse the queue file into structured entries.
 * Returns [] if the file is absent or empty.
 *
 * Line format: `- {subagentName}: head={change_id_short}, workspace={path}, reason={reason}`
 * Comments (lines starting with `#`) and blank lines are ignored — humans
 * empty the file by deleting entries, possibly preserving a header comment.
 *
 * Malformed entry lines (not blank, not comment, regex non-match) surface as
 * a typed Error per the parseJjWorkspaceList convention (T-04.04-04 mitigate).
 */
export function readIncomplete(phaseDir: string): IncompleteWorkEntry[] {
	const p = queuePath(phaseDir);
	if (!existsSync(p)) return [];
	const raw = readFileSync(p, 'utf-8');
	const lines = raw.split('\n');
	const entries: IncompleteWorkEntry[] = [];
	// Single-line parse regex; tolerant of leading whitespace.
	const ENTRY_RE = /^\s*-\s+([^:]+):\s+head=([^,]+),\s+workspace=([^,]+),\s+reason=(.*)$/;
	for (const line of lines) {
		if (!line.trim()) continue;
		if (line.trimStart().startsWith('#')) continue;
		const m = ENTRY_RE.exec(line);
		if (!m) {
			// Malformed line — surface via typed error rather than silent skip.
			throw new Error(
				`incomplete-work.md: malformed entry in ${p}: ${line.slice(0, 120)}`,
			);
		}
		// Phase 9 plan 02 task 3 (D-09): parse-time reason validation against
		// the closed 2-value union landed in types.ts. Unknown values fail
		// loudly here rather than silently propagating to the D-14 phase-merge
		// gate at backends/jj.ts:182-194 (which treats unknown reasons as
		// fail-safe block but offers no useful diagnostic). The cast
		// `as IncompleteWorkEntry['reason']` resolves cleanly against the
		// closed union — a free-form `string` would be rejected by tsc.
		const reasonRaw = m[4].trim();
		if (!KNOWN_REASONS.has(reasonRaw as IncompleteWorkEntry['reason'])) {
			throw new Error(
				`incomplete-work.md: unknown reason "${reasonRaw}" in ${p}: ${line.slice(0, 120)}`,
			);
		}
		entries.push({
			subagentName: m[1].trim(),
			changeIdShort: m[2].trim(),
			workspacePath: m[3].trim(),
			reason: reasonRaw as IncompleteWorkEntry['reason'],
		});
	}
	return entries;
}

/**
 * Test helper: clear the queue file (overwrite to empty). Production callers
 * do NOT use this — humans empty the queue by reviewing and deleting entries.
 * Exported for unit-test isolation between cases.
 */
export function __testOnlyClearIncomplete(phaseDir: string): void {
	const p = queuePath(phaseDir);
	if (existsSync(p)) {
		writeFileSync(p, '', 'utf-8');
	}
}
