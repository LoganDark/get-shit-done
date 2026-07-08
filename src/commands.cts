/**
 * Commands — Standalone utility commands
 *
 * ADR-457 build-at-publish: the hand-written bin/lib/commands.cjs collapsed
 * to a TypeScript source of truth. Behaviour is preserved byte-for-behaviour
 * from the prior hand-written .cjs; only strict types are added.
 */

import fs from 'node:fs';
import path from 'node:path';
import { platformWriteSync, platformReadSync, platformEnsureDir } from './shell-command-projection.cjs';
// 19-07 (AUDIT-01): VCS reads/writes route through the ported adapter
// (replayed from the fork's line-annotated commands.cjs reference, plans
// 02-09 / 2.1-04 / #3522). `execGit` from shell-command-projection is
// intentionally NOT imported (project_no_raw_git — every VCS read/write
// routes through the adapter so jj repos aren't perturbed by ambient git).
// Deviation from the 02-09-era fork annotations: the adapter is instantiated
// with backend AUTO-DETECT (no `{ kind: 'git' }` pin) in commit/stats paths —
// the 02-09 pins predate the fork's jj backend, and pinning git here would
// break the jj-only-repo invariant this phase ports. cmdCheckCommit keeps the
// git pin (it probes git's index, a git-only concept).
import { createVcsAdapter, expr } from './vcs/index.cjs';
import { VcsNotImplementedError } from './vcs/types.cjs';
import type { StatusEntry } from './vcs/types.cjs';
import { requireSafePath, sanitizeForDisplay } from './security.cjs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import ioMod = require('./io.cjs');
const { output, error } = ioMod;
// eslint-disable-next-line @typescript-eslint/no-require-imports
import configLoaderMod = require('./config-loader.cjs');
const { loadConfig, isGitIgnored } = configLoaderMod;
// eslint-disable-next-line @typescript-eslint/no-require-imports
import coreUtilsMod = require('./core-utils.cjs');
const { toPosixPath, generateSlugInternal, extractOneLinerFromBody } = coreUtilsMod;
// eslint-disable-next-line @typescript-eslint/no-require-imports
import phaseIdMod = require('./phase-id.cjs');
const { normalizePhaseName, comparePhaseNum, extractPhaseToken } = phaseIdMod;
// eslint-disable-next-line @typescript-eslint/no-require-imports
import phaseLocatorMod = require('./phase-locator.cjs');
const { getArchivedPhaseDirs, findPhaseInternal } = phaseLocatorMod;
// eslint-disable-next-line @typescript-eslint/no-require-imports
import roadmapParserMod = require('./roadmap-parser.cjs');
const { extractCurrentMilestone, stripShippedMilestones: _stripShippedMilestones, getMilestoneInfo, getMilestonePhaseFilter, getRoadmapPhaseInternal } = roadmapParserMod;
// eslint-disable-next-line @typescript-eslint/no-require-imports
import modelResolverMod = require('./model-resolver.cjs');
const { resolveModelInternal, resolveEffortInternal, resolveFastModeInternal, resolveEffortForTier, resolveGranularityInternal, assertValidGranularityOverride } = modelResolverMod;
import { renderEffortForRuntime, RUNTIMES_WITH_FAST_MODE } from './model-catalog.cjs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import planningWorkspace = require('./planning-workspace.cjs');
const { planningDir, planningPaths } = planningWorkspace;
// eslint-disable-next-line @typescript-eslint/no-require-imports
import frontmatter = require('./frontmatter.cjs');
const { extractFrontmatter } = frontmatter;
// eslint-disable-next-line @typescript-eslint/no-require-imports
import modelProfiles = require('./model-profiles.cjs');
const { MODEL_PROFILES, VALID_PHASE_TYPES } = modelProfiles;
import { formatGsdSlash, resolveRuntime } from './runtime-slash.cjs';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ArchivedPhaseDir {
  name: string;
  fullPath: string;
  milestone: string | null;
}

interface PhaseProgress {
  number: string;
  name: string;
  plans: number;
  summaries: number;
  status: string;
}

interface GroupFilesBySubrepoResult {
  grouped: Record<string, string[]>;
  unmatched: string[];
}

interface WebsearchOptions {
  limit?: number;
  freshness?: string;
}

interface ScaffoldOptions {
  phase?: string;
  name?: string;
}

interface CommitToSubrepoRepoResult {
  committed: boolean;
  // 19-07 unified revision model: `id` is the backend's canonical revision
  // identifier (short hex commit_id on git, short [k-z] change_id on jj).
  // Renamed from `hash` per the fork commands.cjs reference — no migrated
  // path may surface a git-only commit_id/hash field when the backend is jj.
  id: string | null;
  files: string[];
  reason?: string;
  error?: string;
}

interface EffortSyncChange {
  agent: string;
  from: string | null;
  to: string;
}

// ─── Phase Status ─────────────────────────────────────────────────────────────

/**
 * Determine phase status by checking plan/summary counts AND verification state.
 * Introduces "Executed" for phases with all summaries but no passing verification.
 */
function determinePhaseStatus(plans: number, summaries: number, phaseDir: string, defaultPending: string): string {
  if (plans === 0) return defaultPending;
  if (summaries < plans && summaries > 0) return 'In Progress';
  if (summaries < plans) return 'Planned';

  // summaries >= plans — check verification
  try {
    const files = fs.readdirSync(phaseDir);
    const verificationFile = files.find(f => f === 'VERIFICATION.md' || f.endsWith('-VERIFICATION.md'));
    if (verificationFile) {
      const content = platformReadSync(path.join(phaseDir, verificationFile)) || '';
      // #1159 (Defect A): read ONLY the frontmatter `status` key to avoid false
      // matches from historical body metadata such as `previous_status: gaps_found`.
      // Full-text regexes like /status:\s*gaps_found/ match the substring inside
      // `previous_status: gaps_found`, producing incorrect phase status labels.
      const fm = extractFrontmatter(content) as Record<string, unknown>;
      // Normalise to lower-case to preserve the prior case-insensitive behaviour
      // while reading only the frontmatter `status` key (not the full body text).
      const fmStatus = typeof fm['status'] === 'string' ? fm['status'].trim().toLowerCase() : '';
      if (fmStatus === 'passed') return 'Complete';
      if (fmStatus === 'human_needed') return 'Needs Review';
      if (fmStatus === 'gaps_found') return 'Executed';
      // Verification exists but unrecognized status — treat as executed
      return 'Executed';
    }
  } catch { /* directory read failed — fall through */ }

  // No verification file — executed but not verified
  return 'Executed';
}

function cmdGenerateSlug(text: string | undefined, raw: boolean): void {
  if (!text) {
    error('text required for slug generation');
  }

  const slug = (text as string)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60);

  const result = { slug };
  output(result, raw, slug);
}

function cmdCurrentTimestamp(format: string | undefined, raw: boolean): void {
  const now = new Date();
  let result: string;

  switch (format) {
    case 'date':
      result = now.toISOString().split('T')[0];
      break;
    case 'filename':
      result = now.toISOString().replace(/:/g, '-').replace(/\..+/, '');
      break;
    case 'full':
    default:
      result = now.toISOString();
      break;
  }

  output({ timestamp: result }, raw, result);
}

function cmdListTodos(cwd: string, area: string | undefined, raw: boolean): void {
  const pendingDir = path.join(planningDir(cwd), 'todos', 'pending');

  let count = 0;
  const todos: Array<{ file: string; created: string; title: string; area: string; path: string }> = [];

  try {
    const files = fs.readdirSync(pendingDir).filter(f => f.endsWith('.md'));

    for (const file of files) {
      const content = platformReadSync(path.join(pendingDir, file));
      if (content === null) continue;
      const createdMatch = content.match(/^created:\s*(.+)$/m);
      const titleMatch = content.match(/^title:\s*(.+)$/m);
      const areaMatch = content.match(/^area:\s*(.+)$/m);

      const todoArea = areaMatch ? areaMatch[1].trim() : 'general';

      // Apply area filter if specified
      if (area && todoArea !== area) continue;

      count++;
      todos.push({
        file,
        created: createdMatch ? createdMatch[1].trim() : 'unknown',
        title: titleMatch ? titleMatch[1].trim() : 'Untitled',
        area: todoArea,
        path: toPosixPath(path.relative(cwd, path.join(pendingDir, file))),
      });
    }
  } catch { /* intentionally empty */ }

  const result = { count, todos };
  output(result, raw, count.toString());
}

/**
 * List captured seeds from .planning/seeds/SEED-*.md for browsing/audit (#441).
 *
 * Unlike audit.scanSeeds (which returns only *unimplemented* seeds for the
 * milestone surface), this lists seeds of every status with the richer fields a
 * human audit needs (scope, trigger, planted date). An optional case-insensitive
 * status filter narrows the set. Seed content is user-controlled, so every
 * displayed field is passed through sanitizeForDisplay and each file path is
 * validated with requireSafePath before reading. Read-only — never mutates.
 */
/**
 * Derive the canonical `{ seed_id, slug }` from a seed filename stem and the
 * frontmatter `id:` value. Pure (no I/O) so it can be property-tested directly.
 *
 * seed_id: frontmatter `id:` when it matches `SEED-NNN`, else the numeric prefix
 * of the filename (`SEED-NNN-…`), else the whole stem. slug: the descriptive
 * remainder after `SEED-NNN-`, else the stem with a leading `SEED-` stripped.
 * `rawFmId` is `unknown` because frontmatter values are not guaranteed strings.
 */
function deriveSeedIdentity(stem: string, rawFmId: unknown): { seed_id: string; slug: string } {
  const fmId = typeof rawFmId === 'string' ? rawFmId.trim() : '';
  let seedId: string;
  if (/^SEED-\d+$/i.test(fmId)) {
    seedId = fmId;
  } else {
    const numMatch = stem.match(/^(SEED-\d+)/i);
    seedId = numMatch ? numMatch[1] : stem;
  }
  const slugMatch = stem.match(/^SEED-\d+-(.+)$/i);
  const slug = slugMatch ? slugMatch[1] : stem.replace(/^SEED-/i, '');
  return { seed_id: seedId, slug };
}

