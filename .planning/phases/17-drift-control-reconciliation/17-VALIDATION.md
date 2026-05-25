---
phase: 17
slug: drift-control-reconciliation
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-25
approved: 2026-05-25
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (Node 18+ built-in) |
| **Config file** | None — `node:test` reads `tests/*.test.cjs` directly |
| **Quick run command** | `node --test tests/architecture-counts.test.cjs tests/command-count-sync.test.cjs` |
| **Full suite command** | `node --test tests/*.test.cjs` |
| **Estimated runtime** | ~5 seconds (live-scan, no I/O beyond `readdirSync` + `wc -l`) |

---

## Sampling Rate

- **After every task commit:** Run `node --test tests/<file-touched-by-task>.test.cjs` (or `tests/inventory-counts.test.cjs` if Wave 1 bumps INVENTORY counts)
- **After every plan wave:** Run `node --test tests/*.test.cjs` (full suite)
- **Before `/gsd:verify-work`:** Full suite must be green + `/gsd:docs-update --verify-only` pass rate ≥ 99%
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

Filled in by the planner. Skeleton:

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 17-01-* | 17.01 | 1 | DOCS-08 | — | Prose counts match filesystem post-fix | manual + inventory-counts | `node --test tests/inventory-counts.test.cjs` | ✅ | ⬜ pending |
| 17-02-* | 17.02 | 2 | DRIFT-01 | — | `tests/architecture-counts.test.cjs` exists and is green on first land | unit (live-scan) | `node --test tests/architecture-counts.test.cjs` | ❌ W0 | ⬜ pending |
| 17-02-* | 17.02 | 2 | DRIFT-02 | — | `tests/command-count-sync.test.cjs` exists and is green on first land | unit (live-scan) | `node --test tests/command-count-sync.test.cjs` | ❌ W0 | ⬜ pending |
| 17-03-* | 17.03 | 3 | DOCS-01..07 | — | Per-theme drift items resolved | manual + verify-only | `/gsd:docs-update --verify-only` | re-run | ⬜ pending |
| 17-03-* | 17.03 | 3 | DOCS-09 | — | `/gsd:docs-update --verify-only` pass rate ≥ 99% | close-gate | `/gsd:docs-update --verify-only` | re-run | ⬜ pending |
| 17-04-* | 17.04 | 4 | PROJECT-01 | — | PROJECT.md `### Validated` covers every REQ-ID with correct phase + status | manual-only (grep cross-check) | `grep -E '^- (\\[.\\] )?[A-Z]+-[0-9]+' .planning/PROJECT.md` cross-check vs MILESTONES.md | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/architecture-counts.test.cjs` — covers DRIFT-01 + DOCS-08 (Wave 2 ships)
- [ ] `tests/command-count-sync.test.cjs` — covers DRIFT-02 (Wave 2 ships)
- [ ] `.planning/intel/docs-update-fix-triage.md` — CF-07 prerequisite for 17.03 execute (Wave 3 planner writes BEFORE execute)
- [ ] `.planning/intel/project-validated-truth.md` — Wave 4 first commit (machine pass)

**Framework install:** None — `node:test` is built-in.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Theme 3 ADR supersession notes follow append-only format | DOCS-03 | ADR-immutability convention is a prose / format check, not value comparison | Verify each ADR has a single `## Update 2026-05-25 (Phase 17, DOCS-03)` block APPENDED below the existing body; no in-place edits to the original decision body |
| Theme 5 closure-change-id anchors resolve correctly | DOCS-05 | Anchors are prose references to `git log` change_ids — no automated assertion | `git show <change_id>` for each anchor must show the cited phase-3 closure commit |
| PROJECT.md `### Validated` reconciliation preserves hand-curated parentheticals | PROJECT-01 | Per Pitfall 8: human-edited narrative, NOT regenerate-overwrite | `diff` truth file against PROJECT.md; verify caveats like "(caveat: A3 colocated pre-commit gap remains open, see Active)" still present |
| `/gsd:docs-update --verify-only` pass rate ≥ 99% | DOCS-09 | Close-gate runs the existing verify-only workflow; no separate automated test | Run `/gsd:docs-update --verify-only`, count pass vs flagged; pass rate threshold check |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (confirmed by gsd-plan-checker 2026-05-25)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (Wave 2 produces the two test files; later waves consume)
- [x] No watch-mode flags
- [x] Feedback latency < 10s (~5s estimated for full drift-test suite)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-25 (gsd-plan-checker substantive verification confirmed all 6 conditions)
