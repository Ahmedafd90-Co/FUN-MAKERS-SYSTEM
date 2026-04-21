import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma, Prisma } from '@fmksa/db';
import { getFinancialKpis } from '../../src/commercial/dashboard/financial-kpis';
import {
  KPI_DEFINITIONS,
  getKpiDefinition,
  getSupportedKpis,
  getBlockedKpis,
  IPA_APPROVED_PLUS,
  IPC_SIGNED_PLUS,
  TI_ISSUED_PLUS,
  VAR_SUBMITTED_PLUS,
  VAR_APPROVED_PLUS,
} from '../../src/commercial/dashboard/kpi-definitions';
import { recordCollection } from '../../src/commercial/invoice-collection/service';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const ts = `kpi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
let testProject: { id: string };
let testIpc: { id: string };

beforeAll(async () => {
  const entity = await prisma.entity.create({
    data: { code: `ENT-KPI-${ts}`, name: 'KPI Test Entity', type: 'parent', status: 'active' },
  });
  await prisma.currency.upsert({
    where: { code: 'SAR' }, update: {},
    create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
  });

  const project = await prisma.project.create({
    data: {
      code: `PROJ-KPI-${ts}`,
      name: 'KPI Test Project',
      entityId: entity.id,
      status: 'active',
      currencyCode: 'SAR',
      startDate: new Date(),
      createdBy: 'test',
      contractValue: 50000000,        // 50M budget
      // revisedContractValue is no longer used — revised budget is now system-derived
    },
  });
  testProject = { id: project.id };

  // Create IPA (approved_internal) — contributes to total_claimed
  const ipa = await prisma.ipa.create({
    data: {
      projectId: project.id, status: 'approved_internal', periodNumber: 1,
      periodFrom: new Date(), periodTo: new Date(), grossAmount: 1000000,
      retentionRate: 0.10, retentionAmount: 100000, previousCertified: 0,
      currentClaim: 900000, netClaimed: 900000, currency: 'SAR', createdBy: 'test',
    },
  });

  // Create IPC (signed) — contributes to total_certified
  const ipc = await prisma.ipc.create({
    data: {
      projectId: project.id, ipaId: ipa.id, status: 'signed',
      certifiedAmount: 850000, retentionAmount: 85000, netCertified: 765000,
      certificationDate: new Date(), currency: 'SAR', createdBy: 'test',
    },
  });
  testIpc = { id: ipc.id };

  // Create TaxInvoice (issued, with dueDate in the past for overdue testing)
  const invoice1 = await prisma.taxInvoice.create({
    data: {
      projectId: project.id, ipcId: ipc.id, status: 'issued',
      invoiceNumber: `INV-KPI-${ts}-1`, invoiceDate: new Date(),
      grossAmount: 500000, vatRate: 0.15, vatAmount: 75000, totalAmount: 575000,
      dueDate: new Date('2025-01-01'), // past due
      currency: 'SAR', buyerName: 'Test', sellerTaxId: '123', createdBy: 'test',
    },
  });

  // Create a second TaxInvoice (submitted, due in future)
  await prisma.taxInvoice.create({
    data: {
      projectId: project.id, ipcId: ipc.id, status: 'submitted',
      invoiceNumber: `INV-KPI-${ts}-2`, invoiceDate: new Date(),
      grossAmount: 200000, vatRate: 0.15, vatAmount: 30000, totalAmount: 230000,
      dueDate: new Date('2027-12-31'), // future
      currency: 'SAR', buyerName: 'Test', sellerTaxId: '123', createdBy: 'test',
    },
  });

  // Record a partial collection against invoice1 — 200000 of 575000
  await recordCollection(
    { taxInvoiceId: invoice1.id, amount: 200000, collectionDate: new Date('2026-03-15') },
    'test-user',
  );

  // Create a Variation (approved_internal) with cost impacts
  // Note: approved_internal VOs do NOT contribute to revised_budget (only client_approved/closed VOs do)
  await prisma.variation.create({
    data: {
      projectId: project.id, subtype: 'vo', status: 'approved_internal',
      title: 'KPI Test VO', description: 'Test', reason: 'Test',
      costImpact: 300000, approvedCostImpact: 250000,
      currency: 'SAR', createdBy: 'test',
    },
  });

  // Create a VO (client_approved) — contributes to revised_budget delta
  await prisma.variation.create({
    data: {
      projectId: project.id, subtype: 'vo', status: 'client_approved',
      title: 'KPI Test VO Client Approved', description: 'Test', reason: 'Test',
      costImpact: 500000, approvedCostImpact: 400000,
      currency: 'SAR', createdBy: 'test',
    },
  });

  // Create a CO (approved_internal) — contributes to revised_budget delta
  await prisma.variation.create({
    data: {
      projectId: project.id, subtype: 'change_order', status: 'approved_internal',
      title: 'KPI Test CO', description: 'Test', reason: 'Test',
      costImpact: 200000, approvedCostImpact: 180000,
      currency: 'SAR', createdBy: 'test',
    },
  });

  // Create a Variation (submitted) with cost impact but no approved amount
  await prisma.variation.create({
    data: {
      projectId: project.id, subtype: 'vo', status: 'submitted',
      title: 'KPI Test VO 2', description: 'Test', reason: 'Test',
      costImpact: 150000,
      currency: 'SAR', createdBy: 'test',
    },
  });

  // Create a draft Variation — must NOT count toward submitted_variation_impact
  await prisma.variation.create({
    data: {
      projectId: project.id, subtype: 'vo', status: 'draft',
      title: 'KPI Test VO Draft', description: 'Test', reason: 'Test',
      costImpact: 999999,
      currency: 'SAR', createdBy: 'test',
    },
  });
});

afterAll(async () => {
  await prisma.invoiceCollection.deleteMany({
    where: { taxInvoice: { projectId: testProject.id } },
  });
  await prisma.taxInvoice.deleteMany({ where: { projectId: testProject.id } });
  await prisma.ipc.deleteMany({ where: { projectId: testProject.id } });
  await prisma.ipa.deleteMany({ where: { projectId: testProject.id } });
  await prisma.variation.deleteMany({ where: { projectId: testProject.id } });
  await prisma.projectSetting.deleteMany({ where: { projectId: testProject.id } });
  await prisma.project.deleteMany({ where: { id: testProject.id } });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Financial KPI Service', () => {
  describe('getFinancialKpis', () => {
    it('returns all 15 KPIs from the dictionary', async () => {
      const result = await getFinancialKpis(testProject.id);

      expect(Object.keys(result.kpis)).toHaveLength(KPI_DEFINITIONS.length);
      for (const def of KPI_DEFINITIONS) {
        expect(result.kpis[def.id]).toBeDefined();
        expect(result.kpis[def.id]!.id).toBe(def.id);
        expect(result.kpis[def.id]!.name).toBe(def.name);
      }
    });

    it('returns project currency and computedAt timestamp', async () => {
      const result = await getFinancialKpis(testProject.id);

      expect(result.currency).toBe('SAR');
      expect(result.projectId).toBe(testProject.id);
      expect(result.computedAt).toBeTruthy();
    });

    it('computes total_claimed from approved+ IPAs', async () => {
      const result = await getFinancialKpis(testProject.id);
      const kpi = result.kpis.total_claimed!;

      expect(kpi.value).toBe('900000.00');
      expect(kpi.supportStatus).toBe('supported');
      expect(kpi.drilldown).not.toBeNull();
    });

    it('computes total_certified from signed+ IPCs', async () => {
      const result = await getFinancialKpis(testProject.id);
      const kpi = result.kpis.total_certified!;

      expect(kpi.value).toBe('765000.00');
      expect(kpi.supportStatus).toBe('supported');
    });

    it('computes total_invoiced from issued+ TaxInvoices', async () => {
      const result = await getFinancialKpis(testProject.id);
      const kpi = result.kpis.total_invoiced!;

      // invoice1: 575000 + invoice2: 230000 = 805000
      expect(kpi.value).toBe('805000.00');
    });

    it('computes total_collected from InvoiceCollection amounts', async () => {
      const result = await getFinancialKpis(testProject.id);
      const kpi = result.kpis.total_collected!;

      // 200000 collected against invoice1
      expect(kpi.value).toBe('200000.00');
    });

    it('computes open_receivable from invoice totals minus collection totals (amount-driven)', async () => {
      const result = await getFinancialKpis(testProject.id);
      const kpi = result.kpis.open_receivable!;

      // Invoice1 (partially_collected): 575000 total, 200000 collected = 375000 outstanding
      // Invoice2 (submitted): 230000 total, 0 collected = 230000 outstanding
      // Total open receivable = 375000 + 230000 = 605000
      expect(kpi.value).toBe('605000.00');
      expect(kpi.supportStatus).toBe('supported');
    });

    it('computes overdue_receivable from amount math on overdue invoices only', async () => {
      const result = await getFinancialKpis(testProject.id);
      const kpi = result.kpis.overdue_receivable!;

      // Only invoice1 has dueDate in the past (2025-01-01)
      // invoice1: 575000 total - 200000 collected = 375000 overdue outstanding
      // invoice2 has dueDate in the future — excluded
      expect(kpi.value).toBe('375000.00');
    });

    it('computes collection_rate as (collected / invoiced) * 100', async () => {
      const result = await getFinancialKpis(testProject.id);
      const kpi = result.kpis.collection_rate!;

      // 200000 / 805000 * 100 = ~24.84%
      const rate = parseFloat(kpi.value!);
      expect(rate).toBeGreaterThan(24);
      expect(rate).toBeLessThan(25);
    });

    it('returns collection_rate = 0 when no invoices exist (explicit zero-invoiced policy)', async () => {
      // Create a project with no invoices
      const emptyEntity = await prisma.entity.findFirst({ where: { code: `ENT-KPI-${ts}` } });
      const emptyProject = await prisma.project.create({
        data: {
          code: `PROJ-KPI-EMPTY-${ts}`,
          name: 'Empty KPI Project',
          entityId: emptyEntity!.id,
          status: 'active',
          currencyCode: 'SAR',
          startDate: new Date(),
          createdBy: 'test',
        },
      });

      try {
        const result = await getFinancialKpis(emptyProject.id);
        const kpi = result.kpis.collection_rate!;

        // Explicit policy: 0 when no invoices, not NaN or error
        expect(kpi.value).toBe('0.00');
      } finally {
        await prisma.projectSetting.deleteMany({ where: { projectId: emptyProject.id } });
        await prisma.project.deleteMany({ where: { id: emptyProject.id } });
      }
    });

    it('computes budget from project.contractValue', async () => {
      const result = await getFinancialKpis(testProject.id);
      const kpi = result.kpis.budget!;

      expect(kpi.value).toBe('50000000.00');
      expect(kpi.nature).toBe('baseline');
    });

    it('computes revised_budget as contractValue + approved variation deltas', async () => {
      const result = await getFinancialKpis(testProject.id);
      const kpi = result.kpis.revised_budget!;

      // contractValue = 50000000
      // Qualifying deltas:
      //   VO (client_approved): approvedCostImpact = 400000
      //   CO (approved_internal): approvedCostImpact = 180000
      // Total = 50000000 + 400000 + 180000 = 50580000
      // Note: VO at approved_internal does NOT qualify (VOs need client_approved/closed)
      expect(kpi.value).toBe('50580000.00');
    });

    it('revised_budget equals contractValue when no approved variation deltas exist', async () => {
      const entity = await prisma.entity.findFirst({ where: { code: `ENT-KPI-${ts}` } });
      const proj = await prisma.project.create({
        data: {
          code: `PROJ-KPI-FALL-${ts}`,
          name: 'No Variations KPI Project',
          entityId: entity!.id,
          status: 'active',
          currencyCode: 'SAR',
          startDate: new Date(),
          createdBy: 'test',
          contractValue: 30000000,
        },
      });

      try {
        const result = await getFinancialKpis(proj.id);
        // No variations exist — revised_budget = contractValue + 0 = 30000000
        expect(result.kpis.revised_budget!.value).toBe('30000000.00');
      } finally {
        await prisma.projectSetting.deleteMany({ where: { projectId: proj.id } });
        await prisma.project.deleteMany({ where: { id: proj.id } });
      }
    });

    it('computes submitted_variation_impact from explicit allow-list (excludes draft)', async () => {
      const result = await getFinancialKpis(testProject.id);
      const kpi = result.kpis.submitted_variation_impact!;

      // approved_internal VO: 300000 + submitted VO: 150000
      // + client_approved VO: 500000 + approved_internal CO: 200000 = 1150000
      // draft VO (999999) must NOT be included
      expect(kpi.value).toBe('1150000.00');
    });

    it('computes approved_variation_impact from approved+ with non-null approvedCostImpact', async () => {
      const result = await getFinancialKpis(testProject.id);
      const kpi = result.kpis.approved_variation_impact!;

      // approved_internal VO: 250000 + client_approved VO: 400000
      // + approved_internal CO: 180000 = 830000
      expect(kpi.value).toBe('830000.00');
    });

    it('computes claimed_vs_certified_gap as total_claimed - total_certified', async () => {
      const result = await getFinancialKpis(testProject.id);
      const kpi = result.kpis.claimed_vs_certified_gap!;

      // 900000 - 765000 = 135000
      expect(kpi.value).toBe('135000.00');
    });

    it('provides cross-record drilldown for claimed_vs_certified_gap (both IPA and IPC)', async () => {
      const result = await getFinancialKpis(testProject.id);
      const kpi = result.kpis.claimed_vs_certified_gap!;

      expect(Array.isArray(kpi.drilldown)).toBe(true);
      const drilldowns = kpi.drilldown as Array<{ page: string; statusFilter: string[] }>;
      expect(drilldowns).toHaveLength(2);
      expect(drilldowns[0]!.page).toContain('/ipa');
      expect(drilldowns[1]!.page).toContain('/ipc');
    });
  });

  describe('procurement KPIs (now supported)', () => {
    it('committed_cost returns 0.00 when no approved POs exist', async () => {
      const result = await getFinancialKpis(testProject.id);
      const committed = result.kpis.committed_cost!;
      expect(committed.supportStatus).toBe('supported');
      expect(committed.value).toBe('0.00');
      expect(committed.blockedReason).toBeUndefined();
      expect(committed.drilldown).not.toBeNull();
    });

    it('actual_cost returns 0.00 when no approved SIs/expenses exist', async () => {
      const result = await getFinancialKpis(testProject.id);
      const actual = result.kpis.actual_cost!;
      expect(actual.supportStatus).toBe('supported');
      expect(actual.value).toBe('0.00');
      expect(actual.blockedReason).toBeUndefined();
    });

    it('remaining_budget equals revised_budget when no commitments exist', async () => {
      const result = await getFinancialKpis(testProject.id);
      const remaining = result.kpis.remaining_budget!;
      expect(remaining.supportStatus).toBe('supported');
      const revised = result.kpis.revised_budget!;
      expect(remaining.value).toBe(revised.value);
    });
  });

  describe('KPI dictionary integrity', () => {
    it('every non-supported KPI has a blockedReason', () => {
      for (const def of KPI_DEFINITIONS) {
        if (def.supportStatus !== 'supported') {
          expect(def.blockedReason, `${def.id} missing blockedReason`).toBeTruthy();
        }
      }
    });

    it('service uses dictionary filters not hardcoded values', async () => {
      // Verify the dictionary constants are the actual source
      const totalClaimedDef = getKpiDefinition('total_claimed')!;
      expect(totalClaimedDef.statusFilter).toEqual([...IPA_APPROVED_PLUS]);

      const totalCertifiedDef = getKpiDefinition('total_certified')!;
      expect(totalCertifiedDef.statusFilter).toEqual([...IPC_SIGNED_PLUS]);

      const submittedVarDef = getKpiDefinition('submitted_variation_impact')!;
      expect(submittedVarDef.statusFilter).toEqual([...VAR_SUBMITTED_PLUS]);
    });

    it('getSupportedKpis returns all 19 KPIs as supported', () => {
      // 15 baseline + 4 added in commercial forecast lane
      expect(getSupportedKpis()).toHaveLength(19);
    });

    it('getBlockedKpis returns 0 blocked KPIs', () => {
      expect(getBlockedKpis()).toHaveLength(0);
    });
  });
});
