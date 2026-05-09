# Feature Research — Git → jj Operational Mapping

**Domain:** VCS adapter port (git → Jujutsu) for GSD
**Researched:** 2026-05-09
**Confidence:** HIGH for documented jj commands; MEDIUM for behavioral-fidelity edge cases (especially worktree/workspace and concurrency); LOW for hook workarounds (the ecosystem is in flux as of mid-2026).
**Downstream consumer:** `REQUIREMENTS.md` and the `sdk/src/vcs/` adapter interface.

This document is **operation-centric**, not user-feature-centric. Each row in the tables below is a git operation that GSD currently invokes; the question for v1 is "what does the adapter do when called from a jj backend?" The standard "Table Stakes / Differentiators / Anti-features" framing is repurposed:

- **Direct map** ↔ Table Stakes: mechanical translation, low fidelity risk
- **Semantic shift** ↔ Differentiators-shaped (must redesign call site, but doable)
- **No analog** ↔ Anti-features-shaped (designed from scratch — v1 risk surface)
- **jj-only opportunities** ↔ deferred wins (capabilities GSD gains by going jj-native — flagged for future phases, **not v1 scope**)

---

## Operation Mapping

### 1. Direct map (mechanical translation)

These operations have a 1:1 jj equivalent with effectively identical behavior. The adapter wraps shell-out either way.

| Git operation | jj equivalent | Notes | Complexity | Fidelity risk |
|---|---|---|---|---|
| `git status` | `jj status` (alias `jj st`) | jj output mentions "Working copy : <change-id>" plus changed files. Parser must change. Use `--no-pager` and `-T <template>` for stable output. | S | LOW |
| `git diff` | `jj diff` | jj diff defaults to working-copy commit (`@`) vs its parent. Supports `--from`/`--to`. Output format differs (e.g. inline color); use `--git` flag for git-format diff. | S | LOW |
| `git log` | `jj log` | jj log defaults to a graph view of mutable commits (`mutable()`); pass `-r ::@` or `-r 'all()'` to widen. **Templating mandatory** for scripting (`-T builtin_log_oneline` or custom). | M | LOW once template is stable |
| `git ls-files` | `jj file list` | Lists files at a revision (default `@`). Adapter contract should pass revision explicitly to keep parity. | S | LOW |
| `git blame <path>` | `jj file annotate <path>` | Output formatting differs; commit IDs are jj's hex commit IDs (still git-compatible in colocated mode, but jj also has change IDs). | S | LOW–MEDIUM (output parsing) |
| `git config --get/--set` | `jj config get`/`jj config set` | jj has explicit scope flags: `--user`, `--repo`, `--workspace`. Maps cleanly to git's `--global`/`--local`. **Per-repo config stored outside the repo** (not inside `.jj/`). | S | LOW |
| `git remote add/remove/list/set-url` | `jj git remote add/remove/rename/set-url/list` | Subcommand names match closely. | S | LOW |
| `git fetch <remote>` | `jj git fetch --remote <remote>` | jj fetches into git's storage layer (colocated) or its own (non-colocated) and updates tracking bookmarks. | S | LOW |
| `git push <remote> <branch>` | `jj git push --remote <remote> --bookmark <name>` | Push semantics align; jj also supports `--all`, `--allow-new`. **Important:** jj refuses to push untracked bookmarks to existing remote bookmarks (safety feature). | S–M | MEDIUM (safety-check surfaces) |
| `git init` | `jj git init [--colocate]` | `--colocate` creates both `.git` and `.jj`; this is GSD's preferred mode (matches dogfood repo). | S | LOW |
| `git clone <url>` | `jj git clone <url> [--colocate]` | Same as above. | S | LOW |
| `.gitignore` | `.gitignore` (jj reads it natively) | jj uses its own ignore engine but consumes `.gitignore`, `.git/info/exclude`, and `core.excludesFile` from git config. **Re-tracking gotcha:** files newly matching `.gitignore` need `jj file untrack`. | S | LOW |
| `git tag` | `jj tag` | Same surface, fewer subcommands than git's tag UX. Read-only operations easy; signing not supported in jj. | S | LOW–MEDIUM (signing) |

