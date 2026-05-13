# Phase 4 LEARNINGS: Workspaces + Octopus Structure + Hooks

**Phase:** 04
**Completed:** 2026-05-13
**Plans:** 7/7

This file captures cross-phase learnings from the Phase 4 build — empirical confirmations and corrections from research-to-impl, decision threads, format-migration entries, deferred questions, and the hand-off surface that feeds Phase 5. It supplements per-plan SUMMARY.md files (04-01-SUMMARY through 04-07-SUMMARY) by lifting recurring observations to the phase level.

---

## Phase 4 Success Criteria — Evidence

The 5 criteria from `ROADMAP.md` § "Phase 4: Workspaces + Octopus Structure + Hooks":

1. **Orchestrator dispatches a multi-subagent phase on jj** — each subagent's head change and workspace pre-created (`jj new -A parent -B merge --no-edit` + `jj workspace add -r <head_id>`); orchestrator's main `@` sits one beyond merge; parent+merge octopus is lazily constructed on first fan-out; single-plan phases without fan-out stay linear.
   - **Verifying gate:** `sdk/src/vcs/jj/octopus.ts` exports `createPhaseStructure`, `createSubagentHead`, `createSubagentSlot`; contract tests in `sdk/src/vcs/__tests__/jj-octopus.test.ts` exercise the WS-05..WS-10 wiring end-to-end against a live jj 0.41 colocated repo.
   - **Plan source:** 04-05.

2. **After phase merge, adapter automatically inspects subagent heads, `jj abandon`s empty ones, surfaces non-empty for review, and `jj workspace forget`s in a single batch reap; phase bookmark advances exactly to the merge change.**
   - **Verifying gate:** `sdk/src/vcs/jj/reap.ts` exports `performJjReap`; contract tests in `sdk/src/vcs/__tests__/jj-reap.test.ts` plus the D-14 `phaseMergeFor` gate in `commit()` on both backends (throws `VcsIncompleteSubagentsError` when crash queue is non-empty).
   - **Plan source:** 04-04.

3. **If a subagent crashes mid-work, adapter squashes uncommitted content as `'subagent N: incomplete work'` and surfaces for human review.**
   - **Verifying gate:** `.planning/phases/{N}/incomplete-work.md` crash queue (change-id-native — no SHA rewrite needed at migration) populated by `performJjReap` on non-empty head detection; `readIncomplete()` in `sdk/src/vcs/jj/incomplete-work.js` is the cross-backend reader the merge gate consumes.
   - **Plan source:** 04-04.

4. **Workspace-path-safety guards work on jj workspaces; `vcs.workspace.{add,forget,list}` work uniformly on both backends with the default sibling-path layout.**
   - **Verifying gate:** WS-13 multi-workspace bug-audit landed in plan 04-02 (`vcsMultiWsTest` fixture exercises the `bug-3097/3099/2774/2075` shapes against jj); workspace.add throws `mkdir -p` of the parent if missing (Pitfall 4 confirmation).
   - **Plan source:** 04-01, 04-02.

5. **`vcs.hooks.fire('pre-commit', ctx)` invoked after every `jj squash`; colocated D-10 no-op; non-colocated direct trigger of `.githooks/pre-commit`; pre-push fires on `jj git push` via inline `acarapetis/jj-pre-push` replication; v1 hook interface shaped for future Tier 2 PATH-shim wrapper.**
   - **Verifying gate:** `sdk/src/vcs/backends/jj.ts` `commit()` calls `fireHook('pre-commit', ...)`; `push()` calls `firePrePushHook()` from `sdk/src/vcs/jj/pre-push.ts` before invoking jj; SDK query bridge `gsd-sdk query hooks.fire` exposes the cross-backend explicit-fire surface (CI-04 closure).
   - **Plan source:** 04-06.
   - **Known gap (A3 refutation):** see Open Question §1 below.

---

## Empirical Confirmations and Corrections (research → implementation)

Phase 4 turned five PITFALLS conjectures from `04-RESEARCH.md` into either confirmed-and-locked patterns or refuted-with-correction. The plan that landed each correction is noted in parentheses.

