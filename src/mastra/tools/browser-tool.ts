import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Browser Tool — web browsing via fetch (no Playwright needed).
// ---------------------------------------------------------------------------

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s{3,}/g, '\n\n')
    .trim()
    .slice(0, 8000);
}

export const browseUrlTool = createTool({
  id: 'browser-read-url',
  description: 'Fetch and read the text content of a URL.',
  inputSchema: z.object({
    url: z.string().url().describe('The URL to read'),
    maxChars: z.number().default(5000).describe('Maximum characters to return'),
  }),
  outputSchema: z.object({
    url: z.string(),
    title: z.string().optional(),
    text: z.string(),
    statusCode: z.number(),
  }),
  execute: async (inputData) => {
    try {
      const res = await fetch(inputData.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MastraBot/1.0)' },
        signal: AbortSignal.timeout(10000),
      });
      const html = await res.text();
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch?.[1]?.trim();
      const text = htmlToText(html).slice(0, inputData.maxChars);
      return { url: inputData.url, title, text, statusCode: res.status };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { url: inputData.url, text: `Error fetching page: ${msg}`, statusCode: 0 };
    }
  },
});

export const searchWebTool = createTool({
  id: 'browser-web-search',
  description: 'Search the web using DuckDuckGo and return a list of results with URLs.',
  inputSchema: z.object({
    query: z.string().describe('Search query'),
    maxResults: z.number().default(5),
  }),
  outputSchema: z.object({
    results: z.array(z.object({ title: z.string(), url: z.string(), snippet: z.string() })),
  }),
  execute: async (inputData) => {
    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(inputData.query)}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MastraBot/1.0)' },
        signal: AbortSignal.timeout(10000),
      });
      const html = await res.text();
      const results: { title: string; url: string; snippet: string }[] = [];
      const resultRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([^<]*(?:<b>[^<]*<\/b>[^<]*)*)<\/a>/gi;
      let match: RegExpExecArray | null;
      while ((match = resultRegex.exec(html)) !== null && results.length < (inputData.maxResults ?? 5)) {
        results.push({ url: match[1] ?? '', title: match[2]?.trim() ?? '', snippet: (match[3] ?? '').replace(/<[^>]+>/g, '').trim() });
      }
      if (results.length === 0) {
        return { results: [{ title: 'No results parsed', url: url, snippet: 'DuckDuckGo HTML layout may have changed. Try browsing a URL directly.' }] };
      }
      return { results };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { results: [{ title: 'Search error', url: '', snippet: msg }] };
    }
  },
});

export const extractPageDataTool = createTool({
  id: 'browser-extract-data',
  description: 'Extract structured data (tables, lists, links) from a webpage.',
  inputSchema: z.object({
    url: z.string().url(),
    extractType: z.enum(['tables', 'links', 'lists', 'headings', 'all']).default('all'),
  }),
  outputSchema: z.object({
    url: z.string(),
    tables: z.array(z.array(z.array(z.string()))).optional(),
    links: z.array(z.object({ text: z.string(), href: z.string() })).optional(),
    headings: z.array(z.object({ level: z.number(), text: z.string() })).optional(),
    lists: z.array(z.array(z.string())).optional(),
  }),
  execute: async (inputData) => {
    try {
      const res = await fetch(inputData.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MastraBot/1.0)' },
        signal: AbortSignal.timeout(10000),
      });
      const html = await res.text();
      const result: { url: string; tables?: string[][][]; links?: { text: string; href: string }[]; headings?: { level: number; text: string }[]; lists?: string[][] } = { url: inputData.url };

      if (inputData.extractType === 'links' || inputData.extractType === 'all') {
        const links: { text: string; href: string }[] = [];
        const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
        let m: RegExpExecArray | null;
        while ((m = linkRegex.exec(html)) !== null && links.length < 20) {
          const href = m[1] ?? '';
          if (href.startsWith('http') || href.startsWith('/')) {
            links.push({ href, text: m[2]?.trim() ?? '' });
          }
        }
        result.links = links;
      }

      if (inputData.extractType === 'headings' || inputData.extractType === 'all') {
        const headings: { level: number; text: string }[] = [];
        const hRegex = /<h([1-6])[^>]*>([^<]+)<\/h\1>/gi;
        let m: RegExpExecArray | null;
        while ((m = hRegex.exec(html)) !== null) {
          headings.push({ level: parseInt(m[1] ?? '1'), text: m[2]?.trim() ?? '' });
        }
        result.headings = headings;
      }

      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { url: inputData.url, error: msg } as { url: string };
    }
  },
});
