---
phase: 19-upstream-merge-conflict-resolution-fork-abstraction-audit
plan: 07
subsystem: vcs
tags: [vcs, audit-01, call-site-migration, unified-revision-model, substrate, jj]

# Dependency graph
requires:
  - phase: 19-upstream-merge-conflict-resolution-fork-abstraction-audit
    provides: "19-06: PORT-02 CLI bridge live (19 vcs verbs dispatch via gsd-tools), built-artifact regression net 47/47 green"
provides:
  - "AUDIT-01 (src/ surface): every upstream raw-git/SHA call site migrated through the ported VcsAdapter or substrate-justified with ledger rows — zero execGit call sites outside {shell-command-projection, worktree-safety, worktree-base-ref, vcs/}; zero execSync/execFileSync outside shell-command-projection"
  - "Single adapter-routed commit path: cmdCommit/cmdCommitToSubrepo internals via vcs.commit({files}) WC-state-capture; envelope `hash` → `id` (unified revision model); proven on jj-native ([k-z] change_id, no commit_id key) and colocated tmp repos"
  - "T-19-DG eliminated: roadmap-upgrade rollback is non-destructive (fs rename-reversal + adapter restore scoped to .planning/); the literal destructive-reset token is absent from src/*.cts, comments included"
  - "Substrate dispositions ledgered with header comments: shell-command-projection (adapter-internal exec seam), worktree-safety (git-backend worktree machinery; jj via workspace.parallel.*), worktree-base-ref (git-only base-ref degrade, Open-Q6)"
  - "AUDIT-01 sweep evidence appendix in 19-MERGE-AUDIT.md (3 sweeps + destructive-pair check + A6 findings)"
affects: [19-08 (workflows can rely on commit envelope id field), 19-10/19-11/19-12 (baseline re-derivation: class-A rows cleared; 3 new build-state re-baseline items in deferred-items.md), 19-13 (ledger completeness; github-release-notes deferred row stands)]

# Tech tracking
tech-stack:
  added: []
  patterns: ["fork `// (was: <git cmd>)` annotation style carried onto migrated upstream .cts sites", "per-invocation createVcsAdapter(cwd) factory with backend auto-detect in production command paths; explicit { kind: 'git' } pins only for git-concept probes (index, gitignore, worktree, colocated hex reads)", "windowsHide:true centralized at the vcsExec seam (#685 parity adapter-wide)"]

key-files:
  created: []
  modified:
    - src/commands.cts
    - src/verify.cts
    - src/init.cts
    - src/core.cts
    - src/graphify.cts
    - src/check-command-router.cts
    - src/roadmap-upgrade.cts
    - src/drift.cts
    - src/vcs/exec.cts
    - src/vcs/format-migration/run.cts
    - src/vcs-command-router.cts
    - src/vcs/backends/git.cts
    - src/vcs/backends/jj.cts
    - src/shell-command-projection.cts
    - src/worktree-safety.cts
    - src/worktree-base-ref.cts
    - tests/bug-685-windowshide-spawn.test.cjs
    - .planning/phases/19-upstream-merge-conflict-resolution-fork-abstraction-audit/19-MERGE-AUDIT.md
    - .planning/phases/19-upstream-merge-conflict-resolution-fork-abstraction-audit/deferred-items.md

key-decisions:
  - "Adapter auto-detect (no kind:'git' pin) in cmdCommit/cmdCommitToSubrepo/cmdStats: the fork's 02-09-era annotations pinned git because they predate the jj backend; pinning would break the jj-only-repo core value. Git pins KEPT where the fork pinned for git-concept reasons (cmdCheckCommit index probe, isGitIgnored, init child-repo/worktree probes, graphify colocated hex reads)"
  - "Plan-letter contradictions resolved toward the fork reference + automated verify: graphify's 2 reads are adapter-routed with git pins (plan said 'stay raw' but the harvested fork reference migrated them and the Task 3 sweep forbids raw survivors); core check-ignore migrated to refs.isIgnored (plan said 'keep on the seam' but the fork migrated it and the sweep forbids execGit in core.cts)"
  - "Fork latent bugs NOT replayed: harvested fork core.cjs/init.cjs reference an unbound execGit identifier (ReferenceError swallowed by try/catch) — gitWorktreeInfoInternal implements the documented backend-aware intent via workspace.context(); init's --show-prefix probe drops to the path-comparison fallback (the fork's de facto runtime behavior)"
  - "roadmap-upgrade rollback parity WITHOUT git clean: fs rename-reversal (exact inverse of the WC renames) + adapter restore of .planning/ from the captured revision; loud-fail with per-backend manual-recovery instructions if any rollback step fails — never falls back to raw git"
  - "#685 windowsHide preserved at the seam: vcsExec spawnSync gains windowsHide:true (additive, ExecResult shape untouched per Pitfall 10) instead of per-site flags; bug-685 test rebound to assert the seam + raw-spawn-free migrated modules"

