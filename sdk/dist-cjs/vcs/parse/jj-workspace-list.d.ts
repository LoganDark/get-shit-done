/**
 * SDK-local NDJSON parser for `jj workspace list -T 'json(self) ++ "\n"'`.
 *
 * Phase 3: parser landed in plan 03-01; production-hardened in plan 03-02.
 * Phase 4 owns the single-vs-multi workspace semantics — Phase 3's
 * `vcs.workspace.list()` returns the one-element-for-default-workspace
 * case via this parser.
 *
 * Field shapes per 03-RESEARCH.md §"jj workspace list -T 'json(self) ++ \"\\n\"'".
 * Pinned by tests/fixtures/jj-ndjson/jj-workspace-list-default.ndjson + snapshot test.
 *
 * Phase 8 D-05 unified contract: `WorkspaceInfo.rev` carries the active
 * backend's canonical revision identifier — `change_id` on jj. The NDJSON
 * template's `target.change_id` is the source of truth (probed green per
 * .planning/intel/jj-041-ndjson-probe.md).
 *
 * Open Question Q3: jj's JSON `name` is the workspace name (e.g.,
 * `"default"`), not a filesystem path. The adapter sets `path = name` for
 * the single-default-workspace case; Phase 4 reshapes when multi-workspace
 * lands.
 *
 * PITFALL 4 (03-RESEARCH.md): jj has no lock primitive — `locked` is
 * always `false`.
 *
 * Tampering threat (T-03.02-01): malformed NDJSON lines throw a typed
 * error rather than skip silently.
 */
import type { WorkspaceInfo } from '../types.js';
export declare function parseJjWorkspaceList(raw: string): WorkspaceInfo[];
//# sourceMappingURL=jj-workspace-list.d.ts.map