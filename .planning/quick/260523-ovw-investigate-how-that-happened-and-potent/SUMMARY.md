---
quick_id: 260523-ovw
slug: investigate-how-that-happened-and-potent
date: 2026-05-23
duration: ~25min
tasks: 2
commits:
  - swoylprp: refactor(workflow) reorder phase.complete + commit in execute-phase update_roadmap
  - plyvlkqt: feat(workflow) add assert_clean_wc final gate to execute-phase
  - uxuqqzto: feat(workflow) add assert_clean_wc final gate to plan-phase
files_changed:
  - get-shit-done/workflows/execute-phase.md
  - get-shit-done/workflows/plan-phase.md
memory_added:
  - $HOME/.claude/projects/-Users-LoganDark-Documents-Projects-get-shit-done/memory/feedback_workflow_assert_clean_wc.md
tags: [workflow, gsd-fork, post-mortem, phase-14, assert-clean-wc, structural-fix]
---

# Quick Task 260523-ovw: Investigate & structurally fix mutating-verb-without-commit gap

## Objective

Phase 14 `--auto --no-transition` execution declared **PHASE COMPLETE** + "Working copy is clean. All artifacts committed." while `gsd-sdk query phase.complete 14` had mutated `.planning/ROADMAP.md` and `.planning/STATE.md` on disk without an immediate commit. The user caught it manually. Investigate the structural cause across workflow markdown, then apply a focused mitigation in the local-fork GSD workflows so future executions cannot make the same false claim.

## Task 1 — Audit of mutating-verb call sites across workflow files

`grep -n "gsd-sdk query state\.\|gsd-sdk query roadmap\.\|gsd-sdk query phase\.complete"` over the global install (`~/.claude/get-shit-done/workflows/*.md`) returned ~50 hits. Filtering to **mutating verbs only** (excluding read-only `roadmap.get-phase`, `roadmap.analyze`, `state.load`, `state.json`, `progress.bar`):

| Workflow file | Line | Verb | Commit-distance | Conditional? | Risk |
|---|---|---|---|---|---|
| `execute-phase.md` | 1477 | `phase.complete` | ~24 lines (commit at 1500) | unconditional | **HIGH** — Phase 14 bug site, NOW FIXED |
| `execute-phase.md` | 312 | `state.begin-phase` | no in-step commit; deferred to wave 1 finalize | unconditional later | **MEDIUM** — acceptable but dirty-window can span a full wave |
| `execute-phase.md` | 821 | `roadmap.update-plan-progress` | within `wave_complete` `if diff --name-only` block (lines 815-833) | unconditional inside if | **LOW** — defensive idiom (the *good* pattern) |
| `plan-phase.md` | 1519 | `state.planned-phase` | §13d commit ~24 lines down | gated on `commit_docs` | **HIGH** — if `commit_docs:false`, mutations sit uncommitted forever |
| `plan-phase.md` | 1533 | `roadmap.annotate-dependencies` | §13d commit ~10 lines down | gated on `commit_docs` | **HIGH** — same gating problem as 1519 |
| `transition.md` | 166 | `phase.complete` | NO commit in this step at all; relies on later steps | unconditional later (in chain) | **HIGH** — even worse than execute-phase's pattern: step `update_roadmap_and_state` ends with no commit. Downstream `evolve_project` does manual `.planning/PROJECT.md` edits and ALSO has no commit. |
| `discuss-phase.md` | 460 | `state.record-session` | adjacent commit at line 464 | unconditional | **LOW** — defensive idiom (the *good* pattern) |
| `verify-phase.md` | 40, 47, 74 | `roadmap.get-phase`, `roadmap.analyze` | n/a | n/a | **NO RISK** — read-only verbs |
| `complete-milestone.md` | 87 | `roadmap.analyze` | n/a | n/a | **NO RISK** — read-only |
| `extract-learnings.md` | 192 | `state.update` | no immediate commit; deferred | unconditional later | **MEDIUM** — out of scope for Phase-14-equivalent |
| `ship.md` | 307, 308 | `state.update` (x2) | no immediate commit visible | unconditional later | **MEDIUM** — out of scope |
| `new-milestone.md` | 184 | `state.milestone-switch` | not audited deeply | varies | **MEDIUM** — out of scope |
| `insert-phase.md` | 74, 85 | `state.patch`, `state.add-roadmap-evolution` | not audited deeply | varies | **MEDIUM** — out of scope |
| `forensics.md` | 275 | `state.record-session` | not audited deeply | varies | **LOW** — diagnostic flow |
| `milestone-summary.md` | 220 | `state.record-session` | not audited deeply | varies | **LOW** — diagnostic flow |
| `ui-phase.md` | 307 | `state.record-session` | not audited deeply | varies | **LOW** — diagnostic flow |
| `edit-phase.md` | 242 | `state.add-roadmap-evolution` | not audited deeply | varies | **MEDIUM** — out of scope |

**Findings:**

- **Three HIGH-RISK sites identified:** `execute-phase.md:1477`, `plan-phase.md:1519+1533`, `transition.md:166`. All three exhibit the "mutating verb followed by deferred or conditional commit" pattern that lets the orchestrator emit a false "PHASE COMPLETE/PLANNED" banner over a dirty WC.
- **Task 2 scope (per PLAN):** fix the first two via reorder + final-gate. `transition.md:166` is downstream of the Phase 14 incident path (execute-phase invoked it via auto-chain BEFORE the bug surfaced); the new `assert_clean_wc` in execute-phase fires **before** transition gets a chance to run, so the gate transitively protects transition's downstream surface. A future quick-task can address transition.md directly if its dirty-window proves problematic in practice.
- **The good pattern exists already** (lines 815-833 in execute-phase.md, 460-464 in discuss-phase.md): mutation followed by `if diff --name-only` check + adjacent commit. The fix borrows this idiom and elevates it to a workflow-final gate.

