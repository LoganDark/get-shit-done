/**
 * GSD Tools Test Helpers
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createFixture } = require('./fixtures/index.cjs');

const TOOLS_PATH = path.join(__dirname, '..', 'gsd-core', 'bin', 'gsd-tools.cjs');
const TEST_ENV_BASE = {
  GSD_SESSION_KEY: '',
  CODEX_THREAD_ID: '',
  CLAUDE_SESSION_ID: '',
  CLAUDE_CODE_SSE_PORT: '',
  OPENCODE_SESSION_ID: '',
  GEMINI_SESSION_ID: '',
  CURSOR_SESSION_ID: '',
  WINDSURF_SESSION_ID: '',
  TERM_SESSION_ID: '',
  WT_SESSION: '',
  TMUX_PANE: '',
  ZELLIJ_SESSION_NAME: '',
  TTY: '',
  SSH_TTY: '',
};

/**
 * Run gsd-tools command.
 *
 * @param {string|string[]} args - Command string (shell-interpreted) or array
 *   of arguments (shell-bypassed via execFileSync, safe for JSON and dollar signs).
 * @param {string} cwd - Working directory.
 * @param {object} [env] - Optional env overrides merged on top of process.env.
 *   Pass { HOME: cwd } to sandbox ~/.gsd/ lookups in tests that assert concrete
 *   config values that could be overridden by a developer's defaults.json.
 */
function runGsdTools(args, cwd = process.cwd(), env = {}) {
  // Resolve argv once so both the first attempt and the retry use the same vector.
  const childEnv = { ...process.env, ...TEST_ENV_BASE, ...env };
  const argv = Array.isArray(args)
    ? args
    : (args.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [])
        .map(t => t.replace(/"([^"]*)"/g, '$1').replace(/'([^']*)'/g, '$1'));

  function attempt() {
    // Split shell-style string into argv, stripping surrounding quotes, so we
    // can invoke execFileSync with process.execPath instead of relying on
    // `node` being on PATH (it isn't in Claude Code shell sessions).
    // Apply shell-style quote removal: strip surrounding quotes from quoted
    // sequences anywhere in a token (handles both "foo bar" and --"foo bar").
    return execFileSync(process.execPath, [TOOLS_PATH, ...argv], {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: childEnv,
      timeout: 60000,
    });
  }

  // isKilled: true when the subprocess was terminated by a signal or timed out.
  // This indicates host resource starvation (OOM, scheduler contention), NOT a
  // product assertion failure.
  function isKilled(err) {
    return err.killed || err.signal != null || err.code === 'ETIMEDOUT';
  }

  function throwResourceStarvation(err) {
    throw new Error(
      `[runGsdTools: resource-starvation / subprocess-kill after retry] ` +
      `gsd-tools was killed before completion ` +
      `(signal=${err.signal}, code=${err.code}, killed=${err.killed}). ` +
      `This indicates host OOM or scheduler contention, not a product bug. ` +
      `stdout=${err.stdout?.toString().trim() || ''} ` +
      `stderr=${err.stderr?.toString().trim() || ''}`
    );
  }

  try {
    const result = attempt();
    return { success: true, output: result.trim(), exitCode: 0 };
  } catch (firstErr) {
    // Kill-signal discrimination (#969): transient OOM/contention usually
    // succeeds on retry; retry ONCE before surfacing the labeled error.
    if (isKilled(firstErr)) {
      try {
        const result = attempt();
        return { success: true, output: result.trim(), exitCode: 0 };
      } catch (retryErr) {
        // Still killed after retry — persistent resource starvation, throw.
        throwResourceStarvation(retryErr);
      }
    }
    // Clean non-zero exit (real command error, no kill signal): return normally.
    // No retry, no throw — preserves existing test behavior that asserts on
    // error shape.
    const stderrRaw = firstErr.stderr?.toString().trim() || '';
    // Prefer actual stderr content; fall back to err.message (which contains
    // the command invocation). If stderr is empty, append a note so CI logs
    // show "stderr: (empty)" rather than silently losing the fact that the
    // child process produced no error output — empty stderr with a non-zero
    // exit code is a signal of OS-level crash (OOM kill, worker thread fatal
    // error) rather than a gsd-tools application error.
    const error = stderrRaw || `${firstErr.message} [stderr: (empty) exit:${firstErr.status ?? 1}]`;
    return {
      success: false,
      output: firstErr.stdout?.toString().trim() || '',
      error,
      exitCode: firstErr.status ?? 1,
    };
  }
}

