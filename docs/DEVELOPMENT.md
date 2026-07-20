<!-- generated-by: gsd-doc-writer -->
# Development

Working notes for contributors actively developing on the GSD codebase. This document complements [CONTRIBUTING.md](../CONTRIBUTING.md) — it focuses on the build commands and day-to-day developer workflow. For the canonical statements on code style, testing standards, and pull-request guidelines, defer to CONTRIBUTING.md.

---

## Local Setup

Prerequisites and first-run steps are documented separately:

- **Prerequisites and first run** — see [GETTING-STARTED.md](GETTING-STARTED.md).
- **Issue-first contribution flow and PR templates** — see [CONTRIBUTING.md](../CONTRIBUTING.md).

Day-to-day development uses `pnpm` (pinned via the `packageManager` field in the root `package.json`). The root install plus an SDK build is enough to start hacking:

```bash
git clone https://github.com/LoganDark/get-shit-done.git
cd get-shit-done
pnpm install
pnpm run build:sdk     # required before tests; pretest runs this too
```

The `pretest` hook in `package.json` runs `build:sdk`, `lint:skill-deps`, and the `lint-vcs-no-commit-id` check before every `npm test`, so a fresh clone does not need a manual build step before invoking the test suite — but an explicit `build:sdk` shortens the inner loop when you only want to rerun a single test file via `node --test tests/<name>.test.cjs`.

### Workspace layout

The repository is a pnpm monorepo with a single declared workspace (see `pnpm-workspace.yaml`):

| Workspace | Path | Purpose |
|-----------|------|---------|
| `@gsd-build/sdk` | `sdk/` | TypeScript SDK — programmatic interface for running GSD plans via the Agent SDK. Builds both ESM (`dist/`) and CJS (`dist-cjs/`) outputs. |

The root package (`get-shit-done-cc`) ships the CLI surface in `bin/`, agent definitions in `agents/`, command/workflow markdown under `get-shit-done/` and `commands/`, and the test suite under `tests/`. `esbuild` and `fallow` appear in `pnpm-workspace.yaml` under `allowBuilds` / `onlyBuiltDependencies` — they are dependency packages whose install-time build scripts are permitted to run, not local workspaces.

---

## Build Commands

All commands below are run from the repository root unless otherwise noted. The full list lives in `package.json` `scripts`.

### Build

| Command | Description |
|---------|-------------|
| `pnpm run build:hooks` | Runs `scripts/build-hooks.js` to assemble hook bundles. |
| `pnpm run build:sdk` | Runs `pnpm --filter @gsd-build/sdk build` — TypeScript build for the SDK workspace (ESM `dist/` + CJS `dist-cjs/`). |
| `pnpm run prepublishOnly` | Lifecycle hook for publishing — chains `build:hooks` then `build:sdk`. |

The SDK workspace exposes its own build chain (run with `pnpm --filter @gsd-build/sdk run <script>` from the root, or via `pnpm run <script>` inside `sdk/`):

| Command | Description |
|---------|-------------|
| `build` | Full TypeScript build (`tsc` then `build:cjs`). |
| `build:esm` | ESM build only (`tsc` against `tsconfig.json`). |
| `build:cjs` | CJS build only (`tsc` against `tsconfig.cjs.json`, then writes a `dist-cjs/package.json` stamping `type: "commonjs"`). |
| `dev` | Watch-mode build of both ESM and CJS. |

### Test

| Command | Description |
|---------|-------------|
| `pnpm test` | Runs `scripts/run-tests.cjs`, which discovers every `tests/*.test.cjs` and invokes them under Node's built-in test runner (`node:test`) with `--test-concurrency=4` by default. Pretest runs `build:sdk`, `lint:skill-deps`, and `lint-vcs-no-commit-id`. |
| `pnpm run test:coverage` | Same suite under `c8` with a 70% line-coverage threshold gated on `get-shit-done/bin/lib/*.cjs`. |
| `TEST_CONCURRENCY=N pnpm test` | Override the default test concurrency (e.g., `TEST_CONCURRENCY=1` to serialize for debugging). |
| `node --test tests/<name>.test.cjs` | Run a single root test file directly — skips the pretest hook, so make sure `build:sdk` is up to date. |
| `pnpm --filter @gsd-build/sdk test` | Vitest suite for the SDK (`vitest run`). |
| `pnpm --filter @gsd-build/sdk test:unit` | SDK unit project only (`vitest run --project unit`). |
| `pnpm --filter @gsd-build/sdk test:integration` | SDK integration project only (`vitest run --project integration`). |

