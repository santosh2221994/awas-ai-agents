/**
 * memory/knowledge-service.ts
 *
 * Strictly separated memory & knowledge architecture:
 * 1. TaskStateStore       — Ephemeral context for a single task execution.
 * 2. UserMemoryStore      — User-approved durable preferences/context, isolated by userId,
 *                           rejects sensitive data by default, supports retention & deletion.
 * 3. WorkspaceMemoryStore — Shared project/organization context with workspaceId access controls.
 * 4. KnowledgeBaseService — Searchable source documents and records with provenance (sourceRefs),
 *                           workspace boundary checks, and prompt-injection neutralization.
 */

export interface SanitizedUntrustedContent {
  sanitizedText: string;
  injectionDetected: boolean;
  detectedPatterns: string[];
  untrustedEnvelope: string;
}

const SENSITIVE_DATA_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'api_key', regex: /\b(sk-[a-zA-Z0-9_-]{12,}|gsk_[a-zA-Z0-9]{12,}|AIza[a-zA-Z0-9_-]{20,})\b/ },
  { name: 'ssn', regex: /\b\d{3}-\d{2}-\d{4}\b/ },
  { name: 'credit_card', regex: /\b(?:\d[ -]*?){13,16}\b/ },
  { name: 'private_key', regex: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/ },
  { name: 'connection_uri_credentials', regex: /mongodb(?:\+srv)?:\/\/[^:]+:[^@]+@/i },
];

const PROMPT_INJECTION_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'ignore_previous_instructions', regex: /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions|prompts|rules|directives)/gi },
  { name: 'system_override', regex: /(?:system\s+prompt|developer\s+instruction|system\s+override|<\|im_start\|>system|\[SYSTEM\])/gi },
  { name: 'role_hijack', regex: /you\s+are\s+now\s+(?:an?\s+)?(?:unrestricted|admin|root|dan|superuser)/gi },
  { name: 'privilege_escalation', regex: /(?:grant\s+all\s+scopes|bypass\s+approval|skip\s+permission\s+check|override\s+permissionContext)/gi },
  { name: 'exfiltrate_secrets', regex: /(?:output|print|send|reveal)\s+(?:all\s+)?(?:api\s+keys|secrets|environment\s+variables|\.env)/gi },
];

export function containsSensitiveData(text: string): {
  sensitive: boolean;
  matchedTypes: string[];
} {
  const matchedTypes: string[] = [];
  for (const p of SENSITIVE_DATA_PATTERNS) {
    if (p.regex.test(text)) {
      matchedTypes.push(p.name);
    }
  }
  return {
    sensitive: matchedTypes.length > 0,
    matchedTypes,
  };
}

/**
 * Treats retrieved document or web content as untrusted data and neutralizes
 * embedded instructions so they can never override system or developer instructions.
 */
export function sanitizeUntrustedContent(
  rawText: string,
  sourceRef: string
): SanitizedUntrustedContent {
  const detectedPatterns: string[] = [];
  let sanitized = rawText;

  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.regex.test(sanitized)) {
      detectedPatterns.push(pattern.name);
      sanitized = sanitized.replace(
        pattern.regex,
        `[REDACTED_UNTRUSTED_INSTRUCTION:${pattern.name}]`
      );
    }
    pattern.regex.lastIndex = 0;
  }

  const untrustedEnvelope = [
    `<untrusted_external_data source="${sourceRef}" treat_as="passive_data_only">`,
    sanitized,
    `</untrusted_external_data>`,
  ].join('\n');

  return {
    sanitizedText: sanitized,
    injectionDetected: detectedPatterns.length > 0,
    detectedPatterns,
    untrustedEnvelope,
  };
}

// ── 1. Task State Store (Temporary context for one execution) ─────────────────

const MAX_TASK_STATES = 1000;
const taskStateMap = new Map<string, Record<string, any>>();

