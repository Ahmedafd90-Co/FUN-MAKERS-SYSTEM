/**
 * Frozen KPI dictionary — source of truth for all commercial/project KPIs.
 *
 * Future dashboard work MUST use these definitions. Any new KPI must be added
 * here before it can be surfaced in any UI. Do not modify existing definitions
 * without governance review.
 *
 * The financial-kpis service layer CONSUMES this dictionary. It does not
 * redeclare status filters, labels, or drilldown targets.
 *
 * Support status meanings:
 *   - supported:           schema, service, and query logic exist; KPI can be computed
 *   - partially_supported: schema exists but status enums are unverified or query logic incomplete
 *   - blocked:             schema or data model does not yet exist; KPI cannot be computed
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KpiSupportStatus = 'supported' | 'partially_supported' | 'blocked';
export type KpiNature = 'actual' | 'expected' | 'baseline' | 'projected';
export type KpiTemporality = 'cumulative' | 'point_in_time';

export interface KpiDrilldown {
  /** Relative page path (project ID replaced by [id] placeholder). */
  page: string;
  /** Status values to pass as query-string filter. */
  statusFilter: string[];
  /** Any additional query-string key/value pairs. */
  additionalFilters?: Record<string, string>;
}

export interface KpiDefinition {
  /** Unique identifier for the KPI. */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Source database records. */
  sourceRecords: string[];
  /** Computation formula in plain language. */
  formula: string;
  /** Status filter applied to source records (empty if N/A). */
  statusFilter: string[];
  /** Scope of aggregation. */
  scope: 'project';
  /** Whether the value is actual, expected, baseline, or projected. */
  nature: KpiNature;
  /** Whether the value is cumulative over time or a current snapshot. */
  temporality: KpiTemporality;
  /** Whether the KPI is currently computable. */
  supportStatus: KpiSupportStatus;
  /** Required when supportStatus is not 'supported'. */
  blockedReason?: string;
  /**
   * Drilldown navigation metadata. Null for derived/blocked KPIs that
   * have no single record list. Array for cross-record KPIs.
   */
  drilldown: KpiDrilldown | KpiDrilldown[] | null;
}

// ---------------------------------------------------------------------------
// Shared status-filter constants — single source of truth
// ---------------------------------------------------------------------------

export const IPA_APPROVED_PLUS = [
  'approved_internal', 'signed', 'issued', 'superseded', 'closed',
] as const;

export const IPC_SIGNED_PLUS = [
  'signed', 'issued', 'superseded', 'closed',
] as const;

export const TI_ISSUED_PLUS = [
  'issued', 'submitted', 'partially_collected', 'collected', 'overdue',
] as const;

/** Open invoice statuses — excludes 'collected' (fully paid). */
export const TI_OPEN_STATUSES = [
  'issued', 'submitted', 'partially_collected', 'overdue',
] as const;

/** Explicit allow-list for submitted variation impact — every status past draft. */
export const VAR_SUBMITTED_PLUS = [
  'submitted', 'under_review', 'returned', 'rejected',
  'approved_internal', 'signed', 'issued',
  'client_pending', 'client_approved', 'client_rejected',
  'superseded', 'closed',
] as const;

export const VAR_APPROVED_PLUS = [
  'approved_internal', 'signed', 'issued',
  'client_pending', 'client_approved', 'client_rejected',
  'superseded', 'closed',
] as const;

// ---------------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------------

