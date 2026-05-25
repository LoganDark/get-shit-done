---
phase: 16-workflow-invariant-tooling
verified: 2026-05-24T23:40:00Z
status: human_needed
score: 11/11 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Confirm `parallel-e2e-gate` is registered as a required status check in GitHub branch-protection for the default branch"
    expected: "`parallel-e2e-gate` (NOT the `parallel-e2e` matrix job itself) is the required-blocking status check on the main branch ruleset; a failed jj-colocated cell → failed `parallel-e2e` → failed `parallel-e2e-gate` → PR blocked"
    why_human: "Branch-protection settings live in GitHub UI (settings/branches → ruleset), outside the repo. SC2 stipulates 'required-blocking on jj-colocated' — the YAML carries the mechanism (gate job that fails if matrix.aggregate != success), but the policy binding that turns it into a hard block is operator-controlled and not visible to grep"
---

# Phase 16: Workflow + Invariant Tooling Verification Report

**Phase Goal:** Two file-disjoint invariant-tooling additions: a new CI lint that enforces workflows declaring `vcs.workspace.parallel.dispatch` / `fan-in` literals actually call the verbs (mirrors `lint-vcs-no-raw-git.cjs` shape), and the orphan FS dir reap that closes the v14-orphan-jj-workspace-dirs cleanup-contract gap on both the dispatcher fanIn success branch AND the recovery script.

**Verified:** 2026-05-24T23:40:00Z
**Status:** human_needed (all codebase truths VERIFIED; one off-repo policy binding requires operator inspection)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (Must-Haves)

