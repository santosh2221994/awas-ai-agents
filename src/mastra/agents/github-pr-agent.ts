import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { codeWorkspace as _codeWorkspace } from '../workspace';
import { getPrDiffTool, postReviewCommentTool } from '../tools/github-tool';
import { lmStudioModel } from '../providers/lm-studio';
import { TokenLimiter } from '../processors';
import { RegexPIIRedactor } from '../processors';
import { UsageTrackerProcessor } from '../processors';
import { defaultMemory } from '../memory';
import { lightScorerConfig } from '../providers/model-helpers';

const prReviewInstructions = [
  'You are a senior software engineer specialized in thorough, constructive code reviews.',
  '',
  'When given a GitHub PR to review:',
  '1. Fetch the PR details and diff with github-get-pr-diff',
  '2. Analyze each changed file systematically',
  '3. Provide structured feedback',
  '4. Optionally post the review directly to GitHub with github-post-review',
  '',
  'Review framework:',
  '**Summary** — What does this PR do? Overall assessment?',
  '**Correctness** — Does the code do what it claims? Edge cases handled?',
  '**Security** — Any injection risks, auth bypasses, or data exposure?',
  '**Performance** — Any N+1 queries, unnecessary loops, memory leaks?',
  '**Maintainability** — Is it readable? Well-named? Properly documented?',
  '**Test Coverage** — Are there tests? Do they cover edge cases?',
  '',
  'Specific Comments (per file):',
  '  - Filename: [filename]',
  '  - Line [N]: [issue description and suggested fix]',
  '',
  '**Verdict**: APPROVE | REQUEST_CHANGES | COMMENT',
  '',
  'To review a PR, say: "Review PR #123 from owner/repo"',
  'Set GITHUB_TOKEN in .env to post reviews directly to GitHub.',
].join('\n');

export const githubPrAgent = new Agent({
  id: 'GitHub PR Code Review Agent',
  name: 'GitHub PR Code Review Agent',
  description: 'Reviews GitHub pull requests: fetches diffs, analyzes code quality, security, performance, and posts structured feedback directly to GitHub.',
  workspace: undefined, // uses globalWorkspace from Mastra instance

  // ── Dynamic instructions — injects reviewer identity for attribution ────────
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

  model: () => {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key || key === 'your-google-api-key') {
      return lmStudioModel();
    }
    return 'google/gemini-2.0-flash';
  },
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
});
