---
phase: 19-upstream-merge-conflict-resolution-fork-abstraction-audit
plan: 04
subsystem: infra
tags: [jj, merge-resolution, docs, ci, pnpm, test-helpers, baseline, audit-ledger]

# Dependency graph
requires:
  - phase: 19-upstream-merge-conflict-resolution-fork-abstraction-audit
    provides: "19-03: buckets A/B/C cleared (17 conflicts remaining, all D/E/F/G), harvest/ reference tree, live ledger"
provides:
  - "MERGE-01 tree-level complete: `jj resolve --list` EMPTY (17 → 0), canonical marker sweep clean (exclusion list still EMPTY)"
  - "Bucket D (10 docs/translations): upstream-preferred with fork jj grafts — README jj-fork NOTE/WARNING, CHANGELOG fork-history section, INVENTORY migrate-vcs row + dispatch-cwd-safety rename"
  - "Bucket E remainder: test.yml (upstream shape, de-next'd, corepack+pnpm, no org secrets), ISSUE_TEMPLATE config.yml (fork-real URLs), github-release-notes.cjs (upstream side, node -c green)"
  - "Bucket F: tests/helpers.cjs genuine merge (fork vcsTest harness re-pointed at gsd-core/bin/lib/vcs/index.cjs, lazy); bug-3097-3099 re-pathed to gsd-core; bug-2767 deleted (ported-to:19-11)"
  - "Bucket G: gsd-research-synthesizer.md — upstream #222 contract + grafted rule 7 covering the Claude Code subagent Write gate (fork guarantee not covered by #222 alone)"
  - "Pre-port test baseline frozen in 19-MERGE-AUDIT.md: 12,860 unit tests / 153 fail across 49 files, every failure one-line-caused and classed A–E for port-regression attribution"
  - "Hand-edited .cjs inventory appendix seeded (3 rows, all node -c confirmed)"
affects: [19-05 (port starts against frozen baseline), 19-06 (verb bridge clears class B/C rows), 19-08 (workflow/reference re-home clears class C rows), 19-10/19-11/19-12 (test revival + re-baselines), 19-13 (ledger completeness proof)]

# Tech tracking
tech-stack:
  added: []
  patterns: [corepack-enable before setup-node for pnpm CI without third-party action SHAs, forward-pointing docs to converged post-phase layout with ledgered rationale, baseline-freeze-before-port for failure attribution]

key-files:
  created:
    - .planning/phases/19-upstream-merge-conflict-resolution-fork-abstraction-audit/deferred-items.md
  modified:
    - README.md
    - CONTRIBUTING.md
    - SECURITY.md
    - CHANGELOG.md
    - docs/FEATURES.md
    - docs/USER-GUIDE.md
    - docs/INVENTORY.md
    - docs/INVENTORY-MANIFEST.json
    - docs/ja-JP/ARCHITECTURE.md
    - docs/ko-KR/ARCHITECTURE.md
    - .github/workflows/test.yml
    - .github/ISSUE_TEMPLATE/config.yml
    - scripts/changeset/github-release-notes.cjs
    - tests/helpers.cjs
    - tests/bug-3097-3099-executor-worktree-path-safety.test.cjs
    - agents/gsd-research-synthesizer.md
    - .planning/phases/19-upstream-merge-conflict-resolution-fork-abstraction-audit/19-MERGE-AUDIT.md
  deleted:
    - tests/bug-2767-gsd-sdk-commit-files-flag.test.cjs

