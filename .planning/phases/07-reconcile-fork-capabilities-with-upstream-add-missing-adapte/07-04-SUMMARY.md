---
phase: 07-reconcile-fork-capabilities-with-upstream-add-missing-adapte
plan: 04
subsystem: changeset
tags:
  - changeset
  - cross-backend-migration
  - lint-allowlist
  - phase-7
  - wave-3
  - readBlob-first-consumer
dependencies:
  requires:
    - "Plan 07-01 (VCS-15 readBlob + DiffFilter / DiffOpts.paths surface)"
  provides:
    - "Cross-backend github-release-notes.cjs — no raw git, no inline lint exception"
    - "First production consumer of vcs.refs.readBlob (VCS-15)"
  affects:
    - "scripts/lint-vcs-no-raw-git.cjs allowlist surface (one fewer inline annotation in the tree)"
tech-stack:
  added: []
  patterns:
    - "Lazy adapter cache (Phase 1 helpers.cjs pattern): adapterCache Map keyed by repo path; first call constructs, subsequent calls reuse"
    - "Backend-translator factory choice: expr.bookmark for tag/branch names (refname-shape), expr.rev for hex-SHA/change_id (commit-shape)"
key-files:
  created: []
  modified:
    - "scripts/changeset/github-release-notes.cjs"
decisions:
  - "Plan 07-04: D-17 honored — github-release-notes.cjs migrates to the cross-backend surface (vcs.refs.exists / vcs.diff / vcs.refs.readBlob), NOT vcs.gitOnly.*. Stays upstream-mergeable per D-18."
  - "Plan 07-04: [Rule 1 fold-in] Replaced plan's expr.rev(ref) pseudocode with expr.bookmark(ref). The script's input domain is git refnames (tags like v1.0.0, branches like main), not hex-SHA / change_id strings. expr.rev's runtime validator rejects refname-shaped inputs; expr.bookmark routes through validateBookmarkName which is a strict superset of the script's pre-existing in-script regex /^[A-Za-z0-9._/-]+$/."
metrics:
  duration: "~10m"
  tasks: 1
  files: 1
  date: 2026-05-14
---

# Phase 07 Plan 04: Migrate github-release-notes.cjs to cross-backend VcsAdapter Summary

## One-Liner

Migrated `scripts/changeset/github-release-notes.cjs` from `cp.execFileSync('git', ...)` to the cross-backend `VcsAdapter` surface — three call sites (validateGitRef → `vcs.refs.exists`, changedFragmentPaths → `vcs.diff` with `expr.range`, readFileAtRef → `vcs.refs.readBlob`); inline `vcs-lint:allow-git-here` annotation and stale `jj-port` JSDoc dropped along with the `runGit` helper; first production consumer of Plan 07-01's VCS-15 `readBlob` landed; MIGR-05 closed.

## What Was Built

### Task 1 — github-release-notes.cjs cross-backend migration (`refactor(07-04)`, commit `33a1ca8a7e72`)

**Before (203 lines)** — the file held a `runGit(repo, args)` helper at lines 32-42 with three call sites:

| Call site | Raw-git invocation | Purpose |
|-----------|--------------------|---------|
| `validateGitRef` (L56) | `git rev-parse --verify <ref>^{commit}` | Confirm a user-supplied ref resolves |
| `changedFragmentPaths` (L63) | `git diff --name-only A..B -- .changeset` | Enumerate changed fragments in a range |
| `readFileAtRef` (L71) | `git show <ref>:<file>` | Read fragment content at a specific ref |

The helper carried a `// vcs-lint:allow-git-here dev-only changeset tooling` annotation and a jj-port JSDoc comment saying "Migrate to createVcsAdapter().refs.exists / .diff when/if the fork starts producing its own release notes." Phase 7 D-18 reframes that policy: the fork preserves upstream-mergeability by migrating in place rather than deleting.

**After (212 lines, +9 net for the lazy-adapter helper and comment block)**:

```javascript
const { createVcsAdapter, expr } = require('../../sdk/dist-cjs/vcs/index.js');

const adapterCache = new Map();
function getVcs(repo) {
  let vcs = adapterCache.get(repo);
  if (!vcs) {
    vcs = createVcsAdapter(repo, {});
    adapterCache.set(repo, vcs);
  }
  return vcs;
}
```

