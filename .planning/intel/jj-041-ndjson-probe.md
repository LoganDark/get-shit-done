# jj 0.41 NDJSON Schema Probe (Risk 4 Mitigation)

**Probed:** 2026-05-15
**jj binary:** jj 0.41.0-cfdadb380babf004a3c0f1f0177335756011b3a1-b3506b213cbf53c2298f710d32cb8eb358f1592a-76bbc6fca7d4a30646004c9179e367ec220c5194-a83b55d79bfad0dd003ac92d9df6f41ff888e2a8

**Risk:** Plan 2 FLIP-01 NDJSON parser flips (`record.commit_id` → `record.change_id`) depend on `change_id` being emitted by `json(self)` templates. If the standard `json(self)` template emission does not include `change_id` at the top level, the parser flip would require either a custom template (e.g., `json(self.change_id() ++ ...)`) or a two-pass parse — both of which would expand the FLIP-01 scope significantly.

## Probe procedure

```sh
cd /tmp && rm -rf gsd-jj-probe && mkdir gsd-jj-probe && cd gsd-jj-probe
jj git init --colocate
echo "test" > a.txt
jj describe -m "probe"
jj log -r '@' -T 'json(self) ++ "\n"' --no-graph -n 1
jj workspace list -T 'json(self) ++ "\n"'
jj bookmark list -T 'json(self) ++ "\n"'
```

## `jj log -r '@' -T 'json(self) ++ "\n"' --no-graph -n 1`

Output (sanitized — commit_id/change_id/timestamps from a one-shot probe repo):

```json
{
  "commit_id": "e1729a6d764ad45390b0d6f391a7a53f78b754c6",
  "parents": ["0000000000000000000000000000000000000000"],
  "change_id": "uxrpyvmypwkysynzpzvkzoytlqlkxlzn",
  "description": "probe\n",
  "author": { "name": "LoganDark", "email": "...", "timestamp": "2026-05-14T22:36:13-07:00" },
  "committer": { "name": "LoganDark", "email": "...", "timestamp": "2026-05-14T22:36:13-07:00" }
}
```

**Result:** GREEN. `change_id` is emitted at the top level of the standard `json(self)` template emission, alongside `commit_id`. No custom template, no two-pass parse needed.

## `jj workspace list -T 'json(self) ++ "\n"'`

Output (sanitized):

```json
{
  "name": "default",
  "target": {
    "commit_id": "e1729a6d764ad45390b0d6f391a7a53f78b754c6",
    "parents": ["0000000000000000000000000000000000000000"],
    "change_id": "uxrpyvmypwkysynzpzvkzoytlqlkxlzn",
    "description": "probe\n",
    "author": { "name": "LoganDark", "email": "...", "timestamp": "2026-05-14T22:36:13-07:00" },
    "committer": { "name": "LoganDark", "email": "...", "timestamp": "2026-05-14T22:36:13-07:00" }
  }
}
```

**Result:** GREEN. `change_id` is nested under `target` (matches research finding); the entire commit object is serialized as the value of `target`, so all fields (including `change_id`) are present at one level of nesting.

## `jj bookmark list -T 'json(self) ++ "\n"'`

Empty output on probe repo (no bookmarks). Plan 2 Task 6 will probe the live template emission during implementation; the existing parser at `sdk/src/vcs/parse/jj-bookmark.ts:19-21` accepts string ids regardless of alphabet — the FLIP work is on the template emission caller side (jj.ts bookmark list invocation), not the parser.

## Conclusion

Plan 2's FLIP-01 NDJSON parser flips are mechanical single-line read swaps:

- `sdk/src/vcs/parse/jj-log.ts:26,56` — `record.commit_id` → `record.change_id`
- `sdk/src/vcs/parse/jj-workspace-list.ts:28,46` — `record.target?.commit_id` → `record.target?.change_id` (type literal AND read both flip)

No two-pass parse, no `json(self.change_id() ++ ...)` custom template — `change_id` is part of the standard `json(self)` emission. Risk 4 is mitigated.
