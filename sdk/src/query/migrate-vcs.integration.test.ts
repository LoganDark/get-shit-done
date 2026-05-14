/**
 * migrate-vcs.integration.test.ts — Phase 6 plan 06-03 Task 2.
 *
 * Black-box integration test against the BUILT `bin/gsd-sdk.js`. Mirrors
 * `sdk/src/vcs/__tests__/gsd-sdk-binary-shape.integration.test.ts` (Phase 5
 * plan 05-06's canonical post-shim envelope-contract test).
 *
 * Asserts the CR-01 flat-envelope invariant on the on-the-wire JSON: when the
 * SDK CLI dispatches `migrate-vcs`, the user sees `parsed.ok`,
 * `parsed.migrated`, `parsed.newAdapter` etc. at the top level — never a
 * `.data` wrapper.
 *
 * Pin: this test invokes the built binary via spawnSync. Do NOT replace with
 * a programmatic import of the verb handler — the point is to exercise the
 * exact dispatch path workflow markdown hits at run-time.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { synthPlanningFixture, type SynthPlanningFixture } from '../vcs/__tests__/synth-planning-fixture.js';

const SDK_BIN = path.resolve(__dirname, '../../../bin/gsd-sdk.js');
const SDK_CLI = path.resolve(__dirname, '../../dist/cli.js');

function runGsdSdk(args: string[]): { stdout: string; stderr: string; status: number } {
	const result = spawnSync(process.execPath, [SDK_BIN, ...args], {
		stdio: ['ignore', 'pipe', 'pipe'],
		encoding: 'utf8',
	});
	return {
		stdout: result.stdout ?? '',
		stderr: result.stderr ?? '',
		status: result.status ?? -1,
	};
}

function jjAvailable(): boolean {
	try {
		const r = spawnSync('jj', ['--version'], { stdio: 'pipe' });
		return r.status === 0;
	} catch {
		return false;
	}
}
const JJ_AVAILABLE = jjAvailable();

beforeAll(() => {
	if (!existsSync(SDK_CLI)) {
		throw new Error(
			`migrate-vcs.integration: ${SDK_CLI} missing — run \`pnpm --filter @gsd-build/sdk build\` first.`,
		);
	}
	if (!existsSync(SDK_BIN)) {
		throw new Error(`migrate-vcs.integration: ${SDK_BIN} missing.`);
	}
});

describe.skipIf(!JJ_AVAILABLE)('gsd-sdk binary — migrate-vcs envelope shape', () => {
	let fixture: SynthPlanningFixture | undefined;

	function seedGitAdapter(dir: string): void {
		writeFileSync(
			path.join(dir, '.planning', 'config.json'),
			JSON.stringify({ vcs: { adapter: 'git' } }, null, 2) + '\n',
			'utf-8',
		);
	}

	beforeEach(() => {
		fixture = synthPlanningFixture('jj-colocated');
	});

	afterAll(() => {
		// Final-defense: tear down any fixture that survived a failing test.
		if (fixture) {
			try {
				fixture.cleanup();
			} catch {
				/* tmpdir already gone */
			}
			fixture = undefined;
		}
	});

	it('CR-01 invariant: envelope is flat (parsed.ok / parsed.migrated / parsed.newAdapter at top level)', () => {
		seedGitAdapter(fixture!.dir);
		const { stdout, status } = runGsdSdk([
			'query', 'migrate-vcs', '--target', 'jj', '--force', '--cwd', fixture!.dir,
		]);
		expect(status).toBe(0);
		const parsed = JSON.parse(stdout);
		expect(parsed.ok).toBe(true);
		expect(parsed.migrated).toBe(true);
		expect(parsed.newAdapter).toBe('jj');
		expect(parsed.previousAdapter).toBe('git');
		expect(typeof parsed.commitHash).toBe('string');
		expect(parsed.commitHash.length).toBeGreaterThan(0);
		// CR-01 invariant: the on-the-wire envelope must NOT have a `.data`
		// wrapper. The QueryHandler return is `{data: ...}` but query-dispatch
		// JSON.stringify's `result.data` directly.
		expect(parsed).not.toHaveProperty('data');
		fixture!.cleanup();
		fixture = undefined;
	});

	it('atomic-commit invariant: migration commit subject contains [gsd-migrate-vcs v1] marker', () => {
		seedGitAdapter(fixture!.dir);
		const r1 = runGsdSdk([
			'query', 'migrate-vcs', '--target', 'jj', '--force', '--cwd', fixture!.dir,
		]);
		expect(r1.status).toBe(0);
		const parsed1 = JSON.parse(r1.stdout);
		expect(parsed1.migrated).toBe(true);

		// Inspect HEAD commit subject via jj log directly. Use @- because the
		// migration commit lands on the parent of the working-copy commit
		// (squash semantics).
		const jj = spawnSync(
			'jj',
			['log', '-r', '@-', '-T', 'description', '--no-graph'],
			{ cwd: fixture!.dir, encoding: 'utf8' },
		);
		expect(jj.status).toBe(0);
		expect(jj.stdout).toContain('[gsd-migrate-vcs v1]');
		fixture!.cleanup();
		fixture = undefined;
	});

	it('current-state-aware default: bare command on absent config defaults to --target jj', () => {
		// Remove the seeded config.json entirely so currentAdapter='absent'.
		writeFileSync(
			path.join(fixture!.dir, '.planning', 'config.json'),
			JSON.stringify({}, null, 2) + '\n',
			'utf-8',
		);
		const { stdout, status } = runGsdSdk([
			'query', 'migrate-vcs', '--force', '--cwd', fixture!.dir,
		]);
		expect(status).toBe(0);
		const parsed = JSON.parse(stdout);
		expect(parsed.ok).toBe(true);
		expect(parsed.newAdapter).toBe('jj');
		fixture!.cleanup();
		fixture = undefined;
	});

	it('refuses bare command when current adapter is jj', () => {
		// synthPlanningFixture seeds adapter='jj' by default — leave as is.
		const { stdout, status } = runGsdSdk([
			'query', 'migrate-vcs', '--cwd', fixture!.dir,
		]);
		// The verb returns ok:false but exit-code is still 0 (envelope carries
		// the error). This matches the established pattern in restore.test.ts
		// and the other 11-shim verbs.
		expect(status).toBe(0);
		const parsed = JSON.parse(stdout);
		expect(parsed.ok).toBe(false);
		expect(parsed.error).toMatch(/pass --target git/);
		fixture!.cleanup();
		fixture = undefined;
	});

	it('refuses unknown --target with typed error', () => {
		const { stdout, status } = runGsdSdk([
			'query', 'migrate-vcs', '--target', 'hg', '--cwd', fixture!.dir,
		]);
		expect(status).toBe(0);
		const parsed = JSON.parse(stdout);
		expect(parsed.ok).toBe(false);
		expect(parsed.error).toMatch(/invalid --target/);
		fixture!.cleanup();
		fixture = undefined;
	});
});
