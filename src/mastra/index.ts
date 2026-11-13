
import { Mastra } from '@mastra/core/mastra';
import { VercelDeployer } from '@mastra/deployer-vercel';
import { PinoLogger } from '@mastra/loggers';
import { MongoDBStore } from '@mastra/mongodb';
import {
  Observability,
  DefaultExporter,
  CloudExporter,
  SensitiveDataFilter,
} from '@mastra/observability';
import { MastraCompositeStore } from '@mastra/core/storage';
import path from 'node:path';

// ── Environment detection ─────────────────────────────────────────────────────
const isVercel = Boolean(process.env.VERCEL);

// Ensure Mastra Studio detects installed observability & evals packages
process.env.MASTRA_DEV = 'true';
process.env.MASTRA_PACKAGES_FILE = path.resolve(process.cwd(), '.mastra/mastra-packages.json');

const originalConsoleInfo = console.info;
console.info = (...args: any[]) => {
  if (typeof args[0] === 'string' && args[0].includes('[ViewerRegistry]')) return;
  originalConsoleInfo(...args);
};

// ── Editor instance ───────────────────────────────────────────────────────────
// Only load MastraEditor when NOT on Vercel (requires persistent filesystem).
let editor: any = undefined;
if (!isVercel) {
  try {
    const { MastraEditor } = await import('@mastra/editor');
    editor = new MastraEditor();
  } catch {
    // Editor package not available — skip silently
  }
}

// ── DuckDB Storage (local-only) ───────────────────────────────────────────────
// DuckDB native binaries (108 MB) are incompatible with Vercel serverless.
// On Vercel, we use MongoDB for all storage domains including observability.
let observabilityDomain: Record<string, any> | undefined;
if (!isVercel) {
  try {
    const { DuckDBStore } = await import('@mastra/duckdb');
    observabilityDomain = {
      observability: new DuckDBStore({ path: './mastra.duckdb' }).observability,
    };
  } catch {
    // DuckDB not available — skip silently
  }
}

// ── Workspace (local-only) ────────────────────────────────────────────────────
// LocalSandbox/LocalFilesystem require a persistent writable filesystem.
// Vercel serverless functions are ephemeral and read-only (except /tmp).
let globalWorkspace: any = undefined;
if (!isVercel) {
  try {
    const ws = await import('./workspace/index');
    globalWorkspace = ws.globalWorkspace;
  } catch {
    // Workspace not available — skip silently
  }
}

// ── Original & Template Agents ──────────────────────────────────────────────
import { weatherWorkflow } from './workflows/weather-workflow';
import { weatherAgent } from './agents/weather-agent';
import { toolCallAppropriatenessScorer, completenessScorer, translationScorer } from './scorers/weather-scorer';
import { agentScorers } from './scorers/agent-scorers';
import { deepSearchAgent } from './agents/deep-search-agent';
import { googleSheetsAgent } from './agents/google-sheets-agent';
import { textToSqlAgent } from './agents/text-to-sql-agent';
import { pdfChatAgent } from './agents/pdf-chat-agent';
import { flashCardsAgent } from './agents/flash-cards-agent';
import { csvQuestionsAgent } from './agents/csv-questions-agent';
import { githubPrAgent } from './agents/github-pr-agent';
import { githubRepoAgent } from './agents/github-repo-agent';
import { docsChatbotAgent } from './agents/docs-chatbot-agent';
import { youtubeChatAgent } from './agents/youtube-chat-agent';
import { slackAgent } from './agents/slack-agent';
import { customerFeedbackAgent } from './agents/customer-feedback-agent';
import { mcpAgent } from './agents/mcp-agent';
import { gemmaAgent } from './agents/gemma-agent';
import { videoIdeaGenagent } from './agents/video-idea-gen0agent';
import { reactNativeAgent } from './agents/react-native-agent';
import { translationAgent } from './agents/translation-agent';
import { studioChatAgent } from './agents/studio-chat-agent';
import { agentBuilderAgent } from './agents/agent-builder-agent';
import { imageGenerationAgent } from './agents/image-generation-agent';
import { creativeGeneratorAgent } from './agents/creative-generator-agent';
import { createDynamicAgent } from './agents/dynamic-agent-factory';
import { GENERATED_IMAGES_ROUTE, readGeneratedImage } from './tools/google-image-provider';
import {
  getToolsCatalogue,
  getToolMetadataById,
  executeToolById,
  registerAgentInRuntime,
  unregisterAgentInRuntime,
} from './internal-api';

