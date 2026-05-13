/**
 * sdk/src/query/hooks.ts — Phase 4 plan 06 D-08
 *
 * SDK query bridge for explicit-fire hook callers. Workflow markdown rewrites
 * (Phase 5 PROMPT-*) replace `git hook run pre-commit` invocations in
 * execute-phase.md:689 with `gsd-sdk query hooks.fire pre-commit` calls. This
 * keeps the cross-backend explicit-fire path symmetric and routes through the
 * adapter's exported fireHook helper (visibility flipped in Phase 4 plan 01
 * per D-07).
 *
 * Open Q2 (RESEARCH): --cwd flag accepted, defaulting to projectDir.
 *
 * Usage:
 *   gsd-sdk query hooks.fire pre-commit              # fires at projectDir
 *   gsd-sdk query hooks.fire pre-commit --cwd /path  # fires at explicit cwd
 *   gsd-sdk query hooks.fire pre-push --cwd .
 *
 * HOOK-05 v1 stability: the underlying fireHook signature is
 * (cwd, stage, ctx?). This SDK bridge intentionally does NOT pass ctx — the
 * Tier-2 PATH-shim wrapper deferred to v2 can layer ctx population on top
 * without breaking the v1 interface (signature stable).
 */

import { fireHook } from '../vcs/hook-bridge.js';
import type { HookStage } from '../vcs/types.js';
import type { QueryHandler } from './utils.js';

const VALID_STAGES: readonly HookStage[] = ['pre-commit', 'pre-push'];

function isHookStage(s: string): s is HookStage {
  return (VALID_STAGES as readonly string[]).includes(s);
}

/**
 * Query handler for `gsd-sdk query hooks.fire <stage> [--cwd <path>]`.
 *
 * Returns a QueryResult<{stage, cwd, exitCode, stdout, stderr, ok}>. The `ok`
 * field is true when the hook returned exit 0 (or the hook file is absent —
 * fireHook treats absence as success per hook-bridge.ts:23).
 */
export const fireHookQuery: QueryHandler = async (args, projectDir) => {
  const stage = args[0];
  if (!stage) {
    return {
      data: {
        ok: false,
        error: 'hooks.fire requires a stage argument: pre-commit or pre-push',
      },
    };
  }
  if (!isHookStage(stage)) {
    return {
      data: {
        ok: false,
        error: `hooks.fire: invalid stage '${stage}'. Valid: ${VALID_STAGES.join(', ')}`,
      },
    };
  }
  // --cwd flag handling (Open Q2 / D-08): subsequent positionals scanned for
  // `--cwd <path>`. Defaults to projectDir (the SDK-supplied caller cwd).
  let cwd = projectDir;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) {
      cwd = args[i + 1];
      i++;
    }
  }

  const result = fireHook(cwd, stage);
  return {
    data: {
      stage,
      cwd,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      ok: result.exitCode === 0,
    },
  };
};
