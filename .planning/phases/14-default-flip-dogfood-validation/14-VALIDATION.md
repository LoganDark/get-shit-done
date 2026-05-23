---
phase: 14
slug: default-flip-dogfood-validation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-23
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `14-RESEARCH.md` § Validation Architecture (lines 712-754).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.1.1 (per `sdk/package.json`) + node:test (per `tests/feat-3167-ship-pr-body-sections.test.cjs`) |
| **Config file** | `sdk/vitest.config.ts` (existing) |
| **Quick run command** | `cd sdk && pnpm vitest run src/vcs/__tests__/cmd-parallel-jj.test.ts src/vcs/__tests__/cmd-parallel-git.test.ts` |
| **Full suite command** | `cd sdk && pnpm test:unit` |
| **Template-test command** | `node --test tests/feat-3167-ship-pr-body-sections.test.cjs` |
| **Estimated runtime** | quick: ~10s; full unit: ~60s; rehearsal+dogfood: ~3-5 min (manual smoke) |

---

## Sampling Rate

- **After every task commit:** Run `cd sdk && pnpm vitest run src/vcs/__tests__/cmd-parallel-{jj,git}.test.ts` (D-03 mitigation fixtures green)
- **After every plan wave:** Run `cd sdk && pnpm test:unit` + `node --test tests/feat-3167-ship-pr-body-sections.test.cjs` (CONFIG-01 doesn't regress the only test that parses the template)
- **Before `/gsd:verify-work`:** Full suite green + rehearsal step green + jj-cell dogfood green + git-cell dogfood green + `.planning/intel/v1.3-dogfood-metrics.md` committed with all required fields
- **Max feedback latency:** ~10 seconds (quick run); ~60 seconds (full unit suite)

---

## Per-Task Verification Map

> Populated by gsd-planner during plan generation. Stub structure below; gsd-plan-checker
> (Step 10) verifies every task has `<automated>` or Wave 0 reference.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 14-XX-XX | XX   | X    | CONFIG-01   | T-14-V5    | Template flatten preserves `ship.pr_body_sections` | unit | `node --test tests/feat-3167-ship-pr-body-sections.test.cjs` | ✅ | ⬜ pending |
| 14-XX-XX | XX   | X    | CONFIG-02   | T-14-V5    | Envelope fires on explicit `parallelization: false` | unit (D-03 fixture) | `cd sdk && pnpm vitest run src/vcs/__tests__/cmd-parallel-jj.test.ts -t "parallelization_disabled"` | ❌ W0 | ⬜ pending |
| 14-XX-XX | XX   | X    | CONFIG-02   | T-14-V5    | Envelope NOT fired when key missing (defaults to true) | unit (D-03 fixture) | (same file, second `it` block) | ❌ W0 | ⬜ pending |
| 14-XX-XX | XX   | X    | CONFIG-02   | T-14-V5    | Envelope NOT fired when explicit `parallelization: true` | unit (D-03 fixture) | (same file, third `it` block) | ❌ W0 | ⬜ pending |
| 14-XX-XX | XX   | X    | DOGFOOD-01  | T-14-V12   | jj cell: synthetic plans dispatch on `gsd/phase-14-dogfood`, clean fan-in, bookmark abandoned | integration / smoke | `bash scripts/dogfood-phase-14.sh` (assertion-rich exit-0/1) | ❌ W0 | ⬜ pending |
| 14-XX-XX | XX   | X    | DOGFOOD-01  | T-14-V12   | git cell: synthetic plans dispatch on mktemp repo | integration / smoke | `GSD_E2E_BACKEND=git bash scripts/e2e-parallel-phase.sh` | ✅ (Phase 13) | ⬜ pending |
| 14-XX-XX | XX   | X    | DOGFOOD-02  | T-14-V12   | Pre-snapshot captured into sibling mktemp; tarball SHA-256 + pre-op-id recorded | integration / smoke | `bash scripts/dogfood-phase-14.sh` | ❌ W0 | ⬜ pending |
| 14-XX-XX | XX   | X    | DOGFOOD-02  | T-14-V12   | Rehearsal restore works against synthetic-dirty clone | integration / smoke | `bash scripts/dogfood-phase-14.sh --rehearse-only` (or sibling script) | ❌ W0 | ⬜ pending |
| 14-XX-XX | XX   | X    | DOGFOOD-02  | T-14-V6    | Metrics committed to `.planning/intel/v1.3-dogfood-metrics.md` | manual (durable artifact) | `git show HEAD -- .planning/intel/v1.3-dogfood-metrics.md` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts` — add `describe('CONFIG-02 — parallelization_disabled')` block with the D-03 mitigation fixture (three `it()` cases: explicit-false fires, missing-key passes, explicit-true passes)
- [ ] `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts` — add the parallel block
- [ ] `scripts/dogfood-phase-14.sh` — Wave 4 dogfood orchestrator (D-01 jj-cell wrapper). Cannot run until D-04 template flatten + D-03 this-repo flip + D-06 envelope ship
- [ ] `scripts/dogfood-restore.sh` — Wave 2 recovery primitive (D-10). Must ship BEFORE the rehearsal step (Wave 3)
- [ ] `.planning/intel/v1.3-dogfood-metrics.md` — Wave 4 output; committed AFTER the dogfood completes (per D-12)

*Framework install: NONE — vitest is already installed in `sdk/`.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real dogfood blast-radius is bounded | DOGFOOD-01 | The Pitfall 10 invariant (`gsd/phase-14-dogfood` bookmark stays isolated; main untouched) is only meaningful against THIS repo's real `.planning/` size + history. A vitest test cannot exercise it without becoming a Phase-4-style colocated-repo simulation that defeats the dogfood intent | `bash scripts/dogfood-phase-14.sh`; on green, manually inspect `jj log -r main --no-graph` to confirm main is unchanged from pre-dogfood state |
| Recovery procedure actually restores | DOGFOOD-02 | The rehearsal step (D-11) automates the happy path, but the operator must read the prose in CONTEXT.md post-execute to understand the manual recovery flow if the runnable script fails | Inspect committed `.planning/intel/v1.3-dogfood-metrics.md` for literal mktemp path + tarball SHA-256 + pre-op-id; verify these match the actual snapshot dir during the run |
| Metrics establish v1.4+ regression baseline | DOGFOOD-02 | The `dispatch_ms` / `fan_in_ms` / `conflict_count` values are baseline measurements, not pass/fail — v1.4 phases will compare against them | Inspect committed `.planning/intel/v1.3-dogfood-metrics.md` for non-empty timing fields per backend cell |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s for unit suite
- [ ] `nyquist_compliant: true` set in frontmatter (after planner ships and Wave 0 closes)

**Approval:** pending
