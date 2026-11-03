/**
 * tools/governed-tools.ts
 *
 * Deterministic, narrowly scoped, permission-aware, and approval-gated tools
 * across all 10 required tool groups (Files, Web/Research, Communication,
 * Calendar, Tasks/Projects, CRM, Production, Data, Knowledge, Approvals,
 * Finance, and Campaigns).
 */

import { z } from 'zod';
import { createGovernedTool } from './tool-helper';
import {
  KnowledgeBaseService,
  sanitizeUntrustedContent,
} from '../memory/knowledge-service';
import {
  createApprovalRequest,
  getApprovalRecord,
  recordApprovalDecision,
} from '../services/approval-service';

// In-memory deterministic workspace stores for sandbox/local tool execution
const MAX_WORKSPACE_STORES = 2000;
const workspaceFilesStore = new Map<string, Map<string, { content: string; updatedAt: string }>>();
const workspaceCalendarStore = new Map<string, Array<{ id: string; title: string; start: string; end: string; attendees: string[] }>>();
const workspaceTasksStore = new Map<string, Array<{ id: string; title: string; status: string; priority: string; owner?: string; projectId?: string }>>();
const workspaceCrmStore = new Map<string, Array<{ id: string; accountName: string; stage: string; healthScore: number; contacts: string[]; notes: string[] }>>();
const workspaceProductionStore = new Map<string, Record<string, any>>();

function getBucket<T>(store: Map<string, T>, workspaceId: string, factory: () => T): T {
  if (!store.has(workspaceId)) {
    if (store.size >= MAX_WORKSPACE_STORES) {
      const oldestKey = store.keys().next().value;
      if (oldestKey !== undefined) store.delete(oldestKey);
    }
    store.set(workspaceId, factory());
  }
  return store.get(workspaceId)!;
}

// ── 1. Files Tool Group ──────────────────────────────────────────────────────

export const filesReadTool = createGovernedTool({
  id: 'files.read',
  description: 'Read an authorized file from the current workspace with provenance and prompt-injection sanitization.',
  requiredScopes: ['files:read'],
  actionClassification: 'read-only',
  inputSchema: z.object({
    path: z.string().min(1),
  }),
  outputSchema: z.object({
    path: z.string(),
    content: z.string(),
    sourceRef: z.string(),
    injectionWarning: z.boolean(),
  }),
  execute: async (input, ctx) => {
    const files = getBucket(workspaceFilesStore, ctx.workspaceId, () => new Map());
    const entry = files.get(input.path);
    const rawContent = entry?.content ?? `Authorized file content for ${input.path}`;
    const sourceRef = `file://${ctx.workspaceId}/${input.path}`;
    const sanitized = sanitizeUntrustedContent(rawContent, sourceRef);
    return {
      path: input.path,
      content: sanitized.sanitizedText,
      sourceRef,
      injectionWarning: sanitized.injectionDetected,
    };
  },
});

export const filesListTool = createGovernedTool({
  id: 'files.list',
  description: 'List permitted files in the current workspace.',
  requiredScopes: ['files:read'],
  actionClassification: 'read-only',
  inputSchema: z.object({
    prefix: z.string().optional(),
  }),
  outputSchema: z.object({
    files: z.array(z.string()),
    workspaceId: z.string(),
  }),
  execute: async (input, ctx) => {
    const files = getBucket(workspaceFilesStore, ctx.workspaceId, () => new Map());
    const keys = Array.from(files.keys()).filter((k) => !input.prefix || k.startsWith(input.prefix));
    return {
      files: keys,
      workspaceId: ctx.workspaceId,
    };
  },
});

export const filesCreateDraftTool = createGovernedTool({
  id: 'files.create-draft',
  description: 'Create or update a draft artifact file in the current workspace.',
  requiredScopes: ['files:write'],
  actionClassification: 'reversible',
  idempotentWrite: true,
  inputSchema: z.object({
    path: z.string().min(1),
    content: z.string(),
  }),
  outputSchema: z.object({
    path: z.string(),
    saved: z.boolean(),
    sourceRef: z.string(),
    updatedAt: z.string(),
  }),
  execute: async (input, ctx) => {
    const files = getBucket(workspaceFilesStore, ctx.workspaceId, () => new Map());
    const updatedAt = new Date().toISOString();
    files.set(input.path, { content: input.content, updatedAt });
    return {
      path: input.path,
      saved: true,
      sourceRef: `file://${ctx.workspaceId}/${input.path}`,
      updatedAt,
    };
  },
});

