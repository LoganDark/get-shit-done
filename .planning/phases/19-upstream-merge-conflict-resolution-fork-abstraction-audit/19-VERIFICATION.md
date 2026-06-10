---
phase: 19-upstream-merge-conflict-resolution-fork-abstraction-audit
verified: 2026-06-10T17:47:56Z
status: passed
score: 8/8 must-haves verified
overrides_applied: 0
---

# Phase 19: Upstream merge conflict resolution + fork-abstraction audit — Verification Report

**Phase Goal:** Upstream restructure ADOPTED with zero remaining conflicts and functional code; the fork's VCS abstraction layer ported to src/vcs/*.cts; raw-git sites migrated to the adapter; fork tests ported; lint gates re-pointed; every fork-file disposition recorded in the 19-MERGE-AUDIT.md ledger (no silently-lost fork capability).
**Verified:** 2026-06-10T17:47:56Z
**Status:** passed
**Re-verification:** No — initial verification

All evidence below is from commands re-run by the verifier against the working copy (not SUMMARY claims), except the full 13,050-test node:test suite, where the verification request authorized reliance on the 19-13 gate transcript + triaged ledger appendix; the verifier's independent targeted runs (59/59 contract/guard subset both backends, 627/627 vitest both backends) are consistent with that transcript.

## Goal Achievement

### Observable Truths (requirement IDs per 19-VALIDATION.md)