### Confirmed (held under live jj 0.41)

| Pitfall | Status | Source plan |
|---------|--------|-------------|
| **Pitfall 2** — `jj diff -r REV --from REV` rejected by jj 0.41 CLI parser; correct form is `jj diff -r REV1 -r REV2` or `jj diff --from REV1 --to REV2` | **Confirmed.** Plan 04-04 pinned the corrected form when reap's diff-against-parent probe wanted to inspect a subagent head's content. | 04-04 |
| **Pitfall 3** — `jj workspace forget <name>` leaves the on-disk workspace directory; cleanup requires explicit `rm -rf` (or `jj workspace forget --remove`). | **Confirmed.** `performJjReap` issues both `jj workspace forget` AND `rm -rf <workspace_path>` to fully release the slot. | 04-04 |
| **Pitfall 4** — `jj workspace add <path>` does NOT auto-`mkdir -p` the parent directory; throws with an unhelpful error if parent missing. | **Confirmed.** `workspace.add` in `sdk/src/vcs/backends/jj.ts` calls `mkdirSync(dirname(path), { recursive: true })` before the jj invocation. | 04-01 |
| **Pitfall 5** — `jj workspace list` does NOT accept `--no-graph`; the flag is `log`-specific. | **Confirmed.** `parseJjWorkspaceList` consumes the default tabular `workspace list` output (or NDJSON when `-T 'json(self) ++ "\n"'` is added — that template form works, but `--no-graph` is silently rejected). | 04-01 |

### Refuted (assumption needed correction)

| Assumption | Refutation | Status |
|------------|------------|--------|
| **A2** — `gsd-lock` placed under `.jj/working_copy/` survives colocated jj operations (no clobber). | **Held.** Plan 04-03's `acquireJjWriteLock` RAII primitive lives at `.jj/working_copy/gsd-lock`; concurrent-acquire tests confirm the location does not interfere with jj's own working-copy state machine. | 04-03 |
| **A3** — Colocated jj exports to `.git` and `.git/hooks/pre-commit` triggers automatically when `.git/refs/heads/<name>` updates. | **Empirically refuted in plan 04-06.** jj 0.41 in colocated mode does NOT fire `.git/hooks/pre-commit` after `jj squash` — verified by writing a hook that prints to a file and observing the file is never written after a squash that advances both jj's `@` and the colocated git branch. The D-10 colocated no-op (adapter does not fire pre-commit when `.git` exists alongside `.jj`) therefore leaves colocated users without a pre-commit path. Three fix paths documented in Open Question §1; deferred as Rule 4 architectural decision. | **Open** |
| **A4** — `acarapetis/jj-pre-push` Python script trigger logic is ≤200 LOC and can be inline-replicated in TypeScript without a Python runtime dep. | **Held.** Inline replication in `sdk/src/vcs/jj/pre-push.ts` is ~120 LOC including comments; the trigger condition (bookmark push to a tracked remote) maps directly to jj's `bookmark list --tracked` template output. CI-02 (no Python runtime in CI) preserved. | 04-06 |

---

## Decisions Threaded (D-01..D-24)

The decision IDs originate in `04-CONTEXT.md`. Status as of phase close:

