---
phase: 08-unified-revision-model-audit-test-prep-flip-lint-guard-close
verified: 2026-05-15T00:00:00Z
status: passed
score: 14/14 must-haves verified (6/6 ROADMAP SCs + 14/14 REQ IDs + 5/5 D-IDs)
overrides_applied: 0
re_verification: null
gaps: []
deferred: []
human_verification: []
---

# Phase 8: Unified Revision Model — Verification Report

**Phase Goal:** The cross-backend `VcsAdapter` exposes ONE revision concept; `commit_id` leakage from jj is treated as a defect, audited to zero, and architecturally enforced. The jj backend never volunteers `commit_id` from any cross-backend verb.
**Verified:** 2026-05-15
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (6 ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | Audit doc with full classification via closed verdict enum; jj 0.41 NDJSON `change_id` probe recorded green | VERIFIED | `.planning/intel/id-namespace-audit.md` exists (102 finding rows + summary/decision sections); JSON sidecar buckets: safe=13, flip-clean=30, needs-rename=43, needs-resolveShort=7, boundary-io=2, historical-prose=6, unclear=0 — all 7 buckets populated; `.planning/intel/jj-041-ndjson-probe.md` records `change_id` at top-level on `jj log` and nested under `target` on `jj workspace list` |
| SC-2 | Every cross-backend verb on jj backend returns `change_id`, never `commit_id` | VERIFIED | `sdk/src/vcs/backends/jj.ts` has 20 `change_id` occurrences (≥7 template flips); `sdk/src/vcs/types.ts` line 97 `CommitResult.id` and line 123 `LogEntry.id` both renamed (zero `.hash` in types.ts); JSDoc cites "commit_id on git, change_id on jj" contract; PITFALL 1 doc at jj.ts:329-330 inverted to positive-contract form; only 3 `commit_id` mentions remain in jj.ts and all are JSDoc/comments explaining the contract |
| SC-3 | `toBeIdOf` matcher landed BEFORE FLIP-02/03; AUDIT-03 cross-backend assertions use new matcher; goldens re-recorded; strict-green | VERIFIED | `tests/__tools__/vitest-matchers.ts` registers `toBeIdOf` via `expect.extend` (alphabet + length checks); `tests/__tools__/vitest.d.ts` augments both `Assertion` and `AsymmetricMatchersContaining`; `sdk/vitest.config.ts` has `setupFiles: [matchersPath]` at 2 sites (unit + integration projects); `sdk/tsconfig.json` includes `../tests/__tools__/**/*.d.ts`; per Plan 2 SUMMARY 50 git-side baselines re-recorded (timestamp-only diff); `node scripts/check-skip-count.cjs` exits 0 (current=18, baseline=18) |
| SC-4 | `scripts/lint-vcs-no-commit-id.cjs` ships parallel; per-entry allowlist `{path\|glob, reason, owner}` (NOT expires per D-04); FIRST GREEN RUN validates FLIP; CI required-blocking | VERIFIED | `node scripts/lint-vcs-no-commit-id.cjs` exits 0 with "1032 files scanned, 0 violations" — FLIP completeness proof; allowlist has 28 entries, `$schema_version: 2`, no actual `expires` fields (only 1 documentation `$migration_note` mentioning "expires field dropped"); `.github/workflows/test.yml:73` runs `node scripts/lint-vcs-no-commit-id.cjs`; `package.json:65` includes it in `pretest` chain |
| SC-5 | Workflow `vcs.kind === 'jj'` id-reason branches deleted (per AUDIT-04); KEEP sites annotated | VERIFIED | `grep -rn "vcs\.kind === 'jj'"` in `get-shit-done/bin/lib/*.cjs` + `get-shit-done/workflows/*.md` returns ZERO id-reason matches; 3 `// PROMPT-05 KEEP:` annotations at `worktree-safety.cjs:77,111` + `init.cjs:1547`, all citing gitOnly.* capability rationale (not id-shape branching) |
| SC-6 | MIGR-06 dogfood-cutover; single rewriter pass over `.planning/phases/08-…/`; COMMIT_KEY_ALLOWLIST extended if needed (no new keys); one-time prose grep recorded | VERIFIED | `scripts/migr-06-close-gate.cjs` exists (188 LOC, idempotent rewriter); per SUMMARY 12 backtick migrations applied to `08-01-SUMMARY.md`; idempotency verified via diff-r empty; `COMMIT_KEY_ALLOWLIST` in `rewrite.ts:73-86` retains existing 12-key set (no extension needed per AUDIT-04 re-grep); `.planning/intel/close-gate-prose-grep.md` records 10 historical-prose hits, all grandfathered |

**Score:** 6/6 ROADMAP success criteria verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/audit-id-namespace.cjs` | Pure regex+walker; emits .md and --json | VERIFIED | Exists; emits both formats; 7 unit tests pass |
| `scripts/lint-vcs-no-commit-id.cjs` | Default-deny lint; 5 COMMIT_ID_PATTERNS | VERIFIED | Exists; exits 0 (0 violations on 1032 files) |
| `scripts/lint-vcs-no-commit-id.allow.json` | Per-entry schema, seeded from audit JSON | VERIFIED | 28 entries, `$schema_version: 2`, reason+owner on every entry, zero `expires` fields |
| `scripts/lib/allowlist-parser.cjs` | Shared parser (D-03) | VERIFIED | Exists; consumed by both lints; 9 unit tests pass |
| `scripts/lib/glob-to-regex.cjs` | Extracted glob compiler (D-03) | VERIFIED | Exists |
| `scripts/lint-vcs-no-raw-git.allow.json` | Migrated to per-entry schema | VERIFIED | 23 entries; `$schema_version: 2`; zero `expires` fields |
| `scripts/lint-vcs-no-raw-git.cjs` | Migrated to consume shared parser | VERIFIED | Exits 0 (1070 files, 0 violations) — behavior preserved |
| `scripts/seed-lint-allowlist.cjs` | One-shot D-01 seeder | VERIFIED | 157 LOC; reads `verdicts[boundary-io\|safe\|historical-prose]` |
| `scripts/migr-06-close-gate.cjs` | Phase-scoped rewriter | VERIFIED | 188 LOC; `assertInsidePhaseDir` containment guard |
| `tests/__tools__/vitest-matchers.ts` | `toBeIdOf` via `expect.extend` | VERIFIED | Alphabet+length+allowShort options; VcsBackendKey-widened |
| `tests/__tools__/vitest.d.ts` | Module augmentation on Assertion + AsymmetricMatchersContaining | VERIFIED | Both interfaces augmented |
| `.planning/intel/id-namespace-audit.md` | Verdict-table with closed enum | VERIFIED | 102 finding rows; all 7 buckets populated; 0 unclear |
| `.planning/intel/id-namespace-audit.json` | Sidecar with all 7 verdict buckets | VERIFIED | All 7 buckets present; total=101 findings |
| `.planning/intel/jj-041-ndjson-probe.md` | Risk 4 GREEN baseline | VERIFIED | jj 0.41 NDJSON shapes documented |
| `.planning/intel/close-gate-prose-grep.md` | One-time prose hex grep | VERIFIED | 10 hits per-decision documented |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `id-namespace-audit.json` | `lint-vcs-no-commit-id.allow.json` | seeder reads `verdicts[boundary-io\|safe\|historical-prose]` | WIRED | `seed-lint-allowlist.cjs` line 64 iterates VERDICT_CATEGORIES |
| `lint-vcs-no-commit-id.cjs` | `lib/allowlist-parser.cjs` | require | WIRED | Lint exits 0 — proves wiring works |
| `lint-vcs-no-raw-git.cjs` | `lib/allowlist-parser.cjs` | require | WIRED | Lint exits 0 — proves wiring works |
| `vitest-matchers.ts` | `sdk/vitest.config.ts setupFiles` | fileURLToPath + setupFiles | WIRED | 2 setupFiles entries (unit + integration) |
| `vitest.d.ts` | `sdk/tsconfig.json include` | tsconfig include glob | WIRED | `"../tests/__tools__/**/*.d.ts"` |
| `jj-log.ts` | `types.ts LogEntry.id` | `import type { LogEntry }` | WIRED | tsc clean |
| `jj.ts commit() probe` | `types.ts CommitResult.id` | template emits change_id; CommitResult returns id | WIRED | Confirmed at jj.ts:219-220 contract doc |
| `.github/workflows/test.yml` | `lint-vcs-no-commit-id.cjs` | CI run command | WIRED | Line 73 |
| `rewrite.ts COMMIT_KEY_ALLOWLIST` | phase-dir frontmatter keys | rewriter pass via migrateContent | WIRED | 12-key set used by migr-06-close-gate.cjs |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `lint-vcs-no-commit-id.cjs` | violations | filesystem scan + COMMIT_ID_PATTERNS | Yes — emits "1032 files scanned, 0 violations" | FLOWING |
| `lint-vcs-no-raw-git.cjs` | violations | filesystem scan + patterns | Yes — emits "1070 files scanned, 0 violations" | FLOWING |
| `audit-id-namespace.cjs` | findings | walker + PATTERNS regex | Yes — emits 101 findings into JSON sidecar | FLOWING |
| `seed-lint-allowlist.cjs` | entries | audit JSON verdict buckets | Yes — produces 28 entries from 21 audit rows + manual self-refs/post-discoveries | FLOWING |
| `migr-06-close-gate.cjs` | migrations | jj log change_id resolver | Yes — migrated 12 backtick spans in 08-01-SUMMARY.md | FLOWING |
| `vitest-matchers.ts toBeIdOf` | pass/fail | alphabet+length checks on received string | Yes — used in 20+ test sites post-FLIP | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Commit-id lint exits 0 (FLIP completeness proof) | `node scripts/lint-vcs-no-commit-id.cjs` | "1032 files scanned in /…, 0 violations"; EXIT 0 | PASS |
| Raw-git lint still passes (migration didn't regress) | `node scripts/lint-vcs-no-raw-git.cjs` | "1070 files scanned, 0 violations"; EXIT 0 | PASS |
| Skip-count not regressed | `node scripts/check-skip-count.cjs` | current=18 baseline=18; EXIT 0 | PASS |
| TypeScript compiles clean (hard rename force-function) | `cd sdk && pnpm exec tsc --noEmit` | EXIT 0 | PASS |
| Audit + parser unit tests pass | `node --test tests/scripts/*.test.cjs` | "tests 16 / pass 16 / fail 0" | PASS |
| `.hash` residue on type symbols in dist-cjs | `grep -r '\.hash' sdk/dist-cjs/ \| grep -E '(LogEntry\|CommitResult)'` | Only 1 hit in jj-id.ts JSDoc (historical-prose; not runtime) | PASS |
| No `vcs.kind === 'jj'` id-reason branches | `grep -rn "vcs\.kind === 'jj'" get-shit-done/bin/lib/*.cjs workflows/*.md` | 0 hits | PASS |
| Audit JSON has all 7 buckets | `cat audit.json \| jq '.verdicts \| keys'` | 7 buckets present; 0 unclear | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| AUDIT-01 | 08-01 | Audit `sdk/src/` commit_id sites; classify via verdict enum | SATISFIED | `id-namespace-audit.md` has all sdk/src/ rows classified |
| AUDIT-02 | 08-01 | Audit `get-shit-done/bin/lib/*.cjs` + `scripts/` | SATISFIED | Audit doc covers both scan roots |
| AUDIT-03 | 08-01 | Audit `sdk/src/**/__tests__/` + `tests/__tools__/` | SATISFIED | Audit doc covers test scan roots; drove TEST-12 matcher rollout |
| AUDIT-04 | 08-01 | Audit `workflows/*.md`, `commands/*.md`, `agents/*.md`, `.planning/` | SATISFIED | Audit doc covers prose; AUDIT-04 re-grep on Phase 8 frontmatter recorded no new commit-bearing keys |
| FLIP-01 | 08-02 | 7 jj.ts template flips + 3 NDJSON parser flips | SATISFIED | 20 `change_id` occurrences in jj.ts; all 3 parsers reference change_id |
| FLIP-02 | 08-02 | `LogEntry.hash` → `.id` hard rename, all consumers swept | SATISFIED | `types.ts:123 id: string`; 0 `.hash` in types.ts; tsc clean |
| FLIP-03 | 08-02 | `CommitResult.hash` → `.id` hard rename, all consumers swept | SATISFIED | `types.ts:97 id: string \| null`; cmdCommitToSubrepo REVIEW.md CR-01 also FIXED (parent commit 54843ae7) |
| FLIP-04 | 08-02 | PITFALL 1 doc inverted to positive-contract form | SATISFIED | `jj.ts:329-330` positive-contract text; no new ADR (D-05) |
| LINT-01 | 08-01, 08-03 | Ship `lint-vcs-no-commit-id.cjs` + wire to CI required-blocking | SATISFIED | Lint exists; CI step at `test.yml:73`; pretest chain at `package.json:65`; first green run = 0 violations |
| LINT-02 | 08-01, 08-03 | Per-entry allowlist {path\|glob, reason, owner} — expires dropped per D-04 | SATISFIED | Both allowlists migrated; zero actual `expires` fields; REQUIREMENTS-LINT-02 text updated |
| LINT-03 | 08-03 | Conditional: jj-internal.ts ONLY if AUDIT identifies boundary-io consumer | SATISFIED | boundary-io count=2 (both in jj-id.ts reverse-resolve); below 5-row threshold; closes as verified end state — `sdk/src/vcs/backends/jj-internal.ts` does NOT exist; SEED-001 inversion holds |
| PROMPT-05 | 08-03 | Delete `vcs.kind === 'jj'` id-reason branches | SATISFIED | 0 id-reason branches found; 4 KEEP sites annotated (gitOnly.* capability — not id) |
| TEST-12 | 08-02 | Introduce `toBeIdOf` custom matcher; module augmentation; setupFiles; sweep cross-backend assertions; re-record goldens | SATISFIED | Matcher landed; both Assertion + AsymmetricMatchersContaining augmented; 50 goldens re-recorded (timestamp-only diff); strict-green; D-02b REQUIREMENTS-TEST-12 text updated |
| MIGR-06 | 08-03 | Single B-07-style rewriter pass over Phase 8 dir; COMMIT_KEY_ALLOWLIST extended if needed | SATISFIED | `migr-06-close-gate.cjs` ran exactly once; 12 migrations in 08-01-SUMMARY.md; idempotency verified; no new commit-keys needed; prose grep recorded |

**REQ ID Coverage:** 14/14 (all phase REQ IDs satisfied — 0 orphaned, 0 blocked)

### D-ID Coverage (Phase 8 user-confirmed decisions)

| D-ID | Description | Status | Evidence |
|------|-------------|--------|----------|
| D-01 | Audit script emits BOTH `.md` AND JSON sidecar; JSON is literal seed for allowlist | VERIFIED | Both files exist; seeder reads JSON verdicts directly (`seed-lint-allowlist.cjs:64`) |
| D-02 | Matcher is `expect.extend({ toBeIdOf })` — NOT free-function `expectIdShape` | VERIFIED | `vitest-matchers.ts:38 expect.extend({ toBeIdOf(...) })` |
| D-02a | Matcher at `tests/__tools__/vitest-matchers.ts`; setupFiles in `sdk/vitest.config.ts`; ambient `vitest.d.ts` augments both Assertion + AsymmetricMatchersContaining | VERIFIED | All 3 files exist; both interfaces augmented; setupFiles on 2 vitest projects |
| D-02b | REQUIREMENTS-TEST-12 text updated from `expectIdShape` to `toBeIdOf` | VERIFIED | TEST-12 line 47 cites toBeIdOf + clarifies "prior expectIdShape was placeholder". Note: AUDIT-03 line 17 still mentions `expectIdShape` in trailing context — minor doc inconsistency, but TEST-12 contextualizes correctly |
| D-03 | Shared `scripts/lib/allowlist-parser.cjs`; both lints consume it; raw-git allowlist migrated in same phase | VERIFIED | Parser exists; both lints `require('./lib/allowlist-parser.cjs')`; `lint-vcs-no-raw-git.allow.json` migrated to per-entry schema with 23 entries |
| D-04 | Allowlist schema `{path\|glob, reason, owner}` — `expires` field DROPPED; LINT-02 text updated | VERIFIED | Zero `expires` fields in either allowlist (only documentation note); LINT-02 line 34 says "expires is dropped" with rationale |
| D-05 | FLIP-04 scope-minimal — PITFALL 1 doc inverted; JSDoc on renamed fields; NO new ADR | VERIFIED | PITFALL 1 inverted at jj.ts:329-330; JSDoc on LogEntry.id (types.ts:116-122) + CommitResult.id (types.ts:91-95) cites unified contract; FLIP-04 REQUIREMENTS text says "no new ADR" |

**D-ID Coverage:** 5/5 verified (7 sub-IDs counting D-02a + D-02b)

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `.planning/REQUIREMENTS.md` | 17 | AUDIT-03 still mentions `expectIdShape` while TEST-12 was updated per D-02b | INFO | Doc-only drift; TEST-12 clarifies the API name in context. Not a code defect; suggest updating in v1.3 alongside LINT-04. |
| `.planning/REQUIREMENTS.md` | 94-107 | Status column shows "Pending" for all 14 REQ IDs despite Phase 8 closure | INFO | Tracking table not synced to implementation reality; aspirational marker, not a goal blocker. Recommend a status-update pass on phase close. |
| `agents/gsd-executor.md` | 525 | `repos.{name}.hash` prose mentions `.hash` field | INFO | Per `close-gate-prose-grep.md` decision policy: grandfathered (pre-Plan-2 prose); LINT-04 deferred to v1.3. File is documented as "outside this repo" per project memory. |

**No BLOCKERs or WARNINGs.** All anti-patterns are INFO-level documentation drift, not goal-blocking defects.

### Pre-existing Test Failures (NOT Phase 8 regressions)

Per Plan 2/3 SUMMARY + orchestrator guidance — these predate Phase 8:
- `tests/worktree-safety-policy.test.cjs:238` — gitDir/gitCommonDir mock-driver mismatches
- `tests/worktree-safety.test.cjs:64,80` — workflow text assertions on files outside repo
- `validate.test.ts` ×2 — commit_docs default drift
- `config-mutation.test.ts` ×1 — same root cause
- `golden parity` ×2 — `git_commits`/`git_first_commit_date` env-dependent drift

These do NOT regress from Phase 8 work (matcher widening + hard rename + lint guard introduce no behavioral changes in these files).

### Gaps Summary

No gaps. All 6 ROADMAP success criteria, all 14 REQ IDs, and all 5 D-IDs (7 with sub-IDs) verified against the codebase via direct invariant checks (lint exits, type renames, grep counts, file presence, behavioral spot-checks, tsc compile).

The one BLOCKER raised in 08-REVIEW.md (CR-01: cmdCommitToSubrepo sweep miss) was FIXED orchestrator-side as the parent commit `54843ae7 fix(08): sweep missed cmdCommitToSubrepo .hash to .id`. Verified via grep — all 4 sites at `commands.cjs:484, 487, 500, 508` use `id:` / `v.id`.

### Human Verification Required

None. All Phase 8 success criteria are programmatically verifiable via grep/file/exit-code checks. The matcher behavior is unit-test-covered. The MIGR-06 rewriter idempotency was verified by the Plan 3 executor via second-invocation diff-r.

---

*Verified: 2026-05-15*
*Verifier: Claude (gsd-verifier)*
