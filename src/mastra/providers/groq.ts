/**
 * providers/groq.ts
 *
 * Groq cloud provider (OpenAI-compatible).
 * Base URL: https://api.groq.com/openai/v1
 * Default model: llama-3.3-70b-versatile (Official Groq model with full tool calling support)
 */

import { createOpenAI } from '@ai-sdk/openai';

export const groq = createOpenAI({
  apiKey: process.env.GROQ_API_KEY ?? '',
  baseURL: process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1',
  compatibility: 'compatible',
} as any);

/**
 * Returns a LanguageModelV1 for Groq.
 * Defaults to 'llama-3.3-70b-versatile' for full tool-calling support.
 *
 * @param modelId  Defaults to GROQ_MODEL env var or 'llama-3.3-70b-versatile'.
 */
export function groqModel(modelId?: string) {
  const id =
    modelId ??
    process.env.GROQ_MODEL ??
    'llama-3.3-70b-versatile';
  return groq.chat(id);
}
