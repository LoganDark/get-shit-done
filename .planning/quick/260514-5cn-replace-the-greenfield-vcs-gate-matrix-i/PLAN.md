---
slug: replace-the-greenfield-vcs-gate-matrix-i
created: 2026-05-14
description: Replace the buggy greenfield VCS gate matrix in new-project.md (lines 108-122) with a fully-specified 12-row detection×flag matrix. Fixes the `(any)`-collapse bug that ignores `--jj` when `.git/` is present, adds an explicit git-warning whenever the git backend is selected in this fork, and adds an explicit fork-message ABORT for the two ambiguous no-flag cases. Uses inline `command -v jj` for "jj binary present" detection rather than extending the SDK.
---

# Goal

Rewrite the greenfield VCS gate in `get-shit-done/workflows/new-project.md` so backend selection is deterministic and well-defined across every `(has_git, has_jj) × {none, --git, --jj}` combination. The current matrix collapses three rows into `(any)` wildcards and silently picks jj whenever `.jj/` exists, which means `--git` is honored but `--jj` cannot override a pre-existing `.git/` directory. The replacement matrix is exhaustive (12 rows), aborts on ambiguous cases instead of guessing, and surfaces a fork-specific git-warning whenever the user opts into the git backend (preserving the upstream behavior contract but signaling that complex git workflows may regress relative to upstream GSD).

# Files to modify

- `get-shit-done/workflows/new-project.md` — section **"Greenfield VCS gate"**, currently spanning lines **108-122**. The executor must rewrite this entire block, including:
  - The header line at 108 (preserve the `ROADMAP SC #1 / #7 — Phase 6 plan 06-03` anchor).
  - The argument-parsing prose at 110 (still parse `--jj`, `--jj=native`, `--jj=colocated`, `--git`).
  - The note about `init.new-project` exposing `has_jj` at 112 (still accurate; keep but extend to mention the inline `command -v jj` check).
  - The 5-row matrix at 114-120 (replaced by a 12-row matrix).
  - The closing paragraph at 122 (revise to reflect the new "no silent fallback, no `(any)` wildcard" contract).

No other files are touched.

# Tasks

## Task 1 — Add jj-binary detection prelude

In the workflow block at lines ~108-112, before the matrix, add a step that distinguishes "jj binary installed on system" from "`.jj/` directory present in project". Use an inline shell check rather than extending the SDK:

```bash
if command -v jj >/dev/null 2>&1; then JJ_BINARY=1; else JJ_BINARY=0; fi
```

Document that:
- `has_git` and `has_jj` come from `gsd-sdk query init.new-project` (filesystem presence of `.git/` and `.jj/`).
- `JJ_BINARY` comes from the inline `command -v jj` check (system PATH presence).
- The matrix branches on `has_git` and `has_jj`; the fork-message references `JJ_BINARY` to phrase the abort correctly ("you have jj installed" vs. "neither jj nor git detected on this system").

Rationale (record in PLAN comment but not in workflow prose): extending `sdk/src/query/init.ts` would force an SDK rebuild for a workflow-doc change, and the matrix decision itself does not branch on `JJ_BINARY` — only the abort message wording does. Inline check is correct scope.

**Acceptance:** Workflow file contains a `JJ_BINARY` shell snippet immediately before the matrix; surrounding prose explains the three signals (`has_git`, `has_jj`, `JJ_BINARY`) and where each comes from.

## Task 2 — Replace the matrix with the 12-row form

Replace the 5-row table at lines 114-120 with the full 12-row matrix below. Column order: `has_git`, `has_jj`, `flag`, `Action`. Rows MUST appear in the order shown (it groups by `(has_git, has_jj)` then by flag for readability):

| `has_git` | `has_jj` | flag | Action |
|---|---|---|---|
| true  | false | none  | **ABORT** with fork-message (see §Fork-message below). Do not auto-detect. |
| true  | false | --git | Proceed with git backend. Emit git-warning (see §Git-warning below). Do not touch `vcs.adapter` (Phase 3 D-17 sticky resolver default). |
| true  | false | --jj  | Run `jj git init --colocate`, set `vcs.adapter=jj` in `.planning/config.json`, proceed with jj backend. |
| false | true  | none  | Proceed with jj backend. Set `vcs.adapter=jj`. |
| false | true  | --git | Proceed with git backend. Emit git-warning. No `git init` (`.git/` absent but `.jj/` present — user is in a native-jj setup; selecting git here is unusual but explicitly user-chosen). |
| false | true  | --jj  | Proceed with jj backend. Set `vcs.adapter=jj`. |
| true  | true  | none  | Proceed with jj backend. Set `vcs.adapter=jj`. Both present — jj wins by default in this fork. |
| true  | true  | --git | Proceed with git backend. Emit git-warning. |
| true  | true  | --jj  | Proceed with jj backend. Set `vcs.adapter=jj`. |
| false | false | none  | **ABORT** with fork-message (adapted to "neither .git nor .jj detected" framing). Do not auto-init. |
| false | false | --git | Run `git init`, proceed with git backend. Emit git-warning. |
| false | false | --jj  | Run `jj git init --colocate` (or `--no-colocate` if `--jj=native`), set `vcs.adapter=jj`, proceed with jj backend. |

