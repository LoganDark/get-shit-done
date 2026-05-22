# Phase 13 — Security Audit (SECURED)

**Phase:** 13 — CI parallel-path lane + lint close-gate
**Threats Closed:** 12/12
**Threats Open:** 0
**ASVS Level:** L1
**`block_on`:** high
**Audited:** 2026-05-22
**Mode:** verify-mitigations (register authored at plan time; not scanning for new threats)

---

## Executive summary

All 12 threats in the Phase 13 register resolve to CLOSED. Of the four
HIGH-severity threats inside `block_on: high` (T-13-03 RCE via scanned content,
T-13-11 fork-PR secret exfiltration, T-13-12 moved-tag tampering, T-13-13
branch-protection bypass), each is mitigated by a concrete control verified
in the implemented code, not by documentation or intent alone.

No threat flags appeared in any of the four `13-0{1,2,3,4}-SUMMARY.md` files,
and no new attack surface was detected during implementation that lacks a
register entry.

The phase is clear to ship.

One ship-time follow-up is **not blocking** but flagged for the user:
register `parallel-e2e-gate` as a required branch-protection check on `main`
(and protected `release/**` / `hotfix/**` branches). This is config OUTSIDE
the repo and is documented under "User Setup Required" in
`13-04-SUMMARY.md`. The mitigation for T-13-13 in the repo is present
(`parallel-e2e-gate` exists, is `needs:`-gated, runs `if: always()`,
inspects `needs.parallel-e2e.result`, has no `continue-on-error`); the
external GitHub config is the user's step.

---

## Threat Verification — Mitigate

