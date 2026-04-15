/**
 * Budget baseline validator.
 *
 * Row shape expected from the sheet:
 *   - category_code     (required, must match an existing BudgetCategory.code)
 *   - category_name     (optional, informational — warning if it mismatches ref name)
 *   - budget_amount     (required, numeric, >= 0)
 *   - notes             (optional)
 *
 * Validation outcomes:
 *   - errors  → row is invalid, cannot be committed
 *   - warnings → row is valid but has advisory issues
 *   - conflict → structurally blocked (e.g. category_code not in reference data)
 *
 * No live DB mutations happen here. This function is pure over the batch's
 * raw rows + the reference-data snapshot stored at validation time.
 */

import type { BudgetReferenceSnapshot } from '../reference-snapshot';
import type {
  ImportIssue,
  ImportConflict,
  ParsedBudgetBaselineRow,
  RawRow,
  ValidatedRow,
} from '../types';

const REQUIRED = ['category_code', 'budget_amount'] as const;

function coerceDecimalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (s === '') return null;
  // Strip common thousand separators and currency symbols
  const cleaned = s.replace(/[,\s]/g, '').replace(/^[^\d.\-]+/, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  // Always return with 2-decimal precision to match Decimal(18,2)
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
}

export function validateBudgetBaselineRow(
  rowNumber: number,
  raw: RawRow,
  snapshot: BudgetReferenceSnapshot,
): ValidatedRow<ParsedBudgetBaselineRow> {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  let conflict: ImportConflict | null = null;

  // Normalize keys to snake_case lowercase for predictable access.
  const norm: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    norm[k.trim().toLowerCase().replace(/\s+/g, '_')] = v;
  }

  for (const f of REQUIRED) {
    const v = norm[f];
    if (v === undefined || v === null || String(v).trim() === '') {
      errors.push({
        code: 'required_missing',
        field: f,
        message: `'${f}' is required.`,
      });
    }
  }

  const categoryCode = String(norm.category_code ?? '').trim();
  const categoryName = norm.category_name == null ? '' : String(norm.category_name).trim();
  const budgetAmount = coerceDecimalString(norm.budget_amount);
  const notes = norm.notes == null ? '' : String(norm.notes).trim();

  if (budgetAmount === null && (norm.budget_amount ?? '') !== '') {
    errors.push({
      code: 'invalid_number',
      field: 'budget_amount',
      message: `'${norm.budget_amount}' is not a valid number.`,
    });
  } else if (budgetAmount !== null && parseFloat(budgetAmount) < 0) {
    errors.push({
      code: 'negative_amount',
      field: 'budget_amount',
      message: 'Budget amount cannot be negative.',
    });
  }

  if (categoryCode) {
    const match = snapshot.categories.find((c) => c.code === categoryCode);
    if (!match) {
      conflict = {
        type: 'budget_category_missing',
        categoryCodeFromSheet: categoryCode,
      };
    } else if (categoryName && categoryName !== match.name) {
      warnings.push({
        code: 'category_name_mismatch',
        field: 'category_name',
        message: `Sheet says '${categoryName}', reference says '${match.name}'. Reference name will be used.`,
      });
    }
  }

  const parsed: ParsedBudgetBaselineRow | null =
    errors.length === 0 && categoryCode && budgetAmount !== null
      ? {
          categoryCode,
          ...(categoryName ? { categoryName } : {}),
          budgetAmount,
          ...(notes ? { notes } : {}),
        }
      : null;

  return {
    rowNumber,
    rawJson: raw,
    parsedJson: parsed,
    errors,
    warnings,
    conflict,
  };
}
