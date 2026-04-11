/**
 * RFQ service — project-scoped CRUD with status transitions.
 *
 * Phase 5, Task 5.3 — Module 3 Procurement Engine.
 */
import { prisma, Prisma } from '@fmksa/db';
import type { CreateRfqInput, UpdateRfqInput, ProcurementListFilterInput } from '@fmksa/contracts';
import { auditService } from '../../audit/service';
import { RFQ_TRANSITIONS, RFQ_TERMINAL_STATUSES, ACTION_TO_STATUS } from './transitions';
import { nextRfqNumber, nextRfqReferenceNumber, EDITABLE_STATUSES } from './validation';

// ---------------------------------------------------------------------------
// Create (transaction-safe sequential code generation with P2002 retry)
// ---------------------------------------------------------------------------

export async function createRfq(input: CreateRfqInput, actorUserId: string) {
  const MAX_RETRIES = 1;
  let attempt = 0;

  const record = await (async () => {
    while (true) {
      try {
        return await prisma.$transaction(async (tx) => {
          const last = await (tx as any).rFQ.findFirst({
            orderBy: { rfqNumber: 'desc' },
            select: { rfqNumber: true },
          });
          const rfqNumber = nextRfqNumber(last?.rfqNumber ?? null);

          const rfq = await (tx as any).rFQ.create({
            data: {
              projectId: input.projectId,
              rfqNumber,
              title: input.title,
              description: input.description ?? null,
              requiredByDate: input.deadline ? new Date(input.deadline) : null,
              categoryId: input.categoryId ?? null,
              currency: input.currency,
              estimatedBudget: input.estimatedBudget ?? null,
              status: 'draft',
              createdBy: actorUserId,
              ...(input.items && input.items.length > 0
                ? { items: { create: input.items.map((item) => ({
                    itemCatalogId: item.itemCatalogId ?? null,
                    itemDescription: item.itemDescription,
                    quantity: item.quantity,
                    unit: item.unit,
                    estimatedUnitPrice: item.estimatedUnitPrice ?? null,
                  })) } }
                : {}),
              ...(input.invitedVendorIds && input.invitedVendorIds.length > 0
                ? { rfqVendors: { create: input.invitedVendorIds.map((vendorId) => ({
                    vendorId,
                  })) } }
                : {}),
            },
            include: { items: true, rfqVendors: true },
          });

          return rfq;
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
    action: 'rfq.create',
    resourceType: 'rfq',
    resourceId: record.id,
    projectId: input.projectId,
    beforeJson: null,
    afterJson: record as any,
  });

  return record;
}

// ---------------------------------------------------------------------------
// Update (draft / returned only)
// ---------------------------------------------------------------------------

export async function updateRfq(input: UpdateRfqInput, actorUserId: string) {
  const existing = await prisma.rFQ.findUniqueOrThrow({
    where: { id: input.id },
    include: { items: true },
  });

  if (!EDITABLE_STATUSES.includes(existing.status)) {
    throw new Error(`Cannot update RFQ in status '${existing.status}'. Only draft or returned RFQs can be updated.`);
  }

  const { id, items, invitedVendorIds, ...updateFields } = input;
  const data: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(updateFields)) {
    if (value === undefined) continue;
    if (key === 'deadline') {
      data.requiredByDate = new Date(value as string);
    } else if (key === 'deliveryDate') {
      data[key] = value ? new Date(value as string) : null;
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
        quantity: item.quantity,
        unit: item.unit,
        estimatedUnitPrice: item.estimatedUnitPrice ?? null,
      })),
    };
  }

  // Replace invited vendors if provided
  if (invitedVendorIds) {
    data.rfqVendors = {
      deleteMany: {},
      create: invitedVendorIds.map((vendorId) => ({ vendorId })),
    };
  }

  const updated = await prisma.rFQ.update({
    where: { id },
    data,
    include: { items: true },
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'rfq.update',
    resourceType: 'rfq',
    resourceId: id,
    projectId: existing.projectId,
    beforeJson: existing as any,
    afterJson: updated as any,
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Transition (no posting events for RFQ)
// ---------------------------------------------------------------------------

export async function transitionRfq(
  id: string,
  action: string,
  actorUserId: string,
  comment?: string,
) {
  const newStatus = ACTION_TO_STATUS[action];
  if (!newStatus) {
    throw new Error(`Unknown RFQ action: '${action}'`);
  }

  const existing = await prisma.rFQ.findUniqueOrThrow({
    where: { id },
    include: { project: true },
  });

  // Terminal status check
  if (RFQ_TERMINAL_STATUSES.includes(existing.status)) {
    throw new Error(`Cannot transition RFQ from terminal status '${existing.status}'.`);
  }

  // Transition validity check
  const allowed = RFQ_TRANSITIONS[existing.status];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(
      `Invalid RFQ transition: '${existing.status}' -> '${newStatus}'. Allowed: [${(allowed ?? []).join(', ')}]`,
    );
  }

  // On issued transition: assign referenceNumber in a transaction
  if (newStatus === 'issued') {
    const updated = await prisma.$transaction(async (tx) => {
      const lastRef = await (tx as any).rFQ.findFirst({
        where: { projectId: existing.projectId, referenceNumber: { not: null } },
        orderBy: { referenceNumber: 'desc' },
        select: { referenceNumber: true },
      });
      const referenceNumber = nextRfqReferenceNumber(lastRef?.referenceNumber ?? null);

      return (tx as any).rFQ.update({
        where: { id },
        data: { status: newStatus, referenceNumber },
        include: { project: true },
      });
    });

    await auditService.log({
      actorUserId,
      actorSource: 'user',
      action: `rfq.transition.${action}`,
      resourceType: 'rfq',
      resourceId: id,
      projectId: existing.projectId,
      beforeJson: existing as any,
      afterJson: updated as any,
      reason: comment ?? null,
    });

    return updated;
  }

  // Simple status update
  const updated = await prisma.rFQ.update({
    where: { id },
    data: { status: newStatus },
    include: { project: true },
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: `rfq.transition.${action}`,
    resourceType: 'rfq',
    resourceId: id,
    projectId: existing.projectId,
    beforeJson: existing as any,
    afterJson: updated as any,
    reason: comment ?? null,
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Get
// ---------------------------------------------------------------------------

export async function getRfq(id: string) {
  return prisma.rFQ.findUniqueOrThrow({
    where: { id },
    include: { items: true, rfqVendors: { include: { vendor: true } }, quotations: true },
  });
}

// ---------------------------------------------------------------------------
// List (paginated + filters)
// ---------------------------------------------------------------------------

export async function listRfqs(input: ProcurementListFilterInput) {
  const where: Record<string, unknown> = { projectId: input.projectId };

  if (input.statusFilter && input.statusFilter.length > 0) {
    where.status = { in: input.statusFilter };
  }

  if (input.categoryId) {
    where.categoryId = input.categoryId;
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
    prisma.rFQ.findMany({
      where,
      orderBy,
      skip: input.skip ?? 0,
      take: input.take ?? 20,
      include: { items: true, rfqVendors: { include: { vendor: true } } },
    }),
    prisma.rFQ.count({ where }),
  ]);

  return { items, total };
}

// ---------------------------------------------------------------------------
// Delete (draft only — hard delete)
// ---------------------------------------------------------------------------

export async function deleteRfq(id: string, actorUserId: string) {
  const existing = await prisma.rFQ.findUniqueOrThrow({
    where: { id },
  });

  if (existing.status !== 'draft') {
    throw new Error(`Cannot delete RFQ in status '${existing.status}'. Only draft RFQs can be deleted.`);
  }

  await prisma.$transaction(async (tx) => {
    await (tx as any).rFQItem.deleteMany({ where: { rfqId: id } });
    await (tx as any).rFQVendor.deleteMany({ where: { rfqId: id } });
    await (tx as any).rFQ.delete({ where: { id } });
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'rfq.delete',
    resourceType: 'rfq',
    resourceId: id,
    projectId: existing.projectId,
    beforeJson: existing as any,
    afterJson: null,
  });
}

// ---------------------------------------------------------------------------
// Invite vendors
// ---------------------------------------------------------------------------

export async function inviteVendors(rfqId: string, vendorIds: string[], actorUserId: string) {
  const rfq = await prisma.rFQ.findUniqueOrThrow({
    where: { id: rfqId },
  });

  // Allow invitations when issued or before
  const allowedStatuses = ['draft', 'under_review', 'approved_internal', 'issued'];
  if (!allowedStatuses.includes(rfq.status)) {
    throw new Error(`Cannot invite vendors to RFQ in status '${rfq.status}'.`);
  }

  const records = await prisma.$transaction(
    vendorIds.map((vendorId) =>
      prisma.rFQVendor.upsert({
        where: { rfqId_vendorId: { rfqId, vendorId } },
        update: {},
        create: { rfqId, vendorId },
      }),
    ),
  );

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'rfq.invite_vendors',
    resourceType: 'rfq',
    resourceId: rfqId,
    projectId: rfq.projectId,
    beforeJson: null,
    afterJson: { vendorIds } as any,
  });

  return records;
}
