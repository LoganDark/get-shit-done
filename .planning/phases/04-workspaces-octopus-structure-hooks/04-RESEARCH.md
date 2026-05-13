# Phase 4: Workspaces + Octopus Structure + Hooks — Research

**Researched:** 2026-05-13
**Domain:** jj workspaces (`jj workspace add/forget/list`), `jj new -A/-B` octopus structure for orchestrator-pre-created subagent heads, `jj squash` crash-recovery semantics, per-workspace flock concurrency, Tier 1 hook firing (colocated no-op + non-colocated direct fire), `jj git push` pre-push integration, cross-backend refname validator
**Confidence:** HIGH on jj command semantics (locally verified against jj 0.41.0); HIGH on existing codebase patterns (read inline); MEDIUM on `acarapetis/jj-pre-push` integration shape (Python tool with PyPI distribution — CONTEXT defers exact wrapping decision to planner; CI-02 constraint rules out runtime Python dependency for the adapter); HIGH on hook strategy (Phase 4 D-07..D-10 commit to Tier 1).

## Summary

Phase 4 is **plumbing work, not invention**. Phase 3 stubbed every workspace verb with `VcsNotImplementedError` at known coordinates (`sdk/src/vcs/backends/jj.ts:791-840`); Phase 2.1 deleted the public `vcs.hooks` namespace but left the private `fireHook` helper in `sdk/src/vcs/hook-bridge.ts` waiting for an internal caller. Phase 4 fills those slots. The orchestrator's git-side subagent dispatch site (`get-shit-done/workflows/execute-phase.md:522-573` — `Agent(isolation="worktree", ...)` with the `worktree-agent-<id>` branch namespace and `.claude/worktrees/agent-<id>` path layout) is the conceptual mirror for the jj side; Phase 4 produces a jj equivalent of that flow via `vcs.workspace.{add,forget,list,reap}` + `acquireWriteLock` + `fireHook` so Phase 5's PROMPT-* rewrites can call into adapter verbs instead of raw `git worktree`.

Three details dominate the design space and are all empirically verified locally against jj 0.41.0: (1) `jj workspace add` does NOT create intermediate parent directories — the adapter MUST `mkdir -p` first (D-17 confirmed); (2) `jj workspace forget` does NOT remove the on-disk directory — the adapter MUST `rm -rf` separately (Pitfall 3 confirmed); (3) `jj diff` rejects combining `-r <head>` with `--from <parent>` (mutually exclusive in jj 0.41) — the empty-head probe MUST use `jj diff --from <parent_change> --to <head_change>` form, NOT the form CONTEXT D-12 sketches. Also: `jj workspace list` does NOT accept `--no-graph` (unlike `jj log`); Phase 3's existing parser invocation at jj.ts:814 already omits `--no-graph` so this is a known-correct call and no adjustment is needed.

**Primary recommendation:** Land the work as 6-7 narrow plans mirroring Phase 3's verb-group cadence (shape commit → workspace verbs → concurrency → octopus helpers → reap → hook wiring → cr-01 + jj-native CI lane). Every jj invocation in this phase routes through the existing `vcsExec` + `jjArgv()` helpers; no new shell-out patterns introduced; the lint guard at `scripts/lint-vcs-no-raw-git.cjs` stays at zero violations throughout. `acarapetis/jj-pre-push` is Python and CI-02 forbids runtime language dependencies beyond Node — recommend the planner pick option (b) inline a minimal Node replication of its trigger logic (≈30 lines: enumerate bookmarks that would push, run `fireHook(cwd, 'pre-push', …)`, exit non-zero on hook failure before invoking `jj git push`).

## Architectural Responsibility Map

Phase 4 is single-tier (SDK + bin/lib library code on a developer/CI machine; no client/server/CDN split). Tier ownership maps to module layer:

| Capability | Primary Layer | Secondary Layer | Rationale |
|------------|---------------|-----------------|-----------|
| Workspace add/forget/list/context/prune on jj | `sdk/src/vcs/backends/jj.ts` | `sdk/src/vcs/parse/jj-workspace-list.ts` (existing) | Phase 3 stubbed the verbs here; Phase 4 fills the same slots, parser already lands its NDJSON shape. |
| Workspace add/forget/list on git (mirror surface) | `sdk/src/vcs/backends/git.ts` | `get-shit-done/bin/lib/worktree-safety.cjs` (existing inventory helper) | git.ts already has `workspace.add/forget/list/context/prune` (lines 451-512); Phase 4 adds the new `reap` + `acquireWriteLock` verbs symmetrically. |
| `acquireWriteLock` primitive | `sdk/src/vcs/backends/jj.ts` (real flock) + `sdk/src/vcs/backends/git.ts` (no-op) | Node `proper-lockfile` or hand-rolled `fs.openSync(O_EXCL)` on `.jj/working_copy/checkout` sentinel | jj has no `index.lock` analog (Pitfall 4); kernel-enforced on git via index.lock. |
| `workspace.reap()` verb | `sdk/src/vcs/backends/jj.ts` (real probe+abandon+forget loop) + `sdk/src/vcs/backends/git.ts` (mapped to existing `git worktree remove` cleanup loop) | `vcs.workspace.list()` for enumeration | Centralises the auto-snapshot caveat (D-15) so callers don't accidentally re-snapshot the probed head. |
| Empty-tree crash probe (D-12) | `sdk/src/vcs/backends/jj.ts` inside `workspace.reap()` | `jj diff --from <parent> --to <head> -s` | Empirically verified: empty stdout = clean abandon; non-empty = squash-as-incomplete-work. |
| Crash-recovery squash | `sdk/src/vcs/backends/jj.ts` inside `workspace.reap()` | Reuses existing squash codepath at jj.ts:171 with custom message `'subagent N: incomplete work'` and `-k` (already in `jjArgv`). | Mirrors the SQUASH-01 invocation but targeted at the crashed head; `-k` preserves the change_id reachability for the crash queue. |
| Crash queue file | `sdk/src/query/<TBD>.ts` or `sdk/src/vcs/jj/incomplete-work.ts` sidecar | `.planning/phases/{N}/incomplete-work.md` markdown append | Planner picks location; recommend sidecar under `sdk/src/vcs/jj/` for zero-conflict upstream-rebase surface (UPSTREAM-02). |
| Hook firing inside `commit()` and `push()` | `sdk/src/vcs/backends/{git,jj}.ts` | Existing private `fireHook` in `sdk/src/vcs/hook-bridge.ts` | Phase 1 shipped the helper; Phase 2.1 D-07 deleted the public namespace but kept the helper; Phase 4 wires internal invocations from inside `commit()` and `push()`. JSDoc comments at jj.ts:139/518 and git.ts:50-51/515 already promise "Phase 4 will wire" — those become live. |
| SDK query bridge for explicit-fire callers | `sdk/src/query/hooks.ts` (new file) | Reachable via `gsd-sdk query hooks.fire <stage>` CLI | Replaces `git hook run pre-commit` at `execute-phase.md:689` (Phase 5 PROMPT-* rewrites the call site; Phase 4 ships the query). |
| jj-pre-push integration | `sdk/src/vcs/backends/jj.ts` inside `push()` (recommended inline) OR `sdk/src/vcs/jj/pre-push.ts` sidecar | Calls `fireHook(cwd, 'pre-push', …)` before `jj git push` argv emission | Already partly in place — jj.ts:524 already wraps `jj git push`. Phase 4 adds the pre-fire step. |
| cr-01 refname validator | `sdk/src/vcs/expr.ts` (existing `expr.bookmark()` lifted to a shared module) | Threaded through `refs.bookmarks.{create,move,delete,exists}` on both backends when `opts.raw === true` | D-24 fold-in. `--` end-of-options separator inserted at argv positions before the name. |
| Workspace-path-safety guards (WS-13) | `docs/test-triage/jj-bugs.md` (audit + verdicts) + transposed-into-vcs.workspace.* code where applicable | Existing `worktree-safety.cjs` patterns inform the jj impl | TEST-08 already verdicted all 7 worktree-bug tests as "carries-verbatim" against jj-colocated (per STATE 03-06 entry); Phase 4 re-audits under multi-workspace add/forget flows since Phase 3 only verified single-workspace. |
| jj-native CI lane | `.github/workflows/test.yml` matrix axis | Existing jj-colocated lane shape (test.yml:79) | Third axis: `jj-native`; fixture init uses `jj git init --no-git` (or whatever current jj 0.41 spelling is for non-colocated init — planner verifies via `jj git init --help`); `continue-on-error: true` per D-22. |

## Standard Stack

### Core
| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| `jj` (Jujutsu) | 0.41.0 (Phase 3 D-14 pin) [VERIFIED: locally `jj --version` = 0.41.0] | Workspace + commit primitive on jj backend | Already pinned by Phase 3 D-14/D-15 release-tarball install in CI; no version change in Phase 4. |
| `vcsExec` wrapper | sdk-internal | Argv-array spawning with uniform `{exitCode,stdout,stderr,timedOut,error}` shape | All Phase 4 jj invocations route through this; JJ-02 invariant. [VERIFIED: read at `sdk/src/vcs/exec.ts`] |
| `jjArgv()` helper | sdk-internal | Prefixes `--repository`, `--no-pager`, `--color never`, `--quiet` | Every Phase 4 jj invocation uses it; JJ-02 mandatory flags. [VERIFIED: consumed across `sdk/src/vcs/backends/jj.ts`] |
| `fireHook(cwd, stage, ctx)` | sdk-internal (`sdk/src/vcs/hook-bridge.ts`) | Shells `.githooks/<stage>` synchronously with WR-04 Windows-shebang handling | Phase 1 D-05 shipped it; Phase 2.1 D-07 kept it private; Phase 4 wires the internal caller. [VERIFIED: read at `sdk/src/vcs/hook-bridge.ts`] |
| `parseJjWorkspaceList` | sdk-internal | NDJSON parse of `jj workspace list -T 'json(self) ++ "\n"'` | Already production in Phase 3 plan 03-02 (`sdk/src/vcs/parse/jj-workspace-list.ts:31`); already produces `{path: <name>, rev, locked:false}`. Phase 4 confirms multi-workspace cases against it. [VERIFIED: parser source + locally-confirmed JSON shape] |
| Node `child_process` (via `vcsExec`) | Node ≥ stable | argv-array spawning | Already in use; no new dependency. |
| Node `fs.openSync(O_EXCL)` or `fs.flockSync` (POSIX) | Node ≥ stable | Per-workspace advisory lock on `.jj/working_copy/checkout` | Hand-rolled is fine; Node has no built-in `flock()` but `openSync` with `O_EXCL` on a sentinel sidecar file (NOT the live `checkout` file — that's jj's internal pointer) achieves the same advisory-mutual-exclusion. [ASSUMED — planner verifies precise sentinel choice; see Open Question 1] |