// Create a bare temp directory (no .planning/ structure)
function createTempDir(prefix = 'gsd-test-') {
  return fs.mkdtempSync(path.join(require('os').tmpdir(), prefix));
}

// Create temp directory structure
function createTempProject(prefix = 'gsd-test-') {
  return createFixture({ prefix, planning: true, git: false });
}

// Create temp directory with initialized git repo and at least one commit
function createTempGitProject(prefix = 'gsd-test-') {
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), prefix));
  fs.mkdirSync(path.join(tmpDir, '.planning', 'phases'), { recursive: true });

  // Phase 2 D-09 closing migration (plan 02-03 Task 4 / W2 fix): bootstrap
  // (init + 3x config) now routes through `vcs.gitOnly.init()` and
  // `vcs.gitOnly.configSet(...)`, retiring the last 4 raw-git calls in this
  // function. After this commit createTempGitProject has zero raw-git
  // invocations. The lazy `_loadVcs()` getter still defers the built-lib
  // require until first call (pre-build-guard friendly for non-VCS tests).
  const { vcs: vcsLib } = _loadVcs();
  const vcs = vcsLib.createVcsAdapter(tmpDir, { kind: 'git' });
  if (vcs.kind === 'git') {
    vcs.gitOnly.init();
    vcs.gitOnly.configSet('user.email', 'test@test.com');
    vcs.gitOnly.configSet('user.name', 'Test');
    vcs.gitOnly.configSet('commit.gpgsign', 'false');
    // WR-04 (Phase 2 review): mirror the commit.test.ts:beforeEach Phase 2
    // D-03 fix symmetrically. Any test that creates a temp project via
    // this helper and exercises `vcs.gitOnly.createAnnotatedTag` would
    // otherwise fail on developer machines with `tag.gpgsign = true` set
    // globally (git tag -a refuses to write the tag object without a key).
    vcs.gitOnly.configSet('tag.gpgsign', 'false');
  }

  fs.writeFileSync(
    path.join(tmpDir, '.planning', 'PROJECT.md'),
    '# Project\n\nTest project.\n'
  );

  // Post-init commit via the same VcsAdapter instance (D-09 + Plan 2.1-04
  // D-02/D-04). Plan 2.1-04 (D-03): the vcs.stage adapter verb is gone;
  // vcs.commit({files: ['.']}) captures WC state via `git add -A -- .`
  // (CR-01 `--` separator preserved inside the backend) then `git commit -m`.
  // The prior WR-06 defense-in-depth split (explicit stage + bare commit)
  // is no longer expressible; CR-01's `--` guard remains the option-injection
  // safety for any `-`-prefixed file dropped before this helper runs.
  vcs.commit({ message: 'initial commit', files: ['.'] });

  return tmpDir;
}

function cleanup(tmpDir) {
  if (typeof tmpDir !== 'string' || tmpDir.length === 0) return;
  const target = path.resolve(tmpDir);
  const cwd = path.resolve(process.cwd());
  const tmpRoot = path.resolve(os.tmpdir());
  if (cwd === target || cwd.startsWith(`${target}${path.sep}`)) {
    // Windows cannot remove a directory that is the current working directory.
    process.chdir(path.dirname(target));
  }
  // maxRetries/retryDelay absorbs transient Windows EBUSY where AV scanners,
  // file-indexers, or just-exited child processes still hold handles when
  // teardown runs. On POSIX the retry loop is a no-op (rmSync succeeds first try).
  // Budget: 20 × 250ms = 5s total — Windows Defender's deferred scan can hold
  // newly-written files for several seconds on cold runners.
  try {
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  } catch (error) {
    // After retries, Windows can still briefly hold temp dirs open after a timed-out
    // child exits. Ignore that teardown-only flake for temp roots, but rethrow everything else.
    const isTmpPath = target === tmpRoot || target.startsWith(`${tmpRoot}${path.sep}`);
    const isTransientWinErr = process.platform === 'win32'
      && isTmpPath
      && ['EBUSY', 'ENOTEMPTY', 'EPERM'].includes(error && error.code);
    if (!isTransientWinErr) throw error;
  }
}

