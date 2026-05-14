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
 */

import { createVcsAdapter } from '../vcs/index.js';
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
  const result = vcs.diff({
    staged,
    nameOnly,
    nameStatus,
    rev: range as unknown as RevisionExpr | undefined,
    paths: paths.length > 0 ? paths : undefined,
  });

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
