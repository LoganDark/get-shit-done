# Pitfalls Research

**Domain:** Cross-backend parallel-dispatch verbs (`vcs.parallel.*`) on the dual-backend (git + jj) `VcsAdapter` for the GSD jj-port — lifting raw-git worktree dispatch in `execute-phase.md` into the adapter, promoting `sdk/src/vcs/jj/octopus.ts` + `reap.ts` to backend `parallel.*` verb bodies, closing the A3 colocated pre-commit gap, and flipping `parallelization: true` by default.
**Researched:** 2026-05-15
**Confidence:** HIGH (codebase-grounded — every entry cites a concrete file:line, a prior incident in this repo, or a verified jj 0.41 / git CLI behavior captured in `.planning/intel/`).
**Scope qualifier:** Pitfalls specific to ADDING `vcs.parallel.*` on THIS architecture. Generic concurrent-programming hazards are out of scope; every entry maps to either (a) an existing adapter invariant (no raw git / no commit_id / squash-only / RAII lock), (b) a concrete prior incident (Plan 02 cross-namespace pain, A3 refutation, B-08 commit-routing fix, Plan 1 audit-regex miss), or (c) a documented jj 0.41 quirk.

---

## Critical Pitfalls

### Pitfall 1: Concurrent `jj squash` from multiple workspaces corrupts the same change

