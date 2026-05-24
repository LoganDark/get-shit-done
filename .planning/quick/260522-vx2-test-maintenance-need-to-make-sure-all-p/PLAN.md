---
quick_id: 260522-vx2
type: triage
status: probe-complete
created: 2026-05-23
---

# Quick Task 260522-vx2 — Test Maintenance Triage

> **Mode:** Probe-first (no code changes this round). User to choose follow-up scope.

## Headline numbers

| Metric | Count |
|--------|-------|
| Tests run by `npm test` | 9177 |
| Pass | 9083 |
| Fail | **94** (outer-test failures; 118 unique fail lines counting nested children) |
| Skipped | 0 |
| Orphan `tests/scripts/*.test.cjs` not discovered by runner | **4** (all pass when invoked directly) |
| `node scripts/check-skip-count.cjs` | exits 1 — 22 skip markers vs 18 baseline (+4) |

Source: `/tmp/npm-test-13-quick.log` (17,700 lines).

## Bucket A — Workflow-markdown drift inherited from upstream (~70 failures)

**Diagnosis:** these tests grep canonical workflow markdown (`execute-phase.md`,
`execute-plan.md`, `quick.md`, agent prompts) for specific raw-git shell phrases —
e.g. `worktree_branch_check`, `git reset --hard`, `git symbolic-ref`, `git worktree`,
`git update-ref`, `WAS_DELETED`, post-merge deletion blocks, resurrection guards.
The jj-port has *correctly* migrated these away: `git worktree` references in `quick.md`
dropped 0 / `execute-phase.md` 1; `workspace.parallel` references rose to 6 / 5;
`gsd-sdk query` references rose to 29 / 59. The tests are inherited upstream
regression tests for git-era bugs (#1496, #1503, #1756, #1977, #2015, #2075, #2384,
#2431, #2432, #2501, #2543, #2772, #2838, #2924, #3195, #3264, #3425, #3443) — they
assert text-patterns that no longer apply.

**Files (18 test files, ~70 failures):**

| File | Fails |
|------|-------|
| `tests/bug-2924-worktree-head-attachment.test.cjs` | 12 |
| `tests/worktree-safety-policy.test.cjs` | 9 |
| `tests/execute-phase-step-5-5-deviation-doc.test.cjs` | 9 |
| `tests/bug-2431-worktree-locked-surfacing.test.cjs` | 6 |
| `tests/bug-2075-worktree-deletion-safeguards.test.cjs` | 5 |
| `tests/worktree-merge-protection.test.cjs` | 5 |
| `tests/bug-2015-worktree-base-branch.test.cjs` | 4 |
| `tests/bug-2384-post-merge-deletion-audit.test.cjs` | 3 |
| `tests/bug-2501-resurrection-detection.test.cjs` | 3 |
| `tests/bug-2838-summary-rescue-gitignored-planning.test.cjs` | 3 |
| `tests/worktree-cleanup.test.cjs` | 3 |
| `tests/bug-3195-quick-resurrection-guard.test.cjs` | 2 |
| `tests/bug-3425-worktree-cleanup-cwd-pin.test.cjs` | 2 |
| `tests/worktree-safety.test.cjs` | 2 |
| `tests/bug-2432-quick-plan-predispatch-commit.test.cjs` | 1 |
| `tests/bug-2543-gsd-slash-namespace.test.cjs` | 1 |
| `tests/bug-2772-gitmodules-path-intersection.test.cjs` | 1 |
| `tests/quick-commit-boundary.test.cjs` | 1 |

**Sample assertion:**
```js
// tests/worktree-safety.test.cjs:80
assert.ok(content.includes('worktree_branch_check'),
  'execute-plan.md must contain a worktree_branch_check block');
```
This block was deliberately removed by the jj-port; the workflow now dispatches via
`gsd-sdk query workspace.parallel.{dispatch,fan-in}` which has no concept of `git worktree`.

**Sample upstream test header (tests/worktree-safety.test.cjs:1):**
> `// allow-test-rule: pending-migration-to-typed-ir [#2974]`
> `// Tracked in #2974 for migration to typed-IR assertions per CONTRIBUTING.md`
> `// "Prohibited: Raw Text Matching on Test Outputs". Do not copy this pattern.`

So upstream already classifies these as deprecated text-matching tests pending migration.

**Closure options (Bucket A):**
1. Allowlist them via a jj-port-specific skip annotation (`// allow-skip: jj-port-workflow-migrated`).
2. Delete the upstream-only worktree-flavored bug-regression test files entirely (they assert text that the port removed by design — the regressions they guard against no longer apply).
3. Migrate to typed-IR assertions per upstream #2974 (significant work; out of quick-task scope).
4. Leave as-is — accept 94 npm-test fails as visible drift while the port catches up.

## Bucket B — Real regressions / drift (~24 failures)

**Diagnosis:** these are NOT text-drift. They are real-API / parity / scan failures
specific to the port's current state.

| File | Failure | Root cause (initial read) |
|------|---------|--------------------------|
| `tests/vcs-adapter-contract.test.cjs` | `vcs.commit({files,message}) produces a hash` (fails on `git` AND `jj-colocated`; `jj-native` skipped) | `r.hash` is undefined; matches the [unified revision model] memo — adapter no longer volunteers commit_id from jj, may have been pulled from git too. Test asserts stale API shape; either re-add `hash` to the commit return, or update tests to use the new field. |
| `tests/vcs-adapter-contract.test.cjs` | `vcs.log returns entries after a commit` | Same — `entries[0].hash` undefined. |
| `tests/gsd-sdk-query-registry-integration.test.cjs` | `every referenced command resolves to a registered handler` | Command-registry drift (a referenced verb not registered, or a registered verb not referenced). |
| `tests/commands.test.cjs` | `commit command` (16,836ms — real-VCS) | Likely related to the same commit-hash-undefined surface as the adapter test. |
| `tests/commands-doc-parity.test.cjs` | `every shipped command is documented somewhere` | Doc/registry parity drift. |
| `tests/changeset-github-release-notes.test.cjs` | 4 fails — `tag-range renderer`, `loads slugs from git tag range`, `builds grouped IR`, `rejects unsafe refs` | Changeset-renderer test surface; may depend on git tags / fixtures. |
| `tests/code-review.test.cjs` | 2 fails — `CR-AGENT: code review agent frontmatter`, `creates real commit with correct hash` | Agent-prompt frontmatter drift + commit-hash surface. |
| `tests/prompt-injection-scan.test.cjs` | `workflow files are clean` | `get-shit-done/workflows/new-project.md`: 54,429 chars exceeds "prompt stuffing" length heuristic. Either allowlist the file or trim. |
| `tests/inventory-counts.test.cjs` | `docs/INVENTORY.md headline counts match the filesystem` | INVENTORY.md needs regen. |
| `tests/inventory-manifest-sync.test.cjs` | `INVENTORY-MANIFEST.json matches the filesystem` | Manifest needs regen. |
| `tests/config-schema-docs-parity.test.cjs` | `every key in VALID_CONFIG_KEYS is documented in docs/CONFIGURATION.md` | Config-doc parity drift. |
| `tests/enh-2789-description-budget.test.cjs` | `all commands/gsd/*.md descriptions are <= 100 chars` | At least one slash-command description exceeds 100 chars. |
| `tests/surface-clusters.test.cjs` | `CLUSTERS data structure` + `union of all clusters covers every skill` | Surface-clusters definition vs commands/gsd/ contents drift. |

## Bucket C — Orphan-test discoverability (the original scope)

`scripts/run-tests.cjs:12` uses non-recursive `readdirSync('tests')`, so 4 test files
are never collected by `npm test`. All 4 pass individually:

```
tests/scripts/allowlist-parser.test.cjs        9/9 pass
tests/scripts/audit-id-namespace.test.cjs     12/12 pass
tests/scripts/audit-workflow-raw-git.test.cjs  7/7 pass
tests/scripts/migr-06-close-gate.test.cjs      1/1 pass
```

**Fix:** one-line change — `readdirSync(testDir, { recursive: true })`. Rescues all 4
at once. No newly-discovered failures expected (verified each passes standalone).

Already tracked in `.planning/phases/13-…/13-VALIDATION.md` Manual-Only #2 (escalated
from the previous `/gsd-validate-phase 13` audit).

