---
phase: 18
slug: tactical-cleanup-test-flake-re-scoped
status: verified
threats_open: 0
asvs_level: 1
created: 2026-06-10
---

# Phase 18 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| workflow → VCS history | the transition orchestrator declares terminal state ("Phase {X} marked complete") based on assumed-committed planning mutations | .planning/ mutation state (ROADMAP/STATE/PROJECT/config.json) |
| CLI argv/JSON → dispatch handler | untrusted `--plan` JSON and `--max-concurrency` argv cross into the router before any adapter exists | operator-supplied JSON plan + numeric flag |
| operator shell → recovery script | `dogfood-restore.sh` performs `jj op restore` + `tar -xf -C .` relative to whatever cwd it is run from | tarball contents extracted into cwd; jj op log rewind |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-18-01 | Tampering/DoS | workspace.parallel.dispatch handler (non-array plan passes through unchecked) | mitigate | `!Array.isArray(plan)` guard returns `{ok:false, reason:'plan_not_array'}` before `createVcsAdapter` (src/vcs-command-router.cts:1216-1218, adapter at :1221); 4 contract tests pin envelope + `recordedDispatchOpts.length === 0` | closed |
| T-18-02 | DoS | `--max-concurrency` parsing (NaN cap silently accepted into scheduling) | mitigate | positive-integer guard (NaN, fractional, zero, negative, Infinity all rejected — strengthened beyond plan's NaN-only per 18-REVIEW WR-03) returns `max_concurrency_invalid` (src/vcs-command-router.cts:1160-1167); `!== undefined` leg preserves D-07 absent-flag contract; contract tests pin it | closed |
| T-18-03 | Tampering | `tar -xf -C .` into wrong cwd (path-relative extraction outside project root) | mitigate | `[ -f .planning/STATE.md ]` assertion (scripts/dogfood-restore.sh:56) fires before the tarball check (:74), `jj op restore` (:79), and `tar -xf` (:92); label aligned to FATAL per 18-REVIEW fix b133aa4a; wrong-cwd run fixture-verified exit 1 | closed |
| T-18-04 | Repudiation | transition.md terminal banners (false-clean-WC, Phase 14 recurrence site) | mitigate | 5 `gsd_run query commit` fences after every mutating step + unconditional `<step name="assert_clean_wc">` before `offer_next_phase` with `FATAL: working copy is dirty before transition completion.` + exit 1; both polarities fixture-verified in ephemeral colocated jj repo (18-01 SUMMARY transcripts) | closed |
| T-18-05 | Tampering | transition.md gate fence (audit baseline) | mitigate | bare `gsd_run` only — `git rev-parse --show-toplevel` count stays at exactly 1 (no second launcher embed); `audit-workflow-raw-git.cjs` frozen baseline green (230 hits / 0 regressions, transition.md = 1) | closed |
| T-18-06 | Tampering | additive tar overlay surviving post-snapshot files | accept | CLEANUP-04 option (b): `jj op restore` is the actual rollback of tracked state; asymmetry documented in comment block adjacent to `tar -xf` (scripts/dogfood-restore.sh:83-91); see Accepted Risks Log AR-18-01 | closed |
| T-18-07 | DoS (test-infra) | masking a real hang by inflating a test timeout | accept | bounded acceptance never exercised: TEST-17 verdict (b) resolved-by-restructure — zero edits, no timeout inflated, no retry config (18-03 SUMMARY 5-run evidence); see Accepted Risks Log AR-18-02 | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-18-01 | T-18-06 | Additive tar overlay may leave post-snapshot files surviving a restore. A destructive `rm -rf .planning` clean overlay in a recovery primitive is higher risk than the accepted residue; `jj op restore` already rewinds tracked state; Phase 14 P05 production-validated restore-then-untar. Documented as intended in dogfood-restore.sh. | plan 18-02 (RESEARCH recommendation, locked at plan time) | 2026-06-10 |
| AR-18-02 | T-18-07 | A timeout-inflation fix could have masked a real hang. Bounded by Pitfall 9 envelope (30s+ firing recorded as real-hang finding, retry config forbidden). Risk never materialized — verdict (b), zero edits; inclusion-filter ran 419–473ms across 5 recorded runs. | plan 18-03 (locked at plan time) | 2026-06-10 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-10 | 7 | 7 | 0 | /gsd-secure-phase orchestrator (short-circuit: plan-time register, all mitigations verified in implementation) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-10
