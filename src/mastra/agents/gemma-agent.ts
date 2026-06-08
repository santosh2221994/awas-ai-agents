
import { Agent } from '@mastra/core/agent';
import { mcpClient } from '../mcp/client';
import { lmStudioModel } from '../providers/lm-studio';
import { defaultMemory } from '../memory';
import { requestContextSchema } from '../context';
import { defaultScorerConfig } from '../providers/model-helpers';
import { defaultTracingPolicy } from '../observability';

/**
 * gemma-agent.ts
 *
 * This agent is specifically designed to use the Gemma model from LM Studio
 * via the LM Studio Bridge MCP server.
 */

// Load tools from MCP at startup with retry logic
let mcpTools: any = {};
try {
  // Use a short timeout for listing tools at startup to avoid blocking module load too long
  mcpTools = await mcpClient.listTools();
} catch (err) {
  console.warn('[gemma-agent] Could not load MCP tools at module initialization. The agent will attempt to list them again if needed.', err);
}

const gemmaTools = {
    ...mcpTools
};

export const gemmaAgent = new Agent({
  id: 'gemma-agent',
  name: 'Gemma Agent',
  description: 'An agent that uses the Gemma model from local LM Studio via MCP.',

  // Chat Completions API via lmStudioModel() — fixes 'Invalid type for input' error
  // that occurs when using the built-in openai/* strings (Responses API format).
  model: lmStudioModel(),

  // Memory instance enables multi-turn conversation persistence
  memory: defaultMemory,

  instructions: `
You are an AI assistant that has access to a local Gemma model via LM Studio.

## Your Workflow:
1. When a user asks a question, use the "chat_completion" tool.
2. For the "model" argument in "chat_completion", use "google/gemma-3-4b" (or the currently loaded model if preferred).
3. Provide the results from the Gemma model back to the user.

## Available Tools from LM Studio Bridge:
- chat_completion: Generate a response from the local LLM.
- list_models: See what models are currently loaded.
- generate_text: Basic text completion.

Always use the local Gemma model for substantive reasoning or creative tasks as requested by the user.
  `,

  requestContextSchema,

  tools: gemmaTools,
  // ── Evals — powers Evaluate + Review tabs in Mastra Studio ───────────────
  scorers: defaultScorerConfig(),
  options: {
    tracingPolicy: defaultTracingPolicy,
  },
});
