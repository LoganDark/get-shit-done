# Requirements: GSD jj-port

**Defined:** 2026-05-09
**Core Value:** Every upstream GSD command works correctly on a jj-only repo without git — the user can run their full GSD workflow against a jj backend with no degradation in behavior or test coverage.

## v1 Requirements

### Adapter Foundation (VCS)

- [x] **VCS-01**: `VcsAdapter` interface defined in `sdk/src/vcs/types.ts` with full operation contract (commit, log, status, diff, refs, workspace, hooks, push/fetch, conflict query, raw escape hatch)
- [x] **VCS-02**: `createVcsAdapter(cwd, opts)` factory in `sdk/src/vcs/index.ts` returning a frozen plain object with namespaced sub-objects (`vcs.commit`, `vcs.workspace.*`, `vcs.refs.*`, `vcs.hooks.*`, `vcs.gitOnly.*` for backend-specific ops)
- [x] **VCS-03**: Backend auto-detection at construction (`.jj` first, `.git` fallback, `GSD_VCS` env override)
- [x] **VCS-04**: Single spawn wrapper in `sdk/src/vcs/exec.ts` with uniform `{ exitCode, stdout, stderr }` return shape and `VcsExecError` for non-zero exits
- [x] **VCS-05**: `RevisionExpr` type as the canonical revset/ref primitive — every backend translates internally (e.g., `HEAD` → `@-` on jj; `origin/main` → `main@origin`)
- [x] **VCS-06**: TypeScript-first with CJS build target emitting to `dist-cjs/` for `bin/lib/*.cjs` consumption (no hand-maintained CJS twin)
- [x] **VCS-07**: Lint guard "jj-backend never shells out to mutating git verbs" ships as part of the adapter package (D-17/D-18 tightened to ALL git invocations, not just mutating)

### Git Backend (GIT)

- [x] **GIT-01**: `sdk/src/vcs/backends/git.ts` implements every adapter operation behaviorally equivalent to existing inline `execSync('git …')` call sites (1:1 git-only baseline before any jj work)
- [x] **GIT-02**: Git backend preserves byte-identical `{ exitCode, stdout, stderr }` for migrated call sites (passes a snapshot diff against pre-migration behavior)
- [x] **GIT-03**: `vcs.gitOnly.createAnnotatedTag()` and other git-specific escape hatches available; jj backend errors clearly when called

### jj Backend (JJ)

- [x] **JJ-01**: `sdk/src/vcs/backends/jj.ts` implements every adapter operation against the `jj` binary
- [x] **JJ-02**: jj invocations always pass `--repository <path>`, `--no-pager`, `--color never`, `--quiet` for parsed output paths; argv-array invocation only (no shell-string concatenation, since revsets contain `()`, `::`, `&`, `~`, `"`)
- [x] **JJ-03**: jj backend defaults to **allowing** working-copy auto-snapshot — `--ignore-working-copy` is **never** passed by adapter code (locked decision: snapshot is required to keep WC fresh; skipping causes stale-WC headaches)
- [x] **JJ-04**: Output parsing uses `-T 'json(self) ++ "\n"' --no-graph` NDJSON format for `log`, `op log`, `workspace list`; per-backend parsers in `sdk/src/vcs/parse/`
- [x] **JJ-05**: jj binary discovery at adapter construction (`which jj`); explicit error with install instructions when missing
- [x] **JJ-06**: jj version is "track latest, no floor" — adapter doesn't enforce a min version; errors clearly when an op behaves unexpectedly
- [x] **JJ-07**: `JJ_USER` / `JJ_EMAIL` env propagated when scripting commits

### Squash Commit Model (SQUASH)

