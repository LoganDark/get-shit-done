<internal_workflow>

**This is an INTERNAL workflow — NOT a user-facing command.**

There is no `/gsd-transition` command. This workflow is invoked automatically by
`execute-phase` during auto-advance, or inline by the orchestrator after phase
verification. Users should never be told to run `/gsd-transition`.

**Valid user commands for phase progression:**
- `/gsd:discuss-phase {N}` — discuss a phase before planning
- `/gsd:plan-phase {N}` — plan a phase
- `/gsd:execute-phase {N}` — execute a phase
- `/gsd:progress` — see roadmap progress

</internal_workflow>

<required_reading>

**Read these files NOW:**

1. `.planning/STATE.md`
2. `.planning/PROJECT.md`
3. `.planning/ROADMAP.md`
4. Current phase's plan files (`*-PLAN.md`)
5. Current phase's summary files (`*-SUMMARY.md`)

</required_reading>

<purpose>

Mark current phase complete and advance to next. This is the natural point where progress tracking and PROJECT.md evolution happen.

"Planning next phase" = "current phase is done"

</purpose>

<process>

<step name="load_project_state" priority="first">

Before transition, read project state:

```bash
cat .planning/STATE.md 2>/dev/null || true
cat .planning/PROJECT.md 2>/dev/null || true
```

Parse current position to verify we're transitioning the right phase.
Note accumulated context that may need updating after transition.

</step>

<step name="verify_completion">

Check current phase has all plan summaries:

```bash
(ls .planning/phases/XX-current/*-PLAN.md 2>/dev/null || true) | sort
(ls .planning/phases/XX-current/*-SUMMARY.md 2>/dev/null || true) | sort
```

**Verification logic:**

- Count PLAN files
- Count SUMMARY files
- If counts match: all plans complete
- If counts don't match: incomplete

<config-check>

```bash
cat .planning/config.json 2>/dev/null || true
```

</config-check>

**Check for verification debt in this phase:**

```bash
# Run a preliminary frontmatter check via awk — the runtime launcher is not yet
# defined at this step, so avoid any runtime tool calls here.
# awk extracts only the status: field between the two --- fences to avoid
# false positives from historical body text (e.g. previous_status: gaps_found).
VERIFY_STATUS=$(awk 'NR==1&&/^---$/{in_fm=1;next}in_fm&&/^---$/{exit}in_fm&&/^status: /{print $2}' \
  .planning/phases/XX-current/*-VERIFICATION.md 2>/dev/null | head -1)
```

**If VERIFY_STATUS is not `passed`:**

Stop before confirming:

```
Verification incomplete: ${VERIFY_STATUS:-missing}

Resolve before transition. Review: `/gsd:audit-uat`
```

This preliminary check blocks obviously unresolved verification before the
launcher is available. `gsd-tools.cjs query phase.complete` remains the
authoritative stale-aware gate and fail-closes unless canonical verification
status is `passed`.

**If all plans complete:**

<if mode="yolo">

```
⚡ Auto-approved: Transition Phase [X] → Phase [X+1]
Phase [X] complete — all [Y] plans finished.

Proceeding to mark done and advance...
```

Proceed directly to cleanup_handoff step.

</if>

<if mode="interactive" OR="custom with gates.confirm_transition true">

Ask: "Phase [X] complete — all [Y] plans finished. Ready to mark done and move to Phase [X+1]?"

Wait for confirmation before proceeding.

</if>

**If plans incomplete:**

**SAFETY RAIL: always_confirm_destructive applies here.**
Skipping incomplete plans is destructive — ALWAYS prompt regardless of mode.

Present:

```
Phase [X] has incomplete plans:
- {phase}-01-SUMMARY.md ✓ Complete
- {phase}-02-SUMMARY.md ✗ Missing
- {phase}-03-SUMMARY.md ✗ Missing

⚠️ Safety rail: Skipping plans requires confirmation (destructive action)

Options:
1. Continue current phase (execute remaining plans)
2. Mark complete anyway (skip remaining plans)
3. Review what's left
```

Wait for user decision.

</step>

<step name="cleanup_handoff">

Check for lingering handoffs:

