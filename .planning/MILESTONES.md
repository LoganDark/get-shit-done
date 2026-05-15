# Milestones

## v1.2 jujutsu is change-only — never commit id anywhere (Shipped: 2026-05-15)

**Phases completed:** 1 phases, 3 plans, 18 tasks

**Key accomplishments:**

- Audit script emits .md + JSON sidecar (D-01 single-source-of-truth) classifying 101 commit_id-reachable sites into 7 closed verdict buckets, plus the lint-vcs-no-commit-id scanner with shared per-entry allowlist parser (D-03/D-04 — expires dropped) — all gated for Plan 2's FLIP
- Unified revision contract delivered: every cross-backend VcsAdapter verb on the jj backend now emits change_id (k-z alphabet) per the FLIP-01..04 surface flip; LogEntry.id + CommitResult.id hard-renamed with NO alias; custom toBeIdOf vitest matcher landed for cross-backend test ergonomics (D-02); golden-parity baselines re-recorded confirm git backend is unaffected.
- v1.2 milestone closed: the cross-backend VcsAdapter exposes ONE revision concept (commit_id on git, change_id on jj); jj backend never volunteers commit_id from any cross-backend verb; architectural enforcement via lint guard now active in CI + pretest, with first green run validating Plan 2's FLIP completed cleanly.

---

Record of shipped milestones for the GSD jj-port fork.

---

## v1.1 — first upstream sync

**Shipped:** 2026-05-14
**Phases:** 1 (Phase 7)
**Plans:** 5 of 5 completed (100%)
**Stats:** 21 commits, 35 files modified, +6,615 / -331 LOC, 1-day milestone

**Goal:** Reconcile fork capabilities with the upstream code surface brought in by the May 2026 merge — fill the adapter gaps the merge exposed and bring new upstream test surfaces green on jj.

**What landed:**

- **Plan 07-01:** Eight new `VcsAdapter` verbs across types + git + jj backends (VCS-08..VCS-15): `refs.bookmarks.currentIn`, `refs.mergeBase` (returns `change_id` on jj via `fork_point(x)` revset), `diff({ diffFilter })` with typed enum, `status({ cwd })` scoped variant, `workspace.merge` (2-parent `jj new` with atomic main-bookmark advance + agent-bookmark delete per D-03), `workspace.remove` (forget + `fs.rm -rf`), `refs.bookmarks.delete({ force })`, plus a planner-judgment fold-in of `refs.readBlob` (VCS-15) needed by Plan 04. 100 new tests pass on both backends.
- **Plan 07-02:** Wave-cleanup executor at `get-shit-done/bin/lib/worktree-safety.cjs:402` rewritten from `{ ok: false, reason: 'not_implemented_in_jj_port' }` stub to real ~80 LOC orchestration through the new verbs. Manifest schema widened with optional `main_bookmark` field + fallback resolution via `currentBookmarksIn`. WAVE-01 closes.
- **Plan 07-03:** Hard-deleted 242 LOC of dead raw-git fallback bodies from `execute-phase.md` (-117) and `quick.md` (-125). The `if command -v gsd-sdk … else <raw-git> fi` wrappers collapse to a single unconditional `gsd-sdk query worktree.cleanup-wave` line. PROMPT-04 closes.
- **Plan 07-04:** `scripts/changeset/github-release-notes.cjs` migrated from `cp.execFileSync('git', …)` to cross-backend `vcs.refs.exists` + `vcs.diff` + `vcs.refs.readBlob` (first production consumer of VCS-15). Inline `vcs-lint:allow-git-here` annotation dropped; lint guard clean repo-wide. MIGR-05 closes.
- **Plan 07-05:** Strict-green test-surface triage achieved 150/150 pass on both git and jj-colocated backends across the 9 new upstream test files (installer-migrations, shell-command-projection + bug-3413/3441/3442, query-raw-output-projection). Single delta: `execGit` upstream block carved out via `describe.skip` because the fork removed the raw-git helper per `project_no_raw_git`. TEST-09/10/11 close. D-16 8th-verb escape hatch was NOT engaged.

**Known follow-ups** (deferred to v1.2):