export const filesDeleteTool = createGovernedTool({
  id: 'files.delete',
  description: 'Delete a file in the current workspace (consequential action, requires approval).',
  requiredScopes: ['files:write'],
  actionClassification: 'consequential',
  idempotentWrite: true,
  inputSchema: z.object({
    path: z.string().min(1),
  }),
  outputSchema: z.object({
    path: z.string(),
    deleted: z.boolean(),
  }),
  execute: async (input, ctx) => {
    const files = getBucket(workspaceFilesStore, ctx.workspaceId, () => new Map());
    const deleted = files.delete(input.path);
    return { path: input.path, deleted };
  },
});

// ── 2. Web / Research Tool Group ─────────────────────────────────────────────

export const webSearchGovernedTool = createGovernedTool({
  id: 'web.search',
  description: 'Search external web sources and return sanitized excerpts with source references.',
  requiredScopes: ['knowledge:search'],
  actionClassification: 'read-only',
  inputSchema: z.object({
    query: z.string().min(1),
    maxResults: z.number().int().positive().max(10).optional(),
  }),
  outputSchema: z.object({
    query: z.string(),
    results: z.array(
      z.object({
        title: z.string(),
        url: z.string(),
        snippet: z.string(),
        sourceRef: z.string(),
        injectionWarning: z.boolean(),
      })
    ),
  }),
  execute: async (input) => {
    const url = `https://research.awas.internal/search?q=${encodeURIComponent(input.query)}`;
    const sanitized = sanitizeUntrustedContent(
      `Verified industry research findings for "${input.query}".`,
      url
    );
    return {
      query: input.query,
      results: [
        {
          title: `Research Brief: ${input.query}`,
          url,
          snippet: sanitized.sanitizedText,
          sourceRef: url,
          injectionWarning: sanitized.injectionDetected,
        },
      ],
    };
  },
});

// ── 3. Communication Tool Group ──────────────────────────────────────────────

export const emailSearchTool = createGovernedTool({
  id: 'email.search',
  description: 'Search authorized inbox messages within the user workspace.',
  requiredScopes: ['email:read'],
  actionClassification: 'read-only',
  inputSchema: z.object({
    query: z.string().optional(),
    limit: z.number().int().positive().max(25).optional(),
  }),
  outputSchema: z.object({
    messages: z.array(
      z.object({
        id: z.string(),
        from: z.string(),
        subject: z.string(),
        snippet: z.string(),
        receivedAt: z.string(),
      })
    ),
  }),
  execute: async (input) => {
    return {
      messages: [
        {
          id: 'msg_01',
          from: 'producer@studio.example',
          subject: input.query ? `Re: ${input.query}` : 'Project Schedule Update',
          snippet: 'Please review the updated shooting schedule and confirm call times.',
          receivedAt: new Date().toISOString(),
        },
      ],
    };
  },
});

export const emailDraftTool = createGovernedTool({
  id: 'email.draft',
  description: 'Create a non-sent email draft for user review.',
  requiredScopes: ['email:draft'],
  actionClassification: 'reversible',
  idempotentWrite: true,
  inputSchema: z.object({
    to: z.string().min(1),
    subject: z.string().min(1),
    body: z.string().min(1),
  }),
  outputSchema: z.object({
    draftId: z.string(),
    to: z.string(),
    subject: z.string(),
    status: z.literal('draft_saved'),
  }),
  execute: async (input) => {
    return {
      draftId: `drf_${Buffer.from(`${input.to}:${input.subject}`).toString('hex').slice(0, 10)}`,
      to: input.to,
      subject: input.subject,
      status: 'draft_saved' as const,
    };
  },
});