/**
 * Parse a Markdown frontmatter block into a flat key→value map.
 *
 * Handles the YAML scalar forms emitted by the install converters:
 *   key: "json-encoded value"   → JSON.parse
 *   key: 'value with ''escape'' → strip quotes, unescape ''
 *   key: bare value             → trimmed string
 *
 * Multi-line and block scalars are out of scope — every converter in
 * `bin/install.js` emits single-line scalars only. Throws if the content
 * has no closed `---` block so a regression in the emitter shape fails
 * loudly rather than silently returning {}.
 *
 * Tests use this helper instead of `result.includes('key: value')` to
 * follow the project's "tests parse, never grep" convention.
 *
 * @param {string} content - Full file content beginning with `---`.
 * @returns {Record<string, string>} Map of frontmatter keys to decoded values.
 */
function parseFrontmatter(content) {
  if (!content.startsWith('---')) {
    throw new Error(`parseFrontmatter: content must start with '---', got: ${content.slice(0, 40)}`);
  }
  // CRLF tolerance: a Windows-authored file split on `\n` would leave a
  // trailing `\r` on every line, making `lines[i] === '---'` fail to
  // recognize delimiters. Same goes for whitespace-padded delimiter lines.
  // Normalize via a CRLF-aware split + trimmed comparison.
  const lines = content.split(/\r?\n/);
  let openIdx = -1;
  let closeIdx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') {
      if (openIdx === -1) openIdx = i;
      else { closeIdx = i; break; }
    }
  }
  if (openIdx === -1 || closeIdx === -1) {
    throw new Error('parseFrontmatter: no closed --- block');
  }
  const fields = {};
  for (const line of lines.slice(openIdx + 1, closeIdx)) {
    // WR-09: widen the leading-char class to include `_` so keys like
    // `_internal:` are not silently dropped. Numeric leading chars are still
    // rejected — frontmatter keys starting with a digit are unusual enough
    // that we want them to surface (a frontmatter line shaped `123: foo`
    // is more likely a mis-indented list item than a real key).
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!match) continue; // skip block-list items, blank lines, comments
    const [, key, rawValue] = match;
    const value = rawValue.trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      fields[key] = JSON.parse(value);
    } else if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
      fields[key] = value.slice(1, -1).replace(/''/g, "'");
    } else {
      fields[key] = value;
    }
  }
  return fields;
}

// #3026 CR: shared `--help` output check used by bug-1818 + bug-3019 tests.
// Render-on-help shape is `Usage: gsd-tools …\nCommands: …` — both lines
// must be present; structural test, not prose substring matching.
function isUsageOutput(text) {
  return /Usage:\s*gsd-tools/.test(text) && /Commands:/.test(text);
}

// ─── VCS adapter test harness (Phase 1 plan 04) ─────────────────────────────
// RESEARCH Pitfall 1: two-runner trap — node --test has no describe.for / test.extend.
// RESEARCH Pitfall 3: pre-build guard — fail loudly with a recovery instruction.
// RESEARCH Pitfall 6: BACKENDS_AVAILABLE and parseBackendsEnv MUST come from the
// built lib (gsd-core/bin/lib/vcs, emitted by `pnpm run build:lib`) — single source.

let _vcsModule = null;
let _backendsModule = null;
function _loadVcs() {
  if (_vcsModule && _backendsModule) return { vcs: _vcsModule, backends: _backendsModule };
  try {
    _vcsModule = require('../gsd-core/bin/lib/vcs/index.cjs');
    _backendsModule = require('../gsd-core/bin/lib/vcs/backends.cjs');
  } catch (err) {
    throw new Error(
      'VCS adapter not built. Run: pnpm run build:lib\n' +
      '  Underlying error: ' + (err && err.message ? err.message : String(err))
    );
  }
  return { vcs: _vcsModule, backends: _backendsModule };
}

const __VCS_TEST_ONLY_SYMBOL = Symbol.for('gsd.vcs.testOnly');

