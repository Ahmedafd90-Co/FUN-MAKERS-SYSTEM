import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma, Prisma } from '@fmksa/db';
import { recordCollection, listCollections, getOutstandingAmount } from '../../src/commercial/invoice-collection/service';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const ts = `coll-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
let testProject: { id: string };
let testIpc: { id: string };

/**
 * Creates a TaxInvoice in 'issued' status ready for collection testing.
 * totalAmount = the provided amount (default 10000).
 */
async function createCollectableInvoice(totalAmount = 10000) {
  const inv = await prisma.taxInvoice.create({
    data: {
      projectId: testProject.id,
      ipcId: testIpc.id,
      status: 'issued',
      invoiceNumber: `INV-${ts}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      invoiceDate: new Date(),
      grossAmount: totalAmount,
      vatRate: 0.15,
      vatAmount: totalAmount * 0.15,
      totalAmount,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days out
      currency: 'SAR',
      buyerName: 'Test Buyer',
      sellerTaxId: '1234567890',
      createdBy: 'test-user',
    },
  });
  return inv;
}

beforeAll(async () => {
  const entity = await prisma.entity.create({
    data: { code: `ENT-COLL-${ts}`, name: 'Collection Test Entity', type: 'parent', status: 'active' },
  });
  await prisma.currency.upsert({
    where: { code: 'SAR' }, update: {},
    create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
  });
  const project = await prisma.project.create({
    data: {
      code: `PROJ-COLL-${ts}`, name: 'Collection Test', entityId: entity.id,
      status: 'active', currencyCode: 'SAR', startDate: new Date(), createdBy: 'test',
    },
  });
  testProject = { id: project.id };

  // Create a parent IPA and IPC so TaxInvoice has valid FK refs
  const ipa = await prisma.ipa.create({
    data: {
      projectId: project.id, status: 'approved_internal', periodNumber: 1,
      periodFrom: new Date(), periodTo: new Date(), grossAmount: 100000,
      retentionRate: 0.10, retentionAmount: 10000, previousCertified: 0,
      currentClaim: 90000, netClaimed: 90000, currency: 'SAR', createdBy: 'test',
    },
  });
  const ipc = await prisma.ipc.create({
    data: {
      projectId: project.id, ipaId: ipa.id, status: 'signed',
      certifiedAmount: 90000, retentionAmount: 9000, netCertified: 81000,
      certificationDate: new Date(), currency: 'SAR', createdBy: 'test',
    },
  });
  testIpc = { id: ipc.id };
});

