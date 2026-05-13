# Phase 4: Workspaces + Octopus Structure + Hooks - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-13
**Phase:** 04-workspaces-octopus-structure-hooks
**Areas discussed:** Parallelization posture, Orchestrator state model, Hooks public surface, Crash-recovery semantics, Workspace path layout, Write-lock primitive, CI matrix expansion, cr-01 fold-in

---

## Parallelization Posture

| Option | Description | Selected |
|--------|-------------|----------|
| Build infra, sequential dispatch | Ship all WS-01..13 primitives + lazy octopus + batch reap; orchestrator dispatches sequentially; Pitfall 4 (concurrency) deferred. Memory rule keeps holding. Parallel dispatch is a config flip in a later phase. | |
| Minimal primitives, drop octopus from Phase 4 | Only ship `vcs.workspace.{add,forget,list,context,prune}` + hooks. Octopus + head tracking + batch reap + WS-12 move to a new Phase 4.5. Smaller phase; needs ROADMAP edit. | |
| Un-defer parallel, activate fan-out | Update memory: "No parallelization yet" was true through Phase 3; Phase 4 flips it. Land write-lock + stale-WC probe + parallel Agent() dispatch in same phase. | |
| **Free-text from user** | "No parallelization is exclusively because this repository is still on git due to our port not being ready yet. We need the port production-ready for parallelization, we just won't use it ourselves in this session yet. So: build infra + parallel dispatch, but don't use it yet. Prepare to use it once we migrate this repository from git to jj itself." | ✓ |

**User's choice:** Reframe — "No parallelization yet" is per-this-repo (still git, until migration). Adapter must be production-ready for parallel. Build the full WS+octopus+concurrency infra now; this repo just won't use it until the migration phase flips the sticky adapter.
**Notes:** Locked as Phase 4 D-01/D-02 in CONTEXT.md. Memory update queued — `project_no_parallelization_yet.md` to be rewritten to clarify the scope.

---

## Orchestrator State Model

| Option | Description | Selected |
|--------|-------------|----------|
| JSON sidecar in phase dir | `.planning/phases/{N}/.workspace-heads.json` recording `{subagentId, headChangeId, workspacePath, planId, dispatchedAt, status}`. Major new D-19 entry. Crash-resume re-reads file. | |
| Bookmark namespace + jj op-log only | State derived from `bookmarks.list('phase-{N}/subagent-')` + jj op-log. No new file. Zero new D-19 surface. Con: no non-VCS metadata channel. | |
| Sidecar JSON + bookmark namespace combo | Bookmarks = canonical head-tracker; JSON sidecar = non-VCS metadata only. Cleanest separation. | |
| **Free-text from user** | "How did the git backend do it?" — triggered investigation. Git side keeps zero persistent state: Claude's runtime handles `isolation="worktree"`; worktree dir name (`.claude/worktrees/agent-<id>`) and branch (`worktree-agent-<id>`) are the canonical keys; cleanup re-discovers via `git worktree list` with inclusion-filter (#2774). | |
| **Follow-up: Workspace-name carries everything** | Workspace name = `phase-{N}-subagent-{idx}`. `vcs.workspace.list()` returns `{name, atChange}`. Bookmarks only at phase-level (`gsd/phase-{N}`). Matches git pattern most closely. | ✓ |
| Follow-up: Bookmark-prefix carries everything | Workspaces use throwaway names; bookmarks under `gsd/phase-{N}/subagent-{idx}` are canonical. | |
| Follow-up: Both — workspace-name primary, bookmark mirrors | Workspace-name canonical; bookmark mirror for human readability via `jj log`. | |

**User's choice:** Workspace-name carries everything (Recommended). Mirrors git's no-sidecar pattern; matches the existing `.claude/worktrees/agent-*` convention; D-19 surface stays minimal.
**Notes:** Locked as Phase 4 D-03/D-04/D-05/D-06 in CONTEXT.md.

---

## Hooks Public Surface

