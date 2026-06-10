# Phase 19: Upstream merge conflict resolution + fork-abstraction audit - Research

**Researched:** 2026-06-10 (pass 1), revised 2026-06-10 (pass 2)
**Domain:** jj merge-conflict resolution across a repo-level upstream restructure; porting the fork's VcsAdapter layer into upstream's new `src/*.cts` architecture
**Confidence:** HIGH (every topology/inventory/architecture claim below was verified by read-only `jj`/`rg` commands against this repo in this session)

> **Pass 2 (2026-06-10): revised for operator-locked upstream-adoption strategy; supersedes pass-1 Option A recommendation.** Pass-1 topology, tree-shape, and silent-deletion inventories were re-verified and stand. Strategy-dependent sections (Buckets, Wave 0, Pitfalls, Open Questions, Validation Architecture) are fully rewritten; new sections cover upstream's architecture, the raw-git seam inventory, the fork→upstream porting map, test porting, and lint-gate re-pointing. The authoritative conflict count this session is **75 paths** (`jj resolve --list`; pass-1's "76" is superseded).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### VCS discipline (jj, this is a jj-only fork repo)
- All resolution work happens in the working copy on top of merge change `vpzlrrlv`, in workspace `get-shit-done-2`.
- Normal GSD per-task commits on top of the merge are fine; the operator squashes the stack into the merge change at the end.
- NEVER rewrite, squash into, abandon, or rebase `vpzlrrlv` itself or anything below it. No bookmark moves. No `jj op restore`/`undo`.
- Use `jj` only, never raw `git`, for VCS operations during execution.
- `jj diff --git` for all diff inspection.

#### Resolution policy
- Neither side wins by default at the SEMANTIC level. The goal is upstream features expressed through fork abstractions.
- For "2-sided conflict including 1 deletion" files: determine WHICH side deleted and WHY before resolving. Blind "take the existing file" resolutions are forbidden.
- Don't silently drop upstream features during resolution; deliberate drops take all references with them and are recorded.
- Don't sever CLI dispatch chains; verify full chains end-to-end (MERGE-REVIEW BLOCKER-3 lesson).

