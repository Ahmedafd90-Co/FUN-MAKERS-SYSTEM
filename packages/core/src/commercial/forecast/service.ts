/**
 * IPA Forecast service — per-period commercial plan of record.
 *
 * Anchored to Ipa.periodNumber grain. One forecast row per (projectId,
 * periodNumber) — unique by constraint at the schema level.
 *
 * "Actual IPA" reuses the existing `total_claimed` definition:
 *   SUM(ipa.netClaimed) where status IN IPA_APPROVED_PLUS.
 * Do not introduce a competing definition here.
 *
 * Forecast is planning data — no PostingEvent is emitted for forecast
 * create/update/delete. The posting ledger is untouched.
 */

import { prisma, Prisma } from '@fmksa/db';
import type { IpaStatus } from '@fmksa/db';
import { auditService } from '../../audit/service';
import { IPA_APPROVED_PLUS } from '../dashboard/kpi-definitions';

// ---------------------------------------------------------------------------
// Types — public API
// ---------------------------------------------------------------------------

export interface UpsertForecastInput {
  projectId: string;
  periodNumber: number;
  periodStart: Date;
  forecastAmount: Prisma.Decimal | number | string;
  currency: string;
  notes?: string | null;
}

export interface ForecastPeriodRow {
  periodNumber: number;
  periodStart: string;
  forecastAmount: string;
  actualAmount: string;
  variance: string;
  ipaId: string | null;
  ipaStatus: string | null;
  ipaIsApproved: boolean;
}

export interface ForecastVsActual {
  projectId: string;
  currency: string;
  computedAt: string;
  totalForecast: string;
  totalActual: string;
  toDateForecast: string;
  toDateVariance: string;
  toDateAttainmentPercent: string | null;
  thisMonth: {
    periodNumber: number | null;
    periodStart: string | null;
    forecastAmount: string | null;
    actualAmount: string | null;
  };
  periods: ForecastPeriodRow[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDecimal(val: Prisma.Decimal | number | string | null | undefined): Prisma.Decimal {
  if (val == null) return new Prisma.Decimal(0);
  if (val instanceof Prisma.Decimal) return val;
  return new Prisma.Decimal(val);
}

function decStr(val: Prisma.Decimal): string {
  return val.toFixed(2);
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function endOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

/** Statuses whose netClaimed counts toward "actual IPA" — same set as total_claimed. */
const APPROVED_PLUS: readonly IpaStatus[] = [...IPA_APPROVED_PLUS] as IpaStatus[];

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function listForecasts(projectId: string) {
  return prisma.ipaForecast.findMany({
    where: { projectId },
    orderBy: { periodNumber: 'asc' },
  });
}

export async function upsertForecast(input: UpsertForecastInput, actorUserId: string) {
  const existing = await prisma.ipaForecast.findUnique({
    where: { projectId_periodNumber: { projectId: input.projectId, periodNumber: input.periodNumber } },
  });

  const data = {
    projectId: input.projectId,
    periodNumber: input.periodNumber,
    periodStart: input.periodStart,
    forecastAmount: toDecimal(input.forecastAmount),
    currency: input.currency,
    notes: input.notes ?? null,
  };

  if (existing) {
    const updated = await prisma.ipaForecast.update({
      where: { id: existing.id },
      data: { ...data, updatedBy: actorUserId },
    });
    await auditService.log({
      actorUserId,
      actorSource: 'user',
      action: 'ipa_forecast.update',
      resourceType: 'ipa_forecast',
      resourceId: updated.id,
      projectId: input.projectId,
      beforeJson: existing as any,
      afterJson: updated as any,
    });
    return updated;
  }

  const created = await prisma.ipaForecast.create({
    data: { ...data, createdBy: actorUserId },
  });
  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'ipa_forecast.create',
    resourceType: 'ipa_forecast',
    resourceId: created.id,
    projectId: input.projectId,
    beforeJson: null,
    afterJson: created as any,
  });
  return created;
}

export async function deleteForecast(projectId: string, periodNumber: number, actorUserId: string) {
  const existing = await prisma.ipaForecast.findUnique({
    where: { projectId_periodNumber: { projectId, periodNumber } },
  });
  if (!existing) {
    throw new Error(`IpaForecast not found for project ${projectId} period ${periodNumber}.`);
  }
  await prisma.ipaForecast.delete({ where: { id: existing.id } });
  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'ipa_forecast.delete',
    resourceType: 'ipa_forecast',
    resourceId: existing.id,
    projectId,
    beforeJson: existing as any,
    afterJson: null,
  });
}

// ---------------------------------------------------------------------------
// Aggregates — forecast vs actual
// ---------------------------------------------------------------------------

