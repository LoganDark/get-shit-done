/**
 * sdk/src/query/diff.ts — Phase 5 plan 05-01 Task 2 (D-33 batch 1)
 *
 * SDK query bridge for `git diff` / `jj diff`. Read-only. Returns structured
 * DiffResult ({ raw, nameOnly, nameStatus? }).
 *
 * `--cached` is mapped to `DiffOpts.staged` (the contract field's name).
 * `--quiet` is parsed but unused — DiffOpts has no quiet field; callers
 * inspect `result.raw.length === 0` to detect "no diff".
 *
 * Trailing positionals after `--` go to `paths` (mirrors commit.ts `--files`
 * separator convention).
 *
 * Usage:
 *   gsd-sdk query diff --range HEAD~1..HEAD
 *   gsd-sdk query diff --cached --name-only
 *   gsd-sdk query diff --name-status -- file1 file2
 *
 * Phase 5 plan 05-06 Task 2 (CR-02 fix): the raw `--range` argv flows through
 * `parseRangeArg` (shared with log.ts) before being handed to the adapter —
 * D-12 forbids `expr.raw()`. Malformed input surfaces as a typed error
 * envelope instead of throwing through the dispatch boundary.
 */

import { createVcsAdapter } from '../vcs/index.js';
import { parseRangeArg } from './log.js';
import type { QueryHandler } from './utils.js';
import type { RevisionExpr } from '../vcs/types.js';

export const diffQuery: QueryHandler = async (args, projectDir) => {
  let cwd = projectDir;
  let range: string | undefined;
  let nameOnly = false;
  let nameStatus = false;
  let staged = false;
  const paths: string[] = [];

  let inPaths = false;
  for (let i = 0; i < args.length; i++) {
    if (inPaths) {
      paths.push(args[i]);
      continue;
    }
    if (args[i] === '--') {
      inPaths = true;
    } else if (args[i] === '--cwd' && args[i + 1]) {
      cwd = args[i + 1];
      i++;
    } else if (args[i] === '--range' && args[i + 1]) {
      range = args[i + 1];
      i++;
    } else if (args[i] === '--name-only') {
      nameOnly = true;
    } else if (args[i] === '--name-status') {
      nameStatus = true;
    } else if (args[i] === '--cached') {
      staged = true;
    } else if (args[i] === '--quiet') {
      // Parsed but unused; DiffOpts contract has no quiet field.
    }
  }

  const vcs = createVcsAdapter(cwd);

  let rev: RevisionExpr | undefined;
  if (range !== undefined) {
    try {
      rev = parseRangeArg(range, vcs);
    } catch (err) {
      return {
        data: {
          ok: false,
          error: (err as Error).message,
          range,
        },
      };
    }
  }

  let result;
  try {
    result = vcs.diff({
      staged,
      nameOnly,
      nameStatus,
      rev,
      paths: paths.length > 0 ? paths : undefined,
    });
  } catch (err) {
    return {
      data: {
        ok: false,
        error: (err as Error).message,
        range,
      },
    };
  }

  return {
    data: {
      ok: true,
      raw: result.raw,
      nameOnly: result.nameOnly,
      nameStatus: result.nameStatus,
      range,
      staged,
    },
  };
};
