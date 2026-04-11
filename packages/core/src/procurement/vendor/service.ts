/**
 * Vendor service — entity-scoped CRUD with status transitions (no workflow).
 *
 * Phase 4, Task 4.3 — Module 3 Procurement Engine.
 */
import { prisma, Prisma } from '@fmksa/db';
import type { CreateVendorInput, UpdateVendorInput, EntityListFilterInput } from '@fmksa/contracts';
import { auditService } from '../../audit/service';
import { VENDOR_TRANSITIONS, VENDOR_TERMINAL_STATUSES, ACTION_TO_STATUS } from './transitions';
import { nextVendorCode, EDITABLE_STATUSES } from './validation';

// ---------------------------------------------------------------------------
// Create (transaction-safe sequential code generation with P2002 retry)
// ---------------------------------------------------------------------------

export async function createVendor(input: CreateVendorInput, actorUserId: string) {
  const MAX_RETRIES = 1;
  let attempt = 0;

  const vendor = await (async () => {
    while (true) {
      try {
        return await prisma.$transaction(async (tx) => {
          const last = await (tx as any).vendor.findFirst({
            where: { entityId: input.entityId },
            orderBy: { vendorCode: 'desc' },
            select: { vendorCode: true },
          });
          const vendorCode = nextVendorCode(last?.vendorCode ?? null);

          return (tx as any).vendor.create({
            data: {
              entityId: input.entityId,
              vendorCode,
              name: input.name,
              tradeName: input.tradeName ?? null,
              registrationNumber: input.registrationNumber ?? null,
              taxId: input.taxId ?? null,
              contactName: input.contactName ?? null,
              contactEmail: input.contactEmail ?? null,
              contactPhone: input.contactPhone ?? null,
              address: input.address ?? null,
              city: input.city ?? null,
              country: input.country ?? null,
              classification: input.classificationId ?? null,
              status: 'draft',
              notes: input.notes ?? null,
              createdBy: actorUserId,
            },
          });
        });
      } catch (err: unknown) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          attempt < MAX_RETRIES
        ) {
          attempt++;
          continue; // retry with fresh sequence number
        }
        throw err;
      }
    }
  })();

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'vendor.create',
    resourceType: 'vendor',
    resourceId: vendor.id,
    beforeJson: null,
    afterJson: vendor as any,
  });

  return vendor;
}

// ---------------------------------------------------------------------------
// Update (draft / active only)
// ---------------------------------------------------------------------------

export async function updateVendor(input: UpdateVendorInput, actorUserId: string) {
  const existing = await prisma.vendor.findUniqueOrThrow({
    where: { id: input.id },
  });

  if (!EDITABLE_STATUSES.includes(existing.status)) {
    throw new Error(`Cannot update vendor in status '${existing.status}'. Only draft or active vendors can be updated.`);
  }

  const { id, ...updateFields } = input;
  const data: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(updateFields)) {
    if (value === undefined) continue;
    // Map classificationId → classification column
    if (key === 'classificationId') {
      data.classification = value;
    } else {
      data[key] = value;
    }
  }

  const updated = await prisma.vendor.update({
    where: { id },
    data,
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'vendor.update',
    resourceType: 'vendor',
    resourceId: id,
    beforeJson: existing as any,
    afterJson: updated as any,
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Transition (no workflow — direct status map)
// ---------------------------------------------------------------------------

export async function transitionVendor(
  id: string,
  action: string,
  actorUserId: string,
  comment?: string,
) {
  const newStatus = ACTION_TO_STATUS[action];
  if (!newStatus) {
    throw new Error(`Unknown vendor action: '${action}'`);
  }

  const existing = await prisma.vendor.findUniqueOrThrow({
    where: { id },
  });

  // Terminal status check
  if (VENDOR_TERMINAL_STATUSES.includes(existing.status)) {
    throw new Error(`Cannot transition vendor from terminal status '${existing.status}'.`);
  }

  // Transition validity check
  const allowed = VENDOR_TRANSITIONS[existing.status];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(
      `Invalid vendor transition: '${existing.status}' → '${newStatus}'. Allowed: [${(allowed ?? []).join(', ')}]`,
    );
  }

  const updated = await prisma.vendor.update({
    where: { id },
    data: { status: newStatus },
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: `vendor.transition.${action}`,
    resourceType: 'vendor',
    resourceId: id,
    beforeJson: existing as any,
    afterJson: updated as any,
    reason: comment ?? null,
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Get
// ---------------------------------------------------------------------------

export async function getVendor(id: string) {
  return prisma.vendor.findUniqueOrThrow({
    where: { id },
    include: { projectVendors: true, entity: true },
  });
}

// ---------------------------------------------------------------------------
// List (paginated + filters)
// ---------------------------------------------------------------------------

export async function listVendors(input: EntityListFilterInput & { search?: string | undefined; classificationFilter?: string | undefined }) {
  const where: Record<string, unknown> = { entityId: input.entityId };

  if (input.statusFilter && input.statusFilter.length > 0) {
    where.status = { in: input.statusFilter };
  }

  if (input.classificationFilter) {
    where.classification = input.classificationFilter;
  }

  if (input.search) {
    where.OR = [
      { name: { contains: input.search, mode: 'insensitive' } },
      { vendorCode: { contains: input.search, mode: 'insensitive' } },
    ];
  }

  if (input.dateFrom || input.dateTo) {
    const createdAt: Record<string, unknown> = {};
    if (input.dateFrom) createdAt.gte = new Date(input.dateFrom);
    if (input.dateTo) createdAt.lte = new Date(input.dateTo);
    where.createdAt = createdAt;
  }

  const orderBy: Record<string, string> = {};
  orderBy[input.sortField ?? 'createdAt'] = input.sortDirection ?? 'desc';

  const [items, total] = await Promise.all([
    prisma.vendor.findMany({
      where,
      orderBy,
      skip: input.skip ?? 0,
      take: input.take ?? 20,
      include: { entity: true },
    }),
    prisma.vendor.count({ where }),
  ]);

  return { items, total };
}

// ---------------------------------------------------------------------------
// Delete (draft only — hard delete)
// ---------------------------------------------------------------------------

export async function deleteVendor(id: string, actorUserId: string) {
  const existing = await prisma.vendor.findUniqueOrThrow({
    where: { id },
  });

  if (existing.status !== 'draft') {
    throw new Error(`Cannot delete vendor in status '${existing.status}'. Only draft vendors can be deleted.`);
  }

  await prisma.vendor.delete({ where: { id } });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'vendor.delete',
    resourceType: 'vendor',
    resourceId: id,
    beforeJson: existing as any,
    afterJson: null,
  });
}
