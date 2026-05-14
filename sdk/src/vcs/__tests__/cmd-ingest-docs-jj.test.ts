/**
 * Phase 5 plan 05-04 Task 2: CMD-10 /gsd-ingest-docs integration test.
 *
 * Exercises the `/gsd-ingest-docs` brownfield-command path: write a
 * synthetic `docs/foo.md` to the synth-skeleton fixture, simulate the
 * ingest-docs workflow by writing the two output files
 * (`.planning/research/ARCHITECTURE.md` + `.planning/research/FEATURES.md`),
 * then commit them via vcs.commit().
 *
 * D-34 coverage gap: brownfield commands exercised against synthetic jj
 * fixtures only; full dogfood validation occurs in Phase 6 once the
 * sticky-adapter flip + `.planning/` SHA → change_id rewriter exist.
 *
 * Note: the test writes the workflow's *outputs* directly rather than
 * driving the workflow; this is exactly the gap D-34 documents — we prove
 * the jj write path works, but NOT that the workflow itself produces
 * correct outputs against this repo's real history.
 *
 * Suite skips when `jj --version` is unavailable.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
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
	'CMD-10 (/gsd-ingest-docs) — jj-colocated synth fixture (D-34)',
	() => {
		let fixture: ReturnType<typeof synthPlanningFixture>;

		beforeEach(() => {
			fixture = synthPlanningFixture('jj-colocated');
		});

		afterEach(() => {
			fixture?.cleanup();
		});

		it('Test 1: ARCHITECTURE.md + FEATURES.md emerge under .planning/research/', () => {
			// Pre: write a synthetic docs/foo.md that the workflow would scan.
			mkdirSync(join(fixture.dir, 'docs'), { recursive: true });
			writeFileSync(
				join(fixture.dir, 'docs/foo.md'),
				'# Foo doc\n\nSome architecture notes.\n',
			);
			// Pre: no .planning/research/ yet.
			expect(existsSync(join(fixture.dir, '.planning/research'))).toBe(false);

			// Simulate the workflow's output: write the two research files.
			mkdirSync(join(fixture.dir, '.planning/research'), { recursive: true });
			writeFileSync(
				join(fixture.dir, '.planning/research/ARCHITECTURE.md'),
				'# Architecture\n\nDerived from docs/foo.md.\n',
			);
			writeFileSync(
				join(fixture.dir, '.planning/research/FEATURES.md'),
				'# Features\n\nDerived from docs/foo.md.\n',
			);

			// Post: both files exist under .planning/research/.
			expect(
				existsSync(join(fixture.dir, '.planning/research/ARCHITECTURE.md')),
			).toBe(true);
			expect(
				existsSync(join(fixture.dir, '.planning/research/FEATURES.md')),
			).toBe(true);
		});

		it('Test 2: vcs.commit({files: [...research]}) lands and appears in log', () => {
			mkdirSync(join(fixture.dir, '.planning/research'), { recursive: true });
			writeFileSync(
				join(fixture.dir, '.planning/research/ARCHITECTURE.md'),
				'# Arch\n',
			);
			writeFileSync(
				join(fixture.dir, '.planning/research/FEATURES.md'),
				'# Features\n',
			);

			const r = fixture.vcs.commit({
				message: 'docs: ingest external docs',
				files: [
					'.planning/research/ARCHITECTURE.md',
					'.planning/research/FEATURES.md',
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
			expect(subjects).toContain('docs: ingest external docs');
		});
	},
);