function cmdListSeeds(cwd: string, statusFilter: string | undefined, raw: boolean): void {
  const planDir = planningDir(cwd);
  const seedsDir = path.join(planDir, 'seeds');
  const wantStatus = statusFilter ? statusFilter.trim().toLowerCase() : null;

  const seeds: Array<{
    seed_id: string; slug: string; status: string; scope: string;
    trigger_when: string; planted: string; title: string; path: string;
  }> = [];
  const summary: Record<string, number> = {};

  // Frontmatter values are not guaranteed to be scalars: extractFrontmatter
  // yields {} for a bare `key:` line and an array for `key: [a, b]`. Coerce every
  // read to a string so one malformed seed cannot crash the whole audit list
  // (`.toLowerCase()` on a non-string throws) or leak a raw object/array into the
  // JSON contract. Mirrors the existing `typeof fm.id === 'string'` guard below.
  const fmStr = (v: unknown): string => (typeof v === 'string' ? v : '');

  let files: fs.Dirent[];
  try {
    files = fs.readdirSync(seedsDir, { withFileTypes: true });
  } catch {
    // No seeds dir (or unreadable) — an empty, non-error result. The seed dir is
    // created lazily by the first plant-seed, so absence is the normal zero case.
    output({ count: 0, seeds: [], summary: {} }, raw, '0');
    return;
  }

  for (const entry of files) {
    if (!entry.isFile()) continue;
    if (!entry.name.startsWith('SEED-') || !entry.name.endsWith('.md')) continue;

    let safeFilePath: string;
    try {
      safeFilePath = requireSafePath(path.join(seedsDir, entry.name), planDir, 'seed file', { allowAbsolute: true });
    } catch {
      continue;
    }
    const content = platformReadSync(safeFilePath);
    if (content === null) continue;

    const fm = extractFrontmatter(content) as Record<string, unknown>;
    const status = (fmStr(fm.status) || 'dormant').toLowerCase().trim() || 'dormant';

    // Match on the raw lowercased status (both sides already normalized);
    // sanitizeForDisplay is for output, not comparison.
    if (wantStatus && status !== wantStatus) continue;

    // Canonical seed id is `SEED-NNN` (frontmatter `id:`, e.g. SEED-001). Fall
    // back to the numeric prefix of the filename, then to the whole stem. The
    // descriptive remainder of the filename (`SEED-NNN-<slug>.md`) is the slug.
    const stem = path.basename(entry.name, '.md');
    const { seed_id: seedId, slug } = deriveSeedIdentity(stem, fm.id);

    let title = sanitizeForDisplay(fmStr(fm.title).slice(0, 100));
    if (!title) {
      const headingMatch = content.match(/^#\s*(.+)$/m);
      if (headingMatch) title = sanitizeForDisplay(headingMatch[1].trim().slice(0, 100));
    }

    const safeStatus = sanitizeForDisplay(status);
    summary[safeStatus] = (summary[safeStatus] || 0) + 1;

    seeds.push({
      seed_id: sanitizeForDisplay(seedId),
      slug: sanitizeForDisplay(slug),
      status: safeStatus,
      scope: sanitizeForDisplay(fmStr(fm.scope) || 'unknown'),
      trigger_when: sanitizeForDisplay(fmStr(fm.trigger_when)),
      planted: sanitizeForDisplay(fmStr(fm.planted)),
      title,
      path: toPosixPath(path.relative(cwd, safeFilePath)),
    });
  }

  // Stable order: by seed_id so output is deterministic across filesystems.
  seeds.sort((a, b) => a.seed_id.localeCompare(b.seed_id));

  output({ count: seeds.length, seeds, summary }, raw, seeds.length.toString());
}

function cmdVerifyPathExists(cwd: string, targetPath: string | undefined, raw: boolean): void {
  if (!targetPath) {
    error('path required for verification');
  }

  // Reject null bytes and validate path does not contain traversal attempts
  if ((targetPath as string).includes('\0')) {
    error('path contains null bytes');
  }

  const fullPath = path.isAbsolute(targetPath as string) ? targetPath as string : path.join(cwd, targetPath as string);

  try {
    const stats = fs.statSync(fullPath);
    const type = stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : 'other';
    const result = { exists: true, type };
    output(result, raw, 'true');
  } catch {
    const result = { exists: false, type: null };
    output(result, raw, 'false');
  }
}

function cmdHistoryDigest(cwd: string, raw: boolean): void {
  const phasesDir = planningPaths(cwd).phases;
  const digest: {
    phases: Record<string, { name: string; provides: Set<string> | string[]; affects: Set<string> | string[]; patterns: Set<string> | string[] }>;
    decisions: Array<{ phase: string; decision: string }>;
    tech_stack: Set<string> | string[];
  } = { phases: {}, decisions: [], tech_stack: new Set() };

  // Collect all phase directories: archived + current
  const allPhaseDirs: Array<{ name: string; fullPath: string; milestone: string | null }> = [];

  // Add archived phases first (oldest milestones first)
  const archived = getArchivedPhaseDirs(cwd) as ArchivedPhaseDir[];
  for (const a of archived) {
    allPhaseDirs.push({ name: a.name, fullPath: a.fullPath, milestone: a.milestone });
  }

  // Add current phases
  if (fs.existsSync(phasesDir)) {
    try {
      const currentDirs = fs.readdirSync(phasesDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .sort();
      for (const dir of currentDirs) {
        allPhaseDirs.push({ name: dir, fullPath: path.join(phasesDir, dir), milestone: null });
      }
    } catch { /* intentionally empty */ }
  }

  if (allPhaseDirs.length === 0) {
    digest.tech_stack = [];
    output(digest, raw, undefined);
    return;
  }

  try {
    for (const { name: dir, fullPath: dirPath } of allPhaseDirs) {
      const summaries = fs.readdirSync(dirPath).filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');

      for (const summary of summaries) {
        const content = platformReadSync(path.join(dirPath, summary));
        if (content === null) continue;
        try {
          const fm = extractFrontmatter(content) as Record<string, unknown>;

          const phaseNum = (fm['phase'] as string) || dir.split('-')[0];

          if (!digest.phases[phaseNum]) {
            digest.phases[phaseNum] = {
              name: (fm['name'] as string) || dir.split('-').slice(1).join(' ') || 'Unknown',
              provides: new Set<string>(),
              affects: new Set<string>(),
              patterns: new Set<string>(),
            };
          }

          // Merge provides
          const depGraph = fm['dependency-graph'] as Record<string, string[]> | undefined;
          if (depGraph && depGraph['provides']) {
            depGraph['provides'].forEach((p: string) => (digest.phases[phaseNum].provides as Set<string>).add(p));
          } else if (fm['provides']) {
            (fm['provides'] as string[]).forEach((p: string) => (digest.phases[phaseNum].provides as Set<string>).add(p));
          }

          // Merge affects
          if (depGraph && depGraph['affects']) {
            depGraph['affects'].forEach((a: string) => (digest.phases[phaseNum].affects as Set<string>).add(a));
          }

          // Merge patterns
          if (fm['patterns-established']) {
            (fm['patterns-established'] as string[]).forEach((p: string) => (digest.phases[phaseNum].patterns as Set<string>).add(p));
          }

          // Merge decisions
          if (fm['key-decisions']) {
            (fm['key-decisions'] as string[]).forEach((d: string) => {
              digest.decisions.push({ phase: phaseNum, decision: d });
            });
          }

          // Merge tech stack
          const techStack = fm['tech-stack'] as { added?: Array<string | { name: string }> } | undefined;
          if (techStack && techStack['added']) {
            techStack['added'].forEach((t: string | { name: string }) => (digest.tech_stack as Set<string>).add(typeof t === 'string' ? t : t.name));
          }

        } catch {  
          // Skip malformed summaries
        }
      }
    }

    // Convert Sets to Arrays for JSON output
    Object.keys(digest.phases).forEach(p => {
      digest.phases[p].provides = [...(digest.phases[p].provides as Set<string>)];
      digest.phases[p].affects = [...(digest.phases[p].affects as Set<string>)];
      digest.phases[p].patterns = [...(digest.phases[p].patterns as Set<string>)];
    });
    digest.tech_stack = [...(digest.tech_stack as Set<string>)];

    output(digest, raw, undefined);
  } catch (e) {
    error('Failed to generate history digest: ' + (e as Error).message);
  }
}

function cmdResolveModel(cwd: string, agentType: string | undefined, raw: boolean): void {
  if (!agentType) {
    error('agent-type required');
  }

  const config = loadConfig(cwd);
  const profile = (config['model_profile'] as string) || 'balanced';
  const model = resolveModelInternal(cwd, agentType!);
  const effort = resolveEffortInternal(cwd, agentType!);

  const agentModels = (MODEL_PROFILES as Record<string, unknown>)[agentType!];
  const result = agentModels
    ? { model, profile, effort }
    : { model, profile, effort, unknown_agent: true };
  output(result, raw, model);
}

function cmdResolveGranularity(cwd: string, phaseType: string | undefined, raw: boolean, override?: string): void {
  if (!phaseType) {
    error('phase-type required');
  }
  assertValidGranularityOverride(override, error);
  const granularity = resolveGranularityInternal(cwd, phaseType, override);
  const result = (VALID_PHASE_TYPES).has(phaseType!)
    ? { granularity, phase_type: phaseType }
    : { granularity, phase_type: phaseType, unknown_phase_type: true };
  output(result, raw, granularity);
}

/**
 * #443 — Superset execution query: model + unified effort + fast_mode.
 *
 * Emits JSON:
 *   { model, profile, effort, effort_rendered, effort_param, effort_propagation,
 *     fast_mode, fast_mode_supported, [unknown_agent] }
 *
 * Flags: --effort <level>, --fast-mode <true|false>, --attempt <n>
 */
function cmdResolveExecution(cwd: string, agentType: string | undefined, raw: boolean, opts?: { effortOverride?: string; fastModeOverride?: boolean; attempt?: number }): void {
  if (!agentType) {
    error('agent-type required');
  }

  opts = opts || {};
  const config = loadConfig(cwd);
  const profile = (config['model_profile'] as string) || 'balanced';
  const model = resolveModelInternal(cwd, agentType!);

  const effortOpts: Record<string, unknown> = {};
  if (typeof opts.effortOverride === 'string') effortOpts['override'] = opts.effortOverride;

  const fastModeOpts: Record<string, unknown> = {};
  if (typeof opts.fastModeOverride === 'boolean') fastModeOpts['override'] = opts.fastModeOverride;

  const effort = (opts.attempt !== undefined && opts.attempt !== null)
    ? resolveEffortForTier(cwd, agentType!, opts.attempt)
    : resolveEffortInternal(cwd, agentType!, effortOpts);

  const fastMode = resolveFastModeInternal(cwd, agentType!, fastModeOpts);

  const runtime = (config['runtime'] as string) || 'claude';
  const rendered = renderEffortForRuntime(runtime, effort);

  const fastModeSupported = RUNTIMES_WITH_FAST_MODE.has(runtime);

  const agentModels = (MODEL_PROFILES as Record<string, unknown>)[agentType!];
  const result: Record<string, unknown> = {
    model,
    profile,
    effort,
    effort_rendered: rendered.value,
    effort_param: rendered.param,
    effort_propagation: rendered.channel,
    fast_mode: fastMode,
    fast_mode_supported: fastModeSupported,
  };
  if (!agentModels) result['unknown_agent'] = true;
  output(result, raw, effort);
}

/**
 * #488 — Replace or inject the `effort:` value in YAML frontmatter.
 * Unlike injectEffortFrontmatter (install.js), this overwrites an existing value.
 */
function setEffortFrontmatter(content: string, effortValue: string): string {
  const eol = /^---\r\n/.test(content) ? '\r\n' : '\n';
  const fmRe = /^---\r?\n([\s\S]*?)^---\r?$/m;
  const match = fmRe.exec(content);
  if (!match) return content;
  const fmBody = match[1];
  if (/^effort:/m.test(fmBody)) {
    return content.replace(/^(effort:)[ \t]*.*$/m, `$1 ${effortValue}`);
  }
  const openLen = 3 + eol.length;
  const closingStart = match.index + openLen + fmBody.length;
  return content.slice(0, closingStart) + `effort: ${effortValue}${eol}` + content.slice(closingStart);
}

/**
 * #488 — Re-sync effort: frontmatter in all installed gsd-*.md agent files to
 * match the current effort config, without requiring a full reinstall.
 *
 * Uses install-time resolution (readGsdEffectiveEffortConfig + resolveInstallTimeEffort
 * from bin/install.js) rather than the runtime resolver (resolveEffortInternal), because
 * the sync must mirror what install actually wrote: home defaults merged with project config.
 * The runtime resolver (loadConfig) does not merge ~/.gsd/defaults.json when a project
 * .planning/config.json exists, so it would silently ignore home-level effort changes.
 */
function cmdEffortSync(cwd: string, raw: boolean, opts?: { dryRun?: boolean; configDir?: string; runtime?: string }): void {
  opts = opts || {};
  const dryRun = opts.dryRun !== false;

  const config = loadConfig(cwd);
  const runtime = opts.runtime || (config['runtime'] as string) || 'claude';

  if (runtime !== 'claude') {
    output({ synced: 0, skipped: 0, changes: [], dry_run: dryRun, reason: `runtime '${runtime}' does not use effort: frontmatter` }, raw, '');
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/unbound-method
  const { getGlobalConfigDir } = require('./runtime-homes.cjs') as { getGlobalConfigDir(runtime: string, explicitDir?: string | null): string };
  // Use install-time resolvers: they merge ~/.gsd/defaults.json with project config,
  // matching the exact logic used when agents were originally installed. #2071: these
  // live in the shipped sibling install-effort-resolver.cjs (extracted from the
  // package-root bin/install.js, which the installer never copies into a runtime home).
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/unbound-method
  const { readGsdEffectiveEffortConfig, resolveInstallTimeEffort } = require('./install-effort-resolver.cjs') as {
    readGsdEffectiveEffortConfig(cwd: string): Record<string, unknown>;
    resolveInstallTimeEffort(cfg: Record<string, unknown>, agentName: string): string;
  };
  const effortCfg = readGsdEffectiveEffortConfig(cwd);

  const agentsDir = path.join(opts.configDir || getGlobalConfigDir(runtime), 'agents');

  if (!fs.existsSync(agentsDir)) {
    output({ synced: 0, skipped: 0, changes: [], dry_run: dryRun, agents_dir: agentsDir, reason: 'agents directory not found' }, raw, '');
    return;
  }

  // Skip symlinks — only write regular files to avoid clobbering symlink targets.
  const files = fs.readdirSync(agentsDir).filter(f => {
    if (!f.startsWith('gsd-') || !f.endsWith('.md')) return false;
    try { return fs.lstatSync(path.join(agentsDir, f)).isFile(); } catch { return false; }
  });
  const changes: EffortSyncChange[] = [];
  let synced = 0;
  let skipped = 0;

  for (const file of files) {
    const agentName = file.replace(/\.md$/, '');
    const filePath = path.join(agentsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');

    // Resolve using install-time logic: home defaults merged with project config.
    const universalEffort = resolveInstallTimeEffort(effortCfg, agentName);
    const rendered = renderEffortForRuntime(runtime, universalEffort);
    const newEffortValue = rendered.value;

    const fmMatch = /^---\r?\n([\s\S]*?)^---\r?$/m.exec(content);
    if (!fmMatch) { skipped++; continue; }

    const effortMatch = /^effort:[ \t]*(.+?)[ \t]*$/m.exec(fmMatch[1]);
    const currentEffort = effortMatch ? effortMatch[1] : null;

    if (currentEffort === newEffortValue) { skipped++; continue; }

    changes.push({ agent: agentName, from: currentEffort, to: newEffortValue });
    synced++;

    if (!dryRun) {
      fs.writeFileSync(filePath, setEffortFrontmatter(content, newEffortValue));
    }
  }

  output({ synced, skipped, changes, dry_run: dryRun, agents_dir: agentsDir }, raw, synced > 0 ? 'changed' : 'ok');
}

function cmdCommit(cwd: string, message: string | undefined, files: string[] | undefined, raw: boolean, amend: boolean, noVerify: boolean, respectStaged?: boolean, allowDeletions?: boolean): void {
  if (!message && !amend) {
    error('commit message required');
  }

  // Sanitize commit message: strip invisible chars and injection markers
  // that could hijack agent context when commit messages are read back
  let sanitizedMessage = message;
  if (sanitizedMessage) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/unbound-method
    const { sanitizeForPrompt } = require('./security.cjs') as { sanitizeForPrompt(text: unknown): string };
    sanitizedMessage = sanitizeForPrompt(sanitizedMessage);
  }

  const config = loadConfig(cwd);

  // Check commit_docs config
  // `skipped: true` is explicit so agent prompts can match on a first-class
  // success signal rather than inferring "skip" from "committed is missing"
  // and improvising raw git fallbacks (#3678).
  // 19-07 unified revision model: envelope field is `id` (short commit_id on
  // git, short change_id on jj), replacing the git-only `hash` key — per the
  // fork commands.cjs reference.
  if (!config['commit_docs']) {
    const result = { committed: false, skipped: true, id: null, reason: 'skipped_commit_docs_false' };
    output(result, raw, 'skipped');
    return;
  }

  // Check if .planning is gitignored
  if (isGitIgnored(cwd, '.planning')) {
    const result = { committed: false, skipped: true, id: null, reason: 'skipped_gitignored' };
    output(result, raw, 'skipped');
    return;
  }

  // Ensure branching strategy branch exists before first commit (#1278).
  // Pre-execution workflows (discuss, plan, research) commit artifacts but the branch
  // was previously only created during execute-phase — too late.
  const branchingStrategy = config['branching_strategy'] as string | undefined;
  if (branchingStrategy && branchingStrategy !== 'none') {
    let branchName: string | null = null;
    if (branchingStrategy === 'phase') {
      // Determine which phase we're committing for from the file paths
      const phaseMatch = (files || []).join(' ').match(/(\d+(?:\.\d+)*)-/);
      if (phaseMatch) {
        const phaseNum = phaseMatch[1];
        const phaseInfo = findPhaseInternal(cwd, phaseNum) as Record<string, unknown> | null;
        if (phaseInfo) {
          branchName = (config['phase_branch_template'] as string)
            .replace('{phase}', normalizePhaseName(phaseInfo['phase_number']))
            .replace('{slug}', (phaseInfo['phase_slug'] as string) || 'phase');
        }
      }
    } else if (branchingStrategy === 'milestone') {
      const milestone = getMilestoneInfo(cwd);
      if (milestone && milestone.version) {
        branchName = (config['milestone_branch_template'] as string)
          .replace('{milestone}', milestone.version)
          .replace('{slug}', generateSlugInternal(milestone.name) || 'milestone');
      }
    }
    // 19-07: cmdCommit's branching block routes through vcs.refs (replayed
    // from the fork commands.cjs plan 02-09 annotations; cwd-via-factory).
    //
    // 19-review CR-01: the branching block is git-only. refs.bookmarks.switch
    // throws VcsNotImplementedError on the jj backend (both the create and
    // plain-switch calls), so an auto-detected jj adapter would crash with an
    // unhandled stack trace whenever branching_strategy is configured. On jj,
    // "switch to a branch before committing" is a no-op by design — Phase 14.1
    // D-02 precedent: bookmark-less `@` is first-class, and bookmark advance
    // is handled by the adapter's commit({bookmark}) path when a caller needs
    // it. Guard on adapter kind, matching the per-verb allowlist
    // (BACKENDS_AVAILABLE_FOR_VERB['refs.bookmarks.switch'] === ['git']).
    if (branchName) {
      const branchVcs = createVcsAdapter(cwd);
      if (branchVcs.kind === 'git') {
        const currentBranch = branchVcs.refs.currentBookmarks()[0] ?? null;        // (was: rev-parse --abbrev-ref HEAD)
        if (currentBranch !== null && currentBranch !== branchName) {
          // Create branch if it doesn't exist, or switch to it if it does.
          // Mirrors the original "try -b, fall back to plain checkout" shape:
          // bookmarks.switch({create:true}) throws on already-exists; the catch
          // falls through to the plain switch — equivalent to the prior
          // "if create.exitCode !== 0 then run plain checkout" pattern.
          try {
            branchVcs.refs.bookmarks.switch(branchName, { create: true });         // (was: checkout -b <name>)
          } catch {
            branchVcs.refs.bookmarks.switch(branchName);                           // (was: checkout <name>)
          }
        }
      }
    }
  }

  // 19-07: adapter scoped to cwd for the staging/commit sites below (fork
  // reference pattern: per-invocation factory with cwd).
  const vcs = createVcsAdapter(cwd);

  // Fork plan 2.1-04 (D-02 + D-04 + D-06): the legacy stage/unstage loop +
  // commit path-scope collapses to a single `vcs.commit({files})` with
  // WC-state-capture. The git backend's commit({files}) runs
  // `git add -A -- <files>`, which stages adds/mods/dels alike, so the
  // explicit if/else stage-vs-unstage dichotomy (deletion-branch → `git rm
  // --cached`; existing-branch → `git add`) is redundant — `git add -A`
  // handles both shapes from one call. The jj backend records WC state
  // directly (no index).
  //
  // #2014 invariant (PRESERVED): when a caller passes an explicit --files for
  // a missing tracked file, the path is FILTERED OUT BEFORE vcs.commit sees
  // it. If we did not filter, `git add -A -- <missing-path>` would stage the
  // deletion and silently remove tracked planning files (e.g. STATE.md,
  // ROADMAP.md) when temporarily absent. In default mode (".planning/"
  // catch-all) the directory always exists, so the filter is a no-op there
  // and removed files inside the tree are still recorded — matching the
  // original "stage all of .planning/" semantics.
  const explicitFiles = !!(files && files.length > 0);
  // v15 envelope-defects fix (Defect 2): absolute --files paths previously
  // reached the #2014 filter as `path.join(cwd, '/abs/path')` — POSIX join
  // concatenates rather than re-roots, so every absolute path resolved to a
  // nonexistent location, was filtered out, and the explicit-files
  // short-circuit returned a silent `nothing_to_commit` (exit 0) without the
  // commit ever being attempted. Normalize absolute paths under the repo
  // root to cwd-relative before any filtering or status-scope matching;
  // absolute paths OUTSIDE the repo root (or equal to it) fail loudly with a
  // structured envelope — a silent no-op here is a data-loss-shaped failure.
  // Symlink robustness: compare realpaths where resolvable. On macOS,
  // TMPDIR-style roots are symlinked (/var/folders → /private/var/folders),
  // so a lexical path.relative between the process cwd (realpath form) and a
  // caller-supplied absolute path (symlink form) would falsely report
  // "outside the repo". For a missing file (the #2014 filter tolerates
  // those), realpath the dirname and re-join the basename.
  const isOutside = (rel: string): boolean => rel === '' || rel.startsWith('..') || path.isAbsolute(rel);
  const relativeToRepo = (f: string): string => {
    let realCwd = cwd;
    try { realCwd = fs.realpathSync(cwd); } catch { /* keep lexical cwd */ }
    let target = f;
    try {
      target = fs.realpathSync(f);
    } catch {
      try { target = path.join(fs.realpathSync(path.dirname(f)), path.basename(f)); } catch { /* keep lexical f */ }
    }
    const realRel = path.relative(realCwd, target);
    if (!isOutside(realRel)) return realRel;
    return path.relative(cwd, f);
  };
  let filesRequested: string[];
  if (explicitFiles) {
    filesRequested = [];
    for (const f of files ?? []) {
      if (!path.isAbsolute(f)) { filesRequested.push(f); continue; }
      const rel = relativeToRepo(f);
      if (isOutside(rel)) {
        const result = {
          committed: false,
          id: null,
          reason: 'path_outside_repo',
          error: `--files path '${f}' is absolute and does not resolve to a path under the repo root '${cwd}' — pass repo-relative paths`,
        };
        output(result, raw, 'failed');
        return;
      }
      filesRequested.push(toPosixPath(rel));
    }
  } else {
    filesRequested = ['.planning/'];
  }
  // 19-review CR-03: the #2014 missing-path filter is SKIPPED under
  // --respect-staged. The hazard the filter guards against is `git add -A --
  // <missing-path>` silently staging a deletion — but respectStaged never
  // runs an add (it commits the already-staged index state), and a staged
  // DELETION's path is legitimately absent from disk. Filtering it out would
  // drop the deletion from the commit (e.g. an undo workflow's staged revert
  // of an added file).
  //
  // v15 envelope-defects fix (Defect 3, 2026-06-11): the #2014 filter made
  // WC deletions inexpressible — a deleted path never exists on disk, so
  // `--files <deleted-path>` was always dropped and the verb returned a
  // misleading `nothing_to_commit` while the deletion sat uncommitted. Disk
  // state alone cannot distinguish an intentional deletion from the
  // temporarily-absent tracked file #2014 guards against, so deletions are
  // OPT-IN via --allow-deletions: a missing path is kept when the WC status
  // reports a change under it (a pending deletion has a status entry; a
  // typo/never-tracked path has none and is still dropped — `git add -A` on
  // such a path would fail with `pathspec did not match`, and committing it
  // was never expressible anyway). Without the flag the filter behaves
  // exactly as before (#2014 invariant preserved, regression-tested in
  // tests/commit-files-deletion.test.cjs), but the dropped deletions are
  // surfaced on the result envelope (`skipped_deletions` + `hint`) so
  // callers can re-run with the flag instead of trusting the no-op.
  let wcStatusEntries: StatusEntry[] | null = null;
  const statusEntries = (): StatusEntry[] => {
    if (wcStatusEntries === null) wcStatusEntries = vcs.status({ porcelain: true }).entries;
    return wcStatusEntries;
  };
  // Path-prefix containment against status (a deleted directory lists
  // per-file entries, never the directory itself).
  const hasWcChange = (spec: string): boolean => {
    const s = spec.replace(/\\/g, '/').replace(/\/+$/, '');
    return statusEntries().some(e => {
      const ep = e.path.replace(/\\/g, '/');
      return ep === s || ep.startsWith(`${s}/`);
    });
  };
  const skippedDeletions: string[] = [];
  let filesToCommit: string[];
  if (explicitFiles && !respectStaged) {
    filesToCommit = [];
    for (const f of filesRequested) {
      if (fs.existsSync(path.join(cwd, f))) { filesToCommit.push(f); continue; }
      if (!hasWcChange(f)) continue; // missing + no WC entry: unchanged #2014 drop
      if (allowDeletions) filesToCommit.push(f);
      else skippedDeletions.push(f);
    }
  } else {
    filesToCommit = filesRequested;
  }
  const deletionHint = 'path(s) deleted in the working copy were skipped; pass --allow-deletions to commit the deletion(s)';

  // #2014 invariant: explicit --files with all-missing entries short-circuits
  // BEFORE vcs.commit.
  if (!amend && explicitFiles && filesToCommit.length === 0) {
    const result: Record<string, unknown> = { committed: false, id: null, reason: 'nothing_to_commit' };
    if (skippedDeletions.length > 0) {
      result['skipped_deletions'] = skippedDeletions;
      result['hint'] = deletionHint;
    }
    output(result, raw, 'nothing');
    return;
  }

  // #3522 (--respect-staged): use the staged-content surface (vcs.diff with
  // staged:true) rather than WC status. Scoped staged set is what the commit
  // will capture; empty-staged short-circuits to `nothing_staged` (NOT
  // `nothing_to_commit`).
  //
  // Default (WC-state-capture): use vcs.status — the commit re-stages the
  // listed paths so the WC IS the source of truth.
  let respectStagedFiles: string[] | null = null;
  if (respectStaged && !amend) {
    const diff = vcs.diff({ staged: true, nameOnly: true });
    const normalize = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '');
    const normalizedSpecs = filesToCommit.map(normalize);
    respectStagedFiles = diff.nameOnly.filter((file) => {
      const nf = normalize(file);
      return normalizedSpecs.some((spec) => nf === spec || nf.startsWith(`${spec}/`));
    });
    if (respectStagedFiles.length === 0) {
      const result = { committed: false, id: null, reason: 'nothing_staged' };
      output(result, raw, 'nothing');
      return;
    }
  } else if (!amend) {
    // D-06 #2014 caller-side pre-probe via vcs.status. The scope is the
    // path-prefix set in filesToCommit; any WC entry whose path starts with
    // one of those prefixes counts as a change to commit. Skipped for amend
    // (amend rewrites HEAD with currently-staged content — the prior code
    // had no pre-probe in the amend branch either). Defect-3 note: reuses
    // the lazily-cached statusEntries() snapshot when the missing-path
    // filter above already probed status (no WC mutation between the two).
    const status = { entries: statusEntries() };                                   // (was: status --porcelain probe before commit)
    // Bidirectional path-containment: scope ↔ entry containment in either
    // direction counts as a match. Required because `git status --porcelain`
    // collapses fully-untracked directories to a single `?? <dir>/` entry;
    // without the entry-contains-scope leg, `--files .planning/STATE.md`
    // against a fresh worktree where .planning/ is fully untracked would
    // miss the match.
    const surviving = status.entries.filter(e => filesToCommit.some(p => e.path.startsWith(p) || p.startsWith(e.path)));
    if (surviving.length === 0) {
      const result = { committed: false, id: null, reason: 'nothing_to_commit' };
      output(result, raw, 'nothing');
      return;
    }
  }

  // Commit (--no-verify skips pre-commit hooks, used by parallel executor
  // agents). `files` carries WC-state-capture semantics — `git add -A --
  // <files>` then `git commit -m <msg>` (no -a) on git; direct WC record on
  // jj. For amend mode, the adapter emits `commit --amend --no-edit`
  // (message field is ignored; `files` is irrelevant under amend's
  // index-rewrite semantics).
  // 19-review WR-04: --amend and --respect-staged are typed
  // VcsNotImplementedError throws on the jj backend. Map them to a
  // structured `{committed:false, reason:'not_supported_on_jj'}` envelope
  // (exit 0, per the JSON-envelope contract workflows parse with jq)
  // instead of crashing with a raw stack trace.
  let commitResult;
  try {
    commitResult = amend
      ? vcs.commit({ message: (sanitizedMessage as string) || '', amend: true, noVerify })     // (was: commit --amend --no-edit [+ --no-verify])
      : respectStaged
        ? vcs.commit({ message: sanitizedMessage as string, files: respectStagedFiles as string[], noVerify, respectStaged: true })
        : vcs.commit({ message: sanitizedMessage as string, files: filesToCommit, noVerify }); // (was: add/rm --cached … + commit -m <msg> [+ --no-verify])
  } catch (err) {
    if (err instanceof VcsNotImplementedError) {
      const result = {
        committed: false,
        id: null,
        reason: 'not_supported_on_jj',
        error: err.message,
      };
      output(result, raw, 'failed');
      return;
    }
    throw err;
  }
  if (commitResult.exitCode !== 0) {
    if (commitResult.stdout.includes('nothing to commit') || commitResult.stderr.includes('nothing to commit')) {
      const result = { committed: false, id: null, reason: 'nothing_to_commit' };
      output(result, raw, 'nothing');
      return;
    }
    const result = {
      committed: false,
      id: null,
      reason: 'commit_failed',
      error: commitResult.stderr || commitResult.stdout,
    };
    output(result, raw, 'failed');
    return;
  }

  // Envelope id (unified revision model: short commit_id on git, short
  // change_id on jj). v15 envelope-defects fix (Defect 1): the id comes from
  // the backend-computed CommitResult.id — the newly-created commit per the
  // contract at src/vcs/types.cts. Re-resolving refs.head here was correct
  // on git (head after commit IS the created commit) but wrong on jj: the
  // squash-model commit leaves @ as a NEW EMPTY change, so every commit in a
  // session reported the same WC change_id instead of the created commit at
  // @-. Shorten via resolveShort for envelope length parity; if shortening
  // fails, fall back to the full backend id rather than a wrong head id.
  let id: string | null = null;
  if (commitResult.id) {
    try {
      id = vcs.refs.resolveShort(expr.rev(commitResult.id));
    } catch {
      id = commitResult.id;
    }
  }
  const result: Record<string, unknown> = { committed: true, id, reason: 'committed' };
  // v15 Defect 3: a partial commit that dropped WC deletions from --files is
  // reported, not silent — callers re-run with --allow-deletions to finish.
  if (skippedDeletions.length > 0) {
    result['skipped_deletions'] = skippedDeletions;
    result['hint'] = deletionHint;
  }
  output(result, raw, id || 'committed');
}

/**
 * Route a list of changed files to their sub-repo prefixes.
 *
 * Bucket sub-repos by their first path segment (#311). Any file that matches a
 * sub-repo prefix must share that sub-repo's first segment, so we only scan
 * the (small) same-first-segment bucket instead of all sub-repos. Within that
 * bucket all candidates are scanned to find the longest (most-specific)
 * matching prefix, so nested sub_repos (e.g. ['packages', 'packages/core'])
 * route to the deepest match regardless of sub_repos array order (#391).
 *
 * @param files    - changed file paths (relative to project root)
 * @param subRepos - sub-repo path prefixes from config.sub_repos
 */
function groupFilesBySubrepo(files: string[], subRepos: string[]): GroupFilesBySubrepoResult {
  const reposByFirstSeg = new Map<string, string[]>();
  for (const repo of subRepos) {
    const firstSeg = String(repo).split('/')[0];
    let bucket = reposByFirstSeg.get(firstSeg);
    if (!bucket) { bucket = []; reposByFirstSeg.set(firstSeg, bucket); }
    bucket.push(repo);
  }
  const grouped: Record<string, string[]> = {};
  const unmatched: string[] = [];
  for (const file of files) {
    const candidates = reposByFirstSeg.get(file.split('/')[0]);
    // Select the longest (most-specific) matching sub-repo prefix so nested
    // sub_repos (e.g. ['packages', 'packages/core']) route correctly regardless
    // of array order. (#391) String() guards the length read so non-string
    // entries never throw, matching the tolerance of the prior `.find` path.
    let match: string | undefined;
    let matchLen = -1;
    if (candidates) {
      for (const repo of candidates) {
        if (file.startsWith(repo + '/')) {
          const repoLen = String(repo).length;
          if (repoLen > matchLen) {
            match = repo;
            matchLen = repoLen;
          }
        }
      }
    }
    if (match) {
      (grouped[match] ||= []).push(file);
    } else {
      unmatched.push(file);
    }
  }
  return { grouped, unmatched };
}

function cmdCommitToSubrepo(cwd: string, message: string | undefined, files: string[] | undefined, raw: boolean): void {
  if (!message) {
    error('commit message required');
  }

  const config = loadConfig(cwd);
  const subRepos = config['sub_repos'] as string[] | undefined;

  if (!subRepos || subRepos.length === 0) {
    error('no sub_repos configured in .planning/config.json');
  }

  if (!files || files.length === 0) {
    error('--files required for commit-to-subrepo');
  }

  // Group files by sub-repo prefix
  const { grouped, unmatched } = groupFilesBySubrepo(files as string[], subRepos as string[]);

  if (unmatched.length > 0) {
    process.stderr.write(`Warning: ${unmatched.length} file(s) did not match any sub-repo prefix: ${unmatched.join(', ')}\n`);
  }

  const repos: Record<string, CommitToSubrepoRepoResult> = {};
  for (const [repo, repoFiles] of Object.entries(grouped)) {
    const repoCwd = path.join(cwd, repo);
    // 19-07: cwd-via-factory pattern (fork commands.cjs plan 02-09 reference)
    // — adapter scoped to the sub-repo's cwd replaces the cwd-arg routing of
    // the raw execGit seam.
    const subVcs = createVcsAdapter(repoCwd);

    // Fork plan 2.1-04 (D-02 + D-04): the explicit per-file stage loop is
    // gone — vcs.commit({files}) captures WC state of the requested paths
    // via `git add -A -- <files>` then `git commit -m <msg>` (no -a). The
    // path list is the sub-repo-relative form of repoFiles (strip the
    // sub-repo prefix so the paths resolve under the sub-repo cwd).
    const subFiles = repoFiles.map(f => f.slice(repo.length + 1));
    const commitResult = subVcs.commit({ message: message as string, files: subFiles });   // (was: add <file> … + commit -m <msg>)
    if (commitResult.exitCode !== 0) {
      if (commitResult.stdout.includes('nothing to commit') || commitResult.stderr.includes('nothing to commit')) {
        repos[repo] = { committed: false, id: null, files: repoFiles, reason: 'nothing_to_commit' };
        continue;
      }
      repos[repo] = { committed: false, id: null, files: repoFiles, reason: 'error', error: commitResult.stderr };
      continue;
    }

    // Envelope id (unified model: short commit_id on git, short change_id on
    // jj). v15 envelope-defects fix (Defect 1, same shape as cmdCommit): use
    // the backend-computed created-revision id from CommitResult.id — on jj,
    // re-resolving head reports the post-commit empty WC change, not the
    // created commit at @-.
    let id: string | null = null;
    if (commitResult.id) {
      try {
        id = subVcs.refs.resolveShort(expr.rev(commitResult.id));
      } catch {
        id = commitResult.id;
      }
    }
    repos[repo] = { committed: true, id, files: repoFiles };
  }

  const result = {
    committed: Object.values(repos).some(r => r.committed),
    repos,
    unmatched: unmatched.length > 0 ? unmatched : undefined,
  };
  output(result, raw, Object.entries(repos).map(([r, v]) => `${r}:${v.id || 'skip'}`).join(' '));
}

/**
 * Prepare a sub-repo for a companion PR branch.
 *
 * Detects uncommitted changes, creates a new branch, stages every changed
 * file explicitly (never git add -A per universal-anti-patterns.md:44), commits,
 * and pushes with --set-upstream. Returns a structured result the workflow uses
 * to call `gh pr create`.
 *
 * On a stage/commit failure (nothing committed yet), the branch is deleted and
 * the caller is returned to the original HEAD so the repo is left clean. On a
 * push failure, the commit already exists — the branch is left in place instead
 * so the user's work is not lost; the error includes a retry instruction.
 */
function cmdPrSubrepo(
  cwd: string,
  repo: string | undefined,
  branch: string | undefined,
  commitMessage: string | undefined,
  raw: boolean,
): void {
  if (!repo) {
    error('--repo required');
  }
  if (!branch) {
    error('--branch required');
  }
  if (!commitMessage || commitMessage.startsWith('--')) {
    error('commit message required');
  }
  if ((branch as string).startsWith('-')) {
    error(`Branch name must not start with '-': ${branch}`);
  }

  // 0. Security: validate repo path is contained within the workspace root.
  //    Uses security.cjs validatePath (symlink-safe realpathSync + startsWith guard)
  //    to reject ../escape, absolute paths, and symlink traversal.
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/unbound-method
  const { validatePath } = require('./security.cjs') as {
    validatePath(filePath: string, baseDir: string): { safe: boolean; resolved: string; error?: string };
  };
  const pathCheck = validatePath(repo as string, cwd);
  if (!pathCheck.safe) {
    error(`Sub-repo path is unsafe: ${pathCheck.error}`);
  }
  const repoCwd = pathCheck.resolved;
  if (!fs.existsSync(repoCwd)) {
    error(`Sub-repo not found: ${repoCwd}`);
  }

  // 19-12 next-merge port (AUDIT-01): this command routes through the ported
  // adapter with backend AUTO-DETECT — the sub-repo may be git or jj
  // independently of the parent. Branch mechanics differ per backend:
  //   - git: checkout -b via refs.bookmarks.switch({create}) BEFORE the
  //     commit (git's commit lands on the checked-out branch).
  //   - jj: anonymous-branch model — commit first, then pin the exact-named
  //     bookmark at the created revision via refs.bookmarks.create(..,
  //     {raw:true}) (raw escapes the adapter's gsd/ namespace prefix; PR
  //     branch names are user-facing, not fork-internal).
  const subVcs = createVcsAdapter(repoCwd);

  // 1. Collect changed tracked files via structured status entries (18-04
  //    discipline: entries[], never .raw, is the predicate surface). Git
  //    reports untracked files as worktree '?' — excluded to preserve
  //    upstream's tracked-modifications-only contract. jj has no untracked
  //    concept (WC auto-tracks), so its entries are all committable.
  let statusEntries: StatusEntry[];
  try {
    statusEntries = subVcs.status({ porcelain: true }).entries;
  } catch (err) {
    error(`VCS status failed in ${repo}: ${(err as Error).message}`);
    return;
  }
  const changedFiles = statusEntries
    .filter((e) => e.worktree !== '?')
    .flatMap((e) => (e.origPath ? [e.origPath, e.path] : [e.path]));

  if (changedFiles.length === 0) {
    output(
      { ok: true, repo, branch, committed: false, reason: 'nothing_to_commit', files: [] },
      raw,
      'nothing_to_commit',
    );
    return;
  }

  // 2. Guard: refuse if the branch/bookmark already exists — branch creation
  //    is non-idempotent on both backends.
  if (subVcs.refs.bookmarks.exists(branch as string, { raw: true })) {
    error(`Branch already exists in ${repo}: ${branch}. Delete it first or choose a unique name.`);
  }

  // Capture the current branch before switching so rollback can return
  // explicitly (git only — `git checkout -` fails on a fresh single-branch
  // repo with no prior HEAD; on jj there is nothing to switch away from).
  const prevBranchName = subVcs.kind === 'git'
    ? (subVcs.refs.currentBookmarks()[0] ?? null)                            // (was: rev-parse --abbrev-ref HEAD)
    : null;

  // 3. git: create + switch to the PR branch BEFORE committing.
  if (subVcs.kind === 'git') {
    try {
      subVcs.refs.bookmarks.switch(branch as string, { create: true });      // (was: checkout -b <branch>)
    } catch (err) {
      error(`Failed to create branch ${branch} in ${repo}: ${(err as Error).message}`);
    }
  }

  // Helper: rollback the created branch and return to the previous HEAD
  // (git-side only; on jj nothing exists yet until the bookmark is pinned).
  const rollback = (): void => {
    if (subVcs.kind !== 'git') return;
    try {
      if (prevBranchName) {
        subVcs.refs.bookmarks.switch(prevBranchName);                        // (was: checkout <prev>)
      }
      subVcs.refs.bookmarks.delete(branch as string, { force: true });       // (was: branch -D <branch>)
    } catch {
      // Best-effort rollback — the primary error is surfaced by the caller.
    }
  };

  // 4+5. Commit every changed tracked path in one adapter call —
  //    vcs.commit({files}) captures the WC state of the named paths
  //    internally (git: read-tree reset + add -A -- <paths> + commit; jj:
  //    squash <paths>), so the explicit per-file staging loop is gone while
  //    the never-`git add -A`-unscoped contract (universal-anti-patterns.md:44)
  //    is preserved by the explicit path list.
  let commitId: string | null = null;
  try {
    const commitResult = subVcs.commit({ message: commitMessage as string, files: changedFiles });
    if (commitResult.exitCode !== 0 || !commitResult.id) {
      rollback();
      error(`Failed to commit in ${repo}: ${commitResult.stderr || commitResult.stdout}`);
      return;
    }
    commitId = commitResult.id;
  } catch (err) {
    rollback();
    error(`Failed to commit in ${repo}: ${(err as Error).message}`);
    return;
  }

  // 3b. jj: pin the exact-named bookmark at the created revision (raw:true
  //     escapes the gsd/ namespace prefix — PR branches are user-facing).
  if (subVcs.kind === 'jj') {
    try {
      subVcs.refs.bookmarks.create(branch as string, expr.rev(commitId), { raw: true });
    } catch (err) {
      error(`Failed to create bookmark ${branch} in ${repo}: ${(err as Error).message}`);
    }
  }

  // 6. Capture the short revision id from the backend-computed created
  //    revision (v15 envelope discipline: CommitResult.id, never re-resolved
  //    head — on jj the head is the post-commit empty WC change).
  let commitHash: string | null = null;
  try {
    commitHash = subVcs.refs.resolveShort(expr.rev(commitId));               // (was: rev-parse --short HEAD)
  } catch {
    commitHash = commitId;
  }

  // 7. Capture remote URL and derive GitHub owner/repo slug for gh pr create.
  const remoteUrl = subVcs.refs.remoteUrl('origin');                         // (was: remote get-url origin)
  let remoteSlug: string | null = null;
  if (remoteUrl) {
    const m = remoteUrl.match(/github\.com[:/](.+?)(?:\.git)?$/);
    remoteSlug = m ? m[1] : null;
  }

  // 8. Push with upstream tracking so gh pr create can find the branch.
  //    Do NOT rollback on push failure — the commit already exists on the
  //    branch/bookmark. Deleting it here would destroy the only ref holding
  //    the user's work. Leave it in place so the user can retry the push.
  //    (git: push --set-upstream origin <branch>; jj: git push --remote
  //    origin --bookmark <branch> — jj tracks pushed bookmarks natively, so
  //    setUpstream is a documented no-op there.)
  const pushResult = subVcs.push({ remote: 'origin', ref: expr.bookmark(branch as string), setUpstream: true });
  if (pushResult.exitCode !== 0) {
    error(`Failed to push ${branch} in ${repo}: ${pushResult.stderr}\nBranch ${branch} was created locally — retry the push (git: \`git -C ${repo} push --set-upstream origin ${branch}\`; jj: \`jj -R ${repo} git push --remote origin --bookmark ${branch}\`).`);
  }

  const result = {
    ok: true,
    repo,
    branch,
    committed: true,
    files: changedFiles,
    commit_hash: commitHash,
    remote_url: remoteUrl,
    remote_slug: remoteSlug,
  };
  output(result, raw, `${repo}@${commitHash ?? 'unknown'}`);
}

function cmdSummaryExtract(cwd: string, summaryPath: string | undefined, fields: string[] | undefined, raw: boolean): void {
  if (!summaryPath) {
    error('summary-path required for summary-extract');
  }

  const fullPath = path.join(cwd, summaryPath as string);

  if (!fs.existsSync(fullPath)) {
    output({ error: 'File not found', path: summaryPath }, raw, undefined);
    return;
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const fm = extractFrontmatter(content) as Record<string, unknown>;

  // Parse key-decisions into structured format
  const parseDecisions = (decisionsList: unknown) => {
    if (!decisionsList || !Array.isArray(decisionsList)) return [];
    return (decisionsList as string[]).map(d => {
      const colonIdx = d.indexOf(':');
      if (colonIdx > 0) {
        return {
          summary: d.substring(0, colonIdx).trim(),
          rationale: d.substring(colonIdx + 1).trim(),
        };
      }
      return { summary: d, rationale: null };
    });
  };

  const techStack = fm['tech-stack'] as { added?: string[] } | undefined;

  // Build full result
  const fullResult: Record<string, unknown> = {
    path: summaryPath,
    one_liner: fm['one-liner'] || extractOneLinerFromBody(content) || null,
    key_files: fm['key-files'] || [],
    tech_added: (techStack && techStack['added']) || [],
    patterns: fm['patterns-established'] || [],
    decisions: parseDecisions(fm['key-decisions']),
    // Tolerate both key forms: the template/reader use kebab `requirements-completed`,
    // but the tool's own JSON output and the milestone audit `--pick` use snake
    // `requirements_completed`. Reading both prevents a snake-keyed SUMMARY (the form the
    // tool emits) from being silently dropped to []. See #628.
    requirements_completed: fm['requirements-completed'] ?? fm['requirements_completed'] ?? [],
  };

  // If fields specified, filter to only those fields
  if (fields && fields.length > 0) {
    const filtered: Record<string, unknown> = { path: summaryPath };
    for (const field of fields) {
      if (fullResult[field] !== undefined) {
        filtered[field] = fullResult[field];
      }
    }
    output(filtered, raw, undefined);
    return;
  }

  output(fullResult, raw, undefined);
}

function _wsSleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function _wsParseRetryAfter(header: string | null | undefined): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) {
    return Math.min(Math.max(parseInt(trimmed, 10) * 1000, 0), 60000);
  }
  const asDate = Date.parse(trimmed);
  if (!isNaN(asDate)) {
    return Math.min(Math.max(asDate - Date.now(), 0), 60000);
  }
  return null;
}

function _wsRetryDelayMs(attempt: number): number {
  const base = 250;
  const cap = 2000;
  const exp = Math.min(base * Math.pow(2, attempt), cap);
  return exp + Math.floor(Math.random() * 100);
}

async function cmdWebsearch(query: string | undefined, options: WebsearchOptions, raw: boolean): Promise<void> {
  const apiKey = process.env['BRAVE_API_KEY'];

  if (!apiKey) {
    // No key = silent skip, agent falls back to built-in WebSearch
    output({ available: false, reason: 'BRAVE_API_KEY not set' }, raw, '');
    return;
  }

  if (!query) {
    output({ available: false, error: 'Query required' }, raw, '');
    return;
  }

  const params = new URLSearchParams({
    q: query,
    count: String(options.limit || 10),
    country: 'us',
    search_lang: 'en',
    text_decorations: 'false'
  });

  if (options.freshness) {
    params.set('freshness', options.freshness);
  }

  const rawTimeout = parseInt(process.env['GSD_WEBSEARCH_TIMEOUT_MS'] as string, 10);
  const timeoutMs = (Number.isInteger(rawTimeout) && rawTimeout > 0) ? rawTimeout : 10000;

  const MAX_RETRIES = 2;
  let attempt = 0;

  while (true) {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(new Error('timeout')), timeoutMs);
      let response: Response;
      try {
        response = await fetch(
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `https://api.search.brave.com/res/v1/web/search?${params}`,
          {
            headers: {
              'Accept': 'application/json',
              'X-Subscription-Token': apiKey
            },
            signal: ac.signal
          }
        );
      } finally {
        clearTimeout(timer);
      }

      if (response.ok) {
        const data = await response.json() as { web?: { results?: Array<{ title: string; url: string; description: string; age?: string }> } };
        const results = (data.web?.results || []).map(r => ({
          title: r.title,
          url: r.url,
          description: r.description,
          age: r.age || null
        }));
        output({
          available: true,
          query,
          count: results.length,
          results
        }, raw, results.map(r => `${r.title}\n${r.url}\n${r.description}`).join('\n\n'));
        return;
      }

      const status = response.status;
      const isRetryable = status === 429 || status >= 500;

      if (!isRetryable) {
        // Non-retryable 4xx — fail immediately, no attempts field
        output({ available: false, error: `API error: ${status}` }, raw, '');
        return;
      }

      // Retryable HTTP error
      attempt++;
      if (attempt > MAX_RETRIES) {
        output({ available: false, error: `API error: ${status}`, attempts: attempt }, raw, '');
        return;
      }

      let delay: number;
      if (status === 429) {
        const retryAfter = _wsParseRetryAfter(response.headers.get('retry-after'));
        delay = retryAfter !== null ? retryAfter : _wsRetryDelayMs(attempt - 1);
      } else {
        delay = _wsRetryDelayMs(attempt - 1);
      }
      await _wsSleep(delay);

    } catch (err) {
      attempt++;
      if (attempt > MAX_RETRIES) {
        output({ available: false, error: (err as Error).message, attempts: attempt }, raw, '');
        return;
      }
      await _wsSleep(_wsRetryDelayMs(attempt - 1));
    }
  }
}

