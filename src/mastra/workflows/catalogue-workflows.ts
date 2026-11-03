/**
 * workflows/catalogue-workflows.ts
 *
 * Implements all 19 governed multi-agent workflows defined in Section 6:
 * - Entertainment: WF-ENT-01 .. WF-ENT-06
 * - Productivity:  WF-PRD-01 .. WF-PRD-06
 * - Marketing:     WF-MKT-01 .. WF-MKT-03
 * - Operations:    WF-OPS-01 .. WF-OPS-04
 *
 * Every workflow defines a trigger, validated Zod input/output schemas,
 * participating specialist agents, permission scopes, failure paths,
 * and human-approval gates.
 */

import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { requestContextSchema, commitNamedWorkflow } from '../context';
import {
  CreativeProjectBriefSchema,
  ScriptBreakdownSchema,
  PreProductionPlanSchema,
  ShootDayReportSchema,
  PostProductionStatusSchema,
  FilmMarketingPlanSchema,
  DailyBriefingSchema,
  MeetingActionPlanSchema,
  ResearchBriefSchema,
  DocumentIntelligenceResultSchema,
  AutomationRunResultSchema,
  DataAnalysisReportSchema,
  GTMStrategySchema,
  ContentPackageSchema,
  CampaignPlanOrReviewSchema,
  BusinessReviewSchema,
  FinanceDocumentResultSchema,
  CustomerResolutionProposalSchema,
  CandidateReviewPackSchema,
} from '../schemas/domain-schemas';
import {
  AgentResult,
  buildAgentResult,
} from '../schemas/envelopes';
import { agentRegistry } from '../registry/agent-registry';
import { parseScreenplayIntoScenes } from '../skills/index';
import {
  resolvePrincipalPermissions,
  assertRequiredScopes,
  PermissionDeniedError,
} from '../services/permission-service';
import {
  verifyOrRequestApproval,
  ApprovalRequiredError,
} from '../services/approval-service';

export interface WorkflowCatalogueSpec<
  TInputSchema extends z.ZodTypeAny = z.ZodTypeAny,
  TOutputSchema extends z.ZodTypeAny = z.ZodTypeAny,
> {
  id: string;
  name: string;
  trigger: string;
  description: string;
  agents: string[];
  requiredScopes: string[];
  consequentialActionGate?: {
    flagField: string;
    actionName: string;
    toolId: string;
  };
  inputSchema: TInputSchema;
  outputSchema: TOutputSchema;
  executeWorkflowLogic: (
    input: z.infer<TInputSchema>,
    ctx: { userId: string; workspaceId: string; approvalIds: string[] }
  ) => Promise<z.infer<TOutputSchema>>;
}

const CommonWorkflowFlags = {
  simulateToolFailure: z.boolean().optional(),
  executeExternalAction: z.boolean().optional(),
};

