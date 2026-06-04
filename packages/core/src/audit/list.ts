/**
 * Audit log query functions — Phase 1.9
 *
 * listAuditLogs()  — paginated, filterable audit log list
 * getAuditLog()    — single entry with full JSON
 *
 * PIC-98 PR-3c (F4) — every function takes `expectedOrgId: string | null`:
 *   - string (non-null): caller is tenant_admin or other non-platform role.
 *     Scope reads to this org via AuditLog.orgId (F2 PIC-96 direct column,
 *     guard-visible). NOT_FOUND-shaped on cross-org by-id.
 *   - null: caller is platform_admin (isPlatformAdmin(ctx) = true). Cross-org
 *     bypass — F3 D3 survives by construction.
 */
import { prisma } from '@fmksa/db';
import { assertOrgScope } from '../scope-binding';

export type AuditLogFilters = {
  action?: string | undefined;
  resourceType?: string | undefined;
  actorSource?: string | undefined;
  actorUserId?: string | undefined;
  projectId?: string | undefined;
  dateFrom?: Date | undefined;
  dateTo?: Date | undefined;
  skip?: number | undefined;
  take?: number | undefined;
};

export type AuditLogListItem = {
  id: string;
  actorUserId: string | null;
  actorSource: string;
  action: string;
  resourceType: string;
  resourceId: string;
  projectId: string | null;
  createdAt: Date;
  actorName?: string | null;
};

export async function listAuditLogs(
  filters: AuditLogFilters & { expectedOrgId: string | null } = {
    expectedOrgId: null,
  },
) {
  const {
    expectedOrgId,
    action,
    resourceType,
    actorSource,
    actorUserId,
    projectId,
    dateFrom,
    dateTo,
    skip = 0,
    take = 25,
  } = filters;

  const where: Record<string, unknown> = {};

  // PR-3c: scope to caller's org unless platform-admin bypass.
  if (expectedOrgId !== null) {
    where['orgId'] = expectedOrgId;
  }

  if (action) where['action'] = { contains: action, mode: 'insensitive' };
  if (resourceType) where['resourceType'] = resourceType;
  if (actorSource) where['actorSource'] = actorSource;
  if (actorUserId) where['actorUserId'] = actorUserId;
  if (projectId) where['projectId'] = projectId;
  if (dateFrom || dateTo) {
    const createdAt: Record<string, Date> = {};
    if (dateFrom) createdAt['gte'] = dateFrom;
    if (dateTo) createdAt['lte'] = dateTo;
    where['createdAt'] = createdAt;
  }

  const [rawItems, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: where as any,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        actorUserId: true,
        actorSource: true,
        action: true,
        resourceType: true,
        resourceId: true,
        projectId: true,
        createdAt: true,
      },
    }),
    prisma.auditLog.count({ where: where as any }),
  ]);

  // Resolve actor user IDs → names in a single batch query
  const actorIds = [...new Set(rawItems.map((i) => i.actorUserId).filter(Boolean))] as string[];
  const actorMap = new Map<string, string>();
  if (actorIds.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, name: true },
    });
    for (const u of users) actorMap.set(u.id, u.name);
  }

  const items = rawItems.map((i) => ({
    ...i,
    actorName: i.actorUserId ? actorMap.get(i.actorUserId) ?? null : null,
  }));

  return { items, total };
}

/**
 * Get a single audit log entry.
 *
 * PR-3c: expectedOrgId for cross-org NOT_FOUND-shaped denial via direct
 * AuditLog.orgId (F2 PIC-96). assertOrgScope keeps the guard green at
 * the service layer — F4_DEFERRED exemption lifted in PR-3c.
 */
export async function getAuditLog(id: string, expectedOrgId: string | null) {
  const entry = await prisma.auditLog.findUnique({ where: { id } });
  if (!entry) return null;

  // PR-3c cross-org NOT-FOUND-shaped denial.
  if (expectedOrgId !== null) {
    assertOrgScope(entry, expectedOrgId, 'AuditLog', id);
  }

  return entry;
}
