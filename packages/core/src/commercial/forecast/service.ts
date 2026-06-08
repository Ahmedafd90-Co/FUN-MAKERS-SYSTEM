/**
 * IPA Forecast service — per-period commercial plan of record.
 *
 * PIC-99 PR-1 (M1) — first sellable model on the completed MT-spine.
 * Source recut from PR #15 (067e3ea) and adapted to the spine:
 *   - IpaForecast is born org-scoped (orgId @default singleton; compound
 *     @@unique([orgId, projectId, periodNumber]) per SR-Multi-Tenancy).
 *   - By-id reads bind via assertProjectScope (CAT4 attack surface, PIC-71 +
 *     PIC-97 hotfix pattern).
 *   - Soft-delete via deletedAt + deletedBy (PD ruling 4a70d247) — active
 *     reads filter deletedAt:null; deleteForecast soft-deletes; upsertForecast
 *     restores soft-deleted rows by clearing deletedAt.
 *   - Audit emit on create / update / restore / delete (beforeJson + afterJson).
 *
 * Anchored to Ipa.periodNumber grain. One forecast row per
 * (orgId, projectId, periodNumber). Compound-key lookups use findFirst
 * (returns the unique row by transitive scope — Project.id is globally unique,
 * so projectId → orgId is 1:1; only one row can match a (projectId, periodNumber)
 * pair). Per the user's "@@unique([orgId, projectId, periodNumber]) NOT the old
 * global [projectId, periodNumber]" instruction, Prisma's `projectId_periodNumber`
 * composite-key shortcut is intentionally NOT available.
 *
 * "Actual IPA" reuses total_claimed: SUM(ipa.netClaimed) where status IN
 * IPA_APPROVED_PLUS. No competing definition.
 *
 * Forecast is planning data — no PostingEvent emitted for CRUD. Posting ledger
 * is untouched. PR-2 cost-sheet aggregation will skip soft-deleted rows.
 */

import { prisma, Prisma } from '@fmksa/db';
import type { IpaStatus } from '@fmksa/db';
import { auditService } from '../../audit/service';
import { assertProjectScope } from '../../scope-binding';
import { resolveProjectOrgId } from '../../org-resolution';
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
// Reads
// ---------------------------------------------------------------------------

export async function listForecasts(projectId: string) {
  return prisma.ipaForecast.findMany({
    where: { projectId, deletedAt: null },
    orderBy: { periodNumber: 'asc' },
  });
}

/**
 * By-id read with scope assertion — the CAT4 attack surface (PIC-99 PR-1 merge bar).
 *
 * Returns null when:
 *   - the id doesn't exist
 *   - the forecast is soft-deleted (NOT_FOUND-shaped per F3 idiom — no soft-delete disclosure)
 *
 * Throws ScopeMismatchError when the forecast exists but belongs to a different
 * project (the router maps that to NOT_FOUND too). Response is identical regardless
 * of whether the id is invalid, soft-deleted, or cross-tenant — no existence
 * disclosure (F3 idiom: NOT_FOUND-shaped denial).
 */
export async function getForecast(id: string, expectedProjectId: string) {
  const forecast = await prisma.ipaForecast.findUnique({ where: { id } });
  if (!forecast) return null;
  assertProjectScope(forecast, expectedProjectId, 'IpaForecast', id);
  if (forecast.deletedAt !== null) return null;
  return forecast;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function upsertForecast(input: UpsertForecastInput, actorUserId: string) {
  // Composite-key lookup via findFirst — naturally projectId-scoped
  // (projectId from projectProcedure-validated ctx). Includes soft-deleted
  // rows so upsert can RESTORE them by clearing deletedAt (per soft-delete
  // semantics — the compound unique still occupies the (orgId, projectId,
  // periodNumber) slot even when soft-deleted).
  const existing = await prisma.ipaForecast.findFirst({
    where: { projectId: input.projectId, periodNumber: input.periodNumber },
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
    const wasSoftDeleted = existing.deletedAt !== null;
    const updated = await prisma.ipaForecast.update({
      where: { id: existing.id },
      data: {
        ...data,
        updatedBy: actorUserId,
        // Restore: clear soft-delete state if previously deleted
        deletedAt: null,
        deletedBy: null,
      },
    });
    await auditService.log({
      actorUserId,
      actorSource: 'user',
      action: wasSoftDeleted ? 'ipa_forecast.restore' : 'ipa_forecast.update',
      resourceType: 'ipa_forecast',
      resourceId: updated.id,
      projectId: input.projectId,
      beforeJson: existing as any,
      afterJson: updated as any,
    });
    return updated;
  }

  const orgId = await resolveProjectOrgId(input.projectId);
  const created = await prisma.ipaForecast.create({
    data: { ...data, orgId, createdBy: actorUserId },
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
  // Composite-key lookup — naturally projectId-scoped. Only operate on
  // non-soft-deleted rows; soft-deleted is treated as "not found" for delete
  // (idempotent — deleting an already-soft-deleted row is a no-op semantically).
  const existing = await prisma.ipaForecast.findFirst({
    where: { projectId, periodNumber, deletedAt: null },
  });
  if (!existing) {
    throw new Error(`IpaForecast not found for project ${projectId} period ${periodNumber}.`);
  }
  // SOFT delete (PD ruling 4a70d247): set deletedAt + deletedBy, preserve row
  // for audit history + PR-2 cost-sheet aggregation skip.
  const deleted = await prisma.ipaForecast.update({
    where: { id: existing.id },
    data: { deletedAt: new Date(), deletedBy: actorUserId },
  });
  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'ipa_forecast.delete',
    resourceType: 'ipa_forecast',
    resourceId: existing.id,
    projectId,
    beforeJson: existing as any,
    afterJson: deleted as any,
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
 * - To-date forecast = active forecasts (deletedAt:null) with periodStart <= now.
 * - "This month" = active forecast whose periodStart falls in the calendar
 *   month of `now`. Returns nulls if no forecast covers the current month.
 *
 * Per-period rows pair each active forecast with the matching Ipa by periodNumber
 * (1:1 join — unique by schema constraint). actualAmount is non-zero only
 * when the paired IPA is in an approved+ status.
 *
 * The Project by-id read is SAFE per scope-binding-guard: id IS projectId
 * (projectProcedure-validated), assert would be tautology.
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
      where: { projectId, deletedAt: null },
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

    if (f.periodStart >= monthStart && f.periodStart < monthEnd) {
      thisMonthPeriodNumber = f.periodNumber;
      thisMonthPeriodStart = f.periodStart;
      thisMonthForecast = fAmount;
    }

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

  const actualAgg = await prisma.ipa.aggregate({
    where: { projectId, status: { in: APPROVED_PLUS as IpaStatus[] } },
    _sum: { netClaimed: true },
  });
  const totalActual = toDecimal(actualAgg._sum.netClaimed);

  const toDateVariance = totalActual.minus(toDateForecast);

  // Attainment: explicit zero-forecast policy — returns null, not NaN/Infinity.
  const toDateAttainmentPercent = toDateForecast.isZero()
    ? null
    : decStr(totalActual.dividedBy(toDateForecast).times(100));

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
