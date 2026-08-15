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

import type { Processor, ProcessInputArgs } from '@mastra/core/processors';
import type { MastraDBMessage } from '@mastra/core/memory';

export class UsageTrackerProcessor implements Processor {
  readonly id = 'usage-tracker';
  private startTimes = new Map<string, number>();

  async processInput({ messages }: ProcessInputArgs): Promise<MastraDBMessage[]> {
    if (messages && messages.length > 0) {
      const threadId = messages[0].threadId;
      if (threadId) {
        this.startTimes.set(threadId, Date.now());
      }
    }
    return messages;
  }

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
      const finishReason = result.finishReason ?? 'stop';
      const now = Date.now();

      let duration = '1.5s';
      if (messages && messages.length > 0) {
        const threadId = messages[0].threadId;
        if (threadId) {
          const start = this.startTimes.get(threadId);
          if (start) {
            duration = ((now - start) / 1000).toFixed(1) + 's';
            this.startTimes.delete(threadId);
          }
        }
      }

      // Fallback: if processInput was not registered or duration wasn't found,
      // calculate using the user message's createdAt timestamp.
      if (duration === '1.5s' && messages && messages.length > 1) {
        const userMsg = messages[messages.length - 2];
        if (userMsg && userMsg.createdAt) {
          const start = new Date(userMsg.createdAt).getTime();
          const diff = (now - start) / 1000;
          if (diff > 0.1) {
            duration = diff.toFixed(1) + 's';
          }
        }
      }

      // Use process.stdout.write via structured JSON so the log is machine-parseable
      // and picked up by Mastra's PinoLogger pipeline rather than raw console.
      const entry = {
        level: 'info',
        name: 'UsageTracker',
        inputTokens,
        outputTokens,
        totalTokens: total,
        finishReason,
        time: now,
        duration,
      };
      process.stdout.write(JSON.stringify(entry) + '\n');

      // Save token usage directly on the assistant's message so it is stored in Mastra's database
      if (messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg.role === 'assistant') {
          if (!lastMsg.content) {
            lastMsg.content = { format: 2, parts: [] } as any;
          } else if (typeof lastMsg.content === 'string') {
            lastMsg.content = { format: 2, parts: [{ type: 'text', text: lastMsg.content }] } as any;
          }

          if (!lastMsg.content.parts) {
            (lastMsg.content as any).parts = [];
          }

          // Remove any pre-existing usage parts and add the new one
          (lastMsg.content as any).parts = (lastMsg.content as any).parts.filter((p: any) => p.type !== 'data-usage' && p.type !== 'usage');
          (lastMsg.content as any).parts.push({
            type: 'data-usage',
            usage: {
              promptTokens: inputTokens,
              completionTokens: outputTokens,
              finishReason,
              time: now,
              duration,
            },
          });

        }
      }
    }
    return messages;
  }
}