Merged from ROADMAP success criteria + PLAN frontmatter must_haves.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| T1 | SC1 — `scripts/lint-vcs-parallel-call-presence.cjs` exits 0 on paired-dispatch+fan-in workflows; exits 1 on unpaired; content-driven via literal substring match in bash/sh/zsh fences (NOT heading-based per Pitfall 7); per-entry `{path, reason, owner}` allowlist via `scripts/lib/allowlist-parser.cjs` (no `expires`); fixture-based unit test covers Pitfall 7 false-positive cases | VERIFIED | `node scripts/lint-vcs-parallel-call-presence.cjs` against live tree → exit 0, "103 files scanned, 0 violations"; `node --test tests/scripts/lint-vcs-parallel-call-presence.test.cjs` → 5/5 D-14 scenarios pass including #4 prose-only false-positive guard; production allowlist contains zero `expires` literal (grep -c == 0); parser actively throws on `expires` per `feedback_solo_dev_no_expires` (Rule 2 deviation, 16 allowlist-parser tests pass) |
| T2 | SC2 — CI step in `.github/workflows/parallel-e2e.yml` runs the lint adjacent to existing `audit-workflow-raw-git.cjs` CI-06 step; required-blocking on jj-colocated (inherits via `parallel-e2e-gate`); NOT promoted to `npm pretest` | VERIFIED | parallel-e2e.yml:127 carries audit step; :135-137 carries new `Lint — workflow call-presence (LINT-06)` step inside the same `parallel-e2e` matrix job; paths-filter at :41-42 adds script + allowlist; `grep -c lint-vcs-parallel-call-presence .github/workflows/parallel-e2e.yml` returns 3; package.json `pretest` does NOT reference the new lint (grep returns 0); `parallel-e2e-gate` job at :146 unchanged — mechanism in place. (Required-status-check binding via GitHub branch protection — see `human_verification` below) |
| T3 | SC3 — After `vcs.workspace.parallel.fan-in` clean-path success on jj backend, no `.claude/jj-workspaces/phase-*-subagent-*` FS dirs exist; cross-backend test asserts `existsSync(ws.path) === false` for every workspace in the handle | VERIFIED | parallel.ts:496-501 calls `cleanupSubagentWorkspaces(mainRepoRoot, handle.phaseNumber, workspacesToReap)` after `merged.push(mergeChangeId)`; cmd-parallel-jj.test.ts:201 asserts `remainingWorkspaces.length === 0`; :209 asserts `existsSync(ws.path) === false`; cmd-parallel-git.test.ts:210 asserts same `existsSync === false` for git cell; vitest cmd-parallel-{jj,git}.test.ts → 27/27 pass |
| T4 | SC4 — Conflicted branch UNCHANGED: `performJjParallelFanIn` conflicted branch preserves workspaces on disk for human inspection (W3 (a) joint-assertion); only clean-path reaps; documented inline at code site | VERIFIED | parallel.ts:394-402 inline comment "W3 (a) / CF-03 / AP-5 (Phase 16.02 lock-in): workspaces are PRESERVED on disk here for human inspection… NO call to cleanupSubagentWorkspaces"; conflicted-branch body grep for `cleanupSubagentWorkspaces` returns 0 hits; cmd-parallel-jj.test.ts:342 INVERSE-polarity assertion `existsSync(ws.path) === true` for all workspaces; CR-01 follow-up filter (parallel.ts:490-499) also preserves crashed-agent workspaces on the clean-merge path — extends the W3(a) contract to the mixed-clean-with-crashed scenario; cmd-parallel-jj.test.ts:417 regression guard `existsSync(handle.workspaces[1].path) === true` for crashed agent |
| T5 | SC5 — `scripts/dogfood-restore.sh` includes idempotent post-restore cleanup; end-to-end test covers `jj op restore` + orphan-survival fixture; D-16 seeds two distinct phase numbers via `--all-phases` | VERIFIED | dogfood-restore.sh:63-106 appends LAST-position cleanup step calling `gsd-sdk query cleanup-subagent-workspaces --all-phases`; CR-02-corrected stdout/stderr separation via mktemp tempfile; WR-04-corrected explicit WARN on jq parse failure; `bash -n` exits 0; `awk` ordering check (tar-xf < cleanup) → OK; `grep -cE '(^|[ \t;&\|(])git[ \t]+[a-zA-Z]'` returns 0 (no raw git); `node --test tests/scripts/dogfood-restore-orphan-cleanup.test.cjs` → 2/2 tests pass (D-16 cross-phase + CR-02 noisy-stderr regression) |
| T6 | IP-5 single-owner — fanIn clean-path, dogfood-restore.sh (via CLI bridge), and the existing cancel verb ALL call `cleanupSubagentWorkspaces(...)` directly; no inline `rmSync` / `jj workspace forget` duplicate body | VERIFIED | `grep -rn 'rmSync.*phase-.*subagent' sdk/src scripts | grep -v test | grep -v __tests__` returns ZERO hits — the helper at `workspace-cleanup.ts:163` is the only owner; helper docblock at workspace-cleanup.ts:146-149 cross-references Phase 16 CONTEXT.md as consumer-completion record (D-17) |
| T7 | CF-02 three-site CLI bridge registration — `gsd-sdk query cleanup-subagent-workspaces` resolves at runtime via catalog + manifest + aliases.generated | VERIFIED | command-static-catalog-domain.ts:24 imports `cleanupSubagentWorkspacesQuery`, :82 maps `['cleanup-subagent-workspaces', cleanupSubagentWorkspacesQuery]`; command-manifest.non-family.ts:68 declares manifest entry `{ canonical: 'cleanup-subagent-workspaces', aliases: [], mutation: true, outputMode: 'json' }`; command-aliases.generated.ts:112 carries alias-table entry; CJS mirror at get-shit-done/bin/lib/command-aliases.generated.cjs:589 also regenerated; live `gsd-sdk query cleanup-subagent-workspaces --all-phases` returns `{abandoned:[], failedReaped:[]}` |
| T8 | Bridge supports `--phase N` OR `--all-phases` (mutually exclusive); structured `{ok:false, reason:'<snake>'}` envelope on argv errors; `--all-phases` enumerates `.claude/jj-workspaces/` via anchored regex `/^phase-(\d+)-subagent-\d+$/` (T-16.02-01 ASVS V12 mitigation) | VERIFIED | cleanup-subagent-workspaces.ts:85-93 argv loop with explicit `i + 1 < args.length` length guard (WR-03 fix); :98-115 three argv-validation gates (mutual-exclusion, required-flag, invalid_phase_number); WR-05 fix exports `WORKSPACE_NAME_RE` from workspace-cleanup.ts:99 so bridge + helper share single source of truth; `tests/cli-cleanup-subagent-workspaces.test.cjs` → 4/4 pass including bogus-verb negative control proving three-site resolution is functional |
| T9 | TDD-bundled tests are GREEN: LINT-06 fixture tests + CLI smoke + jj/git cross-backend + dogfood integration | VERIFIED | `node --test tests/scripts/lint-vcs-parallel-call-presence.test.cjs` 5/5; `node --test tests/cli-cleanup-subagent-workspaces.test.cjs` 4/4; `node --test tests/scripts/dogfood-restore-orphan-cleanup.test.cjs` 2/2; `pnpm --filter ./sdk exec vitest run src/vcs/__tests__/cmd-parallel-jj.test.ts src/vcs/__tests__/cmd-parallel-git.test.ts` 27/27; `node --test tests/scripts/allowlist-parser.test.cjs` 16/16 (11 prior + 5 new WR-02); `pnpm --filter ./sdk exec vitest run src/vcs/__tests__/jj-workspace-cleanup.test.ts` 4/4 |
| T10 | All 7 code-review findings (2 BLOCKER CR-01/CR-02 + 5 WARNINGS WR-01..WR-05) addressed | VERIFIED | CR-01: parallel.ts:490-499 crashedAgentIds filter excludes crashed workspaces from cleanup — preserves IncompleteWorkEntry.workspacePath forensic surface; WR-01: cmd-parallel-jj.test.ts:417 regression guard added; CR-02: dogfood-restore.sh:81-89 mktemp tempfile separates stdout/stderr; WR-04: dogfood-restore.sh:98-105 explicit WARN on jq parse failure; WR-02: allowlist-parser.cjs:49-56 $schema_version validation; WR-03: argv loop length-guard in cleanup-subagent-workspaces.ts + workspace-parallel-cancel.ts; WR-05: hoisted `WORKSPACE_NAME_RE` to workspace-cleanup.ts; bridge buckets-by-phase + passes explicit list to helper. 5 fix commits in jj log: `rrwmmo` (CR-01+WR-01), `quwlop` (CR-02+WR-04), `wmvqlw` (WR-02), `uvttxk` (WR-03), `rlrsly` (WR-05). 3 Info findings (IN-01/02/03) intentionally out of scope per fix_scope=critical+warning |
| T11 | SDK TypeScript compiles cleanly with all surgical edits | VERIFIED | `pnpm --filter ./sdk run build` → exit 0 (tsc + tsc -p tsconfig.cjs.json both clean) |

