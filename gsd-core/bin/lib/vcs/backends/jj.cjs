"use strict";
/**
 * jj backend implementation of VcsAdapter (Phase 3).
 *
 * Phase 3 D-08 shape commit: every verb is present but throws
 * VcsNotImplementedError. Verb-group plans 03-02..03-06 fill the bodies in
 * the D-10 order: parsers (03-02) -> refs (03-03) -> commit/squash (03-04) ->
 * status/log/diff/findConflicts (03-05) -> push/fetch/workspace (03-06).
 *
 * Invariants enforced by this file (verified via grep in CI):
 *   - JJ-02: argv-array invocation only via `jjArgv()` helper.
 *   - JJ-03 / D-05: `--ignore-working-copy` is NEVER passed. The helper
 *     `jjArgv()` is the single source of mandatory flags; adding the flag
 *     anywhere outside it would be caught by Pitfall 5 in 03-RESEARCH.md.
 *   - SQUASH-05: `jj commit` is NEVER used; squash is the sole commit primitive.
 *
 * Each read method snapshots `@` at start (auto-snapshot — see PITFALLS.md
 * #2). Callers needing safe multi-step state inspection follow the
 * pre-probe discipline from Phase 2.1 D-06 (the `stagedOrUnstaged` pattern
 * in `bin/lib/commands.cjs`).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseJjDiffEntries = parseJjDiffEntries;
exports.createJjAdapter = createJjAdapter;
const node_path_1 = require("node:path");
const expr_cjs_1 = require("../expr.cjs");
const exec_cjs_1 = require("../exec.cjs");
const jj_rev_cjs_1 = require("../parse/jj-rev.cjs");
const jj_log_cjs_1 = require("../parse/jj-log.cjs");
const jj_workspace_list_cjs_1 = require("../parse/jj-workspace-list.cjs");
const jj_bookmark_cjs_1 = require("../parse/jj-bookmark.cjs");
const refs_validator_cjs_1 = require("../refs-validator.cjs");
const node_fs_1 = require("node:fs");
const lock_cjs_1 = require("../jj/lock.cjs");
const reap_cjs_1 = require("../jj/reap.cjs");
const parallel_cjs_1 = require("../jj/parallel.cjs");
const incomplete_work_cjs_1 = require("../jj/incomplete-work.cjs");
const conflict_paths_cjs_1 = require("../jj/conflict-paths.cjs");
const hook_bridge_cjs_1 = require("../hook-bridge.cjs");
const pre_push_cjs_1 = require("../jj/pre-push.cjs");
const types_cjs_1 = require("../types.cjs");
/**
 * Machine-readable per-file diff plumbing (VCS-audit follow-up 2026-07-08).
 *
 * `jj diff -T` renders each file entry through the TreeDiffEntry template
 * type (empirically verified on jj 0.42; the flag predates the fork's jj
 * 0.41 floor). The template emits one strict-JSON object per line, so entry
 * extraction is JSON.parse — no scraping of the human renderer's
 * `{old => new}` path compression, which is presentation output jj is free
 * to reshape (and did at 0.42, breaking the previous scraper).
 *
 * `jj status` still has no template mode, but its "Working copy changes"
 * section is definitionally the WC change's tree diff, so status() sources
 * its entries from this same template channel (`.raw` keeps the human
 * `jj st` text).
 *
 * Operator decision 2026-07-08: NO scraper fallback is kept — when the
 * underlying repo commands succeed but the template probe fails, that is
 * template-contract drift (or a jj below the `diff -T` floor) and surfaces
 * as a typed error rather than a silent empty entry list.
 */
const DIFF_ENTRY_JSON_TEMPLATE = '"{\\"status\\":" ++ json(status) ++ ",\\"source\\":" ++ json(source.path()) ++ ",\\"target\\":" ++ json(target.path()) ++ "}\\n"';
/**
 * TreeDiffEntry.status() word → the porcelain letter both
 * StatusEntry.worktree and DiffNameStatusEntry.status carry (git parity).
 * The five words are jj's documented TreeDiffEntry status set.
 */
const DIFF_STATUS_LETTER = Object.freeze({
    added: 'A',
    modified: 'M',
    removed: 'D',
    renamed: 'R',
    copied: 'C',
});
/**
 * Parse the NDJSON emitted by DIFF_ENTRY_JSON_TEMPLATE. Exported for unit
 * tests; production callers are status() and diff() in createJjAdapter.
 * Throws on a non-JSON line — with --no-pager/--color never/--quiet pinned,
 * anything unparsable on stdout is contract drift (no-fallback decision).
 */
