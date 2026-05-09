# Pitfalls Research

**Domain:** Porting a worktree-heavy, hook-driven, ~5k LOC TypeScript+CJS Node toolchain (GSD) from git to Jujutsu (jj) as a second VCS backend; solo developer on a focused-sprint timeline; upstream-tracking hard fork.
**Researched:** 2026-05-09
**Confidence:** MEDIUM-HIGH (jj behaviors verified against official docs and tracking issues; abstraction/fork-management pitfalls verified across multiple primary sources; some "what bites in practice" claims are MEDIUM because the project category — automated, programmatic, multi-workspace, hook-firing jj wrappers — has limited prior art.)

---

## Critical Pitfalls

### Pitfall 1: Treating colocated jj as "git-with-extras" and freely interleaving git commands

**What goes wrong:**
GSD already has both `.git` and `.jj` and is running colocated. The temptation — especially under sprint pressure — is to "just shell out to git for the gnarly bits and use jj for the nice bits." This breaks two ways:
1. Mutating git commands (commit, reset, checkout, branch -d, fetch with prune) silently desync jj's internal state. The next jj command does an automatic `jj git import`, which can produce **divergent change IDs**, **conflicted bookmarks**, or **a branch pointer in the wrong place**. The official docs explicitly warn: "There may still be bugs when interleaving mutating jj and git commands, usually having to do with a branch pointer ending up in the wrong place."
2. Background processes (IDEs, direnv, `git status` in shell prompts, file-watchers) can run `git fetch` without user awareness, producing the same drift.

**Why it happens:**
The adapter abstraction makes both backends look interchangeable. Calling `git()` from a jj-backend code path looks fine in isolation, ships green tests, then explodes weeks later when a divergent change ID surfaces in production-ish dogfood usage. The colocated mode also lulls you into thinking "well, the .git is right there, why not?"

**How to avoid:**
- Adapter contract: **the jj backend never shells out to git** for state-mutating operations. Read-only inspection of git refs (`git rev-parse`, `git config`) is acceptable; mutation goes through `jj git`-prefixed commands or through `jj` directly.
- Lint rule (or a runtime assertion in dev mode): if `vcsBackend === 'jj'` and the call site invokes `git <mutating-verb>`, throw or warn loudly.
- Test fixture: a regression test that runs an "interleaved" sequence (jj op → git op → jj op) and asserts the change graph has not produced divergent IDs. If the adapter is hygienic this test is unreachable; the test exists to fail fast if a future commit reintroduces the temptation.
- For the dogfood repo (this very repo), document a "no manual `git commit/checkout/branch` in jj-backed surfaces" rule in `CLAUDE.md`.

**Warning signs:**
- `jj log` shows the same change ID appearing twice with different commit IDs (divergent).
- A bookmark suddenly shows as conflicted (`name??`).
- After running a GSD command, `jj st` reports the working copy is at an unexpected revision.
- `jj git import` runtime grows noticeably between releases (suggests packed-refs pollution).

**Phase to address:**
Foundation phase (VCS-01 through VCS-03). The adapter contract and the lint/assertion guard belong in the same change as the jj backend stub. Address before any per-command migration.

---

### Pitfall 2: jj's automatic working-copy snapshot fires on every command — silently amends GSD state

**What goes wrong:**
By default, almost every `jj` command snapshots the working copy at the start and amends the working-copy commit. GSD frequently does multi-step sequences: write a planning file → run `jj log` to inspect state → write another file → commit. Each intermediate `jj log` (or any read-only-looking jj invocation) re-snapshots, which means **a file written between two jj inspect calls is now in the working-copy commit before GSD intended to commit it**. This is the inverse of git's "you must `git add` before it's tracked" mental model.

Concrete failure modes:
- A planning file written mid-workflow ends up in the same commit as code changes, breaking GSD's commit-boundary invariants.
- A test that creates a file, runs `jj log` to verify state, then deletes the file and asserts "working copy is clean" fails because jj snapshotted between those steps and the file is in the working-copy commit's tree.
- Worktree-safety bugs (e.g., `bug-2924-worktree-head-attachment` analog): GSD checks "is HEAD attached?" by running a jj inspect command, which itself moves the working-copy pointer.

**Why it happens:**
Engineers porting from git assume read-only commands (`status`, `log`, `show`) are side-effect-free. In jj, only commands run with `--ignore-working-copy` are truly read-only.

**How to avoid:**
- Adapter rule: **every read-only jj invocation passes `--ignore-working-copy`** unless the call site has explicitly opted in to snapshot semantics.
- Centralize `jj` invocation in one helper (mirrors the `execGit()` seam GSD never had on the git side); have it default `--ignore-working-copy` and require an opt-in flag for snapshot-on-read.
- Unit test: invoke a sequence of read-only adapter methods between two `vcs.status()` calls and assert the working-copy commit ID is unchanged.

**Warning signs:**
- Test failures of the form "expected working copy to be empty, found N files" where N grew after a recent refactor that added a `vcs.log()` call.
- "Stale working copy" errors in another workspace immediately after running a query in this one (because the snapshot rewrote the working-copy commit, and any sibling workspace depending on it became stale — see Pitfall 4).

**Phase to address:**
Foundation (VCS-01). The default-`--ignore-working-copy` policy is a one-line adapter design decision; getting it wrong forces re-audit of every call site later.

---

### Pitfall 3: `jj workspace` and `git worktree` are NOT 1:1 — semantic mapping is design-heavy

**What goes wrong:**
GSD's worktree code carries hard-won bug history: `bug-2924-worktree-head-attachment`, `bug-2774-cleanup-workspace-safety`, `bug-3097/3099-worktree-path-safety`, `bug-2075-deletion-safeguards`, `bug-2431-locked-surfacing`, `bug-2015-base-branch`, `bug-2388-no-branch-rename`. A naive port that maps `git worktree add` → `jj workspace add` and `git worktree remove` → `jj workspace forget` will silently regress several of these:

| Git bug class | Carries to jj? | Why / why not |
|---|---|---|
| Worktree HEAD attachment (`bug-2924`) | **No analog** | jj has no detached HEAD concept; change IDs serve the role. Test must be rewritten to assert "workspace's working-copy commit is the expected change ID," not "HEAD points to a branch." |
| Worktree path safety (`bug-3097/3099`, `bug-2774`) | **Yes — same** | Path-injection / symlink / `..` traversal hazards are filesystem-level; orthogonal to VCS. Tests carry over verbatim. |
| Worktree deletion safeguards (`bug-2075`) | **Partial** | `jj workspace forget` does NOT delete the working-copy directory on disk. GSD's "delete the worktree" semantics need a two-step on jj: `jj workspace forget` + filesystem `rm -rf`. Accidentally calling only one of them produces an orphan workspace OR an orphan directory. |
| Worktree locked-surfacing (`bug-2431`) | **No direct analog** | jj has no "lock" primitive equivalent to `git worktree lock`. Either drop the feature on jj backend, or design a sentinel-file convention. |
| Base-branch detection (`bug-2015`) | **Different mechanism** | jj uses bookmarks (which don't auto-move on commit) instead of branches. "Base branch" semantics map to "tracked remote bookmark," but the detection heuristic differs. |
| No-branch-rename (`bug-2388`) | **Inverted** | In jj, bookmarks are explicit pointers; renaming a bookmark is `jj bookmark move`/`forget`+`set`. The "git auto-renames branch on push" pitfall does not exist. The new pitfall is "bookmark didn't auto-advance to follow my new commit, and I pushed an old position." |

Additionally: **jj workspaces share the underlying repo via `.jj/working_copy/`** — they're not independent clones. If workspace A rewrites a commit that workspace B's working-copy commit depends on, B becomes stale and `jj workspace update-stale` is required. GSD's parallel-phase execution will hit this: phase A on workspace 1 amends a shared ancestor, phase B on workspace 2 now needs an update step that has no git analog.

**Why it happens:**
The mapping looks 1:1 in shallow comparison ("both have multiple working dirs sharing one repo"). Deep semantics differ in non-obvious ways. Solo developers under sprint pressure tend to skip the deep-dive and hit the bugs at integration time.

**How to avoid:**
- Before writing the workspace adapter (WS-01), write a **semantic equivalence table** for every git-worktree operation GSD uses, mapping to the jj equivalent and flagging the "no analog" cases. This becomes the adapter contract.
- For each existing worktree bug-fix test, decide explicitly: (a) carries verbatim, (b) needs jj-equivalent reformulation, (c) git-specific — gate behind backend check. Document the decision.
- Add a stale-working-copy probe: after any cross-workspace mutating operation, the adapter checks if siblings became stale and surfaces it (or auto-runs `jj workspace update-stale`). Treat "stale working copy" as a first-class adapter concern, not an exception users debug.
- Don't try to emulate `git worktree lock` on jj — design the staggering primitive (WS-02) on top of jj's actual concurrency model (file-based lock at `.jj/working_copy/lock` plus the lock-free op log).

**Warning signs:**
- A worktree test passes on git but the equivalent jj test was "skipped pending design" and never came back.
- Dogfood usage produces "stale working copy" errors that GSD doesn't surface clearly.
- A workspace-forget operation leaves a directory behind that later GSD runs trip over (file conflicts, "directory exists" errors).

**Phase to address:**
A dedicated workspace-mapping phase (between adapter foundation and per-command migration). Don't bury this inside "port worktree-safety.cjs to adapter" — it's design-heavy and needs its own slot. Verifies via WS-01/02/03 plus all `bug-XXXX-worktree-*` tests passing on jj.

---

### Pitfall 4: Concurrency model mismatch — no `.git/index.lock` analog

**What goes wrong:**
GSD's parallel-phase execution implicitly relies on git's `.git/index.lock` for serialization: two `git commit` invocations in the same worktree race for the lock and the second blocks/fails fast. jj has a fundamentally different concurrency model:
- The repo state itself is **lock-free** — concurrent jj invocations just produce a fork in the operation log, which jj resolves by re-running the most recent op as a merge of the divergent ops.
- Working-copy snapshots are protected by a **single file lock at `.jj/working_copy/lock`** (one per workspace).
- Cross-workspace coordination has no built-in serialization at all.

Failure modes for GSD's parallel-phase model:
1. Two GSD-spawned agents hit the same workspace simultaneously: one blocks on the working_copy lock, the other proceeds. Behavior depends on lock-acquisition order — non-deterministic.
2. Two agents in different workspaces both rewrite the same ancestor commit: both succeed (lock-free), but the op log now has divergent operations and one of the resulting workspaces is stale.
3. A GSD command interrupted mid-operation (Ctrl+C, OOM, timeout) leaves the working copy stale; the next invocation needs `jj workspace update-stale` or it operates on incorrect state. There's a known issue (jj #7538) about frequent stale-working-copy errors.

**Why it happens:**
The mental model "lock contention = git index.lock" is hardwired into GSD's worktree-safety layer. jj's lock-free design means parallel ops complete instead of serializing — which is sometimes what you want and sometimes catastrophic.

**How to avoid:**
- Adapter operation `vcs.acquireWriteLock(workspace)`: on git, no-op (kernel-enforced via index.lock). On jj, takes an explicit advisory lock (e.g., flock on a sentinel file under the workspace) for cross-workspace serialization where GSD needs it.
- For mutating operations that touch shared ancestors (rebase, squash), serialize at the GSD layer — don't rely on jj to detect the conflict.
- After every interrupted operation, **always** check for and recover from stale working copies before proceeding. Build this into the adapter's `vcs.beforeCommand()` hook.
- Document the "no kernel-level mutex" constraint in `WS-02`'s acceptance criteria.

**Warning signs:**
- "Stale working copy" errors appearing in CI flakiness (intermittent, hard to reproduce).
- Divergent operations in `jj op log` after a parallel-phase run.
- Two phases producing commits with the same change ID but different commit IDs (divergent change).

**Phase to address:**
Workspace-mapping phase, paired with `WS-02`. The advisory-lock primitive belongs in the adapter, not bolted onto individual commands.

---

### Pitfall 5: Hook implementation strategy will be re-litigated three times if not designed up front

**What goes wrong:**
jj has **no native hook system**. The PROJECT decided "Hooks ported jj-native (not just relying on colocation)" — but the implementation strategy has three viable paths, each with non-trivial gotchas:

1. **Wrapper command** (replace `jj` binary with a shell script that fires hooks then delegates):
   - PATH ordering is fragile — if user's shell PATH puts the real jj first, the wrapper doesn't fire.
   - If the wrapper is in `~/bin/jj` and the user's IDE spawns jj via absolute path (`/opt/homebrew/bin/jj`), bypassed entirely.
   - Recursive invocation: if the hook itself runs `jj something`, you re-enter the wrapper. Need a sentinel env var (`GSD_JJ_WRAPPER_DEPTH`) to break recursion.
   - Security: a wrapper that lives in the repo is a code-execution vector; CI must be aware.
   - On macOS, codesigning/quarantine attributes can break a binary-replacement strategy; shell wrappers are safer but slower.

2. **Op-log polling** (background process watches `jj op log` for new operations and fires hooks after the fact):
   - Inherently post-hoc — you cannot reject a commit, only react to it.
   - Polling latency vs. CPU tradeoff; jj has no inotify-based "operation completed" signal.
   - Race: hook fires after op N completes but before op N+1, and op N+1 changes what op N produced.

3. **Colocated git hooks fire on git side** (HOOK-03 in PROJECT):
   - Works when colocated, doesn't work for non-colocated jj users.
   - Triggers only on `jj git push` and `jj git commit` paths, not on pure-jj operations like `jj describe` or `jj squash` that GSD relies on.
   - The PROJECT decision says don't rely solely on this.

If the team picks one approach during implementation without having written the comparison up front, the first time a hook misfires (during dogfood) you re-pick. Then the first time the wrapper-PATH fails on someone's machine, you re-pick again. Each re-pick is ~3-5 days of churn.

**Why it happens:**
The ecosystem is genuinely thin (jj #403, jj #3577 — both still open). There is no canonical "this is how you do jj hooks" pattern. Solo developers tend to pick the path of least immediate resistance, which is whichever the first attempt looked like.

**How to avoid:**
- Before writing any hook code, write a 1-page Decision Record: comparison of the three approaches against GSD's specific hook moments (pre-commit on `jj describe`, pre-push on `jj git push`, possibly post-mutate hooks). Pick one primary, explicitly note the fallback. This is one of the deferred decisions to revisit at first usable checkpoint.
- For wrapper-command approach: use a Node.js or sh script (not a binary), and resolve the real `jj` via `which jj` excluding the wrapper's own directory (or via a recorded absolute path in config). Do not rely on PATH-shadowing alone.
- Build the hook layer in a way that's swappable — a `Hook` interface with a `WrapperHook` and a future `OpLogPollingHook` implementation. Cost is low (one interface), benefit is high (changing strategies is mechanical).
- Test the hook fires on every jj command GSD invokes (matrix: command × backend × hook-strategy).

**Warning signs:**
- Hooks fire in dev but not in CI (PATH difference).
- Hooks fire twice for one operation (wrapper recursion).
- Hooks don't fire for a specific jj subcommand the team forgot to enumerate.

**Phase to address:**
Dedicated hooks-design phase before HOOK-01/02 implementation. Output: ADR + interface stub. Implementation phase then has a clean target.

---

### Pitfall 6: Test suite stays green by skipping, not by porting

**What goes wrong:**
GSD has ~80 git-touching tests. Under sprint pressure, the path of least resistance is:
1. Adapter migration breaks half the tests.
2. Tests are tagged `.skip` "until adapter migration completes."
3. Skipped tests accumulate; coverage looks fine because vitest reports "150 passing" without flagging the skipped count loudly.
4. Months later, a worktree edge case (`bug-2924`-class) regresses on jj backend; the test that would have caught it has been skipped since week 2.

The TEST-01/02/03/04 acceptance criteria explicitly require "all worktree edge-case bug tests pass on jj backend" — but PR-level discipline is what enforces it.

**Why it happens:**
Skipping a test feels like a small reversible decision; un-skipping it is "I'll do it after this milestone." Solo developer + no PR reviewer + sprint deadline = the un-skip never happens.

**How to avoid:**
- CI rule (or a pre-push hook): **the count of `.skip`/`xit`/`it.todo` tests does not increase from main**. If a PR skips a test, it must un-skip another or document the migration ticket.
- Track test-migration progress as a visible counter (e.g., `tests-on-jj/tests-on-git` ratio). Add to repo README or a status file. Make regression visible.
- Adopt **parameterized testing** from day one (TEST-02) instead of duplicating: a `describe.each([['git'], ['jj']])` harness means every test runs on both backends or fails clearly. No "I'll add the jj version later" because there is no separate jj version.
- For tests that genuinely need a backend-specific implementation (the `bug-2924` worktree-attachment-style tests), use `it.runIf(backend === 'jj')` with explicit reasoning in the test name, not `.skip`.

**Warning signs:**
- "Tests passing" count rising while the matrix coverage isn't.
- The list of skipped tests in vitest output growing across commits.
- A bug fix that lands without a corresponding jj-backend test.

**Phase to address:**
Test infrastructure phase (TEST-01, TEST-02 — parameterized harness) must come **before** the bulk per-command migration. Building the harness first means every subsequent porting PR adds matrix coverage automatically.

---

### Pitfall 7: Adapter call sites become "leaky" — VCS specifics escape via return types

**What goes wrong:**
The "law of leaky abstractions" hits VCS adapters hard. Common leaks:
- Returning a "ref" string and downstream code does `.startsWith('refs/heads/')` — git-specific.
- Returning a commit SHA and downstream code does `sha.length === 40` checks — git-specific (jj has change IDs, ~16 chars in the default reverse-hex form).
- Surfacing error strings verbatim — `"fatal: not a git repository"` leaks from git, nothing equivalent surfaces from jj.
- Implicit assumption that "checkout" detaches HEAD or moves a branch — jj's equivalent (`jj edit`) does neither in the same way.
- Worktree paths returned with `.git/worktrees/...` substrings — none of those directories exist on jj.

Every leak becomes a future port-bug: code works on git backend, fails subtly on jj backend.

**Why it happens:**
Adapter design is usually right at the surface but wrong at the edges. The first 90% of adapter calls return clean abstractions; the last 10% return git-shaped data because that's what the git implementation produced and "the test passed."

**How to avoid:**
- Design the adapter with **VCS-neutral return types**: `Commit { id: string, parent: Commit[] }` (don't say "SHA"); `Ref { name: string, kind: 'branch'|'bookmark'|'tag', target: Commit }`. The type system carries the abstraction.
- Forbid passing raw error messages from the underlying tool through the adapter — wrap in `VcsError { kind: 'NotARepo'|'Conflicted'|'Stale'|... , detail: string }`.
- Audit at adapter contract finalization: grep for `.git`, `refs/`, `HEAD`, `40` (SHA length), `origin/` in code that consumes adapter return values. Each hit is a leak.
- For genuinely git-specific operations that have no jj equivalent (e.g., reflog inspection): expose them under a `vcs.gitOnly` namespace that throws on jj backend, so leaks are explicit not implicit.

**Warning signs:**
- A test that constructs a fake commit object using a `'a'.repeat(40)` SHA — implies the type assumed git format.
- Code paths that branch on `id.length` or `id.match(/^[a-f0-9]+$/)`.
- Error messages displayed to the user mentioning "git" specifically.

**Phase to address:**
Foundation (VCS-01). Type design and the leak audit happen as part of contract finalization. Re-audit at the end of each per-command migration phase (not just once).

---

### Pitfall 8: Upstream rebase conflicts compound — fork code intermixed with upstream code

**What goes wrong:**
The fork tracks upstream main via jj's anonymous-branch / live-rebase model. Conflicts surface as a function of:
- How many upstream files the fork modifies (more files = more conflict surface)
- How interleaved the fork's changes are with upstream's likely change patterns (changes inside hot-path functions = high conflict; changes in new sidecar files = zero conflict)
- How long between rebases (longer = more upstream churn to integrate)

The largest single anti-pattern is **inline rewrites in hotspot files**: GSD's top hotspots (`core.cjs` 2036 LOC, `verify.cjs` 1390, `commands.cjs` 1028) are upstream's hotspots too. Editing the same lines upstream edits = guaranteed conflicts every rebase.

**Why it happens:**
The "right" engineering instinct ("fix it in place where the original code is") maximizes conflicts. Solo developers don't usually weigh the rebase tax against code locality.

**How to avoid:**
- **Adapter-shaped changes are mechanical**: replace `execSync('git ...')` with `vcs.commit(...)`. Upstream's edits to surrounding code merge cleanly because the adapter call is a stable target. PROJECT already records this as a key decision; reinforce in code review (even if solo, in the commit-message discipline).
- **Sidecar files for jj-specific code**: `sdk/src/vcs/jj/*` is fork-only and never conflicts with upstream. `sdk/src/vcs/git/*` is the migration target for upstream's existing logic; conflicts are inevitable but localized.
- **Avoid mixed commits**: a commit that both refactors upstream code AND adds fork-specific behavior is the worst case for rebase. Split into two: one is mechanical refactor (rebases cleanly because upstream may have done similar refactor), one is fork-only addition (rebases cleanly because upstream didn't touch the new file).
- **Rebase frequently**: weekly cadence keeps each conflict surface small. Monthly is when forks die.
- Use `jj range-diff` analog (`jj log -r 'fork-commits'` against upstream) to identify commits that overlap with upstream changes; consider whether each is still needed.
- Track a "drift score": LOC modified in shared files vs. LOC in sidecar files. Rising ratio of shared-file modifications = early warning.

**Warning signs:**
- A rebase that produces conflicts in 5+ files (vs. typical 0-2).
- The same file conflicts in 3+ consecutive rebases — suggests the fork modifies a hotspot upstream is actively churning.
- A commit's diff shows changes scattered across many upstream files instead of concentrated in fork-owned files.

**Phase to address:**
Foundation phase establishes the adapter pattern and sidecar layout. UPSTREAM-02 acceptance is "fork-specific code organized to minimize conflicts" — verify by tracking conflict count per rebase as a metric.

---

## Moderate Pitfalls

### Pitfall 9: jj version churn — recently-deprecated aliases bite tooling

**What goes wrong:**
jj is pre-1.0 and renames things. Recent renames in current versions:
- `jj branch` → `jj bookmark` (deprecated alias still works but warns)
- `jj op undo` → `jj op revert`
- `jj obslog` → `jj evolution-log`/`jj evolog`
- Minimum git version raised to 2.41.0
- Per-repo config files (`.jj/repo/config.toml`, `.jj/workspace-config.toml`) moved out of repo

Code that hard-codes `jj branch` works today, prints deprecation warnings, breaks at some future jj release. CI logs fill with deprecation noise that masks real issues.

**How to avoid:**
- Use the current canonical names (`bookmark`, `op revert`, `evolog`) from day one.
- Pin a minimum jj version in adapter (`jj --version` check on startup), bail with a clear message if too old.
- Test against latest stable + one prior to catch regressions.

**Warning signs:** Deprecation warnings in CI output. New jj release breaks a test.

**Phase to address:** Foundation (VCS-03). Document the supported jj version range in adapter README.

---

### Pitfall 10: Performance — `jj git import` runtime grows with refs

**What goes wrong:**
On colocated repos, every jj command runs `jj git import` to sync git state. This scales with number of refs (branches, tags, remotes). Hot loops in tests that invoke many jj commands amplify the cost. Symptom: test suite that was 30s on git takes 4-5 minutes on jj.

**How to avoid:**
- Batch operations where possible (one `jj log` instead of N `jj show`).
- Run `jj util gc` periodically (in CI before test runs; in dogfood as a periodic chore).
- Be aware that the public-jj-binary fsmonitor on macOS has a known hang issue (jj #6440) — disable in test environments.
- For programmatic loops, prefer revset queries that return all needed data in one call.

**Warning signs:** Test runtime regressing on jj backend specifically. CI timing out.

**Phase to address:** Test infrastructure phase (TEST-02). Set a runtime budget (jj-backend tests no more than 2x git-backend) and track.

---

### Pitfall 11: Bookmarks don't auto-advance — stale push positions

**What goes wrong:**
Unlike git branches, jj bookmarks are explicit pointers that **do not move automatically when you create new commits**. After `jj new && jj describe`, the bookmark still points where it pointed before. `jj git push` pushes the bookmark's recorded position — i.e., the pre-new commit. Result: your local commits don't make it to the remote, but no error fires.

Common workflow: `jj git push --bookmark main` after a series of commits results in pushing whatever main pointed to last time it was moved.

**How to avoid:**
- Adapter `vcs.push()` for jj backend: explicitly `jj bookmark move <name> --to @-` (or appropriate target) before push.
- Document the "bookmark advance" step prominently in any GSD workflow that pushes.
- For workflows that auto-create branches (PR branches), use `jj git push --change @-` which auto-creates and tracks per-change bookmarks.

**Warning signs:** A push that "succeeded" but the remote doesn't show your latest work.

**Phase to address:** Per-command migration of push-touching commands (`/gsd-ship`, `/gsd-pr-branch`).

---

### Pitfall 12: Tags — jj only creates lightweight, can't create annotated

**What goes wrong:**
GSD uses tags for releases/canaries. jj can read annotated tags fine, can create lightweight tags, but **cannot create annotated tags**. If GSD's release flow does `git tag -a vX.Y.Z -m "..."` it has no jj equivalent and must shell out to git directly.

**How to avoid:**
- Identify all `git tag -a` call sites; route through adapter with a `vcs.createAnnotatedTag()` method. On jj backend, this method shells out to git via `jj git` if colocated, or fails fast on non-colocated with a clear message.
- Treat annotated tag creation as a known "git-only-for-now" operation; document in the adapter README.

**Warning signs:** Tag creation silently producing lightweight tags when annotated were expected (different signature/metadata visible on GitHub).

**Phase to address:** Per-command migration of release/hotfix flows.

---

### Pitfall 13: `.gitignore` semantics — "already tracked" files stay tracked

**What goes wrong:**
GSD uses `.gitignore` to keep planning artifacts out of commits. In jj, files that are **already tracked** stay tracked even if they later match an ignore pattern. Adding a path to `.gitignore` after the fact does not stop tracking; you need `jj file untrack`. GSD's "gitignored-planning rescue" tests assume git's "ignore-pattern-as-source-of-truth" semantics, which is wrong on jj.

**How to avoid:**
- Adapter method `vcs.ignorePath(path)`: on git, write to `.gitignore`. On jj, write to `.gitignore` AND run `jj file untrack` for the matching path if currently tracked.
- Tests that exercise gitignored-planning rescue need both code paths verified.

**Warning signs:** A planning file unexpectedly committed even though `.gitignore` includes it.

**Phase to address:** Per-command migration of planning-file-aware commands (verify, init).

---

### Pitfall 14: `jj git init --colocate` doesn't refuse to nest in a git worktree

**What goes wrong:**
The colocated workspaces tracking issue (jj #8052) explicitly lists "refusing to create a new Jujutsu repo in a Git worktree when running `jj git init --colocate`" as outstanding work. Today, doing so produces a corrupt nesting that's hard to recover from. GSD's `/gsd-new-project` workflow on jj backend must guard against this — don't just blindly invoke `jj git init --colocate` without checking we're not inside a `.git/worktrees/` subdirectory.

**How to avoid:**
- Adapter init operation: pre-flight check via `git rev-parse --git-common-dir` vs. `--git-dir`; if they differ, we're inside a worktree, refuse with a clear error.

**Warning signs:** `/gsd-new-project` invoked accidentally inside a worktree, leaves a broken `.jj` directory.

**Phase to address:** Per-command migration of init flows (GREEN-01).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Inline `if (backend === 'jj') ... else ...` branches in command code | Skip designing the right adapter method; ship the command this week | Every backend-conditional in command code is a future leak point; doubles the maintenance burden of every command | **Never** in `bin/lib/` or `sdk/src/` post-foundation. Acceptable in tests for explicitly-asymmetric edge cases (with a comment justifying). |
| Skip the `--ignore-working-copy` rule for "just one quick query" | One-line change instead of plumbing the flag | Silent working-copy snapshot in a read-only path causes a future "tests pass locally, fail in CI" mystery | Never in adapter implementation. Acceptable in throwaway diagnostic scripts. |
| Test-skipping under deadline ("I'll un-skip after milestone") | Green CI now | Skipped tests become invisible coverage holes; the un-skip almost never happens | Only with a tracked GitHub issue and CI rule that prevents net-new skips. |
| Wrapper script in shell instead of Node.js for the hook layer | Faster initial implementation | Recursion handling, error reporting, cross-platform behavior get gnarly fast; rewriting in Node later is significant | Acceptable for first prototype to validate the approach; rewrite to Node before relying on it. |
| Adapter returns raw stdout strings instead of typed records | Avoid type design upfront; "we'll parse later" | Every consumer parses independently, formats drift across backends, type leaks become invisible | Never for stable adapter operations. Acceptable for `vcs.gitOnly.escapeHatch()` style debug methods. |
| "Just shell out to git" for the one or two operations jj makes hard | Ship the command this week | Becomes the precedent — next time it's hard you do it again. Three of these and you've lost the abstraction. | Only with explicit "no jj equivalent" justification + a tracked issue + isolation in `vcs.gitOnly` namespace. |
| Hard-code `'main'` instead of detecting base branch via adapter | Skip a port for the first dogfood | Every fork user with a non-main default branch hits the same wall later | MVP only, behind config override; remove by first non-trivial dogfood. |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|---|---|---|
| GitHub Actions CI | Assuming `jj` is available; assuming colocated repo on CI agents | CI stays git-side per PROJECT decision; only run jj-backend tests locally or in a dedicated jj-CI lane with `jj` installed and version-pinned. |
| `pre-commit.com` framework | Expecting it to work with jj's no-staging-area model | jj has nothing staged; either pass `--files` from `jj diff --name-only @` (per Aazuspan blog) or run pre-commit against the working-copy commit explicitly. Document the exact recipe. |
| `direnv` / shell prompts | Background `git` calls drift jj state | Audit shell config in dogfood environment; either disable git-status-in-prompt for this repo or accept the perf cost. |
| `.changeset/` tooling | Uses `git log` to detect changed packages; will not see jj-only changes if non-colocated | PROJECT keeps `.changeset/` on git side. Document explicitly that on non-colocated jj this won't work. |
| Editor integrations (VS Code git, JetBrains) | Run git in background, can fight with jj's auto-import | Either accept the noise or configure the editor to disable git auto-fetch in this repo. |
| `gh` CLI | Authentication via `.envrc` (per CLAUDE.md) is fork-specific; ambient `gh auth` resolves to wrong creds | Already documented in CLAUDE.md; ensure adapter never invokes `gh` without the env var prefix. |
| Node `child_process` working directory | `cwd` is critical for jj — running `jj` from outside the workspace path produces confusing errors | Adapter always passes explicit `cwd` to `execSync`/`spawn`; never relies on `process.cwd()`. |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|---|---|---|---|
| N+1 jj invocations in a hot loop | Test runtime balloons on jj backend; per-command latency dominates | Batch via revset queries; cache adapter results within a command lifecycle | Hits at ~100 commits / ~50 refs in colocated mode. |
| `jj git import` running on every command without `jj util gc` | Linearly increasing command latency over weeks of use | Schedule periodic `jj util gc` (cron or pre-push hook); pack git refs | Hits at ~1000 refs accumulated; very visible at ~5000. |
| Hook layer firing on read-only commands | Every `jj log` invokes the full hook chain | Hooks scoped to mutating commands only; whitelist the verbs that fire hooks | Hits whenever GSD does inspect-heavy workflows (`/gsd-resume-work`). |
| Leaving snapshots on for read-only adapter calls | Working-copy commit ID changes between unrelated queries; downstream consumers see "stale" state and retry, doubling load | Default `--ignore-working-copy` for read paths (Pitfall 2). | Hits in any test that asserts on a stable working-copy ID across multiple adapter calls. |
| macOS fsmonitor on colocated repo | `jj git clone --colocate` hangs forever (jj #6440) | Disable git fsmonitor in this repo's `.git/config` or globally for jj users | Reproducible on macOS with `core.fsmonitor=true`. |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---|---|---|
| Wrapper-command for jj lives in repo at a known path | Repository compromise = arbitrary code execution on every `jj` invocation | Wrapper installed via opt-in to user's `~/bin`, not in repo. Repo provides install script + checksum. |
| Hook script reads commit message and execs based on content | Crafted commit message → command injection | Hooks treat all commit content as data; never `eval` / `sh -c` commit content. Use parameter-passing not string interpolation. |
| Adapter shells out with string-concatenation of user input (branch names, paths) | Shell injection via crafted bookmark/branch name | Always use array-form spawn with `shell: false`; never `execSync(\`jj show ${ref}\`)`. |
| `.envrc` token leaked into `jj describe` commit messages or `jj diff` outputs | Token exfiltration if commit pushed | Pre-commit hook scans for token patterns; `.gitignore` includes `.envrc`. (Already in place per CLAUDE.md — don't regress.) |
| Per-repo `hooks/jj.toml` allows arbitrary binary execution | Cloning a malicious repo = code execution on first jj command | Don't enable repo-level hook config; use user-level only. (jj design currently flags this as a security concern.) |

---

## UX Pitfalls (Developer-Facing — GSD as a tool)

| Pitfall | User Impact | Better Approach |
|---|---|---|
| Auto-detection picks the wrong backend silently | User in colocated repo expects jj behavior, gets git, confused by missing features | Detection logs the choice on first command; config file records it; `--vcs` flag overrides. |
| Error messages bubble raw jj/git stderr | "fatal: not a git repository" or "Error: The working copy is stale" with no GSD context | Wrap all VCS errors in `VcsError` with GSD-context message: "GSD couldn't snapshot workspace X (jj working copy stale). Run `jj workspace update-stale` or pass `--auto-recover`." |
| jj-specific concepts (change ID, bookmark, op log) leak into GSD docs without explanation | Git users porting projects to jj read GSD docs and bounce off | Glossary in GSD docs; jj docs use git-equivalent terminology in parens on first mention. |
| GSD picks a default that's wrong for one backend ("create branch X") | jj users see GSD trying to "create branch" — what GSD really means is "advance bookmark" | Backend-aware terminology in user-facing strings. |

---

## "Looks Done But Isn't" Checklist

- [ ] **Adapter contract:** All operations have both git AND jj implementations? Verify by `grep -r 'throw new Error.*not implemented'` in `sdk/src/vcs/jj/`.
- [ ] **Read-only invocations:** All read paths pass `--ignore-working-copy`? Verify by audit script: any `jj` invocation in adapter without the flag is flagged unless explicitly opted in.
- [ ] **Worktree bug tests on jj:** All `bug-XXXX-worktree-*` tests have jj-backend variants AND pass? Verify by test matrix output showing both backends green.
- [ ] **Concurrency advisory locks:** Any operation that mutates shared ancestors goes through `vcs.acquireWriteLock`? Verify by code review grep for cross-workspace mutations.
- [ ] **Stale working copy recovery:** Adapter handles stale state automatically OR surfaces clearly to user? Verify by Ctrl-C-mid-operation + next-command test.
- [ ] **Hook layer:** Hooks fire on every mutating jj command GSD invokes? Verify by enumerating mutating verbs and adding a fixture test per verb.
- [ ] **Bookmark advance before push:** Push paths advance bookmark first? Verify by integration test: commit → push → check remote shows new commit.
- [ ] **Annotated tag operations:** Tag-creation paths handle the lightweight-only constraint? Verify by release-flow test.
- [ ] **Init refuses inside git worktree:** `/gsd-new-project` on jj backend pre-flight checks for nested worktree? Verify with regression test.
- [ ] **Type design audit:** No `.git`, `refs/`, `40` (SHA length) in code consuming adapter return values? Verify by grep audit at adapter contract finalization.
- [ ] **Test-skip count:** Skipped test count not increased over baseline? Verify by CI metric.
- [ ] **Upstream rebase clean:** Last 3 rebases produced ≤2 conflicts each? Verify by rebase log.
- [ ] **Wrapper recursion guard:** Hook layer breaks recursion via env var? Verify by test that a hook running `jj log` doesn't infinite-loop.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---|---|---|
| Divergent change IDs from git/jj interleaving (Pitfall 1) | LOW-MEDIUM | `jj op log` → identify the divergent op → `jj op revert <op>` → re-do work cleanly through adapter only. If pushed, may need history rewrite. |
| Working copy snapshot pulled wrong files into commit (Pitfall 2) | LOW | `jj squash --interactive` to move files out of the working-copy commit; or `jj split` to separate. |
| Worktree-bug regression on jj (Pitfall 3) | MEDIUM | Triage which bug class (deletion safeguard, locked-surfacing, etc.); add jj-specific test; fix in adapter; backfill regression suite. |
| Stale working copy after parallel ops (Pitfall 4) | LOW | `jj workspace update-stale`; if data lost, `jj workspace update-stale` produces a recovery commit. |
| Wrong hook strategy chosen, doesn't fire reliably (Pitfall 5) | HIGH | Re-pick from the alternatives in the ADR; the swappable interface design (Pitfall 5 prevention) makes this 1-day swap instead of 1-week rewrite. Without it: weeks. |
| Skipped tests piled up, regression hits (Pitfall 6) | HIGH | Audit all skipped tests; un-skip + fix in dedicated cleanup phase; add CI rule to prevent recurrence. |
| Adapter leak discovered post-migration (Pitfall 7) | MEDIUM | Add typed wrapper; migrate consumers; backfill type-narrowing tests. Compounds if discovered late — every consumer touched. |
| Upstream rebase hits 20+ conflicts (Pitfall 8) | HIGH | Cherry-pick fork commits onto fresh upstream branch one at a time; redesign hot-conflict commits into adapter-shaped form; consider extracting fork-specific logic to sidecar. |
| jj version churn breaks adapter (Pitfall 9) | LOW | Pin to last working version; update adapter to use new canonical names; bump min version. |
| `jj git import` perf regression (Pitfall 10) | LOW | `jj util gc`; audit ref accumulation; prune stale remote-tracking refs. |
| Bookmark didn't advance, missing commits on remote (Pitfall 11) | LOW | Local commits aren't lost (jj never loses commits); advance bookmark, re-push. |
| Annotated tag created as lightweight (Pitfall 12) | LOW | Delete lightweight tag; create annotated via git directly; document the workaround in release flow. |
| Tracked file persists after `.gitignore` add (Pitfall 13) | LOW | `jj file untrack <path>`. |
| `jj git init --colocate` left corrupt nesting (Pitfall 14) | MEDIUM | Delete the inner `.jj`; verify outer git worktree intact; re-init outside the worktree. |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---|---|---|
| 1. Interleaved git/jj mutations | Foundation (VCS-01–03) | Lint/assertion guard fires in dev mode; interleaving regression test passes. |
| 2. Auto-snapshot side effects | Foundation (VCS-01) | `--ignore-working-copy` policy in adapter helper; audit grep clean. |
| 3. Worktree↔workspace mapping | Workspace-mapping phase (WS-01–03) | Semantic-equivalence table written; all `bug-XXXX-worktree-*` tests pass on jj. |
| 4. Concurrency model mismatch | Workspace-mapping phase (WS-02) | Advisory-lock primitive in adapter; stale-working-copy recovery in `vcs.beforeCommand`. |
| 5. Hook strategy churn | Hooks-design phase (pre HOOK-01) | ADR + swappable Hook interface; matrix test of hook firing across all GSD-invoked jj verbs. |
| 6. Test-skip drift | Test infrastructure phase (TEST-01–02) | Parameterized harness in place from day one; CI rule on skip count. |
| 7. Adapter leaks | Foundation + per-command migration | Type design audit at contract finalization; re-audit at end of each migration phase. |
| 8. Upstream rebase conflicts | Foundation (UPSTREAM-02) + ongoing | Sidecar layout established; conflict count tracked per rebase; weekly cadence. |
| 9. jj version churn | Foundation (VCS-03) | Min-version check on adapter init; canonical command names used. |
| 10. `jj git import` perf | Test infrastructure phase | Runtime budget set (≤2x git-backend); periodic `jj util gc`. |
| 11. Bookmark advance | Per-command migration (push surfaces) | Push integration test verifies remote shows pushed commit. |
| 12. Annotated tags | Per-command migration (release surfaces) | Release-flow integration test verifies annotated metadata. |
| 13. `.gitignore` semantics | Per-command migration (planning-aware commands) | Untrack-after-ignore regression test on jj backend. |
| 14. `jj git init --colocate` nested | Per-command migration (init surfaces) | Pre-flight check + regression test. |

---

## Solo Focused-Sprint Pitfalls (Cross-Cutting)

These are not domain-specific (jj or VCS) — they're solo-developer-under-deadline patterns that compound the above pitfalls. Worth calling out separately because the user is explicitly solo on a focused sprint.

### "I'll fix it later" debt
- The most common form here: skipping a test (Pitfall 6), inline-branching on backend (Tech Debt table), shell-script wrapper instead of Node hook (Pitfall 5).
- **Mitigation:** treat any "later" debt as a tracked GitHub issue tagged `port-debt` at the moment it's incurred. The 30 seconds of issue-filing pays for itself the first time you forget what "later" meant.

### Scope creep ("while I'm here, let me also...")
- The temptation: while migrating `core.cjs`, also rewrite the worktree pruning logic that's been bugging you. Now your adapter migration PR is also a worktree refactor — twice the conflict surface against upstream, twice the test failures, twice the review burden (even self-review).
- **Mitigation:** rule of thumb — adapter-migration changes and feature changes never share a commit. If you find a bug while migrating, open an issue and keep migrating.

### Test-skipping under deadline pressure
- See Pitfall 6. The CI rule is what enforces this when willpower fails.

### When to abandon adapter purity for shipping speed
- There **are** legitimate cases. Annotated tags (Pitfall 12) are one — building a perfect abstraction for a feature jj genuinely doesn't have is yak-shaving. The rule:
  - **Operation has clean jj equivalent** → adapter must abstract. No shortcuts.
  - **Operation has no jj equivalent or jj equivalent is genuinely worse** → expose under `vcs.gitOnly` namespace; document; treat as known limitation. Don't fake it.
  - **Operation is a hot-path GSD relies on for core value** → invest the time even if it's hard. Worktree mapping qualifies; shell-out shortcuts here will haunt for months.

### Brownfield-priority discipline
- PROJECT prioritizes brownfield workflows (BROWN-01–05) for first dogfood. Discipline: don't optimize commands the user isn't actually running yet. Greenfield workflows (GREEN-01–03) are out-of-priority within v1; complete them but don't gold-plate.

---

## Sources

### Primary (HIGH confidence)
- [Jujutsu — Git compatibility (official docs)](https://docs.jj-vcs.dev/latest/git-compatibility/) — colocated mode gotchas, interleaving warnings, conflict representation, push behavior, supported/unsupported features
- [Jujutsu — Working copy (official docs)](https://docs.jj-vcs.dev/latest/working-copy/) — automatic snapshot, `--ignore-working-copy`, ignore-pattern semantics
- [Jujutsu — Concurrency (official docs)](https://docs.jj-vcs.dev/latest/technical/concurrency/) — lock-free model, working_copy/lock, divergent ops handling
- [Jujutsu — Operation log (official docs)](https://docs.jj-vcs.dev/latest/operation-log/) — op log vs git reflog, undo semantics
- [Jujutsu — Bookmarks (official docs)](https://docs.jj-vcs.dev/latest/bookmarks/) — bookmark vs branch, no-auto-advance
- [Jujutsu — Divergent changes guide](https://docs.jj-vcs.dev/latest/guides/divergence/) — divergent change IDs, how they arise
- [Jujutsu — Working with GitHub](https://docs.jj-vcs.dev/latest/github/) — push tracking, detached HEAD on init
- [Jujutsu — Changelog](https://docs.jj-vcs.dev/latest/changelog/) — recent breaking changes (`branch`→`bookmark`, `op undo`→`op revert`, `obslog`→`evolog`, min git version)

### Issue tracker (HIGH confidence — primary source for known bugs)
- [jj #8052 — Tracking issue for colocated workspaces](https://github.com/jj-vcs/jj/issues/8052) — outstanding work on colocated mode, including `jj git init --colocate` not refusing inside git worktrees
- [jj #403 — Does jj have git hook support?](https://github.com/jj-vcs/jj/discussions/403) — current state of hooks, why pre-commit doesn't translate
- [jj #3577 — FR: Generalized hook support](https://github.com/jj-vcs/jj/issues/3577) — hook design discussion
- [jj #405 — Integrate with pre-commit.com](https://github.com/jj-vcs/jj/issues/405) — pre-commit framework gap
- [jj #6440 — `jj git clone --colocate` hangs forever on macOS with fsmonitor](https://github.com/jj-vcs/jj/issues/6440)
- [jj #6203 — Frequent issues with `.git/packed-refs`](https://github.com/jj-vcs/jj/issues/6203)
- [jj #1042 — `git checkout` in colocated repo may abandon old HEAD](https://github.com/jj-vcs/jj/issues/1042)
- [jj #7538 — Frequent errors: `The working copy is stale`](https://github.com/jj-vcs/jj/issues/7538)
- [jj #5224 — Show summary of working-copy snapshot changes](https://github.com/jj-vcs/jj/issues/5224)

### Practitioner reports (MEDIUM confidence — single-source unless cross-referenced)
- [Automating Pre-Push Checks with Jujutsu — Aazuspan](https://www.aazuspan.dev/blog/automating-pre-push-checks-with-jujutsu/) — wrapper-script pre-commit recipe
- [Using Jujutsu in a colocated git repository — cuffaro.com](https://cuffaro.com/2025-03-15-using-jujutsu-in-a-colocated-git-repository/) — practical colocated gotchas
- [Demystifying Jujutsu (jj) Workspaces — Joshua Lyman](https://www.joshualyman.com/2026/02/demystifying-jujutsu-jj-workspaces/) — workspace semantics
- [Jujutsu worktrees are very convenient — Shaddy](https://shaddy.dev/notes/jj-worktrees/) — workspace vs git-worktree practical comparison
- [Jujutsu From The Trenches — Matt Hall](https://mattjhall.co.uk/posts/jujutsu-from-the-trenches.html) — real-world hook/wrapper experience
- [Running Jujutsu with Claude Code Hooks — Matthew Sanabria](https://matthewsanabria.dev/posts/running-jujutsu-with-claude-code-hooks/) — closest published prior art for "AI-agent-driven jj wrapper" use case
- [Avoid Losing Work with Jujutsu (jj) for AI Coding Agents — Anthony Panozzo](https://www.panozzaj.com/blog/2025/11/22/avoid-losing-work-with-jujutsu-jj-for-ai-coding-agents/) — programmatic-agent + jj patterns
- [Tech Notes: The Jujutsu version control system — neugierig.org](https://neugierig.org/software/blog/2024/12/jujutsu.html) — surprises and rough edges
- [Tech Notes: Understanding Jujutsu bookmarks — neugierig.org](https://neugierig.org/software/blog/2025/08/jj-bookmarks.html) — bookmark non-auto-advance gotcha

### Abstraction / fork-management theory (MEDIUM confidence)
- [The Law of Leaky Abstractions — Joel Spolsky / lawsofsoftwareengineering.com](https://lawsofsoftwareengineering.com/laws/law-of-leaky-abstractions/)
- [Being friendly: Strategies for friendly fork management — GitHub Blog](https://github.blog/2022-05-02-friend-zone-strategies-friendly-fork-management/) — atomic commits, sidecar layout for upstream-tracking forks
- [LLVM out-of-tree target sync discussion](https://discourse.llvm.org/t/how-to-keep-out-of-tree-target-in-sync-with-upstream/68027) — long-running fork rebase patterns

### GSD-specific (HIGH confidence — internal)
- `.planning/PROJECT.md` — fork constraints, decisions, scope
- `.planning/intel/git-touchpoints.md` — porting surface
- Worktree bug history in upstream test names: `bug-2924-worktree-head-attachment`, `bug-2774-cleanup-workspace-safety`, `bug-3097/3099-worktree-path-safety`, `bug-2075-deletion-safeguards`, `bug-2431-locked-surfacing`, `bug-2015-base-branch`, `bug-2388-no-branch-rename`

---
*Pitfalls research for: GSD jj-port (porting worktree-heavy TS+CJS Node.js tool to dual-backend git/jj VCS)*
*Researched: 2026-05-09*
