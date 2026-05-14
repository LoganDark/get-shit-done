<purpose>
Bidirectional VCS migration command. Migrates a project's `.planning/`
revision-id encodings between git SHAs and jj change_ids in a single atomic
commit, flipping `vcs.adapter` in `.planning/config.json` to match. Round-trip
safe (git → jj → git is byte-equivalent for any text whose rewritten IDs
resolve cleanly in both directions). Idempotent: re-running against an
already-migrated repo no-ops via the `[gsd-migrate-vcs v1]` commit-message
marker probe.
</purpose>

<required_reading>
@~/.claude/get-shit-done/references/ui-brand.md
@~/.claude/get-shit-done/references/gate-prompts.md
</required_reading>

<process>

<step name="banner" priority="first">
Display the stage banner:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► MIGRATE VCS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
</step>

<step name="parse_arguments">
Parse `$ARGUMENTS`:

- `--target <jj|git>` → migration direction (required when `current_adapter`
  is `'jj'`; defaulted otherwise — see preflight step).
- `--native` → on `--target jj`, opt into `jj git init --no-colocate`
  (CONTEXT D-02). Default is colocated (`jj git init --colocate`) because
  colocated mode preserves the A3 `.git/hooks/pre-commit` fire path on
  squash (Phase 4 LEARNINGS Open Q1). Use `--native` only when you do not
  need git interop at all.
- `--force` → bypass dirty-tree / conflicts pre-flight refusal. Use only
  when the working copy contains intentional un-committed work that must
  be preserved through the migration.

