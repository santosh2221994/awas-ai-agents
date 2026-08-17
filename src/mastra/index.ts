
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

// ── Original example ────────────────────────────────────────────────────────
import { weatherWorkflow } from './workflows/weather-workflow';
import { weatherAgent } from './agents/weather-agent';
import { toolCallAppropriatenessScorer, completenessScorer, translationScorer } from './scorers/weather-scorer';
import { agentScorers } from './scorers/agent-scorers';

// ── Template Agents ──────────────────────────────────────────────────────────
import { deepSearchAgent } from './agents/deep-search-agent';
import { googleSheetsAgent } from './agents/google-sheets-agent';
import { textToSqlAgent } from './agents/text-to-sql-agent';
import { pdfChatAgent } from './agents/pdf-chat-agent';
import { flashCardsAgent } from './agents/flash-cards-agent';
import { csvQuestionsAgent } from './agents/csv-questions-agent';
import { githubPrAgent } from './agents/github-pr-agent';
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

// ── Browser Agent (local-only) ───────────────────────────────────────────────
// @mastra/agent-browser pulls in Playwright (38 MB) — not available on Vercel.
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
// The MCP server imports browserAgent, so it must also be conditionally loaded.
let mastraMcpServer: any = undefined;
if (!isVercel) {
  try {
    const mod = await import('./mcp/server');
    mastraMcpServer = mod.mastraMcpServer;
  } catch {
    // MCP server not available — skip silently
  }
}

// ── Template Workflows ───────────────────────────────────────────────────────
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

// ── Build agent and workflow registries ───────────────────────────────────────
const allAgents: Record<string, any> = {
  'weather-agent': weatherAgent,
  'deep-search-agent': deepSearchAgent,
  'google-sheets-agent': googleSheetsAgent,
  'text-to-sql-agent': textToSqlAgent,
  'pdf-chat-agent': pdfChatAgent,
  'flash-cards-agent': flashCardsAgent,
  'csv-questions-agent': csvQuestionsAgent,
  'github-pr-agent': githubPrAgent,
  'docs-chatbot-agent': docsChatbotAgent,
  'youtube-chat-agent': youtubeChatAgent,
  'slack-agent': slackAgent,
  'customer-feedback-agent': customerFeedbackAgent,
  'mcp-agent': mcpAgent,
  'gemma-agent': gemmaAgent,
  'video-idea-gen-agent': videoIdeaGenagent,
  'react-native-agent': reactNativeAgent,
  'translation-agent': translationAgent,
  'studio-chat-agent': studioChatAgent,
};

// Conditionally include browser agent (not available on Vercel)
if (browserAgent) {
  allAgents['browser-agent'] = browserAgent;
}

const allWorkflows: Record<string, any> = {
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
  'react-native-workflow': reactNativeWorkflow,
};

// Conditionally include browser workflow (not available on Vercel)
if (browserWorkflow) {
  allWorkflows['browserWorkflow'] = browserWorkflow;
}

// ── Storage ─────────────────────────────────────────────────────────────────
const mongodbUri = process.env.MONGODB_URI || 'mongodb+srv://backend-agents:Ct1GtVObDZ3UpL0r@awas.ieqeep7.mongodb.net/';
const mongoStore = new MongoDBStore({
  id: 'mastra-storage',
  uri: mongodbUri,
  url: mongodbUri,
  dbName: process.env.MONGODB_DATABASE ?? 'mastra',
});

// On Vercel: MongoDB-only storage (no DuckDB native binaries)
// Locally: composite storage with DuckDB for observability
let storage: any;
if (observabilityDomain) {
  const { MastraCompositeStore } = await import('@mastra/core/storage');
  storage = new MastraCompositeStore({
    id: 'composite-storage',
    default: mongoStore,
    domains: observabilityDomain,
  });
} else {
  storage = mongoStore;
}

// ── Mastra Instance ──────────────────────────────────────────────────────────
// IMPORTANT: The `deployer: new VercelDeployer()` MUST be inline in the
// Mastra constructor — the CLI does static analysis to detect the deployer
// and won't find it if it's in a variable.
export const mastra = new Mastra({
  deployer: new VercelDeployer(),
  server: {
    host: process.env.HOST || '0.0.0.0',
    port: Number(process.env.PORT) || 4111,
    timeout: 120000, // 2 minutes for long LLM responses
    studioHost: process.env.MASTRA_STUDIO_HOST,
    studioProtocol: (process.env.MASTRA_STUDIO_PROTOCOL as 'http' | 'https' | undefined),
    studioPort: Number(process.env.MASTRA_STUDIO_PORT) || undefined,
    cors: {
      origin: (origin: string) => origin || '*',
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: [
        'Content-Type',
        'Authorization',
        'x-user-id',
        'x-user-tier',
        'x-tenant-id',
        'x-allow-commands',
        'accept-language',
        'ngrok-skip-browser-warning',
      ],
      credentials: true,
    },
    middleware: async (c: any, next: any) => {
      try {
        const origQuery = c.req.query.bind(c.req);
        c.req.query = (key?: string) => {
          if (key === 'transportId') {
            return origQuery('transportId') || 'sse';
          }
          return origQuery(key as any);
        };

        const userId = c.req.header('x-user-id');
        const tier = c.req.header('x-user-tier');
        const tenantId = c.req.header('x-tenant-id');
        const acceptLanguage = c.req.header('accept-language');
        const country = c.req.header('cf-ipcountry');
        const allowCommands = c.req.header('x-allow-commands');

        let requestContext = c.get('requestContext');
        if (!requestContext || typeof requestContext.set !== 'function') {
          requestContext = new Map();
          c.set('requestContext', requestContext);
        }

        if (userId) requestContext.set('user-id', userId);
        if (tier) requestContext.set('user-tier', tier);
        if (tenantId) requestContext.set('tenant-id', tenantId);

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

        await next();
      } catch (err) {
        console.error('Mastra Middleware Error:', err);
        await next();
      }
    },
  },

  // ── Workspace (local-only) ──────────────────────────────────────────────
  ...(globalWorkspace ? { workspace: globalWorkspace } : {}),

  workflows: allWorkflows,
  agents: allAgents,

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
        ],
      },
    },
  }) as any,
});
