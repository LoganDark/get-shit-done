# Close-gate Prose Hex Grep — Phase 8 MIGR-06

**Generated:** 2026-05-15
**Grep command:** `grep -rnE '\b[0-9a-f]{7,40}\b' get-shit-done/workflows/ commands/gsd/ agents/`
**Total hits:** 10
**Decision policy:** per Phase 8 RESEARCH Open Q2, all pre-Plan-2 prose is **grandfathered** (LINT-04 deferred to v1.3 for proper prose-aware lint).

## Hits

```
get-shit-done/workflows/undo.md:64:  1. abc1234 feat(04-01): implement auth endpoint
get-shit-done/workflows/undo.md:65:  2. def5678 docs(03-02): complete plan summary
get-shit-done/workflows/settings-integrations.md:19:- **Masking convention: `****<last-4>`** (e.g. `sk-abc123def456` → `****f456`).
get-shit-done/workflows/execute-plan.md:435:(see execute-phase.md §5.7, single-writer contract from #1486 / dcb50396).
get-shit-done/workflows/audit-fix.md:159:| F-01 | Missing export | Fixed | abc1234 |
get-shit-done/workflows/settings-advanced.md:307:      { label: "Enter number", description: "Integer. Non-numeric rejected. Default: 200000. Use 1000000 for 1M-context models. Values >= 500000 enable adaptive enrichment." }
get-shit-done/workflows/settings-advanced.md:463:gsd-sdk query config-set context_window 1000000
agents/gsd-code-fixer.md:519:  commit_hash: "abc1234",  // if fixed
agents/gsd-executor.md:525:- **Multi-repo (sub_repos):** Extract hashes from `commit-to-subrepo` JSON output (`repos.{name}.hash`). Record all hashes for SUMMARY (e.g., `backend@abc1234, frontend@def5678`).
agents/gsd-executor.md:549:back, those deletions appear on the main branch, destroying prior-wave work (#2075, commit c6f4753).
```

## Per-hit decisions

All 10 hits classified as **historical-prose** (grandfathered per Open Q2):

| Hit | Classification | Rationale |
|-----|----------------|-----------|
| undo.md:64-65 (`abc1234`, `def5678`) | historical-prose | Illustrative placeholder commit shorthand in workflow doc; not a real commit reference. |
| settings-integrations.md:19 (`sk-abc123def456`) | NOT a commit hex | API-key masking example (the regex matches `c123def456` substring of an example secret key, NOT a commit hash). False-positive of the grep pattern. |
| execute-plan.md:435 (`dcb50396`) | historical-prose | Real past commit reference embedded in workflow doc citing PR #1486; historical record. |
| audit-fix.md:159 (`abc1234`) | historical-prose | Example table column showing the expected commit-hash shape in audit-fix reports. |
| settings-advanced.md:307,463 (`1000000`) | NOT a commit hex | Numeric constants for `context_window` config setting (1M tokens); decimal digits — false-positive of `[0-9a-f]{7,40}` pattern matching decimal numerals. |
| gsd-code-fixer.md:519 (`abc1234`) | historical-prose | Example commit-hash field in a structured JSON snippet showing the gsd-code-fixer output shape. |
| gsd-executor.md:525 (`abc1234`, `def5678`) | historical-prose | Multi-repo commit-hash example syntax in agent prompt; placeholder. |
| gsd-executor.md:549 (`c6f4753`) | historical-prose | Real past commit reference citing PR #2075 (destructive worktree-clean prevention); historical record. |

**Verdict:** No live commit-id leak surface in workflow/command/agent prose. LINT-04 (prose-aware lint) deferred to v1.3 for proper handling — when shipped, the lint should distinguish "real past commit references in historical context" (acceptable) from "post-FLIP examples showing the wrong identifier shape" (lint failure).

The migrate-content rewriter (MIGR-06) intentionally does NOT process prose zones — only inline backtick spans whose CONTENT is wholly a hex id, plus frontmatter values on commit-keyed lines. Per RESEARCH `format-migration/rewrite.ts:30-33` zone-walker contract.