| Option | Description | Selected |
|--------|-------------|----------|
| Internal-only auto-fire | Keep `fireHook` module-private. `vcs.commit()` and `vcs.push()` call it internally. No public re-add. Orchestrator escape via SDK query bridge or reserved verb. | ✓ |
| Re-expose `vcs.hooks.fire()` publicly | Reverse Phase 2.1 D-07 partially; add back `vcs.hooks.fire(stage, ctx)` as public verb. | |
| Public on gitOnly, internal on jj | `vcs.gitOnly.hooks.fire()` on git; jj's hook firing purely internal. Asymmetric but truthful. | |

**User's choice:** Internal-only auto-fire (Recommended).
**Notes:** Locked as Phase 4 D-07. SDK query bridge for explicit-fire callers (D-08) — planner picks exact name (e.g., `gsd-sdk query hooks.fire pre-commit`). Workflow markdown rewrites that today call raw `git hook run pre-commit` (`execute-phase.md:689`) are Phase 5's PROMPT-* scope; Phase 4 ships the query, Phase 5 calls it.

---

## Crash-Recovery Semantics (WS-12)

| Option | Description | Selected |
|--------|-------------|----------|
| Agent() exit + empty-tree probe | Non-success Agent() OR missing SUMMARY.md = crashed. `jj diff -r <head> --from <parent>` empty → abandon; non-empty → squash as `'subagent N: incomplete work'`. Queue at `.planning/phases/{N}/incomplete-work.md`. Phase merge BLOCKS while queue non-empty. | ✓ |
| Agent() exit + auto-merge-anyway | Same detection; no queue file. Crashed subagent's preserved work auto-included in octopus merge; warning to stderr only. Silent partial-completion. | |
| Sentinel-file completion marker | Each subagent writes `{workspace}/.gsd-subagent-complete` as last action. Absence = crash. Works even when Agent() returns success but subagent died mid-write. | |

**User's choice:** Agent() exit + empty-tree probe (Recommended).
**Notes:** Locked as Phase 4 D-11/D-12/D-13/D-14/D-15 in CONTEXT.md. Empty-tree probe MUST run from orchestrator's workspace (or via `-R <repo>` from neutral cwd) so auto-snapshot doesn't produce false-positives on the head being inspected — D-15.

---

## Workspace Path Layout

| Option | Description | Selected |
|--------|-------------|----------|
| `.claude/jj-workspaces/phase-{N}-subagent-{idx}/` | Hidden under repo root. Mirrors Claude Code's `.claude/worktrees/agent-*` convention; #2774 inclusion-filter reuses. Gitignored via `.claude/`. Verified empirically on jj 0.41: nested workspaces work cleanly; parent's auto-snapshot correctly excludes nested workspace paths. | ✓ |
| `../<repo>-ws-phase-{N}-subagent-{idx}/` (sibling) | Classic git-worktree sibling convention. Pollutes parent dir; harder to gitignore; cross-drive issues on Windows. | |
| Configurable, default `.claude/jj-workspaces/...` | Same default + `workflow.workspace_path_template` knob. Overengineered for v1. | |

