---
slug: replace-the-greenfield-vcs-gate-matrix-i
status: complete
completed: 2026-05-14
commit: d2007b893211
---

# Summary — Replace the greenfield VCS gate matrix

## What changed

Single-file rewrite of `get-shit-done/workflows/new-project.md` lines 108-122 (the **Greenfield VCS gate** block). The 5-row `(any)`-wildcard matrix was replaced by a fully-specified 12-row `(has_git, has_jj) × {none, --git, --jj}` matrix, with two new callout subsections (§Fork-message, §Git-warning) and an inline `JJ_BINARY` shell-prelude check.

### Bug fixed

The previous matrix collapsed three rows into `(any)` wildcards. Concretely, when `.git/` was already present in a directory but the user passed `--jj`, the `has_jj=false / has_git=true / (any) / (any)` row swallowed the flag and routed to git silently — the `--jj` override never took effect. The new matrix gives every `(detection, flag)` cell its own explicit action; `(has_git=true, has_jj=false, --jj)` now correctly runs `jj git init --colocate` and sets `vcs.adapter=jj`.

### Three additions

1. **`JJ_BINARY` shell prelude** (`command -v jj >/dev/null 2>&1`) inline in the workflow before the matrix. Lets the fork-message phrase the abort correctly ("you have jj installed" vs. "jj not installed") without extending the SDK.
2. **Two abort paths** with a fork-rationale message:
   - `(has_git=true, has_jj=false, none)` — `.git/` is present but `.jj/` is not, and no flag was passed. Aborts; invites the user to pass `--git` or `--jj`.
   - `(has_git=false, has_jj=false, none)` — empty directory, no flag. Aborts with the adapted "neither `.git/` nor `.jj/` detected" framing.
3. **Git-warning callout** emitted to stderr exactly once, immediately before any git-backend init step, signalling that this fork best-effort preserves git support but complex git workflows may regress relative to upstream GSD.

### Closing prose

The closing paragraph at the bottom of the gate now describes the new contract: 12-row exhaustiveness, no `(any)` wildcards, two abort paths, `--git` always selectable (always with the warning), `--jj` always selectable, jj default whenever `.jj/` is present. The ROADMAP SC #1 / #7 — Phase 6 plan 06-03 anchor is preserved (no silent `git init` fallback; migration boundary stays invisible-default-free).

## Files changed

- `get-shit-done/workflows/new-project.md` — rewrite of lines 108-122 (now lines 108-157 after expansion to 12 rows + callouts).

## Commit

- `d2007b893211` — `fix(workflows): new-project VCS gate — 12-row matrix + git-warning + jj-bug-fix`

## Deviations from PLAN.md

None substantive. Light prose adjustments within the bounds the plan explicitly allowed:

- Fork-message wording is verbatim from PLAN.md for both ABORT cases. Added one extra sentence guiding the `JJ_BINARY=0` adaptation (jj binary not on PATH) — explicitly inviting the install link as an alternative to passing `--git`. This stays inside the "fork rationale + two-flag escape hatch must remain" envelope.
- Git-warning wording is verbatim.
- The matrix column header was kept as `flag` (singular) per PLAN.md spec rather than splitting into `--jj` / `--git` columns.
- The closing paragraph compresses the four-bullet checklist from PLAN.md Task 3 into a single paragraph (as PLAN.md asked: "Keep the section short — one paragraph. Do not duplicate the matrix in prose").
- No tests were touched (no test surface asserts on the old 5-row table contents — the workflow file is prose).

## Tests / lint

No tests run (prose-only workflow edit). No tests or lint failures triggered by this change in the changed file's neighborhood.
