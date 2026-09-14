import { Agent } from '@mastra/core/agent';
import { readonlyWorkspace } from '../workspace';
import { skillListTool } from '../tools/skill-list-tool';
import { exaSearchTool } from '../tools/exa-search-tool';
import { listRepositoryAgentsTool } from '../tools/list-repository-agents-tool';
import { createNewAgentTool } from '../tools/create-new-agent-tool';
import { generateCanvasWorkflowTool } from '../tools/generate-canvas-workflow-tool';
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

Co-Pilot Tools — use in this order:
- \`list_repository_agents\`: ALWAYS call this first when a user asks to add an agent to a workflow. Returns the full AWAS agent registry with capability tags so you never create duplicates.
- \`create_new_agent\`: Call ONLY when \`list_repository_agents\` confirms no existing agent satisfies the requirement. Returns a TypeScript scaffold and registration instructions.
- \`generate_canvas_workflow\`: Call to commit the final DAG to the AWAS Studio canvas. Validates the DAG for cycles, auto-layouts node positions, and returns the canvas definition plus a Mermaid preview.

When responding:
- Be concise, structured, and practical.
- Provide ready-to-copy system prompts, JSON schemas, or step-by-step canvas wiring guidelines.
- Highlight key node connections and parameter dependencies clearly.
- Always show the Mermaid diagram from \`generate_canvas_workflow\` output so users can preview the workflow visually.`;

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

  tools: {
    skillListTool,
    exaSearchTool,
    listRepositoryAgentsTool,
    createNewAgentTool,
    generateCanvasWorkflowTool,
  },

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
