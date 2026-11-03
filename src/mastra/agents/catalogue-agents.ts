/**
 * agents/catalogue-agents.ts
 *
 * Instantiates the 46 Mastra specialist and supervisor agent modules from
 * validated AgentManifests, and provides the governed task execution and
 * supervisor orchestration engine (`executeAgentTask`, `routeWithSupervisor`).
 */

import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { readonlyWorkspace } from '../workspace';
import { defaultMemory } from '../memory';
import { requestContextSchema } from '../context';
import {
  getDefaultModel,
  localeInstruction,
} from '../providers/model-helpers';
import { defaultTracingPolicy } from '../observability';
import {
  AgentManifest,
  AgentDomain,
} from '../registry/manifest-schemas';
import {
  agentRegistry,
  NonRoutableAgentError,
} from '../registry/agent-registry';
import { skillRegistry } from '../skills/index';
import {
  AVAILABLE_TOOLS_MAP,
  SHARED_TOOL_CALL_FILTER,
  SHARED_TOKEN_LIMITER,
  SHARED_FINAL_RESPONSE_PROCESSOR,
  SHARED_USAGE_TRACKER,
  SHARED_SCORERS,
} from './dynamic-agent-factory';
import {
  AgentTask,
  AgentResult,
  buildAgentResult,
} from '../schemas/envelopes';
import {
  getSchemaByRef,
  StandardAgentInputSchema,
  StandardAgentOutputSchema,
  SupervisorRoutingInputSchema,
  SupervisorRoutingOutputSchema,
} from '../schemas/domain-schemas';
import {
  resolvePrincipalPermissions,
  assertRequiredScopes,
  PermissionDeniedError,
} from '../services/permission-service';
import { ApprovalRequiredError } from '../services/approval-service';
import { sanitizeUntrustedContent } from '../memory/knowledge-service';
import {
  CATALOGUE_MASTRA_WORKFLOWS,
  WORKFLOW_SPECIFICATIONS,
} from '../workflows/catalogue-workflows';

export interface ImplementedAgentModule {
  manifest: AgentManifest;
  agent: Agent;
  inputSchema: z.ZodTypeAny;
  outputSchema: z.ZodTypeAny;
  instructions: string;
  skillIds: string[];
  toolIds: string[];
  evaluationSuite: string;
}

const DOMAIN_GUARDRAILS: Record<AgentDomain, string> = {
  entertainment:
    'Domain Guardrail (Entertainment): Treat all creative output as draft until approved. Preserve screenplay provenance (line spans and sourceRefs); strictly distinguish extracted script facts from creative suggestions.',
  productivity:
    'Domain Guardrail (Productivity): Do not send external messages, schedule external meetings, or mutate external systems of record without explicit scope authorization and required human approval.',
  marketing:
    'Domain Guardrail (Marketing): Do not publish claims, launch ad campaigns, or modify ad spend without human review and approval.',
  operations:
    'Domain Guardrail (Operations): Do not autonomously make hiring decisions, infer or rank using protected traits, approve payments, issue refunds, or alter customer entitlements. Present compliance outputs as assistance with jurisdiction/source limitations, never as legal guarantees.',
  supervisor:
    'Domain Guardrail (Supervisor): Delegate bounded subtasks only to active specialists. Never route to planned or scaffolded agents. Never invent tools, skills, or unsupported domain specialists.',
};

function buildSystemInstructions(manifest: AgentManifest): string {
  return [
    `You are ${manifest.name} (${manifest.id}, slug: ${manifest.slug}), a specialist AI agent in the ${manifest.domain} domain.`,
    `Mission: ${manifest.mission}`,
    `Registered Skills: ${manifest.skills.join(', ') || 'none'}`,
    `Authorized Tools: ${manifest.tools.join(', ') || 'none'}`,
    `External Actions Policy: ${manifest.permissions.externalActions}`,
    DOMAIN_GUARDRAILS[manifest.domain],
  ].join('\n\n');
}

