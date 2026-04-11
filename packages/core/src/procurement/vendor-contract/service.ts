/**
 * VendorContract service — project-scoped CRUD with status transitions + posting.
 *
 * Phase 5, Task 5.1 — Module 3 Procurement Engine.
 */
import { prisma, Prisma } from '@fmksa/db';
import type { CreateVendorContractInput, UpdateVendorContractInput, ProcurementListFilterInput } from '@fmksa/contracts';
import { auditService } from '../../audit/service';
import { postingService } from '../../posting/service';
import { VENDOR_CONTRACT_TRANSITIONS, VENDOR_CONTRACT_TERMINAL_STATUSES, ACTION_TO_STATUS } from './transitions';
import { nextContractNumber, EDITABLE_STATUSES } from './validation';
import { assertProjectScope } from '../../scope-binding';

// ---------------------------------------------------------------------------
// Create (transaction-safe sequential code generation with P2002 retry)
// ---------------------------------------------------------------------------

export async function createVendorContract(input: CreateVendorContractInput, actorUserId: string) {
  const MAX_RETRIES = 1;
  let attempt = 0;

  const record = await (async () => {
    while (true) {
      try {
        return await prisma.$transaction(async (tx) => {
          const last = await (tx as any).vendorContract.findFirst({
            orderBy: { contractNumber: 'desc' },
            select: { contractNumber: true },
          });
          const contractNumber = nextContractNumber(last?.contractNumber ?? null);

          return (tx as any).vendorContract.create({
            data: {
              projectId: input.projectId!,
              vendorId: input.vendorId,
              contractNumber,
              title: input.title,
              description: input.description ?? null,
              contractType: input.contractType,
              startDate: new Date(input.startDate),
              endDate: new Date(input.endDate),
              totalValue: input.totalValue,
              currency: input.currency,
              terms: input.paymentTerms ?? null,
              parentContractId: input.parentContractId ?? null,
              status: 'draft',
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
          continue;
        }
        throw err;
      }
    }
  })();

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'vendor_contract.create',
    resourceType: 'vendor_contract',
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

export async function updateVendorContract(input: UpdateVendorContractInput, actorUserId: string, projectId: string) {
  const existing = await prisma.vendorContract.findUniqueOrThrow({
    where: { id: input.id },
  });
  assertProjectScope(existing, projectId, 'VendorContract', input.id);

  if (!EDITABLE_STATUSES.includes(existing.status)) {
    throw new Error(`Cannot update vendor contract in status '${existing.status}'. Only draft or returned contracts can be updated.`);
  }

  const { id, ...updateFields } = input;
  const data: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(updateFields)) {
    if (value === undefined) continue;
    if (key === 'startDate' || key === 'endDate') {
      data[key] = new Date(value as string);
    } else if (key === 'paymentTerms') {
      data.terms = value;
    } else {
      data[key] = value;
    }
  }

  const updated = await prisma.vendorContract.update({
    where: { id },
    data,
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'vendor_contract.update',
    resourceType: 'vendor_contract',
    resourceId: id,
    projectId: existing.projectId,
    beforeJson: existing as any,
    afterJson: updated as any,
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Transition
// ---------------------------------------------------------------------------

export async function transitionVendorContract(
  id: string,
  action: string,
  actorUserId: string,
  comment?: string,
  projectId?: string,
) {
  const newStatus = ACTION_TO_STATUS[action];
  if (!newStatus) {
    throw new Error(`Unknown vendor contract action: '${action}'`);
  }

  const existing = await prisma.vendorContract.findUniqueOrThrow({
    where: { id },
    include: { project: true },
  });
  if (projectId) assertProjectScope(existing, projectId, 'VendorContract', id);

  // Terminal status check
  if (VENDOR_CONTRACT_TERMINAL_STATUSES.includes(existing.status)) {
    throw new Error(`Cannot transition vendor contract from terminal status '${existing.status}'.`);
  }

  // Transition validity check
  const allowed = VENDOR_CONTRACT_TRANSITIONS[existing.status];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(
      `Invalid vendor contract transition: '${existing.status}' -> '${newStatus}'. Allowed: [${(allowed ?? []).join(', ')}]`,
    );
  }

  // Build update data — set signedDate on signed transition
  const updateData: Record<string, unknown> = { status: newStatus };
  if (newStatus === 'signed') {
    updateData.signedDate = new Date();
  }

  const updated = await prisma.vendorContract.update({
    where: { id },
    data: updateData,
    include: { project: true },
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: `vendor_contract.transition.${action}`,
    resourceType: 'vendor_contract',
    resourceId: id,
    projectId: existing.projectId,
    beforeJson: existing as any,
    afterJson: updated as any,
    reason: comment ?? null,
  });

  // Fire posting event OUTSIDE the transaction on signed
  if (newStatus === 'signed') {
    await postingService.post({
      eventType: 'VENDOR_CONTRACT_SIGNED',
      sourceService: 'procurement',
      sourceRecordType: 'vendor_contract',
      sourceRecordId: existing.id,
      projectId: existing.projectId,
      entityId: existing.project.entityId,
      idempotencyKey: `vendor_contract:${existing.id}:signed`,
      payload: {
        vendorContractId: existing.id,
        contractNumber: existing.contractNumber,
        vendorId: existing.vendorId,
        totalValue: existing.totalValue.toString(),
        currency: existing.currency,
        startDate: existing.startDate.toISOString(),
        endDate: existing.endDate.toISOString(),
        projectId: existing.projectId,
        entityId: existing.project.entityId,
      },
      actorUserId,
    });
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Get
// ---------------------------------------------------------------------------

export async function getVendorContract(id: string, projectId: string) {
  const record = await prisma.vendorContract.findUniqueOrThrow({
    where: { id },
    include: { project: true, vendor: true, parentContract: true, childContracts: true },
  });
  assertProjectScope(record, projectId, 'VendorContract', id);
  return record;
}

// ---------------------------------------------------------------------------
// List (paginated + filters)
// ---------------------------------------------------------------------------

export async function listVendorContracts(input: ProcurementListFilterInput) {
  const where: Record<string, unknown> = { projectId: input.projectId };

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

  if (input.amountMin !== undefined || input.amountMax !== undefined) {
    const totalValue: Record<string, unknown> = {};
    if (input.amountMin !== undefined) totalValue.gte = input.amountMin;
    if (input.amountMax !== undefined) totalValue.lte = input.amountMax;
    where.totalValue = totalValue;
  }

  if (input.createdByFilter) {
    where.createdBy = input.createdByFilter;
  }

  const orderBy: Record<string, string> = {};
  orderBy[input.sortField ?? 'createdAt'] = input.sortDirection ?? 'desc';

  const [items, total] = await Promise.all([
    prisma.vendorContract.findMany({
      where,
      orderBy,
      skip: input.skip ?? 0,
      take: input.take ?? 20,
      include: { vendor: true, project: true },
    }),
    prisma.vendorContract.count({ where }),
  ]);

  return { items, total };
}

// ---------------------------------------------------------------------------
// Delete (draft only — hard delete)
// ---------------------------------------------------------------------------

export async function deleteVendorContract(id: string, actorUserId: string, projectId: string) {
  const existing = await prisma.vendorContract.findUniqueOrThrow({
    where: { id },
  });
  assertProjectScope(existing, projectId, 'VendorContract', id);

  if (existing.status !== 'draft') {
    throw new Error(`Cannot delete vendor contract in status '${existing.status}'. Only draft contracts can be deleted.`);
  }

  await prisma.vendorContract.delete({ where: { id } });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'vendor_contract.delete',
    resourceType: 'vendor_contract',
    resourceId: id,
    projectId: existing.projectId,
    beforeJson: existing as any,
    afterJson: null,
  });
}
