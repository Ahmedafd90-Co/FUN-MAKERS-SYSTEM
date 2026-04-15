/**
 * IPA history validator.
 *
 * Row shape expected from the sheet (snake_case, case-insensitive at intake):
 *   - period_number        (required, int, positive)
 *   - period_from          (required, date — yyyy-mm-dd or m/d/yyyy)
 *   - period_to            (required, date)
 *   - gross_amount         (required, decimal)
 *   - retention_rate       (required, decimal 0..1 — e.g. 0.05 for 5%)
 *   - retention_amount     (required, decimal)
 *   - previous_certified   (required, decimal)
 *   - current_claim        (required, decimal)
 *   - advance_recovery     (optional, decimal)
 *   - other_deductions     (optional, decimal)
 *   - net_claimed          (required, decimal)
 *   - currency             (required, 3-letter)
 *   - status               (required, subset: approved_internal|signed|issued|superseded|closed)
 *   - approved_at          (optional, date — priority source for postedAt)
 *   - signed_at            (optional, date)
 *   - issued_at            (optional, date)
 *   - description          (optional)
 *
 * Blocks with conflict = true when:
 *   - periodNumber duplicates an existing IPA in this project.
 *   - [period_from, period_to] overlaps any existing IPA's window.
 *
 * Honest non-goal: this validator does NOT fetch live DB state. It consumes
 * the snapshot stored on the ImportBatch, which the service layer captures
 * at validation time.
 */

import type { IpaReferenceSnapshot } from '../reference-snapshot';
import type {
  ImportConflict,
  ImportIssue,
  ParsedIpaHistoryRow,
  RawRow,
  ValidatedRow,
} from '../types';

const ALLOWED_STATUSES = new Set([
  'approved_internal',
  'signed',
  'issued',
  'superseded',
  'closed',
]);

function coerceDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (s === '') return null;
  // Accept yyyy-mm-dd and m/d/yyyy and d/m/yyyy (ambiguous — prefer yyyy-mm-dd).
  // For anything Date can parse, we preserve as ISO date portion.
  const iso = /^(\d{4})-(\d{2})-(\d{2})/;
  if (iso.test(s)) return s.slice(0, 10);
  // m/d/yyyy or d/m/yyyy — assume yyyy is the 4-digit component.
  const slash = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/;
  const m = slash.exec(s);
  if (m) {
    // Prefer m/d/yyyy (US format) as the canonical interpretation for the
    // import source — callers providing non-ISO dates should adopt ISO.
    const mm = m[1]!.padStart(2, '0');
    const dd = m[2]!.padStart(2, '0');
    const yyyy = m[3]!;
    return `${yyyy}-${mm}-${dd}`;
  }
  // Last resort: let Date try; we only keep the yyyy-mm-dd portion.
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function coerceDecimalString(value: unknown, decimals = 2): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (s === '') return null;
  const cleaned = s.replace(/[,\s]/g, '').replace(/^[^\d.\-]+/, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(decimals);
}

function coerceInt(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (s === '') return null;
  const cleaned = s.replace(/[,\s]/g, '');
  if (!/^-?\d+$/.test(cleaned)) return null;
  const n = parseInt(cleaned, 10);
  if (!Number.isFinite(n)) return null;
  return n;
}

function normKeys(raw: RawRow): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k.trim().toLowerCase().replace(/\s+/g, '_')] = v;
  }
  return out;
}

