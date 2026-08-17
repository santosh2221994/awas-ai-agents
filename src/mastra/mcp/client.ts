/**
 * mcp/client.ts
 *
 * MCPClient — connects to external MCP servers using locally-installed
 * packages to guarantee SDK version compatibility.
 *
 * Servers:
 *  filesystem         — read/write local files (sandboxed to project root)
 *                       npm: @modelcontextprotocol/server-filesystem
 *
 *  sequentialThinking — structured multi-step reasoning chains
 *                       npm: @modelcontextprotocol/server-sequential-thinking
 *
 * Usage (static — shared tools at agent init time):
 *   import { mcpClient } from '../mcp/client';
 *   const tools = await mcpClient.listTools();
 *
 * Usage (dynamic — per-request toolsets for multi-tenant apps):
 *   const toolsets = await mcpClient.listToolsets();
 *   await agent.generate(prompt, { toolsets });
 */

import { MCPClient } from '@mastra/mcp';
import { createRequire } from 'module';
import path from 'path';

// createRequire lets us use require.resolve in ESM context.
// We resolve relative to this file so paths survive bundling.
const require = createRequire(import.meta.url);

function getPkgDir(pkgName: string): string | null {
  try {
    return path.dirname(require.resolve(`${pkgName}/package.json`));
  } catch {
    return null;
  }
}

// Derive absolute paths for MCP server entry points safely
const fsPkgDir = getPkgDir('@modelcontextprotocol/server-filesystem');
const stPkgDir = getPkgDir('@modelcontextprotocol/server-sequential-thinking');

const servers: Record<string, any> = {};

if (fsPkgDir) {
  // Project root = 4 dirs up from node_modules/<pkg>/
  const PROJECT_ROOT = path.resolve(fsPkgDir, '../../..');
  servers.filesystem = {
    command: process.execPath,
    args: [
      path.join(fsPkgDir, 'dist/index.js'),
      PROJECT_ROOT,
    ],
    env: { ...process.env, LOG_LEVEL: 'error' },
    stderr: 'ignore',
    roots: [
      { uri: `file://${PROJECT_ROOT}`, name: 'Project Root' }
    ]
  };
}

if (stPkgDir) {
  servers.sequentialThinking = {
    command: process.execPath,
    args: [path.join(stPkgDir, 'dist/index.js')],
    env: { ...process.env, LOG_LEVEL: 'error' },
    stderr: 'ignore',
  };
}

export const mcpClient = new MCPClient({
  id: 'mastra-mcp-client',
  servers,
});