key-decisions:
  - "ISSUE_TEMPLATE/config.yml: c7bd6bee 'fork-side URLs' were stale GSD-redux deprecation pointers (locked out by the identity decision) — replaced with the real fork issues URL (LoganDark/get-shit-done), matching the README jj-NOTE graft"
  - "test.yml pnpm conversion uses corepack-enable steps (honors packageManager pin) instead of pnpm/action-setup — no unverifiable third-party action SHA enters upstream's SHA-pinned workflow; check-npm-integrity.cjs steps dropped (npm-lockfile-specific; frozen-lockfile install is the drift gate)"
  - "github-release-notes.cjs: fork's MIGR-05 VcsAdapter migration NOT re-applied (require target retired until 19-05) — upstream side taken, deferred-items.md row filed for 19-07/19-13"
  - "bug-3097-3099 test asserts the CONVERGED end-state (gsd-core paths, dispatch-cwd-safety.md) — fails pre-19-08 by design, recorded in baseline; upstream's #280 raw-git PROJECT_ROOT assertion dropped (pins pre-Phase-11 pattern the fork's 19-08 delta removes)"
  - "Synthesizer reconciliation verdict: upstream #222 does NOT cover the fork guarantee (rule 1 assumes Write succeeds; rule 6 covers truncation only, not the hard tengu_subagent_md_report_blocked gate) — grafted rule 7 with the pre-seeded-file Edit path and added Edit to the tools allowlist"
  - "INVENTORY count bumps (Commands 68, Workflows 89) carried as part of the class-a migrate-vcs graft (Phase 17.02 coupling), NOT dropped as class-c drift — translations' stale counts were the class-c drops"

patterns-established:
  - "Forward-pointing resolution: when fork content's final home lands in a later plan, resolve docs/tests to the converged state and record the temporary red in the pre-port baseline instead of resolving to a state that breaks post-port"

requirements-completed: []  # MERGE-01 is phase-spanning (tree-level done HERE, proven complete at 19-13); no v1.4 REQUIREMENTS.md row — 19-01/19-02/19-03 precedent

# Metrics
duration: ~32min
completed: 2026-06-10
---

# Phase 19 Plan 04: Bucket D/E/F/G Resolution + Zero-Conflict Gate Summary

**Resolved the final 17 genuine-merge conflicts (docs/translations upstream-preferred with fork jj grafts; CI de-org'd and pnpm-converted via corepack; tests/helpers.cjs genuinely merged with the fork vcsTest harness re-pointed at gsd-core/bin/lib/vcs; research-synthesizer reconciled with the fork's Write-gate guarantee grafted as rule 7) — `jj resolve --list` is now EMPTY, the marker sweep is clean, and the pre-port unit baseline (12,860 tests / 153 fails, all one-line-caused) is frozen in the ledger for port attribution.**

## Performance

- **Duration:** ~32 min (2026-06-10 10:47–11:18 UTC, including the full unit-suite baseline run)
- **Tasks:** 3
- **Files:** 1 created, 17 modified, 1 deleted

## Accomplishments

