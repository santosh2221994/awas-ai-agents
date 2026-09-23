import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Tool C: generateCanvasWorkflow
// Commits the final Directed Acyclic Graph (DAG) state to the AWAS Studio
// canvas, mapping tasks to their respective agents and defining execution
// edges (dependencies between nodes).
// ---------------------------------------------------------------------------

// ── Zod schemas for canvas primitives ──────────────────────────────────────

const PositionSchema = z.object({
  x: z.number().describe('Horizontal canvas position in pixels'),
  y: z.number().describe('Vertical canvas position in pixels'),
});

const NodeInputBindingSchema = z.object({
  paramName: z.string().describe('Agent/tool input parameter name'),
  source: z
    .enum(['user-input', 'node-output', 'static-value', 'context'])
    .describe('Where the value comes from'),
  sourceNodeId: z
    .string()
    .optional()
    .describe('For "node-output" source: the upstream node ID providing the value'),
  sourceOutputKey: z
    .string()
    .optional()
    .describe('For "node-output" source: the key on the upstream node output object'),
  staticValue: z
    .union([z.string(), z.number(), z.boolean(), z.null()])
    .optional()
    .describe('For "static-value" source: the literal value to inject'),
  contextKey: z
    .string()
    .optional()
    .describe('For "context" source: the requestContext Map key to read'),
});

const CanvasNodeSchema = z.object({
  id: z.string().describe('Unique node identifier on the canvas (e.g. "node-fetch-pdf")'),
  label: z.string().describe('Display label shown on the canvas node card'),
  agentId: z
    .string()
    .optional()
    .describe('AWAS agent ID assigned to this node (omit for trigger/output nodes)'),
  type: z
    .enum(['trigger', 'agent', 'tool', 'condition', 'output', 'parallel-split', 'parallel-join'])
    .default('agent')
    .describe('Functional role of this canvas node'),
  position: PositionSchema.optional().describe(
    'Optional canvas (x, y) coordinates. Auto-layout is applied when omitted.',
  ),
  inputBindings: z
    .array(NodeInputBindingSchema)
    .default([])
    .describe('Parameter mappings describing where each input value comes from'),
  outputKey: z
    .string()
    .optional()
    .describe('Key used to store this node\'s output for downstream access (default: node id)'),
  config: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional()
    .describe('Arbitrary node-level configuration (e.g. model overrides, retry policy)'),
});

const CanvasEdgeSchema = z.object({
  id: z.string().describe('Unique edge identifier'),
  source: z.string().describe('ID of the source (upstream) canvas node'),
  target: z.string().describe('ID of the target (downstream) canvas node'),
  label: z.string().optional().describe('Optional human-readable edge label'),
  condition: z
    .string()
    .optional()
    .describe(
      'Optional JSONPath or boolean expression; edge is only traversed when truthy (for condition nodes)',
    ),
});

// ── DAG validator ───────────────────────────────────────────────────────────

function detectCycle(
  nodes: { id: string }[],
  edges: { source: string; target: string }[],
): string | null {
  const adj: Record<string, string[]> = {};
  for (const n of nodes) adj[n.id] = [];
  for (const e of edges) {
    if (!adj[e.source]) adj[e.source] = [];
    adj[e.source].push(e.target);
  }

  const state: Record<string, 'unvisited' | 'visiting' | 'visited'> = {};
  for (const n of nodes) state[n.id] = 'unvisited';

  function dfs(nodeId: string): boolean {
    state[nodeId] = 'visiting';
    for (const neighbor of adj[nodeId] ?? []) {
      if (state[neighbor] === 'visiting') return true; // cycle found
      if (state[neighbor] === 'unvisited' && dfs(neighbor)) return true;
    }
    state[nodeId] = 'visited';
    return false;
  }

  for (const n of nodes) {
    if (state[n.id] === 'unvisited' && dfs(n.id)) {
      return `Cycle detected involving node "${n.id}". Workflow must be a DAG.`;
    }
  }
  return null;
}