### Supporting

| Library / Tool | Version | Purpose | When to Use |
|----------------|---------|---------|-------------|
| `proper-lockfile` (npm) | latest [ASSUMED — verify via `npm view proper-lockfile version`] | Cross-platform advisory file locking with retry+timeout | OPTIONAL alternative to hand-rolled `O_EXCL` lock for `acquireWriteLock`. Trade-off: adds a runtime dependency; npm ecosystem standard for this exact problem; package legitimacy NOT yet verified. Planner's call: hand-roll vs adopt. |
| `acarapetis/jj-pre-push` (PyPI) | latest | Reference implementation for pre-push integration on `jj git push` | REFERENCE ONLY — Python tool, CI-02 forbids Python runtime dependency. Use as design source for what to enumerate (which bookmarks would push) and when to fire the hook. Re-implement in Node inline in jj.ts `push()`. [CITED: https://github.com/acarapetis/jj-pre-push] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled flock via `fs.openSync(O_EXCL)` on a sentinel | `proper-lockfile` npm package | Trade dep introduction (security/upstream-rebase surface) for battle-tested cross-platform behaviour. Hand-roll is preferred for this fork (zero new deps, sidecar lives in `sdk/src/vcs/jj/`). |
| Inline jj-pre-push replication in jj.ts | Shell out to vendored `acarapetis/jj-pre-push` Python tool | CI-02 forbids runtime Python dep; vendoring breaks CI portability; inline replication is ≈30 LOC. Reject vendoring. |
| `vcs.workspace.reap()` as a single verb | Caller-orchestrated `vcs.diff` + `vcs.workspace.forget` loop | Single verb centralises the auto-snapshot caveat (D-15) so callers don't accidentally re-snapshot the probed head. Prefer single verb (CONTEXT Claude's-discretion lean). |
| `mkdir -p` parent dir inside the adapter | Caller's responsibility | jj errors with "Cannot access … No such file or directory" at the wrong layer (verified locally); adapter MUST handle this per D-17. Don't push burden onto callers. |
| Bookmark-per-subagent | Workspace-name as canonical key (D-05) | Bookmark churn explodes (one per subagent × phase × execution); `bookmarks.list` becomes O(N) instead of O(phases). Workspace-name carries identity cleanly. |
| JSON sidecar for orchestrator state | Derive from `vcs.workspace.list()` (D-03) | Sidecar = another file to keep consistent with adapter state; another `.planning` format-migration tracker entry. Derivation is single source of truth. |

**Installation:** No new packages required if hand-rolling the lock and inlining jj-pre-push logic. If `proper-lockfile` is adopted, run the **Package Legitimacy Audit** below before committing the install.

**Version verification:**
- jj 0.41.0 already pinned in `.github/workflows/test.yml:130-145` (Phase 3 plan 03-07).
- No new runtime deps recommended.

## Package Legitimacy Audit

> Recommended Phase 4 stance: **zero new runtime deps**. The hand-rolled `O_EXCL` lock and inline jj-pre-push replication avoid the audit entirely.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `proper-lockfile` | npm | (not verified) | (not verified) | (not verified) | NOT RUN — planner audits only IF adopting | Audit gated behind a `checkpoint:human-verify` in the plan IF the planner picks this alternative. Default disposition: NOT INTRODUCED. |

**Packages removed due to slopcheck [SLOP] verdict:** none (no slopcheck run because no packages are proposed for adoption).
**Packages flagged as suspicious [SUS]:** none.

*If the planner deviates from the hand-roll default and proposes `proper-lockfile`, the plan MUST include a `checkpoint:human-verify` task that runs `slopcheck install proper-lockfile` and `npm view proper-lockfile version downloads scripts.postinstall repository` before the install commits.*

## Architecture Patterns

### System Architecture Diagram (data flow for a multi-subagent phase)

```
        Orchestrator (main workspace @ = one beyond merge change)
              │
              ├──► vcs.workspace.add(.claude/jj-workspaces/phase-{N}-subagent-1, {atRevision: head_1})
              │       │
              │       ├─► mkdir -p parent dir (D-17)
              │       ├─► jj new -A <parent_change> -B <merge_change> -m 'subagent 1' --no-edit  (returns head_1 change_id)
              │       └─► jj workspace add <path> -r <head_1> --name phase-{N}-subagent-1
              │
              ├──► (repeat per subagent — N times)
              │
              ├──► Agent(isolation=workspace, cwd=workspace_path).run(plan)
              │       │
              │       ├─► subagent edits files, runs `gsd-sdk query commit` → vcs.commit({files, message})
              │       │       └─► jj squash -B @ -k -m '<message>'
              │       │       └─► fireHook(cwd, 'pre-commit', ctx) — colocated: no-op; non-colocated: shell .githooks/pre-commit
              │       │       └─► bookmark advance (if input.bookmark set)
              │       └─► subagent exits (success OR crash OR missing-SUMMARY)
              │
              ├──► Wait-for-all (existing orchestrator-step semantics)
              │
              ├──► vcs.workspace.reap({phaseNamePrefix: 'phase-{N}-subagent-'})
              │       │
              │       ├─► For each tracked workspace name matching prefix:
              │       │   ├─► jj diff --from <parent> --to <head> -s   (run from MAIN workspace, NOT the subagent workspace — D-15)
              │       │   ├─► IF empty stdout:
              │       │   │     ├─► jj abandon <head_change>
              │       │   │     ├─► jj workspace forget <name>
              │       │   │     └─► rm -rf <workspace_path>   (Pitfall 3: forget does NOT remove on-disk dir)
              │       │   └─► IF non-empty stdout (D-12 / WS-12):
              │       │         ├─► jj squash -B @ -k -m 'subagent N: incomplete work'  (targeting the crashed head)
              │       │         ├─► append entry to .planning/phases/{N}/incomplete-work.md
              │       │         └─► (workspace + directory left in place for human review)
              │       │
              │       └─► Returns ReapResult { abandoned: [...], incomplete: [...] }
              │
              ├──► Phase merge: vcs.commit({bookmarkRaw: 'gsd/phase-{N}', files: <subset>, message: <phase summary>})
              │       │
              │       ├─► PRE-CHECK: read .planning/phases/{N}/incomplete-work.md
              │       │   └─► If non-empty: throw VcsIncompleteSubagentsError listing entries (D-14)
              │       │
              │       ├─► jj squash -B @ -k -m '<phase summary>'   (squash advances bookmark gsd/phase-{N} to merge change per WS-09)
              │       └─► fireHook(cwd, 'pre-commit', ctx)
              │
              └──► vcs.push() — fireHook(cwd, 'pre-push', ctx) inline before jj git push
```

Note the **orchestrator-runs-probe-from-main-workspace** invariant (D-15): the empty-tree probe MUST run from a cwd OTHER than the subagent workspace, because every jj invocation auto-snapshots and would otherwise re-snapshot the head being inspected. `jj diff --from <parent> --to <head>` with `-R <main_repo_root>` (or equivalently from a cwd inside main) achieves this.

### Recommended Project Structure

```
sdk/src/vcs/
├── backends/
│   ├── git.ts                # Mirror surface: acquireWriteLock no-op, workspace.reap maps to existing worktree cleanup, hook-bridge wired
│   └── jj.ts                 # PRIMARY EDIT TARGET — workspace.add/forget/list/context/prune real bodies; acquireWriteLock real flock; workspace.reap; hook-bridge wired into commit() + push()
├── hook-bridge.ts            # Untouched shape — comments referencing "Phase 4 will wire" become live wiring (no JSDoc-only change)
├── parse/
│   └── jj-workspace-list.ts  # Already production from Phase 3 plan 03-02; Phase 4 confirms multi-workspace coverage
├── expr.ts                   # cr-01 fold-in: existing expr.bookmark() validator lifted into a shared module callable from both backends' refs.bookmarks.* write paths when opts.raw === true
├── types.ts                  # SHAPE COMMIT: adds acquireWriteLock, optional vcs.workspace.reap, VcsIncompleteSubagentsError class
├── jj/                       # Sidecar (Phase 2.1 D-15) — zero-conflict surface for upstream rebases (UPSTREAM-02)
│   ├── lock.ts               # acquireWriteLock impl using O_EXCL sentinel under .jj/working_copy/
│   ├── reap.ts               # workspace.reap() impl (probe + abandon + forget + rm + crash-queue append)
│   ├── octopus.ts            # NEW (optional): orchestrator-side helpers for lazy parent+merge slot creation. Could also live in sdk/src/query/.
│   ├── incomplete-work.ts    # NEW: append/parse for .planning/phases/{N}/incomplete-work.md (D-13)
│   └── pre-push.ts           # NEW: inline replication of acarapetis/jj-pre-push trigger logic for HOOK-04
└── ...

sdk/src/query/
└── hooks.ts                  # NEW: SDK query bridge for explicit-fire callers (D-08); reachable from CLI via `gsd-sdk query hooks.fire <stage>`

.github/workflows/test.yml    # Add jj-native matrix axis with continue-on-error:true per D-22

docs/test-triage/jj-bugs.md   # Append multi-workspace verdicts for WS-13 audit
```

### Pattern 1: Shape commit (verb-shape exception)