// ── Browser Agent (local-only) ───────────────────────────────────────────────
let browserAgent: any = undefined;
if (!isVercel) {
  try {
    const mod = await import('./agents/browser-agent');
    browserAgent = mod.browserAgent;
  } catch {
    // Browser agent not available — skip silently
  }
}

// ── MCP Server ──────────────────────────────────────────────────────────────
let mastraMcpServer: any = undefined;
if (!isVercel) {
  try {
    const mod = await import('./mcp/server');
    mastraMcpServer = mod.mastraMcpServer;
  } catch {
    // MCP server not available — skip silently
  }
}

// ── Original & Template Workflows ────────────────────────────────────────────
import { deepSearchWorkflow } from './workflows/deep-search-workflow';
import { customerFeedbackWorkflow } from './workflows/customer-feedback-workflow';
import { csvQuestionsWorkflow } from './workflows/csv-questions-workflow';
import { docsChatbotWorkflow } from './workflows/docs-chatbot-workflow';
import { flashCardsWorkflow } from './workflows/flash-cards-workflow';
import { gemmaWorkflow } from './workflows/gemma-workflow';
import { githubPrWorkflow } from './workflows/github-pr-workflow';
import { googleSheetsWorkflow } from './workflows/google-sheets-workflow';
import { mcpWorkflow } from './workflows/mcp-workflow';
import { pdfChatWorkflow } from './workflows/pdf-chat-workflow';
import { slackWorkflow } from './workflows/slack-workflow';
import { textToSqlWorkflow } from './workflows/text-to-sql-workflow';
import { videoIdeaGenWorkflow } from './workflows/video-idea-gen-workflow';
import { youtubeChatWorkflow } from './workflows/youtube-chat-workflow';
import { reactNativeWorkflow } from './workflows/react-native-workflow';
import { imageGenerationWorkflow } from './workflows/image-generation-workflow';
import { creativeGeneratorWorkflow } from './workflows/creative-generator-workflow';

// ── Browser Workflow (local-only) ────────────────────────────────────────────
let browserWorkflow: any = undefined;
if (!isVercel) {
  try {
    const mod = await import('./workflows/browser-workflow');
    browserWorkflow = mod.browserWorkflow;
  } catch {
    // Browser workflow not available — skip silently
  }
}

// ── Canonical 46-Role Agent Catalogue & 19 Workflow Catalogue ───────────────
import {
  agentRegistry,
  NonRoutableAgentError,
} from './registry/agent-registry';
import { skillRegistry } from './skills/index';
import {
  CATALOGUE_MASTRA_AGENTS,
  executeAgentTask,
} from './agents/catalogue-agents';
import {
  CATALOGUE_MASTRA_WORKFLOWS,
  LEGACY_WORKFLOW_ALIAS_MAP,
  executeCatalogueWorkflow,
} from './workflows/catalogue-workflows';

export {
  skillRegistry,
  executeAgentTask,
  executeCatalogueWorkflow,
  agentRegistry,
  NonRoutableAgentError,
};

