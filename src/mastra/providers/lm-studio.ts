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

/** Helper to extract string content from string or content part array */
function extractText(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

/**
 * Sanitizes a chat completions request body for local LLM servers (LM Studio / Ollama):
 *
 *  1. Preserves initial system instructions (role: 'system' at position 0).
 *  2. Flattens mid-conversation system injections (e.g. working memory) into the adjacent user message.
 *  3. Merges consecutive plain messages of the same role so role alternation is maintained without dropping content.
 *  4. Preserves tool calls (role: 'assistant' with tool_calls) and tool responses (role: 'tool') untouched.
 */
function sanitizeMessages(messages: any[]): any[] {
  if (!Array.isArray(messages) || messages.length === 0) return messages;

  // Step 1: Flatten any mid-conversation system messages into adjacent user turns
  const flattened: any[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === 'system' && i > 0) {
      const prev = flattened[flattened.length - 1];
      if (prev && prev.role === 'user') {
        const sysText = extractText(msg.content);
        const prevText = extractText(prev.content);
        flattened[flattened.length - 1] = {
          ...prev,
          content: sysText ? `${sysText}\n\n${prevText}` : prevText,
        };
      } else {
        flattened.push({ ...msg, role: 'user' });
      }
    } else {
      flattened.push(msg);
    }
  }

  // Step 2: Merge consecutive same-role text turns (except tool / tool_call turns)
  const merged: any[] = [];
  for (const msg of flattened) {
    const prev = merged[merged.length - 1];
    const isToolRelated =
      msg.role === 'tool' ||
      prev?.role === 'tool' ||
      Boolean(msg.tool_calls?.length) ||
      Boolean(prev?.tool_calls?.length);

    if (prev && prev.role === msg.role && !isToolRelated) {
      const prevText = extractText(prev.content);
      const currText = extractText(msg.content);
      merged[merged.length - 1] = {
        ...prev,
        content: `${prevText}\n\n${currText}`.trim(),
      };
    } else {
      merged.push(msg);
    }
  }

  return merged;
}

/**
 * LM Studio OpenAI-compatible provider.
 * Uses Chat Completions API (not Responses API).
 * Wraps fetch to sanitize message role ordering for strict Jinja templates.
 */
export const lmStudio = createOpenAI({
  apiKey: process.env.LM_STUDIO_API_KEY ?? process.env.LMSTUDIO_API_KEY ?? 'lm-studio',
  baseURL: LM_STUDIO_BASE_URL,
  compatibility: 'compatible',
  fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const req = input instanceof Request ? input : new Request(input, init);
      const raw = await req.text();
      if (!raw) {
        return fetch(input, init);
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.messages)) {
        parsed.messages = sanitizeMessages(parsed.messages);
      }
      return fetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: JSON.stringify(parsed),
      });
    } catch {
      // fallback: pass through unchanged
      return fetch(input, init);
    }
  },
} as any);

/**
 * Returns a LanguageModelV1 for the given LM Studio model ID.
 *
 * @param modelId  The model ID as shown in LM Studio (e.g. 'google/gemma-3-4b').
 *                 Defaults to the LM_STUDIO_MODEL env var or 'google/gemma-3-4b'.
 *
 * @example
 *   model: lmStudioModel()                    // uses env default
 *   model: lmStudioModel('google/gemma-3-4b')
 */
export function lmStudioModel(modelId?: string) {
  const rawId = modelId
    ? modelId.replace(/^(lm-studio|lmstudio):/, '')
    : process.env.LM_STUDIO_MODEL || 'google/gemma-3-4b';
  return lmStudio.chat(rawId);
}
