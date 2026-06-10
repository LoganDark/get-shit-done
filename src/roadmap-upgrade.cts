/**
 * Roadmap Upgrade — Migration tool for converting legacy 'Phase N' phase IDs
 * to milestone-prefixed 'Phase M-NN' form.
 *
 * ADR-457 build-at-publish: the hand-written bin/lib/roadmap-upgrade.cjs collapsed
 * to a TypeScript source of truth. Behaviour is preserved byte-for-behaviour
 * from the prior hand-written .cjs; only types are added.
 */

import fs from 'node:fs';
import path from 'node:path';
// 19-07 (AUDIT-01, T-19-DG): raw child_process exec is gone from this module.
// The clean-tree gate + HEAD capture route through the ported adapter; the
// rollback path is non-destructive — filesystem rename-reversal plus the
// adapter restore surface scoped to .planning/ (the only tree this tool
// touches), replacing the prior whole-repo destructive hard-reset +
// `git clean -fd` pair. vcsExec is the adapter-internal exec seam, used here
// only for the jj-side restore (same fork gap-fill carry-over as the
// vcs-command-router restore verb; see src/vcs/backends/jj.cts TODO).
import { createVcsAdapter } from './vcs/index.cjs';
import { expr } from './vcs/expr.cjs';
import { vcsExec } from './vcs/exec.cjs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import planningWorkspace = require('./planning-workspace.cjs');
const { planningDir } = planningWorkspace;

// ─── Regex helpers ────────────────────────────────────────────────────────────

// Matches legacy phase headings: ### Phase N: Name  (also decimal: Phase 2.1:)
// Captures: (hashes)(spaces)(phase-number)(rest-of-line)
const LEGACY_PHASE_HEADING_RE = /^(#{2,4})\s*(?:\[[^\]]+\]\s*)?Phase\s+(\d+[A-Z]?(?:\.\d+)*)\s*:(.*)/i;

// Matches already-migrated phase headings: ### Phase M-NN: Name
const MIGRATED_PHASE_HEADING_RE = /^#{2,4}\s*(?:\[[^\]]+\]\s*)?Phase\s+\d+-\d{2}\s*:/i;

// Matches milestone section headings: ## v1.0, ## Roadmap v2.0, ## ✅ v1.0, ## [GSD] v1.0, etc.
// The optional bracket-token prefix (e.g., [GSD]) must be tested before the emoji group.
const MILESTONE_HEADING_RE = /^##\s+(?:\[[^\]]+\]\s+|Roadmap\s+|[✅🚧]\s*)?v(\d+)\.(\d+)(?:\s|:)/iu;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedPhaseEntry {
  lineIndex: number;
  headingLine: string;
  alreadyMigrated: boolean;
  milestoneInt?: number | null;
  legacyPhaseNum?: string;
  phaseName?: string;
  hashes?: string;
}

interface AssignedMapping {
  newId: string;
  milestoneInt: number;
  subIndex: number;
  legacyPhaseNum: string;
}

interface PhaseRename {
  oldId: string;
  newId: string;
  oldDir: string;
  newDir: string;
}

interface RoadmapEdit {
  lineIndex: number;
  from: string;
  to: string;
}

interface CrossRefEdit {
  file: string;
  from: string;
  to: string;
}

interface MigrationPlan {
  alreadyMigrated: boolean;
  phases: PhaseRename[];
  roadmapEdits: RoadmapEdit[];
  crossRefEdits: CrossRefEdit[];
}

interface ApplyMigrationResult {
  applied?: boolean;
  alreadyMigrated?: boolean;
  dryRun?: boolean;
  renamedDirs?: string[];
  editedFiles?: string[];
}

// ─── Pure computation helpers ─────────────────────────────────────────────────

/**
 * Parse the ROADMAP.md content and build a list of phase entries with their
 * enclosing milestone major version.
 *
 * Returns an array of:
 *   { lineIndex, headingLine, milestoneInt, legacyPhaseNum, phaseName }
 */