| # | Truth | Status | Evidence (verifier re-run) |
|---|-------|--------|----------------------------|
| 1 | MERGE-01: zero conflicts, zero markers | ✓ VERIFIED | `jj resolve --list` → "No conflicts found"; `jj st` no conflict lines; `rg -l '^(<<<<<<<\|%%%%%%%\|>>>>>>>)' --glob '!.planning/**'` → zero hits (no exclusions even needed) |
| 2 | MERGE-02: ledger completeness, no silently-lost fork capability | ✓ VERIFIED | Re-ran committed checker `19-13-ledger-check.mjs` against a fresh `comm -23` sweep: **951/951 matched, 0 unmatched, exit 0**. Ledger status FINAL. Out-of-universe spot-check: 4 CI files at fork but absent now (canary/hotfix/pr-gate/release-sdk.yml) are machine-verified fork-unmodified-from-base (`jj diff --from b533f718 --to c7bd6bee` = 0 lines each) — pure upstream deletions, retirement rationale ledgered |
| 3 | MERGE-03: build green, CJS parses | ✓ VERIFIED | `pnpm run build:lib` exit 0; `gsd-core/bin/lib/vcs/index.cjs` + sentinel emitted; `node -c` spot-passes on helpers.cjs, gsd-tools.cjs (gate 4 covered all 56 inventory files) |
| 4 | MERGE-04: tests green both backends + skip baseline | ✓ VERIFIED | `GSD_TEST_BACKENDS=git,jj-colocated npx vitest run` → **61 files / 627 tests, 0 fail, exit 0**; targeted node:test subset (contract, cjs-smoke, bridge-commit-files, windowshide, quick-md-dispatch, agent-prompts) → **59/59 both backends**; `check-skip-count` exit 0, count 22 (known stderr quirk on jj-only workspace, per triage); full suite per 19-13 gate: 13,006/13,050 with the 29 fails confined to the 2 enumerated gpg-environmental files in the ledger's triaged appendix |
| 5 | MERGE-05: re-pointed lint gates green and non-vacuous | ✓ VERIFIED | All four gates exit 0 (raw-git 1073 files/0; commit-id 1026/0; audit-workflow 230 == frozen baseline; parallel-call-presence 107/0); SCAN_EXT includes `.cts` in both scanners; positive-detection fixture test `tests/scripts/lint-vcs-no-raw-git-fixture.test.cjs` → 10/10 pass; zero `sdk/`/`get-shit-done/` entries in either allowlist (jq = 0/0); zero `get-shit-done/workflows` scan-root strings remain |
| 6 | PORT-01: jj invariants survive the port | ✓ VERIFIED | `src/vcs/__tests__/` = 56 test files incl. cmd-parallel-{jj,git}, cmd-parallel-cancel-{jj,git}, jj-hooks; `toBeIdOf` matcher present in tests/__tools__/vitest-matchers.ts; vitest green both backends; jj backend bookmark-write sites carry validateRefname + `--` (WR-02 fix confirmed in src/vcs/backends/jj.cts:316-320) |
| 7 | PORT-02: dispatch chain end-to-end | ✓ VERIFIED | Re-ran committed `19-13-dispatch-smoke.sh` (zsh): **BOTH CELLS PASS** — jj-only (--no-colocate) and git cells, launcher sourced from sub/dir, GSD_TOOLS readlink-verified, valid JSON envelopes; on this repo `query head-ref` returns `{"ok":true,...}` and upstream verb `query state.load` exit 0 (chain not severed) |
| 8 | AUDIT-01: seam migration complete or justified | ✓ VERIFIED | `rg -l "execGit\(" src -g '*.cts'` outside {shell-command-projection, worktree-safety, worktree-base-ref, vcs/} → zero; `execSync\|execFileSync` outside shell-command-projection.cts → zero; `reset --hard` in src/*.cts → zero; substrate ledger rows present |

**Score:** 8/8 truths verified

### Required Artifacts (3-level: exists / substantive / wired)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/vcs/**/*.cts` | 36 fork vcs modules ported | ✓ VERIFIED | 35 on disk = **34 fork production modules 1:1** (verifier diffed against `jj file list -r c7bd6bee sdk/src/vcs`) + planning-shim.cts. "36" was a documented plan over-count (19-05 deviation 1; the research chunk table sums to 34). Wired: emitted lib loads, createVcsAdapter functional (smoke + contract tests) |
| `src/vcs-command-router.cts` | 23-verb bridge, no phantom verbs | ✓ VERIFIED | Exists, routeVcsCommand emitted + dispatching (head-ref/status envelopes); no checkout/tag/stash handler registrations |
| `gsd-core/bin/gsd-tools.cjs` | wired dispatch, upstream cases intact | ✓ VERIFIED | query head-ref (new) and state.load (pre-existing) both dispatch; node -c clean |
| `vitest.config.ts` + `src/vcs/__tests__/` + `tests/__tools__/vitest-matchers.ts` | revived fork suite | ✓ VERIFIED | 61 test files collected and green both backends; toBeIdOf registered |
| `tests/helpers.cjs` | merged _loadVcs re-pointed | ✓ VERIFIED | contains `gsd-core/bin/lib/vcs/index.cjs`; node -c clean; consumed by passing contract tests (data flows) |
| `scripts/lint-vcs-no-raw-git.cjs` / `.allow.json` (+ 3 sibling gates) | re-pointed, +cts, legacy entries stripped | ✓ VERIFIED | See truth 5 |
| `gsd-core/workflows/_runtime-launcher.snippet.sh` | jj-aware root resolution, synced | ✓ VERIFIED | `jj workspace root` in source + 75 workflow embeds (≥50 required); functional proof = dispatch smoke resolving root from subdirectory |
| `gsd-core/workflows/execute-phase.md`, `quick.md` | fork parallel dispatch + upstream guards | ✓ VERIFIED | workspace.parallel.dispatch ×3 in each; worktree_branch_check (7), base-ref (1), manifest (9) language present; zero gsd-sdk refs in workflows/ or agents/ |
| `agents/gsd-executor.md` | assert-dispatched-cwd + destructive-git prohibition | ✓ VERIFIED | Both guards present |
| `gsd-core/references/dispatch-cwd-safety.md`, `gsd-core/workflows/migrate-vcs.md` | fork files re-homed | ✓ VERIFIED | Both exist at gsd-core paths; originals gone with the get-shit-done/ tree |
| `.githooks/pre-commit` | rewired, jj-tolerant | ✓ VERIFIED | bash -n clean; zero sdk/src/query refs; jj-hooks.test.ts (firing contract) green in vitest |
| `.github/workflows/test.yml`, `parallel-e2e.yml` | de-org'd, pnpm, re-pointed | ✓ VERIFIED | test.yml: 34 pnpm refs, zero discord/bot/ORG_ tokens; parallel-e2e.yml: zero `pnpm -F sdk` |
| `package.json` + lockfiles | upstream identity, pnpm, fallow dropped, vitest added | ✓ VERIFIED | @opengsd/gsd-core 1.4.3, pnpm@11.3.0 pin, no fallow, vitest devDep, no gsd-sdk bin; pnpm-lock.yaml present, package-lock.json absent. Note: pnpm-workspace.yaml exists but is pnpm 11's allowBuilds store (29 bytes, `allowBuilds: esbuild`), not a workspace manifest — documented 19-02 reclassification |
| `gsd-core/templates/config.json` + config-schema manifest | fork config payloads re-homed | ✓ VERIFIED | parallelization: true in template; vcs.adapter validKey grafted into config-schema.manifest.json. (Template has no `vcs` block — documented 19-03 deviation: the fork template never had one; capability lives in the schema manifest) |
| `sdk/`, `get-shit-done/` | deleted | ✓ VERIFIED | Neither directory exists |
| `19-MERGE-AUDIT.md` | FINAL ledger with proofs | ✓ VERIFIED | Status FINAL; completeness proof, phase-gate results table, triaged-failures / hand-edited-.cjs / skip-count / vetting appendices, next-merge pointer all present |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| gsd_run query verbs in workflows | gsd-tools dispatch | query meta-prefix | ✓ WIRED | head-ref/status dispatch live; agent-prompts-no-raw-git + quick-md-parallel-dispatch tests pass against the rewired prompts |
| gsd-tools.cjs | gsd-core/bin/lib/vcs-command-router.cjs | require + family registration | ✓ WIRED | query head-ref returns the adapter envelope on this jj repo |
| src/commands.cts etc. | src/vcs/index.cts | ./vcs/index.cjs sibling import | ✓ WIRED | Zero execGit sites remain in migrated modules; contract/bridge tests exercise the chain |
| launcher snippet | 75 workflow embeds | sync-runtime-launcher.cjs | ✓ WIRED | jj leg present in source + embeds; dispatch smoke proves subdirectory resolution |
| tests/helpers.cjs _loadVcs | gsd-core/bin/lib/vcs/index.cjs | lazy require | ✓ WIRED | contract suite green through it |
| comm sweep | ledger rows | 19-13-ledger-check.mjs | ✓ WIRED | re-run: 951/951, exit 0 |

### Probe Execution (re-run by verifier)

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| Ledger completeness checker | `node 19-13-ledger-check.mjs 19-MERGE-AUDIT.md /tmp/19-verif-comm.txt` | 951 sweep lines, 951 matched, 0 unmatched, exit 0 | PASS |
| Dispatch smoke | `zsh 19-13-dispatch-smoke.sh` | "DISPATCH SMOKE: BOTH CELLS PASS", exit 0 | PASS |

Note: 19-13-dispatch-smoke.sh is a zsh script (`#!/bin/zsh`); invoking it via `bash` fails with a syntax error (zsh-style `{ ...; exit 1 }` bodies). Run via zsh or directly. Not a defect — recorded so the next pull's operator does not misread it as broken.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Build emits + loads | `pnpm run build:lib`; require vcs/index.cjs (via contract test) | exit 0; createVcsAdapter loads | ✓ PASS |
| Vitest both backends | `GSD_TEST_BACKENDS=git,jj-colocated npx vitest run` | 61 files / 627 tests, 0 fail | ✓ PASS |
| node:test contract/guard subset both backends | `run-tests.cjs --files` (6 files) | 59 pass / 0 fail | ✓ PASS |
| .cts detection non-vacuous | fixture test | 10/10 pass | ✓ PASS |
| Four lint gates | direct invocation | all exit 0 | ✓ PASS |
| Drift gates | `check:alias-drift`, `check:identity-drift` | both ok, exit 0 | ✓ PASS |
| Skip baseline | `check-skip-count.cjs` | exit 0, count 22 (triaged stderr quirk) | ✓ PASS |
| Dispatch on this repo | `query head-ref`, `query state.load` | JSON envelope; exit 0 | ✓ PASS |
| Merge change integrity | `jj log -r 'vpzlrrlv \| parents(vpzlrrlv)'` | vpzlrrlv=36c417ee, parents 03764dbc + c7bd6bee — original ids intact | ✓ PASS |
| Code-review fixes landed | grep CR-01/02/03, WR-01/02/05/10 sites | all 7 sampled fixes present in code (e.g. commands.cts:595 kind==='git' guard; roadmap-upgrade.cts:520 expr.parent(); gsd-tools.cjs:671 --respect-staged; git.cts:313-314 timeout+windowsHide; jj.cts:316 validateRefname; expr.cts:96 ancestor; git-cmd.js:124 splitOnShellOperators) | ✓ PASS |