- **Orchestrator parallelization rewrite** — `get-shit-done/workflows/execute-phase.md` lines ~714+ still uses raw-git `worktree add`/`merge --no-ff`/`worktree remove` for parallel agent dispatch. CONTEXT D-12 described the future-intended fan-in path via `sdk/src/vcs/jj/octopus.ts` + `reap.ts` but the orchestrator hasn't been rewired. `parallelization: true` was flipped on briefly mid-execute, then reverted to false when the gap surfaced; tracked in `07-CONTEXT.md` Deferred Ideas and in the `project_no_parallelization_yet` memory.
- **Change-id-only on jj adapter surface** — see `SEED-001`. The adapter currently exposes both `change_id` and `commit_id` on jj depending on the verb (Plan 02 hit the cross-namespace pain). Move `commit_id` behind a `vcs.jjOnly.commitIdOf` escape hatch; make `change_id` canonical on the cross-backend surface. Targeted v1.2 candidate.
- **A3 colocated pre-commit gap** (inherited from v1.0) — jj 0.41 doesn't auto-fire `.git/hooks/pre-commit` after `jj squash` in colocated mode. Three fix paths documented in Phase 4 LEARNINGS Open Q1; still not addressed.

**Other notable deviations** (per per-plan SUMMARY.md files):

- Plan 02 discovered that `workspace.merge`'s built-in agent-bookmark delete doesn't cover all cases — git `branch -D` fails silently while the worktree is still checked out — so the executor calls `bookmarks.delete({ force: true })` as an explicit cleanup step. Plan 01's contract test had a gap that Plan 02 caught.
- Plan 02 had to relax its happy-path cross-backend assertion from strict-equivalence to presence-only because `workspace.merge` returns a `change_id` (per D-05) but `bookmarks.list().rev` returns a `commit_id` — the cross-namespace pain that became SEED-001's motivation.
- Plan 04 swapped planner-specified `expr.rev` calls for `expr.bookmark` because `expr.rev` validates hex-shape (SHA / change_id), but `github-release-notes.cjs`'s input domain is git refnames (tag names, branch names).
- Plan 05's "strict-green" close-gate held on the first attempt: no Phase 7.1 INSERTED needed.

---

## v1.0 — Port GSD from git-only to dual-backend (git + jj)

**Shipped:** 2026-05-14
**Phases:** 8 (1, 2, 2.1, 3, 03.1, 4, 5, 6)
**Plans:** 53 of 56 completed
**Progress:** 100% (milestone-complete via Phase 6)

**Goal:** Every upstream GSD command works correctly on a jj-only repo without git — full GSD workflow on a jj backend with no degradation in behavior or test coverage.

**What landed:**

- **Phase 1**: VcsAdapter interface + git backend (byte-identity baselines, parameterized test harness, no-raw-git lint guard).
- **Phase 2**: Bulk call-site migration of every `execSync('git …')` in `sdk/src/query/*.ts` and `bin/lib/*.cjs` to the adapter.
- **Phase 2.1** (inserted): VCS abstraction audit — dropped git-only concepts (`expr.commit` → `expr.rev`, `currentBranch` → `currentBookmarks`, `gitDir`/`gitCommonDir` → `gitOnly` namespace).
- **Phase 3**: jj backend core — squash-based commit model, refs, conflict revset; jj-colocated CI lane active as allow-failure.
- **Phase 03.1** (inserted): test perf — vitest parallelism baseline.
- **Phase 4**: Workspaces + octopus structure + hooks (jj `workspace.{add,forget,prune,reap}`, pre-commit/pre-push wiring, SDK `hooks.fire` bridge).
- **Phase 5**: Command translations + brownfield validation + CI hardening; CI matrix graduates jj lane to required-blocking.
- **Phase 6**: Brownfield jj migration — sticky `vcs.adapter` flip, `.planning/` SHA→change_id rewriter, `/gsd-migrate-vcs` command, B-01..B-09 SDK safety fixes.

**Known follow-ups** (deferred to v1.1, now mostly addressed):

- ~~Wave-cleanup executor needs adapter verbs to replace upstream's raw-git path (stubbed in `worktree-safety.cjs`).~~ **Addressed in v1.1 Plan 07-02.**
- ~~Workflow `.md` raw-git fallbacks remain in source as unreachable code; drop once adapter verbs land.~~ **Addressed in v1.1 Plan 07-03.**
- ~~`scripts/changeset/github-release-notes.cjs` lint-annotated as dev-only.~~ **Addressed in v1.1 Plan 07-04 (migrated to cross-backend adapter).**
- A3 colocated pre-commit gap (jj 0.41 doesn't auto-fire `.git/hooks/pre-commit` after `jj squash` in colocated mode) — 3 fix paths documented in Phase 4 LEARNINGS Open Q1. **Still open; carries into v1.2.**
