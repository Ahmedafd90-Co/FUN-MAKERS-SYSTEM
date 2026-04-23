/**
 * Purchase Order service — project-scoped CRUD with status transitions
 * and posting events.
 *
 * Module 3 Procurement Engine.
 */
import { prisma } from '@fmksa/db';
import type { PurchaseOrderStatus } from '@fmksa/db';
import { auditService } from '../../audit/service';
import { postingService } from '../../posting/service';
import { generateReferenceNumber } from '../../commercial/reference-number/service';
import { assertProjectScope } from '../../scope-binding';
import { PO_TRANSITIONS, PO_TERMINAL_STATUSES, PO_ACTION_TO_STATUS, PO_APPROVED_PLUS_STATUSES, PO_WORKFLOW_MANAGED_ACTIONS } from './transitions';
import { absorbPoCommitment, reversePoCommitment } from '../../budget/absorption';
import {
  workflowInstanceService,
  TemplateNotActiveError,
  DuplicateInstanceError,
  resolveTemplate,
} from '../../workflow';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreatePurchaseOrderInput = {
  projectId: string;
  vendorId: string;
  rfqId?: string | undefined;
  quotationId?: string | undefined;
  vendorContractId?: string | undefined;
  frameworkAgreementId?: string | undefined;
  categoryId?: string | undefined;
  title: string;
  description?: string | undefined;
  totalAmount: number | string;
  currency: string;
  deliveryDate?: string | undefined;
  deliveryAddress?: string | undefined;
  paymentTerms?: string | undefined;
  items?: Array<{
    itemCatalogId?: string | undefined;
    itemDescription: string;
    quantity: number | string;
    unit: string;
    unitPrice: number | string;
    totalPrice: number | string;
  }> | undefined;
};

export type TransitionPurchaseOrderInput = {
  projectId: string;
  id: string;
  action: string;
  comment?: string | undefined;
};

// ---------------------------------------------------------------------------
// Create (transaction-safe with reference number generation)
// ---------------------------------------------------------------------------

export async function createPurchaseOrder(
  input: CreatePurchaseOrderInput,
  actorUserId: string,
) {
  const record = await prisma.$transaction(async (tx) => {
    const poNumber = await generateReferenceNumber(input.projectId, 'PO', tx);

    return (tx as any).purchaseOrder.create({
      data: {
        projectId: input.projectId,
        vendorId: input.vendorId,
        rfqId: input.rfqId ?? null,
        quotationId: input.quotationId ?? null,
        vendorContractId: input.vendorContractId ?? null,
        frameworkAgreementId: input.frameworkAgreementId ?? null,
        categoryId: input.categoryId ?? null,
        poNumber,
        title: input.title,
        description: input.description ?? null,
        totalAmount: input.totalAmount,
        currency: input.currency,
        deliveryDate: input.deliveryDate ? new Date(input.deliveryDate) : null,
        deliveryAddress: input.deliveryAddress ?? null,
        paymentTerms: input.paymentTerms ?? null,
        status: 'draft' as PurchaseOrderStatus,
        createdBy: actorUserId,
        ...(input.items && input.items.length > 0
          ? {
              items: {
                create: input.items.map((item) => ({
                  itemCatalogId: item.itemCatalogId ?? null,
                  itemDescription: item.itemDescription,
                  quantity: item.quantity,
                  unit: item.unit,
                  unitPrice: item.unitPrice,
                  totalPrice: item.totalPrice,
                })),
              },
            }
          : {}),
      },
      include: { items: true },
    });
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'purchase_order.create',
    resourceType: 'purchase_order',
    resourceId: record.id,
    projectId: input.projectId,
    beforeJson: null,
    afterJson: record as any,
  });

  return record;
}

// ---------------------------------------------------------------------------
// Get (with items, vendor, category)
// ---------------------------------------------------------------------------

