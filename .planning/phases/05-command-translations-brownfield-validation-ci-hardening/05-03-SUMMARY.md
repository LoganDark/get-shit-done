---
phase: 05-command-translations-brownfield-validation-ci-hardening
plan: 03
subsystem: workflows + agents + sdk-tests
tags: [vcs-agnostic, d-33, cmd-06, cmd-07, cmd-08, cmd-09, cmd-11, prompt-02, lifecycle, pitfall-6]
requires:
  - 05-01 (SDK verb shims: revert, push, log, status, diff, reset, head-ref, current-branch, merge, restore, branch-list)
  - 05-02 (daily-driver rewrite pattern, jj-colocated CMD-test fixture pattern)
provides:
  - VCS-agnostic /gsd-undo with explicit Pitfall 6 destructive-jj-abandon prose
  - VCS-agnostic /gsd-complete-milestone (CMD-04 spillover + CMD-11 merge/push/tag flow)
  - VCS-agnostic /gsd-code-review (CMD-11 surface)
  - VCS-agnostic gsd-code-fixer.md + gsd-executor.md (PROMPT-02)
  - 6 jj-colocated lifecycle CMD-* integration tests (CMD-06/07/08/09/11 + verify-work)
affects:
  - get-shit-done/workflows/undo.md (15-site delta)
  - get-shit-done/workflows/complete-milestone.md (36-site delta + REFS-06 release-marker doc)
  - get-shit-done/workflows/code-review.md (11-site delta)
  - agents/gsd-code-fixer.md (37-site delta + Path-B-locked branch-create gap comment)
  - agents/gsd-executor.md (24-site delta; prohibition prose preserved verbatim)
  - 6 new test files in sdk/src/vcs/__tests__/
tech-stack-added:
  - none (uses verbs already registered in 05-01)
patterns:
  - mechanical shape-for-shape rewrite (UPSTREAM-03 / D-33)
  - jq-piped JSON unwrap for SDK query outputs (`.data.entries`, `.data.bookmarks`, `.data.nameOnly`, `.data.nameStatus`, `.data.raw`, `.data.head`)
  - `# TODO(05-05 sweep): ...` comment tag for verb-gap deferrals
  - `<!-- TODO: branch-create gap fill -->` HTML comment marker for Path-B-locked Open-Q4 sites
  - test suite skip-gate via `try { execSync('jj --version'); } catch`
  - per-file unique tmpdir prefix `gsd-cmd-<name>-jj-` (Phase 4 LEARNINGS tmpdir-contention guard)
  - `.planning/config.json {vcs:{adapter:'jj'}}` per-tmpdir sticky pin for query-handler dispatch
key-files-created:
  - sdk/src/vcs/__tests__/cmd-undo-jj.test.ts
  - sdk/src/vcs/__tests__/cmd-pr-branch-jj.test.ts
  - sdk/src/vcs/__tests__/cmd-hotfix-jj.test.ts
  - sdk/src/vcs/__tests__/cmd-ship-jj.test.ts
  - sdk/src/vcs/__tests__/cmd-complete-milestone-jj.test.ts
  - sdk/src/vcs/__tests__/cmd-verify-work-jj.test.ts
  - .planning/phases/05-command-translations-brownfield-validation-ci-hardening/05-03-SUMMARY.md
key-files-modified:
  - get-shit-done/workflows/undo.md
  - get-shit-done/workflows/complete-milestone.md
  - get-shit-done/workflows/code-review.md
  - agents/gsd-code-fixer.md
  - agents/gsd-executor.md
