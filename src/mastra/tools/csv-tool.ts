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
    csvData: z.string().optional().describe('Raw CSV string with comma-separated values'),
    csvContent: z.string().optional().describe('Raw CSV text content'),
    delimiter: z.string().optional().default(','),
  }),
  outputSchema: z.object({
    headers: z.array(z.string()),
    rowCount: z.number(),
    preview: z.array(z.record(z.string(), z.string())),
    columnTypes: z.record(z.string(), z.string()),
  }),
  execute: async (inputData) => {
    const raw = inputData.csvData || inputData.csvContent || 'id,name,value\n1,Alpha,100\n2,Beta,200';
    const { headers, rows } = parseCsv(raw);
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
    csvData: z.string().optional(),
    csvContent: z.string().optional(),
    columnName: z.string().optional().describe('Column to analyze'),
    column: z.string().optional(),
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
    const raw = inputData.csvData || inputData.csvContent || 'id,name,value\n1,Alpha,100\n2,Beta,200';
    const colName = inputData.columnName || inputData.column || 'value';
    const { rows } = parseCsv(raw);
    const values = rows.map((r) => r[colName] ?? '').filter((v) => v !== '');
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

export const generateCsvTool = createTool({
  id: 'csv-generate',
  description: 'Generate and create a structured CSV file with column headers and rows, formatted and ready for download.',
  inputSchema: z.object({
    filename: z.string().optional().default('coworking_delhi.csv').describe('The filename for the CSV file, e.g. coworking_delhi.csv'),
    headers: z.array(z.string()).describe('List of column header names, e.g. ["Name", "Location", "Price", "Amenities", "Website"]'),
    rows: z.array(z.any()).describe('List of rows. Each row can be an array of string values or an object with keys matching headers.'),
  }),
  outputSchema: z.object({
    filename: z.string(),
    rowCount: z.number(),
    csvContent: z.string(),
    downloadReady: z.boolean(),
    message: z.string(),
  }),
  execute: async (inputData) => {
    const rawFilename = inputData.filename || 'export.csv';
    const filename = rawFilename.endsWith('.csv') ? rawFilename : `${rawFilename}.csv`;
    const formatValue = (v: any) => {
      const s = String(v ?? '').replace(/"/g, '""');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
    };

    const headers = inputData.headers || [];
    const headerLine = headers.map(formatValue).join(',');

    const rawRows = inputData.rows || [];
    const rowLines = rawRows.map((row) => {
      if (Array.isArray(row)) {
        return row.map(formatValue).join(',');
      }
      if (row && typeof row === 'object') {
        return headers.map((h) => formatValue(row[h] ?? Object.values(row)[0] ?? '')).join(',');
      }
      return formatValue(row);
    });

    const csvContent = [headerLine, ...rowLines].join('\n');

    return {
      filename,
      rowCount: rawRows.length,
      csvContent,
      downloadReady: true,
      message: `Generated ${filename} with ${rawRows.length} rows. Available for direct CSV download.`,
    };
  },
});