function parseRoadmapPhases(lines: string[]): ParsedPhaseEntry[] {
  const results: ParsedPhaseEntry[] = [];
  let currentMilestoneInt: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const milestoneMatch = line.match(MILESTONE_HEADING_RE);
    if (milestoneMatch) {
      currentMilestoneInt = parseInt(milestoneMatch[1], 10);
      continue;
    }

    if (MIGRATED_PHASE_HEADING_RE.test(line)) {
      // Already-migrated heading found — caller will detect this
      results.push({ lineIndex: i, headingLine: line, alreadyMigrated: true });
      continue;
    }

    const phaseMatch = line.match(LEGACY_PHASE_HEADING_RE);
    if (phaseMatch) {
      results.push({
        lineIndex: i,
        headingLine: line,
        milestoneInt: currentMilestoneInt,
        legacyPhaseNum: phaseMatch[2],
        phaseName: phaseMatch[3].trim(),
        hashes: phaseMatch[1],
        alreadyMigrated: false,
      });
    }
  }

  return results;
}

/**
 * Assign sub-indices within each milestone, building a per-entry mapping.
 *
 * Input: array from parseRoadmapPhases (non-migrated entries only).
 * Returns: Map<lineIndex, { newId, milestoneInt, subIndex }>
 *
 * Keyed by `lineIndex` (the unique position of the heading line in ROADMAP.md)
 * so that identical legacy phase numbers in different milestones (e.g., two
 * `Phase 1` headings in v1.0 and v2.0) each get their own correct M-NN ID
 * instead of the later milestone's mapping overwriting the earlier one.
 *
 * Sub-indices are 1-based and sequential within each milestone.
 */
function assignSubIndices(phaseEntries: ParsedPhaseEntry[]): Map<number, AssignedMapping> {
  const milestoneCounters = new Map<number, number>(); // milestoneInt → counter
  const mapping = new Map<number, AssignedMapping>(); // lineIndex → { newId, milestoneInt, subIndex }

  for (const entry of phaseEntries) {
    if (entry.alreadyMigrated) continue;
    const m = entry.milestoneInt;
    if (m === null || m === undefined) continue;

    const counter = (milestoneCounters.get(m) || 0) + 1;
    milestoneCounters.set(m, counter);

    const subIndex = String(counter).padStart(2, '0');
    const newId = `${m}-${subIndex}`;

    mapping.set(entry.lineIndex, { newId, milestoneInt: m, subIndex: counter, legacyPhaseNum: entry.legacyPhaseNum! });
  }

  return mapping;
}

/**
 * Read a phase directory name and return its numeric token (stripping project_code prefix).
 * e.g. "GSD-01-setup" → "01", "01-setup" → "01", "02-implement" → "02", "02.1-hotfix" → "02.1"
 */
function extractPhaseNumFromDir(dirName: string): string | null {
  // Strip optional project_code prefix: "GSD-01-setup" → "01-setup"
  const stripped = dirName.replace(/^[A-Z]{1,6}-(?=\d)/i, '');
  // Matches: digits + optional letter + optional decimal suffix, followed by '-' or end.
  // e.g. "02.1-hotfix" → "02.1", "01-setup" → "01"
  const m = stripped.match(/^(\d+[A-Z]?(?:\.\d+)*)(?:-|$)/i);
  return m ? m[1] : null;
}


/**
 * Build the new directory name from old name and new phase ID.
 * old: "01-setup"         newId: "1-02"  projectCode: "GSD"  → "GSD-01-02-setup"
 * old: "01-setup"         newId: "1-02"  projectCode: null   → "01-02-setup"
 * old: "GSD-01-setup"     newId: "1-02"  projectCode: "GSD"  → "GSD-01-02-setup"
 */
function buildNewDirName(oldDirName: string, newId: string, projectCode: string | null): string {
  // Strip existing project_code prefix
  const stripped = oldDirName.replace(/^[A-Z]{1,6}-(?=\d)/i, '');

  // Extract slug: everything after "NN-" (the old phase num, including decimal like 02.1)
  const slugMatch = stripped.match(/^\d+[A-Z]?(?:\.\d+)*-(.*)/i);
  const slug = slugMatch ? slugMatch[1] : stripped;

  // Build M-NN prefix (zero-pad both parts)
  const [milestoneStr, subStr] = newId.split('-');
  const milestoneInt = parseInt(milestoneStr, 10);
  const paddedMilestone = String(milestoneInt).padStart(2, '0');
  const newBase = slug ? `${paddedMilestone}-${subStr}-${slug}` : `${paddedMilestone}-${subStr}`;

  return projectCode ? `${projectCode}-${newBase}` : newBase;
}