function cmdProgressRender(cwd: string, format: string | undefined, raw: boolean): void {
  const phasesDir = planningPaths(cwd).phases;
  const milestone = getMilestoneInfo(cwd);

  const phases: PhaseProgress[] = [];
  let totalPlans = 0;
  let totalSummaries = 0;

  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort((a, b) => comparePhaseNum(a, b));

    for (const dir of dirs) {
      const dm = dir.match(/^(\d+(?:\.\d+)*)-?(.*)/);
      const phaseNum = dm ? dm[1] : dir;
      const phaseName = dm && dm[2] ? dm[2].replace(/-/g, ' ') : '';
      const phaseFiles = fs.readdirSync(path.join(phasesDir, dir));
      const plans = phaseFiles.filter(f => f.endsWith('-PLAN.md') || f === 'PLAN.md').length;
      const summaries = phaseFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md').length;

      totalPlans += plans;
      totalSummaries += summaries;

      const status = determinePhaseStatus(plans, summaries, path.join(phasesDir, dir), 'Pending');

      phases.push({ number: phaseNum, name: phaseName, plans, summaries, status });
    }
  } catch { /* intentionally empty */ }

  const percent = totalPlans > 0 ? Math.min(100, Math.round((totalSummaries / totalPlans) * 100)) : 0;

  if (format === 'table') {
    // Render markdown table
    const barWidth = 10;
    const filled = Math.round((percent / 100) * barWidth);
    const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
    let out = `# ${milestone.version} ${milestone.name}\n\n`;
    out += `**Progress:** [${bar}] ${totalSummaries}/${totalPlans} plans (${percent}%)\n\n`;
    out += `| Phase | Name | Plans | Status |\n`;
    out += `|-------|------|-------|--------|\n`;
    for (const p of phases) {
      out += `| ${p.number} | ${p.name} | ${p.summaries}/${p.plans} | ${p.status} |\n`;
    }
    output({ rendered: out }, raw, out);
  } else if (format === 'bar') {
    const barWidth = 20;
    const filled = Math.round((percent / 100) * barWidth);
    const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
    const text = `[${bar}] ${totalSummaries}/${totalPlans} plans (${percent}%)`;
    output({ bar: text, percent, completed: totalSummaries, total: totalPlans }, raw, text);
  } else {
    // JSON format
    output({
      milestone_version: milestone.version,
      milestone_name: milestone.name,
      phases,
      total_plans: totalPlans,
      total_summaries: totalSummaries,
      percent,
    }, raw, undefined);
  }
}

