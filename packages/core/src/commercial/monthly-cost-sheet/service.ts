/**
 * Monthly Commercial Cost Sheet service.
 *
 * Produces the data matrix that backs the PAL-style workbook. The caller
 * (typically the /api/exports/monthly-cost-sheet route) does two things
 * before calling here:
 *   1. Permission-filters the project list (commercial_dashboard.view).
 *   2. Resolves month range defaults if the caller did not supply them.
 *
 * Why this is a separate service and not part of the existing dashboard:
 *   The dashboard/financial-kpis module returns scalars for one project.
 *   This module aggregates FOUR monthly series across N projects × 12 months,
 *   which is a different shape and a different query pattern (group-by-month
 *   instead of SUM-across-whole-project). Building it into financial-kpis
 *   would bloat the single-project path.
 *
 * Truth preservation:
 *   - Reuses existing KPI status gates from kpi-definitions (IPA_APPROVED_PLUS,
 *     IPC_SIGNED_PLUS, TI_ISSUED_PLUS, VAR_SUBMITTED_PLUS). No competing
 *     definitions.
 *   - Reuses the revised-contract-value split gate (VO vs CO) for Approved
 *     Variation and Anticipated Contract Amount.
 *   - Invoiced amount in the main matrix is EX-VAT (totalAmount − vatAmount)
 *     per the Phase 1 decision. Gross is also computed and exposed on the
 *     per-month cell for the raw-data sheet.
 *   - IPA Achieved includes imported-historical IPAs (same rule as
 *     total_claimed).
 */

import { prisma, Prisma } from '@fmksa/db';
import type {
  IpaStatus,
  IpcStatus,
  TaxInvoiceStatus,
  VariationStatus,
} from '@fmksa/db';
import {
  IPA_APPROVED_PLUS,
  IPC_SIGNED_PLUS,
  TI_ISSUED_PLUS,
  VAR_SUBMITTED_PLUS,
} from '../dashboard/kpi-definitions';
import type {
  CurrencyTotals,
  IpaMonthCell,
  MonthBlock,
  MonthlyCostSheet,
  MonthlyCostSheetOptions,
  PriorMonthTotals,
  ProjectRow,
} from './types';

// ---------------------------------------------------------------------------
// Decimal helpers
// ---------------------------------------------------------------------------

function toDecimal(
  val: Prisma.Decimal | number | string | null | undefined,
): Prisma.Decimal {
  if (val == null) return new Prisma.Decimal(0);
  if (val instanceof Prisma.Decimal) return val;
  return new Prisma.Decimal(val);
}

function decStr(val: Prisma.Decimal): string {
  return val.toFixed(2);
}

function zeroStr(): string {
  return '0.00';
}

/**
 * Percent as decimal string, null when forecast is null or ≤ 0.
 * Matches the zero-forecast policy used by `ipa_forecast_attainment`.
 */
function pctOrNull(
  achieved: Prisma.Decimal,
  forecast: Prisma.Decimal | null,
): string | null {
  if (forecast === null) return null;
  if (forecast.lte(0)) return null;
  return achieved.dividedBy(forecast).times(100).toFixed(2);
}

// ---------------------------------------------------------------------------
// Month helpers
// ---------------------------------------------------------------------------

/** UTC-safe: returns `YYYY-MM` for a Date. */
function monthKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

function monthKeyFromString(s: string): string {
  // s is expected YYYY-MM or YYYY-MM-DD…
  return s.slice(0, 7);
}

/** "2026-04" → "Apr 2026". UTC-stable. */
function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y!, (m ?? 1) - 1, 1));
  return d.toLocaleString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Inclusive range of YYYY-MM strings from → to (both ends). */
function buildMonthRange(fromKey: string, toKey: string): string[] {
  const [fy, fm] = fromKey.split('-').map(Number);
  const [ty, tm] = toKey.split('-').map(Number);
  const out: string[] = [];
  let y = fy!;
  let m = fm!;
  while (y < ty! || (y === ty! && m <= tm!)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      y += 1;
      m = 1;
    }
  }
  return out;
}

/** Subtract n months from YYYY-MM. */
function addMonths(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const idx = (y! * 12 + (m! - 1)) + delta;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Constants for date bounds (avoid allocating per-query)
// ---------------------------------------------------------------------------

/** Calendar start of a month, UTC midnight. */
function monthStartDate(key: string): Date {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1));
}

