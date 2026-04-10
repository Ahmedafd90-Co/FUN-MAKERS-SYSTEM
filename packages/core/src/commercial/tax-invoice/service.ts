import { prisma } from '@fmksa/db';
import type { CreateTaxInvoiceInput, UpdateTaxInvoiceInput, ListFilterInput } from '@fmksa/contracts';
import { auditService } from '../../audit/service';
import { postingService } from '../../posting/service';
import { generateReferenceNumber } from '../reference-number/service';
import { TAX_INVOICE_TRANSITIONS, TAX_INVOICE_TERMINAL_STATUSES } from './transitions';

// ---------------------------------------------------------------------------
// Action → status mapping
// ---------------------------------------------------------------------------

const ACTION_TO_STATUS: Record<string, string> = {
  submit: 'under_review',         // Note: submit goes to under_review, not submitted
  review: 'under_review',
  approve: 'approved_internal',
  return: 'returned',
  issue: 'issued',
  mark_submitted: 'submitted',
  mark_partially_collected: 'partially_collected',
  mark_collected: 'collected',
  mark_overdue: 'overdue',
  mark_cancelled: 'cancelled',
  supersede: 'superseded',
  close: 'closed',
};

// ---------------------------------------------------------------------------
// IPC statuses that allow TaxInvoice creation
// ---------------------------------------------------------------------------

const IPC_GATEABLE_STATUSES = [
  'signed',
  'issued',
  'superseded',
  'closed',
];

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createTaxInvoice(input: CreateTaxInvoiceInput, actorUserId: string) {
  // Validate parent IPC status
  const parentIpc = await prisma.ipc.findUniqueOrThrow({
    where: { id: input.ipcId },
  });

  if (!IPC_GATEABLE_STATUSES.includes(parentIpc.status)) {
    throw new Error(
      `Cannot create TaxInvoice: parent IPC is in '${parentIpc.status}' status. IPC must be at least 'signed'.`,
    );
  }

  // Auto-generate invoiceNumber inside a transaction
  const taxInvoice = await prisma.$transaction(async (tx) => {
    const invoiceNumber = await generateReferenceNumber(input.projectId, 'INVNUM', tx);

    const created = await (tx as any).taxInvoice.create({
      data: {
        projectId: input.projectId,
        ipcId: input.ipcId,
        status: 'draft',
        invoiceNumber,
        invoiceDate: new Date(input.invoiceDate),
        grossAmount: input.grossAmount,
        vatRate: input.vatRate,
        vatAmount: input.vatAmount,
        totalAmount: input.totalAmount,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        currency: input.currency,
        buyerName: input.buyerName,
        buyerTaxId: input.buyerTaxId ?? null,
        sellerTaxId: input.sellerTaxId,
        createdBy: actorUserId,
      },
    });

    return created;
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'tax_invoice.create',
    resourceType: 'tax_invoice',
    resourceId: taxInvoice.id,
    projectId: input.projectId,
    beforeJson: null,
    afterJson: taxInvoice as any,
  });

  return taxInvoice;
}

// ---------------------------------------------------------------------------
// Update (draft / returned only)
// ---------------------------------------------------------------------------

