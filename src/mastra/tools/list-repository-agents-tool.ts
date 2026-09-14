import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Tool A: listRepositoryAgents
// Queries the AWAS user repository to find available existing agents before
// creating new ones. Returns a structured registry of agent IDs, names,
// descriptions, and their associated tools/capabilities.
// ---------------------------------------------------------------------------

/** Shape of a single agent entry returned by the tool. */
const AgentEntrySchema = z.object({
  id: z.string().describe('Unique agent identifier (e.g. "github-pr-agent")'),
  name: z.string().describe('Human-readable display name'),
  description: z.string().describe('Short summary of the agent\'s role'),
  tools: z.array(z.string()).describe('List of tool IDs registered on this agent'),
  model: z.string().optional().describe('LLM model identifier if known'),
  tags: z.array(z.string()).describe('Capability tags inferred from the agent description'),
});

export type AgentEntry = z.infer<typeof AgentEntrySchema>;

/** Extract simple capability tags from a raw description string. */
function inferTags(description: string): string[] {
  const tagMap: Record<string, string[]> = {
    search: ['search', 'exa', 'web', 'research'],
    document: ['pdf', 'document', 'doc', 'read'],
    database: ['sql', 'database', 'db', 'query'],
    communication: ['slack', 'notify', 'message', 'email'],
    code: ['github', 'pr', 'code', 'react', 'native'],
    data: ['csv', 'sheet', 'spreadsheet', 'data'],
    video: ['youtube', 'video', 'transcript'],
    translation: ['translat', 'language', 'locale'],
    ai: ['gemma', 'flash', 'llm', 'model'],
    browser: ['browser', 'playwright', 'scrape', 'web'],
    workflow: ['workflow', 'canvas', 'dag', 'studio', 'co-pilot'],
    mcp: ['mcp', 'protocol', 'tool-call'],
  };

  const lower = description.toLowerCase();
  const found: string[] = [];
  for (const [tag, keywords] of Object.entries(tagMap)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      found.push(tag);
    }
  }
  return found;
}