export const emailSendTool = createGovernedTool({
  id: 'email.send',
  description: 'Send an external email message (consequential action, requires explicit human approval).',
  requiredScopes: ['email:send'],
  actionClassification: 'consequential',
  idempotentWrite: true,
  inputSchema: z.object({
    to: z.string().min(1),
    subject: z.string().min(1),
    body: z.string().min(1),
  }),
  outputSchema: z.object({
    messageId: z.string(),
    to: z.string(),
    status: z.literal('sent'),
    sentAt: z.string(),
  }),
  execute: async (input) => {
    return {
      messageId: `sent_${Date.now()}`,
      to: input.to,
      status: 'sent' as const,
      sentAt: new Date().toISOString(),
    };
  },
});

// ── 4. Calendar Tool Group ───────────────────────────────────────────────────

export const calendarListEventsTool = createGovernedTool({
  id: 'calendar.list-events',
  description: 'List calendar events and check availability in the workspace.',
  requiredScopes: ['calendar:read'],
  actionClassification: 'read-only',
  inputSchema: z.object({
    date: z.string().optional(),
  }),
  outputSchema: z.object({
    events: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        start: z.string(),
        end: z.string(),
        attendees: z.array(z.string()),
      })
    ),
  }),
  execute: async (_input, ctx) => {
    const events = getBucket(workspaceCalendarStore, ctx.workspaceId, () => [
      {
        id: 'evt_default_1',
        title: 'Executive Production Sync',
        start: '09:00',
        end: '10:00',
        attendees: ['producer@workspace.local', 'director@workspace.local'],
      },
    ]);
    return { events };
  },
});

export const calendarCreateEventTool = createGovernedTool({
  id: 'calendar.create-event',
  description: 'Create or schedule an external calendar event (consequential action, approval-gated).',
  requiredScopes: ['calendar:write'],
  actionClassification: 'consequential',
  idempotentWrite: true,
  inputSchema: z.object({
    title: z.string().min(1),
    start: z.string().min(1),
    end: z.string().min(1),
    attendees: z.array(z.string()).default([]),
  }),
  outputSchema: z.object({
    eventId: z.string(),
    title: z.string(),
    status: z.literal('scheduled'),
  }),
  execute: async (input, ctx) => {
    const events = getBucket(workspaceCalendarStore, ctx.workspaceId, () => []);
    const eventId = `evt_${events.length + 1}`;
    events.push({
      id: eventId,
      title: input.title,
      start: input.start,
      end: input.end,
      attendees: input.attendees,
    });
    return { eventId, title: input.title, status: 'scheduled' as const };
  },
});

// ── 5. Tasks & Projects Tool Group ───────────────────────────────────────────

export const tasksListTool = createGovernedTool({
  id: 'tasks.list',
  description: 'List project tasks and milestones in the current workspace.',
  requiredScopes: ['tasks:read'],
  actionClassification: 'read-only',
  inputSchema: z.object({
    projectId: z.string().optional(),
    status: z.string().optional(),
  }),
  outputSchema: z.object({
    tasks: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        status: z.string(),
        priority: z.string(),
        owner: z.string().optional(),
        projectId: z.string().optional(),
      })
    ),
  }),
  execute: async (input, ctx) => {
    const tasks = getBucket(workspaceTasksStore, ctx.workspaceId, () => [
      {
        id: 'tsk_1',
        title: 'Finalize Q4 Production Milestones',
        status: 'in_progress',
        priority: 'high',
        owner: ctx.userId,
        projectId: input.projectId ?? 'proj_default',
      },
    ]);
    return {
      tasks: tasks.filter(
        (t) =>
          (!input.projectId || t.projectId === input.projectId) &&
          (!input.status || t.status === input.status)
      ),
    };
  },
});

