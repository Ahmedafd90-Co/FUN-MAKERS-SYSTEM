/**
 * Supplier Invoice service — project-scoped CRUD with status transitions
 * and posting events.
 *
 * Module 3 Procurement Engine.
 */
import { prisma } from '@fmksa/db';
import type { SupplierInvoiceStatus } from '@fmksa/db';
import { auditService } from '../../audit/service';
import { postingService } from '../../posting/service';
import { generateReferenceNumber } from '../../commercial/reference-number/service';
import { assertProjectScope } from '../../scope-binding';
import { SI_TRANSITIONS, SI_TERMINAL_STATUSES, SI_ACTION_TO_STATUS, SI_WORKFLOW_MANAGED_ACTIONS } from './transitions';
import { absorbSupplierInvoiceActual } from '../../budget/absorption';
import {
  workflowInstanceService,
  TemplateNotActiveError,
  DuplicateInstanceError,
  resolveTemplate,
} from '../../workflow';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreateSupplierInvoiceInput = {
  projectId: string;
  vendorId: string;
  purchaseOrderId?: string | undefined;
  invoiceDate: string;
  grossAmount: number | string;
  vatRate: number | string;
  vatAmount: number | string;
  totalAmount: number | string;
  dueDate?: string | undefined;
  currency: string;
  categoryId?: string | undefined;
  noPOReason?: string | undefined;
};

export type TransitionSupplierInvoiceInput = {
  projectId: string;
  id: string;
  action: string;
  comment?: string | undefined;
};

// ---------------------------------------------------------------------------
// Create (transaction-safe with reference number generation)
// ---------------------------------------------------------------------------

export async function createSupplierInvoice(
  input: CreateSupplierInvoiceInput,
  actorUserId: string,
) {
  const record = await prisma.$transaction(async (tx) => {
    const invoiceNumber = await generateReferenceNumber(input.projectId, 'SI', tx);

    return (tx as any).supplierInvoice.create({
      data: {
        projectId: input.projectId,
        vendorId: input.vendorId,
        purchaseOrderId: input.purchaseOrderId ?? null,
        invoiceNumber,
        invoiceDate: new Date(input.invoiceDate),
        grossAmount: input.grossAmount,
        vatRate: input.vatRate,
        vatAmount: input.vatAmount,
        totalAmount: input.totalAmount,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        currency: input.currency,
        categoryId: input.categoryId ?? null,
        noPOReason: input.noPOReason ?? null,
        status: 'received' as SupplierInvoiceStatus,
        createdBy: actorUserId,
      },
    });
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'supplier_invoice.create',
    resourceType: 'supplier_invoice',
    resourceId: record.id,
    projectId: input.projectId,
    beforeJson: null,
    afterJson: record as any,
  });

  return record;
}

// ---------------------------------------------------------------------------
// Get (with vendor, purchaseOrder, category, creditNotes)
// ---------------------------------------------------------------------------

export async function getSupplierInvoice(id: string, projectId: string) {
  const record = await prisma.supplierInvoice.findUniqueOrThrow({
    where: { id },
    include: {
      vendor: true,
      purchaseOrder: true,
      category: true,
      creditNotes: true,
    },
  });
  assertProjectScope(record, projectId, 'SupplierInvoice', id);
  return record;
}

// ---------------------------------------------------------------------------
// List (project-scoped, ordered by createdAt desc)
// ---------------------------------------------------------------------------

export async function listSupplierInvoices(projectId: string) {
  return prisma.supplierInvoice.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    include: {
      vendor: true,
      purchaseOrder: true,
      category: true,
    },
  });
}

// ---------------------------------------------------------------------------
// Transition (with posting event for approved)
// ---------------------------------------------------------------------------

