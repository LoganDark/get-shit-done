/**
 * Phase 4 plan 06 + Phase 5 plan 05-01: hook firing contract tests
 * (HOOK-01..05, CI-04, D-32 — D-10 retired).
 *
 * Verifies:
 *   - HOOK-02 / HOOK-03: pre-commit fires after squash, before bookmark advance
 *   - HOOK-03 / D-32 (Phase 5 plan 05-01): colocated mode (.git + .jj both
 *     present) ALWAYS fires the adapter-side .githooks/pre-commit; the prior
 *     D-10 colocated no-op was retired after Phase 4 plan 04-06 empirically
 *     refuted the A3 assumption on jj 0.41 colocated mode. Escape hatch:
 *     `GSD_HOOK_SKIP_COLOCATED=1` suppresses the fire in colocated mode.
 *   - HOOK-04: pre-push fire gated by would-push predicate (no bookmarks to
 *     push -> no-op fire; matches acarapetis/jj-pre-push behaviour)
 *   - HOOK-01: noVerify skips fire on commit and push
 *   - HOOK-05 v1 interface: fireHook signature stable ((cwd, stage, ctx?))
 *     so a future Tier 2 wrapper can layer without breaking
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
	mkdtempSync,
	mkdirSync,
	writeFileSync,
	chmodSync,
	existsSync,
	rmSync,
	unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { createVcsAdapter } from '../index.js';
import type { JjVcsAdapter } from '../types.js';

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
	'hook firing - Phase 4 plan 06 + Phase 5 plan 05-01 (HOOK-01..05, CI-04, D-32 — D-10 retired)',
	() => {
		describe('jj-native (non-colocated): adapter shells .githooks/<stage>', () => {
			let dir: string;
			let vcs: JjVcsAdapter;
			beforeAll(() => {
				// Plan 04-01 SUMMARY locked: `jj git init --no-colocate` is the
				// canonical non-colocated init on jj 0.41 (--no-git was a planning
				// hypothesis refuted empirically).
				dir = mkdtempSync(join(tmpdir(), 'gsd-jj-hooks-native-'));
				execSync('jj git init --no-colocate', { cwd: dir, stdio: 'pipe' });
				execSync('jj config set --repo user.email "test@test.com"', {
					cwd: dir,
					stdio: 'pipe',
				});
				execSync('jj config set --repo user.name "Test"', {
					cwd: dir,
					stdio: 'pipe',
				});
				vcs = createVcsAdapter(dir, { kind: 'jj' }) as JjVcsAdapter;
			});
			afterAll(() => {
				if (dir) rmSync(dir, { recursive: true, force: true });
			});

			it('HOOK-02 + HOOK-03: pre-commit fires after squash in non-colocated jj', () => {
				const markerPath = join(dir, '.pre-commit-fired');
				safeUnlink(markerPath);
				writeHook(
					dir,
					'pre-commit',
					`#!/bin/bash\ntouch "${markerPath}"\nexit 0\n`,
				);

				writeFileSync(join(dir, 'a.txt'), 'a\n');
				const r = vcs.commit({ message: 'test hook fire', files: ['a.txt'] });
				expect(r.exitCode).toBe(0);
				expect(existsSync(markerPath)).toBe(true);
			});

			it('HOOK-01: noVerify skips pre-commit fire', () => {
				const markerPath = join(dir, '.no-verify-marker');
				safeUnlink(markerPath);
				writeHook(
					dir,
					'pre-commit',
					`#!/bin/bash\ntouch "${markerPath}"\nexit 0\n`,
				);

				writeFileSync(join(dir, 'b.txt'), 'b\n');
				const r = vcs.commit({
					message: 'test noVerify',
					files: ['b.txt'],
					noVerify: true,
				});
				expect(r.exitCode).toBe(0);
				expect(existsSync(markerPath)).toBe(false);
			});

			it('non-zero hook exit: squash succeeds, hook failure goes to stderr (T-03.04-03 pattern)', () => {
				writeHook(
					dir,
					'pre-commit',
					`#!/bin/bash\necho "hook said no" >&2\nexit 1\n`,
				);
				writeFileSync(join(dir, 'c.txt'), 'c\n');
				const r = vcs.commit({
					message: 'hook fails but squash succeeds',
					files: ['c.txt'],
				});
				// Squash itself succeeded; pre-commit landed but failed.
				expect(r.exitCode).toBe(0);
				expect(r.hash).toBeTruthy();
				// Hook failure surfaces via merged stderr.
				expect(r.stderr).toMatch(/pre-commit hook failed/);
			});

			it('HOOK-04: pre-push no-op when no bookmarks would push (acarapetis trigger predicate)', () => {
				// On a fresh repo with no remotes / no tracked bookmarks, the
				// firePrePushHook trigger predicate enumerates 0 candidates and
				// skips the hook fire. The downstream `jj git push` itself fails
				// (no remote configured), but the fire IS gated by the predicate.
				const markerPath = join(dir, '.pre-push-fired');
				safeUnlink(markerPath);
				writeHook(
					dir,
					'pre-push',
					`#!/bin/bash\ntouch "${markerPath}"\nexit 0\n`,
				);
				const r = vcs.push();
				// Adapter pre-push hook MUST NOT have fired (no bookmarks to push).
				expect(existsSync(markerPath)).toBe(false);
				// r.exitCode is not asserted — `jj git push` with no remote is
				// expected to fail at the jj layer; the contract is that the
				// hook did not fire.
				void r;
			});
		});

		describe('jj-colocated: pre-commit always fires from adapter (D-32 — D-10 retired)', () => {
			let dir: string;
			let vcs: JjVcsAdapter;
			beforeAll(() => {
				dir = mkdtempSync(join(tmpdir(), 'gsd-jj-hooks-colocated-'));
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
				execSync('jj squash -B @ -k -m "seed"', {
					cwd: dir,
					stdio: 'pipe',
				});
				vcs = createVcsAdapter(dir, { kind: 'jj' }) as JjVcsAdapter;
			});
			afterAll(() => {
				if (dir) rmSync(dir, { recursive: true, force: true });
			});

			it('D-32: colocated mode always fires adapter-side .githooks/pre-commit', () => {
				const markerPath = join(dir, '.colocated-adapter-fired');
				safeUnlink(markerPath);
				writeHook(
					dir,
					'pre-commit',
					`#!/bin/bash\ntouch "${markerPath}"\nexit 0\n`,
				);

				writeFileSync(join(dir, 'co-a.txt'), 'a\n');
				const r = vcs.commit({
					message: 'colocated test',
					files: ['co-a.txt'],
				});
				expect(r.exitCode).toBe(0);
				// Adapter-side .githooks/pre-commit MUST have fired post-D-32
				// (D-10 colocated no-op retired; Phase 4 A3 assumption refuted
				// by plan 04-06 empirical observation on jj 0.41 colocated mode).
				expect(existsSync(markerPath)).toBe(true);
			});

			it('GSD_HOOK_SKIP_COLOCATED=1 suppresses the fire in colocated mode (D-32 escape hatch)', () => {
				const markerPath = join(dir, '.colocated-skip-marker');
				safeUnlink(markerPath);
				writeHook(
					dir,
					'pre-commit',
					`#!/bin/bash\ntouch "${markerPath}"\nexit 0\n`,
				);

				const prev = process.env.GSD_HOOK_SKIP_COLOCATED;
				process.env.GSD_HOOK_SKIP_COLOCATED = '1';
				try {
					writeFileSync(join(dir, 'co-skip.txt'), 'skip\n');
					const r = vcs.commit({
						message: 'colocated skip-hook test',
						files: ['co-skip.txt'],
					});
					expect(r.exitCode).toBe(0);
					// Escape-hatch active: adapter MUST NOT have fired the hook.
					expect(existsSync(markerPath)).toBe(false);
				} finally {
					if (prev === undefined) {
						delete process.env.GSD_HOOK_SKIP_COLOCATED;
					} else {
						process.env.GSD_HOOK_SKIP_COLOCATED = prev;
					}
				}
			});

			// A3 assumption regression — does git's .git/hooks/pre-commit fire
			// automatically when colocated jj exports? If A3 holds, the marker
			// appears; if not, the test surfaces a warning to SUMMARY (does
			// not hard-fail because A3 is jj-version-dependent).
			it('A3 assumption: git .git/hooks/pre-commit fires automatically via colocation [observational]', () => {
				const markerPath = join(dir, '.git-side-fired');
				safeUnlink(markerPath);
				const gitHookDir = join(dir, '.git', 'hooks');
				mkdirSync(gitHookDir, { recursive: true });
				const gitHookPath = join(gitHookDir, 'pre-commit');
				writeFileSync(
					gitHookPath,
					`#!/bin/bash\ntouch "${markerPath}"\nexit 0\n`,
				);
				chmodSync(gitHookPath, 0o755);

				writeFileSync(join(dir, 'a3-test.txt'), 'x\n');
				vcs.commit({
					message: 'a3 assumption probe',
					files: ['a3-test.txt'],
				});
				if (!existsSync(markerPath)) {
					// Surface to SUMMARY: A3 does NOT hold on this jj version.
					// Consider firing pre-commit in colocated mode too (fireHook
					// is idempotent given the noVerify gate already covers
					// caller opt-out).
					// eslint-disable-next-line no-console
					console.warn(
						'A3 assumption did NOT hold - git .git/hooks/pre-commit did not fire after jj squash on this jj version. See plan 04-06 SUMMARY.',
					);
				}
				// Observational: always pass; the warning surfaces to reviewer.
				expect(true).toBe(true);
			});
		});

		describe('HOOK-05 v1 interface shape stability', () => {
			it('fireHook signature is (cwd, stage, ctx?) - Tier 2 wrapper can layer without breaking', async () => {
				const { fireHook } = await import('../hook-bridge.js');
				expect(typeof fireHook).toBe('function');
				// arity probe: 2 required + 1 optional => .length <= 3
				expect(fireHook.length).toBeLessThanOrEqual(3);
			});
		});
	},
);