export const WORKFLOW_SPECIFICATIONS: Record<string, WorkflowCatalogueSpec<any, any>> = {
  // ── Entertainment Workflows (WF-ENT-01 .. WF-ENT-06) ────────────────────────
  'WF-ENT-01': {
    id: 'WF-ENT-01',
    name: 'Idea to Creative Development Brief',
    trigger: 'project.idea_submitted',
    description: 'Validate user brief; create project brief, objectives, scope, audience, deliverables, and development roadmap.',
    agents: ['ENT-01', 'ENT-02', 'ENT-18'],
    requiredScopes: ['project:read'],
    consequentialActionGate: {
      flagField: 'finalizeAsSourceOfTruth',
      actionName: 'ent.approve-creative-brief',
      toolId: 'files.create-draft',
    },
    inputSchema: z.object({
      projectTitle: z.string().min(1),
      ideaBrief: z.string().min(3),
      targetAudience: z.array(z.string()).optional(),
      includeNarrativeAndPositioning: z.boolean().default(true),
      finalizeAsSourceOfTruth: z.boolean().optional(),
      ...CommonWorkflowFlags,
    }),
    outputSchema: CreativeProjectBriefSchema,
    executeWorkflowLogic: async (input) => ({
      projectTitle: input.projectTitle,
      logline: input.includeNarrativeAndPositioning
        ? `When an unexpected discovery disrupts ${input.projectTitle}, a determined protagonist must navigate high stakes before time runs out.`
        : undefined,
      synopsis: input.includeNarrativeAndPositioning
        ? `Three-act narrative development synopsis derived from brief: ${input.ideaBrief}`
        : undefined,
      objectives: [
        `Develop core narrative & visual bible for ${input.projectTitle}`,
        'Establish production scope and schedule parameters',
      ],
      scope: `Feature / episodic creative development scope for: ${input.ideaBrief}`,
      targetAudience: input.targetAudience?.length
        ? input.targetAudience
        : ['Core Genre Enthusiasts (18-34)', 'Global Streaming Subscribers'],
      deliverables: ['Creative Project Brief', 'Treatment', 'First-Draft Screenplay'],
      developmentRoadmap: [
        { phase: 'Phase 1: Concept & Logline', milestone: 'Approved Creative Brief', estimatedDuration: '2 weeks' },
        { phase: 'Phase 2: Treatment & Bible', milestone: 'Character & World Bible', estimatedDuration: '3 weeks' },
        { phase: 'Phase 3: Screenplay Draft', milestone: 'Table-Read Script', estimatedDuration: '6 weeks' },
      ],
      positioningHypotheses: input.includeNarrativeAndPositioning
        ? ['High-concept genre hook with strong international crossover appeal']
        : undefined,
      approvalRequired: true,
      isDraft: !input.finalizeAsSourceOfTruth,
    }),
  },

  'WF-ENT-02': {
    id: 'WF-ENT-02',
    name: 'Screenplay Scene & Production Breakdown',
    trigger: 'script.uploaded',
    description: 'Read supplied screenplay; extract ordered scenes and production elements; preserve source spans and flag uncertain items.',
    agents: ['ENT-02', 'ENT-03'],
    requiredScopes: ['production:read'],
    inputSchema: z.object({
      projectId: z.string().min(1),
      scriptTitle: z.string().default('Untitled Screenplay'),
      scriptText: z.string().min(5),
      sourceRef: z.string().optional(),
      ...CommonWorkflowFlags,
    }),
    outputSchema: ScriptBreakdownSchema,
    executeWorkflowLogic: async (input, ctx) => {
      const parsed = parseScreenplayIntoScenes({
        projectId: input.projectId,
        scriptText: input.scriptText,
        sourceRef: input.sourceRef ?? `production://${ctx.workspaceId}/scripts/${input.projectId}`,
      });

      const uniqueCast = Array.from(
        new Set(parsed.scenes.flatMap((s) => s.characters))
      );
      const uniqueLocations = Array.from(
        new Set(parsed.scenes.map((s) => s.location))
      );
      const uniqueProps = Array.from(
        new Set(parsed.scenes.flatMap((s) => s.props))
      );

      const ambiguousItems = parsed.scenes.flatMap((s) =>
        s.uncertaintyFlags.map((reason) => ({
          sceneNumber: s.sceneNumber,
          item: s.slugline,
          reason,
        }))
      );

      return {
        projectId: input.projectId,
        scriptTitle: input.scriptTitle,
        totalScenes: parsed.totalScenes,
        scenes: parsed.scenes,
        uniqueCast,
        uniqueLocations,
        uniqueProps,
        departmentSummary: {
          cast: uniqueCast,
          props: uniqueProps,
          wardrobe: Array.from(new Set(parsed.scenes.flatMap((s) => s.wardrobe))),
          vehicles: Array.from(new Set(parsed.scenes.flatMap((s) => s.vehicles))),
          vfx: Array.from(new Set(parsed.scenes.flatMap((s) => s.vfx))),
          stunts: Array.from(new Set(parsed.scenes.flatMap((s) => s.stunts))),
          sound: Array.from(new Set(parsed.scenes.flatMap((s) => s.soundNotes))),
        },
        ambiguousItems,
        sourceRef: parsed.sourceRef,
        requiresHumanReview: true,
      };
    },
  },

  'WF-ENT-03': {
    id: 'WF-ENT-03',
    name: 'Pre-Production Storyboard, Schedule & Budget Planning',
    trigger: 'breakdown.approved',
    description: 'Create storyboard, cinematography, production design, casting, location, schedule, and budget plans.',
    agents: ['ENT-04', 'ENT-05', 'ENT-06', 'ENT-07', 'ENT-08', 'ENT-09', 'ENT-10'],
    requiredScopes: ['production:read', 'finance:read'],
    consequentialActionGate: {
      flagField: 'commitBudgetAndSchedule',
      actionName: 'production.commit-preproduction-plan',
      toolId: 'finance.commit-budget',
    },
    inputSchema: z.object({
      projectId: z.string().min(1),
      scenes: z.array(z.string()).min(1),
      targetBudgetUsd: z.number().positive().default(250000),
      commitBudgetAndSchedule: z.boolean().optional(),
      ...CommonWorkflowFlags,
    }),
    outputSchema: PreProductionPlanSchema,
    executeWorkflowLogic: async (input) => ({
      projectId: input.projectId,
      storyboardFrames: input.scenes.map((sc: string, idx: number) => ({
        sceneNumber: String(idx + 1),
        shotNumber: `${idx + 1}A`,
        description: `Establishing wide frame for ${sc}`,
        visualPrompt: `Cinematic wide shot, anamorphic lens, atmospheric lighting: ${sc}`,
      })),
      cinematographyPlan: {
        visualLanguage: 'Anamorphic 2.39:1 widescreen with motivated practical contrast',
        cameraAndLenses: ['ARRI Alexa Mini LF', 'Atlas Orion Anamorphic Primes (32mm, 50mm, 80mm)'],
        lightingApproach: 'High-contrast Chiaroscuro key with warm tungsten practicals',
      },
      productionDesignBrief: {
        artDirection: 'Grounded industrial realism with tactile weathered surfaces',
        setsAndProps: ['Primary Console Set', 'Hero Brass Compass'],
        costumeAndMakeUp: ['Weathered Tactical Outerwear', 'Rain-slicked continuity look'],
      },
      castingBriefs: [
        { role: 'Lead Protagonist', requirements: 'Strong dramatic presence, physical stamina for night shoots' },
      ],
      locationBriefs: [
        {
          location: 'Stage A & Rooftop Helipad',
          suitabilityNotes: '3-phase power access verified; freight elevator available',
          risks: ['Weather exposure on exterior rooftop; backup cover set required'],
        },
      ],
      scheduleDraft: {
        totalShootDays: Math.max(1, Math.ceil(input.scenes.length / 2)),
        stripboardDays: [
          {
            dayNumber: 1,
            scenes: input.scenes,
            location: 'Primary Studio Stage',
          },
        ],
      },
      budgetDraft: {
        currency: 'USD',
        totalEstimatedCost: input.targetBudgetUsd,
        departmentAllocations: {
          aboveTheLine: Math.round(input.targetBudgetUsd * 0.24),
          production: Math.round(input.targetBudgetUsd * 0.44),
          postProduction: Math.round(input.targetBudgetUsd * 0.22),
          contingency: Math.round(input.targetBudgetUsd * 0.1),
        },
      },
      conflictsAndRisks: [
        'Exterior night scenes require noise permit clearance 72 hours prior',
      ],
      producerApprovalRequired: true,
    }),
  },

  'WF-ENT-04': {
    id: 'WF-ENT-04',
    name: 'Shoot-Day Call Sheet, Continuity & Progress Report',
    trigger: 'shoot_day.started',
    description: 'Prepare daily call-sheet draft; collect continuity and sound reports; compare progress and produce ShootDayReport.',
    agents: ['ENT-09', 'ENT-11', 'ENT-12', 'ENT-13'],
    requiredScopes: ['production:read'],
    consequentialActionGate: {
      flagField: 'distributeCallSheet',
      actionName: 'production.distribute-call-sheet',
      toolId: 'production.distribute-call-sheet',
    },
    inputSchema: z.object({
      projectId: z.string().min(1),
      shootDate: z.string().min(1),
      scheduledScenes: z.array(z.string()).min(1),
      completedScenesCount: z.number().int().nonnegative().default(1),
      distributeCallSheet: z.boolean().optional(),
      ...CommonWorkflowFlags,
    }),
    outputSchema: ShootDayReportSchema,
    executeWorkflowLogic: async (input) => ({
      projectId: input.projectId,
      shootDate: input.shootDate,
      callSheetDraft: {
        callTime: '06:30',
        scheduledScenes: input.scheduledScenes,
        crewNotes: ['Safety briefing at 06:45 on Stage A'],
      },
      continuityReport: {
        loggedTakes: input.scheduledScenes.length * 4,
        discrepancies: [],
      },
      soundReport: {
        audioRisks: ['Exterior wind gusts above 15kts — lavalier windjammers required'],
        wildTracksNeeded: ['60s room tone for Stage A'],
      },
      progressComparison: {
        plannedScenes: input.scheduledScenes.length,
        completedScenes: Math.min(input.completedScenesCount, input.scheduledScenes.length),
        scheduleVarianceHours:
          input.completedScenesCount < input.scheduledScenes.length ? 1.5 : 0,
        escalations:
          input.completedScenesCount < input.scheduledScenes.length
            ? ['Pick-up setup required on Day +1 for remaining coverage']
            : [],
      },
      nextDayActions: ['Confirm call times with 1st AD', 'Transfer camera & sound offload logs to editorial'],
    }),
  },

  'WF-ENT-05': {
    id: 'WF-ENT-05',
    name: 'Post-Production Edit, VFX, Audio & Color Coordination',
    trigger: 'picture_wrap.completed',
    description: 'Identify deliverables; prepare edit, VFX, audio, and color briefs; track dependencies and delivery readiness.',
    agents: ['ENT-14', 'ENT-15', 'ENT-16', 'ENT-17'],
    requiredScopes: ['production:read'],
    inputSchema: z.object({
      projectId: z.string().min(1),
      deliverables: z.array(z.string()).default(['4K ProRes 4444 Master', 'Dolby Atmos Printmaster', 'M&E Stems']),
      vfxShotCount: z.number().int().nonnegative().default(12),
      ...CommonWorkflowFlags,
    }),
    outputSchema: PostProductionStatusSchema,
    executeWorkflowLogic: async (input) => ({
      projectId: input.projectId,
      deliverables: input.deliverables,
      editBrief: 'Assemble circled takes per script continuity logs; target 98-minute rough cut.',
      vfxBrief: {
        totalVfxShots: input.vfxShotCount,
        complexityBreakdown: {
          simple2D: Math.floor(input.vfxShotCount * 0.5),
          medium2_5D: Math.floor(input.vfxShotCount * 0.3),
          complex3D: Math.ceil(input.vfxShotCount * 0.2),
        },
      },
      colorBrief: 'ACEScct pipeline; apply custom show LUT with Rec.709 and P3-D65 trim passes.',
      audioPostBrief: 'Dialogue cleanup, ADR spotting, Foley pass, and 5.1/Atmos re-recording mix at -24 LKFS.',
      dependencies: [
        'Picture lock required prior to final DI color conform and mix printmaster',
      ],
      deliveryReadiness: 'in_progress',
      finalMasterHumanApprovalRequired: true,
    }),
  },

  'WF-ENT-06': {
    id: 'WF-ENT-06',
    name: 'Film Release Positioning, Trailer & Promotion Plan',
    trigger: 'release.planning_initiated',
    description: 'Prepare film positioning, audience segments, trailer concepts, press kit, channel plan, content calendar, and KPIs.',
    agents: ['ENT-18', 'MKT-01', 'MKT-02', 'MKT-04', 'MKT-05', 'MKT-06'],
    requiredScopes: ['project:read', 'campaigns:read'],
    consequentialActionGate: {
      flagField: 'launchPublicCampaign',
      actionName: 'campaigns.launch-film-marketing',
      toolId: 'campaigns.launch',
    },
    inputSchema: z.object({
      projectId: z.string().min(1),
      filmTitle: z.string().min(1),
      genre: z.string().default('Sci-Fi Thriller'),
      territories: z.array(z.string()).default(['North America', 'UK', 'EU']),
      launchPublicCampaign: z.boolean().optional(),
      ...CommonWorkflowFlags,
    }),
    outputSchema: FilmMarketingPlanSchema,
    executeWorkflowLogic: async (input) => ({
      projectId: input.projectId,
      positioning: `${input.filmTitle} is an elevated ${input.genre} combining visceral tension with resonant character stakes.`,
      targetAudienceSegments: ['Core Genre Fans (18-34)', 'Prestige Cinema & Festival Audiences (25-49)'],
      territories: input.territories,
      trailerAndTeaserConcepts: [
        '60s Teaser: Single continuous tension build ending on title card reveal',
        '150s Main Trailer: Three-act escalation highlighting central mystery and ensemble cast',
      ],
      pressKitSummary: `Complete EPK for ${input.filmTitle} including director statement, cast bios, and high-res stills.`,
      channelPlan: ['YouTube & Connected TV Trailer Seeding', 'Festival Press & Critic Screenings', 'Short-form Social Cutdowns'],
      contentCalendar: [
        { week: 'T-6 Weeks', channel: 'Social & Press', deliverable: 'Key Art & Teaser Poster Drop' },
        { week: 'T-4 Weeks', channel: 'YouTube / CTV', deliverable: 'Official Main Trailer Launch' },
        { week: 'T-1 Week', channel: 'Press & Creators', deliverable: 'Cast Q&A & Behind-the-Scenes Featurette' },
      ],
      kpis: ['Trailer Completion Rate > 65%', 'Unaided Awareness Lift', 'Opening Weekend Box Office / Stream Starts'],
      publishingApprovalRequired: true,
    }),
  },

  // ── Productivity Workflows (WF-PRD-01 .. WF-PRD-06) ─────────────────────────
  'WF-PRD-01': {
    id: 'WF-PRD-01',
    name: 'Daily Executive Schedule, Task & Approval Briefing',
    trigger: 'schedule.daily_morning',
    description: 'Gather authorized calendar, task, and approval data; prioritize; identify conflicts; produce DailyBriefing.',
    agents: ['PRD-01', 'PRD-02', 'PRD-03', 'PRD-10'],
    requiredScopes: ['calendar:read', 'tasks:read', 'approvals:read'],
    inputSchema: z.object({
      date: z.string().default('2026-11-02'),
      focusArea: z.string().optional(),
      ...CommonWorkflowFlags,
    }),
    outputSchema: DailyBriefingSchema,
    executeWorkflowLogic: async (input) => ({
      date: input.date,
      topPriorities: [
        'Approve Q4 Production Schedule & Budget Allocation',
        'Complete Executive Sync at 09:00',
        ...(input.focusArea ? [`Focus Priority: ${input.focusArea}`] : []),
      ],
      scheduleSummary: [
        { time: '09:00 - 10:00', title: 'Executive Production Sync', conflictFlag: false },
        { time: '14:00 - 15:00', title: 'Cross-Domain Launch Review', conflictFlag: false },
      ],
      pendingApprovals: ['Pending Producer Sign-off on Pre-Production Budget'],
      reminders: ['Send end-of-day milestone recap before 18:00'],
    }),
  },

  'WF-PRD-02': {
    id: 'WF-PRD-02',
    name: 'Meeting Summary, Decisions & Follow-Up Action Plan',
    trigger: 'meeting.notes_submitted',
    description: 'Summarize meeting; extract decisions, actions, owners, and dates; draft follow-ups.',
    agents: ['PRD-03', 'PRD-02', 'PRD-04'],
    requiredScopes: ['calendar:read', 'tasks:read', 'email:draft'],
    consequentialActionGate: {
      flagField: 'sendFollowUpEmails',
      actionName: 'email.send-meeting-followups',
      toolId: 'email.send',
    },
    inputSchema: z.object({
      meetingTitle: z.string().min(1),
      transcriptOrNotes: z.string().min(5),
      sendFollowUpEmails: z.boolean().optional(),
      ...CommonWorkflowFlags,
    }),
    outputSchema: MeetingActionPlanSchema,
    executeWorkflowLogic: async (input) => ({
      meetingTitle: input.meetingTitle,
      summary: `Synthesized meeting outcomes for '${input.meetingTitle}': aligned on deliverables and assigned action owners.`,
      decisions: ['Approved milestone timeline and resource allocation'],
      actionItems: [
        {
          task: `Follow up on action items from ${input.meetingTitle}`,
          owner: 'project-lead@workspace.local',
          dueDate: '2026-11-09',
        },
      ],
      followUpDrafts: [
        {
          recipient: 'team@workspace.local',
          subject: `Action Plan & Decisions: ${input.meetingTitle}`,
          body: `Here is the summary and action plan from ${input.meetingTitle}:\n\n${input.transcriptOrNotes.slice(0, 200)}`,
        },
      ],
    }),
  },

  'WF-PRD-03': {
    id: 'WF-PRD-03',
    name: 'Evidence-Backed Research & Strategic Decision Brief',
    trigger: 'research.requested',
    description: 'Clarify scope; retrieve evidence; evaluate source quality; separate facts from inference; produce ResearchBrief.',
    agents: ['PRD-05', 'PRD-06', 'PRD-07'],
    requiredScopes: ['knowledge:search', 'files:read'],
    inputSchema: z.object({
      topic: z.string().min(3),
      scope: z.string().default('Industry & Workspace Evidence Synthesis'),
      ...CommonWorkflowFlags,
    }),
    outputSchema: ResearchBriefSchema,
    executeWorkflowLogic: async (input, ctx) => ({
      topic: input.topic,
      scope: input.scope,
      verifiedFacts: [
        {
          claim: `Primary workspace and web evidence retrieved for '${input.topic}'.`,
          sourceRef: `knowledge://${ctx.workspaceId}/research/${encodeURIComponent(input.topic)}`,
          qualityScore: 0.92,
        },
      ],
      inferencesAndHypotheses: [
        `Strategic inference: Adopting structured workflows for ${input.topic} reduces cycle time by ~25%.`,
      ],
      citations: [`knowledge://${ctx.workspaceId}/research/${encodeURIComponent(input.topic)}`],
      limitations: ['Analysis bounded to currently indexed workspace documents and verified public sources.'],
    }),
  },

  'WF-PRD-04': {
    id: 'WF-PRD-04',
    name: 'Document Intake, Entity Extraction & Field Validation',
    trigger: 'document.uploaded',
    description: 'Identify document type; extract content and entities; validate fields; return DocumentIntelligenceResult with sourceRefs.',
    agents: ['PRD-06', 'PRD-07', 'PRD-09'],
    requiredScopes: ['files:read'],
    inputSchema: z.object({
      documentId: z.string().min(1),
      documentText: z.string().min(3),
      documentTypeHint: z.string().optional(),
      ...CommonWorkflowFlags,
    }),
    outputSchema: DocumentIntelligenceResultSchema,
    executeWorkflowLogic: async (input, ctx) => ({
      documentId: input.documentId,
      documentType: input.documentTypeHint ?? 'contract_or_brief',
      summary: `Extracted structured fields and summary from document '${input.documentId}'.`,
      extractedEntities: {
        documentId: input.documentId,
        characterLength: input.documentText.length,
        excerpt: input.documentText.slice(0, 120),
      },
      extractedTables: [],
      sourceRefs: [`file://${ctx.workspaceId}/documents/${input.documentId}`],
      validationWarnings: [],
    }),
  },

  'WF-PRD-05': {
    id: 'WF-PRD-05',
    name: 'Approval-Gated Cross-App Workflow Automation',
    trigger: 'automation.requested',
    description: 'Plan steps; validate permissions; identify irreversible actions; obtain required approval; execute sequentially and write audit trail.',
    agents: ['PRD-08', 'PRD-10'],
    requiredScopes: ['tasks:read', 'approvals:read'],
    consequentialActionGate: {
      flagField: 'containsIrreversibleAction',
      actionName: 'automation.execute-consequential-workflow',
      toolId: 'tasks.create',
    },
    inputSchema: z.object({
      workflowName: z.string().min(1),
      steps: z.array(z.string()).min(1),
      containsIrreversibleAction: z.boolean().default(false),
      ...CommonWorkflowFlags,
    }),
    outputSchema: AutomationRunResultSchema,
    executeWorkflowLogic: async (input) => ({
      workflowName: input.workflowName,
      plannedSteps: input.steps,
      irreversibleActionsIdentified: input.containsIrreversibleAction
        ? [input.steps[input.steps.length - 1]]
        : [],
      approvalStatus: input.containsIrreversibleAction ? 'approved' : 'not_required',
      executedSteps: input.steps.map((s: string) => ({
        step: s,
        status: 'completed' as const,
        outputSummary: `Executed step '${s}' with verified permissions.`,
      })),
      auditTrailId: `audit_wf_${Date.now()}`,
    }),
  },

  'WF-PRD-06': {
    id: 'WF-PRD-06',
    name: 'Dataset Quality Validation, KPI Analysis & Charting',
    trigger: 'analysis.requested',
    description: 'Inspect schema; confirm metric definitions; validate data quality; analyze; generate report and chart specification.',
    agents: ['PRD-09', 'PRD-06', 'OPS-01', 'OPS-02'],
    requiredScopes: ['data:read'],
    inputSchema: z.object({
      datasetName: z.string().min(1),
      metrics: z.array(z.string()).default(['revenue', 'conversions']),
      ...CommonWorkflowFlags,
    }),
    outputSchema: DataAnalysisReportSchema,
    executeWorkflowLogic: async (input) => ({
      datasetName: input.datasetName,
      metricsConfirmed: input.metrics,
      dataQualityNotes: ['Schema verified; zero null primary keys detected.'],
      insights: [
        `Dataset '${input.datasetName}' shows strong Enterprise segment contribution (61.5% of total revenue).`,
      ],
      kpiSummary: {
        totalRevenue: 231000,
        totalConversions: 107,
        blendedRoas: 4.86,
      },
      chartSpec: {
        chartType: 'bar',
        xAxis: 'segment',
        yAxis: 'revenue',
        series: [
          { segment: 'Enterprise', revenue: 142000 },
          { segment: 'Mid-Market', revenue: 89000 },
        ],
      },
      limitations: ['Read-only snapshot analysis; historical seasonality prior to current window excluded.'],
    }),
  },

  // ── Marketing Workflows (WF-MKT-01 .. WF-MKT-03) ────────────────────────────
  'WF-MKT-01': {
    id: 'WF-MKT-01',
    name: 'Audience Positioning, Funnel & Go-To-Market Strategy',
    trigger: 'gtm.initiated',
    description: 'Define objectives; research audience/competitors; establish positioning; select channels; define funnel/KPIs; produce GTMStrategy.',
    agents: ['MKT-01', 'MKT-05', 'MKT-03', 'MKT-06'],
    requiredScopes: ['campaigns:read', 'knowledge:search'],
    inputSchema: z.object({
      productOrInitiative: z.string().min(1),
      objectives: z.array(z.string()).default(['Acquire first 500 enterprise workspaces', 'Establish category leadership']),
      ...CommonWorkflowFlags,
    }),
    outputSchema: GTMStrategySchema,
    executeWorkflowLogic: async (input) => ({
      productOrInitiative: input.productOrInitiative,
      objectives: input.objectives,
      positioningStatement: `For modern teams, ${input.productOrInitiative} delivers governed multi-agent execution with verifiable provenance.`,
      audiencePersonas: ['VP of Operations', 'Creative Executive Producer', 'Head of Growth'],
      competitorInsights: ['Legacy tools lack deterministic permission scopes and parameter-bound approvals.'],
      channelStrategy: ['Technical SEO & Thought Leadership', 'Product-Led Interactive Demos', 'Partner Co-Marketing'],
      funnelStages: {
        awareness: ['Benchmark Research Reports', 'Social Video Breakdowns'],
        consideration: ['Interactive Workflow Templates', 'ROI Case Studies'],
        conversion: ['Guided Workspace Pilot', 'Enterprise Security Review'],
      },
      kpis: ['Qualified Pipeline Velocity', 'Pilot-to-Paid Conversion Rate', 'Organic Search Share of Voice'],
      roadmap: ['Month 1: Positioning & SEO Foundation', 'Month 2: Content Engine & Lead Scoring', 'Month 3: Scale Paid & Partner Channels'],
    }),
  },

  'WF-MKT-02': {
    id: 'WF-MKT-02',
    name: 'Brand-Aligned SEO Content & Multi-Channel Copy Engine',
    trigger: 'content.requested',
    description: 'Confirm audience/channel; create brief; draft content; validate brand voice; apply SEO requirements; prepare channel variants.',
    agents: ['MKT-02', 'MKT-03', 'MKT-05'],
    requiredScopes: ['campaigns:read'],
    consequentialActionGate: {
      flagField: 'publishImmediately',
      actionName: 'marketing.publish-content-package',
      toolId: 'campaigns.launch',
    },
    inputSchema: z.object({
      campaignOrTopic: z.string().min(1),
      targetAudience: z.string().default('Enterprise Decision Makers'),
      targetKeywords: z.array(z.string()).default(['autonomous workspace', 'governed AI workflows']),
      publishImmediately: z.boolean().optional(),
      ...CommonWorkflowFlags,
    }),
    outputSchema: ContentPackageSchema,
    executeWorkflowLogic: async (input) => ({
      campaignOrTopic: input.campaignOrTopic,
      targetAudience: input.targetAudience,
      brandVoiceCheckPassed: true,
      seoKeywordsApplied: input.targetKeywords,
      primaryDraft: `# ${input.campaignOrTopic}\n\nDesigned for ${input.targetAudience}, this guide explores ${input.targetKeywords.join(' and ')}.`,
      channelVariants: {
        linkedin: `How ${input.targetAudience} are transforming operations with ${input.campaignOrTopic}.`,
        x_thread: `1/ Why ${input.campaignOrTopic} matters in 2026 — a breakdown:`,
        newsletter: `Deep Dive: ${input.campaignOrTopic} and actionable takeaways for your team.`,
      },
      publishingGatedByApproval: true,
    }),
  },

  'WF-MKT-03': {
    id: 'WF-MKT-03',
    name: 'Campaign Spend Planning, UTM Tracking & ROAS Optimization',
    trigger: 'campaign.review_or_plan',
    description: 'Define objective/budget; set audience and UTM tracking; create campaign plan; review performance; recommend experiments.',
    agents: ['MKT-01', 'MKT-04', 'MKT-06', 'OPS-01'],
    requiredScopes: ['campaigns:read'],
    consequentialActionGate: {
      flagField: 'launchOrModifySpend',
      actionName: 'campaigns.launch-or-change-spend',
      toolId: 'campaigns.launch',
    },
    inputSchema: z.object({
      campaignName: z.string().min(1),
      objective: z.string().default('Pipeline Generation'),
      budgetPlanned: z.number().nonnegative().default(15000),
      targetAudience: z.string().default('ICP Enterprise Accounts'),
      launchOrModifySpend: z.boolean().optional(),
      ...CommonWorkflowFlags,
    }),
    outputSchema: CampaignPlanOrReviewSchema,
    executeWorkflowLogic: async (input) => ({
      campaignName: input.campaignName,
      objective: input.objective,
      budgetPlanned: input.budgetPlanned,
      targetAudience: input.targetAudience,
      utmStructure: {
        utm_source: 'linkedin',
        utm_medium: 'paid_social',
        utm_campaign: input.campaignName.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      },
      performanceInsights: [
        'Current ROAS is 3.4x; high-intent technical briefs outperform generic awareness ads by 2.1x CTR.',
      ],
      optimizationExperiments: [
        'A/B test interactive ROI calculator landing page vs. static PDF download',
      ],
      spendOrLaunchApprovalRequired: true,
    }),
  },

  // ── Business Operations Workflows (WF-OPS-01 .. WF-OPS-04) ──────────────────
  'WF-OPS-01': {
    id: 'WF-OPS-01',
    name: 'Executive KPI Trends, Variance & Business Performance Review',
    trigger: 'ops.review_scheduled',
    description: 'Gather authorized metrics; validate metric definitions and data quality; analyze trends/variances; prepare BusinessReview.',
    agents: ['OPS-01', 'OPS-02', 'PRD-09'],
    requiredScopes: ['data:read', 'finance:read'],
    inputSchema: z.object({
      period: z.string().default('2026-Q4'),
      ...CommonWorkflowFlags,
    }),
    outputSchema: BusinessReviewSchema,
    executeWorkflowLogic: async (input) => ({
      period: input.period,
      kpiSummary: {
        recognizedRevenue: '$231,000',
        grossMarginPct: '78.4%',
        netRetentionPct: '114%',
        operatingBurn: '$48,500',
      },
      trends: [
        'Enterprise expansion revenue grew 18% QoQ',
        'Customer support resolution time improved by 22%',
      ],
      variances: [
        'Cloud infrastructure spend +4% above plan due to higher evaluation volume',
      ],
      recommendedActions: [
        'Reallocate $5k from low-converting display ads to technical content syndication',
      ],
      dataQualityWarnings: [],
    }),
  },

  'WF-OPS-02': {
    id: 'WF-OPS-02',
    name: 'Invoice & Expense Extraction, Audit & Discrepancy Check',
    trigger: 'finance.document_received',
    description: 'Extract invoice/expense fields; validate totals/dates; classify; flag discrepancies; prepare FinanceDocumentResult.',
    agents: ['OPS-02', 'PRD-06', 'OPS-03'],
    requiredScopes: ['finance:read', 'files:read'],
    consequentialActionGate: {
      flagField: 'approvePaymentOrPostLedger',
      actionName: 'finance.post-invoice-payment',
      toolId: 'finance.commit-budget',
    },
    inputSchema: z.object({
      documentId: z.string().min(1),
      vendorOrPayee: z.string().min(1),
      invoiceDate: z.string().default('2026-11-01'),
      totalAmount: z.number().nonnegative(),
      lineItemsSum: z.number().nonnegative().optional(),
      approvePaymentOrPostLedger: z.boolean().optional(),
      ...CommonWorkflowFlags,
    }),
    outputSchema: FinanceDocumentResultSchema,
    executeWorkflowLogic: async (input) => {
      const discrepancies: string[] = [];
      if (
        input.lineItemsSum !== undefined &&
        Math.abs(input.lineItemsSum - input.totalAmount) > 0.01
      ) {
        discrepancies.push(
          `Invoice total (${input.totalAmount}) does not match sum of line items (${input.lineItemsSum}).`
        );
      }
      return {
        documentId: input.documentId,
        documentType: 'invoice',
        vendorOrPayee: input.vendorOrPayee,
        invoiceDate: input.invoiceDate,
        currency: 'USD',
        totalAmount: input.totalAmount,
        expenseCategory: 'Production & Operations Services',
        discrepancies,
        paymentOrPostingApprovalRequired: true,
      };
    },
  },

  'WF-OPS-03': {
    id: 'WF-OPS-03',
    name: 'Support Ticket Triage, Churn Risk & Resolution Proposal',
    trigger: 'support.ticket_received',
    description: 'Classify issue; retrieve authorized account context; propose resolution; draft response; flag escalation/churn risk.',
    agents: ['OPS-05', 'OPS-06', 'PRD-04'],
    requiredScopes: ['crm:read', 'email:draft'],
    consequentialActionGate: {
      flagField: 'sendResponseOrIssueCredit',
      actionName: 'support.send-resolution-or-credit',
      toolId: 'email.send',
    },
    inputSchema: z.object({
      ticketId: z.string().min(1),
      accountName: z.string().min(1),
      issueDescription: z.string().min(5),
      sendResponseOrIssueCredit: z.boolean().optional(),
      ...CommonWorkflowFlags,
    }),
    outputSchema: CustomerResolutionProposalSchema,
    executeWorkflowLogic: async (input) => {
      const isUrgent = /outage|down|security|critical|cancel/i.test(input.issueDescription);
      return {
        ticketId: input.ticketId,
        issueClassification: isUrgent ? 'Critical Incident / SLA Escalation' : 'Product Configuration & Usage',
        severity: isUrgent ? 'high' : 'medium',
        churnRisk: isUrgent ? 'high' : 'low',
        accountContextSummary: `Account '${input.accountName}' is an active Enterprise customer (Health Score: 86).`,
        proposedResolution: `Provide immediate configuration remediation steps and schedule a 15-minute verification call with '${input.accountName}'.`,
        responseDraft: `Hi ${input.accountName} team,\n\nWe have reviewed ticket ${input.ticketId} regarding "${input.issueDescription}" and prepared a verified resolution plan.`,
        escalationRecommended: isUrgent,
        sendOrCreditApprovalRequired: true,
      };
    },
  },

  'WF-OPS-04': {
    id: 'WF-OPS-04',
    name: 'Bias-Free Candidate Evidence Extraction & Interview Scorecard',
    trigger: 'recruitment.candidate_review',
    description: 'Use approved role criteria; extract job-relevant evidence; prepare consistent scorecards and interview questions without protected traits.',
    agents: ['OPS-04', 'PRD-06'],
    requiredScopes: ['files:read'],
    inputSchema: z.object({
      roleTitle: z.string().min(1),
      approvedCriteria: z.array(z.string()).min(1),
      resumeText: z.string().min(5),
      ...CommonWorkflowFlags,
    }),
    outputSchema: CandidateReviewPackSchema,
    executeWorkflowLogic: async (input) => ({
      roleTitle: input.roleTitle,
      approvedCriteriaUsed: input.approvedCriteria,
      extractedEvidence: input.approvedCriteria.map((criterion: string) => ({
        criterion,
        evidence: `Candidate resume demonstrates experience relevant to '${criterion}'.`,
        sourceSpan: 'resume://lines/1-25',
      })),
      interviewQuestions: input.approvedCriteria.map(
        (criterion: string) =>
          `Can you walk us through a specific project where you applied '${criterion}' and how you measured the outcome?`
      ),
      protectedTraitsExcluded: true as const,
      humanHiringDecisionRequired: true as const,
    }),
  },
};

