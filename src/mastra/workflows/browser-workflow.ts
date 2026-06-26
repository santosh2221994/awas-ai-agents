import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { requestContextSchema } from '../context';

const navigateStep = createStep({
  id: 'navigate',
  description: 'Navigate to the target URL and read the page content',
  inputSchema: z.object({
    url: z.string().describe('The URL to navigate to'),
    task: z.string().describe('What to do on the page'),
  }),
  outputSchema: z.object({
    url: z.string(),
    task: z.string(),
    pageContent: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('browserAgent');
    if (!agent) return { url: inputData.url, task: inputData.task, pageContent: '' };
    const result = await agent.generate([
      { role: 'user', content: `Navigate to ${inputData.url} and read the page content. Return a summary of what you see.` },
    ]);
    return { url: inputData.url, task: inputData.task, pageContent: result.text };
  },
});

const interactStep = createStep({
  id: 'interact',
  description: 'Perform the requested interactions on the page',
  inputSchema: z.object({
    url: z.string(),
    task: z.string(),
    pageContent: z.string(),
  }),
  outputSchema: z.object({
    task: z.string(),
    interactionResult: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('browserAgent');
    if (!agent) return { task: inputData.task, interactionResult: inputData.pageContent };
    const result = await agent.generate([
      {
        role: 'user',
        content: `Page content:\n${inputData.pageContent}\n\nNow perform this task: ${inputData.task}\nTake a screenshot after completing each major step.`,
      },
    ]);
    return { task: inputData.task, interactionResult: result.text };
  },
});

const summarizeStep = createStep({
  id: 'summarize',
  description: 'Summarize the results of the browser automation',
  inputSchema: z.object({
    task: z.string(),
    interactionResult: z.string(),
  }),
  outputSchema: z.object({
    task: z.string(),
    summary: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('browserAgent');
    if (!agent) return { task: inputData.task, summary: inputData.interactionResult };
    const result = await agent.generate([
      {
        role: 'user',
        content: `Summarize the results of the following browser task in a clear, structured format.\n\nTask: ${inputData.task}\n\nResults:\n${inputData.interactionResult}`,
      },
    ]);
    return { task: inputData.task, summary: result.text };
  },
});

export const browserWorkflow = createWorkflow({
  id: 'browser-workflow',
  description: 'Automates browser tasks: navigate to a URL, perform interactions, and return a structured summary.',
  requestContextSchema,
  inputSchema: z.object({
    url: z.string().describe('The URL to navigate to'),
    task: z.string().describe('The task to perform on the page'),
  }),
  outputSchema: z.object({
    task: z.string(),
    summary: z.string(),
  }),
})
  .then(navigateStep)
  .then(interactStep)
  .then(summarizeStep);

browserWorkflow.commit();
