'use strict';

const path = require('node:path');

const { parseFragment } = require('./parse.cjs');
const { createVcsAdapter, expr } = require('../../sdk/dist-cjs/vcs/index.js');

const SECTION_ORDER = ['Fixed', 'Added', 'Changed', 'Deprecated', 'Removed', 'Security'];

const FIXED_GROUPS = [
  {
    title: 'Verification, update & review safety',
    pattern: /\b(verifier|verification|verify|probe|probes|debt|tbd|fixme|xxx|detect-custom-files|review|summary|blocker|critical)\b/i,
  },
  {
    title: 'State, planning & execution',
    pattern: /\b(state|planning|planner|plan-phase|phase|roadmap|execute|executor|worktree|worktrees|resolve-model|init\.progress|model override|human_needed|ship preflight)\b/i,
  },
  {
    title: 'Install & runtime conversion',
    pattern: /\b(install|installer|runtime|windows|powershell|codex|gemini|antigravity|hook|hooks|gsd-sdk|sdk readiness|cjs|model-catalog|path|shim)\b/i,
  },
];

const REMOVED_GROUPS = [
  {
    title: 'Intel updater',
    pattern: /\b(intel|gsd-intel-updater|layout detection)\b/i,
  },
];

// Phase 7 MIGR-05: migrated to cross-backend VcsAdapter per D-17 / D-18 — the script
// stays cross-backend (preserves upstream-mergeability) rather than being deleted.
// The adapter is constructed lazily per repo path so callers in test fixtures can
// operate on multiple repos within a single Node process.
const adapterCache = new Map();
function getVcs(repo) {
  let vcs = adapterCache.get(repo);
  if (!vcs) {
    vcs = createVcsAdapter(repo, {});
    adapterCache.set(repo, vcs);
  }
  return vcs;
}

function validateGitRef({ repo, ref, label }) {
  if (typeof ref !== 'string' || ref.trim() !== ref || ref.length === 0) {
    throw new Error(`Invalid git ref for ${label}: expected a non-empty trimmed string`);
  }
  if (
    ref.startsWith('-') ||
    ref.includes('..') ||
    ref.includes('//') ||
    !/^[A-Za-z0-9._/-]+$/.test(ref)
  ) {
    throw new Error(`Invalid git ref for ${label}: ${ref}`);
  }
  const vcs = getVcs(repo);
  if (!vcs.refs.exists(expr.bookmark(ref))) {
    throw new Error(`Invalid git ref for ${label}: ${ref} (does not resolve)`);
  }
  return ref;
}

function changedFragmentPaths({ repo, fromRef, toRef }) {
  const from = validateGitRef({ repo, ref: fromRef, label: 'fromRef' });
  const to = validateGitRef({ repo, ref: toRef, label: 'toRef' });
  const vcs = getVcs(repo);
  const diffResult = vcs.diff({
    rev: expr.range(expr.bookmark(from), expr.bookmark(to)),
    nameOnly: true,
    paths: ['.changeset'],
  });
  const names = Array.isArray(diffResult.nameOnly) ? diffResult.nameOnly : [];
  return names.filter((file) => /^\.changeset\/[^/]+\.md$/.test(file));
}

function readFileAtRef({ repo, ref, file }) {
  const vcs = getVcs(repo);
  return vcs.refs.readBlob(expr.bookmark(ref), file);
}

function loadFragmentsFromRange({ repo, fromRef, toRef }) {
  const files = changedFragmentPaths({ repo, fromRef, toRef });
  const fragments = [];
  const failures = [];

  for (const file of files) {
    try {
      const src = readFileAtRef({ repo, ref: toRef, file });
      const parsed = parseFragment(src);
      if (parsed.ok) {
        fragments.push({
          ...parsed.fragment,
          file,
          slug: path.basename(file, '.md'),
        });
      } else {
        failures.push({ file, reason: parsed.reason, detail: parsed.detail || null });
      }
    } catch (e) {
      failures.push({ file, reason: 'read_failed', detail: e.message });
    }
  }

  return { fragments, failures };
}

function classifyGroup(fragment) {
  const haystack = `${fragment.slug || ''}\n${fragment.body || ''}`;
  const groups = fragment.type === 'Removed' ? REMOVED_GROUPS : FIXED_GROUPS;
  const match = groups.find((group) => group.pattern.test(haystack));
  if (match) return match.title;
  if (fragment.type === 'Removed') return 'Removed';
  if (fragment.type === 'Fixed') return 'Other fixes';
  return fragment.type;
}

function buildGithubReleaseNotesIr({ fragments }) {
  const sections = [];
  for (const type of SECTION_ORDER) {
    const typed = fragments.filter((fragment) => fragment.type === type);
    if (typed.length === 0) continue;

    const groupMap = new Map();
    for (const fragment of typed) {
      const groupTitle = classifyGroup(fragment);
      if (!groupMap.has(groupTitle)) groupMap.set(groupTitle, []);
      groupMap.get(groupTitle).push(fragment);
    }

    sections.push({
      type,
      groups: Array.from(groupMap, ([title, bullets]) => ({ title, bullets })),
    });
  }
  return { sections };
}

function formatBullet(fragment) {
  if (!Number.isInteger(fragment.pr) || fragment.pr <= 0) {
    throw new Error(`Fragment ${fragment.slug || fragment.file || '<unknown>'} missing valid pr field`);
  }
  const body = `${fragment.body.trim()} (#${fragment.pr})`;
  const lines = body.split(/\r?\n/);
  return lines.map((line, index) => (index === 0 ? `- ${line}` : `  ${line}`)).join('\n');
}

function compareUrl({ repoSlug, fromRef, toRef }) {
  const normalizedSlug = String(repoSlug || '').trim();
  if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(normalizedSlug)) {
    throw new Error(`Invalid repoSlug format: ${repoSlug} (expected "owner/repo")`);
  }
  return `https://github.com/${normalizedSlug}/compare/${fromRef}...${toRef}`;
}

function serializeGithubReleaseNotes({
  ir,
  fromRef,
  toRef,
  repoSlug = 'gsd-build/get-shit-done',
  installCommand = 'npx get-shit-done-cc@latest',
}) {
  if (installCommand.includes('`')) {
    throw new Error('installCommand cannot contain backtick characters');
  }
  const lines = [];
  for (const section of ir.sections) {
    lines.push(`## ${section.type}`);
    lines.push('');
    for (const group of section.groups) {
      lines.push(`### ${group.title}`);
      for (const bullet of group.bullets) {
        lines.push(formatBullet(bullet));
      }
      lines.push('');
    }
  }
  lines.push('---');
  lines.push('');
  lines.push(`Install/upgrade: \`${installCommand}\``);
  lines.push('');
  lines.push(`**Full Changelog**: ${compareUrl({ repoSlug, fromRef, toRef })}`);
  lines.push('');
  return lines.join('\n');
}

function renderGithubReleaseNotes(options) {
  const { fragments, failures } = loadFragmentsFromRange(options);
  if (failures.length > 0) {
    return { ok: false, fragments, failures, body: null };
  }
  const ir = buildGithubReleaseNotesIr({ fragments });
  return {
    ok: true,
    fragments,
    failures: [],
    ir,
    body: serializeGithubReleaseNotes({ ir, ...options }),
  };
}

module.exports = {
  changedFragmentPaths,
  loadFragmentsFromRange,
  buildGithubReleaseNotesIr,
  serializeGithubReleaseNotes,
  renderGithubReleaseNotes,
  classifyGroup,
  validateGitRef,
};
