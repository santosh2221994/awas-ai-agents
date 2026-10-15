import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { codeWorkspace as _codeWorkspace } from '../workspace';
import {
  getRepoBranchesTool,
  getRepoDetailsTool,
  listPullRequestsTool,
  getPrDiffTool,
  postReviewCommentTool,
} from '../tools/github-tool';
import { TokenLimiter } from '../processors';
import { RegexPIIRedactor } from '../processors';
import { UsageTrackerProcessor } from '../processors';
import { defaultMemory } from '../memory';
import { getDefaultModel, lightScorerConfig } from '../providers/model-helpers';
import { defaultTracingPolicy } from '../observability';

const githubRepoInstructions = [
  'You are a senior Git and open-source DevOps specialist and GitHub Repository Auditor.',
  '',
  'Your mission:',
  '1. When a user asks about a repository, fetch its metadata using github-get-repo-details.',
  '2. When a user requests branches or branch status, fetch all branches using github-get-branches.',
  '3. When a user asks about pull requests, fetch PRs using github-list-prs or github-get-pr-diff.',
  '4. Always format your findings with clear, professional markdown tables and concise bullet points.',
  '',
  'Output guidelines:',
  '- **Repository Summary Table**: Owner, Repository Name, Default Branch, Stars, Forks, Open Issues, Primary Language, Topics.',
  '- **Active Branches Table**: Columns: `Branch Name`, `Latest Commit SHA`, `Protected Status`. Highlight the default/production branch.',
  '- **Pull Requests & Code Quality**: Outline open PRs or review status where applicable.',
  '- Provide clear next-step recommendations for repository hygiene, branch protection rules, and merge strategy.',
].join('\n');

export const githubRepoAgent = new Agent({
  id: 'github-repo-agent',
  name: 'GitHub Repository Agent',
  description: 'Audits GitHub repositories, inspects branches, commits, protection rules, and metadata.',

  instructions: async ({ requestContext }) => {
    const userId = requestContext?.get?.('user-id') as string | undefined;
    const attribution = userId
      ? `\n\nAuditor identity: **${userId}**`
      : '';
    return `${githubRepoInstructions}${attribution}`;
  },

  requestContextSchema: z.object({
    'user-id': z.string().optional(),
  }),

  model: ({ requestContext }: any) => getDefaultModel(undefined, requestContext),
  memory: defaultMemory,
  tools: {
    getRepoBranchesTool,
    getRepoDetailsTool,
    listPullRequestsTool,
    getPrDiffTool,
    postReviewCommentTool,
  },
  inputProcessors: [
    new RegexPIIRedactor({ apiKey: true, email: false }),
    new TokenLimiter(100_000),
  ],
  outputProcessors: [
    new UsageTrackerProcessor(),
  ],
  scorers: lightScorerConfig(),
  options: {
    tracingPolicy: defaultTracingPolicy,
  },
});