function vcsTest(kindOrKinds, suiteFn) {
  const { describe, before, after, beforeEach } = require('node:test');
  const { vcs: vcsLib, backends } = _loadVcs();

  let kinds;
  if (kindOrKinds === 'auto') {
    // B-4: parseBackendsEnv returns { available, requested, unavailable }.
    const result = backends.parseBackendsEnv(process.env.GSD_TEST_BACKENDS);
    if (result.requested.length > 0 && result.available.length === 0) {
      const msg = '[GSD_TEST_BACKENDS] requested ' + JSON.stringify(result.requested) +
        ' but none are in BACKENDS_AVAILABLE (' + JSON.stringify(backends.BACKENDS_AVAILABLE) +
        '); 0 tests will run. Unavailable: ' + JSON.stringify(result.unavailable) + '.';
      if (process.env.CI === 'true') throw new Error(msg);
      process.stderr.write('WARN ' + msg + '\n');
    }
    kinds = result.available;
  } else {
    const requested = Array.isArray(kindOrKinds) ? kindOrKinds : [kindOrKinds];
    kinds = requested.filter(function (k) { return backends.BACKENDS_AVAILABLE.includes(k); });
    if (requested.length > 0 && kinds.length === 0) {
      const msg = 'vcsTest(' + JSON.stringify(requested) + ') resolved to 0 backends; AVAILABLE=' + JSON.stringify(backends.BACKENDS_AVAILABLE);
      if (process.env.CI === 'true') throw new Error(msg);
      process.stderr.write('WARN ' + msg + '\n');
    }
  }

  for (const kind of kinds) {
    describe('vcs[' + kind + ']', () => {
      let sharedDir = null;
      let sharedAdapter = null;
      let snapshotHandle = null;

      before(() => {
        // Phase 3 plan 03-01 Task 5: jj-colocated lane mirrors the
        // vcs-fixture.ts ts-side dispatch. snapshot/restore is gated by
        // BACKENDS_AVAILABLE_FOR_VERB per D-12 — plan 03-01's stub jj
        // adapter throws VcsNotImplementedError on snapshot, so we
        // probe the allowlist before invoking.
        if (kind === 'git') {
          sharedDir = createTempGitProject('gsd-vcs-cjs-');
          sharedAdapter = vcsLib.createVcsAdapter(sharedDir, { kind: 'git' });
        } else if (kind === 'jj-colocated') {
          sharedDir = createTempDir('gsd-vcs-cjs-jj-');
          const { execSync: ex } = require('node:child_process');
          ex('jj git init --colocate', { cwd: sharedDir, stdio: 'pipe' });
          ex('jj config set --repo user.email "test@test.com"', { cwd: sharedDir, stdio: 'pipe' });
          ex('jj config set --repo user.name "Test"', { cwd: sharedDir, stdio: 'pipe' });
          sharedAdapter = vcsLib.createVcsAdapter(sharedDir, { kind: 'jj' });
        } else if (kind === 'jj-native') {
          // Phase 4 plan 01 (D-22): non-colocated jj fixture. Empirically
          // verified against jj 0.41.0: `--colocate` IS THE DEFAULT, so
          // we MUST pass `--no-colocate` to suppress `.git` creation
          // and produce a jj-native (non-colocated) repo. Plan-action's
          // `--no-git` spelling was hypothetical; the actual 0.41 flag is
          // `--no-colocate` (see `jj git init --help`).
          sharedDir = createTempDir('gsd-vcs-cjs-jj-native-');
          const { execSync: ex } = require('node:child_process');
          ex('jj git init --no-colocate', { cwd: sharedDir, stdio: 'pipe' });
          ex('jj config set --repo user.email "test@test.com"', { cwd: sharedDir, stdio: 'pipe' });
          ex('jj config set --repo user.name "Test"', { cwd: sharedDir, stdio: 'pipe' });
          sharedAdapter = vcsLib.createVcsAdapter(sharedDir, { kind: 'jj' });
        } else {
          throw new Error("backend '" + kind + "' not yet implemented (BACKENDS_AVAILABLE=" + backends.BACKENDS_AVAILABLE.join(',') + ')');
        }
        const testApi = sharedAdapter[__VCS_TEST_ONLY_SYMBOL];
        if (!testApi) throw new Error('Adapter missing __vcsTestOnly namespace');
        const snapshotAvailable = (
          backends.BACKENDS_AVAILABLE_FOR_VERB &&
          backends.BACKENDS_AVAILABLE_FOR_VERB['__vcsTestOnly.snapshot']
        ) || [];
        if (snapshotAvailable.includes(kind)) {
          snapshotHandle = testApi.snapshot();
        }
      });

      beforeEach(() => {
        if (sharedAdapter && snapshotHandle) {
          const testApi = sharedAdapter[__VCS_TEST_ONLY_SYMBOL];
          testApi.restore(snapshotHandle);
        }
      });

      after(() => {
        if (sharedDir) cleanup(sharedDir);
        sharedDir = null;
        sharedAdapter = null;
        snapshotHandle = null;
      });

      const handle = {
        getKind: () => kind,
        getCwd: () => sharedDir,
        getVcs: () => sharedAdapter,
      };
      suiteFn(handle);
    });
  }
}

