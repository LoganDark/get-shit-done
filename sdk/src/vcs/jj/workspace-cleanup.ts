/**
 * sdk/src/vcs/jj/workspace-cleanup.ts — Phase 15.04 Wave 1 (PARALLEL-07)
 *
 * Shared helper for tearing down materialized subagent workspaces. Three
 * consumers per IP-5 (single-owner / three-consumer pattern, Pitfall 11
 * mitigation — single owner forbids inline duplication of the per-workspace
 * `jj workspace forget + rmSync` teardown body):
 *   1. 15.04 cancel verb body (`performJjParallelCancel` in `jj/parallel.ts`)
 *   2. 16.02 fanIn clean-path branch (CLEANUP-02 — consumes this helper from
 *      `jj/parallel.ts::performJjParallelFanIn` on the non-conflicted branch
 *      where every subagent workspace tore down cleanly; the W3(a) conflicted
 *      branch is unchanged because it preserves workspaces for human review)
 *   3. 16.02 `scripts/dogfood-restore.sh` (via Phase 16 CLI bridge
 *      `sdk/src/query/cleanup-subagent-workspaces.ts` — D-08 informational
 *      note; bash invokes `gsd-sdk query cleanup-subagent-workspaces --phase N`
 *      when no Handle survived the restore)
 *
 * Contract divergence from `reap.ts` (file boundary makes the divergence
 * enforceable per D-04):
 *   - reap.ts W3(a): "leave conflicted workspaces for inspection" — strict
 *     throw on `jj workspace forget` failure; reap classifies in-tree-conflict
 *     heads and preserves them.
 *   - workspace-cleanup.ts: "tear down every workspace caller explicitly
 *     requested" — best-effort soft-fail on `jj workspace forget`; only
 *     `rmSync` exceptions populate `failedReaped[]` (the visible state-leak
 *     surface). Idempotent by D-06 contract: missing dirs are not errors.
 *
 * UPSTREAM-02 sidecar discipline (D-07): this file does NOT import from
 * `backends/jj.ts` (would create a merge conflict every upstream-rebase
 * cycle). Imports `vcsExec` from `'../exec.js'`; uses `node:fs` for filesystem
 * operations. The `jjArgvFlags` mandatory-flags prefix is inlined verbatim per
 * the `conflict-paths.ts:25-30` / `reap.ts:33-41` / `octopus.ts:39-47`
 * template — copying 5 lines is cheaper than the backends import.
 *
 * Idempotency contract (D-06):
 *   - missing dirs are not errors (`existsSync` gate before `rmSync`);
 *   - `jj workspace forget` non-zero is best-effort soft-fail (workspace may
 *     already be forgotten; do NOT push to `failedReaped[]` on forget-fail
 *     alone);
 *   - `rmSync` uses `{recursive: true, force: true}` (ENOENT no-op);
 *   - only `rmSync` exceptions populate `failedReaped[]`.
 *
 * Idempotent re-call (D-03 invariant — load-bearing for cancel's
 * `cancel-idempotent-recall` scenario): the second invocation returns
 * `{abandoned: [], failedReaped: []}` because every requested workspace dir
 * is already gone post-first-call; the already-gone branch SKIPS silently
 * and does NOT push to `abandoned[]` (pushing would violate the
 * empty-arrays-on-re-call invariant).
 *
 * Signature note (N1 decision recorded in 15-04-PLAN.md `<deviations>`):
 * Signature `(mainRepoRoot, phaseNumber, workspaces?)` deviates from CONTEXT
 * D-05's original literal `(phaseRoot, phaseNumber)` 2-arg form. Rationale:
 *   (a) `jjArgvFlags + jj workspace forget` need the colocated jj repo root,
 *       NOT the phase-dir path which sits 3 levels deep inside
 *       `.planning/phases/{NN-slug}/`;
 *   (b) optional 3rd parameter `workspaces?: readonly { name: string; path:
 *       string }[]` lets the cancel verb pass the Handle's authoritative list
 *       — resolves Pitfall 4 (custom `workspacePath` overrides leak when
 *       pure-readdirSync enumeration is used);
 *   (c) matches existing sidecar signature pattern
 *       (`conflict-paths.ts::enumerateConflictedPaths(cwd, rev)` takes a repo
 *       root, not a phase root).
 *
 * User-ratified amendment 2026-05-24 (Open Q1 RESOLVED).
 */