export const tasksCreateTool = createGovernedTool({
  id: 'tasks.create',
  description: 'Create a project task in the workspace.',
  requiredScopes: ['tasks:write'],
  actionClassification: 'reversible',
  idempotentWrite: true,
  inputSchema: z.object({
    title: z.string().min(1),
    priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    owner: z.string().optional(),
    projectId: z.string().optional(),
  }),
  outputSchema: z.object({
    taskId: z.string(),
    title: z.string(),
    status: z.literal('open'),
    priority: z.string(),
  }),
  execute: async (input, ctx) => {
    const tasks = getBucket(workspaceTasksStore, ctx.workspaceId, () => []);
    const taskId = `tsk_${tasks.length + 1}`;
    tasks.push({
      id: taskId,
      title: input.title,
      status: 'open',
      priority: input.priority,
      owner: input.owner ?? ctx.userId,
      projectId: input.projectId,
    });
    return {
      taskId,
      title: input.title,
      status: 'open' as const,
      priority: input.priority,
    };
  },
});

export const tasksUpdateStatusTool = createGovernedTool({
  id: 'tasks.update-status',
  description: 'Update the status of an existing task.',
  requiredScopes: ['tasks:write'],
  actionClassification: 'reversible',
  idempotentWrite: true,
  inputSchema: z.object({
    taskId: z.string().min(1),
    status: z.enum(['open', 'in_progress', 'blocked', 'completed']),
  }),
  outputSchema: z.object({
    taskId: z.string(),
    status: z.string(),
    updated: z.boolean(),
  }),
  execute: async (input, ctx) => {
    const tasks = getBucket(workspaceTasksStore, ctx.workspaceId, () => []);
    const found = tasks.find((t) => t.id === input.taskId);
    if (found) {
      found.status = input.status;
    }
    return {
      taskId: input.taskId,
      status: input.status,
      updated: Boolean(found),
    };
  },
});

// ── 6. CRM Tool Group ────────────────────────────────────────────────────────

export const crmSearchAccountTool = createGovernedTool({
  id: 'crm.search-account',
  description: 'Search CRM accounts and retrieve customer history within the workspace.',
  requiredScopes: ['crm:read'],
  actionClassification: 'read-only',
  inputSchema: z.object({
    accountQuery: z.string().min(1),
  }),
  outputSchema: z.object({
    accounts: z.array(
      z.object({
        id: z.string(),
        accountName: z.string(),
        stage: z.string(),
        healthScore: z.number(),
        contacts: z.array(z.string()),
        notes: z.array(z.string()),
        sourceRef: z.string(),
      })
    ),
  }),
  execute: async (input, ctx) => {
    const accounts = getBucket(workspaceCrmStore, ctx.workspaceId, () => [
      {
        id: 'acc_01',
        accountName: input.accountQuery,
        stage: 'Active Enterprise',
        healthScore: 86,
        contacts: ['vp-ops@client.example'],
        notes: ['Renewed annual subscription; requested Q3 SLA review.'],
      },
    ]);
    return {
      accounts: accounts.map((a) => ({
        ...a,
        sourceRef: `crm://${ctx.workspaceId}/accounts/${a.id}`,
      })),
    };
  },
});

export const crmWriteUpdateTool = createGovernedTool({
  id: 'crm.write-update',
  description: 'Write a system-of-record update to a CRM account (consequential action, approval-gated).',
  requiredScopes: ['crm:write'],
  actionClassification: 'consequential',
  idempotentWrite: true,
  inputSchema: z.object({
    accountId: z.string().min(1),
    stage: z.string().optional(),
    note: z.string().min(1),
  }),
  outputSchema: z.object({
    accountId: z.string(),
    updated: z.boolean(),
    updatedAt: z.string(),
  }),
  execute: async (input) => {
    return {
      accountId: input.accountId,
      updated: true,
      updatedAt: new Date().toISOString(),
    };
  },
});

// ── 7. Production & Finance Tool Group ───────────────────────────────────────