// ── Wire precomputed workflows & collaborating agents onto legacy agents ─────
const LEGACY_AGENT_RELATIONS: Array<[any, Record<string, any>, Record<string, any>]> = [
  [weatherAgent, { weatherWorkflow, 'WF-PRD-01': CATALOGUE_MASTRA_WORKFLOWS['WF-PRD-01'] }, { 'PRD-01': CATALOGUE_MASTRA_AGENTS['PRD-01'], 'SUP-03': CATALOGUE_MASTRA_AGENTS['SUP-03'] }],
  [deepSearchAgent, { deepSearchWorkflow, 'WF-PRD-03': CATALOGUE_MASTRA_WORKFLOWS['WF-PRD-03'] }, { 'PRD-05': CATALOGUE_MASTRA_AGENTS['PRD-05'], 'SUP-03': CATALOGUE_MASTRA_AGENTS['SUP-03'] }],
  [googleSheetsAgent, { googleSheetsWorkflow, 'WF-PRD-06': CATALOGUE_MASTRA_WORKFLOWS['WF-PRD-06'] }, { 'PRD-09': CATALOGUE_MASTRA_AGENTS['PRD-09'], 'SUP-03': CATALOGUE_MASTRA_AGENTS['SUP-03'] }],
  [textToSqlAgent, { textToSqlWorkflow, 'WF-PRD-06': CATALOGUE_MASTRA_WORKFLOWS['WF-PRD-06'] }, { 'PRD-09': CATALOGUE_MASTRA_AGENTS['PRD-09'], 'OPS-01': CATALOGUE_MASTRA_AGENTS['OPS-01'] }],
  [pdfChatAgent, { pdfChatWorkflow, 'WF-PRD-04': CATALOGUE_MASTRA_WORKFLOWS['WF-PRD-04'] }, { 'PRD-06': CATALOGUE_MASTRA_AGENTS['PRD-06'], 'SUP-03': CATALOGUE_MASTRA_AGENTS['SUP-03'] }],
  [flashCardsAgent, { flashCardsWorkflow, 'WF-PRD-04': CATALOGUE_MASTRA_WORKFLOWS['WF-PRD-04'] }, { 'PRD-07': CATALOGUE_MASTRA_AGENTS['PRD-07'], 'PRD-06': CATALOGUE_MASTRA_AGENTS['PRD-06'] }],
  [csvQuestionsAgent, { csvQuestionsWorkflow, 'WF-PRD-06': CATALOGUE_MASTRA_WORKFLOWS['WF-PRD-06'] }, { 'PRD-09': CATALOGUE_MASTRA_AGENTS['PRD-09'], 'SUP-03': CATALOGUE_MASTRA_AGENTS['SUP-03'] }],
  [githubPrAgent, { githubPrWorkflow }, { 'github-repo-agent': githubRepoAgent, 'SUP-03': CATALOGUE_MASTRA_AGENTS['SUP-03'] }],
  [githubRepoAgent, { githubPrWorkflow, deepSearchWorkflow }, { 'github-pr-agent': githubPrAgent, 'SUP-03': CATALOGUE_MASTRA_AGENTS['SUP-03'] }],
  [docsChatbotAgent, { docsChatbotWorkflow, 'WF-PRD-04': CATALOGUE_MASTRA_WORKFLOWS['WF-PRD-04'] }, { 'PRD-06': CATALOGUE_MASTRA_AGENTS['PRD-06'], 'SUP-03': CATALOGUE_MASTRA_AGENTS['SUP-03'] }],
  [youtubeChatAgent, { youtubeChatWorkflow, videoIdeaGenWorkflow }, { 'video-idea-gen0agent': videoIdeaGenagent, 'ENT-01': CATALOGUE_MASTRA_AGENTS['ENT-01'] }],
  [slackAgent, { slackWorkflow, 'WF-PRD-02': CATALOGUE_MASTRA_WORKFLOWS['WF-PRD-02'] }, { 'PRD-04': CATALOGUE_MASTRA_AGENTS['PRD-04'], 'SUP-03': CATALOGUE_MASTRA_AGENTS['SUP-03'] }],
  [customerFeedbackAgent, { customerFeedbackWorkflow, 'WF-OPS-03': CATALOGUE_MASTRA_WORKFLOWS['WF-OPS-03'] }, { 'OPS-05': CATALOGUE_MASTRA_AGENTS['OPS-05'], 'OPS-06': CATALOGUE_MASTRA_AGENTS['OPS-06'] }],
  [mcpAgent, { mcpWorkflow, 'WF-PRD-05': CATALOGUE_MASTRA_WORKFLOWS['WF-PRD-05'] }, { 'PRD-08': CATALOGUE_MASTRA_AGENTS['PRD-08'], 'SUP-03': CATALOGUE_MASTRA_AGENTS['SUP-03'] }],
  [gemmaAgent, { gemmaWorkflow, 'WF-PRD-01': CATALOGUE_MASTRA_WORKFLOWS['WF-PRD-01'] }, { 'PRD-01': CATALOGUE_MASTRA_AGENTS['PRD-01'], 'SUP-01': CATALOGUE_MASTRA_AGENTS['SUP-01'] }],
  [videoIdeaGenagent, { videoIdeaGenWorkflow, 'WF-ENT-01': CATALOGUE_MASTRA_WORKFLOWS['WF-ENT-01'] }, { 'ENT-01': CATALOGUE_MASTRA_AGENTS['ENT-01'], 'ENT-02': CATALOGUE_MASTRA_AGENTS['ENT-02'], 'SUP-02': CATALOGUE_MASTRA_AGENTS['SUP-02'] }],
  [reactNativeAgent, { 'react-native-workflow': reactNativeWorkflow }, { 'github-pr-agent': githubPrAgent, 'docs-chatbot-agent': docsChatbotAgent }],
  [translationAgent, { docsChatbotWorkflow, 'WF-PRD-04': CATALOGUE_MASTRA_WORKFLOWS['WF-PRD-04'] }, { 'PRD-07': CATALOGUE_MASTRA_AGENTS['PRD-07'], 'SUP-03': CATALOGUE_MASTRA_AGENTS['SUP-03'] }],
  [studioChatAgent, { 'WF-ENT-01': CATALOGUE_MASTRA_WORKFLOWS['WF-ENT-01'], 'WF-PRD-05': CATALOGUE_MASTRA_WORKFLOWS['WF-PRD-05'] }, { 'agent-builder-agent': agentBuilderAgent, 'SUP-01': CATALOGUE_MASTRA_AGENTS['SUP-01'] }],
  [agentBuilderAgent, { 'WF-PRD-05': CATALOGUE_MASTRA_WORKFLOWS['WF-PRD-05'], mcpWorkflow }, { 'studio-chat-agent': studioChatAgent, 'SUP-01': CATALOGUE_MASTRA_AGENTS['SUP-01'] }],
  [imageGenerationAgent, { 'image-generation-workflow': imageGenerationWorkflow, 'WF-ENT-03': CATALOGUE_MASTRA_WORKFLOWS['WF-ENT-03'] }, { 'ENT-04': CATALOGUE_MASTRA_AGENTS['ENT-04'], 'ENT-05': CATALOGUE_MASTRA_AGENTS['ENT-05'], 'SUP-02': CATALOGUE_MASTRA_AGENTS['SUP-02'] }],
  [creativeGeneratorAgent, { 'creative-generator-workflow': creativeGeneratorWorkflow, imageGenerationWorkflow, videoIdeaGenWorkflow }, { 'image-generation-agent': imageGenerationAgent, 'video-idea-gen0agent': videoIdeaGenagent, 'ENT-01': CATALOGUE_MASTRA_AGENTS['ENT-01'] }],
];

