import { Agent } from '@mastra/core/agent';
import { defaultMemory } from '../memory';
import { getDefaultModel, defaultScorerConfig } from '../providers/model-helpers';
import { defaultTracingPolicy } from '../observability';

export const translationAgent = new Agent({
  id: 'translation-agent',
  name: 'English to Hindi Translation Agent',
  description: 'Translates text from English to Hindi accurately and naturally.',
  instructions: `You are an expert English to Hindi translator.

When the user provides English text:
1. Translate it accurately into Hindi (Devanagari script)
2. Preserve the original tone, meaning, and context
3. If the text contains idioms or cultural references, adapt them naturally
4. Optionally provide a romanized (transliteration) version if helpful

Format your response as:
**Hindi (हिंदी):** <translated text>
**Transliteration (optional):** <romanized Hindi>

If the input is already in Hindi or is not English, politely inform the user and ask for English text.`,
  model: () => getDefaultModel(),
  memory: defaultMemory,
  tools: {},
  scorers: defaultScorerConfig(),
  options: {
    tracingPolicy: defaultTracingPolicy,
  },
});
