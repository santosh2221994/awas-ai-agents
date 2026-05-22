/**
 * workspace/index.ts
 *
 * Three workspace tiers for the Mastra app:
 *
 *  globalWorkspace   — default for all agents via Mastra({ workspace })
 *                      LocalFilesystem + LocalSandbox, safe approval gates
 *
 *  codeWorkspace     — power agents (mcp, browser, github-pr)
 *                      Same root + LSP, Claude-convention tool names, no gates
 *
 *  readonlyWorkspace — read-only agents (pdf, docs, csv, deep-search, youtube)
 *                      Filesystem only, all mutations disabled
 *
 * Directory layout:
 *   <project root>/workspace/     ← runtime files (gitignored)
 *   src/mastra/workspace/skills/  ← skill definitions (committed)
 */

import { Workspace, LocalFilesystem, LocalSandbox, WORKSPACE_TOOLS } from '@mastra/core/workspace';
import { fileURLToPath } from 'url';
import path from 'path';

const PROJECT_ROOT = process.cwd(); 
const WORKSPACE_ROOT = PROJECT_ROOT; // Agents can access the project root
const SKILLS_DIR = [
  '.agents/skills',
];

// ── Global Workspace (inherited by all agents) ────────────────────────────────
// Safe defaults: writes and commands require approval, delete is disabled.
export const globalWorkspace = new Workspace({
  filesystem: new LocalFilesystem({
    basePath: WORKSPACE_ROOT,
  }),
  sandbox: new LocalSandbox({
    workingDirectory: WORKSPACE_ROOT,
  }),
  skills: SKILLS_DIR,
  tools: {
    // Global defaults
    enabled: true,
    requireApproval: false,

    // Read — always open, no approval
    [WORKSPACE_TOOLS.FILESYSTEM.READ_FILE]: {
      enabled: true,
      requireApproval: false,
      maxOutputTokens: 4000,
    },

    // Write — must read first + human approval
    [WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE]: {
      requireApproval: true,
      requireReadBeforeWrite: true,
    },

    // Edit — same as write
    [WORKSPACE_TOOLS.FILESYSTEM.EDIT_FILE]: {
      requireApproval: true,
      requireReadBeforeWrite: true,
    },

    // Delete — disabled for safety at global level
    [WORKSPACE_TOOLS.FILESYSTEM.DELETE]: {
      enabled: false,
    },

    // Shell commands — require explicit approval
    [WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND]: {
      requireApproval: true,
      maxOutputTokens: 5000,
    },
  },
});

// ── Code Workspace (power agents) ─────────────────────────────────────────────
// Tool names follow Claude/Cursor conventions. No approval gates — these
// agents are trusted to manage their own file safety via requireReadBeforeWrite.
export const codeWorkspace = new Workspace({
  filesystem: new LocalFilesystem({
    basePath: WORKSPACE_ROOT,
  }),
  sandbox: new LocalSandbox({
    workingDirectory: WORKSPACE_ROOT,
  }),
  lsp: false,
  skills: SKILLS_DIR,
  tools: {
    enabled: true,
    requireApproval: false,

    // ── Remapped names (Claude/Cursor conventions) ──────────────────────────
    [WORKSPACE_TOOLS.FILESYSTEM.READ_FILE]: {
      name: 'view',
      maxOutputTokens: 6000,
    },
    [WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE]: {
      name: 'write_file',
      requireReadBeforeWrite: true,
    },
    [WORKSPACE_TOOLS.FILESYSTEM.EDIT_FILE]: {
      name: 'str_replace_editor',
      requireReadBeforeWrite: true,
    },
    [WORKSPACE_TOOLS.FILESYSTEM.LIST_FILES]: {
      name: 'find_files',
    },
    [WORKSPACE_TOOLS.FILESYSTEM.GREP]: {
      name: 'search_content',
      maxOutputTokens: 4000,
    },
    [WORKSPACE_TOOLS.FILESYSTEM.MKDIR]: {
      name: 'make_dir',
    },
    [WORKSPACE_TOOLS.FILESYSTEM.FILE_STAT]: {
      name: 'file_stat',
    },
    [WORKSPACE_TOOLS.FILESYSTEM.DELETE]: {
      // Enabled for power agents — they should confirm before calling
      enabled: true,
      requireApproval: false,
    },

    [WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND]: {
      name: 'execute_command',
      requireApproval: false,
      maxOutputTokens: 8000,
    },
    [WORKSPACE_TOOLS.SANDBOX.GET_PROCESS_OUTPUT]: {
      name: 'get_process_output',
    },
    [WORKSPACE_TOOLS.SANDBOX.KILL_PROCESS]: {
      name: 'kill_process',
    },

    [WORKSPACE_TOOLS.LSP.LSP_INSPECT]: {
      name: 'lsp_inspect',
    },
  },
});