requirements-completed: []  # AUDIT-01 is phase-scoped (no v1.4 REQUIREMENTS.md row — 19-01..19-06 precedent); ROADMAP plan-line checkbox updated instead

# Metrics
duration: ~35min
completed: 2026-06-10
---

# Phase 19 Plan 07: Upstream raw-git call-site migration (AUDIT-01 src/ surface) Summary

**All 20 commands/verify execGit sites plus the five seam-bypassing outliers (including roadmap-upgrade's destructive `git reset --hard` + `git clean -fd` rollback) now route through the ported VcsAdapter with the fork's annotated migrations replayed and the unified-revision invariant proven on jj — the only surviving raw-git in src/ is the three explicitly-ledgered substrate modules.**

## Performance

- **Duration:** ~35 min (2026-06-10 11:53–12:29 UTC)
- **Tasks:** 3
- **Files:** 19 modified (0 created)

## Accomplishments

- **Task 1 (commands.cts 14 sites + verify.cts 6 sites):** fork commands.cjs/verify.cjs reference migrations replayed onto upstream's .cts sources with the `// (was: <git cmd>)` annotation style. cmdCommit internals are adapter-routed end to end — branching block via `refs.currentBookmarks`/`bookmarks.switch`, the stage/unstage loop collapsed to `vcs.commit({files})` WC-state-capture (#2014 missing-file filter and #3522 respectStaged branch preserved), envelope field `hash` → `id`. verify's revision probes use `refs.exists(expr.rev(id))` with the WR-06 both-alphabet pattern (`[0-9a-f]` and `[k-z]`); push-evidence log uses `log({allRefs:true})`; codebase-drift uses the head-exists probe + `diff({rev: expr.range(base, head)})`.
- **Task 2 (small modules + 5 outliers):** init/core/graphify/check-command-router migrated per their fork references; roadmap-upgrade (T-19-DG, SECURITY-CRITICAL) gets a vcs.status clean-tree gate, LogEntry.id HEAD capture, and a non-destructive rollback (fs rename-reversal + adapter restore scoped to .planning/, loud-fail on rollback error). Two sweep-blocking raw spawns inside vcs/ (jj-version probe, jj-init) routed through vcsExec.
- **Task 3 (substrate dispositions + sweep):** header disposition comments in the three substrate modules; 8 new ledger rows; AUDIT-01 sweep evidence appendix (sweeps 1–3, destructive-pair check, A6 findings); hand-edited .cjs inventory row for the rebound bug-685 test.
- **Verification highlights:** `pnpm run build:lib` green after every batch; known-good set 47/47 on git + jj-colocated + jj-native lanes; tmp colocated repo `query commit`/`query log` smoke (id `aa3e807`, no commit_id key) and tmp jj-native smoke (change_id `lynylrwyqnyw`, `[k-z]`-alphabet assert); full unit suite 153 → 86 fails with zero new failures attributable to the migration.

## Task Commits

Each task committed file-scoped on top of the stack above merge change `vpzlrrlv` (untouched):

1. **Task 1: commands.cts + verify.cts (20 execGit sites)** — `e6c70b20` / change `lwuypyxp` (feat)
2. **Task 2: small modules + 5 outliers incl. destructive rollback** — `8460e44a` / change `toqtnvry` (feat)
3. **Task 3: substrate dispositions + AUDIT-01 sweep evidence** — `81eb3201` / change `uzknyyux` (docs)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] cmdStats countCommits/rootRevisions passed `{rev: refs.head}` (fork 02-09 annotation, pre-jj-backend)**
- **Found during:** Task 2 smoke (`gsd-tools stats` on this jj repo reported `git_commits=1`)
- **Issue:** on jj, an explicit head rev translates to `@` and counts ONE commit; on git, `{rev: head}` counts full ancestry — backend semantic divergence in the replayed reference
- **Fix:** call both verbs with no `rev` — the no-rev defaults (`::@` jj / `HEAD` git) give identical full-ancestry semantics; stats now reports 4244 on this repo
- **Files modified:** src/commands.cts
- **Commit:** 8460e44a

