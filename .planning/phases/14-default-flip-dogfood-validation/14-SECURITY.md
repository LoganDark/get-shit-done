---
phase: 14-default-flip-dogfood-validation
audited: 2026-05-23
auditor: Claude Opus 4.7 (gsd-security-auditor)
asvs_level: 1
block_on: high
status: SECURED
threats_total: 16
threats_closed: 16
threats_open: 0
unregistered_flags: 0
register_authored_at_plan_time: true
---

# Phase 14 Security Audit — Default flip + dogfood validation

**Verdict:** SECURED. All 16 declared mitigations verified present in code; no open threats; no unregistered attack surface introduced during implementation.

## Scope

Verify-mitigations audit against threat models authored at plan time in each
of the five PLAN.md `<threat_model>` blocks (14-01 through 14-05). Disposition
verification per `mitigate` / `accept` table; no retroactive STRIDE scan.

ASVS L1, `block_on: high`. The phase's broader ASVS posture from
14-RESEARCH.md § Security Domain (lines 756-782) is reflected in the
per-plan threat registers.

## Threat Verification Table

| Threat ID | Plan | Category | Disposition | Status | Evidence |
|-----------|------|----------|-------------|--------|----------|
| T-14-V5-cfg (14-01) | 14-01 | V5 Input Validation | mitigate | CLOSED | `get-shit-done/templates/config.json:31` and `.planning/config.json:4` both contain valid JSON literal `"parallelization": true,`; `feat-3167` test 6/6 green; 14-01-SUMMARY §Accomplishments. |
| T-14-V12-cfg (14-01) | 14-01 | V12 Files and Resources | accept | CLOSED | Static checked-in files; no temp-file race surface. 14-01 PLAN `<threat_model>` accepts; documented disposition. |
| T-14-Repud (14-01) | 14-01 | Repudiation (config-flip surprise) | accept | CLOSED | Intent of v1.3 per ROADMAP SC1; refusal path is CONFIG-02 envelope (14-02). Documented acceptance. |
| T-14-V5-cfg (14-02) | 14-02 | V5 Input Validation | mitigate | CLOSED | `sdk/src/query/workspace-parallel-dispatch.ts:75` uses `config.parallelization === false` (strict equality); no `!config.parallelization` loose-falsey trap present (grep confirms 0 occurrences); brownfield safety net intact. |
| T-14-V7-err (14-02) | 14-02 | V7 Error Handling | mitigate | CLOSED | `sdk/src/query/workspace-parallel-dispatch.ts:80-83` `message` field contains literal `parallelization: true` substring and guides user to two unblock paths; no filesystem paths or secrets leaked beyond the `parallelization` key name. |
| T-14-V12-tmp (14-02) | 14-02 | V12 Files and Resources | mitigate | CLOSED | Both `cmd-parallel-{jj,git}.test.ts` CONFIG-02 describe blocks use `mkdtemp(join(tmpdir(), '\`gsd-cfg02-{jj,git}-${Math.random().toString(36).slice(2,10)}-\`'))` per TEST-16 Pattern B (random-suffix). |
| T-14-T-injection (14-03) | 14-03 | Tampering (shell injection via argv) | mitigate | CLOSED | `scripts/dogfood-restore.sh:50,56,59` double-quote `"$TARBALL_PATH"` and `"$PRE_OP_ID"`; no `eval`; no unquoted `$@` (grep clean). |
| T-14-T-tarball-traversal (14-03) | 14-03 | Tampering (path traversal via tarball) | accept | CLOSED | Tarball is content-controlled by `dogfood-phase-14.sh`'s own `tar -cf` step (line 143). Out-of-scope attacker model (shell access). 14-03 PLAN `<threat_model>` documents acceptance. |
| T-14-T-op-restore (14-03) | 14-03 | Tampering (op-restore to attacker-controlled op-id) | accept | CLOSED | Pre-op-id originates from durable Recovery Anchor; operator-trusted argv. Out-of-scope attacker model. Documented acceptance. |
| T-14-V12-tarball (14-03) | 14-03 | V12 Files and Resources | mitigate | CLOSED | `scripts/dogfood-restore.sh:59` extracts via `tar -xf "$TARBALL_PATH" -C .` into the project-root cwd; precondition documented at lines 25-26 ("must be run from project root"); script does NOT `cd`. |
| T-14-Repud-unrelated-work (14-03) | 14-03 | Repudiation (op-restore reverts post-dogfood work) | mitigate (documented) | CLOSED | Operator-responsibility text present verbatim in `scripts/dogfood-phase-14.sh:487`, `.planning/intel/v1.3-dogfood-metrics.md:50`, and `.planning/phases/14-default-flip-dogfood-validation/14-CONTEXT.md:585`: "Operators must save unrelated post-dogfood work before invoking recovery". Triple-surface disclosure. |
| T-14-T-cpsource (14-04) | 14-04 | Tampering (cp -a source modification) | accept | CLOSED | Single-user repo; no concurrent CI during cp-a window. 14-04 PLAN `<threat_model>` documents acceptance. |
| T-14-V12-rehearsal (14-04) | 14-04 | V12 Files and Resources | mitigate | CLOSED | `scripts/dogfood-rehearse.sh:47-48` use `mktemp -d "${TMPDIR:-/tmp}/gsd-dogfood-rehearsal-XXXX"` and `…/gsd-rehearsal-pre-XXXX`; `trap cleanup EXIT` at line 55 reaps both dirs on any exit path. |
| T-14-T-injection (14-04) | 14-04 | Tampering (shell injection) | mitigate | CLOSED | Rehearsal script uses controlled sources for all variables (`jj op log`, `mktemp`); quoted expansion throughout (lines 79, 89-93, 105, 131, 148-152). |
| T-14-Disclosure-cp (14-04) | 14-04 | Information Disclosure (cp-a history leak) | mitigate | CLOSED | `trap cleanup EXIT` at line 55 reaps `$REHEARSAL` regardless of exit status; no durable artifact. |
| T-14-T-bookmark (14-05) | 14-05 | Tampering (bookmark name injection) | mitigate | CLOSED | `scripts/dogfood-phase-14.sh:184` hardcodes literal `gsd/phase-14-dogfood`; agent labels built from validated integer `$N` (line 168-171), not user input. |
| T-14-T-shell-injection (14-05) | 14-05 | Tampering (env-var shell injection) | mitigate | CLOSED | `scripts/dogfood-phase-14.sh:94-106` validates `N` via `case '' \| *[!0-9]*)` plus `[ "$N" -lt 2 ]`; `GSD_SDK` used as quoted invocation token; no `eval` (grep clean across all 3 new scripts). |
| T-14-Disclosure-pre-snapshot (14-05) | 14-05 | Information Disclosure (auto-snapshot leak) | mitigate | CLOSED | `scripts/dogfood-phase-14.sh:136` uses `mktemp -d "${TMPDIR:-/tmp}/gsd-dogfood-pre-XXXX"` — sibling to repo, NEVER inside the WC; only the literal path is recorded as a string reference in metrics file. |
| T-14-V6-crypto (14-05) | 14-05 | V6 Cryptography | mitigate | CLOSED | `scripts/dogfood-phase-14.sh:145-149` portable detection via `command -v sha256sum` falling back to `shasum -a 256`; used for content-addressed recovery anchoring (NOT signing) — documented use. |
| T-14-V12-tarball (14-05) | 14-05 | V12 Files and Resources | mitigate | CLOSED | `mktemp -d` random-suffix at line 136; tarball name fixed inside randomized directory (line 143). No predictable filename. |
| T-14-Repud-pitfall-10 (14-05) | 14-05 | Repudiation (dogfood pollutes main) | mitigate | CLOSED | `scripts/dogfood-phase-14.sh:184` hardcodes `--main-bookmark gsd/phase-14-dogfood`; lines 157 (MAIN_BEFORE) + 421-422 (MAIN_AFTER + assert_eq) enforce main-untouched invariant; metrics file Pitfall 10 evidence table (lines 65-71) records `umkprsyvnxwq…` ≡ `umkprsyvnxwq…`. |
| T-14-Repud-unrelated-work (14-05) | 14-05 | Repudiation (recovery reverts unrelated work) | mitigate (documented) | CLOSED | Same triple-surface disclosure as 14-03 entry above. |