/**
 * Match pending todos against a phase's goal/name/requirements.
 * Returns todos with relevance scores based on keyword, area, and file overlap.
 * Used by discuss-phase to surface relevant todos before scope-setting.
 */
function cmdTodoMatchPhase(cwd: string, phase: string | undefined, raw: boolean): void {
  if (!phase) { error('phase required for todo match-phase'); }

  const pendingDir = path.join(planningDir(cwd), 'todos', 'pending');
  const todos: Array<{
    file: string;
    title: string;
    area: string;
    files: string[];
    body: string;
  }> = [];

  // Load pending todos
  try {
    const files = fs.readdirSync(pendingDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const content = platformReadSync(path.join(pendingDir, file));
      if (content === null) continue;
      const titleMatch = content.match(/^title:\s*(.+)$/m);
      const areaMatch = content.match(/^area:\s*(.+)$/m);
      const filesMatch = content.match(/^files:\s*(.+)$/m);
      const body = content.replace(/^(title|area|files|created|priority):.*$/gm, '').trim();

      todos.push({
        file,
        title: titleMatch ? titleMatch[1].trim() : 'Untitled',
        area: areaMatch ? areaMatch[1].trim() : 'general',
        files: filesMatch ? filesMatch[1].trim().split(/[,\s]+/).filter(Boolean) : [],
        body: body.slice(0, 200), // first 200 chars for context
      });
    }
  } catch { /* intentionally empty */ }

  if (todos.length === 0) {
    output({ phase, matches: [], todo_count: 0 }, raw, undefined);
    return;
  }

  // Load phase goal/name from ROADMAP
  const phaseInfo = getRoadmapPhaseInternal(cwd, phase) as Record<string, unknown> | null;
  const phaseName = phaseInfo ? ((phaseInfo['phase_name'] as string) || '') : '';
  const phaseGoal = phaseInfo ? ((phaseInfo['goal'] as string) || '') : '';
  const phaseSection = phaseInfo ? ((phaseInfo['section'] as string) || '') : '';

  // Build keyword set from phase name + goal + section text
  const phaseText = `${phaseName} ${phaseGoal} ${phaseSection}`.toLowerCase();
  const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'will', 'are', 'was', 'has', 'have', 'been', 'not', 'but', 'all', 'can', 'into', 'each', 'when', 'any', 'use', 'new']);
  const phaseKeywords = new Set(
    phaseText.split(/[\s\-_/.,;:()\[\]{}|]+/)
      .map(w => w.replace(/[^a-z0-9]/g, ''))
      .filter(w => w.length > 2 && !stopWords.has(w))
  );

  // Find phase directory to get expected file paths
  const phaseInfoDisk = findPhaseInternal(cwd, phase) as Record<string, unknown> | null;
  const phasePlans: string[] = [];
  if (phaseInfoDisk && phaseInfoDisk['found']) {
    try {
      const phaseDir = path.join(cwd, phaseInfoDisk['directory'] as string);
      const planFiles = fs.readdirSync(phaseDir).filter(f => f.endsWith('-PLAN.md'));
      for (const pf of planFiles) {
        const planContent = platformReadSync(path.join(phaseDir, pf));
        if (planContent === null) continue;
        const fmFiles = planContent.match(/files_modified:\s*\[([^\]]*)\]/);
        if (fmFiles) {
          phasePlans.push(...fmFiles[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean));
        }
      }
    } catch { /* intentionally empty */ }
  }

  // Score each todo for relevance
  const matches: Array<{
    file: string;
    title: string;
    area: string;
    score: number;
    reasons: string[];
  }> = [];
  for (const todo of todos) {
    let score = 0;
    const reasons: string[] = [];

    // Keyword match: todo title/body terms in phase text
    const todoWords = `${todo.title} ${todo.body}`.toLowerCase()
      .split(/[\s\-_/.,;:()\[\]{}|]+/)
      .map(w => w.replace(/[^a-z0-9]/g, ''))
      .filter(w => w.length > 2 && !stopWords.has(w));

    const matchedKeywords = todoWords.filter(w => phaseKeywords.has(w));
    if (matchedKeywords.length > 0) {
      score += Math.min(matchedKeywords.length * 0.2, 0.6);
      reasons.push(`keywords: ${[...new Set(matchedKeywords)].slice(0, 5).join(', ')}`);
    }

    // Area match: todo area appears in phase text
    if (todo.area !== 'general' && phaseText.includes(todo.area.toLowerCase())) {
      score += 0.3;
      reasons.push(`area: ${todo.area}`);
    }

    // File match: todo files overlap with phase plan files
    if (todo.files.length > 0 && phasePlans.length > 0) {
      const fileOverlap = todo.files.filter(f =>
        phasePlans.some(pf => pf.includes(f) || f.includes(pf))
      );
      if (fileOverlap.length > 0) {
        score += 0.4;
        reasons.push(`files: ${fileOverlap.slice(0, 3).join(', ')}`);
      }
    }

    if (score > 0) {
      matches.push({
        file: todo.file,
        title: todo.title,
        area: todo.area,
        score: Math.round(score * 100) / 100,
        reasons,
      });
    }
  }

  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);

  output({ phase, matches, todo_count: todos.length }, raw, undefined);
}