```bash
ls .planning/phases/XX-current/.continue-here*.md 2>/dev/null || true
```

If found, delete them — phase is complete, handoffs are stale.

</step>

<step name="update_roadmap_and_state">

**Delegate ROADMAP.md and STATE.md updates to `gsd-tools.cjs query phase.complete`:**

```bash
_GSD_SHIM_NAME="gsd-tools.cjs"; _GSD_RUNTIME_ROOT="${RUNTIME_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || jj workspace root 2>/dev/null || pwd)}"; GSD_TOOLS="${_GSD_RUNTIME_ROOT}/gsd-core/bin/${_GSD_SHIM_NAME}"; if [ -f "$GSD_TOOLS" ]; then gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${_GSD_RUNTIME_ROOT}/.claude/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${_GSD_RUNTIME_ROOT}/.claude/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${_GSD_RUNTIME_ROOT}/.codex/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${_GSD_RUNTIME_ROOT}/.codex/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif command -v gsd-tools >/dev/null 2>&1; then GSD_TOOLS="$(command -v gsd-tools)"; gsd_run() { "$GSD_TOOLS" "$@"; }; elif [ -f "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${HERMES_HOME:-$HOME/.hermes}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${HERMES_HOME:-$HOME/.hermes}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${CURSOR_CONFIG_DIR:-$HOME/.cursor}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${CURSOR_CONFIG_DIR:-$HOME/.cursor}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${CODEX_HOME:-$HOME/.codex}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${CODEX_HOME:-$HOME/.codex}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${GEMINI_CONFIG_DIR:-$HOME/.gemini}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${GEMINI_CONFIG_DIR:-$HOME/.gemini}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${COPILOT_CONFIG_DIR:-$HOME/.copilot}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${COPILOT_CONFIG_DIR:-$HOME/.copilot}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${WINDSURF_CONFIG_DIR:-$HOME/.codeium/windsurf}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${WINDSURF_CONFIG_DIR:-$HOME/.codeium/windsurf}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${AUGMENT_CONFIG_DIR:-$HOME/.augment}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${AUGMENT_CONFIG_DIR:-$HOME/.augment}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${TRAE_CONFIG_DIR:-$HOME/.trae}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${TRAE_CONFIG_DIR:-$HOME/.trae}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${QWEN_CONFIG_DIR:-$HOME/.qwen}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${QWEN_CONFIG_DIR:-$HOME/.qwen}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${CODEBUDDY_CONFIG_DIR:-$HOME/.codebuddy}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${CODEBUDDY_CONFIG_DIR:-$HOME/.codebuddy}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${CLINE_CONFIG_DIR:-$HOME/.cline}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${CLINE_CONFIG_DIR:-$HOME/.cline}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${GROK_AGENTS_HOME:-$HOME/.agents}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${GROK_AGENTS_HOME:-$HOME/.agents}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${ANTIGRAVITY_CONFIG_DIR:-$HOME/.gemini/antigravity}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${ANTIGRAVITY_CONFIG_DIR:-$HOME/.gemini/antigravity}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${OPENCODE_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/opencode}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${OPENCODE_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/opencode}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${KILO_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/kilo}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${KILO_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/kilo}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; else echo "ERROR: gsd-tools.cjs not found at $GSD_TOOLS and gsd-tools is not on PATH. Run: npx -y @opengsd/gsd-core@latest --claude --local" >&2; exit 1; fi; if [ -n "${CLAUDE_ENV_FILE:-}" ] && [ -n "${GSD_TOOLS:-}" ]; then printf "export PATH='%s':\"\$PATH\"\n" "${GSD_TOOLS%/*}" >> "$CLAUDE_ENV_FILE" 2>/dev/null || true; fi
TRANSITION=$(gsd_run query phase.complete "${current_phase}")
gsd_run query commit "docs(phase-${current_phase}): complete phase via transition" --files .planning/ROADMAP.md .planning/STATE.md .planning/REQUIREMENTS.md
```

The commit line above MUST run immediately after `phase.complete` — the mutating verb writes to `.planning/ROADMAP.md` + `.planning/STATE.md` + `.planning/REQUIREMENTS.md` on disk but does NOT commit. The order is load-bearing: do NOT defer the commit past the result-parsing prose that follows, or the orchestrator may declare the transition complete with the planning files still uncommitted.

