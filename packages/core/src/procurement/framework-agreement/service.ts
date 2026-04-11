/**
 * FrameworkAgreement service — entity-scoped CRUD with status transitions.
 *
 * Phase 5, Task 5.2 — Module 3 Procurement Engine.
 */
import { prisma, Prisma } from '@fmksa/db';
import type { CreateFrameworkAgreementInput, UpdateFrameworkAgreementInput, EntityListFilterInput } from '@fmksa/contracts';
import { auditService } from '../../audit/service';
import { FRAMEWORK_AGREEMENT_TRANSITIONS, FRAMEWORK_AGREEMENT_TERMINAL_STATUSES, ACTION_TO_STATUS } from './transitions';
import { nextAgreementNumber, EDITABLE_STATUSES } from './validation';

// ---------------------------------------------------------------------------
// Create (transaction-safe sequential code generation with P2002 retry)
// ---------------------------------------------------------------------------

export async function createFrameworkAgreement(input: CreateFrameworkAgreementInput, actorUserId: string) {
  const MAX_RETRIES = 1;
  let attempt = 0;

  const record = await (async () => {
    while (true) {
      try {
        return await prisma.$transaction(async (tx) => {
          const last = await (tx as any).frameworkAgreement.findFirst({
            orderBy: { agreementNumber: 'desc' },
            select: { agreementNumber: true },
          });
          const agreementNumber = nextAgreementNumber(last?.agreementNumber ?? null);

          return (tx as any).frameworkAgreement.create({
            data: {
              entityId: input.entityId,
              vendorId: input.vendorId,
              projectId: input.projectId ?? null,
              agreementNumber,
              title: input.title,
              description: input.description ?? null,
              validFrom: new Date(input.validFrom),
              validTo: new Date(input.validTo),
              currency: input.currency,
              totalCommittedValue: input.totalCommittedValue ?? null,
              status: 'draft',
              createdBy: actorUserId,
              ...(input.items && input.items.length > 0
                ? { items: { create: input.items.map((item) => ({
                    itemCatalogId: item.itemCatalogId ?? null,
                    itemDescription: item.itemDescription,
                    unit: item.unit,
                    agreedRate: item.agreedRate,
                    currency: item.currency,
                    minQuantity: item.minQuantity ?? null,
                    maxQuantity: item.maxQuantity ?? null,
                    notes: item.notes ?? null,
                  })) } }
                : {}),
            },
            include: { items: true },
          });
        });
      } catch (err: unknown) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          attempt < MAX_RETRIES
        ) {
          attempt++;
          continue;
        }
        throw err;
      }
    }
  })();

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'framework_agreement.create',
    resourceType: 'framework_agreement',
    resourceId: record.id,
    projectId: input.projectId ?? null,
    beforeJson: null,
    afterJson: record as any,
  });

  return record;
}

// ---------------------------------------------------------------------------
// Update (draft / returned only)
// ---------------------------------------------------------------------------

