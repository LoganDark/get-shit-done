---
phase: 19-upstream-merge-conflict-resolution-fork-abstraction-audit
plan: 09
subsystem: prompts-launcher-hooks
tags: [agents, runtime-launcher, githooks, jj, port-02, audit-01, hook-bridge]

# Dependency graph
requires:
  - phase: 19-upstream-merge-conflict-resolution-fork-abstraction-audit
    provides: "19-08: workflows re-wired to gsd_run query + dispatch-cwd-safety.md @-ref forward dependency; 19-06: vcs router (restore/head-ref/current-branch/workspace.assert-dispatched-cwd/migrate-vcs verbs); 19-05: src/vcs/*.cts port incl. hook-bridge + format-migration"
provides:
  - "agents/gsd-executor.md + gsd-code-fixer.md carry the fork guards (assert-dispatched-cwd, destructive-git prohibition, restore-verb rollback) on upstream 1.4.x text with zero gsd-sdk tokens — agent convention is bare `gsd-tools query` (matches upstream's 17 pre-existing call sites; gsd_run is workflow-embed-only)"
  - "gsd-core/references/dispatch-cwd-safety.md + gsd-core/workflows/migrate-vcs.md re-homed (get-shit-done/ directory now gone); commands/gsd/migrate-vcs.md @-refs re-pathed"
  - "init.new-project emits has_jj (closes the 19-08 forward dep — the new-project VCS-gate matrix is now fully fed)"
  - "_runtime-launcher.snippet.sh resolves RUNTIME_ROOT via git rev-parse || jj workspace root || pwd; synced into 80 workflow embeds (zero hand edits)"
  - ".githooks/pre-commit rewritten for the adopted tree: alias-drift re-triggered on src/command-aliases.cts, fork vcs lints wired, jj-native degrade path proven; HOOK-07 exactly-once re-proven through the ported adapter"