export const listRepositoryAgentsTool = createTool({
  id: 'list_repository_agents',
  description:
    'Queries the AWAS agent repository to enumerate all registered agents with their IDs, names, descriptions, tools, and capability tags. ' +
    'Always call this tool BEFORE suggesting or creating a new agent to avoid duplication.',

  inputSchema: z.object({
    filterByTag: z
      .string()
      .optional()
      .describe(
        'Optional capability tag to filter results (e.g. "search", "database", "communication"). Leave empty to list all agents.',
      ),
    includeDetails: z
      .boolean()
      .default(true)
      .describe('When true, includes per-agent tool list and inferred capability tags.'),
  }),

  outputSchema: z.object({
    totalCount: z.number(),
    agents: z.array(AgentEntrySchema),
    suggestion: z.string().optional().describe('A recommendation from the tool about next steps'),
  }),

  execute: async (input, context) => {
    // Pull agent registry from Mastra context
    const mastraInstance: any = (context as any)?.mastra ?? (context as any)?.container?.mastra;

    let rawAgents: Record<string, any> = {};
    if (mastraInstance?.agents) {
      rawAgents = mastraInstance.agents;
    } else {
      // Graceful fallback: reflect the static known registry so the agent is
      // never left empty-handed even without a live Mastra context.
      rawAgents = {
        'weather-agent': {
          name: 'Weather Agent',
          description: 'Fetches real-time weather forecasts and conditions.',
          tools: ['weather-tool'],
        },
        'deep-search-agent': {
          name: 'Deep Search Agent',
          description: 'Performs multi-step web research using Exa search.',
          tools: ['exa-search', 'exa-scrape-page'],
        },
        'google-sheets-agent': {
          name: 'Google Sheets Agent',
          description: 'Reads and writes data in Google Sheets spreadsheets.',
          tools: ['google-sheets-tool'],
        },
        'text-to-sql-agent': {
          name: 'Text-to-SQL Agent',
          description: 'Translates natural language questions into SQL database queries.',
          tools: ['sql-tool'],
        },
        'pdf-chat-agent': {
          name: 'PDF Chat Agent',
          description: 'Answers questions about uploaded PDF documents.',
          tools: ['pdf-tool'],
        },
        'flash-cards-agent': {
          name: 'Flash Cards Agent',
          description: 'Generates study flash cards from provided content.',
          tools: [],
        },
        'csv-questions-agent': {
          name: 'CSV Questions Agent',
          description: 'Parses and answers questions from CSV data files.',
          tools: ['csv-tool'],
        },
        'github-pr-agent': {
          name: 'GitHub PR Agent',
          description: 'Reviews GitHub pull requests, summarises changes, and suggests improvements.',
          tools: ['github-tool'],
        },
        'docs-chatbot-agent': {
          name: 'Docs Chatbot Agent',
          description: 'Answers questions from documentation corpora.',
          tools: [],
        },
        'youtube-chat-agent': {
          name: 'YouTube Chat Agent',
          description: 'Fetches YouTube transcripts and answers questions about video content.',
          tools: ['youtube-tool'],
        },
        'slack-agent': {
          name: 'Slack Agent',
          description: 'Sends messages and notifications to Slack channels.',
          tools: ['slack-tool'],
        },
        'customer-feedback-agent': {
          name: 'Customer Feedback Agent',
          description: 'Analyses and classifies customer feedback sentiment.',
          tools: [],
        },
        'mcp-agent': {
          name: 'MCP Agent',
          description: 'General-purpose agent that connects to external tools via the MCP protocol.',
          tools: ['mcp'],
        },
        'gemma-agent': {
          name: 'Gemma Agent',
          description: 'Runs inference using Google Gemma open-weight LLMs.',
          tools: [],
        },
        'video-idea-gen-agent': {
          name: 'Video Idea Gen Agent',
          description: 'Generates creative video concepts and scripts.',
          tools: [],
        },
        'react-native-agent': {
          name: 'React Native Agent',
          description: 'Assists with React Native mobile app development questions.',
          tools: [],
        },
        'translation-agent': {
          name: 'Translation Agent',
          description: 'Translates text between multiple languages.',
          tools: [],
        },
        'studio-chat-agent': {
          name: 'Studio Chat Co-Pilot Agent',
          description:
            'AI-assisted Studio Co-Pilot for AWAS canvas and agent editor. Assists users with system prompt drafting, tool selection, model tuning, node configurations, parameter mapping, and workflow auto-wiring.',
          tools: ['skill_list', 'exa-search'],
        },
        'browser-agent': {
          name: 'Browser Agent',
          description: 'Controls a headless Playwright browser for web automation and scraping.',
          tools: ['browser-tool'],
        },
      };
    }

    // Normalise and enrich each entry
    const allEntries: AgentEntry[] = Object.entries(rawAgents).map(([id, agent]) => {
      const description: string = agent?.description ?? agent?._def?.description ?? '';
      const toolIds: string[] = input.includeDetails
        ? Object.keys(agent?.tools ?? {})
        : [];
      const tags: string[] = input.includeDetails ? inferTags(description) : [];

      return {
        id,
        name: agent?.name ?? id,
        description,
        tools: toolIds,
        model: agent?.model?.modelId ?? agent?.model?.id ?? undefined,
        tags,
      };
    });

    // Optional tag filter
    const filtered = input.filterByTag
      ? allEntries.filter((a) =>
          a.tags.includes(input.filterByTag!) ||
          a.description.toLowerCase().includes(input.filterByTag!.toLowerCase()),
        )
      : allEntries;

    // Recommendation message
    let suggestion: string | undefined;
    if (filtered.length === 0) {
      suggestion =
        `No existing agents match the tag "${input.filterByTag}". ` +
        `Consider using the "create_new_agent" tool to provision a new one.`;
    } else {
      suggestion =
        `Found ${filtered.length} matching agent(s). Review the list below before ` +
        `deciding to create a new agent with "create_new_agent".`;
    }

    return {
      totalCount: filtered.length,
      agents: filtered,
      suggestion,
    };
  },
});
