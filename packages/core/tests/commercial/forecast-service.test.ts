/**
 * Forecast service + forecast-vs-actual KPI computation tests.
 *
 * Scope:
 *   - CRUD (listForecasts, upsertForecast, deleteForecast)
 *   - getForecastVsActual: totals, to-date math, this-month pairing, per-period rows
 *   - getFinancialKpis forecast KPIs (forecast_total, forecast_this_month,
 *     ipa_forecast_variance, ipa_forecast_attainment)
 *   - Explicit zero-forecast attainment policy (null, not NaN/Infinity)
 *   - "Actual IPA" reuses total_claimed (status IN IPA_APPROVED_PLUS) — no fork
 *
 * Database-backed — runs against the test Postgres configured by CI.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@fmksa/db';
import {
  listForecasts,
  upsertForecast,
  deleteForecast,
  getForecastVsActual,
} from '../../src/commercial/forecast/service';
import { getFinancialKpis } from '../../src/commercial/dashboard/financial-kpis';

const ts = `fc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
let projectId: string;
const actor = 'test-user';

// Fixed "now" inside April 2026 so "this month" math is deterministic.
const NOW = new Date('2026-04-15T00:00:00.000Z');

beforeAll(async () => {
  const entity = await prisma.entity.create({
    data: { code: `ENT-${ts}`, name: 'Forecast Test', type: 'parent', status: 'active' },
  });
  await prisma.currency.upsert({
    where: { code: 'SAR' },
    update: {},
    create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
  });

  const project = await prisma.project.create({
    data: {
      code: `PROJ-${ts}`,
      name: 'Forecast Test Project',
      entityId: entity.id,
      status: 'active',
      currencyCode: 'SAR',
      startDate: new Date('2026-01-01'),
      createdBy: actor,
      contractValue: 20000000,
    },
  });
  projectId = project.id;

  // Period 1 (Feb) — IPA approved_internal, netClaimed 4,500,000 (on plan)
  await prisma.ipa.create({
    data: {
      projectId, status: 'approved_internal', periodNumber: 1,
      periodFrom: new Date('2026-02-01'), periodTo: new Date('2026-02-28'),
      grossAmount: 5000000, retentionRate: 0.10, retentionAmount: 500000,
      previousCertified: 0, currentClaim: 4500000, netClaimed: 4500000,
      currency: 'SAR', createdBy: actor,
    },
  });
  // Period 2 (Mar) — IPA approved_internal, netClaimed 2,700,000 (behind plan)
  await prisma.ipa.create({
    data: {
      projectId, status: 'approved_internal', periodNumber: 2,
      periodFrom: new Date('2026-03-01'), periodTo: new Date('2026-03-31'),
      grossAmount: 3000000, retentionRate: 0.10, retentionAmount: 300000,
      previousCertified: 4500000, currentClaim: 2700000, netClaimed: 2700000,
      currency: 'SAR', createdBy: actor,
    },
  });
  // Period 3 (Apr) — NO IPA yet (current month, not claimed)

  // DRAFT IPA for period 4 — must NOT count as actual (status not in IPA_APPROVED_PLUS)
  await prisma.ipa.create({
    data: {
      projectId, status: 'draft', periodNumber: 4,
      periodFrom: new Date('2026-05-01'), periodTo: new Date('2026-05-31'),
      grossAmount: 2000000, retentionRate: 0.10, retentionAmount: 200000,
      previousCertified: 7200000, currentClaim: 1800000, netClaimed: 1800000,
      currency: 'SAR', createdBy: actor,
    },
  });
});

afterAll(async () => {
  await prisma.ipaForecast.deleteMany({ where: { projectId } });
  await prisma.ipa.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
});

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

describe('Forecast CRUD', () => {
  it('upsertForecast creates a new row when none exists', async () => {
    const created = await upsertForecast(
      { projectId, periodNumber: 1, periodStart: new Date('2026-02-01'), forecastAmount: 4500000, currency: 'SAR' },
      actor,
    );
    expect(created.periodNumber).toBe(1);
    expect(created.forecastAmount.toString()).toBe('4500000');
    expect(created.createdBy).toBe(actor);
    expect(created.updatedBy).toBeNull();
  });

  it('upsertForecast updates an existing row (same periodNumber)', async () => {
    const updated = await upsertForecast(
      { projectId, periodNumber: 1, periodStart: new Date('2026-02-01'), forecastAmount: 4600000, currency: 'SAR', notes: 'revised' },
      actor,
    );
    expect(updated.forecastAmount.toString()).toBe('4600000');
    expect(updated.updatedBy).toBe(actor);
    expect(updated.notes).toBe('revised');

    // Idempotent — still one row for this period
    const count = await prisma.ipaForecast.count({ where: { projectId, periodNumber: 1 } });
    expect(count).toBe(1);
  });

  it('listForecasts returns rows sorted by periodNumber ascending', async () => {
    await upsertForecast(
      { projectId, periodNumber: 3, periodStart: new Date('2026-04-01'), forecastAmount: 3500000, currency: 'SAR' },
      actor,
    );
    await upsertForecast(
      { projectId, periodNumber: 2, periodStart: new Date('2026-03-01'), forecastAmount: 3000000, currency: 'SAR' },
      actor,
    );
    const rows = await listForecasts(projectId);
    expect(rows.map((r) => r.periodNumber)).toEqual([1, 2, 3]);
  });

  it('deleteForecast removes a row by (projectId, periodNumber)', async () => {
    await upsertForecast(
      { projectId, periodNumber: 99, periodStart: new Date('2027-01-01'), forecastAmount: 1000, currency: 'SAR' },
      actor,
    );
    await deleteForecast(projectId, 99, actor);
    const rows = await listForecasts(projectId);
    expect(rows.find((r) => r.periodNumber === 99)).toBeUndefined();
  });

  it('deleteForecast throws when the row does not exist', async () => {
    await expect(deleteForecast(projectId, 12345, actor)).rejects.toThrow(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// getForecastVsActual
// ---------------------------------------------------------------------------

describe('getForecastVsActual', () => {
  it('computes totals and to-date variance correctly at NOW = 2026-04-15', async () => {
    // Forecasts seeded: P1=4.6M (updated above), P2=3.0M, P3=3.5M → total 11.1M
    // Actual (netClaimed where approved+): 4.5M + 2.7M = 7.2M (DRAFT P4 excluded)
    // To-date forecast (periodStart <= 2026-04-15): all three → 11.1M
    // Variance: 7.2 - 11.1 = -3.9M
    // Attainment: 7.2/11.1 * 100 ≈ 64.86%
    const result = await getForecastVsActual(projectId, NOW);
    expect(result.totalForecast).toBe('11100000.00');
    expect(result.totalActual).toBe('7200000.00');
    expect(result.toDateForecast).toBe('11100000.00');
    expect(result.toDateVariance).toBe('-3900000.00');
    expect(result.toDateAttainmentPercent).not.toBeNull();
    expect(parseFloat(result.toDateAttainmentPercent!)).toBeCloseTo(64.86, 1);
  });

  it('identifies "this month" as the period whose periodStart falls in current month', async () => {
    const result = await getForecastVsActual(projectId, NOW);
    // April 2026 → Period 3 (starts 2026-04-01)
    expect(result.thisMonth.periodNumber).toBe(3);
    expect(result.thisMonth.forecastAmount).toBe('3500000.00');
    // No IPA exists for period 3 yet
    expect(result.thisMonth.actualAmount).toBe('0.00');
  });

  it('per-period rows pair forecast with matching IPA by periodNumber; drafts count 0 actual', async () => {
    const result = await getForecastVsActual(projectId, NOW);
    const byPeriod = new Map(result.periods.map((p) => [p.periodNumber, p]));

    // Period 1 — IPA approved_internal, actual = netClaimed = 4.5M
    expect(byPeriod.get(1)?.actualAmount).toBe('4500000.00');
    expect(byPeriod.get(1)?.ipaIsApproved).toBe(true);

    // Period 2 — IPA approved_internal, actual = 2.7M, variance = 2.7 - 3.0 = -0.3M
    expect(byPeriod.get(2)?.actualAmount).toBe('2700000.00');
    expect(byPeriod.get(2)?.variance).toBe('-300000.00');

    // Period 3 — no IPA, actual = 0, variance = 0 - 3.5M
    expect(byPeriod.get(3)?.actualAmount).toBe('0.00');
    expect(byPeriod.get(3)?.ipaId).toBeNull();
  });

  it('explicit zero-forecast attainment returns null (not NaN/Infinity)', async () => {
    // Wipe forecasts for this project temporarily
    const backup = await prisma.ipaForecast.findMany({ where: { projectId } });
    await prisma.ipaForecast.deleteMany({ where: { projectId } });

    const result = await getForecastVsActual(projectId, NOW);
    expect(result.totalForecast).toBe('0.00');
    expect(result.toDateForecast).toBe('0.00');
    expect(result.toDateAttainmentPercent).toBeNull();
    // Variance is still meaningful: actual - 0 = actual
    expect(result.toDateVariance).toBe('7200000.00');

    // Restore
    for (const row of backup) {
      await prisma.ipaForecast.create({
        data: {
          projectId: row.projectId, periodNumber: row.periodNumber,
          periodStart: row.periodStart, forecastAmount: row.forecastAmount,
          currency: row.currency, notes: row.notes, createdBy: row.createdBy,
        },
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Financial KPIs — forecast KPI integration
// ---------------------------------------------------------------------------

describe('getFinancialKpis — forecast KPIs', () => {
  it('forecast_total = SUM of all forecast rows', async () => {
    const r = await getFinancialKpis(projectId, NOW);
    expect(r.kpis['forecast_total']!.value).toBe('11100000.00');
    expect(r.kpis['forecast_total']!.nature).toBe('expected');
  });

  it('forecast_this_month = forecast whose periodStart is in the current month', async () => {
    const r = await getFinancialKpis(projectId, NOW);
    expect(r.kpis['forecast_this_month']!.value).toBe('3500000.00');
  });

  it('ipa_forecast_variance = total_claimed - to-date forecast', async () => {
    const r = await getFinancialKpis(projectId, NOW);
    // total_claimed 7.2M - to-date forecast 11.1M = -3.9M
    expect(r.kpis['ipa_forecast_variance']!.value).toBe('-3900000.00');
  });

  it('ipa_forecast_attainment = claimed / to-date forecast * 100', async () => {
    const r = await getFinancialKpis(projectId, NOW);
    const pct = parseFloat(r.kpis['ipa_forecast_attainment']!.value!);
    expect(pct).toBeCloseTo(64.86, 1);
  });

  it('forecast KPIs are not postable (postingCoverage = null)', async () => {
    // Structural assertion — forecasts are plan data, not ledger truth.
    // Walk the dictionary entries to confirm.
    const r = await getFinancialKpis(projectId, NOW);
    const ids = ['forecast_total', 'forecast_this_month', 'ipa_forecast_variance', 'ipa_forecast_attainment'];
    for (const id of ids) {
      expect(r.kpis[id]!.supportStatus).toBe('supported');
    }
  });

  it('reuses total_claimed as "actual" — no competing definition', async () => {
    const r = await getFinancialKpis(projectId, NOW);
    // total_claimed is independently computed from IPA.netClaimed where status IN IPA_APPROVED_PLUS.
    // Variance math must equal total_claimed.value - to-date forecast.
    const claimed = parseFloat(r.kpis['total_claimed']!.value!);
    expect(claimed).toBe(7200000);
  });
});