export async function updateFrameworkAgreement(input: UpdateFrameworkAgreementInput, actorUserId: string) {
  const existing = await prisma.frameworkAgreement.findUniqueOrThrow({
    where: { id: input.id },
    include: { items: true },
  });

  if (!EDITABLE_STATUSES.includes(existing.status)) {
    throw new Error(`Cannot update framework agreement in status '${existing.status}'. Only draft or returned agreements can be updated.`);
  }

  const { id, items, ...updateFields } = input;
  const data: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(updateFields)) {
    if (value === undefined) continue;
    if (key === 'validFrom' || key === 'validTo') {
      data[key] = new Date(value as string);
    } else {
      data[key] = value;
    }
  }

  // Replace items if provided
  if (items) {
    data.items = {
      deleteMany: {},
      create: items.map((item) => ({
        itemCatalogId: item.itemCatalogId ?? null,
        itemDescription: item.itemDescription,
        unit: item.unit,
        agreedRate: item.agreedRate,
        currency: item.currency,
        minQuantity: item.minQuantity ?? null,
        maxQuantity: item.maxQuantity ?? null,
        notes: item.notes ?? null,
      })),
    };
  }

  const updated = await prisma.frameworkAgreement.update({
    where: { id },
    data,
    include: { items: true },
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'framework_agreement.update',
    resourceType: 'framework_agreement',
    resourceId: id,
    projectId: existing.projectId ?? null,
    beforeJson: existing as any,
    afterJson: updated as any,
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Transition (audit-only on active — NO posting)
// ---------------------------------------------------------------------------

export async function transitionFrameworkAgreement(
  id: string,
  action: string,
  actorUserId: string,
  comment?: string,
) {
  const newStatus = ACTION_TO_STATUS[action];
  if (!newStatus) {
    throw new Error(`Unknown framework agreement action: '${action}'`);
  }

  const existing = await prisma.frameworkAgreement.findUniqueOrThrow({
    where: { id },
    include: { vendor: true },
  });

  // Terminal status check
  if (FRAMEWORK_AGREEMENT_TERMINAL_STATUSES.includes(existing.status)) {
    throw new Error(`Cannot transition framework agreement from terminal status '${existing.status}'.`);
  }

  // Transition validity check
  const allowed = FRAMEWORK_AGREEMENT_TRANSITIONS[existing.status];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(
      `Invalid framework agreement transition: '${existing.status}' -> '${newStatus}'. Allowed: [${(allowed ?? []).join(', ')}]`,
    );
  }

  const updated = await prisma.frameworkAgreement.update({
    where: { id },
    data: { status: newStatus },
    include: { vendor: true },
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: `framework_agreement.transition.${action}`,
    resourceType: 'framework_agreement',
    resourceId: id,
    projectId: existing.projectId ?? null,
    beforeJson: existing as any,
    afterJson: updated as any,
    reason: comment ?? null,
  });

  // On active: informational audit-only event (NO postingService.post())
  if (newStatus === 'active') {
    await auditService.log({
      actorUserId,
      actorSource: 'user',
      action: 'FRAMEWORK_AGREEMENT_ACTIVE',
      resourceType: 'framework_agreement',
      resourceId: existing.id,
      projectId: existing.projectId ?? null,
      beforeJson: existing as any,
      afterJson: updated as any,
    });
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Get
// ---------------------------------------------------------------------------

export async function getFrameworkAgreement(id: string) {
  return prisma.frameworkAgreement.findUniqueOrThrow({
    where: { id },
    include: { items: true, vendor: true },
  });
}

// ---------------------------------------------------------------------------
// List (entity-scoped + filters)
// ---------------------------------------------------------------------------

export async function listFrameworkAgreements(input: EntityListFilterInput) {
  const where: Record<string, unknown> = { entityId: input.entityId };

  if (input.statusFilter && input.statusFilter.length > 0) {
    where.status = { in: input.statusFilter };
  }

  if (input.vendorId) {
    where.vendorId = input.vendorId;
  }

  if (input.dateFrom || input.dateTo) {
    const createdAt: Record<string, unknown> = {};
    if (input.dateFrom) createdAt.gte = new Date(input.dateFrom);
    if (input.dateTo) createdAt.lte = new Date(input.dateTo);
    where.createdAt = createdAt;
  }

  if (input.createdByFilter) {
    where.createdBy = input.createdByFilter;
  }

  const orderBy: Record<string, string> = {};
  orderBy[input.sortField ?? 'createdAt'] = input.sortDirection ?? 'desc';

  const [items, total] = await Promise.all([
    prisma.frameworkAgreement.findMany({
      where,
      orderBy,
      skip: input.skip ?? 0,
      take: input.take ?? 20,
      include: { vendor: true, items: true },
    }),
    prisma.frameworkAgreement.count({ where }),
  ]);

  return { items, total };
}

// ---------------------------------------------------------------------------
// Delete (draft only — hard delete)
// ---------------------------------------------------------------------------

export async function deleteFrameworkAgreement(id: string, actorUserId: string) {
  const existing = await prisma.frameworkAgreement.findUniqueOrThrow({
    where: { id },
  });

  if (existing.status !== 'draft') {
    throw new Error(`Cannot delete framework agreement in status '${existing.status}'. Only draft agreements can be deleted.`);
  }

  // Delete child items first, then the agreement
  await prisma.$transaction(async (tx) => {
    await (tx as any).frameworkAgreementItem.deleteMany({
      where: { frameworkAgreementId: id },
    });
    await (tx as any).frameworkAgreement.delete({ where: { id } });
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'framework_agreement.delete',
    resourceType: 'framework_agreement',
    resourceId: id,
    projectId: existing.projectId ?? null,
    beforeJson: existing as any,
    afterJson: null,
  });
}

// ---------------------------------------------------------------------------
// Utilization tracking
// ---------------------------------------------------------------------------

export async function getUtilization(agreementId: string) {
  const agreement = await prisma.frameworkAgreement.findUniqueOrThrow({
    where: { id: agreementId },
    select: { id: true, totalCommittedValue: true },
  });

  // Sum PO totalAmounts that reference this framework agreement
  const result = await prisma.purchaseOrder.aggregate({
    where: { frameworkAgreementId: agreementId },
    _sum: { totalAmount: true },
  });

  const totalUtilized = result._sum.totalAmount ? Number(result._sum.totalAmount) : 0;
  const totalCommitted = agreement.totalCommittedValue ? Number(agreement.totalCommittedValue) : 0;
  const utilizationPercentage = totalCommitted > 0
    ? Math.round((totalUtilized / totalCommitted) * 10000) / 100
    : 0;

  return {
    totalUtilized,
    totalCommitted,
    utilizationPercentage,
  };
}
