---
phase: 16
slug: workflow-invariant-tooling
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-24
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Dual: `node:test` (tests/) + vitest (sdk/) |
| **Config file** | `tests/` runs via `node --test`; `sdk/` runs via `pnpm --filter ./sdk test` (vitest config in `sdk/vitest.config.ts`) |
| **Quick run command** | `node --test tests/scripts/lint-vcs-parallel-call-presence.test.cjs` (LINT-06) / `pnpm --filter ./sdk test -- src/vcs/jj/parallel.test.ts` (CLEANUP-02 sdk) |
| **Full suite command** | `pnpm test` (root) → runs both `node --test tests/**/*.test.cjs` and sdk vitest in sequence |
| **Estimated runtime** | LINT-06 fixture tests: ~2-5s; CLEANUP-02 parallel.test.ts: ~30-60s (Pattern B mkdtemp + jj-cell fixture); full suite: ~3-5 min |

---

## Sampling Rate

- **After every task commit:** Run the test command for that task's plan (per-task `<automated>` block)
- **After every plan wave:** Run plan-scoped test suite (LINT-06 → `node --test tests/scripts/`; CLEANUP-02 → `pnpm --filter ./sdk test -- parallel.test.ts` + `node --test tests/cli-*-cleanup-subagent-workspaces*.test.cjs`)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds for per-task; 5 min for full suite

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 1 | LINT-06 | — | N/A (CI lint, no runtime surface) | unit | `node --test tests/scripts/lint-vcs-parallel-call-presence.test.cjs` | ❌ W0 | ⬜ pending |
| 16-01-02 | 01 | 1 | LINT-06 | — | N/A | unit (fixture) | `node --test tests/scripts/lint-vcs-parallel-call-presence.test.cjs` | ❌ W0 | ⬜ pending |
| 16-01-03 | 01 | 1 | LINT-06 | — | N/A | integration | `node scripts/lint-vcs-parallel-call-presence.cjs` (exits 0/1 against repo) | ✅ (after Task 16-01-01) | ⬜ pending |
| 16-01-04 | 01 | 1 | LINT-06 | — | N/A | CI smoke | `gh workflow run parallel-e2e.yml` (manual) OR inspection of `.github/workflows/parallel-e2e.yml` for new step | ✅ | ⬜ pending |
| 16-02-01 | 02 | 1 | CLEANUP-02 | — | Workspaces on disk are removed after clean-path fan-in success — prevents stale credential/state leakage in `.claude/jj-workspaces/` | unit (sdk vitest) | `pnpm --filter ./sdk test -- src/vcs/jj/parallel.test.ts -t "clean path reaps workspace dirs"` | ✅ | ⬜ pending |
| 16-02-02 | 02 | 1 | CLEANUP-02 | — | Conflicted-branch workspaces preserved on disk for forensics (W3 (a) joint-assertion) — must NOT be reaped | unit (sdk vitest) | `pnpm --filter ./sdk test -- src/vcs/jj/parallel.test.ts -t "conflicted path preserves workspace dirs"` | ✅ | ⬜ pending |
| 16-02-03 | 02 | 1 | CLEANUP-02 | — | N/A (CLI bridge surface) | unit | `node --test tests/cli-cleanup-subagent-workspaces.test.cjs` | ❌ W0 | ⬜ pending |
| 16-02-04 | 02 | 1 | CLEANUP-02 | — | Recovery script removes orphan dirs after `jj op restore` (idempotent) | integration | `node --test tests/scripts/dogfood-restore-orphan-cleanup.test.cjs` | ❌ W0 | ⬜ pending |
| 16-02-05 | 02 | 1 | CLEANUP-02 | — | Cross-backend symmetry (git-cell fanIn-success-no-orphan-dirs invariant) | unit (vitest) | `pnpm --filter ./sdk test -- src/vcs/jj/parallel.test.ts -t "cross-backend"` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*IDs above are illustrative; final task IDs are assigned by the planner. Verification map updates after PLAN.md files exist.*

---

## Wave 0 Requirements

- [ ] `tests/scripts/lint-vcs-parallel-call-presence.test.cjs` — fixture-based unit test for LINT-06 (Pattern B mkdtemp + per-fixture-file allowlist; covers Pitfall 7 false-positive cases: `code-review.md`, `audit-fix.md` prose-only mentions)
- [ ] `tests/scripts/fixtures/lint-vcs-parallel-call-presence/` — fixture directory (paired/missing-dispatch/missing-fanin/prose-only fixtures)
- [ ] `tests/cli-cleanup-subagent-workspaces.test.cjs` — CLI bridge smoke test (mirrors `tests/cli-workspace-parallel-cancel.test.cjs` shape per Open Q4)
- [ ] `tests/scripts/dogfood-restore-orphan-cleanup.test.cjs` — end-to-end test for the dogfood-restore.sh post-restore step (synthetic `jj op restore` + orphan-survival fixture per Success Criterion 5)
- [ ] No framework install needed — both `node:test` and vitest are already in use across the repo

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CI lint step appears in `parallel-e2e.yml` and runs adjacent to CI-06 audit step | LINT-06 (Success Criterion 2) | YAML structure assertion; automatable via `grep` but human eyeball confirms placement intent | Inspect `.github/workflows/parallel-e2e.yml` — confirm new step exists, is named consistently with audit step, is required-blocking, and is NOT promoted to `npm pretest` (CI-only per D-07 precedent) |
| Anti-Pattern 5 inline comment exists at `performJjParallelFanIn` conflicted branch | CLEANUP-02 (Success Criterion 4) | Documentation correctness — automatable via `grep` but reviewer must verify the comment correctly explains the intentional cleanup-omission | Inspect `sdk/src/vcs/jj/parallel.ts` near `performJjParallelFanIn` conflicted-branch path — confirm inline comment documents "conflicted branch preserves workspaces for forensics per W3 (a) joint-assertion contract" |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s for per-task; < 5min for full suite
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
