/**
 * mcp/server.ts
 *
 * MCPServer — exposes Mastra tools, agents, and workflows via the
 * Model Context Protocol so any MCP-compatible client can use them.
 *
 * Exposed resources:
 *
 * Tools (available as MCP tools directly):
 *   exa-search, exa-scrape, browse-url, search-web, get-pr-diff,
 *   youtube-get-info, slack-get-channels, slack-send-message,
 *   google-sheets-read, csv-parse, text-to-sql-*
 *
 * Agents (exposed as ask_<key> tools):
 *   ask_deepSearchAgent, ask_browserAgent, ask_githubPrAgent,
 *   ask_docsChatbotAgent, ask_youtubeChatAgent, ask_slackAgent,
 *   ask_customerFeedbackAgent, ask_csvQuestionsAgent,
 *   ask_pdfChatAgent, ask_flashCardsAgent, ask_googleSheetsAgent,
 *   ask_textToSqlAgent, ask_weatherAgent
 *
 * Workflows (exposed as run_<key> tools):
 *   run_deepSearchWorkflow, run_customerFeedbackWorkflow, run_weatherWorkflow
 *
 * The server is registered on the Mastra instance via `mcpServers`.
 * It will be available at:
 *   HTTP/SSE  → http://localhost:4111/api/mcp/<serverId>/sse
 *   Streamable → http://localhost:4111/api/mcp/<serverId>/mcp
 */

import { MCPServer } from '@mastra/mcp';

// ── Tools ─────────────────────────────────────────────────────────────────────
import { exaSearchTool, exaScrapePageTool } from '../tools/exa-search-tool';
import { browseUrlTool, searchWebTool, extractPageDataTool } from '../tools/browser-tool';
import { getPrDiffTool, postReviewCommentTool } from '../tools/github-tool';
import { getVideoMetaTool, getVideoTranscriptTool } from '../tools/youtube-tool';
import { listSlackChannelsTool, readSlackChannelTool, sendSlackMessageTool } from '../tools/slack-tool';
import { readSheetTool } from '../tools/google-sheets-tool';
import { parseCsvTool } from '../tools/csv-tool';
import { skillListTool } from '../tools/skill-list-tool';
import { calculatorWithUITool } from '../tools/calculator-ui-tool';

// ── Agents ────────────────────────────────────────────────────────────────────
import { deepSearchAgent } from '../agents/deep-search-agent';
import { browserAgent } from '../agents/browser-agent';
import { githubPrAgent } from '../agents/github-pr-agent';
import { docsChatbotAgent } from '../agents/docs-chatbot-agent';
import { youtubeChatAgent } from '../agents/youtube-chat-agent';
import { slackAgent } from '../agents/slack-agent';
import { customerFeedbackAgent } from '../agents/customer-feedback-agent';
import { csvQuestionsAgent } from '../agents/csv-questions-agent';
import { pdfChatAgent } from '../agents/pdf-chat-agent';
import { flashCardsAgent } from '../agents/flash-cards-agent';
import { googleSheetsAgent } from '../agents/google-sheets-agent';
import { textToSqlAgent } from '../agents/text-to-sql-agent';
import { weatherAgent } from '../agents/weather-agent';
import { gemmaAgent } from '../agents/gemma-agent';

// ── Workflows ─────────────────────────────────────────────────────────────────
import { deepSearchWorkflow } from '../workflows/deep-search-workflow';
import { customerFeedbackWorkflow } from '../workflows/customer-feedback-workflow';
import { weatherWorkflow } from '../workflows/weather-workflow';

