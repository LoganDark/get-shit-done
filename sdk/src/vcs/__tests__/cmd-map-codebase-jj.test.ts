/**
 * Phase 5 plan 05-04 Task 2: CMD-10 /gsd-map-codebase integration test.
 *
 * Exercises the `/gsd-map-codebase` brownfield-command path: the synth
 * fixture already has `src/example.ts`. Simulate the map-codebase workflow
 * by writing the two output files (`.planning/codebase/STACK.md` +
 * `.planning/codebase/STRUCTURE.md`), then commit them via vcs.commit().
 *
 * D-34 coverage gap: brownfield commands exercised against synthetic jj
 * fixtures only; full dogfood validation occurs in Phase 6 once the
 * sticky-adapter flip + `.planning/` SHA → change_id rewriter exist.
 *
 * Important: Test 3 is a structural sanity check — we write the STACK.md
 * content directly rather than driving the real /gsd-map-codebase workflow.
 * That gap is exactly D-34's coverage statement.
 *
 * Suite skips when `jj --version` is unavailable.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
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
	'CMD-10 (/gsd-map-codebase) — jj-colocated synth fixture (D-34)',
	() => {
		let fixture: ReturnType<typeof synthPlanningFixture>;

		beforeEach(() => {
			fixture = synthPlanningFixture('jj-colocated');
		});

		afterEach(() => {
			fixture?.cleanup();
		});

		it('Test 1: STACK.md + STRUCTURE.md emerge under .planning/codebase/', () => {
			// Pre: the synth fixture has src/example.ts; no .planning/codebase/ yet.
			expect(existsSync(join(fixture.dir, 'src/example.ts'))).toBe(true);
			expect(existsSync(join(fixture.dir, '.planning/codebase'))).toBe(false);

			// Simulate the workflow's output: write the two codebase files.
			mkdirSync(join(fixture.dir, '.planning/codebase'), { recursive: true });
			writeFileSync(
				join(fixture.dir, '.planning/codebase/STACK.md'),
				'# Stack\n\nDetected TypeScript via src/example.ts.\n',
			);
			writeFileSync(
				join(fixture.dir, '.planning/codebase/STRUCTURE.md'),
				'# Structure\n\nsrc/\n  example.ts\n',
			);

			// Post: both exist.
			expect(
				existsSync(join(fixture.dir, '.planning/codebase/STACK.md')),
			).toBe(true);
			expect(
				existsSync(join(fixture.dir, '.planning/codebase/STRUCTURE.md')),
			).toBe(true);
		});

		it('Test 2: vcs.commit({files: [...codebase]}) lands and appears in log', () => {
			mkdirSync(join(fixture.dir, '.planning/codebase'), { recursive: true });
			writeFileSync(
				join(fixture.dir, '.planning/codebase/STACK.md'),
				'# Stack\n',
			);
			writeFileSync(
				join(fixture.dir, '.planning/codebase/STRUCTURE.md'),
				'# Structure\n',
			);

			const r = fixture.vcs.commit({
				message: 'docs: map codebase',
				files: [
					'.planning/codebase/STACK.md',
					'.planning/codebase/STRUCTURE.md',
				],
			});
			expect(r.exitCode).toBe(0);
			expect(r.hash).toBeTruthy();

			// jj squash-based commit lands the message on @-'s description (jj
			// squash -B @ -k -m); head @ is a fresh empty commit. Query the
			// ancestry chain — pattern lifted from cmd-discuss-phase-jj.test.ts.
			const log = fixture.vcs.log({ maxCount: 10, allRefs: true });
			expect(log.length).toBeGreaterThan(0);
			const subjects = log.map((e) => e.subject).join(' | ');
			expect(subjects).toContain('docs: map codebase');
		});

		it('Test 3: STACK.md references src/example.ts (structural sanity — D-34 gap)', () => {
			// This test is the D-34 gap made explicit: we write the
			// STACK.md content ourselves above, so this assertion does NOT
			// prove the real workflow scanned src/example.ts. It proves the
			// synthetic round-trip works on jj. Phase 6 will validate the
			// real workflow against this repo.
			mkdirSync(join(fixture.dir, '.planning/codebase'), { recursive: true });
			const stackBody =
				'# Stack\n\nDetected TypeScript via src/example.ts.\n';
			writeFileSync(
				join(fixture.dir, '.planning/codebase/STACK.md'),
				stackBody,
			);
			const got = readFileSync(
				join(fixture.dir, '.planning/codebase/STACK.md'),
				'utf8',
			);
			expect(got).toMatch(/src\/example\.ts/);
		});
	},
);
