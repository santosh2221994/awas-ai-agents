/**
 * processors/index.ts
 *
 * Barrel export for all processors — custom and re-exported built-ins.
 *
 * Built-in processors (from @mastra/core/processors):
 *   TokenLimiter            — trim old messages to stay within context window
 *   ToolCallFilter          — hide verbose tool calls from LLM history
 *   UnicodeNormalizer       — normalize Unicode before sending to LLM
 *   PromptInjectionDetector — detect/block jailbreak attempts (LLM-powered)
 *   PIIDetector             — detect/redact PII categories (LLM-powered)
 *   ModerationProcessor     — content moderation (LLM-powered)
 *   PrefillErrorHandler     — auto-handles Anthropic prefill errors
 *
 * Custom processors (this project):
 *   EnsureFinalResponseProcessor — prevents empty responses at maxSteps limit
 *   UsageTrackerProcessor        — logs token usage after each LLM call
 *   RegexPIIRedactor             — fast regex-based PII redaction (no LLM needed)
 */

// ── Built-in re-exports ───────────────────────────────────────────────────────
export {
  TokenLimiter,
  TokenLimiterProcessor,
  ToolCallFilter,
  UnicodeNormalizer,
  PromptInjectionDetector,
  PIIDetector,
  ModerationProcessor,
  PrefillErrorHandler,
} from '@mastra/core/processors';

// ── Custom processors ─────────────────────────────────────────────────────────
export { EnsureFinalResponseProcessor } from './ensure-final-response';
export { UsageTrackerProcessor } from './usage-tracker';
export { RegexPIIRedactor } from './regex-pii-redactor';
export type { RegexPIIRedactorOptions } from './regex-pii-redactor';