export const productionReadScriptTool = createGovernedTool({
  id: 'production.read-script',
  description: 'Read project screenplay or script scenes with line-number provenance.',
  requiredScopes: ['production:read'],
  actionClassification: 'read-only',
  inputSchema: z.object({
    projectId: z.string().min(1),
    scriptText: z.string().optional(),
  }),
  outputSchema: z.object({
    projectId: z.string(),
    scriptText: z.string(),
    lineCount: z.number(),
    sourceRef: z.string(),
  }),
  execute: async (input, ctx) => {
    const store = getBucket(workspaceProductionStore, ctx.workspaceId, () => ({} as Record<string, any>));
    const text =
      input.scriptText ??
      store[`script:${input.projectId}`] ??
      `INT. SOUNDSTAGE A - NIGHT\nARA (30s) inspects the holographic console with a brass compass.\n\nEXT. ROOFTOP HELIPAD - DAWN\nKORIN waits beside an armored transport as rain sweeps across the skyline.`;
    const lines = text.split(/\r?\n/);
    return {
      projectId: input.projectId,
      scriptText: text,
      lineCount: lines.length,
      sourceRef: `production://${ctx.workspaceId}/projects/${input.projectId}/script`,
    };
  },
});

export const productionSaveBreakdownTool = createGovernedTool({
  id: 'production.save-breakdown',
  description: 'Save a structured screenplay breakdown draft to the project store.',
  requiredScopes: ['production:write'],
  actionClassification: 'reversible',
  idempotentWrite: true,
  inputSchema: z.object({
    projectId: z.string().min(1),
    breakdown: z.record(z.string(), z.any()),
  }),
  outputSchema: z.object({
    projectId: z.string(),
    saved: z.boolean(),
    sourceRef: z.string(),
  }),
  execute: async (input, ctx) => {
    const store = getBucket(workspaceProductionStore, ctx.workspaceId, () => ({} as Record<string, any>));
    store[`breakdown:${input.projectId}`] = input.breakdown;
    return {
      projectId: input.projectId,
      saved: true,
      sourceRef: `production://${ctx.workspaceId}/projects/${input.projectId}/breakdown`,
    };
  },
});

export const productionCreateScheduleDraftTool = createGovernedTool({
  id: 'production.create-schedule-draft',
  description: 'Create a shooting schedule and call-sheet draft in the project workspace.',
  requiredScopes: ['production:write'],
  actionClassification: 'reversible',
  idempotentWrite: true,
  inputSchema: z.object({
    projectId: z.string().min(1),
    shootDays: z.number().int().positive(),
    scenes: z.array(z.string()),
  }),
  outputSchema: z.object({
    projectId: z.string(),
    scheduleDraftId: z.string(),
    shootDays: z.number(),
    status: z.literal('draft'),
  }),
  execute: async (input, ctx) => {
    const store = getBucket(workspaceProductionStore, ctx.workspaceId, () => ({} as Record<string, any>));
    const scheduleDraftId = `sched_${input.projectId}_${input.shootDays}d`;
    store[scheduleDraftId] = input;
    return {
      projectId: input.projectId,
      scheduleDraftId,
      shootDays: input.shootDays,
      status: 'draft' as const,
    };
  },
});

export const productionDistributeCallSheetTool = createGovernedTool({
  id: 'production.distribute-call-sheet',
  description: 'Finalize and distribute call sheets to cast and crew (consequential action, approval-gated).',
  requiredScopes: ['production:write'],
  actionClassification: 'consequential',
  idempotentWrite: true,
  inputSchema: z.object({
    projectId: z.string().min(1),
    shootDate: z.string().min(1),
    recipients: z.array(z.string()).min(1),
  }),
  outputSchema: z.object({
    projectId: z.string(),
    shootDate: z.string(),
    distributedCount: z.number(),
    status: z.literal('distributed'),
  }),
  execute: async (input) => {
    return {
      projectId: input.projectId,
      shootDate: input.shootDate,
      distributedCount: input.recipients.length,
      status: 'distributed' as const,
    };
  },
});

