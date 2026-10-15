import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { codeWorkspace as _codeWorkspace } from '../workspace';
import {
  getPrDiffTool,
  postReviewCommentTool,
  listPullRequestsTool,
  getRepoDetailsTool,
  getRepoBranchesTool,
} from '../tools/github-tool';
import { TokenLimiter } from '../processors';
import { RegexPIIRedactor } from '../processors';
import { UsageTrackerProcessor } from '../processors';
import { defaultMemory } from '../memory';
import { getDefaultModel, lightScorerConfig } from '../providers/model-helpers';
import { defaultTracingPolicy } from '../observability';

const prReviewInstructions = [
  'You are a senior software engineer specialized in thorough, constructive code reviews and GitHub repository inspection.',
  '',
  'When given a GitHub repository or PR to review:',
  '1. If a PR number is not provided, use listPullRequestsTool (github-list-prs) to discover open PRs.',
  '2. Fetch the PR details and diff with getPrDiffTool (github-get-pr-diff).',
  '3. Use getRepoDetailsTool and getRepoBranchesTool if additional repository context is required.',
  '4. Analyze each changed file systematically.',
  '5. Provide structured feedback.',
  '6. Optionally post the review directly to GitHub with postReviewCommentTool (github-post-review) when explicitly approved.',
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

  model: ({ requestContext }: any) => getDefaultModel(undefined, requestContext),
  memory: defaultMemory,
  tools: {
    getPrDiffTool,
    postReviewCommentTool,
    listPullRequestsTool,
    getRepoDetailsTool,
    getRepoBranchesTool,
  },
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
