import { prisma } from '@fmksa/db';
import type { CreateVariationInput, UpdateVariationInput, ListFilterInput } from '@fmksa/contracts';
import type { VariationListFilter } from '@fmksa/contracts';
import { auditService } from '../../audit/service';
import { postingService } from '../../posting/service';
import { generateReferenceNumber } from '../reference-number/service';
import { getVariationTransitions, VARIATION_TERMINAL_STATUSES } from './transitions';
import { assertProjectScope } from '../../scope-binding';

// ---------------------------------------------------------------------------
// Action -> status mapping
// ---------------------------------------------------------------------------

const ACTION_TO_STATUS: Record<string, string> = {
  submit: 'submitted',
  review: 'under_review',
  approve: 'approved_internal',
  reject: 'rejected',
  return: 'returned',
  sign: 'signed',
  issue: 'issued',
  client_pending: 'client_pending',
  client_approved: 'client_approved',
  client_rejected: 'client_rejected',
  supersede: 'superseded',
  close: 'closed',
};

// ---------------------------------------------------------------------------
// Reference number type code by subtype
// ---------------------------------------------------------------------------

function getTypeCode(subtype: string): string {
  return subtype === 'change_order' ? 'CO' : 'VO';
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createVariation(input: CreateVariationInput, actorUserId: string) {
  const variation = await prisma.variation.create({
    data: {
      projectId: input.projectId,
      subtype: input.subtype as any,
      status: 'draft',
      title: input.title,
      description: input.description,
      reason: input.reason,
      costImpact: input.costImpact ?? null,
      timeImpactDays: input.timeImpactDays ?? null,
      currency: input.currency,
      initiatedBy: (input.initiatedBy as any) ?? null,
      contractClause: input.contractClause ?? null,
      parentVariationId: input.parentVariationId ?? null,
      originalContractValue: input.originalContractValue ?? null,
      adjustmentAmount: input.adjustmentAmount ?? null,
      newContractValue: input.newContractValue ?? null,
      timeAdjustmentDays: input.timeAdjustmentDays ?? null,
      createdBy: actorUserId,
    },
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'variation.create',
    resourceType: 'variation',
    resourceId: variation.id,
    projectId: input.projectId,
    beforeJson: null,
    afterJson: variation as any,
  });

  return variation;
}

// ---------------------------------------------------------------------------
// Update (draft / returned only)
// ---------------------------------------------------------------------------

export async function updateVariation(input: UpdateVariationInput, actorUserId: string, projectId: string) {
  const existing = await prisma.variation.findUniqueOrThrow({ where: { id: input.id } });
  assertProjectScope(existing, projectId, 'Variation', input.id);

  if (!['draft', 'returned'].includes(existing.status)) {
    throw new Error(`Cannot update Variation in status '${existing.status}'. Only draft or returned Variations can be updated.`);
  }

  const { id, ...updateFields } = input;
  const data: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(updateFields)) {
    if (value === undefined) continue;
    data[key] = value;
  }

  const updated = await prisma.variation.update({
    where: { id },
    data,
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'variation.update',
    resourceType: 'variation',
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

export async function transitionVariation(
  id: string,
  action: string,
  actorUserId: string,
  comment?: string,
  assessmentData?: {
    assessedCostImpact?: number | null;
    assessedTimeImpactDays?: number | null;
    approvedCostImpact?: number | null;
    approvedTimeImpactDays?: number | null;
  },
  projectId?: string,
) {
  const newStatus = ACTION_TO_STATUS[action];
  if (!newStatus) {
    throw new Error(`Unknown Variation action: '${action}'`);
  }

  const existing = await prisma.variation.findUniqueOrThrow({
    where: { id },
    include: { project: true },
  });
  if (projectId) assertProjectScope(existing, projectId, 'Variation', id);

  // Terminal status check
  if (VARIATION_TERMINAL_STATUSES.includes(existing.status)) {
    throw new Error(`Cannot transition Variation from terminal status '${existing.status}'.`);
  }

  // Transition validity check — use correct map for subtype
  const transitions = getVariationTransitions(existing.subtype as 'vo' | 'change_order');
  const allowed = transitions[existing.status];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(
      `Invalid Variation transition: '${existing.status}' -> '${newStatus}'. Allowed: [${(allowed ?? []).join(', ')}]`,
    );
  }

  // Transitions that require a transaction (posting, ref number, or assessment data)
  const needsTransaction =
    newStatus === 'approved_internal' ||
    newStatus === 'client_approved' ||
    newStatus === 'issued' ||
    newStatus === 'under_review';

  let updated: Awaited<ReturnType<typeof prisma.variation.update>>;

  if (needsTransaction) {
    updated = await prisma.$transaction(async (tx) => {
      const updateData: Record<string, unknown> = { status: newStatus };

      // Assign reference number at issued
      if (newStatus === 'issued') {
        const typeCode = getTypeCode(existing.subtype);
        const refNum = await generateReferenceNumber(existing.projectId, typeCode, tx);
        updateData.referenceNumber = refNum;
      }

      // Assessment fields at review (under_review)
      if (newStatus === 'under_review' && assessmentData) {
        if (assessmentData.assessedCostImpact !== undefined) {
          updateData.assessedCostImpact = assessmentData.assessedCostImpact;
        }
        if (assessmentData.assessedTimeImpactDays !== undefined) {
          updateData.assessedTimeImpactDays = assessmentData.assessedTimeImpactDays;
        }
      }

      // Assessment fields at approve (approved_internal)
      if (newStatus === 'approved_internal' && assessmentData) {
        if (assessmentData.approvedCostImpact !== undefined) {
          updateData.approvedCostImpact = assessmentData.approvedCostImpact;
        }
        if (assessmentData.approvedTimeImpactDays !== undefined) {
          updateData.approvedTimeImpactDays = assessmentData.approvedTimeImpactDays;
        }
      }

      const result = await (tx as any).variation.update({
        where: { id },
        data: updateData,
        include: { project: true },
      });

      await auditService.log(
        {
          actorUserId,
          actorSource: 'user',
          action: `variation.transition.${action}`,
          resourceType: 'variation',
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

    // Fire posting event for approved_internal (outside tx)
    if (newStatus === 'approved_internal') {
      await postingService.post({
        eventType: 'VARIATION_APPROVED_INTERNAL',
        sourceService: 'commercial',
        sourceRecordType: 'variation',
        sourceRecordId: existing.id,
        projectId: existing.projectId,
        entityId: existing.project.entityId,
        idempotencyKey: `variation:${existing.id}:approved_internal`,
        payload: {
          variationId: existing.id,
          subtype: existing.subtype,
          title: existing.title,
          costImpact: existing.costImpact?.toString() ?? null,
          timeImpactDays: existing.timeImpactDays ?? null,
          currency: existing.currency,
          projectId: existing.projectId,
        },
        actorUserId,
      });
    }

    // Fire posting event for client_approved (outside tx)
    if (newStatus === 'client_approved') {
      // Re-fetch to get latest approved fields after the transaction
      const latest = await prisma.variation.findUniqueOrThrow({ where: { id } });
      await postingService.post({
        eventType: 'VARIATION_APPROVED_CLIENT',
        sourceService: 'commercial',
        sourceRecordType: 'variation',
        sourceRecordId: existing.id,
        projectId: existing.projectId,
        entityId: existing.project.entityId,
        idempotencyKey: `variation:${existing.id}:client_approved`,
        payload: {
          variationId: existing.id,
          subtype: existing.subtype,
          approvedCost: latest.approvedCostImpact?.toString() ?? null,
          approvedTimeDays: latest.approvedTimeImpactDays ?? null,
          currency: existing.currency,
          projectId: existing.projectId,
        },
        actorUserId,
      });
    }
  } else {
    // Simple status update
    updated = await prisma.variation.update({
      where: { id },
      data: { status: newStatus },
      include: { project: true },
    });

    await auditService.log({
      actorUserId,
      actorSource: 'user',
      action: `variation.transition.${action}`,
      resourceType: 'variation',
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

export async function getVariation(id: string, projectId: string) {
  const record = await prisma.variation.findUniqueOrThrow({
    where: { id },
    include: { project: true },
  });
  assertProjectScope(record, projectId, 'Variation', id);
  return record;
}

// ---------------------------------------------------------------------------
// List (paginated + filters)
// ---------------------------------------------------------------------------

export async function listVariations(
  input: ListFilterInput,
  extra?: VariationListFilter,
) {
  const where: Record<string, unknown> = { projectId: input.projectId };

  if (input.statusFilter && input.statusFilter.length > 0) {
    where.status = { in: input.statusFilter };
  }

  if (extra?.subtypeFilter) {
    where.subtype = extra.subtypeFilter;
  }

  if (input.dateFrom || input.dateTo) {
    const createdAt: Record<string, unknown> = {};
    if (input.dateFrom) createdAt.gte = new Date(input.dateFrom);
    if (input.dateTo) createdAt.lte = new Date(input.dateTo);
    where.createdAt = createdAt;
  }

  if (input.amountMin !== undefined || input.amountMax !== undefined) {
    const costImpact: Record<string, unknown> = {};
    if (input.amountMin !== undefined) costImpact.gte = input.amountMin;
    if (input.amountMax !== undefined) costImpact.lte = input.amountMax;
    where.costImpact = costImpact;
  }

  if (input.createdByFilter) {
    where.createdBy = input.createdByFilter;
  }

  const orderBy: Record<string, string> = {};
  orderBy[input.sortField ?? 'createdAt'] = input.sortDirection ?? 'desc';

  const [items, total] = await Promise.all([
    prisma.variation.findMany({
      where,
      orderBy,
      skip: input.skip ?? 0,
      take: input.take ?? 20,
      include: { project: true },
    }),
    prisma.variation.count({ where }),
  ]);

  return { items, total };
}

// ---------------------------------------------------------------------------
// Delete (draft only -- hard delete)
// ---------------------------------------------------------------------------

export async function deleteVariation(id: string, actorUserId: string, projectId: string) {
  const existing = await prisma.variation.findUniqueOrThrow({ where: { id } });
  assertProjectScope(existing, projectId, 'Variation', id);

  if (existing.status !== 'draft') {
    throw new Error(`Cannot delete Variation in status '${existing.status}'. Only draft Variations can be deleted.`);
  }

  await prisma.variation.delete({ where: { id } });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'variation.delete',
    resourceType: 'variation',
    resourceId: id,
    projectId: existing.projectId,
    beforeJson: existing as any,
    afterJson: null,
  });
}
