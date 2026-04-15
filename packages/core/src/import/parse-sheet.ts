/**
 * XLSX → row-array parser.
 *
 * Deliberately minimal:
 *   - Reads the first sheet only.
 *   - Uses SheetJS cell formatter to coerce dates/numbers to strings.
 *   - Returns raw objects keyed by header cell text. Normalization (trim,
 *     lowercase field names, number coercion) is the validator's job.
 *
 * No OCR, no AI, no external services. The only dep added to this package
 * for imports is `xlsx` (SheetJS).
 */

import * as XLSX from 'xlsx';

export interface SheetParseResult {
  sheetName: string;
  headers: string[];
  rows: Array<Record<string, unknown>>;
}

export function parseXlsx(bytes: Buffer | Uint8Array): SheetParseResult {
  // `type: 'buffer'` accepts Node Buffer or Uint8Array directly.
  const wb = XLSX.read(bytes, { type: 'buffer', cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    throw new Error('Workbook contains no sheets.');
  }
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    throw new Error(`Sheet '${sheetName}' could not be read.`);
  }

  // header: 1 gives us an array-of-arrays. We manually derive headers so that
  // duplicate or empty header cells surface as errors in the validator,
  // rather than silently losing columns under sheet_to_json's auto-rename.
  const aoa = XLSX.utils.sheet_to_json<Array<unknown>>(ws, {
    header: 1,
    raw: false,
    defval: '',
  });

  if (aoa.length === 0) {
    return { sheetName, headers: [], rows: [] };
  }

  const headerRow = aoa[0] ?? [];
  const headers = headerRow.map((h) =>
    h == null ? '' : String(h).trim(),
  );

  const rows: Array<Record<string, unknown>> = [];
  for (let r = 1; r < aoa.length; r++) {
    const row = aoa[r] ?? [];
    // Skip fully blank rows so trailing empties don't inflate totals.
    const hasAny = row.some(
      (v) => v != null && String(v).trim() !== '',
    );
    if (!hasAny) continue;

    const obj: Record<string, unknown> = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      if (!key) continue; // ignore unnamed columns
      const v = row[c];
      obj[key] = v == null ? '' : String(v).trim();
    }
    rows.push(obj);
  }

  return { sheetName, headers, rows };
}
