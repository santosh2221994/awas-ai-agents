/**
 * tool-helper.ts
 *
 * Resilience, error boundaries, rate-limit retries, permission enforcement,
 * parameter-bound approval gates, idempotency, and schema inspection utilities
 * for AWAS Platform tools.
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  resolvePrincipalPermissions,
  assertRequiredScopes,
  PermissionDeniedError,
} from '../services/permission-service';
import {
  verifyOrRequestApproval,
  recordApprovalExecutionOutcome,
  ApprovalRequiredError,
  canonicalizeValue,
} from '../services/approval-service';

export type ToolActionClassification = 'read-only' | 'reversible' | 'consequential';

export interface GovernedToolSpec<
  TInputSchema extends z.ZodTypeAny = z.ZodTypeAny,
  TOutputSchema extends z.ZodTypeAny = z.ZodTypeAny,
> {
  id: string;
  description: string;
  inputSchema: TInputSchema;
  outputSchema: TOutputSchema;
  requiredScopes: string[];
  actionClassification: ToolActionClassification;
  timeoutMs?: number;
  retryPolicy?: RetryOptions;
  idempotentWrite?: boolean;
  execute: (
    input: z.infer<TInputSchema>,
    context: {
      userId: string;
      workspaceId: string;
      projectId?: string;
      grantedScopes: string[];
      approvalIds: string[];
      rawContext?: any;
    }
  ) => Promise<z.infer<TOutputSchema>>;
}

export interface ToolAuditEntry {
  auditId: string;
  toolId: string;
  actionClassification: ToolActionClassification;
  userId: string;
  workspaceId: string;
  requiredScopes: string[];
  approvalId?: string;
  idempotencyHit: boolean;
  status: 'success' | 'permission_denied' | 'approval_required' | 'failed';
  latencyMs: number;
  timestamp: string;
  errorCode?: string;
}

const MAX_AUDIT_ENTRIES = 1000;
const MAX_IDEMPOTENCY_ENTRIES = 1000;
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000; // 10 minutes
const toolAuditLog: ToolAuditEntry[] = [];
const idempotencyStore = new Map<string, { result: any; timestamp: number }>();

function pushAuditEntry(entry: Omit<ToolAuditEntry, 'auditId' | 'timestamp'>): void {
  if (toolAuditLog.length >= MAX_AUDIT_ENTRIES) {
    toolAuditLog.splice(0, 100);
  }
  toolAuditLog.push({
    ...entry,
    auditId: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
  });
}

export function getToolAuditLog(): ToolAuditEntry[] {
  return [...toolAuditLog];
}

export function clearToolAuditLog(): void {
  toolAuditLog.length = 0;
  idempotencyStore.clear();
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs = 15_000, toolId = 'tool'): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Execution timed out after ${timeoutMs}ms in '${toolId}'`)),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Creates a deterministic, permission-aware, approval-gated Mastra tool with
 * Zod input/output validation, bounded timeout, retries, idempotency, and audit logging.
 */
export function createGovernedTool<
  TInputSchema extends z.ZodTypeAny,
  TOutputSchema extends z.ZodTypeAny,