if (browserAgent) {
  LEGACY_AGENT_RELATIONS.push([
    browserAgent,
    { ...(browserWorkflow ? { browserWorkflow } : {}), deepSearchWorkflow },
    { 'deep-search-agent': deepSearchAgent, 'PRD-05': CATALOGUE_MASTRA_AGENTS['PRD-05'] },
  ]);
}

for (const [agent, workflowsMap, agentsMap] of LEGACY_AGENT_RELATIONS) {
  if (agent) {
    agent.listWorkflows = async () => workflowsMap;
    agent.listAgents = async () => agentsMap;
  }
}

// ── Build agent and workflow registries (46 catalogue + all original agents) ─
const allAgents: Record<string, any> = {
  ...CATALOGUE_MASTRA_AGENTS,
  'weather-agent': weatherAgent,
  'deep-search-agent': deepSearchAgent,
  'google-sheets-agent': googleSheetsAgent,
  'text-to-sql-agent': textToSqlAgent,
  'pdf-chat-agent': pdfChatAgent,
  'flash-cards-agent': flashCardsAgent,
  'csv-questions-agent': csvQuestionsAgent,
  'github-pr-agent': githubPrAgent,
  'github-repo-agent': githubRepoAgent,
  'docs-chatbot-agent': docsChatbotAgent,
  'youtube-chat-agent': youtubeChatAgent,
  'slack-agent': slackAgent,
  'customer-feedback-agent': customerFeedbackAgent,
  'mcp-agent': mcpAgent,
  'gemma-agent': gemmaAgent,
  'video-idea-gen0agent': videoIdeaGenagent,
  'react-native-agent': reactNativeAgent,
  'translation-agent': translationAgent,
  'studio-chat-agent': studioChatAgent,
  'agent-builder-agent': agentBuilderAgent,
  'image-generation-agent': imageGenerationAgent,
  'creative-generator-agent': creativeGeneratorAgent,
};

if (browserAgent) {
  allAgents['browser-agent'] = browserAgent;
}

