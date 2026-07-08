"use strict";
/**
 * Backend matrix constants and GSD_TEST_BACKENDS env parser.
 * D-15: TS source of truth; tests/helpers.cjs require()s the compiled
 * dist-cjs/vcs/backends.js.
 *
 * RESEARCH Open Q5: BACKENDS_DECLARED has all three keys (TEST-03);
 * BACKENDS_AVAILABLE is the subset with a real impl. Phase 1: AVAILABLE = ['git'];
 * Phase 3 adds 'jj-colocated' and 'jj-native'.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BACKENDS_AVAILABLE_FOR_VERB = exports.BACKENDS_AVAILABLE = exports.BACKENDS_DECLARED = void 0;
exports.parseBackendsEnv = parseBackendsEnv;
exports.BACKENDS_DECLARED = Object.freeze([
    'git',
    'jj-colocated',
    'jj-native',
]);
exports.BACKENDS_AVAILABLE = Object.freeze([
    'git',
    'jj-colocated',
    'jj-native',
]);
/**
 * Phase 3 D-12: per-verb allowlist for backend availability. Maps each
 * JjVcsAdapter contract verb to the set of backends where it is implemented.
 * The contract-test fixture (`vcs-fixture.ts::makeBackendFixture` +
 * `vcsTest(kind)` consumers) consults this map and THROWS
 * (`VcsNotImplementedError`) — not skips — when a verb isn't yet implemented
 * on the target backend. Skip-not-throw is rejected because TEST-06's
 * skip-count guard would silently mask drift.
 *
 * Plan 03-01 seeds every entry with `['git']` only. Verb-group plans
 * (03-03..03-06) flip entries to include `'jj-colocated'` as their bodies
 * land. Phase 5 deletes this map entirely when CI-01 graduates the
 * jj-colocated lane from allow-failure to required-blocking.
 *
 * Verb key shape: dot-separated path on the adapter (e.g.,
 * `'refs.bookmarks.create'`). Cross-backend verbs only — gitOnly verbs are
 * statically narrowed via `vcs.kind === 'git'` and not gated here.
 */
