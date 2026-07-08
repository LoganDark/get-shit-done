# Changelog

All notable changes to GSD will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [1.6.1] - 2026-07-01

### Added

- **Claude Sonnet 5 is now the `standard` (sonnet) tier model.** The model catalog and provider presets resolve the sonnet/standard tier to `claude-sonnet-5` (GA 2026-06-30) across the Anthropic-backed runtimes (`claude`, `copilot`, and the `anthropic`/`anthropic-fable` presets), plus the OpenRouter-style `anthropic/claude-sonnet-5` for `opencode`/`hermes`, replacing the superseded `claude-sonnet-4-6`. Opus and Haiku tiers are unchanged. (#1847) (#1848)

### Fixed

- `milestone complete` and `roadmap analyze` now exclude the Phase 0 / Phase 999 backlog sentinels. A milestone whose only directory-less ROADMAP heading is a backlog sentinel can be completed without `--force`, and `roadmap analyze` no longer counts the sentinel in `phase_count` or routes `next_phase` into it. Completes the `^999` exclusion #1445 added to the progress denominators. (#1691)
- **`phase.complete` no longer reports a false `is_last_phase` on a `<details>`-wrapped checkbox checklist (#1591, #1752)** — when the active milestone's phase checklist was written as `- [ ] Phase N:` checkbox items inside a `<details>` block and the next phase had no directory on disk yet (still in planning), `phase.complete`'s `isLastPhase` roadmap-enumeration fallback used a heading-only pattern (`/#{2,4}\s*Phase…/`) that never matched checkbox items. It returned `is_last_phase: true, next_phase: null` on a mid-milestone phase and — via the milestone-complete cascade — wrongly flipped STATE.md to `Milestone complete` and decremented `progress.total_phases` (e.g. 8 → 7). The pattern now matches both heading-style (`### Phase N:`) and checkbox-list phases (`- [ ] Phase N:` / `- [x] Phase N:`); `extractCurrentMilestone` already surfaces the `<details>`-wrapped checklist correctly, so no parser change was needed. Only the reproduced `phase.complete` fallback is changed; the heading-only sibling patterns elsewhere in `phase.cts` are untouched.
 (#1819)
- Windows: stop double-quoting $CLAUDE_PROJECT_DIR-anchored managed node hook paths during the #2979 legacy rewrite, which produced "\"$CLAUDE_PROJECT_DIR\"/..." and broke every node managed hook with MODULE_NOT_FOUND (PreToolUse-guard deadlock). (#1746)

## [1.6.0] - 2026-06-24

### Added

- **`workflow.context_guard_mode` config key** — proactive context-exhaustion guard for `execute-phase`. Before each wave, the orchestrator self-assesses context pressure using the degradation signals defined in `context-budget.md`. Values: `warn` (default — emit warning and recommend `/gsd:pause-work` when POOR tier detected), `auto` (automatically invoke `/gsd:pause-work` before next wave), `off` (disable). Set via `gsd config-set workflow.context_guard_mode auto` for fully autonomous checkpoint behaviour. (#1452) (#1452)
- **`agent-skills --json` IR gains an additive `value: { block, skills_count }` field** formalizing the `Resolution<T>` convention for config-interpreting read verbs; no breaking change. The new `src/resolution.cts` module exports `Resolution<T> { value, configured, reason, warnings }` (the canonical envelope) and `makeResolution<T>()` (the builder); `AgentSkillsValue { block, skills_count }` is the first adopter. All existing flat fields (`agent_type`, `block`, `skills_count`, `warnings`, `configured`, `reason`, `source`, `degraded`) are retained for back-compat. Capability-state and capability-writer keep their existing JSON shapes unchanged; only doc comments are added naming them the canonical read-verb and mutation-verb envelopes respectively. The shared seam across all shapes is `warnings: string[]`; a single generic across read+write verbs was rejected by the deletion test (ADR-1411 P3 amendment). (Part of #1411, P3 / #1416.) (#1425)
- **Added `gsd capability outdated`** — a new subcommand that light-peeks each installed overlay capability's recorded source for the latest version that re-resolving that source would install and reports which have an update available (ADR-1244 D6 per-source matrix: git `ls-remote --tags`, npm `view … version`, local re-read; tarball → `manual`, registry → `unknown`). A capability is reported `outdated` only if re-resolving its recorded source would fetch a newer version: an npm range (`@^1`) resolves to the highest version **matching the range** (read from each `npm view` line's canonical version field, so a version-like substring in the package name never poisons the result), and a source pinned to an immutable ref (git `#sha:`/`#tag:`) or an exact npm version is reported `pinned` — never `outdated`, since `update` will not move it. A bare git ref (`#<ref>`) is classified at the remote with a bounded `git ls-remote`: a ref that resolves to a tag is `pinned`, while a **mutable branch** ref is never `pinned` (it degrades to `unknown`, since the installed commit is not recorded to compare against). Each capability is classified `outdated` / `current` / `pinned` / `manual` / `unknown`; subprocesses are bounded (git ≤30s, npm ≤60s) and a failing or unsupported peek degrades that row to `unknown` instead of crashing the command. `--json` emits the records array; the default prints a table. (#1463) (#1488)
- **`gsd capability` management command** — install, update, remove, list, disable, and enable GSD capabilities (first-party and third-party overlays) from a registry / git / npm / tarball / local source, wiring the ADR-1244 lifecycle (source resolver, ledger, consent + integrity trust gate) to a user-facing CLI. (#1457) (#1457)
- **Runtime capability registry overlay** — installed third-party capabilities (under `~/.gsd/capabilities/` or a project's `.gsd/capabilities/`) are now composed into the registry at runtime via `loadRegistry({ includeInstalled })`: validated against the same conformance invariants as first-party, first-party-wins on any collision, skipped-with-a-warning when incompatible with the running GSD version (`engines.gsd`), with gate-kind capabilities failing closed. Installed overlays are toggable via surface and federate their config keys (cwd-aware) exactly like first-party. Foundation (ADR-1244 Phase 2) for capability install/upgrade/remove. (#1440)
- **Capability manifests are now versioned** — every `capability.json` carries a required semver `version`, plus optional `engines.gsd`, `compatVersions`, `integrity` and `provenance` fields, enforced by the capability conformance validator. First-party capabilities are version-stamped in lockstep with the GSD release. Foundation (ADR-1244 Phase 1) for installing, upgrading, and removing capabilities in later releases. (#1436)
- **`/gsd-capture --list-seeds` audits parked seeds** — a new read-only listing of `.planning/seeds/` showing each seed's ID, status, scope, and trigger, with an optional status filter (e.g. `--list-seeds dormant`). Backed by the `gsd-tools list-seeds` command. Previously seeds could only be created or auto-surfaced at `/gsd-new-milestone`, with no way to browse them on demand (#441). (#722)
- **Capability source resolver + install ledger** — `resolveCapabilitySource(spec)` fetches a capability from a local path, git repo, npm package, or tarball URL, verifies it (sha512 integrity before staging, `engines.gsd` compatibility, full conformance validation) and stages a bundle **without executing any capability code** (copy/extract only — `npm pack --ignore-scripts`, never `npm install`; symlink/tar-slip/shell-metacharacter/unsafe-transport inputs rejected). A per-runtime ledger records what each install wrote for atomic, reversible upgrade/remove. Foundation (ADR-1244 Phase 3) for the upcoming `gsd capability install` command. (#1443)
- **Capability matrix reference** — a generated catalogue (`docs/reference/capability-matrix.md`) of every first-party capability's role, tier, extension points, hook kinds, and `engines.gsd`, generated from the committed registry and kept honest by a CI drift guard so it can never fall out of sync with the actual capability set. (#1458) (#1458)
- **Third-party capabilities can ship dispatchable CLI commands (ADR-1244 Phase 5)** — a capability that declares a `commands` family is now dispatched by `gsd-tools <family>` via the registry, the same seam the first-party `graphify`/`intel`/`audit` commands already use. Third-party command dispatch runs only for an installed, consented capability (a committed ledger entry) and loads the router module strictly from that capability's own install root (basename + realpath confinement, rejecting `..` traversal and symlink escape); a bundle merely present on disk with no install record keeps its declarative surfaces but is never command-dispatchable. (#1450) (#1450)
- **Plugin installs now expose GSD skills** — when GSD is installed as a Claude Code plugin (`claude plugin install`), its skills are available via `gsd-core:<skill>` the native way. Previously, plugin-only installs lacked the skill surface because `bin/install.js` never ran; agents that preload `global:gsd-core:<skill>` (PR #1261) now resolve against plugin-provided skills. (#1596) (#1597)
- Added a validated `gsd-tools worktree record-agent` writer verb that appends a per-agent entry to the wave cleanup manifest, validating every field at write time with the same rules the `cleanup-wave` reader enforces (write-strict `--agent-id`) and failing loudly with a recovery hint instead of silently appending an under-populated entry. The execute-phase orchestrator now records each spawned worktree through this verb. (#1448) (#1448)
- **`gap-analysis --phase-req-ids` now expands numeric ID ranges** — a same-prefix ascending equal-width range like `SEL-01..SEL-03` expands to `SEL-01, SEL-02, SEL-03` (zero-pad preserved) instead of being treated as one literal ID that gap-analysis then reports as missing. Ambiguous tokens (mismatched prefix, descending, differing width, non-numeric, >1000 span) stay literal. (#1269) (#1419)
- **`/gsd-plan-phase` now flags a stale codebase map before planning** — the `drift` capability runs its codebase-drift check at `plan:pre` (non-blocking, warn-only), so a stale STRUCTURE.md is surfaced before the planner is spawned instead of being discovered mid-execution by the existing `execute:wave:post` gate. Gated on a new `workflow.plan_drift_precheck` toggle (default on), independent of `workflow.schema_drift_gate`, so autonomous/CI runs can silence the plan-time advisory without disabling the execute-time gates. (#1595)

### Changed

- **Capability commands now emit dispatch audit records** — `graphify`, `intel`, `audit-uat`, and `audit-open` now route through the Command Routing Hub per ADR-959 §III(B), so `GSD_AUDIT=1` traces, the structured stderr JSON error envelope, and the typed Result contract cover them uniformly with all other command families. JSON-error `reason` values (`usage`, `sdk_unknown_command`) are preserved byte-identical. (#1646) (#1647)
- **`/gsd-verify-work` now routes UAT deterministically from a structured `coverage:` block on SUMMARY.md** — deliverables proven by passing tests (`human_judgment: false` with a non-empty all-`pass` `verification` list) are auto-passed (`source: automated`, no prompt), and only judgment-dependent or unverified deliverables are presented for human sign-off. SUMMARYs without a `coverage:` block fall back to the previous prose-based extraction, byte-identical. Authored by `execute-plan` and validated by the new `gsd-tools uat classify-coverage` verb. (#1611)
- **Thread `isGlobal` install scope through the descriptor-driven `convertedAgentsKind` / `stageAgentsForRuntimeWithConverter` plumbing** — a prerequisite for the ADR-1235 agent-conversion cutover. No runtime declares a converted `agents` kind yet; the `capability.json` wiring is deferred to a follow-up that first ships the ADR-1235 §0 byte-for-byte parity harness (so the `/gsd:surface` / `--materialize` consumer can mirror the legacy agent pipeline before the kind goes live). The legacy `bin/install.js` agent loop remains authoritative, so installed agent output is unchanged. (#1173) (#1438)
- **`/gsd-review` now asks external reviewers to verify plan claims against the source** — the reviewer prompt requires opening the referenced files, citing `file:line` evidence + mechanism, and tracing asserted behavior, with a graceful-degradation clause for reviewers that have no file access. This turns every capable agentic reviewer into a real second source instead of a plan-text paraphraser. (#1318) (#1421)
- **eval-auditor scoring moved into a deterministic `eval.score` query verb (LLM-playbook principle 10)** — coverage/infra/overall arithmetic and verdict banding are computed in code (`gsd-tools query eval.score`) instead of by the model. Based on arXiv 2601.15130 (Plausibility Trap / DPDM), 2508.15754 (Tool-Integrated Reasoning), 2507.10281 (Table Agent); 2504.00406 / 2510.15955 supporting. (#1583)
- **`gsd-tools` now resolves the project root from a descendant subdirectory** — `findProjectRoot` walks up to the nearest ancestor directory containing `.planning/` so config loads correctly when invoked outside the project root; previously it fell through to defaults for plain descendant paths (cwd-drift gap #1366). Sub_repos, multiRepo, and `.git`-based heuristics retain priority. (Part of #1411, P1 / #1414) (#1423)
- **verify-phase test-tier prohibition fail-first can now prove the RED is caused by the violation's _content_** — the `node-test` machine-proof (#1279) confirmed a known-bad subject drives the negative test RED, but could not tell a genuine content-violation from a deceptive test that reds merely because `GSD_PROHIB_SUBJECT` is set. An optional fifth flat scalar `check_clean_fixture` (→ `CheckDescriptor.cleanFixture`) threads a KNOWN-CLEAN control subject through `projectProhibitions` + `descriptorFromProjection`; when present the prover also runs the check against it and requires GREEN, so fail-first is proven only when the check is RED on the violation **and** GREEN on the clean subject (content-dependent). It is opt-in and additive: absent a clean fixture the prover behaves exactly as it did post-#1314 (no control, documented residual), preserving the zero-authoring compose path; the lint-rule kind needs no analog. (#1346) (#1518)
- **fish-shell support in the post-install PATH suggestion.** When a directory is not on your PATH, the installer now prints a fish-native `fish_add_path '<dir>'` line alongside the zsh/bash suggestions (the previous `export PATH=…` commands are inert in fish). It also stops the false-positive "not on your PATH" warning for fish users whose `fish_user_paths`/`config.fish` already covers the directory, detected via a read-only probe of fish's config (no fish subprocess, no writes). No change for bash/zsh/PowerShell/cmd/Git-Bash users. (#727)

### Fixed

- **Project-local Claude Code install now produces `/gsd-<cmd>` (hyphen) slash commands** — the installer was writing command files to `.claude/commands/gsd/<cmd>.md` (subdirectory with bare names), causing Claude Code to namespace them as `/gsd:<cmd>` (colon form). The fix writes flat `gsd-<cmd>.md` files at `.claude/commands/` level so Claude Code registers `/gsd-<cmd>` (hyphen form), matching hooks, statusline, and all cross-command references. Legacy `commands/gsd/` directories from prior installs are cleaned up on reinstall and uninstall, with `dev-preferences.md` preserved. (#1367) (#1367)
- **`execute-phase` now re-checks the worktree fork base at the start of every wave and resets the wave manifest between waves (#1369)** — two compounding issues caused wave N+1 worktrees to be created from the stale pre-wave-N commit. First, the `worktree.base-check` auto-degrade only ran once at initialize time; after Wave N merged and tracking commits advanced orchestrator HEAD past `origin/HEAD`, Wave N+1 worktrees were still forked from `origin/HEAD` (Claude Code's "fresh" base), causing both agents to immediately halt with `FATAL: worktree base mismatch` from the `worktree_branch_check` guard. Second, `WAVE_WORKTREE_MANIFEST` was never unset between waves, so wave N+1 would reuse the consumed wave-N manifest file, causing the step 5.5 manifest guard (#3384) to block on subsequent waves. Two safeguards fix this: step 0.5 in the `execute_waves` "For each wave" loop re-runs `worktree.base-check` before every wave's dispatch (when divergence is detected, `USE_WORKTREES` is overridden to `false` for that wave); step 7c between waves unsets `WAVE_WORKTREE_MANIFEST` so wave N+1 creates a fresh per-wave manifest, and re-asserts `worktree.baseRef:"head"` (idempotent) so the Claude Code harness re-reads the live HEAD on the next dispatch. The permanent fix remains setting `worktree.baseRef:"head"` in `.claude/settings.local.json` (see #683). (#1369)
- **Workflow temp files now randomize correctly on BSD/macOS** — several workflows called `mktemp` with templates where `XXXXXX` was followed by a `.json`/`.md` suffix (e.g. `gsd-worktree-wave-XXXXXX.json`, `gsd-pr-body.XXXXXX.md`). BSD/macOS `mktemp` only substitutes `XXXXXX` when it is the final path component, so those templates returned a literal, non-randomized path, letting concurrent workflow runs collide on the same temp manifest/body file (one run overwriting or consuming another's). The fix creates a suffixless temp then renames to add the extension — portable across BSD + GNU. Affected: `execute-phase`, `quick`, `spec-phase`, `ship`, `profile-user`. (#1520) (#1550)
- **Core-path file locks now verify the holder process is alive before stealing a stale lock (#1532)** — the STATE.md write lock (`acquireStateLock`) and the `.planning/` workspace lock (`withPlanningLock`) previously stole locks on a bare `mtime` timer with no liveness check, so a live-but-slow holder (e.g. a deep `.planning/` scan on slow NFS) could have its lock stolen mid-write, corrupting STATE.md or losing an update. Both locks now gate stealing on `process.kill(pid,0)` liveness with a deadman ceiling above the wait budget (pid-reuse backstop), `withPlanningLock` no longer force-steals a live holder on timeout (and can no longer leak an uncaught `EEXIST`), `writeStateMd` computes its disk scan inside the lock, and `acquireStateLock` no longer leaks a file descriptor or strands an empty lock on a recoverable write error. The steal itself is now race-safe: a lock is never stolen while its body is still being written (the create→pid-write window), and stealing uses an atomic rename with an identity re-confirm so two waiters can no longer both reclaim the same lock and end up holding it concurrently. The uncontended path is unchanged. (#1532)
- **`normalizeNodePath` now maps pruned mise node paths to the stable shim (#1619)** — `resolveNodeRunner()` bakes `process.execPath` into managed `.js` hook commands. Node realpaths execPath, so under mise it resolves to `<data>/installs/node/<ver>/bin/node` — a concrete version mise prunes on `mise up`, after which every managed hook fails to spawn (`No such file or directory` on every SessionStart and tool event), the same ephemeral-path failure #977 fixed for fnm and #3181 for Homebrew. `normalizeNodePath` now rewrites a mise versioned install path to the stable sibling shim `<data>/shims/node` (`.exe` preserved on Windows) when that shim exists, deriving `<data>` from execPath so a custom `MISE_DATA_DIR` works, and falling back to the raw execPath unchanged otherwise. (#1619) (#1621)
- 
fix(#1472): validate health is now workstream-aware — PROJECT.md and config.json are resolved from .planning/ root, while ROADMAP.md, STATE.md, and phases/ follow the workstream-scoped path; previously both sets were routed through planningDir() causing false E002/E003/E004/W003 when GSD_WORKSTREAM is set.

fix(#1454): validate health W017 no longer suggests removing the active session's worktree — stale-worktree findings are now skipped when the worktree path matches or is an ancestor of process.cwd(). (#1483)
- **`frontmatter set` / `frontmatter merge` no longer destroy `must_haves` object-lists** — changing one frontmatter field (e.g. `wave`) silently dropped every `provides:` value and collapsed `must_haves.artifacts`/`.prohibitions` from a structured `[{path, provides}]` list into a malformed inline array, because the whole frontmatter was round-tripped through a lossy parse→serialize path that flattens object-list items to scalar strings. The write now preserves the original raw text for any structurally-unchanged top-level key and regenerates only the field that actually changed, so unrelated `must_haves` blocks survive verbatim. (#1572) (#1656)
- **Non-Claude runtime installs now resolve their own runtime and never attempt Claude-only worktree isolation** — on any non-Claude install (Cursor, Gemini, Qwen, etc.) a runtime-neutral `.planning/config.json` previously resolved `runtime=claude` and enabled git worktree isolation, which only Claude Code's `isolation="worktree"` can honor — risking main-checkout edits while the workflow believed agents were isolated. Every non-Claude install now resolves its own runtime identity, defaults `workflow.use_worktrees` to `false`, fails closed if worktrees are forced on, and runs plan/execute inline in the manager/autonomous flows since only Codex can background-nest the pipeline's subagents. (#1521) (#1537)
- Phase-aware commands now resolve project-code-prefixed ROADMAP headings such as MANIFOLD-117, while the roadmapper is instructed to keep project_code out of phase headings. (#1456)
- **`workflow.mvp_mode` now accepted by `config-set`; three undocumented workflow keys added to references** — `workflow.mvp_mode`, `workflow.code_review_command`, and `workflow.plan_chunked` were consumed by planning-pipeline code but could not be set via `config-set` (they were missing from `VALID_CONFIG_KEYS`) or discovered via reference docs. All three are now in the schema and documented in `references/planning-config.md`. (#1500) (#1500)
- **Windsurf reinstall removes legacy .devin/skills/ artifacts** — pre-#1615 installs wrote skills under .devin/skills/gsd-*/ (Devin Desktop layout, #1085). #1615 moved Windsurf to .windsurf/workflows/ but never cleaned up the old layout. Reinstalls now remove GSD-managed .devin/skills/gsd-* dirs; user-owned content is preserved. (#1631)
- adr-parser now classifies 9 previously-dropped punctuated ADR headers (Trade-offs, Non-Goals, Won't Do, Follow-up, How We'll Know, etc.) into their intended buckets instead of leaving them unmapped. (#1536)
- Add prototype-pollution guard to the workstream/root config merge (_deepMergeConfig) so a config.json with a __proto__/constructor/prototype key can no longer spoof unset config flags. (#1534)
- **All GSD agents load on Gemini again** — the Claude `Skill`/`SlashCommand` tools were converted to an invalid `skill` tool that Gemini rejects, aborting the load of 22 of 34 agents. They are now excluded from the Gemini and Gemini-backed Antigravity agent `tools:` frontmatter, the same way `AskUserQuestion` already is. (#1394) (#1418)
- **Antigravity config-dir resolution no longer shadows the active runtime** — when more than one of `~/.gemini/antigravity`, `antigravity-ide`, or `antigravity-cli` exists, GSD now resolves to the directory it actually installed into (marked by `gsd-core/VERSION`) instead of whichever directory existed first. Fixes silent misresolution where a CLI user who also had the Antigravity-IDE dir present was sent to the legacy dir (regression from #217). (#1442)
- **`gsd-tools query agent-skills` no longer silently drops a configured agent's skills under cwd or workstream drift** — `cmdAgentSkills` now anchors to the project root via `findProjectRoot` before loading config, so invoking it from a descendant subdirectory or with a `GSD_WORKSTREAM` that has no scoped config correctly resolves the configured `agent_skills` block. A new `loadConfigResolved(cwd, options) → { config, source, degraded }` function reports provenance alongside the config object: `source` distinguishes `'root' | 'workstream' | 'builtin-defaults' | 'global-defaults'`; `degraded:true` signals a workstream was requested but its config.json was absent. The `--json` IR of `agent-skills` gains four new fields — `configured` (bool), `reason` (`'resolved' | 'not_configured' | 'configured_empty' | 'configured_unresolved'`), `source`, and `degraded` — making silent failures visible and testable. A `configured_empty` or `configured_unresolved` agent emits a `stderr WARNING`; an unconfigured agent stays silent. (Closes #1366. Part of #1411, P2 / #1415.) (#1424)
- **`findProjectRoot` now respects explicit `sub_repos` config over implicit `.git`** — when a parent workspace's `.planning/config.json` lists a child directory in `sub_repos`, that declaration takes precedence over the child's own `.git/` directory. Previously, if the child had both `.planning/` and `.git/`, the `.git` heuristic fired first and resolved to the child rather than the parent workspace, making the `sub_repos` declaration ineffective. (#1422)

**`phases clear` now refuses to delete phase directories with uncommitted changes** — `cmdPhasesClear` runs `git status --porcelain` over the phases directory before executing any deletion. If uncommitted or staged-but-not-committed files are found it aborts with a clear error message, preventing silent data loss at `new-milestone` time. Pass `--force` to bypass the guard when archival is already complete. Non-git projects are unaffected. (#1447, data-loss fix) (#1484)
- 
**999.x backlog phases are now excluded from `total_phases`, and `total_phases` can correct downward** — `deriveProgressFromRoadmap` counted all progress-table rows whose phase cell started with a digit, so a `999.1 Backlog` row inflated `total_phases` by one per entry (#1445). The same overcounting occurred in `getMilestonePhaseFilter` (which feeds `isDirInMilestone` and `phaseDirs`) and in the `roadmapPhaseCount` loop in `buildStateFrontmatter`. All three sites now filter phase tokens matching `/^999\b/`, consistent with the existing exclusion in `init.cts`. Additionally, `shouldPreserveExistingProgress` included `total_phases` in its ratchet check, preventing the counter from decreasing once set too high — e.g. after a 999.x fix or a ROADMAP correction (#1446). `total_phases` is now always taken from the freshly derived value; only `completed_phases`, `total_plans`, and `completed_plans` retain ratchet behaviour. (#1490)
- **Capability trust model was bypassable for project-scope third-party capabilities (#1459).** The consent signal for a project-scope capability was its in-repo project ledger — but a project ledger is repo-plantable, so cloning or forging a repository activated that capability's executable surfaces (hooks, MCP servers) AND its declarative loop surfaces (steps, gates, contributions, federated config) AND its command dispatch with **no user decision on the machine running it**. The fix moves the authoritative consent signal off the repo tree into a new **user-owned consent store** at `${GSD_HOME||homedir()}/.gsd/consent.json` (new leaf module `src/capability-consent.cts`): a bounded, non-throwing, atomically-written store keyed by `(realpath(projectRoot), capability id)`. The security binding is a **recomputed full-bundle content hash** (`bundleContentHash` — a `sha512` over *every* regular file in the bundle, manifest AND artifacts AND identity, symlinks and non-regular entries rejected, bounded), **not** the repo-plantable ledger `integrity` (which is `''` for path/git/dir installs — a degenerate `'' === ''`) and **not** the executable-only disclosure signature (which is constant for a declarative-only capability, so a repo-write attacker could swap `capability.json` for a malicious gate/contribution while consent still matched). The loader **recomputes** the bundle content hash at load and activates a project-scope overlay — declarative surfaces and command dispatch alike — only when it matches the consent record on **this** machine; any tamper (a swapped declarative manifest, an edited hook script, an empty-integrity local install) changes the hash and leaves the capability *discovered but inactive* (`gsd capability list` reports `status: inactive` with a reason). Global-scope overlays (under the user's own home) remain trusted without a per-project record. The lifecycle records consent (bound to the installed bundle's content hash) on a consented project install/upgrade and revokes it on remove, deriving the project root through one canonical helper (`consentProjectRoot`) shared by the install record site, the loader lookup, and `trust revoke`, so an install from a sub-directory is not immediately inactive. The disclosure signature now also covers each MCP server's `transport`/`url`/`headers` (non-stdio endpoints), `env`, `cwd`, and the *raw* args array, plus a command module's `router`, and every surface line is JSON-encoded (no delimiter-injection collisions) — so a swapped remote endpoint, header, environment (e.g. `NODE_OPTIONS=--require evil.js`), entry point, or non-string arg forces re-consent. The consent store serializes concurrent cross-project writes under a lockfile (no lost updates), enforces its record cap at write time, uses a collision-safe on-disk key for paths containing spaces, and tolerates a vanished directory on the durability fsync. New CLI: `gsd capability trust list` and `gsd capability trust revoke <id> [--project <path>]`. The loader's per-scope ledger read now goes through the shared bounded fd reader (a repo-planted FIFO ledger can no longer hang the loader) and reuses the ledger's shared `isValidLedgerEntry` validator for committed-entry parity. Integration hardening: the overlay consumers (`capability-state`, `loop-resolver`, the federated config-loader/config-schema) now thread the consent home (`GSD_HOME`) explicitly to the loader so a consented project capability is never looked up at the wrong home; the loader's discovered-but-inactive warning carries a structural `kind: 'unconsented'` discriminant that `gsd capability list` filters on (rather than matching the reason prose); a reconcile rollback that deletes a project-scope bundle also revokes its now-stale consent so an identical re-drop stays inactive; `installCapability`/`upgradeCapability` warn on stderr when a project install supplies no consent store and when the consent-store write fails (the install still succeeds — a consent-store IO error never fails an otherwise-successful install); `gsd capability trust list` now exposes the stored `disclosureSignature` and `contentHash` for diffing; and when `GSD_HOME` resolves equal to a genuine project root an in-repo bundle still requires a consent record (it is not deduped as trusted-global). Convergence hardening: the content-hash canonicalization — the security binding itself — is now **injective and lossless**. It length-FRAMES every component (an entry count, then per entry a type tag, the uint32 path length + path bytes, and for files the uint64 content length + the **raw** content bytes read via a new raw-`Buffer` reader, never a lossy UTF-8 decode) so neither a `NUL` embedded in file content can fake a file boundary (the old `relpath + NUL + content + NUL` framing was non-injective) nor can two binary artifacts that differ only in invalid-UTF-8 bytes collide on `U+FFFD`; empty directories are bound via typed directory markers so adding/removing one changes the hash. `recordProjectConsent`/`revokeProjectConsent` now **throw** rather than perform an unlocked read-modify-write when the consent-store lock cannot be acquired (the lifecycle already treats a consent-write failure as non-fatal and warns, so an install still succeeds). The consent lock and the lifecycle lock are now ONE shared hardened primitive (`src/capability-lock.cts`) — process-start-time liveness identity + a hard deadman — so the consent lock can no longer stale-steal a slow-but-live writer (the old mtime-only 60 s steal could). Finally, the MCP disclosure signature now folds in a stable hash of the **full** server config object the writer persists (not only the whitelisted fields), so an upgrade that changes any host-honored field outside the whitelist (a future `envFile`/`workingDir`/launch option) still forces re-consent. A final convergence pass closes four residual gaps: (1) the loader's overlay-root dedup and the CB-3 "project root == global home ⇒ require consent" comparison are now keyed on `fs.realpathSync` (fail-safe to `path.resolve`), so a **symlinked `GSD_HOME` aliasing the project root** can no longer slip an in-repo bundle into the trusted-global slot — it still requires a consent record; (2) the loader reads `capability.json` through the shared **bounded** fd reader (regular-file + size cap) instead of a raw `fs.readFileSync`, so a project-planted FIFO/device or oversized manifest skips the overlay (warning) rather than hanging or OOM-ing the loop; (3) the **PATH** component of the content hash is now hashed from raw directory-entry **bytes** (a `{ encoding: 'buffer' }` walk, separator normalized at the byte level), so two bundle files whose names differ only in invalid-UTF-8 bytes (which a string decode would collapse to `U+FFFD`) no longer collide; and (4) the `gsd capability trust revoke` CLI now catches the consent-store lock-acquire failure and emits a clean, actionable error instead of surfacing a raw stack. A further convergence pass closes three more residual gaps and documents one irreducible limit: (1) the loader's user-owned consent gate now runs **before** the heavy pre-activation work (`materializeHookFragments` and cross-capability validation) for a project-scope overlay, so a forged in-repo bundle whose `fragment.path` points at an in-bundle FIFO/oversized file is skipped (unconsented → inactive) **without** ever reading that fragment — closing a pre-consent hang/OOM (the gate's decision is unchanged; only the work-ordering moved), and as defense-in-depth `materializeHookFragments` now reads each fragment body through the shared **bounded** fd reader (regular-file + size cap) so a FIFO/device/oversized fragment becomes an un-materializable-fragment validation error rather than a blocking read on any scope; (2) `gsd capability list` now reads each project `capability.json` through the same bounded reader instead of a raw `fs.readFileSync`, so a project-planted FIFO/device or oversized manifest omits that entry's metadata and exits cleanly rather than hanging/OOM-ing the list; (3) the loader's `canonicalDir` realpath **failure** is now strictly fail-safe — a candidate that would be classified trusted-`global` but whose `realpathSync` throws (a race/odd-FS, e.g. a symlinked `GSD_HOME` aliasing the project root) is reclassified conservatively to consent-required `project`, so it can no longer park an aliased project tree in the trusted-global slot (a non-existent global dir still resolves to a harmless no-op scan). Finally, an honest in-code comment at the loader consent gate documents the **irreducible filesystem-primitive TOCTOU residual**: the content hash binds the bundle at verification time, but a local writer racing between that verification and the capability's later execution can still mutate the bundle files — closing this window would require fd-pinned execution or an atomic content snapshot (native support not available at this layer); any persisted tamper is still caught on the next load (mirrors the #1462 lock-release residual — a documented real limit, not a dismissal). A final deep-convergence pass closes three more gaps: (1) the realpath fail-safe is now **two-sided** — a global overlay root is trusted (consent-free) ONLY when `realpath(global)` AND `realpath(project)` BOTH succeed AND resolve to DIFFERENT physical paths; the prior one-sided rule (demote only a realpath-failed *global* candidate) still let a **symlinked `GSD_HOME` aliasing the project root** bypass consent when the GLOBAL candidate realpathed fine but the PROJECT candidate's realpath failed (the keys never collided, so the in-repo bundle stayed in the no-consent global slot), so distinctness that cannot be proven (either side throws, or both resolve equal) now demotes the global to consent-required `project` whenever a genuine project root exists — while a genuinely non-existent project overlay (ENOENT) or a distinct real global root still stays trusted; (2) `bundleContentHash` now **bounds the enumeration itself** — it streams each directory via `fs.opendirSync` + `readSync` and throws the moment a cumulative entry counter exceeds the cap, BEFORE collecting/sorting a whole directory, so a malicious unconsented bundle with a huge single directory (or a deep tree) can no longer force unbounded memory/CPU before fail-closing (the cap is cumulative across the recursive walk; determinism is preserved by sorting the bounded set); and (3) a project `remove` no longer silently swallows the revoke-on-lock-failure throw — `revokeProjectConsent` throws on a consent-lock failure (a stale consent record a byte-identical re-drop could reactivate against), so `removeCapability` now surfaces it via a stderr warning naming the record AND a `consentRevokeFailed`/`consentRevokeWarning` flag on the result, which the CLI reports as a non-clean removal (telling the user to run `gsd capability trust revoke`). (#1473)
- 
**Capability `--integrity` is now verified or rejected per source, and hook commands are confined to the bundle** — a supplied `--integrity` pin was silently dropped for npm, git, and local capability sources (only the tarball source verified it), so a user could believe content was pinned when it was not. npm now verifies the pin over the `npm pack` `.tgz` bytes; git and local sources, which have no single hashable artifact, now reject a supplied `--integrity` with an actionable error instead of ignoring it. Separately, a capability hook's relative `script` was written verbatim as the hook command, so it resolved against the working directory (not the capability bundle) at hook-exec time and a crafted relative path could escape the bundle; the command is now resolved against the capability's own install dir and realpath-confined to it, then written as an absolute path. That absolute command is consumed by a shell, which exposed two further problems now fixed: (1) a manifest could ship a file literally named `run.sh; touch /tmp/pwn` (filenames may legally contain `;`, spaces, `$`, backtick, `|`, newline) and declare it as the hook `script`, so the emitted command injected a second shell command even though the file lived inside the bundle — the validator now rejects any hook script path outside a conservative `[A-Za-z0-9._/-]` allowlist (no whitespace, shell metacharacters, leading `-`, absolute path, or `..`), failing the install/load loudly, and the confinement helper mirrors the same rejection defensively; (2) the absolute path begins with the install-home directory, which commonly contains spaces (e.g. `/Users/Bob Smith/.claude/...`) and word-split or broke when written unquoted — the emitted command is now POSIX single-quoted so the install prefix can neither break nor inject. (#1460) (#1481)
- **The capability loader never crashes on a single malformed overlay, and untrusted manifest/tar reads are size-bounded (ADR-1244 D2 invariant)** — `loadRegistry` now makes the WHOLE per-candidate overlay-processing body total: ANY throw from ANY validator or step (including the committed `validateCapability`, which dereferences a malformed array entry such as `gates: [null]` / `steps: [null]` / `contributions: [null]` before its shape check) drops just that one overlay with a skip-warning instead of escaping the loader, while `gatePointsOf` is hardened to be total over null/non-array/malformed gates. The final canonical `buildRegistry` compose stays guarded: a throw on the merged set falls back to the frozen first-party registry plus a warning, records each dropped gate-declaring overlay's declared gate as blocked (`incompatibleGateCapIds` / `blockedGates`) so a dropped blocking gate FAILS CLOSED, AND now clears `_overlay.commandRoots` in the fallback so no dropped overlay retains a stale command root. Previously a malformed-array throw or a compose throw escaped the loader and crashed every consumer (loop-resolver, config-loader, surface, capability-state, gsd-tools). On the source side, the capability resolver/staging now reads every untrusted `capability.json` (tarball / npm / git / local) via the shared bounded fd-reader (regular-file + 8 MiB cap) instead of a raw `fs.readFileSync`, so an oversized or FIFO/non-regular extracted-or-local manifest can no longer OOM or hang the resolver; the fetch (`realHttpsGet`) bounds the downloaded response to 64 MiB; and `stageValidated` now enforces ONE uniform aggregate byte-budget (`MAX_STAGED_BUNDLE_BYTES`, 128 MiB) over the STAGED bundle directory via a bounded streaming walk (cumulative byte + entry counters; symlink / non-regular entries rejected) at the common staging chokepoint — AFTER staging and BEFORE validation/promotion — so a huge source tree, git repo, npm package, or gzip/tar bomb is rejected (and its staging dir cleaned up) before promotion, uniformly bounding the RESULT of `copyDirRecursive` / `git clone` / `npm pack` / `tar -x` that were previously only timeout-bounded. `copyDirRecursive` itself is now STREAMING and BUDGETED: it enumerates each directory via `fs.opendirSync` + `dir.readSync()` (one entry at a time) and threads CUMULATIVE entry (`MAX_STAGED_BUNDLE_ENTRIES`, 100k) and byte (`MAX_STAGED_BUNDLE_BYTES`) counters through the recursion, failing closed the MOMENT either cap is exceeded DURING the copy — closing a residual where the former `fs.readdirSync(src, { withFileTypes: true })` materialized the ENTIRE directory-entry array into memory at staging time (BEFORE the post-copy budget walk), so a hostile source whose tree held a directory of millions of tiny files (fetch < 64 MiB, but a colossal dirent array) could OOM the process during the copy before the budget could fail closed; the post-copy walk is retained as a cheap belt-and-suspenders re-verification on what actually landed in staging. The spoofable per-member `tar`-header size parse (`parseTarMemberSize`, which mis-anchored on BSD `tar -tv` owner/group columns such as a `Jan` group → fail-open) was REMOVED in favor of that non-spoofable staged-dir budget; `assertSafeTarMembers` keeps its unambiguous traversal / symlink / hardlink NAME and TYPE guards. (#1461) (#1475)
- **Capability ledger: fail closed on corruption, with durable atomic writes and a race-safe install lock.** A corrupt or unreadable `.gsd-capabilities.json` is now left in place and surfaced (not silently overwritten) — `install`/`update`/`remove`/`list`/`reconcile` fail closed and report it, so a corrupt ledger can no longer wipe prior capabilities' tracked files and shared-config fragments (which previously left unremovable orphans in `settings.json`/`hooks.json`). Ledger writes are atomic and crash-durable (exclusive temp file + `fsync` of file and directory + rename, with temp cleanup on failure). The per-capability lock is race-safe: a holder is identified by `(pid, process start-time, hostname)`, so a reused PID cannot deadlock recovery and a verifiably-live holder is never stolen, with a hard deadman timeout for unverifiable or cross-host holders. Untrusted ledger and lock reads are bounded (regular-file + size caps; FIFOs/devices rejected) and validated through a single shared entry validator (prototype-safe ids, DoS length caps). (#1462, ADR-1244.) (#1469)
- 
fix(#1478,#1479,#1480): prohibit ungrounded baselines, error-suppressing fallbacks, and stale-artifact authority in planner verify blocks (#1482)
- 
**`/gsd:pr-branch` now handles sub-repos defined in config** — when `planning.sub_repos` is set, the command scans each sub-repo for uncommitted changes and offers to create a branch, commit, push, and open a companion PR per sub-repo. Previously, sub-repos were silently ignored because all git commands ran against the shell's current directory instead of the intended repo path. All sub-repo git operations now use `git -C <repo>` so no shell-state assumptions are made. (#667)
- **`/gsd-new-project` AI Models prompt now exposes the `adaptive` model profile** — both onboarding paths (auto-mode and interactive) listed only Balanced/Quality/Budget/Inherit, so the `adaptive` profile (role-based cost optimization across Claude/Codex/Gemini/OpenRouter/local) was unreachable through `/gsd-new-project` despite being a first-class catalog entry and documented in CONFIGURATION.md. Both prompts now use the proven two-question split (Q1: Adaptive / Standard tier / Inherit; Q2: Quality / Balanced / Budget) already shipped for `/gsd:settings` (#3784), and both `config-new-project` example payloads list `adaptive`. (#1516) (#1654)
- **`--raw` CLI commands no longer drop stdout on the error path** — a command that emitted a JSON result/error envelope and then exited non-zero previously lost all of stdout (the output-capture wrapper discarded its buffer when the command threw to set a non-zero exit); the buffer is now flushed before the error propagates. (#1457) (#1457)
- **`gsd install`/upgrade now recovers a malformed `~/.gsd/defaults.json` instead of leaving it broken** — a `defaults.json` containing a valid-JSON-but-non-object value (`null`, `[]`, a number, or a string) bypassed the parse `catch` and flowed through unrecovered: `null` threw a TypeError (swallowed by the outer guard, logging a confusing "Could not write" warning and leaving the file as `null`), while `[]`/`42`/`"str"` silently kept their broken shape on every install. The non-Claude finishInstall step now resets any non-object parse result to a fresh `{}` before reading/writing it, so the file is repaired and `resolve_model_ids` defaults normally. (#1661)
- **Shipped milestones with a retired/folded phase now reach 100%** — a phase struck through in ROADMAP (marked `[x]`, with a directory but no completion artifact) was counted in `progress.total_phases` but could never be counted complete, freezing the milestone below 100% (e.g. 5/6 = 83%) with `state sync --verify` reporting no drift. Both STATE counting paths (`state json` and `state sync`) now exclude retired phases — detected from GFM strikethrough whose subject is the phase on a checklist/heading line — from both the phase-dir set and the heading count, via the canonical phase-id helpers so numeric, decimal, and project-code IDs match alike. (#1514) (#1568)
- **Codex installs no longer run with unsafe Claude-style worktree isolation** — a Codex install with a runtime-neutral `.planning/config.json` was resolving its runtime as Claude and enabling git worktree isolation, which Codex's `spawn_agent` cannot honor; the Codex fail-closed guard was also silently dead because runtime/worktree config was read JSON-quoted and broke shell equality checks. Codex-emitted workflows now resolve `runtime=codex`, default `workflow.use_worktrees` to `false`, and fail closed when worktrees are forced on. (#1515) (#1519)
- **Windsurf installs expose /gsd-* commands in Cascade again** — Windsurf runtime installs now emit workflow files under .windsurf/workflows instead of dead skills-only artifacts. (#1615) (#1622)
- **Capability `settings.json` hooks no longer fire on every tool and no longer fail when non-executable** — installing a capability that declared a tool-scoped `PreToolUse`/`PostToolUse` hook wrote the entry with no `matcher`, so a guard intended for only `Write|Edit` fired on every tool call (including `Bash`) and a fail-closed guard could block the whole session; the emitted command was also a bare script path, so a `.js`-family hook delivered via `git`/tarball that lost the executable bit failed with `Permission denied` on every matching call. Install now honors a declared `matcher` (absent = match-all, unchanged for existing capabilities) and emits a `node`-prefixed command for `.js`/`.cjs`/`.mjs` hooks so they run regardless of file-mode bits. (#1634) (#1638)
- **`/gsd:secure-phase` now honors the configured ASVS level and block threshold** — the security auditor previously received unsubstituted `{SECURITY_ASVS}` / `{SECURITY_BLOCK_ON}` placeholder text because secure-phase.md never assigned those variables. It now resolves `workflow.security_asvs_level` and `workflow.security_block_on` from config (`--raw`) before the auditor handoff. (#1625) (#1633)
- **Phase transitions now require fresh canonical verification** - implementation-complete phases no longer advance when verification is missing, gap-bearing, human-pending, or stale relative to phase summaries. (#1548)
- **The security audit gate now respects `workflow.security_block_on` severity** — `/gsd:secure-phase` previously blocked phase advancement on *any* open threat regardless of severity, so the documented `security_block_on` threshold had no effect (and the auditor's block vocabulary didn't even match the config enum). Threats now carry a per-threat **Severity** (critical|high|medium|low), and only open threats at or above the configured `security_block_on` severity count toward the blocking gate (`SECURITY.md threats_open`); `none` disables blocking, and a missing/unparseable severity fails closed as critical. (#1626) (#1635)
- `verify codebase-drift` now reads `workflow.drift_action` and `workflow.drift_threshold` from the correct nested config shape — previously both keys silently no-oped because `loadConfig()` returns a flattened object and `config?.workflow` was always `undefined`. (#1504)
- **`check.decision-coverage-plan` no longer false-passes when CONTEXT.md decisions use the titled-colon bullet form** — `parseDecisions` recognized the colon-immediate (`- **D-NN:** text`) and em-dash (`- **D-NN — title** body`) forms but dropped the titled-colon form (`- **D-NN: Title.** body`, where a title sits between the colon and the closing `**`) via the parse-miss guard. When all decisions used the titled convention, the parser returned 0 decisions and the coverage gate passed vacuously. A third per-form regex (checked last, a strict superset of the colon form) now parses the titled-colon form; id and `[tags]` trackability are honored. (#1665)
- **`npm version` no longer leaves `capability-registry.cjs` stale** — the `version` npm lifecycle script now regenerates and stages the capability registry after stamping new version strings into all capability manifests, preventing the 1.6.0-rc regression where `gen-capability-registry.cjs --check` failed. (#1498) (#1499)
- **Antigravity installs all GSD slash-command skills where AGY can discover them** — concrete skills such as /gsd-progress and /gsd-verify-work now land directly under the Antigravity skills directory instead of router-nested folders. (#1614) (#1616)
- **`frontmatter set` on an object-list field now fails closed instead of silently doing nothing** — setting `must_haves` (or another object-list field) to a value whose lossy parse projection matched the original's was a silent no-op: the command reported `{updated:true}` but the change never applied (the writer's scalar-only parser had flattened both to the same shape). `frontmatter set` now detects a no-op write for dict-valued fields and surfaces a clear error directing the user to edit the file directly. Scalars and scalar arrays round-trip faithfully, so idempotent sets of those still report `{updated:true}` (no false positive). (#1664)
- **`config-set` now rejects invalid config values instead of storing them silently** — out-of-enum strings, JSON array/object coercion (e.g. `["high"]` stored as an array in a scalar key), and wrong-typed values for capability-registry-owned keys are validated against each key's declared schema at set time. Previously these were accepted and persisted, mis-configuring GSD. (#1628) (#1632)
- **OpenCode and other AGENTS-native runtimes now get a root `AGENTS.md` from `/gsd:new-project`** — the workflow hardcoded a codex-only branch that sent every other runtime to `.claude/CLAUDE.md`, a location OpenCode never loads. A shared `getProjectInstructionFile(runtime)` policy (claude→`.claude/CLAUDE.md`, codex/opencode/kilo/kimi→`AGENTS.md`, copilot→`.github/copilot-instructions.md`, antigravity/gemini→`GEMINI.md`) is now the single source of truth consumed by both the new-project workflow and the generate-claude-md path, with a parity test guarding drift. (#1574)
- `roadmap upgrade` now rejects an unsupported or malformed `--convention` value (including the `--convention=` form) instead of silently running the milestone-prefixed migration, and no longer hard-exits inside the command-routing hub. (#1539)
- **`phase complete` no longer duplicates a By-Phase row when the phase number's padding differs** — completing a phase by its unpadded number (e.g. `phase complete 5`) against an existing zero-padded By-Phase row (`| 05 |`) appended a second `| 5 |` row instead of updating it, double-counting the phase in any column sum. The row matcher now canonicalizes a numeric phase to its integer form (matching `5`, `05`, `005` in either direction), so the existing row is upserted regardless of padding. (#1663)
- **Non-Claude installs no longer rewrite an explicit `resolve_model_ids: true` to "omit"** — Codex, OpenCode, Gemini, and the other non-Claude runtimes were silently clobbering the deliberate opt-in to full materialized model IDs on every install/upgrade, so generated agent manifests inherited the active chat model instead of pinning the resolved model. The finish step now only defaults `resolve_model_ids` to "omit" when it is absent or falsy; an explicit `true` is preserved. (#1569) (#1653)
- A failed `roadmap upgrade --apply` now actually rolls back .planning/ even when it is gitignored (commit_docs:false), instead of reporting a successful rollback while leaving the workspace half-migrated. Rollback is surgical and no longer runs a whole-repo git reset --hard. (#1543)
- **Codex runtime no longer crashes on startup** — every `gsd-tools` command previously aborted with `Cannot find module '../../../package.json'` on Codex, whose runtime root has no `package.json`, because a module in the loader chain did a top-level require of it. The version emitted into Hermes skill frontmatter is now sourced lazily from the installed `gsd-core/VERSION` (validated semver), so `gsd-tools` loads on every runtime and never emits `version: undefined`. (#1383) (#1409)
- **`/gsd-*` commands in Windsurf Cascade resolve their command bodies** — Windsurf slash-command workflows delegate to canonical command bodies at gsd-core/commands/gsd/X.md, but the install never copied those files. Commands appeared in the `/` menu yet silently failed when invoked because the LLM was told to read a missing file. Installs now copy commands/gsd/*.md into the workflow delegation target. (#1630)
- **`query agent-skills` no longer returns empty output on Windows** — the plain (non-`--json`) path wrote the `<agent_skills>` block then immediately called `process.exit(0)`, which truncated the async stdout buffer on Windows pipes/files so every `${AGENT_SKILLS_*}` workflow capture expanded empty and configured per-agent skills were silently dropped. It now flushes synchronously via the same `writeAllSync` helper the `--json` path uses. (#1400) (#1410)
- **`phase complete` now updates the By-Phase table on CRLF (Windows) STATE.md files** — the By-Phase table matcher required bare `\n` line endings, so a STATE.md written or hand-edited with CRLF (`\r\n`) was treated as having no table: the completed phase's row was never upserted (and, with the velocity-from-table derivation, the total went stale). The matcher is now CRLF-tolerant (`\r?\n`) on the header/separator/lookahead, so CRLF STATE.md files are handled identically to LF. (#1662)
- clean up stale get-shit-done paths in Codex and Kimi skill mirrors on upgrade (#1453) (#1453)
- add phase.list-plans to gsd-tools — the command was referenced in agents/gsd-plan-checker.md but was missing from the router, causing 'Unknown phase subcommand' on every invocation (#1437)
- roadmap analyze no longer reports phantom missing_phase_details for milestone-prefixed (M-NN) phase IDs (#1552)
- **`workflow.security_asvs_level` now actually scales security rigor** — it was display-only (the planner hardcoded ASVS L1 and the auditor only echoed the level), so L2/L3 behaved identically to L1. The configured ASVS level now scales both planner threat-disposition rigor and auditor verification depth (L1 grep-presence → L2 boundary/vector checks → L3 end-to-end trace), defined in a new `references/security-asvs-levels.md`; the secure-phase clean-phase short-circuit now spawns the auditor at L2/L3 so deep verification runs even when the preliminary grep classification is clean. (#1627) (#1636)
- Atomic file writes now retry a transient rename lock on Windows (a reader holding the target open) instead of falling back to a non-atomic write that could let a concurrent reader observe a truncated STATE.md/ROADMAP.md. (#1541)
- **Misconfigured agent skills no longer fail silently** — when an agent's configured `agent_skills` paths all fail to resolve (e.g. a missing `SKILL.md`), `gsd-tools query agent-skills` now emits an aggregate warning to stderr and adds a `warnings[]` field to its `--json` output, instead of returning an empty block with no signal. (#1376) (#1376)
- **Decision-coverage gate now reads markdown-header and em-dash decisions, and fails loud when it can't parse them** — `check.decision-coverage-plan` (a blocking gate) and `gap-analysis` previously extracted **zero** decisions from a populated CONTEXT.md that recorded its decisions under markdown headers (`## Locked decisions`) or with em-dash bullets (`- **D-1 — title**`), and silently reported a clean pass — so real decisions went un-checked. Decisions in those shapes are now recognized, and when decision-shaped content cannot be parsed (or a `- **D-NN**` bullet is malformed), the gate fails loud with a format-mismatch message instead of passing. (#1386) (#1386)
- **`phase complete` no longer double-counts Total plans completed velocity on re-run** — re-running `phase complete` on an already-complete phase incremented the velocity total each time (2 -> 4 -> 6 ...), because the metric re-read the cumulative total and blind-added the phase's plan count on every invocation. The total is now derived from the By-Phase table's Plans column (the same source the table upserts against), so re-completing a phase upserts the same row and the sum stays stable — and a hand-edited inflated total self-heals to the true sum on the next completion. (#1582) (#1655)
- verify schema-drift now resolves the target phase by its canonical token instead of substring containment, so a non-existent phase no longer silently matches a token-superstring phase (e.g. "1" matching "11-expansion") and runs the drift gate against the wrong phase. (#1640)

### Security

- **Prompt-injection defence extended to the untrusted-input surface (LLM-playbook principle 12)** — the read-injection scanner (a pattern-based pre-filter) now also scans WebFetch/WebSearch output (closing the largest untrusted channel at ingress), and the 10 research/doc-ingest agents (issue #1577 AC #2's named eight plus `gsd-ai-researcher` and `gsd-domain-researcher`, both web-ingress) isolate fetched/read content as data-not-instructions via a shared `untrusted-input-boundary` reference — this prompt-level boundary is what keeps an injection from being *followed*. An opt-in `security.injection_blocking` (registered config key; default advisory, unchanged) upgrades HIGH-confidence detections to a PostToolUse circuit-breaker: since the hook runs after the fetch, `decision: "block"` halts the agent's next step rather than redacting the already-fetched content (it is not a redactor). Based on arXiv 2506.05739 (PPA), 2507.15219 (PromptArmor), 2504.20472, 2503.00061. (#1585)
- **Third-party capability trust gate (ADR-1244 Phase 4)** — installing a capability from a git/npm/tarball/local source now discloses every executable surface it ships (hooks, command modules, MCP servers, with the actual commands) and requires explicit consent before anything is promoted; integrity (sha512) and `engines.gsd` are verified before any code is staged, install never executes capability code, and reserved `gsd-`/`gsd-core-`/`anthropic-` namespaces are refused. `capabilities.strict_known_registries` gates which sources may be installed (`[]` = local-only lockdown; host-based allowlist otherwise) and `capabilities.auto_update` is off by default, re-prompting whenever a new version's executable set changes. An install ledger makes `remove` surgical (strips only the capability's own shared-config entries, preserving your hand-edits) and `update` an atomic, crash-safe stage-then-swap. (#1449) (#1449)

## [1.5.0] - 2026-06-17

### Added

- **`gen-capability-registry` now rejects duplicate artifact producers at the same Loop Extension Point** — if two capability `steps` declare `produces: [<same artifact>]` at the same point, the generator throws at gen time naming the artifact, the point, and the producing capability ids, instead of letting the topological sort pick a winner silently (which left ADR-857 Decision #6's data-flow contract undefined). The check counts distinct `(capId, stepIdx)` producer steps, so a single step listing an artifact twice does not false-positive. ADR-894 §4's enumerated cross-capability invariant list gains the artifact-production-uniqueness rule. (#1123) (#1131)
- **`gsd-tools drift-guard` — deterministic plan-drift severity/authority decisions (ADR-22).** The plan-review source-grounding pass now classifies cited-symbol drift through a tested seam (5-rung authority ladder, `grep`→`intel` auto-upgrade, severity mapping, rung≥3 hard-block) instead of re-deriving the rules from workflow prose on each run. (#1190) (#1242)
- **`/gsd-progress --next --auto --converge` now routes planning through plan-review convergence.** ADR-15's designated *primary* convergence surface is wired into the progress/next workflow (previously only `/gsd-autonomous --converge` honored it; on `/gsd-progress` the flag was silently dropped). Accepts `--cross-ai` as an alias plus reviewer flags and `--max-cycles N`, and is gated on `workflow.plan_review_convergence`. (#1190) (#1237)
- 
**`gsd-tools query teams-status` + a plan-phase warning detect claude-code agent-teams** — GSD's multi-agent orchestration can stall under claude-code's experimental agent-teams (a subagent's completion can fail to route back to the orchestrator). A new read-only `query teams-status` command reports `{ active, runtime, env_present, source }` (and `--active` for a clean shell guard), and `/gsd:plan-phase` now emits a single non-fatal warning when agent-teams is detected, recommending you disable it for GSD workflows. The detector only activates on the `claude` runtime with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` strictly truthy — every other runtime and the teams-off path are completely unaffected. (#1355) (#1371)
- spec-phase: prohibition probe — a prose-orchestrated Step 5.6 that surfaces the unwritten *must-NOT* constraints (values/safety/ethics) a feature could silently become but the spec never forbids. Two stages per requirement: an adversarial recall question ("what could this silently become that the author would NOT want?") then a one-pass precision classifier that drops routine engineering and keeps genuine prohibitions. Confirmed prohibitions become NEGATIVE SPEC acceptance criteria carrying a `test`/`judgment` verification tier, which plan-phase lifts into the `must_haves.prohibitions` sibling block (`truths` untouched). Judgment-tier items soft-gate at verify time (never silent, never hard-halt); unwired test-tier items fail closed. The recall stage is model-driven (no compiled engine); canon-bound concerns (OWASP/GDPR/fairness) are referred to `/gsd:secure-phase`. Additive and optional: existing SPECs without a Prohibitions section remain valid. Second adapter of the `probe-core` resolution model (ADR-550 Decision 7). (#1149)
- **Optional `## Business Context` section in the PROJECT.md template** — a four-field block (Customer, Revenue model, Success metric, Strategy notes) for monetized or customer-facing projects, positioned between Core Value and Requirements. Optional by default (an HTML comment tells non-business projects to delete it), capped at four one-line fields to stay a constraint reference rather than a business plan, and reviewed at each milestone by `/gsd-complete-milestone` when present. (#72) (#756)
- **Async external jobs can now defer an Execute step legally (`external_job_waiting`).** An Execute step that dispatches a long-running external job and commits a `.planning/async-jobs/<job>.json` manifest — deferring `SUMMARY.md` — is now recognized as a *legal deferred state*, not an illegal partial-plan state. `execute-phase` safe-resume, `resume-project`, and `pause-work` reconcile against the manifest instead of re-dispatching (which would duplicate the external compute). This defines the versioned, scheduler-agnostic manifest **stability contract** consumed by the core loop; the scheduler adapter that *produces* manifests is the capability half (#1164). (#1165) (#1221)
- **MemPalace memory capability (opt-in)** — adds cross-session/cross-project recall and verbatim+temporal-KG capture at GSD loop boundaries via the MemPalace MCP server and CLI; disabled by default, skip-on-error. (#1201) (#1201)
- spec-phase: spec-completeness edge-probe — a taxonomy-driven Step 5.5 that walks each SPEC requirement against a closed 8-category edge taxonomy (boundary, adjacency, empty/degenerate, encoding, ordering, precision, idempotency, concurrency), proposes concrete candidate edges, and resolves each to covered/dismissed/backstop/unresolved. covered edges add acceptance criteria the planner lifts into must_haves.truths; a soft gate flags unresolved edges. Additive and optional: existing SPECs without an Edge Coverage section remain valid. (#584)
- **`phase uat-passed` predicate** — new runtime-neutral command evaluates HUMAN-UAT results with markdown-aware parsing (ignores frontmatter, fenced code, blockquotes, and HTML comments) and reports pass only when every required check passes. (#1063) (#1063)
- Bug-report issues that lack a valid GSD Version are now auto-closed on open by a new `version-gate.yml` GitHub Actions workflow. GitHub Issue Forms only enforce `required: true` in the web UI, so issues filed via the REST API, `gh issue create`, or AI reporters can arrive without a version; values like `idk`, `_No response_`, or an empty field are treated as missing. Affected issues receive a closing comment with instructions to add the version (e.g. `1.18.0`) and reopen; maintainers can add the `version-exempt` label to opt an issue out. (#1181)
- **Kimi CLI runtime support is now documented and installable** — users can install global GSD Agent Skills with `--kimi --global`, invoke them as `/skill:gsd-*`, and launch the generated custom agent explicitly with `kimi --agent-file`. The custom-agent (`--agent-file`) surface targets the legacy/Python `kimi-cli` contract; newer Kimi Code (`@moonshot-ai/kimi-code`) consumes the same `/skill:gsd-*` skills via `--skills-dir` instead. (#743)
- **`agent_skills` can now reference Claude-Code plugin-provided skills** via the namespaced `global:<plugin>:<skill>` form (e.g. `global:coderabbit:code-review`). On the Claude runtime the agent's skills block emits a by-name Skill-tool load directive that resolves the plugin skill (no plugin-cache path is read); path-resolvable skills keep the existing `@`-include unchanged; on non-Claude runtimes a namespaced entry is skipped with a warning. The 22 agent_skills-consumer agents now carry the `Skill` tool so they can load plugin-provided skills. (#1261)
- **`gsd-tools capability set` — turn capabilities on/off and gate hooks from one command.** Adds the write side of the capability system (ADR-857/ADR-1213): `capability set <id> --on|--off` toggles a capability through the runtime surface (the canonical on/off switch) and `--gate <key>=<true|false>` toggles a hook within an enabled capability, then re-resolves and reports — so disabling a capability is consistent across surface and config ("off means off") as a write-time invariant. `/gsd:settings` capability hook-gates now route through it. (#1213) (#1225)

### Changed

- Added an opt-in `anthropic-fable` model policy provider preset for Claude Fable 5 high-budget routing while preserving the existing Anthropic Opus 4.8 defaults and `anthropic` provider preset. (#1014) (#1015)
- **Windsurf/Devin workspace skills now install to the canonical `.devin/skills/` directory** — fresh workspace installs write skills under `.devin/skills/` (Devin Desktop's documented preferred location) instead of `.windsurf/skills/`; the legacy `.windsurf/skills/` layout is still recognized. The global `~/.codeium/windsurf/skills/` path is unchanged. (#1093) (#1093)
- 
**`loadCentralConfigKeys` now fails loud on a malformed central config-schema instead of silently returning an empty Set** — `ENOENT` (the schema legitimately absent) still returns an empty Set silently, but a JSON parse error or any other read failure now writes a prominent `stderr` warning naming the schema file and throws `ExitError(1)`. Previously a single `catch (_)` swallowed parse errors too, so a merge-conflict marker or truncated write in `config-schema.manifest.json` made every capability config key look non-central — the config-key collision / `pending-migration` gate fired zero warnings and `--check` passed clean, defeating the gate invisibly. (#1124) (#1131)
- **Capability hook rendering now consumes resolved Capability State** — `gsd-tools loop render-hooks` uses the same installed/surfaced/configured state reported by `gsd-tools capability state`, so disabling a migrated capability at the runtime surface removes its workflow hooks even when config defaults are enabled. Migrated capability config keys remain accepted through the generated capability registry/federated config path instead of duplicated central `VALID_CONFIG_KEYS` entries. (#1136) (#1153)
- 
Added ADR-857 Phase 6 capstone conformance coverage so migrated Capability activation keys cannot be read directly from host loop workflows, Capability-owned config keys stay out of the central schema, and the host loop workflow size budgets remain documented. The verify-work UI automation preflight now resolves UI activation through the Capability hook registry instead of reading `workflow.ui_phase` directly. (#1158)
- **ADR-857 phase 6 complete: optional features are now Capabilities, not inline loop branches.** `tdd`, `schema-gate`, `drift`, `gap-analysis`, and `profile-pipeline` are migrated out of the five-step host loop into declarative Capabilities (loop hooks + a command family); their config keys are federated to capability ownership; and the `plan-phase`/`execute-phase` workflow bodies shrink accordingly. Two previously-declared-but-dead capability gates now actually fire — the security ship-time gate (`ship:pre`) and the UI safety gate (`execute:wave:post`) — and the phase-6 conformance gate is hardened to be un-gameable (rejects empty stubs, requires loop-body shrink, verifies hook dispatch and gate-result contracts). Behavior is preserved, verified across five adversarial review passes. (#1139, #1167, #1168, #1169) (#1183)
- 
**Test-tier prohibitions are now a real, provable gate instead of a permanent, unsatisfiable `gaps_found`** — the deferred ENFORCEMENT half of ADR-550 Decision 5d (the "heavy half" that #644 / PR #1149 deferred) has landed. A new deterministic `check prohibition-enforcement` sub-command (authored as `src/prohibition-enforcement.cts`, compiled by `build:lib` to the gitignored `gsd-core/bin/lib/prohibition-enforcement.cjs`) is the missing PRODUCER: it locates the wired mechanical check, runs it for a genuine **non-vacuous** pass, builds `enforcementEvidence`, and emits the `dispositionForProhibition()` verdict. The previously-unreachable green branch in `dispositionForProhibition()` is now reachable from the live pipeline — a test-tier prohibition with a genuinely-passing wired check disposes `green` and can reach `passed`, while a missing, non-attested, or non-passing check hard-gates (flagged, never green → `gaps_found`) in BOTH interactive and autonomous modes (ADR-550 D4 / D3). `verify-phase.md` wires the consumer; the green/fail-closed policy in `src/probe-core.cts` is untouched. Both wired-check kinds are accepted (ADR-550 D2): a `node --test` negative test (requiring a real reported test — an empty file, which `node --test` counts as one passing "test", does NOT green) AND a lint/AST rule run as `eslint --format json` filtered by `ruleId` (so plugin rules like `local/*` load — bare `--rule` cannot), anchored on the in-tree `local/no-source-grep` rule (dogfooding, ADR-550 D4). This enforcement seam is the concrete instance of ADR-857 open-question §147 and lands on the core verify rail, never in `capabilities/` (D6). (#1259)

**Honest scope — `failFirst` is caller-attested, not yet machine-proven.** This lands the *execution + non-vacuous-pass* half: the producer requires the caller to attest `failFirst: true` and the check to genuinely run and pass. It does NOT yet independently prove the check *fails-on-violation* (the literal `regression-must-fail-first` property) — cheap proof of that at verify time needs running the check against a known violation fixture, which is a **tracked follow-up (#1279)**. The red-first property currently rests on caller attestation, surfaced transparently in the evidence record.

**Correction to the issue body (#1259):** the issue's "96 invalid/error negative-proof cases" figure is wrong. For the `no-source-grep` anchor specifically, the genuine `regression-must-fail-first` proofs are its **two `invalid` cases** (the `.includes()` and `.match()` blocks) in `tests/eslint-rules.test.cjs` — not 96. The anchor argument is unaffected (those two cases ARE real fail-first proofs); only the count was off. (#1273)
- **The test-tier prohibition gate now has a deterministic SOURCE for its wired check** — a resolved `test`-tier `must_haves.prohibitions` item MAY carry an optional `check` descriptor authored at spec-phase: the flat-scalar keys `check_kind` (`node-test` | `lint-rule`), `check_target`, and `check_rule` (lint-rule only). `projectProhibitions` projects these scalars deterministically and verify-phase reads them back (via `descriptorFromProjection`) to locate the check handed to `check prohibition-enforcement` — so a wired, passing test closes the gap with **zero manual descriptor authoring** (previously the verify-phase LLM had to invent `{kind, target, rule}` each run, #1259). This extends the ADR-550 Decision 3 prohibition-item shape (ratified in a dated 2026-06-15 ADR-550 addendum). The descriptor is **optional and fully backward-compatible** — a prohibition with no descriptor parses and disposes byte-identically to today — and **fail-closed**: a partial, invalid, or absent descriptor falls through to the producer's existing fail-closed locate, never a silent green. The descriptor is represented as flat scalars (not a nested `check:{}` object) to keep the shared `parseMustHavesBlock` round-trip regression-free. Out of scope: machine-proven fail-first (#1279) and the `dispositionForProhibition` policy stay unchanged. (#1278) (#1301)
- 
**Test-tier prohibition fail-first is now MACHINE-PROVEN, not caller-attested** — the deferred literal `regression-must-fail-first` property of ADR-550 Decision 4 (the gap #1259 / PR #1273 left as a tracked follow-up) has landed. The `check prohibition-enforcement` producer (`src/prohibition-enforcement.cts`, compiled by `build:lib` to the gitignored `gsd-core/bin/lib/prohibition-enforcement.cjs`) no longer trusts the caller's `failFirst` attestation: before a clean, non-vacuous pass can dispose a `test`-tier prohibition green, the new `defaultProveFailFirst` prover independently RUNS the wired check against a KNOWN VIOLATION and confirms it goes RED. Attestation is gone from the green AND (`passed = proof.provenFailFirst === true && run.passed === true`); any other outcome — passes-on-violation, can't-prove, throws, times out, or no violation source — **hard-gates in BOTH interactive and autonomous modes** (ADR-550 D4 / D3). The evidence record gains a `failFirstProof` field recording HOW fail-first was proven (FF-07). A caller can no longer green a toothless check.

The violation is sourced from a new descriptor field, **`CheckDescriptor.violationFixture`** — an author-supplied path to a known-bad subject. For a `lint-rule` the prover lints that fixture and requires the rule id to appear in the JSON report (the rule must have teeth); for a `node-test` the prover spawns the negative test with the subject injected through the **`GSD_PROHIB_SUBJECT`** env convention and requires a NON-VACUOUS red — `# fail >= 1` AND a failing test named distinctly from the file (`isNonVacuousNodeTestRed`), so a violation fixture that merely CRASHES the test at load is not mistaken for the negative assertion firing red (symmetric with the clean-pass non-vacuity guard). The node-test prover also requires the `violationFixture` to EXIST (resolved against `cwd`) before spawning — a missing/typo'd path fail-CLOSES rather than letting an honest test's ENOENT crash forge a green (symmetric with the lint path's file-result guard). The deterministic spec→verify path composes end-to-end: a fourth flat scalar **`check_violation_fixture`** is projected by `projectProhibitions` and read back by `descriptorFromProjection` (rides both kinds), so a prohibition authored with all four `check_*` scalars machine-proves fail-first and greens through the projection alone — zero hand-authoring at verify time (#1278 + #1279 + #1346; round-trip pinned by a fast-check property + CHK-03(D) + an end-to-end COMPOSE capstone). One documented residual remains under **#1346**: the node-test proof confirms the fixture exists and the check reds, but cannot generically prove the red was *caused by* the subject's content rather than by the env merely being set. The `lint-rule` path is fully shippable now and is dogfooded against the in-tree `local/no-source-grep` rule; the `node-test` path ships its mechanism (a fixture-bearing descriptor IS machine-proven) and is exercised by SYNTHETIC temp fixtures — there is no live in-tree `node --test` prohibition to dogfood. `CheckDescriptor.failFirst` is **DEMOTED, not removed** (FF-08): it is kept as a non-authoritative hint so the #1259 route-JSON shape and the `CheckDescriptor` type stay backward-compatible mid-migration, but no path greens on it alone. The green/fail-closed policy in `src/probe-core.cts` (`dispositionForProhibition`, reads only `evidence.length > 0`) is untouched; the evidence array shape is additive. This closes ADR-550's D5d follow-up — see the dated 2026-06-15 ADR-550 addendum. (#1279)

**PR-review flag — `GSD_PROHIB_SUBJECT` + `violationFixture` are PROPOSED, renamable conventions.** Both are net-new surface with ZERO live in-tree consumers (no in-tree node-test prohibition yet; node-test proof runs only on synthetic test fixtures, the real dogfood stays the lint-rule). They are forward-looking scaffolding, so a later rename — or replacing the env var with an argv — is a mechanical, zero-migration find/replace. Surfacing them here so the maintainer can **ratify, rename, or replace them at PR review** with no migration cost, exactly as #1278's ADR addendum was reviewed at PR time. The `failFirst` demotion is likewise open to weighing outright removal; the keep-as-hint rationale is recorded in the ADR addendum. (#1314)
- **Read-only verifier/auditor agents now ship a Claude-Code `disallowedTools` deny-list** — the installer injects a framework-level write-tool deny-list into the Claude copies of the read-only verifier/auditor agents (gsd-verifier, gsd-plan-checker, gsd-integration-checker, gsd-doc-verifier, gsd-eval-auditor, gsd-ui-auditor, gsd-ui-checker) so write actions are blocked even if a tool grant is inherited. Injected for Claude only; other runtimes are unaffected. (#1081) (#1081)
- 
**Antigravity workspace skills now install to the canonical `.agents/` directory** — fresh installs write workspace artifacts under `.agents/` (the Google-Codelabs-documented base) instead of `.agent/`; the legacy `.agent/` layout is still recognized so existing installs keep working. The global `~/.gemini/antigravity/` path is unchanged. (#1090) (#1090)
- 
**`devin-desktop` runtime alias for the Windsurf→Devin Desktop rebrand** — the `windsurf` runtime now also answers to `devin-desktop` (CLI `--devin-desktop`), aiding discoverability after Cognition rebranded Windsurf as Devin Desktop. All paths are unchanged — global skills still install to `~/.codeium/windsurf/skills/`. (#1086) (#1086)
- Remove dead `loadConfig` export from `configuration.cts` — superseded by `config-loader.cts` (ADR-857 phase 2e, #885). All live callers already import `loadConfig` from `config-loader.cjs` or the `core.cjs` back-compat re-export; exhaustive grep confirms zero callers importing it from `configuration.cjs`. `configuration.cjs` now provides only the pure normalization and defaults primitives (`normalizeLegacyKeys`, `mergeDefaults`, `migrateOnDisk`, `CONFIG_DEFAULTS`) that `config-loader.cjs` depends on. (#893) (#893)
- audit(#779): correct stale model-catalog IDs verified against live provider sources. The gemini opus default `gemini-3-pro` → `gemini-3.1-pro-preview` (the bare `gemini-3-pro` ID is undefined in gemini-cli source — only `gemini-3-pro-preview`/`gemini-3.1-pro-preview` exist) and the codex sonnet default `gpt-5.3-codex` → `gpt-5.4` (deprecated per OpenAI's Codex models page); the same two IDs are also updated in the `google`/`openai` provider-preset entries. `qwen3-coder-next` was verified valid (callable on Alibaba Model Studio) and left unchanged. Adds a regression guard against the retired IDs and a sourcing/verification note in CONFIGURATION.md. Catalog IDs are internal defaults; users who pinned the old IDs must update their config. (#1047)
- **INVENTORY.md no longer carries `(N shipped)` count scalars** — the hand-maintained absolute counts collided silently on merge (two branches each bumping the same integer to N+1 while the merged tree held N+2), red-flagging CI on the merge commit across all platforms. The manifest's name-set is now the sole registry, anchors are count-free and stable, and a guard test blocks re-adding a count. (#1179) (#1179)
- Edge-probe `precision` probe text now names tie-breaking / rounding-mode (half-up vs half-to-even, ceil/floor/truncate), so a surfaced precision edge cues the most common rounding failure mode. Prose-only; firing rule and the 8-category core unchanged. (#1108)
- Capability manifests now declare runtime compatibility through a validated runtimeCompat contract, and runtime descriptor interpreters now read artifact layout, skills-home, and hook-surface facts directly from runtime Capability descriptors instead of parallel runtime-name allowlists or fallbacks. This preserves existing supported runtime behavior while making future descriptor-backed runtimes additive. (#1157)
- Planning-time research, AI integration, and pattern mapping now participate through Capability declarations and rendered plan:pre hooks, with developer documentation for building GSD capabilities. (#1141)
- **The planner now blocks plans that would self-trip their own verify gate** — when an acceptance criterion negative-greps for a literal (`grep -c 'LIT' file == 0`) and that same literal appears verbatim in an `<action>` body, plan creation now fails at write time instead of letting the executor waste cycles on a comment-text echo at commit time. Unquoted/ambiguous grep targets warn instead of failing; add `<!-- planner-discipline-allow: LIT -->` to allowlist a legitimate occurrence. (#1062) (#1062)
- **Namespace router skills now nest their concrete sub-skills at install time (#69).** On runtimes with non-recursive skill loaders (Claude global, Cline, Qwen, Hermes, Augment, Trae, Antigravity) the installer emits the 6 `gsd-ns-*` routers as the only top-level skill bundles and nests the ~61 concrete skills under `<router>/skills/<name>/SKILL.md`, cutting the eager skill-listing overhead to ≈6 entries. Concrete skills stay reachable via the router's `Read skills/<name>/SKILL.md` routing table. **Breaking:** on those runtimes the concrete skills are no longer invocable by bare name through the Skill tool / top-level listing — route via the namespace router (or the unchanged `/gsd-*` slash command where a commands surface exists). Legacy top-level `gsd-<concrete>/` skill dirs are removed on upgrade. Recursive/unconfirmed loaders (Cursor, Codex, Copilot, Windsurf, CodeBuddy, OpenCode, Kilo) keep the flat layout. (#883)
- **Graphify now respects surface/profile state, not just `graphify.enabled`** — `gsd-tools graphify` is off unless graphify is installed AND surfaced AND `graphify.enabled` is true (previously only the config key was checked). The gate is now runtime-aware: Codex/Cursor/etc. read their own runtime's surface instead of `~/.claude`. (#1313) (#1313)
- **Isolated-executor recovery now fails safe** — when an isolated (worktree) executor run is rejected (you decline to merge it) or over-reached the requested scope, `/gsd:execute-phase` and `/gsd:quick` no longer default or propose recovery by editing the primary checkout (`main`). The orchestrator halts safely and offers a fresh, narrowly-scoped worktree or inspect/discard; editing the primary checkout requires explicit, clearly-labeled confirmation. (#1292) (#1303)
- Migrate code review, security, and Nyquist verification workflows to ADR-857 capability hooks. (#1147)
- **Intel and loop-hook rendering now honor the single capability `active` state** — `gsd-tools intel` gates through the shared resolver (consistency; intel stays governed by `intel.enabled`), and loop-hook rendering now suppresses a config-disabled capability's hooks via the capability-level `active` gate (fail-closed), not just per-hook `when`. (#1315) (#1315)
- Added no-drift guard tests (`tests/issue-57-runtime-install-no-drift.test.cjs`) that protect the Runtime Install Policy Module boundary (ADR-58) and the explicit Runtime Config Adapter Registry (#60). They fail loudly when supported-runtime metadata is added to an installer call site (`allRuntimes`, the interactive `runtimeMap` menu) without a matching registry adapter entry, or when config-mutation dispatch escapes the registry's declared install surfaces — catching reintroduction of the scattered per-runtime branching those seams removed. (#867)
- Edge-probe now surfaces a zero-classification requirement (non-empty prose, no shape cue matched, no `shapes` override) as a single soft `unclassified — review manually` candidate instead of silently dropping it. Dismissible like any edge; `shapes: []` opt-out stays silent; TAXONOMY unchanged. (#1117)
- **Capability state now reports a tri-state `active`** — `gsd-tools capability state` adds an `active` field per capability (installed && surfaced && config-enabled), alongside the existing `enabled` (installed && surfaced). Internal `isCapabilityActive(capId, cwd)` lets consumers honor the single resolved on/off answer. (#1311) (#1311)
- **`gsd-verifier` no longer marks behavior-dependent must-haves `VERIFIED` on symbol presence alone** — a truth that asserts a state transition or a cancellation/cleanup/ordering invariant is marked `PRESENT_BEHAVIOR_UNVERIFIED` when no test exercises it: excluded from the `verified_truths` score, reported as a `behavior_unverified` count, and routed to human verification, so a clean N/N now certifies behavioral evidence rather than mere symbol presence. (#966) (#1271)
- **`verify plan-structure` warns on cross-task region-scope conflicts (#968)** — when a plan task's file-wide negative grep (`! grep -Eq 'PAT' file` / `grep -c 'PAT' file == 0`) bans a construct a sibling task legitimately requires elsewhere in the same file, plan validation now surfaces a warning pointing to the new region/function-scoped negative-gate idiom (documented in the gsd-planner guidance and the planner-antipatterns reference, with a worked banned-in-X / required-in-Y example). Warn-only: it never errors and never changes `valid`. (#1320) (#1320)

### Fixed

- **`gsd-intel-updater` now writes the canonical intel filenames the `gsd-tools intel` CLI actually reads** — the agent was instructed to emit short names (`files.json`, `apis.json`, `deps.json`) and a markdown `arch.md`, but the intel library reads only `file-roles.json`, `api-map.json`, `dependency-graph.json`, and `arch-decisions.json` (JSON). After `/gsd:map-codebase --query refresh` the output was orphaned, so `intel status`/`validate` reported the files missing and `intel query` returned nothing. The agent now emits the canonical long names and structured `arch-decisions.json`. (#1000) (#1037)
- **Installer no longer appends a duplicate managed hook when it is registered via an HTTP route** — a hook re-registered as a `type:"http"` entry (local hook-server routing) carries its identity only in `url`, which the installer's presence check ignored, so a stock command duplicate was appended on every install/update and the hook ran twice per event. The presence check now also inspects `h.url`. (#1004) (#1032)
- **`/gsd-code-review`'s fallow structural pre-pass now actually runs and delivers findings** — it invoked fallow with flags no published fallow version accepts (`--json`, `--profile`, `--stdin-files`), so the pre-pass failed on every run and silently degraded (the structural-findings feature never delivered on any fallow version). It now uses fallow's real CLI (`audit --format json --quiet`, `--changed-since` for phase scope, and `--max-crap` mapped from the `code_quality.fallow.profile` preset: minimal→50, standard→30, strict→15), treats fallow's exit code 1 ("issues found") as a successful run instead of a crash (gating on a valid JSON report, not the exit code), and normalizes fallow's real `audit --format json` schema (`dead_code.*`, `duplication.clone_groups`) into the reviewer's `<structural_findings>` contract. The report normalizer — previously dead code parsing a schema fallow never shipped — is wired to the real schema and exercised against real fallow output. (#1012) (#1044)
- **`worktree base-check` now honors a user/global `worktree.baseRef:"head"` (and `CLAUDE_CONFIG_DIR`)** — base-check resolved `baseRef` from the project checkout's `.claude/` only, so a machine-wide `head` set via `/config` (the layer the harness itself honors) was invisible. On any phase/feature lane it returned `shouldDegrade:true` and `execute-phase` silently forced sequential execution, losing the parallel worktree execution the user configured. Resolution now falls back to the user/global `settings.json` (via `getGlobalConfigDir('claude')`, honoring `CLAUDE_CONFIG_DIR`) below the existing project-local and project-shared layers. (#1013) (#1038)
- **Agent SDK/state/commit steps now resolve `gsd-tools` on shim-only installs for every runtime** — source `agents/*.md` (`gsd-planner`, `gsd-executor`, `gsd-verifier`, `gsd-plan-checker`, …) invoked bare `gsd-tools …`, which fails with `command not found` on shim-only installs where the binary is only reachable as `<runtime-home>/gsd-core/bin/gsd-tools.cjs` and is not on `PATH`. The agent then silently skipped init/state/validate/commit ceremony. #725 fixed only Codex's conversion layer; the source agents were never migrated, so the bug persisted on Claude Code and every other runtime that consumes the source agents directly. All 12 `gsd-tools`-calling agents now carry the canonical multi-runtime `gsd_run` resolver (the same preamble the workflow launchers use — covering claude/codex/cursor/gemini/copilot/windsurf/augment/trae/qwen/cline/opencode/kilo/hermes/antigravity homes), `gsd-phase-researcher`'s stale claude-only resolver is upgraded to the canonical one, and the launcher-parity + bare-call regression guards are extended to `agents/` so no runtime can silently regress. (#1041) (#1045)
- **`gsd-tools generate-claude-md` no longer clobbers a hand-crafted `CLAUDE.md`, and defaults the Claude-runtime output to `./.claude/CLAUDE.md`** — `/gsd-new-project` wrote a repo-root `CLAUDE.md` full of broad project documentation, overwriting/diluting an existing hand-authored instruction file. Now: (1) an existing instruction file that contains no GSD section markers (a hand-crafted file) is left untouched and the command reports `action: "skipped"` — pass `--force` to overwrite intentionally (the flag was already parsed but ignored); (2) the default output for Claude-family runtimes is `./.claude/CLAUDE.md` (a valid project-scoped memory location) instead of repo-root `./CLAUDE.md`, so generated content does not pollute a repo-root file. The config default (`claude_md_path`), the project config template, and the new-project workflow are aligned to the new location. Codex projects still write `AGENTS.md`. (#1098) (#1118)
- **`state record-session` updates an existing `## Session Continuity` section in place instead of appending a duplicate `## Session` block** — on a freshly bootstrapped project (workstream / gsd2-import / new-project templates all emit `## Session Continuity`), the auto-create path recognised only the normalized `## Session` heading, so it appended a second session block. It now inserts only the missing canonical fields after the `## Session Continuity` heading, preserving the heading and any existing prose, and the snapshot / frontmatter readers recognise that heading. (The originally reported `recorded:false`-yet-mutated symptom was already resolved by #944/#948.) (#1101) (#1113)
- **`roadmap annotate-dependencies` no longer fuses the preceding summary line onto the `Plans:` header** — when the match regex's `(?:^|\n)` anchor consumed a leading newline (mid-string match), the replacement dropped it, producing corrupted output like `**Plans:** 3 plansPlans:`. The replacement now re-emits the leading newline when present. (#1103) (#1111)
- **`/gsd-progress` no longer reports a phase as complete (and routes to the next phase) when its verification ended `human_needed` or `gaps_found`** — routing derived completeness from plan/summary counts only and never consulted the `verification.status` query (the seam built in #651). A new Step 1.7 consults it for the current phase, and the routing table sends `gaps_found` to `/gsd:plan-phase {phase} --gaps` (Route V.gaps) and `human_needed` to `/gsd:verify-work {phase}` (Route V.human) before the generic complete row. `passed`, `missing` (unverified), and `unknown` still route as complete, so unverified phases are not falsely blocked. (#1107) (#1116)
- **`write-profile` now writes `USER-PROFILE.md` to the active runtime's config home instead of always `~/.claude`** — under Codex, `gsd-tools query write-profile` wrote `~/.claude/gsd-core/USER-PROFILE.md` while Codex `discuss-phase` advisor-mode (installed under `~/.codex`) checked the Codex home and never found it, so advisor-mode silently stayed disabled. The default output path is now resolved via the runtime-aware `getGlobalConfigDir` (`GSD_RUNTIME` / `config.runtime` → e.g. `~/.codex` for Codex), matching how the runtime's own workflows resolve it — mirroring `generate-dev-preferences`. Claude is unchanged (`~/.claude`); an explicit `--output` still wins. (#1114) (#1119)
- **`/gsd:review` no longer produces a silent empty Codex review on codex-cli < 0.137** — the `codex exec` invocation passed `--dangerously-bypass-hook-trust` (added in codex 0.137.0) unconditionally and discarded stderr, so on older CLIs codex exited with `unexpected argument` before reading the prompt and the empty output was treated as a completed review. The flag is now capability-probed (`codex exec --help | grep`) and applied via `$CODEX_BYPASS_FLAG` only when supported, codex stderr is captured to a `.err` file instead of `/dev/null`, and an empty Codex output is replaced with a diagnostic so a broken reviewer is surfaced rather than silently skipped. (#1115) (#1122)
- **`sandbox_mode` emission in Codex TOML is now gated on the runtime descriptor's `sandboxTier` axis** — previously `installCodexConfig` emitted `sandbox_mode` unconditionally from a hardcoded policy map regardless of whether the runtime descriptor declared a sandbox tier, making the descriptor field cosmetic. `resolveInstallPlan` now projects `sandboxTier` from the capability registry, and `generateCodexAgentToml` / `installCodexConfig` gate emission on `sandboxTier !== 'none'`. The per-agent mode table `CODEX_AGENT_SANDBOX` remains GSD agent policy (not a runtime-descriptor property). For codex (`sandboxTier === 'codex-agent-sandbox'`) output is byte-identical to before; for all other runtimes (`sandboxTier === 'none'`) `sandbox_mode` is correctly omitted. `resolveInstallPlan` now fails loud (throws `TypeError`) on a missing or invalid `sandboxTier` descriptor axis rather than silently coercing garbage to `'none'`, preventing a corrupt/stale registry from silently dropping sandbox enforcement. Full removal of the per-agent registration-tax map remains tracked under #1138. (#1151) (#1152)
- **Installed runtimes no longer silently disable `verify:post` gates** — in a global skills-runtime install (e.g. Codex at `~/.codex`), the `commands/gsd` source tree is absent, so capability-state resolved an empty skill manifest. The full-profile `*` sentinel then materialized to an empty surfaced set, marking every capability `surfaced=false` → `enabled=false`. The result: `gsd-tools loop render-hooks verify:post` returned `activeHooks: []` even with `security_enforcement` and `nyquist_validation` enabled, so the security and Nyquist gates never fired. Capability-state now falls back to the installed `<configDir>/skills/gsd-*/SKILL.md` layout when the source tree is unreachable, so `verify:post` again includes `security -> secure-phase` and `nyquist -> validate-phase`. (#1206) (#1206)
- **`gsd install` no longer warns that `settings.local.json` "may be malformed" when the file contains a valid JSON `null`.** `readSettings` now treats a successfully-parsed `null` as empty settings (`{}`) instead of collapsing it into the parse-failure path, so a literal-`null` settings file is preserved silently; genuinely unparseable files still emit the warning. (#1191) (#1233)
- **gsd-tools no longer crashes at load on a fresh install** — the installer omitted `scripts/fix-slash-commands.cjs`, which `command-roster` requires at module load, so every `gsd-tools` command failed with MODULE_NOT_FOUND. The installer now ships it (with a smoke assertion), and `readCmdNames()` tolerates a missing commands directory. (#1240) (#1240)
- **`state begin-phase` / `complete-phase` now advance the frontmatter `status` for pipe-table `STATE.md`, not only inline `Status:` files.** The status update matched the YAML frontmatter `status:` line first and never updated a body `| Status | … |` cell, so the frontmatter `status` froze (e.g. stuck at `planning`); it now transitions correctly (`planning → executing → completed`) regardless of whether the body `Status` is inline or pipe-table. (#1255) (#1256)
- **`state planned-phase` now advances the pipe-table `Status` cell (and frontmatter `status`), and `state begin-phase` now updates the Current Position `| Phase |` / `| Plan |` cells instead of prepending stray inline lines.** Systemic follow-up to #1255: `planned-phase` ran its body-field replacements on the full file content, so the YAML frontmatter `status:` line was matched before the body `| Status | … |` cell and the status never reached `Ready to execute`; and `begin-phase` had pipe-table branches only for `Status`/`Last activity`, so for pipe-table `STATE.md` the `Phase`/`Plan` rows were left stale while a spurious inline `Phase: N — EXECUTING` line was prepended. Both handlers now strip frontmatter before body-field replacement and update pipe-table cells in place, matching the inline-format behaviour. (#1257) (#1260)
- 
**Parallel worktree execution now has executor-authored cleanup metadata** — executor agents capture their worktree path, branch, and expected base before task commits and return a parseable metadata block for execute-phase to prefer over runtime harness metadata. (#1297) (#1349)
- 
**UAT resume now accepts paused checkpoints** — `uat render-checkpoint` treats a non-structured paused `Current Test` placeholder as a resume signal and derives the checkpoint from the first pending UAT test instead of failing as malformed. (#1300) (#1350)
- 
**`phase complete` now preserves prose-block STATE phase names** — template-shaped `Current Position` prose now advances with the next phase name, avoids missing-field warnings, and keeps `Last activity:` on the template em-dash delimiter. (#1316) (#1351)
- 
**Claude skill installs now avoid rejected `xhigh` effort frontmatter** — heavyweight GSD skills now ship with portable `effort: max`, and the Claude skill converter normalizes any remaining `xhigh` source effort before writing `SKILL.md`. (#1319) (#1352)
- 
**Glued letter-prefix phase directories now resolve correctly** -- phase lookup now recognizes tokens like `P0.3` and `M1-2` from directory names, so phase commands can find their plans instead of reporting none found. (#1324) (#1353)
- 
**Update backups now ignore preserved shared skills and hooks** -- `/gsd-update` custom-file detection now mirrors installer cleanup scope for shared runtime roots, so non-`gsd-*` skills and hooks are not copied into backup folders unnecessarily. (#1325) (#1354)
- 
**Codex skills no longer show up twice in autocomplete** — GSD's Codex install wrote an `agents/openai.yaml` sidecar under every managed `gsd-*` skill directory, and recent Codex builds index both `SKILL.md` and the sidecar, so each skill appeared twice (once as `gsd-foo`, once as a humanized `foo` display name). The installer now stops emitting these sidecars and removes stale ones left by prior installs (pruning the empty `agents/` directory), while preserving user-owned skill directories. Codex discovers GSD skills via `SKILL.md` alone. (#1326) (#1360)
- 
**The worktree path guard no longer blocks ordinary writes in non-GSD git worktrees** — the `gsd-worktree-path-guard` PreToolUse hook fired for every `Write`/`Edit` in any linked git worktree, so Claude Code plan-mode writing its plan to `~/.claude/plans/<slug>.md` from a manually-created worktree was hard-blocked. The hook now only enforces inside a GSD isolated-executor worktree (branch `worktree-agent-*`) and fails open when a target resolves to no git repository, while still blocking writes that escape to a different git root (the #260 protection) or into a repository's `.git` internals. (#1342) (#1361)
- 
**`check.decision-coverage-plan` no longer reports a false pass when a `D-NN` decision header has text before the colon** — `parseDecisions` previously dropped any `- **D-NN …:**` bullet whose header contained a `(parenthetical)`, em-dash, or other prose before the `:**`, silently narrowing the trackable set so the blocking coverage gate green-lit a phase whose dropped decisions were never checked. The parser now tolerates a freeform run before the colon (preserving `[bracket]` tags) and warns on any `D-NN` bullet it still cannot parse instead of dropping it. (#1343) (#1358)
- 
**Codex `hooks.json` is now always written in the nested `{ "hooks": { … } }` shape Codex expects** — the writer previously echoed back whatever shape it read, so an empty, absent, or legacy top-level `hooks.json` (`{ "SessionStart": [...] }`) stayed in the legacy shape that current Codex can reject or warn on. Every write now canonicalizes to the nested form, lifting any legacy top-level event entries (including mixed nested+top-level files) under `hooks` without dropping user-owned entries. Managed-hook dedup/removal is unchanged. (#1348) (#1363)
- 
**`gsd install --cursor` no longer leaves bare `~/.claude` paths in installed artifacts** — the Cursor install branch only rewrote the trailing-slash `.claude` forms, so bare `~/.claude` / `$HOME/.claude` references survived into installed skills and workflows (e.g. `gsd-surface`, `gsd-graphify`, `plan-phase`, `autonomous`) and tripped the post-install "unreplaced .claude path reference(s)" warning, pointing at a directory that doesn't exist on a Cursor-only install. The Cursor branch now rewrites bare forms too (mirroring the Trae/Augment/Copilot branches), using a `(?![\w-])` lookahead so `.claude-plugin` / `.claudeignore` are not corrupted. (#1356) (#1368)
- **`/gsd-new-project` and `/gsd-new-milestone` now self-heal when the research synthesizer returns `SUMMARY.md` inline instead of writing it** — under some context loads the `gsd-research-synthesizer` agent hits an LLM false-refusal (fabricating a non-existent write restriction) and returns the SUMMARY.md content in its reply rather than writing `.planning/research/SUMMARY.md`. Prompt hardening (#240) reduced but did not eliminate this. Both workflows now verify the file exists after the synthesizer returns and, if it is missing but content came back inline, the orchestrator persists it before spawning `gsd-roadmapper` — so the roadmapper never fails with "SUMMARY.md not found". (#222) (#1042)
- Codex agent TOML generation no longer pins `model_reasoning_effort` when the agent is intentionally inheriting the active Codex chat model. GSD still emits both `model` and `model_reasoning_effort` when a per-agent model override or `runtime: "codex"` resolver pins the model, avoiding the confusing partial state where the model followed Codex UI selection while effort followed GSD catalog defaults. (#838) (#842)
- **profile-pipeline temp output now lands under the reaped GSD temp root.** `cmdExtractMessages` and `cmdProfileSample` previously created their output directories directly in `os.tmpdir()` root (`gsd-pipeline-*` / `gsd-profile-*`), which `reapStaleTempFiles` never scans (it only scans `GSD_TEMP_DIR = os.tmpdir()/gsd`). The directories accumulated forever. Both sites now call `ensureGsdTempDir()` and create under `GSD_TEMP_DIR`. Also adds missing `after`/`afterEach` teardown to four test fixtures that leaked `gsd-*` temp dirs on every `npm test` run. (#866) (#879)
- `getMilestonePhaseFilter` now excludes phase headings inside fenced code blocks (``` ``` ``` or `~~~`) — consistent with the fence-aware behavior of `extractCurrentMilestone`. Previously, a `### Phase N:` line inside a fenced block was wrongly counted as a real phase. (#875) (#880)
- **`gsd_run` launcher shim now probes all non-Claude runtime homes before failing.** The shim's last-resort detection previously stopped at `$HOME/.claude`, causing a false-positive fatal error on every non-Claude runtime (Hermes, Cursor, Codex, Copilot, Windsurf, Augment, Trae, Qwen, CodeBuddy, Cline, Grok, Antigravity, OpenCode, Kilo) when `RUNTIME_DIR` was unset and `gsd-tools` was not on `PATH`. The snippet now probes each runtime's config directory (respecting `HERMES_HOME`, `CURSOR_CONFIG_DIR`, `CODEX_HOME`, etc. with sensible `$HOME`-relative defaults) before emitting the install error. (#903)
- **`validate health` and `validate consistency` no longer emit false-positive W007 warnings for projects using checklist-style ROADMAP.md phases.** `buildRoadmapPhaseVariants()` in `src/validate.cts` previously used only a heading-style regex (`## Phase N: name`), silently ignoring the supported checklist format (`- [x] **Phase N: name**`). This caused every on-disk phase directory to trigger W007 ("exists on disk but not in ROADMAP.md") when the project's ROADMAP used checklist-only notation. The fix adds a second regex pass mirroring the existing `buildNotStartedPhaseVariants()` approach. Additionally, `cmdValidateConsistency()` in `src/verify.cts` had a duplicate inline heading-only regex with the same gap — refactored to delegate to `buildRoadmapPhaseVariants()` (DRY). (#892) (#893)
- **`init execute-phase` and `cmdCommit` now produce correct `branch_name` when `project_code` is set** — the `{phase}` substitution in `phase_branch_template` now calls `normalizePhaseName()`, stripping the project-code prefix and zero-padding the number, so the generated branch is e.g. `gsd/phase-01-foundation` instead of `gsd/phase-CK-01-foundation`. Both the execute-phase output path (`src/init.cts`) and the pre-execution commit path (`src/commands.cts`) are fixed. (#904) (#904)
- **`syncStateFrontmatter` no longer strips `current_phase`, `current_phase_name`, `current_plan`, and `progress` from `STATE.md`** — when body annotations are absent (e.g. after an agent rewrites the body), the existing frontmatter values for those scalars are now preserved, mirroring the fallback already applied in `cmdStateJson`. (#905) (#905)
- **Top-level Claude Code `/gsd-plan-phase` now always spawns the researcher/planner/plan-checker agents instead of collapsing them inline** — a `<runtime_compatibility>` block after `</available_agent_types>` makes the Agent-availability requirement explicit and documents that the workflow fails-closed (stops with a clear log message) in genuinely Agent-less contexts; seven "ORCHESTRATOR RULE — CODEX RUNTIME" labels are renamed to "ALL RUNTIMES" so the guard applies universally; `execute-phase.md` scopes its existing "Other runtimes" inline-fallback prose to non-Claude contexts, preserving the #853 backgrounded-agent behaviour. (#913) (#913)
- **`/gsd-plan-phase`, `/gsd-execute-phase`, `/gsd-autonomous` no longer carry `context: fork`** — these are spawning orchestrators; a forked subagent context has no `Agent` tool, preventing them from spawning the subagents they require. `effort: xhigh` is preserved. Fixes `/gsd:autonomous` halting with "running as a forked subagent" on 1.4.1 (#921). Also replaces the introspection-based Agent-availability check in `plan-phase`'s `<runtime_compatibility>` block with an attempt-based gate: the workflow now always attempts the `Agent()` call and only stops if a real tool-unavailable error is returned, eliminating false-negative aborts in top-level sessions (#922). (#921)
- **Claude global install reverted to flat skill layout so concrete skills are discoverable.** PR #883 introduced nested skill layout for Claude at `~/.claude/skills/gsd-ns-<router>/skills/<stem>/SKILL.md`, but Claude Code's skill discovery scans only one level under `~/.claude/skills/` — nested concrete skills were never listed in the Skill-tool available-skills list and direct `Skill(skill="gsd-plan-phase")` calls stopped working. This fix reverts Claude to the flat layout (`~/.claude/skills/gsd-<name>/SKILL.md`) so all ~61 concrete skills are top-level and immediately discoverable. The 6 other runtimes that confirmed non-recursive scanning (cline, qwen, hermes, augment, trae, antigravity) retain their nested layout. (#924) (#924)
- **`gsd-context-monitor.js` now echoes the actual invoking hook event name** — instead of hardcoding `hookEventName: "PostToolUse"` (or `"AfterTool"` for Gemini), the hook reads `data.hook_event_name` from the stdin payload and falls back to the runtime heuristic only when the field is absent or blank; this fixes Claude Code rejecting hook output with `"expected Stop but got PostToolUse"` when the monitor is invoked by the Stop, SubagentStop, or PreCompact hooks registered in PR #821. (#925) (#926)
- Fix `--reapply` verifier false-positives on post-#604-rename installs caused by two gaps in pristine-baseline handling:

**Gap 1** (`verify-reapply-patches.cjs`): when `backup-meta.json` records a `pristine_hash` for a file but `gsd-pristine/` has no corresponding snapshot on disk, the verifier fell to over-broad mode (every upstream-changed line treated as a user-added requirement) and produced `FAIL_USER_LINES_MISSING` false positives. Fix: return advisory `OK_NO_BASELINE` reason (non-blocking, exit 0) when a recorded hash is present but the pristine file is absent — the verifier cannot reason correctly without a baseline and must not block.

**Gap 2** (new migration `004-prune-stale-pristine-get-shit-done`): migration 003 removed legacy `get-shit-done/` runtime files but left `gsd-pristine/get-shit-done/` orphan snapshots in place. Those stale snapshots referenced `get-shit-done/...` key paths that no longer match the active `gsd-core/...` layout, contributing to `FAIL_INSTALLED_MISSING` false reports. Fix: add a new migration (not editing 003, to preserve its checksum) that removes all files under `gsd-pristine/get-shit-done/`. (#934) (#935)
- **`/gsd-update` changelog preview no longer silently fails** — the installer now copies `scripts/changeset/` and `scripts/lib/` into the runtime config dir so `$GSD_DIR/scripts/changeset/cli.cjs` resolves at runtime; `update.md` was updated to use the correct installed path and to surface an explicit error if the CLI is missing rather than swallowing it. (#935)
- **`plan-review-convergence` now runs `gsd-plan-phase` inline instead of inside `Agent()`** — both sites that previously wrapped `gsd-plan-phase` in `Agent()` (initial planning + replan loop) have been changed to bare `Skill()` calls at depth 0. On Claude Code, a depth-1 Agent has no Agent tool, so a wrapped `plan-phase` could never spawn `gsd-planner` or `gsd-plan-checker` — the replan loop silently failed to produce a revised plan whenever HIGH concerns were found. Running plan-phase inline from the depth-0 orchestrator (which retains the Agent tool) restores the full planner→checker sub-agent chain. A new structural guard test (`bug-936-no-nested-spawner-wrap.test.cjs`) statically scans all workflow files and fails if any workflow wraps a spawner orchestrator in `Agent()` without a `RUNTIME != claude` carve-out, preventing regression. (#936) (#939)
- **`--json-errors` now emits a structured error even when a handler throws unexpectedly** — an unexpected (non-`ExitError`) throw fell through to a raw stack trace on stderr, breaking SDK structured-error parsing. (#965) (#987)
- **`verify key-links` docs now correctly state `from:`/`to:` are relative file paths** — the reference implied component/endpoint values the verifier never supported, so locator-style links failed with a misleading 'Source file not found' and the author's `pattern:` was never evaluated. (#967) (#990)
- **Fixed a test-infrastructure regression (#996) where bug-969 hardening tests deleted the shared `gsd-core/bin/lib/core.cjs` during concurrent runs and the build tsbuildinfo lived inside the copied install tree, intermittently failing CI with MODULE_NOT_FOUND/ENOENT.** The destructive tests now run hermetically against a temp project, and the tsbuildinfo moved out of `gsd-core/bin/`. (#969) (#1002)
- **`gsd-planner` now ships the `Edit` tool, so it can no longer destroy `ROADMAP.md` via a whole-file `Write`** — the planner had `Write` but not `Edit` (the #571/#581 writer-agent gap), so an in-place ROADMAP edit fell back to a full overwrite that truncated committed milestone history. The `update_roadmap` step now directs scoped `Edit` calls and explicitly forbids passing the full file to `Write`. (#973) (#989)
- **`graphify query --budget` with no value now errors instead of silently ignoring the budget** — a trailing `--budget` parsed as `NaN` and was treated as 'no budget', so the query ran unbounded with no warning. (#974) (#986)
- **The installer now resolves a stable fnm node path instead of the ephemeral multishell shim on Windows** — managed `.js` hooks were pinned to `fnm_multishells/<id>/node.exe`, a per-shell-session path fnm later deletes, breaking every managed hook until reinstall. (#977) (#992)
- **`gsd-tools milestone complete --force` now actually overrides the unstarted-phase guard** — the dispatcher never parsed `--force`, so the guard's own documented escape hatch was inert. (#978) (#982)
- 
**Trae and Windsurf installs no longer leak unreplaced `~/.claude` / `$HOME/.claude` paths** — both converters only rewrote trailing-slash `.claude/` forms, so bare home-path references survived conversion and pointed users at the wrong config dir; bare forms are now rewritten (Codex/Cline #570/#782 parity) and `CLAUDE_CONFIG_DIR` maps to the runtime's own var, with `.claude-plugin` preserved. (#983) (#995)
- **Claude Code plugin installs no longer fail with empty `@~/.claude/gsd-core/...` includes** — agents, commands, and templates `@`-include the canonical `~/.claude/gsd-core/` path, but a marketplace plugin install (`claude plugin install`) never creates that directory, so every include resolved to nothing and agents (e.g. the executor) failed. A new `SessionStart` hook (`gsd-ensure-canonical-path.js`) symlinks the canonical path's immutable subdirs (`bin`, `contexts`, `references`, `templates`, `workflows`) to the plugin's bundled tree. It is a no-op in classic `bin/install.js` installs, preserves user-generated files (e.g. `USER-PROFILE.md`), prunes stale links so it self-heals after `claude plugin update`, and uses Windows junctions. (#1207) (#1207)
- **`/gsd-code-review`, `/gsd-code-review --fix`, and `/gsd-eval-review` now inject configured `agent_skills` into their subagents** — these review-family workflows previously spawned their reviewer/fixer/auditor agents (including the `--auto` re-review/re-fix loops) without the project-configured skill and rule context, so any `agent_skills` set for `gsd-code-reviewer`, `gsd-code-fixer`, or `gsd-eval-auditor` were silently ignored. They now query and inject those skills like the ~20 sibling workflows. (#1005)
- **`phase complete` no longer rewrites an existing roadmap completion date** — repeat runs on an already-`Complete` phase preserve the recorded `YYYY-MM-DD` date (4- and 5-column layouts); empty/`-`/non-date cells are still stamped with the current date. (#1177)
- **Legacy ROADMAP projects no longer get deprecation-warning spam** — the free-form ROADMAP warning fired on every command regardless of phase_id_convention; it now only warns when the milestone-prefixed convention is explicitly set and unmet. (#1218) (#1218)
- **Forking workflows target wrong base branch on `master` repos when `origin/HEAD` is unset** — `execute-phase`, `quick`, `ship`, `complete-milestone`, and `pr-branch` detection bash fell through to a hardcoded `main` fallback whenever `origin/HEAD` was absent (common in `git init` + `remote add` + `fetch` without `set-head`, CI checkouts, and worktrees), causing GSD to fork phase branches off a non-existent `main` on `master` repos. Replaced with a single `gsd_run query git.base-branch` resolver that walks the full precedence ladder: config override → `origin/HEAD` symref → `git remote show origin` → local branch presence → `"main"`. (#1198) (#1198)
- **`query user-story.validate` now works** — `mvp-phase` and `verify-work` workflows both invoked this command to validate "As a / I want to / so that" user stories, but no CJS handler existed; every call errored with "Unknown command: user-story". (#1193) (#1193)
- **Context meter no longer sticks at 100%** — the statusline reserved-buffer math was inverted, pinning usage at 100% whenever CLAUDE_CODE_AUTO_COMPACT_WINDOW equalled the total window. (#1194) (#1211)
- **Roadmapper honors phase_id_convention** — new-project roadmaps now use milestone-prefixed phase IDs when phase_id_convention is set, instead of ignoring the default. (#1205) (#1215)
- 
**`phase complete` no longer emits false warnings from historical verification metadata or deferred requirement IDs** — two distinct false-positive warning bugs: (A) the verification-status check used a full-text regex that matched `previous_status: gaps_found` in the file body, triggering an "unresolved gaps" warning even when the current frontmatter `status: passed`; the check now reads only the frontmatter `status` key via `extractFrontmatter`. (B) requirement IDs under explicitly deferred/backlog/future/v2 section headings in `REQUIREMENTS.md` were flagged as missing from the Traceability table; the check now skips any section whose heading matches those terms. (#1197) (#1197)
- **verify key-links no longer fails on planned future files** — a from: link whose file is declared in a current/upcoming wave plan’s files_modified is now reported pending instead of a hard missing-file failure. (#1202) (#1219)
- **`state patch` and `state record-session` no longer corrupt STATE.md** — a no-match patch no longer rewrites the file (was resetting `milestone_name` and resurrecting a stale `stopped_at`), and `record-session` now persists `--stopped-at`/`--resume-file` even when the body lacks the exact labels. (#952)
- **`/gsd-update` no longer flags `managed-hooks-registry.cjs` as a custom file** — the shipped hook is now recorded in the file manifest, eliminating a perpetual false-positive custom-file warning. (#953)
- **`gsd-tools` no longer throws `EAGAIN` or truncates output under heavy load** — the CLI's stdout/stderr writes now retry the transient `EAGAIN`/`EINTR` errnos and handle short writes when the output stream is a full non-blocking pipe (e.g. the parallel test runner), instead of throwing or silently dropping bytes. (#1009)
- **Quick worktree execution now accepts parent-or-plan bases for pre-dispatch plan commits** — quick mode records the parent and plan commit around the pre-dispatch PLAN.md commit, lets the worktree guard accept either approved base, materializes the plan from git objects when a runtime forks from the parent, and teaches cleanup to validate the same allowed-base set. (#1265) (#1347)
- **`phase add` no longer reuses an existing phase number when that phase exists only as a roadmap bullet** — the next-number scan now counts phases listed only as `- [ ] **Phase N: ...**` bullets (all checkbox variants, with or without a title), in addition to `### Phase N:` section headers and on-disk phase directories, so a bullet-only phase is no longer shadowed and `phase add` appends after the highest used number. (#1249)
- Preserve curated STATE.md progress frontmatter when `state patch` updates non-progress fields, while still allowing progress-related fields to resync from disk-derived project state. (#1345)
- **The installer no longer re-adds a duplicate managed hook when the user registered it in `command`+`args` (wrapped) form** — the presence checks only inspected `h.command`, so an args-form wrapper (a common Windows windowless-launcher mitigation) was invisible and a stock entry was appended on every install/update, running the hook twice. (#976) (#994)
- `cmdSkillManifest` now discovers concrete skills nested under `gsd-ns-*` routers (`<root>/gsd-ns-<router>/skills/<stem>/SKILL.md`), so `gsd-health` and `gsd-settings` report the correct count on nested-layout runtimes (cline, qwen, hermes, augment, trae, antigravity). The scan is scoped to `gsd-ns-*` router dirs only — unrelated user dirs that happen to have a `skills/` subdirectory are not traversed. Dual-routed concretes (same skill installed under two routers) are deduped by name within each root. (#929) (#929)
- **state record-session no longer pins a CPU core forever** — acquireStateLock busy-spun at 100% CPU when a recoverable errno (e.g. ENOENT from a removed worktree) persisted, because that retry path skipped the backoff sleep and the 30s time budget. Every retry path is now bounded and backed off. (#1236) (#1236)
- **`/gsd-manager` and `/gsd-autonomous --interactive` no longer silently skip worktree isolation and independent verification on Claude Code.** They dispatched plan/execute as background agents, but a backgrounded Claude Code agent has no Agent/Task tool and cannot spawn the nested executors, plan-checker, or verifier — so isolation and verification silently never ran. Both workflows now resolve the runtime and run plan/execute inline on Claude Code; background dispatch is kept on runtimes that support nested subagents. (#863)
- **Researcher agents can now invoke Perplexity** — `gsd-phase-researcher` and `gsd-project-researcher` referenced `mcp__perplexity__*` in their provider dispatch tables but never granted it in their `tools:` allowlist, so Perplexity web research silently fell through to the next provider. The grant is now generated from the researcher profiles, with a parity guard that fails if a future dispatch-table provider is added without its tool grant. (#1284) (#1288)
- Init phase lookups now resolve active phases whose canonical details live in a flat Phase Details block outside the current milestone summary, restoring requirement coverage for plan/execute/phase-op flows. (#1344)
- **Installer no longer leaks `gsd-cmd-rewrites-*` temp directories.** Each install that emitted slash commands left one `fs.mkdtempSync` directory under the system temp root; on `tmpfs` `/tmp` hosts these accumulated and consumed RAM-backed storage. `installRuntimeArtifacts()` now removes the temp copy in a `finally` once command files are copied. (#862)
- `validate agents` (and `validate health`) now cross-reference the install manifest to detect manifest-backed Codex agent pair drift: when a generated `agents/gsd-*.md` / `agents/gsd-*.toml` pair has one side missing on disk, the agent is reported as incomplete and `agents_found` is `false` (previously a false-healthy `agents_found: true, missing: []`). `validate health` names the incomplete agents and recommends re-running the installer. The check no-ops when no manifest is present. (#1058) (#1079)
- **The `map-codebase` and `docs-update` workflows no longer collect background sub-agent results with the deprecated Claude Code `TaskOutput` tool** — they keep `run_in_background=true` on the spawn and `Read` each agent's `outputFile` (from the `async_launched` result) once it reports completion, removing the `TaskOutput(block=true)` main-session hang surface (anthropics/claude-code#20236). Completion-marker contracts and on-disk verification are unchanged, and the non-Claude runtime fallbacks are preserved. (#1362)
- **`model_policy` is now honored on the default `claude` runtime** — including the `anthropic-fable` Claude Fable 5 preset. Policy-resolved model IDs map to Claude Code agent aliases (e.g. `claude-fable-5` → `fable`), and IDs without a Claude alias warn and fall back to the configured tier. Forward-port of #1133 (originally shipped on the 1.4.5 hotfix line). (#1133) (#1133)
- **`/gsd-plan-review-convergence` now blocks on actionable review findings outside PLAN.md (#724).** The convergence summary contract includes current_actionable alongside current_high, and reviews-mode planning/checking requires actionable MEDIUM/LOW feedback to be incorporated or explicitly deferred in executable PLAN.md content. (#728)
- **Config docs/prompts now match the consumers** — `workflow.subagent_timeout` is documented in milliseconds (default 300000), not "seconds (default 600)" (a user who entered 600 got a 600 ms timeout); `review.models.<cli>` is documented as a bare model id injected into `--model`/`-m`, not a shell command; and `workflow.test_command` / `workflow.build_command` (consumed by verify-phase, execute-phase, audit-fix, and the post-merge gate) are now accepted by `config set` and documented. (#1296) (#1299)
- **`changeset new --pr 0` now accepted at creation** — the required-field guard treated the integer 0 as a missing `--pr` flag, so the documented `pr: 0` placeholder could not be authored via the CLI. (#1231) (#1231)
- **`$gsd-quick` Codex adapter no longer assumes typed `spawn_agent(agent_type=...)`** — documents that typed planner/executor spawning needs the agent_type-capable Codex schema and provides a clearly-labeled generic-subagent fallback when only `multi_agent_v1` is exposed. (#958)
- **`state update` and `roadmap update-plan-progress` now handle current Markdown artifact shapes** — state field read/replace works on table-format `STATE.md` (`| Status | … |`), and `roadmap update-plan-progress` inserts missing per-plan checklist rows (filling partial gaps), tolerates `Plans:`/`**Plans:**`/`**Plans**:`, and scopes changes to the active milestone. (#1172)
- `state planned-phase` now advances the Status field when the prior phase left a `Complete ✓` (checkmark) or bare `Complete` terminal status. Previously such a status matched no known template default, so the transition was silently skipped and the state machine stayed stuck on the prior phase. Caveat-bearing statuses (e.g. `Complete but needs manual QA`) remain preserved. (#1070) (#1078)
- **`state.*` writes no longer silently revert the STATE.md frontmatter `status`/`stopped_at`** — an incidental write (e.g. `state record-session`) that doesn't change the body's `Status:`/`Stopped at:` source field now preserves the existing frontmatter value instead of re-deriving it from possibly-stale body text. Legitimate transitions (e.g. `begin-phase`/`complete-phase`, which do update the body Status) still re-derive normally, so a verified-complete phase can no longer be flipped back to `verifying` by an unrelated write. (#1252)
- **`audit-open` no longer false-flags completed quick tasks** — quick-task SUMMARYs now carry `status: complete` in frontmatter by construction, so the milestone-close auditor stops reporting finished quick tasks as `[unknown]`. (#951)
- **Workspace (local) Antigravity and Copilot skill installs no longer point at the global config home** — a local install rewrote `~/.claude/` references in `SKILL.md` bodies to the global `~/.gemini/antigravity/` / `~/.copilot/` paths instead of the workspace-relative `.agent/` / `.github/`, because the skills layout wrapper passed the runtime name into the converter's `isGlobal` parameter slot. (#1092) (#1092)
- Fix the workflow gsd_run launcher being unreachable in later bash blocks on runtimes that run each fenced block in a fresh shell (e.g. Claude Code): ship a standalone gsd-core/bin/gsd_run executable and have the per-file preamble persist the launcher's bin dir onto PATH via CLAUDE_ENV_FILE, with the inline function definition kept as the fallback for all other runtimes. (#1084)
- **`/gsd:phase insert` and `/gsd:phase --edit` no longer dead-end recording Roadmap Evolution** — `query state.add-roadmap-evolution` was rejected as "SDK-only" with an error that pointed back at the very command that just failed, and no CJS handler existed after the SDK retirement. The handler is now implemented in CJS, so the insert/edit phase workflows append the `### Roadmap Evolution` entry under `## Accumulated Context` (creating the subsection if missing, deduping identical entries) as documented. (#1148) (#1148)
- Corrected the installer `--help` profile skill counts: `core` now shows 8 (was 7) and `standard` shows 14 (was 13), both derived from `PROFILES` so they can't drift again; the `full` line drops the stale hardcoded `66` for `all skills`. (#834) (#847)
- **Codex-installed GSD skills and agents no longer rely on a bare `gsd-tools` executable** — generated Codex surfaces now call the bundled shim, and workflow launchers can resolve the Codex shim-only install path. (#731)
- 
**Wire the discuss loop step for capability hooks** — capabilities can now register `discuss:pre`/`discuss:post` hooks (e.g. discuss-time context recall and CONTEXT capture); previously `discuss` was contract-declared but structurally unwireable. Also collapses the host-loop file set to a single source of truth and adds an authoring-time guard rejecting hooks at unwired extension points. (#1199) (#1199)
- **`/gsd-autonomous --converge` now routes phase planning through plan-review convergence** instead of silently ignoring the flag. (#711) (#729)
- Hermes skills now install at skills/gsd/gsd-<stem>/SKILL.md with name gsd-<stem>, restoring canonical /gsd-<stem> dispatch that was broken by the bare-stem prefix introduced in #3664. (#955)

## [1.4.5] - 2026-06-12

### Fixed

- **`model_policy` is now honored on the default `claude` runtime** — including the `anthropic-fable` Claude Fable 5 preset. Policy-resolved model IDs map to Claude Code agent aliases (e.g. `claude-fable-5` → `fable`), and IDs without a Claude alias warn and fall back to the configured tier. Previously the entire `model_policy` block was silently ignored on `claude`. (#1133) (#1133)

## [1.4.4] - 2026-06-11

### Changed

- Added an opt-in `anthropic-fable` model policy provider preset for Claude Fable 5 high-budget routing while preserving the existing Anthropic Opus 4.8 defaults and `anthropic` provider preset. (#1014) (#1015)

## [1.4.3] - 2026-06-09

### Fixed

- Fix `--reapply` verifier false-positives on post-#604-rename installs caused by two gaps in pristine-baseline handling:

**Gap 1** (`verify-reapply-patches.cjs`): when `backup-meta.json` records a `pristine_hash` for a file but `gsd-pristine/` has no corresponding snapshot on disk, the verifier fell to over-broad mode (every upstream-changed line treated as a user-added requirement) and produced `FAIL_USER_LINES_MISSING` false positives. Fix: return advisory `OK_NO_BASELINE` reason (non-blocking, exit 0) when a recorded hash is present but the pristine file is absent — the verifier cannot reason correctly without a baseline and must not block.

**Gap 2** (new migration `004-prune-stale-pristine-snapshots`): migration 003 removed legacy `get-shit-done/` runtime files but left `gsd-pristine/get-shit-done/` orphan snapshots in place. Those stale snapshots referenced `get-shit-done/...` key paths that no longer match the active `gsd-core/...` layout, contributing to `FAIL_INSTALLED_MISSING` false reports. Fix: add a new migration (not editing 003, to preserve its checksum) that removes all files under `gsd-pristine/get-shit-done/`. (#934) (#937)
- **`/gsd-update` changelog preview no longer silently fails** — the installer now copies `scripts/changeset/` and `scripts/lib/` into the runtime config dir so `$GSD_DIR/scripts/changeset/cli.cjs` resolves at runtime; `update.md` was updated to use the correct installed path and to surface an explicit error if the CLI is missing rather than swallowing it. (#938)
- **`plan-review-convergence` now runs `gsd-plan-phase` inline instead of inside `Agent()`** — both sites that previously wrapped `gsd-plan-phase` in `Agent()` (initial planning + replan loop) have been changed to bare `Skill()` calls at depth 0. On Claude Code, a depth-1 Agent has no Agent tool, so a wrapped `plan-phase` could never spawn `gsd-planner` or `gsd-plan-checker` — the replan loop silently failed to produce a revised plan whenever HIGH concerns were found. Running plan-phase inline from the depth-0 orchestrator (which retains the Agent tool) restores the full planner→checker sub-agent chain. A new structural guard test (`bug-936-no-nested-spawner-wrap.test.cjs`) statically scans all workflow files and fails if any workflow wraps a spawner orchestrator in `Agent()` without a `RUNTIME != claude` carve-out, preventing regression. (#936) (#939)

## [1.4.2] - 2026-06-09

### Fixed

- **`/gsd-plan-phase`, `/gsd-execute-phase`, `/gsd-autonomous` no longer carry `context: fork`** — these are spawning orchestrators; a forked subagent context has no `Agent` tool, preventing them from spawning the subagents they require. `effort: xhigh` is preserved. Fixes `/gsd:autonomous` halting with "running as a forked subagent" on 1.4.1 (#921). Also replaces the introspection-based Agent-availability check in `plan-phase`'s `<runtime_compatibility>` block with an attempt-based gate: the workflow now always attempts the `Agent()` call and only stops if a real tool-unavailable error is returned, eliminating false-negative aborts in top-level sessions (#922). (#921)
- **`gsd-context-monitor.js` now echoes the actual invoking hook event name** — instead of hardcoding `hookEventName: "PostToolUse"` (or `"AfterTool"` for Gemini), the hook reads `data.hook_event_name` from the stdin payload and falls back to the runtime heuristic only when the field is absent or blank; this fixes Claude Code rejecting hook output with `"expected Stop but got PostToolUse"` when the monitor is invoked by the Stop, SubagentStop, or PreCompact hooks registered in PR #821. (#925) (#926)

## [1.4.1] - 2026-06-09

### Changed

- Added no-drift guard tests (`tests/issue-57-runtime-install-no-drift.test.cjs`) that protect the Runtime Install Policy Module boundary (ADR-58) and the explicit Runtime Config Adapter Registry (#60). They fail loudly when supported-runtime metadata is added to an installer call site (`allRuntimes`, the interactive `runtimeMap` menu) without a matching registry adapter entry, or when config-mutation dispatch escapes the registry's declared install surfaces — catching reintroduction of the scattered per-runtime branching those seams removed. (#867)

### Fixed

- **profile-pipeline temp output now lands under the reaped GSD temp root.** `cmdExtractMessages` and `cmdProfileSample` previously created their output directories directly in `os.tmpdir()` root (`gsd-pipeline-*` / `gsd-profile-*`), which `reapStaleTempFiles` never scans (it only scans `GSD_TEMP_DIR = os.tmpdir()/gsd`). The directories accumulated forever. Both sites now call `ensureGsdTempDir()` and create under `GSD_TEMP_DIR`. Also adds missing `after`/`afterEach` teardown to four test fixtures that leaked `gsd-*` temp dirs on every `npm test` run. (#866) (#879)
- **`gsd_run` launcher shim now probes all non-Claude runtime homes before failing.** The shim's last-resort detection previously stopped at `$HOME/.claude`, causing a false-positive fatal error on every non-Claude runtime (Hermes, Cursor, Codex, Copilot, Windsurf, Augment, Trae, Qwen, CodeBuddy, Cline, Grok, Antigravity, OpenCode, Kilo) when `RUNTIME_DIR` was unset and `gsd-tools` was not on `PATH`. The snippet now probes each runtime's config directory (respecting `HERMES_HOME`, `CURSOR_CONFIG_DIR`, `CODEX_HOME`, etc. with sensible `$HOME`-relative defaults) before emitting the install error. (#903)
- **`validate health` and `validate consistency` no longer emit false-positive W007 warnings for projects using checklist-style ROADMAP.md phases.** `buildRoadmapPhaseVariants()` in `src/validate.cts` previously used only a heading-style regex (`## Phase N: name`), silently ignoring the supported checklist format (`- [x] **Phase N: name**`). This caused every on-disk phase directory to trigger W007 ("exists on disk but not in ROADMAP.md") when the project's ROADMAP used checklist-only notation. The fix adds a second regex pass mirroring the existing `buildNotStartedPhaseVariants()` approach. Additionally, `cmdValidateConsistency()` in `src/verify.cts` had a duplicate inline heading-only regex with the same gap — refactored to delegate to `buildRoadmapPhaseVariants()` (DRY). (#892) (#893)
- **`init execute-phase` and `cmdCommit` now produce correct `branch_name` when `project_code` is set** — the `{phase}` substitution in `phase_branch_template` now calls `normalizePhaseName()`, stripping the project-code prefix and zero-padding the number, so the generated branch is e.g. `gsd/phase-01-foundation` instead of `gsd/phase-CK-01-foundation`. Both the execute-phase output path (`src/init.cts`) and the pre-execution commit path (`src/commands.cts`) are fixed. (#904) (#904)
- **`syncStateFrontmatter` no longer strips `current_phase`, `current_phase_name`, `current_plan`, and `progress` from `STATE.md`** — when body annotations are absent (e.g. after an agent rewrites the body), the existing frontmatter values for those scalars are now preserved, mirroring the fallback already applied in `cmdStateJson`. (#905) (#905)
- **Top-level Claude Code `/gsd-plan-phase` now always spawns the researcher/planner/plan-checker agents instead of collapsing them inline** — a `<runtime_compatibility>` block after `</available_agent_types>` makes the Agent-availability requirement explicit and documents that the workflow fails-closed (stops with a clear log message) in genuinely Agent-less contexts; seven "ORCHESTRATOR RULE — CODEX RUNTIME" labels are renamed to "ALL RUNTIMES" so the guard applies universally; `execute-phase.md` scopes its existing "Other runtimes" inline-fallback prose to non-Claude contexts, preserving the #853 backgrounded-agent behaviour. (#913) (#913)
- **`/gsd-manager` and `/gsd-autonomous --interactive` no longer silently skip worktree isolation and independent verification on Claude Code.** They dispatched plan/execute as background agents, but a backgrounded Claude Code agent has no Agent/Task tool and cannot spawn the nested executors, plan-checker, or verifier — so isolation and verification silently never ran. Both workflows now resolve the runtime and run plan/execute inline on Claude Code; background dispatch is kept on runtimes that support nested subagents. (#863)
- **Installer no longer leaks `gsd-cmd-rewrites-*` temp directories.** Each install that emitted slash commands left one `fs.mkdtempSync` directory under the system temp root; on `tmpfs` `/tmp` hosts these accumulated and consumed RAM-backed storage. `installRuntimeArtifacts()` now removes the temp copy in a `finally` once command files are copied. (#862)
- Corrected the installer `--help` profile skill counts: `core` now shows 8 (was 7) and `standard` shows 14 (was 13), both derived from `PROFILES` so they can't drift again; the `full` line drops the stale hardcoded `66` for `all skills`. (#834) (#847)

## [1.4.0] - 2026-06-08

### Added

- **Research is now cached, curated-first, and code-governed** — a content-addressed Research Store (per-source TTL), a single provider waterfall with confidence tiers, and registry-API package legitimacy replace the per-agent prose waterfall and the slopcheck bolt-on. (#664) Confidence is now verification-evidence-driven: provider identity alone no longer yields HIGH; HIGH requires ground-truth corroboration (e.g. `legitimacyVerdict: 'OK'`), authority alone caps at MEDIUM, and SLOP caps at LOW. (#664)
- `/gsd:plan-phase` now accepts a `--granularity <coarse|standard|fine>` flag to override the configured planning granularity for a single invocation. The flag takes precedence over `granularities.planning`, top-level `granularity`, and `planning.granularity` config. Invalid values are rejected. (#703) (#750)
- **gsd-core can now be installed as a native Claude Code plugin** — a new `.claude-plugin/plugin.json` manifest enables installing gsd-core via `claude plugin install` or the zero-friction `~/.claude/skills/` auto-load path (`gsd-core@skills-dir`), with slash commands auto-namespaced as `/gsd-core:<command>` (e.g. `/gsd-core:plan-phase`) and lifecycle management via `claude plugin enable|disable|update`. gsd-core's always-on guard and update hooks are wired for the plugin path through `hooks/hooks.json` using `${CLAUDE_PLUGIN_ROOT}`. This is additive — the existing npm / file-copy installer is unchanged. (#797)
- **Installer pre-populates `permissions.allow`/`deny` for Claude Code** — fresh Claude Code installs now receive GSD's known-safe tool-call patterns (`Bash(npx gsd-core *)`, `Read(.planning/*)`, `Write(.planning/*)`, `Read(STATE.md)`, `Write(STATE.md)`) in `settings.json` out of the box, eliminating first-run approval prompts. A `deny` block for credential files (`Read(.env)`, `Read(.env.*)`, `Read(.secrets)`) is also added for defense-in-depth. The merge is additive and idempotent; existing user-set entries are preserved. Uninstall removes only GSD-owned entries. (#768) (#819)
- 
Added: register newly-available Claude Code lifecycle hooks — SubagentStop, Stop, PreCompact (all wired to gsd-context-monitor for context-headroom warnings), and FileChanged (matcher: `config.json`, wired to new gsd-config-reload.js hook that hot-reloads `.planning/config.json` context mid-session). Also updates hooks/hooks.json (plugin manifest) and managed-hooks-registry for drift-guard coverage (#770). (#821)
- Gemini installs now register three additional hook events — `BeforeAgent`, `AfterAgent`, and `BeforeModel` — wired to `gsd-context-monitor.js` for per-turn context headroom tracking. Previously only `SessionStart`, `BeforeTool`, and `AfterTool` were registered. The installer also detects `hooksConfig.enabled: false` in the user's Gemini `settings.json` and emits a clear warning, surfacing the silent failure mode where all hooks are registered but never execute. (#776) (#829)
- Cross-runtime command enrichment in the installer. Gemini CLI commands now use native `{{args}}` interpolation (translated from Claude's `$ARGUMENTS`) so typed arguments interpolate into the prompt body, and `/gsd:progress` injects live project state via a fixed, injection-safe `!{cat .planning/STATE.md 2>/dev/null}` shell block. Qwen Code skills now carry a numeric `priority` field so the most-used main-loop workflows (`new-project`, `plan-phase`, `execute-phase`, …) surface first in the `/skills` list. The OpenCode per-command `model`/`agent`/`subtask` enrichment was evaluated and intentionally not implemented — `model` would reintroduce the ProviderModelNotFoundError regression that the converter deliberately guards against for non-Anthropic providers (#1156), `subtask`/`agent` change execution semantics for GSD's interactive commands, and `variant` is not in the OpenCode command schema. (#778) (#825)
- Emit native on-demand skills (`skills/<name>/SKILL.md`) for the OpenCode-family runtimes (OpenCode and Kilo) at install time, in addition to the existing flat `command/` and file-based `agents/` surfaces. OpenCode and Kilo share a config schema and both discover skills from `skills/<name>/SKILL.md`; the installer now stages each GSD command as a skill with minimal, spec-compliant frontmatter (`name` matching the directory, `description` 1–1024 chars) via a shared OpenCode-family skill writer. Skills respect the active install profile (core/minimal stage only their subset) and are removed on uninstall. (#784) (#810)
- `gsd install --cursor` now writes `.cursor/commands/gsd-<name>.md` in addition to the existing `.cursor/skills/` surface. Cursor 1.6 introduced plain-markdown slash commands (no frontmatter) in `.cursor/commands/`; they appear in the `/` menu in the Agent input. Each command file is generated from the same source as the skill but with frontmatter stripped and Cursor-specific content transforms applied (`convertClaudeCommandToCursorCommand`). The skills surface is unchanged — both surfaces are written on every install. (#803)
- The GitHub Copilot installer now reaches lifecycle-hook and instruction parity with other first-class runtimes. It emits a self-contained `sessionStart` hook config (`.github/hooks/gsd-session.json` for local installs, `~/.copilot/hooks/gsd-session.json` for global) and writes `AGENTS.md` at the repository root (which Copilot CLI reads as primary instructions) alongside `copilot-instructions.md`. The hook is an inline `command` hook with no separate script file, so it cannot dangle. Both artifacts are removed — with user-authored content preserved — on `--uninstall`. (#786) (#804)
- Elevate the Cline runtime to hook parity. The installer now emits the Cline `.clinerules/` directory form (`.clinerules/gsd.md`) instead of a single `.clinerules` file, adds a `.clinerules/hooks/PreToolUse` lifecycle hook (Cline v3.36+ JSON stdin → `{cancel,errorMessage,contextModification}` protocol; guards `.planning/` artifacts and fails open), and merges GSD instructions into the cross-tool global `~/.agents/AGENTS.md` target on global installs. A legacy single-file `.clinerules` is migrated to the directory form in place, and `--uninstall` removes the new artifacts and strips the GSD block from `~/.agents/AGENTS.md`. (#787) (#803)
- Qwen Code installs now register three additional hook events that Qwen Code supports beyond Claude Code: `SubagentStop`, `Stop`, and `PreCompact` — all wired to `gsd-context-monitor.js` for context headroom tracking at subagent completion, model stop, and pre-compaction. These events are Qwen-only; Claude Code installs are unchanged. `UserPromptSubmit` is deferred: `gsd-prompt-guard` exits unless `tool_name` is `Write|Edit`, making it a no-op for that payload shape. (#788) (#807)
- **CodeBuddy (Tencent) installs now emit `/gsd-*` slash commands.** A `--codebuddy` install writes `commands/gsd-<name>.md` files to `~/.codebuddy/commands/` so GSD workflows are invokable from CodeBuddy's `/` menu (`/gsd-phase`, `/gsd-ship`, etc.), matching the integration depth of other fully-elevated runtimes (#789). The existing `skills/gsd-<name>/SKILL.md` files are now emitted with `user-invocable: false` so they stay out of the `/` menu — the commands surface is the single `/` entry point (no duplicate entries) and skills remain available for model invocation. Subagents (`~/.codebuddy/agents/`) were already emitted and are unchanged. Uninstall removes the `gsd-*` command files while preserving user-owned commands. No `mcp.json` is written — gsd ships no MCP server and CodeBuddy's `mcp.json` only registers external MCP servers.

<!-- docs-exempt-not-used: user-facing install behaviour is documented in docs/USER-GUIDE.md and docs/how-to/install-on-your-runtime.md --> (#830)
- **Augment installs now emit slash command definitions alongside skills.** A global `--augment` install writes `commands/gsd-<name>.md` files to `~/.augment/commands/` in addition to the existing `skills/gsd-<name>/SKILL.md` files, matching the integration depth of other fully-elevated runtimes and allowing Auggie users to invoke GSD as slash commands (`/gsd-phase`, `/gsd-ship`, etc.) without manual configuration (#790). Content rewrites (path normalisation and Augment-specific branding) are applied at install time. Uninstall removes the `gsd-*` command files while preserving user-owned commands. `mcpServers` registration is explicitly excluded — gsd ships no MCP server and does not register third-party servers. (#801)
- Issues are now checked for duplicates when opened: a no-LLM title-similarity check posts a challenge comment and applies a `possible-duplicate` label when a new issue closely matches existing open ones. Flagged issues that go unanswered for 24h are auto-closed as duplicates (reply, or react 👎 to the bot comment, to keep one open); a reply clears the label and routes to `needs-maintainer-review`. (#836) (#843)
- Cursor now receives GSD lifecycle hooks via `.cursor/hooks.json` — a sessionStart hook injects the current workflow state as context at session start, and a postToolUse hook nudges the agent to update `.planning/` after write-class operations, bringing Cursor to baseline hook parity with Gemini and Claude Code. (#777)
- **Gemini CLI extension package** — gsd-core now ships a `gemini-extension.json` manifest (plus a `GEMINI.md` context payload) at the repository root, so Gemini CLI users can install, update, and remove GSD through Gemini's own extension lifecycle: `gemini extensions install https://github.com/open-gsd/gsd-core`, `gemini extensions update gsd-core`, `gemini extensions uninstall gsd-core`, and `gemini extensions link <path>` for local dev. The extension is discoverable in `gemini extensions list` and loads GSD's operating context into every session. Additive — the existing `npx gsd-core --gemini` installer (which provides the `/gsd:*` slash commands) is unchanged. (#775) (#775)
- **New `agent_skills_security.trusted_global_roots` config** — opt-in allowlist of trusted root directories so symlinked `global:` agent skills whose real path resolves outside the default skills dir (e.g. `~/.claude/skills`) are accepted; default `[]` is byte-identical and preserves the symlink-escape guard. (#754)
- Added `/gsd-update --next` (alias `--rc`) to install or refresh from the `@next` RC dist-tag (ADR #660). A new `parse_update_channel` workflow step resolves the channel from `$ARGUMENTS`; the version check and all three npx install invocations thread `$TAG` instead of hardcoding `@latest`. When `--next` is used the version-comparison output gains a `Channel: next (RC)` banner so the user knows they are leaving the stable line; omitting the flag keeps `@latest` behavior byte-for-byte unchanged. `check-latest-version.cjs` gains `ALLOWED_TAGS`, `buildViewArgs`, and `resolveTag` exports, with an allowlist guard (enforced at both the CLI and function boundary) that rejects any dist-tag other than `latest`/`next`. (#815) (#839)

### Changed

- `/gsd:plan-phase --research-phase <N>` now auto-uses an existing `RESEARCH.md` instead of prompting update/view/skip. When research already exists and neither `--research` nor `--view` is passed, it emits a one-line notice and exits cleanly, matching the promptless behavior of standard `/gsd:plan-phase <N>`. Pass `--research` to force-refresh or `--view` to print the existing research. (#159) (#718)
- Retire the installer's one-off runtime directory helpers (`getGlobalDir`/`getOpencodeGlobalDir`/`getKiloGlobalDir`) and consolidate per-runtime global config-dir resolution onto the single canonical projection `runtime-homes:getGlobalConfigDir`, extended with the `--config-dir` override and the opencode/kilo `*_CONFIG` file-path precedence. Behavior-preserving across all 15 install runtimes. (#56) (#802)
- Make per-runtime config-mutation dispatch in the installer explicit: a new runtime config adapter registry maps each supported runtime to a typed config intent (install surface, shared-settings gate, finish-phase permission writer), and `install()`/`finishInstall()` dispatch by resolved intent instead of inline `runtime === '...'` branching. Behavior-preserving; unknown runtimes now fail loudly. (#60) (#795)
- **Verification status routing is now owned by a single queryable seam** — `ship.md` and `execute-phase.md` both consume `gsd_run query verification.status` instead of re-deriving the `passed`/`gaps_found`/`human_needed` routing independently; the query returns `next_action` and `next_command` so per-status prose no longer needs to be kept in sync across files. This also fixes the broad-grep status misread in `execute-phase.md` where a body `status:` line (in a code block or copied artifact) could concatenate with the frontmatter value and misroute a valid passed phase; a parity test fails if a new verifier status value lacks a route. (#651) (#755)
- Agent `color:` frontmatter now uses Claude Code's documented named colors (`red`/`blue`/`green`/`yellow`/`purple`/`orange`/`pink`/`cyan`) instead of hex values or the undocumented `magenta`, so the intended per-agent TUI color differentiation renders reliably across the Claude Code runtime. Display-only metadata; no behavior change. (#771) (#823)
- Codex installs now register three additional stable hook events (`SubagentStart`, `Stop`, `PostToolUse`) wired to `gsd-context-monitor.js`, matching the full event coverage available since Codex CLI stabilised these hooks. The `SessionStart` hook entry gains a `commandWindows` field on Windows installs so the `.cmd` shim is used for native execution (Git Bash/MSYS cannot POSIX-exec `node.exe` directly). Both new-event registration and uninstall paths handle the flat `{ "EventName": [...] }` and nested `{ "hooks": { "EventName": [...] } }` hooks.json shapes. `gsd-context-monitor.js` and its Windows `.cmd` sibling are added to the managed-hook allowlist so idempotent re-runs de-duplicate entries correctly. (#772) (#827)
- Codex CLI installs now emit two enrichments per agent and skill. **Agent TOML enrichment:** light-tier agents (haiku-equivalent, `routingTier: "light"` in model-catalog.json) get `service_tier = "flex"` and `model_verbosity = "low"` appended to their agent TOML, telling the Codex scheduler to use the flex tier (lower cost, background processing) and suppress verbose token output. **Skill TUI chip:** each installed `gsd-*` skill directory now receives an `agents/openai.yaml` file with `interface.display_name` and `interface.short_description`, making the skill appear in the Codex `/skills` picker with a human-readable name and description drawn from the skill's existing short-description frontmatter. Both enrichments are additive and backward-compatible with Codex CLI ≥ 0.130.0. (#774) (#828)
- **Cline global installs now emit skills, not just rules:** gsd writes skills to `~/.cline/skills/<name>/SKILL.md` for Cline ≥ v3.48.0 (see [Cline skills docs](https://docs.cline.bot/customization/skills)), in addition to the existing `.clinerules` file. Each `SKILL.md` carries `name`/`description` frontmatter (agentskills.io) with paths rewritten to the `.cline/` convention. Local installs remain `.clinerules`-only. The `.clinerules` rules file continues to be emitted for compatibility, and upgrading over an existing rules-only install emits the new skills on the next run. (#809)
- **Workflow size budget now measures bytes, not lines (#717).** `tests/workflow-size-budget.test.cjs` re-bases its tier ceilings (XL/LARGE/DEFAULT) from line counts to byte counts — deterministic, no tokenizer, and matching the unit vendors bound on (Codex's 32,768-byte project_doc_max_bytes cap). The #597 tighten-only ratchet and per-file semantics are unchanged; the budget's caching-independent quality rationale (context rot / attention budget) is now documented. (#719)
- The `gsd-verifier` agent no longer re-runs the full workspace test suite once per must-have during Step 7b spot-checks — it enumerates tests to prove existence and runs a single named test to prove a pass, invoking the full suite at most once per verification. (#753)
- **`/gsd-plan-phase`, `/gsd-execute-phase`, `/gsd-autonomous` now run in an isolated forked context on Claude Code** — `context: fork` in skill frontmatter protects the main session's context budget. These three heavy skills also declare `effort: xhigh`; quick-status skills `/gsd-progress` and `/gsd-stats` declare `effort: low`. The installer preserves both fields when converting commands to Claude SKILL.md files. Runtimes that do not recognise these fields silently ignore them — no behaviour change on non-Claude runtimes. (#769)
- **`/gsd:plan-phase` and `/gsd:execute-phase` no longer eagerly load MVP-only guidance on non-MVP runs** — the MVP planner rules, user-story template, Walking-Skeleton template, and MVP+TDD halt-report reference are now Read lazily by the planner/executor only when MVP / Walking-Skeleton / MVP+TDD mode is active, in both the workflow files and the `gsd-planner`/`gsd-executor` agent definitions, instead of being `@`-imported into every run. Behaviour is unchanged; non-MVP planning/execution simply carries less context. (#720) (#746)
- 
Automated `codex exec` invocations in the review workflow now include `--ephemeral` (no session-state accumulation across automated/CI runs) and `--dangerously-bypass-hook-trust` (skip hook-trust prompts for hooks managed by gsd-core itself). These flags apply only to the non-interactive reviewer invocations in `gsd-core/workflows/review.md`. (#773) (#824)
- **Codex slash-command conversion no longer corrupts inline-wrapped `/gsd-…` file paths** — the install-time converter now identifies a real `/gsd-<command>` mention by positive boundaries (opening delimiter + no path continuation) instead of an unbounded preceding-character denylist, closing the path-corruption class (#637 → #704) by construction while still converting legitimate backtick-wrapped mentions. (#747)
- The release pipeline now automatically runs `changeset render` during the finalize job, promoting `.changeset/` fragments into a dated `CHANGELOG.md` section before publishing — previously a manual step that was routinely skipped (leaving v1.3.0 and v1.3.1 unpromoted, #690). A new `--allow-empty` flag prevents the verify gate from hard-failing on no-change releases by emitting a dated heading with a `_No notable changes._` placeholder when there are zero fragments. (#715)

### Fixed

- `/gsd-review --cursor` now actually invokes the Cursor agent. Detection probes the `cursor-agent` headless binary instead of the `cursor` IDE launcher, the invocation calls the single `cursor-agent` binary in print mode (not the two-token `cursor agent`, which the IDE treats as a file path), and the review prompt is passed as a file-path argument rather than piped to stdin (which `cursor-agent -p` ignores). On failure the captured stderr is surfaced instead of a silent empty result. (#686)
- **No more "gsd-core" console-window flash on Windows.** Every gsd-core child process now passes `windowsHide: true`: the context monitor's `record-session` spawn, the `execGit` / `execNpm` / `execTool` helpers in `shell-command-projection`, the `gsd-worktree-path-guard` and `gsd-workflow-guard` hook git probes, `check-command-router`'s `git log` call, and the `roadmap-upgrade` git status/rev-parse/reset/clean calls — matching the existing `gsd-check-update` spawn. `execNpm` (which uses `shell: true` → `cmd.exe` and runs on every SessionStart, i.e. every `/clear`) and the worktree-path guard (which runs on every Edit/Write in a worktree) were the most visible offenders. No behavior change on macOS/Linux, where the flag is ignored. (#688)
- **`/gsd-review --agy` no longer hangs the whole review on large prompts.** On a big, file-path-rich prompt Antigravity's `agy -p` agentic Cascade can loop on its `code_search`/grep steps and never converge. The invocation now passes agy's own `--print-timeout` flag (its native print-mode cap) so a stalled run self-terminates through the tool's own mechanism; on a non-zero exit any partial output is discarded so the existing transcript fallback / "review failed" stub take over. (#689)
- The roadmap parser now resolves fresh phases of the current milestone in multi-milestone roadmaps. `extractCurrentMilestone()` scoped the current-milestone window to its `## Phases` checklist subsection and stopped at the milestone's own `## Milestone … (Phase Details)` heading, so the `### Phase N:` detail headers fell out of scope. Any command backed by the parser — `init.phase-op` (and therefore `/gsd:discuss-phase` and `/gsd:plan-phase`), `state`, `roadmap list`, and `validate health` (W006) — could not resolve phases of any milestone after the first until a `.planning/phases/` directory already existed, blocking discuss/plan. The parser now also includes the current milestone's `(Phase Details)` section in scope, anchored to the selected milestone's version token so sibling sub-milestones do not cross-pollinate. (#730) (#748)
- **`getGlobalSkillsBase('kilo')` now resolves to `~/.kilo/skills`** — where Kilo Code actually discovers global skills — instead of `~/.config/kilo/skills`. Per [Kilo Code docs](https://kilo.ai/docs/customize/skills), global skills live in the `.kilo` directory within HOME (`~/.kilo/skills/`), independent of the XDG-based config dir at `~/.config/kilo`. The kilo.jsonc config dir (`~/.config/kilo`) and the `command/` path used by the installer are correct and unchanged. Blast radius: this corrects the resolved skills-base path used by doctor/status checks and agent-skills-block resolution (`init.cjs`); the installer writes commands (not skills) for Kilo, so no files were previously being written to the wrong location. (#806)
- Honor the `COPILOT_HOME` environment variable when resolving the GitHub Copilot global config directory. Previously a global `--copilot` install ignored `COPILOT_HOME` and wrote all artifacts (skills, agents, `copilot-instructions.md`, the session hook) to `~/.copilot` even when the user had relocated their Copilot home, making them undiscoverable by Copilot CLI. Resolution now follows `--config-dir` > `COPILOT_CONFIG_DIR` > `COPILOT_HOME` > `~/.copilot`, mirroring the existing `CODEX_HOME` handling. Uninstall uses the same resolver and stays symmetric. (#812) (#814)
- **Release version bumps now keep runtime manifest versions in sync** — `.claude-plugin/plugin.json` and `gemini-extension.json` are stamped to match `package.json` on every `npm version`, unblocking RC/finalize releases. New version-bearing manifests must be registered in `scripts/sync-manifest-versions.cjs` (enforced by a regression test). (#845)
- **`npx @opengsd/gsd-core` upgrades no longer abort with "applied migration checksum changed"** — an already-applied installer migration whose recorded checksum drifted (e.g. a shipped body was edited) is now detected and reconciled automatically on the next install, instead of hard-failing the upgrade. Replaces the published-checksum allowlist with general self-healing recovery plus a CI baseline lock. (#675)
- **`/gsd-import`, `/gsd-plan-review-convergence`, and `/gsd-spec-phase` now run on global installs** — these workflows resolve `gsd-tools` via the runtime launcher instead of a hardcoded `$HOME` path, so they no longer falsely report the tool as "not found" (and stop short) when only a global/shim install is present and no project-local runtime exists. (#642)
- **Worktree wave-cleanup no longer fails when the phase SUMMARY is committed** — `rescueSummaryArtifacts` no longer copies an already-committed SUMMARY into the main checkout, which previously caused `git merge --no-ff` to abort with a permanent `merge_failed` (#706). (#709)
- **Phase execution no longer halts with `exit 42` (worktree base mismatch) when run on a branch diverged from the default branch (#683).** Claude Code forks worktree-isolated executors off the repository default branch (`origin/HEAD`), so running `/gsd-execute-phase` on an unmerged milestone/feature branch left every executor without the phase's plan files and tripped the `worktree-branch-check` guard (100% reproducible, all OSes). Execute-phase now detects this before dispatch and automatically degrades to sequential execution on the main working tree, recommending the permanent fix `worktree.baseRef:"head"`. Both fresh installs and upgrades of GSD Core set `worktree.baseRef:"head"` in `.claude/settings.local.json` automatically (no-clobber) when `workflow.use_worktrees` is enabled (the default); `gsd-tools worktree set-baseref` remains available for manual use (e.g. after toggling worktrees on later). The `exit 42` guard remains as a backstop. (#749)
- **Codex install no longer corrupts launcher paths** — shell path segments like `${VAR}/gsd-core/` and `$(cmd)/gsd-local-patches` are no longer rewritten into a literal `$gsd-core` token during Codex markdown conversion (#704). (#710)
- **`/gsd:surface` no longer corrupts installed skill paths** — re-surfacing (profile/enable/disable/reset) now applies the same per-runtime path rewrites as install, so SKILL.md bodies keep the correct install target instead of reverting to the converter's default `~/.claude` paths. (#817)
- **`/gsd:graphify`, `/gsd:import`, and planning agents now resolve `gsd-tools` on global/shim-only installs** — agent and command surfaces that invoked a hardcoded `$HOME/.claude/...gsd-tools.cjs` path now route through the resolved `gsd_run` launcher, so the step no longer reports the tool "not found" when there is no project-local runtime. (#707)
- **`/gsd:surface` no longer mis-names or orphans runtime command files** — re-surfacing now writes the same `gsd-`-prefixed command filenames as a fresh install for flat command dirs (Cursor, Augment, OpenCode, Kilo) and preserves user-authored command files instead of deleting them. (#822)
- **`/gsd:update` reliably previews release notes again** — promotes the 1.3.x changelog into dated `[1.3.0]`/`[1.3.1]` sections, stops deleting the temp changelog before the human-readable render (no more `(changelog unavailable)`), and adds a release gate that blocks publishing a version whose `CHANGELOG.md` section was never promoted. (#694)

### Security

- **`gsd-tools config-set` prototype-pollution guard hardened and regression-tested.** The guard that blocks `__proto__`, `prototype`, and `constructor` segments in dotted config keys now uses inline literal comparisons at each property-write site (instead of a pre-loop `Set` check), so CodeQL's `js/prototype-pollution-utility` analysis recognises it as a sanitising barrier and code-scanning alert #26 clears. Runtime behaviour is unchanged from #663. Added regression tests that drive schema-valid dynamic-prefix keys (`agent_skills.__proto__`, `agent_skills.constructor`, `features.__proto__`, `review.models.constructor`) all the way to the guard — these reach `setConfigValue` past the schema gate and were previously the guard's only untested attack surface. (#751) (#752)
- **Hardened roadmap-phase parsing and config writes** — resolved ReDoS in phase-heading/plan-filename regexes (validate/verify/commands/phase), blocked prototype-pollution through dotted config keys in `config-set`, and pinned `qs >= 6.15.2` (DoS advisory). (#665)

## [1.3.1](https://www.npmjs.com/package/@opengsd/gsd-core/v/1.3.1) - 2026-06-04

### Security

- **Bumped `hono` to clear a moderate npm advisory** carried transitively in the dependency tree. (#670)

### Fixed

- **Installer-migration checksum drift no longer blocks upgrades** — the updater now self-heals when a shipped migration's recorded checksum has drifted, reconciling the stored checksum instead of aborting. Restores upgrades across all OSes after shipped migration bodies were edited in a prior release. (#670)

## [1.3.0](https://www.npmjs.com/package/@opengsd/gsd-core/v/1.3.0) - 2026-06-04

### Added

- **Vertical MVP Slice mode** — `--mvp` flag on `/gsd-plan-phase` switches the planner from horizontal layer decomposition to vertical feature-slice decomposition (UI→API→DB in one task sequence). On Phase 1 of a new project with no prior phase summaries, also emits `SKELETON.md` via Walking Skeleton mode. Composable with `--tdd`: `--mvp --tdd` produces vertical slices where every behavior-adding task starts with a failing test. Phase-level persistence via `**Mode:** mvp` in ROADMAP.md applies `--mvp` automatically without the flag. (#78)
- **`/gsd-mvp-phase` command** — guided MVP planning: prompts for a user story (`As a / I want to / So that`), runs SPIDR story-splitting check (Spike/Paths/Interfaces/Data/Rules axes), writes `**Mode:** mvp` to ROADMAP.md, then delegates to `/gsd-plan-phase`. (#78)
- **MVP-aware UAT framing in `verify-phase`** — when a phase has `mode: mvp`, the verifier generates a user-flow-first UAT script (walks the feature as a user would) before any technical checks. (#78)
- **MVP progress and stats display** — `progress` and `stats` commands show Walking Skeleton completion status and per-feature-slice status lines for MVP-mode phases. (#78)
- **Six MVP reference files** — `planner-mvp-mode.md`, `skeleton-template.md`, `user-story-template.md`, `spidr-splitting.md`, `execute-mvp-tdd.md`, `verify-mvp-mode.md` — loaded by the planner, executor, and verifier agents when MVP mode is active. (#78)
- Milestone-prefixed phase ID convention (M-NN) for globally unique phase IDs within a project (#39)
- `getMilestoneFromPhaseId()` and `getPhaseDirFromPhaseId()` helpers in core.cjs (#39)
- W021 validation rule: fires when a phase ID's integer prefix mismatches its enclosing milestone section (#39)
- `gsd-tools roadmap validate` subcommand for convention compliance checking (#39)
- `gsd-tools roadmap upgrade --convention milestone-prefixed` migration tool (dry-run by default, `--apply` to mutate) (#39)
- `phase_id_convention` config field (`null` | `'milestone-prefixed'` | `'free-form'`), defaults to `null` (legacy free-form, no breaking change) (#39)

### Fixed

- `isDirInMilestone` now correctly matches M-NN-style phase directories against milestone-prefixed ROADMAP headings (#39)
- `searchPhaseInContent` heading regex now tolerates `[bracket-token]` scope prefix (e.g., `### [GSD] Phase 2-01:`) (#39)
- **README version guidance now uses npm/package metadata as the source of truth** — README, localized READMEs, and the docs index no longer present archived release-note or canary-stream numbers as the current GSD Core package version. (#545)

## [1.2.0](https://www.npmjs.com/package/@opengsd/gsd-core/v/1.2.0) - 2026-05-31

`1.2.0` is the current stable `@opengsd/gsd-core` release. It resumes the public package line after the release-version validation recovery documented in [ADR 218](docs/adr/218-release-version-validation.md) and makes `@opengsd/gsd-core` / `gsd-core` the canonical package and CLI identity.

### Added

- **Plan-vs-codebase drift guard** — plan review can verify generated plans against live source symbols before execution so hallucinated files, APIs, or commands are caught earlier. (#487)
- **Single Package Identity seam** — package name, CLI identity, update checks, and installer identity are centralized so `@opengsd/gsd-core` stays consistent across runtime surfaces. (#499, #517, #521)
- **Cross-provider effort controls and fast-mode-aware routing** — model-effort selection works across providers and can adjust routing for faster workflows. (#463)
- **Current public docs and install identity** — README/docs now advertise GSD Core, `@opengsd/gsd-core`, and the `gsd-core` binary as the canonical user-facing surface. (#519, #523, #540)

### Changed

- **SDK shim retired from installer/runtime docs** — workflows now route through `gsd-tools`; dead SDK-shim verification and stale SDK-generated banners were removed. (#522, #515, #510)
- **Release numbering recovered at `1.2.0`** — leading-zero release inputs are invalid and duplicate-version checks fail early before publish work begins. See [ADR 218](docs/adr/218-release-version-validation.md).
- **CI/test selection is more precise** — affected-test selection now widens docs/test-impact correctly and avoids under-testing relevant PRs. (#495)

### Fixed

- **Planning writes are more reliable** — phase completion writes are transactional and no longer corrupt milestone progress counters. (#465, #514)
- **Roadmap and milestone parsing no longer leak stale phase details into active milestone state.** (#513)
- **`/gsd:update` detects local Antigravity `.agent` installs and repo-local Claude installs correctly.** (#512, #476)
- **Package identity registration no longer regresses update/runtime detection.** (#521)

## Legacy Release History

Release notes for every version published before the project was renamed to `@opengsd/gsd-core` — the retired `get-shit-done-cc` / `get-shit-done-redux` lineage, versions `1.0.0` → `1.42.x` plus pre-release and canary builds — have been rolled up into a single archive:

➡️ **[docs/RELEASE-NOTES-LEGACY.md](docs/RELEASE-NOTES-LEGACY.md)**

Those legacy `1.x` numbers belong to the previous package line and predate the current `@opengsd/gsd-core` versioning, which restarts at `1.0.0`. They are preserved verbatim-in-spirit (condensed) in the archive and intentionally kept out of this file so the two version streams cannot collide.

[Unreleased]: https://github.com/open-gsd/gsd-core/compare/main...HEAD

## Fork history (jj support line, pre-merge)

> The entries below are the changelog as carried by the Jujutsu-support fork at merge time (fork main `c7bd6bee`, 2026-05-29) — the legacy `get-shit-done` 1.x lineage as the fork tracked it, including the fork's corrections. Preserved verbatim for fork provenance. Upstream's own condensed legacy archive lives at [docs/RELEASE-NOTES-LEGACY.md](docs/RELEASE-NOTES-LEGACY.md); version numbers below belong to the retired package line, not the current `@opengsd/gsd-core` stream.

## [Unreleased](https://github.com/gsd-build/get-shit-done/compare/v1.42.1...HEAD)

## [1.42.1](https://github.com/gsd-build/get-shit-done/compare/v1.41.0...v1.42.1) - 2026-05-15

### Fixed

- **`/gsd-discuss-phase` and `/gsd-plan-phase` first-touch creation now apply `project_code` prefix consistently with `phase.add`/`phase.insert`** — projects with `project_code` set in `.planning/config.json` no longer accumulate a two-headed naming convention (`01-foundation/` mixed with `XR-02.1-spike/`). `init.phase-op` and `init.plan-phase` now expose `expected_phase_dir` (with prefix) in their JSON bundle; workflow fallback mkdir calls use this value instead of constructing the path from `padded_phase`+`phase_slug`. `phase.scaffold phase-dir` (CJS and SDK) also fixed. (#3287)
- **`buildStateFrontmatter` now counts nested `plans/<N>-PLAN-<NN>-<slug>.md` files** — repos using the nested layout (post-#3139) no longer get `progress.*` counters silently overwritten downward on every state mutation. Sibling fix to #3115/#3139/#3191. (#3261)

## [1.41.0](https://github.com/gsd-build/get-shit-done/compare/v1.40.0...v1.41.0) - 2026-05-07

### Fixed

- **Atomic writes in `scripts/build-hooks.js` to fix flaky release CI** — nine test files invoke `build-hooks.js` from their `before()` hooks, and `scripts/run-tests.cjs` runs test files with `--test-concurrency=4`, so multiple builders raced to rewrite the same files in `hooks/dist/`. `fs.copyFileSync(src, dest)` truncates `dest` then writes it; a parallel `bin/install.js` subprocess (spawned by another install test) could `fs.readFileSync` between the truncate and the write and observe an empty file. install.js then wrote that empty content into the install target, so installed `.sh` hooks lacked their `# gsd-hook-version:` header. This surfaced as the release-blocking failure in `tests/bug-2136-sh-hook-version.test.cjs` part 4 even though the same SHA passed on every other Node-22/Node-24 install-smoke matrix run. `build-hooks.js` now stages each output to a sibling `hooks/.dist-staging/` directory (same filesystem as `hooks/dist/`) and uses `fs.renameSync` to swap into place — POSIX `rename(2)` is atomic, so concurrent readers always observe a complete file. (Failing run: https://github.com/gsd-build/get-shit-done/actions/runs/25472202941/job/74738276687)
- **Stable node path on Homebrew** — `resolveNodeRunner()` now maps versioned Homebrew Cellar paths (e.g. `/usr/local/Cellar/node/25.8.1/bin/node`) to the stable Homebrew symlinks (`/usr/local/bin/node` on Intel, `/opt/homebrew/bin/node` on Apple Silicon). `rewriteLegacyManagedNodeHookCommands()` applies the same normalization to baked Cellar paths in existing hook commands. This prevents `dyld: Library not loaded` errors after `brew upgrade node`. (#3181)
- **Milestone-archive layout support** — `validate consistency`, `validate health`, and `find-phase` now scan `.planning/milestones/v*-phases/` directories in addition to the flat `.planning/phases/` layout. Projects that have graduated to milestone-archive layout no longer receive spurious W006 "Phase N in ROADMAP.md but no directory on disk" warnings for every active phase. (#3164)

### Feature

- **Six namespace meta-skills with keyword-tag descriptions** — replace the flat 86-skill
  listing with two-stage hierarchical routing. Model sees 6 namespace routers
  (`gsd:workflow`, `gsd:project`, `gsd:review`, `gsd:context`, `gsd:manage`,
  `gsd:ideate`) instead of 86 flat entries; selects a namespace, then routes to the
  sub-skill. Descriptions use pipe-separated keyword tags (≤ 60 chars). Cuts cold-start
  system-prompt overhead from ~2,150 tokens to ~120. Existing sub-skills are unchanged
  and still invocable directly. (#2792)
- **`/gsd-health --context` utilization guard** — context-window quality guard with two
  thresholds: 60 % warns ("consider `/gsd-thread`"), 70 % is critical ("reasoning
  quality may degrade"). Exposed via `/gsd-health --context` and as a structured
  `gsd-tools validate context` command. (#2792)
- **Phase-lifecycle status-line — read-side** — `parseStateMd()` now reads four new
  STATE.md frontmatter fields: `active_phase`, `next_action`, `next_phases`, and
  `progress` (nested completed/total/percent). `formatGsdState()` gains scenes for
  in-flight, idle, and progress display. All fields default to undefined so existing
  STATE.md files keep rendering. Write-side and status-line wiring follow in a later
  RC. (#2833)
- `--minimal` install flag (alias `--core-only`) writes only the main-loop core skills
  (`new-project`, `discuss-phase`, `plan-phase`, `execute-phase`, `help`, `update`) and
  zero `gsd-*` subagents. Cuts cold-start system-prompt overhead from ~12k tokens to
  ~700, useful for local LLMs with 32K–128K context (Sonnet 4.6 / Opus 4.7 don't need
  it). Re-run `gsd update` without `--minimal` to expand to the full surface. The
  install manifest now records `mode: "minimal" | "full"`. (#2762)
- **`/gsd-edit-phase` command** — modify any field of an existing phase in ROADMAP.md
  without changing its number or position. Supports `--force` to skip the confirmation
  diff, validates `depends_on` references, and updates STATE.md on write. (#2617)
- **Post-merge build & test gate** — execute-phase step 5.6 now runs in both parallel
  and serial mode. Adds a build gate that auto-detects the build command from
  `workflow.build_command` config, then falls back to Xcode (`.xcodeproj`), Makefile,
  Justfile, Cargo, Go, Python, or npm. Xcode/iOS projects run `xcodebuild build` and
  `xcodebuild test` automatically. (#2720)
- **Extended runtime model profiles** — RUNTIME_PROFILE_MAP now covers `gemini`,
  `qwen`, `opencode`, and `copilot` runtimes with full three-tier (fast/balanced/opus)
  model mappings. Group B runtimes (kilo, cline, cursor, windsurf, augment, trae,
  codebuddy, antigravity) fall through to the existing unknown-runtime fallback. (#2612)
- **Workstream config inheritance** — when `GSD_WORKSTREAM` is set, the root
  `.planning/config.json` is loaded first and deep-merged with the workstream config
  (workstream wins on conflict). Explicit `null` in a workstream config now correctly
  overrides a root value. (#2714)
- **Manual canary release workflow** — `.github/workflows/canary.yml` publishes
  `{base}-canary.{N}` builds of `get-shit-done-cc` and `@gsd-build/sdk` under the
  `canary` dist-tag on demand via `workflow_dispatch` (manual trigger only — auto-publish
  on every push to main was rejected because submission rate is too high). Includes an
  optional `dry_run` boolean and the same publish-verification gate as `release.yml`. (#2828)

### Enhancement

- **`/gsd-graphify status` surfaces commit-based staleness from graphify v0.7+** — `graphifyStatus()` now reads `built_at_commit` from `graph.json` (graphify v0.7+ embeds it at build time), compares against `git HEAD`, and returns four new fields: `built_at_commit`, `current_commit`, `commits_behind`, and `commit_stale`. The `commit_stale` flag is tri-state (`true`/`false`/`null`) — `null` means the signal is unavailable (pre-v0.7 graph, non-git checkout, or unreachable commit) and callers should fall back to the existing mtime-based `stale` flag. The skill renders `Source commit: <hash> (N commits behind HEAD | current | freshness unknown)` when the signal is present, and omits the line entirely for pre-v0.7 graphs. The `built_at_commit` value is validated as 4–40 hex chars before reaching `git`, so a hostile `graph.json` cannot smuggle dashed options into the argv. Also documents `graphify hook install` in `docs/CONFIGURATION.md` for multi-dev teams who would otherwise hit `graph.json` merge conflicts on parallel rebuilds. Regression covered by `tests/enh-3170-graphify-commit-staleness.test.cjs` (8 assertions across git-aware, non-git, and back-compat groups). (#3170)
- **Test suite for `config-schema.cjs` is now mutation-resistant** — Stryker measured a 4.62% mutation score on `get-shit-done/bin/lib/config-schema.cjs` (6 killed, 124 survived out of 130). Surviving mutants flagged that existing tests were exercising paths but not verifying outputs: a polarity flip (`return true` → `return false`), a predicate swap (`.some` → `.every`), or a guard removal (`if (VALID_CONFIG_KEYS.has(...)) return true;` → unguarded fallthrough) all passed every test. New `tests/bug-2986-config-schema-mutation-killers.test.cjs` adds 95 tests across four suites that target each surviving mutant class: (1) parameterized `isValidConfigKey('${key}') === true` for every member of `VALID_CONFIG_KEYS` (kills the static-key-fast-path mutation), (2) representative dynamic-pattern keys that match exactly one pattern (kills the `.some` → `.every` mutation, with an inline mutual-exclusivity invariant check), (3) `strictEqual` against the literal boolean `true`/`false` instead of `assert.ok` truthy checks (kills polarity-flip mutations), (4) anchor-tightening cases that differ from valid keys by one character beyond the documented shape (kills regex-loosening mutations on `^`, `$`, and character-class boundaries). Tests use the lib's public surface (typed boolean assertions on `isValidConfigKey` return values), no source-grep. (#2986)
- **Hotfix release flow now auto-incorporates fixes from `main` and bundles the SDK** — `hotfix.yml create` auto-cherry-picks every `fix:`/`chore:` commit on `origin/main` not yet shipped (oldest-first; patch-equivalents skipped via `git cherry`; `feat:`/`refactor:` excluded; conflicts halt with the offending SHA; run summary lists every included SHA). `hotfix.yml finalize` adds the `install-smoke` cross-platform gate, bundles `sdk-bundle/gsd-sdk.tgz` inside the CC tarball (parity with `release-sdk.yml`), tightens the `next` dist-tag re-point, and marks the GitHub Release `--latest`. `release-sdk.yml` gains `action: publish | hotfix` plus an `auto_cherry_pick` toggle, with a new `prepare` job that branches `hotfix/X.YY.Z` from the highest existing `vX.YY.*` tag and runs the same cherry-pick logic — idempotent if the branch was pre-prepared via `hotfix.yml`. Hotfix `vX.YY.Z` is now defined as everything in `vX.YY.{Z-1}` plus every `fix:`/`chore:` since that base, so each tag is the cumulative-fix anchor for the next. (#2955)
- **Planning workspace seam extracted from `core.cjs` into `planning-workspace.cjs`** — path/workstream/lock behavior now lives in a dedicated module (`planningDir`, `planningPaths`, `planningRoot`, active-workstream routing, `withPlanningLock`). `core.cjs` keeps compatibility re-exports while call-sites migrate to direct imports, improving locality and reducing coupling. (#2900)
- **Skill surface consolidated 86 → 59 `commands/gsd/*.md` entries** — four new
  grouped skills (`capture`, `phase`, `config`, `workspace`) replace clusters of
  micro-skills. Six existing parents absorb wrap-up and sub-operations as flags:
  `update --sync/--reapply`, `sketch --wrap-up`, `spike --wrap-up`,
  `map-codebase --fast/--query`, `code-review --fix`, `progress --do/--next`. Zero
  functional loss; 31 micro-skills deleted. `autonomous.md` corrected to call
  `gsd:code-review --fix` (was invoking deleted `gsd:code-review-fix`). (#2790)
- **PRs missing `Closes #NNN` are auto-closed** — the `Issue link required` workflow
  now auto-closes PRs opened without a closing keyword that links a tracking issue,
  posting a comment that points to the contribution guide. (#2872)
- **Canary release workflow now publishes from `dev` branch only** — `.github/workflows/canary.yml`
  swaps its four publish-step guards from `refs/heads/main` to `refs/heads/dev`. Aligns the
  workflow with the new branch→dist-tag policy (`dev` → `@canary`, `main` → `@next`/`@latest`).
  Added a header comment documenting the policy. `workflow_dispatch` runs on `main` (or any
  other branch) now complete build/test/dry-run validation but skip publish + tag, instead
  of the previous behaviour where `main` published and `dev` silently no-op'd. (#2868)
- **Skill descriptions trimmed to ≤ 100 chars across all `commands/gsd/*.md`** — three
  anti-patterns eliminated: flag documentation already present in `argument-hint:` (e.g.
  `discuss-phase` was 380 chars, now 76), `Triggers:` keyword-stuffing lists, and
  numbered enumeration patterns. Range was 45–380 chars; now 45–99. (#2789)
- **`scripts/lint-descriptions.cjs` added** — CI lint gate that fails if any
  `commands/gsd/*.md` description exceeds 100 chars. Run via `npm run lint:descriptions`.
  (#2789)
- **Skill surface consolidated from 86 → 59 `commands/gsd/*.md` entries** — four new
  grouped skills replace clusters of micro-skills: `capture` (add-todo, note, add-backlog,
  plant-seed, check-todos), `phase` (add-phase, insert-phase, remove-phase, edit-phase),
  `config` (settings-advanced, settings-integrations, set-profile), `workspace`
  (new-workspace, list-workspaces, remove-workspace). Six parent skills absorb wrap-up
  and sub-operations as flags: `update --sync/--reapply`, `sketch --wrap-up`,
  `spike --wrap-up`, `map-codebase --fast/--query`, `code-review --fix`,
  `progress --do/--next`. Zero functional loss. (#2790)
- **`autonomous.md` corrected** — was invoking deleted `gsd:code-review-fix`; now calls
  `gsd:code-review --fix`. (#2790)
- **31 micro-skills deleted** — absorbed into consolidated parents or removed outright:
  add-todo, note, add-backlog, plant-seed, check-todos, add-phase, insert-phase,
  remove-phase, edit-phase, settings-advanced, settings-integrations, set-profile,
  new-workspace, list-workspaces, remove-workspace, sync-skills, reapply-patches,
  sketch-wrap-up, spike-wrap-up, scan, intel, code-review-fix, next, do,
  join-discord, research-phase, session-report, from-gsd2, analyze-dependencies,
  list-phase-assumptions, plan-milestone-gaps. All functionality preserved via flags on
  consolidated skills. (#2790)
- **`discuss-phase` lazy file loading** — entry-point `@file` directives replaced with
  on-demand `Read()` calls gated behind mode routing. Tokens loaded at skill entry drop
  from ~13k to near zero; only the branch actually invoked is loaded. (#2606)

### Fix

- **`/gsd-graphify build` now runs inline instead of spawning a sub-agent** — graphify v0.7+ split the build into a fast AST-extraction phase (cached) followed by a separate clustering + report-write phase. The cached extraction phase survived sub-agent isolation, but the post-extraction phase was SIGTERM'd when the agent exited, leaving the cache populated and no `graph.json` / `graph.html` / `GRAPH_REPORT.md` artifacts written to `.planning/graphs/`. The skill now runs `graphify update .`, the three artifact copies, the snapshot, and the status report as a single foreground Bash call so the entire pipeline survives to completion. The CLI's `graphify build` pre-flight still returns `action: "spawn_agent"` so external callers and existing tests keep working. Regression covered by `tests/bug-3166-graphify-inline-build.test.cjs` (4 structural assertions that parse `commands/gsd/graphify.md` YAML frontmatter and body to fence against re-introducing `Task` to `allowed-tools` or `Task(` invocation syntax). (#3166)
- **`gsd-pristine/` is now populated by the installer when local patches are detected** — `saveLocalPatches` declared a `pristineDir` variable and JSDoc'd "saves pristine copies (from manifest) to gsd-pristine/ to enable three-way merge during reapply-patches", but no code ever wrote to that directory. Effect: the `/gsd-reapply-patches` Step 5 verifier (#2972) silently degraded to its over-broad fallback heuristic ("every significant backup line"), exactly the silent-success-on-lost-content failure mode #2969 was designed to prevent. Fix: new `populatePristineDir({ packageSrc, pristineDir, modified, runtime, pathPrefix, isGlobal })` helper runs the install transform pipeline (`copyWithPathReplacement`) into a tmp staging dir, then copies out only the modified-file paths into `gsd-pristine/`. `saveLocalPatches` now accepts a `pristineCtx` and calls the helper when local patches are detected; the install entry point passes the package source root, runtime, pathPrefix, and isGlobal so transforms produce byte-identical output to what `copyWithPathReplacement` would have written under normal install. Soft-fails on transform errors (logs a warning, continues with empty pristine — no worse than pre-fix behavior). Pristine reflects the about-to-install version's content, which is what the verifier needs as the "what would survive without the user's modifications" baseline. Regression covered by `tests/bug-2998-pristine-dir-populated.test.cjs` (6 tests across two suites): asserts the helper is exported, returns 0 for empty modified list, writes one pristine file per source-existing path, skips ghost paths without corrupting pristine, and produces deterministic output (two runs with same inputs yield byte-identical pristine — the property `pristine_hashes` in `backup-meta.json` depends on). (#2998)
- **`release-sdk` hotfix re-run no longer fails at `Dry-run publish validation` when the version is already on npm** — the `Detect prior publish (reconciliation mode)` step sets `skip_publish=true` when the package version is already on the registry, and the actual publish step honors that gate. The `Dry-run publish validation` step was missing the same guard, so any operator re-run of an already-published hotfix (the typical recovery path when later steps fail mid-flight) hit `npm publish --dry-run` first and got `npm error You cannot publish over the previously published versions: X.Y.Z` — `npm publish --dry-run` contacts the registry and rejects existing-version targets even though it doesn't actually publish. The dry-run validation step is now gated on the same `steps.prior_publish.outputs.skip_publish != 'true'` condition as the publish step. The rehearsal still runs on first publishes (where it has value); it skips only in the specific reconciliation case where the publish itself would be skipped. Trigger run: [25233855236](https://github.com/gsd-build/get-shit-done/actions/runs/25233855236/job/73995605643). Regression covered by `tests/bug-2987-dry-run-validation-skip-on-reconciliation.test.cjs`. (#2987)
- **`release-sdk` hotfix flow hardened against silent classifier failures, missing-classifier-at-base-tag, and a vestigial merge-back PR step** — three issues surfaced by CodeRabbit's post-merge review of #2981 plus a production failure on the v1.39.1 release run. **(1)** `scripts/diff-touches-shipped-paths.cjs` reused exit code `1` for both the legitimate "no shipped paths" classifier result and Node's default uncaught-throw exit, so any tooling failure was indistinguishable from a normal skip. The script now uses `0` (shipped), `1` (not shipped), `2` (classifier error) with `try`/`catch` + `uncaughtException`/`unhandledRejection` handlers routing all failure paths to exit `2`. **(2)** The workflow's `git checkout -b "$BRANCH" "$BASE_TAG"` overwrote the working tree with the base tag's contents *before* the cherry-pick loop ran the classifier — but base tags predating the classifier's introduction (notably v1.39.0) don't have the file in their tree, so `node scripts/diff-touches-shipped-paths.cjs` would exit non-zero and silently drop every commit, producing an empty hotfix release. The classifier is now staged into `$RUNNER_TEMP` at the top of `Prepare hotfix branch` (before any working-tree-mutating git command), and the loop references that staged copy. The cherry-pick loop snapshots `$PIPESTATUS` into a local array (`PIPE_RC=("${PIPESTATUS[@]}")`) immediately after the classifier pipeline — under bracketed `set +e`/`set -e` — and dispatches via explicit `case`: `0` proceeds, `1` skips into `NON_SHIPPED_SKIPPED`, anything else emits `::error::shipped-paths classifier failed for $SHA (exit N)` and fails the workflow. CodeRabbit on PR #2984 caught a subtler bug in the first iteration: `pipeline \|\| true; RC=${PIPESTATUS[1]}` is broken because `\|\| true` runs `true` as its own one-command pipeline on the failure paths, overwriting `PIPESTATUS` to `(0)` and leaving `${PIPESTATUS[1]}` unset. The array-snapshot form is invariant against this. The same hardening also surfaces `git diff-tree`'s exit code (via `PIPE_RC[0]`); a non-zero diff-tree result now also fails the workflow rather than feeding partial input to the classifier. **(3)** Removed the `Open merge-back PR (hotfix only)` step. The auto-cherry-pick hotfix flow only picks commits already on main (`git cherry HEAD origin/main` outputs the unmerged ones), so by construction every code commit on the hotfix branch is already on main. The only hotfix-branch-only commit is the version-bump chore, which would either no-op against main or rewind main's in-progress version. The step also failed in production with `GitHub Actions is not permitted to create or approve pull requests (createPullRequest)` (org policy) on run [25232968975](https://github.com/gsd-build/get-shit-done/actions/runs/25232968975). The `pull-requests: write` permission previously granted to the release job has been dropped in line with least-privilege. The run-summary line that previously echoed `Merge-back PR opened against main` has been replaced with `No merge-back PR (auto-picked commits are already on main)` so operators reading the summary see an accurate non-action statement (CodeRabbit on PR #2984). Regression covered by `tests/bug-2983-classifier-exit-codes-and-base-tag-staging.test.cjs` (15 assertions across exit-code semantics, classifier staging, error dispatch, PIPESTATUS-snapshot hardening, diff-tree fail-fast, merge-back removal, and run-summary accuracy). (#2983)
- **`release-sdk` hotfix only cherry-picks commits that change what actually ships** — the `fix:`/`chore:` filter in `Prepare hotfix branch` was too broad: it picked any commit with that conventional-commit type regardless of whether the diff could affect the published npm package. CI-only fixes (release-sdk.yml itself, hotfix tooling, test-only commits) were getting cherry-picked into hotfix branches even though they cannot change the tarball — and the subset touching `.github/workflows/*` then caused the prepare job's `git push` to be rejected by GitHub because the default `GITHUB_TOKEN` lacks the `workflow` scope, aborting the run. v1.39.1 hit this on PR #2977 (run [25232010071](https://github.com/gsd-build/get-shit-done/actions/runs/25232010071)). The loop now pre-skips any candidate commit whose `git diff-tree` output doesn't intersect the npm tarball's shipped paths (entries in `package.json` `files`, plus `package.json` itself, which `npm pack` always includes). Skipped commits land in a new `NON_SHIPPED_SKIPPED` summary bucket framed as informational — non-shipping commits cannot affect the package, so the skip needs no operator action. The shipped-paths classifier lives in `scripts/diff-touches-shipped-paths.cjs` so its rules (file-OR-directory prefix matching `npm pack` semantics, the always-shipped rule for `package.json`, the lockfile-not-shipped rule) are unit-testable. Regression covered by `tests/bug-2980-hotfix-only-picks-shipping-changes.test.cjs`. (#2980)
- **`release-sdk` hotfix workflow fails on real run with `npm error Version not changed`** — the `release` job's `Bump in-tree version (not committed)` step ran `npm version "$VERSION"` without `--allow-same-version`, so it errored on real (non-dry-run) hotfix runs because `prepare` had already committed the bump on the hotfix branch. The release job's checkout `ref` is asymmetric — `BRANCH` (already bumped) on real runs vs `BASE_TAG` (older version) on dry-runs — which is why dry-run never caught the bug. Both `npm version` calls in that step now pass `--allow-same-version`, matching the existing pattern in `release.yml:326`. (#2976)
- **Stale deleted command references updated across workflow files** — `help.md`, `do.md`, `settings.md`, `discuss-phase.md`, `new-project.md`, `plan-phase.md`, `spike.md`, and `sketch.md` referenced command names removed in #2790; updated to new consolidated equivalents. (#2950)
- **`spike --wrap-up` now dispatches correctly** — `/gsd-spike --wrap-up` was silently no-oping because the flag dispatch wiring was omitted when the micro-skill entry point was absorbed in #2790. (#2948)
- **`config-get context_window` returns `200000` when key absent** — querying an unset `context_window` previously exited 1 with "Key not found", surfacing a confusing error in planning logs even though the workflow fallback worked correctly. `cmdConfigGet` now consults a `SCHEMA_DEFAULTS` map and returns the documented default (`200000`, exit 0) for absent schema-defaulted keys; unknown absent keys still error as before. (#2943)
- **`gap-analysis` now parses non-`REQ-` requirement IDs and ignores traceability table headers** — `parseRequirements()` no longer hard-codes the `REQ-` prefix and now accepts uppercase prefixed IDs such as `TST-01`, `BACK-07`, and `INSP-04`; markdown table header rows (for example `| REQ-ID | ... |`) are excluded so header tokens are not reported as phantom uncovered requirements. Added regression coverage for mixed-prefix REQUIREMENTS files with traceability tables. (#2897)
- **Gemini slash commands namespaced as `/gsd:<cmd>` instead of `/gsd-<cmd>`** —
  Gemini CLI namespaces commands under `gsd:`, so `/gsd-plan-phase` was unexecutable.
  Body-text references in commands, agents, banners, and patch-reapply hints are now
  converted via a roster-checked regex (boundary lookbehind + extension-aware
  lookahead + roster lookup, defense-in-depth). The roster fail-loud guard prevents
  silent no-op'ing if `commands/gsd/` is ever missing. (#2768, #2783)
- **`SKILL.md` description quoted for Copilot / Antigravity / Trae / CodeBuddy** —
  descriptions starting with a YAML 1.2 flow indicator (`[BETA]`, `{`, `*`, `&`, `!`,
  `|`, `>`, `%`, `@`, backtick) crashed gh-copilot's strict YAML loader. Six emission
  sites now wrap descriptions in `yamlQuote(...)` (= `JSON.stringify`, a valid YAML
  1.2 double-quoted scalar). (#2876)
- **`gsd-tools` invocations use the absolute installed path** — bare `gsd-tools …`
  calls inside skill bodies relied on PATH resolution that is not guaranteed in every
  runtime; replaced with the absolute path emitted at install time. (#2851)
- **Codex installer preserves trailing newline when stripping legacy hooks** — the
  legacy-hook strip in the Codex installer ran against files with no terminating
  newline at EOF and emitted a config that lost the newline, breaking downstream
  parsers. (#2866)
- **GSD slash command namespace drift cleaned up across docs, workflows, and autocomplete** — remaining active `/gsd:<cmd>` references now use canonical `/gsd-<cmd>`, escaped workflow `Skill(skill=\"gsd:...\")` prompts now use hyphenated skill names, `scripts/fix-slash-commands.cjs` rewrites retired colon syntax to hyphen syntax, and the extract-learnings command file now uses `extract-learnings.md` so generated Claude/Qwen skill autocomplete exposes `gsd-extract-learnings` instead of `gsd-extract_learnings`. (#2855)
- **`extractCurrentMilestone` no longer truncates ROADMAP.md at heading-like lines inside fenced code blocks** — the milestone-end search now scans line-by-line while tracking ` ``` ` / `~~~` fence state, so a line like `# Ops runbook (v1.0 compat)` inside a code block no longer acts as a milestone boundary. Previously, any phase defined after such a block was invisible to `roadmap analyze`, `roadmap get-phase`, `/gsd-autonomous`, and all phase-number commands. (#2787)
- **Codex install no longer corrupts existing `~/.codex/config.toml`** — the installer
  now defensively strips legacy `[agents]` (single-bracket) and `[[agents]]` (sequence)
  blocks regardless of GSD marker presence (both invalid in current Codex schema), emits
  the GSD-managed hook in the user's preferred shape (`[[hooks.<Event>]]` namespaced AoT
  if any user hook uses it, otherwise top-level `[[hooks]]`), migrates legacy
  `[hooks.<Event>]` to namespaced AoT, and atomically writes via temp-file +
  `renameSync`. A strict TOML parser validates the post-write bytes against the Codex
  schema and rejects duplicate keys, repeated table headers, trailing bytes after
  values, and unsupported value types. Both pre-write helper failures and write-time
  failures restore the pre-install snapshot and abort with a clear error rather than
  warn-and-continue. (#2760)
- **Codex hooks migrator correctness hardening** — four edge-cases in the
  `[[hooks.<Event>]]` → `[[hooks.<Event>.hooks]]` migration path fixed: (1) the TOML
  key parser in hook-body classification now uses `parseTomlKey()` instead of a bare
  regex, so hyphenated keys (e.g. `status-message`) and quoted keys are no longer
  silently dropped; (2) `buildNestedBlock` no longer synthesises an empty
  `[[hooks.TYPE.hooks]]` sub-table for matcher-only sections that carry no handler
  fields — previously produced a broken entry with `type = "command"` but no
  `command`; (3) the `legacyMapSections` filter now uses the parsed segment count
  instead of dot-splitting the path string, preventing three-segment tables such as
  `[hooks.SessionStart.hooks]` from being misclassified as event entries (same class
  of bug fixed for `staleNamespacedAotSections` in the previous round); (4) regression
  test added: `[[hooks."before.tool"]]` (a quoted key containing a dot) is correctly
  treated as a two-segment namespace and not split on the inner dot. (#2809)
- **Codex `[[agents]]` reverted to `[agents.<name>]` struct format** — the sequence
  format introduced in #2645 is rejected by codex-cli 0.124.0 with "invalid type:
  sequence, expected struct AgentsToml". Reverted to struct format which is correct for
  0.120.0+. The self-healing stripper handles both formats for configs written by prior
  GSD versions. (#2727)
- **Codex legacy `[hooks]` map format auto-migrated** — Codex 0.124.0 requires
  `[[hooks]]` array-of-tables; old GSD installs that wrote `[hooks.shell]` map-style
  now self-heal on the next `gsd install --codex`. (#2637)
- **`gsd-sdk` PATH verification tightened** — installer now probes for an executable
  `gsd-sdk` shim on PATH after confirming `sdk/dist/cli.js` is present, and attempts
  to materialize one via symlink at `~/.local/bin/gsd-sdk` when absent. Only prints
  `✓ GSD SDK ready` when the probe succeeds. (#2775, #2777)
- **USER-PROFILE.md no longer triggers false "locally modified" warning** — the file
  was both preserved across reinstalls and tracked in `gsd-file-manifest.json`, causing
  the stale-hash diff to fire on every profile refresh. `USER_OWNED_ARTIFACTS` is now a
  single source of truth used by both the preserve and manifest write paths. (#2771)
- **All `gsd-sdk query` handlers now respect `--ws`** — 18+ handlers accepted
  `_workstream` but never forwarded it to `planningPaths`/`loadConfig`. Workstream now
  scopes path resolution correctly in `initNewProject`, `configGet`, `configSet`,
  `commit`, `validateHealth`, and all other handlers. (#2731)
- **`resolveModel` threads workstream** — config-query `resolveModel` ignored
  `_workstream` unlike `configGet`/`configPath`, so different workstreams with different
  `model_profile` settings would get the root profile instead of their own. (#2742)
- **`parseMustHavesBlock` quoted strings** — fully-quoted truths containing `:` (e.g.
  `"App-side UUIDv4: generated locally"`) fell into the kv-parse branch, the regex
  failed, and `current` stayed as `{}`, crashing `annotate-dependencies` with
  `TypeError: t.trim is not a function`. Fixed in both `frontmatter.cjs` and
  `roadmap.cjs`. (#2757, #2734)
- **`gsd state complete-phase` subcommand** — was missing; unknown subcommands fell
  through to `cmdStateLoad`. Now updates `Status`, `Last Activity`, and
  `Current Position` to `COMPLETE`. (#2735)
- **Non-string `depends_on` values preserved** — numeric YAML scalars and kv-shaped
  truths were silently dropped by `annotate-dependencies` via an early `typeof t !==
  'string'` skip. A `coerceTruthToString` helper now coerces numbers/booleans and
  extracts a string field from object-shaped items. (#2770)
- **Worktree isolation scoped to submodule-touching plans** — the previous guard
  unconditionally set `USE_WORKTREES=false` when `.gitmodules` existed. Now parses
  submodule paths and intersects per-plan `files_modified`; only plans that touch a
  submodule path skip worktree isolation. (#2772)
- **Worktree cleanup uses inclusion filter** — the exclusion-based cleanup
  (`grep -v "$(pwd)$"`) failed in multi-workspace and cross-drive Windows setups,
  destroying the workspace's `.git` pointer. Cleanup now targets only
  `.claude/worktrees/agent-*` paths, which agent-spawned worktrees always use. (#2774)
- **`Requirements:` header variants all parse correctly** — both `**Requirements:**`
  (colon inside bold) and `**Requirements**:` (colon outside bold) now match in
  `extractReqIds` and the `phase complete` traceability sweep. (#2769)
- **`gsd-sdk query commit` paths passed via `--files`** — 81 invocations across 50
  files were passing paths positionally, which appended them to the commit subject and
  triggered the wholesale-stage fallback. All sites updated. (#2767)
- **Phase detection in bullet/bold ROADMAP formats** — `phaseAdd`'s regex only matched
  heading format (`## Phase N:`), missing bullet checklist and bold entries. Broadened
  to all three formats with filesystem fallback on zero matches. (#2726)
- **Plan-line overwrite when `**Plans:**` is empty** — `\s*` after `**Plans:**`
  matched newlines, causing `[^\n]+` to consume the first plan checkbox. Replaced with
  `[ \t]*` (horizontal whitespace only) and added section-boundary lookahead. (#2728)
- **Phase-lifecycle `<details>`-wrapped active milestone** — `replaceInCurrentMilestone`
  silently dropped replacements when the active milestone was itself inside a `<details>`
  block (the after-slice was empty). Falls back to locating the last complete
  `<details>…</details>` span. (#2641)
- **Phase-lifecycle project-code-prefixed directory names** — filesystem fallback regex
  `/^(\d+)-/` missed directories like `CK-45-foundation`. Updated to
  `/^(?:[A-Z][A-Z0-9]*-)?(\d+)-/i`.
- **`roadmap.update-plan-progress` regex** — `\s*` crossing newlines shared the same
  corruption vector as `planCountPattern`; replaced with `[ \t]*` plus section-boundary
  lookahead.
- **`replaceInCurrentMilestone` fast-path guard** — the `after.trim().length > 0`
  check incorrectly triggered when `after` contained only footer text, returning
  unchanged content instead of falling through to the slow path.
- **`graphify` CLI updated to subcommand form** — `graphify . --update` was removed in
  v0.4.x in favour of `graphify update .`. Version detection now tries
  `graphify --version` before falling back to the Python importlib query. (#2732)
- **LM Studio model identity validated in review workflow** — captures the full API
  response and compares the top-level `.model` field against `LM_STUDIO_MODEL`, emitting
  a warning when the served model differs. Empty-content responses no longer write error
  text into the review temp file (same fix applied to llama.cpp). (#2721)
- **SDK `globalDefaults` preserved for nested config keys** — `workflow`, `git`,
  `hooks`, `agent_skills`, and `features` sections were missing the `globalDefaults`
  spread at the correct precedence level, silently dropping user values from
  `~/.gsd/defaults.json`. (#2673)
- **`MODEL_ALIAS_MAP` updated to `claude-opus-4-7`** — both `MODEL_ALIAS_MAP` and
  `RUNTIME_PROFILE_MAP.claude.opus` were pinned to `claude-opus-4-6`. (#2733)
- **Orchestrators wait for subagents before continuing** — 26 GSD workflow files now
  include an explicit `ORCHESTRATOR RULE` blockquote immediately after every `Task()`
  spawn, preventing the Codex parallel-work anti-pattern where the parent continues
  reading files and producing conflicting output. (#2729)
- **`audit-uat` parser reads `human_verification:` from frontmatter array** — the
  previous body-only regex was too strict and missed valid UAT items declared in YAML
  frontmatter, surfacing false-positive open gaps at every `/gsd-complete-milestone`
  audit. (#2788)
- **`gsd-sdk` binary collision with `@gsd-build/sdk` resolved** — workstream-aware
  query registry now respects `GSD_WORKSTREAM` env var; `gsd-tools` bin alias added so
  the two SDK packages no longer fight over the `gsd-sdk` name in `node_modules/.bin`.
  (#2791)
- **OpenCode generated agents embed `model_profile_overrides.opencode.<tier>`** —
  per-tier model overrides set via `/gsd-settings-advanced` are now propagated into the
  generated agent files instead of being silently ignored. (#2794)
- **`roadmap update-plan-progress` accepts `--phase` flag form** — SDK arg-parsing
  regression in v0.1.0 silently dropped `--phase`/`--name`/`--plans` flags, causing
  `state.begin-phase` and `roadmap update-plan-progress` to corrupt STATE.md. (#2796)
- **`context_window` added to `VALID_CONFIG_KEYS` allowlist** — `/gsd-settings-advanced`
  could not set `context_window` because the key was missing from the allowlist used by
  `config-set` validation. (#2798)
- **`gsd-tools init` dispatches `ingest-docs` handler** — `/gsd-ingest-docs` was broken
  in v1.38.5 because the workflow called `gsd-sdk` (now `gsd-tools`) but no
  `ingest-docs` init handler was registered. (#2801)
- **`config-get` honors `--default <value>` flag** — fallback for missing keys was
  ported from the CJS implementation (#1893) into the SDK. (#2803)
- **`find-phase` returns `null` for archived phases** — when the current-milestone
  phase had no directory yet, `init.plan-phase` / `init.execute-phase` returned the
  archived prior-milestone directory instead of `null`, causing wrong-phase work. (#2805)
- **SKILL.md frontmatter `name:` migrated to hyphen form** — files that still used the
  deprecated colon form (`gsd:cmd`) caused autocomplete to suggest `/gsd:command`.
  Frontmatter now uses canonical `gsd-cmd` hyphen names. (#2808)
- **`gsd-sdk` resolvable in local-mode installs** — the previous `isLocal` short-circuit
  in `installSdkIfNeeded()` returned before the PATH probe + self-link path could run
  (the same path that fixed npx-cache global installs in #2775). When `sdk/dist/cli.js`
  is present, local installs now run the same probe-and-link flow as global installs.
  (#2829)
- **OpenCode `@file` references use absolute paths on all platforms** — OpenCode does
  not shell-expand `$HOME` in `@file` references on any platform, but the Windows-only
  guard from #2376 left macOS/Linux producing literal `@$HOME/...` strings that resolved
  to `command/$HOME/...` (file not found). Guard now applies to OpenCode unconditionally.
  (#2831)
- **`gsd-sdk auto` detects Codex runtime correctly** — `auto` mode ignored
  `runtime: codex` and routed through `@anthropic-ai/claude-agent-sdk`, producing the
  `[FAILED] $0.00 0.1s` symptom on autonomous runs. New `runtime-gate` raises a clear
  error for non-Claude runtimes; `resolveModel()` is now runtime-aware (honours
  `GSD_RUNTIME` env precedence) and never injects a Claude profile id under non-Claude
  runtimes. (#2832)
- **CR-INTEGRATION tests aligned with hyphen-form skill names** — tests previously
  asserted `gsd:code-review` (colon) against `autonomous.md` which now uses the canonical
  hyphen form. Tests now parse `Skill(skill="...")` invocations structurally and reject
  the legacy colon form. (#2835)
- **`audit-open` quick-task scanner accepts `${quick_id}-SUMMARY.md`** — the previous
  bare-`SUMMARY.md` filename check produced false-positive `status: missing` for every
  documented quick task. UAT terminal-status enum also adds `resolved` (matches
  `execute-phase.md`'s post-gap-closure terminal); `help.md` one-liner reconciled with
  the canonical `quick.md` workflow. (#2836)
- **`quick.md` / `execute-phase.md` SUMMARY rescue handles gitignored `.planning/`** —
  rescue blocks used `git ls-files --exclude-standard` which honoured `.gitignore`,
  silently no-op'ing when `.planning/` was excluded; the worktree was then deleted with
  the SUMMARY. Replaced with filesystem-level `find` + idempotent `cp` that bypasses git
  entirely. (#2838)
- **`/gsd-code-review-fix` cleanup tail is transactional** — JSON recovery sentinel at
  `${phase_dir}/.review-fix-recovery-pending.json` is written after `git worktree add`
  succeeds and removed only after `git worktree remove` returns. A new run that finds a
  pre-existing sentinel force-removes the orphan worktree before starting fresh, making
  the agent self-healing across crashes. (#2839)

- **`config-set resolve_model_ids` no longer rejected** — `resolve_model_ids` was
  documented in CONFIGURATION.md and read by model-resolution paths, but missing from
  the CJS/SDK `VALID_CONFIG_KEYS` allowlists. Added to both. (#3162)
- **`config-set workflow._auto_chain_active` no longer emits spurious errors** — this
  internal runtime-state key is written by `plan-phase`, `execute-phase`,
  `discuss-phase`, `transition`, and `new-project` workflows via `config-set`, but was
  excluded from the public allowlist after #2530. A new `RUNTIME_STATE_KEYS` set lets
  `isValidConfigKey()` accept it without exposing it as a user-settable option. (#3162)


## [1.39.1] - 2026-05-01

Hotfix release. Cherry-picks user-facing fixes from `main` onto the v1.39.0 stable
line. Install: `npm install -g get-shit-done-cc@latest` (or `@1.39.1` to pin).

### Fixed

- **`gsd-sdk query agent-skills` emits raw `<agent_skills>` block instead of JSON-wrapped string** — workflows that embed via `$(gsd-sdk query agent-skills <agent>)` were receiving a JSON-quoted string literal mid-prompt (e.g. `"<agent_skills>\n…"`), silently breaking all `<agent_skills>` injection into spawned subagents. The CLI dispatcher now honors an opt-in `format: 'text'` field on `QueryResult` and writes such results raw via `process.stdout.write`; `--pick` always returns JSON regardless. (#2917)
- **`sketch --wrap-up` now dispatches correctly** — `/gsd-sketch --wrap-up` was silently no-oping because the flag dispatch wiring was omitted when the micro-skill entry point was absorbed in #2790. (#2949)
- **`help.md` no longer advertises eight slash commands removed by the #2824 consolidation** — `/gsd-do`, `/gsd-note`, `/gsd-check-todos`, `/gsd-plant-seed`, `/gsd-research-phase`, `/gsd-list-phase-assumptions`, `/gsd-plan-milestone-gaps`, and `/gsd-join-discord` were removed when 86 skills were folded into 59. `help.md` was not updated alongside, so users typing the documented commands hit *Unknown command*. Each entry is now either rewritten to the surviving flag-based dispatcher (e.g., `/gsd-do …` → `/gsd-progress --do "…"`, `/gsd-note` → `/gsd-capture --note`, `/gsd-plant-seed` → `/gsd-capture --seed`, `/gsd-check-todos` → `/gsd-capture --list`) or removed for skills with no replacement. A regression test now asserts every `/gsd-*` reference in `help.md` has a matching `commands/gsd/*.md` stub. (#2954)
- **`--sdk` install on Windows now writes a callable `gsd-sdk` shim** — `npx get-shit-done-cc@latest --claude --global --sdk` on Windows previously left `gsd-sdk` off PATH because `trySelfLinkGsdSdk` returned `null` unconditionally on `win32` (a missed gap from #2775's POSIX self-link, not an intentional deferral). The function now dispatches to a Windows counterpart that writes the standard npm shim triple (`gsd-sdk.cmd`, `gsd-sdk.ps1`, and a Bash wrapper) to npm's global bin, so `gsd-sdk` resolves in a fresh shell across cmd.exe, PowerShell, and Cygwin/MSYS/Git-Bash. A new regression guard in `tests/no-unconditional-win32-skip.test.cjs` blocks any future `if (process.platform === 'win32') return null;` skip-only branches in `bin/install.js`. (#2962)
- **`/gsd-reapply-patches` Step 5 gate is now deterministic — no more silent content drops** — the prior gate parsed a Claude-generated *Hunk Verification Table* whose `verified: yes` rows were filled in without actually checking content presence, leading to merged files that lost user-added blocks (e.g., a `<visual_companion>` section, an `--execute-only` flag block) while the workflow reported success. The gate now invokes a Node script (`scripts/verify-reapply-patches.cjs`, now at `get-shit-done/bin/verify-reapply-patches.cjs` per issue #2994) that diffs each backup against the pristine baseline, computes the user-added significant lines, and asserts each one is present in the merged file. Exits non-zero with a per-file diagnostic on any miss; the workflow halts and surfaces the JSON output to the user. The verifier ignores low-signal lines (too short, pure whitespace, decorative comments) so trivial differences don't trigger false failures. Out of scope here: the manifest-baseline tightening described in #2969 Failure 1 — that's separate work. (#2969)

## [1.38.5] - 2026-04-25

### Fixed
- SDK executor agents now write SUMMARY.md to `.planning/phases/{phase}/` instead of the project root — `phaseDir` is threaded from PhaseRunner through to the executor prompt's completion instructions

## [1.38.4] - 2026-04-25

### Fixed
- **SDK uses full installed agent/workflow prompts** — The SDK was bundling stripped-down copies of agent definitions (~17% of the real content), missing critical instructions like plan file naming conventions, scope reduction rules, and discovery protocols. The SDK now loads the complete installed agents at runtime and resolves `@`-file references instead of stripping them.
- **SDK executor receives actual plan content** — `executeSinglePlan` was passing `null` to the prompt builder instead of the parsed plan file. The executor now loads, parses, and passes the full plan (tasks, objectives, verification criteria) to the prompt.
- **SDK verification checks VERIFICATION.md, not just session exit code** — A verify session that wrote `status: gaps_found` to VERIFICATION.md was treated as "passed" because the session itself didn't crash. The gap-closure retry loop now reads the actual verification status from disk.
- **SDK plan ID derivation for bare PLAN.md files** — Plans named `PLAN.md` (instead of `01-01-PLAN.md`) produced an empty-string ID, causing downstream execution issues.
- **SDK headless discuss mode prevents interactive tool calls** — The self-discuss step loaded the full interactive workflow prompt, causing the agent to invoke `AskUserQuestion` and `Skill()` in headless mode. A mandatory headless override is now prepended to prevent interactive tool usage.

### Removed
- Deleted 13 bundled SDK prompt files (`sdk/prompts/agents/`, `sdk/prompts/workflows/`) that were maintained as stripped-down copies and had drifted from the real agents.

### Enhancement: richer architecture docs from `/gsd-map-codebase` (#2500)

`/gsd-map-codebase` (arch focus) now produces a `.planning/codebase/ARCHITECTURE.md` with the same richness as the research version created at project creation:

- **ASCII system overview diagram** — component boxes and request-flow arrows, generated from actual codebase analysis
- **Component responsibility table** — Component / Responsibility / File columns for at-a-glance orientation
- **Data flow traces** — Primary request path and secondary flows with numbered steps and code references (`file:line`)
- **Architectural constraints** — Threading model, global state inventory, circular import chains
- **Anti-patterns** — Codebase-specific patterns to avoid, with the correct alternative
- **`<!-- refreshed: {date} -->`** marker at the top so users can see when the doc was last generated

Running `/gsd-map-codebase` or `/gsd-scan --focus arch` after a major refactor now produces an up-to-date architectural reference that includes the visual diagrams previously only available in the (non-refreshable) research version.

### SDK query layer — Phase 3 (what you get)

If you use GSD **as a workflow**—milestones, phases, `.planning/` artifacts, bundled workflows, and `**/gsd:`** commands—Phase 3 is about **behavior matching what the docs and steps promise**, and **a bit less overhead** when the framework advances a phase or bootstraps a new project for you.

- **Your workflow shouldn’t silently drift from the docs** — The actions that touch **STATE**, **ROADMAP**, git commits, config, and init/bootstrap are **continuously compared** to the legacy `gsd-tools.cjs` behavior in automated tests. The point for you: fewer “the workflow said X but the tooling did Y” moments as GSD ships updates (#2302).
- **Snappier phase and new-project flows (typical path)** — When you’re **not** on a workstream override, the frequent “where is this phase?”, “what’s left to run?”, “mark phase complete”, and similar steps **avoid spawning a whole extra Node process every time**. Same outcomes you expect from the workflow; it should just feel **lighter** when things run headless or in tight loops (#2302).
- **You can see what to run next** — Documentation now states clearly **when to use `gsd-sdk query`** and **when a step still needs the legacy script** (only a few tools). The legacy script is **marked deprecated** in source but **not removed**—existing hooks and scripts keep working while you align with current examples (#2302).

### Added

- **`gsd-sdk query check auto-mode`** — Decision-routing audit Tier 2: one JSON blob for `workflow.auto_advance` + `workflow._auto_chain_active` with `active`, `source`, and per-flag fields; workflows use `--pick active` or `--pick auto_chain_active` instead of paired `config-get` calls (#2302).
- **SDK Phase 3 — parity and regression guardrails** — Behind the scenes, exhaustive tests ensure the **workflow-facing query commands** stay aligned with the legacy CLI (including write paths and multi-step init). *Contributors:* policy coverage, read-only JSON parity, mutation sandboxes, `init.*` composition tests; `verifyGoldenPolicyComplete()`, `read-only-golden-rows` (#2302).

### Changed

- **SDK Phase 3 — runner hot path uses the registry directly** — When you run **phase lifecycle** or **new-project init** through the SDK, the common STATE/roadmap/plan-index/complete/commit/config calls **skip extra subprocess overhead** on the default path (workstreams and test overrides unchanged). *Contributors:* `GSDTools` → `initPhaseOp`, `phasePlanIndex`, `phaseComplete`, `initNewProject`, `configSet`, `commit` (#2302).
- **Docs — `docs/CLI-TOOLS.md`** — New **SDK and programmatic access** section (registry-first guidance, CJS→`gsd-sdk query` examples, `GSDTools`/workstream behavior, `state load` vs registry state handlers, CLI-only commands); **See also** links to `QUERY-HANDLERS.md`, Architecture, and COMMANDS (#2302).
- **Docs — `docs/USER-GUIDE.md`** — Programmatic CLI subsection: corrected CLI-only vs registry commands; anchor link to CLI-TOOLS SDK section; `state load` caveat cross-reference (#2302).
- **CJS deprecation** — `get-shit-done/bin/gsd-tools.cjs` documents `@deprecated` in favor of `gsd-sdk query` and `@gsd-build/sdk` (#2302).

### Fixed

- **End-of-phase routing suggestions now use `/gsd-<cmd>` (not the retired `/gsd:<cmd>`)** — All user-visible command suggestions in workflows (`execute-phase.md`, `transition.md`), tool output (`profile-output.cjs`, `init.cjs`), references, and templates have been updated from `/gsd:<cmd>` to `/gsd-<cmd>`, matching the Claude Code skill directory name and the user-typed slash-command format. Internal `Skill(skill="gsd:<cmd>")` calls (no leading slash) are preserved unchanged — those resolve by frontmatter `name:` not directory name. The namespace test (`bug-2543-gsd-slash-namespace.test.cjs`) has been updated to enforce the current invariant. Closes #2697.

- **`gsd-sdk query` now resolves parent `.planning/` root in multi-repo (`sub_repos`) workspaces** — when invoked from inside a `sub_repos`-listed child repo (e.g. `workspace/app/`), the SDK now walks up to the parent workspace that owns `.planning/`, matching the legacy `gsd-tools.cjs` `findProjectRoot` behavior. Previously `gsd-sdk query init.new-milestone` reported `project_exists: false` from the sub-repo, while `gsd-tools.cjs` resolved the parent root correctly. Resolution happens once in `cli.ts` before dispatch; if `projectDir` already owns `.planning/` (including explicit `--project-dir`), the walk is a no-op. Ported as `findProjectRoot` in `sdk/src/query/helpers.ts` with the same detection order (own `.planning/` wins, then parent `sub_repos` match, then legacy `multiRepo: true`, then `.git` heuristic), capped at 10 parent levels and never crossing `$HOME`. Closes #2623.
- **Shell hooks falsely flagged as stale on every session** — `gsd-phase-boundary.sh`, `gsd-session-state.sh`, and `gsd-validate-commit.sh` now ship with a `# gsd-hook-version: {{GSD_VERSION}}` header; the installer substitutes `{{GSD_VERSION}}` in `.sh` hooks the same way it does for `.js` hooks; and the stale-hook detector in `gsd-check-update.js` now matches bash `#` comment syntax in addition to JS `//` syntax. All three changes are required together — neither the regex fix alone nor the install fix alone is sufficient to resolve the false positive (#2136, #2206, #2209, #2210, #2212)

## [1.38.2] - 2026-04-19

### Fixed
- **SDK decoupled from build-from-source install** — replaces the fragile `tsc` + `npm install -g ./sdk` dance on user machines with a prebuilt `sdk/dist/` shipped inside the parent `get-shit-done-cc` tarball. The `gsd-sdk` CLI is now a `bin/gsd-sdk.js` shim in the parent package that resolves `sdk/dist/cli.js` and invokes it via `node`, so npm chmods the bin entry from the tarball (not from a secondary local install) and PATH/exec-bit issues cannot occur. Repurposes `installSdkIfNeeded()` in `bin/install.js` to only verify `sdk/dist/cli.js` exists and fix its execute bit (non-fatal); deletes `resolveGsdSdk()`, `detectShellRc()`, `emitSdkFatal()` and the source-build/global-install logic (162 lines removed). `release.yml` now runs `npm run build:sdk` before publish in both rc and finalize jobs, so every published tarball contains fresh SDK dist. `sdk/package.json` `prepublishOnly` is the final safety net (`rm -rf dist && tsc && chmod +x dist/cli.js`). `install-smoke.yml` adds an `smoke-unpacked` variant that installs from the unpacked dir with the exec bit stripped, so this class of regression cannot ship again. Closes #2441 and #2453.
- **`--sdk` flag semantics changed** — previously forced a rebuild of the SDK from source; now verifies the bundled `sdk/dist/` is resolvable. Users who were invoking `get-shit-done-cc --sdk` as a "force rebuild" no longer need it — the SDK ships prebuilt.

### Added
- **`/gsd-ingest-docs` command** — Scan a repo containing mixed ADRs, PRDs, SPECs, and DOCs and bootstrap or merge the full `.planning/` setup from them in a single pass. Parallel classification (`gsd-doc-classifier`), synthesis with precedence rules and cycle detection (`gsd-doc-synthesizer`), three-bucket conflicts report (`INGEST-CONFLICTS.md`: auto-resolved, competing-variants, unresolved-blockers), and hard-block on LOCKED-vs-LOCKED ADR contradictions in both new and merge modes. Supports directory-convention discovery and `--manifest <file>` YAML override with per-doc precedence. v1 caps at 50 docs per invocation; `--resolve interactive` is reserved. Extracts shared conflict-detection contract into `references/doc-conflict-engine.md` which `/gsd-import` now also consumes (#2387)
- **`/gsd-plan-review-convergence` command** — Cross-AI plan convergence loop that automates `plan-phase → review → replan → re-review` cycles. Spawns isolated agents for `gsd-plan-phase` and `gsd-review`; orchestrator only does loop control, HIGH concern counting, stall detection, and escalation. Supports `--codex`, `--gemini`, `--claude`, `--opencode`, `--all` reviewers and `--max-cycles N` (default 3). Loop exits when no HIGH concerns remain; stall detection warns when count isn't decreasing; escalation gate asks user to proceed or review manually when max cycles reached (#2306)

### Fixed
- **`gsd-read-injection-scanner` hook now ships to users** — the scanner was added in 1.37.0 (#2201) but was never added to `scripts/build-hooks.js`' `HOOKS_TO_COPY` allowlist, so it never landed in `hooks/dist/` and `install.js` skipped it with "Skipped read injection scanner hook — gsd-read-injection-scanner.js not found at target". Effectively disabled the read-time prompt-injection scanner for every user on 1.37.0/1.37.1. Added to the build allowlist and regression test. Also dropped a redundant non-absolute `.claude/hooks/` path check that was bypassing the installer's runtime-path templating and leaking `.claude/` references into non-Claude installs (#2406)
- **SDK `checkAgentsInstalled` is now runtime-aware** — `sdk/src/query/init.ts::checkAgentsInstalled` only knew where Claude Code put agents (`~/.claude/agents`). Users running GSD on Codex, OpenCode, Gemini, Kilo, Copilot, Antigravity, Cursor, Windsurf, Augment, Trae, Qwen, CodeBuddy, or Cline got `agents_installed: false` even with a complete install, which hard-blocked any workflow that gates subagent spawning on that flag. `sdk/src/query/helpers.ts` now resolves the right directory via three-tier detection (`GSD_RUNTIME` env → `config.runtime` → `claude` fallback) and mirrors `bin/install.js::getGlobalDir()` for all 14 runtimes. `GSD_AGENTS_DIR` still short-circuits the chain. `init-runner.ts` stays Claude-only by design (#2402)
- **`init` query agents-installed check looks at the correct directory** — `checkAgentsInstalled` in `sdk/src/query/init.ts` defaulted to `~/.claude/get-shit-done/agents/`, but the installer writes GSD agents to `~/.claude/agents/`. Every init query therefore reported `agents_installed: false` on clean installs, which made workflows refuse to spawn `gsd-executor` and other parallel subagents. The default now matches `sdk/src/init-runner.ts` and the installer (#2400)
- **Installer now installs `@gsd-build/sdk` automatically** so `gsd-sdk` lands on PATH. Resolves `command not found: gsd-sdk` errors that affected every `/gsd-*` command after a fresh install or `/gsd-update` to 1.36+. Adds `--no-sdk` to opt out and `--sdk` to force reinstall. Implements the `--sdk` flag that was previously documented in README but never wired up (#2385)

## [1.37.1] - 2026-04-17

### Fixed
- UI-phase researcher now loads sketch findings skills, preventing re-asking questions already answered during `/gsd-sketch`

## [1.37.0] - 2026-04-17

### Added
- **`/gsd-spike` and `/gsd-sketch` commands** — First-class GSD commands for rapid feasibility spiking and UI design sketching. Each produces throwaway experiments (spikes) or HTML mockups with multi-variant exploration (sketches), saved to `.planning/spikes/` and `.planning/sketches/` with full GSD integration: banners, checkpoint boxes, `gsd-sdk query` commits, and `--quick` flag to skip intake. Neither requires `/gsd-new-project` — auto-creates `.planning/` subdirs on demand
- **`/gsd-spike-wrap-up` and `/gsd-sketch-wrap-up` commands** — Package spike/sketch findings into project-local skills at `./.claude/skills/` with a planning summary at `.planning/`. Curates each spike/sketch one-at-a-time, groups by feature/design area, and adds auto-load routing to project CLAUDE.md
- **Spike/sketch pipeline integration** — `new-project` detects prior spike/sketch work on init, `discuss-phase` loads findings into prior context, `plan-phase` includes findings in planner `<files_to_read>`, `explore` offers spike/sketch as output routes, `next` surfaces pending spike/sketch work as notices, `pause-work` detects active sketch context for handoff, `do` routes spike/sketch intent to new commands
- **`/gsd-spec-phase` command** — Socratic spec refinement with ambiguity scoring to clarify WHAT a phase delivers before discuss-phase. Produces a SPEC.md with falsifiable requirements locked before implementation decisions begin (#2213)
- **`/gsd-progress --forensic` flag** — Appends a 6-check integrity audit after the standard progress report (#2231)
- **`/gsd-discuss-phase --all` flag** — Skip area selection and discuss all gray areas interactively (#2230)
- **Parallel discuss across independent phases** — Multiple phases without dependencies can be discussed concurrently (#2268)
- **`gsd-read-injection-scanner` hook** — PostToolUse hook that scans for prompt injection attempts in read file contents (#2201)
- **SDK Phase 2 caller migration** — Workflows, agents, and commands now use `gsd-sdk query` instead of raw `gsd-tools.cjs` calls (#2179)
- **Project identity in Next Up blocks** — All Next Up blocks include workspace context for multi-project clarity (#1948)
- **Agent size-budget enforcement** — New `tests/agent-size-budget.test.cjs` enforces tiered line-count limits on every `gsd-*.md` agent (XL=1600, LARGE=1000, DEFAULT=500). Unbounded agent growth is paid in context on every subagent dispatch; the test prevents regressions and requires a deliberate PR rationale to raise a budget (pre-migration issue 2361)
- **Shared `references/mandatory-initial-read.md`** — Extracts the `<required_reading>` enforcement block that was duplicated across 5 top agents. Agents now include it via a single `@~/.claude/get-shit-done/references/mandatory-initial-read.md` line, using Claude Code's progressive-disclosure `@file` reference mechanism (pre-migration issue 2361)
- **Shared `references/project-skills-discovery.md`** — Extracts the 5-step project skills discovery checklist that was copy-pasted across 5 top agents with slight divergence. Single source of truth with a per-agent "Application" paragraph documenting how planners, executors, researchers, verifiers, and debuggers each apply the rules (pre-migration issue 2361)

### Changed
- **`gsd-debugger` philosophy extracted to shared reference** — The 76-line `<philosophy>` block containing evergreen debugging disciplines (user-as-reporter framing, meta-debugging, foundation principles, cognitive-bias table, systematic investigation, when-to-restart protocol) is now in `get-shit-done/references/debugger-philosophy.md` and pulled into the agent via a single `@file` include. Same content, lighter per-dispatch context footprint (#2363)
- **`gsd-planner`, `gsd-executor`, `gsd-debugger`, `gsd-verifier`, `gsd-phase-researcher`** — Migrated to `@file` includes for the mandatory-initial-read and project-skills-discovery boilerplate. Reduces per-dispatch context load without changing behavior (pre-migration issue 2361)
- **Consolidated emphasis-marker density in top 4 agent files** — `gsd-planner.md` (23 → 15), `gsd-phase-researcher.md` (14 → 9), `gsd-doc-writer.md` (11 → 6), and `gsd-executor.md` (10 → 7). Removed `CRITICAL:` prefixes from H2/H3 headings and dropped redundant `CRITICAL:` + `MUST` / `ALWAYS:` + `NEVER:` stacking. RFC-2119 `MUST`/`NEVER` verbs inside normative sentences are preserved. Behavior-preserving; no content removed (#2368)

### Fixed
- **Broken `@planner-source-audit.md` relative references in `gsd-planner.md`** — Two locations referenced `@planner-source-audit.md` (resolves relative to working directory, almost always missing) instead of the correct absolute `@~/.claude/get-shit-done/references/planner-source-audit.md`. The planner's source audit discipline was silently unenforced (pre-migration issue 2361)
- **Shell hooks falsely flagged as stale** — `.sh` hooks now ship with version headers; installer stamps them; stale-hook detector matches bash comment syntax (#2136)
- **Worktree cleanup** — Orphaned worktrees pruned in code, not prose; pre-merge deletion guard in quick.md (#2367, #2275)
- **`/gsd-quick` crashes** — gsd-sdk pre-flight check with install hint (#2334); rescue uncommitted SUMMARY.md before worktree removal (#2296)
- **Pattern mapper redundant reads** — Early-stop rule prevents re-reading files (#2312)
- **Context meter scaling** — Respects `CLAUDE_CODE_AUTO_COMPACT_WINDOW` for accurate context bar (#2219)
- **Codex install paths** — Replace all `~/.claude/` paths in Codex `.toml` files (#2320)
- **Graphify edge fallback** — Falls back to `graph.links` when `graph.edges` is absent (#2323)
- **New-project saved defaults** — Display saved defaults before prompting to use them (#2333)
- **UAT parser** — Accept bracketed result values and fix decimal phase renumber padding (#2283)
- **Stats duplicate rows** — Normalize phase numbers in Map to prevent duplicates (#2220)
- **Review prompt shell expansion** — Pipe prompts via stdin (#2222)
- **Intel scope resolution** — Detect .kilo runtime layout (#2351)
- **Read-guard CLAUDECODE env** — Check env var in skip condition (#2344)
- **Add-backlog directory ordering** — Write ROADMAP entry before directory creation (#2286)
- **Settings workstream routing** — Route reads/writes through workstream-aware config path (#2285)
- **Quick normalize flags** — `--discuss --research --validate` combo normalizes to FULL_MODE (#2274)
- **Windows path normalization** — Normalize in update scope detection (#2278)
- **Codex/OpenCode model overrides** — Embed model_overrides in agent files (#2279)
- **Installer custom files** — Restore detect-custom-files and backup_custom_files (#1997)
- **Agent re-read loops** — Add no-re-read critical rules to ui-checker and planner (#2346)

## [1.36.0](https://github.com/gsd-build/get-shit-done/releases/tag/v1.36.0) - 2026-04-14

### SDK query layer — Phases 1 & 2 (what you get)

Day to day, GSD still revolves around **your planning tree** (ROADMAP, STATE, phase folders, config) and **following the workflow** (discuss → plan → execute → verify, milestone closes, etc.). Phases 1 and 2 introduce `**gsd-sdk query`** so those “plumbing” steps have a **supported, first-class CLI**—and so **what workflows and `/gsd:` docs tell you to paste** is closer to what actually runs.

- **Phase 1 — Unblock faster when a step fails (#2118)** — The same kinds of checks and updates your **workflows, hooks, and agents** rely on—reading phase context, roadmap, STATE, init payloads, config, validation—can go through `**gsd-sdk query`**. When something is wrong (bad path, missing file, invalid args), you get **errors you can act on**, not an opaque script dump—so a stuck phase or a bad copy-paste is easier to fix, and **your own** terminal or CI glue beside GSD is easier to keep stable.
- **Phase 2 — Trust the examples in workflows (#2122, #2008)** — The `**gsd-sdk query`** CLI **only runs commands that exist**—no accidental fallback to something else. **Workflow and agent examples** were updated to match. A few **special-case tools** (e.g. **graphify**, **from-gsd2**) still call the legacy binary until they’re brought onto the same path; `**docs/CLI-TOOLS.md`** and `**sdk/src/query/QUERY-HANDLERS.md**` list what’s in scope. Hardening (commits, locks, paths, argument parsing) mostly shows up as **fewer odd failures mid-milestone** when STATE, roadmap, and git steps run.

Technical implementation details for Phase 2 appear in the **Changed** section below.

### Added

- `**/gsd-graphify` integration** — Knowledge graph for planning agents, enabling richer context connections between project artifacts (#2164)
- `**gsd-pattern-mapper` agent** — Codebase pattern analysis agent for identifying recurring patterns and conventions (#1861)
- `**@gsd-build/sdk` — Phase 1 typed query foundation (#2118)** — Introduces `**gsd-sdk query`** and registry-backed handlers; see **SDK query layer — Phases 1 & 2** above for how that fits the workflow.
- **Opt-in TDD pipeline mode** — `tdd_mode` exposed in init JSON with `--tdd` flag override for test-driven development workflows (#2119, #2124)
- **Stale/orphan worktree detection (W017)** — `validate-health` now detects stale and orphan worktrees (#2175)
- **Seed scanning in new-milestone** — Planted seeds are scanned during milestone step 2.5 for automatic surfacing (#2177)
- **Artifact audit gate** — Open artifact auditing for milestone close and phase verify (#2157, #2158, #2160)
- `**/gsd-quick` and `/gsd-thread` subcommands** — Added list/status/resume/close subcommands (#2159)
- **Debug skill dispatch and session manager** — Sub-orchestrator for `/gsd-debug` sessions (#2154)
- **Project skills awareness** — 9 GSD agents now discover and use project-scoped skills (#2152)
- `**/gsd-debug` session management** — TDD gate, reasoning checkpoint, and security hardening (#2146)
- **Context-window-aware prompt thinning** — Automatic prompt size reduction for sub-200K models (#1978)
- **SDK `--ws` flag** — Workstream-aware execution support (#1884)
- `**/gsd-extract-learnings` command** — Phase knowledge capture workflow (#1873)
- **Cross-AI execution hook** — Step 2.5 in execute-phase for external AI integration (#1875)
- **Ship workflow external review hook** — External code review command hook in ship workflow
- **Plan bounce hook** — Optional external refinement step (12.5) in plan-phase workflow
- **Cursor CLI self-detection** — Cursor detection and REVIEWS.md template for `/gsd-review` (#1960)
- **Architectural Responsibility Mapping** — Added to phase-researcher pipeline (#1988, #2103)
- **Configurable `claude_md_path`** — Custom CLAUDE.md path setting (#2010, #2102)
- `**/gsd-skill-manifest` command** — Pre-compute skill discovery for faster session starts (#2101)
- `**--dry-run` mode and resolved blocker pruning** — State management improvements (#1970)
- **State prune command** — Prune unbounded section growth in STATE.md (#1970)
- **Global skills support** — Support `~/.claude/skills/` in `agent_skills` config (#1992)
- **Context exhaustion auto-recording** — Hooks auto-record session state on context exhaustion (#1974)
- **Metrics table pruning** — Auto-prune on phase complete for STATE.md metrics (#2087, #2120)
- **Flow diagram directive for phase researcher** — Data-flow architecture diagrams enforced (#2139, #2147)

### Changed

- **Planner context-cost sizing** — Replaced time-based reasoning with context-cost sizing and multi-source coverage audit (#2091, #2092, #2114)
- `**/gsd-next` prior-phase completeness scan** — Replaced consecutive-call counter with completeness scan (#2097)
- **Inline execution for small plans** — Default to inline execution, skip subagent overhead for small plans (#1979)
- **Prior-phase context optimization** — Limited to 3 most recent phases and includes `Depends on` phases (#1969)
- **Non-technical owner adaptation** — `discuss-phase` adapts gray area language for non-technical owners via USER-PROFILE.md (#2125, #2173)
- **Agent specs standardization** — Standardized `required_reading` patterns across agent specs (#2176)
- **CI upgrades** — GitHub Actions upgraded to Node 22+ runtimes; release pipeline fixes (#2128, #1956)
- **Branch cleanup workflow** — Auto-delete on merge + weekly sweep (#2051)
- **PR #2179 maintainer review (Trek-e)** — Scoped SDK to Phase 2 (#2122): removed `gsd-sdk query` passthrough to `gsd-tools.cjs` and `GSD_TOOLS_PATH` override; argv routing consolidated in `resolveQueryArgv()`. `GSDTools` JSON parsing now reports `@file:` indirection read failures instead of failing opaquely. `execute-plan.md` defers Task Commit Protocol to `agents/gsd-executor.md` (single source of truth). Stale `/gsd:` scan (#1748) skips `.planning/` and root `CLAUDE.md` so local gitignored overlays do not fail CI.
- **SDK query registry (PR #2179 review)** — Register `summary-extract` as an alias of `summary.extract` so workflows/agents match CJS naming. Correct `audit-fix.md` to call `audit-uat` instead of nonexistent `init.audit-uat`.
- `**gsd-tools audit-open`** — Use `core.output()` (was undefined `output()`), and pass the artifact object for `--json` so stdout is JSON (not double-stringified).
- **SDK query layer (PR review hardening)** — `commit-to-subrepo` uses realpath-aware path containment and sanitized commit messages; `state.planned-phase` uses the STATE.md lockfile; `verifyKeyLinks` mitigates ReDoS on frontmatter patterns; frontmatter handlers resolve paths under the real project root; phase directory names reject `..` and separators; `gsd-sdk` restores strict CLI parsing by stripping `--pick` before `parseArgs`; `QueryRegistry.commands()` for enumeration; `todoComplete` uses static error imports.
- `**gsd-sdk query` routing (Phase 2 scope)** — `resolveQueryArgv()` maps argv to registered handlers (longest-prefix match on dotted and spaced command keys; optional single-token dotted split). Unregistered commands are rejected at the CLI; use `node …/gsd-tools.cjs` for CJS-only subcommands. `resolveGsdToolsPath()` probes the SDK-bundled copy, then project and user `~/.claude/get-shit-done/` installs (no `GSD_TOOLS_PATH` override). Broader “CLI parity” passthrough is explicitly out of scope for #2122 and tracked separately for a future approved issue.
- **SDK query follow-up (tests, docs, registry)** — Expanded `QUERY_MUTATION_COMMANDS` for event emission; stale lock cleanup uses PID liveness (`process.kill(pid, 0)`) when a lock file exists; `searchJsonEntries` is depth-bounded (`MAX_JSON_SEARCH_DEPTH`); removed unnecessary `readdirSync`/`Dirent` casts across query handlers; added `sdk/src/query/QUERY-HANDLERS.md` (error vs `{ data.error }`, mutations, locks, intel limits); unit tests for intel, profile, uat, skills, summary, websearch, workstream, registry vs `QUERY_MUTATION_COMMANDS`, and frontmatter extract/splice round-trip.
- **Phase 2 caller migration (#2122)** — Workflows, agents, and commands prefer `gsd-sdk query` for registered handlers; extended migration to additional orchestration call sites (review, plan-phase, execute-plan, ship, extract_learnings, ai-integration-phase, eval-review, next, profile-user, autonomous, thread command) and researcher agents; dual-path and CJS-only exceptions documented in `docs/CLI-TOOLS.md` and `docs/ARCHITECTURE.md`; relaxed `tests/gsd-tools-path-refs.test.cjs` so `commands/gsd/workstreams.md` may document `gsd-sdk query` without `node` + `gsd-tools.cjs`. CJS `gsd-tools.cjs` remains on disk; graphify and other non-registry commands stay on CJS until registered. (#2008)
- **Phase 2 docs and call sites (follow-up)** — `docs/USER-GUIDE.md` now explains `gsd-sdk query` vs legacy CJS and lists CJS-only commands (`state validate`/`sync`, `audit-open`, `graphify`, `from-gsd2`). Updated `commands/gsd` (`debug`, `quick`, `intel`), `agents/gsd-debug-session-manager.md`, and workflows (`milestone-summary`, `forensics`, `next`, `complete-milestone`, `verify-work`, `discuss-phase`, `progress`, `verify-phase`, `add-phase`/`insert-phase`/`remove-phase`, `transition`, `manager`, `quick`) for `gsd-sdk query` or explicit CJS exceptions (`audit-open`).
- **Phase 2 orchestration doc pass (#2122)** — Aligned `commands/gsd` (`execute-phase`, `code-review`, `code-review-fix`, `from-gsd2`, `graphify`) and agents (`gsd-verifier`, `gsd-plan-checker`, `gsd-code-fixer`, `gsd-executor`, `gsd-planner`, researchers, debugger) so examples use `init.*` query names, correct `frontmatter.get` positional field, `state.*` positional args, and `commit` with positional file paths (not `--files`, except `commit-to-subrepo` which keeps `--files`).
- **Phase 2 `commit` example sweep (#2122)** — Normalized `gsd-sdk query commit` usage across `get-shit-done/workflows/**/*.md`, `get-shit-done/references/**/*.md`, and `commands/gsd/**/*.md` so file paths follow the message positionally (SDK `commit` handler); `gsd-sdk query commit-to-subrepo … --files …` unchanged. Updated `get-shit-done/references/git-planning-commit.md` prose; adjusted workflow contract tests (`claude-md`, forensics, milestone-summary, gates taxonomy CRLF-safe `required_reading`, verifier `roadmap.analyze`) for the new examples.

### Fixed

- **Init ignores archived phases** — Archived phases from prior milestones sharing a phase number no longer interfere (#2186)
- **UAT file listing** — Removed `head -5` truncation from verify-work (#2172)
- **Intel status relative time** — Display relative time correctly (#2132)
- **Codex hook install** — Copy hook files to Codex install target (#2153, #2166)
- **Phase add-batch duplicate prevention** — Prevents duplicate phase numbers on parallel invocations (#2165, #2170)
- **Stale hooks warning** — Show contextual warning for dev installs with stale hooks (#2162)
- **Worktree submodule skip** — Skip worktree isolation when `.gitmodules` detected (#2144)
- **Worktree STATE.md backup** — Use `cp` instead of `git-show` (#2143)
- **Bash hooks staleness check** — Add missing bash hooks to `MANAGED_HOOKS` (#2141)
- **Code-review parser fix** — Fix SUMMARY.md parser section-reset for top-level keys (#2142)
- **Backlog phase exclusion** — Exclude 999.x backlog phases from next-phase and all_complete (#2135)
- **Frontmatter regex anchor** — Anchor `extractFrontmatter` regex to file start (#2133)
- **Qwen Code install paths** — Eliminate Claude reference leaks (#2112)
- **Plan bounce default** — Correct `plan_bounce_passes` default from 1 to 2
- **GSD temp directory** — Use dedicated temp subdirectory for GSD temp files (#1975, #2100)
- **Workspace path quoting** — Quote path variables in workspace next-step examples (#2096)
- **Answer validation loop** — Carve out Other+empty exception from retry loop (#2093)
- **Test race condition** — Add `before()` hook to bug-1736 test (#2099)
- **Qwen Code path replacement** — Dedicated path replacement branches and finishInstall labels (#2082)
- **Global skill symlink guard** — Tests and empty-name handling for config (#1992)
- **Context exhaustion hook defects** — Three blocking defects fixed (#1974)
- **State disk scan cache** — Invalidate disk scan cache in writeStateMd (#1967)
- **State frontmatter caching** — Cache buildStateFrontmatter disk scan per process (#1967)
- **Grep anchor and threshold guard** — Correct grep anchor and add threshold=0 guard (#1979)
- **Atomic write coverage** — Extend atomicWriteFileSync to milestone, phase, and frontmatter (#1972)
- **Health check optimization** — Merge four readdirSync passes into one (#1973)
- **SDK query layer hardening** — Realpath-aware path containment, ReDoS mitigation, strict CLI parsing, phase directory sanitization (#2118)
- **Prompt injection scan** — Allowlist plan-phase.md

## [1.35.0](https://github.com/gsd-build/get-shit-done/releases/tag/v1.35.0) - 2026-04-10

### Added

- **Cline runtime support** — First-class Cline runtime via rules-based integration. Installs to `~/.cline/` or `./.cline/` as `.clinerules`. No custom slash commands — uses rules. `--cline` flag. (#1605 follow-up)
- **CodeBuddy runtime support** — Skills-based install to `~/.codebuddy/skills/gsd-*/SKILL.md`. `--codebuddy` flag.
- **Qwen Code runtime support** — Skills-based install to `~/.qwen/skills/gsd-*/SKILL.md`, same open standard as Claude Code 2.1.88+. `QWEN_CONFIG_DIR` env var for custom paths. `--qwen` flag.
- `**/gsd-from-gsd2` command** (`gsd:from-gsd2`) — Reverse migration from GSD-2 format (`.gsd/` with Milestone→Slice→Task hierarchy) back to v1 `.planning/` format. Flags: `--dry-run` (preview only), `--force` (overwrite existing `.planning/`), `--path <dir>` (specify GSD-2 root). Produces `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, and sequential phase dirs. Flattens Milestone→Slice hierarchy to sequential phase numbers (M001/S01→phase 01, M001/S02→phase 02, M002/S01→phase 03, etc.).
- `**/gsd-ai-integration-phase` command** (`gsd:ai-integration-phase`) — AI framework selection wizard for integrating AI/LLM capabilities into a project phase. Interactive decision matrix with domain-specific failure modes and eval criteria. Produces `AI-SPEC.md` with framework recommendation, implementation guidance, and evaluation strategy. Runs 3 parallel specialist agents: domain-researcher, framework-selector, ai-researcher, eval-planner.
- `**/gsd-eval-review` command** (`gsd:eval-review`) — Retroactive audit of an implemented AI phase's evaluation coverage. Checks implementation against `AI-SPEC.md` evaluation plan. Scores each eval dimension as COVERED/PARTIAL/MISSING. Produces `EVAL-REVIEW.md` with findings, gaps, and remediation guidance.
- **Review model configuration** — Per-CLI model selection for /gsd-review via `review.models.<cli>` config keys. Falls back to CLI defaults when not set. (#1849)
- **Statusline now surfaces GSD milestone/phase/status** — when no `in_progress` todo is active, `gsd-statusline.js` reads `.planning/STATE.md` (walking up from the workspace dir) and fills the middle slot with `<milestone> · <status> · <phase> (N/total)`. Gracefully degrades when fields are missing; identical to previous behavior when there is no STATE.md or an active todo wins the slot. Uses the YAML frontmatter added for #628.
- **Qwen Code and Cursor CLI peer reviewers** — Added as reviewers in `/gsd-review` with `--qwen` and `--cursor` flags. (#1966)

### Changed

- **Worktree safety — `git clean` prohibition** — `gsd-executor` now prohibits `git clean` in worktree context to prevent deletion of prior wave output. (#2075)
- **Executor deletion verification** — Pre-merge deletion checks added to catch missing artifacts before executor commit. (#2070)
- **Hard reset in worktree branch check** — `--hard` flag in `worktree_branch_check` now correctly resets the file tree, not just HEAD. (#2073)

### Fixed

- **Context7 MCP CLI fallback** — Handles `tools: []` response that previously broke Context7 availability detection. (#1885)
- `**Agent` tool in gsd-autonomous** — Added `Agent` to `allowed-tools` to unblock subagent spawning. (#2043)
- `**intel.enabled` in config-set whitelist** — Config key now accepted by `config-set` without validation error. (#2021)
- `**writeSettings` null guard** — Guards against null `settingsPath` for Cline runtime to prevent crash on install. (#2046)
- **Shell hook absolute paths** — `.sh` hooks now receive absolute quoted paths in `buildHookCommand`, fixing path resolution in non-standard working directories. (#2045)
- `**processAttribution` runtime-aware** — Was hardcoded to `'claude'`; now reads actual runtime from environment.
- `**AskUserQuestion` plain-text fallback** — Non-Claude runtimes now receive plain-text numbered lists instead of broken TUI menus.
- **iOS app scaffold uses XcodeGen** — Prevents SPM execution errors in generated iOS scaffolds. (#2023)
- `**acceptance_criteria` hard gate** — Enforced as a hard gate in executor — plans missing acceptance criteria are rejected before execution begins. (#1958)
- `**normalizePhaseName` preserves letter suffix case** — Phase names with letter suffixes (e.g., `1a`, `2B`) now preserve original case. (#1963)

## [1.34.2](https://github.com/gsd-build/get-shit-done/releases/tag/v1.34.2) - 2026-04-06

### Changed

- **Node.js minimum lowered to 22** — `engines.node` was raised to `>=24.0.0` based on a CI matrix change, but Node 22 is still in Active LTS until October 2026. Restoring Node 22 support eliminates the `EBADENGINE` warning for users on the previous LTS line. CI matrix now tests against both Node 22 and Node 24.

## [1.34.1](https://github.com/gsd-build/get-shit-done/releases/tag/v1.34.1) - 2026-04-06

### Fixed

- **npm publish catchup** — v1.33.0 and v1.34.0 were tagged but never published to npm; this release makes all changes available via `npx get-shit-done-cc@latest`
- Removed npm v1.32.0 stuck notice from README

## [1.34.0](https://github.com/gsd-build/get-shit-done/releases/tag/v1.34.0) - 2026-04-06

### Added

- **Gates taxonomy reference** — 4 canonical gate types (pre-flight, revision, escalation, abort) with phase matrix wired into plan-checker and verifier agents (#1781)
- **Post-merge hunk verification** — `reapply-patches` now detects silently dropped hunks after three-way merge (#1775)
- **Execution context profiles** — Three context profiles (`dev`, `research`, `review`) for mode-specific agent output guidance (#1807)

### Fixed

- **Shell hooks missing from npm package** — `hooks/*.sh` files excluded from tarball due to `hooks/dist` allowlist; changed to `hooks` (#1852 #1862)
- **detectConfigDir priority** — `.claude` now searched first so Claude Code users don't see false update warnings when multiple runtimes are installed (#1860)
- **Milestone backlog preservation** — `phases clear` no longer wipes 999.x backlog phases (#1858)

## [1.33.0](https://github.com/gsd-build/get-shit-done/releases/tag/v1.33.0) - 2026-04-05

### Added

- **Queryable codebase intelligence system** -- Persistent `.planning/intel/` store with structured JSON files (files, exports, symbols, patterns, dependencies). Query via `gsd-tools intel` subcommands. Incremental updates via `gsd-intel-updater` agent. Opt-in; projects without intel store are unaffected. (#1688)
- **Shared behavioral references** — Add questioning, domain-probes, and UI-brand reference docs wired into workflows (#1658)
- **Chore / Maintenance issue template** — Structured template for internal maintenance tasks (#1689)
- **Typed contribution templates** — Separate Bug, Enhancement, and Feature issue/PR templates with approval gates (#1673)
- **MODEL_ALIAS_MAP regression test** — Ensures model aliases stay current (#1698)

### Changed

- **CONFIG_DEFAULTS constant** — Deduplicate config defaults into single source of truth in core.cjs (#1708)
- **Test standardization** — All tests migrated to `node:assert/strict` and `t.after()` cleanup per CONTRIBUTING.md (#1675)
- **CI matrix** — Drop Windows runner, add static hardcoded-path detection (#1676)

### Fixed

- **Kilo path replacement** — `copyFlattenedCommands` now applies path replacement for Kilo runtime (#1710)
- **Prompt guard injection pattern** — Add missing 'act as' pattern to hook (#1697)
- **Frontmatter inline array parser** — Respect quoted commas in array values (REG-04) (#1695)
- **Cross-platform planning lock** — Replace shell `sleep` with `Atomics.wait` for Windows compatibility (#1693)
- **MODEL_ALIAS_MAP** — Update to current Claude model IDs: opus→claude-opus-4-6, sonnet→claude-sonnet-4-6, haiku→claude-haiku-4-5 (#1691)
- **Skill path replacement** — `copyCommandsAsClaudeSkills` now applies path replacement correctly (#1677)
- **Runtime detection for /gsd-review** — Environment-based detection instead of hardcoded paths (#1463)
- **Marketing text in runtime prompt** — Remove marketing taglines from runtime selection (#1672, #1655)
- **Discord invite link** — Update from vanity URL to permanent invite link (#1648)

### Documentation

- **COMMANDS.md** — Add /gsd-secure-phase and /gsd-docs-update (#1706)
- **AGENTS.md** — Add 3 missing agents, fix stale counts (#1703)
- **ARCHITECTURE.md** — Update component counts and missing entries (#1701)
- **Localized documentation** — Full v1.32.0 audit for all language READMEs

## [1.32.0] - 2026-04-04

### Added

- **Trae runtime support** — Install GSD for Trae IDE via `--trae` flag (#1566)
- **Kilo CLI runtime support** — Full Kilo runtime integration with skill conversion and config management
- **Augment Code runtime support** — Full Augment runtime with skill conversion
- **Cline runtime support** — Install GSD for Cline via `.clinerules` (#1605)
- `**state validate` command** — Detects drift between STATE.md and filesystem reality (#1627)
- `**state sync` command** — Reconstructs STATE.md from actual project state with `--verify` dry-run (#1627)
- `**state planned-phase` command** — Records state transition after plan-phase completes (#1627)
- `**--to N` flag for autonomous mode** — Stop execution after completing a specific phase (#1644)
- `**--power` flag for discuss-phase** — File-based bulk question answering (#1513)
- `**--interactive` flag for autonomous** — Lean context with user input
- `**--diagnose` flag for debug** — Diagnosis-only mode without fix attempts (#1396)
- `**/gsd-analyze-dependencies` command** — Detect phase dependencies (#1607)
- **Anti-pattern severity levels** — Mandatory understanding checks at resume (#1491)
- **Methodology artifact type** — Consumption mechanisms for methodology documents (#1488)
- **Planner reachability check** — Validates plan steps are achievable (#1606)
- **Playwright-MCP automated UI verification** — Optional visual verification in verify-phase (#1604)
- **Pause-work expansion** — Supports non-phase contexts with richer handoffs (#1608)
- **Research gate** — Blocks planning when RESEARCH.md has unresolved open questions (#1618)
- **Context reduction** — Markdown truncation and cache-friendly prompt ordering for SDK (#1615)
- **Verifier milestone scope filtering** — Gaps addressed in later phases marked as deferred, not gaps (#1624)
- **Read-before-edit guard hook** — Advisory PreToolUse hook prevents infinite retry loops in non-Claude runtimes (#1628)
- **Response language config** — `response_language` setting for cross-phase language consistency (#1412)
- **Manual update procedure** — `docs/manual-update.md` for non-npm installs
- **Commit-docs hook** — Guard for `commit_docs` enforcement (#1395)
- **Community hooks opt-in** — Optional hooks for GSD projects
- **OpenCode reviewer** — Added as peer reviewer in `/gsd-review`
- **Multi-project workspace** — `GSD_PROJECT` env var support
- **Manager passthrough flags** — Per-step flag configuration via config (#1410)
- **Adaptive context enrichment** — For 1M-token models
- **Test quality audit step** — Added to verify-phase workflow

### Changed

- **Modular planner decomposition** — `gsd-planner.md` split into reference files to stay under 50K char limit (#1612)
- **Sequential worktree dispatch** — Replaced timing-based stagger with sequential `Task()` + `run_in_background` (#1541)
- **Skill format migration** — All user-facing suggestions updated from `/gsd:xxx` to `/gsd-xxx` (#1579)

### Fixed

- **Phase resolution prefix collision** — `find-phase` now uses exact token matching; `1009` no longer matches `1009A` (#1635)
- **Roadmap backlog phase lookup** — `roadmap get-phase` falls back to full ROADMAP.md for phases outside current milestone (#1634)
- **Performance Metrics in `phase complete`** — Now updates Velocity and By Phase table on phase completion (#1627)
- **Ghost `state update-position` command** — Removed dead reference from execute-phase.md (#1627)
- **Semver comparison for update check** — Proper `isNewer()` comparison replaces `!==`; no longer flags newer-than-npm as update available (#1617)
- **Next Up block ordering** — `/clear` shown before command (#1631)
- **Chain flag preservation** — Preserved across discuss → plan → execute (#1633)
- **Config key validation** — Unrecognized keys in config.json now warn instead of silent drop (#1542)
- **Parallel worktree STATE.md overwrites** — Orchestrator owns STATE.md/ROADMAP.md writes (#1599)
- **Dependent plan wave ordering** — Detects `files_modified` overlap and enforces wave ordering (#1587)
- **Windows session path hash** — Uses `realpathSync.native` (#1593)
- **STATE.md progress counters** — Corrected during plan execution (#1597)
- **Workspace agent path resolution** — Correct in worktree context (#1512)
- **Milestone phase cleanup** — Clears phases directory on new milestone (#1588)
- **Workstreams allowed-tools** — Removed unnecessary Write permission (#1637)
- **Executor/planner MCP tools** — Instructed to use available MCP tools (#1603)
- **Bold plan checkboxes** — Fixed in ROADMAP.md
- **Backlog recommendations** — Fixed BACKLOG phase handling
- **Session ID path traversal** — Validated `planningDir`
- **Copilot executor Task descriptions** — Added required `description` param
- **OpenCode permission string guard** — Fixed string-valued permission config
- **Concurrency safety** — Atomic state writes
- **Health validation** — STATE/ROADMAP cross-validation
- **Workstream session routing** — Isolated per session with fallback

## [1.31.0] - 2026-04-01

### Added

- **Claude Code 2.1.88+ skills migration** — Commands now install as `skills/gsd-*/SKILL.md` instead of deprecated `commands/gsd/`. Auto-cleans legacy directory on install
- `**/gsd:docs-update` command** — Verified documentation generation with doc-writer and doc-verifier agents
- `**--chain` flag for discuss-phase** — Interactive discuss that auto-chains into plan+execute
- `**--only N` flag for autonomous** — Execute a single phase instead of all remaining
- **Schema drift detection** — Prevents false-positive verification when ORM schema files change without migration
- `**/gsd:secure-phase` command** — Security enforcement layer with threat-model-anchored verification
- **Claim provenance tagging** — Researcher marks claims with source evidence
- **Scope reduction detection** — Planner blocked from silently dropping requirements
- `**workflow.use_worktrees` config** — Toggle to disable worktree isolation
- `**project_code` config** — Prefix phase directories with project code
- **Project skills discovery** — CLAUDE.md generation now includes project-specific skills section
- **CodeRabbit integration** — Added to cross-AI review workflow
- **GSD SDK enhancements** — Auto `--init` flag, headless prompts, prompt sanitizer

### Changed

- `**/gsd:quick --full` flag** — Now enables all phases (discussion + research + plan-checking + verification). New `--validate` flag covers previous `--full` behavior (plan-checking + verification only)

### Fixed

- **Gemini CLI agent loading** — Removed `permissionMode` that broke agent frontmatter parsing
- **Phase count display** — Clarified misleading N/T banner in autonomous mode
- **Workstream `set` command** — Now requires name arg, added `--clear` flag
- **Infinite self-discuss loop** — Fixed in auto/headless mode with `max_discuss_passes` config
- **Orphan worktree cleanup** — Post-execution cleanup added
- **JSONC settings.json** — Comments no longer cause data loss
- **Incremental checkpoint saves** — Discuss answers preserved on interrupt
- **Stats accuracy** — Verification required for Complete status, added Executed state
- **Three-way merge for reapply-patches** — Never-skip invariant for backed-up files
- **SDK verify gates advance** — Skip advance when verification finds gaps
- **Manager delegates to Skill pipeline** — Instead of raw Task prompts
- **ROADMAP.md Plans column** — cmdPhaseComplete now updates correctly
- **Decimal phase numbers** — Commit regex captures decimal phases
- **Codex path replacement** — Added .claude path replacement
- **Verifier loads all ROADMAP SCs** — Regardless of PLAN must_haves
- **Verifier human_needed status** — Enforced when human verification items exist
- **Hooks shared cache dir** — Correct stale hooks path
- **Plan file naming** — Convention enforced in gsd-planner agent
- **Copilot path replacement** — Fixed ~/.claude to ~/.github
- **Windsurf trailing slash** — Removed from .windsurf/rules path
- **Slug sanitization** — Added --raw flag, capped length to 60 chars

## [1.30.0](https://github.com/gsd-build/get-shit-done/releases/tag/v1.30.0) - 2026-03-26

### Added

- **GSD SDK** — Headless TypeScript SDK (`@gsd-build/sdk`) with `gsd-sdk init` and `gsd-sdk auto` CLI commands for autonomous project execution
- `**--sdk` installer flag** — Optionally install the GSD SDK during setup (interactive prompt or `--sdk` flag)

## [1.29.0](https://github.com/gsd-build/get-shit-done/releases/tag/v1.29.0) - 2026-03-25

### Added

- **Windsurf runtime support** — Full installation and command conversion for Windsurf
- **Agent skill injection** — Inject project-specific skills into subagents via `agent_skills` config section
- **UI-phase and UI-review steps** in autonomous workflow
- **Security scanning CI** — Prompt injection, base64, and secret scanning workflows
- **Portuguese (pt-BR) documentation**
- **Korean (ko-KR) documentation**
- **Japanese (ja-JP) documentation**

### Changed

- Repository references updated from `glittercowboy` to `gsd-build`
- Korean translations refined from formal -십시오 to natural -세요 style

### Fixed

- Frontmatter `must_haves` parser handles any YAML indentation width
- `findProjectRoot` returns startDir when it already contains `.planning/`
- Agent workflows include `<available_agent_types>` for named agent spawning
- Begin-phase preserves Status/LastActivity/Progress in Current Position
- Missing GSD agents detected with warning when `subagent_type` falls back to general-purpose
- Codex re-install repairs trapped non-boolean keys under `[features]`
- Invalid `\Z` regex anchor replaced and redundant pattern removed
- Hook field validation prevents silent `settings.json` rejection
- Codex preserves top-level config keys and uses absolute agent paths (≥0.116)
- Windows shell robustness, `project_root` detection, and hook stdin safety
- Brownfield project detection expanded to Android, Kotlin, Gradle, and 15+ ecosystems
- Verify-work checkpoint rendering hardened
- Worktree agents get `permissionMode: acceptEdits`
- Security scan self-detection and Windows test compatibility

## [1.28.0](https://github.com/gsd-build/get-shit-done/releases/tag/v1.28.0) - 2026-03-22

### Added

- **Workstream namespacing** — Parallel milestone work via `/gsd:workstreams`
- **Multi-project workspace commands** — Manage multiple GSD projects from a single root
- `**/gsd:forensics` command** — Post-mortem workflow investigation
- `**/gsd:milestone-summary` command** — Post-build onboarding for completed milestones
- `**workflow.skip_discuss` setting** — Bypass discuss-phase in autonomous mode
- `**workflow.discuss_mode` assumptions config** — Control discuss-phase behavior
- **UI-phase recommendation** — Automatically surfaced for UI-heavy phases
- **CLAUDE.md compliance** — Added as plan-checker Dimension 10
- **Data-flow tracing, environment audit, and behavioral spot-checks** in verification
- **Multi-runtime selection** in interactive installer
- **Text mode support** for plan-phase workflow
- **"Follow the Indirection" debugging technique** in gsd-debugger
- `**--reviews` flag** for `gsd:plan-phase`
- **Temp file reaper** — Prevents unbounded /tmp accumulation

### Changed

- Test matrix optimized from 9 containers down to 4
- Copilot skill/agent counts computed dynamically from source dirs
- Wave-specific execution support in execute-phase

### Fixed

- Windows 8.3 short path failures in worktree tests
- Worktree isolation enforced for code-writing agents
- Linked worktrees respect `.planning/` before resolving to main repo
- Path traversal prevention via workstream name sanitization
- Strategy branch created before first commit (not at execute-phase)
- `ProviderModelNotFoundError` on non-Claude runtimes
- `$HOME` used instead of `~` in installed shell command paths
- Subdirectory CWD preserved in monorepo worktrees
- Stale hook detection checking wrong directory path
- STATE.md frontmatter status preserved when body Status field missing
- Pipe truncation fix using `fs.writeSync` for stdout
- Verification gate before writing PROJECT.md in new-milestone
- Removed `jq` as undocumented hard dependency
- Discuss-phase no longer ignores workflow instructions
- Gemini CLI uses `BeforeTool` hook event instead of `PreToolUse`

## [1.27.0](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.27.0) - 2026-03-20

### Added

- **Advisor mode** — Research-backed discussion with parallel agents evaluating gray areas before you decide
- **Multi-repo workspace support** — Auto-detection and project root resolution for monorepos and multi-repo setups
- **Cursor CLI runtime support** — Full installation and command conversion for Cursor
- `**/gsd:fast` command** — Trivial inline tasks that skip planning entirely
- `**/gsd:review` command** — Cross-AI peer review of current phase or branch
- `**/gsd:plant-seed` command** — Backlog parking lot for ideas and persistent context threads
- `**/gsd:pr-branch` command** — Clean PR branches filtering `.planning/` commits
- `**/gsd:audit-uat` command** — Verification debt tracking across phases
- `**--analyze` flag for discuss-phase** — Trade-off analysis during discussion
- `**research_before_questions` config option** — Run research before discussion questions instead of after
- **Ticket-based phase identifiers** — Support for team workflows using ticket IDs
- **Worktree-aware `.planning/` resolution** — File locking for safe parallel access
- **Discussion audit trail** — Auto-generated `DISCUSSION-LOG.md` during discuss-phase
- **Context window size awareness** — Optimized behavior for 1M+ context models
- **Exa and Firecrawl MCP support** — Additional research tools for research agents
- **Runtime State Inventory** — Researcher capability for rename/refactor phases
- **Quick-task branch support** — Isolated branches for quick-mode tasks
- **Decision IDs** — Discuss-to-plan traceability via decision identifiers
- **Stub detection** — Verifier and executor detect incomplete implementations
- **Security hardening** — Centralized `security.cjs` module with path traversal prevention, prompt injection detection/sanitization, safe JSON parsing, field name validation, and shell argument validation. PreToolUse `gsd-prompt-guard` hook scans writes to `.planning/` for injection patterns

### Changed

- CI matrix updated to Node 20, 22, 24 — dropped EOL Node 18
- GitHub Actions upgraded for Node 24 compatibility
- Consolidated `planningPaths()` helper across 4 modules — eliminated 34 inline path constructions
- Deduplicated code, annotated empty catches, consolidated STATE.md field helpers
- Materialize full config on new-project initialization
- Workflow enforcement guidance embedded in generated CLAUDE.md

### Fixed

- Path traversal in `readTextArgOrFile` — arguments validate paths resolve within project directory
- Codex config.toml corruption from non-boolean `[features]` keys
- Stale hooks check filtered to gsd-prefixed files only
- Universal agent name replacement for non-Claude runtimes
- `--no-verify` support for parallel executor commits
- ROADMAP fallback for plan-phase, execute-phase, and verify-work
- Copilot sequential fallback and spot-check completion detection
- `text_mode` config for Claude Code remote session compatibility
- Cursor: preserve slash-prefixed commands and unquoted skill names
- Semver 3+ segment parsing and CRLF frontmatter corruption recovery
- STATE.md parsing fixes (compound Plan field, progress tables, lifecycle extraction)
- Windows HOME sandboxing for tests
- Hook manifest tracking for local patch detection
- Cross-platform code detection and STATE.md file locking
- Auto-detect `commit_docs` from gitignore in `loadConfig`
- Context monitor hook matcher and timeout
- Codex EOL preservation when enabling hooks
- macOS `/var` symlink resolution in path validation

## [1.26.0](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.26.0) - 2026-03-18

### Added

- **Developer profiling pipeline** — `/gsd:profile-user` analyzes Claude Code session history to build behavioral profiles across 8 dimensions (communication, decisions, debugging, UX, vendor choices, frustrations, learning style, explanation depth). Generates `USER-PROFILE.md`, `/gsd:dev-preferences`, and `CLAUDE.md` profile section. Includes `--questionnaire` fallback and `--refresh` for re-analysis (#1084)
- `**/gsd:ship` command** — PR creation from verified phase work. Auto-generates rich PR body from planning artifacts, pushes branch, creates PR via `gh`, and updates STATE.md (#829)
- `**/gsd:next` command** — Automatic workflow advancement to the next logical step (#927)
- **Cross-phase regression gate** — Execute-phase runs prior phases' test suites after execution, catching regressions before they compound (#945)
- **Requirements coverage gate** — Plan-phase verifies all phase requirements are covered by at least one plan before proceeding (#984)
- **Structured session handoff artifact** — `/gsd:pause-work` writes `.planning/HANDOFF.json` for machine-readable cross-session continuity (#940)
- **WAITING.json signal file** — Machine-readable signal for decision points requiring user input (#1034)
- **Interactive executor mode** — Pair-programming style execution with step-by-step user involvement (#963)
- **MCP tool awareness** — GSD subagents can discover and use MCP server tools (#973)
- **Codex hooks support** — SessionStart hook support for Codex runtime (#1020)
- **Model alias-to-full-ID resolution** — Task API compatibility for model alias strings (#991)
- **Execution hardening** — Pre-wave dependency checks, cross-plan data contracts, and export-level spot checks (#1082)
- **Markdown normalization** — Generated markdown conforms to markdownlint standards (#1112)
- `**/gsd:audit-uat` command** — Cross-phase audit of all outstanding UAT and verification items. Scans every phase for pending, skipped, blocked, and human_needed items. Cross-references against codebase to detect stale documentation. Produces prioritized human test plan grouped by testability
- **Verification debt tracking** — Five structural improvements to prevent silent loss of UAT/verification items when projects advance:
  - Cross-phase health check in `/gsd:progress` (Step 1.6) surfaces outstanding items from ALL prior phases
  - `status: partial` in UAT files distinguishes incomplete testing from completed sessions
  - `result: blocked` with `blocked_by` tag for tests blocked by external dependencies (server, device, build, third-party)
  - `human_needed` verification items now persist as HUMAN-UAT.md files (trackable across sessions)
  - Phase completion and transition warnings surface verification debt non-blockingly
- **Advisor mode for discuss-phase** — Spawns parallel research agents during `/gsd:discuss-phase` to evaluate gray areas before user decides. Returns structured comparison tables calibrated to user's vendor philosophy. Activates only when `USER-PROFILE.md` exists (#1211)

### Changed

- Test suite consolidated: runtime converters deduplicated, helpers standardized (#1169)
- Added test coverage for model-profiles, templates, profile-pipeline, profile-output (#1170)
- Documented `inherit` profile for non-Anthropic providers (#1036)

### Fixed

- Agent suggests non-existent `/gsd:transition` — replaced with real commands (#1081, #1100)
- PROJECT.md drift and phase completion counter accuracy (#956)
- Copilot executor stuck issue — runtime compatibility fallback added (#1128)
- Explicit agent type listings prevent fallback after `/clear` (#949)
- Nested Skill calls breaking AskUserQuestion (#1009)
- Negative-heuristic `stripShippedMilestones` replaced with positive milestone lookup (#1145)
- Hook version tracking, stale hook detection, stdin timeout, session-report command (#1153, #1157, #1161, #1162)
- Hook build script syntax validation (#1165)
- Verification examples use `fetch()` instead of `curl` for Windows compatibility (#899)
- Sequential fallback for `map-codebase` on runtimes without Task tool (#1174)
- Zsh word-splitting fix for RUNTIME_DIRS arrays (#1173)
- CRLF frontmatter parsing, duplicate cwd crash, STATE.md phase transitions (#1105)
- Requirements `mark-complete` made idempotent (#948)
- Profile template paths, field names, and evidence key corrections (#1095)
- Duplicate variable declaration removed (#1101)

## [1.25.0](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.25.0) - 2026-03-16

### Added

- **Antigravity runtime support** — Full installation support for the Antigravity AI agent runtime (`--antigravity`), alongside Claude Code, OpenCode, Gemini, Codex, and Copilot
- `**/gsd:do` command** — Freeform text router that dispatches natural language to the right GSD command
- `**/gsd:note` command** — Zero-friction idea capture with append, list, and promote-to-todo subcommands
- **Context window warning toggle** — Config option to disable context monitor warnings (`hooks.context_monitor: false`)
- **Comprehensive documentation** — New `docs/` directory with feature, architecture, agent, command, CLI, and configuration guides

### Changed

- `/gsd:discuss-phase` shows remaining discussion areas when asking to continue or move on
- `/gsd:plan-phase` asks user about research instead of silently deciding
- Improved GitHub issue and PR templates with industry best practices
- Settings clarify balanced profile uses Sonnet for research

### Fixed

- Executor checks for untracked files after task commits
- Researcher verifies package versions against npm registry before recommending
- Health check adds CWD guard and strips archived milestones
- `core.cjs` returns `opus` directly instead of mapping to `inherit`
- Stats command corrects git and roadmap reporting
- Init prefers current milestone phase-op targets
- **Antigravity skills** — `processAttribution` was missing from `copyCommandsAsAntigravitySkills`, causing SKILL.md files to be written without commit attribution metadata
- Copilot install tests updated for UI agent count changes

## [1.24.0](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.24.0) - 2026-03-15

### Added

- `**/gsd:quick --research` flag** — Spawns focused research agent before planning, composable with `--discuss` and `--full` (#317)
- `**inherit` model profile** for OpenCode — agents inherit the user's selected runtime model via `/model`
- **Persistent debug knowledge base** — resolved debug sessions append to `.planning/debug/knowledge-base.md`, eliminating cold-start investigation on recurring issues
- **Programmatic `/gsd:set-profile`** — runs as a script instead of LLM-driven workflow, executes in seconds instead of 30-40s

### Fixed

- ROADMAP.md searches scoped to current milestone — multi-milestone projects no longer match phases from archived milestones
- OpenCode agent frontmatter conversion — agents get correct `name:`, `model: inherit`, `mode: subagent`
- `opencode.jsonc` config files respected during install (previously only `.json` was detected) (#1053)
- Windows installer crash on EPERM/EACCES when scanning protected directories (#964)
- `gsd-tools.cjs` uses absolute paths in all install types (#820)
- Invalid `skills:` frontmatter removed from UI agent files

## [1.23.0](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.23.0) - 2026-03-15

### Added

- `/gsd:ui-phase` + `/gsd:ui-review` — UI design contract generation and retroactive 6-pillar visual audit for frontend phases (closes #986)
- `/gsd:stats` — project statistics dashboard: phases, plans, requirements, git metrics, and timeline
- **Copilot CLI** runtime support — install with `--copilot`, maps Claude Code tools to GitHub Copilot tools
- `**gsd-autonomous` skill** for Codex runtime — enables autonomous GSD execution
- **Node repair operator** — autonomous recovery when task verification fails: RETRY, DECOMPOSE, or PRUNE before escalating to user. Configurable via `workflow.node_repair_budget` (default: 2 attempts). Disable with `workflow.node_repair: false`
- Mandatory `read_first` and `acceptance_criteria` sections in plans to prevent shallow execution
- Mandatory `canonical_refs` section in CONTEXT.md for traceable decisions
- Quick mode uses `YYMMDD-xxx` timestamp IDs instead of auto-increment numbers

### Changed

- `/gsd:discuss-phase` supports explicit `--batch` mode for grouped question intake

### Fixed

- `/gsd:new-milestone` no longer resets `workflow.research` config during milestone transitions
- `/gsd:update` is runtime-aware and targets the correct runtime directory
- Phase-complete properly updates REQUIREMENTS.md traceability (closes #848)
- Auto-advance no longer triggers without `--auto` flag (closes #1026, #932)
- `--auto` flag correctly skips interactive discussion questions (closes #1025)
- Decimal phase numbers correctly padded in init.cjs (closes #915)
- Empty-answer validation guards added to discuss-phase (closes #912)
- Tilde paths in templates prevent PII leak in `.planning/` files (closes #987)
- Invalid `commit-docs` command replaced with `commit` in workflows (closes #968)
- Uninstall mode indicator shown in banner output (closes #1024)
- WSL + Windows Node.js mismatch detected with user warning (closes #1021)
- Deprecated Codex config keys removed to fix UI instability
- Unsupported Gemini agent `skills` frontmatter stripped for compatibility
- Roadmap `complete` checkbox overrides `disk_status` for phase detection
- Plan-phase Nyquist validation works when research is disabled (closes #1002)
- Valid Codex agent TOML emitted by installer
- Escape characters corrected in grep commands

## [1.22.4](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.22.4) - 2026-03-03

### Added

- `--discuss` flag for `/gsd:quick` — lightweight pre-planning discussion to gather context before quick tasks

### Fixed

- Windows: `@file:` protocol resolution for large init payloads (>50KB) — all 32 workflow/agent files now resolve temp file paths instead of letting agents hallucinate `/tmp` paths (#841)
- Missing `skills` frontmatter on gsd-nyquist-auditor agent

## [1.22.3](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.22.3) - 2026-03-03

### Added

- Verify-work auto-injects a cold-start smoke test for phases that modify server, database, seed, or startup files — catches warm-state blind spots

### Changed

- Renamed `depth` setting to `granularity` with values `coarse`/`standard`/`fine` to accurately reflect what it controls (phase count, not investigation depth). Backward-compatible migration auto-renames existing config.

### Fixed

- Installer now replaces `$HOME/.claude/` paths (not just `~/.claude/`) for non-Claude runtimes — fixes broken commands on local installs and Gemini/OpenCode/Codex installs (#905, #909)

## [1.22.2](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.22.2) - 2026-03-03

### Fixed

- Codex installer no longer creates duplicate `[features]` and `[agents]` sections on re-install (#902, #882)
- Context monitor hook is advisory instead of blocking non-GSD workflows
- Hooks respect `CLAUDE_CONFIG_DIR` for custom config directories
- Hooks include stdin timeout guard to prevent hanging on pipe errors
- Statusline context scaling matches autocompact buffer thresholds
- Gap closure plans compute wave numbers instead of hardcoding wave 1
- `auto_advance` config flag no longer persists across sessions
- Phase-complete scans ROADMAP.md as fallback for next-phase detection
- `getMilestoneInfo()` prefers in-progress milestone marker instead of always returning first
- State parsing supports both bold and plain field formats
- Phase counting scoped to current milestone
- Total phases derived from ROADMAP when phase directories don't exist yet
- OpenCode detects runtime config directory instead of hardcoding `.claude`
- Gemini hooks use `AfterTool` event instead of `PostToolUse`
- Multi-word commit messages preserved in CLI router
- Regex patterns in milestone/state helpers properly escaped
- `isGitIgnored` uses `--no-index` for tracked file detection
- AskUserQuestion freeform answer loop properly breaks on valid input
- Agent spawn types standardized across all workflows

### Changed

- Anti-heredoc instruction extended to all file-writing agents
- Agent definitions include skills frontmatter and hooks examples

### Chores

- Removed leftover `new-project.md.bak` file
- Deduplicated `extractField` and phase filter helpers into shared modules
- Added 47 agent frontmatter and spawn consistency tests

## [1.22.1](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.22.1) - 2026-03-02

### Added

- Discuss phase now loads prior context (PROJECT.md, REQUIREMENTS.md, STATE.md, and all prior CONTEXT.md files) before identifying gray areas — prevents re-asking questions you've already answered in earlier phases

### Fixed

- Shell snippets in workflows use `printf` instead of `echo` to prevent jq parse errors with special characters

## [1.22.0](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.22.0) - 2026-02-27

### Added

- Codex multi-agent support: `request_user_input` mapping, multi-agent config, and agent role generation for Codex runtime
- Analysis paralysis guard in agents to prevent over-deliberation during planning
- Exhaustive cross-check and task-level TDD patterns in agent workflows
- Code-aware discuss phase with codebase scouting — `/gsd:discuss-phase` now analyzes relevant source files before asking questions

### Fixed

- Update checker clears both cache paths to prevent stale version notifications
- Statusline migration regex no longer clobbers third-party statuslines
- Subagent paths use `$HOME` instead of `~` to prevent `MODULE_NOT_FOUND` errors
- Skill discovery supports both `.claude/skills/` and `.agents/skills/` paths
- `resolve-model` variable names aligned with template placeholders
- Regex metacharacters properly escaped in `stateExtractField`
- `model_overrides` and `nyquist_validation` correctly loaded from config
- `phase-plan-index` no longer returns null/empty for `files_modified`, `objective`, and `task_count`

## [1.21.1](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.21.1) - 2026-02-27

### Added

- Comprehensive test suite: 428 tests across 13 test files covering core, commands, config, dispatcher, frontmatter, init, milestone, phase, roadmap, state, and verify modules
- CI pipeline with GitHub Actions: 9-matrix (3 OS × 3 Node versions), c8 coverage enforcement at 70% line threshold
- Cross-platform test runner (`scripts/run-tests.cjs`) for Windows compatibility

### Fixed

- `getMilestoneInfo()` returns wrong version when shipped milestones are collapsed in `<details>` blocks
- Milestone completion stats and archive now scoped to current milestone phases only (previously counted all phases on disk including prior milestones)
- MILESTONES.md entries now insert in reverse chronological order (newest first)
- Cross-platform path separators: all user-facing file paths use forward slashes on Windows
- JSON quoting and dollar sign handling in CLI arguments on Windows
- `model_overrides` loaded from config and `resolveModelInternal` used in CLI

## [1.21.0](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.21.0) - 2026-02-25

### Added

- YAML frontmatter sync to STATE.md for machine-readable status tracking
- `/gsd:add-tests` command for post-phase test generation
- Codex runtime support with skills-first installation
- Standard `project_context` block in gsd-verifier output
- Codex changelog and usage documentation

### Changed

- Improved onboarding UX: installer now suggests `/gsd:new-project` instead of `/gsd:help`
- Updated Discord invite to vanity URL (discord.gg/gsd)
- Compressed Nyquist validation layer to align with GSD meta-prompt conventions
- Requirements propagation now includes `phase_req_ids` from ROADMAP to workflow agents
- Debug sessions require human verification before resolution

### Fixed

- Multi-level decimal phase handling (e.g., 72.1.1) with proper regex escaping
- `/gsd:update` always installs latest package version
- STATE.md decision corruption and dollar sign handling
- STATE.md frontmatter mapping for requirements-completed status
- Progress bar percent clamping to prevent RangeError crashes
- `--cwd` override support in state-snapshot command

## [1.20.6](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.20.6) - 2025-02-23

### Added

- Context window monitor hook with WARNING/CRITICAL alerts when agent context usage exceeds thresholds
- Nyquist validation layer in plan-phase pipeline to catch quality issues before execution
- Option highlighting and gray area looping in discuss-phase for clearer preference capture

### Changed

- Refactored installer tools into 11 domain modules for maintainability

### Fixed

- Auto-advance chain no longer breaks when skills fail to resolve inside Task subagents
- Gemini CLI workflows and templates no longer incorrectly convert to TOML format
- Universal phase number parsing handles all formats consistently (decimal phases, plain numbers)

## [1.20.5](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.20.5) - 2026-02-19

### Fixed

- `/gsd:health --repair` now creates timestamped backup before regenerating STATE.md (#657)

### Changed

- Subagents now discover and load project CLAUDE.md and skills at spawn time for better project context (#671, #672)
- Improved context loading reliability in spawned agents

## [1.20.4](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.20.4) - 2026-02-17

### Fixed

- Executor agents now update ROADMAP.md and REQUIREMENTS.md after each plan completes — previously both documents stayed unchecked throughout milestone execution
- New `requirements mark-complete` CLI command enables per-plan requirement tracking instead of waiting for phase completion
- Executor final commit includes ROADMAP.md and REQUIREMENTS.md

## [1.20.3](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.20.3) - 2026-02-16

### Fixed

- Milestone audit now cross-references three independent sources (VERIFICATION.md + SUMMARY frontmatter + REQUIREMENTS.md traceability) instead of single-source phase status checks
- Orphaned requirements (in traceability table but absent from all phase VERIFICATIONs) detected and forced to `unsatisfied`
- Integration checker receives milestone requirement IDs and maps findings to affected requirements
- `complete-milestone` gates on requirements completion before archival — surfaces unchecked requirements with proceed/audit/abort options
- `plan-milestone-gaps` updates REQUIREMENTS.md traceability table (phase assignments, checkbox resets, coverage count) and includes it in commit
- Gemini CLI: escape `${VAR}` shell variables in agent bodies to prevent template validation failures

## [1.20.2](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.20.2) - 2026-02-16

### Fixed

- Requirements tracking chain now strips bracket syntax (`[REQ-01, REQ-02]` → `REQ-01, REQ-02`) across all agents
- Verifier cross-references requirement IDs from PLAN frontmatter instead of only grepping REQUIREMENTS.md by phase number
- Orphaned requirements (mapped to phase in REQUIREMENTS.md but unclaimed by any plan) are detected and flagged

### Changed

- All `requirements` references across planner, templates, and workflows enforce MUST/REQUIRED/CRITICAL language — no more passive suggestions
- Plan checker now **fails** (blocking, not warning) when any roadmap requirement is absent from all plans
- Researcher receives phase-specific requirement IDs and must output a `<phase_requirements>` mapping table
- Phase requirement IDs extracted from ROADMAP and passed through full chain: researcher → planner → checker → executor → verifier
- Verification report requirements table expanded with Source Plan, Description, and Evidence columns

## [1.20.1](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.20.1) - 2026-02-16

### Fixed

- Auto-mode (`--auto`) now survives context compaction by persisting `workflow.auto_advance` to config.json on disk
- Checkpoints no longer block auto-mode: human-verify auto-approves, decision auto-selects first option (human-action still stops for auth gates)
- Plan-phase now passes `--auto` flag when spawning execute-phase
- Auto-advance clears on milestone complete to prevent runaway chains

## [1.20.0](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.20.0) - 2026-02-15

### Added

- `/gsd:health` command — validates `.planning/` directory integrity with `--repair` flag for auto-fixing config.json and STATE.md
- `--full` flag for `/gsd:quick` — enables plan-checking (max 2 iterations) and post-execution verification on quick tasks
- `--auto` flag wired from `/gsd:new-project` through the full phase chain (discuss → plan → execute)
- Auto-advance chains phase execution across full milestones when `workflow.auto_advance` is enabled

### Fixed

- Plans created without user context — `/gsd:plan-phase` warns when no CONTEXT.md exists, `/gsd:discuss-phase` warns when plans already exist (#253)
- OpenCode installer converts `general-purpose` subagent type to OpenCode's `general`
- `/gsd:complete-milestone` respects `commit_docs` setting when merging branches
- Phase directories tracked in git via `.gitkeep` files

## [1.19.2](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.19.2) - 2026-02-15

### Added

- User-level default settings via `~/.gsd/defaults.json` — set GSD defaults across all projects
- Per-agent model overrides — customize which Claude model each agent uses

### Changed

- Completed milestone phase directories are now archived for cleaner project structure
- Wave execution diagram added to README for clearer parallelization visualization

### Fixed

- OpenCode local installs now write config to `./.opencode/` instead of overwriting global `~/.config/opencode/`
- Large JSON payloads write to temp files to prevent truncation in tool calls
- Phase heading matching now supports `####` depth
- Phase padding normalized in insert command
- ESM conflicts prevented by renaming gsd-tools.js to .cjs
- Config directory paths quoted in hook templates for local installs
- Settings file corruption prevented by using Write tool for file creation
- Plan-phase autocomplete fixed by removing "execution" from description
- Executor now has scope boundary and attempt limit to prevent runaway loops

## [1.19.1](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.19.1) - 2026-02-15

### Added

- Auto-advance pipeline: `--auto` flag on `discuss-phase` and `plan-phase` chains discuss → plan → execute without stopping. Also available as `workflow.auto_advance` config setting

### Fixed

- Phase transition routing now routes to `discuss-phase` (not `plan-phase`) when no CONTEXT.md exists — consistent across all workflows (#530)
- ROADMAP progress table plan counts are now computed from disk instead of LLM-edited — deterministic "X/Y Complete" values (#537)
- Verifier uses ROADMAP Success Criteria directly instead of deriving verification truths from the Goal field (#538)
- REQUIREMENTS.md traceability updates when a phase completes
- STATE.md updates after discuss-phase completes (#556)
- AskUserQuestion headers enforced to 12-char max to prevent UI truncation (#559)
- Agent model resolution returns `inherit` instead of hardcoded `opus` (#558)

## [1.19.0](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.19.0) - 2026-02-15

### Added

- Brave Search integration for researchers (requires BRAVE_API_KEY environment variable)
- GitHub issue templates for bug reports and feature requests
- Security policy for responsible disclosure
- Auto-labeling workflow for new issues

### Fixed

- UAT gaps and debug sessions now auto-resolve after gap-closure phase execution (#580)
- Fall back to ROADMAP.md when phase directory missing (#521)
- Template hook paths for OpenCode/Gemini runtimes (#585)
- Accept both `##` and `###` phase headers, detect malformed ROADMAPs (#598, #599)
- Use `{phase_num}` instead of ambiguous `{phase}` for filenames (#601)
- Add package.json to prevent ESM inheritance issues (#602)

## [1.18.0](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.18.0) - 2026-02-08

### Added

- `--auto` flag for `/gsd:new-project` — runs research → requirements → roadmap automatically after config questions. Expects idea document via @ reference (e.g., `/gsd:new-project --auto @prd.md`)

### Fixed

- Windows: SessionStart hook now spawns detached process correctly
- Windows: Replaced HEREDOC with literal newlines for git commit compatibility
- Research decision from `/gsd:new-milestone` now persists to config.json

## [1.17.0](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.17.0) - 2026-02-08

### Added

- **gsd-tools verification suite**: `verify plan-structure`, `verify phase-completeness`, `verify references`, `verify commits`, `verify artifacts`, `verify key-links` — deterministic structural checks
- **gsd-tools frontmatter CRUD**: `frontmatter get/set/merge/validate` — safe YAML frontmatter operations with schema validation
- **gsd-tools template fill**: `template fill summary/plan/verification` — pre-filled document skeletons
- **gsd-tools state progression**: `state advance-plan`, `state update-progress`, `state record-metric`, `state add-decision`, `state add-blocker`, `state resolve-blocker`, `state record-session` — automates STATE.md updates
- **Local patch preservation**: Installer now detects locally modified GSD files, backs them up to `gsd-local-patches/`, and creates a manifest for restoration
- `/gsd:reapply-patches` command to merge local modifications back after GSD updates

### Changed

- Agents (executor, planner, plan-checker, verifier) now use gsd-tools for state updates and verification instead of manual markdown parsing
- `/gsd:update` workflow now notifies about backed-up local patches and suggests `/gsd:reapply-patches`

### Fixed

- Added workaround for Claude Code `classifyHandoffIfNeeded` bug that causes false agent failures — execute-phase and quick workflows now spot-check actual output before reporting failure

## [1.16.0](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.16.0) - 2026-02-08

### Added

- 10 new gsd-tools CLI commands that replace manual AI orchestration of mechanical operations:
  - `phase add <desc>` — append phase to roadmap + create directory
  - `phase insert <after> <desc>` — insert decimal phase
  - `phase remove <N> [--force]` — remove phase with full renumbering
  - `phase complete <N>` — mark done, update state + roadmap, detect milestone end
  - `roadmap analyze` — unified roadmap parser with disk status
  - `milestone complete <ver> [--name]` — archive roadmap/requirements/audit
  - `validate consistency` — check phase numbering and disk/roadmap sync
  - `progress [json|table|bar]` — render progress in various formats
  - `todo complete <file>` — move todo from pending to completed
  - `scaffold [context|uat|verification|phase-dir]` — template generation

### Changed

- Workflows now delegate deterministic operations to gsd-tools CLI, reducing token usage and errors:
  - `remove-phase.md`: 13 manual steps → 1 CLI call + confirm + commit
  - `add-phase.md`: 6 manual steps → 1 CLI call + state update
  - `insert-phase.md`: 7 manual steps → 1 CLI call + state update
  - `complete-milestone.md`: archival delegated to `milestone complete`
  - `progress.md`: roadmap parsing delegated to `roadmap analyze`

### Fixed

- Execute-phase now correctly spawns `gsd-executor` subagents instead of generic task agents
- `commit_docs=false` setting now respected in all `.planning/` commit paths (execute-plan, debugger, reference docs all route through gsd-tools CLI)
- Execute-phase orchestrator no longer bloats context by embedding file content — passes paths instead, letting subagents read in their fresh context
- Windows: Normalized backslash paths in gsd-tools invocations (contributed by @rmindel)

## [1.15.0](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.15.0) - 2026-02-08

### Changed

- Optimized workflow context loading to eliminate redundant file reads, reducing token usage by ~5,000-10,000 tokens per workflow execution

## [1.14.0](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.14.0) - 2026-02-08

### Added

- Context-optimizing parsing commands in gsd-tools (`phase-plan-index`, `state-snapshot`, `summary-extract`) — reduces agent context usage by returning structured JSON instead of raw file content

### Fixed

- Installer no longer deletes opencode.json on JSONC parse errors — now handles comments, trailing commas, and BOM correctly (#474)

## [1.13.0](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.13.0) - 2026-02-08

### Added

- `gsd-tools history-digest` — Compiles phase summaries into structured JSON for faster context loading
- `gsd-tools phases list` — Lists phase directories with filtering (replaces fragile `ls | sort -V` patterns)
- `gsd-tools roadmap get-phase` — Extracts phase sections from ROADMAP.md
- `gsd-tools phase next-decimal` — Calculates next decimal phase number for insert operations
- `gsd-tools state get/patch` — Atomic STATE.md field operations
- `gsd-tools template select` — Chooses summary template based on plan complexity
- Summary template variants: minimal (~~30 lines), standard (~~60 lines), complex (~100 lines)
- Test infrastructure with 22 tests covering new commands

### Changed

- Planner uses two-step context assembly: digest for selection, full SUMMARY for understanding
- Agents migrated from bash patterns to structured gsd-tools commands
- Nested YAML frontmatter parsing now handles `dependency-graph.provides`, `tech-stack.added` correctly

## [1.12.1](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.12.1) - 2026-02-08

### Changed

- Consolidated workflow initialization into compound `init` commands, reducing token usage and improving startup performance
- Updated 24 workflow and agent files to use single-call context gathering instead of multiple atomic calls

## [1.12.0](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.12.0) - 2026-02-07

### Changed

- **Architecture: Thin orchestrator pattern** — Commands now delegate to workflows, reducing command file size by ~75% and improving maintainability
- **Centralized utilities** — New `gsd-tools.cjs` (11 functions) replaces repetitive bash patterns across 50+ files
- **Token reduction** — ~22k characters removed from affected command/workflow/agent files
- **Condensed agent prompts** — Same behavior with fewer words (executor, planner, verifier, researcher agents)

### Added

- `gsd-tools.cjs` CLI utility with functions: state load/update, resolve-model, find-phase, commit, verify-summary, generate-slug, current-timestamp, list-todos, verify-path-exists, config-ensure-section

## [1.11.2](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.11.2) - 2026-02-05

### Added

- Security section in README with Claude Code deny rules for sensitive files

### Changed

- Install respects `attribution.commit` setting for OpenCode compatibility (#286)

### Fixed

- **CRITICAL:** Prevent API keys from being committed via `/gsd:map-codebase` (#429)
- Enforce context fidelity in planning pipeline - agents now honor CONTEXT.md decisions (#326, #216, #206)
- Executor verifies task completion to prevent hallucinated success (#315)
- Auto-create `config.json` when missing during `/gsd:settings` (#264)
- `/gsd:update` respects local vs global install location
- Researcher writes RESEARCH.md regardless of `commit_docs` setting
- Statusline crash handling, color validation, git staging rules
- Statusline.js reference updated during install (#330)
- Parallelization config setting now respected (#379)
- ASCII box-drawing vs text content with diacritics (#289)
- Removed broken gsd-gemini link (404)

## [1.11.1](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.11.0) - 2026-01-31

### Added

- Git branching strategy configuration with three options:
  - `none` (default): commit to current branch
  - `phase`: create branch per phase (`gsd/phase-{N}-{slug}`)
  - `milestone`: create branch per milestone (`gsd/{version}-{slug}`)
- Squash merge option at milestone completion (recommended) with merge-with-history alternative
- Context compliance verification dimension in plan checker — flags if plans contradict user decisions

### Fixed

- CONTEXT.md from `/gsd:discuss-phase` now properly flows to all downstream agents (researcher, planner, checker, revision loop)

## [1.10.1](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.10.1) - 2025-01-30

### Fixed

- Gemini CLI agent loading errors that prevented commands from executing

## [1.10.0](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.10.0) - 2026-01-29

### Added

- Native Gemini CLI support — install with `--gemini` flag or select from interactive menu
- New `--all` flag to install for Claude Code, OpenCode, and Gemini simultaneously

### Fixed

- Context bar now shows 100% at actual 80% limit (was scaling incorrectly)

## [1.9.12](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.9.12) - 2025-01-23

### Removed

- `/gsd:whats-new` command — use `/gsd:update` instead (shows changelog with cancel option)

### Fixed

- Restored auto-release GitHub Actions workflow

## [1.9.11](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.9.11) - 2026-01-23

### Changed

- Switched to manual npm publish workflow (removed GitHub Actions CI/CD)

### Fixed

- Discord badge now uses static format for reliable rendering

## [1.9.10](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.9.10) - 2026-01-23

### Added

- Discord community link shown in installer completion message

## [1.9.9](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.9.9) - 2026-01-23

### Added

- `/gsd:join-discord` command to quickly access the GSD Discord community invite link

## [1.9.8](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.9.8) - 2025-01-22

### Added

- Uninstall flag (`--uninstall`) to cleanly remove GSD from global or local installations

### Fixed

- Context file detection now matches filename variants (handles both `CONTEXT.md` and `{phase}-CONTEXT.md` patterns)

## [1.9.7](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.9.7) - 2026-01-22

### Fixed

- OpenCode installer now uses correct XDG-compliant config path (`~/.config/opencode/`) instead of `~/.opencode/`
- OpenCode commands use flat structure (`command/gsd-help.md`) matching OpenCode's expected format
- OpenCode permissions written to `~/.config/opencode/opencode.json`

## [1.9.6](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.9.6) - 2026-01-22

### Added

- Interactive runtime selection: installer now prompts to choose Claude Code, OpenCode, or both
- Native OpenCode support: `--opencode` flag converts GSD to OpenCode format automatically
- `--both` flag to install for both Claude Code and OpenCode in one command
- Auto-configures `~/.opencode.json` permissions for seamless GSD doc access

### Changed

- Installation flow now asks for runtime first, then location
- Updated README with new installation options

## [1.9.5](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.9.5) - 2025-01-22

### Fixed

- Subagents can now access MCP tools (Context7, etc.) - workaround for Claude Code bug #13898
- Installer: Escape/Ctrl+C now cancels instead of installing globally
- Installer: Fixed hook paths on Windows
- Removed stray backticks in `/gsd:new-project` output

### Changed

- Condensed verbose documentation in templates and workflows (-170 lines)
- Added CI/CD automation for releases

## [1.9.4](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.9.4) - 2026-01-21

### Changed

- Checkpoint automation now enforces automation-first principle: Claude starts servers, handles CLI installs, and fixes setup failures before presenting checkpoints to users
- Added server lifecycle protocol (port conflict handling, background process management)
- Added CLI auto-installation handling with safe-to-install matrix
- Added pre-checkpoint failure recovery (fix broken environment before asking user to verify)
- DRY refactor: checkpoints.md is now single source of truth for automation patterns

## [1.9.2](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.9.2) - 2025-01-21

### Removed

- **Codebase Intelligence System** — Removed due to overengineering concerns
  - Deleted `/gsd:analyze-codebase` command
  - Deleted `/gsd:query-intel` command
  - Removed SQLite graph database and sql.js dependency (21MB)
  - Removed intel hooks (gsd-intel-index.js, gsd-intel-session.js, gsd-intel-prune.js)
  - Removed entity file generation and templates

### Fixed

- new-project now properly includes model_profile in config

## [1.9.0](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.9.0) - 2025-01-20

### Added

- **Model Profiles** — `/gsd:set-profile` for quality/balanced/budget agent configurations
- **Workflow Settings** — `/gsd:settings` command for toggling workflow behaviors interactively

### Fixed

- Orchestrators now inline file contents in Task prompts (fixes context issues with @ references)
- Tech debt from milestone audit addressed
- All hooks now use `gsd-` prefix for consistency (statusline.js → gsd-statusline.js)

## [1.8.0](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.8.0) - 2026-01-19

### Added

- Uncommitted planning mode: Keep `.planning/` local-only (not committed to git) via `planning.commit_docs: false` in config.json. Useful for OSS contributions, client work, or privacy preferences.
- `/gsd:new-project` now asks about git tracking during initial setup, letting you opt out of committing planning docs from the start

## [1.7.1](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.7.1) - 2026-01-19

### Fixed

- Quick task PLAN and SUMMARY files now use numbered prefix (`001-PLAN.md`, `001-SUMMARY.md`) matching regular phase naming convention

## [1.7.0](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.7.0) - 2026-01-19

### Added

- **Quick Mode** (`/gsd:quick`) — Execute small, ad-hoc tasks with GSD guarantees but skip optional agents (researcher, checker, verifier). Quick tasks live in `.planning/quick/` with their own tracking in STATE.md.

### Changed

- Improved progress bar calculation to clamp values within 0-100 range
- Updated documentation with comprehensive Quick Mode sections in help.md, README.md, and GSD-STYLE.md

### Fixed

- Console window flash on Windows when running hooks
- Empty `--config-dir` value validation
- Consistent `allowed-tools` YAML format across agents
- Corrected agent name in research-phase heading
- Removed hardcoded 2025 year from search query examples
- Removed dead gsd-researcher agent references
- Integrated unused reference files into documentation

### Housekeeping

- Added homepage and bugs fields to package.json

## [1.6.4](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.6.4) - 2026-01-17

### Fixed

- Installation on WSL2/non-TTY terminals now works correctly - detects non-interactive stdin and falls back to global install automatically
- Installation now verifies files were actually copied before showing success checkmarks
- Orphaned `gsd-notify.sh` hook from previous versions is now automatically removed during install (both file and settings.json registration)

## [1.6.3](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.6.3) - 2025-01-17

### Added

- `--gaps-only` flag for `/gsd:execute-phase` — executes only gap closure plans after verify-work finds issues, eliminating redundant state discovery

## [1.6.2](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.6.2) - 2025-01-17

### Changed

- README restructured with clearer 6-step workflow: init → discuss → plan → execute → verify → complete
- Discuss-phase and verify-work now emphasized as critical steps in core workflow documentation
- "Subagent Execution" section replaced with "Multi-Agent Orchestration" explaining thin orchestrator pattern and 30-40% context efficiency
- Brownfield instructions consolidated into callout at top of "How It Works" instead of separate section
- Phase directories now created at discuss/plan-phase instead of during roadmap creation

## [1.6.1](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.6.1) - 2025-01-17

### Changed

- Installer performs clean install of GSD folders, removing orphaned files from previous versions
- `/gsd:update` shows changelog and asks for confirmation before updating, with clear warning about what gets replaced

## [1.6.0](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.6.0) - 2026-01-17

### Changed

- **BREAKING:** Unified `/gsd:new-milestone` flow — now mirrors `/gsd:new-project` with questioning → research → requirements → roadmap in a single command
- Roadmapper agent now references templates instead of inline structures for easier maintenance

### Removed

- **BREAKING:** `/gsd:discuss-milestone` — consolidated into `/gsd:new-milestone`
- **BREAKING:** `/gsd:create-roadmap` — integrated into project/milestone flows
- **BREAKING:** `/gsd:define-requirements` — integrated into project/milestone flows
- **BREAKING:** `/gsd:research-project` — integrated into project/milestone flows

### Added

- `/gsd:verify-work` now includes next-step routing after verification completes

## [1.5.30](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.30) - 2026-01-17

### Fixed

- Output templates in `plan-phase`, `execute-phase`, and `audit-milestone` now render markdown correctly instead of showing literal backticks
- Next-step suggestions now consistently recommend `/gsd:discuss-phase` before `/gsd:plan-phase` across all routing paths

## [1.5.29](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.29) - 2025-01-16

### Changed

- Discuss-phase now uses domain-aware questioning with deeper probing for gray areas

### Fixed

- Windows hooks now work via Node.js conversion (statusline, update-check)
- Phase input normalization at command entry points
- Removed blocking notification popups (gsd-notify) on all platforms

## [1.5.28](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.28) - 2026-01-16

### Changed

- Consolidated milestone workflow into single command
- Merged domain expertise skills into agent configurations
- **BREAKING:** Removed `/gsd:execute-plan` command (use `/gsd:execute-phase` instead)

### Fixed

- Phase directory matching now handles both zero-padded (05-*) and unpadded (5-*) folder names
- Map-codebase agent output collection

## [1.5.27](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.27) - 2026-01-16

### Fixed

- Orchestrator corrections between executor completions are now committed (previously left uncommitted when orchestrator made small fixes between waves)

## [1.5.26](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.26) - 2026-01-16

### Fixed

- Revised plans now get committed after checker feedback (previously only initial plans were committed, leaving revisions uncommitted)

## [1.5.25](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.25) - 2026-01-16

### Fixed

- Stop notification hook no longer shows stale project state (now uses session-scoped todos only)
- Researcher agent now reliably loads CONTEXT.md from discuss-phase

## [1.5.24](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.24) - 2026-01-16

### Fixed

- Stop notification hook now correctly parses STATE.md fields (was always showing "Ready for input")
- Planner agent now reliably loads CONTEXT.md and RESEARCH.md files

## [1.5.23](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.23) - 2025-01-16

### Added

- Cross-platform completion notification hook (Mac/Linux/Windows alerts when Claude stops)
- Phase researcher now loads CONTEXT.md from discuss-phase to focus research on user decisions

### Fixed

- Consistent zero-padding for phase directories (01-name, not 1-name)
- Plan file naming: `{phase}-{plan}-PLAN.md` pattern restored across all agents
- Double-path bug in researcher git add command
- Removed `/gsd:research-phase` from next-step suggestions (use `/gsd:plan-phase` instead)

## [1.5.22](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.22) - 2025-01-16

### Added

- Statusline update indicator — shows `⬆ /gsd:update` when a new version is available

### Fixed

- Planner now updates ROADMAP.md placeholders after planning completes

## [1.5.21](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.21) - 2026-01-16

### Added

- GSD brand system for consistent UI (checkpoint boxes, stage banners, status symbols)
- Research synthesizer agent that consolidates parallel research into SUMMARY.md

### Changed

- **Unified `/gsd:new-project` flow** — Single command now handles questions → research → requirements → roadmap (~10 min)
- Simplified README to reflect streamlined workflow: new-project → plan-phase → execute-phase
- Added optional `/gsd:discuss-phase` documentation for UI/UX/behavior decisions before planning

### Fixed

- verify-work now shows clear checkpoint box with action prompt ("Type 'pass' or describe what's wrong")
- Planner uses correct `{phase}-{plan}-PLAN.md` naming convention
- Planner no longer surfaces internal `user_setup` in output
- Research synthesizer commits all research files together (not individually)
- Project researcher agent can no longer commit (orchestrator handles commits)
- Roadmap requires explicit user approval before committing

## [1.5.20](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.20) - 2026-01-16

### Fixed

- Research no longer skipped based on premature "Research: Unlikely" predictions made during roadmap creation. The `--skip-research` flag provides explicit control when needed.

### Removed

- `Research: Likely/Unlikely` fields from roadmap phase template
- `detect_research_needs` step from roadmap creation workflow
- Roadmap-based research skip logic from planner agent

## [1.5.19](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.19) - 2026-01-16

### Changed

- `/gsd:discuss-phase` redesigned with intelligent gray area analysis — analyzes phase to identify discussable areas (UI, UX, Behavior, etc.), presents multi-select for user control, deep-dives each area with focused questioning
- Explicit scope guardrail prevents scope creep during discussion — captures deferred ideas without acting on them
- CONTEXT.md template restructured for decisions (domain boundary, decisions by category, Claude's discretion, deferred ideas)
- Downstream awareness: discuss-phase now explicitly documents that CONTEXT.md feeds researcher and planner agents
- `/gsd:plan-phase` now integrates research — spawns `gsd-phase-researcher` before planning unless research exists or `--skip-research` flag used

## [1.5.18](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.18) - 2026-01-16

### Added

- **Plan verification loop** — Plans are now verified before execution with a planner → checker → revise cycle
  - New `gsd-plan-checker` agent (744 lines) validates plans will achieve phase goals
  - Six verification dimensions: requirement coverage, task completeness, dependency correctness, key links, scope sanity, must_haves derivation
  - Max 3 revision iterations before user escalation
  - `--skip-verify` flag for experienced users who want to bypass verification
- **Dedicated planner agent** — `gsd-planner` (1,319 lines) consolidates all planning expertise
  - Complete methodology: discovery levels, task breakdown, dependency graphs, scope estimation, goal-backward analysis
  - Revision mode for handling checker feedback
  - TDD integration and checkpoint patterns
- **Statusline integration** — Context usage, model, and current task display

### Changed

- `/gsd:plan-phase` refactored to thin orchestrator pattern (310 lines)
  - Spawns `gsd-planner` for planning, `gsd-plan-checker` for verification
  - User sees status between agent spawns (not a black box)
- Planning references deprecated with redirects to `gsd-planner` agent sections
  - `plan-format.md`, `scope-estimation.md`, `goal-backward.md`, `principles.md`
  - `workflows/plan-phase.md`

### Fixed

- Removed zombie `gsd-milestone-auditor` agent (was accidentally re-added after correct deletion)

### Removed

- Phase 99 throwaway test files

## [1.5.17](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.17) - 2026-01-15

### Added

- New `/gsd:update` command — check for updates, install, and display changelog of what changed (better UX than raw `npx get-shit-done-cc`)

## [1.5.16](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.16) - 2026-01-15

### Added

- New `gsd-researcher` agent (915 lines) with comprehensive research methodology, 4 research modes (ecosystem, feasibility, implementation, comparison), source hierarchy, and verification protocols
- New `gsd-debugger` agent (990 lines) with scientific debugging methodology, hypothesis testing, and 7+ investigation techniques
- New `gsd-codebase-mapper` agent for brownfield codebase analysis
- Research subagent prompt template for context-only spawning

### Changed

- `/gsd:research-phase` refactored to thin orchestrator — now injects rich context (key insight framing, downstream consumer info, quality gates) to gsd-researcher agent
- `/gsd:research-project` refactored to spawn 4 parallel gsd-researcher agents with milestone-aware context (greenfield vs v1.1+) and roadmap implications guidance
- `/gsd:debug` refactored to thin orchestrator (149 lines) — spawns gsd-debugger agent with full debugging expertise
- `/gsd:new-milestone` now explicitly references MILESTONE-CONTEXT.md

### Deprecated

- `workflows/research-phase.md` — consolidated into gsd-researcher agent
- `workflows/research-project.md` — consolidated into gsd-researcher agent
- `workflows/debug.md` — consolidated into gsd-debugger agent
- `references/research-pitfalls.md` — consolidated into gsd-researcher agent
- `references/debugging.md` — consolidated into gsd-debugger agent
- `references/debug-investigation.md` — consolidated into gsd-debugger agent

## [1.5.15](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.15) - 2025-01-15

### Fixed

- **Agents now install correctly** — The `agents/` folder (gsd-executor, gsd-verifier, gsd-integration-checker, gsd-milestone-auditor) was missing from npm package, now included

### Changed

- Consolidated `/gsd:plan-fix` into `/gsd:plan-phase --gaps` for simpler workflow
- UAT file writes now batched instead of per-response for better performance

## [1.5.14](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.14) - 2025-01-15

### Fixed

- Plan-phase now always routes to `/gsd:execute-phase` after planning, even for single-plan phases

## [1.5.13](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.13) - 2026-01-15

### Fixed

- `/gsd:new-milestone` now presents research and requirements paths as equal options, matching `/gsd:new-project` format

## [1.5.12](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.12) - 2025-01-15

### Changed

- **Milestone cycle reworked for proper requirements flow:**
  - `complete-milestone` now archives AND deletes ROADMAP.md and REQUIREMENTS.md (fresh for next milestone)
  - `new-milestone` is now a "brownfield new-project" — updates PROJECT.md with new goals, routes to define-requirements
  - `discuss-milestone` is now required before `new-milestone` (creates context file)
  - `research-project` is milestone-aware — focuses on new features, ignores already-validated requirements
  - `create-roadmap` continues phase numbering from previous milestone
  - Flow: complete → discuss → new-milestone → research → requirements → roadmap

### Fixed

- `MILESTONE-AUDIT.md` now versioned as `v{version}-MILESTONE-AUDIT.md` and archived on completion
- `progress` now correctly routes to `/gsd:discuss-milestone` when between milestones (Route F)

## [1.5.11](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.11) - 2025-01-15

### Changed

- Verifier reuses previous must-haves on re-verification instead of re-deriving, focuses deep verification on failed items with quick regression checks on passed items

## [1.5.10](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.10) - 2025-01-15

### Changed

- Milestone audit now reads existing phase VERIFICATION.md files instead of re-verifying each phase, aggregates tech debt and deferred gaps, adds `tech_debt` status for non-blocking accumulated debt

### Fixed

- VERIFICATION.md now included in phase completion commit alongside ROADMAP.md, STATE.md, and REQUIREMENTS.md

## [1.5.9](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.9) - 2025-01-15

### Added

- Milestone audit system (`/gsd:audit-milestone`) for verifying milestone completion with parallel verification agents

### Changed

- Checkpoint display format improved with box headers and unmissable "→ YOUR ACTION:" prompts
- Subagent colors updated (executor: yellow, integration-checker: blue)
- Execute-phase now recommends `/gsd:audit-milestone` when milestone completes

### Fixed

- Research-phase no longer gatekeeps by domain type

### Removed

- Domain expertise feature (`~/.claude/skills/expertise/`) - was personal tooling not available to other users

## [1.5.8](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.8) - 2025-01-15

### Added

- Verification loop: When gaps are found, verifier generates fix plans that execute automatically before re-verifying

### Changed

- `gsd-executor` subagent color changed from red to blue

## [1.5.7](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.7) - 2025-01-15

### Added

- `gsd-executor` subagent: Dedicated agent for plan execution with full workflow logic built-in
- `gsd-verifier` subagent: Goal-backward verification that checks if phase goals are actually achieved (not just tasks completed)
- Phase verification: Automatic verification runs when a phase completes to catch stubs and incomplete implementations
- Goal-backward planning reference: Documentation for deriving must-haves from goals

### Changed

- execute-plan and execute-phase now spawn `gsd-executor` subagent instead of using inline workflow
- Roadmap and planning workflows enhanced with goal-backward analysis

### Removed

- Obsolete templates (`checkpoint-resume.md`, `subagent-task-prompt.md`) — logic now lives in subagents

### Fixed

- Updated remaining `general-purpose` subagent references to use `gsd-executor`

## [1.5.6](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.6) - 2025-01-15

### Changed

- README: Separated flow into distinct steps (1 → 1.5 → 2 → 3 → 4 → 5) making `research-project` clearly optional and `define-requirements` required
- README: Research recommended for quality; skip only for speed

### Fixed

- execute-phase: Phase metadata (timing, wave info) now bundled into single commit instead of separate commits

## [1.5.5](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.5) - 2025-01-15

### Changed

- README now documents the `research-project` → `define-requirements` flow (optional but recommended before `create-roadmap`)
- Commands section reorganized into 7 grouped tables (Setup, Execution, Verification, Milestones, Phase Management, Session, Utilities) for easier scanning
- Context Engineering table now includes `research/` and `REQUIREMENTS.md`

## [1.5.4](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.4) - 2025-01-15

### Changed

- Research phase now loads REQUIREMENTS.md to focus research on concrete requirements (e.g., "email verification") rather than just high-level roadmap descriptions

## [1.5.3](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.3) - 2025-01-15

### Changed

- **execute-phase narration**: Orchestrator now describes what each wave builds before spawning agents, and summarizes what was built after completion. No more staring at opaque status updates.
- **new-project flow**: Now offers two paths — research first (recommended) or define requirements directly (fast path for familiar domains)
- **define-requirements**: Works without prior research. Gathers requirements through conversation when FEATURES.md doesn't exist.

### Removed

- Dead `/gsd:status` command (referenced abandoned background agent model)
- Unused `agent-history.md` template
- `_archive/` directory with old execute-phase version

## [1.5.2](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.2) - 2026-01-15

### Added

- Requirements traceability: roadmap phases now include `Requirements:` field listing which REQ-IDs they cover
- plan-phase loads REQUIREMENTS.md and shows phase-specific requirements before planning
- Requirements automatically marked Complete when phase finishes

### Changed

- Workflow preferences (mode, depth, parallelization) now asked in single prompt instead of 3 separate questions
- define-requirements shows full requirements list inline before commit (not just counts)
- Research-project and workflow aligned to both point to define-requirements as next step

### Fixed

- Requirements status now updated by orchestrator (commands) instead of subagent workflow, which couldn't determine phase completion

## [1.5.1](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.1) - 2026-01-14

### Changed

- Research agents write their own files directly (STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md) instead of returning results to orchestrator
- Slimmed principles.md and load it dynamically in core commands

## [1.5.0](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.0) - 2026-01-14

### Added

- New `/gsd:research-project` command for pre-roadmap ecosystem research — spawns parallel agents to investigate stack, features, architecture, and pitfalls before you commit to a roadmap
- New `/gsd:define-requirements` command for scoping v1 requirements from research findings — transforms "what exists in this domain" into "what we're building"
- Requirements traceability: phases now map to specific requirement IDs with 100% coverage validation

### Changed

- **BREAKING:** New project flow is now: `new-project → research-project → define-requirements → create-roadmap`
- Roadmap creation now requires REQUIREMENTS.md and validates all v1 requirements are mapped to phases
- Simplified questioning in new-project to four essentials (vision, core priority, boundaries, constraints)

## [1.4.29](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.29) - 2026-01-14

### Removed

- Deleted obsolete `_archive/execute-phase.md` and `status.md` commands

## [1.4.28](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.28) - 2026-01-14

### Fixed

- Restored comprehensive checkpoint documentation with full examples for verification, decisions, and auth gates
- Fixed execute-plan command to use fresh continuation agents instead of broken resume pattern
- Rich checkpoint presentation formats now documented for all three checkpoint types

### Changed

- Slimmed execute-phase command to properly delegate checkpoint handling to workflow

## [1.4.27](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.27) - 2025-01-14

### Fixed

- Restored "what to do next" commands after plan/phase execution completes — orchestrator pattern conversion had inadvertently removed the copy/paste-ready next-step routing

## [1.4.26](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.26) - 2026-01-14

### Added

- Full changelog history backfilled from git (66 historical versions from 1.0.0 to 1.4.23)

## [1.4.25](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.25) - 2026-01-14

### Added

- New `/gsd:whats-new` command shows changes since your installed version
- VERSION file written during installation for version tracking
- CHANGELOG.md now included in package installation

## [1.4.24](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.24) - 2026-01-14

### Added

- USER-SETUP.md template for external service configuration

### Removed

- **BREAKING:** ISSUES.md system (replaced by phase-scoped UAT issues and TODOs)

## [1.4.23](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.23) - 2026-01-14

### Changed

- Removed dead ISSUES.md system code

## [1.4.22](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.22) - 2026-01-14

### Added

- Subagent isolation for debug investigations with checkpoint support

### Fixed

- DEBUG_DIR path constant to prevent typos in debug workflow

## [1.4.21](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.21) - 2026-01-14

### Fixed

- SlashCommand tool added to plan-fix allowed-tools

## [1.4.20](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.20) - 2026-01-14

### Fixed

- Standardized debug file naming convention
- Debug workflow now invokes execute-plan correctly

## [1.4.19](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.19) - 2026-01-14

### Fixed

- Auto-diagnose issues instead of offering choice in plan-fix

## [1.4.18](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.18) - 2026-01-14

### Added

- Parallel diagnosis before plan-fix execution

## [1.4.17](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.17) - 2026-01-14

### Changed

- Redesigned verify-work as conversational UAT with persistent state

## [1.4.16](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.16) - 2026-01-13

### Added

- Pre-execution summary for interactive mode in execute-plan
- Pre-computed wave numbers at plan time

## [1.4.15](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.15) - 2026-01-13

### Added

- Context rot explanation to README header

## [1.4.14](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.14) - 2026-01-13

### Changed

- YOLO mode is now recommended default in new-project

## [1.4.13](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.13) - 2026-01-13

### Fixed

- Brownfield flow documentation
- Removed deprecated resume-task references

## [1.4.12](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.12) - 2026-01-13

### Changed

- execute-phase is now recommended as primary execution command

## [1.4.11](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.11) - 2026-01-13

### Fixed

- Checkpoints now use fresh continuation agents instead of resume

## [1.4.10](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.10) - 2026-01-13

### Changed

- execute-plan converted to orchestrator pattern for performance

## [1.4.9](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.9) - 2026-01-13

### Changed

- Removed subagent-only context from execute-phase orchestrator

### Fixed

- Removed "what's out of scope" question from discuss-phase

## [1.4.8](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.8) - 2026-01-13

### Added

- TDD reasoning explanation restored to plan-phase docs

## [1.4.7](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.7) - 2026-01-13

### Added

- Project state loading before execution in execute-phase

### Fixed

- Parallel execution marked as recommended, not experimental

## [1.4.6](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.6) - 2026-01-13

### Added

- Checkpoint pause/resume for spawned agents
- Deviation rules, commit rules, and workflow references to execute-phase

## [1.4.5](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.5) - 2026-01-13

### Added

- Parallel-first planning with dependency graphs
- Checkpoint-resume capability for long-running phases
- `.claude/rules/` directory for auto-loaded contribution rules

### Changed

- execute-phase uses wave-based blocking execution

## [1.4.4](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.4) - 2026-01-13

### Fixed

- Inline listing for multiple active debug sessions

## [1.4.3](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.3) - 2026-01-13

### Added

- `/gsd:debug` command for systematic debugging with persistent state

## [1.4.2](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.2) - 2026-01-13

### Fixed

- Installation verification step clarification

## [1.4.1](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.1) - 2026-01-13

### Added

- Parallel phase execution via `/gsd:execute-phase`
- Parallel-aware planning in `/gsd:plan-phase`
- `/gsd:status` command for parallel agent monitoring
- Parallelization configuration in config.json
- Wave-based parallel execution with dependency graphs

### Changed

- Renamed `execute-phase.md` workflow to `execute-plan.md` for clarity
- Plan frontmatter now includes `wave`, `depends_on`, `files_modified`, `autonomous`

## [1.4.0](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.0) - 2026-01-12

### Added

- Full parallel phase execution system
- Parallelization frontmatter in plan templates
- Dependency analysis for parallel task scheduling
- Agent history schema v1.2 with parallel execution support

### Changed

- Plans can now specify wave numbers and dependencies
- execute-phase orchestrates multiple subagents in waves

## [1.3.34](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.34) - 2026-01-11

### Added

- `/gsd:add-todo` and `/gsd:check-todos` for mid-session idea capture

## [1.3.33](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.33) - 2026-01-11

### Fixed

- Consistent zero-padding for decimal phase numbers (e.g., 01.1)

### Changed

- Removed obsolete .claude-plugin directory

## [1.3.32](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.32) - 2026-01-10

### Added

- `/gsd:resume-task` for resuming interrupted subagent executions

## [1.3.31](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.31) - 2026-01-08

### Added

- Planning principles for security, performance, and observability
- Pro patterns section in README

## [1.3.30](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.30) - 2026-01-08

### Added

- verify-work option surfaces after plan execution

## [1.3.29](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.29) - 2026-01-08

### Added

- `/gsd:verify-work` for conversational UAT validation
- `/gsd:plan-fix` for fixing UAT issues
- UAT issues template

## [1.3.28](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.28) - 2026-01-07

### Added

- `--config-dir` CLI argument for multi-account setups
- `/gsd:remove-phase` command

### Fixed

- Validation for --config-dir edge cases

## [1.3.27](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.27) - 2026-01-07

### Added

- Recommended permissions mode documentation

### Fixed

- Mandatory verification enforced before phase/milestone completion routing

## [1.3.26](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.26) - 2026-01-06

### Added

- Claude Code marketplace plugin support

### Fixed

- Phase artifacts now committed when created

## [1.3.25](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.25) - 2026-01-06

### Fixed

- Milestone discussion context persists across /clear

## [1.3.24](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.24) - 2026-01-06

### Added

- `CLAUDE_CONFIG_DIR` environment variable support

## [1.3.23](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.23) - 2026-01-06

### Added

- Non-interactive install flags (`--global`, `--local`) for Docker/CI

## [1.3.22](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.22) - 2026-01-05

### Changed

- Removed unused auto.md command

## [1.3.21](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.21) - 2026-01-05

### Changed

- TDD features use dedicated plans for full context quality

## [1.3.20](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.20) - 2026-01-05

### Added

- Per-task atomic commits for better AI observability

## [1.3.19](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.19) - 2026-01-05

### Fixed

- Clarified create-milestone.md file locations with explicit instructions

## [1.3.18](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.18) - 2026-01-05

### Added

- YAML frontmatter schema with dependency graph metadata
- Intelligent context assembly via frontmatter dependency graph

## [1.3.17](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.17) - 2026-01-04

### Fixed

- Clarified depth controls compression, not inflation in planning

## [1.3.16](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.16) - 2026-01-04

### Added

- Depth parameter for planning thoroughness (`--depth=1-5`)

## [1.3.15](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.15) - 2026-01-01

### Fixed

- TDD reference loaded directly in commands

## [1.3.14](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.14) - 2025-12-31

### Added

- TDD integration with detection, annotation, and execution flow

## [1.3.13](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.13) - 2025-12-29

### Fixed

- Restored deterministic bash commands
- Removed redundant decision_gate

## [1.3.12](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.12) - 2025-12-29

### Fixed

- Restored plan-format.md as output template

## [1.3.11](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.11) - 2025-12-29

### Changed

- 70% context reduction for plan-phase workflow
- Merged CLI automation into checkpoints
- Compressed scope-estimation (74% reduction) and plan-phase.md (66% reduction)

## [1.3.10](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.10) - 2025-12-29

### Fixed

- Explicit plan count check in offer_next step

## [1.3.9](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.9) - 2025-12-27

### Added

- Evolutionary PROJECT.md system with incremental updates

## [1.3.8](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.8) - 2025-12-18

### Added

- Brownfield/existing projects section in README

## [1.3.7](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.7) - 2025-12-18

### Fixed

- Improved incremental codebase map updates

## [1.3.6](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.6) - 2025-12-18

### Added

- File paths included in codebase mapping output

## [1.3.5](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.5) - 2025-12-17

### Fixed

- Removed arbitrary 100-line limit from codebase mapping

## [1.3.4](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.4) - 2025-12-17

### Fixed

- Inline code for Next Up commands (avoids nesting ambiguity)

## [1.3.3](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.3) - 2025-12-17

### Fixed

- Check PROJECT.md not .planning/ directory for existing project detection

## [1.3.2](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.2) - 2025-12-17

### Added

- Git commit step to map-codebase workflow

## [1.3.1](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.1) - 2025-12-17

### Added

- `/gsd:map-codebase` documentation in help and README

## [1.3.0](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.0) - 2025-12-17

### Added

- `/gsd:map-codebase` command for brownfield project analysis
- Codebase map templates (stack, architecture, structure, conventions, testing, integrations, concerns)
- Parallel Explore agent orchestration for codebase analysis
- Brownfield integration into GSD workflows

### Changed

- Improved continuation UI with context and visual hierarchy

### Fixed

- Permission errors for non-DSP users (removed shell context)
- First question is now freeform, not AskUserQuestion

## [1.2.13](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.2.13) - 2025-12-17

### Added

- Improved continuation UI with context and visual hierarchy

## [1.2.12](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.2.12) - 2025-12-17

### Fixed

- First question should be freeform, not AskUserQuestion

## [1.2.11](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.2.11) - 2025-12-17

### Fixed

- Permission errors for non-DSP users (removed shell context)

## [1.2.10](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.2.10) - 2025-12-16

### Fixed

- Inline command invocation replaced with clear-then-paste pattern

## [1.2.9](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.2.9) - 2025-12-16

### Fixed

- Git init runs in current directory

## [1.2.8](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.2.8) - 2025-12-16

### Changed

- Phase count derived from work scope, not arbitrary limits

## [1.2.7](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.2.7) - 2025-12-16

### Fixed

- AskUserQuestion mandated for all exploration questions

## [1.2.6](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.2.6) - 2025-12-16

### Changed

- Internal refactoring

## [1.2.5](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.2.5) - 2025-12-16

### Changed

- `<if mode>` tags for yolo/interactive branching

## [1.2.4](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.2.4) - 2025-12-16

### Fixed

- Stale CONTEXT.md references updated to new vision structure

## [1.2.3](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.2.3) - 2025-12-16

### Fixed

- Enterprise language removed from help and discuss-milestone

## [1.2.2](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.2.2) - 2025-12-16

### Fixed

- new-project completion presented inline instead of as question

## [1.2.1](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.2.1) - 2025-12-16

### Fixed

- AskUserQuestion restored for decision gate in questioning flow

## [1.2.0](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.2.0) - 2025-12-15

### Changed

- Research workflow implemented as Claude Code context injection

## [1.1.2](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.1.2) - 2025-12-15

### Fixed

- YOLO mode now skips confirmation gates in plan-phase

## [1.1.1](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.1.1) - 2025-12-15

### Added

- README documentation for new research workflow

## [1.1.0](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.1.0) - 2025-12-15

### Added

- Pre-roadmap research workflow
- `/gsd:research-phase` for niche domain ecosystem discovery
- `/gsd:research-project` command with workflow and templates
- `/gsd:create-roadmap` command with research-aware workflow
- Research subagent prompt templates

### Changed

- new-project split to only create PROJECT.md + config.json
- Questioning rewritten as thinking partner, not interviewer

## [1.0.11](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.0.11) - 2025-12-15

### Added

- `/gsd:research-phase` for niche domain ecosystem discovery

## [1.0.10](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.0.10) - 2025-12-15

### Fixed

- Scope creep prevention in discuss-phase command

## [1.0.9](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.0.9) - 2025-12-15

### Added

- Phase CONTEXT.md loaded in plan-phase command

## [1.0.8](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.0.8) - 2025-12-15

### Changed

- PLAN.md included in phase completion commits

## [1.0.7](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.0.7) - 2025-12-15

### Added

- Path replacement for local installs

## [1.0.6](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.0.6) - 2025-12-15

### Changed

- Internal improvements

## [1.0.5](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.0.5) - 2025-12-15

### Added

- Global/local install prompt during setup

### Fixed

- Bin path fixed (removed ./)
- .DS_Store ignored

## [1.0.4](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.0.4) - 2025-12-15

### Fixed

- Bin name and circular dependency removed

## [1.0.3](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.0.3) - 2025-12-15

### Added

- TDD guidance in planning workflow

## [1.0.2](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.0.2) - 2025-12-15

### Added

- Issue triage system to prevent deferred issue pile-up

## [1.0.1](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.0.1) - 2025-12-15

### Added

- Initial npm package release

## [1.0.0](https://github.com/glittercowboy/get-shit-done/releases/tag/v1.0.0) - 2025-12-14

### Added

- Initial release of GSD (Get Shit Done) meta-prompting system
- Core slash commands: `/gsd:new-project`, `/gsd:discuss-phase`, `/gsd:plan-phase`, `/gsd:execute-phase`
- PROJECT.md and STATE.md templates
- Phase-based development workflow
- YOLO mode for autonomous execution
- Interactive mode with checkpoints

[Unreleased]: https://github.com/gsd-build/get-shit-done/compare/v1.42.1...HEAD
[1.42.1]: https://github.com/gsd-build/get-shit-done/compare/v1.41.0...v1.42.1
[1.38.4]: https://github.com/gsd-build/get-shit-done/compare/v1.38.2...v1.38.4
[1.38.2]: https://github.com/gsd-build/get-shit-done/compare/v1.37.1...v1.38.2
[1.37.1]: https://github.com/gsd-build/get-shit-done/compare/v1.37.0...v1.37.1
[1.37.0]: https://github.com/gsd-build/get-shit-done/compare/v1.36.0...v1.37.0
[1.36.0]: https://github.com/gsd-build/get-shit-done/releases/tag/v1.36.0
[1.35.0]: https://github.com/gsd-build/get-shit-done/releases/tag/v1.35.0
[1.34.2]: https://github.com/gsd-build/get-shit-done/releases/tag/v1.34.2
[1.34.1]: https://github.com/gsd-build/get-shit-done/releases/tag/v1.34.1
[1.34.0]: https://github.com/gsd-build/get-shit-done/releases/tag/v1.34.0
[1.33.0]: https://github.com/gsd-build/get-shit-done/releases/tag/v1.33.0
[1.30.0]: https://github.com/gsd-build/get-shit-done/releases/tag/v1.30.0
[1.29.0]: https://github.com/gsd-build/get-shit-done/releases/tag/v1.29.0
[1.28.0]: https://github.com/gsd-build/get-shit-done/releases/tag/v1.28.0
[1.27.0]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.27.0
[1.26.0]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.26.0
[1.25.0]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.25.0
[1.24.0]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.24.0
[1.23.0]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.23.0
[1.22.4]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.22.4
[1.22.3]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.22.3
[1.22.2]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.22.2
[1.22.1]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.22.1
[1.22.0]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.22.0
[1.21.1]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.21.1
[1.21.0]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.21.0
[1.20.6]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.20.6
[1.20.5]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.20.5
[1.20.4]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.20.4
[1.20.3]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.20.3
[1.20.2]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.20.2
[1.20.1]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.20.1
[1.20.0]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.20.0
[1.19.2]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.19.2
[1.19.1]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.19.1
[1.19.0]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.19.0
[1.18.0]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.18.0
[1.17.0]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.17.0
[1.16.0]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.16.0
[1.15.0]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.15.0
[1.14.0]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.14.0
[1.13.0]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.13.0
[1.12.1]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.12.1
[1.12.0]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.12.0
[1.11.2]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.11.2
[1.11.1]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.11.0
[1.10.1]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.10.1
[1.10.0]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.10.0
[1.9.12]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.9.12
[1.9.11]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.9.11
[1.9.10]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.9.10
[1.9.9]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.9.9
[1.9.8]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.9.8
[1.9.7]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.9.7
[1.9.6]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.9.6
[1.9.5]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.9.5
[1.9.4]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.9.4
[1.9.2]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.9.2
[1.9.0]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.9.0
[1.8.0]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.8.0
[1.7.1]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.7.1
[1.7.0]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.7.0
[1.6.4]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.6.4
[1.6.3]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.6.3
[1.6.2]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.6.2
[1.6.1]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.6.1
[1.6.0]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.6.0
[1.5.30]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.30
[1.5.29]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.29
[1.5.28]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.28
[1.5.27]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.27
[1.5.26]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.26
[1.5.25]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.25
[1.5.24]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.24
[1.5.23]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.23
[1.5.22]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.22
[1.5.21]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.21
[1.5.20]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.20
[1.5.19]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.19
[1.5.18]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.18
[1.5.17]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.17
[1.5.16]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.16
[1.5.15]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.15
[1.5.14]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.14
[1.5.13]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.13
[1.5.12]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.12
[1.5.11]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.11
[1.5.10]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.10
[1.5.9]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.9
[1.5.8]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.8
[1.5.7]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.7
[1.5.6]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.6
[1.5.5]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.5
[1.5.4]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.4
[1.5.3]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.3
[1.5.2]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.2
[1.5.1]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.1
[1.5.0]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.5.0
[1.4.29]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.29
[1.4.28]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.28
[1.4.27]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.27
[1.4.26]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.26
[1.4.25]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.25
[1.4.24]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.24
[1.4.23]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.23
[1.4.22]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.22
[1.4.21]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.21
[1.4.20]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.20
[1.4.19]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.19
[1.4.18]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.18
[1.4.17]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.17
[1.4.16]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.16
[1.4.15]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.15
[1.4.14]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.14
[1.4.13]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.13
[1.4.12]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.12
[1.4.11]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.11
[1.4.10]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.10
[1.4.9]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.9
[1.4.8]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.8
[1.4.7]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.7
[1.4.6]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.6
[1.4.5]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.5
[1.4.4]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.4
[1.4.3]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.3
[1.4.2]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.2
[1.4.1]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.1
[1.4.0]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.4.0
[1.3.34]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.34
[1.3.33]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.33
[1.3.32]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.32
[1.3.31]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.31
[1.3.30]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.30
[1.3.29]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.29
[1.3.28]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.28
[1.3.27]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.27
[1.3.26]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.26
[1.3.25]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.25
[1.3.24]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.24
[1.3.23]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.23
[1.3.22]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.22
[1.3.21]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.21
[1.3.20]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.20
[1.3.19]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.19
[1.3.18]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.18
[1.3.17]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.17
[1.3.16]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.16
[1.3.15]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.15
[1.3.14]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.14
[1.3.13]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.13
[1.3.12]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.12
[1.3.11]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.11
[1.3.10]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.10
[1.3.9]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.9
[1.3.8]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.8
[1.3.7]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.7
[1.3.6]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.6
[1.3.5]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.5
[1.3.4]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.4
[1.3.3]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.3
[1.3.2]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.2
[1.3.1]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.1
[1.3.0]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.3.0
[1.2.13]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.2.13
[1.2.12]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.2.12
[1.2.11]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.2.11
[1.2.10]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.2.10
[1.2.9]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.2.9
[1.2.8]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.2.8
[1.2.7]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.2.7
[1.2.6]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.2.6
[1.2.5]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.2.5
[1.2.4]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.2.4
[1.2.3]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.2.3
[1.2.2]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.2.2
[1.2.1]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.2.1
[1.2.0]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.2.0
[1.1.2]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.1.2
[1.1.1]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.1.1
[1.1.0]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.1.0
[1.0.11]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.0.11
[1.0.10]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.0.10
[1.0.9]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.0.9
[1.0.8]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.0.8
[1.0.7]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.0.7
[1.0.6]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.0.6
[1.0.5]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.0.5
[1.0.4]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.0.4
[1.0.3]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.0.3
[1.0.2]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.0.2
[1.0.1]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.0.1
[1.0.0]: https://github.com/glittercowboy/get-shit-done/releases/tag/v1.0.0
