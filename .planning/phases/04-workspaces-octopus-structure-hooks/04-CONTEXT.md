# Phase 4: Workspaces + Octopus Structure + Hooks - Context

**Gathered:** 2026-05-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Land the orchestrator-creates-heads-and-workspaces flow with lazy octopus-merge structure, batch reap of empty heads, workspace-path-safety guards, concurrency primitives (per-workspace flock), and v1 hook strategy (Tier 1: colocated default no-op + non-colocated direct fire). Production-ready for multi-subagent parallel fan-out on jj, even though this repo stays git-only until the migration phase flips the sticky adapter.

**In Phase 4:**
- `vcs.workspace.{add,forget,list,context,prune}` full implementations on jj (replacing Phase 3's NotImplementedError stubs at `sdk/src/vcs/backends/jj.ts:791-840`)
- Orchestrator-side helpers for the lazy `parent + merge` octopus structure (created on first subagent fan-out; single-plan phases stay linear chains)
- Per-subagent head creation (`jj new -A parent -B merge -m 'subagent N'`) and matching workspace (`jj workspace add -r <head_id> --name phase-{N}-subagent-{idx}`)
- End-of-phase batch reap: `jj show` each tracked head → `jj abandon` if empty → `jj workspace forget` all in one pass; non-empty heads surfaced for review
- WS-12 crash recovery: empty-tree probe via `jj diff -r <head_id> --from <parent>`; non-empty crashed work squashed as `'subagent N: incomplete work'` preserving `-k`; appended to `.planning/phases/{N}/incomplete-work.md` queue; phase merge blocks while queue non-empty
- Concurrency: `vcs.acquireWriteLock(workspace)` per-workspace flock primitive on jj (no-op on git, kernel-enforced via index.lock); RAII release-handle; 30s default timeout
- Workspace-path-safety guards preserving spirit of `bug-3097/3099/2774/2075` on jj workspaces
- Hooks wired internally: `vcs.commit()` fires `pre-commit` after every `jj squash`; `vcs.push()` fires `pre-push`; colocated mode no-ops (git's `.git/hooks/pre-commit` fires via colocation); non-colocated mode adapter triggers `.githooks/<stage>` directly via the existing `fireHook` private helper in `sdk/src/vcs/hook-bridge.ts`
- SDK query bridge (`gsd-sdk query hooks.fire <stage>` or similar — planner picks exact name) for orchestrator-layer explicit-fire callers (post-wave validation `execute-phase.md:682-695` currently calls raw `git hook run pre-commit`)
- jj-pre-push integration on `jj git push` (acarapetis/jj-pre-push-style; planner picks shape — wrapper module vs inline replication of pre-push trigger logic)
- jj-native CI matrix lane added with `continue-on-error: true` (third axis alongside git + jj-colocated); graduates to required-blocking in Phase 5
- Cross-backend refname validator for `refs.bookmarks.{create,move,delete,exists}` when `opts.raw === true` (folds `cr-01` TODO; `--` end-of-options separator inserted at argv positions; defense-in-depth tests for both backends)
- `.planning/` format-migration tracker (Phase 3 D-19) extended for any new revision-id-encoding surfaces introduced (e.g., `.planning/phases/{N}/incomplete-work.md` records change_ids)

**Not in Phase 4 (owned elsewhere):**
- Cross-workspace coordination primitives (e.g., `vcs.acquireRepoLock()` for shared-ancestor rebase flows) — caller-side serialisation at the GSD layer per Pitfall 4 rec; revisit when a real flow needs it
- HOOK-05 Tier 2 PATH-shim wrapper (`jj-with-hooks` binary) — deferred to v2 per REQUIREMENTS; v1 interface shaped to accommodate without breaking change
- `/gsd-migrate-to-jj` command + `.planning/` SHA → change_id rewriter — Phase 4.5 or 6 (TBD via `/gsd-phase`)
- Workflow markdown / agent prompt rewrites (PROMPT-01..03) and command-level translations (CMD-01..11) — Phase 5
- Brownfield dogfood validation on this very repo — Phase 5
- CI graduation from allow-failure to required-blocking (both jj-colocated and jj-native) — Phase 5
- Parallel-dispatch activation in THIS repo — held by sticky `vcs.adapter: git` default + memory rule until migration phase

</domain>

<decisions>
## Implementation Decisions

### Parallelization Posture

- **D-01 (Build full multi-workspace infra now, do not activate in this repo):** Phase 4 ships WS-01..13 + HOOK-01..05 + concurrency primitives fully production-ready for parallel multi-subagent dispatch on jj. The "No parallelization yet" memory rule was per-this-repo (git-only until migration), not architectural. This repo's `vcs.adapter` stays `git` (Phase 3 D-17 sticky default) until the migration phase flips it. After flip, parallel fan-out is unblocked end-to-end.
- **D-02 (Sequential dispatch is a config posture, not a Phase 4 omission):** Whether Claude's orchestrator dispatches sequentially or in parallel waves is governed by existing `workflow.parallelization` / per-plan worktree gates in `execute-phase.md`. Phase 4 ensures the adapter+workspace+hook substrate is correct under either posture. No new sequential-only flag added in Phase 4.

### Orchestrator State Model

- **D-03 (No JSON sidecar; workspace-name is canonical key):** Per-subagent state (head change_id, workspace path, dispatch label) is derived entirely from `vcs.workspace.list()` plus the workspace-name convention. Mirrors the git pattern at `execute-phase.md:705` (worktree directory under `.claude/worktrees/agent-<id>` with branch `worktree-agent-<id>` is the canonical key — no sidecar file exists today). On jj, `jj workspace list` returns `{name, atChange}` which is enough to reconstruct everything for reap.
- **D-04 (Workspace-name convention: `phase-{N}-subagent-{idx}`):** Orchestrator creates each subagent workspace with `jj workspace add <path> --name phase-{N}-subagent-{idx}`. `{idx}` is monotonic within a phase (1-based). Inclusion-filter for reap queries `vcs.workspace.list()` and matches `^phase-{N}-subagent-` prefix (mirrors #2774 inclusion-filter pattern, NOT exclusion).
- **D-05 (Bookmark namespace mirrors phase only, not subagents):** `gsd/phase-{N}` advances to the merge change at phase close (WS-09). Individual subagent heads are NOT bookmarked — the workspace-name carries that identity. Reduces bookmark churn and keeps `bookmarks.list()` cheap to enumerate (only phase-level bookmarks, not per-subagent). Trade-off accepted: `jj log` doesn't show subagent labels via bookmarks; humans see them via `jj workspace list` and the per-head commit description (`'subagent N'`).
- **D-06 (No change_id sidecar — D-19 surface is small):** The only Phase 4 D-19 entry is `.planning/phases/{N}/incomplete-work.md` (crash queue records change_ids; change_id-native from day 1). No other persistent format encodes revision IDs.

### Hooks API Shape

- **D-07 (Internal-only auto-fire; no public re-add of `vcs.hooks.*`):** Phase 2.1 D-07 deleted the public `vcs.hooks` namespace; Phase 4 keeps it deleted. The private `fireHook` helper in `sdk/src/vcs/hook-bridge.ts` is invoked internally by `vcs.commit()` after each `jj squash` and by `vcs.push()` before each push. No public verb is re-added.
- **D-08 (SDK query bridge for explicit-fire callers):** Orchestrator workflows that currently call raw `git hook run pre-commit` (`execute-phase.md:689` — post-wave validation when `workflow.worktree_skip_hooks=true`) need a cross-backend equivalent. Phase 4 ships an SDK query (e.g., `gsd-sdk query hooks.fire pre-commit`) that calls the private `fireHook`. Workflow markdown rewrites are Phase 5's PROMPT-* scope; Phase 4 ships the query, Phase 5 calls it. Exact query name and signature: planner's discretion.
- **D-09 (Hook stages remain `pre-commit` and `pre-push` only):** HOOK-01's stage enum is unchanged from Phase 1 `HookStage` type. No new stages added (e.g., `post-merge`, `pre-rebase`) — out of scope; revisit when a real caller needs them.
- **D-10 (Colocated detection via existing adapter shape):** "Colocated" = `.git` and `.jj` both present at the adapter's cwd (or above). Already detected by `createVcsAdapter` auto-detect in Phase 1/3. Hook firing branches on this same signal: colocated → no-op for `pre-commit` (git's `.git/hooks/pre-commit` fires via colocation when `.git` is updated by post-squash `jj git export`); non-colocated → adapter shells `.githooks/pre-commit` directly. Pre-push fires in both cases via the `jj git push` integration regardless of colocation.

### Crash Recovery Semantics (WS-12)

- **D-11 (Detection: Agent() exit + missing SUMMARY.md commit):** Orchestrator detects a crashed subagent the same way git side does: `Agent(isolation='worktree')` returns non-success OR the subagent didn't commit its required SUMMARY.md (per `execute-phase.md:569`). Mirrors git executor's existing crash-detection — no new mechanism invented for jj.
- **D-12 (Empty-vs-real-work probe via `jj diff -r <head_id> --from <parent>`):** Before reap, adapter runs `jj diff -r <head_id> --from <parent_change>` on each tracked subagent head. Empty diff → `jj abandon <head_id>`. Non-empty diff → squash the head as `'subagent N: incomplete work'` (using `-k` to preserve change_id reachability); workspace is NOT forgotten; entry appended to crash queue.
- **D-13 (Crash queue at `.planning/phases/{N}/incomplete-work.md`):** Markdown file with entries `- {subagentName}: head={change_id_short}, workspace={path}, reason={crash_reason}`. Appended atomically by the orchestrator after the empty-tree probe. File is gitignored from the squash-into-phase-commit (it's transient orchestrator state, not part of phase deliverables).
- **D-14 (Phase merge blocks while queue non-empty):** When orchestrator attempts the phase-merge squash (advancing `gsd/phase-{N}` to the merge change per WS-09), the adapter checks for non-empty `.planning/phases/{N}/incomplete-work.md` and errors with a typed `VcsIncompleteSubagentsError` listing the entries. Human acks by emptying the file (deleting the entries they've reviewed); re-running the merge then succeeds. No silent partial-completion.
- **D-15 (Auto-snapshot does not produce false-positives):** Because jj auto-snapshot fires on every `jj` command (PITFALLS Pitfall 2), naively running `jj show -r <head_id>` from inside the subagent's workspace would always show snapshot content. The `jj diff -r <head_id> --from <parent>` probe is run from the **orchestrator's workspace** (or via `-R <repo>` from a neutral cwd), so it inspects the head's committed tree, not a freshly-snapshotted working copy. Adapter implementation MUST ensure the probe never runs in a context that re-snapshots the head being inspected.

### Workspace Path Layout

- **D-16 (`.claude/jj-workspaces/phase-{N}-subagent-{idx}/`):** Verified on jj 0.41: nested workspaces work cleanly (parent's auto-snapshot correctly excludes the nested workspace path, just like `.jj/`). Mirrors Claude Code's `.claude/worktrees/agent-*` convention so the existing #2774 inclusion-filter pattern reuses directly. `.claude/` is already gitignored at the repo level.
- **D-17 (Adapter `mkdir -p` parent before `jj workspace add`):** `jj workspace add` does NOT auto-create intermediate directories (verified empirically). The adapter's `vcs.workspace.add(path, …)` must `mkdir -p` the parent dir before invoking `jj workspace add`. Failure to do so produces "Cannot access … No such file or directory" errors at the wrong layer.
- **D-18 (Path layout is hard-coded for v1):** No `workflow.workspace_path_template` config knob in Phase 4. If a downstream workflow needs to override, add the knob then. YAGNI.

### Concurrency Primitive (Pitfall 4)

- **D-19 (`vcs.acquireWriteLock(workspace)` — per-workspace flock only):** Adapter exposes a single primitive per-workspace. On jj backend: advisory `flock` on the workspace's `.jj/working_copy/checkout` sentinel (same lock jj itself uses for snapshot serialisation). On git backend: no-op (kernel-enforced via `.git/index.lock`). Returns a release-handle (RAII pattern; caller `using` or explicit `release()`). Default timeout 30s; configurable per-call.
- **D-20 (No cross-workspace primitive in v1):** No `vcs.acquireRepoLock()` for shared-ancestor coordination. Per Pitfall 4's "serialize at GSD layer" rec: orchestrator (or higher-layer GSD code) sequences mutations that touch shared ancestors. Add the cross-workspace primitive only when a real flow surfaces that needs it; revisit during dogfood post-migration.
- **D-21 (Stale-WC handling is part of write-lock acquisition path):** When `acquireWriteLock` is called and the workspace's `@` is stale (jj #7538), the adapter automatically runs `jj workspace update-stale` as part of acquisition. No separate `vcs.recoverStaleWorkspace()` primitive. Stale recovery is invisible to callers under normal flow; surfaced via warning log only.

### CI Matrix

- **D-22 (Add jj-native lane with `continue-on-error`):** Third matrix axis on the existing CI workflow: `jj-native`. Fixture: `jj git init --no-git` (or `jj init`) in a tmp dir, no `.git` present. HOOK-03 non-colocated direct-fire path gets CI coverage. Allow-failure during Phase 4 (matches jj-colocated's posture from Phase 3 D-11); graduates to required-blocking in Phase 5 alongside jj-colocated.
- **D-23 (CI pin and install reuse Phase 3 D-14/D-15):** jj 0.41 pinned via the same release-tarball install step Phase 3 landed. No new install path; just an additional axis on the matrix.

### Folded Todos

- **D-24 (Fold `cr-01-raw-bookmark-argv-injection` into Phase 4):** `.planning/todos/pending/cr-01-raw-bookmark-argv-injection.md` resolves in this phase. Cross-backend refname validator (likely the existing `expr.bookmark()` validator, lifted into a shared module) wired into BOTH `git.ts` and `jj.ts` `refs.bookmarks.{create,move,delete,exists}` write paths when `opts.raw === true`. `--` end-of-options separator inserted at argv positions where the name follows possible flags. Defense-in-depth: validator also applied to non-raw paths (the `gsd/` prefix is incidental protection, not contract). Tests added to both backends with `vcs.adapter` matrix coverage; named pattern `-D`, `--force-delete`, `--push-option=…` as `name` with `raw:true` and assert REJECTION. No raw-git lint regressions.
- **Relevance to Phase 4 scope:** Orchestrator-state encoding uses bookmarks under the `gsd/phase-{N}` namespace (D-05). Although those are namespaced and pass through the `gsd/` prefix path (safe by happy accident), Phase 4 is the natural slot to harden the surface before further fan-out flows depend on it.

### Claude's Discretion

- **SDK query bridge name for D-08:** Planner picks. Likely `gsd-sdk query hooks.fire <stage>` or `gsd-sdk query hooks.fire-post-wave`. Whatever the planner picks must be reachable from workflow markdown (which Phase 5 rewrites).
- **jj-pre-push integration shape (HOOK-04):** Planner picks. Options: (a) install `acarapetis/jj-pre-push` as a runtime dep, (b) inline a minimal replication of its trigger logic, (c) shell out to a vendored script. Whatever the planner picks must not require Rust toolchain (per CI-02 release-tarball rule for runtime cost).
- **Workspace name slug for `--name` flag:** Per D-04, the canonical form is `phase-{N}-subagent-{idx}`. Whether `{N}` is zero-padded (`04-subagent-1`) or unpadded (`4-subagent-1`) is planner's call. Memory says directories use zero-padded SDK convention — applying that here gives `phase-04-subagent-1` (zero-padded). Lean toward consistency with directory naming.
- **Crash queue ordering / dedup:** Whether `.planning/phases/{N}/incomplete-work.md` allows duplicate entries (same subagent reaped twice on retry) is planner's call. Likely append-only with implicit dedup via human review.
- **`VcsIncompleteSubagentsError` shape:** Planner picks exact error class name and recovery hints (e.g., "delete entries from incomplete-work.md after review").
- **Empty-tree probe placement:** Whether the probe runs in `vcs.workspace.reap()` (a new verb that batches probe+abandon+forget) or as caller-orchestrated `vcs.diff` + `vcs.workspace.forget` is planner's call. Lean toward a single `vcs.workspace.reap()` verb so the auto-snapshot caveat (D-15) is centralised in one place.
- **Test-fixture extensions for multi-workspace flows:** `vcsTest(kind)` fixture (Phase 1 D-14) currently covers single-workspace cases. Planner picks how to extend for multi-workspace contract tests (likely a new `vcsMultiWsTest(kind, n)` factory that pre-creates `n` workspaces in the fixture).
- **Workspace-path-safety guard transposition (WS-13):** Which of `bug-3097/3099/2774/2075` are reformulated for jj workspaces vs declared git-only (per Phase 3 D-16 / `docs/test-triage/jj-bugs.md`). Planner audits each test during execution; results land in the same triage doc.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project / Phase Scope
- `.planning/PROJECT.md` — Core value, key decisions, "no parallelization yet" memory clarified as per-this-repo (see D-01)
- `.planning/REQUIREMENTS.md` — WS-01..13, HOOK-01..05, CI-04 (Phase 4 owns); v1 vs v2 split for HOOK2-* and JJOP-*
- `.planning/ROADMAP.md` §"Phase 4: Workspaces + Octopus Structure + Hooks" — Phase boundary, depends-on (Phase 3), success criteria 1-5
- `.planning/STATE.md` — Phase 3 complete + Phase 03.1 closed; Phase 4 next in execution order

### Pre-Phase Intel
- `.planning/intel/vcs-adapter-surface-audit.md` — `VcsWorkspace` and `VcsHooks` rows; `gitDir`/`gitCommonDir` moved to gitOnly per Phase 2.1 D-18
- `.planning/intel/git-touchpoints.md` — Worktree mention counts (139 in sdk/src) inform PROMPT-* scope (Phase 5)

### Prior Phase Context (load decisions, do NOT re-decide)
- `.planning/phases/01-adapter-foundation-git-backend/01-CONTEXT.md` — `VcsWorkspace` shape, `HookStage` type, baseline `fireHook` private helper in hook-bridge.ts
- `.planning/phases/02.1-vcs-abstraction-audit-drop-git-only-concepts/02.1-CONTEXT.md` — **D-07 deleted public `vcs.hooks.*` namespace** (Phase 4 D-07 keeps it deleted); D-18 moved `gitDir`/`gitCommonDir` to `vcs.gitOnly`; `currentBookmarks(): string[]` shape locked
- `.planning/phases/03-jj-backend-core-squash-refs-conflict/03-CONTEXT.md` — **PRIMARY UPSTREAM.** D-01..D-04 bookmark surface (`gsd/` prefix is adapter-internal, `{raw:true}` escape, `VcsBookmarkDivergentError`); D-05 strict-never on `--ignore-working-copy`; D-08 shape-commit-first idiom; D-13 jj-native deferred to Phase 4 (this phase activates); D-16 per-test bug-triage in `docs/test-triage/jj-bugs.md`; D-17 sticky `vcs.adapter` defaults git when both present; D-19 format-migration tracker (Phase 4 extends with `incomplete-work.md` per D-06)
- `.planning/phases/03-jj-backend-core-squash-refs-conflict/03-REVIEW.md` § CR-01 — Source of the cr-01 TODO folded by D-24

### Architecture, Stack, Pitfalls
- `.planning/research/ARCHITECTURE.md` — Adapter layering rules; workspace seam preserved
- `.planning/research/STACK.md` — jj flag conventions (`--repository`, `--no-pager`, `--color never`, `--quiet`), NDJSON template; **`--ignore-working-copy` recommendation is overridden by Phase 3 D-05 and stays overridden in Phase 4**
- `.planning/research/PITFALLS.md` — **PRIMARY READING.** Pitfall 1 (interleaving git+jj — Phase 4 jj.ts shells only jj per memory + lint guard); Pitfall 2 (auto-snapshot footgun — Phase 4 D-15 mitigates for crash probe); **Pitfall 3** (jj workspace ≠ git worktree semantic mapping — WS-13 + bug-triage transposition); **Pitfall 4** (no `.git/index.lock` analog — Phase 4 D-19/D-20/D-21 partial resolution; full cross-workspace primitive deferred); **Pitfall 5** (hook implementation strategy re-litigation — Phase 4 commits to Tier 1 colocated+non-colocated direct-fire, Tier 2 wrapper deferred); Pitfall 6 (skip-not-port — Phase 4 follows TEST-06 skip-count guard from Phase 1); Pitfall 7 (adapter leak audit — workspace return types stay VCS-neutral); Pitfall 8 (upstream rebase — workspace code lives in `sdk/src/vcs/jj/` sidecar from Phase 2.1)
- `.planning/research/FEATURES.md` — Per-command translation table (worktree → workspace mappings)

### Phase 4 Code Surfaces (IMPLEMENT against these)
- `sdk/src/vcs/types.ts` — `VcsWorkspace` interface (already shaped); Phase 4 adds `acquireWriteLock` to the adapter surface and `VcsIncompleteSubagentsError`/`VcsBookmarkDivergentError` (latter already from Phase 3) error types; new `vcs.workspace.reap()` verb (per Claude's-discretion above)
- `sdk/src/vcs/backends/jj.ts` — **PRIMARY EDIT TARGET.** Replace workspace stubs at lines 791-840 (`workspace.add`, `workspace.forget`, `workspace.prune` currently throw `VcsNotImplementedError`; `workspace.list` and `workspace.context` are real but minimal). Wire `fireHook` invocation into `commit()` and `push()` paths. Add concurrency primitive.
- `sdk/src/vcs/backends/git.ts` — Mirror surface additions (`acquireWriteLock` no-op, `workspace.reap` mapped to existing `git worktree` cleanup loop, hook-bridge wired for symmetric internal auto-fire path). Refname validator integration for cr-01 fold-in.
- `sdk/src/vcs/hook-bridge.ts` — Phase 1's private `fireHook` consumed verbatim; no shape change. Comments referencing "Phase 4 will wire" become live wiring.
- `sdk/src/vcs/index.ts` — `createVcsAdapter` factory: no shape change beyond Phase 3 D-17 sticky-adapter reading
- `sdk/src/vcs/expr.ts` — Existing `expr.bookmark()` validator lifted into a shared module for cr-01 fold-in (D-24)
- `sdk/src/vcs/parse/jj-workspace-list.ts` — Phase 3 parser; Phase 4 confirms shape matches multi-workspace cases (`atChange` field is what D-03 relies on)
- `sdk/src/query/workspace.ts` — Workspace-aware planning path resolution; unchanged in Phase 4 unless the SDK query bridge for hooks (D-08) lives here
- `get-shit-done/bin/lib/worktree-safety.cjs` — Git side's worktree-safety guards (323 LOC); jj equivalent absorbed into `vcs.workspace.*` per WS-13. The existing `snapshotWorktreeInventory` / `planWorktreePrune` / `executeWorktreePrunePlan` shapes inform the jj impl.
- `get-shit-done/bin/lib/planning-workspace.cjs` — Planning-workspace pathing (separate from VCS workspaces); unchanged in Phase 4
- `get-shit-done/workflows/execute-phase.md:682-728` — Post-wave hook validation + worktree cleanup; Phase 4 does NOT rewrite this (Phase 5's PROMPT-* owns), but the SDK query bridge (D-08) is shaped to fit what Phase 5 will substitute in

### Test Surfaces
- `tests/helpers.cjs` — `vcsTest(kind)` fixture; Phase 4 extends for multi-workspace contract tests (Claude's-discretion: planner shape)
- `sdk/src/vcs/__tests__/baseline-parity.test.ts` — Phase 4 adds workspace-add/forget/list/reap rows; jj-colocated AND jj-native axes
- `sdk/src/vcs/__tests__/adapter-contract.test.ts` — Per-verb allowlist (Phase 3 D-12) flips workspace verbs from NotImplemented to active on jj
- `sdk/src/vcs/__tests__/jj-workspace.test.ts` — Existing Phase 3 stub-tests; Phase 4 fills in real assertions for multi-workspace flows
- `docs/test-triage/jj-bugs.md` — Phase 4 audits worktree-bug tests under jj workspaces (WS-13); each verdict (jj-mapped / git-only / carries-verbatim) appended
- `tests/baselines/jj-vcs/` — Layout established in Phase 3; Phase 4 adds workspace baselines

### Lint / CI / Build
- `scripts/lint-vcs-no-raw-git.cjs` — Phase 4 must NOT add allowlist entries (mirrors Phase 3 invariant). If a Phase 4 plan trips it, that's a bug in the plan.
- `.github/workflows/*.yml` — Phase 4 adds `jj-native` matrix axis with `continue-on-error: true`; planner picks the workflow file (likely the same one Phase 3 D-15 modified)
- `sdk/tsconfig.cjs.json` — Unchanged unless new parser files require re-listing in `files` array

### ADRs
- `docs/adr/0004-worktree-workstream-seam-module.md` — Worktree seam; Phase 4 EXTENDS to cover jj workspaces (not a rewrite)
- `docs/adr/0006-planning-path-projection-module.md` — Planning path resolution; unaffected
- `docs/adr/0007-sdk-package-seam-module.md` — SDK-to-bin/lib seam; new `acquireWriteLock` and any new `vcs.workspace.reap()` flow through it
- **New ADR candidate** (planner picks whether to write): "jj workspace octopus structure + lazy fan-out" — captures D-04, D-05, the parent+merge slot pre-creation, the workspace-name convention

### Project Conventions
- `CLAUDE.md` (repo root) — `.envrc` GITHUB_TOKEN rule
- `CONTEXT.md` (repo root) — Lint-rule recipes
- `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`, `docs/agents/domain.md` — Agent skills referenced from CLAUDE.md

### Memory Rules (apply to all Phase 4 work)
- "No raw git anywhere in jj-port" — jj workspace impls shell only `jj`; lint guard whole-repo default-deny
- "Squash model for GSD on jj" — `jj squash` only (never `jj commit`); WC snapshots allowed (never `--ignore-working-copy` per Phase 3 D-05); **hooks fire INSIDE squash per HOOK-02** — Phase 4 wires this
- "Verify jj conventions with user" — Phase 4 conventions locked in this CONTEXT.md were user-confirmed during discuss-phase; escalate if a new convention surfaces during planning/execution
- "No parallelization yet" — **reframed by D-01**: still applies to THIS repo's execution until migration phase, but does NOT scope down Phase 4's adapter surface. Adapter MUST be parallel-ready.
- "Phase filenames follow SDK padded convention" — `04-*` directory + files
- ".planning/ commit-id → change-id migration" — Phase 4 D-06 adds `.planning/phases/{N}/incomplete-work.md` to the format-migration tracker (change_id native from day 1; no rewrite needed by migration phase)
- "Use git (not jj) until migration lands" — applies to THIS repo's developer workflow; does NOT constrain what the adapter can do

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **Phase 3 jj backend (`sdk/src/vcs/backends/jj.ts`, ~1k LOC):** Workspace stubs at lines 791-840 are the primary edit target. Adapter shape, exec wrapper consumption, `jjArgv()` mandatory-flags helper, NDJSON parsing flow — all reused verbatim.
- **`fireHook` private helper (`sdk/src/vcs/hook-bridge.ts`):** Phase 1 D-05 ships it; Phase 2.1 D-07 hard-removed the public namespace but kept the helper. Phase 4 wires calls from inside `commit()` (post-squash) and `push()` (pre-push) on both backends. JSDoc already says "Phase 4 wires internal invocations" — those comments become live.
- **`vcsExec` wrapper (`sdk/src/vcs/exec.ts`):** argv-array only; jj workspace ops use it verbatim per JJ-02 (no shell strings).
- **`jjArgv()` helper:** Phase 3 helper that prefixes `--repository`, `--no-pager`, `--color never`, `--quiet`. Phase 4 workspace ops use it.
- **`expr.bookmark()` refname validator (`sdk/src/vcs/expr.ts`):** Existing validator that the `gsd/` prefix path uses. cr-01 fold-in (D-24) lifts it into a shared module callable from both backends' `refs.bookmarks.*` write paths when `opts.raw === true`.
- **`createGitAdapter` workspace impl (`sdk/src/vcs/backends/git.ts`):** Reference for the shape; jj workspace ops mirror its `{ exitCode, stdout, stderr }` flow.
- **`snapshotWorktreeInventory` / `planWorktreePrune` / `executeWorktreePrunePlan` (`get-shit-done/bin/lib/worktree-safety.cjs`):** Git-side worktree inventory + planned-prune patterns. Phase 4's jj equivalent should mirror these — particularly the "plan, then execute" split that lets the orchestrator preview reap before committing.
- **`parseJjWorkspaceList` (`sdk/src/vcs/parse/jj-workspace-list.ts`):** Phase 3 parser; emits `{name, atChange}` per workspace. D-03 relies on this.
- **`vcsTest(kind)` fixture pattern (Phase 1 D-14):** Multi-workspace tests extend the same fixture per Claude's-discretion above.

### Established Patterns

- **Pure CJS in `bin/lib`, ESM TS in `sdk/src`, `dist-cjs/` bridge:** Unchanged.
- **`{ exitCode, stdout, stderr, timedOut, error }` exec return shape:** Workspace ops conform.
- **Per-file commit history with explicit per-file commit messages (Phase 2 D-05 + D-06):** Carries to Phase 4. The shape commit may bundle types+jj-backend+git-backend per Phase 2.1 D-21 verb-shape-change exception; planner picks.
- **Mechanical-only invariant + verb-shape exception (Phase 2 D-08 / Phase 2.1 D-21):** Phase 4 qualifies for the shape-commit exception (adding `acquireWriteLock` to the adapter surface; new `workspace.reap()` verb).
- **Branch-by-Abstraction call-site swaps:** N/A — Phase 4 fills existing surface, doesn't refactor call sites.
- **NDJSON parsing convention (`-T 'json(self) ++ "\\n"' --no-graph`):** Workspace.list already uses it; reap probe (`jj diff`) does NOT — uses default unified diff format (planner confirms).
- **Argv-array invocation only (JJ-02):** No shell strings; `jj diff -r <id> --from <parent>` passes each arg separately.
- **Mandatory jj flags via `jjArgv()`:** Every Phase 4 jj invocation uses it.
- **Inclusion-filter for workspace enumeration (#2774):** Workspace-name prefix match (`^phase-{N}-subagent-`) per D-04 — NEVER an exclusion filter.

### Integration Points

- **`sdk/src/vcs/types.ts` adapter surface:** Phase 4 adds `acquireWriteLock(workspace: string, opts?: { timeout?: number }): Promise<{ release(): void }>` and (Claude's-discretion) `vcs.workspace.reap(opts: { phaseNamePrefix: string }): Promise<ReapResult>`. Both backends accept; semantics differ.
- **`createVcsAdapter` factory:** No shape change beyond Phase 3 D-17 sticky-adapter (already shipped).
- **`bin/lib/*.cjs` consumers:** Pick up new verbs through `dist-cjs/vcs`. Existing callers (worktree-safety.cjs's `vcs.workspace.context()` consumer) unaffected.
- **Hook firing inside `commit()`:** Adds a post-squash call to `fireHook(cwd, 'pre-commit', {…})` in jj backend's `commit()` and a pre-`git commit` call in git backend's `commit()` (latter mostly a no-op since git itself fires `.git/hooks/pre-commit` — but the adapter's `--no-verify` opt-out logic moves here for symmetry). When `noVerify === true`, both backends skip the fire and (on git) pass `--no-verify` to the command line.
- **Hook firing inside `push()`:** jj `vcs.push()` invokes `fireHook(cwd, 'pre-push', {…})` before `jj git push`. Git side relies on git's own pre-push hook firing via `git push`; explicit `fireHook` only fires when `noVerify === false` AND a non-default flow needs it. Planner audits whether git push needs an explicit fire or stays implicit.
- **SDK query bridge (D-08):** New SDK query under `sdk/src/query/` that calls the private `fireHook`. Planner picks the exact location (`sdk/src/query/hooks.ts`? Or inline in `helpers.ts`?). Reachable from CLI via `gsd-sdk query <name>`.
- **Lint guard (`scripts/lint-vcs-no-raw-git.cjs`):** Phase 4 must NOT add entries. The jj workspace impl shells only `jj`. Hook-bridge already shells `bash`/the hook script directly (Phase 1 D-05) — that's allowed by the guard (not a `git` invocation).
- **Sticky `vcs.adapter` config (Phase 3 D-17):** Phase 4 adapter surface ships dormant in this repo until the migration phase flips it. CI matrix exercises both backends regardless of repo posture.

</code_context>

<specifics>
## Specific Ideas

- **Plan structure:** ~5-7 plans likely, mirroring Phase 3's verb-group sequencing. Suggested order (planner adjusts):
  1. **Shape commit** — types.ts additions (`acquireWriteLock`, `VcsIncompleteSubagentsError`, optional `workspace.reap`), jj.ts workspace impl skeleton (replacing NotImplementedError stubs), git.ts mirror additions, CI matrix axis for `jj-native`, baseline-parity flip for workspace verbs. Comparable in size to Phase 3 plan 03-01.
  2. **Workspace add/forget/list/context** real impls + paired tests (per-verb baseline-parity flip in the allowlist). Path-layout convention (`.claude/jj-workspaces/...`) + `mkdir -p` guard.
  3. **Concurrency primitive** — `acquireWriteLock` on jj (flock on `.jj/working_copy/checkout`), git no-op, RAII release-handle, stale-WC auto-recovery (D-21), paired tests.
  4. **Octopus structure helpers** — orchestrator-level helpers for lazy `parent + merge` slot creation, per-subagent head+workspace pre-creation (the `jj new -A parent -B merge -m 'subagent N'` + `jj workspace add` combo), `gsd/phase-{N}` bookmark advance on phase merge.
  5. **Reap flow** — `workspace.reap()` verb (or caller-orchestrated equivalent), empty-tree probe (D-12/D-15), `incomplete-work.md` queue append (D-13), `VcsIncompleteSubagentsError` on phase merge with non-empty queue (D-14).
  6. **Hook wiring** — `fireHook` invoked from `commit()` and `push()` on both backends; SDK query bridge (D-08); jj-pre-push integration shape (Claude's discretion); `noVerify` opt-out wiring symmetric across backends.
  7. **cr-01 fold-in + final activation** — refname validator wired both backends with `raw:true` rejection tests; jj-native CI lane confirmed green-ish (allow-failure); `docs/test-triage/jj-bugs.md` audited for worktree-bug-test transpositions (WS-13).
- **Format-migration tracker addition:** `.planning/phases/{N}/incomplete-work.md` records `change_id_short` strings — native to jj, no rewrite needed by migration phase. Logged in this CONTEXT's `<decisions>` D-06.
- **Memory update at phase open:** Update `project_no_parallelization_yet.md` to clarify "this repo's execution stays sequential until migration; the adapter surface must support parallel from Phase 4 forward." Better: rename the memory file to reflect the scoped meaning.

</specifics>

<deferred>
## Deferred Ideas

- **HOOK-05 Tier 2 PATH-shim wrapper (`jj-with-hooks` binary):** Confirmed deferred per REQUIREMENTS v2 (HOOK2-01/02). Phase 4 v1 interface accommodates.
- **JJOP-* jj-only opportunities (op-log undo, conflict-tolerant merge, change-IDs as stable phase trackers, jj fix, jj split):** Deferred to v2 milestone per REQUIREMENTS.
- **Cross-workspace coordination primitive (`vcs.acquireRepoLock()`):** Deferred per D-20. Add when a real flow surfaces during dogfood post-migration.
- **`workflow.workspace_path_template` config knob:** Deferred per D-18. Add only when an override is requested.
- **`vcs.test.readWithoutSnapshot()` symbol-gated escape:** Phase 3 D-06 deferred; Phase 4 D-15 mitigates via "run probe from orchestrator's workspace" — no need to introduce yet.
- **Multi-version jj CI matrix axis:** Single 0.41 pin continues per Phase 3 D-14. Revisit only on a jj 0.41→0.42+ breakage.
- **Wrapper-based hook strategy in v1:** Confirmed deferred per REQUIREMENTS HOOK-05.
- **Bookmark-as-subagent-state (D-05 alternative):** Per-subagent bookmarks were considered and rejected; workspace-name is the canonical key. Revisit only if `jj log` subagent labelling becomes a user-facing need.
- **JSON sidecar for orchestrator state:** Considered and rejected per D-03 (mirrors git's no-sidecar model). Revisit only if non-VCS metadata (subagent prompt hash, dispatch timestamp) needs durable storage beyond `jj workspace list`.
- **Pre-existing failures carried from Phase 3:** 12 pre-existing failures recorded in `.planning/phases/03-jj-backend-core-squash-refs-conflict/deferred-items.md` (gpg signing fixtures, worktree-safety-policy assertion drift). Still deferred to maintenance bucket.
- **REQUIREMENTS.md footer reconciliation:** Carried from Phase 2 / 2.1. Still pending at next major phase transition.
- **MIGR-04 + UPSTREAM-01 rebase task:** Carried from Phase 2 D-17. Still deferred to milestone-end (post-Phase-5 — or post-migration phase).
- **`/gsd-migrate-to-jj` command + `.planning/` SHA → change_id rewriter:** Phase 4.5 or 6 (TBD via `/gsd-phase`).

### Reviewed Todos (not folded)

*None — the only matched todo (`cr-01-raw-bookmark-argv-injection`) was folded in per D-24.*

</deferred>

---

*Phase: 04-workspaces-octopus-structure-hooks*
*Context gathered: 2026-05-13*