If `$ARGUMENTS` includes unknown flags, dispatch fails at the SDK boundary
(the verb's argv parser returns `{ok:false, error:"migrate-vcs: unknown
flag '...'"}`).
</step>

<step name="preflight">
Probe current state via the init handler:

```bash
INIT=$(gsd-sdk query init.migrate-vcs)
HAS_GIT=$(echo "$INIT" | jq -r '.has_git')
HAS_JJ=$(echo "$INIT" | jq -r '.has_jj')
CURRENT_ADAPTER=$(echo "$INIT" | jq -r '.current_adapter')
JJ_AVAILABLE=$(echo "$INIT" | jq -r '.jj_available')
DIRTY=$(echo "$INIT" | jq -r '.dirty')
CONFLICTS=$(echo "$INIT" | jq -r '.conflicts')
```

**Derive target if not supplied:**

- `--target` provided → use it verbatim.
- `--target` absent AND `current_adapter` is `'git'` or `'absent'` or
  `'auto'` → default to `--target jj`.
- `--target` absent AND `current_adapter` is `'jj'` → ABORT with:
  ```
  Already on jj. Pass --target git to migrate back.
  ```

**Dirty-tree refusal (unless --force):**

If `DIRTY == "true"` and `--force` not provided:
```
Working copy has uncommitted changes. Commit, stash, or re-run with --force.
```
Exit. The migration commit must be the only thing landing on the migration
revision — uncommitted work would be silently captured.

**Conflict refusal (unless --force):**

If `CONFLICTS == "true"` and `--force` not provided:
```
Working copy has unresolved conflicts. Resolve them, or re-run with --force.
```
Exit. Conflicts mid-migration would corrupt the rewriter's
revision-resolution cache.

**jj binary gate (target=jj):**

If `--target jj` and `JJ_AVAILABLE == "false"`:
```
--target jj requires `jj` binary in PATH. Install jj first:
  https://github.com/jj-vcs/jj#installation
```
Exit. The verb's pre-flight will surface the same error, but catching it
here gives a friendlier banner for the user.
</step>

<step name="run_migration">
Single SDK call dispatches the whole pipeline:

```bash
RESULT=$(gsd-sdk query migrate-vcs \
  --target "${TARGET}" \
  ${NATIVE:+--native} \
  ${FORCE:+--force})
```

The verb handler imports `runMigration` from `sdk/src/vcs/format-migration/`
(plan 06-02 deliverable) which performs the 9-phase pipeline:

1. Acquire `.planning/.state.lock` (held for the entire migration).
2. Read `.planning/config.json` to determine `previousAdapter`.
3. Pre-flight: refuse dirty / conflicts (already gated above; the verb
   re-checks defensively).
4. Walk in-scope `.planning/` paths + STATE.md; collect every git-SHA
   match (target=jj) or jj-change_id match (target=git).
5. Async pre-pass: resolve every match against the OTHER backend's id
   space via `commitIdOf`/`changeIdOf`; unresolvable hits walk via
   `expr.parents(...)` to find ancestor counterparts (orphan walk).
6. Sync rewrite: stream each file through the regex-pluck rewriter,
   emitting `[was sha:...]` / `[was cid:...]` breadcrumbs at ancestor /
   unresolvable sites.
7. Atomic config flip: write `vcs.adapter` = `<target>` in
   `.planning/config.json` via `atomicWriteConfig`.
8. Emit `.planning/intel/06-migration-report.md` summarising the orphan
   resolution table.
9. Fire `pre-commit` hook explicitly (A3 colocated workaround per Phase 4
   LEARNINGS Open Q1) then commit ALL rewritten files + flipped config +
   report in a single atomic commit with the
   `[gsd-migrate-vcs v1]` marker in the subject.

If `RESULT.migrated == false`, the marker-probe fast-exit fired —
`runMigration` detected a prior `[gsd-migrate-vcs v1]` commit on
`HEAD`/`@-` matching the requested target. Idempotent re-runs are safe.
</step>

<step name="summary">
Display the completion banner + summary table:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► MIGRATE VCS COMPLETE ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Show summary:
```
  ✓ ${FILES_CHANGED} files rewritten (${FILES_SCANNED} scanned)
  ✓ ${ANCESTOR_RESOLVED} orphans resolved via ancestor walk
  ✓ ${UNRESOLVABLE} orphans unresolvable — see .planning/intel/06-migration-report.md
  ✓ Adapter flipped: ${PREVIOUS_ADAPTER} → ${NEW_ADAPTER}
  ✓ Migration commit: ${COMMIT_HASH}
```

If `RESULT.migrated == false`, instead show:
```
  ✓ Already migrated to ${NEW_ADAPTER} (commit marker detected — no-op)
```
</step>

</process>

<success_criteria>
- [ ] `$ARGUMENTS` parsed for `--target`, `--native`, `--force` (unknown flags fail at SDK boundary with typed error)
- [ ] `gsd-sdk query init.migrate-vcs` consulted for pre-flight (8-field shape: has_git, has_jj, current_adapter, jj_available, dirty, conflicts, project_path, commit_docs)
- [ ] Bare command with `current_adapter` in {`git`, `absent`, `auto`} defaults to `--target jj`; with `current_adapter == 'jj'` refuses with explicit-flag prompt
- [ ] Dirty-tree refusal trips unless `--force` is set
- [ ] Conflict refusal trips unless `--force` is set
- [ ] `--target jj` aborts with install instructions when `jj` binary is missing
- [ ] Migration dispatches via single `gsd-sdk query migrate-vcs` invocation; output JSON is FLAT (`ok`, `migrated`, `newAdapter`, `commitHash`, `orphans` at top level — no `.data` wrapper)
- [ ] Migration commit subject contains `[gsd-migrate-vcs v1]` marker; re-running yields `migrated: false` (idempotent fast-exit)
</success_criteria>

> **Backend semantic shift (colocated vs native).** The default `--target jj`
> path runs `jj git init --colocate` which keeps the colocated `.git`
> directory alongside `.jj`. This is the dogfood-on-this-repo default
> (CONTEXT D-02) because it preserves the A3 `.git/hooks/pre-commit` fire
> path through `jj squash` operations (Phase 4 LEARNINGS Open Q1). The
> `--native` flag opts into `jj git init --no-colocate`, which produces a
> pure-jj repo with NO `.git` directory — hooks must be wired via
> `hook-bridge.ts` (`fireHook(cwd, 'pre-commit')`) instead. Choose
> `--native` only when you do not need git interop at all.

> **Backend semantic shift (round-trip after rebase).** RESEARCH Pitfall 2:
> if you migrate `git → jj`, then rebase the jj-side history (`jj rebase`),
> then migrate back `jj → git`, the resulting `.planning/` text references
> the POST-rebase git commits, not the pre-rebase ones. This is correct
> behavior — the rewriter uses CURRENT backend state to resolve IDs — but
> it means a "round-trip" through a rebased history is NOT byte-identical
> to the pre-migration source. Document any planned mid-migration rebase
> in the migration report's footer so future archeology can reconstruct
> the chain.

> **Backend semantic shift (A3 hook gap on jj).** `runMigration` fires the
> `pre-commit` hook explicitly via `hook-bridge.ts` before landing the
> migration commit on the jj target. This closes the migration-commit-specific
> gap. The broader A3 gap (jj 0.41 does NOT auto-fire
> `.git/hooks/pre-commit` after every `jj squash` in colocated mode) is
> documented in Phase 4 LEARNINGS Open Q1 and tracked for v2; for now,
> only the migration commit itself is guaranteed to have run the hook.
