/**
 * VendorContract service — project-scoped CRUD with status transitions + posting.
 *
 * Phase 5, Task 5.1 — Module 3 Procurement Engine.
 */
import { prisma, Prisma, runAsWorkflowEngine } from '@fmksa/db';
import type { VendorContractStatus } from '@fmksa/db';
import type { CreateVendorContractInput, UpdateVendorContractInput, ProcurementListFilterInput } from '@fmksa/contracts';
import { auditService, type TransactionClient } from '../../audit/service';
import {
  workflowInstanceService,
  TemplateNotActiveError,
  DuplicateInstanceError,
  resolveTemplate,
  dispatchDeferred,
  type DeferredWorkflowEvent,
} from '../../workflow';
import { postingService } from '../../posting/service';
import { VENDOR_CONTRACT_TRANSITIONS, VENDOR_CONTRACT_TERMINAL_STATUSES, ACTION_TO_STATUS } from './transitions';
import { EDITABLE_STATUSES } from './validation';
import { generateOrgScopedNumber } from '../../commercial/reference-number/service';
import { assertProjectScope } from '../../scope-binding';

// ---------------------------------------------------------------------------
// Create (transaction-safe sequential code generation with P2002 retry)
// ---------------------------------------------------------------------------

export async function createVendorContract(input: CreateVendorContractInput, actorUserId: string) {
  // PIC-84: atomic per-org counter replaces read-max+retry-once. No P2002 retry needed.
  const { record, deferred } = await prisma.$transaction(async (tx) => {
    // VendorContract is project-scoped — derive orgId from the project.
    const project = await (tx as any).project.findUniqueOrThrow({
      where: { id: input.projectId! },
      select: { orgId: true },
    });
    const contractNumber = await generateOrgScopedNumber(
      project.orgId,
      'VC',
      (n: number) => `VC-${String(n).padStart(4, '0')}`,
      tx,
    );

    const created = await (tx as any).vendorContract.create({
      data: {
        orgId: project.orgId,
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

    // PIC-80: audit + conditional workflow seed share this transaction (atomic
    // with the contractNumber + create). projectId is non-null on create but the
    // seed stays guarded for symmetry with the framework-agreement entity-scoped
    // pattern.
    await auditService.log(
      {
        actorUserId,
        actorSource: 'user',
        action: 'vendor_contract.create',
        resourceType: 'vendor_contract',
        resourceId: created.id,
        projectId: input.projectId ?? null,
        beforeJson: null,
        afterJson: created as any,
      },
      tx,
    );

    let deferred: DeferredWorkflowEvent | null = null;
    if (input.projectId) {
      deferred = await autoSeedVendorContractWorkflow(created.id, input.projectId, actorUserId, tx);
    }

    return { record: created, deferred };
  });

  // PIC-80 outbox-ready seam: emit 'workflow.started' after commit.
  await dispatchDeferred(deferred);

  return record;
}

async function autoSeedVendorContractWorkflow(
  recordId: string,
  projectId: string,
  actorUserId: string,
  tx: TransactionClient,
): Promise<DeferredWorkflowEvent | null> {
  try {
    const resolution = await resolveTemplate('vendor_contract', projectId);
    if (!resolution) {
      console.warn(
        `[vendor-contract-workflow] No template configured for vendor_contract in project ${projectId}; workflow_instance not seeded for ${recordId}`,
      );
      return null;
    }
    const { deferredEvent } = await workflowInstanceService.startInstanceDeferred({
      templateCode: resolution.code,
      recordType: 'vendor_contract',
      recordId,
      projectId,
      startedBy: actorUserId,
      resolutionSource: resolution.source,
      tx,
    });
    return deferredEvent;
  } catch (err) {
    if (err instanceof TemplateNotActiveError || err instanceof DuplicateInstanceError) {
      console.warn(
        `[vendor-contract-workflow] Skipped workflow auto-seed for VendorContract ${recordId}: ${(err as Error).message}`,
      );
      return null;
    }
    throw err;
  }
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
  // PIC-35 Step 7 wrap (missed in original Step 7 pass — PIC-47 follow-up).
  return runAsWorkflowEngine(async () => {
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
  const updateData: Record<string, unknown> = { status: newStatus as VendorContractStatus };
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
  });
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
