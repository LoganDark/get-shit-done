/**
 * GSD Tools Test Helpers
 */

const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TOOLS_PATH = path.join(__dirname, '..', 'get-shit-done', 'bin', 'gsd-tools.cjs');
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
  try {
    let result;
    const childEnv = { ...process.env, ...TEST_ENV_BASE, ...env };
    if (Array.isArray(args)) {
      result = execFileSync(process.execPath, [TOOLS_PATH, ...args], {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: childEnv,
      });
    } else {
      // Split shell-style string into argv, stripping surrounding quotes, so we
      // can invoke execFileSync with process.execPath instead of relying on
      // `node` being on PATH (it isn't in Claude Code shell sessions).
      // Apply shell-style quote removal: strip surrounding quotes from quoted
      // sequences anywhere in a token (handles both "foo bar" and --"foo bar").
      const argv = (args.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [])
        .map(t => t.replace(/"([^"]*)"/g, '$1').replace(/'([^']*)'/g, '$1'));
      result = execFileSync(process.execPath, [TOOLS_PATH, ...argv], {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: childEnv,
      });
    }
    return { success: true, output: result.trim() };
  } catch (err) {
    return {
      success: false,
      output: err.stdout?.toString().trim() || '',
      error: err.stderr?.toString().trim() || err.message,
    };
  }
}

// Create a bare temp directory (no .planning/ structure)
function createTempDir(prefix = 'gsd-test-') {
  return fs.mkdtempSync(path.join(require('os').tmpdir(), prefix));
}

// Create temp directory structure
function createTempProject(prefix = 'gsd-test-') {
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), prefix));
  fs.mkdirSync(path.join(tmpDir, '.planning', 'phases'), { recursive: true });
  return tmpDir;
}

// Create temp directory with initialized git repo and at least one commit
function createTempGitProject(prefix = 'gsd-test-') {
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), prefix));
  fs.mkdirSync(path.join(tmpDir, '.planning', 'phases'), { recursive: true });

  // Phase 2 D-09 closing migration (plan 02-03 Task 4 / W2 fix): bootstrap
  // (init + 3x config) now routes through `vcs.gitOnly.init()` and
  // `vcs.gitOnly.configSet(...)`, retiring the last 4 raw-git calls in this
  // function. After this commit createTempGitProject has zero raw-git
  // invocations. The lazy `_loadVcs()` getter still defers the dist-cjs
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
  fs.rmSync(tmpDir, { recursive: true, force: true });
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
// RESEARCH Pitfall 6: BACKENDS_AVAILABLE and parseBackendsEnv MUST come from sdk/dist-cjs (single source).

let _vcsModule = null;
let _backendsModule = null;
function _loadVcs() {
  if (_vcsModule && _backendsModule) return { vcs: _vcsModule, backends: _backendsModule };
  try {
    _vcsModule = require('../sdk/dist-cjs/vcs/index.js');
    _backendsModule = require('../sdk/dist-cjs/vcs/backends.js');
  } catch (err) {
    throw new Error(
      'VCS adapter not built. Run: pnpm -F sdk build:cjs\n' +
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
        if (kind !== 'git') {
          throw new Error("backend '" + kind + "' not yet implemented in Phase 1 (BACKENDS_AVAILABLE=" + backends.BACKENDS_AVAILABLE.join(',') + ')');
        }
        sharedDir = createTempGitProject('gsd-vcs-cjs-');
        sharedAdapter = vcsLib.createVcsAdapter(sharedDir, { kind: 'git' });
        const testApi = sharedAdapter[__VCS_TEST_ONLY_SYMBOL];
        if (!testApi) throw new Error('Adapter missing __vcsTestOnly namespace');
        snapshotHandle = testApi.snapshot();
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

const _exports = {
  runGsdTools, createTempDir, createTempProject, createTempGitProject, cleanup, parseFrontmatter, isUsageOutput, TOOLS_PATH,
  vcsTest,
};
Object.defineProperty(_exports, 'BACKENDS_AVAILABLE', { enumerable: true, get: () => _loadVcs().backends.BACKENDS_AVAILABLE });
Object.defineProperty(_exports, 'BACKENDS_DECLARED', { enumerable: true, get: () => _loadVcs().backends.BACKENDS_DECLARED });
Object.defineProperty(_exports, 'parseBackendsEnv', { enumerable: true, get: () => _loadVcs().backends.parseBackendsEnv });
module.exports = _exports;
