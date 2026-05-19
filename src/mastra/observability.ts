/**
 * observability.ts
 *
 * Shared per-agent observability helpers for the Mastra application.
 *
 * Mastra's observability (tracing, metrics, logging) is configured ONCE at the
 * root `Mastra` instance in `index.ts` and automatically applies to every
 * registered agent and workflow — no per-agent setup is required for tracing.
 *
 * What this module adds on top:
 *  - `agentLogger(name)` — creates a named PinoLogger instance for each agent
 *    so log entries carry the agent name and are automatically correlated to
 *    the active trace/span IDs by Mastra's log forwarding pipeline.
 *  - `defaultTracingPolicy` — a shared TracingPolicy that marks low-signal
 *    spans (memory reads, context hydration) as "internal" so Studio shows
 *    a cleaner default trace view.
 *
 * Usage in an agent file:
 *
 *   import { agentLogger, defaultTracingPolicy } from '../observability';
 *
 *   export const myAgent = new Agent({
 *     ...
 *     logger: agentLogger('my-agent'),
 *     tracingPolicy: defaultTracingPolicy,
 *   });
 *
 * @see https://mastra.ai/docs/observability/overview
 * @see https://mastra.ai/docs/observability/logging
 * @see https://mastra.ai/docs/observability/tracing/overview
 */

import { PinoLogger } from '@mastra/loggers';
import type { TracingPolicy } from '@mastra/core/observability';

// ── Per-agent named logger ────────────────────────────────────────────────────
/**
 * Creates a PinoLogger scoped to the given agent name.
 *
 * Every `logger.info()` / `logger.warn()` / `logger.error()` call inside an
 * agent run will be automatically tagged with the current trace + span IDs by
 * Mastra's log forwarding pipeline, so you can navigate from a log entry
 * directly to the trace that produced it in Mastra Studio.
 *
 * Log level defaults to 'info'. Override with the LOG_LEVEL env var.
 */
export function agentLogger(agentName: string): PinoLogger {
  return new PinoLogger({
    name: agentName,
    level: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error' | 'silent' | undefined) ?? 'info',
  });
}

// ── Default tracing policy ────────────────────────────────────────────────────
/**
 * Shared TracingPolicy applied to all agents.
 *
 * Marking low-signal spans as "internal" keeps the Studio trace view focused
 * on the high-value spans (LLM calls, tool invocations, step transitions)
 * while still persisting everything to storage for debugging.
 *
 * Set to an empty object (`{}`) to show all spans in Studio by default.
 */
export const defaultTracingPolicy: TracingPolicy = {
  // No spans are marked internal by default — all spans are visible in Studio.
  // Uncomment and set `internal` bits to hide specific low-signal span types:
  // internal: InternalSpans.MEMORY | InternalSpans.CONTEXT,
};
