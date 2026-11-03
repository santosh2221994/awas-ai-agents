/**
 * schemas/domain-schemas.ts
 *
 * Central registry of validated Zod schemas for specialist agents,
 * reusable skills, and multi-agent workflows across all 5 domains.
 */

import { z } from 'zod';

// ── 1. Entertainment & Media Schemas ─────────────────────────────────────────

export const CreativeProjectBriefSchema = z.object({
  projectTitle: z.string().min(1),
  logline: z.string().optional(),
  synopsis: z.string().optional(),
  objectives: z.array(z.string()).min(1),
  scope: z.string().min(1),
  targetAudience: z.array(z.string()).min(1),
  deliverables: z.array(z.string()).min(1),
  developmentRoadmap: z.array(
    z.object({
      phase: z.string(),
      milestone: z.string(),
      estimatedDuration: z.string(),
    })
  ),
  positioningHypotheses: z.array(z.string()).optional(),
  approvalRequired: z.boolean().default(true),
  isDraft: z.boolean().default(true),
});

export type CreativeProjectBrief = z.infer<typeof CreativeProjectBriefSchema>;

export const ExtractedSceneSchema = z.object({
  sceneNumber: z.string(),
  slugline: z.string(),
  intExt: z.enum(['INT', 'EXT', 'INT/EXT', 'UNKNOWN']),
  location: z.string(),
  timeOfDay: z.string(),
  synopsis: z.string(),
  characters: z.array(z.string()),
  props: z.array(z.string()),
  wardrobe: z.array(z.string()),
  vehicles: z.array(z.string()),
  stunts: z.array(z.string()),
  vfx: z.array(z.string()),
  soundNotes: z.array(z.string()),
  sourceSpan: z.object({
    startLine: z.number().int().nonnegative(),
    endLine: z.number().int().nonnegative(),
    rawExcerpt: z.string().optional(),
  }),
  confidence: z.number().min(0).max(1),
  uncertaintyFlags: z.array(z.string()),
});

export type ExtractedScene = z.infer<typeof ExtractedSceneSchema>;

export const ScriptBreakdownSchema = z.object({
  projectId: z.string(),
  scriptTitle: z.string(),
  totalScenes: z.number().int().nonnegative(),
  scenes: z.array(ExtractedSceneSchema),
  uniqueCast: z.array(z.string()),
  uniqueLocations: z.array(z.string()),
  uniqueProps: z.array(z.string()),
  departmentSummary: z.record(z.string(), z.array(z.string())),
  ambiguousItems: z.array(
    z.object({
      sceneNumber: z.string(),
      item: z.string(),
      reason: z.string(),
    })
  ),
  sourceRef: z.string(),
  requiresHumanReview: z.boolean().default(true),
});

export type ScriptBreakdown = z.infer<typeof ScriptBreakdownSchema>;

export const PreProductionPlanSchema = z.object({
  projectId: z.string(),
  storyboardFrames: z.array(
    z.object({
      sceneNumber: z.string(),
      shotNumber: z.string(),
      description: z.string(),
      visualPrompt: z.string(),
    })
  ),
  cinematographyPlan: z.object({
    visualLanguage: z.string(),
    cameraAndLenses: z.array(z.string()),
    lightingApproach: z.string(),
  }),
  productionDesignBrief: z.object({
    artDirection: z.string(),
    setsAndProps: z.array(z.string()),
    costumeAndMakeUp: z.array(z.string()),
  }),
  castingBriefs: z.array(
    z.object({
      role: z.string(),
      requirements: z.string(),
    })
  ),
  locationBriefs: z.array(
    z.object({
      location: z.string(),
      suitabilityNotes: z.string(),
      risks: z.array(z.string()),
    })
  ),
  scheduleDraft: z.object({
    totalShootDays: z.number().int().positive(),
    stripboardDays: z.array(
      z.object({
        dayNumber: z.number().int().positive(),
        scenes: z.array(z.string()),
        location: z.string(),
      })
    ),
  }),
  budgetDraft: z.object({
    currency: z.string().default('USD'),
    totalEstimatedCost: z.number().nonnegative(),
    departmentAllocations: z.record(z.string(), z.number().nonnegative()),
  }),
  conflictsAndRisks: z.array(z.string()),
  producerApprovalRequired: z.boolean().default(true),
});

