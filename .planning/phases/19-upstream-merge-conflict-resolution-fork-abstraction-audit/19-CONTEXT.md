# Phase 19: Upstream merge conflict resolution + fork-abstraction audit - Context

**Gathered:** 2026-06-10
**Status:** Ready for planning
**Source:** Operator instructions (captured verbatim from the phase-initiating request; no discuss-phase session needed)

<domain>
## Phase Boundary

The merge change `vpzlrrlv` (36c417ee) merges upstream main `03764dbc` ("Merge pull request #940 from open-gsd/hotfix/1.4.3", 2026-06-09) into fork main `c7bd6bee` ("fix(research-synthesizer): edit pre-seeded SUMMARY.md instead of Write", 2026-05-29). It carries ~76 two-sided conflicts after ~2 weeks of upstream drift (upstream releases 1.4.0 → 1.4.3 landed in that window).

This phase delivers, in strict priority order:

1. **0 conflicts, functional code.** Every conflict resolved in the working copy on top of `vpzlrrlv`; SDK compiles (`tsc --noEmit` + dist-cjs emit); every hand-edited `.cjs` file passes `node -c`; test suite green on both backends; fork lint gates green (`lint-vcs-no-raw-git`, `lint-vcs-no-commit-id`, `audit-workflow-raw-git` baseline).
2. **Extensive audit of newly introduced upstream code.** Every upstream change that landed unabstracted gets migrated to the fork's abstractions: raw `git` invocations → `vcs.*` adapter verbs; commit_id/SHA assumptions → unified revision model (`LogEntry.id`, jj backend never volunteers commit_id); raw worktree dispatch logic → `vcs.workspace.parallel.*`; hook firing → `.githooks/<stage>` bridge. This covers not just conflicted files but ALL upstream-introduced code in the merge (clean-merged files can still carry unabstracted upstream code).

Out of scope: updating the locally installed GSD copy (`gsd-sdk` currently resolves against the sibling `get-shit-done` checkout, not this workspace). That happens only after this workspace is fully resolved, building, and abstraction-clean.

</domain>

<decisions>
## Implementation Decisions