>(spec: GovernedToolSpec<TInputSchema, TOutputSchema>) {
  const governedExecute = async (rawInput: any, rawContext?: any): Promise<z.infer<TOutputSchema>> => {
      const startTime = Date.now();
      const inputPayload =
        rawInput && typeof rawInput === 'object' && 'context' in rawInput && Object.keys(rawInput).length === 1
          ? rawInput.context
          : rawInput;

      // 1. Resolve permissions from trusted execution context (never from rawInput)
      const principal = resolvePrincipalPermissions(rawContext);

      // 2. Enforce required permission scopes
      try {
        assertRequiredScopes(principal, spec.requiredScopes, spec.id);
      } catch (err) {
        if (err instanceof PermissionDeniedError) {
          pushAuditEntry({
            toolId: spec.id,
            actionClassification: spec.actionClassification,
            userId: principal.userId,
            workspaceId: principal.workspaceId,
            requiredScopes: spec.requiredScopes,
            idempotencyHit: false,
            status: 'permission_denied',
            latencyMs: Date.now() - startTime,
            errorCode: err.code,
          });
        }
        throw err;
      }

      // 3. Validate input with Zod
      const validatedInput = spec.inputSchema.parse(inputPayload ?? {});

      // 4. Enforce human approval gate for consequential actions
      let verifiedApprovalId: string | undefined;
      if (spec.actionClassification === 'consequential') {
        try {
          const approvalRecord = verifyOrRequestApproval({
            requesterId: principal.userId,
            workspaceId: principal.workspaceId,
            action: spec.id,
            toolId: spec.id,
            parameters: validatedInput as Record<string, any>,
            suppliedApprovalIds: principal.approvalIds,
          });
          verifiedApprovalId = approvalRecord.approvalId;
        } catch (err) {
          if (err instanceof ApprovalRequiredError) {
            pushAuditEntry({
              toolId: spec.id,
              actionClassification: spec.actionClassification,
              userId: principal.userId,
              workspaceId: principal.workspaceId,
              requiredScopes: spec.requiredScopes,
              approvalId: err.approvalId,
              idempotencyHit: false,
              status: 'approval_required',
              latencyMs: Date.now() - startTime,
              errorCode: err.code,
            });
          }
          throw err;
        }
      }

      // 5. Idempotency check for write operations
      const isWrite = spec.actionClassification !== 'read-only' && (spec.idempotentWrite ?? true);
      const idempotencyKey = isWrite
        ? `${spec.id}::${principal.userId}::${principal.workspaceId}::${JSON.stringify(canonicalizeValue(validatedInput))}`
        : undefined;

      if (idempotencyKey && idempotencyStore.has(idempotencyKey)) {
        const cached = idempotencyStore.get(idempotencyKey)!;
        if (Date.now() - cached.timestamp < IDEMPOTENCY_TTL_MS) {
          pushAuditEntry({
            toolId: spec.id,
            actionClassification: spec.actionClassification,
            userId: principal.userId,
            workspaceId: principal.workspaceId,
            requiredScopes: spec.requiredScopes,
            approvalId: verifiedApprovalId,
            idempotencyHit: true,
            status: 'success',
            latencyMs: Date.now() - startTime,
          });
          return cached.result;
        }
        idempotencyStore.delete(idempotencyKey);
      }

      // 6. Execute with bounded timeout and retry policy
      try {
        const rawOutput = await withRetry(
          () =>
            withTimeout(
              spec.execute(validatedInput, {
                userId: principal.userId,
                workspaceId: principal.workspaceId,
                projectId: principal.projectId,
                grantedScopes: principal.grantedScopes,
                approvalIds: principal.approvalIds,
                rawContext,
              }),
              spec.timeoutMs ?? 15_000,
              spec.id
            ),
          spec.retryPolicy ?? { maxRetries: 2, initialDelayMs: 150 }
        );

        const validatedOutput = spec.outputSchema.parse(rawOutput);

        if (idempotencyKey) {
          if (idempotencyStore.size >= MAX_IDEMPOTENCY_ENTRIES) {
            const oldestKey = idempotencyStore.keys().next().value;
            if (oldestKey !== undefined) idempotencyStore.delete(oldestKey);
          }
          idempotencyStore.set(idempotencyKey, {
            result: validatedOutput,
            timestamp: Date.now(),
          });
        }

        if (verifiedApprovalId) {
          recordApprovalExecutionOutcome(verifiedApprovalId, {
            status: 'success',
            summary: `Executed '${spec.id}' successfully`,
          });
        }

        pushAuditEntry({
          toolId: spec.id,
          actionClassification: spec.actionClassification,
          userId: principal.userId,
          workspaceId: principal.workspaceId,
          requiredScopes: spec.requiredScopes,
          approvalId: verifiedApprovalId,
          idempotencyHit: false,
          status: 'success',
          latencyMs: Date.now() - startTime,
        });

        return validatedOutput;
      } catch (err: any) {
        if (verifiedApprovalId) {
          recordApprovalExecutionOutcome(verifiedApprovalId, {
            status: 'failed',
            summary: err?.message || 'Execution failed',
          });
        }
        pushAuditEntry({
          toolId: spec.id,
          actionClassification: spec.actionClassification,
          userId: principal.userId,
          workspaceId: principal.workspaceId,
          requiredScopes: spec.requiredScopes,
          approvalId: verifiedApprovalId,
          idempotencyHit: false,
          status: 'failed',
          latencyMs: Date.now() - startTime,
          errorCode: err?.code || 'TOOL_EXECUTION_ERROR',
        });
        throw err;
      }
  };

  const baseTool = createTool({
    id: spec.id,
    description: spec.description,
    inputSchema: spec.inputSchema as any,
    outputSchema: spec.outputSchema as any,
    execute: governedExecute as any,
  });

  // Attach governance metadata and unstripped execute wrapper directly onto the tool instance
  return Object.assign(baseTool, {
    execute: governedExecute,
    requiredScopes: spec.requiredScopes,
    actionClassification: spec.actionClassification,
    idempotentWrite: spec.idempotentWrite ?? spec.actionClassification !== 'read-only',
    timeoutMs: spec.timeoutMs ?? 15_000,
  });
}

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  backoffFactor?: number;
  shouldRetry?: (error: any) => boolean;
}

