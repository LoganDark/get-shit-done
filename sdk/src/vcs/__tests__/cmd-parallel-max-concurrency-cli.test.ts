/**
 * sdk/src/vcs/__tests__/cmd-parallel-max-concurrency-cli.test.ts
 *   — Phase 11 PARALLEL-06 behavioral coverage (Nyquist gap-fill, part 1/2)
 *
 * PARALLEL-06 (REQUIREMENTS.md:18): `dispatch({ plan, maxConcurrency })` input
 * field honored — numeric cap on concurrent agent workspaces. Default
 * `undefined`.
 *
 * Phase 11 D-07 deliberately omits a `workflow.max_concurrency` config knob;
 * `execute-phase.md` / `quick.md` always pass `undefined`. So PARALLEL-06's
 * SHIPPING surface is the SDK layer: the `workspace.parallel.dispatch` CLI
 * bridge (`sdk/src/query/workspace-parallel-dispatch.ts`) must PARSE
 * `--max-concurrency` and THREAD it into the adapter's
 * `dispatch({ ..., maxConcurrency })` call.
 *
 * This file isolates the argv→opts plumbing assertion. `vi.mock` replaces the
 * `../index.js` module the handler imports (`createVcsAdapter`) with a fake
 * whose `dispatch` records the `opts` it received — so the assertions observe
 * the EXACT field value the bridge forwards. No jj/git subprocess; fully
 * deterministic. The live-adapter half of PARALLEL-06 (the field is accepted
 * advisory without breaking dispatch) lives in the sibling file
 * `cmd-parallel-max-concurrency-adapter.test.ts`, which carries no `vi.mock`.
 *
 * Why `vi.mock` is the only way to assert this: `maxConcurrency` is advisory
 * (types.ts:458-468 — "backends MAY ignore"), so it has NO observable
 * side-effect on the dispatched workspace set. The only place its VALUE is
 * observable is the adapter-call boundary itself.
 */

import { describe, it, expect, vi } from 'vitest';

// Records every `ParallelDispatchOpts` the handler forwards to the adapter.
const recordedDispatchOpts: Array<{ maxConcurrency?: number }> = [];

// `vi.mock` is hoisted to the top of the module. The path is resolved relative
// to THIS test file: `src/vcs/__tests__/` + `../index.js` → `src/vcs/index.js`,
// which is exactly the module `src/query/workspace-parallel-dispatch.ts`
// imports via its own `../vcs/index.js` specifier.
vi.mock('../index.js', () => ({
	createVcsAdapter: () => ({
		workspace: {
			parallel: {
				dispatch: (opts: { maxConcurrency?: number }) => {
					recordedDispatchOpts.push(opts);
					return Object.freeze({
						phaseRoot: '/tmp/fake-phase',
						phaseNumber: 11,
						mainBookmark: 'main',
						manifest: '',
						workspaces: Object.freeze([]),
					});
				},
			},
		},
	}),
}));

describe('PARALLEL-06 — workspace.parallel.dispatch CLI threads --max-concurrency', () => {
	it('passes the parsed --max-concurrency value into ParallelDispatchOpts.maxConcurrency', async () => {
		recordedDispatchOpts.length = 0;
		const { workspaceParallelDispatchQuery } = await import(
			'../../query/workspace-parallel-dispatch.js'
		);
		const plan = JSON.stringify([
			{ agentId: 'agent-1', planId: 'plan-1' },
			{ agentId: 'agent-2', planId: 'plan-2' },
		]);
		const res = await workspaceParallelDispatchQuery(
			[
				'--phase',
				'11',
				'--main-bookmark',
				'main',
				'--plan',
				plan,
				'--max-concurrency',
				'2',
			],
			'/tmp/irrelevant-cwd',
		);
		// The handler must have reached the adapter (not bailed on a
		// missing-flag guard).
		expect(recordedDispatchOpts.length).toBe(1);
		// The load-bearing PARALLEL-06 plumbing assertion: the parsed flag
		// value must arrive on `ParallelDispatchOpts.maxConcurrency`. A handler
		// that dropped `--max-concurrency` would leave the field `undefined`.
		expect(recordedDispatchOpts[0].maxConcurrency).toBe(2);
		// Sanity: the bridge returns the handle (the `{ data: handle }` path),
		// not a `{ ok: false, reason }` envelope.
		const data = res.data as { ok?: boolean; workspaces?: unknown };
		expect(data.ok).toBeUndefined();
		expect(Array.isArray(data.workspaces)).toBe(true);
	});

	it('parses --max-concurrency as a number, not a string (Number() coercion)', async () => {
		recordedDispatchOpts.length = 0;
		const { workspaceParallelDispatchQuery } = await import(
			'../../query/workspace-parallel-dispatch.js'
		);
		const plan = JSON.stringify([{ agentId: 'agent-1', planId: 'plan-1' }]);
		await workspaceParallelDispatchQuery(
			[
				'--phase',
				'11',
				'--main-bookmark',
				'main',
				'--plan',
				plan,
				'--max-concurrency',
				'4',
			],
			'/tmp/irrelevant-cwd',
		);
		expect(recordedDispatchOpts.length).toBe(1);
		// argv tokens are strings; the bridge must coerce so the adapter
		// receives a numeric cap, not "4".
		expect(typeof recordedDispatchOpts[0].maxConcurrency).toBe('number');
		expect(recordedDispatchOpts[0].maxConcurrency).toBe(4);
	});

	it('forwards maxConcurrency: undefined when --max-concurrency is absent (D-07 default-undefined contract)', async () => {
		recordedDispatchOpts.length = 0;
		const { workspaceParallelDispatchQuery } = await import(
			'../../query/workspace-parallel-dispatch.js'
		);
		const plan = JSON.stringify([{ agentId: 'agent-1', planId: 'plan-1' }]);
		await workspaceParallelDispatchQuery(
			['--phase', '11', '--main-bookmark', 'main', '--plan', plan],
			'/tmp/irrelevant-cwd',
		);
		expect(recordedDispatchOpts.length).toBe(1);
		// D-07: workflow call sites pass nothing → the bridge must forward
		// `undefined`, not a hardcoded cap. A bridge that defaulted to a
		// concrete number would change runtime scheduling silently.
		expect(recordedDispatchOpts[0].maxConcurrency).toBeUndefined();
	});
});
