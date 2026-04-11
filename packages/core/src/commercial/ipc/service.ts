import { prisma } from '@fmksa/db';
import type { IpcStatus } from '@fmksa/db';
import type { CreateIpcInput, UpdateIpcInput, ListFilterInput } from '@fmksa/contracts';
import { auditService } from '../../audit/service';
import { postingService } from '../../posting/service';
import { generateReferenceNumber } from '../reference-number/service';
import { IPC_TRANSITIONS, IPC_TERMINAL_STATUSES } from './transitions';
import { assertProjectScope } from '../../scope-binding';

// ---------------------------------------------------------------------------
// Action → status mapping
// ---------------------------------------------------------------------------

const ACTION_TO_STATUS: Record<string, string> = {
  submit: 'submitted',
  review: 'under_review',
  approve: 'approved_internal',
  reject: 'rejected',
  return: 'returned',
  sign: 'signed',
  issue: 'issued',
  supersede: 'superseded',
  close: 'closed',
};

// ---------------------------------------------------------------------------
// IPA statuses that allow IPC creation
// ---------------------------------------------------------------------------

const IPA_GATEABLE_STATUSES = [
  'approved_internal',
  'signed',
  'issued',
  'superseded',
  'closed',
];

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createIpc(input: CreateIpcInput, actorUserId: string) {
  // Validate parent IPA status
  const parentIpa = await prisma.ipa.findUniqueOrThrow({
    where: { id: input.ipaId },
  });

  if (!IPA_GATEABLE_STATUSES.includes(parentIpa.status)) {
    throw new Error(
      `Cannot create IPC: parent IPA is in '${parentIpa.status}' status. IPA must be at least 'approved_internal'.`,
    );
  }

  const ipc = await prisma.ipc.create({
    data: {
      projectId: input.projectId,
      ipaId: input.ipaId,
      status: 'draft',
      certifiedAmount: input.certifiedAmount,
      retentionAmount: input.retentionAmount,
      adjustments: input.adjustments ?? null,
      netCertified: input.netCertified,
      certificationDate: new Date(input.certificationDate),
      currency: input.currency,
      remarks: input.remarks ?? null,
      createdBy: actorUserId,
    },
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'ipc.create',
    resourceType: 'ipc',
    resourceId: ipc.id,
    projectId: input.projectId,
    beforeJson: null,
    afterJson: ipc as any,
  });

  return ipc;
}

// ---------------------------------------------------------------------------
// Update (draft / returned only)
// ---------------------------------------------------------------------------

