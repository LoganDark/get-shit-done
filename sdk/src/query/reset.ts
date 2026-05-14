/**
 * sdk/src/query/reset.ts — Phase 5 plan 05-01 Task 2 (D-33 batch 1)
 *
 * SDK query bridge for `git reset --<mode> <ref>`. Git-only escape hatch.
 * On the jj backend this verb returns a typed error — jj has no equivalent
 * primitive (jj's destructive-undo path is `gsd-sdk query revert` →
 * `jj abandon`, per 05-RESEARCH.md Pitfall 6).
 *
 * Usage:
 *   gsd-sdk query reset --ref HEAD~1 --mode hard
 *   gsd-sdk query reset --ref HEAD --mode soft --cwd /path
 */

import { createVcsAdapter } from '../vcs/index.js';
import type { QueryHandler } from './utils.js';

const VALID_MODES = ['soft', 'mixed', 'hard'] as const;
type ResetMode = (typeof VALID_MODES)[number];

function isResetMode(s: string): s is ResetMode {
  return (VALID_MODES as readonly string[]).includes(s);
}

export const resetQuery: QueryHandler = async (args, projectDir) => {
  let cwd = projectDir;
  let ref: string | undefined;
  let mode: ResetMode | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) {
      cwd = args[i + 1];
      i++;
    } else if (args[i] === '--ref' && args[i + 1]) {
      ref = args[i + 1];
      i++;
    } else if (args[i] === '--mode' && args[i + 1]) {
      const m = args[i + 1];
      if (!isResetMode(m)) {
        return {
          data: {
            ok: false,
            error: `reset: invalid --mode '${m}'. Valid: ${VALID_MODES.join(', ')}`,
          },
        };
      }
      mode = m;
      i++;
    }
  }

  if (!ref) {
    return { data: { ok: false, error: 'reset: --ref <rev> is required' } };
  }
  if (!mode) {
    return { data: { ok: false, error: 'reset: --mode <soft|mixed|hard> is required' } };
  }

  const vcs = createVcsAdapter(cwd);
  if (vcs.kind !== 'git') {
    return {
      data: {
        ok: false,
        error:
          'reset: not supported on jj backend; use `gsd-sdk query revert` for per-commit destructive undo',
      },
    };
  }

  const result = vcs.gitOnly.reset({ ref, mode });
  return {
    data: {
      ok: result.exitCode === 0,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      ref,
      mode,
    },
  };
};
