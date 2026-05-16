---
phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd
plan: 02
subsystem: sdk
tags: [sdk, cli-bridge, workspace, parallel, assert-dispatched-cwd, vcs-20]

# Dependency graph
requires:
  - phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd/11-01
    provides: bookmark-free jj-side dispatch + fanIn body; workspace-SET source-of-truth idiom
  - phase: 09-jj-side-parallel-verbs
    provides: VcsWorkspaceParallel.dispatch / fanIn type contracts; ParallelDispatchHandle frozen-JSON shape
  - phase: 10-git-side-parallel-verbs-classifier-extension
    provides: cross-backend FanInResult uniform shape; git-side parallel verbs
provides:
  - workspace.assert-dispatched-cwd SDK verb (VCS-20) — minimal-predicate flat shape
  - workspace.parallel.dispatch CLI bridge (no manifest file; Handle JSON to stdout per D-01)
  - workspace.parallel.fan-in CLI bridge (Handle + results via stdin/@file; FanInResult JSON to stdout)
  - 6 catalog rows + 3 manifest rows wiring the new verbs through gsd-sdk query
affects: [11-03, 11-04, 11-05, 11-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Thin CLI-bridge handlers mirror head-ref.ts shape exactly; multi-flag plumbing extends the single-flag loop"
    - "Stdin/@file input resolver: '@-' → fs.readFileSync(0,'utf-8'); '@<path>' → fs.readFileSync(path); inline rejected on fan-in"
    - "Flat JSON envelope { data: <object> } at handler return so shell consumers read top-level fields via jq"
    - "Convention: vcs.workspace.list()[0] is the primary workspace on both backends (git: main worktree first; jj: 'default' first)"
    - "Defensive JSON parse failures surface as { ok: false, reason: '<input>_json_parse_failed', error } rather than uncaught throws"
    - "Emit null (not undefined) for absent optional fields so JSON.stringify preserves the key/value shape"

key-files:
  created:
    - sdk/src/query/workspace-assert-dispatched-cwd.ts
    - sdk/src/query/workspace-parallel-dispatch.ts
    - sdk/src/query/workspace-parallel-fan-in.ts
  modified:
    - sdk/src/query/command-static-catalog-domain.ts
    - sdk/src/query/command-manifest.non-family.ts
    - sdk/src/query/command-aliases.generated.ts
    - get-shit-done/bin/lib/command-aliases.generated.cjs

key-decisions:
  - "workspace.assert-dispatched-cwd uses list()[0] === primary convention rather than calling vcs.workspace.context() — context() returns effectiveRoot but not the matched WorkspaceInfo entry, so the verb still needs list() either way; using list()[0] as the primary index keeps the body to a single adapter call"
  - "Emit `null` (not `undefined`) for absent workspaceName/workspacePath fields so the JSON envelope carries the keys explicitly (JSON.stringify drops undefined keys, which would have produced inconsistent envelope shape)"
  - "Stdin/@file resolver inlined per file (no shared helper) — each of the 3 handlers has a different input-flag count and disambiguation rule; sharing would have added abstraction without payoff"
  - "Fan-in disambiguates dual-stdin: --results defaults to stdin only when --handle is @<path> file-form; if both are @- the handler returns { ok: false, reason: 'handle_and_results_cannot_both_be_stdin' }"
  - "Fan-in rejects inline JSON form for both --handle and --results (only @- or @<path>); inline strings would require argv-size limits and shell-escaping discipline that orchestrator scripts cannot guarantee for ParallelDispatchHandle objects"
  - "Regenerated command-aliases.generated.{ts,cjs} via scripts/gen-command-aliases.ts to keep the alias-drift CI guard happy"

patterns-established:
  - "Phase 11 D-01: Handle JSON flows through stdin/file flags only — no orchestrator-managed manifest files on disk. CLI bridges honor this by printing/reading JSON to/from stdout/stdin."
  - "Phase 11 D-03: workspace.assert-dispatched-cwd minimal-predicate shape ({ ok, workspaceName, workspacePath, isPrimary }) is the SDK contract that the 4 agent-side guards collapse against in Plan 11-04."

requirements-completed: [VCS-20]

# Metrics
duration: 10min
completed: 2026-05-16
---

# Phase 11 Plan 02: workspace verbs CLI surface Summary

**Ship the new VCS-20 `workspace.assert-dispatched-cwd` SDK verb plus CLI bridges for the existing Phase 9/10 `vcs.workspace.parallel.{dispatch,fanIn}` adapter verbs — three thin handlers mirroring `head-ref.ts`'s shape, registered through both the static catalog and the non-family manifest, surfaced through `gsd-sdk query` with `mutation` and `outputMode: 'json'` set correctly.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-16T10:42:00Z (approximate)
- **Completed:** 2026-05-16T10:52:15Z
- **Tasks:** 4 (1 + 2a + 2b + 3)
- **Files created:** 3
- **Files modified:** 4

## Accomplishments

- Shipped `sdk/src/query/workspace-assert-dispatched-cwd.ts` (VCS-20) implementing the D-03 minimal-predicate shape: flat `{ ok, workspaceName, workspacePath, isPrimary }`. Body uses `vcs.workspace.list()` only; list()[0] is the primary by both-backend convention. No HEAD-namespace regex, no protected-ref deny-list, no abs-path predicate, no base-stability assertion — the four worktree-aware guards in `gsd-executor.md` will collapse against this single verb in Plan 11-04.
- Shipped `sdk/src/query/workspace-parallel-dispatch.ts` (CLI bridge) — thin wrapper invoking `vcs.workspace.parallel.dispatch`. Flags: `--cwd`, `--phase`, `--main-bookmark`, `--plan` (with `@-`/`@<path>`/inline resolution), `--max-concurrency`. Returns `{ data: handle }` so shell consumers iterate `.workspaces[]` directly per D-01 (no manifest file on disk at this layer).
- Shipped `sdk/src/query/workspace-parallel-fan-in.ts` (CLI bridge) — thin wrapper invoking `vcs.workspace.parallel.fanIn`. Flags: `--cwd`, `--handle`, `--results` (file-or-stdin only; no inline JSON form per RESEARCH Open Q2 RESOLVED). Disambiguation: `--results` defaults to stdin only when `--handle` is file-form; both-stdin returns defensive `{ ok: false, reason: 'handle_and_results_cannot_both_be_stdin' }`.
- Wired the three handlers through `sdk/src/query/command-static-catalog-domain.ts` (6 catalog rows — 3 verbs × dot/space forms) and `sdk/src/query/command-manifest.non-family.ts` (3 manifest rows: `assert-dispatched-cwd` mutation:false; `dispatch` and `fan-in` mutation:true; all `outputMode: 'json'`).
- Regenerated `sdk/src/query/command-aliases.generated.ts` + `get-shit-done/bin/lib/command-aliases.generated.cjs` via `scripts/gen-command-aliases.ts` so the alias-drift CI guard stays green.
- Verified end-to-end smoke: `gsd-sdk query workspace.assert-dispatched-cwd --cwd .` returns `{ "ok": false, "workspaceName": null, "workspacePath": null, "isPrimary": false }` (correct shape — current cwd is the main jj repo, jj's WorkspaceInfo.path is a workspace name not an fs path, so realpath compare doesn't match — exactly the documented backend asymmetry). Both `workspace.parallel.dispatch` and `workspace.parallel.fan-in` dispatch correctly and surface their defensive missing-flag responses.

## Return Shapes Settled

### `workspace.assert-dispatched-cwd` (D-03 verbatim)

```json
{
  "ok": boolean,
  "workspaceName": string | null,
  "workspacePath": string | null,
  "isPrimary": boolean
}
```

Semantics:
- `ok` is `true` iff cwd resolves to a workspace AND that workspace is NOT the primary.
- `workspaceName` / `workspacePath` carry the matched `WorkspaceInfo.path` (which on jj is the workspace NAME, on git is an fs path — documented backend asymmetry).
- `isPrimary` is `true` if cwd matched list()[0]; `false` otherwise (including no-match).
- `null` (not `undefined`) on the no-match branch so the JSON envelope shape is stable.

### `workspace.parallel.dispatch` Handle JSON

`{ data: ParallelDispatchHandle }` — the Handle is the frozen pure-JSON shape from Phase 9; shell consumer reads `.workspaces[]`, `.phaseRoot`, `.mainBookmark`, etc. directly.

### `workspace.parallel.fan-in` flag set

- `--handle <input>` (required): `@-` (stdin) or `@<path>` (file). No inline JSON.
- `--results <input>` (optional): `@-` (stdin) or `@<path>` (file). Defaults to stdin when `--handle` is file-form. No inline JSON.
- Both-stdin (`--handle @- --results @-`) returns `{ ok: false, reason: 'handle_and_results_cannot_both_be_stdin' }`.
- `--handle @-` with no `--results` returns `{ ok: false, reason: 'results_required_when_handle_is_stdin' }`.

## Task Commits

Each task was committed atomically:

1. **Task 1: workspace-assert-dispatched-cwd.ts handler** — `mqmmntyrvnos…` (feat)
2. **Task 2a: workspace-parallel-dispatch.ts CLI bridge** — `zpmvpwzlkkkm…` (feat)
3. **Task 2b: workspace-parallel-fan-in.ts CLI bridge** — `xkpynrzpkzum…` (feat)
4. **Task 3: catalog + manifest registration + null-shape fix** — `xnlprkkvqkzm…` (feat)

## Catalog + Manifest Rows Added

### `sdk/src/query/command-static-catalog-domain.ts` (6 entries)

```typescript
// Phase 11 (VCS-20 + PROMPT-06..09): workspace verbs for parallel orchestration.
['workspace.assert-dispatched-cwd', workspaceAssertDispatchedCwdQuery],
['workspace assert-dispatched-cwd', workspaceAssertDispatchedCwdQuery],
['workspace.parallel.dispatch', workspaceParallelDispatchQuery],
['workspace parallel.dispatch', workspaceParallelDispatchQuery],
['workspace.parallel.fan-in', workspaceParallelFanInQuery],
['workspace parallel.fan-in', workspaceParallelFanInQuery],
```

### `sdk/src/query/command-manifest.non-family.ts` (3 entries)

```typescript
// Phase 11 (VCS-20 + PROMPT-06..09): workspace verbs for parallel orchestration.
// assert-dispatched-cwd is read-only per D-03; dispatch and fan-in mutate
// (create/merge/delete workspaces and bookmarks).
{ canonical: 'workspace.assert-dispatched-cwd', aliases: ['workspace assert-dispatched-cwd'], mutation: false, outputMode: 'json' },
{ canonical: 'workspace.parallel.dispatch',     aliases: ['workspace parallel.dispatch'],     mutation: true,  outputMode: 'json' },
{ canonical: 'workspace.parallel.fan-in',       aliases: ['workspace parallel.fan-in'],       mutation: true,  outputMode: 'json' },
```

## Stdin/@file Helper Decision

**No existing helper was reused.** Searched `sdk/src/query/` for `readMaybe…`/`@-` patterns — none found. The plan referenced `gsd-sdk query commit --files @-` as precedent but inspection of `sdk/src/query/commit.ts` shows that handler does NOT do file/stdin resolution — `--files` is just a list of inline paths.

Each of the three handlers inlined its own input resolver:
- Task 2a (`dispatch`) has its own `resolvePlanInput()` accepting inline-or-@file-or-@-.
- Task 2b (`fan-in`) has its own `resolveFileOrStdin()` rejecting inline form per RESEARCH Open Q2.

Inlining was chosen over a shared helper because the three handlers have different input-flag counts and disambiguation rules. A shared helper would have either accepted the inline form universally (wrong for fan-in) or split into two helpers (no real saving). Future plans can refactor if a third site emerges.

## Files Created/Modified

- `sdk/src/query/workspace-assert-dispatched-cwd.ts` (created, 82 LOC) — D-03 minimal-predicate handler.
- `sdk/src/query/workspace-parallel-dispatch.ts` (created, 97 LOC) — dispatch CLI bridge.
- `sdk/src/query/workspace-parallel-fan-in.ts` (created, 124 LOC) — fan-in CLI bridge with disambiguation.
- `sdk/src/query/command-static-catalog-domain.ts` (modified, +9 LOC) — 3 imports + 6 catalog rows + 1 section comment.
- `sdk/src/query/command-manifest.non-family.ts` (modified, +5 LOC) — 3 manifest rows + 1 section comment.
- `sdk/src/query/command-aliases.generated.ts` (regenerated, +3 entries).
- `get-shit-done/bin/lib/command-aliases.generated.cjs` (regenerated, +3 entries — generated mirror in CJS).

## Decisions Made

- **list()[0] === primary convention** is the load-bearing assumption in the assert-dispatched-cwd predicate. Verified for both backends: git's `worktree list --porcelain` lists the main worktree first (the workspace where `$GIT_DIR == $GIT_COMMON_DIR`); jj's `workspace list -T json(self)` lists the `default` workspace first. If a future jj version reorders, the verb will silently mis-classify primary as non-primary. Worth flagging in CONTEXT for Plan 11-04 implementation; for now this is the cheapest backend-opaque approach. Alternatives considered: `vcs.workspace.context().isLinked` (only available on git's narrowed branch); calling `jj workspace list` directly (defeats the "minimal predicate" contract).
- **null vs undefined for absent fields** — JSON.stringify drops undefined keys, which would have made `{ workspaceName: undefined, ... }` produce `{ ... }` (missing keys). Acceptance criterion explicitly required the four fields all present. Switched to explicit `null` and updated the doc comment.
- **inlined per-handler input resolvers** over a shared helper — covered in "Stdin/@file Helper Decision" above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missing JSON fields on no-match branch**
- **Found during:** Task 3 (catalog wiring + smoke test)
- **Issue:** The first smoke test `gsd-sdk query workspace.assert-dispatched-cwd --cwd .` returned only `{ "ok": false, "isPrimary": false }` — the `workspaceName` and `workspacePath` keys were missing because they had been set to `undefined` on the no-match branch, and `JSON.stringify` drops `undefined`-valued keys. The acceptance criterion explicitly requires all four fields present in the JSON envelope.
- **Fix:** Switched the no-match branch to emit explicit `null` (not `undefined`) for `workspaceName` and `workspacePath`. Updated the inline comment to explain the stability rationale.
- **Files modified:** `sdk/src/query/workspace-assert-dispatched-cwd.ts` (lumped into Task 3 commit since the field-naming was tightly coupled to the catalog registration that triggered the smoke test).
- **Verification:** Re-ran `gsd-sdk query workspace.assert-dispatched-cwd --cwd .` → `{ "ok": false, "workspaceName": null, "workspacePath": null, "isPrimary": false }`. All four fields present.
- **Committed in:** `xnlprkkvqkzm…` (Task 3)

**2. [Rule 2 - Missing Critical] command-aliases.generated.{ts,cjs} drift**
- **Found during:** Task 3 (post-registration)
- **Issue:** The plan listed only `command-static-catalog-domain.ts` and `command-manifest.non-family.ts` as files-to-modify, but `sdk/src/query/command-aliases.generated.ts` and `get-shit-done/bin/lib/command-aliases.generated.cjs` are auto-generated from the manifest. Without regeneration the `check:alias-drift` CI script would fail.
- **Fix:** Ran `npx tsx scripts/gen-command-aliases.ts` (the generator the `check:alias-drift` script validates against). 3 new entries appended to NON_FAMILY_COMMAND_ALIASES in both .ts and .cjs mirrors.
- **Files modified:** `sdk/src/query/command-aliases.generated.ts`, `get-shit-done/bin/lib/command-aliases.generated.cjs` (also lumped into Task 3 commit).
- **Verification:** `grep "workspace.assert\|workspace.parallel" sdk/src/query/command-aliases.generated.ts` shows 3 expected entries; same for the .cjs.
- **Committed in:** `xnlprkkvqkzm…` (Task 3)

---

**Total deviations:** 2 auto-fixed (1 bug — missing JSON fields; 1 missing critical — alias-generated drift).
**Impact on plan:** Both fixes essential — the bug fix matches the acceptance criteria the plan declared, and the alias-drift fix prevents a CI regression the plan didn't explicitly call out.

## Issues Encountered

- **Backend impedance: jj's `WorkspaceInfo.path` is a workspace NAME, not an fs path** (documented in Phase 11-01 SUMMARY's Decisions Made). This means on jj backends the realpath-equivalence match in assert-dispatched-cwd never succeeds for the `default` workspace (because `"default"` doesn't resolve to a real fs path). That's why running the smoke test against the main repo cwd returns `ok:false, workspaceName:null` rather than `ok:false, workspaceName:"default", isPrimary:true`. This is the documented current behavior — the contract is "minimal predicate per D-03"; the verb will exercise non-trivially in Plan 11-03+ when dispatched workspaces (which carry real fs paths via `createSubagentSlot`) are the cwd. No code fix required this plan.
- **Pre-existing test failures in the broader SDK suite** (golden-parity, jj-colocated cmd-execute-phase, validateHealth, gsd-tools.test) — unchanged from Phase 11-01 baseline and unrelated to the three new files. Per `project_golden_parity_failures_block_03_1` memory these are tracked. Verified the test files I touched (query-dispatch, registry-assembly, command-resolution, command-definition, command-topology, commands-list, command-seam-coverage, command-manifest.validate) all pass — 19/19 green.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- The SDK CLI surface that Plans 11-03..11-06 consume is fully in place:
  - **Plan 11-03** (workflow markdown rewrite for `execute-phase.md`) can now call `gsd-sdk query workspace.parallel.dispatch --phase N --main-bookmark trunk --plan @-` and capture the Handle JSON in a shell variable per D-01.
  - **Plan 11-04** (`gsd-executor.md` collapse) can replace the four worktree-aware guard blocks with one `gsd-sdk query workspace.assert-dispatched-cwd --cwd .` call + a single branch on `.ok` per D-04.
  - **Plan 11-05** (worktree-safety.cjs body shrink) can delegate to `vcs.workspace.parallel.fanIn` directly (via the adapter, not the CLI bridge) — the CLI bridge is for workflow-markdown only.
  - **Plan 11-06** (`quick.md` rewire) mirrors Plan 11-03's pattern but with `$USE_WORKTREES` gating per Pitfall 3.
- The list()[0] === primary convention will need flagging in Plan 11-04's implementation notes — if downstream Plans 11-03/11-04 discover the convention breaks for any jj configuration, the assert-dispatched-cwd body will need a more explicit primary discriminator (e.g., calling `vcs.workspace.context().isLinked` on git's narrowed branch). For now the convention holds for both backends in observed jj/git versions.
- The Phase 9 D-02 jj-side bookmark retire (Plan 11-01) and the SDK CLI surface (this plan) compose cleanly: the Handle returned by `workspace.parallel.dispatch` carries a `manifest` field that points to the SDK-internal sidecar (per Phase 9 D-08 — observability only, not orchestrator state), while the orchestrator shell holds the Handle JSON itself. No conflict between D-01 (no orchestrator manifest) and the adapter-internal manifest sidecar.

## Self-Check

- `sdk/src/query/workspace-assert-dispatched-cwd.ts` — FOUND (created)
- `sdk/src/query/workspace-parallel-dispatch.ts` — FOUND (created)
- `sdk/src/query/workspace-parallel-fan-in.ts` — FOUND (created)
- `sdk/src/query/command-static-catalog-domain.ts` — FOUND (modified)
- `sdk/src/query/command-manifest.non-family.ts` — FOUND (modified)
- Commit `mqmmntyrvnos…` (Task 1) — FOUND in `jj log` output
- Commit `zpmvpwzlkkkm…` (Task 2a) — FOUND in `jj log` output
- Commit `xkpynrzpkzum…` (Task 2b) — FOUND in `jj log` output
- Commit `xnlprkkvqkzm…` (Task 3) — FOUND in `jj log` output
- `cd sdk && pnpm run build` — exits 0
- `node scripts/lint-vcs-no-commit-id.cjs` — 0 violations (1041 files scanned)
- `node scripts/lint-vcs-no-raw-git.cjs` — 0 violations (1079 files scanned)
- End-to-end: `gsd-sdk query workspace.assert-dispatched-cwd --cwd .` returns `{ ok, workspaceName, workspacePath, isPrimary }` JSON (all four fields present)
- End-to-end: `gsd-sdk query workspace.parallel.dispatch` (no flags) returns `{ ok: false, reason: 'phase_number_required' }`
- End-to-end: `gsd-sdk query workspace.parallel.fan-in` (no flags) returns `{ ok: false, reason: 'handle_required' }`

## Self-Check: PASSED

---
*Phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd*
*Completed: 2026-05-16*