The CLI handles:
- Marking the phase checkbox as `[x]` complete with today's date
- Updating plan count to final (e.g., "3/3 plans complete")
- Updating the Progress table (Status → Complete, adding date)
- Advancing STATE.md to next phase (Current Phase, Status → Ready to plan, Current Plan → Not started)
- Detecting if this is the last phase in the milestone

Extract from result: `completed_phase`, `plans_executed`, `next_phase`, `next_phase_name`, `is_last_phase`.

</step>

<step name="archive_prompts">

If prompts were generated for the phase, they stay in place.
The `completed/` subfolder pattern from create-meta-prompts handles archival.

</step>

<step name="evolve_project">

Evolve PROJECT.md to reflect learnings from completed phase.

**Read phase summaries:**

```bash
cat .planning/phases/XX-current/*-SUMMARY.md
```

**Assess requirement changes:**

1. **Requirements validated?**
   - Any Active requirements shipped in this phase?
   - Move to Validated with phase reference: `- ✓ [Requirement] — Phase X`

2. **Requirements invalidated?**
   - Any Active requirements discovered to be unnecessary or wrong?
   - Move to Out of Scope with reason: `- [Requirement] — [why invalidated]`

3. **Requirements emerged?**
   - Any new requirements discovered during building?
   - Add to Active: `- [ ] [New requirement]`

4. **Decisions to log?**
   - Extract decisions from SUMMARY.md files
   - Add to Key Decisions table with outcome if known

5. **"What This Is" still accurate?**
   - If the product has meaningfully changed, update the description
   - Keep it current and accurate

**Update PROJECT.md:**

Make the edits inline. Update "Last updated" footer:

```markdown
---
*Last updated: [date] after Phase [X]*
```

**Example evolution:**

Before:

```markdown
### Active

- [ ] JWT authentication
- [ ] Real-time sync < 500ms
- [ ] Offline mode

### Out of Scope

- OAuth2 — complexity not needed for v1
```

After (Phase 2 shipped JWT auth, discovered rate limiting needed):

```markdown
### Validated

- ✓ JWT authentication — Phase 2

### Active

- [ ] Real-time sync < 500ms
- [ ] Offline mode
- [ ] Rate limiting on sync endpoint

### Out of Scope

- OAuth2 — complexity not needed for v1
```

**Commit the evolution** (the inline edits above write PROJECT.md to disk but nothing commits it):

```bash
gsd_run query commit "docs(phase-${completed_phase}): evolve PROJECT.md after transition" --files .planning/PROJECT.md
```

**Step complete when:**

- [ ] Phase summaries reviewed for learnings
- [ ] Validated requirements moved from Active
- [ ] Invalidated requirements moved to Out of Scope with reason
- [ ] Emerged requirements added to Active
- [ ] New decisions logged with rationale
- [ ] "What This Is" updated if product changed
- [ ] "Last updated" footer reflects this transition
- [ ] PROJECT.md committed

</step>

<step name="graduation_scan">

Scan LEARNINGS.md files from recent phases for recurring patterns and surface promotion candidates to the developer.

**Invoke the graduation helper:**

```text
@~/.claude/gsd-core/workflows/graduation.md
```

This step is fully delegated to `graduation.md`. It handles guard checks (feature flag, window size, threshold), clustering, backlog filtering, HITL prompting, promotion writes, and STATE.md updates.

**This step is always non-blocking:** graduation candidates are surfaced for the developer's decision; no action is required to continue the transition. If the graduation scan produces no qualifying clusters, it prints a single `[graduation: no qualifying clusters]` line and returns.

**Step complete when:**

- [ ] graduation.md guard checks passed (or skipped with silent no-op)
- [ ] Recurring clusters surfaced (or `[graduation: no qualifying clusters]` printed)
- [ ] Each cluster resolved as Promote / Defer / Dismiss (or all skipped)

</step>

<step name="update_current_position_after_transition">

**Note:** Basic position updates (Current Phase, Status, Current Plan, Last Activity) were already handled by `gsd-tools.cjs query phase.complete` in the update_roadmap_and_state step.

