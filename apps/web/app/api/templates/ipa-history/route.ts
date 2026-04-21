/**
 * IPA History upload template — XLSX / CSV.
 *
 *   GET /api/templates/ipa-history?format=xlsx|csv
 *
 * Two-sheet XLSX:
 *   Rows         — header row + 1 sample data row
 *   Instructions — column meanings, required/optional, type/format, notes
 *
 * Schema is locked to
 *   packages/core/src/import/validators/ipa-history.ts
 * so what the operator fills in matches what the pipeline validates.
 */
import {
  buildCsv,
  buildWorkbook,
  csvResponse,
  parseExportFormat,
  xlsxResponse,
} from '@/lib/export-helpers';

import type { NextRequest } from 'next/server';

const HEADERS = [
  'period_number',
  'period_from',
  'period_to',
  'gross_amount',
  'retention_rate',
  'retention_amount',
  'previous_certified',
  'current_claim',
  'advance_recovery',
  'other_deductions',
  'net_claimed',
  'currency',
  'status',
  'approved_at',
  'signed_at',
  'issued_at',
  'description',
];

const SAMPLE_ROWS = [
  {
    period_number: 1,
    period_from: '2026-01-01',
    period_to: '2026-01-31',
    gross_amount: 500000,
    retention_rate: 0.05,
    retention_amount: 25000,
    previous_certified: 0,
    current_claim: 475000,
    advance_recovery: 0,
    other_deductions: 0,
    net_claimed: 475000,
    currency: 'SAR',
    status: 'approved_internal',
    approved_at: '2026-02-05',
    signed_at: '',
    issued_at: '',
    description: 'January 2026 progress claim — historical import',
  },
];

const INSTRUCTIONS_HEADERS = ['Column', 'Required', 'Type', 'Notes'];
const INSTRUCTIONS_ROWS = [
  { Column: 'period_number', Required: 'Yes', Type: 'integer (>0)', Notes: 'Unique per project. Duplicate period numbers block the row as a conflict.' },
  { Column: 'period_from', Required: 'Yes', Type: 'date (yyyy-mm-dd preferred)', Notes: 'Inclusive period start.' },
  { Column: 'period_to', Required: 'Yes', Type: 'date (yyyy-mm-dd preferred)', Notes: 'Inclusive period end. Overlapping windows with any existing IPA on this project block the row.' },
  { Column: 'gross_amount', Required: 'Yes', Type: 'decimal', Notes: 'Gross amount before retention / deductions.' },
  { Column: 'retention_rate', Required: 'Yes', Type: 'decimal (0–1)', Notes: 'Fraction, e.g. 0.05 for 5%.' },
  { Column: 'retention_amount', Required: 'Yes', Type: 'decimal', Notes: '' },
  { Column: 'previous_certified', Required: 'Yes', Type: 'decimal', Notes: 'Cumulative prior-period certified value.' },
  { Column: 'current_claim', Required: 'Yes', Type: 'decimal', Notes: '' },
  { Column: 'advance_recovery', Required: 'No', Type: 'decimal', Notes: '' },
  { Column: 'other_deductions', Required: 'No', Type: 'decimal', Notes: '' },
  { Column: 'net_claimed', Required: 'Yes', Type: 'decimal', Notes: 'Final claim after all deductions.' },
  { Column: 'currency', Required: 'Yes', Type: '3-letter ISO', Notes: 'e.g. SAR, USD, EUR.' },
  { Column: 'status', Required: 'Yes', Type: 'enum', Notes: 'One of: approved_internal, signed, issued, superseded, closed.' },
  { Column: 'approved_at', Required: 'No', Type: 'date', Notes: "Priority source for the posting event's postedAt." },
  { Column: 'signed_at', Required: 'No', Type: 'date', Notes: '' },
  { Column: 'issued_at', Required: 'No', Type: 'date', Notes: '' },
  { Column: 'description', Required: 'No', Type: 'text', Notes: 'Free-form annotation stored on the IPA.' },
];

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const format = parseExportFormat(url);
  const filename = `ipa_history_template.${format}`;

  if (format === 'csv') {
    return csvResponse(filename, buildCsv(HEADERS, SAMPLE_ROWS));
  }
  const wb = buildWorkbook([
    { name: 'Rows', headers: HEADERS, rows: SAMPLE_ROWS },
    {
      name: 'Instructions',
      headers: INSTRUCTIONS_HEADERS,
      rows: INSTRUCTIONS_ROWS,
    },
  ]);
  return xlsxResponse(filename, wb);
}