**Score:** 11/11 truths verified

---

### Required Artifacts (Three-Level Check + Level 4 Data-Flow)

| Artifact | Exists | Substantive | Wired | Data Flows | Status |
|----------|--------|-------------|-------|------------|--------|
| `scripts/lint-vcs-parallel-call-presence.cjs` | ✓ (146 LOC) | ✓ (full impl: argv, allowlist, FENCE_OPEN/FENCE_CLOSE byte-identical to audit, fence walker, XOR violation check, file:1 diagnostics) | ✓ (referenced from parallel-e2e.yml:137 + tests/scripts test file) | ✓ (scans 103 files, exits 0) | VERIFIED |
| `scripts/lint-vcs-parallel-call-presence.allow.json` | ✓ | ✓ ($schema_version=2, $migration_note, $comment_ip2_cancel_exclusion, entries=[]) | ✓ (require('./lint-vcs-parallel-call-presence.allow.json') at lint:54) | ✓ (parser returns empty Set + RegExp arrays; valid against tightened schema) | VERIFIED |
| `tests/scripts/lint-vcs-parallel-call-presence.test.cjs` | ✓ (167 LOC) | ✓ (5 D-14 scenarios; uses node:test + assert/strict) | ✓ (consumes fixture trees + script via --scan-root) | ✓ (5/5 pass) | VERIFIED |
| 5 fixture .md files under `tests/scripts/fixtures/lint-vcs-parallel-call-presence/` | ✓ (all 5 paths exist) | ✓ (each fixture exercises distinct D-14 scenario) | ✓ (consumed by test file) | ✓ (lint behaviors observed) | VERIFIED |
| `.github/workflows/parallel-e2e.yml` modified | ✓ | ✓ (paths-filter ×2 + new step inside parallel-e2e matrix job) | ✓ (inherits parallel-e2e-gate blocking discipline) | N/A (CI YAML) | VERIFIED |
| `sdk/src/query/cleanup-subagent-workspaces.ts` | ✓ (176 LOC) | ✓ (full QueryHandler implementation: argv parser, mutual-exclusion gates, --phase and --all-phases modes, WR-03 length guard, WR-05 shared regex, bucket-by-phase + explicit-list helper call) | ✓ (registered at all 3 sites; live `gsd-sdk query cleanup-subagent-workspaces --all-phases` resolves) | ✓ (returns real `{abandoned, failedReaped}` envelope from helper) | VERIFIED |
| `sdk/src/query/command-static-catalog-domain.ts` (Site 1) | ✓ | ✓ (import :24 + map entry :82) | ✓ (catalog domain consumed by registry) | ✓ (verb resolves at runtime) | VERIFIED |
| `sdk/src/query/command-manifest.non-family.ts` (Site 2) | ✓ | ✓ (manifest entry :68 with mutation=true, outputMode=json) | ✓ (consumed by alias generator) | ✓ (drives the regen) | VERIFIED |
| `sdk/src/query/command-aliases.generated.ts` (Site 3) | ✓ | ✓ (alias entry :112 — regenerated via sdk/scripts/gen-command-aliases.ts) | ✓ (consumed by CLI dispatcher) | ✓ (alias resolves) | VERIFIED |
| `get-shit-done/bin/lib/command-aliases.generated.cjs` (CJS mirror) | ✓ | ✓ (entry :589) | ✓ (consumed by gsd-tools.cjs legacy callers) | ✓ (verb resolves via legacy CJS path) | VERIFIED |
| `sdk/src/vcs/jj/parallel.ts` modified (clean-path call + conflicted comment + CR-01 filter) | ✓ | ✓ (:468-501 clean-path TS-direct call after merged.push; :394-402 conflicted-branch lock-in comment; :490-499 crashedAgentIds filter) | ✓ (cleanupSubagentWorkspaces imported at :67; called at :496 + :598; lint returns 3+ hits) | ✓ (helper executes, returns failedReaped which is merged into outer array) | VERIFIED |
| `sdk/src/vcs/jj/workspace-cleanup.ts` modified (D-17 docblock + WR-05 regex export) | ✓ | ✓ (:99 exports WORKSPACE_NAME_RE; :146-149 D-17 consumer-completion record) | ✓ (consumed by bridge + cancel + fanIn) | ✓ (idempotent helper executes) | VERIFIED |
| `scripts/dogfood-restore.sh` modified | ✓ (107 LOC, up from 61) | ✓ (full CR-02 fix: mktemp stderr tempfile, if/else for $? observability; WR-04 fix: explicit WARN on jq parse failure; D-11 LAST-step placement) | ✓ (gsd-sdk verb resolves; jq available) | ✓ (integration test seeds 2 phases + observes both reaped) | VERIFIED |
| `tests/cli-cleanup-subagent-workspaces.test.cjs` | ✓ (155 LOC) | ✓ (4 scenarios: required-flag, mutual-exclusion, invalid-phase, bogus-verb negative control) | ✓ (consumes SDK_BIN via spawnSync) | ✓ (4/4 pass) | VERIFIED |
| `tests/scripts/dogfood-restore-orphan-cleanup.test.cjs` | ✓ (388 LOC; PATH-shim + 2-phase seed + CR-02 noisy-stderr fixture) | ✓ (D-16 cross-phase enumeration test + CR-02 regression test; seedJjRepo + seedWorkspace + seedFakeTarball helpers) | ✓ (invokes production scripts/dogfood-restore.sh via spawnSync; shim lives OUTSIDE colocated jj working tree per the runtime-discovery pattern) | ✓ (2/2 pass) | VERIFIED |
| `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts` modified | ✓ | ✓ (flipped assertion :201 to .toBe(0); :209 existsSync false loop; :342 conflicted INVERSE existsSync true loop; :417 crashed-agent forensic guard) | ✓ (vitest discovers + runs) | ✓ (13/13 pass) | VERIFIED |
| `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts` modified | ✓ | ✓ (:210 git-cell existsSync false loop; no cleanupSubagentWorkspaces call — git uses worktree remove --force) | ✓ (vitest discovers + runs) | ✓ (14/14 pass) | VERIFIED |
| `scripts/lib/allowlist-parser.cjs` modified (WR-02 + Rule 2 deviation) | ✓ | ✓ (FORBIDDEN_FIELDS=['expires'] export; CURRENT_SCHEMA_VERSION=2 + validation; throws on expires + on version mismatch) | ✓ (consumed by all 3 production lint scripts) | ✓ (16 parser tests pass) | VERIFIED |
| `sdk/src/query/workspace-parallel-cancel.ts` modified (WR-03) | ✓ | ✓ (length-guard fix for --cwd + --handle) | ✓ (existing cancel verb still works) | ✓ (no behavioral change other than empty-string flag handling) | VERIFIED |

