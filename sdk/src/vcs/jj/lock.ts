/**
 * sdk/src/vcs/jj/lock.ts — Phase 4 plan 03
 *
 * Per-workspace advisory flock primitive (D-19). RAII release-handle pattern.
 *
 * Pitfall 6 (RESEARCH): do NOT lock jj's internal `checkout` pointer file
 * directly — perms 0600, owned by jj's snapshot serialisation. Sidecar
 * sentinel at .jj/working_copy/gsd-lock instead.
 *
 * D-21: stale-WC handling (jj #7538) folded into acquisition path. After lock
 * is acquired, run `jj workspace update-stale` from inside the locked workspace
 * UNCONDITIONALLY (it's a no-op when the WC is fresh — verified locally).
 *
 * Pitfall 9 (RESEARCH): jj 0.41's `json(self)` template does NOT expose a
 * `stale` boolean, so there is no probe call from the lock-acquisition path
 * that could trigger an auto-snapshot on the wrong workspace. The
 * `mainRepoRoot` option is accepted on the API for forward-compat if a future
 * jj version surfaces a probe-able stale field. For now we touch only
 * `workspacePath` via update-stale, which honours Pitfall 9's "stale-recovery
 * targets the specific workspace" prescription.
 *
 * A2 assumption (RESEARCH): the sentinel under .jj/working_copy/gsd-lock does
 * not interfere with jj's internal snapshot serialisation. Plan 03 Task 3's
 * "jj operations still work in the locked workspace" test empirically validates
 * this. If a future regression reveals interference, fall back per RESEARCH A2
 * to `.jj/gsd-locks/<basename(workspacePath)>.lock` (a path OUTSIDE
 * `.jj/working_copy/`).
 */

import { openSync, closeSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { vcsExec } from '../exec.js';

export interface JjLockHandle {
	release(): void;
}

export interface AcquireJjWriteLockOpts {
	/** Total acquisition timeout in ms. Default 30_000 (D-19). */
	timeout?: number;
	/** Poll interval in ms while waiting for the sentinel to become creatable. Default 25. */
	pollInterval?: number;
	/**
	 * Main repo root for the stale-WC probe (Pitfall 9). If omitted, defaults to
	 * `workspacePath` itself (the orchestrator-side caller is expected to pass
	 * the main repo root for D-21 to work correctly; tests can omit when
	 * stale-recovery is not under exercise).
	 */
	mainRepoRoot?: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 25;

function sleepSync(ms: number): void {
	// Synchronous sleep. We use Atomics.wait on a SharedArrayBuffer for portability.
	const sab = new SharedArrayBuffer(4);
	const i32 = new Int32Array(sab);
	Atomics.wait(i32, 0, 0, ms);
}

function jjArgvFlags(repo: string): string[] {
	// Inline mandatory-flags prefix (avoids importing jjArgv from backends/jj.ts
	// — sidecar should not depend on the backend file; UPSTREAM-02 zero-conflict
	// surface convention).
	return ['--repository', repo, '--no-pager', '--color', 'never', '--quiet'];
}

/**
 * Acquire an advisory write lock on a jj workspace.
 *
 * Mechanism: O_EXCL open on `.jj/working_copy/gsd-lock` sentinel sidecar.
 * Polls on EEXIST until the lock becomes available or the timeout fires.
 *
 * @param workspacePath Absolute path to the workspace root (NOT the .jj dir).
 * @param opts Acquisition options (timeout, poll interval, main repo root for stale probe).
 * @returns A handle whose `release()` removes the sentinel.
 * @throws If the timeout fires before the sentinel becomes creatable.
 */
export function acquireJjWriteLock(
	workspacePath: string,
	opts: AcquireJjWriteLockOpts = {},
): JjLockHandle {
	const timeout = opts.timeout ?? DEFAULT_TIMEOUT_MS;
	const pollInterval = opts.pollInterval ?? DEFAULT_POLL_INTERVAL_MS;
	const mainRoot = opts.mainRepoRoot ?? workspacePath;

	// Pitfall 6: sentinel sidecar at .jj/working_copy/gsd-lock — NOT jj's
	// internal `checkout` pointer file.
	const sentinelDir = join(workspacePath, '.jj', 'working_copy');
	const sentinel = join(sentinelDir, 'gsd-lock');
	mkdirSync(sentinelDir, { recursive: true });

	const deadline = Date.now() + timeout;
	let fd: number | null = null;
	while (fd === null) {
		try {
			// O_EXCL mode: 'wx' — fails with EEXIST if file already exists.
			fd = openSync(sentinel, 'wx');
		} catch (err) {
			const errno = (err as NodeJS.ErrnoException).code;
			if (errno !== 'EEXIST') {
				throw err;
			}
			if (Date.now() >= deadline) {
				throw new Error(
					`acquireWriteLock timed out after ${timeout}ms: sentinel ${sentinel} still held`,
				);
			}
			sleepSync(pollInterval);
		}
	}

	// D-21: stale-WC recovery (jj #7538). EMPIRICAL FINDING (plan 03 execution):
	// jj 0.41's `json(self)` template does NOT emit a `stale` field on each
	// workspace record (probed locally — only name/target/parents/change_id/
	// description/author/committer surface). The plan-action's fallback path
	// applies: invoke `jj workspace update-stale` UNCONDITIONALLY. The command
	// is a no-op when the WC is fresh (verified locally — it exits 0 with the
	// stderr warning "Attempted recovery, but the working copy is not stale").
	//
	// Pitfall 9 is honoured by virtue of NOT calling `jj workspace list` at all
	// from the lock-acquisition path: there is no probe that could trigger an
	// auto-snapshot on the wrong workspace. `mainRepoRoot` is still accepted on
	// the API for forward-compat (if a future jj version surfaces a probe-able
	// stale field, the predicate can be reintroduced); for now we touch only
	// `workspacePath` via the update-stale call, which is the correct cwd per
	// Pitfall 9's "stale-recovery targets the specific workspace via cd
	// <workspace_path>" prescription.
	void mainRoot;
	try {
		const updateArgs = [...jjArgvFlags(workspacePath), 'workspace', 'update-stale'];
		vcsExec(workspacePath, 'jj', updateArgs);
		// We do NOT throw on update-stale failure — surfaced via stderr only; the
		// lock is still considered acquired. Stale recovery is best-effort here.
	} catch (e) {
		// Best-effort stale recovery — do not fail acquisition on probe error.
		void e;
	}

	return {
		release: (): void => {
			if (fd !== null) {
				try { closeSync(fd); } catch { /* fd already closed */ }
				fd = null;
			}
			if (existsSync(sentinel)) {
				try { unlinkSync(sentinel); } catch { /* sentinel already gone */ }
			}
		},
	};
}
