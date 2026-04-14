/**
 * I1 — KPI-to-Drilldown Reconciliation Test Suite
 *
 * Proves that each visible financial KPI's aggregate value reconciles with
 * what a user would see when they click the drilldown link and look at the
 * filtered register records.
 *
 * The test creates known data, computes KPIs via getFinancialKpis, then
 * independently queries the same records using the dictionary's status
 * filters and asserts the values match.
 *
 * This is the strongest form of guardrail — if the service drifts from
 * the dictionary, or the dictionary drifts from the drilldown metadata,
 * these tests fail.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma, Prisma } from '@fmksa/db';
import { getFinancialKpis } from '../../src/commercial/dashboard/financial-kpis';
import {
  getKpiDefinition,
  IPA_APPROVED_PLUS,
  IPC_SIGNED_PLUS,
  TI_ISSUED_PLUS,
  TI_OPEN_STATUSES,
  VAR_SUBMITTED_PLUS,
  VAR_APPROVED_PLUS,
  type KpiDrilldown,
} from '../../src/commercial/dashboard/kpi-definitions';
import type { IpaStatus, IpcStatus, TaxInvoiceStatus, VariationStatus } from '@fmksa/db';

// ---------------------------------------------------------------------------
// Test fixtures — deterministic amounts for reconciliation
// ---------------------------------------------------------------------------

const ts = `recon-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
let projectId: string;

beforeAll(async () => {
  const entity = await prisma.entity.create({
    data: { code: `ENT-RECON-${ts}`, name: 'Reconciliation Test', type: 'parent', status: 'active' },
  });
  await prisma.currency.upsert({
    where: { code: 'SAR' }, update: {},
    create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
  });

  const project = await prisma.project.create({
    data: {
      code: `PROJ-RECON-${ts}`,
      name: 'Reconciliation Test Project',
      entityId: entity.id,
      status: 'active',
      currencyCode: 'SAR',
      startDate: new Date(),
      createdBy: 'test',
      contractValue: 10000000,
      // revisedContractValue is now system-derived: contractValue + approved variation deltas
    },
  });
  projectId = project.id;

  // IPA #1 — approved_internal, netClaimed = 1,000,000
  const ipa1 = await prisma.ipa.create({
    data: {
      projectId, status: 'approved_internal', periodNumber: 1,
      periodFrom: new Date('2026-01-01'), periodTo: new Date('2026-01-31'),
      grossAmount: 1100000, retentionRate: 0.10, retentionAmount: 110000,
      previousCertified: 0, currentClaim: 1000000, netClaimed: 1000000,
      currency: 'SAR', createdBy: 'test',
    },
  });

  // IPA #2 — signed, netClaimed = 500,000
  const ipa2 = await prisma.ipa.create({
    data: {
      projectId, status: 'signed', periodNumber: 2,
      periodFrom: new Date('2026-02-01'), periodTo: new Date('2026-02-28'),
      grossAmount: 550000, retentionRate: 0.10, retentionAmount: 55000,
      previousCertified: 1000000, currentClaim: 500000, netClaimed: 500000,
      currency: 'SAR', createdBy: 'test',
    },
  });

  // IPA #3 — draft (must NOT count)
  await prisma.ipa.create({
    data: {
      projectId, status: 'draft', periodNumber: 3,
      periodFrom: new Date('2026-03-01'), periodTo: new Date('2026-03-31'),
      grossAmount: 999999, retentionRate: 0.10, retentionAmount: 99999,
      previousCertified: 0, currentClaim: 888888, netClaimed: 888888,
      currency: 'SAR', createdBy: 'test',
    },
  });

  // IPC #1 — signed, netCertified = 800,000
  const ipc1 = await prisma.ipc.create({
    data: {
      projectId, ipaId: ipa1.id, status: 'signed',
      certifiedAmount: 900000, retentionAmount: 100000, netCertified: 800000,
      certificationDate: new Date('2026-02-10'), currency: 'SAR', createdBy: 'test',
    },
  });

  // IPC #2 — signed, netCertified = 400,000
  const ipc2 = await prisma.ipc.create({
    data: {
      projectId, ipaId: ipa2.id, status: 'signed',
      certifiedAmount: 450000, retentionAmount: 50000, netCertified: 400000,
      certificationDate: new Date('2026-03-10'), currency: 'SAR', createdBy: 'test',
    },
  });

  // Invoice #1 — issued, totalAmount = 920,000, dueDate PAST (overdue)
  const inv1 = await prisma.taxInvoice.create({
    data: {
      projectId, ipcId: ipc1.id, status: 'issued',
      invoiceNumber: `INV-RECON-${ts}-1`, invoiceDate: new Date('2026-02-15'),
      grossAmount: 800000, vatRate: 0.15, vatAmount: 120000, totalAmount: 920000,
      dueDate: new Date('2025-06-01'), // PAST — overdue
      currency: 'SAR', buyerName: 'Test', sellerTaxId: '123', createdBy: 'test',
    },
  });

  // Invoice #2 — submitted, totalAmount = 460,000, dueDate FUTURE
  const inv2 = await prisma.taxInvoice.create({
    data: {
      projectId, ipcId: ipc2.id, status: 'submitted',
      invoiceNumber: `INV-RECON-${ts}-2`, invoiceDate: new Date('2026-03-15'),
      grossAmount: 400000, vatRate: 0.15, vatAmount: 60000, totalAmount: 460000,
      dueDate: new Date('2027-12-31'), // FUTURE — not overdue
      currency: 'SAR', buyerName: 'Test', sellerTaxId: '123', createdBy: 'test',
    },
  });

  // Invoice #3 — draft (must NOT count in any KPI)
  await prisma.taxInvoice.create({
    data: {
      projectId, ipcId: ipc1.id, status: 'draft',
      invoiceNumber: `INV-RECON-${ts}-3`, invoiceDate: new Date('2026-04-01'),
      grossAmount: 777777, vatRate: 0.15, vatAmount: 116666, totalAmount: 894443,
      currency: 'SAR', buyerName: 'Test', sellerTaxId: '123', createdBy: 'test',
    },
  });

  // Collection — 300,000 against invoice #1
  await prisma.invoiceCollection.create({
    data: {
      taxInvoiceId: inv1.id, amount: 300000,
      collectionDate: new Date('2026-03-01'),
      paymentMethod: 'bank_transfer', reference: `PMT-RECON-${ts}`,
      recordedBy: 'test',
    },
  });

  // Variation #1 — client_approved VO, costImpact = 200,000, approvedCostImpact = 150,000
  // client_approved counts for both approved_variation_impact AND revised contract value delta
  await prisma.variation.create({
    data: {
      projectId, subtype: 'vo', status: 'client_approved',
      title: 'Recon VO 1', description: 'Test', reason: 'Test',
      costImpact: 200000, approvedCostImpact: 150000,
      currency: 'SAR', createdBy: 'test',
    },
  });

  // Variation #2 — submitted, costImpact = 100,000, no approvedCostImpact
  await prisma.variation.create({
    data: {
      projectId, subtype: 'vo', status: 'submitted',
      title: 'Recon VO 2', description: 'Test', reason: 'Test',
      costImpact: 100000,
      currency: 'SAR', createdBy: 'test',
    },
  });

  // Variation #3 — draft (must NOT count)
  await prisma.variation.create({
    data: {
      projectId, subtype: 'vo', status: 'draft',
      title: 'Recon VO Draft', description: 'Test', reason: 'Test',
      costImpact: 999999,
      currency: 'SAR', createdBy: 'test',
    },
  });
});

afterAll(async () => {
  await prisma.invoiceCollection.deleteMany({ where: { taxInvoice: { projectId } } });
  await prisma.taxInvoice.deleteMany({ where: { projectId } });
  await prisma.ipc.deleteMany({ where: { projectId } });
  await prisma.ipa.deleteMany({ where: { projectId } });
  await prisma.variation.deleteMany({ where: { projectId } });
  await prisma.projectSetting.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
});

// ---------------------------------------------------------------------------
// Helper: decimal string comparison
// ---------------------------------------------------------------------------

function toDecStr(val: Prisma.Decimal | number | null | undefined): string {
  if (val == null) return '0.00';
  const d = val instanceof Prisma.Decimal ? val : new Prisma.Decimal(val);
  return d.toFixed(2);
}

// ---------------------------------------------------------------------------
// Reconciliation tests
// ---------------------------------------------------------------------------

describe('KPI-to-Drilldown Reconciliation', () => {
  // Expected values from the fixture data:
  // total_claimed:     1,000,000 + 500,000 = 1,500,000
  // total_certified:   800,000 + 400,000 = 1,200,000
  // total_invoiced:    920,000 + 460,000 = 1,380,000
  // total_collected:   300,000
  // open_receivable:   (920,000 + 460,000) - 300,000 = 1,080,000
  // overdue_receivable: 920,000 - 300,000 = 620,000 (only inv1 is past due)
  // collection_rate:   (300,000 / 1,380,000) * 100 = ~21.74%
  // claimed_vs_certified_gap: 1,500,000 - 1,200,000 = 300,000
  // budget:            10,000,000
  // revised_budget:    12,000,000
  // submitted_variation_impact: 200,000 + 100,000 = 300,000
  // approved_variation_impact:  150,000

  it('total_claimed reconciles with SUM(ipa.netClaimed) for approved+ IPAs', async () => {
    const kpis = await getFinancialKpis(projectId);
    const manual = await prisma.ipa.aggregate({
      where: { projectId, status: { in: [...IPA_APPROVED_PLUS] as IpaStatus[] } },
      _sum: { netClaimed: true },
    });
    expect(kpis.kpis.total_claimed!.value).toBe(toDecStr(manual._sum.netClaimed));
    expect(kpis.kpis.total_claimed!.value).toBe('1500000.00');
  });

  it('total_certified reconciles with SUM(ipc.netCertified) for signed+ IPCs', async () => {
    const kpis = await getFinancialKpis(projectId);
    const manual = await prisma.ipc.aggregate({
      where: { projectId, status: { in: [...IPC_SIGNED_PLUS] as IpcStatus[] } },
      _sum: { netCertified: true },
    });
    expect(kpis.kpis.total_certified!.value).toBe(toDecStr(manual._sum.netCertified));
    expect(kpis.kpis.total_certified!.value).toBe('1200000.00');
  });

  it('total_invoiced reconciles with SUM(taxInvoice.totalAmount) for issued+ invoices', async () => {
    const kpis = await getFinancialKpis(projectId);
    const manual = await prisma.taxInvoice.aggregate({
      where: { projectId, status: { in: [...TI_ISSUED_PLUS] as TaxInvoiceStatus[] } },
      _sum: { totalAmount: true },
    });
    expect(kpis.kpis.total_invoiced!.value).toBe(toDecStr(manual._sum.totalAmount));
    expect(kpis.kpis.total_invoiced!.value).toBe('1380000.00');
  });

  it('total_collected reconciles with SUM(invoiceCollection.amount) for issued+ invoices', async () => {
    const kpis = await getFinancialKpis(projectId);
    const manual = await prisma.invoiceCollection.aggregate({
      where: { taxInvoice: { projectId, status: { in: [...TI_ISSUED_PLUS] as TaxInvoiceStatus[] } } },
      _sum: { amount: true },
    });
    expect(kpis.kpis.total_collected!.value).toBe(toDecStr(manual._sum.amount));
    expect(kpis.kpis.total_collected!.value).toBe('300000.00');
  });

  it('open_receivable reconciles with (open invoice totals - open collections)', async () => {
    const kpis = await getFinancialKpis(projectId);
    const openInvs = await prisma.taxInvoice.aggregate({
      where: { projectId, status: { in: [...TI_OPEN_STATUSES] as TaxInvoiceStatus[] } },
      _sum: { totalAmount: true },
    });
    const openCols = await prisma.invoiceCollection.aggregate({
      where: { taxInvoice: { projectId, status: { in: [...TI_OPEN_STATUSES] as TaxInvoiceStatus[] } } },
      _sum: { amount: true },
    });
    const expected = new Prisma.Decimal(openInvs._sum.totalAmount ?? 0)
      .minus(new Prisma.Decimal(openCols._sum.amount ?? 0))
      .toFixed(2);
    expect(kpis.kpis.open_receivable!.value).toBe(expected);
    expect(kpis.kpis.open_receivable!.value).toBe('1080000.00');
  });

  it('overdue_receivable reconciles with (overdue invoice totals - overdue collections)', async () => {
    const kpis = await getFinancialKpis(projectId);
    const now = new Date();
    const overdueInvs = await prisma.taxInvoice.aggregate({
      where: {
        projectId,
        status: { in: [...TI_OPEN_STATUSES] as TaxInvoiceStatus[] },
        dueDate: { lt: now },
      },
      _sum: { totalAmount: true },
    });
    const overdueCols = await prisma.invoiceCollection.aggregate({
      where: {
        taxInvoice: {
          projectId,
          status: { in: [...TI_OPEN_STATUSES] as TaxInvoiceStatus[] },
          dueDate: { lt: now },
        },
      },
      _sum: { amount: true },
    });
    const expected = new Prisma.Decimal(overdueInvs._sum.totalAmount ?? 0)
      .minus(new Prisma.Decimal(overdueCols._sum.amount ?? 0))
      .toFixed(2);
    expect(kpis.kpis.overdue_receivable!.value).toBe(expected);
    expect(kpis.kpis.overdue_receivable!.value).toBe('620000.00');
  });

  it('overdue_receivable drilldown uses overdue=true', () => {
    const def = getKpiDefinition('overdue_receivable')!;
    const dd = def.drilldown as KpiDrilldown;
    expect(dd.additionalFilters).toBeDefined();
    expect(dd.additionalFilters!.overdue).toBe('true');
  });

  it('collection_rate reconciles with (total_collected / total_invoiced) * 100', async () => {
    const kpis = await getFinancialKpis(projectId);
    const rate = parseFloat(kpis.kpis.collection_rate!.value!);
    // 300000 / 1380000 * 100 = 21.739...
    expect(rate).toBeCloseTo(21.74, 1);
  });

  it('claimed_vs_certified_gap reconciles with total_claimed - total_certified', async () => {
    const kpis = await getFinancialKpis(projectId);
    const claimed = parseFloat(kpis.kpis.total_claimed!.value!);
    const certified = parseFloat(kpis.kpis.total_certified!.value!);
    const gap = parseFloat(kpis.kpis.claimed_vs_certified_gap!.value!);
    expect(gap).toBeCloseTo(claimed - certified, 2);
    expect(kpis.kpis.claimed_vs_certified_gap!.value).toBe('300000.00');
  });

  it('claimed_vs_certified_gap drilldown remains dual (IPA + IPC)', () => {
    const def = getKpiDefinition('claimed_vs_certified_gap')!;
    expect(Array.isArray(def.drilldown)).toBe(true);
    const dds = def.drilldown as KpiDrilldown[];
    expect(dds).toHaveLength(2);
    expect(dds[0]!.page).toContain('/ipa');
    expect(dds[1]!.page).toContain('/ipc');
  });

  it('submitted_variation_impact reconciles with SUM(variation.costImpact) for submitted+ statuses', async () => {
    const kpis = await getFinancialKpis(projectId);
    const manual = await prisma.variation.aggregate({
      where: { projectId, status: { in: [...VAR_SUBMITTED_PLUS] as VariationStatus[] } },
      _sum: { costImpact: true },
    });
    expect(kpis.kpis.submitted_variation_impact!.value).toBe(toDecStr(manual._sum.costImpact));
    expect(kpis.kpis.submitted_variation_impact!.value).toBe('300000.00');
  });

  it('approved_variation_impact reconciles with SUM(variation.approvedCostImpact) for approved+ statuses', async () => {
    const kpis = await getFinancialKpis(projectId);
    const manual = await prisma.variation.aggregate({
      where: {
        projectId,
        status: { in: [...VAR_APPROVED_PLUS] as VariationStatus[] },
        approvedCostImpact: { not: null },
      },
      _sum: { approvedCostImpact: true },
    });
    expect(kpis.kpis.approved_variation_impact!.value).toBe(toDecStr(manual._sum.approvedCostImpact));
    expect(kpis.kpis.approved_variation_impact!.value).toBe('150000.00');
  });

  it('budget reconciles with project.contractValue', async () => {
    const kpis = await getFinancialKpis(projectId);
    expect(kpis.kpis.budget!.value).toBe('10000000.00');
  });

  it('revised_budget reconciles with contractValue + approved variation deltas', async () => {
    const kpis = await getFinancialKpis(projectId);
    // contractValue (10,000,000) + client_approved VO delta (150,000) = 10,150,000
    expect(kpis.kpis.revised_budget!.value).toBe('10150000.00');
  });

  // ---------------------------------------------------------------------------
  // Exclusion guards — draft records must never count
  // ---------------------------------------------------------------------------

  describe('exclusion guards', () => {
    it('draft IPAs do not affect total_claimed', async () => {
      const kpis = await getFinancialKpis(projectId);
      // If draft IPA (888888) leaked, total would be > 1500000
      expect(parseFloat(kpis.kpis.total_claimed!.value!)).toBe(1500000);
    });

    it('draft invoices do not affect total_invoiced', async () => {
      const kpis = await getFinancialKpis(projectId);
      // If draft invoice (894443) leaked, total would be > 1380000
      expect(parseFloat(kpis.kpis.total_invoiced!.value!)).toBe(1380000);
    });

    it('draft variations do not affect submitted_variation_impact', async () => {
      const kpis = await getFinancialKpis(projectId);
      // If draft variation (999999) leaked, total would be > 300000
      expect(parseFloat(kpis.kpis.submitted_variation_impact!.value!)).toBe(300000);
    });
  });
});
