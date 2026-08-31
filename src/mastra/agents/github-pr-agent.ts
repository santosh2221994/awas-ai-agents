import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { codeWorkspace as _codeWorkspace } from '../workspace';
import { getPrDiffTool, postReviewCommentTool } from '../tools/github-tool';
import { TokenLimiter } from '../processors';
import { RegexPIIRedactor } from '../processors';
import { UsageTrackerProcessor } from '../processors';
import { defaultMemory } from '../memory';
import { getDefaultModel, lightScorerConfig } from '../providers/model-helpers';
import { defaultTracingPolicy } from '../observability';

const prReviewInstructions = [
  'You are a senior software engineer specialized in thorough, constructive code reviews.',
  '',
  'When given a GitHub PR to review:',
  '1. Fetch the PR details and diff with github-get-pr-diff',
  '2. Analyze each changed file systematically',
  '3. Provide structured feedback',
  '4. Optionally post the review directly to GitHub with github-post-review',
  '   (only when explicit approval is given).',
  '',
  'Structure your review as follows:',
  '## Summary',
  'Brief description of what this PR does and overall impression.',
  '',
  '## Critical Issues (Must Fix)',
  '- Bugs, edge cases, potential runtime exceptions',
  '- Security vulnerabilities (injection, auth, data leakage)',
  '- Performance regressions (N+1 queries, unindexed lookups)',
  '',
  '## Suggestions (Nice to Have)',
  '- Code readability, naming, structure improvements',
  '- Missing tests or edge cases to cover',
  '- TypeScript type improvements',
  '',
  '## Questions / Clarifications',
  '- Anything unclear about the design choices',
  '',
  'Always cite specific file paths and line numbers in your review.',
].join('\n');

export const githubPrAgent = new Agent({
  id: 'github-pr-agent',
  name: 'GitHub PR Review Agent',
  description: 'Reviews pull requests, identifies bugs, security issues, and suggests improvements.',

  // ── Dynamic instructions — injects reviewer name ───────────────────────────
  instructions: async ({ requestContext }) => {
    const userId = requestContext?.get?.('user-id') as string | undefined;
    const attribution = userId
      ? `\n\nReviewer identity: **${userId}** — sign all review comments with this name.`
      : '';
    return `${prReviewInstructions}${attribution}`;
  },

  // ── Context schema ───────────────────────────────────────────────────────
  requestContextSchema: z.object({
    'user-id': z.string().optional(),
  }),

  model: () => getDefaultModel(),
  memory: defaultMemory,
  tools: { getPrDiffTool, postReviewCommentTool },
  inputProcessors: [
    // Redact any secrets/API keys that appear in the code diff before sending to LLM
    new RegexPIIRedactor({ apiKey: true, email: false }),
    // Keep prompt within context window (PRs with large diffs can be huge)
    new TokenLimiter(100_000),
  ],
  outputProcessors: [
    new UsageTrackerProcessor(),
  ],
  // ── Evals — powers Evaluate + Review tabs in Mastra Studio ───────────────
  scorers: lightScorerConfig(),
  options: {
    tracingPolicy: defaultTracingPolicy,
  },
});