// Fast O(1) lookup index by agent ID and display name for MastraEditor stored-override resolution
const agentsByIdAndName = new Map<string, any>();
for (const [key, ag] of Object.entries(allAgents)) {
  if (!ag) continue;
  agentsByIdAndName.set(key, ag);
  if (ag.id) agentsByIdAndName.set(ag.id, ag);
  if (ag.name) agentsByIdAndName.set(ag.name, ag);
}

// Preserve code-defined workflows & sub-agents when MastraEditor applies stored overrides from MongoDB
if (editor?.agent) {
  const preserveRelations = (targetAgent: any, fallbackCodeAgent: any) => {
    if (!targetAgent || !fallbackCodeAgent || targetAgent === fallbackCodeAgent) return targetAgent;
    if (typeof fallbackCodeAgent.listWorkflows === 'function') {
      const origWf = targetAgent.listWorkflows?.bind(targetAgent);
      targetAgent.listWorkflows = async (opts?: any) => {
        const res = origWf ? await origWf(opts) : {};
        return res && Object.keys(res).length > 0 ? res : fallbackCodeAgent.listWorkflows(opts);
      };
    }
    if (typeof fallbackCodeAgent.listAgents === 'function') {
      const origAg = targetAgent.listAgents?.bind(targetAgent);
      targetAgent.listAgents = async (opts?: any) => {
        const res = origAg ? await origAg(opts) : {};
        return res && Object.keys(res).length > 0 ? res : fallbackCodeAgent.listAgents(opts);
      };
    }
    return targetAgent;
  };

  if (typeof editor.agent.applyStoredOverrides === 'function') {
    const origApply = editor.agent.applyStoredOverrides.bind(editor.agent);
    editor.agent.applyStoredOverrides = async (codeAgent: any, ...args: any[]) => {
      const merged = await origApply(codeAgent, ...args);
      return preserveRelations(merged, codeAgent);
    };
  }

  if (typeof editor.agent.getById === 'function') {
    const origGetById = editor.agent.getById.bind(editor.agent);
    editor.agent.getById = async (agentId: string, ...args: any[]) => {
      const stored = await origGetById(agentId, ...args);
      if (stored) {
        const matchingCodeAgent =
          allAgents[agentId] ??
          agentsByIdAndName.get(agentId) ??
          (stored.name ? agentsByIdAndName.get(stored.name) : undefined);
        if (matchingCodeAgent) {
          preserveRelations(stored, matchingCodeAgent);
        }
      }
      return stored;
    };
  }
}

const LEGACY_AGENT_ALIAS_MAP: Record<string, any> = {
  weatherAgent,
  deepSearchAgent,
  googleSheetsAgent,
  textToSqlAgent,
  pdfChatAgent,
  flashCardsAgent,
  csvQuestionsAgent,
  githubPrAgent,
  githubRepoAgent,
  'github-agent': githubRepoAgent,
  docsChatbotAgent,
  youtubeChatAgent,
  slackAgent,
  customerFeedbackAgent,
  mcpAgent,
  gemmaAgent,
  videoIdeaGenagent,
  'video-idea-gen-agent': videoIdeaGenagent,
  reactNativeAgent,
  translationAgent,
  studioChatAgent,
  agentBuilderAgent,
  imageGenerationAgent,
  'image-generator-agent': imageGenerationAgent,
  'text-to-image-agent': imageGenerationAgent,
  'qwen-image-agent': imageGenerationAgent,
  creativeGeneratorAgent,
  'storyboard-generator-agent': creativeGeneratorAgent,
  'storyboard-agent': creativeGeneratorAgent,
  ...(browserAgent ? { browserAgent } : {}),
};

export const dynamicAgentsRegistry: Record<string, any> = new Proxy(allAgents, {
  get(target, prop, receiver) {
    if (typeof prop === 'string') {
      if (prop in target) {
        return target[prop];
      }
      if (prop in LEGACY_AGENT_ALIAS_MAP) {
        return LEGACY_AGENT_ALIAS_MAP[prop];
      }
      // Resolve slug or legacy alias transparently without adding duplicate keys to target
      const resolvedManifest = agentRegistry.getBySlug(prop);
      if (resolvedManifest && resolvedManifest.id in target) {
        return target[resolvedManifest.id];
      }
      // Auto-provision registered custom user agents only
      if (prop.startsWith('custom-')) {
        const dynamic = createDynamicAgent(prop);
        target[prop] = dynamic;
        return dynamic;
      }
    }
    return Reflect.get(target, prop, receiver);
  },
  has(target, prop) {
    if (typeof prop === 'string') {
      if (prop in target || prop in LEGACY_AGENT_ALIAS_MAP) {
        return true;
      }
      const resolvedManifest = agentRegistry.getBySlug(prop);
      if (resolvedManifest && resolvedManifest.id in target) {
        return true;
      }
    }
    return Reflect.has(target, prop);
  },
});