- **D-01 (build-now-activate-later):** Adapter ships parallel-ready (jj workspace machinery + lock primitive + octopus helpers all complete); THIS repo stays sequential pre-Phase-5 dogfood per user memory.
- **D-07 (lazy octopus):** Implemented in plan 04-05 — `createPhaseStructure` runs only on first subagent fan-out, not at phase start; single-plan linear phases do NOT pay the parent+merge cost.
- **D-10 (colocated pre-commit no-op):** Implemented as designed in plan 04-06 BUT A3 refutation (see above) means the design is incomplete; treat as v1 known-gap.
- **D-12 / D-13 (crash queue file format):** Markdown-line-delimited `.planning/phases/{N}/incomplete-work.md`; YAML frontmatter NOT added in v1 (deferred per Open Q3).
- **D-14 (phase-merge gate):** `VcsIncompleteSubagentsError` thrown by `commit()` on both backends when `input.phaseMergeFor.phaseDir` resolves to a non-empty crash queue.
- **D-17 (sticky vcs.adapter):** Inherited from Phase 3 unchanged; Phase 4 does not touch the `.planning/config.json` `vcs.adapter` resolution path.
- **D-19 (write lock):** Implemented in plan 04-03 as `acquireJjWriteLock` RAII primitive; 30s default timeout (Open Q4 deferred to Phase 5 dogfood metrics).
- **D-21 (stale lock recovery):** PID-based liveness probe with `kill -0` retry; tests in `jj-lock.test.ts` cover the stale-pid case.
- **D-22 (jj-native CI lane):** Added to `.github/workflows/test.yml` matrix with `continue-on-error: true`; graduates to required-blocking in Phase 5 alongside jj-colocated per CI-01.
- **D-24 (cr-01 fold-in):** Refname validator lifted to `sdk/src/vcs/refs-validator.ts`; threaded through `refs.bookmarks.{create,move,delete,exists}` on BOTH backends with `--` end-of-options separator. Plan 04-07.

---

## Format-Migration Tracker (D-19 inheritance from Phase 3)

Phase 3 introduced the tracker for `.planning/` files that record commit-SHA-like identifiers, so the migration phase can rewrite them to jj `change_id` form. Phase 4 entries:

- `.planning/phases/{N}/incomplete-work.md` — **change-id-native already** (jj `change_id` is the natural primary key for "which subagent head"); no rewrite needed at migration. The reap producer (`performJjReap`) writes change_ids; the merge-gate consumer (`readIncomplete`) reads them. **No tracker entry needed.**
- `sdk/src/vcs/__tests__/jj-octopus.test.ts` fixture / assertion forms — change_id strings appear in `it.each` arrays; **no tracker entry needed** (test-only data, regenerated per run).
- SUMMARY files for plans 04-01..04-06 — short commit hashes used as Task-N references. **Tracker entry: should rewrite to change_ids at migration** per the Phase 3 convention. Add to the existing `.planning/intel/format-migration.md` list (or equivalent) if it lives there.

---

## Hand-off to Phase 5

Phase 5 inherits the following stable seams. The PROMPT-* requirements (workflow markdown + agent prompt rewrites) draw from this list.

### Replacement targets in workflows / agent prompts

- `execute-phase.md:682-728` invokes raw `git hook run pre-commit` — **swap to** `gsd-sdk query hooks.fire pre-commit` (cross-backend SDK query bridge landed in plan 04-06).
- Multiple workflows invoke `git worktree add ...` directly — **swap to** `vcs.workspace.add(path, { atRevision })` (the SDK adapter) plus the octopus helpers (`createSubagentSlot`) when the workspace is a subagent slot.
- Agent prompts that mention `git branch <name>` for bookmark advance — **swap to** `vcs.commit({..., bookmark: '<name>'})` (auto-advances via D-08 / REFS-05).

### Cross-backend primitives ready for Phase 5 consumption

- `vcs.workspace.{add, forget, prune, list, reap}` — full suite on both backends.
- `acquireJjWriteLock(repoCwd, opts)` — RAII lock for jj-side critical sections (released on `dispose()`).
- `performJjReap(repoCwd, { trackedHeads, phaseDir })` — batch reap producer.
- `fireHook('pre-commit' | 'pre-push', ctx)` — adapter-internal call path (jj backend invokes from `commit()` and `push()`).
- `gsd-sdk query hooks.fire <stage> [<ctxJson>]` — CLI-level explicit-fire surface (CI-04 closure).
- `vcs.refs.bookmarks.{create, move, delete, exists}` — now hardened by `validateRefname` + `--` separator (D-24 / cr-01 fold-in).

### Known gaps Phase 5 must address

