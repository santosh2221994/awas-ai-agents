/**
 * providers/lm-studio.ts
 *
 * Returns an OpenAI-compatible language model pointed at the local LM Studio
 * server (http://localhost:1234/v1).
 *
 * WHY: The AI SDK's built-in `openai/*` model strings now default to the
 * OpenAI Responses API, which LM Studio does NOT support. Using `createOpenAI`
 * with `compatibility: 'compatible'` forces the standard Chat Completions
 * endpoint (/v1/chat/completions) which LM Studio understands.
 */

import { createOpenAI } from '@ai-sdk/openai';

/** Base URL for the local LM Studio server. Override via env var if needed. */
const LM_STUDIO_BASE_URL =
  process.env.LM_STUDIO_BASE_URL ?? process.env.LMSTUDIO_BASE_URL ?? 'http://localhost:1234/v1';

/**
 * LM Studio OpenAI-compatible provider.
 * Uses Chat Completions API (not Responses API).
 */
export const lmStudio = createOpenAI({
  // LM Studio doesn't require a real API key, but the field must be non-empty.
  apiKey: process.env.LM_STUDIO_API_KEY ?? 'lm-studio',
  baseURL: LM_STUDIO_BASE_URL,
  // 'compatible' forces /v1/chat/completions — LM Studio doesn't support the Responses API.
  // `as any` needed: @ai-sdk/openai v3.x types omit `compatibility` in OpenAIProviderSettings.
  compatibility: 'compatible',
} as any);

/**
 * Returns a LanguageModelV1 for the given LM Studio model ID.
 *
 * @param modelId  The model ID as shown in LM Studio (e.g. 'gemma-3-4b-it').
 *                 Defaults to the LM_STUDIO_MODEL env var or 'gemma-3-4b-it'.
 *
 * @example
 *   model: lmStudioModel()                    // uses env default
 *   model: lmStudioModel('qwen2.5-7b-instruct')
 */
export function lmStudioModel(modelId?: string) {
  const id =
    modelId ??
    process.env.LM_STUDIO_MODEL ??
    'google/gemma-3-4b';
  return lmStudio.chat(id);
}
