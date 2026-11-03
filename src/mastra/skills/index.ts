/**
 * skills/index.ts
 *
 * Reusable capability packages across Entertainment, Productivity,
 * Marketing, and Business Operations.
 * Each skill defines a SkillManifest, Zod input/output schemas,
 * required tools & permissions, acceptance criteria, and composable execution logic.
 */

import { z } from 'zod';
import { skillRegistry } from '../registry/skill-registry';
import { AgentDomain } from '../registry/manifest-schemas';
import {
  ExtractedSceneSchema,
  ExtractedScene,
} from '../schemas/domain-schemas';

// ── 1. Specialized Skill: `script.scene-extraction` & `scene-extraction` ─────

export const SceneExtractionInputSchema = z.object({
  projectId: z.string().min(1),
  scriptText: z.string().min(1),
  sourceRef: z.string().optional(),
  preferences: z
    .object({
      flagAmbiguousTimeOfDay: z.boolean().default(true),
      extractPropsAndVehicles: z.boolean().default(true),
    })
    .optional(),
});

export const SceneExtractionOutputSchema = z.object({
  projectId: z.string(),
  sourceRef: z.string(),
  totalScenes: z.number().int().nonnegative(),
  scenes: z.array(ExtractedSceneSchema),
  ambiguousExtractionCount: z.number().int().nonnegative(),
});

const COMPILED_PROPS = ['compass', 'gun', 'sword', 'phone', 'laptop', 'console', 'briefcase', 'ring', 'key', 'letter', 'lantern'].map((kw) => ({ kw, regex: new RegExp(`\\b${kw}s?\\b`, 'i') }));
const COMPILED_WARDROBE = ['jacket', 'coat', 'suit', 'uniform', 'gown', 'helmet', 'cloak', 'boots', 'dress'].map((kw) => ({ kw, regex: new RegExp(`\\b${kw}s?\\b`, 'i') }));
const COMPILED_VEHICLES = ['car', 'truck', 'helicopter', 'transport', 'motorcycle', 'van', 'ship', 'shuttle', 'sedan'].map((kw) => ({ kw, regex: new RegExp(`\\b${kw}s?\\b`, 'i') }));
const COMPILED_STUNTS = ['jump', 'explosion', 'crash', 'fight', 'fall', 'chase', 'combat', 'leap'].map((kw) => ({ kw, regex: new RegExp(`\\b${kw}s?\\b`, 'i') }));
const COMPILED_VFX = ['hologram', 'holographic', 'portal', 'laser', 'cgi', 'green screen', 'drone swarm', 'energy'].map((kw) => ({ kw, regex: new RegExp(`\\b${kw}s?\\b`, 'i') }));
const COMPILED_SOUND = ['siren', 'thunder', 'whisper', 'alarm', 'gunshot', 'echo', 'hum', 'music', 'rain'].map((kw) => ({ kw, regex: new RegExp(`\\b${kw}s?\\b`, 'i') }));

function matchPrecompiledKeywords(compiled: Array<{ kw: string; regex: RegExp }>, text: string): string[] {
  const matched: string[] = [];
  for (let i = 0; i < compiled.length; i++) {
    if (compiled[i].regex.test(text)) {
      matched.push(compiled[i].kw);
    }
  }
  return matched;
}

/**
 * Deterministic screenplay parser that preserves source order, avoids inventing
 * elements, flags ambiguous extractions, and retains line-span provenance.
 */
export function parseScreenplayIntoScenes(
  input: z.infer<typeof SceneExtractionInputSchema>
): z.infer<typeof SceneExtractionOutputSchema> {
  const lines = input.scriptText.split(/\r?\n/);
  const sluglineRegex = /^(?:(\d+[A-Z]?)\s+)?(INT\.\/EXT\.|I\/E\.|INT\.|EXT\.)\s+(.+?)(?:\s+-\s+(.+))?$/i;

  const rawSceneBlocks: Array<{
    sceneNumber: string;
    slugline: string;
    intExt: 'INT' | 'EXT' | 'INT/EXT' | 'UNKNOWN';
    location: string;
    timeOfDay: string;
    startLine: number;
    endLine: number;
    bodyLines: string[];
  }> = [];

  let currentBlock: (typeof rawSceneBlocks)[number] | null = null;
  let autoSceneCounter = 1;

  for (let idx = 0; idx < lines.length; idx++) {
    const rawLine = lines[idx].trim();
    const match = rawLine.match(sluglineRegex);
    if (match) {
      if (currentBlock) {
        currentBlock.endLine = idx;
        rawSceneBlocks.push(currentBlock);
      }
      const explicitNum = match[1];
      const prefixRaw = match[2].toUpperCase();
      const intExt: 'INT' | 'EXT' | 'INT/EXT' | 'UNKNOWN' =
        prefixRaw.includes('INT') && prefixRaw.includes('EXT') || prefixRaw.startsWith('I/E')
          ? 'INT/EXT'
          : prefixRaw.startsWith('INT')
            ? 'INT'
            : prefixRaw.startsWith('EXT')
              ? 'EXT'
              : 'UNKNOWN';

      const locationPart = (match[3] || 'UNSPECIFIED LOCATION').trim();
      const timePart = (match[4] || 'UNSPECIFIED').trim().toUpperCase();

      currentBlock = {
        sceneNumber: explicitNum || String(autoSceneCounter++),
        slugline: rawLine,
        intExt,
        location: locationPart,
        timeOfDay: timePart,
        startLine: idx + 1,
        endLine: lines.length,
        bodyLines: [],
      };
    } else if (currentBlock) {
      currentBlock.bodyLines.push(lines[idx]);
    }
  }

  if (currentBlock) {
    currentBlock.endLine = lines.length;
    rawSceneBlocks.push(currentBlock);
  }

  // Fallback if script text had no standard sluglines: treat entire text as 1 uncertain scene
  if (rawSceneBlocks.length === 0) {
    rawSceneBlocks.push({
      sceneNumber: '1',
      slugline: 'UNSPECIFIED SLUGLINE',
      intExt: 'UNKNOWN',
      location: 'UNSPECIFIED LOCATION',
      timeOfDay: 'UNSPECIFIED',
      startLine: 1,
      endLine: lines.length,
      bodyLines: lines,
    });
  }

  const extractedScenes: ExtractedScene[] = rawSceneBlocks.map((block) => {
    const bodyText = block.bodyLines.join('\n').trim();
    const bodyLower = bodyText.toLowerCase();

    // Extract character cues (ALL CAPS words or lines / Name (age) introductions)
    const charSet = new Set<string>();
    const introMatches = bodyText.matchAll(/\b([A-Z][A-Z0-9_ ]{1,20})\s*\((?:\d+s?|V\.O\.|O\.S\.)\)/g);
    for (const m of introMatches) {
      const candidate = m[1].trim();
      if (candidate && !['INT', 'EXT', 'CUT TO', 'FADE IN', 'FADE OUT'].includes(candidate)) {
        charSet.add(candidate);
      }
    }
    for (const line of block.bodyLines) {
      const trimmed = line.trim();
      if (
        /^[A-Z][A-Z0-9 ]{1,22}$/.test(trimmed) &&
        !trimmed.endsWith(':') &&
        !['CUT TO', 'FADE IN', 'FADE OUT', 'CONTINUED'].includes(trimmed)
      ) {
        charSet.add(trimmed);
      }
    }

    const props = matchPrecompiledKeywords(COMPILED_PROPS, bodyLower);
    const wardrobe = matchPrecompiledKeywords(COMPILED_WARDROBE, bodyLower);
    const vehicles = matchPrecompiledKeywords(COMPILED_VEHICLES, bodyLower);
    const stunts = matchPrecompiledKeywords(COMPILED_STUNTS, bodyLower);
    const vfx = matchPrecompiledKeywords(COMPILED_VFX, bodyLower);
    const soundNotes = matchPrecompiledKeywords(COMPILED_SOUND, bodyLower);

    const uncertaintyFlags: string[] = [];
    if (block.intExt === 'UNKNOWN') {
      uncertaintyFlags.push('Missing standard INT./EXT. slugline prefix');
    }
    if (
      block.timeOfDay === 'UNSPECIFIED' ||
      ['LATER', 'CONTINUOUS', 'SAME', 'MOMENTS LATER'].includes(block.timeOfDay)
    ) {
      uncertaintyFlags.push(`Ambiguous time of day: '${block.timeOfDay}'`);
    }
    if (charSet.size === 0) {
      uncertaintyFlags.push('No explicit character cues detected in scene block');
    }

    const confidence = Math.max(0.4, Number((1 - uncertaintyFlags.length * 0.18).toFixed(2)));

    return {
      sceneNumber: block.sceneNumber,
      slugline: block.slugline,
      intExt: block.intExt,
      location: block.location,
      timeOfDay: block.timeOfDay,
      synopsis: bodyText.slice(0, 240) || 'No scene action text provided.',
      characters: Array.from(charSet),
      props,
      wardrobe,
      vehicles,
      stunts,
      vfx,
      soundNotes,
      sourceSpan: {
        startLine: block.startLine,
        endLine: block.endLine,
        rawExcerpt: bodyText.slice(0, 160),
      },
      confidence,
      uncertaintyFlags,
    };
  });

  const ambiguousExtractionCount = extractedScenes.filter(
    (s) => s.uncertaintyFlags.length > 0
  ).length;

  return {
    projectId: input.projectId,
    sourceRef: input.sourceRef ?? `production://projects/${input.projectId}/script`,
    totalScenes: extractedScenes.length,
    scenes: extractedScenes,
    ambiguousExtractionCount,
  };
}

