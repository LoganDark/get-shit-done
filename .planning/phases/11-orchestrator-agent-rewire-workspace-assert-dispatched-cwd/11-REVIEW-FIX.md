---
phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd
fixed_at: 2026-05-16T16:08:00Z
review_path: .planning/phases/11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd/11-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 11: Code Review Fix Report

**Fixed at:** 2026-05-16T16:08:00Z
**Source review:** `.planning/phases/11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd/11-REVIEW.md`
**Iteration:** 1

**Summary:**

- Findings in scope: 4 (WR-N01 .. WR-N04 — all warnings; no critical/blocker findings present in REVIEW.md)
- Fixed: 4
- Skipped: 0

Out-of-scope findings (info-level IN-N01 .. IN-N03) were intentionally not addressed under the default `critical_warning` fix scope; they remain documented in REVIEW.md for follow-up.

## Fixed Issues

### WR-N01: Empty `WAVE_WORKTREE_PLANS` causes phantom workspace dispatch

**Files modified:** `get-shit-done/workflows/execute-phase.md`
**Commit:** `swwzustr` (change_id `swwzustryuxt`)
**Applied fix:** Added an explicit `[ -z "$WAVE_WORKTREE_PLANS" ]` guard immediately before the `WAVE_WORKTREE_PLANS_JSON=$(...)` jq pipeline (now at lines 549-559 of execute-phase.md). The guard emits a clean FATAL with operator-facing RECOVERY guidance pointing at the per-plan-worktree-gate.md state machine, preventing the pipeline from emitting `[{"agentId":"","planId":""}]` on an empty accumulator. Also expanded the inline comment block to document the zero-element edge case explicitly (closes part of IN-N01's documentation gap as a side effect).

### WR-N02: `GIT_INVOCATION_RE` read-only verb list incomplete

**Files modified:** `tests/agent-prompts-no-raw-git.test.cjs`
**Commit:** `xwqqluzp` (change_id `xwqqluzpnmky`) — landed together with WR-N03; the two fixes are tightly coupled (widening the regex without the carve-out would false-fire on 11 prohibition-block mentions).
**Applied fix:** Widened `GIT_INVOCATION_RE` from the read-only 8-verb subset to the full 28-verb surface — adding all 16 read verbs called out in WR-N02 (`diff`, `branch`, `worktree`, `config`, `for-each-ref`, `symbolic-ref`, `merge-base`, `name-rev`, `tag`, `blame`, `remote`, `reflog`, `grep`, `ls-tree`, `fsck`, `fetch`) plus the 6 mutating verbs from the destructive-prohibition class (`clean`, `rm`, `checkout`, `reset`, `update-ref`, `push`). The file-level docstring was rewritten to reflect the new verb-agnostic stance (per `project_no_raw_git`: every raw-git read perturbs colocated jj state).

### WR-N03: `<destructive_git_prohibition>` block exemption implicit, not enforced

**Files modified:** `tests/agent-prompts-no-raw-git.test.cjs`
**Commit:** `xwqqluzp` (change_id `xwqqluzpnmky`) — same commit as WR-N02.
**Applied fix:** Added a positional carve-out (`PROHIBITION_RE` + `stripProhibitionBlock(content)`) that strips the `<destructive_git_prohibition>` block before applying `GIT_INVOCATION_RE`, decoupling regex safety from the block's prose. Refactored the failing-test-1 and AGENT_FILES iteration test to consume `stripProhibitionBlock(content)` instead of raw content. Added a new test (5) — the WR-N03 D-04 co-evolution meta-assertion — that pins the prohibition block's mutating-verb count at ≥11 (matching the docstring's "11+" claim). The meta-assertion forces planners who want to widen the regex AND delete prohibition-block prose to re-examine the invariant: a planner reading test (5) gets an automated signal that the two changes are coupled, instead of relying on review-prose attention.

All 5 tests in `tests/agent-prompts-no-raw-git.test.cjs` pass against current `agents/gsd-executor.md` (verified via `node --test`).

### WR-N04: Behavioral surface of `"<unresolvable>"` REPO_ROOT not pinned

**Files modified:** `sdk/src/vcs/__tests__/cmd-workspace-assert-dispatched-cwd.test.ts`
**Commit:** `ywtkrrkp` (change_id `ywtkrrkpvozr`)
**Applied fix:** Adopted REVIEW.md's recommended option (a) — added an explicit `expect(d.primaryWorkspacePath).toBeNull()` assertion to Scenario 3 (cwd outside any repo). Updated the scenario title to advertise the new pin and added an inline comment explaining the load-bearing semantics: the agent's `jq -r '.primaryWorkspacePath // "<unresolvable>"'` fallback fires only on JSON `null`, so a silent regression that emitted `""` or `undefined` would have degraded the operator-facing FATAL diagnostic without tripping any other assertion. The SDK verb body at `workspace-assert-dispatched-cwd.ts:108-113` explicitly returns `null` for `entries.length === 0`, so this assertion exercises the existing contract — no SDK change required.

All 5 scenarios in the file pass (verified via `pnpm exec vitest run`).

## Skipped Issues

None — all 4 in-scope findings were fixed.

---

_Fixed: 2026-05-16T16:08:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
