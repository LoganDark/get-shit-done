/**
 * Phase 4 plan 05: lazy octopus structure contract tests.
 *
 * Verifies:
 *   - WS-05: createPhaseStructure is idempotent (re-call returns same
 *     change_ids, created=false)
 *   - WS-06: createSubagentHead inserts between parent and merge using
 *     `jj new -A <parent> -B <merge> --no-edit`; orchestrator's @ does
 *     not get edited directly (WS-10).
 *   - WS-08: recursive plan-level fan-out works — one subagent's head can
 *     host its own nested octopus structure (different phase number).
 *   - createSubagentSlot combines head + workspace.add atomically.
 *   - Trigger predicate "any subagent in any wave" — single-subagent
 *     dispatch still creates parent+merge slot for forward-compat.
 *
 * Suite skips when `jj --version` is unavailable.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { createJjAdapter } from '../backends/jj.js';
import {
	createPhaseStructure,
	createSubagentHead,
	createSubagentSlot,
} from '../jj/octopus.js';

let jjAvailable = false;
try {
	execSync('jj --version', { stdio: 'pipe' });
	jjAvailable = true;
} catch {
	// jj not on PATH; entire suite skips.
}

describe.skipIf(!jjAvailable)(
	'octopus.ts — Phase 4 plan 05 (WS-05..10)',
	() => {
		let dir: string;
		let vcs: ReturnType<typeof createJjAdapter>;

		beforeAll(() => {
			dir = mkdtempSync(join(tmpdir(), 'gsd-jj-octopus-'));
			execSync('jj git init --colocate', { cwd: dir, stdio: 'pipe' });
			execSync('jj config set --repo user.email "test@test.com"', {
				cwd: dir,
				stdio: 'pipe',
			});
			execSync('jj config set --repo user.name "Test"', {
				cwd: dir,
				stdio: 'pipe',
			});
			writeFileSync(join(dir, 'seed.txt'), 'seed\n');
			execSync('jj squash -B @ -k -m "seed"', { cwd: dir, stdio: 'pipe' });
			vcs = createJjAdapter(dir);
		});

		afterAll(() => {
			if (dir) rmSync(dir, { recursive: true, force: true });
		});

		it('WS-05: createPhaseStructure creates parent+merge slot on first call', () => {
			const result = createPhaseStructure(dir, '@-', 4);
			expect(result.created).toBe(true);
			expect(result.parentChange).toBeTruthy();
			expect(result.mergeChange).toBeTruthy();
			expect(result.parentChange).not.toBe(result.mergeChange);
		});

		it('WS-05: createPhaseStructure is idempotent — second call returns same change_ids with created=false', () => {
			const first = createPhaseStructure(dir, '@-', 4);
			const second = createPhaseStructure(dir, '@-', 4);
			expect(second.created).toBe(false);
			expect(second.parentChange).toBe(first.parentChange);
			expect(second.mergeChange).toBe(first.mergeChange);
		});

		it('WS-06: createSubagentHead inserts between parent and merge using -A -B --no-edit', () => {
			const struct = createPhaseStructure(dir, '@-', 4);
			// WS-10: snapshot @ before invoking createSubagentHead. The
			// `--no-edit` flag should leave @ unchanged in terms of
			// edit-target (jj may rebase @ to stay a descendant of the
			// new structure, but the change_id of @ should remain
			// stable).
			const atBefore = execSync(
				`jj log -r @ -T 'change_id ++ "\\n"' --no-graph -n 1`,
				{ cwd: dir },
			)
				.toString()
				.trim();

			const head = createSubagentHead(dir, {
				parentChange: struct.parentChange,
				mergeChange: struct.mergeChange,
				idx: 1,
			});
			expect(head).toBeTruthy();
			expect(head).not.toBe(struct.parentChange);
			expect(head).not.toBe(struct.mergeChange);

			// WS-10: orchestrator's @ did NOT get re-edited (the
			// change_id of @ is stable across the --no-edit invocation).
			const atAfter = execSync(
				`jj log -r @ -T 'change_id ++ "\\n"' --no-graph -n 1`,
				{ cwd: dir },
			)
				.toString()
				.trim();
			expect(atAfter).toBe(atBefore);
		});

		it('createSubagentSlot creates head + workspace atomically', () => {
			// Fresh phase number so this slot is independent of prior
			// tests' structures.
			const struct = createPhaseStructure(dir, '@-', 99);
			const slot = createSubagentSlot(dir, vcs, {
				parentChange: struct.parentChange,
				mergeChange: struct.mergeChange,
				idx: 1,
				phaseNum: 99,
			});
			expect(slot.headChange).toBeTruthy();
			expect(slot.workspaceName).toBe('phase-99-subagent-1');
			expect(slot.workspacePath).toContain(
				'.claude/jj-workspaces/phase-99-subagent-1',
			);
			// Workspace exists in jj's list. parseJjWorkspaceList
			// populates `path` with the workspace NAME (per Phase 3
			// plan 03-06 design), not the on-disk path.
			expect(
				vcs.workspace.list().some((e) => e.path === 'phase-99-subagent-1'),
			).toBe(true);
			// Cleanup so this leaves no orphan workspace for the
			// remaining describe-block tests.
			vcs.workspace.forget('phase-99-subagent-1');
			rmSync(slot.workspacePath, { recursive: true, force: true });
		});

		it('WS-08: recursive plan-level fan-out — subagent head can host its own octopus structure', () => {
			// Outer phase
			const outer = createPhaseStructure(dir, '@-', 50);
			// Outer subagent head — this becomes the parent for a
			// nested plan-level structure.
			const outerHead = createSubagentHead(dir, {
				parentChange: outer.parentChange,
				mergeChange: outer.mergeChange,
				idx: 1,
			});
			// Inner (plan-level) structure rooted at the outer subagent
			// head.
			const inner = createPhaseStructure(dir, outerHead, 51);
			expect(inner.created).toBe(true);
			expect(inner.parentChange).toBe(outerHead);
			expect(inner.mergeChange).not.toBe(outer.mergeChange);
			// Inner subagent head
			const innerSubHead = createSubagentHead(dir, {
				parentChange: inner.parentChange,
				mergeChange: inner.mergeChange,
				idx: 1,
			});
			expect(innerSubHead).toBeTruthy();
			expect(innerSubHead).not.toBe(outerHead);
		});

		it('Trigger predicate: single-subagent dispatch still creates parent+merge slot (one-child octopus)', () => {
			const struct = createPhaseStructure(dir, '@-', 77);
			const single = createSubagentHead(dir, {
				parentChange: struct.parentChange,
				mergeChange: struct.mergeChange,
				idx: 1,
			});
			expect(single).toBeTruthy();
			// The slot exists; reap and merge flows can target it the
			// same way as N>1 cases. This is the observable consequence
			// of the "any subagent in any wave" trigger predicate
			// (Open Q1 / D-25 recommendation).
		});
	},
);