function parseJjDiffEntries(stdout) {
    const entries = [];
    for (const line of stdout.split('\n')) {
        if (!line.trim())
            continue;
        let parsed;
        try {
            parsed = JSON.parse(line);
        }
        catch {
            throw new Error(`parseJjDiffEntries: non-JSON line from jj diff -T: '${line}'`);
        }
        entries.push({
            status: DIFF_STATUS_LETTER[parsed.status] ?? parsed.status.charAt(0).toUpperCase(),
            source: parsed.source,
            target: parsed.target,
        });
    }
    return entries;
}
function createJjAdapter(cwd) {
    // ─── helpers ────────────────────────────────────────────────────────────
    /**
     * The single source of mandatory jj flags (JJ-02). Every adapter
     * invocation goes through this helper. `--ignore-working-copy` is
     * deliberately ABSENT per D-05 (locked: never desync the WC).
     *
     * JJ-07: callers needing to inject `JJ_USER` / `JJ_EMAIL` pass them via
     * vcsExec's env option in plan 03-04 (commit/squash plan). The helper
     * itself stays env-agnostic.
     */
    const jjArgv = (...subcommand) => [
        '--repository',
        cwd,
        '--no-pager',
        '--color',
        'never',
        '--quiet',
        ...subcommand,
    ];
    /**
     * D-03: `gsd/` prefix is adapter-internal. Callers pass unprefixed
     * names; the adapter adds the prefix on every write path. D-04 raw-name
     * escape: `raw === true` skips the addition.
     */
    const addPrefix = (name, raw) => raw ? name : `gsd/${name}`;
    /**
     * D-03 strip half: every read path that emits a bookmark name to a
     * caller threads through this helper.
     */
    const stripPrefix = (name) => name.startsWith('gsd/') ? name.slice('gsd/'.length) : name;
    /**
     * Phase 3 JJ-07: propagate `JJ_USER` / `JJ_EMAIL` from the calling
     * process env down into the spawned jj invocation when set. Returns
     * `undefined` (instead of an empty `{ env: {} }` object) when no env
     * vars are set, so vcsExec inherits process.env unchanged via spawnSync's
     * default behavior. Pinned by `exec-env-passthrough.test.ts` (Task 1).
     */
    const envOpts = () => {
        const env = {};
        if (process.env.JJ_USER)
            env.JJ_USER = process.env.JJ_USER;
        if (process.env.JJ_EMAIL)
            env.JJ_EMAIL = process.env.JJ_EMAIL;
        return Object.keys(env).length > 0 ? { env } : undefined;
    };
    // ─── stub helper ────────────────────────────────────────────────────────
    const notImpl = (verb) => {
        throw new types_cjs_1.VcsNotImplementedError(`${verb}: jj backend body not yet implemented (Phase 3 — see 03-PLAN sequence)`);
    };
    // ─── commit (plan 03-04) ────────────────────────────────────────────────
    /**
     * Squash-based commit: snapshot the working copy (jj's natural pre-command
     * behavior, NEVER suppressed per D-05), then squash `@`'s content into a
     * new commit between `@-` and `@` (effectively at `@-` after `-B @`).
     *
     * - SQUASH-01: `commit({files, message})` → `jj squash <files> -B @ -k -m '<msg>'`
     * - SQUASH-02: `commit({message})` (no files) → same minus path args.
     * - SQUASH-03: paths with no WC changes are accepted (jj is path-agnostic).
     * - SQUASH-04: `@` description is preserved (jj-native behavior).
     * - SQUASH-05: `jj commit` is NEVER invoked — squash is the sole primitive.
     * - SQUASH-06: conflicted-state commits surface via CommitResult.id; the
     *   adapter does NOT auto-resolve. Phase 3 plan 05 wires findConflicts.
     * - SQUASH-07: code paths + `.planning/*` paths squashable in a single call.
     * - REFS-05 + D-01: `input.bookmark` triggers `jj bookmark set gsd/<name>
     *   -r @- -B` after the squash succeeds.
     * - D-04: `input.bookmarkRaw` triggers the same advance without the
     *   `gsd/` prefix (for upstream-tracking `main`/`trunk`).
     * - JJ-07: `JJ_USER` / `JJ_EMAIL` env propagated through `envOpts()`.
     * - WR-01: `commit({files:[]})` throws the same ambiguity error as the
     *   git backend (cross-backend invariant — copied verbatim from git.ts).
     * - `amend: true`: throws `VcsNotImplementedError` (RESEARCH Q5 — deferred
     *   to Phase 4/5 if a real caller emerges).
     * - `allowEmpty`: no-op on jj (squash naturally produces empty source =
     *   no-change, jj does not error). Field accepted and ignored.
     * - `noVerify`: no-op in Phase 3; Phase 4 owns hook firing internally.
     */
    const commit = (input) => {
        // WR-01 verbatim from git.ts:106-110 (cross-backend ambiguity rule).
        if (input.files !== undefined && input.files.length === 0) {
            throw new Error('commit({files:[]}) is ambiguous; pass files: undefined for the all-changes form, ' +
                'or pass at least one path to commit a specific path set.');
        }
        if (input.amend) {
            throw new types_cjs_1.VcsNotImplementedError('amend: not yet supported on jj backend (deferred per Phase 3 RESEARCH §Q5)');
        }
        // #3522: `respectStaged` is a git-index-specific concept. jj has no
        // separate index — the working copy IS the staged state — so honoring
        // the flag would be a lie. Per-hunk commits on jj go through `jj split`,
        // which is a different operation than what this flag describes.
        if (input.respectStaged) {
            throw new types_cjs_1.VcsNotImplementedError('respectStaged: not supported on jj backend — jj has no separate index. Use `jj split` for per-hunk commits.');
        }
        // WR-07: D-01 (`bookmark`, prefixed via addPrefix) and D-04
        // (`bookmarkRaw`, no prefix) are mutually exclusive — they advance
        // the same bookmark slot under different prefix discipline. Today
        // both-set silently picks `bookmarkRaw`, which lets a caller-side
        // bug (one code path forgets to clear the other field) advance the
        // wrong bookmark without warning. Fail loudly instead.
        if (input.bookmark !== undefined && input.bookmarkRaw !== undefined) {
            throw new Error('commit(): pass at most one of {bookmark, bookmarkRaw} — D-01 and D-04 are mutually exclusive.');
        }
        // D-14 phase-merge gate. When `phaseMergeFor` is set, read the crash
        // queue at `${phaseDir}/incomplete-work.md` and throw before any squash
        // when the queue is non-empty. The orchestrator clears the file (by
        // reviewing entries and deleting them) before re-attempting the merge.
        // Subagent-tier squashes do not set this field; only the final
        // phase-merge squash that advances `gsd/phase-{N}` does (WS-09).
        if (input.phaseMergeFor) {
            const entries = (0, incomplete_work_cjs_1.readIncomplete)(input.phaseMergeFor.phaseDir);
            if (entries.length > 0) {
                throw new types_cjs_1.VcsIncompleteSubagentsError({
                    entries,
                    phaseDir: input.phaseMergeFor.phaseDir,
                    hint: 'review entries in incomplete-work.md and delete them before re-running the phase merge',
                });
            }
        }
        // allowEmpty / noVerify: documented no-ops on jj. See JSDoc above.
        // SQUASH-01 / SQUASH-02: argv-array invocation; files trail as positional
        // [FILESETS]... per `jj squash --help`. `-B @` places the new commit
        // BEFORE @ (i.e. between @- and @); `-k` keeps change_ids stable across
        // the operation so the orchestrator's tracked head ids remain valid.
        const squashArgs = jjArgv('squash', '-B', '@', '-k', '-m', input.message);
        if (input.files && input.files.length > 0) {
            squashArgs.push(...input.files);
        }
        const squashRes = (0, exec_cjs_1.vcsExec)(cwd, 'jj', squashArgs, envOpts());
        if (squashRes.exitCode !== 0) {
            return {
                exitCode: squashRes.exitCode,
                stdout: squashRes.stdout,
                stderr: squashRes.stderr,
                id: null,
            };
        }
        // Identity resolution: after `jj squash -B @ -k`, the new commit sits at @-.
        // Per Phase 8 D-05 unified revision contract, we probe for `change_id`
        // (jj's canonical revision identifier) — not `commit_id`. The `change_id`
        // is rebase-stable on jj (PITFALLS Pitfall 1) and the canonical id the
        // cross-backend `CommitResult.id` field carries on the jj backend.
        // Parsing the `Created new commit ...` stdout text is fragile across
        // jj versions; a second `jj log -r @- -T change_id -n 1` call is the
        // deterministic form per RESEARCH §commit().
        const idArgs = jjArgv('log', '-r', '@-', '-T', 'change_id', '--no-graph', '-n', '1');
        const idRes = (0, exec_cjs_1.vcsExec)(cwd, 'jj', idArgs);
        let id = null;
        // WR-03: when the deterministic id probe fails after a successful
        // squash, surface the failure on stderr so callers can debug
        // `{id: null}` (instead of guessing whether the commit even
        // landed). The squash itself succeeded, so we still proceed to the
        // bookmark-advance step below.
        let mergedStderr = squashRes.stderr;
        if (idRes.exitCode === 0) {
            id = idRes.stdout.trim();
        }
        else {
            mergedStderr = `${squashRes.stderr}\n[id-probe failed]: ${idRes.stderr || idRes.stdout}`;
        }
        // HOOK-02 / HOOK-03 / D-32 (Phase 5 plan 05-01): pre-commit fires AFTER
        // squash success, BEFORE bookmark advance, UNCONDITIONALLY (modulo the
        // GSD_HOOK_SKIP_COLOCATED=1 escape hatch).
        //
        // Phase 5 plan 05-01 retires the D-10 colocated no-op. The original D-10
        // assumption (A3) held that git's own .git/hooks/pre-commit would fire
        // automatically via colocation when post-squash `jj git export` updated
        // .git. Phase 4 plan 04-06 empirically refuted A3 on jj 0.41 colocated
        // mode — the export does NOT auto-fire .git/hooks/pre-commit after
        // `jj squash`. Without this fix, colocated dogfood users (the dominant
        // local-dev configuration) get no pre-commit at all.
        //
        // D-32 escape hatch: `GSD_HOOK_SKIP_COLOCATED=1` suppresses the fire in
        // colocated mode. Intended for the (currently hypothetical) case where a
        // future jj release adds auto-fire in colocated mode and the adapter's
        // direct fire would produce a duplicate. Idempotent hook bodies make this
        // moot in practice; the env var exists so developers can opt out without
        // a code change. NOT a security control — it is a developer-convenience
        // override (Pitfall 3 / threat T-05.01-04: accept-disposition).
        //
        // Non-colocated jj-native: adapter shells .githooks/<stage> directly via
        // fireHook (unchanged behaviour).
        //
        // noVerify (HOOK-01 contract): skips the fire entirely on both backends.
        if (!input.noVerify) {
            const skipColocated = process.env.GSD_HOOK_SKIP_COLOCATED === '1';
            const isColocated = (0, node_fs_1.existsSync)((0, node_path_1.join)(cwd, '.git')) && (0, node_fs_1.existsSync)((0, node_path_1.join)(cwd, '.jj'));
            // D-32 / A3 fix: always fire pre-commit; D-10 colocated no-op retired.
            // GSD_HOOK_SKIP_COLOCATED=1 is the escape hatch for the case where a
            // future jj release adds auto-fire behavior in colocated mode and
            // produces duplicate fires.
            if (!(skipColocated && isColocated)) {
                const hookRes = (0, hook_bridge_cjs_1.fireHook)(cwd, 'pre-commit', { stagedFiles: input.files });
                if (hookRes.exitCode !== 0) {
                    // T-03.04-03 mitigation pattern: squash already succeeded; report
                    // hook failure via merged stderr, but exitCode reflects squashRes
                    // (the squash itself didn't fail). Caller decides whether to treat
                    // as error based on stderr presence.
                    mergedStderr = `${mergedStderr}\n[pre-commit hook failed]: ${hookRes.stderr || hookRes.stdout}`;
                }
            }
        }
        // D-01 / D-04: bookmark advance. The squash already succeeded; an
        // advance failure here is reported via merged stderr (never silently
        // swallowed — T-03.04-03 mitigation).
        if (input.bookmark !== undefined || input.bookmarkRaw !== undefined) {
            const bmName = input.bookmarkRaw !== undefined
                ? input.bookmarkRaw
                : addPrefix(input.bookmark);
            // 19-review WR-02 (D-24 parity): this was the one bookmark-write path
            // that skipped both the validator and the `--` separator — a
            // caller-supplied name beginning with `-` (e.g. '--delete', '-r')
            // would have been parsed as a flag by jj. Apply the same
            // validateRefname + `--` defense-in-depth pair as
            // bookmarks.create/move/delete/exists. (`--` before the positional
            // NAMES verified working on jj 0.41.)
            (0, refs_validator_cjs_1.validateRefname)(bmName);
            // IN-03: long form `--allow-backwards` (verified on jj 0.41) so a
            // Renovate bump past 0.41 — where the short `-B` may be retired
            // for the canonical spelling — remains in-place compatible.
            const advArgs = jjArgv('bookmark', 'set', '-r', '@-', '--allow-backwards', '--', bmName);
            const advRes = (0, exec_cjs_1.vcsExec)(cwd, 'jj', advArgs);
            if (advRes.exitCode !== 0) {
                return {
                    exitCode: squashRes.exitCode,
                    stdout: squashRes.stdout,
                    stderr: `${mergedStderr}\n[bookmark advance failed]: ${advRes.stderr || advRes.stdout}`,
                    id,
                };
            }
        }
        return {
            exitCode: squashRes.exitCode,
            stdout: squashRes.stdout,
            stderr: mergedStderr,
            id,
        };
    };
    // ─── log / status / diff / findConflicts (plan 03-05) ───────────────────
    /**
     * `vcs.log(opts)` — emits commits as `LogEntry[]` via the NDJSON parser
     * (`parseJjLog`, production from plan 03-02). Argv shape per RESEARCH
     * §`log()`:
     *  - `opts.maxCount` → `-n N`
     *  - `opts.allRefs` → `-r 'all()'`
     *  - `opts.rev` → `-r toJjRev(rev)`
     *  - `opts.paths` → trailing positional path filter, prefixed with the
     *    `--` end-of-options separator (WR-01: verified working on jj 0.41;
     *    neutralizes leading-`-` paths that would otherwise be parsed as
     *    flags by jj's CLI — same defense the git backend uses at git.ts:202).
     * `LogEntry.id` is the active backend's canonical revision identifier —
     * `commit_id` on git, `change_id` on jj. Pinned by `parseJjLog`.
     */
    const log = (opts = {}) => {
        const args = ['log', '-T', 'json(self) ++ "\\n"', '--no-graph'];
        if (opts.maxCount)
            args.push('-n', String(opts.maxCount));
        if (opts.allRefs)
            args.push('-r', 'all()');
        if (opts.rev)
            args.push('-r', (0, jj_rev_cjs_1.toJjRev)(opts.rev));
        if (opts.paths && opts.paths.length > 0)
            args.push('--', ...opts.paths);
        const r = (0, exec_cjs_1.vcsExec)(cwd, 'jj', jjArgv(...args));
        if (r.exitCode !== 0)
            return [];
        return (0, jj_log_cjs_1.parseJjLog)(r.stdout);
    };
    /**
     * Parse `jj status` human-readable output into `StatusEntry[]`.
     *
     * Phase 2.1 D-16: `StatusEntry` has NO `index` field — jj has no index.
     * `worktree` carries the porcelain letter (A/M/D/R/C).
     *
     * `.raw` keeps the human `jj st` text (18-04: status predicates key on
     * `entries[]`, never `.raw`). Entries come from the machine-readable
     * `jj diff -T` NDJSON channel — the WC change's tree diff IS the status
     * "Working copy changes" section (jj auto-tracks on snapshot, so adds/
     * mods/dels/renames all appear; ignored files appear in neither, matching
     * the retired jj-st scraper). Rename/copy entries canonicalize `path` on
     * the post-state and surface the pre-state as `origPath` (19-12 rename
     * contract — mirrors the git backend's `-z` parser at git.ts:340).
     *
     * Per git-backend parity, `opts.porcelain === false` returns
     * `{entries: [], raw: stdout}` without running the entries probe.
     */
    const status = (opts = {}) => {
        // Phase 7 D-07 (VCS-11): scoped variant — defaults to adapter's construction
        // cwd if omitted. The jjArgv mandatory `--repository <cwd>` prefix stays
        // pinned to the adapter root; only the spawned-process cwd switches —
        // jj (verified 0.41/0.42) uses the spawned cwd to select the workspace.
        const targetCwd = opts.cwd ?? cwd;
        const r = (0, exec_cjs_1.vcsExec)(targetCwd, 'jj', jjArgv('status'));
        if (r.exitCode !== 0)
            return { entries: [], raw: r.stderr || r.stdout };
        if (opts.porcelain === false) {
            return { entries: [], raw: r.stdout };
        }
        // Entries via the template channel — same workspace-selection mechanics
        // (spawned cwd = targetCwd, --repository pinned). Bare `jj diff` (no -r)
        // is the working-copy change, exactly the status section.
        const d = (0, exec_cjs_1.vcsExec)(targetCwd, 'jj', jjArgv('diff', '-T', DIFF_ENTRY_JSON_TEMPLATE));
        if (d.exitCode !== 0) {
            // `jj status` succeeded but the template probe failed: template-
            // contract drift (or a jj below the `diff -T` floor) — loud per the
            // no-fallback operator decision, never a silent empty entry list.
            throw new exec_cjs_1.VcsExecError(`status: jj diff -T entry probe failed: ${d.stderr || d.stdout}`, {
                exitCode: d.exitCode,
                stdout: d.stdout,
                stderr: d.stderr,
                timedOut: d.timedOut,
                args: ['diff', '-T', DIFF_ENTRY_JSON_TEMPLATE],
            });
        }
        const entries = parseJjDiffEntries(d.stdout).map((e) => e.source !== e.target
            ? { path: e.target, worktree: e.status, origPath: e.source }
            : { path: e.target, worktree: e.status });
        return { entries, raw: r.stdout };
    };
    /**
     * Phase 2.1 / Phase 3: `opts.staged` is a git-only concept (the index).
     * On jj there is no index — `opts.staged === true` is a documented no-op
     * (returns the same WC diff). Callers should narrow on `vcs.kind === 'git'`
     * before relying on staged-specific behavior. No Phase 3 caller exercises
     * this option against a jj backend (audit recorded in 03-05-AUDIT.md).
     *
     * Argv per RESEARCH §`diff()`:
     *  - `opts.nameOnly` → `--name-only`
     *  - `opts.nameStatus`/`opts.diffFilter` → `-T DIFF_ENTRY_JSON_TEMPLATE`
     *    (machine-readable NDJSON per file entry; replaced the retired
     *    `--summary` scraper whose compressed `{old => new}` rename rendering
     *    was presentation output). NOTE: in this mode `.raw` carries the
     *    template NDJSON — it is still the underlying command's verbatim
     *    stdout; patch-text consumers use the default (format-flag-free) call.
     *  - `opts.rev` → `-r toJjRev(rev)`
     *  - `opts.paths` → trailing positional, prefixed with `--` end-of-options
     *    separator (WR-01: verified working on jj 0.41; mirrors the git
     *    backend's argv shape at git.ts:298).
     */
    const diff = (opts = {}) => {
        const args = ['diff'];
        // Phase 7 D-06 (VCS-10): when nameStatus/diffFilter ask for per-file
        // statuses, use the `-T` NDJSON template and post-filter parsed entries.
        // `-T` and `--name-only` are both format selectors (mutually exclusive
        // at the jj CLI, same as the old `--summary`); when both are requested,
        // nameOnly derives from the parsed entries below.
        const useEntryTemplate = opts.nameStatus === true || opts.diffFilter !== undefined;
        const useNameOnly = opts.nameOnly === true && !useEntryTemplate;
        if (useNameOnly)
            args.push('--name-only');
        if (useEntryTemplate)
            args.push('-T', DIFF_ENTRY_JSON_TEMPLATE);
        if (opts.rev)
            args.push('-r', (0, jj_rev_cjs_1.toJjRev)(opts.rev));
        if (opts.paths && opts.paths.length > 0)
            args.push('--', ...opts.paths);
        // opts.staged: no-op on jj (no index concept). See JSDoc above.
        const r = (0, exec_cjs_1.vcsExec)(cwd, 'jj', jjArgv(...args));
        if (r.exitCode !== 0) {
            return { raw: r.stderr || r.stdout, nameOnly: [] };
        }
        const result = {
            raw: r.stdout,
            nameOnly: useNameOnly
                ? r.stdout.split('\n').map((s) => s.trim()).filter(Boolean)
                : [],
        };
        if (useEntryTemplate) {
            // Post-state path convention for rename/copy entries (git backend's
            // `cols[2]` heuristic — the new path is what consumers act on).
            result.nameStatus = parseJjDiffEntries(r.stdout).map((e) => ({
                path: e.target,
                status: e.status,
            }));
            // When the caller requested nameOnly:true alongside entry-shaped
            // probes (because diffFilter forced the template), derive nameOnly
            // from the parsed entries so the contract surface matches the request.
            if (opts.nameOnly === true) {
                result.nameOnly = result.nameStatus.map((e) => e.path);
            }
        }
        // Phase 7 D-06 (VCS-10): post-filter parsed entries by status letter.
        if (opts.diffFilter && result.nameStatus) {
            const letter = { added: 'A', modified: 'M', deleted: 'D', renamed: 'R', typechange: 'T' }[opts.diffFilter];
            const filtered = result.nameStatus.filter((e) => e.status === letter);
            result.nameOnly = filtered.map((e) => e.path);
            result.nameStatus = filtered;
        }
        return result;
    };
    /**
     * Phase 3 RESEARCH A3 (empirically resolved): enumerate conflicted paths
     * for a given revision via `jj resolve --list -r <rev>` — the sole form
     * since the VCS-audit follow-up (2026-07-08) deleted the dormant
     * `--summary` fallback (dead on every probe since 0.41, and its `C`-line
     * filter meant *copied*, not conflicted). Line format and the spaced-path
     * extraction fix are documented at the sidecar (jj/conflict-paths.cts).
     *
     * WR-04: the sentinel `'<UNRESOLVABLE>'` is returned when enumeration
     * fails or prints nothing for a rev the `conflicts()` revset flagged.
     * CONFLICT-03 (verify gate) thus cannot mistake an empty array for "no
     * conflicts" when the upstream revset clearly said the commit IS
     * conflicted — surface drift instead of silently passing.
     */
    // Phase 9 plan 02 (UPSTREAM-02): the enumeration body lives in the sidecar
    // at `../jj/conflict-paths.ts` so both `reap.ts` (D-09/D-10/D-11 classifier)
    // and `parallel.ts` (plan 03) can consume it without importing from
    // `backends/jj.ts`. This binding preserves the original `(rev) => string[]`
    // closure shape so the `findConflicts` caller below (and any future
    // in-this-file caller) is unchanged.
    const enumerateConflictedPaths = (rev) => (0, conflict_paths_cjs_1.enumerateConflictedPaths)(cwd, rev);
    /**
     * `vcs.findConflicts({scope})` — surfaces in-tree conflicted commits.
     *
     * ⚠️ **CRITICAL: jj's revset function is `conflicts()` PLURAL, not
     * `conflict()`.** All upstream docs (CONTEXT.md, REQUIREMENTS.md,
     * ROADMAP.md) currently say singular `conflict()`; the doc-fix is
     * scheduled for plan 03-07 wrap-up. Implementation here uses the correct
     * plural form from day one. See 03-RESEARCH.md §"Open Question Q1" for
     * the verification record.
     *
     * - `scope: 'all'` → revset `conflicts()` (every in-tree conflicted commit)
     * - `scope: 'working-copy'` → revset `conflicts() & @` (filter to @)
     *
     * Path enumeration uses `enumerateConflictedPaths(rev)` — `jj resolve
     * --list -r <rev>` (sole form; the dormant `--summary` fallback was
     * deleted in the 2026-07-08 VCS-audit follow-up).
     *
     * CONFLICT-03: the verify-gate caller invokes `findConflicts({scope:'all'})`
     * — already wired on the git backend (git.ts:520); flipping the allowlist
     * entry below makes the jj backend reachable through it without further
     * call-site change.
     */
    const findConflicts = (opts) => {
        const revset = opts.scope === 'working-copy'
            ? 'conflicts() & @'
            : 'conflicts()';
        const logArgs = jjArgv('log', '-r', revset, '-T', 'json(self) ++ "\\n"', '--no-graph');
        const r = (0, exec_cjs_1.vcsExec)(cwd, 'jj', logArgs);
        if (r.exitCode !== 0)
            return [];
        const entries = (0, jj_log_cjs_1.parseJjLog)(r.stdout);
        if (entries.length === 0)
            return [];
        const results = [];
        for (const entry of entries) {
            const paths = enumerateConflictedPaths(entry.id);
            results.push({ rev: entry.id, paths, scope: opts.scope });
        }
        return results;
    };
    // ─── push / fetch (plan 03-06) ──────────────────────────────────────────
    /**
     * `vcs.push(opts)` — wraps `jj git push` (NOT raw `git push`; `jj git push`
     * is a jj subcommand and is the only legal jj-side wrapper around the
     * git-remote protocol).
     *
     * Argv mapping (empirically verified against jj 0.41 during plan 03-06):
     *  - `opts.remote` → `--remote <name>`
     *  - `opts.ref`    → `--bookmark <name>` IFF the ref is bookmark-shaped
     *                    (matches `^[A-Za-z][\w\-/.]*$` after `toJjRev`).
     *                    Other shapes (`@`, `@-`, range exprs) are a documented
     *                    no-op — jj's default push behavior applies.
     *  - `opts.force`  → DOCUMENTED NO-OP. `jj git push` has NO `--force-with-lease`
     *                    flag. Its DEFAULT behavior IS already force-with-lease
     *                    semantics ("safety checks" per `jj git push --help`).
     *                    Accepted on the cross-backend surface for parity; adds
     *                    no flag to the argv. (Empirical correction to
     *                    RESEARCH A4 which speculated --force-with-lease existed.)
     *  - `opts.noVerify` → no-op on jj in Phase 3 (Phase 4 owns hook firing).
     *
     * T-03.06-01 mitigation: the bookmark-shape regex gates the `--bookmark`
     * path; non-matching refs proceed without the flag. The regex disallows
     * leading `-` (rules out flag-injection like `--bookmark='--delete'`).
     */
    const push = (opts = {}) => {
        // 19-12 next-merge port: PushOpts.setUpstream is a documented no-op on jj
        // — `jj git push --bookmark` records the remote-tracking relationship
        // natively, so there is no flag to forward.
        const args = ['git', 'push'];
        if (opts.remote)
            args.push('--remote', opts.remote);
        if (opts.ref) {
            const refName = (0, jj_rev_cjs_1.toJjRev)(opts.ref);
            // Bookmark-shape gate (T-03.06-01): only letter-leading, refname-safe
            // names get `--bookmark`. `@`, `@-`, `from..to` ranges fall through.
            // WR-06: `.` is in the trailing character class to admit refname
            // dots (e.g. `release/v1.2`), but that also lets the range token
            // `..` slip through when both range ends are bookmark-shaped (e.g.
            // `from..to` joined by toJjRev). Exclude `..` explicitly so the
            // gate intent ("bookmark-shaped, not a range") is actually
            // enforced.
            const isBookmarkLike = /^[A-Za-z][\w\-/.]*$/.test(refName) && !refName.includes('..');
            if (isBookmarkLike) {
                args.push('--bookmark', refName);
            }
            // else: documented no-op — jj's default push behavior applies. Phase 4
            // may reshape if a real caller needs per-rev push selectivity.
        }
        // opts.force: documented no-op (see JSDoc above). No flag added.
        // HOOK-04 (Phase 4 plan 06): pre-push fires BEFORE jj git push. Inline
        // replication of acarapetis/jj-pre-push trigger logic (CI-02 — no Python
        // runtime dep). When the hook returns non-zero, abort the push. noVerify
        // (HOOK-01 contract) suppresses the fire.
        if (!opts.noVerify) {
            const hookRes = (0, pre_push_cjs_1.firePrePushHook)(cwd, { remote: opts.remote });
            if (hookRes.exitCode !== 0) {
                return {
                    exitCode: hookRes.exitCode,
                    stdout: hookRes.stdout,
                    stderr: `[pre-push hook failed]: ${hookRes.stderr || hookRes.stdout}`,
                    timedOut: false,
                    error: null,
                };
            }
        }
        return (0, exec_cjs_1.vcsExec)(cwd, 'jj', jjArgv(...args));
    };
    /**
     * `vcs.fetch(opts)` — wraps `jj git fetch`.
     *
     * Argv mapping (empirically verified against jj 0.41 during plan 03-06):
     *  - `opts.remote` → `--remote <name>`
     *  - `opts.ref`    → DOCUMENTED NO-OP (RESEARCH A6). `jj git fetch` has
     *                    `--branch <glob>` (glob filter on bookmark names) but
     *                    no per-ref selectivity in the git-style sense. The
     *                    cross-backend `opts.ref` field has no clean
     *                    translation; jj fetches all configured remote refs.
     *                    Audit (T-03.06-02 mitigation): no jj-reachable caller
     *                    passes opts.ref to fetch — recorded in 03-06-AUDIT.md.
     */
    const fetch = (opts = {}) => {
        const args = ['git', 'fetch'];
        if (opts.remote)
            args.push('--remote', opts.remote);
        // opts.ref: documented no-op on jj (see JSDoc above).
        return (0, exec_cjs_1.vcsExec)(cwd, 'jj', jjArgv(...args));
    };
    // ─── refs.bookmarks namespace (plan 03-03) ──────────────────────────────
    // D-03 (gsd/ prefix discipline): every mutating write threads through
    // `addPrefix(name, opts?.raw)`; every read site that emits a name to a
    // caller threads through `stripPrefix(rawName)`.
    // D-04 (raw escape): `opts.raw === true` opts out of the prefix add on
    // mutating methods. Used for upstream-tracking bookmarks like `main`.
    // D-02 (divergence): `bookmarks.list` throws `VcsBookmarkDivergentError`
    // via `parseJjBookmarkRecord` when the `target` array reports >1 entry.
    const bookmarks = Object.freeze({
        list: () => {
            // Phase 8 FLIP-01: the default `json(self)` template emits
            // `target: [<commit_id>]`; we need `change_id` per the unified revision
            // contract (D-05). Custom template emits identical JSON shape (the
            // parser is transparent over the rev-string alphabet) but reads
            // `change_id` from each target Commit. Probed live during Plan 2
            // execution; pinned by tests/fixtures/jj-ndjson/jj-bookmark-list-divergent.ndjson.
            const args = jjArgv('bookmark', 'list', '-T', '"{\\"name\\":" ++ json(self.name()) ++ ",\\"target\\":[" ++ self.added_targets().map(|c| json(c.change_id())).join(",") ++ "]}\\n"');
            const r = (0, exec_cjs_1.vcsExec)(cwd, 'jj', args);
            if (r.exitCode !== 0) {
                throw new exec_cjs_1.VcsExecError(`refs.bookmarks.list failed: ${r.stderr || r.stdout}`, {
                    exitCode: r.exitCode,
                    stdout: r.stdout,
                    stderr: r.stderr,
                    timedOut: r.timedOut,
                    args,
                });
            }
            const lines = r.stdout.split('\n').filter(Boolean);
            return lines.map((line) => (0, jj_bookmark_cjs_1.parseJjBookmarkRecord)(line, stripPrefix));
        },
        create: (name, rev, opts) => {
            const actualName = addPrefix(name, opts?.raw);
            // D-24 cr-01 fold-in: validate the post-prefix name BEFORE argv build.
            // Rejects '-D', '--force-delete', '--push-option=evil', etc. Applied for
            // both raw (opts.raw === true) and non-raw paths — the gsd/ prefix is
            // incidental protection, not contract. Defense-in-depth pair: the `--`
            // end-of-options separator below catches anything the validator misses
            // and isolates the positional from any preceding flag-bearing tokens.
            (0, refs_validator_cjs_1.validateRefname)(actualName);
            const args = jjArgv('bookmark', 'create', '-r', (0, jj_rev_cjs_1.toJjRev)(rev), '--', actualName);
            const r = (0, exec_cjs_1.vcsExec)(cwd, 'jj', args);
            if (r.exitCode !== 0) {
                throw new Error(`refs.bookmarks.create failed: ${r.stderr || r.stdout}`);
            }
        },
        move: (name, rev, opts) => {
            const actualName = addPrefix(name, opts?.raw);
            // D-24 cr-01 fold-in: see bookmarks.create above for rationale.
            (0, refs_validator_cjs_1.validateRefname)(actualName);
            const args = jjArgv('bookmark', 'move', '--to', (0, jj_rev_cjs_1.toJjRev)(rev), '--', actualName);
            const r = (0, exec_cjs_1.vcsExec)(cwd, 'jj', args);
            if (r.exitCode !== 0) {
                throw new Error(`refs.bookmarks.move failed: ${r.stderr || r.stdout}`);
            }
        },
        /**
         * Phase 7 D-09 (VCS-14): widen opts with force?: boolean. On jj, force is
         * a documented no-op — jj's `bookmark delete` already removes the LOCAL
         * view regardless of state. Divergent remote-tracking bookmarks are
         * unaffected (Pitfall 5 in 07-RESEARCH.md): the cross-backend `force` flag
         * does NOT have identical semantics across backends. Flag preserved for
         * API parity with git's branch -D.
         */
        delete: (name, opts) => {
            const actualName = addPrefix(name, opts?.raw);
            // D-24 cr-01 fold-in: see bookmarks.create above for rationale.
            (0, refs_validator_cjs_1.validateRefname)(actualName);
            // opts.force: documented no-op on jj (jj's bookmark delete is unconditional).
            const args = jjArgv('bookmark', 'delete', '--', actualName);
            const r = (0, exec_cjs_1.vcsExec)(cwd, 'jj', args);
            if (r.exitCode !== 0) {
                throw new Error(`refs.bookmarks.delete failed: ${r.stderr || r.stdout}`);
            }
        },
        exists: (name, opts) => {
            const actualName = addPrefix(name, opts?.raw);
            // D-24 cr-01 fold-in: validator on read-side probes too. A probe like
            // bookmarks.exists('-D') would otherwise pass '-D' as a positional to
            // `jj bookmark list`, which jj may interpret as a flag depending on
            // version. Reject the shape upfront.
            (0, refs_validator_cjs_1.validateRefname)(actualName);
            // `jj bookmark list <name>` exits 0 even when the bookmark is absent
            // (just emits an empty list). The presence probe combines exit-0 with
            // non-empty stdout.
            const args = jjArgv('bookmark', 'list', '--', actualName);
            const r = (0, exec_cjs_1.vcsExec)(cwd, 'jj', args);
            return r.exitCode === 0 && r.stdout.trim().length > 0;
        },
        switch: (_name, _opts) => {
            // RESEARCH §`refs.bookmarks.switch`: no production caller exercises this
            // on jj backends. The 02-09-era "callers pin kind:'git'" rationale
            // expired when 19-07 removed the pin from cmdCommit; the live guard is
            // now cmdCommit's explicit `branchVcs.kind === 'git'` narrowing
            // (19-review CR-01) — on jj, bookmark-less `@` is first-class and the
            // pre-commit branch switch is intentionally a no-op, so this verb stays
            // unimplemented. Audit recorded in 03-03-AUDIT.md.
            throw new types_cjs_1.VcsNotImplementedError('refs.bookmarks.switch: deferred — no caller exercises this on jj backend (cmdCommit guards on vcs.kind === \'git\'; see 03-03-AUDIT.md)');
        },
    });
    // ─── refs namespace (plan 03-03) ────────────────────────────────────────
    const refs = Object.freeze({
        head: expr_cjs_1.expr.head(),
        parent: expr_cjs_1.expr.parent(),
        // Phase 15.02 (VCS-21): canonical id alphabet for jj change_id —
        // empirically verified k-z reverse-base32 alphabet (see
        // jj-id-alphabet-probe.test.ts:49-75 / format-migration/rewrite.ts:63).
        // Opaque string per CF-03; consumers compose into regex patterns.
        idAlphabet: 'k-z',
        bookmarks,
        currentBookmarks: () => {
            // jj's "current bookmark" semantics map to bookmarks at @- (the parent
            // of the working-copy commit), because @ is always the in-progress WC
            // commit. Multiple bookmarks can point at the same revision; the
            // template `bookmarks.join("\n")` emits each name on its own line.
            const args = jjArgv('log', '-r', '@-', '-T', 'bookmarks.join("\\n")', '--no-graph', '-n', '1');
            const r = (0, exec_cjs_1.vcsExec)(cwd, 'jj', args);
            if (r.exitCode !== 0)
                return [];
            return r.stdout
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean)
                .map((s) => {
                // WR-02 (D-02 enforcement on this read path): jj renders
                // divergent bookmarks with a trailing `??` suffix in template
                // output. Surface as `VcsBookmarkDivergentError` rather than
                // letting `feature??` masquerade as a regular bookmark name
                // after stripPrefix. `divergentTargets` is left empty here
                // because the template form doesn't expose the targets; callers
                // who need them can re-query through `bookmarks.list()`.
                if (s.endsWith('??')) {
                    throw new types_cjs_1.VcsBookmarkDivergentError({
                        bookmarkName: stripPrefix(s.slice(0, -2)),
                        divergentTargets: [],
                    });
                }
                // WR-08: jj's `bookmarks` template appends `*` when the local
                // bookmark is ahead of its remote-tracking counterpart. Strip
                // only this known marker; any other non-refname suffix is
                // contract drift and surfaces as a typed error so a future jj
                // template reshape can't silently leak state markers into
                // caller-visible names.
                const stripped = s.replace(/\*$/, '');
                // Refname grammar (the conservative slice we admit on this
                // template-driven read path): leading alnum, then
                // `[A-Za-z0-9._/-]*`. Anything else signals template drift.
                if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(stripped)) {
                    throw new Error(`currentBookmarks: template contract drift — '${s}' has an unrecognized suffix or shape (expected refname after '*'/'??' marker strip)`);
                }
                return stripped;
            })
                .map(stripPrefix);
        },
        /**
         * Phase 7 D-04 (VCS-08): scoped current-bookmark probe. Same body as
         * `currentBookmarks` but the vcsExec call uses `targetCwd` as the
         * spawned-process cwd; the `jjArgv` mandatory `--repository <cwd>` prefix
         * stays pinned to the adapter root. jj 0.41 uses the spawned process's
         * cwd to select the workspace within the repo (matches existing
         * acquireJjWriteLock convention at jj.ts:1011-1018).
         */
        currentBookmarksIn: (targetCwd) => {
            const args = jjArgv('log', '-r', '@-', '-T', 'bookmarks.join("\\n")', '--no-graph', '-n', '1');
            const r = (0, exec_cjs_1.vcsExec)(targetCwd, 'jj', args);
            if (r.exitCode !== 0)
                return [];
            return r.stdout
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean)
                .map((s) => {
                if (s.endsWith('??')) {
                    throw new types_cjs_1.VcsBookmarkDivergentError({
                        bookmarkName: stripPrefix(s.slice(0, -2)),
                        divergentTargets: [],
                    });
                }
                const stripped = s.replace(/\*$/, '');
                if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(stripped)) {
                    throw new Error(`currentBookmarksIn: template contract drift — '${s}' has an unrecognized suffix or shape (expected refname after '*'/'??' marker strip)`);
                }
                return stripped;
            })
                .map(stripPrefix);
        },
        /**
         * Phase 7 D-05 (VCS-09): returns change_id (per D-05 user override despite
         * rebase-stability tradeoff). fork_point(x) is the jj revset for the common
         * ancestor(s) of x — equivalent to `heads(::x_1 & ::x_2 & ...)`. Verified
         * locally against jj 0.41.0 per 07-RESEARCH.md §Sources.
         */
        mergeBase: (a, b) => {
            const aJj = (0, jj_rev_cjs_1.toJjRev)(a);
            const bJj = (0, jj_rev_cjs_1.toJjRev)(b);
            const args = jjArgv('log', '-r', `fork_point(${aJj} | ${bJj})`, '-T', 'change_id ++ "\\n"', '--no-graph', '-n', '1');
            const r = (0, exec_cjs_1.vcsExec)(cwd, 'jj', args);
            if (r.exitCode !== 0) {
                throw new exec_cjs_1.VcsExecError(`refs.mergeBase failed: ${r.stderr || r.stdout}`, {
                    exitCode: r.exitCode,
                    stdout: r.stdout,
                    stderr: r.stderr,
                    timedOut: r.timedOut,
                    args,
                });
            }
            const first = r.stdout.split('\n').map((s) => s.trim()).find(Boolean);
            if (!first)
                throw new Error('refs.mergeBase: empty fork_point result');
            return first;
        },
        /**
         * Phase 7 planner fold-in (VCS-15): read file content at a revision via
         * `jj file show -r <rev> -- <path>`. jj 0.41 has first-class
         * `jj file show` — verified per 07-RESEARCH.md §Sources.
         */
        readBlob: (rev, blobPath) => {
            const args = jjArgv('file', 'show', '-r', (0, jj_rev_cjs_1.toJjRev)(rev), '--', blobPath);
            const r = (0, exec_cjs_1.vcsExec)(cwd, 'jj', args);
            if (r.exitCode !== 0) {
                throw new exec_cjs_1.VcsExecError(`refs.readBlob failed: ${r.stderr || r.stdout}`, {
                    exitCode: r.exitCode,
                    stdout: r.stdout,
                    stderr: r.stderr,
                    timedOut: r.timedOut,
                    args,
                });
            }
            return r.stdout;
        },
        resolveShort: (rev) => {
            // shortest(12), not bare shortest() and not short(): bare shortest()
            // returns the MINIMAL unique prefix (1-2 chars on small repos), which
            // goes stale as soon as any new change lands with an overlapping id —
            // and these short ids are persisted in envelopes/SUMMARYs, not just
            // displayed. short() is a blind fixed-length truncation that would
            // NOT extend on a prefix conflict; shortest(12) emits the same 12
            // k-z chars (~55 bits) in the no-conflict case AND auto-extends past
            // 12 when uniqueness ever demands it.
            const args = jjArgv('log', '-r', (0, jj_rev_cjs_1.toJjRev)(rev), '-T', 'change_id.shortest(12)', '--no-graph', '-n', '1');
            const r = (0, exec_cjs_1.vcsExec)(cwd, 'jj', args);
            if (r.exitCode !== 0) {
                throw new Error(`refs.resolveShort failed: ${r.stderr || r.stdout}`);
            }
            return r.stdout.trim();
        },
        countCommits: ({ rev }) => {
            const target = rev ? (0, jj_rev_cjs_1.toJjRev)(rev) : '::@';
            // Emit each commit's id on its own line so the count survives
            // vcsExec's stdout trim (a bare `"\n"` template would collapse to
            // empty stdout after trim and miscount as zero). `.split('\n')` +
            // `.filter(Boolean)` is the same idiom used by every other parser in
            // this file.
            const args = jjArgv('log', '-r', target, '-T', 'change_id ++ "\\n"', '--no-graph');
            const r = (0, exec_cjs_1.vcsExec)(cwd, 'jj', args);
            if (r.exitCode !== 0)
                return 0;
            return r.stdout.split('\n').filter(Boolean).length;
        },
        rootRevisions: ({ rev }) => {
            const target = rev ? (0, jj_rev_cjs_1.toJjRev)(rev) : '@';
            const args = jjArgv('log', '-r', `root() & ::${target}`, '-T', 'change_id ++ "\\n"', '--no-graph');
            const r = (0, exec_cjs_1.vcsExec)(cwd, 'jj', args);
            if (r.exitCode !== 0)
                return [];
            return r.stdout
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean);
        },
        // Phase 15.03 (VCS-22): alphabet-aware short-prefix matcher. Throws on
        // wrong-alphabet (Pitfall 6: silent-false would mask caller bugs e.g. a
        // hex prefix passed to a jj-backed adapter). Throws on empty prefix
        // (caller bug per CF-04). Returns false on prefix.length > rawId.length
        // (well-defined no-match, NOT a caller bug). jj prefix index is
        // lower-only k-z; uppercase k-z is outside [k-z] and trips the
        // wrong-alphabet gate. No closure over vcs.refs.idAlphabet — alphabet
        // regex is inlined per Pattern S3 / validateRefname precedent.
        matchPrefix: (id, prefix) => {
            if (prefix.length === 0) {
                throw new Error('vcs.refs.matchPrefix: empty prefix is a caller bug');
            }
            const rawId = (0, jj_rev_cjs_1.toJjRev)(id);
            if (prefix.length > rawId.length) {
                return false;
            }
            if (!/^[k-z]+$/.test(prefix)) {
                throw new Error(`vcs.refs.matchPrefix: prefix '${prefix}' contains chars outside jj alphabet [k-z]`);
            }
            return rawId.startsWith(prefix);
        },
        exists: (rev) => {
            const args = jjArgv('log', '-r', (0, jj_rev_cjs_1.toJjRev)(rev), '-T', '"x"', '--no-graph', '-n', '1');
            const r = (0, exec_cjs_1.vcsExec)(cwd, 'jj', args);
            return r.exitCode === 0 && r.stdout.trim().length > 0;
        },
        isIgnored: (_path) => {
            // RESEARCH §`refs.isIgnored`: the single production caller is
            // `get-shit-done/bin/lib/core.cjs` (ADR-0004) which constructs the
            // adapter via `createVcsAdapter(cwd, { kind: 'git' })` — statically
            // git-only. Audit recorded in 03-03-AUDIT.md. jj-side semantics
            // revisit in Phase 4 if a real caller surfaces.
            throw new types_cjs_1.VcsNotImplementedError('refs.isIgnored: deferred — only git-side production caller (core.cjs) pins kind:git; jj-side semantics revisit in Phase 4 (see 03-03-AUDIT.md)');
        },
        remotes: () => {
            const args = jjArgv('git', 'remote', 'list', '-T', 'name ++ "\\n"');
            const r = (0, exec_cjs_1.vcsExec)(cwd, 'jj', args);
            if (r.exitCode !== 0)
                return [];
            return r.stdout
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean);
        },
        // 19-12 next-merge port (cmdPrSubrepo): read-only remote-URL probe.
        // Templated `jj git remote list` emits one `name<TAB>url` record per
        // remote; a TAB separator is safe because refname bytes exclude control
        // characters (refs-validator) and URLs cannot contain raw TABs.
        remoteUrl: (name) => {
            if (!name || name.startsWith('-'))
                return null;
            const args = jjArgv('git', 'remote', 'list', '-T', 'name ++ "\\t" ++ url ++ "\\n"');
            const r = (0, exec_cjs_1.vcsExec)(cwd, 'jj', args);
            if (r.exitCode !== 0)
                return null;
            for (const line of r.stdout.split('\n')) {
                const tab = line.indexOf('\t');
                if (tab === -1)
                    continue;
                if (line.slice(0, tab) === name) {
                    const url = line.slice(tab + 1).trim();
                    return url.length > 0 ? url : null;
                }
            }
            return null;
        },
    });
    // ─── workspace namespace (plan 04-01 fills add/forget/prune real bodies) ─
    // Phase 3 left add/forget/prune as VcsNotImplementedError stubs. Plan 04-01
    // replaces them with real bodies on jj. reap() + acquireWriteLock are added
    // as Phase 4 stubs that throw — plans 04-03 (lock) and 04-04 (reap) ship
    // the real bodies; per-verb allowlist gates contract access (TEST-06
    // skip-not-throw).
    const workspace = Object.freeze({
        add: (input) => {
            // D-17 (RESEARCH Pitfall 4): jj workspace add does NOT auto-create
            // intermediate directories. mkdir -p the parent before invoking.
            (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(input.path), { recursive: true });
            // D-04: --name <NAME> threaded from input.name (Phase 4 type extension);
            // defaults to basename(input.path) per jj's own default when --name omitted.
            // Security (T-04.01-01 mitigate): insert `--` end-of-options separator
            // before user-influenced positional `input.path` so an attacker-controlled
            // path like '--no-confirm' cannot be parsed as a flag.
            const args = jjArgv('workspace', 'add');
            if (input.baseRef) {
                args.push('-r', (0, jj_rev_cjs_1.toJjRev)(input.baseRef));
            }
            if (input.name) {
                args.push('--name', input.name);
            }
            args.push('--', input.path);
            const r = (0, exec_cjs_1.vcsExec)(cwd, 'jj', args);
            if (r.exitCode !== 0) {
                throw new Error(`workspace.add failed: ${r.stderr || r.stdout}`);
            }
            // Cross-backend contract parity: when caller passes `baseRef`, the
            // workspace's `@` MUST equal baseRef (git backend's `git worktree add
            // <path> -b <name> <baseRef>` does this natively — HEAD === baseRef,
            // no extra commit). jj's `workspace add -r <baseRef>` violates this:
            // it always inserts a fresh auto-empty WC ON TOP of baseRef, making
            // `@-` the baseRef and `@` the auto-empty. Downstream callers that
            // rely on `commit({squashIntoBase: '@'})` semantics then stack work as
            // descendants of the named change instead of squashing INTO it (see
            // [[project-jj-workspace-add-auto-empty-bug]]).
            //
            // Remediation: from inside the new workspace, `jj edit -r <baseRef>`
            // to move @ back to baseRef, then `jj abandon <auto-empty-id>` to
            // clean up the orphaned descendant. Scoped to `baseRef` callers so
            // the bare `workspace.add({path})` path (which has no contract about
            // @) preserves jj's native behavior.
            let entries = workspace.list();
            const wsName = input.name ?? (0, node_path_1.basename)(input.path);
            let entry = entries.find((e) => e.path === wsName);
            if (input.baseRef && entry && entry.rev) {
                const autoEmptyId = entry.rev;
                // --repository points at the workspace path so jj operates on THAT
                // workspace's `@`, not the main repo's. cwd matches for consistency
                // with the rest of the adapter's vcsExec discipline.
                const wsFlags = [
                    '--repository', input.path,
                    '--no-pager', '--color', 'never', '--quiet',
                ];
                const editRes = (0, exec_cjs_1.vcsExec)(input.path, 'jj', [
                    ...wsFlags, 'edit', '-r', (0, jj_rev_cjs_1.toJjRev)(input.baseRef),
                ]);
                if (editRes.exitCode !== 0) {
                    throw new Error(`workspace.add baseRef remediation: jj edit failed: ${editRes.stderr || editRes.stdout}`);
                }
                // jj's default behavior auto-abandons empty descriptionless changes
                // when `jj edit` moves @ away from them, so the auto-empty may
                // already be gone. Probe before abandoning to keep the remediation
                // idempotent across jj-version behavior shifts.
                const probeRes = (0, exec_cjs_1.vcsExec)(input.path, 'jj', [
                    ...wsFlags, 'log', '-r', autoEmptyId,
                    '-T', 'change_id ++ "\\n"', '--no-graph', '-n', '1',
                ]);
                if (probeRes.exitCode === 0 && probeRes.stdout.trim()) {
                    const abandonRes = (0, exec_cjs_1.vcsExec)(input.path, 'jj', [
                        ...wsFlags, 'abandon', autoEmptyId,
                    ]);
                    if (abandonRes.exitCode !== 0) {
                        throw new Error(`workspace.add baseRef remediation: jj abandon auto-empty (${autoEmptyId}) failed: ${abandonRes.stderr || abandonRes.stdout}`);
                    }
                }
                // NB: empirically (probe 2026-05-26, jj 0.41) the cross-workspace
                // edit/abandon here does NOT stale main's `jj log` /
                // `jj workspace add` / `jj workspace list` views — those self-sync
                // or simply don't trip jj's stale-WC check for this op shape.
                // performJjParallelFanIn keeps an unconditional update-stale at its
                // entry as the single coverage point for subagent-induced staleness
                // (subagent commits arrive between dispatch and fan-in). No
                // dispatch-loop refresh needed.
                // Re-fetch the entry so the returned `rev` reflects post-remediation
                // state (entry.rev now resolves to baseRef's change_id).
                entries = workspace.list();
                entry = entries.find((e) => e.path === wsName);
            }
            // Return shape parity with git backend (git.ts:453-465): fetch the new
            // workspace's entry from list() rather than re-deriving change_id.
            return entry ?? { path: input.path, rev: '', locked: false };
        },
        forget: (workspaceNameOrPath) => {
            // jj workspace forget takes the workspace NAME (not path). Resolve path → name
            // via list() when the caller hands us a path.
            const entries = workspace.list();
            const matchByName = entries.find((e) => e.path === workspaceNameOrPath);
            const name = matchByName?.path ?? (0, node_path_1.basename)(workspaceNameOrPath);
            // Security (T-04.01-02 mitigate): `--` separator before user-influenced positional.
            const args = jjArgv('workspace', 'forget', '--', name);
            const r = (0, exec_cjs_1.vcsExec)(cwd, 'jj', args);
            if (r.exitCode !== 0) {
                throw new Error(`workspace.forget failed: ${r.stderr || r.stdout}`);
            }
            // PITFALL 3 (RESEARCH): forget does NOT remove the on-disk dir.
            // The caller (typically vcs.workspace.reap()) is responsible for `rm -rf`
            // of the workspace path for the empty-head case. workspace.forget() itself
            // does not remove the directory — that's a separate concern owned by reap().
        },
        /**
         * `vcs.workspace.list()` — parses `jj workspace list -T 'json(self) ++
         * "\n"'` NDJSON via `parseJjWorkspaceList` (production from plan 03-02).
         *
         * On a fresh single-workspace colocated repo this returns a one-element
         * array `[{path: 'default', rev: <12+-char change_id>, locked: false}]`
         * (Phase 8 FLIP-01: `WorkspaceInfo.rev` carries the active backend's
         * canonical revision identifier — `change_id` on jj per D-05).
         * `locked` is always false (jj has no lock primitive — PITFALL 4).
         *
         * Phase 4 reshapes when multi-workspace flows land. Phase 3 just needs
         * the contract-passing single-workspace case for cross-backend parity.
         */
        list: () => {
            const args = jjArgv('workspace', 'list', '-T', 'json(self) ++ "\\n"');
            const r = (0, exec_cjs_1.vcsExec)(cwd, 'jj', args);
            if (r.exitCode !== 0)
                return [];
            return (0, jj_workspace_list_cjs_1.parseJjWorkspaceList)(r.stdout);
        },
        /**
         * `vcs.workspace.context()` — real jj body (VCS-audit fix 2026-07-08;
         * replaces the Phase-3 `{effectiveRoot: cwd, mode: 'main'}` stub whose
         * cwd literal was wrong whenever the adapter was constructed in a
         * SUBDIRECTORY of the workspace — git-base-branch's worktreeInfo and
         * init's nested-subdir detection never fired on jj because of it).
         *
         * - effectiveRoot: `jj workspace root` (resolves correctly from any
         *   subdirectory; empirically verified on jj 0.42). Falls back to cwd
         *   when jj fails (non-repo) — the jj leg stays lenient rather than
         *   adopting the git backend's throw, preserving existing callers'
         *   no-throw expectations on this branch.
         * - isLinked: a secondary jj workspace carries `.jj/repo` as a pointer
         *   FILE (containing the path to the main repo store); the main
         *   workspace has it as a DIRECTORY. Empirically verified on jj 0.42.
         */
        context: () => {
            // Deliberately NOT jjArgv(): the mandatory `--repository <cwd>` pin
            // defeats jj's upward workspace discovery (with -R pointed at a
            // subdirectory, `workspace root` echoes the subdirectory back) — and
            // discovery is exactly what this probe exists for. The remaining
            // mandatory flags are carried verbatim.
            const rootRes = (0, exec_cjs_1.vcsExec)(cwd, 'jj', [
                '--no-pager', '--color', 'never', '--quiet', 'workspace', 'root',
            ]);
            const effectiveRoot = rootRes.exitCode === 0 && rootRes.stdout.trim().length > 0
                ? rootRes.stdout.trim()
                : cwd;
            let isLinked = false;
            try {
                isLinked = (0, node_fs_1.statSync)((0, node_path_1.join)(effectiveRoot, '.jj', 'repo')).isFile();
            }
            catch {
                /* no .jj at root (non-repo fallback) — treat as main */
            }
            return Object.freeze({
                effectiveRoot,
                mode: (isLinked ? 'linked' : 'main'),
                isLinked,
            });
        },
        prune: () => {
            // jj has no `jj workspace prune` subcommand (verified locally on 0.41).
            // The equivalent is `vcs.workspace.reap({...})` (Phase 4 verb) which
            // batches abandon+forget+rm. workspace.prune() returns a documented
            // success no-op for cross-backend surface parity; callers needing
            // actual reap semantics call workspace.reap() instead.
            return { exitCode: 0, stdout: '', stderr: '', timedOut: false, error: null };
        },
        reap: (opts) => {
            // Phase 4 plan 04: delegate to the UPSTREAM-02 sidecar in
            // sdk/src/vcs/jj/reap.ts. Inventory via workspace.list(), filter by
            // phaseNamePrefix (D-04 / #2774 inclusion-filter pattern), resolve
            // workspace-name → on-disk path via the orchestrator-locked layout
            // `.claude/jj-workspaces/<name>` per D-16. If D-18 is ever relaxed,
            // this path-resolution policy moves to a caller-supplied override
            // layer; for now it's encoded inline as the only conformant layout.
            const allEntries = workspace.list();
            const tracked = allEntries
                .filter((e) => e.path.startsWith(opts.phaseNamePrefix))
                .map((e) => ({
                name: e.path,
                headChange: e.rev,
                path: (0, node_path_1.join)(cwd, '.claude/jj-workspaces', e.path),
            }));
            return (0, reap_cjs_1.performJjReap)({
                mainRepoRoot: cwd,
                phaseNamePrefix: opts.phaseNamePrefix,
                phaseDir: opts.phaseDir,
                entries: tracked,
            });
        },
        /**
         * Phase 7 D-01..D-03 (VCS-12): 2-parent merge change via `jj new -r @ -r
         * <branch> -m <message>`. Atomic main-bookmark advance + agent-bookmark
         * delete under acquireJjWriteLock RAII (D-03). SQUASH-06 conflict-return
         * semantics per D-02 — in-tree conflict at @ surfaces { ok: false,
         * conflicted: true } with NO auto-abandon.
         *
         * Order under the lock (matters):
         *   1. `jj new -r @ -r <branch> -m <msg>` — create 2-parent merge change
         *   2. resolve change_id of new @
         *   3. findConflicts({scope:'working-copy'}) — conflict probe ok-path
         *   4. `jj bookmark set <mainBookmark> -r @` — atomic main-advance (D-03)
         *   5. `jj bookmark delete -- <agentBookmark>` — atomic agent cleanup (D-03)
         *
         * A conflicted merge does NOT advance main and the agent bookmark is left
         * alone — caller decides resolution path.
         */
        merge: (opts) => {
            const lockHandle = (0, lock_cjs_1.acquireJjWriteLock)(cwd, { mainRepoRoot: cwd });
            try {
                const branchRev = (0, jj_rev_cjs_1.toJjRev)(opts.branch);
                // 1. Create the 2-parent merge change at @.
                const newRes = (0, exec_cjs_1.vcsExec)(cwd, 'jj', jjArgv('new', '-r', '@', '-r', branchRev, '-m', opts.message), envOpts());
                if (newRes.exitCode !== 0) {
                    return { ok: false, conflicted: false, changeId: null, stderr: newRes.stderr };
                }
                // 2. Resolve the new merge's change_id.
                const idRes = (0, exec_cjs_1.vcsExec)(cwd, 'jj', jjArgv('log', '-r', '@', '-T', 'change_id ++ "\\n"', '--no-graph', '-n', '1'));
                const changeId = idRes.stdout.split('\n').map((s) => s.trim()).find(Boolean) ?? null;
                // 3. D-02: SQUASH-06 conflict-return — probe in-tree conflict at @,
                //    surface, do NOT auto-abandon.
                const conflicts = findConflicts({ scope: 'working-copy' });
                if (conflicts.length > 0) {
                    return { ok: false, conflicted: true, changeId, stderr: '' };
                }
                // 4. D-03 atomic main-advance: point the named main bookmark at the
                //    new merge change (@). Order matters: this MUST land AFTER the
                //    findConflicts ok-path probe and BEFORE the agent-bookmark delete,
                //    so a conflicted merge does NOT advance main and a successful
                //    merge advances main atomically with the agent-bookmark cleanup
                //    under the same RAII lock.
                (0, refs_validator_cjs_1.validateRefname)(opts.mainBookmark);
                const setRes = (0, exec_cjs_1.vcsExec)(cwd, 'jj', jjArgv('bookmark', 'set', opts.mainBookmark, '-r', '@'));
                if (setRes.exitCode !== 0) {
                    return {
                        ok: false,
                        conflicted: false,
                        changeId,
                        stderr: `mainBookmark advance failed: ${setRes.stderr}`,
                    };
                }
                // 5. D-03: atomic agent-bookmark delete (force-style: jj's bookmark
                //    delete is unconditional regardless of D-09 force-flag value).
                if (opts.agentBookmark) {
                    (0, refs_validator_cjs_1.validateRefname)(opts.agentBookmark);
                    const delRes = (0, exec_cjs_1.vcsExec)(cwd, 'jj', jjArgv('bookmark', 'delete', '--', opts.agentBookmark));
                    if (delRes.exitCode !== 0) {
                        return {
                            ok: true,
                            conflicted: false,
                            changeId,
                            stderr: `agentBookmark delete failed: ${delRes.stderr}`,
                        };
                    }
                }
                return { ok: true, conflicted: false, changeId, stderr: '' };
            }
            finally {
                lockHandle.release();
            }
        },
        /**
         * Phase 7 D-08 (VCS-13): composite forget + rm-rf on jj. Pitfall 4: forget
         * MUST run BEFORE rmSync — deleting the on-disk dir first leaves stale
         * metadata in `.jj/op_log` and the workspace_root pointer. Subsequent
         * `workspace.list()` would report a ghost workspace whose path doesn't
         * exist. Order matters.
         *
         * Distinct from `workspace.forget` (Phase 4 metadata-only primitive). The
         * resolve-path-to-name pattern mirrors the existing forget() body at
         * jj.ts:926-942.
         */
        remove: (workspacePathOrName, opts) => {
            const entries = workspace.list();
            const matchByName = entries.find((e) => e.path === workspacePathOrName);
            const name = matchByName?.path ?? (0, node_path_1.basename)(workspacePathOrName);
            // 19-review WR-07: the old "no path traversal because name is either a
            // workspace.list() entry path or a basename" claim was false —
            // basename('..') === '..' would have made the rm-rf target
            // join(cwd, '.claude/jj-workspaces', '..') === cwd/.claude (deleting
            // the whole .claude directory). Reject traversal-shaped and
            // separator-bearing names outright.
            if (name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
                throw new Error(`workspace.remove: invalid workspace name '${name}' (traversal-shaped or contains a path separator)`);
            }
            const layoutRoot = (0, node_path_1.join)(cwd, '.claude/jj-workspaces');
            const onDiskPath = (0, node_path_1.join)(layoutRoot, name);
            // Containment check (defense-in-depth): the resolved rm-rf target MUST
            // sit strictly inside the D-16 layout root.
            const resolvedTarget = (0, node_path_1.resolve)(onDiskPath);
            if (!resolvedTarget.startsWith((0, node_path_1.resolve)(layoutRoot) + node_path_1.sep)) {
                throw new Error(`workspace.remove: refusing rm -rf outside the .claude/jj-workspaces layout (resolved '${resolvedTarget}')`);
            }
            // 19-review WR-07 (b): when the caller passed a real on-disk PATH (not
            // a workspace name) that does not resolve into the D-16 layout, the old
            // code silently rm-rf'd the same-named directory UNDER the layout while
            // the actual workspace dir survived. Refuse to guess instead.
            const looksLikePath = workspacePathOrName.includes('/') || workspacePathOrName.includes('\\');
            if (!matchByName && looksLikePath && (0, node_path_1.resolve)(cwd, workspacePathOrName) !== resolvedTarget) {
                throw new Error(`workspace.remove: '${workspacePathOrName}' is not a known workspace name and does not ` +
                    `resolve into the .claude/jj-workspaces/<name> layout — refusing to guess an rm -rf target`);
            }
            // 1. forget metadata first (Pitfall 4 order). Security (T-07.01-03):
            //    `--` separator before user-influenced positional.
            const args = jjArgv('workspace', 'forget', '--', name);
            const r = (0, exec_cjs_1.vcsExec)(cwd, 'jj', args);
            if (r.exitCode !== 0 && !opts?.force) {
                throw new Error(`workspace.remove forget failed: ${r.stderr || r.stdout}`);
            }
            // 2. rm -rf the on-disk dir, constrained to the validated
            //    .claude/jj-workspaces/<name> layout target (D-16).
            (0, node_fs_1.rmSync)(onDiskPath, { recursive: true, force: true });
        },
        // Phase 9 (VCS-16, PARALLEL-01/02): cross-backend parallel namespace.
        // Delegates to UPSTREAM-02 sidecar in sdk/src/vcs/jj/parallel.ts.
        //
        // Phase 15.04 (PARALLEL-07): `cancel` added as third entry. CF-05
        // STACK-lens — synchronous teardown only (spawnSync at exec.ts:19 cannot
        // accept AbortSignal); per-workspace teardown delegates to the
        // `cleanupSubagentWorkspaces` helper sidecar at jj/workspace-cleanup.ts.
        parallel: Object.freeze({
            dispatch: (opts) => (0, parallel_cjs_1.performJjParallelDispatch)({ mainRepoRoot: cwd, vcs: { workspace }, ...opts }),
            fanIn: (handle, results) => (0, parallel_cjs_1.performJjParallelFanIn)(cwd, handle, results),
            cancel: (handle) => (0, parallel_cjs_1.performJjParallelCancel)(cwd, handle),
        }),
    });
    /**
     * vcs.acquireWriteLock(workspace, opts?) — Phase 4 plan 03 wiring.
     * Delegates to sdk/src/vcs/jj/lock.ts::acquireJjWriteLock (UPSTREAM-02 sidecar).
     *
     * Pitfall 9 (RESEARCH): the stale-WC probe inside acquireJjWriteLock must run
     * against the MAIN repo root (not the locked workspace) to avoid auto-snapshot
     * recursion. The adapter passes its own `cwd` as `mainRepoRoot` — orchestrator
     * callers should construct this jj adapter at the main repo path before
     * invoking acquireWriteLock on a subagent workspace path. When `cwd ===
     * workspace`, the probe runs against the same repo (safe — no recursion
     * because acquireWriteLock does not fire hooks; see Pitfall 9 second half).
     */
    const acquireWriteLock = (workspace, opts) => {
        return (0, lock_cjs_1.acquireJjWriteLock)(workspace, {
            timeout: opts?.timeout,
            mainRepoRoot: cwd,
        });
    };
    // ─── test-only snapshot/restore (plan 03-02) ───────────────────────────
    // RESEARCH §`[__vcsTestOnly]`: `jj op log` ids are stable snapshots of
    // the entire repo state. `jj op restore <id>` rewinds the workspace to
    // exactly that operation, which is cleaner than git's hard-reset +
    // clean -fdx strategy. D-05 still applies: no `--ignore-working-copy`.
    // (19-07 cosmetic reword: the AUDIT-01 acceptance asserts the literal
    // destructive-reset token is absent from src/*.cts, comments included.)
    const testOnly = Object.freeze({
        snapshot: () => {
            const args = jjArgv('op', 'log', '--no-graph', '-T', 'id ++ "\\n"', '-n', '1');
            const r = (0, exec_cjs_1.vcsExec)(cwd, 'jj', args);
            if (r.exitCode !== 0) {
                throw new exec_cjs_1.VcsExecError(`__vcsTestOnly.snapshot: ${r.stderr || r.stdout}`, {
                    exitCode: r.exitCode,
                    stdout: r.stdout,
                    stderr: r.stderr,
                    timedOut: r.timedOut,
                    args,
                });
            }
            const id = r.stdout.split('\n').filter(Boolean)[0] ?? '';
            if (!id) {
                throw new Error('__vcsTestOnly.snapshot: jj op log returned empty id');
            }
            return { id, kind: 'jj' };
        },
        restore: (handle) => {
            if (handle.kind !== 'jj') {
                throw new Error(`__vcsTestOnly.restore: handle kind mismatch (got ${handle.kind}, expected jj)`);
            }
            const args = jjArgv('op', 'restore', handle.id);
            const r = (0, exec_cjs_1.vcsExec)(cwd, 'jj', args);
            if (r.exitCode !== 0) {
                throw new exec_cjs_1.VcsExecError(`__vcsTestOnly.restore: ${r.stderr || r.stdout}`, {
                    exitCode: r.exitCode,
                    stdout: r.stdout,
                    stderr: r.stderr,
                    timedOut: r.timedOut,
                    args,
                });
            }
            // Q4 (RESEARCH): jj op restore rewinds the jj op-log state but does
            // NOT necessarily delete untracked disk files materialized after the
            // snapshot. The integration test in __tests__/jj-snapshot-restore.test.ts
            // documents the observed behavior; if plan 03-07 wrap-up reveals a
            // cleanup gap, a follow-up `jj st`-driven removal lands here.
            //
            // IN-05 — caller responsibility: contract-suite tests that
            // assert on `vcs.status()` after a `restore()` are sensitive to
            // prior-test untracked-file residue (e.g., an `A untracked.txt`
            // entry surfaces from a file materialized in the previous test
            // and not deleted by op-restore). Authors of such tests must
            // either: (a) delete the file via fs.unlinkSync before
            // assertion, (b) seed and restore from a snapshot taken AFTER
            // the suspect file was materialized, or (c) phrase the
            // assertion to tolerate the residue. Phase 4 may add an
            // opt-in `restore({clean: true})` once the orchestrator has a
            // real caller need.
        },
    });
    // All parser imports are now actively consumed: `parseJjLog` by `log()`
    // (plan 03-05) and `findConflicts()`, `parseJjWorkspaceList` by
    // `workspace.list()` (this plan 03-06), `parseJjBookmarkRecord` by
    // `bookmarks.list()` (plan 03-03). The prior `void parseJjWorkspaceList`
    // unused-import shim is gone.
    return Object.freeze({
        kind: 'jj',
        cwd,
        commit,
        log,
        status,
        diff,
        refs,
        workspace,
        findConflicts,
        push,
        fetch,
        acquireWriteLock,
        [types_cjs_1.__vcsTestOnly]: testOnly,
    });
}
