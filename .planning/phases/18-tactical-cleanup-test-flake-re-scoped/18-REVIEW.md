---
phase: 18-tactical-cleanup-test-flake-re-scoped
reviewed: 2026-06-11T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - gsd-core/bin/lib/vcs-command-router.cjs
  - gsd-core/workflows/execute-phase.md
  - gsd-core/workflows/plan-phase.md
  - gsd-core/workflows/transition.md
  - gsd-core/workflows/undo.md
  - scripts/dogfood-restore.sh
  - src/vcs-command-router.cts
  - src/vcs/__tests__/cmd-parallel-git.test.ts
  - src/vcs/__tests__/cmd-parallel-jj.test.ts
  - src/vcs/__tests__/cmd-parallel-max-concurrency-cli.test.ts
findings:
  critical: 1
  warning: 4
  info: 4
  total: 9
status: fixed
resolved: 2026-06-11
resolution: "CR-01 fixed pre-v1.5-close: plan-phase.md §14 + §15 manual-branch routing now run the §16 gate BEFORE <offer_next> (both routing instructions reference CR-01 inline). WR-01..04 + IN-01..04 accepted as deferred tech debt at v1.5 close — recorded in the v1.5 milestone archive."
---

# Phase 18: Code Review Report

**Reviewed:** 2026-06-11
**Depth:** standard
**Files Reviewed:** 10
**Status:** fixed (CR-01 resolved 2026-06-11; warnings/info deferred at v1.5 close)

## Summary

Fresh full re-review of the Phase 18 surface after plans 18-01/18-02/18-03/18-04. A prior 18-REVIEW.md (4 warnings, 3 info) was closed by plan 18-02 with `status: fixed`; this report supersedes it. The prior findings (WR-01..05 lineage: fail-closed status probe, entries-keyed predicate, `i + 1 < args.length` flag parse, positive-integer max-concurrency guard, tmpdir hygiene, `if (tmpDir)` afterEach guard) are all verified present and correctly implemented in the current sources.

What checks out cleanly this round:

- **The `assert_clean_wc` jq predicate is correct on both backends.** `if .ok == true and ((.entries // null) | type == "array") then ([.entries[] | (.path // error(...))] | join("\n")) else error(...) end` keys exclusively on `entries`, never `.raw`; empty array → empty string → `jq -e` exit 0 → clean; every malformed-envelope shape routes through `error()` → non-zero → FATAL abort. Verified fail-closed in all four placements (execute-phase.md:1697-1698, plan-phase.md:1787-1788, transition.md:440-441, undo.md:215).
- **`@file:` spill is a non-issue for the gates.** gsd-tools.cjs:451-499 transparently resolves `@file:` references on the normal output path (#1891), so `STATUS_JSON` and `CLEANUP_JSON` consumers never see the sentinel. (Checked because the >50KB spill would otherwise have broken every new jq consumer.)
- **Emitted artifact parity.** `gsd-core/bin/lib/vcs-command-router.cjs` carries the `plan_not_array` guard (1149-1151), the `max_concurrency_invalid` guard (1097-1101), and the WR-03 `i + 1 < args.length` form (1078) with logic identical to the `.cts` source (1216-1218, 1160-1167, 1140).
- **Gate ordering in execute-phase.md and transition.md is sound.** `assert_clean_wc` sits in natural fall-through position before `offer_next` / `offer_next_phase` with no jump instruction bypassing it; transition.md's post-gate writes (Route B1/B `config-set` + tolerant commit) are documented and committed.
- **dogfood-restore.sh root assertion fires pre-mutation** (line 56, before the tarball check at 73 and both mutations at 79/92), and the stderr/stdout separation + explicit jq-failure WARNs from the Phase 16 review fixes are intact.
- **Test hygiene fixes hold.** CONFIG-02 describe-scoped `tmpDir` + guarded `afterEach` in both parallel test files; the CLEANUP-05/06 table-driven envelope tests cover all four non-array JSON types, all seven invalid max-concurrency shapes, and the boundary value 1.

One Critical finding remains: plan-phase.md's §16 gate — the core deliverable of plans 18-01/18-04 for that file — is unreachable under literal instruction-following, because §14 and §15 both route to `<offer_next>` before §16 is encountered.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: plan-phase.md §16 `assert_clean_wc` gate is bypassed by §14/§15 routing — unreachable on the manual path it exists to protect

**File:** `gsd-core/workflows/plan-phase.md:1696-1698, 1761-1762, 1764`
**Issue:** Section 14 ("Present Final Status") instructs: "Route to `<offer_next>` OR `auto_advance` depending on flags/config." Section 15's manual branch instructs: "**If neither `--auto` nor config enabled:** Route to `<offer_next>` (existing behavior)." Both routing instructions transfer control to the `<offer_next>` block (which lives *after* `</process>`) before the orchestrator ever encounters §16 ("Assert Clean Working Copy") at line 1764. §16's own prose acknowledges "This gate here protects the manual route only (where §15 routes to `<offer_next>`)" — but the manual route, as written, jumps straight over it. The auto route is covered by execute-phase's own gate, so under a literal reading of the workflow, the plan-phase gate is dead code on **both** paths. An orchestrator following the §15 jump will emit the "PHASE PLANNED ✓" banner without ever running the cleanliness probe — exactly the Phase 14 incident class (uncommitted `.planning/` mutations under a completion banner) this phase was scoped to close. Contrast: execute-phase.md and transition.md place their gates as ordinary fall-through steps before the offer step with no intervening jump instruction, so they are not affected.
**Fix:** Make the gate part of the routed path instead of an orphaned trailing section. Either:
```markdown
## 14. Present Final Status

Run §16 (Assert Clean Working Copy) FIRST, then route to `<offer_next>` OR `auto_advance`...
```
or move the gate to be §14 (renumbering Auto-Advance to §15 and Present Final Status to §16), so flow passes through the probe before any routing instruction. At minimum, §15's manual branch must read "Run the Assert Clean Working Copy gate (§16), then route to `<offer_next>`."

## Warnings

### WR-01: `plan_not_array` guard validates the container but not the entries — garbage arrays still reach the adapter and crash without an envelope

**File:** `src/vcs-command-router.cts:1216-1218` (emitted: `gsd-core/bin/lib/vcs-command-router.cjs:1149-1151`)
**Issue:** The CLEANUP-05 guard rejects `{"not":"an array"}`, `"str"`, `42`, `null` — but `[null]`, `[42]`, `["x"]`, and `[{}]` all pass `Array.isArray` and flow into `vcs.workspace.parallel.dispatch({ ..., plan })`. The declared type is `readonly { agentId: string; planId: string; ... }[]`, but `JSON.parse` output is unchecked beyond the array test, so the adapter dereferences `agentId`/`planId` on non-object or shapeless entries and throws a raw TypeError (or builds nonsense workspace names like `phase-18-subagent-undefined`). That lands on gsd-tools' runMain thrown-error path instead of a typed `ok:false` envelope — defeating the stated goal of the guard ("fail closed BEFORE `createVcsAdapter` so the envelope is backend-agnostic", ASVS V5 input validation).
**Fix:**
```ts
if (
  !Array.isArray(plan) ||
  plan.some(
    (e) =>
      e === null ||
      typeof e !== 'object' ||
      typeof (e as { agentId?: unknown }).agentId !== 'string' ||
      typeof (e as { planId?: unknown }).planId !== 'string',
  )
) {
  return { data: { ok: false, reason: 'plan_not_array' } };
}
```
(or a distinct `plan_entry_invalid` reason for the element case, with matching contract tests alongside the existing CLEANUP-05 table).

### WR-02: `commitToSubrepoVerb` reports the post-commit head as `id` — on jj this is the new empty working copy's change id, not the created commit

**File:** `src/vcs-command-router.cts:886-894` (emitted: `gsd-core/bin/lib/vcs-command-router.cjs:834-843`)
**Issue:** After `subVcs.commit(...)` succeeds, the handler resolves `id = subVcs.refs.resolveShort(subVcs.refs.head)`. On the jj backend the commit verb implements the squash model: the work lands in `@-` and `@` becomes a fresh empty change — so `refs.head` resolves to the empty WC change id, not the commit that was just created. This is the same defect class already filed as the v15 todo for `gsd-tools query commit` ("query commit reports head id, not created commit"); this second occurrence in the router was not captured by that todo. Any consumer recording the returned `id` into `.planning/` artifacts will persist a change id that points at an empty revision. Mitigating context: gsd-tools' upstream case keeps dispatch ownership of `commit-to-subrepo` until the 19-07 internals migration, so this handler is currently latent — but it ships as the migration target and will become live verbatim.
**Fix:** On the jj backend resolve the parent of head (the squash destination), e.g. resolve `@-` via the expr layer, or have the adapter's `commit` return the created revision id in its result and use that instead of re-probing head. Fold this call site into the v15-query-commit-envelope-defects todo so 19-07 fixes both together.

### WR-03: `resolvePathUnderProject` falls back to the unresolved path when realpath fails — symlinked parent dirs can smuggle a nonexistent leaf past the escape guard

**File:** `src/vcs-command-router.cts:176-192` (emitted: `gsd-core/bin/lib/vcs-command-router.cjs:154-171`)
**Issue:** When `realpath(candidate)` throws (path does not exist yet), the guard compares the *non-canonicalized* candidate against the canonicalized `projectReal`. Two consequences: (a) **false accept** — for `proj/link-to-outside/newfile` where `link-to-outside` is a symlink escaping the project and `newfile` does not exist, `realpath` fails on the full path, the candidate is kept as-is, `relative()` says it is inside the project, and the path passes the guard while actually resolving outside it (Node's `realpath` requires the entire path to exist, so an existing symlinked parent with a nonexistent leaf is never canonicalized); (b) **false reject** — on macOS, an absolute `userPath` under `/tmp/...` for a nonexistent file is compared un-resolved against `projectReal` under `/private/tmp/...`, so legitimately in-project paths are rejected. Impact is bounded (the validated paths feed `vcs.commit --files`, and git/jj independently reject paths outside the repo), but the guard is the designated path-escape defense and should not depend on the VCS backend to catch what it misses.
**Fix:** When the full-path realpath fails, canonicalize the deepest existing ancestor instead of skipping canonicalization entirely:
```ts
let probe = candidate;
let suffix = '';
while (true) {
  try { realCandidate = join(await realpath(probe), suffix); break; }
  catch { suffix = join(basename(probe), suffix); probe = dirname(probe); if (probe === dirname(probe)) { realCandidate = candidate; break; } }
}
```

### WR-04: `workspaceParallelDispatchVerb` mixes flag-value guard forms — `--cwd`/`--phase`/`--main-bookmark`/`--plan` still use the truthiness form the file itself deprecates

**File:** `src/vcs-command-router.cts:1131-1147` (emitted: `gsd-core/bin/lib/vcs-command-router.cjs:1065-1085`)
**Issue:** Phase 18 upgraded only `--max-concurrency` to the `i + 1 < args.length` form (so empty-string values reach the validator), while the four sibling flags in the same loop keep `args[i + 1]` truthiness. Consequences: `--plan ''` silently skips the flag and surfaces as the misleading `plan_required` instead of a parse failure; `--cwd ''` silently falls back to `projectDir`, so the verb can operate on a different repo than the caller intended with no diagnostic; `--phase ''` is silently dropped (then caught by `phase_number_required`, masking the real cause). The file's own comments cite Phase 16 REVIEW WR-03 as the precedent that truthiness guards are a defect class — applying the fix to one of five flags in one loop leaves the inconsistency the precedent was meant to eliminate. (`workspaceParallelFanInVerb` at cts:1236-1244 has the same truthiness guards on `--cwd`/`--handle`/`--results`.)
**Fix:** Convert all flag-value checks in `workspaceParallelDispatchVerb` and `workspaceParallelFanInVerb` to `i + 1 < args.length`, matching `workspaceParallelCancelVerb` and `cleanupSubagentWorkspacesVerb`. Empty values then flow to the existing validators (`Number('')` → 0 → rejected; empty `--plan` → JSON parse failure envelope; empty `--cwd` → adapter error rather than silent wrong-repo fallback).

## Info

### IN-01: Stale module-path comments in cmd-parallel-max-concurrency-cli.test.ts

**File:** `src/vcs/__tests__/cmd-parallel-max-concurrency-cli.test.ts:11-14, 51-53`
**Issue:** The header still names `sdk/src/query/workspace-parallel-dispatch.ts` as the shipping surface, and the `vi.mock` rationale comment explains the path as `'../index.js'` resolving to "exactly the module `src/query/workspace-parallel-dispatch.ts` imports" — but the mock target is now `'../index.cjs'` and the importer is `src/vcs-command-router.cts` (which the Phase 19 note at lines 32-34 already says). The two comment generations contradict each other within one file.
**Fix:** Update lines 51-53 to describe the actual resolution: test file at `src/vcs/__tests__/` mocks `'../index.cjs'` → `src/vcs/index.cjs`, the same id `src/vcs-command-router.cts` imports via `'./vcs/index.cjs'`. Trim the retired-SDK framing in the header.

### IN-02: CLEANUP-05/06 tests cannot actually prove "guard returns BEFORE createVcsAdapter"

**File:** `src/vcs/__tests__/cmd-parallel-max-concurrency-cli.test.ts:148-153, 163-175, 196-209`
**Issue:** The describe comment claims the guards "must return BEFORE `createVcsAdapter` is reached — proven by `recordedDispatchOpts.length === 0`". But `createVcsAdapter` is mocked and side-effect-free; only `dispatch` pushes to the recorder. A regression that moved either guard to *after* `createVcsAdapter` (breaking the backend-agnostic-envelope property on a non-repo cwd, since the real factory throws there) would still pass these tests. The envelope-reason assertions are still valuable; only the ordering claim is unproven.
**Fix:** Either have the mocked `createVcsAdapter` itself record an invocation and assert that counter is 0, or soften the comment to "proven: the adapter's dispatch is never called."

### IN-03: undo.md dirty-tree guard uses a one-liner pipeline instead of the sibling gates' two-step fail-closed probe

**File:** `gsd-core/workflows/undo.md:215`
**Issue:** The three workflow gates separate the probe (`STATUS_JSON=$(...) || FATAL`) from the predicate, so a non-zero status query is caught directly. undo.md pipes `gsd_run query status --porcelain | jq -re '...'` — without `pipefail`, the displayed exit code is jq's, not the probe's. It is safe today only by a subtlety: a failed probe yields empty/garbage stdin and `jq -e` exits 4 (no output) or 5 (parse error), so the prose's "if the command FAILS, abort" still holds. That safety is an accident of jq's `-e` semantics rather than an explicit design, and diverges from the pattern the other three files share.
**Fix:** Use the same two-line form as execute-phase.md:1697-1698 (capture `STATUS_JSON` with its own `|| abort`, then run jq on the captured string).

### IN-04: dogfood-restore.sh minor hygiene — bash shebang and a leakable stderr tmpfile

**File:** `scripts/dogfood-restore.sh:1, 114-122`
**Issue:** (a) Shebang is `#!/usr/bin/env bash` while the project convention for shell scripts is zsh (pre-existing; `set -euo pipefail` and the script body are bash-idiomatic, so a port is a deliberate change, not a one-line swap). (b) `CLEANUP_STDERR_FILE` is removed by an unconditional `rm -f` at line 122, but if the script aborts between `mktemp` (114) and the `rm` (e.g. the `cat` at 119 failing under `set -e`), the tmpfile leaks. A `trap 'rm -f "$CLEANUP_STDERR_FILE"' EXIT` after the mktemp would make cleanup crash-safe.
**Fix:** Add the EXIT trap; defer the shebang question to a deliberate decision rather than an inline edit.

---

_Reviewed: 2026-06-11_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
_Supersedes: 18-REVIEW.md of 2026-06-10 (status: fixed — prior findings WR-01..05/IN-01..03 verified closed by plan 18-02 and remain closed in this re-review)_