/**
 * Executes an async operation with exponential backoff and rate-limit handling.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const initialDelay = options.initialDelayMs ?? 400;
  const backoff = options.backoffFactor ?? 2;
  const shouldRetry =
    options.shouldRetry ??
    ((err: any) => {
      const msg = String(err?.message || err);
      const status = err?.status || err?.statusCode;
      // Retry on 429 (rate limit), 500, 502, 503, 504, or network timeouts
      if (status === 429 || (status >= 500 && status <= 504)) return true;
      if (
        msg.includes('429') ||
        msg.includes('rate limit') ||
        msg.includes('timeout') ||
        msg.includes('ECONNRESET') ||
        msg.includes('ETIMEDOUT')
      ) {
        return true;
      }
      return false;
    });

  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (attempt >= maxRetries || !shouldRetry(err)) {
        throw err;
      }
      const jitter = Math.random() * 100;
      const delay = initialDelay * Math.pow(backoff, attempt) + jitter;
      console.warn(`[tool-helper] Rate limit / transient error on attempt ${attempt + 1}. Retrying in ${Math.round(delay)}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

/**
 * Wraps tool execution with an error boundary to prevent unhandled rejections
 * from crashing agent execution loops.
 */
export function withErrorBoundary<TInput, TOutput>(
  toolName: string,
  executeFn: (input: TInput, context?: any) => Promise<TOutput>,
  fallbackValue?: Partial<TOutput>
) {
  return async (input: TInput, context?: any): Promise<TOutput | any> => {
    try {
      return await executeFn(input, context);
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      console.error(`[ErrorBoundary] Tool '${toolName}' failed:`, errorMessage);

      if (fallbackValue !== undefined) {
        return {
          ...fallbackValue,
          _error: errorMessage,
          _failed: true,
        };
      }

      return {
        error: `Tool execution failed: ${errorMessage}`,
        tool: toolName,
        success: false,
        timestamp: new Date().toISOString(),
      };
    }
  };
}

/**
 * Introspects a Zod schema to produce user-friendly JSON parameter definitions
 * for the UI Schema Viewer and Sandbox forms.
 */
export function extractZodSchemaInfo(schema: any): Array<{
  name: string;
  type: string;
  description: string;
  required: boolean;
  defaultValue?: any;
  options?: string[];
}> {
  if (!schema) return [];

  // Check if it's a ZodObject
  const shape = schema.shape || schema._def?.shape?.() || schema._def?.shape;
  if (!shape || typeof shape !== 'object') {
    return [];
  }

  const result: Array<{
    name: string;
    type: string;
    description: string;
    required: boolean;
    defaultValue?: any;
    options?: string[];
  }> = [];

  for (const [key, fieldDef] of Object.entries(shape as Record<string, any>)) {
    let current = fieldDef;
    let required = true;
    let defaultValue: any = undefined;
    let description = '';
    let typeName = 'string';
    let options: string[] | undefined = undefined;

    // Traverse wrapped defs (ZodOptional, ZodDefault, ZodEffects, etc.)
    while (current) {
      const def = current._def || current.def || {};
      const type = (def.typeName || def.type || current.type || '').toLowerCase();

      if (def.description || current.description) {
        description = def.description || current.description;
      }

      if (type === 'zodoptional' || type === 'optional' || type === 'zodnullable' || type === 'nullable') {
        required = false;
        current = def.innerType || current.innerType;
        continue;
      }

      if (type === 'zoddefault' || type === 'default') {
        required = false;
        defaultValue = typeof def.defaultValue === 'function' ? def.defaultValue() : (def.defaultValue ?? current.defaultValue);
        current = def.innerType || current.innerType;
        continue;
      }

      if (type === 'zodeffects' || type === 'effects' || type === 'zodpipeline' || type === 'pipeline') {
        current = def.schema || def.innerType || current.innerType;
        continue;
      }

      if (type === 'zodstring' || type === 'string') {
        typeName = 'string';
        break;
      } else if (type === 'zodnumber' || type === 'number') {
        typeName = 'number';
        break;
      } else if (type === 'zodboolean' || type === 'boolean') {
        typeName = 'boolean';
        break;
      } else if (type === 'zodenum' || type === 'enum') {
        typeName = 'enum';
        options = def.values || current.options || (def.entries ? Object.keys(def.entries) : undefined);
        break;
      } else if (type === 'zodarray' || type === 'array') {
        typeName = 'array';
        break;
      } else if (type === 'zodrecord' || type === 'record' || type === 'zodobject' || type === 'object') {
        typeName = 'object';
        break;
      }

      break;
    }

    result.push({
      name: key,
      type: typeName,
      description: description || `Parameter ${key}`,
      required,
      defaultValue,
      options,
    });
  }

  return result;
}