The root suite uses **`node:test`** and **`node:assert/strict`** — no Jest, Mocha, or external runner. The SDK workspace uses **Vitest**. See CONTRIBUTING.md "Testing Standards" for the canonical statement on which runner each suite uses and the required imports, setup/cleanup patterns, prohibited source-grep tests, and assertion conventions.

### Lint

There is no ESLint, Prettier, Biome, or `.editorconfig` configuration in this repository. Style is enforced by convention (see "Code Style" below) plus a set of project-specific lint scripts that guard architectural invariants:

| Command | Description |
|---------|-------------|
| `pnpm run lint:descriptions` | `scripts/lint-descriptions.cjs` — validates agent/command description fields. |
| `pnpm run lint:skill-deps` | `scripts/lint-skill-deps.cjs` — checks skill dependency declarations. Runs as part of `pretest`. |
| `pnpm run lint:tests` | `scripts/lint-no-source-grep.cjs` — flags source-grep tests (see CONTRIBUTING.md "Prohibited: Source-Grep Tests"). |
| `pnpm run lint:changeset` | `scripts/changeset/lint.cjs` — `Changeset Required` workflow uses the same script (see "Changeset workflow" below). |
| `pnpm run check:alias-drift` | Forwards to `pnpm --filter @gsd-build/sdk check:alias-drift`. Run before opening a PR if you touched the command manifest or generated alias artifacts. |

Additional repo-specific lint scripts are invoked from CI (`.github/workflows/test.yml`) and are runnable directly:

| Script | Description |
|--------|-------------|
| `node scripts/lint-no-source-grep.cjs` | Same as `lint:tests`. CI job `lint-tests`. |
| `node scripts/lint-command-contract.cjs` | ADR-0002 command contract lint. |
| `node scripts/check-skip-count.cjs` | Asserts the skipped-test count does not regress from `origin/main`. |
| `node scripts/lint-vcs-no-raw-git.cjs` | Forbids raw `git` invocations in jj-reachable code paths. |
| `node scripts/lint-vcs-no-commit-id.cjs` | Forbids `commit_id` leakage from the jj backend. Also runs from `pretest`. |

### Changeset workflow

User-facing PRs drop a fragment file in `.changeset/` instead of editing `CHANGELOG.md` directly:

| Command | Description |
|---------|-------------|
| `pnpm run changeset -- --type Fixed --pr <N> --body "…"` | Scaffolds `.changeset/<adjective>-<noun>-<noun>.md` via `scripts/changeset/new.cjs`. |
| `pnpm run lint:changeset` | Local mirror of the `Changeset Required` CI gate. |
| `pnpm run changelog:render` | Runs `scripts/changeset/cli.cjs render` to assemble fragments into `CHANGELOG.md` shape (used by the release workflow). |

The `Changeset Required` CI workflow (`.github/workflows/changeset-required.yml`) fails any PR that touches `bin/`, `get-shit-done/`, `agents/`, `commands/`, `hooks/`, or `sdk/src/` without a `.changeset/*.md` fragment. PRs without user-facing impact can apply the `no-changelog` label to opt out. See CONTRIBUTING.md "CHANGELOG Entries — Drop a Fragment" for the canonical rationale.

---

## Code Style

