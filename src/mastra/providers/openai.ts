/**
 * providers/openai.ts
 *
 * Dedicated OpenAI cloud provider client.
 * Connects to OpenAI official API (or Azure / OpenAI-compatible proxies).
 *
 * Default model: gpt-4o
 */

import { createOpenAI } from '@ai-sdk/openai';

const DEFAULT_OPENAI_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

const openaiProviderCache = new Map<string, any>();

/**
 * Returns an OpenAI provider instance.
 */
export function getOpenAIProvider(apiKey?: string, customBaseUrl?: string) {
  const finalKey = apiKey || process.env.OPENAI_API_KEY || '';
  const finalUrl = (customBaseUrl || DEFAULT_OPENAI_URL).replace(/\/+$/, '');
  const cacheKey = `${finalKey}:${finalUrl}`;

  if (openaiProviderCache.has(cacheKey)) {
    return openaiProviderCache.get(cacheKey);
  }

  const provider = createOpenAI({
    apiKey: finalKey,
    baseURL: finalUrl,
    compatibility: 'strict',
  } as any);

  openaiProviderCache.set(cacheKey, provider);
  return provider;
}

export const openai = getOpenAIProvider();

/**
 * Returns a LanguageModelV1 for OpenAI.
 *
 * @param modelId Defaults to 'gpt-4o' or OPENAI_MODEL env var.
 * @param apiKey  Optional custom API key.
 * @param baseUrl Optional custom base URL.
 */
export function openaiModel(modelId?: string, apiKey?: string, baseUrl?: string) {
  const id =
    modelId?.replace(/^openai:/, '') ??
    process.env.OPENAI_MODEL ??
    'gpt-4o';
  const provider = getOpenAIProvider(apiKey, baseUrl);
  return provider.chat(id);
}
