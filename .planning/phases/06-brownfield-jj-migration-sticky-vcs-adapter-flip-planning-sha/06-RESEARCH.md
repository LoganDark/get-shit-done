# Phase 6: Brownfield jj Migration — Research

**Researched:** 2026-05-14
**Domain:** VCS migration (git ↔ jj), `.planning/` prose rewriting, `vcs.adapter` config flip, dogfood validation
**Confidence:** HIGH for code-surface findings (read from this repo); MEDIUM for jj operator semantics (verified against installed `jj 0.41`); LOW for the dogfood safety rollback design (no precedent in the codebase)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01 (Orphan-SHA handling — best-effort ancestor + structured report):** When the rewriter encounters a git SHA (in either direction's prose scan) that doesn't resolve to a known counterpart identifier, the strategy is best-effort resolve to nearest ancestor:
1. Walk back through the source-VCS ancestry from the orphan identifier until hitting one that DOES map to a known counterpart.
2. Rewrite to that ancestor's identifier inline, with a `[was sha:abc123]` (or `[was cid:xyz]` for the reverse direction) annotation so the breadcrumb is preserved.
3. Emit a structured migration report at `.planning/intel/06-migration-report.md` (or equivalent path; planner confirms). For each orphan handled this way, the report records: original identifier, file:line where it appeared, resolved-ancestor identifier, AND the direct-children identifiers of that ancestor in the migrated DAG.
4. The report is post-migration, advisory — a downstream LLM (or human reviewer) can scan it and pick a better child mapping when there's an obvious match, then apply the correction inline. The default (ancestor mapping) stays in place unless overridden.

**Failure mode if ancestor walk hits the root with no resolution:** Replace with a literal `[orphan:abc123]` placeholder and add to the report's "unresolvable" section.

**D-02 (Empty-dir `--jj` defaults to colocated; modifier accepted):** `/gsd-new-project --jj` invoked in a literal empty directory runs `jj git init --colocate` by default (creates both `.git/` and `.jj/`). This gets the A3 pre-commit hook fire that Phase 5 just landed (only works in colocated mode per Phase 4 LEARNINGS).

The `--jj` flag accepts a modifier for explicit opt-out:
- `--jj` or `--jj=colocated` → `jj git init --colocate`
- `--jj=native` → `jj git init --no-colocate` (no `.git/`; loses A3 hook semantics; user must opt in)

**Mirroring on migration command:** `/gsd-migrate-vcs --target jj` defaults to colocated when the project isn't already a jj repo (it runs `jj git init --colocate` as part of the migration). Native opt-in via `--target jj --native` (or similar; planner confirms exact flag shape).

**D-03 (Migration command name: `/gsd-migrate-vcs` with bidirectional `--target`):** The brownfield migration command is `/gsd-migrate-vcs`. It takes a `--target` flag specifying the destination VCS.

Current-state-aware defaults:
- If `.planning/config.json` `vcs.adapter` is `git` or absent → default `--target jj` (colocated). User can invoke `/gsd-migrate-vcs` with no args; it's unambiguous in this state.
- If `.planning/config.json` `vcs.adapter` is `jj` → require explicit `--target git`. The bare command refuses with a clear error stating the current adapter and the required flag.

Bidirectional, round-trip safe: The migration is NOT one-way. A user can migrate git→jj, run `jj rebase` against upstream, then `/gsd-migrate-vcs --target git` to flip back. The rewriter uses both directions of the jj backend's runtime translators (`vcs.jjOnly.commitIdOf` and its inverse — both already exist per Phase 3 parse layer). Round-trips work because at every flip the rewriter resolves identifiers using the CURRENT backend state, not a frozen pre-migration mapping.

This overrides ROADMAP SC #4's prior "one-way (no auto-rollback)" framing. The ROADMAP entry has been updated in lockstep with this discussion.

Future extensibility: The `/gsd-migrate-vcs` surface accommodates a hypothetical future third VCS (hg, sapling, etc.) by extending the `--target` value set rather than spawning a new command.

**D-04 (Failure recovery: single atomic commit + trust VCS):** The rewriter walks all in-scope `.planning/` files in-memory, computes all rewrites, then writes all changes to disk and emits a single atomic commit that captures both the rewrites AND the `vcs.adapter` flip in `config.json`.

Partial-failure recovery:
- Mid-walk crash (before commit): working tree has uncommitted changes. User runs `git restore .` (on git) or `jj abandon` (on jj — though this case implies migrating FROM jj, where the working copy auto-snapshots) to discard. Re-run `/gsd-migrate-vcs` — the rewriter is idempotent on already-migrated files (no-op when the source-direction identifier already matches the target VCS's shape).
- Post-commit unexpected failure: covered by the bidirectional contract from D-03 — user runs `/gsd-migrate-vcs --target <previous>` to flip back. No explicit backup snapshot needed; VCS history IS the rollback.

No `.planning/.migration-backup/` snapshot, no two-phase staging directory. Both would be redundant given VCS-history-as-rollback and would add cross-platform fragility (Windows rename semantics, gitignore management for backup dirs).

Idempotency requirements for the rewriter:
1. A file with no identifiers matching the source-VCS shape is left untouched.
2. A file already migrated (all in-scope identifiers match the target VCS's shape) is left untouched.
3. A file with a mix (some migrated, some not) is rewritten so all in-scope identifiers reach the target shape; mixed state happens only if a prior partial run was discarded and re-run.

### Claude's Discretion (D-05)

The following implementation choices are NOT pre-decided — planner picks from this research:

- Rewriter algorithm shape (regex-pluck vs. parse-driven walker)
- Migration report file path/format (`.planning/intel/06-migration-report.md` vs. `.json`)
- Native-mode migration command flag shape (`--target jj --native` vs. `--target jj-native` vs. `--mode native`)
- Banner verbosity (`Detected jj repo — using jj backend` on greenfield auto-select)
- Plan splits within Phase 6 (likely 3-4 plans)

### Deferred Ideas (OUT OF SCOPE)

- Inverse migration idempotency tests beyond the rebase scenario (abandon-between-flips, fork-between-flips)
- Migration command `--dry-run` flag
- Per-file migration scope override (`--only .planning/STATE.md`)
- Cross-VCS conflict detection at migration time (probably handled by adapter-level conflict detection from Phase 3)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BROWN-01 | Brownfield commands verified against this repo's jj backend | §"Dogfood Safety Strategy" + §"Architectural Responsibility Map" — dogfood blocked until rewriter + adapter flip land |
| BROWN-02 | First weekly upstream rebase recorded after brownfield validation | §"BROWN-02 Retro File Shape" — appends to `.planning/intel/rebase-log.md` |
| Phase 6 native — greenfield init policy | `.jj/` detection auto-selects jj; empty-dir requires explicit `--git`/`--jj`; replace upstream silent `git init` at `new-project.md:108-112` | §"Greenfield Gate Wiring" — exact insertion point + `has_jj` flag addition to `initIngestDocs`-style handler |
| Phase 6 native — sticky `vcs.adapter` flip | Migration command atomically rewrites + flips `vcs.adapter` in `.planning/config.json` | §"vcs.adapter Write Semantics" — `atomicWriteConfig` exists at `sdk/src/query/config-mutation.ts:36-47`; key must be added to `VALID_CONFIG_KEYS` |
| Phase 6 native — `.planning/` SHA↔change_id rewriter | Bidirectional library under `sdk/src/vcs/format-migration/` | §"Standard Stack" + §"Rewriter Algorithm" — `commitIdOf`/`changeIdOf` already at `sdk/src/vcs/parse/jj-id.ts:33-67` |
| Phase 6 native — explicit migration command | `/gsd-migrate-vcs --target <jj\|git>` with current-state-aware defaults | §"CLI Surface" + §"Migration Command Workflow Markdown Shape" |
</phase_requirements>

## Summary

Phase 6 wires four mostly-independent surfaces into one phase: (1) a greenfield-gate edit to `get-shit-done/workflows/new-project.md` lines 108-112 to detect `.jj/` and refuse empty-dir without an explicit flag; (2) a new `sdk/src/vcs/format-migration/` library that walks the seven-class surface inventory from Phase 3 D-19 (STATE prose, per-phase docs prose, `.planning/intel/*.md`, `.planning/research/*.md`, gsd-sdk phase manifests, gsd-sdk commit output, the new migration report itself) and rewrites SHA↔change_id in either direction; (3) a new `/gsd-migrate-vcs` slash command + workflow markdown + SDK query verb that drives the rewriter and atomically flips `.planning/config.json` `vcs.adapter`; (4) the BROWN-01 dogfood loop (run the migration against this repo, exercise brownfield commands) plus the BROWN-02 rebase retro entry.

The structural finding that simplifies the rewriter dramatically: **every SHA-shaped identifier in `.planning/` prose appears in prose-only contexts** — there are no structured JSON fields anywhere under `.planning/` that store a SHA as a typed value. (gsd-sdk's `query commit` returns `{ hash }` in a JSON envelope but never persists it to disk under `.planning/` — see §"gsd-sdk commit-recording paths"). This means the rewriter is a regex-pluck-and-resolve loop over a fixed glob set, not a parser-driven AST walker.

The structural finding that complicates the design: **`vcs.adapter` is not in `VALID_CONFIG_KEYS`** at `sdk/src/query/config-schema.ts:18`. The existing `configSet` query path (`sdk/src/query/config-mutation.ts:191`) will reject any attempt to set it through the public surface. Phase 6 must either (a) add `vcs.adapter` to both `config-schema.ts` and `config-schema.cjs` (parity-tested per #2653), or (b) have the migration command call `atomicWriteConfig` directly (private but unexported helper). Option (a) is correct: it's a real, intentional, user-settable config key that the CI parity test should enforce.

**Primary recommendation:** Build the rewriter as a pure function `migrateFile(content: string, direction: 'git→jj' | 'jj→git', resolveId: (id: string) => Result) → { content, report }` driven by a regex `/\b[0-9a-f]{7,40}\b/g` (git SHA shape) and `/\b[k-z]{8,12}\b/g` (jj change_id shape — lower 26-letter alphabet). Drive it from a top-level `runMigration(cwd, target)` that locates files via glob, holds an in-memory result map, computes a single atomic commit, then writes through `atomicWriteConfig` for the adapter flip and standard `writeFile` + `vcs.commit({ files, message })` for the prose changes. The rewriter is fully synchronous in its core (string→string), with all I/O at the outer edge — this is the shape that makes the idempotency invariants from D-04 mechanically verifiable.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `.jj/` detection at project init | SDK query handler (`init.new-project`) | Workflow markdown branches on the flag | Existing pattern: `has_git` returned by `init.ts:1177` consumed by workflow `.md`; add `has_jj` peer |
| Sticky `vcs.adapter` config flip | SDK query handler (new: `migrate-vcs.flip-adapter`) | `atomicWriteConfig` (existing private helper) | Mirrors `configSet`'s atomic-rename pattern; must register `vcs.adapter` in `VALID_CONFIG_KEYS` |
| `.planning/` prose rewriter — file walk | SDK library `sdk/src/vcs/format-migration/walk.ts` | Glob resolution via `fast-glob` or `node:fs` recursive | Pure traversal; no jj-binary dependency |
| `.planning/` prose rewriter — ID resolution | SDK library `sdk/src/vcs/format-migration/resolve.ts` | `sdk/src/vcs/parse/jj-id.ts` (`commitIdOf`/`changeIdOf`) | Existing translators are one-call-per-id; this layer batches and caches |
| `.planning/` prose rewriter — ancestor walk | SDK library `sdk/src/vcs/format-migration/orphan.ts` | `vcs.log` adapter calls (existing `LogEntry`-returning) | First-parent walk via `jj log -r '<id>::'` (jj) or `git rev-list --first-parent <id>..HEAD` (git) |
| Migration report emission | SDK library `sdk/src/vcs/format-migration/report.ts` | `node:fs writeFile` to `.planning/intel/06-migration-report.md` | Markdown writer; no VCS dependency |
| `/gsd-migrate-vcs` user surface | Workflow markdown `get-shit-done/workflows/migrate-vcs.md` | `gsd-sdk query migrate-vcs.run` (new) | Mirrors `/gsd-quick`, `/gsd-undo`, `/gsd-ship` shape — short markdown + thick SDK verb |
| `/gsd-new-project` greenfield gate | Workflow markdown edit `new-project.md:108-112` | `init.new-project` returns new `has_jj` flag | Replace silent `git init` with branching on `has_jj` + `has_git` + flag |
| Atomic commit (rewrites + adapter flip) | `vcs.commit({ files, message })` (existing adapter method) | Phase 3 squash semantics on jj, git commit on git | Single commit covers `.planning/config.json` + all rewritten prose files |
| BROWN-02 retro file | Workflow append to `.planning/intel/rebase-log.md` | No SDK verb needed | Plain markdown append, manual workflow |
| Dogfood validation (BROWN-01) | Manual workflow guarded by checkpoint | Brownfield command integration tests (Phase 5 fixture pattern) | No automation can fully validate dogfood; gate behind `checkpoint:human-verify` |

## Standard Stack

### Core
| Module | Path | Purpose |
|--------|------|---------|
| `commitIdOf` | `sdk/src/vcs/parse/jj-id.ts:33-49` | Resolve jj change_id → git commit_id via `jj log -r <changeId> -T 'commit_id' --no-graph -n 1`. Throws `VcsExecError` on non-zero exit. [VERIFIED: read this repo] |
| `changeIdOf` | `sdk/src/vcs/parse/jj-id.ts:51-67` | Resolve git commit_id → jj change_id via `jj log -r <commitId> -T 'change_id' --no-graph -n 1`. Same error contract. [VERIFIED: read this repo] |
| `atomicWriteConfig` | `sdk/src/query/config-mutation.ts:36-47` | Atomic temp-file + rename JSON write with fallback to direct write on Windows-style rename failure. **Not exported.** Phase 6 must either export it or duplicate the 12-line helper. [VERIFIED: read this repo] |
| `VALID_CONFIG_KEYS` | `sdk/src/query/config-schema.ts:18-79` + `get-shit-done/bin/lib/config-schema.cjs:16` | Allowlist for `configSet`. **`vcs.adapter` is NOT present.** Phase 6 MUST add it to both files (CI parity-tested per #2653). [VERIFIED: read this repo] |
| `createVcsAdapter` | `sdk/src/vcs/index.ts:20-46` | Factory that reads `vcs.adapter` from `.planning/config.json` at construction. Cache implications: callers receive a frozen adapter snapshotted at construction time. [VERIFIED: read this repo] |
| `vcs.commit({ files, message })` | `sdk/src/vcs/types.ts` + backends | Single commit primitive used by both git and jj backends. On jj this is `jj squash -B @ -k -m`; on git it's `git add <files> && git commit -m`. [VERIFIED: read REQUIREMENTS.md SQUASH-01..05] |
| `expr.rev` factory | `sdk/src/vcs/expr.ts` | RevisionExpr factory the adapter uses to construct revsets. Phase 6's ancestor walk uses `expr.range(orphan, head)` for the bounded search. [VERIFIED: read this repo via 02.1-CONTEXT.md] |

### Supporting
| Module | Path | When to Use |
|--------|------|-------------|
| `vcs.log` | adapter method | Iterate ancestry chain for orphan resolution (`{ from: orphan, to: head }`) |
| `vcs.refs.resolveShort` | adapter method | Compute short-hex form of resolved IDs for prose readability (matches existing `commit.ts:175-186` pattern) |
| `node:fs/promises` `readFile`/`writeFile` | stdlib | All prose I/O; no library needed |
| `node:fs` `readdirSync` with `withFileTypes` | stdlib | Recursive glob over `.planning/` — single-purpose; avoid adding `fast-glob` dep just for this |
| `planningPaths(projectDir, workstream)` | `sdk/src/query/helpers.ts` | Existing helper returning `{ planning, config, ... }` paths; consume for `config.json` path resolution |
| `acquireStateLock` / `releaseStateLock` | `sdk/src/query/state-mutation.ts` | Already used by `configSet` for read-modify-write protection; Phase 6 migration MUST hold the same lock |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Regex-pluck rewriter | `unified` + `remark-parse` AST walker | AST walker is overkill — every SHA in `.planning/` is plain inline backtick prose or table cells. AST adds 5-8 npm deps for zero practical gain. **Use regex.** |
| `fast-glob` | `node:fs.readdirSync` recursive | `fast-glob` adds a dep for ~20 lines of recursion. **Use stdlib.** |
| Adding `vcs.adapter` to `VALID_CONFIG_KEYS` | Calling `atomicWriteConfig` directly in the migration handler | Direct call bypasses the schema validation that protects user typos in `gsd-sdk query config-set vcs.adapter jj` invocations. **Add to schema.** This is the strictly correct option. |
| Per-id `commitIdOf` calls | Batch via `jj log -r 'a|b|c|...'` with a multi-id template | Batching is faster but jj template rendering of multi-id sets is brittle (commits stream out in revset order, not input order). N×spawn overhead per file is acceptable for v1 — `.planning/` has ~80 SHA mentions total per `grep -rE` audit below. **Per-id calls.** |
| In-memory dirty-tracking | Always-write every file | Skipping writes for files with zero changes preserves mtimes for unmodified files and reduces `vcs.commit`'s `files` argument size. **Track dirty.** |

**Installation:** None — this phase adds zero npm dependencies. All work is in the existing `sdk/src/vcs/` and `get-shit-done/workflows/` trees.

## Package Legitimacy Audit

> Skipped — Phase 6 introduces no external packages. All implementation is in-tree TypeScript and workflow markdown. The slopcheck gate does not apply.

## Architecture Patterns

### System Architecture Diagram

```
                  user: /gsd-migrate-vcs [--target <jj|git>] [--native]
                                            │
                                            ▼
              get-shit-done/workflows/migrate-vcs.md  (slash command surface)
                                            │
                                  parses flags → calls
                                            ▼
                  gsd-sdk query migrate-vcs.run --target <jj|git> [--native]
                                            │
                                            ▼
                          sdk/src/query/migrate-vcs.ts (NEW handler)
                                            │
              ┌─────────────────────────────┼──────────────────────────────┐
              ▼                             ▼                              ▼
        determine current               ensure target VCS              acquireStateLock
        state from .planning/           is initialized                 (.planning/config.json)
        config.json + .git/.jj          (jj git init --colocate
        presence                        if target=jj and !.jj)
              │                             │                              │
              └────────────────┬────────────┘                              │
                               │                                          │
                               ▼                                          │
                  sdk/src/vcs/format-migration/run.ts (NEW)               │
                               │                                          │
              ┌────────────────┼────────────────┐                         │
              ▼                ▼                ▼                         │
        walk.ts: enumerate  rewrite.ts:    orphan.ts:                     │
        in-scope files       regex-pluck   ancestor walk                  │
        under .planning/     SHA shapes    via vcs.log                    │
              │                │                │                         │
              └────────────────┴────────────────┘                         │
                               │                                          │
                               ▼                                          │
                       in-memory result map:                              │
                       { path → { content, dirty,                         │
                                  orphans[] } }                           │
                               │                                          │
                               ▼                                          │
              report.ts: emit .planning/intel/06-migration-report.md     │
                               │                                          │
                               ▼                                          │
                       write dirty files + write config.json             │
                       (atomicWriteConfig) ←───────────────────────────────┘
                               │
                               ▼
                       vcs.commit({ files: [...dirty, config.json],
                                    message: 'chore(vcs): migrate to <target>' })
                               │
                               ▼
                       releaseStateLock + structured return
```

### Recommended Project Structure
```
sdk/src/vcs/format-migration/        ← NEW directory
├── index.ts          # Re-exports run(), runMigration(), types
├── run.ts            # Top-level orchestrator: runMigration(cwd, target, opts)
├── walk.ts           # Enumerate in-scope .planning/ files; glob set
├── rewrite.ts        # Pure (content, direction, resolveId) → { content, report }
├── orphan.ts         # Ancestor walk + direct-children discovery
├── resolve.ts        # ID resolver — wraps commitIdOf/changeIdOf with cache + sentinel
├── report.ts         # Emit .planning/intel/06-migration-report.md
└── __tests__/
    ├── rewrite.test.ts          # Pure-function tests
    ├── orphan.test.ts           # Ancestry walk on fixture
    ├── round-trip.test.ts       # git→jj→git on synth-planning-fixture
    └── idempotency.test.ts      # Already-migrated file = no-op

sdk/src/query/migrate-vcs.ts        ← NEW handler
get-shit-done/workflows/migrate-vcs.md  ← NEW slash command markdown
```

### Pattern 1: Regex-Pluck-and-Resolve Rewriter (D-05 algorithm choice)

**What:** Iterate files in glob; per file, run two regexes (one for git SHAs, one for jj change_ids); for each match, resolve to target VCS; replace inline.

**When to use:** All `.planning/` prose. Empirically verified: zero structured SHA fields under `.planning/`.

**Example:**
```typescript
// Source: derived from sdk/src/vcs/parse/jj-id.ts contract
const GIT_SHA_RE = /(?<![0-9a-f])([0-9a-f]{7,40})(?![0-9a-f])/g;
const JJ_CID_RE = /(?<![k-z])([k-z]{8,12})(?![k-z])/g;

export function migrateContent(
  content: string,
  direction: 'git→jj' | 'jj→git',
  resolve: (id: string) => ResolveResult,
): { content: string; orphans: Orphan[] } {
  const re = direction === 'git→jj' ? GIT_SHA_RE : JJ_CID_RE;
  const orphans: Orphan[] = [];
  const out = content.replace(re, (match, id, offset) => {
    const r = resolve(id);
    if (r.kind === 'resolved') return r.targetId;
    if (r.kind === 'ancestor') {
      orphans.push({ original: id, resolved: r.targetId, offset, kind: 'ancestor' });
      return `${r.targetId}\`[was ${direction === 'git→jj' ? 'sha' : 'cid'}:${id}]\``;
    }
    // r.kind === 'unresolvable'
    orphans.push({ original: id, resolved: null, offset, kind: 'unresolvable' });
    return `\`[orphan:${id}]\``;
  });
  return { content: out, orphans };
}
```

**Critical:** Lookbehind `(?<![0-9a-f])` and lookahead `(?![0-9a-f])` are essential — without them, the regex eats partial matches inside larger hex strings (e.g., `bae15ddeee32297cd54deab40eec317d8f961f86` would match its first 7 chars as a separate ID, leaving the tail behind). [VERIFIED: trivial regex semantics, confirmed by reading the 40-char SHA in `04-06-SUMMARY.md:138`]

### Pattern 2: Orphan Ancestor Walk

**What:** When an identifier doesn't resolve in the target VCS, walk parents in the source VCS until one resolves, then record direct-children in the target VCS.

**When to use:** `commitIdOf`/`changeIdOf` throws `VcsExecError` with non-zero exit on unknown ID.

**Example:**
```typescript
// Source: jj revsets help -k revsets (verified jj 0.41 locally)
// Operators: x-  = parents of x;  x+  = children of x
//            x::  = descendants of x including x;  ::x  = ancestors of x including x

async function resolveAncestor(
  vcs: VcsAdapter,
  orphan: string,
  direction: 'git→jj' | 'jj→git',
): Promise<{ ancestor: string; childrenInTarget: string[] } | null> {
  // Walk source-VCS first-parent chain (D-04 ancestor strategy)
  let cursor = orphan;
  let depth = 0;
  const MAX_DEPTH = 1000;  // safety bound; phase planner can tune
  while (depth++ < MAX_DEPTH) {
    const parents = await vcs.log({ rev: expr.parents(expr.rev(cursor)), limit: 1 });
    if (parents.length === 0) return null;  // hit root
    cursor = parents[0].hash;
    try {
      const targetId = direction === 'git→jj'
        ? changeIdOf(cwd, cursor)        // git ancestor's change_id
        : commitIdOf(cwd, cursor);       // jj ancestor's commit_id
      // Direct children in target VCS:
      const children = await vcs.log({ rev: expr.children(expr.rev(targetId)), limit: 100 });
      return { ancestor: targetId, childrenInTarget: children.map(c => c.hash) };
    } catch (e) {
      if (e instanceof VcsExecError && e.exitCode !== 0) continue;  // not in target, keep walking
      throw e;
    }
  }
  return null;
}
```

**Caveat:** `expr.children` does not yet exist on the adapter surface — the `x+` jj revset operator is verified, but a TypeScript factory needs adding under `sdk/src/vcs/expr.ts`. Planner task.

### Pattern 3: Atomic Multi-File Commit

**What:** Compute all changes in memory, write all files, then issue a single `vcs.commit({ files: [...], message })`.

**When to use:** Always for migration. Never issue partial commits.

**Example:**
```typescript
async function runMigration(cwd: string, target: 'git' | 'jj'): Promise<MigrationResult> {
  const paths = planningPaths(cwd);
  const lockPath = await acquireStateLock(paths.config);
  try {
    // Phase 1: read + rewrite (all in memory)
    const files = await enumerateInScope(paths.planning);
    const results = new Map<string, { content: string; orphans: Orphan[] }>();
    for (const f of files) {
      const original = await readFile(f, 'utf8');
      const out = migrateContent(original, direction, resolveFn);
      if (out.content !== original) results.set(f, out);
    }
    // Phase 2: write all dirty files
    for (const [f, { content }] of results) await writeFile(f, content, 'utf8');
    // Phase 3: flip config
    const config = JSON.parse(await readFile(paths.config, 'utf8'));
    config.vcs ??= {};
    config.vcs.adapter = target;
    await atomicWriteConfig(paths.config, config);
    // Phase 4: report
    await emitReport(paths, results);
    // Phase 5: single commit
    const vcs = createVcsAdapter(cwd);
    await vcs.commit({
      files: [...results.keys(), paths.config, reportPath],
      message: `chore(vcs): migrate ${oldTarget} → ${target}`,
    });
    return { migrated: true, filesChanged: results.size, orphans: [...results.values()].flatMap(r => r.orphans) };
  } finally {
    await releaseStateLock(lockPath);
  }
}
```

### Anti-Patterns to Avoid

- **Reading `.planning/config.json` through `createVcsAdapter()` and then writing it back through the same adapter:** Adapter is frozen at construction; the post-flip adapter is stale. After the flip, re-construct via `createVcsAdapter(cwd)` if any further VCS operation is needed. (Phase 6 issues exactly one `vcs.commit` and exits, so this isn't load-bearing — but document it.)
- **Calling `configSet` for `vcs.adapter`:** Will fail with `Unknown config key` unless schema is updated first. The fix is to add `vcs.adapter` to `VALID_CONFIG_KEYS` (both `.ts` and `.cjs` files; CI parity-tested per #2653). Plan must do this as a prerequisite step.
- **Two-phase migration with intermediate commit:** "commit prose rewrites, then commit adapter flip" is tempting but breaks D-04's atomicity — a crash between commits leaves a project in an inconsistent state where the adapter says jj but `.planning/` still references git SHAs.
- **Resolving orphans via training data / guesses:** If `commitIdOf` fails, the only safe answer is the ancestor walk. Never fabricate a "likely" change_id. The `[orphan:abc123]` placeholder is the correct terminal state for unresolvable IDs.
- **Skipping the lock:** `configSet` acquires `acquireStateLock(paths.config)` to prevent concurrent config mutations. Migration is a much longer-running config mutation; it MUST hold the same lock for its entire duration.
- **Inferring jj change_id shape via "looks like a hash":** jj change_ids use the lower 26-letter consonant-rich alphabet (`k`-`z` after the encoding step); git SHAs use hex. **They're disjoint character sets.** Use that disjointness for the regex shape — a string of pure hex 7+ chars is a git SHA, a string of pure `k-z` 8+ chars is a jj change_id. Mixed strings are neither. [VERIFIED: jj documentation, "Change ID" glossary entry]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| jj revset operators (children, ancestors, parents) | Custom DAG walker | `jj log -r 'x+'` / `'x-'` / `'::x'` / `'x::'` | All operators verified in jj 0.41 — let jj do the graph traversal |
| change_id ↔ commit_id resolution | Custom NDJSON parser around `jj log` | Existing `commitIdOf` / `changeIdOf` at `parse/jj-id.ts:33-67` | Already shipped, already tested, throws typed error |
| Atomic config write | Direct `writeFile` to `config.json` | `atomicWriteConfig` at `config-mutation.ts:36-47` | Already handles Windows-rename fallback; consistent with rest of the codebase |
| `.planning/config.json` path resolution | Hard-coded `join(cwd, '.planning', 'config.json')` | `planningPaths(projectDir, workstream)` at `helpers.ts` | Workstream-aware path resolution — gets the per-workstream config correct |
| Lock acquisition around config mutation | Ad-hoc file lock | `acquireStateLock` / `releaseStateLock` at `state-mutation.ts` | Same pattern `configSet` uses; same semantics |
| Glob matching for `.planning/**/*.md` | Custom recursive `readdir` walker | `node:fs.readdirSync(dir, { recursive: true, withFileTypes: true })` (Node 20+) | One stdlib call, no dependency. Filter by `.md` extension. |
| Slash-command registration | Custom registration in `command-static-catalog-domain.ts` | Follow `gsd-quick`, `gsd-undo`, `gsd-ship` pattern: workflow `.md` file is enough; slash command auto-discovers via filename | The current static catalog at `sdk/src/query/command-static-catalog-domain.ts:20-80` does NOT register slash commands by name — slash command discovery is purely filesystem-driven by `get-shit-done/workflows/*.md` |

**Key insight:** This phase touches existing well-tested primitives in non-trivial composition. Almost everything that looks like a "build it" is actually a "compose it" — the rewriter library is essentially a 5-file thin orchestration layer over `parse/jj-id.ts`, `expr.ts`, `vcs.log`, `vcs.commit`, and `atomicWriteConfig`.

## Runtime State Inventory

> Phase 6 is a migration phase. The whole phase IS the runtime state mutation. This section inventories what changes runtime state during the migration itself.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `.planning/STATE.md` line 188-190 contain 4 git SHAs in backtick form (`66dbc36a`, `f9dd5edd`, `c0df4ded`); `.planning/phases/**/*-SUMMARY.md` carry ~30+ commit SHAs per phase in "Commits Made" sections (verified via `grep -rE` on `04-06-SUMMARY.md`). One full 40-char SHA at `04-06-SUMMARY.md:138-139` inside an NDJSON code block. | Rewriter MUST handle: short-hex (7-12 char) AND full-hex (40 char) AND in-code-block contexts. Code blocks are not special-cased — the regex matches inside them too, and that's correct behavior because the example output still references real commits. |
| Live service config | `.planning/config.json` `vcs.adapter` field. **Not currently set** in this repo's config.json (sticky resolver falls through to detection, which prefers git per D-17). | After migration: `vcs.adapter: "jj"` (or `"git"` on reverse). |
| OS-registered state | None — Phase 6 introduces no Windows Task Scheduler / launchd / systemd registrations. | None. |
| Secrets/env vars | None. `GSD_VCS` env var override (`sdk/src/vcs/index.ts:33`) is not touched — it's an ephemeral test-only override. | None. |
| Build artifacts | `sdk/dist/` and `sdk/dist-cjs/` contain compiled-in references to `.planning/config.json` paths but no SHAs. Pre-existing build outputs. | None. |

**Critical observation:** The migration is itself a runtime state mutation. The "what state does this leave behind" question is answered by the migration's own report file at `.planning/intel/06-migration-report.md`. That report becomes part of the runtime state inventory for any future phase that touches the same surfaces.

## Common Pitfalls

### Pitfall 1: jj 0.41 colocated mode + `git worktree add` interaction

**What goes wrong:** Phase 5's worktree-isolation pattern (`vcs-fixture.ts:47`) uses `jj git init --colocate` on a fresh `mkdtemp` directory. If Phase 6 dogfood validation tries to run the migration inside a `git worktree add`-created worktree (where `.git` is a file pointing to the parent's `.git/worktrees/<name>/`, not a directory), `jj git init --colocate` may refuse or corrupt the colocated state.

**Why it happens:** jj's colocation logic assumes `.git/` is a directory it can write to. A worktree's `.git` file is a 50-byte pointer, not a real directory.

**How to avoid:** Don't dogfood inside a worktree of THIS repo. Use a sibling clone (`git clone <local> ~/tmp/gsd-dogfood`) or the existing `synth-planning-fixture` pattern. Phase 6 planner must explicitly decide which strategy.

**Warning signs:** `jj git init --colocate` exits with `Error: ...` mentioning `.git/HEAD` not found or "not a directory."

**Verification path:** Probe before relying on it — run `jj git init --colocate` in a `git worktree add`-created directory in a test repo and capture the failure mode. Currently UNVERIFIED in this research (no probe run).

### Pitfall 2: `git rebase` between flips invalidates short-hex prefixes

**What goes wrong:** D-03 mandates round-trip safety for `git→jj→rebase→git`. But a `jj rebase` (or `git rebase`) rewrites commits — the post-rebase commit_id is different from the pre-rebase one. If the user runs the rebase between flips, the short-hex SHAs in `.planning/` after the second flip will NOT match the post-rebase commits — they'll match the pre-rebase commits, which are now unreachable.

**Why it happens:** jj's change_id is stable across rebase; git's commit_id is not. The whole point of jj's change_id model is that it survives rebase. But the rewriter resolves `change_id → commit_id` at flip time using the CURRENT state — so after `jj→rebase→git`, the change_id in the post-rebase tree resolves to a new commit_id, and the rewriter happily writes that new commit_id into prose. The "old" git SHA that was in the prose before the original git→jj flip is now lost.

**How to avoid:** This is actually the correct behavior — D-03 specifically says "rewriter uses CURRENT backend state, not a frozen pre-migration mapping." The point of `git→jj→rebase→git` is to PICK UP the rebase. The prose should reference post-rebase commits, not pre-rebase ones.

**Warning signs:** User confusion about "where did SHA `abc123` go?" — answer: it was the pre-rebase commit, which is unreachable; the prose now references the post-rebase equivalent.

**Documentation requirement:** The migration report MUST explain this in plain language for the round-trip case. Sample text: "This migration replaced commit SHAs with their post-rebase equivalents (via change_id stability). Pre-rebase SHAs are no longer reachable in git history."

### Pitfall 3: Empty `.git/` after `jj git init --no-colocate`

**What goes wrong:** D-02 allows `--jj=native` which runs `jj git init --no-colocate`. This creates `.jj/` but no `.git/`. If a downstream tool (e.g., a `git config` invocation in a script) assumes `.git/` exists, it fails.

**Why it happens:** jj-native mode is intentionally git-less. Anything that shells out to git directly is incompatible.

**How to avoid:** The Phase 1 lint guard (`scripts/lint-vcs-no-raw-git.cjs`) already enforces "no raw git in adapter consumers." If Phase 6 introduces any raw git invocation in the migration command, the lint will catch it. Make sure the migration command goes through the adapter for all VCS ops.

**Warning signs:** `lint-vcs-no-raw-git.cjs` reports new violations after Phase 6 plans land.

### Pitfall 4: Uncommitted `.planning/` changes when migration starts

**What goes wrong:** User edits `.planning/STATE.md` (uncommitted), then runs `/gsd-migrate-vcs --target jj`. The migration rewrites the file in-place; the user's edits are now part of the migration commit, mixed with rewriter output.

**Why it happens:** No explicit pre-flight check. `vcs.status` would surface this but the migration command doesn't currently consult it.

**How to avoid:** Migration command MUST run `vcs.status({ scope: 'working-copy' })` before doing anything, and refuse with a clear error if dirty. Allow `--force` to override (advanced users).

**Warning signs:** User reports unexpected content in the migration commit.

**Related:** Cross-VCS conflict detection (CONTEXT deferred-ideas section §"Cross-VCS conflict detection at migration time") is handled by this same check — `vcs.findConflicts({ scope: 'all' })` catches in-tree conflicts that jj's conflict-tolerant model preserves silently.

### Pitfall 5: Slopcheck-style identifier confusion (git SHA looks like a hex jj change_id… doesn't)

**What goes wrong:** A reader could conclude "jj change_ids are also hex" and get confused about which regex to apply.

**Why it doesn't actually go wrong:** jj change_ids are encoded in a different alphabet (lower 26-letter, ZK-style reversed-bit base-N). Empirically: `kxnzlnrntwou` (12-char), `pmnsosvnvpzw`, etc. — vowel-heavy and never use hex digits 0-9. Git SHAs are pure hex 0-9a-f. **They cannot collide.**

**How to avoid:** Use the two distinct regexes (`[0-9a-f]+` vs `[k-z]+`). Document the alphabet asymmetry in `rewrite.ts` JSDoc.

**Warning signs:** If a planner tries to write a single "identifier regex," that's the symptom. Two regexes, two passes, two resolvers.

### Pitfall 6: `vcs.adapter` cache invalidation post-flip

**What goes wrong:** `createVcsAdapter(cwd)` reads `.planning/config.json` once at construction. The migration handler constructs an adapter at start (to know current state), then later writes the new `vcs.adapter` value, then tries to call `vcs.commit(...)` on the same adapter instance. The commit goes to the OLD backend (because the adapter is cached).

**Why it happens:** Adapter is frozen at construction per `createVcsAdapter`'s contract.

**How to avoid:** Construct the adapter AFTER writing the new config — or pass an explicit `kind: target` option to `createVcsAdapter`. The explicit-kind path is cleaner:
```typescript
const vcs = createVcsAdapter(cwd, { kind: target });  // bypass config-read, force target backend
await vcs.commit({ files, message });
```

**Warning signs:** Migration commit ends up on the source-VCS backend (e.g., committing to git when target was jj).

### Pitfall 7: `vcs.adapter` schema parity drift

**What goes wrong:** Adding `vcs.adapter` to only one of `config-schema.ts` or `config-schema.cjs` triggers the CI parity guard (#2653 `tests/config-schema-sdk-parity.test.cjs`).

**Why it happens:** Two files, two sources of truth — that's why the parity test exists.

**How to avoid:** Always edit both in the same commit. Plan should explicitly list both files.

**Warning signs:** CI parity test fails on Phase 6 plans that add the key.

## Code Examples

### Resolve a jj change_id to git commit_id (existing API)
```typescript
// Source: sdk/src/vcs/parse/jj-id.ts:33-49 [VERIFIED: read this repo]
import { commitIdOf } from '../vcs/parse/jj-id.js';

try {
  const commitId = commitIdOf(cwd, 'kxnzlnrntwou');
  // commitId === '7a3b2c1d...' (full hex)
} catch (e) {
  if (e instanceof VcsExecError && e.exitCode !== 0) {
    // ID does not resolve — orphan path
  }
}
```

### Write `.planning/config.json` atomically (existing API; not exported)
```typescript
// Source: sdk/src/query/config-mutation.ts:36-47 [VERIFIED: read this repo]
async function atomicWriteConfig(configPath: string, config: Record<string, unknown>) {
  const tmpPath = configPath + '.tmp.' + process.pid;
  const content = JSON.stringify(config, null, 2) + '\n';
  try {
    await writeFile(tmpPath, content, 'utf-8');
    await rename(tmpPath, configPath);
  } catch {
    try { await unlink(tmpPath); } catch { /* already gone */ }
    await writeFile(configPath, content, 'utf-8');  // direct-write fallback
  }
}
// Phase 6 must EXPORT this from config-mutation.ts, or duplicate it.
// Recommendation: export it. It's a generic utility.
```

### Construct an adapter with explicit kind (existing API)
```typescript
// Source: sdk/src/vcs/index.ts:20-31 [VERIFIED: read this repo]
import { createVcsAdapter } from './vcs/index.js';

// Bypass sticky resolution — force the target backend.
// Required after flipping config.json so the commit goes to the new backend.
const vcs = createVcsAdapter(cwd, { kind: 'jj' });
```

### jj children operator (jj revset syntax)
```bash
# Source: jj help -k revsets [VERIFIED: jj 0.41 installed locally]
jj log -r 'kxnzlnrntwou+' -T 'change_id ++ "\n"' --no-graph
# Returns: change_ids of all direct children, newline-separated
```

### Atomic multi-file commit (existing adapter API)
```typescript
// Source: sdk/src/query/commit.ts pattern; SQUASH-01..05 [VERIFIED: REQUIREMENTS.md]
await vcs.commit({
  files: [
    '.planning/STATE.md',
    '.planning/phases/04/04-06-SUMMARY.md',
    // ...all rewritten files
    '.planning/config.json',
    '.planning/intel/06-migration-report.md',
  ],
  message: 'chore(vcs): migrate git → jj (Phase 6 / BROWN-01)',
});
// On git: `git add <files> && git commit -m '<message>'`
// On jj:  `jj squash <files> -B @ -k -m '<message>'`
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Upstream `/gsd-new-project` silently runs `git init` for empty dirs | Phase 6: refuse + require `--git`/`--jj` flag | This phase | Replaces `new-project.md:108-112` |
| ROADMAP SC #4 framed migration as "one-way, no auto-rollback" | CONTEXT D-03: bidirectional, current-state-aware defaults | CONTEXT 2026-05-14 | ROADMAP must be edited in lockstep with first plan |
| Phase 3 D-17 said only the migration command flips `vcs.adapter` | (unchanged) | Phase 3 | Brownfield invariant: no other GSD command mutates it |
| Phase 1 D-04 said `.jj/` wins ties in colocated case | Phase 3 D-17 reversed: `.git/` wins ties | Phase 3 | `vcs.adapter` is the explicit opt-in for jj on colocated repos |

**Deprecated/outdated:** None — this is greenfield phase work building on a stable Phase 3/4/5 foundation.

## CLI Surface

### `/gsd-migrate-vcs` — top-level slash command

```
/gsd-migrate-vcs [--target <jj|git>] [--native] [--force]

  --target <jj|git>   Destination VCS adapter. Default depends on current state:
                      - current = git (or absent) → --target jj (defaults to colocated)
                      - current = jj              → --target git (must be explicit)
  --native            Only valid with --target jj. Init via `jj git init --no-colocate`
                      instead of `--colocate`. Loses A3 colocated pre-commit hook firing
                      per Phase 4 LEARNINGS Open Q1.
  --force             Proceed even if working tree is dirty or conflicts exist.
                      Default behavior is to refuse and surface a clear error.
```

### Workflow markdown shape (`get-shit-done/workflows/migrate-vcs.md`)

Mirrors the shape of small commands like `/gsd-quick` and `/gsd-undo`:

```markdown
<purpose>
Migrate a brownfield GSD project from one VCS backend to another. Atomically
rewrites SHA↔change_id references in .planning/ files and flips the sticky
vcs.adapter config. Bidirectional and round-trip safe.
</purpose>

<process>

## 1. Setup
INIT=$(gsd-sdk query init.migrate-vcs)   # NEW handler — returns has_git, has_jj,
                                          # current_adapter, dirty_status

## 2. Parse flags
Extract --target, --native, --force from $ARGUMENTS.
If --target absent: derive from current_adapter (git/absent → jj; jj → ERROR).

## 3. Pre-flight checks
- Verify jj --version succeeds if target == jj
- Verify .jj/ exists if target == jj and current_adapter == jj
  (otherwise plan to `jj git init --colocate` as part of migration)
- Check dirty_status — refuse if dirty and not --force

## 4. Run migration
gsd-sdk query migrate-vcs.run --target <T> [--native]
# Drives the rewriter, writes config.json, emits report, single atomic commit.

## 5. Summary
Print summary: files changed, orphans resolved (with link to report file),
new adapter, commit SHA/change_id of the migration commit.
</process>
```

### Determining the target VCS

| Current `vcs.adapter` | Empty `--target` | Behavior |
|----------------------|------------------|----------|
| absent or `git` | (none) | Default: `--target jj` (colocated). Banner: "Migrating git → jj (colocated mode)." |
| `git` | `--target git` | Refuse: "Already on git. Pass `--target jj` to migrate." |
| `jj` | (none) | Refuse: "Already on jj. Pass `--target git` to migrate back." |
| `jj` | `--target jj` | Refuse: as above. |
| anything | `--target <unknown>` | Refuse: "Unknown target. Valid: jj, git." |

## Greenfield Gate Wiring

Phase 6 must add a `has_jj` boolean to the init handler that `new-project.md` consumes. The handler is `sdk/src/query/init.ts:1172-1182` (`initIngestDocs` shape — reused by `initNewProject`-equivalent).

Existing pattern at line 1175-1180:
```typescript
const result: Record<string, unknown> = {
  project_exists: pathExists(projectDir, '.planning/PROJECT.md'),
  planning_exists: pathExists(projectDir, '.planning'),
  has_git: pathExists(projectDir, '.git'),  // ← LINE 1177
  project_path: '.planning/PROJECT.md',
  commit_docs: config.commit_docs,
};
```

Phase 6 addition (one line):
```typescript
has_jj: pathExists(projectDir, '.jj'),   // NEW
```

Then `new-project.md` lines 108-112 changes from:
```markdown
**If `has_git` is false:** Initialize git:
```bash
git init
```
```

…to (per ROADMAP SC #1 + SC #7 + D-02):
```markdown
**Greenfield VCS gate (ROADMAP SC #1 / #7):**

| has_jj | has_git | --jj flag | --git flag | Action |
|--------|---------|-----------|------------|--------|
| true   | (any)   | (any)     | (any)      | Set vcs.adapter=jj in config.json; if --jj=native skip git colocation note; continue |
| false  | true    | (any)     | (any)      | Use existing git (default vcs.adapter behavior) |
| false  | false   | absent    | absent     | ERROR: "Empty directory — pass --git or --jj (default jj=colocated)" |
| false  | false   | --jj      | absent     | Run `jj git init --colocate` (or --no-colocate if --jj=native); set vcs.adapter=jj; continue |
| false  | false   | absent    | --git      | Run `git init`; continue (no vcs.adapter set, falls through to default) |
```

The SC #1 jj-binary smoke check (`jj --version`) gates the has_jj=true branch — if jj binary fails, surface clear error instead of falling back silently to git.

## vcs.adapter Write Semantics

### Read path (existing)
`sdk/src/vcs/index.ts:63-75` reads `vcs.adapter` from `.planning/config.json`. Three legal values: `'git'`, `'jj'`, `'auto'`. Missing/malformed → `undefined` → falls through to detection. [VERIFIED: read this repo]

### Write path (NEW for Phase 6)
Two options:

**Option A (RECOMMENDED): Add `vcs.adapter` to `VALID_CONFIG_KEYS` + use existing `configSet`.**

Edits required:
1. `sdk/src/query/config-schema.ts:18-79` — add `'vcs.adapter'` to the `Set<string>` literal
2. `get-shit-done/bin/lib/config-schema.cjs:16-77` — add the same entry (CI parity gate)
3. Migration handler calls `configSet(['vcs.adapter', target], cwd, workstream)`

Tradeoff: `configSet` handles lock acquisition, atomic write, and previous-value tracking for free.

**Option B: Export `atomicWriteConfig` from `config-mutation.ts` + call directly.**

Edits required:
1. `sdk/src/query/config-mutation.ts:36` — add `export` to the function signature
2. Migration handler calls `atomicWriteConfig(paths.config, mergedConfig)` after merging in the new `vcs.adapter` value
3. Migration handler manually acquires `acquireStateLock` and releases it

Tradeoff: Doesn't enrich the schema allowlist. `vcs.adapter` remains "private" to migration.

**Recommendation: Option A.** Schema enrichment is the right architectural answer — `vcs.adapter` is a real, user-visible config key. If a power user wants to flip it manually via `gsd-sdk query config-set vcs.adapter jj`, the schema should permit it. (They'd still need to manually run the rewriter or accept the inconsistent state, but the schema layer isn't the place to forbid that.)

### Cache invalidation post-flip

Per Pitfall 6: after writing the new `vcs.adapter` value, the existing `vcs` adapter instance is stale. The migration commit MUST use a fresh adapter constructed with `{ kind: target }` to force the target backend:
```typescript
const newVcs = createVcsAdapter(cwd, { kind: target });
await newVcs.commit({ files: [...], message: '...' });
```

## `.planning/` Surface Inventory (D-19 Tracker Realized)

Empirical scan of this repo's `.planning/` tree on 2026-05-14:

| Surface | Path glob | Format | SHA encoding | Migration approach |
|---------|-----------|--------|--------------|---------------------|
| Project state prose | `.planning/STATE.md` | Markdown | Inline backticks `` `66dbc36a` `` in performance/velocity/accumulated-context sections (4 SHAs at lines 188-190) | Regex-pluck |
| Phase summaries | `.planning/phases/*/*-SUMMARY.md` | Markdown | Inline backticks + bullet list "Commits Made" sections (~10-30 SHAs/file). Also raw 40-char SHAs inside NDJSON code blocks (e.g., `04-06-SUMMARY.md:138-139`) | Regex-pluck; code blocks are NOT special-cased (SHAs in examples are still real references) |
| Phase learnings | `.planning/phases/*/*-LEARNINGS.md` | Markdown | Inline backticks; prose mentions | Regex-pluck |
| Phase review | `.planning/phases/*/*-REVIEW.md`, `*-REVIEW-FIX.md` | Markdown | Inline backticks | Regex-pluck |
| Phase verification | `.planning/phases/*/*-VERIFICATION.md` | Markdown | Inline backticks | Regex-pluck |
| Phase patterns | `.planning/phases/*/*-PATTERNS.md` | Markdown | Inline backticks | Regex-pluck |
| Phase CONTEXT/DISCUSSION/RESEARCH/PLAN | `.planning/phases/*/*-CONTEXT.md` etc. | Markdown | Mostly absent. Occasional historical references in DISCUSSION-LOG (e.g., commit Phase 2 D-31 mentions); these resolve cleanly | Regex-pluck (light) |
| Intel surface | `.planning/intel/*.md` | Markdown | Mostly absent; one mention of `ae56863a` in `git-touchpoints.md` (pnpm-migration commit reference) | Regex-pluck |
| Research surface | `.planning/research/*.md` | Markdown | Mostly absent; historical context references | Regex-pluck |
| Debug surface | `.planning/debug/**/*.md` | Markdown | Some mentions in resolved debug sessions | Regex-pluck |
| State frontmatter | `.planning/STATE.md` YAML frontmatter (top) | YAML | NO SHAs; just timestamps/status. **Skip — out of scope.** | (none) |
| Config | `.planning/config.json` | JSON | NO SHAs. Phase 6 writes `vcs.adapter` field but no IDs. | (handled separately as adapter flip) |
| ROADMAP | `.planning/ROADMAP.md` | Markdown | NO SHAs (verified during Phase 3 scout per D-20). | (none) |
| PROJECT | `.planning/PROJECT.md` | Markdown | NO SHAs (verified). | (none) |
| REQUIREMENTS | `.planning/REQUIREMENTS.md` | Markdown | NO SHAs (verified). | (none) |

### gsd-sdk phase manifests (D-19 question)

**Inventory:** The SDK does not persist a separate "phase manifest" file under `.planning/`. Phase state is encoded across:
- `.planning/STATE.md` (frontmatter `progress`, `stopped_at`, `last_activity`)
- `.planning/phases/<phase>/<phase>-PLAN.md` (and per-plan files)
- `.planning/phases/<phase>/<phase>-SUMMARY.md` (per-plan)
- `.planning/todos/<workstream>.md` (if workstreams used)

None of these are JSON manifests; all are markdown with frontmatter. The "manifest" mentioned in D-19 is conceptual — there's no separate machine-readable manifest file. **Conclusion: D-19's "gsd-sdk phase manifests" surface is covered by the markdown files already enumerated.**

### gsd-sdk `query commit` JSON output (D-19 question)

**Inventory:** `sdk/src/query/commit.ts:186` returns `{ data: { committed: true, hash, message: sanitized, files: stagedFiles } }`. This is the JSON envelope returned to the CALLER (the workflow markdown or external invoker). It is NOT persisted to disk under `.planning/`. The `hash` field is consumed by workflow scripts that may write it into prose files (which is then a `*-SUMMARY.md` write — already covered).

**Conclusion: D-19's "gsd-sdk query commit output" is not a persistent surface; the SHAs it returns get embedded into prose by downstream workflow steps, which the rewriter handles.**

### Glob expansion

```typescript
// File set for the migration walker:
const IN_SCOPE = [
  '.planning/STATE.md',
  '.planning/phases/**/*.md',         // SUMMARY, LEARNINGS, REVIEW, VERIFICATION, PATTERNS, CONTEXT, DISCUSSION, RESEARCH, PLAN
  '.planning/intel/**/*.md',
  '.planning/research/**/*.md',
  '.planning/debug/**/*.md',
  '.planning/todos/**/*.md',          // workstreams sometimes mention commits
];
const OUT_OF_SCOPE = [
  '.planning/config.json',            // handled separately
  '.planning/ROADMAP.md',             // verified SHA-free
  '.planning/PROJECT.md',             // verified SHA-free
  '.planning/REQUIREMENTS.md',        // verified SHA-free
];
```

**SHA count estimate:** ~150-300 total backtick-wrapped short-hex SHAs across all `*-SUMMARY.md` + `STATE.md` + a handful in CONTEXT/intel. Order of magnitude: 100s, not 1000s or 10s. Per-id `commitIdOf` calls are the right granularity — total resolution time is on the order of seconds (~10-50ms per `jj log` spawn × 200 = 2-10s).

## Migration Command Workflow Markdown Shape

See §"CLI Surface" above for the full workflow body.

The new file lives at `get-shit-done/workflows/migrate-vcs.md`. Slash command auto-discovery (per existing pattern — no edit to `command-static-catalog-domain.ts` required) picks it up.

### `init.migrate-vcs` handler shape

NEW handler in `sdk/src/query/init.ts` (mirroring `initIngestDocs` at lines 1172-1182):

```typescript
export const initMigrateVcs: QueryHandler = async (_args, projectDir) => {
  const config = await loadConfig(projectDir);
  const cwd = projectDir;
  // Probe current adapter
  let currentAdapter: 'git' | 'jj' | 'auto' | 'absent' = 'absent';
  try {
    const raw = await readFile(join(cwd, '.planning', 'config.json'), 'utf8');
    const json = JSON.parse(raw);
    currentAdapter = json?.vcs?.adapter ?? 'absent';
  } catch { /* leave as 'absent' */ }
  // Probe binary availability
  let jjAvailable = false;
  try {
    execSync('jj --version', { stdio: 'pipe' });
    jjAvailable = true;
  } catch { /* leave false */ }
  // Probe working-tree cleanliness
  const vcs = createVcsAdapter(cwd);
  const status = await vcs.status({ scope: 'working-copy' });
  const dirty = status.entries.length > 0;
  // Probe in-tree conflicts
  const conflicts = await vcs.findConflicts({ scope: 'all' });
  return {
    data: {
      has_git: pathExists(cwd, '.git'),
      has_jj: pathExists(cwd, '.jj'),
      current_adapter: currentAdapter,
      jj_available: jjAvailable,
      dirty: dirty,
      conflicts: conflicts.length > 0,
      project_path: cwd,
      commit_docs: config.commit_docs,
    },
  };
};
```

## BROWN-01 Dogfood Safety Strategy

The user's session memory locks the rule "Use git (not jj) until migration lands — raw git commit is safe, jj write verbs corrupt the graph." This applies until Phase 6 BROWN-01 dogfood succeeds.

### Three viable safety strategies

| Strategy | Description | Pros | Cons | Recommendation |
|----------|-------------|------|------|-----------------|
| Sibling clone | `git clone <local-path> ~/tmp/gsd-dogfood-$DATE` then run migration there | Isolated; failure can't corrupt main repo; rollback = delete the clone | Doesn't exercise the actual repo's history (synth-ish) | **First-pass safety net** |
| Read-only dry-run on main repo | Add `--dry-run` to migration command; report what WOULD change; commit nothing | Zero risk to main repo | Deferred per CONTEXT — `--dry-run` is explicitly out of scope for v1 | Out of scope |
| Branch + jj inside branch | `git checkout -b dogfood/jj-migration`; run `/gsd-migrate-vcs --target jj`; exercise; if succeed merge to main; if fail discard branch | Exercises real history | Branch checkout + jj-init interaction is risky on colocated repos (Pitfall 1) | **Second pass after sibling clone validates** |
| jj op-log undo | After running migration, if anything breaks, `jj op restore <pre-migration-op>` rolls back EVERYTHING (including the working copy and bookmarks) | jj-native; works only post-flip | Doesn't help if migration corrupts to a state where jj op-log itself is unreachable | Recovery, not safety |

### Recommended dogfood sequence (planner-actionable)

1. **Sibling clone validation:** `git clone . ~/tmp/gsd-dogfood-$(date +%Y%m%d)`. In the clone: run `/gsd-migrate-vcs --target jj`. Inspect `06-migration-report.md`. Exercise every brownfield command listed in REQUIREMENTS.md BROWN-01 (`/gsd-map-codebase`, `/gsd-import`, `/gsd-ingest-docs`, `/gsd-resume-work`, `/gsd-pause-work`, `/gsd-ship`, `/gsd-pr-branch`, `/gsd-undo`). If any command produces observably different output from a baseline run in the original git-side repo, that's a Phase 6 bug. Fix in main repo, re-clone, re-validate.

2. **Go/no-go gate:** Once the sibling clone passes every BROWN-01 command end-to-end, lift the memory rule explicitly via STATE.md edit. This is the canonical point at which `jj` is allowed in THIS repo.

3. **Real-repo flip:** Run `/gsd-migrate-vcs --target jj` on this repo. The flip is itself reversible by D-03 (`/gsd-migrate-vcs --target git`).

4. **BROWN-02 retro:** Wait for the first weekly upstream rebase, record outcome at `.planning/intel/rebase-log.md`.

### Memory-rule lift trigger

The planner must explicitly call out the exact STATE.md edit that lifts the "use git not jj" memory rule. Sample:
```markdown
- **Pre-Phase-6:** Use git (not jj) until migration lands.
+ **Post-BROWN-01:** Phase 6 migration validated on sibling clone. jj is now permitted in this repo.
```
Without this edit, future agents continue to refuse jj operations even after migration.

## BROWN-02 Retro File Shape

`.planning/intel/rebase-log.md` is a per-week-append journal:

```markdown
# Upstream Rebase Log

| Date | Conflicts | Notes |
|------|-----------|-------|
| 2026-05-21 | 0 | First weekly rebase post-Phase-6. No conflicts — mechanical-edits hypothesis holds. |
| 2026-05-28 | 3 | Conflicts in `core.cjs` (line ~1200, ~1500, ~1700) — all in adapter call sites added since last rebase. Mechanical resolution; no logic changes. |
| ... | ... | ... |
```

Single-row to start; format becomes a per-week journal if useful. Per CONTEXT D-31 / BROWN-02: this is a manual workflow markdown append, no SDK verb.

## Project Constraints (from CLAUDE.md + memory)

Extracted from `./CLAUDE.md` + user memory:

- **GitHub access:** Always set `GITHUB_TOKEN` from `.envrc` before any `gh` CLI call. Never use ambient `gh auth`. **Applicability to Phase 6:** Low (no GitHub API calls in migration); but if a planner adds a "verify upstream rebase succeeded" step that touches `gh`, this applies.
- **No raw git anywhere in jj-port (memory):** VCS adapter must cover read AND write. Phase 6's migration command MUST go through the adapter for every VCS op. Lint guard `scripts/lint-vcs-no-raw-git.cjs` catches violations.
- **No parallelization in THIS repo until migration (memory):** Phase 6 plans stay sequential. The jj adapter substrate is parallel-ready (Phase 4 lock primitives) but THIS phase doesn't unlock that.
- **Phase filenames follow SDK padded convention (memory):** `06-01-PLAN.md`, `06-02-PLAN.md`, etc. The directory is `06-brownfield-jj-migration-sticky-vcs-adapter-flip-planning-sha/` (already created).
- **`.planning/` commit-id → change-id migration (memory):** Phase 6 IS the migration phase. Track every `.planning/` file format that records SHAs (see §"`.planning/` Surface Inventory"). The inventory IS the work backlog.
- **Squash model for jj (memory):** `jj squash` (not `jj commit`); allow WC snapshots; hooks fire after squash. The migration command's `vcs.commit` on jj backend resolves to `jj squash -B @ -k -m` (existing SQUASH-01 behavior).
- **Use git (not jj) until migration lands (memory):** Applies during planning and execution of Phase 6 plans 1-N; lifts upon BROWN-01 dogfood success per §"BROWN-01 Dogfood Safety Strategy".
- **A3 colocated pre-commit gap (memory):** jj 0.41 doesn't auto-fire `.git/hooks/pre-commit` after `jj squash` in colocated mode (refuted assumption). The migration command on jj backend MUST explicitly fire pre-commit (`vcs.hooks.fire('pre-commit', ctx)` from `firePrePushHook` / `fireHook` pattern in `sdk/src/vcs/jj/`). Phase 4 HOOK-03 Open Q1 is the precedent — three fix paths documented; none chosen yet. **Planner decision needed:** does Phase 6 inherit one of the three fix paths, or work around the gap?

## Validation Architecture

> Phase 6 has nyquist_validation enabled (default — config.json absent for this key means enabled).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 1.x (sdk/) + node:test (tests/) — dual-runner per Phase 1 D-14 |
| Config file | `sdk/vitest.config.ts` (integration project) + `vitest.config.ts` (unit project) |
| Quick run command | `cd sdk && pnpm test --filter <pattern>` |
| Full suite command | `pnpm test` (root) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| Phase 6 — Greenfield `.jj/` detection | `initNewProject` returns `has_jj: true` when `.jj/` present | unit | `cd sdk && pnpm test init.test.ts -t has_jj` | ❌ Wave 0 |
| Phase 6 — Empty-dir refusal | `new-project.md` refuses to auto-init with no flag in empty dir | integration | `cd sdk && pnpm test cmd-new-project-empty.integration.test.ts` | ❌ Wave 0 |
| Phase 6 — `--jj` defaults to colocated | `jj git init --colocate` runs when `--jj` passed in empty dir | integration | `cd sdk && pnpm test cmd-new-project-jj-colocated.integration.test.ts` | ❌ Wave 0 |
| Phase 6 — `--jj=native` opt-out | `jj git init --no-colocate` runs when `--jj=native` passed | integration | `cd sdk && pnpm test cmd-new-project-jj-native.integration.test.ts` | ❌ Wave 0 |
| Phase 6 — Rewriter idempotency | Already-migrated file unchanged on re-run | unit | `cd sdk && pnpm test format-migration/rewrite.test.ts -t idempotent` | ❌ Wave 0 |
| Phase 6 — Round-trip safety | git→jj→git on synth fixture yields original (modulo ancestor-walk breadcrumbs) | integration | `cd sdk && pnpm test format-migration/round-trip.test.ts` | ❌ Wave 0 |
| Phase 6 — Orphan ancestor walk | Unresolvable ID → ancestor → direct-children captured in report | unit | `cd sdk && pnpm test format-migration/orphan.test.ts` | ❌ Wave 0 |
| Phase 6 — Atomic adapter flip | `config.json` `vcs.adapter` rewritten in same commit as prose | integration | `cd sdk && pnpm test migrate-vcs.run.integration.test.ts -t atomic` | ❌ Wave 0 |
| Phase 6 — Schema parity | `vcs.adapter` in both `.ts` and `.cjs` schemas | unit | `node --test tests/config-schema-sdk-parity.test.cjs` | ✅ (existing; will catch drift) |
| Phase 6 — Lint guard | No new raw-git invocations | manual-only-fast | `node scripts/lint-vcs-no-raw-git.cjs` | ✅ (existing) |
| BROWN-01 | Brownfield commands work on this repo's jj backend | manual-only | (human-verify gate) | N/A — manual |
| BROWN-02 | First weekly rebase recorded | manual-only | (human-verify gate) | N/A — manual |

### Sampling Rate
- **Per task commit:** `cd sdk && pnpm test --filter <plan-relevant-pattern>`
- **Per wave merge:** `cd sdk && pnpm test && cd .. && node --test tests/`
- **Phase gate:** Full suite green + `lint-vcs-no-raw-git.cjs` clean + `tests/config-schema-sdk-parity.test.cjs` green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `sdk/src/vcs/format-migration/__tests__/rewrite.test.ts` — pure-function regex + resolver mock
- [ ] `sdk/src/vcs/format-migration/__tests__/orphan.test.ts` — ancestor walk + children list
- [ ] `sdk/src/vcs/format-migration/__tests__/round-trip.test.ts` — git→jj→git on `synth-planning-fixture`
- [ ] `sdk/src/vcs/format-migration/__tests__/idempotency.test.ts` — idempotency invariants D-04.1, D-04.2, D-04.3
- [ ] `sdk/src/query/migrate-vcs.test.ts` — handler-level orchestration test
- [ ] `sdk/src/query/init.test.ts` — extend with `has_jj` field assertion (existing file; add cases)
- [ ] Greenfield integration tests (under `sdk/src/__tests__/integration/`) for each empty-dir/`--jj`/`--git` path

## Security Domain

> `security_enforcement` not explicitly set in config — treat as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | N/A — no auth surface |
| V3 Session Management | no | N/A |
| V4 Access Control | yes (file-system path traversal) | `resolvePathUnderProject` (existing helper at `sdk/src/query/helpers.ts`); migration must NOT follow symlinks or write outside `.planning/` |
| V5 Input Validation | yes | Validate `--target` value against `['git', 'jj']` literal set; reject anything else with clear error |
| V6 Cryptography | no | N/A |
| V12 File and Resource | yes | Atomic temp-file + rename for config.json (existing `atomicWriteConfig` pattern handles this) |
| V14 Configuration | yes | `vcs.adapter` value validation — only `'git' \| 'jj'` (NOT `'auto'` on the write path — `'auto'` is read-time-only per index.ts:70) |

### Known Threat Patterns for {migration command}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal in `--only <path>` (deferred per CONTEXT, but if reintroduced) | Tampering | `resolvePathUnderProject` boundary check |
| Argv injection in jj revset arguments | Tampering | Argv-array invocation only (no shell strings); JJ-02 invariant enforces this — `jjIdArgv` in `parse/jj-id.ts:21-31` already correct |
| Commit message injection (migration commit message contains user-provided `--target` value) | Tampering | `sanitizeCommitMessage` at `sdk/src/query/commit.ts:44-66` already handles this — pass migration message through it |
| TOCTOU on `.planning/config.json` between read and write | Tampering | `acquireStateLock` / `releaseStateLock` (existing pattern in `configSet`) holds exclusive lock for full migration duration |
| Concurrent migration runs corrupting each other | Tampering | Same lock as TOCTOU above — second invocation waits or times out |
| Symlinked file under `.planning/` writing outside repo | Tampering | Use `realpath` resolution before write OR refuse to follow symlinks (`fs.lstatSync` check) |

## Open Questions

1. **Should the rewriter handle commit MESSAGES (commit history prose) or only `.planning/` file prose?**
   - What we know: D-19 inventoried `.planning/` files only.
   - What's unclear: Commit messages stored in `.git/` (after `git→jj`) or `.jj/` (after `jj→git`) reference SHAs that won't be rewritten. E.g., commit `e85430e2` has message "feat(04-06): wire fireHook pre-commit into jj.ts commit() with D-10 colocated no-op" — that's stable, but the SUMMARY.md file lists `e85430e2` separately and IS rewritten.
   - Recommendation: **OUT OF SCOPE for v1.** Commit messages stay verbatim — they're git/jj-history-internal, not `.planning/` state. Document explicitly.

2. **What happens to `tests/baselines/git-vcs/` and `tests/baselines/jj-vcs/` test fixtures during migration?**
   - What we know: These contain pinned-output snapshots used by `baseline-parity.test.ts`. They're NOT under `.planning/`.
   - What's unclear: If a baseline output captures a commit SHA, does Phase 6 rewrite it?
   - Recommendation: **OUT OF SCOPE.** Baselines are test fixtures, not user state. They're regenerable via `capture-vcs-baselines.cjs`. Migration ignores them.

3. **How does the migration interact with workstream-aware `.planning/` (Phase 1 D-22 deferred)?**
   - What we know: `planningPaths(projectDir, workstream)` resolves per-workstream paths.
   - What's unclear: This repo doesn't use workstreams. The migration command should accept a `--workstream <name>` arg in principle, but no caller will use it.
   - Recommendation: Migration command supports `--workstream` argv pass-through (mirrors `configSet`'s signature) but defaults to the main workstream. No explicit user-visible behavior change for this repo.

4. **What's the migration command's stable-ID strategy for the migration commit itself?**
   - What we know: D-04 says single atomic commit. On git, that's `git commit` with auto-generated SHA. On jj, it's `jj squash` with auto-generated change_id.
   - What's unclear: The commit message could include a stable marker like `gsd-migrate-vcs/v1` to make idempotency detection trivial.
   - Recommendation: Embed `[gsd-migrate-vcs v1]` in the commit message. The rewriter checks for this marker in the most-recent commit message during idempotency probe (cheaper than scanning all files for source-VCS shapes).

5. **Phase 4 A3 colocated pre-commit hook gap — does Phase 6 fix it or work around?**
   - What we know: Memory states three fix paths documented in 04-LEARNINGS Open Q1; none chosen.
   - What's unclear: Phase 6's migration command commits on jj backend (post-flip). If the user has `.githooks/pre-commit` expectations, the migration commit may silently skip them in colocated mode.
   - Recommendation: **Use the SDK's `vcs.hooks.fire('pre-commit', ctx)` primitive (already wired in Phase 4 plan 04-06) BEFORE the `vcs.commit` call in the migration handler.** This is a workaround at the migration-command level only — does not solve the broader A3 gap. The broader gap stays open for a future v2 phase per Phase 4 LEARNINGS.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `jj` binary | Migration to/from jj; greenfield jj-detect | ✓ | 0.41.0 (verified via `jj help -k revsets` in shell probe) | None — `--target jj` fails clear-error if jj missing |
| `git` binary | All git-side operations | ✓ | (assumed; pre-existing project requirement) | None |
| Node.js | SDK runtime | ✓ | ≥22 per PROJECT.md | None |
| pnpm | Build system | ✓ | 11+ per PROJECT.md | None |
| TypeScript | SDK compilation | ✓ | ≥5 per PROJECT.md | None |
| vitest | Test framework | ✓ | (existing) | None |

**Missing dependencies with no fallback:** None — every dependency is already pinned by upstream PROJECT.md.

**Missing dependencies with fallback:** None.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | jj change_ids use lower 26-letter `k-z` alphabet (no hex digits), distinguishing them from git SHAs in regex | §"Pattern 1: Regex-Pluck" + §"Pitfall 5" | If wrong, the two regexes collide and the rewriter rewrites IDs in the wrong direction. **Mitigation:** Probe a real jj change_id on this repo before locking the regex — `jj log -r '@-' -T 'change_id'` and visually inspect the alphabet. [ASSUMED] |
| A2 | `git worktree add` + `jj git init --colocate` is incompatible (Pitfall 1) | §"Pitfall 1" | If wrong (and they ARE compatible), the dogfood strategy can simplify to "branch in worktree." **Mitigation:** Probe in a throwaway test before locking. [ASSUMED] |
| A3 | Total `.planning/` SHA count is in the low hundreds (per-id resolution is acceptable) | §"`.planning/` Surface Inventory" → glob expansion paragraph | If wrong (10k+ SHAs), per-id `jj log` spawn overhead becomes minutes-scale. **Mitigation:** Run the actual `grep -rE '\b[0-9a-f]{7,40}\b'` count during plan-01 task 1; if > 1000, switch to batch resolution via multi-id revset. [ASSUMED — see §"`.planning/` Surface Inventory" for empirical lower-bound estimate] |
| A4 | `vcs.commit({ files })` with an array including both `.planning/config.json` AND prose files works atomically on both backends | §"Pattern 3: Atomic Multi-File Commit" | If git-side commit fails partial (some files added, commit fails), the working tree is half-rewritten. **Mitigation:** Phase 1 GIT-01..02 baselines suggest this is already byte-symmetric. Verify on first integration test. [ASSUMED] |
| A5 | jj 0.41's `x+` children operator returns ONLY direct children (depth-1), not transitive descendants | §"Pattern 2: Orphan Ancestor Walk" | If wrong (returns transitive), the migration report shows confusing many-children entries. **Mitigation:** Probe `jj log -r '<id>+' --no-graph -T 'change_id ++ "\n"'` against a known parent in this repo with 2+ children. [ASSUMED via jj revsets help text "x+: Children of x"] |
| A6 | Slopcheck does not apply (no external packages installed) | §"Package Legitimacy Audit" | None — phase audited as zero-dep. [VERIFIED: read this RESEARCH.md] |
| A7 | The rewriter's regex never matches words inside path components (e.g., `abc123` inside a `path/to/abc123def/file.md`) | §"Pattern 1: Regex-Pluck" | If wrong, the rewriter rewrites path strings as IDs, breaking links. **Mitigation:** Bound the regex with backtick or whitespace boundaries: ``/`([0-9a-f]{7,40})`/g`` (require backtick wrapping). This narrows scope but may miss un-backticked SHAs in bullet lists. Planner picks the trade-off. [ASSUMED] |
| A8 | The migration command's lock acquisition (`acquireStateLock`) doesn't conflict with the workflow markdown's own state writes during the same session | §"Architecture Patterns" → atomic commit | If wrong, the migration deadlocks on its own lock. **Mitigation:** Read `state-mutation.ts` lock semantics carefully during plan-01 task 1; the lock is held for SECONDS not minutes, so reentrancy is moot. [ASSUMED — based on configSet using the same lock for ms-scale operations] |
| A9 | After `vcs.adapter` flip and migration commit, future `createVcsAdapter(cwd)` calls correctly resolve to the new backend on subsequent commands in the same Node process | §"vcs.adapter Write Semantics" → cache invalidation | If the SDK caches the adapter at module-load time (not per-construction), the migration succeeds but subsequent commands in the same session run on the old backend. **Mitigation:** Read `vcs/index.ts:20-46` carefully — `createVcsAdapter` is a factory, not a singleton, so each call reads config fresh. [VERIFIED: read this repo at index.ts:20-46] |
| A10 | Phase 6 plans 1-N all execute under the "use git not jj" memory rule, even though they're implementing the jj migration | §"BROWN-01 Dogfood Safety Strategy" → memory-rule lift trigger | If a plan executor uses `jj` to commit Phase 6 work BEFORE BROWN-01 dogfood succeeds, the planning files themselves may be corrupted. **Mitigation:** First plan in Phase 6 must include an explicit "DO NOT use jj write verbs in THIS repo until plan N's BROWN-01 gate" in its precondition section. [ASSUMED] |

## Sources

### Primary (HIGH confidence — verified by reading this repo)
- `sdk/src/vcs/parse/jj-id.ts:33-67` — `commitIdOf` / `changeIdOf` translator API + error contract
- `sdk/src/vcs/index.ts:20-75` — `createVcsAdapter` factory + sticky resolver
- `sdk/src/query/config-mutation.ts:36-47, 191-251` — `atomicWriteConfig` + `configSet` patterns
- `sdk/src/query/config-schema.ts:18-79` — `VALID_CONFIG_KEYS` allowlist (no `vcs.adapter` entry)
- `get-shit-done/bin/lib/config-schema.cjs:16-77` — CJS mirror (parity-tested)
- `sdk/src/query/init.ts:1167-1182` — `initIngestDocs` shape (template for `initMigrateVcs`)
- `get-shit-done/workflows/new-project.md:106-112` — silent `git init` site
- `sdk/src/vcs/__tests__/vcs-fixture.ts:39-67` — jj-colocated and jj-native test isolation patterns
- `sdk/src/vcs/__tests__/synth-planning-fixture.ts` — synthetic `.planning/` skeleton for brownfield tests
- `.planning/phases/03-jj-backend-core-squash-refs-conflict/03-CONTEXT.md` — D-19 tracker definition
- `.planning/STATE.md` + `.planning/phases/04-workspaces-octopus-structure-hooks/04-06-SUMMARY.md` — empirical SHA inventory

### Secondary (MEDIUM confidence — jj behavior verified via `jj` CLI on the installed binary)
- `jj help -k revsets` output — confirmed `x+` = children, `x-` = parents, `::x` = ancestors, `x::` = descendants
- `jj log -T 'children'` rejection — confirmed `children` is NOT a template keyword (children must be queried via revset, not template)
- `jj git init --colocate` vs `--no-colocate` — confirmed via existing `vcs-fixture.ts:47, 67` usage

### Tertiary (LOW confidence — needs validation in plan-01)
- Pitfall 1 (worktree + colocate incompatibility) — speculation; needs empirical probe
- Pitfall 5 (jj change_id alphabet) — based on jj documentation glossary; needs visual confirmation on real change_id
- A3 assumed SHA count — estimate, not measured

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every recommended module exists in this repo and was read
- Architecture: HIGH — diagram derived from existing factory/handler patterns
- Pitfalls: MEDIUM — most are derived from code-reading; a few (1, 5) need empirical probes
- Dogfood strategy: LOW — no prior dogfood phase in this project; recommendation is from first principles

**Research date:** 2026-05-14
**Valid until:** ~2026-06-14 (30 days; codebase shifts between phases, regenerate when Phase 6 plan-01 starts)
