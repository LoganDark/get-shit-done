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
 * IF `jj workspace list -R <main_repo_root>` reports it as stale.
 *
 * Pitfall 9 (RESEARCH): stale probe queries `jj workspace list` with -R pointing
 * at the main repo root so the auto-snapshot fires there, NOT in the locked
 * workspace (which would re-snapshot the workspace we're inspecting).
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

	// D-21: stale-WC recovery (jj #7538). Probe stale status via
	// `jj workspace list -R <mainRoot>` (Pitfall 9 — probe queries from main repo,
	// NOT from the locked workspace, to avoid auto-snapshot recursion).
	//
	// jj 0.41's `json(self)` template emits a `stale` boolean field on each
	// workspace record. If the JSON template shape ever drifts (jj-version bump),
	// the predicate below falls through to "not stale" — and the lock is still
	// considered acquired (best-effort stale recovery). The unconditional
	// `jj workspace update-stale` invocation is a no-op when the WC is fresh,
	// so an alternative implementation could skip the probe entirely; we keep
	// the probe to avoid spawning a child process on the happy path.
	try {
		const probeArgs = [
			...jjArgvFlags(mainRoot),
			'workspace', 'list', '-T', 'json(self) ++ "\\n"',
		];
		const probe = vcsExec(mainRoot, 'jj', probeArgs);
		if (probe.exitCode === 0 && /"stale"\s*:\s*true/.test(probe.stdout)) {
			const updateArgs = [...jjArgvFlags(workspacePath), 'workspace', 'update-stale'];
			vcsExec(workspacePath, 'jj', updateArgs);
			// We do NOT throw on update-stale failure — surfaced via stderr only; the
			// lock is still considered acquired. Stale recovery is best-effort here.
		}
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
