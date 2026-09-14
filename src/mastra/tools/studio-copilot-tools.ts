import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// ============================================================================
// Tool A: listRepositoryAgents
// Description: Queries the AWAS user repository to find available existing agents before creating new ones.
// ============================================================================

export const listRepositoryAgents = createTool({
  id: 'listRepositoryAgents',
  description:
    'Queries the AWAS user repository to find available existing agents before creating new ones.',
  inputSchema: z.object({
    taskDescription: z.string().describe('What the required agent needs to do.'),
    requiredCapabilities: z
      .array(z.string())
      .optional()
      .describe('Specific skills needed.'),
  }),
  outputSchema: z.object({
    agents: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        model: z.string(),
        capabilities: z.array(z.string()),
      }),
    ),
    matchCount: z.number(),
    message: z.string(),
  }),
  execute: async (inputData) => {
    const { taskDescription, requiredCapabilities } = inputData;

    // Simulated async database query to AWAS user repository
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Mock existing repository agents database entries
    const mockRepositoryAgents = [
      {
        id: 'web-scraper-agent',
        name: 'Web Scraper Agent',
        model: 'gpt-4o',
        capabilities: ['web-scraping', 'html-parsing', 'data-extraction'],
      },
      {
        id: 'pdf-parser-agent',
        name: 'PDF Parser Agent',
        model: 'gpt-4o-mini',
        capabilities: ['pdf-processing', 'text-extraction', 'document-analysis'],
      },
      {
        id: 'slack-notifier-agent',
        name: 'Slack Notifier Agent',
        model: 'gemma',
        capabilities: ['slack-messaging', 'alerts', 'notifications'],
      },
      {
        id: 'sql-query-agent',
        name: 'SQL Query Agent',
        model: 'gpt-4o',
        capabilities: ['sql-generation', 'database-querying', 'data-analysis'],
      },
    ];

    // Filter agents based on requiredCapabilities or task description
    const matchingAgents = mockRepositoryAgents.filter((agent) => {
      if (requiredCapabilities && requiredCapabilities.length > 0) {
        return requiredCapabilities.some((cap) =>
          agent.capabilities.some((ac) => ac.toLowerCase().includes(cap.toLowerCase())),
        );
      }
      const descLower = taskDescription.toLowerCase();
      return (
        agent.capabilities.some((cap) => descLower.includes(cap)) ||
        agent.name.toLowerCase().includes(descLower)
      );
    });

    const resultList = matchingAgents.length > 0 ? matchingAgents : mockRepositoryAgents;

    return {
      agents: resultList,
      matchCount: resultList.length,
      message: `Queried AWAS repository for "${taskDescription}". Found ${resultList.length} candidate agent(s).`,
    };
  },
});

// ============================================================================
// Tool B: createNewAgent
// Description: Dynamically provisions and registers a new agent if no existing repository agent fits the workflow task.
// ============================================================================

