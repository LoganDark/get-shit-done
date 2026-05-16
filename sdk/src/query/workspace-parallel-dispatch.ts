/**
 * sdk/src/query/workspace-parallel-dispatch.ts — Phase 11 plan 02 Task 2a
 *
 * CLI bridge for `vcs.workspace.parallel.dispatch`. Per Phase 11 D-01 the
 * orchestrator holds the `ParallelDispatchHandle` JSON in a shell variable
 * only — no manifest file on disk. This handler prints the frozen Handle JSON
 * to stdout for the orchestrator to capture and iterate via `jq`.
 *
 * Flags:
 *   --cwd <path>             optional; defaults to projectDir
 *   --phase <number>         required: phase number
 *   --main-bookmark <name>   required: main bookmark name
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
 *     --phase 11 --main-bookmark trunk --plan @-  < plan.json
 */

import { readFileSync } from 'node:fs';
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
  let mainBookmark = '';
  let planRaw: string | undefined;
  let maxConcurrency: number | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) {
      cwd = args[++i];
    } else if (args[i] === '--phase' && args[i + 1]) {
      phaseNumber = Number(args[++i]);
    } else if (args[i] === '--main-bookmark' && args[i + 1]) {
      mainBookmark = args[++i];
    } else if (args[i] === '--plan' && args[i + 1]) {
      planRaw = args[++i];
    } else if (args[i] === '--max-concurrency' && args[i + 1]) {
      maxConcurrency = Number(args[++i]);
    }
  }

  if (phaseNumber === undefined || Number.isNaN(phaseNumber)) {
    return { data: { ok: false, reason: 'phase_number_required' } };
  }
  if (!mainBookmark) {
    return { data: { ok: false, reason: 'main_bookmark_required' } };
  }
  if (planRaw === undefined) {
    return { data: { ok: false, reason: 'plan_required' } };
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
    mainBookmark,
    plan,
    maxConcurrency,
  });

  return { data: handle };
};