/**
 * Phase 4 plan 02: multi-workspace contract fixture.
 *
 * Like vcsTest, but inside the per-describe `before`, creates `n` workspaces
 * named `phase-04-subagent-{idx}` (1-indexed; mirrors D-04 zero-padded phase
 * convention) BEFORE running suiteFn. The handle exposed to suiteFn gains a
 * `getWorkspaces(): string[]` method returning the workspace NAMES (jj's
 * `workspace.list()` entries reference the name, not the path).
 *
 * Workspaces are created under `<cwd>/.claude/jj-workspaces/<name>` — the
 * D-16 layout. The single-workspace `vcsTest` snapshot/restore between tests
 * still applies; workspaces created in `before` outlive individual `it`
 * blocks within the describe.
 *
 * NB: workspace.add bodies are wired only on jj-colocated and jj-native (per
 * plan 01's BACKENDS_AVAILABLE_FOR_VERB flip). On a git fixture, this factory
 * will run vcs.workspace.add with the WorkspaceAdd shape — the `name` field
 * is jj-specific but harmless on git (the type is optional). Callers wanting
 * to exercise multi-workspace flows on jj only should pass `['jj-colocated',
 * 'jj-native']` for kindOrKinds.
 *
 * @param {'git'|'jj-colocated'|'jj-native'|Array<'git'|'jj-colocated'|'jj-native'>} kindOrKinds
 * @param {number} n - number of workspaces to pre-create per describe block
 * @param {(handle: {
 *   getKind: () => string,
 *   getCwd: () => string,
 *   getVcs: () => any,
 *   getWorkspaces: () => string[],
 * }) => void} suiteFn
 */
function vcsMultiWsTest(kindOrKinds, n, suiteFn) {
  const { before, after } = require('node:test');
  const { join } = require('node:path');
  // Reuse vcsTest's mechanism: invoke vcsTest with a wrapping suiteFn that
  // pre-creates n workspaces in a `before` block, then forwards the (now
  // augmented) handle to the user's suiteFn.
  vcsTest(kindOrKinds, (handle) => {
    const workspaceNames = [];
    before(() => {
      for (let i = 1; i <= n; i += 1) {
        const wsName = `phase-04-subagent-${i}`;
        const wsPath = join(handle.getCwd(), '.claude/jj-workspaces', wsName);
        // workspace.add does its own mkdir -p (plan 01 / D-17 / Pitfall 4) so
        // the test fixture does NOT pre-create the parent.
        handle.getVcs().workspace.add({ path: wsPath, name: wsName });
        workspaceNames.push(wsName);
      }
    });
    after(() => {
      // Best-effort cleanup so a later vcsMultiWsTest call doesn't see leaked
      // workspaces. Pitfall 3 means the on-disk dirs persist after forget —
      // they live under the shared tmp dir which the parent `vcsTest`
      // `after` will rm-rf in full.
      for (const wsName of workspaceNames) {
        try { handle.getVcs().workspace.forget(wsName); } catch { /* already forgotten */ }
      }
    });
    handle.getWorkspaces = () => [...workspaceNames];
    suiteFn(handle);
  });
}

/**
 * Isolated HOME directory used by runNpm() for the lifetime of this process.
 *
 * npm reads $HOME/.npmrc (user config) and writes to $HOME/.npm (default cache)
 * when these paths are not overridden. On Docker hosts the running user's HOME
 * may be uninitialized, unwritable, or contain stale state from a prior run —
 * any of which causes `npm pack` / `npm install -g` to fail. Fix: create a
 * fresh temp directory once per process, redirect HOME + cache + userconfig into
 * it, and clean up on process exit. This makes runNpm() independent of the
 * caller's environment. (#131)
 */