const allWorkflows: Record<string, any> = {
  ...CATALOGUE_MASTRA_WORKFLOWS,
  weatherWorkflow,
  deepSearchWorkflow,
  customerFeedbackWorkflow,
  csvQuestionsWorkflow,
  docsChatbotWorkflow,
  flashCardsWorkflow,
  gemmaWorkflow,
  githubPrWorkflow,
  googleSheetsWorkflow,
  mcpWorkflow,
  pdfChatWorkflow,
  slackWorkflow,
  textToSqlWorkflow,
  videoIdeaGenWorkflow,
  youtubeChatWorkflow,
  reactNativeWorkflow,
  imageGenerationWorkflow,
  creativeGeneratorWorkflow,
};

if (browserWorkflow) {
  allWorkflows['browserWorkflow'] = browserWorkflow;
}

const WORKFLOW_KEY_ALIAS_MAP: Record<string, any> = {
  'image-generation-workflow': imageGenerationWorkflow,
  imageGenerationWorkflow,
  'react-native-workflow': reactNativeWorkflow,
  reactNativeWorkflow,
  'creative-generator-workflow': creativeGeneratorWorkflow,
  'storyboard-generator-workflow': creativeGeneratorWorkflow,
  creativeGeneratorWorkflow,
};

export const dynamicWorkflowsRegistry: Record<string, any> = new Proxy(allWorkflows, {
  get(target, prop, receiver) {
    if (typeof prop === 'string') {
      if (prop in target) {
        return target[prop];
      }
      if (prop in WORKFLOW_KEY_ALIAS_MAP) {
        return WORKFLOW_KEY_ALIAS_MAP[prop];
      }
      const canonicalWfId = LEGACY_WORKFLOW_ALIAS_MAP[prop];
      if (canonicalWfId && canonicalWfId in target) {
        return target[canonicalWfId];
      }
    }
    return Reflect.get(target, prop, receiver);
  },
  has(target, prop) {
    if (typeof prop === 'string') {
      if (prop in target || prop in WORKFLOW_KEY_ALIAS_MAP) {
        return true;
      }
      const canonicalWfId = LEGACY_WORKFLOW_ALIAS_MAP[prop];
      if (canonicalWfId && canonicalWfId in target) return true;
    }
    return Reflect.has(target, prop);
  },
});