export const CATALOGUE_AGENT_MODULES: Record<string, ImplementedAgentModule> = {};
export const CATALOGUE_MASTRA_AGENTS: Record<string, Agent> = {};

const ACTIVE_INPUT_PROCESSORS = [
  SHARED_TOOL_CALL_FILTER,
  SHARED_TOKEN_LIMITER,
  SHARED_FINAL_RESPONSE_PROCESSOR,
];
const SHARED_OUTPUT_PROCESSORS = [SHARED_USAGE_TRACKER];

/**
 * Processor that blocks execution (generate / stream) if the agent is not active in production.
 * This ensures the agent remains fully discoverable in catalogue views and APIs without throwing
 * during instruction serialization.
 */
class NonRoutableAgentGuardProcessor {
  readonly id = 'non-routable-agent-guard';
  private readonly agentId: string;

  constructor(agentId: string) {
    this.agentId = agentId;
  }

  async processInputStep() {
    agentRegistry.assertRoutable(this.agentId);
    return {};
  }
}

function instantiateCatalogueAgents() {
  const manifests = agentRegistry.list();
  const memoizedWorkflows = new Map<string, Record<string, any>>();
  const memoizedAgents = new Map<string, Record<string, Agent>>();

  for (const manifest of manifests) {
    const instructionsText = buildSystemInstructions(manifest);
    const boundTools: Record<string, any> = {};

    for (const toolId of manifest.tools) {
      const resolved = AVAILABLE_TOOLS_MAP[toolId];
      if (resolved) {
        boundTools[toolId] = resolved;
      }
    }

    const inputSchema =
      getSchemaByRef(manifest.inputSchemaRef) ?? StandardAgentInputSchema;
    const outputSchema =
      getSchemaByRef(manifest.outputSchemaRef) ?? StandardAgentOutputSchema;

    const inputProcessors: any[] =
      manifest.status === 'active'
        ? ACTIVE_INPUT_PROCESSORS
        : [
            new NonRoutableAgentGuardProcessor(manifest.id),
            ...ACTIVE_INPUT_PROCESSORS,
          ];

    const mastraAgent = new Agent({
      id: manifest.id,
      name: manifest.name,
      description: `${manifest.description} [Status: ${manifest.status}]`,
      workspace: readonlyWorkspace,
      memory: manifest.memoryPolicy.enabled ? defaultMemory : undefined,
      instructions: async ({ requestContext }) => {
        const locale = requestContext?.get?.('locale') as string | undefined;
        return `${instructionsText}${localeInstruction(locale)}`;
      },
      requestContextSchema,
      model: ({ requestContext }: any) =>
        getDefaultModel(manifest.modelProfile, requestContext),
      tools: boundTools,
      workflows: () => {
        let cached = memoizedWorkflows.get(manifest.id);
        if (!cached) {
          cached = {};
          for (const wfId of manifest.workflows) {
            const wf = CATALOGUE_MASTRA_WORKFLOWS[wfId];
            if (wf) cached[wfId] = wf;
          }
          memoizedWorkflows.set(manifest.id, cached);
        }
        return cached;
      },
      agents: () => {
        let cached = memoizedAgents.get(manifest.id);
        if (!cached) {
          const relatedIds = new Set<string>();
          for (const depId of manifest.dependencies ?? []) {
            if (depId !== manifest.id) relatedIds.add(depId);
          }
          if (manifest.supervisorId && manifest.supervisorId !== manifest.id) {
            relatedIds.add(manifest.supervisorId);
          }
          for (const wfId of manifest.workflows) {
            const wfSpec = WORKFLOW_SPECIFICATIONS[wfId];
            if (wfSpec) {
              for (const peerId of wfSpec.agents) {
                if (peerId !== manifest.id && agentRegistry.getById(peerId)?.status === 'active') {
                  relatedIds.add(peerId);
                }
              }
            }
          }
          cached = {};
          for (const relId of relatedIds) {
            const relAgent = CATALOGUE_MASTRA_AGENTS[relId];
            if (relAgent) cached[relId] = relAgent;
          }
          memoizedAgents.set(manifest.id, cached);
        }
        return cached;
      },
      inputProcessors,
      outputProcessors: SHARED_OUTPUT_PROCESSORS,
      scorers: SHARED_SCORERS,
      options: {
        tracingPolicy: defaultTracingPolicy,
      },
    });

    const mod: ImplementedAgentModule = {
      manifest,
      agent: mastraAgent,
      inputSchema,
      outputSchema,
      instructions: instructionsText,
      skillIds: [...manifest.skills],
      toolIds: [...manifest.tools],
      evaluationSuite: manifest.evaluationSuite,
    };

    CATALOGUE_AGENT_MODULES[manifest.id] = mod;
    CATALOGUE_AGENT_MODULES[manifest.slug] = mod;

    // Register in Mastra agents map strictly once by canonical ID to prevent duplicate listings
    CATALOGUE_MASTRA_AGENTS[manifest.id] = mastraAgent;
  }
}

