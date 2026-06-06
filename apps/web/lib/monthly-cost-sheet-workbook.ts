/**
 * Monthly Commercial Cost Sheet — exceljs workbook builder.
 *
 * 4 sheets:
 *   1. Executive Summary    — title, metadata, per-currency totals, warnings
 *   2. Monthly Project Matrix — the PAL-style core sheet (frozen, color-coded)
 *   3. Workflow Assumptions — static IPA → payment timing (25/7/28/7/2/28/14d)
 *   4. Raw Data             — machine-readable long form for audit / repivot
 *
 * Library: exceljs. Chosen over SheetJS Community edition so we can emit
 * cell fills and fonts — needed for the variance color signal on Sheet 2.
 * The rest of the exports in this app continue to use SheetJS CE via
 * `export-helpers.ts`; exceljs is intentionally scoped to this one report.
 *
 * Truth preservation:
 *   - Variance color on the matrix ONLY fires when a forecast exists
 *     (positive diff → ahead (soft green), negative diff → behind (soft
 *     amber), on-plan stays neutral). Cells without a forecast are neutral;
 *     we never color-code a row where the plan isn't known.
 *   - All amounts are real numbers (exceljs .value: number) with a currency
 *     number format — operators can re-sort / SUM in Excel.
 *   - Mixed-currency portfolios DO NOT get a single rolled-up row. Instead
 *     we emit one totals row per currency + a warning banner.
 */
import ExcelJS from 'exceljs';
import type {
  CurrencyTotals,
  MonthBlock,
  MonthlyCostSheet,
  ProjectRow,
} from '@fmksa/core';

// ---------------------------------------------------------------------------
// Styling palette — keep small, intentional
// ---------------------------------------------------------------------------

/** Header band (project identity + group headers). */
const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1F2937' }, // slate-800
};
const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: 'FFFFFFFF' },
  size: 11,
};

/** Sub-header (per-month column labels under the month group). */
const SUBHEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE5E7EB' }, // slate-200
};
const SUBHEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: 'FF111827' },
  size: 10,
};

/** Totals row — darker than subheader so it stands out at the bottom. */
const TOTALS_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF3F4F6' },
};
const TOTALS_FONT: Partial<ExcelJS.Font> = { bold: true, size: 11 };

const BEHIND_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFEF3C7' }, // amber-100
};
const AHEAD_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFD1FAE5' }, // emerald-100
};

const BORDER_THIN: ExcelJS.Border = {
  style: 'thin',
  color: { argb: 'FFD1D5DB' },
};
const ALL_BORDERS: Partial<ExcelJS.Borders> = {
  top: BORDER_THIN,
  left: BORDER_THIN,
  bottom: BORDER_THIN,
  right: BORDER_THIN,
};

const FMT_CURRENCY_BASE = '#,##0.00';
const FMT_PERCENT = '0.0%';

