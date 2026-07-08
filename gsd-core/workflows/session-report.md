<purpose>
Generate a post-session summary document capturing work performed, outcomes achieved, and estimated resource usage. Writes SESSION_REPORT.md to .planning/reports/ for human review and stakeholder sharing.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="gather_session_data">
Collect session data from available sources:

1. **STATE.md** — current phase, milestone, progress, blockers, decisions
2. **Git log** — commits made during this session (last 24h or since last report)
3. **Plan/Summary files** — plans executed, summaries written
4. **ROADMAP.md** — milestone context and phase goals

```bash
_GSD_SHIM_NAME="gsd-tools.cjs"; _GSD_RUNTIME_ROOT="${RUNTIME_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || jj workspace root 2>/dev/null || pwd)}"; GSD_TOOLS="${_GSD_RUNTIME_ROOT}/gsd-core/bin/${_GSD_SHIM_NAME}"; if [ -f "$GSD_TOOLS" ]; then gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${_GSD_RUNTIME_ROOT}/.claude/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${_GSD_RUNTIME_ROOT}/.claude/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${_GSD_RUNTIME_ROOT}/.codex/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${_GSD_RUNTIME_ROOT}/.codex/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif command -v gsd-tools >/dev/null 2>&1; then GSD_TOOLS="$(command -v gsd-tools)"; gsd_run() { "$GSD_TOOLS" "$@"; }; elif [ -f "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${HERMES_HOME:-$HOME/.hermes}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${HERMES_HOME:-$HOME/.hermes}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${CURSOR_CONFIG_DIR:-$HOME/.cursor}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${CURSOR_CONFIG_DIR:-$HOME/.cursor}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${CODEX_HOME:-$HOME/.codex}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${CODEX_HOME:-$HOME/.codex}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${GEMINI_CONFIG_DIR:-$HOME/.gemini}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${GEMINI_CONFIG_DIR:-$HOME/.gemini}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${COPILOT_CONFIG_DIR:-$HOME/.copilot}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${COPILOT_CONFIG_DIR:-$HOME/.copilot}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${WINDSURF_CONFIG_DIR:-$HOME/.codeium/windsurf}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${WINDSURF_CONFIG_DIR:-$HOME/.codeium/windsurf}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${AUGMENT_CONFIG_DIR:-$HOME/.augment}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${AUGMENT_CONFIG_DIR:-$HOME/.augment}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${TRAE_CONFIG_DIR:-$HOME/.trae}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${TRAE_CONFIG_DIR:-$HOME/.trae}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${QWEN_CONFIG_DIR:-$HOME/.qwen}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${QWEN_CONFIG_DIR:-$HOME/.qwen}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${CODEBUDDY_CONFIG_DIR:-$HOME/.codebuddy}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${CODEBUDDY_CONFIG_DIR:-$HOME/.codebuddy}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${CLINE_CONFIG_DIR:-$HOME/.cline}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${CLINE_CONFIG_DIR:-$HOME/.cline}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${GROK_AGENTS_HOME:-$HOME/.agents}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${GROK_AGENTS_HOME:-$HOME/.agents}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${ANTIGRAVITY_CONFIG_DIR:-$HOME/.gemini/antigravity}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${ANTIGRAVITY_CONFIG_DIR:-$HOME/.gemini/antigravity}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${OPENCODE_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/opencode}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${OPENCODE_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/opencode}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${KILO_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/kilo}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${KILO_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/kilo}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; else echo "ERROR: gsd-tools.cjs not found at $GSD_TOOLS and gsd-tools is not on PATH. Run: npx -y @opengsd/gsd-core@latest --claude --local" >&2; exit 1; fi; if [ -n "${CLAUDE_ENV_FILE:-}" ] && [ -n "${GSD_TOOLS:-}" ]; then printf "export PATH='%s':\"\$PATH\"\n" "${GSD_TOOLS%/*}" >> "$CLAUDE_ENV_FILE" 2>/dev/null || true; fi
# Get recent commits (last 24 hours) — adapter-routed (VCS-audit 2026-07-08;
# works on git and jj). jq filters entries by ISO date against a portable
# epoch cutoff (no GNU-only date flags).
_SR_CUTOFF=$(( $(date +%s) - 86400 ))
gsd_run query log --max-count 100 2>/dev/null \
  | jq -r --argjson cutoff "$_SR_CUTOFF" \
      '[.entries[] | select((.date | sub("\\.[0-9]+";"") | fromdateiso8601? // 0) >= $cutoff)] | if length == 0 then "No recent commits" else .[] | "\(.id) \(.subject)" end' \
  || echo "No recent commits"

# Count files changed across the recent window
gsd_run query diff --name-only --range "HEAD~10..HEAD" 2>/dev/null \
  | jq -r '(.nameOnly // []) | length | tostring + " files changed"' \
  || echo "No diff available"
```

