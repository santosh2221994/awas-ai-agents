import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { requestContextSchema } from '../context';

const researchTrendsStep = createStep({
  id: 'research-trends',
  description: 'Research current trends and audience interests for the topic',
  inputSchema: z.object({
    topic: z.string().describe('Topic or niche for video ideas'),
    audience: z.string().optional().describe('Target audience description'),
    count: z.number().optional().describe('Number of ideas to generate (default: 5)'),
  }),
  outputSchema: z.object({
    topic: z.string(),
    audience: z.string().optional(),
    count: z.number(),
    trends: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('videoIdeaGenagent');
    if (!agent) return { topic: inputData.topic, audience: inputData.audience, count: inputData.count ?? 5, trends: '' };
    const result = await agent.generate([
      {
        role: 'user',
        content: `Use exa-search to research current trends, viral content, and audience interests for this topic: "${inputData.topic}"${inputData.audience ? `. Target audience: ${inputData.audience}` : ''}. Summarize the top trends and what's working.`,
      },
    ]);
    return { topic: inputData.topic, audience: inputData.audience, count: inputData.count ?? 5, trends: result.text };
  },
});

const generateIdeasStep = createStep({
  id: 'generate-ideas',
  description: 'Generate original, high-potential video ideas based on the research',
  inputSchema: z.object({
    topic: z.string(),
    audience: z.string().optional(),
    count: z.number(),
    trends: z.string(),
  }),
  outputSchema: z.object({
    topic: z.string(),
    count: z.number(),
    rawIdeas: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('videoIdeaGenagent');
    if (!agent) return { topic: inputData.topic, count: inputData.count, rawIdeas: '' };
    const result = await agent.generate([
      {
        role: 'user',
        content: `Based on these trends:\n${inputData.trends}\n\nGenerate ${inputData.count} original, high-potential video ideas for topic: "${inputData.topic}"${inputData.audience ? `. Target audience: ${inputData.audience}` : ''}.\n\nFor each idea include: title, hook, format, virality score (1-10), and why it will work.`,
      },
    ]);
    return { topic: inputData.topic, count: inputData.count, rawIdeas: result.text };
  },
});

const formatJsonStep = createStep({
  id: 'format-json',
  description: 'Format the video ideas as structured JSON output',
  inputSchema: z.object({
    topic: z.string(),
    count: z.number(),
    rawIdeas: z.string(),
  }),
  outputSchema: z.object({
    topic: z.string(),
    ideas: z.array(z.object({
      title: z.string(),
      hook: z.string(),
      format: z.string(),
      viralityScore: z.number(),
      rationale: z.string(),
    })),
    rawIdeas: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('videoIdeaGenagent');
    if (!agent) return { topic: inputData.topic, ideas: [], rawIdeas: inputData.rawIdeas };
    const result = await agent.generate([
      {
        role: 'user',
        content: `Convert these video ideas into strict JSON array format:\n\n${inputData.rawIdeas}\n\nRespond ONLY with a JSON array:\n[{"title":"...","hook":"...","format":"...","viralityScore":8,"rationale":"..."}]`,
      },
    ]);
    let ideas: Array<{ title: string; hook: string; format: string; viralityScore: number; rationale: string }> = [];
    try {
      const match = result.text.match(/\[[\s\S]*\]/);
      if (match) ideas = JSON.parse(match[0]);
    } catch { /* fallback to empty */ }
    return { topic: inputData.topic, ideas, rawIdeas: inputData.rawIdeas };
  },
});

export const videoIdeaGenWorkflow = createWorkflow({
  id: 'video-idea-gen-workflow',
  description: 'Researches trends, generates original high-potential video ideas, and returns them as structured JSON.',
  requestContextSchema,
  inputSchema: z.object({
    topic: z.string().describe('Topic or niche for video idea generation'),
    audience: z.string().optional().describe('Target audience description'),
    count: z.number().optional().describe('Number of ideas to generate (default: 5)'),
  }),
  outputSchema: z.object({
    topic: z.string(),
    ideas: z.array(z.object({
      title: z.string(),
      hook: z.string(),
      format: z.string(),
      viralityScore: z.number(),
      rationale: z.string(),
    })),
    rawIdeas: z.string(),
  }),
})
  .then(researchTrendsStep)
  .then(generateIdeasStep)
  .then(formatJsonStep);

videoIdeaGenWorkflow.commit();
