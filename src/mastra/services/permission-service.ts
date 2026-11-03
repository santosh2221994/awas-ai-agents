/**
 * services/permission-service.ts
 *
 * Least-privilege permission scope resolution and enforcement.
 * Permissions are always resolved from the authenticated principal/workspace
 * context — never from untrusted model-generated tool arguments.
 */

export const PERMISSION_SCOPES = [
  'files:read',
  'files:write',
  'calendar:read',
  'calendar:write',
  'email:read',
  'email:draft',
  'email:send',
  'tasks:read',
  'tasks:write',
  'crm:read',
  'crm:write',
  'production:read',
  'production:write',
  'finance:read',
  'finance:write',
  'campaigns:read',
  'campaigns:launch',
  'knowledge:search',
  'project:read',
  'project:write',
  'approvals:read',
  'approvals:write',
  'data:read',
] as const;

export type PermissionScope = (typeof PERMISSION_SCOPES)[number] | string;

export const DEFAULT_READ_ONLY_SCOPES: PermissionScope[] = [
  'files:read',
  'calendar:read',
  'email:read',
  'tasks:read',
  'crm:read',
  'production:read',
  'finance:read',
  'campaigns:read',
  'knowledge:search',
  'project:read',
  'approvals:read',
  'data:read',
];

const DEFAULT_READ_ONLY_SET = new Set<string>(DEFAULT_READ_ONLY_SCOPES);

export interface PrincipalPermissionContext {
  userId: string;
  workspaceId: string;
  projectId?: string;
  grantedScopes: string[];
  approvalIds: string[];
}

export class PermissionDeniedError extends Error {
  public readonly code = 'PERMISSION_DENIED';
  public readonly missingScopes: string[];
  public readonly userId: string;
  public readonly workspaceId: string;

  constructor(params: {
    userId: string;
    workspaceId: string;
    missingScopes: string[];
    operation?: string;
  }) {
    super(
      `Permission denied${params.operation ? ` for '${params.operation}'` : ''}: principal '${params.userId}' in workspace '${params.workspaceId}' lacks required scope(s): ${params.missingScopes.join(', ')}`
    );
    this.name = 'PermissionDeniedError';
    this.missingScopes = params.missingScopes;
    this.userId = params.userId;
    this.workspaceId = params.workspaceId;
  }
}

// Server-side authoritative store for principal/workspace permissions (bounded with FIFO eviction)
const MAX_PRINCIPAL_ENTRIES = 5000;
const principalScopeStore = new Map<string, Set<string>>();

function principalKey(userId: string, workspaceId: string): string {
  return `${userId}::${workspaceId}`;
}

export function setPrincipalScopes(
  userId: string,
  workspaceId: string,
  scopes: string[]
): void {
  const key = principalKey(userId, workspaceId);
  if (principalScopeStore.size >= MAX_PRINCIPAL_ENTRIES && !principalScopeStore.has(key)) {
    const oldestKey = principalScopeStore.keys().next().value;
    if (oldestKey) principalScopeStore.delete(oldestKey);
  }
  principalScopeStore.set(key, new Set(scopes));
}

export function getPrincipalScopes(
  userId: string,
  workspaceId: string
): string[] | undefined {
  const set = principalScopeStore.get(principalKey(userId, workspaceId));
  return set ? Array.from(set) : undefined;
}

export function clearPrincipalScopes(): void {
  principalScopeStore.clear();
}

/**
 * Extracts a trusted value from Mastra RequestContext (Map or plain object),
 * explicitly ignoring any `inputData` or model-supplied payload fields.
 */
function readContextField(reqCtx: any, key: string): any {
  if (!reqCtx) return undefined;
  if (typeof reqCtx.get === 'function') {
    try {
      const val = reqCtx.get(key);
      if (val !== undefined) return val;
    } catch {}
  }
  if (typeof reqCtx === 'object' && key in reqCtx) {
    return reqCtx[key];
  }
  return undefined;
}

/**
 * Resolves the effective permissions for a request from the trusted execution context
 * or server-side principal store. Never trusts `permissionContext` passed inside
 * model-generated tool arguments (`inputData`).
 */
export function resolvePrincipalPermissions(executionContext?: any): PrincipalPermissionContext {
  const reqCtx =
    executionContext?.requestContext ??
    (typeof executionContext?.get === 'function' ? executionContext : undefined) ??
    executionContext?.trustedContext ??
    executionContext;

  const userId = String(
    readContextField(reqCtx, 'user-id') ??
      readContextField(reqCtx, 'userId') ??
      'anonymous'
  );
  const workspaceId = String(
    readContextField(reqCtx, 'workspace-id') ??
      readContextField(reqCtx, 'tenant-id') ??
      readContextField(reqCtx, 'workspaceId') ??
      'default-workspace'
  );
  const projectIdRaw =
    readContextField(reqCtx, 'project-id') ?? readContextField(reqCtx, 'projectId');
  const projectId = projectIdRaw ? String(projectIdRaw) : undefined;

  // 1. Check server-side principal store first
  const storedScopes = getPrincipalScopes(userId, workspaceId);

  // 2. Check trusted context scopes (injected by gateway middleware or verified task runner)
  const rawScopes =
    readContextField(reqCtx, 'granted-scopes') ??
    readContextField(reqCtx, 'grantedScopes') ??
    readContextField(reqCtx, 'trustedPermissionContext')?.grantedScopes;

  let grantedScopes: string[];
  if (storedScopes) {
    grantedScopes = storedScopes;
  } else if (Array.isArray(rawScopes)) {
    grantedScopes = rawScopes.map(String);
  } else if (typeof rawScopes === 'string' && rawScopes.trim().length > 0) {
    grantedScopes = rawScopes
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  } else {
    // Least-privilege default: read-only scopes only; all write/launch/send scopes require explicit grant
    grantedScopes = DEFAULT_READ_ONLY_SCOPES as string[];
  }

  const rawApprovals =
    readContextField(reqCtx, 'approval-ids') ??
    readContextField(reqCtx, 'approvalIds');
  const approvalIds: string[] = Array.isArray(rawApprovals)
    ? rawApprovals.map(String)
    : typeof rawApprovals === 'string' && rawApprovals.trim().length > 0
      ? rawApprovals.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

  return {
    userId,
    workspaceId,
    projectId,
    grantedScopes,
    approvalIds,
  };
}

export function hasRequiredScopes(
  principal: PrincipalPermissionContext,
  requiredScopes: string[]
): { allowed: boolean; missingScopes: string[] } {
  if (!requiredScopes || requiredScopes.length === 0) {
    return { allowed: true, missingScopes: [] };
  }
  const grantedSet =
    principal.grantedScopes === (DEFAULT_READ_ONLY_SCOPES as any)
      ? DEFAULT_READ_ONLY_SET
      : new Set(principal.grantedScopes);
  const missingScopes = requiredScopes.filter((scope) => !grantedSet.has(scope));
  return {
    allowed: missingScopes.length === 0,
    missingScopes,
  };
}

export function assertRequiredScopes(
  principal: PrincipalPermissionContext,
  requiredScopes: string[],
  operation?: string
): void {
  const { allowed, missingScopes } = hasRequiredScopes(principal, requiredScopes);
  if (!allowed) {
    throw new PermissionDeniedError({
      userId: principal.userId,
      workspaceId: principal.workspaceId,
      missingScopes,
      operation,
    });
  }
}

