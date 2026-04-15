/**
 * Posting-ledger reconciliation service.
 *
 * Compares three truth layers for each reconcilable KPI:
 *   1. Source-record aggregates (live Prisma queries)
 *   2. Posting-ledger totals (SUM over PostingEvent.payloadJson)
 *   3. Displayed KPI values (from getFinancialKpis)
 *
 * Returns a structured result that an admin can use to verify system integrity.
 *
 * Design constraints:
 *   - This is a VERIFICATION layer, not a replacement for live queries.
 *   - KPIs with no posting coverage are reported as 'not_reconcilable'.
 *   - KPIs with partial coverage are reported as 'partially_reconcilable'.
 *   - Honest about what it can and cannot verify.
 */

import { prisma, Prisma } from '@fmksa/db';
import { getFinancialKpis } from '../commercial/dashboard/financial-kpis';
import {
  KPI_DEFINITIONS,
  type KpiDefinition,
  type KpiPostingCoverage,
} from '../commercial/dashboard/kpi-definitions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReconciliationStatus =
  | 'matched'
  | 'mismatched'
  | 'missing_postings'
  | 'partially_reconcilable'
  | 'not_reconcilable';

export interface KpiReconciliation {
  kpiId: string;
  kpiName: string;
  reconcilable: boolean;
  sourceTotal: string | null;
  ledgerTotal: string | null;
  displayedTotal: string | null;
  status: ReconciliationStatus;
  delta: string | null;
  postingEventTypes: string[];
  postingEventCount: number;
  sourceRecordCount: number;
  sourceQueryBasis: string;
  ledgerQueryBasis: string;
  /**
   * Set when a mismatched KPI has a known legacy-data explanation.
   * Shown to operators in the reconciliation UI so they understand the
   * gap is historical, not a live system defect.
   */
  legacyGapNote: string | null;
  /**
   * Origin-aware split of the ledger total. Present only for KPIs with
   * posting coverage that touches `ipas` (the sole source of imported
   * historical events today). Sums to `ledgerTotal`.
   */
  ledgerOriginSplit: {
    live: string;
    imported: string;
    liveCount: number;
    importedCount: number;
  } | null;
  /** Delta contribution from IPA_ADJUSTMENT events, included in ledgerTotal. */
  adjustmentDelta: string | null;
}

export interface ReconciliationResult {
  projectId: string;
  projectName: string;
  computedAt: string;
  summary: {
    totalKpis: number;
    reconcilable: number;
    matched: number;
    mismatched: number;
    missingPostings: number;
    partiallyReconcilable: number;
    notReconcilable: number;
  };
  kpis: Record<string, KpiReconciliation>;
}

// ---------------------------------------------------------------------------
// Decimal helpers
// ---------------------------------------------------------------------------

function toDecimal(val: Prisma.Decimal | number | string | null | undefined): Prisma.Decimal {
  if (val == null) return new Prisma.Decimal(0);
  if (val instanceof Prisma.Decimal) return val;
  return new Prisma.Decimal(val);
}

function decStr(val: Prisma.Decimal): string {
  return val.toFixed(2);
}

// ---------------------------------------------------------------------------
// Legacy gap detection — count events where expected amount field is missing
// ---------------------------------------------------------------------------

/**
 * Count how many posted events for the given types are missing the expected
 * amount field in their payloadJson. These are legacy events created before
 * the field was added to the posting schema.
 */
async function countEventsWithMissingField(
  projectId: string,
  eventTypes: string[],
  amountField: string,
): Promise<number> {
  if (eventTypes.length === 0) return 0;

  const result = await prisma.$queryRaw<{ cnt: bigint }[]>`
    SELECT COUNT(*) AS cnt
    FROM posting_events
    WHERE project_id = ${projectId}
      AND event_type = ANY(${eventTypes})
      AND status = 'posted'
      AND (payload_json ->> ${amountField} IS NULL)
  `;
  return Number(result[0]?.cnt ?? 0);
}

// ---------------------------------------------------------------------------
// Ledger query — SUM a specific JSON field from posted events
// ---------------------------------------------------------------------------

/**
 * Query the posting_events table to SUM a specific payloadJson field
 * for given event types within a project. Uses raw SQL because Prisma
 * doesn't support JSON field aggregation natively.
 *
 * `origin` scopes the sum to a single provenance bucket when supplied.
 * When omitted the sum crosses both live and imported_historical events.
 */
