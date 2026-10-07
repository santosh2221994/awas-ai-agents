/**
 * providers/ollama.ts
 *
 * Dedicated provider client for Ollama local inference daemon.
 * Base URL defaults to http://127.0.0.1:11434/v1 (OpenAI-compatible endpoint).
 *
 * Supports models like:
 * - llama3.2 (3B)
 * - llama3.1 (8B)
 * - mistral (7B)
 * - qwen2.5 (7B/14B)
 * - phi3 (3.8B)
 */

import { createOpenAI } from '@ai-sdk/openai';

const DEFAULT_OLLAMA_URL =
  process.env.OLLAMA_BASE_URL ?? process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434/v1';

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
 * Sanitizes messages for Ollama's Jinja prompt templates to avoid consecutive
 * role errors or misplaced system messages mid-conversation.
 */
function sanitizeOllamaMessages(messages: any[]): any[] {
  if (!Array.isArray(messages) || messages.length === 0) return messages;

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

const ollamaProviderCache = new Map<string, any>();

/**
 * Returns an OpenAI-compatible provider pointed at Ollama.
 */
export function getOllamaProvider(customBaseUrl?: string) {
  const url = (customBaseUrl || DEFAULT_OLLAMA_URL).replace(/\/+$/, '');
  const finalUrl = url.endsWith('/v1') ? url : `${url}/v1`;

  if (ollamaProviderCache.has(finalUrl)) {
    return ollamaProviderCache.get(finalUrl);
  }

  const provider = createOpenAI({
    apiKey: 'ollama',
    baseURL: finalUrl,
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
          parsed.messages = sanitizeOllamaMessages(parsed.messages);
        }
        return fetch(req.url, {
          method: req.method,
          headers: req.headers,
          body: JSON.stringify(parsed),
        });
      } catch {
        return fetch(input, init);
      }
    },
  } as any);

  ollamaProviderCache.set(finalUrl, provider);
  return provider;
}

export const ollama = getOllamaProvider();

/**
 * Returns a LanguageModelV1 for Ollama.
 *
 * @param modelId Defaults to 'llama3.2' or OLLAMA_MODEL env var.
 * @param baseUrl Optional custom Ollama base URL.
 */
export function ollamaModel(modelId?: string, baseUrl?: string) {
  const rawId = modelId
    ? modelId.replace(/^ollama:/, '')
    : process.env.OLLAMA_MODEL || 'llama3.2';
  const provider = baseUrl ? getOllamaProvider(baseUrl) : ollama;
  return provider.chat(rawId);
}
