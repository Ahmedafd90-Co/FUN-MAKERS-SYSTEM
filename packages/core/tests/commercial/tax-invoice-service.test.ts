import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@fmksa/db';
import {
  createTaxInvoice,
  transitionTaxInvoice,
  getTaxInvoice,
  listTaxInvoices,
  deleteTaxInvoice,
} from '../../src/commercial/tax-invoice/service';
import { createIpa, transitionIpa } from '../../src/commercial/ipa/service';
import { createIpc, transitionIpc } from '../../src/commercial/ipc/service';
import { registerCommercialEventTypes } from '../../src/commercial/posting-hooks/register';

describe('TaxInvoice Service', () => {
  let testProject: { id: string; code: string; entityId: string };
  let signedIpc: { id: string };
  const ts = Date.now();

  beforeAll(async () => {
    registerCommercialEventTypes();

    const entity = await prisma.entity.create({
      data: { code: `ENT-TI-${ts}`, name: 'TaxInvoice Test Entity', type: 'parent', status: 'active' },
    });
    await prisma.currency.upsert({
      where: { code: 'SAR' }, update: {},
      create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
    });
    const project = await prisma.project.create({
      data: {
        code: `PROJ-TI-${ts}`, name: 'TaxInvoice Test', entityId: entity.id,
        status: 'active', currencyCode: 'SAR', startDate: new Date(), createdBy: 'test',
      },
    });
    testProject = { id: project.id, code: project.code, entityId: entity.id };

    // Create IPA and transition to approved_internal
    const ipa = await createIpa({
      projectId: testProject.id,
      periodNumber: 1,
      periodFrom: new Date().toISOString(),
      periodTo: new Date().toISOString(),
      grossAmount: 100000,
      retentionRate: 0.1,
      retentionAmount: 10000,
      previousCertified: 0,
      currentClaim: 90000,
      netClaimed: 90000,
      currency: 'SAR',
    }, 'test-user');

    await transitionIpa(ipa.id, 'submit', 'test-user');
    await transitionIpa(ipa.id, 'review', 'test-user');
    await transitionIpa(ipa.id, 'approve', 'test-user');

    // Create IPC and transition to signed
    const ipc = await createIpc({
      projectId: testProject.id,
      ipaId: ipa.id,
      certifiedAmount: 80000,
      retentionAmount: 8000,
      netCertified: 72000,
      certificationDate: new Date().toISOString(),
      currency: 'SAR',
    }, 'test-user');

    await transitionIpc(ipc.id, 'submit', 'test-user');
    await transitionIpc(ipc.id, 'review', 'test-user');
    await transitionIpc(ipc.id, 'approve', 'test-user');
    await transitionIpc(ipc.id, 'sign', 'test-user');
    signedIpc = { id: ipc.id };
  });

  const makeInput = (overrides = {}) => ({
    projectId: testProject.id,
    ipcId: signedIpc.id,
    invoiceNumber: 'IGNORED', // auto-generated, this value is overridden
    invoiceDate: new Date().toISOString(),
    grossAmount: 80000,
    vatRate: 0.15,
    vatAmount: 12000,
    totalAmount: 92000,
    currency: 'SAR',
    buyerName: 'Test Buyer',
    buyerTaxId: '300000000000003',
    sellerTaxId: '300000000000001',
    ...overrides,
  });

  it('cannot create TaxInvoice if parent IPC is in draft status', async () => {
    // Create a new IPA -> approved, IPC -> stays in draft
    const ipa2 = await createIpa({
      projectId: testProject.id,
      periodNumber: 99,
      periodFrom: new Date().toISOString(),
      periodTo: new Date().toISOString(),
      grossAmount: 50000,
      retentionRate: 0.1,
      retentionAmount: 5000,
      previousCertified: 0,
      currentClaim: 45000,
      netClaimed: 45000,
      currency: 'SAR',
    }, 'test-user');

    await transitionIpa(ipa2.id, 'submit', 'test-user');
    await transitionIpa(ipa2.id, 'review', 'test-user');
    await transitionIpa(ipa2.id, 'approve', 'test-user');

    const draftIpc = await createIpc({
      projectId: testProject.id,
      ipaId: ipa2.id,
      certifiedAmount: 40000,
      retentionAmount: 4000,
      netCertified: 36000,
      certificationDate: new Date().toISOString(),
      currency: 'SAR',
    }, 'test-user');

    await expect(
      createTaxInvoice(makeInput({ ipcId: draftIpc.id }), 'test-user'),
    ).rejects.toThrow(/parent IPC is in 'draft' status/);
  });

  it('can create TaxInvoice when parent IPC is signed', async () => {
    const inv = await createTaxInvoice(makeInput(), 'test-user');
    expect(inv).toBeTruthy();
    expect(inv.ipcId).toBe(signedIpc.id);
    expect(inv.status).toBe('draft');
  });

  it('create assigns invoiceNumber automatically', async () => {
    const inv = await createTaxInvoice(makeInput(), 'test-user');
    expect(inv.invoiceNumber).toMatch(new RegExp(`^${testProject.code}-INVNUM-\\d{3}$`));
  });

  it('full lifecycle: draft -> under_review -> approved_internal -> issued -> submitted -> collected', async () => {
    const inv = await createTaxInvoice(makeInput(), 'test-user');
    await transitionTaxInvoice(inv.id, 'submit', 'test-user');
    await transitionTaxInvoice(inv.id, 'approve', 'test-user');
    await transitionTaxInvoice(inv.id, 'issue', 'test-user');
    await transitionTaxInvoice(inv.id, 'mark_submitted', 'test-user');
    const collected = await transitionTaxInvoice(inv.id, 'mark_collected', 'test-user');
    expect(collected.status).toBe('collected');
  });

  it('TAX_INVOICE_ISSUED posting fires at issued', async () => {
    const inv = await createTaxInvoice(makeInput(), 'test-user');
    await transitionTaxInvoice(inv.id, 'submit', 'test-user');
    await transitionTaxInvoice(inv.id, 'approve', 'test-user');
    await transitionTaxInvoice(inv.id, 'issue', 'test-user');

    const postingEvent = await prisma.postingEvent.findFirst({
      where: { sourceRecordId: inv.id, eventType: 'TAX_INVOICE_ISSUED' },
    });
    expect(postingEvent).toBeTruthy();
  });

  it('reference number assigned at issued (INV type code)', async () => {
    const inv = await createTaxInvoice(makeInput(), 'test-user');
    await transitionTaxInvoice(inv.id, 'submit', 'test-user');
    await transitionTaxInvoice(inv.id, 'approve', 'test-user');
    const issued = await transitionTaxInvoice(inv.id, 'issue', 'test-user');
    expect(issued.status).toBe('issued');
    expect(issued.referenceNumber).toMatch(new RegExp(`^${testProject.code}-INV-\\d{3}$`));
  });

  it('post-issuance transitions work (overdue, partially_collected, etc.)', async () => {
    const inv = await createTaxInvoice(makeInput(), 'test-user');
    await transitionTaxInvoice(inv.id, 'submit', 'test-user');
    await transitionTaxInvoice(inv.id, 'approve', 'test-user');
    await transitionTaxInvoice(inv.id, 'issue', 'test-user');
    const overdue = await transitionTaxInvoice(inv.id, 'mark_overdue', 'test-user');
    expect(overdue.status).toBe('overdue');
    const partial = await transitionTaxInvoice(inv.id, 'mark_partially_collected', 'test-user');
    expect(partial.status).toBe('partially_collected');
    const collected = await transitionTaxInvoice(inv.id, 'mark_collected', 'test-user');
    expect(collected.status).toBe('collected');
  });

  it('terminal status cannot be transitioned', async () => {
    const inv = await createTaxInvoice(makeInput(), 'test-user');
    await transitionTaxInvoice(inv.id, 'submit', 'test-user');
    await transitionTaxInvoice(inv.id, 'approve', 'test-user');
    await transitionTaxInvoice(inv.id, 'issue', 'test-user');
    await transitionTaxInvoice(inv.id, 'mark_submitted', 'test-user');
    await transitionTaxInvoice(inv.id, 'mark_collected', 'test-user');
    await expect(transitionTaxInvoice(inv.id, 'mark_overdue', 'test-user')).rejects.toThrow(/terminal status/);
  });

  it('delete only in draft', async () => {
    const inv = await createTaxInvoice(makeInput(), 'test-user');
    await deleteTaxInvoice(inv.id, 'test-user');
    const deleted = await prisma.taxInvoice.findUnique({ where: { id: inv.id } });
    expect(deleted).toBeNull();
  });

  it('list with filters', async () => {
    // Create a couple of invoices for listing
    await createTaxInvoice(makeInput(), 'test-user');
    await createTaxInvoice(makeInput(), 'test-user');

    const result = await listTaxInvoices({
      projectId: testProject.id,
      statusFilter: ['draft'],
      skip: 0, take: 20, sortDirection: 'desc',
    });
    expect(result.items.length).toBeGreaterThanOrEqual(1);
    expect(result.total).toBeGreaterThanOrEqual(1);
    for (const item of result.items) {
      expect(item.status).toBe('draft');
    }
  });
});
