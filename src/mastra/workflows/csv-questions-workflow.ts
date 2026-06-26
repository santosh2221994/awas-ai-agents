import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { requestContextSchema } from '../context';

const parseCsvStep = createStep({
  id: 'parse-csv',
  description: 'Parse the CSV data and extract structure information',
  inputSchema: z.object({
    csvData: z.string().describe('Raw CSV data or file path'),
  }),
  outputSchema: z.object({
    csvData: z.string(),
    structure: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('csvQuestionsAgent');
    if (!agent) return { csvData: inputData.csvData, structure: '' };
    const result = await agent.generate([
      { role: 'user', content: `Parse this CSV and describe its structure (row count, column names, types):\n\n${inputData.csvData}` },
    ]);
    return { csvData: inputData.csvData, structure: result.text };
  },
});

const analyzeColumnsStep = createStep({
  id: 'analyze-columns',
  description: 'Analyze key columns for statistics and patterns',
  inputSchema: z.object({
    csvData: z.string(),
    structure: z.string(),
  }),
  outputSchema: z.object({
    csvData: z.string(),
    structure: z.string(),
    analysis: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('csvQuestionsAgent');
    if (!agent) return { ...inputData, analysis: '' };
    const result = await agent.generate([
      {
        role: 'user',
        content: `Given this CSV structure:\n${inputData.structure}\n\nAnalyze the key columns: statistics, patterns, anomalies.\n\nCSV:\n${inputData.csvData}`,
      },
    ]);
    return { csvData: inputData.csvData, structure: inputData.structure, analysis: result.text };
  },
});

const generateQuestionsStep = createStep({
  id: 'generate-questions',
  description: 'Generate insightful questions and answers from the data',
  inputSchema: z.object({
    csvData: z.string(),
    structure: z.string(),
    analysis: z.string(),
  }),
  outputSchema: z.object({
    structure: z.string(),
    analysis: z.string(),
    questions: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('csvQuestionsAgent');
    if (!agent) return { structure: inputData.structure, analysis: inputData.analysis, questions: '' };
    const result = await agent.generate([
      {
        role: 'user',
        content: `Based on this CSV analysis:\n${inputData.analysis}\n\nGenerate 5-10 insightful questions (Basic/Intermediate/Advanced) and answer each one using the data.\n\nCSV:\n${inputData.csvData}`,
      },
    ]);
    return { structure: inputData.structure, analysis: inputData.analysis, questions: result.text };
  },
});

export const csvQuestionsWorkflow = createWorkflow({
  id: 'csv-questions-workflow',
  description: 'Parses CSV data, analyzes columns, and generates insightful data-backed questions and answers.',
  requestContextSchema,
  inputSchema: z.object({
    csvData: z.string().describe('Raw CSV content to analyze'),
  }),
  outputSchema: z.object({
    structure: z.string(),
    analysis: z.string(),
    questions: z.string(),
  }),
})
  .then(parseCsvStep)
  .then(analyzeColumnsStep)
  .then(generateQuestionsStep);

csvQuestionsWorkflow.commit();
