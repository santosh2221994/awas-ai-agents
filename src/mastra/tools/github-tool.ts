import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// GitHub Tool — fetch PR diffs and post review comments.
// Set GITHUB_TOKEN in .env for live access. Stub data without it.
// ---------------------------------------------------------------------------

async function githubFetch(path: string, options?: RequestInit): Promise<unknown> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`https://api.github.com${path}`, { ...options, headers: { ...headers, ...(options?.headers ?? {}) }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  return res.json();
}

const DEMO_DIFF = `diff --git a/src/api/users.ts b/src/api/users.ts
index 83d8e2a..f4c9b12 100644
--- a/src/api/users.ts
+++ b/src/api/users.ts
@@ -12,6 +12,18 @@ export async function getUser(id: string) {
   return db.users.findById(id);
 }
 
+export async function updateUser(id: string, data: Partial<User>) {
+  const user = await db.users.findById(id);
+  if (!user) throw new Error('User not found');
+  // TODO: add input validation
+  return db.users.update(id, data);
+}
+
+export async function deleteUser(id: string) {
+  const user = await db.users.findById(id);
+  if (!user) throw new Error('User not found');
+  await db.users.delete(id);
+  return { success: true };
+}
`;

export const getPrDiffTool = createTool({
  id: 'github-get-pr-diff',
  description: 'Fetch a GitHub Pull Request with its diff/changes.',
  inputSchema: z.object({
    owner: z.string().describe('Repository owner (username or org)'),
    repo: z.string().describe('Repository name'),
    prNumber: z.number().describe('Pull Request number'),
  }),
  outputSchema: z.object({
    title: z.string(),
    description: z.string(),
    author: z.string(),
    state: z.string(),
    diff: z.string(),
    filesChanged: z.number(),
    additions: z.number(),
    deletions: z.number(),
  }),
  execute: async (inputData) => {
    if (!process.env.GITHUB_TOKEN) {
      return {
        title: `[Demo] Add user update and delete endpoints (PR #${inputData.prNumber})`,
        description: 'Added updateUser and deleteUser functions. No input validation yet.',
        author: 'dev-contributor',
        state: 'open',
        diff: DEMO_DIFF,
        filesChanged: 1,
        additions: 12,
        deletions: 0,
      };
    }
    const pr = await githubFetch(`/repos/${inputData.owner}/${inputData.repo}/pulls/${inputData.prNumber}`) as {
      title: string; body?: string; user: { login: string }; state: string;
      changed_files: number; additions: number; deletions: number;
    };
    const diffRes = await fetch(`https://api.github.com/repos/${inputData.owner}/${inputData.repo}/pulls/${inputData.prNumber}`, {
      headers: { Accept: 'application/vnd.github.v3.diff', Authorization: `Bearer ${process.env.GITHUB_TOKEN}` },
    });
    const diff = await diffRes.text();
    return {
      title: pr.title,
      description: pr.body ?? '',
      author: pr.user.login,
      state: pr.state,
      diff: diff.slice(0, 20000),
      filesChanged: pr.changed_files,
      additions: pr.additions,
      deletions: pr.deletions,
    };
  },
});

export const postReviewCommentTool = createTool({
  id: 'github-post-review',
  description: 'Post a code review comment on a GitHub Pull Request.',
  inputSchema: z.object({
    owner: z.string(),
    repo: z.string(),
    prNumber: z.number(),
    body: z.string().describe('The review comment text (markdown supported)'),
    event: z.enum(['COMMENT', 'APPROVE', 'REQUEST_CHANGES']).default('COMMENT'),
  }),
  outputSchema: z.object({ success: z.boolean(), reviewId: z.number().optional(), note: z.string().optional() }),
  execute: async (inputData) => {
    if (!process.env.GITHUB_TOKEN) {
      return { success: true, note: '(stub) Set GITHUB_TOKEN to post real reviews.' };
    }
    const data = await githubFetch(`/repos/${inputData.owner}/${inputData.repo}/pulls/${inputData.prNumber}/reviews`, {
      method: 'POST',
      body: JSON.stringify({ body: inputData.body, event: inputData.event }),
    }) as { id: number };
    return { success: true, reviewId: data.id };
  },
});