The three call sites now read:

| Function | New body |
|----------|----------|
| `validateGitRef` | `if (!vcs.refs.exists(expr.bookmark(ref))) throw ...does not resolve` (after the existing string-hygiene checks, which are PRESERVED) |
| `changedFragmentPaths` | `vcs.diff({ rev: expr.range(expr.bookmark(from), expr.bookmark(to)), nameOnly: true, paths: ['.changeset'] })` + the existing `^.changeset/[^/]+\.md$` regex filter |
| `readFileAtRef` | `return vcs.refs.readBlob(expr.bookmark(ref), file);` |

All other functions (`loadFragmentsFromRange`, `buildGithubReleaseNotesIr`, `classifyGroup`, `formatBullet`, `compareUrl`, `serializeGithubReleaseNotes`, `renderGithubReleaseNotes`, the exports object) are byte-identical to the pre-migration state.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Plan pseudocode `expr.rev(ref)` rejects refname-shaped inputs at runtime — must be `expr.bookmark(ref)`**

- **Found during:** Task 1 end-to-end verification (driving `renderGithubReleaseNotes` against a tag-range fixture).
- **Issue:** The plan's task body (07-04-PLAN.md lines 171-196) specified `expr.rev(ref)` in all three call sites. `expr.rev` is `sdk/src/vcs/expr.ts`'s factory for hex-SHA or change_id strings — its runtime validator is `SHA_OR_CHANGE_ID_RE = /^[0-9a-fA-F]{4,40}$|^[k-z]{4,40}$/`. Passing a tag name like `v1.0.0` throws `expr.rev: not a hex-SHA or change-id shaped string`. Every realistic input to this script (release tags, branch names, sometimes commit-ish range descriptors) is refname-shaped, not SHA-shaped.
- **Fix:** Replaced all three `expr.rev(...)` call sites with `expr.bookmark(...)`. `expr.bookmark` routes through `validateBookmarkName` (the Phase 4 D-24 / cr-01 unified refname validator), which enforces a STRICTER superset of the script's existing in-file regex `/^[A-Za-z0-9._/-]+$/` — adapter-side validation rejects: control bytes, space, `~^:?*[\\`, leading `-`, leading `.`, trailing `/`, trailing `.lock`, `..` anywhere, `@{` anywhere. The script's own pre-existing string-hygiene block (rejecting leading `-`, `..`, `//`, anything outside `[A-Za-z0-9._/-]`) is PRESERVED unchanged as a first-pass cheap reject — defense in depth.
- **Files modified:** `scripts/changeset/github-release-notes.cjs` (3 substitutions, all on the new code introduced in this commit).
- **Commit:** `33a1ca8a7e72` (folded into the Task 1 migration commit because the bug existed only inside the new code path I was writing — there was no clean prior commit to apply the fix on top of).
- **Verification:** Built an ephemeral git repo with `v1.0.0`/`v1.0.1` tags and a `.changeset/fix-install.md` fragment. `loadFragmentsFromRange` returns the fragment with `failures: []`; `renderGithubReleaseNotes` returns `ok: true` with a `## Fixed` section; `validateGitRef` on `--help` throws `Invalid git ref` (string-hygiene path); `validateGitRef` on a non-existent ref throws `does not resolve` (adapter-existence path).
- **Plan-acceptance impact:** the original plan had `grep -c "expr.rev" >= 3` as an acceptance criterion. That criterion no longer matches (the file now contains 0 `expr.rev` references and 3 `expr.bookmark` lines, totalling 4 actual `expr.bookmark` calls). The criterion's INTENT (each VCS call site uses a typed RevisionExpr factory rather than a raw string) is fully met. Note here so a future reader of the plan + summary diff understands why the literal grep would fail today.
- **Scope justification:** Inside-scope correctness fix — the migration was non-functional without it. Rule 1 (auto-fix bugs) per execute-plan flow.

### No-fix deferred items

None within scope. One environmental note tracked below.

### Environmental note (NOT a Plan 07-04 deviation)

