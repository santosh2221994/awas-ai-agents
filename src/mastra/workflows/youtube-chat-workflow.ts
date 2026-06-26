import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { requestContextSchema } from '../context';

const fetchMetadataStep = createStep({
  id: 'fetch-metadata',
  description: 'Fetch the YouTube video metadata',
  inputSchema: z.object({
    videoUrl: z.string().describe('YouTube video URL'),
    question: z.string().describe('Question to answer about the video'),
  }),
  outputSchema: z.object({
    videoUrl: z.string(),
    question: z.string(),
    metadata: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('youtubeChatAgent');
    if (!agent) return { videoUrl: inputData.videoUrl, question: inputData.question, metadata: '' };
    const result = await agent.generate([
      { role: 'user', content: `Fetch the metadata for this YouTube video using youtube-get-metadata: ${inputData.videoUrl}` },
    ]);
    return { videoUrl: inputData.videoUrl, question: inputData.question, metadata: result.text };
  },
});

const getTranscriptStep = createStep({
  id: 'get-transcript',
  description: 'Fetch the video transcript with timestamps',
  inputSchema: z.object({
    videoUrl: z.string(),
    question: z.string(),
    metadata: z.string(),
  }),
  outputSchema: z.object({
    videoUrl: z.string(),
    question: z.string(),
    metadata: z.string(),
    transcript: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('youtubeChatAgent');
    if (!agent) return { ...inputData, transcript: '' };
    const result = await agent.generate([
      { role: 'user', content: `Fetch the transcript with timestamps for this YouTube video using youtube-get-transcript: ${inputData.videoUrl}` },
    ]);
    return { videoUrl: inputData.videoUrl, question: inputData.question, metadata: inputData.metadata, transcript: result.text };
  },
});

const answerQuestionsStep = createStep({
  id: 'answer-questions',
  description: 'Answer the question using the transcript with timestamp citations',
  inputSchema: z.object({
    videoUrl: z.string(),
    question: z.string(),
    metadata: z.string(),
    transcript: z.string(),
  }),
  outputSchema: z.object({
    videoUrl: z.string(),
    question: z.string(),
    answer: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('youtubeChatAgent');
    if (!agent) return { videoUrl: inputData.videoUrl, question: inputData.question, answer: inputData.transcript };
    const result = await agent.generate([
      {
        role: 'user',
        content: `Video metadata:\n${inputData.metadata}\n\nTranscript:\n${inputData.transcript}\n\nAnswer this question with timestamp citations [0:00] format:\n"${inputData.question}"`,
      },
    ]);
    return { videoUrl: inputData.videoUrl, question: inputData.question, answer: result.text };
  },
});

export const youtubeChatWorkflow = createWorkflow({
  id: 'youtube-chat-workflow',
  description: 'Fetches YouTube video metadata and transcript, then answers questions with timestamp citations.',
  requestContextSchema,
  inputSchema: z.object({
    videoUrl: z.string().describe('YouTube video URL to analyze'),
    question: z.string().describe('Question to answer about the video content'),
  }),
  outputSchema: z.object({
    videoUrl: z.string(),
    question: z.string(),
    answer: z.string(),
  }),
})
  .then(fetchMetadataStep)
  .then(getTranscriptStep)
  .then(answerQuestionsStep);

youtubeChatWorkflow.commit();
