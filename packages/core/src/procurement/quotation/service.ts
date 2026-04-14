/**
 * Quotation service — RFQ-scoped CRUD with status transitions.
 * Quotation has NO projectId FK — it inherits scope from RFQ.
 *
 * Phase 5, Task 5.4 — Module 3 Procurement Engine.
 */
import { prisma } from '@fmksa/db';
import type { QuotationStatus } from '@fmksa/db';
import type { CreateQuotationInput, UpdateQuotationInput } from '@fmksa/contracts';
import { auditService } from '../../audit/service';
import { QUOTATION_TRANSITIONS, QUOTATION_TERMINAL_STATUSES, ACTION_TO_STATUS } from './transitions';
import { EDITABLE_STATUSES } from './validation';
import { assertProjectScope } from '../../scope-binding';

// ---------------------------------------------------------------------------
// Create (with nested lineItems)
// ---------------------------------------------------------------------------

export async function createQuotation(input: CreateQuotationInput, actorUserId: string) {
  // ---------------------------------------------------------------------------
  // Pre-create guards (Stabilization Slice B)
  // ---------------------------------------------------------------------------

  // 1. Scope binding: verify the RFQ belongs to the stated project.
  //    This closes the gap where projectProcedure enforces caller access
  //    to the project, but nothing validated the RFQ actually belongs there.
  const rfq = await prisma.rFQ.findUniqueOrThrow({
    where: { id: input.rfqId },
    select: { projectId: true, status: true },
    // Also fetch rfqVendors for vendor-eligibility check (guard #3)
  });

  // Fetch RFQ vendors separately (needed for guard #3)
  const rfqVendors = await prisma.rFQVendor.findMany({
    where: { rfqId: input.rfqId },
    select: { vendorId: true },
  });

  if (input.projectId && rfq.projectId !== input.projectId) {
    throw new Error(
      `RFQ '${input.rfqId}' belongs to project '${rfq.projectId}', not '${input.projectId}'. ` +
      'Cannot create quotation with mismatched project scope.',
    );
  }

  // 1b. RFQ-state guard (Stabilization Slice C): quotations can only be
  //     created when the RFQ has been issued and is accepting responses.
  const QUOTATION_ACCEPTING_STATUSES = ['issued', 'responses_received', 'evaluation'];
  if (!QUOTATION_ACCEPTING_STATUSES.includes(rfq.status)) {
    throw new Error(
      `Cannot create quotation for RFQ '${input.rfqId}' in status '${rfq.status}'. ` +
      `RFQ must be in one of: [${QUOTATION_ACCEPTING_STATUSES.join(', ')}].`,
    );
  }

  // 1c. Vendor-eligibility guard (Stabilization Slice C): the vendor must
  //     be invited on this RFQ (exist in rfq_vendors join table).
  const invitedVendorIds = rfqVendors.map((rv) => rv.vendorId);
  if (!invitedVendorIds.includes(input.vendorId)) {
    throw new Error(
      `Vendor '${input.vendorId}' is not invited on RFQ '${input.rfqId}'. ` +
      'Only invited vendors can submit quotations.',
    );
  }

  // 2. Identity invariant: one quotation per vendor per RFQ.
  //    If a non-terminal quotation from this vendor already exists for this
  //    RFQ, reject the create. Terminal quotations (rejected/expired) don't
  //    block — the vendor can re-quote if a previous response was withdrawn.
  const QUOTATION_TERMINAL: QuotationStatus[] = ['awarded', 'rejected', 'expired'];
  const existing = await prisma.quotation.findFirst({
    where: {
      rfqId: input.rfqId,
      vendorId: input.vendorId,
      status: { notIn: QUOTATION_TERMINAL },
    },
    select: { id: true, status: true },
  });

  if (existing) {
    throw new Error(
      `Vendor '${input.vendorId}' already has an active quotation (${existing.id}, ` +
      `status: ${existing.status}) for RFQ '${input.rfqId}'. ` +
      'One quotation per vendor per RFQ is enforced.',
    );
  }

  // ---------------------------------------------------------------------------
  // 3. rfqItemId validation (Stabilization Slice C): every quotation line
  //    item that references an rfqItemId must point to an actual item on
  //    this RFQ. This ensures comparison/award logic gets valid linkage.
  // ---------------------------------------------------------------------------
  if (input.items && input.items.length > 0) {
    const referencedRfqItemIds = input.items
      .filter((item) => item.rfqItemId)
      .map((item) => item.rfqItemId as string);

    if (referencedRfqItemIds.length > 0) {
      const validRfqItems = await prisma.rFQItem.findMany({
        where: { rfqId: input.rfqId, id: { in: referencedRfqItemIds } },
        select: { id: true },
      });
      const validIds = new Set(validRfqItems.map((r) => r.id));
      const invalidIds = referencedRfqItemIds.filter((id) => !validIds.has(id));
      if (invalidIds.length > 0) {
        throw new Error(
          `Quotation references invalid RFQ item IDs: [${invalidIds.join(', ')}]. ` +
          `These items do not belong to RFQ '${input.rfqId}'.`,
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  const record = await prisma.quotation.create({
    data: {
      rfqId: input.rfqId,
      vendorId: input.vendorId,
      receivedDate: new Date(),
      validUntil: input.validUntil ? new Date(input.validUntil) : null,
      totalAmount: input.totalAmount,
      currency: input.currency,
      paymentTerms: input.paymentTerms ?? null,
      deliveryTerms: input.deliveryTerms ?? null,
      status: 'received',
      createdBy: actorUserId,
      ...(input.items && input.items.length > 0
        ? { lineItems: { create: input.items.map((item) => ({
            rfqItemId: item.rfqItemId ?? null,
            itemDescription: item.itemDescription,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            currency: input.currency,
            notes: item.notes ?? null,
          })) } }
        : {}),
    },
    include: { lineItems: true },
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'quotation.create',
    resourceType: 'quotation',
    resourceId: record.id,
    projectId: rfq.projectId,
    beforeJson: null,
    afterJson: record as any,
  });

  return record;
}

// ---------------------------------------------------------------------------
// Update (received only)
// ---------------------------------------------------------------------------

export async function updateQuotation(input: UpdateQuotationInput, actorUserId: string, projectId?: string) {
  const existing = await prisma.quotation.findUniqueOrThrow({
    where: { id: input.id },
    include: { lineItems: true, rfq: { select: { projectId: true } } },
  });
  if (projectId) assertProjectScope(existing.rfq, projectId, 'Quotation', input.id);

  if (!EDITABLE_STATUSES.includes(existing.status)) {
    throw new Error(`Cannot update quotation in status '${existing.status}'. Only received quotations can be updated.`);
  }

  const { id, items, ...updateFields } = input;
  const data: Record<string, unknown> = {};

  // Map contract field names to Prisma model fields.
  // Ghost fields (deliveryDate, notes) are excluded via allowlist.
  const ALLOWED_UPDATE_FIELDS = new Set([
    'currency', 'totalAmount', 'validUntil', 'paymentTerms', 'deliveryTerms',
  ]);

  for (const [key, value] of Object.entries(updateFields)) {
    if (value === undefined) continue;
    if (!ALLOWED_UPDATE_FIELDS.has(key)) continue;
    if (key === 'validUntil') {
      data[key] = value ? new Date(value as string) : null;
    } else {
      data[key] = value;
    }
  }

  // Replace lineItems if provided
  if (items) {
    data.lineItems = {
      deleteMany: {},
      create: items.map((item) => ({
        rfqItemId: item.rfqItemId ?? null,
        itemDescription: item.itemDescription,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        currency: input.currency ?? existing.currency,
        notes: item.notes ?? null,
      })),
    };
  }

  const updated = await prisma.quotation.update({
    where: { id },
    data,
    include: { lineItems: true },
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'quotation.update',
    resourceType: 'quotation',
    resourceId: id,
    projectId: existing.rfq.projectId,
    beforeJson: existing as any,
    afterJson: updated as any,
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Transition (no posting events)
// ---------------------------------------------------------------------------

export async function transitionQuotation(
  id: string,
  action: string,
  actorUserId: string,
  comment?: string,
  projectId?: string,
) {
  const newStatus = ACTION_TO_STATUS[action];
  if (!newStatus) {
    throw new Error(`Unknown quotation action: '${action}'`);
  }

  const existing = await prisma.quotation.findUniqueOrThrow({
    where: { id },
    include: { rfq: { select: { projectId: true } } },
  });
  if (projectId) assertProjectScope(existing.rfq, projectId, 'Quotation', id);

  // Terminal status check
  if (QUOTATION_TERMINAL_STATUSES.includes(existing.status)) {
    throw new Error(`Cannot transition quotation from terminal status '${existing.status}'.`);
  }

  // Transition validity check
  const allowed = QUOTATION_TRANSITIONS[existing.status];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(
      `Invalid quotation transition: '${existing.status}' -> '${newStatus}'. Allowed: [${(allowed ?? []).join(', ')}]`,
    );
  }

  const updated = await prisma.quotation.update({
    where: { id },
    data: { status: newStatus as QuotationStatus },
    include: { rfq: { select: { projectId: true } } },
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: `quotation.transition.${action}`,
    resourceType: 'quotation',
    resourceId: id,
    projectId: existing.rfq.projectId,
    beforeJson: existing as any,
    afterJson: updated as any,
    reason: comment ?? null,
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Get
// ---------------------------------------------------------------------------

export async function getQuotation(id: string, projectId?: string) {
  const record = await prisma.quotation.findUniqueOrThrow({
    where: { id },
    include: { lineItems: true, vendor: true, rfq: true },
  });
  if (projectId) assertProjectScope(record.rfq, projectId, 'Quotation', id);
  return record;
}

// ---------------------------------------------------------------------------
// List (filter by rfqId + vendorId + status)
// ---------------------------------------------------------------------------

export async function listQuotations(input: {
  rfqId?: string | undefined;
  vendorId?: string | undefined;
  status?: string[] | undefined;
  projectId?: string | undefined;
  skip?: number | undefined;
  take?: number | undefined;
  sortField?: string | undefined;
  sortDirection?: 'asc' | 'desc' | undefined;
}) {
  const where: Record<string, unknown> = {};

  if (input.rfqId) {
    where.rfqId = input.rfqId;
  }

  if (input.vendorId) {
    where.vendorId = input.vendorId;
  }

  if (input.status && input.status.length > 0) {
    where.status = { in: input.status };
  }

  if (input.projectId) {
    where.rfq = { projectId: input.projectId };
  }

  const orderBy: Record<string, string> = {};
  orderBy[input.sortField ?? 'createdAt'] = input.sortDirection ?? 'desc';

  const [items, total] = await Promise.all([
    prisma.quotation.findMany({
      where,
      orderBy,
      skip: input.skip ?? 0,
      take: input.take ?? 20,
      include: { vendor: true, lineItems: true, rfq: true },
    }),
    prisma.quotation.count({ where }),
  ]);

  return { items, total };
}

// ---------------------------------------------------------------------------
// Delete (received only — hard delete)
// ---------------------------------------------------------------------------

export async function deleteQuotation(id: string, actorUserId: string, projectId?: string) {
  const existing = await prisma.quotation.findUniqueOrThrow({
    where: { id },
    include: { rfq: { select: { projectId: true } } },
  });
  if (projectId) assertProjectScope(existing.rfq, projectId, 'Quotation', id);

  if (existing.status !== 'received') {
    throw new Error(`Cannot delete quotation in status '${existing.status}'. Only received quotations can be deleted.`);
  }

  await prisma.$transaction(async (tx) => {
    await (tx as any).quotationLineItem.deleteMany({ where: { quotationId: id } });
    await (tx as any).quotation.delete({ where: { id } });
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'quotation.delete',
    resourceType: 'quotation',
    resourceId: id,
    projectId: existing.rfq.projectId,
    beforeJson: existing as any,
    afterJson: null,
  });
}

// ---------------------------------------------------------------------------
// Compare quotations for an RFQ
// ---------------------------------------------------------------------------

export async function compareQuotations(rfqId: string, projectId?: string) {
  if (projectId) {
    const rfq = await prisma.rFQ.findUniqueOrThrow({
      where: { id: rfqId },
      select: { projectId: true },
    });
    assertProjectScope(rfq, projectId, 'RFQ', rfqId);
  }
  // Get only non-terminal quotations for comparison (Stabilization Slice C).
  // Terminal quotations (awarded, rejected, expired) are historical — only
  // the current active quotation per vendor participates in compare/award.
  const COMPARE_EXCLUDE_STATUSES: QuotationStatus[] = ['awarded', 'rejected', 'expired'];
  const quotations = await prisma.quotation.findMany({
    where: {
      rfqId,
      status: { notIn: COMPARE_EXCLUDE_STATUSES },
    },
    include: {
      vendor: true,
      lineItems: true,
    },
  });

  // Get RFQ items for grouping
  const rfqItems = await prisma.rFQItem.findMany({
    where: { rfqId },
  });

  // Build comparison matrix: group by rfqItemId
  const comparison = rfqItems.map((rfqItem) => {
    const vendors = quotations.map((q) => {
      const matchingItems = q.lineItems.filter((li) => li.rfqItemId === rfqItem.id);
      const lineItem = matchingItems[0];
      return {
        vendorId: q.vendorId,
        vendorName: q.vendor.name,
        quotationId: q.id,
        unitPrice: lineItem ? Number(lineItem.unitPrice) : null,
        totalPrice: lineItem ? Number(lineItem.totalPrice) : null,
        quantity: lineItem ? Number(lineItem.quantity) : null,
      };
    });

    return {
      rfqItem: {
        id: rfqItem.id,
        itemDescription: rfqItem.itemDescription,
        quantity: Number(rfqItem.quantity),
        unit: rfqItem.unit,
      },
      vendors,
    };
  });

  return comparison;
}
