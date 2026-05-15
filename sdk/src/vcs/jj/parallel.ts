/**
 * sdk/src/vcs/jj/parallel.ts — Phase 9 (VCS-17, PARALLEL-01/02 jj-side)
 *
 * Composition layer over octopus.ts + reap.ts + jj-native N-parent merge.
 * UPSTREAM-02 sidecar: does NOT import from backends/jj.ts (that would
 * create a merge conflict on every upstream-rebase cycle).
 *
 * Pure functions; both return frozen JSON (D-05). dispatch composes
 * `octopus.createPhaseStructure` + N× `octopus.createSubagentSlot`, eagerly
 * creates per-subagent bookmarks (RESEARCH §"What's missing for Phase 9" (a)),
 * and writes the extended WAVE_WORKTREE_MANIFEST with `plan_id` + `backend`
 * (VCS-19). fanIn runs a single N-parent `jj new`, probes conflicts via the
 * UPSTREAM-02 conflict-paths sidecar, and on the clean path advances the
 * main bookmark + batched bookmark delete (PARALLEL-02 jj-side, D-08).
 *
 * On octopus in-tree conflict, fanIn appends an `IncompleteWorkEntry` with
 * `reason='merge-in-tree-conflict'` to the queue file at `handle.phaseRoot`
 * (W3 (a) joint-assertion producer for D-16). This complements reap.ts's
 * orthogonal classifier branch (which fires when a CRASHED agent's own head
 * is conflicted). Both producers emit the same reason literal; both are
 * valid; they queue under different `subagentName` / `changeIdShort` values.
 *
 * D-01/D-02 (carry): no jj write-lock / repo-lock acquisition — the
 * orchestrator awaits all `Agent()` resolutions before fanIn; the single
 * orchestrator process never contends with itself.
 *
 * D-12 (carry): `vcsExec` is the sole subprocess primitive; no raw
 * `child_process` calls are made from this file.
 *
 * D-13 (carry): squash-only commit model; never `--ignore-working-copy`. The
 * probes here are reads and don't need the flag.
 */

