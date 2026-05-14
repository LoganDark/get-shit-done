# Phase 7: Reconcile fork capabilities with upstream - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-14
**Phase:** 07-reconcile-fork-capabilities-with-upstream-add-missing-adapter
**Areas discussed:** workspace.merge on jj, github-release-notes.cjs, Phase scope / split, Upstream test surface triage

---

## workspace.merge on jj (verb shapes)

### Q1: jj rendering of `workspace.merge`

| Option | Description | Selected |
|--------|-------------|----------|
| 2-parent jj new | Synthesize merge: `jj new -r <main> -r <agent>` + describe + bookmark set. Preserves both-parent provenance; matches `git merge --no-ff` semantically. change_ids stable. | ✓ |
| Linearize via jj rebase | `jj rebase -s <agent-head> -d <main>` then advance bookmark. More idiomatic jj day-to-day, but loses 2-parent shape and rewrites change_ids. | |
| Route to Phase 4 reap path | `workspace.merge` is a no-op on jj; wave-cleanup routes to existing octopus reap. Backend-asymmetric verb. | |

**User's choice:** 2-parent jj new (Recommended)

### Q2: Conflict handling

| Option | Description | Selected |
|--------|-------------|----------|
| Return conflicted result, no auto-undo | Mirror Phase 3 commit() conflict semantics (SQUASH-06); return `{ ok: false, conflicted: true, change_id }`; caller decides. | ✓ |
| Auto-abandon and report failure | Detect conflict via findConflicts; `jj abandon @`; return clean-undo result. New adapter-side auto-undo pattern. | |
| Block before merge via findConflicts | Pre-check parents for in-tree conflicts; refuse merge if either is conflicted. Mismatches git semantics. | |

**User's choice:** Return conflicted result, no auto-undo (Recommended)

### Q3: Bookmark hygiene after merge

