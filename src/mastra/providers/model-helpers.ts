/**
 * providers/model-helpers.ts
 *
 * Shared helpers for model selection, token limits, locale instructions,
 * and scorer configuration.
 *
 * Centralising these prevents copy-paste drift across agent files and makes
 * it easy to change the Google key check or default model in one place.
 */

import { lmStudioModel } from './lm-studio';
import { groqModel } from './groq';
import { resolveAgentModel, GLOBAL_AGENT_CONFIG } from '../services/agent-config-service';

export { resolveAgentModel, GLOBAL_AGENT_CONFIG };

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum agentic steps for deep/multi-step search agents. */
export const DEEP_SEARCH_MAX_STEPS = 10;

// ── Model selection ───────────────────────────────────────────────────────────

/**
 * Returns a fallback model when Google AI API key is missing.
 * Delegated to central resolveAgentModel().
 */
export function getFallbackModel(modelId?: string) {
  return resolveAgentModel(modelId ? (modelId.includes(':') ? modelId : `groq:${modelId}`) : undefined);
}

/**
 * Returns the default production model string when a Google API key is set,
 * or Groq / local LM Studio model when the key is missing/placeholder.
 * Delegated to central resolveAgentModel().
 *
 * @param modelId  Optional model ID override.
 *
 * @example
 *   model: () => getDefaultModel()
 *   model: () => getDefaultModel('llama-3.3-70b-versatile')
 */
export function getDefaultModel(modelId?: string): string | ReturnType<typeof lmStudioModel> | ReturnType<typeof groqModel> {
  return resolveAgentModel(modelId);
}

// ── Token limits ──────────────────────────────────────────────────────────────

/**
 * Returns the appropriate token limit for the current environment:
 *  - Google Gemini Flash / AI Gateway → 100 000 tokens
 *  - Local LM Studio                 → LM_STUDIO_CTX env var, defaulting to 6 000
 *
 * @example
 *   new TokenLimiter(getTokenLimit())
 */
export function getTokenLimit(): number {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const gatewayKey = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_AI_GATEWAY_API_KEY;
  const isLocal = (!key || key === 'your-google-api-key') && !gatewayKey;
  return isLocal
    ? parseInt(process.env.LM_STUDIO_CTX ?? '6000', 10)
    : 100_000;
}

// ── Locale instructions ───────────────────────────────────────────────────────

/**
 * Maps a BCP-47 locale prefix to a language instruction string.
 * Returns an empty string for English or unknown locales.
 *
 * @example
 *   localeInstruction('ja')  // '\n\nLocale instruction: Write all responses in Japanese (日本語).'
 *   localeInstruction('en')  // ''
 *   localeInstruction(undefined) // ''
 */
export function localeInstruction(locale: string | undefined): string {
  if (!locale || locale.startsWith('en')) return '';
  const map: Record<string, string> = {
    ja: 'Write all responses in Japanese (日本語).',
    de: 'Write all responses in German (Deutsch).',
    fr: 'Write all responses in French (Français).',
    es: 'Write all responses in Spanish (Español).',
    zh: 'Write all responses in Simplified Chinese (中文).',
    ko: 'Write all responses in Korean (한국어).',
    pt: 'Write all responses in Portuguese (Português).',
  };
  const tag = locale.slice(0, 2);
  return tag in map ? `\n\nLocale instruction: ${map[tag]}` : '';
}

// ── Default scorer configurations ─────────────────────────────────────────────
// NOTE: import placed here (after top-level exports) to avoid circular-ref
// issues if agent-scorers.ts ever imports from model-helpers.ts in future.

import { genericCompletenessScorer, answerRelevanceScorer, toxicityScorer } from '../scorers/agent-scorers';

/**
 * Standard scorer config for most agents.
 * Samples 50% of runs to balance eval coverage against LLM cost.
 *
 * Enables the Evaluate + Review tabs in Mastra Studio.
 *
 * @example
 *   scorers: defaultScorerConfig()
 */
export function defaultScorerConfig() {
  return {
    completeness: {
      scorer: genericCompletenessScorer,
      sampling: { type: 'ratio' as const, rate: 0.5 },
    },
    answerRelevance: {
      scorer: answerRelevanceScorer,
      sampling: { type: 'ratio' as const, rate: 0.5 },
    },
    toxicity: {
      scorer: toxicityScorer,
      sampling: { type: 'ratio' as const, rate: 0.5 },
    },
  };
}

/**
 * Lighter scorer config for heavy tool-use agents (browser, mcp, github-pr,
 * deep-search) where each run is expensive.
 * Samples 20% of runs.
 *
 * @example
 *   scorers: lightScorerConfig()
 */
export function lightScorerConfig() {
  return {
    completeness: {
      scorer: genericCompletenessScorer,
      sampling: { type: 'ratio' as const, rate: 0.2 },
    },
    answerRelevance: {
      scorer: answerRelevanceScorer,
      sampling: { type: 'ratio' as const, rate: 0.2 },
    },
    toxicity: {
      scorer: toxicityScorer,
      sampling: { type: 'ratio' as const, rate: 0.2 },
    },
  };
}
