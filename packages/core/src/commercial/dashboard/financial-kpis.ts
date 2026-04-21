/**
 * Financial KPI service — computes all supportable KPIs from the frozen
 * KPI dictionary.
 *
 * This service CONSUMES kpi-definitions.ts as the single source of truth.
 * It does not redeclare status filters, labels, or drilldown targets.
 *
 * All decimal arithmetic uses Prisma Decimal (Decimal.js) — no JS float math.
 *
 * Blocked/partially-supported KPIs are returned with value: null and their
 * blockedReason from the dictionary, so consumers never see misleading data.
 */

import { prisma, Prisma } from '@fmksa/db';
import type { IpaStatus, IpcStatus, TaxInvoiceStatus, VariationStatus, PurchaseOrderStatus, SupplierInvoiceStatus, ExpenseStatus } from '@fmksa/db';
import {
  KPI_DEFINITIONS,
  getKpiDefinition,
  IPA_APPROVED_PLUS,
  IPC_SIGNED_PLUS,
  TI_ISSUED_PLUS,
  TI_OPEN_STATUSES,
  VAR_SUBMITTED_PLUS,
  VAR_APPROVED_PLUS,
  type KpiDefinition,
  type KpiDrilldown,
} from './kpi-definitions';

// ---------------------------------------------------------------------------
// Types — service response
// ---------------------------------------------------------------------------

export interface KpiValue {
  /** KPI id from the dictionary. */
  id: string;
  /** Human-readable name from the dictionary. */
  name: string;
  /** Computed value as a decimal string, or null if not computable. */
  value: string | null;
  /** Support status from the dictionary. */
  supportStatus: KpiDefinition['supportStatus'];
  /** Reason the KPI cannot be computed (from dictionary). */
  blockedReason?: string;
  /** Nature of the value (from dictionary). */
  nature: KpiDefinition['nature'];
  /** Temporality (from dictionary). */
  temporality: KpiDefinition['temporality'];
  /** Drilldown metadata (from dictionary). Null for blocked KPIs. */
  drilldown: KpiDrilldown | KpiDrilldown[] | null;
}

export interface FinancialKpisResult {
  projectId: string;
  currency: string;
  computedAt: string;
  kpis: Record<string, KpiValue>;
}

// ---------------------------------------------------------------------------
// Helpers — decimal-safe via Prisma Decimal
// ---------------------------------------------------------------------------

function toDecimal(val: Prisma.Decimal | number | string | null | undefined): Prisma.Decimal {
  if (val == null) return new Prisma.Decimal(0);
  if (val instanceof Prisma.Decimal) return val;
  return new Prisma.Decimal(val);
}

function decStr(val: Prisma.Decimal): string {
  return val.toFixed(2);
}

/**
 * Build a KpiValue from a definition and a computed value.
 * For non-supported KPIs, value is forced to null.
 */
function buildKpiValue(def: KpiDefinition, computedValue: Prisma.Decimal | null): KpiValue {
  const isSupported = def.supportStatus === 'supported';
  return {
    id: def.id,
    name: def.name,
    value: isSupported && computedValue !== null ? decStr(computedValue) : null,
    supportStatus: def.supportStatus,
    ...(def.blockedReason ? { blockedReason: def.blockedReason } : {}),
    nature: def.nature,
    temporality: def.temporality,
    drilldown: isSupported ? def.drilldown : null,
  };
}

// ---------------------------------------------------------------------------
// Main KPI computation
// ---------------------------------------------------------------------------

/**
 * @param projectId
 * @param now injectable "now" — defaults to new Date(). Tests supply a fixed
 *            instant so forecast "this month" and to-date calculations are
 *            deterministic.
 */
