/**
 * internal-api.ts
 *
 * Dynamic agent registry, runtime agent provisioning, and tool catalogue lookup
 * for AWAS (Agentic Workplace Automation System).
 *
 * Implements endpoints and handlers for:
 * - POST /internal/agents/register  (dynamic agent registration)
 * - GET  /internal/agents/:id       (dynamic agent lookup)
 * - GET  /internal/tools            (tools catalogue lookup)
 */

import { createDynamicAgent, AVAILABLE_TOOLS_MAP } from './agents/dynamic-agent-factory';

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

/**
 * Returns the registered tools catalogue.
 */
export function getToolsCatalogue() {
  const uniqueTools: Record<string, any> = {};
  for (const [key, tool] of Object.entries(AVAILABLE_TOOLS_MAP)) {
    const id = tool?.id || key;
    if (!uniqueTools[id]) {
      uniqueTools[id] = {
        id,
        name: tool?.name || id,
        description: tool?.description || '',
      };
    }
  }
  return Object.values(uniqueTools);
}
