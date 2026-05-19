import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const calculatorWithUIToolBase = createTool({
  id: 'calculator_with_ui',
  description: 'Interactive calculator tool rendered with an MCP App UI.',
  inputSchema: z.object({
    num1: z.number(),
    num2: z.number(),
    operation: z.enum(['add', 'subtract']),
  }),
  outputSchema: z.object({
    result: z.number(),
  }),
  execute: async ({ num1, num2, operation }) => {
    const result = operation === 'add' ? num1 + num2 : num1 - num2;
    return { result };
  },
});

export const calculatorWithUITool = Object.assign(calculatorWithUIToolBase, {
  _meta: {
    ui: {
      resourceUri: 'ui://calculator/main',
    },
  },
});