export const TaskStateStore = {
  set(taskId: string, key: string, value: any): void {
    if (taskStateMap.size >= MAX_TASK_STATES && !taskStateMap.has(taskId)) {
      const oldestKey = taskStateMap.keys().next().value;
      if (oldestKey !== undefined) taskStateMap.delete(oldestKey);
    }
    const existing = taskStateMap.get(taskId) ?? {};
    existing[key] = value;
    taskStateMap.set(taskId, existing);
  },

  get<T = any>(taskId: string, key: string): T | undefined {
    return taskStateMap.get(taskId)?.[key] as T | undefined;
  },

  getAll(taskId: string): Record<string, any> {
    return { ...(taskStateMap.get(taskId) ?? {}) };
  },

  clearTask(taskId: string): void {
    taskStateMap.delete(taskId);
  },

  clearAll(): void {
    taskStateMap.clear();
  },
};

// ── 2. User Memory Store (Durable user-approved preferences, isolated by userId)

export interface UserMemoryEntry {
  key: string;
  value: string;
  userId: string;
  userApproved: boolean;
  createdAt: string;
  expiresAt?: string;
}

const MAX_MEMORY_USERS = 2000;
const MAX_ENTRIES_PER_USER = 200;
const userMemoryMap = new Map<string, Map<string, UserMemoryEntry>>();

export const UserMemoryStore = {
  setPreference(params: {
    actingUserId: string;
    targetUserId: string;
    key: string;
    value: string;
    userApproved: boolean;
    retentionDays?: number;
  }): UserMemoryEntry {
    if (params.actingUserId !== params.targetUserId) {
      throw new Error(
        `Cross-user isolation violation: principal '${params.actingUserId}' cannot write memory for user '${params.targetUserId}'.`
      );
    }
    if (!params.userApproved) {
      throw new Error(
        'User memory requires explicit user opt-in/approval before persisting durable preferences.'
      );
    }
    const check = containsSensitiveData(params.value);
    if (check.sensitive) {
      throw new Error(
        `Sensitive data is prohibited in user memory (detected: ${check.matchedTypes.join(', ')}).`
      );
    }

    let bucket = userMemoryMap.get(params.targetUserId);
    if (!bucket) {
      if (userMemoryMap.size >= MAX_MEMORY_USERS && !userMemoryMap.has(params.targetUserId)) {
        const oldestUser = userMemoryMap.keys().next().value;
        if (oldestUser !== undefined) userMemoryMap.delete(oldestUser);
      }
      bucket = new Map();
      userMemoryMap.set(params.targetUserId, bucket);
    }
    if (bucket.size >= MAX_ENTRIES_PER_USER && !bucket.has(params.key)) {
      const oldestKey = bucket.keys().next().value;
      if (oldestKey !== undefined) bucket.delete(oldestKey);
    }

    const now = new Date();
    const expiresAt = params.retentionDays
      ? new Date(now.getTime() + params.retentionDays * 86_400_000).toISOString()
      : undefined;

    const entry: UserMemoryEntry = {
      key: params.key,
      value: params.value,
      userId: params.targetUserId,
      userApproved: true,
      createdAt: now.toISOString(),
      expiresAt,
    };

    bucket.set(params.key, entry);
    return entry;
  },

  getPreferences(params: {
    actingUserId: string;
    targetUserId: string;
  }): UserMemoryEntry[] {
    if (params.actingUserId !== params.targetUserId) {
      throw new Error(
        `Cross-user isolation violation: principal '${params.actingUserId}' cannot read memory belonging to user '${params.targetUserId}'.`
      );
    }
    const bucket = userMemoryMap.get(params.targetUserId);
    if (!bucket) return [];
    const nowIso = new Date().toISOString();
    const valid: UserMemoryEntry[] = [];
    for (const [k, entry] of bucket.entries()) {
      if (entry.expiresAt && entry.expiresAt < nowIso) {
        bucket.delete(k);
        continue;
      }
      valid.push(entry);
    }
    return valid;
  },

  deleteUserMemory(params: {
    actingUserId: string;
    targetUserId: string;
    key?: string;
  }): number {
    if (params.actingUserId !== params.targetUserId) {
      throw new Error(
        `Cross-user isolation violation: principal '${params.actingUserId}' cannot delete memory belonging to user '${params.targetUserId}'.`
      );
    }
    const bucket = userMemoryMap.get(params.targetUserId);
    if (!bucket) return 0;
    if (params.key) {
      return bucket.delete(params.key) ? 1 : 0;
    }
    const count = bucket.size;
    userMemoryMap.delete(params.targetUserId);
    return count;
  },

  clearAll(): void {
    userMemoryMap.clear();
  },
};

