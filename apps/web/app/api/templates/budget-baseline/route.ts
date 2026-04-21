/**
 * Budget Baseline upload template — XLSX / CSV.
 *
 *   GET /api/templates/budget-baseline?format=xlsx|csv
 *
 * Two-sheet XLSX:
 *   Rows         — header row + 2 sample data rows (ready to edit-and-upload)
 *   Instructions — column meanings, required/optional status, type/format
 *
 * Schema is locked to
 *   packages/core/src/import/validators/budget-baseline.ts
 * to guarantee the template matches what the import pipeline actually
 * validates. Header names are exact — the validator normalizes to
 * snake_case lowercase but matching verbatim makes operator edits safer.
 *
 * No auth required — these templates describe the contract, not live data.
 */
import { NextResponse } from 'next/server';

import {
  buildCsv,
  buildWorkbook,
  csvResponse,
  parseExportFormat,
  xlsxResponse,
} from '@/lib/export-helpers';

import type { NextRequest } from 'next/server';

const HEADERS = [
  'category_code',
  'category_name',
  'budget_amount',
  'notes',
];

// Two representative rows so operators see the shape without having to
// read the instructions tab first. Codes come from the seed's default
// BudgetCategory set (packages/db/src/seed/budget-categories.ts).
const SAMPLE_ROWS = [
  {
    category_code: 'materials',
    category_name: 'Materials',
    budget_amount: 1500000,
    notes: 'Opening baseline from 2026-Q1 planning workshop',
  },
  {
    category_code: 'subcontractors',
    category_name: 'Subcontractors',
    budget_amount: 800000,
    notes: '',
  },
];

const INSTRUCTIONS_HEADERS = ['Column', 'Required', 'Type', 'Notes'];
const INSTRUCTIONS_ROWS = [
  {
    Column: 'category_code',
    Required: 'Yes',
    Type: 'text',
    Notes:
      'Must match an existing BudgetCategory.code (seeded codes: materials, subcontractors, manpower, travel, accommodation, supplies, equipment_and_plant, design_and_engineering, logistics, site_overheads, contingency, ei_reserve, other).',
  },
  {
    Column: 'category_name',
    Required: 'No',
    Type: 'text',
    Notes:
      "Informational only. Mismatches with the platform's category name raise a warning but don't block import.",
  },
  {
    Column: 'budget_amount',
    Required: 'Yes',
    Type: 'number (≥ 0, two decimals)',
    Notes:
      'Thousand separators and currency symbols are tolerated but the cleaned value must parse as a non-negative decimal.',
  },
  {
    Column: 'notes',
    Required: 'No',
    Type: 'text',
    Notes:
      'Free-form annotation. Stored on the BudgetLine and shown on the project workspace card.',
  },
];

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const format = parseExportFormat(url);
  const filename = `budget_baseline_template.${format}`;

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