exports.BACKENDS_AVAILABLE_FOR_VERB = Object.freeze({
    // VcsAdapterCommon top-level verbs
    // Phase 3 plan 03-04 flipped `commit` to admit 'jj-colocated' — the
    // squash-based commit body (SQUASH-01..07) + bookmark advance (D-01/D-04)
    // + JJ-07 env propagation now live in backends/jj.ts.
    commit: Object.freeze(['git', 'jj-colocated']),
    // Phase 3 plan 03-05 Task 1 flipped log/status/diff to admit 'jj-colocated':
    // log delegates to parseJjLog (plan 03-02); status hand-parses `jj status`
    // human-readable output (per RESEARCH §status()); diff wraps `jj diff` +
    // `--summary` parser. opts.staged is a documented no-op on jj (no index).
    log: Object.freeze(['git', 'jj-colocated']),
    status: Object.freeze(['git', 'jj-colocated']),
    diff: Object.freeze(['git', 'jj-colocated']),
    // Phase 3 plan 03-05 Task 2 flipped findConflicts to admit 'jj-colocated':
    // uses jj's `conflicts()` PLURAL revset (RESEARCH Q1 correction;
    // CONTEXT/REQUIREMENTS/ROADMAP still say singular `conflict()`, doc-fix
    // deferred to plan 03-07 wrap-up). Path enumeration via `jj resolve --list
    // -r <rev>` (primary, empirically verified on jj 0.41) with `jj diff
    // --summary` fallback.
    findConflicts: Object.freeze(['git', 'jj-colocated']),
    // Phase 3 plan 03-06 Task 1 flipped push/fetch to admit 'jj-colocated':
    // push wraps `jj git push` (--remote / --bookmark mapped from opts; opts.force
    // is a documented no-op because jj's default push IS already force-with-lease
    // semantics, empirically verified on jj 0.41 — see 03-06-SUMMARY.md);
    // fetch wraps `jj git fetch` (--remote mapped; opts.ref is a documented
    // no-op per RESEARCH A6, audit-confirmed no jj-reachable caller).
    push: Object.freeze(['git', 'jj-colocated']),
    fetch: Object.freeze(['git', 'jj-colocated']),
    // VcsRefs — plan 03-03 flipped every verb with a real body to admit
    // 'jj-colocated'. `refs.isIgnored` stays git-only: the single production
    // caller pins `kind:'git'` (see 03-03-AUDIT.md), and the jj backend
    // throws `VcsNotImplementedError`.
    'refs.currentBookmarks': Object.freeze(['git', 'jj-colocated']),
    'refs.resolveShort': Object.freeze(['git', 'jj-colocated']),
    'refs.countCommits': Object.freeze(['git', 'jj-colocated']),
    'refs.rootRevisions': Object.freeze(['git', 'jj-colocated']),
    // Phase 15.02 (VCS-21): per-backend canonical id alphabet substring.
    // Capability matrix string-key add — TSC does NOT catch object-key
    // omissions on the runtime lookup path; backends.test.ts regression-asserts
    // presence (Pitfall 1 / Pitfall 3 mitigation per v1.2 retro CR-01 precedent).
    'refs.idAlphabet': Object.freeze(['git', 'jj-colocated']),
    // Phase 15.03 (VCS-22): alphabet-aware short-prefix matcher. Throws on
    // wrong-alphabet (Pitfall 6 — silent-false would mask caller bugs) and on
    // empty prefix. Capability matrix string-key add — TSC blind on object-key
    // lookup; backends.test.ts regression-asserts presence.
    'refs.matchPrefix': Object.freeze(['git', 'jj-colocated']),
    'refs.exists': Object.freeze(['git', 'jj-colocated']),
    'refs.isIgnored': Object.freeze(['git']), // jj-side: VcsNotImplementedError (audit-confirmed no jj caller)
    'refs.remotes': Object.freeze(['git', 'jj-colocated']),
    // 19-12 next-merge port (cmdPrSubrepo): read-only remote-URL probe on both
    // backends (git: remote get-url; jj: templated `jj git remote list`).
    // Capability matrix string-key add — TSC does NOT catch object-key
    // omissions on the runtime lookup path; backends.test.ts regression-asserts
    // presence (Pitfall 1 / Pitfall 3 mitigation per v1.2 retro CR-01 precedent).
    'refs.remoteUrl': Object.freeze(['git', 'jj-colocated']),
    // VcsBookmarks — plan 03-03 flipped every mutator + list to admit
    // 'jj-colocated'. `refs.bookmarks.switch` stays git-only: the jj backend
    // throws `VcsNotImplementedError`. The original rationale ("both production
    // callers pin kind:'git'") expired when 19-07 removed the pin from
    // cmdCommit's branching block; the live guard is now the explicit
    // `branchVcs.kind === 'git'` narrowing in src/commands.cts cmdCommit
    // (19-review CR-01) — on jj, bookmark-less `@` is first-class and the
    // pre-commit branch switch is intentionally skipped.
    'refs.bookmarks.list': Object.freeze(['git', 'jj-colocated']),
    'refs.bookmarks.create': Object.freeze(['git', 'jj-colocated']),
    'refs.bookmarks.move': Object.freeze(['git', 'jj-colocated']),
    'refs.bookmarks.delete': Object.freeze(['git', 'jj-colocated']),
    'refs.bookmarks.exists': Object.freeze(['git', 'jj-colocated']),
    'refs.bookmarks.switch': Object.freeze(['git']), // jj-side: VcsNotImplementedError (audit-confirmed no jj caller)
    // Phase 4 plan 01 shape commit: workspace.{add,forget,list,context,prune} bodies
    // landed on jj backend (real bodies in jj.ts replace the Phase 3
    // VcsNotImplementedError stubs). Per-verb allowlist admits 'jj-colocated' and
    // 'jj-native'. Plan 04 ships workspace.reap real body; that verb's flip happens
    // there. acquireWriteLock real body lands plan 03; flip happens there.
    'workspace.add': Object.freeze(['git', 'jj-colocated', 'jj-native']),
    'workspace.forget': Object.freeze(['git', 'jj-colocated', 'jj-native']),
    'workspace.list': Object.freeze(['git', 'jj-colocated', 'jj-native']),
    'workspace.context': Object.freeze(['git', 'jj-colocated', 'jj-native']),
    'workspace.prune': Object.freeze(['git', 'jj-colocated', 'jj-native']),
    // Phase 4 plan 04 (WS-11/WS-12): workspace.reap real bodies landed on
    // both backends. jj-side lives in sdk/src/vcs/jj/reap.ts (UPSTREAM-02
    // sidecar) with the corrected `jj diff --from <parent> --to <head> -s`
    // empty-tree probe; git-side mirrors via a `git worktree remove` loop.
    'workspace.reap': Object.freeze(['git', 'jj-colocated', 'jj-native']),
    // Phase 4 plan 03 (D-19): per-workspace flock primitive landed in
    // sdk/src/vcs/jj/lock.ts. Allowlist admits both jj backends now that contract
    // tests pass on each.
    'acquireWriteLock': Object.freeze(['git', 'jj-colocated', 'jj-native']),
    // Phase 7 plan 07-01 (VCS-08..VCS-15): 8 new verbs land on both backends.
    // currentBookmarksIn: scoped current-branch probe (D-04).
    // mergeBase: git merge-base / jj fork_point() (D-05).
    // readBlob: git show <rev>:<path> / jj file show (planner fold-in VCS-15).
    // diff.diffFilter: typed enum on cross-backend surface (D-06).
    // status.cwd: scoped variant (D-07).
    // workspace.merge: 2-parent merge + atomic main-advance + agent-delete (D-01..D-03).
    // workspace.remove: composite forget+rm-rf on jj; worktree remove --force on git (D-08).
    // bookmarks.delete.force: extend opts with force (D-09); jj force is documented no-op.
    'refs.currentBookmarksIn': Object.freeze(['git', 'jj-colocated']),
    'refs.mergeBase': Object.freeze(['git', 'jj-colocated']),
    'refs.readBlob': Object.freeze(['git', 'jj-colocated']),
    'diff.diffFilter': Object.freeze(['git', 'jj-colocated']),
    'status.cwd': Object.freeze(['git', 'jj-colocated']),
    'workspace.merge': Object.freeze(['git', 'jj-colocated']),
    'workspace.remove': Object.freeze(['git', 'jj-colocated']),
    // Phase 15.04 (PARALLEL-07): synchronous teardown of materialized subagent
    // workspaces (CF-05 STACK-lens — `spawnSync` cannot accept `AbortSignal`).
    // Capability matrix string-key add — TSC does NOT catch object-key omissions
    // on the runtime lookup path (Pitfall 1 / Pitfall 3 / v1.2 retro CR-01
    // precedent); backends.test.ts regression-asserts presence.
    'workspace.parallel.cancel': Object.freeze(['git', 'jj-colocated']),
    'refs.bookmarks.delete.force': Object.freeze(['git', 'jj-colocated']),
    // Test-only snapshot/restore (gated separately so per-test fixture
    // setup can probe verb availability before invoking them — see
    // sdk/src/vcs/__tests__/vcs-fixture.ts). Phase 3 plan 03-02 flipped both
    // entries to include 'jj-colocated' once the real `jj op log`/
    // `jj op restore`-backed body landed in backends/jj.ts. This unlocks
    // the contract-test fixture lane for jj-colocated, enabling per-test
    // hermetic state rewind for verb-group plans 03-03..03-06.
    '__vcsTestOnly.snapshot': Object.freeze(['git', 'jj-colocated']),
    '__vcsTestOnly.restore': Object.freeze(['git', 'jj-colocated']),
});
/**
 * Parse GSD_TEST_BACKENDS into a structured record. B-4: consumers MUST inspect
 * `unavailable.length` and warn (or fail under CI) when the user requested specific
 * backends but none are available — silently exiting 0 with zero tests run violates
 * the spirit of TEST-03/TEST-04.
 *
 * Empty/undefined env → run all available; `requested` stays empty so callers know
 * the user did not ask for filtering.
 */
function parseBackendsEnv(envValue) {
    if (envValue === undefined || envValue === '') {
        return { available: [...exports.BACKENDS_AVAILABLE], requested: [], unavailable: [] };
    }
    const requested = envValue
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    const isAvailable = (k) => exports.BACKENDS_AVAILABLE.includes(k);
    const available = requested.filter(isAvailable);
    const unavailable = requested.filter((k) => !isAvailable(k));
    return { available, requested, unavailable };
}
