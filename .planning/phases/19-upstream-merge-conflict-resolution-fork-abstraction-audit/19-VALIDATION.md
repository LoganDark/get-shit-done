---
phase: 19
slug: upstream-merge-conflict-resolution-fork-abstraction-audit
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-10
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from 19-RESEARCH.md `## Validation Architecture` (pass 2, upstream-adoption strategy).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` via `scripts/run-tests.cjs` (repo `tests/**/*.test.cjs`); vitest (revived, fork-owned config) for ported `src/vcs/__tests__/` |
| **Config file** | `tsconfig.build.json` (build = typecheck gate, `noEmitOnError`); fork vitest config (new, created during test-porting wave) |
| **Quick run command** | `node scripts/run-tests.cjs --suite unit`; `npx vitest run` (ported suite, once it exists) |
| **Full suite command** | `node scripts/run-tests.cjs` + ported vitest suite, both with `GSD_TEST_BACKENDS` covering git and jj cells |
| **Estimated runtime** | ~minutes (full suite both backends; quick suites well under 60s) |

---

## Sampling Rate

- **After every task commit:** `node -c` for touched `.cjs`; conflict-marker scan on touched files; `pnpm run build:lib` if `src/` touched; the single relevant lint script on resolved files
- **After every plan wave:** `--suite unit` + ported-vitest quick run + all four fork lint gates (per-file form before the re-pointing wave lands, re-pointed form after)
- **Before `/gsd-verify-work`:** Full ordered phase gate — marker sweep → MERGE-02 ledger-completeness proof → install (post-manifest) → `pnpm run build:lib` → `node -c` loop → full node:test suite → ported vitest suite both backends → `check-skip-count` → 4 re-pointed lint gates → upstream drift checks (`check:alias-drift`, `check:identity-drift`) → dispatch smoke (PORT-02)
- **Max feedback latency:** ~120 seconds (bucket-local checks; full gates only at wave/phase boundaries)

---

## Per-Task Verification Map

*Populated at plan time by gsd-planner from the requirement → test map below; one row per task.*

| Req | Behavior | Test Type | Automated Command | File Exists | Status |
|-----|----------|-----------|-------------------|-------------|--------|
| MERGE-01 | zero conflicts + zero markers | smoke | `jj st` no conflict warning; `rg -l '^(<<<<<<<\|%%%%%%%\|>>>>>>>)'` empty modulo fixture-exclusion list | ✅ | ⬜ pending |
| MERGE-02 | ledger completeness — no silently-lost fork capability | sweep + review | `comm -23 <(jj file list -r c7bd6bee sdk get-shit-done tests\|sort) <(jj file list -r @ ...\|sort)` every line ledgered; `rg -n 'gsd-sdk' --glob '!.planning/**'` only ledgered hits | ✅ | ⬜ pending |
| MERGE-03 | build green; CJS parses | build | `pnpm run build:lib` (tsc -p tsconfig.build.json incl. ported `src/vcs/`); `node -c` loop over hand-edited `.cjs` | ❌ W0 | ⬜ pending |
| MERGE-04 | tests green both backends; skip baseline | full suite | `node scripts/run-tests.cjs` + ported vitest (git + jj cells); `node scripts/check-skip-count.cjs` vs re-derived baseline | ❌ W0/test-wave | ⬜ pending |
| MERGE-05 | re-pointed lint gates green | lint | all four `scripts/lint-*`/`audit-*` after SCAN_EXT `+cts`, SCAN_ROOTS → `gsd-core`, allowlist re-point, baseline re-derive | ✅ scripts run today | ⬜ pending |
| PORT-01 | jj invariants survive the port | unit/integration | ported `src/vcs/__tests__/` green: `cmd-parallel-{jj,git}`, `jj-hooks` (.githooks firing), contract tests with `toBeIdOf` (no commit_id from jj) | ❌ test-wave | ⬜ pending |
| PORT-02 | dispatch chain end-to-end | smoke | `node gsd-core/bin/gsd-tools.cjs --help`; one invocation per verb family incl. `query` meta-prefix; launcher snippet resolves root in jj-only cwd | ❌ bridge-wave | ⬜ pending |
| AUDIT-01 | seam migration complete or justified | sweep + ledger | `rg -n "execGit\(" src -g '*.cts'` only allowlisted substrate; `rg 'execSync\|execFileSync' src -g '*.cts'` zero outliers; commit-id lint green over `.cts`; ledger row per exception | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Resolve root `package.json` (upstream shape; mirror upstream identity `@opengsd/gsd-core` @ 1.4.3; pnpm `packageManager` pin) + delete `sdk/package.json` + drop `package-lock.json` BEFORE first install
- [ ] Vet upstream devDeps on the registry; drop `fallow` optionalDep + ledger
- [ ] `pnpm install` + `pnpm run build:lib` — proves upstream src compiles in-tree before any port work
- [ ] Baseline test run `node scripts/run-tests.cjs --suite unit` — record pre-port failure set
- [ ] Build the conflict-marker fixture-exclusion list once
- [ ] Open `19-MERGE-AUDIT.md` with ledger schema (path | origin side | disposition | justification)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Operator squash of the resolution stack into `vpzlrrlv` | (constraint) | Graph mutation is operator-owned | After phase verification passes: review `jj log`, then squash the stack into the merge change |
| Installed-GSD update from this workspace | (deferred) | Out of phase scope | Post-phase: update the sibling `get-shit-done` checkout / installed copy |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (every task automated or a checkpoint)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (mapped to 19-01/19-02)
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-10
