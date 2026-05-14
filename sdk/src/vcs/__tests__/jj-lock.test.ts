/**
 * Phase 4 plan 03: jj/lock.ts contract tests.
 *
 * Empirically validates:
 *  - O_EXCL sentinel mutual exclusion across processes
 *  - Default timeout (30s — exercised via short opts.timeout)
 *  - Release-and-reacquire roundtrip
 *  - A2 assumption (RESEARCH): sentinel under .jj/working_copy/gsd-lock does
 *    not interfere with jj's internal snapshot serialisation
 *  - Pitfall 6: sentinel lives at gsd-lock sidecar (not jj's internal
 *    checkout pointer file)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync, spawn } from 'node:child_process';
import { acquireJjWriteLock } from '../jj/lock.js';
import { createVcsAdapter } from '../index.js';

let jjAvailable = false;
try {
	execSync('jj --version', { stdio: 'pipe' });
	jjAvailable = true;
} catch {
	// jj not on PATH; entire suite skips.
}

// Phase 5 plan 05-05 flake-fix: Pattern B only (per-invocation random-prefix
// mkdtemp). This suite intentionally races on the gsd-lock primitive — the
// concurrency contention IS the system-under-test, so describe.sequential is
// NOT applied. Tmpdir-prefix collision across parallel test files is the
// only flake category here.
describe.skipIf(!jjAvailable)('acquireJjWriteLock — Phase 4 plan 03 (D-19)', () => {
	let dir: string;
	beforeAll(() => {
		// Build the CJS bridge BEFORE any test runs. The concurrent-acquire test
		// forks a child Node process that requires `sdk/dist-cjs/vcs/jj/lock.js`.
		// Without this step the child cannot resolve the module and the test
		// fails for the wrong reason. Slow on cold cache (~10-30s) but cached
		// builds are fast.
		//
		// CHOSEN approach: beforeAll build (option (a) per revision request).
		// Alternative considered: fork with `--import tsx` to require the TS
		// source directly — rejected because vitest's working directory and tsx
		// resolution differ enough across CI/local that the build-the-bridge
		// path is more robust.
		execSync('pnpm build:cjs', {
			cwd: join(process.cwd()),
			stdio: 'pipe',
		});

		dir = mkdtempSync(
			join(
				tmpdir(),
				`gsd-jj-lock-${Math.random().toString(36).slice(2, 10)}-`,
			),
		);
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
	}, 60_000); // 60s timeout — accommodates cold pnpm build:cjs cache
	afterAll(() => {
		if (dir) rmSync(dir, { recursive: true, force: true });
	});

	it('acquires the sentinel under .jj/working_copy/gsd-lock (Pitfall 6 NOT internal checkout pointer)', () => {
		const handle = acquireJjWriteLock(dir);
		try {
			expect(existsSync(join(dir, '.jj', 'working_copy', 'gsd-lock'))).toBe(true);
		} finally {
			handle.release();
		}
		// After release, sentinel is gone.
		expect(existsSync(join(dir, '.jj', 'working_copy', 'gsd-lock'))).toBe(false);
	});

	it('release-and-reacquire: second acquire succeeds after release', () => {
		const h1 = acquireJjWriteLock(dir);
		h1.release();
		const h2 = acquireJjWriteLock(dir);
		h2.release();
		expect(true).toBe(true); // both acquires returned without throwing
	});

	it('timeout fires when the sentinel is held by another holder', () => {
		const h1 = acquireJjWriteLock(dir);
		try {
			expect(() =>
				acquireJjWriteLock(dir, { timeout: 100, pollInterval: 10 }),
			).toThrow(/timed out/);
		} finally {
			h1.release();
		}
	});

	// CONCURRENT-ACQUIRE TEST — child-process variant ONLY.
	//
	// The earlier same-process sketch (acquire in main thread, setTimeout to
	// release after 200ms, then second acquire) DEADLOCKS: the synchronous
	// `acquireJjWriteLock` sleeps via `Atomics.wait` on a SharedArrayBuffer
	// and that does NOT yield to the event loop, so the setTimeout callback
	// never fires. REPLACED — do not include the same-process variant.
	//
	// Child-process variant: fork a Node process that requires the BUILT cjs
	// module (`sdk/dist-cjs/vcs/jj/lock.js`), acquires + sleeps + releases.
	// The parent process then attempts a second acquire and asserts it blocks
	// until the child releases.
	it('concurrent acquire: second caller blocks until first releases (child-process)', async () => {
		// Phase 5 plan 05-05 flake-fix [Rule 1 — Bug]: the original test slept a
		// fixed 100ms before checking the sentinel, which raced under heavy
		// parallel load (Node child-process spawn can take >100ms when many
		// jj-suite workers are running). Poll for the sentinel with a generous
		// budget (3s) instead. Child sleeps long enough (1500ms) to guarantee
		// the parent's second acquire observes at least one EEXIST iteration
		// regardless of spawn latency.
		const cjsLockPath = join(process.cwd(), 'dist-cjs/vcs/jj/lock.js');
		const child = spawn(
			'node',
			[
				'-e',
				`
					const { acquireJjWriteLock } = require(${JSON.stringify(cjsLockPath)});
					const h = acquireJjWriteLock(${JSON.stringify(dir)});
					setTimeout(() => { h.release(); process.exit(0); }, 1500);
				`,
			],
			{ stdio: 'pipe' },
		);

		// Poll for the child to acquire — wait up to 3s for the sentinel.
		const sentinelPath = join(dir, '.jj', 'working_copy', 'gsd-lock');
		const pollDeadline = Date.now() + 3000;
		while (Date.now() < pollDeadline && !existsSync(sentinelPath)) {
			await new Promise((r) => setTimeout(r, 25));
		}
		expect(existsSync(sentinelPath)).toBe(true);

		const startSecond = Date.now();
		// This call will busy-wait in the current (parent) process via Atomics.wait.
		const h2 = acquireJjWriteLock(dir, { timeout: 4000, pollInterval: 25 });
		const elapsed = Date.now() - startSecond;
		try {
			// Child held the lock for ≥1500ms after parent saw the sentinel
			// (minus poll-elapsed). The second acquire must have observed at
			// least one EEXIST iteration.
			expect(elapsed).toBeGreaterThanOrEqual(50);
			expect(elapsed).toBeLessThan(3800);
		} finally {
			h2.release();
			child.kill();
		}
	});

	it('A2 assumption: jj operations still work in the locked workspace (no interference)', () => {
		const handle = acquireJjWriteLock(dir);
		try {
			// jj should still answer status/list while gsd-lock is held — the sentinel
			// is GSD-owned, not jj-internal. Pitfall 6 says jj's serialisation does NOT
			// contend with this path.
			const adapter = createVcsAdapter(dir, { kind: 'jj' });
			const entries = adapter.workspace.list();
			expect(entries.length).toBeGreaterThanOrEqual(1);
		} finally {
			handle.release();
		}
	});

	it('non-existent workspace path: mkdirSync recursive creates parents (documented behaviour)', () => {
		const bogus = join(dir, 'does-not-exist-subtree');
		// mkdirSync recursive will succeed (it creates the dir tree), so the sentinel
		// gets created in a freshly-made directory tree. This is acceptable behaviour
		// — the caller is responsible for passing an actual workspace path. The test
		// documents the observed behaviour rather than asserting a specific error.
		const handle = acquireJjWriteLock(bogus, { timeout: 500 });
		try {
			expect(existsSync(join(bogus, '.jj', 'working_copy', 'gsd-lock'))).toBe(true);
		} finally {
			handle.release();
			rmSync(bogus, { recursive: true, force: true });
		}
	});
});
