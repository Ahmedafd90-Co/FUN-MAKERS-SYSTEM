import { prisma } from '@fmksa/db';
import type { IpaStatus } from '@fmksa/db';
import type { CreateIpaInput, UpdateIpaInput, ListFilterInput } from '@fmksa/contracts';
import { auditService } from '../../audit/service';
import { workflowInstanceService, TemplateNotActiveError, DuplicateInstanceError, resolveTemplate } from '../../workflow';
import { postingService } from '../../posting/service';
import { generateReferenceNumber } from '../reference-number/service';
import { IPA_TRANSITIONS, IPA_TERMINAL_STATUSES, IPA_WORKFLOW_MANAGED_ACTIONS } from './transitions';
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

export async function updateIpa(input: UpdateIpaInput, actorUserId: string, projectId: string) {
  const existing = await prisma.ipa.findUniqueOrThrow({ where: { id: input.id } });
  assertProjectScope(existing, projectId, 'IPA', input.id);

  if (existing.origin === 'imported_historical') {
    throw new Error(
      `Cannot update IPA ${input.id} via the live update path: record was imported. Use 'Adjust imported IPA' instead.`,
    );
  }

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
  projectId?: string,
) {
  const newStatus = ACTION_TO_STATUS[action];
  if (!newStatus) {
    throw new Error(`Unknown IPA action: '${action}'`);
  }

  const existing = await prisma.ipa.findUniqueOrThrow({
    where: { id },
    include: { project: true },
  });
  if (projectId) assertProjectScope(existing, projectId, 'IPA', id);

  // Import provenance guard — imported historical IPAs never run through
  // the live workflow machinery. Corrections flow through adjustIpa().
  if (existing.origin === 'imported_historical') {
    throw new Error(
      `Cannot transition IPA ${id}: record was imported from historical sheet and is not managed by live workflow. Use the 'Adjust imported IPA' action instead.`,
    );
  }

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

  // Workflow guard: block manual approval-phase actions when workflow is active.
  // These actions are driven by the workflow step service, not direct transitions.
  if (IPA_WORKFLOW_MANAGED_ACTIONS.includes(action)) {
    const activeWorkflow = await prisma.workflowInstance.findFirst({
      where: {
        recordType: 'ipa',
        recordId: id,
        status: { in: ['in_progress', 'returned'] },
      },
    });
    if (activeWorkflow) {
      throw new Error(
        `Cannot manually '${action}' this IPA — the approval phase is managed by workflow instance ${activeWorkflow.id}. Use the workflow approval actions instead.`,
      );
    }
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
      data: { status: newStatus as IpaStatus },
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

    // After the status update succeeds, try to start a workflow instance.
    // If no active template exists for 'ipa', this is graceful — the transition
    // still succeeds. Workflows are optional infrastructure.
    if (newStatus === 'submitted') {
      try {
        const resolution = await resolveTemplate('ipa', existing.projectId);
        if (resolution) {
          await workflowInstanceService.startInstance({
            templateCode: resolution.code,
            recordType: 'ipa',
            recordId: id,
            projectId: existing.projectId,
            startedBy: actorUserId,
            resolutionSource: resolution.source,
          });
        } else {
          console.warn(`[ipa-workflow] No workflow template configured for IPA in project ${existing.projectId}`);
        }
      } catch (err) {
        if (
          err instanceof TemplateNotActiveError ||
          err instanceof DuplicateInstanceError
        ) {
          console.warn(`[ipa-workflow] Skipped workflow start for IPA ${id}: ${(err as Error).message}`);
        } else {
          throw err;
        }
      }
    }
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Get
// ---------------------------------------------------------------------------

export async function getIpa(id: string, projectId: string) {
  const record = await prisma.ipa.findUniqueOrThrow({
    where: { id },
    include: { project: true },
  });
  assertProjectScope(record, projectId, 'IPA', id);
  return record;
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
// Adjust — post-commit corrections (imported IPAs or live correction path)
//
// Writes a header IpaAdjustmentBatch, a row IpaAdjustmentField per changed
// field, and — when monetary fields change — emits ONE IPA_ADJUSTMENT
// posting event whose payload carries the deltas (not absolute values).
// ---------------------------------------------------------------------------

const MONETARY_FIELDS = new Set([
  'grossAmount',
  'retentionRate',
  'retentionAmount',
  'previousCertified',
  'currentClaim',
  'advanceRecovery',
  'otherDeductions',
  'netClaimed',
]);

export async function adjustIpa(
  input: {
    ipaId: string;
    projectId: string;
    adjustmentType: 'imported_correction' | 'manual_correction' | 'period_recategorization';
    reason: string;
    changes: Partial<{
      grossAmount: string;
      retentionRate: string;
      retentionAmount: string;
      previousCertified: string;
      currentClaim: string;
      advanceRecovery: string | null;
      otherDeductions: string | null;
      netClaimed: string;
      description: string | null;
      status: IpaStatus;
      periodFrom: string;
      periodTo: string;
    }>;
    approvedBy?: string;
  },
  actorUserId: string,
) {
  const existing = await prisma.ipa.findUniqueOrThrow({
    where: { id: input.ipaId },
    include: { project: true },
  });
  assertProjectScope(existing, input.projectId, 'IPA', input.ipaId);

  if (
    existing.origin !== 'imported_historical' &&
    input.adjustmentType === 'imported_correction'
  ) {
    throw new Error(
      `adjustmentType='imported_correction' is only valid for imported IPAs. This IPA is origin='live'.`,
    );
  }

  const changedFields: Array<{ field: string; before: string; after: string }> = [];
  const dataForUpdate: Record<string, unknown> = {};

  for (const [field, after] of Object.entries(input.changes)) {
    if (after === undefined) continue;
    const before = (existing as any)[field];
    const beforeStr =
      before === null || before === undefined
        ? ''
        : before instanceof Date
          ? before.toISOString()
          : before.toString();
    const afterStr =
      after === null || after === undefined
        ? ''
        : typeof after === 'string'
          ? after
          : String(after);
    if (beforeStr === afterStr) continue;
    changedFields.push({ field, before: beforeStr, after: afterStr });
    if (field === 'periodFrom' || field === 'periodTo') {
      dataForUpdate[field] = new Date(afterStr);
    } else {
      dataForUpdate[field] = after;
    }
  }

  if (changedFields.length === 0) {
    throw new Error('adjustIpa called with no field changes.');
  }

  // 1. Header + fields + Ipa row update in one tx
  const { batch, updated } = await prisma.$transaction(async (tx) => {
    const header = await tx.ipaAdjustmentBatch.create({
      data: {
        ipaId: input.ipaId,
        adjustmentType: input.adjustmentType,
        reason: input.reason,
        actorUserId,
        approvedBy: input.approvedBy ?? null,
      },
    });

    await tx.ipaAdjustmentField.createMany({
      data: changedFields.map((c) => ({
        batchId: header.id,
        fieldName: c.field,
        beforeValue: c.before,
        afterValue: c.after,
      })),
    });

    const upd = await tx.ipa.update({
      where: { id: input.ipaId },
      data: dataForUpdate,
    });

    await auditService.log(
      {
        actorUserId,
        actorSource: 'user',
        action: 'ipa.adjust',
        resourceType: 'ipa',
        resourceId: input.ipaId,
        projectId: input.projectId,
        beforeJson: existing as any,
        afterJson: {
          adjustmentBatchId: header.id,
          adjustmentType: input.adjustmentType,
          changedFields,
        },
        reason: input.reason,
      },
      tx,
    );

    return { batch: header, updated: upd };
  });

  // 2. If any monetary field changed, post ONE IPA_ADJUSTMENT event with deltas
  const hasMonetary = changedFields.some((c) => MONETARY_FIELDS.has(c.field));
  if (hasMonetary) {
    const grossBefore = parseFloat(existing.grossAmount.toString());
    const grossAfter = parseFloat(updated.grossAmount.toString());
    const retBefore = parseFloat(existing.retentionAmount.toString());
    const retAfter = parseFloat(updated.retentionAmount.toString());
    const netBefore = parseFloat(existing.netClaimed.toString());
    const netAfter = parseFloat(updated.netClaimed.toString());

    const posted = await postingService.post({
      eventType: 'IPA_ADJUSTMENT',
      sourceService: 'commercial',
      sourceRecordType: 'ipa_adjustment_batch',
      sourceRecordId: batch.id,
      projectId: input.projectId,
      entityId: existing.project.entityId ?? undefined,
      idempotencyKey: `ipa-adjustment-${batch.id}`,
      // Origin matches the IPA: imported IPAs are corrected against imported
      // history; live IPAs are corrected against live history. This keeps
      // reconciliation's origin-aware split consistent.
      origin: existing.origin === 'imported_historical' ? 'imported_historical' : 'live',
      importBatchId: existing.importBatchId ?? null,
      payload: {
        ipaAdjustmentBatchId: batch.id,
        ipaId: input.ipaId,
        adjustmentType: input.adjustmentType,
        reason: input.reason,
        grossAmountDelta: (grossAfter - grossBefore).toFixed(2),
        retentionAmountDelta: (retAfter - retBefore).toFixed(2),
        netClaimedDelta: (netAfter - netBefore).toFixed(2),
        currency: updated.currency,
        projectId: input.projectId,
      },
      actorUserId,
    });

    await prisma.ipaAdjustmentBatch.update({
      where: { id: batch.id },
      data: { postingEventId: posted.id },
    });
  }

  return { batchId: batch.id, changedFields: changedFields.length };
}

// ---------------------------------------------------------------------------
// Delete (draft only — hard delete)
// ---------------------------------------------------------------------------

export async function deleteIpa(id: string, actorUserId: string, projectId: string) {
  const existing = await prisma.ipa.findUniqueOrThrow({ where: { id } });
  assertProjectScope(existing, projectId, 'IPA', id);

  if (existing.origin === 'imported_historical') {
    throw new Error(
      `Cannot delete IPA ${id}: imported historical records are append-only. Flag exclusion through import review instead.`,
    );
  }

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
