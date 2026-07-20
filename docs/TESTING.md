<!-- generated-by: gsd-doc-writer -->
# Testing

Operational quick-reference for running and writing GSD tests. The canonical
philosophy, required imports, setup/cleanup patterns, fixture-data formatting,
source-grep prohibitions, and Node compatibility rules live in
[CONTRIBUTING.md → Testing Standards](../CONTRIBUTING.md#testing-standards) —
do not duplicate that content here.

## Test framework and setup

GSD uses two distinct test frameworks, each scoped to a different layer of the
project:

| Layer | Framework | Test files | Config |
|-------|-----------|------------|--------|
| Root (`tests/`) | Node.js built-in (`node:test` + `node:assert/strict`) | `tests/*.test.cjs` | `scripts/run-tests.cjs` |
| SDK workspace (`sdk/`) | Vitest 3.x | `sdk/src/**/*.test.ts`, `sdk/src/**/*.integration.test.ts` | `sdk/vitest.config.ts` |

**Do not use Jest, Mocha, Chai, or any other external test framework** — see
[CONTRIBUTING.md → Testing Standards](../CONTRIBUTING.md#testing-standards).

**No global setup needed.** Both test layers run from a fresh checkout after
`pnpm install`. The root `pnpm test` script runs a `pretest` hook that builds the
SDK and runs two lint guards before any test executes (see
[Running tests](#running-tests) for the exact sequence).

**Node.js runtime:** `node >= 22.0.0` (declared in `package.json` `engines`).
CI runs the matrix on Node 22 and 24.

## Running tests

All commands run from the project root unless otherwise noted.

### Root test suite (`tests/*.test.cjs`)

```bash
# Run the full root suite (includes pretest: build:sdk + lint:skill-deps + lint-vcs-no-commit-id)
pnpm test

# Run with coverage (c8, line threshold 70%)
pnpm run test:coverage

# Run a single root test file (bypasses pretest hooks)
node --test tests/config.test.cjs

# Run a subset by glob (Node 22+ resolves test patterns natively)
node --test --test-concurrency=4 tests/bug-3*.test.cjs

# Tune root concurrency (default 4, see scripts/run-tests.cjs)
TEST_CONCURRENCY=8 pnpm test
```

The pretest hook (`pretest` in `package.json`) runs three steps before the
root suite executes:

1. `pnpm run build:sdk` — compile `@gsd-build/sdk` ESM + CJS bundles
2. `pnpm run lint:skill-deps` — verify skill dependency manifests
3. `node scripts/lint-vcs-no-commit-id.cjs` — guard against commit_id leaks
   from the jj VCS backend

### SDK workspace tests (`sdk/src/**/*.test.ts`)

Vitest projects split unit and integration tests. Integration tests have a
longer per-test timeout (120s).

```bash
# Run the full SDK suite (unit + integration)
pnpm --filter @gsd-build/sdk test

# Unit tests only
pnpm --filter @gsd-build/sdk test:unit

# Integration tests only
pnpm --filter @gsd-build/sdk test:integration

# Watch mode (Vitest interactive UI)
cd sdk && pnpm exec vitest

# Run a single SDK test file
cd sdk && pnpm exec vitest run src/config.test.ts
```

No `test:watch` script is defined at the package level — invoke
`pnpm exec vitest` from the `sdk/` directory directly for watch mode.

### Lint guards (run independently of tests)

```bash
# No source-grep tests (test files must not readFileSync source .cjs files)
pnpm run lint:tests

# Other guards run by pretest
pnpm run lint:skill-deps
node scripts/lint-vcs-no-commit-id.cjs
node scripts/lint-vcs-no-raw-git.cjs
```

## Writing new tests

### File naming and location

| Layer | Location | Naming | Helper module |
|-------|----------|--------|---------------|
| Root  | `tests/` (flat) | `*.test.cjs` | `tests/helpers.cjs` |
| SDK   | `sdk/src/` (co-located with source) | `*.test.ts` (unit), `*.integration.test.ts` (integration) | None |

`scripts/run-tests.cjs` picks up every file matching `tests/*.test.cjs` in
sorted order — drop a new test file in `tests/` and it is automatically
included in the root suite. There are no nested test directories at the root.

### Root test helpers (`tests/helpers.cjs`)

Import from `./helpers.cjs` — never inline temp-directory creation or shell
out to `gsd-tools.cjs` directly. The canonical helpers are:

| Helper | Purpose |
|--------|---------|
| `createTempProject(prefix?)` | Temp directory pre-populated with `.planning/phases/` |
| `createTempGitProject(prefix?)` | Same as above plus `git init` and an initial commit |
| `createTempDir(prefix?)` | Bare temp directory (no `.planning/`) |
| `cleanup(tmpDir)` | Recursive removal; always pair with `afterEach` or `t.after()` |
| `runGsdTools(args, cwd, env?)` | Invoke `get-shit-done/bin/gsd-tools.cjs` via `execFileSync` |

The full table with use-when guidance is in
[CONTRIBUTING.md → Use Centralized Test Helpers](../CONTRIBUTING.md#use-centralized-test-helpers).

### SDK custom matchers

SDK tests load custom Vitest matchers from `tests/__tools__/vitest-matchers.ts`
via `setupFiles` in `sdk/vitest.config.ts`. Type augmentations live in
`tests/__tools__/vitest.d.ts`. Use the custom matchers via `expect.extend`
style rather than free-function imports.

### Required reading

Before writing a new test, read
[CONTRIBUTING.md → Testing Standards](../CONTRIBUTING.md#testing-standards) —
it covers required imports, the two approved cleanup patterns
(`beforeEach`/`afterEach` and per-test `t.after()`), the prohibition on
`try/finally` inside test bodies, fixture-data formatting (use
`array.join('\n')`, not template literals), the source-grep prohibition with
allow-annotation syntax (`// allow-test-rule: <reason>`), and the
IR-vs-text-matching rules.

## Coverage requirements

### Root suite (c8)

The root suite enforces a 70% **line** coverage threshold via c8, scoped to
the GSD CLI library code only:

| Threshold | Value |
|-----------|-------|
| Lines     | 70%   |

```bash
# Scope and threshold are defined in package.json `test:coverage`:
c8 --check-coverage --lines 70 --reporter text \
   --include 'get-shit-done/bin/lib/*.cjs' \
   --exclude 'tests/**' \
   --all \
   node scripts/run-tests.cjs
```

Only `get-shit-done/bin/lib/*.cjs` is measured; `tests/**` is excluded; `--all`
counts files that have zero hits. No branch, function, or statement thresholds
are configured.

### SDK workspace

The SDK Vitest config (`sdk/vitest.config.ts`) defines no coverage thresholds.
Coverage for the SDK is not gated.

## CI integration

The repository runs all blocking tests on every pull request to `main` and on
pushes to `main`, `release/**`, and `hotfix/**`. The two test-bearing workflows
are:

### `.github/workflows/test.yml` — `Tests`

The primary blocking workflow. Triggers: PR to `main`, push to `main`/`release/**`/`hotfix/**`, manual dispatch.

Jobs:

- **`lint-tests`** — single ubuntu runner; executes:
  - `node scripts/lint-no-source-grep.cjs` (no source-grep tests)
  - `node scripts/lint-command-contract.cjs` (ADR-0002 command contract)
  - `node scripts/check-skip-count.cjs` (skip count cannot grow vs `origin/main`)
  - `node scripts/lint-vcs-no-raw-git.cjs` (no raw git in jj-reachable code)
  - `node scripts/lint-vcs-no-commit-id.cjs` (no commit_id leaks)
- **`test`** — matrix: `os=[ubuntu-latest]` × `node=[22, 24]` × `backend=[git, jj-colocated, jj-native]`, plus a `macos-latest` × Node 24 × git cell. Each cell:
  - Installs deps with `pnpm install --frozen-lockfile`
  - Builds the SDK (`pnpm run build:sdk`)
  - Runs `pnpm run test:coverage` with `GSD_TEST_BACKENDS` set to the matrix backend
  - The `jj-colocated` and `jj-native` cells install `jj 0.41.0` from the
    upstream GitHub release tarball and currently run with `continue-on-error:
    true` (they do not block merge until graduation; see the comment block at
    the top of `test.yml`)
  - The git cells **do** block merge

The SDK seam-coverage Vitest run and the SDK alias-drift check run once per
workflow on the primary cell (`ubuntu-latest` + Node 24 + git) to avoid
redundant matrix cost.

### `.github/workflows/parallel-e2e.yml` — `Parallel E2E`

The synthetic 2-plan parallel-phase end-to-end harness
(`scripts/e2e-parallel-phase.sh`). Triggers on PR to `main` only when paths
under `sdk/src/vcs/**`, `sdk/src/query/workspace-parallel-*.ts`,
`get-shit-done/workflows/**`, `scripts/audit-workflow-raw-git.cjs`,
`scripts/e2e-parallel-phase.sh`, or `.github/workflows/parallel-e2e.yml`
change. This lane's blocking polarity is inverted from `test.yml`:
required-blocking on `jj-colocated`, allow-failure on `git`.

### Other workflows in `.github/workflows/`

These do not run the project test suite directly but enforce repo-wide gates
that can block merge:

- `pr-gate.yml` — PR size labeling and large-PR warnings
- `branch-naming.yml` — branch name format
- `pr-template-format.yml` — PR description structure
- `changeset-required.yml` — every PR includes a changeset
- `require-issue-link.yml` — every PR links to an approved issue
- `install-smoke.yml` — tarball + unpacked `npm install -g` install paths
- `security-scan.yml` — repo-wide secret and injection scans

### CI architectural boundary

GitHub Actions workflows themselves stay on raw git, not the jj VCS adapter.
This is intentional and documented at the top of `test.yml` and
`parallel-e2e.yml`: GitHub Actions runs on ephemeral single-checkout
containers where the jj backend's value (local parallel-workspace performance)
does not apply.
