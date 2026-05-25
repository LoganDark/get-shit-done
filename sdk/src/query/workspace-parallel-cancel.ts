/**
 * sdk/src/query/workspace-parallel-cancel.ts — Phase 15.04 (PARALLEL-07)
 *
 * CLI bridge for `vcs.workspace.parallel.cancel`. Mirrors the shape of
 * `workspace-parallel-fan-in.ts` verbatim — Handle JSON via stdin or file
 * flag; no inline form (per the fan-in precedent's RESEARCH Open Q2
 * RESOLVED: NO inline).
 *
 * Flags:
 *   --cwd <path>        optional; defaults to projectDir
 *   --handle <input>    required: ParallelDispatchHandle as JSON.
 *                       "@-"       → read from stdin
 *                       "@<path>"  → read from file
 *                       (inline JSON form is rejected with a structured
 *                       error envelope — mirrors fan-in)
 *
 * Returns the `CancelResult` JSON via `{ data: cancelResult }` (flat
 * envelope, mirrors `workspace.parallel.fan-in`).
 *
 * Three-site registration (CF-07 / Pitfall 6 — missing any one site breaks
 * runtime verb resolution): the export is wired at all three of
 * `sdk/src/query/command-static-catalog-domain.ts`,
 * `sdk/src/query/command-manifest.non-family.ts`,
 * `sdk/src/query/command-aliases.generated.ts`. The repo-side smoke at
 * `tests/cli-workspace-parallel-cancel.test.cjs` proves end-to-end
 * resolution via the no-handle test (canonical dot form) + the space-alias
 * test + the bogus-verb negative control.
 *
 * Usage:
 *   gsd-sdk query workspace.parallel.cancel --handle @handle.json
 *   gsd-sdk query workspace.parallel.cancel --handle @-  < handle.json
 */

import { readFileSync } from 'node:fs';
import { createVcsAdapter } from '../vcs/index.js';
import type { ParallelDispatchHandle } from '../vcs/types.js';
import type { QueryHandler } from './utils.js';

function resolveFileOrStdin(raw: string): string {
  if (raw === '@-') {
    return readFileSync(0, 'utf-8');
  }
  if (raw.startsWith('@')) {
    return readFileSync(raw.slice(1), 'utf-8');
  }
  // Per the fan-in bridge's RESEARCH Open Q2 (RESOLVED: NO inline) we
  // reject inline form. Surface the raw string as an error path so callers
  // learn the file-or-stdin contract.
  throw new Error(
    `expected @<path> or @- but got inline string (inline JSON form is not accepted)`,
  );
}

export const workspaceParallelCancelQuery: QueryHandler = async (args, projectDir) => {
  let cwd = projectDir;
  let handleRaw: string | undefined;

  // Phase 16 REVIEW WR-03: argv loop uses `i + 1 < args.length` rather than
  // `args[i + 1]` truthiness. Pre-fix the empty string '' was treated as
  // missing (falsy), so `--handle ''` and `--cwd ''` silently fell through
  // to the absent-flag envelope rather than surfacing a more precise error.
  // After the fix, empty-string values are routed to the downstream
  // validator (e.g. `handle_json_parse_failed` for an empty handle).
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && i + 1 < args.length) {
      cwd = args[++i];
    } else if (args[i] === '--handle' && i + 1 < args.length) {
      handleRaw = args[++i];
    }
  }

  if (handleRaw === undefined) {
    return { data: { ok: false, reason: 'handle_required' } };
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

  const vcs = createVcsAdapter(cwd);
  const cancelResult = vcs.workspace.parallel.cancel(handle);

  return { data: cancelResult };
};