async function sumLedgerField(
  projectId: string,
  eventTypes: string[],
  amountField: string,
  origin?: 'live' | 'imported_historical',
): Promise<{ total: Prisma.Decimal; count: number }> {
  if (eventTypes.length === 0) {
    return { total: new Prisma.Decimal(0), count: 0 };
  }

  const result = origin
    ? await prisma.$queryRaw<{ total: string | null; cnt: bigint }[]>`
        SELECT
          COALESCE(SUM(CAST(payload_json ->> ${amountField} AS DECIMAL(18,2))), 0) AS total,
          COUNT(*) AS cnt
        FROM posting_events
        WHERE project_id = ${projectId}
          AND event_type = ANY(${eventTypes})
          AND status = 'posted'
          AND origin = ${origin}::posting_origin
      `
    : await prisma.$queryRaw<{ total: string | null; cnt: bigint }[]>`
        SELECT
          COALESCE(SUM(CAST(payload_json ->> ${amountField} AS DECIMAL(18,2))), 0) AS total,
          COUNT(*) AS cnt
        FROM posting_events
        WHERE project_id = ${projectId}
          AND event_type = ANY(${eventTypes})
          AND status = 'posted'
      `;

  const row = result[0];
  return {
    total: new Prisma.Decimal(row?.total ?? '0'),
    count: Number(row?.cnt ?? 0),
  };
}

/**
 * IPA_ADJUSTMENT contributes DELTAS to IPA-derived KPIs. We map the
 * base-event amount field onto the matching adjustment delta field:
 *   netClaimed      → netClaimedDelta
 *   grossAmount     → grossAmountDelta
 *   retentionAmount → retentionAmountDelta
 * Any other amount field has no corresponding adjustment delta today,
 * and returns zero.
 */