// ── Read-Only Workspace (information agents) ──────────────────────────────────
// Filesystem only — no sandbox. All mutation tools are disabled.
// Agents can read and search but cannot write, delete, or execute commands.
export const readonlyWorkspace = new Workspace({
  filesystem: new LocalFilesystem({
    basePath: WORKSPACE_ROOT,
    readOnly: true,
  }),
  skills: SKILLS_DIR,
  tools: {
    enabled: true,
    requireApproval: false,

    // Read operations — fully enabled
    [WORKSPACE_TOOLS.FILESYSTEM.READ_FILE]: {
      enabled: true,
      maxOutputTokens: 6000,
    },
    [WORKSPACE_TOOLS.FILESYSTEM.LIST_FILES]: {
      enabled: true,
    },
    [WORKSPACE_TOOLS.FILESYSTEM.GREP]: {
      enabled: true,
      maxOutputTokens: 4000,
    },
    [WORKSPACE_TOOLS.FILESYSTEM.FILE_STAT]: {
      enabled: true,
    },

    // Write operations — all disabled
    [WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE]: {
      enabled: false,
    },
    [WORKSPACE_TOOLS.FILESYSTEM.EDIT_FILE]: {
      enabled: false,
    },
    [WORKSPACE_TOOLS.FILESYSTEM.DELETE]: {
      enabled: false,
    },
    [WORKSPACE_TOOLS.FILESYSTEM.MKDIR]: {
      enabled: false,
    },

    // Sandbox — not configured, but disable explicitly for clarity
    [WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND]: {
      enabled: false,
    },
  },
});

// ── Dynamic Workspace (per-user sandbox) ─────────────────────────────────────
// Used by mcpAgent and browserAgent when a requestContext is available.
// Each user gets their own sub-directory: ./workspace/<userId>/
// Falls back to ./workspace/anonymous/ when no user-id is set.
//
// Usage in an agent:
//   workspace: dynamicWorkspace
//
// The resolver runs on each request, so the filesystem path is always bound
// to the authenticated user before any tool call is made.
export const dynamicWorkspace = new Workspace({
  filesystem: ({ requestContext }) => {
    const userId = requestContext?.get?.('user-id') ?? 'anonymous';
    // Sanitize — strip anything that could traverse outside workspace root
    const safeId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_');
    return new LocalFilesystem({ basePath: path.join(PROJECT_ROOT, 'workspace', safeId) });
  },
  sandbox: (({ requestContext }: { requestContext: any }) => {
    const userId = requestContext?.get?.('user-id') ?? 'anonymous';
    const safeId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const allowCommands = requestContext?.get?.('allow-commands') === 'true';
    // Return undefined when commands are not permitted for this user
    if (!allowCommands) return undefined;
    return new LocalSandbox({ workingDirectory: path.join(PROJECT_ROOT, 'workspace', safeId) });
  }) as any,
  lsp: false,
  skills: SKILLS_DIR,
  tools: {
    enabled: true,
    requireApproval: false,

    [WORKSPACE_TOOLS.FILESYSTEM.READ_FILE]: {
      name: 'view',
      maxOutputTokens: 6000,
    },
    [WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE]: {
      name: 'write_file',
      requireReadBeforeWrite: true,
    },
    [WORKSPACE_TOOLS.FILESYSTEM.EDIT_FILE]: {
      name: 'str_replace_editor',
      requireReadBeforeWrite: true,
    },
    [WORKSPACE_TOOLS.FILESYSTEM.LIST_FILES]: {
      name: 'find_files',
    },
    [WORKSPACE_TOOLS.FILESYSTEM.GREP]: {
      name: 'search_content',
      maxOutputTokens: 4000,
    },
    [WORKSPACE_TOOLS.FILESYSTEM.MKDIR]: {
      name: 'make_dir',
    },
    [WORKSPACE_TOOLS.FILESYSTEM.FILE_STAT]: {
      name: 'file_stat',
    },
    [WORKSPACE_TOOLS.FILESYSTEM.DELETE]: {
      enabled: true,
      requireApproval: false,
    },

    // execute_command is gated: the sandbox resolver above returns null
    // when allow-commands != "true", so the tool is unavailable automatically.
    [WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND]: {
      name: 'execute_command',
      requireApproval: false,
      maxOutputTokens: 8000,
    },
    [WORKSPACE_TOOLS.SANDBOX.GET_PROCESS_OUTPUT]: {
      name: 'get_process_output',
    },
    [WORKSPACE_TOOLS.SANDBOX.KILL_PROCESS]: {
      name: 'kill_process',
    },

    [WORKSPACE_TOOLS.LSP.LSP_INSPECT]: {
      name: 'lsp_inspect',
    },
  },
});

