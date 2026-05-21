---
phase: 11
slug: orchestrator-agent-rewire-workspace-assert-dispatched-cwd
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-21
---

# Phase 11 — Validation Strategy

> Per-phase validation contract. Reconstructed retroactively (State B) — Phase 11
> executed while `workflow.nyquist_validation` was disabled, so no VALIDATION.md was
> produced during the phase. This document audits the realized regression coverage
> against the `11-RESEARCH.md` Validation Architecture and records the one gap that
> was filled during the audit.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x (SDK side — `sdk/src/**/*.test.ts`) + `node:test` (CJS side — `tests/*.test.cjs`) |
| **Config file** | `sdk/vitest.config.ts` (SDK); `node:test` needs no config |
| **Quick run command** | Per-requirement scoped commands — see the Verification Map below |
| **Full suite command** | `pnpm test` (repo root) |
| **Estimated runtime** | Scoped per-file runs ~1–20s each |

> ⚠ **Do not run the whole `sdk/src/vcs/__tests__/` directory in one parallel vitest
> invocation** — ~51 jj-backed files spawning concurrent `jj`/`gpg` subprocesses OOM
> this machine (`gpg: signing failed: Cannot allocate memory`). Run individual files,
> or a small scoped set with `--no-file-parallelism`. Environmental constraint, not a
> code defect.

---

## Sampling Rate

- **After every task commit:** Run the affected requirement's scoped command (Verification Map).
- **After every plan wave:** Run the wave's scoped test set with `--no-file-parallelism`.
- **Before `/gsd:verify-work`:** All Verification Map commands green.
- **Max feedback latency:** ~20s per scoped file.

---

## Per-Requirement Verification Map

| Requirement | Plan(s) | Test Type | Test File | Automated Command | Status |
|-------------|---------|-----------|-----------|-------------------|--------|
| VCS-20 | 11-07, 11-11 | unit | `sdk/src/vcs/__tests__/cmd-workspace-assert-dispatched-cwd.test.ts` | `cd sdk && npx vitest run src/vcs/__tests__/cmd-workspace-assert-dispatched-cwd.test.ts` | ✅ green (5/5) |
| PROMPT-06 | 11-05, 11-10 | structural | `tests/quick-md-parallel-dispatch.test.cjs` (EXEC carry-over block — pins `execute-phase.md` dispatch shape) | `node --test tests/quick-md-parallel-dispatch.test.cjs` | ✅ green |
| PROMPT-07 | 11-06, 11-08 | structural | `tests/quick-md-parallel-dispatch.test.cjs` (CR-02 quick.md block) | `node --test tests/quick-md-parallel-dispatch.test.cjs` | ✅ green |
| PROMPT-08 | 11-04, 11-11 | structural | `tests/agent-prompts-no-raw-git.test.cjs` (scans `agents/gsd-executor.md`) | `node --test tests/agent-prompts-no-raw-git.test.cjs` | ✅ green |
| PROMPT-09 | 11-04 | structural | `tests/bug-3097-3099-executor-worktree-path-safety.test.cjs` | `node --test tests/bug-3097-3099-executor-worktree-path-safety.test.cjs` | ✅ green |
| PARALLEL-06 | 11-02, 11-05, 11-06, 11-08 | unit + integration | `sdk/src/vcs/__tests__/cmd-parallel-max-concurrency-cli.test.ts` + `cmd-parallel-max-concurrency-adapter.test.ts` | `cd sdk && npx vitest run --no-file-parallelism src/vcs/__tests__/cmd-parallel-max-concurrency-cli.test.ts src/vcs/__tests__/cmd-parallel-max-concurrency-adapter.test.ts` | ✅ green (5/5) — **NEW, this audit** |
| D-02 | 11-01, 11-09 | unit | `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts` | `cd sdk && npx vitest run src/vcs/__tests__/cmd-parallel-jj.test.ts` | ✅ green (7/7) |
| D-05 | 11-03, 11-09 | regression | `tests/wave-cleanup-executor.test.cjs` + `tests/bug-3384-worktree-cleanup-manifest.test.cjs` | `node --test tests/wave-cleanup-executor.test.cjs tests/bug-3384-worktree-cleanup-manifest.test.cjs` | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Supplementary coverage:** `tests/jj-parallel-no-manifest-write.test.cjs` (plan 11-09 — `WAVE_WORKTREE_MANIFEST` retirement, 3/3 green) is not mapped to a numbered requirement but reinforces the D-01 manifest-elimination invariant.

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. Phase 11 had no Wave 0 (it executed with `nyquist_validation` disabled). The single MISSING gap found during this retroactive audit — PARALLEL-06 — was filled in-audit (2 new test files, see Verification Map). Nothing remains pending.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

> PARALLEL-06 was initially a candidate for Manual-Only (decision D-07 dropped the
> `workflow.max_concurrency` workflow knob). The audit found D-07 explicitly **keeps
> the SDK surface**: `dispatch({ plan, maxConcurrency })` is accepted on both backend
> adapters and the `--max-concurrency` CLI flag is plumbed in
> `sdk/src/query/workspace-parallel-dispatch.ts`. The field is advisory (backends MAY
> ignore it; both currently do — `sdk/src/vcs/types.ts:458-468`), so the enforceable
> contract is "the flag parses, coerces, and threads into `ParallelDispatchOpts`
> without dispatch regression." That contract is now automated, so PARALLEL-06 is
> COVERED, not Manual-Only.

---

## Validation Audit 2026-05-21

| Metric | Count |
|--------|-------|
| Requirements audited | 8 |
| COVERED (pre-existing green tests) | 7 |
| MISSING gaps found | 1 (PARALLEL-06) |
| Gaps filled this audit | 1 |
| Escalated implementation bugs | 0 |

Reconstructed via `/gsd-validate-phase 11` (State B). `gsd-nyquist-auditor` green-verified
the 7 pre-existing tests and filled PARALLEL-06 with two new test files. No implementation
files were modified.

---

## Validation Sign-Off

- [x] All requirements have an `<automated>` verify command
- [x] Sampling continuity: every requirement maps to a green automated test
- [x] Wave 0 covers all MISSING references (PARALLEL-06 gap filled in-audit)
- [x] No watch-mode flags (all commands use `vitest run` / `node --test`)
- [x] Feedback latency < 20s per scoped file
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-05-21