function adjustmentDeltaFieldFor(baseField: string): string | null {
  switch (baseField) {
    case 'netClaimed':
      return 'netClaimedDelta';
    case 'grossAmount':
      return 'grossAmountDelta';
    case 'retentionAmount':
      return 'retentionAmountDelta';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Source-record count queries (for reconciliation metadata)
// ---------------------------------------------------------------------------

async function countSourceRecords(
  projectId: string,
  kpiId: string,
): Promise<number> {
  switch (kpiId) {
    case 'total_claimed':
      return prisma.ipa.count({
        where: { projectId, status: { in: ['approved_internal', 'signed', 'issued', 'superseded', 'closed'] } },
      });
    case 'total_certified':
      return prisma.ipc.count({
        where: { projectId, status: { in: ['signed', 'issued', 'superseded', 'closed'] } },
      });
    case 'total_invoiced':
      return prisma.taxInvoice.count({
        where: { projectId, status: { in: ['issued', 'submitted', 'partially_collected', 'collected', 'overdue'] } },
      });
    case 'approved_variation_impact':
      return prisma.variation.count({
        where: { projectId, status: { in: ['approved_internal', 'signed', 'issued', 'client_pending', 'client_approved', 'client_rejected', 'superseded', 'closed'] }, approvedCostImpact: { not: null } },
      });
    case 'committed_cost':
      return prisma.purchaseOrder.count({
        where: { projectId, status: { in: ['approved', 'issued', 'partially_delivered', 'delivered', 'closed'] } },
      });
    case 'actual_cost': {
      const [siCount, expCount] = await Promise.all([
        prisma.supplierInvoice.count({
          where: { projectId, status: { in: ['approved', 'paid', 'closed'] } },
        }),
        prisma.expense.count({
          where: { projectId, status: { in: ['approved', 'paid', 'closed'] } },
        }),
      ]);
      return siCount + expCount;
    }
    case 'revised_budget':
      return prisma.variation.count({
        where: {
          projectId,
          approvedCostImpact: { not: null },
          OR: [
            { subtype: 'vo', status: { in: ['client_approved', 'closed'] } },
            { subtype: 'change_order', status: { in: ['approved_internal', 'signed', 'issued', 'closed'] } },
          ],
        },
      });
    default:
      return 0;
  }
}

// ---------------------------------------------------------------------------
// Ledger total for a single KPI
// ---------------------------------------------------------------------------

interface LedgerTotalResult {
  total: Prisma.Decimal;
  count: number;
  /** Live-origin subtotal. */
  liveTotal: Prisma.Decimal;
  /** Imported-historical-origin subtotal. */
  importedTotal: Prisma.Decimal;
  liveCount: number;
  importedCount: number;
  /** Sum of IPA_ADJUSTMENT deltas (0 for KPIs that aren't IPA-based). */
  adjustmentDelta: Prisma.Decimal;
  /** True if origin split is meaningful for this KPI. */
  originAware: boolean;
}

async function getLedgerTotal(
  projectId: string,
  coverage: KpiPostingCoverage,
  kpiId: string,
): Promise<LedgerTotalResult> {
  // actual_cost: two pairs summed. Not IPA-derived, origin split irrelevant
  // (no historical import path for procurement yet).
  if (kpiId === 'actual_cost') {
    const [si, exp] = await Promise.all([
      sumLedgerField(projectId, ['SUPPLIER_INVOICE_APPROVED'], 'totalAmount'),
      sumLedgerField(projectId, ['EXPENSE_APPROVED'], 'amount'),
    ]);
    const total = si.total.plus(exp.total);
    return {
      total,
      count: si.count + exp.count,
      liveTotal: total,
      importedTotal: new Prisma.Decimal(0),
      liveCount: si.count + exp.count,
      importedCount: 0,
      adjustmentDelta: new Prisma.Decimal(0),
      originAware: false,
    };
  }

  if (kpiId === 'approved_variation_impact' || kpiId === 'revised_budget') {
    const [internal, client] = await Promise.all([
      sumLedgerField(projectId, ['VARIATION_APPROVED_INTERNAL'], 'approvedCostImpact'),
      sumLedgerField(projectId, ['VARIATION_APPROVED_CLIENT'], 'approvedCost'),
    ]);
    const total = internal.total.plus(client.total);
    return {
      total,
      count: internal.count + client.count,
      liveTotal: total,
      importedTotal: new Prisma.Decimal(0),
      liveCount: internal.count + client.count,
      importedCount: 0,
      adjustmentDelta: new Prisma.Decimal(0),
      originAware: false,
    };
  }

  // Default: single event type, single amount field. Origin split applies
  // wherever the event type can be imported historically — today that's
  // IPA_APPROVED only (other event types have no import path).
  const eventType = coverage.eventTypes[0]!;
  const amountField = coverage.amountFields[0]!;
  const isIpaDerived = eventType === 'IPA_APPROVED';

  if (isIpaDerived) {
    // Origin-aware sum + IPA_ADJUSTMENT deltas (for matching field).
    const adjustmentField = adjustmentDeltaFieldFor(amountField);

    const [live, imported, adjDelta] = await Promise.all([
      sumLedgerField(projectId, [eventType], amountField, 'live'),
      sumLedgerField(projectId, [eventType], amountField, 'imported_historical'),
      adjustmentField
        ? sumLedgerField(projectId, ['IPA_ADJUSTMENT'], adjustmentField)
        : Promise.resolve({ total: new Prisma.Decimal(0), count: 0 }),
    ]);

    const total = live.total.plus(imported.total).plus(adjDelta.total);
    return {
      total,
      count: live.count + imported.count + adjDelta.count,
      liveTotal: live.total,
      importedTotal: imported.total,
      liveCount: live.count,
      importedCount: imported.count,
      adjustmentDelta: adjDelta.total,
      originAware: true,
    };
  }

  const base = await sumLedgerField(projectId, [eventType], amountField);
  return {
    total: base.total,
    count: base.count,
    liveTotal: base.total,
    importedTotal: new Prisma.Decimal(0),
    liveCount: base.count,
    importedCount: 0,
    adjustmentDelta: new Prisma.Decimal(0),
    originAware: false,
  };
}

// ---------------------------------------------------------------------------
// Main reconciliation function
// ---------------------------------------------------------------------------

export async function reconcileProjectFinancials(
  projectId: string,
): Promise<ReconciliationResult> {
  // 1. Get the project name
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { name: true },
  });

  // 2. Get displayed KPI values (this runs the same queries the dashboard uses)
  const financialKpis = await getFinancialKpis(projectId);

  // 3. For each KPI definition, compute reconciliation
  const kpis: Record<string, KpiReconciliation> = {};
  const summary = {
    totalKpis: 0,
    reconcilable: 0,
    matched: 0,
    mismatched: 0,
    missingPostings: 0,
    partiallyReconcilable: 0,
    notReconcilable: 0,
  };

  for (const def of KPI_DEFINITIONS) {
    summary.totalKpis++;

    const displayedKpi = financialKpis.kpis[def.id];
    const displayedTotal = displayedKpi?.value ?? null;

    if (!def.postingCoverage) {
      // No posting coverage — not reconcilable
      summary.notReconcilable++;
      kpis[def.id] = {
        kpiId: def.id,
        kpiName: def.name,
        reconcilable: false,
        sourceTotal: displayedTotal,
        ledgerTotal: null,
        displayedTotal,
        status: 'not_reconcilable',
        delta: null,
        postingEventTypes: [],
        postingEventCount: 0,
        sourceRecordCount: 0,
        sourceQueryBasis: def.sourceQueryBasis,
        ledgerQueryBasis: 'No posting event type exists for this KPI',
        legacyGapNote: null,
        ledgerOriginSplit: null,
        adjustmentDelta: null,
      };
      continue;
    }

    // Has posting coverage — run ledger + source count queries
    summary.reconcilable++;

    const [ledger, sourceRecordCount] = await Promise.all([
      getLedgerTotal(projectId, def.postingCoverage, def.id),
      countSourceRecords(projectId, def.id),
    ]);

    const sourceTotal = displayedTotal; // The displayed value IS the source total
    const ledgerTotal = decStr(ledger.total);

    // Determine status
    let status: ReconciliationStatus;
    let delta: string | null = null;

    if (def.postingCoverage.alignment === 'partial') {
      // Partial alignment — always partially_reconcilable
      status = 'partially_reconcilable';
      summary.partiallyReconcilable++;
      if (sourceTotal !== null) {
        delta = decStr(toDecimal(sourceTotal).minus(ledger.total));
      }
    } else if (ledger.count === 0 && sourceRecordCount > 0) {
      // Source has data but ledger has no events
      status = 'missing_postings';
      summary.missingPostings++;
      delta = sourceTotal;
    } else if (sourceTotal !== null && sourceTotal === ledgerTotal) {
      status = 'matched';
      summary.matched++;
      delta = '0.00';
    } else {
      // Both have data but values differ
      status = sourceTotal === null && ledgerTotal === '0.00'
        ? 'matched' // Both effectively zero
        : 'mismatched';
      if (status === 'matched') {
        summary.matched++;
        delta = '0.00';
      } else {
        summary.mismatched++;
        delta = sourceTotal !== null
          ? decStr(toDecimal(sourceTotal).minus(ledger.total))
          : null;
      }
    }

    // Legacy gap detection: when mismatched, check if events are missing
    // expected payload fields (created before field was added to schema).
    let legacyGapNote: string | null = null;
    if (status === 'mismatched' && ledger.count > 0) {
      // Check each event type / amount field pair for missing values
      const checks: Promise<number>[] = [];
      const labels: string[] = [];
      for (let i = 0; i < def.postingCoverage.eventTypes.length; i++) {
        const et = def.postingCoverage.eventTypes[i]!;
        const af = def.postingCoverage.amountFields[i] ?? def.postingCoverage.amountFields[0]!;
        checks.push(countEventsWithMissingField(projectId, [et], af));
        labels.push(`${et}.${af}`);
      }
      const missingCounts = await Promise.all(checks);
      const gaps: string[] = [];
      for (let i = 0; i < missingCounts.length; i++) {
        if (missingCounts[i]! > 0) {
          gaps.push(`${missingCounts[i]} ${labels[i]} event(s) missing payload field`);
        }
      }
      if (gaps.length > 0) {
        legacyGapNote =
          `Legacy data gap: ${gaps.join('; ')}. ` +
          'These events were created before the field was added to the posting schema. ' +
          'They contribute 0 to the ledger total, causing the delta. ' +
          'New events carry this field and will reconcile correctly.';
      }
    }

    kpis[def.id] = {
      kpiId: def.id,
      kpiName: def.name,
      reconcilable: true,
      sourceTotal,
      ledgerTotal,
      displayedTotal,
      status,
      delta,
      postingEventTypes: def.postingCoverage.eventTypes,
      postingEventCount: ledger.count,
      sourceRecordCount,
      sourceQueryBasis: def.sourceQueryBasis,
      ledgerQueryBasis: def.postingCoverage.ledgerQueryBasis,
      legacyGapNote,
      ledgerOriginSplit: ledger.originAware
        ? {
            live: decStr(ledger.liveTotal),
            imported: decStr(ledger.importedTotal),
            liveCount: ledger.liveCount,
            importedCount: ledger.importedCount,
          }
        : null,
      adjustmentDelta: ledger.originAware ? decStr(ledger.adjustmentDelta) : null,
    };
  }

  return {
    projectId,
    projectName: project.name,
    computedAt: new Date().toISOString(),
    summary,
    kpis,
  };
}
