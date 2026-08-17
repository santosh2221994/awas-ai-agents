
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { MongoDBStore } from '@mastra/mongodb';
import { DuckDBStore } from '@mastra/duckdb';
import { MastraCompositeStore } from '@mastra/core/storage';
import {
  Observability,
  DefaultExporter,
  CloudExporter,
  SensitiveDataFilter,
} from '@mastra/observability';
import { MastraEditor } from '@mastra/editor';
import path from 'node:path';
import { globalWorkspace } from './workspace/index';

// Ensure Mastra Studio detects installed observability & evals packages
process.env.MASTRA_DEV = 'true';
process.env.MASTRA_PACKAGES_FILE = path.resolve(process.cwd(), '.mastra/mastra-packages.json');

const originalConsoleInfo = console.info;
console.info = (...args: any[]) => {
  if (typeof args[0] === 'string' && args[0].includes('[ViewerRegistry]')) return;
  originalConsoleInfo(...args);
};

// ── Editor instance ───────────────────────────────────────────────────────────
// Enables the Editor tab in Mastra Studio for all registered agents.
// Non-developers can iterate on instructions, tools, and variables without
// touching code. Every save creates a versioned snapshot; publish when ready.
const editor = new MastraEditor();

// ── Original example ────────────────────────────────────────────────────────
import { weatherWorkflow } from './workflows/weather-workflow';
import { weatherAgent } from './agents/weather-agent';
import { toolCallAppropriatenessScorer, completenessScorer, translationScorer } from './scorers/weather-scorer';
import { agentScorers } from './scorers/agent-scorers';

// ── Template Agents ──────────────────────────────────────────────────────────
import { deepSearchAgent } from './agents/deep-search-agent';
import { googleSheetsAgent } from './agents/google-sheets-agent';
import { browserAgent } from './agents/browser-agent';
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

// ── MCP ──────────────────────────────────────────────────────────────────────
import { mastraMcpServer } from './mcp/server';

// ── Template Workflows ───────────────────────────────────────────────────────
import { deepSearchWorkflow } from './workflows/deep-search-workflow';
import { customerFeedbackWorkflow } from './workflows/customer-feedback-workflow';
import { browserWorkflow } from './workflows/browser-workflow';
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

// All storage domains (memory, observability, workflows, editor, etc.) backed by PostgreSQL.
const allAgents = {
  'weather-agent': weatherAgent,
  'deep-search-agent': deepSearchAgent,
  'google-sheets-agent': googleSheetsAgent,
  'browser-agent': browserAgent,
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

export const mastra = new Mastra({
  // ── Middleware ─────────────────────────────────────────────────────────────
  // Runs on every incoming HTTP request to populate the RequestContext.
  // Values set here are available in agents, workflows, and tools via the
  // `requestContext` argument.
  server: {
    host: process.env.HOST || '0.0.0.0',
    port: Number(process.env.PORT) || 4111,
    timeout: 120000, // 2 minutes for long LLM responses
    // Override via env vars — useful when ngrok URL changes
    studioHost: process.env.MASTRA_STUDIO_HOST,
    studioProtocol: (process.env.MASTRA_STUDIO_PROTOCOL as 'http' | 'https' | undefined),
    studioPort: Number(process.env.MASTRA_STUDIO_PORT) || undefined,
    cors: {
      origin: (origin: string) => origin || '*', // Reflect origin for credentialed requests
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
        // Handle missing transportId query param on MCP routes to prevent MastraServer ZodError
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

        // Manual CORS headers removed: using native server.cors configuration instead

        // IMPORTANT: Call next to continue the middleware chain
        await next();
      } catch (err) {
        console.error('Mastra Middleware Error:', err);
        // Even on error, try to continue
        await next();
      }
    },
  },

  // ── Global Workspace ───────────────────────────────────────────────────────
  // Gives every agent file tools (read/write) + sandboxed shell execution.
  // Agents that declare their own workspace (codeWorkspace, readonlyWorkspace)
  // override this automatically.
  workspace: globalWorkspace,
  workflows: {
    // Original
    weatherWorkflow,
    // Templates
    deepSearchWorkflow,
    customerFeedbackWorkflow,
    browserWorkflow,
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
  },
  // Observability is configured at the Mastra root, so it applies to every
  // agent registered in this object.
  agents: allAgents,
  // ── MCP Servers ──────────────────────────────────────────────────────────
  // Exposes all Mastra tools/agents/workflows via the Model Context Protocol.
  // Accessible at: http://localhost:4111/api/mcp/mastra-tools-server/mcp
  mcpServers: { mastraMcpServer },
  // ── Editor ─────────────────────────────────────────────────────────────────
  // Registers the editor so Studio shows the Editor tab on every agent.
  // All 16 agents become editable: draft, publish, roll back, A/B test.
  editor: editor as any,
  // Global version defaults — override per-invocation or per-request as needed.
  // Uncomment to pin agents to specific versions in production:
  // versions: {
  //   agents: {
  //     'deep-search-agent': { status: 'published' },
  //     'customer-feedback-agent': { status: 'published' },
  //   },
  // },
  // ── Global scorer registry — powers the Evaluate dashboard in Mastra Studio ─
  // Weather-specific scorers (tool call accuracy, completeness, translation)
  // are kept for backward compatibility. Generic scorers (completeness,
  // answerRelevance, toxicity) apply across all agents.
  scorers: {
    toolCallAppropriatenessScorer,
    completenessScorer,
    translationScorer,
    ...agentScorers,
  },
  storage: new MastraCompositeStore({
    id: 'composite-storage',
    default: new MongoDBStore({
      id: 'mastra-storage',
      uri: process.env.MONGODB_URI || 'mongodb+srv://backend-agents:Ct1GtVObDZ3UpL0r@awas.ieqeep7.mongodb.net/',
      url: process.env.MONGODB_URI || 'mongodb+srv://backend-agents:Ct1GtVObDZ3UpL0r@awas.ieqeep7.mongodb.net/',
      dbName: process.env.MONGODB_DATABASE ?? 'mastra',
    }),
    domains: {
      observability: new DuckDBStore({ path: process.env.VERCEL ? '/tmp/mastra.duckdb' : './mastra.duckdb' }).observability,
    },
  }),
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
        // ── Logging ──────────────────────────────────────────────────────────
        // Dual-write logs to observability storage (DuckDB) so they appear
        // correlated with traces in the Studio Traces view.
        logging: {
          enabled: true,
          level: 'info',
        },
        // ── Request Context Keys ─────────────────────────────────────────────
        // Automatically tag every span with these middleware-injected values
        // so you can filter traces by user, tenant, or tier in Studio.
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
