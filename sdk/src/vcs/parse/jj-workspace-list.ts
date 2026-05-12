/**
 * SDK-local NDJSON parser for `jj workspace list -T 'json(self) ++ "\n"'`.
 *
 * Phase 3: parser body lands here in plan 03-01. Phase 4 owns the
 * single-vs-multi workspace semantics — Phase 3's `vcs.workspace.list()`
 * returns the one-element-for-default-workspace case.
 *
 * Field shapes per 03-RESEARCH.md §"jj workspace list -T 'json(self) ++ \"\\n\"'".
 * Open Question Q3: jj's JSON `name` is the workspace name (e.g.,
 * `"default"`), not a filesystem path. The adapter sets `path = name` for
 * the single-default-workspace case; Phase 4 reshapes when multi-workspace
 * lands.
 */

import type { WorkspaceInfo } from '../types.js';

export function parseJjWorkspaceList(raw: string): WorkspaceInfo[] {
  if (!raw) return [];
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line): WorkspaceInfo => {
      const r = JSON.parse(line);
      return {
        path: r.name ?? '',
        rev: r.target?.commit_id ?? '',
        locked: false, // PITFALL 4: jj has no lock primitive.
      };
    });
}