export const KPI_DEFINITIONS: readonly KpiDefinition[] = [
  // =========================================================================
  // Commercial inflow KPIs
  // =========================================================================
  {
    id: 'total_claimed',
    name: 'Total Claimed',
    sourceRecords: ['Ipa'],
    formula: 'SUM(ipa.netClaimed)',
    statusFilter: [...IPA_APPROVED_PLUS],
    scope: 'project',
    nature: 'actual',
    temporality: 'cumulative',
    supportStatus: 'supported',
    drilldown: {
      page: '/projects/[id]/commercial/ipa',
      statusFilter: [...IPA_APPROVED_PLUS],
    },
  },
  {
    id: 'total_certified',
    name: 'Total Certified',
    sourceRecords: ['Ipc'],
    formula: 'SUM(ipc.netCertified)',
    statusFilter: [...IPC_SIGNED_PLUS],
    scope: 'project',
    nature: 'actual',
    temporality: 'cumulative',
    supportStatus: 'supported',
    drilldown: {
      page: '/projects/[id]/commercial/ipc',
      statusFilter: [...IPC_SIGNED_PLUS],
    },
  },
  {
    id: 'total_invoiced',
    name: 'Total Invoiced',
    sourceRecords: ['TaxInvoice'],
    formula: 'SUM(taxInvoice.totalAmount)',
    statusFilter: [...TI_ISSUED_PLUS],
    scope: 'project',
    nature: 'actual',
    temporality: 'cumulative',
    supportStatus: 'supported',
    drilldown: {
      page: '/projects/[id]/commercial/invoices',
      statusFilter: [...TI_ISSUED_PLUS],
    },
  },
  {
    id: 'total_collected',
    name: 'Total Collected',
    sourceRecords: ['InvoiceCollection'],
    formula: 'SUM(invoiceCollection.amount) where parent TaxInvoice is in issued+ statuses',
    statusFilter: [...TI_ISSUED_PLUS],
    scope: 'project',
    nature: 'actual',
    temporality: 'cumulative',
    supportStatus: 'supported',
    drilldown: {
      page: '/projects/[id]/commercial/invoices',
      statusFilter: ['partially_collected', 'collected'],
    },
  },
  {
    id: 'open_receivable',
    name: 'Open Receivable',
    sourceRecords: ['TaxInvoice', 'InvoiceCollection'],
    formula: 'SUM(taxInvoice.totalAmount) - SUM(invoiceCollection.amount) for invoices in open statuses',
    statusFilter: [...TI_OPEN_STATUSES],
    scope: 'project',
    nature: 'actual',
    temporality: 'point_in_time',
    supportStatus: 'supported',
    drilldown: {
      page: '/projects/[id]/commercial/invoices',
      statusFilter: [...TI_OPEN_STATUSES],
    },
  },
  {
    id: 'overdue_receivable',
    name: 'Overdue Receivable',
    sourceRecords: ['TaxInvoice', 'InvoiceCollection'],
    formula: 'Same as Open Receivable but filtered to invoices where dueDate < NOW()',
    statusFilter: [...TI_OPEN_STATUSES],
    scope: 'project',
    nature: 'actual',
    temporality: 'point_in_time',
    supportStatus: 'supported',
    drilldown: {
      page: '/projects/[id]/commercial/invoices',
      statusFilter: [...TI_OPEN_STATUSES],
      additionalFilters: { overdue: 'true' },
    },
  },
  {
    id: 'collection_rate',
    name: 'Collection Rate',
    sourceRecords: ['TaxInvoice', 'InvoiceCollection'],
    formula: '(Total Collected / Total Invoiced) * 100. Policy: returns 0 when Total Invoiced is 0.',
    statusFilter: [],
    scope: 'project',
    nature: 'actual',
    temporality: 'point_in_time',
    supportStatus: 'supported',
    drilldown: {
      page: '/projects/[id]/commercial/invoices',
      statusFilter: [...TI_ISSUED_PLUS],
    },
  },

  // =========================================================================
  // Variation KPIs
  // =========================================================================
  {
    id: 'submitted_variation_impact',
    name: 'Submitted Variation Impact',
    sourceRecords: ['Variation'],
    formula: 'SUM(variation.costImpact) for variations in explicit submitted+ statuses',
    statusFilter: [...VAR_SUBMITTED_PLUS],
    scope: 'project',
    nature: 'expected',
    temporality: 'cumulative',
    supportStatus: 'supported',
    drilldown: {
      page: '/projects/[id]/commercial/variations',
      statusFilter: [...VAR_SUBMITTED_PLUS],
    },
  },
  {
    id: 'approved_variation_impact',
    name: 'Approved Variation Impact',
    sourceRecords: ['Variation'],
    formula: 'SUM(variation.approvedCostImpact) where approvedCostImpact IS NOT NULL',
    statusFilter: [...VAR_APPROVED_PLUS],
    scope: 'project',
    nature: 'actual',
    temporality: 'cumulative',
    supportStatus: 'supported',
    drilldown: {
      page: '/projects/[id]/commercial/variations',
      statusFilter: [...VAR_APPROVED_PLUS],
    },
  },
  {
    id: 'claimed_vs_certified_gap',
    name: 'Claimed vs Certified Gap',
    sourceRecords: ['Ipa', 'Ipc'],
    formula: 'Total Claimed - Total Certified',
    statusFilter: [],
    scope: 'project',
    nature: 'actual',
    temporality: 'point_in_time',
    supportStatus: 'supported',
    // Cross-record KPI: drilldown shows both sides
    drilldown: [
      {
        page: '/projects/[id]/commercial/ipa',
        statusFilter: [...IPA_APPROVED_PLUS],
      },
      {
        page: '/projects/[id]/commercial/ipc',
        statusFilter: [...IPC_SIGNED_PLUS],
      },
    ],
  },

  // =========================================================================
  // Project financial control KPIs
  // =========================================================================
  {
    id: 'budget',
    name: 'Budget',
    sourceRecords: ['Project'],
    formula: 'project.contractValue',
    statusFilter: [],
    scope: 'project',
    nature: 'baseline',
    temporality: 'point_in_time',
    supportStatus: 'supported',
    drilldown: {
      page: '/projects/[id]',
      statusFilter: [],
    },
  },
  {
    id: 'revised_budget',
    name: 'Revised Budget',
    sourceRecords: ['Project', 'Variation'],
    formula: 'project.contractValue + SUM(variation.approvedCostImpact) for approved VOs (client_approved/closed) and approved COs (approved_internal+)',
    statusFilter: [],
    scope: 'project',
    nature: 'baseline',
    temporality: 'point_in_time',
    supportStatus: 'supported',
    drilldown: {
      page: '/projects/[id]',
      statusFilter: [],
    },
  },
  {
    id: 'committed_cost',
    name: 'Committed Cost',
    sourceRecords: ['PurchaseOrder'],
    formula: 'SUM(purchaseOrder.totalAmount) where status in approved+',
    statusFilter: ['approved', 'issued', 'partially_delivered', 'delivered', 'closed'],
    scope: 'project',
    nature: 'actual',
    temporality: 'cumulative',
    supportStatus: 'supported',
    drilldown: {
      page: '/projects/[id]/procurement',
      statusFilter: ['approved', 'issued', 'partially_delivered', 'delivered', 'closed'],
    },
  },
  {
    id: 'actual_cost',
    name: 'Actual Cost',
    sourceRecords: ['SupplierInvoice', 'Expense'],
    formula: 'SUM(supplierInvoice.totalAmount) where approved+ + SUM(expense.amount) where approved+',
    statusFilter: ['approved', 'paid', 'closed'],
    scope: 'project',
    nature: 'actual',
    temporality: 'cumulative',
    supportStatus: 'supported',
    drilldown: {
      page: '/projects/[id]/procurement',
      statusFilter: ['approved', 'paid', 'closed'],
    },
  },
  {
    id: 'remaining_budget',
    name: 'Remaining Budget',
    sourceRecords: ['Project', 'PurchaseOrder'],
    formula: 'Revised Budget - Committed Cost',
    statusFilter: [],
    scope: 'project',
    nature: 'projected',
    temporality: 'point_in_time',
    supportStatus: 'supported',
    drilldown: {
      page: '/projects/[id]',
      statusFilter: [],
    },
  },
] as const;