/** Auto-assign (x, y) positions using a simple topological BFS layout. */
function autoLayout(
  nodes: Array<{ id: string; position?: { x: number; y: number } }>,
  edges: Array<{ source: string; target: string }>,
): Record<string, { x: number; y: number }> {
  // Compute in-degree for each node
  const inDegree: Record<string, number> = {};
  const adj: Record<string, string[]> = {};
  for (const n of nodes) {
    inDegree[n.id] = 0;
    adj[n.id] = [];
  }
  for (const e of edges) {
    inDegree[e.target] = (inDegree[e.target] ?? 0) + 1;
    adj[e.source].push(e.target);
  }

  // BFS from roots
  const queue: string[] = nodes.filter((n) => inDegree[n.id] === 0).map((n) => n.id);
  const level: Record<string, number> = {};
  const levelCount: Record<number, number> = {};

  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    const lvl = level[cur] ?? 0;
    levelCount[lvl] = (levelCount[lvl] ?? 0) + 1;
    for (const neighbor of adj[cur]) {
      level[neighbor] = Math.max(level[neighbor] ?? 0, lvl + 1);
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) queue.push(neighbor);
    }
  }

  const X_GAP = 300;
  const Y_GAP = 180;
  const colIndex: Record<number, number> = {};
  const positions: Record<string, { x: number; y: number }> = {};

  for (const n of nodes) {
    if (n.position) {
      // Honour explicitly set positions
      positions[n.id] = n.position;
      continue;
    }
    const lvl = level[n.id] ?? 0;
    const col = colIndex[lvl] ?? 0;
    colIndex[lvl] = col + 1;
    const totalInLevel = levelCount[lvl] ?? 1;
    positions[n.id] = {
      x: lvl * X_GAP + 80,
      y: col * Y_GAP - ((totalInLevel - 1) * Y_GAP) / 2 + 300,
    };
  }

  return positions;
}

// ── Main tool export ────────────────────────────────────────────────────────

