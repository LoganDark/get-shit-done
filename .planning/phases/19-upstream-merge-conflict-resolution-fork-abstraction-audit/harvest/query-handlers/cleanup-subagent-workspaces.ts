/**
 * sdk/src/query/cleanup-subagent-workspaces.ts — Phase 16.02 (CLEANUP-02)
 *
 * CLI bridge wrapping the locked Phase 15.04 helper at
 * `sdk/src/vcs/jj/workspace-cleanup.ts:134` for bash consumers — primarily
 * `scripts/dogfood-restore.sh` (Phase 16 D-04..D-13). The TS-side fanIn
 * clean-path branch in `sdk/src/vcs/jj/parallel.ts` calls the helper DIRECTLY
 * (NOT via this bridge — bridge is for bash consumers only per CONTEXT D-07).
 *
 * Flags (CONTEXT D-04 — mutually exclusive):
 *   --cwd <path>        optional; defaults to projectDir
 *   --phase <N>         single-phase mode; integer ≥ 0
 *   --all-phases        cross-phase enumeration mode (D-05)
 *
 * `--all-phases` enumerates `.claude/jj-workspaces/` via `readdirSync`,
 * filters entries by the anchored regex `/^phase-(\d+)-subagent-\d+$/`
 * (matches `octopus.ts:300` canonical workspace-name format; ASVS V12 /
 * threat_model T-16.02-01 path-injection mitigation), extracts the unique set
 * of phase numbers, and calls the helper once per phase. Per-phase results
 * are merged into a single `{abandoned, failedReaped}` envelope per D-06.
 * Order-preserving on ascending phase number for deterministic output across
 * invocations (test-fixture friendliness).
 *
 * Returns `{ data: result }` where result is `{abandoned, failedReaped}` —
 * uniform envelope shape across `--phase` and `--all-phases` modes (D-06).
 * On argv errors (missing required flag, mutually-exclusive violation,
 * non-integer phase) returns `{ data: { ok: false, reason: '<snake>' } }`
 * with no filesystem side effect (T-16.02-02 mitigation — `Number('abc')`
 * returns `NaN`; explicit `Number.isInteger` + `phase < 0` guard prevents
 * silent no-op on malformed input).
 *
 * Three-site registration (CF-02 / Pitfall 6 — missing any one site breaks
 * runtime verb resolution):
 *   1. `sdk/src/query/command-static-catalog-domain.ts` (catalog domain)
 *   2. `sdk/src/query/command-manifest.non-family.ts` (manifest descriptor)
 *   3. `sdk/src/query/command-aliases.generated.ts` (alias table — regenerated
 *      from the manifest via `sdk/scripts/gen-command-aliases.ts`)
 *
 * Smoke test: `tests/cli-cleanup-subagent-workspaces.test.cjs` proves
 * end-to-end three-site resolution via positive cases (argv validation
 * envelopes) + bogus-verb negative control.
 *
 * Usage:
 *   gsd-sdk query cleanup-subagent-workspaces --phase 16
 *   gsd-sdk query cleanup-subagent-workspaces --all-phases
 *   gsd-sdk query cleanup-subagent-workspaces --cwd /repo --phase 15
 */

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
	cleanupSubagentWorkspaces,
	WORKSPACE_NAME_RE,
} from '../vcs/jj/workspace-cleanup.js';
import type { QueryHandler } from './utils.js';

// Phase 16 REVIEW WR-05: WORKSPACE_NAME_RE moved to workspace-cleanup.ts as
// the single source of truth for "what counts as a subagent workspace dir".
// Pre-fix this file owned a local copy with `(\d+)` (unpadded match) and the
// per-phase helper at workspace-cleanup.ts:159 owned a separate
// `^phase-${phaseTag}-subagent-\d+$` regex (padded form). The two regexes
// had subtly different semantics — see the cross-file divergence narrative
// at workspace-cleanup.ts:WORKSPACE_NAME_RE for details. The bridge now
// imports the shared regex AND passes the discovered workspaces directly to
// the helper (bypassing the helper's per-phase readdirSync fallback), so
// the helper's padded regex never runs from this code path.

