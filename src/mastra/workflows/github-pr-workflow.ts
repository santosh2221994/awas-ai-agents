import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { requestContextSchema } from '../context';

const fetchPrDiffStep = createStep({
  id: 'fetch-pr-diff',
  description: 'Fetch the pull request diff and metadata from GitHub',
  inputSchema: z.object({
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
    prNumber: z.number().describe('Pull request number'),
  }),
  outputSchema: z.object({
    owner: z.string(),
    repo: z.string(),
    prNumber: z.number(),
    prDiff: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('githubPrAgent');
    if (!agent) return { ...inputData, prDiff: '' };
    const result = await agent.generate([
      {
        role: 'user',
        content: `Fetch the PR diff for PR #${inputData.prNumber} from ${inputData.owner}/${inputData.repo} using github-get-pr-diff.`,
      },
    ]);
    return { owner: inputData.owner, repo: inputData.repo, prNumber: inputData.prNumber, prDiff: result.text };
  },
});

const reviewCodeStep = createStep({
  id: 'review-code',
  description: 'Analyze the PR diff and produce a structured code review',
  inputSchema: z.object({
    owner: z.string(),
    repo: z.string(),
    prNumber: z.number(),
    prDiff: z.string(),
  }),
  outputSchema: z.object({
    owner: z.string(),
    repo: z.string(),
    prNumber: z.number(),
    review: z.string(),
    verdict: z.enum(['APPROVE', 'REQUEST_CHANGES', 'COMMENT']),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('githubPrAgent');
    if (!agent) return { ...inputData, review: '', verdict: 'COMMENT' as const };
    const result = await agent.generate([
      {
        role: 'user',
        content: `Review this PR diff:\n${inputData.prDiff}\n\nProvide a full structured review covering: Summary, Correctness, Security, Performance, Maintainability, Test Coverage, per-file comments, and a final Verdict (APPROVE | REQUEST_CHANGES | COMMENT).`,
      },
    ]);
    const verdictMatch = result.text.match(/\b(APPROVE|REQUEST_CHANGES|COMMENT)\b/);
    const verdict = (verdictMatch?.[1] ?? 'COMMENT') as 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
    return { owner: inputData.owner, repo: inputData.repo, prNumber: inputData.prNumber, review: result.text, verdict };
  },
});

const postReviewStep = createStep({
  id: 'post-review',
  description: 'Optionally post the review back to GitHub',
  inputSchema: z.object({
    owner: z.string(),
    repo: z.string(),
    prNumber: z.number(),
    review: z.string(),
    verdict: z.enum(['APPROVE', 'REQUEST_CHANGES', 'COMMENT']),
  }),
  outputSchema: z.object({
    prNumber: z.number(),
    review: z.string(),
    verdict: z.enum(['APPROVE', 'REQUEST_CHANGES', 'COMMENT']),
    posted: z.boolean(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('githubPrAgent');
    if (!agent || !process.env.GITHUB_TOKEN) {
      return { prNumber: inputData.prNumber, review: inputData.review, verdict: inputData.verdict, posted: false };
    }
    await agent.generate([
      {
        role: 'user',
        content: `Post this review to PR #${inputData.prNumber} in ${inputData.owner}/${inputData.repo} using github-post-review with event "${inputData.verdict}":\n\n${inputData.review}`,
      },
    ]);
    return { prNumber: inputData.prNumber, review: inputData.review, verdict: inputData.verdict, posted: true };
  },
});

export const githubPrWorkflow = createWorkflow({
  id: 'github-pr-workflow',
  description: 'Fetches a GitHub PR diff, performs a structured code review, and optionally posts feedback to GitHub.',
  requestContextSchema,
  inputSchema: z.object({
    owner: z.string().describe('Repository owner (e.g. "octocat")'),
    repo: z.string().describe('Repository name (e.g. "my-repo")'),
    prNumber: z.number().describe('Pull request number to review'),
  }),
  outputSchema: z.object({
    prNumber: z.number(),
    review: z.string(),
    verdict: z.enum(['APPROVE', 'REQUEST_CHANGES', 'COMMENT']),
    posted: z.boolean(),
  }),
})
  .then(fetchPrDiffStep)
  .then(reviewCodeStep)
  .then(postReviewStep);

githubPrWorkflow.commit();
