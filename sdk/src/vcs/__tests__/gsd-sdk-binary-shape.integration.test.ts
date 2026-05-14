/**
 * gsd-sdk-binary-shape.integration.test.ts — Phase 5 plan 05-06 Task 3
 *
 * Black-box contract test for the built `gsd-sdk` binary. Closes the
 * root-cause test gap that masked CR-01 / CR-02 / WR-03 in Phase 5: every
 * existing test in `sdk/src/query/*.test.ts` mocks `createVcsAdapter` and
 * never reaches the `toGitRev` / `formatSuccess` pipeline, so contract
 * defects at the JSON-envelope and RevisionExpr boundaries went invisible.
 *
 * This test invokes `bin/gsd-sdk.js` (which shells to `sdk/dist/cli.js`)
 * via spawnSync against a tmp git repo and inspects the actual on-the-wire
 * JSON output. It SHOULD have existed in Phase 5 plan 05-01; landing it
 * now per VERIFICATION.md gap-closure scope.
 *
 * Pin: this is the only test in the repo that runs the BUILT binary. Do
 * NOT replace with a programmatic import of query-cli-adapter — the point
 * is to exercise the exact dispatch path workflows hit at run-time.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

const SDK_BIN = path.resolve(__dirname, '../../../../bin/gsd-sdk.js');
const SDK_CLI = path.resolve(__dirname, '../../../dist/cli.js');

let tmpDir: string;

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

function git(args: string[]): string {
	return execFileSync('git', args, { cwd: tmpDir, encoding: 'utf8' }).trim();
}

beforeAll(() => {
	// Pre-flight: built binary must exist.
	if (!existsSync(SDK_CLI)) {
		throw new Error(
			`gsd-sdk-binary-shape.integration: ${SDK_CLI} missing — run \`pnpm --filter @gsd-build/sdk build\` first.`,
		);
	}
	if (!existsSync(SDK_BIN)) {
		throw new Error(`gsd-sdk-binary-shape.integration: ${SDK_BIN} missing.`);
	}

	// Tmp git repo with two commits + staged files in/outside .planning/
	tmpDir = mkdtempSync(path.join(tmpdir(), 'gsd-sdk-binshape-'));
	git(['init', '-b', 'main']);
	git(['config', 'user.email', 'test@example.com']);
	git(['config', 'user.name', 'Test']);
	git(['config', 'commit.gpgsign', 'false']);
	git(['config', 'tag.gpgsign', 'false']);

	writeFileSync(path.join(tmpDir, 'README.md'), '# initial\n');
	git(['add', 'README.md']);
	git(['commit', '-m', 'initial commit']);

	mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
	writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), '# state\n');
	writeFileSync(path.join(tmpDir, 'code.ts'), 'export const x = 1;\n');
	git(['add', '.planning/STATE.md', 'code.ts']);
	git(['commit', '-m', 'feat: add planning state + code']);
});

afterAll(() => {
	if (tmpDir && existsSync(tmpDir)) {
		rmSync(tmpDir, { recursive: true, force: true });
	}
});

describe('gsd-sdk binary — on-the-wire JSON envelope shape', () => {
	it('CR-01 root claim: head-ref envelope is flat (top-level .head, NOT .data.head)', () => {
		const { stdout, status } = runGsdSdk(['query', 'head-ref', '--cwd', tmpDir]);
		expect(status).toBe(0);
		const parsed = JSON.parse(stdout);
		expect(parsed.ok).toBe(true);
		// head-ref returns the short hash (resolveShort form). The query-dispatch
		// unwraps the inner data.* object so the on-the-wire shape is flat.
		expect(typeof parsed.head).toBe('string');
		expect(parsed.head.length).toBeGreaterThanOrEqual(7);
		// The CR-01 invariant: NO `.data` wrapper at the top level.
		expect(parsed).not.toHaveProperty('data');
	});

	it('CR-02 fix: log --range HEAD~1..HEAD succeeds (no Invalid RevisionExpr)', () => {
		const { stdout, stderr, status } = runGsdSdk([
			'query', 'log', '--range', 'HEAD~1..HEAD', '--max-count', '1', '--cwd', tmpDir,
		]);
		expect(stderr).not.toMatch(/Invalid RevisionExpr/);
		expect(status).toBe(0);
		const parsed = JSON.parse(stdout);
		expect(parsed.ok).toBe(true);
		expect(Array.isArray(parsed.entries)).toBe(true);
		expect(parsed.entries.length).toBeGreaterThanOrEqual(1);
	});

	it('CR-02 fix: diff --name-only --range HEAD~1..HEAD succeeds', () => {
		const { stdout, stderr, status } = runGsdSdk([
			'query', 'diff', '--name-only', '--range', 'HEAD~1..HEAD', '--cwd', tmpDir,
		]);
		expect(stderr).not.toMatch(/Invalid RevisionExpr/);
		expect(status).toBe(0);
		const parsed = JSON.parse(stdout);
		expect(parsed.ok).toBe(true);
		expect(Array.isArray(parsed.nameOnly)).toBe(true);
	});

	it('WR-03 fix: push --bookmark release/v1.0 reaches adapter (no SDK-side Invalid RevisionExpr)', () => {
		const { stdout, stderr } = runGsdSdk([
			'query', 'push', '--remote', 'origin', '--bookmark', 'release/v1.0', '--cwd', tmpDir,
		]);
		// Push fails (no origin configured) — that is fine; we only assert the
		// failure is git's remote-not-found, NOT an Invalid RevisionExpr throw
		// at the SDK contract boundary.
		expect(stderr + stdout).not.toMatch(/Invalid RevisionExpr/);
		// Envelope should round-trip the bookmark argv.
		const parsed = JSON.parse(stdout);
		expect(parsed.bookmark).toBe('release/v1.0');
	});

	it('CR-03 fix: reset --ref HEAD --mode mixed -- .planning/ unstages ONLY .planning/', () => {
		// Stage two new files: one under .planning/, one outside.
		writeFileSync(path.join(tmpDir, '.planning', 'NOTES.md'), '# notes\n');
		writeFileSync(path.join(tmpDir, 'app.ts'), 'export const y = 2;\n');
		git(['add', '.planning/NOTES.md', 'app.ts']);

		// Sanity: both staged.
		const before = git(['status', '--porcelain']);
		expect(before).toMatch(/^A\s+\.planning\/NOTES\.md$/m);
		expect(before).toMatch(/^A\s+app\.ts$/m);

		const { stdout, status } = runGsdSdk([
			'query', 'reset', '--ref', 'HEAD', '--mode', 'mixed', '--cwd', tmpDir,
			'--', '.planning/',
		]);
		expect(status).toBe(0);
		const parsed = JSON.parse(stdout);
		expect(parsed.ok).toBe(true);

		// Post: .planning/NOTES.md unstaged (?? or empty staged-col); app.ts STILL staged (A).
		const after = git(['status', '--porcelain']);
		expect(after).toMatch(/^\?\?\s+\.planning\/NOTES\.md$/m);  // untracked again
		expect(after).toMatch(/^A\s+app\.ts$/m);                    // still staged

		// Cleanup for downstream tests.
		git(['reset', '--mixed', 'HEAD']);  // unstage everything
		rmSync(path.join(tmpDir, '.planning', 'NOTES.md'));
		rmSync(path.join(tmpDir, 'app.ts'));
	});

	it('CR-04 fix: revert --abort dispatches to gitOnly.revertAbort (no <rev> required error)', () => {
		const { stdout, stderr } = runGsdSdk(['query', 'revert', '--abort', '--cwd', tmpDir]);
		// No in-progress revert → git exits non-zero with a "no operation in progress"-style
		// stderr. The SDK envelope MUST surface that, NOT a `<rev> argument required` error.
		expect(stderr + stdout).not.toMatch(/<rev> argument required/);
		const parsed = JSON.parse(stdout);
		expect(parsed.abort).toBe(true);
		expect(parsed.backend).toBe('git');
	});
});
