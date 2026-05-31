/**
 * CreditNote service — project-scoped CRUD with status transitions + posting.
 *
 * Module 3 Procurement Engine — Credit Note lifecycle.
 */
import { prisma, Prisma, runAsWorkflowEngine } from '@fmksa/db';
import type { CreditNoteStatus } from '@fmksa/db';
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
import { assertProjectScope } from '../../scope-binding';
import {
  CN_TRANSITIONS,
  CN_TERMINAL_STATUSES,
  CN_ACTION_TO_STATUS,
} from './transitions';
import { absorbCreditNoteReversal } from '../../budget/absorption';

// ---------------------------------------------------------------------------
// Create (status: received)
// ---------------------------------------------------------------------------

export async function createCreditNote(
  input: {
    projectId: string;
    vendorId: string;
    subtype: string;
    creditNoteNumber: string;
    supplierInvoiceId?: string | null | undefined;
    purchaseOrderId?: string | null | undefined;
    correspondenceId?: string | null | undefined;
    amount: number | string;
    currency: string;
    reason: string;
    receivedDate: string;
  },
  actorUserId: string,
) {
  // PIC-80: entity create + audit + workflow seed atomic; emit deferred to post-commit.
  // PIC-84: creditNoteNumber is user-supplied + now per-tenant unique ([orgId, number]);
  // translate a uniqueness P2002 into a tenant-scoped message.
  try {
    const { record, deferred } = await prisma.$transaction(async (tx) => {
      const record = await (tx as any).creditNote.create({
        data: {
          projectId: input.projectId,
          vendorId: input.vendorId,
          subtype: input.subtype as any,
          creditNoteNumber: input.creditNoteNumber,
          supplierInvoiceId: input.supplierInvoiceId ?? null,
          purchaseOrderId: input.purchaseOrderId ?? null,
          correspondenceId: input.correspondenceId ?? null,
          amount: input.amount,
          currency: input.currency,
          reason: input.reason,
          receivedDate: new Date(input.receivedDate),
          status: 'received',
          createdBy: actorUserId,
        },
      });

      await auditService.log(
        {
          actorUserId,
          actorSource: 'user',
          action: 'credit_note.create',
          resourceType: 'credit_note',
          resourceId: record.id,
          projectId: input.projectId,
          beforeJson: null,
          afterJson: record as any,
        },
        tx,
      );

      // PIC-35 Step 5: auto-seed workflow_instance at entity-create (on tx).
      const deferred = await autoSeedCreditNoteWorkflow(record.id, input.projectId, actorUserId, tx);

      return { record, deferred };
    });

    // PIC-80 outbox-ready seam: emit 'workflow.started' after commit.
    await dispatchDeferred(deferred);

    return record;
  } catch (err: unknown) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new Error(
        `Credit note number "${input.creditNoteNumber}" already exists in your organization.`,
      );
    }
    throw err;
  }
}

async function autoSeedCreditNoteWorkflow(
  recordId: string,
  projectId: string,
  actorUserId: string,
  tx: TransactionClient,
): Promise<DeferredWorkflowEvent | null> {
  try {
    const resolution = await resolveTemplate('credit_note', projectId);
    if (!resolution) {
      console.warn(
        `[credit-note-workflow] No template configured for credit_note in project ${projectId}; workflow_instance not seeded for ${recordId}`,
      );
      return null;
    }
    const { deferredEvent } = await workflowInstanceService.startInstanceDeferred({
      templateCode: resolution.code,
      recordType: 'credit_note',
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
        `[credit-note-workflow] Skipped workflow auto-seed for CreditNote ${recordId}: ${(err as Error).message}`,
      );
      return null;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Get (with vendor, supplierInvoice, purchaseOrder relations)
// ---------------------------------------------------------------------------

export async function getCreditNote(id: string, projectId: string) {
  const record = await prisma.creditNote.findUniqueOrThrow({
    where: { id },
    include: {
      vendor: true,
      supplierInvoice: true,
      purchaseOrder: true,
      correspondence: {
        select: { id: true, referenceNumber: true, subject: true },
      },
    },
  });
  assertProjectScope(record, projectId, 'CreditNote', id);
  return record;
}

// ---------------------------------------------------------------------------
// List (ordered by createdAt desc)
// ---------------------------------------------------------------------------

export async function listCreditNotes(projectId: string) {
  return prisma.creditNote.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    include: { vendor: true, supplierInvoice: true, purchaseOrder: true },
  });
}

// ---------------------------------------------------------------------------
// Transition (with CREDIT_NOTE_APPLIED posting event)
// ---------------------------------------------------------------------------

export async function transitionCreditNote(
  params: { projectId: string; id: string; action: string; comment?: string | undefined },
  actorUserId: string,
) {
  // PIC-35 Step 7 wrap (missed in original Step 7 pass — PIC-47 follow-up).
  return runAsWorkflowEngine(async () => {
  const { projectId, id, action, comment } = params;

  const newStatus = CN_ACTION_TO_STATUS[action];
  if (!newStatus) {
    throw new Error(`Unknown credit note action: '${action}'`);
  }

  const existing = await prisma.creditNote.findUniqueOrThrow({
    where: { id },
    include: { project: true },
  });
  assertProjectScope(existing, projectId, 'CreditNote', id);

  // Terminal status check
  if (CN_TERMINAL_STATUSES.includes(existing.status)) {
    throw new Error(`Cannot transition credit note from terminal status '${existing.status}'.`);
  }

  // Transition validity check
  const allowed = CN_TRANSITIONS[existing.status];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(
      `Invalid credit note transition: '${existing.status}' -> '${newStatus}'. Allowed: [${(allowed ?? []).join(', ')}]`,
    );
  }

  const updated = await prisma.creditNote.update({
    where: { id },
    data: { status: newStatus as CreditNoteStatus },
    include: { project: true },
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: `credit_note.transition.${action}`,
    resourceType: 'credit_note',
    resourceId: id,
    projectId: existing.projectId,
    beforeJson: existing as any,
    afterJson: updated as any,
    reason: comment ?? null,
  });

  // Budget absorption: CN applied → actualAmount-- (cost reversal)
  if (newStatus === 'applied') {
    const result = await absorbCreditNoteReversal(existing.projectId, existing.id, actorUserId);
    if (!result.absorbed) {
      console.warn(`[CN ${id}] Budget reversal failed: ${result.reasonCode} — ${result.message}`);
    }
  }

  // Fire CREDIT_NOTE_APPLIED posting event when transitioning to applied
  if (newStatus === 'applied') {
    await postingService.post({
      eventType: 'CREDIT_NOTE_APPLIED',
      sourceService: 'procurement',
      sourceRecordType: 'credit_note',
      sourceRecordId: updated.id,
      projectId: updated.projectId,
      entityId: updated.project.entityId,
      idempotencyKey: `credit-note-applied-${updated.id}`,
      payload: {
        creditNoteId: updated.id,
        creditNoteNumber: updated.creditNoteNumber,
        vendorId: updated.vendorId,
        subtype: updated.subtype,
        amount: String(updated.amount),
        currency: updated.currency,
        reason: updated.reason,
        supplierInvoiceId: updated.supplierInvoiceId,
        purchaseOrderId: updated.purchaseOrderId,
        projectId: updated.projectId,
        entityId: updated.project.entityId,
      },
      actorUserId,
    });
  }

  return updated;
  });
}