#### Verification gates (priority 1 acceptance)
*(CONTEXT.md note: the original commands were written against the fork layout; with upstream layout adopted, equivalents are re-derived for upstream's build. The INVARIANTS are locked; this document establishes the exact command set — see §Validation Architecture.)*
- `jj st` reports zero unresolved conflict paths AND zero conflict markers in tracked text files (fixture exclusions allowed).
- `node -c` passes on EVERY hand-edited `.cjs` file.
- TypeScript compile clean; CJS artifacts emit (upstream equivalent: `tsc -p tsconfig.build.json`).
- Generated files not stale (upstream equivalent: identity/alias drift checks).
- Test suite green on both backends; skip-count baseline respected.
- Fork lint gates green: `lint-vcs-no-commit-id`, `lint-vcs-no-raw-git` (allowlist Δ justified), `audit-workflow-raw-git` baseline not exceeded (re-derived for the new tree).

#### Audit policy (priority 2 acceptance)
- Audit scope = the full upstream delta, not just conflicted files.
- Every new upstream raw-git call site, commit_id/SHA assumption, worktree-only code path, and direct `.git/hooks` reference is either migrated to the fork abstraction or recorded with explicit justification.
- Findings and dispositions recorded in `19-MERGE-AUDIT.md`.

#### Resolution strategy (LOCKED 2026-06-10, operator decision — supersedes pass-1 Option A)
- **Upstream layout is canonical.** SDK retirement (their ADR-0174), `get-shit-done/` → `gsd-core/`, `src/*.cts` rewrite built at publish (their ADR-457), upstream test layout, upstream packaging shape are all ADOPTED. The fork's only durable divergence is the VCS abstraction enabling jj support.
- **The fork's VCS layer is PORTED INTO upstream's architecture:** `sdk/src/vcs/` (99 files, survived the merge intact) re-expressed as `src/vcs/*.cts`; upstream raw-git call sites migrated to route through it. Relocation + call-site migration, not a rewrite — but jj-support invariants (unified revision model, no commit_id from jj backend, `.githooks` firing) must survive translation.
- **Conflict resolution direction flips: upstream side wins at tree level.** Delete/modify conflicts on moved files resolve upstream-side; fork semantic content re-applied at counterpart locations. The 652 silently-deleted fork files mostly STAY deleted — exceptions: (a) the vcs layer being ported, (b) fork jj-behavior tests ported to upstream's test layout, (c) `.planning/` and fork-meta files. Every disposition in `19-MERGE-AUDIT.md`.
- **Workflow markdown converges to upstream**, then the fork's VCS rewiring re-applied as a minimal, well-marked delta. The CLI surface the workflows call for VCS verbs must exist in upstream's architecture.
- **Fork lint gates survive and are re-pointed**; baselines re-derived with line-by-line rationale, never silently.
- **Upstream-only org-automation CI (9 files): drop, ledger.** Upstream CI that tests the code: adopt, re-pointed at fork reality.
- **Fork identity stays** (`@opengsd/get-shit-done-redux` lineage); upstream's restarted version line recorded in the ledger.
- **Packaging resolves BEFORE any dependency install**; vet upstream dep additions (incl. optional `fallow`); single install afterward.
- **Rollout artifacts** (`next-branch-files.tar.gz`, `rollout-next-phase*.sh`): default drop + ledger unless load-bearing (verified: NOT load-bearing — upstream next-branch repo-ops staging from their #231).

### Claude's Discretion
- Plan decomposition / wave batching of the ~75 conflicted files + port chunks.
- Docs/translation conflicts mechanical (upstream-preferred) vs careful — fork-specific docs content (jj port, redux rename) must survive either way.
- Test triage order; handling pre-existing upstream test failures unrelated to the merge.

### Deferred Ideas (OUT OF SCOPE)
- Updating the locally installed GSD copy / sibling `get-shit-done` checkout.
- Squashing the resolution stack into `vpzlrrlv` (operator action).
- v1.5-scope feature work surfaced by the audit but not required for 0-conflicts + abstraction parity.
</user_constraints>

<phase_requirements>
## Phase Requirements

REQ-IDs proposed (pass-2 revision):

| ID (proposed) | Description | Research Support |
|----|-------------|------------------|
| MERGE-01 | Zero unresolved conflict paths; zero conflict markers in tracked text | §Conflict Buckets — all 75 paths classified; ~55 delete/modify conflicts now resolve as "accept upstream deletion"; ~20 need genuine merging |
| MERGE-02 | **(inverted from pass 1)** Every fork capability has a ported home or a ledger row — no silently-lost fork capability | §Silent-Deletion Inventory + §Porting Map — the `comm` sweep output becomes the ledger-completeness input, not a restore list |
| MERGE-03 | Upstream build green in-tree: `tsc -p tsconfig.build.json` emits `gsd-core/bin/lib/`; every hand-edited `.cjs` passes `node -c` | §Upstream Architecture — build chain verified; §Wave 0 |
| MERGE-04 | Tests green: upstream suite (`node scripts/run-tests.cjs`) + ported jj/vcs tests, both backends; skip-count re-baselined with justification | §Test Layout & Porting |
| MERGE-05 | Fork lint gates re-pointed at the new tree and green; allowlist/baseline deltas ledgered line-by-line | §Lint-Gate Re-pointing — exact path/extension changes enumerated |
| PORT-01 | `sdk/src/vcs/` ported as `src/vcs/*.cts` with jj invariants intact (unified revision model; jj backend never volunteers commit_id; `.githooks/<stage>` firing; `workspace.parallel.*` semantics) | §Porting Map — 36 production modules, translation rules verified mechanical (no import.meta / default exports) |
| PORT-02 | CLI bridge: workflows can call vcs verbs through `gsd_run query <verb>`; dispatch chain verified end-to-end | §Porting Map / CLI bridge — upstream `query` meta-prefix exists at gsd-tools.cjs:344 |
| AUDIT-01 | Every upstream raw-git/SHA/worktree site migrated through the ported vcs layer or justified in `19-MERGE-AUDIT.md` | §Raw-Git Seam Inventory — single `execGit` seam + 60 call sites + 5 outliers, fully enumerated |
</phase_requirements>

## Summary

Pass 1 established the topology: merge base `b533f718` (2026-05-21), ~485 upstream commits carrying three restructures (SDK retirement per their ADR-0174; `get-shit-done/`→`gsd-core/` rename; CJS→`src/*.cts` build-at-publish per their ADR-457), 75 two-sided conflicts, and 652 silently-deleted fork files. Pass 1 recommended fork-layout-canonical; **the operator rejected that and locked upstream-layout-canonical with the vcs layer ported in.**

Pass 2 verified the new strategy is cheaper than pass 1 feared, for three structural reasons. First, **upstream centralized its raw git behind a single seam**: `execGit()` in `src/shell-command-projection.cts` is the only `spawnSync('git')` in `src/` (60 call sites across 8 modules import it; only 5 outlier exec sites bypass it). Migrating upstream to the fork's VcsAdapter is therefore a bounded call-site migration, not a hunt. Second, **the fork's own CJS lib is the reference implementation**: fork `get-shit-done/bin/lib/commands.cjs` already routes the exact same operations through `createVcsAdapter` with line-annotated `// (was: <git command>)` comments mapping each migrated site — the upstream `.cts` migration replays a migration the fork already performed once. Third, **the dispatch surfaces already align**: upstream workflows call `gsd_run query <verb>` (launcher snippet → `gsd-core/bin/gsd-tools.cjs`, which accepts `query` as a meta-prefix), the same verb-naming convention as the fork's `gsd-sdk query <verb>` — and the fork's gsd-tools case list is a strict subset of upstream's, so the bridge is additive (new `vcs`-family verbs), not conflicting.

The real work concentrates in five places: (1) mechanical translation of 36 vcs production modules (~7,750 lines, verified free of ESM-only constructs) to `.cts`; (2) a CLI bridge re-expressing the fork's 23 vcs-facing SDK query handlers as gsd-tools verbs; (3) migrating upstream's 60 `execGit` sites + 5 outliers + `worktree-safety.cts`/`worktree-base-ref.cts` through the adapter (or ledgering as git-backend substrate); (4) re-applying the fork's workflow VCS rewiring onto upstream's `gsd-core/workflows/*.md` (~113 line-anchored git fences across 24 files); (5) porting ~40 jj-load-bearing fork test assets into upstream's test layout (which has NO vitest — a vitest revival or conversion decision is needed). Two booby traps found: both fork lint scanners' extension filters **exclude `.cts`** (the entire adopted tree would be invisible to the gates), and the upstream workflow launcher itself resolves the runtime root via `git rev-parse --show-toplevel` (breaks on jj-only repos).

**Primary recommendation:** Execute in strict order — packaging/identity first, upstream build green second, vcs port third, CLI bridge fourth, call-site migration fifth, workflow re-wiring sixth, test porting + gate re-pointing last — with the disposition ledger (`19-MERGE-AUDIT.md`) accumulating from Wave 0. Never rewire a workflow before its verbs exist in gsd-tools.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Conflict resolution mechanics | jj working copy (this workspace) | — | Conflicts materialize as marker text at `@`; resolving = writing marker-free content |
| Fork content recovery for porting | jj revisions (`jj file show -r c7bd6bee`) | working copy | Ported source comes from the fork parent revision, not the conflicted text |
| VCS abstraction (post-port) | `src/vcs/*.cts` → emitted `gsd-core/bin/lib/vcs/*.cjs` | `gsd-core/bin/gsd-tools.cjs` dispatch | Upstream's ADR-457 build owns compilation; gsd-tools owns CLI exposure |
| Workflow → tool dispatch | `_runtime-launcher.snippet.sh` `gsd_run()` | gsd-tools `query` meta-prefix | The single calling convention workflows use after the merge |
| Build verification | root `npm run build:lib` (`tsc -p tsconfig.build.json`) | `scripts/run-tests.cjs` self-build | run-tests.cjs builds artifacts if the sentinel is missing |
| Invariant enforcement | `scripts/lint-vcs-*.cjs`, `scripts/audit-workflow-raw-git.cjs` (re-pointed) | CI test.yml (adopted, de-org'd) | All four gate scripts survive; need path + extension re-pointing |
| Audit ledger | `.planning/phases/19-…/19-MERGE-AUDIT.md` | phase SUMMARY | Locked: every tree-level disposition recorded as precedent |

## Merge Topology (verified — unchanged from pass 1, still valid)

```
        b533f718 (wkzozmzt, 2026-05-21)  ← merge base: last common gsd-build commit
        "chore: introduce CommandRoutingHub … (#3828)"
       /                                  \
  FORK SIDE (~813 commits incl. history)   UPSTREAM SIDE (~485 commits)
  c7bd6bee (ltzkoolv, 2026-05-29)          03764dbc (lxylrmpm, 2026-06-09)
  - 05-25 merge of gsd-build main          - OpenGSD redux line (new org, new repo)
    (the MERGE-REVIEW-…05-25 merge)        - SDK retirement (ADR-0174), sdk/ deleted
  - fork v1.4 phases 14.1–17 (+15/16/18    - get-shit-done/ → gsd-core/ rename (#604)
    artifacts present on disk)             - bin/lib CJS → src/*.cts TS source (ADR-457)
  - pnpm workspace conversion              - npm: @opengsd/gsd-core, versions 1.2.0→1.4.3
       \                                  /
        vpzlrrlv 36c417ee (merge, 75 conflicts)
        └─ zrxommmz (docs: phase 19 added)
           └─ @ (working copy — resolution happens here)
```

Key commands (all verified):
- Merge base: `jj log -r 'heads(::c7bd6bee & ::03764dbc)'` → `b533f718`
- Upstream-only delta: `jj log -r '::03764dbc ~ ::c7bd6bee'` (~485 commits)
- Authoritative conflict list: `jj resolve --list` (**75 paths**, re-verified pass 2)
- Upstream delta vs base (audit scope): `jj diff --git --from b533f71857ab --to 03764dbc`

### Tree shape per side (top-level, file counts — unchanged from pass 1, still valid)

| Tree | base b533f718 | fork c7bd6bee | upstream 03764dbc | merged vpzlrrlv |
|------|---------------|---------------|-------------------|------------------|
| `sdk/` | 347 | 577 | **0 (deleted)** | 267 (survivors only) |
| `get-shit-done/` | 299 | 300 | **0 (deleted)** | **22 (survivors only)** |
| `gsd-core/` | 0 | 0 | 235 | 235 (clean upstream add) |
| `src/` | 0 | 0 | 97 (`*.cts`) | 97 (clean upstream add) |
| `tests/` | 581 | 663 | 730 | 813 (union) |
| `.changeset/` | 294 | 294 | 465 (archived fragments) | 465 |
| root | npm, package-lock | pnpm-workspace + pnpm-lock, no package-lock | npm package-lock, `next-branch-files.tar.gz`, `rollout-next-phase{1,2}.sh`, `eslint.config.mjs`, `stryker.config.mjs`, `tsconfig.build.json`, `.claude-plugin`, `gemini-extension.json`, `GEMINI.md`, `.nvmrc` | both sides' files coexist |

**Deletion-side answer:** for ALL "including 1 deletion" conflicts the deleting side is **upstream** (restructure moves, not genuine deletes), except `package-lock.json` where the deleting side is the **fork** (pnpm conversion).

**Root artifacts:** `next-branch-files.tar.gz`, `rollout-next-phase{1,2}.sh` are upstream repo-ops staging for THEIR next-branch migration (#231) — not load-bearing for the build (no package.json script or workflow references them). Disposition per locked decision: **drop + ledger**.

## Silent-Deletion Inventory (data unchanged from pass 1; consequences inverted)

`jj st` flags only modify/modify and modify/delete pairs. Fork files untouched since 2026-05-21 that upstream deleted were silently dropped. Verified counts:

| Category | Count | Pass-2 disposition under upstream-canonical |
|----------|-------|---------------------------------------------|
| `sdk/` files dropped | **310** | **STAY deleted** except: `sdk/src/vcs/` is the port SOURCE (read from `c7bd6bee`, re-homed at `src/vcs/`); vcs-facing query handlers are the CLI-bridge reference; everything else → ledger rows |
| `get-shit-done/` files dropped | **278** | **STAY deleted** — upstream counterparts at `gsd-core/` are canonical; fork deltas (workflow rewiring, templates/config.json parallelization flip) re-applied at counterpart paths |
| `tests/` files dropped | **64** | Mostly SDK-bridge/parity/generator tests — **STAY deleted + ledger**; jj-load-bearing subset ported (§Test Porting) |
| `sdk/src/vcs/` dropped | **0** | 99/99 intact in the merged tree AND at `c7bd6bee` — port source is unambiguous |

**The MERGE-02 check inverts.** Pass 1 used the `comm` sweep as a restore list; pass 2 uses it as the **ledger-completeness proof**:

```bash
# every line of this output must map to a 19-MERGE-AUDIT.md row
# (disposition: ported-to:<path> | dropped:<reason> | re-applied-at:<path>)
comm -23 <(jj file list -r c7bd6bee sdk get-shit-done tests | sort) \
         <(jj file list -r @ sdk get-shit-done tests | sort)
```

**Recovery mechanics for porting (execution-time, allowed):** `jj file show -r c7bd6bee <path>` per file; bulk extraction of `sdk/src/vcs/` to its new home is a scripted loop over `jj file list -r c7bd6bee sdk/src/vcs`.

## Upstream Architecture (NEW — Q1, all verified at 03764dbc / in merged working copy)

### Module inventory: `src/` (97 `.cts` files)

| Family | Files | Notes |
|--------|-------|-------|
| Command routers | `command-routing-hub.cts`, `cjs-command-router-adapter.cts`, 12× `*-command-router.cts` (agent/check/init/phase/phases/roadmap/state/task/validate/verification/verify) | Router pattern: gsd-tools.cjs cases delegate `route<Family>Command(...)` |
| Domain modules | `core.cts` (largest), `commands.cts`, `state.cts`, `phase.cts`, `roadmap.cts`, `milestone.cts`, `init.cts`, `verify.cts`, `validate.cts`, `template.cts`, `frontmatter.cts`, `docs.cts`, `learnings.cts`, `intel.cts`, `graphify.cts`, `config*.cts`, `workstream*.cts`, … | 1:1 name match with old `bin/lib/*.cjs` |
| Worktree pair | `worktree-safety.cts` (94 worktree refs), `worktree-base-ref.cts` (NEW, #683 base-mismatch degrade) | The concentrated migration target |
| Exec seam | `shell-command-projection.cts` | `execGit`/`execNpm`/`execTool` — see §Raw-Git Seam Inventory |
| Subdirectories | `installer-migrations/` (5), `observability/` (3) | Precedent for `src/vcs/` as a subdirectory |
| Misc | `fallow-runner.cts` (binary resolution, degrades gracefully to null when `fallow` absent), `package-legitimacy.cts`, `research-*.cts`, `secrets.cts`, `security.cts`, `package-identity.d.cts` | |

**Zero `jj` mentions anywhere in `src/`** — upstream has no jj awareness at all.

### Dispatch chain (how a command gets invoked from `gsd-core/workflows/*.md`)

1. Workflow markdown embeds `gsd-core/workflows/_runtime-launcher.snippet.sh`, which defines `gsd_run() { node "$GSD_TOOLS" "$@"; }` after locating `gsd-core/bin/gsd-tools.cjs` via a runtime-home probe chain (repo root → `.claude/` → PATH → `~/.claude/` → 14 other runtime homes).
   - ⚠️ **The launcher resolves the repo root via `git rev-parse --show-toplevel 2>/dev/null || pwd`** — on a jj-only (non-colocated) repo this falls through to `pwd`, which is wrong when invoked from a subdirectory. Must be patched jj-aware (audit item, fork-critical).
2. `gsd-core/bin/gsd-tools.cjs` (hand-written CJS, checked in, 1,928 lines) `require`s `./lib/*.cjs` (the BUILT artifacts) and dispatches via a `switch(command)` with ~85 cases + family routers.
3. **`query` meta-prefix** (gsd-tools.cjs:344–346): `node gsd-tools.cjs query <command>` strips the prefix and dispatches the canonical command — so upstream workflows call `gsd_run query init.execute-phase`, `gsd_run query config-get …`, `gsd_run query commit …`, the SAME calling convention as the fork's `gsd-sdk query <verb>`. The fork's verbs slot in here.
4. Fork gsd-tools case list at `c7bd6bee` is a **strict subset** of upstream's (verified by case-list diff: upstream adds `agent`, `check`, `task`, `verification`, `research-store`, `research-plan`, `update-context`, `effort`, `package-legitimacy`, `classify-confidence`, `resolve-execution`, `resolve-granularity`; fork adds NOTHING upstream lacks). The fork's vcs CLI surface lived entirely in the retired `gsd-sdk` binary — the bridge is purely additive.

### Entry points / packaging (upstream `package.json` at 03764dbc)

- `name: @opengsd/gsd-core`, `version: 1.4.3`, npm-based: `engines: { node >=22, npm >=10 }`, `package-lock.json` committed. **No pnpm anywhere upstream.**
- `bin: { "gsd-core": "bin/install.js", "gsd-tools": "gsd-core/bin/gsd-tools.cjs" }`.
- `files`: bin, commands, gsd-core, assets, agents, .claude-plugin, gemini-extension.json, GEMINI.md, hooks, scripts.
- deps: `@anthropic-ai/claude-agent-sdk ^0.2.84`, `ws 8.20.1`. optionalDeps: `fallow ^2.70.0`. devDeps: `typescript ^6.0.3`, eslint 9 stack, `@stryker-mutator/core`, `fast-check`, `c8`, `js-yaml`, `@types/node`.

### Publish-time build (ADR-457)

- `tsconfig.build.json`: `rootDir: src`, `outDir: gsd-core/bin/lib`, `module: nodenext`, `moduleResolution: nodenext`, `target: ES2022`, `strict`, `noEmitOnError`, `declaration: false`, includes `src/**/*.cts` only.
- `.cts` sources emit `.cjs` natively. Subdirectories emit nested (`src/observability/` → `gsd-core/bin/lib/observability/`) — `src/vcs/` will emit `gsd-core/bin/lib/vcs/`.
- Build triggers: `npm run build:lib` directly; `prepare`, `prepack`, `prepublishOnly`, `pretest` all run it; `scripts/run-tests.cjs` has `ensureBuiltArtifacts()` that self-builds when the sentinel `gsd-core/bin/lib/semver-compare.cjs` is missing.
- **Emitted files are individually gitignored** — `.gitignore` enumerates all 97 `/gsd-core/bin/lib/<name>.cjs` paths explicitly. Adding `src/vcs/` requires corresponding ignore entries (per-file to match upstream style, or one `/gsd-core/bin/lib/vcs/` directory line — planner choice; per-file keeps the upstream convention and makes `git status` noise impossible per-module).
- Checked-in (NOT built) under `gsd-core/bin/`: `gsd-tools.cjs`, `check-latest-version.cjs`, `verify-reapply-patches.cjs`, `lib/legacy-cleanup.cjs`, `lib/package-identity.cjs` (generated by `scripts/generate-package-identity.cjs`), `shared/*.manifest.json` + `model-catalog.json`.

### Runtime module format & port implications

- `.cts` files use ESM `import` syntax (compiled to `require`) with **`.cjs` specifiers for sibling imports** (`import { execGit } from './shell-command-projection.cjs'` — nodenext maps the `.cjs` specifier to the `.cts` source at typecheck); occasional `import x = require('./y.cjs')` for CJS-shaped exports.
- Implication for the fork's ESM SDK TS: translation = rename `.ts` → `.cts` + rewrite relative specifiers `.js` → `.cjs`. **Verified: no `import.meta`, no `export default`, no top-level await in any of the 36 vcs production modules** — the translation is mechanical (scriptable + tsc-verified).

## Raw-Git Seam Inventory (NEW — Q2, complete)

### The seam itself

`src/shell-command-projection.cts:420` — `execGit(args, { cwd?, env?, timeout? })` is the **single** `spawnSync('git', …)` in `src/`. Returns `SpawnResultOutput { exitCode, stdout, stderr, signal, error }` (ENOENT → exitCode 127). Also exports `execNpm`, `execTool`.

⚠️ Shape mismatch with the fork: fork `sdk/src/vcs/exec.ts` exports `vcsExec(cwd, bin, args, opts)` / `execGit(cwd, args, opts)` returning `ExecResult { exitCode, stdout, stderr, timedOut, error }` (signal-killed → exitCode -1 sentinel, WR-06). Same arity-5 result, different field 4 (`signal` vs `timedOut`) and different argument order. **Do not unify in this phase** — port the fork module intact; migrate upstream call sites to adapter VERBS (not to the fork's exec), leaving upstream's `execGit` for git-backend-internal/substrate use only (allowlist entry, mirroring the fork's `sdk/src/vcs/exec.ts` precedent).

### `execGit` call sites by module (60 total, verified by `rg -c`)

| Module | Sites | What git operations | VcsAdapter-routed equivalent (fork verb) |
|--------|-------|---------------------|------------------------------------------|
| `worktree-safety.cts` | 27 | `worktree list/prune/remove/unlock`, `rev-parse --git-dir/--git-common-dir/--abbrev-ref`, `merge-base`, `merge --no-ff`, `branch -D`, `diff --diff-filter=D`, `status --porcelain`, `cat-file -e`, `symbolic-ref`, `config --get init.defaultBranch`, `remote` | Counterpart of fork `workspace.parallel.*` fan-in/cleanup + `jj/workspace-cleanup.ts` + `reap.ts`. Disposition options: (a) migrate to `vcs.workspace.*` verbs, or (b) ledger as git-backend substrate (it IS worktree machinery — git-only by nature) with the jj path served by the fork's parallel verbs. **(b) recommended**: this module is upstream's git-side dispatcher, the analogue of fork `sdk/src/vcs/git/parallel.ts` (which is allowlisted as substrate) |
| `commands.cts` | 14 | `rev-parse --abbrev-ref HEAD`, `checkout [-b]`, `rm --cached`, `add`, `commit [-m/--amend]`, `rev-parse --short HEAD`, `rev-list --count/--max-parents=0`, `show -s --format=%as`, `diff --cached --name-only` | **Fork reference implementation exists**: fork `get-shit-done/bin/lib/commands.cjs` at `c7bd6bee` performs this exact migration with line-annotated comments (`vcs.refs.currentBookmarks()`, `vcs.refs.bookmarks.switch(name, {create})`, `vcs.commit({message, files, noVerify, respectStaged})`, `vcs.refs.resolveShort(vcs.refs.head)`, `vcs.status({porcelain})`, `vcs.diff({staged, nameOnly})`). Replay it onto `src/commands.cts` |
| `verify.cts` | 6 | `cat-file -t <hash>`, `log --oneline --all -50`, `rev-parse HEAD`, `diff --name-status <base> HEAD` | fork `vcs.log()`, `vcs.diff()`, revision-verify via unified model (`LogEntry.id`); fork bin/lib/verify.cjs is the reference (allowlisted for legitimate hex fixtures) |
| `worktree-base-ref.cts` | 4 | `rev-parse HEAD`, `rev-parse --verify origin/HEAD`, `symbolic-ref refs/remotes/origin/HEAD` | NEW upstream module (#683 sequential-degrade on base mismatch). No fork counterpart verb. Options: jj-aware re-implementation via `vcs.refs`/`vcs.log`, or keep git-only with jj returning "no degrade needed" (jj workspaces don't share the worktree base problem). Needs a decision at plan time |
| `init.cts` | 4 | `status --porcelain` ×2, `--version`, `rev-parse --show-prefix` | fork `vcs.status()`; version probe → backend capability probe (fork `backends.ts` detection) |
| `core.cts` | 3 | `check-ignore -q --no-index`, `rev-parse --is-inside-work-tree`, `rev-parse --show-toplevel` | repo-root/ignore detection — fork adapters have backend-aware root detection; `check-ignore` is git-only (jj equivalent differs) — candidate substrate annotation |
| `graphify.cts` | 2 | `rev-parse HEAD`, `rev-list --count A..B` | Fork precedent: graphify reads git HEAD even in jj-colocated mode (fork allowlist reason: "jj commit_ids ARE git commit_ids" in colocated repos) — **ledger as substrate, mirror fork annotation** |
| `shell-command-projection.cts` | 1 (the seam) | — | allowlist as adapter-internal substrate |

### Outliers bypassing the seam (5 sites)

| Site | Operation | Disposition |
|------|-----------|-------------|
| `roadmap-upgrade.cts:484` | `execSync('git status --porcelain')` | migrate to `vcs.status()` |
| `roadmap-upgrade.cts:495` | `execSync('git rev-parse HEAD')` → `headSha` | unified revision model (`vcs.refs.head` / `LogEntry.id`) |
| `roadmap-upgrade.cts:579–580` | `execSync('git reset --hard <sha>')` + `git clean -fd .planning/phases/` | ⚠️ **destructive rollback path** — migrate to adapter restore semantics (fork `restore` verb) or ledger with loud justification; also a destructive-git policy hit |
| `check-command-router.cts:252` | `execFileSync('git', ['log','-n','200','--pretty=%s%n%b'])` | `vcs.log({limit})` |

### commit_id / SHA assumption sites

`roadmap-upgrade.cts` headSha capture/reset (above); `commands.cts` `rev-parse --short HEAD` returned as commit hash in JSON envelopes (×2 paths); `verify.cts` `cat-file -t <hash>` probes (×4) + `verify commits <h1> [h2]…` CLI contract; `worktree-base-ref.cts` base-SHA pinning (5 per pass-1 count); `worktree-safety.cts` merge-base/symbolic-ref SHAs (2); `drift.cts` (2); `research-store/learnings/intel/commands.cts` (1 each); `gsd-core/bin/verify-reapply-patches.cjs` (2, checked-in CJS). Fork rule to apply: `LogEntry.id` unified field; jj backend never volunteers commit_id; tests use the `toBeIdOf` matcher.

### Hooks & launcher surfaces

| Surface | Finding | Action |
|---------|---------|--------|
| `_runtime-launcher.snippet.sh` | `git rev-parse --show-toplevel` for RUNTIME_ROOT | patch jj-aware (try `jj workspace root` fallback) — fork-critical, every workflow flows through it |
| `hooks/lib/git-cmd.js` | token-walk git-commit classifier (handles `-C`, env-prefix, full-path forms) used by hook gating | audit: fork PreToolUse guards need jj-command awareness parity; likely extend classifier or ledger |
| `hooks/gsd-validate-commit.sh`, `gsd-worktree-path-guard.js`, `gsd-graphify-update.sh` | raw git in hook scripts | gsd-graphify-update.sh has fork allowlist precedent; others audit per-file |
| `.githooks/pre-commit` (47 lines, **upstream side auto-won** — fork unchanged since base) | references STALE `sdk/src/query/…` paths + `npm run check:*` scripts that don't all exist upstream; greps `git diff --cached` | rewrite for the new tree (this is ALSO the fork's `.githooks` firing surface via `hook-bridge.ts` — content must be jj-tolerant) |
| `.git/hooks` direct references | **0** in `src/` and `gsd-core/` (re-verified) | none needed |

### Workflow markdown fences (`gsd-core/workflows/`, line-anchored `^\s*(\$\()?git <verb>`)

**~113 fence lines across 24 files** (pass-1's "~302" used a looser any-occurrence pattern; treat 113 as the line-anchored lower bound and 302 as the mention upper bound — the re-derived audit baseline will use the audit script's own fence-aware counter).

Verb distribution: log 18, commit 18, checkout 10, add 10, worktree 5, reset 5, diff 5, branch 5, switch 4, push 4, merge 4, status 3, rm 3, tag 2, revert 2, then singletons (stash, show-ref, rev-parse, restore, remote, init, hook, fetch, clone, cherry-pick).

Top files: complete-milestone.md 26, undo.md 10, quick.md 9, forensics.md 9, execute-phase.md 8, pr-branch.md 7, ship.md 5, milestone-summary.md 5, new-workspace.md 4, cleanup.md 3, audit-fix.md 3.

**Classification against fork rewiring precedent:**

| Pattern | Fork precedent? | Files | Re-wiring approach |
|---------|-----------------|-------|--------------------|
| commit/add fences | YES — `gsd-sdk query commit` (55 uses fork-side) | complete-milestone, execute-phase, quick, undo, plan-phase, new-project, new-milestone… | replace with `gsd_run query commit` once bridge lands |
| worktree dispatch/fan-in | YES — Phase 11 `workspace.parallel.{dispatch,fan-in}` rewiring of execute-phase/quick | execute-phase.md (8 fences + worktree-branch-check fragment embed), quick.md | re-apply fork's Phase 11 delta onto upstream text; upstream's `worktree_branch_check`/base-SHA embed (#48/#683) must be re-expressed against fork dispatch |
| status/log/diff | YES — query status/log/diff | undo, forensics, code-review | replace with verbs |
| merge/reset (milestone close) | YES — query merge/reset (complete-milestone fork-side) | complete-milestone.md | replace with verbs |
| revert/restore | YES — query revert/restore (undo.md, gsd-code-fixer) | undo.md | replace with verbs |
| checkout/switch (14 fences) | **NO** — fork TODO comments explicitly admit no checkout verb exists | complete-milestone, pr-branch, ship, new-workspace | keep raw + baseline entries (fork's frozen-baseline precedent), or add a verb (scope creep — recommend baseline) |
| branch/tag/stash/cherry-pick/fetch/clone/remote | NO (mostly inside fork's frozen 127 baseline already) | pr-branch, ship, milestone-summary, import/ingest | baseline entries, mirroring fork's 127-hit freeze approach |
| `git hook` mention | NO — new | (1 file) | audit individually |

### References & agents (also in audit scan roots)

`agents/gsd-code-fixer.md` 31 git mentions, `agents/gsd-executor.md` 23 (**upstream versions — the fork HAD rewired its executor**; fork's rewiring must be re-applied), `gsd-core/references/git-integration.md` 15, `planning-config.md` 14, `gsd-debugger.md` 10, `worktree-path-safety.md` 6, `worktree-branch-check.md` 6 (NEW upstream fragment), `tdd.md` 4, others ≤2.

## Porting Map: fork → upstream (NEW — Q3)

### Module relocation table

Source = `jj file show -r c7bd6bee sdk/src/vcs/<path>`. Target = `src/vcs/<path>` with `.ts`→`.cts` rename and `.js`→`.cjs` specifier rewrite. Emitted artifact = `gsd-core/bin/lib/vcs/<path>.cjs` (gitignore entries required).

| Chunk | Modules (lines) | Target | Complexity |
|-------|------------------|--------|------------|
| 1. Core contract | `types.ts` (832), `index.ts` (144), `backends.ts` (187), `exec.ts` (134), `expr.ts` (141), `refs-validator.ts` (95), `hook-bridge.ts` (42) | `src/vcs/*.cts` | **LOW** — mechanical; types compile under upstream strict/ES2022 |
| 2. Backends | `backends/jj.ts` (1,486), `backends/git.ts` (1,027) | `src/vcs/backends/*.cts` | **MEDIUM** — large but mechanical; spawn paths unchanged |
| 3. Parallel + jj internals | `git/parallel.ts` (726), `jj/parallel.ts` (626), `jj/octopus.ts` (324), `jj/reap.ts` (272), `jj/workspace-cleanup.ts` (227), `jj/incomplete-work.ts` (172), `jj/pre-push.ts` (154), `jj/lock.ts` (152), `jj/conflict-paths.ts` (73) | `src/vcs/{git,jj}/*.cts` | **MEDIUM** — mechanical; preserve `workspace.parallel.*` semantics byte-for-behavior |
| 4. Parsers | `parse/*` (8 files, ~585) | `src/vcs/parse/*.cts` | **LOW** |
| 5. Format migration | `format-migration/*` (8 prod files, ~1,420) | `src/vcs/format-migration/*.cts` | **LOW-MEDIUM** — supports `migrate-vcs` workflow verb |
| 6. CLI bridge | net-new `src/vcs-command-router.cts` + gsd-tools.cjs wiring, shaped from the fork's 23 vcs-facing query handlers | router + switch cases | **MEDIUM-HIGH** — envelope-shape parity with fork handlers (workflows parse the JSON with `jq`) |
| 7. Upstream call-site migration | 60 `execGit` sites + 5 outliers per §Seam Inventory | edits to 8 existing `.cts` modules | **HIGH** — the semantic audit work; fork bin/lib CJS files at `c7bd6bee` are line-annotated reference implementations for `commands`/`verify`/`init`/`core` |
| 8. Workflow re-wiring | fork VCS deltas re-applied on `gsd-core/workflows/*.md` + `agents/gsd-executor.md`, `gsd-code-fixer.md` | markdown edits | **HIGH** — see fence classification; never before chunk 6 lands |
| 9. Launcher + hooks | `_runtime-launcher.snippet.sh` jj-aware root; `.githooks/*` rewrite; `hooks/lib/git-cmd.js` audit | small files | **LOW** but fork-critical |

Translation rules (verified safe): rename to `.cts`; rewrite relative import specifiers `.js`→`.cjs`; named exports only (no default-export/import.meta anywhere in chunks 1–5); type-only imports unchanged; keep the fork's `ExecResult` shape — do NOT merge with upstream's `SpawnResultOutput`.

Naming hazard: fork `exec.ts` exports `execGit(cwd, args, opts)`; upstream `shell-command-projection.cts` exports `execGit(args, opts)`. Different modules, no literal collision, but a misimported seam would typecheck in some call shapes. Mitigation: chunk-1 port may rename the fork's convenience export (e.g. `execGitVcs`) — internal-only, three fork call sites in backends.

### CLI bridge: verbs workflows actually need (grep of ALL fork prompt surfaces at c7bd6bee)

The fork's `gsd-sdk` binary disappears; workflows converge on `gsd_run query <verb>`. Upstream gsd-tools already accepts the `query` meta-prefix, and `init.*`, `config-get/set`, `state.*`, `phase.*`, `roadmap.*`, `commit`, `worktree.*` verbs already exist (raw-git implementations). The bridge work splits:

| Verb (fork prompt-surface uses) | Upstream has? | Bridge action |
|--------------------------------|---------------|---------------|
| `commit` (55), `commit-to-subrepo` (2) | YES (raw git via `commands.cjs`) | **migrate internals** to adapter (chunk 7, fork commands.cjs as reference) — workflows keep calling `gsd_run query commit` |
| `log` (14), `diff` (11), `status` (4), `head-ref` (6), `current-branch` (4), `branch-list`/`branch-create`/`branch-delete`, `rev-parse` (2), `rm` (1), `push` (1), `merge` (2), `reset` (3), `restore` (3+8 in gsd-code-fixer), `revert` (3) | NO | **net-new gsd-tools verbs** routed through `lib/vcs/index.cjs` (port the fork query handlers' envelope logic) |
| `workspace` (3), `workspace.assert-dispatched-cwd` (2), `workspace.parallel.dispatch` (2), `workspace.parallel.fan-in` (2), `workspace.parallel.cancel`, `cleanup-subagent-workspaces` | NO | net-new verbs (fork handlers `workspace*.ts` are thin adapter wrappers) |
| `hooks.fire` (1) | NO | net-new (wraps `hook-bridge.ts` fireHook) |
| `migrate-vcs` / `init.migrate-vcs` (1 each) | NO | net-new (wraps format-migration/run) |
| `worktree.reap-orphans` (1), `worktree.cleanup-wave`, `worktree.base-check`, `worktree.set-baseref` | YES (raw git via `worktree-safety.cjs` / `worktree-base-ref.cjs`) | keep verbs; disposition per §Seam (substrate vs migrate); execute-phase/quick get the fork's `workspace.parallel.*` dispatch instead |
| `checkout`, `tag`, `stash` | — | **phantom verbs** — fork-side these are TODO comments next to raw git lines; do NOT invent handlers; baseline the raw fences |

Implementation shape: follow the upstream router precedent — a `src/vcs-command-router.cts` registered in gsd-tools.cjs (mirrors `routeStateCommand` etc.), with `require('./lib/vcs/index.cjs')` from `commands.cts`/`core.cts` being a plain sibling import (`./vcs/index.cjs`) once emitted.

Don't-sever-the-chain check (MERGE-REVIEW BLOCKER-3): the fork SDK's `worktree.ts`/`workspace.ts` handlers spawned gsd-tools via `resolveGsdToolsPath` — that middleman dies with the SDK; verify no surviving caller still spawns `bin/gsd-sdk.js` (fork root package.json `bin.gsd-sdk` is deleted with bucket E).

## Upstream Test Layout + Fork Test Porting (NEW — Q4)

### Upstream layout (verified)

| Property | Value |
|----------|-------|
| Runner | `node scripts/run-tests.cjs` → `node:test` over `tests/**/*.test.cjs` |
| Suites | filename-suffix markers: bare `.test.cjs` = unit; `.integration/.install/.security/.slow.test.cjs`; `--suite`, `--files`, `--files-from` flags |
| Build coupling | `pretest` runs `build:lib`; `ensureBuiltArtifacts()` in run-tests.cjs self-builds when `gsd-core/bin/lib/semver-compare.cjs` is missing |
| Coverage | `c8 --check-coverage --lines 70 --include 'gsd-core/bin/lib/*.cjs'` |
| Mutation | Stryker (`stryker.config.mjs`, `test:mutation`) |
| vitest | **ABSENT** — no vitest devDep upstream; the upstream root `vitest.config.ts` still references `./sdk` (dead config, leftover) |

### Test-set differences (computed this session)

- **Upstream-only tests: 214** — under upstream-canonical these are KEPT and expected green (they target the adopted layout). Pre-existing upstream failures = triage per Claude's discretion (record, don't fix beyond merge scope).
- **Fork-only tests: 147** — triage:

| Class | Count (approx) | Files | Disposition |
|-------|-------|-------|-------------|
| jj/vcs load-bearing — **PORT** | ~75 assets | `sdk/src/vcs/__tests__/` 58 vitest tests + `vcs-fixture.ts`/`synth-planning-fixture.ts`; `tests/__tools__/{vitest-matchers.ts,vitest.d.ts,capture-vcs-baselines.cjs}` (toBeIdOf matcher); `tests/fixtures/jj-ndjson/` (5); `tests/vcs-adapter-contract.test.cjs`, `vcs-cjs-smoke.test.cjs`, `jj-parallel-no-manifest-write.test.cjs`, `quick-md-parallel-dispatch.test.cjs`, `wave-cleanup-executor.test.cjs`, `cli-workspace-parallel-cancel.test.cjs`, `cli-cleanup-subagent-workspaces.test.cjs`, `agent-prompts-no-raw-git.test.cjs`, `bug-2767`/`bug-3749*` commit-semantics | port to upstream layout (below) |
| Gate-script tests — **PORT (re-pointed)** | ~10 | `tests/scripts/{audit-workflow-raw-git,lint-vcs-parallel-call-presence,allowlist-parser,audit-id-namespace,audit-root-commits-rename,dogfood-restore-orphan-cleanup,migr-06-close-gate}.test.cjs` + `lint-vcs-no-raw-git-fixture.test.cjs` + fixtures (fixture dirs embed `get-shit-done/workflows/` paths — rename to `gsd-core/workflows/`) | port with path re-pointing |
| Golden baselines | 55 snaps | `tests/baselines/git-vcs/*.snap.json` — **keyed by old file:line names** (`commands-cjs-305-current-branch`) | re-capture or re-key after the port (capture-vcs-baselines.cjs is the harness); do not hand-edit keys |
| SDK-infrastructure — **DROP + ledger** | ~60 | sdk shim/path/install/bridge tests (`bug-2334/2439/2441/2519/…/3406`), `cjs-sdk-bridge-*`, `config-schema-sdk-parity`, `*-generator.test.cjs` (9 — generators retired with SDK), `gsd-sdk-query-registry-integration`, `sdk-no-sdk-guard`, `lint-shared-module-handsync`, `prompt-budget-sdk-parity-optimizer`, `runtime-bridge-sync-smoke`, `enh-3271-sdk-adr-structure` | the things they test no longer exist |
| Doc-parity / drift counts — **RE-DERIVE or DROP** | ~10 | `architecture-counts`, `command-count-sync`, `commands-doc-parity`, `agents-doc-parity`, `cli-modules-doc-parity`, `hooks-doc-parity`, `inventory-source-parity`, `config-schema-docs-parity`, `no-unconditional-win32-skip` | fork doc counts are invalid against upstream docs; decide at plan time (Open Q5) |
| Release/cherry-pick tooling tests | ~8 | `bug-2964/2966/2968/2980/2982/2983/2987/3621` | keep iff the scripts they test survive in the merged tree; else drop + ledger |

### Porting mechanics for the vitest suite

Options:
1. **Revive vitest as a fork devDep (recommended).** 58 jj/vcs test files + custom matchers are the fork's jj coverage core; rewriting to `node:test` is repeat work with regression risk. Add `vitest` devDep + a fork-owned config including `src/vcs/__tests__/**/*.test.{ts,cts}`. `tsconfig.build.json` includes only `src/**/*.cts`, so test files written as `.test.ts` are automatically excluded from the publish build (cleanest: keep tests `.test.ts`, importing production modules via their `.cjs` specifiers, which vitest+nodenext resolves to the `.cts` sources). The fork's CI lane (`parallel-e2e.yml`, survived untouched) re-points its invocations accordingly.
2. Convert all to `node:test` `.cjs` consuming the BUILT `gsd-core/bin/lib/vcs/*.cjs` — uniform with upstream but a large conversion; the existing `tests/vcs-cjs-smoke.test.cjs` + `vcs-adapter-contract.test.cjs` already cover the built-artifact angle.

Either way: `tests/helpers.cjs` `_loadVcs()` re-points `require('../sdk/dist-cjs/vcs/index.js')` → `require('../gsd-core/bin/lib/vcs/index.cjs')`, and its error hint changes from `pnpm -F sdk build:cjs` to the new build command. Cross-backend selection (`GSD_TEST_BACKENDS`, `parseBackendsEnv`) ports with `backends.ts`.

## Conflict Buckets & Resolution Strategies (REVISED — Q5, upstream-side-wins)

75 paths from `jj resolve --list` (authoritative this session). jj 0.41 materialization (verified pass 1): delete/modify conflicts span the whole file as one hunk (`%%%%%%% diff from: base to: <side>` + empty other side); resolving as "deleted" = removing the file; resolving as a side = writing that side's content.

| Bucket | Files | Kind | Pass-2 strategy |
|--------|-------|------|------------------|
| **A. sdk TS + packaging (34)** — `sdk/src/query/*.ts` ×23, `sdk/src/*.ts(+tests)` ×8, `sdk/{package.json,tsconfig.json,vitest.config.ts,README.md}`, `sdk/shared/config-schema.manifest.json` | delete/modify (upstream deleted) | **Resolve as DELETED** (accept upstream deletion; the file disappears). BEFORE deleting, harvest from `c7bd6bee` (not from conflicted text): the 23 vcs-facing query handlers (CLI-bridge reference), `sdk/vitest.config.ts` projects shape (vitest revival reference), `sdk/shared/config-schema.manifest.json` fork delta vs `gsd-core/bin/shared/config-schema.manifest.json` (direct JSON diff — fork schema additions like `parallelization` must survive at the new home). Ledger row per file |
| **B. get-shit-done/bin CJS (10)** — `gsd-tools.cjs`, `bin/lib/{command-aliases.generated,commands,config-schema,core,graphify,init,shell-command-projection,verify,worktree-safety}.cjs` | delete/modify | **Resolve as DELETED**. Counterparts: `gsd-core/bin/gsd-tools.cjs` (checked in) + built `src/*.cts`. Fork semantic content = the vcs-routing deltas, which are EXACTLY the chunk-7 reference implementations — extract each fork file once (`jj file show -r c7bd6bee …`) into the port workspace notes before removing. Verified: fork gsd-tools case list ⊂ upstream's, so no fork-only dispatch case is lost at the bin level |
| **C. workflows (9) + templates/config.json (1)** — `get-shit-done/workflows/{code-review,complete-milestone,execute-phase,help,new-milestone,new-project,plan-phase,quick,undo}.md`, `get-shit-done/templates/config.json` | delete/modify | **Resolve as DELETED**; fork deltas re-applied at `gsd-core/` counterparts (chunk 8). Fork delta per file = `diff <(jj file show -r b533f71857ab get-shit-done/workflows/X.md) <(jj file show -r c7bd6bee get-shit-done/workflows/X.md)`. `templates/config.json`: upstream made NO changes vs base (pass-1 verified) — so applying the fork delta = copying fork content onto `gsd-core/templates/config.json` (carries the Phase 14 flat-boolean `parallelization: true` flip) |
| **D. docs / translations (11)** — `README.md`, `docs/FEATURES.md`, `docs/USER-GUIDE.md`, `docs/{ja-JP,ko-KR}/ARCHITECTURE.md`, `docs/INVENTORY.md`, `docs/INVENTORY-MANIFEST.json`, `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md` | two-sided | **Upstream-preferred mechanically**, then re-apply fork-essential content: jj-port documentation, fork identity/naming, install instructions for the fork package. Drift-count claims in INVENTORY/ARCHITECTURE follow whatever happens to the drift tests (Open Q5) — if those tests are dropped, upstream's counts stand as-is. CHANGELOG: keep the fork's file with a clearly-marked "merged upstream 1.2.0–1.4.3" section sourced from upstream CHANGELOG (fork identity is locked; upstream's restarted version line goes in the ledger + changelog note, not adopted as-is) |
| **E. packaging / CI (5)** — `package.json`, `package-lock.json` (fork-deleted/upstream-modified), `.github/workflows/test.yml`, `.github/ISSUE_TEMPLATE/config.yml`, `scripts/changeset/github-release-notes.cjs` | mixed | `package.json`: **take upstream wholesale, then overlay fork identity** (name per Open Q2, fork version line, repository/homepage/bugs/author, `bin`: drop `gsd-sdk`, keep `gsd-tools` → `gsd-core/bin/gsd-tools.cjs`, fork installer bin name) + drop `fallow` optionalDep (Open Q / legitimacy) + ADD vitest devDep if Open Q3 lands on revival. `package-lock.json`: resolve as deleted and REGENERATE fresh after manifest resolution (never hand-merge a lockfile) — which lockfile depends on Open Q1 (npm vs pnpm). `test.yml`: adopt upstream's scope-detection shape, strip org-specific tokens/branch names (`next`, org secrets), keep fork's `parallel-e2e.yml` lane (survived untouched; re-point its sdk/pnpm invocations). `ISSUE_TEMPLATE/config.yml`: upstream side with fork URLs. `github-release-notes.cjs`: upstream side; re-apply fork naming delta if any (small two-sided diff); `node -c` after edit |
| **F. tests (3)** — `tests/helpers.cjs` (two-sided), `tests/bug-3097-3099-executor-worktree-path-safety.test.cjs` (two-sided), `tests/bug-2767-gsd-sdk-commit-files-flag.test.cjs` (delete/modify) | mixed | `helpers.cjs`: genuine merge — upstream base + fork's `_loadVcs`/`vcs.gitOnly` temp-project block re-pointed at `gsd-core/bin/lib/vcs/index.cjs`; `node -c` after. `bug-3097-3099`: genuine merge — upstream text + fork's `workspace.assert-dispatched-cwd` assertions (fork rewired this guard in Phase 11). `bug-2767`: fork-modified/upstream-deleted — port the `commit --files` semantics into bridge tests (the verb survives as `gsd_run query commit --files`), ledger the filename |
| **G. agents (1)** — `agents/gsd-research-synthesizer.md` | two-sided | Same bug, two fixes (fork 05-29 "edit pre-seeded SUMMARY.md" vs upstream #222 "write-only summary contract"). Take upstream, then verify by diff that the fork's behavioral guarantee is covered; if not, graft the missing clause. Ledger the reconciliation |

Net shape: ~55 paths resolve mechanically as "accept upstream deletion" (scriptable: for each, remove the conflicted file — content recovery happens from `c7bd6bee` revisions, not from the working copy). ~20 paths need genuine merging (D, E, F, G + package.json). The HARD work is not in the conflicted paths at all — it's chunks 6–8 of the porting map.

## Counterpart Map (REVISED — direction flipped: fork content re-applied at upstream paths)

| Fork source (read at c7bd6bee) | Upstream/new home | Method |
|---|---|---|
| `sdk/src/vcs/**` (36 prod modules) | `src/vcs/**.cts` | mechanical translation (§Porting Map chunks 1–5) |
| `sdk/src/query/{commit,log,diff,status,head-ref,current-branch,branch-list,merge,push,reset,restore,revert,hooks,migrate-vcs,workspace*,worktree,cleanup-subagent-workspaces,…}.ts` | `src/vcs-command-router.cts` + gsd-tools cases | envelope-preserving re-expression (chunk 6) |
| `get-shit-done/bin/lib/{commands,core,init,verify,graphify,shell-command-projection,worktree-safety}.cjs` (vcs-routed fork versions) | reference implementations for migrating `src/{commands,core,init,verify,graphify,…}.cts` | replay annotated migrations (chunk 7) |
| `get-shit-done/workflows/X.md` fork deltas (base→fork diff) | `gsd-core/workflows/X.md` | re-apply as marked delta, re-pathed (`get-shit-done`→`gsd-core`, `gsd-sdk query`→`gsd_run query`) (chunk 8) |
| `agents/gsd-executor.md` fork rewiring (assert-dispatched-cwd etc.) | `agents/gsd-executor.md` (upstream version in tree) | re-apply delta |
| `get-shit-done/templates/config.json` | `gsd-core/templates/config.json` | copy fork content (upstream delta vs base = 0) |
| `sdk/shared/config-schema.manifest.json` fork delta | `gsd-core/bin/shared/config-schema.manifest.json` | JSON diff + graft |
| `get-shit-done/references/dispatch-cwd-safety.md`, `workflows/migrate-vcs.md` (fork-added, clean in tree) | `gsd-core/references/`, `gsd-core/workflows/` | move + re-path |
| fork jj tests (§Test Porting) | `src/vcs/__tests__/` + `tests/` | port + re-point |
| `scripts/lint-vcs-*.cjs`, `audit-workflow-raw-git.cjs`, allowlists | same paths (survived clean) | re-point contents (§Lint-Gate Re-pointing) |

## Upstream Delta Semantics (unchanged inventory from pass 1; dispositions flipped)

**Structural restructures:** now ADOPTED (SDK retirement, gsd-core rename, ADR-457 build, installer migrations 003/004). The `next`-branch release model (#231/#232) and its artifacts: drop + ledger (fork doesn't run upstream's release train).

**VCS-sensitive fixes (#683 base-ref degrade, #630 manifest pinning, #48/#588/#589 worktree_branch_check, #260 path-safety hook, #261/#706/#245 SUMMARY rescue, #837 three-dot diff):** these now arrive IN the adopted tree by default — the audit migrates them through the vcs layer (chunk 7) or re-expresses them against fork dispatch (chunk 8) rather than harvesting them in.

**Workflow/agent fixes (#934/#937, #936, #921/#922, #913, #905, #892, #904, #685, #464, #549/#557, #160, perf batch):** arrive by default with the adopted workflows/src — no action needed beyond not clobbering them during chunk-8 re-wiring.

**New subsystems (multi-runtime installers, `.claude-plugin`, lifecycle hooks, ESLint-9 + custom rules + ratchets, Stryker/fast-check, Research module, milestone-prefixed phase IDs, granularity overrides):** now RETAINED by default (they're part of the adopted tree). Org-automation (bots, Discord changelog, duplicate-issue sweeps, PR-policy workflows) dropped per locked decision. Each retained subsystem still gets an audit pass for raw-git/SHA (most are git-clean; `graphify`, hooks already covered above).

## Recommended Resolution Strategy (REPLACED — execution sequence under the locked strategy)

1. **Wave 0 — packaging + identity + build bring-up** (§Wave 0 below). Tree compiles and upstream tests run BEFORE any port work.
2. **Wave 1 — mechanical conflict clearing:** resolve buckets A/B/C as deleted (fork content extracted to `c7bd6bee`-sourced reference copies first), resolve D/E/F/G per bucket table. Gate: `jj st` clean of conflicts, marker sweep clean, `node -c` on touched `.cjs`.
3. **Wave 2 — vcs port (chunks 1–5):** translate `sdk/src/vcs/` → `src/vcs/*.cts`; gitignore entries; `npm run build:lib` green including the new modules.
4. **Wave 3 — CLI bridge (chunk 6):** `vcs-command-router.cts` + gsd-tools wiring; dispatch smoke test per verb family; port `vcs-cjs-smoke`/contract tests early as the regression net.
5. **Wave 4 — call-site migration (chunk 7):** migrate `commands`/`verify`/`init`/`core`/`roadmap-upgrade`/`check-command-router`/`graphify` per the seam table, replaying fork CJS reference implementations; ledger substrate exceptions (`worktree-safety`, `shell-command-projection.execGit`, graphify reads).
6. **Wave 5 — workflow + agent re-wiring (chunk 8) + launcher/githooks (chunk 9).**
7. **Wave 6 — test porting + gate re-pointing:** port jj tests, triage the 147 fork-only tests, re-derive lint baselines, re-point CI.
8. **Wave 7 — full gate run + audit-ledger completeness proof** (§Validation Architecture).

Ordering invariants: bridge before workflow re-wiring (Pitfall 1); manifest before install (Pitfall 6); build green before port (so port-introduced errors are attributable); ledger accumulates from Wave 0, not retrofitted.

## Package Legitimacy Audit (REVISED)

Under upstream adoption the upstream devDependency set WILL be installed — vetting is now real, not moot:

| Package | Source | Notes | Disposition |
|---------|--------|-------|-------------|
| `typescript ^6.0.3` | upstream devDep | build-critical (tsc emits the runtime) | [ASSUMED] — verify `npm view typescript version` ≥6 exists at install time |
| `eslint ^9.39.4` + `@eslint/js`, `typescript-eslint`, `eslint-plugin-n`, `eslint-plugin-no-only-tests`, `globals` | upstream devDeps | lint harness retained with tree | [ASSUMED] — well-known names; verify on registry before install |
| `@stryker-mutator/core ^9.6.1`, `fast-check ^4.8.0`, `c8 ^11`, `js-yaml ^4.1.1`, `@types/node` | upstream devDeps | test tooling | [ASSUMED] — verify before install |
| `fallow ^2.70.0` | upstream **optionalDependency** | unknown provenance; `src/fallow-runner.cts` verified to degrade gracefully (returns null when binary absent) | **recommend DROP + ledger** — code keeps working; if operator wants it, verify on npmjs.com first |
| `@anthropic-ai/claude-agent-sdk ^0.2.84`, `ws 8.20.1` | both sides | pre-existing | keep |
| `vitest` (if Open Q3 = revival) | fork addition | was in fork sdk devDeps | re-add at fork-vetted version |

slopcheck not run (uv-only machine; pip forbidden). Mitigation: resolve `package.json` BEFORE install; first install may use `--ignore-scripts` and then a scripted re-run, or plain install after the manifest is fork-controlled. All registry claims above are [ASSUMED] pending `npm view` at execution time.

## Lint-Gate Re-pointing (NEW — Q7)

| Gate | Script change | Allowlist/baseline change |
|------|---------------|---------------------------|
| `scripts/lint-vcs-no-raw-git.cjs` | **`SCAN_EXT` (line 63) `/\.(cjs\|js\|mjs\|ts\|yml\|yaml\|sh\|bash)$/` must add `cts`** — otherwise the entire adopted `src/` tree (including upstream's `execGit` seam and the ported vcs layer) is invisible. Scanner logic otherwise applicable as-is (whole-repo scan + JSON allowlist + inline `vcs-lint:allow-git-here` escapes) | 26-entry allowlist re-pointed: `sdk/src/vcs/exec.ts` → `src/vcs/exec.cts`; `sdk/src/vcs/backends/git.ts` → `src/vcs/backends/git.cts`; `sdk/src/vcs/git/parallel.ts` → `src/vcs/git/parallel.cts`; `sdk/src/vcs/__tests__/**` globs → `src/vcs/__tests__/**`; **NEW entries needed**: `src/shell-command-projection.cts` (upstream execGit seam = adapter-internal substrate), `src/worktree-safety.cts` + `src/worktree-base-ref.cts` (git-backend substrate, if disposition (b)), possibly `hooks/lib/git-cmd.js` + upstream hook scripts, `gsd-core/workflows/_runtime-launcher` is .sh-embedded-in-repo (the snippet file has no scanned extension? it's `.sh` — scanned; needs entry or jj-aware fix removes the hit); dead `sdk/**` entries removed. Every +/- line ledgered |
| `scripts/lint-vcs-no-commit-id.cjs` | **`SCAN_EXT` (line 54) `/\.(cjs\|js\|mjs\|ts)$/` must add `cts`** — same blindness | Allowlist re-pointed: `sdk/src/vcs/*` → `src/vcs/*.cts`; `get-shit-done/bin/lib/{graphify,verify}.cjs` entries → `src/{graphify,verify}.cts` (built `.cjs` are gitignored, no longer scanned as tracked files but the scanner walks the filesystem — confirm whether built artifacts should be excluded via walk-ignore of `gsd-core/bin/lib/` generated entries); `sdk/src/query/{commit,log}.ts` + `sdk/src/types.ts` JSDoc entries → bridge-router/`src/vcs/types.cts` equivalents; upstream src will add NEW violations (SHA-handling modules per seam table) — migrate (preferred) or allowlist with reasons |
| `scripts/audit-workflow-raw-git.cjs` | `SCAN_ROOTS` (line 50) `['get-shit-done/workflows','get-shit-done/references','agents']` → `['gsd-core/workflows','gsd-core/references','agents']` | The frozen 127-hit per-file BASELINE (embedded `Object.freeze` const, keys are fork paths) is obsolete: re-derive post-rewiring by running the script's own fence-aware counter against the finished tree, freeze the new map, and justify every row in the ledger (expected shape: fork-rewired files near zero; never-rewired files like pr-branch/ship/forensics/complete-milestone carry counts; upstream-new files like `worktree-branch-check.md` enter the baseline). Regression rule (current > baseline = fail) unchanged |
| `scripts/lint-vcs-parallel-call-presence.cjs` | `SCAN_ROOTS` (line 68) `['get-shit-done/workflows']` → `['gsd-core/workflows']` | allowlist currently empty (stays); test fixtures at `tests/scripts/fixtures/lint-vcs-parallel-call-presence/*/get-shit-done/workflows/*` rename to `gsd-core/workflows/` (or make the scanner's fixture root parametric — it already takes `--scan-root`) |
| `scripts/check-skip-count.cjs` | applicable as-is (reads origin/main via raw git — allowlisted; works in this repo today, exit 0) | skip baseline re-derived after the test triage (fork-only deletions + upstream-only additions both move it); justification in ledger |
| `scripts/audit-id-namespace.cjs`, `scripts/audit-root-commits-rename.cjs`, `scripts/migr-06-close-gate.cjs` | Phase 8/15/16 one-shot/audit artifacts — verify each still targets existing paths; re-point or mark historical in ledger | — |

## Don't Hand-Roll (revised)

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Recovering fork content for porting | re-typing / cherry-picking | `jj file show -r c7bd6bee <path>` (scripted loops over `jj file list -r c7bd6bee sdk/src/vcs`) | exact content, bulk-capable, read-only |
| ESM→CJS translation of vcs modules | hand-rewriting modules | rename `.ts`→`.cts` + `sed`-style `.js`→`.cjs` specifier rewrite, then let `tsc -p tsconfig.build.json` find every residual error | `noEmitOnError` + strict mode is the verifier; no ESM-only constructs exist (verified) |
| Migrating upstream git call sites | inventing adapter routing | replay fork `get-shit-done/bin/lib/*.cjs` line-annotated migrations (`// (was: <git cmd>)`) | the fork already performed this exact migration once; annotations map old→new 1:1 |
| Detecting fork workflow deltas | reading upstream's 485 commits | `diff <(jj file show -r b533f71857ab <fork-path>) <(jj file show -r c7bd6bee <fork-path>)` per file | the fork delta (what to re-apply) is precisely the base→fork diff |
| Conflict-marker sweep | ad-hoc grep | `rg -l '^(<<<<<<<|%%%%%%%|>>>>>>>)'` with a fixture exclusion list built once | gate already specified in CONTEXT |
| Raw-git/commit-id policing | new scanners | the four existing gate scripts, re-pointed per §Lint-Gate Re-pointing | they encode the allowlist/baseline reasoning; only paths/extensions change |
| CJS parse validation | trusting tsc/eslint | `node -c <file>` loop over every hand-edited `.cjs` | BLOCKER-1 precedent; tsc never sees hand-written CJS |
| Lockfile merging | hand-merging package-lock | delete + regenerate via the chosen package manager after manifest resolution | lockfiles are generated artifacts |
| Baseline re-derivation | hand-counting fences | run `audit-workflow-raw-git.cjs` itself against the finished tree and freeze its output | the script's fence-aware counter IS the definition of a hit |

## Runtime State Inventory (revised)

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — repo files only | none |
| Live service config | Locally installed GSD copy still runs OLD fork workflows during this phase | none this phase (deferred per CONTEXT); do not reinstall to test |
| OS-registered state | None | none |
| Secrets/env vars | Upstream CI references OpenGSD org secrets/bots — must not survive into retained fork CI (`test.yml` de-org'd; 9 org-automation workflows dropped) | Bucket E |
| Build artifacts | `node_modules/` ABSENT (root + sdk); `gsd-core/bin/lib/*.cjs` built artifacts ABSENT (gitignored, never built here); `sdk/dist*` irrelevant after bucket A | Wave 0 install + `npm run build:lib`; **keep** the 97 gitignore entries (pass-1 said prune — inverted) and ADD entries for `gsd-core/bin/lib/vcs/` |

## Common Pitfalls (REPLACED — Q8)

### Pitfall 1: Rewiring workflows before the bridge exists
**What:** changing `gsd-sdk query X` → `gsd_run query X` in markdown before gsd-tools dispatches `X` produces workflows that fail at runtime with "Unknown command" — and markdown has no compiler.
**Avoid:** strict wave order (bridge = Wave 3, workflows = Wave 5); after each workflow file, smoke the verbs it calls: `node gsd-core/bin/gsd-tools.cjs query <verb> --help`-style probes.

### Pitfall 2: CJS parse breakage on hand-merged files (BLOCKER-1 recurrence)
**What:** the remaining two-sided `.cjs` merges (`tests/helpers.cjs`, `scripts/changeset/github-release-notes.cjs`) + any hand-touched checked-in CJS (`gsd-core/bin/gsd-tools.cjs` bridge wiring) can ship syntax errors invisible to every TS gate.
**Avoid:** `node -c` on every hand-edited `.cjs` before its commit; never hand-strip whole-file delete/modify markers (jj materializes a DIFF format, not both-sides text).

### Pitfall 3: Fork capability silently lost in the mass deletion
**What:** resolving ~55 conflicts as "deleted" plus 652 already-silent deletions makes "we forgot to port X" the dominant failure mode (inversion of BLOCKER-2: now it's fork features at risk, not upstream's).
**Avoid:** MERGE-02 ledger-completeness proof — every `comm` line maps to a ledger row (`ported-to:` / `re-applied-at:` / `dropped:<reason>`); the 23 vcs-facing query handlers and 9 workflow deltas get explicit per-item rows; port the fork's guard tests (`quick-md-parallel-dispatch`, `agent-prompts-no-raw-git`, `wave-cleanup-executor`) EARLY so regressions surface mechanically.

### Pitfall 4: Severed dispatch chains (BLOCKER-3 recurrence, new shape)
**What:** the SDK middleman (`resolveGsdToolsPath` spawns, `gsd-sdk` bin, `bin/gsd-sdk.js`) disappears; anything still referencing it (root package.json `bin`, helpers, agent prompts, hooks) dangles.
**Avoid:** repo-wide `rg 'gsd-sdk'` sweep at Wave 6 — every remaining hit is either a ledgered historical doc or a bug; end-to-end smoke: launcher snippet → gsd_run → router → lib → adapter on BOTH backends.

### Pitfall 5: Hand-editing emitted artifacts
**What:** `gsd-core/bin/lib/*.cjs` look like the old hand-written fork files but are now build outputs — edits vanish on next `npm run build:lib` (and `pretest` rebuilds automatically).
**Avoid:** all code changes in `src/*.cts`; treat any diff under `gsd-core/bin/lib/` (except the 2 checked-in files) as a mistake; the gitignore entries enforce this for NEW files only — keep them complete (add vcs entries).

### Pitfall 6: Dependency/lockfile incoherence
**What:** the merged root `package.json` mixes both sides; installing against it executes unvetted lifecycle scripts and bakes a wrong lockfile.
**Avoid:** Bucket E resolution FIRST (upstream shape + fork identity + dep vetting + drop `fallow`), then ONE install, then build. `package-lock.json` / `pnpm-lock.yaml`: delete and regenerate per Open Q1's package-manager decision.

### Pitfall 7: Fork-only tests poisoning the adopted suite
**What:** ~60 SDK-infrastructure fork tests `require` deleted `sdk/` paths and crash the runner (not just fail); doc-parity tests pin fork counts that are wrong for upstream docs.
**Avoid:** test triage is its own task BEFORE the suite-green gate means anything; deletions ledgered; skip-count re-baselined with justification.

### Pitfall 8: `.cts` invisibility to fork lints (NEW — verified gap)
**What:** both `lint-vcs-no-raw-git` (`SCAN_EXT` line 63) and `lint-vcs-no-commit-id` (line 54) skip `.cts` — after the port, ALL production code is `.cts` and the gates pass vacuously green while violations accumulate.
**Avoid:** extend both SCAN_EXT regexes in the same plan that re-points allowlists; add a fixture test proving a `.cts` violation is caught (extend `lint-vcs-no-raw-git-fixture.test.cjs`).

### Pitfall 9: Launcher root-resolution on jj-only repos (NEW — verified)
**What:** `_runtime-launcher.snippet.sh` resolves RUNTIME_ROOT via `git rev-parse --show-toplevel || pwd`; on a jj-only repo every workflow invoked from a subdirectory resolves the wrong root and gsd-tools probes fall through to global installs (silent wrong-binary execution).
**Avoid:** patch the snippet jj-aware (e.g. try `jj workspace root` before pwd fallback); note the snippet text is EMBEDDED in workflow files via sync (`scripts/sync-runtime-launcher.cjs` + `sync:launcher` npm script) — fix the snippet THEN re-sync, don't edit 108 workflows by hand.

### Pitfall 10: Exec-shape half-unification (NEW)
**What:** fork `ExecResult{…timedOut…}` vs upstream `SpawnResultOutput{…signal…}` — "cleaning up" one into the other mid-port breaks either the 58 ported vitest tests (which assert the fork shape, WR-06 sentinel `-1`) or upstream's 214 tests (exitCode 127 ENOENT convention).
**Avoid:** port fork modules byte-for-behavior; leave upstream's seam intact for substrate use; unification is v1.5-scope (deferred item).

### Pitfall 11: Workflow re-wiring clobbering upstream 1.4.x fixes
**What:** the fork's workflow deltas were written against 05-21 base text; applying them blindly onto upstream's heavily-revised workflows (execute-phase has #48/#683/#630 logic the fork never saw) can delete upstream's new guards.
**Avoid:** chunk-8 re-application is three-way-aware: fork delta (base→fork) applied onto upstream text hunk-by-hunk; where both sides touched the same section (worktree dispatch in execute-phase/quick), re-express upstream's NEW semantics (base-mismatch degrade, manifest pinning) through fork verbs rather than choosing a side.

### Pitfall 12: Mid-resolution lint noise mistaken for regressions
**What:** all gates exit 1 against the half-merged tree (markers split fences); counts are meaningless until files are marker-free and re-pointing lands.
**Avoid:** evaluate gates per-wave on resolved files only; the full-tree run is the phase gate. Allowlist baseline = 26 entries pre-re-pointing (pass-1 verified; CONTEXT's "24" is stale).

### Pitfall 13: jj footguns under the locked constraints
**What:** `vpzlrrlv` and `zrxommmz` legitimately carry conflicts; only `@` must end clean; rewriting parents is forbidden.
**Avoid:** all edits in the working copy; per-task commits on top; never target revisions at or below `vpzlrrlv`; no `jj op restore`/`undo`.

## State of the Art (revised posture)

| Concern | Upstream now | Fork now | Phase 19 posture |
|---|---|---|---|
| Runtime source | `src/*.cts`, tsc build-at-publish → `gsd-core/bin/lib/*.cjs` (ADR-457) | hand-written CJS + SDK TS dual-sync | **adopt upstream**; fork's dual-sync discipline retires |
| VCS abstraction | single `execGit` seam, git-only, zero jj | VcsAdapter, dual backend, unified revision model | **port fork layer in**; migrate seam call sites |
| Runtime dir | `gsd-core/` | `get-shit-done/` | adopt `gsd-core/` |
| CLI for workflows | `gsd_run query <verb>` → gsd-tools | `gsd-sdk query <verb>` → SDK CLI | converge on `gsd_run`; retire `gsd-sdk` |
| Packaging | npm single package `@opengsd/gsd-core` | pnpm workspace `get-shit-done-cc` + `@gsd-build/sdk` | upstream shape + fork identity (Open Q1/Q2) |
| Tests | node:test `tests/*.cjs` + c8 + Stryker; no vitest | node:test + sdk vitest | upstream layout + vitest revival for ported jj suite (Open Q3) |
| Worktree parallelism | raw git worktree + base-ref degrade (#683) | `vcs.workspace.parallel.*` | fork verbs in workflows; upstream worktree modules as git substrate |
| Hooks | `.githooks/` repo hooks (stale paths), `hooks/lib/git-cmd.js` classifier | `.githooks/<stage>` fired by adapter (hook-bridge) | rewrite `.githooks` content for new tree; keep firing contract |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `gsd-core/workflows/` ↔ fork `get-shit-done/workflows/` per-file identity (108=108 count match; per-file identity spot-checked, not exhaustively diffed) | Counterpart Map | a renamed workflow gets the wrong fork delta — cheap per-file check at plan time |
| A2 | Registry legitimacy of upstream devDeps (typescript@6, eslint9 stack, stryker, fast-check, c8) [ASSUMED — slopcheck unavailable, uv-only machine; names well-known] | Package Legitimacy | verify `npm view <pkg> version` per package before Wave-0 install |
| A3 | Fork Phases 15–18 artifacts on disk are shipped behavior (STATE.md says pending; scripts + allowlist=26 exist at c7bd6bee) | Lint Re-pointing | gate baselines could be mid-flight; confirm with operator |
| A4 | vitest can run `.test.ts` files importing `.cjs` specifiers under nodenext against `.cts` sources [ASSUMED — standard vitest behavior, not executed in this session] | Test Porting | fallback: tests become `.test.cts` or consume built artifacts via node:test |
| A5 | The 214 upstream-only tests pass against a clean upstream checkout (we adopt them assuming upstream CI was green at 03764dbc — a release-tagged hotfix) | Test Porting | pre-existing upstream failures get triaged, not fixed, per Claude's discretion |
| A6 | `worktree-safety.cts` as git-backend substrate (disposition (b)) preserves all jj-side behavior because jj parallel dispatch never touches it | Seam Inventory | if any shared workflow path calls worktree verbs under jj, it needs a jj-aware guard (verify during chunk 8) |

## Open Questions

1. **Package manager (Wave-0 blocker):** *(RESOLVED — 19-CONTEXT.md locked decisions)* upstream is npm single-package (`engines.npm>=10`, committed `package-lock.json`, scripts internally call `npm run`); CONTEXT's locked text says "adopt upstream's packaging shape (pnpm workspace)" — but upstream has NO pnpm and, post-SDK, no workspaces to manage. Both work (pnpm installs single-package repos fine; both pnpm and npm are on PATH this session).
   - Recommendation: **single-package manifest per upstream; pick ONE lockfile** — npm (`package-lock.json`, maximal upstream parity) or pnpm (`pnpm-lock.yaml`, fork convention; drop `pnpm-workspace.yaml` as there are no workspaces). Operator pick at discuss; default npm for cheapest future pulls.
2. **Fork identity fields:** *(RESOLVED — 19-CONTEXT.md locked decisions)* `name`/`version` for the resolved root package (fork root was `get-shit-done-cc@1.50.0-canary.0`; CONTEXT cites `@opengsd/get-shit-done-redux` lineage precedent). Also the installer bin name (`gsd-core` vs fork name). Needed before Bucket E lands.
3. **vitest revival vs node:test conversion** *(RESOLVED — 19-CONTEXT.md locked decisions)* for the 58 ported vcs tests (recommend revival — §Test Porting option 1).
4. **`commit` verb routing:** *(RESOLVED — 19-CONTEXT.md locked decisions)* replace upstream `cmdCommit` internals with adapter routing (single calling convention, recommended) vs adding a parallel vcs-namespaced verb (two commit paths, drift risk).
5. **Doc-parity/drift-count tests** *(RESOLVED — 19-CONTEXT.md locked decisions)* (architecture-counts, command-count-sync, inventory parity, ~10 files): re-derive against the adopted docs or drop + ledger (recommend drop + ledger this phase; re-introduce as a fork follow-up if wanted — counts churned massively upstream).
6. **`worktree-base-ref.cts` jj story:** *(RESOLVED at plan time — 19-07 context: worktree-base-ref = git-only substrate)* jj-aware re-implementation vs git-only with jj no-op ("workspaces don't share the base-mismatch failure mode"). Affects execute-phase chunk-8 text.
7. **Upstream `.changeset/` (465 archived fragments) + changeset tooling:** *(RESOLVED — adopted-upstream, ledgered in 19-01)* retained with the tree by default; confirm the fork wants upstream's changeset history present (cheap to keep; ledger either way).

## Environment Availability (re-verified this session)

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node | everything | ✓ | v26.2.0 (engines `>=22`) | — |
| npm | install/build under upstream shape | ✓ | 11.13.0 | — |
| pnpm | only if Open Q1 = pnpm | ✓ (`/opt/homebrew/bin/pnpm` — **present now; pass-1's "missing" is stale**) | — | corepack 0.34.0 also present |
| jj | all VCS ops | ✓ | 0.41.0 | — |
| rg | sweeps/lints | ✓ | (note: `grep` on this machine is ugrep — avoid PCRE lookaheads in scripted gates) | — |
| node_modules | tsc/tests | ✗ absent | — | Wave 0 install AFTER manifest resolution |
| `gsd-core/bin/lib/*.cjs` artifacts | gsd-tools dispatch, tests | ✗ never built here | — | `npm run build:lib` (or run-tests self-build) |

**Missing with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Frameworks | `node:test` via `scripts/run-tests.cjs` (repo `tests/**/*.test.cjs`, suite-by-suffix); vitest (revived, fork-owned config) for ported `src/vcs/__tests__/` — pending Open Q3 |
| Config files | `tsconfig.build.json` (build = typecheck gate, `noEmitOnError`); fork vitest config (new, Wave 6); `stryker.config.mjs` (adopted, NOT a phase gate) |
| Quick run | `node scripts/run-tests.cjs --suite unit`; `npx vitest run` (ported suite) |
| Full suite | `node scripts/run-tests.cjs` + ported vitest suite, both with `GSD_TEST_BACKENDS` covering git and jj cells |

### Phase Requirements → Test Map
| Req | Behavior | Test Type | Automated Command | Exists? |
|-----|----------|-----------|-------------------|---------|
| MERGE-01 | zero conflicts + zero markers | smoke | `jj st` (no conflict warning at `@`); `rg -l '^(<<<<<<<\|%%%%%%%\|>>>>>>>)'` empty modulo fixture-exclusion list | ✅ commands exist |
| MERGE-02 | ledger completeness (no silently-lost fork capability) | sweep + review | `comm -23 <(jj file list -r c7bd6bee sdk get-shit-done tests\|sort) <(jj file list -r @ sdk get-shit-done tests\|sort)` — every line maps to a `19-MERGE-AUDIT.md` row; plus `rg -n 'gsd-sdk' --glob '!.planning/**'` returning only ledgered hits | ✅ |
| MERGE-03 | build green; CJS parses | build | `npm run build:lib` (tsc -p tsconfig.build.json, includes ported `src/vcs/`); `for f in <hand-edited .cjs>; do node -c "$f"; done` | ✅ after Wave 0 |
| MERGE-04 | tests green both backends; skip baseline | full suite | `node scripts/run-tests.cjs` + ported vitest run (git + jj cells via `GSD_TEST_BACKENDS`); `node scripts/check-skip-count.cjs` against re-derived baseline | ❌ Wave 0/6 gaps below |
| MERGE-05 | re-pointed lint gates green | lint | `node scripts/lint-vcs-no-commit-id.cjs && node scripts/lint-vcs-no-raw-git.cjs && node scripts/audit-workflow-raw-git.cjs && node scripts/lint-vcs-parallel-call-presence.cjs` — after SCAN_EXT `+cts`, SCAN_ROOTS → gsd-core, allowlist re-point, baseline re-derive | ✅ scripts run today; re-pointing is Wave 6 |
| PORT-01 | jj invariants survive the port | unit/integration | ported `src/vcs/__tests__/` suite green, esp. `cmd-parallel-{jj,git}`, `jj-hooks` (githooks firing), `jj-status-log-diff`, contract tests with `toBeIdOf` (no commit_id from jj) | ❌ Wave 6 |
| PORT-02 | dispatch chain end-to-end | smoke | `node gsd-core/bin/gsd-tools.cjs --help`; one invocation per verb family incl. `query` meta-prefix (`query commit`, `query log`, `query workspace.parallel.dispatch --help`-probe); launcher snippet sourced in a jj-only cwd resolves the right root | ❌ Wave 3 |
| AUDIT-01 | seam migration complete or justified | sweep + ledger | `rg -n "execGit\(" src -g '*.cts'` — every remaining call site is in an allowlisted substrate module; `rg 'execSync\|execFileSync' src -g '*.cts'` returns zero outliers; commit-id lint green over `.cts`; ledger row per substrate exception | ✅ commands exist |

### Sampling Rate
- **Per task commit:** `node -c` for touched `.cjs`; marker scan on touched files; `npm run build:lib` if `src/` touched; relevant single lint script on resolved files.
- **Per wave merge:** `--suite unit` + ported-vitest quick run + the four gates (on re-pointed state for waves ≥6, per-file before that).
- **Phase gate (priority 1):** ordered — marker sweep → MERGE-02 comm/ledger proof → install (post-manifest) → `npm run build:lib` → `node -c` loop → full node:test suite → ported vitest suite both backends → check-skip-count → 4 re-pointed lint gates → identity/alias drift checks (`check:alias-drift`, `check:identity-drift` per upstream scripts) → dispatch smoke (PORT-02).

### Wave 0 Gaps
- [ ] Resolve `package.json` (upstream shape + fork identity per Open Q1/Q2) + delete `sdk/package.json`/lockfiles per bucket E BEFORE first install
- [ ] Vet upstream devDeps on the registry (`npm view <pkg> version` per A2); drop `fallow` optionalDep + ledger
- [ ] `npm install` (or pnpm per Open Q1) + `npm run build:lib` — proves upstream src compiles in-tree before any port work
- [ ] Baseline test run `node scripts/run-tests.cjs --suite unit` — record pre-port failure set (fork-only leftovers expected to crash until triage)
- [ ] Build the conflict-marker fixture-exclusion list once (files legitimately containing markers)
- [ ] Open `19-MERGE-AUDIT.md` with ledger schema (path | origin side | disposition | justification) — accumulates from Wave 0

## Sources

### Primary (HIGH confidence — verified in-session against this repo)
- `jj resolve --list` — 75-path conflict inventory (pass 2 re-verification)
- `jj file list/show -r {b533f718, c7bd6bee, 03764dbc}` — tree shapes, upstream package.json/tsconfig.build.json/gitignore/launcher/run-tests/test.yml, fork sdk/vcs modules + package.json + workflows + bin CJS
- `rg` over the clean upstream trees in the merged working copy (`src/`, `gsd-core/`, `agents/`, `hooks/`) — execGit seam + call-site counts, outliers, workflow fence classification, zero jj mentions, zero `.git/hooks` refs
- Case-list diff of fork vs upstream `gsd-tools.cjs`; `query` meta-prefix at gsd-tools.cjs:344–346
- Scripted greps over ALL fork prompt surfaces at c7bd6bee — `gsd-sdk query` verb usage inventory (raw output preserved in session tool-results)
- ESM-construct scan of all 36 fork vcs production modules (no import.meta/export-default)
- `comm` of tests/ file lists — 147 fork-only / 214 upstream-only
- Live reads of the four gate scripts + both allowlists (SCAN_EXT/SCAN_ROOTS/baseline lines cited by number)
- Environment probes (node/npm/pnpm/corepack/jj on PATH)
- `.planning/MERGE-REVIEW-upstream-2026-05-25.md`, `19-CONTEXT.md`, `.planning/STATE.md`

### Secondary (MEDIUM)
- Upstream commit titles + CHANGELOG as feature descriptions (pass 1; bodies mostly unread)
- Pass-1 counts not re-verified in pass 2 (silent-deletion 310/278/64, commit-id 16-site tally, upstream-delta commit clusters) — methodology documented in pass 1

### Tertiary (LOW)
- A4 (vitest + nodenext `.cts` resolution) — training knowledge, not executed here

## Metadata

**Confidence breakdown:**
- Merge topology / deletion-side mapping: HIGH (pass-1 verified, pass-2 re-spot-checked)
- Upstream architecture / build / dispatch: HIGH — read from the tree this session
- Raw-git seam inventory: HIGH for `src/` (rg-counted); MEDIUM for workflow-fence counts (pattern-dependent; the re-derived baseline uses the audit script's own counter)
- Porting mechanics: HIGH on translatability (verified construct scan); MEDIUM on effort sizing (line-count proxies)
- Test porting: HIGH on inventory; MEDIUM on vitest-revival mechanics (A4)
- Strategy: LOCKED by operator — this document plans under it, not around it

**Research date:** 2026-06-10 (pass 2)
**Valid until:** until any new commit lands on either parent line or the working copy advances (re-verify `jj resolve --list` if the stack changes)
