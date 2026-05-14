# Phase 7: Reconcile fork capabilities with upstream - Context

**Gathered:** 2026-05-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Close the gaps the May 2026 upstream merge exposed. Concretely:

1. Add 7 missing `VcsAdapter` verbs (git + jj backends each):
	- `refs.bookmarks.currentIn(cwd)`
	- `refs.mergeBase(a, b)`
	- `diff({ rev, diffFilter, nameOnly })`
	- `status({ porcelain, cwd })` (scoped variant of existing verb)
	- `workspace.merge({ branch, message, ff: false })`
	- `workspace.remove(path, { force })`
	- `refs.bookmarks.delete(name, { force })` (extend existing verb with `force`)
2. Wire `gsd-sdk query worktree.cleanup-wave` through the new verbs, replacing the `not_implemented_in_jj_port` stub at `get-shit-done/bin/lib/worktree-safety.cjs:382-411`.
3. Drop the raw-git `else`-branch fallbacks in `get-shit-done/workflows/execute-phase.md` and `get-shit-done/workflows/quick.md` (TODO(jj-port) comments at ~line 784/796) once the executor is wired.
4. Migrate `scripts/changeset/github-release-notes.cjs` to the cross-backend adapter; drop the `vcs-lint:allow-git-here` exception.
5. Verify upstream's new test surfaces (`installer-migrations`, `shell-command-projection`, `query-raw-output-projection`) pass on both backends; fix jj-side failures in this phase.

Single phase, sequential prefix (verbs → executor wire) then parallel fan-out for the remaining work (workflow .md cleanup, release-notes migration, test-surface triage) using Phase 4's `octopus.ts` + `reap.ts` directly — not via the new wave-cleanup executor.

</domain>

<decisions>
## Implementation Decisions

### Verb shapes (the 7 missing adapter operations)

- **D-01:** `workspace.merge({ branch, message, ff: false })` on jj is rendered as `jj new -r <main-bookmark> -r <agent-bookmark>` + `jj describe -m '<msg>'`. The 2-parent change preserves both-parent provenance — the exact reason upstream chose `git merge --no-ff` over fast-forward. `change_id` of the agent's work stays stable (no rebase). On git, mirrors upstream verbatim: `git merge --no-ff -m '<msg>' <branch>`.

- **D-02:** When the 2-parent `jj new` produces an in-tree conflict (jj's conflict-tolerant model keeps the change), `workspace.merge` returns `{ ok: false, conflicted: true, change_id }` and does NOT auto-abandon. Mirrors Phase 3 `commit()` conflict semantics (SQUASH-06). Caller decides resolution path. No adapter-side auto-undo.

- **D-03:** On successful `workspace.merge`, the verb does TWO things atomically: (a) advance the main bookmark to the new merge change (`jj bookmark set <main> -r @`), AND (b) `jj bookmark delete <agent>`. Single verb call, fewer adapter round-trips in wave-cleanup. **Note:** this overlaps with verb #7 (`bookmarks.delete`), which still exists for other callers — `workspace.merge` is a shortcut path, not a replacement. Git mirror: `git merge --no-ff …` + `git branch -D <agent>` in one verb body.

- **D-04:** `refs.bookmarks.currentIn(cwd)` returns `string[]` — matches Phase 2.1 D-15 (`currentBookmarks` already returns `string[]` because multiple jj bookmarks can point at the same change). Wave-cleanup picks the expected agent bookmark from the array using the manifest, which already names it. No single-string overload.

- **D-05:** `refs.mergeBase(a, b)` returns `change_id` on jj backend, commit hash on git backend. **User override of recommendation** — jj-idiomatic shape wins despite the known rebase-stability tradeoff (if the meet point gets rebased between mergeBase and downstream consumers, the range silently changes). Wave-cleanup's tight call sequence (mergeBase → diff → done) makes intervening rebase essentially impossible in practice. Aligns with the project-wide preference for change_id over commit_id in .planning files and adapter surfaces.

- **D-06:** `diff({ diffFilter })` accepts a typed TypeScript enum: `'added' | 'modified' | 'deleted' | 'renamed' | 'typechange'`. Backend translators emit the right flag: git gets `--diff-filter=D` (single letter); jj backend post-filters `jj diff --name-only` output by status classification (jj 0.41 has no native diff-filter flag). Type-safe, no leaking git's single-letter convention onto the cross-backend surface (consistent with the Phase 2.1 D-01 "no git terminology leaks" rule). Single-filter only — array form deferred (current consumer uses only `'deleted'`).

- **D-07:** `status({ cwd })` adds optional `cwd` to the existing `status()` opts object. Defaults to the adapter's construction cwd if omitted. Internal exec passes `-C <wt>` to git or `--repository <wt>` to jj. Smallest surface change — no sibling `statusIn` verb, no `vcs.in(cwd)` sub-adapter pattern.

- **D-08:** `workspace.remove(path, { force: true })` on jj does BOTH `jj workspace forget <name>` AND `fs.rm -rf <path>`. Matches `git worktree remove --force` byte-for-byte. The existing `workspace.forget` from Phase 4 stays as the metadata-only primitive; `workspace.remove` is the wave-cleanup-friendly composite verb. No flag-controlled overload — two verbs, two distinct semantics.

- **D-09:** `refs.bookmarks.delete(name, { force: true })` — extend the existing `bookmarks.delete` verb (REFS-03) with an optional `force` flag. On git, `--force` translates to `branch -D` (vs `branch -d`). On jj, `bookmark delete` already removes the bookmark regardless of state, so `force` is a no-op flag preserved for API parity. **Note:** D-03 makes `workspace.merge` already do the agent-bookmark delete; the standalone `bookmarks.delete({force})` verb still exists because wave-cleanup uses it for branches the merge step doesn't touch (e.g., the orchestrator's own throwaway branches).

