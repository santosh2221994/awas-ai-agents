/**
 * services/approval-service.ts
 *
 * Parameter-bound human approval checkpoints for consequential actions:
 * - External messages (email:send, slack broadcast)
 * - Publishing content
 * - Campaign launch / ad spend changes
 * - Purchases / payments / accounting ledger writes
 * - Deletions & permission changes
 * - Finalizing production commitments (schedule/budget/call-sheet distribution)
 *
 * Approval binds to the exact action, toolId, userId, workspaceId, and canonicalized
 * parameters. If parameters change materially after approval, re-approval is required.
 */

import crypto from 'node:crypto';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'invalidated';

export interface ApprovalRecord {
  approvalId: string;
  requesterId: string;
  workspaceId: string;
  approverId?: string;
  action: string;
  toolId: string;
  parameters: Record<string, any>;
  parameterHash: string;
  status: ApprovalStatus;
  createdAt: string;
  decidedAt?: string;
  decisionReason?: string;
  executionOutcome?: {
    executedAt: string;
    status: 'success' | 'failed';
    summary: string;
  };
}

export class ApprovalRequiredError extends Error {
  public readonly code = 'APPROVAL_REQUIRED';
  public readonly approvalId: string;
  public readonly action: string;
  public readonly toolId: string;
  public readonly reason: string;

  constructor(params: {
    approvalId: string;
    action: string;
    toolId: string;
    reason: string;
  }) {
    super(
      `Approval required for consequential action '${params.action}' (tool: ${params.toolId}): ${params.reason} [approvalId=${params.approvalId}]`
    );
    this.name = 'ApprovalRequiredError';
    this.approvalId = params.approvalId;
    this.action = params.action;
    this.toolId = params.toolId;
    this.reason = params.reason;
  }
}

const MAX_APPROVAL_RECORDS = 2000;
const approvalStore = new Map<string, ApprovalRecord>();
const pendingHashToApprovalId = new Map<string, string>();

/**
 * Recursively sorts object keys to produce a deterministic JSON representation
 * for parameter binding.
 */
export function canonicalizeValue(value: any): any {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalizeValue);
  }
  const sortedKeys = Object.keys(value)
    .filter((k) => value[k] !== undefined && !k.startsWith('_'))
    .sort();
  const result: Record<string, any> = {};
  for (const key of sortedKeys) {
    result[key] = canonicalizeValue(value[key]);
  }
  return result;
}

