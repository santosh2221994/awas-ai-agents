import { Agent } from '@mastra/core/agent';
import { lmStudioModel } from '../providers/lm-studio';
import { defaultMemory } from '../memory';
import { defaultScorerConfig } from '../providers/model-helpers';
import { defaultTracingPolicy } from '../observability';

export const reactNativeAgent = new Agent({
  id: 'react-native-agent',
  name: 'React Native Code Generator',
  description: 'Generates React Native code based on user prompts.',
  instructions: `You are an expert React Native developer. When the user describes a UI, feature, or component, you generate clean, production-ready React Native code.

Guidelines:
- Always use functional components with React hooks
- Use TypeScript when possible
- Include all necessary imports at the top
- Add StyleSheet for styling (avoid inline styles)
- Keep components self-contained and reusable
- Add brief inline comments only where logic is non-obvious
- Wrap output in a single code block using \`\`\`tsx ... \`\`\`
- If the prompt is ambiguous, make reasonable assumptions and note them briefly before the code block
- Keep generated code concise — avoid excessive boilerplate or repeated comments`,
  model: () => {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key || key === 'your-google-api-key') {
      return lmStudioModel();
    }
    return 'google/gemini-2.0-flash';
  },
  memory: defaultMemory,
  scorers: defaultScorerConfig(),
  options: {
    tracingPolicy: defaultTracingPolicy,
    timeout: 120000, // 2 minutes — handles large code generation responses
  },
});