// ─── computeMigrationPlan ─────────────────────────────────────────────────────

/**
 * Compute a migration plan without touching the filesystem.
 */
function computeMigrationPlan(cwd: string, options: Record<string, unknown> = {}): MigrationPlan {
  void options;
  const pDir = planningDir(cwd);
  const roadmapPath = path.join(pDir, 'ROADMAP.md');
  const configPath = path.join(pDir, 'config.json');
  const phasesDir = path.join(pDir, 'phases');

  // ── Check config for existing convention ─────────────────────────────────
  let configData: Record<string, unknown> = {};
  try {
    configData = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
  } catch { /* config may not exist */ }

  if (configData['phase_id_convention'] === 'milestone-prefixed') {
    return { alreadyMigrated: true, phases: [], roadmapEdits: [], crossRefEdits: [] };
  }

  const projectCode = typeof configData['project_code'] === 'string' ? configData['project_code'] : null;

  // ── Read ROADMAP.md ───────────────────────────────────────────────────────
  let roadmapContent = '';
  try {
    roadmapContent = fs.readFileSync(roadmapPath, 'utf8');
  } catch {
    throw new Error(`ROADMAP.md not found at ${roadmapPath}`);
  }

  const lines = roadmapContent.split('\n');
  const parsedPhases = parseRoadmapPhases(lines);

  // Check for any already-migrated headings
  const hasAnyMigrated = parsedPhases.some(e => e.alreadyMigrated);
  if (hasAnyMigrated) {
    return { alreadyMigrated: true, phases: [], roadmapEdits: [], crossRefEdits: [] };
  }

  const legacyPhases = parsedPhases.filter(e => !e.alreadyMigrated);
  const idMapping = assignSubIndices(legacyPhases);

  // Secondary lookup: (milestoneInt, normalizedLegacyNum) → newId
  // Used for directory renames and checklist rewrites where line position is unknown.
  // For simplicity, each milestone gets its own Map from legacy num → newId.
  const milestoneIdMap = new Map<number, Map<string, string>>(); // milestoneInt → Map<normalizedLegacyNum, newId>
  for (const [, entry] of idMapping) {
    if (!milestoneIdMap.has(entry.milestoneInt)) {
      milestoneIdMap.set(entry.milestoneInt, new Map<string, string>());
    }
    const mMap = milestoneIdMap.get(entry.milestoneInt)!;
    const legacyNum = entry.legacyPhaseNum;
    // Register integer forms (covers plain numeric and letter-suffix IDs)
    const intPart = parseInt(legacyNum, 10);
    const paddedLegacy = String(intPart).padStart(2, '0');
    const unpaddedLegacy = String(intPart);
    mMap.set(paddedLegacy, entry.newId);
    mMap.set(unpaddedLegacy, entry.newId);
    // Also register the original form and padded-integer+decimal form
    // so decimal IDs like "2.1" / "02.1" round-trip correctly.
    mMap.set(legacyNum, entry.newId);
    const dotIdx = legacyNum.indexOf('.');
    if (dotIdx !== -1) {
      const decimalSuffix = legacyNum.slice(dotIdx); // e.g. ".1"
      mMap.set(paddedLegacy + decimalSuffix, entry.newId);
      mMap.set(unpaddedLegacy + decimalSuffix, entry.newId);
    }
  }

  // ── Read existing phase directories ───────────────────────────────────────
  let existingDirs: string[] = [];
  try {
    existingDirs = fs.readdirSync(phasesDir).filter(d => {
      try {
        return fs.statSync(path.join(phasesDir, d)).isDirectory();
      } catch { return false; }
    });
  } catch { /* phases dir may not exist */ }

  // ── Build phase rename pairs ───────────────────────────────────────────────
  // Flat ordered list of (legacyPhaseNum, newId) in ROADMAP order, for dir matching.
  const orderedMappings = [...idMapping.values()].map(e => ({
    legacyPhaseNum: e.legacyPhaseNum,
    newId: e.newId,
    milestoneInt: e.milestoneInt,
    _used: false,
  }));

  // Note: if the same legacy phase number appears in multiple milestones (the exact legacy
  // ambiguity this tool is designed to resolve), directories are matched in ROADMAP document
  // order — the first ROADMAP occurrence of a given number claims the first matching disk dir.
  // This is the only unambiguous assignment strategy for flat dirs that carry no milestone
  // context. The dry-run output shows the complete rename plan so users can review before
  // applying with --apply.

  const phases: PhaseRename[] = [];
  for (const dirName of existingDirs) {
    const phaseNum = extractPhaseNumFromDir(dirName);
    if (!phaseNum) continue;

    const intPart = parseInt(phaseNum, 10);
    const paddedPhaseNum = String(intPart).padStart(2, '0');
    const unpaddedPhaseNum = String(intPart);
    // For decimal IDs like "02.1", also try "2.1"
    const dotIdx = phaseNum.indexOf('.');
    const decimalUnpadded = dotIdx !== -1 ? unpaddedPhaseNum + phaseNum.slice(dotIdx) : null;

    // Find the first unused mapping whose legacy number matches (exact, padded, unpadded, or decimal)
    const found = orderedMappings.find(m => !m._used && (
      m.legacyPhaseNum === phaseNum ||
      m.legacyPhaseNum === paddedPhaseNum ||
      m.legacyPhaseNum === unpaddedPhaseNum ||
      (decimalUnpadded && m.legacyPhaseNum === decimalUnpadded)
    ));
    if (!found) continue;
    found._used = true;

    const newDirName = buildNewDirName(dirName, found.newId, projectCode);
    if (newDirName !== dirName) {
      phases.push({
        oldId: phaseNum,
        newId: found.newId,
        oldDir: dirName,
        newDir: newDirName,
      });
    }
  }

  // ── Build ROADMAP.md line edits ────────────────────────────────────────────
  const roadmapEdits: RoadmapEdit[] = [];

  for (const entry of legacyPhases) {
    // Use lineIndex as the canonical key (not legacyPhaseNum, which may collide across milestones)
    const mapping = idMapping.get(entry.lineIndex);
    if (!mapping) continue;

    // Rewrite heading line: "### Phase N: Name" → "### Phase M-NN: Name"
    const oldLine = lines[entry.lineIndex];
    const newLine = oldLine.replace(
      /^(#{2,4}\s*(?:\[[^\]]+\]\s*)?Phase\s+)\d+[A-Z]?(?:\.\d+)*(\s*:)/i,
      `$1${mapping.newId}$2`
    );
    if (newLine !== oldLine) {
      roadmapEdits.push({ lineIndex: entry.lineIndex, from: oldLine, to: newLine });
    }
  }

  // Rewrite checklist lines in ROADMAP.md — use milestone context to resolve collisions.
  let currentChecklistMilestone: number | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track enclosing milestone section for context-aware lookup
    const milestoneHeadingMatch = line.match(MILESTONE_HEADING_RE);
    if (milestoneHeadingMatch) {
      currentChecklistMilestone = parseInt(milestoneHeadingMatch[1], 10);
    }

    // Already in roadmapEdits? skip
    if (roadmapEdits.some(e => e.lineIndex === i)) continue;

    // Match checklist items: "- [ ] **Phase N:**" or "- [x] Phase N:"  (also decimal)
    const checklistMatch = line.match(/^(\s*-\s*\[[ x]\]\s*\*{0,2}Phase\s+)(\d+[A-Z]?(?:\.\d+)*)(\s*[:\s*])/i);
    if (checklistMatch) {
      const legacyNum = checklistMatch[2];
      const cIntPart = parseInt(legacyNum, 10);
      const paddedLegacy = String(cIntPart).padStart(2, '0');
      const unpaddedLegacy = String(cIntPart);
      const cDotIdx = legacyNum.indexOf('.');
      const paddedLegacyDecimal = cDotIdx !== -1 ? paddedLegacy + legacyNum.slice(cDotIdx) : null;

      // Prefer milestone-context lookup (avoids collision across milestones)
      let newId: string | undefined;
      if (currentChecklistMilestone !== null && milestoneIdMap.has(currentChecklistMilestone)) {
        const mMap = milestoneIdMap.get(currentChecklistMilestone)!;
        newId = mMap.get(legacyNum) || mMap.get(paddedLegacy) || mMap.get(unpaddedLegacy);
        if (!newId && paddedLegacyDecimal) newId = mMap.get(paddedLegacyDecimal);
      }
      if (!newId) {
        // Fallback: use ordered flat list (no milestone collision in this roadmap)
        const found = orderedMappings.find(m =>
          m.legacyPhaseNum === legacyNum ||
          m.legacyPhaseNum === paddedLegacy ||
          m.legacyPhaseNum === unpaddedLegacy ||
          (paddedLegacyDecimal && m.legacyPhaseNum === paddedLegacyDecimal)
        );
        if (found) newId = found.newId;
      }

      if (newId) {
        const newLine = line.replace(
          /^(\s*-\s*\[[ x]\]\s*\*{0,2}Phase\s+)\d+[A-Z]?(?:\.\d+)*(\s*[:\s*])/i,
          `$1${newId}$2`
        );
        if (newLine !== line) {
          roadmapEdits.push({ lineIndex: i, from: line, to: newLine });
        }
      }
    }
  }

  // ── Build cross-ref edits for STATE.md and PROJECT.md ────────────────────
  const crossRefEdits: CrossRefEdit[] = [];
  const crossRefFiles = ['STATE.md', 'PROJECT.md'];

  for (const fileName of crossRefFiles) {
    const filePath = path.join(pDir, fileName);
    if (!fs.existsSync(filePath)) continue;

    const fileContent = fs.readFileSync(filePath, 'utf8');

    // Iterate using orderedMappings (ROADMAP order) — idMapping is now keyed by lineIndex.
    for (const m of orderedMappings) {
      const legacyNum = m.legacyPhaseNum;
      const xIntPart = parseInt(legacyNum, 10);
      const paddedNum = String(xIntPart).padStart(2, '0');
      const unpaddedNum = String(xIntPart);
      // Decimal suffix (e.g. ".1" from "2.1") — preserve in cross-ref patterns
      const xDotIdx = legacyNum.indexOf('.');
      const decimalSuffix = xDotIdx !== -1 ? legacyNum.slice(xDotIdx) : '';

      // Rewrite project_code-prefixed references: "GSD-01-" → "GSD-01-02-"
      if (projectCode) {
        const [milestoneStr, subStr] = m.newId.split('-');
        const paddedMilestone = String(parseInt(milestoneStr, 10)).padStart(2, '0');
        const prefixedNew = `${projectCode}-${paddedMilestone}-${subStr}-`;
        // Try both padded and original forms as old prefix
        for (const oldNum of new Set([paddedNum + decimalSuffix, unpaddedNum + decimalSuffix, paddedNum, unpaddedNum])) {
          const prefixedOld = `${projectCode}-${oldNum}-`;
          if (fileContent.includes(prefixedOld)) {
            crossRefEdits.push({ file: fileName, from: prefixedOld, to: prefixedNew });
          }
        }
      }

      // Rewrite prose references: "Phase 1:" → "Phase 1-01:", "Phase 2.1:" → "Phase 1-02:"
      const proseOldPatterns = new Set([
        `Phase ${unpaddedNum}${decimalSuffix}:`,
        `Phase ${paddedNum}${decimalSuffix}:`,
        `Phase ${legacyNum}:`,
      ]);
      for (const proseOld of proseOldPatterns) {
        if (fileContent.includes(proseOld)) {
          const proseNew = `Phase ${m.newId}:`;
          crossRefEdits.push({ file: fileName, from: proseOld, to: proseNew });
        }
      }
    }
  }

  return {
    alreadyMigrated: false,
    phases,
    roadmapEdits,
    crossRefEdits,
  };
}