`tests/changeset-github-release-notes.test.cjs` cannot run end-to-end in the current local environment because the test fixture (`createTaggedRepo`) calls `git commit` in a brand-new repo that inherits the user's global git config requiring GPG signing. 4 of 5 tests fail at the fixture step (`git commit -q -m "initial"` → exit 128 `gpg: signing failed: No secret key`) — they never reach the migrated module's code paths. The 1 test that runs (`validates PR metadata and repo slug before serializing release notes`, which doesn't touch a repo) passes.

This is a pre-existing testing-environment gap, NOT caused by Plan 07-04 (the test fixture's raw-git `cp.spawnSync('git', ...)` calls at lines 34-46 are unchanged from before the migration and live under the `tests/**/*.test.cjs` lint allowlist glob). The migration's correctness was verified end-to-end via a side fixture that disables GPG signing (see "Fix" verification block above). Documented here for the verifier so it isn't conflated with migration regression.

If a future plan tightens the fixture (`git -c commit.gpgsign=false -c tag.gpgsign=false init` + matching local config) the existing 5 tests will exercise the migrated paths automatically — no code changes needed in `github-release-notes.cjs`.

## Verification Snapshot

```
$ node -e "const m = require('./scripts/changeset/github-release-notes.cjs'); console.log(Object.keys(m).sort().join(','));"
buildGithubReleaseNotesIr,changedFragmentPaths,classifyGroup,loadFragmentsFromRange,renderGithubReleaseNotes,serializeGithubReleaseNotes,validateGitRef

$ grep -cE "cp\.execFileSync|runGit|vcs-lint:allow-git-here" scripts/changeset/github-release-notes.cjs
0

$ grep -cE "createVcsAdapter|vcs\.refs\.exists|vcs\.diff|vcs\.refs\.readBlob" scripts/changeset/github-release-notes.cjs
5

$ grep -c "expr.range" scripts/changeset/github-release-notes.cjs
1

$ grep -n "expr.bookmark" scripts/changeset/github-release-notes.cjs
59:  if (!vcs.refs.exists(expr.bookmark(ref))) {
70:    rev: expr.range(expr.bookmark(from), expr.bookmark(to)),
80:  return vcs.refs.readBlob(expr.bookmark(ref), file);
# 4 calls across 3 lines

$ node scripts/lint-vcs-no-raw-git.cjs
ok lint-vcs-no-raw-git: 1060 files scanned in /Users/LoganDark/Documents/Projects/get-shit-done, 0 violations

$ grep -n "github-release-notes" scripts/lint-vcs-no-raw-git.cjs
# (empty — no allowlist entry present, no inline annotation in the file)
```

End-to-end smoke (ephemeral git repo with tags + a `.changeset/*.md` fragment, GPG signing disabled at fixture-init time):

```
failures: []
fragments: [{"slug":"fix-install","type":"Fixed","pr":101}]
ok: true
body-first-line: ## Fixed
rejects bad ref: true        # validateGitRef('--help') → Invalid git ref
rejects missing ref: true    # validateGitRef('nonexistent') → does not resolve
```

## Acceptance Criteria — Final State

| Criterion (from 07-04-PLAN.md) | Status |
|-------------------------------|--------|
| `node -e "require('./scripts/changeset/github-release-notes.cjs')"` exits 0 | PASS |
| `grep -c "cp.execFileSync" ...` returns 0 | PASS (0) |
| `grep -c "runGit" ...` returns 0 | PASS (0) |
| `grep -c "vcs-lint:allow-git-here" ...` returns 0 | PASS (0) |
| `grep -c "createVcsAdapter" ...` returns >= 1 | PASS (1) |
| `grep -c "vcs.refs.exists" ...` returns >= 1 | PASS (1) |
| `grep -c "vcs.diff" ...` returns >= 1 | PASS (1) |
| `grep -c "vcs.refs.readBlob" ...` returns >= 1 | PASS (1) |
| `grep -c "expr.range" ...` returns >= 1 | PASS (1) |
| `grep -c "expr.rev" ...` returns >= 3 | **N/A — see Rule 1 deviation.** Replaced with `expr.bookmark` (4 calls across 3 lines); intent (typed RevisionExpr factory at every VCS call site) is met. |
| `node scripts/lint-vcs-no-raw-git.cjs` exits 0 | PASS (1060 files, 0 violations) |
| `grep -c "github-release-notes" scripts/lint-vcs-no-raw-git.cjs` returns 0 | PASS (allowlist mechanism is inline-annotation-only; no JSON entry existed and none added) |
| All 7 exported functions present | PASS (`buildGithubReleaseNotesIr,changedFragmentPaths,classifyGroup,loadFragmentsFromRange,renderGithubReleaseNotes,serializeGithubReleaseNotes,validateGitRef`) |

## Threat Surface Scan

No new threat-relevant surfaces beyond the `<threat_model>` declared in 07-04-PLAN.md.

- **T-07.04-01 (refname injection):** mitigated by the script's existing string-hygiene block (first-pass cheap reject) AND `validateBookmarkName` inside `expr.bookmark` (adapter-side strict refname rules). The Rule 1 fold-in actually STRENGTHENED this mitigation — the original plan would have routed through `expr.rev`'s SHA-shape validator only, which is permissive about characters as long as they're hex; `expr.bookmark`'s validator rejects spaces, control bytes, `~^:?*[\\`, leading `-/.`, and `@{`.
- **T-07.04-02 (path injection via readBlob):** unchanged from plan disposition (accept; same as upstream behavior).
- **T-07.04-03 (info disclosure):** unchanged (accept).
- **T-07.04-SC (supply-chain via relative require):** unchanged (accept; in-tree `../../sdk/dist-cjs/vcs/index.js`).

## Hand-off Notes

1. **First production consumer of VCS-15 `readBlob` is live.** Plan 07-01's planner-judgment fold-in of `readBlob` paid off here — without it, this plan would have needed a `vcs.gitOnly.show(ref, file)` escape hatch or a Phase 7.1 INSERTED for the show-blob verb. The migration code path (`vcs.refs.readBlob(expr.bookmark(toRef), '.changeset/<slug>.md')`) is exercised end-to-end in the verification snapshot.

2. **Canonical example of "migrate dev tooling to adapter per D-17/D-18".** Future similar migrations (any dev script with `cp.execFileSync('git', ...)` + an inline lint annotation) should follow this shape: lazy `adapterCache` Map keyed by repo path; pick the correct `expr.*` factory based on the input domain (hex/change_id → `expr.rev`, named ref → `expr.bookmark`); preserve every existing string-hygiene check as first-pass defense in depth.

3. **`expr.rev` vs `expr.bookmark` runbook addition.** The Rule 1 bug surfaced an ergonomic gap worth documenting: plan authors writing pseudocode for adapter consumers must distinguish input domain. Existing plans / patterns in `07-PATTERNS.md` reference both factories generically; future plan templates could call this out explicitly. Captured in 07-04 SUMMARY for the verifier's pattern-extraction sweep.

4. **`scripts/lint-vcs-no-raw-git.cjs` is now github-release-notes-clean repo-wide.** Both the inline annotation and any latent JSON-allowlist entry are absent. The 1060-file scan at 0 violations represents the post-Plan-07-04 baseline.

5. **`tests/changeset-github-release-notes.test.cjs` does not require modification.** The migration preserves the module's exported function signatures byte-for-byte (`loadFragmentsFromRange`, `buildGithubReleaseNotesIr`, `serializeGithubReleaseNotes`, `renderGithubReleaseNotes`, `validateGitRef` — all unchanged externally). The environmental GPG-signing failure noted above is a pre-existing fixture issue, NOT a migration-correctness issue. A future plan may want to harden the fixture (`git -c commit.gpgsign=false init` + matching local config) but that's out of scope here.

## Self-Check: PASSED

- [x] `scripts/changeset/github-release-notes.cjs` modified — FOUND (verified via `Read` post-edit; 212 lines; 0 raw-git remnants; 5 adapter callsites including the import; `runGit` helper + jj-port JSDoc + inline annotation all gone).
- [x] Commit `33a1ca8a7e72` (Task 1 — migration + Rule 1 fold-in) — FOUND (`gsd-sdk query commit` returned the hash; staged file was exactly `scripts/changeset/github-release-notes.cjs`).
- [x] `node scripts/lint-vcs-no-raw-git.cjs` exits 0 (1060 files, 0 violations) — verified in this Summary's verification snapshot.
- [x] End-to-end fixture exercise (load → render → validate-bad-ref → validate-missing-ref) returns the expected outputs — verified in this Summary's verification snapshot.
- [x] MIGR-05 closed at the code level (verifier will close the requirement at the REQUIREMENTS.md level per phase plumbing — this plan is instructed NOT to update STATE.md / ROADMAP.md).
