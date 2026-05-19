import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// CSV Tool — parse and analyze CSV data.
// ---------------------------------------------------------------------------

function parseCsv(raw: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = raw.trim().split('\n').filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = (lines[0] ?? '').split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return row;
  });
  return { headers, rows };
}

export const parseCsvTool = createTool({
  id: 'csv-parse',
  description: 'Parse CSV text data and return headers, rows, and basic statistics.',
  inputSchema: z.object({
    csvData: z.string().describe('Raw CSV string with comma-separated values'),
  }),
  outputSchema: z.object({
    headers: z.array(z.string()),
    rowCount: z.number(),
    preview: z.array(z.record(z.string(), z.string())),
    columnTypes: z.record(z.string(), z.string()),
  }),
  execute: async (inputData) => {
    const { headers, rows } = parseCsv(inputData.csvData);
    const columnTypes: Record<string, string> = {};
    for (const col of headers) {
      const values = rows.map((r) => r[col] ?? '').filter((v) => v !== '');
      const numericCount = values.filter((v) => !isNaN(Number(v))).length;
      columnTypes[col] = numericCount > values.length * 0.8 ? 'numeric' : 'text';
    }
    return { headers, rowCount: rows.length, preview: rows.slice(0, 5), columnTypes };
  },
});

export const analyzeColumnTool = createTool({
  id: 'csv-analyze-column',
  description: 'Analyze a specific column in CSV data for statistics and distribution.',
  inputSchema: z.object({
    csvData: z.string(),
    columnName: z.string().describe('Column to analyze'),
  }),
  outputSchema: z.object({
    columnName: z.string(),
    type: z.enum(['numeric', 'categorical']),
    count: z.number(),
    uniqueCount: z.number(),
    stats: z.object({
      min: z.number().optional(),
      max: z.number().optional(),
      mean: z.number().optional(),
      topValues: z.array(z.object({ value: z.string(), count: z.number() })),
    }),
  }),
  execute: async (inputData) => {
    const { rows } = parseCsv(inputData.csvData);
    const values = rows.map((r) => r[inputData.columnName] ?? '').filter((v) => v !== '');
    const nums = values.map(Number).filter((n) => !isNaN(n));
    const isNumeric = nums.length > values.length * 0.8;

    const freq: Record<string, number> = {};
    for (const v of values) { freq[v] = (freq[v] ?? 0) + 1; }
    const topValues = Object.entries(freq)
      .sort((a: [string, number], b: [string, number]) => b[1] - a[1])
      .slice(0, 5)
      .map(([value, count]: [string, number]) => ({ value, count }));

    const stats = isNumeric
      ? {
          min: Math.min(...nums),
          max: Math.max(...nums),
          mean: nums.reduce((a: number, b: number) => a + b, 0) / nums.length,
          topValues,
        }
      : { topValues };

    return {
      columnName: inputData.columnName,
      type: isNumeric ? 'numeric' as const : 'categorical' as const,
      count: values.length,
      uniqueCount: Object.keys(freq).length,
      stats,
    };
  },
});
