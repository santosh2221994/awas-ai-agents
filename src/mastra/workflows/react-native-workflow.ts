import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { requestContextSchema } from '../context';

const generateCodeStep = createStep({
  id: 'generate-rn-code',
  description: 'Generate React Native code from a user prompt',
  inputSchema: z.object({
    prompt: z.string().describe('Description of the React Native component or feature to build'),
  }),
  outputSchema: z.object({
    prompt: z.string(),
    code: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('react-native-agent');
    if (!agent) throw new Error('react-native-agent not found');
    const result = await agent.generate([
      { role: 'user', content: inputData.prompt },
    ]);
    return { prompt: inputData.prompt, code: result.text };
  },
});

export const reactNativeWorkflow = createWorkflow({
  id: 'react-native-workflow',
  description: 'Generates React Native code based on a user prompt.',
  requestContextSchema,
  inputSchema: z.object({
    prompt: z.string().describe('Description of the React Native component or feature to build'),
  }),
  outputSchema: z.object({
    prompt: z.string(),
    code: z.string(),
  }),
})
  .then(generateCodeStep);

reactNativeWorkflow.commit();
