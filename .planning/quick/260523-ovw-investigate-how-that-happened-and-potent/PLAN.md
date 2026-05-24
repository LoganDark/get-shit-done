# PLAN: Investigate mutating-verb-without-commit gap (Phase 14 post-mortem)

## Objective

During Phase 14 `--auto --no-transition` execution, the orchestrator called `gsd-sdk query phase.complete 14`, which mutated `.planning/ROADMAP.md` and `.planning/STATE.md` but did **not** auto-commit. The orchestrator then declared "PHASE COMPLETE" + "Working copy is clean. All artifacts committed." which was false. The user had to catch it.

Investigate the structural cause across SDK + workflow markdown, then apply a focused mitigation so future executions cannot make the same false claim.

## Investigation Summary (already gathered by planner)

The planner already read the relevant files and confirmed the pattern. Recording findings here so the executor doesn't re-read everything from scratch:

### Pattern locations confirmed

**`execute-phase.md` step `update_roadmap` (lines 1473-1502)** — the bug site:

```bash
COMPLETION=$(gsd-sdk query phase.complete "${PHASE_NUMBER}")
```

…followed by ~20 lines of result-parsing prose ("The CLI handles: …", "Extract from result: …", "**If has_warnings is true:**" block)…

```bash
gsd-sdk query commit "docs(phase-{X}): complete phase execution" --files .planning/ROADMAP.md .planning/STATE.md .planning/REQUIREMENTS.md {phase_dir}/*-VERIFICATION.md
```

Visually, the commit is **buried below** result-parsing prose. An orchestrator reading the structured `phase.complete` JSON (`"roadmap_updated":true, "state_updated":true`) can mistake "files modified" for "everything durable" and never reach the second bash block — especially under `--auto`.

**`execute-phase.md` step `validate_phase` (line 312)** — same pattern, lower stakes:

```bash
gsd-sdk query state.begin-phase --phase "${PHASE_NUMBER}" --name "${PHASE_NAME}" --plans "${PLAN_COUNT}"
```

No commit block immediately follows. STATE.md sits dirty until step 815 (post-wave) eventually commits it bundled with `roadmap.update-plan-progress` output. Acceptable in flow, but the "dirty-window" can stretch across an entire wave's execution.

**`execute-phase.md` step `wave_complete` (lines 815-833)** — the *good* pattern:

```bash
if [ -n "$(gsd-sdk query diff --name-only … .planning/ROADMAP.md .planning/STATE.md …)" ]; then
  gsd-sdk query commit "docs(phase-${PHASE_NUMBER}): update tracking after wave ${N}" --files …
fi
```

This explicitly checks `diff --name-only` before committing — the defensive idiom that the `update_roadmap` step lacks.

**`plan-phase.md` steps 13b + 13c + 13d (lines 1519-1543)** — partially-good pattern:

```bash
# 13b
gsd-sdk query state.planned-phase --phase "${PHASE_NUMBER}" --name "${PHASE_NAME}" --plans "${PLAN_COUNT}"
# 13c
gsd-sdk query roadmap.annotate-dependencies "${PHASE_NUMBER}"
# 13d
gsd-sdk query commit "docs(${PADDED_PHASE}): create phase plan" --files "${PHASE_DIR}"/*-PLAN.md .planning/STATE.md .planning/ROADMAP.md
```

Two mutations are grouped before one commit (correct batching), **but** 13d is conditional on `commit_docs`. If `commit_docs` is `false`, both mutations sit uncommitted forever with no warning.

### Other workflow files with the same pattern (not exhaustively audited yet)

`grep -ln "state\.\|roadmap\.\|phase\.complete"` returned ~30 workflow files. Executor should spot-check at least `verify-phase.md`, `complete-milestone.md`, `transition.md`, `discuss-phase.md` for the same pattern (mutating verb followed by deferred or conditional commit).

### Why the orchestrator missed it

The `phase.complete` JSON response includes `"roadmap_updated":true, "state_updated":true`. Those fields mean **"files on disk were written"** but read like **"durable / persisted"**. Under `--auto`, the orchestrator wants to stream past structured-success responses; the buried follow-up `commit` block is exactly the kind of thing speed-reading skips.

## Mitigation Chosen (revised after user feedback)

**Primary: GSD workflow structural fix in the local fork (`./get-shit-done/workflows/`).**

User pushback on the original A+B (memory + global CLAUDE.md): *"isn't this an issue with the GSD skills? we should be investigating if we can make an improvement to those"*. Correct framing — the bug is structural in the workflow markdown, not in any reader's habits. A memory teaches future-me to compensate for a workflow gap; a workflow fix removes the gap.

