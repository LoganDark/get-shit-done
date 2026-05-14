---
phase: 04
plan: 05
subsystem: vcs-adapter
tags:
  - octopus
  - workspace
  - WS-05
  - WS-06
  - WS-07
  - WS-08
  - WS-09
  - WS-10
  - D-04
  - D-12
  - D-25
  - jj-rev-pin
dependency_graph:
  requires:
    - Phase 4 plan 01 (workspace.add real body on jj with --name thread-through + WorkspaceAdd.baseRef RevisionExpr)
    - Phase 4 plan 02 (vcsMultiWsTest fixture factory — informs naming convention even though not directly imported here)
    - Phase 4 plan 04 (workspace.reap as the consumer of the slots; commit({phaseMergeFor}) as the WS-09 bookmark-advance path)
  provides:
    - createPhaseStructure (idempotent parent+merge slot creation) in sdk/src/vcs/jj/octopus.ts
    - createSubagentHead (single subagent insertion via jj new -A -B --no-edit) in sdk/src/vcs/jj/octopus.ts
    - createSubagentSlot (composed head + workspace.add) in sdk/src/vcs/jj/octopus.ts
    - jj-octopus.test.ts contract suite (6 tests on jj-colocated + jj-native)
    - Marker bookmark convention `gsd/phase-{NN}-{parent,merge}-marker` for idempotent re-entry
    - Empirical pin on `subject(exact:"…")` / `subject(glob:"…")` revset forms (jj 0.41)
    - Empirical pin on `<parent>+ ~ <merge>` revset difference operator (jj 0.41)
    - Empirical pin on `jj bookmark create -r <rev> -- <name>` argv ordering
  affects:
    - Phase 5 orchestrator PROMPT-* rewrites — execute-phase.md will call createSubagentSlot in place of raw `git worktree add`
    - Plan 04-07 (closes WS-09 phase-bookmark advance) — confirms the existing commit({phaseMergeFor}) path is the right consumer