export const mastraMcpServer = new MCPServer({
  id: 'mastra-tools-server',
  name: 'Mastra Tools Server',
  version: '1.0.0',
  description:
    'Exposes all Mastra tools, agents, and workflows as MCP primitives. ' +
    'Use this server to let any MCP-compatible client (Claude Desktop, Cursor, etc.) ' +
    'leverage deep web search, browser automation, GitHub PR review, YouTube analysis, ' +
    'Slack messaging, Google Sheets analysis, PDF chat, and more.',
  instructions:
    'Connect to this server to access Mastra\'s full toolkit. ' +
    'Agents are available as ask_<agentName> tools and workflows as run_<workflowKey> tools. ' +
    'All tools support streaming responses.',

  // ── Direct tools ───────────────────────────────────────────────────────────
  tools: {
    // Web research
    exaSearchTool,
    exaScrapePageTool,
    // Web browsing
    browseUrlTool,
    searchWebTool,
    extractPageDataTool,
    // Code review
    getPrDiffTool,
    postReviewCommentTool,
    // YouTube
    getVideoMetaTool,
    getVideoTranscriptTool,
    // Slack
    listSlackChannelsTool,
    readSlackChannelTool,
    sendSlackMessageTool,
    // Google Sheets
    readSheetTool,
    // CSV
    parseCsvTool,
    // Skills
    skillListTool,
    // MCP App demo
    calculatorWithUITool,
  },

  // ── Agents (become ask_<key> tools) ───────────────────────────────────────
  agents: {
    deepSearchAgent,
    browserAgent,
    githubPrAgent,
    docsChatbotAgent,
    youtubeChatAgent,
    slackAgent,
    customerFeedbackAgent,
    csvQuestionsAgent,
    pdfChatAgent,
    flashCardsAgent,
    googleSheetsAgent,
    textToSqlAgent,
    weatherAgent,
    gemmaAgent,
  } as any,

  // ── Workflows (become run_<key> tools) ────────────────────────────────────
  workflows: {
    deepSearchWorkflow,
    customerFeedbackWorkflow,
    weatherWorkflow,
  } as any,

  resources: {
    listResources: async () => [
      {
        uri: 'ui://calculator/main',
        name: 'Interactive Calculator',
        description: 'HTML calculator UI rendered inside MCP clients that support app resources.',
        mimeType: 'text/html',
      },
    ],
    getResourceContent: async ({ uri }: { uri: string }) => {
      if (uri === 'ui://calculator/main') {
        return {
          uri,
          mimeType: 'text/html',
          text: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Calculator App</title>
    <style>
      :root {
        --bg: #f4f5f7;
        --card: #ffffff;
        --border: #d0d7de;
        --text: #0f172a;
        --muted: #475569;
        --accent: #2563eb;
      }
      body {
        margin: 0;
        padding: 16px;
        background: var(--bg);
        color: var(--text);
        font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        opacity: 0;
        transition: opacity 0.15s ease;
      }
      body.ready { opacity: 1; }
      .card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 14px;
        max-width: 420px;
      }
      h2 { margin: 0 0 10px; font-size: 18px; }
      .row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 8px;
      }
      input, select, button {
        width: 100%;
        box-sizing: border-box;
        border-radius: 8px;
        border: 1px solid var(--border);
        padding: 8px 10px;
        font-size: 14px;
      }
      button {
        border: none;
        background: var(--accent);
        color: #fff;
        font-weight: 600;
        cursor: pointer;
      }
      .result { margin-top: 10px; color: var(--muted); font-size: 14px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h2>Calculator</h2>
      <div class="row">
        <input id="num1" type="number" value="10" />
        <input id="num2" type="number" value="5" />
      </div>
      <div class="row">
        <select id="operation">
          <option value="add">Add</option>
          <option value="subtract">Subtract</option>
        </select>
        <button id="computeBtn" type="button">Compute</button>
      </div>
      <div class="result" id="result">Result: —</div>
    </div>
    <script type="module">
      import { App } from 'https://cdn.jsdelivr.net/npm/@modelcontextprotocol/ext-apps/+esm';
      const app = new App({ name: 'CalculatorApp', version: '1.0.0' });
      const num1Input = document.getElementById('num1');
      const num2Input = document.getElementById('num2');
      const operationInput = document.getElementById('operation');
      const resultEl = document.getElementById('result');
      document.getElementById('computeBtn').addEventListener('click', async () => {
        const payload = {
          num1: Number(num1Input.value),
          num2: Number(num2Input.value),
          operation: operationInput.value,
        };
        const result = await app.callServerTool({ name: 'calculator_with_ui', arguments: payload });
        resultEl.textContent = 'Result: ' + JSON.stringify(result.structuredContent ?? result.content ?? result);
        await app.sendMessage({ role: 'user', content: [{ type: 'text', text: 'Calculator computed: ' + JSON.stringify(payload) }] });
      });
      await app.connect();
      setTimeout(() => document.body.classList.add('ready'), 150);
    </script>
  </body>
</html>`,
        };
      }
      throw new Error(`Unknown resource URI: ${uri}`);
    },
  },
});