### Phase scope and sequencing

*Decisions D-10..D-13 are orchestration-level — honored by the wave structure across plans 01–05, not per-task trackable. Tagged [informational] for decision-coverage gate purposes.*

- **D-10 [informational]:** Single Phase 7 covers all five PROJECT.md deliverables. No split into Phase 7+8 or Phase 7+7.1 INSERTED — the work is one cohesive "reconcile with the merge" story, and v1.1 is a small milestone where coordination overhead doesn't pay off.

- **D-11 [informational]:** Sequential prefix → parallel fan-out:
	- Plan 1 (sequential): Land the 7 adapter verbs (types.ts + git backend + jj backend + contract tests per verb). Mechanical pattern, but verbs must exist before downstream wiring.
	- Plan 2 (sequential): Wire `worktree.cleanup-wave` executor at `get-shit-done/bin/lib/worktree-safety.cjs` to use the new verbs. Removes the `not_implemented_in_jj_port` stub.
	- Plans 3+ (parallel-eligible): workflow .md `else`-branch removal, `github-release-notes.cjs` migration, upstream test-surface triage. Independent work that can fan out.

- **D-12 [informational]:** Parallelization fan-in path uses Phase 4's `octopus.ts` + `reap.ts` SDK helpers directly. **Do NOT dogfood the new wave-cleanup executor for Phase 7's own execution.** Clean separation — wave-cleanup is for workflow-driven cleanup (`/gsd-quick`, `/gsd-execute-phase` `else`-branch fallback), the SDK's internal octopus path is for executor-internal fan-in. Different consumers, different code paths.

- **D-13 [informational]:** This is the first parallelization dogfood on this repo. Per user: migration is complete (v1.0 shipped), so the `project_no_parallelization_yet` rule no longer applies. Planner is free to fan out independent plans.

### Test-surface triage policy

- **D-14:** Run the new upstream test surfaces (`installer-migrations`, `shell-command-projection`, `query-raw-output-projection`) on BOTH backends (git + jj-colocated CI lanes). Full run, no triage-by-name. Document every delta.

- **D-15:** Disposition policy: strict-green — **Phase 7 does not close until every new test surface is green on both backends.** No "document and defer" path for jj-side failures.

- **D-16:** Scope-expansion policy when the strict-green bar surfaces an adapter gap beyond the 7 known verbs: **cap Phase 7 at the 7 verbs.** Any 8th-verb need spawns a `Phase 7.1 INSERTED` (mirroring the 2.1/03.1 pattern) with its own discuss/plan cycle. Clean phase boundary; avoids unbounded scope creep within Phase 7 while preserving the strict-green commitment.

### github-release-notes.cjs migration

- **D-17:** Migrate `scripts/changeset/github-release-notes.cjs` to use the cross-backend `vcs.log` / `vcs.diff` adapter surface (NOT `vcs.gitOnly.*`). Drop the `vcs-lint:allow-git-here` exception entry from `scripts/lint-vcs-no-raw-git.cjs`'s allowlist. Rationale: the script's logic is "enumerate commits in a range, render markdown" — nothing git-only about that. Keeping it cross-backend preserves upstream-mergeability of the file.

- **D-18:** **Project-wide nuance** (per user): the fork does not currently intend to PR back to upstream, but should not foreclose that possibility. This shapes how we treat seemingly-dead-code paths (like release-notes machinery): prefer "migrate to adapter and drop the lint exception" over "delete entirely" when the cost is roughly equal. Captured for downstream and future phases. Updates the earlier "no PRs back" framing in PROJECT.md from a hard rule to a current intent.