| Option | Description | Selected |
|--------|-------------|----------|
| Advance main only; leave agent bookmark | Single-responsibility verb; wave-cleanup follows up with `bookmarks.delete`. | |
| Advance main AND delete agent bookmark | Verb does both atomically. Overlaps with `bookmarks.delete` (verb #7) which still exists for other callers — shortcut path. | ✓ |
| Don't touch any bookmarks; return change_id only | Pure synthesis primitive; forces caller to make 2 extra adapter calls. | |

**User's choice:** Advance main AND delete agent bookmark

### Q4: `refs.bookmarks.currentIn(cwd)` return shape

| Option | Description | Selected |
|--------|-------------|----------|
| string[] to match D-15 | Return all bookmarks at @. Consistent with `currentBookmarks` shape. Wave-cleanup picks expected bookmark from manifest. | ✓ |
| string \| null with documented 'first of array on jj' | Match upstream's call-site shape verbatim. Two ref-resolution shapes on adapter (string vs string[]). | |
| { bookmarks: string[], expected?: string } | Object shape; most explicit; introduces new shape pattern. | |

**User's choice:** string[] to match D-15 (Recommended)

### Q5: `workspace.remove` behavior on jj

| Option | Description | Selected |
|--------|-------------|----------|
| forget + rm -rf the workspace dir | Full upstream semantic; matches `git worktree remove --force` byte-for-byte; `workspace.forget` stays metadata-only. | ✓ |
| Alias for workspace.forget | Collapse to same op; user does fs cleanup themselves. Mismatches git semantics. | |
| force-flag-aware (force=true does fs cleanup) | Single verb, flag-controlled. Conflates two semantically distinct ops. | |

**User's choice:** forget + rm -rf (Recommended)

### Q6: `refs.mergeBase` id shape on jj

| Option | Description | Selected |
|--------|-------------|----------|
| commit_id on both backends | Return immutable commit_id of meet point. Matches git's commit-hash. Stable across rebases. | |
| change_id on jj, commit hash on git | jj-idiomatic; change_id moves with rebases (risk in long-lived references). | ✓ |

**User's choice:** change_id on jj (user override of recommendation)
**Notes:** User explicitly overrode the rebase-stability recommendation. Aligns with broader project preference for change_id throughout the adapter surface and `.planning/` files.

### Q7: `diff({ diffFilter })` shape

| Option | Description | Selected |
|--------|-------------|----------|
| Typed enum ('added'\|'modified'\|'deleted'\|'renamed'\|'typechange') | TS discriminated union; backend translators emit the right flag. Type-safe; respects Phase 2.1 D-01 "no git terminology leaks". | ✓ |
| Raw single-letter string ('D','A','M','R','T') | Pass-through git's shape verbatim. Leaks git terminology; violates D-01. | |
| Array form | Multi-filter support. YAGNI for current consumer. | |

**User's choice:** Typed enum (Recommended)

### Q8: Scoped `status({ cwd })`

| Option | Description | Selected |
|--------|-------------|----------|
| Add optional cwd to existing status() opts | Smallest surface change; cwd defaults to adapter's construction cwd. | ✓ |
| Separate statusIn(cwd, opts) verb mirroring currentIn | Consistent naming pattern; introduces positional-cwd-before-opts signature. | |
| Per-call sub-adapter via vcs.in(cwd) | Most extensible; heavyweight for single consumer. | |

**User's choice:** Add optional cwd to existing status() opts (Recommended)

---

## github-release-notes.cjs

### Q1: Fate of `scripts/changeset/github-release-notes.cjs`

| Option | Description | Selected |
|--------|-------------|----------|
| Delete the file entirely | Fork doesn't publish releases; dead code; drop lint allowlist entry. | |
| Migrate to adapter | Rewrite the one git invocation to use adapter verbs; drops lint exception cleanly. | ✓ |
| Keep lint-annotated as-is | Status quo; zero work. | |
| Defer to v1.2 | Park the question. | |

**User's choice:** Migrate to adapter

### Q2: Cross-backend vs gitOnly?

| Option | Description | Selected |
|--------|-------------|----------|
| Cross-backend (vcs.log / vcs.diff) | Logic isn't git-only ("enumerate commits, render markdown"); drops lint exception cleanly. | ✓ |
| gitOnly narrowing | Acknowledge release-notes-generation is structurally git/GitHub; calls become kind-gated. | |

**User's choice:** Cross-backend
**Notes:** User added: "we don't want to exclude the possibility of an upstream merge; we just don't intend on it right now." This is a notable framing update — the fork's "no PRs back" rule softens to "no PRs back currently, but don't foreclose the possibility." Captured as D-18 in CONTEXT.md.

---

## Phase scope / split

### Q1: Single phase vs split

| Option | Description | Selected |
|--------|-------------|----------|
| Single Phase 7 covering all five | One cohesive "reconcile with the merge" story; ~5-7 plans. | ✓ |
| Split: Phase 7 (verbs+executor+workflow .md) + Phase 8 (test surfaces + release-notes) | Cleaner phase boundaries; lets Phase 7 dogfood before triage. | |
| Maximal split (Phase 7 + 7.1 INSERTED + Phase 8) | Mirrors 2.1/03.1 INSERTED pattern. Coordination overhead. | |

**User's choice:** Single Phase 7 (Recommended)

### Q2: Sequencing

| Option | Description | Selected |
|--------|-------------|----------|
| Verbs → executor wire → workflow .md cleanup → release-notes → test surfaces | Mechanical dependency-ordered sequence. | |
| Verbs → test surfaces → executor wire → workflow .md → release-notes | Front-load test triage to surface adapter-shape regressions early. | |
| Parallelize where independent | "no parallelization until migration" rule may still apply. | |

**User's choice:** Free-text: "Let's test parallelization. We should be able to do it now post-migration."
**Notes:** User opting in to parallelization on this repo. Migration is complete (v1.0 shipped); the `project_no_parallelization_yet` memory rule is updated.

### Q3: Parallelization bootstrap path

| Option | Description | Selected |
|--------|-------------|----------|
| Sequential prefix → dogfood the new wave-cleanup executor | Plans 1-2 sequential (verbs, executor wire); plans 3+ fan out using the freshly-wired jj wave-cleanup. Maximum dogfood. | |
| Sequential prefix → git-side fan-in (no dogfood) | Same plan structure; parallel plans fan in via existing git wave-cleanup (colocated repo). Lower risk; loses dogfood signal. | |
| Use Phase 4 octopus/reap path directly | Skip wave-cleanup for Phase 7's own execution; use SDK helpers `octopus.ts` + `reap.ts`. Clean separation. | ✓ |

**User's choice:** Use Phase 4 octopus/reap path directly
**Notes:** Wave-cleanup is for workflow-driven cleanup; SDK octopus path is for executor-internal fan-in. Different consumers, different code paths.

---

## Upstream test surface triage

### Q1: Verification depth

| Option | Description | Selected |
|--------|-------------|----------|
| Full run on both backends; document every delta | Maximum signal; aligns with milestone goal "bring new upstream test surfaces green on jj". | ✓ |
| Triage to VCS-touching surfaces only | Faster; risks missing transitive VCS dependencies. | |
| Skip; assume git-side coverage suffices | Lowest cost; weakest signal. | |

**User's choice:** Full run on both backends; document every delta (Recommended)

### Q2: Delta disposition policy

| Option | Description | Selected |
|--------|-------------|----------|
| Fix-or-document, per-failure judgment call | Each delta gets its own decision (fix in Phase 7 if mechanical; document if git-side-only). | |
| Fix all jj-side failures in Phase 7 (block phase close on green) | Strict quality bar; Phase 7 doesn't close until both backends green. Risks scope creep. | ✓ |
| Document all deltas; defer fixes to v1.2 | Phase 7 stays tight; v1.2 picks up fix list. Defers the milestone's stated goal. | |

**User's choice:** Fix all jj-side failures in Phase 7

### Q3: Scope-expansion policy

| Option | Description | Selected |
|--------|-------------|----------|
| Add verb to Phase 7 if mechanical; defer to v1.2 if design-heavy | Per-gap judgment call; bounded scope creep. | |
| Any verb gap blocks Phase 7 close — no deferral | Fully strict; unbounded scope tail. | |
| Cap Phase 7 at 7 known verbs; gaps go to Phase 7.1 INSERTED | Mirrors 2.1/03.1 pattern; clean phase boundaries. | ✓ |

**User's choice:** Cap Phase 7 at the 7 known verbs; gaps go to a Phase 7.1 INSERTED

---

## Claude's Discretion

- Exact jj revset for `refs.mergeBase` (researcher confirms)
- Exact `jj diff` flag set used to drive `diffFilter` post-filtering
- Per-domain test file placement (existing per-domain test files vs new dedicated file)
- Per-plan ordering inside the parallel fan-out batch
- Workflow .md `else`-branch removal style (default: hard-delete per TODO(jj-port) intent)
- Multi-runtime markdown sync surface mechanics (follow Phase 5 PROMPT-02 pattern)

## Deferred Ideas

- A3 colocated pre-commit gap (Phase 4 LEARNINGS Open Q1) — not Phase 7 scope
- Workflow .md fallback-removal exact strategy — defaulted to planner discretion
- Multi-runtime markdown sync — locked by Phase 5; not re-discussed
- Per-verb contract-test depth policy — defer to planner
- Future verbs surfaced by strict-green triage → `Phase 7.1 INSERTED` mechanism
- Release-notes script tag-handling on jj (likely irrelevant; researcher confirms)