### Requirements Coverage

| Requirement | Source | Description | Status | Evidence |
|-------------|--------|-------------|--------|----------|
| MERGE-01 | 19-VALIDATION.md (phase-defined) | zero conflicts + zero markers | ✓ SATISFIED | Truth 1 |
| MERGE-02 | 19-VALIDATION.md | ledger completeness | ✓ SATISFIED | Truth 2 |
| MERGE-03 | 19-VALIDATION.md | build green; CJS parses | ✓ SATISFIED | Truth 3 |
| MERGE-04 | 19-VALIDATION.md | tests green both backends + skip baseline | ✓ SATISFIED | Truth 4 |
| MERGE-05 | 19-VALIDATION.md | re-pointed lint gates green | ✓ SATISFIED | Truth 5 |
| PORT-01 | 19-VALIDATION.md | jj invariants survive the port | ✓ SATISFIED | Truth 6 |
| PORT-02 | 19-VALIDATION.md | dispatch chain end-to-end | ✓ SATISFIED | Truth 7 |
| AUDIT-01 | 19-VALIDATION.md | seam migration complete or justified | ✓ SATISFIED | Truth 8 |

No orphaned requirements: .planning/REQUIREMENTS.md maps nothing to Phase 19 (the phase predates the registry's merge coverage; its MERGE-08 entry is an unrelated pre-existing deferred v1.5 item — whose `sdk/src/vcs/types.ts` path citation is now stale post-port; informational only).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/vcs/hook-bridge.cts | 13 | `TODO(D-05/HOOK-05)` | ℹ️ Info | Fork-inherited forward pointer referencing tracked decision IDs (byte-for-behavior port; documented in 19-05-SUMMARY and the ledger's deferral list) |
| src/vcs-command-router.cts / src/roadmap-upgrade.cts | 706 / 19 | comments cross-referencing the jj.cts TODO | ℹ️ Info | Documentation pointers, not unimplemented code paths |
| src/phase.cts, src/init.cts, src/gap-checker.cts | various | literal string `'TBD'` | ℹ️ Info | Roadmap-template domain vocabulary (generation/parsing of the `Requirements: TBD` placeholder format), not debt markers |

