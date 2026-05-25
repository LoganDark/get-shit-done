---
phase: 15
slug: adapter-surface-extensions-rename
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-24
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from
> `15-RESEARCH.md` § Validation Architecture; do not re-litigate test choices here.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (SDK)** | vitest 1.x — existing pin in `sdk/vitest.config.ts` |
| **Framework (scripts)** | `node:test` — for `scripts/audit-root-commits-rename.cjs` tests under `tests/scripts/` |
| **Config file** | `sdk/vitest.config.ts` (existing); `tests/` runs via root `node --test` (no extra config) |
| **Quick run command (SDK)** | `pnpm --filter sdk test -- --run --no-coverage -t "<test-name-filter>"` |
| **Quick run command (scripts)** | `node --test tests/scripts/audit-root-commits-rename.test.cjs` |
| **Full suite command** | `pnpm --filter sdk test -- --run --no-coverage && node --test tests/scripts/` |
| **Estimated runtime** | SDK ≈ 25 s; scripts ≈ 5 s; full ≈ 30 s |

---

## Sampling Rate

- **After every task commit:** Run the quick command for the file just touched (per-test name filter)
- **After every plan wave (per CF-01: sequential 4-plan ordering means each plan is its own wave):** Run the SDK full suite
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds (well under the 60s Nyquist budget)

---

## Per-Task Verification Map

Mapping is plan-level (4 plans, sequential — one plan = one wave per CF-01). Task IDs use the form `15.PP-TT` where `PP` is plan number and `TT` is task number within plan (planner sets exact task numbering during plan-phase Step 8).

| Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 15.01 | 1 | NAMING-01 | — | Pre-rename audit produces grouped-by-extension JSON with totalCount + specialCases + idempotencyHash | unit (`node:test`) | `node --test tests/scripts/audit-root-commits-rename.test.cjs` | ❌ W0 | ⬜ pending |
| 15.01 | 1 | NAMING-01 | — | Per-extension `grep -c '\brootCommits\b'` exits 0 after rename across `*.ts` `*.cjs` `*.js` (excl. carveouts) | structural-grep | `for ext in ts cjs js; do count=$(grep -rn '\brootCommits\b' --include="*.$ext" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.jj --exclude-dir=dist-cjs --exclude-dir=.archive-pre-v1.4 --exclude-dir=v1.2-research \| wc -l); [[ $count -eq 0 ]] \|\| exit 1; done` | ❌ W0 (inline gate in plan 15.01 task) | ⬜ pending |
| 15.01 | 1 | NAMING-01 | — | `BACKENDS_AVAILABLE_FOR_VERB['refs.rootRevisions']` exists and contains `['git', 'jj-colocated']` (capability matrix string-literal flip per Pitfall 3) | unit (vitest) | `pnpm --filter sdk test -- --run -t "BACKENDS_AVAILABLE_FOR_VERB.refs.rootRevisions"` | ❌ W0 (regression test in `backends.test.ts`) | ⬜ pending |
| 15.01 | 1 | NAMING-01 | — | `BACKENDS_AVAILABLE_FOR_VERB['refs.rootCommits']` does NOT exist (anti-assertion) | unit (vitest) | same command, anti-assertion | ❌ W0 | ⬜ pending |
| 15.01 | 1 | NAMING-01 | — | `dist-cjs/` rebuilt post-rename (verify `dist-cjs/vcs/types.d.ts` references `rootRevisions`, not `rootCommits`) | structural-grep | `pnpm --filter sdk build && grep -c 'rootRevisions' sdk/dist-cjs/vcs/types.d.ts` (exit 0 & count > 0) | ❌ W0 (gated in plan 15.01) | ⬜ pending |
| 15.02 | 2 | VCS-21 | — | `vcs.refs.idAlphabet === '0-9a-f'` on git adapter | adapter-contract (vitest) | `pnpm --filter sdk test -- --run -t "vcs.refs.idAlphabet"` | ❌ W0 (new in `adapter-contract.test.ts`) | ⬜ pending |
| 15.02 | 2 | VCS-21 | — | `vcs.refs.idAlphabet === 'k-z'` on jj adapter | adapter-contract (vitest) | same command | ❌ W0 | ⬜ pending |
| 15.02 | 2 | VCS-21 | — | `BACKENDS_AVAILABLE_FOR_VERB['refs.idAlphabet']` exists and contains `['git', 'jj-colocated']` (per A4) | unit (vitest) | `pnpm --filter sdk test -- --run -t "BACKENDS_AVAILABLE_FOR_VERB.refs.idAlphabet"` | ❌ W0 | ⬜ pending |
| 15.03 | 3 | VCS-22 | — | `matchPrefix` 5-rule × 2-backend cross-product (10 cases) — hex match, hex no-match, k-z match, k-z no-match, throws on wrong-alphabet, throws on empty prefix, false on prefix > id len, hex case-insensitive, k-z lower-only | adapter-contract (vitest) | `pnpm --filter sdk test -- --run -t "vcs.refs.matchPrefix"` | ❌ W0 (new in `adapter-contract.test.ts`) | ⬜ pending |
| 15.03 | 3 | VCS-22 | — | `BACKENDS_AVAILABLE_FOR_VERB['refs.matchPrefix']` exists | unit (vitest) | `pnpm --filter sdk test -- --run -t "BACKENDS_AVAILABLE_FOR_VERB.refs.matchPrefix"` | ❌ W0 | ⬜ pending |
| 15.04 W1 | 4 | PARALLEL-07 helper | — | `cleanupSubagentWorkspaces` idempotent — second call returns empty arrays | unit (vitest) | `pnpm --filter sdk test -- --run -t "cleanupSubagentWorkspaces idempotent"` | ❌ W0 (new `workspace-cleanup.test.ts`) | ⬜ pending |
| 15.04 W1 | 4 | PARALLEL-07 helper | — | Helper does NOT import from `backends/jj.ts` (UPSTREAM-02 discipline per D-07) | structural-grep | `grep -E "from\s+['\"]\\.\\./backends/jj['\"]" sdk/src/vcs/jj/workspace-cleanup.ts \|\| true` (must return 0 lines) | ❌ W0 (inline gate) | ⬜ pending |
| 15.04 W2 | 4 | PARALLEL-07 | — | cancel-clean-abandon on jj — N=2 dispatched workspaces, cancel returns all in `abandoned`, empty `failedReaped` | per-backend-runtime (vitest) | `pnpm --filter sdk test -- --run -t "workspace.parallel.cancel — N=2 clean"` | ❌ W0 (new `cmd-parallel-cancel-jj.test.ts`) | ⬜ pending |
| 15.04 W2 | 4 | PARALLEL-07 | — | cancel-idempotent-recall on jj — second cancel on same handle returns empty arrays | per-backend-runtime (vitest) | same suite | ❌ W0 | ⬜ pending |
| 15.04 W2 | 4 | PARALLEL-07 | — | cancel-partial-state-recovery on jj — pre-deleted workspace dir before cancel; `failedReaped` empty, `surplusWorkspaces` reflects original count | per-backend-runtime (vitest) | same suite | ❌ W0 | ⬜ pending |
| 15.04 W2 | 4 | PARALLEL-07 | — | Same three scenarios on git backend | per-backend-runtime (vitest) | `pnpm --filter sdk test -- --run -t "workspace.parallel.cancel.*git"` | ❌ W0 (new `cmd-parallel-cancel-git.test.ts`) | ⬜ pending |
| 15.04 W2 | 4 | PARALLEL-07 | — | CancelResult is frozen pure-JSON (no methods, closures, or Symbols — Phase 9 D-05 invariant) | unit (vitest) | `Object.isFrozen(result) === true && JSON.parse(JSON.stringify(result))` round-trip in test | ❌ W0 | ⬜ pending |
| 15.04 W2 | 4 | PARALLEL-07 | — | returns structured `{ok: false, reason: 'handle_required'}` envelope (NOT unknown-verb error) — proves three-site bridge resolves the verb | smoke | `node bin/gsd-sdk.js query workspace.parallel.cancel` | `tests/cli-workspace-parallel-cancel.test.cjs` | ⬜ pending |
| 15.04 W2 | 4 | PARALLEL-07 | — | returns unknown-verb error envelope — proves the dispatcher knows the canonical verb name and rejects sibling typos | smoke | `node bin/gsd-sdk.js query workspace.parallel.cancellation-xyz` | `tests/cli-workspace-parallel-cancel.test.cjs` | ⬜ pending |
| 15.04 W2 | 4 | PARALLEL-07 | — | `BACKENDS_AVAILABLE_FOR_VERB['workspace.parallel.cancel']` exists and contains `['git', 'jj-colocated']` | unit (vitest) | `pnpm --filter sdk test -- --run -t "BACKENDS_AVAILABLE_FOR_VERB.workspace.parallel.cancel"` | ❌ W0 | ⬜ pending |
| 15.04 W2 | 4 | PARALLEL-07 | — | CLI bridge registered at ALL THREE sites — catalog-domain, manifest.non-family, aliases.generated (CF-07) | structural-grep | `grep -c 'workspace-parallel-cancel\|workspace\.parallel\.cancel' sdk/src/query/command-static-catalog-domain.ts sdk/src/query/command-manifest.non-family.ts sdk/src/query/command-aliases.generated.ts` each ≥ 1 | ❌ W0 (gated in plan 15.04) | ⬜ pending |