All artifacts pass Levels 1-4.

---

### Key Link Verification (Wiring)

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `scripts/lint-vcs-parallel-call-presence.cjs` | `scripts/lib/allowlist-parser.cjs` | `require('./lib/allowlist-parser.cjs')` at :35 | WIRED | `parseAllowlist` consumed at :53; ALLOW_FILES + ALLOW_GLOB_REGEXES wired to `isAllowed(rel)` at :91-95 |
| `scripts/lint-vcs-parallel-call-presence.cjs` | `scripts/audit-workflow-raw-git.cjs:48-49` | byte-identical FENCE_OPEN/FENCE_CLOSE per CF-06 | WIRED | lint:63-64 carries identical regex literals; CF-06 comment at :60-62 documents the duplication |
| `.github/workflows/parallel-e2e.yml` | `scripts/lint-vcs-parallel-call-presence.cjs` | new step at :135-137 inside `parallel-e2e` matrix job | WIRED | Step name `Lint — workflow call-presence (LINT-06)`; run line `node scripts/lint-vcs-parallel-call-presence.cjs`; positioned immediately after audit step :127-129; inherits `parallel-e2e-gate` blocking dependency at :146 |
| `sdk/src/vcs/jj/parallel.ts` clean-path else branch | `sdk/src/vcs/jj/workspace-cleanup.ts` (cleanupSubagentWorkspaces helper) | direct TS function call `cleanupSubagentWorkspaces(mainRepoRoot, handle.phaseNumber, workspacesToReap)` at :496 | WIRED | Imported at :67; called at :496 + :598 (existing cancel); `failedReaped` merged into outer array at :501 |
| `sdk/src/query/cleanup-subagent-workspaces.ts` | `sdk/src/vcs/jj/workspace-cleanup.ts` | `import { cleanupSubagentWorkspaces, WORKSPACE_NAME_RE } from '../vcs/jj/workspace-cleanup.js'` at :49-54 | WIRED | helper called at :119 (--phase) + :169 (--all-phases bucketed); shared regex at :147 |
| `scripts/dogfood-restore.sh` LAST step | `sdk/src/query/cleanup-subagent-workspaces.ts` (via gsd-sdk query CLI bridge) | `gsd-sdk query cleanup-subagent-workspaces --all-phases` invocation at :82 | WIRED | CLI verb resolves end-to-end (live spot-check passes); JSON envelope parsed by jq at :98 + :102; counts emitted in D-13 diagnostic at :106 |
| `sdk/src/vcs/jj/parallel.ts` conflicted branch | (NO call to cleanupSubagentWorkspaces — intentional cleanup-omission) | inline comment :395-402 documents the divergence | INTENTIONAL-OMISSION (W3 (a)/CF-03/AP-5/SC4 lock-in) | Grep on conflicted-branch body for `cleanupSubagentWorkspaces` returns 0 hits; INVERSE-polarity test assertion at cmd-parallel-jj.test.ts:342 (`existsSync(ws.path) === true`) catches any future regression |