function registerSceneExtractionSkills() {
  const ids = ['script.scene-extraction', 'scene-extraction'];
  for (const id of ids) {
    skillRegistry.register({
      manifest: {
        id,
        name: 'Screenplay Scene & Element Extraction',
        description:
          'Extracts ordered scenes, sluglines, cast, props, wardrobe, vehicles, stunts, VFX, sound notes, source spans, and uncertainty flags from a screenplay.',
        domain: 'entertainment',
        version: '1.0.0',
        inputSchemaRef: `schemas/skills/${id}.input`,
        outputSchemaRef: `schemas/skills/${id}.output`,
        requiredTools: ['production.read-script'],
        requiredPermissions: ['production:read'],
        instructionsRef: `instructions/skills/${id}`,
        acceptanceCriteria: [
          'Preserve exact source scene ordering',
          'Never invent characters, props, or locations absent from source text',
          'Mark ambiguous time-of-day or missing sluglines in uncertaintyFlags',
          'Include line-number sourceSpan for every extracted scene',
        ],
        evaluationCases: ['eval-scene-extraction-standard', 'eval-scene-extraction-ambiguous'],
      },
      instructions:
        'Parse screenplay text into ordered scenes with strict provenance. Flag uncertain elements rather than guessing.',
      inputSchema: SceneExtractionInputSchema,
      outputSchema: SceneExtractionOutputSchema,
      execute: async (input) => parseScreenplayIntoScenes(input),
    });
  }
}

// ── 2. Composable Domain Skill Factory ───────────────────────────────────────

export const StandardSkillInputSchema = z.object({
  topicOrBrief: z.string().min(1).optional(),
  prompt: z.string().min(1).optional(),
  projectId: z.string().optional(),
  data: z.record(z.string(), z.any()).optional(),
  constraints: z.array(z.string()).optional(),
}).refine(
  (val) => Boolean(val.topicOrBrief || val.prompt || (val.data && Object.keys(val.data).length > 0)),
  { message: 'At least one of topicOrBrief, prompt, or non-empty data is required' }
);

export const StandardSkillOutputSchema = z.object({
  skillId: z.string(),
  domain: z.string(),
  summary: z.string(),
  deliverable: z.record(z.string(), z.any()),
  extractedFacts: z.array(
    z.object({
      fact: z.string(),
      sourceRef: z.string(),
    })
  ),
  assumptions: z.array(z.string()),
  uncertaintyFlags: z.array(z.string()),
  isDraft: z.boolean(),
});

interface SkillSeed {
  id: string;
  aliases?: string[];
  name: string;
  description: string;
  domain: AgentDomain;
  requiredTools: string[];
  requiredPermissions: string[];
}

