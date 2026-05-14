---
phase: 05-command-translations-brownfield-validation-ci-hardening
plan: 07
subsystem: workflow-jq-paths + path-traversal-guard
tags: [gap-closure, CR-01, CR-06, jq-envelope, security-fix]
dependency_graph:
  requires:
    - 05-06 (SDK envelope contract pinned by integration test; CR-02/03/04 + WR-03 closed at SDK layer)
  provides:
    - workflow-correctness:flat-envelope (24 jq sites read real data)
    - security:path-containment-boundary (sibling-dir escape rejected)
  affects:
    - get-shit-done/workflows/undo.md
    - get-shit-done/workflows/complete-milestone.md
    - get-shit-done/workflows/code-review.md
    - agents/gsd-executor.md
    - agents/gsd-code-fixer.md
tech_stack:
  added: []
  patterns:
    - "Flat SDK envelope contract: `gsd-sdk query <verb>` emits `{ok, X, ...}` not `{data: {ok, X, ...}}` per query-dispatch.ts:239 (pinned by Plan 05-06 Task 3 integration test)"
    - "Path-containment boundary form: `[[ \"$P\" != \"$ROOT\" && \"$P\" != \"$ROOT/\"* ]]` (matches gsd-executor.md:451 reference; rejects sibling-dir escape)"
    - "Hard-reject on realpath failure (no silent fallback to unresolved input)"
key_files:
  created: []
  modified:
    - get-shit-done/workflows/undo.md
    - get-shit-done/workflows/complete-milestone.md
    - get-shit-done/workflows/code-review.md
    - agents/gsd-executor.md
    - agents/gsd-code-fixer.md
decisions:
  - "plan-phase.md:1448-1449 `.data.passed` / `.data.message` left untouched — those query a different handler (auto-mode gate, nested-`.data` envelope shape), out of scope for CR-01"
  - "IN-06 (shell-escaping fragility in code-review.md jq filter) explicitly deferred per plan action note — not blocking runtime; future cleanup surface"
metrics:
  duration: ~12m
  completed: 2026-05-13
requirements:
  - CMD-04
  - CMD-06
  - CMD-08
  - CMD-09
  - CMD-11
  - PROMPT-01
  - PROMPT-02
---

# Phase 5 Plan 07: Workflow jq-path Sweep + Path-Traversal Boundary Fix Summary

One-liner: Surgical 24-site `.data.X` → `.X` rewrite across 5 files (CR-01) + boundary-form path-traversal fix at code-review.md (CR-06), restoring runtime correctness of every `gsd-sdk query | jq` consumer the Plan 05-03 rewrite landed.

## What Was Done

Two atomic commits land all gap closure work:

| Task | Commit | What | Sites |
|------|--------|------|-------|
| 1 | `yumzpzlnmlynzokkkptnnmkouvwnytlu` | Drop `.data.` prefix from 24 jq paths across 5 workflow/agent files | 24 |
| 2 | `zrxtolonqxsyntmwymlrzpmuntrnyxnq` | Boundary-form path-traversal guard + hard-reject on realpath failure in code-review.md | 1 |

### Task 1 — CR-01 jq path sweep (24 sites)

The SDK CLI envelope is FLAT — `query-dispatch.ts:239` unwraps `result.data` before serialization, so the top-level JSON keys are the handler's `data:` fields directly (`{ok, head}` for head-ref, not `{data: {ok, head}}`). Plan 05-03 prefixed all jq paths with `.data.`, which returns `null` at runtime — silently degrading phase-branch detection, TASK_COMMIT capture, untracked-file probing, log-based phase-commit discovery, current-branch resolution, and milestone-close staging strip.

Per-file site count rewritten (totals to 24 — matches REVIEW.md CR-01 exactly):

| File | Sites | Verbs touched |
|------|-------|---------------|
| `get-shit-done/workflows/undo.md` | 4 | `log` (3), `status` (1) |
| `get-shit-done/workflows/complete-milestone.md` | 8 | `log` (3), `diff` (1), `branch-list` (2), `current-branch` (2) |
| `get-shit-done/workflows/code-review.md` | 3 | `log` (2), `diff` (1) |
| `agents/gsd-executor.md` | 7 | `log` (2), `status` (3), `head-ref` (1), `diff` (1) |
| `agents/gsd-code-fixer.md` | 2 | `current-branch` (1), `head-ref` (1) |
| **Total** | **24** | |

Rewrite patterns applied:

- `.data.entries[...]` → `.entries[...]` (log + status verbs)
- `.data.nameStatus[...]` → `.nameStatus[...]` (diff --name-status)
- `.data.nameOnly[...]` → `.nameOnly[...]` (diff --name-only)
- `.data.head // empty` → `.head // empty` (head-ref)
- `.data.raw // .data.stdout // ""` → `.raw // ""` (status; `.stdout` fallback was always dead — status envelope has no `stdout` field)
- `.data.bookmarks[0] // .data.current // empty` → `.bookmarks[0] // .current // empty` (current-branch)
- `.data.bookmarks[]?.name // empty, .data.branches[]? // empty` → `.bookmarks[]?.name // empty, .branches[]? // empty` (branch-list)

### Task 2 — CR-06 path-traversal boundary fix

`get-shit-done/workflows/code-review.md:134-141` used a glob-prefix guard:

```bash
if [[ "$ABS_PATH" != "$REPO_ROOT"* ]]; then
```

This admitted sibling-directory escape — `/repobad/foo` passes the prefix match when `REPO_ROOT=/repo`. Replaced with the boundary form already proven in `agents/gsd-executor.md:451`:

```bash
if [[ "$ABS_PATH" != "$REPO_ROOT" && "$ABS_PATH" != "$REPO_ROOT/"* ]]; then
```

Containment sanity (verified empirically):

| `ABS_PATH` | `REPO_ROOT` | Decision | Status |
|-----------|-------------|----------|--------|
| `/repobad/foo` | `/repo` | REJECTED | Correct (was admitted by old form) |
| `/repo/sub/file` | `/repo` | ADMITTED | Correct |
| `/repo` | `/repo` | ADMITTED | Correct (repo root itself) |

Also strengthened: `realpath -m` failure is now a HARD reject instead of a silent fallback to the unresolved input string (the old `|| echo "${file_path}"` form could bypass the containment check on systems without coreutils).

## Spot-Check Verification

After `cd sdk && pnpm build`, all four envelope spot-checks return non-null output (was returning empty/null before this plan):

```
gsd-sdk query head-ref --cwd . | jq -r '.head' | cut -c1-7
  → 3c5ff23 (7-char hex; was empty)

gsd-sdk query log --max-count 3 --cwd . | jq -r '.entries[] | (.hash[0:7] + " " + .subject)'
  → 3 lines of "hash subject" (was empty)

gsd-sdk query current-branch --cwd . | jq -r '.bookmarks[0] // .current // empty'
  → worktree-agent-a11559d195855d810 (was empty)

gsd-sdk query status --porcelain --cwd . | jq -r '.raw // ""'
  → porcelain output rows (was empty)
```

## Acceptance Gates (Final)

| Gate | Target | Actual | Pass |
|------|--------|--------|------|
| `.data.` count in `undo.md` | 0 | 0 | ✓ |
| `.data.` count in `complete-milestone.md` | 0 | 0 | ✓ |
| `.data.` count in `code-review.md` | 0 | 0 | ✓ |
| `.data.` count in `gsd-executor.md` | 0 | 0 | ✓ |
| `.data.` count in `gsd-code-fixer.md` | 0 | 0 | ✓ |
| `destructive on jj` prose preserved in `undo.md` | ≥1 | 2 | ✓ |
| `git clean`/`git push --force` prohibition in `gsd-executor.md` | ≥5 | 5 | ✓ |
| New backend conditionals (`if vcs.adapter == 'jj'` / `backend ==`) introduced | 0 | 0 | ✓ |
| CR-06 new boundary form `[[ "$ABS_PATH" != "$REPO_ROOT" && "$ABS_PATH" != "$REPO_ROOT/"* ]]` in `code-review.md` | ≥1 | 1 | ✓ |
| CR-06 old bare glob form `[[ "$ABS_PATH" != "$REPO_ROOT"* ]]` | 0 | 0 | ✓ |
| CR-06 `realpath failed` hard-reject branch | ≥1 | 1 | ✓ |
| CR-06 traceability comment (`CR-06` / `Plan 05-07`) | ≥1 | 1 | ✓ |

## Scoped-Out Sites (Intentionally Not Touched)

| Site | Why |
|------|-----|
| `get-shit-done/workflows/plan-phase.md:1448-1449` (`.data.passed` / `.data.message`) | Out of scope per plan + checker advisory — those query the auto-mode gate handler, which DOES emit a nested-`.data` envelope (different handler shape from the 5 in-scope files). Leaving unchanged is the safe default. |
| IN-06 shell-escaping fragility in `code-review.md` jq filter lines 219, 340 | Explicitly deferred per plan action note. The `.data.` prefix was removed (CR-01 scope); the surrounding `"\\\(...\\\)"` shell-quoted regex remains as future cleanup — not blocking runtime correctness. |
| `gsd-executor.md` lines 543, 552, 564 prohibition prose (`git clean`, `git push --force`) | Plan explicitly preserves this prose; grep gate verifies `≥5` `git clean|git push --force` mentions remain. |
| `undo.md` line 222 destructive-on-jj prose + JJOP-01 v2 reference | Pitfall 6 preservation; grep gate verifies `destructive on jj` and `jj op log/restore` remain. |

## Deviations from Plan

None — plan executed exactly as written. The plan's line-number map (e.g., gsd-executor.md "467-469"/"692-694" for the prohibition prose) was advisory; the actual prose lives at lines 543, 552, 564 in the post-Plan-05-06 file. The grep-based preservation gate (`grep -cE "git clean|git push --force" returns ≥5`) is what the plan actually enforces, and it passed (count=5).

## Threat-Model Disposition

| Threat ID | Disposition | Verified |
|-----------|-------------|----------|
| T-05-07-01 (Tampering — path containment) | mitigate | Boundary form lands; sibling-dir escape rejected in scratch-shell sanity check |
| T-05-07-02 (Info Disclosure — `--files=/etc/passwd` style) | mitigate | Strict `/`-boundary check rejects paths outside REPO_ROOT |
| T-05-07-03 (Tampering — jq path rewrites) | accept | jq operates on parsed JSON; no shell-exec vector even on hostile envelope |
| T-05-07-SC (Tampering — package installs) | accept | Zero new dependencies; pure markdown edits |

## Self-Check: PASSED

Verified post-write:

- `[ -f .planning/phases/05-command-translations-brownfield-validation-ci-hardening/05-07-SUMMARY.md ]` → FOUND
- `git log --oneline | grep "a2806707"` → FOUND: `fix(05-07): drop .data. prefix from 24 jq paths across 5 workflow/agent files (CR-01)`
- `git log --oneline | grep "4c24f4d5"` → FOUND: `fix(05-07): close CR-06 path-traversal boundary gap in code-review.md`