All key links wired or intentionally omitted with regression-guard.

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `lint-vcs-parallel-call-presence.cjs` violations array | `violations: Array<{path, hasDispatch, hasFanIn}>` | `scanFile()` filesystem walk (`fs.readFileSync` per .md) | YES (103 real files scanned against live tree; XOR comparison drives diagnostic emission) | FLOWING |
| `cleanup-subagent-workspaces.ts` merged envelope | `merged: {abandoned: string[], failedReaped: string[]}` | per-phase `cleanupSubagentWorkspaces(cwd, p, workspacesByPhase.get(p))` calls | YES (live `gsd-sdk query --all-phases` returns real envelope; integration test seeds + reaps real on-disk dirs) | FLOWING |
| `parallel.ts` fanIn `failedReaped` array | `failedReaped: string[]` accumulator | clean-path destructure of `cleanupFailedReaped` (helper return) + existing reap loop merges | YES (integration tests observe non-zero workspace removal + dir gone via existsSync === false) | FLOWING |
| `dogfood-restore.sh` ABANDONED_COUNT / FAILED_COUNT | bash variables | `jq -r '.abandoned \| length'` against pristine stdout-only JSON captured from gsd-sdk | YES (CR-02 regression test asserts `abandoned=1` real integer on noisy-stderr fixture) | FLOWING |

