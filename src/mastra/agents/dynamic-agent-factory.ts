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
import { parseCsvTool, analyzeColumnTool, generateCsvTool } from '../tools/csv-tool';
import { loadPdfTool, searchPdfTool } from '../tools/pdf-tool';
import { readSheetTool, writeSheetTool } from '../tools/google-sheets-tool';
import { getPrDiffTool, postReviewCommentTool, getRepoBranchesTool, getRepoDetailsTool, listPullRequestsTool, listUserReposTool } from '../tools/github-tool';
import { listSlackChannelsTool, readSlackChannelTool, sendSlackMessageTool } from '../tools/slack-tool';
import { getVideoMetaTool, getVideoTranscriptTool } from '../tools/youtube-tool';
import { browseUrlTool, searchWebTool, extractPageDataTool } from '../tools/browser-tool';
import { listRepositoryAgentsTool } from '../tools/list-repository-agents-tool';
import { createNewAgentTool } from '../tools/create-new-agent-tool';
import { generateCanvasWorkflowTool } from '../tools/generate-canvas-workflow-tool';
import { generateImageTool, enhanceImagePromptTool, listImageModelsTool } from '../tools/image-generation-tool';

export const AVAILABLE_TOOLS_MAP: Record<string, any> = {
  // Browser tools
  browseUrlTool,
  searchWebTool,
  extractPageDataTool,
  'browser-tool': browseUrlTool,
  'browser_tool': browseUrlTool,
  'browser-read-url': browseUrlTool,
  'read-url': browseUrlTool,
  'browser-web-search': searchWebTool,
  'web-search': searchWebTool,
  'browser-extract-data': extractPageDataTool,

  // Skills
  skillListTool,
  'skill-list-tool': skillListTool,
  'skill_list': skillListTool,
  'skill-list': skillListTool,

  // Search
  exaSearchTool,
  'exa-search-tool': exaSearchTool,
  'exa-search': exaSearchTool,

  // Math
  calculatorWithUITool,
  'calculator-ui-tool': calculatorWithUITool,
  'calculator_with_ui': calculatorWithUITool,
  'calculator': calculatorWithUITool,

  // Weather
  weatherTool,
  'weather-tool': weatherTool,
  'get-weather': weatherTool,
  'weather': weatherTool,

  // SQL
  listTablesTool,
  executeSqlTool,
  'sql-tool': executeSqlTool,
  'sql-execute-query': executeSqlTool,
  'execute-sql': executeSqlTool,
  'sql-list-tables': listTablesTool,
  'sql-describe-table': listTablesTool,
  'describe-table': listTablesTool,
  'list-tables': listTablesTool,

  // CSV
  parseCsvTool,
  analyzeColumnTool,
  generateCsvTool,
  'csv-tool': parseCsvTool,
  'csv-parse': parseCsvTool,
  'csv-parser': parseCsvTool,
  'csv-analyze-column': analyzeColumnTool,
  'csv-generate': generateCsvTool,
  'generate-csv': generateCsvTool,
  'csv-creator': generateCsvTool,
  'create-csv': generateCsvTool,
  'csv-export': generateCsvTool,

  // PDF
  loadPdfTool,
  searchPdfTool,
  'pdf-tool': loadPdfTool,
  'pdf-load': loadPdfTool,
  'pdf-parse': loadPdfTool,
  'pdf-search': searchPdfTool,

  // Google Sheets
  readSheetTool,
  writeSheetTool,
  'google-sheets-tool': readSheetTool,
  'google-sheets-read': readSheetTool,
  'read-sheet': readSheetTool,
  'google-sheets-write': writeSheetTool,
  'write-sheet': writeSheetTool,

  // GitHub
  getPrDiffTool,
  postReviewCommentTool,
  getRepoBranchesTool,
  getRepoDetailsTool,
  listPullRequestsTool,
  listUserReposTool,
  'github-tool': listUserReposTool,
  'github-list-repos': listUserReposTool,
  'github-repos': listUserReposTool,
  'github-get-branches': getRepoBranchesTool,
  'github-get-repo-branches': getRepoBranchesTool,
  'github-list-branches': getRepoBranchesTool,
  'github-branches': getRepoBranchesTool,
  'github-get-repo-details': getRepoDetailsTool,
  'github-repo-details': getRepoDetailsTool,
  'github-list-prs': listPullRequestsTool,
  'github-prs': listPullRequestsTool,
  'github-get-pr-diff': getPrDiffTool,
  'github-pr-diff': getPrDiffTool,
  'github-post-review': postReviewCommentTool,
  'github-post-review-comment': postReviewCommentTool,

  // Slack
  listSlackChannelsTool,
  readSlackChannelTool,
  sendSlackMessageTool,
  'slack-tool': sendSlackMessageTool,
  'slack-send-message': sendSlackMessageTool,
  'slack-list-channels': listSlackChannelsTool,
  'slack-read-channel': readSlackChannelTool,
  'slack-read-messages': readSlackChannelTool,

  // YouTube
  getVideoMetaTool,
  getVideoTranscriptTool,
  'youtube-tool': getVideoMetaTool,
  'youtube-get-metadata': getVideoMetaTool,
  'youtube-get-meta': getVideoMetaTool,
  'youtube-get-transcript': getVideoTranscriptTool,

  // Studio Workflow Tools
  listRepositoryAgentsTool,
  createNewAgentTool,
  generateCanvasWorkflowTool,
  'list-repository-agents': listRepositoryAgentsTool,
  'list-repository-agents-tool': listRepositoryAgentsTool,
  'create-new-agent': createNewAgentTool,
  'create-new-agent-tool': createNewAgentTool,
  'generate-canvas-workflow': generateCanvasWorkflowTool,
  'generate-canvas-workflow-tool': generateCanvasWorkflowTool,

  // Text-to-Image Generation Tools (Qwen Image 2.1 Turbo Uncensored + Cloud Diffusion)
  generateImageTool,
  enhanceImagePromptTool,
  listImageModelsTool,
  'generate-image': generateImageTool,
  'generate-image-tool': generateImageTool,
  'image-generation': generateImageTool,
  'image-generation-tool': generateImageTool,
  'image-gen': generateImageTool,
  'enhance-image-prompt': enhanceImagePromptTool,
  'enhance-image-prompt-tool': enhanceImagePromptTool,
  'list-image-models': listImageModelsTool,
  'list-image-models-tool': listImageModelsTool,
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
    for (const item of options.tools) {
      const toolKey = typeof item === 'string' ? item : (item?.id || item?.name || '');
      if (!toolKey) continue;
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
