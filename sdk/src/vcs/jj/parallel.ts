/**
 * sdk/src/vcs/jj/parallel.ts — Phase 9 (VCS-17, PARALLEL-01/02 jj-side)
 *
 * Composition layer over octopus.ts + reap.ts + jj-native N-parent merge.
 * UPSTREAM-02 sidecar: does NOT import from backends/jj.ts (that would
 * create a merge conflict on every upstream-rebase cycle).
 *
 * Pure functions; both return frozen JSON (D-05). dispatch composes
 * `octopus.createPhaseStructure` + N× `octopus.createSubagentSlot`. fanIn
 * runs a single N-parent `jj new`, probes conflicts via the UPSTREAM-02
 * conflict-paths sidecar, and on the clean path advances the main bookmark
 * (PARALLEL-02 jj-side).
 *
 * Phase 11 D-01: no manifest sidecar on disk; `handle.manifest` is the empty
 * string. The Handle is the orchestrator's full state — only persistent
 * state is workspaces / bookmarks / HEADs themselves. Mirrors the parity
 * target at `get-shit-done/bin/lib/worktree-safety.cjs::reconstructHandleFromLegacyPlan`
 * which sets `manifest: ''` the same way.
 *
 * Phase 11 D-02 (cross-phase amendment): the eager per-subagent bookmark
 * create loop in dispatch and the matching batched bookmark delete + surplus
 * sweep in fanIn retired. The octopus structure already references each
 * slot's head as a parent of the phase-merge change (N-parent `jj new`
 * below), so the `gsd/phase-{NN}-subagent-{idx}` bookmarks were redundant
 * scaffolding. `FanInResult.surplusBookmarks` stays on the type contract
 * but is trivially `[]` on the clean branch by construction. Git side keeps
 * `worktree-agent-*` branches — load-bearing backend asymmetry; git
 * worktrees can't track anonymous heads ergonomically.
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

import { existsSync, readdirSync } from 'node:fs';
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
import { parseJjWorkspaceList } from '../parse/jj-workspace-list.js';

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
 * Inline main-bookmark refname validator. Mirrors the safety floor of
 * `backends/jj.ts:validateRefname` callsite at :1184 without importing
 * (UPSTREAM-02 sidecar discipline). The agent-bookmark validator that used
 * to live alongside this one retired in Phase 11 (D-02) along with the
 * eager per-subagent bookmark creation loop in `performJjParallelDispatch`.
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
export function derivePhaseRoot(mainRepoRoot: string, phaseNumber: number): string {
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
 * slots in the phase octopus structure.
 *
 * Phase 11 D-01/D-02: no manifest sidecar on disk; no per-subagent bookmark
 * creation. The returned Handle is the orchestrator's full state — only
 * persistent state is workspaces / bookmarks / HEADs themselves.
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

	// Phase 11 D-02 (cross-phase amendment): eager agent-bookmark creation
	// retired. The octopus structure built by `createPhaseStructure` +
	// `createSubagentSlot` already references each slot's head as a parent of
	// the phase-merge change (see N-parent `jj new` in `performJjParallelFanIn`
	// below) — bookmarks were redundant scaffolding. On jj this scaffolding now
	// goes; on git the `worktree-agent-*` branches stay (load-bearing backend
	// asymmetry — git worktrees can't track anonymous heads ergonomically).

	// Phase 11 D-01: no manifest sidecar on disk. The previous VCS-19 manifest
	// writer is retired — only persistent state is workspaces / bookmarks /
	// HEADs themselves. `handle.manifest` is the empty string to mirror
	// `bin/lib/worktree-safety.cjs::reconstructHandleFromLegacyPlan` (which has
	// always set it to the empty string). Fan-in discovers the workspace set
	// from the Handle's frozen workspaces[] array — see `performJjParallelFanIn`
	// below.

	// 5. Frozen pure-JSON handle (D-05). Inner workspaces array + each entry
	// are also frozen. `baselineOpId` is included as `undefined` per D-01/D-06
	// forward-compat reservation (Plan 01 kept the field on the type).
	return Object.freeze({
		phaseRoot,
		phaseNumber,
		mainBookmark,
		manifest: '', // D-01: no orchestrator-managed sidecar state (parity with bin/lib/worktree-safety.cjs:reconstructHandleFromLegacyPlan)
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
 * conflict probe, on-clean main-bookmark advance, on-conflict W3 (a)
 * `merge-in-tree-conflict` queue entry, and crashed-agent reap via
 * `performJjReap`. (Phase 11 D-02: per-subagent bookmark delete retired
 * along with the matching create loop in dispatch.)
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

	// Pre-step: re-resolve each workspace's CURRENT head from `jj workspace
	// list -T 'json(self) ++ "\n"'`. The handle's `ws.baseRev` is the
	// dispatch-time SLOT head — empty by construction. Agents land their
	// work AFTER dispatch (typical `jj squash -B @ -k -m "..."` moves the WC
	// diff into a NEW change between `@-` and `@`); the slot head never
	// advances. Feeding `baseRev` raw to the N-parent `jj new` would merge
	// empty slot heads, silently dropping every agent's work and making the
	// merge change indistinguishable from the dispatch-time scaffold.
	//
	// Bug-fix rationale (plan 09.05 Rule 1): the production-code merge target
	// must be the workspace's current `@` (which is the agent's working-copy
	// head; for `-B @` flows this is the empty WC placeholder above the
	// work change, but the work change itself is still reachable from this
	// `@` via `@-` and therefore included in the merge tree). Mirrors the
	// same `workspace.list()` re-resolution that `backends/jj.ts:1115-1135`
	// (`workspace.reap`) performs for the same reason.
	const wsListArgs = [
		...jjArgvFlags(mainRepoRoot),
		'workspace', 'list', '-T', 'json(self) ++ "\\n"',
	];
	const wsListRes = vcsExec(mainRepoRoot, 'jj', wsListArgs);
	if (wsListRes.exitCode !== 0) {
		throw new Error(
			`parallel.fanIn: workspace list (pre-merge head re-resolution) failed: ${wsListRes.stderr || wsListRes.stdout}`,
		);
	}
	const currentHeads = new Map<string, string>();
	for (const entry of parseJjWorkspaceList(wsListRes.stdout)) {
		currentHeads.set(entry.path, entry.rev);
	}
	const mergeParents: string[] = [];
	for (const ws of handle.workspaces) {
		// Re-resolved current `@` of the workspace; fall back to the stale
		// `baseRev` if the workspace dropped out of `jj workspace list`
		// (defensive — keeps the argv list well-formed). For a clean
		// `-B @` flow the agent's work change is `@-` and therefore
		// transitively reachable from `@`.
		const currentHead = currentHeads.get(ws.name) ?? ws.baseRev;
		mergeParents.push(currentHead);
	}

	// 1. N-parent jj new at @: `-r @ -r <p1> -r <p2> ...`. Lift the 2-parent
	// precedent at backends/jj.ts:1180-1188 to N parents.
	const newArgs: string[] = [...jjArgvFlags(mainRepoRoot), 'new', '-r', '@'];
	for (const p of mergeParents) {
		newArgs.push('-r', p);
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

	// 3. Probe conflicts. Two-stage to avoid `enumerateConflictedPaths`'s
	// `<UNRESOLVABLE>` fallback firing on non-conflicted merges:
	//   stage 1: `conflicts() & <mergeChangeId>` revset — boolean gate, mirrors
	//            reap.ts's `hasInTreeConflict` probe at reap.ts:88-101.
	//   stage 2: only if stage 1 said yes, enumerate paths via the sidecar.
	//
	// Bug-fix rationale (plan 09.05 Rule 1): the original parallel.ts called
	// `enumerateConflictedPaths` unconditionally and derived `conflicted` from
	// its return length. But the sidecar's WR-04 contract is "return
	// `['<UNRESOLVABLE>']` when `conflicts()` flagged the rev but enumeration
	// drew a blank" — it assumes the caller already gated on `conflicts()`.
	// On a clean merge the sidecar still returned `['<UNRESOLVABLE>']`
	// (primary `jj resolve --list` printed nothing → fallback `jj diff
	// --summary` exit 0 but no `C ` lines → WR-04 sentinel), making
	// `conflicted` always true. Gate explicitly here so the sidecar's
	// behavior matches its contract.
	const conflictsProbeArgs = [
		...jjArgvFlags(mainRepoRoot),
		'log', '-r', `conflicts() & ${mergeChangeId}`,
		'-T', 'change_id ++ "\\n"', '--no-graph',
	];
	const conflictsProbe = vcsExec(mainRepoRoot, 'jj', conflictsProbeArgs);
	if (conflictsProbe.exitCode !== 0) {
		throw new Error(
			`parallel.fanIn: conflicts() probe at ${mergeChangeId} failed: ${conflictsProbe.stderr || conflictsProbe.stdout}`,
		);
	}
	const conflicted = conflictsProbe.stdout.trim().length > 0;
	const conflictedPaths = conflicted
		? enumerateConflictedPaths(mainRepoRoot, mergeChangeId)
		: [];

	let incompleteQueued = 0;
	const merged: string[] = [];
	let surplusBookmarks: string[] = [];
	const failedReaped: string[] = [];

	if (conflicted) {
		// W3 (a): enqueue a merge-in-tree-conflict entry for the merge HEAD.
		// The on-disk dir + workspace tracking for each agent are LEFT intact
		// (no main-bookmark advance) so the user can inspect the conflicted
		// state before resolving or discarding.
		const mergeEntry: IncompleteWorkEntry = {
			subagentName: `phase-${phaseTag}-merge`,
			changeIdShort: mergeChangeId.slice(0, 12),
			workspacePath: handle.phaseRoot,
			reason: 'merge-in-tree-conflict',
		};
		appendIncomplete(handle.phaseRoot, mergeEntry);
		incompleteQueued += 1;

		// Phase 11 D-02: surplusBookmarks stays at its `[]` initialization on
		// the conflicted branch too — no bookmark plumbing fires either way.
		surplusBookmarks = [];
	} else {
		// Clean path: advance the main bookmark to the merge head
		// (PARALLEL-02 jj-side). Per Phase 11 D-02 there are no per-subagent
		// agent-bookmarks to delete here — see comment block below.
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

		// Phase 11 D-02 (cross-phase amendment): batched bookmark-delete and
		// post-delete surplus sweep retired. The dispatch loop no longer
		// creates `gsd/phase-{NN}-subagent-{idx}` bookmarks, so there is
		// nothing to delete here and the post-merge `surplusBookmarks` field
		// is `[]` by construction. The type-contract field stays on
		// `FanInResult` (default-initialized above) for cross-backend symmetry.

		merged.push(mergeChangeId);
	}

	// 4. Reap crashed agents — those with exitCode !== 0 in the results array.
	// Reuses the `currentHeads` map built at the top of this function (the
	// same re-resolved-current-head map the N-parent merge consumed).
	//
	// Bug-fix rationale (plan 09.05 Rule 1): `ws.baseRev` is the EMPTY slot
	// head materialized at dispatch time. A crashed agent's uncommitted work
	// landed in a NEW change via auto-snapshot, so its workspace `@` no longer
	// equals `ws.baseRev`. Feeding `ws.baseRev` as the `headChange` to
	// `performJjReap` makes `isEmptyHead` probe the wrong revision (the
	// already-empty slot head) and reap classifies the workspace as empty
	// rather than crashed — silently dropping the queue entry the orchestrator
	// expects. Re-resolving via `workspace.list()` matches the production path
	// `backends/jj.ts:1115-1135` (`workspace.reap`) takes for the same reason.
	const crashed = results.filter((r) => r.exitCode !== 0);
	if (crashed.length > 0) {
		const crashedAgentIds = new Set(crashed.map((r) => r.agentId));
		const reapEntries = handle.workspaces
			.filter((ws) => crashedAgentIds.has(ws.agentId))
			.map((ws) => ({
				name: ws.name,
				// Re-resolved current `@` from `jj workspace list`; fall back to
				// the stale `ws.baseRev` only if the workspace dropped out of
				// `jj workspace list` (e.g., already forgotten) — that case
				// still hands a defined string to reap rather than `undefined`.
				headChange: currentHeads.get(ws.name) ?? ws.baseRev,
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
