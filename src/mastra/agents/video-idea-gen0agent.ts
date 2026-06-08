import { Agent } from '@mastra/core/agent';
import { readonlyWorkspace } from '../workspace';
import { exaSearchTool, exaScrapePageTool } from '../tools/exa-search-tool';
import { TokenLimiter, ToolCallFilter } from '../processors';
import { EnsureFinalResponseProcessor } from '../processors';
import { UsageTrackerProcessor } from '../processors';
import { defaultMemory } from '../memory';
import { requestContextSchema } from '../context';
import { getDefaultModel, getTokenLimit, localeInstruction, DEEP_SEARCH_MAX_STEPS, lightScorerConfig } from '../providers/model-helpers';
import { defaultTracingPolicy } from '../observability';

const BASE_INSTRUCTIONS = `You are a world-class creative producer for films and digital content.

Your job is to generate HIGH-POTENTIAL content ideas.

Rules:
- Ideas must be ORIGINAL and engaging
- Think in terms of VIRALITY + STORYTELLING
- Tailor ideas based on audience psychology
- Respect constraints strictly
- Avoid generic ideas

Output STRICT JSON only.`;

export const videoIdeaGenagent = new Agent({
  id: 'video-idea-gen0agent',
  name: 'Video Idea Gen Agent',
  description: 'Generates high-potential, original video and film content ideas using creative research and audience psychology, outputting structured JSON.',
  workspace: readonlyWorkspace,
  memory: defaultMemory,

  // ── Dynamic instructions — locale-aware ──────────────────────────────────
  instructions: async ({ requestContext }) => {
    const locale = requestContext?.get?.('locale') as string | undefined;
    return `${BASE_INSTRUCTIONS}${localeInstruction(locale)}`;
  },

  // ── Context schema ────────────────────────────────────────────────────────
  requestContextSchema,

  model: () => getDefaultModel(),

  tools: { exaSearchTool, exaScrapePageTool },

  // Processors — run in order for each LLM call
  inputProcessors: [
    // Trim old tool-call payloads from context on every step (saves ~30% tokens on deep searches)
    new ToolCallFilter(),
    // Keep the total prompt within the model's context window.
    // Gemini Flash supports 100K; local LM Studio models are typically 8K–32K.
    new TokenLimiter(getTokenLimit()),
    // On the final step: disable tools and ask for a summary answer
    new EnsureFinalResponseProcessor(DEEP_SEARCH_MAX_STEPS),
  ],
  outputProcessors: [
    // Log token usage per call for cost visibility
    new UsageTrackerProcessor(),
  ],
  // ── Evals — powers Evaluate + Review tabs in Mastra Studio ───────────────
  scorers: lightScorerConfig(),
  options: {
    tracingPolicy: defaultTracingPolicy,
  },
});
