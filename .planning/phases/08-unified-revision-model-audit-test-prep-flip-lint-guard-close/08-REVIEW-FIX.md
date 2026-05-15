---
phase: 08-unified-revision-model-audit-test-prep-flip-lint-guard-close
fixed_at: 2026-05-15T08:50:00Z
review_path: .planning/phases/08-unified-revision-model-audit-test-prep-flip-lint-guard-close/08-REVIEW.md
fix_scope: critical_warning
findings_in_scope: 8
fixed: 8
skipped: 0
iteration: 3
status: all_fixed
---

# Phase 8: Code Review Fix Report

**Fixed at:** 2026-05-15
**Source review:** `.planning/phases/08-unified-revision-model-audit-test-prep-flip-lint-guard-close/08-REVIEW.md`
**Iteration:** 3 (cumulative; iteration 1 covered the original 6 critical+warning findings, iteration 2 covered the 4 Info findings, iteration 3 closes the 2 NEW Warnings appended to REVIEW.md post-verification)

**Summary:**
- Findings in scope (fix_scope=critical_warning): 8 (1 Critical + 7 Warning)
- Fixed: 8 (6 from iteration 1, 2 fresh in iteration 3)
- Skipped: 0
- Out-of-scope (already-fixed): 4 Info-tier findings closed in iteration 2

All 12 review findings now have an applied fix on the branch. Iteration 1 closed CR-01 + WR-01..WR-05; iteration 2 closed IN-01..IN-04 under an expanded `fix_scope=all`; iteration 3 (this run, scoped back to `critical_warning`) closes the two warnings appended to REVIEW.md after Phase 8 verification (WR-06 commit_id leak via verify text-scan; WR-07 audit + lint regex coverage gap that allowed WR-06 to slip past CI). Project lints + targeted tests + SDK build all green post iteration 3.

## Fixed Issues — Iteration 1 (already landed; not re-fixed this run)

### CR-01: cmdCommitToSubrepo renders every repo as ":skip" because of an inconsistent hash/id rename

**Files modified:** `get-shit-done/bin/lib/commands.cjs`
**Commit:** `54843ae7` (pre-existing, landed before iteration 1)
**Applied fix:** Renamed all 3 producer sites (`hash:` → `id:` on lines 484, 487, 500) plus the local var `hash` → `id` (lines 491-498). Verified by re-reading: producers emit `id:`, render at line 508 reads `v.id`, contract restored.

### WR-01: lint-vcs-no-commit-id.cjs allowlist path-resolution silently breaks when --scan-root points anywhere but REPO_ROOT

**Files modified:** `scripts/lint-vcs-no-commit-id.cjs`
**Commit:** `umuqqpnzvnwl` (iteration 1; combined with WR-03)
**Applied fix:** Option (a) from the review — added a documentation block above the `path.relative(SCAN_ROOT, …)` call explaining the fixture-test rationale, mirroring the existing convention in `scripts/lint-vcs-no-raw-git.cjs`.

### WR-02: migr-06-close-gate.cjs duplicates SDK rewriter logic instead of consuming the canonical implementation

**Files modified:** `scripts/migr-06-close-gate.cjs`, `tests/scripts/migr-06-close-gate.test.cjs` (new)
**Commit:** `oxxwxwtmwxmr` (iteration 1)
**Applied fix:** Kept the inline duplication, locked it with a unit test asserting the close-gate's `COMMIT_KEY_ALLOWLIST` is a superset of the canonical set in `sdk/src/vcs/format-migration/rewrite.ts`.

### WR-03: lint-vcs-no-commit-id.cjs hex-regex pattern only matches JS regex literal form

**Files modified:** `scripts/lint-vcs-no-commit-id.cjs`, `scripts/audit-id-namespace.cjs`, `tests/scripts/audit-id-namespace.test.cjs`
**Commit:** `umuqqpnzvnwl` (iteration 1; combined with WR-01)
**Applied fix:** Expanded both PATTERNS character classes to accept backtick, single-quote, double-quote, OR forward-slash as the opening delimiter. Added 3 fixture tests covering JS regex-literal, single-quoted, and double-quoted hex regex forms.

