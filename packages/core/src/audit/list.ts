/**
 * Audit log query functions — Phase 1.9
 *
 * listAuditLogs()  — paginated, filterable audit log list
 * getAuditLog()    — single entry with full JSON
 */
import { prisma } from '@fmksa/db';

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

export async function listAuditLogs(filters: AuditLogFilters = {}) {
  const {
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

export async function getAuditLog(id: string) {
  return prisma.auditLog.findUnique({ where: { id } });
}