No HOLLOW or STATIC sources detected.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Lint passes against live tree | `node scripts/lint-vcs-parallel-call-presence.cjs` | exit 0, "103 files scanned, 0 violations" | PASS |
| Lint fixture tests pass | `node --test tests/scripts/lint-vcs-parallel-call-presence.test.cjs` | 5/5 (160ms total) | PASS |
| CLI bridge resolves live | `gsd-sdk query cleanup-subagent-workspaces --all-phases` | `{"abandoned":[], "failedReaped":[]}` exit 0 | PASS |
| CLI bridge argv validation | `gsd-sdk query cleanup-subagent-workspaces` | `{"ok":false, "reason":"phase_or_all_phases_required"}` exit 0 | PASS |
| CLI smoke test suite | `node --test tests/cli-cleanup-subagent-workspaces.test.cjs` | 4/4 (664ms) | PASS |
| Dogfood-restore integration | `node --test tests/scripts/dogfood-restore-orphan-cleanup.test.cjs` | 2/2 (2.5s — D-16 cross-phase + CR-02 regression) | PASS |
| Cross-backend vitest | `pnpm --filter ./sdk exec vitest run src/vcs/__tests__/cmd-parallel-jj.test.ts src/vcs/__tests__/cmd-parallel-git.test.ts` | 27/27 (59s) | PASS |
| Allowlist-parser regressions | `node --test tests/scripts/allowlist-parser.test.cjs` | 16/16 (43ms — 11 prior + 5 WR-02) | PASS |
| jj-workspace-cleanup unit | `pnpm --filter ./sdk exec vitest run src/vcs/__tests__/jj-workspace-cleanup.test.ts` | 4/4 (1.27s) | PASS |
| SDK TypeScript build | `pnpm --filter ./sdk run build` | exit 0 (tsc + tsc -p tsconfig.cjs.json both clean) | PASS |
| Dogfood-restore syntax | `bash -n scripts/dogfood-restore.sh` | exit 0 | PASS |
| Cleanup AFTER tar-xf ordering (D-11) | `awk` ordering check on dogfood-restore.sh | OK | PASS |
| No raw git in dogfood-restore.sh | `grep -cE '(^\|[ \\t;&\|(])git[ \\t]+[a-zA-Z]'` | 0 | PASS |
| Three-site CJS mirror regenerated | `grep -c cleanup-subagent-workspaces get-shit-done/bin/lib/command-aliases.generated.cjs` | 1 (entry at :589) | PASS |
| IP-5 single-owner | `grep -rn 'rmSync.*phase-.*subagent' sdk/src scripts \| grep -v test \| grep -v __tests__` | ZERO non-test hits | PASS |
| No `expires` in production allowlist | `grep -c "expires" scripts/lint-vcs-parallel-call-presence.allow.json` | 0 | PASS |
| No `expires` in cleanup bridge | `grep -c "expires" sdk/src/query/cleanup-subagent-workspaces.ts` | 0 | PASS |
| CI step count in parallel-e2e.yml | `grep -c lint-vcs-parallel-call-presence .github/workflows/parallel-e2e.yml` | 3 (≥ 3 required) | PASS |
| NOT in npm pretest | `grep -c lint-vcs-parallel-call-presence package.json` | 0 | PASS |