**2. [Rule 2 - Missing critical functionality] #685 windowsHide parity lost by de-raw-ing spawns**
- **Found during:** Task 2 baseline diff (tests/bug-685-windowshide-spawn.test.cjs +2 fails — it pinned the raw call sites this plan removes)
- **Issue:** the migrated sites previously set `windowsHide:true` individually (upstream #685: no console-window flash on Windows); vcsExec did not set it, so migrating sites into the seam would silently drop the contract
- **Fix:** `windowsHide: true` added to vcsExec's spawnSync (additive; 5-field ExecResult shape untouched per Pitfall 10); bug-685 tests rebound to assert the seam sets the flag AND the migrated modules stay raw-spawn-free (11/11 green)
- **Files modified:** src/vcs/exec.cts, tests/bug-685-windowshide-spawn.test.cjs
- **Commit:** 8460e44a

**3. [Rule 3 - Blocking] Two raw spawns inside vcs/ blocked the Task 2 sweep**
- **Found during:** Task 2 read_first sweep
- **Issue:** `src/vcs-command-router.cts` (execSync `jj --version` probe) and `src/vcs/format-migration/run.cts` (execFileSync jj-init) — both 19-05/19-06 ports — fail the plan's "zero execSync/execFileSync outside shell-command-projection" gate; also `src/vcs/backends/git.cts` GIT-01 docblock contained the literal `execSync('git …')` token that the count-based sweep matches
- **Fix:** both spawns routed through vcsExec (argv-array, same seam the backends use; non-zero-exit branch reproduces the prior throw semantics); the GIT-01 comment reworded off the sweep token; a pre-existing jj.cts comment containing the literal destructive-reset token likewise reworded (the acceptance asserts comment-inclusive absence)
- **Files modified:** src/vcs-command-router.cts, src/vcs/format-migration/run.cts, src/vcs/backends/git.cts, src/vcs/backends/jj.cts
- **Commit:** 8460e44a

**4. [Plan-conflict resolution] graphify "stay raw" and core check-ignore "keep on the seam" contradict the fork reference AND the Task 3 automated verify**
- **Found during:** Task 2 read_first (harvest/bin-lib/{graphify,core}.cjs)
- **Issue:** the plan's action text says graphify's 2 reads stay raw and core's check-ignore stays on the execGit seam, but the harvested fork reference migrated both through the adapter, and the Task 3 gate (`rg -l "execGit\(" …` outside the three substrate files must be empty) cannot pass with raw survivors in those files
- **Fix:** followed the fork reference + verify: graphify routes through resolveShort/countCommits with `{kind:'git'}` pins and the colocated-read substrate annotation (ledger row `substrate:graphify-colocated-read`); core's isGitIgnored uses `refs.isIgnored` (git pin per fork 02-11; jj backend's isIgnored throws → catch → false, same as fork)
- **Files modified:** src/graphify.cts, src/core.cts
- **Commit:** 8460e44a