export const createNewAgent = createTool({
  id: 'createNewAgent',
  description:
    'Dynamically provisions and registers a new agent if no existing repository agent fits the workflow task.',
  inputSchema: z.object({
    name: z.string().describe('The generated name of the agent.'),
    model: z.string().describe('The LLM model to use (e.g., gpt-4o, gemma).'),
    roleDescription: z.string().describe('The system prompt/role for the new agent.'),
    tools: z.array(z.string()).describe('IDs of tools the agent will need.'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    agentId: z.string(),
    agent: z.object({
      id: z.string(),
      name: z.string(),
      model: z.string(),
      roleDescription: z.string(),
      tools: z.array(z.string()),
      createdAt: z.string(),
    }),
    message: z.string(),
  }),
  execute: async (inputData) => {
    const { name, model, roleDescription, tools } = inputData;

    // Simulated async database insertion into AWAS repository
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Generate unique kebab-case agentId
    const generatedAgentId =
      name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') + `-${Date.now().toString(36)}`;

    const newAgentRecord = {
      id: generatedAgentId,
      name,
      model,
      roleDescription,
      tools,
      createdAt: new Date().toISOString(),
    };

    return {
      success: true,
      agentId: generatedAgentId,
      agent: newAgentRecord,
      message: `Successfully provisioned and registered new agent "${name}" with ID "${generatedAgentId}".`,
    };
  },
});

// ============================================================================
// Tool C: generateCanvasWorkflow
// Description: Commits the final Directed Acyclic Graph (DAG) state to the AWAS Studio canvas, mapping tasks to their respective agents and defining execution edges.
// ============================================================================

export const generateCanvasWorkflow = createTool({
  id: 'generateCanvasWorkflow',
  description:
    'Commits the final Directed Acyclic Graph (DAG) state to the AWAS Studio canvas, mapping tasks to their respective agents and defining execution edges.',
  inputSchema: z.object({
    nodes: z
      .array(
        z.object({
          taskId: z.string().describe('Unique task node identifier.'),
          agentId: z.string().describe('Identifier of the assigned agent.'),
          description: z.string().describe('Task objective or description.'),
        }),
      )
      .min(1, 'At least one task node is required.'),
    edges: z.array(
      z.object({
        sourceId: z.string().describe('Source task node ID.'),
        targetId: z.string().describe('Target task node ID.'),
        mode: z.enum(['sync', 'async']).describe('Execution mode ("sync" or "async").'),
      }),
    ),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    workflowId: z.string(),
    nodeCount: z.number(),
    edgeCount: z.number(),
    deploymentPayload: z.object({
      workflowId: z.string(),
      committedAt: z.string(),
      nodes: z.array(
        z.object({
          taskId: z.string(),
          agentId: z.string(),
          description: z.string(),
        }),
      ),
      edges: z.array(
        z.object({
          sourceId: z.string(),
          targetId: z.string(),
          mode: z.enum(['sync', 'async']),
        }),
      ),
    }),
    message: z.string(),
  }),
  execute: async (inputData) => {
    const { nodes, edges } = inputData;

    // Validate graph node existence for edges
    const taskIds = new Set(nodes.map((n) => n.taskId));
    for (const edge of edges) {
      if (!taskIds.has(edge.sourceId)) {
        throw new Error(
          `Invalid edge: sourceId "${edge.sourceId}" does not exist in task nodes.`,
        );
      }
      if (!taskIds.has(edge.targetId)) {
        throw new Error(
          `Invalid edge: targetId "${edge.targetId}" does not exist in task nodes.`,
        );
      }
    }

    // Cycle detection algorithm (DAG Validation)
    const adjacency: Record<string, string[]> = {};
    for (const id of taskIds) adjacency[id] = [];
    for (const edge of edges) adjacency[edge.sourceId].push(edge.targetId);

    const visited: Record<string, boolean> = {};
    const recStack: Record<string, boolean> = {};

    const hasCycle = (curr: string): boolean => {
      visited[curr] = true;
      recStack[curr] = true;
      for (const neighbor of adjacency[curr] || []) {
        if (!visited[neighbor] && hasCycle(neighbor)) return true;
        if (recStack[neighbor]) return true;
      }
      recStack[curr] = false;
      return false;
    };

    for (const id of taskIds) {
      if (!visited[id] && hasCycle(id)) {
        throw new Error(
          `Cycle detected in workflow graph involving task "${id}". Workflow graph must be a Directed Acyclic Graph (DAG).`,
        );
      }
    }

    const workflowId = `wf-canvas-${Date.now().toString(36)}`;
    const committedAt = new Date().toISOString();

    return {
      success: true,
      workflowId,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      deploymentPayload: {
        workflowId,
        committedAt,
        nodes,
        edges,
      },
      message: `Canvas workflow committed successfully to AWAS Studio with ${nodes.length} task node(s) and ${edges.length} edge(s).`,
    };
  },
});
