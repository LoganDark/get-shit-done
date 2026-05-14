---
phase: 07-reconcile-fork-capabilities-with-upstream-add-missing-adapte
plan: 03
subsystem: workflows
tags:
  - workflows
  - markdown
  - dead-code-removal
  - phase-7
dependencies:
  requires:
    - "Plan 07-02 (executeWorktreeWaveCleanupPlan wired through real adapter verbs — fallback is now provably dead code)"
  provides:
    - "Workflow .md files contain a single unconditional `gsd-sdk query worktree.cleanup-wave` call (no more if/else/fi conditional fallback)"
    - "242 LOC of dead raw-git fallback retired from workflows"
    - "PROMPT-04 closed — workflow .md no longer carries the TODO(jj-port) cleanup-wave fallback"
  affects:
    - "Plan 07-05 (test-surface triage — workflow-execution-driven test failures cannot root to the dead fallback now)"
    - "Future v1.x multi-runtime projection (install.js transform pipeline already handles Codex/Gemini/OpenCode variants at install time per Phase 5 PROMPT-03)"
tech-stack:
  added: []
  patterns:
    - "Default-to-hard-delete (CONTEXT D-15) — TODO(jj-port) comments imply the fallback is dead once verbs land; planner confirmed via Plan 07-02 GREEN tests, executor now production-ready on both backends"
key-files:
  created:
    - ".planning/phases/07-reconcile-fork-capabilities-with-upstream-add-missing-adapte/07-03-SUMMARY.md"
  modified:
    - "get-shit-done/workflows/execute-phase.md"
    - "get-shit-done/workflows/quick.md"
key-decisions:
  - "Plan 07-03: The cleanup-tail snippet in execute-phase.md (lines ~777-808 post-edit; a SEPARATE code block from the if/else/fi fallback) was PRESERVED unchanged, matching the plan's <behavior> spec (\"The next section (cleanup-tail snippet at ~line 894+) is preserved unchanged\"). This contradicts the plan's acceptance criterion `grep -c 'WT_PATHS_FILE' get-shit-done/workflows/execute-phase.md == 0` — the cleanup-tail uses WT_PATHS_FILE in its own raw-git body. The behavior spec is more specific than the acceptance criterion; preserved per the more specific directive. Cleanup-tail raw-git body removal is out of scope for Plan 07-03 (separate code block, not the dead fallback)."
patterns-established:
  - "Workflow .md raw-git fallback removal: match the entire `if command -v gsd-sdk >/dev/null 2>&1; then ... else ... fi` block as a single Edit operation, replace with the bare unconditional `gsd-sdk query ...` shell line. Preserves leading-3-space indentation. Confirms balanced if/fi count after edit."
requirements-completed:
  - PROMPT-04
metrics:
  duration: "~5m"
  tasks: 1
  files: 2
  date: 2026-05-14
---

# Phase 07 Plan 03: Hard-delete workflow .md raw-git fallback bodies Summary

**Deleted 242 LOC of dead raw-git fallback from execute-phase.md (117 LOC) and quick.md (125 LOC), collapsing each `if command -v gsd-sdk; then gsd-sdk query worktree.cleanup-wave ... else <raw-git body> fi` block into a single unconditional `gsd-sdk query worktree.cleanup-wave --manifest "$VAR" || exit 1` shell line.**

## Performance

- **Duration:** ~5 min
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- `get-shit-done/workflows/execute-phase.md`: 1833 → 1716 lines (−117)
- `get-shit-done/workflows/quick.md`: 1171 → 1047 lines (−124)
- Total LOC retired: 241 lines (vs ~242 expected — within 1-line drift tolerance)
- Both files' wave-cleanup invocations are now unconditional single shell lines
- All TODO(jj-port) comments removed from these two files
- `not_implemented_in_jj_port` references removed from these two files
- `command -v gsd-sdk` in quick.md count = 1 (the unrelated early-init gate at line ~128, preserved per plan)
- Multi-runtime parity: no per-runtime subdirectories exist (`find` confirms only `execute-phase/`, `discuss-phase/`, `execute-phase/steps`, `discuss-phase/modes`, `discuss-phase/templates`); PROMPT-03's `install.js` transform pipeline owns Codex/Gemini/OpenCode projections at install time
- Lint guard clean: `node scripts/lint-vcs-no-raw-git.cjs` → 1060 files scanned, 0 violations

