import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { requestContextSchema } from '../context';

const fetchDocsStep = createStep({
  id: 'fetch-docs',
  description: 'Fetch and read the documentation page',
  inputSchema: z.object({
    docsUrl: z.string().describe('URL of the documentation page'),
    question: z.string().describe('Question to answer from the docs'),
  }),
  outputSchema: z.object({
    docsUrl: z.string(),
    question: z.string(),
    pageContent: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('docsChatbotAgent');
    if (!agent) return { docsUrl: inputData.docsUrl, question: inputData.question, pageContent: '' };
    const result = await agent.generate([
      { role: 'user', content: `Fetch and summarize this documentation page: ${inputData.docsUrl}` },
    ]);
    return { docsUrl: inputData.docsUrl, question: inputData.question, pageContent: result.text };
  },
});

const findRelevantStep = createStep({
  id: 'find-relevant',
  description: 'Find the sections in the docs relevant to the question',
  inputSchema: z.object({
    docsUrl: z.string(),
    question: z.string(),
    pageContent: z.string(),
  }),
  outputSchema: z.object({
    question: z.string(),
    pageContent: z.string(),
    relevantSections: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('docsChatbotAgent');
    if (!agent) return { question: inputData.question, pageContent: inputData.pageContent, relevantSections: inputData.pageContent };
    const result = await agent.generate([
      {
        role: 'user',
        content: `From this documentation content:\n${inputData.pageContent}\n\nFind and quote the sections most relevant to: "${inputData.question}"`,
      },
    ]);
    return { question: inputData.question, pageContent: inputData.pageContent, relevantSections: result.text };
  },
});

const answerStep = createStep({
  id: 'answer',
  description: 'Answer the question with citations from the docs',
  inputSchema: z.object({
    question: z.string(),
    pageContent: z.string(),
    relevantSections: z.string(),
  }),
  outputSchema: z.object({
    question: z.string(),
    answer: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('docsChatbotAgent');
    if (!agent) return { question: inputData.question, answer: inputData.relevantSections };
    const result = await agent.generate([
      {
        role: 'user',
        content: `Using these relevant documentation sections:\n${inputData.relevantSections}\n\nAnswer this question with specific citations: "${inputData.question}"`,
      },
    ]);
    return { question: inputData.question, answer: result.text };
  },
});

export const docsChatbotWorkflow = createWorkflow({
  id: 'docs-chatbot-workflow',
  description: 'Fetches documentation, finds relevant sections, and answers questions with direct citations.',
  requestContextSchema,
  inputSchema: z.object({
    docsUrl: z.string().describe('URL of the documentation page to query'),
    question: z.string().describe('Question to answer from the documentation'),
  }),
  outputSchema: z.object({
    question: z.string(),
    answer: z.string(),
  }),
})
  .then(fetchDocsStep)
  .then(findRelevantStep)
  .then(answerStep);

docsChatbotWorkflow.commit();
