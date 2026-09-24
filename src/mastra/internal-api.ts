/**
 * internal-api.ts
 *
 * Dynamic agent registry, runtime agent provisioning, tool catalogue lookup,
 * and sandbox tool execution for AWAS (Agentic Workplace Automation System).
 */

import { createDynamicAgent, AVAILABLE_TOOLS_MAP } from './agents/dynamic-agent-factory';
import { extractZodSchemaInfo } from './tools/tool-helper';

export interface AgentRegistrationPayload {
  id: string;
  name?: string;
  description?: string;
  instructions?: string;
  modelId?: string;
  tools?: string[];
}

/**
 * Dynamically registers an agent into the live Mastra runtime.
 */
export function registerAgentInRuntime(
  mastraInstance: any,
  allAgentsMap: Record<string, any>,
  payload: AgentRegistrationPayload
) {
  const { id, name, description, instructions, modelId, tools } = payload;
  if (!id) {
    throw new Error('Agent id is required for registration');
  }

  // Check if agent already exists in allAgentsMap
  if (allAgentsMap[id]) {
    return {
      success: true,
      agentId: id,
      message: `Agent ${id} is already registered.`,
      agent: allAgentsMap[id],
    };
  }

  const newAgent = createDynamicAgent(id, {
    name,
    description,
    instructions,
    modelId,
    tools,
  });

  allAgentsMap[id] = newAgent;

  if (mastraInstance && typeof mastraInstance.addAgent === 'function') {
    try {
      mastraInstance.addAgent(newAgent, id);
    } catch (err: any) {
      console.warn(`[internal-api] Note on adding agent ${id} to Mastra:`, err.message);
    }
  }

  return {
    success: true,
    agentId: id,
    message: `Agent ${id} successfully registered in runtime.`,
    agent: newAgent,
  };
}

/**
 * Removes an agent from the runtime.
 */
export function unregisterAgentInRuntime(
  mastraInstance: any,
  allAgentsMap: Record<string, any>,
  agentId: string
) {
  if (allAgentsMap[agentId]) {
    delete allAgentsMap[agentId];
  }
  if (mastraInstance && typeof mastraInstance.removeAgent === 'function') {
    try {
      mastraInstance.removeAgent(agentId);
    } catch (err: any) {
      console.warn(`[internal-api] Note unregistering agent ${agentId}:`, err.message);
    }
  }
  return {
    success: true,
    agentId,
    message: `Agent ${agentId} removed from runtime.`,
  };
}

/**
 * Returns an existing agent or dynamically provisions one if it's a custom agent ID.
 */
export function getOrProvisionAgent(
  mastraInstance: any,
  allAgentsMap: Record<string, any>,
  agentId: string
) {
  // 1. Check allAgentsMap directly
  if (allAgentsMap[agentId]) {
    return allAgentsMap[agentId];
  }

  // 2. Check mastra instance
  if (mastraInstance) {
    try {
      const existing = mastraInstance.getAgentById?.(agentId) || mastraInstance.getAgent?.(agentId);
      if (existing) {
        allAgentsMap[agentId] = existing;
        return existing;
      }
    } catch {}
  }

  // 3. Provision on demand for custom agents or unknown agent requests
  const provisioned = createDynamicAgent(agentId);
  allAgentsMap[agentId] = provisioned;

  if (mastraInstance && typeof mastraInstance.addAgent === 'function') {
    try {
      mastraInstance.addAgent(provisioned, agentId);
    } catch (err: any) {
      console.warn(`[internal-api] Note provisioning agent ${agentId}:`, err.message);
    }
  }

  return provisioned;
}

export interface ToolMetadata {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  parameters: Array<{
    name: string;
    type: string;
    description: string;
    required: boolean;
    defaultValue?: any;
    options?: string[];
  }>;
  sampleInput: Record<string, any>;
  requiresCredentials: boolean;
  credentialKey?: string;
}