- [x] **SQUASH-01**: `vcs.commit({ files, message })` on jj backend implements as `jj squash <files> -B @ -k -m '<message>'` (squash specific paths into a new commit before `@`, keep working copy)
- [x] **SQUASH-02**: `vcs.commit({ message })` (no `files`) on jj implements as `jj squash -B @ -k -m '<message>'` with no path filter — squashes all current `@` content into a new commit before `@`
- [x] **SQUASH-03**: When `files` includes paths that are unchanged in `@`, jj backend faithfully includes them in the squash (no error, no filtering)
- [x] **SQUASH-04**: After squash, `@`'s description is preserved (jj-native behavior; adapter does not clear it)
- [x] **SQUASH-05**: `jj commit` is **never** used by the adapter — squash is the sole commit primitive
- [x] **SQUASH-06**: When squash produces a conflicted state, adapter surfaces it via the return value (no auto-resolve, no auto-undo); caller decides how to handle
- [x] **SQUASH-07**: `.planning/*` and code paths can be squashed together in a single commit (same lineage); per-path filtering happens at PR-branch time, not at commit time

### Workspace Mapping + Octopus Structure (WS)

- [ ] **WS-01**: `vcs.workspace.add(path, { atRevision })` creates a workspace and points its `@` at `atRevision` (uses `jj workspace add -r <rev> <path>` on jj backend; equivalent worktree creation on git backend)
- [ ] **WS-02**: `vcs.workspace.forget(path)` cleans up a workspace
- [ ] **WS-03**: `vcs.workspace.list()` returns all known workspaces with their `@` change IDs
- [ ] **WS-04**: Default workspace path layout: siblings of main repo (current GSD git convention); configurable later
- [ ] **WS-05**: Phase setup is **lazy** — `parent + merge` octopus structure is created on first subagent dispatch, not at phase start. Single-plan phases without fan-out remain linear chains.
- [ ] **WS-06**: When subagent fan-out is triggered, the orchestrator pre-creates each subagent's head change (`jj new -A parent -B merge -m 'subagent N'`) AND creates the subagent's workspace pointed at that head (`jj workspace add -r <head_id>`) before dispatching the subagent
- [ ] **WS-07**: Orchestrator tracks each subagent's head change ID for end-of-phase reaping; `-k` flag preserves change IDs across squashes so tracked IDs remain valid
- [ ] **WS-08**: Plans within a phase use the same octopus structure recursively when they fan out — each plan's subagent dispatch creates its own `parent + merge` slot
- [ ] **WS-09**: Phase bookmark advances to the `merge` change itself when the phase completes (not one beyond)
- [ ] **WS-10**: Orchestrator's main workspace `@` sits one beyond `merge` (its own empty canvas) during phase execution
- [ ] **WS-11**: After phase merge completes, adapter automatically:
  - (a) `jj show -r <head_id>` for each tracked subagent head
  - (b) `jj abandon` if empty; surface for review if non-empty
  - (c) `jj workspace forget` for each subagent workspace (batch reap)
- [ ] **WS-12**: If a subagent crashes mid-work (workspace exists, head still has uncommitted snapshot content), adapter squashes the uncommitted work as `'subagent N: incomplete work'` to preserve files into the head's lineage, then surfaces for human review
- [ ] **WS-13**: Workspace-path-safety guards (preserving the spirit of `bug-3097/3099`, `bug-2774`, `bug-2075`) work against jj workspaces

### Refs / Bookmarks (REFS)