// Precompiled route regular expressions for fast middleware matching
const TOOL_EXEC_ROUTE_RE = /^\/api\/tools\/([^/?#]+)\/execute$/;
const TOOL_DETAIL_ROUTE_RE = /^\/api\/tools\/([^/?#]+)$/;
const AGENT_UNREGISTER_ROUTE_RE = /^\/internal\/agents\/([^/?#]+)$/;
const AGENT_ACTION_ROUTE_RE = /^\/api\/agents\/([^/?#]+)(?:\/([^/?#]+))?/;

// ── Storage ─────────────────────────────────────────────────────────────────
const mongodbUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mastra';
const mongoStore = new MongoDBStore({
  id: 'mastra-storage',
  uri: mongodbUri,
  url: mongodbUri,
  dbName: process.env.MONGODB_DATABASE ?? 'mastra',
});

// On Vercel: MongoDB-only storage (no DuckDB native binaries)
// Locally: composite storage with DuckDB for observability
const storage: any = observabilityDomain
  ? new MastraCompositeStore({
    id: 'composite-storage',
    default: mongoStore,
    domains: observabilityDomain,
  })
  : mongoStore;

// ── Mastra Instance ──────────────────────────────────────────────────────────
// IMPORTANT: The `deployer: new VercelDeployer()` MUST be inline in the
// Mastra constructor — the CLI does static analysis to detect the deployer
// and won't find it if it's in a variable.
export const mastra = new Mastra({
  deployer: new VercelDeployer(),
  server: {
    host: process.env.HOST || '127.0.0.1',
    port: Number(process.env.PORT) || 4111,
    timeout: 120000, // 2 minutes for long LLM responses
    studioHost: process.env.MASTRA_STUDIO_HOST,
    studioProtocol: (process.env.MASTRA_STUDIO_PROTOCOL as 'http' | 'https' | undefined),
    studioPort: Number(process.env.MASTRA_STUDIO_PORT) || undefined,
    cors: {
      origin: (origin: string) => origin || 'http://localhost:4111',
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: [
        'Content-Type',
        'Authorization',
        'x-user-id',
        'x-user-tier',
        'x-tenant-id',
        'x-allow-commands',
        'x-provider-id',
        'x-model-id',
        'x-llm-base-url',
        'x-execution-mode',
        'accept-language',
        'ngrok-skip-browser-warning',
        'A2A-Version',
        'x-mastra-client-type',
        'x-mastra-dev-playground',
      ],
      credentials: true,
    },
    middleware: async (c: any, next: any) => {
      try {
        if (!c.req.query?.__patched) {
          const origQuery = c.req.query?.bind?.(c.req);
          if (origQuery) {
            const patched = (key?: string) => {
              if (!key) {
                const all = origQuery() || {};
                return { transportId: 'sse', ...all };
              }
              if (key === 'transportId') {
                return origQuery('transportId') || 'sse';
              }
              return origQuery(key);
            };
            (patched as any).__patched = true;
            c.req.query = patched;
          }
        }

        const userId = c.req.header('x-user-id');
        const tier = c.req.header('x-user-tier');
        const tenantId = c.req.header('x-tenant-id');
        const acceptLanguage = c.req.header('accept-language');
        const country = c.req.header('cf-ipcountry');
        const allowCommands = c.req.header('x-allow-commands');
        const providerId = c.req.header('x-provider-id');
        const modelId = c.req.header('x-model-id');
        const llmBaseUrl = c.req.header('x-llm-base-url');
        const executionMode = c.req.header('x-execution-mode');

        let requestContext = c.get('requestContext');
        if (!requestContext || typeof requestContext.set !== 'function') {
          requestContext = new Map();
          c.set('requestContext', requestContext);
        }

        if (userId) requestContext.set('user-id', userId);
        if (tier) requestContext.set('user-tier', tier);
        if (tenantId) requestContext.set('tenant-id', tenantId);

        if (providerId) requestContext.set('provider-id', providerId);
        if (modelId) requestContext.set('model-id', modelId);
        if (llmBaseUrl) requestContext.set('llm-base-url', llmBaseUrl);
        if (executionMode) requestContext.set('execution-mode', executionMode);

        if (acceptLanguage) {
          requestContext.set('locale', acceptLanguage.split(',')[0].trim());
        }

        if (country) {
          requestContext.set(
            'temperature-unit',
            country.toUpperCase() === 'US' ? 'fahrenheit' : 'celsius',
          );
        }

        if (allowCommands === 'true') {
          requestContext.set('allow-commands', 'true');
        }

        const reqPath = c.req.path || c.req.url || '';
        const reqMethod = (c.req.method || 'GET').toUpperCase();

        // ── Generated Images (Google image tool output) ───────────────────────
        if (reqMethod === 'GET' && reqPath.startsWith(`${GENERATED_IMAGES_ROUTE}/`)) {
          const fileName = decodeURIComponent(reqPath.slice(GENERATED_IMAGES_ROUTE.length + 1));
          const img = readGeneratedImage(fileName);
          if (!img) return c.json({ error: 'Image not found' }, 404);
          return new Response(new Uint8Array(img.data), {
            status: 200,
            headers: {
              'Content-Type': img.mimeType,
              'Cache-Control': 'public, max-age=31536000, immutable',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }

        // ── Tools Catalogue Endpoints ─────────────────────────────────────────
        if ((reqPath === '/api/tools' || reqPath === '/internal/tools') && reqMethod === 'GET') {
          return c.json(getToolsCatalogue());
        }

        const toolExecMatch = reqPath.match(TOOL_EXEC_ROUTE_RE);
        if (toolExecMatch && reqMethod === 'POST') {
          const toolId = decodeURIComponent(toolExecMatch[1]);
          const body = await c.req.json().catch(() => ({}));
          const inputData = body.inputData ?? body.input ?? body;
          const execResult = await executeToolById(toolId, inputData, { requestContext });
          return c.json(execResult, execResult.success ? 200 : 400);
        }

        const toolDetailMatch = reqPath.match(TOOL_DETAIL_ROUTE_RE);
        if (toolDetailMatch && reqMethod === 'GET') {
          const toolId = decodeURIComponent(toolDetailMatch[1]);
          const found = getToolMetadataById(toolId);
          if (found) {
            return c.json(found);
          }
          return c.json({ error: `Tool '${toolId}' not found` }, 404);
        }

        // ── Dynamic Agent Registration Endpoints ──────────────────────────────
        if (reqPath === '/internal/agents/register' && reqMethod === 'POST') {
          const body = await c.req.json().catch(() => ({}));
          const result = registerAgentInRuntime(mastra, allAgents, body);
          return c.json(result);
        }

        const unregisterMatch = reqPath.match(AGENT_UNREGISTER_ROUTE_RE);
        if (unregisterMatch && reqMethod === 'DELETE') {
          const agentId = decodeURIComponent(unregisterMatch[1]);
          const result = unregisterAgentInRuntime(mastra, allAgents, agentId);
          return c.json(result);
        }

        // ── Catalogue Status Enforcement & Dynamic Agent Provisioning ─────────
        const agentMatch = reqPath.match(AGENT_ACTION_ROUTE_RE);
        if (agentMatch) {
          const requestedAgentId = decodeURIComponent(agentMatch[1]);
          const subAction = agentMatch[2];

          // Enforce non-routable guard when attempting to execute a planned/scaffolded catalogue agent
          if (
            agentRegistry.isCatalogueAgent(requestedAgentId) &&
            (reqMethod === 'POST' || subAction === 'generate' || subAction === 'stream')
          ) {
            try {
              agentRegistry.assertRoutable(requestedAgentId);
            } catch (err: any) {
              if (err instanceof NonRoutableAgentError) {
                return c.json(
                  {
                    error: err.message,
                    code: err.code,
                    agentId: err.agentId,
                    status: err.status,
                  },
                  403
                );
              }
            }
          }

          if (
            requestedAgentId &&
            requestedAgentId.startsWith('custom-') &&
            typeof mastra !== 'undefined' &&
            mastra
          ) {
            let exists = Boolean(allAgents[requestedAgentId]);
            if (!exists) {
              try {
                exists = Boolean(mastra.getAgentById?.(requestedAgentId) || mastra.getAgent?.(requestedAgentId));
              } catch { }
            }

            if (!exists) {
              try {
                const dynamicAgent = createDynamicAgent(requestedAgentId);
                allAgents[requestedAgentId] = dynamicAgent;
                if (typeof mastra.addAgent === 'function') {
                  mastra.addAgent(dynamicAgent, requestedAgentId);
                }
              } catch (e: any) {
                console.warn(`[Runtime Middleware] Auto-provision note for ${requestedAgentId}:`, e.message);
              }
            }
          }
        }

        await next();
      } catch (err) {
        console.error('Mastra Middleware Error:', err);
        await next();
      }
    },
  },

  // ── Workspace (local-only) ──────────────────────────────────────────────
  ...(globalWorkspace ? { workspace: globalWorkspace } : {}),

  workflows: dynamicWorkflowsRegistry,
  agents: dynamicAgentsRegistry,

  // ── MCP Servers (local-only) ────────────────────────────────────────────
  ...(mastraMcpServer ? { mcpServers: { mastraMcpServer } } : {}),

  // ── Editor (local-only) ─────────────────────────────────────────────────
  ...(editor ? { editor: editor as any } : {}),

  scorers: {
    toolCallAppropriatenessScorer,
    completenessScorer,
    translationScorer,
    ...agentScorers,
  },
  storage,
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'awas-ai-agents',
        exporters: [
          new DefaultExporter(),
          ...(process.env.MASTRA_CLOUD_ACCESS_TOKEN ? [new CloudExporter()] : []),
        ],
        spanOutputProcessors: [
          new SensitiveDataFilter(),
        ],
        logging: {
          enabled: true,
          level: 'info',
        },
        requestContextKeys: [
          'user-id',
          'user-tier',
          'tenant-id',
          'locale',
          'provider-id',
          'model-id',
          'llm-base-url',
          'execution-mode',
        ],
      },
    },
  }) as any,
});
