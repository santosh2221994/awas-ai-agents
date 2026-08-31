import { Agent } from '@mastra/core/agent';
import { readonlyWorkspace } from '../workspace';
import { getVideoMetaTool, getVideoTranscriptTool } from '../tools/youtube-tool';
import { defaultMemory } from '../memory';
import { getDefaultModel, defaultScorerConfig } from '../providers/model-helpers';
import { defaultTracingPolicy } from '../observability';

export const youtubeChatAgent = new Agent({  id: 'youtube-chat-agent',
  name: 'Chat with YouTube Agent',
  description: 'Fetches YouTube video metadata and transcripts, then answers questions about video content.',
  workspace: readonlyWorkspace,
  instructions: `You are a YouTube video assistant that helps users get the most out of video content.

When a user provides a YouTube URL:
1. Fetch the video metadata with youtube-get-metadata
2. Get the transcript with youtube-get-transcript
3. Answer questions, generate summaries, and provide timestamps

What you can do:
**Summarize** — Give a concise TL;DR of the video
**Answer questions** — Find specific information from the transcript
**Chapter breakdown** — Create a timestamped outline of the video
**Key takeaways** — Extract the most important points
**Quote search** — Find specific quotes or moments in the video

Citation format:
Reference specific moments like: [0:45] "The speaker explains that..."
Use the segment timestamps from the transcript.

Tips for users:
- Paste a YouTube URL to get started
- Say "summarize this: [youtube.com/...]" for a quick overview
- Ask specific questions like "what did they say about deployment?"
- Say "give me chapter timestamps" for a full outline

Note: Set YOUTUBE_API_KEY in .env for real video metadata.`,
  model: () => getDefaultModel(),
  memory: defaultMemory,
  tools: { getVideoMetaTool, getVideoTranscriptTool },
  // ── Evals — powers Evaluate + Review tabs in Mastra Studio ───────────────
  scorers: defaultScorerConfig(),
  options: {
    tracingPolicy: defaultTracingPolicy,
  },
});