export async function transitionSupplierInvoice(
  input: TransitionSupplierInvoiceInput,
  actorUserId: string,
) {
  const { projectId, id, action, comment } = input;

  const newStatus = SI_ACTION_TO_STATUS[action];
  if (!newStatus) {
    throw new Error(`Unknown supplier invoice action: '${action}'`);
  }

  const existing = await prisma.supplierInvoice.findUniqueOrThrow({
    where: { id },
    include: { project: true },
  });
  assertProjectScope(existing, projectId, 'SupplierInvoice', id);

  // Terminal status check
  if (SI_TERMINAL_STATUSES.includes(existing.status)) {
    throw new Error(
      `Cannot transition supplier invoice from terminal status '${existing.status}'.`,
    );
  }

  // Transition validity check
  const allowed = SI_TRANSITIONS[existing.status];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(
      `Invalid supplier invoice transition: '${existing.status}' -> '${newStatus}'. Allowed: [${(allowed ?? []).join(', ')}]`,
    );
  }

  // Workflow guard: block manual approval-phase actions when a workflow is
  // active. These actions are driven by the workflow step service, not direct
  // transitions. Legacy manual approval is still allowed when no workflow
  // instance exists (projects without an SI workflow template configured).
  if (SI_WORKFLOW_MANAGED_ACTIONS.includes(action)) {
    const activeWorkflow = await prisma.workflowInstance.findFirst({
      where: {
        recordType: 'supplier_invoice',
        recordId: id,
        status: { in: ['in_progress', 'returned'] },
      },
    });
    if (activeWorkflow) {
      throw new Error(
        `Cannot manually '${action}' this supplier invoice — the approval phase is managed by workflow instance ${activeWorkflow.id}. Use the workflow approval actions instead.`,
      );
    }
  }

  // Update status
  const updated = await prisma.supplierInvoice.update({
    where: { id },
    data: { status: newStatus as any },
    include: { project: true },
  });

  // Audit log
  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: `supplier_invoice.transition.${action}`,
    resourceType: 'supplier_invoice',
    resourceId: id,
    projectId: existing.projectId,
    beforeJson: existing as any,
    afterJson: updated as any,
    reason: comment ?? null,
  });

  // ---------------------------------------------------------------------------
  // Auto-start workflow on review (parity with PO/IPA — but triggered when
  // the SI enters the review phase, since SI has no 'submitted' state)
  // ---------------------------------------------------------------------------
  // If no active template exists for 'supplier_invoice', this is graceful —
  // the transition still succeeds. Workflows are optional infrastructure;
  // projects without a template fall back to manual approval.
  if (newStatus === 'under_review') {
    try {
      const resolution = await resolveTemplate('supplier_invoice', existing.projectId);
      if (resolution) {
        await workflowInstanceService.startInstance({
          templateCode: resolution.code,
          recordType: 'supplier_invoice',
          recordId: id,
          projectId: existing.projectId,
          startedBy: actorUserId,
          resolutionSource: resolution.source,
        });
      } else {
        console.warn(
          `[si-workflow] No workflow template configured for supplier_invoice in project ${existing.projectId}`,
        );
      }
    } catch (err) {
      if (err instanceof TemplateNotActiveError || err instanceof DuplicateInstanceError) {
        console.warn(
          `[si-workflow] Skipped workflow start for SI ${id}: ${(err as Error).message}`,
        );
      } else {
        throw err;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Posting event: SUPPLIER_INVOICE_APPROVED
  // ---------------------------------------------------------------------------

  // Budget absorption: SI approved → actualAmount++
  if (newStatus === 'approved') {
    const result = await absorbSupplierInvoiceActual(existing.projectId, existing.id, actorUserId);
    if (!result.absorbed) {
      console.warn(`[SI ${id}] Budget absorption failed: ${result.reasonCode} — ${result.message}`);
    }
  }

  if (newStatus === 'approved') {
    await postingService.post({
      eventType: 'SUPPLIER_INVOICE_APPROVED',
      sourceService: 'procurement',
      sourceRecordType: 'supplier_invoice',
      sourceRecordId: existing.id,
      projectId: existing.projectId,
      entityId: existing.project.entityId,
      idempotencyKey: `si-approved-${existing.id}`,
      payload: {
        supplierInvoiceId: existing.id,
        invoiceNumber: existing.invoiceNumber,
        vendorId: existing.vendorId,
        purchaseOrderId: existing.purchaseOrderId,
        grossAmount: String(existing.grossAmount),
        vatAmount: String(existing.vatAmount),
        totalAmount: String(existing.totalAmount),
        currency: existing.currency,
        projectId: existing.projectId,
        entityId: existing.project.entityId,
      },
      actorUserId,
    });
  }

  return updated;
}