export async function getPurchaseOrder(id: string, projectId: string) {
  const record = await prisma.purchaseOrder.findUniqueOrThrow({
    where: { id },
    include: { items: true, vendor: true, category: true },
  });
  assertProjectScope(record, projectId, 'PurchaseOrder', id);

  // The PurchaseOrder schema stores rfqId / quotationId as scalar foreign
  // keys but does not declare Prisma relations for them. Fetch the two
  // lookups explicitly so the UI can render real references instead of
  // generic "View RFQ" / "-" fallbacks.
  const [rfq, quotation] = await Promise.all([
    record.rfqId
      ? prisma.rFQ.findUnique({
          where: { id: record.rfqId },
          select: { id: true, referenceNumber: true },
        })
      : Promise.resolve(null),
    record.quotationId
      ? prisma.quotation.findUnique({
          where: { id: record.quotationId },
          select: { id: true, quotationRef: true },
        })
      : Promise.resolve(null),
  ]);

  return { ...record, rfq, quotation };
}

// ---------------------------------------------------------------------------
// List (project-scoped, ordered by createdAt desc)
// ---------------------------------------------------------------------------

export async function listPurchaseOrders(projectId: string) {
  return prisma.purchaseOrder.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    include: { items: true, vendor: true, category: true },
  });
}

// ---------------------------------------------------------------------------
// Transition (with posting events for issued + delivered)
// ---------------------------------------------------------------------------