### Claude's Discretion

- The exact jj revset for `refs.mergeBase` (`heads(::a & ::b)` vs `latest(::a & ::b)` vs `a..b` complement) — researcher confirms against jj 0.41 docs and the existing parse infrastructure in `sdk/src/vcs/parse/jj-*.ts`.
- The exact `jj diff` flag set used to drive `diffFilter` post-filtering (likely `jj diff --name-only --summary` or NDJSON-template-based per JJ-04).
- Whether the new contract tests live in `sdk/src/vcs/__tests__/` alongside existing per-domain test files (jj-refs.test.ts, jj-workspace.test.ts, jj-status-log-diff.test.ts) or in a dedicated `wave-cleanup-verbs.test.ts` — planner decides based on cohesion.
- Per-plan ordering inside the parallel fan-out batch (Plans 3+) — planner determines the dependency graph and which plans actually have zero-dependency parallelism vs. sequencing.
- Whether the workflow .md `else`-branch removal hard-deletes the fallback bodies or keeps the `if command -v gsd-sdk` guard with an empty/error `else`. Default to hard-delete (TODO(jj-port) comments imply the fallback is dead once verbs land); planner reconfirms reading the workflow files.
- Multi-runtime markdown sync (Codex / Gemini / OpenCode parity) for any workflow .md changes — follow Phase 5's PROMPT-02 pattern.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project state
- `.planning/PROJECT.md` — v1.1 milestone scope; lists the 5 deliverables verbatim; the upstream-mergeability nuance (D-18) updates the "no PRs back" framing.
- `.planning/ROADMAP.md` §Phase 7 — current placeholder ("To be planned"); planner updates this once plans are scoped.
- `.planning/REQUIREMENTS.md` — VCS-* / GIT-* / JJ-* baseline; new requirements for the 7 verbs land here during planning.
- `.planning/MILESTONES.md` — v1.0 retrospective; deferred items inherited into v1.1.
- `.planning/STATE.md` — milestone v1.1 marker.

### Wave-cleanup executor (the central consumer)
- `get-shit-done/bin/lib/worktree-safety.cjs:382-411` — the `not_implemented_in_jj_port` stub and the comment block listing the 7 required verbs verbatim. **Primary source for verb shape requirements.**
- `get-shit-done/bin/lib/worktree-safety.cjs:413-451` — `cmdWorktreeCleanupWave` (manifest reader + executor caller). Wire target.
- `sdk/src/query/worktree.ts` — the SDK query bridge that spawns the cjs executor.
- `get-shit-done/bin/gsd-tools.cjs:988-991` — `worktree cleanup-wave` subcommand dispatch.

### Workflow .md raw-git fallbacks (to delete per D-11)
- `get-shit-done/workflows/execute-phase.md:779-784` — `gsd-sdk query worktree.cleanup-wave` call + TODO(jj-port) comment + `else`-branch fallback body.
- `get-shit-done/workflows/quick.md:787-796` — same pattern for `/gsd-quick`.