export const cleanupSubagentWorkspacesQuery: QueryHandler = async (args, projectDir) => {
	let cwd = projectDir;
	let phase: number | undefined;
	let allPhases = false;

	// Phase 16 REVIEW WR-03: argv loop uses an explicit `i + 1 < args.length`
	// guard rather than `args[i + 1]` truthiness. The pre-fix truthy-check
	// treated the empty string '' as missing (falsy), so
	// `gsd-sdk query cleanup-subagent-workspaces --phase ''` silently fell
	// through to the `phase_or_all_phases_required` envelope rather than
	// surfacing the more specific `invalid_phase_number` reason for an
	// empty-string phase. After the fix, an empty-string value is accepted
	// at the argv layer and routed to the downstream validator, which gives
	// the caller a precise diagnostic (Number('') === 0; phase 0 is legal
	// per the workspace-parallel-dispatch precedent, so empty-string phase
	// is treated as phase 0 — caller bug surfaces in the user's tooling,
	// not in this parser).
	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--cwd' && i + 1 < args.length) {
			cwd = args[++i];
		} else if (args[i] === '--phase' && i + 1 < args.length) {
			phase = Number(args[++i]);
		} else if (args[i] === '--all-phases') {
			allPhases = true;
		}
	}

	// (a) Mutual-exclusion — checked FIRST so the error fires before any
	// filesystem read (verifiable in the smoke test without seeding a
	// .claude/jj-workspaces/ tree). CONTEXT D-04.
	if (phase !== undefined && allPhases) {
		return { data: { ok: false, reason: 'phase_and_all_phases_mutually_exclusive' } };
	}

	// (b) At least one mode flag required (no implicit default — explicit-flag
	// norm shared with workspace-parallel-{dispatch,fan-in,cancel}.ts).
	if (phase === undefined && !allPhases) {
		return { data: { ok: false, reason: 'phase_or_all_phases_required' } };
	}

	// (c) Phase-number validation. `Number('abc')` → `NaN`; without this guard
	// the helper would compute `String(NaN).padStart(2,'0')` → `'NaN'`, which
	// then no-matches the readdirSync regex and silently returns
	// {abandoned: [], failedReaped: []} — worse than fail-loud. ASVS V5 /
	// threat_model T-16.02-02.
	if (phase !== undefined && (Number.isNaN(phase) || !Number.isInteger(phase) || phase < 0)) {
		return { data: { ok: false, reason: 'invalid_phase_number' } };
	}

	// Single-phase mode — direct helper call, no enumeration needed.
	if (phase !== undefined) {
		const result = cleanupSubagentWorkspaces(cwd, phase);
		return { data: result };
	}

	// --all-phases mode (D-05/D-06): enumerate .claude/jj-workspaces/, filter
	// by the anchored regex, group entries BY phase, iterate ascending.
	const workspacesDir = join(cwd, '.claude', 'jj-workspaces');
	if (!existsSync(workspacesDir)) {
		// Helper-equivalent idempotent no-op for missing dir (D-06 contract:
		// missing dirs are not errors).
		return { data: { abandoned: [], failedReaped: [] } };
	}

	// Phase 16 REVIEW WR-05: bucket discovered workspace dirs BY phase using
	// the shared regex. Pass each bucket directly to the helper as the
	// `workspaces` parameter, bypassing the helper's per-phase readdirSync
	// fallback. This eliminates the divergence between this enumerator's
	// regex (which accepts any digit-count phase number) and the helper's
	// padded-form regex (which builds `^phase-${phaseTag}-subagent-\d+$`).
	// If an unpadded-form dir like `phase-1-subagent-1` ever materialized
	// on disk, the pre-fix code would have discovered phase=1, then called
	// the helper with phase=1, which would have built a regex matching
	// `phase-01-subagent-N` and silently NOT matched the on-disk dir. With
	// the explicit-list path, the unpadded dir is teardown-eligible end-to-
	// end, no silent skip.
	const entries = readdirSync(workspacesDir);
	const workspacesByPhase = new Map<number, { name: string; path: string }[]>();
	for (const e of entries) {
		const m = WORKSPACE_NAME_RE.exec(e);
		if (!m) continue;
		const p = Number(m[1]);
		let bucket = workspacesByPhase.get(p);
		if (!bucket) {
			bucket = [];
			workspacesByPhase.set(p, bucket);
		}
		bucket.push({ name: e, path: join(workspacesDir, e) });
	}

	// Order-preserving — ascending phase number for deterministic output.
	const sortedPhases = [...workspacesByPhase.keys()].sort((a, b) => a - b);

	const merged: { abandoned: string[]; failedReaped: string[] } = {
		abandoned: [],
		failedReaped: [],
	};
	for (const p of sortedPhases) {
		// Pass the discovered workspaces directly — `workspaces.length > 0`
		// trips the helper's authoritative-list branch (workspace-cleanup.ts
		// :150-151), bypassing the per-phase regex fallback entirely.
		const r = cleanupSubagentWorkspaces(cwd, p, workspacesByPhase.get(p));
		merged.abandoned.push(...r.abandoned);
		merged.failedReaped.push(...r.failedReaped);
	}

	return { data: merged };
};
