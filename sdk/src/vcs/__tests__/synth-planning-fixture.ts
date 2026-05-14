/**
 * synth-planning-fixture.ts — synthetic `.planning/` skeleton seeded onto a
 * fresh jj-colocated (or jj-native) tmpdir for the Phase 5 plan 05-04 CMD-10
 * brownfield integration tests.
 *
 * Purpose: Phase 5 (per CONTEXT D-31) does NOT run jj against this repo's real
 * history; the dogfood-on-this-repo BROWN-01 / BROWN-02 requirements were
 * re-bucketed to Phase 6 (sticky-adapter flip + `.planning/` SHA→change_id
 * rewriter). The brownfield COMMANDS still need integration coverage on jj —
 * D-34 locks the strategy: exercise each command against a *synthetic*
 * `.planning/` skeleton in a fresh tmpdir.
 *
 * D-34 coverage gap (documented here for SUMMARY traceability):
 *   Brownfield commands exercised against synthetic jj fixtures only;
 *   full dogfood validation occurs in Phase 6 once the sticky-adapter flip
 *   + `.planning/` SHA → change_id rewriter exist.
 *
 * Usage:
 *   const { dir, vcs, cleanup } = synthPlanningFixture('jj-colocated');
 *   try {
 *     // ... exercise brownfield command against `dir` / `vcs` ...
 *   } finally {
 *     cleanup();
 *   }
 *
 * The factory wraps `vcs-fixture.ts:42-59` `initJjRepo()` and layers a
 * minimum 12-file `.planning/` skeleton + `src/example.ts` placeholder. It
 * does NOT commit the seeded files — brownfield commands inspect the
 * working-tree state.
 */

import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createVcsAdapter } from '../index.js';
import type { VcsAdapter } from '../types.js';

function initJjColocated(prefix: string): string {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	execSync('jj git init --colocate', { cwd: dir, stdio: 'pipe' });
	execSync('jj config set --repo user.email "test@test.com"', {
		cwd: dir,
		stdio: 'pipe',
	});
	execSync('jj config set --repo user.name "Test"', {
		cwd: dir,
		stdio: 'pipe',
	});
	return dir;
}

function initJjNative(prefix: string): string {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	// Phase 4 plan 01 (D-22) locked: `jj git init --no-colocate` is the
	// canonical non-colocated init on jj 0.41 (--colocate is the default).
	execSync('jj git init --no-colocate', { cwd: dir, stdio: 'pipe' });
	execSync('jj config set --repo user.email "test@test.com"', {
		cwd: dir,
		stdio: 'pipe',
	});
	execSync('jj config set --repo user.name "Test"', {
		cwd: dir,
		stdio: 'pipe',
	});
	return dir;
}

/**
 * Seeds the 12-file `.planning/` skeleton + `src/example.ts` placeholder
 * (per 05-RESEARCH.md §"CMD-10 Brownfield Synthetic-Fixture Strategy").
 *
 * Skeleton layout:
 *   <dir>/
 *   ├── .planning/
 *   │   ├── PROJECT.md           (5-line placeholder)
 *   │   ├── REQUIREMENTS.md      (3 mock requirement IDs)
 *   │   ├── ROADMAP.md           (2 phases: P1 complete, P2 in-progress)
 *   │   ├── STATE.md             (frontmatter with milestone + progress + stopped_at)
 *   │   ├── config.json          ({ "vcs": { "adapter": "jj" } })
 *   │   └── phases/
 *   │       ├── 01-foo/
 *   │       │   ├── 01-CONTEXT.md
 *   │       │   ├── 01-PLAN.md
 *   │       │   └── 01-SUMMARY.md
 *   │       └── 02-bar/
 *   │           ├── 02-CONTEXT.md
 *   │           └── 02-01-PLAN.md  (in-progress — no SUMMARY yet)
 *   └── src/
 *       └── example.ts            (single placeholder TypeScript file)
 */
function seedPlanningSkeleton(dir: string): void {
	mkdirSync(join(dir, '.planning/phases/01-foo'), { recursive: true });
	mkdirSync(join(dir, '.planning/phases/02-bar'), { recursive: true });
	mkdirSync(join(dir, 'src'), { recursive: true });

	// Top-level .planning/ files (PROJECT / REQUIREMENTS / ROADMAP / STATE / config).
	writeFileSync(join(dir, '.planning/PROJECT.md'), '# Synth Project\n\nMinimum project doc for CMD-10 brownfield fixture (D-34).\n');
	writeFileSync(join(dir, '.planning/REQUIREMENTS.md'), '# Requirements\n\n- MOCK-01 ...\n- MOCK-02 ...\n- MOCK-03 ...\n');
	writeFileSync(join(dir, '.planning/ROADMAP.md'), '# Roadmap\n\n## Phases\n\n- [x] Phase 1: foo (complete)\n- [ ] Phase 2: bar (in-progress)\n');
	writeFileSync(join(dir, '.planning/STATE.md'), '---\nmilestone: v1.0\nstopped_at: Phase 02-bar plan 02-01 (in-progress)\nprogress:\n  total_phases: 2\n  completed_phases: 1\n  total_plans: 4\n  completed_plans: 3\n---\n\n# Project State\n');
	writeFileSync(join(dir, '.planning/config.json'), JSON.stringify({ vcs: { adapter: 'jj' } }, null, 2) + '\n');

	// Per-phase skeleton files (01-foo complete, 02-bar in-progress).
	writeFileSync(join(dir, '.planning/phases/01-foo/01-CONTEXT.md'), '# Phase 01: foo\n');
	writeFileSync(join(dir, '.planning/phases/01-foo/01-PLAN.md'), '# Plan 01\n');
	writeFileSync(join(dir, '.planning/phases/01-foo/01-SUMMARY.md'), '# Summary 01\n');
	writeFileSync(join(dir, '.planning/phases/02-bar/02-CONTEXT.md'), '# Phase 02: bar\n');
	writeFileSync(join(dir, '.planning/phases/02-bar/02-01-PLAN.md'), '# Plan 02-01 (in-progress)\n');

	// Source-tree placeholder (consumed by the cmd-map-codebase-jj test).
	writeFileSync(join(dir, 'src/example.ts'), 'export const example = 42;\n');
}

export interface SynthPlanningFixture {
	dir: string;
	vcs: VcsAdapter;
	cleanup: () => void;
}

export function synthPlanningFixture(
	kind: 'jj-colocated' | 'jj-native' = 'jj-colocated',
): SynthPlanningFixture {
	const prefix =
		kind === 'jj-colocated' ? 'gsd-synth-jj-colo-' : 'gsd-synth-jj-native-';
	const dir =
		kind === 'jj-colocated' ? initJjColocated(prefix) : initJjNative(prefix);
	seedPlanningSkeleton(dir);
	const vcs = createVcsAdapter(dir, { kind: 'jj' });
	const cleanup = () => {
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {
			/* tmpdir already gone */
		}
	};
	return { dir, vcs, cleanup };
}

// Re-export the colocated initialiser so brownfield tests that exercise the
// empty-fresh-import path (e.g. /gsd-import on a repo without any .planning/)
// can spin up a bare jj-colocated tmpdir without the skeleton.
export { initJjColocated };
