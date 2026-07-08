<purpose>
Safe git revert workflow. Rolls back GSD phase or plan commits using the phase manifest with dependency checks and a confirmation gate. Uses git revert --no-commit (NEVER git reset) to preserve history.
</purpose>

<required_reading>
@~/.claude/gsd-core/references/ui-brand.md
@~/.claude/gsd-core/references/gate-prompts.md
</required_reading>

<process>

<step name="banner" priority="first">
Display the stage banner:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► UNDO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
</step>

<step name="parse_arguments">
Parse $ARGUMENTS for the undo mode:

- `--last N` → MODE=last, COUNT=N (integer, default 10 if N missing)
- `--phase NN` → MODE=phase, TARGET_PHASE=NN (two-digit phase number)
- `--plan NN-MM` → MODE=plan, TARGET_PLAN=NN-MM (phase-plan ID)

If no valid argument is provided, display usage and exit:

```
Usage: /gsd:undo --last N | --phase NN | --plan NN-MM

Modes:
  --last N      Show last N GSD commits for interactive selection
  --phase NN    Revert all commits for phase NN
  --plan NN-MM  Revert all commits for plan NN-MM

Examples:
  /gsd:undo --last 5
  /gsd:undo --phase 03
  /gsd:undo --plan 03-02
```
</step>

<step name="gather_commits">
Based on MODE, gather candidate commits.

**MODE=last:**

Run:
```bash
_GSD_SHIM_NAME="gsd-tools.cjs"; _GSD_RUNTIME_ROOT="${RUNTIME_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || jj workspace root 2>/dev/null || pwd)}"; GSD_TOOLS="${_GSD_RUNTIME_ROOT}/gsd-core/bin/${_GSD_SHIM_NAME}"; if [ -f "$GSD_TOOLS" ]; then gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${_GSD_RUNTIME_ROOT}/.claude/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${_GSD_RUNTIME_ROOT}/.claude/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${_GSD_RUNTIME_ROOT}/.codex/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${_GSD_RUNTIME_ROOT}/.codex/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif command -v gsd-tools >/dev/null 2>&1; then GSD_TOOLS="$(command -v gsd-tools)"; gsd_run() { "$GSD_TOOLS" "$@"; }; elif [ -f "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${HERMES_HOME:-$HOME/.hermes}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${HERMES_HOME:-$HOME/.hermes}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${CURSOR_CONFIG_DIR:-$HOME/.cursor}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${CURSOR_CONFIG_DIR:-$HOME/.cursor}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${CODEX_HOME:-$HOME/.codex}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${CODEX_HOME:-$HOME/.codex}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${GEMINI_CONFIG_DIR:-$HOME/.gemini}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${GEMINI_CONFIG_DIR:-$HOME/.gemini}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${COPILOT_CONFIG_DIR:-$HOME/.copilot}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${COPILOT_CONFIG_DIR:-$HOME/.copilot}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${WINDSURF_CONFIG_DIR:-$HOME/.codeium/windsurf}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${WINDSURF_CONFIG_DIR:-$HOME/.codeium/windsurf}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${AUGMENT_CONFIG_DIR:-$HOME/.augment}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${AUGMENT_CONFIG_DIR:-$HOME/.augment}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${TRAE_CONFIG_DIR:-$HOME/.trae}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${TRAE_CONFIG_DIR:-$HOME/.trae}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${QWEN_CONFIG_DIR:-$HOME/.qwen}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${QWEN_CONFIG_DIR:-$HOME/.qwen}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${CODEBUDDY_CONFIG_DIR:-$HOME/.codebuddy}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${CODEBUDDY_CONFIG_DIR:-$HOME/.codebuddy}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${CLINE_CONFIG_DIR:-$HOME/.cline}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${CLINE_CONFIG_DIR:-$HOME/.cline}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${GROK_AGENTS_HOME:-$HOME/.agents}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${GROK_AGENTS_HOME:-$HOME/.agents}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${ANTIGRAVITY_CONFIG_DIR:-$HOME/.gemini/antigravity}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${ANTIGRAVITY_CONFIG_DIR:-$HOME/.gemini/antigravity}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${OPENCODE_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/opencode}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${OPENCODE_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/opencode}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; elif [ -f "${KILO_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/kilo}/gsd-core/bin/${_GSD_SHIM_NAME}" ]; then GSD_TOOLS="${KILO_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/kilo}/gsd-core/bin/${_GSD_SHIM_NAME}"; gsd_run() { node "$GSD_TOOLS" "$@"; }; else echo "ERROR: gsd-tools.cjs not found at $GSD_TOOLS and gsd-tools is not on PATH. Run: npx -y @opengsd/gsd-core@latest --claude --local" >&2; exit 1; fi; if [ -n "${CLAUDE_ENV_FILE:-}" ] && [ -n "${GSD_TOOLS:-}" ]; then printf "export PATH='%s':\"\$PATH\"\n" "${GSD_TOOLS%/*}" >> "$CLAUDE_ENV_FILE" 2>/dev/null || true; fi
gsd_run query log --max-count "${COUNT}" \
  | jq -r '.entries[] | (.id[0:7] + " " + .subject)'
```