**Total:** 22 threats verified (some IDs reused across plans where the same threat applies to multiple surfaces). All CLOSED.

## CR-01 Inline Fix Verification

The code-review BLOCKER CR-01 — `jq -r '.ok // "true"'` returning `"true"` on
`{ok:false}` because `false` is a JSON value, not null/missing — was fixed
inline before the audit. Verified at all four sites:

```
scripts/dogfood-phase-14.sh:205  HANDLE_OK_JJ=$(printf '%s' "$HANDLE_JSON_JJ" | jq -r 'if .ok == false then "false" else "true" end')
scripts/dogfood-phase-14.sh:259  FAN_OK_JJ=$(printf '%s' "$FAN_RESULT_JJ" | jq -r 'if .ok == false then "false" else "true" end')
scripts/dogfood-phase-14.sh:351  HANDLE_OK_GIT=$(printf '%s' "$HANDLE_JSON_GIT" | jq -r 'if .ok == false then "false" else "true" end')
scripts/dogfood-phase-14.sh:403  FAN_OK_GIT=$(printf '%s' "$FAN_RESULT_GIT" | jq -r 'if .ok == false then "false" else "true" end')
```

Regression check: `grep -n '.ok //' scripts/dogfood-phase-14.sh` returns
zero matches. The legacy null-coalescing pattern is fully retired.

