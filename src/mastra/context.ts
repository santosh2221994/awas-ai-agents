import { z } from 'zod';

/**
 * Unified RequestContext Schema
 * 
 * This schema defines all possible metadata keys that can be injected
 * by the Mastra middleware or passed during workflow/agent invocation.
 * 
 * Unifying this schema resolves the 'Strict RequestContext generics mismatch'
 * error in index.ts and ensures type safety across all components.
 */
export const requestContextSchema = z.object({
  'user-id': z.string().optional(),
  'user-tier': z.string().optional(),
  'tenant-id': z.string().optional(),
  'workspace-id': z.string().optional(),
  'project-id': z.string().optional(),
  'granted-scopes': z.union([z.string(), z.array(z.string())]).optional(),
  'approval-ids': z.union([z.string(), z.array(z.string())]).optional(),
  'locale': z.string().optional(),
  'temperature-unit': z.enum(['celsius', 'fahrenheit']).optional(),
  'allow-commands': z.enum(['true', 'false']).optional(),
  'provider-id': z.string().optional(),
  'model-id': z.string().optional(),
  'llm-base-url': z.string().optional(),
  'execution-mode': z.enum(['cloud', 'local']).or(z.string()).optional(),
});

export type RequestContext = z.infer<typeof requestContextSchema>;

/**
 * Assigns a human-readable display name to a Mastra Workflow instance
 * (while preserving its canonical `id` for routing and run tracking) and commits it.
 */
export function commitNamedWorkflow<T extends { commit: () => unknown }>(
  workflow: T,
  displayName: string
): T {
  (workflow as unknown as { name: string }).name = displayName;
  workflow.commit();
  return workflow;
}