Read `.planning/STATE.md` to get:
- Current milestone and phase
- Progress percentage
- Active blockers
- Recent decisions

Read `.planning/ROADMAP.md` to get milestone name and goals.

Check for existing reports:
```bash
ls -la .planning/reports/SESSION_REPORT*.md 2>/dev/null || echo "No previous reports"
```
</step>

<step name="estimate_usage">
Estimate token usage from observable signals:

- Count of tool calls is not directly available, so estimate from git activity and file operations
- Note: This is an **estimate** — exact token counts require API-level instrumentation not available to hooks

Estimation heuristics:
- Each commit ≈ 1 plan cycle (research + plan + execute + verify)
- Each plan file ≈ 2,000-5,000 tokens of agent context
- Each summary file ≈ 1,000-2,000 tokens generated
- Subagent spawns multiply by ~1.5x per agent type used
</step>

<step name="generate_report">
Create the report directory and file:

```bash
mkdir -p .planning/reports
```

Write `.planning/reports/SESSION_REPORT.md` (or `.planning/reports/YYYYMMDD-session-report.md` if previous reports exist):

```markdown
# GSD Session Report

**Generated:** [timestamp]
**Project:** [from PROJECT.md title or directory name]
**Milestone:** [N] — [milestone name from ROADMAP.md]

---

## Session Summary

**Duration:** [estimated from first to last commit timestamp, or "Single session"]
**Phase Progress:** [from STATE.md]
**Plans Executed:** [count of summaries written this session]
**Commits Made:** [count from git log]

## Work Performed

### Phases Touched
[List phases worked on with brief description of what was done]

### Key Outcomes
[Bullet list of concrete deliverables: files created, features implemented, bugs fixed]

### Decisions Made
[From STATE.md decisions table, if any were added this session]

## Files Changed

[Summary of files modified, created, deleted — from git diff stat]

## Blockers & Open Items

[Active blockers from STATE.md]
[Any TODO items created during session]

## Estimated Resource Usage

| Metric | Estimate |
|--------|----------|
| Commits | [N] |
| Files changed | [N] |
| Plans executed | [N] |
| Subagents spawned | [estimated] |

> **Note:** Token and cost estimates require API-level instrumentation.
> These metrics reflect observable session activity only.

---

*Generated by `/gsd-session-report`*
```
</step>

<step name="display_result">
Show the user:

```
## Session Report Generated

📄 `.planning/reports/[filename].md`

### Highlights
- **Commits:** [N]
- **Files changed:** [N]  
- **Phase progress:** [X]%
- **Plans executed:** [N]
```

If this is the first report, mention:
```
💡 Run `/gsd-session-report` at the end of each session to build a history of project activity.
```
</step>

</process>

<success_criteria>
- [ ] Session data gathered from STATE.md, git log, and plan files
- [ ] Report written to .planning/reports/
- [ ] Report includes work summary, outcomes, and file changes
- [ ] Filename includes date to prevent overwrites
- [ ] Result summary displayed to user
</success_criteria>
