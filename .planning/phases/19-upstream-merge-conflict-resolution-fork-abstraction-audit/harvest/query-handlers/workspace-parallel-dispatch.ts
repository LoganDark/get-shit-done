/**
 * sdk/src/query/workspace-parallel-dispatch.ts — Phase 11 plan 02 Task 2a
 * (Phase 14.1 PARALLEL-08: --main-bookmark flag now optional repeated-singular)
 *
 * CLI bridge for `vcs.workspace.parallel.dispatch`. Per Phase 11 D-01 the
 * orchestrator holds the `ParallelDispatchHandle` JSON in a shell variable
 * only — no manifest file on disk. This handler prints the frozen Handle JSON
 * to stdout for the orchestrator to capture and iterate via `jq`.
 *
 * Flags:
 *   --cwd <path>             optional; defaults to projectDir
 *   --phase <number>         required: phase number
 *   --main-bookmark <name>   OPTIONAL, REPEATABLE: zero or more bookmark/branch
 *                            names to advance after fan-in. Zero flags → empty
 *                            `mainBookmarks` list → fan-in skips the advance
 *                            step entirely (bookmark-less jj `@` and
 *                            detached-HEAD git working copies are first-class).
 *                            Each repeat appends to an argv-order list; no
 *                            de-dup. Idiom precedent: `gh pr create --label foo
 *                            --label bar`, `git -c k=v -c k=v`. PARALLEL-08 /
 *                            Phase 14.1 D-02.
 *   --plan <input>           required: plan items as JSON.
 *                            "@-"  → read from stdin
 *                            "@<path>" → read from file
 *                            otherwise → inline JSON string
 *   --max-concurrency <n>    optional (Phase 11 D-07: workflow sites pass undefined)
 *
 * Returns frozen `ParallelDispatchHandle` JSON via `{ data: handle }` so the
 * shell consumer accesses `.workspaces[]` directly (mirrors head-ref's flat
 * envelope, not worktree.cleanup-wave's wrapper).
 *
 * Usage:
 *   gsd-sdk query workspace.parallel.dispatch \
 *     --phase 11 --plan @-  < plan.json                       # no advance
 *   gsd-sdk query workspace.parallel.dispatch \
 *     --phase 11 --main-bookmark trunk --plan @-  < plan.json # advance 1
 *   gsd-sdk query workspace.parallel.dispatch \
 *     --phase 11 --main-bookmark trunk --main-bookmark release --plan @-  < plan.json
 */

import { readFileSync } from 'node:fs';
import { loadConfig } from '../config.js';
import { createVcsAdapter } from '../vcs/index.js';
import type { QueryHandler } from './utils.js';

function resolvePlanInput(raw: string): string {
  if (raw === '@-') {
    return readFileSync(0, 'utf-8');
  }
  if (raw.startsWith('@')) {
    return readFileSync(raw.slice(1), 'utf-8');
  }
  return raw;
}

export const workspaceParallelDispatchQuery: QueryHandler = async (args, projectDir) => {
  let cwd = projectDir;
  let phaseNumber: number | undefined;
  // Phase 14.1 (PARALLEL-08, D-02): repeated-singular --main-bookmark accumulator.
  // Const because we push into the mutable array; preserves argv order; no dedup.
  const mainBookmarks: string[] = [];
  let planRaw: string | undefined;
  let maxConcurrency: number | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) {
      cwd = args[++i];
    } else if (args[i] === '--phase' && args[i + 1]) {
      phaseNumber = Number(args[++i]);
    } else if (args[i] === '--main-bookmark' && args[i + 1]) {
      mainBookmarks.push(args[++i]);
    } else if (args[i] === '--plan' && args[i + 1]) {
      planRaw = args[++i];
    } else if (args[i] === '--max-concurrency' && args[i + 1]) {
      maxConcurrency = Number(args[++i]);
    }
  }

  if (phaseNumber === undefined || Number.isNaN(phaseNumber)) {
    return { data: { ok: false, reason: 'phase_number_required' } };
  }
  // Phase 14.1 (PARALLEL-08, D-02): the `main_bookmark_required` envelope path
  // is DELETED. Empty list is now legal — bookmark-less first-class. Every
  // OTHER envelope reason token stays unchanged.
  if (planRaw === undefined) {
    return { data: { ok: false, reason: 'plan_required' } };
  }

  const config = await loadConfig(cwd);
  if (config.parallelization === false) {
    return {
      data: {
        ok: false,
        reason: 'parallelization_disabled',
        message:
          'Parallelization is disabled in .planning/config.json. ' +
          'Set `parallelization: true`, or remove the explicit `false` ' +
          'entry to fall back to the default (true).',
      },
    };
  }

  let plan: readonly { agentId: string; planId: string; workspacePath?: string }[];
  try {
    const planText = resolvePlanInput(planRaw);
    plan = JSON.parse(planText);
  } catch (err) {
    return {
      data: {
        ok: false,
        reason: 'plan_json_parse_failed',
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }

  const vcs = createVcsAdapter(cwd);
  const handle = vcs.workspace.parallel.dispatch({
    phaseNumber,
    mainBookmarks,
    plan,
    maxConcurrency,
  });

  return { data: handle };
};