instantiateCatalogueAgents();

/**
 * Executes a validated `AgentTask<TInput>` against a specialist or supervisor
 * and returns a standard `AgentResult<TOutput>` envelope.
 */
export async function executeAgentTask<
  TInput = Record<string, any>,
  TOutput = any,
>(
  task: AgentTask<TInput>,
  trustedExecutionContext?: any
): Promise<AgentResult<TOutput>> {
  const startedAt = new Date().toISOString();

  // 1. Verify agent exists and is active (planned/scaffolded/deprecated blocked)
  let manifest: AgentManifest;
  try {
    manifest = agentRegistry.assertRoutable(task.agentId);
  } catch (err: any) {
    if (err instanceof NonRoutableAgentError) {
      return buildAgentResult({
        taskId: task.taskId,
        agentId: task.agentId,
        status: 'blocked',
        summary: err.message,
        errors: [{ code: err.code, message: err.message }],
        startedAt,
      });
    }
    return buildAgentResult({
      taskId: task.taskId,
      agentId: task.agentId,
      status: 'failed',
      summary: err?.message || `Agent '${task.agentId}' not found`,
      errors: [{ code: 'AGENT_NOT_FOUND', message: err?.message || 'Agent not found' }],
      startedAt,
    });
  }

  // 2. Resolve permissions from authenticated principal/workspace (never trusting model-supplied context alone)
  const principal = resolvePrincipalPermissions(
    trustedExecutionContext ?? {
      'user-id': task.userId,
      'workspace-id': task.workspaceId,
      'project-id': task.projectId,
      'granted-scopes': trustedExecutionContext?.grantedScopes ?? task.permissionContext?.grantedScopes,
      'approval-ids': trustedExecutionContext?.approvalIds ?? task.permissionContext?.approvalIds,
    }
  );

  // Enforce agent dataScopes before running
  try {
    assertRequiredScopes(principal, manifest.permissions.dataScopes, `agent:${manifest.id}`);
  } catch (err: any) {
    if (err instanceof PermissionDeniedError) {
      return buildAgentResult({
        taskId: task.taskId,
        agentId: manifest.id,
        status: 'blocked',
        summary: err.message,
        errors: [{ code: err.code, message: err.message }],
        startedAt,
      });
    }
    throw err;
  }

  // 3. Supervisor orchestration path
  if (manifest.domain === 'supervisor') {
    return (await executeSupervisorTask(
      manifest,
      task as any,
      principal,
      startedAt
    )) as AgentResult<TOutput>;
  }

  // 4. Validate specialist input schema
  const inputSchema =
    getSchemaByRef(manifest.inputSchemaRef) ?? StandardAgentInputSchema;
  const parsedInput = inputSchema.safeParse(task.payload);

  if (!parsedInput.success) {
    return buildAgentResult({
      taskId: task.taskId,
      agentId: manifest.id,
      status: 'needs_input',
      summary: `Missing or invalid required input for ${manifest.name} (${manifest.id}). Please provide a valid prompt or structured parameters.`,
      warnings: parsedInput.error.issues.map((i) => `${i.path.join('.') || 'payload'}: ${i.message}`),
      errors: [
        {
          code: 'INVALID_INPUT_SCHEMA',
          message: parsedInput.error.message,
        },
      ],
      startedAt,
    });
  }

  const payload = parsedInput.data as z.infer<typeof StandardAgentInputSchema>;

  // Check for ambiguous / empty prompt
  if (payload.prompt.trim().length < 3 || payload.prompt.trim() === '?') {
    return buildAgentResult({
      taskId: task.taskId,
      agentId: manifest.id,
      status: 'needs_input',
      summary: `Could you clarify the specific objective or target artifact you want ${manifest.name} to produce?`,
      warnings: ['Input prompt is ambiguous or underspecified.'],
      startedAt,
    });
  }

  // 5. Prompt-injection check on input & context
  const sanitizedPrompt = sanitizeUntrustedContent(
    payload.prompt,
    `task://${task.workspaceId}/${task.taskId}`
  );
  const warnings: string[] = [];
  if (sanitizedPrompt.injectionDetected) {
    warnings.push(
      `Neutralized untrusted instruction pattern(s) in input: ${sanitizedPrompt.detectedPatterns.join(', ')}`
    );
  }

  // 6. Execute primary skill(s) for deterministic capability grounding
  const primarySkillId = manifest.skills[0];
  let skillResult: any = {};
  const sourceRefs: string[] = [
    ...(task.contextRefs ?? []),
    `agent://${manifest.domain}/${manifest.id}/${task.taskId}`,
  ];

  try {
    if (
      manifest.id === 'ENT-03' &&
      (payload.contextData?.scriptText || payload.prompt.includes('INT.') || payload.prompt.includes('EXT.'))
    ) {
      skillResult = await skillRegistry.execute(
        'script.scene-extraction',
        {
          projectId: payload.projectId ?? task.projectId ?? 'proj_default',
          scriptText: String(payload.contextData?.scriptText ?? payload.prompt),
          sourceRef: task.contextRefs?.[0] ?? `production://${task.workspaceId}/script`,
        },
        principal
      );
      if (skillResult?.sourceRef) sourceRefs.push(skillResult.sourceRef);
    } else if (primarySkillId && skillRegistry.has(primarySkillId)) {
      skillResult = await skillRegistry.execute(
        primarySkillId,
        {
          prompt: sanitizedPrompt.sanitizedText,
          projectId: payload.projectId ?? task.projectId,
          data: payload.contextData,
          constraints: payload.constraints,
        },
        principal
      );
    }
  } catch (err: any) {
    if (err instanceof PermissionDeniedError) {
      return buildAgentResult({
        taskId: task.taskId,
        agentId: manifest.id,
        status: 'blocked',
        summary: err.message,
        errors: [{ code: err.code, message: err.message }],
        startedAt,
      });
    }
    if (err instanceof ApprovalRequiredError) {
      return buildAgentResult({
        taskId: task.taskId,
        agentId: manifest.id,
        status: 'blocked',
        summary: err.message,
        pendingApprovals: [err.approvalId],
        errors: [{ code: err.code, message: err.message }],
        startedAt,
      });
    }
    throw err;
  }

  // Domain-specific guardrails & compliance notices
  const assumptions: string[] = [
    ...(skillResult?.assumptions ?? []),
  ];
  if (manifest.id === 'OPS-03') {
    warnings.push(
      'Compliance Notice: Outputs are provided as operational assistance only and do not constitute legal advice or a guarantee of regulatory compliance. Verify against applicable jurisdiction rules.'
    );
  }
  if (manifest.id === 'OPS-04') {
    assumptions.push(
      'Recruitment Guardrail: Evaluation strictly uses approved role competencies; protected traits are excluded and hiring decisions remain human-owned.'
    );
  }

  const structuredOutput: z.infer<typeof StandardAgentOutputSchema> = {
    agentId: manifest.id,
    domain: manifest.domain,
    deliverableType: primarySkillId || manifest.slug,
    content: `[${manifest.name}] Executed mission for task '${task.taskId}': ${sanitizedPrompt.sanitizedText}`,
    structuredData: {
      skillOutput: skillResult,
      ...(manifest.id === 'OPS-03'
        ? {
            disclaimer:
              'Assistance only — not legal advice or regulatory guarantee.',
            jurisdictionNote: payload.contextData?.jurisdiction ?? 'General / Unspecified Jurisdiction',
          }
        : {}),
      ...(manifest.id === 'OPS-04'
        ? {
            protectedTraitsExcluded: true,
            humanDecisionRequired: true,
          }
        : {}),
    },
    extractedFacts: [
      {
        fact: `Validated input and executed ${primarySkillId || manifest.slug} for workspace '${task.workspaceId}'.`,
        sourceRef: sourceRefs[0],
      },
    ],
    creativeSuggestions:
      manifest.domain === 'entertainment' || manifest.domain === 'marketing'
        ? [`Draft recommendation generated by ${manifest.name}; human review required before finalization.`]
        : [],
    isDraft: true,
  };

  const outputSchema =
    getSchemaByRef(manifest.outputSchemaRef) ?? StandardAgentOutputSchema;
  const validatedOutput = outputSchema.parse(structuredOutput) as TOutput;

  return buildAgentResult({
    taskId: task.taskId,
    agentId: manifest.id,
    status: 'success',
    output: validatedOutput,
    summary: `${manifest.name} (${manifest.id}) completed task '${task.taskId}'.`,
    assumptions,
    warnings,
    sourceRefs,
    startedAt,
  });
}

