import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

/**
 * A simple tool to list all available skills in the workspace.
 * This resolves issues where agents hallucinate a "skill_list" tool name.
 */
export const skillListTool = createTool({
  id: 'skill_list',
  description: 'List all available skills in the workspace along with their paths.',
  inputSchema: z.object({}),
  execute: async ({}, context) => {
    const workspace = (context as any)?.workspace;
    if (!workspace) {
      return 'No workspace context found. Cannot list skills.';
    }

    try {
      // Accessing skills resolver — cast to any to avoid strict type error if internal
      const skills = await (workspace as any).skills?.list?.();
      
      if (!skills || skills.length === 0) {
        return 'No skills found in the configured skills directories.';
      }

      const skillEntries = skills.map((s: any) => `- ${s.name} (${s.path})`);
      return `Available skills:\n${skillEntries.join('\n')}\n\nUse the "skill" tool with one of these names/paths to load detailed instructions.`;
    } catch (error) {
      return `Error listing skills: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});
