/**
 * sdk/src/vcs/jj/reap.ts — Phase 4 plan 04 (WS-11, WS-12, D-12 corrected)
 *
 * workspace.reap implementation. UPSTREAM-02 sidecar for the zero-conflict
 * upstream-rebase surface.
 *
 * Flow per RESEARCH §"Architecture Patterns > System Architecture Diagram":
 *  1. Inventory: list workspaces, filter by phaseNamePrefix (D-04 / #2774 pattern).
 *  2. Probe: for each, run empty-tree check via
 *       `jj diff --from <parent_change> --to <head_change> -s`
 *     from MAIN repo root (D-15 / Pitfall 1 — never from inside the subagent ws).
 *  3. Empty → abandon + forget + rm-rf (Pitfall 3: forget does NOT rm).
 *  4. Non-empty → crash recovery: squash as 'subagent N: incomplete work' (-k)
 *     and append to incomplete-work.md queue (D-13). Workspace + on-disk dir
 *     LEFT in place for human review.
 *
 * CORRECTED probe form per RESEARCH Pitfall 2:
 *   CONTEXT D-12's original sketch combined `-r <head>` with `--from <parent>`,
 *   which jj 0.41 rejects (mutually exclusive on the diff subcommand). The
 *   correct form is `jj diff --from <parent> --to <head> -s`.
 *
 * D-15 / Pitfall 1: every vcsExec invocation here passes `opts.mainRepoRoot`
 * as cwd; the workspace identifier is encoded into argv via `--repository`
 * (jjArgvFlags). This guarantees the probe NEVER runs from inside a subagent
 * workspace (which would trigger jj's auto-snapshot on the wrong target).
 */

import { rmSync, existsSync } from 'node:fs';
import { vcsExec } from '../exec.js';
import type { ReapResult, IncompleteWorkEntry } from '../types.js';
import { appendIncomplete } from './incomplete-work.js';

/**
 * Inline mandatory-flags prefix. UPSTREAM-02 sidecar discipline: this file does
 * NOT import from `backends/jj.ts` (would cause an upstream-rebase merge
 * conflict every cycle). The flag set matches `backends/jj.ts::jjArgv` —
 * `--repository`, `--no-pager`, `--color never`, `--quiet`.
 */
function jjArgvFlags(repoRoot: string): string[] {
	return ['--repository', repoRoot, '--no-pager', '--color', 'never', '--quiet'];
}

/**
 * CORRECTED FORM per RESEARCH Pitfall 2.
 *
 * Probe whether `headChange`'s tree differs from its `parentChange` parent.
 * Returns `true` when the diff is empty (the head carries no real work and is
 * safe to abandon). The `-s` flag emits one summary line per changed path;
 * empty stdout = empty diff.
 *
 * Runs from `mainRepoRoot` (D-15 / Pitfall 1). NEVER runs from inside the
 * subagent workspace — auto-snapshot would corrupt the probe target.
 */
function isEmptyHead(
	mainRepoRoot: string,
	parentChange: string,
	headChange: string,
): boolean {
	const args = [
		...jjArgvFlags(mainRepoRoot),
		'diff', '--from', parentChange, '--to', headChange, '-s',
	];
	const r = vcsExec(mainRepoRoot, 'jj', args);
	if (r.exitCode !== 0) {
		throw new Error(
			`reap: empty-tree probe failed (from=${parentChange} to=${headChange}): ${r.stderr || r.stdout}`,
		);
	}
	return r.stdout.trim().length === 0;
}

/**
 * Resolve a workspace head's parent change_id (the `@-` relative to the
 * supplied head). Runs `jj log -r '<head>-' -T change_id --no-graph -n 1`
 * from the main repo root.
 */
function parentOf(mainRepoRoot: string, headChange: string): string {
	const args = [
		...jjArgvFlags(mainRepoRoot),
		'log', '-r', `${headChange}-`, '-T', 'change_id', '--no-graph', '-n', '1',
	];
	const r = vcsExec(mainRepoRoot, 'jj', args);
	if (r.exitCode !== 0 || !r.stdout.trim()) {
		throw new Error(`reap: parentOf(${headChange}) failed: ${r.stderr || r.stdout}`);
	}
	return r.stdout.trim();
}

interface WorkspaceEntry {
	/** workspace name (jj uses this as the canonical key) */
	name: string;
	/** workspace's @ change_id */
	headChange: string;
	/** on-disk path */
	path: string;
}