Verify the updates are correct by reading STATE.md. If the progress bar needs updating, use:

```bash
PROGRESS=$(gsd_run query progress.bar --raw)
```

Update the progress bar line in STATE.md with the result.

**Step complete when:**

- [ ] Phase number incremented to next phase (done by phase complete)
- [ ] Plan status reset to "Not started" (done by phase complete)
- [ ] Status shows "Ready to plan" (done by phase complete)
- [ ] Progress bar reflects total completed plans

</step>

<step name="update_project_reference">

Update Project Reference section in STATE.md.

```markdown
## Project Reference

See: .planning/PROJECT.md (updated [today])

**Core value:** [Current core value from PROJECT.md]
**Current focus:** [Next phase name]
```

Update the date and current focus to reflect the transition.

</step>

<step name="review_accumulated_context">

Review and update Accumulated Context section in STATE.md.

**Decisions:**

- Note recent decisions from this phase (3-5 max)
- Full log lives in PROJECT.md Key Decisions table

**Blockers/Concerns:**

- Review blockers from completed phase
- If addressed in this phase: Remove from list
- If still relevant for future: Keep with "Phase X" prefix
- Add any new concerns from completed phase's summaries

**Example:**

Before:

```markdown
### Blockers/Concerns

- ⚠️ [Phase 1] Database schema not indexed for common queries
- ⚠️ [Phase 2] WebSocket reconnection behavior on flaky networks unknown
```

After (if database indexing was addressed in Phase 2):

```markdown
### Blockers/Concerns

- ⚠️ [Phase 2] WebSocket reconnection behavior on flaky networks unknown
```

**Step complete when:**

- [ ] Recent decisions noted (full log in PROJECT.md)
- [ ] Resolved blockers removed from list
- [ ] Unresolved blockers kept with phase prefix
- [ ] New concerns from completed phase added

</step>

<step name="update_session_continuity_after_transition">

Update Session Continuity section in STATE.md to reflect transition completion.

**Format:**

```markdown
Last session: [today]
Stopped at: Phase [X] complete, ready to plan Phase [X+1]
Resume file: None
```

**Commit the STATE.md cluster** — this single commit deliberately sweeps the four consecutive STATE.md-only steps (update_current_position_after_transition, update_project_reference, review_accumulated_context, update_session_continuity_after_transition) plus the graduation backlog written earlier by graduation_scan; the requirement's "STATE.md update" is one logical mutating step:

```bash
gsd_run query commit "docs(phase-${completed_phase}): update STATE.md after transition" --files .planning/STATE.md
```

**Step complete when:**