### VCS discipline (jj, this is a jj-only fork repo)
- All resolution work happens in the working copy on top of merge change `vpzlrrlv`, in workspace `get-shit-done-2`.
- Normal GSD per-task commits on top of the merge are fine; the operator squashes the stack into the merge change at the end.
- NEVER rewrite, squash into, abandon, or rebase `vpzlrrlv` itself or anything below it. No bookmark moves. No `jj op restore`/`undo`.
- Use `jj` only, never raw `git`, for VCS operations during execution (fork convention; also the working copy is the merge resolution itself — git would not see jj's conflict state).
- `jj diff --git` for all diff inspection (ANSI stripping loses diff info otherwise).

### Resolution policy
- Neither side wins by default. The fork side carries the v1.0–v1.4 abstraction work (VcsAdapter, unified revision model, parallel verbs, .githooks); the upstream side carries 1.4.0–1.4.3 features and fixes. The goal is upstream features expressed through fork abstractions.
- For "2-sided conflict including 1 deletion" files: determine WHICH side deleted and WHY before resolving (rename/move vs genuine delete). The repo root contains `sdk/`, `gsd-core/`, and `src/` trees — an upstream restructure is suspected and must be mapped first. Blind "take the existing file" resolutions are forbidden.
- Don't silently drop upstream features during resolution. If an upstream feature is dropped deliberately, every reference to it (changesets, docs, release notes, tests) must be removed in the same plan, and the drop recorded in the phase SUMMARY (lesson from MERGE-REVIEW-upstream-2026-05-25.md BLOCKER-2, `--respect-staged`).
- Don't sever CLI dispatch chains: if a `gsd-tools.cjs` case or SDK `spawnSync` target changes shape on either side, verify the full chain end-to-end (lesson from BLOCKER-3, `worktree.reap-orphans`).

### Verification gates (priority 1 acceptance)
*(Note: the concrete commands below were written against the fork layout; with upstream layout adopted, the equivalents are re-derived for upstream's build — `src/*.cts` compile, upstream's test runner layout, re-pointed fork lint gates. RESEARCH.md pass 2 establishes the exact command set; the INVARIANTS behind each gate are what's locked.)*
- `jj st` reports zero unresolved conflict paths AND zero conflict markers in tracked text files (`rg '<<<<<<<|%%%%%%%|>>>>>>>'` clean, excluding fixtures that legitimately contain markers).
- `node -c` passes on EVERY hand-edited `.cjs` file (SDK lint does not parse CJS — lesson from BLOCKER-1).
- `pnpm -F sdk exec tsc --noEmit` clean; dist-cjs build emits.
- `pnpm -F sdk run check:configuration-fresh` (or current equivalent) passes — generated files must not be stale.
- Test suite green on both backends (`node scripts/run-tests.cjs` / vitest per current layout); skip-count baseline respected (`scripts/check-skip-count.cjs`).
- Fork lint gates green: `scripts/lint-vcs-no-commit-id.cjs`, `lint-vcs-no-raw-git` allowlist unchanged (+0 entries unless justified), `scripts/audit-workflow-raw-git.cjs` baseline not exceeded.

### Audit policy (priority 2 acceptance)
- Audit scope = the full upstream delta (`jj diff --git --from c7bd6bee --to 03764dbc` view of what upstream introduced), not just the conflicted files.
- Every new upstream raw-git call site, commit_id/SHA assumption, worktree-only code path, and direct `.git/hooks` reference is either migrated to the fork abstraction or recorded with an explicit justification (adapter-internal substrate is the only legitimate category, mirroring the existing allowlist reasoning).
- Audit findings and dispositions are recorded in a phase artifact (e.g. `19-MERGE-AUDIT.md`) so the next upstream pull has the same precedent MERGE-REVIEW-upstream-2026-05-25.md provided for this one.

### Resolution strategy (LOCKED 2026-06-10, operator decision — supersedes the researcher's Option A recommendation)
- **Upstream layout is canonical: follow the renames and restructure as much as possible so future upstream pulls stay cheap.** Upstream's restructure IS adopted: SDK retirement (their ADR-0174), `get-shit-done/` → `gsd-core/` rename, `src/*.cts` rewrite (built at publish per their ADR-457), upstream test layout, upstream packaging shape. The fork's ONLY durable divergence is the VCS abstraction that enables jj support — everything else converges to upstream.
- **The fork's VCS layer is PORTED INTO upstream's new architecture** (operator-confirmed): `sdk/src/vcs/` (VcsAdapter contract, jj + git backends, unified revision model, `workspace.parallel.*`, `.githooks` bridge — 99 files, survived the merge intact) is re-expressed as `src/vcs/*.cts` modules (or the closest idiomatic equivalent in upstream's build), and upstream's raw-git call sites (~5 exec sites in `src/*.cts`, concentrated in `worktree-base-ref.cts` + `worktree-safety.cts`, plus the 16 commit_id/SHA sites) are migrated to route through it. The port is a relocation + call-site migration of already-written fork code, not a rewrite — but jj-support invariants (unified revision model, no commit_id from jj backend, `.githooks` firing) must survive translation.
- **Conflict resolution direction flips: upstream side wins at tree level.** Delete/modify conflicts on moved files resolve upstream-side (the file's new home is the counterpart in `gsd-core/` or `src/`); fork semantic content (jj support, workflow VCS rewiring) is re-applied at the counterpart location. The 652 silently-deleted fork files mostly STAY deleted — exceptions are (a) the vcs layer being ported, (b) fork tests guarding jj behavior, ported to upstream's test layout, (c) `.planning/` and fork-meta files. Every disposition recorded in `19-MERGE-AUDIT.md`.
- **Workflow markdown converges to upstream** (`gsd-core/workflows/*.md` upstream versions), then the fork's VCS rewiring (cross-backend verb calls replacing raw-git fences) is re-applied as a minimal, well-marked delta on top. The CLI surface the workflows call for VCS verbs must exist in upstream's architecture (port the needed command bridges into `src/*.cts`).
- **Fork lint gates survive and are re-pointed at the new tree** (scan roots/allowlists updated from `get-shit-done/`+`sdk/` paths to `gsd-core/`+`src/` paths); baselines re-derived for the new layout with line-by-line rationale in the ledger, never silently.
- **Upstream-only `.github/workflows/` org-automation (9 files): drop, ledger** (they reference OpenGSD org secrets/bots; not applicable to the fork repo). Upstream CI that tests the code itself: adopt, re-pointed at fork reality.
- **Fork identity (operator decision 2026-06-10, supersedes the earlier redux-identity bullet): MIRROR upstream identity.** Root package.json takes upstream's `@opengsd/gsd-core` name, their version line (1.4.3), and their bin/command names. Cheapest future pulls; the fork is distinguished by its jj support, not its package metadata. The prior `@opengsd/get-shit-done-redux` naming in docs converges to upstream naming as docs resolve.
- **Package manager (operator decision 2026-06-10): pnpm.** Single-package manifest mirroring upstream's npm shape (no workspaces), but pnpm-lock.yaml is the lockfile (`packageManager` field pinned); `package-lock.json` is dropped. CI install steps adjusted accordingly. This is a small, known, permanent divergence recorded in the ledger.
- **Packaging resolves BEFORE any dependency install** (Pitfall 6): resolve package.json to upstream shape + decisions above, vet upstream dep additions (incl. optional `fallow`), then single `pnpm install`.
- **Researcher-recommendation adoptions (Q3–Q5, 2026-06-10):** (a) vitest is REVIVED for the ported jj/vcs test suite (upstream's root vitest.config.ts is dead config pointing at deleted ./sdk — re-point it at the ported suite); (b) upstream `cmdCommit` internals are routed through the ported VcsAdapter (no parallel fork verb); (c) fork doc-parity/drift-count tests are dropped + ledgered rather than re-derived against upstream docs (re-derivation is a future-phase candidate).
- **Lint-scanner `.cts` gap (researcher booby-trap finding) is in scope:** both fork lint scanners exclude `.cts` from SCAN_EXT — they MUST be extended to scan `.cts`/`.cjs` in the adopted tree or the gates pass vacuously green. Likewise the workflow launcher snippet's `git rev-parse --show-toplevel || pwd` repo-root resolution is jj-hostile — fix the snippet source and re-sync via `scripts/sync-runtime-launcher.cjs` (not 108 hand edits).
- **Rollout artifacts** (`next-branch-files.tar.gz`, `rollout-next-phase*.sh`): investigate what upstream intends them for; default drop + ledger unless they're load-bearing for the new build.

### Claude's Discretion
- Plan decomposition (how to batch the ~76 files into waves; suggested batching: by subsystem — sdk/src/query, sdk/src vcs-adjacent, get-shit-done/bin/lib CJS, workflows markdown, docs/translations, packaging/CI).
- Whether docs/translation conflicts are resolved mechanically (upstream-preferred) vs carefully (fork-preferred) — fork-specific docs content (jj port, redux rename) must survive either way.
- Test triage order and how to handle pre-existing upstream test failures unrelated to the merge.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Prior merge precedent (the single most important reference)
- `.planning/MERGE-REVIEW-upstream-2026-05-25.md` — blockers/warnings from the previous upstream merge: CJS parse breakage, silently dropped features, severed gsd-tools dispatch, stale generated files, raw-git probe annotations.

### Fork abstraction surface
- `sdk/src/vcs/types.ts` — VcsAdapter contract (the abstraction upstream code must be migrated to)
- `sdk/src/vcs/backends/jj.ts`, `sdk/src/vcs/backends/git.ts` — backend implementations incl. `.githooks` firing
- `sdk/src/vcs/jj/parallel.ts`, `sdk/src/vcs/git/parallel.ts` — `workspace.parallel.*` dispatch/fan-in/cancel
- `.planning/PROJECT.md` — fork invariants and key decisions table

### Fork invariant enforcement (must stay green)
- `scripts/lint-vcs-no-commit-id.cjs`
- `scripts/audit-workflow-raw-git.cjs` (frozen 127-hit baseline)
- `scripts/lint-vcs-parallel-call-presence.cjs`
- `lint-vcs-no-raw-git.allow.json` (24 entries; net diff must be justified)
- `scripts/check-skip-count.cjs`

</canonical_refs>

<specifics>
## Specific Ideas

- Merge topology: `jj log -r 'parents(vpzlrrlv)'` → fork side `ltzkoolv`/c7bd6bee, upstream side `lxylrmpm`/03764dbc. Merge base ≈ the fork's last upstream sync (`kstktxkq` "merge from upstream" lineage, 2026-05-25).
- Conflict inventory (from `jj st`, 76 paths): `sdk/src/query/*.ts` (~25 files, most "including 1 deletion"), `sdk/src/*.ts` + sdk packaging (~10), `get-shit-done/bin/gsd-tools.cjs` + `bin/lib/*.cjs` (~10, all "including 1 deletion"), `get-shit-done/workflows/*.md` (10, all "including 1 deletion"), `get-shit-done/templates/config.json`, docs/READMEs/translations (~12), `.github/` CI (2), `package.json` / `package-lock.json`, `tests/` (3), `scripts/changeset/github-release-notes.cjs`, `agents/gsd-research-synthesizer.md`.
- The pervasive "including 1 deletion" pattern + new root dirs (`gsd-core/`, `src/`, `pnpm-workspace.yaml`) strongly suggests one side moved/restructured these trees. Map the restructure FIRST (e.g. `jj log` + `jj diff --git -r 03764dbc --from <merge-base> --summary` style queries) — resolution strategy depends on it.
- `next-branch-files.tar.gz`, `rollout-next-phase1.sh`, `rollout-next-phase2.sh` at repo root look like upstream "next branch" rollout artifacts — investigate whether they belong in the resolved tree.
- The previous merge review found the SDK `dev` script and `run-tests.cjs` suite-selection warnings — check whether those carried forward.

</specifics>

<deferred>
## Deferred Ideas

- Updating the locally installed GSD copy / the sibling `get-shit-done` checkout (explicitly after this phase proves out).
- Squashing the resolution stack into `vpzlrrlv` (operator action at the end).
- Any v1.5-scope feature work surfaced by the audit that is not required for 0-conflicts + abstraction parity (file as todos/deferred items instead).

</deferred>

---

*Phase: 19-upstream-merge-conflict-resolution-fork-abstraction-audit*
*Context gathered: 2026-06-10 from operator instructions*