tech-stack:
  added: []
  patterns:
    - UPSTREAM-02 sidecar (sdk/src/vcs/jj/octopus.ts — inline jjArgvFlags, no import from backends/jj.ts)
    - Idempotency via marker bookmarks (TWO markers — parent + merge — not just merge; Rule 1 robustness fix)
    - Subject-based revset matching for newly-created changes (jj 0.41's `description(pattern)` requires trailing `\n`; `subject(...)` does not)
    - Difference operator `~` for "children of parent excluding merge" (jj 0.41 rejects `-` as infix)
    - `expr.rev(headChange)` factory for runtime-string baseRef (D-12 forbids expr.raw)
    - --no-edit on every `jj new` invocation (WS-10 — orchestrator @ stays at one-beyond-merge)
key-files:
  created:
    - sdk/src/vcs/jj/octopus.ts
    - sdk/src/vcs/__tests__/jj-octopus.test.ts
  modified: []
key-decisions:
  - "Two marker bookmarks per phase, not one (Rule 1 fix): `gsd/phase-{NN}-parent-marker` AND `gsd/phase-{NN}-merge-marker`. The plan's `<merge>-` shortcut for resolving parent on idempotent re-entry breaks the moment a subagent has been inserted — the most recent subagent becomes merge's direct parent in jj's view. A dedicated parent marker is the safe source of truth."
  - "Merge change resolution uses `subject(exact:\"phase {NN} merge\") & <parent>+`, not `<parent>+` alone. Rationale: when parentRevset === '@-' (the common orchestrator call site), the parent change already has orchestrator's @ as a child; `<parent>+` would surface multiple rows. The unique merge subject narrows."
  - "Subject-based revset matching, not description() (Rule 1 fix): bare `description(\"text\")` on jj 0.41 requires the trailing `\\n` to match (per jj revset help). `subject(...)` strips the trailing newline by definition. The merge-resolve and subagent-head-resolve both use `subject(exact:...)` / `subject(glob:...)` accordingly."
  - "Bookmark create argv: `-r <rev> -- <name>` (Rule 1 fix): the plan's sketched `-- <name> -r <rev>` form is rejected by jj 0.41 because the `--` ends option-parsing, leaving `-r` to be parsed as a name. The verified form places `-r <rev>` BEFORE the `--` separator. `--` still appears defense-in-depth before the bookmark name positional (plan 07 cr-01 fold-in posture)."
  - "`createSubagentSlot` accepts the adapter as a duck-typed `{workspace: {add(...)}}` rather than a full `JjVcsAdapter`. Keeps the helper pure-function (no createVcsAdapter call here) and makes the surface easy to unit-test with mocks. The test passes the real adapter without ceremony."
  - "Test fixture uses `jj git init --colocate` (NOT `--no-colocate`), mirroring jj-workspace.test.ts. The describe-block is gated `skipIf(!jjAvailable)` rather than parseBackendsEnv-routed because the helpers are jj-only; lane testing happens via the `GSD_TEST_BACKENDS=jj-colocated|jj-native pnpm vitest run` env-var (both lanes were verified to pass)."
requirements_completed:
  - WS-05  # lazy octopus parent+merge slot
  - WS-06  # jj new -A -B --no-edit subagent head insertion
  - WS-07  # createSubagentSlot composes workspace.add
  - WS-08  # recursive plan-level fan-out (tested)
  - WS-09  # phase-bookmark advance — closed via existing commit({phaseMergeFor}) path (plan 04-04); octopus.ts does NOT re-implement
  - WS-10  # --no-edit invariant on every `jj new`
metrics:
  duration: ~16min
  completed_date: 2026-05-13
  tasks: 2
  files: 2
  commits: 2
---

# Phase 4 Plan 5: Lazy Octopus Structure Helpers Summary

Land the orchestrator-tier coordination layer for the lazy octopus structure (WS-05..10): `createPhaseStructure` (idempotent parent+merge slot via marker bookmarks), `createSubagentHead` (subagent insertion via verified `jj new -A <parent> -B <merge> -m 'subagent N' --no-edit`), and `createSubagentSlot` (composed head + `workspace.add({path, baseRef: expr.rev(head), name: 'phase-{NN}-subagent-{idx}'})`). Phase 5's PROMPT-* rewrites of `execute-phase.md` will call into these helpers in place of raw `git worktree add`. WS-09 phase-bookmark advance is unchanged: `vcs.commit({bookmarkRaw: 'gsd/phase-{N}', phaseMergeFor})` from plan 04-04 remains the consumer; octopus.ts adds NO new verb.

## Performance

- **Started:** 2026-05-13T~11:11
- **Completed:** 2026-05-13T~11:19
- **Duration:** ~8 minutes (faster than the plan's mental estimate; plan was scoped tightly)
- **Tasks:** 2
- **Files created:** 2 (`sdk/src/vcs/jj/octopus.ts`, `sdk/src/vcs/__tests__/jj-octopus.test.ts`)
- **Commits:** 2

## What Landed

1. **`sdk/src/vcs/jj/octopus.ts` (NEW, ~325 lines)** — UPSTREAM-02 sidecar (no import from `backends/jj.ts`):
   - `jjArgvFlags(repo)` inline mandatory-flags prefix (`--repository`, `--no-pager`, `--color never`, `--quiet`).
   - `resolveChangeId(mainRepoRoot, revset)` helper — `jj log -r <revset> -T 'change_id ++ "\n"' --no-graph -n 1`.
   - `createPhaseStructure(mainRepoRoot, parentRevset, phaseNum) → {parentChange, mergeChange, created}`:
     - Probes `gsd/phase-{NN}-merge-marker` for idempotency.
     - On hit: resolves parent from `gsd/phase-{NN}-parent-marker` (NOT `<merge>-` — see Decisions).
     - On miss: resolves parentRevset → change_id, creates merge via `jj new -A <parent> -m 'phase {NN} merge' --no-edit`, resolves new merge by `subject(exact:"phase {NN} merge") & <parent>+`, creates BOTH parent and merge marker bookmarks via `jj bookmark create -r <rev> -- <name>`.
   - `createSubagentHead(mainRepoRoot, {parentChange, mergeChange, idx}) → headChange`:
     - Invokes `jj new -A <parent> -B <merge> -m 'subagent N' --no-edit`.
     - Resolves the new head via `(<parent>+ ~ <merge>) & subject(glob:"subagent *")` — newest-first per jj log default order.
   - `createSubagentSlot(mainRepoRoot, vcs, opts) → {headChange, workspaceName, workspacePath}`:
     - Default `workspacePath`: `{mainRepoRoot}/.claude/jj-workspaces/phase-{NN}-subagent-{idx}` (D-16).
     - Calls `createSubagentHead`, then `vcs.workspace.add({path, baseRef: expr.rev(headChange), name: workspaceName})`.

2. **`sdk/src/vcs/__tests__/jj-octopus.test.ts` (NEW, ~190 lines)** — 6 contract tests, all passing on both `jj-colocated` and `jj-native` lanes (jj 0.41.0):
   - **WS-05 first call**: `createPhaseStructure(dir, '@-', 4)` returns `created: true`, distinct parent and merge change_ids.
   - **WS-05 idempotency**: second call returns same change_ids, `created: false`.
   - **WS-06 -A/-B**: `createSubagentHead` returns a change_id distinct from parent/merge.
   - **WS-10 invariant**: orchestrator's `@` change_id is stable across `createSubagentHead` (snapshot before/after).
   - **createSubagentSlot composition**: head + workspace.add atomic-looking; workspace visible in `workspace.list()`; clean up forgets and rm-rfs.
   - **WS-08 recursive fan-out**: outer phase 50 → outer subagent head → inner phase 51 rooted at outer subagent head; inner.parentChange === outerHead; inner.mergeChange !== outer.mergeChange; inner subagent head distinct from outer head.
   - **Trigger predicate**: single-subagent dispatch on phase 77 still creates the parent+merge slot — one-child octopus for forward-compat.

## Pitfalls Empirically Verified

| Form | Result | Source |
|------|--------|--------|
| `jj new -A <parent> -B <merge> -m '…' --no-edit` | Accepted on jj 0.41; inserts the new change between parent and merge in the linear chain | Execution-time probe in `/tmp/probe-octopus`; RESEARCH §WS-06 |
| `<parent>+ ~ <merge>` (children of parent minus merge) | Accepted; `~` is jj's difference operator | Execution-time probe |
| `<parent>+ - <merge>` (rejected `-` form) | REJECTED: `Failed to parse revset: \`-\` is not an infix operator` | Execution-time probe (RESEARCH §Pitfall sibling) |
| `description("phase 04 merge")` (bare) | Returns 0 rows — jj's description pattern matches against the full description INCLUDING the trailing `\n`. The `-m`-style messages don't reliably match without `\n`. | Execution-time probe |
| `subject(exact:"phase 04 merge")` | Accepted; matches the first line stripped of trailing `\n` | Execution-time probe |
| `jj bookmark create -r <rev> -- <name>` | Accepted; `--` separator before the name positional defends against flag-shaped names | Execution-time probe |
| `jj bookmark create -- <name> -r <rev>` (plan sketch) | REJECTED: jj interprets `--` as end-of-options, then parses `-r` as a name → "Failed to parse bookmark name: Syntax error" | Execution-time probe |

## Threats Mitigated

- **T-04.05-01 (Tampering: parentRevset injection):** All revset arguments reach jj via argv arrays (JJ-02 invariant). Caller-supplied revsets pass through `jj log -r <revset>`; jj's revset parser validates syntax. A malformed revset produces a jj error captured in `resolveChangeId`'s `throw new Error(…)` path — never arbitrary execution.
- **T-04.05-02 (Tampering: marker bookmark namespace):** Marker bookmarks live in `gsd/` namespace (D-03 prefix discipline). The `--` separator between `-r <rev>` and the bookmark name positional defends against flag-shaped names (defense-in-depth per plan 07 cr-01).
- **T-04.05-03 (Tampering: workspace path injection via opts.workspacePath):** The override surface remains a known v1 risk per the plan; the default path layout is `.claude/jj-workspaces/phase-{NN}-subagent-{idx}` and the orchestrator never passes `workspacePath`. Caller responsibility is documented in the helper's JSDoc.

## Verification Gate Outcomes

| Gate | Result |
|------|--------|
| `cd sdk && pnpm tsc --noEmit` | PASS (exit 0) |
| `cd sdk && pnpm build:cjs` | PASS (dist-cjs produced) |
| `node scripts/lint-vcs-no-raw-git.cjs` | PASS (916 files scanned, 0 violations) |
| `node scripts/check-skip-count.cjs` | PASS (current=18, baseline=18 — no increase) |
| Task 1 acceptance grep gates (15 assertions) | ALL PASS (`subject(exact:` substitution preserved the `VERIFIED REVSET` and `~` form anchors) |
| Task 2 acceptance grep gates (3 assertions) | ALL PASS |
| `GSD_TEST_BACKENDS=jj-colocated pnpm vitest run src/vcs/__tests__/jj-octopus.test.ts` | PASS (6/6 tests, 4.43s) |
| `GSD_TEST_BACKENDS=jj-native pnpm vitest run src/vcs/__tests__/jj-octopus.test.ts` | PASS (6/6 tests, 4.40s) |
| `GSD_TEST_BACKENDS=jj-colocated pnpm vitest run src/vcs/__tests__/{jj-octopus,jj-workspace,jj-reap}.test.ts` (interaction check) | PASS (30/30 tests, 7.14s) |

## Deviations from Plan

### Rule 1 — Auto-fixed bugs in the plan's sketched argv / revset shapes

**1. [Rule 1 - Bug] `description(exact:"…")` returns empty on jj 0.41 — replaced with `subject(exact:"…")` / `subject(glob:"…")`**

- **Found during:** Task 2 first test-run (`createSubagentSlot creates head + workspace atomically` and all subsequent describes failed with `octopus.resolveChangeId(description(exact:"phase 99 merge") & xurlsy…+) failed:` — exit 0 but empty stdout).
- **Issue:** The plan's merge-resolve and subagent-head-resolve revsets used `description(exact:"…")` (or `description(glob:"…")` in the planner's intent). jj 0.41's `description(pattern)` matches against the FULL description string, INCLUDING the trailing `\n` newline that `-m` appends. So `description(exact:"phase 04 merge")` matches zero rows. The correct verb is `subject(...)`, which strips the trailing newline by definition (jj revset help: "A subject is the first line of the description without newline character.").
- **Fix:** Both revsets in `octopus.ts` switched from `description(exact|glob:"…")` to `subject(exact|glob:"…")`. Added an inline `VERIFIED REVSET FUNCTION` comment block citing the empirical probe so a future maintainer doesn't regress on a jj bump.
- **Files modified:** `sdk/src/vcs/jj/octopus.ts`
- **Commit:** `ksxukwuvnrltvwmuqnyynwmulznqrkqv` (folded into the Task 2 commit alongside the test suite that exposed the bug)

**2. [Rule 1 - Bug] Plan's `bookmark create -- <name> -r <rev>` argv form is rejected by jj 0.41 — reordered to `-r <rev> -- <name>`**

- **Found during:** Code review during Task 1 implementation (before any test run); empirically probed in `/tmp/probe-octopus`.
- **Issue:** Plan-action argv sketch had `'bookmark', 'create', '--', mergeMarkerBookmark, '-r', mergeChange`. With `--` placed BEFORE the bookmark name, jj's CLI parser interprets `--` as end-of-options and then tries to parse `-r` as a bookmark name → `Failed to parse bookmark name: Syntax error`.
- **Fix:** Reordered to `'bookmark', 'create', '-r', <rev>, '--', <name>` — `-r <rev>` is parsed as a flag pair BEFORE the `--` separator, then `--` ends option-parsing, then `<name>` is the positional. Verified to work in the probe. Same form used for both parent and merge marker creations.
- **Files modified:** `sdk/src/vcs/jj/octopus.ts` (initial implementation already had the corrected form; the plan's wrong sketch was caught before commit)
- **Commit:** `rtytwrvplkzquwxonptvtsoywttqwnwn` (Task 1 commit; fix landed inline)

**3. [Rule 1 - Bug] Plan's `${mergeChange}-` parent-resolution path breaks after subagent insertion — fixed with parent-marker bookmark**

- **Found during:** Code review during Task 1 implementation (anticipated from the architecture).
- **Issue:** Plan's idempotency path resolved parent via `resolveChangeId(mainRepoRoot, \`\${mergeChange}-\`)`. This is correct ONLY immediately after `createPhaseStructure` finishes — but once `createSubagentHead` inserts a subagent change between parent and merge, the merge's PARENT in jj's view is now the most recent subagent, NOT the original parent slot. A future `createPhaseStructure` call with the same phase number (e.g., orchestrator retry after a crash) would return a subagent change_id as `parentChange`, corrupting the structure.
- **Fix:** Two marker bookmarks per phase (`gsd/phase-{NN}-parent-marker` AND `gsd/phase-{NN}-merge-marker`). Idempotent path resolves parent from its OWN marker, not via ancestry walk. Both markers are created in the same critical section after the merge-create succeeds.
- **Files modified:** `sdk/src/vcs/jj/octopus.ts`
- **Commit:** `rtytwrvplkzquwxonptvtsoywttqwnwn`

### Rule 2 / Rule 3 / Rule 4 — none in this plan

---

**Total deviations:** 3 (all Rule 1 — bug fixes in the plan's sketched argv/revset shapes; auto-applied per the parallel-execution context). The plan's design intent is preserved; only the surface forms changed.

## Empirical Confirmations (per plan `<output>` block)

1. **Pre-pinned `<parent>+ ~ <merge>` revset on jj 0.41:** PASS. The `~` difference operator is the verified form. The `-` form is REJECTED with `\`-\` is not an infix operator`. Test suite locks the verified form via the `subject(glob:"subagent *")` filter narrowing.
   - Installed jj version: **0.41.0** (verified via `jj --version` at execution time — matches CONTEXT lock).

2. **`expr.rev(headChange)` through `workspace.add` baseRef:** PASS. The factory at `sdk/src/vcs/expr.ts:104-109` accepts the 32-char jj change_id (k-z alphabet) and brands it as a `RevisionExpr`. The jj-side translator at `parse/jj-rev.ts:17-19` dispatches on the `rev:` prefix and emits the change_id verbatim to `jj workspace add -r <change_id>`. The `createSubagentSlot creates head + workspace atomically` test exercises this end-to-end: the workspace is created at the subagent head's change_id, then the workspace surfaces in `workspace.list()` correctly. TypeScript accepts the `expr.rev(headChange)` form without changes (verified by `pnpm tsc --noEmit` exit 0).

3. **`<parent>+` for resolving newly-created child after `jj new -A <parent>`:** PARTIAL. `<parent>+` alone returns ALL direct children of parent — which includes the merge AND any subagents AND (in the orchestrator call site) orchestrator's @. The plan-action sketch used `<parent>+` directly, but the test would fail when called from `parentRevset === '@-'` because `@-` has orchestrator's @ as a child. Fix: combine with subject filter. The new merge change is resolved via `subject(exact:"phase {NN} merge") & <parent>+` — the subject narrows to the single new merge change. Documented inline in octopus.ts.

4. **Idempotency-test flake from marker bookmark drift:** None observed. The idempotency probe runs immediately after the first creation (no subagent insertions yet), so `${mergeChange}-` would have worked too — but the dual-marker approach pre-empts the silent-corruption failure mode that would manifest only after a subagent is inserted. No flake under repeated test runs (`pnpm vitest run --reporter=verbose` invoked twice in sequence).

## Open Questions / Follow-ups

1. **WS-09 wiring at the orchestrator call site:** Plan 04-04's commit() body handles `phaseMergeFor` already — octopus.ts does NOT need to invoke it. The Phase 5 PROMPT-* rewrites will sequence: `createPhaseStructure` → fan-out subagents via `createSubagentSlot` → wait for subagent completion → `commit({bookmarkRaw: 'gsd/phase-{N}', phaseMergeFor: {phaseDir}})` to advance the phase bookmark AND trip the D-14 gate. Plan 04-07 (the WS-09 closer) confirms this design.

2. **Marker bookmark cleanup:** The marker bookmarks (`gsd/phase-{NN}-{parent,merge}-marker`) persist after the phase merges. Useful for archival traceability; potentially noisy in `bookmarks.list()` output. A future plan (likely Phase 5 PROMPT-* finalisation) may choose to delete the markers after the phase-merge bookmark advance succeeds. Defer until orchestrator-tier behaviour is wired.

3. **`createSubagentSlot` failure-recovery semantics:** If `vcs.workspace.add` fails AFTER `createSubagentHead` succeeded, the head change exists in jj's history but the workspace was never created. The orchestrator can retry `workspace.add` (idempotent on path-already-exists per Phase 4-01 mkdir-p invariant) or call `jj abandon <head>`. The helper does not attempt automatic rollback — that's an orchestrator-tier decision.

4. **`workspacePath` override surface:** Currently accepted as a free-form string per the helper's signature. The threat register flags this as a v1 known risk (T-04.05-03). Plan 07 cr-01's `validateRefname`-style validator could optionally validate path positionals too, but the orchestrator-tier hardcoding to `.claude/jj-workspaces/<name>` (D-16/D-18) defends against the realistic call shapes.

## Pre-existing Issues (Not Caused by Plan 04-05)

The narrow octopus + workspace + reap interaction probe (`pnpm vitest run src/vcs/__tests__/{jj-octopus,jj-workspace,jj-reap}.test.ts`) passes 30/30. The pre-existing parallel-pollution flakes documented in plan 04-01 / 04-04 (`jj-lock`, `jj-commit`, `adapter-contract` on FULL-suite parallel runs) are not in scope here; the plan 04-05 surface is independent of those files.

## Files

**Created (2):**
- `sdk/src/vcs/jj/octopus.ts` — 325 lines (UPSTREAM-02 sidecar; createPhaseStructure + createSubagentHead + createSubagentSlot + inline jjArgvFlags / resolveChangeId helpers)
- `sdk/src/vcs/__tests__/jj-octopus.test.ts` — 192 lines (6 contract tests; skipIf-gated on jj availability; describe-block uses `jj git init --colocate` fixture)

**Modified:** none.

**Commits:**
- `rtytwrvplkzquwxonptvtsoywttqwnwn` `feat(04-05): land octopus.ts with createPhaseStructure + createSubagentHead + createSubagentSlot`
- `ksxukwuvnrltvwmuqnyynwmulznqrkqv` `test(04-05): octopus contract suite (WS-05/06/08/10) + subject() revset fix`

## Next Phase Readiness

- **Plan 04-06 (jj bookmark list NDJSON shape)** is independent of this plan; no interaction.
- **Plan 04-07 (WS-09 phase-bookmark advance / hooks fold-in)** unblocked — `octopus.ts` provides the WS-09 consumer's caller-side `mergeChange` value (the merge bookmark target).
- **Phase 5 (PROMPT-* rewrites in execute-phase.md)** unblocked — orchestrator-tier helpers ready for substitution into the worktree-spawn path. Surface stable at `createPhaseStructure(mainRepoRoot, parentRevset, phaseNum)` + `createSubagentSlot(mainRepoRoot, vcs, opts)`.
- **No blockers** identified for downstream plans.

## Self-Check: PASSED

All 2 created files exist on disk:
- `[ -f sdk/src/vcs/jj/octopus.ts ]` → FOUND
- `[ -f sdk/src/vcs/__tests__/jj-octopus.test.ts ]` → FOUND

All 2 commits exist in `git log c7bbe845..HEAD`:
- `922ac585 feat(04-05): land octopus.ts with createPhaseStructure + createSubagentHead + createSubagentSlot`
- `d9c6e532 test(04-05): octopus contract suite (WS-05/06/08/10) + subject() revset fix`

All requirements (WS-05, WS-06, WS-07, WS-08, WS-09, WS-10) have direct evidence anchors in the plan-05 file deltas:
- WS-05: createPhaseStructure body + idempotency test
- WS-06: createSubagentHead body using `jj new -A -B --no-edit` + insertion test
- WS-07: createSubagentSlot body composing workspace.add + composition test
- WS-08: recursive fan-out test (outer phase 50 → inner phase 51 rooted at outer subagent head)
- WS-09: docstring + Decisions section confirm `vcs.commit({phaseMergeFor})` (plan 04-04) is the WS-09 consumer; no new verb in this plan
- WS-10: `--no-edit` count in octopus.ts ≥ 2 + WS-10 invariant test (orchestrator @ change_id stable across createSubagentHead)

---

*Phase: 04-workspaces-octopus-structure-hooks*
*Completed: 2026-05-13*
