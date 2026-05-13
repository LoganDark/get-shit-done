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
		entries.push({
			subagentName: m[1].trim(),
			changeIdShort: m[2].trim(),
			workspacePath: m[3].trim(),
			reason: m[4].trim(),
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
