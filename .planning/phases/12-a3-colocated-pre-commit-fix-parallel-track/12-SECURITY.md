---
phase: 12
slug: a3-colocated-pre-commit-fix-parallel-track
status: verified
threats_open: 0
asvs_level: 1
created: 2026-05-21
---

# Phase 12 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

Built from artifacts (State B) — all three Phase 12 PLAN.md files carried `<threat_model>`
blocks authored at plan time. With `threats_open: 0` and a plan-time register, the
`gsd-security-auditor` spawn was short-circuited per `secure-phase.md` §3; the two
`mitigate`-disposition threats were verified directly against the implementation.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| test process → `.githooks/pre-commit` shell script (Plan 12-02) | The HOOK-07 regression test writes a counter hook script into an ephemeral `mkdtemp` fixture; `vcs.commit` → `fireHook` shells that script via `vcsExec`. | Test-authored constant counter script body — no externally-controlled input. |
| none (Plans 12-01, 12-03) | Documentation-only — `.planning/` markdown edits (12-01) and a new audit artifact built by reading repo hook scripts (12-03). | None — no code path, no untrusted input, no process boundary crossed. |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-12-01 | Tampering | `.planning/ROADMAP.md` / `.planning/REQUIREMENTS.md` doc edits (Plan 12-01) | accept | Documentation-only string replacements gated by per-task `grep` verify checks; no executable surface — see Accepted Risks AR-12-01. | closed |
| T-12-02 | Elevation of Privilege | `fireHook` shelling a `.githooks/pre-commit` script during the HOOK-07 test (Plan 12-02) | accept | Hook script written by the test into a per-run randomized `mkdtemp` dir; fixed counter body with no interpolated external input; `fireHook` enforces a 60s timeout; confined to test scope — see Accepted Risks AR-12-02. | closed |
| T-12-03 | Tampering | Shared `dir` fixture reused across sibling `it()` blocks (Plan 12-02) | mitigate | Verified in `sdk/src/vcs/__tests__/jj-hooks.test.ts:259-306`: the HOOK-07 block uses unique `co-hook07.txt` / `co-hook07-b.txt` staged-file stems + a dedicated `.hook07-fire-count` marker path + `safeUnlink` reset before each commit, so it cannot collide with sibling tests' `.colocated-*` markers or `co-*` files. | closed |
| T-12-04 | Repudiation | Hook idempotency claim recorded without evidence (Plan 12-03) | mitigate | Verified in `12-HOOK-IDEMPOTENCY-AUDIT.md`: per-operation `.githooks/<stage>` line-range citations (5) + a copy-pasteable re-runnable `bash` verification block + the D-05 empty-finding dated baseline make every idempotency verdict reproducible rather than asserted. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-12-01 | T-12-01 | Plan 12-01 is documentation-only — verbatim string replacements in two `.planning/` markdown files. No executable surface, no untrusted input; per-task `grep` verify gates catch an incorrect edit. No security-relevant content. | Phase 12 plan threat model (T-12-01 disposition, authored at plan time) | 2026-05-21 |
| AR-12-02 | T-12-02 | The `.githooks/pre-commit` script `fireHook` shells during the HOOK-07 test is authored by the test itself (a fixed counter body) and written into a per-run randomized `mkdtemp` fixture; no untrusted or externally-controlled data reaches the shell; `fireHook` already bounds hook execution with a 60s timeout. Confined entirely to test scope. | Phase 12 plan threat model (T-12-02 disposition, authored at plan time) | 2026-05-21 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-05-21 | 4 | 4 | 0 | /gsd:secure-phase — plan-time register, short-circuit (threats_open: 0; T-12-03/T-12-04 mitigations verified against implementation) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-05-21