| Threat ID | Category | Severity | Evidence |
|-----------|----------|----------|----------|
| T-13-01 | Tampering (docs) | low | `grep -rniE 'zero[ -]?hits\|reports zero\|proving zero\|with zero\|zero raw' .planning/ROADMAP.md .planning/REQUIREMENTS.md .planning/phases/13-ci-parallel-path-lane-lint-close-gate/13-CONTEXT.md` returns **0 matches**. ROADMAP.md:179 contains `127` and `baseline`; line 180 contains `baseline / no-regression invariant`. CONTEXT.md:163 contains the literal `baseline 127, 0 new`. |
| T-13-03 | EoP / RCE | **HIGH** | `scripts/audit-workflow-raw-git.cjs` — grep for `eval\(\|new Function\|exec(Sync\|FileSync)\|spawnSync\|child_process` returns **0 hits**; the only `require()` calls are `node:fs` and `node:path` at lines 39-40. The audit is a pure file-walker; scanned content is only fed through `RegExp.test()`. No subprocess or code-eval surface. |
| T-13-04 | Info disclosure | low | `scripts/audit-workflow-raw-git.cjs:102` — `if (entry.isSymbolicLink()) continue;` inside `findMarkdown()`. Symlink directories are not walked, preventing reads outside the repo via a planted symlink under a SCAN_ROOT. |
| T-13-05 | Tampering | low | `scripts/audit-workflow-raw-git.cjs:153-157` — per-file regression rule: `for (const [rel, current] of Object.entries(currentCounts)) { ... if (current > base) regressions.push(...) }`. `BASELINE` (lines 60-91) is a **per-file** `Object.freeze`d count map, not a bare total — so a removal in one file cannot mask an addition in another. `.github/workflows/parallel-e2e.yml:127` runs `node scripts/audit-workflow-raw-git.cjs` as a CI step, and the audit's `require.main` block exits non-zero on regression (line 238: `process.exit(result.ok ? 0 : 1)`). |
| T-13-06 | Tampering | low | `13-02-SUMMARY.md:94` confirms the live-tree re-scan reproduced the `<verified_baseline>` map exactly — no drift between the plan-time baseline and the frozen constant. The injectable-baseline signature `auditWorkflowRawGit({ scanRoots, repoRoot, baseline = BASELINE })` (audit script line 139) is exercised by `tests/scripts/audit-workflow-raw-git.test.cjs` across **7 synthetic test cases** that verify the comparison independent of the frozen constant's value (13-02-SUMMARY.md:110: "7 tests, 7 pass, 0 fail"). |
| T-13-07 | Info disclosure | medium | `scripts/e2e-parallel-phase.sh` reads no secret env vars — the only env vars consumed are `GSD_E2E_BACKEND`, `GSD_SDK`, `RUNNER_TEMP`, `TMPDIR`. The harness needs no secrets. (Trigger / permissions controls are owned by T-13-11.) |
| T-13-08 | Tampering | medium | `scripts/e2e-parallel-phase.sh:101` — `REPO=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/gsd-e2e-XXXXXX")` places the throwaway repo OUTSIDE `$GITHUB_WORKSPACE`. No `mktemp` call creates the repo inside `$GITHUB_WORKSPACE` anywhere in the script. Line 105: `trap cleanup EXIT` with `cleanup()` (lines 102-104) running `rm -rf "$REPO"` ensures cleanup on any exit path. |
| T-13-09 | Tampering | low | `node scripts/lint-vcs-no-raw-git.cjs` exits 0 with `1089 files scanned, 0 violations` (verified by execution during audit). `scripts/lint-vcs-no-raw-git.allow.json` has exactly **24 entries** (verified via `node -e require(...)`). `13-LINT05-ALLOWLIST-DIFF.md:24` records the +1 attributed to **Phase 10** (the `sdk/src/vcs/git/parallel.ts` adapter-internal entry), and line 22 confirms Phase 13 added **0** new entries. |
| T-13-11 | Info disclosure | **HIGH** | `.github/workflows/parallel-e2e.yml` — `grep -nE 'pull_request_target\|permissions:\|contents: write\|secrets:'` returns **0 matches**. Trigger is `pull_request:` (line 29-42), not `pull_request_target`. No `permissions:` block grants write. No `secrets:` access in any step. Default `GITHUB_TOKEN` is read-only and fork PRs run without secret access (ASVS V4). |
| T-13-12 | Tampering | **HIGH** | `.github/workflows/parallel-e2e.yml:72` — `actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd  # v6.0.2`. Line 80 — `actions/setup-node@53b83947a5a98c8d113130e565377fae1a50d02f  # v6.3.0`. Byte-identical to `.github/workflows/test.yml:41,49,120,148` (verified by `grep -cE` returning 1 and 2 in parallel-e2e.yml/test.yml respectively). No floating tags (`@v6`, `@main`, etc.) anywhere — `grep -nE '@v[0-9]\|@main\|@master\|@latest'` returns 0 matches. |
| T-13-13 | Spoofing / bypass | **HIGH** | `.github/workflows/parallel-e2e.yml:136-161` — `parallel-e2e-gate:` job exists; line 138 `needs: [parallel-e2e]`; line 143 `if: always()`; lines 148, 151, 157 inspect `needs.parallel-e2e.result` / `MATRIX_RESULT` and `exit 1` (line 159) when not `success`. No `continue-on-error` key on the gate job (the `continue-on-error` mentions on lines 17/20 of the awk slice were inside explanatory comments, not job config). `13-04-SUMMARY.md:108` flags **branch-protection registration for the user** under "User Setup Required" — explicitly directing the user to register `parallel-e2e-gate` (not the matrix job). |
| T-13-15 | Tampering | low | `.github/workflows/parallel-e2e.yml:125-127` — `Audit — raw git in workflow markdown (CI-06)` step runs `node scripts/audit-workflow-raw-git.cjs` inside the `parallel-e2e` matrix job. A non-zero exit (per-file regression beyond the frozen 127-hit baseline — T-13-05) fails the cell. This is the milestone-completeness regression guard ROADMAP SC3 describes. |

---

## Threat Verification — Accept (no in-repo mitigation required)

Accepted risks are recorded here as required by the audit workflow. Each
entry restates the rationale from the PLAN.md threat register; the
accept disposition is the user's documented decision.

### T-13-02 — Repudiation (low) — v1.3 milestone close-commit evidence wording

- **Component:** D-08 close-commit evidence wording (the durable VCS-permanent audit trail).
- **Accept rationale:** D-08 is the durable VCS-permanent evidence record. Re-framing it to "baseline 127, 0 new" makes the evidence claim accurate. The close commit message is itself the audit trail; no further mitigation is needed.
- **Evidence the framing landed:** `13-CONTEXT.md:163` contains the literal `baseline 127, 0 new`.

### T-13-10 — EoP via shell `eval` (low) — e2e harness