const _npmIsolatedHome = fs.mkdtempSync(path.join(require('os').tmpdir(), 'npm-home-'));
process.on('exit', () => {
  try { fs.rmSync(_npmIsolatedHome, { recursive: true, force: true }); } catch (_) { /* best-effort */ }
});

/**
 * Run `fn` with console.log/warn/error captured, returning {stdout, stderr}
 * with ANSI colors stripped. Re-throws any exception fn threw AFTER restoring
 * the real console so the caller's assertion path sees the failure (without
 * this, a fn that crashes before printing would falsely pass !hasReady-style
 * assertions). #2775 CR follow-up established this exact contract.
 *
 * Previously duplicated in bug-2775, bug-2829, bug-3033, bug-3211, bug-3231,
 * bug-3359, and installer-migration-install-integration.
 */
function captureConsole(fn) {
  const stdout = [];
  const stderr = [];
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;
  console.log = (...a) => stdout.push(a.join(' '));
  console.warn = (...a) => stderr.push(a.join(' '));
  console.error = (...a) => stderr.push(a.join(' '));
  let threw = null;
  try {
    fn();
  } catch (e) {
    threw = e;
  } finally {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
  }
  if (threw) throw threw;
  const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
  return {
    stdout: stdout.map(strip).join('\n'),
    stderr: stderr.map(strip).join('\n'),
  };
}

/**
 * Normalize platform path separators to POSIX forward slashes. Use for
 * cross-platform path comparisons in test assertions where the runtime
 * emits the platform-native separator (\ on Windows) but the test
 * fixture or expected literal is POSIX. Returns the input unchanged if
 * null/undefined so it composes safely with optional chaining.
 */
function toPosixPath(p) {
  return p == null ? p : p.split(path.sep).join('/');
}

/**
 * Run an npm command via execFileSync with cross-platform portability.
 *
 * Handles the Windows `npm.cmd` vs POSIX `npm` distinction and the
 * `shell: true` requirement on Windows so tests do not need to
 * re-implement platform detection inline.
 *
 * @param {string[]} args - npm subcommand and flags (e.g. ['pack', '--pack-destination', dir]).
 * @param {object} [options] - execFileSync options merged with platform defaults.
 *   `cwd`, `encoding`, `timeout`, and `env` are the commonly overridden keys.
 * @returns {string} trimmed stdout string (encoding: 'utf-8').
 * @throws {Error} re-throws the execFileSync error on non-zero exit so callers
 *   get the full stderr in the error message.
 */
function runNpm(args, options = {}) {
  const isWindows = process.platform === 'win32';
  const npmCmd = isWindows ? 'npm.cmd' : 'npm';
  // Inject an isolated HOME so npm never reads from or writes to the caller's
  // $HOME. This prevents failures on Docker hosts where HOME is unwritable or
  // uninitialized. The caller may still pass { env: {...} } in options to
  // further override specific variables — those overrides win because they are
  // applied after the isolated env below (via the spread in the merge). (#131)
  const isolatedEnv = {
    ...process.env,
    HOME: _npmIsolatedHome,
    npm_config_cache: path.join(_npmIsolatedHome, '.npm'),
    npm_config_userconfig: path.join(_npmIsolatedHome, '.npmrc'),
    npm_config_loglevel: 'error',
    npm_config_update_notifier: 'false',
    NO_UPDATE_NOTIFIER: '1',
  };
  const defaults = {
    encoding: 'utf-8',
    shell: isWindows,
    timeout: 180000,
    env: isolatedEnv,
  };
  // Merge options; if caller passes their own env, merge it on top of isolatedEnv
  // so the isolation is preserved unless the caller explicitly overrides HOME.
  const { env: callerEnv, ...otherOptions } = options;
  const mergedEnv = callerEnv ? { ...isolatedEnv, ...callerEnv } : isolatedEnv;
  return execFileSync(npmCmd, args, { ...defaults, ...otherOptions, env: mergedEnv }).trim();
}

