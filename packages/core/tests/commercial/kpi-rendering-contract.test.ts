/**
 * I3 — Financial KPI Rendering Contract
 *
 * Proves the data contract between the KPI service and the dashboard
 * rendering layer. The dashboard component maps these data states to
 * specific card styles — this test proves the data states are correct
 * so the rendering is deterministic.
 *
 * The three rendering branches are:
 *   1. supported + numeric value  → normal KPI card (value string present)
 *   2. supported + null value     → muted "Not set" card
 *   3. blocked / partially_supported → hidden (null value, null drilldown)
 *
 * Additional contracts:
 *   - Cross-record KPIs have array drilldown (two explicit links)
 *   - Percentage KPIs produce numeric percentage values
 *   - Currency KPIs produce decimal-formatted monetary values
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@fmksa/db';
import { getFinancialKpis, type KpiValue } from '../../src/commercial/dashboard/financial-kpis';
import {
  getKpiDefinition,
  getSupportedKpis,
  getBlockedKpis,
  DASHBOARD_DISPLAY_IDS,
  PERCENTAGE_KPI_IDS,
  type KpiDrilldown,
} from '../../src/commercial/dashboard/kpi-definitions';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ts = `render-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
let projectWithBudgetId: string;
let projectWithoutBudgetId: string;

beforeAll(async () => {
  const entity = await prisma.entity.create({
    data: { code: `ENT-RENDER-${ts}`, name: 'Render Test', type: 'parent', status: 'active' },
  });
  await prisma.currency.upsert({
    where: { code: 'SAR' }, update: {},
    create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
  });

  // Project WITH contractValue — budget + revised_budget will have values
  const p1 = await prisma.project.create({
    data: {
      code: `PROJ-RENDER-A-${ts}`,
      name: 'Render Test With Budget',
      entityId: entity.id,
      status: 'active',
      currencyCode: 'SAR',
      startDate: new Date(),
      createdBy: 'test',
      contractValue: 5000000,
      // revisedContractValue is now system-derived: contractValue + approved variation deltas
    },
  });
  projectWithBudgetId = p1.id;

  // Variation to produce revised = 5,000,000 + 1,000,000 = 6,000,000
  await prisma.variation.create({
    data: {
      projectId: p1.id, subtype: 'vo', status: 'client_approved',
      title: 'Render VO Delta', description: 'Test', reason: 'Test',
      costImpact: 1200000, approvedCostImpact: 1000000,
      currency: 'SAR', createdBy: 'test',
    },
  });

  // Project WITHOUT contractValue — budget + revised_budget will be null
  const p2 = await prisma.project.create({
    data: {
      code: `PROJ-RENDER-B-${ts}`,
      name: 'Render Test No Budget',
      entityId: entity.id,
      status: 'active',
      currencyCode: 'SAR',
      startDate: new Date(),
      createdBy: 'test',
      // contractValue intentionally omitted
    },
  });
  projectWithoutBudgetId = p2.id;
});

afterAll(async () => {
  for (const id of [projectWithBudgetId, projectWithoutBudgetId]) {
    await prisma.invoiceCollection.deleteMany({ where: { taxInvoice: { projectId: id } } });
    await prisma.taxInvoice.deleteMany({ where: { projectId: id } });
    await prisma.ipc.deleteMany({ where: { projectId: id } });
    await prisma.ipa.deleteMany({ where: { projectId: id } });
    await prisma.variation.deleteMany({ where: { projectId: id } });
    await prisma.projectSetting.deleteMany({ where: { projectId: id } });
    await prisma.project.deleteMany({ where: { id } });
  }
});

// ---------------------------------------------------------------------------
// Rendering contract tests
// ---------------------------------------------------------------------------

describe('KPI Rendering Contract', () => {
  // -------------------------------------------------------------------------
  // Branch 1: supported + numeric value → normal card
  // -------------------------------------------------------------------------

  describe('supported + numeric value → normal card data', () => {
    it('budget renders with value when contractValue is set', async () => {
      const result = await getFinancialKpis(projectWithBudgetId);
      const kpi = result.kpis.budget!;

      expect(kpi.supportStatus).toBe('supported');
      expect(kpi.value).not.toBeNull();
      expect(kpi.value).toBe('5000000.00');
      expect(kpi.drilldown).not.toBeNull();
    });

    it('revised_budget renders with derived value (contractValue + approved deltas)', async () => {
      const result = await getFinancialKpis(projectWithBudgetId);
      const kpi = result.kpis.revised_budget!;

      expect(kpi.supportStatus).toBe('supported');
      expect(kpi.value).toBe('6000000.00');
      expect(kpi.drilldown).not.toBeNull();
    });

    it('all supported KPIs with zero-value still return "0.00" (not null)', async () => {
      // On project with budget but no commercial records, all inflow KPIs = 0.00
      const result = await getFinancialKpis(projectWithBudgetId);

      for (const id of DASHBOARD_DISPLAY_IDS) {
        const kpi = result.kpis[id]!;
        if (kpi.supportStatus === 'supported') {
          // budget/revised_budget have actual values; everything else should be 0.00 or the budget value
          expect(kpi.value, `KPI "${id}" should not be null on a supported project`).not.toBeNull();
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // Branch 2: supported + null value → "Not set" card
  // -------------------------------------------------------------------------

  describe('supported + null value → "Not set" card data', () => {
    it('budget is null when project has no contractValue', async () => {
      const result = await getFinancialKpis(projectWithoutBudgetId);
      const kpi = result.kpis.budget!;

      expect(kpi.supportStatus).toBe('supported');
      expect(kpi.value).toBeNull();
      // Drilldown is still present — it points to project settings
      expect(kpi.drilldown).not.toBeNull();
    });

    it('revised_budget is null when project has no contractValue', async () => {
      const result = await getFinancialKpis(projectWithoutBudgetId);
      const kpi = result.kpis.revised_budget!;

      expect(kpi.supportStatus).toBe('supported');
      expect(kpi.value).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Branch 3: blocked / partially_supported → hidden
  // -------------------------------------------------------------------------

  describe('blocked → hidden card data', () => {
    it('blocked KPIs return null value and null drilldown', async () => {
      const result = await getFinancialKpis(projectWithBudgetId);

      for (const def of getBlockedKpis()) {
        const kpi = result.kpis[def.id]!;
        expect(kpi.value, `Blocked KPI "${def.id}" should have null value`).toBeNull();
        expect(kpi.drilldown, `Blocked KPI "${def.id}" should have null drilldown`).toBeNull();
        expect(kpi.supportStatus).not.toBe('supported');
      }
    });

    it('blocked KPIs include a blockedReason', async () => {
      const result = await getFinancialKpis(projectWithBudgetId);

      for (const def of getBlockedKpis()) {
        const kpi = result.kpis[def.id]!;
        expect(kpi.blockedReason, `Blocked KPI "${def.id}" missing blockedReason`).toBeTruthy();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Cross-record drilldown — two explicit links
  // -------------------------------------------------------------------------

  describe('cross-record drilldown', () => {
    it('claimed_vs_certified_gap has array drilldown with 2 entries', async () => {
      const result = await getFinancialKpis(projectWithBudgetId);
      const kpi = result.kpis.claimed_vs_certified_gap!;

      expect(Array.isArray(kpi.drilldown)).toBe(true);
      const dds = kpi.drilldown as KpiDrilldown[];
      expect(dds).toHaveLength(2);
    });

    it('no single-drilldown KPI has an array drilldown', async () => {
      const result = await getFinancialKpis(projectWithBudgetId);

      for (const id of DASHBOARD_DISPLAY_IDS) {
        if (id === 'claimed_vs_certified_gap') continue;
        const kpi = result.kpis[id]!;
        if (kpi.drilldown !== null) {
          expect(
            Array.isArray(kpi.drilldown),
            `KPI "${id}" should not have array drilldown`,
          ).toBe(false);
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // Percentage vs currency formatting
  // -------------------------------------------------------------------------

  describe('formatting contract', () => {
    it('collection_rate value is a percentage number (not a monetary amount)', async () => {
      const result = await getFinancialKpis(projectWithBudgetId);
      const kpi = result.kpis.collection_rate!;

      // On empty project, rate should be 0.00 (explicit zero policy)
      expect(kpi.value).toBe('0.00');
      expect(PERCENTAGE_KPI_IDS.has('collection_rate')).toBe(true);
    });

    it('all non-percentage KPIs produce decimal-formatted monetary strings', async () => {
      const result = await getFinancialKpis(projectWithBudgetId);

      for (const id of DASHBOARD_DISPLAY_IDS) {
        if (PERCENTAGE_KPI_IDS.has(id)) continue;
        const kpi = result.kpis[id]!;
        if (kpi.value !== null) {
          // Value must be a valid decimal string with 2 decimal places
          expect(kpi.value).toMatch(/^\d+\.\d{2}$/);
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // Service returns all dictionary KPIs
  // -------------------------------------------------------------------------

  describe('service completeness', () => {
    it('getFinancialKpis returns a KpiValue for every KPI in the dictionary', async () => {
      const result = await getFinancialKpis(projectWithBudgetId);
      const supported = getSupportedKpis();
      const blocked = getBlockedKpis();

      for (const def of [...supported, ...blocked]) {
        expect(
          result.kpis[def.id],
          `KPI "${def.id}" missing from service result`,
        ).toBeDefined();
        expect(result.kpis[def.id]!.id).toBe(def.id);
        expect(result.kpis[def.id]!.name).toBe(def.name);
      }
    });
  });
});
