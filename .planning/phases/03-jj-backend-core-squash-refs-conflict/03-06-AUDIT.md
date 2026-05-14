# 03-06-AUDIT.md — opts.ref on jj `fetch()` (T-03.06-02 mitigation)

**Phase:** 03-jj-backend-core-squash-refs-conflict
**Plan:** 06 (push/fetch + workspace.list/context + TEST-08 triage)
**Threat:** T-03.06-02 (Information disclosure: fetch silently ignoring opts.ref)
**Status:** CLEAN — no jj-reachable caller passes `opts.ref` to `vcs.fetch()`.

## Audit Command

```bash
grep -rn "\.fetch(.*ref" sdk/src bin/lib get-shit-done/bin/lib 2>/dev/null | grep -v "__tests__"
# (empty)

grep -rn "vcs\.fetch\|\.fetch(" sdk/src bin/lib get-shit-done/bin/lib 2>/dev/null \
  | grep -v "__tests__" | grep -v "\.test\."
# sdk/src/vcs/backends/jj.ts:483:   * `vcs.fetch(opts)` — wraps `jj git fetch`.
# (only the JSDoc reference inside the adapter itself; zero production callers)
```

## Findings

There are **zero** production callers of `vcs.fetch()` anywhere in the SDK
(`sdk/src/`), the CJS shim (`bin/lib/`), or the upstream `get-shit-done/bin/lib/`
tree. `vcs.fetch` is a forward-complete adapter surface from Phase 1 —
declared and implemented for cross-backend parity, but no Phase 1/2/2.1/3
caller actually invokes it.

Consequently, the `opts.ref` field on `FetchOpts` has **no jj-reachable
caller**. The Phase 3 jj-backend `fetch()` body treats `opts.ref` as a
documented no-op (RESEARCH §`fetch` A6 — jj has no per-ref selectivity in
the git-style sense; `jj git fetch --branch` is a glob filter, not a
per-ref selector). This is safe in Phase 3 because no caller is exercising
the no-op path.

Should a Phase 4+ caller emerge that needs per-ref fetch selectivity on
the jj backend, the options are:

1. Map `opts.ref` to `jj git fetch --branch <glob>` (literal name as the
   glob), accepting the semantic widening from "ref" to "bookmark glob."
2. Throw `VcsNotImplementedError` on jj when `opts.ref` is set, forcing
   the caller to narrow on `vcs.kind === 'git'`.
3. Keep the documented no-op and add a JSDoc warning so callers are aware
   their `opts.ref` is silently dropped on jj.

Phase 3 picks **option 3** because (a) it preserves cross-backend parity
without adding a typed error class for an unused code path, and (b) the
audit confirms no caller is exercising the silently-dropped behavior.

## Conclusion

T-03.06-02 mitigation is in effect: the silent-no-op `opts.ref` on jj
fetch cannot disclose anything because nothing is asking it to do
anything. Re-audit at every Phase-4+ plan that adds a `vcs.fetch` call
site.
