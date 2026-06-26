import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { requestContextSchema } from '../context';

const loadPdfStep = createStep({
  id: 'load-pdf',
  description: 'Load and index the PDF document',
  inputSchema: z.object({
    pdfUrl: z.string().describe('URL of the PDF document'),
    question: z.string().describe('Question to answer from the PDF'),
  }),
  outputSchema: z.object({
    pdfUrl: z.string(),
    question: z.string(),
    overview: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('pdfChatAgent');
    if (!agent) return { pdfUrl: inputData.pdfUrl, question: inputData.question, overview: '' };
    const result = await agent.generate([
      { role: 'user', content: `Load this PDF using pdf-load and give me an overview of its contents: ${inputData.pdfUrl}` },
    ]);
    return { pdfUrl: inputData.pdfUrl, question: inputData.question, overview: result.text };
  },
});

const searchRelevantStep = createStep({
  id: 'search-relevant',
  description: 'Search the PDF for passages relevant to the question',
  inputSchema: z.object({
    pdfUrl: z.string(),
    question: z.string(),
    overview: z.string(),
  }),
  outputSchema: z.object({
    question: z.string(),
    overview: z.string(),
    relevantPassages: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('pdfChatAgent');
    if (!agent) return { question: inputData.question, overview: inputData.overview, relevantPassages: inputData.overview };
    const result = await agent.generate([
      {
        role: 'user',
        content: `Use pdf-search to find all passages relevant to this question:\n"${inputData.question}"\n\nPDF overview:\n${inputData.overview}`,
      },
    ]);
    return { question: inputData.question, overview: inputData.overview, relevantPassages: result.text };
  },
});

const answerWithCitationsStep = createStep({
  id: 'answer-with-citations',
  description: 'Answer the question with specific page citations',
  inputSchema: z.object({
    question: z.string(),
    overview: z.string(),
    relevantPassages: z.string(),
  }),
  outputSchema: z.object({
    question: z.string(),
    answer: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('pdfChatAgent');
    if (!agent) return { question: inputData.question, answer: inputData.relevantPassages };
    const result = await agent.generate([
      {
        role: 'user',
        content: `Using these relevant passages from the PDF:\n${inputData.relevantPassages}\n\nAnswer this question with specific page citations ("According to page X, ..."):\n"${inputData.question}"`,
      },
    ]);
    return { question: inputData.question, answer: result.text };
  },
});

export const pdfChatWorkflow = createWorkflow({
  id: 'pdf-chat-workflow',
  description: 'Loads a PDF, searches for relevant passages, and answers a question with specific page citations.',
  requestContextSchema,
  inputSchema: z.object({
    pdfUrl: z.string().describe('URL of the PDF document to query'),
    question: z.string().describe('Question to answer from the PDF'),
  }),
  outputSchema: z.object({
    question: z.string(),
    answer: z.string(),
  }),
})
  .then(loadPdfStep)
  .then(searchRelevantStep)
  .then(answerWithCitationsStep);

pdfChatWorkflow.commit();