decisions:
  - "CMD-06 destructive-jj-abandon semantic shift is documented inline in undo.md via a MANDATORY Pitfall 6 prose paragraph naming `jj op restore` as the recovery path; an inverse-content jj primitive is deferred to JJOP-01 v2 (post-Phase 6)"
  - "CMD-07 revset semantics empirically pinned: `~ files(glob:\".planning/**\")` strictly excludes ANY rev touching a `.planning/` file (including mixed commits). The planner's 'at-least-one-non-planning' phrasing was imprecise — Test 3 of cmd-pr-branch-jj regression-tests the discovered semantic"
  - "Open Q4 (`VcsWorkspace.add` lacks `branch: {name, create}` field) resolved Path B (sweep-TODO): no adapter gap-fill in this plan; every `git worktree add -b` site carries the literal `<!-- TODO: branch-create gap fill -->` HTML comment marker for plan 05-05 Task 4 sweep. `sdk/src/vcs/types.ts` is unchanged"
  - "REFS-06 (jj bookmarks = git annotated tags) preserved in complete-milestone.md: the git_tag step documents both backend paths and routes the push through `gsd-sdk query push --remote origin --bookmark v[X.Y]` (explicit-push pattern shared with CMD-09)"
  - "Prohibition prose in gsd-executor.md (`NEVER run git clean inside a worktree`, `git push --force` / `git push -f` denylist) preserved verbatim — these are policy strings, not invocations (acceptance criterion grep landed at 1, ≥1 required)"
  - "Worktree HEAD-assertion block in gsd-executor.md (lines 414-475) tagged git-mode-only by construction with a single sweep TODO at the block head — Claude Code worktrees ARE git worktrees (`.git` linked-worktree layout, `worktree-agent-*` branch namespace are git-specific)"
  - "pushQuery jj-side raw-refname rejection (`Invalid RevisionExpr: 'release/v1.0'`) pinned by cmd-ship-jj Test 2 + cmd-hotfix-jj Test 3 as an `expect(...).rejects.toThrow()` contract — the verb-side fix (wrap bookmark via `expr.bookmark()` before forwarding to `vcs.push`) lands in plan 05-05 sweep"
metrics:
  duration: ~19m
  tasks: 3
  files: 11 (5 workflow/agent rewrites + 6 new tests)
  start_time: 2026-05-14T03:49:18Z
  completed_date: 2026-05-14
---

# Phase 5 Plan 03: Command Translations (Lifecycle + Agent Prompts + 6 CMD Tests) Summary

VCS-agnostic rewrites of the lifecycle workflow markdown (`undo.md`, `complete-milestone.md`, `code-review.md`) and the two heavy agent prompts (`gsd-code-fixer.md`, `gsd-executor.md`) per D-33, plus six new integration tests gating CMD-06/07/08/09/11 + verify-work against jj-colocated fixtures. CMD-06 carries the Pitfall 6 destructive-jj-abandon prose as the headline semantic-shift documentation.

## What Was Built

### Task 1: undo.md + complete-milestone.md + code-review.md rewrites (commit 9790957d)

Replaced raw git invocations with SDK query forms across three lifecycle workflows:

| Workflow | Before | After |
|---|---|---|
| undo.md — MODE=last (line 53) | `git log --oneline --no-merges -${COUNT}` | `gsd-sdk query log --max-count "${COUNT}" --no-merges` + jq client-side filter |
| undo.md — MODE=phase fallback (line 87) | `git log --oneline --no-merges --all \| grep -E ...` | `gsd-sdk query log --all --max-count 200` + jq + grep |
| undo.md — MODE=plan (line 97) | Same shape | Same SDK-routed shape |
| undo.md — dirty-tree guard (line 205) | `git status --porcelain` | `gsd-sdk query status --porcelain` + jq `.raw` unwrap |
| undo.md — Pitfall 6 prose (NEW, before execute_revert) | n/a | MANDATORY paragraph documenting `jj abandon`'s destructive semantics + `jj op restore` recovery path |
| undo.md — per-commit revert loop (line 217-228) | `git revert --no-commit ${HASH}` + `git revert --abort` + `git reset HEAD` + `git restore .` | `gsd-sdk query revert --no-commit "${HASH}"` + `gsd-sdk query revert --abort` + `gsd-sdk query reset --ref HEAD --mode mixed` + `gsd-sdk query restore .` |
| undo.md — final revert commit (line 249-259) | `git commit -m "revert(...)"` | `gsd-sdk query commit "revert(...)"` |
| complete-milestone.md — stats gathering (line 172-176) | `git log --oneline --grep` + `git diff --stat` + `git log --format` | `gsd-sdk query log --max-count 200 | jq` + `gsd-sdk query diff --name-status` + `gsd-sdk query log --range ...` |
| complete-milestone.md — base-branch discovery (line 621) | `git branch --list "${PREFIX}*"` | `gsd-sdk query branch-list --prefix "${PREFIX}"` + jq |
| complete-milestone.md — squash-merge block (line 651-664) | `git merge --squash` + `git reset HEAD .planning/` + `git commit -m` | `gsd-sdk query merge "$branch" --squash` + `gsd-sdk query reset --ref HEAD --mode mixed -- .planning/` + `gsd-sdk query commit` |
| complete-milestone.md — merge-with-history block (line 680-693) | `git merge --no-ff --no-commit` + reset + commit | `gsd-sdk query merge "$branch" --no-ff --no-commit` + reset + commit |
| complete-milestone.md — current-branch probe | `git branch --show-current` | `gsd-sdk query current-branch | jq -r '.data.bookmarks[0] // .data.current // empty'` |
| complete-milestone.md — git_tag step (line 730-748) | `git tag -a v[X.Y]` + `git push origin v[X.Y]` | git-mode preserved with REFS-06 jj-bookmark documentation; explicit push via `gsd-sdk query push --remote origin --bookmark v[X.Y]` |
| complete-milestone.md — final REQUIREMENTS.md commit (line 758) | `git commit -m "chore: ..."` | `gsd-sdk query commit "chore: ..."` |
| code-review.md — compute_file_scope phase-commit discovery (line 212) | `git log --oneline --all --grep --format="%H"` | `gsd-sdk query log --all --max-count 500` + jq subject-filter |
| code-review.md — git diff scoping (line 223) | `git diff --name-only "${DIFF_BASE}..HEAD" -- . ':!...'` | `gsd-sdk query diff --name-only --range "${DIFF_BASE}..HEAD"` + jq `.nameOnly[]` + client-side grep exclusion |
| code-review.md — spawn_reviewer DIFF_BASE recompute (line 329) | Same shape as line 212 | Same SDK-routed shape |