- **MERGE-01 tree-level complete:** conflict count 17 → 0; canonical marker sweep (with the 19-03-amended command) returns zero hits; tracked-fixture exclusion list remains EMPTY.
- **Bucket D (10 files):** upstream side written first for every file, then the base→fork delta triaged hunk-by-hunk. Re-applied (class a): README jj-fork NOTE + empty-revision WARNING; INVENTORY `/gsd-migrate-vcs` row + counts; dispatch-cwd-safety.md rename in INVENTORY + MANIFEST (JSON parses). Dropped: 15+ redux-identity naming hunks (class b), all ja-JP/ko-KR drift-count fixes (class c, doc-parity drop locked). CHANGELOG = upstream 1.0.0→1.4.3 stream + clearly-marked `## Fork history (jj support line, pre-merge)` section carrying the c7bd6bee entries verbatim.
- **Bucket E remainder (3 files):** test.yml adopts upstream's scope-detection CI wholesale, then strips `next`-branch triggers (zero non-default secrets existed — verified), converts every install/run to corepack+pnpm with `cache: 'pnpm'`, and drops the npm-lockfile-only integrity-gate steps (T-19-09 verify green: no discord/bot/ORG_ tokens). ISSUE_TEMPLATE links point at the real fork repo. github-release-notes.cjs = upstream side, `node -c` green (T-19-10).
- **Bucket F (3 files):** helpers.cjs genuine merge — upstream base (createFixture, npm-isolation, waitFor et al.) + fork grafts: adapter-routed `createTempGitProject` (D-09 zero-raw-git), `_loadVcs` re-pointed `../gsd-core/bin/lib/vcs/index.cjs` with `pnpm run build:lib` hint (lazy — non-VCS tests load fine: 12,695 baseline passes prove it), full `vcsTest`/`vcsMultiWsTest` harness, WR-09 regex widen, merged lazy-getter exports. bug-3097-3099 carries the fork's Phase 11 verb assertions re-pathed to gsd-core. bug-2767 deleted with `ported-to:19-11` disposition.
- **Bucket G (1 file):** same-bug-two-fixes reconciled with an explicit coverage diff (T-19-11/BLOCKER-2): upstream #222 contract kept, fork's blocked-Write guarantee grafted as rule 7 (pre-seeded-file Edit path, touch-if-absent, chunked-Edit fallback) + `Edit` added to tools.
- **Pre-port baseline frozen:** `node scripts/run-tests.cjs --suite unit` → 12,860 tests, 153 fails across 49 files, every file one-line-caused and bucketed into 5 classes (A: adapter-not-built/19-05, B: fork sdk leftovers, C: convergence gates owned by later plans, D: superseded upstream doc-shape tests, E: environment/re-baseline). Appendix in 19-MERGE-AUDIT.md.
- **Ledger discipline:** 17 new disposition rows (10 D + 3 E + 4 F/G), all six-prefix parseable; hand-edited .cjs inventory seeded with 3 node-c-confirmed rows; deferred-items.md opened with the MIGR-05 re-application row.

## Task Commits

Each task committed file-scoped on top of the stack above merge change `vpzlrrlv` (36c417ee, untouched):

1. **Task 1: Bucket D docs/translations** - `6aed06bc` / change `nukusvtt` (feat)
2. **Task 2: Bucket E CI + release-notes** - `20e85e0c` / change `krmzpvzp` (feat)
3. **Task 3: Buckets F+G + zero-conflict gate + baseline** - `2e03f9e9` / change `vsylruox` (feat)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Plan-assumption bug] ISSUE_TEMPLATE "fork-side URLs" are stale redux deprecation pointers**
- **Found during:** Task 2
- **Issue:** the plan instructs replacing contact links with "the fork-side URLs from c7bd6bee", but those URLs are the OLD upstream's self-deprecation pointing at `GSD-redux/get-shit-done-redux` — carrying them verbatim would violate the locked identity decision (redux naming does not survive) and misroute issues to a third-party repo
- **Fix:** upstream shape with the real fork URL (github.com/LoganDark/get-shit-done/issues), consistent with the README jj-NOTE graft; acceptance ("fork URLs, not OpenGSD org URLs") satisfied
- **Files modified:** .github/ISSUE_TEMPLATE/config.yml
- **Commit:** 20e85e0c

**2. [Rule 1 - Bug] npm-lockfile-only integrity gate would fail every CI run under pnpm**
- **Found during:** Task 2 (test.yml pnpm conversion)
- **Issue:** `scripts/check-npm-integrity.cjs` exits 2 when package-lock.json is absent — unconditionally fatal in the pnpm fork
- **Fix:** dropped the 4 "Dependency integrity gate" steps with an explanatory comment; `pnpm install --frozen-lockfile` enforces lockfile/manifest agreement
- **Files modified:** .github/workflows/test.yml
- **Commit:** 20e85e0c