export type PreProductionPlan = z.infer<typeof PreProductionPlanSchema>;

export const ShootDayReportSchema = z.object({
  projectId: z.string(),
  shootDate: z.string(),
  callSheetDraft: z.object({
    callTime: z.string(),
    scheduledScenes: z.array(z.string()),
    crewNotes: z.array(z.string()),
  }),
  continuityReport: z.object({
    loggedTakes: z.number().int().nonnegative(),
    discrepancies: z.array(z.string()),
  }),
  soundReport: z.object({
    audioRisks: z.array(z.string()),
    wildTracksNeeded: z.array(z.string()),
  }),
  progressComparison: z.object({
    plannedScenes: z.number().int().nonnegative(),
    completedScenes: z.number().int().nonnegative(),
    scheduleVarianceHours: z.number(),
    escalations: z.array(z.string()),
  }),
  nextDayActions: z.array(z.string()),
});

export type ShootDayReport = z.infer<typeof ShootDayReportSchema>;

export const PostProductionStatusSchema = z.object({
  projectId: z.string(),
  deliverables: z.array(z.string()),
  editBrief: z.string(),
  vfxBrief: z.object({
    totalVfxShots: z.number().int().nonnegative(),
    complexityBreakdown: z.record(z.string(), z.number()),
  }),
  colorBrief: z.string(),
  audioPostBrief: z.string(),
  dependencies: z.array(z.string()),
  deliveryReadiness: z.enum(['not_started', 'in_progress', 'review_pending', 'ready_for_master_approval']),
  finalMasterHumanApprovalRequired: z.boolean().default(true),
});

export type PostProductionStatus = z.infer<typeof PostProductionStatusSchema>;

export const FilmMarketingPlanSchema = z.object({
  projectId: z.string(),
  positioning: z.string(),
  targetAudienceSegments: z.array(z.string()),
  territories: z.array(z.string()),
  trailerAndTeaserConcepts: z.array(z.string()),
  pressKitSummary: z.string(),
  channelPlan: z.array(z.string()),
  contentCalendar: z.array(
    z.object({
      week: z.string(),
      channel: z.string(),
      deliverable: z.string(),
    })
  ),
  kpis: z.array(z.string()),
  publishingApprovalRequired: z.boolean().default(true),
});

export type FilmMarketingPlan = z.infer<typeof FilmMarketingPlanSchema>;

// ── 2. Productivity & Workspace Schemas ──────────────────────────────────────

export const DailyBriefingSchema = z.object({
  date: z.string(),
  topPriorities: z.array(z.string()),
  scheduleSummary: z.array(
    z.object({
      time: z.string(),
      title: z.string(),
      conflictFlag: z.boolean().default(false),
    })
  ),
  pendingApprovals: z.array(z.string()),
  reminders: z.array(z.string()),
});

export type DailyBriefing = z.infer<typeof DailyBriefingSchema>;

export const MeetingActionPlanSchema = z.object({
  meetingTitle: z.string(),
  summary: z.string(),
  decisions: z.array(z.string()),
  actionItems: z.array(
    z.object({
      task: z.string(),
      owner: z.string(),
      dueDate: z.string().optional(),
    })
  ),
  followUpDrafts: z.array(
    z.object({
      recipient: z.string(),
      subject: z.string(),
      body: z.string(),
    })
  ),
});

export type MeetingActionPlan = z.infer<typeof MeetingActionPlanSchema>;

export const ResearchBriefSchema = z.object({
  topic: z.string(),
  scope: z.string(),
  verifiedFacts: z.array(
    z.object({
      claim: z.string(),
      sourceRef: z.string(),
      qualityScore: z.number().min(0).max(1),
    })
  ),
  inferencesAndHypotheses: z.array(z.string()),
  citations: z.array(z.string()),
  limitations: z.array(z.string()),
});