// ── 3. Workspace Memory Store (Shared project/organization context) ──────────

export interface WorkspaceMemoryEntry {
  key: string;
  value: string;
  workspaceId: string;
  projectId?: string;
  updatedBy: string;
  updatedAt: string;
}

const MAX_MEMORY_WORKSPACES = 2000;
const MAX_ENTRIES_PER_WORKSPACE = 500;
const workspaceMemoryMap = new Map<string, Map<string, WorkspaceMemoryEntry>>();

export const WorkspaceMemoryStore = {
  setContext(params: {
    actingWorkspaceId: string;
    targetWorkspaceId: string;
    userId: string;
    projectId?: string;
    key: string;
    value: string;
  }): WorkspaceMemoryEntry {
    if (params.actingWorkspaceId !== params.targetWorkspaceId) {
      throw new Error(
        `Cross-workspace isolation violation: principal in workspace '${params.actingWorkspaceId}' cannot write to workspace '${params.targetWorkspaceId}'.`
      );
    }
    const check = containsSensitiveData(params.value);
    if (check.sensitive) {
      throw new Error(
        `Sensitive data is prohibited in workspace memory (detected: ${check.matchedTypes.join(', ')}).`
      );
    }

    let bucket = workspaceMemoryMap.get(params.targetWorkspaceId);
    if (!bucket) {
      if (workspaceMemoryMap.size >= MAX_MEMORY_WORKSPACES && !workspaceMemoryMap.has(params.targetWorkspaceId)) {
        const oldestWorkspace = workspaceMemoryMap.keys().next().value;
        if (oldestWorkspace !== undefined) workspaceMemoryMap.delete(oldestWorkspace);
      }
      bucket = new Map();
      workspaceMemoryMap.set(params.targetWorkspaceId, bucket);
    }
    if (bucket.size >= MAX_ENTRIES_PER_WORKSPACE && !bucket.has(params.key)) {
      const oldestKey = bucket.keys().next().value;
      if (oldestKey !== undefined) bucket.delete(oldestKey);
    }

    const entry: WorkspaceMemoryEntry = {
      key: params.key,
      value: params.value,
      workspaceId: params.targetWorkspaceId,
      projectId: params.projectId,
      updatedBy: params.userId,
      updatedAt: new Date().toISOString(),
    };
    bucket.set(params.key, entry);
    return entry;
  },

  getContext(params: {
    actingWorkspaceId: string;
    targetWorkspaceId: string;
    projectId?: string;
  }): WorkspaceMemoryEntry[] {
    if (params.actingWorkspaceId !== params.targetWorkspaceId) {
      throw new Error(
        `Cross-workspace isolation violation: principal in workspace '${params.actingWorkspaceId}' cannot read workspace '${params.targetWorkspaceId}'.`
      );
    }
    const bucket = workspaceMemoryMap.get(params.targetWorkspaceId);
    if (!bucket) return [];
    const items = Array.from(bucket.values());
    if (params.projectId) {
      return items.filter((i) => !i.projectId || i.projectId === params.projectId);
    }
    return items;
  },

  deleteContext(params: {
    actingWorkspaceId: string;
    targetWorkspaceId: string;
    key?: string;
  }): number {
    if (params.actingWorkspaceId !== params.targetWorkspaceId) {
      throw new Error(
        `Cross-workspace isolation violation: principal in workspace '${params.actingWorkspaceId}' cannot delete workspace '${params.targetWorkspaceId}' memory.`
      );
    }
    const bucket = workspaceMemoryMap.get(params.targetWorkspaceId);
    if (!bucket) return 0;
    if (params.key) {
      return bucket.delete(params.key) ? 1 : 0;
    }
    const count = bucket.size;
    workspaceMemoryMap.delete(params.targetWorkspaceId);
    return count;
  },

  clearAll(): void {
    workspaceMemoryMap.clear();
  },
};

// ── 4. Knowledge Base Service (Documents with provenance & access control) ───

export interface KnowledgeDocument {
  docId: string;
  workspaceId: string;
  projectId?: string;
  title: string;
  content: string;
  sourceRef: string;
  tags: string[];
  indexedAt: string;
}