**3. [Rule 2 - Coverage gap] Upstream #222 contract does not cover the fork's blocked-Write guarantee**
- **Found during:** Task 3 (explicit coverage diff mandated by the plan)
- **Issue:** upstream rule 1 assumes `Write` succeeds and rule 6 handles only truncation; Claude Code v2.1+ hard-blocks subagent `Write` on `^(summary|report|findings|analysis).*\.md$` — the exact failure the fork fixed
- **Fix:** grafted rule 7 (runtime gate description + pre-seeded-file Edit path) and added `Edit` to the tools allowlist (upstream's own rule-6 fallback referenced `Edit` without granting it)
- **Files modified:** agents/gsd-research-synthesizer.md
- **Commit:** 2e03f9e9

### Deferred (not fixed, logged)

- **github-release-notes.cjs MIGR-05 adapter migration:** fork's VcsAdapter rewrite of the script requires the retired `sdk/dist-cjs`; the ported entry exists only after 19-05. Upstream side taken per plan; re-application filed in `deferred-items.md` (suggested home 19-07, else 19-13 reconciliation).

## Authentication Gates

None.

## Known Stubs / Forward Pointers

No code stubs. Three deliberate forward pointers (all ledgered, all captured in the pre-port baseline so they cannot rot silently):

- `docs/INVENTORY.md` / `docs/INVENTORY-MANIFEST.json` reference `dispatch-cwd-safety.md` and the migrate-vcs workflow count before their 19-08 re-home (tests `inventory-counts`, `inventory-manifest-sync` red in baseline, class C).
- `tests/helpers.cjs` `_loadVcs()` targets `gsd-core/bin/lib/vcs/index.cjs`, emitted by the 19-05 port build (lazy require — load-safe today; class-A baseline rows clear at 19-05).
- `tests/bug-3097-3099-...` asserts the post-19-08 gsd-core layout (3 baseline fails, class C).

## Issues Encountered

- The fork-side CHANGELOG at c7bd6bee contains no fork-authored release entries (the fork tracked its work in `.planning/`); the appended fork-history section therefore carries the fork's full legacy-1.x changelog verbatim (including its two corrections vs upstream's legacy line) under a preamble that disambiguates it from upstream's restarted `@opengsd/gsd-core` version stream.
- The baseline surfaced a local-environment failure class worth knowing about (E): several upstream test fixtures run raw `git commit` without disabling gpg signing and fail on machines with global `commit.gpgsign=true` (graphify-auto-update's 28 fails, bug-630, ci-rebase-check). Pre-existing upstream behavior, out of scope here.

## Verification Results

- `jj resolve --list` → "No conflicts found at this revision" (0 paths; was 17) — **MERGE-01 tree-level done**
- Canonical marker sweep (`rg -l --hidden --no-ignore-vcs --glob '!.jj/**' --glob '!.git/**' --glob '!node_modules/**' '^(<<<<<<<|%%%%%%%|>>>>>>>)' .`) → zero hits; exclusion list still EMPTY
- `node -c`: github-release-notes.cjs, helpers.cjs, bug-3097-3099 test — all parse (BLOCKER-1 guard); all three in the ledger's Hand-edited .cjs inventory
- docs/INVENTORY-MANIFEST.json: `JSON.parse` green; CHANGELOG contains `## Fork history`; zero `get-shit-done-redux` hits in README/USER-GUIDE/FEATURES
- test.yml: ≥1 pnpm reference, zero `next` branch refs, zero discord/bot/ORG_ tokens, YAML loads (T-19-09 mitigated)
- `vpzlrrlv` = 36c417ee unchanged; all work stacked above it; no bookmark moves, no op restore

## Next Phase Readiness

- **19-05 unblocked:** the port starts against a frozen, fully-attributed baseline — any NEW failure after 19-05 is port fallout by construction; `sdk/src/vcs` (port source) untouched.
- **19-06/19-08 acceptance pre-wired:** baseline classes B/C enumerate exactly which red rows each later plan is expected to clear.

## Self-Check: PASSED

- Files exist: 19-04-SUMMARY.md (this file), deferred-items.md, all 17 modified paths present; tests/bug-2767-...test.cjs absent
- Commits present in `jj log`: 6aed06bc (nukusvtt), 20e85e0c (krmzpvzp), 2e03f9e9 (vsylruox)
- `jj resolve --list` empty; marker sweep clean; 3× node -c green
- Ledger: 17 new disposition rows + baseline appendix + 3 .cjs inventory rows, all tagged (19-04 Task N)

---
*Phase: 19-upstream-merge-conflict-resolution-fork-abstraction-audit*
*Completed: 2026-06-10*
