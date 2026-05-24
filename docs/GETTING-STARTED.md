<!-- generated-by: gsd-doc-writer -->
# Getting Started

> Two audiences live in this repo: people **using** GSD inside their AI runtime with jj support, and people **contributing** to the fork itself. Both paths install from this checkout — not from npm.

> [!IMPORTANT]
> This is the [`jj-vcs` branch](https://github.com/LoganDark/get-shit-done/tree/jj-vcs) of the [jj-port fork](https://github.com/LoganDark/get-shit-done). It carries fixes for using GSD with [Jujutsu (`jj`)](https://github.com/jj-vcs/jj) — fixes that are **not** in upstream's npm package. Do not run `npx get-shit-done-cc@latest`; it installs upstream and silently drops the jj fixes.

---

## Are you a user or a contributor?

**If you want to use GSD in your AI runtime with jj support**, install from this checkout:

```bash
git clone https://github.com/LoganDark/get-shit-done.git
cd get-shit-done
pnpm install
node bin/install.js --claude --global
```

Swap `--claude` for the runtime flag you want (`--opencode`, `--gemini`, `--codex`, `--cursor`, `--copilot`, `--kilo`, `--cline`, etc., or `--all`). `--global` installs to the runtime's config directory (e.g. `~/.claude/`); `--local` installs into the current project. To pick up later updates, `git pull && pnpm install && node bin/install.js --claude --global` from this checkout.

For the full user walkthrough — runtime flag reference, install profiles, configuration — see [README.md](../README.md) and [docs/USER-GUIDE.md](USER-GUIDE.md). Substitute the local `node bin/install.js` invocation above for any `npx get-shit-done-cc@latest` examples in those docs.

**If you want to hack on the fork itself** — fix a bug, port more of upstream, add jj-specific features — continue reading.

---

## Contributor Setup

### Prerequisites

- **Node.js** `>=22.0.0` — declared in `package.json` `engines.node`. No `.nvmrc` or `.node-version` is pinned; install any 22.x or 24.x runtime (CI tests both).
- **pnpm** `11.x` — declared in `package.json` `packageManager` as `pnpm@11.0.8`. This repo is a pnpm workspace; using `npm install` at the root will not wire up the `@gsd-build/sdk` workspace correctly. Install pnpm via [corepack](https://nodejs.org/api/corepack.html) or directly:
  ```bash
  corepack enable
  corepack prepare pnpm@11.0.8 --activate
  ```
- **git** — required even on the jj-port; the repo is colocated so `.git/` lives alongside `.jj/`.
- **(Optional) jj** `>=0.41.0` — only needed if you want to use Jujutsu for local development. CI installs jj v0.41.0 from the official tarball; install locally via `cargo install jj-cli` or your package manager.
- **(Optional) Rust toolchain** — only needed if you want to build the optional `fallow` review tool from source instead of using the npm package.

No environment variables are required to build or test. There is no `.env.example` file in the repo, and no startup-blocking config is read from the environment.

### Installation steps

1. Clone the repository:
   ```bash
   git clone https://github.com/LoganDark/get-shit-done.git
   cd get-shit-done
   ```

2. Install dependencies with pnpm:
   ```bash
   pnpm install
   ```
   This installs the root package plus the `@gsd-build/sdk` workspace under `sdk/`.

3. Build the SDK and the Node hooks. The test script depends on the SDK build, so this step is mandatory before the first test run:
   ```bash
   pnpm run build:sdk
   pnpm run build:hooks
   ```
   `build:sdk` runs `pnpm --filter @gsd-build/sdk build`, which emits ESM into `sdk/dist/` and CJS into `sdk/dist-cjs/`. `build:hooks` runs `node scripts/build-hooks.js`.

4. **(jj users only)** If you cloned without a `.jj/` directory and want to develop with Jujutsu, initialize colocated jj on top of the existing git checkout:
   ```bash
   jj git init --colocate
   ```
   See the README's leading callout for the migration story.

### First run

The shortest path from clone to working output is the test suite. From the repo root:

```bash
npm test
```

This invokes `node scripts/run-tests.cjs`, which discovers every `tests/*.test.cjs` file and runs them through Node's built-in test runner (`node --test`) at concurrency 4. A `pretest` hook runs first and will:

1. Build the SDK (`pnpm run build:sdk`).
2. Lint skill dependency declarations (`scripts/lint-skill-deps.cjs`).
3. Lint the jj-port's commit_id-leak guard (`scripts/lint-vcs-no-commit-id.cjs`).

A green test run confirms your toolchain is wired up correctly.

To override concurrency for a single run:

```bash
TEST_CONCURRENCY=1 npm test
```

To run the SDK's Vitest suite in isolation:

```bash
pnpm --filter @gsd-build/sdk test
```

### Common setup issues

- **`Unsupported engine` warning during `pnpm install`** — your Node.js is older than 22.0.0. Upgrade Node before continuing. CI tests against Node 22 and 24; nothing below 22 is supported.

- **`Cannot find module '@gsd-build/sdk'` when running tests** — you ran `npm install` at the root instead of `pnpm install`. npm does not understand `pnpm-workspace.yaml`, so the `sdk/` workspace is never linked. Delete `node_modules/` and re-run `pnpm install`.

- **Tests fail with `Cannot find module 'sdk/dist/...'`** — you skipped step 3 of the installation. The `pretest` script normally runs `build:sdk` for you, but if it was bypassed, run it manually: `pnpm run build:sdk`.

- **`fallow` install errors or build prompts** — `fallow` is listed under `optionalDependencies` and `onlyBuiltDependencies` in `pnpm-workspace.yaml`. It is only required if you set `code_quality.fallow.enabled: true` in your project's `.planning/config.json`; otherwise it is safe to let pnpm skip its native build.

- **jj users: pre-commit hook does not fire after `jj squash`** — jj 0.41 does not auto-invoke `.git/hooks/pre-commit` in colocated mode. The alias-drift check (`.githooks/pre-commit`) will only run on a real `git commit`. This is a known caveat tracked in the project's phase notes; run `npm run check:alias-drift` manually if you touch the generated alias files.

### Next steps

Once `npm test` passes, you are ready to contribute:

- **[CONTRIBUTING.md](../CONTRIBUTING.md)** — the issue-first contribution flow (fix / enhancement / feature), PR templates, and the changeset rule.
- **[docs/DEVELOPMENT.md](DEVELOPMENT.md)** — local dev workflow, all build/lint scripts, code style, and the PR submission process.
- **[docs/TESTING.md](TESTING.md)** — test framework details, how to add new tests, coverage thresholds, and the CI test matrix.
- **[docs/ARCHITECTURE.md](ARCHITECTURE.md)** — how the command/workflow/agent layers and the SDK fit together.
- **[docs/CONFIGURATION.md](CONFIGURATION.md)** — the `.planning/config.json` schema, model profiles, and runtime toggles.
- **[CONTEXT.md](../CONTEXT.md)** — domain vocabulary and module naming standards; read before naming or refactoring anything.

---

<!-- VERIFY: CI status badge URL — README references https://github.com/gsd-build/get-shit-done/actions/workflows/test.yml, which is the canonical upstream's Actions surface; the jj-port fork at LoganDark/get-shit-done may not run the same workflows. -->