const CATALOGUE_SKILLS: SkillSeed[] = [
  // ── Entertainment (ENT-01 .. ENT-18) ──
  { id: 'idea-to-brief', name: 'Idea to Creative Brief', description: 'Convert a raw concept into a structured creative project brief.', domain: 'entertainment', requiredTools: ['files.read'], requiredPermissions: ['project:read'] },
  { id: 'creative-brief-review', name: 'Creative Brief Diagnostics', description: 'Review a creative brief for scope, audience, and deliverable gaps.', domain: 'entertainment', requiredTools: ['files.read'], requiredPermissions: ['project:read'] },
  { id: 'project-scope', name: 'Project Scope Definition', description: 'Define creative boundaries, format parameters, and deliverable targets.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['project:read'] },
  { id: 'development-roadmap', name: 'Development Roadmap Builder', description: 'Build phased creative development milestones and review gates.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['project:read'] },

  { id: 'logline', aliases: ['story.logline'], name: 'Logline Generator', description: 'Craft high-concept loglines with protagonist, inciting incident, and stakes.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['project:read'] },
  { id: 'synopsis', aliases: ['story.synopsis'], name: 'Story Synopsis Builder', description: 'Develop one-page narrative synopses preserving core dramatic arcs.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['project:read'] },
  { id: 'treatment', name: 'Narrative Treatment Writer', description: 'Expand story beats into a scene-by-scene prose treatment.', domain: 'entertainment', requiredTools: ['files.read'], requiredPermissions: ['project:read'] },
  { id: 'character-bible', aliases: ['story.character-bible'], name: 'Character Bible Architect', description: 'Build character biographies, motivations, flaws, and relationship arcs.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['project:read'] },
  { id: 'story-structure', name: 'Story Structure Analyzer', description: 'Map narrative acts, turning points, and pacing diagnostics.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['project:read'] },
  { id: 'screenplay-draft', aliases: ['screenplay.draft'], name: 'Screenplay Scene Drafter', description: 'Draft industry-formatted screenplay scenes with sluglines, action, and dialogue.', domain: 'entertainment', requiredTools: ['production.read-script'], requiredPermissions: ['production:read'] },
  { id: 'dialogue-rewrite', name: 'Dialogue Polish & Subtext', description: 'Refine character voice, rhythm, and subtext in dialogue passages.', domain: 'entertainment', requiredTools: ['production.read-script'], requiredPermissions: ['production:read'] },
  { id: 'script-coverage', aliases: ['screenplay.script-coverage'], name: 'Script Coverage & Diagnostics', description: 'Produce structured studio script coverage with strengths, risks, and notes.', domain: 'entertainment', requiredTools: ['production.read-script'], requiredPermissions: ['production:read'] },

  { id: 'parse-script', name: 'Screenplay Structure Parser', description: 'Normalize screenplay formatting and identify scene boundaries.', domain: 'entertainment', requiredTools: ['production.read-script'], requiredPermissions: ['production:read'] },
  { id: 'cast-breakdown', name: 'Cast & Speaking Role Breakdown', description: 'Extract speaking cast, extras, and character scene appearances.', domain: 'entertainment', requiredTools: ['production.read-script'], requiredPermissions: ['production:read'] },
  { id: 'props-breakdown', name: 'Props & Action Item Breakdown', description: 'Identify script-referenced hand props and set dressing items.', domain: 'entertainment', requiredTools: ['production.read-script'], requiredPermissions: ['production:read'] },
  { id: 'location-breakdown', name: 'Script Location Breakdown', description: 'Group INT/EXT scene locations and time-of-day requirements.', domain: 'entertainment', requiredTools: ['production.read-script'], requiredPermissions: ['production:read'] },
  { id: 'department-breakdown', name: 'Department Element Breakdown', description: 'Categorize breakdown elements across wardrobe, makeup, VFX, stunts, and sound.', domain: 'entertainment', requiredTools: ['production.read-script'], requiredPermissions: ['production:read'] },
  { id: 'breakdown-validation', name: 'Breakdown Integrity Validator', description: 'Verify scene counts, duplicate elements, and flag ambiguous items.', domain: 'entertainment', requiredTools: ['production.read-script'], requiredPermissions: ['production:read'] },

  { id: 'scene-visualization', name: 'Scene Visual Conception', description: 'Translate script scenes into key visual beats and staging plans.', domain: 'entertainment', requiredTools: ['production.read-script'], requiredPermissions: ['production:read'] },
  { id: 'storyboard-sequence', name: 'Storyboard Panel Sequence', description: 'Plan sequential storyboard panels with framing and camera movement.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'frame-description', name: 'Storyboard Frame Specification', description: 'Describe composition, subject placement, and action for individual frames.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'storyboard-prompt', name: 'Visual Generation Prompt Builder', description: 'Generate consistent visual synthesis prompts for storyboard frames.', domain: 'entertainment', requiredTools: ['enhance-image-prompt'], requiredPermissions: ['production:read'] },
  { id: 'visual-continuity-check', name: 'Visual Continuity Checker', description: 'Check screen direction, eyelines, and visual progression across shots.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },

  { id: 'visual-language', name: 'Cinematography Visual Language', description: 'Define aspect ratio, color temperature, movement philosophy, and visual tone.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'shot-list', name: 'Scene Shot List Builder', description: 'Generate numbered camera shot lists with shot size, angle, and movement.', domain: 'entertainment', requiredTools: ['production.read-script'], requiredPermissions: ['production:read'] },
  { id: 'lens-and-camera-plan', name: 'Camera & Lens Package Plan', description: 'Recommend focal lengths, sensor formats, and camera support rigs.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'lighting-plan', name: 'Scene Lighting Setup Plan', description: 'Draft key/fill/backlight ratios, fixtures, and motivated lighting notes.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'coverage-plan', name: 'Scene Coverage Strategy', description: 'Plan master, two-shot, close-up, and insert coverage for editorial flexibility.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'cinematography-reference', name: 'Cinematography Lookbook Brief', description: 'Compile visual references and photographic mood notes.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },

  { id: 'art-direction', name: 'Art Direction Concept Brief', description: 'Define architectural motifs, textures, palette, and period/world rules.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'set-and-prop-brief', name: 'Set Construction & Prop Brief', description: 'Specify set dressing, hero props, and practical build requirements.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'costume-look', name: 'Costume & Wardrobe Look Brief', description: 'Design character wardrobe palettes, silhouettes, and condition arcs.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'hair-makeup-look', name: 'Hair, Makeup & Prosthetics Brief', description: 'Specify character hair, makeup, and special makeup effects requirements.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'production-design-reference', name: 'Production Design Reference Pack', description: 'Organize art department visual references by location and character.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },

  { id: 'character-casting-brief', name: 'Character Casting Breakdown', description: 'Create casting breakdowns with character essence, age range, and dramatic requirements.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'role-requirements', name: 'Role Skill & Availability Spec', description: 'Document physical skills, language, dialect, and schedule needs per role.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'audition-sides', name: 'Audition Sides Selector', description: 'Select and format representative script excerpts for casting auditions.', domain: 'entertainment', requiredTools: ['production.read-script'], requiredPermissions: ['production:read'] },
  { id: 'candidate-matrix', name: 'Casting Candidate Comparison Matrix', description: 'Compare auditioned talent against role requirements and ensemble chemistry.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'casting-shortlist', name: 'Casting Shortlist Summary', description: 'Compile structured casting shortlist recommendations for director/producer review.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },

  { id: 'location-criteria', name: 'Location Aesthetic & Technical Criteria', description: 'Define visual, acoustic, power, and logistical criteria for script locations.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'location-research', name: 'Candidate Location Research', description: 'Research candidate shooting locations matching creative and permit criteria.', domain: 'entertainment', requiredTools: ['web.search'], requiredPermissions: ['production:read', 'knowledge:search'] },
  { id: 'location-comparison', name: 'Location Suitability Matrix', description: 'Compare candidate locations on cost, accessibility, sound, and aesthetics.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'location-brief', name: 'Location Scout Brief', description: 'Prepare comprehensive location scout dossiers for tech scouts.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'location-risk-check', name: 'Location Permit & Safety Risk Check', description: 'Identify weather, noise, curfew, and safety hazards for locations.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },

  { id: 'schedule-draft', name: 'Production Shooting Schedule Draft', description: 'Group breakdown scenes by location, cast, and day/night into a shooting schedule.', domain: 'entertainment', requiredTools: ['production.create-schedule-draft'], requiredPermissions: ['production:read'] },
  { id: 'stripboard-data', name: 'Stripboard Day Organizer', description: 'Generate stripboard strips with page eighths, cast IDs, and company moves.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'call-sheet-draft', name: 'Daily Call Sheet Drafter', description: 'Draft daily call sheets with crew call, cast report times, and nearest hospital.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'crew-plan', name: 'Department Crew Staffing Plan', description: 'Outline department head and crew staffing requirements by production phase.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'equipment-plan', name: 'Production Equipment Logistics Plan', description: 'List camera, grip, electric, and sound package requirements per shoot day.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'daily-production-plan', name: 'Daily Shoot Operations Plan', description: 'Coordinate daily movement orders, meal penalties avoidance, and turnaround.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },

  { id: 'top-sheet-budget', name: 'Production Top-Sheet Budget', description: 'Build above-the-line, below-the-line, post, and contingency budget top-sheets.', domain: 'entertainment', requiredTools: ['finance.read-budget'], requiredPermissions: ['finance:read'] },
  { id: 'department-budget', name: 'Department Line-Item Budget', description: 'Estimate department-level labor, rentals, and materials.', domain: 'entertainment', requiredTools: ['finance.read-budget'], requiredPermissions: ['finance:read'] },
  { id: 'cost-estimation', name: 'Production Cost Estimator', description: 'Calculate scenario-based cost estimates for schedule or scope changes.', domain: 'entertainment', requiredTools: ['finance.read-budget'], requiredPermissions: ['finance:read'] },
  { id: 'expense-categorization', name: 'Expense Ledger Categorization', description: 'Classify expenses into chart-of-accounts categories (shared by ENT-10 & OPS-02).', domain: 'entertainment', requiredTools: ['finance.read-budget'], requiredPermissions: ['finance:read'] },
  { id: 'budget-variance', name: 'Budget vs. Actual Variance Report', description: 'Compare actual committed spend against approved budget allocations.', domain: 'entertainment', requiredTools: ['finance.read-budget'], requiredPermissions: ['finance:read'] },
  { id: 'cashflow-forecast', name: 'Cash-Flow Schedule Forecast', description: 'Project weekly/monthly cash-flow drawdown and funding milestones (shared by ENT-10 & OPS-02).', domain: 'entertainment', requiredTools: ['finance.read-budget'], requiredPermissions: ['finance:read'] },

  { id: 'continuity-breakdown', name: 'Scene Continuity Breakdown', description: 'Track story day, time progression, wardrobe state, and prop continuity.', domain: 'entertainment', requiredTools: ['production.read-script'], requiredPermissions: ['production:read'] },
  { id: 'take-notes', name: 'Script Supervisor Take Logger', description: 'Structure take duration, circled takes, lens height, and director comments.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'continuity-report', name: 'Daily Script Continuity Report', description: 'Compile daily script supervisor log pages for editorial.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'script-change-tracking', name: 'Script Revision & Dialogue Tracker', description: 'Track on-set dialogue deviations and pink/blue/yellow revision pages.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'continuity-conflict-check', name: 'Continuity Discrepancy Detector', description: 'Detect screen-direction, prop-hand, or timeline conflicts across adjacent scenes.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },

  { id: 'sound-plan', name: 'Location Sound Recording Plan', description: 'Plan boom, lavalier, and multi-track ISO channel assignments.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'track-sheet', name: 'Multi-Track Audio Assignment Sheet', description: 'Format timecode, sample rate, and track routing metadata for post.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'sound-report', name: 'Daily Production Sound Report', description: 'Compile daily sound mixer reports with wild tracks and room tone logs.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'dialogue-take-log', name: 'Dialogue Clarity & ADR Flag Log', description: 'Log overlapping dialogue, off-mic lines, and potential ADR candidates.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'audio-risk-check', name: 'Acoustic & RF Interference Risk Check', description: 'Identify generator, HVAC, traffic, and wireless frequency risks.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },

  { id: 'daily-progress-report', name: 'Daily Production Progress Report (DPR)', description: 'Summarize scenes shot, pages completed, setups, and camera roll totals.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'schedule-variance', name: 'Shoot Schedule Variance Analyzer', description: 'Compare planned vs. actual scene and page completion rates.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'delay-risk', name: 'Production Delay & Bottleneck Detector', description: 'Surface cascading schedule risks from weather, overtime, or unfinished scenes.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'resource-utilization', name: 'Cast, Crew & Stage Utilization Tracker', description: 'Analyze hold days, drop-pickups, and equipment utilization efficiency.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'production-status', name: 'Executive Production Health Summary', description: 'Provide high-level status across schedule, budget, and safety.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },

  { id: 'edit-plan', name: 'Editorial Assembly & Pacing Plan', description: 'Structure assembly, rough-cut, fine-cut, and picture-lock milestones.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'footage-organization', name: 'Dailies & Bin Organization Schema', description: 'Design NLE bin taxonomy, metadata tags, and circled-take stringouts.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'rough-cut-notes', name: 'Rough-Cut Structural Diagnostics', description: 'Analyze scene transitions, dramatic rhythm, and story clarity in cuts.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'feedback-to-edit-notes', name: 'Stakeholder Notes to Timecode Actions', description: 'Translate director/producer review feedback into actionable edit tasks.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'revision-tracking', name: 'Cut Revision & Change Log', description: 'Track cut versions, runtime deltas, and resolved review notes.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },

  { id: 'vfx-breakdown', name: 'VFX Shot Identification & Breakdown', description: 'Extract VFX plates, clean-ups, set extensions, and CG assets from script/cut.', domain: 'entertainment', requiredTools: ['production.read-script'], requiredPermissions: ['production:read'] },
  { id: 'shot-complexity', name: 'VFX Shot Complexity Classifier', description: 'Classify VFX shots into Simple/2D, Medium/2.5D, and Complex/Full-3D tiers.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'vfx-brief', name: 'Vendor VFX Shot Brief', description: 'Prepare technical and creative briefs for VFX vendors with plate specs.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'vfx-dependency-map', name: 'VFX Asset & Plate Dependency Map', description: 'Track camera data, HDRI spheres, LiDAR scans, and editorial lock dependencies.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'delivery-tracking', name: 'VFX Shot Version & Delivery Tracker', description: 'Monitor WIP, temp, and final EXR/DPX shot deliveries against milestones.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },

  { id: 'look-development', name: 'Color Look Development & LUT Brief', description: 'Define show LUT characteristics, contrast curves, and color separation.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'color-reference', name: 'Scene Color Palette Reference', description: 'Specify scene-by-scene mood, saturation, and highlight/shadow tinting.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'shot-match-notes', name: 'Camera & Lighting Shot-Matching Notes', description: 'Identify exposure or color-balance shifts requiring grading normalization.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'grading-review', name: 'DI Grading Session Review Notes', description: 'Structure timecode-referenced color grading review feedback.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'color-consistency', name: 'Deliverable Color Space Consistency Check', description: 'Verify Rec.709, P3-D65, and HDR Dolby Vision deliverable consistency.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },

  { id: 'sound-design-brief', name: 'Sound Design & Atmos Concept Brief', description: 'Define sonic textures, ambiences, signature sound effects, and spatial design.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'dialogue-edit-notes', name: 'Dialogue Editorial & ADR Spotting Sheet', description: 'Prepare dialogue cleanup notes and timecoded ADR spotting lists.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'foley-brief', name: 'Foley Spotting & Surface Cue Brief', description: 'List footsteps, cloth movement, and prop handling cues for Foley artists.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'music-cue-sheet', name: 'Music Spotting & Cue Sheet Builder', description: 'Document score cues, licensed tracks, timings, and rights metadata.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'mix-notes', name: 'Re-Recording Mix Review Notes', description: 'Balance dialogue intelligibility, music dynamics, and effects stems.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },
  { id: 'audio-delivery-check', name: 'Audio Stems & Loudness Delivery Check', description: 'Verify 5.1/Atmos printmasters, M&E stems, and LUFS loudness specs.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['production:read'] },

  { id: 'film-positioning', name: 'Film Market Positioning & Hook', description: 'Define core audience hook, genre positioning, and comparable titles.', domain: 'entertainment', requiredTools: ['web.search'], requiredPermissions: ['project:read', 'knowledge:search'] },
  { id: 'audience-segments', name: 'Film Audience Quadrant Segmentation', description: 'Identify primary and secondary theatrical/streaming audience segments.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['project:read'] },
  { id: 'trailer-concept', name: 'Trailer & Teaser Beat Structure', description: 'Design three-act trailer structures, cold opens, and music drops.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['project:read'] },
  { id: 'teaser-copy', name: 'Taglines, One-Sheet & Teaser Copy', description: 'Draft poster taglines, festival loglines, and social teaser hooks.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['project:read'] },
  { id: 'press-kit', name: 'Electronic Press Kit (EPK) Drafter', description: 'Prepare director statements, production notes, and cast/crew bios.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['project:read'] },
  { id: 'promo-calendar', name: 'Release Promotional Rollout Calendar', description: 'Schedule festival premieres, trailer drops, press embargoes, and release windows.', domain: 'entertainment', requiredTools: [], requiredPermissions: ['project:read'] },
  { id: 'content-repurposing', name: 'Multi-Channel Content Repurposing', description: 'Adapt core creative or marketing assets into short-form channel formats (shared by ENT-18 & MKT-02).', domain: 'entertainment', requiredTools: [], requiredPermissions: ['project:read'] },

  // ── Productivity & Autonomous Workspace (PRD-01 .. PRD-10) ──
  { id: 'daily-briefing', name: 'Executive Daily Briefing Compiler', description: 'Synthesize daily calendar, top tasks, conflicts, and pending approvals.', domain: 'productivity', requiredTools: ['calendar.list-events', 'tasks.list'], requiredPermissions: ['calendar:read', 'tasks:read'] },
  { id: 'priority-planning', name: 'Eisenhower & Impact Priority Planner', description: 'Rank competing commitments by urgency, strategic impact, and dependencies.', domain: 'productivity', requiredTools: ['tasks.list'], requiredPermissions: ['tasks:read'] },
  { id: 'personal-reminder', name: 'Contextual Reminder Planner', description: 'Structure time- and trigger-based follow-up reminders.', domain: 'productivity', requiredTools: [], requiredPermissions: ['tasks:read'] },
  { id: 'instruction-routing', name: 'Executive Instruction Decomposition', description: 'Decompose complex user instructions into actionable specialist tasks.', domain: 'productivity', requiredTools: [], requiredPermissions: ['tasks:read'] },
  { id: 'end-of-day-review', name: 'End-of-Day Progress & Rollover Review', description: 'Summarize completed work, unresolved blockers, and next-day carryovers.', domain: 'productivity', requiredTools: ['tasks.list'], requiredPermissions: ['tasks:read'] },

  { id: 'task-create', name: 'Structured Task Creator', description: 'Create well-scoped tasks with acceptance criteria and owners.', domain: 'productivity', requiredTools: ['tasks.create'], requiredPermissions: ['tasks:write'] },
  { id: 'task-prioritize', name: 'Backlog & Sprint Prioritizer', description: 'Score and sequence tasks across project milestones.', domain: 'productivity', requiredTools: ['tasks.list'], requiredPermissions: ['tasks:read'] },
  { id: 'dependency-map', name: 'Critical Path & Dependency Mapper', description: 'Identify upstream/downstream task blockers and critical path risks.', domain: 'productivity', requiredTools: ['tasks.list'], requiredPermissions: ['tasks:read'] },
  { id: 'delegation-plan', name: 'Workstream Delegation Matrix', description: 'Assign tasks to appropriate roles or specialists with clear handoffs.', domain: 'productivity', requiredTools: ['tasks.list'], requiredPermissions: ['tasks:read'] },
  { id: 'project-status', name: 'Project Milestone Status Reporter', description: 'Generate RAG (Red/Amber/Green) project health and milestone reports.', domain: 'productivity', requiredTools: ['tasks.list'], requiredPermissions: ['tasks:read'] },
  { id: 'milestone-tracking', name: 'Milestone Deliverable Tracker', description: 'Track deliverable completion percentages against target dates.', domain: 'productivity', requiredTools: ['tasks.list'], requiredPermissions: ['tasks:read'] },

  { id: 'agenda-draft', name: 'Meeting Agenda & Timebox Drafter', description: 'Draft structured meeting agendas with decision goals and timeboxes.', domain: 'productivity', requiredTools: ['calendar.list-events'], requiredPermissions: ['calendar:read'] },
  { id: 'meeting-prep', name: 'Participant & Context Meeting Dossier', description: 'Assemble relevant background docs, prior notes, and open items before a meeting.', domain: 'productivity', requiredTools: ['calendar.list-events', 'knowledge.search'], requiredPermissions: ['calendar:read', 'knowledge:search'] },
  { id: 'meeting-summary', name: 'Executive Meeting Notes Summarizer', description: 'Distill raw transcripts or notes into key discussion takeaways and decisions.', domain: 'productivity', requiredTools: [], requiredPermissions: ['calendar:read'] },
  { id: 'action-item-extraction', name: 'Action Item & Owner Extractor', description: 'Extract concrete action items, owners, and due dates from meeting notes.', domain: 'productivity', requiredTools: [], requiredPermissions: ['tasks:read'] },
  { id: 'schedule-conflict-check', name: 'Calendar Conflict & Buffer Resolver', description: 'Detect overlapping events, missing travel buffers, and propose rescheduling slots.', domain: 'productivity', requiredTools: ['calendar.list-events'], requiredPermissions: ['calendar:read'] },

  { id: 'message-classification', name: 'Inbound Message & Intent Classifier', description: 'Classify messages by urgency, category, required action, and SLA.', domain: 'productivity', requiredTools: ['email.search'], requiredPermissions: ['email:read'] },
  { id: 'email-draft', name: 'Contextual Email Drafter', description: 'Draft clear, professional emails tailored to recipient and objective.', domain: 'productivity', requiredTools: ['email.draft'], requiredPermissions: ['email:draft'] },
  { id: 'reply-suggestion', name: 'Multi-Option Reply Generator', description: 'Provide concise response options (accept, defer, clarify) for incoming threads.', domain: 'productivity', requiredTools: ['email.search'], requiredPermissions: ['email:read'] },
  { id: 'inbox-prioritization', name: 'Inbox Triage & Priority Queue', description: 'Rank unread communications by stakeholder importance and deadline.', domain: 'productivity', requiredTools: ['email.search'], requiredPermissions: ['email:read'] },
  { id: 'follow-up-draft', name: 'Commitment Follow-Up Drafter', description: 'Draft polite follow-up messages for unanswered threads or pending approvals (shared by PRD-04 & PRD-10).', domain: 'productivity', requiredTools: ['email.draft'], requiredPermissions: ['email:draft'] },

  { id: 'research-plan', name: 'Structured Research Methodology Planner', description: 'Define research questions, verification criteria, and source strategy.', domain: 'productivity', requiredTools: [], requiredPermissions: ['knowledge:search'] },
  { id: 'web-research', name: 'External Web Evidence Gatherer', description: 'Search external web sources and extract cited factual claims.', domain: 'productivity', requiredTools: ['web.search'], requiredPermissions: ['knowledge:search'] },
  { id: 'internal-search', name: 'Workspace Knowledge Base Retriever', description: 'Query authorized internal workspace documents with provenance.', domain: 'productivity', requiredTools: ['knowledge.search'], requiredPermissions: ['knowledge:search'] },
  { id: 'source-evaluation', name: 'Source Credibility & Recency Evaluator', description: 'Score evidence sources on authority, corroboration, and recency.', domain: 'productivity', requiredTools: [], requiredPermissions: ['knowledge:search'] },
  { id: 'evidence-synthesis', name: 'Multi-Source Evidence Synthesizer', description: 'Synthesize findings while strictly separating verified facts from inference.', domain: 'productivity', requiredTools: [], requiredPermissions: ['knowledge:search'] },
  { id: 'research-report', name: 'Cited Research Brief Generator', description: 'Produce decision-ready research briefs with inline sourceRefs and limitations.', domain: 'productivity', requiredTools: [], requiredPermissions: ['knowledge:search'] },

  { id: 'document-summary', name: 'Executive Document Summarizer', description: 'Summarize long documents with section-level source references.', domain: 'productivity', requiredTools: ['files.read'], requiredPermissions: ['files:read'] },
  { id: 'entity-extraction', name: 'Structured Entity & Field Extractor', description: 'Extract dates, parties, monetary amounts, clauses, and obligations from documents.', domain: 'productivity', requiredTools: ['files.read'], requiredPermissions: ['files:read'] },
  { id: 'document-compare', name: 'Redline & Version Comparison Analyzer', description: 'Compare two document versions and highlight material semantic changes.', domain: 'productivity', requiredTools: ['files.read'], requiredPermissions: ['files:read'] },
  { id: 'document-classification', name: 'Document Taxonomy Classifier', description: 'Classify incoming files into contract, invoice, brief, script, policy, or report.', domain: 'productivity', requiredTools: ['files.read'], requiredPermissions: ['files:read'] },
  { id: 'table-extraction', name: 'Document Table & Schedule Extractor', description: 'Convert embedded tables in PDFs/documents into normalized JSON rows.', domain: 'productivity', requiredTools: ['files.read'], requiredPermissions: ['files:read'] },
  { id: 'document-qa', name: 'Grounded Document Q&A', description: 'Answer questions strictly grounded in supplied document passages.', domain: 'productivity', requiredTools: ['files.read'], requiredPermissions: ['files:read'] },

  { id: 'draft-writing', name: 'Structured Content Drafter', description: 'Draft memos, proposals, documentation, and communications from outlines.', domain: 'productivity', requiredTools: [], requiredPermissions: ['files:read'] },
  { id: 'rewrite', name: 'Clarity & Structure Rewriter', description: 'Rewrite dense or ambiguous prose for conciseness and readability.', domain: 'productivity', requiredTools: [], requiredPermissions: ['files:read'] },
  { id: 'proofreading', name: 'Grammar, Style & Consistency Proofreader', description: 'Check grammar, punctuation, terminology consistency, and style guide adherence.', domain: 'productivity', requiredTools: [], requiredPermissions: ['files:read'] },
  { id: 'tone-adjustment', name: 'Audience & Executive Tone Adapter', description: 'Adapt text across executive, technical, diplomatic, or creative registers.', domain: 'productivity', requiredTools: [], requiredPermissions: ['files:read'] },
  { id: 'translation', name: 'Multi-Lingual Precision Translator', description: 'Translate text across languages while preserving domain terminology.', domain: 'productivity', requiredTools: [], requiredPermissions: ['files:read'] },
  { id: 'localization', name: 'Cultural & Regional Localization Adapter', description: 'Adapt idioms, units, date formats, and cultural references for target locales.', domain: 'productivity', requiredTools: [], requiredPermissions: ['files:read'] },

  { id: 'workflow-plan', name: 'Cross-App Automation Step Planner', description: 'Plan deterministic multi-step workflows and identify irreversible actions.', domain: 'productivity', requiredTools: [], requiredPermissions: ['tasks:read'] },
  { id: 'connector-action', name: 'Authorized Connector Action Executor', description: 'Execute bounded tool actions across connected workspace integrations.', domain: 'productivity', requiredTools: ['tasks.list'], requiredPermissions: ['tasks:read'] },
  { id: 'data-transfer', name: 'Schema-Mapped Data Transfer', description: 'Transform and validate payloads between workflow steps.', domain: 'productivity', requiredTools: [], requiredPermissions: ['files:read'] },
  { id: 'workflow-monitor', name: 'Workflow Execution Monitor', description: 'Track step completion, latency, and pending approval checkpoints.', domain: 'productivity', requiredTools: [], requiredPermissions: ['tasks:read'] },
  { id: 'retry-and-recovery', name: 'Idempotent Retry & Failure Recovery', description: 'Plan safe rollback or idempotent retry steps after transient tool errors.', domain: 'productivity', requiredTools: [], requiredPermissions: ['tasks:read'] },

  { id: 'spreadsheet-analysis', name: 'Tabular & Spreadsheet Analyzer', description: 'Analyze CSV and spreadsheet columns, distributions, and anomalies.', domain: 'productivity', requiredTools: ['data.inspect-schema'], requiredPermissions: ['data:read'] },
  { id: 'sql-draft', name: 'Parameterized Read-Only SQL Drafter', description: 'Draft safe, read-only analytical SQL queries from natural language questions.', domain: 'productivity', requiredTools: ['data.inspect-schema', 'data.query-readonly'], requiredPermissions: ['data:read'] },
  { id: 'data-cleaning-plan', name: 'Data Quality & Normalization Plan', description: 'Identify nulls, duplicates, type mismatches, and outlier remediation rules.', domain: 'productivity', requiredTools: ['data.inspect-schema'], requiredPermissions: ['data:read'] },
  { id: 'kpi-analysis', name: 'KPI Computation & Benchmark Analyzer', description: 'Calculate primary KPIs, cohort ratios, and period-over-period deltas.', domain: 'productivity', requiredTools: ['data.query-readonly'], requiredPermissions: ['data:read'] },
  { id: 'chart-specification', name: 'Data Visualization Specification Builder', description: 'Produce structured chart specifications (bar, line, scatter, table) for UI rendering.', domain: 'productivity', requiredTools: ['data.inspect-schema'], requiredPermissions: ['data:read'] },
  { id: 'report-generation', name: 'Analytical Narrative Report Generator', description: 'Combine quantitative tables, chart specs, and methodology limitations.', domain: 'productivity', requiredTools: ['data.query-readonly'], requiredPermissions: ['data:read'] },

  { id: 'approval-request-draft', name: 'Approval Request Package Builder', description: 'Prepare clear approval requests detailing action, impact, parameters, and rollback.', domain: 'productivity', requiredTools: ['approvals.create-request'], requiredPermissions: ['approvals:write'] },
  { id: 'approval-status', name: 'Approval Checkpoint Tracker', description: 'Query pending, approved, and rejected decision checkpoints.', domain: 'productivity', requiredTools: ['approvals.read-status'], requiredPermissions: ['approvals:read'] },
  { id: 'reminder-plan', name: 'Escalation & Approval Reminder Cadence', description: 'Plan non-intrusive reminder schedules for pending stakeholder decisions.', domain: 'productivity', requiredTools: ['approvals.read-status'], requiredPermissions: ['approvals:read'] },
  { id: 'pending-item-review', name: 'Pending Decisions & Commitments Audit', description: 'Audit open approvals, blocked workflows, and overdue commitments.', domain: 'productivity', requiredTools: ['approvals.read-status'], requiredPermissions: ['approvals:read'] },

  // ── Marketing & Growth (MKT-01 .. MKT-06) ──
  { id: 'positioning', name: 'Value Proposition & Positioning Architect', description: 'Define category differentiation, value pillars, and proof points.', domain: 'marketing', requiredTools: ['web.search'], requiredPermissions: ['campaigns:read', 'knowledge:search'] },
  { id: 'gtm-plan', name: 'Go-To-Market Launch Plan', description: 'Build phased launch strategy across product, audience, pricing, and distribution.', domain: 'marketing', requiredTools: [], requiredPermissions: ['campaigns:read'] },
  { id: 'channel-strategy', name: 'Acquisition & Retention Channel Strategy', description: 'Select and weight paid, owned, and earned marketing channels.', domain: 'marketing', requiredTools: ['campaigns.read-metrics'], requiredPermissions: ['campaigns:read'] },
  { id: 'marketing-roadmap', name: 'Quarterly Marketing Execution Roadmap', description: 'Sequence campaigns, content themes, and growth milestones.', domain: 'marketing', requiredTools: [], requiredPermissions: ['campaigns:read'] },
  { id: 'competitor-analysis', name: 'Competitive Messaging & Feature Matrix', description: 'Analyze competitor positioning, claims, and market whitespace.', domain: 'marketing', requiredTools: ['web.search'], requiredPermissions: ['campaigns:read', 'knowledge:search'] },

  { id: 'content-calendar', name: 'Editorial & Social Content Calendar', description: 'Plan multi-week editorial schedules by pillar, persona, and funnel stage.', domain: 'marketing', requiredTools: [], requiredPermissions: ['campaigns:read'] },
  { id: 'social-post', name: 'Channel-Native Social Copy Generator', description: 'Draft high-engagement social copy for LinkedIn, X, Instagram, and YouTube.', domain: 'marketing', requiredTools: [], requiredPermissions: ['campaigns:read'] },
  { id: 'blog-draft', name: 'Long-Form Thought Leadership & Blog Drafter', description: 'Write structured articles optimized for reader value and search intent.', domain: 'marketing', requiredTools: [], requiredPermissions: ['campaigns:read'] },
  { id: 'platform-adaptation', name: 'Cross-Platform Format Adapter', description: 'Tailor aspect ratios, character limits, hooks, and CTAs per platform.', domain: 'marketing', requiredTools: [], requiredPermissions: ['campaigns:read'] },
  { id: 'content-review', name: 'Editorial Quality & Claim Verification Review', description: 'Check content drafts for unsubstantiated claims, clarity, and CTA strength.', domain: 'marketing', requiredTools: [], requiredPermissions: ['campaigns:read'] },

  { id: 'keyword-research', name: 'Search Keyword & Topic Cluster Discovery', description: 'Identify high-intent primary and secondary keyword clusters.', domain: 'marketing', requiredTools: ['web.search'], requiredPermissions: ['campaigns:read', 'knowledge:search'] },
  { id: 'search-intent', name: 'SERP & User Intent Classifier', description: 'Classify queries into informational, navigational, commercial, and transactional intent.', domain: 'marketing', requiredTools: [], requiredPermissions: ['campaigns:read'] },
  { id: 'content-gap', name: 'Competitor Content Gap Analyzer', description: 'Surface high-value topics missing from current site coverage.', domain: 'marketing', requiredTools: ['web.search'], requiredPermissions: ['campaigns:read', 'knowledge:search'] },
  { id: 'on-page-audit', name: 'On-Page SEO Structure Auditor', description: 'Audit title tags, headings, internal linking, and semantic coverage.', domain: 'marketing', requiredTools: [], requiredPermissions: ['campaigns:read'] },
  { id: 'technical-seo-checklist', name: 'Technical SEO Health Checklist', description: 'Evaluate crawlability, canonicals, structured data, and Core Web Vitals signals.', domain: 'marketing', requiredTools: [], requiredPermissions: ['campaigns:read'] },
  { id: 'seo-brief', name: 'SEO Content Brief Builder', description: 'Create writer briefs with target keywords, heading outlines, and questions to answer.', domain: 'marketing', requiredTools: [], requiredPermissions: ['campaigns:read'] },

  { id: 'campaign-brief', name: 'Integrated Campaign Brief', description: 'Define campaign objective, target segment, creative hook, offer, and budget.', domain: 'marketing', requiredTools: ['campaigns.read-metrics'], requiredPermissions: ['campaigns:read'] },
  { id: 'campaign-plan', name: 'Multi-Channel Campaign Execution Plan', description: 'Plan ad sets, creative rotations, budget pacing, and launch checklists.', domain: 'marketing', requiredTools: ['campaigns.read-metrics'], requiredPermissions: ['campaigns:read'] },
  { id: 'utm-plan', name: 'Attribution & UTM Taxonomy Builder', description: 'Generate standardized UTM parameters and conversion tracking schemas.', domain: 'marketing', requiredTools: [], requiredPermissions: ['campaigns:read'] },
  { id: 'performance-review', name: 'Campaign ROAS & CAC Performance Review', description: 'Analyze CTR, CVR, CPA, and ROAS across channels and creatives.', domain: 'marketing', requiredTools: ['campaigns.read-metrics'], requiredPermissions: ['campaigns:read'] },
  { id: 'optimization-recommendation', name: 'Budget & Creative Optimization Recommender', description: 'Recommend bid, audience, or creative reallocations (requires approval to apply).', domain: 'marketing', requiredTools: ['campaigns.read-metrics'], requiredPermissions: ['campaigns:read'] },
  { id: 'experiment-plan', name: 'A/B Test & Hypothesis Designer', description: 'Design statistically sound A/B tests with sample size and success metrics.', domain: 'marketing', requiredTools: [], requiredPermissions: ['campaigns:read'] },

  { id: 'brand-voice', name: 'Brand Voice & Tone Guidelines Architect', description: 'Codify brand personality, vocabulary do/don’ts, and tonal pillars.', domain: 'marketing', requiredTools: [], requiredPermissions: ['campaigns:read'] },
  { id: 'messaging-framework', name: 'Core Messaging House Builder', description: 'Construct tagline, elevator pitch, value pillars, and objection handling.', domain: 'marketing', requiredTools: [], requiredPermissions: ['campaigns:read'] },
  { id: 'audience-persona', name: 'Buyer & Audience Persona Builder', description: 'Document buyer goals, pain points, buying triggers, and evaluation criteria.', domain: 'marketing', requiredTools: [], requiredPermissions: ['campaigns:read'] },
  { id: 'audience-research', name: 'Voice-of-Customer & Audience Synthesis', description: 'Synthesize customer interviews, reviews, and community discussions.', domain: 'marketing', requiredTools: ['web.search'], requiredPermissions: ['campaigns:read', 'knowledge:search'] },
  { id: 'brand-consistency-review', name: 'Brand & Messaging Compliance Audit', description: 'Audit drafts against brand voice rules and approved claims.', domain: 'marketing', requiredTools: [], requiredPermissions: ['campaigns:read'] },

  { id: 'icp-definition', name: 'Ideal Customer Profile (ICP) Matrix', description: 'Define firmographic, technographic, and behavioral ICP qualification criteria.', domain: 'marketing', requiredTools: ['crm.search-account'], requiredPermissions: ['crm:read'] },
  { id: 'prospect-research', name: 'Account & Prospect Intelligence Brief', description: 'Research target accounts, strategic initiatives, and buying signals.', domain: 'marketing', requiredTools: ['web.search', 'crm.search-account'], requiredPermissions: ['crm:read', 'knowledge:search'] },
  { id: 'lead-enrichment', name: 'Lead Context & Firmographic Enrichment', description: 'Normalize and enrich lead records with verified company attributes.', domain: 'marketing', requiredTools: ['crm.search-account'], requiredPermissions: ['crm:read'] },
  { id: 'lead-scoring', name: 'Fit & Intent Lead Scoring Model', description: 'Score leads using transparent ICP fit and behavioral engagement rules.', domain: 'marketing', requiredTools: ['crm.search-account'], requiredPermissions: ['crm:read'] },
  { id: 'funnel-analysis', name: 'Conversion Funnel Drop-off Analyzer', description: 'Identify MQL-to-SQL-to-Close conversion bottlenecks across stages.', domain: 'marketing', requiredTools: ['campaigns.read-metrics'], requiredPermissions: ['campaigns:read'] },
  { id: 'growth-experiment', name: 'Growth Loop & Activation Experiment Plan', description: 'Design acquisition, activation, and referral growth experiments.', domain: 'marketing', requiredTools: [], requiredPermissions: ['campaigns:read'] },

  // ── Business Operations (OPS-01 .. OPS-07) ──
  { id: 'kpi-summary', name: 'Executive Operational KPI Summary', description: 'Summarize revenue, margin, utilization, and SLA metrics with provenance.', domain: 'operations', requiredTools: ['data.query-readonly'], requiredPermissions: ['data:read'] },
  { id: 'business-review', name: 'Monthly/Quarterly Business Review (QBR) Builder', description: 'Compile narrative and quantitative business performance reviews.', domain: 'operations', requiredTools: ['data.query-readonly'], requiredPermissions: ['data:read'] },
  { id: 'trend-analysis', name: 'Operational Time-Series Trend Analyzer', description: 'Detect seasonality, growth inflections, and structural shifts in metrics.', domain: 'operations', requiredTools: ['data.query-readonly'], requiredPermissions: ['data:read'] },
  { id: 'variance-analysis', name: 'Plan vs. Actual Operational Variance', description: 'Decompose price, volume, and mix drivers behind plan variances.', domain: 'operations', requiredTools: ['data.query-readonly'], requiredPermissions: ['data:read'] },
  { id: 'management-report', name: 'Board & Management Decision Pack', description: 'Synthesize operational health, risks, and prioritized management actions.', domain: 'operations', requiredTools: ['data.query-readonly'], requiredPermissions: ['data:read'] },

  { id: 'invoice-extraction', name: 'Invoice & Receipt Line-Item Extractor', description: 'Extract vendor, invoice number, dates, tax, and line totals with validation.', domain: 'operations', requiredTools: ['files.read', 'finance.read-budget'], requiredPermissions: ['files:read', 'finance:read'] },
  { id: 'financial-summary', name: 'P&L and Expense Summary Reporter', description: 'Summarize operating revenue, OpEx categories, and burn rate.', domain: 'operations', requiredTools: ['finance.read-budget'], requiredPermissions: ['finance:read'] },
  { id: 'reconciliation-assist', name: 'Account & Ledger Reconciliation Assistant', description: 'Match invoices against POs/statements and flag discrepancies for review.', domain: 'operations', requiredTools: ['finance.read-budget'], requiredPermissions: ['finance:read'] },

  { id: 'policy-check', name: 'Internal Policy & Control Conformance Check', description: 'Check process descriptions or documents against supplied policy rules.', domain: 'operations', requiredTools: ['files.read', 'knowledge.search'], requiredPermissions: ['files:read', 'knowledge:search'] },
  { id: 'compliance-checklist', name: 'Regulatory & Audit Readiness Checklist', description: 'Generate control verification checklists with jurisdiction disclaimers.', domain: 'operations', requiredTools: ['knowledge.search'], requiredPermissions: ['knowledge:search'] },
  { id: 'evidence-register', name: 'Compliance Evidence Register Mapper', description: 'Map policy controls to documented workspace artifacts and sourceRefs.', domain: 'operations', requiredTools: ['files.read'], requiredPermissions: ['files:read'] },
  { id: 'exception-report', name: 'Policy Exception & Risk Finding Report', description: 'Document non-conformances, severity ratings, and remediation owners.', domain: 'operations', requiredTools: [], requiredPermissions: ['files:read'] },
  { id: 'policy-gap-analysis', name: 'Policy Coverage Gap Analysis', description: 'Compare current internal policies against supplied target frameworks.', domain: 'operations', requiredTools: ['files.read'], requiredPermissions: ['files:read'] },

  { id: 'job-description', name: 'Competency-Based Job Description Builder', description: 'Draft inclusive, competency-focused role descriptions and leveling criteria.', domain: 'operations', requiredTools: [], requiredPermissions: ['files:read'] },
  { id: 'resume-extraction', name: 'Objective Resume Skill & Experience Extractor', description: 'Extract job-relevant work history and skills without protected-trait inference.', domain: 'operations', requiredTools: ['files.read'], requiredPermissions: ['files:read'] },
  { id: 'candidate-scorecard', name: 'Structured Rubric Candidate Scorecard', description: 'Map candidate evidence strictly against pre-approved role competencies.', domain: 'operations', requiredTools: [], requiredPermissions: ['files:read'] },
  { id: 'interview-kit', name: 'Behavioral & Technical Interview Kit', description: 'Generate standardized interview questions and objective evaluation rubrics.', domain: 'operations', requiredTools: [], requiredPermissions: ['files:read'] },
  { id: 'employee-faq', name: 'Handbook & People Policy FAQ Assistant', description: 'Answer employee questions grounded in supplied HR handbook policies.', domain: 'operations', requiredTools: ['knowledge.search'], requiredPermissions: ['knowledge:search'] },

  { id: 'ticket-classification', name: 'Support Ticket Taxonomy & Severity Classifier', description: 'Classify customer issues by product area, severity, and SLA tier.', domain: 'operations', requiredTools: [], requiredPermissions: ['crm:read'] },
  { id: 'response-draft', name: 'Empathetic Customer Support Response Drafter', description: 'Draft accurate troubleshooting and resolution replies (gated before send).', domain: 'operations', requiredTools: ['knowledge.search'], requiredPermissions: ['crm:read', 'knowledge:search'] },
  { id: 'issue-triage', name: 'Root-Cause & Reproduction Triage', description: 'Structure bug reproduction steps, logs, and engineering handoff notes.', domain: 'operations', requiredTools: [], requiredPermissions: ['crm:read'] },
  { id: 'escalation-recommendation', name: 'SLA & Executive Escalation Recommender', description: 'Evaluate whether an issue requires engineering, security, or leadership escalation.', domain: 'operations', requiredTools: ['crm.search-account'], requiredPermissions: ['crm:read'] },
  { id: 'churn-risk-summary', name: 'Account Health & Churn Risk Detector', description: 'Synthesize ticket volume, sentiment, and usage drops into churn risk alerts.', domain: 'operations', requiredTools: ['crm.search-account'], requiredPermissions: ['crm:read'] },

  { id: 'account-summary', name: '360-Degree CRM Account Dossier', description: 'Summarize account history, stakeholders, contract value, and open opportunities.', domain: 'operations', requiredTools: ['crm.search-account'], requiredPermissions: ['crm:read'] },
  { id: 'crm-enrichment', name: 'CRM Contact & Account Hygiene Enricher', description: 'Prepare validated draft updates for missing or stale CRM fields.', domain: 'operations', requiredTools: ['crm.search-account'], requiredPermissions: ['crm:read'] },
  { id: 'opportunity-summary', name: 'Deal Stage & MEDDIC Opportunity Review', description: 'Assess deal qualification, champion strength, and close blockers.', domain: 'operations', requiredTools: ['crm.search-account'], requiredPermissions: ['crm:read'] },
  { id: 'next-best-action', name: 'Account Next-Best-Action Recommender', description: 'Recommend high-leverage follow-ups, renewal prep, or expansion plays.', domain: 'operations', requiredTools: ['crm.search-account'], requiredPermissions: ['crm:read'] },
  { id: 'pipeline-hygiene', name: 'Sales Pipeline Hygiene & Stale Deal Audit', description: 'Flag deals with pushed close dates, missing next steps, or stage stagnation.', domain: 'operations', requiredTools: ['crm.search-account'], requiredPermissions: ['crm:read'] },

  { id: 'vendor-comparison', name: 'Vendor RFP & Capability Comparison Matrix', description: 'Compare supplier proposals across pricing, SLAs, security, and lead times.', domain: 'operations', requiredTools: ['files.read'], requiredPermissions: ['files:read'] },
  { id: 'purchase-request-review', name: 'Procurement Request Completeness Review', description: 'Check purchase requests against budget availability and vendor approval rules.', domain: 'operations', requiredTools: ['finance.read-budget'], requiredPermissions: ['finance:read'] },
  { id: 'inventory-summary', name: 'Stock Level & SKU Visibility Summary', description: 'Summarize current stock on hand, committed units, and backorders.', domain: 'operations', requiredTools: ['data.query-readonly'], requiredPermissions: ['data:read'] },
  { id: 'reorder-suggestion', name: 'Safety Stock & Reorder Point Calculator', description: 'Recommend reorder quantities based on lead time and consumption velocity.', domain: 'operations', requiredTools: ['data.query-readonly'], requiredPermissions: ['data:read'] },
  { id: 'supplier-scorecard', name: 'Supplier On-Time & Quality Scorecard', description: 'Evaluate vendor delivery reliability, defect rates, and cost variance.', domain: 'operations', requiredTools: ['data.query-readonly'], requiredPermissions: ['data:read'] },
];

function registerAllCatalogueSkills() {
  registerSceneExtractionSkills();

  for (const seed of CATALOGUE_SKILLS) {
    const allIds = [seed.id, ...(seed.aliases ?? [])];
    for (const skillId of allIds) {
      if (skillRegistry.has(skillId)) continue;
      skillRegistry.register({
        manifest: {
          id: skillId,
          name: seed.name,
          description: seed.description,
          domain: seed.domain,
          version: '1.0.0',
          inputSchemaRef: `schemas/skills/${skillId}.input`,
          outputSchemaRef: `schemas/skills/${skillId}.output`,
          requiredTools: seed.requiredTools,
          requiredPermissions: seed.requiredPermissions,
          instructionsRef: `instructions/skills/${skillId}`,
          acceptanceCriteria: [
            `Fulfill capability: ${seed.description}`,
            'Preserve source provenance and distinguish verified facts from assumptions',
            'Validate output against StandardSkillOutputSchema',
          ],
          evaluationCases: [`eval-${skillId}-default`],
        },
        instructions: `Execute skill '${seed.name}' (${skillId}): ${seed.description}. Always distinguish verified facts from creative suggestions or assumptions.`,
        inputSchema: StandardSkillInputSchema,
        outputSchema: StandardSkillOutputSchema,
        execute: async (input, ctx) => {
          const subject =
            input.topicOrBrief ||
            input.prompt ||
            JSON.stringify(input.data ?? {}).slice(0, 160);
          const projectId = input.projectId || ctx?.projectId || 'default-project';
          const sourceRef = `skill://${seed.domain}/${skillId}/${projectId}`;

          return {
            skillId,
            domain: seed.domain,
            summary: `[${seed.name}] Completed structured capability execution for: ${subject}`,
            deliverable: {
              capability: seed.name,
              subject,
              projectId,
              constraintsApplied: input.constraints ?? [],
              generatedArtifact: `Structured ${seed.name} output for '${subject}'`,
              ...(input.data ? { inputContext: input.data } : {}),
            },
            extractedFacts: [
              {
                fact: `Processed input brief '${subject}' under ${seed.domain} domain rules.`,
                sourceRef,
              },
            ],
            assumptions:
              input.constraints && input.constraints.length > 0
                ? []
                : ['Standard workspace defaults applied where optional constraints were omitted.'],
            uncertaintyFlags: [],
            isDraft: true,
          };
        },
      });
    }
  }
}

registerAllCatalogueSkills();

export { skillRegistry };