/** Calendar start of the NEXT month (exclusive upper bound). */
function monthEndDate(key: string): Date {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y!, m!, 1));
}

// ---------------------------------------------------------------------------
// Single project — pull rows and group per month
// ---------------------------------------------------------------------------

interface MonthBuckets {
  ipaForecast: Map<string, Prisma.Decimal>;
  ipaAchieved: Map<string, Prisma.Decimal>;
  ipcCertified: Map<string, Prisma.Decimal>;
  invoicedExVat: Map<string, Prisma.Decimal>;
  invoicedGross: Map<string, Prisma.Decimal>;
  collected: Map<string, Prisma.Decimal>;
}

function emptyBuckets(): MonthBuckets {
  return {
    ipaForecast: new Map(),
    ipaAchieved: new Map(),
    ipcCertified: new Map(),
    invoicedExVat: new Map(),
    invoicedGross: new Map(),
    collected: new Map(),
  };
}

function bump(m: Map<string, Prisma.Decimal>, key: string, val: Prisma.Decimal) {
  m.set(key, (m.get(key) ?? new Prisma.Decimal(0)).plus(val));
}

async function computeProjectRow(
  project: { id: string; code: string; name: string; currencyCode: string; contractValue: Prisma.Decimal | null },
  months: string[],
  reportingMonth: string,
): Promise<ProjectRow> {
  const { id: projectId } = project;

  // ── Parallel queries for ALL data we need ────────────────────────
  const [
    forecasts,
    ipas,
    ipcs,
    invoices,
    collections,
    varSubmitted,
    variationDeltaAgg,
  ] = await Promise.all([
    // IpaForecast — all rows (for cumulative + per-month)
    prisma.ipaForecast.findMany({
      where: { projectId },
      select: { periodStart: true, forecastAmount: true },
    }),

    // IPAs in approved+ statuses; periodFrom is the month anchor
    prisma.ipa.findMany({
      where: {
        projectId,
        status: { in: [...IPA_APPROVED_PLUS] as IpaStatus[] },
      },
      select: { periodFrom: true, netClaimed: true },
    }),

    // IPCs in signed+ statuses; certificationDate is the month anchor
    prisma.ipc.findMany({
      where: {
        projectId,
        status: { in: [...IPC_SIGNED_PLUS] as IpcStatus[] },
      },
      select: { certificationDate: true, netCertified: true },
    }),

    // Tax invoices in issued+ statuses; invoiceDate is the anchor.
    // Select BOTH totalAmount and vatAmount so we can compute ex-VAT for
    // the matrix while keeping gross available for the raw-data sheet.
    prisma.taxInvoice.findMany({
      where: {
        projectId,
        status: { in: [...TI_ISSUED_PLUS] as TaxInvoiceStatus[] },
      },
      select: {
        invoiceDate: true,
        totalAmount: true,
        vatAmount: true,
      },
    }),

    // Invoice collections whose parent TI is in issued+; collectionDate
    // is the month anchor.
    prisma.invoiceCollection.findMany({
      where: {
        taxInvoice: {
          projectId,
          status: { in: [...TI_ISSUED_PLUS] as TaxInvoiceStatus[] },
        },
      },
      select: { collectionDate: true, amount: true },
    }),

    // Proposed (submitted+) variation impact — SUM
    prisma.variation.aggregate({
      where: {
        projectId,
        status: { in: [...VAR_SUBMITTED_PLUS] as VariationStatus[] },
      },
      _sum: { costImpact: true },
    }),

    // Approved variation delta — split gate (matches revised-contract-value.ts)
    prisma.variation.aggregate({
      where: {
        projectId,
        approvedCostImpact: { not: null },
        OR: [
          { subtype: 'vo', status: { in: ['client_approved', 'closed'] } },
          {
            subtype: 'change_order',
            status: {
              in: ['approved_internal', 'signed', 'issued', 'closed'],
            },
          },
        ],
      },
      _sum: { approvedCostImpact: true },
    }),
  ]);

  // ── Group per month ───────────────────────────────────────────────
  const buckets = emptyBuckets();
  for (const f of forecasts) {
    bump(buckets.ipaForecast, monthKey(f.periodStart), toDecimal(f.forecastAmount));
  }
  for (const i of ipas) {
    bump(buckets.ipaAchieved, monthKey(i.periodFrom), toDecimal(i.netClaimed));
  }
  for (const c of ipcs) {
    bump(buckets.ipcCertified, monthKey(c.certificationDate), toDecimal(c.netCertified));
  }
  for (const inv of invoices) {
    const total = toDecimal(inv.totalAmount);
    const vat = toDecimal(inv.vatAmount);
    const exVat = total.minus(vat);
    bump(buckets.invoicedGross, monthKey(inv.invoiceDate), total);
    bump(buckets.invoicedExVat, monthKey(inv.invoiceDate), exVat);
  }
  for (const col of collections) {
    bump(buckets.collected, monthKey(col.collectionDate), toDecimal(col.amount));
  }

  // ── Build per-month blocks (matrix range only) ───────────────────
  const monthBlocks: MonthBlock[] = months.map((key) => {
    const forecastVal = buckets.ipaForecast.get(key) ?? null;
    const achievedIpa = buckets.ipaAchieved.get(key) ?? new Prisma.Decimal(0);
    const ipaCell: IpaMonthCell = {
      forecast: forecastVal ? decStr(forecastVal) : null,
      achieved: decStr(achievedIpa),
      diff: forecastVal ? decStr(achievedIpa.minus(forecastVal)) : null,
      diffPct: pctOrNull(achievedIpa, forecastVal),
    };
    const ipcVal = buckets.ipcCertified.get(key) ?? new Prisma.Decimal(0);
    const invExVat = buckets.invoicedExVat.get(key) ?? new Prisma.Decimal(0);
    const invGross = buckets.invoicedGross.get(key) ?? new Prisma.Decimal(0);
    const colVal = buckets.collected.get(key) ?? new Prisma.Decimal(0);
    return {
      yearMonth: key,
      label: monthLabel(key),
      ipa: ipaCell,
      ipc: { achieved: decStr(ipcVal) },
      invoicedExVat: { achieved: decStr(invExVat) },
      invoicedGross: { achieved: decStr(invGross) },
      collected: { achieved: decStr(colVal) },
    };
  });

  // ── Cumulatives (whole project lifetime, up to end of reportingMonth) ──
  const cutoffInclusive = reportingMonth;
  function cumulativeUpTo(bucket: Map<string, Prisma.Decimal>, cutoff: string): Prisma.Decimal {
    let acc = new Prisma.Decimal(0);
    for (const [k, v] of bucket) {
      if (k <= cutoff) acc = acc.plus(v);
    }
    return acc;
  }
  const cumulative = {
    ipaForecast: decStr(cumulativeUpTo(buckets.ipaForecast, cutoffInclusive)),
    ipaAchieved: decStr(cumulativeUpTo(buckets.ipaAchieved, cutoffInclusive)),
    ipcCertified: decStr(cumulativeUpTo(buckets.ipcCertified, cutoffInclusive)),
    invoicedExVat: decStr(cumulativeUpTo(buckets.invoicedExVat, cutoffInclusive)),
    collected: decStr(cumulativeUpTo(buckets.collected, cutoffInclusive)),
  };

  // ── Up-to-prior-month (through reportingMonth − 1) ──────────────
  const priorCutoff = addMonths(reportingMonth, -1);
  const upToPriorMonth: PriorMonthTotals = {
    ipaForecast: decStr(cumulativeUpTo(buckets.ipaForecast, priorCutoff)),
    ipaAchieved: decStr(cumulativeUpTo(buckets.ipaAchieved, priorCutoff)),
    ipcCertified: decStr(cumulativeUpTo(buckets.ipcCertified, priorCutoff)),
    invoicedExVat: decStr(cumulativeUpTo(buckets.invoicedExVat, priorCutoff)),
    collected: decStr(cumulativeUpTo(buckets.collected, priorCutoff)),
  };

  // ── Contract / variation block ───────────────────────────────────
  const contractAmount = project.contractValue
    ? decStr(toDecimal(project.contractValue))
    : null;
  const proposedVariation = decStr(toDecimal(varSubmitted._sum.costImpact));
  const approvedVariation = decStr(toDecimal(variationDeltaAgg._sum.approvedCostImpact));
  const anticipatedContractAmount =
    project.contractValue
      ? decStr(
          toDecimal(project.contractValue).plus(
            toDecimal(variationDeltaAgg._sum.approvedCostImpact),
          ),
        )
      : null;

  return {
    projectId,
    projectCode: project.code,
    projectName: project.name,
    currency: project.currencyCode,
    contractAmount,
    proposedVariation,
    approvedVariation,
    anticipatedContractAmount,
    cumulative,
    upToPriorMonth,
    months: monthBlocks,
  };
}

