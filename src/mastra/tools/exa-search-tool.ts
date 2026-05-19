import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Exa Search Tool — wraps Exa AI search API.
// Set EXA_API_KEY in .env for real results. Falls back to demo data.
// ---------------------------------------------------------------------------

async function exaRequest(endpoint: string, body: object): Promise<unknown> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    console.warn('[exa-search-tool] EXA_API_KEY not set — returning mock data');
    return {
      results: [
        { id: 'stub-1', url: 'https://example.com/result-1', title: 'Example Result 1 (stub)', text: 'Add EXA_API_KEY to .env for real results.', score: 0.95, publishedDate: new Date().toISOString() },
        { id: 'stub-2', url: 'https://example.com/result-2', title: 'Example Result 2 (stub)', text: 'Another stubbed result demonstrating deep search.', score: 0.88, publishedDate: new Date().toISOString() },
      ],
    };
  }
  const res = await fetch(`https://api.exa.ai${endpoint}`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Exa API error: ${res.status}`);
  return res.json();
}

type ExaResult = { id: string; url: string; title?: string; text?: string; score?: number; publishedDate?: string };

export const exaSearchTool = createTool({
  id: 'exa-search',
  description: 'Search the web using Exa AI and return relevant results with titles, URLs, and snippets.',
  inputSchema: z.object({
    query: z.string().describe('The search query'),
    numResults: z.number().min(1).max(20).default(5),
    type: z.enum(['neural', 'keyword', 'auto']).default('auto'),
  }),
  outputSchema: z.object({
    results: z.array(z.object({
      id: z.string(),
      url: z.string(),
      title: z.string().optional(),
      text: z.string().optional(),
      score: z.number().optional(),
      publishedDate: z.string().optional(),
    })),
  }),
  execute: async (inputData) => {
    const data = await exaRequest('/search', {
      query: inputData.query,
      numResults: inputData.numResults,
      type: inputData.type,
      contents: { text: { maxCharacters: 2000 } },
    }) as { results: ExaResult[] };
    return { results: data.results };
  },
});

export const exaScrapePageTool = createTool({
  id: 'exa-scrape-page',
  description: 'Scrape the full text content of a web page URL using Exa.',
  inputSchema: z.object({ url: z.string().url() }),
  outputSchema: z.object({ url: z.string(), title: z.string().optional(), text: z.string() }),
  execute: async (inputData) => {
    const apiKey = process.env.EXA_API_KEY;
    if (!apiKey) {
      return { url: inputData.url, title: 'Stubbed Page (no EXA_API_KEY)', text: `Stubbed content for ${inputData.url}. Add EXA_API_KEY for real scraping.` };
    }
    const data = await exaRequest('/contents', { ids: [inputData.url], text: { maxCharacters: 10000 } }) as { results: ExaResult[] };
    const page = data.results?.[0] ?? { url: inputData.url, text: '' };
    return { url: page.url, title: page.title, text: page.text ?? '' };
  },
});
