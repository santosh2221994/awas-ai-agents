/**
 * agents/mcp-agent.ts
 *
 * A general-purpose agent supercharged with tools from two MCP servers:
 *
 *  filesystem        — read/write files, list directories (sandboxed to project root)
 *                      package: @modelcontextprotocol/server-filesystem
 *
 *  sequentialThinking — structured multi-step reasoning chains
 *                       package: @modelcontextprotocol/server-sequential-thinking
 *
 * Tools are loaded STATICALLY at module load time via `await mcpClient.listTools()`.
 * This is appropriate because the credentials are shared (no per-user auth).
 *
 * For multi-tenant / per-user credentials, use `mcpClient.listToolsets()` and
 * pass the toolsets to `agent.generate(prompt, { toolsets })` instead.
 *
 * RequestContext:
 *  user-id        — prepended to instructions for audit attribution
 *  allow-commands — "true" activates the dynamic workspace sandbox; otherwise readonly
 */

import { Agent } from '@mastra/core/agent';
import { dynamicWorkspace } from '../workspace';
import { mcpClient } from '../mcp/client';
import { TokenLimiter, EnsureFinalResponseProcessor, UsageTrackerProcessor } from '../processors';
import { defaultMemory } from '../memory';
import { lmStudioModel } from '../providers/lm-studio';
import { skillListTool } from '../tools/skill-list-tool';
import { requestContextSchema } from '../context';
import { lightScorerConfig } from '../providers/model-helpers';

const MCP_AGENT_MAX_STEPS = 12;

// Load tools from all connected MCP servers once at startup.
// Falls back gracefully if an MCP server is temporarily unavailable.
let mcpTools: Awaited<ReturnType<typeof mcpClient.listTools>> = {};
try {
  mcpTools = await mcpClient.listTools();
} catch (err) {
  console.warn('[mcp-agent] Could not load MCP tools at startup — will retry on first call.', err);
}

const BASE_INSTRUCTIONS = `You are a powerful assistant with access to tools from multiple MCP servers.

## Your capabilities

### Workspace filesystem tools (view / write_file / str_replace_editor / find_files / search_content)
- Read, write, search, and edit files on the local machine (sandboxed to your user directory)
- Great for reading config files, parsing data, saving results to disk

### Sequential Thinking tool
- Break complex problems into structured reasoning steps
- Use when a task requires careful multi-step planning, estimation, or debugging
- Explicitly call sequentialthinking before attempting complex tasks

## Workflow
1. Understand the user's goal fully before acting
2. For complex tasks, use sequential thinking to plan first
3. Execute step by step, verifying each action
4. Report results clearly with relevant file paths

Always confirm before writing or modifying files. Summarize what you did and the final outcome.`;

export const mcpAgent = new Agent({
  id: 'mcp-agent',
  name: 'MCP Agent',
  description:
    'A general-purpose agent with filesystem access, HTTP fetch, and structured reasoning via MCP.',

  // ── Dynamic workspace — per-user sandbox directory ────────────────────────
  // dynamicWorkspace resolves ./workspace/<userId>/ from requestContext.
  // Sandbox is enabled only when allow-commands === "true".
  workspace: dynamicWorkspace,
  memory: defaultMemory,

  model: () => {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key || key === 'your-google-api-key') {
      return lmStudioModel();
    }
    return 'google/gemini-2.0-flash';
  },

  // ── Dynamic instructions — injects userId for attribution ─────────────────
  instructions: async ({ requestContext }) => {
    const userId        = requestContext?.get?.('user-id')        as string | undefined;
    const allowCommands = requestContext?.get?.('allow-commands') as string | undefined;

    const attribution = userId
      ? `\n\n> Acting on behalf of user: **${userId}** — all file changes are attributed to this identity.`
      : '';

    const sandboxNote = allowCommands === 'true'
      ? '\n\n> ✅ Shell command execution (execute_command) is enabled for this session.'
      : '\n\n> ⛔ Shell command execution is disabled for this session. You can read and write files only.';

    return `${BASE_INSTRUCTIONS}${attribution}${sandboxNote}`;
  },

  // ── Context schema — validate known keys ─────────────────────────────────
  requestContextSchema,

  tools: { ...mcpTools, skillListTool },

  inputProcessors: [
    new TokenLimiter(100_000),
    new EnsureFinalResponseProcessor(MCP_AGENT_MAX_STEPS),
  ],
  outputProcessors: [
    new UsageTrackerProcessor(),
  ],
  // ── Evals — powers Evaluate + Review tabs in Mastra Studio ───────────────
  scorers: lightScorerConfig(),
});
