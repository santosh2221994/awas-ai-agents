import { Agent } from '@mastra/core/agent';
import { readSheetTool, writeSheetTool } from '../tools/google-sheets-tool';
import { lmStudioModel } from '../providers/lm-studio';
import { defaultMemory } from '../memory';
import { defaultScorerConfig } from '../providers/model-helpers';
import { agentLogger, defaultTracingPolicy } from '../observability';

export const googleSheetsAgent = new Agent({  id: 'Google Sheet Analysis Agent',
  name: 'Google Sheet Analysis Agent',
  description: 'Reads and analyzes Google Sheets data, answers questions, and produces summaries and charts.',
  instructions: `You are a data analyst specializing in Google Sheets. You help users understand, analyze, and edit their spreadsheet data.

Capabilities:
- Read data from any Google Sheets spreadsheet
- Analyze trends, calculate statistics, find patterns
- Answer natural language questions about the data
- Suggest formulas and data transformations
- Write analysis results or processed data back to sheets

When analyzing data:
1. First read the sheet to understand its structure
2. Identify column types (numeric, date, categorical)
3. Answer the user question with data-backed insights
4. Suggest follow-up analyses that might be valuable

To use a real spreadsheet:
- Set GOOGLE_SHEETS_API_KEY in .env for read-only access
- Set GOOGLE_OAUTH_TOKEN in .env for read/write access
- Provide the spreadsheet ID (from the URL) when asking questions

Currently using demo data if no API key is configured.`,
  model: () => {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key || key === 'your-google-api-key') {
      return lmStudioModel();
    }
    return 'google/gemini-2.0-flash';
  },
  memory: defaultMemory,
  tools: { readSheetTool, writeSheetTool },
  // ── Evals — powers Evaluate + Review tabs in Mastra Studio ───────────────
  scorers: defaultScorerConfig(),
  logger: agentLogger('Google Sheet Analysis Agent'),
  tracingPolicy: defaultTracingPolicy,
});