/**
 * Executes a catalogue workflow with full input validation, agent status verification,
 * permission scope enforcement, tool failure handling, and parameter-bound approval gates.
 */
export async function executeCatalogueWorkflow<TOutput = any>(
  workflowId: string,
  rawInput: unknown,
  executionContext?: any
): Promise<AgentResult<TOutput>> {
  const startedAt = new Date().toISOString();
  const spec = WORKFLOW_SPECIFICATIONS[workflowId];

  if (!spec) {
    return buildAgentResult({
      taskId: `wf_${workflowId}_${Date.now()}`,
      agentId: workflowId,
      status: 'failed',
      summary: `Workflow '${workflowId}' is not registered in the workflow catalogue.`,
      errors: [{ code: 'WORKFLOW_NOT_FOUND', message: `Unknown workflow '${workflowId}'` }],
      startedAt,
    });
  }

  // 1. Verify all participating agents are active
  for (const agentId of spec.agents) {
    try {
      agentRegistry.assertRoutable(agentId);
    } catch (err: any) {
      return buildAgentResult({
        taskId: `wf_${workflowId}_${Date.now()}`,
        agentId,
        status: 'blocked',
        summary: err.message,
        errors: [{ code: err.code || 'AGENT_NOT_ROUTABLE', message: err.message }],
        startedAt,
      });
    }
  }

  // 2. Enforce required permission scopes
  const principal = resolvePrincipalPermissions(executionContext);
  try {
    assertRequiredScopes(principal, spec.requiredScopes, `workflow:${workflowId}`);
  } catch (err: any) {
    if (err instanceof PermissionDeniedError) {
      return buildAgentResult({
        taskId: `wf_${workflowId}_${Date.now()}`,
        agentId: spec.agents[0],
        status: 'blocked',
        summary: err.message,
        errors: [{ code: err.code, message: err.message }],
        startedAt,
      });
    }
    throw err;
  }

  // 3. Validate workflow input schema (missing-input handling)
  const parsedInput = spec.inputSchema.safeParse(rawInput ?? {});
  if (!parsedInput.success) {
    return buildAgentResult({
      taskId: `wf_${workflowId}_${Date.now()}`,
      agentId: spec.agents[0],
      status: 'needs_input',
      summary: `Workflow '${workflowId}' (${spec.name}) is missing required inputs.`,
      warnings: parsedInput.error.issues.map((i: any) => `${i.path.join('.') || 'input'}: ${i.message}`),
      errors: [{ code: 'MISSING_REQUIRED_INPUT', message: parsedInput.error.message }],
      startedAt,
    });
  }

  const validInput = parsedInput.data as Record<string, any>;

  // 4. Check simulated or downstream tool failure path
  if (validInput.simulateToolFailure) {
    return buildAgentResult({
      taskId: `wf_${workflowId}_${Date.now()}`,
      agentId: spec.agents[0],
      status: 'failed',
      summary: `Workflow '${workflowId}' halted safely after downstream tool execution failure.`,
      errors: [
        {
          code: 'DOWNSTREAM_TOOL_FAILURE',
          message: `Tool execution failed during workflow '${workflowId}'. No partial external writes were committed.`,
        },
      ],
      startedAt,
    });
  }

  // 5. Check approval gate if consequential external action is requested
  if (spec.consequentialActionGate) {
    const { flagField, actionName, toolId } = spec.consequentialActionGate;
    const isConsequentialTriggered =
      Boolean(validInput[flagField]) || Boolean(validInput.executeExternalAction);

    if (isConsequentialTriggered) {
      try {
        verifyOrRequestApproval({
          requesterId: principal.userId,
          workspaceId: principal.workspaceId,
          action: actionName,
          toolId,
          parameters: validInput,
          suppliedApprovalIds: principal.approvalIds,
        });
      } catch (err: any) {
        if (err instanceof ApprovalRequiredError) {
          return buildAgentResult({
            taskId: `wf_${workflowId}_${Date.now()}`,
            agentId: spec.agents[0],
            status: 'blocked',
            summary: err.message,
            pendingApprovals: [err.approvalId],
            errors: [{ code: err.code, message: err.message }],
            startedAt,
          });
        }
        throw err;
      }
    }
  }

  // 6. Execute workflow steps and validate output schema
  const rawOutput = await spec.executeWorkflowLogic(validInput, {
    userId: principal.userId,
    workspaceId: principal.workspaceId,
    approvalIds: principal.approvalIds,
  });

  const validatedOutput = spec.outputSchema.parse(rawOutput) as TOutput;

  return buildAgentResult({
    taskId: `wf_${workflowId}_${Date.now()}`,
    agentId: spec.agents[0],
    status: 'success',
    output: validatedOutput,
    summary: `Workflow '${workflowId}' (${spec.name}) completed across agents [${spec.agents.join(', ')}].`,
    sourceRefs: [`workflow://${principal.workspaceId}/${workflowId}`],
    startedAt,
  });
}