export async function updateIpc(input: UpdateIpcInput, actorUserId: string, projectId: string) {
  const existing = await prisma.ipc.findUniqueOrThrow({ where: { id: input.id } });
  assertProjectScope(existing, projectId, 'IPC', input.id);

  if (!['draft', 'returned'].includes(existing.status)) {
    throw new Error(`Cannot update IPC in status '${existing.status}'. Only draft or returned IPCs can be updated.`);
  }

  const { id, ...updateFields } = input;
  const data: Record<string, unknown> = {};

  // Map fields, converting date strings to Date objects
  for (const [key, value] of Object.entries(updateFields)) {
    if (value === undefined) continue;
    if (key === 'certificationDate') {
      data[key] = new Date(value as string);
    } else {
      data[key] = value;
    }
  }

  const updated = await prisma.ipc.update({
    where: { id },
    data,
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'ipc.update',
    resourceType: 'ipc',
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

export async function transitionIpc(
  id: string,
  action: string,
  actorUserId: string,
  comment?: string,
  projectId?: string,
) {
  const newStatus = ACTION_TO_STATUS[action];
  if (!newStatus) {
    throw new Error(`Unknown IPC action: '${action}'`);
  }

  const existing = await prisma.ipc.findUniqueOrThrow({
    where: { id },
    include: { project: true },
  });
  if (projectId) assertProjectScope(existing, projectId, 'IPC', id);

  // Terminal status check
  if (IPC_TERMINAL_STATUSES.includes(existing.status)) {
    throw new Error(`Cannot transition IPC from terminal status '${existing.status}'.`);
  }

  // Transition validity check
  const allowed = IPC_TRANSITIONS[existing.status];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(
      `Invalid IPC transition: '${existing.status}' → '${newStatus}'. Allowed: [${(allowed ?? []).join(', ')}]`,
    );
  }

  // Transitions that require a transaction (posting or ref number)
  const needsTransaction = newStatus === 'signed' || newStatus === 'issued';

  let updated: Awaited<ReturnType<typeof prisma.ipc.update>>;

  if (needsTransaction) {
    updated = await prisma.$transaction(async (tx) => {
      const updateData: Record<string, unknown> = { status: newStatus };

      // Assign reference number at issued
      if (newStatus === 'issued') {
        const refNum = await generateReferenceNumber(existing.projectId, 'IPC', tx);
        updateData.referenceNumber = refNum;
      }

      const result = await (tx as any).ipc.update({
        where: { id },
        data: updateData,
        include: { project: true },
      });

      await auditService.log(
        {
          actorUserId,
          actorSource: 'user',
          action: `ipc.transition.${action}`,
          resourceType: 'ipc',
          resourceId: id,
          projectId: existing.projectId,
          beforeJson: existing as any,
          afterJson: result as any,
          reason: comment ?? null,
        },
        tx,
      );

      return result;
    });

    // Fire posting event for signed (outside nested tx since postingService manages its own)
    if (newStatus === 'signed') {
      await postingService.post({
        eventType: 'IPC_SIGNED',
        sourceService: 'commercial',
        sourceRecordType: 'ipc',
        sourceRecordId: existing.id,
        projectId: existing.projectId,
        entityId: existing.project.entityId,
        idempotencyKey: `ipc:${existing.id}:signed`,
        payload: {
          ipcId: existing.id,
          ipaId: existing.ipaId,
          certifiedAmount: existing.certifiedAmount.toString(),
          retentionAmount: existing.retentionAmount.toString(),
          netCertified: existing.netCertified.toString(),
          currency: existing.currency,
          projectId: existing.projectId,
        },
        actorUserId,
      });
    }
  } else {
    // Simple status update
    updated = await prisma.ipc.update({
      where: { id },
      data: { status: newStatus as IpcStatus },
      include: { project: true },
    });

    await auditService.log({
      actorUserId,
      actorSource: 'user',
      action: `ipc.transition.${action}`,
      resourceType: 'ipc',
      resourceId: id,
      projectId: existing.projectId,
      beforeJson: existing as any,
      afterJson: updated as any,
      reason: comment ?? null,
    });
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Get
// ---------------------------------------------------------------------------

export async function getIpc(id: string, projectId: string) {
  const record = await prisma.ipc.findUniqueOrThrow({
    where: { id },
    include: { project: true },
  });
  assertProjectScope(record, projectId, 'IPC', id);
  return record;
}

// ---------------------------------------------------------------------------
// List (paginated + filters)
// ---------------------------------------------------------------------------

export async function listIpcs(input: ListFilterInput) {
  const where: Record<string, unknown> = { projectId: input.projectId };

  if (input.statusFilter && input.statusFilter.length > 0) {
    where.status = { in: input.statusFilter };
  }

  if (input.dateFrom || input.dateTo) {
    const createdAt: Record<string, unknown> = {};
    if (input.dateFrom) createdAt.gte = new Date(input.dateFrom);
    if (input.dateTo) createdAt.lte = new Date(input.dateTo);
    where.createdAt = createdAt;
  }

  if (input.amountMin !== undefined || input.amountMax !== undefined) {
    const netCertified: Record<string, unknown> = {};
    if (input.amountMin !== undefined) netCertified.gte = input.amountMin;
    if (input.amountMax !== undefined) netCertified.lte = input.amountMax;
    where.netCertified = netCertified;
  }

  if (input.createdByFilter) {
    where.createdBy = input.createdByFilter;
  }

  const orderBy: Record<string, string> = {};
  orderBy[input.sortField ?? 'createdAt'] = input.sortDirection ?? 'desc';

  const [items, total] = await Promise.all([
    prisma.ipc.findMany({
      where,
      orderBy,
      skip: input.skip ?? 0,
      take: input.take ?? 20,
      include: { project: true },
    }),
    prisma.ipc.count({ where }),
  ]);

  return { items, total };
}

// ---------------------------------------------------------------------------
// Delete (draft only — hard delete)
// ---------------------------------------------------------------------------

export async function deleteIpc(id: string, actorUserId: string, projectId: string) {
  const existing = await prisma.ipc.findUniqueOrThrow({ where: { id } });
  assertProjectScope(existing, projectId, 'IPC', id);

  if (existing.status !== 'draft') {
    throw new Error(`Cannot delete IPC in status '${existing.status}'. Only draft IPCs can be deleted.`);
  }

  await prisma.ipc.delete({ where: { id } });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'ipc.delete',
    resourceType: 'ipc',
    resourceId: id,
    projectId: existing.projectId,
    beforeJson: existing as any,
    afterJson: null,
  });
}
