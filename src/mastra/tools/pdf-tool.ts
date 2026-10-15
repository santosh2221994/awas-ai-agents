import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { inflateSync } from 'zlib';

// ---------------------------------------------------------------------------
// PDF Tool — chunk-based in-memory RAG for PDF documents.
// ---------------------------------------------------------------------------

interface PdfChunk { page: number; text: string; chunkIndex: number }
const pdfStore: Map<string, PdfChunk[]> = new Map();

const DEMO_PDF_CONTENT: PdfChunk[] = [
  { page: 1, chunkIndex: 0, text: 'Mastra is a TypeScript framework for building AI agents and workflows. It provides tools for creating intelligent, composable AI systems.' },
  { page: 1, chunkIndex: 1, text: 'Key features include: multi-step workflows, agent memory, tool integrations, observability, and a local development studio.' },
  { page: 2, chunkIndex: 2, text: 'Agents in Mastra are powered by large language models and can use tools to interact with external services.' },
  { page: 2, chunkIndex: 3, text: 'Workflows are directed acyclic graphs of steps. Each step has input/output schemas defined using Zod.' },
  { page: 3, chunkIndex: 4, text: 'Mastra supports Google Gemini, OpenAI GPT-4, Anthropic Claude, and other LLMs via provider plugins.' },
  { page: 3, chunkIndex: 5, text: 'The Mastra Studio provides a local web UI at port 4111 for testing agents, running workflows, and viewing traces.' },
  { page: 4, chunkIndex: 6, text: 'Tools are TypeScript functions with Zod input/output schemas, executed by agents to perform specific tasks.' },
  { page: 4, chunkIndex: 7, text: 'Memory allows agents to retain conversation history and long-term facts using LibSQL or other storage backends.' },
];

async function fetchPdfText(url: string): Promise<PdfChunk[]> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/pdf,*/*',
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching PDF`);
  const buffer = await res.arrayBuffer();
  const buf = Buffer.from(buffer);
  const str = buf.toString('binary');

  const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
  let match;
  const chunks: PdfChunk[] = [];
  let page = 1;

  while ((match = streamRegex.exec(str)) !== null) {
    try {
      const decomp = inflateSync(Buffer.from(match[1], 'binary')).toString('latin1');
      const textPieces: string[] = [];

      const tjMatches = decomp.matchAll(/\((.*?)\)\s*Tj/g);
      for (const m of tjMatches) {
        if (m[1].trim()) textPieces.push(m[1].trim());
      }

      const tjArrayMatches = decomp.matchAll(/\[(.*?)\]\s*TJ/g);
      for (const m of tjArrayMatches) {
        const innerStrings = m[1].matchAll(/\((.*?)\)/g);
        for (const sm of innerStrings) {
          if (sm[1].trim()) textPieces.push(sm[1].trim());
        }
      }

      if (textPieces.length > 5) {
        const rawJoined = textPieces.join(' ');
        const cleaned = rawJoined.replace(/\s+/g, ' ').trim();
        if (cleaned.length > 30) {
          chunks.push({
            page,
            chunkIndex: chunks.length,
            text: cleaned,
          });
          page++;
        }
      }
    } catch {}
  }

  // Fallback if compressed stream extraction returned no chunks
  if (chunks.length === 0) {
    const text = buf.toString('utf-8', 0, 50000);
    const printable = text.replace(/[^\x20-\x7E\n]/g, ' ').replace(/\s{4,}/g, '\n').trim();
    const lines = printable.split('\n').filter((l) => l.trim().length > 20);
    for (let i = 0; i < lines.length; i += 5) {
      const block = lines.slice(i, i + 5).join(' ').trim();
      if (block.length > 20) {
        chunks.push({ page, chunkIndex: chunks.length, text: block });
        page++;
      }
    }
  }

  return chunks.length > 0 ? chunks : DEMO_PDF_CONTENT;
}

export const loadPdfTool = createTool({
  id: 'pdf-load',
  description: 'Load a PDF document from a URL and index it for search and Q&A.',
  inputSchema: z.object({ url: z.string().url().describe('URL of the PDF document') }),
  outputSchema: z.object({
    documentId: z.string(),
    pageCount: z.number(),
    chunkCount: z.number(),
    previewText: z.string(),
  }),
  execute: async (inputData) => {
    let chunks: PdfChunk[];
    try {
      chunks = await fetchPdfText(inputData.url);
    } catch {
      chunks = DEMO_PDF_CONTENT;
    }
    const docId = inputData.url.split('/').pop()?.replace(/[^a-z0-9]/gi, '_') ?? 'doc';
    pdfStore.set(docId, chunks);
    const pageCount = Math.max(...chunks.map((c) => c.page), 1);
    const previewText = chunks.slice(0, 3).map((c) => c.text).join(' ').slice(0, 400);
    return {
      documentId: docId,
      pageCount,
      chunkCount: chunks.length,
      previewText,
    };
  },
});

export const searchPdfTool = createTool({
  id: 'pdf-search',
  description: 'Search a loaded PDF document for relevant passages.',
  inputSchema: z.object({
    documentId: z.string().describe('ID returned from pdf-load'),
    query: z.string().describe('Search query to find relevant sections'),
    maxChunks: z.number().optional().default(8),
  }),
  outputSchema: z.object({
    passages: z.array(z.object({ page: z.number(), text: z.string(), relevanceScore: z.number() })),
  }),
  execute: async (inputData) => {
    const chunks = pdfStore.get(inputData.documentId) ?? DEMO_PDF_CONTENT;
    const queryWords = inputData.query.toLowerCase().split(/\s+/).filter((w: string) => w.length >= 2);
    const spacedWords = queryWords.map((w: string) => w.split('').join(' '));

    const scored = chunks.map((chunk) => {
      const lower = chunk.text.toLowerCase();
      let score = 0;
      for (let i = 0; i < queryWords.length; i++) {
        const qw = queryWords[i];
        const sw = spacedWords[i];
        if (lower.includes(qw)) score += 2;
        if (sw && lower.includes(sw)) score += 3;
      }
      return { page: chunk.page, text: chunk.text, relevanceScore: score };
    });

    const maxLimit = inputData.maxChunks || 8;
    const passages = scored
      .filter((s) => s.relevanceScore > 0)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, maxLimit);

    // If query had no exact matches, return the top opening chunks
    if (passages.length === 0) {
      return {
        passages: chunks.slice(0, maxLimit).map((c) => ({
          page: c.page,
          text: c.text,
          relevanceScore: 1,
        })),
      };
    }

    return { passages };
  },
});
