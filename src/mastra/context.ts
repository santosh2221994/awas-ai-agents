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
  'locale': z.string().optional(),
  'temperature-unit': z.enum(['celsius', 'fahrenheit']).optional(),
  'allow-commands': z.enum(['true', 'false']).optional(),
});

export type RequestContext = z.infer<typeof requestContextSchema>;
