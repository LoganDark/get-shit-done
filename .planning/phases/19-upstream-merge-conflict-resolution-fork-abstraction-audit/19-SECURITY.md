---
phase: 19
slug: upstream-merge-conflict-resolution-fork-abstraction-audit
status: blocked
threats_open: 1
asvs_level: 1
created: 2026-06-11
---

# Phase 19 Security Audit — Upstream Merge Conflict Resolution / Fork Abstraction Audit

**Audited:** 2026-06-11
**ASVS Level:** 1 (default — unset in config)
**Verdict:** OPEN_THREATS — 37/38 closed, 1 open (T-19-02, partial)
**Method:** every mitigation re-verified against the live tree (grep/run/jj-read), not against plan/summary claims. Re-runnable proofs (ledger checker, lint gates, vitest spot file, dispatch probes) were re-executed during this audit.

## Threat Verification Register

| Threat ID | Category | Disposition | Status | Evidence (verified 2026-06-11) |
|-----------|----------|-------------|--------|--------------------------------|
| T-19-01 | Tampering | mitigate | CLOSED | `rg fallow package.json pnpm-lock.yaml` → 0 hits; ledger drop row present |
| T-19-02 | Elevation | mitigate | **OPEN (partial)** | 9/9 enumerated upstream-added org-automation workflows deleted with signal-named ledger rows (19-MERGE-AUDIT.md:37-45) — BUT 15 fork-legacy workflow files clean-merged uninspected; `.github/workflows/release.yml` carries `secrets.DISCORD_CHANGELOG_WEBHOOK`, `secrets.GSD_BOT_PR_TOKEN` (release.yml:567) and the next-branch release train (`git fetch origin next`, release.yml:188; publish `@opengsd/gsd-core@next`, release.yml:464) — all three signal classes that justified the 9 deletions. See "Open Threat Detail" below |
| T-19-03 | Repudiation | mitigate | CLOSED | 19-MERGE-AUDIT.md: 4-column schema header (1 match), six-prefix vocabulary at lines 16-17, status FINAL, 623 table rows; 19-13 checker parses 348 rows / 366 matchers |
| T-19-SC | Tampering | mitigate | CLOSED | "Dependency vetting (pre-install)" appendix (ledger:844) — 15/15 OK, zero FLAGGED; blocking-human approval recorded verbatim (ledger:878); fallow absent pre-install |
| T-19-04 | Spoofing | mitigate | CLOSED | Edit-distance + maintainer-identity screen documented (ledger:848-850); "FLAGGED rows: none" (ledger:870) |
| T-19-05 | Tampering | mitigate | CLOSED | `package-lock.json` absent; `pnpm-lock.yaml` present, `lockfileVersion: '9.0'` (regenerated, never hand-merged) |
| T-19-06 | Repudiation | mitigate | CLOSED | harvest/ counts on disk: query-handlers 27, bin-lib 10, workflow-deltas 9, misc 4; per-path ledger rows; 19-13 comm proof closes the loop |
| T-19-07 | Tampering | mitigate | CLOSED | Spot byte-check: `jj file show -r c7bd6bee get-shit-done/bin/lib/commands.cjs \| cmp harvest/bin-lib/commands.cjs` → identical; zero conflict markers in tree |
| T-19-08 | DoS | mitigate | CLOSED | `gsd-core/templates/config.json` parses, `parallelization === true`; `vcs.adapter` present in `gsd-core/bin/shared/config-schema.manifest.json` (parses) |
| T-19-09 | Info Disclosure / Elevation | mitigate | CLOSED | `.github/workflows/test.yml`: zero `secrets.*` references of any kind, zero discord/bot/ORG_/GSD_BOT tokens, 34 pnpm references |
| T-19-10 | DoS | mitigate | CLOSED | `node -c` re-run green: scripts/changeset/github-release-notes.cjs, tests/helpers.cjs, tests/bug-3097-3099-…test.cjs; helpers contains `gsd-core/bin/lib/vcs/index.cjs` re-point |
| T-19-11 | Repudiation | mitigate | CLOSED | agents/gsd-research-synthesizer.md:144-147 — rule 7 (tengu_subagent_md_report_blocked gate, pre-seeded-file Edit path); `Edit` in tools (line 4) |
| T-19-12 | Tampering | mitigate | CLOSED | 35 .cts under src/vcs (34 ported + shim); zero relative `.js` specifiers; `timedOut` in exec.cts (ExecResult shape, 9 hits); 1:1 inventory diff vs `jj file list -r c7bd6bee sdk/src/vcs` → empty |
| T-19-13 | Spoofing | mitigate | CLOSED | `export function execGit\b` absent from src/vcs/exec.cts; `execGitVcs` exported (2 hits) |
| T-19-14 | Repudiation | mitigate | CLOSED | 1:1 inventory match (above); 58 `ported-to:src/vcs` ledger rows |
| T-19-15 | DoS | mitigate | CLOSED | `node -c gsd-core/bin/gsd-tools.cjs` green; `query head-ref` returns parseable JSON; `resolveGsdToolsPath` hits in src+gsd-core = 0; dogfood-phase-14.sh HISTORICAL header confirmed |
| T-19-16 | Tampering | mitigate | CLOSED | src/vcs-command-router.cts: routeVcsCommand exported, `: null` envelope convention present (3 hits); tests/vcs-adapter-contract.test.cjs present; zero checkout/"tag"/"stash" handlers |
| T-19-17 | Elevation | mitigate | CLOSED | "Appendix: PORT-02 per-family dispatch smoke" (ledger:752) — probe-only mutation verbs, tmp-repo cells |
| T-19-DG | Tampering/DoS | mitigate | CLOSED | `reset --hard` absent from src/*.cts (comments included); zero execSync/execFileSync outside shell-command-projection.cts; roadmap-upgrade.cts:15-19 adapter-restore rollback scoped to .planning/, loud-fail documented |
| T-19-18 | Info Disclosure | mitigate | CLOSED | `node scripts/lint-vcs-no-commit-id.cjs` re-run → 1027 files, 0 violations, exit 0; zero `commit_id` in router; adapter-contract test asserts per-backend id alphabets |
| T-19-19 | Repudiation | mitigate | CLOSED | Header disposition comments verified in all three substrate modules (shell-command-projection.cts, worktree-safety.cts, worktree-base-ref.cts — "19-07 AUDIT-01 disposition — substrate:…"); 27 `substrate:` ledger rows |
| T-19-20 | DoS | mitigate | CLOSED | Zero `gsd-sdk` under gsd-core/workflows/; workspace.parallel.dispatch in execute-phase.md (3) + quick.md (3); live verb probes status/log/head-ref/current-branch/restore all exit 0 |
| T-19-21 | Tampering | mitigate | CLOSED | `worktree_branch_check` in execute-phase.md (4) + quick.md (3); `git.create_tag` in complete-milestone.md (2); `#3491` in new-project.md (3); #683/base-ref language in execute-phase.md (6) |
| T-19-22 | Repudiation | mitigate | CLOSED | 18 `re-applied-at:gsd-core/workflows` ledger rows (9 workflows + re-expression notes) |
| T-19-23 | Spoofing | mitigate | CLOSED | Snippet source line 1: `git rev-parse --show-toplevel 2>/dev/null \|\| jj workspace root 2>/dev/null \|\| pwd`; live subdirectory resolution from docs/ returns the workspace root |
| T-19-24 | DoS | mitigate | CLOSED | .githooks/pre-commit:30 — `command -v "$GIT_CMD" && "$GIT_CMD" -C "$ROOT" rev-parse --git-dir` guard, GIT_OK degrade; filesystem-only lints as jj-native fallback (lines 43-65); `bash -n` green; zero sdk/src/query refs |
| T-19-25 | Repudiation | mitigate | CLOSED | 80 workflow embeds carry the jj-aware line; exactly 1 distinct resolution-line shape across all embeds (uniform sync output) |
| T-19-26 | Tampering | mitigate | CLOSED | SCAN_EXT includes `cts` in both scanners (lint-vcs-no-raw-git.cjs:68, lint-vcs-no-commit-id.cjs:58); positive-detection fixture test present (tests/scripts/lint-vcs-no-raw-git-fixture.test.cjs, 15 .cts references) |
| T-19-27 | Repudiation | mitigate | CLOSED | Zero `sdk/`/`get-shit-done/` path entries in either allow.json (jq = 0/0); `pending-19-12-residue-deletion` row present and resolved; both gates re-run exit 0 (raw-git: 1074 files / 0 violations) |
| T-19-28 | DoS | mitigate | CLOSED | `EMITTED_LIB_PREFIX = 'gsd-core/bin/lib/'` walk-ignore in BOTH scanners (raw-git:76, commit-id:65) with checked-in exceptions still scanned (legacy-cleanup.cjs, package-identity.cjs) |
| T-19-29 | Repudiation | mitigate | CLOSED | vitest.config.ts includes src/vcs/**/__tests__ with setupFiles matcher + GSD_TEST_BACKENDS; 59 assets on disk; named PORT-01 files present (cmd-parallel-jj, cmd-parallel-git, jj-hooks, adapter-contract); live spot-run: adapter-contract 45 passed / 11 skipped, exit 0 |
| T-19-30 | Tampering | mitigate | CLOSED | 50 snaps in tests/baselines/git-vcs/; capture harness present (tests/__tools__/capture-vcs-baselines.cjs); wholesale-regeneration diff recorded in 19-11 |
| T-19-31 | DoS | mitigate | CLOSED | `find gsd-core/bin/lib -path '*__tests__*'` → 0 |
| T-19-32 | Repudiation | mitigate | CLOSED | 56 class-scoped drop rows (`dropped:tests-target-retired-SDK` / `dropped:doc-parity…` / `dropped:target-script-retired`); over-deletion risk reversed (format-migration tests ported, 53/53) |
| T-19-33 | Tampering | mitigate | CLOSED (see note) | Delta decomposition in ledger appendix (26 → 22 net table, ledger:624-638). Note: `check-skip-count.cjs` exits 1 in this workspace TODAY (current=22 vs dynamic `origin/main` baseline=18) — the script has no static baseline; the gate self-heals once main is pushed with the merge. The 4 "new" skips are the 19-11 ported vitest files, fully accounted in the decomposition (steady-state 22 = origin/main 18 + the fork's known +4). Timing artifact, not a missing mitigation |
| T-19-34 | DoS | mitigate | CLOSED | Zero `pnpm -F sdk` in parallel-e2e.yml; scripts/e2e-parallel-phase.sh + scripts/run-tests.cjs + `build:lib` script all exist |
| T-19-35 | Repudiation | mitigate | CLOSED | Re-ran the committed checker against a fresh comm sweep: 951 lines, 951 matched, 0 unmatched, exit 0; "Phase gate results" table in ledger (line 990) |
| T-19-36 | Tampering | mitigate | CLOSED | Honesty guard verified in 19-13-ledger-check.mjs:28-31 (allowlist-bookkeeping rows excluded from matcher set); the one added row (310-file class) is machine-verified via fork-delta intersection, not invented |
| T-19-37 | DoS | accept→route | CLOSED (accepted risk) | See Accepted Risks Log below |

## Open Threat Detail

### T-19-02 — org-automation workflows referencing org secrets (PARTIAL — BLOCKER-class)

**What the mitigation covered:** 19-01 enumerated "upstream-ADDED" workflow files (present at upstream 03764dbc, absent at fork c7bd6bee) and deleted all 9 with signal-named ledger rows. Verified present and correct.

**What it missed:** 15 workflow files existed on BOTH sides (fork legacy from pre-fork upstream history), clean-merged with no conflict, and were never inspected or dispositioned. Tracked at `vpzlrrlv` and at `@`:

- **`.github/workflows/release.yml`** — the concrete gap. Carries all three org-automation signal classes used to justify the 9 deletions:
  - `secrets.DISCORD_CHANGELOG_WEBHOOK` (the exact secret whose presence justified deleting `discord-changelog.yml`)
  - `secrets.GSD_BOT_PR_TOKEN` (release.yml:567)
  - next-branch release train: `git fetch origin next:refs/remotes/origin/next` (release.yml:188), cherry-pick automation from origin/next, npm publish `@opengsd/gsd-core@next` (release.yml:464) — the fork has no `next` branch and is not the `@opengsd/gsd-core` npm owner
- **Bot/policy automation with default token only** (lower severity, but the same "org-automation" class the phase dropped): auto-branch.yml (next-aware), auto-close-deprecated.yml, auto-label-issues.yml, branch-cleanup.yml, branch-naming.yml, changeset-required.yml, close-draft-prs.yml (its sweep companion WAS deleted), dismiss-unauthorized-pr-approvals.yml, docs-required.yml, pr-template-format.yml, require-issue-link.yml, stale.yml. install-smoke.yml and security-scan.yml are code-CI and likely keepers.

**Severity context:** the fork is local-only with no GitHub Actions execution, the files are pre-existing fork-side legacy (not introduced by the merge), and the org secrets resolve only in the OpenGSD org context. Practical exploitability is low. But the declared threat component is "org-automation `.github/workflows/*` referencing org secrets" and the mitigation does not apply to all instances; additionally, the MERGE-02 completeness proof's comm-sweep universe was `sdk get-shit-done tests` — `.github/workflows` was structurally outside it, so no phase gate could have caught this.

**Remediation:** disposition each of the 15 fork-legacy workflow files in 19-MERGE-AUDIT.md (delete the org-automation ones — at minimum release.yml, or strip its Discord/bot-token/next-train sections — keep install-smoke.yml/security-scan.yml with `adopted-upstream`/`merged` rows), then re-run /gsd-secure-phase.

## Accepted Risks Log

| Threat ID | Risk | Acceptance Rationale | Verified Routing |
|-----------|------|----------------------|------------------|
| T-19-37 | Multi-file defects surfaced by the 19-13 gate could tempt scope-expanding hot-patches inside the gate plan | Disposition `accept→route`: gaps route to /gsd-verify-work instead of being patched in-gate | Honored — 19-13 made exactly two one-file fixes within its grant (checker trailing-slash glob; dogfood-phase-14.sh HISTORICAL header); all multi-file items deferred via the ledger's next-merge pointer (MIGR-05 release-notes adapter migration, git-cmd.js jj-parity v1.5, doc-parity re-derivation, `query diff --diff-filter`) |

## Unregistered Flags

None. No SUMMARY contained a `## Threat Flags` section. The release.yml finding maps to existing threat T-19-02 (recorded above, not as an unregistered flag).

## Non-Blocking Observations

1. **check-skip-count exits 1 in this workspace** (current=22 vs origin/main=18) — dynamic-baseline timing artifact; self-heals when the merged main is pushed. See T-19-33 note.
2. **Untracked filesystem leftovers** at `sdk/` (dist, node_modules, src) and `get-shit-done/` exist in the default workspace despite zero tracked entries (`jj file list -r @ sdk get-shit-done` → empty). The 19-12 residue deletion holds in the tracked tree; the leftovers are stale pre-merge build output in this workspace. Cosmetic cleanup recommended (`rm -rf sdk get-shit-done` after confirming untracked).
3. **vpzlrrlv commit id changed** (36c417ee → 5c6adfd1) — consistent with the operator's documented post-phase squash of the 19-01…19-13 stack into the merge change (2026-06-11); change id preserved. Not a finding.

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-11 | 38 | 37 | 1 | gsd-security-auditor (/gsd-secure-phase 19) |

**Operator decision (2026-06-11):** T-19-02 NOT accepted — block until fixed. Remediation: disposition the 15 fork-legacy `.github/workflows/` files in 19-MERGE-AUDIT.md (delete or strip release.yml's org-secret/next-train sections; keep install-smoke.yml/security-scan.yml with explicit rows), then re-run `/gsd-secure-phase 19`.

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log (T-19-37)
- [ ] `threats_open: 0` confirmed — **1 open (T-19-02)**
- [ ] `status: verified` set in frontmatter

**Approval:** pending — blocked on T-19-02 remediation
