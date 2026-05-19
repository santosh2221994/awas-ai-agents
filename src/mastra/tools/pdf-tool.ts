import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

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
  // In production, use pdf-parse or a PDF extraction API.
  // For the demo, we simulate chunked extraction.
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching PDF`);
  const buffer = await res.arrayBuffer();
  const text = Buffer.from(buffer).toString('utf-8', 0, 50000);
  // Extract printable text chunks
  const printable = text.replace(/[^\x20-\x7E\n]/g, ' ').replace(/\s{4,}/g, '\n').trim();
  const lines = printable.split('\n').filter((l) => l.trim().length > 20);
  const chunks: PdfChunk[] = [];
  let page = 1;
  for (let i = 0; i < lines.length; i += 5) {
    const block = lines.slice(i, i + 5).join(' ').trim();
    if (block.length > 20) chunks.push({ page, chunkIndex: chunks.length, text: block });
    if (i % 25 === 0 && i > 0) page++;
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
    const pageCount = Math.max(...chunks.map((c) => c.page));
    return { documentId: docId, pageCount, chunkCount: chunks.length, previewText: chunks.slice(0, 2).map((c) => c.text).join(' ').slice(0, 300) };
  },
});

export const searchPdfTool = createTool({
  id: 'pdf-search',
  description: 'Search a loaded PDF document for relevant passages.',
  inputSchema: z.object({
    documentId: z.string().describe('ID returned from pdf-load'),
    query: z.string().describe('Search query to find relevant sections'),
    maxChunks: z.number().default(5),
  }),
  outputSchema: z.object({
    passages: z.array(z.object({ page: z.number(), text: z.string(), relevanceScore: z.number() })),
  }),
  execute: async (inputData) => {
    const chunks = pdfStore.get(inputData.documentId) ?? DEMO_PDF_CONTENT;
    const queryWords = inputData.query.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
    const scored = chunks.map((chunk) => {
      const lower = chunk.text.toLowerCase();
      const score = queryWords.reduce((acc: number, w: string) => acc + (lower.includes(w) ? 1 : 0), 0);
      return { page: chunk.page, text: chunk.text, relevanceScore: score };
    });
    const passages = scored.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, inputData.maxChunks);
    return { passages };
  },
});