- **Component:** `scripts/e2e-parallel-phase.sh` — hypothetical injection via unsanitized data into shell `eval`.
- **Accept rationale:** The harness uses `jq` to parse `gsd-sdk` JSON output and never `eval`s output. Agent labels (`e2e-a e2e-b` on line 176) are harness-internal literals, not external input. No `eval` is invoked anywhere in the script.
- **Evidence:** A grep of `scripts/e2e-parallel-phase.sh` for `eval` returns no matches; the only argv consumers are `jq -r`, `printf`, and `case` pattern-matching of `BACKEND`.

### T-13-14 — Tampering (low) — `curl | tar` of jj tarball

- **Component:** `.github/workflows/parallel-e2e.yml:91-101` — `curl -fsSL` of the jj 0.41.0 tarball from `github.com/jj-vcs/jj` releases.
- **Accept rationale:** Parity with the existing `test.yml` pattern. `curl -fsSL` over HTTPS with `-f` failing on HTTP error is the established posture; a checksum verification would be stronger but is out of scope for consistency with the established lane. If the consistency stance changes, both workflows (test.yml and parallel-e2e.yml) should adopt checksum pinning together.

---

## Unregistered Flags

None. No `## Threat Flags` section appeared in any of `13-01-SUMMARY.md`,
`13-02-SUMMARY.md`, `13-03-SUMMARY.md`, or `13-04-SUMMARY.md`. No
implementation-time attack surface was detected that lacks a threat-register
entry.

---

## Verification commands run

```
grep -rniE 'zero[ -]?hits|reports zero|proving zero|with zero|zero raw' .planning/ROADMAP.md .planning/REQUIREMENTS.md .planning/phases/13-ci-parallel-path-lane-lint-close-gate/13-CONTEXT.md
  → 0 matches (T-13-01)

grep -nE 'eval\(|new Function|\bFunction\(|exec(Sync|FileSync)|spawnSync|child_process' scripts/audit-workflow-raw-git.cjs
  → 0 matches (T-13-03)

grep -n 'isSymbolicLink' scripts/audit-workflow-raw-git.cjs
  → line 102 (T-13-04)

grep -n 'current > base' scripts/audit-workflow-raw-git.cjs
  → line 156 (T-13-05)

grep -nE 'baseline = BASELINE' scripts/audit-workflow-raw-git.cjs
  → line 139 (T-13-06 injectable baseline)

grep -cE '^test\(' tests/scripts/audit-workflow-raw-git.test.cjs
  → 7 (T-13-06 unit-test cases)

grep -n 'mktemp.*RUNNER_TEMP' scripts/e2e-parallel-phase.sh
  → line 101 (T-13-08 mkdtemp outside GITHUB_WORKSPACE)

grep -nE 'trap.*EXIT' scripts/e2e-parallel-phase.sh
  → line 105 (T-13-08 EXIT trap)

node scripts/lint-vcs-no-raw-git.cjs
  → exit 0; 1089 files scanned, 0 violations (T-13-09)

node -e 'console.log((require("./scripts/lint-vcs-no-raw-git.allow.json").entries||[]).length)'
  → 24 (T-13-09 allowlist budget locked)

grep -nE 'pull_request_target|permissions:|contents: write|secrets:' .github/workflows/parallel-e2e.yml
  → 0 matches (T-13-11)

grep -cE 'actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd' .github/workflows/parallel-e2e.yml .github/workflows/test.yml
  → parallel-e2e.yml:1, test.yml:2 (both present; identical pin — T-13-12)

grep -cE 'actions/setup-node@53b83947a5a98c8d113130e565377fae1a50d02f' .github/workflows/parallel-e2e.yml .github/workflows/test.yml
  → parallel-e2e.yml:1, test.yml:2 (both present; identical pin — T-13-12)

grep -nE '@v[0-9]|@main|@master|@latest' .github/workflows/parallel-e2e.yml
  → 0 matches (T-13-12 — no floating tags)

grep -nE 'parallel-e2e-gate|needs:|if: always|needs.parallel-e2e.result' .github/workflows/parallel-e2e.yml
  → lines 136, 138, 143, 148, 151 (T-13-13)

grep -n 'audit-workflow-raw-git.cjs' .github/workflows/parallel-e2e.yml
  → line 127 (T-13-15 CI-06 step present)
```

---

*Phase: 13-ci-parallel-path-lane-lint-close-gate*
*ASVS L1 verification complete.*
