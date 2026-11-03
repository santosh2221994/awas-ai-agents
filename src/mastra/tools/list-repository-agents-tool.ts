import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { CATALOGUE_MANIFESTS } from '../registry/catalogue-manifests';

// ---------------------------------------------------------------------------
// Tool A: listRepositoryAgents
// Queries the AWAS user repository to find available existing agents before
// creating new ones. Returns a structured registry of agent IDs, names,
// descriptions, and their associated tools/capabilities.
// ---------------------------------------------------------------------------

/** Shape of a single agent entry returned by the tool. */
const AgentEntrySchema = z.object({
  id: z.string().describe('Unique agent identifier (e.g. "ENT-02" or "github-pr-agent")'),
  slug: z.string().optional().describe('Stable agent slug'),
  name: z.string().describe('Human-readable display name'),
  domain: z.string().optional().describe('Domain vertical (entertainment, productivity, marketing, operations, supervisor)'),
  status: z.string().optional().describe('Lifecycle status (planned, scaffolded, active, deprecated)'),
  description: z.string().describe('Short summary of the agent\'s role'),
  tools: z.array(z.string()).describe('List of tool IDs registered on this agent'),
  skills: z.array(z.string()).optional().describe('List of reusable skill IDs registered on this agent'),
  model: z.string().optional().describe('Model profile or LLM model identifier'),
  tags: z.array(z.string()).describe('Capability tags'),
});

export type AgentEntry = z.infer<typeof AgentEntrySchema>;

const TAG_KEYWORDS_MAP: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['search', ['search', 'exa', 'web', 'research']],
  ['document', ['pdf', 'document', 'doc', 'read']],
  ['database', ['sql', 'database', 'db', 'query']],
  ['communication', ['slack', 'notify', 'message', 'email']],
  ['code', ['github', 'pr', 'code', 'react', 'native']],
  ['data', ['csv', 'sheet', 'spreadsheet', 'data']],
  ['video', ['youtube', 'video', 'transcript']],
  ['translation', ['translat', 'language', 'locale']],
  ['ai', ['gemma', 'flash', 'llm', 'model']],
  ['browser', ['browser', 'playwright', 'scrape', 'web']],
  ['workflow', ['workflow', 'canvas', 'dag', 'studio', 'co-pilot']],
  ['mcp', ['mcp', 'protocol', 'tool-call']],
];

// Precompute canonical ID, slug, and legacy-alias set once at module load
const SEEN_CATALOGUE_AGENT_IDS = new Set<string>();
for (const m of CATALOGUE_MANIFESTS) {
  SEEN_CATALOGUE_AGENT_IDS.add(m.id);
  SEEN_CATALOGUE_AGENT_IDS.add(m.slug);
  for (const alias of m.legacyAliases ?? []) {
    SEEN_CATALOGUE_AGENT_IDS.add(alias);
  }
}

// Precompute immutable catalogue entries once at module load to avoid per-call allocations
const PRECOMPUTED_CATALOGUE_ENTRIES_DETAILED: AgentEntry[] = CATALOGUE_MANIFESTS.map((m) => ({
  id: m.id,
  slug: m.slug,
  name: m.name,
  domain: m.domain,
  status: m.status,
  description: m.description,
  tools: m.tools,
  skills: m.skills,
  model: m.modelProfile,
  tags: m.tags,
}));

const PRECOMPUTED_CATALOGUE_ENTRIES_BRIEF: AgentEntry[] = CATALOGUE_MANIFESTS.map((m) => ({
  id: m.id,
  slug: m.slug,
  name: m.name,
  domain: m.domain,
  status: m.status,
  description: m.description,
  tools: [],
  skills: [],
  model: m.modelProfile,
  tags: [],
}));

/** Extract simple capability tags from a raw description string. */
function inferTags(description: string): string[] {
  const lower = description.toLowerCase();
  const found: string[] = [];
  for (const [tag, keywords] of TAG_KEYWORDS_MAP) {
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
    const rawAgents: Record<string, any> = mastraInstance?.agents ?? {};

    // Canonical 46-role AgentRegistry catalogue (single source of truth, precomputed)
    const catalogueEntries = input.includeDetails
      ? PRECOMPUTED_CATALOGUE_ENTRIES_DETAILED
      : PRECOMPUTED_CATALOGUE_ENTRIES_BRIEF;

    // Include only genuine custom user-provisioned agents that do not duplicate catalogue roles
    const customEntries: AgentEntry[] = Object.entries(rawAgents)
      .filter(([id, agent]) => !SEEN_CATALOGUE_AGENT_IDS.has(id) && !SEEN_CATALOGUE_AGENT_IDS.has(agent?.id))
      .map(([id, agent]) => {
        const description: string = agent?.description ?? agent?._def?.description ?? '';
        const toolIds: string[] = input.includeDetails
          ? Array.isArray(agent?.tools)
            ? agent.tools
            : Object.keys(agent?.tools ?? {})
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

    const allEntries: AgentEntry[] = [...catalogueEntries, ...customEntries];

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