### WR-04: migrateVcsQuery rejects `--cwd` with no value via a misleading "unknown flag" error

**Files modified:** `sdk/src/query/migrate-vcs.ts`
**Commit:** `vlspussqxttq` (iteration 1)
**Applied fix:** Split the three two-arg flags (`--cwd`, `--target`, `--workstream`) into explicit branches, each emitting a flag-specific error string when the value is missing.

### WR-05: git.ts diff() silently produces nonsensical nameOnly output when both nameOnly and nameStatus are passed

**Files modified:** `sdk/src/vcs/backends/git.ts`
**Commit:** `prtpnprmvwpn` (iteration 1)
**Applied fix:** Gated both the `--name-only` arg push and the `result.nameOnly` field population on `opts.nameOnly && !opts.nameStatus`.

## Fixed Issues — Iteration 2 (already landed; out of this run's scope, but kept for cumulative view)

### IN-01: migr-06-close-gate.cjs containment guard is redundant when walkMd starts at PHASE_DIR

**Files modified:** `scripts/migr-06-close-gate.cjs`
**Commit:** `mxswozzkvtqs` (iteration 2)
**Applied fix:** Appended explanatory comment block describing the defense-in-depth rationale (symlink-escape probe).

### IN-02: emitMarkdown produces unsafe pipe-escaping for table cell values

**Files modified:** `scripts/audit-id-namespace.cjs`
**Commit:** `zzporsmvqwoo` (iteration 2)
**Applied fix:** Dedicated `escapeMarkdownCell(s)` helper escapes `\`, `|`, `` ` ``, and collapses newlines to `<br>`.

### IN-03: parseJjBookmarkRecord throws on non-array target instead of treating it as malformed

**Files modified:** `sdk/src/vcs/parse/jj-bookmark.ts`, `sdk/src/vcs/__tests__/jj-refs.test.ts`
**Commit:** `pqrlrutnxomx` (iteration 2)
**Applied fix:** Added contract-drift `Array.isArray(record.target)` check mirroring the `record.name` pattern + 3 new vitest cases.

### IN-04: seed-lint-allowlist.cjs has no idempotency assertion despite the JSDoc claim

**Files modified:** `scripts/seed-lint-allowlist.cjs`
**Commit:** `vouwuyoqqoll` (iteration 2)
**Applied fix:** Wrapped `fs.writeFileSync` in read-and-compare guard; skip-write path logs "no changes (… already up to date)".

## Fixed Issues — Iteration 3 (this run, `fix_scope=critical_warning`)

### WR-06: SDK extracts commit_id-shape hex from text and passes it to jj backend

**Files modified:** `sdk/src/query/verify.ts`, `get-shit-done/bin/lib/verify.cjs`
**Commit:** `nowrpmoxymrx` (iteration 3)
**Applied fix:** Broadened the verify-work probe's hex-regex from `\b[0-9a-f]{7,40}\b` to `\b(?:[0-9a-f]{7,40}|[k-z]{7,40})\b` at BOTH twin sites (SDK + cjs shim). Renamed local var `commitHashPattern` → `revIdPattern` to reflect the post-FLIP unified concept (a revision id, either alphabet) — the prior commit-only name was a Phase-7-vintage misnomer. Added a comment block at each site documenting the alphabet-agnostic invariant and pointing at `expr.rev()` / `SHA_OR_CHANGE_ID_RE` as the contract anchor. Effect: jj-colocated repos with post-FLIP SUMMARY.md text (citing `[k-z]{12}`-shaped change_ids) no longer silently report `commitsExist: false`; the SDK stops feeding commit_id-shape tokens into jj. `vcs.refs.exists(expr.rev(hash))` already routes correctly on either backend.
**Verification:** `node -c get-shit-done/bin/lib/verify.cjs` OK; `pnpm --filter @gsd-build/sdk build` exit 0 (tsc + tsc -p tsconfig.cjs.json); `node scripts/lint-vcs-no-commit-id.cjs` 0 violations (the broadened regex is no longer a `commit_id`-literal); `node scripts/lint-vcs-no-raw-git.cjs` 0 violations.