export async function transitionPurchaseOrder(
  input: TransitionPurchaseOrderInput,
  actorUserId: string,
) {
  const { projectId, id, action, comment } = input;

  const newStatus = PO_ACTION_TO_STATUS[action];
  if (!newStatus) {
    throw new Error(`Unknown purchase order action: '${action}'`);
  }

  const existing = await prisma.purchaseOrder.findUniqueOrThrow({
    where: { id },
    include: { project: true },
  });
  assertProjectScope(existing, projectId, 'PurchaseOrder', id);

  // Terminal status check
  if (PO_TERMINAL_STATUSES.includes(existing.status)) {
    throw new Error(
      `Cannot transition purchase order from terminal status '${existing.status}'.`,
    );
  }

  // Transition validity check
  const allowed = PO_TRANSITIONS[existing.status];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(
      `Invalid purchase order transition: '${existing.status}' -> '${newStatus}'. Allowed: [${(allowed ?? []).join(', ')}]`,
    );
  }

  // Workflow guard: block manual approval-phase actions when a workflow is
  // active. These actions are driven by the workflow step service, not direct
  // transitions. Legacy manual approval is still allowed when no workflow
  // instance exists (projects without a PO workflow template configured).
  if (PO_WORKFLOW_MANAGED_ACTIONS.includes(action)) {
    const activeWorkflow = await prisma.workflowInstance.findFirst({
      where: {
        recordType: 'purchase_order',
        recordId: id,
        status: { in: ['in_progress', 'returned'] },
      },
    });
    if (activeWorkflow) {
      throw new Error(
        `Cannot manually '${action}' this PO — the approval phase is managed by workflow instance ${activeWorkflow.id}. Use the workflow approval actions instead.`,
      );
    }
  }

  // Update status
  const updated = await prisma.purchaseOrder.update({
    where: { id },
    data: { status: newStatus as any },
    include: { project: true },
  });

  // Audit log
  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: `purchase_order.transition.${action}`,
    resourceType: 'purchase_order',
    resourceId: id,
    projectId: existing.projectId,
    beforeJson: existing as any,
    afterJson: updated as any,
    reason: comment ?? null,
  });

  // ---------------------------------------------------------------------------
  // Auto-start workflow on submit (parity with IPA / IPC / Correspondence)
  // ---------------------------------------------------------------------------
  // If no active template exists for 'purchase_order', this is graceful — the
  // transition still succeeds. Workflows are optional infrastructure; projects
  // without a template fall back to manual approval.
  if (newStatus === 'submitted') {
    try {
      const resolution = await resolveTemplate('purchase_order', existing.projectId);
      if (resolution) {
        await workflowInstanceService.startInstance({
          templateCode: resolution.code,
          recordType: 'purchase_order',
          recordId: id,
          projectId: existing.projectId,
          startedBy: actorUserId,
          resolutionSource: resolution.source,
        });
      } else {
        console.warn(
          `[po-workflow] No workflow template configured for purchase_order in project ${existing.projectId}`,
        );
      }
    } catch (err) {
      if (err instanceof TemplateNotActiveError || err instanceof DuplicateInstanceError) {
        console.warn(
          `[po-workflow] Skipped workflow start for PO ${id}: ${(err as Error).message}`,
        );
      } else {
        throw err;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Posting events
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Budget absorption: PO approved → committedAmount++
  // ---------------------------------------------------------------------------

  if (newStatus === 'approved') {
    // Budget absorption: committedAmount++ on the budget line
    const result = await absorbPoCommitment(existing.projectId, existing.id, actorUserId);
    if (!result.absorbed) {
      // BUDGET MAPPING POLICY: Block PO approval if budget mapping is missing.
      // PO is the commitment decision — there is time to fix the mapping before approving.
      // The exception is already recorded; now roll back the status transition.
      const BLOCKING_REASONS = ['no_category', 'no_budget', 'no_budget_category', 'no_budget_line'];
      if (BLOCKING_REASONS.includes(result.reasonCode)) {
        // Revert the status — the PO stays in its previous state
        await prisma.purchaseOrder.update({
          where: { id },
          data: { status: existing.status as any },
        });
        throw new Error(
          `PO approval blocked: budget absorption failed (${result.reasonCode}). ` +
          `${result.message} Fix the budget mapping before approving this PO. ` +
          `Exception ID: ${result.exceptionId}`,
        );
      }
      // For internal_error (infra crash), allow the transition but warn
      console.warn(`[PO ${id}] Budget absorption failed (non-blocking): ${result.reasonCode} — ${result.message}`);
    }

    // Posting event: PO_COMMITTED fires at the same moment as budget absorption.
    // This aligns the posting ledger with budget absorption and the committed_cost KPI.
    await postingService.post({
      eventType: 'PO_COMMITTED',
      sourceService: 'procurement',
      sourceRecordType: 'purchase_order',
      sourceRecordId: existing.id,
      projectId: existing.projectId,
      entityId: existing.project.entityId,
      idempotencyKey: `po-committed-${existing.id}`,
      payload: {
        purchaseOrderId: existing.id,
        poNumber: existing.poNumber,
        vendorId: existing.vendorId,
        totalAmount: String(existing.totalAmount),
        currency: existing.currency,
        categoryId: existing.categoryId,
        projectId: existing.projectId,
        entityId: existing.project.entityId,
      },
      actorUserId,
    });
  }

  // Budget absorption: PO cancelled from approved+ → committedAmount--
  if (newStatus === 'cancelled' && PO_APPROVED_PLUS_STATUSES.includes(existing.status)) {
    const result = await reversePoCommitment(existing.projectId, existing.id, actorUserId);
    if (!result.absorbed) {
      console.warn(`[PO ${id}] Budget reversal failed: ${result.reasonCode} — ${result.message}`);
    }
  }

  if (newStatus === 'issued') {
    await postingService.post({
      eventType: 'PO_ISSUED',
      sourceService: 'procurement',
      sourceRecordType: 'purchase_order',
      sourceRecordId: existing.id,
      projectId: existing.projectId,
      entityId: existing.project.entityId,
      idempotencyKey: `po-issued-${existing.id}`,
      payload: {
        purchaseOrderId: existing.id,
        poNumber: existing.poNumber,
        vendorId: existing.vendorId,
        totalAmount: String(existing.totalAmount),
        currency: existing.currency,
        categoryId: existing.categoryId,
        projectId: existing.projectId,
        entityId: existing.project.entityId,
      },
      actorUserId,
    });
  }

  if (newStatus === 'delivered') {
    await postingService.post({
      eventType: 'PO_DELIVERED',
      sourceService: 'procurement',
      sourceRecordType: 'purchase_order',
      sourceRecordId: existing.id,
      projectId: existing.projectId,
      entityId: existing.project.entityId,
      idempotencyKey: `po-delivered-${existing.id}`,
      payload: {
        purchaseOrderId: existing.id,
        poNumber: existing.poNumber,
        vendorId: existing.vendorId,
        totalAmount: String(existing.totalAmount),
        deliveredAmount: String(existing.totalAmount),
        currency: existing.currency,
        projectId: existing.projectId,
        entityId: existing.project.entityId,
      },
      actorUserId,
    });
  }

  return updated;
}
