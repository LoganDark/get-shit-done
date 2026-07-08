<purpose>
Execute small, ad-hoc tasks with GSD guarantees (atomic commits, STATE.md tracking). Quick mode spawns gsd-planner (quick mode) + gsd-executor(s), tracks tasks in `.planning/quick/`, and updates STATE.md's "Quick Tasks Completed" table.

With `--full` flag: enables the complete quality pipeline — discussion + research + plan-checking + verification. One flag for everything.

With `--validate` flag: enables plan-checking (max 2 iterations) and post-execution verification only. Use when you want quality guarantees without discussion or research.

With `--discuss` flag: lightweight discussion phase before planning. Surfaces assumptions, clarifies gray areas, captures decisions in CONTEXT.md so the planner treats them as locked.

With `--research` flag: spawns a focused research agent before planning. Investigates implementation approaches, library options, and pitfalls. Use when you're unsure how to approach a task.

Granular flags are composable: `--discuss --research --validate` gives the same result as `--full`.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<available_agent_types>
Valid GSD subagent types (use exact names — do not fall back to 'general-purpose'):
- gsd-phase-researcher — Researches technical approaches for a phase
- gsd-planner — Creates detailed plans from phase scope
- gsd-plan-checker — Reviews plan quality before execution
- gsd-executor — Executes plan tasks, commits, creates SUMMARY.md
- gsd-verifier — Verifies phase completion, checks quality gates
- gsd-code-reviewer — Reviews source files for bugs, security issues, and code quality
</available_agent_types>

<process>
**Step 1: Parse arguments and get task description**

Parse `$ARGUMENTS` for:
- `--full` flag → store `$FULL_MODE=true`, `$DISCUSS_MODE=true`, `$RESEARCH_MODE=true`, `$VALIDATE_MODE=true`
- `--validate` flag → store `$VALIDATE_MODE=true`
- `--discuss` flag → store `$DISCUSS_MODE=true`
- `--research` flag → store `$RESEARCH_MODE=true`
- Remaining text → use as `$DESCRIPTION` if non-empty

After parsing, normalize: if `$DISCUSS_MODE` and `$RESEARCH_MODE` and `$VALIDATE_MODE` are all true, set `$FULL_MODE=true`. This ensures `--discuss --research --validate` is treated identically to `--full`.

If `$DESCRIPTION` is empty after parsing, prompt user interactively:


**Text mode (`workflow.text_mode: true` in config or `--text` flag):** Set `TEXT_MODE=true` if `--text` is present in `$ARGUMENTS` OR `text_mode` from init JSON is `true`. When TEXT_MODE is active, replace every `AskUserQuestion` call with a plain-text numbered list and ask the user to type their choice number. This is required for non-Claude runtimes (OpenAI Codex, Gemini CLI, etc.) where `AskUserQuestion` is not available.

```
AskUserQuestion(
  header: "Quick Task",
  question: "What do you want to do?",
  followUp: null
)
```

Store response as `$DESCRIPTION`.

If still empty, re-prompt: "Please provide a task description."

Display banner based on active flags:

