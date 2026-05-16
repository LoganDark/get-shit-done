---
phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd
plan: 11
subsystem: sdk + agent-prompt + tests
tags: [gap-closure, blocker, no-raw-git, agent-prompt, regression-test, run-2, revision-1, prompt-08, vcs-20]

# Dependency graph
requires:
  - phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd/11-04
    provides: gsd-executor.md collapse (the file this plan edits at line 431)
  - phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd/11-07
    provides: workspace.assert-dispatched-cwd verb + resolveJjWorkspacePath helper this plan extends; CR-04 FATAL diagnostic dump this plan revises
provides:
  - workspace.assert-dispatched-cwd envelope additively carries primaryWorkspacePath (backend-opaque) for FATAL recovery consumption
  - agents/gsd-executor.md is raw-git-free at the read-side surface (project rule project_no_raw_git satisfied)
  - tests/agent-prompts-no-raw-git.test.cjs class-wide regression net pinning READ-ONLY raw-git deny-list at the agent-prompt-file layer
  - PROMPT-08 / VCS-20 (re-)affirmed; ready to flip BLOCKED → SATISFIED on verifier re-run
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive envelope extension on existing SDK verb (no new verb, no breaking shape change): primaryWorkspacePath joins {ok, workspaceName, workspacePath, isPrimary} at the END of the data object on BOTH success and failure branches, computed BEFORE the cwd-match loop so the failure branch carries it too — exactly the surface the agent's FATAL recovery diagnostic dump consumes."
    - "Backend-opaque envelope shape with internal vcs.kind branching: jj computes primaryWorkspacePath via resolveJjWorkspacePath (existing helper from Plan 11-07 CR-01 closure); git uses safeRealpath. Same field name, same null-on-failure shape, same backend-opacity discipline as workspaceName/workspacePath."
    - "Read-only-verb-only regex deny-list for agent prompt files: GIT_INVOCATION_RE = /\\bgit\\s+(rev-parse|status|log|ls-files|cat-file|show|describe|rev-list)\\b/. Narrowed by design — the <destructive_git_prohibition> block lists MUTATING verbs as preserved narrative documentation per Phase 11 D-04; a broader pattern would false-fire on 11+ legitimate prose mentions."
    - "Load-bearing test verification via jj restore: temporarily inject `git rev-parse` in agents/gsd-executor.md, run the regression test, confirm it FAILS with a remediation message naming the matched verb and citing project_no_raw_git, then revert via `jj restore <file>` (NOT git stash — colocated jj has no patience for raw-git rescue paths)."

key-files:
  created:
    - tests/agent-prompts-no-raw-git.test.cjs
  modified:
    - sdk/src/query/workspace-assert-dispatched-cwd.ts
    - sdk/src/vcs/__tests__/cmd-workspace-assert-dispatched-cwd.test.ts
    - agents/gsd-executor.md

