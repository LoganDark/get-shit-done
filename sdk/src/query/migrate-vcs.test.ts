/**
 * Unit tests for migrateVcsQuery (Phase 6 plan 06-03 Task 1).
 *
 * Mock surfaces:
 *   - runMigration (the plan 06-02 library barrel)
 *   - node:fs/promises readFile (config.json deduction)
 *   - node:child_process execSync (jj --version preflight)
 *
 * Mirrors the vi.mock pattern in restore.test.ts (Phase 5 plan 05-01 D-33).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const runMigrationMock = vi.fn();
const readFileMock = vi.fn();
const execSyncMock = vi.fn();

vi.mock('../vcs/format-migration/index.js', () => ({
	runMigration: (...a: unknown[]) => runMigrationMock(...a),
}));
vi.mock('node:fs/promises', () => ({
	readFile: (...a: unknown[]) => readFileMock(...a),
}));
vi.mock('node:child_process', () => ({
	execSync: (...a: unknown[]) => execSyncMock(...a),
}));

import { migrateVcsQuery } from './migrate-vcs.js';

const SUCCESS_RESULT = {
	ok: true as const,
	migrated: true,
	filesChanged: 3,
	filesScanned: 7,
	orphans: {
		count: 0,
		ancestorResolved: 0,
		unresolvable: 0,
		reportPath: '.planning/intel/06-migration-report.md',
	},
	previousAdapter: 'git' as const,
	newAdapter: 'jj' as const,
	commitHash: 'abc1234',
};

beforeEach(() => {
	runMigrationMock.mockReset();
	readFileMock.mockReset();
	execSyncMock.mockReset();

	// Sensible defaults: config absent (currentAdapter='absent'); jj available;
	// runMigration succeeds.
	readFileMock.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
	execSyncMock.mockReturnValue(Buffer.from('jj 0.41.0\n'));
	runMigrationMock.mockResolvedValue(SUCCESS_RESULT);
});

describe('migrateVcsQuery', () => {
	it('rejects unknown --target value with typed error', async () => {
		const res = await migrateVcsQuery(['--target', 'hg', '--cwd', '/tmp/x'], '/tmp/x');
		expect(runMigrationMock).not.toHaveBeenCalled();
		const d = res.data as { ok: boolean; error: string };
		expect(d.ok).toBe(false);
		expect(d.error).toMatch(/invalid --target 'hg'/);
	});

	it('defaults to --target jj when current_adapter=git', async () => {
		readFileMock.mockResolvedValue(JSON.stringify({ vcs: { adapter: 'git' } }));
		const res = await migrateVcsQuery(['--cwd', '/tmp/x'], '/tmp/x');
		expect(runMigrationMock).toHaveBeenCalledTimes(1);
		expect(runMigrationMock).toHaveBeenCalledWith(
			'/tmp/x',
			'jj',
			expect.objectContaining({}),
		);
		const d = res.data as { ok: boolean; newAdapter: string };
		expect(d.ok).toBe(true);
		expect(d.newAdapter).toBe('jj');
	});

	it('defaults to --target jj when current_adapter=absent (no config.json)', async () => {
		// readFile already rejects with ENOENT in beforeEach.
		const res = await migrateVcsQuery(['--cwd', '/tmp/x'], '/tmp/x');
		expect(runMigrationMock).toHaveBeenCalledWith('/tmp/x', 'jj', expect.anything());
		const d = res.data as { ok: boolean };
		expect(d.ok).toBe(true);
	});

	it("refuses bare command when current_adapter=jj (require explicit --target git)", async () => {
		readFileMock.mockResolvedValue(JSON.stringify({ vcs: { adapter: 'jj' } }));
		const res = await migrateVcsQuery(['--cwd', '/tmp/x'], '/tmp/x');
		expect(runMigrationMock).not.toHaveBeenCalled();
		const d = res.data as { ok: boolean; error: string };
		expect(d.ok).toBe(false);
		expect(d.error).toMatch(/already on jj — pass --target git/);
	});

	it('defers same-direction to runMigration so marker-probe fast-exit is reachable (B-03)', async () => {
		// B-03 fix: same-direction (target===currentAdapter) is no longer
		// refused at the verb level. runMigration owns the decision: marker
		// present → {ok:true, migrated:false}; marker absent → throws.
		readFileMock.mockResolvedValue(JSON.stringify({ vcs: { adapter: 'git' } }));
		runMigrationMock.mockRejectedValue(new Error('already on git (previousAdapter=git)'));
		const res = await migrateVcsQuery(['--target', 'git', '--cwd', '/tmp/x'], '/tmp/x');
		expect(runMigrationMock).toHaveBeenCalledTimes(1);
		const d = res.data as { ok: boolean; error: string };
		expect(d.ok).toBe(false);
		expect(d.error).toMatch(/already on git/);
	});

	it('returns marker-probe fast-exit when same-direction migration is already migrated (B-03)', async () => {
		// Marker-probe contract: runMigration sees the migration marker on
		// HEAD and returns {ok:true, migrated:false} instead of erroring.
		readFileMock.mockResolvedValue(JSON.stringify({ vcs: { adapter: 'jj' } }));
		runMigrationMock.mockResolvedValue({
			...SUCCESS_RESULT,
			migrated: false,
			filesChanged: 0,
			filesScanned: 0,
			previousAdapter: 'jj',
			newAdapter: 'jj',
		});
		const res = await migrateVcsQuery(['--target', 'jj', '--cwd', '/tmp/x'], '/tmp/x');
		expect(runMigrationMock).toHaveBeenCalledTimes(1);
		const d = res.data as { ok: boolean; migrated: boolean };
		expect(d.ok).toBe(true);
		expect(d.migrated).toBe(false);
	});

	it('refuses --target jj when jj binary missing', async () => {
		execSyncMock.mockImplementation(() => {
			throw new Error('jj: command not found');
		});
		const res = await migrateVcsQuery(['--target', 'jj', '--cwd', '/tmp/x'], '/tmp/x');
		expect(runMigrationMock).not.toHaveBeenCalled();
		const d = res.data as { ok: boolean; error: string };
		expect(d.ok).toBe(false);
		expect(d.error).toMatch(/requires jj binary in PATH/);
	});

	it('passes --force through to runMigration', async () => {
		await migrateVcsQuery(['--target', 'jj', '--force', '--cwd', '/tmp/x'], '/tmp/x');
		expect(runMigrationMock).toHaveBeenCalledWith(
			'/tmp/x',
			'jj',
			expect.objectContaining({ force: true }),
		);
	});

	it('passes --native through to runMigration', async () => {
		await migrateVcsQuery(['--target', 'jj', '--native', '--cwd', '/tmp/x'], '/tmp/x');
		expect(runMigrationMock).toHaveBeenCalledWith(
			'/tmp/x',
			'jj',
			expect.objectContaining({ native: true }),
		);
	});

	it("rejects unknown flags", async () => {
		const res = await migrateVcsQuery(['--unknown'], '/tmp/x');
		expect(runMigrationMock).not.toHaveBeenCalled();
		const d = res.data as { ok: boolean; error: string };
		expect(d.ok).toBe(false);
		expect(d.error).toMatch(/unknown flag '--unknown'/);
	});

	it('returns flat envelope on success (no nested .data.data)', async () => {
		readFileMock.mockResolvedValue(JSON.stringify({ vcs: { adapter: 'git' } }));
		const res = await migrateVcsQuery(['--target', 'jj', '--cwd', '/tmp/x'], '/tmp/x');
		const d = res.data as Record<string, unknown>;
		expect(d.ok).toBe(true);
		expect(d.migrated).toBe(true);
		expect(d.newAdapter).toBe('jj');
		// CR-01 invariant: the QueryHandler result envelope wraps with .data
		// but the *payload* under .data is flat — no .data.data nested wrapper.
		expect(d).not.toHaveProperty('data');
	});

	it('honours --cwd over projectDir', async () => {
		await migrateVcsQuery(['--target', 'jj', '--cwd', '/other'], '/repo');
		expect(runMigrationMock).toHaveBeenCalledWith('/other', 'jj', expect.anything());
	});

	it('surfaces runMigration errors as typed envelope', async () => {
		runMigrationMock.mockRejectedValue(new Error('boom: walk failed'));
		const res = await migrateVcsQuery(['--target', 'jj', '--cwd', '/tmp/x'], '/tmp/x');
		const d = res.data as { ok: boolean; error: string };
		expect(d.ok).toBe(false);
		expect(d.error).toMatch(/migrate-vcs: boom: walk failed/);
	});
});
