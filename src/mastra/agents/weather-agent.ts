import { Agent } from '@mastra/core/agent';
import { weatherTool } from '../tools/weather-tool';

import { defaultMemory } from '../memory';
import { requestContextSchema } from '../context';
import { resolveAgentModel, localeInstruction, defaultScorerConfig } from '../providers/model-helpers';
import { defaultTracingPolicy } from '../observability';

/** Model routing by tier — enterprise gets highest capacity, free gets default. */
const modelForTier = (tier: string | undefined) => {
  switch (tier) {
    case 'enterprise':
      return resolveAgentModel('lm-studio:google/gemma-4-12b-qat');
    case 'pro':
      return resolveAgentModel('lm-studio:google/gemma-3-4b');
    default:
      return resolveAgentModel();
  }
};


const BASE_INSTRUCTIONS = `
You are a helpful weather assistant that provides accurate weather information
and can help plan activities based on weather conditions.

Your primary function is to help users get weather details for specific locations.
When responding:
- Always ask for a location if none is provided
- If the location name isn't in English, please translate it
- If giving a location with multiple parts (e.g. "New York, NY"), use the most relevant part
- Include relevant details like humidity, wind conditions, and precipitation
- Keep responses concise but informative
- Suggest activities based on the weather forecast when asked

Use the weatherTool to fetch current weather data. The tool returns temperature
in the unit preferred by the user (celsius or fahrenheit) — always report it with the unit label.
`;

export const weatherAgent = new Agent({
  id: 'weather-agent',
  name: 'Weather Agent',
  description: 'Provides current weather conditions and forecasts for any city using the Open-Meteo API.',

  // ── Dynamic model — routes by user tier ──────────────────────────────────
  model: ({ requestContext }) => {
    const tier = requestContext?.get?.('user-tier');
    return modelForTier(tier as string | undefined);
  },

  // ── Dynamic instructions — locale-aware ──────────────────────────────────
  instructions: async ({ requestContext }) => {
    const tier   = requestContext?.get?.('user-tier') as string | undefined;
    const locale = requestContext?.get?.('locale')   as string | undefined;
    const unit   = requestContext?.get?.('temperature-unit') as string | undefined;

    const tierNote = tier === 'enterprise'
      ? '\nYou are serving an enterprise user. Provide detailed, technical responses.'
      : '';
    const unitNote = `\nAlways report temperature in ${unit === 'fahrenheit' ? 'Fahrenheit (°F)' : 'Celsius (°C)'}.`;

    return `${BASE_INSTRUCTIONS}${tierNote}${unitNote}${localeInstruction(locale)}`.trim();
  },

  // ── Context schema — validates required keys before LLM call ─────────────
  requestContextSchema,

  tools: { weatherTool },
  scorers: defaultScorerConfig(),
  options: {
    tracingPolicy: defaultTracingPolicy,
  },
  memory: defaultMemory,
});