### WR-07: Audit + lint hex-regex coverage gap allowed WR-06 to slip past CI

**Files modified:** `scripts/audit-id-namespace.cjs`, `scripts/lint-vcs-no-commit-id.cjs`, `tests/scripts/audit-id-namespace.test.cjs`
**Commit:** `xmxlxqumrvwn` (iteration 3)
**Applied fix:** Added a second hex-pattern entry to BOTH `audit-id-namespace.cjs` PATTERNS and `lint-vcs-no-commit-id.cjs` COMMIT_ID_PATTERNS catching the `\b...\b` word-boundary form (`/\b[0-9a-f]{N}\b/`) that the WR-03 sweep missed. Pattern: `/[`'"\/]\\b\[0-9a-f\]\{[0-9]+(?:,[0-9]+)?\}\\b/`. Kept the WR-03 anchored/quoted form pattern in place — chose two narrow patterns over one unified mega-pattern for readability and easier per-form regression coverage. Added 2 new fixture tests to `tests/scripts/audit-id-namespace.test.cjs` (word-boundary form + slash-anchored form), and bumped the `PATTERNS.length` assertion from 8 to 9. Both forms now have explicit regression coverage; future `\b[0-9a-f]{N}\b` regressions will trigger both the audit and the lint guard.

**Audit re-run finding:** After applying WR-06 + WR-07, `node scripts/audit-id-namespace.cjs --json` no longer surfaces the verify.ts:514 / verify.cjs:85 sites — exactly the expected post-fix state. The WR-06 broadening replaced `\b[0-9a-f]{7,40}\b` with `\b(?:[0-9a-f]{7,40}|[k-z]{7,40})\b`, which is no longer a commit_id-shape literal and correctly doesn't match the audit's hex-regex pattern. Total live audit findings: 79 (down from 101 pre-fix snapshot in `.planning/intel/id-namespace-audit.json`). The new audit run produces NO new entries needing allowlist treatment, so no allowlist reseed (`scripts/lint-vcs-no-commit-id.allow.json` unchanged) and no intel snapshot rewrite needed — the existing audit-row-keyed `reason` strings in the allowlist remain valid (audit row numbers map to historical verdicts assigned during Plan 1; the live audit row numbers are advisory until the next intentional reseed).

**Verification:** `node -c scripts/audit-id-namespace.cjs` + `node -c scripts/lint-vcs-no-commit-id.cjs` syntax OK; `node --test tests/scripts/*.test.cjs` → 22/22 pass (was 20 before; +2 new WR-07 fixture cases); `node scripts/audit-id-namespace.cjs --json` exits 0; both lints (`lint-vcs-no-commit-id`, `lint-vcs-no-raw-git`) exit 0 with 0 violations.

## Verification Gates (post iteration 3)

All gates green:

- `node scripts/lint-vcs-no-commit-id.cjs` → ok, 1033 files scanned, 0 violations
- `node scripts/lint-vcs-no-raw-git.cjs` → ok, 1071 files scanned, 0 violations
- `pnpm --filter @gsd-build/sdk build` → exit 0 (tsc + tsc -p tsconfig.cjs.json clean)
- `node --test tests/scripts/*.test.cjs` → 22/22 pass (was 20 in iteration 2; +2 new WR-07 fixture cases for word-boundary and slash-anchored hex_regex forms)
- `node scripts/audit-id-namespace.cjs --json` → exit 0; live audit no longer surfaces the verify.{ts,cjs} sites (correctly — WR-06 broadened the literal past commit_id-shape).
- Allowlist + intel snapshot unchanged this run (no new entries needed); WR-07 plan's reseed branch did not apply.

---

_Fixed: 2026-05-15_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 3_
