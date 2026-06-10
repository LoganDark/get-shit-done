'use strict';

/**
 * git-cmd.js — token-walk git command classifier.
 *
 * Determines whether a shell command string invokes a specific git
 * subcommand. Handles the four forms that a naive `^git\s+commit` regex
 * misses:
 *
 *   bare:         git commit -m "..."                 ✓
 *   -C path:      git -C /some/path commit -m "..."   ✓ (missed by regex)
 *   env-prefix:   GIT_AUTHOR_NAME=x git commit "..."  ✓ (missed by regex)
 *   full-path:    /usr/bin/git commit -m "..."         ✓ (missed by regex)
 *
 * This module is the single source of truth for git-commit detection so all
 * hooks that need to gate on git commits share one implementation.
 *
 * VCS-audit note (Phase 19 plan 19-09, AUDIT-01): this classifier is
 * git-only by design — it never spawns git (pure string token-walk) and no
 * registered PreToolUse guard in this tree depends on classifying jj
 * commands today (hooks.json PreToolUse = prompt-guard / read-guard /
 * worktree-path-guard; the two consumers of this module —
 * gsd-validate-commit.sh via isGitSubcommand and gsd-workflow-guard.js via
 * tokenize — gate git-specific invocation forms only). jj-command-awareness
 * parity (e.g. classifying `jj commit -m` for Conventional Commits gating)
 * is a deferred v1.5 item; the fork's own copy at c7bd6bee carried zero jj
 * handling either.
 *
 * Exported by the hooks/lib/ directory — require via a path relative to the
 * hook's own __dirname:
 *
 *   const { isGitSubcommand } = require(path.join(__dirname, 'lib', 'git-cmd.js'));
 */

const path = require('path');

/**
 * Git global options that take a following argument.
 * These must be consumed as (option, argument) pairs when walking tokens.
 */
const ARGUMENT_TAKING_FLAGS = new Set([
  '-C',                // working directory
  '--git-dir',         // path to git repository
  '--work-tree',       // path to working tree
  '--namespace',       // git namespace
  '--super-prefix',    // superproject-relative prefix
  '--exec-path',       // path to core git programs (when given an arg)
  '--html-path',
  '--man-path',
  '--info-path',
  '--list-cmds',
]);

/**
 * Git global flags that consume no extra argument.
 */
const BOOLEAN_FLAGS = new Set([
  '-p', '--paginate', '--no-pager',
  '--no-replace-objects', '--bare',
  '--literal-pathspecs', '--glob-pathspecs', '--noglob-pathspecs',
  '--icase-pathspecs', '--no-optional-locks',
  '-P', '--no-lazy-fetch',
  '--version', '--help',
]);

/**
 * Tokenize a shell command string.
 * Handles single-quoted strings, double-quoted strings, and unquoted tokens.
 * Does NOT perform variable expansion or brace expansion.
 *
 * @param {string} cmd
 * @returns {string[]}
 */
function tokenize(cmd) {
  const tokens = [];
  let i = 0;
  const len = cmd.length;

  while (i < len) {
    // Skip whitespace
    while (i < len && /\s/.test(cmd[i])) i++;
    if (i >= len) break;

    let token = '';
    while (i < len && !/\s/.test(cmd[i])) {
      if (cmd[i] === "'") {
        // Single-quoted string: take everything until closing '
        i++;
        while (i < len && cmd[i] !== "'") token += cmd[i++];
        if (i < len) i++; // consume closing '
      } else if (cmd[i] === '"') {
        // Double-quoted string: take everything until closing " (no escape handling)
        i++;
        while (i < len && cmd[i] !== '"') token += cmd[i++];
        if (i < len) i++; // consume closing "
      } else {
        token += cmd[i++];
      }
    }
    if (token) tokens.push(token);
  }

  return tokens;
}

