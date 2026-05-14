/**
 * Phase 5 plan 05-04 Task 2: CMD-10 /gsd-pause-work integration test.
 *
 * Exercises the `/gsd-pause-work` brownfield-command path: mutate STATE.md
 * to reflect a pause point and commit via vcs.commit(). Verifies the
 * commit lands and the pre-commit hook (D-32 colocated fire) runs.
 *
 * D-34 coverage gap: brownfield commands exercised against synthetic jj
 * fixtures only; full dogfood validation occurs in Phase 6 once the
 * sticky-adapter flip + `.planning/` SHA → change_id rewriter exist.
 *
 * Suite skips when `jj --version` is unavailable.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
	writeFileSync,
	mkdirSync,
	chmodSync,
	existsSync,
	unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { synthPlanningFixture } from './synth-planning-fixture.js';

let jjAvailable = false;
try {
	execSync('jj --version', { stdio: 'pipe' });
	jjAvailable = true;
} catch {
	// jj not on PATH; entire suite skips.
}

function writeHook(dir: string, stage: string, body: string): string {
	const hookDir = join(dir, '.githooks');
	mkdirSync(hookDir, { recursive: true });
	const hookPath = join(hookDir, stage);
	writeFileSync(hookPath, body);
	chmodSync(hookPath, 0o755);
	return hookPath;
}

function safeUnlink(p: string): void {
	try {
		unlinkSync(p);
	} catch {
		/* ignore */
	}
}

describe.skipIf(!jjAvailable)(
	'CMD-10 (/gsd-pause-work) — jj-colocated synth fixture (D-34)',
	() => {
		let fixture: ReturnType<typeof synthPlanningFixture>;

		beforeEach(() => {
			fixture = synthPlanningFixture('jj-colocated');
		});

		afterEach(() => {
			fixture?.cleanup();
		});

		it('Test 1: commits a STATE.md update via vcs.commit() — exitCode === 0', () => {
			// Simulate the workflow updating STATE.md to record a pause point.
			const statePath = join(fixture.dir, '.planning/STATE.md');
			writeFileSync(
				statePath,
				'---\nmilestone: v1.0\nstopped_at: Manually paused at 2026-05-13\nprogress:\n  total_phases: 2\n  completed_phases: 1\n  total_plans: 4\n  completed_plans: 3\n---\n\n# Project State (paused)\n',
			);
			const r = fixture.vcs.commit({
				message: 'chore: pause work',
				files: ['.planning/STATE.md'],
			});
			expect(r.exitCode).toBe(0);
			expect(r.hash).toBeTruthy();
		});

		it('Test 2: commit appears in vcs.log — message visible in ancestry', () => {
			// jj squash-based commit lands the message on @-'s description (jj
			// squash -B @ -k -m), NOT on @ itself (which is a fresh empty
			// working-copy commit). Query the ancestry chain rather than
			// asserting against the head entry — pattern lifted from
			// cmd-discuss-phase-jj.test.ts.
			const statePath = join(fixture.dir, '.planning/STATE.md');
			writeFileSync(
				statePath,
				'---\nmilestone: v1.0\nstopped_at: Manually paused\n---\n\n# Paused\n',
			);
			fixture.vcs.commit({
				message: 'chore: pause work',
				files: ['.planning/STATE.md'],
			});
			const log = fixture.vcs.log({ maxCount: 10, allRefs: true });
			expect(log.length).toBeGreaterThan(0);
			const subjects = log.map((e) => e.subject).join(' | ');
			expect(subjects).toContain('chore: pause work');
		});

		it('Test 3: pre-commit hook fires during commit (D-32 colocated fire — A3 reach into CMD-10)', () => {
			// Write the adapter-side .githooks/pre-commit BEFORE the commit;
			// the D-32 / Phase 5 plan 05-01 contract says colocated mode
			// ALWAYS fires the adapter-side hook (D-10 retired). This test
			// proves the A3 fix from 05-01 reaches the CMD-10 path.
			const markerPath = join(fixture.dir, '.pre-commit-fired');
			safeUnlink(markerPath);
			writeHook(
				fixture.dir,
				'pre-commit',
				`#!/bin/bash\ntouch "${markerPath}"\nexit 0\n`,
			);

			const statePath = join(fixture.dir, '.planning/STATE.md');
			writeFileSync(
				statePath,
				'---\nmilestone: v1.0\nstopped_at: Hook-fire smoke\n---\n\n# Hook test\n',
			);
			const r = fixture.vcs.commit({
				message: 'chore: pause work (hook smoke)',
				files: ['.planning/STATE.md'],
			});
			expect(r.exitCode).toBe(0);
			expect(existsSync(markerPath)).toBe(true);
		});
	},
);
