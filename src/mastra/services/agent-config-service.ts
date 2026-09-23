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
  defaultProvider: ((process.env.DEFAULT_PROVIDER || process.env.MODEL_PROVIDER || 'auto') as AgentGlobalConfig['defaultProvider']),
  groqModelId: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  geminiModelId: 'google/gemini-2.0-flash',
  lmStudioModelId: process.env.LM_STUDIO_MODEL || 'mistral-7b-instruct-v0.2',
  defaultTokenLimit: 100_000,
};

/**
 * Resolves the language model for an agent based on the global configuration
 * or an optional per-agent override.
 *
 * @param modelOverride  Optional explicit model string or provider prefix (e.g., 'groq:llama-3.3-70b-versatile', 'mistral-7b-instruct-v0.2', 'google/gemini-2.0-flash')
 *
 * @example
 *   model: () => resolveAgentModel()                                  // Uses global auto-resolution
 *   model: () => resolveAgentModel('groq:llama-3.1-8b-instant')       // Groq specific model
 *   model: () => resolveAgentModel('mistral-7b-instruct-v0.2')        // LM Studio specific model
 *   model: () => resolveAgentModel('google/gemini-2.0-flash')         // Gemini specific model
 */
export function resolveAgentModel(modelOverride?: string, context?: any) {
  if (modelOverride) {
    if (modelOverride.startsWith('groq:')) {
      return groqModel(modelOverride.replace(/^groq:/, ''));
    }
    if (modelOverride.startsWith('lm-studio:') || modelOverride.startsWith('lmstudio:')) {
      return lmStudioModel(modelOverride.replace(/^(lm-studio|lmstudio):/, ''));
    }
    if (modelOverride.includes('mistral') || modelOverride.includes('gemma') || modelOverride.includes('nemotron') || modelOverride.includes('llama')) {
      return lmStudioModel(modelOverride);
    }
    return modelOverride;
  }

  // Check dynamic requestContext if passed by Mastra agent execution
  const reqContext = context?.requestContext || (typeof context?.get === 'function' ? context : undefined);
  const contextProvider = (reqContext?.get?.('provider-id') as string | undefined)?.toLowerCase();
  const contextModel = reqContext?.get?.('model-id') as string | undefined;
  const contextBaseUrl = reqContext?.get?.('llm-base-url') as string | undefined;

  if (contextProvider === 'lm-studio' || contextProvider === 'lmstudio') {
    return lmStudioModel(contextModel || 'google/gemma-3-4b', contextBaseUrl);
  }
  if (contextProvider === 'groq' && contextModel) {
    return groqModel(contextModel);
  }
  if (contextProvider === 'gemini' && contextModel) {
    return contextModel;
  }

  const activeProvider = (
    process.env.DEFAULT_PROVIDER ||
    process.env.MODEL_PROVIDER ||
    (typeof GLOBAL_AGENT_CONFIG !== 'undefined' ? GLOBAL_AGENT_CONFIG?.defaultProvider : 'auto') ||
    'auto'
  ).toLowerCase();

  const lmStudioId =
    (typeof GLOBAL_AGENT_CONFIG !== 'undefined' && GLOBAL_AGENT_CONFIG?.lmStudioModelId) ||
    process.env.LM_STUDIO_MODEL ||
    'google/gemma-3-4b';
  const groqId =
    (typeof GLOBAL_AGENT_CONFIG !== 'undefined' && GLOBAL_AGENT_CONFIG?.groqModelId) ||
    process.env.GROQ_MODEL ||
    'llama-3.3-70b-versatile';
  const geminiId =
    (typeof GLOBAL_AGENT_CONFIG !== 'undefined' && GLOBAL_AGENT_CONFIG?.geminiModelId) ||
    'google/gemini-2.0-flash';

  // 1. Explicit LM Studio Provider mode
  if (activeProvider === 'lm-studio' || activeProvider === 'lmstudio') {
    return lmStudioModel(lmStudioId);
  }

  // 2. Explicit Groq Provider mode
  if (activeProvider === 'groq') {
    return groqModel(groqId);
  }

  // 3. Explicit Gemini / Google Provider mode
  if (activeProvider === 'gemini' || activeProvider === 'google') {
    return geminiId;
  }

  // 4. Auto mode: Google Gemini API key check
  const hasGoogleKey = Boolean(
    process.env.GOOGLE_GENERATIVE_AI_API_KEY &&
    process.env.GOOGLE_GENERATIVE_AI_API_KEY.trim() !== '' &&
    !process.env.GOOGLE_GENERATIVE_AI_API_KEY.includes('your_')
  );

  if (hasGoogleKey) {
    return geminiId;
  }

  // 5. Fallback: LM Studio local model
  return lmStudioModel(lmStudioId);
}