export async function updateTaxInvoice(input: UpdateTaxInvoiceInput, actorUserId: string) {
  const existing = await prisma.taxInvoice.findUniqueOrThrow({ where: { id: input.id } });

  if (!['draft', 'returned'].includes(existing.status)) {
    throw new Error(`Cannot update TaxInvoice in status '${existing.status}'. Only draft or returned TaxInvoices can be updated.`);
  }

  const { id, ...updateFields } = input;
  const data: Record<string, unknown> = {};

  // Map fields, converting date strings to Date objects
  for (const [key, value] of Object.entries(updateFields)) {
    if (value === undefined) continue;
    if (key === 'invoiceDate' || key === 'dueDate') {
      data[key] = value ? new Date(value as string) : null;
    } else {
      data[key] = value;
    }
  }

  const updated = await prisma.taxInvoice.update({
    where: { id },
    data,
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'tax_invoice.update',
    resourceType: 'tax_invoice',
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

export async function transitionTaxInvoice(
  id: string,
  action: string,
  actorUserId: string,
  comment?: string,
) {
  const newStatus = ACTION_TO_STATUS[action];
  if (!newStatus) {
    throw new Error(`Unknown TaxInvoice action: '${action}'`);
  }

  const existing = await prisma.taxInvoice.findUniqueOrThrow({
    where: { id },
    include: { project: true },
  });

  // Terminal status check
  if (TAX_INVOICE_TERMINAL_STATUSES.includes(existing.status)) {
    throw new Error(`Cannot transition TaxInvoice from terminal status '${existing.status}'.`);
  }

  // Transition validity check
  const allowed = TAX_INVOICE_TRANSITIONS[existing.status];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(
      `Invalid TaxInvoice transition: '${existing.status}' → '${newStatus}'. Allowed: [${(allowed ?? []).join(', ')}]`,
    );
  }

  // Transitions that require a transaction (posting or ref number)
  const needsTransaction = newStatus === 'issued';

  let updated: Awaited<ReturnType<typeof prisma.taxInvoice.update>>;

  if (needsTransaction) {
    updated = await prisma.$transaction(async (tx) => {
      const updateData: Record<string, unknown> = { status: newStatus };

      // Assign reference number at issued
      const refNum = await generateReferenceNumber(existing.projectId, 'INV', tx);
      updateData.referenceNumber = refNum;

      const result = await (tx as any).taxInvoice.update({
        where: { id },
        data: updateData,
        include: { project: true },
      });

      await auditService.log(
        {
          actorUserId,
          actorSource: 'user',
          action: `tax_invoice.transition.${action}`,
          resourceType: 'tax_invoice',
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

    // Fire posting event for issued (outside nested tx since postingService manages its own)
    await postingService.post({
      eventType: 'TAX_INVOICE_ISSUED',
      sourceService: 'commercial',
      sourceRecordType: 'tax_invoice',
      sourceRecordId: existing.id,
      projectId: existing.projectId,
      entityId: existing.project.entityId,
      idempotencyKey: `tax_invoice:${existing.id}:issued`,
      payload: {
        taxInvoiceId: existing.id,
        ipcId: existing.ipcId,
        invoiceNumber: existing.invoiceNumber,
        grossAmount: existing.grossAmount.toString(),
        vatRate: existing.vatRate.toString(),
        vatAmount: existing.vatAmount.toString(),
        totalAmount: existing.totalAmount.toString(),
        currency: existing.currency,
        projectId: existing.projectId,
      },
      actorUserId,
    });
  } else {
    // Simple status update
    updated = await prisma.taxInvoice.update({
      where: { id },
      data: { status: newStatus },
      include: { project: true },
    });

    await auditService.log({
      actorUserId,
      actorSource: 'user',
      action: `tax_invoice.transition.${action}`,
      resourceType: 'tax_invoice',
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

export async function getTaxInvoice(id: string) {
  return prisma.taxInvoice.findUniqueOrThrow({
    where: { id },
    include: { project: true },
  });
}

// ---------------------------------------------------------------------------
// List (paginated + filters)
// ---------------------------------------------------------------------------

export async function listTaxInvoices(input: ListFilterInput) {
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
    const totalAmount: Record<string, unknown> = {};
    if (input.amountMin !== undefined) totalAmount.gte = input.amountMin;
    if (input.amountMax !== undefined) totalAmount.lte = input.amountMax;
    where.totalAmount = totalAmount;
  }

  if (input.createdByFilter) {
    where.createdBy = input.createdByFilter;
  }

  const orderBy: Record<string, string> = {};
  orderBy[input.sortField ?? 'createdAt'] = input.sortDirection ?? 'desc';

  const [items, total] = await Promise.all([
    prisma.taxInvoice.findMany({
      where,
      orderBy,
      skip: input.skip ?? 0,
      take: input.take ?? 20,
      include: { project: true },
    }),
    prisma.taxInvoice.count({ where }),
  ]);

  return { items, total };
}

// ---------------------------------------------------------------------------
// Delete (draft only — hard delete)
// ---------------------------------------------------------------------------

export async function deleteTaxInvoice(id: string, actorUserId: string) {
  const existing = await prisma.taxInvoice.findUniqueOrThrow({ where: { id } });

  if (existing.status !== 'draft') {
    throw new Error(`Cannot delete TaxInvoice in status '${existing.status}'. Only draft TaxInvoices can be deleted.`);
  }

  await prisma.taxInvoice.delete({ where: { id } });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'tax_invoice.delete',
    resourceType: 'tax_invoice',
    resourceId: id,
    projectId: existing.projectId,
    beforeJson: existing as any,
    afterJson: null,
  });
}
