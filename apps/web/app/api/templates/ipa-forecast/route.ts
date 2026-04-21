/**
 * IPA Forecast upload template — XLSX / CSV.
 *
 *   GET /api/templates/ipa-forecast?format=xlsx|csv
 *
 * Two-sheet XLSX:
 *   Rows         — header + 2 sample rows (ready to edit-and-upload)
 *   Instructions — column meanings, required/optional, type/format, notes
 *
 * Schema is locked to
 *   packages/core/src/import/validators/ipa-forecast.ts
 * so the template matches what the pipeline validates.
 */
import {
  buildCsv,
  buildWorkbook,
  csvResponse,
  parseExportFormat,
  xlsxResponse,
} from '@/lib/export-helpers';

import type { NextRequest } from 'next/server';

const HEADERS = ['period_number', 'period_start', 'forecast_amount', 'notes'];

const SAMPLE_ROWS = [
  {
    period_number: 1,
    period_start: '2026-02-01',
    forecast_amount: 4500000,
    notes: 'February 2026 forecast — baseline',
  },
  {
    period_number: 2,
    period_start: '2026-03-01',
    forecast_amount: 3000000,
    notes: '',
  },
];

const INSTRUCTIONS_HEADERS = ['Column', 'Required', 'Type', 'Notes'];
const INSTRUCTIONS_ROWS = [
  {
    Column: 'period_number',
    Required: 'Yes',
    Type: 'integer (>0)',
    Notes:
      'Unique per project. Duplicates against an existing IpaForecast on the target project block the row.',
  },
  {
    Column: 'period_start',
    Required: 'Yes',
    Type: 'date (yyyy-mm-dd preferred)',
    Notes:
      'First day of the forecast period. m/d/yyyy accepted but yyyy-mm-dd is preferred for clarity.',
  },
  {
    Column: 'forecast_amount',
    Required: 'Yes',
    Type: 'decimal (≥ 0)',
    Notes:
      'Thousand separators and currency symbols are tolerated but the cleaned value must parse as a non-negative decimal.',
  },
  {
    Column: 'notes',
    Required: 'No',
    Type: 'text',
    Notes: 'Free-form annotation stored on the IpaForecast record.',
  },
];

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const format = parseExportFormat(url);
  const filename = `ipa_forecast_template.${format}`;

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