function cmdTodoComplete(cwd: string, filename: string | undefined, raw: boolean): void {
  if (!filename) {
    error('filename required for todo complete');
  }

  const pendingDir = path.join(planningDir(cwd), 'todos', 'pending');
  const completedDir = path.join(planningDir(cwd), 'todos', 'completed');
  const sourcePath = path.join(pendingDir, filename as string);

  if (!fs.existsSync(sourcePath)) {
    error(`Todo not found: ${filename as string}`);
  }

  // Ensure completed directory exists
  platformEnsureDir(completedDir);

  // Read, add completion timestamp, move
  let content = fs.readFileSync(sourcePath, 'utf-8');
  const today = new Date().toISOString().split('T')[0];
  content = `completed: ${today}\n` + content;

  platformWriteSync(path.join(completedDir, filename as string), content);
  fs.unlinkSync(sourcePath);

  output({ completed: true, file: filename, date: today }, raw, 'completed');
}

function cmdScaffold(cwd: string, type: string, options: ScaffoldOptions, raw: boolean): void {
  const { phase, name } = options;
  const padded = phase ? normalizePhaseName(phase) : '00';
  const today = new Date().toISOString().split('T')[0];

  // Find phase directory
  const phaseInfo = phase ? findPhaseInternal(cwd, phase) as Record<string, unknown> | null : null;
  const phaseDir = phaseInfo ? path.join(cwd, phaseInfo['directory'] as string) : null;

  if (phase && !phaseDir && type !== 'phase-dir') {
    error(`Phase ${phase} directory not found`);
  }

  let filePath: string, content: string;

  switch (type) {
    case 'context': {
      filePath = path.join(phaseDir as string, `${padded}-CONTEXT.md`);
      content = `---\nphase: "${padded}"\nname: "${name || (phaseInfo?.['phase_name'] as string | undefined) || 'Unnamed'}"\ncreated: ${today}\n---\n\n# Phase ${phase}: ${name || (phaseInfo?.['phase_name'] as string | undefined) || 'Unnamed'} — Context\n\n## Decisions\n\n_Decisions will be captured during ${String(formatGsdSlash('discuss-phase', resolveRuntime(cwd)))} ${phase}_\n\n## Discretion Areas\n\n_Areas where the executor can use judgment_\n\n## Deferred Ideas\n\n_Ideas to consider later_\n`;
      break;
    }
    case 'uat': {
      filePath = path.join(phaseDir as string, `${padded}-UAT.md`);
      content = `---\nphase: "${padded}"\nname: "${name || (phaseInfo?.['phase_name'] as string | undefined) || 'Unnamed'}"\ncreated: ${today}\nstatus: pending\n---\n\n# Phase ${phase}: ${name || (phaseInfo?.['phase_name'] as string | undefined) || 'Unnamed'} — User Acceptance Testing\n\n## Test Results\n\n| # | Test | Status | Notes |\n|---|------|--------|-------|\n\n## Summary\n\n_Pending UAT_\n`;
      break;
    }
    case 'verification': {
      filePath = path.join(phaseDir as string, `${padded}-VERIFICATION.md`);
      content = `---\nphase: "${padded}"\nname: "${name || (phaseInfo?.['phase_name'] as string | undefined) || 'Unnamed'}"\ncreated: ${today}\nstatus: pending\n---\n\n# Phase ${phase}: ${name || (phaseInfo?.['phase_name'] as string | undefined) || 'Unnamed'} — Verification\n\n## Goal-Backward Verification\n\n**Phase Goal:** [From ROADMAP.md]\n\n## Checks\n\n| # | Requirement | Status | Evidence |\n|---|------------|--------|----------|\n\n## Result\n\n_Pending verification_\n`;
      break;
    }
    case 'phase-dir': {
      if (!phase || !name) {
        error('phase and name required for phase-dir scaffold');
      }
      const slug = generateSlugInternal(name);
      // #3287: apply project_code prefix to stay consistent with phase.add/phase.insert
      const scaffoldConfig = loadConfig(cwd);
      const scaffoldProjectCode = (scaffoldConfig['project_code'] as string) || '';
      const scaffoldPrefix = scaffoldProjectCode ? `${scaffoldProjectCode}-` : '';
      const dirName = `${scaffoldPrefix}${padded}-${slug}`;
      const phasesParent = planningPaths(cwd).phases;
      platformEnsureDir(phasesParent);
      const dirPath = path.join(phasesParent, dirName);
      platformEnsureDir(dirPath);
      output({ created: true, directory: toPosixPath(path.relative(cwd, dirPath)), path: dirPath }, raw, dirPath);
      return;
    }
    default:
      error(`Unknown scaffold type: ${type}. Available: context, uat, verification, phase-dir`);
      // unreachable — error() calls process.exit
      return;
  }

  if (fs.existsSync(filePath)) {
    output({ created: false, reason: 'already_exists', path: filePath }, raw, 'exists');
    return;
  }

  platformWriteSync(filePath, content);
  const relPath = toPosixPath(path.relative(cwd, filePath));
  output({ created: true, path: relPath }, raw, relPath);
}

