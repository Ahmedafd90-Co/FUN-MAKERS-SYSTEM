/**
 * Invoice Collection service — records actual money received against invoices.
 *
 * Each collection is an immutable positive payment event. Overcollection is
 * blocked. Invoice status is derived from collection totals:
 *   - 0 < collected < totalAmount → partially_collected
 *   - collected >= totalAmount    → collected
 *
 * All arithmetic uses Prisma Decimal (Decimal.js) — no JS float math.
 */

import { prisma, Prisma } from '@fmksa/db';
import type { RecordCollectionInput } from '@fmksa/contracts';
import { auditService } from '../../audit/service';

// ---------------------------------------------------------------------------
// Collectable statuses — invoices must be in one of these to accept payments
// ---------------------------------------------------------------------------

const COLLECTABLE_STATUSES = [
  'issued',
  'submitted',
  'overdue',
  'partially_collected',
] as const;

// ---------------------------------------------------------------------------
// Helpers — decimal-safe arithmetic via Prisma Decimal (Decimal.js)
// ---------------------------------------------------------------------------

function toDecimal(val: Prisma.Decimal | number | string | null | undefined): Prisma.Decimal {
  if (val == null) return new Prisma.Decimal(0);
  if (val instanceof Prisma.Decimal) return val;
  return new Prisma.Decimal(val);
}

// ---------------------------------------------------------------------------
// Record a collection
// ---------------------------------------------------------------------------

export async function recordCollection(input: RecordCollectionInput, actorUserId: string) {
  const invoice = await prisma.taxInvoice.findUniqueOrThrow({
    where: { id: input.taxInvoiceId },
  });

  // Gate: only collectable statuses
  if (!COLLECTABLE_STATUSES.includes(invoice.status as any)) {
    throw new Error(
      `Cannot record collection: invoice is in '${invoice.status}' status. ` +
      `Collections are only allowed for: ${COLLECTABLE_STATUSES.join(', ')}.`,
    );
  }

  // Sum existing collections — decimal-safe via Prisma aggregate
  const existingAgg = await prisma.invoiceCollection.aggregate({
    where: { taxInvoiceId: input.taxInvoiceId },
    _sum: { amount: true },
  });

  const existingTotal = toDecimal(existingAgg._sum.amount);
  const newAmount = toDecimal(input.amount);
  const invoiceTotal = toDecimal(invoice.totalAmount);

  // Overcollection check — decimal-safe comparison
  const afterCollection = existingTotal.plus(newAmount);
  if (afterCollection.greaterThan(invoiceTotal)) {
    const outstanding = invoiceTotal.minus(existingTotal);
    throw new Error(
      `Overcollection blocked: invoice total is ${invoiceTotal.toString()}, ` +
      `already collected ${existingTotal.toString()}, outstanding is ${outstanding.toString()}. ` +
      `Attempted collection of ${newAmount.toString()} would exceed the invoice total.`,
    );
  }

  // Derive new invoice status based on collection total after this payment
  let newStatus: string;
  if (afterCollection.equals(invoiceTotal)) {
    newStatus = 'collected';
  } else {
    // afterCollection > 0 && < invoiceTotal (guaranteed by overcollection check + positive amount)
    newStatus = 'partially_collected';
  }

  // Record collection and update invoice status in a single transaction
  const result = await prisma.$transaction(async (tx) => {
    const collection = await tx.invoiceCollection.create({
      data: {
        taxInvoiceId: input.taxInvoiceId,
        amount: input.amount,
        collectionDate: input.collectionDate,
        paymentMethod: input.paymentMethod ?? null,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        recordedBy: actorUserId,
      },
    });

    // Only update status if it actually changed
    const statusChanged = invoice.status !== newStatus;
    let updatedInvoice = invoice;

    if (statusChanged) {
      updatedInvoice = await tx.taxInvoice.update({
        where: { id: input.taxInvoiceId },
        data: { status: newStatus as any },
      });
    }

    // Audit: collection recorded
    await auditService.log(
      {
        actorUserId,
        actorSource: 'user',
        action: 'invoice_collection.record',
        resourceType: 'invoice_collection',
        resourceId: collection.id,
        projectId: invoice.projectId,
        beforeJson: null,
        afterJson: {
          taxInvoiceId: input.taxInvoiceId,
          amount: newAmount.toString(),
          collectionDate: input.collectionDate.toISOString(),
          paymentMethod: input.paymentMethod ?? null,
          reference: input.reference ?? null,
          totalCollectedAfter: afterCollection.toString(),
          invoiceTotal: invoiceTotal.toString(),
          outstandingAfter: invoiceTotal.minus(afterCollection).toString(),
        },
      },
      tx,
    );

    // Audit: invoice status transition (if changed)
    if (statusChanged) {
      await auditService.log(
        {
          actorUserId,
          actorSource: 'system',
          action: `tax_invoice.transition.collection_${newStatus}`,
          resourceType: 'tax_invoice',
          resourceId: invoice.id,
          projectId: invoice.projectId,
          beforeJson: { status: invoice.status },
          afterJson: { status: newStatus, collectionId: collection.id },
        },
        tx,
      );
    }

    return { collection, invoice: updatedInvoice, statusChanged };
  });

  return result;
}

// ---------------------------------------------------------------------------
// List collections for an invoice (ordered by collectionDate asc)
// ---------------------------------------------------------------------------

export async function listCollections(taxInvoiceId: string) {
  const collections = await prisma.invoiceCollection.findMany({
    where: { taxInvoiceId },
    orderBy: { collectionDate: 'asc' },
  });

  // Resolve recordedBy UUIDs to human-readable names
  const userIds = [...new Set(collections.map((c) => c.recordedBy).filter(Boolean))];
  const userMap = new Map<string, string>();
  if (userIds.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });
    for (const u of users) {
      userMap.set(u.id, u.name ?? 'Unknown');
    }
  }

  return collections.map((c) => ({
    ...c,
    recordedByName: userMap.get(c.recordedBy) ?? 'System',
  }));
}

// ---------------------------------------------------------------------------
// Get outstanding amount for an invoice
// ---------------------------------------------------------------------------

export async function getOutstandingAmount(taxInvoiceId: string) {
  const invoice = await prisma.taxInvoice.findUniqueOrThrow({
    where: { id: taxInvoiceId },
    select: { totalAmount: true, status: true },
  });

  const agg = await prisma.invoiceCollection.aggregate({
    where: { taxInvoiceId },
    _sum: { amount: true },
  });

  const totalAmount = toDecimal(invoice.totalAmount);
  const collectedAmount = toDecimal(agg._sum.amount);
  const outstandingAmount = totalAmount.minus(collectedAmount);

  return {
    totalAmount: totalAmount.toString(),
    collectedAmount: collectedAmount.toString(),
    outstandingAmount: outstandingAmount.toString(),
  };
}
