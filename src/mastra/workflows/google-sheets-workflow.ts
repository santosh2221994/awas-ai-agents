import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { requestContextSchema } from '../context';

const readSheetStep = createStep({
  id: 'read-sheet',
  description: 'Read data from the Google Sheets spreadsheet',
  inputSchema: z.object({
    spreadsheetId: z.string().describe('Google Sheets spreadsheet ID'),
    range: z.string().optional().describe('Optional cell range (e.g. Sheet1!A1:Z100)'),
    question: z.string().describe('Question to answer about the data'),
  }),
  outputSchema: z.object({
    spreadsheetId: z.string(),
    question: z.string(),
    sheetData: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('googleSheetsAgent');
    if (!agent) return { spreadsheetId: inputData.spreadsheetId, question: inputData.question, sheetData: '' };
    const rangeNote = inputData.range ? ` Use range: ${inputData.range}.` : '';
    const result = await agent.generate([
      { role: 'user', content: `Read all data from spreadsheet ${inputData.spreadsheetId} using the read-sheet tool.${rangeNote} Describe the structure.` },
    ]);
    return { spreadsheetId: inputData.spreadsheetId, question: inputData.question, sheetData: result.text };
  },
});

const analyzeDataStep = createStep({
  id: 'analyze-data',
  description: 'Analyze the sheet data to answer the question',
  inputSchema: z.object({
    spreadsheetId: z.string(),
    question: z.string(),
    sheetData: z.string(),
  }),
  outputSchema: z.object({
    spreadsheetId: z.string(),
    question: z.string(),
    sheetData: z.string(),
    analysis: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('googleSheetsAgent');
    if (!agent) return { ...inputData, analysis: '' };
    const result = await agent.generate([
      {
        role: 'user',
        content: `Sheet data:\n${inputData.sheetData}\n\nAnswer this question with data-backed insights, statistics, and trends:\n"${inputData.question}"`,
      },
    ]);
    return { ...inputData, analysis: result.text };
  },
});

const writeResultsStep = createStep({
  id: 'write-results',
  description: 'Optionally write analysis results back to the sheet',
  inputSchema: z.object({
    spreadsheetId: z.string(),
    question: z.string(),
    sheetData: z.string(),
    analysis: z.string(),
  }),
  outputSchema: z.object({
    question: z.string(),
    analysis: z.string(),
    written: z.boolean(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('googleSheetsAgent');
    const hasWriteAccess = !!process.env.GOOGLE_OAUTH_TOKEN;
    if (!agent || !hasWriteAccess) {
      return { question: inputData.question, analysis: inputData.analysis, written: false };
    }
    await agent.generate([
      {
        role: 'user',
        content: `Write this analysis summary to a new "Analysis" sheet in spreadsheet ${inputData.spreadsheetId}:\n\n${inputData.analysis}`,
      },
    ]);
    return { question: inputData.question, analysis: inputData.analysis, written: true };
  },
});

export const googleSheetsWorkflow = createWorkflow({
  id: 'google-sheets-workflow',
  description: 'Reads a Google Sheets spreadsheet, analyzes the data to answer a question, and optionally writes results back.',
  requestContextSchema,
  inputSchema: z.object({
    spreadsheetId: z.string().describe('Google Sheets spreadsheet ID (from the URL)'),
    range: z.string().optional().describe('Optional cell range'),
    question: z.string().describe('Question to answer about the spreadsheet data'),
  }),
  outputSchema: z.object({
    question: z.string(),
    analysis: z.string(),
    written: z.boolean(),
  }),
})
  .then(readSheetStep)
  .then(analyzeDataStep)
  .then(writeResultsStep);

googleSheetsWorkflow.commit();