No TBD/FIXME/XXX debt markers, no stub implementations, no hardcoded-empty data found in phase-modified files.

### Documented Deviations Accepted Without Override (intent satisfied)

1. **"36 vcs modules" → 34 + shim (19-05):** the authoritative `jj file list -r c7bd6bee sdk/src/vcs` inventory is 34 production modules; verifier independently confirmed the 1:1 port (current set minus planning-shim.cts ≡ fork inventory). The truth's referent ("all fork vcs production modules") is fully met; "36" was a plan over-count.
2. **templates/config.json has no `vcs` block (19-03):** the fork template at c7bd6bee never had one; the `vcs.adapter` capability survives via the config-schema.manifest.json validKey graft (verified present). The must-have truth as written ("config-schema additions survive at gsd-core counterpart paths") is satisfied.
3. **pnpm-workspace.yaml exists (19-02):** pnpm 11 allowBuilds approval store, not a resurrected workspace manifest.
4. **29 node:test failures in 2 files:** machine-environmental (global `commit.gpgsign=true` breaks byte-identical-upstream raw-git fixtures; reproducible at 03764dbc; green on CI) — enumerated in the ledger's triaged appendix and explicitly excluded by the verification request.

### Human Verification Required

None. The phase goal is mechanical and fully machine-verified above. No plan contained deferred `<human-check>` blocks; the single `checkpoint:human-verify` (19-02 dependency legitimacy gate) was satisfied during execution (operator typed "approved" 2026-06-10, recorded in 19-02-SUMMARY).

### Post-Verification Operator Actions (informational, per 19-VALIDATION.md "Manual-Only Verifications" — not verification gates)

1. **Squash the 19-01…19-13 stack into merge change `vpzlrrlv`** — graph mutation is operator-owned and explicitly sequenced "after phase verification passes". Review `jj log` first.
2. **Update the installed-GSD copy / sibling checkout** — explicitly deferred out of phase scope.

### Gaps Summary

No gaps. All 8 phase-defined requirements verified against the codebase by independent re-execution; the two committed proof probes pass on re-run; the ledger is FINAL with a machine-checked completeness proof (951/951); the merge change and its parents are untouched. Open deferrals (MIGR-05 release-notes adapter migration, git-cmd.js jj-parity, doc-parity re-derivation, gpg fixture hardening) are explicitly out of phase scope and tracked in deferred-items.md + the ledger's next-merge pointer — none reduce this phase's goal.

---

_Verified: 2026-06-10T17:47:56Z_
_Verifier: Claude (gsd-verifier)_
