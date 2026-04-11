import { prisma } from '@fmksa/db';
import type { CreateCostProposalInput, UpdateCostProposalInput, ListFilterInput } from '@fmksa/contracts';
import { auditService } from '../../audit/service';
import { generateReferenceNumber } from '../reference-number/service';
import { COST_PROPOSAL_TRANSITIONS, COST_PROPOSAL_TERMINAL_STATUSES } from './transitions';
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
  issue: 'issued',
  link_to_variation: 'linked_to_variation',
  supersede: 'superseded',
  close: 'closed',
};

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createCostProposal(input: CreateCostProposalInput, actorUserId: string) {
  const cp = await prisma.costProposal.create({
    data: {
      projectId: input.projectId,
      variationId: input.variationId ?? null,
      status: 'draft',
      revisionNumber: input.revisionNumber,
      estimatedCost: input.estimatedCost,
      estimatedTimeDays: input.estimatedTimeDays ?? null,
      methodology: input.methodology ?? null,
      costBreakdown: input.costBreakdown ?? null,
      currency: input.currency,
      createdBy: actorUserId,
    },
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'cost_proposal.create',
    resourceType: 'cost_proposal',
    resourceId: cp.id,
    projectId: input.projectId,
    beforeJson: null,
    afterJson: cp as any,
  });

  return cp;
}

// ---------------------------------------------------------------------------
// Update (draft / returned only)
// ---------------------------------------------------------------------------

export async function updateCostProposal(input: UpdateCostProposalInput, actorUserId: string, projectId: string) {
  const existing = await prisma.costProposal.findUniqueOrThrow({ where: { id: input.id } });
  assertProjectScope(existing, projectId, 'CostProposal', input.id);

  if (!['draft', 'returned'].includes(existing.status)) {
    throw new Error(`Cannot update CostProposal in status '${existing.status}'. Only draft or returned CostProposals can be updated.`);
  }

  const { id, ...updateFields } = input;
  const data: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(updateFields)) {
    if (value === undefined) continue;
    data[key] = value;
  }

  const updated = await prisma.costProposal.update({
    where: { id },
    data,
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'cost_proposal.update',
    resourceType: 'cost_proposal',
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

export async function transitionCostProposal(
  id: string,
  action: string,
  actorUserId: string,
  comment?: string,
  assessmentData?: {
    assessedCost?: number | null;
    assessedTimeDays?: number | null;
    approvedCost?: number | null;
    approvedTimeDays?: number | null;
  },
  projectId?: string,
) {
  const newStatus = ACTION_TO_STATUS[action];
  if (!newStatus) {
    throw new Error(`Unknown CostProposal action: '${action}'`);
  }

  const existing = await prisma.costProposal.findUniqueOrThrow({
    where: { id },
    include: { project: true },
  });
  if (projectId) assertProjectScope(existing, projectId, 'CostProposal', id);

  // Terminal status check
  if (COST_PROPOSAL_TERMINAL_STATUSES.includes(existing.status)) {
    throw new Error(`Cannot transition CostProposal from terminal status '${existing.status}'.`);
  }

  // Transition validity check
  const allowed = COST_PROPOSAL_TRANSITIONS[existing.status];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(
      `Invalid CostProposal transition: '${existing.status}' -> '${newStatus}'. Allowed: [${(allowed ?? []).join(', ')}]`,
    );
  }

  // Transitions that require a transaction (ref number or assessment data)
  const needsTransaction =
    newStatus === 'under_review' ||
    newStatus === 'approved_internal' ||
    newStatus === 'issued';

  let updated: Awaited<ReturnType<typeof prisma.costProposal.update>>;

  if (needsTransaction) {
    updated = await prisma.$transaction(async (tx) => {
      const updateData: Record<string, unknown> = { status: newStatus };

      // Assign reference number at issued
      if (newStatus === 'issued') {
        const refNum = await generateReferenceNumber(existing.projectId, 'CP', tx);
        updateData.referenceNumber = refNum;
      }

      // Assessment fields at review (under_review)
      if (newStatus === 'under_review' && assessmentData) {
        if (assessmentData.assessedCost !== undefined) {
          updateData.assessedCost = assessmentData.assessedCost;
        }
        if (assessmentData.assessedTimeDays !== undefined) {
          updateData.assessedTimeDays = assessmentData.assessedTimeDays;
        }
      }

      // Assessment fields at approve (approved_internal)
      if (newStatus === 'approved_internal' && assessmentData) {
        if (assessmentData.approvedCost !== undefined) {
          updateData.approvedCost = assessmentData.approvedCost;
        }
        if (assessmentData.approvedTimeDays !== undefined) {
          updateData.approvedTimeDays = assessmentData.approvedTimeDays;
        }
      }

      const result = await (tx as any).costProposal.update({
        where: { id },
        data: updateData,
        include: { project: true },
      });

      await auditService.log(
        {
          actorUserId,
          actorSource: 'user',
          action: `cost_proposal.transition.${action}`,
          resourceType: 'cost_proposal',
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
  } else {
    // Simple status update
    updated = await prisma.costProposal.update({
      where: { id },
      data: { status: newStatus },
      include: { project: true },
    });

    await auditService.log({
      actorUserId,
      actorSource: 'user',
      action: `cost_proposal.transition.${action}`,
      resourceType: 'cost_proposal',
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

export async function getCostProposal(id: string, projectId: string) {
  const record = await prisma.costProposal.findUniqueOrThrow({
    where: { id },
    include: { project: true },
  });
  assertProjectScope(record, projectId, 'CostProposal', id);
  return record;
}

// ---------------------------------------------------------------------------
// List (paginated + filters)
// ---------------------------------------------------------------------------

export async function listCostProposals(input: ListFilterInput) {
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
    const estimatedCost: Record<string, unknown> = {};
    if (input.amountMin !== undefined) estimatedCost.gte = input.amountMin;
    if (input.amountMax !== undefined) estimatedCost.lte = input.amountMax;
    where.estimatedCost = estimatedCost;
  }

  if (input.createdByFilter) {
    where.createdBy = input.createdByFilter;
  }

  const orderBy: Record<string, string> = {};
  orderBy[input.sortField ?? 'createdAt'] = input.sortDirection ?? 'desc';

  const [items, total] = await Promise.all([
    prisma.costProposal.findMany({
      where,
      orderBy,
      skip: input.skip ?? 0,
      take: input.take ?? 20,
      include: { project: true },
    }),
    prisma.costProposal.count({ where }),
  ]);

  return { items, total };
}

// ---------------------------------------------------------------------------
// Delete (draft only -- hard delete)
// ---------------------------------------------------------------------------

export async function deleteCostProposal(id: string, actorUserId: string, projectId: string) {
  const existing = await prisma.costProposal.findUniqueOrThrow({ where: { id } });
  assertProjectScope(existing, projectId, 'CostProposal', id);

  if (existing.status !== 'draft') {
    throw new Error(`Cannot delete CostProposal in status '${existing.status}'. Only draft CostProposals can be deleted.`);
  }

  await prisma.costProposal.delete({ where: { id } });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'cost_proposal.delete',
    resourceType: 'cost_proposal',
    resourceId: id,
    projectId: existing.projectId,
    beforeJson: existing as any,
    afterJson: null,
  });
}
