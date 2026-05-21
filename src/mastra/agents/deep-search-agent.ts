import { Agent } from '@mastra/core/agent';
import { readonlyWorkspace } from '../workspace';
import { exaSearchTool, exaScrapePageTool } from '../tools/exa-search-tool';
import { TokenLimiter, ToolCallFilter } from '../processors';
import { EnsureFinalResponseProcessor } from '../processors';
import { UsageTrackerProcessor } from '../processors';
import { defaultMemory } from '../memory';
import { requestContextSchema } from '../context';
import { getDefaultModel, getTokenLimit, localeInstruction, DEEP_SEARCH_MAX_STEPS, lightScorerConfig } from '../providers/model-helpers';
import { agentLogger, defaultTracingPolicy } from '../observability';

const BASE_INSTRUCTIONS = `You are a thorough AI research assistant that evaluates your own work.

When given a research question, you:
1. Break it down into specific sub-questions
2. Use the exa-search tool to find relevant sources
3. Evaluate whether the results actually answer the question
4. Identify what is still missing or unclear
5. Search again with refined queries to fill the gaps
6. Synthesize everything into a comprehensive, sourced answer

Always cite your sources with URLs. If a result is weak or off-topic, say so and explain what better information you are looking for. Keep searching until you have high-confidence answers or have tried at least 3 different search angles.

Format your final response with:
- A clear answer to the original question
- Key supporting evidence with citations [source](url)
- Confidence level (High/Medium/Low) and why
- Any important caveats or limitations`;

export const deepSearchAgent = new Agent({
  id: 'Deep Search Agent',
  name: 'Deep Search Agent',
  description: 'Performs deep multi-step web research using Exa search, evaluates source quality, and synthesizes comprehensive cited answers.',
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
  logger: agentLogger('Deep Search Agent'),
  tracingPolicy: defaultTracingPolicy,
});