/**
 * Returns the isolated npm environment dict used by runNpm().
 *
 * Callers (e.g. runSmoke()) can spread this into a spawnSync env so that npm
 * never reads from or writes to the caller's $HOME — the same guarantee
 * runNpm() already provides. (#131)
 *
 * @returns {object} env dict with HOME, npm_config_cache, npm_config_userconfig
 *   pointing into a process-scoped temp directory.
 */
function isolatedNpmEnv() {
  return {
    ...process.env,
    HOME: _npmIsolatedHome,
    npm_config_cache: path.join(_npmIsolatedHome, '.npm'),
    npm_config_userconfig: path.join(_npmIsolatedHome, '.npmrc'),
    npm_config_loglevel: 'error',
    npm_config_update_notifier: 'false',
    NO_UPDATE_NOTIFIER: '1',
  };
}

/**
 * Run a callback with process-level state isolation.
 * Restores cwd, exitCode, and process.env after callback returns or throws.
 *
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
function withIsolatedProcessState(fn) {
  const originalCwd = process.cwd();
  const originalExitCode = process.exitCode;
  const originalEnv = { ...process.env };

  try {
    return fn();
  } finally {
    if (process.cwd() !== originalCwd) {
      process.chdir(originalCwd);
    }
    process.exitCode = originalExitCode;

    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      process.env[key] = value;
    }
  }
}

/**
 * Async delay — yields the event loop for `ms` ms without a synchronous block.
 * Replaces raw setTimeout / Atomics.wait sleeps in tests. `ms` is an identifier
 * and the Promise is not awaited inline, so it does not trip the no-magic-sleep
 * / no-restricted-syntax test rules (which only scan *.test.cjs anyway).
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll `predicate` until it returns truthy or the deadline elapses — the approved
 * poll-for-condition pattern for cross-process test synchronization. Returns the
 * predicate's truthy value; throws Error(message) on timeout.
 *
 * `predicate` must return a boolean or truthy value when ready; any falsy result
 * (including `0` or `''`) is treated as "not ready yet". Do not use predicates
 * whose meaningful result can be falsy.
 *
 * `predicate` should not throw — exceptions propagate out of `waitFor` uncaught
 * and are NOT retried. If the readiness check can throw on a transient state
 * (e.g. parsing a partially-written file), guard inside the predicate and return
 * `false` instead.
 */
async function waitFor(predicate, { timeoutMs = 10000, stepMs = 25, message = 'waitFor timed out' } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = predicate();
    if (value) return value;
    if (Date.now() >= deadline) throw new Error(message);
    await delay(stepMs);
  }
}

/**
 * Reset all runtime-warning caches in config-loader.cjs and model-resolver.cjs.
 *
 * Use this in beforeEach/afterEach hooks in tests that exercise warning-emission
 * paths so that each test starts with a clean slate. Replaces the duplicated local
 * `_resetRuntimeWarningCacheForTests` wrappers in individual test files.
 */
function resetRuntimeWarningCaches() {
  const configLoader = require('../gsd-core/bin/lib/config-loader.cjs');
  const modelResolver = require('../gsd-core/bin/lib/model-resolver.cjs');
  configLoader._resetRuntimeWarningCacheForTests();
  modelResolver._resetModelPolicyWarningCacheForTests();
  modelResolver._resetModelOverrideWarningCacheForTests();
}

const _exports = {
  runGsdTools, createTempDir, createTempProject, createTempGitProject, cleanup, parseFrontmatter, isUsageOutput, TOOLS_PATH,
  vcsTest, vcsMultiWsTest,
  captureConsole, toPosixPath, runNpm, isolatedNpmEnv, withIsolatedProcessState, delay, waitFor, resetRuntimeWarningCaches,
};
Object.defineProperty(_exports, 'BACKENDS_AVAILABLE', { enumerable: true, get: () => _loadVcs().backends.BACKENDS_AVAILABLE });
Object.defineProperty(_exports, 'BACKENDS_DECLARED', { enumerable: true, get: () => _loadVcs().backends.BACKENDS_DECLARED });
Object.defineProperty(_exports, 'BACKENDS_AVAILABLE_FOR_VERB', { enumerable: true, get: () => _loadVcs().backends.BACKENDS_AVAILABLE_FOR_VERB });
Object.defineProperty(_exports, 'parseBackendsEnv', { enumerable: true, get: () => _loadVcs().backends.parseBackendsEnv });
module.exports = _exports;