If `$FULL_MODE` (all phases enabled — `--full` or all granular flags):
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► QUICK TASK (FULL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Discussion + research + plan checking + verification enabled
```

If `$DISCUSS_MODE` and `$VALIDATE_MODE` (no research):
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► QUICK TASK (DISCUSS + VALIDATE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Discussion + plan checking + verification enabled
```

If `$DISCUSS_MODE` and `$RESEARCH_MODE` (no validate):
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► QUICK TASK (DISCUSS + RESEARCH)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Discussion + research enabled
```

If `$RESEARCH_MODE` and `$VALIDATE_MODE` (no discuss):
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► QUICK TASK (RESEARCH + VALIDATE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Research + plan checking + verification enabled
```

If `$DISCUSS_MODE` only:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► QUICK TASK (DISCUSS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Discussion phase enabled — surfacing gray areas before planning
```

If `$RESEARCH_MODE` only:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► QUICK TASK (RESEARCH)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Research phase enabled — investigating approaches before planning
```

If `$VALIDATE_MODE` only:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► QUICK TASK (VALIDATE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Plan checking + verification enabled
```

---

**Step 2: Initialize**

```bash
_GSD_SHIM_NAME="gsd-tools.cjs"; _GSD_RUNTIME_ROOT="${RUNTIME_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || jj workspace root 2>/dev/null || pwd)}"; GSD_TOOLS="${_GSD_RUNTIME_ROOT}/gsd-core/bin/${_GSD_SHIM_NAME}"; if [ -f "$GSD_TOOLS" ]; then gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${_GSD_RUNTIME_ROOT}/.claude/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${_GSD_RUNTIME_ROOT}/.claude/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${_GSD_RUNTIME_ROOT}/.codex/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${_GSD_RUNTIME_ROOT}/.codex/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif command -v gsd-tools >/dev/null 2>&1; then GSD_TOOLS="$(command -v gsd-tools)"; gsd_run() { "$GSD_TOOLS" "$@"; }; elif [ -f "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${HERMES_HOME:-$HOME/.hermes}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${HERMES_HOME:-$HOME/.hermes}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${CURSOR_CONFIG_DIR:-$HOME/.cursor}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${CURSOR_CONFIG_DIR:-$HOME/.cursor}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${CODEX_HOME:-$HOME/.codex}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${CODEX_HOME:-$HOME/.codex}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${GEMINI_CONFIG_DIR:-$HOME/.gemini}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${GEMINI_CONFIG_DIR:-$HOME/.gemini}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${COPILOT_CONFIG_DIR:-$HOME/.copilot}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${COPILOT_CONFIG_DIR:-$HOME/.copilot}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${WINDSURF_CONFIG_DIR:-$HOME/.codeium/windsurf}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${WINDSURF_CONFIG_DIR:-$HOME/.codeium/windsurf}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${AUGMENT_CONFIG_DIR:-$HOME/.augment}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${AUGMENT_CONFIG_DIR:-$HOME/.augment}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${TRAE_CONFIG_DIR:-$HOME/.trae}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${TRAE_CONFIG_DIR:-$HOME/.trae}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${QWEN_CONFIG_DIR:-$HOME/.qwen}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${QWEN_CONFIG_DIR:-$HOME/.qwen}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${CODEBUDDY_CONFIG_DIR:-$HOME/.codebuddy}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${CODEBUDDY_CONFIG_DIR:-$HOME/.codebuddy}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${CLINE_CONFIG_DIR:-$HOME/.cline}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${CLINE_CONFIG_DIR:-$HOME/.cline}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${GROK_AGENTS_HOME:-$HOME/.agents}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${GROK_AGENTS_HOME:-$HOME/.agents}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${ANTIGRAVITY_CONFIG_DIR:-$HOME/.gemini/antigravity}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${ANTIGRAVITY_CONFIG_DIR:-$HOME/.gemini/antigravity}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${OPENCODE_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/opencode}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${OPENCODE_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/opencode}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${KILO_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/kilo}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${KILO_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/kilo}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; else echo "ERROR: gsd-tools.cjs not found at $GSD_TOOLS and gsd-tools is not on PATH. Run: npx -y @opengsd/gsd-core@latest --claude --local" >&2; exit 1; fi; if [ -n "${CLAUDE_ENV_FILE:-}" ] && [ -n "${GSD_TOOLS:-}" ]; then printf "export PATH='%s':\"\$PATH\"\n" "${GSD_TOOLS%/*}" >> "$CLAUDE_ENV_FILE" 2>/dev/null || true; fi
INIT=$(gsd_run query init.quick "$DESCRIPTION")
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
AGENT_SKILLS_PLANNER=$(gsd_run query agent-skills gsd-planner)
AGENT_SKILLS_EXECUTOR=$(gsd_run query agent-skills gsd-executor)
AGENT_SKILLS_CHECKER=$(gsd_run query agent-skills gsd-plan-checker)
AGENT_SKILLS_VERIFIER=$(gsd_run query agent-skills gsd-verifier)
```

Parse JSON for: `planner_model`, `executor_model`, `checker_model`, `verifier_model`, `reviewer_model`, `commit_docs`, `branch_name`, `quick_id`, `slug`, `date`, `timestamp`, `quick_dir`, `task_dir`, `roadmap_exists`, `planning_exists`.

```bash
USE_WORKTREES=$(gsd_run query config-get workflow.use_worktrees --raw 2>/dev/null || echo "true")
RUNTIME=$(gsd_run query config-get runtime --default claude --raw 2>/dev/null || echo "claude")
if [ "$RUNTIME" != "claude" ] && [ "$USE_WORKTREES" != "false" ]; then
  echo "FATAL: git worktree isolation (isolation=\"worktree\") is unsupported on runtime '$RUNTIME' — it would run executor agents unisolated against the main checkout. Set workflow.use_worktrees=false." >&2
  exit 1
fi
```

If `USE_WORKTREES` is not `"false"`, run a startup orphan sweep before spawning any executors. This reaps locked worktrees whose lock-owner process is dead, whose branch is merged into the default branch, and whose lock file mtime is older than 5 minutes. Running it at startup prevents accumulation of orphaned worktrees from prior sessions that exited without cleanup (#3707). (19-12: restored — the Phase 11 dispatch rewiring accidentally dropped this sweep from quick.md while execute-phase.md kept it; the verb is git-substrate and no-ops gracefully on jj-native repos.)

```bash
if [ "$USE_WORKTREES" != "false" ]; then
  gsd_run query worktree.reap-orphans 2>/dev/null || true
fi
```

If the project uses git submodules, worktree isolation is unsafe **only when the quick task touches a submodule path**. The previous behavior unconditionally disabled worktree isolation whenever `.gitmodules` existed, which penalised every quick task in a submodule project even when the task was nowhere near a submodule. Parse submodule paths from `.gitmodules` so the executor can act on actual submodule paths rather than the mere file's existence:

```bash
# Parse submodule paths from .gitmodules once (empty if no .gitmodules).
# SUBMODULE_PATHS is a newline-separated list of repo-relative paths used as
# a fail-loud commit-time guard inside the quick-task executor — if the
# executor stages any path that falls inside SUBMODULE_PATHS, it must abort
# the commit and surface the conflict rather than silently corrupting the
# submodule state.
# Note: `.gitmodules` is a git-specific config file; jj has no submodule concept yet. The `git config --file` invocation is read-only INI parsing on a flat file — keeping it raw (no D-33 cost; it is not a VCS state mutation).
if [ -f .gitmodules ]; then
  SUBMODULE_PATHS=$(git config --file .gitmodules --get-regexp '^submodule\..*\.path$' 2>/dev/null | awk '{print $2}')
else
  SUBMODULE_PATHS=""
fi
```

Quick mode does not have a pre-declared `files_modified` list (the task is freeform), so use a fail-loud guard at commit time: when the executor stages files for the quick-task commit, if any staged path falls inside a `SUBMODULE_PATHS` entry, abort with a clear error explaining that worktree-isolated commits cannot safely span submodule boundaries — the user can re-run with `workflow.use_worktrees=false` to fall back to sequential execution on the main tree. If `SUBMODULE_PATHS` is empty (no `.gitmodules` in the repo), worktree isolation proceeds normally.

**If `roadmap_exists` is false:** Error — Quick mode requires an active project with ROADMAP.md. Run `/gsd:new-project` first.

Quick tasks can run mid-phase - validation only checks ROADMAP.md exists, not phase status.

---

**Step 2.5: Handle quick-task branching**

**If `branch_name` is empty/null:** Skip and continue on the current branch.

**If `branch_name` is set:** Check out the quick-task branch before any planning commits.

The new branch must fork off the project's default branch (`origin/HEAD`), not
off whatever HEAD happens to be checked out — otherwise consecutive quick tasks
compound on top of each other and stay unpushed (#2916). If `$branch_name`
already exists locally, reuse it as-is so resumed work is not rebased.

```bash
# TODO(05-05 sweep): the quick-task branching block below mixes git-only orchestration verbs (symbolic-ref of refs/remotes/origin/HEAD, show-ref --verify, switch, fetch, merge --ff-only, checkout -b "$x" "$base") that have no current adapter substitute and depend on WS-01/WS-02.
# VCS-audit 2026-07-08: the old "git-mode-only by construction" claim was
# unenforced — quick_branch_template comes from config with no vcs.kind gate,
# so a jj project COULD reach this block and die on raw git. The substrate
# gate below enforces it: on jj, bookmark-less @ is first-class and branch
# setup is skipped.
if ! { [ -d .git ] || [ -f .git ]; }; then
  echo "NOTE: quick-task branching is git-mode-only (TODO 05-05); jj backend works on bookmark-less @ — skipping branch setup." >&2
else
DEFAULT_BRANCH=$(gsd_run query git.base-branch 2>/dev/null \
  || git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||' \
  || echo main)

if git show-ref --verify --quiet "refs/heads/$branch_name"; then
  git switch "$branch_name" \
    || { echo "ERROR: Could not switch to existing quick-task branch '$branch_name'." >&2; exit 1; }
else
  # Fetch the default branch so origin/$DEFAULT_BRANCH is current. If the fetch
  # fails (offline, no remote, auth failure) AND we have no local copy of
  # origin/$DEFAULT_BRANCH to fall back on, abort — creating the branch off
  # arbitrary HEAD is exactly the bug #2916 fixed.
  if ! git fetch --quiet origin "$DEFAULT_BRANCH"; then
    if ! git show-ref --verify --quiet "refs/remotes/origin/$DEFAULT_BRANCH"; then
      echo "ERROR: Could not fetch origin/$DEFAULT_BRANCH and no local copy exists. Refusing to create '$branch_name' off the current HEAD (#2916). Resolve the remote/network issue and retry." >&2
      exit 1
    fi
    echo "WARNING: git fetch origin $DEFAULT_BRANCH failed; using the local copy of origin/$DEFAULT_BRANCH as base." >&2
  fi

  if [ -n "$(gsd_run query status --porcelain --cwd . 2>/dev/null | jq -r '.raw // ""')" ]; then
    echo "WARNING: Uncommitted changes present. Carrying them onto the new quick-task branch — they will be branched off origin/$DEFAULT_BRANCH (not the previous-task HEAD)."
  else
    # Best-effort: fast-forward the local default branch so subsequent local
    # work sees the latest tip. Failure here is non-fatal because we always
    # create the new branch directly from origin/$DEFAULT_BRANCH below.
    git switch --quiet "$DEFAULT_BRANCH" 2>/dev/null \
      && git merge --ff-only --quiet "origin/$DEFAULT_BRANCH" 2>/dev/null \
      || true
  fi

  # Pin the new branch to origin/$DEFAULT_BRANCH so the start point is
  # deterministic regardless of which branch we are currently on (#2916).
  # On success HEAD is exactly at origin/$DEFAULT_BRANCH, so a post-creation
  # merge-base / "ahead-of" guard would be unreachable — the explicit base
  # argument here is the single source of correctness for #2916.
  git checkout -b "$branch_name" "origin/$DEFAULT_BRANCH" \
    || { echo "ERROR: Could not create '$branch_name' from origin/$DEFAULT_BRANCH (#2916)." >&2; exit 1; }
fi
fi  # git-substrate gate (VCS-audit 2026-07-08)
```

All quick-task commits for this run stay on that branch. User handles merge/rebase afterward.

---

**Step 3: Create task directory**

```bash
mkdir -p "${task_dir}"
```

---

**Step 4: Create quick task directory**

Create the directory for this quick task:

```bash
QUICK_DIR=".planning/quick/${quick_id}-${slug}"
mkdir -p "$QUICK_DIR"
```

Report to user:
```
Creating quick task ${quick_id}: ${DESCRIPTION}
Directory: ${QUICK_DIR}
```

Store `$QUICK_DIR` for use in orchestration.

---

**Step 4.5: Discussion phase (only when `$DISCUSS_MODE`)**

Skip this step entirely if NOT `$DISCUSS_MODE`.

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► DISCUSSING QUICK TASK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Surfacing gray areas for: ${DESCRIPTION}
```

**4.5a. Identify gray areas**

Analyze `$DESCRIPTION` to identify 2-4 gray areas — implementation decisions that would change the outcome and that the user should weigh in on.

Use the domain-aware heuristic to generate phase-specific (not generic) gray areas:
- Something users **SEE** → layout, density, interactions, states
- Something users **CALL** → responses, errors, auth, versioning
- Something users **RUN** → output format, flags, modes, error handling
- Something users **READ** → structure, tone, depth, flow
- Something being **ORGANIZED** → criteria, grouping, naming, exceptions

Each gray area should be a concrete decision point, not a vague category. Example: "Loading behavior" not "UX".

**4.5b. Present gray areas**

```
AskUserQuestion(
  header: "Gray Areas",
  question: "Which areas need clarification before planning?",
  options: [
    { label: "${area_1}", description: "${why_it_matters_1}" },
    { label: "${area_2}", description: "${why_it_matters_2}" },
    { label: "${area_3}", description: "${why_it_matters_3}" },
    { label: "All clear", description: "Skip discussion — I know what I want" }
  ],
  multiSelect: true
)
```

If user selects "All clear" → skip to Step 5 (no CONTEXT.md written).

**4.5c. Discuss selected areas**

For each selected area, ask 1-2 focused questions via AskUserQuestion:

```
AskUserQuestion(
  header: "${area_name}",
  question: "${specific_question_about_this_area}",
  options: [
    { label: "${concrete_choice_1}", description: "${what_this_means}" },
    { label: "${concrete_choice_2}", description: "${what_this_means}" },
    { label: "${concrete_choice_3}", description: "${what_this_means}" },
    { label: "You decide", description: "Claude's discretion" }
  ],
  multiSelect: false
)
```

Rules:
- Options must be concrete choices, not abstract categories
- Highlight recommended choice where you have a clear opinion
- If user selects "Other" with freeform text, switch to plain text follow-up (per questioning.md freeform rule)
- If user selects "You decide", capture as Claude's Discretion in CONTEXT.md
- Max 2 questions per area — this is lightweight, not a deep dive

Collect all decisions into `$DECISIONS`.

**4.5d. Write CONTEXT.md**

Write `${QUICK_DIR}/${quick_id}-CONTEXT.md` using the standard context template structure:

```markdown
# Quick Task ${quick_id}: ${DESCRIPTION} - Context

**Gathered:** ${date}
**Status:** Ready for planning

<domain>
## Task Boundary

${DESCRIPTION}

</domain>

<decisions>
## Implementation Decisions

### ${area_1_name}
- ${decision_from_discussion}

### ${area_2_name}
- ${decision_from_discussion}

### Claude's Discretion
${areas_where_user_said_you_decide_or_areas_not_discussed}

</decisions>

<specifics>
## Specific Ideas

${any_specific_references_or_examples_from_discussion}

[If none: "No specific requirements — open to standard approaches"]

</specifics>

<canonical_refs>
## Canonical References

${any_specs_adrs_or_docs_referenced_during_discussion}

[If none: "No external specs — requirements fully captured in decisions above"]

</canonical_refs>
```

Note: Quick task CONTEXT.md omits `<code_context>` and `<deferred>` sections (no codebase scouting, no phase scope to defer to). Keep it lean. The `<canonical_refs>` section is included when external docs were referenced — omit it only if no external docs apply.

Report: `Context captured: ${QUICK_DIR}/${quick_id}-CONTEXT.md`

---

**Step 4.75: Research phase (only when `$RESEARCH_MODE`)**

Skip this step entirely if NOT `$RESEARCH_MODE`.

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► RESEARCHING QUICK TASK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Investigating approaches for: ${DESCRIPTION} (runs in a subagent — no output until it returns, ~1–5 min; expected, not a freeze)
```

Spawn a single focused researcher (not 4 parallel researchers like full phases — quick tasks need targeted research, not broad domain surveys):

```
Agent(
  prompt="
<research_context>

**Mode:** quick-task
**Task:** ${DESCRIPTION}
**Output:** ${QUICK_DIR}/${quick_id}-RESEARCH.md

<files_to_read>
- .planning/STATE.md (Project state — what's already built)
- .planning/PROJECT.md (Project context)
- ./CLAUDE.md or ./.claude/CLAUDE.md (if exists — project-specific guidelines)
${DISCUSS_MODE ? '- ' + QUICK_DIR + '/' + quick_id + '-CONTEXT.md (User decisions — research should align with these)' : ''}
</files_to_read>

${AGENT_SKILLS_PLANNER}

</research_context>

<focus>
This is a quick task, not a full phase. Research should be concise and targeted:
1. Best libraries/patterns for this specific task
2. Common pitfalls and how to avoid them
3. Integration points with existing codebase
4. Any constraints or gotchas worth knowing before planning

Do NOT produce a full domain survey. Target 1-2 pages of actionable findings.
</focus>

<output>
Write research to: ${QUICK_DIR}/${quick_id}-RESEARCH.md
Use standard research format but keep it lean — skip sections that don't apply.
Return: ## RESEARCH COMPLETE with file path
</output>
",
  subagent_type="gsd-phase-researcher",
  model="{planner_model}",
  description="Research: ${DESCRIPTION}"
)
```

> **ORCHESTRATOR RULE — CODEX RUNTIME**: After calling Agent() above, stop working on this task immediately. Do not read more files, edit code, or run tests related to this task while the subagent is active. Wait for the subagent to return its result. This prevents duplicate work, conflicting edits, and wasted context. Only resume when the subagent result is available.

After researcher returns:
1. Verify research exists at `${QUICK_DIR}/${quick_id}-RESEARCH.md`
2. Report: "Research complete: ${QUICK_DIR}/${quick_id}-RESEARCH.md"

If research file not found, warn but continue: "Research agent did not produce output — proceeding to planning without research."

---

**Step 5: Spawn planner (quick mode)**

**If `$VALIDATE_MODE`:** Use `quick-full` mode with stricter constraints.

**If NOT `$VALIDATE_MODE`:** Use standard `quick` mode.

Display: `◆ Spawning planner... (runs in a subagent — no output until it returns, ~1–5 min; expected, not a freeze)`

```
Agent(
  prompt="
<planning_context>

**Mode:** ${VALIDATE_MODE ? 'quick-full' : 'quick'}
**Directory:** ${QUICK_DIR}
**Description:** ${DESCRIPTION}

<files_to_read>
- .planning/STATE.md (Project State)
- ./CLAUDE.md or ./.claude/CLAUDE.md (if exists — follow project-specific guidelines)
${DISCUSS_MODE ? '- ' + QUICK_DIR + '/' + quick_id + '-CONTEXT.md (User decisions — locked, do not revisit)' : ''}
${RESEARCH_MODE ? '- ' + QUICK_DIR + '/' + quick_id + '-RESEARCH.md (Research findings — use to inform implementation choices)' : ''}
</files_to_read>

${AGENT_SKILLS_PLANNER}

**Project skills:** Check .claude/skills/ or .agents/skills/ directory (if either exists) — read SKILL.md files, plans should account for project skill rules

</planning_context>

<constraints>
- Create a SINGLE plan with 1-3 focused tasks
- Quick tasks should be atomic and self-contained
${RESEARCH_MODE ? '- Research findings are available — use them to inform library/pattern choices' : '- No research phase'}
${VALIDATE_MODE ? '- Target ~40% context usage (structured for verification)' : '- Target ~30% context usage (simple, focused)'}
${VALIDATE_MODE ? '- MUST generate `must_haves` in plan frontmatter (truths, artifacts, key_links)' : ''}
${VALIDATE_MODE ? '- Each task MUST have `files`, `action`, `verify`, `done` fields' : ''}
</constraints>

<output>
Write plan to: ${QUICK_DIR}/${quick_id}-PLAN.md
Return: ## PLANNING COMPLETE with plan path
</output>
",
  subagent_type="gsd-planner",
  model="{planner_model}",
  description="Quick plan: ${DESCRIPTION}"
)
```

> **ORCHESTRATOR RULE — CODEX RUNTIME**: After calling Agent() above, stop working on this task immediately. Do not read more files, edit code, or run tests related to this task while the subagent is active. Wait for the subagent to return its result. This prevents duplicate work, conflicting edits, and wasted context. Only resume when the subagent result is available.

After planner returns:
1. Verify plan exists at `${QUICK_DIR}/${quick_id}-PLAN.md`
2. Extract plan count (typically 1 for quick tasks)
3. Report: "Plan created: ${QUICK_DIR}/${quick_id}-PLAN.md"

If plan not found, error: "Planner failed to create ${quick_id}-PLAN.md"

---

**Step 5.5: Plan-checker loop (only when `$VALIDATE_MODE`)**

Skip this step entirely if NOT `$VALIDATE_MODE`.

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► CHECKING PLAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning plan checker... (runs in a subagent — no output until it returns, ~1–5 min; expected, not a freeze)
```

Checker prompt:

```markdown
<verification_context>
**Mode:** quick-full
**Task Description:** ${DESCRIPTION}

<files_to_read>
- ${QUICK_DIR}/${quick_id}-PLAN.md (Plan to verify)
</files_to_read>

${AGENT_SKILLS_CHECKER}

**Scope:** This is a quick task, not a full phase. Skip checks that require a ROADMAP phase goal.
</verification_context>

<check_dimensions>
- Requirement coverage: Does the plan address the task description?
- Task completeness: Do tasks have files, action, verify, done fields?
- Key links: Are referenced files real?
- Scope sanity: Is this appropriately sized for a quick task (1-3 tasks)?
- must_haves derivation: Are must_haves traceable to the task description?

Skip: cross-plan deps (single plan), ROADMAP alignment
${DISCUSS_MODE ? '- Context compliance: Does the plan honor locked decisions from CONTEXT.md?' : '- Skip: context compliance (no CONTEXT.md)'}
</check_dimensions>

<expected_output>
- ## VERIFICATION PASSED — all checks pass
- ## ISSUES FOUND — structured issue list
</expected_output>
```

```
Agent(
  prompt=checker_prompt,
  subagent_type="gsd-plan-checker",
  model="{checker_model}",
  description="Check quick plan: ${DESCRIPTION}"
)
```

> **ORCHESTRATOR RULE — CODEX RUNTIME**: After calling Agent() above, stop working on this task immediately. Do not read more files, edit code, or run tests related to this task while the subagent is active. Wait for the subagent to return its result. This prevents duplicate work, conflicting edits, and wasted context. Only resume when the subagent result is available.

**Handle checker return:**

- **`## VERIFICATION PASSED`:** Display confirmation, proceed to step 6.
- **`## ISSUES FOUND`:** Display issues, check iteration count, enter revision loop.

**Revision loop (max 2 iterations):**

Track `iteration_count` (starts at 1 after initial plan + check).

**If iteration_count < 2:**

Display: `Sending back to planner for revision... (iteration ${N}/2)`

Revision prompt:

```markdown
<revision_context>
**Mode:** quick-full (revision)

<files_to_read>
- ${QUICK_DIR}/${quick_id}-PLAN.md (Existing plan)
</files_to_read>

${AGENT_SKILLS_PLANNER}

**Checker issues:** ${structured_issues_from_checker}

</revision_context>

<instructions>
Make targeted updates to address checker issues.
Do NOT replan from scratch unless issues are fundamental.
Return what changed.
</instructions>
```

```
Agent(
  prompt=revision_prompt,
  subagent_type="gsd-planner",
  model="{planner_model}",
  description="Revise quick plan: ${DESCRIPTION}"
)
```

> **ORCHESTRATOR RULE — CODEX RUNTIME**: After calling Agent() above, stop working on this task immediately. Do not read more files, edit code, or run tests related to this task while the subagent is active. Wait for the subagent to return its result. This prevents duplicate work, conflicting edits, and wasted context. Only resume when the subagent result is available.

After planner returns → spawn checker again, increment iteration_count.

**If iteration_count >= 2:**

Display: `Max iterations reached. ${N} issues remain:` + issue list

Offer: 1) Force proceed, 2) Abort

---

**Step 5.6: Pre-dispatch plan commit (worktree mode only)**

When `USE_WORKTREES !== "false"`, commit PLAN.md to the current branch **before** spawning the executor. This ensures the worktree inherits PLAN.md at its branch HEAD so the executor can read it via a worktree-rooted path — avoiding the main-repo path priming that triggers CC #36182 path-resolution drift.

Skip this step entirely if `USE_WORKTREES === "false"` (non-worktree mode: PLAN.md is committed in Step 8 as usual).

```bash
QUICK_PLAN_PARENT=""
QUICK_PLAN_COMMIT=""
if [ "${USE_WORKTREES}" != "false" ]; then
  # #1265 (19-12 re-point): adapter-mediated head capture — the pre-dispatch
  # parent revision (git commit_id / jj change_id) recorded before PLAN.md lands.
  QUICK_PLAN_PARENT=$(gsd_run query head-ref --cwd . --pick head)
  COMMIT_DOCS=$(gsd_run query config-get commit_docs 2>/dev/null || echo "true")
  if [ "$COMMIT_DOCS" != "false" ]; then
    # CMD-05: single squash on orchestrator @ (no phase setup, no workspace, no octopus).
    # The query commit verb routes through vcs.commit({files, message, noVerify});
    # adapter handles git-add ↔ jj-squash translation. --no-verify is forwarded when
    # workflow.worktree_skip_hooks=true (#2924 honored on both backends).
    SKIP_HOOKS=$(gsd_run query config-get workflow.worktree_skip_hooks 2>/dev/null || echo "false")
    if [ "$SKIP_HOOKS" = "true" ]; then
      _QP_ENVELOPE=$(gsd_run query commit "docs(${quick_id}): pre-dispatch plan for ${DESCRIPTION}" --files "${QUICK_DIR}/${quick_id}-PLAN.md" --no-verify) \
        || { echo "ERROR: pre-dispatch PLAN.md commit failed (--no-verify path). Aborting before executor dispatch." >&2; exit 1; }
    else
      _QP_ENVELOPE=$(gsd_run query commit "docs(${quick_id}): pre-dispatch plan for ${DESCRIPTION}" --files "${QUICK_DIR}/${quick_id}-PLAN.md") \
        || { echo "ERROR: pre-dispatch PLAN.md commit failed — likely a pre-commit hook failure. Fix the hook output above (or set workflow.worktree_skip_hooks=true to bypass) and re-run." >&2; exit 1; }
    fi
    # #1265 (19-12 re-point): the created-revision id comes from the commit
    # ENVELOPE (v1.5 CommitResult.id discipline) — on jj, probing head AFTER a
    # squash-commit would report the new empty working-copy change, not the
    # commit that carries PLAN.md.
    QUICK_PLAN_COMMIT=$(printf '%s' "$_QP_ENVELOPE" | jq -r '.id // empty')
    # Idempotent re-runs: when there is nothing to commit, the query commit verb
    # emits {committed: false, reason: 'nothing_to_commit'} with exit 0 (no-op
    # semantics) — no special-case staged-diff probe needed (id stays empty and
    # the head fallback below applies).
  fi
  if [ -z "$QUICK_PLAN_COMMIT" ]; then
    # #1265 (19-12 re-point): covers the commit_docs=false and
    # nothing_to_commit paths — PLAN.md already lives in the head revision, so
    # the head id is the correct materialization source for read-blob.
    QUICK_PLAN_COMMIT=$(gsd_run query head-ref --cwd . --pick head)
  fi
fi
```

---

**Step 6: Spawn executor**

Auto-degrade to sequential if HEAD has diverged from the worktree fork base (#1941, mirrors
execute-phase's #683/#1369 guard). Claude Code's `isolation="worktree"` forks new worktrees from
`origin/HEAD`, not the live local HEAD. If a prior quick task in this session (or the Step 5.6
pre-dispatch plan commit above) advanced local HEAD without an intervening `git push`,
`origin/HEAD` stays pinned to a stale ancestor and the executor's `worktree_branch_check` guard
halts with a base-mismatch fatal — potentially many commits behind, not just one. Run this check
immediately before capturing `EXPECTED_BASE` so it reflects the most current local state.

```bash
if [ "$RUNTIME" = "claude" ] && [ "${USE_WORKTREES:-true}" != "false" ]; then
  _QUICK_SHOULD_DEGRADE=$(gsd_run query worktree.base-check --pick shouldDegrade 2>/dev/null || true)
  if [ "$_QUICK_SHOULD_DEGRADE" = "true" ]; then
    _QUICK_DEGRADE_MSG=$(gsd_run query worktree.base-check --pick message 2>/dev/null || true)
    [ -n "$_QUICK_DEGRADE_MSG" ] && printf '%s\n' "$_QUICK_DEGRADE_MSG" >&2
    echo "⚠ [#1941] Worktree fork base diverged from orchestrator HEAD — auto-degrading to sequential mode for this quick task to avoid a base-mismatch halt." >&2
    USE_WORKTREES=false
  fi
fi
```

Capture current HEAD + dispatch the quick task via the cross-backend parallel verb. Per Phase 11 D-01, no manifest file is written — the `ParallelDispatchHandle` JSON lives in `$HANDLE_JSON`. `maxConcurrency` is omitted (D-07). Quick mode typically dispatches N=1 (single executor); the parallel verb works trivially at N=1.

```bash
EXPECTED_BASE=$(gsd_run query head-ref --cwd . --pick head)
DISPATCH_TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Phase 14.1 (PARALLEL-08, D-01 symmetric workflow scope): the `current-branch`
# FATAL preflight is removed — bookmark-less jj `@` and detached-HEAD git
# working copies are first-class dispatch states. EXPECTED_BRANCH is still
# captured here because the fan-in branch-drift guard below still
# consumes it (gracefully degrades to a no-op when empty per Pitfall 6).
# Envelope note: `current-branch` returns {ok, bookmarks: []} — bookmarks[0]
# is the head bookmark (empty on bookmark-less jj `@` / detached git HEAD).
EXPECTED_BRANCH=$(gsd_run query current-branch --cwd . --pick "bookmarks[0]")
if [ "${USE_WORKTREES:-true}" != "false" ]; then
  QUICK_PLAN_JSON=$(jq -nc --arg aid "${quick_id}" --arg pid "${quick_id}" \
    '[{agentId:$aid,planId:$pid}]')
  # Phase sentinel 0 for quick mode (no real phase number; the verb requires Number()-able input).
  # Phase 14.1 (PARALLEL-08, D-02): no --main-bookmark flag — zero flags
  # yields empty mainBookmarks → fan-in skips the bookmark/ref advance step.
  # Bookmark-less jj `@` and detached-HEAD git working copies pass cleanly.
  HANDLE_JSON=$(printf '%s' "$QUICK_PLAN_JSON" \
    | gsd_run query workspace.parallel.dispatch \
        --phase 0 --plan @-)
  [ -z "$HANDLE_JSON" ] && { echo "FATAL: workspace.parallel.dispatch returned empty Handle JSON" >&2; exit 1; }
  HANDLE_OK=$(echo "$HANDLE_JSON" | jq -r '.ok // "true"')
  [ "$HANDLE_OK" = "false" ] && { echo "FATAL: workspace.parallel.dispatch failed: $HANDLE_JSON" >&2; exit 1; }
  RESULTS_ACCUM='[]'   # ParallelAgentResult[]; one appended per Agent() return
fi
```

Iterate `.workspaces[]` from `$HANDLE_JSON` (N=1 for quick mode — single iteration). Each entry is `{ name, path, baseRev, agentId, baselineOpId }`. `path` is the per-agent cwd; `agentId` keys the `ParallelAgentResult` accumulated for fan-in.

Spawn gsd-executor with plan reference:

```
Agent(
  prompt="
Execute quick task ${quick_id}.

${USE_WORKTREES !== "false" ? `
<worktree_branch_check>
Upstream-guard re-expression (#48/#2924/#2015): the upstream \`worktree_branch_check\`
build-time embed (fragment: \`gsd-core/references/worktree-branch-check.md\`, base
${EXPECTED_BASE}) is superseded on the dispatch path by the executor-side
\`workspace.assert-dispatched-cwd\` precondition — the dispatch envelope binds this
workspace to \`baseRev\` at creation, substitute \`{EXPECTED_BASE_ALTERNATE}\` with \`${QUICK_PLAN_PARENT}\` when it differs from \`${EXPECTED_BASE}\` (otherwise empty), and the executor's first commit asserts its cwd
IS a dispatched subagent workspace (FATAL, never self-recovers via \`git update-ref\`;
same verify-only behavior as the fragment's exit-42). The git-only fragment remains at
\`gsd-core/references/worktree-branch-check.md\` for non-dispatched worktree flows.
</worktree_branch_check>

FIRST ACTION after the worktree branch check: ensure the quick PLAN.md exists at a worktree-rooted relative path before any Read/Edit/Write path can be primed. If \`${QUICK_DIR}/${quick_id}-PLAN.md\` is absent, materialize it from the shared git object store:

\`\`\`bash
QUICK_PLAN_COMMIT="${QUICK_PLAN_COMMIT}"
QUICK_PLAN_PATH="${QUICK_DIR}/${quick_id}-PLAN.md"
if [ ! -f "$QUICK_PLAN_PATH" ]; then
  mkdir -p "$(dirname "$QUICK_PLAN_PATH")"
  gsd_run query read-blob --rev "${QUICK_PLAN_COMMIT}" --path "$QUICK_PLAN_PATH" --pick content > "$QUICK_PLAN_PATH" || {
    echo "FATAL: unable to materialize quick plan from ${QUICK_PLAN_COMMIT}:${QUICK_PLAN_PATH}; refusing to continue." >&2
    exit 42
  }
fi
\`\`\`
` : ''}

<files_to_read>
- ${QUICK_DIR}/${quick_id}-PLAN.md (Plan)
- .planning/STATE.md (Project state)
- ./CLAUDE.md or ./.claude/CLAUDE.md (Project instructions, if exists)
- .claude/skills/ or .agents/skills/ (Project skills, if either exists — list skills, read SKILL.md for each, follow relevant rules during implementation)
</files_to_read>

${AGENT_SKILLS_EXECUTOR}

<submodule_commit_guard>
SUBMODULE_PATHS for this project: ${SUBMODULE_PATHS}

If SUBMODULE_PATHS is non-empty, you MUST run this fail-loud guard immediately
before EVERY git commit you create during this quick task (after \`git add\`,
before \`git commit\`). Quick mode does not have a pre-declared files_modified
list, so the guard runs at commit time:

\`\`\`bash
SUBMODULE_PATHS=\"${SUBMODULE_PATHS}\"
if [ -n \"\$SUBMODULE_PATHS\" ]; then
  STAGED=\$(gsd_run query diff --cached --name-only --cwd . 2>/dev/null | jq -r '.nameOnly // [] | .[]')
  for sm_raw in \$SUBMODULE_PATHS; do
    sm=\"\${sm_raw#./}\"
    sm=\"\${sm%/}\"
    [ -z \"\$sm\" ] && continue
    for f_raw in \$STAGED; do
      f=\"\${f_raw#./}\"
      f=\"\${f%/}\"
      case \"\$f\" in
        \"\$sm\"|\"\$sm\"/*)
          echo \"ABORT: staged path \$f_raw falls inside submodule \$sm — worktree-isolated commits cannot safely span submodule boundaries. Re-run with workflow.use_worktrees=false.\" >&2
          exit 1 ;;
      esac
    done
  done
fi
\`\`\`

If the guard aborts, do NOT attempt the commit, do NOT remove the staged files,
and do NOT continue subsequent tasks. Surface the abort message in your
SUMMARY.md and stop — the user must rerun with worktrees disabled.
</submodule_commit_guard>

<constraints>
- Execute all tasks in the plan
- Commit each task atomically (code changes only)
- Run the <submodule_commit_guard> bash block before every \`git commit\` if SUBMODULE_PATHS is non-empty
- Create summary at: ${QUICK_DIR}/${quick_id}-SUMMARY.md with `status: complete` in SUMMARY frontmatter (required so the audit-open milestone-close scanner recognises the task as done, not [unknown])
- Do NOT commit docs artifacts (SUMMARY.md, STATE.md, PLAN.md) — the orchestrator handles the docs commit in Step 8
- Do NOT update ROADMAP.md (quick tasks are separate from planned phases)
</constraints>
",
  subagent_type="gsd-executor",
  model="{executor_model}",
  ${USE_WORKTREES !== "false" ? 'isolation="worktree",' : ''}
  description="Execute: ${DESCRIPTION}"
)
```

> **ORCHESTRATOR RULE — CODEX RUNTIME**: After calling Agent() above, stop working on this task immediately. Do not read more files, edit code, or run tests related to this task while the subagent is active. Wait for the subagent to return its result. This prevents duplicate work, conflicting edits, and wasted context. Only resume when the subagent result is available.

After `Agent()` returns (N=1 in quick mode), append one `ParallelAgentResult` (`{ agentId, exitCode, lastChangeId?, stderr? }`) to `$RESULTS_ACCUM`. Probe the workspace head via `gsd_run query head-ref --cwd "$WS_PATH" --pick head`. `$HANDLE_JSON` is the source of truth for the workspace SET; do not re-discover via filesystem scans.

**Upstream-guard re-expression (#3384 manifest source of truth):** upstream refused broad worktree discovery without `QUICK_WORKTREE_MANIFEST`. The same anti-discovery contract now rides the dispatch envelope: `$HANDLE_JSON` is the only workspace-set source of truth, consumed directly by fan-in.

After executor returns:
1. **Workspace fan-in:** If the executor ran with `isolation="worktree"`, merge the dispatched workspace back via `vcs.workspace.parallel.fanIn`. The adapter handles per-success cleanup (git) and atomic octopus merge + reap (jj). Per Phase 11 D-01, no manifest file is on disk — the Handle JSON in `$HANDLE_JSON` + the `$RESULTS_ACCUM` array are the full input.
   ```bash
   if [ "${USE_WORKTREES:-true}" != "false" ] && [ -n "${HANDLE_JSON:-}" ]; then
     # Branch-drift guard (#3174-class). `current-branch` returns {ok, bookmarks: []};
     # empty EXPECTED_BRANCH (bookmark-less jj `@` / detached git HEAD) degrades to a no-op.
     ORCH_BRANCH=$(gsd_run query current-branch --cwd . --pick "bookmarks[0]" 2>/dev/null)
     [ -z "${EXPECTED_BRANCH:-}" ] || [ "$ORCH_BRANCH" = "$EXPECTED_BRANCH" ] || { echo "FATAL: orchestrator on '$ORCH_BRANCH' but expected '$EXPECTED_BRANCH' before fan-in (#3174-class drift)" >&2; exit 1; }

     # Handle via tmpfile (CLI rejects both --handle @- and --results @- per Plan 11.2).
     HANDLE_FILE=$(mktemp "${TMPDIR:-/tmp}/gsd-handle-XXXXXX") && mv "$HANDLE_FILE" "${HANDLE_FILE}.json" && HANDLE_FILE="${HANDLE_FILE}.json" || exit 1  # XXXXXX must be path-final on BSD/macOS (#1520)
     printf '%s' "$HANDLE_JSON" > "$HANDLE_FILE"
     FAN_RESULT=$(printf '%s' "$RESULTS_ACCUM" \
       | gsd_run query workspace.parallel.fan-in --handle "@$HANDLE_FILE" --results @-)
     rm -f "$HANDLE_FILE"

     CONFLICTED=$(echo "$FAN_RESULT" | jq -r '.conflicted // false')
     FAILED_REAPED=$(echo "$FAN_RESULT" | jq -r '.failedReaped // [] | length')
     MERGED_COUNT=$(echo "$FAN_RESULT" | jq -r '.merged // [] | length')
     if [ "$CONFLICTED" = "true" ] || [ "$FAILED_REAPED" -gt 0 ]; then
       echo "⚠ Fan-in surfaced issues (conflicted=$CONFLICTED, failedReaped=$FAILED_REAPED)" >&2
       echo "$FAN_RESULT" | jq .
       exit 1
     fi
     echo "✓ Fan-in merged $MERGED_COUNT workspace(s) cleanly."
   fi
   ```
   If `workflow.use_worktrees` is `false` or `$HANDLE_JSON` is empty, skip this step.

   > **ISOLATED-RUN RECOVERY — FAIL SAFE (#1292):** When an isolated (worktree) run is *rejected* — the user declines to merge it, the orchestrator surfaces recovery guidance for a blocked/halted plan, or the run over-reached the requested scope — the worktree-isolation contract MUST hold through recovery. Do **NOT** propose continuing on `main`/the primary checkout as the default or recommended recovery path. Default to a **safe halt** and offer: (a) re-attempt in a **fresh, narrowly-scoped worktree**, or (b) inspect or discard the rejected worktree without merging. Any path that edits the primary checkout requires an **explicit, clearly-labeled confirmation** from the user first — editing `main` directly is never the proposed or default option for a run the user configured to be isolated.

2. Verify summary exists at `${QUICK_DIR}/${quick_id}-SUMMARY.md`
3. Extract commit hash from executor output
4. Report completion status

**Known Claude Code bug (classifyHandoffIfNeeded):** If executor reports "failed" with error `classifyHandoffIfNeeded is not defined`, this is a Claude Code runtime bug — not a real failure. Check if summary file exists and git log shows commits. If so, treat as successful.

If summary not found, error: "Executor failed to create ${quick_id}-SUMMARY.md"

Note: For quick tasks producing multiple plans (rare), spawn executors in parallel waves per execute-phase patterns.

---

**Step 6.25: Code review (auto)**

Skip this step entirely if `$FULL_MODE` is false.

**Capability gate:**
```bash
EXECUTE_POST_HOOKS_JSON=$(gsd_run loop render-hooks execute:post --raw)
```

Resolve active step hooks from `EXECUTE_POST_HOOKS_JSON` where `kind == "step"` and `ref.skill == "code-review"`.

If no active code-review step hook exists, skip with message "Code review skipped (code-review capability inactive)".

**Scope files from executor's commits:**
```bash
# Find the diff base: last commit before quick task started
# gsd_run query log returns {ok, entries: LogEntry[]}; client-side filter on subject to find quick-task commits. LogEntry.id is the unified revision id (hex on git, [k-z] change-id on jj).
QUICK_COMMITS=$(gsd_run query log --max-count 200 --cwd . 2>/dev/null \
  | jq -r --arg sub "${quick_id}" '.entries[]? | select(.subject | contains($sub)) | .id')
if [ -n "$QUICK_COMMITS" ]; then
  DIFF_BASE=$(echo "$QUICK_COMMITS" | tail -1)^
  # TODO(05-05 sweep): no rev-parse-shaped query verb exists (phantom — do not invent); the parent-resolution probe (used to detect "first commit in repo" so we can fall back) stays raw git for now. Read-only — D-33 anti-pattern guard not engaged.
  git rev-parse "${DIFF_BASE}" >/dev/null 2>&1 || DIFF_BASE=$(echo "$QUICK_COMMITS" | tail -1)
else
  # No commits found for this quick task — skip review
  DIFF_BASE=""
fi

if [ -n "$DIFF_BASE" ]; then
  CHANGED_FILES=$(gsd_run query diff --name-only --range "${DIFF_BASE}..HEAD" --cwd . -- . ':!.planning' 2>/dev/null \
    | jq -r '.nameOnly // [] | .[]' | tr '\n' ' ')
else
  CHANGED_FILES=""
fi
```

If `CHANGED_FILES` is empty, skip with "No source files changed — skipping code review."

**Invoke review:**
```
Agent(
  prompt="Review these files for bugs, security issues, and code quality.
  Files: ${CHANGED_FILES}
  Output: ${QUICK_DIR}/${quick_id}-REVIEW.md
  Depth: quick",
  subagent_type="gsd-code-reviewer",
  model="{reviewer_model}"
)
```

> **ORCHESTRATOR RULE — CODEX RUNTIME**: After calling Agent() above, stop working on this task immediately. Do not read more files, edit code, or run tests related to this task while the subagent is active. Wait for the subagent to return its result. This prevents duplicate work, conflicting edits, and wasted context. Only resume when the subagent result is available.

If review produces findings, display advisory message. **Error handling:** Failures are non-blocking — catch and proceed.

---

**Step 6.5: Verification (only when `$VALIDATE_MODE`)**

Skip this step entirely if NOT `$VALIDATE_MODE`.

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► VERIFYING RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning verifier... (runs in a subagent — no output until it returns, ~1–5 min; expected, not a freeze)
```

```
Agent(
  prompt="Verify quick task goal achievement.
Task directory: ${QUICK_DIR}
Task goal: ${DESCRIPTION}

<files_to_read>
- ${QUICK_DIR}/${quick_id}-PLAN.md (Plan)
</files_to_read>

${AGENT_SKILLS_VERIFIER}

Check must_haves against actual codebase. Create VERIFICATION.md at ${QUICK_DIR}/${quick_id}-VERIFICATION.md.",
  subagent_type="gsd-verifier",
  model="{verifier_model}",
  description="Verify: ${DESCRIPTION}"
)
```

> **ORCHESTRATOR RULE — CODEX RUNTIME**: After calling Agent() above, stop working on this task immediately. Do not read more files, edit code, or run tests related to this task while the subagent is active. Wait for the subagent to return its result. This prevents duplicate work, conflicting edits, and wasted context. Only resume when the subagent result is available.

Read verification status:
```bash
grep "^status:" "${QUICK_DIR}/${quick_id}-VERIFICATION.md" | cut -d: -f2 | tr -d ' '
```

Store as `$VERIFICATION_STATUS`.

| Status | Action |
|--------|--------|
| `passed` | Store `$VERIFICATION_STATUS = "Verified"`, continue to step 7 |
| `human_needed` | Display items needing manual check, store `$VERIFICATION_STATUS = "Needs Review"`, continue |
| `gaps_found` | Display gap summary, offer: 1) Re-run executor to fix gaps, 2) Accept as-is. Store `$VERIFICATION_STATUS = "Gaps"` |

---

**Step 7: Update STATE.md**

Update STATE.md with quick task completion record.

**7a. Check if "Quick Tasks Completed" section exists:**

Read STATE.md and check for `### Quick Tasks Completed` section.

**7b. If section doesn't exist, create it:**

Insert after `### Blockers/Concerns` section:

**If `$VALIDATE_MODE`:**
```markdown
### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
```

**If NOT `$VALIDATE_MODE`:**
```markdown
### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
```

**Note:** If the table already exists, match its existing column format. If adding `--validate` (or `--full`) to a project that already has quick tasks without a Status column, add the Status column to the header and separator rows, and leave Status empty for the new row's predecessors.

**7c. Append new row to table:**

Use `date` from init:

**If `$VALIDATE_MODE` (or table has Status column):**
```markdown
| ${quick_id} | ${DESCRIPTION} | ${date} | ${commit_hash} | ${VERIFICATION_STATUS} | [${quick_id}-${slug}](./quick/${quick_id}-${slug}/) |
```

**If NOT `$VALIDATE_MODE` (and table has no Status column):**
```markdown
| ${quick_id} | ${DESCRIPTION} | ${date} | ${commit_hash} | [${quick_id}-${slug}](./quick/${quick_id}-${slug}/) |
```

**7d. Update "Last activity" line:**

Use `date` from init:
```
Last activity: ${date} - Completed quick task ${quick_id}: ${DESCRIPTION}
```

Use Edit tool to make these changes atomically

---

**Step 8: Final commit and completion**

Stage and commit quick task artifacts. This step MUST always run — even if the executor already committed some files (e.g. when running without worktree isolation). The `gsd-tools.cjs query commit` command (or legacy `gsd-tools.cjs` commit) handles already-committed files gracefully.

Build file list:
- `${QUICK_DIR}/${quick_id}-PLAN.md`
- `${QUICK_DIR}/${quick_id}-SUMMARY.md`
- `.planning/STATE.md`
- If `$DISCUSS_MODE` and context file exists: `${QUICK_DIR}/${quick_id}-CONTEXT.md`
- If `$RESEARCH_MODE` and research file exists: `${QUICK_DIR}/${quick_id}-RESEARCH.md`
- If `$VALIDATE_MODE` and verification file exists: `${QUICK_DIR}/${quick_id}-VERIFICATION.md`
- If `${QUICK_DIR}/${quick_id}-deferred-items.md` exists: `${QUICK_DIR}/${quick_id}-deferred-items.md`

```bash
# gsd_run query commit captures WC state for the supplied --files internally
# (the handler runs `vcs.commit({files})`, staging `-A -- <files>` before the
# commit on git; direct WC record on jj). No pre-staging step is needed.
# Filter .planning/ files from the file list if commit_docs is disabled (#1783).
COMMIT_DOCS=$(gsd_run query config-get commit_docs 2>/dev/null || echo "true")
if [ "$COMMIT_DOCS" = "false" ]; then
  file_list_filtered=$(echo "${file_list}" | tr ' ' '\n' | grep -v '^\.planning/' | tr '\n' ' ')
  gsd_run query commit "docs(quick-${quick_id}): ${DESCRIPTION}" --files ${file_list_filtered}
else
  gsd_run query commit "docs(quick-${quick_id}): ${DESCRIPTION}" --files ${file_list}
fi
```

Get final commit hash:
```bash
commit_hash=$(gsd_run query head-ref --cwd . --pick head | cut -c1-7)
```

Display completion output:

**If `$VALIDATE_MODE`:**
```
---

GSD > QUICK TASK COMPLETE (VALIDATED)

Quick Task ${quick_id}: ${DESCRIPTION}

${RESEARCH_MODE ? 'Research: ' + QUICK_DIR + '/' + quick_id + '-RESEARCH.md' : ''}
Summary: ${QUICK_DIR}/${quick_id}-SUMMARY.md
Verification: ${QUICK_DIR}/${quick_id}-VERIFICATION.md (${VERIFICATION_STATUS})
Commit: ${commit_hash}

---

Ready for next task: /gsd:quick ${GSD_WS}
```

**If NOT `$VALIDATE_MODE`:**
```
---

GSD > QUICK TASK COMPLETE

Quick Task ${quick_id}: ${DESCRIPTION}

${RESEARCH_MODE ? 'Research: ' + QUICK_DIR + '/' + quick_id + '-RESEARCH.md' : ''}
Summary: ${QUICK_DIR}/${quick_id}-SUMMARY.md
Commit: ${commit_hash}

---

Ready for next task: /gsd:quick ${GSD_WS}
```

</process>

<success_criteria>
- [ ] ROADMAP.md validation passes
- [ ] User provides task description
- [ ] `--full`, `--validate`, `--discuss`, and `--research` flags parsed from arguments when present
- [ ] `--full` sets all booleans (`$FULL_MODE`, `$DISCUSS_MODE`, `$RESEARCH_MODE`, `$VALIDATE_MODE`)
- [ ] Slug generated (lowercase, hyphens, max 40 chars)
- [ ] Quick ID generated (YYMMDD-xxx format, 2s Base36 precision)
- [ ] Directory created at `.planning/quick/YYMMDD-xxx-slug/`
- [ ] (--discuss) Gray areas identified and presented, decisions captured in `${quick_id}-CONTEXT.md`
- [ ] (--research) Research agent spawned, `${quick_id}-RESEARCH.md` created
- [ ] `${quick_id}-PLAN.md` created by planner (honors CONTEXT.md decisions when --discuss, uses RESEARCH.md findings when --research)
- [ ] (--validate) Plan checker validates plan, revision loop capped at 2
- [ ] `${quick_id}-SUMMARY.md` created by executor
- [ ] (--validate) `${quick_id}-VERIFICATION.md` created by verifier
- [ ] STATE.md updated with quick task row (Status column when --validate)
- [ ] Artifacts committed
</success_criteria>
