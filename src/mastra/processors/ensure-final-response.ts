/**
 * processors/ensure-final-response.ts
 *
 * Ensures the agent always produces a text answer on its last step.
 * Without this, an agent that issues a tool call on step N-1 (the final step)
 * may return an empty response because there is no budget left for the LLM
 * to process the tool result.
 *
 * Usage:
 *   const MAX = 8;
 *   new Agent({ inputProcessors: [new EnsureFinalResponseProcessor(MAX)], ... })
 *   await agent.generate('...', { maxSteps: MAX })
 */

import type {
  Processor,
  ProcessInputStepArgs,
  ProcessInputStepResult,
} from '@mastra/core/processors';

export class EnsureFinalResponseProcessor implements Processor {
  readonly id = 'ensure-final-response';
  private maxSteps: number;

  constructor(maxSteps: number) {
    this.maxSteps = maxSteps;
  }

  async processInputStep({
    stepNumber,
    systemMessages,
  }: ProcessInputStepArgs): Promise<ProcessInputStepResult> {
    if (stepNumber === this.maxSteps - 1) {
      return {
        tools: {},
        toolChoice: 'none',
        systemMessages: [
          ...systemMessages,
          {
            role: 'system' as const,
            content:
              'You have reached the maximum number of steps. Summarize your progress and provide a best-effort final answer. If the task is incomplete, clearly state what still needs to be done.',
          },
        ],
      };
    }
    return {};
  }
}