import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { vcsExec } from '../exec.js';

/**
 * Inline mandatory-flags prefix. UPSTREAM-02 sidecar discipline — verbatim
 * copy of `backends/jj.ts::jjArgv`'s flag portion, mirroring
 * `conflict-paths.ts:25-30` / `reap.ts:33-41` / `octopus.ts:39-47` templates.
 * UPSTREAM-02 (D-07): avoids the backends import.
 */
function jjArgvFlags(repo: string): string[] {
	return ['--repository', repo, '--no-pager', '--color', 'never', '--quiet'];
}

/**
 * Phase 16 REVIEW WR-05: shared anchored regex for the canonical workspace-
 * name format from `octopus.ts:300` (`phase-${phaseTag}-subagent-${idx}` with
 * `phaseTag = String(phaseNumber).padStart(2, '0')`). Both `^` and `$` are
 * mandatory — prevents path-injection via crafted dir names like
 * `phase-99-subagent-../etc/passwd` (the literal `/` is not in the digit
 * character class so the anchor fails). ASVS V12 / threat_model T-16.02-01.
 *
 * The capture group `(\d+)` accepts the unpadded form too (e.g.
 * `phase-1-subagent-1`) — the per-phase helper below uses the SAME pattern
 * (no re-padding), so the cross-phase enumerator in
 * `sdk/src/query/cleanup-subagent-workspaces.ts` and the per-phase helper
 * agree on what counts as a subagent-workspace dir. Pre-fix the helper used
 * `^phase-${phaseTag}-subagent-\d+$` (padded form derived from the caller's
 * `phaseNumber`); if an unpadded dir ever appeared on disk, the cross-phase
 * enumerator would discover it but the helper would silently skip on the
 * re-enumeration. Single source of truth here avoids that divergence.
 */
export const WORKSPACE_NAME_RE = /^phase-(\d+)-subagent-\d+$/;

/**
 * Partial-`CancelResult` shape (D-05): `{abandoned, failedReaped}` so the
 * cancel verb body (`performJjParallelCancel`) AND the 16.02 fanIn clean-path
 * branch AND the 16.02 dogfood-restore.sh consumer all unify the helper
 * output into their respective envelopes WITHOUT re-enumerating disk state.
 * Cancel widens to the 4-field `CancelResult` by adding `surplusBookmarks: []`
 * (jj-side empty by construction per Phase 11 D-02) and `surplusWorkspaces`
 * (counted at entry pre-cleanup).
 */
export interface CleanupSubagentWorkspacesResult {
	abandoned: readonly string[];
	failedReaped: readonly string[];
}

/**
 * Tear down every subagent workspace matching `phase-{NN}-subagent-*` under
 * `mainRepoRoot/.claude/jj-workspaces/` (the canonical jj-side path per
 * `octopus.ts:300-302`).
 *
 * Enumeration strategy (Pitfall 4 mitigation — see N1 deviation in
 * 15-04-PLAN.md):
 *   - When `workspaces` parameter is provided AND `length > 0`: iterate that
 *     list (authoritative). Used by `cancel(handle)` where the
 *     `ParallelDispatchHandle.workspaces[]` array IS the source of truth at
 *     call time. Carries custom `workspacePath` overrides that the
 *     `readdirSync` fallback would miss.
 *   - When `workspaces` is omitted (or empty array): fall back to
 *     `readdirSync(mainRepoRoot/.claude/jj-workspaces/)` filtered by
 *     `^phase-{NN}-subagent-\d+$` regex. Best-effort recovery; used by
 *     `scripts/dogfood-restore.sh` (Phase 16) where no Handle survived the
 *     restore.
 *
 * Per-workspace teardown order (Pattern 5 from 15-PATTERNS.md / Example 5
 * from 15-RESEARCH.md):
 *   1. `jj workspace forget -- <name>` (best-effort; exit code IGNORED per
 *      D-06 — workspace may already be forgotten);
 *   2. `if (existsSync(ws.path))` gate, then
 *      `rmSync(ws.path, {recursive: true, force: true})` in try/catch —
 *      push to `abandoned[]` on success, `failedReaped[]` on caught
 *      exception (the only state-leak surface);
 *   3. if dir is already gone pre-rm: skip silently. Do NOT push to
 *      `abandoned[]` (would violate D-03 empty-arrays-on-re-call invariant —
 *      the second cancel call sees every dir already gone and MUST return
 *      `{abandoned: [], failedReaped: []}` per the idempotency contract).
 *
 * Consumer-completion record (Phase 16.02): see
 * .planning/phases/16-workflow-invariant-tooling/16-CONTEXT.md §"Cleanup-
 * Contract Documentation Site" — all 3 consumers (cancel verb, fanIn
 * clean-path, dogfood-restore.sh) are wired post-Phase-16.
 *
 * @param mainRepoRoot Colocated jj repo root (NOT the phase-dir path).
 * @param phaseNumber  Phase number used for both the workspaces-dir glob in
 *                     the readdirSync fallback and the per-workspace name
 *                     prefix (zero-padded to 2 digits — `phase-15-...`).
 * @param workspaces   Optional Handle-authoritative iteration list with
 *                     `{name, path}` per entry. When provided, takes
 *                     precedence over the readdirSync fallback.
 */
