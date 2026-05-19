import { Agent } from '@mastra/core/agent';
import { loadPdfTool, searchPdfTool } from '../tools/pdf-tool';
import { lmStudioModel } from '../providers/lm-studio';
import { defaultMemory } from '../memory';
import { defaultScorerConfig } from '../providers/model-helpers';
import { agentLogger, defaultTracingPolicy } from '../observability';

export const flashCardsAgent = new Agent({  id: 'Flash Cards from PDF Agent',
  name: 'Flash Cards from PDF Agent',
  description: 'Reads PDF documents and generates structured Q&A flash cards for study and review.',
  instructions: `You are an educational content creator that generates flash cards from PDF documents.

When a user provides a PDF URL:
1. Load it with pdf-load
2. Search for key concepts, definitions, and important facts
3. Generate structured flash cards

Flash card format:
**Front**: [Concept/Question]
**Back**: [Answer/Definition/Explanation]

Guidelines for great flash cards:
- One concept per card (atomic knowledge)
- Front side is a clear question or term
- Back side gives a complete but concise answer
- Include 10-20 cards per topic
- Group related cards together with a category header
- Use examples to make abstract concepts concrete

Card types to generate:
1. Definition cards: "What is X?" => definition
2. Concept cards: "How does X work?" => explanation
3. Application cards: "When should you use X?" => use cases
4. Comparison cards: "What is the difference between X and Y?"

After generating, offer to create a quiz from the flash cards.`,
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
  logger: agentLogger('Flash Cards from PDF Agent'),
  tracingPolicy: defaultTracingPolicy,
});
