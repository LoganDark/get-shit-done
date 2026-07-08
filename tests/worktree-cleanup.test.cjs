// allow-test-rule: source-text-is-the-product
// Workflow markdown is the installed orchestration contract.

'use strict';

/**
 * Worktree Cleanup Module — HEAD attachment, post-executor cleanup, and contract tests
 *
 * Seam: gsd-core/workflows/{execute-phase,execute-plan,quick}.md,
 *       agents/gsd-executor.md, references/git-integration.md
 *
 * Split from the consolidated 13→2 worktree cluster (≤800 LOC/file):
 *   - tests/bug-2924-worktree-head-attachment.test.cjs   (#2924: HEAD attachment)
 *   - tests/worktree-cleanup.test.cjs                    (#1496: post-executor cleanup)
 *   - tests/worktree-merge-protection.test.cjs           (#1756: orchestrator file protection)
 *   - tests/worktree-safety.test.cjs                     (#1977: commit safety hardening)
 *   - tests/worktree-stagger.test.cjs                    (#1511: sequential dispatch)
 *   - tests/bug-3384-worktree-cleanup-manifest.test.cjs  (workflow contract side)
 *   - tests/bug-3425-worktree-cleanup-cwd-pin.test.cjs   (#3425: CWD pin)
 *
 * See also: worktree.test.cjs     (#2015, #2075, #2431, #2774)
 *           worktree-safety.test.cjs  (safety function unit tests)
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');
const EXECUTE_PHASE_PATH = path.join(REPO_ROOT, 'gsd-core', 'workflows', 'execute-phase.md');
const EXECUTE_PLAN_PATH = path.join(REPO_ROOT, 'gsd-core', 'workflows', 'execute-plan.md');
const QUICK_PATH = path.join(REPO_ROOT, 'gsd-core', 'workflows', 'quick.md');
const EXECUTOR_AGENT_PATH = path.join(REPO_ROOT, 'agents', 'gsd-executor.md');
const GIT_INTEGRATION_PATH = path.join(REPO_ROOT, 'gsd-core', 'references', 'git-integration.md');
const WORKTREE_BRANCH_CHECK_FRAGMENT = path.join(REPO_ROOT, 'gsd-core', 'references', 'worktree-branch-check.md');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractNamedBlock(markdown, blockName) {
  const open = `<${blockName}>`;
  const close = `</${blockName}>`;
  const start = markdown.indexOf(open);
  if (start === -1) return null;
  const end = markdown.indexOf(close, start + open.length);
  if (end === -1) return null;
  return markdown.slice(start + open.length, end);
}

/**
 * Extract all fenced code blocks (```...```) from a markdown chunk.
 * Returns array of { lang, body } objects.
 */
function extractFencedCodeBlocks(markdown) {
  const blocks = [];
  const lines = markdown.split(/\r?\n/);
  let inFence = false;
  let fenceLang = '';
  let buffer = [];
  for (const line of lines) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('```')) {
      if (!inFence) {
        inFence = true;
        fenceLang = trimmed.slice(3).trim();
        buffer = [];
      } else {
        blocks.push({ lang: fenceLang, body: buffer.join('\n') });
        inFence = false;
        fenceLang = '';
        buffer = [];
      }
    } else if (inFence) {
      buffer.push(line);
    }
  }
  return blocks;
}

/**
 * Tokenize a shell-like script into individual statements (split on `;`, `&&`, `||`, newlines)
 * and return commands as arrays of word tokens.
 */
function shellStatements(script) {
  const statements = [];
  const lines = script.split(/\r?\n/);
  for (let raw of lines) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const parts = line.split(/(?:&&|\|\||;)/);
    for (const part of parts) {
      let trimmed = part.trim();
      if (!trimmed) continue;
      const assignMatch = trimmed.match(/^[A-Za-z_][A-Za-z0-9_]*=(.*)$/);
      if (assignMatch) trimmed = assignMatch[1];
      const subMatch = trimmed.match(/^\$\((.*?)\)?$/);
      if (subMatch) trimmed = subMatch[1];
      if (trimmed.startsWith('$(')) trimmed = trimmed.slice(2);
      trimmed = trimmed.replace(/\)+\s*$/, '').trim();
      if (!trimmed) continue;
      statements.push(trimmed.split(/\s+/).filter(Boolean));
    }
  }
  return statements;
}

/**
 * Find the line index of the first command matching a predicate.
 * Returns -1 when not found.
 */
function findCommandIndex(statements, predicate) {
  for (let i = 0; i < statements.length; i++) {
    if (predicate(statements[i])) return i;
  }
  return -1;
}

// ─── #2924: HEAD attachment + destructive recovery ──────────────────────────

