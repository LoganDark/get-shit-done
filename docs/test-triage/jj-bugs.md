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
| 2924 | `tests/bug-2924-worktree-head-attachment.test.cjs` | TODO | TODO | TODO | — |
| 2774 | `tests/bug-2774-worktree-cleanup-workspace-safety.test.cjs` | TODO | TODO | TODO | — |
| 3097/3099 | `tests/bug-3097-3099-executor-worktree-path-safety.test.cjs` | TODO | TODO | TODO | — |
| 2075 | `tests/bug-2075-worktree-deletion-safeguards.test.cjs` | TODO | TODO | TODO | — |
| 2431 | `tests/bug-2431-worktree-locked-surfacing.test.cjs` | TODO | TODO | TODO | — |
| 2015 | `tests/bug-2015-worktree-base-branch.test.cjs` | TODO | TODO | TODO | — |
| 2388 | `tests/bug-2388-plan-phase-no-branch-rename.test.cjs` | TODO | TODO | TODO | — |

## Research-Time Hypothesis (per 03-RESEARCH.md §"Bug-Test Triage Table")

All 7 files are hypothesized as **`carries-verbatim`** — they parse
workflow-markdown files for structural protocols, with no `git ` shell-out
in their assertion bodies. The jj-side analog tests (e.g., "bookmark didn't
auto-advance" for the 2388-inverted case) are Phase 4 WS-13's job, not
Phase 3 TEST-08's. Plan `03-06-PLAN.md` runs each test under the
jj-colocated matrix lane and updates the corresponding row with verdict
+ rationale.

---
*Created: Phase 3 plan 03-01 (D-16 scaffold). Verdicts filled in by plan
03-06; finalized by plan 03-07 (wrap-up plan asserts every row has a
non-TODO verdict).*
