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
import { PostgresStore } from '@mastra/pg';

export const defaultMemory = new Memory({
  storage: new PostgresStore({
    id: 'mastra-memory-storage',
    connectionString: process.env.DATABASE_URL!,
  }),
  options: {
    lastMessages: 15,
    observationalMemory: true,
    workingMemory: {
      enabled: true,
    },
  },
});
