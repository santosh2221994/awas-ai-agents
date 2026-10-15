import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// GitHub Tool — fetch PR diffs and post review comments.
// Set GITHUB_TOKEN in .env for live access. Stub data without it.
// ---------------------------------------------------------------------------

import { withRetry } from './tool-helper';

async function githubFetch(path: string, options?: RequestInit): Promise<unknown> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  return withRetry(async () => {
    const res = await fetch(`https://api.github.com${path}`, {
      ...options,
      headers: { ...headers, ...(options?.headers ?? {}) },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const err: any = new Error(`GitHub API error: ${res.status} ${res.statusText}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }, { maxRetries: 2, initialDelayMs: 600 });
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

export const getRepoBranchesTool = createTool({
  id: 'github-get-branches',
  description: 'Fetch all branches of a GitHub repository with commit SHAs and protection status.',
  inputSchema: z.object({
    owner: z.string().describe('Repository owner or organization name'),
    repo: z.string().describe('Repository name'),
  }),
  outputSchema: z.object({
    owner: z.string(),
    repo: z.string(),
    defaultBranch: z.string(),
    total: z.number(),
    branches: z.array(
      z.object({
        name: z.string(),
        commitSha: z.string(),
        isProtected: z.boolean(),
      })
    ),
    isLive: z.boolean(),
  }),
  execute: async (inputData) => {
    const { owner, repo } = inputData;
    try {
      const branchesData = (await githubFetch(`/repos/${owner}/${repo}/branches?per_page=30`)) as any[];
      if (Array.isArray(branchesData) && branchesData.length > 0) {
        const branches = branchesData.map((b: any) => ({
          name: b.name,
          commitSha: (b.commit?.sha || '').slice(0, 7),
          isProtected: Boolean(b.protected),
        }));
        return {
          owner,
          repo,
          defaultBranch: branches.find((b) => b.name === 'main' || b.name === 'master')?.name || branches[0].name,
          total: branches.length,
          branches,
          isLive: true,
        };
      }
    } catch (err: any) {
      console.warn(`[getRepoBranchesTool] Live fetch note for ${owner}/${repo}:`, err?.message);
    }

    // Graceful fallback for demo/offline repositories or rate limits
    const demoBranches = [
      { name: 'main', commitSha: '7a1e8bc', isProtected: true },
      { name: 'develop', commitSha: 'c43f210', isProtected: false },
      { name: 'feature/agent-builder-tools', commitSha: '8df90a1', isProtected: false },
      { name: 'feature/github-integration', commitSha: '9b2c3d4', isProtected: false },
      { name: 'release/v1.2.0', commitSha: '1e5f6a7', isProtected: true },
    ];
    return {
      owner,
      repo,
      defaultBranch: 'main',
      total: demoBranches.length,
      branches: demoBranches,
      isLive: false,
    };
  },
});

export const getRepoDetailsTool = createTool({
  id: 'github-get-repo-details',
  description: 'Fetch GitHub repository metadata including stars, forks, open issues, default branch, language, and topics.',
  inputSchema: z.object({
    owner: z.string().describe('Repository owner or organization name'),
    repo: z.string().describe('Repository name'),
  }),
  outputSchema: z.object({
    owner: z.string(),
    repo: z.string(),
    fullName: z.string(),
    description: z.string(),
    defaultBranch: z.string(),
    stars: z.number(),
    forks: z.number(),
    openIssuesCount: z.number(),
    language: z.string(),
    topics: z.array(z.string()),
    visibility: z.string(),
    htmlUrl: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    isLive: z.boolean(),
  }),
  execute: async (inputData) => {
    const { owner, repo } = inputData;
    try {
      const data = (await githubFetch(`/repos/${owner}/${repo}`)) as any;
      if (data && data.name) {
        return {
          owner,
          repo,
          fullName: data.full_name || `${owner}/${repo}`,
          description: data.description || 'No description provided.',
          defaultBranch: data.default_branch || 'main',
          stars: data.stargazers_count ?? 0,
          forks: data.forks_count ?? 0,
          openIssuesCount: data.open_issues_count ?? 0,
          language: data.language || 'TypeScript',
          topics: Array.isArray(data.topics) ? data.topics : [],
          visibility: data.visibility || (data.private ? 'private' : 'public'),
          htmlUrl: data.html_url || `https://github.com/${owner}/${repo}`,
          createdAt: data.created_at || new Date().toISOString(),
          updatedAt: data.updated_at || new Date().toISOString(),
          isLive: true,
        };
      }
    } catch (err: any) {
      console.warn(`[getRepoDetailsTool] Live fetch note for ${owner}/${repo}:`, err?.message);
    }

    // Graceful fallback for demo/offline repositories or rate limits
    return {
      owner,
      repo,
      fullName: `${owner}/${repo}`,
      description: 'Agentic Workplace Automation System (AWAS) repository and runtime engine.',
      defaultBranch: 'main',
      stars: 142,
      forks: 38,
      openIssuesCount: 4,
      language: 'TypeScript',
      topics: ['ai-agents', 'automation', 'llm-orchestration', 'react', 'nestjs'],
      visibility: 'public',
      htmlUrl: `https://github.com/${owner}/${repo}`,
      createdAt: '2026-01-15T08:00:00Z',
      updatedAt: new Date().toISOString(),
      isLive: false,
    };
  },
});

