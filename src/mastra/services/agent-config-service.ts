/**
 * services/agent-config-service.ts
 *
 * Centralized Service & Registry for Agent Configurations.
 *
 * Provides the Dual Execution Router (Cloud LLMs vs. Local LLMs)
 * supporting all 5 platform providers:
 * 1. LM Studio (Local OpenAI-compatible inference at http://127.0.0.1:1234)
 * 2. Ollama (Local open-weights daemon at http://127.0.0.1:11434)
 * 3. Groq Cloud (LPU ultra-fast inference)
 * 4. Google Gemini (Multimodal reasoning)
 * 5. OpenAI (GPT-4o standard cloud inference)
 */

import { groqModel } from '../providers/groq';
import { lmStudioModel } from '../providers/lm-studio';
import { ollamaModel } from '../providers/ollama';
import { openaiModel } from '../providers/openai';
import { geminiModel, hasGoogleCredentials } from '../providers/gemini';

export interface AgentGlobalConfig {
  /** Default provider mode: 'groq' | 'gemini' | 'lm-studio' | 'ollama' | 'openai' | 'auto' */
  defaultProvider: 'groq' | 'gemini' | 'lm-studio' | 'ollama' | 'openai' | 'auto';
  /** Default execution mode: 'cloud' | 'local' | 'auto' */
  defaultExecutionMode: 'cloud' | 'local' | 'auto';
  /** Default model ID for Groq provider */
  groqModelId: string;
  /** Default model ID for Google Gemini */
  geminiModelId: string;
  /** Default model ID for local LM Studio */
  lmStudioModelId: string;
  /** Default model ID for local Ollama */
  ollamaModelId: string;
  /** Default model ID for OpenAI */
  openaiModelId: string;
  /** Default context window token limit for LLM calls */
  defaultTokenLimit: number;
}

/** Global agent settings — edit this single object to change model defaults for all agents */
export const GLOBAL_AGENT_CONFIG: AgentGlobalConfig = {
  defaultProvider: ((process.env.DEFAULT_PROVIDER || process.env.MODEL_PROVIDER || 'auto') as AgentGlobalConfig['defaultProvider']),
  defaultExecutionMode: ((process.env.DEFAULT_EXECUTION_MODE || process.env.EXECUTION_MODE || 'auto') as AgentGlobalConfig['defaultExecutionMode']),
  groqModelId: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  geminiModelId: process.env.GEMINI_MODEL || 'google/gemini-2.0-flash',
  lmStudioModelId: process.env.LM_STUDIO_MODEL || 'google/gemma-3-4b',
  ollamaModelId: process.env.OLLAMA_MODEL || 'llama3.2',
  openaiModelId: process.env.OPENAI_MODEL || 'gpt-4o',
  defaultTokenLimit: 100_000,
};

/**
 * Resolves the language model for an agent based on incoming requestContext,
 * execution mode ('cloud' vs 'local'), user subscription tier, and provider configuration.
 *
 * Routing Strategy:
 * 1. Request-level provider overrides (`provider-id`, `model-id`, `llm-base-url`)
 * 2. Request-level execution mode (`x-execution-mode: 'cloud' | 'local'`)
 * 3. Prefix-based model overrides (`groq:`, `lm-studio:`, `ollama:`, `openai:`, `gemini:`)
 * 4. User tier routing (Enterprise -> Gemma 12B/Gemini 2.0, Pro -> Gemma 4B, Free -> Auto)
 * 5. Global environment provider and fallback chain
 */