The verb's LogOpts shape (Phase 2 CR-02) does not yet expose `--no-merges` / `--grep` — those flags are parsed-but-unused. Reconstruct the "oneline" form client-side from `.id[0:7] + " " + .subject` (LogEntry.id is the unified revision id — hex on git, [k-z] change-id on jj) and filter for GSD conventional commits matching `type(scope): message` pattern (e.g., `feat(04-01):`, `docs(03):`, `fix(02-03):`) on the subject string.

TODO(05-05 sweep): when log gains a `--no-merges` flag pass-through, drop the merge-subject hand-filter.

Display a numbered list of matching commits:
```
Recent GSD commits:
  1. abc1234 feat(04-01): implement auth endpoint
  2. def5678 docs(03-02): complete plan summary
  3. ghi9012 fix(02-03): correct validation logic
```


**Text mode (`workflow.text_mode: true` in config or `--text` flag):** Set `TEXT_MODE=true` if `--text` is present in `$ARGUMENTS` OR `text_mode` from init JSON is `true`. When TEXT_MODE is active, replace every `AskUserQuestion` call with a plain-text numbered list and ask the user to type their choice number. This is required for non-Claude runtimes (OpenAI Codex, Gemini CLI, etc.) where `AskUserQuestion` is not available.
Use AskUserQuestion to ask:
- question: "Which commits to revert? Enter numbers (e.g., 1,3) or 'all'"
- header: "Select"

Parse the user's selection into COMMITS list.

---

**MODE=phase:**

Read `.planning/.phase-manifest.json` if it exists.

If the file exists and `manifest.phases?.[TARGET_PHASE]?.commits` is a non-empty array:
  - Use `manifest.phases[TARGET_PHASE].commits` entries as COMMITS (each entry is a commit hash)

If the file does not exist, or `manifest.phases?.[TARGET_PHASE]` is missing:
  - Display: "Manifest has no entry for phase ${TARGET_PHASE} (or file missing), falling back to log search via the query verb"
  - Fallback: query the log via the verb and filter client-side by subject (the LogOpts shape does not yet expose `--grep` / `--no-merges`):
    ```bash
    gsd_run query log --all --max-count 200 \
      | jq -r '.entries[] | (.id[0:7] + " " + .subject)' \
      | grep -E "\(0*${TARGET_PHASE}(-[0-9]+)?\):" \
      | head -50
    ```
  - Use matching commits as COMMITS

---

**MODE=plan:**

Run:
```bash
gsd_run query log --all --max-count 200 \
  | jq -r '.entries[] | (.id[0:7] + " " + .subject)' \
  | grep -E "\(${TARGET_PLAN}\)" \
  | head -50
```

Use matching commits as COMMITS.

---

**Empty check:**

If COMMITS is empty after gathering:
```
No commits found for ${MODE} ${TARGET}. Nothing to revert.
```
Exit cleanly.
</step>

<step name="dependency_check">
**Applies when MODE=phase or MODE=plan.**

Skip this step entirely for MODE=last.

---

**MODE=phase:**

Read `.planning/ROADMAP.md` inline.

Search for phases that list a dependency on the target phase. Look for patterns like:
- "Depends on: Phase ${TARGET_PHASE}"
- "Depends on: ${TARGET_PHASE}"
- "depends_on: [${TARGET_PHASE}]"

For each dependent phase N found:
1. Check if `.planning/phases/${N}-*/` directory exists
2. If directory exists, check for any PLAN.md or SUMMARY.md files inside it

If any downstream phase has started work, collect warnings:
```
⚠  Downstream dependency detected:
   Phase ${N} depends on Phase ${TARGET_PHASE} and has started work.
```

---

**MODE=plan:**

Extract the phase number from TARGET_PLAN (the NN part of NN-MM). Extract the plan number (the MM part).

Look for later plans in the same phase directory (`.planning/phases/${NN}-*/`). For each later plan (plans with number > MM):
1. Read the later plan's PLAN.md
2. Check if its `<files>` sections or `consumes` fields reference outputs from the target plan

If any later plan references the target plan's outputs, collect warnings:
```
⚠  Intra-phase dependency detected:
   Plan ${LATER_PLAN} in phase ${NN} references outputs from plan ${TARGET_PLAN}.
```