export type ResearchBrief = z.infer<typeof ResearchBriefSchema>;

export const DocumentIntelligenceResultSchema = z.object({
  documentId: z.string(),
  documentType: z.string(),
  summary: z.string(),
  extractedEntities: z.record(z.string(), z.any()),
  extractedTables: z.array(z.any()).optional(),
  sourceRefs: z.array(z.string()),
  validationWarnings: z.array(z.string()),
});

export type DocumentIntelligenceResult = z.infer<typeof DocumentIntelligenceResultSchema>;

export const AutomationRunResultSchema = z.object({
  workflowName: z.string(),
  plannedSteps: z.array(z.string()),
  irreversibleActionsIdentified: z.array(z.string()),
  approvalStatus: z.enum(['not_required', 'approved', 'pending_approval', 'rejected']),
  executedSteps: z.array(
    z.object({
      step: z.string(),
      status: z.enum(['completed', 'skipped', 'blocked', 'failed']),
      outputSummary: z.string(),
    })
  ),
  auditTrailId: z.string(),
});

export type AutomationRunResult = z.infer<typeof AutomationRunResultSchema>;

export const DataAnalysisReportSchema = z.object({
  datasetName: z.string(),
  metricsConfirmed: z.array(z.string()),
  dataQualityNotes: z.array(z.string()),
  insights: z.array(z.string()),
  kpiSummary: z.record(z.string(), z.union([z.number(), z.string()])),
  chartSpec: z.object({
    chartType: z.enum(['bar', 'line', 'pie', 'scatter', 'table']),
    xAxis: z.string(),
    yAxis: z.string(),
    series: z.array(z.any()),
  }),
  limitations: z.array(z.string()),
});

export type DataAnalysisReport = z.infer<typeof DataAnalysisReportSchema>;

// ── 3. Marketing & Growth Schemas ────────────────────────────────────────────

export const GTMStrategySchema = z.object({
  productOrInitiative: z.string(),
  objectives: z.array(z.string()),
  positioningStatement: z.string(),
  audiencePersonas: z.array(z.string()),
  competitorInsights: z.array(z.string()),
  channelStrategy: z.array(z.string()),
  funnelStages: z.record(z.string(), z.array(z.string())),
  kpis: z.array(z.string()),
  roadmap: z.array(z.string()),
});

export type GTMStrategy = z.infer<typeof GTMStrategySchema>;

export const ContentPackageSchema = z.object({
  campaignOrTopic: z.string(),
  targetAudience: z.string(),
  brandVoiceCheckPassed: z.boolean(),
  seoKeywordsApplied: z.array(z.string()),
  primaryDraft: z.string(),
  channelVariants: z.record(z.string(), z.string()),
  publishingGatedByApproval: z.boolean().default(true),
});

export type ContentPackage = z.infer<typeof ContentPackageSchema>;

export const CampaignPlanOrReviewSchema = z.object({
  campaignName: z.string(),
  objective: z.string(),
  budgetPlanned: z.number().nonnegative(),
  targetAudience: z.string(),
  utmStructure: z.record(z.string(), z.string()),
  performanceInsights: z.array(z.string()),
  optimizationExperiments: z.array(z.string()),
  spendOrLaunchApprovalRequired: z.boolean().default(true),
});

export type CampaignPlanOrReview = z.infer<typeof CampaignPlanOrReviewSchema>;

// ── 4. Business Operations Schemas ───────────────────────────────────────────

export const BusinessReviewSchema = z.object({
  period: z.string(),
  kpiSummary: z.record(z.string(), z.union([z.number(), z.string()])),
  trends: z.array(z.string()),
  variances: z.array(z.string()),
  recommendedActions: z.array(z.string()),
  dataQualityWarnings: z.array(z.string()),
});

export type BusinessReview = z.infer<typeof BusinessReviewSchema>;