function fmtCurrency(currency: string): string {
  return `${FMT_CURRENCY_BASE} "${currency}"`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function num(s: string | null): number | null {
  if (s == null) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** Percent stored as a fraction (Excel `0.0%` format multiplies by 100). */
function pctAsFraction(s: string | null): number | null {
  if (s == null) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n / 100 : null;
}

// ---------------------------------------------------------------------------
// Workbook entry point
// ---------------------------------------------------------------------------

export async function buildMonthlyCostSheetWorkbook(
  sheet: MonthlyCostSheet,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Fun Makers KSA — Commercial Monthly Cost Sheet';
  wb.created = new Date();

  buildExecutiveSummarySheet(wb, sheet);
  buildMatrixSheet(wb, sheet);
  buildWorkflowSheet(wb, sheet);
  buildRawDataSheet(wb, sheet);

  // exceljs returns its own Buffer-like type; coerce via ArrayBuffer view.
  const raw = await wb.xlsx.writeBuffer();
  return Buffer.from(raw as ArrayBuffer);
}

// ---------------------------------------------------------------------------
// Sheet 1 — Executive Summary
// ---------------------------------------------------------------------------

function buildExecutiveSummarySheet(
  wb: ExcelJS.Workbook,
  sheet: MonthlyCostSheet,
): void {
  const ws = wb.addWorksheet('Executive Summary', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  ws.columns = [
    { width: 32 },
    { width: 22 },
    { width: 22 },
    { width: 22 },
    { width: 22 },
    { width: 22 },
  ];

  // Title
  ws.mergeCells('A1:F1');
  ws.getCell('A1').value = 'Commercial Monthly Cost Sheet';
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  ws.getCell('A1').fill = HEADER_FILL;
  ws.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' };
  ws.getRow(1).height = 26;

  // Metadata block
  ws.getCell('A3').value = 'Report Month';
  ws.getCell('B3').value = sheet.reportMonth;
  ws.getCell('A4').value = 'Range';
  ws.getCell('B4').value = `${sheet.fromMonth} → ${sheet.toMonth}`;
  ws.getCell('A5').value = 'Generated At (UTC)';
  ws.getCell('B5').value = sheet.generatedAt.replace('T', ' ').slice(0, 16);
  ws.getCell('A6').value = 'Project Count';
  ws.getCell('B6').value = sheet.projects.length;
  for (const r of [3, 4, 5, 6]) {
    ws.getCell(`A${r}`).font = { bold: true };
  }

  // Mixed-currency warning
  let cursor = 8;
  if (sheet.warnings.length > 0) {
    ws.mergeCells(`A${cursor}:F${cursor}`);
    ws.getCell(`A${cursor}`).value = 'Warnings';
    ws.getCell(`A${cursor}`).font = { bold: true, size: 12 };
    cursor += 1;
    for (const w of sheet.warnings) {
      ws.mergeCells(`A${cursor}:F${cursor}`);
      ws.getCell(`A${cursor}`).value = w;
      ws.getCell(`A${cursor}`).alignment = { wrapText: true };
      ws.getCell(`A${cursor}`).font = { italic: true, color: { argb: 'FF92400E' } };
      cursor += 1;
    }
    cursor += 1;
  }

  // Per-currency totals
  const currencies = Object.keys(sheet.currencyGroups).sort();
  for (const code of currencies) {
    const t = sheet.currencyGroups[code]!;
    ws.mergeCells(`A${cursor}:F${cursor}`);
    ws.getCell(`A${cursor}`).value = `${code} totals (${t.projectCount} project${t.projectCount === 1 ? '' : 's'})`;
    ws.getCell(`A${cursor}`).font = { bold: true, size: 12 };
    ws.getCell(`A${cursor}`).fill = SUBHEADER_FILL;
    cursor += 1;

    const fmt = fmtCurrency(code);
    const rows: Array<[string, string]> = [
      ['Contract Amount', t.contractAmount],
      ['Proposed Variation', t.proposedVariation],
      ['Approved Variation', t.approvedVariation],
      ['Anticipated Contract Amount', t.anticipatedContractAmount],
      ['Cumulative IPA Forecast', t.cumulative.ipaForecast],
      ['Cumulative IPA Achieved', t.cumulative.ipaAchieved],
      ['Cumulative IPC Certified', t.cumulative.ipcCertified],
      ['Cumulative Invoiced (ex-VAT)', t.cumulative.invoicedExVat],
      ['Cumulative Collected', t.cumulative.collected],
    ];
    for (const [label, val] of rows) {
      ws.getCell(`A${cursor}`).value = label;
      ws.getCell(`B${cursor}`).value = num(val) ?? 0;
      ws.getCell(`B${cursor}`).numFmt = fmt;
      cursor += 1;
    }
    cursor += 1;
  }

  // Footer note about definitions — operator trust aid
  cursor += 1;
  ws.mergeCells(`A${cursor}:F${cursor}`);
  ws.getCell(`A${cursor}`).value =
    'Definitions: IPA Achieved reuses total_claimed (status ∈ approved_internal/signed/issued/superseded/closed; includes imported-historical IPAs). IPC Certified = netCertified where status ∈ signed+. Invoiced on the matrix is EX-VAT; gross is in the Raw Data sheet. Approved Variation uses the VO-vs-CO split gate (VO: client_approved/closed; CO: approved_internal/signed/issued/closed).';
  ws.getCell(`A${cursor}`).alignment = { wrapText: true };
  ws.getCell(`A${cursor}`).font = { italic: true, size: 9, color: { argb: 'FF4B5563' } };
  ws.getRow(cursor).height = 60;
}

// ---------------------------------------------------------------------------
// Sheet 2 — Monthly Project Matrix (core)
// ---------------------------------------------------------------------------

const IDENTITY_COLS = 3; // Code, Name, Currency
const CONTRACT_COLS = 4; // Contract, Proposed Var, Approved Var, Anticipated
const PRIOR_COLS = 5;    // Prior-month: IPA Fc, IPA Ach, IPC, Inv, Coll
const MONTH_COLS = 7;    // IPA Plan, IPA Ach, IPA Diff, IPA %, IPC, Inv, Coll
const FIXED_LEFT_COLS = IDENTITY_COLS + CONTRACT_COLS + PRIOR_COLS;

function colLetter(idx1based: number): string {
  // 1 = A
  let n = idx1based;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function buildMatrixSheet(
  wb: ExcelJS.Workbook,
  sheet: MonthlyCostSheet,
): void {
  const ws = wb.addWorksheet('Monthly Project Matrix', {
    views: [
      // Freeze after identity block (col C = 3) + 3 header rows
      { state: 'frozen', xSplit: IDENTITY_COLS, ySplit: 3 },
    ],
  });

  const totalCols =
    FIXED_LEFT_COLS + sheet.months.length * MONTH_COLS;

  // ─── Row 1: super-group headers (merged bands) ───────────────────
  ws.mergeCells(1, 1, 1, IDENTITY_COLS);
  ws.getCell(1, 1).value = 'Project';
  ws.mergeCells(1, IDENTITY_COLS + 1, 1, IDENTITY_COLS + CONTRACT_COLS);
  ws.getCell(1, IDENTITY_COLS + 1).value = 'Contract & Variation';
  ws.mergeCells(
    1,
    IDENTITY_COLS + CONTRACT_COLS + 1,
    1,
    FIXED_LEFT_COLS,
  );
  ws.getCell(1, IDENTITY_COLS + CONTRACT_COLS + 1).value = `Up to ${priorMonthLabel(sheet.reportMonth)}`;
  for (let i = 0; i < sheet.months.length; i++) {
    const startCol = FIXED_LEFT_COLS + i * MONTH_COLS + 1;
    ws.mergeCells(1, startCol, 1, startCol + MONTH_COLS - 1);
    ws.getCell(1, startCol).value = sheet.monthLabels[i];
  }

  // ─── Row 2: sub-group headers (identity stays merged down; month
  //    band carries a single "IPA (plan/ach/diff/%)" + "IPC / Inv / Coll" hint) ───
  //    Keep it simple: leave row 2 empty and let row 3 carry the per-column labels.
  //    This gives visual breathing space after the heavy row 1.

  // ─── Row 3: per-column labels ───────────────────────────────────
  const labels: string[] = [];
  labels.push('Code', 'Name', 'Currency');
  labels.push('Contract', 'Proposed Var', 'Approved Var', 'Anticipated');
  labels.push(
    'IPA Fc (prior)',
    'IPA Ach (prior)',
    'IPC Cert (prior)',
    'Invoiced ex-VAT (prior)',
    'Collected (prior)',
  );
  for (let i = 0; i < sheet.months.length; i++) {
    labels.push(
      'IPA Plan',
      'IPA Ach',
      'IPA Diff',
      'IPA %',
      'IPC Cert',
      'Invoiced ex-VAT',
      'Collected',
    );
  }
  const row3 = ws.getRow(3);
  row3.values = labels;

  // Style all three header rows
  for (const r of [1, 2, 3]) {
    const row = ws.getRow(r);
    row.eachCell({ includeEmpty: false }, (cell) => {
      cell.font = r === 3 ? SUBHEADER_FONT : HEADER_FONT;
      cell.fill = r === 3 ? SUBHEADER_FILL : HEADER_FILL;
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = ALL_BORDERS;
    });
  }
  ws.getRow(1).height = 22;
  ws.getRow(3).height = 30;

  // Column widths
  const widths: number[] = [];
  widths.push(12, 32, 10);            // identity
  widths.push(16, 16, 16, 18);        // contract
  widths.push(14, 14, 14, 14, 14);    // prior
  for (let i = 0; i < sheet.months.length; i++) {
    widths.push(14, 14, 14, 10, 14, 14, 14); // per-month
  }
  ws.columns = widths.map((w) => ({ width: w }));

  // ─── Data rows ──────────────────────────────────────────────────
  let cursorRow = 4;
  for (const project of sheet.projects) {
    writeProjectRow(ws, cursorRow, project, sheet);
    cursorRow += 1;
  }

  // Per-currency totals rows at the bottom (no mixed rollup)
  const currencies = Object.keys(sheet.currencyGroups).sort();
  for (const code of currencies) {
    writeCurrencyTotalsRow(ws, cursorRow, sheet.currencyGroups[code]!, sheet);
    cursorRow += 1;
  }

  // Autofilter across the data band
  ws.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: Math.max(3, cursorRow - 1), column: totalCols },
  };
}

function priorMonthLabel(reportMonth: string): string {
  // Cheap: compute prior-month YYYY-MM and prettify
  const [y, m] = reportMonth.split('-').map(Number);
  const idx = y! * 12 + (m! - 1) - 1;
  const py = Math.floor(idx / 12);
  const pm = (idx % 12) + 1;
  const d = new Date(Date.UTC(py, pm - 1, 1));
  return d.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function writeProjectRow(
  ws: ExcelJS.Worksheet,
  rowIdx: number,
  p: ProjectRow,
  sheet: MonthlyCostSheet,
): void {
  const fmt = fmtCurrency(p.currency);

  // Identity
  ws.getCell(rowIdx, 1).value = p.projectCode;
  ws.getCell(rowIdx, 2).value = p.projectName;
  ws.getCell(rowIdx, 3).value = p.currency;

  // Contract & variation
  setMoney(ws, rowIdx, 4, p.contractAmount, fmt);
  setMoney(ws, rowIdx, 5, p.proposedVariation, fmt);
  setMoney(ws, rowIdx, 6, p.approvedVariation, fmt);
  setMoney(ws, rowIdx, 7, p.anticipatedContractAmount, fmt);

  // Prior-month totals
  setMoney(ws, rowIdx, 8, p.upToPriorMonth.ipaForecast, fmt);
  setMoney(ws, rowIdx, 9, p.upToPriorMonth.ipaAchieved, fmt);
  setMoney(ws, rowIdx, 10, p.upToPriorMonth.ipcCertified, fmt);
  setMoney(ws, rowIdx, 11, p.upToPriorMonth.invoicedExVat, fmt);
  setMoney(ws, rowIdx, 12, p.upToPriorMonth.collected, fmt);

  // Per-month blocks
  for (let i = 0; i < p.months.length; i++) {
    writeMonthBlock(ws, rowIdx, FIXED_LEFT_COLS + i * MONTH_COLS + 1, p.months[i]!, fmt);
  }

  // Row border polish
  for (let c = 1; c <= FIXED_LEFT_COLS + sheet.months.length * MONTH_COLS; c++) {
    ws.getCell(rowIdx, c).border = ALL_BORDERS;
  }
}

function writeMonthBlock(
  ws: ExcelJS.Worksheet,
  rowIdx: number,
  startCol: number,
  block: MonthBlock,
  fmt: string,
): void {
  // IPA Plan
  setMoney(ws, rowIdx, startCol, block.ipa.forecast, fmt);
  // IPA Achieved
  setMoney(ws, rowIdx, startCol + 1, block.ipa.achieved, fmt);
  // IPA Diff — colour-coded when forecast exists
  setMoney(ws, rowIdx, startCol + 2, block.ipa.diff, fmt);
  if (block.ipa.diff !== null) {
    const n = parseFloat(block.ipa.diff);
    if (n > 0) ws.getCell(rowIdx, startCol + 2).fill = AHEAD_FILL;
    else if (n < 0) ws.getCell(rowIdx, startCol + 2).fill = BEHIND_FILL;
  }
  // IPA %  (stored as fraction; format shows as e.g. 82.6%)
  const pct = pctAsFraction(block.ipa.diffPct);
  const pctCell = ws.getCell(rowIdx, startCol + 3);
  if (pct === null) {
    pctCell.value = '';
  } else {
    pctCell.value = pct;
    pctCell.numFmt = FMT_PERCENT;
  }
  if (block.ipa.diffPct !== null && block.ipa.forecast !== null) {
    // Colour the % the same as the diff — readability aid
    const n = parseFloat(block.ipa.diffPct);
    if (n > 100) pctCell.fill = AHEAD_FILL;
    else if (n < 100) pctCell.fill = BEHIND_FILL;
  }
  // IPC Cert / Invoiced ex-VAT / Collected
  setMoney(ws, rowIdx, startCol + 4, block.ipc.achieved, fmt);
  setMoney(ws, rowIdx, startCol + 5, block.invoicedExVat.achieved, fmt);
  setMoney(ws, rowIdx, startCol + 6, block.collected.achieved, fmt);
}

function writeCurrencyTotalsRow(
  ws: ExcelJS.Worksheet,
  rowIdx: number,
  t: CurrencyTotals,
  sheet: MonthlyCostSheet,
): void {
  const fmt = fmtCurrency(t.currency);
  ws.getCell(rowIdx, 1).value = '';
  ws.getCell(rowIdx, 2).value = `${t.currency} totals`;
  ws.getCell(rowIdx, 3).value = t.currency;
  setMoney(ws, rowIdx, 4, t.contractAmount, fmt);
  setMoney(ws, rowIdx, 5, t.proposedVariation, fmt);
  setMoney(ws, rowIdx, 6, t.approvedVariation, fmt);
  setMoney(ws, rowIdx, 7, t.anticipatedContractAmount, fmt);
  setMoney(ws, rowIdx, 8, zeroStrOrNull(t.cumulative.ipaForecast), fmt);
  setMoney(ws, rowIdx, 9, zeroStrOrNull(t.cumulative.ipaAchieved), fmt);
  setMoney(ws, rowIdx, 10, zeroStrOrNull(t.cumulative.ipcCertified), fmt);
  setMoney(ws, rowIdx, 11, zeroStrOrNull(t.cumulative.invoicedExVat), fmt);
  setMoney(ws, rowIdx, 12, zeroStrOrNull(t.cumulative.collected), fmt);

  for (let i = 0; i < t.months.length; i++) {
    writeMonthBlock(ws, rowIdx, FIXED_LEFT_COLS + i * MONTH_COLS + 1, t.months[i]!, fmt);
  }

  // Style as totals row
  const lastCol = FIXED_LEFT_COLS + sheet.months.length * MONTH_COLS;
  for (let c = 1; c <= lastCol; c++) {
    const cell = ws.getCell(rowIdx, c);
    cell.font = TOTALS_FONT;
    // Only apply totals-fill if cell doesn't already carry a variance color
    const existing = cell.fill as ExcelJS.Fill | undefined;
    const hasPattern = existing != null && existing.type === 'pattern';
    if (!hasPattern) {
      cell.fill = TOTALS_FILL;
    }
    cell.border = ALL_BORDERS;
  }
}

function zeroStrOrNull(s: string | null): string {
  return s ?? '0.00';
}

function setMoney(
  ws: ExcelJS.Worksheet,
  rowIdx: number,
  colIdx: number,
  value: string | null,
  fmt: string,
): void {
  const cell = ws.getCell(rowIdx, colIdx);
  const n = num(value);
  if (n === null) {
    cell.value = '';
    return;
  }
  cell.value = n;
  cell.numFmt = fmt;
}

// ---------------------------------------------------------------------------
// Sheet 3 — Workflow Assumptions
// ---------------------------------------------------------------------------

/**
 * Static IPA workflow timing from "ALL KSA PROJECT IPA -WF.pdf". Same cadence
 * is documented for SEV650, SEV651, SEV652, SEV655, SEV656, SEV657. SEV653 /
 * SEV654 (Madinah Mint, Tabuk Mint) are listed without times in the reference
 * document, so we render them as "Not documented" until a per-project schema
 * is added.
 *
 * This sheet is an ASSUMPTION sheet — it is not wired to any real data model.
 * Encoding per-project workflow dates + alerts is explicitly out of scope for
 * this lane (decided in Phase 1).
 */
const WORKFLOW_STAGES: Array<{ label: string; days: number | null; note: string }> = [
  { label: 'Pico Submission of Interim Application', days: null, note: 'Until 25th day of each month' },
  { label: '→ MC IPA Submission', days: 25, note: '25 days after Pico submission' },
  { label: '→ MC Payment Certificate from PMC/CC Approval', days: 7, note: '7 days after MC submission — day 1 of following month' },
  { label: '→ MC Payment Issuance to Pico', days: 28, note: 'within 28 days from the date of submission IPA' },
  { label: '→ Pico Tax Invoice Date', days: 7, note: '7 days from the date of the payment certificate to Main Contractor' },
  { label: '→ Employer / Client Payment for MC', days: 2, note: 'within 2 days from the date of Pico Payment Certificate' },
  { label: '→ Payment to Pico', days: 14, note: '14 days from the date of receipt of payment of Employer' },
];

function buildWorkflowSheet(
  wb: ExcelJS.Workbook,
  sheet: MonthlyCostSheet,
): void {
  const ws = wb.addWorksheet('Workflow Assumptions', {
    views: [{ state: 'frozen', ySplit: 2 }],
  });

  // Title
  ws.mergeCells('A1:D1');
  ws.getCell('A1').value = 'Interim Payment Application (IPA) — Timing Assumptions';
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  ws.getCell('A1').fill = HEADER_FILL;
  ws.getCell('A1').alignment = { vertical: 'middle' };
  ws.getRow(1).height = 24;

  // Header
  const headers = ['Stage', 'Time (days)', 'Rule', 'Cumulative'];
  ws.getRow(2).values = headers;
  ws.getRow(2).eachCell((cell) => {
    cell.font = SUBHEADER_FONT;
    cell.fill = SUBHEADER_FILL;
    cell.border = ALL_BORDERS;
  });
  ws.columns = [
    { width: 48 },
    { width: 14 },
    { width: 58 },
    { width: 18 },
  ];

  let cum = 0;
  let rowIdx = 3;
  for (const stage of WORKFLOW_STAGES) {
    ws.getCell(rowIdx, 1).value = stage.label;
    if (stage.days !== null) {
      ws.getCell(rowIdx, 2).value = stage.days;
      cum += stage.days;
      ws.getCell(rowIdx, 4).value = cum;
    } else {
      ws.getCell(rowIdx, 2).value = '';
      ws.getCell(rowIdx, 4).value = '';
    }
    ws.getCell(rowIdx, 3).value = stage.note;
    for (let c = 1; c <= 4; c++) ws.getCell(rowIdx, c).border = ALL_BORDERS;
    rowIdx += 1;
  }

  // Summary totals (from the PDF): 42 / 28 / 35 / 77 days
  rowIdx += 1;
  const summaryRows: Array<[string, number]> = [
    ['Total Time Bar — IPA → Payment Certificate to Pico', 42],
    ['Total Time Bar — Payment Certificate → Payment to Main Contractor', 28],
    ['Total Time Bar — Pico PC → Payment to Pico', 35],
    ['Total Time Bar — Pico IPA → Payment to Pico', 77],
  ];
  ws.mergeCells(`A${rowIdx}:D${rowIdx}`);
  ws.getCell(rowIdx, 1).value = 'Time Bar Summary';
  ws.getCell(rowIdx, 1).font = { bold: true, size: 12 };
  ws.getCell(rowIdx, 1).fill = SUBHEADER_FILL;
  rowIdx += 1;
  for (const [label, days] of summaryRows) {
    ws.mergeCells(`A${rowIdx}:C${rowIdx}`);
    ws.getCell(rowIdx, 1).value = label;
    ws.getCell(rowIdx, 4).value = days;
    for (let c = 1; c <= 4; c++) ws.getCell(rowIdx, c).border = ALL_BORDERS;
    rowIdx += 1;
  }

  // Footer
  rowIdx += 1;
  ws.mergeCells(`A${rowIdx}:D${rowIdx}`);
  ws.getCell(rowIdx, 1).value =
    'Assumption sheet — the cadence above is copied from the Pico Play KSA projects IPA workflow reference (Feb 2026 edition). Per-project overrides and overdue alerts are not encoded in the data model in this release.';
  ws.getCell(rowIdx, 1).font = { italic: true, size: 9, color: { argb: 'FF4B5563' } };
  ws.getCell(rowIdx, 1).alignment = { wrapText: true };
  ws.getRow(rowIdx).height = 40;

  // Reference: always emit report metadata so this sheet is self-describing
  rowIdx += 2;
  ws.getCell(rowIdx, 1).value = 'Report Month';
  ws.getCell(rowIdx, 2).value = sheet.reportMonth;
}

// ---------------------------------------------------------------------------
// Sheet 4 — Raw Data (long form)
// ---------------------------------------------------------------------------

function buildRawDataSheet(wb: ExcelJS.Workbook, sheet: MonthlyCostSheet): void {
  const ws = wb.addWorksheet('Raw Data', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  const headers = [
    'Project Code',
    'Project Name',
    'Currency',
    'Year-Month',
    'IPA Forecast',
    'IPA Achieved',
    'IPA Diff',
    'IPA Achievement %',
    'IPC Certified',
    'Invoiced (ex-VAT)',
    'Invoiced (gross)',
    'Collected',
  ];
  ws.getRow(1).values = headers;
  ws.getRow(1).eachCell((cell) => {
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = ALL_BORDERS;
  });
  ws.columns = [
    { width: 14 },
    { width: 32 },
    { width: 10 },
    { width: 12 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 14 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
  ];

  let rowIdx = 2;
  for (const p of sheet.projects) {
    const fmt = fmtCurrency(p.currency);
    for (const mb of p.months) {
      ws.getCell(rowIdx, 1).value = p.projectCode;
      ws.getCell(rowIdx, 2).value = p.projectName;
      ws.getCell(rowIdx, 3).value = p.currency;
      ws.getCell(rowIdx, 4).value = mb.yearMonth;
      setMoney(ws, rowIdx, 5, mb.ipa.forecast, fmt);
      setMoney(ws, rowIdx, 6, mb.ipa.achieved, fmt);
      setMoney(ws, rowIdx, 7, mb.ipa.diff, fmt);
      const pct = pctAsFraction(mb.ipa.diffPct);
      if (pct !== null) {
        ws.getCell(rowIdx, 8).value = pct;
        ws.getCell(rowIdx, 8).numFmt = FMT_PERCENT;
      } else {
        ws.getCell(rowIdx, 8).value = '';
      }
      setMoney(ws, rowIdx, 9, mb.ipc.achieved, fmt);
      setMoney(ws, rowIdx, 10, mb.invoicedExVat.achieved, fmt);
      setMoney(ws, rowIdx, 11, mb.invoicedGross.achieved, fmt);
      setMoney(ws, rowIdx, 12, mb.collected.achieved, fmt);
      for (let c = 1; c <= headers.length; c++) {
        ws.getCell(rowIdx, c).border = ALL_BORDERS;
      }
      rowIdx += 1;
    }
  }

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, rowIdx - 1), column: headers.length },
  };
}
