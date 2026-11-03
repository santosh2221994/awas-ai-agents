/**
 * registry/manifest-schemas.ts
 *
 * Logical manifest contracts and Zod validation schemas for Agents,
 * Skills, and Evaluation Suites.
 */

import { z } from 'zod';

export const AgentDomainSchema = z.enum([
  'entertainment',
  'productivity',
  'marketing',
  'operations',
  'supervisor',
]);

export type AgentDomain = z.infer<typeof AgentDomainSchema>;

export const AgentStatusSchema = z.enum([
  'planned',
  'scaffolded',
  'active',
  'deprecated',
]);

export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export const MemoryScopeSchema = z.enum(['none', 'task', 'user', 'workspace']);

export const ExternalActionsPolicySchema = z.enum([
  'read-only',
  'approval-required',
  'restricted',
]);

export const AgentManifestSchema = z
  .object({
    id: z.string().regex(/^(ENT|PRD|MKT|OPS|SUP)-\d{2}$/, {
      message: 'Agent ID must follow canonical prefix format (ENT-XX, PRD-XX, MKT-XX, OPS-XX, SUP-XX)',
    }),
    slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
    name: z.string().min(2),
    domain: AgentDomainSchema,
    description: z.string().min(5),
    mission: z.string().min(5),
    status: AgentStatusSchema,
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    tags: z.array(z.string()).min(1),
    skills: z.array(z.string()),
    tools: z.array(z.string()),
    workflows: z.array(z.string()),
    supervisorId: z.string().optional(),
    dependencies: z.array(z.string()).optional(),
    replacementId: z.string().optional(),
    legacyAliases: z.array(z.string()).optional(),
    inputSchemaRef: z.string().min(1),
    outputSchemaRef: z.string().min(1),
    memoryPolicy: z.object({
      enabled: z.boolean(),
      scope: MemoryScopeSchema,
      retention: z.string().optional(),
      sensitiveDataAllowed: z.literal(false),
    }),
    permissions: z.object({
      dataScopes: z.array(z.string()),
      toolScopes: z.array(z.string()),
      externalActions: ExternalActionsPolicySchema,
    }),
    modelProfile: z
      .string()
      .min(1)
      .refine(
        (val) => !/^(sk-|gsk_|vck_|AIza|Bearer\s)/i.test(val),
        'modelProfile must be a configuration key, never a secret or API key'
      ),
    evaluationSuite: z.string().min(1),
    owner: z.string().min(1),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

export type AgentManifest = z.infer<typeof AgentManifestSchema>;

export const SkillManifestSchema = z
  .object({
    id: z.string().min(2).regex(/^[a-z0-9.-]+$/),
    name: z.string().min(2),
    description: z.string().min(5),
    domain: AgentDomainSchema,
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    inputSchemaRef: z.string().min(1),
    outputSchemaRef: z.string().min(1),
    requiredTools: z.array(z.string()),
    requiredPermissions: z.array(z.string()),
    instructionsRef: z.string().min(1),
    acceptanceCriteria: z.array(z.string()).min(1),
    evaluationCases: z.array(z.string()).min(1),
  })
  .strict();

export type SkillManifest = z.infer<typeof SkillManifestSchema>;

export const EvaluationRecordSchema = z.object({
  suiteId: z.string().min(1),
  agentId: z.string().min(1),
  passed: z.boolean(),
  metrics: z.object({
    taskCompletion: z.number().min(0).max(1),
    factualAccuracy: z.number().min(0).max(1),
    schemaValidity: z.number().min(0).max(1),
    uncertaintyHandling: z.number().min(0).max(1),
    permissionCompliance: z.number().min(0).max(1),
    safetyAndApproval: z.number().min(0).max(1),
    avgLatencyMs: z.number().nonnegative(),
    consistencyScore: z.number().min(0).max(1),
  }),
  evaluatedAt: z.string(),
});

export type EvaluationRecord = z.infer<typeof EvaluationRecordSchema>;