export const FinanceDocumentResultSchema = z.object({
  documentId: z.string(),
  documentType: z.enum(['invoice', 'receipt', 'expense_report', 'statement']),
  vendorOrPayee: z.string(),
  invoiceDate: z.string(),
  currency: z.string().default('USD'),
  totalAmount: z.number().nonnegative(),
  expenseCategory: z.string(),
  discrepancies: z.array(z.string()),
  paymentOrPostingApprovalRequired: z.boolean().default(true),
});

export type FinanceDocumentResult = z.infer<typeof FinanceDocumentResultSchema>;

export const CustomerResolutionProposalSchema = z.object({
  ticketId: z.string(),
  issueClassification: z.string(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  churnRisk: z.enum(['low', 'moderate', 'high']),
  accountContextSummary: z.string(),
  proposedResolution: z.string(),
  responseDraft: z.string(),
  escalationRecommended: z.boolean(),
  sendOrCreditApprovalRequired: z.boolean().default(true),
});

export type CustomerResolutionProposal = z.infer<typeof CustomerResolutionProposalSchema>;

export const CandidateReviewPackSchema = z.object({
  roleTitle: z.string(),
  approvedCriteriaUsed: z.array(z.string()),
  extractedEvidence: z.array(
    z.object({
      criterion: z.string(),
      evidence: z.string(),
      sourceSpan: z.string().optional(),
    })
  ),
  interviewQuestions: z.array(z.string()),
  protectedTraitsExcluded: z.literal(true),
  humanHiringDecisionRequired: z.literal(true),
});

export type CandidateReviewPack = z.infer<typeof CandidateReviewPackSchema>;

// ── 5. Generic Specialist Input/Output & Supervisor Schemas ──────────────────

export const StandardAgentInputSchema = z.object({
  prompt: z.string().min(1),
  projectId: z.string().optional(),
  contextData: z.record(z.string(), z.any()).optional(),
  constraints: z.array(z.string()).optional(),
  parameters: z.record(z.string(), z.any()).optional(),
});

export const StandardAgentOutputSchema = z.object({
  agentId: z.string(),
  domain: z.string(),
  deliverableType: z.string(),
  content: z.string(),
  structuredData: z.record(z.string(), z.any()),
  extractedFacts: z.array(
    z.object({
      fact: z.string(),
      sourceRef: z.string(),
    })
  ),
  creativeSuggestions: z.array(z.string()),
  isDraft: z.boolean().default(true),
});

export const SupervisorRoutingInputSchema = z.object({
  intent: z.string().min(1),
  domainHint: z.string().optional(),
  projectId: z.string().optional(),
  inputs: z.record(z.string(), z.any()).optional(),
});

export const SupervisorRoutingOutputSchema = z.object({
  supervisorId: z.string(),
  selectedDomains: z.array(z.string()),
  delegatedAgents: z.array(z.string()),
  taskPlan: z.array(
    z.object({
      step: z.number().int().positive(),
      agentId: z.string(),
      objective: z.string(),
    })
  ),
  consolidatedSummary: z.string(),
  specialistOutputs: z.record(z.string(), z.any()),
  unsupportedDomainReason: z.string().optional(),
  clarificationQuestion: z.string().optional(),
});

// ── 6. Central Schema Registry Map ───────────────────────────────────────────

export const SCHEMA_REGISTRY: Record<string, z.ZodTypeAny> = {
  // Common specialist schemas
  'schemas/common/agent.input': StandardAgentInputSchema,
  'schemas/common/agent.output': StandardAgentOutputSchema,
  'schemas/common/skill.input': z.record(z.string(), z.any()),
  'schemas/common/skill.output': z.record(z.string(), z.any()),

  // Supervisor schemas
  'schemas/supervisor/routing.input': SupervisorRoutingInputSchema,
  'schemas/supervisor/routing.output': SupervisorRoutingOutputSchema,

  // Workflow output schemas
  'schemas/entertainment/creative-project-brief': CreativeProjectBriefSchema,
  'schemas/entertainment/script-breakdown': ScriptBreakdownSchema,
  'schemas/entertainment/pre-production-plan': PreProductionPlanSchema,
  'schemas/entertainment/shoot-day-report': ShootDayReportSchema,
  'schemas/entertainment/post-production-status': PostProductionStatusSchema,
  'schemas/entertainment/film-marketing-plan': FilmMarketingPlanSchema,

  'schemas/productivity/daily-briefing': DailyBriefingSchema,
  'schemas/productivity/meeting-action-plan': MeetingActionPlanSchema,
  'schemas/productivity/research-brief': ResearchBriefSchema,
  'schemas/productivity/document-intelligence-result': DocumentIntelligenceResultSchema,
  'schemas/productivity/automation-run-result': AutomationRunResultSchema,
  'schemas/productivity/data-analysis-report': DataAnalysisReportSchema,

  'schemas/marketing/gtm-strategy': GTMStrategySchema,
  'schemas/marketing/content-package': ContentPackageSchema,
  'schemas/marketing/campaign-plan-or-review': CampaignPlanOrReviewSchema,

  'schemas/operations/business-review': BusinessReviewSchema,
  'schemas/operations/finance-document-result': FinanceDocumentResultSchema,
  'schemas/operations/customer-resolution-proposal': CustomerResolutionProposalSchema,
  'schemas/operations/candidate-review-pack': CandidateReviewPackSchema,
};

// Dynamically register per-agent and per-skill schema refs so every manifest ref is backed by a validated Zod schema
const AGENT_SLUGS = [
  // Entertainment
  'entertainment/creative-producer',
  'entertainment/story-screenplay',
  'entertainment/script-breakdown',
  'entertainment/storyboard',
  'entertainment/cinematography',
  'entertainment/production-design',
  'entertainment/casting',
  'entertainment/location-scout',
  'entertainment/production-manager',
  'entertainment/production-finance',
  'entertainment/script-continuity',
  'entertainment/production-sound',
  'entertainment/production-monitor',
  'entertainment/video-editing',
  'entertainment/vfx',
  'entertainment/color-grading',
  'entertainment/audio-post-production',
  'entertainment/film-marketing',
  // Productivity
  'productivity/executive-assistant',
  'productivity/task-project-manager',
  'productivity/calendar-meeting',
  'productivity/communication',
  'productivity/research-knowledge',
  'productivity/document-intelligence',
  'productivity/writing-language',
  'productivity/workflow-automation',
  'productivity/data-intelligence',
  'productivity/approval-follow-up',
  // Marketing
  'marketing/marketing-strategist',
  'marketing/content-social-media',
  'marketing/seo',
  'marketing/campaign-manager',
  'marketing/brand-audience',
  'marketing/growth-lead-generation',
  // Operations
  'operations/business-intelligence',
  'operations/finance-accounting',
  'operations/compliance',
  'operations/hr-recruitment',
  'operations/customer-success',
  'operations/crm-intelligence',
  'operations/supply-vendor',
  // Supervisors
  'supervisor/global-orchestrator',
  'supervisor/entertainment-supervisor',
  'supervisor/productivity-supervisor',
  'supervisor/marketing-supervisor',
  'supervisor/operations-supervisor',
];

for (const slugPath of AGENT_SLUGS) {
  const inputKey = `schemas/${slugPath}.input`;
  const outputKey = `schemas/${slugPath}.output`;
  if (!SCHEMA_REGISTRY[inputKey]) {
    SCHEMA_REGISTRY[inputKey] = slugPath.startsWith('supervisor/')
      ? SupervisorRoutingInputSchema
      : StandardAgentInputSchema;
  }
  if (!SCHEMA_REGISTRY[outputKey]) {
    SCHEMA_REGISTRY[outputKey] = slugPath.startsWith('supervisor/')
      ? SupervisorRoutingOutputSchema
      : StandardAgentOutputSchema;
  }
}

export function registerSchemaRef(ref: string, schema: z.ZodTypeAny): void {
  SCHEMA_REGISTRY[ref] = schema;
}

export function hasSchemaRef(ref: string): boolean {
  return Boolean(SCHEMA_REGISTRY[ref]);
}

export function getSchemaByRef(ref: string): z.ZodTypeAny | undefined {
  return SCHEMA_REGISTRY[ref];
}

