import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@fmksa/db';
import {
  verifyRecordInProject,
  UnsupportedRecordTypeError,
  ScopeMismatchError,
} from '@fmksa/core';

describe('verifyRecordInProject', () => {
  let entityId: string;
  let project1Id: string;
  let project2Id: string;
  let vendorId: string;
  let expenseId: string;
  let poId: string;
  let siId: string;
  let cnId: string;

  beforeAll(async () => {
    const ts = Date.now();

    // Entity (shared by both projects + the vendor)
    const entity = await prisma.entity.create({
      data: {
        code: `VRP-ENT-${ts}`,
        name: `vrp-entity-${ts}`,
        type: 'parent',
        status: 'active',
      },
    });
    entityId = entity.id;

    // Currency (project FK target — shared, upserted to be safe)
    await prisma.currency.upsert({
      where: { code: 'SAR' },
      update: {},
      create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
    });

    // Two projects so we can test cross-project mismatch
    const p1 = await prisma.project.create({
      data: {
        entityId: entity.id,
        code: `VRP1-${ts}`,
        name: `vrp-p1-${ts}`,
        status: 'active',
        currencyCode: 'SAR',
        startDate: new Date(),
        createdBy: 'test',
      },
    });
    project1Id = p1.id;

    const p2 = await prisma.project.create({
      data: {
        entityId: entity.id,
        code: `VRP2-${ts}`,
        name: `vrp-p2-${ts}`,
        status: 'active',
        currencyCode: 'SAR',
        startDate: new Date(),
        createdBy: 'test',
      },
    });
    project2Id = p2.id;

    // One vendor (shared by PO/SI/CN — not used by Expense)
    const v = await prisma.vendor.create({
      data: {
        entityId: entity.id,
        vendorCode: `VRP-VEN-${ts}`,
        name: `vrp-vendor-${ts}`,
        status: 'active',
        createdBy: 'test',
      },
    });
    vendorId = v.id;

    // One record of each procurement family in project1.
    // Going direct to prisma rather than through services so the test stays
    // narrow — services trigger audit logs, posting events, workflow starts,
    // etc., none of which verify-record needs.

    expenseId = (
      await prisma.expense.create({
        data: {
          projectId: project1Id,
          subtype: 'general' as any,
          title: 'verify-record test expense',
          amount: 1,
          currency: 'SAR',
          expenseDate: new Date(),
          status: 'draft',
          createdBy: 'test',
        },
      })
    ).id;

    poId = (
      await prisma.purchaseOrder.create({
        data: {
          projectId: project1Id,
          vendorId,
          poNumber: `VRP-PO-${ts}`,
          title: 'verify-record test PO',
          totalAmount: 1,
          currency: 'SAR',
          status: 'draft',
          createdBy: 'test',
        },
      })
    ).id;

    siId = (
      await prisma.supplierInvoice.create({
        data: {
          projectId: project1Id,
          vendorId,
          invoiceNumber: `vrp-si-${ts}`,
          invoiceDate: new Date(),
          grossAmount: 1,
          vatRate: 0.15,
          vatAmount: 0.15,
          totalAmount: 1.15,
          currency: 'SAR',
          status: 'received',
          createdBy: 'test',
        },
      })
    ).id;

    cnId = (
      await prisma.creditNote.create({
        data: {
          projectId: project1Id,
          vendorId,
          subtype: 'credit_note' as any,
          creditNoteNumber: `vrp-cn-${ts}`,
          amount: 1,
          currency: 'SAR',
          reason: 'verify-record test',
          receivedDate: new Date(),
          status: 'received',
          createdBy: 'test',
        },
      })
    ).id;
  });

  afterAll(async () => {
    // Best-effort cleanup; FK order matters.
    try {
      await prisma.creditNote.deleteMany({ where: { id: cnId } });
      await prisma.supplierInvoice.deleteMany({ where: { id: siId } });
      await prisma.purchaseOrder.deleteMany({ where: { id: poId } });
      await prisma.expense.deleteMany({ where: { id: expenseId } });
      await prisma.vendor.deleteMany({ where: { id: vendorId } });
      await prisma.project.deleteMany({
        where: { id: { in: [project1Id, project2Id] } },
      });
      await prisma.entity.deleteMany({ where: { id: entityId } });
    } catch {
      // Don't fail the suite on cleanup errors.
    }
  });

  it.each([
    ['expense', () => expenseId],
    ['purchase_order', () => poId],
    ['supplier_invoice', () => siId],
    ['credit_note', () => cnId],
  ] as const)('passes for valid %s in correct project', async (recordType, getId) => {
    await expect(
      verifyRecordInProject(recordType, getId(), project1Id),
    ).resolves.toBeUndefined();
  });

  it('throws ScopeMismatchError when record is in a different project', async () => {
    await expect(
      verifyRecordInProject('expense', expenseId, project2Id),
    ).rejects.toBeInstanceOf(ScopeMismatchError);
  });

  it('throws when record does not exist (Prisma findUniqueOrThrow)', async () => {
    await expect(
      verifyRecordInProject(
        'expense',
        '00000000-0000-0000-0000-000000000000',
        project1Id,
      ),
    ).rejects.toThrow();
  });

  it('throws UnsupportedRecordTypeError for unknown recordType', async () => {
    await expect(
      verifyRecordInProject('unknown_type', expenseId, project1Id),
    ).rejects.toBeInstanceOf(UnsupportedRecordTypeError);
  });
});
