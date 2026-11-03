/**
 * schemas/envelopes.ts
 *
 * Standard task and result envelopes for agent and workflow handoffs.
 * Domain-specific Zod schemas live inside `payload` and `output`.
 */

import { z } from 'zod';

export const PermissionContextSchema = z.object({
  grantedScopes: z.array(z.string()),
  approvalIds: z.array(z.string()).optional(),
});

export type PermissionContext = z.infer<typeof PermissionContextSchema>;

export const AgentResultStatusSchema = z.enum([
  'success',
  'partial',
  'needs_input',
  'blocked',
  'failed',
]);

export type AgentResultStatus = z.infer<typeof AgentResultStatusSchema>;

export const StructuredErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export type StructuredError = z.infer<typeof StructuredErrorSchema>;

export interface AgentTask<TInput = unknown> {
  taskId: string;
  requestId: string;
  userId: string;
  workspaceId: string;
  projectId?: string;
  agentId: string;
  workflowId?: string;
  createdAt: string;
  locale?: string;
  timezone?: string;
  payload: TInput;
  contextRefs?: string[];
  permissionContext: {
    grantedScopes: string[];
    approvalIds?: string[];
  };
}

export interface AgentResult<TOutput = unknown> {
  taskId: string;
  agentId: string;
  status: AgentResultStatus;
  output?: TOutput;
  summary: string;
  assumptions: string[];
  warnings: string[];
  sourceRefs: string[];
  pendingApprovals?: string[];
  errors?: StructuredError[];
  startedAt: string;
  completedAt: string;
}

export function createAgentTaskSchema<T extends z.ZodTypeAny>(payloadSchema: T) {
  return z.object({
    taskId: z.string().min(1),
    requestId: z.string().min(1),
    userId: z.string().min(1),
    workspaceId: z.string().min(1),
    projectId: z.string().optional(),
    agentId: z.string().min(1),
    workflowId: z.string().optional(),
    createdAt: z.string().min(1),
    locale: z.string().optional(),
    timezone: z.string().optional(),
    payload: payloadSchema,
    contextRefs: z.array(z.string()).optional(),
    permissionContext: PermissionContextSchema,
  });
}

export function createAgentResultSchema<T extends z.ZodTypeAny>(outputSchema: T) {
  return z.object({
    taskId: z.string().min(1),
    agentId: z.string().min(1),
    status: AgentResultStatusSchema,
    output: outputSchema.optional(),
    summary: z.string(),
    assumptions: z.array(z.string()),
    warnings: z.array(z.string()),
    sourceRefs: z.array(z.string()),
    pendingApprovals: z.array(z.string()).optional(),
    errors: z.array(StructuredErrorSchema).optional(),
    startedAt: z.string().min(1),
    completedAt: z.string().min(1),
  });
}

export const GenericAgentTaskSchema = createAgentTaskSchema(z.record(z.string(), z.any()).or(z.any()));
export const GenericAgentResultSchema = createAgentResultSchema(z.any());

export function buildAgentResult<TOutput>(params: {
  taskId: string;
  agentId: string;
  status: AgentResultStatus;
  output?: TOutput;
  summary: string;
  assumptions?: string[];
  warnings?: string[];
  sourceRefs?: string[];
  pendingApprovals?: string[];
  errors?: StructuredError[];
  startedAt: string;
  completedAt?: string;
}): AgentResult<TOutput> {
  return {
    taskId: params.taskId,
    agentId: params.agentId,
    status: params.status,
    output: params.output,
    summary: params.summary,
    assumptions: params.assumptions ?? [],
    warnings: params.warnings ?? [],
    sourceRefs: params.sourceRefs ?? [],
    ...(params.pendingApprovals && params.pendingApprovals.length > 0
      ? { pendingApprovals: params.pendingApprovals }
      : {}),
    ...(params.errors && params.errors.length > 0 ? { errors: params.errors } : {}),
    startedAt: params.startedAt,
    completedAt: params.completedAt ?? new Date().toISOString(),
  };
}