All 18 behavioral spot-checks PASS.

---

### Probe Execution

No declared probe-* scripts in PLAN/SUMMARY beyond the test commands already exercised under "Behavioral Spot-Checks". Conventional `scripts/*/tests/probe-*.sh` discovery returns no matches for Phase 16 — this phase is invariant-tooling + cleanup-wiring, not migration/probe-driven.

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| (none declared for Phase 16) | — | — | N/A |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| LINT-06 | 16.01-PLAN.md (frontmatter) | `scripts/lint-vcs-parallel-call-presence.cjs` ships as new CI scanner — content-driven detection, per-entry `{path\|glob, reason, owner}` allowlist via `scripts/lib/allowlist-parser.cjs`, slots into `.github/workflows/parallel-e2e.yml` adjacent to existing audit step, NOT promoted to `npm pretest` | SATISFIED | Script + allowlist + 5 fixtures + test file shipped; CI step wired at parallel-e2e.yml:135-137; allowlist parser tightened to actively reject `expires` (Rule 2 deviation); 5/5 D-14 scenarios pass; live tree scans clean (103 files, 0 violations) |
| CLEANUP-02 | 16.02-PLAN.md (frontmatter) | Orphan `.claude/jj-workspaces/phase-*-subagent-*` FS dirs are reaped on `vcs.workspace.parallel.fan-in` success branch AND via `scripts/dogfood-restore.sh` post-restore cleanup; cross-backend test via `vcs-fixture.ts` Pattern B mkdtemp covers both jj-cell + git-cell paths | SATISFIED | parallel.ts:468-501 clean-path TS-direct call to helper; conflicted-branch UNCHANGED per W3(a) (parallel.ts:394-402 inline comment + INVERSE existsSync==true test guard); CR-01 follow-up extends preservation to crashed-agent workspaces; CLI bridge + 3-site registration + dogfood-restore.sh post-restore step; 27/27 cross-backend tests pass; 2/2 dogfood integration tests pass (D-16 cross-phase + CR-02 noisy-stderr regression) |

