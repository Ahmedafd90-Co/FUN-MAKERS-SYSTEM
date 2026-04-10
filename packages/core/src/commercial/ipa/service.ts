import { prisma } from '@fmksa/db';
import type { CreateIpaInput, UpdateIpaInput, ListFilterInput } from '@fmksa/contracts';
import { auditService } from '../../audit/service';
import { postingService } from '../../posting/service';
import { generateReferenceNumber } from '../reference-number/service';
import { IPA_TRANSITIONS, IPA_TERMINAL_STATUSES } from './transitions';

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
// Create
// ---------------------------------------------------------------------------

export async function createIpa(input: CreateIpaInput, actorUserId: string) {
  const ipa = await prisma.ipa.create({
    data: {
      projectId: input.projectId,
      status: 'draft',
      periodNumber: input.periodNumber,
      periodFrom: new Date(input.periodFrom),
      periodTo: new Date(input.periodTo),
      grossAmount: input.grossAmount,
      retentionRate: input.retentionRate,
      retentionAmount: input.retentionAmount,
      previousCertified: input.previousCertified,
      currentClaim: input.currentClaim,
      advanceRecovery: input.advanceRecovery ?? null,
      otherDeductions: input.otherDeductions ?? null,
      netClaimed: input.netClaimed,
      currency: input.currency,
      description: input.description ?? null,
      createdBy: actorUserId,
    },
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'ipa.create',
    resourceType: 'ipa',
    resourceId: ipa.id,
    projectId: input.projectId,
    beforeJson: null,
    afterJson: ipa as any,
  });

  return ipa;
}

// ---------------------------------------------------------------------------
// Update (draft / returned only)
// ---------------------------------------------------------------------------

export async function updateIpa(input: UpdateIpaInput, actorUserId: string) {
  const existing = await prisma.ipa.findUniqueOrThrow({ where: { id: input.id } });

  if (!['draft', 'returned'].includes(existing.status)) {
    throw new Error(`Cannot update IPA in status '${existing.status}'. Only draft or returned IPAs can be updated.`);
  }

  const { id, ...updateFields } = input;
  const data: Record<string, unknown> = {};

  // Map fields, converting date strings to Date objects
  for (const [key, value] of Object.entries(updateFields)) {
    if (value === undefined) continue;
    if (key === 'periodFrom' || key === 'periodTo') {
      data[key] = new Date(value as string);
    } else {
      data[key] = value;
    }
  }

  const updated = await prisma.ipa.update({
    where: { id },
    data,
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'ipa.update',
    resourceType: 'ipa',
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

export async function transitionIpa(
  id: string,
  action: string,
  actorUserId: string,
  comment?: string,
) {
  const newStatus = ACTION_TO_STATUS[action];
  if (!newStatus) {
    throw new Error(`Unknown IPA action: '${action}'`);
  }

  const existing = await prisma.ipa.findUniqueOrThrow({
    where: { id },
    include: { project: true },
  });

  // Terminal status check
  if (IPA_TERMINAL_STATUSES.includes(existing.status)) {
    throw new Error(`Cannot transition IPA from terminal status '${existing.status}'.`);
  }

  // Transition validity check
  const allowed = IPA_TRANSITIONS[existing.status];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(
      `Invalid IPA transition: '${existing.status}' → '${newStatus}'. Allowed: [${(allowed ?? []).join(', ')}]`,
    );
  }

  // Transitions that require a transaction (posting or ref number)
  const needsTransaction = newStatus === 'approved_internal' || newStatus === 'issued';

  let updated: Awaited<ReturnType<typeof prisma.ipa.update>>;

  if (needsTransaction) {
    updated = await prisma.$transaction(async (tx) => {
      const updateData: Record<string, unknown> = { status: newStatus };

      // Assign reference number at issued
      if (newStatus === 'issued') {
        const refNum = await generateReferenceNumber(existing.projectId, 'IPA', tx);
        updateData.referenceNumber = refNum;
      }

      const result = await (tx as any).ipa.update({
        where: { id },
        data: updateData,
        include: { project: true },
      });

      await auditService.log(
        {
          actorUserId,
          actorSource: 'user',
          action: `ipa.transition.${action}`,
          resourceType: 'ipa',
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

    // Fire posting event for approved_internal (outside nested tx since postingService manages its own)
    if (newStatus === 'approved_internal') {
      await postingService.post({
        eventType: 'IPA_APPROVED',
        sourceService: 'commercial',
        sourceRecordType: 'ipa',
        sourceRecordId: existing.id,
        projectId: existing.projectId,
        entityId: existing.project.entityId,
        idempotencyKey: `ipa:${existing.id}:approved_internal`,
        payload: {
          ipaId: existing.id,
          periodNumber: existing.periodNumber,
          grossAmount: existing.grossAmount.toString(),
          retentionAmount: existing.retentionAmount.toString(),
          netClaimed: existing.netClaimed.toString(),
          currency: existing.currency,
          projectId: existing.projectId,
        },
        actorUserId,
      });
    }
  } else {
    // Simple status update
    updated = await prisma.ipa.update({
      where: { id },
      data: { status: newStatus },
      include: { project: true },
    });

    await auditService.log({
      actorUserId,
      actorSource: 'user',
      action: `ipa.transition.${action}`,
      resourceType: 'ipa',
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

export async function getIpa(id: string) {
  return prisma.ipa.findUniqueOrThrow({
    where: { id },
    include: { project: true },
  });
}

// ---------------------------------------------------------------------------
// List (paginated + filters)
// ---------------------------------------------------------------------------

export async function listIpas(input: ListFilterInput) {
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
    const netClaimed: Record<string, unknown> = {};
    if (input.amountMin !== undefined) netClaimed.gte = input.amountMin;
    if (input.amountMax !== undefined) netClaimed.lte = input.amountMax;
    where.netClaimed = netClaimed;
  }

  if (input.createdByFilter) {
    where.createdBy = input.createdByFilter;
  }

  const orderBy: Record<string, string> = {};
  orderBy[input.sortField ?? 'createdAt'] = input.sortDirection ?? 'desc';

  const [items, total] = await Promise.all([
    prisma.ipa.findMany({
      where,
      orderBy,
      skip: input.skip ?? 0,
      take: input.take ?? 20,
      include: { project: true },
    }),
    prisma.ipa.count({ where }),
  ]);

  return { items, total };
}

// ---------------------------------------------------------------------------
// Delete (draft only — hard delete)
// ---------------------------------------------------------------------------

export async function deleteIpa(id: string, actorUserId: string) {
  const existing = await prisma.ipa.findUniqueOrThrow({ where: { id } });

  if (existing.status !== 'draft') {
    throw new Error(`Cannot delete IPA in status '${existing.status}'. Only draft IPAs can be deleted.`);
  }

  await prisma.ipa.delete({ where: { id } });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'ipa.delete',
    resourceType: 'ipa',
    resourceId: id,
    projectId: existing.projectId,
    beforeJson: existing as any,
    afterJson: null,
  });
}