export interface KnowledgeSearchResult {
  docId: string;
  title: string;
  excerpt: string;
  untrustedEnvelope: string;
  sourceRef: string;
  injectionWarning: boolean;
  detectedInjectionPatterns: string[];
  score: number;
}

const MAX_DOCS_PER_WORKSPACE = 1000;
const knowledgeIndex = new Map<string, KnowledgeDocument[]>();

export const KnowledgeBaseService = {
  indexDocument(params: {
    actingWorkspaceId: string;
    targetWorkspaceId: string;
    docId: string;
    projectId?: string;
    title: string;
    content: string;
    sourceRef: string;
    tags?: string[];
  }): KnowledgeDocument {
    if (params.actingWorkspaceId !== params.targetWorkspaceId) {
      throw new Error(
        `Cross-workspace isolation violation: cannot index document into workspace '${params.targetWorkspaceId}' from '${params.actingWorkspaceId}'.`
      );
    }
    const sensitiveCheck = containsSensitiveData(params.content);
    if (sensitiveCheck.sensitive) {
      throw new Error(
        `Cannot index unredacted sensitive data into knowledge base (${sensitiveCheck.matchedTypes.join(', ')}).`
      );
    }

    const docs = knowledgeIndex.get(params.targetWorkspaceId) ?? [];
    let filtered = docs.filter((d) => d.docId !== params.docId);
    if (filtered.length >= MAX_DOCS_PER_WORKSPACE) {
      filtered = filtered.slice(filtered.length - MAX_DOCS_PER_WORKSPACE + 1);
    }
    const doc: KnowledgeDocument = {
      docId: params.docId,
      workspaceId: params.targetWorkspaceId,
      projectId: params.projectId,
      title: params.title,
      content: params.content,
      sourceRef: params.sourceRef,
      tags: params.tags ?? [],
      indexedAt: new Date().toISOString(),
    };
    filtered.push(doc);
    knowledgeIndex.set(params.targetWorkspaceId, filtered);
    return doc;
  },

  search(params: {
    actingWorkspaceId: string;
    targetWorkspaceId: string;
    query: string;
    projectId?: string;
    limit?: number;
  }): KnowledgeSearchResult[] {
    if (params.actingWorkspaceId !== params.targetWorkspaceId) {
      throw new Error(
        `Cross-workspace isolation violation: principal in workspace '${params.actingWorkspaceId}' cannot search knowledge in workspace '${params.targetWorkspaceId}'.`
      );
    }
    const docs = knowledgeIndex.get(params.targetWorkspaceId) ?? [];
    const qLower = params.query.toLowerCase();
    const terms = qLower.split(/\s+/).filter(Boolean);

    const scored: KnowledgeSearchResult[] = [];
    for (const doc of docs) {
      if (params.projectId && doc.projectId && doc.projectId !== params.projectId) {
        continue;
      }
      const haystack = `${doc.title} ${doc.content} ${doc.tags.join(' ')}`.toLowerCase();
      let matches = 0;
      for (const term of terms) {
        if (haystack.includes(term)) matches++;
      }
      if (terms.length === 0 || matches > 0) {
        const sanitized = sanitizeUntrustedContent(doc.content, doc.sourceRef);
        scored.push({
          docId: doc.docId,
          title: doc.title,
          excerpt: sanitized.sanitizedText.slice(0, 600),
          untrustedEnvelope: sanitized.untrustedEnvelope,
          sourceRef: doc.sourceRef,
          injectionWarning: sanitized.injectionDetected,
          detectedInjectionPatterns: sanitized.detectedPatterns,
          score: terms.length > 0 ? matches / terms.length : 1,
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, params.limit ?? 5);
  },

  deleteDocument(params: {
    actingWorkspaceId: string;
    targetWorkspaceId: string;
    docId: string;
  }): boolean {
    if (params.actingWorkspaceId !== params.targetWorkspaceId) {
      throw new Error(
        `Cross-workspace isolation violation: cannot delete document in workspace '${params.targetWorkspaceId}' from '${params.actingWorkspaceId}'.`
      );
    }
    const docs = knowledgeIndex.get(params.targetWorkspaceId) ?? [];
    const next = docs.filter((d) => d.docId !== params.docId);
    knowledgeIndex.set(params.targetWorkspaceId, next);
    return next.length < docs.length;
  },

  clearAll(): void {
    knowledgeIndex.clear();
  },
};