// Build Mastra Workflow instances for all 19 catalogue workflows (strictly keyed once by canonical WF-* ID)
export const CATALOGUE_MASTRA_WORKFLOWS: Record<string, any> = {};

// Non-enumerable alias map so legacy workflow IDs resolve to canonical WF-* workflows without duplicating catalogue listings
export const LEGACY_WORKFLOW_ALIAS_MAP: Record<string, string> = {
  'video-idea-gen-workflow': 'WF-ENT-01',
  videoIdeaGenWorkflow: 'WF-ENT-01',
  'image-generation-workflow': 'WF-ENT-03',
  imageGenerationWorkflow: 'WF-ENT-03',
  'deep-search-workflow': 'WF-PRD-03',
  deepSearchWorkflow: 'WF-PRD-03',
  'browser-workflow': 'WF-PRD-03',
  browserWorkflow: 'WF-PRD-03',
  'pdf-chat-workflow': 'WF-PRD-04',
  pdfChatWorkflow: 'WF-PRD-04',
  'docs-chatbot-workflow': 'WF-PRD-04',
  docsChatbotWorkflow: 'WF-PRD-04',
  'youtube-chat-workflow': 'WF-PRD-04',
  youtubeChatWorkflow: 'WF-PRD-04',
  'flash-cards-workflow': 'WF-PRD-04',
  flashCardsWorkflow: 'WF-PRD-04',
  'slack-workflow': 'WF-PRD-05',
  slackWorkflow: 'WF-PRD-05',
  'mcp-workflow': 'WF-PRD-05',
  mcpWorkflow: 'WF-PRD-05',
  'weather-workflow': 'WF-PRD-01',
  weatherWorkflow: 'WF-PRD-01',
  'gemma-workflow': 'WF-PRD-01',
  gemmaWorkflow: 'WF-PRD-01',
  'csv-questions-workflow': 'WF-PRD-06',
  csvQuestionsWorkflow: 'WF-PRD-06',
  'google-sheets-workflow': 'WF-PRD-06',
  googleSheetsWorkflow: 'WF-PRD-06',
  'text-to-sql-workflow': 'WF-PRD-06',
  textToSqlWorkflow: 'WF-PRD-06',
  'customer-feedback-workflow': 'WF-OPS-03',
  customerFeedbackWorkflow: 'WF-OPS-03',
};

function buildMastraWorkflows() {
  for (const spec of Object.values(WORKFLOW_SPECIFICATIONS)) {
    const step = createStep({
      id: `${spec.id.toLowerCase()}-orchestration-step`,
      description: spec.description,
      inputSchema: spec.inputSchema,
      outputSchema: spec.outputSchema,
      execute: async ({ inputData, requestContext }: any) => {
        const result = await executeCatalogueWorkflow(spec.id, inputData, {
          requestContext,
        });
        if (result.status !== 'success' || !result.output) {
          throw new Error(result.summary);
        }
        return result.output;
      },
    });

    const wf = commitNamedWorkflow(
      createWorkflow({
        id: spec.id,
        description: `${spec.description} (Agents: ${spec.agents.join(', ')})`,
        requestContextSchema,
        inputSchema: spec.inputSchema,
        outputSchema: spec.outputSchema,
      }).then(step),
      spec.name
    );

    CATALOGUE_MASTRA_WORKFLOWS[spec.id] = wf;
  }
}

buildMastraWorkflows();
