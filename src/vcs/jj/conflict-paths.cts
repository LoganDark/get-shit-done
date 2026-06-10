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
 * Behavior preserved verbatim:
 *  - primary: `jj resolve --list -r <rev>` (jj 0.41 path)
 *  - fallback: `jj diff -r <rev> --summary` filtered for `C ` status
 *    (IN-04: `U` removed in 0.41 — never emitted on `diff --summary`)
 *  - WR-04: returns `['<UNRESOLVABLE>']` when neither form succeeds
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
 * Enumerate the conflicted-path list at a revision.
 *
 * Primary path: `jj resolve --list -r <rev>` — succeeds on every probe under
 * jj 0.41 in practice. Fallback path: `jj diff -r <rev> --summary` filtered
 * for the `C` status letter (IN-04: `U` removed — jj 0.41 never emits it on
 * `diff --summary`). WR-04: returns `['<UNRESOLVABLE>']` when `conflicts()`
 * flagged the rev but neither enumeration form yielded paths — surfaces
 * drift rather than silently passing `[]` to the downstream verify gate.
 */
export function enumerateConflictedPaths(cwd: string, rev: string): string[] {
	// Primary: jj resolve --list -r <rev>
	const primaryArgs = [...jjArgvFlags(cwd), 'resolve', '--list', '-r', rev];
	const primary = vcsExec(cwd, 'jj', primaryArgs);
	if (primary.exitCode === 0 && primary.stdout.trim().length > 0) {
		return primary.stdout
			.split('\n')
			.map((s) => s.trim())
			.filter(Boolean)
			.map((line) => {
				// Output: `<path>   <conflict description>` — extract path only.
				const m = /^(\S+)/.exec(line);
				return m ? m[1] : line;
			});
	}
	// Fallback: jj diff -r <rev> --summary, filter for the C status letter.
	// IN-04: `U` removed — jj 0.41 never emits it on `diff --summary`.
	const fallbackArgs = [...jjArgvFlags(cwd), 'diff', '-r', rev, '--summary'];
	const fallback = vcsExec(cwd, 'jj', fallbackArgs);
	if (fallback.exitCode !== 0) return ['<UNRESOLVABLE>'];
	const paths = fallback.stdout
		.split('\n')
		.filter(Boolean)
		.map((line) => {
			const m = /^C (.+)$/.exec(line);
			return m ? m[1] : '';
		})
		.filter(Boolean);
	// WR-04: conflicts() flagged this rev but no enumeration form yielded
	// anything — surface drift rather than silently passing [] to the verify gate.
	return paths.length > 0 ? paths : ['<UNRESOLVABLE>'];
}
