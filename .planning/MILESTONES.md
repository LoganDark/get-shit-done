# Milestones

Record of shipped milestones for the GSD jj-port fork.

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

**Known follow-ups** (deferred to v1.1):

- Wave-cleanup executor needs adapter verbs to replace upstream's raw-git path (stubbed in `worktree-safety.cjs`).
- Workflow `.md` raw-git fallbacks remain in source as unreachable code; drop once adapter verbs land.
- `scripts/changeset/github-release-notes.cjs` lint-annotated as dev-only.
- A3 colocated pre-commit gap (jj 0.41 doesn't auto-fire `.git/hooks/pre-commit` after `jj squash` in colocated mode) — 3 fix paths documented in Phase 4 LEARNINGS Open Q1.
