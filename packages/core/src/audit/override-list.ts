/**
 * Override log query functions — Phase 1.9
 *
 * listOverrideLogs()  — paginated, filterable override log list
 * getOverrideLog()    — single entry with related audit log
 *
 * PIC-98 PR-3c (F4) — every function takes `expectedOrgId: string | null`:
 *   - string (non-null): caller is tenant_admin or other non-platform role.
 *     Scope reads to this org via OverrideLog.orgId (PR-2 denormalized
 *     direct column — guard-visible, NOT a JOIN). NOT_FOUND-shaped on
 *     cross-org by-id.
 *   - null: caller is platform_admin (isPlatformAdmin(ctx) = true). Cross-org
 *     bypass — F3 D3 survives by construction.
 *
 * The denormalized OverrideLog.orgId (PR-2 migration
 * 20260603130100_pic98_pr2_add_overridelog_orgid) is the reason this
 * lift is possible — see SR-Multi-Tenancy + the PR-2 migration SQL header
 * for the binding rationale.
 */
import { prisma } from '@fmksa/db';
import { assertOrgScope } from '../scope-binding';

export type OverrideLogFilters = {
  overrideType?: string | undefined;
  overriderUserId?: string | undefined;
  dateFrom?: Date | undefined;
  dateTo?: Date | undefined;
  skip?: number | undefined;
  take?: number | undefined;
};

export async function listOverrideLogs(
  filters: OverrideLogFilters & { expectedOrgId: string | null } = {
    expectedOrgId: null,
  },
) {
  const {
    expectedOrgId,
    overrideType,
    overriderUserId,
    dateFrom,
    dateTo,
    skip = 0,
    take = 25,
  } = filters;

  const where: Record<string, unknown> = {};

  // PR-3c: scope to caller's org via direct denormalized column.
  if (expectedOrgId !== null) {
    where['orgId'] = expectedOrgId;
  }

  if (overrideType) where['overrideType'] = overrideType;
  if (overriderUserId) where['overriderUserId'] = overriderUserId;
  if (dateFrom || dateTo) {
    const createdAt: Record<string, Date> = {};
    if (dateFrom) createdAt['gte'] = dateFrom;
    if (dateTo) createdAt['lte'] = dateTo;
    where['createdAt'] = createdAt;
  }

  const [items, total] = await Promise.all([
    prisma.overrideLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: { auditLog: { select: { action: true, resourceType: true, resourceId: true } } },
    }),
    prisma.overrideLog.count({ where }),
  ]);

  return { items, total };
}

/**
 * Get a single override log entry (with related audit log).
 *
 * PR-3c: expectedOrgId for cross-org NOT_FOUND-shaped denial via direct
 * OverrideLog.orgId (PR-2 denorm). assertOrgScope keeps the guard green
 * at the service layer — F4_DEFERRED exemption lifted in PR-3c.
 */
export async function getOverrideLog(id: string, expectedOrgId: string | null) {
  const entry = await prisma.overrideLog.findUnique({
    where: { id },
    include: { auditLog: true },
  });
  if (!entry) return null;

  // PR-3c cross-org NOT-FOUND-shaped denial.
  if (expectedOrgId !== null) {
    assertOrgScope(entry, expectedOrgId, 'OverrideLog', id);
  }

  return entry;
}