export async function getFinancialKpis(
  projectId: string,
  now: Date = new Date(),
): Promise<FinancialKpisResult> {
  // Calendar-month bounds for "forecast_this_month" KPI
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  // -----------------------------------------------------------------------
  // Parallel database queries — one round-trip via Promise.all
  // -----------------------------------------------------------------------
  const [
    project,
    ipaClaimed,
    ipcCertified,
    tiInvoiced,
    totalCollected,
    openInvoiceTotal,
    openInvoiceCollections,
    overdueInvoiceTotal,
    overdueInvoiceCollections,
    varSubmitted,
    varApproved,
    variationDeltaAgg,
    poCommitted,
    siApproved,
    expApproved,
    forecastTotalAgg,
    forecastToDateAgg,
    forecastThisMonth,
  ] = await Promise.all([
    // Project metadata (currency + financial fields)
    prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: {
        currencyCode: true,
        contractValue: true,
      },
    }),

    // KPI: total_claimed
    prisma.ipa.aggregate({
      where: { projectId, status: { in: [...IPA_APPROVED_PLUS] as IpaStatus[] } },
      _sum: { netClaimed: true },
    }),

    // KPI: total_certified
    prisma.ipc.aggregate({
      where: { projectId, status: { in: [...IPC_SIGNED_PLUS] as IpcStatus[] } },
      _sum: { netCertified: true },
    }),

    // KPI: total_invoiced
    prisma.taxInvoice.aggregate({
      where: { projectId, status: { in: [...TI_ISSUED_PLUS] as TaxInvoiceStatus[] } },
      _sum: { totalAmount: true },
    }),

    // KPI: total_collected (collection amounts for issued+ invoices)
    prisma.invoiceCollection.aggregate({
      where: { taxInvoice: { projectId, status: { in: [...TI_ISSUED_PLUS] as TaxInvoiceStatus[] } } },
      _sum: { amount: true },
    }),

    // KPI: open_receivable — invoice totals for open (non-collected) invoices
    prisma.taxInvoice.aggregate({
      where: { projectId, status: { in: [...TI_OPEN_STATUSES] as TaxInvoiceStatus[] } },
      _sum: { totalAmount: true },
    }),

    // KPI: open_receivable — collection totals for those same open invoices
    prisma.invoiceCollection.aggregate({
      where: { taxInvoice: { projectId, status: { in: [...TI_OPEN_STATUSES] as TaxInvoiceStatus[] } } },
      _sum: { amount: true },
    }),

    // KPI: overdue_receivable — invoice totals for overdue open invoices
    prisma.taxInvoice.aggregate({
      where: {
        projectId,
        status: { in: [...TI_OPEN_STATUSES] as TaxInvoiceStatus[] },
        dueDate: { lt: new Date() },
      },
      _sum: { totalAmount: true },
    }),

    // KPI: overdue_receivable — collections for those same overdue invoices
    prisma.invoiceCollection.aggregate({
      where: {
        taxInvoice: {
          projectId,
          status: { in: [...TI_OPEN_STATUSES] as TaxInvoiceStatus[] },
          dueDate: { lt: new Date() },
        },
      },
      _sum: { amount: true },
    }),

    // KPI: submitted_variation_impact (explicit allow-list, NOT status != 'draft')
    prisma.variation.aggregate({
      where: { projectId, status: { in: [...VAR_SUBMITTED_PLUS] as VariationStatus[] } },
      _sum: { costImpact: true },
    }),

    // KPI: approved_variation_impact
    prisma.variation.aggregate({
      where: {
        projectId,
        status: { in: [...VAR_APPROVED_PLUS] as VariationStatus[] },
        approvedCostImpact: { not: null },
      },
      _sum: { approvedCostImpact: true },
    }),

    // System-derived revised contract value from approved variations
    // Revised Contract Value = contractValue + SUM(approved variation deltas)
    // VOs: count client_approved and closed with non-null approvedCostImpact
    // COs: count approved_internal, signed, issued, closed with non-null approvedCostImpact
    // This replaces the manual revisedContractValue field on Project.
    prisma.variation.aggregate({
      where: {
        projectId,
        approvedCostImpact: { not: null },
        OR: [
          // VOs: client must have approved
          { subtype: 'vo', status: { in: ['client_approved', 'closed'] } },
          // COs: internal approval sufficient (CO doesn't go to client)
          { subtype: 'change_order', status: { in: ['approved_internal', 'signed', 'issued', 'closed'] } },
        ],
      },
      _sum: { approvedCostImpact: true },
    }),

    // KPI: committed_cost — PO totals in approved+ statuses
    prisma.purchaseOrder.aggregate({
      where: {
        projectId,
        status: { in: ['approved', 'issued', 'partially_delivered', 'delivered', 'closed'] as PurchaseOrderStatus[] },
      },
      _sum: { totalAmount: true },
    }),

    // KPI: actual_cost — supplier invoice totals in approved+ statuses
    prisma.supplierInvoice.aggregate({
      where: {
        projectId,
        status: { in: ['approved', 'paid', 'closed'] as SupplierInvoiceStatus[] },
      },
      _sum: { totalAmount: true },
    }),

    // KPI: actual_cost — expense totals in approved+ statuses
    prisma.expense.aggregate({
      where: {
        projectId,
        status: { in: ['approved', 'paid', 'closed'] as ExpenseStatus[] },
      },
      _sum: { amount: true },
    }),

    // KPI: forecast_total — all forecast rows for the project
    prisma.ipaForecast.aggregate({
      where: { projectId },
      _sum: { forecastAmount: true },
    }),

    // KPI: ipa_forecast_variance / ipa_forecast_attainment
    // To-date forecast = forecasts whose periodStart has already begun.
    prisma.ipaForecast.aggregate({
      where: { projectId, periodStart: { lte: now } },
      _sum: { forecastAmount: true },
    }),

    // KPI: forecast_this_month — forecast whose periodStart falls in current month
    prisma.ipaForecast.findFirst({
      where: {
        projectId,
        periodStart: { gte: monthStart, lt: monthEnd },
      },
      select: { forecastAmount: true },
    }),
  ]);

  // -----------------------------------------------------------------------
  // Compute values — all arithmetic via Prisma.Decimal
  // -----------------------------------------------------------------------

  const claimed = toDecimal(ipaClaimed._sum.netClaimed);
  const certified = toDecimal(ipcCertified._sum.netCertified);
  const invoiced = toDecimal(tiInvoiced._sum.totalAmount);
  const collected = toDecimal(totalCollected._sum.amount);

  // Open Receivable: driven by amount math, not status labels
  const openInvTotal = toDecimal(openInvoiceTotal._sum.totalAmount);
  const openInvCollected = toDecimal(openInvoiceCollections._sum.amount);
  const openReceivable = openInvTotal.minus(openInvCollected);

  // Overdue Receivable: same amount-based math, date-filtered
  const overdueInvTotal = toDecimal(overdueInvoiceTotal._sum.totalAmount);
  const overdueInvCollected = toDecimal(overdueInvoiceCollections._sum.amount);
  const overdueReceivable = overdueInvTotal.minus(overdueInvCollected);

  // Collection Rate: explicit zero-invoiced policy — returns 0, not NaN/Infinity
  let collectionRate: Prisma.Decimal;
  if (invoiced.isZero()) {
    // POLICY: When no invoices exist, collection rate is 0%.
    // This is an explicit design decision, not an accidental divide-by-zero fallback.
    collectionRate = new Prisma.Decimal(0);
  } else {
    collectionRate = collected.dividedBy(invoiced).times(100);
  }

  // Claimed vs Certified Gap
  const claimedCertifiedGap = claimed.minus(certified);

  // Budget / Revised Budget
  const budget = project.contractValue ? toDecimal(project.contractValue) : null;
  // Revised Contract Value = contractValue + SUM(approved variation deltas)
  // System-derived: no manual revisedContractValue field needed.
  const approvedDeltas = toDecimal(variationDeltaAgg._sum.approvedCostImpact);
  const revisedBudget = budget !== null ? budget.plus(approvedDeltas) : null;

  // Variation KPIs
  const submittedVarImpact = toDecimal(varSubmitted._sum.costImpact);
  const approvedVarImpact = toDecimal(varApproved._sum.approvedCostImpact);

  // Committed Cost: sum of PO totals in approved+ statuses
  const committedCost = toDecimal(poCommitted._sum.totalAmount);

  // Actual Cost: sum of approved supplier invoices + approved expenses
  const siActualTotal = toDecimal(siApproved._sum.totalAmount);
  const expActualTotal = toDecimal(expApproved._sum.amount);
  const actualCost = siActualTotal.plus(expActualTotal);

  // Remaining Budget: revised budget - committed cost
  const remainingBudget = revisedBudget !== null
    ? revisedBudget.minus(committedCost)
    : null;

  // Forecast KPIs
  const forecastTotal = toDecimal(forecastTotalAgg._sum.forecastAmount);
  const forecastToDate = toDecimal(forecastToDateAgg._sum.forecastAmount);
  const forecastThisMonthValue = forecastThisMonth
    ? toDecimal(forecastThisMonth.forecastAmount)
    : null;
  // Variance: actual (total_claimed) - to-date forecast. Honest interpretation:
  // signals timing gaps (current period not yet claimed) as well as real gaps.
  const forecastVariance = claimed.minus(forecastToDate);
  // Attainment: explicit null-on-zero-forecast policy — no NaN/Infinity.
  // UI renders null as "Not set".
  const forecastAttainment: Prisma.Decimal | null = forecastToDate.isZero()
    ? null
    : claimed.dividedBy(forecastToDate).times(100);

  // -----------------------------------------------------------------------
  // Build response — consume KPI definitions as single source of truth
  // -----------------------------------------------------------------------

  const kpis: Record<string, KpiValue> = {};

  for (const def of KPI_DEFINITIONS) {
    let computedValue: Prisma.Decimal | null = null;

    switch (def.id) {
      case 'total_claimed':
        computedValue = claimed;
        break;
      case 'total_certified':
        computedValue = certified;
        break;
      case 'total_invoiced':
        computedValue = invoiced;
        break;
      case 'total_collected':
        computedValue = collected;
        break;
      case 'open_receivable':
        computedValue = openReceivable;
        break;
      case 'overdue_receivable':
        computedValue = overdueReceivable;
        break;
      case 'collection_rate':
        computedValue = collectionRate;
        break;
      case 'budget':
        computedValue = budget;
        break;
      case 'revised_budget':
        computedValue = revisedBudget;
        break;
      case 'submitted_variation_impact':
        computedValue = submittedVarImpact;
        break;
      case 'approved_variation_impact':
        computedValue = approvedVarImpact;
        break;
      case 'claimed_vs_certified_gap':
        computedValue = claimedCertifiedGap;
        break;
      case 'committed_cost':
        computedValue = committedCost;
        break;
      case 'actual_cost':
        computedValue = actualCost;
        break;
      case 'remaining_budget':
        computedValue = remainingBudget;
        break;
      case 'forecast_total':
        computedValue = forecastTotal;
        break;
      case 'forecast_this_month':
        computedValue = forecastThisMonthValue;
        break;
      case 'ipa_forecast_variance':
        computedValue = forecastVariance;
        break;
      case 'ipa_forecast_attainment':
        computedValue = forecastAttainment;
        break;
      default:
        computedValue = null;
        break;
    }

    kpis[def.id] = buildKpiValue(def, computedValue);
  }

  return {
    projectId,
    currency: project.currencyCode,
    computedAt: new Date().toISOString(),
    kpis,
  };
}