const TOOL_METADATA_REGISTRY: Record<string, {
  name: string;
  category: string;
  icon: string;
  sampleInput: Record<string, any>;
  requiresCredentials: boolean;
  credentialKey?: string;
}> = {
  'get-weather': {
    name: 'Weather Forecaster',
    category: 'Weather',
    icon: 'CloudSun',
    sampleInput: { location: 'Tokyo' },
    requiresCredentials: false,
  },
  'weather-tool': {
    name: 'Weather Forecaster',
    category: 'Weather',
    icon: 'CloudSun',
    sampleInput: { location: 'San Francisco' },
    requiresCredentials: false,
  },
  'exa-search': {
    name: 'Exa Neural Search',
    category: 'Web Search',
    icon: 'Search',
    sampleInput: { query: 'Latest advancements in autonomous AI agents 2026', numResults: 3, type: 'auto' },
    requiresCredentials: true,
    credentialKey: 'EXA_API_KEY',
  },
  'exa-search-tool': {
    name: 'Exa Neural Search',
    category: 'Web Search',
    icon: 'Search',
    sampleInput: { query: 'Mastra TypeScript multi-agent orchestration', numResults: 3 },
    requiresCredentials: true,
    credentialKey: 'EXA_API_KEY',
  },
  'browser-read-url': {
    name: 'Web Page Reader',
    category: 'Browser Automation',
    icon: 'Globe',
    sampleInput: { url: 'https://example.com', maxChars: 3000 },
    requiresCredentials: false,
  },
  'browser-web-search': {
    name: 'Web DuckDuckGo Search',
    category: 'Web Search',
    icon: 'Search',
    sampleInput: { query: 'TypeScript AI agent framework', maxResults: 5 },
    requiresCredentials: false,
  },
  'browser-extract-data': {
    name: 'Browser Data Extractor',
    category: 'Browser Automation',
    icon: 'Table',
    sampleInput: { url: 'https://example.com', extractType: 'all' },
    requiresCredentials: false,
  },
  'browser-tool': {
    name: 'Web Page Reader',
    category: 'Browser Automation',
    icon: 'Globe',
    sampleInput: { url: 'https://example.com', maxChars: 3000 },
    requiresCredentials: false,
  },
  'execute-sql': {
    name: 'SQL Query Executor',
    category: 'Database',
    icon: 'Database',
    sampleInput: { query: 'SELECT 1 AS test_val, NOW() AS execution_time;' },
    requiresCredentials: true,
    credentialKey: 'DATABASE_URL',
  },
  'sql-tool': {
    name: 'SQL Database Tool',
    category: 'Database',
    icon: 'Database',
    sampleInput: { query: 'SELECT 1 AS status;' },
    requiresCredentials: true,
    credentialKey: 'DATABASE_URL',
  },
  'list-tables': {
    name: 'SQL List Tables',
    category: 'Database',
    icon: 'Database',
    sampleInput: {},
    requiresCredentials: true,
    credentialKey: 'DATABASE_URL',
  },
  'csv-parser': {
    name: 'CSV Tabular Parser',
    category: 'Productivity & Sheets',
    icon: 'FileSpreadsheet',
    sampleInput: { csvContent: 'name,role,salary\nAlice,Architect,150000\nBob,Developer,120000', delimiter: ',' },
    requiresCredentials: false,
  },
  'csv-analyze-column': {
    name: 'CSV Column Analyzer',
    category: 'Productivity & Sheets',
    icon: 'FileSpreadsheet',
    sampleInput: { csvContent: 'value\n10\n20\n30\n40', column: 'value' },
    requiresCredentials: false,
  },
  'csv-tool': {
    name: 'CSV Tabular Parser',
    category: 'Productivity & Sheets',
    icon: 'FileSpreadsheet',
    sampleInput: { csvContent: 'id,metric\n1,100\n2,200', delimiter: ',' },
    requiresCredentials: false,
  },
  'read-sheet': {
    name: 'Google Sheets Reader',
    category: 'Productivity & Sheets',
    icon: 'FileSpreadsheet',
    sampleInput: { spreadsheetId: 'demo-sheet-id', range: 'Sheet1!A1:E20' },
    requiresCredentials: true,
    credentialKey: 'GOOGLE_SHEETS_KEY',
  },
  'write-sheet': {
    name: 'Google Sheets Writer',
    category: 'Productivity & Sheets',
    icon: 'FileSpreadsheet',
    sampleInput: { spreadsheetId: 'demo-sheet-id', range: 'Sheet1!A1', values: [['Name', 'Score'], ['Devansh', 98]] },
    requiresCredentials: true,
    credentialKey: 'GOOGLE_SHEETS_KEY',
  },
  'google-sheets-tool': {
    name: 'Google Sheets Integration',
    category: 'Productivity & Sheets',
    icon: 'FileSpreadsheet',
    sampleInput: { spreadsheetId: 'demo-sheet-id', range: 'A1:B10' },
    requiresCredentials: true,
    credentialKey: 'GOOGLE_SHEETS_KEY',
  },
  'github-get-pr-diff': {
    name: 'GitHub PR Diff Auditor',
    category: 'Code & Repositories',
    icon: 'Github',
    sampleInput: { owner: 'devansh18', repo: 'awas', prNumber: 1 },
    requiresCredentials: true,
    credentialKey: 'GITHUB_TOKEN',
  },
  'github-post-review-comment': {
    name: 'GitHub Review Poster',
    category: 'Code & Repositories',
    icon: 'Github',
    sampleInput: { owner: 'devansh18', repo: 'awas', prNumber: 1, comment: 'Automated AI code review: Looking clean!' },
    requiresCredentials: true,
    credentialKey: 'GITHUB_TOKEN',
  },
  'github-tool': {
    name: 'GitHub Tool',
    category: 'Code & Repositories',
    icon: 'Github',
    sampleInput: { owner: 'devansh18', repo: 'awas', prNumber: 1 },
    requiresCredentials: true,
    credentialKey: 'GITHUB_TOKEN',
  },
  'slack-send-message': {
    name: 'Slack Message Dispatcher',
    category: 'Communication',
    icon: 'MessageSquare',
    sampleInput: { channel: '#general', message: 'Hello from AWAS Agentic Workplace Automation System!' },
    requiresCredentials: true,
    credentialKey: 'SLACK_BOT_TOKEN',
  },
  'slack-list-channels': {
    name: 'Slack Channels Explorer',
    category: 'Communication',
    icon: 'MessageSquare',
    sampleInput: { limit: 10 },
    requiresCredentials: true,
    credentialKey: 'SLACK_BOT_TOKEN',
  },
  'slack-read-channel': {
    name: 'Slack Channel Reader',
    category: 'Communication',
    icon: 'MessageSquare',
    sampleInput: { channel: 'C001', limit: 5 },
    requiresCredentials: true,
    credentialKey: 'SLACK_BOT_TOKEN',
  },
  'slack-tool': {
    name: 'Slack Webhook & API Tool',
    category: 'Communication',
    icon: 'MessageSquare',
    sampleInput: { channel: '#general', message: 'Automated status check passed.' },
    requiresCredentials: true,
    credentialKey: 'SLACK_BOT_TOKEN',
  },
  'youtube-get-meta': {
    name: 'YouTube Video Inspector',
    category: 'Media & Video',
    icon: 'Video',
    sampleInput: { videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    requiresCredentials: false,
  },
  'youtube-get-transcript': {
    name: 'YouTube Transcript Extractor',
    category: 'Media & Video',
    icon: 'Video',
    sampleInput: { videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    requiresCredentials: false,
  },
  'youtube-tool': {
    name: 'YouTube Video Tool',
    category: 'Media & Video',
    icon: 'Video',
    sampleInput: { videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    requiresCredentials: false,
  },
  'pdf-load': {
    name: 'PDF Text Extractor',
    category: 'Document Analysis',
    icon: 'FileText',
    sampleInput: { pdfPath: './sample.pdf', maxPages: 5 },
    requiresCredentials: false,
  },
  'pdf-search': {
    name: 'PDF Semantic Search',
    category: 'Document Analysis',
    icon: 'FileText',
    sampleInput: { pdfPath: './sample.pdf', query: 'quarterly earnings revenue' },
    requiresCredentials: false,
  },
  'pdf-tool': {
    name: 'PDF Parser Tool',
    category: 'Document Analysis',
    icon: 'FileText',
    sampleInput: { pdfPath: './sample.pdf', maxPages: 5 },
    requiresCredentials: false,
  },
  'calculator_with_ui': {
    name: 'Calculator & Evaluator',
    category: 'Math & Utilities',
    icon: 'Calculator',
    sampleInput: { num1: 42, num2: 58, operation: 'add' },
    requiresCredentials: false,
  },
  'calculator-ui-tool': {
    name: 'Calculator & Evaluator',
    category: 'Math & Utilities',
    icon: 'Calculator',
    sampleInput: { num1: 100, num2: 25, operation: 'subtract' },
    requiresCredentials: false,
  },
  'skill-list-tool': {
    name: 'Agent Skills Registry',
    category: 'Math & Utilities',
    icon: 'Cpu',
    sampleInput: { filter: 'data' },
    requiresCredentials: false,
  },
};

/**
 * Returns the registered tools catalogue with full parameter schemas and sample inputs.
 */
export function getToolsCatalogue(): ToolMetadata[] {
  const uniqueTools: Record<string, ToolMetadata> = {};

  for (const [key, tool] of Object.entries(AVAILABLE_TOOLS_MAP)) {
    const id = tool?.id || key;
    if (uniqueTools[id]) continue;

    const meta = TOOL_METADATA_REGISTRY[id] || TOOL_METADATA_REGISTRY[key] || {
      name: id
        .split('-')
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' '),
      category: 'General',
      icon: 'Wrench',
      sampleInput: {},
      requiresCredentials: false,
    };

    const parameters = extractZodSchemaInfo(tool.inputSchema);

    uniqueTools[id] = {
      id,
      name: meta.name,
      description: tool.description || '',
      category: meta.category,
      icon: meta.icon,
      parameters,
      sampleInput: meta.sampleInput,
      requiresCredentials: meta.requiresCredentials,
      credentialKey: meta.credentialKey,
    };
  }

  return Object.values(uniqueTools);
}

/**
 * Finds and executes a tool directly in sandbox mode.
 */
export async function executeToolById(
  toolId: string,
  inputData: any,
  context?: any
): Promise<{
  success: boolean;
  toolId: string;
  result?: any;
  error?: string;
  latencyMs: number;
  timestamp: string;
}> {
  const startTime = Date.now();
  let tool = AVAILABLE_TOOLS_MAP[toolId] || AVAILABLE_TOOLS_MAP[toolId.toLowerCase()];
  if (!tool) {
    const norm = toolId.toLowerCase().replace(/[_-]/g, '');
    for (const [key, t] of Object.entries(AVAILABLE_TOOLS_MAP)) {
      const tid = t?.id || key;
      if (tid === toolId || tid.toLowerCase().replace(/[_-]/g, '') === norm) {
        tool = t;
        break;
      }
    }
  }

  if (!tool) {
    return {
      success: false,
      toolId,
      error: `Tool '${toolId}' not found in registered tools catalogue.`,
      latencyMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  try {
    const result = await tool.execute(inputData ?? {}, context);
    const latencyMs = Date.now() - startTime;
    return {
      success: true,
      toolId,
      result,
      latencyMs,
      timestamp: new Date().toISOString(),
    };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    return {
      success: false,
      toolId,
      error: err?.message || String(err),
      latencyMs,
      timestamp: new Date().toISOString(),
    };
  }
}
