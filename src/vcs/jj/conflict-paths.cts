/**
 * sdk/src/vcs/jj/conflict-paths.ts — Phase 9 (VCS-17, UPSTREAM-02)
 *
 * Extracted from `backends/jj.ts:524-557` (Phase 9 plan 02 task 1). The
 * original closure form lived inside the JjVcsAdapter factory; lifting it to
 * a pure sidecar function lets both `jj/reap.ts` (D-09/D-10/D-11 conflict
 * classifier branch) and the upcoming `jj/parallel.ts` (plan 03) consume the
 * helper without violating UPSTREAM-02 (no `from '../backends/jj'` imports
 * inside `sdk/src/vcs/jj/*`).
 *
 * Enumeration: `jj resolve --list -r <rev>` (sole form; jj has no template
 * mode for conflict listing). WR-04: returns `['<UNRESOLVABLE>']` when the
 * command fails or prints nothing — callers gate on the `conflicts()` revset
 * FIRST (see parallel.ts fan-in stage 1), so the sentinel only surfaces for
 * revs the revset already flagged as conflicted.
 *
 * VCS-audit follow-up 2026-07-08 (operator decision — remove unreachable
 * code): the historical `jj diff -r <rev> --summary` fallback is DELETED.
 * It was dormant on every probe since jj 0.41, and its `C `-line filter was
 * semantically wrong anyway — `C` in summary output means *copied*, not
 * conflicted, so had the branch ever fired it would have enumerated copies.
 *
 * UPSTREAM-02 sidecar discipline: this file does NOT import from
 * `backends/jj.ts`. The mandatory-flags prefix is inlined verbatim per the
 * `octopus.ts:39-47` / `reap.ts:33-41` template.
 */

import { vcsExec } from '../exec.cjs';

/**
 * Inline mandatory-flags prefix — copy of `backends/jj.ts::jjArgv`'s flag
 * portion. UPSTREAM-02: avoids the backends import.
 */
function jjArgvFlags(repo: string): string[] {
	return ['--repository', repo, '--no-pager', '--color', 'never', '--quiet'];
}

/**
 * Enumerate the conflicted-path list at a revision via
 * `jj resolve --list -r <rev>`.
 *
 * Line format (empirically verified, jj 0.42 — the path is NOT quoted and
 * may contain single spaces; the description column is padded with 2+
 * spaces for alignment):
 *
 *     con flict.txt    2-sided conflict
 *     plain.txt        2-sided conflict
 *
 * Path extraction strips the column-aligned `N-sided conflict…` description
 * by its known grammar. (The old `/^(\S+)/` extraction truncated spaced
 * paths at the first space — `con flict.txt` came back as `con`.) When a
 * line does not carry the description suffix, the whole trimmed line passes
 * through — format drift then surfaces as a bogus path at the downstream
 * verify gate instead of being silently mangled.
 *
 * WR-04: returns `['<UNRESOLVABLE>']` when the command fails or prints
 * nothing — callers gate on the `conflicts()` revset first, so an empty
 * enumeration on a revset-flagged rev surfaces drift rather than silently
 * passing `[]` to the verify gate.
 */
export function enumerateConflictedPaths(cwd: string, rev: string): string[] {
	const args = [...jjArgvFlags(cwd), 'resolve', '--list', '-r', rev];
	const r = vcsExec(cwd, 'jj', args);
	if (r.exitCode !== 0 || r.stdout.trim().length === 0) return ['<UNRESOLVABLE>'];
	return r.stdout
		.split('\n')
		.map((s) => s.trim())
		.filter(Boolean)
		.map((line) => line.replace(/\s{2,}\d+-sided conflict.*$/, ''));
}