affects: [19-10 (raw-git baseline must account for the snippet's deliberate git-first leg + the wired lints currently red), 19-12 (scanner .cts widening; strict dead-verb check fold-in), 19-13 (ledger completeness)]

# Tech tracking
tech-stack:
  added: []
  patterns: ["agent files use bare `gsd-tools query <verb>` (no launcher sourcing in agent bash); workflows use `gsd_run` via the synced launcher embed", "three-stage runtime-root resolution: git toplevel -> jj workspace root -> pwd", "pre-commit hook degrade pattern: command -v git + rev-parse --git-dir guard, filesystem-only lints as the jj-native fallback checks"]

key-files:
  created:
    - gsd-core/references/dispatch-cwd-safety.md
    - gsd-core/workflows/migrate-vcs.md
  modified:
    - agents/gsd-executor.md
    - agents/gsd-code-fixer.md
    - commands/gsd/migrate-vcs.md
    - src/init.cts
    - gsd-core/workflows/_runtime-launcher.snippet.sh
    - gsd-core/workflows/*.md (80 embeds via sync:launcher)
    - .githooks/pre-commit
    - hooks/lib/git-cmd.js
    - .planning/phases/19-upstream-merge-conflict-resolution-fork-abstraction-audit/19-MERGE-AUDIT.md

key-decisions:
  - "Agent calling convention = bare `gsd-tools query`, NOT the plan-letter `gsd_run query`: agents never source the launcher snippet (it is a workflow-embed mechanism), and upstream's own agent text already uses bare gsd-tools at 17 sites in gsd-executor.md — consistency wins; verify only required zero gsd-sdk"
  - "migrate-vcs.md preflight rewritten to primary sources instead of porting the fork's init.migrate-vcs handler: 19-06 deliberately shipped only the migrate-vcs mutator verb (which re-checks target-default/jj-binary/dirty/conflicts defensively); porting the init handler would touch 3 src files for a probe the verb already owns"
  - "has_jj init extension applied as Rule 2 (1-line src/init.cts change per the fork's exact semantic at harvest init.ts:1350) rather than deferred again — the re-wired new-project matrix is live since 19-08 and reads the field"
  - ".githooks/pre-commit wires the fork vcs lints knowing they exit 1 on the current tree (21 raw-git + 30 commit-id hits) until 19-10 re-derives baselines — deliberate per Pitfall 12; a vacuous hook would gate nothing and the fire surface on this repo (adapter-routed commits only) is not used by the sequential executors"
  - "git-cmd.js jj-command-awareness parity deferred to v1.5: no registered PreToolUse guard classifies jj commands today (hooks.json PreToolUse = prompt-guard/read-guard/worktree-path-guard) and the fork's own c7bd6bee copy had zero jj handling"

requirements-completed: []  # AUDIT-01/PORT-02 are phase-scoped (19-01..19-08 precedent); ROADMAP plan-line progress updated instead

# Metrics
duration: ~30min
completed: 2026-06-10
---

# Phase 19 Plan 09: Agent prompts, jj-aware launcher, .githooks rewrite Summary

**Chunk-9 surfaces closed: both agent prompts carry the fork's dispatch/destructive-git firewall on upstream text with every verb dispatching through the 19-06 router, the runtime launcher resolves the right root on jj-only repos via a snippet-source fix synced into 80 embeds, and .githooks/pre-commit is live for the adopted tree with the jj-native degrade path and exactly-once adapter firing both proven.**

## Performance

- **Duration:** ~30 min (2026-06-10 13:00–13:30 UTC)
- **Tasks:** 3
- **Files:** ~91 touched (2 created, 89 modified — 80 of those are uniform sync-script embed updates)

## Accomplishments

- **Task 1 (agents + re-homing):** The merge resolution had already left the fork's structural rewiring (assert-dispatched-cwd guard, destructive_git_prohibition, verb-based commit protocol) on upstream's agent text — 19-09 finished it: 29 `gsd-sdk` tokens re-pathed to `gsd-tools` across both agents, envelope adaptations per the ported router (`.hash[0:7]` → `.id[0:7]`, untracked probe `.status=="??"` → `.worktree=="?"`, current-branch `.bookmarks[0] // empty`), 7 phantom-verb TODOs reworded, and the dangling `dispatch-cwd-safety.md` @-ref closed by re-homing the file at `gsd-core/references/`. `migrate-vcs.md` re-homed at `gsd-core/workflows/` with its preflight adapted to existing verbs. `init.new-project` now emits `has_jj`. Dead-verb check: all 23 distinct verbs across the four files dispatch (vcs router, family routers, or live upstream handlers — `commit` probed non-mutating via "commit message required", `config-get`/`requirements.mark-complete` probed empirically).
- **Task 2 (launcher):** snippet-source fix `git rev-parse --show-toplevel || jj workspace root || pwd`; `node scripts/sync-runtime-launcher.cjs` propagated it into 80 `.md` embeds (75 top-level workflows + 5 under help/, including the freshly moved migrate-vcs.md). Uniform-diff proof: exactly 1 distinct removed line shape and 1 distinct added line shape across all of gsd-core/workflows. Functional proof on a `jj git init --no-colocate` tmp repo from `sub/dir`: new form resolves the workspace root; the old form resolved `sub/dir` (the Pitfall 9 wrong-binary path).
- **Task 3 (.githooks + audit):** pre-commit rewritten — all 10 stale `sdk/src/query` trigger blocks and 9 nonexistent `check:*` scripts removed; `check:alias-drift` kept and re-triggered on `src/command-aliases.cts`; `lint-vcs-no-raw-git.cjs` + `lint-vcs-no-commit-id.cjs` wired as whole-repo read-only checks with existence guards. Verified: `bash -n` green; every referenced path exists; marker hook fired EXACTLY once by `vcs.commit()` through `gsd-core/bin/lib/vcs/index.cjs` on a jj-native tmp repo (returned change id `uqpmrxyu…`, [k-z] alphabet); degrade path exits 0 with git stripped from PATH and via the GIT_OVERRIDE seam. Audit dispositions ledgered for graphify-update (substrate), validate-commit (adopted), worktree-path-guard (substrate, fail-open on jj), git-cmd.js (jj parity deferred v1.5, header annotation + `node --check`).

## Task Commits

Each task committed on top of the stack above merge change `vpzlrrlv` (untouched):

1. **Task 1: Agent prompt re-wiring + fork-file re-homing** — `1e800298` / change `wsqstvut` (feat)
2. **Task 2: jj-aware launcher fix + repo-wide re-sync** — `9769f5ec` / change `rsozoukp` (fix)
3. **Task 3: .githooks rewrite + hook-script audit** — `92e21b35` / change `xuusmrlu` (feat)

## Deviations from Plan

**1. [Plan-letter adaptation] Agents use `gsd-tools query`, not `gsd_run query`**
- **Found during:** Task 1 read_first
- **Issue:** the plan's action says "`gsd_run query` calling convention", but `gsd_run` is a shell function defined by the launcher snippet that only workflow files embed — agent bash blocks would call an undefined function. Upstream's agent files already use bare `gsd-tools query` (17 sites in gsd-executor.md alone).
- **Fix:** re-pathed `gsd-sdk query` → `gsd-tools query` in both agents and the dispatch-cwd-safety reference; verify (zero gsd-sdk) and acceptance unaffected.
- **Commit:** 1e800298

**2. [Rule 2 - missing critical functionality] `has_jj` added to init.new-project**
- **Found during:** Task 1 (19-08 SUMMARY explicitly flagged the forward dependency)
- **Issue:** the re-wired new-project greenfield VCS-gate matrix (live since 19-08) branches on `has_jj`, which upstream's `cmdInitNewProject` never emitted — the workflow would read null and the 12-row matrix could not be evaluated.
- **Fix:** `has_jj: pathExistsInternal(cwd, '.jj')` added per the fork's exact semantic (harvest/query-handlers/init.ts:1350). build:lib green; smoke shows `has_jj: true` on this repo.
- **Files modified:** src/init.cts (plus untracked built output regenerated)
- **Commit:** 1e800298

**3. [Adaptation] migrate-vcs.md preflight rewritten — `init.migrate-vcs` does not exist in the adopted tree**
- **Found during:** Task 1 re-pathing of the moved workflow
- **Issue:** the fork workflow's preflight calls `query init.migrate-vcs` (8-field probe handler); 19-06's CLI bridge shipped only the `migrate-vcs` mutator verb. A literal re-path would mint a dead verb.
- **Fix:** preflight derives `current_adapter` from a config jq read, dirty from `gsd_run query status`, jj availability from `command -v jj`; conflicts refusal delegated to the verb's own defensive pre-flight. Envelope fields adapted (`commitHash` → `commitId`). Consumer `commands/gsd/migrate-vcs.md` @-refs re-pathed (not in the plan's files list, but the moved file's only consumer).
- **Commit:** 1e800298

**4. [Plan-claim correction] The launcher fix does NOT organically remove the raw-git lint hit**
- **Found during:** Task 2
- **Issue:** the plan note claimed the jj-aware fix "removes the launcher's raw-git lint hit organically". The fix deliberately keeps `git rev-parse --show-toplevel` as the FIRST leg (preserving upstream behavior on git/colocated repos) — the raw-git token remains in the `.sh` snippet, which IS a scanned extension.
- **Fix:** none needed in-code; ledger row flags it for 19-10 allowlist accounting (snippet needs an allowlist entry or inline annotation).
- **Commit:** 9769f5ec (ledger note)

**5. [Known-red interim, deliberate] Wired pre-commit lints exit 1 until 19-10**
- **Found during:** Task 3
- **Issue:** `lint-vcs-no-raw-git` (21 hits) and `lint-vcs-no-commit-id` (30 hits) fail on the half-merged tree — baselines/allowlists re-derive in 19-10 (Pitfall 12).
- **Fix:** wired anyway per the plan's intent (a hook that gates nothing is the T-19-24 vacuous failure mode); fire surface on this repo is adapter-routed commits only — the sequential executors commit via raw `jj` CLI which never fires .githooks. Documented in the ledger row.
- **Commit:** 92e21b35

## Authentication Gates

None.

## Verification Results

- **Task 1:** plan verify line PASS (`workspace.assert-dispatched-cwd` present; zero `gsd-sdk` in both agents; both moved files exist at gsd-core paths; originals gone — `get-shit-done/` directory removed entirely). Zero `get-shit-done/` and zero `gsd-sdk` self-references in moved files. Dead-verb membership check: 23/23 verbs dispatch.
- **Task 2:** plan verify line PASS (snippet contains `jj workspace root`; 75 top-level / 80 recursive workflow files carry it, >= 50 required; docs/ subdir resolution matches `jj workspace root`). Extra proofs: git-masked subshell exercises the jj leg in this repo; jj-only `--no-colocate` tmp repo resolves the workspace root from `sub/dir` while the old form resolved the subdir. Uniform diff: 1 removed shape / 1 added shape.
- **Task 3:** plan verify line PASS (`bash -n` green; zero `sdk/src/query` refs; tmp-dir scaffold sanity). Transcript highlights: marker line count == 1 after one `vcs.commit()` through `gsd-core/bin/lib/vcs/index.cjs` on a jj-native tmp repo; degrade exit 0 under both `PATH` stripped of git (`command -v git` empty confirmed) and the `GIT_OVERRIDE` seam; portability exit 0 when lint scripts absent; on THIS repo the hook exits 1 via the lints (gate, not crash — known-red interim until 19-10).
- jj discipline: three task commits stack linearly above `nqqqsmtp` (19-08 tail); `vpzlrrlv` untouched; no bookmark moves, no op restore.

## Known Stubs / Forward Pointers

- **19-10:** the launcher snippet's deliberate git-first leg keeps a raw-git hit in a scanned `.sh` file — needs allowlist entry or annotation in the baseline re-derivation. The wired pre-commit lints flip green when 19-10 lands the re-pointed baselines.
- **19-12:** both lint scanners still skip `.cts` (Pitfall 8); the pre-commit staged-extension trigger already includes `cts|mts` ahead of the widening. The strict router/family dead-verb membership check (used here and in 19-08) is worth folding into the lint/test pass.
- **v1.5 deferral:** hooks/lib/git-cmd.js jj-command-awareness parity (e.g. Conventional-Commits gating for `jj commit -m`) — no PreToolUse guard depends on it today; recorded in the module header and ledger.
- `.githooks/pre-push` untouched (out of plan scope): self-contained opt-in author-email guard, no stale paths, raw-git usage is read-only rev-list/show — enters the 19-10 baseline as-is.

## Self-Check: PASSED

- Files exist: gsd-core/references/dispatch-cwd-safety.md, gsd-core/workflows/migrate-vcs.md, .githooks/pre-commit, this SUMMARY — FOUND; get-shit-done/ originals — correctly ABSENT
- Commits present in `jj log`: 1e800298 (wsqstvut), 9769f5ec (rsozoukp), 92e21b35 (xuusmrlu)
- Verifies re-run clean post-commit (zero gsd-sdk in agents; 80 embeds carry `jj workspace root`; bash -n green)

---
*Phase: 19-upstream-merge-conflict-resolution-fork-abstraction-audit*
*Completed: 2026-06-10*
