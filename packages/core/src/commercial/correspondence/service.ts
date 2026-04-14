import { prisma } from '@fmksa/db';
import type { CorrespondenceStatus } from '@fmksa/db';
import type { CreateCorrespondenceInput, UpdateCorrespondenceInput, ListFilterInput } from '@fmksa/contracts';
import type { CorrespondenceListFilter } from '@fmksa/contracts';
import { auditService } from '../../audit/service';
import { postingService } from '../../posting/service';
import { generateReferenceNumber } from '../reference-number/service';
import { getCorrespondenceTransitions, CORRESPONDENCE_TERMINAL_STATUSES, CORRESPONDENCE_WORKFLOW_MANAGED_ACTIONS } from './transitions';
import { assertProjectScope } from '../../scope-binding';
import {
  workflowInstanceService,
  TemplateNotActiveError,
  DuplicateInstanceError,
  resolveTemplate,
} from '../../workflow';

// ---------------------------------------------------------------------------
// Action -> status mapping
// ---------------------------------------------------------------------------

const ACTION_TO_STATUS: Record<string, string> = {
  submit: 'under_review',
  approve: 'approved_internal',
  reject: 'rejected',
  return: 'returned',
  sign: 'signed',
  issue: 'issued',
  supersede: 'superseded',
  close: 'closed',
  // Notice-specific
  mark_response_due: 'response_due',
  mark_responded: 'responded',
  // Claim-specific
  evaluate: 'under_evaluation',
  partially_accept: 'partially_accepted',
  accept: 'accepted',
  dispute: 'disputed',
  // Back-charge-specific
  acknowledge: 'acknowledged',
  recover: 'recovered',
  partially_recover: 'partially_recovered',
};

// ---------------------------------------------------------------------------
// Reference number type code by subtype
// ---------------------------------------------------------------------------