export function resolveAgentModel(modelOverride?: string, context?: any): any {
  // Extract requestContext safely (handles Map, Record, or RequestContext wrapper)
  const reqContext = context?.requestContext || (typeof context?.get === 'function' ? context : (context?.context || context));
  const getCtxField = (key: string): string | undefined => {
    if (!reqContext) return undefined;
    if (typeof reqContext.get === 'function') {
      try {
        const val = reqContext.get(key);
        if (val !== undefined && val !== null) return String(val);
      } catch {}
    }
    if (reqContext[key] !== undefined && reqContext[key] !== null) {
      return String(reqContext[key]);
    }
    return undefined;
  };

  const contextProvider = getCtxField('provider-id')?.toLowerCase();
  const contextModel = getCtxField('model-id');
  const contextBaseUrl = getCtxField('llm-base-url');
  const contextExecutionMode = getCtxField('execution-mode')?.toLowerCase();
  const contextTier = getCtxField('user-tier')?.toLowerCase();

  // ── 1. Explicit Provider in Request Context ──────────────────────────────────
  if (contextProvider) {
    if (contextProvider === 'lm-studio' || contextProvider === 'lmstudio') {
      return lmStudioModel(contextModel || modelOverride || GLOBAL_AGENT_CONFIG.lmStudioModelId, contextBaseUrl);
    }
    if (contextProvider === 'ollama') {
      return ollamaModel(contextModel || modelOverride || GLOBAL_AGENT_CONFIG.ollamaModelId, contextBaseUrl);
    }
    if (contextProvider === 'groq') {
      return groqModel(contextModel || modelOverride || GLOBAL_AGENT_CONFIG.groqModelId);
    }
    if (contextProvider === 'gemini' || contextProvider === 'google') {
      return geminiModel(contextModel || modelOverride || GLOBAL_AGENT_CONFIG.geminiModelId);
    }
    if (contextProvider === 'openai') {
      return openaiModel(contextModel || modelOverride || GLOBAL_AGENT_CONFIG.openaiModelId, undefined, contextBaseUrl);
    }
  }

  // ── 2. Explicit Dual Execution Mode ('cloud' vs 'local') ─────────────────────
  if (contextExecutionMode === 'local') {
    // Zero-data-leak local inference
    if (contextModel?.includes('ollama') || modelOverride?.startsWith('ollama:')) {
      return ollamaModel(contextModel || modelOverride?.replace(/^ollama:/, ''), contextBaseUrl);
    }
    const localModelId = contextModel || modelOverride || (
      contextTier === 'enterprise' ? 'google/gemma-4-12b-qat' : GLOBAL_AGENT_CONFIG.lmStudioModelId
    );
    return lmStudioModel(localModelId, contextBaseUrl);
  }

  if (contextExecutionMode === 'cloud') {
    // Cloud inference
    if (contextModel?.startsWith('groq:') || modelOverride?.startsWith('groq:')) {
      return groqModel(contextModel?.replace(/^groq:/, '') || modelOverride?.replace(/^groq:/, ''));
    }
    if (contextModel?.startsWith('openai:') || modelOverride?.startsWith('openai:')) {
      return openaiModel(contextModel?.replace(/^openai:/, '') || modelOverride?.replace(/^openai:/, ''));
    }
    if (contextModel?.startsWith('google/gemini') || contextModel?.startsWith('gemini')) {
      return geminiModel(contextModel);
    }
    if (hasGoogleCredentials()) {
      return geminiModel(contextModel || modelOverride || GLOBAL_AGENT_CONFIG.geminiModelId);
    }
    if (process.env.GROQ_API_KEY) {
      return groqModel(contextModel || modelOverride || GLOBAL_AGENT_CONFIG.groqModelId);
    }
    if (process.env.OPENAI_API_KEY) {
      return openaiModel(contextModel || modelOverride || GLOBAL_AGENT_CONFIG.openaiModelId);
    }
    return geminiModel(contextModel || modelOverride || GLOBAL_AGENT_CONFIG.geminiModelId);
  }

  // ── 3. Explicit Model in Request Context or Model Prefix Override ────────────
  const effectiveModel = contextModel || modelOverride;
  if (effectiveModel) {
    if (effectiveModel.startsWith('groq:')) {
      return groqModel(effectiveModel.replace(/^groq:/, ''));
    }
    if (effectiveModel.startsWith('lm-studio:') || effectiveModel.startsWith('lmstudio:')) {
      return lmStudioModel(effectiveModel.replace(/^(lm-studio|lmstudio):/, ''), contextBaseUrl);
    }
    if (effectiveModel.startsWith('ollama:')) {
      return ollamaModel(effectiveModel.replace(/^ollama:/, ''), contextBaseUrl);
    }
    if (effectiveModel.startsWith('openai:')) {
      return openaiModel(effectiveModel.replace(/^openai:/, ''));
    }
    if (effectiveModel.startsWith('gemini:') || effectiveModel.startsWith('google:')) {
      return geminiModel(effectiveModel.replace(/^(gemini|google):/, ''));
    }
    if (effectiveModel.startsWith('google/gemini')) {
      return geminiModel(effectiveModel);
    }
    if (effectiveModel.includes('mistral') || effectiveModel.includes('gemma') || effectiveModel.includes('nemotron') || effectiveModel.includes('qwen') || effectiveModel.includes('glm')) {
      return lmStudioModel(effectiveModel, contextBaseUrl);
    }
    return effectiveModel;
  }

  // ── 4. User Tier Based Routing ───────────────────────────────────────────────
  if (contextTier === 'enterprise') {
    if (hasGoogleCredentials()) {
      return geminiModel('google/gemini-2.0-flash');
    }
    return lmStudioModel('google/gemma-4-12b-qat');
  }

  // ── 5. Global Provider Preference / Auto Detection ───────────────────────────
  const activeProvider = (
    process.env.DEFAULT_PROVIDER ||
    process.env.MODEL_PROVIDER ||
    GLOBAL_AGENT_CONFIG.defaultProvider ||
    'auto'
  ).toLowerCase();

  if (activeProvider === 'lm-studio' || activeProvider === 'lmstudio') {
    return lmStudioModel(GLOBAL_AGENT_CONFIG.lmStudioModelId);
  }
  if (activeProvider === 'ollama') {
    return ollamaModel(GLOBAL_AGENT_CONFIG.ollamaModelId);
  }
  if (activeProvider === 'groq') {
    return groqModel(GLOBAL_AGENT_CONFIG.groqModelId);
  }
  if (activeProvider === 'gemini' || activeProvider === 'google') {
    return geminiModel(GLOBAL_AGENT_CONFIG.geminiModelId);
  }
  if (activeProvider === 'openai') {
    return openaiModel(GLOBAL_AGENT_CONFIG.openaiModelId);
  }

  // Auto mode fallback: Google Gemini if credentials exist, else local LM Studio
  if (hasGoogleCredentials()) {
    return geminiModel(GLOBAL_AGENT_CONFIG.geminiModelId);
  }

  return lmStudioModel(GLOBAL_AGENT_CONFIG.lmStudioModelId);
}