**What goes wrong:**
N agents each call `vcs.commit(...)` (which routes through `jj squash` per B-08 / the squash-centric model — `project_squash_model` memory) from N separate workspace cwds *concurrently*. jj 0.41 serializes operation-log writes via `.jj/repo/op_heads/`, but a `jj squash` from workspace A and a `jj squash` from workspace B that *both target an ancestor of both workspace `@`s* (e.g. orchestrator's `@-` parent slot) interleave at the operation-log level: one wins, the other becomes a divergent operation. The losing workspace's commit is preserved in `jj op log` but absent from the resulting tree — the agent's commit message says "task N done" while `jj log` shows the change never reached the merge slot.

The Phase 4 `acquireJjWriteLock` (lock.ts at `.jj/working_copy/gsd-lock`) is **per-workspace**, not per-repo. It does not serialize squashes across workspaces. Per the file's header: `// Per-workspace advisory flock primitive (D-19)`. The lock contract was designed for "one agent in one workspace, single-writer to that workspace's `@`" — it has no semantics for "many agents racing on the shared parent slot."

**Why it happens:**
- The lock primitive (lock.ts) was built for Phase 4's substrate (workspace.add/forget/list/reap) where each workspace has one writer and the orchestrator is the only cross-workspace coordinator. v1.3 inverts that: many agents *are* writers, all in parallel, all squashing toward a shared structure.
- jj's "two visible commits with same change_id = divergence" model is *first-class* — the failure mode is silent at jj-CLI level (no error; `jj log` shows both heads). Only the merge step or a downstream consumer discovers the split.
- The orchestrator's existing wave-cleanup executor (`worktree-safety.cjs:402` post-Plan-07-02) assumes one squash per workspace; it does not check for divergence on the shared parent.

**How to avoid:**
- **Promote `acquireJjWriteLock` to a `parallel.coordinate` repo-scoped lock** for the duration of any cross-workspace `jj squash` against a shared ancestor (parent slot, merge slot, main bookmark). Sentinel under `.jj/repo/gsd-parallel-lock` (sibling of `op_heads/`, NOT inside `working_copy/` — the workspace-scoped sentinel location is wrong here; Phase 4 Pitfall 6 reasoning still applies but the lock target is different). Contract: held across the entire `vcs.parallel.dispatch → vcs.parallel.fanIn` window.
- **Test the lock contract explicitly:** add a contract test that spawns N concurrent `vcs.commit({bookmark: 'gsd/phase-XX-merge'})` calls from N workspaces and asserts (a) no divergence, (b) all N commits reachable from the final merge, (c) lock wait-times bounded.
- **Discriminator:** the workspace-scoped lock (Phase 4) stays for "one agent's own `@`"; the new repo-scoped lock covers "shared-ancestor mutation." Two locks, two contracts, two sentinel paths — never collapse them.
- **Document the divergence-detection idiom:** after fan-in, run `jj log -r 'divergent()' --no-graph` and assert empty. Plan-checker grep for this assertion in any new `parallel.fanIn` implementation.

**Warning signs:**
- Test flake reporting "subagent N's commit not in merge" but `jj op log` shows the squash succeeded
- `jj log` post-fan-in shows changes annotated `??` (jj's divergent-marker)
- Lock-acquire timeouts in CI (the `30_000` ms default from `lock.ts:DEFAULT_TIMEOUT_MS` is for single-workspace single-writer; cross-workspace contention needs different tuning)
- "Looks Done But Isn't" pattern: SUMMARY.md commits succeed but post-fan-in audit shows missing subagent contributions

**Phase to address:**
**Phase A (lock semantics)** — promote the lock primitive before any `parallel.dispatch` implementation lands. Verification: contract test for cross-workspace `jj squash` race; assertion of `divergent()` revset empty after fan-in.

---

### Pitfall 2: In-tree conflict on octopus merge silently passes through reap

**What goes wrong:**
The jj backend already exposes `vcs.workspace.merge({branch, message, ff: false, mainBookmark, agentBookmark})` (Phase 7 VCS-12) which does a 2-parent `jj new` with atomic main-advance + agent-bookmark delete (D-03). Lifting this to N-parent octopus merge means `vcs.parallel.fanIn(branches[])` calls `jj new` with N parents. If any pair of branches conflicts in-tree, jj's "conflicts as first-class data" model **does not fail the merge** — the merge change is created with conflict markers stored in the change's tree, and `jj log` happily shows the merge as a single change with N parents. `reap.ts:isEmptyHead` probes via `jj diff --from <parent> --to <head>` (line 60-69) — that probe returns NON-empty for a conflict (the conflict markers are tree content), so reap classifies the conflicted merge as "non-empty, real work, append to incomplete-work.md." The orchestrator then sees the merge in the incomplete-work queue, the D-14 gate trips, and a phase-merge attempt throws `VcsIncompleteSubagentsError` — **but the orchestrator has no idea WHY**, because the queue entry says "crashed-with-uncommitted-work" (reap.ts:187), not "in-tree conflict in the merge change."

The same probe form is reused for fan-in correctness on the git side: git's `git merge --no-ff` *does* fail on conflict (returns non-zero, leaves the index with conflict markers), but the existing `execute-phase.md` cleanup-tail snippet (~lines 781-808) does not branch on merge exit code distinctly from worktree-removal failure — both produce "manual cleanup required" prose. Cross-backend, the conflict signal must be **explicit** and **the same shape** on both sides.

**Why it happens:**
- jj's "conflict-tolerant return" (one of the v1.0 SQUASH-* requirements per PROJECT.md) was a *feature* at the commit level — it lets `jj squash` succeed in the presence of an ancestor conflict the user can resolve later. v1.3 inherits that semantic but at the *merge* step, where the desirable behavior is to surface the conflict to the orchestrator, not hide it in tree content.
- Reap's classifier collapses "head has work" into ONE bucket ("incomplete"); v1.3 needs at minimum two: "incomplete agent work" vs. "in-tree conflict in merge."
- Existing `vcs.refs.conflicts()` (Phase 3 CONFLICT-01..03) detects conflicts but is not wired into `workspace.merge` or fan-in path.

**How to avoid:**
- **Conflict-explicit fan-in contract:** `vcs.parallel.fanIn` returns `{mergeRev, conflicted: boolean, conflictedPaths: string[]}`. Both backends populate `conflicted` from the post-merge `vcs.refs.conflicts()` probe. On jj: `jj log -r 'conflicts()' --no-graph` (the existing CONFLICT-01 revset); on git: parse `git merge` exit code + `git diff --name-only --diff-filter=U`.
- **Reap classifier extension:** add a `'merge-in-tree-conflict'` reason to `IncompleteWorkEntry` (currently `'crashed-with-uncommitted-work'` is the only `reason`). The orchestrator can then distinguish "agent failed mid-task" from "fan-in conflict needs human resolve."
- **Don't conflate conflicts with crashes:** `isEmptyHead` probe in reap.ts MUST be augmented with a conflict probe before the "non-empty → crash" branch fires. Order: empty? → abandon. Has conflicts? → flag as merge-conflict. Else? → crash.
- **Lint guard for the new branch:** add a regex that catches any `parallel.fanIn` consumer that ignores `result.conflicted` (similar to the no-bare-toBeTruthy discipline from v1.2 PITFALLS Pitfall 3).

**Warning signs:**
- `incomplete-work.md` entries with `reason: 'crashed-with-uncommitted-work'` for subagents that never crashed
- Phase-merge gate (`VcsIncompleteSubagentsError`) trips but git's `jj log -r 'conflicts()'` shows the conflict is in the *merge change itself*, not any subagent head
- Cross-backend test divergence: same fixture passes on jj (conflict tolerated) and fails on git (merge exit code non-zero) — but BOTH are wrong because both should surface the conflict to the caller

**Phase to address:**
**Phase B (jj parallel verbs)** + **Phase C (git parallel verbs)** must ship the `{conflicted, conflictedPaths}` return shape together (same-PR coupling per v1.2 retrospective's "Same-commit / same-PR sequencing constraints" pattern). **Phase D (reap classifier)** extends the `reason` enum.

---

### Pitfall 3: Partial-wave failure leaves orphaned workspaces with no recovery contract

**What goes wrong:**
`vcs.parallel.dispatch([A, B, C, D])` creates four workspaces. A and B finish; C crashes mid-execution (Claude Code subagent timeout, OOM, runtime error); D is still running. The orchestrator now has:
- 2 workspaces with squashed commits ready to merge (A, B)
- 1 workspace with a non-empty `@` carrying half-written code (C)
- 1 workspace mid-write whose `@` is whatever state jj's last auto-snapshot captured (D)

Today's `vcs.workspace.reap` (Phase 4) is designed for a **quiescent post-wave** call — all subagents have exited, the orchestrator iterates known workspaces. It assumes "if a workspace's `@` has work, the agent crashed" (`reap.ts:160-194`). For an in-flight D, that assumption is wrong: D's `@` having work means "D is still working." Reap on a live D will squash the in-flight content as `'subagent N: incomplete work'` (`reap.ts:167`), abandoning the agent's progress AND blowing away the D-14 gate's correctness (the orchestrator sees "queue non-empty" and refuses the phase-merge, even though D might finish in 30 seconds).

The git side has the equivalent failure: `git worktree remove --force` (`execute-phase.md:795`) succeeds even when a process inside the worktree is actively writing. The agent's last-second file write lands in a directory that no longer exists; git's index update from the worktree is a no-op because the worktree metadata is gone. Silent data loss.

**Why it happens:**
- The current execute-phase.md "Wait for all agents in wave to complete" step (line 681) relies on the *agent* returning a completion signal. Agents that timeout / crash without signaling never trigger the wait-exit. The configurable stall-surveillance (line 720) eventually surfaces the stall but the recovery path is `kill and retry` or `continue waiting` — neither is "preserve partial work + clean up cleanly."
- Reap's two-bucket classifier (abandon empty / queue non-empty) has no third bucket for "still alive — do not touch."
- jj's per-workspace auto-snapshot is a *liveness indicator*: a workspace whose `@` updated in the last N seconds is probably live. The current reap doesn't consult this.

**How to avoid:**
- **Liveness gate before reap:** `parallel.fanIn` MUST probe each workspace for liveness before reaping. On jj: read the workspace's `@` operation-log timestamp via `jj op log --workspace <name> -n 1 -T 'time' --no-graph` — if newer than `dispatch_start + max_subagent_runtime`, the workspace is presumed live and reap refuses (returns `{partial: true, liveWorkspaces: [...]}`). On git: `lsof | grep <worktree_path>` or simpler — check mtime on common files. (LOW confidence on the exact liveness primitive; needs probe in Phase B.)
- **`partial: true` recovery contract:** `parallel.fanIn` returns `{merged: [...], unmergeable: [...], live: [...], partial: boolean}`. Caller (orchestrator) decides whether to wait, kill, or partial-merge. Single shape across backends.
- **Forbid `--force` removal in the cross-backend path:** the existing `git worktree remove --force` at line 795 must become `git worktree remove` (no force) with explicit conflict-handling above. Force-removal is a property of the *cleanup-tail snippet* (the residual-cleanup path), not the standard wave contract.
- **Test fixture:** spawn a workspace whose mock-agent sleeps 60s, dispatch fan-in at +5s, assert `partial: true` and the live workspace is untouched.

**Warning signs:**
- Reap appending to incomplete-work.md for agents that completed *after* reap ran (timing-dependent test flakes)
- `git worktree remove --force` succeeds but post-cleanup file system has dangling `.git/worktrees/<name>/locked` markers
- jj's `jj op log` showing operations from a workspace AFTER `jj workspace forget` for that workspace (auto-snapshot fired during the forget window)

**Phase to address:**
**Phase B (jj parallel verbs)** ships the liveness probe; **Phase C (git parallel verbs)** ships the equivalent; **Phase E (orchestrator rewire)** consumes the `{partial, live[]}` contract.

---

### Pitfall 4: Agent-bookmark cleanup race when N workspaces race for the same main bookmark

**What goes wrong:**
Phase 7's `workspace.merge` (VCS-12) ships atomic main-advance + agent-bookmark delete (D-03). The atomicity guarantee is *for a single merge*: one workspace calling `workspace.merge` advances main and deletes that one workspace's agent bookmark in one jj operation. The contract was *not* designed for N concurrent workspaces all calling `workspace.merge` against the same main bookmark.

If `parallel.fanIn` is implemented as "for each workspace, call workspace.merge sequentially," the main bookmark advances N times serially — that works but defeats the parallelism (and the second through Nth merges are 2-parent merges against the previous-merged result, not the N-parent octopus the jj backend should produce). If implemented as "all N workspaces call workspace.merge concurrently," the agent-bookmark delete operations interleave: workspace A's delete fires while workspace B is reading the main bookmark; B's stale read causes B's main-advance to clobber A's. jj's operation log makes this *recoverable* (`jj op log` + `jj op restore`), but the agent-bookmark for B is now gone AND main points at A's tip — B's work is reachable via `jj log` but the "is B merged?" check (which the orchestrator does via `vcs.refs.bookmarks.exists('gsd/phase-XX-subagent-B')` — *expected absent*) wrongly reports B as merged.

Plan 02 of Phase 7 already caught a milder version of this: "`workspace.merge`'s built-in agent-bookmark delete doesn't cover all cases — git `branch -D` fails silently while the worktree is still checked out" (MILESTONES.md v1.1 Plan 02 deviation). The executor's workaround was an explicit `bookmarks.delete({ force: true })` cleanup step. v1.3's N-way fan-in compounds this: N workspaces, N possible silent-fail branch deletes on git, with no current contract for what "all N succeeded" looks like.

**Why it happens:**
- VCS-12 was specified for sequential wave-cleanup (one workspace per merge call). The atomicity scope is single-operation, not single-fan-in.
- Git's `branch -D` semantics differ between "branch checked out elsewhere" (fails) and "branch fully merged" (succeeds quietly). The N-workspace case multiplies the cross-state combinations.
- jj's bookmark operations are repo-scoped (in `.jj/repo/`), not workspace-scoped — concurrent bookmark mutations from N workspaces all hit the same target file.

**How to avoke:**
- **Octopus merge, not sequential merges:** `vcs.parallel.fanIn` on jj MUST use one N-parent `jj new -m '...' <parent1> <parent2> ... <parentN>` (with the gsd-prefix `--at-operation` discipline to guarantee a single op-log entry). One operation, N parents, atomic. On git: `git merge --no-ff <parent1> <parent2> ... <parentN>` (octopus form) — verified to exist on modern git (>=2.0).
- **Batch agent-bookmark delete in one op:** after the octopus merge succeeds, delete all N agent bookmarks in a *single* `jj bookmark delete <name1> <name2> ... <nameN>` invocation (or under one operation lock). Mirror on git with one `git update-ref -d` batch.
- **Post-fan-in audit:** `parallel.fanIn` returns `{deletedBookmarks: string[], surplusBookmarks: string[]}`. Caller asserts `surplusBookmarks.length === 0`. Lint contract: any `parallel.fanIn` consumer that ignores `surplusBookmarks` fails CI.
- **Lock scope:** the repo-scoped lock from Pitfall 1 covers the entire fan-in window (octopus merge + bookmark batch delete) — both happen under one lock acquisition.

**Warning signs:**
- Post-fan-in, `vcs.refs.bookmarks.list()` returns more `gsd/phase-XX-subagent-*` bookmarks than the dispatch created (cleanup miss)
- "branch -D failed: branch in use" warnings in CI logs that were not present before v1.3
- Intermittent test failure: `expect(vcs.refs.bookmarks.exists('gsd/phase-XX-subagent-3'))` returns true on jj-lane but false on git-lane (the racing-deletes manifest differently per backend)
- jj's `divergent()` revset returning the agent bookmark targets (the bookmark survived a rebase that should have deleted it)

**Phase to address:**
**Phase B (jj parallel verbs)** uses true octopus form, batch bookmark delete; **Phase C (git parallel verbs)** mirrors; **Phase F (cross-backend contract tests)** verifies surplus-bookmarks == 0 on both backends with N=4 contention.

---

### Pitfall 5: Git `worktree add` `.git/config.lock` race on simultaneous dispatch

**What goes wrong:**
The current `execute-phase.md` at line 537 explicitly documents this trap: *"Do NOT send all Agent calls in a single message: simultaneous `git worktree add` calls race on `.git/config.lock`. Agents still run in parallel once their worktrees are created."* The workaround today is *prompt-level serialization*: dispatch Agent() calls one-at-a-time with `run_in_background: true` — the worktrees are created sequentially, then run in parallel.

Lifting this into `vcs.parallel.dispatch(plans[])` means the verb's implementation must *internally* serialize the `git worktree add` invocations. The naive "Promise.all([for each plan: addWorktree, spawn])" pattern races. The naive "for...of + await" works but loses observability (the orchestrator can't see "worktree 2 of 4 created, agent 1 already executing"). And the failure mode is silent-on-success — the race usually loses only one worktree create, the agent gets a "worktree exists" error or no worktree at all, and the wave's `WAVE_WORKTREE_MANIFEST` (line 651) has fewer entries than expected.

Plan 02 of Phase 7 already discovered the git-side asymmetric failure: "git `branch -D` fails silently while the worktree is still checked out" (MILESTONES.md v1.1 Plan 02 Deviations). The cleanup-side equivalent of this dispatch-side race.

**Why it happens:**
- `git worktree add` touches `.git/config` to write `worktree.X` entries; concurrent writes from N invocations race on `.git/config.lock` per the longstanding git internals model.
- The current workaround lives in *prompt text* (markdown), not in code — `vcs.parallel.dispatch` taking a list of plans must enforce serialization itself; the markdown rule becomes invisible once the verb internalizes the loop.
- The jj side does NOT have this problem (jj's workspace add uses operation log, not `.git/config`) but the cross-backend contract must hide this asymmetry — neither caller should need to know.

**How to avoid:**
- **Serialize `workspace.add` invocations inside `parallel.dispatch`:** the verb's implementation has an internal lock around the `workspace.add` call. Concurrency of N workspaces × 4 plans hits a single `for (const plan of plans) await this.workspace.add(...)` loop.
- **Make the serialization observable:** emit checkpoint events between worktree creates so the orchestrator can stream `[checkpoint] worktree 2/4 created` (mirrors the existing `[checkpoint]` heartbeat at line 688).
- **Document the cross-backend asymmetry in the verb's JSDoc, not in workflow markdown.** The jj backend's `parallel.dispatch` *could* parallelize workspace.add safely (jj has no `.git/config.lock` analog) — but doing so introduces a behavioral asymmetry that the cross-backend test suite can't catch. Pick serialize-everywhere; document the choice.
- **Test the race:** contract test that fires `parallel.dispatch` for N=8 plans and asserts `WAVE_WORKTREE_MANIFEST.length === 8`. Run 20× in CI to catch the race. (See Pitfall 9 on flakiness budget.)

**Warning signs:**
- `WAVE_WORKTREE_MANIFEST` has fewer entries than dispatched plans
- `git worktree list` shows worktrees absent from the manifest (one create succeeded, manifest write didn't)
- CI flakes in dispatch tests that pass locally (CI's slower disk → wider race window)

**Phase to address:**
**Phase C (git parallel verbs)** internalizes the serialization; **Phase E (orchestrator rewire)** deletes the markdown serialization rule because the verb handles it.

---

### Pitfall 6: A3 colocated pre-commit fix path — Path 1 (always-fire) is least invasive but has cross-backend test cost; Path 2 (probe + cache) has upstream-rebase conflict risk; Path 3 (wait for upstream) is already de-facto rejected by v1.3 scope

**What goes wrong:**
The A3 colocated pre-commit gap (`project_a3_colocated_pre_commit_gap` memory) carries from v1.0. Phase 4 LEARNINGS Open Q1 (recovered from archived git history, commit `51ee72a3`) documents three fix paths. v1.3 must ship one. Each has distinct trade-offs:

**Path 1 — Always fire from the adapter regardless of colocation mode.**
The adapter's `commit()` always calls `fireHook('pre-commit', ...)` even when `.git` is colocated. Override env `GSD_HOOK_SKIP_COLOCATED` for the future case where jj upstream lands native auto-fire.
- **Invasiveness:** LOW. ~5 LOC change in `sdk/src/vcs/backends/jj.ts:commit()` (delete the D-10 colocated branch).
- **Test cost:** MEDIUM. Every test that asserts "pre-commit fired once" must be re-audited; colocated tests will now see one fire from the adapter + (depending on jj version) zero or one from jj's own future export. The override env is the test seam.
- **Upstream-rebase conflict risk:** LOW. The change touches the fork-only D-10 logic, not upstream surface.

**Path 2 — Detect colocation at adapter init + probe jj version's auto-fire behavior; cache result.**
At `createJjAdapter()`, run a one-shot probe: create a sentinel hook, do a no-op squash, check whether the sentinel fired. Cache. Skip adapter-fire if probe shows jj auto-fires.
- **Invasiveness:** HIGH. ~50-80 LOC probe + cache + invalidation. Probe needs a tmp hook install + cleanup; failure modes (probe interrupted, sentinel left on disk, race against real commits during init).
- **Test cost:** HIGH. Probe path needs its own tests (probe succeeds, probe fails-open, probe race). And every existing "pre-commit fires" test needs probe-mocking infrastructure.
- **Upstream-rebase conflict risk:** MEDIUM-HIGH. The probe touches `commit()` AND adapter init AND the cross-backend factory — all surfaces that change in upstream rebases. Every weekly upstream sync becomes a 3-file conflict surface.

**Path 3 — Wait for jj upstream + document as known-issue.**
Already de-facto rejected: v1.3 PROJECT.md scope explicitly says *"jj 0.41 colocated `jj squash` fires `.git/hooks/pre-commit` reliably"* as a target outcome. Path 3 contradicts the milestone scope.

**Why it happens:**
- The Phase 4 LEARNINGS recommendation was Path 1; the recommendation has held for two milestone cycles without action because A3 was deferred each time.
- Path 2's appeal is "robust to future jj versions" — but jj's release cadence is fast (0.39 → 0.40 → 0.41 over a few months), so "future-proof" is a moving target; the probe needs re-validation per jj version anyway.
- The override env (`GSD_HOOK_SKIP_COLOCATED`) for Path 1 is the cheap insurance — if jj 0.42 lands native auto-fire, flip the env in CI.

**How to avoid:**
- **Pick Path 1.** Lowest invasiveness, lowest test cost (the override env is a clean test seam), lowest upstream-rebase conflict risk. The dup-fire risk is benign per Phase 4 LEARNINGS Q1: *"hooks should be idempotent or guard themselves."*
- **Verify hook idempotency at fix time:** audit `.githooks/pre-commit` and any project hooks for non-idempotent operations (e.g. log-append, counter-increment). Document the idempotency requirement in the hook author's guidelines.
- **Override env semantics:** `GSD_HOOK_SKIP_COLOCATED=true` is the escape valve for the future case. Add a contract test that asserts `commit()` does NOT fire pre-commit when this env is set on a colocated repo.
- **Test pyramid:** unit test in `sdk/src/vcs/__tests__/jj-hooks.test.ts` for the always-fire path; integration test on the jj-colocated CI lane validates real `.git/hooks/pre-commit` firing.

**Warning signs:**
- Hook authors complain about "pre-commit running twice" — that's a *hook* idempotency bug surfaced by Path 1, not a fix-path bug. Document the idempotency expectation and link to the bug-tracker if a real hook trips.
- A test asserts "pre-commit fired N times" — should be "pre-commit fired AT LEAST ONCE" (the cross-backend invariant) unless N is part of the contract.

**Phase to address:**
**Phase G (A3 fix)** — small standalone phase, single plan, ~3-5 tasks (delete D-10 branch, add override env, audit hooks for idempotency, ship contract test, validate on jj-colocated CI lane). Should NOT be bundled with the parallel-dispatch phases (different surface, different reviewers).

---

### Pitfall 7: Lint guard regression watch after v1.3 collapses the last raw-git exception

**What goes wrong:**
v1.3 closes the last documented raw-git exception (`get-shit-done/workflows/execute-phase.md` lines ~714+, plus `quick.md` if present). After v1.3, `scripts/lint-vcs-no-raw-git.allow.json` *entries* drop — but per the v1.2 retrospective the allowlist is **append-rare, remove-aggressive**, and the lint script itself is part of the architectural enforcement (the v1.2 "lint guard IS the enforcer" pattern). The allowlist that survives covers `sdk/src/vcs/backends/git.ts`, `sdk/src/vcs/exec.ts`, test fixtures, and shell-only scripts — the *substrate*, not exceptions.

The trap: v1.3's success removes the most visible exception. Future contributors (or future-Claude in a year) writing new orchestrator-tier code may not know that raw git is forbidden — they see `git.ts` in the allowlist and assume "git is allowed for repo-internal stuff." A new PR adds `execSync('git worktree add ...')` in some helper file; the lint catches it but the developer's fix is to *add the file to the allowlist*, not refactor through the adapter. Repeat → allowlist hollows.

Plan 1 of Phase 8 already hit a milder version (v1.2 retrospective "What Was Inefficient" Plan 1 audit regex missed `\b[0-9a-f]{N}\b` non-anchored form, fixed in WR-07). The meta-lesson: **the lint guard that IS the architectural enforcer needs its own regex coverage audited explicitly, not implicitly.** v1.3's regression watch is whether new contributions add allowlist entries vs. refactor through the adapter.

**Why it happens:**
- "Just unblock CI" is the universal force of decay. v1.2 PITFALLS Pitfall 7 enumerated this taxonomy explicitly.
- The allowlist's `$comment` fields and per-entry `reason` fields are documentation, not gates. CI does not enforce that new entries have unique reasons or that the reason is *valid* (i.e., "this file genuinely cannot use the adapter").
- v1.3 removes a visible-tracked-debt entry; future tracking lacks an equivalent "this is the last exception" marker.

**How to avoid:**
- **Encode "v1.3 zero-orchestrator-exception" as an invariant in the allowlist's `$comment`:** add a phrase like `"$post_v1_3_invariant": "no entries for orchestrator-tier code (workflows/, agents/, commands/, scripts/changeset/, bin/lib/orchestration paths). Files matching these globs require adapter-routed access."` Make the comment field a CI-checked invariant via a lint sub-rule (the lint script reads its own `$comment` block and asserts no new entries match the forbidden globs).
- **Removal-pressure sweep at v1.3 close:** re-audit every surviving allowlist entry; for each, verify the reason is *still* valid (the file truly cannot use the adapter). Record the sweep in the JSON's `$comment` field (precedent: the existing `$comment_2_1_09` field). Pattern: every milestone gets a `$comment_<vN>_close` entry.
- **Audit-regex coverage extension (the v1.2 meta-lesson):** before v1.3 ships, audit the `lint-vcs-no-raw-git.cjs` patterns for completeness against the new forms `vcs.parallel.*` callers MIGHT use — e.g. `child_process.spawn('git', [...])`, `execFile('git', ...)`, `import { execSync } from 'node:child_process'; execSync(\`git ...\`)`. Document any gaps as KNOWN-GAP entries with fix plans.
- **Pre-commit on touched files:** the existing `husky` / `lefthook` setup (per `.githooks/`) should run the lint on every PR — not just CI. Local feedback loop for the contributor.

**Warning signs:**
- New allowlist entries in monthly diff (red flag — entries should decrease post-v1.3)
- New entries that share a `reason` with a previous entry (template-copying instead of justifying)
- PR descriptions including phrases like "added to allowlist for now" or "tracked for follow-up" (the precise pattern that hollows the lint)
- Audit-regex misses: a contributor's PR contains a raw-git form that the lint misses (the form mutated; the audit must add it)

**Phase to address:**
**Phase H (close-gate)** runs the removal sweep + audit-regex completeness check + post-v1.3-invariant encoding. Verification: `$comment_v1_3_close` exists in `lint-vcs-no-raw-git.allow.json` AND the lint's own regex set has a parallel test fixture mirroring v1.2 Plan 1 audit-script test fixtures.

---

### Pitfall 8: `parallelization: true` default-flip strands existing brownfield installs on the old adapter version

**What goes wrong:**
v1.3 flips `parallelization: true` by default. Existing brownfield repos that did `npm install -g get-shit-done@1.2.x` see the new default after upgrade. If they have not regenerated `.planning/config.json` with the new schema, OR if they have customizations that the new dispatcher doesn't honor, OR if their jj is < 0.41 (no octopus support verified), the first parallel phase blows up — and the failure mode depends on the actual broken-ness:

- **No octopus support:** `jj new -A <parent> -B <merge>` rejected as unknown flag → entire dispatch fails before any agent spawns. Recoverable: error message can point to `parallelization: false`.
- **Stale `.planning/config.json` missing the new parallelization sub-schema:** dispatch runs with defaults; if defaults differ from the user's prior bespoke config, silent behavioral change.
- **Agent prompts depend on the deleted raw-git block:** subagents loaded by `gsd-executor.md` or `gsd-debugger.md` reference `git worktree`-shaped paths that no longer exist on a jj-routed dispatch. Agents get confused mid-run.
- **Existing `.planning/` content references `worktree-agent-*` branch names (the historical raw-git naming):** new jj-routed dispatch uses `gsd/phase-XX-subagent-N` (the octopus.ts naming convention) — broken backref hyperlinks in older SUMMARY.md / STATE.md.

The v1.2 migration model (greenfield default + brownfield opt-in, `project_migration_boundary` memory) does NOT cover the default-flip case — that policy is about *which adapter* an existing brownfield project uses, not about *new feature defaults* within an adapter.

**Why it happens:**
- "Default flip" feels like a config change but it's a *contract change* — the orchestrator's promise about "what happens when I dispatch a phase" changes shape.
- Brownfield users don't re-read PROJECT.md or release notes between versions. The first hint that v1.3 changed something is when their next phase break.
- This very repo's `STATE.md` line 80 records the parallelization knob's history: "`parallelization` was flipped on briefly mid-execute, then reverted to false when the gap surfaced." The fork itself has seen this footgun.

**How to avoid:**
- **Pre-flight check in `parallel.dispatch`:** before any state mutation, verify (a) backend supports parallelism (jj >= 0.41 with octopus revsets verified; git >= 2.0), (b) `.planning/config.json` schema version >= the v1.3 schema, (c) no agent-bookmark namespace collision with workspace.list(). Fail fast with actionable error: *"parallelization defaulted to true in v1.3; your repo state is incompatible. Run `gsd-migrate-parallelization` OR set `parallelization: false` in .planning/config.json."*
- **Migration command for the contract change:** ship `gsd-migrate-parallelization` as a one-shot brownfield migration (mirrors `/gsd-migrate-vcs` precedent from v1.0). It probes the repo, fixes config schema, regenerates any stale agent-bookmark references in `.planning/`.
- **Deprecation window:** v1.3.0 ships with `parallelization: true` as the *recommended* default but the *actual* default is `auto` — which probes the repo and chooses `false` if the pre-flight fails. v1.4.0 makes `true` the hard default. (LOW confidence on this — adds release-train complexity; alternative is a one-version explicit changelog entry pinning the migration step.)
- **Test the migration:** snapshot a v1.2-era brownfield repo (with old config, old `.planning/`); run v1.3 against it; assert pre-flight catches all incompatibilities OR `gsd-migrate-parallelization` resolves them.

**Warning signs:**
- Upgrade failures clustered on first phase invocation post-upgrade (the pre-flight should catch these before the failure cluster)
- User reports: "my .planning/ still mentions `worktree-agent-*` but jj-routed dispatch uses different names" (stale backrefs)
- Issue tracker volume spike on a release tagged with this flip

**Phase to address:**
**Phase I (default-flip + migration)** — a separate phase, scheduled near the end of v1.3, with its own pre-flight + migration command + brownfield-regression test fixture. The default flip lands LAST, after all infrastructure (Phases B-F) is shipped, and the migration command is the gate.

---

### Pitfall 9: Test flakiness budget — parallel tests amplify the vitest-perf pain point

**What goes wrong:**
The project memory `project_test_perf_pain_vitest` records vitest as the slow / contended test surface. Adding `vcs.parallel.*` contract tests on top of that surface compounds the problem:

- **Existing pain:** the octopus contract tests at `sdk/src/vcs/__tests__/jj-octopus.test.ts` already self-flag as needing `describe.sequential` (lines 41-47) because "running its `it()` blocks concurrently within the file caused jj working-copy contention per Phase 4 LEARNINGS (~50% wall-clock overhead in CI)." Plan 5 of v1.0's Phase 5 added the `Pattern A` workaround.
- **New pain:** parallel-dispatch tests by design spawn N workspaces and N concurrent commits. Even with `describe.sequential` at the file level, the *within-test* parallelism can race with other concurrent test files (vitest's test-file parallelism is separate from intra-file sequencing).
- **CI cost:** the v1.0 Phase 4 LEARNINGS already records that `jj-integration flakes in sdk/src/vcs/__tests__/` (octopus, lock, hooks, workspace, push-fetch, commit, exec-env-passthrough) "pass in isolation, intermittently fail in bulk runs due to tmpdir / process contention." v1.3 adds another file (likely `jj-parallel-dispatch.test.ts` + `jj-parallel-fanin.test.ts`) to this pool.

The danger isn't just slow CI — it's that **a parallel-dispatch test that flakes erodes confidence in the very subsystem it validates**. If the test for "concurrent squashes don't corrupt the merge" fails 1 in 20 runs because of vitest fixture contention rather than the actual subsystem, the team rationalizes the failure ("just vitest being vitest") and stops caring — exactly when the subsystem might have a real race.

**Why it happens:**
- Vitest's worker-pool default parallelizes across files; intra-file sequencing only protects the file, not the suite.
- jj's working-copy operations write to shared `.jj/repo/op_heads/` — different test repos in different tmpdirs are isolated, but if two test files both create tmpdir repos at the same time, the parent of the tmpdir (often `/tmp` or `$TMPDIR`) can hit fs contention on the inode allocator (rare but documented).
- "I'll just rerun the test" is corrosive when the test is supposed to validate correctness, not perf.

**How to avoid:**
- **Per-block random-prefix mkdtemp (Pattern B from jj-octopus.test.ts:42):** every parallel-dispatch test uses `mkdtempSync(join(tmpdir(), 'gsd-jj-parallel-${random}-'))` to guarantee tmpdir isolation across concurrent test FILES. Mirror the precedent.
- **Triage flakes vs. real failures:** any flake in a parallel-dispatch test gets a *first-class diagnostic*. Don't add `retry: 3` to the test config. Instead: log fixture state on failure (`jj op log`, `jj log -r 'all()'`, `ls -la .jj/repo/op_heads/`) and require the agent investigating the flake to classify it as "race condition in subsystem" or "test infra contention." A separate triage label.
- **Centralize parallel-fixture setup:** one helper `setupParallelTestRepo(opts)` that handles tmpdir + colocated init + N workspaces with deterministic naming. Reuse across all parallel-dispatch tests. Reduces per-test setup divergence (a known source of flake).
- **CI parallel-path lane:** per PROJECT.md v1.3 scope — "New CI matrix lane runs a parallel phase end-to-end on both backends; required-blocking on jj-colocated." This lane runs *one* end-to-end parallel scenario, not the full unit-suite. Loud failure when the scenario fails, separate from unit-suite flakes.
- **Skip-count baseline guard:** the existing `scripts/check-skip-count.cjs` enforces no new skips. Crucially, v1.3 must NOT solve flakes by adding `describe.skip` or `it.skip` — every skip is a regression. The PR cannot merge if the skip count increased.

**Warning signs:**
- Failed CI runs whose failures are concentrated in `sdk/src/vcs/__tests__/jj-parallel-*` files
- A PR that adds `retry: N` to `vitest.config.ts` for any parallel-dispatch test
- A PR whose only changes are "fix flake in parallel-dispatch test" without identifying the root cause
- Skip-count baseline increasing after v1.3 lands

**Phase to address:**
**Phase F (contract tests)** ships the Pattern B random-prefix mkdtemp discipline + the central `setupParallelTestRepo` helper. **Phase H (close-gate)** asserts skip-count unchanged AND CI parallel-path lane is required-blocking.

---

### Pitfall 10: Dogfood phase risks — running v1.3 itself in parallel mid-execution

**What goes wrong:**
The v1.3 dogfood phase (per PROJECT.md scope, *"Dogfood phase (separate, final) — last phase of v1.3 spins up 2-3 synthetic plans on this very repo, runs them in parallel via the new dispatcher"*) runs the new dispatcher against this very repo's `.planning/`. If the dispatcher has a subtle bug — a race condition that triggers only under N≥3, an off-by-one in agent-bookmark cleanup, a workspace.add timeout that's too low — the failure happens *to the repo doing the development of the fix*.

Concrete failure modes:
- **Repo state corruption:** dispatcher hits a bug mid-fan-in; merge change has conflict markers; `.planning/phases/<v1.3-dogfood>/incomplete-work.md` is half-written; `vcs.refs.bookmarks.list()` has stranded `gsd/phase-XX-subagent-*` entries. The repo state is now an artifact of the bug being investigated.
- **Recovery requires the broken dispatcher:** if the bug renders `vcs.parallel.fanIn` unable to complete, the user can't use the dispatcher to recover — they need to fall back to a known-working state (raw git? jj direct?). But v1.3 deletes raw-git from the orchestrator. Manual `jj op restore` becomes the escape valve.
- **`.planning/` write conflicts during recovery:** the recovery is itself a phase of work. If the user runs `/gsd-debug` while the previous dispatch's residual state is still in `.planning/`, the debug session writes can clobber the recovery context.

Phase 4 dogfood for the parallel substrate worked because the substrate was *building, not activating* (Phase 4 D-01 build-now-activate-later per the archived LEARNINGS). v1.3 activates. The dogfood-during-development asymmetry is real.

**Why it happens:**
- Dogfood is fastest signal but highest blast radius — the bug surface is exercised against live state, not synthetic fixtures.
- The v1.2 dogfood succeeded partly because v1.2's surface was a *flip + lint*, not a *new execution path*. v1.3 ships a new execution path; the dogfood phase is the FIRST production use.
- Recovery via `jj op restore` requires user fluency with jj's op log — a known UX cliff.

**How to avoid:**
- **Dogfood is the LAST phase of v1.3, not the first.** Already in PROJECT.md scope. Verify: the roadmap order locks dogfood after Phases B-F-G all close.
- **Pre-dogfood snapshot:** before the dogfood phase opens, capture `jj op log -n 200 > .planning/intel/<v1.3-dogfood-pre>.oplog` and a tarball of `.planning/`. Recovery procedure: `jj op restore <pre-op-id>` + tarball untar. Document the recovery in the dogfood phase's CONTEXT.md.
- **Synthetic plans only:** the dogfood phase's "2-3 synthetic plans" must be DEDICATED dogfood plans (e.g. `add a no-op SDK method, add its test, add its doc`) — NOT existing real work in the milestone queue. Synthetic plans can be discarded; real work cannot.
- **Limit blast radius via dogfood-isolated branch:** the dogfood runs against a dedicated jj bookmark / git branch (`v1.3-dogfood-isolated`), NOT main. Failed dogfood leaves the isolated bookmark in a bad state; main is untouched.
- **Loud-fail on any anomaly:** dogfood phase exit code is binary: pass or full-rollback. No partial success. If any agent bookmarks are stranded, any incomplete-work entries are surplus, any conflicts surface — rollback to pre-dogfood snapshot, fix in a non-dogfood phase, re-run.
- **Metrics, not just pass/fail:** dogfood records to `.planning/intel/<v1.3-dogfood-metrics>.md` — wall-clock per agent, lock-wait durations, agent-bookmark cleanup count, conflict count. Future v1.4 dogfood gets a baseline to compare against.

**Warning signs:**
- Dogfood phase ordered before all infrastructure phases close (would mean dogfood is part-of-the-build, not validation-of-the-build)
- Real work plans being co-opted as "dogfood material" (sunken-cost trap — the work was queued for non-dogfood reasons)
- Lack of pre-dogfood snapshot in the phase CONTEXT.md

**Phase to address:**
**Phase J (dogfood)** — scheduled last in v1.3 roadmap. Verification: pre-snapshot captured, synthetic-only plan list, dogfood-isolated bookmark used, post-dogfood metrics recorded, no real-work plans appear in the dogfood manifest.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Sequential `for...await workspace.merge(...)` instead of true octopus N-parent merge | Reuses Phase 7 VCS-12 verb unchanged; trivial implementation | Defeats parallel-fan-in semantics; agent bookmarks delete in sequence creating race window per Pitfall 4; N-merge is N times slower than octopus | **Never** in v1.3 — true octopus is the point of the milestone |
| Reuse Phase 4 per-workspace `acquireJjWriteLock` as the cross-workspace coordinator | One existing lock primitive instead of two | Per Pitfall 1: lock scope mismatch silently corrupts shared-ancestor squashes | **Never** — distinct sentinel paths for distinct contracts |
| Skip `conflicted` field on `parallel.fanIn` return shape | Smaller verb surface | Per Pitfall 2: in-tree conflicts get classified as crashes; orchestrator can't distinguish; D-14 gate fires with wrong reason | **Never** — conflict signal must cross the verb boundary |
| `git worktree remove --force` for all cleanups | Always succeeds | Per Pitfall 3: silent data loss when an agent is still writing | Only in the cleanup-tail snippet for residual (post-success) cleanup; never in the standard wave path |
| Path 2 (probe-and-cache) for A3 fix | Future-proof against future jj versions | Per Pitfall 6: HIGH invasiveness, MEDIUM-HIGH upstream-rebase conflict risk, doubles test cost | Only if Path 1 is empirically refuted (current evidence is Path 1 is sufficient) |
| Add new files to `lint-vcs-no-raw-git.allow.json` to unblock a PR | PR merges | Per Pitfall 7: allowlist hollowing; v1.3's "zero exceptions" invariant defeated | **Never** post-v1.3 — additions must come with a phase that removes them within one milestone |
| `parallelization: true` hard default at v1.3.0 | One config simpler | Per Pitfall 8: brownfield installs break first-phase post-upgrade | Only with a `gsd-migrate-parallelization` command + pre-flight check + brownfield-regression test |
| `retry: 3` on flaky parallel-dispatch test | CI green | Per Pitfall 9: hides real race conditions in the very subsystem under test | **Never** — flakes must be root-caused, not masked |
| Dogfood v1.3 against real milestone work | Saves writing synthetic plans | Per Pitfall 10: blast-radius corrupts real work; recovery requires manual `jj op restore` | **Never** — dogfood plans are synthetic and discardable |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| jj 0.41 octopus N-parent merge | Assuming `jj new -A -B` (Phase 4 pair-insert form) extends to N parents | Use positional N-arg form `jj new <p1> <p2> ... <pN> -m '...'`; verify with `jj log -r '<merge>+'` showing N parents |
| git octopus merge | `git merge --no-ff <b1> <b2>` (Phase 7 wave-cleanup form) and assuming N>2 just works | Verify git's octopus form for N>2; some git versions require explicit `git merge --no-ff <b1> <b2> <b3>` (no `--strategy` flag); test fixture with N=4 |
| Cross-workspace agent-bookmark delete | One `bookmarks.delete()` per workspace from N concurrent callers | Single batch `jj bookmark delete <n1> <n2> ... <nN>` under the repo-scoped lock from Pitfall 1 |
| `WAVE_WORKTREE_MANIFEST` cross-backend shape | Field `worktree_path` on git → `workspace_path` on jj (naming asymmetry) | Single field `workspace_path` in the manifest schema; both backends populate the same field; migration command handles legacy `worktree_path` reads |
| Workspace cwd assertion after fan-in | Calling `vcs.workspace.list()` from a subagent workspace to discover the merge change | Always call from the main repo root (per `reap.ts:25` D-15 / Pitfall 1: "never from inside a subagent ws") — adapter's `--repository` flag in `jjArgvFlags` makes this enforceable but doesn't enforce cwd discipline |
| Agent-bookmark namespace collision with jj workspace.list() | Workspace name `phase-XX-subagent-N` + bookmark name `gsd/phase-XX-subagent-N` look distinct but the workspace and bookmark share a numeric suffix domain | Lint pattern: any new workspace.add or bookmark.create whose name matches `phase-\d+-subagent-\d+` is co-validated against the existing workspace.list() AND bookmarks.list() to refuse name reuse |
| Octopus marker bookmarks (`gsd/phase-NN-merge-marker`, `gsd/phase-NN-parent-marker`) | Treating them as plumbing — no cleanup contract | Markers persist for idempotency (octopus.ts:108-126); cleanup is part of `complete-milestone`, NOT `parallel.fanIn`. Lint: forbid `parallel.fanIn` from deleting markers |
| `incomplete-work.md` reason enum | Single string `'crashed-with-uncommitted-work'` (today) | Extend to `IncompleteWorkReason = 'crashed-with-uncommitted-work' | 'merge-in-tree-conflict' | 'partial-wave-live-workspace'` per Pitfalls 2, 3 |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Sequential workspace.add inside `parallel.dispatch` for large N | Wave dispatch wall-clock O(N) — defeats parallel speedup | Per Pitfall 5: serialization is correct (git race), but emit progress checkpoints so observed wait time matches expected; consider jj-side parallelism for jj backend only (still gated by Pitfall 5 cross-backend symmetry concern) | N > ~6 plans per wave; dispatch dominates phase wall-clock |
| Lock-wait contention under cross-workspace squash | Lock-acquire timeouts in CI; flaky-on-load tests | Repo-scoped lock from Pitfall 1; tune timeout to `30s × N` for the cross-workspace lock, not the workspace-scoped default; surface wait-duration histogram | N > ~4 concurrent squashes; CI runners with slow disk |
| Per-test full repo re-init | Vitest suite time growth; CI minutes burn | Per Pitfall 9: centralize via `setupParallelTestRepo` helper; reuse one tmpdir per describe-block where invariants permit | Once parallel-dispatch test count exceeds ~10 files |
| Octopus merge probe via `jj log` after every fan-in step | N log invocations per fan-in; serialize against op-log lock | Probe ONCE post-merge with a single `jj log -r 'all()' --no-graph` and parse N parents in one call | N > ~3 |
| `jj op log` for liveness probe at high frequency | Each probe spawns `jj` process; expensive at high freq | Cache liveness probe result for `livenessProbeInterval` ms (e.g. 5000 ms default); invalidate on dispatch state change | Per-second polling; large N |
| Conflict probe via shell-out per workspace | Same as above — N shell invocations | Single batch probe: `jj log -r 'conflicts()' --no-graph` → parse, map to per-workspace via change_id | Always once N > 2 |
| Lint scope growth from new patterns | CI lint step time creep | Keep new patterns regex-based; reuse the v1.2 Plan 1 audit script fixture pattern for verifying new patterns' coverage | Lint runtime > ~5s in CI |

---

## Security Mistakes

(Lower priority — solo-dev repo, no multi-tenant surface — but worth recording.)

| Mistake | Risk | Prevention |
|---------|------|------------|
| Workspace path injection via plan ID containing path separators | Subagent writes outside `.claude/jj-workspaces/`; rm-rf of wrong directory | Reuse the `validateRefname` discipline from Phase 4 D-24 cr-01 fold-in; validate `workspaceName` and `workspacePath` reach the same regex (`[A-Za-z0-9._/-]+`); fail closed |
| Agent bookmark name injection (refname-shaped argv injection) | Crafted bookmark name escapes shell quoting in `jj bookmark delete` argv | The `--` separator pattern from Phase 4 D-24 (cr-01 fold-in) — every `bookmark delete <names...>` invocation passes `--` before name args. Lint guard: every bookmark mutation argv must include `--` separator |
| Reading change_id from untrusted subagent SUMMARY.md content | Subagent emits crafted change_id that `expr.rev` accepts but `jj` rejects with crafted error | Already mitigated by `expr.rev` validator at `sdk/src/vcs/expr.ts:92`; v1.3 verifies no bypass added in parallel verbs |
| `gsd-migrate-parallelization` running with elevated perms / write access during a partial-wave state | Migration writes to `.planning/` while a wave is mid-dispatch → manifest corruption | Migration acquires the repo-scoped lock from Pitfall 1 BEFORE any write; refuses if a wave is in progress |

---

## UX Pitfalls (Developer UX — no end-users)

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Error messages from `parallel.fanIn` say "merge failed" without backend context | Developer can't tell if it's a jj op-log conflict or a git index conflict | Echo the backend kind + the specific failing primitive: `parallel.fanIn[jj]: octopus merge failed at jj new step (3 parents): <stderr>` |
| `incomplete-work.md` reason enum collapses crashes + conflicts (Pitfall 2) | Reader has to walk the merge change to diagnose | Distinct reason values + per-reason recovery hint in the queue line |
| `vcs.parallel.dispatch` returns no progress events | Long dispatch (N=8 workspaces) feels hung | Emit `[checkpoint]`-shaped events (mirror line 688 in execute-phase.md) — `[checkpoint] dispatch X/N created` |
| Default-flip migration error message blames the user | "Your config is wrong" → developer hunts the wrong thing | Pre-flight error per Pitfall 8 names the specific incompatibility AND points to the migration command |
| Dogfood failure dumps raw `jj op log` to stdout | 200-line op-log dump overflows terminal scrollback | Dogfood records to `.planning/intel/<v1.3-dogfood-failure>.md` instead; stdout gets a one-liner pointer |

---

## "Looks Done But Isn't" Checklist

- [ ] **`vcs.parallel.dispatch` lands but raw-git block in `execute-phase.md` still present:** verify by grep — `grep -n "git worktree" get-shit-done/workflows/execute-phase.md` returns zero unjustified hits (some prose mentions OK; executable `git worktree` invocations are not).
- [ ] **Lint allowlist's `execute-phase.md` / `quick.md` entries removed:** `lint-vcs-no-raw-git.allow.json` no longer carries the orchestrator paths. Verify by reading the `entries` array; `$comment_v1_3_close` exists per Pitfall 7.
- [ ] **Cross-backend `parallel.fanIn` `conflicted: boolean` field present on BOTH backends:** type definition shows the field; both backend implementations populate; contract test asserts shape parity.
- [ ] **Repo-scoped lock contract test:** N concurrent `vcs.commit({bookmark: ...})` calls from N workspaces; assert no `divergent()` revset hits, all N commits reachable from final merge, all N agent bookmarks deleted.
- [ ] **A3 colocated pre-commit fires on this very repo:** install a sentinel hook locally, run a real `jj squash`, verify the sentinel ran. (Phase 4 LEARNINGS empirical-probe pattern.)
- [ ] **`parallelization: true` pre-flight catches a synthetic-stale-config brownfield repo:** test fixture has v1.2-shaped config; running v1.3 against it produces an actionable error referencing `gsd-migrate-parallelization`.
- [ ] **CI parallel-path lane is required-blocking:** `.github/workflows/test.yml` has the new lane; `continue-on-error` is false on jj-colocated.
- [ ] **`incomplete-work.md` reason enum extended:** the file's parser at `sdk/src/vcs/jj/incomplete-work.ts` handles all three reasons; D-14 gate's error message distinguishes them.
- [ ] **No `retry: N` config added to vitest:** Pitfall 9 invariant; verify `vitest.config.ts` diff.
- [ ] **Dogfood phase plans are synthetic:** read the dogfood phase manifest; cross-reference against `.planning/ROADMAP.md` to confirm no real-work plans are co-opted.
- [ ] **Skip-count baseline unchanged:** `scripts/check-skip-count.cjs` reports 18 = 18 (or whatever the current baseline is) at v1.3 close.
- [ ] **Octopus marker bookmarks survive `parallel.fanIn`:** `gsd/phase-NN-merge-marker` and `gsd/phase-NN-parent-marker` still resolve after fan-in (idempotency for re-entry; cleaned only at milestone-complete).
- [ ] **Audit-regex completeness check (v1.2 meta-lesson):** the lint guards' regex sets have parallel test fixtures verifying every documented mutation form is caught; new forms `vcs.parallel.*` callers might use are explicitly tested.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Concurrent-squash divergence (Pitfall 1) | MEDIUM | `jj op log` to find the losing op; `jj op restore <pre-divergence>`; replay the losing squash under the repo-scoped lock |
| In-tree conflict misclassified as crash (Pitfall 2) | LOW | Manually re-tag the `incomplete-work.md` entry with the correct reason; resolve conflict; retry merge. v1.3 ships the classifier extension to prevent recurrence. |
| Partial-wave reap of live workspace (Pitfall 3) | MEDIUM-HIGH | `jj op log` for the workspace; `jj op restore` to before the spurious squash; the agent's in-flight work is recoverable from the auto-snapshot history |
| Cross-workspace bookmark race (Pitfall 4) | MEDIUM | Audit `bookmarks.list()` for surplus `gsd/phase-XX-subagent-*` entries; batch-delete; verify no work-loss via `jj log -r 'visible_heads()'` enumeration |
| `.git/config.lock` race (Pitfall 5) | LOW | `git worktree prune --expire now`; rerun dispatch; the failed create's manifest entry is missing — re-dispatch handles |
| A3 fix Path 2 picked instead of Path 1 (Pitfall 6 anti-recovery) | HIGH | Path 2 sprawl is documented in Pitfall 6; recovery means reverting to Path 1 and re-doing the upstream-rebase reconciliation for all Path-2-touched files |
| Allowlist hollowing (Pitfall 7) | LOW (process), MEDIUM (effort) | Removal sweep modeled on v1.2 `$comment_2_1_09` pattern; per-entry re-justify-or-delete; record sweep in JSON `$comment_v1_3_<sweep-date>` |
| Default-flip strand (Pitfall 8) | LOW per repo, HIGH if spread across many brownfield users | Pre-flight catches; `gsd-migrate-parallelization` resolves; if a user already hit the broken state, the migration must include "fix from broken state" not just "fix from valid pre-state" |
| Flaky parallel test masking real race (Pitfall 9) | HIGH | Audit: every parallel-dispatch test that flaked in the last N runs gets a tracking issue with root-cause analysis; refuse to merge any PR until the analysis is complete |
| Dogfood blast-radius (Pitfall 10) | HIGH | Pre-snapshot recovery: `jj op restore <pre-dogfood-op>` + tarball untar `.planning/` from pre-dogfood snapshot. Fix in non-dogfood phase. |

---

## Pitfall-to-Phase Mapping

Suggested phase shape (informs the roadmapper):
**A (lock semantics) → B (jj parallel verbs) → C (git parallel verbs) → D (reap classifier) → E (orchestrator rewire) → F (contract tests) → G (A3 fix, parallel track) → H (lint + close-gate) → I (default-flip + migration) → J (dogfood)**

The G (A3 fix) track can run in parallel with B/C/D since it touches different files.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1 — Concurrent-squash divergence | Phase A (lock semantics) + Phase B/C (verbs consume the lock) | Contract test: N concurrent squashes; `divergent()` revset empty post-fan-in |
| 2 — In-tree conflict silent passthrough | Phase B (jj fanIn) + Phase C (git fanIn) — same-PR coupling per v1.2 retro | `conflicted` field present on return shape; contract test for conflict fixture; reap classifier extension |
| 3 — Partial-wave reap of live workspace | Phase B + Phase C (liveness probe) + Phase E (orchestrator consumes `partial: true`) | Test fixture: agent sleeps 60s, fanIn at +5s; assert `partial: true`, live untouched |
| 4 — Agent-bookmark cleanup race | Phase B + Phase C (true octopus + batch bookmark delete) + Phase F (cross-backend contract test with N=4) | Post-fan-in `bookmarks.list()` surplus count == 0 on both backends |
| 5 — `.git/config.lock` race | Phase C (internalize serialization) + Phase E (delete markdown serialization rule) | Contract test with N=8 dispatch; manifest length == 8 in 20 sequential runs |
| 6 — A3 fix-path choice | Phase G (parallel track) — Pick Path 1; verify hook idempotency | Contract test: pre-commit fires on `jj squash` colocated; `GSD_HOOK_SKIP_COLOCATED=true` skips fire |
| 7 — Lint regression watch | Phase H (close-gate) — removal sweep + `$comment_v1_3_close` + audit-regex completeness | `lint-vcs-no-raw-git.allow.json` has zero orchestrator-tier entries; new sub-rule asserts no entries match forbidden globs |
| 8 — Default-flip strand | Phase I — pre-flight check + migration command + brownfield regression fixture | Synthetic v1.2-shaped repo fixture; pre-flight catches; migration resolves |
| 9 — Test flakiness amplification | Phase F (contract tests) — Pattern B random-prefix mkdtemp + `setupParallelTestRepo` helper + skip-count guard | Skip-count baseline unchanged; parallel-path lane required-blocking; no `retry: N` in vitest config |
| 10 — Dogfood blast-radius | Phase J (dogfood, last) — pre-snapshot + synthetic plans + isolated bookmark + loud-fail-rollback | Dogfood phase's CONTEXT.md has the pre-snapshot procedure; manifest contains only synthetic plans |

---

## Meta-Lesson: Audit-regex coverage check is mandatory before any "audit-then-flip" phase

The v1.2 retrospective records the "Plan 1 audit regex missed `\b[0-9a-f]{N}\b` non-anchored form" as the canonical pattern: any audit-then-flip workflow needs its own audit regex coverage check. v1.3 has several audit-then-flip surfaces:

1. **Audit of orchestrator raw-git** → flip to `vcs.parallel.*`. The audit regex (the `lint-vcs-no-raw-git.cjs` patterns) must cover all forms the new code might introduce. Pre-Phase-B: extend the patterns to catch `child_process.spawn('git', ...)`, `execFile('git', ...)`, template-literal forms, dynamic-require forms. Document the pattern set as a closed enum in the lint script's header comment.
2. **Audit of agent-bookmark naming** → flip to canonical `gsd/phase-NN-subagent-N` form. The audit must cover legacy `worktree-agent-*` names (from raw-git era) and `phase-XX-…` workspace names. Pre-Phase-I migration: extend the migration regex set to cover all observed legacy forms; test fixture has examples of each.
3. **Audit of `incomplete-work.md` `reason` field** → extend the enum. The audit must cover all existing reason strings in the wild. Pre-Phase-D: grep `.planning/phases/*/incomplete-work.md` for `reason:` lines; record the closed enum.

For each: mirror v1.2's three-layer pattern — **closed verdict enum + JSON sidecar + lint allowlist**. Audit emits JSON; lint consumes JSON; the first-green-run of the lint IS the FLIP completeness proof (the v1.2 "lint guard IS the enforcer" pattern).

---

## Sources

**This codebase (file:line — primary evidence):**
- `sdk/src/vcs/jj/octopus.ts` — `createPhaseStructure` (lines 102-189), `createSubagentHead` (lines 206-266), `createSubagentSlot` (lines 280-324); `--no-edit` invariant (WS-10); marker bookmark idempotency (lines 108-126)
- `sdk/src/vcs/jj/reap.ts` — `performJjReap` (lines 117-198); `isEmptyHead` probe (lines 54-70); two-bucket classifier (lines 131-194); `IncompleteWorkEntry.reason` (line 187)
- `sdk/src/vcs/jj/lock.ts` — `acquireJjWriteLock` (lines 80-152); per-workspace sentinel at `.jj/working_copy/gsd-lock`; 30s default timeout (line 52)
- `sdk/src/vcs/__tests__/jj-octopus.test.ts:41-47` — `describe.sequential` workaround for working-copy contention (existing flake-mitigation pattern, evidence for Pitfall 9)
- `sdk/src/vcs/__tests__/jj-reap.test.ts` — D-14 gate test (lines 153-196); inclusion-filter (lines 79-94); empty-head (96-113); crash-recovery (115-151)
- `sdk/src/vcs/backends/jj.ts:1047-1065` — `workspace.add` mkdir-p (RESEARCH Pitfall 4 confirmed)
- `get-shit-done/workflows/execute-phase.md:535-543` — explicit documentation of `.git/config.lock` race (Pitfall 5 evidence)
- `get-shit-done/workflows/execute-phase.md:567-585, 758-808` — current raw-git block to delete (the v1.3 target)
- `scripts/lint-vcs-no-raw-git.allow.json` — current allowlist shape + `$comment_2_1_09` removal-sweep precedent
- `scripts/lint-vcs-no-commit-id.cjs:66-69` — WR-07 audit-regex completeness lesson (the v1.2 meta-lesson)
- `.planning/PROJECT.md` — v1.3 scope, key decisions, unified revision model invariant
- `.planning/STATE.md:79-80` — A3 carry-forward + parallelization knob history
- `.planning/MILESTONES.md` v1.1 Plan 02 Deviations — agent-bookmark cleanup race precedent for Pitfall 4
- `.planning/RETROSPECTIVE.md` — "What Was Inefficient" Plan 1 audit-regex miss → v1.3 audit-regex coverage check (meta-lesson)
- Archived (`git show 51ee72a3:.planning/phases/04-workspaces-octopus-structure-hooks/04-LEARNINGS.md`) — Phase 4 LEARNINGS Open Q1, three fix paths (Pitfall 6 source)
- `.planning/milestones/v1.2-research/PITFALLS.md` — prior pitfalls file shape, lint allowlist pattern lessons, "Looks Done But Isn't" pattern

**Project memory:**
- `project_no_parallelization_yet` — parallelization knob OFF; flipping it dispatches raw-git worktrees, not jj-workspace; blocked on rewriting execute-phase.md
- `project_a3_colocated_pre_commit_gap` — three fix paths owned by Phase 5 (now Phase G in v1.3)
- `project_squash_model` — squash-centric commit model; `jj squash` (not `jj commit`); WC snapshots always allowed; never `--ignore-working-copy`
- `project_no_raw_git` — VCS adapter must cover read AND write; whole-repo default-deny lint guard; `git status` perturbs colocated jj state
- `project_test_perf_pain_vitest` — vitest suite is the slow surface; parallelism amplifies contention (Pitfall 9)
- `feedback_sdk_commit_jj_safe` — `gsd-sdk query commit` routes correctly through jj post-B-08; relevant for Pitfall 1's squash-routing assumption

**External — verified behavior:**
- jj 0.41 octopus `jj new <p1> <p2> ... <pN>` — verified locally in Phase 4 plan 05 (per `sdk/src/vcs/jj/octopus.ts:227-247` comments)
- jj 0.41 `divergent()` revset — verified in Phase 3 CONFLICT-01..03 work; relevant for Pitfall 1 detection
- jj 0.41 `conflicts()` revset — Phase 3 CONFLICT-01..03 shipped; relevant for Pitfall 2 fix
- Git `git merge --no-ff` octopus form for N>2 — documented; needs explicit test fixture in Phase F

---

*Pitfalls research for: GSD jj-port v1.3 cross-backend parallel-dispatch verbs (`vcs.parallel.*`)*
*Researched: 2026-05-15*
