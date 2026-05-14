# Phase 3: jj Backend Core — Squash, Refs, Conflict - Research

**Researched:** 2026-05-12
**Domain:** Jujutsu (jj) v0.41 CLI integration as the second `VcsAdapter` backend in `sdk/src/vcs/`
**Confidence:** HIGH on adapter contract + jj 0.41 behavior (CONTEXT.md is exhaustive; jj behavior verified locally on `jj 0.41.0-8276953`); MEDIUM on a small number of cross-version `json(self)` field-stability claims

<user_constraints>
## User Constraints (from CONTEXT.md)

All Phase 3 decisions are **locked** in `03-CONTEXT.md` and reproduced here for the planner's convenience. Where CONTEXT and ROADMAP/REQUIREMENTS disagree (only one significant case — see §Open Questions Q1 — the `conflict()` vs `conflicts()` revset spelling), CONTEXT.md takes precedence except where local empirical evidence forces a correction.

### Locked Decisions (D-01 … D-20)

- **D-01 — Explicit bookmark on `vcs.commit()`:** `CommitInput` gains `bookmark?: string`. When set, jj backend runs `jj bookmark set <gsd/name> -r <new_commit_change_id> -B` (i.e. `--allow-backwards`) after squash. Caller (Phase 4 orchestrator) owns the name. A4 hybrid auto-detect is deferred.
- **D-02 — Bookmark divergence is a typed error:** jj's `name??` divergent-bookmark state must surface as `VcsBookmarkDivergentError` (new type in `sdk/src/vcs/types.ts`) on any read/write touching bookmarks, not be swallowed.
- **D-03 — `gsd/` prefix is adapter-internal:** Callers pass `phase-3`; adapter adds `gsd/` on jj input, strips it on every jj-side read (`currentBookmarks()`, `bookmarks.list()`, etc.). Pinned by a round-trip test. Git backend stays pass-through.
- **D-04 — Raw-name escape via `{raw:true}`:** For non-gsd bookmarks (upstream `main`, `trunk`), `bookmarks.{create,move,set,delete}` accept `{raw:true}`; `CommitInput` gets a companion `bookmarkRaw?: string`. When `raw`, adapter does not add/strip the prefix.
- **D-05 — Strict-never on `--ignore-working-copy`:** jj backend never passes `--ignore-working-copy`, including on read methods (`log`, `status`, `diff`, `refs.exists`, `refs.resolveShort`, `refs.countCommits`, `findConflicts`). User-confirmed; explicitly overrides STACK.md's read-only-query recommendation.
- **D-06 — Caller-side pre-probe discipline:** Multi-step state inspection follows Phase 2.1 D-06 (the `cmdCommit`/`stagedOrUnstaged` pre-probe pattern in `bin/lib/commands.cjs`). No new adapter escape hatch (`vcs.test.readWithoutSnapshot`) introduced in Phase 3.
- **D-07 — Document the footgun:** `jj.ts` JSDoc on every read method notes "this command snapshots `@` at start — caller assumes no stray edits between this call and the next write." PITFALLS.md #2 is canonical reading for downstream agents.
- **D-08 — Hybrid: shape commit + verb-group fills:** Plan 1 lands the jj.ts skeleton (every verb throws `VcsNotImplementedError`) + parsers + CI install + matrix activation. Subsequent plans fill verb groups paired with tests.
- **D-09 — No long-lived feature branch:** Phase 3 lands on `main` / per-plan PR branches. CI allow-failure on jj-colocated absorbs the stub-throw window. Lint allowlist stays clean.
- **D-10 — ~5–7 plans, suggested ordering:** (a) shape commit; (b) exec helper + NDJSON parsers + jj-id translator; (c) refs (head/parent/bookmarks CRUD + currentBookmarks + resolveShort/exists/countCommits/rootCommits/remotes/isIgnored); (d) commit (squash) + bookmark advance per D-01; (e) status/log/diff; (f) findConflicts; (g) push/fetch + workspace contract-stubs + end-of-phase wrap-up.
- **D-11 — Two-track activation:** `baseline-parity.test.ts` runs `jj-colocated` from plan 1. Adapter-contract tests gate behind a per-verb allowlist that flips as verb groups land.
- **D-12 — Per-verb allowlist mechanism:** Fixture-level allowlist (`BACKENDS_AVAILABLE_FOR_VERB` map in `backends.ts` or a test helper) used by `vcsTest(kind)` to **throw-not-skip** when a verb isn't yet implemented on jj. Skip-not-throw is rejected (TEST-06 skip guard would silently mask drift).
- **D-13 — jj-native deferred to Phase 4.** Phase 3 only adds `jj-colocated` to the active matrix.
- **D-14 — CI pins jj 0.41.** Single matrix axis. Renovate-bumpable.
- **D-15 — CI install via release tarball.** Per CI-02. No `cargo install`.
- **D-16 — TEST-08 per-test triage:** Worktree-bug tests triaged per-test as they surface; verdicts recorded inline in `docs/test-triage/jj-bugs.md`.
- **D-17 — Sticky `vcs.adapter` config + default git when both present:** `createVcsAdapter` reads `vcs.adapter: 'git' | 'jj' | 'auto'` from project config (planner picks storage location). When `auto` and both `.git`+`.jj` present, defaults to **git** (changes Phase 1 D-04's `.jj`-first order for the colocated case). `GSD_VCS` env still overrides everything.
- **D-18 — Migration command lives in a future phase.** Phase 6 (per ROADMAP) owns `/gsd-migrate-to-jj` + `.planning` SHA → change_id rewriter.
- **D-19 — Format-migration tracker mandatory.** Every `.planning/` file format change touching revision IDs logged inline in CONTEXT.md `<format_migration_tracker>` as it surfaces.
- **D-20 — Surfaces already known to record SHAs:** `.planning/STATE.md` velocity table, per-phase `SUMMARY.md`/`LEARNINGS.md`/`REVIEW*.md`/`VERIFICATION.md` prose, gsd-sdk phase manifests, `gsd-sdk query commit` output. Phase 3 audits these during plan execution; entries land in the tracker.

### Claude's Discretion (planner picks)

- Exact plan boundaries within the D-10 suggested ordering.
- Parser file layout in `sdk/src/vcs/parse/` (recommended below in §Files to Create).
- `NotImplementedError` shape (recommendation: `VcsNotImplementedError extends VcsExecError`).
- Sticky-preference config storage location (recommendation: `.planning/config.json` `vcs.adapter` field — see §Sticky Preference Storage below).
- Whether `VcsBookmarkDivergentError` carries recovery hints.
- TEST-08 verdict rubric (recommendation: `bug-id | test path | jj behavior observed | verdict | rationale | follow-up phase`).
- NDJSON schema validation rigor — hand-rolled with explicit field checks (recommended, matches `git.ts` style) vs. `zod`/`io-ts` (not justified).

### Deferred Ideas (OUT OF SCOPE for Phase 3)

- `/gsd-migrate-to-jj` command + `.planning/` SHA → change_id rewriter (Phase 6).
- A4 hybrid bookmark-advance fallback (auto-detect when exactly one bookmark at `@-`).
- `vcs.jjOnly.commitIdOf(change)` escape hatch (revisit if a real consumer emerges; Phase 2.1 D-14 already deferred).
- `vcs.test.readWithoutSnapshot()` symbol-gated escape.
- `jj-native` (non-colocated) matrix lane (Phase 4).
- Multi-version jj matrix axis (single 0.41 pin).
- Upfront speculative TEST-08 triage doc.
- Long-lived Phase 3 feature branch.
- Workspace orchestrator semantics + octopus structure + auto-abandon empty heads (Phase 4 owns `WS-*`).
- Internal `fireHook` wiring (Phase 4 owns `HOOK-*`).
- Command translations + workflow markdown rewrites + brownfield validation (Phase 5).
- CI graduation from allow-failure to required-blocking (Phase 5).
</user_constraints>

<phase_requirements>
## Phase Requirements

The phase owns 26 requirements. Each is mapped to the research findings that enable implementation. `[VERIFIED]` items are checked against `jj 0.41.0` locally or `sdk/src/vcs/types.ts` source.

| ID | Description (verbatim from REQUIREMENTS.md) | Research support |
|----|---------------------------------------------|------------------|
| JJ-01 | `sdk/src/vcs/backends/jj.ts` implements every adapter operation against the `jj` binary | §Adapter Contract Surface enumerates every method; §Per-Method Notes gives the jj argv shape for each |
| JJ-02 | Mandatory flags + argv-array invocation only | §Mandatory jj flags + `jjArgv()` helper sketch |
| JJ-03 | `--ignore-working-copy` is **never** passed by adapter code | Locked by D-05; §Pitfall §Working-copy snapshot policy explains why |
| JJ-04 | NDJSON template `-T 'json(self) ++ "\n"' --no-graph` for `log`, `op log`, `workspace list` | §NDJSON parsers (verified field shapes against `jj 0.41`) |
| JJ-05 | jj binary discovery at construction; clear error when missing | §`createVcsAdapter` extension — `which jj` probe via `vcsExec` |
| JJ-06 | "Track latest, no floor"; clear error on unexpected op behavior | §CI version pin (D-14: 0.41 pinned; Renovate bumps) |
| JJ-07 | `JJ_USER` / `JJ_EMAIL` env propagated | §`jjArgv()` helper — env passthrough |
| SQUASH-01 | `vcs.commit({files,message})` → `jj squash <files> -B @ -k -m '<msg>'` | §Squash semantics — exact argv verified locally |
| SQUASH-02 | `vcs.commit({message})` (no files) → `jj squash -B @ -k -m '<msg>'` (no path filter) | §Squash semantics — same minus path args |
| SQUASH-03 | Unchanged files in `files` are faithfully included; no error/filter | §Squash semantics — `[FILESETS]…` accepts paths regardless of change status |
| SQUASH-04 | `@`'s description is preserved post-squash | §Squash semantics — jj-native behavior; verified locally (`Working copy (@) now at: … (empty) wip`) |
| SQUASH-05 | `jj commit` is **never** used | §Adapter Contract — only `jj squash` appears in commit path; lint guard from Phase 1 catches accidental reintroduction |
| SQUASH-06 | Conflicted-state commits surface via return value; no auto-resolve | §Commit return shape — `CommitResult.hash` populated; conflict detection via `findConflicts({scope:'all'})` |
| SQUASH-07 | `.planning/*` + code paths squashable in single commit | §Squash semantics — `[FILESETS]…` is path-agnostic; no special-casing required |
| REFS-01 | `vcs.refs.head` → `@` (jj) / `HEAD` (git) | Already encoded in `expr.head()` + `parse/jj-rev.ts`; §Per-Method `refs.head` |
| REFS-02 | `vcs.refs.parent` → `@-` | Same — `expr.parent()` + `parse/jj-rev.ts` |
| REFS-03 | Bookmarks CRUD verbs | §Per-Method `bookmarks.{list,create,move,delete,exists,switch}` — jj `bookmark {list,create,move,delete}` argv shapes |
| REFS-04 | `gsd/` namespace prefix on jj backend | Locked by D-03/D-04; §Per-Method `bookmarks` enforces add/strip |
| REFS-05 | `vcs.commit()` auto-advances active bookmark | Reshaped by D-01 — caller passes explicit `bookmark` field; adapter does `jj bookmark set <name> -r <new> -B` after squash |
| REFS-06 | Tags on jj = `gsd/release/<version>` bookmarks; no annotated-tag concept | Out of scope until release flow needs them; `createAnnotatedTag` stays `gitOnly` |
| CONFLICT-01 | `findConflicts({scope:'all'})` via `jj log -r 'conflict()'` | **CORRECTION (§Open Question Q1):** in jj 0.41 the function is `conflicts()` (plural). Locally verified — `conflict()` errors `Function 'conflict' doesn't exist`. Use `jj log -r 'conflicts()' -T 'json(self) ++ "\n"' --no-graph` |
| CONFLICT-02 | `findConflicts({scope:'working-copy'})` checks materialized WC state | §Per-Method `findConflicts` — `conflicts() & @` revset, or parse `jj st` for path-list |
| CONFLICT-03 | Verify gate uses `scope:'all'` to catch in-tree conflicts jj preserves silently | Already wired in git backend via `git ls-files --unmerged`; jj backend implements the real revset path |
| TEST-08 | Worktree-bug tests re-triaged | §Bug-Test Triage Table — premise captured for each; verdicts deferred to per-plan execution (D-16) |
| CI-01 | Matrix runs both backends; jj is allow-failure | §CI Matrix Activation — `continue-on-error: true` on the `backend: jj-colocated` matrix row |
| CI-02 | jj install via release tarball | §CI Install Step — exact `curl | tar` invocation; pin 0.41 |
</phase_requirements>

## Summary

Phase 3 lands `sdk/src/vcs/backends/jj.ts` (~600–1000 LOC) as the jj-side implementation of the `VcsAdapter` contract that Phase 1 + Phase 2.1 finalized. The contract is **already locked** in `sdk/src/vcs/types.ts` (read end-to-end below in §Adapter Contract Surface) and the git backend is the reference implementation at `sdk/src/vcs/backends/git.ts` (663 LOC). Almost all design uncertainty was resolved by the discuss-phase; the planner's job is structural — slice the work into ~5–7 plans, wire NDJSON parsers, activate the CI matrix axis, and finalize a per-test bug-triage doc.

One **substantive correction** is required versus the upstream wording: the jj revset function is `conflicts()` (plural), not `conflict()`. CONTEXT.md, REQUIREMENTS.md, ROADMAP.md, and STACK.md all use the singular form. Locally verified on `jj 0.41.0-8276953`: `jj log -r 'conflict()'` errors `Function 'conflict' doesn't exist. Hint: Did you mean 'conflicts', 'connected'?`. The official docs (`jj help -k revsets`) confirm `conflicts(): Commits that have files in a conflicted state.` This is a one-character fix in the implementation and a CONTEXT.md/REQUIREMENTS.md correction at end of phase — planner must include the doc-correction step in the wrap-up plan.

**Primary recommendation:** Plan 1 lands an atomic "shape commit" — `jj.ts` skeleton with every method throwing `VcsNotImplementedError`, the four NDJSON parser stubs (`jj-log.ts`, `jj-op-log.ts`, `jj-workspace-list.ts`, `jj-id.ts`), the CI install step, `BACKENDS_AVAILABLE` flipped to include `jj-colocated`, `vcs.adapter` config field added with default-git-when-both, and `CommitInput.bookmark`/`bookmarkRaw` fields + `VcsBookmarkDivergentError` type added to `types.ts`. Plans 2–7 fill verb groups in the D-10 order, each verb-group plan paired with its tests and gated by the per-verb allowlist (D-12).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| jj CLI shell-out | SDK / `sdk/src/vcs/exec.ts` + `backends/jj.ts` | — | Same seam the git backend uses; no new exec library |
| NDJSON parsing | SDK / `sdk/src/vcs/parse/jj-*.ts` | — | Centralized per UPSTREAM-02 (zero-conflict sidecar surface) |
| Revset translation | SDK / `sdk/src/vcs/parse/jj-rev.ts` (existing) | `sdk/src/vcs/expr.ts` (factory) | Phase 1 D-09..D-12; Phase 3 production-uses verbatim |
| Backend selection | SDK / `sdk/src/vcs/index.ts::createVcsAdapter` | Project config (`.planning/config.json` `vcs.adapter`) | D-17; sticky default; `GSD_VCS` env still overrides |
| Bookmark `gsd/` add/strip | SDK / `backends/jj.ts` (internal helpers) | — | D-03 — caller never sees the prefix |
| CI install + matrix activation | `.github/workflows/test.yml` | `sdk/src/vcs/backends.ts` `BACKENDS_AVAILABLE` flip | Tarball install before npm ci; matrix axis `backend: [git, jj-colocated]` |
| Per-verb allowlist (test-time gating) | `sdk/src/vcs/backends.ts` + `tests/helpers.cjs` / `vcs-fixture.ts` | — | D-12 — throw-not-skip when a verb isn't yet implemented |
| Bug-test triage doc | `docs/test-triage/jj-bugs.md` | — | D-16 — per-test verdict log |
| Format-migration tracker | `03-CONTEXT.md <format_migration_tracker>` (in-place) | — | D-19 — every Phase 3 plan that touches a `.planning/` revision-id format appends an entry |

## Standard Stack

### Core (already in place — Phase 3 consumes verbatim)

| Module | Purpose | Why standard |
|--------|---------|--------------|
| `sdk/src/vcs/exec.ts::vcsExec(cwd, bin, args)` | Single spawn site; returns `{exitCode, stdout, stderr, timedOut, error}` | Phase 1 D-05; argv-array invocation only — `bin` is `'jj'` for the new backend [VERIFIED: sdk/src/vcs/exec.ts:84] |
| `sdk/src/vcs/types.ts` | The frozen adapter contract (`VcsAdapter`, `CommitInput`, `LogEntry`, `Bookmark`, `WorkspaceInfo`, `ConflictResult`, `VcsRefs`, `VcsBookmarks`, `VcsWorkspace`, `__vcsTestOnly`) | Phase 2.1 finalized the cross-backend shape [VERIFIED: sdk/src/vcs/types.ts:1-296] |
| `sdk/src/vcs/expr.ts` + `parse/jj-rev.ts` | RevisionExpr factory + per-backend translator | Phase 1; Phase 3 just calls `toJjRev(opts.rev)` wherever `git.ts` calls `toGitRev` [VERIFIED: sdk/src/vcs/parse/jj-rev.ts:10] |
| `sdk/src/vcs/backends.ts` | `BACKENDS_DECLARED` / `BACKENDS_AVAILABLE` + `parseBackendsEnv` | Phase 3 flips `BACKENDS_AVAILABLE` to `['git', 'jj-colocated']` and (per D-12) adds a per-verb allowlist [VERIFIED: sdk/src/vcs/backends.ts:13-18] |
| `sdk/src/vcs/__tests__/vcs-fixture.ts` + `tests/helpers.cjs` | `vcsTest(kind)` + `test.extend({vcs,cwd})` | Phase 3 adds a `jj-colocated` setup branch (currently throws "not yet implemented") [VERIFIED: sdk/src/vcs/__tests__/vcs-fixture.ts:52-56] |

### To Be Added in Phase 3

| Module | Purpose | Notes |
|--------|---------|-------|
| `sdk/src/vcs/backends/jj.ts` | The implementation (factory: `createJjAdapter(cwd): JjVcsAdapter`) | Mirror `git.ts` factory shape; freeze the returned object [CITED: sdk/src/vcs/backends/git.ts:86-663] |
| `sdk/src/vcs/parse/jj-log.ts` | NDJSON → `LogEntry[]` parser | Verified shape — see §NDJSON shapes |
| `sdk/src/vcs/parse/jj-op-log.ts` | NDJSON → typed op-log entries (used by Phase 4/5 undo; in Phase 3 only consumed if implementing a debug helper) | Land as stub if no Phase 3 caller |
| `sdk/src/vcs/parse/jj-workspace-list.ts` | NDJSON → `WorkspaceInfo[]` parser | Phase 3 ships the parser even though `vcs.workspace.list()` may be a contract-passing stub returning `[]` (Phase 4 wires real semantics) |
| `sdk/src/vcs/parse/jj-id.ts` | `change_id` ↔ `commit_id` translator | Used for `LogEntry.hash` (which is conventionally the commit_id, not change_id) and for round-trip translation if `vcs.jjOnly.commitIdOf` ever lands |
| `sdk/src/vcs/jj/` directory (already exists, empty) | Sidecar for jj-specific non-parser logic | UPSTREAM-02 zero-conflict surface; optional location for the `jjArgv()` helper |

### No new npm dependencies. Reaffirmed by STACK.md §"Supporting libraries — explicitly NONE."

## Package Legitimacy Audit

**Not applicable.** Phase 3 adds zero npm dependencies (verified against `sdk/package.json`). The only external runtime dependency is the `jj` binary, which is a user-managed CLI tool installed via system package manager (dev) or GitHub release tarball (CI).

| Tool | Source | Disposition |
|------|--------|-------------|
| `jj` v0.41 binary | Official GitHub releases at `github.com/jj-vcs/jj/releases` | Approved — pinned in CI per D-14 / D-15; install via `curl | tar`; signature verification deferred unless user requests it |

## Adapter Contract Surface (the load-bearing input — jj.ts must implement all of this)

The full `VcsAdapter` contract is declared in `sdk/src/vcs/types.ts`. Every method below already has a working git-backend reference at `sdk/src/vcs/backends/git.ts` — read both files side-by-side when implementing each verb.

The discriminated union splits `VcsAdapter` into `GitVcsAdapter` (`kind: 'git'`, has `gitOnly`) and `JjVcsAdapter` (`kind: 'jj'`, no `gitOnly`). Phase 3 implements the `JjVcsAdapter` branch only. [VERIFIED: sdk/src/vcs/types.ts:271-281]

### Cross-backend methods jj.ts MUST implement

(All return shapes are typed by `types.ts` — see §Per-Method Notes below for the jj argv mapping. Phase 2.1 D-01 = strict surface, every method listed below has a direct jj equivalent.)

```typescript
// From VcsAdapterCommon (sdk/src/vcs/types.ts:174-192)
readonly kind: 'jj';
readonly cwd: string;
commit(input: CommitInput): CommitResult;
log(opts?: LogOpts): LogEntry[];
status(opts?: StatusOpts): StatusResult;
diff(opts?: DiffOpts): DiffResult;
findConflicts(opts: { scope: 'all' | 'working-copy' }): ConflictResult[];
push(opts?: PushOpts): ExecResult;
fetch(opts?: FetchOpts): ExecResult;

// VcsRefs (types.ts:194-214)
refs: {
  readonly head: RevisionExpr;           // = expr.head() (already encoded)
  readonly parent: RevisionExpr;         // = expr.parent()
  bookmarks: VcsBookmarks;               // see below
  currentBookmarks(): string[];          // Phase 2.1 D-15; gsd/ prefix stripped (D-03)
  resolveShort(rev: RevisionExpr): string;
  countCommits(opts: { rev?: RevisionExpr }): number;
  rootCommits(opts: { rev?: RevisionExpr }): string[];
  exists(rev: RevisionExpr): boolean;
  isIgnored(path: string): boolean;       // Phase 2.1 D-17 dual-semantic
  remotes(): string[];
};

// VcsBookmarks (types.ts:216-224)
bookmarks: {
  list(): Bookmark[];                                // 'gsd/' stripped on read (D-03)
  create(name: string, rev: RevisionExpr): void;     // 'gsd/' added on write (D-03); D-04 raw escape
  move(name: string, rev: RevisionExpr): void;
  delete(name: string): void;
  exists(name: string): boolean;
  switch(name: string, opts?: { create?: boolean }): void;
};

// VcsWorkspace (types.ts:237-244) — contract-passing in Phase 3, real semantics in Phase 4
workspace: {
  add(input: WorkspaceAdd): WorkspaceInfo;
  forget(path: string): void;
  list(): WorkspaceInfo[];
  context(): WorkspaceContext;                       // effectiveRoot, mode, isLinked
  prune(): ExecResult;
};

// Symbol-gated test namespace
[__vcsTestOnly]: VcsTestOnly;                        // snapshot/restore (jj-side strategy below)
```

### CommitInput / outputs reshapes for Phase 3

Currently in `types.ts` (read as of 2026-05-12):

- `CommitInput` has `files`, `message`, `allowEmpty`, `amend`, `noVerify`. Phase 3 plan 1 **adds two optional fields** per D-01/D-04:
  - `bookmark?: string` — unprefixed name; adapter adds `gsd/`. Triggers `jj bookmark set gsd/<name> -r <new> -B` after squash.
  - `bookmarkRaw?: string` — verbatim name (no prefix munging). For upstream-tracking `main`, `trunk`, etc.
  - Both fields no-op on the git backend (it already auto-advances the active branch via native `git commit` behavior).
- `VcsBookmarkDivergentError` is a new typed error class — extend `Error`, fields: `bookmarkName: string`, `divergentTargets: string[]` (commit_ids), optional `hint?: string`. Thrown from any read or write touching bookmarks when `jj bookmark list` reports two-element `target` array. (Planner: keep `VcsExecError` and `VcsBookmarkDivergentError` separate; the latter is not an exec failure — it's a state error.)

### gitOnly methods — jj.ts MUST NOT implement these

[VERIFIED: sdk/src/vcs/types.ts:254-269] `vcs.gitOnly` is the discriminated narrowing surface; jj.ts has **no** `gitOnly` namespace. `createAnnotatedTag`, `version`, `init`, `configGet`, `configSet`, `gitDir`, `gitCommonDir` all live on `GitOnlyOps` only. Callers narrow on `vcs.kind === 'git'` before reaching them.

### Phase 2.1 fields explicitly removed from the cross-backend surface

[VERIFIED: sdk/src/vcs/types.ts:186-191, 246-250] These do **not** appear on `VcsAdapterCommon` and jj.ts must not synthesize them:
- `stage(files)` / `unstage(files)` — collapsed into `commit({files})` WC-state-capture
- `hooks` namespace — `fireHook` is module-private in `hook-bridge.ts`; Phase 4 wires internally
- `StatusEntry.index` — meaningless cross-backend
- `WorkspaceContext.gitDir` / `gitCommonDir` — moved to `gitOnly`

## NDJSON parsers — verified field shapes (jj 0.41.0, local probe 2026-05-12)

The parser layer lives in `sdk/src/vcs/parse/jj-*.ts` and is consumed by `backends/jj.ts`. Each parser exposes one function: `(raw: string) => TypedEntry[]`, where `raw` is the trimmed stdout from a `vcsExec` call. Each line is one JSON object terminated by `\n` (see `++ "\n"`). The parsers must:
- split on `\n` and discard empty lines (matches `git.ts`'s `.split('\n').filter(Boolean)` style)
- `JSON.parse` each line; on parse failure, surface a typed error (recommendation: `VcsParseError` — new in `exec.ts` or a sibling)
- map jj field names to the contract's field names (e.g., jj `commit_id` → `LogEntry.hash`)

### `jj log -T 'json(self) ++ "\n"' --no-graph -r <revset>`

[VERIFIED: local jj 0.41.0 run, 2026-05-12]

```json
{
  "commit_id": "<40-char hex>",
  "parents": ["<commit_id>", "..."],
  "change_id": "<32-char k-z reversed-base32>",
  "description": "<message ending in \\n>",
  "author": {
    "name": "<string>",
    "email": "<string>",
    "timestamp": "<RFC3339 with offset>"
  },
  "committer": { "name": "...", "email": "...", "timestamp": "..." }
}
```

→ `LogEntry { hash: commit_id, parents, author: author.name, date: author.timestamp, subject: <first line of description>, body?: <rest of description> }`

**Field-stability note (MEDIUM confidence — STACK.md flag):** jj docs say JSON template field names are "usually stable but backward compatibility isn't guaranteed." The Phase 3 strategy is (a) pin CI to 0.41 (D-14), (b) snapshot-test the parser against a fixed NDJSON fixture per `git.ts`'s baseline-parity pattern, (c) treat any future bump (Renovate-driven) as requiring a fixture re-snapshot.

**Fields NOT present in `json(self)`** that the adapter needs separately:
- `conflict` (per-commit conflict flag) — NOT in `json(self)`; use custom template `-T 'separate(",", commit_id, conflict, empty) ++ "\n"'` OR rely on `conflicts()` revset (which is what CONFLICT-01 actually requires).
- `bookmarks` for a commit — NOT in `json(self)`; use `jj bookmark list -T 'json(self) ++ "\n"'` separately and pivot by commit_id (see below).
- `is_working_copy` / `current_working_copy` — NOT in `json(self)`; use a custom template if needed. Phase 3 doesn't appear to need this — `vcs.refs.head` resolves to `@` symbolically.

### `jj op log -T 'json(self) ++ "\n"' --no-graph`

[VERIFIED: local jj 0.41.0 run, 2026-05-12]

```json
{
  "id": "<128-char hex>",
  "parents": ["<op_id>", "..."],
  "time": { "start": "<RFC3339>", "end": "<RFC3339>" },
  "description": "snapshot working copy" | "..." ,
  "hostname": "<string>",
  "username": "<string>",
  "is_snapshot": true|false,
  "workspace_name": "default" | null,
  "attributes": { "args": "jj <argv>" }
}
```

No production caller in Phase 3 — land the parser as a stub for Phase 4/5 undo (per ROADMAP §"`/gsd-undo` translates to surgical `jj abandon`" — but op-log undo is JJOP-01, v2 scope). Per CONTEXT.md plan-2 boundary, this stub keeps the substrate ready without committing semantics.

### `jj workspace list -T 'json(self) ++ "\n"'`

[VERIFIED: local jj 0.41.0 run, 2026-05-12]

```json
{
  "name": "<workspace-name>",
  "target": {
    "commit_id": "...", "parents": ["..."], "change_id": "...",
    "description": "...", "author": {...}, "committer": {...}
  }
}
```

→ `WorkspaceInfo { path: <derived from name>, rev: target.commit_id, locked: false }`

**Caveat:** the JSON `name` is the jj workspace name (e.g., `"default"`), not a filesystem path. The adapter must resolve the path separately — there isn't a direct `path` field. For Phase 3's contract-passing-stub use, this is acceptable. Phase 4 owns workspace path semantics.

**`locked: false` is a placeholder** — jj has no workspace-lock concept (per PITFALLS.md §Pitfall 3: "jj has no 'lock' primitive equivalent to `git worktree lock`"). Phase 4 designs the sentinel-file convention if needed.

### `jj bookmark list -T 'json(self) ++ "\n"'`

[VERIFIED: local jj 0.41.0 run, 2026-05-12]

```json
{
  "name": "gsd/test",
  "target": ["<commit_id>"]
}
```

→ `Bookmark { name: <name with 'gsd/' stripped per D-03>, rev: target[0] }`

**Two important details:**
1. `target` is an **array**. A single-element array = a normal bookmark. A multi-element array = a divergent bookmark (jj's `name??` state). The adapter detects `target.length > 1` and throws `VcsBookmarkDivergentError` per D-02.
2. `jj bookmark list 'gsd/*'` accepts a prefix-glob argument — filter at the CLI rather than enumerate-then-filter for the `gsd/`-namespace audit case (REFS-04). [VERIFIED: `jj bookmark list --help` shows positional glob argument]

## Per-Method Implementation Notes (one row per `JjVcsAdapter` method)

Mirror the git backend's structure: a single `createJjAdapter(cwd: string): JjVcsAdapter` factory that defines each method as a local closure, then returns a frozen object. Argv shapes below are the literal `args` arrays the adapter passes to `vcsExec(cwd, 'jj', args)`.

### `jjArgv(...subcommand: string[]): string[]` — recommended helper

Every jj invocation prepends a uniform flag-prefix per JJ-02 and STACK.md. Implementation sketch:

```typescript
function jjArgv(...subcommand: string[]): string[] {
  return ['--repository', cwd, '--no-pager', '--color', 'never', '--quiet', ...subcommand];
}
```

Plus an env injection point for `JJ_USER`/`JJ_EMAIL` (JJ-07): pass via `vcsExec`'s options if we add an env field (recommend extending `ExecOptions` in plan 1 to accept `env?: Record<string,string>` and have `vcsExec` merge into `process.env`). Alternatively, do the env merge at the call site — planner picks.

`--ignore-working-copy` is **not** in `jjArgv()` per D-05.

### `commit(input: CommitInput): CommitResult`

- Validate `input.files !== undefined && input.files.length === 0` → throw same `WR-01` error message as git backend [CITED: sdk/src/vcs/backends/git.ts:95-100].
- `input.amend === true` → not supported on jj backend in Phase 3. Recommendation: throw `VcsNotImplementedError('amend: not yet supported on jj backend')`. Phase 5's `/gsd-quick` may need a real implementation later (`jj squash --into <prior-change>`).
- `input.allowEmpty === true` → not used by jj backend (squash always produces a non-empty new commit unless source is empty; the source-empty case is the natural "no changes" path). Document and ignore.
- Build argv:
  - With `files`: `jj squash -B @ -k -m <message> <...files>` (positional `[FILESETS]…` is the trailing slot)
  - Without `files`: `jj squash -B @ -k -m <message>`
- After non-zero exit, return `{ exitCode, stdout, stderr, hash: null }` (matches `git.ts` pattern).
- After zero exit, parse `stdout` for the new commit's commit_id. jj prints `Created new commit <change_id> <commit_id> <message>` on success [VERIFIED: local probe — `Created new commit pymwzqwo 2f5d3b9b first commit`]. The reliable approach is a second call: `jj log -T 'json(self) ++ "\n"' --no-graph -r '@-' -n 1` and read `commit_id`. Note: `@-` after the squash is the new commit (because `-B @` inserted before `@`, the WC sits one beyond it). Locally verified.
- If `input.bookmark` is set (D-01): after successful squash, run `jj bookmark set gsd/<input.bookmark> -r <new_commit_change_id> -B`. If `bookmarkRaw` is set (D-04): run `jj bookmark set <input.bookmarkRaw> -r <new> -B`. Capture exit and merge into `CommitResult`'s stderr if non-zero (advance failure should not silently swallow).
- `noVerify` (D-08): in Phase 3, jj backend does not invoke any hook (Phase 4 wires `fireHook`). The flag becomes a no-op; document with a JSDoc note that Phase 4 will honor it.
- **SQUASH-06 conflict surfacing:** if the squash output indicates a conflict (jj prints `New conflicts appeared in N commits:` to stderr), the commit still succeeds (jj's conflict-tolerant model). Surface this in the return: caller asks `findConflicts({scope:'all'})` if it cares. No special CommitResult field needed.

### `log(opts: LogOpts = {}): LogEntry[]`

- argv: `jj log -T 'json(self) ++ "\n"' --no-graph` + `--reversed`? — `git.ts` uses default ordering (recent first); match it (jj default is also recent-first).
- `opts.maxCount` → `-n <N>`
- `opts.rev` → `-r <toJjRev(opts.rev)>`
- `opts.allRefs` → `-r 'all()'` — jj's analog of `git log --all`. Verify: `all()` returns every visible head [CITED: jj docs §revsets].
- `opts.paths` → trailing positional args (jj treats path args as a fileset filter on the log)
- Parse via `parse/jj-log.ts`, return `LogEntry[]` with `hash = commit_id`.

### `status(opts: StatusOpts = {}): StatusResult`

- argv: `jj st` (no template — jj's `st` output is human-readable; for structured output use `jj log -r 'conflicts() & @' -T '…'` or parse `jj diff --summary`).
- jj `st` output sample (verified locally):
  ```
  Working copy changes:
  A a.txt
  Working copy  (@) : wttxkypv e4595a81 (no description set)
  Parent commit (@-): zzzzzzzz 00000000 (empty) (no description set)
  ```
- Parser sketch: lines starting with one of `A `, `M `, `D `, `R `, `C ` indicate path changes. Map to `StatusEntry { path, worktree: <letter> }`. Lines under "Working copy changes:" until "Working copy  (@)" are entries.
- `opts.porcelain === false` → return `{entries: [], raw: stdout}` (matches git backend). Otherwise parse as above.
- **No `index` letter** — jj has no index. `worktree` is always the change letter. [VERIFIED: sdk/src/vcs/types.ts:96-103 — `StatusEntry` only has `path` and `worktree`]

### `diff(opts: DiffOpts = {}): DiffResult`

- argv: `jj diff` (no template; jj has structured diff via `--name-only`, `--summary`, etc.)
- `opts.staged` — **N/A on jj** (no index). The flag is meaningful only on git; on jj, return the same as un-staged (jj's WC diff). Document this as a known cross-backend asymmetry and verify no Phase 3 caller actually toggles it on jj (audit point for planner).
- `opts.nameOnly` → `--name-only`
- `opts.nameStatus` → `--summary` (jj's analog; emits `M path` / `A path` / etc.)
- `opts.rev` → `-r <toJjRev(opts.rev)>`
- `opts.paths` → trailing positional args
- Parse the `--summary` output by line: each line is `<letter> <path>`. Build `DiffNameStatusEntry[]` analogous to `git.ts:295-308`.

### `refs.head` / `refs.parent`

- `refs.head = expr.head()` — translator emits `@` for jj. [VERIFIED: sdk/src/vcs/parse/jj-rev.ts:31]
- `refs.parent = expr.parent()` — translator emits `@-`. [VERIFIED: sdk/src/vcs/parse/jj-rev.ts:33]
- No code needed beyond the assignment — same as `git.ts:418-419`.

### `refs.bookmarks.list(): Bookmark[]`

- argv: `jj bookmark list -T 'json(self) ++ "\n"'`
- Parse each NDJSON line into `{name, target}`.
- If `target.length > 1` → throw `VcsBookmarkDivergentError({bookmarkName: name, divergentTargets: target})` per D-02.
- Strip `gsd/` prefix from `name` per D-03 when emitting `Bookmark.name` (so caller sees `phase-3`, not `gsd/phase-3`).
- **Decision point for planner:** should `bookmarks.list()` return ONLY `gsd/`-prefixed bookmarks, or all? Recommendation: return **all** (preserves Phase 2.1 D-15 currentBookmarks parity), strip prefix on gsd/-prefixed, leave non-prefixed verbatim. Round-trip test: `bookmarks.create('phase-3') ; bookmarks.list().map(b => b.name)` includes `'phase-3'` (stripped), but `bookmarks.create('main', {raw:true}) ; bookmarks.list()` includes `'main'` (verbatim).

### `refs.bookmarks.create(name, rev): void`

- Resolve `actualName = raw ? name : 'gsd/' + name` (D-03/D-04).
- argv: `jj bookmark create <actualName> -r <toJjRev(rev)>`
- Non-zero exit → throw `Error('bookmarks.create failed: ${stderr || stdout}')` (matches git backend).

### `refs.bookmarks.move(name, rev): void`

- argv: `jj bookmark move <actualName> --to <toJjRev(rev)>` (or `jj bookmark set <name> -r <rev> -B`)
- **Note:** jj has both `move` and `set`. `set` is create-or-update. `move` requires existing bookmark. The contract method is `move`, so use `jj bookmark move`. If non-existent, jj errors — surface that.
- For the `commit({bookmark})` advance flow, use `set -B` (D-01) — that's a different code path.

### `refs.bookmarks.delete(name): void`

- argv: `jj bookmark delete <actualName>`
- Note: jj distinguishes `delete` (propagates to remotes) vs `forget` (local-only). The contract is `delete`; use `jj bookmark delete`. The hint from jj help: "Delete an existing bookmark and propagate the deletion to remotes on the next push."

### `refs.bookmarks.exists(name): boolean`

- argv: `jj bookmark list <actualName>` — if exits 0 and stdout non-empty, exists. Alternative: `jj log -r '<actualName>' -T '"x"' -n 1`. The first form is cleaner.

### `refs.bookmarks.switch(name, opts): void`

- jj has no direct "switch to bookmark" the way git checkout does — there's no "current bookmark"; only the working-copy commit `@`. The closest equivalent is `jj new -r <bookmark>` (creates a new empty commit on top of the bookmark target) or `jj edit <bookmark>` (moves `@` to be the bookmark target).
- Recommendation: in Phase 3, throw `VcsNotImplementedError` on `bookmarks.switch` for jj backend. It's a contract-required verb but no Phase 3 caller actually exercises it on jj (verified — only test setup uses it on git). Phase 4 reshapes if WS-* needs it.
- Alternative if Phase 4 demands a real implementation: `opts.create === true` → `jj bookmark create <name> -r @` then `jj edit <name>`. `opts.create !== true` → `jj edit <name>`. Document carefully — semantics differ from git checkout.

### `refs.currentBookmarks(): string[]`

- jj has no single "current bookmark" — bookmarks don't auto-follow `@`. The semantically correct query: "which bookmarks (if any) point at `@-`?" (i.e., the most recent non-WC commit). [VERIFIED: jj design — `jj log` shows bookmarks anchored at commits, and `@` is the WC which is always "ahead" of any bookmark by one empty commit]
- argv: `jj log -r '@-' -T 'bookmarks.join("\n")' --no-graph -n 1`
- Output: lines of bookmark names (possibly with `*` marker if local-tracking-divergent — strip those).
- Strip `gsd/` prefix per D-03; preserve non-prefixed names verbatim.
- Return `[]` if `@-` has no bookmarks (analogous to detached HEAD).
- **Round-trip test (pinned by D-03):** `bookmarks.create('phase-3', expr.head())` — wait, but `expr.head()` is `@` which is the WC; bookmarks point at non-WC commits. Better test: after a `commit({bookmark: 'phase-3'})`, `currentBookmarks()` returns `['phase-3']`.

### `refs.resolveShort(rev: RevisionExpr): string`

- argv: `jj log -r '<toJjRev(rev)>' -T 'commit_id.short()' --no-graph -n 1`
- Return stdout trimmed. Non-zero exit → throw `Error('refs.resolveShort failed: …')`.

### `refs.countCommits(opts): number`

- argv: `jj log -r '<toJjRev(opts.rev) || "::@">' -T '"x\n"' --no-graph` then count lines. Alternative: `jj log -r '<rev>' -T '""' --no-graph | wc -l` — but we want pure-Node parsing.
- Cleaner: `-T '"x"'` (no separator) produces `xxxxxx…` — count the length. Even cleaner: use `-T '"\n"'` — produces N newlines — and count `\n` in stdout.
- Returns `0` on non-zero exit (matches git backend `countCommits` line 386).

### `refs.rootCommits(opts): string[]`

- argv: `jj log -r 'root() & ::<toJjRev(opts.rev) || "@">' -T 'commit_id ++ "\n"' --no-graph`
- Parse `\n`-separated commit_ids.

### `refs.exists(rev: RevisionExpr): boolean`

- argv: `jj log -r '<toJjRev(rev)>' -T '"x"' --no-graph -n 1` — exit 0 and non-empty stdout → exists. Exit non-zero (bad revset) → false.

### `refs.isIgnored(path: string): boolean`

- Phase 2.1 D-17 marked this dual-semantic — git interprets ignored-by-`.gitignore`; jj interprets ignored-by-its-own-fileset-rules.
- jj's analog: `jj file untrack --dry-run <path>` or check via `jj file list -r @ --type=ignored` — there isn't a direct "is this path ignored" CLI.
- Recommendation: for Phase 3, throw `VcsNotImplementedError` and document. The single production caller is `worktree-safety.cjs` which is git-side (ADR-0004 specific) and narrows on `vcs.kind === 'git'` before calling. Audit: confirm no jj-reachable caller invokes `isIgnored` before plan 3 lands. If it does, real jj implementation is needed.

### `refs.remotes(): string[]`

- argv: `jj git remote list -T 'name ++ "\n"'` — `jj git remote list` is the jj-native equivalent.
- Parse `\n`-separated names.

### `findConflicts({scope: 'all' | 'working-copy'}): ConflictResult[]`

⚠️ **CORRECTION versus all upstream docs:** the jj revset function is **`conflicts()`** (plural), not `conflict()`. See §Open Question Q1.

- **`scope: 'all'`:**
  - argv: `jj log -r 'conflicts()' -T 'json(self) ++ "\n"' --no-graph`
  - For each result: per-commit, derive `paths` via a second call `jj resolve --list -r <change_id>` (lists conflicted paths) or `jj diff -r <change_id> --summary` and filter for conflict markers. Recommendation: `jj resolve --list` — purpose-built. [Verify in implementation; not exercised locally]
  - Return `ConflictResult[]` with one entry per conflicted commit: `{rev: commit_id, paths, scope: 'all'}`.
- **`scope: 'working-copy'`:**
  - argv: `jj log -r 'conflicts() & @' -T 'json(self) ++ "\n"' --no-graph`
  - If no result, return `[]`. If `@` is conflicted, return `[{rev: <@ commit_id>, paths: <from jj resolve --list -r @>, scope: 'working-copy'}]`.
  - Alternative: parse `jj st` output — when `@` has conflicts, `jj st` prints `Conflict in <path>` lines [VERIFIED in jj docs / community articles, MEDIUM confidence — not exercised locally during this research]. The revset approach is more robust.
- CONFLICT-03: verify gate uses `scope: 'all'`. Already wired in the verify call site (per Phase 2.1 D-07 reference in CONTEXT.md).

### `push(opts: PushOpts = {}): ExecResult`

- argv: `jj git push`
- `opts.force` → `--force-with-lease` (jj equivalent; verify with `jj git push --help` during implementation)
- `opts.remote` → `--remote <opts.remote>`
- `opts.ref` → `--bookmark <name from ref>` (jj pushes bookmarks, not arbitrary revs). The ref translation: if it's a bookmark RevisionExpr (`expr.bookmark('main')`), extract the name. If it's a generic rev, jj push semantics differ — recommend documenting this asymmetry and treating non-bookmark `opts.ref` as a no-op + warn.
- `opts.noVerify` → no-op in Phase 3 (Phase 4 wires hook firing).

### `fetch(opts: FetchOpts = {}): ExecResult`

- argv: `jj git fetch`
- `opts.remote` → `--remote <opts.remote>`
- `opts.ref` → no direct equivalent in `jj git fetch` (it fetches all configured branches by default; per-ref fetch isn't a first-class CLI option). Document; recommend the planner audits whether any caller passes `opts.ref` to fetch on jj.

### `workspace.{add, forget, list, context, prune}` — Phase 3 STUBS

Phase 4 owns workspace semantics (WS-*). In Phase 3, the contract requires these methods exist. Recommendations:
- `add`, `forget`, `prune` → throw `VcsNotImplementedError` until Phase 4 fills in. Per-verb allowlist (D-12) gates the contract test until then.
- `list` → `jj workspace list -T 'json(self) ++ "\n"'`, parse, return `WorkspaceInfo[]`. The single-workspace default repo returns one entry. This is enough for any read path that probes "are there workspaces" without exercising add/forget.
- `context` → return `{effectiveRoot: cwd, mode: 'main', isLinked: false}`. jj-side workspace context resolution is Phase 4's job (it understands the multi-workspace `.jj/working_copy/` model).

### `[__vcsTestOnly]: { snapshot, restore }` — jj-side strategy

git backend uses `refs/gsd/test-snapshot` + `reset --hard` (Phase 1 D-14, strategy 3). jj has a stronger primitive: `jj op log` IDs are stable snapshots of the entire repo state, and `jj op restore <op_id>` rewinds to that exact state.

- `snapshot()`: argv `jj op log --no-graph -T 'id ++ "\n"' -n 1` → return `{id: <op_id>, kind: 'jj'}`.
- `restore(handle)`: argv `jj op restore <handle.id>`. Single command; no separate clean step needed (jj's op-restore rewinds the WC too).

This is cleaner than the git side and an early correctness win — fixture-restore between tests is bulletproof against any kind of repo-state mutation the test made.

## Squash semantics — verified locally on jj 0.41.0

Sample sequence in a fresh colocated repo (`/tmp/jjprobe`, 2026-05-12):

```
$ jj git init --colocate
Initialized repo in "."

$ echo a > a.txt
$ jj describe @ -m 'wip'
Working copy  (@) now at: wttxkypv a5f7ebf1 wip
Parent commit (@-)      : zzzzzzzz 00000000 (empty) (no description set)

$ jj squash -B @ -k -m 'first commit'
Created new commit pymwzqwo 2f5d3b9b first commit
Rebased 1 descendant commits
Working copy  (@) now at: wttxkypv b70cd7ef (empty) wip
Parent commit (@-)      : pymwzqwo 2f5d3b9b first commit
```

Observations:
- `-B @` inserts the new commit **before** the current `@` (the WC commit).
- `-k` keeps the WC commit non-abandoned even if it becomes empty (which is what happens here — the WC's content squashed into the new commit before it).
- The new commit's change_id is **fresh** (`pymwzqwo`); the WC keeps its **original** change_id (`wttxkypv`). This matches the project memory invariant ".planning/ commit-id → change-id migration" — change_ids are stable identifiers across squash.
- The WC's description (`wip`) is **preserved** (SQUASH-04 confirmed). Even with `--message 'first commit'`, the WC description is unchanged — only the new commit gets the message.
- The WC is now `(empty)` because its content moved.
- `jj log` after the squash shows the new commit on the trunk and the WC one beyond.

The argv shape `['squash', '-B', '@', '-k', '-m', '<message>', ...files]` matches both SQUASH-01 (with files) and SQUASH-02 (without files). The `-B @` flag is marked `(Experimental)` in `jj squash --help` — flag this in CONTEXT.md if jj 0.42+ removes or renames it (worth a Renovate check).

## Working-copy auto-snapshot — confirmed behavior

Every jj invocation (`jj log`, `jj st`, `jj bookmark list`, …) takes a working-copy snapshot at start unless `--ignore-working-copy` is passed. Verified locally — running `jj status` immediately after creating a file logged `snapshot working copy` in the op log.

D-05 forbids `--ignore-working-copy` in adapter code. The implication for read methods: they ARE side-effecting on `@` (specifically, they update the WC commit's tree to match disk). The footgun (PITFALLS.md #2) is: writing a file between two adapter calls causes the first call to snapshot without the file and the second to snapshot with it. The Phase 3 mitigation per D-06/D-07 is documentation + caller-side pre-probe discipline.

**Colocated bonus:** `jj git import` and `jj git export` run automatically on most jj commands in a colocated repo. Verified — at one point during the probe, running `jj log` in this repo (colocated) emitted `Reset the working copy parent to the new Git HEAD. Done importing changes from the underlying Git repo.` This means the adapter does **not** need to invoke `jj git import` / `jj git export` manually for Phase 3's purposes. (Edge case: Phase 4's workspace orchestrator may need explicit invocation when constructing octopus structures — Phase 4 problem.)

## Sticky Preference Storage (D-17 — Claude's discretion)

Two viable locations:
- **`.planning/config.json` `vcs.adapter` field** — already read by SDK code in multiple places; obvious home. Recommended.
- **Top-level `gsd.vcs.adapter`** (in `package.json` or `.gsd.json`) — defensible but invents a new config root.

**Recommendation: `.planning/config.json` `vcs.adapter`** with three legal values: `'git'`, `'jj'`, `'auto'` (default). `createVcsAdapter` reads this via the existing config-read machinery (likely `gsd-sdk query config-get`).

Resolution order in `createVcsAdapter` (revised from Phase 1):
1. `opts.kind` (explicit caller override) — same as today
2. `process.env.GSD_VCS` (`'git'` | `'jj'`) — same as today
3. `.planning/config.json` `vcs.adapter`:
   - `'git'` or `'jj'` — use that
   - `'auto'` or absent: detect — if both `.git` AND `.jj` present, **git** (D-17 changes Phase 1 D-04 for this case); if only `.jj`, jj; if only `.git`, git; if neither, git (greenfield).

## Mandatory jj flags + argv shape (JJ-02)

Every jj invocation through `vcsExec(cwd, 'jj', args)` prepends:

```
['--repository', cwd, '--no-pager', '--color', 'never', '--quiet']
```

Per STACK.md §"jj-side flags & invocation conventions" + verified against `jj --help`. **Never** include `--ignore-working-copy` (D-05). Revsets and template strings pass as **separate args** — `['log', '-r', '@-::@', '-T', 'json(self) ++ "\n"', '--no-graph']`, not a single shell string.

## Bookmark namespace + auto-advance (REFS-04 / REFS-05 / D-01–D-04)

- D-01: explicit `CommitInput.bookmark`; adapter does `jj bookmark set gsd/<name> -r <new_commit> -B` after squash.
- jj has a native `jj bookmark advance` command (verified: `jj bookmark advance` exists per `jj bookmark --help`). It advances "the closest bookmarks to a target revision". But per D-01, GSD does NOT use jj's auto-advance config — the caller passes the name explicitly, and the adapter uses `bookmark set -B` for surgical placement. Document the choice in `jj.ts` JSDoc.
- D-03: `gsd/` prefix is adapter-internal. Add on every write path that takes a bookmark name; strip on every read path that returns a bookmark name. The strip must be exhaustive — `bookmarks.list()`, `currentBookmarks()`, and any place a bookmark name surfaces in a `Bookmark` or `LogEntry`-adjacent return.
- D-04: `{raw: true}` opt-out for upstream-tracking names. Round-trip test pin.

## CI Matrix Activation (CI-01 / CI-02 / D-14 / D-15)

Current `.github/workflows/test.yml` has a single `test` job with `os: [ubuntu-latest], node-version: [22,24], + macos-latest@24`. Phase 3 adds a **backend matrix axis**:

```yaml
strategy:
  fail-fast: false   # was: true — must be false so jj allow-failure doesn't kill the git lane
  matrix:
    os: [ubuntu-latest]
    node-version: [22, 24]
    backend: [git, jj-colocated]
    include:
      - os: macos-latest
        node-version: 24
        backend: git              # only one backend on macos
    # jj-colocated lane: allow-failure
```

Then add a `continue-on-error: ${{ matrix.backend == 'jj-colocated' }}` field on the job (or split into two jobs with `continue-on-error: true` on the jj one). The planner picks the exact YAML shape.

**jj install step** (CI-02 / D-15, before `npm ci`):

```yaml
- name: Install jj
  if: matrix.backend == 'jj-colocated'
  shell: bash
  run: |
    JJ_VERSION=v0.41.0
    JJ_ARCH=$(uname -m)   # x86_64 on standard ubuntu-latest
    curl -fsSL "https://github.com/jj-vcs/jj/releases/download/${JJ_VERSION}/jj-${JJ_VERSION#v}-${JJ_ARCH}-unknown-linux-musl.tar.gz" \
      | tar xz -C "$RUNNER_TEMP"
    echo "$RUNNER_TEMP" >> "$GITHUB_PATH"
    jj --version
```

Pin `JJ_VERSION=v0.41.0` per D-14. Renovate config (if used) bumps this value.

**Test runner env var:** `GSD_TEST_BACKENDS=<matrix.backend>` passed to `npm test`. The existing `parseBackendsEnv` already supports comma-separated keys; matrix passes a single value. [VERIFIED: sdk/src/vcs/backends.ts:38-51]

**Skip-count guard interaction (TEST-06):** the per-verb allowlist (D-12) uses **throw-not-skip** specifically because `check-skip-count.cjs` would silently let a stub-throw drop fail to skip when a verb-group plan lands. The allowlist throws a typed `VcsNotImplementedError` from the fixture, which surfaces as a test failure on the jj-colocated lane — but that lane is allow-failure, so it doesn't block CI. As verb groups land, allowlist entries flip → tests pass → no policy noise.

## Bug-Test Triage Table (TEST-08)

Per D-16, verdicts are recorded **as tests surface under the jj-colocated lane**, not upfront. The table below captures each test's premise so the per-test verdict can be assigned mechanically when it runs. The planner's wrap-up plan (D-10g) consumes this table to populate `docs/test-triage/jj-bugs.md`.

| Bug | Test path | Premise (parsed from test header) | Expected verdict (research-time hypothesis) |
|-----|-----------|------------------------------------|--------------------------------------------|
| 2924 | `tests/bug-2924-worktree-head-attachment.test.cjs` | Worktree HEAD attaches to protected branch (master/main) → executor commits land there. Test asserts workflow markdown contains symbolic-ref + protected-branch HEAD-attachment block BEFORE any `git reset --hard`. Source-of-product is markdown content. | **carries-verbatim** — test reads markdown files for structural protocol; VCS-agnostic. No jj-specific mapping needed. |
| 2774 | `tests/bug-2774-worktree-cleanup-workspace-safety.test.cjs` | Worktree cleanup destroys parent workspace `.git`. Test asserts workflow markdown uses inclusion-based filter (`.claude/worktrees/agent-`). | **carries-verbatim** — markdown structural assertions. |
| 3097/3099 | `tests/bug-3097-3099-executor-worktree-path-safety.test.cjs` | Executor worktree-HEAD guard used `if [ -f .git ]` (false in main repo) → silent skip. Test asserts gsd-executor.md + worktree-path-safety.md contain structural fixes. | **carries-verbatim** — markdown structural assertions. |
| 2075 | `tests/bug-2075-worktree-deletion-safeguards.test.cjs` | Executor `git clean` inside worktree removes committed files; merge deletes them on main. Three failure modes. Test asserts workflow + executor markdown contain safeguards. | **carries-verbatim** — markdown structural assertions; per PITFALLS.md the jj-equivalent failure mode requires a separate test (deferred to Phase 4 WS-13). |
| 2431 | `tests/bug-2431-worktree-locked-surfacing.test.cjs` | Workflow markdown silently accumulates locked worktrees via `2>/dev/null \|\| true`. Test asserts surfacing pattern. | **carries-verbatim** — markdown structural assertions. PITFALLS.md notes jj has no `lock` analog, but the test is about git-side workflow markdown — VCS-agnostic. |
| 2015 | `tests/bug-2015-worktree-base-branch.test.cjs` | Worktree executor uses `git reset --soft` instead of `--hard` → enormous-diff commits. Test asserts workflow markdown uses `--hard`. | **carries-verbatim** — markdown structural assertions for git-specific recovery; jj-equivalent design (different mechanism) is Phase 4 WS-13. |
| 2388 | `tests/bug-2388-plan-phase-no-branch-rename.test.cjs` | `plan-phase` silently renames feature branch when phase slug changes. Test asserts plan-phase.md contains explicit instruction not to create/rename/switch git branches. | **carries-verbatim** — markdown structural assertions; PITFALLS.md notes jj's inverted form is "bookmark didn't auto-advance" (different bug, separate test in Phase 4). |

**Research-time hypothesis:** **all 7 bug-test files are `carries-verbatim`** — they parse markdown files for structural protocols, with no `git ` shell-out in their assertions. The jj-side analog tests (e.g., "bookmark didn't auto-advance" for the 2388-inverted case) are Phase 4 WS-13's job, not Phase 3 TEST-08's. The wrap-up plan finalizes this hypothesis against runtime evidence: if all 7 pass on jj-colocated unchanged, record verdicts and close the table; if any fail, run the per-test triage.

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Parse `jj log` text/graph output | Custom regex parser of the human-readable `jj log` format | `-T 'json(self) ++ "\n"' --no-graph` + `JSON.parse` per line | Human output is explicitly NOT stable across jj versions [CITED: STACK.md #129]. NDJSON is. |
| jj revset translation (`@`, `@-`, etc.) | Inline string concatenation in `jj.ts` | `parse/jj-rev.ts::toJjRev(rev)` (already exists) | Phase 1 D-09..D-12 — branded `RevisionExpr` type forbids raw strings; factory + translator is the only legal path [VERIFIED: sdk/src/vcs/parse/jj-rev.ts] |
| Lock semantics on jj workspaces | Anything emulating `git worktree lock` | jj has no lock primitive — Phase 4 designs the sentinel-file convention if needed | PITFALLS.md Pitfall 4 + STACK.md #5 |
| Hook firing | Anything in `jj.ts` | Stays out of Phase 3 entirely — Phase 4 wires `fireHook` from inside `commit()` / `push()` | Phase 2.1 D-07 + Phase 4 ownership |
| WC snapshot bypass | `--ignore-working-copy` anywhere | Caller-side pre-probe pattern (Phase 2.1 D-06) | D-05 locked |
| `change_id ↔ commit_id` translation | Inline string slicing | `parse/jj-id.ts` (new file) | Centralizes the alphabet conversion (`json(self)` exposes both; the adapter uses commit_id externally for `LogEntry.hash` but change_id internally for revset queries) |
| Bookmark name munging (`gsd/` prefix) | Inline string ops at every call site | A single pair of helpers `addPrefix(name)` / `stripPrefix(name)` in `jj.ts` | D-03 — exhaustive add/strip is the canonical pinning; one helper pair makes the audit mechanical |
| Custom test infrastructure on jj | Reinvent the fixture | `vcs-fixture.ts::makeBackendFixture` already supports `jj-colocated` — just add a setup branch (currently throws) | Phase 1 D-13/D-14/D-15 already designed |

## Files to Create / Modify

### Create (Phase 3)

```
sdk/src/vcs/backends/jj.ts                          # the implementation (~600-1000 LOC)
sdk/src/vcs/parse/jj-log.ts                         # NDJSON log → LogEntry[]
sdk/src/vcs/parse/jj-op-log.ts                      # NDJSON op-log → typed entries (stub)
sdk/src/vcs/parse/jj-workspace-list.ts              # NDJSON workspace-list → WorkspaceInfo[]
sdk/src/vcs/parse/jj-id.ts                          # change_id ↔ commit_id translator
sdk/src/vcs/jj/jj-argv.ts                           # jjArgv() helper (optional — could inline into jj.ts)
docs/test-triage/jj-bugs.md                         # TEST-08 per-test verdict log (D-16)
tests/baselines/jj-vcs/                              # baseline snapshots (planner picks layout — mirrors tests/baselines/git-vcs/)
```

### Modify

```
sdk/src/vcs/types.ts                                # add CommitInput.bookmark, bookmarkRaw; add VcsBookmarkDivergentError; add VcsNotImplementedError (or import from a sibling errors.ts)
sdk/src/vcs/index.ts                                # createVcsAdapter: read vcs.adapter config (D-17), change auto-detect order for colocated (.git+.jj → git, was .jj-first)
sdk/src/vcs/backends.ts                             # BACKENDS_AVAILABLE: ['git'] → ['git','jj-colocated']; add per-verb allowlist (D-12)
sdk/src/vcs/__tests__/vcs-fixture.ts                # remove the "not yet implemented in Phase 1" throw for kind='jj-colocated'; add jj-side initRepo() (jj git init --colocate + author config)
sdk/src/vcs/__tests__/backends.test.ts              # update expected BACKENDS_AVAILABLE value
sdk/src/vcs/backends/git.ts                         # accept (no-op) the new CommitInput.bookmark / bookmarkRaw fields — git auto-advances natively
tests/helpers.cjs                                   # jj-side createTempJjProject() (analog of createTempGitProject); jj-side beforeEach
.github/workflows/test.yml                          # add backend matrix axis + jj install step + continue-on-error on jj lane
.planning/config.json                               # add vcs.adapter: 'auto' field (planner picks exact storage location per D-17 + Claude's discretion)
.planning/phases/03-jj-backend-core-squash-refs-conflict/03-CONTEXT.md  # format-migration tracker entries (D-19, per-plan)
.planning/REQUIREMENTS.md                           # end-of-phase: correct CONFLICT-01 wording from conflict() to conflicts() (see §Open Question Q1)
.planning/ROADMAP.md                                # end-of-phase: same correction in Phase 3 success criteria #3
```

### Do Not Touch

```
sdk/src/vcs/exec.ts                                 # already supports jj invocation via vcsExec(cwd,'jj',args)
sdk/src/vcs/expr.ts                                 # no reshape needed
sdk/src/vcs/parse/jj-rev.ts                         # stub already encodes locked revset mappings
sdk/src/vcs/hook-bridge.ts                          # Phase 4 owns
scripts/lint-vcs-no-raw-git.cjs                     # unchanged; if Phase 3 trips it, that's a bug in the plan
scripts/lint-vcs-no-raw-git.allow.json              # NO new entries
get-shit-done/bin/lib/*.cjs                         # Phase 5 owns workflow markdown / agent prompt rewrites
sdk/src/query/*.ts                                  # Phase 2 migration complete; Phase 5 owns command translations
```

## Common Pitfalls

### Pitfall 1: Confusing `change_id` and `commit_id`

**What goes wrong:** `LogEntry.hash` is a string field shared by both backends. On git, it's a 40-char hex SHA. On jj, `json(self)` exposes BOTH `commit_id` (hex SHA — git-side identity) AND `change_id` (k-z reversed base32 — jj-side identity). If the adapter picks the wrong one, callers that hash-compare across operations get false negatives.

**How to avoid:** Convention — `LogEntry.hash` = `commit_id` on both backends (commit_id is what git emits, and it's what `vcs.refs.resolveShort` returns when given a SHA-like input). Internally, the jj adapter uses `change_id` for any revset query (because change_ids are stable across squash). The `parse/jj-id.ts` translator handles the round-trip if a caller ever needs the other direction.

**Warning signs:** A test that ran fine on git fails on jj with "expected hash X, got Y" where Y is a 32-char alphabetic string — that's a change_id leaking into a commit_id slot.

### Pitfall 2: NDJSON terminator gotcha

**What goes wrong:** `vcsExec` trims trailing whitespace (`stdout.trim()` in `exec.ts:105`). The NDJSON template `-T 'json(self) ++ "\n"'` emits a trailing `\n` on the final record. The trim removes it. `stdout.split('\n')` works because the trim removed the trailing-empty-string case — but if the splitter assumes a trailing newline (it shouldn't), the last record is dropped.

**How to avoid:** Use `stdout.split('\n').filter(Boolean)` (same pattern as `git.ts:196-198`). Document in `parse/jj-log.ts` JSDoc.

**Warning signs:** A parser test that passes with a single-record fixture but fails with a multi-record one — off-by-one.

### Pitfall 3: Divergent bookmarks silently passing through

**What goes wrong:** `jj bookmark list -T 'json(self)'` emits `{name, target: [commit_id1, commit_id2]}` when a bookmark is divergent. Code that naively reads `target[0]` returns one of the two targets without signaling the divergence. Downstream callers commit/push believing the bookmark has a single canonical position.

**How to avoid:** D-02 — every read path that touches a bookmark checks `target.length > 1` and throws `VcsBookmarkDivergentError`. This is non-negotiable; add a pinning test that creates a divergent state (two bookmarks set to the same name via different ops) and asserts the typed error.

**Warning signs:** A bookmark seems to "snap back" to an older position after a `commit()` — divergence was silently selecting an older target.

### Pitfall 4: WC auto-snapshot interleaving (PITFALLS.md #2)

**What goes wrong:** Any read method snapshots `@`. If a caller writes a file, then calls `vcs.log()` (or any other read), then writes another file, then calls `vcs.commit()`, the first file is now in the WC commit before the commit() runs.

**How to avoid:** D-06 + D-07 — caller-side pre-probe discipline (the `stagedOrUnstaged` pattern in `bin/lib/commands.cjs` is the canonical reference). `jj.ts` JSDoc on every read method documents the side effect. Phase 4/5 callers must be aware.

### Pitfall 5: `--ignore-working-copy` slipping in via a copy-paste

**What goes wrong:** STACK.md (pre-Phase-3) recommends `--ignore-working-copy` for read-only queries. A copy-paste from STACK.md examples reintroduces it.

**How to avoid:** D-05 explicit ban. Add a lint scan (cheap regex): "no `--ignore-working-copy` literal in `sdk/src/vcs/backends/jj.ts` or any `parse/jj-*.ts`". Recommended planner addition to the shape commit (plan 1) — adds the lint rule even though it's a one-line check, because the failure mode is silent stale-WC corruption.

### Pitfall 6: Interleaving git and jj mutations (PITFALLS.md #1)

**What goes wrong:** Calling raw `git` from anywhere in jj.ts (or its tests) silently desyncs the colocated repo's state. The next jj command does `jj git import` and produces divergent change_ids or conflicted bookmarks.

**How to avoid:** Phase 1 D-17/D-18 lint guard is whole-repo default-deny on ALL git invocations (not just mutating). It already covers jj.ts (which isn't yet in the allowlist). If Phase 3 trips the guard, that's a planning bug — escalate.

## State of the Art

| Old approach | Current approach | When changed | Impact |
|--------------|------------------|--------------|--------|
| `jj squash` without `-B/-A/-o` (standard "into parent") | `-B @ -k -m` for GSD's commit-from-WC model | jj 0.31+ (experimental `-B/-A/-o` flags) | GSD-specific — squashes WC content into a new commit BEFORE `@` instead of INTO `@-`. Marked `EXPERIMENTAL` in `jj squash --help` (jj 0.41) — flag to watch on future bumps. |
| `jj log -r 'conflict()'` (singular, per CONTEXT/REQUIREMENTS) | `jj log -r 'conflicts()'` (plural) | Unknown — exists in jj 0.41 | Implementation correction; documentation correction at end of phase. |
| Auto-detect `.jj` first, `.git` fallback (Phase 1 D-04) | Default git when both present (D-17) for colocated case | Phase 3 (this phase) | Avoids surprise-flipping users into jj before they've opted in. |
| `vcs.refs.currentBookmark(): string \| null` | `vcs.refs.currentBookmarks(): string[]` | Phase 2.1 D-15 | Already done in Phase 2.1; jj.ts implements the new shape. |
| `vcs.stage()` / `vcs.unstage()` as cross-backend verbs | `vcs.commit({files})` WC-state-capture | Phase 2.1 D-03 | Done in Phase 2.1; jj.ts has no stage/unstage to implement. |
| `vcs.hooks` public namespace | Module-private `fireHook` in `hook-bridge.ts` | Phase 2.1 D-07 | Phase 4 wires internally; Phase 3 jj.ts does NOT touch hooks. |

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|-------|---------|---------------|
| A1 | `jj squash --message` does not open an editor when message is provided | §Squash semantics | [ASSUMED — verified locally; jj help confirms "The description to use for squashed revision (don't open editor)"] — risk: low |
| A2 | `jj bookmark set -B` accepts `--allow-backwards` semantics (move bookmark backward/sideways) | §refs.bookmarks.move | [VERIFIED locally — `jj bookmark set --help` shows `-B, --allow-backwards`] |
| A3 | `jj resolve --list -r <rev>` lists conflicted paths for a given revision | §findConflicts | [ASSUMED — not exercised locally during this research. Risk: medium. If wrong, fall back to parsing `jj diff -r <rev> --summary` for paths with `?` conflict marker, or to a custom template like `-T 'conflict.paths().join("\n")'`. Verify in plan 6 (findConflicts implementation).] |
| A4 | `jj git push --force-with-lease` exists and matches git semantics | §push | [ASSUMED — verify via `jj git push --help` in plan 7. Risk: low; if absent, document `opts.force` as no-op on jj with a warning.] |
| A5 | `jj git remote list -T 'name ++ "\n"'` is the right argv for `refs.remotes()` | §refs.remotes | [ASSUMED — verify in plan 3. Risk: low; falls back to parsing default human output.] |
| A6 | `jj git fetch --remote <name>` and the lack of per-ref selectivity is acceptable for Phase 3 FetchOpts | §fetch | [ASSUMED — verify in plan 7. If a caller passes `opts.ref` to fetch on jj, treat as warning + no-op.] |
| A7 | `jj op log` exit semantics match `jj log` (exit 0 on success, exit 1 on bad revset) | §[__vcsTestOnly] snapshot/restore | [ASSUMED — high confidence based on jj CLI conventions] |
| A8 | `BACKENDS_AVAILABLE_FOR_VERB` mechanism is the right shape for D-12 | §Per-verb allowlist | [Claude's discretion — planner can pick a different mechanism (e.g., a per-test `it.skipIf` or a fixture-level `expect.fail.on(kind)`); the throw-not-skip invariant is locked, the mechanism is not] |
| A9 | All 7 worktree-bug tests carry-verbatim under jj-colocated | §Bug-Test Triage Table | [ASSUMED at research time per D-16; verified per-test as they surface during plan execution] |

## Open Questions

### Q1. `conflict()` vs `conflicts()` revset spelling — CORRECTION REQUIRED

**What we know:** CONTEXT.md, REQUIREMENTS.md (CONFLICT-01), and ROADMAP.md (Phase 3 success criteria #3) all use `jj log -r 'conflict()'` (singular). STACK.md doesn't mention the revset spelling.

**What's unclear:** Nothing — locally verified on `jj 0.41.0`:
- `jj log -r 'conflict()'` → `Error: Failed to parse revset: Function 'conflict' doesn't exist`
- `jj help -k revsets` → `* conflicts(): Commits that have files in a conflicted state.`
- `jj log -r 'conflicts()'` → works (empty result on a non-conflicted repo).

**Recommendation:** Implementation uses `conflicts()`. The wrap-up plan (D-10g) corrects:
- `.planning/REQUIREMENTS.md` CONFLICT-01: `via 'jj log -r 'conflict()''` → `via 'jj log -r 'conflicts()''`
- `.planning/ROADMAP.md` Phase 3 success criteria #3: same change
- `.planning/research/STACK.md`: no mention to fix
- `.planning/research/PITFALLS.md`: no mention to fix
- `03-CONTEXT.md` §Domain (line 9): `via 'jj log -r 'conflict()''` → `via 'jj log -r 'conflicts()''`

This is doc-only; no requirement reshape. Surface to the user during the wrap-up plan; do not relock the underlying decision.

### Q2. Should `bookmarks.list()` return all bookmarks or only `gsd/`-prefixed?

**What we know:** D-03 says the `gsd/` prefix is adapter-internal — callers don't see it. D-04 says raw-named bookmarks can be created via `{raw:true}`. The contract method `bookmarks.list(): Bookmark[]` says nothing about filtering.

**What's unclear:** Should `list()` return `[{name: 'phase-3', rev}]` only (strip + filter to gsd-prefixed), or `[{name: 'phase-3', rev}, {name: 'main', rev}]` (strip gsd-prefixed, leave others verbatim)?

**Recommendation:** Return ALL bookmarks. Strip `gsd/` prefix from gsd-prefixed names; leave non-prefixed names verbatim. Rationale: D-04 establishes raw bookmarks as first-class (upstream `main`, `trunk`); a `list()` that hides them is broken. The round-trip test pinning D-03 is "`bookmarks.create('phase-3') ; bookmarks.list()` includes `'phase-3'`" — this works either way.

### Q3. `vcs.workspace.list()` path field — what to populate?

**What we know:** `jj workspace list -T 'json(self)'` emits `{name, target}` — no `path` field. The contract `WorkspaceInfo` requires `path: string`.

**What's unclear:** How to derive the path for non-default workspaces. The colocated case has a single `default` workspace at `cwd`. Multi-workspace cases land in Phase 4.

**Recommendation:** For Phase 3, return `[{name: 'default', rev: target.commit_id, locked: false}]` — using `name` as a placeholder for `path`. Or call `jj workspace root` for each workspace (separate command per name). The cleanest path: Phase 3's `vcs.workspace.list()` returns `[{path: cwd, rev: target.commit_id, locked: false}]` for the single-workspace case (the only case Phase 3 needs to handle). Phase 4 reshapes when WS-* lands.

### Q4. `jj op restore` correctness for the test-fixture snapshot/restore

**What we know:** `jj op log -T 'id'` emits stable IDs; `jj op restore <id>` is documented as rewinding to that state.

**What's unclear:** Does `jj op restore` interact safely with the WC when the test has modified disk? Does it leave stale files on disk? (git's `reset --hard` + `clean -fdx` is the safe combo.)

**Recommendation:** Verify in plan 1 (shape commit also pins the test-fixture pattern). If `jj op restore` leaves stale files, add a `jj st` after to confirm and add a `jj abandon` of any pending WC content (or `rm -rf` the disk and let jj re-snapshot). Plan author owns this verification.

### Q5. CommitInput.amend on jj — defer or implement?

**What we know:** Phase 2.1 D-05 says `amend` is cross-backend (`amend: true` → `git commit --amend --no-edit` on git; jj equivalent on jj). The git backend implements it. jj has no native `--amend` but `jj squash --into <prior-change>` is the equivalent.

**What's unclear:** Is any Phase 3 caller exercising `amend: true` on jj? Audit point.

**Recommendation:** Plan 4 (commit + bookmark advance) implements `amend` on jj as `jj squash --into <prior-change> -m <new_message>` if a Phase 3 caller exercises it; otherwise throw `VcsNotImplementedError('amend on jj backend: deferred to Phase 4/5')` and document.

## Sources

### Primary (HIGH confidence)

- **Local verification on this repo's jj 0.41.0**, 2026-05-12:
  - `jj git init --colocate` + `jj squash -B @ -k -m`: §Squash semantics verified end-to-end
  - `jj log -T 'json(self) ++ "\n"' --no-graph -r @`: §NDJSON shapes — exact field list captured
  - `jj op log -T 'json(self) ++ "\n"' --no-graph`: same
  - `jj workspace list -T 'json(self) ++ "\n"'`: same
  - `jj bookmark list -T 'json(self) ++ "\n"'`: divergent-target array shape verified
  - `jj log -r 'conflict()'` → `Function 'conflict' doesn't exist` — §Q1 correction
  - `jj help -k revsets` excerpt: `* conflicts(): Commits that have files in a conflicted state.`
  - `jj squash --help`: `-B/-A/-o` marked `EXPERIMENTAL`; `--message` documented as no-editor
  - `jj bookmark set --help`: `-B, --allow-backwards` confirmed
  - `jj bookmark --help`: full subcommand list (advance, create, delete, forget, list, move, rename, set, track, untrack)
- **`sdk/src/vcs/types.ts`** (current commit `ooxzuutkqplolrlwxnopwyzkknqrqyuz`): full adapter contract surface — methods, types, discriminated union, `__vcsTestOnly` symbol
- **`sdk/src/vcs/backends/git.ts`**: reference implementation for every adapter verb the jj backend mirrors
- **`sdk/src/vcs/exec.ts`**: spawn wrapper shape (`vcsExec`, `execGit`, `ExecResult`, `VcsExecError`)
- **`sdk/src/vcs/parse/jj-rev.ts`**: locked revset translations
- **`sdk/src/vcs/backends.ts`**: backend matrix constants
- **`sdk/src/vcs/__tests__/vcs-fixture.ts`**: fixture wiring for Phase 3 to extend
- **`.planning/phases/03-jj-backend-core-squash-refs-conflict/03-CONTEXT.md`**: all D-01..D-20 decisions
- **`.planning/REQUIREMENTS.md`**: requirement IDs JJ-01..07, SQUASH-01..07, REFS-01..06, CONFLICT-01..03, TEST-08, CI-01..02
- **`.planning/STATE.md`**: Phase 2.1 complete; Phase 3 ready

### Secondary (MEDIUM confidence)

- **`.planning/research/STACK.md`**: jj version capability matrix + flag conventions (research date 2026-05-09; Phase 3 D-05 supersedes its `--ignore-working-copy` recommendation)
- **`.planning/research/PITFALLS.md`**: Pitfalls #1–#5 (interleaving git+jj, WC snapshot footgun, workspace ≠ worktree, no lock primitive, hook design space)
- **jj 0.41 official docs** (referenced via STACK.md citations and `jj help -k`):
  - `https://docs.jj-vcs.dev/latest/templates/` — json() and Serialize semantics
  - `https://docs.jj-vcs.dev/latest/technical/concurrency/` — lock-free design
  - `https://docs.jj-vcs.dev/latest/git-compatibility/` — colocated repo lifecycle
  - `https://docs.jj-vcs.dev/latest/cli-reference/` — global flags

### Tertiary (LOW confidence — flagged in §Assumptions Log)

- A3, A4, A5, A6: argv shapes for `jj resolve`, `jj git push --force-with-lease`, `jj git remote list`, `jj git fetch` — to be verified in their respective plans during implementation

## Metadata

**Confidence breakdown:**
- Adapter contract surface: **HIGH** — `types.ts` is the load-bearing source of truth, read end-to-end
- Squash semantics: **HIGH** — verified locally
- NDJSON shapes: **HIGH** for log/op-log/workspace/bookmark — verified locally on jj 0.41
- Bookmark argv shapes: **HIGH** for list/create/set/delete; **MEDIUM** for `forget` (deprecation-adjacent) and `advance` (Phase 3 doesn't use)
- `conflicts()` revset: **HIGH** — corrected locally vs. upstream docs
- CI matrix shape: **HIGH** — existing `test.yml` is well-understood
- Bug-test triage: **MEDIUM** — research-time hypothesis (all carries-verbatim); per-test verdicts are D-16 deferred
- Hook firing: N/A — Phase 4 owns

**Research date:** 2026-05-12
**Valid until:** 2026-06-12 (jj release cadence is ~monthly; Renovate bump may invalidate NDJSON-shape claims if jj 0.42 lands a `json(self)` field change. The shape commit's snapshot tests are the canonical valid-until gate.)

## RESEARCH COMPLETE