export function validateIpaHistoryRow(
  rowNumber: number,
  raw: RawRow,
  snapshot: IpaReferenceSnapshot,
  projectCurrency: string,
  seenPeriodNumbersInBatch: Map<number, number>, // periodNumber → earlier rowNumber
): ValidatedRow<ParsedIpaHistoryRow> {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  let conflict: ImportConflict | null = null;

  const n = normKeys(raw);

  // Required-present check
  const requiredKeys = [
    'period_number',
    'period_from',
    'period_to',
    'gross_amount',
    'retention_rate',
    'retention_amount',
    'previous_certified',
    'current_claim',
    'net_claimed',
    'currency',
    'status',
  ] as const;
  for (const k of requiredKeys) {
    const v = n[k];
    if (v === undefined || v === null || String(v).trim() === '') {
      errors.push({
        code: 'required_missing',
        field: k,
        message: `'${k}' is required.`,
      });
    }
  }

  // Coerce fields
  const periodNumber = coerceInt(n.period_number);
  const periodFrom = coerceDate(n.period_from);
  const periodTo = coerceDate(n.period_to);
  const grossAmount = coerceDecimalString(n.gross_amount);
  const retentionRate = coerceDecimalString(n.retention_rate, 4);
  const retentionAmount = coerceDecimalString(n.retention_amount);
  const previousCertified = coerceDecimalString(n.previous_certified);
  const currentClaim = coerceDecimalString(n.current_claim);
  const advanceRecovery = coerceDecimalString(n.advance_recovery);
  const otherDeductions = coerceDecimalString(n.other_deductions);
  const netClaimed = coerceDecimalString(n.net_claimed);
  const currency = String(n.currency ?? '').trim().toUpperCase();
  const statusRaw = String(n.status ?? '').trim().toLowerCase();
  const approvedAt = coerceDate(n.approved_at);
  const signedAt = coerceDate(n.signed_at);
  const issuedAt = coerceDate(n.issued_at);
  const description = n.description == null ? '' : String(n.description).trim();

  // Numeric/date validation
  if (periodNumber === null && n.period_number != null && String(n.period_number) !== '') {
    errors.push({ code: 'invalid_integer', field: 'period_number', message: 'Must be an integer.' });
  } else if (periodNumber !== null && periodNumber < 1) {
    errors.push({ code: 'invalid_integer', field: 'period_number', message: 'Must be >= 1.' });
  }
  if (periodFrom === null && n.period_from) {
    errors.push({ code: 'invalid_date', field: 'period_from', message: 'Not a valid date.' });
  }
  if (periodTo === null && n.period_to) {
    errors.push({ code: 'invalid_date', field: 'period_to', message: 'Not a valid date.' });
  }
  if (periodFrom && periodTo && periodFrom > periodTo) {
    errors.push({
      code: 'period_range_invalid',
      field: 'period_to',
      message: 'period_to must be on or after period_from.',
    });
  }

  for (const [field, val] of [
    ['gross_amount', grossAmount],
    ['retention_amount', retentionAmount],
    ['previous_certified', previousCertified],
    ['current_claim', currentClaim],
    ['net_claimed', netClaimed],
  ] as const) {
    if (val === null && n[field] != null && String(n[field]) !== '') {
      errors.push({ code: 'invalid_number', field, message: 'Not a valid number.' });
    }
  }

  if (retentionRate === null && n.retention_rate != null && String(n.retention_rate) !== '') {
    errors.push({ code: 'invalid_number', field: 'retention_rate', message: 'Not a valid number.' });
  } else if (retentionRate !== null) {
    const rr = parseFloat(retentionRate);
    if (rr < 0 || rr > 1) {
      errors.push({
        code: 'retention_rate_out_of_range',
        field: 'retention_rate',
        message: 'Must be between 0 and 1 (e.g. 0.05 for 5%).',
      });
    }
  }

  if (currency && currency.length !== 3) {
    errors.push({ code: 'invalid_currency', field: 'currency', message: 'Use 3-letter ISO code (e.g. SAR).' });
  } else if (currency && projectCurrency && currency !== projectCurrency.toUpperCase()) {
    warnings.push({
      code: 'currency_mismatch',
      field: 'currency',
      message: `Row currency '${currency}' differs from project currency '${projectCurrency}'.`,
    });
  }

  if (statusRaw && !ALLOWED_STATUSES.has(statusRaw)) {
    errors.push({
      code: 'invalid_status',
      field: 'status',
      message: `Must be one of: ${Array.from(ALLOWED_STATUSES).join(', ')}.`,
    });
  }

  // Derive a net_claimed cross-check: gross - retention - advance - other
  // must equal provided net_claimed (to 2dp). We warn rather than error, so
  // real-world rounding doesn't block intake — but the operator is alerted.
  if (
    grossAmount !== null &&
    retentionAmount !== null &&
    netClaimed !== null
  ) {
    const gross = parseFloat(grossAmount);
    const retention = parseFloat(retentionAmount);
    const advance = advanceRecovery ? parseFloat(advanceRecovery) : 0;
    const other = otherDeductions ? parseFloat(otherDeductions) : 0;
    const derived = +(gross - retention - advance - other).toFixed(2);
    const claimed = parseFloat(netClaimed);
    if (Math.abs(derived - claimed) > 0.01) {
      warnings.push({
        code: 'net_claimed_mismatch',
        field: 'net_claimed',
        message: `Row provides ${claimed.toFixed(2)} but (gross - retention - advance - other) = ${derived.toFixed(2)}.`,
      });
    }
  }

  // Conflict checks — only if we have valid periodNumber and dates
  if (periodNumber !== null) {
    // Duplicate within same batch
    const earlier = seenPeriodNumbersInBatch.get(periodNumber);
    if (earlier !== undefined) {
      errors.push({
        code: 'duplicate_period_in_batch',
        field: 'period_number',
        message: `period_number ${periodNumber} already appears on row ${earlier} of this sheet.`,
      });
    } else {
      seenPeriodNumbersInBatch.set(periodNumber, rowNumber);
    }

    // Clash with live / previously-imported records
    const existingSamePeriod = snapshot.existingIpas.find(
      (e) => e.periodNumber === periodNumber,
    );
    if (existingSamePeriod && !conflict) {
      conflict = {
        type: 'ipa_period_number',
        existingIpaId: existingSamePeriod.id,
        existingPeriodNumber: existingSamePeriod.periodNumber,
      };
    }
  }

  if (periodFrom && periodTo && !conflict) {
    const overlap = snapshot.existingIpas.find((e) => {
      const ef = e.periodFrom.slice(0, 10);
      const et = e.periodTo.slice(0, 10);
      return periodFrom <= et && periodTo >= ef;
    });
    if (overlap) {
      conflict = {
        type: 'ipa_period_window_overlap',
        existingIpaId: overlap.id,
        existingPeriodFrom: overlap.periodFrom,
        existingPeriodTo: overlap.periodTo,
      };
    }
  }

  const parsed: ParsedIpaHistoryRow | null =
    errors.length === 0 &&
    periodNumber !== null &&
    periodFrom &&
    periodTo &&
    grossAmount &&
    retentionRate &&
    retentionAmount &&
    previousCertified &&
    currentClaim &&
    netClaimed &&
    currency &&
    statusRaw
      ? {
          periodNumber,
          periodFrom,
          periodTo,
          grossAmount,
          retentionRate,
          retentionAmount,
          previousCertified,
          currentClaim,
          advanceRecovery: advanceRecovery ?? null,
          otherDeductions: otherDeductions ?? null,
          netClaimed,
          currency,
          status: statusRaw,
          approvedAt: approvedAt ?? null,
          signedAt: signedAt ?? null,
          issuedAt: issuedAt ?? null,
          description: description || null,
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
