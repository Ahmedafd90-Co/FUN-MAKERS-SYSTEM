/**
 * Shared types for the sheet-import pipeline.
 *
 * Wire format for row-level errors, warnings, conflicts, and the validator
 * contract. All validators return the same shape so the review queue UI
 * renders uniformly across import types.
 */

export interface ImportIssue {
  code: string;
  field?: string | null;
  message: string;
}

export type ImportConflict =
  | {
      type: 'ipa_period_number';
      existingIpaId: string;
      existingPeriodNumber: number;
    }
  | {
      type: 'ipa_period_window_overlap';
      existingIpaId: string;
      existingPeriodFrom: string;
      existingPeriodTo: string;
    }
  | {
      type: 'budget_category_missing';
      categoryCodeFromSheet: string;
    };

export interface ValidatedRow<TParsed = unknown> {
  rowNumber: number;
  rawJson: Record<string, unknown>;
  parsedJson: TParsed | null;
  errors: ImportIssue[];
  warnings: ImportIssue[];
  conflict: ImportConflict | null;
}

export interface ImportBatchSummary {
  totalRows: number;
  pending: number;
  valid: number;
  invalid: number;
  conflict: number;
  committed: number;
  skipped: number;
  sumByField?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Parsed shapes per import type (used as ImportRow.parsedJson)
// ---------------------------------------------------------------------------

export interface ParsedBudgetBaselineRow {
  categoryCode: string;
  categoryName?: string;
  budgetAmount: string;
  notes?: string;
}

export interface ParsedIpaHistoryRow {
  periodNumber: number;
  periodFrom: string; // ISO yyyy-mm-dd
  periodTo: string;
  grossAmount: string;
  retentionRate: string;
  retentionAmount: string;
  previousCertified: string;
  currentClaim: string;
  advanceRecovery: string | null;
  otherDeductions: string | null;
  netClaimed: string;
  currency: string;
  status: string; // approved_internal | signed | issued | superseded | closed
  approvedAt: string | null; // ISO date — priority source for postedAt
  signedAt: string | null;
  issuedAt: string | null;
  description: string | null;
}

// Narrow typed access helpers — the sheet parser always returns strings,
// and the validator uses these aliases to make typed assertions clearer.
export type RawRow = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Commit results — row-level outcome of a committer run
// ---------------------------------------------------------------------------

export interface RowCommitSuccess {
  rowNumber: number;
  status: 'committed';
  committedRecordType: string;
  committedRecordId: string;
}

export interface RowCommitSkipped {
  rowNumber: number;
  status: 'skipped';
  reason: string;
}

export interface RowCommitFailed {
  rowNumber: number;
  status: 'invalid';
  errors: ImportIssue[];
}

export type RowCommitResult = RowCommitSuccess | RowCommitSkipped | RowCommitFailed;