**What:** Single atomic commit landing types.ts additions + jj.ts skeleton + git.ts mirror surface + CI matrix axis + baseline-parity flip for the new verbs.
**When to use:** Phase 2 D-08 / Phase 2.1 D-21 verb-shape-change exception — Phase 4 adds `acquireWriteLock` to the adapter surface AND introduces the new `vcs.workspace.reap()` verb. Both are surface-shape changes; bundling them keeps the type seam consistent across backends in a single revision.
**Example:** Mirrors Phase 3 plan 03-01 in size and shape — types delta + per-backend skeleton + per-verb allowlist flip in `backends.ts` + matrix axis add. [VERIFIED: pattern read at `.planning/phases/03-jj-backend-core-squash-refs-conflict/03-CONTEXT.md` and STATE entry for plan 03-01]

### Pattern 2: Per-verb baseline-parity flip in `backends.ts` allowlist

**What:** Phase 3 plan 03-01 introduced `BACKENDS_AVAILABLE_FOR_VERB` allowlist gating contract tests per-verb. Workspace verbs were left as `['git']` per Phase 3 D-12.
**When to use:** Flip each workspace verb's allowlist entry from `['git']` to `['git', 'jj-colocated', 'jj-native']` as its real impl lands and contract tests are green on the new backends.
**Example:**
```typescript
// Source: read at sdk/src/vcs/backends.ts (Phase 3 pattern)
// Phase 4 flip:
'workspace.add':    ['git', 'jj-colocated', 'jj-native'],   // was ['git']
'workspace.forget': ['git', 'jj-colocated', 'jj-native'],   // was ['git']
'workspace.prune':  ['git', 'jj-colocated', 'jj-native'],   // was ['git']
'workspace.reap':   ['git', 'jj-colocated', 'jj-native'],   // NEW verb
'acquireWriteLock': ['git', 'jj-colocated', 'jj-native'],   // NEW verb
```

### Pattern 3: RAII release-handle for `acquireWriteLock`

**What:** Adapter returns `{ release(): void }` synchronously; caller `using`-binds OR explicitly `release()`s; the underlying `fs.openSync(O_EXCL, sentinel_path)` descriptor is closed and the sentinel removed on release.
**When to use:** D-19; mirrors the conventional Node lockfile pattern. Stale-WC handling (D-21) is automatic on acquisition: if `jj workspace list` reports the workspace as stale, the adapter runs `jj workspace update-stale` before returning the handle.
**Example:**
```typescript
// Source: hand-rolled pattern; planner verifies precise file ops
const handle = vcs.acquireWriteLock(workspacePath, { timeout: 30_000 });
try {
  // ... mutating ops ...
} finally {
  handle.release();
}
```

### Pattern 4: Hook-fire wired inside commit() + push() with opt-out

**What:** Both backends' `commit()` and `push()` invoke `fireHook(cwd, '<stage>', ctx)` at the right moment. `noVerify` is the public opt-out (already on `CommitInput` and `PushOpts`); when true, skip the fire AND (on git) pass `--no-verify` to the underlying git command for symmetry.
**When to use:** HOOK-01..04. Hooks fire INSIDE squash per HOOK-02; the call site is the line immediately after the `jj squash` exec-success branch in `jj.ts` `commit()` (around current line 207), BEFORE the bookmark-advance step.
**Example:**
```typescript
// Source: Phase 1 hook-bridge.ts:19 + Phase 4 D-07/D-10 wiring
// At end of successful squash, before bookmark advance:
if (!input.noVerify) {
  const isColocated = existsSync(join(cwd, '.git')) && existsSync(join(cwd, '.jj'));
  if (!isColocated) {
    // Tier 1 D-10: non-colocated direct-fire — git's .git/hooks/pre-commit
    // does NOT fire because there is no .git
    const hookRes = fireHook(cwd, 'pre-commit', { /* ctx */ });
    if (hookRes.exitCode !== 0) {
      // Squash already succeeded; report hook failure via merged stderr.
      mergedStderr = `${mergedStderr}\n[pre-commit hook failed]: ${hookRes.stderr || hookRes.stdout}`;
    }
  }
  // colocated: git's own .git/hooks/pre-commit fires via post-squash jj git export → git ref update
}
```

### Anti-Patterns to Avoid

- **Running the empty-tree probe from inside the subagent workspace:** Re-snapshots the head being inspected (Pitfall 2). Probe MUST run from main workspace OR with `-R <main_repo_root>`.
- **`jj diff -r <head> --from <parent>`:** Mutually exclusive on jj 0.41 (locally verified — error: "the argument '--from <REVSET>' cannot be used with '--revisions <REVSETS>'"). CONTEXT D-12 sketches this form; use `jj diff --from <parent> --to <head> -s` instead.
- **Calling `jj workspace add` without `mkdir -p`:** Errors at the wrong layer with "Cannot access … No such file or directory" (locally verified). Adapter handles this per D-17.
- **`jj workspace forget` and assuming the dir is gone:** Forget keeps the on-disk dir intact (locally verified; docs confirm: "files can be deleted from disk separately"). `vcs.workspace.reap()` MUST `rm -rf` after forget for empty-head case.
- **Per-subagent bookmarks:** Bookmark churn explodes; D-05 rejects this; workspace-name carries identity instead.
- **Bare `git stash` in post-wave hook validation:** `execute-phase.md:688` already uses a named stash ref for the explicit-fire path; preserve that pattern in the SDK query bridge.
- **Wrapper-recursion in hooks:** Tier 2 (deferred); Tier 1 (Phase 4) does not introduce a `jj` wrapper, so no `GSD_JJ_WRAPPER_DEPTH` env needed yet.
- **Adding `--ignore-working-copy` anywhere in Phase 4 jj code:** Forbidden by JJ-03 / Phase 3 D-05 / "Squash model for GSD on jj" memory. The auto-snapshot is required to keep WC fresh; centralise the snapshot-during-probe concern via "run probe from main workspace" instead (D-15).
- **Adding entries to `scripts/lint-vcs-no-raw-git.cjs` allowlist:** Phase 3 invariant carries forward. Workspace impls shell only `jj`. `fireHook` shells `bash`/the hook script directly (allowed — not a `git` invocation per Phase 1 D-05).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| NDJSON parse of `jj workspace list` | Custom regex/split parser | `parseJjWorkspaceList` at `sdk/src/vcs/parse/jj-workspace-list.ts` | Already production from Phase 3 plan 03-02; pinned by snapshot tests; handles `{name, target.commit_id}` shape. |
| Worktree porcelain parse (git side) | Custom block parser | `readWorktreeList` at `get-shit-done/bin/lib/worktree-safety.cjs` + `sdk/src/vcs/parse/worktree-list.ts` | Phase 1 plan 01-03 promoted to module surface; ADR-0004 canonical owner. |
| `vcsExec` wrapper for `jj` | Custom `child_process.spawn` calls | `vcsExec(cwd, 'jj', jjArgv(...))` | JJ-02 invariant; uniform error shape. |
| Mandatory jj flags | Hand-typed `--repository …` per call | `jjArgv()` | Phase 3 helper; every invocation in jj.ts uses it. |
| Hook script execution with Windows-shebang handling | Custom `spawn(hookPath)` | `fireHook(cwd, stage, ctx)` at `sdk/src/vcs/hook-bridge.ts` | WR-04 already handles ENOEXEC under win32 by routing through `bash -c`. |
| Refname validation | Custom string regex per call site | Shared validator lifted from `expr.bookmark()` (cr-01 / D-24) | Centralises the rule across both backends and both raw/non-raw paths. |
| jj `git push` pre-hook trigger | Wrap external Python tool (`acarapetis/jj-pre-push`) | Inline 30-LOC Node replication: enumerate would-push bookmarks (`jj bookmark list -T 'json(self) ++ "\\n"'` filtered to tracked-remote), call `fireHook(cwd, 'pre-push', …)`, exit non-zero before `jj git push` | CI-02 forbids Python runtime dep; inline is mechanical; acarapetis tool is reference-only. |
| Cross-platform advisory file lock | Hand-roll `flock(2)` ioctl via FFI | `fs.openSync(sentinel_path, 'wx')` with retry loop, OR `proper-lockfile` (gated by package legitimacy audit) | Node lacks built-in `flock()`; `O_EXCL` open + sentinel is portable and matches Node convention. |
| Subagent state persistence | JSON sidecar file | Derive from `vcs.workspace.list()` + workspace-name convention (D-03 / D-04) | Single source of truth; no format-migration tracker entry needed. |
| jj backend test fixture (multi-workspace) | New top-level fixture file | Extend `vcsTest(kind)` (Phase 1 D-14) with a `vcsMultiWsTest(kind, n)` factory | Mirrors the parameterised harness pattern; planner's discretion per CONTEXT. |

**Key insight:** Phase 4 is **wiring**, not invention. Almost every primitive Phase 4 needs already exists in the codebase from Phase 1-3 (parsers, vcsExec, jjArgv, fireHook, expr.bookmark validator, vcsTest fixture, baseline-parity allowlist, sticky adapter detection, NDJSON template convention). The work is filling stubs, wiring private helpers to internal callers, and adding one new verb (`reap`) + one new primitive (`acquireWriteLock`). The novelty budget is small — spend it on the empty-tree probe semantics and the crash-queue gating, not on re-inventing existing seams.

## Runtime State Inventory

> Phase 4 is greenfield code addition, not a rename/refactor. This section nevertheless calls out runtime state surfaces because Phase 4 introduces new state — workspaces, the crash queue file, the per-workspace lock sentinel.