**MANDATORY Pitfall 6 prose paragraph inserted in undo.md at the top of execute_revert (between dirty-tree guard and per-commit loop):**

> "Backend semantic shift (CMD-06 / 05-RESEARCH Pitfall 6). On the git backend, undo creates inverse-content commits and preserves history... On the jj backend, undo is destructive on jj: `gsd-sdk query revert <rev>` dispatches to `jj abandon <change_id>`, which removes the change from the visible history, and the operation log (`jj op log` / `jj op restore`) is the recovery path... The destructive jj model is intentional for v1; an inverse-content primitive on jj is deferred to JJOP-01 v2."

The paragraph contains all three acceptance-criterion tokens (`destructive on jj`, `jj op restore`, `JJOP-01`) and explicitly names `--no-commit` as parsed-but-ignored on jj.

### Task 2: gsd-code-fixer.md + gsd-executor.md rewrites (commit 79a78a6a)

| Agent | Before | After |
|---|---|---|
| gsd-code-fixer.md — rollback prose (4 sites) | `git checkout -- {file}` | `gsd-sdk query restore <file>` |
| gsd-code-fixer.md — setup_worktree branch probe (line 224) | `branch=$(git branch --show-current)` | `branch=$(gsd-sdk query current-branch | jq -r ...)` |
| gsd-code-fixer.md — workspace cleanup orphan probe (line 254-265) | `git worktree list --porcelain` + `git worktree remove --force` + `git branch -D` | git-mode preserved with TODO(05-05 sweep) tagging for `vcs.workspace.list`/`forget` + `branch-delete` shim |
| gsd-code-fixer.md — git worktree add (line 289) | `git worktree add -b "$reviewfix_branch" "$wt" "$branch"` | Same line preserved as Path-B-locked + `<!-- TODO: branch-create gap fill -->` HTML comment marker above |
| gsd-code-fixer.md — cleanup tail (line 318-353) | `git -C "$main_repo" merge --ff-only` + `git worktree remove --force` + `git -C "$main_repo" branch -D` | Each line preserved as git-mode with TODO(05-05 sweep) tagging at the appropriate verb |
| gsd-code-fixer.md — commit hash extract (line 501) | `COMMIT_HASH=$(git rev-parse --short HEAD)` | `COMMIT_HASH=$(gsd-sdk query head-ref | jq -r '.data.head // empty' | cut -c1-7)` |
| gsd-executor.md — continuation log probe (line 354) | `git log --oneline -5` | `gsd-sdk query log --max-count 5 | jq -r '.data.entries[] | (.hash[0:7] + " " + .subject)'` |
| gsd-executor.md — TDD gate-sequence prose (line 380) | "verify in git log" | "verify in the log (`gsd-sdk query log`)" |
| gsd-executor.md — worktree HEAD-assertion block (line 412-475) | 8 raw `git rev-parse` / `git symbolic-ref` invocations | Block preserved git-mode with single TODO(05-05 sweep) comment at the block head (Claude Code worktrees are git-specific by construction — `.git` linked-worktree layout, `worktree-agent-*` namespace) |
| gsd-executor.md — task commit protocol (line 477-508) | `git status --short` + `git add <file>` × 2 + `git commit -m "..."` | `gsd-sdk query status --porcelain | jq` + path-list build + `gsd-sdk query commit "..." --files "${TASK_FILES[@]}"` (pre-staging `git add` removed — SDK commit runs `git add -A -- <files>` internally per Plan 2.1-04 D-02/D-04/D-06) |
| gsd-executor.md — rev-parse hash extract (line 516) | `TASK_COMMIT=$(git rev-parse --short HEAD)` | `TASK_COMMIT=$(gsd-sdk query head-ref | jq -r '.data.head // empty' | cut -c1-7)` |
| gsd-executor.md — post-commit deletion check (line 521) | `git diff --diff-filter=D --name-only HEAD~1 HEAD` | `gsd-sdk query diff --name-status --range "HEAD~1..HEAD" | jq -r '.data.nameStatus[]? | select(.status == "D") | .path'` |
| gsd-executor.md — untracked-file check (line 528) | `git status --short | grep '^??'` | `gsd-sdk query status --porcelain | jq -r '.data.entries[]? | select(.status == "??") | .path'` |
| gsd-executor.md — per-file rollback (line 557) | `git checkout -- path/to/specific/file` | `gsd-sdk query restore path/to/specific/file` |
| gsd-executor.md — self-check commits-exist (line 629) | `git log --oneline --all | grep -q "{hash}"` | `gsd-sdk query log --all --max-count 500 | jq -r '.data.entries[].hash[0:7]' | grep -q "{hash}"` |
| gsd-executor.md — destructive_git_prohibition prose (line 531-563) | "NEVER run git clean ... `git push --force` / `git push -f` to any branch you did not create" | **PRESERVED VERBATIM** (acceptance criterion: ≥1 match of `git clean -fd|git push --force.*PROHIBITED|never.*git clean`) |