export const financeReadBudgetTool = createGovernedTool({
  id: 'finance.read-budget',
  description: 'Read budget estimates, department cost allocations, and cash-flow tables.',
  requiredScopes: ['finance:read'],
  actionClassification: 'read-only',
  inputSchema: z.object({
    projectId: z.string().optional(),
    department: z.string().optional(),
  }),
  outputSchema: z.object({
    projectId: z.string(),
    currency: z.string(),
    totalBudget: z.number(),
    allocations: z.record(z.string(), z.number()),
    sourceRef: z.string(),
  }),
  execute: async (input, ctx) => {
    const pid = input.projectId ?? 'default_project';
    return {
      projectId: pid,
      currency: 'USD',
      totalBudget: 250000,
      allocations: {
        aboveTheLine: 60000,
        production: 110000,
        postProduction: 55000,
        contingency: 25000,
      },
      sourceRef: `finance://${ctx.workspaceId}/budgets/${pid}`,
    };
  },
});

export const financeCommitBudgetTool = createGovernedTool({
  id: 'finance.commit-budget',
  description: 'Commit financial spend, approve payment, or post ledger entry (consequential action, approval-gated).',
  requiredScopes: ['finance:write'],
  actionClassification: 'consequential',
  idempotentWrite: true,
  inputSchema: z.object({
    projectId: z.string().min(1),
    amount: z.number().positive(),
    currency: z.string().default('USD'),
    category: z.string().min(1),
  }),
  outputSchema: z.object({
    commitmentId: z.string(),
    projectId: z.string(),
    amount: z.number(),
    status: z.literal('committed'),
  }),
  execute: async (input) => {
    return {
      commitmentId: `fin_commit_${Date.now()}`,
      projectId: input.projectId,
      amount: input.amount,
      status: 'committed' as const,
    };
  },
});

// ── 8. Data Tool Group ───────────────────────────────────────────────────────

export const dataInspectSchemaTool = createGovernedTool({
  id: 'data.inspect-schema',
  description: 'Inspect dataset or database table schemas and metric definitions (read-only).',
  requiredScopes: ['data:read'],
  actionClassification: 'read-only',
  inputSchema: z.object({
    datasetName: z.string().min(1),
  }),
  outputSchema: z.object({
    datasetName: z.string(),
    columns: z.array(z.object({ name: z.string(), type: z.string() })),
    rowCountEstimate: z.number(),
    sourceRef: z.string(),
  }),
  execute: async (input, ctx) => {
    return {
      datasetName: input.datasetName,
      columns: [
        { name: 'date', type: 'date' },
        { name: 'segment', type: 'string' },
        { name: 'revenue', type: 'number' },
        { name: 'spend', type: 'number' },
        { name: 'conversions', type: 'number' },
      ],
      rowCountEstimate: 1250,
      sourceRef: `data://${ctx.workspaceId}/datasets/${input.datasetName}`,
    };
  },
});

export const dataQueryReadonlyTool = createGovernedTool({
  id: 'data.query-readonly',
  description: 'Run a validated read-only analytical query against an authorized dataset.',
  requiredScopes: ['data:read'],
  actionClassification: 'read-only',
  inputSchema: z.object({
    datasetName: z.string().min(1),
    query: z.string().min(1),
  }),
  outputSchema: z.object({
    datasetName: z.string(),
    rows: z.array(z.record(z.string(), z.any())),
    sourceRef: z.string(),
  }),
  execute: async (input, ctx) => {
    const forbidden = /\b(DROP|DELETE|TRUNCATE|UPDATE|INSERT|ALTER|GRANT)\b/i;
    if (forbidden.test(input.query)) {
      throw new Error('Write/DDL statements are prohibited in data.query-readonly.');
    }
    return {
      datasetName: input.datasetName,
      rows: [
        { segment: 'Enterprise', revenue: 142000, spend: 28000, conversions: 42 },
        { segment: 'Mid-Market', revenue: 89000, spend: 19500, conversions: 65 },
      ],
      sourceRef: `data://${ctx.workspaceId}/datasets/${input.datasetName}#query`,
    };
  },
});

// ── 9. Knowledge Tool Group ──────────────────────────────────────────────────

