/**
 * Override log query functions — Phase 1.9
 *
 * listOverrideLogs()  — paginated, filterable override log list
 * getOverrideLog()    — single entry with related audit log
 */
import { prisma } from '@fmksa/db';

export type OverrideLogFilters = {
  overrideType?: string | undefined;
  overriderUserId?: string | undefined;
  dateFrom?: Date | undefined;
  dateTo?: Date | undefined;
  skip?: number | undefined;
  take?: number | undefined;
};

export async function listOverrideLogs(filters: OverrideLogFilters = {}) {
  const {
    overrideType,
    overriderUserId,
    dateFrom,
    dateTo,
    skip = 0,
    take = 25,
  } = filters;

  const where: Record<string, unknown> = {};

  if (overrideType) where['overrideType'] = overrideType;
  if (overriderUserId) where['overriderUserId'] = overriderUserId;
  if (dateFrom || dateTo) {
    const createdAt: Record<string, Date> = {};
    if (dateFrom) createdAt['gte'] = dateFrom;
    if (dateTo) createdAt['lte'] = dateTo;
    where['createdAt'] = createdAt;
  }

  const [items, total] = await Promise.all([
    (prisma as any).overrideLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: { auditLog: { select: { action: true, resourceType: true, resourceId: true } } },
    }),
    (prisma as any).overrideLog.count({ where }),
  ]);

  return { items, total };
}

export async function getOverrideLog(id: string) {
  return (prisma as any).overrideLog.findUnique({
    where: { id },
    include: { auditLog: true },
  });
}
