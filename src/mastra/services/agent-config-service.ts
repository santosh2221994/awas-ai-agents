/**
 * services/agent-config-service.ts
 *
 * Centralized Service & Registry for Agent Configurations.
 *
 * All model selections, provider routing, tool mappings, processors, and token
 * limits are managed in this single file. Changing a model or provider here
 * automatically updates the behavior across all registered Mastra agents.
 */

import { groqModel } from '../providers/groq';
import { lmStudioModel } from '../providers/lm-studio';
import { TokenLimiter, ToolCallFilter, EnsureFinalResponseProcessor, UsageTrackerProcessor } from '../processors';
import { genericCompletenessScorer, answerRelevanceScorer, toxicityScorer } from '../scorers/agent-scorers';

export interface AgentGlobalConfig {
  /** Default provider mode: 'groq' | 'gemini' | 'lm-studio' | 'auto' */
  defaultProvider: 'groq' | 'gemini' | 'lm-studio' | 'auto';
  /** Default model ID for Groq provider */
  groqModelId: string;
  /** Default model ID for Google Gemini */
  geminiModelId: string;
  /** Default model ID for local LM Studio */
  lmStudioModelId: string;
  /** Default context window token limit for LLM calls */
  defaultTokenLimit: number;
}

/** Global agent settings — edit this single object to change model defaults for all agents */
export const GLOBAL_AGENT_CONFIG: AgentGlobalConfig = {
  defaultProvider: 'auto',
  groqModelId: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  geminiModelId: 'google/gemini-2.0-flash',
  lmStudioModelId: process.env.LM_STUDIO_MODEL || 'google/gemma-3-4b',
  defaultTokenLimit: 100_000,
};

/**
 * Resolves the language model for an agent based on the global configuration
 * or an optional per-agent override.
 *
 * @param modelOverride  Optional explicit model string or provider prefix (e.g., 'groq:llama-3.3-70b-versatile', 'google/gemini-2.0-flash')
 *
 * @example
 *   model: () => resolveAgentModel()                                  // Uses global auto-resolution
 *   model: () => resolveAgentModel('groq:llama-3.1-8b-instant')       // Groq specific model
 *   model: () => resolveAgentModel('google/gemini-2.0-flash')         // Gemini specific model
 */
export function resolveAgentModel(modelOverride?: string) {
  if (modelOverride) {
    if (modelOverride.startsWith('groq:')) {
      return groqModel(modelOverride.replace('groq:', ''));
    }
    if (modelOverride.startsWith('lm-studio:')) {
      return lmStudioModel(modelOverride.replace('lm-studio:', ''));
    }
    return modelOverride;
  }

  // 1. If Groq API Key is present, route to Groq with tool-calling supported model
  if (process.env.GROQ_API_KEY) {
    return groqModel(GLOBAL_AGENT_CONFIG.groqModelId);
  }

  // 2. If Google API Key or AI Gateway Key is present, route to Gemini
  const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const gatewayKey = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_AI_GATEWAY_API_KEY;
  if ((googleKey && googleKey !== 'your-google-api-key') || gatewayKey) {
    return GLOBAL_AGENT_CONFIG.geminiModelId;
  }

  // 3. Fallback to local LM Studio / Ollama
  return lmStudioModel(GLOBAL_AGENT_CONFIG.lmStudioModelId);
}

/**
 * Returns standard processor pipeline for agents.
 */
export function getAgentProcessors(maxSteps = 10, tokenLimit?: number) {
  const limit = tokenLimit ?? (process.env.GROQ_API_KEY ? 100_000 : parseInt(process.env.LM_STUDIO_CTX ?? '6000', 10));
  return {
    inputProcessors: [
      new ToolCallFilter(),
      new TokenLimiter(limit),
      new EnsureFinalResponseProcessor(maxSteps),
    ],
    outputProcessors: [
      new UsageTrackerProcessor(),
    ],
  };
}

/**
 * Returns central scorer registry configuration for Mastra agents.
 */
export function getAgentScorers(sampleRate = 0.5) {
  return {
    completeness: {
      scorer: genericCompletenessScorer,
      sampling: { type: 'ratio' as const, rate: sampleRate },
    },
    answerRelevance: {
      scorer: answerRelevanceScorer,
      sampling: { type: 'ratio' as const, rate: sampleRate },
    },
    toxicity: {
      scorer: toxicityScorer,
      sampling: { type: 'ratio' as const, rate: sampleRate },
    },
  };
}