## Bucket D — skip-count regression (+4 vs baseline)

`node scripts/check-skip-count.cjs` exits 1: 22 skip markers vs 18 baseline.
Per-file source-scan:
```
sdk/src/vcs/__tests__/cmd-parallel-max-concurrency-adapter.test.ts (2)
sdk/src/vcs/__tests__/cmd-workspace-assert-dispatched-cwd.test.ts (2)
tests/codex-config.test.cjs                                       (2)
tests/verify-test-quality.test.cjs                                (16)
```
Documented in `.planning/phases/13-…/deferred-items.md` as pre-existing Phase 10/11
branch debt; Phase 13's two new files add zero net skips.

## Recommended sequencing if the user wants to keep "all pass" as a real goal

1. **Bucket C** (1-line fix) — make orphans reachable. Single quick task. ~5 min.
2. **Bucket B (cheap subset)** — INVENTORY regen, CONFIGURATION.md regen,
   description-budget fix, prompt-injection allowlist for `new-project.md`,
   surface-clusters refresh. Single phase, doc-only. ~30-60 min.
3. **Bucket B (commit-hash surface)** — investigate adapter-return-shape drift.
   Could be a real port bug or a deliberate API change; either way needs design
   work. Phase-sized.
4. **Bucket B (changeset, code-review, registry)** — case-by-case after #1-#3.
5. **Bucket A** — strategic decision: delete the legacy worktree tests vs migrate
   them. Multi-phase if migrating; single phase if deleting. Coordinate with
   upstream-merge cadence.

## What this triage round did NOT do

- No source code modified.
- No tests modified or deleted.
- No commits (beyond the triage doc itself).
- No call to `gsd-planner` / `gsd-executor` — this was a diagnostic probe per
  user's "Probe-first" answer.

---

*Probe completed: 2026-05-23. Awaiting user scope decision before any fix work.*