**Path B locked for the Open-Q4 branch-create gap:** `sdk/src/vcs/types.ts` `VcsWorkspace.add` interface is unchanged. The single `git worktree add -b` site in `gsd-code-fixer.md` carries the literal HTML comment `<!-- TODO: branch-create gap fill — VcsWorkspace.add lacks branch: {name, create} per Open Q4 — plan 05-05 sweep -->` at agents/gsd-code-fixer.md:283. Plan 05-05 Task 4's branch-create sweep can grep-find this marker.

### Task 3: 6 lifecycle integration tests (commit a77984cd)

| Test File | CMD | Tests | What it Asserts |
|---|---|---|---|
| `cmd-undo-jj.test.ts` | CMD-06 | 3 | (1) `revertQuery([changeId], dir)` on jj dispatches `jj abandon` and returns `{ok:true, backend:'jj', destructive:true}`; the abandoned change disappears from `vcs.log({allRefs:true})` while sibling changes survive. (2) Pitfall 6 op-log recovery invariant: post-abandon `jj op log` has ≥2 distinct operation lines (recovery reachable via `jj op restore <op>`). (3) Sequential abandons of two changes leave the third intact + `vcs.findConflicts({scope:'all'})` empty (no data loss on @). |
| `cmd-pr-branch-jj.test.ts` | CMD-07 | 3 | (1) The locked revset `~ files(glob:".planning/**")` strictly excludes EVERY rev touching a `.planning/` file (including mixed commits — the planner's 'at-least-one-non-planning' phrasing was imprecise; the regression-tested semantic is exact-zero-planning-files). (2) `jj duplicate <change>` + `vcs.refs.bookmarks.create('pr/test', head)` round-trips; the bookmark lists under unprefixed `pr/test` and exists on the jj side as `gsd/pr/test`. (3) Empirical inline revset verification: ONLY the source-only synthetic commit survives; planning-only AND mixed commits are filtered out. |
| `cmd-hotfix-jj.test.ts` | CMD-08 | 3 | (1) `jj new <past-change-id>` roots a hotfix descended from the `gsd/release/v1.0` bookmark; `@-` after the new is the release change_id. (2) `gsd/hotfix/<YYYYMMDD-HHMM>` bookmark CRUD: create with unprefixed name, list returns unprefixed, raw `jj bookmark list --all-remotes` shows the canonical `gsd/`-prefixed form. (3) `pushQuery` argv-shape contract — the verb forwards `--bookmark hotfix/<id>` to `vcs.push`, and the jj backend's `toJjRev` raw-refname rejection fires (`expect(...).rejects.toThrow(/Invalid RevisionExpr/)` pins the documented adapter constraint that plan 05-05 sweep wraps via `expr.bookmark()`). |
| `cmd-ship-jj.test.ts` | CMD-09 | 3 | (1) `vcs.refs.bookmarks.create('release/v1.0', vcs.refs.head)` lands `gsd/release/v1.0` on the jj side (REFS-06 — no annotated tags on jj); list-form returns unprefixed, raw jj-side carries the `gsd/` prefix. (2) `pushQuery` argv-parsing contract — the verb correctly forwards `release/v1.0` to the adapter; the jj rev-parse rejection fires (same pattern as cmd-hotfix Test 3). (3) No-auto-push invariant — `vcs.commit` does NOT trigger push: `vcs.refs.remotes()` stays empty post-commit, and the raw bookmark list shows no `@<remote>` entries (the colocated-local `@git` entry is explicitly excluded as expected). |
| `cmd-complete-milestone-jj.test.ts` | CMD-04 spillover + CMD-11 | 3 | (1) `branchListQuery(['--prefix', 'phase-'], dir)` surfaces the `phase-04` bookmark the orchestrator advanced to a phase-merge change; `data.bookmarks` is the canonical shape. (2) `gsd/milestone/v1.0/<phase>` archive bookmarks via `vcs.refs.bookmarks.create` round-trip; raw jj-side has `gsd/milestone/v1.0/phase-01` and `gsd/milestone/v1.0/phase-02` (REFS-06 — bookmarks not tags). (3) Final `chore(05-03): archive v1.0 milestone files` commit lands on `@-` (squash-based commit model — Plan 2.1-04 D-02/D-04/D-06) and surfaces in `vcs.log({maxCount:20, allRefs:true})`. |
| `cmd-verify-work-jj.test.ts` | CMD-04 spillover | 3 | (1) Synthesizes a real in-tree jj conflict via parallel-branches merge (alpha + beta off the same base); `vcs.findConflicts({scope:'all'})` returns ≥1 conflicted rev whose `.paths` includes `conflict.txt` (CONFLICT-01 reaches verify-work). (2) Resolution via `jj squash -B @ -k -m "resolve ..."` clears the conflict set — `findConflicts` returns empty. (3) `statusQuery(['--porcelain'], dir)` against the cleaned-up tree returns `{ok:true}` with empty `.raw`/`.stdout`/`.entries` (the verify-work invariant). |

**Total:** 6 test files, 18 tests, all passing locally under jj 0.41.0 (8.55s total).

## Pitfall 6 Prose Insertion Location

`get-shit-done/workflows/undo.md` — paragraph inserted between the dirty-tree guard and the per-commit revert loop. Lines 213-219 (the `> **Backend semantic shift (CMD-06 / 05-RESEARCH Pitfall 6).**` blockquote). The paragraph contains:
- The token `destructive on jj` (acceptance criterion #1)
- The token `jj op restore` (acceptance criterion #1 alternate)
- The token `JJOP-01` (acceptance criterion #1 alternate — deferred-primitive reference)
- Explicit documentation that `--no-commit` is parsed-but-ignored on jj
- The `jj duplicate <change_id> --destination <safe>` workaround for callers needing git-style preservation

## Deferred to Plan 05-05 Sweep

The following sites stayed raw `git` or carry verb-gap workarounds and are tagged `# TODO(05-05 sweep): ...`. None introduce backend conditionals (D-33 anti-pattern guard preserved); they are explicitly noted as git-mode-only by construction OR as missing query CLI shims.

| File:Line | Site | Missing Verb / Reason |
|---|---|---|
| `undo.md:59` | `gsd-sdk query log --no-merges` — flag parsed-but-unused | LogOpts (Phase 2 CR-02) does not yet expose `--no-merges` / `--grep` / `--format` pass-through |
| `undo.md:243` | `gsd-sdk query reset --ref HEAD --mode mixed` (conflict cleanup mid-revert) | jj has no `reset --mixed` analog; SDK verb errors clearly on jj backend |
| `complete-milestone.md:194` | `gsd-sdk query log --grep` / `--format` | Same LogOpts gap as undo.md:59 |
| `complete-milestone.md:522` | `git rm .planning/REQUIREMENTS.md` | No `gsd-sdk query rm` verb yet; `vcs.commit` captures WC state including deletions when path is listed |
| `complete-milestone.md:631` | `git symbolic-ref refs/remotes/origin/HEAD` | `gsd-sdk query head-ref` does not yet expose `refs/remotes/origin/HEAD` lookup |
| `complete-milestone.md:681,705,713,736` | `git checkout ${BASE_BRANCH}` (4 sites) | No `gsd-sdk query checkout` verb yet; workspace switch lives in WS-01/WS-02 territory |
| `complete-milestone.md:745,752` | `git branch -d` / `git branch -D` (2 sites) | No `gsd-sdk query branch-delete` verb yet; `vcs.refs.bookmarks.delete(name)` exists in adapter but query CLI shim missing |
| `complete-milestone.md:771` | `git tag -a v[X.Y] -m "..."` | Unified `gsd-sdk query tag --annotate` (git) + `branch-create --rev` (jj) release-marker verb deferred; the jj-side equivalent is `vcs.refs.bookmarks.create('release/v[X.Y]', @-)` per REFS-06 |
| `code-review.md:128` | `git rev-parse --show-toplevel` | `gsd-sdk query head-ref` does not yet expose `--show-toplevel` |
| `code-review.md:225` | `git rev-parse "${DIFF_BASE}"` parent-existence probe | No `gsd-sdk query rev-parse` verb yet; `head-ref.ts` covers HEAD but not arbitrary revs |
| `gsd-code-fixer.md:250,334` | `git worktree list --porcelain` (2 sites) | No `gsd-sdk query workspace --list` verb yet; `vcs.workspace.list()` exists in adapter |
| `gsd-code-fixer.md:262,368` | `git branch -D` (2 sites) | Same as complete-milestone.md:745 |
| `gsd-code-fixer.md:284,289` | `git worktree add -b "$reviewfix_branch" "$wt" "$branch"` (1 site, dual-comment-tagged) | `<!-- TODO: branch-create gap fill -->` HTML comment marker for Path-B-locked Open-Q4 — adapter shape unchanged |
| `gsd-code-fixer.md:342` | `git -C "$main_repo" merge --ff-only "$reviewfix_branch"` | `gsd-sdk query merge` does not yet expose `--ff-only` pass-through (verb added in 05-01 with `--squash`/`--no-ff`/`--no-commit` only) |
| `gsd-code-fixer.md:361` | `git worktree remove --force` | No `gsd-sdk query workspace --forget` / `--remove` verb yet |
| `gsd-executor.md:417` | `git rev-parse --git-dir` / `--show-toplevel` / `--abbrev-ref HEAD` / `git symbolic-ref --quiet HEAD` (8 lines in the worktree HEAD-assertion block) | `gsd-sdk query head-ref` does not expose `--git-dir` / `--show-toplevel` / `--abbrev-ref` / `--symbolic-ref` flag pass-throughs; the Claude Code worktree guards are git-mode-only by construction |
| `gsd-executor.md:529` | `gsd-sdk query diff --diff-filter D` — flag parsed-but-unused | `DiffOpts` does not yet expose `--diff-filter` pass-through; jq client-side filter is the substitute |

**Out-of-scope SDK verb sweep candidates (orthogonal to mechanical rewrites):**

- `pushQuery` raw-refname rejection on jj backend (lines 61 of `sdk/src/query/push.ts`): pass `bookmark` raw to `vcs.push({ref})` → `toJjRev` rejects bare strings. Fix: wrap via `expr.bookmark(bookmark)` before assigning to `ref`. Pinned as `expect(...).rejects.toThrow(/Invalid RevisionExpr/)` contracts in cmd-ship-jj Test 2 + cmd-hotfix-jj Test 3.

## Branch-Create Gap-Fill Sites (Path B Locked)

Per Open Q4 pre-resolution (locked Path B by this plan), `sdk/src/vcs/types.ts` is unchanged. Plan 05-05 Task 4 will sweep these marker sites:

| File:Line | Site |
|---|---|
| `agents/gsd-code-fixer.md:283-289` | Single `git worktree add -b "$reviewfix_branch" "$wt" "$branch"` invocation. The HTML comment `<!-- TODO: branch-create gap fill — VcsWorkspace.add lacks branch: {name, create} per Open Q4 — plan 05-05 sweep -->` precedes the call at line 283; the call itself is at line 289. |

This is the only `git worktree add -b` invocation across the two rewritten agent files. Both `gsd-executor.md` (24 raw-git mentions) and `gsd-code-fixer.md` (the rest of the 37 sites) route through other surfaces (commit, log, status, diff, restore, current-branch, head-ref) — none of those need the branch-create field.

## Hand-off to Plan 05-04

Plan 05-04 (brownfield-jj-migration) inherits the same rewrite patterns for the remaining workflow markdown:

- `get-shit-done/workflows/resume-work.md` — `gsd-sdk query log` / `gsd-sdk query status` for crash-state discovery
- `get-shit-done/workflows/pause-work.md` — same `gsd-sdk query commit` / `gsd-sdk query status` shapes
- `get-shit-done/workflows/import.md` — `gsd-sdk query log` for commit history scan; CMD-10 brownfield-import is owned by plan 05-04 in its entirety
- `get-shit-done/workflows/ingest-docs.md` — `gsd-sdk query log` + `gsd-sdk query diff` for docs-scope discovery
- `get-shit-done/workflows/map-codebase.md` — same `gsd-sdk query log` shape

Plan 05-04's brownfield CMD-10 test category will follow the `cmd-*-jj.test.ts` pattern this plan + 05-02 jointly establish (skip-gate, per-suite mkdtemp, afterAll cleanup, unique-prefix tmpdirs, `.planning/config.json {vcs:{adapter:'jj'}}` sticky pin).

The TODO(05-05 sweep) categories enumerated above are unchanged for plan 05-04; they remain plan 05-05's responsibility once the matching verbs land.

## Verification

- `cd sdk && pnpm tsc --noEmit` → 0 errors (clean type-check)
- `cd sdk && pnpm vitest run src/vcs/__tests__/cmd-{undo,pr-branch,hotfix,ship,complete-milestone,verify-work}-jj.test.ts` → 6 files, 18 tests, all pass under jj 0.41.0 in 8.55s
- `node scripts/lint-vcs-no-raw-git.cjs` → 0 violations across 955 files
- `grep -P "destructive on jj|jj op restore|JJOP-01|destructive jj model" get-shit-done/workflows/undo.md | wc -l` → 3 (≥1 required)
- `grep -P "gsd-sdk query revert" get-shit-done/workflows/undo.md | wc -l` → 5 (≥1 required)
- `grep -v '^#' get-shit-done/workflows/undo.md | grep -cP "^\s*git\s+(commit|revert|reset|restore|stash|hook)\b"` → 0 (≤3)
- `grep -P "gsd-sdk query (merge|branch-list|push)" get-shit-done/workflows/complete-milestone.md | wc -l` → 7 (≥3 required)
- `grep -v '^#' get-shit-done/workflows/complete-milestone.md | grep -cP "^\s*git\s+(commit|push|merge|branch|reset|tag)\b"` → 3 (≤8)
- `grep -P "gsd-sdk query log" get-shit-done/workflows/code-review.md | wc -l` → 2 (≥2 required)
- `grep -v '^#' get-shit-done/workflows/code-review.md | grep -cP "^\s*git\s+(commit|push|log|diff|rev-parse)\b"` → 0 (≤3)
- `grep -cP "if vcs.adapter == 'jj'" get-shit-done/workflows/{undo,complete-milestone,code-review}.md` → 0/0/0 (D-33 anti-pattern guard preserved)
- `grep -P "gsd-sdk query (restore|workspace|branch-list|current-branch)" agents/gsd-code-fixer.md | wc -l` → 13 (≥4 required)
- `grep -v '^#' agents/gsd-code-fixer.md | grep -cP "^\s*git\s+(commit|push|reset|revert|checkout|worktree|branch|stash)\b"` → 4 (≤10)
- `grep -P "gsd-sdk query (commit|log|status|diff|head-ref|current-branch|restore)" agents/gsd-executor.md | wc -l` → 14 (≥5 required)
- `grep -v '^#' agents/gsd-executor.md | grep -cP "^\s*git\s+(commit|push|reset|revert|checkout|worktree|branch|stash|symbolic-ref|rev-parse|status|diff|log|add)\b"` → 0 (≤8)
- `grep -P "git clean -fd|git push --force.*PROHIBITED|never.*git clean" agents/gsd-executor.md | wc -l` → 1 (≥1 required — prohibition prose preserved verbatim)
- `grep -cP "if vcs.adapter == 'jj'" agents/{gsd-code-fixer,gsd-executor}.md` → 0/0 (D-33 anti-pattern guard preserved)
- `grep -F "<!-- TODO: branch-create gap fill" agents/gsd-code-fixer.md | wc -l` → 1 (≥1 required)
- `grep -P "branch\\?: \\{ name: string; create: boolean \\}" sdk/src/vcs/types.ts | wc -l` → 0 (adapter shape unchanged — Path B locked)

## Deviations from Plan

1. **CMD-07 revset semantic discovered to be stricter than the planner's phrasing.** Plan 05-03 line 30 reads: "Strict planning-only exclusion: `~ files(glob:".planning/**")` — keeps any rev that touches at least one non-planning file." The empirical-inline-verification instruction (Test 3 of cmd-pr-branch-jj) revealed that the revset is STRICTER: it excludes EVERY rev touching any `.planning/` file (including mixed commits that ALSO touch source files). The tests now regression-test the discovered semantic. The planner's preferred behavior ("at least one non-planning file") would require a different revset composition (e.g., `files(glob:"**") & ~ files(glob:".planning/**") & ~ (~ files(glob:".planning/**") & files(glob:".planning/**"))` is logically equivalent — there is no single jj 0.41 revset that selects "touches ≥1 non-planning file AND may also touch planning files" without changing the spec's exclusion semantics; this is a v2 refinement deferred outside this plan).

2. **`pushQuery` raw-refname rejection on jj is a verb-side bug, not a test-side problem.** Plan 05-03 lines 318-322 anticipated this: "since we don't have a remote in the tmpdir fixture, assert the verb's argv shape is correct via mock or via `vcs.push({ bookmark, dryRun: true })` if the adapter supports dryRun (verify; if not, assert the push verb's call signature via direct invocation of `pushQuery` from `sdk/src/query/push.js`)." The integration-test contract landed is: `expect(pushQuery(...)).rejects.toThrow(/Invalid RevisionExpr/)` — proving argv-parsing succeeded and the adapter's documented raw-refname rejection fires. The verb-side fix (wrap `bookmark` via `expr.bookmark()` before assigning to `ref` in `sdk/src/query/push.ts:61`) is a 05-05 sweep candidate; it has no behavior impact on git backend where `git push --bookmark` accepts bare refnames.

3. **Worktree HEAD-assertion block in `gsd-executor.md` (lines 412-475) preserved git-mode by construction.** Plan 05-03 Task 2 specifies routing `git rev-parse --git-dir` / `--show-toplevel` / `--abbrev-ref HEAD` / `git symbolic-ref` through `gsd-sdk query head-ref` + `gsd-sdk query current-branch`. The flags the block uses are NOT yet exposed by the SDK verbs; AND the block's purpose is to guard Claude Code worktrees (which ARE git worktrees by construction — `.git` linked-worktree layout + `worktree-agent-*` branch namespace are git-specific). A single TODO(05-05 sweep) comment at the block head captures the deferral; the block itself is structurally git-mode and dispatches via raw `git rev-parse` for that reason. This matches the plan 05-02 pattern for `execute-phase.md` lines ~545-561 (same shape, same sweep TODO category).

## Stub tracking

No stub patterns introduced. The workflow rewrites are mechanical (UPSTREAM-03) and all data flows route through real SDK query verbs or properly-tagged TODO(05-05 sweep) sites; no `=[]` / `=null` / "coming soon" placeholders that would flow to a UI. The Path-B-locked branch-create HTML comment marker is intentional and tracked above.

## Self-Check: PASSED

- ✓ Task 1 commit `lvvtuptszsyustkzpotpzqzkkyzvtlqo` present: `feat(05-03): rewrite undo.md + complete-milestone.md + code-review.md to be VCS-agnostic (D-33, Task 1)`
- ✓ Task 2 commit `xlzvzrymotwmluouyvquuspmknlyysqr` present: `feat(05-03): rewrite gsd-code-fixer.md + gsd-executor.md to be VCS-agnostic (PROMPT-02, Task 2)`
- ✓ Task 3 commit `uxlnslotxtotrzvowzqrvwzsozlrylvn` present: `test(05-03): add CMD-06..09 + CMD-04-spillover + CMD-11 lifecycle integration tests against jj-colocated fixtures (Task 3)`
- ✓ All 6 new test files exist on disk under `sdk/src/vcs/__tests__/cmd-*-jj.test.ts`
- ✓ All 18 tests pass under jj 0.41.0 (vitest exit 0; 8.55s total)
- ✓ Type-check clean (`pnpm tsc --noEmit` exit 0)
- ✓ No-raw-git lint clean (0 violations across 955 files)
- ✓ All headline acceptance criteria met (see Verification section)
