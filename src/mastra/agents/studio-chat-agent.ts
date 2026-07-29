import { Agent } from '@mastra/core/agent';
import { readonlyWorkspace } from '../workspace';
import { skillListTool } from '../tools/skill-list-tool';
import { exaSearchTool } from '../tools/exa-search-tool';
import { TokenLimiter, ToolCallFilter, EnsureFinalResponseProcessor, UsageTrackerProcessor } from '../processors';
import { defaultMemory } from '../memory';
import { requestContextSchema } from '../context';
import { getDefaultModel, getTokenLimit, localeInstruction, DEEP_SEARCH_MAX_STEPS, lightScorerConfig } from '../providers/model-helpers';
import { defaultTracingPolicy } from '../observability';

const BASE_INSTRUCTIONS = `You are the AWAS Studio Chat Co-Pilot, an intelligent assistant embedded within the AWAS Agent & Workflow Studio.

Your mission is to guide users in building, configuring, and optimizing AI agents and workflow canvas DAGs.

Key Capabilities:
1. **Agent Prompt Crafting & Tuning**: Assist users in writing clear, structured, deterministic system instructions for custom agents.
2. **Tool Selection & Recommendation**: Recommend appropriate tools based on user objectives. Use the \`skill_list\` tool to inspect registered platform agent skills or \`exa-search\` to research web documentation and external APIs.
3. **Workflow Canvas & Node Setup**: Help users structure canvas nodes, define parameter mappings, handle input/output bindings, and auto-wire multi-agent workflows.
4. **Model & Execution Optimization**: Recommend model options (e.g. Gemini 2.0 Flash, Llama 3.2), temperature, token limits, and execution mode routing (cloud vs. local).

When responding:
- Be concise, structured, and practical.
- Provide ready-to-copy system prompts, JSON schemas, or step-by-step canvas wiring guidelines.
- Highlight key node connections and parameter dependencies clearly.`;

export const studioChatAgent = new Agent({
  id: 'studio-chat-agent',
  name: 'Studio Chat Co-Pilot Agent',
  description: 'AI-assisted Studio Co-Pilot for AWAS canvas and agent editor. Assists users with system prompt drafting, tool selection, model tuning, node configurations, parameter mapping, and workflow auto-wiring.',
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

  tools: { skillListTool, exaSearchTool },

  // Processors — run in order for each LLM call
  inputProcessors: [
    new ToolCallFilter(),
    new TokenLimiter(getTokenLimit()),
    new EnsureFinalResponseProcessor(DEEP_SEARCH_MAX_STEPS),
  ],
  outputProcessors: [
    new UsageTrackerProcessor(),
  ],
  // ── Evals — powers Evaluate + Review tabs in Mastra Studio ───────────────
  scorers: lightScorerConfig(),
  options: {
    tracingPolicy: defaultTracingPolicy,
  },
});