---

If any warnings exist (from either mode):
- Display all warnings
- Use AskUserQuestion with approve-revise-abort pattern:
  - question: "Downstream work depends on the target being reverted. Proceed anyway?"
  - header: "Confirm"
  - options: Proceed | Abort

If user selects "Abort": exit with "Revert cancelled. No changes made."
</step>

<step name="confirm_revert">
Display the confirmation gate using approve-revise-abort pattern from gate-prompts.md.

Show:
```
The following commits will be reverted (in reverse chronological order):

  {hash} — {message}
  {hash} — {message}
  ...

Total: {N} commit(s) to revert
```

Use AskUserQuestion:
- question: "Proceed with revert?"
- header: "Approve?"
- options: Approve | Abort

If "Abort": display "Revert cancelled. No changes made." and exit.
If "Approve": ask for a reason:

```
AskUserQuestion(
  header: "Reason",
  question: "Brief reason for the revert (used in commit message):",
  options: []
)
```

Store the response as REVERT_REASON. Continue to execute_revert.
</step>

<step name="execute_revert">
**HARD CONSTRAINT: Use `gsd_run query revert --no-commit <rev>` to undo, NEVER `gsd_run query reset --mode hard` (except for conflict cleanup as documented below).**

**Dirty-tree guard (run first, before any revert):**

Run `gsd_run query status --porcelain | jq -re 'if .ok == true and ((.entries // null) | type == "array") then ([.entries[] | (.path // error("entry missing path"))] | join("\n")) else error("status envelope not ok or entries missing") end'`. If the command FAILS (non-zero exit), abort — the probe is broken; never assume the tree is clean. If the output is non-empty, display the dirty files and abort:
```
Working tree has uncommitted changes. Commit or stash them before running /gsd:undo.
```
Exit immediately — do not proceed to any revert operations. This guard must never key on `.raw`: on the jj backend `.raw` is human-readable `jj st` text that is non-empty even on a clean tree.

---

> **Backend semantic shift (CMD-06 / 05-RESEARCH Pitfall 6).** On the **git** backend, undo creates inverse-content commits and preserves history: a reverted commit stays in the log, and a follow-up `revert` of the revert restores the original content. On the **jj** backend, undo is **destructive on jj**: `gsd_run query revert <rev>` dispatches to `jj abandon <change_id>`, which removes the change from the visible history, and the operation log (`jj op log` / `jj op restore`) is the recovery path. This is jj's idiomatic model. If you need git-style preservation on jj, defer to `jj op restore` after the abandon, or use `jj duplicate <change_id> --destination <safe>` to copy the content to a bookmark before abandoning. The destructive jj model is intentional for v1; an inverse-content primitive on jj is deferred to JJOP-01 v2. `--no-commit` is meaningful only on the git backend (it stages the inverse diff without committing); on jj it is parsed-but-ignored because `jj abandon` is one-shot history rewrite.

---

Sort COMMITS in reverse chronological order (newest first). If commits came from the log query (already newest-first), they are already in correct order.

For each commit hash in COMMITS:
```bash
REVERT_RESULT=$(gsd_run query revert --no-commit "${HASH}")
```

Capture the backend from the first revert envelope (used by the finalize step below):
```bash
BACKEND=$(echo "$REVERT_RESULT" | jq -r '.backend')
```

Check each envelope's `.ok` field — `ok: false` means the revert failed; follow the failure handling below.

If any revert fails (merge conflict on git, or `jj abandon` error):
1. Display the error message
2. Run cleanup — handle both first-call and mid-sequence cases:
   ```bash
   # Git backend: --abort the in-progress revert sequence (works if this is the first failed revert).
   # On jj backend, abandon is one-shot — there's no "abort" mid-sequence state to clean up;
   # the verb reports the abandon error and the op-log retains the pre-abandon state for recovery.
   gsd_run query revert --abort 2>/dev/null
   # If prior --no-commit reverts already staged cleanly before this failure (git backend),
   # the abort may be a no-op. Clean up staged and working tree changes:
   gsd_run query reset --ref HEAD --mode mixed 2>/dev/null   # TODO(05-05 sweep): jj has no `reset --mixed` analog; on jj backend this falls through to a clear error from the verb.
   gsd_run query restore . 2>/dev/null
   ```
3. Display:
   ```
   ╔══════════════════════════════════════════════════════════════╗
   ║  ERROR                                                       ║
   ╚══════════════════════════════════════════════════════════════╝

   Revert failed on commit ${HASH}.
   Likely cause: merge conflict with subsequent changes (git backend) or abandon error (jj backend).

   **To fix:**
     - git backend: Resolve the conflict manually or revert commits individually. All pending reverts have been aborted — working tree is clean.
     - jj backend: Inspect `jj op log`; recover the pre-abandon state via `jj op restore <op>` if needed (destructive abandon semantics — Pitfall 6).
   ```