After the matrix, add two clearly-labeled callout subsections:

### §Fork-message (used for both ABORT cases)

> This fork of GSD exists for jj support. You have jj installed, but it was not detected in the project. If you want to initialize a GSD project with Git, then pass `--git`. Otherwise, run `jj git init` (or pass `--jj` to have GSD do it for you).

For the `(has_git=false, has_jj=false, flag=none)` case, adapt the opening sentence to:

> This fork of GSD exists for jj support. Neither `.git/` nor `.jj/` was detected in this directory. If you want to initialize a GSD project with Git, then pass `--git`. Otherwise, run `jj git init` (or pass `--jj` to have GSD do it for you).

(Light voice/format adjustments to fit the workflow are acceptable; the substantive content — fork rationale + two-flag escape hatch — must remain.)

### §Git-warning (emitted whenever proceeding with git backend)

> This fork of GSD exists for jj support. An effort was made to preserve existing git support as much as possible, but there may be new bugs that do not exist upstream. Complex workflows may exhibit unusual behavior.

Emit this warning to stderr (or the equivalent workflow-output channel) once, immediately before the backend-specific init step runs.

**Acceptance:** The matrix in the workflow has exactly 12 rows in the order listed; the two callout subsections (Fork-message, Git-warning) exist with the wording above; no `(any)` wildcards remain in the table.

## Task 3 — Rewrite the surrounding prose

Replace line 122 ("This replaces upstream's silent `git init` fallback…") with a paragraph that reflects the new contract:

- No `(any)` wildcards — every cell is explicit.
- Two abort paths (ambiguous-jj-installed, empty-dir-no-flag) instead of one.
- Git backend is always selectable via `--git` in this fork, but always warns.
- jj backend is the default whenever `.jj/` is present, regardless of `.git/` co-presence.
- Preserve the `ROADMAP SC #1 / #7` anchor — the new gate still satisfies "no silent `git init` fallback" and "invisible-default-free migration boundary".

Keep the section short (one paragraph). Do not duplicate the matrix in prose.

**Acceptance:** Closing paragraph mentions the 12-row exhaustiveness, the two abort paths, and the unchanged SC #1 / #7 anchor. It does NOT re-describe individual rows.

# Acceptance criteria

- [ ] `get-shit-done/workflows/new-project.md` lines 108-122 are fully replaced; no `(any)` wildcards remain in the gate.
- [ ] The replacement matrix has exactly 12 rows in the order specified above.
- [ ] Both `(true, false, none)` and `(false, false, none)` rows route to ABORT with the fork-message.
- [ ] `(true, false, --jj)` runs `jj git init --colocate` and sets `vcs.adapter=jj` — this is the bug-fix row (currently swallowed by `has_jj=false → (any) flag → use existing git`).
- [ ] `(true, true, --git)` and `(false, true, --git)` both honor `--git` and emit the git-warning — the matrix never silently overrides an explicit `--git` because `.jj/` exists.
- [ ] `(false, false, --jj)` honors the `--jj=native` modifier by running `jj git init --no-colocate` instead of `--colocate`.
- [ ] A `JJ_BINARY` shell prelude using `command -v jj >/dev/null 2>&1` is present before the matrix.
- [ ] The fork-message text is present in the workflow with the wording above (light adaptation allowed; the two-flag escape hatch and fork rationale must remain).
- [ ] The git-warning text is present with the wording above and is emitted exactly once per git-backend selection.
- [ ] No edits to `sdk/src/query/init.ts` (jj-binary detection stays inline in the workflow).
- [ ] No edits to `commands/gsd/new-project.md`.
- [ ] No edits to any test file unless a test fails after the workflow rewrite. If a test asserts on the old 5-row table contents, surface the failure rather than silently editing the test — the task description flags this as out-of-scope.
- [ ] The closing paragraph references the `ROADMAP SC #1 / #7 — Phase 6 plan 06-03` anchor and accurately describes the new contract.
