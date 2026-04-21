/**
 * Server-side helpers for XLSX and CSV exports.
 *
 * Centralises:
 *   - workbook building (one or many sheets per export)
 *   - CSV stringification (RFC-4180, minimal: quote cells containing
 *     comma / quote / CR / LF; escape quotes by doubling)
 *   - response framing with the right MIME and filename headers
 *
 * All exports run through these helpers so the download behaviour is
 * consistent across surfaces (Project Budget, Commercial Dashboard, IPA
 * Forecast, IPA Register, Absorption Exceptions).
 *
 * Library: `xlsx` (SheetJS community edition) — already a dependency of
 * @fmksa/core. We route all calls through that single dependency rather
 * than adding `exceljs` or PDF libs.
 */
import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

type Row = Record<string, unknown>;

export type SheetDef = {
  /** Sheet tab name. Trimmed to 31 chars per Excel's hard limit. */
  name: string;
  /**
   * Column headers in the order they should appear. Must be stable between
   * export runs — operators build integrations on top of these headers.
   */
  headers: string[];
  /** One object per row. Keys must match `headers` (missing keys render blank). */
  rows: Row[];
};

/**
 * Build an XLSX workbook buffer from one or more sheet definitions.
 */
export function buildWorkbook(sheets: SheetDef[]): Buffer {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const aoa: unknown[][] = [s.headers];
    for (const r of s.rows) {
      aoa.push(s.headers.map((h) => r[h] ?? ''));
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const tab = s.name.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, tab);
  }
  const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return out;
}

/**
 * Build a CSV string from a single sheet definition. Multi-sheet exports
 * are XLSX-only; CSV flattens to the first sheet.
 */
export function buildCsv(headers: string[], rows: Row[]): string {
  const esc = (v: unknown): string => {
    if (v == null) return '';
    const s = String(v);
    if (/[",\r\n]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const out: string[] = [];
  out.push(headers.map(esc).join(','));
  for (const r of rows) {
    out.push(headers.map((h) => esc(r[h])).join(','));
  }
  return out.join('\r\n');
}

/**
 * Wrap a workbook buffer in a download response with correct MIME + filename.
 */
export function xlsxResponse(filename: string, buffer: Buffer): NextResponse {
  const ab = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
  return new NextResponse(ab, {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${sanitizeFilename(filename)}"`,
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Wrap a CSV string in a download response. Prepends a BOM so Excel opens
 * UTF-8 correctly without mojibake.
 */
export function csvResponse(filename: string, csv: string): NextResponse {
  const BOM = '\uFEFF';
  return new NextResponse(BOM + csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${sanitizeFilename(filename)}"`,
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Validates the ?format= query param. Defaults to xlsx.
 */
export function parseExportFormat(
  url: URL,
): 'xlsx' | 'csv' {
  const f = url.searchParams.get('format')?.toLowerCase();
  return f === 'csv' ? 'csv' : 'xlsx';
}

function sanitizeFilename(name: string): string {
  // Strip path separators + control chars; keep it tight.
  return name.replace(/[\x00-\x1f/\\?%*:|"<>]/g, '_');
}

/** Convenience: format a Decimal/Prisma string as a plain number for XLSX. */
export function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}
