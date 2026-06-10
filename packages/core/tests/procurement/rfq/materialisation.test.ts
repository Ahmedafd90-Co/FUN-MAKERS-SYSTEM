/**
 * PIC-53 — RFQ award materialisation service tests.
 *
 * Covers:
 *   - Refuses when RFQ.status ≠ 'awarded'
 *   - PO path: creates draft PO with rfqId + vendorId + totalAmount + line items
 *   - Subcontract path: creates draft VendorContract with contractType='subcontract' + rfqId
 *   - Idempotency: second materialise call refuses (RfqAlreadyMaterialisedError)
 *   - Refuses when no awarded Quotation exists (data integrity)
 *   - Cross-project scope assertion
 *   - Audit trail captures the materialisation decision
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma, Prisma, SINGLETON_ORG_ID } from '@fmksa/db';
import { assertTestDb } from '../../helpers/assert-test-db';
import {
  materialiseAward,
  RfqNotAwardedError,
  RfqAlreadyMaterialisedError,
  NoAwardedQuotationError,
} from '../../../src/procurement/rfq/materialisation';

describe('PIC-53 — RFQ award materialisation', () => {
  let testEntityId: string;
  let testProjectId: string;
  let secondProjectId: string;
  let testVendorId: string;
  const ts = Date.now();

  // Each test creates its own RFQ to avoid cross-test interference.
  async function makeAwardedRfq(opts: {
    rfqNumber: string;
    withAwardedQuotation?: boolean;
    leaveInStatus?: 'draft' | 'awarded';
  }) {
    process.env.SEED_CONTEXT = 'true';
    const rfq = await prisma.rFQ.create({
      data: {
        orgId: SINGLETON_ORG_ID,
        projectId: testProjectId,
        rfqNumber: opts.rfqNumber,
        title: `Materialisation test ${opts.rfqNumber}`,
        currency: 'SAR',
        status: opts.leaveInStatus ?? 'awarded',
        createdBy: 'test',
      },
    });

    let quotationId: string | null = null;
    if (opts.withAwardedQuotation !== false) {
      const quotation = await prisma.quotation.create({
        data: {
          rfqId: rfq.id,
          vendorId: testVendorId,
          receivedDate: new Date(),
          totalAmount: new Prisma.Decimal('100000'),
          currency: 'SAR',
          paymentTerms: 'Net 30',
          status: 'awarded',
          createdBy: 'test',
          lineItems: {
            create: [
              {
                itemDescription: 'Widget',
                quantity: new Prisma.Decimal('10'),
                unit: 'ea',
                unitPrice: new Prisma.Decimal('5000'),
                totalPrice: new Prisma.Decimal('50000'),
                currency: 'SAR',
              },
              {
                itemDescription: 'Gizmo',
                quantity: new Prisma.Decimal('5'),
                unit: 'ea',
                unitPrice: new Prisma.Decimal('10000'),
                totalPrice: new Prisma.Decimal('50000'),
                currency: 'SAR',
              },
            ],
          },
        },
      });
      quotationId = quotation.id;
      // Promote the FK
      await prisma.rFQ.update({
        where: { id: rfq.id },
        data: { awardedQuotationId: quotation.id },
      });
    }
    delete process.env.SEED_CONTEXT;
    return { rfqId: rfq.id, quotationId };
  }

  beforeAll(async () => {
    assertTestDb();
    process.env.SEED_CONTEXT = 'true';

    const entity = await prisma.entity.create({
      data: { orgId: SINGLETON_ORG_ID, code: `ENT-MAT-${ts}`, name: 'Materialisation Entity', type: 'parent', status: 'active' },
    });
    testEntityId = entity.id;

    await prisma.currency.upsert({
      where: { code: 'SAR' },
      update: {},
      create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
    });

    const project = await prisma.project.create({
      data: {
        orgId: SINGLETON_ORG_ID,
        code: `PROJ-MAT-${ts}`,
        name: 'Materialisation Project',
        entityId: testEntityId,
        status: 'active',
        currencyCode: 'SAR',
        startDate: new Date(),
        createdBy: 'test',
      },
    });
    testProjectId = project.id;

    const secondProject = await prisma.project.create({
      data: {
        orgId: SINGLETON_ORG_ID,
        code: `PROJ-MAT-2-${ts}`,
        name: 'Other Project',
        entityId: testEntityId,
        status: 'active',
        currencyCode: 'SAR',
        startDate: new Date(),
        createdBy: 'test',
      },
    });
    secondProjectId = secondProject.id;

    const vendor = await prisma.vendor.create({
      data: {
        orgId: SINGLETON_ORG_ID,
        entityId: testEntityId,
        vendorCode: `V-MAT-${ts}`,
        name: 'Materialisation Vendor',
        status: 'active',
        createdBy: 'test',
      },
    });
    testVendorId = vendor.id;

    delete process.env.SEED_CONTEXT;
  }, 60_000);

  afterAll(async () => {
    process.env.SEED_CONTEXT = 'true';
    // Cleanup in dependency order. AuditLog is immutable and persists.
    await prisma.purchaseOrderItem.deleteMany({
      where: { purchaseOrder: { projectId: testProjectId } },
    }).catch(() => {});
    await prisma.purchaseOrder.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
    await prisma.vendorContract.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
    // Drop the FK from RFQ before deleting quotations (or the FK violation fires)
    await prisma.rFQ.updateMany({
      where: { projectId: testProjectId },
      data: { awardedQuotationId: null },
    }).catch(() => {});
    await prisma.quotationLineItem.deleteMany({
      where: { quotation: { rfq: { projectId: testProjectId } } },
    }).catch(() => {});
    await prisma.quotation.deleteMany({ where: { rfq: { projectId: testProjectId } } }).catch(() => {});
    await prisma.rFQ.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
    await prisma.vendor.delete({ where: { id: testVendorId } }).catch(() => {});
    await prisma.project.delete({ where: { id: testProjectId } }).catch(() => {});
    await prisma.project.delete({ where: { id: secondProjectId } }).catch(() => {});
    await prisma.entity.delete({ where: { id: testEntityId } }).catch(() => {});
    delete process.env.SEED_CONTEXT;
  }, 60_000);

  // -------------------------------------------------------------------------
  // Refusal cases
  // -------------------------------------------------------------------------

  it("refuses when RFQ.status !== 'awarded' (RfqNotAwardedError)", async () => {
    const { rfqId } = await makeAwardedRfq({
      rfqNumber: `RFQ-MAT-NOTAWARDED-${Date.now()}`,
      leaveInStatus: 'draft',
      withAwardedQuotation: false,
    });

    await expect(
      materialiseAward(
        { rfqId, projectId: testProjectId, materialiseAs: 'po' },
        'test-actor',
      ),
    ).rejects.toBeInstanceOf(RfqNotAwardedError);
  });

  it('refuses when no awarded Quotation exists (NoAwardedQuotationError)', async () => {
    const { rfqId } = await makeAwardedRfq({
      rfqNumber: `RFQ-MAT-NOQUOTE-${Date.now()}`,
      withAwardedQuotation: false,
    });

    await expect(
      materialiseAward(
        { rfqId, projectId: testProjectId, materialiseAs: 'po' },
        'test-actor',
      ),
    ).rejects.toBeInstanceOf(NoAwardedQuotationError);
  });

  it('refuses cross-project (scope assertion)', async () => {
    const { rfqId } = await makeAwardedRfq({ rfqNumber: `RFQ-MAT-SCOPE-${Date.now()}` });

    await expect(
      materialiseAward(
        { rfqId, projectId: secondProjectId, materialiseAs: 'po' },
        'test-actor',
      ),
    ).rejects.toThrow();
  });

  // -------------------------------------------------------------------------
  // PO path
  // -------------------------------------------------------------------------

  it("materialises as 'po' — creates draft PurchaseOrder with rfqId + vendorId + totalAmount + line items", async () => {
    const { rfqId, quotationId } = await makeAwardedRfq({
      rfqNumber: `RFQ-MAT-PO-${Date.now()}`,
    });

    const result = await materialiseAward(
      { rfqId, projectId: testProjectId, materialiseAs: 'po' },
      'test-actor',
    );

    expect(result.materialiseAs).toBe('po');
    expect(result.recordType).toBe('purchase_order');
    expect(result.sourceQuotationId).toBe(quotationId!);

    const po = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: result.recordId },
      include: { items: true },
    });
    expect(po.rfqId).toBe(rfqId);
    expect(po.quotationId).toBe(quotationId);
    expect(po.vendorId).toBe(testVendorId);
    expect(po.status).toBe('draft');
    expect(po.currency).toBe('SAR');
    expect(new Prisma.Decimal(po.totalAmount.toString()).equals(100000)).toBe(true);
    expect(po.items).toHaveLength(2);
    expect(po.items.map((i) => i.itemDescription).sort()).toEqual(['Gizmo', 'Widget']);
    // PO number is generated by generateReferenceNumber as <project-code>-PO-NNN
    expect(po.poNumber).toMatch(/PO-\d+$/);
  });

  it('refuses second materialisation of the same RFQ (idempotency)', async () => {
    const { rfqId } = await makeAwardedRfq({
      rfqNumber: `RFQ-MAT-IDEMPOTENT-${Date.now()}`,
    });

    // First materialisation succeeds
    await materialiseAward(
      { rfqId, projectId: testProjectId, materialiseAs: 'po' },
      'test-actor',
    );

    // Second call refuses (regardless of materialiseAs choice)
    await expect(
      materialiseAward(
        { rfqId, projectId: testProjectId, materialiseAs: 'po' },
        'test-actor',
      ),
    ).rejects.toBeInstanceOf(RfqAlreadyMaterialisedError);

    await expect(
      materialiseAward(
        { rfqId, projectId: testProjectId, materialiseAs: 'subcontract' },
        'test-actor',
      ),
    ).rejects.toBeInstanceOf(RfqAlreadyMaterialisedError);
  });

  // -------------------------------------------------------------------------
  // Subcontract path
  // -------------------------------------------------------------------------

  it("materialises as 'subcontract' — creates draft VendorContract with contractType='subcontract' + rfqId", async () => {
    const { rfqId, quotationId } = await makeAwardedRfq({
      rfqNumber: `RFQ-MAT-SUB-${Date.now()}`,
    });

    const result = await materialiseAward(
      { rfqId, projectId: testProjectId, materialiseAs: 'subcontract' },
      'test-actor',
    );

    expect(result.materialiseAs).toBe('subcontract');
    expect(result.recordType).toBe('vendor_contract');
    expect(result.sourceQuotationId).toBe(quotationId!);

    const vc = await prisma.vendorContract.findUniqueOrThrow({
      where: { id: result.recordId },
    });
    expect(vc.rfqId).toBe(rfqId);
    expect(vc.vendorId).toBe(testVendorId);
    expect(vc.contractType).toBe('subcontract');
    expect(vc.status).toBe('draft');
    expect(vc.currency).toBe('SAR');
    expect(new Prisma.Decimal(vc.totalValue.toString()).equals(100000)).toBe(true);
    expect(vc.contractNumber).toMatch(/^VC-/);
    // Placeholder dates set by service (user MUST edit before submit) —
    // assert they're populated (startDate <= endDate); not asserting exact values.
    expect(vc.startDate.getTime()).toBeLessThanOrEqual(vc.endDate.getTime());
  });

  // -------------------------------------------------------------------------
  // Audit trail
  // -------------------------------------------------------------------------

  it('writes an audit-log entry capturing the materialisation decision', async () => {
    const { rfqId } = await makeAwardedRfq({
      rfqNumber: `RFQ-MAT-AUDIT-${Date.now()}`,
    });

    const result = await materialiseAward(
      { rfqId, projectId: testProjectId, materialiseAs: 'po' },
      'test-actor',
    );

    const audits = await prisma.auditLog.findMany({
      where: {
        resourceType: 'rfq',
        resourceId: rfqId,
        action: { contains: 'materialise_award' },
      },
    });
    expect(audits.length).toBe(1);
    expect(audits[0]!.action).toBe('rfq.materialise_award.purchase_order');
    const after = audits[0]!.afterJson as Record<string, unknown>;
    expect(after.materialisedAs).toBe('po');
    expect(after.purchaseOrderId).toBe(result.recordId);
  });
});