key-decisions:
  - "Verifier-named fix option (c) chosen over options (a) and (b). Option (a) — `workspace.list --pick 'workspaces[0].path'` — is impossible: workspace.list is NOT a CLI verb (only workspace.assert-dispatched-cwd and workspace.parallel.* are exposed via gsd-tools top-level help). Option (b) — new `workspace.repo-root` verb — would have been overkill: a brand-new verb for a single-line agent-prompt diagnostic field. Option (c) — extend the existing verb's envelope — reuses the existing entry point that ALREADY does name→path resolution on jj (Plan 11-07 CR-01 closure), keeps the agent prompt to ONE verb call, and centralizes the name→path resolution where backend-opacity already lives."
  - "primaryWorkspacePath is computed BEFORE the cwd-match loop, not inside it, so the failure-branch return (matchedIndex === -1) STILL carries the field. This is the load-bearing design choice for PROMPT-08: the agent's FATAL recovery diagnostic dump fires precisely when the verb returns ok:false; if the field were only set on the success branch, the diagnostic would be empty exactly when needed."
  - "Field is `null` on resolution failure (empty workspace list, jj resolver returns null, git safeRealpath returns null) — same defensive shape as existing workspaceName/workspacePath. Consumers branch on `.primaryWorkspacePath // \"<unresolvable>\"` to get a printable fallback."
  - "Regression-test regex narrowed to READ-ONLY verbs (rev-parse|status|log|ls-files|cat-file|show|describe|rev-list). Broader patterns that include mutating verbs (clean, rm, checkout, reset, update-ref, push) false-fire on the preserved <destructive_git_prohibition> block (Phase 11 D-04 invariant: those mentions are intentional documentation forbidding the mutating operations, not project-rule violations). Empirically verified: narrow pattern matches exactly line 431 pre-Task-2, zero lines post-Task-2."
  - "Test (3) `'destructive_git_prohibition block is preserved'` pins the very ASYMMETRY the regex pattern relies on. If a future edit deletes the prohibition block, the next planner who wants to widen GIT_INVOCATION_RE to include mutating verbs must confront the D-04 implications first — co-evolution of the block + the pattern is explicitly forced. T-11-11-05 in the threat model."
  - "Test (2) positive pin (`assert.match(content, /primaryWorkspacePath \\/\\/ \"<unresolvable>\"/)`) protects against a future edit that removes BOTH the raw git AND the jq read together — without the positive pin, REPO_ROOT could end up undefined and the test would still pass (test (1) only asserts the negative)."
  - "Comment text in agents/gsd-executor.md describing the change had to be rephrased to avoid containing the literal string `git rev-parse --show-toplevel` — even in a comment, the read-only-verb pattern would match the narrative reference. Rephrased to 'previous raw-VCS toplevel probe' which captures the same semantic without tripping the regex. This is a load-bearing design constraint: the regex is FILE-LEVEL, not AST-level, so prose-mentions must avoid the deny-list literals."
  - "Task 1 added a NEW Scenario 5 to the SDK test (in-repo cwd that does NOT match any workspace, projectDir=jj repo, cwd=<dir>/.planning/phases/11-test/). Pre-Plan-11-11 the only failure-branch test (Scenario 3) used cwd=outsideTmp/projectDir=outsideTmp — which made vcs.workspace.list() run against a non-repo path and return empty. Scenario 5 fires the same failure-branch path BUT against a real jj repo, so primaryWorkspacePath resolves to a real fs path — the load-bearing assertion for PROMPT-08 BLOCKER closure. Scenario 3 stays as the legacy CR-01 pin."

requirements-completed: [PROMPT-08, VCS-20]

# Metrics
duration: 15min
completed: 2026-05-16
---

# Phase 11 Plan 11: PROMPT-08 BLOCKER closure — retire raw git from agent prompt + class-wide regression net Summary

**Closed VERIFICATION.md (re-verification pass 2) PROMPT-08 BLOCKER + class-wide regression-test gap. `agents/gsd-executor.md` is now raw-git-free at the read-side surface — `git rev-parse --show-toplevel` retired from line 431 in favor of a jq read of `primaryWorkspacePath` from the SDK verb's envelope. New `tests/agent-prompts-no-raw-git.test.cjs` pins the READ-ONLY raw-git deny-list at the agent-prompt-file layer with a narrow-by-design regex that does not false-fire on the preserved `<destructive_git_prohibition>` block. PROMPT-08 / VCS-20 ready to flip BLOCKED → SATISFIED on verifier re-run.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 3 (extend verb + extend SDK test / rewire agent prompt / create regression test)
- **Files created:** 1 (tests/agent-prompts-no-raw-git.test.cjs)
- **Files modified:** 3 (verb body + SDK test + agent prompt)

## Accomplishments