**Sources:** [Git compatibility – jj docs](https://docs.jj-vcs.dev/latest/git-compatibility/), [CLI reference – jj docs](https://docs.jj-vcs.dev/latest/cli-reference/), [Bookmarks – jj docs](https://docs.jj-vcs.dev/latest/bookmarks/), [Config – jj docs](https://docs.jj-vcs.dev/latest/config/).

---

### 2. Semantic shift (similar concept, different model)

These operations have a jj equivalent, but the underlying model differs enough that the adapter must do more than rename. Test impact is real — many existing tests encode git-specific behavior that has no jj counterpart.

| Git operation | jj equivalent | Semantic difference | Complexity | Fidelity risk | Test impact |
|---|---|---|---|---|---|
| `git commit -m "msg"` | `jj commit -m "msg"` (closes current change, opens new empty change on top) **or** `jj describe -m "msg"` (sets description without closing) | jj has no staging area — *all* working-copy changes are auto-snapshotted into the change `@`. `jj commit` finalizes and creates a new empty `@`; `jj describe` only sets the message. GSD's call-site intent matters: "commit current state with this message" → `jj commit -m`. | M | MEDIUM | Tests that grep for `git commit -m` strings or assert post-commit working-tree-is-clean must learn that jj always has a `@` change (often empty, never "clean" in git's sense) |
| `git commit --amend` | `jj describe -m "newmsg"` (message only) **or** `jj squash` (fold `@` into its parent) | "Amend" decomposes: amending a *message* is `jj describe`; amending *content* into the previous commit is `jj squash` (which moves `@`'s changes into `@-` and leaves `@` empty). | M | MEDIUM | Hotfix flows that rely on `--amend` semantics need to choose explicitly between describe and squash |
| `git branch <name>` | `jj bookmark create <name>` | jj has no "current branch" — bookmarks don't move automatically with new commits. After `jj commit`, the bookmark stays on the old commit; user must `jj bookmark move`. | M | **HIGH** | Any test asserting "branch advances on commit" will fail; GSD's branch-tracking logic must be redesigned |
| `git checkout <ref>` / `git switch <ref>` | `jj new <ref>` (new change on top of `<ref>`) **or** `jj edit <ref>` (move `@` onto `<ref>` itself) | `git checkout` is overloaded (branches, files, detached HEAD); jj splits these. Default GSD intent ("move working copy to ref to start work") is `jj new <ref>`. `jj edit` is closer to git's detached-HEAD checkout. | M | MEDIUM | Worktree-attachment tests (`bug-2924-worktree-head-attachment`) need a jj-equivalent invariant — "what does it mean for a workspace to be 'attached' to a bookmark in jj" is a design question |
| `git checkout <path>` (restore file) | `jj restore <path>` | Restores file content from another revision (default: `@-`). Works at file granularity. | S | LOW |
| `git rebase <onto>` | `jj rebase -d <onto>` | jj rebase is **conflict-tolerant**: conflicts are recorded in commits and you continue working; no "rebase in progress" state. Descendants auto-rebase whenever any commit is rewritten. | M | MEDIUM–HIGH | Tests asserting "rebase fails on conflict" or "rebase leaves repo in mid-rebase state" don't apply; GSD verify gates may need to learn to detect "this commit has unresolved conflict markers" via `jj log -r 'conflict()'` |
| `git cherry-pick <rev>` | `jj duplicate <rev> -d @` **or** `jj rebase -r <rev> -d @` | `jj duplicate` keeps the original; `jj rebase -r` moves it. GSD cherry-pick flows (canary/hotfix) want `duplicate`. | M | MEDIUM | Hotfix-cherry-pick tests need duplicate semantics + explicit destination |
| `git merge <ref>` | `jj new <parent1> <parent2>` (creates merge change with two parents) | jj merges by creating a multi-parent change directly; no separate "merge commit" syntax. Conflicts are recorded in the change rather than blocking. | M | MEDIUM | Merge-flow tests need to drop "fast-forward" reasoning; jj has no FF concept |
| `git reset --hard <ref>` | `jj abandon @` then `jj new <ref>` **or** `jj edit <ref>` (depending on intent) | "Throw away current work and move to ref" decomposes into abandon + new. Note: abandoned changes remain in op log; truly destructive recovery is via `jj op restore`. | M | MEDIUM | Reset-driven cleanup tests must not assert "commit gone from reflog" — jj keeps it in op log indefinitely |
| `git reset --soft <ref>` | `jj squash --from @ --into <ref>` (rough analog) **or** `jj rebase` + `jj abandon` | "Move HEAD but keep working tree" doesn't translate cleanly because jj has no separate working tree. The right adapter behavior depends on *why* GSD calls `--soft`. | L | HIGH | Any GSD code that does `git reset --soft` to manipulate index state needs a per-call-site redesign |
| `git rev-parse HEAD` | `jj log -r @ -T 'commit_id' --no-graph` | `@` is the working-copy revision. Use `--no-graph` and `-T` to get a clean ID. **Caveat:** in colocated mode, `@`'s commit ID matches what git sees as HEAD; in non-colocated mode, jj has its own commit IDs that may differ from git's. | S | LOW (colocated), MEDIUM (non-colocated) |
| `git rev-list <range>` | `jj log -r '<revset>' -T 'commit_id' --no-graph` | jj's revset language is more expressive; `..`, `::`, ancestors, descendants, intersection/union/negation. Adapter should expose revset strings as the canonical "range" type and translate at the git boundary. | M | LOW once revset is standardized |
| `git stash` | **No direct equivalent.** Idiomatic jj: `jj new` on a sibling change to "set aside" current work, return via `jj edit <stash-change>`. Or simply do nothing (work-in-progress is already a commit). | jj's auto-snapshot model makes stashing largely unnecessary — your in-progress work is always a real change you can `jj edit` back into later. GSD's stash usage (if any in the worktree-safety code) should be re-examined: the *intent* is "preserve uncommitted state across context switches," which jj satisfies by default. | M (if used) | MEDIUM | Tests expecting `git stash list` populated must be removed or rewritten |
| `git worktree add <path> <ref>` | `jj workspace add --name <name> -r <ref> <path>` | Both create a separate working directory backed by the same repo. jj workspaces have richer semantics (each has its own `@` recorded as a separate working-copy commit named `<name>@`); changing `@` in workspace A *does not* affect workspace B's `@`, but `update-stale` is needed when the underlying repo state shifts beneath you. | L | **HIGH** | Worktree edge-case tests (`bug-2774`, `bug-2924`, `bug-3097/3099`, etc.) encode git-specific invariants — many will need parallel jj-version invariants designed from scratch |
| `git worktree list` | `jj workspace list` | Output format differs; templating recommended. | S | LOW |
| `git worktree remove <path>` | `jj workspace forget <name>` + manual rmdir | jj's `forget` removes the workspace from tracking *but does not delete the directory*. Adapter must rm the dir explicitly. | S–M | MEDIUM (cleanup ordering) |
| `git pull` | `jj git fetch` + `jj rebase` (or operation-log-aware merge) | jj has no `pull` because rebase-on-fetch isn't the only sensible default. GSD pull-equivalent flows must explicitly fetch then rebase. | M | LOW (just decompose) |
| `git add <path>` / `git rm <path>` / `git mv` | **Mostly no-op:** jj auto-tracks. `jj file track <path>` only needed for files matching `.gitignore`. `jj file untrack` to stop tracking. Renames detected automatically by content similarity. | jj has no index. "Stage this change" is meaningless; the change is already in `@`. Adapter: most `git add` calls become no-ops on the jj backend. | S | LOW (most call sites) / MEDIUM (call sites that depend on staged-vs-unstaged distinction) | Tests that assert "file is staged" or "file is in index but not committed" must be retargeted to "file is in `@` but `@` has not been finalized via `jj commit`" |

**Sources:** [Git comparison – jj docs](https://docs.jj-vcs.dev/latest/git-comparison/), [Working copy – jj docs](https://docs.jj-vcs.dev/latest/working-copy/), [Revsets – jj docs](https://docs.jj-vcs.dev/latest/revsets/), [Bookmarks – jj docs](https://docs.jj-vcs.dev/latest/bookmarks/), [CLI reference – jj docs](https://docs.jj-vcs.dev/latest/cli-reference/).

---

### 3. No analog (must be designed from scratch — v1 risk surface)

These operations have **no jj counterpart**. Each requires a design decision in the adapter contract.

| Git operation | Why no analog | Design options for v1 | Complexity | Fidelity risk |
|---|---|---|---|---|
| Pre-commit hook (`.githooks/pre-commit`) | jj has no native hook system. The maintainers have stated native hooks are eventual but not imminent ([discussion #403](https://github.com/jj-vcs/jj/discussions/403)). Pre-commit is structurally hard for jj because there's no "just-created commit at HEAD" moment — the working copy is always already a commit. | (a) **Wrapper-binary approach:** ship a `jj-gsd` shim that intercepts `jj commit`/`jj describe`, runs hooks, then delegates. (b) **Colocation-only approach:** rely on the colocated `.git/hooks/pre-commit` continuing to fire when users run git operations (won't fire on pure-jj operations). (c) **Op-log polling:** background daemon detecting new operations and running hooks post-hoc (changes hook semantics from blocking to advisory). (d) **Defer to `jj fix`:** for lint/format hooks only, use `jj fix` which is jj's native equivalent for content-rewriting tools. | L | **HIGH** — different semantic model; some hooks just don't fit |
| Pre-push hook (`.githooks/pre-push`) | Same root cause; somewhat easier because push *is* an explicit operation. | Adopt or fork [`acarapetis/jj-pre-push`](https://github.com/acarapetis/jj-pre-push) — wraps `jj git push`, identifies bookmarks, runs hooks per-bookmark, restores state. Requires colocation. **Recommended for v1.** | M | MEDIUM (third-party tool, evolving API) |
| `.git/index.lock` (concurrency primitive) | jj has no index. Its concurrency model is the operation log: ops are atomic ref updates with op-head merging. Concurrent ops produce divergent op heads which jj surfaces (and the user resolves via `jj op log` / `jj op restore`). | GSD's worktree-staggering logic (`worktree-safety.cjs`) currently uses `.git/index.lock` as a coarse mutex. **Replacement:** explicit file-lock primitive in the adapter (e.g. `flock` on a `.planning/.gsd-vcs.lock` sentinel file). Do NOT try to map onto jj's op-head model — that's a different layer. | M | **HIGH** — bug-2774 / bug-3097 / bug-3099 logic depends on this |
| `git worktree lock <path>` / `git worktree unlock` | jj has no workspace lock concept. | Same as above — implement a sentinel-file lock owned by the adapter. | S | MEDIUM |
| `git worktree prune` | jj has no equivalent. `jj workspace forget` is manual. Stale workspace detection happens via `jj workspace update-stale`, but that's about op-log staleness, not directory absence. | Adapter implements prune as: `jj workspace list` + filesystem-existence check + `jj workspace forget` for missing entries. | M | MEDIUM |
| `git reflog` | jj has the operation log instead, which is **strictly more powerful** but structured per-operation, not per-ref. | Adapter exposes "history of ref X" by combining `jj op log` with revset queries. For v1, GSD's reflog usage (rare) can be approximated by `jj op log` + manual filtering. | M | LOW (unlikely to break anything in v1) |
| `git submodule` | jj has no submodule support. | Out of scope for v1 — GSD doesn't use submodules per touchpoint scan (only `.gitmodules` path-safety mention). Document as known limitation. | — | — |
| `git notes` | jj has no notes equivalent (commit metadata is via change description + the op log). | GSD doesn't appear to use git notes. Document as known limitation. | — | — |
| `git bisect` | jj has experimental support via third-party tools but no first-party `jj bisect`. | GSD doesn't appear to invoke bisect programmatically. Out of scope. | — | — |

**Sources:** [Git hooks discussion #403](https://github.com/jj-vcs/jj/discussions/403), [jj-pre-push tool](https://github.com/acarapetis/jj-pre-push), [Operation log – jj docs](https://docs.jj-vcs.dev/latest/operation-log/), [Pre-commit integration issue #405](https://github.com/jj-vcs/jj/issues/405).

---

### 4. jj-only opportunities (defer to future phases — NOT v1 scope)

Capabilities GSD gains by going jj-native. Flag these in the adapter design so v1 doesn't block them, but don't implement them in v1.

| Capability | Value to GSD | Effort | Phase target |
|---|---|---|---|
| **Op-log-backed `/gsd-undo`** | Today GSD's undo is bespoke. jj's `jj op restore <op-id>` is a single, atomic, fearless undo across *all* refs at once. Wiring `/gsd-undo` to jj's op log on the jj backend gives genuinely better UX with little code. | M | After v1 parity ships |
| **Conflict-tolerant rebase for milestone integration** | jj records conflicts *in commits* rather than blocking on them. Milestone integration phases that today require manual conflict resolution could continue automatically with conflict markers carried in change content; verify-gate detects and surfaces them. | L | After v1, post-dogfood |
| **Auto-rebase descendants on commit edit** | `/gsd-edit-commit` (or equivalent) becomes trivial — any rewrite auto-propagates. Today this is manual rebase chains. | M | Phase 2+ |
| **Change IDs as stable identifiers** | jj change IDs are stable across rewrites; commit IDs are not. Workflow tracking (which phase produced which change) becomes stable across hotfixes/squashes. | M | Phase 2+ |
| **Templating for stable scripted output** | `-T <template>` produces scripted output that is more stable than git's porcelain modes. Adapter v2 could use templates universally; v1 just needs *some* template for each parsed call site. | M | Already partially required for v1 (per-command), but a unified template strategy is a v2 win |
| **Concurrent workspaces without index-lock contention** | jj's op-log model is lock-free across workspaces. GSD's worktree-stagger logic could be relaxed on jj backend (don't add the sleep delays that exist for git). | S | Optional v1 optimization; safer to defer |
| **`jj fix` for in-tree fixers** | GSD's auto-fixers (lint, format) could pipe through `jj fix` to apply uniformly across stacked phase commits without manual rebase. | M | Phase 2 |

**Sources:** [Operation log – jj docs](https://docs.jj-vcs.dev/latest/operation-log/), [Git comparison – jj docs](https://docs.jj-vcs.dev/latest/git-comparison/), [Templates – jj docs](https://docs.jj-vcs.dev/latest/templates/).

---

## Operation Dependencies (adapter design implications)

```
Adapter interface contract
    └──requires──> stable revision-pointer abstraction (commit-id OR change-id)
                       └──requires──> revset string as canonical "range" type

Worktree primitive
    └──requires──> Workspace primitive (jj backend)
        └──requires──> Adapter-owned file-lock (replaces .git/index.lock)
            └──requires──> Workspace-path-safety guards (bug-2774 / bug-3097-3099)

Hook primitive (jj backend)
    └──requires──> wrapper-binary OR pre-push tool
        └──conflicts with──> non-colocated jj (most workarounds need .git)

Push primitive
    └──requires──> Bookmark primitive (jj backend)
        └──conflicts with──> "current branch auto-advances" mental model
```

### Dependency notes

- **Revset-string-as-range:** GSD currently passes git revisions as raw strings (`HEAD`, `origin/main`, `HEAD~3`). The adapter contract should formalize this as a `RevisionExpr` type that the git backend feeds to git verbatim and the jj backend translates (`HEAD` → `@`, `HEAD~3` → `@---`, `origin/main` → `main@origin`). Without this, every call site does ad-hoc translation.
- **Workspace-path-safety + file-lock:** GSD's existing worktree-safety code (`bug-2774`, `bug-3097-3099`) protects against deleting/clobbering active worktree dirs. On jj this is *more* important because `jj workspace forget` doesn't delete the directory — adapter must own the directory lifecycle.
- **Hook + non-colocated conflict:** every viable hook workaround for v1 assumes colocated jj. The roadmap should mark non-colocated-jj hooks as a Known Limitation for v1, with a follow-up phase to revisit when upstream jj ships native hooks.

---

## v1 Scope Definition

### Launch With (v1 — full git→jj parity)

The non-negotiable adapter contract. Every call site in `bin/lib/{core,verify,commands,worktree-safety,init,graphify,drift}.cjs` and `sdk/src/query/{commit,init,verify,progress,check-ship-ready,check-decision-coverage,docs-init}.ts` must route through these.

- [ ] **commit/describe** — direct map: `jj commit -m`, with `describe`-vs-`commit` policy decided per call site
- [ ] **status / diff / log** — direct map with stable templates (`-T builtin_log_oneline` or custom)
- [ ] **branch + checkout** — semantic shift: bookmark + `jj new`/`jj edit` (branch-doesn't-auto-advance is a v1 behavior, not a bug to fix)
- [ ] **revset/rev-parse abstraction** — adapter exposes `RevisionExpr` type; jj backend translates
- [ ] **worktree → workspace** — semantic shift with full bug-test parity (bug-2774 / 2924 / 3097-3099 must pass on jj backend)
- [ ] **adapter-owned file lock** — replaces `.git/index.lock` for cross-workspace serialization
- [ ] **rebase / cherry-pick / merge** — semantic shift with **conflict-detection-via-revset** policy: `jj log -r 'conflict()'` after every rewrite to surface unresolved conflicts to the verify gate
- [ ] **reset --hard / abandon** — decomposed semantic-shift mapping
- [ ] **add/rm/mv** — mostly no-op on jj backend; document the call sites where staged-vs-unstaged distinction matters and choose explicit semantics
- [ ] **stash** — no analog; audit existing call sites and replace with `jj edit` round-trips OR mark unused and remove
- [ ] **push / fetch / pull** — direct map for push/fetch; pull decomposes
- [ ] **config / remote** — direct map
- [ ] **gitignore** — works as-is in colocated mode
- [ ] **pre-commit / pre-push hooks** — colocated-only for v1: rely on git-side hooks firing when `.git/hooks/*` exists, plus optional `jj-pre-push` adoption for pre-push on jj-native push paths

### Add After Validation (v1.x — once dogfood proves stable)

- [ ] **Non-colocated jj support** — same adapter contract, hooks marked unsupported
- [ ] **Native jj-side pre-commit** via wrapper binary (replaces colocation-only constraint)
- [ ] **Templating-driven output parsing** for log/status/blame (reduces fragility of parsing human output)

### Future Consideration (v2+)

- [ ] **`/gsd-undo` backed by `jj op restore`** — major UX win, modest code
- [ ] **Conflict-tolerant milestone integration** — uses jj's in-commit conflict markers
- [ ] **Change-ID-based phase tracking** — stable across rewrites, enables fearless milestone reshape
- [ ] **`jj fix` integration for in-tree formatters/linters**
- [ ] **Workspace-stagger relaxation** on jj backend (drop the safety sleeps)

---

## Adapter Surface Prioritization Matrix

Per-operation priority for the v1 adapter. "User value" here means "GSD workflow value" — does it block a GSD command from working on jj?

| Operation | GSD workflow value | Implementation cost | Priority | Notes |
|---|---|---|---|---|
| commit/describe | HIGH | LOW | P1 | Used in nearly every workflow |
| status/diff/log | HIGH | MEDIUM (templates) | P1 | Output parsing is the work |
| worktree↔workspace + lock | HIGH | HIGH | P1 | Largest single risk; bug-test parity required |
| revset/rev-parse abstraction | HIGH | MEDIUM | P1 | Foundational — without it, every call site duplicates translation |
| rebase/cherry-pick/merge | HIGH | MEDIUM | P1 | Conflict-detection policy decision |
| reset (hard/soft) | MEDIUM | MEDIUM | P1 | Per-call-site decomposition |
| branch/checkout (bookmark + new/edit) | HIGH | MEDIUM | P1 | "No current branch" is a real model shift |
| add/rm/mv | LOW (mostly no-op) | LOW | P1 | Cheap to ship, blocks nothing |
| push/fetch | HIGH | LOW | P1 | Direct map |
| config/remote | MEDIUM | LOW | P1 | Direct map |
| gitignore | HIGH | NONE | P1 | Works for free |
| stash | LOW | LOW (mostly remove) | P2 | Audit and likely delete call sites |
| pre-commit hook | HIGH | HIGH | P1 (colocated-only) | Risk-bounded by colocation requirement for v1 |
| pre-push hook | MEDIUM | MEDIUM | P1 (jj-pre-push or skip) | Adopt third-party tool or document gap |
| reflog → op log | LOW | MEDIUM | P3 | GSD rarely invokes reflog |
| submodules | NONE | — | — | Out of scope, not used by GSD |
| notes | NONE | — | — | Out of scope, not used by GSD |
| op-log undo | HIGH (UX) | MEDIUM | P3 (v2+) | Defer; major win, but not parity |

**Priority key**
- P1: Must have for v1 launch (full parity)
- P2: Should have, add when convenient
- P3: Future / v2+

---

## Behavioral-Fidelity Risk Register (concentrated v1 risks)

The following call-site clusters carry the highest behavioral-drift risk between git and jj backends. The adapter test matrix should include explicit parity tests for each:

1. **Worktree-path-safety guards** (bug-2774 / 3097 / 3099) — jj's `forget` doesn't delete dirs; lifecycle ownership shifts to adapter.
2. **Branch-tracking after commit** (`commit.ts`, `core.cjs`) — bookmarks don't auto-advance; GSD's "branch points to latest commit on phase X" assumption breaks.
3. **Conflict surfacing during rebase** (`commands.cjs` rebase paths) — jj rebase succeeds with conflicts; verify gate must learn `jj log -r 'conflict()'`.
4. **`git reset --soft` call sites** — likely each one needs unique decomposition; audit individually.
5. **Cross-workspace concurrency** (`worktree-safety.cjs`) — `.git/index.lock` is gone; new sentinel-lock primitive must serialize.
6. **Hook firing in non-colocated repos** — silently doesn't fire in v1; needs Known Limitation doc + warning.
7. **Output parsing** — `git log --format=...` is widely depended on; jj template syntax is different. Per-command stable templates required.

---

## Sources

Verified jj documentation (May 2026):

- [Git comparison – jj docs](https://docs.jj-vcs.dev/latest/git-comparison/) — HIGH confidence (official, current)
- [Git compatibility – jj docs](https://docs.jj-vcs.dev/latest/git-compatibility/) — HIGH confidence
- [Working copy – jj docs](https://docs.jj-vcs.dev/latest/working-copy/) — HIGH confidence
- [CLI reference – jj docs](https://docs.jj-vcs.dev/latest/cli-reference/) — HIGH confidence
- [Bookmarks – jj docs](https://docs.jj-vcs.dev/latest/bookmarks/) — HIGH confidence
- [Revsets – jj docs](https://docs.jj-vcs.dev/latest/revsets/) — HIGH confidence
- [Operation log – jj docs](https://docs.jj-vcs.dev/latest/operation-log/) — HIGH confidence
- [Config – jj docs](https://docs.jj-vcs.dev/latest/config/) — HIGH confidence
- [Templates – jj docs](https://docs.jj-vcs.dev/latest/templates/) — HIGH confidence

Hook ecosystem (more volatile):

- [jj-vcs/jj discussion #403 — git hook support](https://github.com/jj-vcs/jj/discussions/403) — MEDIUM (community discussion; maintainer confirmed direction but no timeline)
- [jj-vcs/jj issue #405 — pre-commit.com integration](https://github.com/jj-vcs/jj/issues/405) — MEDIUM
- [acarapetis/jj-pre-push](https://github.com/acarapetis/jj-pre-push) — MEDIUM (third-party tool, "very limited" by author's own description)

Cross-referenced internal:

- `/Users/LoganDark/Documents/Projects/get-shit-done/.planning/PROJECT.md`
- `/Users/LoganDark/Documents/Projects/get-shit-done/.planning/intel/git-touchpoints.md`

---

## Quality Gate Self-Check

- [x] Categories are clear (Direct map / Semantic shift / No analog / jj-only opportunity)
- [x] Every operation in the question list has a recommendation (15 operations + jj-only opportunities + scripting conventions + colocated-vs-not)
- [x] Behavioral fidelity risks called out explicitly (per-row column + Risk Register section)
- [x] jj documentation references included (verified via WebFetch on docs.jj-vcs.dev — current as of May 2026, not training data)

---

*Feature research for: VCS adapter port (git → jj) — operational mapping*
*Researched: 2026-05-09*