function cmdStats(cwd: string, format: string | undefined, raw: boolean): void {
  const phasesDir = planningPaths(cwd).phases;
  const roadmapPath = planningPaths(cwd).roadmap;
  const reqPath = planningPaths(cwd).requirements;
  const statePath = planningPaths(cwd).state;
  const milestone = getMilestoneInfo(cwd);
  const isDirInMilestone = getMilestonePhaseFilter(cwd) as (dir: string) => boolean;

  // Phase & plan stats (reuse progress pattern)
  const phasesByNumber = new Map<string, {
    number: string;
    name: string;
    plans: number;
    summaries: number;
    status: string;
  }>();
  let totalPlans = 0;
  let totalSummaries = 0;

  try {
    const roadmapRaw = platformReadSync(roadmapPath);
    if (roadmapRaw === null) throw new Error('roadmap missing');
    const roadmapContent = extractCurrentMilestone(roadmapRaw, cwd);
    // Matches both plain numeric (Phase 1:) and milestone-prefixed (Phase 2-01:) headings.
    // Also tolerates optional [bracket-token] scope prefix on phase headings.
    // #1729: `(?:\s*\([^)\n]*\))?` tolerates a pre-colon ( ) tag (literal mirror of OPTIONAL_PHASE_TAG_SOURCE).
    const headingPattern = /#{2,4}\s*(?:\[[^\]]+\]\s*)?Phase\s+([\w][\w.-]*)(?:\s*\([^)\n]*\))?\s*:\s*([^\n]+)/gi;
    let match: RegExpExecArray | null;
    while ((match = headingPattern.exec(roadmapContent)) !== null) {
      const key = normalizePhaseName(match[1]);
      phasesByNumber.set(key, {
        number: key,
        name: match[2].replace(/\(INSERTED\)/i, '').trim(),
        plans: 0,
        summaries: 0,
        status: 'Not Started',
      });
    }
  } catch { /* intentionally empty */ }

  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .filter(isDirInMilestone)
      .sort((a, b) => comparePhaseNum(a, b));

    for (const dir of dirs) {
      // Use extractPhaseToken to correctly parse M-NN-style and code-prefixed dir names.
      const phaseToken = extractPhaseToken(dir) as string | null;
      const phaseNum = phaseToken || dir;
      // phaseName is everything after the token (strip leading '-')
      const afterToken = dir.slice(phaseToken ? phaseToken.length : 0).replace(/^-/, '');
      const phaseName = afterToken ? afterToken.replace(/-/g, ' ') : '';
      const phaseFiles = fs.readdirSync(path.join(phasesDir, dir));
      const plans = phaseFiles.filter(f => f.endsWith('-PLAN.md') || f === 'PLAN.md').length;
      const summaries = phaseFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md').length;

      totalPlans += plans;
      totalSummaries += summaries;

      const status = determinePhaseStatus(plans, summaries, path.join(phasesDir, dir), 'Not Started');

      const normalizedNum = normalizePhaseName(phaseNum);
      const existing = phasesByNumber.get(normalizedNum);
      phasesByNumber.set(normalizedNum, {
        number: normalizedNum,
        name: existing?.name || phaseName,
        plans: (existing?.plans || 0) + plans,
        summaries: (existing?.summaries || 0) + summaries,
        status,
      });
    }
  } catch { /* intentionally empty */ }

  const phases = [...phasesByNumber.values()].sort((a, b) => comparePhaseNum(a.number, b.number));
  const completedPhases = phases.filter(p => p.status === 'Complete').length;
  const planPercent = totalPlans > 0 ? Math.min(100, Math.round((totalSummaries / totalPlans) * 100)) : 0;
  const percent = phases.length > 0 ? Math.min(100, Math.round((completedPhases / phases.length) * 100)) : 0;

  // Requirements stats
  let requirementsTotal = 0;
  let requirementsComplete = 0;
  const reqContent = platformReadSync(reqPath);
  if (reqContent !== null) {
    const checked = reqContent.match(/^- \[x\] \*\*/gm);
    const unchecked = reqContent.match(/^- \[ \] \*\*/gm);
    requirementsComplete = checked ? checked.length : 0;
    requirementsTotal = requirementsComplete + (unchecked ? unchecked.length : 0);
  }

  // Last activity from STATE.md
  let lastActivity: string | null = null;
  const stateContent = platformReadSync(statePath);
  if (stateContent !== null) {
    const activityMatch = stateContent.match(/^last_activity:\s*(.+)$/im)
      || stateContent.match(/\*\*Last Activity:\*\*\s*(.+)/i)
      || stateContent.match(/^Last Activity:\s*(.+)$/im)
      || stateContent.match(/^Last activity:\s*(.+)$/im);
    if (activityMatch) lastActivity = activityMatch[1].trim();
  }

  // VCS stats (JSON keys keep their historical `git_*` names for envelope
  // parity; values are backend-canonical — unified revision model).
  // 19-07: replayed from the fork commands.cjs plan 02-09 annotations
  // (countCommits / rootRevisions / log({rev: expr.rev(<runtime-id>)})).
  let gitCommits = 0;
  let gitFirstCommitDate: string | null = null;
  try {
    const statsVcs = createVcsAdapter(cwd);
    // Rule-1 deviation from the fork's 02-09 annotation (which passed
    // {rev: refs.head}, written pre-jj-backend): on jj, an explicit head rev
    // translates to '@' and counts ONE commit, while the no-rev default is
    // '::@' (full ancestry) — identical to git's no-rev 'HEAD' default. Omit
    // rev so both backends count head's full ancestry.
    gitCommits = statsVcs.refs.countCommits({});                                   // (was: rev-list --count HEAD)
    const roots = statsVcs.refs.rootRevisions({});                                 // (was: rev-list --max-parents=0 HEAD)
    if (roots.length > 0) {
      const firstCommit = roots[0];
      // Wrap the runtime revision id via expr.rev() (structured RevisionExpr;
      // no raw escape hatch). vcs.log() with maxCount:1 is the contract path
      // for `show -s --format=%as <rev>`; the date arrives on LogEntry.date
      // in %aI iso format. Slice [0,10) to match the prior `%as` YYYY-MM-DD.
      const entries = statsVcs.log({ rev: expr.rev(firstCommit), maxCount: 1 });   // (was: show -s --format=%as <firstCommit>)
      if (entries.length > 0 && entries[0].date) {
        gitFirstCommitDate = entries[0].date.slice(0, 10) || null;
      }
    }
  } catch { /* intentionally empty — non-repo cwd or empty repo */ }

  const result = {
    milestone_version: milestone.version,
    milestone_name: milestone.name,
    phases,
    phases_completed: completedPhases,
    phases_total: phases.length,
    total_plans: totalPlans,
    total_summaries: totalSummaries,
    percent,
    plan_percent: planPercent,
    requirements_total: requirementsTotal,
    requirements_complete: requirementsComplete,
    git_commits: gitCommits,
    git_first_commit_date: gitFirstCommitDate,
    last_activity: lastActivity,
  };

  if (format === 'table') {
    const barWidth = 10;
    const filled = Math.round((percent / 100) * barWidth);
    const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
    let out = `# ${milestone.version} ${milestone.name} — Statistics\n\n`;
    out += `**Progress:** [${bar}] ${completedPhases}/${phases.length} phases (${percent}%)\n`;
    if (totalPlans > 0) {
      out += `**Plans:** ${totalSummaries}/${totalPlans} complete (${planPercent}%)\n`;
    }
    out += `**Phases:** ${completedPhases}/${phases.length} complete\n`;
    if (requirementsTotal > 0) {
      out += `**Requirements:** ${requirementsComplete}/${requirementsTotal} complete\n`;
    }
    out += '\n';
    out += `| Phase | Name | Plans | Completed | Status |\n`;
    out += `|-------|------|-------|-----------|--------|\n`;
    for (const p of phases) {
      out += `| ${p.number} | ${p.name} | ${p.plans} | ${p.summaries} | ${p.status} |\n`;
    }
    if (gitCommits > 0) {
      out += `\n**Git:** ${gitCommits} commits`;
      if (gitFirstCommitDate) out += ` (since ${gitFirstCommitDate})`;
      out += '\n';
    }
    if (lastActivity) out += `**Last activity:** ${lastActivity}\n`;
    output({ rendered: out }, raw, out);
  } else {
    output(result, raw, undefined);
  }
}

