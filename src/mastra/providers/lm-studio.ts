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
 * Sanitizes a chat completions request body so it satisfies gemma-3-4b's
 * strict Jinja role-alternation template:
 *
 *  1. Collapse any `system` messages after position 0 into the preceding
 *     user/assistant turn as a content prefix (working-memory injections).
 *  2. Drop consecutive duplicate roles — keeps the LAST message of each run
 *     so no information is silently lost from the assistant side.
 *  3. Guarantee the sequence starts with `user`.
 */
function sanitizeMessages(messages: any[]): any[] {
  if (!Array.isArray(messages)) return messages;

  // Step 1: flatten mid-conversation system messages into adjacent user turns
  const flattened: any[] = [];
  for (const msg of messages) {
    if (msg.role === 'system' && flattened.length > 0) {
      // Append system content as a prefix to the next user message by
      // buffering it; if the previous message was user, merge into it.
      const prev = flattened[flattened.length - 1];
      if (prev.role === 'user') {
        flattened[flattened.length - 1] = {
          ...prev,
          content: `${msg.content}

${prev.content}`,
        };
      } else {
        // Hold it — will be prepended to the next user message
        flattened.push({ ...msg, role: 'user' });
      }
    } else {
      flattened.push(msg);
    }
  }

  // Step 2: deduplicate consecutive same-role messages (keep last of each run)
  const deduped: any[] = [];
  for (const msg of flattened) {
    if (deduped.length > 0 && deduped[deduped.length - 1].role === msg.role) {
      deduped[deduped.length - 1] = msg;
    } else {
      deduped.push(msg);
    }
  }

  // Step 3: must start with user
  while (deduped.length > 0 && deduped[0].role !== 'user') {
    deduped.shift();
  }

  return deduped;
}

/**
 * LM Studio OpenAI-compatible provider.
 * Uses Chat Completions API (not Responses API).
 * Wraps fetch to sanitize message role ordering for strict Jinja templates.
 */
export const lmStudio = createOpenAI({
  apiKey: process.env.LM_STUDIO_API_KEY ?? 'lm-studio',
  baseURL: LM_STUDIO_BASE_URL,
  compatibility: 'compatible',
  fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      // AI SDK v3 passes a Request object as `input` with body already set.
      // We need to clone it, read the body, sanitize, and rebuild.
      const req = input instanceof Request ? input : new Request(input, init);
      const raw = await req.text();
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
    'gemma-3-4b-it';
  return lmStudio.chat(id);
}
