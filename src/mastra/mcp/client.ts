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

// Derive absolute paths for MCP server entry points from package.json locations
// (avoids CWD-relative resolution which breaks in Mastra's dev bundler)
const fsPkgDir = path.dirname(require.resolve('@modelcontextprotocol/server-filesystem/package.json'));
const stPkgDir = path.dirname(require.resolve('@modelcontextprotocol/server-sequential-thinking/package.json'));

// Project root = 4 dirs up from node_modules/<pkg>/
// node_modules is inside my-mastra-app, so: <pkg_dir>/../.. = my-mastra-app root
const PROJECT_ROOT = path.resolve(fsPkgDir, '../../..');

export const mcpClient = new MCPClient({
  id: 'mastra-mcp-client',
  servers: {
    // ── Filesystem (sandboxed to project root) ──────────────────────────────
    // Tools: read_file, write_file, list_directory, create_directory, move_file
    filesystem: {
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
    },

    // ── Sequential Thinking — multi-step structured reasoning ───────────────
    // Tool: sequentialthinking — chains thoughts with back-tracking support
    sequentialThinking: {
      command: process.execPath,
      args: [path.join(stPkgDir, 'dist/index.js')],
      env: { ...process.env, LOG_LEVEL: 'error' },
      stderr: 'ignore',
    },

  },
});
