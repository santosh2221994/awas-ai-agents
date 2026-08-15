import { Memory } from '@mastra/memory';

/**
 * Shared memory configuration for Mastra agents.
 *
 * Settings:
 * - lastMessages: 15   — trimmed from 20 to reduce per-call token overhead for
 *                         lighter agents. Deep-search and browser agents use
 *                         TokenLimiter to further control context size.
 * - observationalMemory: true — compresses long history into dense observations,
 *                               preventing context window overflow on long sessions.
 * - workingMemory: true — enables a persistent scratchpad per thread for
 *                          entity tracking and mid-conversation state.
 * - threads: true      — enables conversation threading, improving multi-turn
 *                         relevance scoring in Mastra Studio's Review tab.
 * - semanticRecall: false — disabled until an embedding model is configured.
 *                           To enable: set up a vector store + embedding provider
 *                           and change to { enabled: true, topK: 5 }.
 */
import { MongoDBStore } from '@mastra/mongodb';

const hasCloudKey =
  (process.env.GOOGLE_GENERATIVE_AI_API_KEY && process.env.GOOGLE_GENERATIVE_AI_API_KEY !== 'your-google-api-key') ||
  Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_AI_GATEWAY_API_KEY);
const isLocalMode = !hasCloudKey;

export const defaultMemory = new Memory({
  storage: new MongoDBStore({
    id: 'mastra-memory-storage',
    url: process.env.MONGODB_URI!,
    dbName: process.env.MONGODB_DATABASE ?? 'mastra',
  }),
  options: {
    lastMessages: 15,
    // observationalMemory injects system messages mid-conversation which
    // breaks gemma-3-4b's strict role-alternation Jinja template.
    observationalMemory: !isLocalMode,
    // workingMemory injects <working-memory> system blocks after turn 0 —
    // also incompatible with gemma's template in local mode.
    workingMemory: {
      enabled: !isLocalMode,
    },
  },
});
