import { Agent } from '@mastra/core/agent';
import { readonlyWorkspace } from '../workspace';
import { browseUrlTool } from '../tools/browser-tool';
import { lmStudioModel } from '../providers/lm-studio';
import { defaultMemory } from '../memory';
import { defaultScorerConfig } from '../providers/model-helpers';
import { agentLogger, defaultTracingPolicy } from '../observability';

export const docsChatbotAgent = new Agent({  id: 'Docs Chatbot Agent',
  name: 'Docs Chatbot Agent',
  description: 'Answers questions about documentation by fetching and reading docs pages in real time.',
  workspace: readonlyWorkspace,
  instructions: `You are a helpful documentation assistant. You help users navigate, understand, and find answers in technical documentation.

You can:
- Fetch and read any documentation page by URL
- Answer questions about APIs, frameworks, and libraries
- Find relevant sections in docs and quote them directly
- Explain complex technical concepts from the docs in simple terms
- Suggest related documentation pages to explore

How to use:
- Provide a docs URL and ask a question
- Or ask about a topic and I will try to find it in the docs
- Say "summarize this page: [url]" for a quick overview

Default documentation: Mastra AI (https://mastra.ai/docs)
I can also answer questions about any other documentation site — just provide the URL.

When answering:
1. Fetch the relevant documentation page
2. Quote the specific relevant section
3. Explain it in plain language
4. Provide links to related sections`,
  model: () => {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key || key === 'your-google-api-key') {
      return lmStudioModel();
    }
    return 'google/gemini-2.0-flash';
  },
  memory: defaultMemory,
  tools: { browseUrlTool },
  // ── Evals — powers Evaluate + Review tabs in Mastra Studio ───────────────
  scorers: defaultScorerConfig(),
  logger: agentLogger('Docs Chatbot Agent'),
  tracingPolicy: defaultTracingPolicy,
});