export function computeApprovalHash(params: {
  action: string;
  toolId: string;
  userId: string;
  workspaceId: string;
  parameters: Record<string, any>;
}): string {
  const payload = JSON.stringify({
    action: params.action,
    toolId: params.toolId,
    userId: params.userId,
    workspaceId: params.workspaceId,
    parameters: canonicalizeValue(params.parameters),
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export function createApprovalRequest(params: {
  requesterId: string;
  workspaceId: string;
  action: string;
  toolId: string;
  parameters: Record<string, any>;
}): ApprovalRecord {
  const parameterHash = computeApprovalHash({
    action: params.action,
    toolId: params.toolId,
    userId: params.requesterId,
    workspaceId: params.workspaceId,
    parameters: params.parameters,
  });

  // O(1) reuse of existing pending approval for exact same action & parameterHash
  const existingPendingId = pendingHashToApprovalId.get(parameterHash);
  if (existingPendingId) {
    const existing = approvalStore.get(existingPendingId);
    if (existing && existing.status === 'pending') {
      return existing;
    }
    pendingHashToApprovalId.delete(parameterHash);
  }

  // Evict oldest entries if store exceeds capacity
  if (approvalStore.size >= MAX_APPROVAL_RECORDS) {
    const oldestKey = approvalStore.keys().next().value;
    if (oldestKey !== undefined) {
      const oldRec = approvalStore.get(oldestKey);
      if (oldRec) pendingHashToApprovalId.delete(oldRec.parameterHash);
      approvalStore.delete(oldestKey);
    }
  }

  const approvalId = `apr_${crypto.randomBytes(6).toString('hex')}`;
  const record: ApprovalRecord = {
    approvalId,
    requesterId: params.requesterId,
    workspaceId: params.workspaceId,
    action: params.action,
    toolId: params.toolId,
    parameters: structuredClone(canonicalizeValue(params.parameters)),
    parameterHash,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  approvalStore.set(approvalId, record);
  pendingHashToApprovalId.set(parameterHash, approvalId);
  return record;
}

export function recordApprovalDecision(params: {
  approvalId: string;
  approverId: string;
  decision: 'approved' | 'rejected';
  reason?: string;
}): ApprovalRecord {
  const record = approvalStore.get(params.approvalId);
  if (!record) {
    throw new Error(`Approval request '${params.approvalId}' not found`);
  }
  record.approverId = params.approverId;
  record.status = params.decision;
  record.decidedAt = new Date().toISOString();
  record.decisionReason = params.reason;
  approvalStore.set(record.approvalId, record);
  pendingHashToApprovalId.delete(record.parameterHash);
  return record;
}

export function recordApprovalExecutionOutcome(
  approvalId: string,
  outcome: { status: 'success' | 'failed'; summary: string }
): ApprovalRecord | undefined {
  const record = approvalStore.get(approvalId);
  if (!record) return undefined;
  record.executionOutcome = {
    executedAt: new Date().toISOString(),
    status: outcome.status,
    summary: outcome.summary,
  };
  approvalStore.set(approvalId, record);
  return record;
}

export function getApprovalRecord(approvalId: string): ApprovalRecord | undefined {
  return approvalStore.get(approvalId);
}

export function listApprovals(filter?: {
  workspaceId?: string;
  requesterId?: string;
  status?: ApprovalStatus;
}): ApprovalRecord[] {
  const all = Array.from(approvalStore.values());
  if (!filter) return all;
  return all.filter((r) => {
    if (filter.workspaceId && r.workspaceId !== filter.workspaceId) return false;
    if (filter.requesterId && r.requesterId !== filter.requesterId) return false;
    if (filter.status && r.status !== filter.status) return false;
    return true;
  });
}

export function clearApprovals(): void {
  approvalStore.clear();
  pendingHashToApprovalId.clear();
}

/**
 * Verifies that an approved, parameter-matching approval record exists for a
 * consequential action. If not (or if parameters changed materially after approval),
 * creates a new pending approval request and throws `ApprovalRequiredError`.
 */
export function verifyOrRequestApproval(params: {
  requesterId: string;
  workspaceId: string;
  action: string;
  toolId: string;
  parameters: Record<string, any>;
  suppliedApprovalIds?: string[];
}): ApprovalRecord {
  const expectedHash = computeApprovalHash({
    action: params.action,
    toolId: params.toolId,
    userId: params.requesterId,
    workspaceId: params.workspaceId,
    parameters: params.parameters,
  });

  const candidateIds = params.suppliedApprovalIds ?? [];

  for (const id of candidateIds) {
    const record = approvalStore.get(id);
    if (!record) continue;

    if (record.workspaceId !== params.workspaceId || record.requesterId !== params.requesterId) {
      continue;
    }

    if (record.status === 'rejected') {
      throw new ApprovalRequiredError({
        approvalId: record.approvalId,
        action: params.action,
        toolId: params.toolId,
        reason: `Approval '${record.approvalId}' was rejected by '${record.approverId ?? 'approver'}'`,
      });
    }

    if (record.status === 'approved') {
      // Verify exact parameter hash binding
      if (record.parameterHash !== expectedHash) {
        record.status = 'invalidated';
        const replacement = createApprovalRequest({
          requesterId: params.requesterId,
          workspaceId: params.workspaceId,
          action: params.action,
          toolId: params.toolId,
          parameters: params.parameters,
        });
        throw new ApprovalRequiredError({
          approvalId: replacement.approvalId,
          action: params.action,
          toolId: params.toolId,
          reason: `Parameters changed materially after approval '${record.approvalId}'. A new approval '${replacement.approvalId}' is required.`,
        });
      }
      return record;
    }
  }

  // No matching approved record found -> create pending request and block execution
  const pending = createApprovalRequest({
    requesterId: params.requesterId,
    workspaceId: params.workspaceId,
    action: params.action,
    toolId: params.toolId,
    parameters: params.parameters,
  });

  throw new ApprovalRequiredError({
    approvalId: pending.approvalId,
    action: params.action,
    toolId: params.toolId,
    reason: 'Consequential action requires explicit human approval bound to these parameters.',
  });
}