/**
 * Compute forecast-vs-actual rollup for a single project.
 *
 * - Actual IPA reuses the existing `total_claimed` rule
 *   (SUM(netClaimed) where status IN IPA_APPROVED_PLUS).
 * - To-date forecast = forecasts with periodStart <= now.
 * - "This month" = forecast whose periodStart falls in the calendar month
 *   of `now`. Returns nulls if no forecast covers the current month.
 *
 * Per-period rows pair each forecast with the matching Ipa by periodNumber
 * (1:1 join — unique by schema constraint). actualAmount is non-zero only
 * when the paired IPA is in an approved+ status.
 */
export async function getForecastVsActual(
  projectId: string,
  now: Date = new Date(),
): Promise<ForecastVsActual> {
  const [project, forecasts, ipas] = await Promise.all([
    prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { currencyCode: true },
    }),
    prisma.ipaForecast.findMany({
      where: { projectId },
      orderBy: { periodNumber: 'asc' },
    }),
    prisma.ipa.findMany({
      where: { projectId },
      select: { id: true, periodNumber: true, status: true, netClaimed: true },
      orderBy: { periodNumber: 'asc' },
    }),
  ]);

  // Build a periodNumber -> ipa map for O(1) pairing
  const ipaByPeriod = new Map<number, (typeof ipas)[number]>();
  for (const ipa of ipas) ipaByPeriod.set(ipa.periodNumber, ipa);

  // Totals
  let totalForecast = new Prisma.Decimal(0);
  let toDateForecast = new Prisma.Decimal(0);
  let thisMonthPeriodNumber: number | null = null;
  let thisMonthPeriodStart: Date | null = null;
  let thisMonthForecast: Prisma.Decimal | null = null;

  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const periods: ForecastPeriodRow[] = [];

  for (const f of forecasts) {
    const fAmount = toDecimal(f.forecastAmount);
    totalForecast = totalForecast.plus(fAmount);

    if (f.periodStart <= now) {
      toDateForecast = toDateForecast.plus(fAmount);
    }

    // "This month" — periodStart falls inside the calendar month of `now`
    if (f.periodStart >= monthStart && f.periodStart < monthEnd) {
      thisMonthPeriodNumber = f.periodNumber;
      thisMonthPeriodStart = f.periodStart;
      thisMonthForecast = fAmount;
    }

    // Per-period pairing
    const ipa = ipaByPeriod.get(f.periodNumber);
    const ipaApproved = ipa != null && APPROVED_PLUS.includes(ipa.status);
    const actual = ipaApproved && ipa ? toDecimal(ipa.netClaimed) : new Prisma.Decimal(0);
    periods.push({
      periodNumber: f.periodNumber,
      periodStart: f.periodStart.toISOString(),
      forecastAmount: decStr(fAmount),
      actualAmount: decStr(actual),
      variance: decStr(actual.minus(fAmount)),
      ipaId: ipa?.id ?? null,
      ipaStatus: ipa?.status ?? null,
      ipaIsApproved: ipaApproved,
    });
  }

  // Actual = total_claimed (reuse the same rule)
  const actualAgg = await prisma.ipa.aggregate({
    where: { projectId, status: { in: APPROVED_PLUS as IpaStatus[] } },
    _sum: { netClaimed: true },
  });
  const totalActual = toDecimal(actualAgg._sum.netClaimed);

  // Variance (to-date): actual to-date vs forecast to-date.
  // Per memory: keep this honest — actual is cumulative by nature, forecast
  // is gated by periodStart <= now. Interpret variance at the to-date grain.
  const toDateVariance = totalActual.minus(toDateForecast);

  // Attainment: explicit zero-forecast policy — returns null, not NaN/Infinity.
  // The dashboard will render "Not set" for null attainment.
  const toDateAttainmentPercent = toDateForecast.isZero()
    ? null
    : decStr(totalActual.dividedBy(toDateForecast).times(100));

  // This-month actual: look up the IPA for the month's period, gate on status
  let thisMonthActual: string | null = null;
  if (thisMonthPeriodNumber != null) {
    const ipa = ipaByPeriod.get(thisMonthPeriodNumber);
    const approved = ipa != null && APPROVED_PLUS.includes(ipa.status);
    thisMonthActual = approved && ipa ? decStr(toDecimal(ipa.netClaimed)) : '0.00';
  }

  return {
    projectId,
    currency: project.currencyCode,
    computedAt: now.toISOString(),
    totalForecast: decStr(totalForecast),
    totalActual: decStr(totalActual),
    toDateForecast: decStr(toDateForecast),
    toDateVariance: decStr(toDateVariance),
    toDateAttainmentPercent,
    thisMonth: {
      periodNumber: thisMonthPeriodNumber,
      periodStart: thisMonthPeriodStart ? thisMonthPeriodStart.toISOString() : null,
      forecastAmount: thisMonthForecast ? decStr(thisMonthForecast) : null,
      actualAmount: thisMonthActual,
    },
    periods,
  };
}