This is not a security vulnerability per the V5 (Input Validation) taxonomy
in 14-RESEARCH.md § Security Domain — it's a correctness fix to the failure-
detection path of the dogfood orchestrator. Validating its presence here
because the audit register lists it as the BLOCKER for `block_on: high`.

## Unregistered Flags

None.

14-04-SUMMARY.md and 14-05-SUMMARY.md `## Threat Flags` sections both
report "None"; 14-01/14-02/14-03 SUMMARY files omit the section entirely
(consistent with low-impact mechanical edits — no new attack surface
introduced beyond what the per-plan threat models account for).

## Accepted Risks Log

Three `accept` dispositions are documented and re-affirmed here as accepted
risks for v1.3 close:

1. **T-14-V12-cfg (14-01)** — `get-shit-done/templates/config.json` and
   `.planning/config.json` are static checked-in JSON files. No temp-file
   race surface. Atomic-write via the Write tool is sufficient.

2. **T-14-Repud (14-01)** — Greenfield projects post-flip get
   parallelization on by default; this is the INTENT of v1.3. The
   CONFIG-02 envelope (14-02) gives operators a clear refusal path.
   PROJECT.md / REQUIREMENTS.md document the new default.

3. **T-14-T-tarball-traversal (14-03)** — Tarball is content-controlled by
   `dogfood-phase-14.sh`'s own `tar -cf` (line 143), not external input.
   Attacker with substitution capability already has shell access (out of
   threat scope).

4. **T-14-T-op-restore (14-03)** — Pre-op-id is captured by
   `dogfood-phase-14.sh` and persisted into the durable metrics file;
   operator-trusted argv. Out of threat scope.

5. **T-14-T-cpsource (14-04)** — `cp -a` source modification during the
   1-2 second copy window is operator-controlled behavior in this
   single-user repo. No concurrent CI.

## Verifier Notes

- 14-VERIFICATION.md (lines 27-33) lists CR-01 as `fixed_inline` and
  references WR-01..WR-05 as advisory warnings carried forward to v1.4
  (precondition gap in dogfood-restore.sh, tar-overlay incompleteness,
  plan-array shape check, `--max-concurrency` NaN, CONFIG-02 test tmpDir
  leak). None of these advisory items map to declared threats in any of
  the five PLAN.md `<threat_model>` blocks — they are correctness /
  hardening items, not security defects against the V5 / V6 / V7 / V12
  ASVS L1 surface declared for Phase 14.
- The triple-surface disclosure of the "save unrelated work" caveat
  (dogfood-phase-14.sh metrics heredoc, the committed
  v1.3-dogfood-metrics.md file, and 14-CONTEXT.md post-execute prose) is
  the documented mitigation for T-14-Repud-unrelated-work — the recovery
  primitive itself does NOT detect or guard, which is the planned
  operator-responsibility split.

## Final Tally

| Metric | Value |
|--------|-------|
| Threats declared | 22 (across 5 plans) |
| Closed (mitigate verified) | 17 |
| Closed (accept documented) | 5 |
| Open | 0 |
| Unregistered flags | 0 |
| CR-01 fixed inline | yes (4/4 sites) |
| Phase ships | YES |

---

*Audited: 2026-05-23*
*Auditor: Claude Opus 4.7 (gsd-security-auditor)*
*ASVS L1; block_on: high; verify-mitigations mode*