### Adapter surface (current authoritative source)
- `sdk/src/vcs/types.ts` — cross-backend type contract. The 7 verbs land here.
- `sdk/src/vcs/backends/git.ts` — git backend (currently 813 lines).
- `sdk/src/vcs/backends/jj.ts` — jj backend (currently 1120 lines).
- `sdk/src/vcs/jj/octopus.ts` — Phase 4 octopus structure helpers (referenced by D-12 for Phase 7's own fan-in).
- `sdk/src/vcs/jj/reap.ts` — Phase 4 batch reap (also D-12).
- `sdk/src/vcs/expr.ts` — `RevisionExpr` factories; `expr.range` is the consumer of `mergeBase` output (D-05).

### Prior decisions that bind Phase 7
- `.planning/phases/02.1-vcs-abstraction-audit-drop-git-only-concepts/02.1-CONTEXT.md` — D-01 (no git terminology leaks on cross-backend surface; binds D-06), D-15 (`currentBookmarks: string[]`; binds D-04).
- `.planning/phases/03-jj-backend-core-squash-refs-conflict/03-CONTEXT.md` — SQUASH-06 conflict-return semantics (binds D-02), REFS-05 auto-advance (binds D-03), JJ-03 `--ignore-working-copy` never used.
- `.planning/phases/04-workspaces-octopus-structure-hooks/04-CONTEXT.md` and `04-LEARNINGS.md` — `workspace.forget` metadata-only semantics (binds D-08), `octopus.ts` + `reap.ts` SDK helpers (binds D-12), A3 colocated pre-commit gap Open Q1 (deferred — NOT Phase 7 scope, see Deferred Ideas).
- `.planning/phases/06-brownfield-jj-migration-sticky-vcs-adapter-flip-planning-sha/06-CONTEXT.md` — sticky `vcs.adapter` write-time resolution (B-09).

### Intel files
- `.planning/intel/vcs-adapter-surface-audit.md` — pre-v1.0 surface audit; still useful for verb-shape conventions.
- `.planning/intel/git-touchpoints.md` — inventory of git invocations in the source tree.
- `.planning/intel/rebase-log.md` — upstream rebase conflict tracker.

### Lint guard (binds the no-raw-git invariant)
- `scripts/lint-vcs-no-raw-git.cjs` — whole-repo default-deny scanner; D-17 drops the `github-release-notes.cjs` allowlist entry.

### Test surfaces for triage (D-14)
- `tests/installer-migration-report.test.cjs`, `tests/installer-migration-authoring.test.cjs`, `tests/installer-migrations.test.cjs`, `tests/installer-migration-install-integration.test.cjs`
- `tests/shell-command-projection-dispatch.test.cjs`, `tests/bug-3413-shell-command-projection.test.cjs`, `tests/bug-3441-path-action-projection.test.cjs`, `tests/bug-3442-shim-projection-drift-guard.test.cjs`
- `sdk/src/query-raw-output-projection.ts`, `sdk/src/query-raw-output-projection.test.ts`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`sdk/src/vcs/jj/octopus.ts`** (`createPhaseStructure`, `createSubagentHead`, `createSubagentSlot`) — Phase 7's own parallel fan-out uses these directly per D-12.
- **`sdk/src/vcs/jj/reap.ts`** — Phase 4's batch-reap path; pairs with octopus.ts for fan-in.
- **`sdk/src/vcs/jj/lock.ts`** (`acquireJjWriteLock`) — RAII jj write lock from Phase 4; `workspace.merge`'s atomic main-advance + agent-delete (D-03) needs lock coverage.
- **`sdk/src/vcs/exec.ts`** — single exec wrapper. Adding `cwd` to `status({ cwd })` per D-07 plugs in here.
- **`sdk/src/vcs/parse/jj-rev.ts`**, **`parse/jj-id.ts`** — id-translation helpers; `mergeBase` returning `change_id` on jj (D-05) uses these.
- **`tests/helpers.cjs`** + **`vcsTest`** fixture + `describe.for([...BACKENDS])` — parameterized contract-test harness from Phase 1. Each new verb gets a contract test in this harness.

### Established Patterns

- **Forward-complete adapter** (Phase 1 D-04): types.ts shapes are the source of truth; backends implement to match. New verbs go in types.ts first, then both backends, then contract tests.
- **Backend translator pattern** (Phase 2.1 D-01): cross-backend verbs translate internally — no leaking git terminology. `diff({ diffFilter: 'deleted' })` (D-06) follows this; `mergeBase` returning change_id on jj (D-05) follows this.
- **NDJSON output parsing** (JJ-04): jj backend uses `-T 'json(self) ++ "\n"' --no-graph` for parseable output. `mergeBase` and the post-filtered `diff` likely use this pattern.
- **Argv-array invocation only** (JJ-02): no shell-string concatenation. The 7 verbs land as argv-arrays in both backends.
- **Squash is sole jj commit primitive** (SQUASH-05): `workspace.merge` synthesizes a 2-parent change via `jj new` and describes it, but never calls `jj commit`.
- **Conflict-return semantics** (SQUASH-06): adapter never auto-undoes on conflict. D-02 inherits this.
- **Sticky `vcs.adapter`** (Phase 6 B-09): no `'auto'` resolution at write time. Phase 7 verbs respect this.

### Integration Points

- **`get-shit-done/bin/lib/worktree-safety.cjs:402` `executeWorktreeWaveCleanupPlan`** — the function body to rewrite. Currently returns `{ ok: false, reason: 'not_implemented_in_jj_port' }`. After Phase 7, this orchestrates calls to the 7 new verbs.
- **`get-shit-done/workflows/execute-phase.md:779` / `quick.md:787`** — the `gsd-sdk query worktree.cleanup-wave` call site. The `else`-branch fallback below is dead code post-Phase-7.
- **`scripts/changeset/github-release-notes.cjs:37`** — the one `cp.execFileSync('git', …)` to migrate. Rewrite uses `vcs.log({ rev: <range> })` and similar.
- **`scripts/lint-vcs-no-raw-git.cjs` allowlist** — the `github-release-notes.cjs` entry exits the allowlist when D-17 lands.
- **`tests/vcs-adapter-contract.test.cjs`** + per-domain test files — new verb contract tests slot in here.
- **`.github/workflows/test.yml`** — CI matrix; jj-colocated lane is required-blocking (Phase 5). Test-surface triage runs in both lanes per D-14.

</code_context>

<specifics>
## Specific Ideas

- The user explicitly overrode the recommended `mergeBase` return shape (D-05): chose `change_id` over `commit_id` on jj despite the rebase-stability tradeoff. This reflects the broader project preference for change_id throughout the adapter surface (consistent with the `.planning/` SHA→change_id migration tracked since Phase 3).

- The user explicitly added the nuance (D-18) that fork upstream-merge is not foreclosed — only "not currently intended." This shaped the github-release-notes decision (migrate, don't delete) and is captured as a project-wide framing update.

- "Test parallelization" framing (D-13) is a directive — the user wants Phase 7 to be the first parallel-execution dogfood. Planner should treat this as a goal, not just a permitted option.

</specifics>

<deferred>
## Deferred Ideas

- **A3 colocated pre-commit gap** (Phase 4 LEARNINGS Open Q1) — jj 0.41 does NOT auto-fire `.git/hooks/pre-commit` after `jj squash` in colocated mode. Three fix paths documented in `.planning/phases/04-workspaces-octopus-structure-hooks/04-LEARNINGS.md`. Not Phase 7 scope (no adapter verb gap; no upstream-merge link). Reconsider in v1.2 or a dedicated hooks-hardening phase.

- **Workflow .md fallback removal strategy details** — whether to hard-delete the `else` body or keep the `if command -v gsd-sdk` guard with an empty/error `else`. Considered briefly; defaulted to planner discretion (Claude's Discretion entry). The TODO(jj-port) comments in the workflows imply hard-delete is the intent.

- **Multi-runtime markdown sync surface (Codex / Gemini / OpenCode)** — Phase 5 PROMPT-02 established the lockstep-sync pattern. Phase 7's workflow .md changes follow it but the policy itself is locked, not re-discussed.

- **Per-verb contract-test depth policy** — how many edge cases per verb (e.g., should `workspace.merge` have a contract test for the conflicted-return path?). Defer to planner — Phase 1 / Phase 3 contract-test depth is the precedent.

- **Future verbs surfaced by strict-green triage** — any 8th verb that test-surface triage reveals lands in a `Phase 7.1 INSERTED` per D-16. Not deferred-without-plan; the deferral mechanism IS the plan.

- **Release-notes script tag-handling on jj** — jj has no annotated-tag concept (REFS-06). If the migrated `github-release-notes.cjs` script walks annotated tags, the jj backend path needs design work. Likely fine because (a) the script targets git-side release flow that's never invoked on jj-only repos, and (b) the cross-backend `vcs.log` already handles the only operation needed. Research confirms.

- **Orchestrator parallelization rewrite — execute-phase.md → jj-workspace via octopus/reap (DEFERRED FROM PHASE 7 EXECUTION, 2026-05-14)** — D-12 described the parallelization fan-in path as using Phase 4's `sdk/src/vcs/jj/octopus.ts` + `reap.ts` SDK helpers. **This describes the future-intended design, not current reality.** `get-shit-done/workflows/execute-phase.md` lines ~714+ still uses raw-git worktree machinery (`git worktree add` via Claude Code's `isolation="worktree"`, `git merge --no-ff` post-wave merge-back, `git worktree remove`). The TODO(05-05 sweep) comment at line 714 explicitly says it stays raw-git "until the WS-* verbs land + the jj-workspace merge model is decided." Phase 4 landed the WS verbs but did NOT rewrite the orchestrator. Phase 7's first attempted parallel-dogfood run on 2026-05-14 surfaced this gap and reverted `parallelization` to `false` for sequential execution. **Required follow-up (v1.2 or a dedicated phase):** rewrite execute-phase.md's worktree dispatch + cleanup to use `octopus.ts` + `reap.ts` directly (no more raw-git `worktree add`/`merge --no-ff`/`worktree remove` in the orchestrator). Likely also needs PROMPT-01 sibling work in `quick.md`. After that rewrite lands, flip `parallelization: true` in `.planning/config.json` and dogfood for real. Pre-existing tech debt (acknowledged in execute-phase.md), not introduced by Phase 7.

</deferred>

---

*Phase: 7-reconcile-fork-capabilities-with-upstream-add-missing-adapter*
*Context gathered: 2026-05-14*
