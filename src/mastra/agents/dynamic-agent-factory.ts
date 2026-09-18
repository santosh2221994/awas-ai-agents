import { Agent } from '@mastra/core/agent';
import { readonlyWorkspace } from '../workspace';
import { defaultMemory } from '../memory';
import { requestContextSchema } from '../context';
import { getDefaultModel, getTokenLimit, localeInstruction, lightScorerConfig } from '../providers/model-helpers';
import { defaultTracingPolicy } from '../observability';
import { TokenLimiter, ToolCallFilter, EnsureFinalResponseProcessor, UsageTrackerProcessor } from '../processors';

// Tool imports
import { skillListTool } from '../tools/skill-list-tool';
import { exaSearchTool } from '../tools/exa-search-tool';
import { calculatorWithUITool } from '../tools/calculator-ui-tool';
import { weatherTool } from '../tools/weather-tool';
import { listTablesTool, executeSqlTool } from '../tools/sql-tool';
import { parseCsvTool, analyzeColumnTool } from '../tools/csv-tool';
import { loadPdfTool, searchPdfTool } from '../tools/pdf-tool';
import { readSheetTool, writeSheetTool } from '../tools/google-sheets-tool';
import { getPrDiffTool, postReviewCommentTool } from '../tools/github-tool';
import { listSlackChannelsTool, readSlackChannelTool, sendSlackMessageTool } from '../tools/slack-tool';
import { getVideoMetaTool, getVideoTranscriptTool } from '../tools/youtube-tool';

export const AVAILABLE_TOOLS_MAP: Record<string, any> = {
  skillListTool,
  'skill-list-tool': skillListTool,
  'skill_list': skillListTool,
  exaSearchTool,
  'exa-search-tool': exaSearchTool,
  'exa-search': exaSearchTool,
  calculatorWithUITool,
  'calculator-ui-tool': calculatorWithUITool,
  weatherTool,
  'weather-tool': weatherTool,
  listTablesTool,
  executeSqlTool,
  'sql-tool': executeSqlTool,
  parseCsvTool,
  analyzeColumnTool,
  'csv-tool': parseCsvTool,
  loadPdfTool,
  searchPdfTool,
  'pdf-tool': loadPdfTool,
  readSheetTool,
  writeSheetTool,
  'google-sheets-tool': readSheetTool,
  getPrDiffTool,
  postReviewCommentTool,
  'github-tool': getPrDiffTool,
  listSlackChannelsTool,
  readSlackChannelTool,
  sendSlackMessageTool,
  'slack-tool': sendSlackMessageTool,
  getVideoMetaTool,
  getVideoTranscriptTool,
  'youtube-tool': getVideoMetaTool,
};

export interface DynamicAgentOptions {
  name?: string;
  description?: string;
  instructions?: string;
  tools?: string[] | Record<string, any>;
  modelId?: string;
}

export function createDynamicAgent(agentId: string, options?: DynamicAgentOptions): Agent {
  const cleanName =
    options?.name ||
    (agentId.startsWith('custom-')
      ? `Custom Agent (${agentId.replace(/^custom-/, '')})`
      : agentId
          .split('-')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' '));

  const baseInstructions =
    options?.instructions ||
    `You are ${cleanName}, an autonomous AI specialist in the AWAS (Agentic Workplace Automation System) platform.

Your primary mission:
- Carefully analyze user queries and tasks.
- Execute tasks accurately, adhering to instructions and role constraints.
- Utilize available tools when needed to gather data or perform actions.
- Provide clear, structured, and insightful answers.`;

  // Resolve tools
  const toolsToRegister: Record<string, any> = {
    skillListTool,
    exaSearchTool,
    calculatorWithUITool,
  };

  if (Array.isArray(options?.tools)) {
    for (const toolKey of options.tools) {
      const resolved = AVAILABLE_TOOLS_MAP[toolKey] || AVAILABLE_TOOLS_MAP[toolKey.toLowerCase()];
      if (resolved) {
        const id = resolved.id || toolKey;
        toolsToRegister[id] = resolved;
      }
    }
  } else if (options?.tools && typeof options.tools === 'object') {
    Object.assign(toolsToRegister, options.tools);
  }

  return new Agent({
    id: agentId,
    name: cleanName,
    description: options?.description || `Autonomous AI agent for ${cleanName}`,
    workspace: readonlyWorkspace,
    memory: defaultMemory,

    instructions: async ({ requestContext }) => {
      const locale = requestContext?.get?.('locale') as string | undefined;
      return `${baseInstructions}${localeInstruction(locale)}`;
    },

    requestContextSchema,

    model: ({ requestContext }: any) => getDefaultModel(options?.modelId, requestContext),

    tools: toolsToRegister,

    inputProcessors: [
      new ToolCallFilter(),
      new TokenLimiter(getTokenLimit()),
      new EnsureFinalResponseProcessor(10),
    ],
    outputProcessors: [
      new UsageTrackerProcessor(),
    ],
    scorers: lightScorerConfig(),
    options: {
      tracingPolicy: defaultTracingPolicy,
    },
  });
}