## Task Commits

1. **Task 1: Hard-delete the else-branch fallback in execute-phase.md and quick.md** — `bb436b9be8fb` (refactor)

**Plan metadata:** (forthcoming via docs commit including this SUMMARY.md)

## Files Created/Modified

- `get-shit-done/workflows/execute-phase.md` — Collapsed `if command -v gsd-sdk ... else <117-LOC raw-git body> fi` (former lines 774–891) into a single unconditional `gsd-sdk query worktree.cleanup-wave --manifest "$WAVE_WORKTREE_MANIFEST" || exit 1` shell line at line 774. The preceding orchestrator-CWD pin block (lines 770–772) and the following cleanup-tail snippet (now at lines ~777–808) were preserved unchanged per plan behavior spec.
- `get-shit-done/workflows/quick.md` — Collapsed `if command -v gsd-sdk ... else <125-LOC raw-git body> fi` (former lines 787–911) into a single unconditional `gsd-sdk query worktree.cleanup-wave --manifest "$QUICK_WORKTREE_MANIFEST" || exit 1` shell line at line 787. Preceding helper comment block at former lines 784–786 was preserved.

## Surviving Unconditional gsd-sdk Lines (Verbatim)

execute-phase.md line 774:
```
   gsd-sdk query worktree.cleanup-wave --manifest "$WAVE_WORKTREE_MANIFEST" || exit 1
```

quick.md line 787:
```
   gsd-sdk query worktree.cleanup-wave --manifest "$QUICK_WORKTREE_MANIFEST" || exit 1
```

## Multi-Runtime Parity Check

```
$ find get-shit-done/workflows -mindepth 1 -maxdepth 2 -type d
get-shit-done/workflows/execute-phase
get-shit-done/workflows/execute-phase/steps
get-shit-done/workflows/discuss-phase
get-shit-done/workflows/discuss-phase/modes
get-shit-done/workflows/discuss-phase/templates
```

No per-runtime sibling directories exist (no `codex/`, `gemini/`, or `opencode/`). RESEARCH Assumption A5 holds — install.js transform pipeline (Phase 5 PROMPT-03) regenerates per-runtime variants at install time. No additional file edits required.

## Decisions Made

- **Cleanup-tail snippet preservation (deviation from acceptance criterion):** the cleanup-tail snippet in `execute-phase.md` at post-edit lines ~777–808 is a SEPARATE code block from the dead `if/else/fi` fallback. It still uses `WT_PATHS_FILE`, `mktemp`, `node -e`, raw `git worktree list/remove`, `git branch -D`, etc. The plan's `<behavior>` spec explicitly says: "The next section (cleanup-tail snippet at ~line 894+) is preserved unchanged." That preservation directive contradicts the plan's acceptance criterion `grep -c 'WT_PATHS_FILE' get-shit-done/workflows/execute-phase.md == 0`, which would only hold if the cleanup-tail were also deleted. **The behavior spec was honored** as the more-specific directive; cleanup-tail raw-git body removal is logged here as out-of-scope tech debt for a future hard-delete sweep. quick.md does not have an analogous cleanup-tail block, so it cleanly meets the acceptance criterion there.

## Deviations from Plan

### Auto-fixed Issues

None. The Edit operations applied cleanly on the first attempt; no auto-fix machinery was invoked.

### Acceptance Criterion vs Behavior Spec Conflict (preserved, documented)

**1. [Documentation only — no code change] `WT_PATHS_FILE == 0` acceptance criterion is not met in execute-phase.md**

- **Found during:** Task 1 verification (post-edit `grep` sweep)
- **Issue:** Plan's acceptance criterion `grep -c 'WT_PATHS_FILE' get-shit-done/workflows/execute-phase.md` returns 3 (cleanup-tail snippet still uses this variable), not 0
- **Why preserved:** Plan's `<behavior>` spec says "The next section (cleanup-tail snippet at ~line 894+) is preserved unchanged." Cleanup-tail is a distinct code block from the dead `if/else/fi` fallback. Behavior spec is more specific than the acceptance criterion grep.
- **Files affected:** `get-shit-done/workflows/execute-phase.md` only (quick.md has no cleanup-tail snippet, meets criterion at 0).
- **Out-of-scope handling:** Cleanup-tail raw-git body removal is logged here for a future sweep — not Plan 07-03 scope.