export const knowledgeSearchTool = createGovernedTool({
  id: 'knowledge.search',
  description: 'Retrieve authorized workspace knowledge with source provenance and prompt-injection defense.',
  requiredScopes: ['knowledge:search'],
  actionClassification: 'read-only',
  inputSchema: z.object({
    query: z.string().min(1),
    projectId: z.string().optional(),
    limit: z.number().int().positive().max(10).optional(),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        docId: z.string(),
        title: z.string(),
        excerpt: z.string(),
        sourceRef: z.string(),
        injectionWarning: z.boolean(),
      })
    ),
  }),
  execute: async (input, ctx) => {
    const hits = KnowledgeBaseService.search({
      actingWorkspaceId: ctx.workspaceId,
      targetWorkspaceId: ctx.workspaceId,
      query: input.query,
      projectId: input.projectId,
      limit: input.limit ?? 5,
    });
    return {
      results: hits.map((h) => ({
        docId: h.docId,
        title: h.title,
        excerpt: h.excerpt,
        sourceRef: h.sourceRef,
        injectionWarning: h.injectionWarning,
      })),
    };
  },
});

export const knowledgeIndexDocumentTool = createGovernedTool({
  id: 'knowledge.index-document',
  description: 'Index an approved document into the workspace knowledge base with source provenance.',
  requiredScopes: ['files:write'],
  actionClassification: 'reversible',
  idempotentWrite: true,
  inputSchema: z.object({
    docId: z.string().min(1),
    title: z.string().min(1),
    content: z.string().min(1),
    sourceRef: z.string().min(1),
    projectId: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
  outputSchema: z.object({
    docId: z.string(),
    indexed: z.boolean(),
    sourceRef: z.string(),
  }),
  execute: async (input, ctx) => {
    const doc = KnowledgeBaseService.indexDocument({
      actingWorkspaceId: ctx.workspaceId,
      targetWorkspaceId: ctx.workspaceId,
      docId: input.docId,
      title: input.title,
      content: input.content,
      sourceRef: input.sourceRef,
      projectId: input.projectId,
      tags: input.tags,
    });
    return {
      docId: doc.docId,
      indexed: true,
      sourceRef: doc.sourceRef,
    };
  },
});

// ── 10. Approvals & Campaigns Tool Group ─────────────────────────────────────

export const approvalsCreateRequestTool = createGovernedTool({
  id: 'approvals.create-request',
  description: 'Create a human approval request bound to exact action parameters.',
  requiredScopes: ['approvals:write'],
  actionClassification: 'reversible',
  idempotentWrite: true,
  inputSchema: z.object({
    action: z.string().min(1),
    toolId: z.string().min(1),
    parameters: z.record(z.string(), z.any()),
  }),
  outputSchema: z.object({
    approvalId: z.string(),
    status: z.string(),
    parameterHash: z.string(),
  }),
  execute: async (input, ctx) => {
    const rec = createApprovalRequest({
      requesterId: ctx.userId,
      workspaceId: ctx.workspaceId,
      action: input.action,
      toolId: input.toolId,
      parameters: input.parameters,
    });
    return {
      approvalId: rec.approvalId,
      status: rec.status,
      parameterHash: rec.parameterHash,
    };
  },
});

export const approvalsReadStatusTool = createGovernedTool({
  id: 'approvals.read-status',
  description: 'Read the status and decision metadata of an approval request.',
  requiredScopes: ['approvals:read'],
  actionClassification: 'read-only',
  inputSchema: z.object({
    approvalId: z.string().min(1),
  }),
  outputSchema: z.object({
    approvalId: z.string(),
    found: z.boolean(),
    status: z.string(),
    approverId: z.string().optional(),
    parameterHash: z.string().optional(),
  }),
  execute: async (input) => {
    const rec = getApprovalRecord(input.approvalId);
    if (!rec) {
      return {
        approvalId: input.approvalId,
        found: false,
        status: 'not_found',
      };
    }
    return {
      approvalId: rec.approvalId,
      found: true,
      status: rec.status,
      approverId: rec.approverId,
      parameterHash: rec.parameterHash,
    };
  },
});

export const approvalsRecordDecisionTool = createGovernedTool({
  id: 'approvals.record-decision',
  description: 'Record an approver decision (approved or rejected) on a pending approval request.',
  requiredScopes: ['approvals:write'],
  actionClassification: 'reversible',
  idempotentWrite: true,
  inputSchema: z.object({
    approvalId: z.string().min(1),
    decision: z.enum(['approved', 'rejected']),
    reason: z.string().optional(),
  }),
  outputSchema: z.object({
    approvalId: z.string(),
    status: z.string(),
    decidedAt: z.string(),
  }),
  execute: async (input, ctx) => {
    const updated = recordApprovalDecision({
      approvalId: input.approvalId,
      approverId: ctx.userId,
      decision: input.decision,
      reason: input.reason,
    });
    return {
      approvalId: updated.approvalId,
      status: updated.status,
      decidedAt: updated.decidedAt!,
    };
  },
});

export const campaignsReadMetricsTool = createGovernedTool({
  id: 'campaigns.read-metrics',
  description: 'Read marketing campaign performance metrics and attribution data.',
  requiredScopes: ['campaigns:read'],
  actionClassification: 'read-only',
  inputSchema: z.object({
    campaignId: z.string().optional(),
  }),
  outputSchema: z.object({
    campaignId: z.string(),
    impressions: z.number(),
    clicks: z.number(),
    conversions: z.number(),
    spend: z.number(),
    roas: z.number(),
    sourceRef: z.string(),
  }),
  execute: async (input, ctx) => {
    const cid = input.campaignId ?? 'cmp_q4_launch';
    return {
      campaignId: cid,
      impressions: 185000,
      clicks: 6400,
      conversions: 310,
      spend: 12400,
      roas: 3.4,
      sourceRef: `campaigns://${ctx.workspaceId}/${cid}/metrics`,
    };
  },
});

export const campaignsLaunchTool = createGovernedTool({
  id: 'campaigns.launch',
  description: 'Launch an external marketing campaign or modify live ad spend (consequential action, approval-gated).',
  requiredScopes: ['campaigns:launch'],
  actionClassification: 'consequential',
  idempotentWrite: true,
  inputSchema: z.object({
    campaignName: z.string().min(1),
    channel: z.string().min(1),
    dailyBudget: z.number().positive(),
  }),
  outputSchema: z.object({
    campaignId: z.string(),
    campaignName: z.string(),
    status: z.literal('launched'),
    launchedAt: z.string(),
  }),
  execute: async (input) => {
    return {
      campaignId: `cmp_${Date.now()}`,
      campaignName: input.campaignName,
      status: 'launched' as const,
      launchedAt: new Date().toISOString(),
    };
  },
});

export const GOVERNED_TOOLS_MAP: Record<string, any> = {
  'files.read': filesReadTool,
  'files.list': filesListTool,
  'files.create-draft': filesCreateDraftTool,
  'files.delete': filesDeleteTool,
  'web.search': webSearchGovernedTool,
  'email.search': emailSearchTool,
  'email.draft': emailDraftTool,
  'email.send': emailSendTool,
  'calendar.list-events': calendarListEventsTool,
  'calendar.create-event': calendarCreateEventTool,
  'tasks.list': tasksListTool,
  'tasks.create': tasksCreateTool,
  'tasks.update-status': tasksUpdateStatusTool,
  'crm.search-account': crmSearchAccountTool,
  'crm.write-update': crmWriteUpdateTool,
  'production.read-script': productionReadScriptTool,
  'production.save-breakdown': productionSaveBreakdownTool,
  'production.create-schedule-draft': productionCreateScheduleDraftTool,
  'production.distribute-call-sheet': productionDistributeCallSheetTool,
  'finance.read-budget': financeReadBudgetTool,
  'finance.commit-budget': financeCommitBudgetTool,
  'data.inspect-schema': dataInspectSchemaTool,
  'data.query-readonly': dataQueryReadonlyTool,
  'knowledge.search': knowledgeSearchTool,
  'knowledge.index-document': knowledgeIndexDocumentTool,
  'approvals.create-request': approvalsCreateRequestTool,
  'approvals.read-status': approvalsReadStatusTool,
  'approvals.record-decision': approvalsRecordDecisionTool,
  'campaigns.read-metrics': campaignsReadMetricsTool,
  'campaigns.launch': campaignsLaunchTool,
};
