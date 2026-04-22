/**
 * Monthly Commercial Cost Sheet service tests.
 *
 * Truth rules under test:
 *   - Monthly IPA Achieved groups by `periodFrom` month, status ∈ IPA_APPROVED_PLUS,
 *     including imported-historical IPAs (same rule as total_claimed).
 *   - Monthly IPC Certified groups by `certificationDate` month.
 *   - Monthly Invoiced (matrix) is EX-VAT (totalAmount − vatAmount),
 *     grouped by `invoiceDate` month. Gross exposed separately for raw-data.
 *   - Monthly Collected groups by `collectionDate` month (no reconstruction).
 *   - Trailing-12 default range when only `reportMonth` is supplied.
 *   - Mixed-currency portfolios: per-currency sub-totals; no single roll-up,
 *     `mixedCurrencies: true` and a warning.
 *   - Approved Variation uses the VO/CO split gate (matches
 *     revised-contract-value.ts).
 *   - Zero-forecast month → `diffPct: null` (never NaN).
 *
 * Database-backed — runs against the test Postgres configured by CI.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@fmksa/db';
import { getMonthlyCostSheet, __testing } from '../../src/commercial/monthly-cost-sheet';

const ts = `mcs-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const actor = 'test-user';

// Fixed "now" in May 2026 so trailing-12 covers Jun 2025 → May 2026 inclusive.
const NOW = new Date('2026-05-15T00:00:00.000Z');
const REPORT_MONTH = '2026-05';

let sarProjectA: string; // primary project, full commercial data
let sarProjectB: string; // second SAR project — for portfolio aggregation
let usdProject: string;  // different currency — triggers mixed-currency guard

beforeAll(async () => {
  const entity = await prisma.entity.create({
    data: { code: `ENT-${ts}`, name: 'MCS Test', type: 'parent', status: 'active' },
  });
  await prisma.currency.upsert({
    where: { code: 'SAR' }, update: {},
    create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
  });
  await prisma.currency.upsert({
    where: { code: 'USD' }, update: {},
    create: { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2 },
  });

  // ── Project A — SAR, full monthly dataset ─────────────────────────
  const pA = await prisma.project.create({
    data: {
      code: `PROJ-A-${ts}`, name: 'MCS A', entityId: entity.id,
      status: 'active', currencyCode: 'SAR',
      startDate: new Date('2026-02-01'),
      createdBy: actor, contractValue: 10000000,
    },
  });
  sarProjectA = pA.id;

  // Forecasts Feb/Mar/Apr (one per period)
  await prisma.ipaForecast.createMany({
    data: [
      { projectId: sarProjectA, periodNumber: 1, periodStart: new Date('2026-02-01'), forecastAmount: 1000000, currency: 'SAR', createdBy: actor },
      { projectId: sarProjectA, periodNumber: 2, periodStart: new Date('2026-03-01'), forecastAmount: 2000000, currency: 'SAR', createdBy: actor },
      { projectId: sarProjectA, periodNumber: 3, periodStart: new Date('2026-04-01'), forecastAmount: 3000000, currency: 'SAR', createdBy: actor },
    ],
  });

  // Live IPA — period 1 (Feb, on plan) and period 2 (Mar, behind)
  await prisma.ipa.create({
    data: {
      projectId: sarProjectA, status: 'approved_internal', periodNumber: 1,
      periodFrom: new Date('2026-02-01'), periodTo: new Date('2026-02-28'),
      grossAmount: 1100000, retentionRate: 0.10, retentionAmount: 100000,
      previousCertified: 0, currentClaim: 1000000, netClaimed: 1000000,
      currency: 'SAR', createdBy: actor,
    },
  });
  await prisma.ipa.create({
    data: {
      projectId: sarProjectA, status: 'approved_internal', periodNumber: 2,
      periodFrom: new Date('2026-03-01'), periodTo: new Date('2026-03-31'),
      grossAmount: 1800000, retentionRate: 0.10, retentionAmount: 200000,
      previousCertified: 1000000, currentClaim: 1600000, netClaimed: 1600000,
      currency: 'SAR', createdBy: actor,
    },
  });
  // Imported-historical IPA — period 3 (must count toward Apr achieved)
  await prisma.ipa.create({
    data: {
      projectId: sarProjectA, status: 'approved_internal', periodNumber: 3,
      periodFrom: new Date('2026-04-01'), periodTo: new Date('2026-04-30'),
      grossAmount: 1500000, retentionRate: 0.10, retentionAmount: 150000,
      previousCertified: 2600000, currentClaim: 1350000, netClaimed: 1350000,
      currency: 'SAR', createdBy: actor,
      origin: 'imported_historical',
    },
  });
  // DRAFT IPA — must NOT count toward Achieved
  await prisma.ipa.create({
    data: {
      projectId: sarProjectA, status: 'draft', periodNumber: 4,
      periodFrom: new Date('2026-05-01'), periodTo: new Date('2026-05-31'),
      grossAmount: 5000000, retentionRate: 0.10, retentionAmount: 500000,
      previousCertified: 3950000, currentClaim: 4500000, netClaimed: 4500000,
      currency: 'SAR', createdBy: actor,
    },
  });

  // IPC — one signed IPC in March (certificationDate month 2026-03)
  await prisma.ipc.create({
    data: {
      projectId: sarProjectA, ipaId: (await prisma.ipa.findFirst({ where: { projectId: sarProjectA, periodNumber: 1 } }))!.id,
      status: 'signed',
      certifiedAmount: 900000, retentionAmount: 90000, netCertified: 810000,
      certificationDate: new Date('2026-03-10'),
      currency: 'SAR', createdBy: actor,
    },
  });

  // Tax invoice — one issued in April, grossAmount 800k, vat 120k → ex-VAT = 680k
  const inv = await prisma.taxInvoice.create({
    data: {
      projectId: sarProjectA,
      ipcId: (await prisma.ipc.findFirst({ where: { projectId: sarProjectA } }))!.id,
      status: 'issued',
      invoiceNumber: `INV-${ts}-1`, invoiceDate: new Date('2026-04-05'),
      grossAmount: 800000, vatRate: 0.15, vatAmount: 120000, totalAmount: 920000,
      dueDate: new Date('2026-05-05'),
      currency: 'SAR', buyerName: 'Test', sellerTaxId: '123', createdBy: actor,
    },
  });
  // Invoice collection — 500k in May (invoiced Apr, collected May)
  await prisma.invoiceCollection.create({
    data: {
      taxInvoiceId: inv.id, amount: 500000,
      collectionDate: new Date('2026-05-12'),
      recordedBy: actor,
    },
  });

  // Variations — one VO client_approved (counts) + one CO approved_internal (counts)
  //              one VO submitted (only in proposed) + one rejected (in NEITHER)
  await prisma.variation.create({
    data: {
      projectId: sarProjectA, subtype: 'vo', status: 'client_approved',
      title: 'MCS VO', description: 't', reason: 't',
      costImpact: 600000, approvedCostImpact: 500000,
      currency: 'SAR', createdBy: actor,
    },
  });
  await prisma.variation.create({
    data: {
      projectId: sarProjectA, subtype: 'change_order', status: 'approved_internal',
      title: 'MCS CO', description: 't', reason: 't',
      costImpact: 300000, approvedCostImpact: 250000,
      currency: 'SAR', createdBy: actor,
    },
  });
  await prisma.variation.create({
    data: {
      projectId: sarProjectA, subtype: 'vo', status: 'submitted',
      title: 'MCS VO Submitted', description: 't', reason: 't',
      costImpact: 100000,
      currency: 'SAR', createdBy: actor,
    },
  });

  // ── Project B — SAR, tiny, for portfolio aggregation ─────────────
  const pB = await prisma.project.create({
    data: {
      code: `PROJ-B-${ts}`, name: 'MCS B', entityId: entity.id,
      status: 'active', currencyCode: 'SAR',
      startDate: new Date('2026-02-01'),
      createdBy: actor, contractValue: 5000000,
    },
  });
  sarProjectB = pB.id;

  // ── Project C — USD, mixed-currency trigger ──────────────────────
  const pC = await prisma.project.create({
    data: {
      code: `PROJ-C-${ts}`, name: 'MCS C USD', entityId: entity.id,
      status: 'active', currencyCode: 'USD',
      startDate: new Date('2026-02-01'),
      createdBy: actor, contractValue: 2000000,
    },
  });
  usdProject = pC.id;
});

afterAll(async () => {
  await prisma.invoiceCollection.deleteMany({ where: { taxInvoice: { projectId: sarProjectA } } });
  await prisma.taxInvoice.deleteMany({ where: { projectId: sarProjectA } });
  await prisma.ipc.deleteMany({ where: { projectId: sarProjectA } });
  await prisma.ipa.deleteMany({ where: { projectId: { in: [sarProjectA, sarProjectB, usdProject] } } });
  await prisma.ipaForecast.deleteMany({ where: { projectId: { in: [sarProjectA, sarProjectB, usdProject] } } });
  await prisma.variation.deleteMany({ where: { projectId: { in: [sarProjectA, sarProjectB, usdProject] } } });
  await prisma.project.deleteMany({ where: { id: { in: [sarProjectA, sarProjectB, usdProject] } } });
});

// ---------------------------------------------------------------------------
// Month helpers
// ---------------------------------------------------------------------------

describe('month helpers', () => {
  it('buildMonthRange is inclusive on both ends', () => {
    expect(__testing.buildMonthRange('2026-02', '2026-04')).toEqual([
      '2026-02', '2026-03', '2026-04',
    ]);
  });

  it('addMonths handles year boundaries', () => {
    expect(__testing.addMonths('2026-02', -3)).toBe('2025-11');
    expect(__testing.addMonths('2026-11', 2)).toBe('2027-01');
  });

  it('trailing-12 range ends at reportMonth', () => {
    const range = __testing.buildMonthRange(
      __testing.addMonths('2026-05', -11),
      '2026-05',
    );
    expect(range).toHaveLength(12);
    expect(range[0]).toBe('2025-06');
    expect(range[11]).toBe('2026-05');
  });
});

// ---------------------------------------------------------------------------
// Single-project grouping
// ---------------------------------------------------------------------------

describe('getMonthlyCostSheet — single project', () => {
  it('defaults to trailing 12 months ending at reportMonth', async () => {
    const s = await getMonthlyCostSheet({
      projectIds: [sarProjectA],
      reportMonth: REPORT_MONTH,
      now: NOW,
    });
    expect(s.fromMonth).toBe('2025-06');
    expect(s.toMonth).toBe('2026-05');
    expect(s.months).toHaveLength(12);
  });

  it('groups IPA Achieved by periodFrom month and includes imported-historical', async () => {
    const s = await getMonthlyCostSheet({
      projectIds: [sarProjectA],
      reportMonth: REPORT_MONTH,
      now: NOW,
    });
    const project = s.projects[0]!;
    const byMonth = new Map(project.months.map((m) => [m.yearMonth, m]));
    expect(byMonth.get('2026-02')!.ipa.achieved).toBe('1000000.00');
    expect(byMonth.get('2026-03')!.ipa.achieved).toBe('1600000.00');
    // Imported-historical in Apr MUST count:
    expect(byMonth.get('2026-04')!.ipa.achieved).toBe('1350000.00');
    // DRAFT in May must NOT count:
    expect(byMonth.get('2026-05')!.ipa.achieved).toBe('0.00');
  });

  it('computes per-month IPA diff and attainment %; zero-forecast → null %', async () => {
    const s = await getMonthlyCostSheet({
      projectIds: [sarProjectA],
      reportMonth: REPORT_MONTH,
      now: NOW,
    });
    const m = new Map(s.projects[0]!.months.map((x) => [x.yearMonth, x]));
    // Feb: forecast 1.0M, achieved 1.0M → diff 0, % 100
    expect(m.get('2026-02')!.ipa.forecast).toBe('1000000.00');
    expect(m.get('2026-02')!.ipa.diff).toBe('0.00');
    expect(m.get('2026-02')!.ipa.diffPct).toBe('100.00');
    // Mar: forecast 2.0M, achieved 1.6M → diff -0.4M, % 80
    expect(m.get('2026-03')!.ipa.diff).toBe('-400000.00');
    expect(m.get('2026-03')!.ipa.diffPct).toBe('80.00');
    // May: no forecast → diff null, % null (never NaN)
    expect(m.get('2026-05')!.ipa.forecast).toBeNull();
    expect(m.get('2026-05')!.ipa.diff).toBeNull();
    expect(m.get('2026-05')!.ipa.diffPct).toBeNull();
  });

  it('groups IPC Certified by certificationDate', async () => {
    const s = await getMonthlyCostSheet({
      projectIds: [sarProjectA],
      reportMonth: REPORT_MONTH,
      now: NOW,
    });
    const m = new Map(s.projects[0]!.months.map((x) => [x.yearMonth, x]));
    // IPC signed 2026-03-10 → should land in Mar
    expect(m.get('2026-03')!.ipc.achieved).toBe('810000.00');
    expect(m.get('2026-04')!.ipc.achieved).toBe('0.00');
  });

  it('splits invoiced into ex-VAT (matrix) and gross (raw data)', async () => {
    const s = await getMonthlyCostSheet({
      projectIds: [sarProjectA],
      reportMonth: REPORT_MONTH,
      now: NOW,
    });
    const m = new Map(s.projects[0]!.months.map((x) => [x.yearMonth, x]));
    // Invoice Apr: totalAmount 920k, vatAmount 120k → ex-VAT 800k, gross 920k
    expect(m.get('2026-04')!.invoicedExVat.achieved).toBe('800000.00');
    expect(m.get('2026-04')!.invoicedGross.achieved).toBe('920000.00');
  });

  it('groups collected by collectionDate, not invoiceDate', async () => {
    const s = await getMonthlyCostSheet({
      projectIds: [sarProjectA],
      reportMonth: REPORT_MONTH,
      now: NOW,
    });
    const m = new Map(s.projects[0]!.months.map((x) => [x.yearMonth, x]));
    // Invoiced Apr, collected May → collection must be in May
    expect(m.get('2026-04')!.collected.achieved).toBe('0.00');
    expect(m.get('2026-05')!.collected.achieved).toBe('500000.00');
  });

  it('Approved Variation uses VO/CO split gate', async () => {
    const s = await getMonthlyCostSheet({
      projectIds: [sarProjectA],
      reportMonth: REPORT_MONTH,
      now: NOW,
    });
    const p = s.projects[0]!;
    // VO client_approved (500k) + CO approved_internal (250k) = 750k
    expect(p.approvedVariation).toBe('750000.00');
    // Submitted 100k + approved 500k + 300k = 900k (VAR_SUBMITTED_PLUS includes all)
    expect(p.proposedVariation).toBe('1000000.00');
    // Anticipated = 10M + 750k = 10.75M
    expect(p.anticipatedContractAmount).toBe('10750000.00');
  });

  it('up-to-prior-month excludes the reporting month', async () => {
    const s = await getMonthlyCostSheet({
      projectIds: [sarProjectA],
      reportMonth: REPORT_MONTH, // 2026-05; prior = up to 2026-04
      now: NOW,
    });
    const p = s.projects[0]!;
    // Collection happened in May; it must NOT be in "up to prior" (which ends Apr)
    expect(p.upToPriorMonth.collected).toBe('0.00');
    // But IPA achieved through Apr = 1M + 1.6M + 1.35M = 3.95M
    expect(p.upToPriorMonth.ipaAchieved).toBe('3950000.00');
    // Cumulative through reportMonth includes May (which has 0 IPA achieved, 500k collected)
    expect(p.cumulative.ipaAchieved).toBe('3950000.00');
    expect(p.cumulative.collected).toBe('500000.00');
  });
});

// ---------------------------------------------------------------------------
// Portfolio aggregation + mixed-currency guard
// ---------------------------------------------------------------------------

describe('getMonthlyCostSheet — portfolio', () => {
  it('aggregates SAR-only portfolio into a single currency group', async () => {
    const s = await getMonthlyCostSheet({
      projectIds: [sarProjectA, sarProjectB],
      reportMonth: REPORT_MONTH,
      now: NOW,
    });
    expect(s.mixedCurrencies).toBe(false);
    expect(Object.keys(s.currencyGroups)).toEqual(['SAR']);
    const sar = s.currencyGroups['SAR']!;
    expect(sar.projectCount).toBe(2);
    // Contract total: 10M + 5M = 15M
    expect(sar.contractAmount).toBe('15000000.00');
  });

  it('suppresses single rolled-up total when currencies are mixed and emits a warning', async () => {
    const s = await getMonthlyCostSheet({
      projectIds: [sarProjectA, usdProject],
      reportMonth: REPORT_MONTH,
      now: NOW,
    });
    expect(s.mixedCurrencies).toBe(true);
    // Both sub-totals present
    expect(s.currencyGroups['SAR']).toBeDefined();
    expect(s.currencyGroups['USD']).toBeDefined();
    expect(s.currencyGroups['SAR']!.projectCount).toBe(1);
    expect(s.currencyGroups['USD']!.projectCount).toBe(1);
    // Warning text calls out the multiple currencies
    expect(s.warnings.some((w) => w.toLowerCase().includes('multiple') || w.toLowerCase().includes('currencies'))).toBe(true);
  });

  it('portfolio monthly sum = sum of per-project monthly cells', async () => {
    const s = await getMonthlyCostSheet({
      projectIds: [sarProjectA, sarProjectB],
      reportMonth: REPORT_MONTH,
      now: NOW,
    });
    const sar = s.currencyGroups['SAR']!;
    const feb = sar.months.find((m) => m.yearMonth === '2026-02')!;
    // Only project A has a Feb IPA achieved (1.0M). B is empty.
    expect(feb.ipa.achieved).toBe('1000000.00');
    expect(feb.ipa.forecast).toBe('1000000.00'); // A only
  });

  it('empty portfolio returns zero totals and no warnings', async () => {
    // Use a synthetic ID that won't match any project
    const s = await getMonthlyCostSheet({
      projectIds: ['00000000-0000-0000-0000-000000000000'],
      reportMonth: REPORT_MONTH,
      now: NOW,
    });
    expect(s.projects).toEqual([]);
    expect(Object.keys(s.currencyGroups)).toEqual([]);
    expect(s.mixedCurrencies).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('getMonthlyCostSheet — bad inputs', () => {
  it('throws when fromMonth is after toMonth', async () => {
    await expect(
      getMonthlyCostSheet({
        projectIds: [sarProjectA],
        fromMonth: '2026-06',
        toMonth: '2026-05',
        now: NOW,
      }),
    ).rejects.toThrow(/after/i);
  });
});
