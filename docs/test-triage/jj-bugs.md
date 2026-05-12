# Worktree-Bug Test Triage on jj-colocated (TEST-08 / Phase 3 D-16)

**Purpose:** Per-test verdicts recorded **as tests surface under the
`jj-colocated` matrix lane**, not upfront (D-16). The wrap-up plan
(`03-07-PLAN.md`) asserts every row has a non-TODO verdict before phase
close.

**Verdict rubric** (per `03-RESEARCH.md` §"Bug-Test Triage Table"):
- `jj-mapped` — test premise translates cleanly to jj equivalents; the
  test was updated to assert the jj-side protocol.
- `git-only` — test premise is git-specific (e.g., refs/HEAD-attachment
  protocol). Documented with rationale; the test stays git-only and the
  jj-side analog (if any) is filed as a Phase 4 follow-up.
- `carries-verbatim` — test asserts workflow-markdown structural protocol
  with no VCS-specific shell-out; passes unchanged on both backends.

| Bug | Test path | jj behavior observed | Verdict | Rationale | Follow-up phase |
|-----|-----------|----------------------|---------|-----------|-----------------|
| 2924 | `tests/bug-2924-worktree-head-attachment.test.cjs` | 125/125 pass under `GSD_TEST_BACKENDS=jj-colocated`; asserts execute-phase.md / quick.md / gsd-executor.md structural protocol (symbolic-ref HEAD check, `git update-ref refs/heads/<protected>` prohibition, --no-verify default removed); zero VCS shell-out from assertion bodies | carries-verbatim | Markdown-structural test of workflow .md files; no `vcsTest` fixture, no `execSync`/`spawnSync` invocations of `git` or `jj` outside the literal strings being parsed inside .md content; backend-agnostic by construction. The protocol it pins (worktree HEAD safety, update-ref prohibition) applies equally to jj-colocated workspaces — the same guards remain correct guidance. | — |
| 2774 | `tests/bug-2774-worktree-cleanup-workspace-safety.test.cjs` | 7/7 pass under jj-colocated; asserts execute-phase.md / quick.md cleanup blocks use INCLUSION-based filter (`.claude/worktrees/agent-`) rather than EXCLUSION `grep -v "$(pwd)$"` | carries-verbatim | No VCS fixture; pure regex/substring assertions over workflow markdown. The cleanup-safety invariant (don't wipe sibling workspaces) is backend-independent: jj-colocated workspaces under `.claude/worktrees/agent-*` are matched by the same path-prefix filter. Future Phase 4 WS-* work may reshape the cleanup block when jj-native (non-colocated) lands, but the inclusion-filter invariant survives. | Phase 4 WS-13 (revisit if jj-native cleanup shape diverges) |
| 3097/3099 | `tests/bug-3097-3099-executor-worktree-path-safety.test.cjs` | 7/7 pass under jj-colocated; asserts gsd-executor.md sentinel pattern for cwd-drift detection (`$WT_GIT_DIR/gsd-spawn-toplevel`) and absolute-path containment check against `git rev-parse --show-toplevel` | carries-verbatim | Markdown-structural test: parses agent prompt files for the presence of the cwd-drift sentinel + path-containment guard. Both invariants are about preventing Bash `cd` desync, not about git internals — the cwd-drift problem exists identically under jj-colocated worktrees. A future jj-native worktree replacement would need an equivalent sentinel using `jj workspace root` instead of `git rev-parse --show-toplevel`; Phase 4 WS-13 owns that translation. | Phase 4 WS-13 (jj-native sentinel using `jj workspace root`) |
| 2075 | `tests/bug-2075-worktree-deletion-safeguards.test.cjs` | 8/8 pass under jj-colocated; asserts gsd-executor.md prohibits `git clean` inside a worktree and lists the destructive command deny-list (`git clean`, `git rm` on non-task files, `git checkout -- .`, `git reset --hard`, `git push --force` to unowned branches, `git update-ref refs/heads/<protected>`) | carries-verbatim | The deny-list lives in agent-prompt markdown; the test parses it structurally. Backend-independent: jj-colocated agents are equally prohibited from running `git clean` (which would corrupt the colocated workspace's working copy and confuse jj's snapshot). Phase 4 may add a parallel `jj abandon` / `jj op restore` deny-list when jj-native workspace teardown lands, but the git-side prohibitions stay correct as written. | Phase 4 WS-13 (add jj-side destructive-command deny-list) |
| 2431 | `tests/bug-2431-worktree-locked-surfacing.test.cjs` | 10/10 pass under jj-colocated; asserts quick.md / execute-phase.md no longer use `git worktree remove ... 2>/dev/null \|\| true` (silent-fail) and DO surface a recovery message on lock failure | carries-verbatim | Markdown-structural assertion only. The "surface locked-worktree errors" invariant applies to any worktree backend (git or hypothetical jj-future-equivalent). jj has no lock primitive in the workspace.list/forget contract (Phase 3 plan 03-06 `WorkspaceInfo.locked` is always `false`), so the analogous jj-side test would be a no-op. The current test stays correct as written for the git-colocated case. | — |
| 2015 | `tests/bug-2015-worktree-base-branch.test.cjs` | 4/4 pass under jj-colocated; asserts the worktree_branch_check block in execute-phase.md / quick.md uses `git reset --hard` (not `--soft`) when the worktree was created from the wrong base | carries-verbatim | Pure markdown-pattern assertion. The git-only `reset --hard` recovery is a git-specific recipe (jj-native would use `jj abandon` + `jj edit @-` or similar), but the TEST itself is parsing workflow markdown that targets git-colocated workspaces (the only worktree backend supported in Phase 3). Phase 4 owns the jj-native equivalent workflow text — a parallel test would assert the jj-side recipe at that point. | Phase 4 WS-13 (jj-native equivalent of branch-base recovery) |
| 2388 | `tests/bug-2388-plan-phase-no-branch-rename.test.cjs` | 4/4 pass under jj-colocated; asserts plan-phase.md does NOT include a silent `git branch -m` rename of the feature branch | carries-verbatim | Markdown-structural pattern assertion. The "no silent branch rename" invariant is policy-level (planner prompts must not mutate naming behind the user's back), backend-agnostic. A jj-side analog ("planner must not silently `jj bookmark move main`") would be a parallel Phase 4 test if/when jj-native planner integration lands. | Phase 4 WS-13 (jj-side analog: no silent `jj bookmark move`) |

## Research-Time Hypothesis (per 03-RESEARCH.md §"Bug-Test Triage Table")

All 7 files are hypothesized as **`carries-verbatim`** — they parse
workflow-markdown files for structural protocols, with no `git ` shell-out
in their assertion bodies. The jj-side analog tests (e.g., "bookmark didn't
auto-advance" for the 2388-inverted case) are Phase 4 WS-13's job, not
Phase 3 TEST-08's. Plan `03-06-PLAN.md` runs each test under the
jj-colocated matrix lane and updates the corresponding row with verdict
+ rationale.

**Empirical confirmation (plan 03-06 Task 2):** All 7 tests passed under
`GSD_TEST_BACKENDS=jj-colocated node --test <file>` with 0 fails, 0 skips,
0 unexpected behavior. None of the 7 files use the `vcsTest()` fixture
(confirmed via `grep -l vcsTest`). The hypothesis holds across all 7
rows. No ESCALATIONS surfaced — no test revealed an adapter bug.

---
*Populated: Phase 3 plan 03-06 (D-16). Verdicts finalized by plan 03-06;
plan 03-07 wrap-up asserts every row has a non-TODO verdict before phase
close.*

---
*Finalized: Phase 3 plan 03-07 close (2026-05-12). All 7 verdicts populated
by plan 03-06; phase-close invariant check confirms no TODO rows remain
(`grep -c '| TODO |' docs/test-triage/jj-bugs.md` = 0). Phase 4 follow-ups
(WS-13: jj-native sentinel using `jj workspace root`, jj-side
destructive-command deny-list, jj-native branch-base recovery, no-silent-
bookmark-move analog) filed inline in the "Follow-up phase" column. No
ESCALATIONS — no test surfaced an adapter bug under the jj-colocated lane.*