*Status legend: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

All test files for Phase 15 are new — none exist on disk pre-execution. Wave 0 is "create the test stubs + verify they fail until plan execution drives them green."

- [ ] `tests/scripts/audit-root-commits-rename.test.cjs` — `node:test` cases for `scripts/audit-root-commits-rename.cjs` audit emitter (totalCount, specialCases, idempotencyHash invariants)
- [ ] `sdk/src/vcs/__tests__/adapter-contract.test.ts` — extend with `vcs.refs.idAlphabet` (2 cases) + `vcs.refs.matchPrefix` (10-case cross-product) sections
- [ ] `sdk/src/vcs/__tests__/backends.test.ts` — extend with `BACKENDS_AVAILABLE_FOR_VERB` entries for `refs.rootRevisions`, `refs.idAlphabet`, `refs.matchPrefix`, `workspace.parallel.cancel` (4 new entries; 1 anti-assertion for the dropped `refs.rootCommits`)
- [ ] `sdk/src/vcs/jj/__tests__/workspace-cleanup.test.ts` — new test file for `cleanupSubagentWorkspaces` idempotency + UPSTREAM-02 import-discipline gate
- [ ] `sdk/src/vcs/__tests__/cmd-parallel-cancel-jj.test.ts` — new file; 3 scenarios per per-backend-runtime pattern from `cmd-parallel-jj.test.ts` (Pattern A/B/W2 reuse)
- [ ] `sdk/src/vcs/__tests__/cmd-parallel-cancel-git.test.ts` — new file; same 3 scenarios on git backend
- [ ] No framework install needed — vitest + `node:test` already present in repo

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pre-rename audit JSON is correct shape (`generatedAt`, `totalCount`, `byExtension`, `specialCases`, `idempotencyHash`) AND survives round-trip JSON.parse | NAMING-01 | The audit emitter's stdout is the artifact — checking shape via grep is too brittle | After plan 15.01 emits audit: `node scripts/audit-root-commits-rename.cjs > /tmp/audit.json && node -e "const a = JSON.parse(require('fs').readFileSync('/tmp/audit.json', 'utf8')); for (const k of ['generatedAt','totalCount','byExtension','specialCases','idempotencyHash']) if (!(k in a)) throw new Error('missing '+k); console.log('OK')"` |
| Open Question 1 resolved — `.planning/research/*.md` active v1.4 files renamed or marked historical-prose | NAMING-01 (planner judgment) | Requires planner decision recorded in plan 15.01 `<truths>` or `<must_haves>` | Plan 15.01 emits a `decision_log.md` line stating the choice; verifier checks the line exists |
| Open Question 2 resolved — `cleanupSubagentWorkspaces` first param named `mainRepoRoot` (recommended) or `phaseRoot` (per D-05) with documented rationale | PARALLEL-07 helper | Naming choice; both work mechanically | Verifier reads the signature in `sdk/src/vcs/jj/workspace-cleanup.ts` and the JSDoc `@param` line explaining the choice |
| Open Question 3 resolved — plan 15.01 commits audit JSON adjacent to (not bundled with) rename | NAMING-01 | jj/git log shape, not test-checkable directly | `jj log -r 'description("audit") \| description("rename")' --no-graph -T 'description.first_line() ++ "\n"'` shows audit commit immediately preceding rename commit |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (4 plans × 3–5 tasks each = ~16–20 tasks; sampling check enforced by plan-checker in §10)
- [ ] Wave 0 covers all MISSING references (5 new test files + 2 extensions)
- [ ] No watch-mode flags (`--run` flag mandatory on every vitest invocation)
- [ ] Feedback latency < 30 s (estimated full-suite runtime)
- [ ] `nyquist_compliant: true` set in frontmatter (post-execution verification, by `/gsd:verify-work`)

**Approval:** pending (validation strategy ready; verifier blesses post-execution per Nyquist Dimension 8 contract)