- **Task 1 (envelope extension):** `sdk/src/query/workspace-assert-dispatched-cwd.ts` envelope additively carries `primaryWorkspacePath` (resolved fs path of `entries[0]`) on BOTH success and failure branches. Computed BEFORE the cwd-match loop so the failure branch (`ok:false`) carries it too — exactly the surface the agent's FATAL recovery diagnostic dump needs. jj resolves via existing `resolveJjWorkspacePath` (Plan 11-07 CR-01 closure); git uses `safeRealpath`. Backend-opaque envelope shape preserved. SDK parity test extended from 4 → 5 scenarios with the new field pinned across all scenarios + a new Scenario 5 (in-repo cwd that does NOT match any workspace) that is the load-bearing failure-branch assertion for PROMPT-08.
- **Task 2 (agent prompt rewire):** `agents/gsd-executor.md:431` replaced — `REPO_ROOT=$(git rev-parse --show-toplevel || jj workspace root || echo "<unresolvable>")` → `REPO_ROOT=$(echo "$DISPATCH_CHECK" | jq -r '.primaryWorkspacePath // "<unresolvable>"')`. Single jq read from the existing `$DISPATCH_CHECK` payload (captured at line 419). Surrounding comment block updated to reflect the verb-mediated sourcing. Comment text rephrased to AVOID containing the literal `git rev-parse --show-toplevel` (which would trip the Task 3 regex even in narrative). DISPATCH_CHECK invocation, OK/IS_PRIMARY/WS_NAME jq extractions, FATAL/RECOVERY echo messages, exit 1, closing fi, AND the full `<destructive_git_prohibition>` block (Phase 11 D-04) all preserved verbatim.
- **Task 3 (class-wide regression net):** New `tests/agent-prompts-no-raw-git.test.cjs` reads `agents/gsd-executor.md` and asserts the negative (no read-only raw-git invocations matching `(rev-parse|status|log|ls-files|cat-file|show|describe|rev-list)`), the positive (the SDK-mediated `primaryWorkspacePath` jq read is present), and the D-04 invariant (`<destructive_git_prohibition>` block preserved). 4 tests, all green. Load-bearing verified — temporarily inject `git rev-parse --show-toplevel` → test FAILS with full remediation message → `jj restore` → test passes.

## Verifier-option trade-off (option (c) vs (a) vs (b))

VERIFICATION.md `missing:` line 45 enumerated three fix options for the raw-`git rev-parse` BLOCKER:

| Option | Description | Status | Rationale |
|---|---|---|---|
| (a) | Use existing `gsd-sdk query workspace.list --pick 'workspaces[0].path'` | **Impossible** | `workspace.list` is NOT a CLI verb — only `workspace.assert-dispatched-cwd` and `workspace.parallel.{dispatch,fan-in}` are exposed via gsd-tools top-level help. Plumbing a new CLI surface for one diagnostic field is more work than option (c). |
| (b) | Add a new `gsd-sdk query repo-root` verb | **Overkill** | Brand-new verb, new manifest entry, new CLI bridge, new tests — all for a single agent-prompt diagnostic line. The envelope extension in (c) accomplishes the same goal with one field. |
| (c) | **Extend `workspace.assert-dispatched-cwd` envelope with the resolved primary path** | **CHOSEN** | Reuses an existing entry point that ALREADY does name→path resolution on jj (Plan 11-07 CR-01 closure). Keeps the agent prompt to ONE verb call ($DISPATCH_CHECK already captured at line 419). Centralizes name→path resolution where backend-opacity already lives. Additive, non-breaking. |

## Envelope shape diff (before/after)

**Before (Plan 11-07):**

```json
// success/match branch
{ "ok": true|false, "workspaceName": "agent-1", "workspacePath": "/path/to/dispatched-ws", "isPrimary": false }
// failure/no-match branch
{ "ok": false, "workspaceName": null, "workspacePath": null, "isPrimary": false }
```

**After (Plan 11-11):**

```json
// success/match branch — git AND jj produce identical shape
{ "ok": true|false, "workspaceName": "agent-1", "workspacePath": "/path/to/dispatched-ws", "isPrimary": false, "primaryWorkspacePath": "/path/to/main-repo" }
// failure/no-match branch — primaryWorkspacePath STILL present (load-bearing)
{ "ok": false, "workspaceName": null, "workspacePath": null, "isPrimary": false, "primaryWorkspacePath": "/path/to/main-repo" }
```