export interface PerformJjReapOpts {
	mainRepoRoot: string;
	/** Inclusion filter for workspace names (D-04 / #2774 pattern). E.g. 'phase-04-subagent-'. */
	phaseNamePrefix: string;
	/** Phase dir for incomplete-work.md queue file (D-13). */
	phaseDir: string;
	/**
	 * Resolved workspace entries: name, @ change_id, on-disk path.
	 * Caller (jj.ts workspace.reap wrapper) builds this from workspace.list()
	 * filtered by phaseNamePrefix, then resolves paths from a workspace-name →
	 * path map (orchestrator-tier owns this mapping per D-03).
	 *
	 * Decoupling the entries from the orchestrator-tier path resolution lets
	 * the test suite seed entries directly. The jj.ts wrapper uses
	 * `workspace.list()` to populate.
	 */
	entries: readonly WorkspaceEntry[];
}

export function performJjReap(opts: PerformJjReapOpts): ReapResult {
	const abandoned: { name: string; changeId: string; path: string }[] = [];
	const incomplete: IncompleteWorkEntry[] = [];

	for (const entry of opts.entries) {
		if (!entry.name.startsWith(opts.phaseNamePrefix)) {
			// inclusion-filter (D-04 / #2774): workspaces NOT matching the
			// prefix are ignored. Note this is INCLUSION (skip if no match),
			// not exclusion (skip if matches a blocklist).
			continue;
		}
		const parent = parentOf(opts.mainRepoRoot, entry.headChange);
		const empty = isEmptyHead(opts.mainRepoRoot, parent, entry.headChange);

		if (empty) {
			// Abandon path: empty head → abandon + forget + rm.
			const abandonArgs = [
				...jjArgvFlags(opts.mainRepoRoot),
				'abandon', entry.headChange,
			];
			const abandonRes = vcsExec(opts.mainRepoRoot, 'jj', abandonArgs);
			if (abandonRes.exitCode !== 0) {
				throw new Error(
					`reap: jj abandon ${entry.headChange} failed: ${abandonRes.stderr || abandonRes.stdout}`,
				);
			}
			const forgetArgs = [
				...jjArgvFlags(opts.mainRepoRoot),
				'workspace', 'forget', '--', entry.name,
			];
			const forgetRes = vcsExec(opts.mainRepoRoot, 'jj', forgetArgs);
			if (forgetRes.exitCode !== 0) {
				throw new Error(
					`reap: jj workspace forget ${entry.name} failed: ${forgetRes.stderr || forgetRes.stdout}`,
				);
			}
			// Pitfall 3: jj workspace forget does NOT remove the on-disk dir.
			// reap rm's it here for the empty-head case so the orchestrator
			// observes a clean tree.
			if (existsSync(entry.path)) {
				rmSync(entry.path, { recursive: true, force: true });
			}
			abandoned.push({ name: entry.name, changeId: entry.headChange, path: entry.path });
		} else {
			// Crash-recovery path (D-12): head has real work. Squash as
			// 'subagent N: incomplete work' preserving change_id (-k) so the
			// queue entry's reachability survives. Subagent index extracted
			// from the workspace name (`phase-{N}-subagent-{idx}`).
			const idxMatch = /-subagent-(\d+)/.exec(entry.name);
			const idx = idxMatch ? idxMatch[1] : '?';
			const message = `subagent ${idx}: incomplete work`;
			// Mirror SQUASH-01's argv shape from backends/jj.ts but with `-r`
			// instead of `-B` since we are squashing a specific revision, not
			// inserting before @. Verified on jj 0.41 during plan execution:
			// `jj squash -r <change> -k -m '<msg>'` lands a new change with
			// the supplied message and preserves <change>'s change_id.
			const squashArgs = [
				...jjArgvFlags(opts.mainRepoRoot),
				'squash', '-r', entry.headChange, '-k', '-m', message,
			];
			const squashRes = vcsExec(opts.mainRepoRoot, 'jj', squashArgs);
			if (squashRes.exitCode !== 0) {
				throw new Error(
					`reap: crash-recovery squash for ${entry.name} failed: ${squashRes.stderr || squashRes.stdout}`,
				);
			}
			const queueEntry: IncompleteWorkEntry = {
				subagentName: entry.name,
				changeIdShort: entry.headChange.slice(0, 8),
				workspacePath: entry.path,
				reason: 'crashed-with-uncommitted-work',
			};
			appendIncomplete(opts.phaseDir, queueEntry);
			incomplete.push(queueEntry);
			// Pitfall 3 inverse: for crash recovery we LEAVE the dir + workspace
			// tracking intact (D-13) so the human reviewer can inspect the
			// preserved subagent state before deleting the queue entry.
		}
	}

	return { abandoned, incomplete };
}
