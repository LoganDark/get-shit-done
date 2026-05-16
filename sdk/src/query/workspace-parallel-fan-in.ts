/**
 * sdk/src/query/workspace-parallel-fan-in.ts — Phase 11 plan 02 Task 2b
 *
 * CLI bridge for `vcs.workspace.parallel.fanIn`. Per Phase 11 D-01 the
 * orchestrator passes the Handle JSON + per-agent results JSON via stdin or
 * file flags — no manifest file on disk between dispatch and fan-in.
 *
 * Flags:
 *   --cwd <path>        optional; defaults to projectDir
 *   --handle <input>    required: ParallelDispatchHandle as JSON.
 *                       "@-"       → read from stdin
 *                       "@<path>"  → read from file
 *                       (no inline string form — per RESEARCH Open Q2 RESOLVED)
 *   --results <input>   ParallelAgentResult[] as JSON.
 *                       "@-"       → read from stdin
 *                       "@<path>"  → read from file
 *                       Default (flag omitted): read from stdin — but this
 *                       only works when --handle is in file form ("@<path>"),
 *                       since both inputs cannot simultaneously default to
 *                       stdin. When --handle is "@-", --results must be in
 *                       file form ("@<path>").
 *
 * Returns the `FanInResult` JSON via `{ data: fanInResult }` (flat envelope,
 * mirrors head-ref / workspace.parallel.dispatch).
 *
 * Per D-01 the adapter's `fanIn` body handles workspace iteration internally;
 * this CLI bridge does NOT need to filter against `vcs.workspace.list()` —
 * the Handle's `workspaces[]` array IS the workspace set.
 *
 * Usage:
 *   gsd-sdk query workspace.parallel.fan-in --handle @handle.json --results @-  < results.json
 *   gsd-sdk query workspace.parallel.fan-in --handle @- --results @results.json < handle.json
 */

import { readFileSync } from 'node:fs';
import { createVcsAdapter } from '../vcs/index.js';
import type {
  ParallelAgentResult,
  ParallelDispatchHandle,
} from '../vcs/types.js';
import type { QueryHandler } from './utils.js';

function resolveFileOrStdin(raw: string): string {
  if (raw === '@-') {
    return readFileSync(0, 'utf-8');
  }
  if (raw.startsWith('@')) {
    return readFileSync(raw.slice(1), 'utf-8');
  }
  // Per RESEARCH Open Q2 (RESOLVED: NO inline) we reject inline form. Surface
  // the raw string as an error path so callers learn the file-or-stdin contract.
  throw new Error(
    `expected @<path> or @- but got inline string (inline JSON form is not accepted)`,
  );
}

export const workspaceParallelFanInQuery: QueryHandler = async (args, projectDir) => {
  let cwd = projectDir;
  let handleRaw: string | undefined;
  let resultsRaw: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) {
      cwd = args[++i];
    } else if (args[i] === '--handle' && args[i + 1]) {
      handleRaw = args[++i];
    } else if (args[i] === '--results' && args[i + 1]) {
      resultsRaw = args[++i];
    }
  }

  if (handleRaw === undefined) {
    return { data: { ok: false, reason: 'handle_required' } };
  }

  // Disambiguation: both inputs cannot default to stdin. If --results is
  // omitted, default to stdin only when --handle is file-form. If --handle is
  // "@-" (stdin), --results must be explicit and file-form.
  if (resultsRaw === undefined) {
    if (handleRaw === '@-') {
      return {
        data: {
          ok: false,
          reason: 'results_required_when_handle_is_stdin',
        },
      };
    }
    resultsRaw = '@-';
  } else if (handleRaw === '@-' && resultsRaw === '@-') {
    return {
      data: { ok: false, reason: 'handle_and_results_cannot_both_be_stdin' },
    };
  }

  let handle: ParallelDispatchHandle;
  try {
    const handleText = resolveFileOrStdin(handleRaw);
    handle = JSON.parse(handleText);
  } catch (err) {
    return {
      data: {
        ok: false,
        reason: 'handle_json_parse_failed',
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }

  let results: readonly ParallelAgentResult[];
  try {
    const resultsText = resolveFileOrStdin(resultsRaw);
    results = JSON.parse(resultsText);
  } catch (err) {
    return {
      data: {
        ok: false,
        reason: 'results_json_parse_failed',
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }

  const vcs = createVcsAdapter(cwd);
  const fanInResult = vcs.workspace.parallel.fanIn(handle, results);

  return { data: fanInResult };
};