The canonical statement of code style lives in [CONTRIBUTING.md "Code Style"](../CONTRIBUTING.md#code-style) and [CONTRIBUTING.md "Testing Standards"](../CONTRIBUTING.md#testing-standards). Quick orientation:

- **CommonJS (`.cjs`)** for the root CLI/test surface. `require()`, not `import`.
- **TypeScript ESM** inside the `sdk/` workspace, transpiled to both ESM and CJS at build time.
- **No external runtime dependencies in core** — `gsd-tools.cjs` and the `get-shit-done/bin/lib/*.cjs` files use only Node.js built-ins.
- **No external test framework** — `node:test` for the root suite, **Vitest** for `sdk/`. Do not introduce Jest, Mocha, or Chai.
- **Conventional commits** — `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `ci:`, etc.
- **No automated formatter is configured.** Match the surrounding file's indentation and quoting style. Tabs vs spaces, single vs double quotes — follow the existing file rather than imposing a new convention.

Project-specific testing rules — including the **prohibition on source-grep tests**, the **`// allow-test-rule:` exemption matrix**, the `tests/helpers.cjs` centralized fixtures, and **Node 22 minimum / Node 24 primary CI target** — are documented in full under CONTRIBUTING.md "Testing Standards". Read that section before writing or modifying tests.

---

## Branch Conventions

Branch naming is enforced on every PR by `.github/workflows/branch-naming.yml`. Use one of the following prefixes:

`feat/`, `fix/`, `hotfix/`, `docs/`, `chore/`, `refactor/`, `test/`, `release/`, `ci/`, `perf/`, `revert/`

The following branch names are always accepted: `main`, `develop`, anything under `dependabot/`, `renovate/`, `gsd/`, or `claude/`. ADR and PRD PRs use the `docs/<issue#>-<slug>` shape (see CONTRIBUTING.md "Proposing an ADR or PRD").

The default branch is `main`. Release branches follow `release/**` and hotfix branches follow `hotfix/**`; both are part of the `test.yml` push triggers.

---

## PR Process

The pull-request process — issue-first rule, PR templates per contribution type, required CI matrix (Ubuntu × Node 22, 24; macOS × Node 24), CHANGELOG fragment requirement, and reviewer standards — is documented end-to-end in [CONTRIBUTING.md "Pull Request Guidelines"](../CONTRIBUTING.md#pull-request-guidelines). The summary for orientation:

- **Open the issue first.** Bug reports need a maintainer to label `confirmed-bug`; enhancements need `approved-enhancement`; features need `approved-feature`. PRs without a labeled, linked issue are closed without review.
- **Use the correct typed PR template** — `.github/PULL_REQUEST_TEMPLATE/fix.md`, `enhancement.md`, or `feature.md`. Using the default template for a typed PR is a rejection reason.
- **No draft PRs** — open the PR only when it is complete and CI-ready.
- **Link the issue with a closing keyword** (`Closes #N`, `Fixes #N`, `Resolves #N`) in the PR body.
- **One concern per PR.** Bug fixes, enhancements, and features go in separate PRs. No drive-by formatting.
- **Drop a changeset fragment** for user-facing changes (or apply `no-changelog`).
- **All CI jobs must be green.** The full matrix is gated; the `jj-colocated` and `jj-native` lanes currently run with `continue-on-error` during the Phase 5 soak window (see `.github/workflows/test.yml` header for the rationale).

### VCS-specific notes

This repository is the **jj-port fork** of upstream GSD — it routes both reads and writes through a VCS adapter that supports `jj` alongside `git`. Two things this means for contributors:

- The `lint-vcs-no-raw-git.cjs` and `lint-vcs-no-commit-id.cjs` checks are real gates, not warnings. Raw `git` calls inside jj-reachable code paths and `commit_id` leakage from the jj backend will both fail CI.
- Test triage notes for the `jj-colocated` matrix lane live under [`docs/test-triage/jj-bugs.md`](test-triage/jj-bugs.md). Read that before chasing flakes on the jj cells.

The overall architectural boundary — that GitHub Actions workflows themselves stay on git, while the local CLI/SDK developer surface uses the VCS adapter — is documented in the header block at the top of `.github/workflows/test.yml`.
