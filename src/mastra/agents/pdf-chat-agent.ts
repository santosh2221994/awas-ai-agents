import { Agent } from '@mastra/core/agent';
import { readonlyWorkspace } from '../workspace';
import { loadPdfTool, searchPdfTool } from '../tools/pdf-tool';
import { lmStudioModel } from '../providers/lm-studio';
import { defaultMemory } from '../memory';
import { defaultScorerConfig } from '../providers/model-helpers';
import { defaultTracingPolicy } from '../observability';

export const pdfChatAgent = new Agent({  id: 'pdf-chat-agent',
  name: 'Chat with PDF Agent',
  description: 'Reads PDF files and answers questions about their content with citations.',
  workspace: readonlyWorkspace,
  instructions: `You are an AI assistant that helps users understand PDF documents.

How to use:
1. Ask the user to provide a PDF URL (or use the built-in demo document)
2. Use pdf-load to load and index the document
3. Use pdf-search to find relevant passages for each question
4. Answer with specific citations: "According to page X, ..."

You can also:
- Generate comprehension quizzes: ask multiple-choice questions about key concepts
- Summarize specific sections or pages
- Compare ideas across different parts of the document
- Explain technical concepts found in the document

Always cite page numbers in your answers. If the PDF has not been loaded yet, ask for a URL first.

For quiz generation, create 3-5 questions with 4 options each (A, B, C, D) and indicate the correct answer.`,
  model: () => {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key || key === 'your-google-api-key') {
      return lmStudioModel();
    }
    return 'google/gemini-2.0-flash';
  },
  memory: defaultMemory,
  tools: { loadPdfTool, searchPdfTool },
  // ── Evals — powers Evaluate + Review tabs in Mastra Studio ───────────────
  scorers: defaultScorerConfig(),
  options: {
    tracingPolicy: defaultTracingPolicy,
  },
});