function getTypeCode(subtype: string): string {
  switch (subtype) {
    case 'letter':
      return 'LTR';
    case 'notice':
      return 'NTC';
    case 'claim':
      return 'CLM';
    case 'back_charge':
      return 'BCH';
    default:
      return 'COR';
  }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createCorrespondence(input: CreateCorrespondenceInput, actorUserId: string) {
  const correspondence = await prisma.correspondence.create({
    data: {
      projectId: input.projectId,
      subtype: input.subtype as any,
      status: 'draft',
      subject: input.subject,
      body: input.body,
      recipientName: input.recipientName,
      recipientOrg: input.recipientOrg ?? null,
      currency: input.currency ?? null,
      parentCorrespondenceId: input.parentCorrespondenceId ?? null,
      // Notice-specific
      noticeType: (input.noticeType as any) ?? null,
      contractClause: input.contractClause ?? null,
      responseDeadline: input.responseDeadline ? new Date(input.responseDeadline) : null,
      // Claim-specific
      claimType: (input.claimType as any) ?? null,
      claimedAmount: input.claimedAmount ?? null,
      claimedTimeDays: input.claimedTimeDays ?? null,
      settledAmount: input.settledAmount ?? null,
      settledTimeDays: input.settledTimeDays ?? null,
      // Back-charge-specific
      targetName: input.targetName ?? null,
      category: (input.category as any) ?? null,
      chargedAmount: input.chargedAmount ?? null,
      evidenceDescription: input.evidenceDescription ?? null,
      // Letter-specific
      letterType: (input.letterType as any) ?? null,
      inReplyToId: input.inReplyToId ?? null,
      createdBy: actorUserId,
    },
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'correspondence.create',
    resourceType: 'correspondence',
    resourceId: correspondence.id,
    projectId: input.projectId,
    beforeJson: null,
    afterJson: correspondence as any,
  });

  return correspondence;
}

// ---------------------------------------------------------------------------
// Update (draft / returned only)
// ---------------------------------------------------------------------------

export async function updateCorrespondence(input: UpdateCorrespondenceInput, actorUserId: string, projectId: string) {
  const existing = await prisma.correspondence.findUniqueOrThrow({ where: { id: input.id } });
  assertProjectScope(existing, projectId, 'Correspondence', input.id);

  if (!['draft', 'returned'].includes(existing.status)) {
    throw new Error(`Cannot update Correspondence in status '${existing.status}'. Only draft or returned Correspondences can be updated.`);
  }

  const { id, ...updateFields } = input;
  const data: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(updateFields)) {
    if (value === undefined) continue;
    if (key === 'responseDeadline') {
      data[key] = value ? new Date(value as string) : null;
    } else {
      data[key] = value;
    }
  }

  const updated = await prisma.correspondence.update({
    where: { id },
    data,
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'correspondence.update',
    resourceType: 'correspondence',
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

export async function transitionCorrespondence(
  id: string,
  action: string,
  actorUserId: string,
  comment?: string,
  projectId?: string,
) {
  const newStatus = ACTION_TO_STATUS[action];
  if (!newStatus) {
    throw new Error(`Unknown Correspondence action: '${action}'`);
  }

  const existing = await prisma.correspondence.findUniqueOrThrow({
    where: { id },
    include: { project: true },
  });
  if (projectId) assertProjectScope(existing, projectId, 'Correspondence', id);

  // Terminal status check
  if (CORRESPONDENCE_TERMINAL_STATUSES.includes(existing.status)) {
    throw new Error(`Cannot transition Correspondence from terminal status '${existing.status}'.`);
  }

  // Transition validity check — use correct map for subtype
  const transitions = getCorrespondenceTransitions(
    existing.subtype as 'letter' | 'notice' | 'claim' | 'back_charge',
  );
  const allowed = transitions[existing.status];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(
      `Invalid Correspondence transition: '${existing.status}' -> '${newStatus}'. Allowed: [${(allowed ?? []).join(', ')}]`,
    );
  }

  // Workflow guard: block manual approval-phase actions when workflow is active.
  // These actions are driven by the workflow step service, not direct transitions.
  if (CORRESPONDENCE_WORKFLOW_MANAGED_ACTIONS.includes(action)) {
    const activeWorkflow = await prisma.workflowInstance.findFirst({
      where: {
        recordType: 'correspondence',
        recordId: id,
        status: { in: ['in_progress', 'returned'] },
      },
    });
    if (activeWorkflow) {
      throw new Error(
        `Cannot manually '${action}' this Correspondence — the approval phase is managed by workflow instance ${activeWorkflow.id}. Use the workflow approval actions instead.`,
      );
    }
  }

  // Transitions that require a transaction (posting or ref number)
  const needsTransaction = newStatus === 'issued';

  let updated: Awaited<ReturnType<typeof prisma.correspondence.update>>;

  if (needsTransaction) {
    updated = await prisma.$transaction(async (tx) => {
      const updateData: Record<string, unknown> = { status: newStatus };

      // Assign reference number at issued
      const typeCode = getTypeCode(existing.subtype);
      const refNum = await generateReferenceNumber(existing.projectId, typeCode, tx);
      updateData.referenceNumber = refNum;

      const result = await (tx as any).correspondence.update({
        where: { id },
        data: updateData,
        include: { project: true },
      });

      await auditService.log(
        {
          actorUserId,
          actorSource: 'user',
          action: `correspondence.transition.${action}`,
          resourceType: 'correspondence',
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

    // Fire posting event for claim issued (outside tx)
    if (existing.subtype === 'claim') {
      await postingService.post({
        eventType: 'CLAIM_ISSUED',
        sourceService: 'commercial',
        sourceRecordType: 'correspondence',
        sourceRecordId: existing.id,
        projectId: existing.projectId,
        entityId: existing.project.entityId,
        idempotencyKey: `correspondence:${existing.id}:claim_issued`,
        payload: {
          correspondenceId: existing.id,
          claimType: existing.claimType ?? 'unknown',
          claimedAmount: existing.claimedAmount?.toString() ?? '0',
          claimedTimeDays: existing.claimedTimeDays ?? null,
          currency: existing.currency ?? 'SAR',
          projectId: existing.projectId,
        },
        actorUserId,
      });
    }

    // Fire posting event for back_charge issued (outside tx)
    if (existing.subtype === 'back_charge') {
      await postingService.post({
        eventType: 'BACK_CHARGE_ISSUED',
        sourceService: 'commercial',
        sourceRecordType: 'correspondence',
        sourceRecordId: existing.id,
        projectId: existing.projectId,
        entityId: existing.project.entityId,
        idempotencyKey: `correspondence:${existing.id}:back_charge_issued`,
        payload: {
          correspondenceId: existing.id,
          targetName: existing.targetName ?? 'unknown',
          category: existing.category ?? 'other',
          chargedAmount: existing.chargedAmount?.toString() ?? '0',
          currency: existing.currency ?? 'SAR',
          projectId: existing.projectId,
        },
        actorUserId,
      });
    }
  } else {
    // Simple status update
    updated = await prisma.correspondence.update({
      where: { id },
      data: { status: newStatus as CorrespondenceStatus },
      include: { project: true },
    });

    await auditService.log({
      actorUserId,
      actorSource: 'user',
      action: `correspondence.transition.${action}`,
      resourceType: 'correspondence',
      resourceId: id,
      projectId: existing.projectId,
      beforeJson: existing as any,
      afterJson: updated as any,
      reason: comment ?? null,
    });

    // After the status update succeeds, try to start a workflow instance.
    // Correspondence triggers workflow on submit → under_review (not 'submitted').
    // The subtype drives template selection (e.g. letter_standard, claim_with_finance).
    if (action === 'submit' && newStatus === 'under_review') {
      try {
        const resolution = await resolveTemplate(
          'correspondence',
          existing.projectId,
          existing.subtype,
        );
        if (resolution) {
          await workflowInstanceService.startInstance({
            templateCode: resolution.code,
            recordType: 'correspondence',
            recordId: id,
            projectId: existing.projectId,
            startedBy: actorUserId,
            resolutionSource: resolution.source,
          });
        } else {
          console.warn(
            `[correspondence-workflow] No workflow template configured for correspondence subtype '${existing.subtype}' in project ${existing.projectId}`,
          );
        }
      } catch (err) {
        if (
          err instanceof TemplateNotActiveError ||
          err instanceof DuplicateInstanceError
        ) {
          console.warn(
            `[correspondence-workflow] Skipped workflow start for Correspondence ${id}: ${(err as Error).message}`,
          );
        } else {
          throw err;
        }
      }
    }
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Update settlement / recovery fields (post-issuance only)
// ---------------------------------------------------------------------------

/** Claim statuses where settlement values can be entered/updated. */
const CLAIM_SETTLEMENT_STATES = [
  'under_evaluation',
  'partially_accepted',
  'accepted',
  'disputed',
];

/** Back-charge statuses where recovery values can be entered/updated. */
const BC_RECOVERY_STATES = [
  'acknowledged',
  'disputed',
  'partially_recovered',
  'recovered',
];

/**
 * Update settlement fields on a post-issuance correspondence.
 *
 * For claims: settledAmount + settledTimeDays.
 * For back charges: settledAmount doubles as "recovered amount".
 *
 * Only allowed in specific post-issuance states — draft/returned editing
 * is handled by the regular `updateCorrespondence` function.
 */
export async function updateSettlementFields(
  id: string,
  fields: { settledAmount?: number | null; settledTimeDays?: number | null },
  actorUserId: string,
  projectId: string,
) {
  const existing = await prisma.correspondence.findUniqueOrThrow({
    where: { id },
  });
  assertProjectScope(existing, projectId, 'Correspondence', id);

  const isClaimSettlement =
    existing.subtype === 'claim' &&
    CLAIM_SETTLEMENT_STATES.includes(existing.status);
  const isBcRecovery =
    existing.subtype === 'back_charge' &&
    BC_RECOVERY_STATES.includes(existing.status);

  if (!isClaimSettlement && !isBcRecovery) {
    throw new Error(
      `Cannot update settlement fields for ${existing.subtype} in status '${existing.status}'.`,
    );
  }

  const data: Record<string, unknown> = {};
  if (fields.settledAmount !== undefined) data.settledAmount = fields.settledAmount;
  if (fields.settledTimeDays !== undefined) data.settledTimeDays = fields.settledTimeDays;

  if (Object.keys(data).length === 0) {
    return existing;
  }

  const updated = await prisma.correspondence.update({
    where: { id },
    data,
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'correspondence.settlement_update',
    resourceType: 'correspondence',
    resourceId: id,
    projectId: existing.projectId,
    beforeJson: {
      settledAmount: existing.settledAmount?.toString() ?? null,
      settledTimeDays: existing.settledTimeDays,
    },
    afterJson: {
      settledAmount: updated.settledAmount?.toString() ?? null,
      settledTimeDays: updated.settledTimeDays,
    },
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Get
// ---------------------------------------------------------------------------

export async function getCorrespondence(id: string, projectId: string) {
  const record = await prisma.correspondence.findUniqueOrThrow({
    where: { id },
    include: { project: true },
  });
  assertProjectScope(record, projectId, 'Correspondence', id);
  return record;
}

// ---------------------------------------------------------------------------
// List (paginated + filters)
// ---------------------------------------------------------------------------

export async function listCorrespondences(
  input: ListFilterInput,
  extra?: CorrespondenceListFilter,
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
    const claimedAmount: Record<string, unknown> = {};
    if (input.amountMin !== undefined) claimedAmount.gte = input.amountMin;
    if (input.amountMax !== undefined) claimedAmount.lte = input.amountMax;
    where.claimedAmount = claimedAmount;
  }

  if (input.createdByFilter) {
    where.createdBy = input.createdByFilter;
  }

  const orderBy: Record<string, string> = {};
  orderBy[input.sortField ?? 'createdAt'] = input.sortDirection ?? 'desc';

  const [items, total] = await Promise.all([
    prisma.correspondence.findMany({
      where,
      orderBy,
      skip: input.skip ?? 0,
      take: input.take ?? 20,
      include: { project: true },
    }),
    prisma.correspondence.count({ where }),
  ]);

  return { items, total };
}

// ---------------------------------------------------------------------------
// Delete (draft only -- hard delete)
// ---------------------------------------------------------------------------

export async function deleteCorrespondence(id: string, actorUserId: string, projectId: string) {
  const existing = await prisma.correspondence.findUniqueOrThrow({ where: { id } });
  assertProjectScope(existing, projectId, 'Correspondence', id);

  if (existing.status !== 'draft') {
    throw new Error(`Cannot delete Correspondence in status '${existing.status}'. Only draft Correspondences can be deleted.`);
  }

  await prisma.correspondence.delete({ where: { id } });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'correspondence.delete',
    resourceType: 'correspondence',
    resourceId: id,
    projectId: existing.projectId,
    beforeJson: existing as any,
    afterJson: null,
  });
}