/**
 * Check whether a commit should be allowed based on commit_docs config.
 * When commit_docs is false, rejects commits that stage .planning/ files.
 * Intended for use as a pre-commit hook guard.
 */
function cmdCheckCommit(cwd: string, raw: boolean): void {
  const config = loadConfig(cwd);

  // If commit_docs is true (or not set), allow all commits
  if (config['commit_docs'] !== false) {
    output({ allowed: true, reason: 'commit_docs_enabled' }, raw, 'allowed');
    return;
  }

  // commit_docs is false — check if any .planning/ files are staged.
  // 19-07: vcs.diff({staged:true, nameOnly:true}) replaces the raw probe
  // (fork commands.cjs plan 02-09 reference). The `{ kind: 'git' }` pin is
  // KEPT from the fork reference: this is a pre-commit hook guard probing
  // git's index — a git-only concept (jj has no staging area).
  try {
    const checkVcs = createVcsAdapter(cwd, { kind: 'git' });
    const staged = checkVcs.diff({ staged: true, nameOnly: true }).nameOnly.join('\n').trim(); // (was: diff --cached --name-only)
    const planningFiles = staged.split('\n').filter(f => f.startsWith('.planning/') || f.startsWith('.planning\\'));

    if (planningFiles.length > 0) {
      error(
        `commit_docs is false but ${planningFiles.length} .planning/ file(s) are staged:\n` +
        planningFiles.map(f => `  ${f}`).join('\n') +
        `\n\nTo unstage: git reset HEAD ${planningFiles.join(' ')}`
      );
    }
  } catch {
    // diff failed (not a git repo, etc.) — allow
  }

  output({ allowed: true, reason: 'no_planning_files_staged' }, raw, 'allowed');
}

export = {
  groupFilesBySubrepo,
  determinePhaseStatus,
  cmdGenerateSlug,
  cmdCurrentTimestamp,
  cmdListTodos,
  cmdListSeeds,
  deriveSeedIdentity,
  cmdVerifyPathExists,
  cmdHistoryDigest,
  cmdResolveModel,
  cmdResolveGranularity,
  cmdResolveExecution,
  cmdEffortSync,
  cmdCommit,
  cmdCommitToSubrepo,
  cmdPrSubrepo,
  cmdSummaryExtract,
  cmdWebsearch,
  cmdProgressRender,
  cmdTodoComplete,
  cmdTodoMatchPhase,
  cmdScaffold,
  cmdStats,
  cmdCheckCommit,
  _wsParseRetryAfter,
};