4. Exit with error.

After all reverts have completed successfully, finalize per backend (19-review CR-03 — the finalize MUST be scope-complete and MUST be verified via the envelope, never assumed).

**jj backend (`BACKEND` = `jj`):** skip the finalize commit entirely. `jj abandon` is self-contained — each revert already rewrote history, and there is no staged state left to commit. Resolve the summary hash directly:
```bash
REVERT_HASH=$(gsd_run query head-ref | jq -r '.head')
```

**git backend (`BACKEND` = `git`):** the staged inverse diff must be committed verbatim. Do NOT call `gsd_run query commit` bare — its default scope is `.planning/` (the staged code revert would be dropped or unstaged by the WC-state-capture path). Instead collect the staged paths and commit them with `--respect-staged`:

```bash
STAGED_FILES=$(gsd_run query diff --cached --name-only | jq -r '.nameOnly[]')
```

Build the message per mode:
- MODE=phase: `revert(${TARGET_PHASE}): undo phase ${TARGET_PHASE} — ${REVERT_REASON}`
- MODE=plan: `revert(${TARGET_PLAN}): undo plan ${TARGET_PLAN} — ${REVERT_REASON}`
- MODE=last: `revert: undo ${N} selected commits — ${REVERT_REASON}`

```bash
# shellcheck disable=SC2086 — STAGED_FILES is intentionally word-split into one arg per path
COMMIT_RESULT=$(gsd_run query commit "${MESSAGE}" --respect-staged --files ${STAGED_FILES})
```

**Verify the envelope** — do not proceed to the summary banner on faith:
```bash
echo "$COMMIT_RESULT" | jq -e '.committed == true' >/dev/null
```

If `.committed` is not `true`, display the envelope's `reason` and abort with an error instead of printing "UNDO COMPLETE":
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

The reverts are staged but the finalize commit did NOT land (reason: ${REASON}).
  - reason 'skipped_commit_docs_false': commit_docs is disabled in .planning/config.json —
    commit the staged revert manually: gsd_run query commit "${MESSAGE}" --respect-staged --files <staged paths>
    after temporarily enabling commit_docs, or commit via your normal tooling.
  - reason 'nothing_staged': the reverts produced no staged changes — inspect
    gsd_run query status --porcelain before assuming the undo landed.
Working tree still holds the staged revert; nothing has been lost.
```

On success, set `REVERT_HASH` from the envelope's `.id` field.
</step>

<step name="summary">
Display the completion banner:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► UNDO COMPLETE ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Show summary:
```
  ✓ ${N} commit(s) reverted
  ✓ Single revert commit created: ${REVERT_HASH}
```

Show next steps:
```
───────────────────────────────────────────────────────────────

## ▶ Next Up — [${PROJECT_CODE}] ${PROJECT_TITLE}

**Review state** — verify project is in expected state after revert

/clear then:

/gsd:progress

───────────────────────────────────────────────────────────────

**Also available:**
- `/gsd:execute-phase ${PHASE}` — re-execute if needed
- `/gsd:undo --last 1` — undo the revert itself if something went wrong

───────────────────────────────────────────────────────────────
```
</step>

</process>

<success_criteria>
- [ ] Arguments parsed correctly for all three modes
- [ ] --phase mode reads .planning/.phase-manifest.json using manifest.phases[TARGET_PHASE].commits
- [ ] --phase mode falls back to `gsd_run query log --all` if manifest entry missing
- [ ] Dependency check warns when downstream phases have started (MODE=phase)
- [ ] Dependency check warns when later plans reference target plan outputs (MODE=plan)
- [ ] Dirty-tree guard aborts if working tree has uncommitted changes
- [ ] Confirmation gate shown before any revert execution
- [ ] Reverts use `gsd_run query revert --no-commit` in reverse chronological order (destructive on jj — Pitfall 6 prose documents `jj op restore` as recovery path)
- [ ] git backend: finalize commit is scope-complete (`--respect-staged --files <staged paths>`, never the bare `.planning/`-scoped default) and the envelope's `committed` field is checked before declaring success
- [ ] jj backend: finalize commit is skipped (`jj abandon` is self-contained); REVERT_HASH resolved via `query head-ref`
- [ ] Error handling cleans up both first-call and mid-sequence conflict cases (git backend); jj backend surfaces typed `jj abandon` error with op-log recovery hint
- [ ] `gsd_run query reset --mode hard` is NEVER used anywhere in this workflow
</success_criteria>