// ---------------------------------------------------------------------------
// Portfolio aggregation — per currency
// ---------------------------------------------------------------------------

function sumInto(target: Map<string, Prisma.Decimal>, key: string, val: string) {
  target.set(key, (target.get(key) ?? new Prisma.Decimal(0)).plus(val));
}

function emptyTotals(currency: string, months: string[]): CurrencyTotals {
  return {
    currency,
    projectCount: 0,
    contractAmount: zeroStr(),
    proposedVariation: zeroStr(),
    approvedVariation: zeroStr(),
    anticipatedContractAmount: zeroStr(),
    cumulative: {
      ipaForecast: zeroStr(),
      ipaAchieved: zeroStr(),
      ipcCertified: zeroStr(),
      invoicedExVat: zeroStr(),
      collected: zeroStr(),
    },
    months: months.map((key) => ({
      yearMonth: key,
      label: monthLabel(key),
      ipa: { forecast: null, achieved: zeroStr(), diff: null, diffPct: null },
      ipc: { achieved: zeroStr() },
      invoicedExVat: { achieved: zeroStr() },
      invoicedGross: { achieved: zeroStr() },
      collected: { achieved: zeroStr() },
    })),
  };
}

function rollUpCurrency(rows: ProjectRow[], currency: string, months: string[]): CurrencyTotals {
  const totals = emptyTotals(currency, months);
  totals.projectCount = rows.length;

  // Scalars
  const scalars = new Map<string, Prisma.Decimal>();
  for (const r of rows) {
    if (r.contractAmount) sumInto(scalars, 'contractAmount', r.contractAmount);
    sumInto(scalars, 'proposedVariation', r.proposedVariation);
    sumInto(scalars, 'approvedVariation', r.approvedVariation);
    if (r.anticipatedContractAmount) {
      sumInto(scalars, 'anticipatedContractAmount', r.anticipatedContractAmount);
    }
    sumInto(scalars, 'cum.ipaForecast', r.cumulative.ipaForecast);
    sumInto(scalars, 'cum.ipaAchieved', r.cumulative.ipaAchieved);
    sumInto(scalars, 'cum.ipcCertified', r.cumulative.ipcCertified);
    sumInto(scalars, 'cum.invoicedExVat', r.cumulative.invoicedExVat);
    sumInto(scalars, 'cum.collected', r.cumulative.collected);
  }
  const s = (k: string) => decStr(scalars.get(k) ?? new Prisma.Decimal(0));
  totals.contractAmount = s('contractAmount');
  totals.proposedVariation = s('proposedVariation');
  totals.approvedVariation = s('approvedVariation');
  totals.anticipatedContractAmount = s('anticipatedContractAmount');
  totals.cumulative.ipaForecast = s('cum.ipaForecast');
  totals.cumulative.ipaAchieved = s('cum.ipaAchieved');
  totals.cumulative.ipcCertified = s('cum.ipcCertified');
  totals.cumulative.invoicedExVat = s('cum.invoicedExVat');
  totals.cumulative.collected = s('cum.collected');

  // Per-month aggregation. Forecast/achieved/diff for IPA; actuals for others.
  for (let i = 0; i < months.length; i++) {
    let ipaFc: Prisma.Decimal | null = null;
    let ipaAch = new Prisma.Decimal(0);
    let ipc = new Prisma.Decimal(0);
    let invExVat = new Prisma.Decimal(0);
    let invGross = new Prisma.Decimal(0);
    let col = new Prisma.Decimal(0);
    for (const r of rows) {
      const mb = r.months[i]!;
      if (mb.ipa.forecast !== null) {
        ipaFc = (ipaFc ?? new Prisma.Decimal(0)).plus(mb.ipa.forecast);
      }
      ipaAch = ipaAch.plus(mb.ipa.achieved);
      ipc = ipc.plus(mb.ipc.achieved);
      invExVat = invExVat.plus(mb.invoicedExVat.achieved);
      invGross = invGross.plus(mb.invoicedGross.achieved);
      col = col.plus(mb.collected.achieved);
    }
    totals.months[i] = {
      yearMonth: months[i]!,
      label: monthLabel(months[i]!),
      ipa: {
        forecast: ipaFc ? decStr(ipaFc) : null,
        achieved: decStr(ipaAch),
        diff: ipaFc ? decStr(ipaAch.minus(ipaFc)) : null,
        diffPct: pctOrNull(ipaAch, ipaFc),
      },
      ipc: { achieved: decStr(ipc) },
      invoicedExVat: { achieved: decStr(invExVat) },
      invoicedGross: { achieved: decStr(invGross) },
      collected: { achieved: decStr(col) },
    };
  }

  return totals;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function getMonthlyCostSheet(
  options: MonthlyCostSheetOptions = {},
): Promise<MonthlyCostSheet> {
  const now = options.now ?? new Date();
  const reportMonth = options.reportMonth ?? monthKey(now);
  const toMonth = options.toMonth ?? reportMonth;
  // Default: trailing 12 months INCLUDING reportingMonth → from = to − 11
  const fromMonth = options.fromMonth ?? addMonths(toMonth, -11);

  // Normalise: caller may pass YYYY-MM-DD
  const from = monthKeyFromString(fromMonth);
  const to = monthKeyFromString(toMonth);
  const rep = monthKeyFromString(reportMonth);
  if (from > to) {
    throw new Error(`fromMonth (${from}) is after toMonth (${to}).`);
  }
  const months = buildMonthRange(from, to);

  // Load projects. The route is responsible for permission-filtering.
  const projects = await prisma.project.findMany({
    ...(options.projectIds ? { where: { id: { in: options.projectIds } } } : {}),
    select: {
      id: true,
      code: true,
      name: true,
      currencyCode: true,
      contractValue: true,
    },
    orderBy: { code: 'asc' },
  });

  const rows: ProjectRow[] = [];
  for (const p of projects) {
    rows.push(
      await computeProjectRow(
        {
          id: p.id,
          code: p.code,
          name: p.name,
          currencyCode: p.currencyCode,
          contractValue: p.contractValue,
        },
        months,
        rep,
      ),
    );
  }

  // Currency groups
  const byCurrency = new Map<string, ProjectRow[]>();
  for (const r of rows) {
    let bucket = byCurrency.get(r.currency);
    if (!bucket) {
      bucket = [];
      byCurrency.set(r.currency, bucket);
    }
    bucket.push(r);
  }
  const currencyGroups: Record<string, CurrencyTotals> = {};
  for (const [code, projRows] of byCurrency) {
    currencyGroups[code] = rollUpCurrency(projRows, code, months);
  }

  // Warnings + mixed-currency guard
  const warnings: string[] = [];
  const mixedCurrencies = byCurrency.size > 1;
  if (mixedCurrencies) {
    const codes = Array.from(byCurrency.keys()).sort();
    warnings.push(
      `Portfolio spans ${byCurrency.size} currencies (${codes.join(', ')}). Per-currency sub-totals are shown; a single rolled-up total is intentionally suppressed.`,
    );
  }
  const noForecast = rows.filter((r) => r.cumulative.ipaForecast === zeroStr());
  if (noForecast.length > 0 && rows.length > 0) {
    warnings.push(
      `${noForecast.length} of ${rows.length} project(s) have no IPA Forecast configured — their forecast/variance cells read blank or zero.`,
    );
  }

  return {
    generatedAt: now.toISOString(),
    reportMonth: rep,
    fromMonth: from,
    toMonth: to,
    months,
    monthLabels: months.map(monthLabel),
    projects: rows,
    currencyGroups,
    warnings,
    mixedCurrencies,
  };
}

// Exported for tests that want to verify month-math independently
export const __testing = {
  monthKey,
  buildMonthRange,
  addMonths,
  monthLabel,
  monthStartDate,
  monthEndDate,
};
