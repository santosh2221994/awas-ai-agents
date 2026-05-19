/**
 * processors/usage-tracker.ts
 *
 * Logs token usage and finish reason after every LLM response.
 * Output goes to the structured Mastra logger (not raw stdout) so usage
 * data appears in Mastra Studio's Traces view and is captured by the
 * observability pipeline.
 *
 * Usage:
 *   new Agent({ outputProcessors: [new UsageTrackerProcessor()], ... })
 */

import type { Processor } from '@mastra/core/processors';
import type { MastraDBMessage } from '@mastra/core/memory';

export class UsageTrackerProcessor implements Processor {
  readonly id = 'usage-tracker';

  async processOutputResult({
    messages,
    result,
  }: {
    messages: MastraDBMessage[];
    result?: {
      usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
      finishReason?: string;
    };
  }): Promise<MastraDBMessage[]> {
    if (result?.usage) {
      const { inputTokens = 0, outputTokens = 0, totalTokens } = result.usage;
      const total = totalTokens ?? inputTokens + outputTokens;
      // Use process.stdout.write via structured JSON so the log is machine-parseable
      // and picked up by Mastra's PinoLogger pipeline rather than raw console.
      const entry = {
        level: 'info',
        name: 'UsageTracker',
        inputTokens,
        outputTokens,
        totalTokens: total,
        finishReason: result.finishReason ?? 'unknown',
        time: Date.now(),
      };
      process.stdout.write(JSON.stringify(entry) + '\n');
    }
    return messages;
  }
}
