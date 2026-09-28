/**
 * tool-helper.ts
 *
 * Resilience, error boundaries, rate-limit retries, and schema inspection utilities
 * for AWAS Mastra tools.
 */

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
    while (current && current._def) {
      const def = current._def;
      const type = def.typeName;

      if (def.description) {
        description = def.description;
      }

      if (type === 'ZodOptional' || type === 'ZodNullable') {
        required = false;
        current = def.innerType;
        continue;
      }

      if (type === 'ZodDefault') {
        required = false;
        defaultValue = typeof def.defaultValue === 'function' ? def.defaultValue() : def.defaultValue;
        current = def.innerType;
        continue;
      }

      if (type === 'ZodString') {
        typeName = 'string';
        break;
      } else if (type === 'ZodNumber') {
        typeName = 'number';
        break;
      } else if (type === 'ZodBoolean') {
        typeName = 'boolean';
        break;
      } else if (type === 'ZodEnum') {
        typeName = 'enum';
        options = def.values;
        break;
      } else if (type === 'ZodArray') {
        typeName = 'array';
        break;
      } else if (type === 'ZodRecord' || type === 'ZodObject') {
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