export const generateCanvasWorkflowTool = createTool({
  id: 'generate_canvas_workflow',
  description:
    'Commits the final Directed Acyclic Graph (DAG) state to the AWAS Studio canvas. ' +
    'Maps workflow tasks to their respective agents, defines execution edges (dependencies), ' +
    'validates the DAG for cycles, auto-layouts node positions, and returns a complete ' +
    'canvas workflow definition ready to be rendered in AWAS Studio.',

  inputSchema: z.object({
    workflowId: z
      .string()
      .min(3)
      .describe('Unique workflow identifier (kebab-case, e.g. "invoice-processing-workflow")'),
    workflowName: z
      .string()
      .min(3)
      .describe('Human-readable workflow name shown in AWAS Studio'),
    description: z
      .string()
      .optional()
      .describe('Short explanation of what this workflow accomplishes'),
    nodes: z
      .array(CanvasNodeSchema)
      .min(1)
      .describe(
        'Ordered list of canvas nodes. Must include at least one "trigger" node and one "output" or "agent" terminal node.',
      ),
    edges: z
      .array(CanvasEdgeSchema)
      .describe('Directed edges connecting nodes. Together with nodes these form the DAG.'),
    executionMode: z
      .enum(['sequential', 'parallel', 'conditional'])
      .default('sequential')
      .describe('High-level execution strategy hint for the workflow runner.'),
    version: z
      .string()
      .default('1.0.0')
      .describe('Semantic version of this workflow definition.'),
    tags: z
      .array(z.string())
      .default([])
      .describe('Tags for discovery and filtering in AWAS Studio (e.g. ["finance", "daily"])'),
  }),

  outputSchema: z.object({
    workflowId: z.string(),
    workflowName: z.string(),
    description: z.string().optional(),
    version: z.string(),
    executionMode: z.string(),
    tags: z.array(z.string()),
    nodeCount: z.number(),
    edgeCount: z.number(),
    positions: z
      .record(z.string(), z.object({ x: z.number(), y: z.number() }))
      .describe('Computed (x, y) canvas positions keyed by node ID'),
    canvasDefinition: z
      .record(z.string(), z.unknown())
      .describe('Complete serialisable canvas payload for AWAS Studio rendering'),
    mermaidDiagram: z
      .string()
      .describe('Mermaid flowchart representation of the DAG for quick preview'),
    status: z.enum(['committed', 'validation-error']),
    message: z.string(),
  }),

  execute: async (input) => {
    // ── 1. Validate DAG (no cycles) ────────────────────────────────────────
    const cycleError = detectCycle(input.nodes, input.edges);
    if (cycleError) {
      return {
        workflowId: input.workflowId,
        workflowName: input.workflowName,
        description: input.description,
        version: input.version,
        executionMode: input.executionMode,
        tags: input.tags,
        nodeCount: input.nodes.length,
        edgeCount: input.edges.length,
        positions: {},
        canvasDefinition: {},
        mermaidDiagram: '',
        status: 'validation-error' as const,
        message: cycleError,
      };
    }

    // ── 2. Validate edge references ────────────────────────────────────────
    const nodeIds = new Set(input.nodes.map((n) => n.id));
    for (const edge of input.edges) {
      if (!nodeIds.has(edge.source)) {
        return {
          workflowId: input.workflowId,
          workflowName: input.workflowName,
          description: input.description,
          version: input.version,
          executionMode: input.executionMode,
          tags: input.tags,
          nodeCount: input.nodes.length,
          edgeCount: input.edges.length,
          positions: {},
          canvasDefinition: {},
          mermaidDiagram: '',
          status: 'validation-error' as const,
          message: `Edge "${edge.id}" references unknown source node "${edge.source}".`,
        };
      }
      if (!nodeIds.has(edge.target)) {
        return {
          workflowId: input.workflowId,
          workflowName: input.workflowName,
          description: input.description,
          version: input.version,
          executionMode: input.executionMode,
          tags: input.tags,
          nodeCount: input.nodes.length,
          edgeCount: input.edges.length,
          positions: {},
          canvasDefinition: {},
          mermaidDiagram: '',
          status: 'validation-error' as const,
          message: `Edge "${edge.id}" references unknown target node "${edge.target}".`,
        };
      }
    }

    // ── 2.5. Validate condition nodes ──────────────────────────────────────
    const outgoingEdgesMap: Record<string, typeof input.edges> = {};
    for (const e of input.edges) {
      if (!outgoingEdgesMap[e.source]) outgoingEdgesMap[e.source] = [];
      outgoingEdgesMap[e.source].push(e);
    }

    for (const node of input.nodes) {
      if (node.type === 'condition') {
        const outEdges = outgoingEdgesMap[node.id] ?? [];
        if (outEdges.length === 0) {
          return {
            workflowId: input.workflowId,
            workflowName: input.workflowName,
            description: input.description,
            version: input.version,
            executionMode: input.executionMode,
            tags: input.tags,
            nodeCount: input.nodes.length,
            edgeCount: input.edges.length,
            positions: {},
            canvasDefinition: {},
            mermaidDiagram: '',
            status: 'validation-error' as const,
            message: `Condition node "${node.id}" (${node.label}) must have at least one outgoing branch edge.`,
          };
        }
      }
    }

    // ── 3. Auto-layout ─────────────────────────────────────────────────────
    const positions = autoLayout(input.nodes, input.edges);

    // ── 4. Build full canvas definition ────────────────────────────────────
    const enrichedNodes = input.nodes.map((node) => ({
      ...node,
      position: positions[node.id],
      outputKey: node.outputKey ?? node.id,
    }));

    const canvasDefinition = {
      schema: 'awas-canvas/v1',
      workflowId: input.workflowId,
      workflowName: input.workflowName,
      description: input.description ?? '',
      version: input.version,
      executionMode: input.executionMode,
      tags: input.tags,
      createdAt: new Date().toISOString(),
      nodes: enrichedNodes,
      edges: input.edges,
    };

    // ── 5. Generate Mermaid flowchart ──────────────────────────────────────
    const mermaidLines: string[] = ['flowchart LR'];
    for (const node of input.nodes) {
      const shape =
        node.type === 'trigger'
          ? `([${node.label}])`
          : node.type === 'output'
          ? `[/${node.label}/]`
          : node.type === 'condition'
          ? `{${node.label}}`
          : `[${node.label}]`;
      mermaidLines.push(`    ${node.id}${shape}`);
    }
    for (const edge of input.edges) {
      const arrow = edge.condition
        ? `-- "${edge.label ?? edge.condition}" -->`
        : `-->${edge.label ? ` |${edge.label}|` : ''}`;
      mermaidLines.push(`    ${edge.source} ${arrow} ${edge.target}`);
    }
    const mermaidDiagram = mermaidLines.join('\n');

    return {
      workflowId: input.workflowId,
      workflowName: input.workflowName,
      description: input.description,
      version: input.version,
      executionMode: input.executionMode,
      tags: input.tags,
      nodeCount: input.nodes.length,
      edgeCount: input.edges.length,
      positions,
      canvasDefinition,
      mermaidDiagram,
      status: 'committed' as const,
      message:
        `Workflow "${input.workflowName}" committed successfully with ${input.nodes.length} node(s) ` +
        `and ${input.edges.length} edge(s). Canvas definition is ready for AWAS Studio rendering.`,
    };
  },
});
