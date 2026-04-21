/**
 * IPA forecast validator.
 *
 * Row shape expected from the sheet (snake_case, case-insensitive):
 *   - period_number     (required, int, positive)
 *   - period_start      (required, date — yyyy-mm-dd or m/d/yyyy)
 *   - forecast_amount   (required, decimal >= 0)
 *   - notes             (optional)
 *
 * Conflicts (block commit):
 *   - periodNumber duplicates an existing IpaForecast in this project
 *     (schema has @@unique(projectId, periodNumber) — committer would throw
 *     anyway, but we surface the conflict up front in the review queue).
 *
 * Warnings (row valid but advisory):
 *   - duplicate periodNumber within the batch itself — the first row wins
 *     at commit time if validation lets it through.
 *
 * No live DB mutations. Pure over the batch's raw rows + the IpaForecast
 * reference snapshot.
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
): ValidatedRow<ParsedIpaForecastRow> {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  let conflict: ImportConflict | null = null;

  // Normalize keys.
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
  const periodStart = coerceDate(norm.period_start);
  const forecastAmount = coerceDecimalString(norm.forecast_amount);
  const notes =
    norm.notes == null || String(norm.notes).trim() === ''
      ? null
      : String(norm.notes).trim();

  if (norm.period_number != null && periodNumber === null) {
    errors.push({
      code: 'invalid_int',
      field: 'period_number',
      message: `'${String(norm.period_number)}' is not a valid positive integer.`,
    });
  } else if (periodNumber !== null && periodNumber <= 0) {
    errors.push({
      code: 'invalid_int',
      field: 'period_number',
      message: `'period_number' must be > 0.`,
    });
  }

  if (norm.period_start != null && periodStart === null) {
    errors.push({
      code: 'invalid_date',
      field: 'period_start',
      message: `'${String(norm.period_start)}' is not a valid date.`,
    });
  }

  if (forecastAmount === null && (norm.forecast_amount ?? '') !== '') {
    errors.push({
      code: 'invalid_number',
      field: 'forecast_amount',
      message: `'${String(norm.forecast_amount)}' is not a valid number.`,
    });
  } else if (forecastAmount !== null && parseFloat(forecastAmount) < 0) {
    errors.push({
      code: 'negative_amount',
      field: 'forecast_amount',
      message: `'forecast_amount' must be ≥ 0.`,
    });
  }

  // Conflict check — duplicate periodNumber against existing forecasts.
  if (periodNumber !== null) {
    const dup = snapshot.existingForecasts.find(
      (f) => f.periodNumber === periodNumber,
    );
    if (dup) {
      conflict = {
        type: 'ipa_forecast_period_number',
        existingForecastId: dup.id,
        existingPeriodNumber: dup.periodNumber,
      };
    }
  }

  const hasErrors = errors.length > 0;
  const parsedJson: ParsedIpaForecastRow | null = hasErrors
    ? null
    : periodNumber !== null && periodStart && forecastAmount !== null
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