import { writeFileSync, mkdtempSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { vcsExec } from '../exec.js';
import { expr } from '../expr.js';
import type {
	RevisionExpr,
	ParallelDispatchOpts,
	ParallelDispatchHandle,
	ParallelAgentResult,
	FanInResult,
	IncompleteWorkEntry,
} from '../types.js';
import { createPhaseStructure, createSubagentSlot } from './octopus.js';
import { performJjReap } from './reap.js';
import { enumerateConflictedPaths } from './conflict-paths.js';
import { appendIncomplete } from './incomplete-work.js';

/**
 * Inline mandatory jj-flags prefix. UPSTREAM-02 sidecar discipline: this
 * file does NOT import from `backends/jj.ts`. Flag set matches
 * `backends/jj.ts::jjArgv`: --repository, --no-pager, --color never, --quiet.
 * Verbatim copy of `octopus.ts:39-47`.
 */
function jjArgvFlags(repo: string): string[] {
	return ['--repository', repo, '--no-pager', '--color', 'never', '--quiet'];
}

/**
 * Resolve the change_id of the change referenced by a revset, taking
 * exactly one row. Verbatim copy of `octopus.ts:49-66`.
 */
function resolveChangeId(mainRepoRoot: string, revset: string): string {
	const args = [
		...jjArgvFlags(mainRepoRoot),
		'log', '-r', revset, '-T', 'change_id ++ "\\n"', '--no-graph', '-n', '1',
	];
	const r = vcsExec(mainRepoRoot, 'jj', args);
	if (r.exitCode !== 0 || !r.stdout.trim()) {
		throw new Error(
			`parallel.resolveChangeId(${revset}) failed: ${r.stderr || r.stdout}`,
		);
	}
	return r.stdout.trim();
}

/**
 * W1: validate caller-supplied agentId against the worktree-safety.cjs:334
 * regex `/^worktree-agent-[A-Za-z0-9._/-]+$/`. The `branch` literal we emit
 * into the manifest is `worktree-agent-${agentId}`, so the agentId itself
 * must match `/^[A-Za-z0-9._/-]+$/` for the prefixed result to clear the
 * reader regex. agentIds containing whitespace or other characters outside
 * this class would silently drop at `normalizeCleanupManifestEntry` — losing
 * track of the workspace. Throwing BEFORE the manifest write makes the
 * caller fix their input rather than masking the drop.
 */
function validateAgentId(name: string): void {
	if (!/^[A-Za-z0-9._/-]+$/.test(name)) {
		throw new Error(
			`parallel.dispatch: agentId "${name}" violates worktree-safety manifest character class /^[A-Za-z0-9._/-]+$/ (see get-shit-done/bin/lib/worktree-safety.cjs:334)`,
		);
	}
}

/**
 * Inline refname validator — sidecar discipline prevents importing
 * `validateRefname` from `backends/jj.ts`. The agent-bookmark name shape is
 * locked at `gsd/phase-{NN}-subagent-{idx}` (two-digit phase, integer idx);
 * caller-supplied strings never reach this regex without first being
 * constructed from validated phase + idx pairs, but defense-in-depth keeps
 * the check here so any future caller drift fails loud.
 */
function validateAgentBookmarkName(name: string): void {
	if (!/^gsd\/phase-\d+-subagent-\d+$/.test(name)) {
		throw new Error(
			`parallel: agent-bookmark name "${name}" violates the gsd/phase-NN-subagent-N shape`,
		);
	}
}

/**
 * Inline main-bookmark refname validator — same UPSTREAM-02 reason as
 * `validateAgentBookmarkName`. Mirrors the safety floor of
 * `backends/jj.ts:validateRefname` callsite at :1184 without importing.
 */
function validateMainBookmark(name: string): void {
	// jj bookmark names accept `[A-Za-z0-9._/-]+` (the same character class
	// worktree-safety.cjs uses for the branch field). Refnames must be
	// non-empty and not start with a hyphen (defense against argv injection
	// even with `--` separator on the delete path).
	if (name.length === 0 || name.startsWith('-') || !/^[A-Za-z0-9._/-]+$/.test(name)) {
		throw new Error(
			`parallel: main bookmark name "${name}" is not a valid jj bookmark refname`,
		);
	}
}

/**
 * Derive the on-disk phase directory under `<mainRepoRoot>/.planning/phases/`
 * for a given phase number. Resolution order:
 *   1. exact-match prefix `{padded}-*` (slug-suffixed dir, the standard
 *      `.planning/phases/{NN}-{slug}/` layout);
 *   2. fallback to the padded-numeric dir name without slug.
 *
 * Returns an absolute path even when the dir does not exist (callers
 * `appendIncomplete` create the queue file lazily; `mkdir -p` is the
 * caller's responsibility if the parent doesn't exist).
 */
function derivePhaseRoot(mainRepoRoot: string, phaseNumber: number): string {
	const padded = String(phaseNumber).padStart(2, '0');
	const phasesParent = join(mainRepoRoot, '.planning', 'phases');
	if (existsSync(phasesParent)) {
		const match = readdirSync(phasesParent).find((d) => d === padded || d.startsWith(`${padded}-`));
		if (match) return join(phasesParent, match);
	}
	return join(phasesParent, padded);
}

/**
 * Phase 9 (VCS-16, PARALLEL-01 jj-side): dispatch — materialize N subagent
 * slots in the phase octopus structure, eagerly create per-subagent
 * bookmarks, and write the WAVE_WORKTREE_MANIFEST.
 *
 * The SDK-internal opts extend `ParallelDispatchOpts` with `mainRepoRoot`
 * (the main repo cwd) and `vcs` (a closure over the adapter's `workspace`
 * surface so `createSubagentSlot` can call `workspace.add(...)`). The
 * adapter wire-in at `backends/jj.ts` supplies both.
 */
export function performJjParallelDispatch(
	opts: ParallelDispatchOpts & {
		mainRepoRoot: string;
		vcs: {
			workspace: {
				add(input: { path: string; baseRef?: RevisionExpr; name?: string }): unknown;
			};
		};
	},
): ParallelDispatchHandle {
	const { mainRepoRoot, vcs, plan, phaseNumber, mainBookmark } = opts;

	// W1: validate every agentId BEFORE any side effect that depends on it.
	// `createPhaseStructure` is idempotent (marker bookmarks) so even if a
	// retry follows a validation failure, the next attempt won't double-create
	// the parent/merge slot.
	for (const item of plan) {
		validateAgentId(item.agentId);
	}

	// Validate main bookmark up-front so a late fanIn failure can't leak a
	// non-conformant name into the handle.
	validateMainBookmark(mainBookmark);

	const phaseTag = String(phaseNumber).padStart(2, '0');
	const phaseRoot = derivePhaseRoot(mainRepoRoot, phaseNumber);

	// 1. Lazy phase structure (parent + merge slot). Idempotent.
	const { parentChange, mergeChange } = createPhaseStructure(mainRepoRoot, '@-', phaseNumber);

	// 2. Dispatch loop: one subagent slot per plan item.
	const slots: {
		workspaceName: string;
		workspacePath: string;
		headChange: string;
		agentId: string;
		planId: string;
		idx: number;
	}[] = [];

	for (let i = 0; i < plan.length; i++) {
		const item = plan[i];
		const idx = i + 1;
		const slot = createSubagentSlot(mainRepoRoot, vcs, {
			parentChange,
			mergeChange,
			idx,
			phaseNum: phaseNumber,
			workspacePath: item.workspacePath,
		});
		slots.push({
			workspaceName: slot.workspaceName,
			workspacePath: slot.workspacePath,
			headChange: slot.headChange,
			agentId: item.agentId,
			planId: item.planId,
			idx,
		});
	}

	// 3. Eager agent-bookmark creation (RESEARCH §"What's missing for Phase 9" (a)).
	// One bookmark per subagent head, named `gsd/phase-{NN}-subagent-{idx}`.
	// The fanIn batched delete relies on these names being present so the
	// post-fanIn `surplusBookmarks` invariant (D-08) holds.
	for (const slot of slots) {
		const bookmarkName = `gsd/phase-${phaseTag}-subagent-${slot.idx}`;
		validateAgentBookmarkName(bookmarkName);
		// `-r <rev>` form per `octopus.ts:169` precedent. `--` separator before
		// the user-influenced bookmark-name positional defends against any
		// future drift in the name shape.
		const bmArgs = [
			...jjArgvFlags(mainRepoRoot),
			'bookmark', 'create', '-r', slot.headChange, '--', bookmarkName,
		];
		const bmRes = vcsExec(mainRepoRoot, 'jj', bmArgs);
		if (bmRes.exitCode !== 0) {
			throw new Error(
				`parallel.dispatch: bookmark create ${bookmarkName} failed: ${bmRes.stderr || bmRes.stdout}`,
			);
		}
	}

	// 4. WAVE_WORKTREE_MANIFEST writer (VCS-19). New fields: plan_id, backend.
	// Allocated under a fresh `mkdtemp` to avoid collisions with concurrent
	// orchestrator processes (and with the workflow-markdown writer that
	// collapses in Phase 11). Every agentId already passed `validateAgentId`
	// above, so the `worktree-agent-${agentId}` branch literal is guaranteed
	// to satisfy the worktree-safety.cjs:334 regex.
	const manifestDir = mkdtempSync(join(tmpdir(), 'gsd-wave-manifest-'));
	const manifestPath = join(manifestDir, 'wave-worktree-manifest.json');
	const manifestBody = {
		worktrees: slots.map((slot) => ({
			agent_id: slot.agentId,
			plan_id: slot.planId,
			backend: 'jj' as const,
			worktree_path: slot.workspacePath,
			branch: `worktree-agent-${slot.agentId}`,
			expected_base: slot.headChange,
			main_bookmark: mainBookmark,
		})),
	};
	writeFileSync(manifestPath, JSON.stringify(manifestBody, null, 2), 'utf-8');

	// 5. Frozen pure-JSON handle (D-05). Inner workspaces array + each entry
	// are also frozen. `baselineOpId` is included as `undefined` per D-01/D-06
	// forward-compat reservation (Plan 01 kept the field on the type).
	return Object.freeze({
		phaseRoot,
		phaseNumber,
		mainBookmark,
		manifest: manifestPath,
		workspaces: Object.freeze(
			slots.map((s) =>
				Object.freeze({
					name: s.workspaceName,
					path: s.workspacePath,
					baseRev: s.headChange,
					agentId: s.agentId,
					baselineOpId: undefined as string | undefined,
				}),
			),
		),
		// `parentChange` / `mergeChange` are intentionally NOT on the handle —
		// fanIn re-derives the merge change_id from `@` after the N-parent
		// `jj new`. The type contract at types.ts:493-518 fixes the field set.
	}) satisfies ParallelDispatchHandle;
}

/**
 * Phase 9 (VCS-16, PARALLEL-02 jj-side): fanIn — single N-parent `jj new`,
 * conflict probe, on-clean batched bookmark delete + main bookmark advance,
 * on-conflict W3 (a) `merge-in-tree-conflict` queue entry, and crashed-agent
 * reap via `performJjReap`.
 *
 * W3 (a) rationale (D-16 joint-assertion lock-in): when the N-parent
 * octopus produces an in-tree conflict on otherwise CLEAN agents, fanIn
 * itself appends a `merge-in-tree-conflict` queue entry for the MERGE HEAD
 * — so D-16's joint assertion (`conflicted: true` + `conflictedPaths`
 * populated + queue entry with `reason === 'merge-in-tree-conflict'`)
 * fires from a single coherent code path. reap.ts's orthogonal classifier
 * branch handles the CRASHED-agent case where the agent's own head is
 * conflicted; both producers emit the same reason literal but queue under
 * different `subagentName` / `changeIdShort` values.
 */
export function performJjParallelFanIn(
	mainRepoRoot: string,
	handle: ParallelDispatchHandle,
	results: readonly ParallelAgentResult[],
): FanInResult {
	const phaseTag = String(handle.phaseNumber).padStart(2, '0');

	// 1. N-parent jj new at @: `-r @ -r <ws1>.baseRev -r <ws2>.baseRev ...`.
	// Lift the 2-parent precedent at backends/jj.ts:1180-1188 to N parents.
	// NOTE: per D-14 carry, baseRev is rebase-stable; we feed it raw to
	// `-r` because vcsExec accepts string argv and `jj` resolves change_ids
	// from the k-z alphabet natively.
	const newArgs: string[] = [...jjArgvFlags(mainRepoRoot), 'new', '-r', '@'];
	for (const ws of handle.workspaces) {
		newArgs.push('-r', ws.baseRev);
	}
	newArgs.push(
		'-m',
		`phase ${phaseTag} merge: ${handle.workspaces.length} parents`,
	);
	const newRes = vcsExec(mainRepoRoot, 'jj', newArgs);
	if (newRes.exitCode !== 0) {
		throw new Error(
			`parallel.fanIn: N-parent jj new failed (N=${handle.workspaces.length}): ${newRes.stderr || newRes.stdout}`,
		);
	}

	// 2. Resolve the new merge change_id at `@`.
	const mergeChangeId = resolveChangeId(mainRepoRoot, '@');

	// 3. Probe conflicts via the UPSTREAM-02 sidecar. The probe runs from
	// `mainRepoRoot` (no `--ignore-working-copy` — D-13 carry; this is a
	// read, not a write).
	const conflictedPaths = enumerateConflictedPaths(mainRepoRoot, mergeChangeId);
	const conflicted = conflictedPaths.length > 0;

	let incompleteQueued = 0;
	const merged: string[] = [];
	let surplusBookmarks: string[] = [];
	const failedReaped: string[] = [];

	if (conflicted) {
		// W3 (a): enqueue a merge-in-tree-conflict entry for the merge HEAD.
		// The on-disk dir + workspace tracking for each agent are LEFT intact
		// (no bookmark delete, no main-bookmark advance) so the user can
		// inspect the conflicted state before resolving or discarding.
		const mergeEntry: IncompleteWorkEntry = {
			subagentName: `phase-${phaseTag}-merge`,
			changeIdShort: mergeChangeId.slice(0, 12),
			workspacePath: handle.phaseRoot,
			reason: 'merge-in-tree-conflict',
		};
		appendIncomplete(handle.phaseRoot, mergeEntry);
		incompleteQueued += 1;

		// D-08: on the conflicted path no batched delete was attempted, so
		// `surplusBookmarks` is by definition empty — the field reports
		// unexpected leftovers from a delete-attempt, not all-bookmarks-alive.
		surplusBookmarks = [];
	} else {
		// Clean path: advance the main bookmark to the merge head, then
		// batched-delete every agent bookmark in one `jj bookmark delete --`
		// invocation (PARALLEL-02 jj-side).
		validateMainBookmark(handle.mainBookmark);
		const setArgs = [
			...jjArgvFlags(mainRepoRoot),
			'bookmark', 'set', handle.mainBookmark, '-r', '@',
		];
		const setRes = vcsExec(mainRepoRoot, 'jj', setArgs);
		if (setRes.exitCode !== 0) {
			throw new Error(
				`parallel.fanIn: main-bookmark advance (${handle.mainBookmark}) failed: ${setRes.stderr || setRes.stdout}`,
			);
		}

		// Derive agent-bookmark names from the workspace idx pattern. The
		// dispatch contract guarantees workspaces are indexed 1..N in order;
		// the bookmark name shape is `gsd/phase-{NN}-subagent-{idx}` per the
		// dispatch loop above. Validate every name before the delete to
		// preserve defense-in-depth against any future drift in dispatch.
		const agentBookmarkNames: string[] = [];
		for (let i = 0; i < handle.workspaces.length; i++) {
			const name = `gsd/phase-${phaseTag}-subagent-${i + 1}`;
			validateAgentBookmarkName(name);
			agentBookmarkNames.push(name);
		}
		const delArgs = [
			...jjArgvFlags(mainRepoRoot),
			'bookmark', 'delete', '--', ...agentBookmarkNames,
		];
		const delRes = vcsExec(mainRepoRoot, 'jj', delArgs);
		if (delRes.exitCode !== 0) {
			throw new Error(
				`parallel.fanIn: batched bookmark delete failed (N=${agentBookmarkNames.length}): ${delRes.stderr || delRes.stdout}`,
			);
		}

		merged.push(mergeChangeId);

		// D-08 invariant: re-list the gsd/phase-{NN}-subagent-* bookmark set
		// post-delete; on the clean path the result MUST be empty. Surfacing
		// any leftover is the cross-backend contract handed to plan 05.
		const listArgs = [
			...jjArgvFlags(mainRepoRoot),
			'bookmark', 'list', '-T', 'name ++ "\n"', '--no-graph',
		];
		const listRes = vcsExec(mainRepoRoot, 'jj', listArgs);
		if (listRes.exitCode !== 0) {
			throw new Error(
				`parallel.fanIn: bookmark list post-delete failed: ${listRes.stderr || listRes.stdout}`,
			);
		}
		const prefix = `gsd/phase-${phaseTag}-subagent-`;
		surplusBookmarks = listRes.stdout
			.split('\n')
			.map((s) => s.trim())
			.filter((s) => s.length > 0 && s.startsWith(prefix));
	}

	// 4. Reap crashed agents — those with exitCode !== 0 in the results array.
	// Build the entries[] payload from handle.workspaces (the dispatch-side
	// metadata is the source of truth for the on-disk path + head change_id).
	const crashed = results.filter((r) => r.exitCode !== 0);
	if (crashed.length > 0) {
		const crashedAgentIds = new Set(crashed.map((r) => r.agentId));
		const reapEntries = handle.workspaces
			.filter((ws) => crashedAgentIds.has(ws.agentId))
			.map((ws) => ({
				name: ws.name,
				headChange: ws.baseRev,
				path: ws.path,
			}));
		const reapResult = performJjReap({
			mainRepoRoot,
			phaseNamePrefix: `phase-${phaseTag}`,
			phaseDir: handle.phaseRoot,
			entries: reapEntries,
		});
		for (const a of reapResult.abandoned) {
			failedReaped.push(a.name);
		}
		incompleteQueued += reapResult.incomplete.length;
	}

	return Object.freeze({
		merged: Object.freeze(merged.slice()) as readonly string[],
		conflicted,
		conflictedPaths: Object.freeze(conflictedPaths.slice()) as readonly string[],
		incompleteQueued,
		failedReaped: Object.freeze(failedReaped.slice()) as readonly string[],
		surplusBookmarks: Object.freeze(surplusBookmarks.slice()) as readonly string[],
	}) satisfies FanInResult;
}
