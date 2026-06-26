import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { requestContextSchema } from '../context';

const loadPdfStep = createStep({
  id: 'load-pdf',
  description: 'Load and index the PDF document',
  inputSchema: z.object({
    pdfUrl: z.string().describe('URL of the PDF to load'),
    topic: z.string().optional().describe('Optional topic focus for flash cards'),
  }),
  outputSchema: z.object({
    pdfUrl: z.string(),
    topic: z.string().optional(),
    pdfContent: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('flashCardsAgent');
    if (!agent) return { pdfUrl: inputData.pdfUrl, topic: inputData.topic, pdfContent: '' };
    const result = await agent.generate([
      { role: 'user', content: `Load this PDF and give me an overview of its structure and main topics: ${inputData.pdfUrl}` },
    ]);
    return { pdfUrl: inputData.pdfUrl, topic: inputData.topic, pdfContent: result.text };
  },
});

const extractConceptsStep = createStep({
  id: 'extract-concepts',
  description: 'Extract key concepts, definitions, and facts from the PDF',
  inputSchema: z.object({
    pdfUrl: z.string(),
    topic: z.string().optional(),
    pdfContent: z.string(),
  }),
  outputSchema: z.object({
    topic: z.string().optional(),
    pdfContent: z.string(),
    concepts: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('flashCardsAgent');
    if (!agent) return { topic: inputData.topic, pdfContent: inputData.pdfContent, concepts: inputData.pdfContent };
    const topicFilter = inputData.topic ? ` Focus on the topic: "${inputData.topic}".` : '';
    const result = await agent.generate([
      {
        role: 'user',
        content: `From this PDF content:\n${inputData.pdfContent}\n\nExtract all key concepts, definitions, important facts, and comparisons.${topicFilter} Search for more using pdf-search.`,
      },
    ]);
    return { topic: inputData.topic, pdfContent: inputData.pdfContent, concepts: result.text };
  },
});

const generateCardsStep = createStep({
  id: 'generate-cards',
  description: 'Generate structured Q&A flash cards from the extracted concepts',
  inputSchema: z.object({
    topic: z.string().optional(),
    pdfContent: z.string(),
    concepts: z.string(),
  }),
  outputSchema: z.object({
    topic: z.string().optional(),
    flashCards: z.string(),
    cardCount: z.number(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('flashCardsAgent');
    if (!agent) return { topic: inputData.topic, flashCards: inputData.concepts, cardCount: 0 };
    const result = await agent.generate([
      {
        role: 'user',
        content: `Using these extracted concepts:\n${inputData.concepts}\n\nGenerate 10-20 flash cards in this format:\n**Front**: [Question/Term]\n**Back**: [Answer/Definition]\n\nInclude definition cards, concept cards, application cards, and comparison cards. Group by category.`,
      },
    ]);
    const cardCount = (result.text.match(/\*\*Front\*\*/g) || []).length;
    return { topic: inputData.topic, flashCards: result.text, cardCount };
  },
});

export const flashCardsWorkflow = createWorkflow({
  id: 'flash-cards-workflow',
  description: 'Loads a PDF, extracts key concepts, and generates structured Q&A flash cards for study.',
  requestContextSchema,
  inputSchema: z.object({
    pdfUrl: z.string().describe('URL of the PDF to generate flash cards from'),
    topic: z.string().optional().describe('Optional topic to focus the flash cards on'),
  }),
  outputSchema: z.object({
    topic: z.string().optional(),
    flashCards: z.string(),
    cardCount: z.number(),
  }),
})
  .then(loadPdfStep)
  .then(extractConceptsStep)
  .then(generateCardsStep);

flashCardsWorkflow.commit();