Backend-opacity: same envelope shape on both backends. `primaryWorkspacePath` is computed via `safeRealpath(entries[0].path)` on git and `resolveJjWorkspacePath(cwd, entries[0].path)` on jj — but the CONSUMER (agent prompt's jq read) doesn't observe the difference.

## Agent-prompt diff (one-line replacement)

```diff
-  REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || jj workspace root 2>/dev/null || echo "<unresolvable>")
+  REPO_ROOT=$(echo "$DISPATCH_CHECK" | jq -r '.primaryWorkspacePath // "<unresolvable>"')
```

Pre/post grep proof (narrow read-only-verb pattern):

```
$ grep -nE '\bgit\s+(rev-parse|status|log|ls-files|cat-file|show|describe|rev-list)\b' agents/gsd-executor.md
# pre-Task-2:
431:  REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || jj workspace root 2>/dev/null || echo "<unresolvable>")
# post-Task-2:
(no matches)
```

## Revision-1 pattern-narrowing rationale

The plan was revised once after plan-checker iter 1. The most-load-bearing fix was the regression-test pattern choice:

- **Originally proposed (BROAD pattern):** `(rev-parse|status|log|ls-files|cat-file|show|describe|rev-list|clean|rm|checkout|reset|update-ref|push)` — read AND mutating verbs.
- **Empirical false-fire count on the BROAD pattern:** 11+ matches inside the `<destructive_git_prohibition>` block (lines ~498-525), where lines like `- 'git clean' (any flags — ...)` and `- 'git push --force' / 'git push -f'` are intentional documentation forbidding those operations.
- **Revised (NARROW pattern):** `(rev-parse|status|log|ls-files|cat-file|show|describe|rev-list)` — READ-ONLY verbs only.
- **Empirical hit count on the NARROW pattern:** exactly 1 line on the pre-Task-2 file (line 431), zero lines post-Task-2.
- **Asymmetry rationale:** the `<destructive_git_prohibition>` block lists MUTATING verbs by design (Phase 11 D-04: preserved verbatim). Read-only verbs have NO narrative analog in the prohibition prose. The narrow pattern catches the actual defect class (line 431 was `git rev-parse`, a READ verb) without exempting legitimate documentation.

If a future regression introduces a MUTATING raw-git invocation in agent prompts, the existing project-wide lint (`scripts/lint-no-raw-git.sh` / `lint-vcs-no-raw-git.allow.json`) catches it; this file-scoped test focuses on the read-side surface where defenses were thinnest. T-11-11-03 + T-11-11-05 in the threat model capture both the trade-off and the co-evolution forcing.

## Load-bearing test verification (Task 3 acceptance)

Procedure (Task 3 acceptance criterion):

```bash
# 1. Inject raw git on a scratch line at end of agents/gsd-executor.md
python3 -c "...inject scratch line 'git rev-parse --show-toplevel'..."

# 2. Run the regression test — MUST fail
node --test tests/agent-prompts-no-raw-git.test.cjs
# → AssertionError on test (1) "agents/gsd-executor.md contains no read-only raw git invocations"
#   with remediation message citing project_no_raw_git and Plan 11-11

# 3. Revert via jj restore (NOT git stash — Plan 11-10 revision-1 WARNING 2 closure)
jj restore agents/gsd-executor.md

# 4. Verify scratch line gone
grep -F 'SCRATCH-TEST' agents/gsd-executor.md  # → no match

# 5. Re-run test — MUST pass
node --test tests/agent-prompts-no-raw-git.test.cjs
# → ✔ tests 4 / pass 4 / fail 0
```

Executed end-to-end. The test is genuinely load-bearing, not a no-op smoke check.

## File:line Changes

`sdk/src/query/workspace-assert-dispatched-cwd.ts`:
- Docstring (lines 1-22 pre-edit) expanded to document the new `primaryWorkspacePath` field and its Plan 11-11 rationale.
- New computation block (after `entries` retrieval, before the cwd-match loop): `const primaryWorkspacePath: string | null = entries.length === 0 ? null : vcs.kind === 'jj' ? resolveJjWorkspacePath(cwd, entries[0].path) : safeRealpath(entries[0].path)`.
- BOTH return statements (failure branch + success branch) now include `primaryWorkspacePath` at the end of the `data` object.

`sdk/src/vcs/__tests__/cmd-workspace-assert-dispatched-cwd.test.ts`:
- File-level docstring extended to document the Plan 11-11 extension.
- Type cast on each scenario's `d` literal extended with `primaryWorkspacePath: string | null`.
- Scenario 1, 2, 3 (existing): added `primaryWorkspacePath` assertions where appropriate.
- Scenario 3 (in-tmpdir, projectDir=outsideTmp): pre-existing behavior preserved — empty workspace list → primaryWorkspacePath omitted from assertion (the cwd is outside any repo so there's no entries[0] to resolve).
- Scenario 5 (NEW, load-bearing): in-repo cwd `<dir>/.planning/phases/11-test/` that does NOT match any workspace, with `projectDir=dir` (the jj repo). vcs.workspace.list() runs against the real repo, matchedIndex === -1, failure-branch return — but `primaryWorkspacePath` MUST still resolve to `realpath(dir)`. This is the precise surface the agent's FATAL recovery diagnostic dump consumes.
- Scenario 4 (git parity): extended with `primaryWorkspacePath` resolves-to-main-repo assertion to pin backend-opacity.

`agents/gsd-executor.md`:
- Line 431: `REPO_ROOT=$(git rev-parse --show-toplevel ...)` → `REPO_ROOT=$(echo "$DISPATCH_CHECK" | jq -r '.primaryWorkspacePath // "<unresolvable>"')`.
- Comment block (lines 424-428) rewritten to describe the verb-mediated sourcing AND deliberately avoid containing the literal `git rev-parse --show-toplevel` (which would trip the Task 3 read-only-verb regex on its own narrative).
- DISPATCH_CHECK invocation, OK/IS_PRIMARY/WS_NAME jq extractions, FATAL/RECOVERY echo statements, exit 1, closing fi — all preserved.
- `<destructive_git_prohibition>` block (lines 497-529) — UNTOUCHED (Phase 11 D-04 invariant).

`tests/agent-prompts-no-raw-git.test.cjs`:
- NEW FILE.
- `'use strict';` + `allow-test-rule` comment header per `tests/quick-md-parallel-dispatch.test.cjs` convention.
- File-level docstring citing CLAUDE.md, MEMORY entry `project_no_raw_git`, VERIFICATION.md SC-2, Plan 11-11, AND the revision-1 pattern-narrowing rationale.
- `AGENT_FILES = ['agents/gsd-executor.md']` (extension-ready array).
- `GIT_INVOCATION_RE = /\bgit\s+(rev-parse|status|log|ls-files|cat-file|show|describe|rev-list)\b/` — READ-ONLY verb subset only.
- 4 tests under one describe block: (1) negative pin per file, (2) positive pin on `primaryWorkspacePath // "<unresolvable>"`, (3) `<destructive_git_prohibition>` block preservation (D-04 invariant), (4) AGENT_FILES iteration.
- Failure messages cite `project_no_raw_git` and name the matched verb.

## Closure Evidence

```
$ grep -F 'git rev-parse' agents/gsd-executor.md
(no matches — BLOCKER closed)

$ grep -F 'primaryWorkspacePath // "<unresolvable>"' agents/gsd-executor.md
431:  REPO_ROOT=$(echo "$DISPATCH_CHECK" | jq -r '.primaryWorkspacePath // "<unresolvable>"')

$ grep -cE '\bgit\s+(rev-parse|status|log|ls-files|cat-file|show|describe|rev-list)\b' agents/gsd-executor.md
0

$ grep -c 'primaryWorkspacePath' sdk/src/query/workspace-assert-dispatched-cwd.ts
8

$ grep -c '<destructive_git_prohibition>' agents/gsd-executor.md
1  (Phase 11 D-04 invariant preserved)

$ cd sdk && pnpm tsc --noEmit
(exit 0 — no errors)

$ cd sdk && pnpm vitest run src/vcs/__tests__/cmd-workspace-assert-dispatched-cwd.test.ts
Test Files  1 passed (1)
Tests       5 passed (5)

$ node --test tests/agent-prompts-no-raw-git.test.cjs
✔ tests 4 / pass 4 / fail 0

$ node --test tests/quick-md-parallel-dispatch.test.cjs tests/jj-parallel-no-manifest-write.test.cjs tests/agent-prompts-no-raw-git.test.cjs
✔ tests 17 / pass 17 / fail 0 (no regression across cross-cutting tests)
```

## Task Commits

1. **Task 1: feat(11-11) verb envelope extension + SDK test parity** — change_id `kpxxwtyk` (feat; additive primaryWorkspacePath field on both branches; 5/5 scenarios green).
2. **Task 2: fix(11-11) retire raw git rev-parse from agent prompt** — change_id `wttwptsp` (fix; one-line jq read replacement + comment rephrase to avoid narrative trip).
3. **Task 3: test(11-11) class-wide regression net** — change_id `zvkywsnp` (test; 4 tests; load-bearing-verified via inject + jj restore round-trip).

## PROMPT-08 / VCS-20 Status

Both move from BLOCKED → ready-for-SATISFIED on verifier re-run:

- **PROMPT-08** ("subagent prompts never inspect backend kind — no raw `git`, no `vcs.kind` branching"): the prior structural collapse from Plan 11-04 + Plan 11-07 is preserved; the new violation introduced by Plan 11-07 CR-04 closure (raw `git rev-parse` at line 431) is REMOVED. The "backend kind never exposed" intent now holds at BOTH the dispatched-cwd-check layer AND the recovery-diagnostic layer. The new class-wide regression test pins this at file level for future regressions.
- **VCS-20** ("workspace.assert-dispatched-cwd SDK verb backend-opaque"): envelope additively gains `primaryWorkspacePath`; same backend-opaque shape on both backends.

REQUIREMENTS.md line 122 (PROMPT-08 marked "Complete") was inconsistent with verifier truth pre-Plan-11-11 — it now becomes consistent.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan's acceptance criterion for Scenario 3 was self-inconsistent**
- **Found during:** Task 1 verification (first vitest run failed Scenario 3).
- **Issue:** The plan's Task 1 acceptance criterion required adding a NEW test case where "cwd is set to a path outside the workspace list so `matchedIndex === -1` but `primaryWorkspacePath` is STILL the resolved fs path of `entries[0]`." The plan implied extending the existing Scenario 3 (cwd=outsideTmp, projectDir=outsideTmp) but that scenario operates on a non-repo path — `createVcsAdapter(outsideTmp)` returns an empty workspace list there, so `entries[0]` doesn't exist and `primaryWorkspacePath` is necessarily null. The plan's intent could not be satisfied by mutating Scenario 3.
- **Fix:** Kept Scenario 3 as the legacy CR-01 pin (cwd=outsideTmp, projectDir=outsideTmp, all fields null — the original failure-branch behavior). ADDED Scenario 5 (in-repo cwd that does NOT match any workspace: `<dir>/.planning/phases/11-test/`, projectDir=dir) which is the actual load-bearing assertion the plan wanted — vcs.workspace.list() against a real jj repo returns real entries; matchedIndex === -1 because the cwd isn't a workspace; primaryWorkspacePath MUST still resolve to the repo root.
- **Files modified:** sdk/src/vcs/__tests__/cmd-workspace-assert-dispatched-cwd.test.ts (Scenario 3 unchanged in intent; Scenario 5 added).
- **Commit:** `kpxxwtyk` (Task 1).
- **Verification:** Scenario 5 is the test that would FAIL pre-Task-1 (primaryWorkspacePath field absent from envelope); Scenario 3 continues to pin the legacy contract. Both green post-Task-1.

**2. [Rule 1 - Bug] Task 2's comment text trip on the read-only-verb regex**
- **Found during:** Task 2 verification (re-grep failed after first edit).
- **Issue:** The replacement comment in `agents/gsd-executor.md` (lines 424-432) needed to describe the change. The first revision contained the literal phrase "Plan 11-11 retired that raw `git rev-parse --show-toplevel` shell-out" — which is INTENDED prose, but the Task 3 regex is FILE-LEVEL and matches the narrative reference. The comment as written would have caused Task 3's test to fail on green state.
- **Fix:** Rephrased the comment from `raw 'git rev-parse --show-toplevel' shell-out` to `previous raw-VCS toplevel probe`. Same semantic, no deny-list literals.
- **Files modified:** agents/gsd-executor.md.
- **Commit:** `wttwptsp` (Task 2).
- **Verification:** post-edit grep returns 0 hits for both `git rev-parse` literal AND read-only-verb regex.

**Total deviations:** 2 (both bugs in the plan's own self-consistency; both fixed inline without widening scope).

## Issues Encountered

None blocking. SDK tsc clean throughout; vitest green at Task 1 completion; agent-prompt regex green at Task 2 completion; node:test green at Task 3 completion. Load-bearing inject-and-revert round-trip succeeded as designed.

## User Setup Required

None — pure SDK + agent prompt + test file edits. No new dependencies, no jj/git version requirements beyond what Plan 11-07 already established.

## Out-of-scope (deferred to a future plan or phase)

Per the plan's `must_haves.truths` deferred list, the following VERIFICATION.md / REVIEW.md items are NOT addressed by Plan 11-11 because none are goal-blocking for PROMPT-08:

| Item | Source | Disposition | One-line justification |
|---|---|---|---|
| WR-01 | dispatch-cwd-safety.md protected-ref doc overstatement | Deferred | Documentation hygiene; the verb already does NOT inspect HEAD, the doc just overstates the guarantee. No correctness impact. |
| WR-02 | N+1 jj subprocess pattern in workspace-assert-dispatched-cwd.ts | Deferred | Latency optimization (one `jj workspace root --name` per workspace); flagged as Phase 14 watch-item, not Phase 11 blocker. Plan 11-11's additive primaryWorkspacePath ALSO uses this pattern (one extra call per invocation) but the dispatch failure case is rare. |
| WR-03 | cmd-workspace-assert-dispatched-cwd.test.ts backend-opacity-as-invariant pin | Deferred | Info-level; current parity tests assert per-backend behavior, not the cross-backend invariant per se. Plan 11-11's primaryWorkspacePath pinning adds a partial backend-opacity invariant for the new field. |
| WR-04 | cleanFanIn predicate duplicated literal in worktree-safety.cjs | Deferred | Unrelated file; refactor hygiene, no correctness impact. |
| WR-05 | tests/wave-cleanup-executor.test.cjs missing combined failure mode | Deferred | Unrelated file; test coverage expansion, not a regression. |
| IN-02 | dispatch-cwd-safety.md recovery section orchestrator-retry guidance | Deferred | Documentation expansion; the doc says recovery is the orchestrator's responsibility but neither workflow file wires retry logic. Not a PROMPT-08 blocker. |
| IN-03 | manifest-retirement comment duplication across 4 files | Deferred | Single-source-of-truth concern; documentation hygiene only. |

## Pointer to sibling plan

Plan 11-10 (run-2 sibling, BLOCKER cluster A — PROMPT-06 closure) landed in the same wave (Wave 5) immediately before this plan. The next verifier pass should read both 11-10-SUMMARY.md and this 11-11-SUMMARY.md together — they collectively close all three NEW BLOCKERs introduced by the run-1 gap-closure work (Plans 11-07, 11-08, 11-09).

## Self-Check

- `sdk/src/query/workspace-assert-dispatched-cwd.ts` — FOUND (modified, primaryWorkspacePath added to both return shapes)
- `sdk/src/vcs/__tests__/cmd-workspace-assert-dispatched-cwd.test.ts` — FOUND (modified, 5 scenarios green)
- `agents/gsd-executor.md` — FOUND (modified, raw git rev-parse retired at line 431)
- `tests/agent-prompts-no-raw-git.test.cjs` — FOUND (created)
- Commit `kpxxwtyk…` (Task 1) — FOUND
- Commit `wttwptsp…` (Task 2) — FOUND
- Commit `zvkywsnp…` (Task 3) — FOUND
- `cd sdk && pnpm tsc --noEmit` — exits 0
- `cd sdk && pnpm vitest run src/vcs/__tests__/cmd-workspace-assert-dispatched-cwd.test.ts` — 5/5 green
- `node --test tests/agent-prompts-no-raw-git.test.cjs` — 4/4 green
- `node --test tests/quick-md-parallel-dispatch.test.cjs tests/jj-parallel-no-manifest-write.test.cjs tests/agent-prompts-no-raw-git.test.cjs` — 17/17 green
- `grep -F 'git rev-parse' agents/gsd-executor.md` — 0 hits (BLOCKER closed)
- `grep -cE '\bgit\s+(rev-parse|status|log|ls-files|cat-file|show|describe|rev-list)\b' agents/gsd-executor.md` — 0 hits
- Load-bearing test verification: inject + run-fail + jj restore + run-pass round-trip executed successfully

## Self-Check: PASSED

---
*Phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd*
*Completed: 2026-05-16*