- [ ] Last session timestamp updated to current date and time
- [ ] Stopped at describes phase completion and next phase
- [ ] Resume file confirmed as None (transitions don't use resume files)
- [ ] STATE.md committed (single sweep commit covering the whole STATE.md cluster)

</step>

<step name="assert_clean_wc">
**Final-gate check: assert the working copy is clean before declaring the transition complete.**

By the time we reach this step, every committable change should already be in history:
- `phase.complete`'s ROADMAP.md / STATE.md / REQUIREMENTS.md mutations were committed immediately after the verb ran (update_roadmap_and_state).
- The PROJECT.md evolution was committed at the end of `evolve_project`.
- The STATE.md cluster (current position, project reference, accumulated context, session continuity — plus the graduation backlog written by `graduation_scan`) was swept by the single commit at the end of `update_session_continuity_after_transition`.

The only writes that happen AFTER this gate are the Route B1/B `config-set workflow._auto_chain_active false` calls inside `offer_next_phase` — each carries its own tolerant follow-up commit, so the terminal banners still never print over a dirty working copy. This is a deliberate deviation from a literal "gate immediately before each banner" placement: one gate step here plus committed config-sets beats five duplicated per-route gates, and everything else between this gate and the banners is read-only (`roadmap.analyze`, `workstream.list`).

Any uncommitted change at this point is therefore a real problem — either (a) a transition step ran a mutating verb but skipped its follow-up commit, (b) a delegated helper (e.g. graduation.md) wrote files outside the swept set, (c) a pre-commit hook silently aborted a commit, or (d) the user mixed unrelated WIP with the transition. All four cases warrant aborting before any "Phase {X} marked complete" / milestone-complete banner rather than silently lying about WC cleanliness.

```bash
# Fail-closed probe (Phase 18 REVIEW WR-01/WR-02; predicate corrected by the
# 18-04 gap fix): `status --porcelain` sees untracked and staged-only changes
# on every backend (a `diff --name-only` probe missed both on non-jj
# backends). Dirty detection keys on the structured `entries` array — the
# cross-backend porcelain contract (empty = clean). It must NEVER key on
# `.raw`: on the jj backend `.raw` is human-readable `jj st` text ("The
# working copy has no changes....") and is non-empty even when the working
# copy is clean. EVERY probe-failure mode (non-zero exit, non-ok envelope,
# missing/non-array entries, an entry without a path, unparseable JSON)
# aborts instead of resolving to "clean" — a broken probe must never
# rubber-stamp this gate.
STATUS_JSON=$(gsd_run query status --porcelain) || { echo "FATAL: WC-cleanliness probe failed (status query exited non-zero); cannot verify the working copy is clean — fix the probe, do NOT treat this as clean." >&2; exit 1; }
DIRTY_PATHS=$(printf '%s' "$STATUS_JSON" | jq -re 'if .ok == true and ((.entries // null) | type == "array") then ([.entries[] | (.path // error("entry missing path"))] | join("\n")) else error("status envelope not ok or entries missing") end') || { echo "FATAL: WC-cleanliness probe returned an error envelope, a missing/malformed entries list (or an entry without a path), or unparseable JSON; cannot verify the working copy is clean — fix the probe, do NOT treat this as clean." >&2; exit 1; }
if [ -n "$DIRTY_PATHS" ]; then
	# Categorize the dirty paths so the operator can diagnose which class of leak fired.
	PLANNING_DIRTY=$(printf '%s\n' "$DIRTY_PATHS" | grep -E '^\.planning/|-SUMMARY\.md$|-VERIFICATION\.md$' || true)
	OTHER_DIRTY=$(printf '%s\n' "$DIRTY_PATHS" | grep -vE '^\.planning/|-SUMMARY\.md$|-VERIFICATION\.md$' || true)

	echo "FATAL: working copy is dirty before transition completion." >&2
	echo "" >&2
	if [ -n "$PLANNING_DIRTY" ]; then
		echo "Orchestrator-owned planning artifacts (a workflow step skipped its follow-up commit):" >&2
		echo "$PLANNING_DIRTY" | sed 's/^/  /' >&2
	fi
	if [ -n "$OTHER_DIRTY" ]; then
		echo "Source / scripts / tests (executor commit protocol may have leaked, OR unrelated WIP was present):" >&2
		echo "$OTHER_DIRTY" | sed 's/^/  /' >&2
	fi
	echo "" >&2
	echo "Transition completion requires a clean working copy. Resolve via one of:" >&2
	echo "  - commit the listed files with a descriptive message" >&2
	echo "  - if planning artifacts: identify the workflow step that produced them and add its missing commit (do not just paper over here)" >&2
	echo "  - if unrelated WIP: jj abandon @ (or stash via git, then re-run the transition)" >&2
	exit 1
fi
```

**Why unconditional and not just `.planning/`:** the gate's job is to catch ALL forms of "we're declaring done but state isn't durable" — orchestrator mutations, delegated-helper writes, hook-aborted commits, mixed-in WIP. Restricting to `.planning/` would only catch case (a) and silently rubber-stamp cases (b)–(d). The categorization in the error message keeps the diagnostic story clean without weakening the gate.

**Do not bypass.** If this gate fires, fix the root cause:
- Orchestrator-owned planning paths dirty → find the transition step that ran the mutating verb without an immediate commit and add the commit there
- Source/script/test paths dirty → trace what left them; nothing in this workflow should touch non-planning files
- Mixed unrelated WIP → commit or `jj abandon @` before re-running the transition

Suppressing the gate without fixing the root cause re-introduces the original Phase 14 bug.
</step>

<step name="offer_next_phase">

**MANDATORY: Verify milestone status before presenting next steps.**

**Use the transition result from `gsd-tools.cjs query phase.complete`:**

The `is_last_phase` field from the phase complete result tells you directly:
- `is_last_phase: false` → More phases remain → Go to **Route A**
- `is_last_phase: true` → Last phase done → **Check for workstream collisions first**

The `next_phase` and `next_phase_name` fields give you the next phase details.

If you need additional context, use:
```bash
ROADMAP=$(gsd_run query roadmap.analyze)
```

This returns all phases with goals, disk status, and completion info.

---

**Workstream collision check (when `is_last_phase: true`):**

Before routing to Route B, check whether other workstreams are still active.
This prevents one workstream from advancing or completing the milestone while
other workstreams are still working on their phases.

**Skip this check if NOT in workstream mode** (i.e., `GSD_WORKSTREAM` is not set / flat mode).
In flat mode, go directly to **Route B**.

```bash
# Only check if we're in workstream mode
if [ -n "$GSD_WORKSTREAM" ]; then
  WS_LIST=$(gsd_run query workstream.list --raw)
fi
```

Parse the JSON result. The output has `{ mode, workstreams: [...] }`.
Each workstream entry has: `name`, `status`, `current_phase`, `phase_count`, `completed_phases`.

Filter out the current workstream (`$GSD_WORKSTREAM`) and any workstreams with
status containing "milestone complete" or "archived" (case-insensitive).
The remaining entries are **other active workstreams**.

- **If other active workstreams exist** → Go to **Route B1**
- **If NO other active workstreams** (or flat mode) → Go to **Route B**

---

**Route A: More phases remain in milestone**

Read ROADMAP.md to get the next phase's name and goal.

**Check if next phase has CONTEXT.md:**

```bash
ls .planning/phases/*[X+1]*/*-CONTEXT.md 2>/dev/null || true
```

**If next phase exists:**

<if mode="yolo">

**If CONTEXT.md exists:**

```
Phase [X] marked complete.

Next: Phase [X+1] — [Name]

⚡ Auto-continuing: Plan Phase [X+1] in detail
```

Exit skill and invoke SlashCommand("/gsd:plan-phase [X+1] --auto ${GSD_WS}")

**If CONTEXT.md does NOT exist:**

```
Phase [X] marked complete.

Next: Phase [X+1] — [Name]

⚡ Auto-continuing: Discuss Phase [X+1] first
```

Exit skill and invoke SlashCommand("/gsd:discuss-phase [X+1] --auto ${GSD_WS}")

</if>

<if mode="interactive" OR="custom with gates.confirm_transition true">

**If CONTEXT.md does NOT exist:**

```
## ✓ Phase [X] Complete

---

## ▶ Next Up — [${PROJECT_CODE}] ${PROJECT_TITLE}

**Phase [X+1]: [Name]** — [Goal from ROADMAP.md]

`/clear` then:

`/gsd:discuss-phase [X+1] ${GSD_WS}` — gather context and clarify approach

---

**Also available:**
- `/gsd:plan-phase [X+1] ${GSD_WS}` — skip discussion, plan directly
- `/gsd:plan-phase --research-phase [X+1] ${GSD_WS}` — investigate unknowns

---
```

**If CONTEXT.md exists:**

```
## ✓ Phase [X] Complete

---

## ▶ Next Up — [${PROJECT_CODE}] ${PROJECT_TITLE}

**Phase [X+1]: [Name]** — [Goal from ROADMAP.md]
<sub>✓ Context gathered, ready to plan</sub>

`/clear` then:

`/gsd:plan-phase [X+1] ${GSD_WS}`

---

**Also available:**
- `/gsd:discuss-phase [X+1] ${GSD_WS}` — revisit context
- `/gsd:plan-phase --research-phase [X+1] ${GSD_WS}` — investigate unknowns

---
```

</if>

---

**Route B1: Workstream done, other workstreams still active**

This route is reached when `is_last_phase: true` AND the collision check found
other active workstreams. Do NOT suggest completing the milestone or advancing
to the next milestone — other workstreams are still working.

**Clear auto-advance chain flag** — workstream boundary is the natural stopping point:

```bash
gsd_run query config-set workflow._auto_chain_active false
gsd_run query commit "chore: clear auto-advance chain flag" --files .planning/config.json || true
```

The commit is needed because `config-set` writes `.planning/config.json` to disk WITHOUT committing. The `|| true` is purely defensive against unexpected launcher/node failures — it does NOT exist for the already-`false` no-change case: when the rewrite is byte-identical, the commit verb itself already exits 0 with `{ committed: false, reason: 'nothing_to_commit' }`, so that path never produces a non-zero exit to tolerate.

<if mode="yolo">

Override auto-advance: do NOT auto-continue to milestone completion.
Present the blocking information and stop.

</if>

Present (all modes):

```
## ✓ Phase {X}: {Phase Name} Complete

This workstream's phases are complete. Other workstreams are still active:

| Workstream | Status | Phase | Progress |
|------------|--------|-------|----------|
| {name}     | {status} | {current_phase} | {completed_phases}/{phase_count} |
| ...        | ...    | ...   | ...      |

---

## Next Steps

Archive this workstream:

`/gsd:workstreams complete {current_ws_name} ${GSD_WS}`

See overall milestone progress:

`/gsd:workstreams progress ${GSD_WS}`

<sub>Milestone completion will be available once all workstreams finish.</sub>

---
```

Do NOT suggest `/gsd:complete-milestone` or `/gsd:new-milestone`.
Do NOT auto-invoke any further slash commands.

**Stop here.** The user must explicitly decide what to do next.

---

**Route B: Milestone complete (all phases done)**

**This route is only reached when:**
- `is_last_phase: true` AND no other active workstreams exist (or flat mode)

**Clear auto-advance chain flag** — milestone boundary is the natural stopping point:

```bash
gsd_run query config-set workflow._auto_chain_active false
gsd_run query commit "chore: clear auto-advance chain flag" --files .planning/config.json || true
```

The commit is needed because `config-set` writes `.planning/config.json` to disk WITHOUT committing. The `|| true` is purely defensive against unexpected launcher/node failures — it does NOT exist for the already-`false` no-change case: when the rewrite is byte-identical, the commit verb itself already exits 0 with `{ committed: false, reason: 'nothing_to_commit' }`, so that path never produces a non-zero exit to tolerate.

<if mode="yolo">

```
Phase {X} marked complete.

🎉 Milestone {version} is 100% complete — all {N} phases finished!

⚡ Auto-continuing: Complete milestone and archive
```

Exit skill and invoke SlashCommand("/gsd:complete-milestone {version} ${GSD_WS}")

</if>

<if mode="interactive" OR="custom with gates.confirm_transition true">

```
## ✓ Phase {X}: {Phase Name} Complete

🎉 Milestone {version} is 100% complete — all {N} phases finished!

---

## ▶ Next Up — [${PROJECT_CODE}] ${PROJECT_TITLE}

**Complete Milestone {version}** — archive and prepare for next

`/clear` then:

`/gsd:complete-milestone {version} ${GSD_WS}`

---

**Also available:**
- Review accomplishments before archiving

---
```

</if>

</step>

</process>

<implicit_tracking>
Progress tracking is IMPLICIT: planning phase N implies phases 1-(N-1) complete. No separate progress step—forward motion IS progress.
</implicit_tracking>

<partial_completion>

If user wants to move on but phase isn't fully complete:

```
Phase [X] has incomplete plans:
- {phase}-02-PLAN.md (not executed)
- {phase}-03-PLAN.md (not executed)

Options:
1. Mark complete anyway (plans weren't needed)
2. Defer work to later phase
3. Stay and finish current phase
```

Respect user judgment — they know if work matters.

**If marking complete with incomplete plans:**

- Update ROADMAP: "2/3 plans complete" (not "3/3")
- Note in transition message which plans were skipped

</partial_completion>

<success_criteria>

Transition is complete when:

- [ ] Current phase plan summaries verified (all exist or user chose to skip)
- [ ] Any stale handoffs deleted
- [ ] ROADMAP.md updated with completion status and plan count
- [ ] PROJECT.md evolved (requirements, decisions, description if needed)
- [ ] STATE.md updated (position, project reference, context, session)
- [ ] Progress table updated
- [ ] User knows next steps

</success_criteria>
