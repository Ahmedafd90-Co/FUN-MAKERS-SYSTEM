/**
 * IPA forecast validator — PIC-99 PR-1 (M1).
 *
 * Row shape expected from the sheet (snake_case, case-insensitive at intake):
 *   - period_number     (required, int, positive)
 *   - period_start      (required, date — yyyy-mm-dd or m/d/yyyy)
 *   - forecast_amount   (required, decimal >= 0)
 *   - notes             (optional)
 *
 * Conflicts (block commit):
 *   - periodNumber duplicates an existing ACTIVE (deletedAt:null) IpaForecast in
 *     this project. The schema's @@unique([orgId, projectId, periodNumber]) would
 *     also throw at commit, but surfacing the conflict at validate gives the
 *     operator a chance to resolve in the review queue.
 *
 * Warnings (row valid but advisory):
 *   - duplicate periodNumber within the batch itself — the first row wins at
 *     commit time if validation lets it through.
 *
 * Honest non-goals:
 *   - No live DB mutations (pure over batch's raw rows + snapshot).
 *   - No currency validation — forecast inherits project's currencyCode at
 *     commit time; the row doesn't carry currency.
 *   - No assertProjectScope here: validator has no by-id reads (no DB at all).
 *     Scope binding happens at the service-level commitBatch / validateBatch
 *     chokepoints (PIC-97 hotfix pattern); the validator runs on already-
 *     scope-bound batch contents.
 */

import type { IpaForecastReferenceSnapshot } from '../reference-snapshot';
import type {
  ImportConflict,
  ImportIssue,
  ParsedIpaForecastRow,
  RawRow,
  ValidatedRow,
} from '../types';

const REQUIRED = ['period_number', 'period_start', 'forecast_amount'] as const;

function coerceDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (s === '') return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/;
  if (iso.test(s)) return s.slice(0, 10);
  const slash = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/;
  const m = slash.exec(s);
  if (m) {
    const mm = m[1]!.padStart(2, '0');
    const dd = m[2]!.padStart(2, '0');
    const yyyy = m[3]!;
    return `${yyyy}-${mm}-${dd}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function coerceDecimalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (s === '') return null;
  const cleaned = s.replace(/[,\s]/g, '').replace(/^[^\d.\-]+/, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
}

function coerceInt(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (s === '') return null;
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || String(n) !== s.replace(/^\+/, '')) return null;
  return n;
}

export function validateIpaForecastRow(
  rowNumber: number,
  raw: RawRow,
  snapshot: IpaForecastReferenceSnapshot,
  seenPeriodNumbers: Map<number, number>,
): ValidatedRow<ParsedIpaForecastRow> {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  let conflict: ImportConflict | null = null;

  // Normalize keys: lowercase + underscores.
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

  const periodNumber = coerceInt(norm.period_number);
  if (norm.period_number != null && periodNumber === null) {
    errors.push({
      code: 'invalid_int',
      field: 'period_number',
      message: `'period_number' must be a positive integer.`,
    });
  } else if (periodNumber !== null && periodNumber <= 0) {
    errors.push({
      code: 'invalid_int',
      field: 'period_number',
      message: `'period_number' must be positive.`,
    });
  }

  const periodStart = coerceDate(norm.period_start);
  if (norm.period_start != null && periodStart === null) {
    errors.push({
      code: 'invalid_date',
      field: 'period_start',
      message: `'period_start' must be a valid date (yyyy-mm-dd or m/d/yyyy).`,
    });
  }

  const forecastAmount = coerceDecimalString(norm.forecast_amount);
  if (norm.forecast_amount != null && forecastAmount === null) {
    errors.push({
      code: 'invalid_decimal',
      field: 'forecast_amount',
      message: `'forecast_amount' must be a non-negative decimal.`,
    });
  } else if (forecastAmount !== null && parseFloat(forecastAmount) < 0) {
    errors.push({
      code: 'invalid_decimal',
      field: 'forecast_amount',
      message: `'forecast_amount' must be >= 0.`,
    });
  }

  const notes =
    norm.notes === undefined || norm.notes === null || String(norm.notes).trim() === ''
      ? null
      : String(norm.notes).trim();

  // Conflict — existing active forecast for this periodNumber in the project
  if (periodNumber !== null && errors.length === 0) {
    const existing = snapshot.existingForecasts.find((f) => f.periodNumber === periodNumber);
    if (existing) {
      conflict = {
        type: 'ipa_forecast_period_exists',
        existingForecastId: existing.id,
        existingPeriodNumber: existing.periodNumber,
      };
    }
  }

  // Intra-batch duplicate detection — warn, don't block
  if (periodNumber !== null && errors.length === 0 && conflict === null) {
    const seenAtRow = seenPeriodNumbers.get(periodNumber);
    if (seenAtRow !== undefined) {
      warnings.push({
        code: 'duplicate_period_in_batch',
        field: 'period_number',
        message: `period_number ${periodNumber} also appears in row ${seenAtRow} of this batch; first row wins at commit.`,
      });
    } else {
      seenPeriodNumbers.set(periodNumber, rowNumber);
    }
  }

  const parsedJson: ParsedIpaForecastRow | null =
    errors.length === 0 && periodNumber !== null && periodStart !== null && forecastAmount !== null
      ? {
          periodNumber,
          periodStart,
          forecastAmount,
          notes,
        }
      : null;

  return {
    rowNumber,
    rawJson: raw,
    parsedJson,
    errors,
    warnings,
    conflict,
  };
}
