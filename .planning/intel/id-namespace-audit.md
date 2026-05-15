# Id Namespace Audit — Phase 8 (D-01)

**Generated:** 2026-05-15
**Total findings:** 101
**Verdict counts:** safe=13, flip-clean=30, needs-rename=43, needs-resolveShort=7, boundary-io=2, historical-prose=6, unclear=0
**Risk 4 (jj 0.41 NDJSON schema):** see `.planning/intel/jj-041-ndjson-probe.md` — VERIFIED GREEN.

## Verdict legend

- `safe` — no flip needed; already correct (git-only fixtures, git-side data constants, allowlist data values)
- `flip-clean` — straightforward rename or template flip (jj backend templates, parser reads, type-driven consumer renames)
- `needs-rename` — type-level rename (e.g., `LogEntry.hash` → `LogEntry.id`) plus test assertion upgrade to `toBeIdOf`
- `needs-resolveShort` — `.slice(0, 7|8|12)` site that should use `vcs.refs.resolveShort()`
- `boundary-io` — legitimate backend-private `commit_id` access (LINT-03 conditional driver)
- `historical-prose` — doc comments / prose references that update as the code evolves; grandfathered for AUDIT-04 scope
- `unclear` — needs investigation (should be 0 at Plan 1 close per RESEARCH Open Q3)

## Findings