// ─── applyMigration ───────────────────────────────────────────────────────────

/**
 * Apply the migration plan computed by computeMigrationPlan().
 *
 * @param cwd
 * @param plan
 * @param options
 * @param options.dryRun - Print plan and exit without mutating. (default true)
 */
function applyMigration(cwd: string, plan: MigrationPlan, options: { dryRun?: boolean } = {}): ApplyMigrationResult {
  const dryRun = options.dryRun !== false; // default true

  if (plan.alreadyMigrated) {
    return { alreadyMigrated: true };
  }

  if (dryRun) {
    process.stdout.write(JSON.stringify(plan, null, 2) + '\n');
    return { dryRun: true };
  }

  // ── Real run: verify clean working tree ───────────────────────────────────
  // 19-07 (T-19-DG): adapter-routed clean-tree gate (was: git status --porcelain).
  const vcs = createVcsAdapter(cwd);
  let statusEntries: number;
  try {
    statusEntries = vcs.status({ porcelain: true }).entries.length;
  } catch (err) {
    throw new Error(`VCS status failed: ${(err as Error).message}`);
  }
  if (statusEntries > 0) {
    throw new Error('Working tree is dirty. Commit or stash changes before migrating.');
  }

  // Capture the rollback baseline revision id BEFORE any mutation — unified
  // revision model: LogEntry.id is the backend-canonical identifier (full hex
  // commit_id on git, change_id on jj). (was: git rev-parse HEAD)
  //
  // 19-review CR-02: on jj the first log row is `@` — the working-copy
  // commit's change_id. A change_id is a stable pointer to a MUTABLE change:
  // by rollback time jj has auto-snapshotted the half-migrated working copy
  // into `@`, so `jj restore --from <@'s change_id>` would restore the WC
  // from itself — a silent no-op. Use `@-` (the parent of the working-copy
  // commit) as the baseline on jj: it is the last landed state before this
  // tool's mutations, and the clean-tree gate above guarantees `@` and `@-`
  // have identical .planning/ content at capture time. On git, HEAD is an
  // immutable commit and stays correct as-is.
  let headRev: string;
  try {
    const headEntries = vcs.kind === 'jj'
      ? vcs.log({ rev: expr.parent(), maxCount: 1 })   // @- : pre-mutation baseline
      : vcs.log({ maxCount: 1 });                      // git HEAD (immutable)
    if (headEntries.length === 0 || !headEntries[0].id) {
      throw new Error('no commits found at HEAD');
    }
    headRev = headEntries[0].id;
  } catch (err) {
    throw new Error(`HEAD revision capture failed: ${(err as Error).message}`);
  }

  const pDir = planningDir(cwd);
  const phasesDir = path.join(pDir, 'phases');
  const roadmapPath = path.join(pDir, 'ROADMAP.md');
  const configPath = path.join(pDir, 'config.json');

  const renamedDirs: string[] = [];
  const editedFiles: string[] = [];
  // 19-07 (T-19-DG): record each completed rename with absolute paths so the
  // rollback can reverse them precisely via the filesystem (renames are WC
  // operations — fs rename-reversal is the exact inverse; the prior
  // `git clean -fd .planning/phases/` existed only to sweep the renamed-to
  // dirs, which the reversal makes unnecessary).
  const completedRenames: { oldPath: string; newPath: string }[] = [];

  try {
    // 1. Rename phase directories
    for (const phaseEntry of plan.phases) {
      const oldPath = path.join(phasesDir, phaseEntry.oldDir);
      const newPath = path.join(phasesDir, phaseEntry.newDir);
      if (fs.existsSync(oldPath)) {
        fs.renameSync(oldPath, newPath);
        completedRenames.push({ oldPath, newPath });
        renamedDirs.push(`${phaseEntry.oldDir} → ${phaseEntry.newDir}`);
      }
    }

    // 2. Rewrite ROADMAP.md phase headings
    if (plan.roadmapEdits.length > 0) {
      const roadmapContent = fs.readFileSync(roadmapPath, 'utf8');
      const lines = roadmapContent.split('\n');

      // Sort edits by lineIndex to apply in order
      const sortedEdits = [...plan.roadmapEdits].sort((a, b) => a.lineIndex - b.lineIndex);
      for (const edit of sortedEdits) {
        if (lines[edit.lineIndex] === edit.from) {
          lines[edit.lineIndex] = edit.to;
        }
      }

      fs.writeFileSync(roadmapPath, lines.join('\n'), 'utf8');
      editedFiles.push('ROADMAP.md');
    }

    // 3. Rewrite cross-refs in STATE.md and PROJECT.md
    const crossRefsByFile = new Map<string, CrossRefEdit[]>();
    for (const edit of plan.crossRefEdits) {
      if (!crossRefsByFile.has(edit.file)) {
        crossRefsByFile.set(edit.file, []);
      }
      crossRefsByFile.get(edit.file)!.push(edit);
    }

    for (const [fileName, edits] of crossRefsByFile) {
      const filePath = path.join(pDir, fileName);
      if (!fs.existsSync(filePath)) continue;

      let content = fs.readFileSync(filePath, 'utf8');
      let changed = false;

      for (const edit of edits) {
        if (content.includes(edit.from)) {
          // Replace all occurrences
          content = content.split(edit.from).join(edit.to);
          changed = true;
        }
      }

      if (changed) {
        fs.writeFileSync(filePath, content, 'utf8');
        editedFiles.push(fileName);
      }
    }

    // 4. Update config.json: set phase_id_convention to 'milestone-prefixed'
    let configData: Record<string, unknown> = {};
    try {
      configData = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    } catch { /* config may not exist yet */ }

    configData['phase_id_convention'] = 'milestone-prefixed';
    fs.writeFileSync(configPath, JSON.stringify(configData, null, 2) + '\n', 'utf8');
    editedFiles.push('config.json');

  } catch (err) {
    // 19-07 (T-19-DG): NON-DESTRUCTIVE rollback replacing the prior
    // whole-repo destructive pair (hard-reset to <sha> + `git clean -fd
    // .planning/phases/`). Two precise steps, scoped to what this tool
    // actually touched:
    //   1. Reverse the completed directory renames via the filesystem (exact
    //      inverse of the WC operations performed above — also removes the
    //      renamed-to dirs the old `clean -fd` swept).
    //   2. Restore .planning/ file content from the captured pre-mutation
    //      baseline through the adapter restore surface (git: gitOnly.restore
    //      --source HEAD; jj: `jj restore --from <@-'s change_id>` via the
    //      adapter-internal exec seam — same surface as the `gsd-tools query
    //      restore` verb). 19-review CR-02: the jj baseline is `@-`, NOT `@`
    //      — restoring from `@`'s change_id would be a no-op because jj
    //      auto-snapshots the half-migrated WC into `@` (see capture site
    //      above).
    // If any rollback step fails, FAIL LOUDLY with manual-recovery
    // instructions — never fall back to raw destructive git.
    const rollbackErrors: string[] = [];

    for (const r of [...completedRenames].reverse()) {
      try {
        if (fs.existsSync(r.newPath) && !fs.existsSync(r.oldPath)) {
          fs.renameSync(r.newPath, r.oldPath);
        }
      } catch (renameErr) {
        rollbackErrors.push(`rename-reversal failed for ${r.newPath} → ${r.oldPath}: ${(renameErr as Error).message}`);
      }
    }

    try {
      if (vcs.kind === 'git') {
        const res = vcs.gitOnly.restore({ files: ['.planning/'], from: headRev });
        if (res.exitCode !== 0) {
          rollbackErrors.push(`vcs restore failed (exit ${res.exitCode}): ${res.stderr || res.stdout}`);
        }
      } else {
        // jj path: no adapter restore verb yet — dispatch via the
        // adapter-internal exec seam (fork gap-fill carry-over; mirrors
        // src/vcs-command-router.cts restoreVerb's jj branch).
        const res = vcsExec(cwd, 'jj', ['restore', '--from', headRev, '--', '.planning/']);
        if (res.exitCode !== 0) {
          rollbackErrors.push(`jj restore failed (exit ${res.exitCode}): ${res.stderr || res.stdout}`);
        }
      }
    } catch (restoreErr) {
      rollbackErrors.push(`restore threw: ${(restoreErr as Error).message}`);
    }

    if (rollbackErrors.length > 0) {
      throw new Error(
        `Migration failed AND rollback is INCOMPLETE: ${(err as Error).message}\n` +
        `Rollback issues:\n${rollbackErrors.map((e) => `  - ${e}`).join('\n')}\n` +
        `Manual recovery (captured pre-migration revision: ${headRev}):\n` +
        `  - git backend: git restore --source ${headRev} -- .planning/\n` +
        `  - jj backend:  jj restore --from ${headRev} -- .planning/\n` +
        `  then remove any leftover renamed directories under .planning/phases/.`,
      );
    }
    throw new Error(`Migration failed (rolled back to ${headRev}): ${(err as Error).message}`);
  }

  return { applied: true, renamedDirs, editedFiles };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export = {
  computeMigrationPlan,
  applyMigration,
};
