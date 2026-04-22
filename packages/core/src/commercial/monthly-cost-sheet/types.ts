/**
 * Types for the Monthly Commercial Cost Sheet — portfolio-scoped report.
 *
 * Truth rules baked into the types (see service.ts for the queries):
 *   - Approved Variation uses the VO-vs-CO split gate from
 *     revised-contract-value.ts (VO ∈ {client_approved, closed},
 *     CO ∈ {approved_internal, signed, issued, closed}).
 *   - IPA Achieved reuses the existing `total_claimed` definition
 *     (status ∈ IPA_APPROVED_PLUS); includes imported-historical IPAs.
 *   - IPC Certified uses `netCertified` grouped by `certificationDate`.
 *   - Invoiced (ex-VAT) = `totalAmount − vatAmount`, grouped by `invoiceDate`.
 *   - Collected = `invoiceCollection.amount`, grouped by `collectionDate`.
 *   - Forecasts exist only for IPA (IpaForecast table). IPC/Invoiced/Collected
 *     have actual values but NO forecast — their month cells carry a single
 *     achieved number with no diff/diff% fields.
 *
 * All monetary values are emitted as decimal strings (stringified
 * `Prisma.Decimal`) to avoid JS float arithmetic downstream. Percentages
 * emitted the same way; null when the denominator is zero.
 */

export interface MonthlyCostSheetOptions {
  /** Optional explicit list of projects. If omitted the service returns
   *  every project in the database. The route is responsible for
   *  permission-filtering BEFORE calling the service. */
  projectIds?: string[];
  /** Inclusive start month, `YYYY-MM`. Default: reportMonth − 11 (trailing 12). */
  fromMonth?: string;
  /** Inclusive end month, `YYYY-MM`. Default: reportMonth. */
  toMonth?: string;
  /** Reporting month, `YYYY-MM`. Default: current UTC month. */
  reportMonth?: string;
  /** For deterministic tests. Default: new Date(). */
  now?: Date;
}

/**
 * A month cell carrying both forecast and actual — only populated for IPA,
 * where `IpaForecast` provides the plan. For other series `forecast` is null
 * and `diff`/`diffPct` are null too.
 */
export interface IpaMonthCell {
  forecast: string | null;       // null when no IpaForecast row covers this month
  achieved: string;              // always populated (0 if no IPA this month)
  diff: string | null;           // achieved − forecast; null when forecast is null
  /** Percent as a decimal string (e.g. "64.86"). Null when forecast ≤ 0. */
  diffPct: string | null;
}

/** Actual-only month cell for IPC / Invoiced / Collected (no forecast in schema). */
export interface ActualOnlyMonthCell {
  achieved: string;              // always populated (0 if nothing that month)
}

export interface MonthBlock {
  /** `YYYY-MM`. */
  yearMonth: string;
  /** "Aug 2025" style label for sheet headers. */
  label: string;
  ipa: IpaMonthCell;
  ipc: ActualOnlyMonthCell;
  /** Ex-VAT per Phase 1 decision. */
  invoicedExVat: ActualOnlyMonthCell;
  /** For the raw-data sheet only — never used in the main matrix. */
  invoicedGross: ActualOnlyMonthCell;
  collected: ActualOnlyMonthCell;
}

export interface PriorMonthTotals {
  ipaForecast: string;
  ipaAchieved: string;
  ipcCertified: string;
  invoicedExVat: string;
  collected: string;
}

export interface ProjectRow {
  projectId: string;
  projectCode: string;
  projectName: string;
  currency: string;

  // ── Contract / variation block ────────────────────────────────────
  contractAmount: string | null;
  proposedVariation: string;            // SUM(v.costImpact) where VAR_SUBMITTED_PLUS
  approvedVariation: string;            // split-gate sum (VO/CO rules)
  anticipatedContractAmount: string | null; // contract + approvedVariation

  // ── Cumulative totals (project lifetime through reportingMonth) ───
  cumulative: {
    ipaForecast: string;
    ipaAchieved: string;
    ipcCertified: string;
    invoicedExVat: string;
    collected: string;
  };

  // ── Prior-month totals (through reportingMonth − 1) ──────────────
  upToPriorMonth: PriorMonthTotals;

  // ── Per-month breakdown ──────────────────────────────────────────
  months: MonthBlock[];
}

/**
 * Per-currency rollup. When the portfolio contains a single currency, this
 * IS the portfolio total. When there are multiple currencies, see
 * `MonthlyCostSheet.warnings` — the caller should render per-currency
 * sub-totals rather than a single rolled-up number.
 */
export interface CurrencyTotals {
  currency: string;
  projectCount: number;
  contractAmount: string;
  proposedVariation: string;
  approvedVariation: string;
  anticipatedContractAmount: string;
  cumulative: {
    ipaForecast: string;
    ipaAchieved: string;
    ipcCertified: string;
    invoicedExVat: string;
    collected: string;
  };
  /** Per-month across the portfolio (sum of each project's monthly cell). */
  months: MonthBlock[];
}

export interface MonthlyCostSheet {
  generatedAt: string;     // ISO timestamp
  reportMonth: string;     // YYYY-MM
  fromMonth: string;       // YYYY-MM
  toMonth: string;         // YYYY-MM
  /** Ordered list of YYYY-MM strings covered by the matrix. */
  months: string[];
  /** Human labels aligned with `months` (e.g. "Aug 2025"). */
  monthLabels: string[];
  /** One row per project, sorted by code ASC. */
  projects: ProjectRow[];
  /** Per-currency rollups. Keys = currency codes. */
  currencyGroups: Record<string, CurrencyTotals>;
  /**
   * Operator warnings. Populated e.g. when the portfolio spans multiple
   * currencies (a single rolled-up total would be dishonest) or when a
   * project has no forecasts at all.
   */
  warnings: string[];
  /** True when portfolio spans > 1 currency — the caller should suppress
   *  any single rolled-up amount. */
  mixedCurrencies: boolean;
}
