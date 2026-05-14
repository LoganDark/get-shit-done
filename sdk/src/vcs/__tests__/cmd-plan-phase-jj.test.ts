/**
 * Phase 5 plan 05-02 Task 3: CMD-02 integration test.
 *
 * Verifies `/gsd-plan-phase` translates correctly to jj:
 *   - createPhaseStructure creates the lazy parent+merge change pair and
 *     returns valid change IDs.
 *   - createPhaseStructure is idempotent: a single-plan phase WITHOUT
 *     subagent fan-out can call createPhaseStructure twice without creating
 *     a second slot (re-entry returns the same change_ids with
 *     created=false).
 *   - After plan-phase setup, the phase's merge-marker bookmark exists
 *     (gsd/phase-{NN}-merge-marker per octopus.ts:108).
 *
 * Suite skips when `jj --version` is unavailable.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { createJjAdapter } from '../backends/jj.js';
import { createPhaseStructure } from '../jj/octopus.js';

let jjAvailable = false;
try {
	execSync('jj --version', { stdio: 'pipe' });
	jjAvailable = true;
} catch {
	// jj not on PATH; entire suite skips.
}

describe.skipIf(!jjAvailable)('CMD-02 (/gsd-plan-phase) — jj-colocated', () => {
	let dir: string;
	let vcs: ReturnType<typeof createJjAdapter>;

	beforeAll(() => {
		dir = mkdtempSync(join(tmpdir(), 'gsd-cmd-plan-phase-'));
		execSync('jj git init --colocate', { cwd: dir, stdio: 'pipe' });
		execSync('jj config set --repo user.email "test@test.com"', {
			cwd: dir,
			stdio: 'pipe',
		});
		execSync('jj config set --repo user.name "Test"', {
			cwd: dir,
			stdio: 'pipe',
		});
		// Seed @ so parentRevset='@-' has a real ancestor to resolve.
		writeFileSync(join(dir, 'seed.txt'), 'seed\n');
		execSync('jj squash -B @ -k -m "seed"', { cwd: dir, stdio: 'pipe' });
		vcs = createJjAdapter(dir);
	});

	afterAll(() => {
		if (dir) rmSync(dir, { recursive: true, force: true });
	});

	it('Test 1: createPhaseStructure creates lazy parent+merge slot with valid change IDs', () => {
		const result = createPhaseStructure(dir, '@-', 5);
		expect(result.created).toBe(true);
		expect(result.parentChange).toBeTruthy();
		expect(result.mergeChange).toBeTruthy();
		expect(result.parentChange).not.toBe(result.mergeChange);
	});

	it('Test 2: createPhaseStructure is idempotent — re-entry returns same change_ids with created=false (single-plan phase pattern)', () => {
		// WS-05 invariant from Phase 4 plan 04-05: idempotent re-call leaves
		// the orchestrator's @ linear. The merge-marker bookmark probe at
		// octopus.ts:117 detects the existing slot and short-circuits.
		const first = createPhaseStructure(dir, '@-', 5);
		const second = createPhaseStructure(dir, '@-', 5);
		expect(second.created).toBe(false);
		expect(second.parentChange).toBe(first.parentChange);
		expect(second.mergeChange).toBe(first.mergeChange);
	});

	it('Test 3: phase merge-marker bookmark exists after createPhaseStructure (namespace: gsd/phase-{NN}-merge-marker)', () => {
		// octopus.ts:108 — bookmark name pattern is
		// `gsd/phase-${phaseTag}-merge-marker` with phaseTag = padStart(2, '0').
		// We probe via the adapter's refs.bookmarks.exists with raw=true
		// (Phase 3 D-04 raw-name escape; bookmark name is full literal).
		createPhaseStructure(dir, '@-', 5);
		const exists = vcs.refs.bookmarks.exists('gsd/phase-05-merge-marker', { raw: true });
		expect(exists).toBe(true);
	});
});
