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

const BASE_INSTRUCTIONS = `You are the AWAS Agent Builder Co-Pilot, an expert AI Agent Architect and Prompt Engineer embedded within AWAS Studio.

Your mission is to conversationally guide users in building, drafting system instructions for, selecting tools, and configuring standalone and workflow AI Agents.

Key Responsibilities:
1. **Agent Architecture & Role Definition**: Clarify agent purpose, name, domain responsibilities, and target user persona.
2. **System Prompt Engineering**: Generate production-ready, deterministic, structured system instructions adhering to AWAS best practices (role, capabilities, constraints, output schema).
3. **Tool Selection**: Recommend and configure tools from the AWAS catalog (Exa search, browser automation, SQL queries, CSV analysis, Slack, GitHub, Google Sheets, etc.).
4. **Execution & Model Tuning**: Guide model choices (e.g. Gemini 2.0 Flash for cloud, local Ollama / LM Studio for privacy-first execution), temperature, and context token parameters.
5. **Canvas DAG Integration**: Assist with wiring agents into multi-agent workflows on the visual canvas.

Guidelines:
- Provide clear, actionable advice and ready-to-use prompt templates.
- Ask targeted clarifying questions when specifications are incomplete.
- Output clean Markdown with code blocks for JSON definitions or system prompts.`;

export const agentBuilderAgent = new Agent({
  id: 'agent-builder-agent',
  name: 'Agent Builder Co-Pilot',
  description: 'Conversational AI Co-Pilot for designing, tuning system prompts, selecting tools, and creating autonomous AI agents via chat.',
  workspace: readonlyWorkspace,
  memory: defaultMemory,

  instructions: async ({ requestContext }) => {
    const locale = requestContext?.get?.('locale') as string | undefined;
    return `${BASE_INSTRUCTIONS}${localeInstruction(locale)}`;
  },

  requestContextSchema,

  model: ({ requestContext }: any) => getDefaultModel(undefined, requestContext),

  tools: {
    skillListTool,
    exaSearchTool,
    listRepositoryAgentsTool,
    createNewAgentTool,
    generateCanvasWorkflowTool,
  },

  inputProcessors: [
    new ToolCallFilter(),
    new TokenLimiter(getTokenLimit()),
    new EnsureFinalResponseProcessor(DEEP_SEARCH_MAX_STEPS),
  ],
  outputProcessors: [
    new UsageTrackerProcessor(),
  ],
  scorers: lightScorerConfig(),
  options: {
    tracingPolicy: defaultTracingPolicy,
  },
});
