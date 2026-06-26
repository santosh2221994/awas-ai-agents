import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { requestContextSchema } from '../context';

const preparePromptStep = createStep({
  id: 'prepare-prompt',
  description: 'Prepare and optimize the prompt for the Gemma model',
  inputSchema: z.object({
    prompt: z.string().describe('The user prompt to send to Gemma'),
    systemContext: z.string().optional().describe('Optional system context'),
  }),
  outputSchema: z.object({
    prompt: z.string(),
    systemContext: z.string().optional(),
    optimizedPrompt: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('gemmaAgent');
    if (!agent) return { ...inputData, optimizedPrompt: inputData.prompt };
    const result = await agent.generate([
      {
        role: 'user',
        content: `List the available models using the list_models tool, then prepare an optimized version of this prompt for the Gemma model:\n\n"${inputData.prompt}"\n\n${inputData.systemContext ? `System context: ${inputData.systemContext}` : ''}`,
      },
    ]);
    return { prompt: inputData.prompt, systemContext: inputData.systemContext, optimizedPrompt: result.text };
  },
});

const callGemmaStep = createStep({
  id: 'call-gemma',
  description: 'Send the prompt to the local Gemma model via LM Studio',
  inputSchema: z.object({
    prompt: z.string(),
    systemContext: z.string().optional(),
    optimizedPrompt: z.string(),
  }),
  outputSchema: z.object({
    prompt: z.string(),
    gemmaResponse: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('gemmaAgent');
    if (!agent) return { prompt: inputData.prompt, gemmaResponse: '' };
    const result = await agent.generate([
      {
        role: 'user',
        content: `Use the chat_completion tool with model "google/gemma-3-4b" to answer:\n\n${inputData.optimizedPrompt}`,
      },
    ]);
    return { prompt: inputData.prompt, gemmaResponse: result.text };
  },
});

const formatResponseStep = createStep({
  id: 'format-response',
  description: 'Format the Gemma model response for the user',
  inputSchema: z.object({
    prompt: z.string(),
    gemmaResponse: z.string(),
  }),
  outputSchema: z.object({
    prompt: z.string(),
    response: z.string(),
    model: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('gemmaAgent');
    if (!agent) return { prompt: inputData.prompt, response: inputData.gemmaResponse, model: 'google/gemma-3-4b' };
    const result = await agent.generate([
      {
        role: 'user',
        content: `Format this Gemma model response cleanly for the user:\n\nOriginal question: "${inputData.prompt}"\n\nGemma response:\n${inputData.gemmaResponse}`,
      },
    ]);
    return { prompt: inputData.prompt, response: result.text, model: 'google/gemma-3-4b' };
  },
});

export const gemmaWorkflow = createWorkflow({
  id: 'gemma-workflow',
  description: 'Prepares a prompt, sends it to the local Gemma model via LM Studio MCP, and formats the response.',
  requestContextSchema,
  inputSchema: z.object({
    prompt: z.string().describe('The prompt to send to the Gemma model'),
    systemContext: z.string().optional().describe('Optional system context or instructions'),
  }),
  outputSchema: z.object({
    prompt: z.string(),
    response: z.string(),
    model: z.string(),
  }),
})
  .then(preparePromptStep)
  .then(callGemmaStep)
  .then(formatResponseStep);

gemmaWorkflow.commit();