export function cleanupSubagentWorkspaces(
	mainRepoRoot: string,
	phaseNumber: number,
	workspaces?: readonly { name: string; path: string }[],
): CleanupSubagentWorkspacesResult {
	const phaseTag = String(phaseNumber).padStart(2, '0');

	// Build the iteration list. Handle-authoritative when provided (Pitfall 4
	// mitigation per N1 — custom workspacePath overrides DO NOT leak); else
	// readdirSync fallback for the dogfood-restore.sh recovery path.
	let iterList: readonly { name: string; path: string }[];
	if (workspaces && workspaces.length > 0) {
		iterList = workspaces;
	} else {
		const workspacesDir = join(mainRepoRoot, '.claude', 'jj-workspaces');
		if (!existsSync(workspacesDir)) {
			// Nothing materialized yet on disk for this phase — idempotent
			// no-op (D-06 contract: missing dirs are not errors).
			return { abandoned: [], failedReaped: [] };
		}
		const pattern = new RegExp(`^phase-${phaseTag}-subagent-\\d+$`);
		iterList = readdirSync(workspacesDir)
			.filter((d) => pattern.test(d))
			.map((d) => ({ name: d, path: join(workspacesDir, d) }));
	}

	const abandoned: string[] = [];
	const failedReaped: string[] = [];

	for (const ws of iterList) {
		// Step 1: jj workspace forget (best-effort soft-fail per D-06).
		// Non-zero exit is acceptable — workspace may already be forgotten
		// from a prior reap/cancel cycle. We deliberately do NOT push to
		// failedReaped on forget-failure alone — only on the rmSync exception
		// path (the visible state-leak surface; forget-fail alone is invisible
		// post-rm).
		const forgetArgs = [
			...jjArgvFlags(mainRepoRoot),
			'workspace',
			'forget',
			'--',
			ws.name,
		];
		void vcsExec(mainRepoRoot, 'jj', forgetArgs);

		// Step 2: rm -rf the on-disk dir. `force: true` makes ENOENT a no-op
		// at the OS level, but we ALSO existsSync-gate so we can distinguish
		// "abandoned-this-call" (dir existed, rm succeeded) from
		// "already-gone-skip" (dir was missing before rm). The distinction
		// matters for D-03 — pushing already-gone dirs to abandoned[] would
		// break the empty-arrays-on-re-call invariant.
		if (existsSync(ws.path)) {
			try {
				rmSync(ws.path, { recursive: true, force: true });
				abandoned.push(ws.name);
			} catch {
				// rmSync threw despite force:true — typically EACCES or
				// EBUSY (the only state-leak surface worth surfacing).
				failedReaped.push(ws.name);
			}
		} else {
			// Dir already gone — D-06 idempotent skip; do NOT push to
			// abandoned[] (would violate D-03 empty-arrays-on-re-call
			// invariant — see 15-04-PLAN.md L52, L255, L299).
		}
	}

	return { abandoned, failedReaped };
}