**User's choice:** `.claude/jj-workspaces/phase-{N}-subagent-{idx}/` (Recommended).
**Notes:** Empirical verification triggered by user pushback ("You will have to check if jj even supports nested worktrees"). Verified on jj 0.41 in a tmp repo: `jj workspace add .claude/jj-workspaces/test` succeeded after `mkdir -p` of parent; parent's `jj st` correctly excluded the nested workspace's files. Locked as Phase 4 D-16/D-17/D-18. Adapter MUST `mkdir -p` parent before `jj workspace add` (jj doesn't auto-create intermediate dirs).

---

## Write-Lock Primitive (Pitfall 4)

| Option | Description | Selected |
|--------|-------------|----------|
| Per-workspace flock + cross-workspace tiered | Per-workspace flock on `.jj/working_copy/checkout`, PLUS optional `acquireRepoLock()` for shared-ancestor coordination. | |
| Per-workspace only | Just per-workspace flock; caller orchestrates shared-ancestor serialisation at the GSD layer per Pitfall 4 rec. YAGNI for v1. | ✓ |
| Single repo-wide sentinel only | One sentinel at `.jj/op-heads/.gsd-lock` serialises ALL writes. Defeats parallelism. Not recommended. | |

**User's choice:** Per-workspace only.
**Notes:** Locked as Phase 4 D-19/D-20/D-21. Cross-workspace primitive deferred to deferred section; add when a real flow surfaces. Stale-WC auto-recovery (jj #7538) is rolled into `acquireWriteLock` path — no separate `recoverStaleWorkspace()` verb.

---

## CI Matrix Expansion

| Option | Description | Selected |
|--------|-------------|----------|
| Add jj-native lane (continue-on-error) | Third matrix axis: `jj-native` runs in tmp dir via `jj init` (no `.git`). HOOK-03 non-colocated direct-fire path gets CI coverage. Allow-failure during Phase 4; graduates with jj-colocated in Phase 5. | ✓ |
| Local-fixture only, defer CI to Phase 5 | Vitest fixtures bootstrap jj-native locally; CI stays git + jj-colocated; matrix expansion deferred to Phase 5. | |

**User's choice:** Add jj-native lane (Recommended).
**Notes:** Locked as Phase 4 D-22/D-23. Reuses Phase 3 D-14/D-15 jj 0.41 release-tarball install step.

---

## cr-01 TODO Fold-In

| Option | Description | Selected |
|--------|-------------|----------|
| Fold in | Cross-backend refname validator into both backends' `refs.bookmarks.*` write paths when `opts.raw === true`; `--` separator; defense-in-depth tests. Marks TODO `resolves_phase: 04`. | ✓ |
| Keep separate | TODO stays in pending; own /gsd-quick or hardening phase. Phase 4 scope stays tight. | |

**User's choice:** Fold in (Recommended).
**Notes:** Locked as Phase 4 D-24. Phase 4 touches `refs.bookmarks` heavily for orchestrator-state encoding (D-05's phase-level bookmark advance) — natural slot to harden the surface.

---

## Claude's Discretion

- SDK query bridge exact name for D-08 (likely `gsd-sdk query hooks.fire <stage>` — planner picks)
- jj-pre-push integration shape (HOOK-04): wrapper module vs inline replication vs vendored script (planner picks; no Rust toolchain dep)
- Workspace name slug zero-padding (`phase-04-subagent-1` vs `phase-4-subagent-1`) — lean toward zero-padded consistency with directory naming
- Crash queue ordering/dedup in `incomplete-work.md` (planner picks; likely append-only)
- `VcsIncompleteSubagentsError` exact class name + recovery hints
- Empty-tree probe placement (`vcs.workspace.reap()` verb vs caller-orchestrated `vcs.diff` + `vcs.workspace.forget`) — lean toward single `reap()` verb to centralise auto-snapshot caveat handling
- Test-fixture extensions for multi-workspace flows (`vcsMultiWsTest(kind, n)` factory shape)
- Workspace-path-safety guard transposition (WS-13): per-test verdict in `docs/test-triage/jj-bugs.md` during execution

---

## Deferred Ideas

- HOOK-05 Tier 2 PATH-shim wrapper (`jj-with-hooks` binary) — v2 milestone per REQUIREMENTS HOOK2-*
- JJOP-* jj-only opportunities — v2 milestone
- Cross-workspace coordination primitive (`vcs.acquireRepoLock()`) — until real flow surfaces post-migration dogfood
- `workflow.workspace_path_template` config knob — until override requested
- `vcs.test.readWithoutSnapshot()` symbol-gated escape — Phase 4 D-15 mitigates
- Multi-version jj CI matrix axis — until jj 0.41→0.42+ breakage
- Bookmark-as-subagent-state (D-05 alternative) — until `jj log` subagent labelling becomes user-facing need
- JSON sidecar for orchestrator state — until non-VCS metadata durable storage becomes a need
- Pre-existing Phase 3 deferred failures (gpg signing fixtures, worktree-safety-policy drift) — maintenance bucket
- REQUIREMENTS.md footer reconciliation — next phase transition
- MIGR-04 + UPSTREAM-01 rebase task — milestone-end
- `/gsd-migrate-to-jj` command + `.planning/` SHA → change_id rewriter — Phase 4.5 or 6