| Category | Items Introduced | Action Required |
|----------|------------------|------------------|
| Stored data | `.planning/phases/{N}/incomplete-work.md` (D-13) — append-only markdown crash queue, change_id-native | New file format; tracked in Phase 3 D-19 format-migration tracker (Phase 4 D-06 entry). NOT git-committed at squash time (per D-13: "gitignored from the squash-into-phase-commit"). |
| Live service config | None | jj has no central daemon; no live config surface. |
| OS-registered state | jj workspace registrations in `.jj/operations/` and `.jj/workspace_*/` | Created by `jj workspace add`, removed by `jj workspace forget` — managed entirely by jj. No OS-level (systemd / launchd / Task Scheduler) registrations introduced. |
| Secrets/env vars | `GSD_JJ_WRAPPER_DEPTH` (deferred to Tier 2 / HOOK-05 — NOT Phase 4) | None introduced in Phase 4. |
| Build artifacts | None introduced | Phase 4 does not change `sdk/dist-cjs/` build output shape beyond the new exported types and verbs. |
| Lock sentinels | Per-workspace `O_EXCL` sentinel file under `.jj/working_copy/<sentinel>` OR adjacent path | NEW. Adapter creates on `acquireWriteLock`; removes on `release()`. Sentinel path chosen by planner; recommend NOT directly using `.jj/working_copy/checkout` (jj's internal pointer — fs perms 0600 verified locally) and instead introducing a sidecar like `.jj/working_copy/gsd-lock`. |

**Nothing found in category "Live service config" — verified by:** jj has no daemon model (lock-free op log per Pitfall 4); all state is filesystem-resident under `.jj/` and is captured in the OS-registered-state row above.

## Common Pitfalls

### Pitfall 1: Auto-snapshot during the empty-tree probe (D-15)

**What goes wrong:** Adapter runs `jj diff --from <parent> --to <head>` from inside the subagent workspace; jj auto-snapshots, the head's tree now contains whatever's on disk in that workspace (the crashed agent's uncommitted edits), the diff is non-empty, the probe wrongly concludes "real work present" and squashes-as-incomplete, when in fact the head was empty and the disk state was random noise.
**Why it happens:** Pitfall 2 from research/PITFALLS.md — engineers assume read-only commands are side-effect-free; jj re-snapshots on every command.
**How to avoid:** Probe runs from the **orchestrator's main workspace** (or with `-R <main_repo_root>` from any cwd that is NOT the subagent's). The diff inspects the head's committed tree, not a fresh snapshot.
**Warning signs:** Crash queue grows non-empty entries on phases that didn't actually crash; `jj workspace list` shows the subagent's `@` change_id moved after the orchestrator inspected it.

### Pitfall 2: `jj diff -r <id> --from <parent>` is rejected on jj 0.41

**What goes wrong:** CONTEXT D-12 sketches this form. Locally verified rejection: `error: the argument '--from <REVSET>' cannot be used with '--revisions <REVSETS>'`. The probe would error and the adapter would (silently?) fall through.
**Why it happens:** `-r` shows changes in a revision relative to its parent (or merged-parents for a merge); `--from`/`--to` is a separate mode. They're mutually exclusive.
**How to avoid:** Use `jj diff --from <parent_change> --to <head_change> -s` (summary-only output for cheap empty-vs-nonempty check). The exit code is 0 in both empty and non-empty cases; the empty-vs-nonempty signal is empty-stdout. [VERIFIED locally on jj 0.41.0]
**Warning signs:** Reap loop errors out before printing; crash queue stays empty after a real crash because the probe never ran cleanly.

### Pitfall 3: `jj workspace forget` does NOT remove the on-disk directory

**What goes wrong:** Reap loop calls `jj workspace forget` and assumes the path is gone. The directory persists, the next phase's `vcs.workspace.add(<same_path>)` errors with "destination exists" OR silently re-tracks orphan files.
**Why it happens:** jj design choice — separation of concerns between "VCS forgets this workspace" and "filesystem cleanup". Locally verified: directory persists after `jj workspace forget child`; `ls /path/to/child` returns the seeded files unchanged.
**How to avoid:** `vcs.workspace.reap()` MUST `rm -rf <workspace_path>` after a successful `jj workspace forget`. For non-empty heads (WS-12 path), DO NOT `rm -rf` — leave the dir for human review.
**Warning signs:** "destination already exists" errors on next phase's `vcs.workspace.add`; orphan `.claude/jj-workspaces/phase-{N-1}-subagent-*` directories on disk.

### Pitfall 4: `jj workspace add` does NOT auto-create parent directories

**What goes wrong:** Adapter calls `jj workspace add ./does-not-exist/nested-ws`; jj errors with "Cannot access … No such file or directory". Caller sees the error at the wrong layer.
**Why it happens:** Locally verified on jj 0.41.0. The destination's *immediate* directory must exist; jj does not `mkdir -p`.
**How to avoid:** Adapter's `vcs.workspace.add(path, …)` MUST `mkdir -p path.dirname(path)` before invoking `jj workspace add`. Wraps the failure layer. D-17 locks this rule.
**Warning signs:** "Cannot access" errors with paths that include intermediate non-existent components. Tests that pass when run individually but fail in suites that don't clean parent dirs between runs.

### Pitfall 5: `jj workspace list` rejects `--no-graph`

**What goes wrong:** A Phase 4 plan author writes a new `jj workspace list` invocation with `--no-graph` (because that's the convention for `jj log` / `jj op log`). jj 0.41 rejects with "unexpected argument '--no-graph' found". Locally verified.
**Why it happens:** `jj workspace list` is not a log-like command; it has no graph output to suppress. The `-T 'json(self) ++ "\n"'` template already produces line-delimited output.
**How to avoid:** Match Phase 3's already-correct invocation at `sdk/src/vcs/backends/jj.ts:814`: `jjArgv('workspace', 'list', '-T', 'json(self) ++ "\\n"')`. No `--no-graph`. The trailing `--no-pager`/`--color never`/`--quiet` from `jjArgv()` are still safe.
**Warning signs:** "unexpected argument '--no-graph'" in test output. Tests that fail under `GSD_TEST_BACKENDS=jj-colocated` immediately after a new workspace test is added.

### Pitfall 6: Per-workspace lock target choice

**What goes wrong:** Adapter opens `O_EXCL` on `.jj/working_copy/checkout` directly. This is jj's internal pointer file (locally verified perms 0600, owned by jj); externally opening or locking it produces undefined behaviour at jj's next snapshot.
**Why it happens:** D-19 sketches "advisory `flock` on the workspace's `.jj/working_copy/checkout` sentinel (same lock jj itself uses for snapshot serialisation)". jj uses an internal mutex around its snapshot serialisation; we should NOT contend with it externally.
**How to avoid:** Introduce a GSD-owned sidecar sentinel under `.jj/working_copy/` (e.g., `.jj/working_copy/gsd-lock`) and `O_EXCL` open THAT, not jj's `checkout` file. Sidecar can be removed on `release()` without affecting jj's internal state.
**Warning signs:** Snapshot operations hanging or producing "lock held" errors; flaky tests that fail after `acquireWriteLock` is added.

### Pitfall 7: `acarapetis/jj-pre-push` is Python — CI-02 forbids runtime Python dependency

**What goes wrong:** Plan author adds `uv tool install jj-pre-push` to CI; CI-02 ("jj install uses release tarballs, not runtime language toolchains") is implicitly violated because Python becomes a runtime dep on every machine that runs `vcs.push()`.
**Why it happens:** CONTEXT lists three options for HOOK-04 integration; option (a) "install acarapetis/jj-pre-push as a runtime dep" looks attractive because it's pre-built.
**How to avoid:** Pick option (b) "inline a minimal replication of its trigger logic" — ≈30 LOC: enumerate would-push bookmarks via existing `vcs.refs.bookmarks.list()` filtered to those with tracked remote, call `fireHook(cwd, 'pre-push', { stagedFiles })`, exit non-zero before `jj git push` argv emission.
**Warning signs:** CI install step adds `uv` or `pip install`; new deps that aren't visible from `package.json`.

### Pitfall 8: Sticky `vcs.adapter` defaults git when both present (Phase 3 D-17) — Phase 4 adapter surface ships dormant in THIS repo

**What goes wrong:** Developer working on Phase 4 expects `createVcsAdapter(cwd)` in this repo to return the jj backend; it returns the git backend per D-17. Phase 4 jj workspace impls appear "not invoked" during local dogfood, masking bugs.
**Why it happens:** This repo is colocated (`.git` AND `.jj` both present); Phase 3 D-17 sticky default = git until migration phase flips it. Per "Use git (not jj) until migration lands" memory.
**How to avoid:** Phase 4 contract tests run under explicit `GSD_VCS=jj` (via the `vcsTest(kind)` fixture). CI matrix exercises both backends regardless of repo posture (D-22). Do NOT rely on auto-detection for Phase 4 development verification.
**Warning signs:** Phase 4 code lands; tests appear green; brownfield validation in Phase 5 surfaces "nothing was actually invoked" failures.

### Pitfall 9: Recursive auto-snapshot from inside the lock-acquisition path

**What goes wrong:** `acquireWriteLock(workspace_path)` runs `jj workspace list` to detect stale-WC; the list invocation auto-snapshots; the snapshot triggers a hook; the hook calls back into `vcs.commit()` which tries to `acquireWriteLock`; deadlock.
**Why it happens:** Pitfall 2 (auto-snapshot) × Pitfall 4 (lock chain). Plausible if `acquireWriteLock` is naive about which cwd it queries from.
**How to avoid:** Lock acquisition path queries `jj workspace list` with `-R <main_repo_root>` so the snapshot fires on the main workspace (which is NOT the one being locked); stale-recovery (`jj workspace update-stale`) targets the specific workspace via `cd <workspace_path> && jj workspace update-stale` AFTER lock acquisition, not before. Hooks fire INSIDE `commit()` / `push()` only — `acquireWriteLock` does not fire hooks.
**Warning signs:** Phase 4 tests hang; CI jj lanes time out; `jj op log` shows oscillating snapshot operations during a single test run.

### Pitfall 10: Cross-workspace shared-ancestor rewrite races (Pitfall 4 from PITFALLS.md, partial in Phase 4)

**What goes wrong:** Two subagents in different workspaces both rewrite the same ancestor commit (e.g., both edit a shared file in the parent change via auto-snapshot — though squash-into-parent is the intended path). Both succeed lock-free; the op log diverges; one workspace becomes stale.
**Why it happens:** jj is intentionally lock-free at the repo level; per-workspace flock only guards the snapshot serialisation within ONE workspace.
**How to avoid (Phase 4 partial resolution):** Per D-19, only per-workspace flock is shipped. Per D-20, cross-workspace `vcs.acquireRepoLock` is deferred until a real flow surfaces. Per Pitfall 4 rec: orchestrator (or higher-layer GSD code) sequences mutations that touch shared ancestors. In Phase 4 practice: subagents only mutate their OWN head (octopus structure isolates writes per-subagent until the merge), so shared-ancestor rewrites should not occur in the happy path. Re-litigate during dogfood post-migration.
**Warning signs:** Divergent operations in `jj op log` after a multi-subagent phase; subagents producing commits with the same change_id but different commit_ids.

## Code Examples

Verified patterns from existing codebase (read inline). All paths absolute.

### `workspace.list()` — Phase 3 existing impl that Phase 4 keeps and extends to multi-workspace

```typescript
// Source: /Users/LoganDark/Documents/Projects/get-shit-done/sdk/src/vcs/backends/jj.ts:813-818
list: (): WorkspaceInfo[] => {
  const args = jjArgv('workspace', 'list', '-T', 'json(self) ++ "\\n"');
  const r = vcsExec(cwd, 'jj', args);
  if (r.exitCode !== 0) return [];
  return parseJjWorkspaceList(r.stdout);
}
```

Phase 4 changes: zero. The shape is correct; multi-workspace cases produce N elements automatically (locally verified — `jj workspace list -T 'json(self) ++ "\n"'` on a 2-workspace repo emits 2 NDJSON lines).

### `workspace.add()` — Phase 4 new body (replaces NotImpl at jj.ts:792)

```typescript
// Source: synthesised from D-17 + locally-verified jj 0.41 semantics
add: (input: WorkspaceAdd): WorkspaceInfo => {
  // D-17: jj workspace add does NOT auto-create intermediate directories.
  const { dirname } = require('node:path');
  const { mkdirSync } = require('node:fs');
  mkdirSync(dirname(input.path), { recursive: true });

  // D-04: workspace name is canonical key; --name flag controls jj's internal label.
  // Derive name from path basename per D-04 unless caller passed an explicit name.
  // (Adapter shape: input.path is the on-disk dest; the --name flag goes through
  // a separate field in WorkspaceAdd — planner extends the type to include it.)
  const args = jjArgv('workspace', 'add', input.path);
  if (input.baseRef) {
    args.push('-r', toJjRev(input.baseRef));
  }
  // If WorkspaceAdd gains a `name` field (planner's call), thread it:
  // if (input.name) args.push('--name', input.name);

  const r = vcsExec(cwd, 'jj', args);
  if (r.exitCode !== 0) {
    throw new Error(`workspace.add failed: ${r.stderr || r.stdout}`);
  }

  // Return shape parity with git backend (git.ts:460): fetch head of the new workspace.
  // For jj this is the new working-copy commit_id, queryable via list().
  const entries = workspace.list();
  const entry = entries.find((e) => e.path === input.path || e.path === basename(input.path));
  return entry ?? { path: input.path, rev: '', locked: false };
}
```

### `workspace.forget()` — Phase 4 new body

```typescript
// Source: synthesised from locally-verified jj 0.41 forget semantics + Pitfall 3
forget: (workspaceNameOrPath: string): void => {
  // Forget by NAME (not by path). The adapter must resolve path → name via list().
  // Mirrors `jj workspace forget <NAME>` argv form per `jj workspace forget --help`.
  const entries = workspace.list();
  const entry = entries.find((e) => e.path === workspaceNameOrPath);
  const name = entry?.path ?? workspaceNameOrPath; // path is the name in jj list output
  const args = jjArgv('workspace', 'forget', name);
  const r = vcsExec(cwd, 'jj', args);
  if (r.exitCode !== 0) {
    throw new Error(`workspace.forget failed: ${r.stderr || r.stdout}`);
  }
  // PITFALL 3: forget does NOT remove on-disk dir. Caller (typically reap())
  // is responsible for `rm -rf` of the on-disk path for the empty-head case.
}
```

### Empty-tree probe (D-12, corrected per locally-verified semantics)

```typescript
// Source: synthesised; CONTEXT D-12 sketch CORRECTED — jj 0.41 rejects -r + --from
function isEmptyHead(repoRoot: string, parentChange: string, headChange: string): boolean {
  const args = jjArgv('diff', '--from', parentChange, '--to', headChange, '-s');
  // Run from main repo root, NOT the subagent workspace (D-15 / Pitfall 2):
  const r = vcsExec(repoRoot, 'jj', args);
  if (r.exitCode !== 0) {
    throw new VcsExecError(`empty-tree probe failed: ${r.stderr || r.stdout}`, {
      exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr,
      timedOut: r.timedOut, args,
    });
  }
  return r.stdout.trim().length === 0;
}
```

### Hook fire wired inside `jj.ts` `commit()`

```typescript
// Source: insertion point is around current line 207 (after squash success, before bookmark advance)
// at /Users/LoganDark/Documents/Projects/get-shit-done/sdk/src/vcs/backends/jj.ts
// Imports needed at top of jj.ts:
//   import { fireHook } from '../hook-bridge.js';  // (the module exports it; verify visibility)
//   import { existsSync } from 'node:fs';
//   import { join } from 'node:path';

if (squashRes.exitCode === 0 && !input.noVerify) {
  // D-10: colocated detection. The cwd-or-ancestor check already happens at
  // createVcsAdapter construction time per Phase 1/3; reuse that signal if
  // exposed on the adapter, else local-check via fs.existsSync.
  const isColocated = existsSync(join(cwd, '.git')) && existsSync(join(cwd, '.jj'));
  if (!isColocated) {
    const hookRes = fireHook(cwd, 'pre-commit', {});
    if (hookRes.exitCode !== 0) {
      mergedStderr = `${mergedStderr}\n[pre-commit hook failed]: ${hookRes.stderr || hookRes.stdout}`;
      // Hook failure semantics: planner picks — return non-zero exitCode
      // and treat as commit failure? Or surface via stderr like bookmark-advance failure?
      // Recommendation: mirror bookmark-advance failure (T-03.04-03 pattern) — squash
      // already succeeded; hook failure is reported via stderr but exitCode stays squashRes's.
    }
  }
  // colocated: no-op. git's .git/hooks/pre-commit fires automatically when .git is
  // updated by post-squash jj git export (since jj 0.41 colocated mode exports on every op).
}
```

### CI matrix axis addition

```yaml
# Source: /Users/LoganDark/Documents/Projects/get-shit-done/.github/workflows/test.yml:79
# Phase 3 plan 03-07 shape — Phase 4 extends matrix axis:
strategy:
  fail-fast: false
  matrix:
    backend: [git, jj-colocated, jj-native]   # added 'jj-native' for Phase 4 D-22
continue-on-error: ${{ matrix.backend == 'jj-colocated' || matrix.backend == 'jj-native' }}
# (Phase 5 graduates BOTH jj-* axes from allow-failure to required-blocking.)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Worktrees managed via raw `git worktree add` in `execute-phase.md:704-735` | `vcs.workspace.add/forget/list/reap` via VcsAdapter | Phase 4 ships the verbs; Phase 5 PROMPT-* rewrites the workflow markdown to call them | Single source of truth for workspace ops; both backends supported. |
| Bare `git stash` before post-wave hook fire | Named stash ref (`gsd-post-wave-hook-$$`) — already in `execute-phase.md:688` (current main) | Already done; preserved | Defense against hook/script failure stranding stashes. |
| `git hook run pre-commit` raw invocation in post-wave validation | `gsd-sdk query hooks.fire pre-commit` cross-backend (Phase 4 D-08) | Phase 4 ships the query; Phase 5 PROMPT-* swaps the call site | Cross-backend symmetry; explicit-fire callers don't shell out to git directly. |
| `--ignore-working-copy` for read-only jj calls (research/STACK.md original recommendation) | **OVERRIDDEN** per Phase 3 D-05 — auto-snapshot is required to keep WC fresh; the snapshot-during-probe concern is handled via "run probe from main workspace" (D-15) instead | Phase 3 D-05; carries forward to Phase 4 | Single canonical pattern; no surprise stale-WC errors from skipping snapshot. |
| Public `vcs.hooks.*` namespace | DELETED in Phase 2.1 D-07; private `fireHook` retained; Phase 4 wires internal callers | Phase 2.1 / Phase 4 | Hook firing is an adapter implementation detail; callers use `commit({noVerify})` to opt out. |
| Wrapper-based hook strategy (`jj-with-hooks` PATH shim) | Deferred to v2 (HOOK2-01/02); Tier 1 ships colocated default + non-colocated direct fire | Phase 4 D-07; REQUIREMENTS HOOK-05 | v1 interface accommodates future wrapper without breaking change. |

**Deprecated/outdated:**
- `jj branch` (alias for `jj bookmark`) — Phase 3 D-03 already uses `bookmark` canonical name throughout; Phase 4 continues. [VERIFIED via local `jj --help` output and PITFALLS.md Pitfall 9]
- `jj op undo` (alias for `jj op revert`) — not invoked by Phase 4 code.

## User Constraints (from CONTEXT.md)

### Locked Decisions

(Verbatim from CONTEXT.md `<decisions>` — see lines 37-99 of `.planning/phases/04-workspaces-octopus-structure-hooks/04-CONTEXT.md` for full text. Summary of D-01..D-24 — each MUST hold during planning:)

- **D-01:** Build full multi-workspace infra now (production-ready for parallel multi-subagent dispatch on jj); do NOT activate parallel dispatch in THIS repo until migration phase.
- **D-02:** Sequential dispatch is config posture, not a Phase 4 omission. Adapter must be parallel-ready.
- **D-03:** No JSON sidecar for orchestrator state; workspace-name is canonical key (derive from `vcs.workspace.list()`).
- **D-04:** Workspace-name convention: `phase-{N}-subagent-{idx}` with `{N}` zero-padded per memory convention → `phase-04-subagent-1`.
- **D-05:** Bookmark namespace mirrors phase only (`gsd/phase-{N}`); no per-subagent bookmarks.
- **D-06:** Only Phase 4 D-19 (format-migration tracker) entry is `.planning/phases/{N}/incomplete-work.md` (change_id-native).
- **D-07:** No public re-add of `vcs.hooks.*`; private `fireHook` invoked internally by `vcs.commit()` post-squash and `vcs.push()` pre-push.
- **D-08:** SDK query bridge ships in Phase 4 (e.g., `gsd-sdk query hooks.fire <stage>`); workflow markdown rewrites are Phase 5.
- **D-09:** Hook stages remain `pre-commit` and `pre-push` only.
- **D-10:** Colocated detection via `.git` AND `.jj` both present at cwd-or-above. Colocated → no-op for pre-commit; non-colocated → adapter shells `.githooks/pre-commit` directly.
- **D-11..D-15:** Crash recovery semantics (detection via Agent() exit + missing SUMMARY.md commit; empty-vs-real-work probe via `jj diff --from <parent> --to <head>`; crash queue at `.planning/phases/{N}/incomplete-work.md`; phase merge blocks while queue non-empty; auto-snapshot mitigated by running probe from orchestrator's workspace).
- **D-16:** Workspace path layout `.claude/jj-workspaces/phase-{N}-subagent-{idx}/`.
- **D-17:** Adapter `mkdir -p` parent before `jj workspace add`.
- **D-18:** Path layout hard-coded for v1 (no config knob).
- **D-19:** `vcs.acquireWriteLock(workspace)` per-workspace flock only; RAII release-handle; 30s default timeout.
- **D-20:** No cross-workspace primitive in v1 (deferred).
- **D-21:** Stale-WC handling part of write-lock acquisition path; auto-runs `jj workspace update-stale`.
- **D-22:** Add jj-native lane to CI matrix with `continue-on-error: true` (graduates in Phase 5).
- **D-23:** CI pin and install reuse Phase 3 D-14/D-15 (jj 0.41 release tarball).
- **D-24:** Fold `cr-01-raw-bookmark-argv-injection` into Phase 4; refname validator + `--` end-of-options separator.

### Claude's Discretion

(Verbatim from CONTEXT.md — planner picks within these bands:)

- SDK query bridge name for D-08 (likely `gsd-sdk query hooks.fire <stage>`).
- jj-pre-push integration shape (HOOK-04): options (a) install dep / (b) inline replication / (c) shell out to vendored script. Constraint: no Rust/Python runtime dep per CI-02. **This research recommends option (b).**
- Workspace name slug zero-padding: `phase-04-subagent-1` vs `phase-4-subagent-1`. **This research recommends zero-padded for consistency with directory naming memory.**
- Crash queue ordering / dedup behaviour.
- `VcsIncompleteSubagentsError` exact class name and recovery hints.
- Empty-tree probe placement: inside `vcs.workspace.reap()` (single verb, centralised auto-snapshot caveat) vs caller-orchestrated `vcs.diff` + `vcs.workspace.forget`. **This research recommends single verb.**
- Test-fixture extensions for multi-workspace flows.
- Workspace-path-safety guard transposition (WS-13): per-bug verdicts (jj-mapped / git-only / carries-verbatim) appended to `docs/test-triage/jj-bugs.md`.

### Deferred Ideas (OUT OF SCOPE)

- HOOK-05 Tier 2 PATH-shim wrapper (`jj-with-hooks` binary).
- JJOP-* jj-only opportunities (op-log undo, conflict-tolerant merge, change-IDs as stable phase trackers, `jj fix`, `jj split`).
- Cross-workspace coordination primitive (`vcs.acquireRepoLock()`).
- `workflow.workspace_path_template` config knob.
- `vcs.test.readWithoutSnapshot()` symbol-gated escape.
- Multi-version jj CI matrix axis.
- Wrapper-based hook strategy in v1.
- Bookmark-as-subagent-state.
- JSON sidecar for orchestrator state.
- Pre-existing failures from Phase 3 (`.planning/phases/03-jj-backend-core-squash-refs-conflict/deferred-items.md`).
- REQUIREMENTS.md footer reconciliation.
- MIGR-04 + UPSTREAM-01 rebase task.
- `/gsd-migrate-to-jj` command + `.planning/` SHA → change_id rewriter.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WS-01 | `vcs.workspace.add(path, { atRevision })` | jj 0.41 `jj workspace add <DEST> -r <REVSET> --name <NAME>` verified locally; D-17 mkdir -p; D-16 path layout; existing git mirror at git.ts:453 |
| WS-02 | `vcs.workspace.forget(path)` | jj 0.41 `jj workspace forget <NAME>` verified; **Pitfall 3 — does NOT remove on-disk dir**; reap() handles rm |
| WS-03 | `vcs.workspace.list()` | Already production at jj.ts:813 via `parseJjWorkspaceList`; multi-workspace shape locally verified |
| WS-04 | Default workspace path layout | D-16 locks `.claude/jj-workspaces/phase-{N}-subagent-{idx}/`; D-18 hard-coded for v1; mirrors Claude Code's `.claude/worktrees/agent-*` convention so existing #2774 inclusion-filter pattern reuses |
| WS-05 | Lazy octopus structure | Trigger condition: orchestrator's first subagent dispatch in a phase. Single-plan phases without fan-out → linear chain. Detection: dispatch site counts subagents-this-wave; if `n > 1` (or first time `n >= 1`?) → create parent+merge slot. Planner picks exact predicate. |
| WS-06 | Per-subagent head + workspace pre-creation | jj 0.41 `jj new -A <parent> -B <merge> -m '<msg>' --no-edit` verified — `-A` and `-B` can be combined per local `jj new --help` output (example shown in help text). Combined form is the precise primitive for inserting a new change between an existing parent and merge. `--no-edit` keeps orchestrator's `@` at one beyond merge (D-10 / WS-10). |
| WS-07 | Track each subagent's head change_id; `-k` preserves change_ids | `-k` already in `jjArgv` squash invocation at jj.ts:171 (SQUASH-01); tracked-id durability across squash verified by Phase 3 D-08 |
| WS-08 | Plans within a phase use octopus recursively | Same primitive; plan-level fan-out creates its own parent+merge slot. Planner picks whether to expose this as a separate verb (e.g., `vcs.octopus.create({parent, slotName})`) or keep it inside the orchestrator-side helper. |
| WS-09 | Phase bookmark advances to merge change | `vcs.commit({bookmarkRaw: 'gsd/phase-{N}', message: <summary>})` at phase close. Existing bookmark-advance path at jj.ts:211-227 already does this when caller passes `bookmark`/`bookmarkRaw`. `--allow-backwards` already present. |
| WS-10 | Orchestrator's main `@` sits one beyond merge | Achieved by combining `jj new --no-edit -A <parent> -B <merge>` (creates subagent heads without moving orchestrator's `@`) with the orchestrator's `@` being created at phase-start by a separate `jj new -A <merge>` (or simply by phase-merge-time `jj new`). Planner specifies the exact orchestrator-`@` lifecycle. |
| WS-11 | Batch reap after phase merge | `vcs.workspace.reap({phaseNamePrefix})` — single verb; probe + abandon + forget + rm loop; non-empty heads surfaced via the ReapResult (no auto-squash for non-empty in the happy reap path — only the crash-recovery path D-12 squashes). |
| WS-12 | Crash recovery: squash incomplete work as `'subagent N: incomplete work'` | D-12 / D-13; empty-tree probe (corrected to `jj diff --from <parent> --to <head> -s`); squash with `-k`; append to `.planning/phases/{N}/incomplete-work.md` |
| WS-13 | Workspace-path-safety guards preserving spirit of `bug-3097/3099`/`2774`/`2075` | TEST-08 already verdicted these as "carries-verbatim" against jj-colocated for SINGLE workspace cases (STATE 03-06 entry). Phase 4 re-audits under multi-workspace add/forget flows; verdicts appended to `docs/test-triage/jj-bugs.md`. |
| HOOK-01 | `vcs.hooks.fire(stage, ctx)` primitive — stages `pre-commit`, `pre-push` | D-07: no public namespace. Internal `fireHook(cwd, stage, ctx)` already at `sdk/src/vcs/hook-bridge.ts:19`. D-08 SDK query bridge for explicit-fire callers. |
| HOOK-02 | Hook trigger point on jj is after each `jj squash` | Wire at jj.ts:207 (post-squash, pre-bookmark-advance). |
| HOOK-03 | Tier 1: colocated no-op + non-colocated direct fire | D-10 colocated detection via `.git` AND `.jj` both present. Non-colocated → `fireHook(cwd, 'pre-commit', …)`. |
| HOOK-04 | Pre-push: `acarapetis/jj-pre-push`-style integration | Option (b) inline ≈30 LOC in jj.ts `push()` — enumerate would-push bookmarks, `fireHook(cwd, 'pre-push', …)`, exit non-zero before `jj git push`. Reject options (a) and (c) per CI-02. |
| HOOK-05 | Tier 2 deferred | Phase 4 v1 interface shaped to accommodate future PATH-shim without breaking change. No `GSD_JJ_WRAPPER_DEPTH` env in Phase 4. |
| CI-04 | Pre-push validation hooks fire on both git and jj sides via adapter | HOOK-04 internal wiring + D-08 SDK query bridge cover both. jj-native CI lane (D-22) exercises the direct-fire path. |

## Assumptions Log

> Claims tagged `[ASSUMED]` in this research — discuss-phase / planner consume for confirmation gates.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `proper-lockfile` npm package latest version exists and is reputable; if planner picks this alternative, slopcheck must run | Standard Stack > Supporting | If the package is slopsquatted / abandoned, adopting it introduces a security or maintenance risk. Mitigation: planner's `checkpoint:human-verify` task before any install. |
| A2 | Sentinel file under `.jj/working_copy/gsd-lock` (or similar GSD-owned path adjacent to but distinct from `.jj/working_copy/checkout`) is the correct lock target; opening `O_EXCL` there does not interfere with jj's internal snapshot serialisation | Runtime State Inventory + Pitfall 6 | If jj's internal serialisation locks the entire `.jj/working_copy/` dir (e.g., via dirfd flock), an external sentinel under the same path may not provide useful mutual exclusion OR may deadlock with jj internals. Mitigation: planner empirically tests via `vcsTest('jj-colocated')` + `vcsTest('jj-native')` with concurrent `acquireWriteLock` invocations; if interference observed, fall back to a sentinel adjacent to (not inside) `.jj/working_copy/` — e.g., `.jj/gsd-locks/<workspace_name>.lock`. |
| A3 | jj 0.41 colocated mode runs `jj git export` on every squash, so git's `.git/hooks/pre-commit` fires automatically in colocated mode | Architecture Patterns + HOOK-03 wiring example | If colocated export is NOT automatic on every squash (jj version-dependent), the "colocated no-op" decision (D-10) would silently miss hook fires. Mitigation: planner adds a colocated regression test that asserts `.git/hooks/pre-commit` actually fires post-squash on jj-colocated; if false, Phase 4 must also fire `pre-commit` in colocated mode (still safe — fireHook is idempotent). |
| A4 | `acarapetis/jj-pre-push` trigger logic is approximately "enumerate bookmarks that would push (tracked-remote and locally-ahead), run hook for each, push only if all hooks pass". This is the design source for the inline replication. | Don't Hand-Roll + Pitfall 7 | If the upstream tool has subtler logic (e.g., per-file diff against remote, specific exit-code conventions), the inline replication may diverge in edge cases. Mitigation: planner reads `acarapetis/jj-pre-push` source directly during implementation (the tool is open-source on GitHub and PyPI) and notes any deviation. |
| A5 | Phase 3 D-17 sticky-adapter is already correctly wired such that `GSD_VCS=jj` env override works during Phase 4 CI matrix testing | Pitfall 8 | If the sticky-resolver has bugs in env-override precedence, the `jj-native` CI lane would silently run the git backend, masking Phase 4 bugs. Mitigation: planner verifies via the existing `sticky-resolver.test.ts` test that env > sticky > detection priority holds. |

## Open Questions (RESOLVED)

> All six items below adopted by the planner during 04-PLAN authoring. Each carries a **RESOLVED:** line capturing the decision; mirrored into CONTEXT.md as D-25..D-30. The original "Recommendation" wording is preserved so the reasoning chain stays auditable.

1. **Exact predicate for "first fan-out triggers lazy octopus structure creation" (WS-05).** What we know: single-plan phases without fan-out stay linear; multi-subagent dispatch triggers parent+merge slot creation. What's unclear: is the trigger "subagents-in-wave > 1" (one subagent stays linear) or "any subagent in any wave" (single subagent gets parent+merge slot for forward-compat)? Recommendation: planner picks; lean toward "any subagent in any wave" so the orchestrator never has to re-shape mid-phase, at the cost of a one-element-octopus for solo subagent dispatch (cheap; just a parent and a merge change with one child).
   - **RESOLVED:** Trigger predicate = "any subagent in any wave". Single-subagent dispatch still creates parent+merge slot (one-child octopus); orchestrator never re-shapes mid-phase. Adopted by plan 05 createPhaseStructure helper. Mirrored as D-25.

2. **Should the SDK query bridge `gsd-sdk query hooks.fire <stage>` accept a `--cwd` flag or always operate on process.cwd()?** What we know: the call site at `execute-phase.md:689` is `git hook run pre-commit` invoked from the workspace root in the shell. What's unclear: whether the SDK query is reachable from inside a subagent workspace (where process.cwd() is the subagent path) and should fire ON THAT cwd, or always fire on the main repo root. Recommendation: accept `--cwd` with default to process.cwd(); document that the orchestrator post-wave call always passes `--cwd=.` from the main workspace.
   - **RESOLVED:** Accept `--cwd` with default to process.cwd(); explicit override supported. Orchestrator workflow markdown (Phase 5 PROMPT-*) passes `--cwd=.` from the main workspace. Adopted by plan 06 sdk/src/query/hooks.ts. Mirrored as D-26.

3. **Crash queue file format details (D-13).** What we know: markdown append-only with entries `- {subagentName}: head={change_id_short}, workspace={path}, reason={crash_reason}`. What's unclear: whether the file has a frontmatter header (yaml metadata for phase number, generated-by, version), whether entries are line-prefixed with timestamps, whether nested workspaces (Phase 4 D-08 / WS-08 plan-level fan-out) need a separate file per plan or share the phase-level file. Recommendation: planner picks; lean toward yaml frontmatter (mirrors STATE.md / SUMMARY.md convention) + flat entries with timestamps; one file per phase regardless of nesting depth.
   - **RESOLVED:** Flat markdown, append-only, NO yaml frontmatter, NO timestamps, ONE file per phase regardless of nesting depth. The D-13 line shape is the entire format. Comments (`#` prefix) and blank lines are tolerated by the parser. Adopted by plan 04 sdk/src/vcs/jj/incomplete-work.ts. Mirrored as D-27.

4. **Lock acquisition timeout default (30s per D-19) — is this tested under realistic load?** What we know: 30s is a reasonable upper bound for jj snapshot serialisation under single-machine conditions. What's unclear: whether parallel-subagent dogfood ever exceeds this (e.g., 8 subagents racing the lock on a slow disk). Recommendation: 30s holds for v1; add a metric for time-spent-waiting-for-lock in Phase 5 dogfood; revisit if observed.
   - **RESOLVED:** 30s default holds for Phase 4 v1 (already locked by D-19). No new metric added in Phase 4; revisit during Phase 5 dogfood if subagent fan-out exceeds. Mirrored as D-28 (no-op restatement of D-19 for traceability).

5. **Should `workspace.reap()` block the phase merge if non-empty heads are found, OR only block on the separate `.planning/phases/{N}/incomplete-work.md` queue?** What we know: D-14 says phase merge blocks while queue non-empty. What's unclear: whether reap itself blocks (throws), allowing the orchestrator to catch and decide, OR whether reap always succeeds and the gate is purely the queue file's emptiness. Recommendation: reap always succeeds (returns `ReapResult { abandoned, incomplete }`); the gate is the queue file (D-14 verbatim). Orchestrator calls reap → reads queue → calls vcs.commit for phase-merge → adapter checks queue → throws `VcsIncompleteSubagentsError` if non-empty.
   - **RESOLVED:** workspace.reap() ALWAYS succeeds (returns `ReapResult { abandoned, incomplete }`). The phase-merge gate is the queue file emptiness check inside `vcs.commit({phaseMergeFor})`, NOT inside reap. Orchestrator call order: reap → review queue → vcs.commit({phaseMergeFor}) → adapter throws VcsIncompleteSubagentsError if non-empty. Adopted by plan 04 performJjReap + jj.ts commit() D-14 gate. Mirrored as D-29.

6. **Where does the orchestrator-side octopus helper live — `sdk/src/query/`, `sdk/src/vcs/jj/`, or `get-shit-done/bin/lib/`?** What we know: the helper coordinates `jj new -A -B`, `jj workspace add`, and `vcs.refs.bookmarks.create('gsd/phase-{N}', …)`. What's unclear: this is orchestrator logic, not adapter logic per se — does it belong inside the VCS module or alongside the workflow runners? Recommendation: planner picks; lean toward `sdk/src/vcs/jj/octopus.ts` (sidecar, zero-conflict upstream-rebase surface per UPSTREAM-02) with a CJS bridge via `dist-cjs/vcs/jj/octopus.js` for `bin/lib/*.cjs` consumers if needed in Phase 5.
   - **RESOLVED:** Helper lives at `sdk/src/vcs/jj/octopus.ts` (UPSTREAM-02 sidecar). CJS bridge via `dist-cjs/vcs/jj/octopus.js` is automatic from the existing build pipeline; bin/lib/*.cjs consumers in Phase 5 import through the bridge. Adopted by plan 05. Mirrored as D-30.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `jj` binary | Phase 4 jj backend impl + jj-colocated CI lane + jj-native CI lane | ✓ (locally + CI via Phase 3 D-14/D-15 install step) | 0.41.0 | — (hard dependency) |
| `git` | git backend (unchanged) + colocated detection | ✓ | (any) | — |
| Node `child_process` (via `vcsExec`) | every adapter invocation | ✓ | (stable) | — |
| Node `fs.openSync` with `O_EXCL` flag | hand-rolled `acquireWriteLock` | ✓ | (stable) | If hand-roll causes platform issues, fall back to `proper-lockfile` npm package (gated by slopcheck) |
| `proper-lockfile` (npm) | OPTIONAL alternative to hand-rolled lock | ✗ (not installed) | — | Hand-rolled `O_EXCL` is the default; no install needed |
| `acarapetis/jj-pre-push` (PyPI) | REFERENCE ONLY — design source for HOOK-04 inline replication | ✗ (not installed; CI-02 forbids Python runtime dep) | — | Inline ≈30 LOC Node replication in `sdk/src/vcs/backends/jj.ts` (or sidecar `sdk/src/vcs/jj/pre-push.ts`) |
| `bash` | hook script execution via `fireHook` (POSIX path) + Windows-shebang fallback (WR-04) | ✓ on CI lanes | (POSIX) | already handled by `fireHook` per `sdk/src/vcs/hook-bridge.ts:31-40` |

**Missing dependencies with no fallback:** none — `jj` is the only hard dep and it's already CI-installed.
**Missing dependencies with fallback:** `proper-lockfile` (fallback: hand-roll); `acarapetis/jj-pre-push` runtime install (fallback: inline replication — strongly preferred).

## Security Domain

### Applicable ASVS Categories

> Phase 4 is internal-tooling code on a developer/CI machine, not a network-facing service. ASVS categories that apply are those touching command argv construction, file-path handling, and hook script execution.

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | No user authentication surface; this is a CLI tool. |
| V3 Session Management | no | No sessions. |
| V4 Access Control | no | No multi-user authorisation. |
| V5 Input Validation | **yes** | Workspace name + path + bookmark name validation (cr-01 fold-in D-24). All values that reach the argv array MUST pass through a regex validator (`^[A-Za-z0-9][\w\-/.]*$` for bookmark names; absolute-path or relative-path-rooted-in-cwd check for workspace paths). `--` end-of-options separator MUST be inserted before any user-influenced value at argv positions where flags could be confused with values. |
| V6 Cryptography | no | No crypto operations introduced. |

### Known Threat Patterns for this Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Argv injection via crafted bookmark name (e.g., `-D`, `--force-delete`, `--push-option=…` passed as the `name` parameter with `raw:true`) | Tampering / Elevation of Privilege | Lifted `expr.bookmark()` validator REJECTS the name; `--` end-of-options separator inserted at argv positions; defense-in-depth tests for both backends. **Folded into Phase 4 via D-24 (cr-01).** [VERIFIED: Phase 3 03-REVIEW.md CR-01 is the source todo per CONTEXT canonical_refs] |
| Argv injection via crafted workspace path (e.g., `--no-confirm` passed as `path`) | Tampering | Path validated as relative-path-rooted-in-cwd OR absolute-path-rooted-in-allowed-workspace-base (planner picks specifics); `--` separator before path positional in `jj workspace add`. |
| Hook script reads commit message and execs based on content | Tampering / Elevation of Privilege | `fireHook` passes nothing of consumer-content origin; hook scripts treat commit content as data (already established by Phase 1 D-05 + research/PITFALLS.md security row). |
| `.envrc` token leakage into `jj describe` commit messages or `jj diff` outputs | Information Disclosure | Pre-commit hook scans for token patterns (existing project posture from CLAUDE.md); `.gitignore` includes `.envrc`. Phase 4 does NOT regress this. |
| Lock-file path traversal via crafted workspace name | Tampering | `acquireWriteLock(workspace)` MUST validate `workspace` against the same path-safety rules as `workspace.add`; reject names with `..`, leading `-`, or absolute-path forms unless explicitly permitted. |
| Shell-string concatenation in jj invocations | Tampering | JJ-02 invariant: argv-array invocation only; no shell strings. Already enforced by existing `vcsExec` shape (no `shell: true`). |
| Wrapper-recursion attack (Tier 2 concern) | — | DEFERRED to v2 / HOOK2-02. Phase 4 ships no `jj` wrapper, so no recursion guard needed yet. |

### CLAUDE.md-Specific Constraints (project rules)

| Rule (from /Users/LoganDark/Documents/Projects/get-shit-done/CLAUDE.md) | Phase 4 application |
|---|---|
| `gh` CLI always with `GITHUB_TOKEN` from `.envrc` | If Phase 4 plans introduce any `gh` invocation (unlikely; this is internal SDK code), prefix env. |
| Issue tracker lives in GitHub Issues; uses `.envrc` token | N/A for Phase 4 code — no issue manipulation. |
| Triage labels: `confirmed` (bugs) / `approved-enhancement` / `approved-feature` / `needs-reproduction` | N/A for code; relevant only for plan-completion follow-ups. |
| Domain docs: `CONTEXT.md` + `docs/adr/` at root | Phase 4 candidate new ADR: "jj workspace octopus structure + lazy fan-out" — planner picks whether to author. |

### Memory-Rule Constraints (apply to all Phase 4 work)

| Rule | Phase 4 application |
|---|---|
| "No raw git anywhere in jj-port" | Phase 4 workspace + hook code shells only `jj`; `fireHook` shells `bash`/the hook script (allowed). `scripts/lint-vcs-no-raw-git.cjs` stays at 0 violations. |
| "Squash model for GSD on jj — `jj squash` only, never `jj commit`" | Crash-recovery squash uses `jj squash -B @ -k -m '<msg>'` form. No `jj commit` introduced. |
| "Auto-snapshot allowed — never `--ignore-working-copy`" | Phase 4 D-15 mitigates the auto-snapshot footgun via "run probe from main workspace", NOT via `--ignore-working-copy`. JJ-03 invariant holds. |
| "No parallelization in THIS repo until migration" | Reframed by D-01: adapter ships parallel-ready; THIS repo stays sequential via Phase 3 D-17 sticky-adapter defaulting to git. |
| "Phase filenames follow SDK padded convention" | `04-RESEARCH.md`, `04-CONTEXT.md`, etc. (already followed in this file path). |
| ".planning/ commit-id → change-id migration" | Phase 4 adds `.planning/phases/{N}/incomplete-work.md` (change_id-native from day 1); logged via D-06. |
| "Verify jj conventions with user" | All Phase 4 conventions in CONTEXT were user-confirmed during discuss-phase; escalate if new conventions surface during planning/execution. |
| "Use git (not jj) until migration lands" | Applies to THIS repo's developer workflow; does NOT constrain adapter capability. |

## Sources

### Primary (HIGH confidence)

- Local `jj 0.41.0` empirical verification (this research session, 2026-05-13):
  - `jj new --help` — confirmed `-A`/`--insert-after` and `-B`/`--insert-before` flags accept multiple revsets and can be combined to create octopus merges.
  - `jj workspace add --help` — confirmed `<DESTINATION>` positional, `--name <NAME>`, `-r/--revision <REVSETS>` (multi-parent supported), `--sparse-patterns {copy,full,empty}`.
  - `jj workspace forget --help` — confirmed `<WORKSPACES>...` positional; "The workspace will not be touched on disk."
  - `jj workspace list --help` — confirmed `-T/--template`; **no `--no-graph` flag accepted** (rejection verified).
  - `jj diff --help` — confirmed `-r` and `--from`/`--to` are **mutually exclusive** (rejection verified during probe construction).
  - End-to-end create-workspace + forget + dir-persists test against jj 0.41 on macOS Darwin 25.5.0.
- `/Users/LoganDark/Documents/Projects/get-shit-done/sdk/src/vcs/backends/jj.ts` (lines 130-235 commit body; 500-548 push/fetch; 786-841 workspace stubs; 848-880 testOnly) — Phase 3 production code, read inline.
- `/Users/LoganDark/Documents/Projects/get-shit-done/sdk/src/vcs/backends/git.ts` (lines 50-51, 162-180, 430-577) — git backend workspace + push impl, read inline.
- `/Users/LoganDark/Documents/Projects/get-shit-done/sdk/src/vcs/hook-bridge.ts` — private `fireHook` helper, read inline.
- `/Users/LoganDark/Documents/Projects/get-shit-done/sdk/src/vcs/types.ts` (lines 130-300) — VcsWorkspace, HookStage, WorkspaceContext, error classes, read inline.
- `/Users/LoganDark/Documents/Projects/get-shit-done/sdk/src/vcs/parse/jj-workspace-list.ts` — NDJSON parser, read inline.
- `/Users/LoganDark/Documents/Projects/get-shit-done/get-shit-done/workflows/execute-phase.md` (lines 522-735) — orchestrator subagent dispatch site, read inline.
- `/Users/LoganDark/Documents/Projects/get-shit-done/get-shit-done/bin/lib/worktree-safety.cjs` — existing workspace-safety helpers, read inline.
- `/Users/LoganDark/Documents/Projects/get-shit-done/.github/workflows/test.yml` (lines 60-170) — Phase 3 CI matrix shape, read inline.
- `/Users/LoganDark/Documents/Projects/get-shit-done/.planning/research/PITFALLS.md` — Pitfalls 1-14, read inline. Pitfalls 1/2/3/4/5/7/9/10/11/12 directly relevant to Phase 4.
- `/Users/LoganDark/Documents/Projects/get-shit-done/.planning/REQUIREMENTS.md` — WS-01..13, HOOK-01..05, CI-04, JJ-03, CI-02 (constraint), read inline.
- `/Users/LoganDark/Documents/Projects/get-shit-done/.planning/phases/04-workspaces-octopus-structure-hooks/04-CONTEXT.md` — D-01..D-24 locked decisions, read inline.

### Secondary (MEDIUM confidence)

- [Jujutsu — Working copy](https://docs.jj-vcs.dev/latest/working-copy/) — auto-snapshot semantics; `update-stale` behaviour; "files can be deleted from disk separately" confirmation for `workspace forget`.
- [jj-workspace-add(1) — Arch manual pages](https://man.archlinux.org/man/extra/jujutsu/jj-workspace-add.1.en) — flag enumeration cross-check.
- [acarapetis/jj-pre-push (GitHub)](https://github.com/acarapetis/jj-pre-push) — reference implementation for HOOK-04; Python tool with `jj-pre-push push` CLI replacing `jj git push`; supports pre-commit framework + prek/hk via `--checker` flag.

### Tertiary (LOW confidence — flagged for validation during planning)

- [Better Merge Workflow with Jujutsu — Benjamin Tan](https://ofcr.se/jujutsu-merge-workflow) — practitioner blog on multi-parent `jj new` for octopus merges; useful context, not the primary source (Arch man page + local `jj new --help` are authoritative).
- [Jujutsu Megamerges and jj absorb — Chris Krycho](https://v5.chriskrycho.com/journal/jujutsu-megamerges-and-jj-absorb/) — practitioner blog on megamerge workflows.

## Metadata

**Confidence breakdown:**
- **Standard stack:** HIGH — every dep is either already in the codebase or pinned by Phase 3.
- **Architecture patterns:** HIGH — every pattern is a wiring change on top of existing Phase 1/2/2.1/3 primitives, read inline and locally verified.
- **jj command semantics (workspace add/forget/list, new -A -B, diff --from --to, squash -k):** HIGH — every behaviour locally verified against jj 0.41.0 this session.
- **Empty-tree probe (corrected from CONTEXT D-12 sketch):** HIGH — CONTEXT's `jj diff -r <head> --from <parent>` form is rejected by jj 0.41; corrected form `jj diff --from <parent> --to <head> -s` verified locally.
- **`acquireWriteLock` sentinel placement:** MEDIUM (A2 assumption) — needs empirical concurrent-acquire test to confirm no interference with jj internal serialisation.
- **`acarapetis/jj-pre-push` trigger logic for inline replication:** MEDIUM (A4 assumption) — needs source-read during implementation to confirm replication parity in edge cases.
- **Colocated jj export firing git hooks automatically (A3):** MEDIUM — needs colocated regression test in Phase 4 plans.
- **Hook stage enumeration (`pre-commit`/`pre-push` only — D-09):** HIGH — REQUIREMENTS HOOK-01 locks the stage enum; HookStage type at `sdk/src/vcs/types.ts:157` already shaped.
- **CI matrix shape:** HIGH — Phase 3 plan 03-07 already added the matrix axis structure; Phase 4 only adds one more cell with `continue-on-error: true`.
- **Pitfalls inventory:** HIGH — every pitfall maps to a specific empirically-verified or codebase-read behaviour.
- **Security domain (cr-01 fold-in):** HIGH — Phase 3 03-REVIEW.md CR-01 is the source; D-24 explicitly scopes the fix.

**Research date:** 2026-05-13
**Valid until:** 2026-06-13 (30 days for stable jj 0.41.0 pin; if a 0.42+ release lands earlier than that and is consumed via Renovate, re-verify the `jj workspace add`/`jj new -A -B`/`jj diff --from --to` empirical behaviours against the new version).