export const listPullRequestsTool = createTool({
  id: 'github-list-prs',
  description: 'List pull requests for a GitHub repository by state (open, closed, all).',
  inputSchema: z.object({
    owner: z.string().describe('Repository owner or organization name'),
    repo: z.string().describe('Repository name'),
    state: z.enum(['open', 'closed', 'all']).default('open').describe('Pull request state filter'),
  }),
  outputSchema: z.object({
    owner: z.string(),
    repo: z.string(),
    total: z.number(),
    pullRequests: z.array(
      z.object({
        number: z.number(),
        title: z.string(),
        author: z.string(),
        state: z.string(),
        createdAt: z.string(),
        htmlUrl: z.string(),
      })
    ),
    isLive: z.boolean(),
  }),
  execute: async (inputData) => {
    const { owner, repo, state = 'open' } = inputData;
    try {
      const data = (await githubFetch(`/repos/${owner}/${repo}/pulls?state=${state}&per_page=20`)) as any[];
      if (Array.isArray(data)) {
        const pullRequests = data.map((pr: any) => ({
          number: pr.number,
          title: pr.title,
          author: pr.user?.login || 'contributor',
          state: pr.state,
          createdAt: pr.created_at,
          htmlUrl: pr.html_url || `https://github.com/${owner}/${repo}/pull/${pr.number}`,
        }));
        return {
          owner,
          repo,
          total: pullRequests.length,
          pullRequests,
          isLive: true,
        };
      }
    } catch (err: any) {
      console.warn(`[listPullRequestsTool] Live fetch note for ${owner}/${repo}:`, err?.message);
    }

    const demoPRs = [
      {
        number: 1,
        title: 'Add user update and delete endpoints',
        author: 'dev-contributor',
        state: 'open',
        createdAt: '2026-10-09T14:22:10Z',
        htmlUrl: `https://github.com/${owner}/${repo}/pull/1`,
      },
      {
        number: 2,
        title: 'Implement dynamic agent tool registry',
        author: 'lead-architect',
        state: 'open',
        createdAt: '2026-10-10T10:15:30Z',
        htmlUrl: `https://github.com/${owner}/${repo}/pull/2`,
      },
    ];
    return {
      owner,
      repo,
      total: demoPRs.length,
      pullRequests: demoPRs,
      isLive: false,
    };
  },
});

export const listUserReposTool = createTool({
  id: 'github-list-repos',
  description: 'List public or accessible repositories for an authenticated user or organization.',
  inputSchema: z.object({
    owner: z.string().optional().describe('GitHub username or organization name'),
    type: z.enum(['all', 'owner', 'public', 'private']).optional().default('all'),
    sort: z.enum(['created', 'updated', 'pushed', 'full_name']).optional().default('updated'),
  }),
  outputSchema: z.object({
    total: z.number(),
    repositories: z.array(
      z.object({
        name: z.string(),
        fullName: z.string(),
        description: z.string().nullable(),
        htmlUrl: z.string(),
        stars: z.number(),
        forks: z.number(),
        language: z.string().nullable(),
        isPrivate: z.boolean(),
      })
    ),
    isLive: z.boolean(),
  }),
  execute: async (inputData) => {
    const { owner } = inputData;
    const path = owner ? `/users/${owner}/repos?sort=updated&per_page=15` : `/user/repos?sort=updated&per_page=15`;
    try {
      const data = (await githubFetch(path)) as any[];
      if (Array.isArray(data)) {
        const repositories = data.map((r: any) => ({
          name: r.name,
          fullName: r.full_name,
          description: r.description || null,
          htmlUrl: r.html_url,
          stars: r.stargazers_count ?? 0,
          forks: r.forks_count ?? 0,
          language: r.language || null,
          isPrivate: Boolean(r.private),
        }));
        return {
          total: repositories.length,
          repositories,
          isLive: true,
        };
      }
    } catch (err: any) {
      console.warn(`[listUserReposTool] Live fetch note:`, err?.message);
    }
    const demoRepos = [
      { name: 'AWAS', fullName: 'santoshkumar/AWAS', description: 'Agentic Workplace Automation System', htmlUrl: 'https://github.com/santoshkumar/AWAS', stars: 24, forks: 6, language: 'TypeScript', isPrivate: false },
      { name: 'agent-core', fullName: 'santoshkumar/agent-core', description: 'Autonomous agent runtime engine', htmlUrl: 'https://github.com/santoshkumar/agent-core', stars: 12, forks: 2, language: 'TypeScript', isPrivate: false },
    ];
    return {
      total: demoRepos.length,
      repositories: demoRepos,
      isLive: false,
    };
  },
});