describe('bug #2924: worktree HEAD attachment + destructive recovery', () => {
  describe('execute-phase.md worktree_branch_check', () => {
    const executePhaseContent = fs.readFileSync(EXECUTE_PHASE_PATH, 'utf-8');
    const fragmentContent = fs.readFileSync(WORKTREE_BRANCH_CHECK_FRAGMENT, 'utf-8');
    const block = extractNamedBlock(fragmentContent, 'worktree_branch_check');

    test('execute-phase.md references the canonical fragment', () => {
      assert.ok(
        executePhaseContent.includes('worktree-branch-check.md'),
        'execute-phase.md must reference the canonical worktree-branch-check.md fragment'
      );
    });

    test('block exists in canonical fragment', () => {
      assert.ok(block, 'worktree-branch-check.md must contain a <worktree_branch_check> block');
    });

    test('block invokes `git symbolic-ref` to inspect HEAD attachment', () => {
      const codeBlocks = extractFencedCodeBlocks(block);
      const allStatements = codeBlocks.flatMap(({ body }) => shellStatements(body));
      const idx = findCommandIndex(allStatements, (cmd) =>
        cmd[0] === 'git' && cmd[1] === 'symbolic-ref' && cmd.includes('HEAD')
      );
      assert.notStrictEqual(
        idx, -1,
        'worktree_branch_check must run `git symbolic-ref ... HEAD` to verify HEAD attachment before any reset'
      );
    });

    test('block is verify-only: HEAD assertion present, no git reset, fails closed (#48)', () => {
      const codeBlocks = extractFencedCodeBlocks(block);
      const allStatements = codeBlocks.flatMap(({ body }) => shellStatements(body));
      const symbolicRefIdx = findCommandIndex(allStatements, (cmd) => cmd[0] === 'git' && cmd[1] === 'symbolic-ref' && cmd.includes('HEAD'));
      const resetIdx = findCommandIndex(allStatements, (cmd) => cmd[0] === 'git' && cmd[1] === 'reset');
      assert.notStrictEqual(symbolicRefIdx, -1, 'symbolic-ref HEAD-attachment check must exist');
      assert.strictEqual(resetIdx, -1, 'fragment must be verify-only — no git reset self-recovery (#48)');
      assert.ok(/exit 42/.test(block), 'fragment must fail closed with exit 42 (#48)');
    });

    test('block names protected branches that must NOT be the agent branch', () => {
      // The protected-branch list must be enforced by name. Parse it out of the
      // shell scripts and verify required names are present.
      const codeBlocks = extractFencedCodeBlocks(block);
      const scripts = codeBlocks.map(({ body }) => body).join('\n');
      // Look for an assignment whose value is a regex/list naming protected refs.
      // Acceptable forms: PROTECTED_BRANCHES_RE='...' or grep -Eq '^(main|...)$'
      // Parse the alternation list out of the grep -E pattern so we assert
      // structurally on the protected-branch enumeration rather than via
      // raw substring matching (release/* contains regex-special chars and
      // can't be safely tested with `\b...\b`).
      const altMatch = scripts.match(/grep\s+-Eq?\s+'\^\(([^)]+)\)\$'/);
      assert.ok(
        altMatch,
        'worktree_branch_check must contain a `grep -Eq` protected-branch alternation pattern'
      );
      const branches = altMatch[1].split('|').map((b) => b.trim());
      const required = ['main', 'master', 'develop', 'trunk', 'release/.*'];
      for (const name of required) {
        assert.ok(
          branches.includes(name),
          `worktree_branch_check protected-branch alternation must include '${name}' (found: ${branches.join(', ')})`
        );
      }
    });

    test('block enforces positive worktree-agent-* allow-list (#2924 hardening)', () => {
      const codeBlocks = extractFencedCodeBlocks(block);
      const scripts = codeBlocks.map(({ body }) => body).join('\n');
      // Allow-list must reference the canonical Claude Code worktree-agent-<id>
      // namespace via a regex assertion (grep -Eq '^worktree-agent-...').
      const allowListRe = /grep\s+-Eq?\s+'\^worktree-agent-/;
      assert.ok(
        allowListRe.test(scripts),
        'worktree_branch_check must enforce a positive allow-list matching ^worktree-agent-* (#2924 hardening)'
      );
    });

    test('block forbids `git update-ref` self-recovery in its guidance text', () => {
      // The forbidding statement is documentation text, not a shell command,
      // so structural shell parsing does not apply. Verify the prohibition
      // appears as standalone guidance somewhere in the block.
      assert.ok(
        block.includes('update-ref'),
        'worktree_branch_check must explicitly forbid `git update-ref` self-recovery'
      );
    });
  });

  describe('execute-phase.md no longer defaults to --no-verify in parallel mode', () => {
    const content = fs.readFileSync(EXECUTE_PHASE_PATH, 'utf-8');
    const block = extractNamedBlock(content, 'parallel_execution');

    test('parallel_execution block exists', () => {
      assert.ok(block, 'execute-phase.md must contain a <parallel_execution> block');
    });

    test('parallel_execution does NOT instruct agents to use --no-verify by default', () => {
      // Tokenize the block as plain words and look for an unconditional
      // imperative naming `--no-verify`. The acceptable presence is in a
      // negated/opt-out context (e.g. "Do NOT pass --no-verify"); reject
      // any sentence whose first verb is "Use --no-verify".
      const sentences = block
        .replace(/\r?\n+/g, ' ')
        .split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        if (!sentence.includes('--no-verify')) continue;
        const lower = sentence.toLowerCase();
        const isProhibition =
          /\b(do not|don't|never|no longer)\b/.test(lower) ||
          /\bopt[\s-]?out\b/.test(lower) ||
          /\bopt[\s-]?in\b/.test(lower) ||
          /\bif\b/.test(lower);
        assert.ok(
          isProhibition,
          `parallel_execution sentence appears to mandate --no-verify by default: "${sentence.trim()}"`
        );
      }
    });
  });

  describe('execute-plan.md no longer mandates --no-verify for parallel executor', () => {
    const content = fs.readFileSync(EXECUTE_PLAN_PATH, 'utf-8');
    const block = extractNamedBlock(content, 'precommit_failure_handling');
    test('precommit_failure_handling block exists', () => {
      assert.ok(block, 'execute-plan.md must contain a <precommit_failure_handling> block');
    });

    test('parallel-executor sub-section does not unconditionally mandate --no-verify', () => {
      // Locate the parallel-executor sub-section heading and parse the
      // sentences under it.
      const headingIdx = block.indexOf('parallel executor');
      assert.notStrictEqual(headingIdx, -1, 'must contain a parallel-executor sub-section');
      const endIdx = block.indexOf('**If running as the sole', headingIdx);
      assert.notStrictEqual(endIdx, -1, 'parallel-executor sub-section terminator must exist');
      const subBlock = block.slice(headingIdx, endIdx);
      assert.ok(subBlock.length > 0, 'sub-section must have content');
      const sentences = subBlock.replace(/\r?\n+/g, ' ').split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        if (!sentence.includes('--no-verify')) continue;
        const lower = sentence.toLowerCase();
        const isProhibition =
          /\b(do not|don't|never|no longer)\b/.test(lower) ||
          /\bopt[\s-]?out\b/.test(lower) ||
          /\bopt[\s-]?in\b/.test(lower) ||
          /\bif\b/.test(lower);
        assert.ok(
          isProhibition,
          `parallel-executor guidance sentence appears to mandate --no-verify: "${sentence.trim()}"`
        );
      }
    });
  });

  describe('quick.md worktree_branch_check', () => {
    const quickContent = fs.readFileSync(QUICK_PATH, 'utf-8');
    const fragmentContent = fs.readFileSync(WORKTREE_BRANCH_CHECK_FRAGMENT, 'utf-8');
    const block = extractNamedBlock(fragmentContent, 'worktree_branch_check');

    test('quick.md references the canonical fragment', () => {
      assert.ok(
        quickContent.includes('worktree-branch-check.md'),
        'quick.md must reference the canonical worktree-branch-check.md fragment'
      );
    });

    test('block exists in canonical fragment', () => {
      assert.ok(block, 'worktree-branch-check.md must contain a <worktree_branch_check> block');
    });

    test('block references `git symbolic-ref` for HEAD attachment assertion', () => {
      // Search the block from the canonical fragment as a token stream of statements.
      const codeBlocks = extractFencedCodeBlocks(block);
      const allStatements = codeBlocks.flatMap(({ body }) => shellStatements(body));
      const idx = findCommandIndex(allStatements, (cmd) =>
        cmd[0] === 'git' && cmd[1] === 'symbolic-ref' && cmd.includes('HEAD')
      );
      assert.notStrictEqual(
        idx, -1,
        'quick.md worktree_branch_check must run `git symbolic-ref ... HEAD`'
      );
    });

    test('block is verify-only: HEAD assertion present, no git reset, fails closed (#48)', () => {
      // Verify-only contract: symbolic-ref exists, no git reset at all, fails closed with exit 42.
      const codeBlocks = extractFencedCodeBlocks(block);
      const allStatements = codeBlocks.flatMap(({ body }) => shellStatements(body));
      const symbolicRefIdx = findCommandIndex(allStatements, (cmd) =>
        cmd[0] === 'git' && cmd[1] === 'symbolic-ref' && cmd.includes('HEAD')
      );
      const resetIdx = findCommandIndex(allStatements, (cmd) =>
        cmd[0] === 'git' && cmd[1] === 'reset'
      );
      assert.notStrictEqual(symbolicRefIdx, -1, 'symbolic-ref HEAD-attachment check must exist');
      assert.strictEqual(resetIdx, -1, 'fragment must be verify-only — no git reset self-recovery (#48)');
      assert.ok(/exit 42/.test(block), 'fragment must fail closed with exit 42 (#48)');
    });

    test('block forbids `git update-ref` self-recovery', () => {
      assert.ok(
        block.includes('update-ref'),
        'quick.md worktree_branch_check must explicitly forbid `git update-ref` self-recovery'
      );
    });

    test('block enforces positive worktree-agent-* allow-list (#2924 hardening)', () => {
      const allowListRe = /grep\s+-Eq?\s+'\^worktree-agent-/;
      assert.ok(
        allowListRe.test(block),
        'quick.md worktree_branch_check must enforce a positive allow-list matching ^worktree-agent-* (#2924 hardening)'
      );
    });
  });

  describe('quick.md pre-dispatch plan commit no longer hard-codes --no-verify', () => {
    const content = fs.readFileSync(QUICK_PATH, 'utf-8');
    const codeBlocks = extractFencedCodeBlocks(content);
    // 19-12 re-point: the jj fork's Step 5.6 commits via the adapter bridge
    // (`gsd_run query commit ... --files <PLAN.md>`), not raw `git commit`.
    const target = codeBlocks.find(({ body }) =>
      body.includes('pre-dispatch plan') &&
      (body.includes('git commit') || body.includes('query commit'))
    );
    test('pre-dispatch plan commit block exists', () => {
      assert.ok(target, 'quick.md must contain the pre-dispatch plan commit block');
    });

    test('pre-dispatch plan commit gates --no-verify behind a config flag', () => {
      // The block must contain BOTH a commit invocation without --no-verify
      // (the default, hook-firing path) AND gate any --no-verify variant
      // behind the workflow.worktree_skip_hooks config flag.
      const commitLines = target.body
        .split('\n')
        // 19-12 re-point: `$(gsd_run query commit …)` captures the envelope, so
        // the invocation may follow `$(` rather than whitespace.
        .filter((l) => /(?:^|[\s(])(?:git commit|gsd_run query commit)\b/.test(l));
      const noVerifyCommits = commitLines.filter((l) => l.includes('--no-verify'));
      const cleanCommits = commitLines.filter((l) => !l.includes('--no-verify'));
      assert.ok(
        cleanCommits.length >= 1,
        'must include at least one commit invocation without --no-verify (default path)'
      );
      // If --no-verify still appears, the block must reference the opt-in flag.
      if (noVerifyCommits.length > 0) {
        assert.ok(
          target.body.includes('worktree_skip_hooks'),
          '--no-verify commits must be gated behind workflow.worktree_skip_hooks config flag'
        );
      }
    });
  });

  describe('gsd-executor.md prohibits update-ref self-recovery', () => {
    const content = fs.readFileSync(EXECUTOR_AGENT_PATH, 'utf-8');
    const block = extractNamedBlock(content, 'destructive_git_prohibition');

    test('destructive_git_prohibition block exists', () => {
      assert.ok(block, 'gsd-executor.md must contain a <destructive_git_prohibition> block');
    });

    test('block prohibits `git update-ref refs/heads/<protected>`', () => {
      assert.ok(
        block.includes('update-ref'),
        'destructive_git_prohibition must enumerate `git update-ref` as a prohibited command'
      );
      assert.ok(
        block.includes('protected') || block.includes('main') || block.includes('master'),
        'destructive_git_prohibition must call out protected branches in the update-ref prohibition'
      );
    });

    test('block references issue #2924', () => {
      assert.ok(
        block.includes('#2924'),
        'destructive_git_prohibition should cite #2924 as the source of the update-ref prohibition'
      );
    });
  });

  describe('gsd-executor.md task_commit_protocol enforces worktree-agent-* allow-list', () => {
    const content = fs.readFileSync(EXECUTOR_AGENT_PATH, 'utf-8');
    const block = extractNamedBlock(content, 'task_commit_protocol');

    test('task_commit_protocol block exists', () => {
      assert.ok(block, 'gsd-executor.md must contain a <task_commit_protocol> block');
    });

    test('step 0 enforces the dispatched-cwd assertion (#2924 hardening; 19-12 re-point)', () => {
      // 19-12 re-point: the jj fork's Phase 11 P04 collapsed the four
      // worktree-aware guards (incl. the ^worktree-agent-* allow-list grep)
      // into the single backend-opaque `workspace.assert-dispatched-cwd`
      // verb call, which verifies the agent sits in a dispatched subagent
      // workspace (not the primary, not a protected-ref-attached HEAD).
      const codeBlocks = extractFencedCodeBlocks(block);
      const scripts = codeBlocks.map(({ body }) => body).join('\n');
      assert.ok(
        scripts.includes('workspace.assert-dispatched-cwd'),
        'task_commit_protocol step 0 must run the workspace.assert-dispatched-cwd precondition (#2924 hardening; 19-12 re-point)'
      );
      assert.ok(
        /isPrimary/.test(scripts),
        'step 0 must fail when the cwd resolves to the primary workspace (isPrimary guard)'
      );
    });
  });

  describe('no workflow file performs unconditional update-ref on a protected branch', () => {
    const workflowsDir = path.join(REPO_ROOT, 'gsd-core', 'workflows');
    const workflowFiles = fs
      .readdirSync(workflowsDir, { recursive: true })
      .filter((f) => typeof f === 'string' && f.endsWith('.md'))
      .map((f) => path.join(workflowsDir, f));

    for (const filePath of workflowFiles) {
      test(`${path.basename(filePath)} contains no update-ref of a protected ref`, () => {
        const content = fs.readFileSync(filePath, 'utf-8');
        const blocks = extractFencedCodeBlocks(content);
        for (const { body } of blocks) {
          const statements = shellStatements(body);
          for (const cmd of statements) {
            if (cmd[0] !== 'git') continue;
            if (cmd[1] !== 'update-ref') continue;
            // Reject any update-ref that targets a protected ref.
            const target = cmd[2] || '';
            const protectedRe = /^refs\/heads\/(main|master|develop|trunk|release\/.+)$/;
            assert.ok(
              !protectedRe.test(target),
              `${path.basename(filePath)} contains forbidden 'git update-ref ${target}' (#2924)`
            );
          }
        }
      });
    }
  });

  describe('git-integration.md guidance reflects new default', () => {
    const content = fs.readFileSync(GIT_INTEGRATION_PATH, 'utf-8');
    test('parallel-agents guidance no longer mandates --no-verify', () => {
      // Find the parallel-agents callout and parse its sentences.
      const idx = content.indexOf('Parallel agents');
      assert.notStrictEqual(idx, -1, 'must contain a "Parallel agents" callout');
      const section = content.slice(idx);
      const endMatch = section.slice(1).match(/\r?\n#{1,6}\s/);
      assert.ok(endMatch, 'Parallel agents section must terminate at the next heading');
      const tail = section.slice(0, 1 + endMatch.index);
      const sentences = tail.replace(/\r?\n+/g, ' ').split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        if (!sentence.includes('--no-verify')) continue;
        const lower = sentence.toLowerCase();
        const isProhibition =
          /\b(do not|don't|never|no longer)\b/.test(lower) ||
          /\bopt[\s-]?out\b/.test(lower) ||
          /\bopt[\s-]?in\b/.test(lower) ||
          /\bif\b/.test(lower);
        assert.ok(
          isProhibition,
          `git-integration.md "Parallel agents" sentence appears to mandate --no-verify: "${sentence.trim()}"`
        );
      }
    });
  });
});

// ─── #1496: post-executor worktree cleanup ──────────────────────────────────

describe('worktree cleanup after executor completes (#1496)', () => {
  const executePhasePath = path.join(__dirname, '..', 'gsd-core', 'workflows', 'execute-phase.md');
  const quickPath = path.join(__dirname, '..', 'gsd-core', 'workflows', 'quick.md');

  test('execute-phase.md includes workspace fan-in (cleanup) step', () => {
    // 19-12 re-point: cleanup is delegated to the cross-backend
    // workspace.parallel.fan-in verb (Phase 11 rewiring), whose backends own
    // `git worktree remove`/`git branch -D` (git) and workspace reap (jj).
    const content = fs.readFileSync(executePhasePath, 'utf8');
    assert.ok(content.includes('workspace.parallel.fan-in'),
      'execute-phase should delegate post-wave cleanup to workspace.parallel.fan-in (19-12 re-point)');
  });

  test('execute-phase.md merges worktree branch before removing', () => {
    const content = fs.readFileSync(executePhasePath, 'utf8');
    assert.ok(content.includes('git merge'),
      'cleanup should merge worktree branch into current branch');
  });

  test('execute-phase.md handles merge conflicts gracefully', () => {
    const content = fs.readFileSync(executePhasePath, 'utf8');
    assert.ok(
      content.includes('Merge conflict') || content.includes('merge conflict'),
      'cleanup should handle merge conflicts gracefully'
    );
  });

  test('execute-phase.md skips cleanup when use_worktrees is false', () => {
    const content = fs.readFileSync(executePhasePath, 'utf8');
    assert.ok(content.includes('use_worktrees'),
      'cleanup should respect workflow.use_worktrees config');
  });

  test('quick.md includes workspace fan-in after executor returns', () => {
    const content = fs.readFileSync(quickPath, 'utf8');
    // 19-12 re-point: after #3797 quick.md delegated to worktree.cleanup-wave;
    // the jj fork's Phase 11 rewiring delegates to workspace.parallel.fan-in,
    // which handles merge-back + workspace removal internally.
    assert.ok(
      content.includes('Workspace fan-in') || content.includes('workspace.parallel.fan-in'),
      'quick cleanup must delegate to gsd_run query workspace.parallel.fan-in (#3797; 19-12 re-point)',
    );
  });

  test('quick.md fan-in guard exits 1 to enforce safety semantics', () => {
    const content = fs.readFileSync(quickPath, 'utf8');
    // Fail-closed: conflicted/failedReaped fan-in results exit 1 rather than
    // being swallowed (19-12 re-point of the cleanup-wave `|| exit 1`).
    assert.match(
      content,
      /\[ "\$CONFLICTED" = "true" \] \|\| \[ "\$FAILED_REAPED" -gt 0 \][\s\S]{0,200}?exit 1/,
      'quick.md fan-in must exit 1 on conflicted/failedReaped — SDK safety refusals must surface (#3797; 19-12 re-point)',
    );
  });

  test('cleanup uses git worktree list to discover orphans', () => {
    const content = fs.readFileSync(executePhasePath, 'utf8');
    assert.ok(content.includes('git worktree list'),
      'cleanup should discover worktrees via git worktree list');
  });
});

// ─── #1756: orchestrator file protection during merge ────────────────────────

describe('worktree merge: orchestrator file protection (#1756)', () => {
  // After #3797 architectural fix: execute-phase.md and quick.md delegate worktree
  // cleanup to the SDK's worktree.cleanup-wave command (which handles STATE.md/ROADMAP.md
  // backup and restore internally). The manual shell backup loop has been removed.
  // The workflow contracts now verify SDK delegation rather than inline backup code.

  test('execute-phase.md delegates wave cleanup to SDK with a fail-closed result guard', () => {
    const content = fs.readFileSync(EXECUTE_PHASE_PATH, 'utf-8');
    // 19-12 re-point: workspace.parallel.fan-in handles merge-back + workspace
    // cleanup internally; the result guard exits 1 on conflicted/failedReaped.
    assert.match(
      content,
      /gsd_run query workspace\.parallel\.fan-in --handle/,
      'execute-phase.md must delegate to gsd_run query workspace.parallel.fan-in (#3797; 19-12 re-point)',
    );
    assert.match(
      content,
      /\[ "\$CONFLICTED" = "true" \] \|\| \[ "\$FAILED_REAPED" -gt 0 \][\s\S]{0,200}?exit 1/,
      'execute-phase.md fan-in result guard must exit 1 (fail-closed) (#3797; 19-12 re-point)',
    );
  });

  test('execute-phase.md documents the conflicted-fan-in recovery path for custom deviations', () => {
    const content = fs.readFileSync(EXECUTE_PHASE_PATH, 'utf-8');
    // 19-12 re-point: the git-worktree cleanup-tail snippet retired with the
    // manifest machinery (Phase 11 D-01); deviations now surface through the
    // fan-in result envelope (conflicted/failedReaped) which the workflow
    // surfaces to the operator instead of silently cleaning up.
    assert.match(
      content,
      /Fan-in surfaced issues \(conflicted=\$CONFLICTED, failedReaped=\$FAILED_REAPED\)/,
      'execute-phase.md must surface conflicted/failedReaped fan-in results for manual recovery (19-12 re-point)',
    );
  });

  test('execute-phase.md detects files deleted on main but re-added by worktree (cleanup-tail)', () => {
    // The cleanup-tail snippet includes resurrection detection via git diff --diff-filter=A.
    // This verifies the safety mechanism is still documented in the workflow.
    const content = fs.readFileSync(EXECUTE_PHASE_PATH, 'utf-8');
    // Resurrection detection is handled inside worktree.cleanup-wave (SDK internals).
    // We verify the workflow still mentions WAVE_WORKTREE_MANIFEST to ensure
    // manifest-scoped cleanup is enforced (#3384).
    assert.match(content, /WAVE_WORKTREE_MANIFEST/,
      'execute-phase must use WAVE_WORKTREE_MANIFEST to scope cleanup (#3384)');
  });

  test('quick.md delegates wave cleanup to SDK with a fail-closed result guard', () => {
    const content = fs.readFileSync(QUICK_PATH, 'utf-8');
    // 19-12 re-point: quick.md delegates to workspace.parallel.fan-in (no
    // manifest file exists; the Handle JSON is the envelope) and exits 1 on
    // conflicted/failedReaped results.
    assert.match(
      content,
      /gsd_run query workspace\.parallel\.fan-in --handle/,
      'quick.md must delegate to gsd_run query workspace.parallel.fan-in (#3797; 19-12 re-point)',
    );
  });
});

// ─── #1977: commit safety hardening ─────────────────────────────────────────

describe('worktree commit safety hardening (#1977)', () => {
  test('execute-plan worktree_branch_check has no Windows-only platform qualifier', () => {
    const content = fs.readFileSync(EXECUTE_PLAN_PATH, 'utf-8');
    assert.ok(content.includes('worktree_branch_check'), 'execute-plan.md must contain a worktree_branch_check block');
    assert.ok(content.includes('worktree-branch-check.md'), 'execute-plan.md must reference the canonical worktree-branch-check.md fragment');
    const hasWindowsOnlyQualifier = (
      /Windows.only/i.test(content) ||
      /affects Windows only/i.test(content) ||
      /only on Windows/i.test(content) ||
      /Windows-specific/i.test(content)
    );
    assert.ok(!hasWindowsOnlyQualifier, 'worktree_branch_check must not be labeled as Windows-only');
    const isUniversal = (
      /affects all platforms/i.test(content) ||
      /all platforms/i.test(content) ||
      /cross.platform/i.test(content)
    );
    assert.ok(isUniversal, 'worktree_branch_check description must indicate the fix applies to all platforms');
  });

  test('gsd-executor.md task_commit_protocol includes post-commit deletion verification', () => {
    // 19-12 re-point: the diff verb does not expose --diff-filter pass-through
    // yet, so the executor protocol filters the name-status output for `D`
    // rows client-side (D-06) and WARNs on unexpected deletions.
    const content = fs.readFileSync(EXECUTOR_AGENT_PATH, 'utf-8');
    assert.ok(
      content.includes('--diff-filter=D')
        || (/query diff --name-status/.test(content) && /status == "D"/.test(content)),
      'must include post-commit deletion verification (--diff-filter=D or the verb-based D-row filter)'
    );
    assert.ok(
      content.includes('WARNING') || content.includes('DELETIONS'),
      'must warn when a commit includes file deletions'
    );
  });

  test('post-merge deletion audit lives at the executor commit boundary (19-12 re-point)', () => {
    // 19-12 re-point: the pre-merge deletion check of the retired worktree
    // cleanup section moved to the per-commit deletion audit in
    // agents/gsd-executor.md (step 6 of task_commit_protocol) — every commit
    // is checked before fan-in ever runs, which subsumes the old pre-merge
    // single point.
    const executor = fs.readFileSync(EXECUTOR_AGENT_PATH, 'utf-8');
    assert.ok(
      /Post-commit deletion check/.test(executor),
      'gsd-executor.md must document the post-commit deletion check (#2384/#3797; 19-12 re-point)',
    );
  });
});


// ─── #1511: sequential dispatch ─────────────────────────────────────────────

describe('worktree sequential dispatch', () => {
  test('execute-phase.md exists', () => {
    assert.ok(fs.existsSync(EXECUTE_PHASE_PATH), 'execute-phase.md should exist');
  });

  test('execute-phase explains git config.lock contention', () => {
    const content = fs.readFileSync(EXECUTE_PHASE_PATH, 'utf-8');
    assert.ok(content.includes('config.lock'), 'should explain the git config.lock race condition');
  });

  test('execute-phase requires sequential dispatch with run_in_background', () => {
    const content = fs.readFileSync(EXECUTE_PHASE_PATH, 'utf-8');
    assert.ok(content.includes('run_in_background'), 'should instruct one-at-a-time dispatch with run_in_background');
  });

  test('execute-phase warns against multiple Task calls in single message', () => {
    const content = fs.readFileSync(EXECUTE_PHASE_PATH, 'utf-8');
    assert.ok(
      content.includes('WRONG') && content.includes('single message'),
      'should warn against sending multiple Task() calls simultaneously'
    );
  });
});


// ─── #3384: cleanup manifest workflow contracts ──────────────────────────────

describe('bug #3384: worktree cleanup workflow contracts', () => {
  // 19-12 re-point: Phase 11 D-01 retired the manifest files; the #3384
  // anti-broad-discovery contract rides the dispatch envelope — the Handle
  // JSON is the only workspace-set source of truth, consumed directly by
  // workspace.parallel.fan-in. Both workflows document the re-expression and
  // neither performs global worktree discovery in cleanup.
  test('execute-phase contract scopes cleanup to the dispatch envelope instead of global worktree discovery', () => {
    const content = fs.readFileSync(EXECUTE_PHASE_PATH, 'utf8');
    assert.match(content, /\$HANDLE_JSON/);
    assert.match(content, /workspace\.parallel\.fan-in/);
    assert.match(content, /#3384/);
    assert.doesNotMatch(content, /done < <\(node -e 'const fs=require\("fs"\);const p=process\.env\.WAVE_WORKTREE_MANIFEST/);
    assert.doesNotMatch(content, /done < <\(git worktree list --porcelain \| grep "\^worktree " \| grep "\\\.claude\/worktrees\/agent-"/);
  });

  test('#1297 gsd-executor self-reports authoritative worktree metadata', () => {
    const content = fs.readFileSync(EXECUTOR_AGENT_PATH, 'utf8');
    assert.match(content, /<worktree_metadata_capture>/);
    assert.match(content, /git rev-parse --show-toplevel/);
    assert.match(content, /git rev-parse --abbrev-ref HEAD/);
    assert.match(content, /GSD_WORKTREE_EXPECTED_BASE=\$\(git rev-parse HEAD\)/);
    assert.match(content, /<worktree_metadata>/);
    assert.match(content, /"worktree_path":/);
    assert.match(content, /"branch":/);
    assert.match(content, /"expected_base":/);
  });

  test('#1297 execute-phase consumes executor-returned worktree metadata before harness metadata', () => {
    const content = fs.readFileSync(EXECUTE_PHASE_PATH, 'utf8');
    assert.match(content, /<worktree_metadata>/);
    assert.match(content, /executor-returned worktree metadata/i);
    assert.match(content, /harness metadata/i);
    assert.ok(
      content.indexOf('executor-returned worktree metadata') < content.indexOf('harness metadata'),
      'execute-phase must prefer executor-returned worktree metadata before runtime harness metadata (#1297)'
    );
  });

  test('quick contract scopes cleanup to the dispatch envelope instead of global worktree discovery', () => {
    const content = fs.readFileSync(QUICK_PATH, 'utf8');
    assert.match(content, /\$HANDLE_JSON/);
    assert.match(content, /workspace\.parallel\.fan-in/);
    assert.match(content, /#3384/);
    assert.doesNotMatch(content, /done < <\(node -e 'const fs=require\("fs"\);const p=process\.env\.QUICK_WORKTREE_MANIFEST/);
    assert.doesNotMatch(content, /done < <\(git worktree list --porcelain \| grep "\^worktree " \| grep "\\\.claude\/worktrees\/agent-"/);
  });
});


// ─── #3425: CWD pin before cleanup ──────────────────────────────────────────

test('#3425: pre-fan-in drift guard pins the orchestrator to its expected branch (19-12 re-point)', () => {
  // 19-12 re-point: the manifest-based PRIMARY_WT pin retired with the
  // manifest machinery (Phase 11 D-01). The surviving #3425/#3174 invariant —
  // "the orchestrator must be on its own expected branch before any
  // merge-back" — is the EXPECTED_BRANCH FATAL check immediately before
  // workspace.parallel.fan-in.
  const content = fs.readFileSync(EXECUTE_PHASE_PATH, 'utf8');
  assert.match(content, /EXPECTED_BRANCH=\$\(gsd_run query current-branch/);
  assert.match(
    content,
    /FATAL: orchestrator on '\$ORCH_BRANCH' but expected '\$EXPECTED_BRANCH' before fan-in \(#3174-class drift\)/,
  );
});

test('#3425: quick.md carries the same pre-fan-in drift guard (19-12 re-point)', () => {
  const content = fs.readFileSync(QUICK_PATH, 'utf8');
  assert.match(content, /EXPECTED_BRANCH=\$\(gsd_run query current-branch/);
});

describe('bug #48: orchestrator cwd-drift guard at execute_waves entry', () => {
  const content = fs.readFileSync(EXECUTE_PHASE_PATH, 'utf-8');
  const stepStart = content.indexOf('<step name="execute_waves">');
  const nextStep = content.indexOf('<step ', stepStart + 1);
  const stepBody = content.slice(stepStart, nextStep === -1 ? undefined : nextStep);

  test('execute_waves step exists', () => {
    assert.notStrictEqual(stepStart, -1, 'execute-phase.md must contain a <step name="execute_waves"> step');
  });

  test('execute_waves contains a labelled cwd-drift guard (#48)', () => {
    assert.ok(stepBody.includes('cwd-drift guard') && /#48/.test(stepBody), 'execute_waves entry must contain a cwd-drift guard tagged #48');
  });

  test('cwd-drift guard resolves the worktree root via git rev-parse --show-toplevel (#48)', () => {
    const g = stepBody.indexOf('cwd-drift guard');
    assert.notStrictEqual(g, -1);
    const region = stepBody.slice(g, g + 1600);
    assert.ok(/git rev-parse --show-toplevel/.test(region), 'cwd-drift guard must resolve the worktree ROOT via git rev-parse --show-toplevel (#48)');
  });

  test('cwd-drift guard discriminates agent worktrees by branch namespace and fails closed (#48)', () => {
    const g = stepBody.indexOf('cwd-drift guard');
    assert.notStrictEqual(g, -1);
    const region = stepBody.slice(g, g + 1600);
    assert.ok(/worktree-agent-/.test(region), 'guard must use the worktree-agent-* branch namespace as the drift discriminator (#48)');
    assert.ok(/exit 1/.test(region), 'cwd-drift guard must fail closed with exit 1 on drift (#48)');
  });

  test('cwd-drift guard does NOT blanket-refuse .claude/worktrees/ paths (#48)', () => {
    const g = stepBody.indexOf('cwd-drift guard');
    assert.notStrictEqual(g, -1);
    const region = stepBody.slice(g, g + 1600);
    assert.ok(!region.includes('*.claude/worktrees/*') && !region.includes('.claude/worktrees/*)'), 'guard must not blanket-refuse .claude/worktrees/ paths — would break legitimate worktree invocations (#48)');
  });
});

describe('bug #48: orchestrator fail-closed handling of verify-only halts', () => {
  const content = fs.readFileSync(EXECUTE_PHASE_PATH, 'utf-8');
  const withoutDispatchNote = content.replace(/<worktree_branch_check>[\s\S]*?<\/worktree_branch_check>/g, '');
  test('orchestrator documents a fail-closed rule for executor exit 42 / FATAL (#48)', () => {
    assert.ok(/exit 42|FATAL/.test(withoutDispatchNote), 'execute-phase.md must reference executor exit 42 / FATAL outside the dispatch note (#48)');
    assert.ok(/(blocked|do NOT merge|not merge)/i.test(withoutDispatchNote), 'execute-phase.md must document an orchestrator-side rule that an executor FATAL/exit 42 marks the plan blocked and is not merged (#48)');
  });
});


// ────────────────────────────────────────────────────────────────────────
// Folded from tests/bug-2384-post-merge-deletion-audit.test.cjs — consolidation epic #1969 (B4 #1973)
// ────────────────────────────────────────────────────────────────────────
{
  const { describe: __foldDescribe } = require('node:test');
  __foldDescribe("folded:bug-2384-post-merge-deletion-audit (consolidation epic #1969 B4 #1973)", () => {
'use strict';

/**
 * Regression test for #2384.
 *
 * During execute-phase, the orchestrator merges per-plan worktree branches into
 * main. The pre-merge deletion check (git diff --diff-filter=D HEAD...WT_BRANCH)
 * only catches files deleted on the worktree branch. A post-merge audit is also
 * required to catch deletions that made it into the merge commit (e.g., files
 * that were in the common ancestor but deleted by the merged worktree) and to
 * provide a revert safety net.
 *
 * After #3797: execute-phase.md delegates worktree cleanup to the SDK's
 * worktree.cleanup-wave command, which implements pre-merge deletion checks
 * (diff --diff-filter=D) internally via executeWorktreeWaveCleanupPlan.
 * The manual post-merge shell audit (MERGE_DEL_COUNT, git reset --hard) has
 * been removed from the workflow — it was part of the SDK-absence fallback.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const EXECUTE_PHASE = path.join(
  __dirname, '..', 'gsd-core', 'workflows', 'execute-phase.md'
);

/**
 * Parse execute-phase.md into a structured contract object.
 * Returns typed boolean fields so tests can assert on structure
 * rather than raw text.
 */
function parseExecutePhaseContract(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  return {
    // 19-12 (jj fork): wave merge + deletion audit are delegated to the
    // cross-backend workspace.parallel.fan-in verb (Phase 11 rewiring;
    // worktree.cleanup-wave is its git-substrate ancestor). The deletion
    // audit itself moved to the per-commit `query diff --name-status`
    // D-filter in agents/gsd-executor.md (D-06).
    delegatesToCleanupWave: lines.some(l => l.includes('workspace.parallel.fan-in')),
    // Fail-closed: the fan-in result guard exits 1 on conflicted/failedReaped
    // rather than swallowing SDK refusals.
    cleanupWaveFailClosed:
      /\[ "\$CONFLICTED" = "true" \] \|\| \[ "\$FAILED_REAPED" -gt 0 \][\s\S]{0,200}?exit 1/.test(content),
    // Does the workflow export/reference WAVE_WORKTREE_MANIFEST for the SDK?
    passesWaveManifest: lines.some(l => l.includes('WAVE_WORKTREE_MANIFEST')),
  };
}

describe('execute-phase.md — post-merge deletion audit (#2384)', () => {
  const contract = parseExecutePhaseContract(EXECUTE_PHASE);

  test('execute-phase delegates wave merge to workspace.parallel.fan-in (which handles deletion audit)', () => {
    // After #3797 the audit lived in worktree.cleanup-wave; the jj fork's
    // Phase 11 rewiring (re-applied 19-08) delegates to the cross-backend
    // workspace.parallel.fan-in verb instead, and the per-commit deletion
    // audit lives in gsd-executor.md's `query diff --name-status` D-filter.
    assert.ok(
      contract.delegatesToCleanupWave,
      'execute-phase.md must delegate to gsd_run query workspace.parallel.fan-in (#2384/#3797; 19-12 re-point)',
    );
  });

  test('execute-phase fan-in guard exits 1 (fail-closed for blocked merges)', () => {
    // If fan-in reports conflicted or failedReaped, the workflow exits 1
    // rather than swallowing the refusal.
    assert.ok(
      contract.cleanupWaveFailClosed,
      'execute-phase.md must exit 1 on conflicted/failedReaped fan-in results (#2384/#3797; 19-12 re-point)',
    );
  });

  test('execute-phase still has pre-merge deletion check (via guard before worktree.cleanup-wave)', () => {
    // The primary deletion guard is now in worktree-safety.cjs (SDK).
    // The workflow must still enforce WAVE_WORKTREE_MANIFEST so the SDK
    // has the info it needs to validate branches.
    assert.ok(
      contract.passesWaveManifest,
      'execute-phase.md must pass WAVE_WORKTREE_MANIFEST to worktree.cleanup-wave',
    );
  });
});
  });
}


// ────────────────────────────────────────────────────────────────────────
// Folded from tests/bug-2501-resurrection-detection.test.cjs — consolidation epic #1969 (B4 #1973)
// ────────────────────────────────────────────────────────────────────────
{
  const { describe: __foldDescribe } = require('node:test');
  __foldDescribe("folded:bug-2501-resurrection-detection (consolidation epic #1969 B4 #1973)", () => {
/**
 * Tests for bug #2501: resurrection-detection block in execute-phase.md must
 * check git history before deleting new .planning/ files.
 *
 * Root cause: the original logic deleted ANY .planning/ file that was absent
 * from PRE_MERGE_FILES, which includes brand-new files (e.g. SUMMARY.md)
 * that the executor just created. A true "resurrection" is a file that was
 * previously tracked on main, deliberately deleted, and then re-introduced by
 * a worktree merge. Detecting that requires a git history check, not just a
 * pre-merge tree membership check.
 *
 * After #3797: execute-phase.md delegates worktree cleanup to the SDK's
 * worktree.cleanup-wave command. Resurrection detection is handled internally
 * by the SDK. The inline WAS_DELETED shell check has been removed from the
 * workflow — it was part of the SDK-absence fallback which is no longer needed
 * since the preflight block exits if neither local nor global SDK is available.
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const EXECUTE_PHASE = path.join(
  __dirname, '..', 'gsd-core', 'workflows', 'execute-phase.md'
);

describe('execute-phase.md — resurrection-detection guard (#2501)', () => {
  let content;

  // Load once; each test reads from the cached string.
  test('file is readable', () => {
    content = fs.readFileSync(EXECUTE_PHASE, 'utf-8');
    assert.ok(content.length > 0, 'execute-phase.md must not be empty');
  });

  test('cleanup delegates to SDK (handles resurrection detection internally)', () => {
    if (!content) content = fs.readFileSync(EXECUTE_PHASE, 'utf-8');
    // After #3797: execute-phase.md delegated to worktree.cleanup-wave; the jj
    // fork's Phase 11 rewiring (re-applied 19-08) delegates to the cross-backend
    // workspace.parallel.fan-in verb, whose merge machinery owns resurrection /
    // deletion handling (19-12 re-point).
    assert.ok(
      content.includes('workspace.parallel.fan-in'),
      'execute-phase.md must delegate to workspace.parallel.fan-in (#2501/#3797; 19-12 re-point)',
    );
  });

  test('execute-phase does not use the buggy PRE_MERGE_FILES form', () => {
    if (!content) content = fs.readFileSync(EXECUTE_PHASE, 'utf-8');
    // The buggy pattern from before #2501 — deletion conditioned on absence
    // from PRE_MERGE_FILES snapshot. Must remain absent.
    const hasBuggyGuard =
      content.includes('PRE_MERGE_FILES') &&
      /if\s*!\s*echo\s*"\$PRE_MERGE_FILES"\s*\|\s*grep\s+-qxF\s*"\$RESURRECTED"/.test(content);
    assert.ok(
      !hasBuggyGuard,
      'execute-phase.md must NOT delete files based on the PRE_MERGE_FILES snapshot grep (inverted guard bug #2501)',
    );
  });
});
  });
}


// ────────────────────────────────────────────────────────────────────────
// Folded from tests/bug-3195-quick-resurrection-guard.test.cjs — consolidation epic #1969 (B4 #1973)
// ────────────────────────────────────────────────────────────────────────
{
  const { describe: __foldDescribe } = require('node:test');
  __foldDescribe("folded:bug-3195-quick-resurrection-guard (consolidation epic #1969 B4 #1973)", () => {
/**
 * Drift-guard for bug #3195: quick.md and execute-phase.md must both use
 * the same resurrection-detection approach so they stay in sync.
 *
 * After #3797: both workflows delegate worktree cleanup to the SDK's
 * worktree.cleanup-wave command, which implements resurrection detection
 * (diff --diff-filter=D history checks) internally. The inline WAS_DELETED
 * shell variable form has been removed from both workflows — it was part of
 * the SDK-absence fallback which is now dead code since preflight exits if
 * neither local nor global SDK is available.
 *
 * This test ensures both workflows continue to use the same cleanup
 * mechanism (SDK delegation), not one inline and one delegated.
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const QUICK_MD = path.join(
  __dirname, '..', 'gsd-core', 'workflows', 'quick.md'
);
const EXECUTE_PHASE_MD = path.join(
  __dirname, '..', 'gsd-core', 'workflows', 'execute-phase.md'
);

describe('resurrection guard drift check — quick.md vs execute-phase.md (#3195)', () => {
  let quickContent;
  let executePhaseContent;

  test('both workflow files are readable', () => {
    quickContent = fs.readFileSync(QUICK_MD, 'utf-8');
    executePhaseContent = fs.readFileSync(EXECUTE_PHASE_MD, 'utf-8');
    assert.ok(quickContent.length > 0, 'quick.md must not be empty');
    assert.ok(executePhaseContent.length > 0, 'execute-phase.md must not be empty');
  });

  test('quick.md delegates resurrection detection to SDK (worktree.cleanup-wave)', () => {
    if (!quickContent) quickContent = fs.readFileSync(QUICK_MD, 'utf-8');
    // After #3797: quick.md delegates to worktree.cleanup-wave, which handles
    // resurrection detection (diff --diff-filter=D) internally. The inline
    // WAS_DELETED form has been removed — it was part of the SDK-absence fallback.
    assert.ok(
      quickContent.includes('workspace.parallel.fan-in'),
      'quick.md must delegate to workspace.parallel.fan-in for resurrection detection (#3195/#3797; 19-12 re-point)'
    );
  });

  test('execute-phase.md delegates resurrection detection to SDK (worktree.cleanup-wave)', () => {
    if (!executePhaseContent) executePhaseContent = fs.readFileSync(EXECUTE_PHASE_MD, 'utf-8');
    // After #3797: execute-phase.md delegates to worktree.cleanup-wave, which handles
    // resurrection detection (diff --diff-filter=D) internally.
    assert.ok(
      executePhaseContent.includes('workspace.parallel.fan-in'),
      'execute-phase.md must delegate to workspace.parallel.fan-in for resurrection detection (#3195/#3797; 19-12 re-point)'
    );
  });

  test('both workflows use the same cleanup mechanism (SDK delegation parity)', () => {
    if (!quickContent) quickContent = fs.readFileSync(QUICK_MD, 'utf-8');
    if (!executePhaseContent) executePhaseContent = fs.readFileSync(EXECUTE_PHASE_MD, 'utf-8');
    const quickDelegates = quickContent.includes('workspace.parallel.fan-in');
    const executeDelegates = executePhaseContent.includes('workspace.parallel.fan-in');
    assert.strictEqual(
      quickDelegates,
      executeDelegates,
      'quick.md and execute-phase.md must both use the same cleanup mechanism (SDK delegation parity, #3195)'
    );
  });

  test('quick.md does not use the buggy PRE_MERGE_FILES grep form', () => {
    if (!quickContent) quickContent = fs.readFileSync(QUICK_MD, 'utf-8');
    // The buggy pattern: deletion conditioned on absence from PRE_MERGE_FILES snapshot
    const hasBuggyGuard =
      quickContent.includes('PRE_MERGE_FILES') &&
      /if\s*!\s*echo\s*"\$PRE_MERGE_FILES"\s*\|\s*grep\s+-qxF\s*"\$RESURRECTED"/.test(quickContent);
    assert.ok(
      !hasBuggyGuard,
      'quick.md must NOT delete files based on the PRE_MERGE_FILES snapshot grep (inverted guard bug #3195)'
    );
  });

  test('execute-phase.md does not use the buggy PRE_MERGE_FILES grep form', () => {
    if (!executePhaseContent) executePhaseContent = fs.readFileSync(EXECUTE_PHASE_MD, 'utf-8');
    const hasBuggyGuard =
      executePhaseContent.includes('PRE_MERGE_FILES') &&
      /if\s*!\s*echo\s*"\$PRE_MERGE_FILES"\s*\|\s*grep\s+-qxF\s*"\$RESURRECTED"/.test(executePhaseContent);
    assert.ok(
      !hasBuggyGuard,
      'execute-phase.md must NOT delete files based on the PRE_MERGE_FILES snapshot grep (inverted guard bug)'
    );
  });
});
  });
}


// ────────────────────────────────────────────────────────────────────────
// Folded from tests/bug-3521-quick-cleanup-cwd-pin.test.cjs — consolidation epic #1969 (B4 #1973)
// ────────────────────────────────────────────────────────────────────────
{
  const { describe: __foldDescribe } = require('node:test');
  __foldDescribe("folded:bug-3521-quick-cleanup-cwd-pin (consolidation epic #1969 B4 #1973)", () => {
// allow-test-rule: source-text-is-the-product (see #3521)
// quick.md is the shipped orchestration contract for /gsd-quick; this
// regression test previously locked the CWD-safety guard in the manual shell
// cleanup loop. After #3797, quick.md delegates cleanup entirely to the SDK's
// worktree.cleanup-wave command, which encapsulates CWD-pinning, STATE.md/
// ROADMAP.md backup/restore, and deletion guards internally.
//
// This test file now verifies the delegation contract: quick.md calls
// worktree.cleanup-wave with || exit 1 (fail-closed), which enforces the
// safety semantics that were previously implemented inline in the shell loop.

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const QUICK_MD = path.join(__dirname, '..', 'gsd-core', 'workflows', 'quick.md');

function readQuickMd() {
  return fs.readFileSync(QUICK_MD, 'utf8');
}

describe('bug #3521 — quick.md post-merge cleanup CWD safety (via SDK delegation, #3797)', () => {

  test('quick.md is readable', () => {
    const content = readQuickMd();
    assert.ok(content.length > 0, 'quick.md must not be empty');
  });

  test('quick.md cleanup delegates CWD-safe workspace cleanup to SDK (workspace.parallel.fan-in)', () => {
    const content = readQuickMd();
    // 19-12 re-point: after #3797 quick.md delegated to worktree.cleanup-wave;
    // the jj fork's Phase 11 rewiring (re-applied 19-08) delegates to the
    // cross-backend workspace.parallel.fan-in verb, which owns CWD pinning,
    // merge, deletion guards and per-success workspace cleanup internally.
    assert.ok(
      content.includes('workspace.parallel.fan-in'),
      'quick.md must delegate cleanup to gsd_run query workspace.parallel.fan-in (#3797; 19-12 re-point)',
    );
  });

  test('quick.md fan-in guard enforces fail-closed safety (#3521 contract)', () => {
    const content = readQuickMd();
    // Fail-closed: the fan-in result guard exits 1 on conflicted/failedReaped
    // rather than swallowing SDK refusals (19-12 re-point of `|| exit 1`).
    assert.match(
      content,
      /\[ "\$CONFLICTED" = "true" \] \|\| \[ "\$FAILED_REAPED" -gt 0 \][\s\S]{0,200}?exit 1/,
      'quick.md fan-in must exit 1 on conflicted/failedReaped — fail-closed for safety refusals (#3521/#3797; 19-12 re-point)',
    );
  });

  test('quick.md handle guard still blocks broad cleanup without a dispatch envelope (#3384)', () => {
    const content = readQuickMd();
    // 19-12 re-point: Phase 11 D-01 eliminated the manifest file; the same
    // anti-discovery contract rides the dispatch envelope — $HANDLE_JSON is
    // the only workspace-set source of truth (quick.md documents the #3384
    // re-expression explicitly), and fan-in is skipped when it is empty.
    assert.ok(
      content.includes('HANDLE_JSON'),
      'quick.md must scope cleanup to the $HANDLE_JSON dispatch envelope (#3384; 19-12 re-point)',
    );
    assert.ok(
      content.includes('#3384 manifest source of truth') || content.includes('only workspace-set source of truth'),
      'quick.md must document the #3384 anti-broad-discovery re-expression (19-12 re-point)',
    );
  });

});
  });
}


// ────────────────────────────────────────────────────────────────────────
// Folded from tests/bug-2838-summary-rescue-gitignored-planning.test.cjs — consolidation epic #1969 (B4 #1973)
// ────────────────────────────────────────────────────────────────────────
{
  const { describe: __foldDescribe } = require('node:test');
  __foldDescribe("folded:bug-2838-summary-rescue-gitignored-planning (consolidation epic #1969 B4 #1973)", () => {
/**
 * Regression tests for #2838: SUMMARY rescue silently fails when .planning/
 * is gitignored.
 *
 * After #3797: execute-phase.md and quick.md delegate worktree cleanup to the
 * SDK's worktree.cleanup-wave command. The SDK's executeWorktreeWaveCleanupPlan
 * handles SUMMARY rescue internally using a filesystem-level find+cp approach
 * (bypassing gitignore) rather than the old git ls-files --exclude-standard
 * form that silently dropped gitignored files.
 *
 * The inline "Safety net" shell rescue block that was previously in both
 * workflow files has been removed — it was part of the SDK-absence fallback
 * which is now dead code since preflight exits if neither local nor global SDK
 * is available.
 *
 * This test file verifies that both workflows correctly delegate to the SDK
 * for SUMMARY rescue, and that neither workflow retains the broken inline form.
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const EXECUTE_PHASE_PATH = path.join(REPO_ROOT, 'gsd-core', 'workflows', 'execute-phase.md');
const QUICK_PATH = path.join(REPO_ROOT, 'gsd-core', 'workflows', 'quick.md');

/**
 * Parse a workflow markdown file into a structured contract object.
 * Returns typed boolean fields so tests assert on structure, not raw text.
 */
function parseWorkflowContract(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  return {
    // Non-empty check
    nonEmpty: lines.length > 0 && lines.some(l => l.length > 0),
    // 19-12 (jj fork): wave cleanup + SUMMARY handling are delegated to the
    // cross-backend workspace.parallel.fan-in verb (Phase 11 rewiring,
    // re-applied 19-08; worktree.cleanup-wave is its git-substrate ancestor).
    delegatesToCleanupWave: lines.some(l => l.includes('workspace.parallel.fan-in')),
    // Fail-closed: the fan-in result guard exits 1 on conflicted/failedReaped
    // rather than swallowing SDK refusals (19-12 re-point of `|| exit 1`).
    cleanupWaveFailClosed:
      /\[ "\$CONFLICTED" = "true" \] \|\| \[ "\$FAILED_REAPED" -gt 0 \][\s\S]{0,200}?exit 1/.test(content),
    // Does the workflow still contain the broken ls-files --exclude-standard rescue form?
    hasBrokenLsFilesForm: lines.some(
      l => l.includes('ls-files --modified --others --exclude-standard'),
    ),
  };
}

const executePhaseContract = parseWorkflowContract(EXECUTE_PHASE_PATH);
const quickContract = parseWorkflowContract(QUICK_PATH);

describe('bug-2838: SUMMARY rescue delegates to SDK (worktree.cleanup-wave)', () => {

  test('execute-phase.md is readable', () => {
    assert.ok(executePhaseContract.nonEmpty, 'execute-phase.md must not be empty');
  });

  test('quick.md is readable', () => {
    assert.ok(quickContract.nonEmpty, 'quick.md must not be empty');
  });

  test('execute-phase.md delegates SUMMARY rescue to SDK (worktree.cleanup-wave)', () => {
    // After #3797: worktree.cleanup-wave handles SUMMARY rescue via find+cp
    // (bypasses gitignore, fixing the #2838 bug). The workflow delegates to the
    // SDK rather than implementing rescue inline.
    assert.ok(
      executePhaseContract.delegatesToCleanupWave,
      'execute-phase.md must delegate to worktree.cleanup-wave for SUMMARY rescue (#2838/#3797)',
    );
  });

  test('quick.md delegates SUMMARY rescue to SDK (worktree.cleanup-wave)', () => {
    // After #3797: worktree.cleanup-wave handles SUMMARY rescue via find+cp
    // (bypasses gitignore, fixing the #2838 bug).
    assert.ok(
      quickContract.delegatesToCleanupWave,
      'quick.md must delegate to worktree.cleanup-wave for SUMMARY rescue (#2838/#3797)',
    );
  });

  test('execute-phase.md does not retain broken git ls-files --exclude-standard rescue form (#2838)', () => {
    // The broken form used --exclude-standard which silently filtered out
    // gitignored .planning/ files — the root cause of #2838.
    assert.ok(
      !executePhaseContract.hasBrokenLsFilesForm,
      'execute-phase.md must not use ls-files --exclude-standard for SUMMARY rescue (broken for gitignored .planning/)',
    );
  });

  test('quick.md does not retain broken git ls-files --exclude-standard rescue form (#2838)', () => {
    assert.ok(
      !quickContract.hasBrokenLsFilesForm,
      'quick.md must not use ls-files --exclude-standard for SUMMARY rescue (broken for gitignored .planning/)',
    );
  });

  test('execute-phase.md cleanup-wave uses || exit 1 (fail-closed so rescue errors surface)', () => {
    // If the SDK's rescue fails (e.g. filesystem error), || exit 1 surfaces
    // the failure to the orchestrator rather than silently continuing and
    // losing the SUMMARY.
    assert.ok(
      executePhaseContract.cleanupWaveFailClosed,
      'execute-phase.md cleanup-wave must use || exit 1 so SUMMARY rescue failures surface (#2838/#3797)',
    );
  });

  test('quick.md cleanup-wave uses || exit 1 (fail-closed so rescue errors surface)', () => {
    assert.ok(
      quickContract.cleanupWaveFailClosed,
      'quick.md cleanup-wave must use || exit 1 so SUMMARY rescue failures surface (#2838/#3797)',
    );
  });
});
  });
}

// ────────────────────────────────────────────────────────────────────────
// Folded from tests/bug-630-wave-cleanup-orchestrator-root.test.cjs — consolidation epic #1969 (B6 #1975)
// ────────────────────────────────────────────────────────────────────────
{
  const { describe: __foldDescribe } = require('node:test');
  __foldDescribe("folded:bug-630-wave-cleanup-orchestrator-root (consolidation epic #1969 B6 #1975)", () => {
// allow-test-rule: source-text-is-the-product (see #630)
// execute-phase.md is the shipped orchestration contract for wave execution and
// cleanup. Bug #630: the two wave-cleanup guards resolved PRIMARY_WT from
// `git worktree list --porcelain`'s first entry — always the main checkout —
// so an orchestrator running from a non-primary (per-phase lane) worktree was
// cd'd off its own lane and tripped the #3174 branch-drift assertion at cleanup,
// refusing merge-back.
//
// 19-12 re-point (jj fork): Phase 11 D-01 retired WAVE_WORKTREE_MANIFEST —
// the dispatch path now rides the `workspace.parallel.{dispatch,fan-in}`
// envelope ($HANDLE_JSON). The #630 invariant ("cleanup never re-discovers a
// root via worktree-list first-entry; the orchestrator stays pinned to its own
// root") is re-expressed at the envelope layer: execute-phase.md documents the
// re-expression explicitly, carries the #3174-class EXPECTED_BRANCH drift
// FATAL before fan-in, and contains NO first-entry worktree-list resolution at
// all (the bug's root cause is structurally gone). The retired manifest-reader
// behavioral proofs were dropped with the machinery.

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const EXECUTE_PHASE_MD = path.join(__dirname, '..', 'gsd-core', 'workflows', 'execute-phase.md');

function readMd() {
  return fs.readFileSync(EXECUTE_PHASE_MD, 'utf8');
}

describe('bug #630 — wave-cleanup pins to the orchestrator root, not git-worktree-list first entry', () => {
  test('execute-phase.md is readable', () => {
    assert.ok(readMd().length > 0, 'execute-phase.md must not be empty');
  });

  // ── Source contract (the .md is the product) ──────────────────────────────

  test('dispatch envelope documents the #630 re-expression (orchestrator-root pinning rides the Handle)', () => {
    const content = readMd();
    assert.match(
      content,
      /orchestrator_root[^\n]*\(#630\)/,
      'execute-phase.md must document that the #630 orchestrator_root pin is re-expressed on the dispatch envelope',
    );
    assert.ok(
      content.includes('$HANDLE_JSON'),
      'the dispatch envelope ($HANDLE_JSON) must be the workspace-set source of truth replacing the manifest',
    );
  });

  test('pre-fan-in drift FATAL pins the orchestrator to its expected branch (#3174-class)', () => {
    const content = readMd();
    assert.match(
      content,
      /EXPECTED_BRANCH[^\n]*\{ echo "FATAL: orchestrator on[^\n]*#3174-class drift[^\n]*exit 1; \}/,
      'execute-phase.md must FATAL before fan-in when the orchestrator drifted off EXPECTED_BRANCH (#3174/#630 class)',
    );
  });

  test('no first-entry worktree-list resolution survives anywhere (#630 root cause gone)', () => {
    const content = readMd();
    const firstEntryLines = content.match(/^.*git worktree list --porcelain \| awk '\/\^worktree \/.*$/gm) || [];
    assert.equal(
      firstEntryLines.length,
      0,
      `no PRIMARY_WT first-entry resolution may exist; found: ${firstEntryLines.map(l => l.trim()).join(' | ')}`,
    );
  });
});
  });
}


// ────────────────────────────────────────────────────────────────────────
// Folded from tests/enh-48-cwd-drift-guard-e2e.test.cjs — consolidation epic #1969 (B6 #1975)
// ────────────────────────────────────────────────────────────────────────
{
  const { describe: __foldDescribe } = require('node:test');
  __foldDescribe("folded:enh-48-cwd-drift-guard-e2e (consolidation epic #1969 B6 #1975)", () => {
// allow-test-rule: integration-test-input (see #48)
// Reads execute-phase.md to extract + execute the cwd-drift guard bash snippet against real git worktrees.

'use strict';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { cleanup } = require('./helpers.cjs');

const REPO_ROOT = path.join(__dirname, '..');
const EXECUTE_PHASE_PATH = path.join(REPO_ROOT, 'gsd-core', 'workflows', 'execute-phase.md');

// ---------------------------------------------------------------------------
// Extract the cwd-drift guard bash block from execute-phase.md
// ---------------------------------------------------------------------------

/**
 * Reads execute-phase.md and extracts the bash fenced block that implements
 * the orchestrator cwd-drift guard inside <step name="execute_waves">.
 *
 * Algorithm:
 *   1. Find <step name="execute_waves">
 *   2. After that, find the first occurrence of "cwd-drift guard"
 *   3. After that, find the first ```bash fence
 *   4. Return the body between ```bash\n and the closing ```
 *
 * Throws with a clear message if any step fails or sanity checks don't pass.
 */
function extractCwdGuardBash() {
  const content = fs.readFileSync(EXECUTE_PHASE_PATH, 'utf-8');

  const stepMarker = '<step name="execute_waves">';
  const stepIdx = content.indexOf(stepMarker);
  if (stepIdx === -1) {
    throw new Error(`extractCwdGuardBash: could not find "${stepMarker}" in ${EXECUTE_PHASE_PATH}`);
  }

  const afterStep = content.slice(stepIdx + stepMarker.length);

  const driftMarker = 'cwd-drift guard';
  const driftIdx = afterStep.indexOf(driftMarker);
  if (driftIdx === -1) {
    throw new Error(`extractCwdGuardBash: could not find "${driftMarker}" after execute_waves step in ${EXECUTE_PHASE_PATH}`);
  }

  const afterDrift = afterStep.slice(driftIdx + driftMarker.length);

  // Extract the first ```bash|sh fenced block using a CRLF-safe regex.
  // \r?\n tolerates both LF (Unix) and CRLF (Windows autocrlf=true checkouts).
  const fenceRe = /```(?:bash|sh)\r?\n([\s\S]*?)```/;
  const fenceMatch = fenceRe.exec(afterDrift);
  if (!fenceMatch) {
    throw new Error(`extractCwdGuardBash: could not find \`\`\`bash fence after cwd-drift guard heading in ${EXECUTE_PHASE_PATH}`);
  }

  const guardBash = fenceMatch[1];

  if (!guardBash.trim()) {
    throw new Error('extractCwdGuardBash: extracted bash block is empty');
  }
  if (!guardBash.includes('git rev-parse --show-toplevel')) {
    throw new Error('extractCwdGuardBash: sanity check failed — extracted block does not contain "git rev-parse --show-toplevel"');
  }
  if (!guardBash.includes('worktree-agent-')) {
    throw new Error('extractCwdGuardBash: sanity check failed — extracted block does not contain "worktree-agent-"');
  }

  return guardBash;
}

// ---------------------------------------------------------------------------
// Run guard helper
// ---------------------------------------------------------------------------

/**
 * Run the guard bash snippet in a given cwd using bash -c.
 * Returns { status, stderr }.
 *
 * VCS-audit 2026-07-08: the guard is cross-backend now and calls gsd_run
 * (query current-branch + workspace.assert-dispatched-cwd), so the extracted
 * block must run behind the canonical launcher preamble — exactly as it does
 * in production, where the preamble precedes every workflow fence. RUNTIME_DIR
 * pins resolution at this repo's gsd-core/bin/gsd-tools.cjs.
 */
function runGuard(guardBash, cwd) {
  const launcher = fs.readFileSync(
    path.join(REPO_ROOT, 'gsd-core', 'workflows', '_runtime-launcher.snippet.sh'),
    'utf-8',
  );
  const result = spawnSync('bash', ['-c', `${launcher}\n${guardBash}`], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, RUNTIME_DIR: REPO_ROOT },
  });
  return { status: result.status, stderr: result.stderr || '' };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let upstreamDir;      // bare upstream git repo (the main worktree)
let featureDir;       // normal feature worktree on branch workspace/feature-x
let agentWtDir;       // agent worktree on branch worktree-agent-deadbeef
let agentSubdir;      // subdirectory inside agentWtDir
let legitUnderClaude; // non-agent worktree whose PATH is under .claude/worktrees/
const dirsToCleanup = [];

function git(cwd, args) {
  return execSync(`git ${args.map(a => `"${a}"`).join(' ')}`, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

before(() => {
  // --- upstream: the main repo with an initial commit ---
  upstreamDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-48-upstream-'));
  dirsToCleanup.push(upstreamDir);

  git(upstreamDir, ['init', '-b', 'main']);
  git(upstreamDir, ['config', 'user.email', 'test@example.com']);
  git(upstreamDir, ['config', 'user.name', 'Test User']);
  git(upstreamDir, ['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(upstreamDir, 'README.md'), '# test\n');
  git(upstreamDir, ['add', 'README.md']);
  git(upstreamDir, ['commit', '-m', 'chore: init']);

  // --- feature worktree: non-agent branch, path outside .claude/worktrees ---
  featureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-48-feature-'));
  dirsToCleanup.push(featureDir);
  // git worktree add creates the directory itself; remove so it can do so
  fs.rmdirSync(featureDir);
  git(upstreamDir, ['worktree', 'add', '-b', 'workspace/feature-x', featureDir]);

  // --- agent worktree: branch worktree-agent-deadbeef ---
  // Sits under featureDir/.claude/worktrees/agent-deadbeef
  const agentWtParent = path.join(featureDir, '.claude', 'worktrees');
  fs.mkdirSync(agentWtParent, { recursive: true });
  agentWtDir = path.join(agentWtParent, 'agent-deadbeef');
  git(upstreamDir, ['worktree', 'add', '-b', 'worktree-agent-deadbeef', agentWtDir]);

  // --- subdir inside agent worktree ---
  agentSubdir = path.join(agentWtDir, 'src', 'deep');
  fs.mkdirSync(agentSubdir, { recursive: true });

  // --- legitUnderClaude: non-agent worktree whose PATH is under .claude/worktrees/ ---
  // This proves the guard discriminates by branch name, not path.
  const legitParent = path.join(upstreamDir, '.claude', 'worktrees');
  fs.mkdirSync(legitParent, { recursive: true });
  legitUnderClaude = path.join(legitParent, 'legit-feature');
  git(upstreamDir, ['worktree', 'add', '-b', 'workspace/legit', legitUnderClaude]);
});

after(() => {
  // Prune stale worktree metadata before removing dirs
  try { git(upstreamDir, ['worktree', 'prune']); } catch (_) { /* best-effort */ }
  for (const d of dirsToCleanup) {
    try { cleanup(d); } catch (_) { /* best-effort */ }
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('bug #48: orchestrator cwd-drift guard — executable e2e', () => {
  let guardBash;

  before(() => {
    guardBash = extractCwdGuardBash();
  });

  test('guard passes from a feature worktree on a non-agent branch (exit 0)', () => {
    const { status, stderr } = runGuard(guardBash, featureDir);
    assert.equal(
      status, 0,
      `Expected exit 0 from feature worktree, got ${status}. stderr: ${stderr}`,
    );
  });

  test('guard fails closed (exit 1) when cwd is inside an agent worktree', () => {
    const { status, stderr } = runGuard(guardBash, agentWtDir);
    assert.equal(
      status, 1,
      `Expected exit 1 from agent worktree, got ${status}. stderr: ${stderr}`,
    );
    assert.match(
      stderr,
      /agent worktree/i,
      `Expected stderr to mention "agent worktree", got: ${stderr}`,
    );
  });

  test('guard fails closed (exit 1) from a SUBDIRECTORY of an agent worktree (root resolution)', () => {
    // git rev-parse --show-toplevel resolves to the worktree root regardless of cwd subdir.
    // The guard must catch this via the branch-name check, not the path check.
    const { status, stderr } = runGuard(guardBash, agentSubdir);
    assert.equal(
      status, 1,
      `Expected exit 1 from agent worktree subdir, got ${status}. stderr: ${stderr}`,
    );
  });

  test('guard does NOT blanket-refuse a non-agent worktree located under .claude/worktrees/ (exit 0)', () => {
    // Discriminator is the worktree-agent-* branch namespace, NOT the path.
    const { status, stderr } = runGuard(guardBash, legitUnderClaude);
    assert.equal(
      status, 0,
      `Expected exit 0 from non-agent worktree under .claude/worktrees/, got ${status}. stderr: ${stderr}`,
    );
  });

  test('guard fails closed (exit 1) when not inside a git repo', (t) => {
    const nonRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-48-nongit-'));
    try {
      // Verify that git rev-parse --show-toplevel actually fails here.
      // On some systems /tmp itself might be inside a git repo (e.g. if the
      // user's HOME is a git repo). If it resolves, we must skip this test.
      const check = spawnSync('git', ['rev-parse', '--show-toplevel'], {
        cwd: nonRepoDir,
        encoding: 'utf-8',
      });
      if (check.status === 0) {
        t.skip('nonRepoDir unexpectedly resolved to a git repo — skipping');
        return;
      }

      const { status, stderr } = runGuard(guardBash, nonRepoDir);
      assert.equal(
        status, 1,
        `Expected exit 1 when not inside a git repo, got ${status}. stderr: ${stderr}`,
      );
    } finally {
      try { cleanup(nonRepoDir); } catch (_) { /* best-effort */ }
    }
  });
});
  });
}
