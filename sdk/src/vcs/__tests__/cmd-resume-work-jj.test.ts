/**
 * Phase 5 plan 05-04 Task 2: CMD-10 /gsd-resume-work integration test.
 *
 * Exercises the `/gsd-resume-work` brownfield-command path against a synthetic
 * `.planning/` skeleton on a fresh jj-colocated tmpdir. The workflow reads
 * STATE.md's `stopped_at` frontmatter field to propose a resume point.
 *
 * D-34 coverage gap: brownfield commands exercised against synthetic jj
 * fixtures only; full dogfood validation occurs in Phase 6 once the
 * sticky-adapter flip + `.planning/` SHA → change_id rewriter exist.
 *
 * Suite skips when `jj --version` is unavailable.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
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

describe.skipIf(!jjAvailable)(
	'CMD-10 (/gsd-resume-work) — jj-colocated synth fixture (D-34)',
	() => {
		// beforeEach/afterEach (not beforeAll/afterAll): brownfield tests are
		// mutation-heavy and shared state would create cross-contamination,
		// an instance of the Phase 4 LEARNINGS flake category.
		let fixture: ReturnType<typeof synthPlanningFixture>;

		beforeEach(() => {
			fixture = synthPlanningFixture('jj-colocated');
		});

		afterEach(() => {
			fixture?.cleanup();
		});

		it('Test 1: reads STATE.md `stopped_at` from the synth fixture', () => {
			const statePath = join(fixture.dir, '.planning/STATE.md');
			const content = readFileSync(statePath, 'utf8');
			expect(content).toMatch(
				/stopped_at:\s*Phase 02-bar plan 02-01 \(in-progress\)/,
			);
		});

		it('Test 2: vcs.log({maxCount:5}) succeeds on the fresh jj repo', () => {
			// The synth skeleton is not committed; the fresh jj repo has an
			// empty working-copy commit (`@`) on top of root. vcs.log()
			// returns successfully (the contract is "does not throw"); jj's
			// log over an empty history is well-defined.
			const entries = fixture.vcs.log({ maxCount: 5 });
			expect(Array.isArray(entries)).toBe(true);
			// On a fresh jj repo (no real commits), log may return either
			// an empty array or a single root-relative entry depending on
			// jj 0.41's emit shape. Either is acceptable — the contract
			// is that the call succeeds and returns a LogEntry[].
			expect(entries.length).toBeLessThanOrEqual(5);
		});

		it('Test 3: proposed resume point — phase 02-bar 02-01-PLAN.md exists', () => {
			// The workflow-prompt logic (NOT adapter logic — that's the
			// D-34 gap) chooses Phase 02-bar / plan 02-01 as the resume
			// point because STATE.md's `stopped_at` points there. This
			// test asserts the structural prerequisite: the right phase
			// directory and in-progress plan file exist on disk.
			expect(existsSync(join(fixture.dir, '.planning/phases/02-bar'))).toBe(true);
			expect(
				existsSync(join(fixture.dir, '.planning/phases/02-bar/02-01-PLAN.md')),
			).toBe(true);
			// And the in-progress plan has NO matching SUMMARY (the marker
			// the workflow uses to detect "still-in-progress").
			expect(
				existsSync(join(fixture.dir, '.planning/phases/02-bar/02-01-SUMMARY.md')),
			).toBe(false);
		});
	},
);