// ---------------------------------------------------------------------------
// Dashboard rendering constants — source of truth consumed by dashboard-cards
// ---------------------------------------------------------------------------

/**
 * Ordered list of KPI ids the dashboard renders. The dashboard component
 * imports this instead of maintaining its own local constant.
 *
 * Adding/removing an entry here changes what the dashboard shows.
 * The freeze test (I5) verifies every id exists in KPI_DEFINITIONS
 * and is 'supported'.
 */
export const DASHBOARD_DISPLAY_IDS = [
  'total_claimed',
  'total_certified',
  'total_invoiced',
  'total_collected',
  'open_receivable',
  'overdue_receivable',
  'collection_rate',
  'claimed_vs_certified_gap',
  'budget',
  'revised_budget',
  'submitted_variation_impact',
  'approved_variation_impact',
] as const;

/**
 * KPI ids that render as percentage instead of currency.
 * The dashboard component imports this for formatting decisions.
 */
export const PERCENTAGE_KPI_IDS = new Set<string>(['collection_rate']);

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

const KPI_MAP = new Map(KPI_DEFINITIONS.map((k) => [k.id, k]));

export function getKpiDefinition(id: string): KpiDefinition | undefined {
  return KPI_MAP.get(id);
}

export function getSupportedKpis(): KpiDefinition[] {
  return KPI_DEFINITIONS.filter((k) => k.supportStatus === 'supported');
}

export function getBlockedKpis(): KpiDefinition[] {
  return KPI_DEFINITIONS.filter((k) => k.supportStatus !== 'supported');
}