afterAll(async () => {
  // Clean up in correct FK order
  await prisma.invoiceCollection.deleteMany({
    where: { taxInvoice: { projectId: testProject.id } },
  });
  await prisma.taxInvoice.deleteMany({ where: { projectId: testProject.id } });
  await prisma.ipc.deleteMany({ where: { projectId: testProject.id } });
  await prisma.ipa.deleteMany({ where: { projectId: testProject.id } });
  await prisma.project.deleteMany({ where: { id: testProject.id } });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Invoice Collection Service', () => {
  describe('recordCollection', () => {
    it('records a single partial collection and sets invoice to partially_collected', async () => {
      const invoice = await createCollectableInvoice(10000);

      const result = await recordCollection(
        {
          taxInvoiceId: invoice.id,
          amount: 3000,
          collectionDate: new Date('2026-03-15'),
        },
        'test-user',
      );

      expect(result.collection.amount).toEqual(new Prisma.Decimal(3000));
      expect(result.statusChanged).toBe(true);
      expect(result.invoice.status).toBe('partially_collected');
    });

    it('records multiple partial collections and keeps invoice as partially_collected', async () => {
      const invoice = await createCollectableInvoice(10000);

      // First collection: 3000
      await recordCollection(
        { taxInvoiceId: invoice.id, amount: 3000, collectionDate: new Date('2026-03-15') },
        'test-user',
      );

      // Second collection: 2000
      const result = await recordCollection(
        { taxInvoiceId: invoice.id, amount: 2000, collectionDate: new Date('2026-03-20') },
        'test-user',
      );

      expect(result.invoice.status).toBe('partially_collected');

      // Outstanding should be 5000
      const outstanding = await getOutstandingAmount(invoice.id);
      expect(outstanding.totalAmount).toBe('10000');
      expect(outstanding.collectedAmount).toBe('5000');
      expect(outstanding.outstandingAmount).toBe('5000');
    });

    it('records exact full collection and sets invoice to collected', async () => {
      const invoice = await createCollectableInvoice(5000);

      const result = await recordCollection(
        { taxInvoiceId: invoice.id, amount: 5000, collectionDate: new Date('2026-04-01') },
        'test-user',
      );

      expect(result.statusChanged).toBe(true);
      expect(result.invoice.status).toBe('collected');

      const outstanding = await getOutstandingAmount(invoice.id);
      expect(outstanding.outstandingAmount).toBe('0');
    });

    it('blocks overcollection', async () => {
      const invoice = await createCollectableInvoice(10000);

      // Collect 7000 first
      await recordCollection(
        { taxInvoiceId: invoice.id, amount: 7000, collectionDate: new Date('2026-03-15') },
        'test-user',
      );

      // Try to collect 5000 more (total would be 12000 > 10000)
      await expect(
        recordCollection(
          { taxInvoiceId: invoice.id, amount: 5000, collectionDate: new Date('2026-03-20') },
          'test-user',
        ),
      ).rejects.toThrow('Overcollection blocked');
    });

    it('rejects collection on non-collectable invoice (draft)', async () => {
      const draftInvoice = await prisma.taxInvoice.create({
        data: {
          projectId: testProject.id, ipcId: testIpc.id, status: 'draft',
          invoiceNumber: `INV-DRAFT-${ts}-${Date.now()}`,
          invoiceDate: new Date(), grossAmount: 5000, vatRate: 0.15,
          vatAmount: 750, totalAmount: 5000, currency: 'SAR',
          buyerName: 'Test', sellerTaxId: '123', createdBy: 'test',
        },
      });

      await expect(
        recordCollection(
          { taxInvoiceId: draftInvoice.id, amount: 1000, collectionDate: new Date() },
          'test-user',
        ),
      ).rejects.toThrow("Cannot record collection: invoice is in 'draft' status");
    });

    it('rejects collection on already-collected invoice', async () => {
      const invoice = await createCollectableInvoice(1000);

      // Fully collect
      await recordCollection(
        { taxInvoiceId: invoice.id, amount: 1000, collectionDate: new Date() },
        'test-user',
      );

      // Try to collect more
      await expect(
        recordCollection(
          { taxInvoiceId: invoice.id, amount: 100, collectionDate: new Date() },
          'test-user',
        ),
      ).rejects.toThrow("Cannot record collection: invoice is in 'collected' status");
    });

    it('rejects zero or negative amount via Zod validation', async () => {
      // The Zod schema enforces positive amounts, so we test at the schema level
      const { RecordCollectionSchema } = await import('@fmksa/contracts');

      const zeroResult = RecordCollectionSchema.safeParse({
        taxInvoiceId: '00000000-0000-0000-0000-000000000000',
        amount: 0,
        collectionDate: new Date(),
      });
      expect(zeroResult.success).toBe(false);

      const negativeResult = RecordCollectionSchema.safeParse({
        taxInvoiceId: '00000000-0000-0000-0000-000000000000',
        amount: -500,
        collectionDate: new Date(),
      });
      expect(negativeResult.success).toBe(false);
    });

    it('writes audit log entry', async () => {
      const invoice = await createCollectableInvoice(8000);

      const result = await recordCollection(
        { taxInvoiceId: invoice.id, amount: 2000, collectionDate: new Date() },
        'test-user',
      );

      const logs = await prisma.auditLog.findMany({
        where: {
          resourceId: result.collection.id,
          action: 'invoice_collection.record',
        },
      });
      expect(logs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('listCollections', () => {
    it('returns collections ordered by collectionDate asc', async () => {
      const invoice = await createCollectableInvoice(10000);

      // Record in reverse chronological order
      await recordCollection(
        { taxInvoiceId: invoice.id, amount: 2000, collectionDate: new Date('2026-06-15') },
        'test-user',
      );
      await recordCollection(
        { taxInvoiceId: invoice.id, amount: 1000, collectionDate: new Date('2026-03-01') },
        'test-user',
      );
      await recordCollection(
        { taxInvoiceId: invoice.id, amount: 1500, collectionDate: new Date('2026-04-10') },
        'test-user',
      );

      const collections = await listCollections(invoice.id);

      expect(collections).toHaveLength(3);
      // Verify ascending order by collectionDate
      expect(collections[0]!.collectionDate.toISOString()).toBe(new Date('2026-03-01').toISOString());
      expect(collections[1]!.collectionDate.toISOString()).toBe(new Date('2026-04-10').toISOString());
      expect(collections[2]!.collectionDate.toISOString()).toBe(new Date('2026-06-15').toISOString());
    });
  });

  describe('getOutstandingAmount', () => {
    it('computes outstanding correctly with no collections', async () => {
      const invoice = await createCollectableInvoice(25000);

      const result = await getOutstandingAmount(invoice.id);

      expect(result.totalAmount).toBe('25000');
      expect(result.collectedAmount).toBe('0');
      expect(result.outstandingAmount).toBe('25000');
    });

    it('computes outstanding correctly after partial collections', async () => {
      const invoice = await createCollectableInvoice(20000);

      await recordCollection(
        { taxInvoiceId: invoice.id, amount: 5000, collectionDate: new Date('2026-01-15') },
        'test-user',
      );
      await recordCollection(
        { taxInvoiceId: invoice.id, amount: 3000, collectionDate: new Date('2026-02-15') },
        'test-user',
      );

      const result = await getOutstandingAmount(invoice.id);

      expect(result.totalAmount).toBe('20000');
      expect(result.collectedAmount).toBe('8000');
      expect(result.outstandingAmount).toBe('12000');
    });
  });
});