**5. [Plan-letter deviation, documented] Adapter auto-detect instead of the fork's 02-09-era `{kind:'git'}` pins in commit/stats paths**
- **Found during:** Task 1 (fork commands.cjs reference shows `createVcsAdapter(cwd, { kind: 'git' })` at every 02-09 site)
- **Issue:** those pins predate the fork's jj backend (the fork's real jj commit path was the retired SDK handler with auto-detect); replaying them verbatim would break `gsd-tools commit` on jj-only repos — the milestone's core value — and contradicts the plan's own must_have ("jj backend never volunteers commit_id through any migrated path" presumes the jj backend is reachable)
- **Fix:** `createVcsAdapter(cwd)` auto-detect in cmdCommit/cmdCommitToSubrepo/cmdStats (mirrors the fork's later plan 02-10 verify.cjs pattern); git pins kept only for git-concept probes; jj-native smoke proves the commit path
- **Files modified:** src/commands.cts (comment documents the deviation), ledger row records it
- **Commit:** e6c70b20

**6. [Fork-latent-bug non-replay] gitWorktreeInfoInternal + init --show-prefix**
- **Found during:** Task 2 read_first (harvest core.cjs:1732/1740, init.cjs:111 call `execGit` without importing or defining it)
- **Issue:** the fork's harvested reference would throw ReferenceError at those sites (swallowed by try/catch) — fork's gitWorktreeInfoInternal de facto always returned `{inside:false}` and init's prefix probe always fell to the path-comparison fallback
- **Fix:** implemented the documented intent instead of the bug: gitWorktreeInfoInternal uses `vcs.workspace.context()` (backend-aware, throws on non-repo → conservative `{inside:false}`); init drops the probe and keeps the fallback comparison (the fork's de facto behavior). verify.cts's `inspectWorktreeHealth` deps no longer inject `execGit` (the substrate self-supplies its seam default)
- **Files modified:** src/core.cts, src/init.cts, src/verify.cts
- **Commits:** e6c70b20, 8460e44a

**7. [Scope note] drift/research-store/learnings/intel needed no code migration**
- **Found during:** Task 2 read_first sweep
- **Issue:** the plan lists "SHA sites (1–2 each)" in these four modules; all hits are `crypto.createHash('sha256')` content hashes (not VCS revision ids) — drift.cts's `last_mapped_commit` is opaque unified-id storage consumed via alphabet-agnostic `expr.rev()`
- **Fix:** drift.cts annotated; all four dispositioned in one ledger row (`adopted-upstream`); no behavior change
- **Commit:** 8460e44a (drift comment), 81eb3201 (ledger)

### Baseline comparison (Task 1 acceptance, both tasks covered)

Full unit suite run twice (after Task 1, after Task 2): **153 baseline fails → 86**, zero NEW failures attributable to this migration. Deltas triaged: (a) several class-A files now pass outright (bug-3678, drift-detection, graphify-visualization, security-prompt-injection, core, …); (b) class-A→class-B shifts (verify.test, commit-files-deletion, workspace, wave-cleanup-executor, quick-md-parallel-dispatch now die on the stale fork `sdk/dist-cjs` require — the excluded fork-leftover SDK-infrastructure class, persists until 19-10/19-12); (c) three build-state-dependent surfaces absent from the pre-build baseline (prompt-injection-scan vs the built planning-shim artifact, 551-eslint-bin-lib-coverage vs the emitted router artifact, inventory-counts CLI-modules disk count) logged to deferred-items.md rows 2–4 for 19-10/19-12 re-baseline; (d) bug-685 (+2) was real Task 2 fallout and was FIXED (deviation 2), restoring shard parity.

## Authentication Gates

None.

## Known Stubs / Forward Pointers

- **jj-side restore gap-fill:** roadmap-upgrade's rollback jj branch dispatches `jj restore --from <rev> -- .planning/` via vcsExec (the same fork gap-fill carry-over as the router's restore verb; see src/vcs/backends/jj.cts TODO). Becomes a proper adapter verb if/when one lands — intentional, ledgered.
- **jj rootRevisions quirk (observation, not changed):** on jj, `refs.rootRevisions` returns the virtual `root()` commit, so `stats.git_first_commit_date` reads `1970-01-01` on jj repos (adapter-contract semantics inherited from the fork; changing it would affect other consumers — candidates for a later adapter-semantics pass).
- **commit envelope `hash` → `id`:** workflows that jq `.hash` from `query commit` must use `.id` — 19-08's workflow re-wiring consumes the fork deltas which already use the fork envelope.
- deferred-items.md rows 2–4 (build-state re-baselines) + row 1 (github-release-notes MIGR-05, stands for 19-13).

## Verification Results

- `pnpm run build:lib` exit 0 after every module batch
- Task 1 gate: zero `execGit(` in commands.cts/verify.cts; 47/47 known-good tests; tmp colocated commit+log smoke (no commit_id key); tmp jj-native smoke (change_id `[k-z]` only)
- Task 2 gate: zero execSync/execFileSync outside shell-command-projection.cts; zero `git reset --hard` (and zero literal `reset --hard`, comments included) in src/*.cts
- Task 3 gate: `rg -l "execGit\(" src -g '*.cts'` outside {shell-command-projection, worktree-safety, worktree-base-ref, vcs/} → 0 files; `substrate:` rows present in ledger (8); sweep output + A6 findings pasted as AUDIT-01 evidence
- bug-685 rebound test 11/11; substrate-module tests (worktree-safety, worktree-base-ref, shell-command-projection dispatch) 135/135
- `vpzlrrlv` untouched; three task commits stack above it; no bookmark moves, no op restore

## Self-Check: PASSED

- Files exist: 19-07-SUMMARY.md (this file), all 19 modified files present on disk
- Commits present in `jj log`: e6c70b20 (lwuypyxp), 8460e44a (toqtnvry), 81eb3201 (uzknyyux)
- build:lib exit 0; sweeps clean; ledger rows + appendix verified present

---
*Phase: 19-upstream-merge-conflict-resolution-fork-abstraction-audit*
*Completed: 2026-06-10*