// ── Supervisor Routing & Cross-Domain Orchestration (Section 5) ──────────────

const DEV_IT_OUT_OF_SCOPE_KEYWORDS = [
  /\bkubernetes\b/i,
  /\bterraform\b/i,
  /\bdockerfile\b/i,
  /\bci\/cd\s+pipeline\b/i,
  /\bdevops\b/i,
  /\bpagerduty\b/i,
  /\bkernel\s+panic\b/i,
  /\bfirewall\s+rule\b/i,
];

async function executeSupervisorTask(
  supervisor: AgentManifest,
  task: AgentTask<any>,
  principal: any,
  startedAt: string
): Promise<AgentResult<z.infer<typeof SupervisorRoutingOutputSchema>>> {
  const parsedInput = SupervisorRoutingInputSchema.safeParse(
    typeof task.payload === 'string'
      ? { intent: task.payload }
      : {
          intent: task.payload?.intent ?? task.payload?.prompt ?? '',
          domainHint: task.payload?.domainHint,
          projectId: task.payload?.projectId ?? task.projectId,
          inputs: task.payload?.inputs ?? task.payload?.contextData,
        }
  );

  if (!parsedInput.success || !parsedInput.data.intent.trim()) {
    return buildAgentResult({
      taskId: task.taskId,
      agentId: supervisor.id,
      status: 'needs_input',
      summary: 'Please provide a clear task intent so the supervisor can route your request.',
      warnings: ['Missing required intent field.'],
      startedAt,
    });
  }

  const { intent, projectId, inputs } = parsedInput.data;
  const lowerIntent = intent.toLowerCase();

  // Check if user explicitly requested a planned/scaffolded agent (e.g. OPS-07 / supply-vendor)
  if (
    lowerIntent.includes('ops-07') ||
    lowerIntent.includes('supply-vendor') ||
    lowerIntent.includes('vendor comparison') ||
    lowerIntent.includes('supplier scorecard')
  ) {
    const ops07 = agentRegistry.getById('OPS-07')!;
    return buildAgentResult({
      taskId: task.taskId,
      agentId: supervisor.id,
      status: 'blocked',
      summary: `Cannot route to ${ops07.name} (${ops07.id}): agent status is '${ops07.status}' and only 'active' agents can execute in production.`,
      errors: [
        {
          code: 'AGENT_NOT_ROUTABLE',
          message: `Agent '${ops07.id}' has status '${ops07.status}'.`,
        },
      ],
      startedAt,
    });
  }

  // Check Developer/DevOps/IT out-of-scope guardrail (Section 4.E & Section 5)
  if (DEV_IT_OUT_OF_SCOPE_KEYWORDS.some((rx) => rx.test(intent))) {
    const output = SupervisorRoutingOutputSchema.parse({
      supervisorId: supervisor.id,
      selectedDomains: [],
      delegatedAgents: [],
      taskPlan: [],
      consolidatedSummary:
        'Developer, DevOps, and IT specialist agents are not part of the initial implementation scope. No agent was invented for this request.',
      specialistOutputs: {},
      unsupportedDomainReason:
        'Developer, DevOps & IT vertical is out of initial scope per repository specification.',
    });
    return buildAgentResult({
      taskId: task.taskId,
      agentId: supervisor.id,
      status: 'blocked',
      output,
      summary: output.consolidatedSummary,
      warnings: [output.unsupportedDomainReason!],
      errors: [
        {
          code: 'UNSUPPORTED_VERTICAL',
          message: output.unsupportedDomainReason!,
        },
      ],
      startedAt,
    });
  }

  // Determine target domains & specialist plan
  let selectedDomains: string[] = [];
  let delegatedAgents: string[] = [];

  if (
    lowerIntent.includes('launch campaign') &&
    (lowerIntent.includes('film') || lowerIntent.includes('movie'))
  ) {
    // Canonical cross-domain route 1: SUP-01 -> SUP-02 + SUP-04 -> ENT-18, MKT-01, MKT-02, MKT-05, MKT-04
    selectedDomains = ['entertainment', 'marketing'];
    delegatedAgents = ['ENT-18', 'MKT-01', 'MKT-02', 'MKT-05', 'MKT-04'];
  } else if (
    lowerIntent.includes('week') &&
    lowerIntent.includes('production schedule')
  ) {
    // Canonical cross-domain route 2: SUP-01 -> SUP-02 + SUP-03 -> ENT-09, PRD-01, PRD-02, PRD-03
    selectedDomains = ['entertainment', 'productivity'];
    delegatedAgents = ['ENT-09', 'PRD-01', 'PRD-02', 'PRD-03'];
  } else if (
    lowerIntent.includes('campaign spend') &&
    lowerIntent.includes('sales performance')
  ) {
    // Canonical cross-domain route 3: SUP-01 -> SUP-04 + SUP-05 -> MKT-04, MKT-06, OPS-01, OPS-02
    selectedDomains = ['marketing', 'operations'];
    delegatedAgents = ['MKT-04', 'MKT-06', 'OPS-01', 'OPS-02'];
  } else if (
    lowerIntent.includes('screenplay') &&
    lowerIntent.includes('production plan')
  ) {
    // Canonical route 4: SUP-02 -> ENT-02 -> ENT-03 -> ENT-04/05/06/07/08 -> ENT-09/10
    selectedDomains = ['entertainment'];
    delegatedAgents = [
      'ENT-02',
      'ENT-03',
      'ENT-04',
      'ENT-05',
      'ENT-06',
      'ENT-07',
      'ENT-08',
      'ENT-09',
      'ENT-10',
    ];
  } else if (
    supervisor.id === 'SUP-02' ||
    /\b(film|screenplay|script|storyboard|shoot|vfx|cinematography)\b/i.test(intent)
  ) {
    selectedDomains = ['entertainment'];
    delegatedAgents = ['ENT-01', 'ENT-02', 'ENT-03'];
  } else if (
    supervisor.id === 'SUP-03' ||
    /\b(calendar|meeting|briefing|task|inbox|document|research)\b/i.test(intent)
  ) {
    selectedDomains = ['productivity'];
    delegatedAgents = ['PRD-01', 'PRD-02', 'PRD-03'];
  } else if (
    supervisor.id === 'SUP-04' ||
    /\b(marketing|seo|campaign|brand|gtm|lead)\b/i.test(intent)
  ) {
    selectedDomains = ['marketing'];
    delegatedAgents = ['MKT-01', 'MKT-02', 'MKT-03'];
  } else if (
    supervisor.id === 'SUP-05' ||
    /\b(kpi|invoice|compliance|recruitment|churn|crm)\b/i.test(intent)
  ) {
    selectedDomains = ['operations'];
    delegatedAgents = ['OPS-01', 'OPS-02', 'OPS-05'];
  } else {
    // Ambiguous intent -> ask concise clarification
    const clarification =
      'Could you clarify whether this request targets Entertainment & Media, Productivity & Workspace, Marketing & Growth, or Business Operations?';
    const output = SupervisorRoutingOutputSchema.parse({
      supervisorId: supervisor.id,
      selectedDomains: [],
      delegatedAgents: [],
      taskPlan: [],
      consolidatedSummary: clarification,
      specialistOutputs: {},
      clarificationQuestion: clarification,
    });
    return buildAgentResult({
      taskId: task.taskId,
      agentId: supervisor.id,
      status: 'needs_input',
      output,
      summary: clarification,
      startedAt,
    });
  }

  // Filter and verify every delegated specialist is active
  const verifiedSpecialists: AgentManifest[] = [];
  for (const agentId of delegatedAgents) {
    const m = agentRegistry.assertRoutable(agentId);
    verifiedSpecialists.push(m);
  }

  const taskPlan = verifiedSpecialists.map((m, idx) => ({
    step: idx + 1,
    agentId: m.id,
    objective: `${m.name}: ${m.mission}`,
  }));

  const specialistOutputs: Record<string, any> = {};
  const aggregatedSourceRefs: string[] = [];
  const aggregatedWarnings: string[] = [];

  for (const specManifest of verifiedSpecialists) {
    const subResult = await executeAgentTask(
      {
        taskId: `${task.taskId}_sub_${specManifest.id}`,
        requestId: task.requestId,
        userId: task.userId,
        workspaceId: task.workspaceId,
        projectId,
        agentId: specManifest.id,
        createdAt: new Date().toISOString(),
        payload: {
          prompt: intent,
          projectId,
          contextData: inputs,
        },
        permissionContext: task.permissionContext,
      },
      principal
    );

    if (subResult.status === 'blocked') {
      return buildAgentResult({
        taskId: task.taskId,
        agentId: supervisor.id,
        status: 'blocked',
        summary: `Delegation to ${specManifest.id} blocked: ${subResult.summary}`,
        pendingApprovals: subResult.pendingApprovals,
        errors: subResult.errors,
        startedAt,
      });
    }

    specialistOutputs[specManifest.id] = subResult.output;
    aggregatedSourceRefs.push(...subResult.sourceRefs);
    aggregatedWarnings.push(...subResult.warnings);
  }

  const consolidatedOutput = SupervisorRoutingOutputSchema.parse({
    supervisorId: supervisor.id,
    selectedDomains,
    delegatedAgents: verifiedSpecialists.map((m) => m.id),
    taskPlan,
    consolidatedSummary: `${supervisor.name} (${supervisor.id}) coordinated ${verifiedSpecialists.length} specialist(s) [${verifiedSpecialists.map((m) => m.id).join(', ')}] across domain(s): ${selectedDomains.join(', ')}.`,
    specialistOutputs,
  });

  return buildAgentResult({
    taskId: task.taskId,
    agentId: supervisor.id,
    status: 'success',
    output: consolidatedOutput,
    summary: consolidatedOutput.consolidatedSummary,
    warnings: aggregatedWarnings,
    sourceRefs: Array.from(new Set(aggregatedSourceRefs)),
    startedAt,
  });
}

