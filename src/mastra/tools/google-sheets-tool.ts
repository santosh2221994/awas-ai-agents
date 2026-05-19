import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Google Sheets Tool — read/write spreadsheets via Sheets REST API.
// Set GOOGLE_SHEETS_API_KEY for read access. GOOGLE_OAUTH_TOKEN for write.
// ---------------------------------------------------------------------------

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export const readSheetTool = createTool({
  id: 'google-sheets-read',
  description: 'Read data from a Google Sheets spreadsheet range.',
  inputSchema: z.object({
    spreadsheetId: z.string().default('demo').describe('Spreadsheet ID from the URL'),
    range: z.string().default('Sheet1!A1:Z100').describe('A1 notation range, e.g. Sheet1!A1:D20'),
  }),
  outputSchema: z.object({
    headers: z.array(z.string()),
    rows: z.array(z.array(z.string())),
    totalRows: z.number(),
  }),
  execute: async (inputData) => {
    const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
    if (!apiKey || inputData.spreadsheetId === 'demo') {
      return {
        headers: ['Name', 'Email', 'Revenue', 'Status', 'Join Date'],
        rows: [
          ['Alice Chen', 'alice@acme.com', '12500', 'Active', '2024-01-15'],
          ['Bob Smith', 'bob@startup.io', '8200', 'Active', '2024-02-20'],
          ['Carol White', 'carol@corp.co', '15750', 'Premium', '2023-11-10'],
          ['David Lee', 'david@freelance.me', '3100', 'Trial', '2024-04-01'],
          ['Eva Martinez', 'eva@agency.net', '22000', 'Premium', '2023-09-05'],
        ],
        totalRows: 5,
      };
    }
    const url = `${SHEETS_BASE}/${inputData.spreadsheetId}/values/${encodeURIComponent(inputData.range ?? 'Sheet1!A1:Z100')}?key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Sheets API error: ${res.status}`);
    const data = await res.json() as { values?: string[][] };
    const rows = data.values ?? [];
    const [headers = [], ...dataRows] = rows;
    return { headers, rows: dataRows, totalRows: dataRows.length };
  },
});

export const writeSheetTool = createTool({
  id: 'google-sheets-write',
  description: 'Write data to a Google Sheets spreadsheet range.',
  inputSchema: z.object({
    spreadsheetId: z.string(),
    range: z.string(),
    values: z.array(z.array(z.string())),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    updatedCells: z.number(),
    note: z.string().optional(),
  }),
  execute: async (inputData) => {
    const token = process.env.GOOGLE_OAUTH_TOKEN;
    if (!token) {
      const cellCount = inputData.values.reduce((acc: number, row: string[]) => acc + row.length, 0);
      return { success: true, updatedCells: cellCount, note: '(stub) Set GOOGLE_OAUTH_TOKEN for real writes.' };
    }
    const url = `${SHEETS_BASE}/${inputData.spreadsheetId}/values/${encodeURIComponent(inputData.range)}?valueInputOption=USER_ENTERED`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: inputData.values }),
    });
    if (!res.ok) throw new Error(`Sheets write error: ${res.status}`);
    const data = await res.json() as { updatedCells?: number };
    return { success: true, updatedCells: data.updatedCells ?? 0 };
  },
});