No orphaned requirements — REQUIREMENTS.md maps exactly LINT-06 + CLEANUP-02 to Phase 16; both declared in PLAN frontmatter.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none in Phase 16 modified files) | — | — | — | No TBD/FIXME/XXX/HACK debt markers; no `placeholder` / `coming soon` / `not yet implemented` prose; no empty-implementation stubs; no `console.log`-only handlers. The two `XXX` substrings hit in `dogfood-restore.sh` are filename placeholders inside path examples (`/tmp/gsd-dogfood-pre-XXXX/planning.tar` and `mktemp -t .XXXXXX`), not debt markers |

Clean. No anti-patterns to flag.

---

### Human Verification Required

1. **CI required-status-check binding on jj-colocated**

   **Test:** Inspect GitHub branch-protection ruleset for the default branch (settings → branches → ruleset) and confirm `parallel-e2e-gate` is registered as a required status check.
   **Expected:** `parallel-e2e-gate` (NOT the `parallel-e2e` matrix job itself, which is silenced on git-cell continue-on-error) is on the required-checks list for protected branches; a failed jj-colocated cell flips `parallel-e2e` aggregate to `failure`, which flips `parallel-e2e-gate` to `failure`, which blocks the PR.
   **Why human:** Branch-protection settings live in GitHub UI, outside the repo. SC2 stipulates "required-blocking on jj-colocated" — the workflow YAML carries the mechanism (gate job + always() conditional + aggregate-result check at parallel-e2e.yml:139-170), but the policy binding that turns mechanism into hard block is operator-controlled and not visible to grep.

---

### Discovered Issues (Out of Scope for Phase 16)

The verifier observed the following issues that are NOT Phase 16 regressions and do NOT block this verification, but are documented for downstream awareness:

1. **Pre-existing tech debt:**
   - `tests/bug-2924-worktree-head-attachment.test.cjs` fails because `<worktree_branch_check>` block was refactored out of `quick.md` (#2941 fix moved it elsewhere). Last touched in Phase 11/13.
   - GPG signing failures in tests doing real git commits (no secret key on this machine). Pre-existing.
   - `audit-workflow-raw-git.cjs` reports 2 regressions (execute-phase.md 11→12, plan-phase.md 0→1). Phase 14.1 PARALLEL-08 refactor likely introduced these; Phase 16 plans did not touch these workflow files.

2. **Workspace-dispatch bug discovered during Phase 16 execution (downstream consumer fix needed, NOT in scope for Phase 16):**
   - `jj workspace add -r <baseRef>` auto-creates an empty WC commit on top of `<baseRef>`, breaking the SDK `commit()` assumption that `@` == dispatched-base. Subagent commits land as DESCENDANTS of the named "subagent N" change instead of squashing into the position before it. The user manually fanned-in this wave to recover; fix needs to land `jj edit <baseRef> && jj abandon <auto-empty>` after `jj workspace add` in `sdk/src/vcs/backends/jj.ts:1055-1083` and `jj workspace update-stale` in `performJjParallelFanIn` post-fan-in. OUT OF SCOPE for Phase 16 verification — Phase 16 was about LINT-06 + CLEANUP-02 only.

---

### Gaps Summary

**Zero blocking gaps.** All 11 must-haves verified at code + behavioral level. All Phase 16 own tests pass (5+4+2+27+16+4 = 58 tests across 6 test files). The 2 BLOCKER + 5 WARNING findings from the post-execution code review were all fixed in 5 follow-up atomic commits (`rrwmmo`, `quwlop`, `wmvqlw`, `uvttxk`, `rlrsly`) and verified at the code site + via re-run of the corresponding test suites.

The one outstanding `human_needed` item is a policy binding outside the repo: required-status-check registration on GitHub branch-protection settings. The repo-level mechanism (gate job + `always()` + aggregate-result check) is in place; only the GitHub-UI policy binding requires operator verification.

---

_Verified: 2026-05-24T23:40:00Z_
_Verifier: Claude (gsd-verifier)_