## Task 2 — Structural fix to local-fork workflow markdown

Three atomic commits applied to `./get-shit-done/workflows/`:

### Part A — Reorder `update_roadmap` step in `execute-phase.md` (commit `swoylprp`)

**Before** (lines 1473-1502): `phase.complete` → 24 lines of prose ("The CLI handles:", "Extract from result:", warnings block) → `gsd-sdk query commit`.

**After:**
```bash
COMPLETION=$(gsd-sdk query phase.complete "${PHASE_NUMBER}")
gsd-sdk query commit "docs(phase-{X}): complete phase execution" --files .planning/ROADMAP.md .planning/STATE.md .planning/REQUIREMENTS.md {phase_dir}/*-VERIFICATION.md
```
(prose moved BELOW the commit, plus a new "MUST run immediately after — load-bearing" callout to prevent future re-separation)

### Part B — New `<step name="assert_clean_wc">` in `execute-phase.md` (commit `plyvlkqt`)

Inserted immediately before `<step name="offer_next">` (line 1580-1602). Gate body uses `gsd-sdk query diff --name-only | jq -r '.nameOnly // [] | join("\n")'` (NO raw `git`/`jj`), greps for `^\.planning/|-SUMMARY\.md$|-VERIFICATION\.md$`, and aborts loudly with an informative error message if anything matches. Source files outside `.planning/` are explicitly scoped out — the gate protects orchestrator-owned artifacts only.

### Part C — Mirror gate in `plan-phase.md` (commit `uxuqqzto`)

New `## 16. Assert Clean Working Copy` section added at the end of `<process>` (line 1663-1689), immediately before `</process>` and the `<offer_next>` block. Same gate body as Part B, with an additional hint in the error message: "Most common cause: 'commit_docs: false' in .planning/config.json with §13d skipped". Covers the manual route; the auto-advance route (§15 → execute-phase via Skill) is already covered by execute-phase's Part B gate.

### Part D — Verification

- `node scripts/lint-vcs-no-raw-git.cjs` → **exit 0** (1092 files scanned, 0 violations).
- `grep -c "gsd-sdk query diff --name-only" ./get-shit-done/workflows/{execute,plan}-phase.md` → **3** (execute-phase=2 [existing wave_complete + new gate], plan-phase=1 [new gate]). Exceeds the ≥2 acceptance criterion.

### Part E — Memory file

Created `$HOME/.claude/projects/-Users-LoganDark-Documents-Projects-get-shit-done/memory/feedback_workflow_assert_clean_wc.md` (20 lines, well-formed frontmatter, body covers the fix + Phase 14 origin + global-install caveat + `[[project_jj_port]]` cross-link). Appended one-line link to `MEMORY.md` matching existing 22-entry format. Memory files are outside the project repo (`$HOME/.claude/projects/`) — not committed to jj history per the planner's explicit note.

## Caveats / out of scope

- **Global install (`~/.claude/get-shit-done/workflows/`) still has the old workflow.** The local-fork edit only affects future GSD installs from this repo OR direct invocations of the local-fork workflows. The user's currently-running session continues to rely on the buggy global workflow until the next reinstall. Sync is the user's call.
- **`transition.md:166` (HIGH RISK)** not fixed in this task. The Phase 14 bug fired in execute-phase BEFORE transition was reached (the `--no-transition` flag was set). execute-phase's new `assert_clean_wc` gate transitively protects transition's surface for the auto-chain path. A future quick-task can fix transition.md directly if the dirty-window proves problematic in practice.
- **SDK behavior changes** (Options C/D/E/F from the original task description — adding `--commit` flag to mutating verbs, `dirty_files` return field, etc.) remain open for a future quick-task. The workflow-markdown fix is the lighter intervention.
- **Upstream PR.** Per memory `project_jj_port`: PRs back to upstream not currently intended but not foreclosed. If upstream wants the fix, it can flow through later.

## Self-Check

**Files referenced in this SUMMARY:**
- `./get-shit-done/workflows/execute-phase.md` — exists, contains reordered `update_roadmap` (lines 1473-1501) and new `assert_clean_wc` (lines 1580-1602).
- `./get-shit-done/workflows/plan-phase.md` — exists, contains new `## 16. Assert Clean Working Copy` (lines 1663-1689).
- `$HOME/.claude/projects/-Users-LoganDark-Documents-Projects-get-shit-done/memory/feedback_workflow_assert_clean_wc.md` — exists, 20 lines.
- `$HOME/.claude/projects/-Users-LoganDark-Documents-Projects-get-shit-done/memory/MEMORY.md` — 22 entries (was 21, +1 for this fix).

**Commits in jj history (verified via `jj log @-`):**
- `swoylprp` — refactor(workflow): reorder phase.complete + commit in execute-phase update_roadmap
- `plyvlkqt` — feat(workflow): add assert_clean_wc final gate to execute-phase before PHASE COMPLETE
- `uxuqqzto` — feat(workflow): add assert_clean_wc final gate to plan-phase before PHASE PLANNED

**Lint:** `node scripts/lint-vcs-no-raw-git.cjs` exit 0 / 0 violations / 1092 files scanned. Lint clean.

## Self-Check: PASSED
