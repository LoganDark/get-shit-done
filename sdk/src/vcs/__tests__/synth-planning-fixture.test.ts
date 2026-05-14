/**
 * Sanity tests for synth-planning-fixture.ts (Phase 5 plan 05-04 Task 1).
 *
 * Verifies the factory returns a real tmpdir with the seeded skeleton and a
 * working VcsAdapter. Skips when `jj --version` is unavailable.
 *
 * D-34 reminder: this fixture is the only jj-bearing surface Phase 5 touches;
 * full dogfood validation occurs in Phase 6.
 */

import { describe, it, expect } from 'vitest';
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
	'synth-planning-fixture (Phase 5 plan 05-04 Task 1) — sanity',
	() => {
		it('returns a dir that exists and is jj-colocated', () => {
			const { dir, cleanup } = synthPlanningFixture('jj-colocated');
			try {
				expect(existsSync(dir)).toBe(true);
				// Colocated init creates both .jj and .git.
				expect(existsSync(join(dir, '.jj'))).toBe(true);
				expect(existsSync(join(dir, '.git'))).toBe(true);
			} finally {
				cleanup();
			}
		});

		it('seeds the .planning/ skeleton (12 files + src/example.ts)', () => {
			const { dir, cleanup } = synthPlanningFixture('jj-colocated');
			try {
				expect(existsSync(join(dir, '.planning/PROJECT.md'))).toBe(true);
				expect(existsSync(join(dir, '.planning/REQUIREMENTS.md'))).toBe(true);
				expect(existsSync(join(dir, '.planning/ROADMAP.md'))).toBe(true);
				expect(existsSync(join(dir, '.planning/STATE.md'))).toBe(true);
				expect(existsSync(join(dir, '.planning/config.json'))).toBe(true);
				expect(existsSync(join(dir, '.planning/phases/01-foo/01-CONTEXT.md'))).toBe(true);
				expect(existsSync(join(dir, '.planning/phases/01-foo/01-PLAN.md'))).toBe(true);
				expect(existsSync(join(dir, '.planning/phases/01-foo/01-SUMMARY.md'))).toBe(true);
				expect(existsSync(join(dir, '.planning/phases/02-bar/02-CONTEXT.md'))).toBe(true);
				expect(existsSync(join(dir, '.planning/phases/02-bar/02-01-PLAN.md'))).toBe(true);
				expect(existsSync(join(dir, 'src/example.ts'))).toBe(true);
				// STATE.md carries stopped_at marker (consumed by the cmd-resume-work test).
				const state = readFileSync(join(dir, '.planning/STATE.md'), 'utf8');
				expect(state).toMatch(/stopped_at:\s*Phase 02-bar plan 02-01/);
			} finally {
				cleanup();
			}
		});

		it('returns a VcsAdapter whose refs.head resolves', () => {
			const { vcs, cleanup } = synthPlanningFixture('jj-colocated');
			try {
				expect(vcs.kind).toBe('jj');
				expect(typeof vcs.refs.head).toBe('string');
				expect(vcs.refs.head.length).toBeGreaterThan(0);
			} finally {
				cleanup();
			}
		});

		it('cleanup() removes the tmpdir', () => {
			const { dir, cleanup } = synthPlanningFixture('jj-colocated');
			expect(existsSync(dir)).toBe(true);
			cleanup();
			expect(existsSync(dir)).toBe(false);
		});

		it("kind='jj-native' yields a non-colocated repo (no .git)", () => {
			const { dir, cleanup } = synthPlanningFixture('jj-native');
			try {
				expect(existsSync(join(dir, '.jj'))).toBe(true);
				expect(existsSync(join(dir, '.git'))).toBe(false);
				expect(existsSync(join(dir, '.planning/STATE.md'))).toBe(true);
			} finally {
				cleanup();
			}
		});
	},
);