1. **Colocated pre-commit A3 refutation** — pick one of the three fix paths in Open Q1 below; surface during early Phase 5 dogfood when the colocated workflow exercises the first real pre-commit consumer.
2. **MIGR-02 partial completion** — 6 outstanding `bin/lib/*.cjs` files (per Phase 2 status) still need adapter call-site swaps; Phase 5 PROMPT-* rewrites will likely touch these files and should complete the migration opportunistically.
3. **jj-native CI lane allow-failure** — currently `continue-on-error: true`; graduates to required-blocking in Phase 5 once intermittent flakes (concurrency, fixture-tmpdir contention) are stabilised.

---

## Open Questions Deferred Past Phase 4

### Q1 — Colocated pre-commit path (A3 refutation follow-up)

**Problem:** jj 0.41 colocated mode does NOT auto-fire `.git/hooks/pre-commit` after `jj squash`, contradicting the A3 research assumption. The D-10 design (adapter no-ops pre-commit in colocated mode, relying on git's hook mechanism to fire via the colocated git ref update) therefore leaves colocated users without a pre-commit path entirely.

**Three fix paths (planner's discretion in Phase 5):**

1. **Always fire from the adapter regardless of colocation mode.** Simplest; the cost is duplicate firing if a future jj release adds the auto-fire behavior. Mitigation: a `GSD_HOOK_SKIP_COLOCATED` env var as the override.

2. **Detect colocation at adapter init and probe whether jj's git export fires `.git/hooks/pre-commit` on this jj version.** Probe once per adapter construction; cache the result. More robust; slightly more expensive at adapter init.

3. **Wait for jj upstream to add the auto-fire behavior and document the gap as a v2 known-issue.** Lowest cost in Phase 4 close (already done — this LEARNINGS file is the documentation); the cost is colocated dogfood users see pre-commit silently skipped until upstream lands the fix.

**Recommendation:** Path 1 (always-fire with override env) — cheapest to ship, fastest correctness recovery, the dup-fire risk is benign (hooks should be idempotent or guard themselves).

### Q3 — Crash queue file format richness

Should `.planning/phases/{N}/incomplete-work.md` carry YAML frontmatter (per-entry metadata: timestamp, agent ID, plan number, line-numbered uncommitted-file inventory)? V1 ships plain markdown line-delimited (change_id + short description); revisit if humans regularly need richer metadata when triaging crashed subagents.

### Q4 — Lock timeout

`acquireJjWriteLock` defaults to 30s timeout. Is this the right value? Open question for Phase 5 dogfood — add a metric (lock-wait-duration histogram) and observe real workloads before tightening or loosening.

---

## Pre-existing Failures Still Deferred

Same maintenance bucket as Phase 3 SUMMARY's close list:

- `tests/commit.test.ts` gpgsign fixture drift (Phase 2 plan 02-01 partial fix; full fix deferred).
- `tests/worktree-safety-policy.test.cjs` drift (Phase 2 plan 02-04; some assertions remain non-blocking).
- Various jj-integration flakes in `sdk/src/vcs/__tests__/` (jj-octopus, jj-lock, jj-hooks, jj-workspace, jj-push-fetch, jj-commit, exec-env-passthrough) — pass in isolation, intermittently fail in bulk runs due to tmpdir / process contention. Vitest integration perf is the maintenance bucket called out in `03.1-CONTEXT.md`.

---

## Velocity / Context-Cost Notes for STATE.md

- Phase 4 sub-agent contention is real: octopus contract tests sometimes serialize in CI (~50% wall-clock overhead vs local isolation). Phase 5 dogfood will validate whether the actual orchestrator workload triggers the same contention or whether the test harness is the only environment that surfaces it.
- The cr-01 D-24 fold-in (plan 04-07) was lightweight (~3 hour real-time wall clock, including test authoring) — defensive hardening of an existing surface is cheap when the threat is already inventoried.
- The A3 refutation (plan 04-06) consumed disproportionate context: ~6 hours including the empirical probe + fix-path enumeration. Bookmark the lesson for Phase 5: pin assumptions to a live test BEFORE designing around them.

---

Phase 4 plan execution complete (7/7). Ready for Phase 5 plan.