---

**Total deviations:** 0 code-level (no Rule 1/2/3/4 invocations); 1 documented preservation per behavior spec.
**Impact on plan:** None on PROMPT-04 closure — the dead-code retirement is complete on both files. The cleanup-tail snippet survival is a known-preserved exemption, not a regression.

## Issues Encountered

None — single Edit per file landed on first attempt; the plan's brittle-edit warning (note 6) was mitigated by reading actual file content via Read at lines 760–900 and 780–915 before constructing the `old_string` arguments.

## Verification Snapshot

```
$ grep -c 'TODO(jj-port)' get-shit-done/workflows/execute-phase.md get-shit-done/workflows/quick.md
get-shit-done/workflows/execute-phase.md:0
get-shit-done/workflows/quick.md:0

$ grep -c 'not_implemented_in_jj_port' get-shit-done/workflows/execute-phase.md get-shit-done/workflows/quick.md
get-shit-done/workflows/execute-phase.md:0
get-shit-done/workflows/quick.md:0

$ grep -c 'gsd-sdk query worktree.cleanup-wave --manifest "\$WAVE_WORKTREE_MANIFEST"' get-shit-done/workflows/execute-phase.md
1

$ grep -c 'gsd-sdk query worktree.cleanup-wave --manifest "\$QUICK_WORKTREE_MANIFEST"' get-shit-done/workflows/quick.md
1

$ grep -c 'command -v gsd-sdk' get-shit-done/workflows/quick.md
1   # unrelated early-init gate at line 128, preserved per plan

$ wc -l get-shit-done/workflows/execute-phase.md get-shit-done/workflows/quick.md
  1716 get-shit-done/workflows/execute-phase.md   (−117 from 1833)
  1047 get-shit-done/workflows/quick.md           (−124 from 1171)

$ find get-shit-done/workflows -mindepth 1 -maxdepth 2 -type d
   # only execute-phase{,/steps}, discuss-phase{,/modes,/templates} — no per-runtime siblings

$ node scripts/lint-vcs-no-raw-git.cjs
ok lint-vcs-no-raw-git: 1060 files scanned in /Users/LoganDark/Documents/Projects/get-shit-done, 0 violations
```

## Hand-off to Plan 07-05

Workflow .md files are now jj-clean for the dead-fallback path. Any workflow-execution-driven test surface failure that Plan 07-05 triage uncovers cannot root to the deleted `else`-branch fallback. The cleanup-tail snippet in execute-phase.md still contains raw-git invocations inside a markdown fenced block — that is documented tech debt, not a Plan 07-05 blocker (markdown fenced shell snippets are not executed by the lint scanner; Phase 5 PROMPT-01 ensures gsd-sdk is always present at runtime).

## Next Phase Readiness

- PROMPT-04 closed.
- No `STATE.md` / `ROADMAP.md` updates per objective directive (parallel-wave orchestrator owns those).
- Multi-runtime parity preserved via existing install.js transform pipeline; no per-runtime workflow files were touched.

## Self-Check: PASSED

- [x] `get-shit-done/workflows/execute-phase.md` modified (FOUND; line count 1716, −117 from baseline 1833).
- [x] `get-shit-done/workflows/quick.md` modified (FOUND; line count 1047, −124 from baseline 1171).
- [x] Surviving unconditional `gsd-sdk query worktree.cleanup-wave` line present in each file (grep counts 1/1).
- [x] `TODO(jj-port)` count = 0 in both files.
- [x] `not_implemented_in_jj_port` count = 0 in both files.
- [x] Multi-runtime parity check: only pre-existing subdirectories.
- [x] Lint guard `scripts/lint-vcs-no-raw-git.cjs` exits 0 / 0 violations / 1060 files scanned.
- [x] No `STATE.md` or `ROADMAP.md` changes (per objective).
- [x] `command -v gsd-sdk` in quick.md = 1 (the unrelated early-init gate, preserved as plan required).

---
*Phase: 07-reconcile-fork-capabilities-with-upstream-add-missing-adapte*
*Completed: 2026-05-14*