This repo IS the GSD jj-port fork; `./get-shit-done/workflows/*.md` is the source of truth for the project's workflow changes (confirmed via `find`: local copies exist and DIFFER from `~/.claude/get-shit-done/workflows/`). The right place to land the fix.

**Two-pronged structural fix:**

1. **Reorder commit blocks** in `execute-phase.md` step `update_roadmap` (and any other site Task 1 surfaces as HIGH RISK) so the `gsd-sdk query commit` block IMMEDIATELY FOLLOWS the mutating verb, BEFORE any result-parsing prose. Minimal diff; the prose can read structured success values after they've been durably committed.

2. **Add an `assert_clean_wc` gate** as the final step of `execute-phase.md` (and `plan-phase.md`'s `<offer_next>` path) before any "PHASE COMPLETE" / "PHASE PLANNED" terminal banner. The gate runs `gsd-sdk query diff --name-only --cwd .` and aborts with a loud error if any `.planning/`, `*-SUMMARY.md`, or `*-VERIFICATION.md` paths show up. This catches the class of bug, not just the one instance.

**Why this is better than A+B (memory + CLAUDE.md):**
- The fix lives where the bug lives (the workflow markdown), not in a separate rule store the orchestrator has to remember to consult.
- Applies to every GSD execution, not just orchestrators who happen to have loaded the right memory.
- The `assert_clean_wc` gate gives an actionable error at the exact moment the bad claim would fire — no race with memory recall.
- The local fork is upstream-tracked; the fix can later flow back via PR if the upstream project wants it.

**Out of scope:** Editing the global install (`~/.claude/get-shit-done/workflows/`) — that's a reinstall concern for the user. Editing the SDK to add `--commit` / `dirty_files` (Options C/D/E from the original task) — workflow-markdown fix is the lighter intervention; SDK fix remains open for a future quick-task if the workflow fix proves insufficient.

---

## Tasks

### Task 1: Audit remaining workflow files for the same pattern

<read_first>
- `/Users/LoganDark/.claude/get-shit-done/workflows/verify-phase.md` — does it have `phase.complete`-style mutations followed by buried commits?
- `/Users/LoganDark/.claude/get-shit-done/workflows/complete-milestone.md` — does milestone completion have the same gap?
- `/Users/LoganDark/.claude/get-shit-done/workflows/transition.md` — does phase transition mutate STATE.md without immediate commit?
- `/Users/LoganDark/.claude/get-shit-done/workflows/discuss-phase.md` — does CONTEXT.md generation/save have the gap?
- `/Users/LoganDark/.claude/get-shit-done/workflows/execute-phase.md` lines 312, 815-833, 1473-1502 (planner already confirmed — re-read only if needed to verify or to find other gaps)
- `/Users/LoganDark/.claude/get-shit-done/workflows/plan-phase.md` lines 1519-1543 (planner already confirmed — re-read only if needed)
</read_first>

<action>
Run `grep -n "gsd-sdk query state\.\|gsd-sdk query roadmap\.\|gsd-sdk query phase\.complete" $HOME/.claude/get-shit-done/workflows/*.md` once. For each match in the four files above (and any others returned), determine:

1. Does a `gsd-sdk query commit` appear **within the same `<step>` block** as the mutation?
2. Is that commit **unconditional**, or gated on `commit_docs` / other config?
3. Is the commit visually adjacent (next bash block) or separated by prose?

Produce a short audit table in the task output (markdown table: `workflow.md:line | verb | commit-distance | conditional?`). No file edits — this task is pure investigation, feeds Task 2.

Do NOT re-read execute-phase.md or plan-phase.md sections the planner already quoted in this PLAN.md unless the audit table specifically needs to confirm a number. The planner-confirmed findings above are authoritative.
</action>

<acceptance_criteria>
- Audit table emitted as part of the task's terminal output, listing every mutating-verb call site across the four workflow files (plus any others surfaced by the grep) with its commit-distance classification.
- Audit explicitly names which sites are HIGH RISK (mutating verb + commit separated by ≥10 lines of prose OR commit is conditional on config) versus LOW RISK (commit unconditional and immediately adjacent).
- No workflow file is edited during this task.
- Audit is short — target ≤30 lines of table+commentary. This is a scoping deliverable, not a rewrite.
</acceptance_criteria>

---

### Task 2: Apply structural fix to local-fork GSD workflow markdown

<read_first>
- `./get-shit-done/workflows/execute-phase.md` (LOCAL FORK — the source of truth for this project's workflow changes). Specifically:
  - The `update_roadmap` step (find by searching for `gsd-sdk query phase.complete`) — the bug site, reorder needed here.
  - The end of the file: locate the last `<step>` block (likely `offer_next` or similar) — insert `assert_clean_wc` immediately before any "PHASE COMPLETE" emission.
- `./get-shit-done/workflows/plan-phase.md` (LOCAL FORK). Specifically:
  - The `<offer_next>` block and step 13d (`commit_docs`-gated commit) — confirm whether the same final-gate is needed before "PHASE PLANNED" banner.
- Task 1's audit table — to enumerate any additional HIGH RISK sites that need the reorder treatment beyond `update_roadmap`.
- `./CLAUDE.md` (project) and `$HOME/.claude/CLAUDE.md` (global) — DO NOT edit. Read-only context to confirm the project's commit convention (jj over git, tabs, no trailing comma, US English) so the new prose matches house style.
</read_first>

<action>
**Part A — Reorder commit blocks in `execute-phase.md` `update_roadmap` step.**

Current (buggy) shape — mutation, ~20 lines of prose, then commit (easy to miss):

```bash
COMPLETION=$(gsd-sdk query phase.complete "${PHASE_NUMBER}")
```
(prose about CLI fields, warnings, etc.)
```bash
gsd-sdk query commit "docs(phase-{X}): complete phase execution" --files .planning/ROADMAP.md .planning/STATE.md .planning/REQUIREMENTS.md {phase_dir}/*-VERIFICATION.md
```

New shape — mutation, IMMEDIATE commit, then prose (no buried follow-up):

```bash
COMPLETION=$(gsd-sdk query phase.complete "${PHASE_NUMBER}")
gsd-sdk query commit "docs(phase-{X}): complete phase execution" --files .planning/ROADMAP.md .planning/STATE.md .planning/REQUIREMENTS.md {phase_dir}/*-VERIFICATION.md
```
(prose about parsing COMPLETION — now safe to read at leisure because durable state is already committed)

Apply the same reorder to any other HIGH RISK sites Task 1 identifies (likely none in execute-phase.md beyond `update_roadmap`; the `update_project_md` step already has its commit immediately adjacent).

**Part B — Add `assert_clean_wc` step to `execute-phase.md`.**

Insert a NEW `<step name="assert_clean_wc">` block immediately BEFORE the `offer_next` step (or before any "PHASE COMPLETE" / "auto-advance" emission). Step body:

```markdown
<step name="assert_clean_wc">
**Final-gate check: assert the working copy is clean before declaring phase complete.**

After all mutating verbs (`phase.complete`, `state.*`, `roadmap.*`) have fired and their commits should have landed, verify nothing critical is left uncommitted:

```bash
DIRTY=$(gsd-sdk query diff --name-only --cwd . 2>/dev/null | jq -r '.nameOnly // [] | join("\n")')
PLANNING_DIRTY=$(echo "$DIRTY" | grep -E '^\.planning/|-SUMMARY\.md$|-VERIFICATION\.md$' || true)
if [ -n "$PLANNING_DIRTY" ]; then
  echo "FATAL: planning artifacts uncommitted after phase execution. This is a workflow bug — a mutating verb's commit was skipped. Files:" >&2
  echo "$PLANNING_DIRTY" >&2
  echo "Resolve by committing the listed files before re-running, or report this as a GSD workflow defect." >&2
  exit 1
fi
```

This gate catches the class of bug where a mutating SDK verb (e.g., `phase.complete`, `state.advance-plan`, `roadmap.update-plan-progress`) mutates planning files but the workflow forgets to run the follow-up `gsd-sdk query commit`. Source files outside `.planning/` are explicitly NOT flagged here — those belong to the executor's commit protocol, not the orchestrator's tracking commit. The gate only protects the orchestrator-owned artifacts.
</step>
```

Then update the `<process>` block at the top of execute-phase.md (and the success_criteria block at the bottom) to include `assert_clean_wc` in the step sequence — same way other final-gate steps appear.

**Part C — Add the same `assert_clean_wc` gate to `plan-phase.md`.**

Insert immediately before the `<offer_next>` block (or the `## 15. Auto-Advance Check` step's `## ▶ Next Up` emission). Use the same gate body as Part B. Rationale: `plan-phase.md` step 13b (`state.planned-phase`), 13c (`roadmap.annotate-dependencies`) followed by conditional 13d (commit gated on `commit_docs`) has the same gap — if `commit_docs: false`, the mutations sit uncommitted and the existing `## PHASE PLANNED ✓` banner would still fire.

**Part D — Verify by re-reading the edited files.**

After both file edits:
- Re-read the patched `update_roadmap` step in execute-phase.md and confirm the commit block now sits IMMEDIATELY after `phase.complete`, before any "Extract from result:" prose.
- Re-read the new `assert_clean_wc` step in execute-phase.md and plan-phase.md and confirm: (a) it's placed before any "PHASE COMPLETE" / "PHASE PLANNED" emission, (b) the bash uses `gsd-sdk query diff --name-only` (not raw `git`/`jj`), (c) the error message is informative.
- Verify lint: `node scripts/lint-vcs-no-raw-git.cjs` exits 0 (no raw git in the new workflow markdown — the new gate uses `gsd-sdk query diff`).

**Part E — Save a short feedback memory pointing at the FIX.**

Create `/Users/LoganDark/.claude/projects/-Users-LoganDark-Documents-Projects-get-shit-done/memory/feedback_workflow_assert_clean_wc.md` (≤20 lines) describing:
- What was fixed: reorder + assert_clean_wc gate in execute-phase.md + plan-phase.md (local fork).
- Phase 14 incident origin (one sentence).
- What this means going forward: the workflow itself now catches the class of bug; orchestrators no longer need to remember to run `jj status` manually.
- Reminder that the GLOBAL install (`~/.claude/get-shit-done/workflows/`) still has the old workflow; the user may want to re-sync or accept the bug persists in the running session until the next install.

Append a one-line link to `MEMORY.md` matching existing format.

**Out of scope:**
- Editing `~/.claude/CLAUDE.md` (global) — workflow fix obviates that.
- Editing `~/.claude/get-shit-done/workflows/` (global install) — sync is the user's call.
- Editing the SDK (`sdk/src/query/*`) — workflow markdown fix is sufficient.
</action>

<acceptance_criteria>
- `./get-shit-done/workflows/execute-phase.md` `update_roadmap` step: `gsd-sdk query commit` block immediately follows `gsd-sdk query phase.complete` with no prose between them.
- `./get-shit-done/workflows/execute-phase.md` contains a new `<step name="assert_clean_wc">` block before `offer_next`, using `gsd-sdk query diff --name-only` (no raw `git` or `jj`).
- `./get-shit-done/workflows/plan-phase.md` contains the same `assert_clean_wc` gate before `<offer_next>`.
- `node scripts/lint-vcs-no-raw-git.cjs` exits 0 (lint clean — the new gate must NOT introduce raw git/jj).
- `bash -n` not applicable (markdown files), but `grep -c "gsd-sdk query diff" ./get-shit-done/workflows/{execute,plan}-phase.md` returns ≥ 2 in total (the new gate is present in both files).
- `feedback_workflow_assert_clean_wc.md` memory file exists, ≤20 lines, names the specific workflow edits and the Phase 14 origin.
- MEMORY.md has one new appended line linking the memory.
- The executor's final reply includes a diff-style summary of the workflow edits (before/after for the reorder; new block content for the gate) so the user can audit without opening files.
- Each change is committed atomically (3 commits expected: reorder, gate-injection-execute, gate-injection-plan; plus 1 for the memory).
</acceptance_criteria>

---

## Out of Scope

- SDK behavior changes (Options C, D, E, F from the task description). The workflow markdown fix is structurally sufficient; SDK changes remain open for a future quick-task if the workflow fix proves insufficient.
- Editing `~/.claude/get-shit-done/workflows/` (global install). The local fork is the source of truth for the project; the user can re-sync the global install separately.
- Editing `~/.claude/CLAUDE.md` (global). The workflow fix obviates the need for cross-project orchestrator rules; the gate enforces correctness mechanically.
- Promoting the local fork's fix back to upstream GSD via PR. Possible follow-up per memory `project_jj_port` ("PRs back not currently intended but not foreclosed").

## Plan revision history

- **v1 (original):** Tasks 1 (audit) + 2 (write memory + edit global CLAUDE.md). Rejected by user with "isn't this an issue with the GSD skills? we should be investigating if we can make an improvement to those".
- **v2 (current):** Tasks 1 (audit, unchanged) + 2 (reorder buggy commit blocks + add `assert_clean_wc` final-gate step to local-fork workflow markdown, plus save a memory pointing at the fix). The fix lives in the workflow itself, not in an orchestrator memory.

## PLAN COMPLETE