| # | File:line | Pattern | Caller use | Verdict | Notes |
|---|-----------|---------|------------|---------|-------|
| 1 | `sdk/src/query/commit.test.ts:170` | `hash_field_access` | `expect((result.data as { hash: string }).hash).toBeTruthy();` | needs-rename | Plan 2 FLIP-03: result.hash → result.id; test upgrade to toBeIdOf. |
| 2 | `sdk/src/query/commit.test.ts:182` | `hash_field_access` | `expect((result.data as { hash: string }).hash).toBeTruthy();` | needs-rename | Plan 2 FLIP-03: result.hash → result.id; test upgrade to toBeIdOf. |
| 3 | `sdk/src/query/log.ts:7` | `short_slice` | `* from `hash.slice(0,7) + ' ' + subject` per the Phase 2 CR-02 narrowing.` | historical-prose | Plan 2 FLIP-02: JSDoc prose mentioning hash.slice(0,7) — will be updated to use vcs.refs.resolveShort. |
| 4 | `sdk/src/query/log.ts:72` | `hash_field_access` | `return expr.rev(entries[n].hash);` | flip-clean | Plan 2 FLIP-02: entries[n].hash → entries[n].id. |
| 5 | `sdk/src/query/mutation-event-mapper.ts:68` | `hash_field_access` | `hash: (data?.hash as string) ?? null,` | needs-rename | Plan 2 FLIP-03 + deferred fold-in: event-type field hash → id rename for CommitResult consistency. |
| 6 | `sdk/src/query/verify.ts:683` | `hash_field_access` | `.map((e) => `${(e.hash \|\| '').slice(0, 7)} ${e.subject \|\| ''}`)` | needs-resolveShort | Plan 2 FLIP-02: (e.hash || "").slice(0, 7) — semantic intent is short display; should use vcs.refs.resolveShort. |
| 7 | `sdk/src/query-raw-output-projection.ts:23` | `hash_field_access` | `return d.hash != null ? String(d.hash) : 'committed';` | flip-clean | Plan 2 FLIP-02: d.hash → d.id rename. |
| 8 | `sdk/src/vcs/__tests__/adapter-contract.test.ts:43` | `hash_field_access` | `expect(r.hash).toMatch(/^[0-9a-f]+$/);` | needs-rename | Plan 2 FLIP-02 + TEST-12: r.hash / entries[0].hash → .id; toMatch(/[0-9a-f]+/) → toBeIdOf("git"). |
| 9 | `sdk/src/vcs/__tests__/adapter-contract.test.ts:51` | `hash_field_access` | `expect(entries[0].hash).toMatch(/^[0-9a-f]+$/);` | needs-rename | Plan 2 FLIP-02 + TEST-12: r.hash / entries[0].hash → .id; toMatch(/[0-9a-f]+/) → toBeIdOf("git"). |
| 10 | `sdk/src/vcs/__tests__/adapter-contract.test.ts:163` | `40_char_hex_literal` | `expect(vcs.refs.exists(expr.rev('ffffffffffffffffffffffffffffffffffffffff'))).toBe(false);` | safe | Adapter-contract test: hex literal is git fixture (ffff...f for "does not exist" check). |
| 11 | `sdk/src/vcs/__tests__/baseline-parity.test.ts:488` | `40_char_hex_literal` | `const bogus = vcs.refs.exists(expr.rev('0123456789abcdef0123456789abcdef01234567'));` | safe | Baseline-parity test: bogus hex for git-only "exists" probe. |
| 12 | `sdk/src/vcs/__tests__/baseline-parity.test.ts:508` | `hash_field_access` | `.map((e) => `${(e.hash \|\| '').slice(0, 7)} ${e.subject \|\| ''}`)` | needs-resolveShort | Plan 2 FLIP-02 + TEST-12: e.hash.slice(0,7) → vcs.refs.resolveShort. |
| 13 | `sdk/src/vcs/__tests__/cmd-discuss-phase-jj.test.ts:68` | `hash_field_access` | `expect(r.hash).toBeTruthy();` | needs-rename | Plan 2 FLIP-02 + TEST-12: r.hash → r.id; assertions upgrade to toBeIdOf. |
| 14 | `sdk/src/vcs/__tests__/cmd-import-jj.test.ts:114` | `hash_field_access` | `expect(r.hash).toBeTruthy();` | needs-rename | Plan 2 FLIP-02 + TEST-12: r.hash → r.id; assertions upgrade to toBeIdOf. |
| 15 | `sdk/src/vcs/__tests__/cmd-ingest-docs-jj.test.ts:98` | `hash_field_access` | `expect(r.hash).toBeTruthy();` | needs-rename | Plan 2 FLIP-02 + TEST-12: r.hash → r.id; assertions upgrade to toBeIdOf. |
| 16 | `sdk/src/vcs/__tests__/cmd-map-codebase-jj.test.ts:91` | `hash_field_access` | `expect(r.hash).toBeTruthy();` | needs-rename | Plan 2 FLIP-02 + TEST-12: r.hash → r.id; assertions upgrade to toBeIdOf. |
| 17 | `sdk/src/vcs/__tests__/cmd-new-project-jj.test.ts:84` | `hash_field_access` | `expect(r.hash).toBeTruthy();` | needs-rename | Plan 2 FLIP-02 + TEST-12: r.hash → r.id; assertions upgrade to toBeIdOf. |
| 18 | `sdk/src/vcs/__tests__/cmd-pause-work-jj.test.ts:77` | `hash_field_access` | `expect(r.hash).toBeTruthy();` | needs-rename | Plan 2 FLIP-02 + TEST-12: r.hash → r.id; assertions upgrade to toBeIdOf. |
| 19 | `sdk/src/vcs/__tests__/expr.test.ts:97` | `40_char_hex_literal` | `const SHA = 'abc1234deadbeef000000000000000000000aaaa';` | safe | expr.test.ts: SHA constant is a git fixture for expr.rev acceptance test. |
| 20 | `sdk/src/vcs/__tests__/git-backend.test.ts:51` | `hash_field_access` | `expect(r.hash).toBeTruthy();` | needs-rename | Plan 2 FLIP-02 + TEST-12: r.hash → r.id; assertions upgrade to toBeIdOf("git"). |
| 21 | `sdk/src/vcs/__tests__/git-backend.test.ts:53` | `hash_field_access` | `expect(r.hash).toBe(headHash);` | needs-rename | Plan 2 FLIP-02 + TEST-12: r.hash → r.id; assertions upgrade to toBeIdOf("git"). |
| 22 | `sdk/src/vcs/__tests__/git-backend.test.ts:66` | `hash_field_access` | `expect(r.hash).toBeTruthy();` | needs-rename | Plan 2 FLIP-02 + TEST-12: r.hash → r.id; assertions upgrade to toBeIdOf("git"). |
| 23 | `sdk/src/vcs/__tests__/git-backend.test.ts:89` | `hash_field_access` | `expect(r.hash).toBeTruthy();` | needs-rename | Plan 2 FLIP-02 + TEST-12: r.hash → r.id; assertions upgrade to toBeIdOf("git"). |
| 24 | `sdk/src/vcs/__tests__/git-backend.test.ts:108` | `hash_field_access` | `expect(entries[0].hash).toBe(headHash);` | needs-rename | Plan 2 FLIP-02 + TEST-12: r.hash → r.id; assertions upgrade to toBeIdOf("git"). |
| 25 | `sdk/src/vcs/__tests__/git-backend.test.ts:421` | `hex_regex` | `expect(roots[0]).toMatch(/^[0-9a-f]{40}$/);` | safe | git-backend.test.ts: hex regex on rootCommits result — git-only test. |
| 26 | `sdk/src/vcs/__tests__/jj-commit.test.ts:83` | `hash_field_access` | `expect(r.hash).toBeTruthy();` | needs-rename | Plan 2 FLIP-02 + TEST-12: r.hash → r.id; assertions upgrade to toBeIdOf("jj"). |
| 27 | `sdk/src/vcs/__tests__/jj-commit.test.ts:84` | `hash_field_access` | `expect(r.hash).toMatch(/^[a-f0-9]{40}$/);` | needs-rename | Plan 2 FLIP-02 + TEST-12: r.hash → r.id; assertions upgrade to toBeIdOf("jj"). |
| 28 | `sdk/src/vcs/__tests__/jj-commit.test.ts:86` | `literal_commit_id` | `expect(jjT('@-', 'commit_id')).toBe(r.hash);` | flip-clean | Plan 2 FLIP-02 + TEST-12: test must update jjT template + r.hash → r.id. |
| 29 | `sdk/src/vcs/__tests__/jj-commit.test.ts:94` | `hash_field_access` | `expect(r.hash).toBeTruthy();` | needs-rename | Plan 2 FLIP-02 + TEST-12: r.hash → r.id; assertions upgrade to toBeIdOf("jj"). |
| 30 | `sdk/src/vcs/__tests__/jj-commit.test.ts:130` | `hash_field_access` | `expect(r.hash).toBeTruthy();` | needs-rename | Plan 2 FLIP-02 + TEST-12: r.hash → r.id; assertions upgrade to toBeIdOf("jj"). |
| 31 | `sdk/src/vcs/__tests__/jj-commit.test.ts:143` | `field_access` | ``jj --repository ${JSON.stringify(dir)} --no-pager --color never --quiet bookmark list 'gsd/phase-3' -T 'normal_target.commit_id() ++ "\\n"'`,` | flip-clean | Plan 2 FLIP-02 + TEST-12: bookmark list test template normal_target.commit_id() → normal_target.change_id(). |
| 32 | `sdk/src/vcs/__tests__/jj-commit.test.ts:146` | `hash_field_access` | `expect(target).toBe(r.hash);` | needs-rename | Plan 2 FLIP-02 + TEST-12: r.hash → r.id; assertions upgrade to toBeIdOf("jj"). |
| 33 | `sdk/src/vcs/__tests__/jj-commit.test.ts:158` | `field_access` | ``jj --repository ${JSON.stringify(dir)} --no-pager --color never --quiet bookmark list 'rawname' -T 'normal_target.commit_id() ++ "\\n"'`,` | flip-clean | Plan 2 FLIP-02 + TEST-12: bookmark list test template normal_target.commit_id() → normal_target.change_id(). |
| 34 | `sdk/src/vcs/__tests__/jj-commit.test.ts:161` | `hash_field_access` | `expect(target).toBe(r.hash);` | needs-rename | Plan 2 FLIP-02 + TEST-12: r.hash → r.id; assertions upgrade to toBeIdOf("jj"). |
| 35 | `sdk/src/vcs/__tests__/jj-hooks.test.ts:140` | `hash_field_access` | `expect(r.hash).toBeTruthy();` | needs-rename | Plan 2 FLIP-02 + TEST-12: r.hash → r.id; toBeTruthy → toBeIdOf("jj"). |
| 36 | `sdk/src/vcs/__tests__/jj-id-alphabet-probe.test.ts:6` | `hex_regex` | `* disjointness of git-SHA regex /[0-9a-f]{7,40}/ vs jj-change-id regex` | historical-prose | jj-id-alphabet-probe: regex is in DOC COMMENT explaining alphabet disjointness; intentional. |
| 37 | `sdk/src/vcs/__tests__/jj-parsers.test.ts:49` | `hash_field_access` | `expect(first.hash).toBe('2f5d3b9b1c0d4e5f6a7b8c9d0e1f2a3b4c5d6e7f');` | needs-rename | Plan 2 FLIP-02 + TEST-12: first.hash / entries[0].hash → .id; toBe(40-hex) → toBeIdOf. |
| 38 | `sdk/src/vcs/__tests__/jj-parsers.test.ts:53` | `40_char_hex_literal` | `expect(first.parents).toEqual(['1111111111111111111111111111111111111111']);` | flip-clean | Plan 2 FLIP-01: NDJSON parser test fixtures will use change_id form after parser flips. |
| 39 | `sdk/src/vcs/__tests__/jj-parsers.test.ts:78` | `hash_field_access` | `expect(entries[0]!.hash).toBe('deadbeef00000000000000000000000000000000');` | needs-rename | Plan 2 FLIP-02 + TEST-12: first.hash / entries[0].hash → .id; toBe(40-hex) → toBeIdOf. |
| 40 | `sdk/src/vcs/__tests__/jj-parsers.test.ts:82` | `literal_commit_id` | `expect(() => parseJjLog('{"commit_id":"abc",not-valid-json')).toThrow(` | flip-clean | Plan 2 FLIP-01: parseJjLog malformed-input fixture should use change_id key. |
| 41 | `sdk/src/vcs/__tests__/jj-parsers.test.ts:94` | `40_char_hex_literal` | `"hash": "2f5d3b9b1c0d4e5f6a7b8c9d0e1f2a3b4c5d6e7f",` | flip-clean | Plan 2 FLIP-01: NDJSON parser test fixtures will use change_id form after parser flips. |
| 42 | `sdk/src/vcs/__tests__/jj-parsers.test.ts:96` | `40_char_hex_literal` | `"1111111111111111111111111111111111111111",` | flip-clean | Plan 2 FLIP-01: NDJSON parser test fixtures will use change_id form after parser flips. |
| 43 | `sdk/src/vcs/__tests__/jj-parsers.test.ts:105` | `40_char_hex_literal` | `"hash": "1111111111111111111111111111111111111111",` | flip-clean | Plan 2 FLIP-01: NDJSON parser test fixtures will use change_id form after parser flips. |
| 44 | `sdk/src/vcs/__tests__/jj-parsers.test.ts:107` | `40_char_hex_literal` | `"2222222222222222222222222222222222222222",` | flip-clean | Plan 2 FLIP-01: NDJSON parser test fixtures will use change_id form after parser flips. |
| 45 | `sdk/src/vcs/__tests__/jj-parsers.test.ts:114` | `40_char_hex_literal` | `"hash": "2222222222222222222222222222222222222222",` | flip-clean | Plan 2 FLIP-01: NDJSON parser test fixtures will use change_id form after parser flips. |
| 46 | `sdk/src/vcs/__tests__/jj-parsers.test.ts:129` | `40_char_hex_literal` | `"hash": "deadbeef00000000000000000000000000000000",` | flip-clean | Plan 2 FLIP-01: NDJSON parser test fixtures will use change_id form after parser flips. |
| 47 | `sdk/src/vcs/__tests__/jj-parsers.test.ts:131` | `40_char_hex_literal` | `"1234567890123456789012345678901234567890",` | flip-clean | Plan 2 FLIP-01: NDJSON parser test fixtures will use change_id form after parser flips. |
| 48 | `sdk/src/vcs/__tests__/jj-parsers.test.ts:132` | `40_char_hex_literal` | `"abcdefabcdefabcdefabcdefabcdefabcdefabcd",` | flip-clean | Plan 2 FLIP-01: NDJSON parser test fixtures will use change_id form after parser flips. |
| 49 | `sdk/src/vcs/__tests__/jj-parsers.test.ts:222` | `field_access` | `it('maps {name, target.commit_id} → WorkspaceInfo for default workspace', () => {` | historical-prose | Plan 2 FLIP-01: test description prose mentioning {name, target.commit_id} — will be updated. |
| 50 | `sdk/src/vcs/__tests__/jj-parsers.test.ts:228` | `40_char_hex_literal` | `rev: '2f5d3b9b1c0d4e5f6a7b8c9d0e1f2a3b4c5d6e7f',` | flip-clean | Plan 2 FLIP-01: NDJSON parser test fixtures will use change_id form after parser flips. |
| 51 | `sdk/src/vcs/__tests__/jj-parsers.test.ts:247` | `40_char_hex_literal` | `"rev": "2f5d3b9b1c0d4e5f6a7b8c9d0e1f2a3b4c5d6e7f",` | flip-clean | Plan 2 FLIP-01: NDJSON parser test fixtures will use change_id form after parser flips. |
| 52 | `sdk/src/vcs/__tests__/jj-parsers.test.ts:279` | `literal_commit_id` | `"jj --repository . --no-pager --color never --quiet log -r @- -T 'commit_id' --no-graph -n 1",` | flip-clean | Plan 2 FLIP-01: parseJjLog malformed-input fixture should use change_id key. |
| 53 | `sdk/src/vcs/__tests__/jj-refs.test.ts:63` | `40_char_hex_literal` | `expect(bookmark.rev).toBe('2f5d3b9b1c0d4e5f6a7b8c9d0e1f2a3b4c5d6e7f');` | flip-clean | Plan 2 FLIP-01: bookmark.rev fixtures will be in change_id form after backend flips. |
| 54 | `sdk/src/vcs/__tests__/jj-refs.test.ts:82` | `40_char_hex_literal` | `'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',` | flip-clean | Plan 2 FLIP-01: bookmark.rev fixtures will be in change_id form after backend flips. |
| 55 | `sdk/src/vcs/__tests__/jj-refs.test.ts:83` | `40_char_hex_literal` | `'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',` | flip-clean | Plan 2 FLIP-01: bookmark.rev fixtures will be in change_id form after backend flips. |
| 56 | `sdk/src/vcs/__tests__/jj-refs.test.ts:92` | `40_char_hex_literal` | `expect(bookmark.rev).toBe('1111111111111111111111111111111111111111');` | flip-clean | Plan 2 FLIP-01: bookmark.rev fixtures will be in change_id form after backend flips. |
| 57 | `sdk/src/vcs/__tests__/jj-status-log-diff.test.ts:64` | `hash_field_access` | `expect(entries[0].hash).toMatch(/^[a-f0-9]{40}$/);` | needs-rename | Plan 2 FLIP-02 + TEST-12: entries[0].hash → .id; hex regex → toBeIdOf. |
| 58 | `sdk/src/vcs/__tests__/jj-workspace.test.ts:417` | `hex_regex` | `expect(mainEntry?.rev).toMatch(/^[0-9a-f]{40}$/);  // commit_id form` | needs-rename | Plan 2 FLIP-02 + TEST-12 (CITED case): mainEntry.rev hex regex → toBeIdOf("jj"). |
| 59 | `sdk/src/vcs/__tests__/parse-worktree-list.test.ts:23` | `40_char_hex_literal` | `head: 'deadbeefcafebabedeadbeefcafebabedeadbeef',` | safe | parse-worktree-list.test.ts: git worktree porcelain fixture (40-char hex on git side). |
| 60 | `sdk/src/vcs/backends/jj.ts:141` | `hash_field_access` | `* - SQUASH-06: conflicted-state commits surface via CommitResult.hash; the` | historical-prose | Plan 2 FLIP-02/04: doc prose mentioning CommitResult.hash — will be renamed to .id. |
| 61 | `sdk/src/vcs/backends/jj.ts:225` | `literal_commit_id` | `'log', '-r', '@-', '-T', 'commit_id', '--no-graph', '-n', '1',` | flip-clean | Plan 2 FLIP-01 template flip: commit_id → change_id in commit() probe. |
| 62 | `sdk/src/vcs/backends/jj.ts:327` | `literal_commit_id` | `* PITFALL 1: `LogEntry.hash` is `commit_id` (40-char hex), NEVER` | historical-prose | Plan 2 FLIP-04 D-05: PITFALL 1 doc to be inverted to positive-contract statement. |
| 63 | `sdk/src/vcs/backends/jj.ts:597` | `hash_field_access` | `const paths = enumerateConflictedPaths(entry.hash);` | flip-clean | Plan 2 FLIP-02: entry.hash rename to entry.id (post-parseJjLog). |
| 64 | `sdk/src/vcs/backends/jj.ts:598` | `hash_field_access` | `results.push({ rev: entry.hash, paths, scope: opts.scope });` | flip-clean | Plan 2 FLIP-02: entry.hash rename to entry.id (post-parseJjLog). |
| 65 | `sdk/src/vcs/format-migration/__tests__/rewrite.test.ts:149` | `40_char_hex_literal` | `const fullSha = 'bae15ddeee32297cd54deab40eec317d8f961f86';` | safe | Test fixture: 40-char hex literal is a git fullSha for rewrite-test data; semantic-correct git SHA. |
| 66 | `sdk/src/vcs/format-migration/orphan.ts:77` | `hash_field_access` | `cursor = parents[0].hash;` | flip-clean | Plan 2 FLIP-02: parents[0].hash / c.hash → .id rename. |
| 67 | `sdk/src/vcs/format-migration/orphan.ts:103` | `hash_field_access` | `children = childEntries.map((c) => c.hash);` | flip-clean | Plan 2 FLIP-02: parents[0].hash / c.hash → .id rename. |
| 68 | `sdk/src/vcs/format-migration/rewrite.ts:77` | `literal_commit_id` | `'commit_id',` | safe | COMMIT_KEY_ALLOWLIST data — literal frontmatter key, not a commit_id consumer. |
| 69 | `sdk/src/vcs/format-migration/run.ts:152` | `hash_field_access` | `commitHash: markerHit.hash ?? '',` | needs-rename | Plan 2 deferred fold-in: commitHash field → commitId rename in run.ts:152, 335. |
| 70 | `sdk/src/vcs/format-migration/run.ts:335` | `hash_field_access` | `commitHash: commitResult.hash ?? '',` | needs-rename | Plan 2 deferred fold-in: commitHash field → commitId rename in run.ts:152, 335. |
| 71 | `sdk/src/vcs/jj/reap.ts:185` | `short_slice` | `changeIdShort: entry.headChange.slice(0, 8),` | needs-resolveShort | Plan 2 FLIP-02 follow-up: entry.headChange.slice(0, 8) — should use vcs.refs.resolveShort to be alphabet-aware. |
| 72 | `sdk/src/vcs/parse/jj-id.ts:5` | `hash_field_access` | `* `LogEntry.hash = commit_id` per PITFALL 1 in 03-RESEARCH.md. The reverse` | boundary-io | Plan 3 LINT-03 conditional driver: jj-id.ts is the reverse-resolve helper that intentionally derives commit_id from change_id at the jj-internal boundary. |
| 73 | `sdk/src/vcs/parse/jj-id.ts:34` | `literal_commit_id` | `const args = jjIdArgv(cwd, 'log', '-r', changeId, '-T', 'commit_id', '--no-graph', '-n', '1');` | boundary-io | Plan 3 LINT-03 conditional driver: jj-id.ts is the reverse-resolve helper that intentionally derives commit_id from change_id at the jj-internal boundary. |
| 74 | `sdk/src/vcs/parse/jj-log.ts:13` | `literal_commit_id` | `* PITFALL 1 (03-RESEARCH.md): `LogEntry.hash` = `commit_id` (NEVER` | historical-prose | Plan 2 FLIP-01: PITFALL 1 doc comment to update with field flip. |
| 75 | `sdk/src/vcs/parse/jj-log.ts:56` | `field_access` | `hash: record.commit_id ?? '',` | flip-clean | Plan 2 FLIP-01: record.commit_id → record.change_id (NDJSON parser read). |
| 76 | `sdk/src/vcs/parse/jj-workspace-list.ts:46` | `field_access` | `rev: record.target?.commit_id ?? '',` | flip-clean | Plan 2 FLIP-01: record.target.commit_id → record.target.change_id (nested NDJSON read). |
| 77 | `get-shit-done/bin/lib/commands.cjs:507` | `hash_field_access` | `output(result, raw, Object.entries(repos).map(([r, v]) => `${r}:${v.hash \|\| 'skip'}`).join(' '));` | flip-clean | Plan 2 FLIP-02 CJS grep: v.hash → v.id rename. |
| 78 | `get-shit-done/bin/lib/graphify.cjs:357` | `hex_regex` | `const COMMIT_HASH_RE = /^[0-9a-f]{4,40}$/i;` | safe | COMMIT_HASH_RE regex is git-only (graphify reads git commit hashes from CJS-side scan output). |
| 79 | `get-shit-done/bin/lib/graphify.cjs:366` | `short_slice` | `* The two consumers in graphifyStatus() either (a) `.slice(0, 7)` it for` | needs-resolveShort | Plan 2 FLIP-02 follow-up: head.slice(0,7) / builtAt.slice(0,7) should use vcs.refs.resolveShort (CJS-side; grep-only catch). |
| 80 | `get-shit-done/bin/lib/graphify.cjs:460` | `short_slice` | `built_at_commit: builtAt ? builtAt.slice(0, 7) : null,` | needs-resolveShort | Plan 2 FLIP-02 follow-up: head.slice(0,7) / builtAt.slice(0,7) should use vcs.refs.resolveShort (CJS-side; grep-only catch). |
| 81 | `get-shit-done/bin/lib/graphify.cjs:461` | `short_slice` | `current_commit: head ? head.slice(0, 7) : null,` | needs-resolveShort | Plan 2 FLIP-02 follow-up: head.slice(0,7) / builtAt.slice(0,7) should use vcs.refs.resolveShort (CJS-side; grep-only catch). |
| 82 | `get-shit-done/bin/lib/verify.cjs:1296` | `hash_field_access` | `.map((e) => `${(e.hash \|\| '').slice(0, 7)} ${e.subject \|\| ''}`)` | needs-resolveShort | Plan 2 FLIP-02 CJS: (e.hash || "").slice(0, 7) — grep-only catch; consider vcs.refs.resolveShort. |
| 83 | `get-shit-done/bin/lib/verify.cjs:1393` | `40_char_hex_literal` | `const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';` | safe | EMPTY_TREE constant is the canonical git empty-tree SHA (4b825dc6...). |
| 84 | `scripts/audit-id-namespace.cjs:32` | `field_access` | `{ re: /\.commit_id\b/, kind: 'field_access' },` | safe | Audit script self-reference; literal must exist to detect it. |
| 85 | `scripts/audit-id-namespace.cjs:35` | `hash_field_access` | `{ re: /\.hash\b/, kind: 'hash_field_access' },` | safe | Audit script self-reference; literal must exist to detect it. |
| 86 | `scripts/audit-id-namespace.cjs:110` | `hash_field_access` | `'- `needs-rename` — type-level rename (e.g., `LogEntry.hash` → `LogEntry.id`)',` | safe | Audit script self-reference; literal must exist to detect it. |
| 87 | `scripts/audit-id-namespace.cjs:112` | `literal_commit_id` | `'- `boundary-io` — legitimate backend-private `commit_id` access (LINT-03 conditional driver)',` | safe | Audit script self-reference; literal must exist to detect it. |
| 88 | `get-shit-done/workflows/code-review.md:231` | `hash_field_access` | `\| jq -r ".entries[] \| select(.subject \| test(\"\\\(${PADDED_PHASE}\\\)\|\\\(${PADDED_PHASE}-\")) \| .hash" 2>/dev/null)` | needs-rename | Workflow .md jq script; Plan 2 FLIP-02 must update .hash → .id in workflow shell snippets. |
| 89 | `get-shit-done/workflows/code-review.md:424` | `hash_field_access` | `\| jq -r ".entries[] \| select(.subject \| test(\"\\\(${PADDED_PHASE}\\\)\|\\\(${PADDED_PHASE}-\")) \| .hash" 2>/dev/null)` | needs-rename | Workflow .md jq script; Plan 2 FLIP-02 must update .hash → .id in workflow shell snippets. |
| 90 | `get-shit-done/workflows/complete-milestone.md:175` | `hash_field_access` | `\| jq -r '.entries[] \| (.hash[0:7] + " " + .subject)' \` | needs-rename | Workflow .md jq script; Plan 2 FLIP-02 must update .hash → .id in workflow shell snippets. |
| 91 | `get-shit-done/workflows/execute-phase.md:182` | `hash_field_access` | `\| jq -r --arg prefix "test(${PHASE_NUMBER}-${PLAN_ID}):" '.[] \| select(.subject \| startswith($prefix)) \| (.hash[0:7] + " " + .subject)' \` | needs-rename | Workflow .md jq script; Plan 2 FLIP-02 must update .hash → .id in workflow shell snippets. |
| 92 | `get-shit-done/workflows/execute-phase.md:703` | `hash_field_access` | `\| jq -r --arg sub "{phase_number}-{plan_padded}" '.[] \| select(.subject \| contains($sub)) \| (.hash[0:7] + " " + .subject)' \` | needs-rename | Workflow .md jq script; Plan 2 FLIP-02 must update .hash → .id in workflow shell snippets. |
| 93 | `get-shit-done/workflows/execute-phase.md:708` | `hash_field_access` | `\| jq -r --arg ts "${DISPATCH_TS}" '.[] \| select(.date >= $ts) \| (.hash[0:7] + " " + .subject)' \` | needs-rename | Workflow .md jq script; Plan 2 FLIP-02 must update .hash → .id in workflow shell snippets. |
| 94 | `get-shit-done/workflows/quick.md:817` | `hash_field_access` | `\| jq -r --arg sub "${quick_id}" '.[] \| select(.subject \| contains($sub)) \| .hash')` | needs-rename | Workflow .md jq script; Plan 2 FLIP-02 must update .hash → .id in workflow shell snippets. |
| 95 | `get-shit-done/workflows/undo.md:54` | `hash_field_access` | `\| jq -r '.entries[] \| (.hash[0:7] + " " + .subject)'` | needs-rename | Workflow .md jq script; Plan 2 FLIP-02 must update .hash → .id in workflow shell snippets. |
| 96 | `get-shit-done/workflows/undo.md:57` | `hash_field_access` | `The verb's LogOpts shape (Phase 2 CR-02) does not yet expose `--no-merges` / `--grep` — those flags are parsed-but-unused. Reconstruct the "oneline" form client-side from `.hash[0:7] + " " + .subject`` | needs-rename | Workflow .md jq script; Plan 2 FLIP-02 must update .hash → .id in workflow shell snippets. |
| 97 | `get-shit-done/workflows/undo.md:91` | `hash_field_access` | `\| jq -r '.entries[] \| (.hash[0:7] + " " + .subject)' \` | needs-rename | Workflow .md jq script; Plan 2 FLIP-02 must update .hash → .id in workflow shell snippets. |
| 98 | `get-shit-done/workflows/undo.md:104` | `hash_field_access` | `\| jq -r '.entries[] \| (.hash[0:7] + " " + .subject)' \` | needs-rename | Workflow .md jq script; Plan 2 FLIP-02 must update .hash → .id in workflow shell snippets. |
| 99 | `agents/gsd-executor.md:354` | `hash_field_access` | `1. Verify previous commits exist: `gsd-sdk query log --max-count 5 \| jq -r '.entries[] \| (.hash[0:7] + " " + .subject)'`` | needs-rename | Agent prompt .md jq script; Plan 2 FLIP-02 must update .hash → .id. |
| 100 | `agents/gsd-executor.md:525` | `hash_field_access` | `- **Multi-repo (sub_repos):** Extract hashes from `commit-to-subrepo` JSON output (`repos.{name}.hash`). Record all hashes for SUMMARY (e.g., `backend@abc1234, frontend@def5678`).` | needs-rename | Agent prompt .md jq script; Plan 2 FLIP-02 must update .hash → .id. |
| 101 | `agents/gsd-executor.md:641` | `hash_field_access` | `\| jq -r '.entries[].hash[0:7]' \` | needs-rename | Agent prompt .md jq script; Plan 2 FLIP-02 must update .hash → .id. |

## Call-site impact summary

Refactor scope by verdict bucket:

| Verdict | Count | Refactor target |
|---------|-------|-----------------|
| safe | 13 | No action — git-side or self-reference |
| flip-clean | 30 | Plan 2 FLIP-01/02: mechanical template / parser-read / consumer-rename flips |
| needs-rename | 43 | Plan 2 FLIP-02 + FLIP-03 + TEST-12: type-driven .hash → .id rename + assertion upgrade to toBeIdOf |
| needs-resolveShort | 7 | Plan 2 FLIP-02 follow-up: replace .slice(0, N) with vcs.refs.resolveShort(expr.rev(id)) (alphabet-aware) |
| boundary-io | 2 | Plan 3 LINT-03 conditional: jj-id.ts is the legitimate reverse-resolve helper — allowlist seed |
| historical-prose | 6 | Plan 2: doc comments updated alongside the type renames they describe; PITFALL 1 inversion (jj.ts:327) per FLIP-04 D-05 |
| unclear | 0 | Should be 0 at Plan 1 close |

## Plan splitting decision

RESEARCH thresholds:

- Total findings > 50: **EXCEEDED** (101 findings)
- `boundary-io` verdicts > 5: clear (2 boundary-io rows — both in jj-id.ts, the legitimate reverse-resolve helper)
- `unclear` verdicts > 10: clear (0 unclear rows)
- Workflow `.md` id-branch sites > 8: **EXCEEDED** — split Plan 3 into 3a (lint) + 3b (PROMPT-05 + MIGR-06)

**Outcome:** Total findings (101) exceeds the 50-row threshold. However, the 101 findings break down to **101 mechanical rewrites across 4 verdict buckets** (flip-clean=30, needs-rename=43, needs-resolveShort=7, plus 13 safe + 6 historical-prose that are no-ops, plus 2 boundary-io that seed the lint allowlist). The mechanical nature of the flips (driven by `tsc --noEmit` compiler errors for needs-rename, grep-replace for needs-resolveShort) means a single Plan 2 sweep is feasible. Plan 3 PROMPT-05 has 14 workflow/agent .md rewrite sites, EXCEEDING the 8-row threshold — Plan 3 SPLIT into 3a (lint guard activation) + 3b (PROMPT-05 sweep + MIGR-06).

**Plan split NOT recommended for Plan 2** — the 73 actionable code rewrites (flip-clean + needs-rename + needs-resolveShort) compile-driven and atomic.
**Plan split RECOMMENDED for Plan 3** — 14 workflow/agent .md sites



## LINT-03 outcome — LINT-03 verified end state

Boundary-io verdict count: 2 (from `.planning/intel/id-namespace-audit.json` `verdicts['boundary-io']`).

Per CONTEXT D-05 + LINT-03 conditional decision tree: the 2 boundary-io rows are both in `sdk/src/vcs/parse/jj-id.ts` reverse-resolve helper. This count is below the 5-row threshold for firing the `jj-internal.ts` build path; **LINT-03 closes as the LINT-03 verified end state** — no `sdk/src/vcs/backends/jj-internal.ts` exists. The two rows are recorded in `scripts/lint-vcs-no-commit-id.allow.json` as the legitimate jj-internal accessor.

The inversion of SEED-001 holds: every cross-backend verb on the jj backend emits `change_id`, never `commit_id`; no legitimate consumer exists that requires backend-private `commit_id` access via the cross-backend `vcs.*` namespace; the LINT-03 rule has no surface to enforce beyond the existing `jj-id.ts` accessor.

Verification commands (re-runnable):

```bash
jq '.verdicts."boundary-io" | length' .planning/intel/id-namespace-audit.json  # returns 2
test ! -f sdk/src/vcs/backends/jj-internal.ts                                  # file does NOT exist
node scripts/lint-vcs-no-commit-id.cjs                                         # exits 0 (first green run = FLIP completeness proof)
```

If a future PR proposes building `sdk/src/vcs/backends/jj-internal.ts`, this section is the reference: the original Phase 8 audit returned 2 boundary-io consumers (both in jj-id.ts, the existing accessor), well below the 5-row threshold; any new consumer must be re-litigated with explicit rationale per Pitfall 4 (boundary-I/O accessor sprawl).

Audit script + lint script + seeder script self-references and post-audit-discovery paths (paths outside the audit scan roots — `sdk/src/types.ts`, `sdk/src/vcs/types.ts`, `sdk/src/query/commit.ts`, `sdk/src/vcs/format-migration/types.ts`, `sdk/src/vcs/__tests__/jj-refs.test.ts`, several `tests/*.cjs` test-fixture files) are recorded in `scripts/lint-vcs-no-commit-id.allow.json` with explicit per-entry reason and owner. None are boundary-io.


## PROMPT-05 outcome

AUDIT-04 grep at Plan 3 execution time:

```bash
grep -rn "vcs\.kind === 'jj'" get-shit-done/bin/lib/ get-shit-done/workflows/ commands/ agents/  # returns 0
grep -rn "vcs\.kind === 'git'" get-shit-done/bin/lib/ get-shit-done/workflows/ commands/ agents/ # returns 4
```

- `vcs.kind === 'jj'` id-reason branches found: **0**
- `vcs.kind === 'git'` branches found: **4** (all KEEP — gitOnly.* capability narrowing)

Discriminator applied per RESEARCH §Workflow `vcs.kind`-branch decision pattern:

- **DELETED (id reasons):** none
- **KEPT (non-id reasons):**
  - `get-shit-done/bin/lib/init.cjs:1547` — `gitOnly.version()` access (Phase 2.1 D-18 capability narrowing)
  - `get-shit-done/bin/lib/worktree-safety.cjs:71` — comment-only reference to the `vcs.kind === 'git'` consumer pattern (documenting the D-18 narrowing pattern)
  - `get-shit-done/bin/lib/worktree-safety.cjs:107` — comment-only reference (same D-18 documentation)
  - `get-shit-done/bin/lib/worktree-safety.cjs:109` — actual `if (vcs.kind === 'git')` narrow for `gitOnly.gitDir()` / `gitOnly.gitCommonDir()` access (Phase 2.1 D-18 capability narrowing)

Each KEEP site now carries an inline `// PROMPT-05 KEEP:` annotation citing the gitOnly.* capability rationale + Phase 8 CONTEXT `<out-of-scope>`.

**Expected outcome confirmed:** zero deletes (per pre-Plan-3 grep + Plan 1 audit findings). **PROMPT-05 closes by invariant verification.**


## Post-pass audit (Phase 8 close-gate)

**Re-ran:** `node scripts/audit-id-namespace.cjs --json` after Plan 3 close-gate (MIGR-06 rewriter pass + lint activation).

**Raw verdict counts (re-run):**

| Verdict | Count |
|---------|-------|
| safe | 0 |
| flip-clean | 0 |
| needs-rename | 0 |
| needs-resolveShort | 0 |
| boundary-io | 0 |
| historical-prose | 0 |
| unclear | 75 |

**Important interpretation note:** The audit script's verdict-assignment is intentionally a *human* step per Plan 1 D-01 ("The script enumerates `file:line` rows; the human fills the verdict column from the closed enum"). A fresh `--json` re-run emits all rows under `unclear` because no human pass has yet been performed on the post-FLIP repo state. The "0 flip-clean / 0 needs-rename / 0 boundary-io" numbers above are NOT an automated invariant — they reflect that an unclassified raw scan defaults all rows to `unclear`.

**Where the actual close-gate verification lives:** `node scripts/lint-vcs-no-commit-id.cjs` exits 0 (FLIP completeness proof per Success Criterion 4). The lint is the architectural enforcement; the audit re-run is a diagnostic snapshot showing which surfaces survived the FLIP for future periodic sweeps.

**Distribution of post-pass unclear rows by surface:**

| Surface | Count |
|---------|-------|
| 40_char_hex_literal | 15 |
| field_access | 5 |
| hash_field_access | 19 |
| hex_regex | 4 |
| literal_commit_id | 22 |
| short_slice | 10 |

The `hash_field_access` rows (19) are inherent: after FLIP, `.hash` accesses survive on TypeScript fields named `hash` in non-VcsAdapter surfaces (e.g., file-content SHA-256 hashes, snapshot.hashes Record). The `literal_commit_id` rows (22) include scan-script self-references, JSDoc references documenting the unified contract, and parser test fixtures. All are covered by `scripts/lint-vcs-no-commit-id.allow.json` (Plan 3 Task 1).

**Migration produced by close-gate rewriter (MIGR-06):**

- 1 file rewritten: `.planning/phases/08-…/08-01-SUMMARY.md` — 12 commit-id-shape backtick spans migrated to change-id-shape (12-char k-z).
- 1 orphan emitted: `08-RESEARCH.md@42388` carrying the illustrative `abc1234` example hex (intentionally unresolvable; emitted verbatim per B-07 safety net).
- Idempotency verified: second invocation byte-identical to first.