- [x] **REFS-01**: `vcs.refs.head` returns `RevisionExpr` for current change; jj backend resolves `@`, git backend resolves `HEAD`
- [x] **REFS-02**: `vcs.refs.parent` returns `@-` (last commit, may be empty)
- [x] **REFS-03**: `vcs.refs.bookmarks.list()`, `.create(name, rev)`, `.move(name, rev)`, `.delete(name)`, `.exists(name)` — backend-translated to bookmarks (jj) or branches (git)
- [x] **REFS-04**: Bookmark names use `gsd/` namespace prefix on jj backend (e.g., `gsd/phase-001-adapter-foundation`); git backend uses unprefixed branch names matching upstream convention
- [x] **REFS-05**: `vcs.commit()` auto-advances the active bookmark to the new commit (locked decision: caller doesn't explicitly call `advanceBookmark`; adapter does it internally)
- [x] **REFS-06**: Tags on jj backend = named bookmarks under `gsd/release/<version>`; no annotated-tag concept (defer if release flow needs them)

### Conflict Detection (CONFLICT)

- [x] **CONFLICT-01**: `vcs.findConflicts({ scope: 'all' })` returns change IDs of any in-tree conflicts via `jj log -r 'conflicts()'` (jj backend) or `git diff --check` equivalent (git backend)
- [x] **CONFLICT-02**: `vcs.findConflicts({ scope: 'working-copy' })` checks only the materialized working-copy state (`jj st` style on jj; `git status` style on git)
- [x] **CONFLICT-03**: Verify gate uses `scope: 'all'` to catch in-tree conflicts that jj's conflict-tolerant model preserves silently

### Hooks (HOOK)

- [ ] **HOOK-01**: `vcs.hooks.fire(stage, ctx)` is the adapter primitive; stages are `pre-commit`, `pre-push`
- [ ] **HOOK-02**: Hook trigger point on jj is **after each `jj squash`** (not at any other jj operation; `jj commit` isn't used at all)
- [ ] **HOOK-03**: jj backend Tier 1 (v1 scope): in colocated mode, `vcs.hooks.fire(pre-commit)` no-ops because git's `.git/hooks/pre-commit` already fires when `.git` is updated by colocation; in non-colocated mode, the adapter triggers `.githooks/pre-commit` directly post-squash
- [ ] **HOOK-04**: Pre-push hook: jj backend invokes `acarapetis/jj-pre-push`-style integration on `jj git push` (or pre-push wrapper)
- [ ] **HOOK-05**: Tier 2 (jj-with-hooks PATH wrapper) is **deferred** to post-v1; v1 hook interface accommodates a future wrapper without breaking change

### Test Infrastructure (TEST)

- [x] **TEST-01**: `vcsTest(kind)` fixture in test helpers parameterizes over backends via vitest's `describe.for([...BACKENDS])`
- [x] **TEST-02**: `test.extend({ vcs, cwd })` provides per-test backend instance and isolated tmp working directory
- [x] **TEST-03**: Backend matrix axis includes `git`, `jj-colocated`, `jj-native` (latter two are separate environments)
- [x] **TEST-04**: `GSD_TEST_BACKENDS` env var selects subset of backends to run (default: all)
- [x] **TEST-05**: All ~80 git-touching tests in `tests/` migrated to use the `vcs` fixture instead of raw git invocations in test setup
- [x] **TEST-06**: CI rule: skip count must not increase from `main` (prevents silent test-skipping under migration pressure)
- [x] **TEST-07**: Test fixtures support both git and jj initial states (`tests/helpers.cjs` + a new `tests/helpers-jj.cjs` or unified file)
- [x] **TEST-08**: Worktree-edge-case tests (`bug-2924/2774/3097/3099/2075/2431/2015/2388`) re-triaged: those that map cleanly to jj workspaces are migrated; those that don't are documented as git-only with rationale

### Call-Site Migration (MIGR)

- [x] **MIGR-01**: All `execSync('git …')` call sites in `sdk/src/query/*.ts` migrated to adapter calls (`commit.ts`, `init.ts`, `verify.ts`, `progress.ts`, `check-ship-ready.ts`, `check-decision-coverage.ts`, `docs-init.ts`, etc.)
- [x] **MIGR-02**: All `execSync('git …')` call sites in `get-shit-done/bin/lib/*.cjs` migrated (`core.cjs`, `verify.cjs`, `commands.cjs`, `worktree-safety.cjs`, `init.cjs`, `graphify.cjs`, `drift.cjs`) — *partial: worktree-safety.cjs complete (plan 02-04); 6 files outstanding*
- [x] **MIGR-03**: Migration is mechanical (Branch-by-Abstraction): each call site swaps `execSync('git …')` for the adapter equivalent without changing surrounding logic
- [-] **MIGR-04**: First upstream rebase post-migration verifies the "mechanical edits = clean rebase" hypothesis (track conflict count metric) — *Recorded as deferred to milestone-end task (post-Phase-5) per Phase 2 plan 02-12; see `.planning/phases/02-bulk-call-site-migration-still-git-only/02-12-DEFERRED.md`*

### Workflow + Agent Prompt Rewrites (PROMPT)

- [ ] **PROMPT-01**: Workflow markdown files (`get-shit-done/workflows/*.md`) that instruct shell git invocations updated to use VCS-agnostic helper commands or backend-aware language (`workflows/execute-phase.md` 58 mentions, `workflows/quick.md` 46, `workflows/complete-milestone.md` 36, `workflows/undo.md` 15, `workflows/code-review.md` 11, etc.)
- [ ] **PROMPT-02**: Agent definitions (`agents/*.md`) updated similarly (`gsd-code-fixer.md` 37 mentions, `gsd-executor.md` 24, etc.)
- [ ] **PROMPT-03**: Multi-runtime variants (Codex / Gemini / OpenCode) of workflow and agent files synced in lockstep with Claude variants

### Command-Level Translations (CMD)

These cover full-flow correctness for major upstream commands. Each has its own integration-test gate.

- [ ] **CMD-01**: `/gsd-new-project` initializes a jj-only repo when `.git` is absent (auto-detects via the adapter)
- [ ] **CMD-02**: `/gsd-plan-phase` works end-to-end on jj backend (lazy parent+merge structure when subagents fan out)
- [ ] **CMD-03**: `/gsd-execute-phase` runs subagents through the orchestrator-creates-heads-and-workspaces flow with octopus merge
- [ ] **CMD-04**: `/gsd-discuss-phase`, `/gsd-verify-work`, `/gsd-complete-milestone` work end-to-end on jj
- [ ] **CMD-05**: `/gsd-quick` bypasses the full squash-and-octopus model — uses single `jj squash -B @ -k -m '…'` on the orchestrator's `@` (no phase setup, no workspace, no octopus)
- [ ] **CMD-06**: `/gsd-undo` translates `git reset` to surgical `jj abandon <change>` per individual commit (not op-log restore)
- [ ] **CMD-07**: `/gsd-pr-branch` filters out `.planning/`-only commits via revset query, materializes the result via `jj duplicate` onto a new bookmark for PR (preserves original history)
- [ ] **CMD-08**: `/gsd-hotfix` uses `jj new <past-change-id>` to root work at a historical change, then standard squash flow + new `gsd/hotfix/<id>` bookmark + explicit push
- [ ] **CMD-09**: `/gsd-ship` works on jj backend: explicit `vcs.push()` (caller-controlled, no auto-push), bookmark-based release tags
- [ ] **CMD-10**: `/gsd-resume-work`, `/gsd-pause-work`, `/gsd-import`, `/gsd-ingest-docs`, `/gsd-map-codebase` work on jj
- [ ] **CMD-11**: Hotfix, canary, complete-milestone, multi-workspace flows preserved per upstream

### Brownfield Priority (BROWN)

This fork dogfoods on its own repo (which is jj-colocated). Brownfield workflows ship value soonest.

- [ ] **BROWN-01**: Brownfield commands (`/gsd-map-codebase`, `/gsd-import`, `/gsd-ingest-docs`, `/gsd-resume-work`, `/gsd-ship`, `/gsd-undo`) verified against this repo's jj backend before greenfield smoke is required
- [ ] **BROWN-02**: First weekly upstream rebase recorded after brownfield validation, with conflict count and a brief retro

### Upstream Tracking (UPSTREAM)

- [-] **UPSTREAM-01**: jj-native rebase workflow documented for pulling upstream main onto fork commits (live rebase, fork commits stay on top of upstream main) — *Recorded as deferred to milestone-end task (post-Phase-5) per Phase 2 plan 02-12; see `.planning/phases/02-bulk-call-site-migration-still-git-only/02-12-DEFERRED.md`*
- [x] **UPSTREAM-02**: Fork-specific code organized to minimize merge conflicts: adapter-shaped (mechanical) edits in upstream files; jj-specific code lives in sidecar files (`sdk/src/vcs/jj/`, `sdk/src/vcs/parse/jj-*.ts`) which carry zero conflict surface
- [x] **UPSTREAM-03**: Hotspot files (`core.cjs` 2036 LOC, `verify.cjs` 1390, `commands.cjs` 1028) only see adapter call-site swaps inline; no jj-specific logic embedded

### CI / Release (CI)

- [ ] **CI-01**: CI matrix runs both backends (`git` + `jj-colocated`); jj-backend tests start as `allow-failure` and graduate to required-blocking once stable
- [ ] **CI-02**: jj install step uses release tarballs from GitHub releases (not `cargo install` — too slow and requires Rust toolchain)
- [ ] **CI-03**: GitHub Actions workflows (`canary`, `release-sdk`, `hotfix`, `branch-cleanup`, `auto-branch`, etc.) keep using git on the upstream side — these don't get jj-ported (GitHub *is* git)
- [ ] **CI-04**: Pre-push validation hooks fire on both git and jj sides via the adapter `vcs.hooks.fire('pre-push')` primitive

## v2 Requirements

Deferred to follow-up milestone after v1 ships.

### Hooks Tier 2 (HOOK2)

- **HOOK2-01**: `jj-with-hooks` PATH-shim wrapper (Node implementation; deferred from v1)
- **HOOK2-02**: Wrapper-recursion guard via `GSD_JJ_WRAPPER_DEPTH` env

### Hooks Tier 3 (HOOK3)

- **HOOK3-01**: Op-log polling for hook triggers in non-colocated jj without wrapper

### jj-Only Opportunities (JJOP)

These are capabilities GSD could gain by exploiting jj idioms; explicitly v2+ to keep v1 focused on parity.

- **JJOP-01**: `/gsd-undo` upgraded to op-log-based undo for batch rollback (in addition to surgical abandon)
- **JJOP-02**: Conflict-tolerant milestone integration — phase merges land conflicts in-tree, deferred resolution is first-class
- **JJOP-03**: Change-IDs as stable phase trackers (immune to commit-rewrite churn)
- **JJOP-04**: `jj fix` integration for auto-formatters in pre-commit
- **JJOP-05**: `jj split` workflow for breaking apart large GSD operations after the fact

### Identity / Rebrand (BRAND)

- **BRAND-01**: Decide and implement fork's package/CLI/skill names (currently default to upstream names; revisit at first usable milestone)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Removing git support | Adapter keeps git first-class; removing breaks upstream rebase ergonomics and dual-backend test parity |
| Publishing to npm under upstream's name | Fork is for personal use; no `get-shit-done-cc` republish |
| Upstreaming changes back to `gsd-build/get-shit-done` | Fork is one-way; no PRs intended back upstream |
| `--ignore-working-copy` in adapter | Causes stale-WC headaches; auto-snapshot is intentional |
| `jj commit` as a commit primitive | Squash model uses `jj squash -B @ -k -m` exclusively; `jj commit` is never invoked |
| Subagents self-inserting into octopus structure | Orchestrator pre-creates heads and workspaces and hands change IDs to subagents (cleaner ownership, easier tracking) |
| Op-log-based `/gsd-undo` for v1 | Surgical `jj abandon <change>` is closer to git semantics; op-log undo is v2 (JJOP-01) |
| Annotated tags on jj backend | Bookmarks (`gsd/release/<version>`) replace tags in v1 |
| Auto-push on bookmark advance | Push is explicit-only to keep traceable; auto-push surprises and chatters |
| Optimizing for non-Claude runtimes | Codex/Gemini/OpenCode parity preserved per upstream, but bug-fix priority lands on Claude when conflicts arise |
| Wrapper-based hook strategy in v1 | Tier 2 (`jj-with-hooks` PATH shim) deferred; v1 ships colocated-only Tier 1 |
| Non-colocated jj as the only mode | Both colocated and non-colocated must work; colocated is the dogfood default |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| VCS-01 | Phase 1 | Complete (01-02) |
| VCS-02 | Phase 1 | Complete (01-02; backend impl arrives 01-03) |
| VCS-03 | Phase 1 | Complete (01-02) |
| VCS-04 | Phase 1 | Complete (01-02) |
| VCS-05 | Phase 1 | Complete (01-02) |
| VCS-06 | Phase 1 | Complete |
| VCS-07 | Phase 1 | Complete (01-05) |
| GIT-01 | Phase 1 | Complete (01-03) |
| GIT-02 | Phase 1 | Complete (01-03) |
| GIT-03 | Phase 1 | Complete (01-03) |
| TEST-01 | Phase 1 | Complete |
| TEST-02 | Phase 1 | Complete |
| TEST-03 | Phase 1 | Complete |
| TEST-04 | Phase 1 | Complete |
| TEST-06 | Phase 1 | Complete |
| TEST-07 | Phase 1 | Complete |
| MIGR-01 | Phase 2 | Complete |
| MIGR-02 | Phase 2 | Complete (cosmetic sweep landed in Phase 5 plan 05-05 — error-message strings + comments in 4 of 6 cjs files updated; lint-vcs-no-raw-git stays at 0 violations) |
| MIGR-03 | Phase 2 | Complete |
| MIGR-04 | Phase 2 | Recorded as deferred to milestone-end task (post-Phase-5) per Phase 2 plan 02-12 |
| TEST-05 | Phase 2 | Complete |
| UPSTREAM-01 | Phase 2 | Recorded as deferred to milestone-end task (post-Phase-5) per Phase 2 plan 02-12 |
| UPSTREAM-02 | Phase 2 | Complete |
| UPSTREAM-03 | Phase 2 | Complete |
| JJ-01 | Phase 3 | Complete (03-01) |
| JJ-02 | Phase 3 | Complete (03-01) |
| JJ-03 | Phase 3 | Complete (03-01) |
| JJ-04 | Phase 3 | Complete (03-02) |
| JJ-05 | Phase 3 | Complete (03-01) |
| JJ-06 | Phase 3 | Complete (03-01) |
| JJ-07 | Phase 3 | Complete (03-04) |
| SQUASH-01 | Phase 3 | Complete (03-04) |
| SQUASH-02 | Phase 3 | Complete (03-04) |
| SQUASH-03 | Phase 3 | Complete (03-04) |
| SQUASH-04 | Phase 3 | Complete (03-04) |
| SQUASH-05 | Phase 3 | Complete (03-01, re-verified 03-04 + 03-07) |
| SQUASH-06 | Phase 3 | Complete (03-04) |
| SQUASH-07 | Phase 3 | Complete (03-04) |
| REFS-01 | Phase 3 | Complete (03-03) |
| REFS-02 | Phase 3 | Complete (03-03) |
| REFS-03 | Phase 3 | Complete (03-03) |
| REFS-04 | Phase 3 | Complete (03-03) |
| REFS-05 | Phase 3 | Complete (03-04) |
| REFS-06 | Phase 3 | Complete (03-03) |
| CONFLICT-01 | Phase 3 | Complete (03-05; doc-fix conflict()→conflicts() landed 03-07) |
| CONFLICT-02 | Phase 3 | Complete (03-05) |
| CONFLICT-03 | Phase 3 | Complete (03-05) |
| TEST-08 | Phase 3 | Complete (03-06 — all 7 bug tests carries-verbatim verdict) |
| CI-01 | Phase 3 | Complete (03-07; jj-colocated lane allow-failure — graduates to required-blocking in Phase 5) |
| CI-02 | Phase 3 | Complete (03-07; jj 0.41.0 release-tarball install) |
| WS-01 | Phase 4 | Complete (04-01, 04-02) |
| WS-02 | Phase 4 | Complete (04-01, 04-02) |
| WS-03 | Phase 4 | Complete (04-01, 04-02) |
| WS-04 | Phase 4 | Complete (04-01, 04-02) |
| WS-05 | Phase 4 | Complete (04-05) |
| WS-06 | Phase 4 | Complete (04-05) |
| WS-07 | Phase 4 | Complete (04-05) |
| WS-08 | Phase 4 | Complete (04-05) |
| WS-09 | Phase 4 | Complete (04-05) |
| WS-10 | Phase 4 | Complete (04-05) |
| WS-11 | Phase 4 | Complete (04-04) |
| WS-12 | Phase 4 | Complete (04-03, 04-04) |
| WS-13 | Phase 4 | Complete (04-02) |
| HOOK-01 | Phase 4 | Complete (04-06) |
| HOOK-02 | Phase 4 | Complete (04-06; jj-native trigger after squash empirically verified; colocated trigger surfaced as known gap — see 04-LEARNINGS A3) |
| HOOK-03 | Phase 4 | Complete (04-06; non-colocated direct shell of .githooks/<stage> shipped; colocated D-10 no-op landed but A3 assumption empirically refuted in plan 06 — three fix paths documented as v2 work in 04-LEARNINGS Open Questions) |
| HOOK-04 | Phase 4 | Complete (04-06) |
| HOOK-05 | Phase 4 | Complete (04-06; v1 interface stability locked, Tier 2 PATH-shim wrapper deferred to v2 per HOOK2-01) |
| CI-04 | Phase 4 | Complete (04-06; pre-push fires via HOOK-04 jj-side direct invocation + cross-backend SDK query bridge `gsd-sdk query hooks.fire`) |
| CMD-01 | Phase 5 | Complete (Phase 5 plan 05-02 — cmd-new-project-jj.test.ts + execute-phase.md rewrite under PROMPT-01 envelope) |
| CMD-02 | Phase 5 | Complete (Phase 5 plan 05-02 — cmd-plan-phase-jj.test.ts) |
| CMD-03 | Phase 5 | Complete (Phase 5 plan 05-02 — cmd-execute-phase-jj.test.ts + A3 hand-off in execute-phase.md) |
| CMD-04 | Phase 5 | Complete (Phase 5 plans 05-02 + 05-03 + 05-06 + 05-07 — cmd-discuss-phase-jj + cmd-verify-work-jj + cmd-complete-milestone-jj tests; CR-01/CR-03 closures in 05-06+05-07 restore complete-milestone.md staging-strip semantics) |
| CMD-05 | Phase 5 | Complete (Phase 5 plan 05-02 — cmd-quick-jj.test.ts + quick.md rewrite) |
| CMD-06 | Phase 5 | Complete (Phase 5 plans 05-03 + 05-06 + 05-07 — cmd-undo-jj.test.ts + Pitfall 6 prose; CR-01/CR-04 closures in 05-06+05-07 restore undo.md log-discovery + revert --abort recovery) |
| CMD-07 | Phase 5 | Complete (Phase 5 plan 05-03 — cmd-pr-branch-jj.test.ts) |
| CMD-08 | Phase 5 | Complete (Phase 5 plans 05-03 + 05-06 + 05-07 — cmd-hotfix-jj.test.ts; WR-03 closure in 05-06 restores push --bookmark gsd/hotfix/<id>) |
| CMD-09 | Phase 5 | Complete (Phase 5 plans 05-03 + 05-06 + 05-07 — cmd-ship-jj.test.ts; WR-03 closure in 05-06 restores explicit-push contract; cmd-ship-jj.test.ts:108-111 assertion inverted from bug-locking to fix-asserting) |
| CMD-10 | Phase 5 | Complete (Phase 5 plan 05-04 — 5 brownfield tests against synth-planning-fixture: resume-work, pause-work, import, ingest-docs, map-codebase; D-34 coverage gap documented; real-history dogfood deferred to Phase 6 per D-31) |
| CMD-11 | Phase 5 | Complete (Phase 5 plans 05-03 + 05-06 + 05-07 — cmd-code-review (via gsd-executor) + cmd-complete-milestone-jj.test.ts; CR-01 closure restores code-review.md phase-commit discovery; CR-06 closure fixes path-traversal boundary at line 137) |
| PROMPT-01 | Phase 5 | Complete (Phase 5 plans 05-02 + 05-03 + 05-07 — workflow markdown VCS-agnostic across execute-phase, quick, undo, complete-milestone, code-review; CR-01 24-site `.data.X → .X` sweep landed by 05-07) |
| PROMPT-02 | Phase 5 | Complete (Phase 5 plans 05-03 + 05-07 — agent definitions VCS-agnostic across gsd-executor + gsd-code-fixer; prohibition prose preserved; CR-01 9-site sweep landed by 05-07) |
| PROMPT-03 | Phase 5 | Complete (Phase 5 plan 05-05 — trust-installer closure per D-37; no per-runtime smoke matrix added; source-of-truth Claude markdown is processed by `bin/install.js` transform pipeline for 15+ runtimes) |
| BROWN-01 | Phase 6 | Pending (re-bucketed from Phase 5 per Phase 5 CONTEXT D-31) |
| BROWN-02 | Phase 6 | Pending (re-bucketed from Phase 5 per Phase 5 CONTEXT D-31) |
| CI-03 | Phase 5 | Complete (Phase 5 plan 05-05 — docs note landed in `.github/workflows/test.yml` header block: GitHub Actions workflows stay on git per the permanent architectural boundary — GitHub *is* git) |

**Coverage:**
- v1 requirements: 86 total (across 15 categories) — note: original footer reported "78 across 13" but actual content sums to 86 across 15 sections (SQUASH and BROWN are separate top-level sections, plus larger per-category sizes than initially summarized). Reconcile at next phase transition.
- Mapped to phases: 86 (100%)
- Unmapped: 0

**Per-phase distribution:**
- Phase 1: 16 requirements (VCS-01..07, GIT-01..03, TEST-01..04, TEST-06, TEST-07)
- Phase 2: 8 requirements (MIGR-01..04, TEST-05, UPSTREAM-01..03)
- Phase 3: 26 requirements (JJ-01..07, SQUASH-01..07, REFS-01..06, CONFLICT-01..03, TEST-08, CI-01, CI-02)
- Phase 4: 19 requirements (WS-01..13, HOOK-01..05, CI-04)
- Phase 5: 15 requirements (CMD-01..11, PROMPT-01..03, CI-03)
- Phase 6: 2 requirements re-bucketed in (BROWN-01, BROWN-02); other Phase 6 reqs TBD when planned

**Total mapped:** 16 + 8 + 26 + 19 + 15 + 2 = 86 ✓ (matches actual requirement count)

---
*Requirements defined: 2026-05-09*
*Last updated: 2026-05-13 — Phase 5 plan execution complete (8/8: 5 original + 3 gap closure). Gap-closure plans 05-06 (SDK contract fixes: CR-02 RevisionExpr cast in log/diff, WR-03 in push, CR-03 reset paths, CR-04 revert --abort; + black-box integration test against built gsd-sdk binary), 05-07 (CR-01 24-site `.data.X → .X` workflow + agent sweep, CR-06 path-traversal boundary fix in code-review.md), 05-08 (this status-table propagation). All 15 Phase 5 requirement IDs marked Complete: CMD-01..11, PROMPT-01..03, CI-03. BROWN-01/02 remain Pending under Phase 6 per CONTEXT D-31. CI matrix flip stays COMPLETE-WITH-CAVEAT (deferred soak per user context, analogous to Phase 4 A3 caveat).*
*Last updated: 2026-05-13 — Phase 5 plan 05-01 landed D-31 deferral edits: BROWN-01/02 re-bucketed from Phase 5 to Phase 6 (depends on Phase 6 SHA→change_id rewriter).*
*Last updated: 2026-05-13 — Phase 4 plan execution complete (7/7). All 19 Phase 4 requirement IDs marked Complete: WS-01..13, HOOK-01..05, CI-04. Notable caveat captured in HOOK-02 / HOOK-03 status: plan 04-06 empirically refuted the A3 assumption (jj 0.41 colocated mode does NOT auto-fire `.git/hooks/pre-commit` after `jj squash`), so the D-10 colocated no-op leaves colocated users with no pre-commit path; three fix paths documented in 04-LEARNINGS Open Questions §1 and deferred as Rule 4 architectural decision. cr-01 raw-bookmark argv-injection todo closed via D-24 fold-in (refname validator lift + `--` separator on both backends).*
*Last updated: 2026-05-12 — Phase 3 plan execution complete (7/7). All 26 Phase 3 requirement IDs marked Complete: JJ-01..07, SQUASH-01..07, REFS-01..06, CONFLICT-01..03, TEST-08, CI-01, CI-02. jj-colocated backend lane shipped as CI allow-failure (D-11; graduates to required-blocking in Phase 5). conflict() → conflicts() revset doc-bug fixed across REQUIREMENTS / ROADMAP / 03-CONTEXT (RESEARCH Q1 correction landed in plan 03-07).*
*Last updated: 2026-05-11 — Phase 2 plan execution complete (12/12). MIGR-04 and UPSTREAM-01 routed to milestone-end task per Phase 2 plan 02-12 (RECORDED-AS-DEFERRED, not Done). Phase 2 production-source migration delivered: MIGR-01, MIGR-02, MIGR-03, TEST-05, UPSTREAM-02, UPSTREAM-03 complete.*