/**
 * Split a shell command string into segments at unquoted command-separator
 * operators: `;`, `&&`, `||`, `|`, `&`, and newlines. Quoted spans (single or
 * double) are copied verbatim — operators inside quotes do not split.
 *
 * 19-review WR-10: without this split, `true && git commit -m x` classified
 * as NOT a git commit (first token `true` is not `git`), so PreToolUse
 * guards built on isGitSubcommand were silently bypassed for compound Bash
 * commands — the most common shape agents emit (`cd x && git commit …`).
 *
 * Residual limits (documented, not handled): command substitution `$(git …)`
 * / backticks, subshell grouping `(git …)`, and indirection via `bash -c
 * 'git …'` are NOT recursed into — the inner command is a quoted/nested
 * string, not a segment. Guards needing those shapes must pre-extract them.
 *
 * @param {string} cmd
 * @returns {string[]} non-empty segments
 */
function splitOnShellOperators(cmd) {
  const segments = [];
  let current = '';
  let i = 0;
  const len = cmd.length;

  const push = () => {
    if (current.trim()) segments.push(current);
    current = '';
  };

  while (i < len) {
    const c = cmd[i];
    if (c === "'" || c === '"') {
      // Copy the quoted span verbatim (no escape handling — matches tokenize).
      const quote = c;
      current += cmd[i++];
      while (i < len && cmd[i] !== quote) current += cmd[i++];
      if (i < len) current += cmd[i++]; // consume closing quote
      continue;
    }
    if (c === '\n' || c === ';') {
      push();
      i++;
      continue;
    }
    if (c === '&') {
      push();
      i += cmd[i + 1] === '&' ? 2 : 1; // '&&' or background '&'
      continue;
    }
    if (c === '|') {
      push();
      i += cmd[i + 1] === '|' ? 2 : 1; // '||' or pipe '|'
      continue;
    }
    current += c;
    i++;
  }
  push();

  return segments;
}

/**
 * Return true if `cmd` invokes the git subcommand `sub`.
 *
 * 19-review WR-10: the command is first split on unquoted shell operators
 * (`;`, `&&`, `||`, `|`, `&`, newline) and the token-walk runs on EACH
 * segment — `cd x && git commit -m y` matches. See splitOnShellOperators
 * for the documented residual limits (subshells, `bash -c`).
 *
 * @param {string} cmd  - Full shell command string (may include env vars, full paths)
 * @param {string} sub  - Subcommand to test for, e.g. 'commit'
 * @returns {boolean}
 */
function isGitSubcommand(cmd, sub) {
  if (!cmd || !sub) return false;
  return splitOnShellOperators(cmd).some((segment) => segmentIsGitSubcommand(segment, sub));
}

/**
 * Token-walk a single (operator-free) command segment for `git <sub>`.
 *
 * @param {string} cmd
 * @param {string} sub
 * @returns {boolean}
 */
function segmentIsGitSubcommand(cmd, sub) {
  const tokens = tokenize(cmd);
  let i = 0;

  // Phase 1: skip leading VAR=VALUE environment assignments
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) {
    i++;
  }

  // Phase 2: the next token must be the git executable
  if (i >= tokens.length) return false;
  const gitToken = tokens[i++];
  if (path.basename(gitToken) !== 'git') return false;

  // Phase 3: consume git global options
  while (i < tokens.length) {
    const t = tokens[i];

    // --flag=value form for argument-taking flags
    const eqIdx = t.indexOf('=');
    const flagName = eqIdx !== -1 ? t.slice(0, eqIdx) : t;
    if (ARGUMENT_TAKING_FLAGS.has(flagName)) {
      if (eqIdx !== -1) {
        // consumed as one token: --git-dir=.git
        i++;
      } else {
        // consumed as two tokens: -C /path
        i += 2;
      }
      continue;
    }

    if (BOOLEAN_FLAGS.has(t)) {
      i++;
      continue;
    }

    // Not a global option — this is the subcommand
    break;
  }

  // Phase 4: check the subcommand
  if (i >= tokens.length) return false;
  return tokens[i] === sub;
}

module.exports = { isGitSubcommand, tokenize, splitOnShellOperators };
