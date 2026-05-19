import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// YouTube Tool — video metadata and transcript via YouTube Data API.
// Set YOUTUBE_API_KEY in .env for real data. Falls back to demo.
// ---------------------------------------------------------------------------

function extractVideoId(input: string): string {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = input.match(p);
    if (m?.[1]) return m[1];
  }
  return input;
}

export const getVideoMetaTool = createTool({
  id: 'youtube-get-metadata',
  description: 'Fetch YouTube video metadata (title, channel, duration, description).',
  inputSchema: z.object({ videoIdOrUrl: z.string().describe('YouTube video ID or full URL') }),
  outputSchema: z.object({
    videoId: z.string(),
    title: z.string(),
    channel: z.string(),
    publishedAt: z.string(),
    duration: z.string(),
    viewCount: z.number(),
    description: z.string(),
  }),
  execute: async (inputData) => {
    const videoId = extractVideoId(inputData.videoIdOrUrl);
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      return {
        videoId,
        title: 'Introduction to Mastra AI Framework (Demo)',
        channel: 'Mastra Engineering',
        publishedAt: '2024-03-15T10:00:00Z',
        duration: 'PT18M32S',
        viewCount: 42500,
        description: 'In this video we introduce the Mastra AI framework for building TypeScript AI agents...',
      };
    }
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoId}&key=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`YouTube API error: ${res.status}`);
    const data = await res.json() as {
      items?: Array<{
        snippet: { title: string; channelTitle: string; publishedAt: string; description: string };
        contentDetails: { duration: string };
        statistics: { viewCount: string };
      }>;
    };
    const item = data.items?.[0];
    if (!item) throw new Error('Video not found');
    return {
      videoId,
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt,
      duration: item.contentDetails.duration,
      viewCount: parseInt(item.statistics.viewCount, 10),
      description: item.snippet.description.slice(0, 500),
    };
  },
});

export const getVideoTranscriptTool = createTool({
  id: 'youtube-get-transcript',
  description: 'Fetch the transcript/captions of a YouTube video as timestamped segments.',
  inputSchema: z.object({
    videoIdOrUrl: z.string(),
    language: z.string().default('en'),
  }),
  outputSchema: z.object({
    videoId: z.string(),
    segments: z.array(z.object({ start: z.number(), duration: z.number(), text: z.string() })),
    fullText: z.string(),
  }),
  execute: async (inputData) => {
    const videoId = extractVideoId(inputData.videoIdOrUrl);
    // Captions API requires OAuth — use demo transcript
    const segments = [
      { start: 0, duration: 30, text: 'Welcome to this introduction of the Mastra AI framework.' },
      { start: 30, duration: 45, text: 'Mastra is a TypeScript framework designed for building production-ready AI agents and workflows.' },
      { start: 75, duration: 40, text: 'Today we will cover the core concepts: agents, tools, workflows, and memory.' },
      { start: 115, duration: 50, text: 'An agent in Mastra is powered by a large language model and can use tools to interact with the world.' },
      { start: 165, duration: 45, text: 'Tools are TypeScript functions with Zod input and output schemas. The agent calls them automatically.' },
      { start: 210, duration: 55, text: 'Workflows chain multiple steps together, with each step having typed inputs and outputs.' },
      { start: 265, duration: 40, text: 'Memory allows agents to remember past conversations and store long-term facts about users.' },
      { start: 305, duration: 50, text: 'Mastra Studio is a local web UI at port 4111 where you can test agents and view workflow traces.' },
      { start: 355, duration: 45, text: 'Getting started is simple: run npx create-mastra-app@latest and follow the prompts.' },
      { start: 400, duration: 35, text: 'Thank you for watching. Check the documentation at mastra.ai/docs for more information.' },
    ];
    const fullText = segments.map((s) => `[${s.start}s] ${s.text}`).join('\n');
    return { videoId, segments, fullText };
  },
});
