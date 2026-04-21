/**
 * Project Budget export — management-grade XLSX, raw CSV.
 *
 *   GET /api/exports/budget?projectId=<uuid>&format=xlsx|csv
 *
 * The XLSX is a proper 4-sheet workbook laid out for the project-director
 * and finance-lead audience:
 *
 *   Summary
 *     Key-value block: project identity, generated-at, all budget KPIs,
 *     exception count + unresolved amount. Two-column (Metric / Value).
 *     Currency code shown next to amounts that are in the project currency.
 *     Frozen header, column widths sized for Excel/Numbers.
 *
 *   Budget Lines
 *     Line-level table with Category / Budget / Committed / Actual /
 *     Remaining / Variance / Notes. Amounts as real numbers with a
 *     SAR-suffixed number format so operators can re-sort and sum in Excel.
 *     Final row is a SUM totals row computed in-sheet. Frozen header row
 *     and AutoFilter across the data range.
 *
 *   Open Absorption Exceptions
 *     Every open exception on this project. Columns include category,
 *     source amount, reason, source record, project name + code, created-at.
 *     Header note reiterates that these amounts are EXCLUDED from totals.
 *     Frozen header + AutoFilter.
 *
 *   Missing Budget Lines
 *     Categories referenced by open `no_budget_line` exceptions but not
 *     configured as a budget line on this project. Per category: open
 *     exception count, affected amount, action note.
 *
 * CSV remains the raw extract — flattens to the Budget Lines rows only.
 *
 * Permission: project.view on the target project.
 */
import { accessControlService, getBudgetSummary } from '@fmksa/core';
import { prisma } from '@fmksa/db';
import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

import { auth } from '@/lib/auth';
import {
  buildCsv,
  csvResponse,
  numOrNull,
  parseExportFormat,
  xlsxResponse,
} from '@/lib/export-helpers';

import type { NextRequest } from 'next/server';

/** Excel number format — displays as e.g. "14,600,000.00 SAR". */
function sarFmt(currency: string): string {
  // Quotes escape literal characters; spaces inside the quoted section are safe.
  return `#,##0.00 "${currency}"`;
}

/** Plain 0/negatives-in-parens integer format for counts. */
const INT_FMT = '#,##0';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }
    const userId = session.user.id;

    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId');
    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId is required.' },
        { status: 400 },
      );
    }

    try {
      await accessControlService.requirePermission(
        userId,
        'project.view',
        projectId,
      );
    } catch {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    const [project, summary, exceptions] = await Promise.all([
      prisma.project.findUnique({
        where: { id: projectId },
        select: { code: true, name: true, currencyCode: true },
      }),
      getBudgetSummary(projectId),
      prisma.budgetAbsorptionException.findMany({
        where: { projectId, status: 'open' },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (!project) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }
    if (!summary) {
      return NextResponse.json(
        { error: 'No internal budget configured.' },
        { status: 404 },
      );
    }

    const currency = project.currencyCode;
    const amtFmt = sarFmt(currency);

    // Flat CSV path — operators wanting raw data, no layout.
    if (parseExportFormat(url) === 'csv') {
      const headers = [
        'Category',
        'Category Code',
        'Budget',
        'Committed',
        'Actual',
        'Remaining',
        'Variance',
        'Notes',
      ];
      const rows = summary.lines.map((l) => ({
        Category: l.categoryName,
        'Category Code': l.categoryCode,
        Budget: l.budgetAmount,
        Committed: l.committedAmount,
        Actual: l.actualAmount,
        Remaining: l.remainingAmount,
        Variance: l.varianceAmount,
        Notes: l.notes ?? '',
      }));
      const baseName = `${project.code}_budget_${new Date().toISOString().slice(0, 10)}`;
      return csvResponse(`${baseName}.csv`, buildCsv(headers, rows));
    }

    // ─── Resolve "missing budget lines" (no_budget_line exceptions) ───
    const missingMap = new Map<
      string,
      { code: string; count: number; total: number }
    >();
    for (const e of exceptions) {
      if (e.reasonCode !== 'no_budget_line') continue;
      const key = e.categoryCode ?? '';
      if (!key) continue;
      let m = missingMap.get(key);
      if (!m) {
        m = { code: key, count: 0, total: 0 };
        missingMap.set(key, m);
      }
      m.count += 1;
      const n = numOrNull(e.sourceAmount?.toString() ?? null);
      if (n !== null) m.total += n;
    }
    const missingCodes = Array.from(missingMap.keys());
    const cats = missingCodes.length
      ? await prisma.budgetCategory.findMany({
          where: { code: { in: missingCodes } },
          select: { code: true, name: true },
        })
      : [];
    const nameByCode = new Map(cats.map((c) => [c.code, c.name]));

    // Unresolved amount — sum of known source amounts on open exceptions.
    const unresolvedAmount = exceptions.reduce((acc, e) => {
      const n = numOrNull(e.sourceAmount?.toString() ?? null);
      return n == null ? acc : acc + n;
    }, 0);

    // ─── Build workbook ───────────────────────────────────────────────
    const wb = XLSX.utils.book_new();
    const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 16);

    // ── Sheet 1: Summary ───────────────────────────────────────────
    buildSummarySheet(wb, {
      projectName: project.name,
      projectCode: project.code,
      currency,
      generatedAt,
      summary,
      openExceptionCount: exceptions.length,
      unresolvedAmount,
      amtFmt,
    });

    // ── Sheet 2: Budget Lines ──────────────────────────────────────
    buildBudgetLinesSheet(wb, { summary, amtFmt });

    // ── Sheet 3: Open Absorption Exceptions ────────────────────────
    buildExceptionsSheet(wb, {
      project,
      exceptions,
      nameByCode,
      amtFmt,
    });

    // ── Sheet 4: Missing Budget Lines ──────────────────────────────
    buildMissingLinesSheet(wb, {
      missingMap,
      nameByCode,
      amtFmt,
    });

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const baseName = `${project.code}_budget_${new Date().toISOString().slice(0, 10)}`;
    return xlsxResponse(`${baseName}.xlsx`, buffer);
  } catch (err) {
    console.error('[exports/budget] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Export failed.' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Sheet builders
// ---------------------------------------------------------------------------

type SheetBook = XLSX.WorkBook;

/**
 * Set an Excel number format on a specific cell. The cell must already exist
 * on the sheet (aoa_to_sheet creates it). Returns the sheet for chainable use.
 */
function fmtCell(ws: XLSX.WorkSheet, ref: string, fmt: string) {
  const cell = ws[ref];
  if (cell && typeof cell === 'object' && 'v' in cell) {
    (cell as { z?: string }).z = fmt;
  }
}

/** Apply a format across a column range (e.g. col='C', fromRow=2, toRow=10). */
function fmtColumnRange(
  ws: XLSX.WorkSheet,
  col: string,
  fromRow: number,
  toRow: number,
  fmt: string,
) {
  for (let r = fromRow; r <= toRow; r++) {
    fmtCell(ws, `${col}${r}`, fmt);
  }
}

function buildSummarySheet(
  wb: SheetBook,
  args: {
    projectName: string;
    projectCode: string;
    currency: string;
    generatedAt: string;
    summary: NonNullable<Awaited<ReturnType<typeof getBudgetSummary>>>;
    openExceptionCount: number;
    unresolvedAmount: number;
    amtFmt: string;
  },
) {
  const {
    projectName,
    projectCode,
    currency,
    generatedAt,
    summary,
    openExceptionCount,
    unresolvedAmount,
    amtFmt,
  } = args;

  const aoa: (string | number)[][] = [
    ['Project Budget Report', ''],
    ['', ''],
    ['Project Name', projectName],
    ['Project Code', projectCode],
    ['Currency', currency],
    ['Generated At (UTC)', generatedAt],
    ['', ''],
    ['Internal Baseline', summary.internalBaseline],
    ['Internal Revised', summary.internalRevised],
    ['Contingency', summary.contingencyAmount],
    ['EI Reserve', summary.eiReserveTotal],
    ['Total Budgeted', summary.totalBudgeted],
    ['Committed', summary.totalCommitted],
    ['Actual', summary.totalActual],
    ['Remaining', summary.remainingBudget],
    ['Total Variance', summary.totalVariance],
    ['', ''],
    ['Open Absorption Exceptions', openExceptionCount],
    ['Unresolved Excluded Amount', unresolvedAmount],
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 34 }, { wch: 24 }];
  // Rows 8–16 are currency; 18 is int; 19 is currency.
  for (let r = 8; r <= 16; r++) fmtCell(ws, `B${r}`, amtFmt);
  fmtCell(ws, 'B18', INT_FMT);
  fmtCell(ws, 'B19', amtFmt);

  XLSX.utils.book_append_sheet(wb, ws, 'Summary');
}

function buildBudgetLinesSheet(
  wb: SheetBook,
  args: {
    summary: NonNullable<Awaited<ReturnType<typeof getBudgetSummary>>>;
    amtFmt: string;
  },
) {
  const { summary, amtFmt } = args;
  const headers = [
    'Category',
    'Category Code',
    'Budget',
    'Committed',
    'Actual',
    'Remaining',
    'Variance',
    'Notes',
  ];
  const aoa: (string | number)[][] = [headers];
  for (const l of summary.lines) {
    aoa.push([
      l.categoryName,
      l.categoryCode,
      l.budgetAmount,
      l.committedAmount,
      l.actualAmount,
      l.remainingAmount,
      l.varianceAmount,
      l.notes ?? '',
    ]);
  }
  // Totals row — live SUM formulas so Excel recomputes if a user edits a cell.
  const firstDataRow = 2;
  const lastDataRow = aoa.length; // header is row 1, data starts row 2
  const totalsRow = lastDataRow + 1;
  aoa.push([
    'Total',
    '',
    { f: `SUM(C${firstDataRow}:C${lastDataRow})` } as unknown as number,
    { f: `SUM(D${firstDataRow}:D${lastDataRow})` } as unknown as number,
    { f: `SUM(E${firstDataRow}:E${lastDataRow})` } as unknown as number,
    { f: `SUM(F${firstDataRow}:F${lastDataRow})` } as unknown as number,
    { f: `SUM(G${firstDataRow}:G${lastDataRow})` } as unknown as number,
    '',
  ]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 28 }, // Category
    { wch: 20 }, // Category Code
    { wch: 18 }, // Budget
    { wch: 18 }, // Committed
    { wch: 18 }, // Actual
    { wch: 18 }, // Remaining
    { wch: 18 }, // Variance
    { wch: 40 }, // Notes
  ];
  // Freeze header row + autofilter across header.
  ws['!views'] = [{ state: 'frozen', ySplit: 1 }];
  ws['!autofilter'] = { ref: `A1:H${totalsRow}` };
  // Number formats on C..G (amounts) across all data rows AND totals row.
  for (const col of ['C', 'D', 'E', 'F', 'G']) {
    fmtColumnRange(ws, col, firstDataRow, totalsRow, amtFmt);
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Budget Lines');
}

function buildExceptionsSheet(
  wb: SheetBook,
  args: {
    project: { code: string; name: string };
    exceptions: Awaited<
      ReturnType<typeof prisma.budgetAbsorptionException.findMany>
    >;
    nameByCode: Map<string, string>;
    amtFmt: string;
  },
) {
  const { project, exceptions, nameByCode, amtFmt } = args;
  // Title row above header so the "excluded from totals" note is obvious.
  const title =
    'Open absorption exceptions — amounts are EXCLUDED from the Summary / Budget Lines totals.';
  const headers = [
    'Reason',
    'Category',
    'Category Code',
    'Source Amount',
    'Status',
    'Source Record Type',
    'Source Record Id',
    'Severity',
    'Created At',
    'Project',
    'Project Code',
    'Absorption Type',
  ];
  const aoa: (string | number)[][] = [[title], [], headers];

  for (const e of exceptions) {
    aoa.push([
      e.reasonCode,
      e.categoryCode ? nameByCode.get(e.categoryCode) ?? e.categoryCode : '',
      e.categoryCode ?? '',
      numOrNull(e.sourceAmount?.toString() ?? null) ?? '',
      e.status,
      e.sourceRecordType,
      e.sourceRecordId,
      e.severity,
      e.createdAt.toISOString(),
      project.name,
      project.code,
      e.absorptionType,
    ]);
  }
  const headerRow = 3;
  const lastRow = aoa.length;

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 20 }, // Reason
    { wch: 24 }, // Category
    { wch: 20 }, // Category Code
    { wch: 18 }, // Source Amount
    { wch: 12 }, // Status
    { wch: 22 }, // Source Record Type
    { wch: 40 }, // Source Record Id
    { wch: 12 }, // Severity
    { wch: 22 }, // Created At
    { wch: 32 }, // Project
    { wch: 18 }, // Project Code
    { wch: 18 }, // Absorption Type
  ];
  // Merge the title across all columns.
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }];
  // Freeze header row (row 3 — title + blank + header); freeze after row 3.
  ws['!views'] = [{ state: 'frozen', ySplit: 3 }];
  if (exceptions.length > 0) {
    ws['!autofilter'] = { ref: `A${headerRow}:L${lastRow}` };
  }
  // Number format on Source Amount column (D).
  if (exceptions.length > 0) {
    fmtColumnRange(ws, 'D', headerRow + 1, lastRow, amtFmt);
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Open Exceptions');
}

function buildMissingLinesSheet(
  wb: SheetBook,
  args: {
    missingMap: Map<string, { code: string; count: number; total: number }>;
    nameByCode: Map<string, string>;
    amtFmt: string;
  },
) {
  const { missingMap, nameByCode, amtFmt } = args;
  const headers = [
    'Category',
    'Category Code',
    'Open Exceptions',
    'Affected Amount',
    'Action',
  ];
  const aoa: (string | number)[][] = [headers];
  for (const m of missingMap.values()) {
    aoa.push([
      nameByCode.get(m.code) ?? m.code,
      m.code,
      m.count,
      m.total,
      'Add budget line from project workspace, then resolve exception in Admin → Absorption Exceptions.',
    ]);
  }
  const lastRow = aoa.length;

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 28 }, // Category
    { wch: 20 }, // Category Code
    { wch: 16 }, // Open Exceptions
    { wch: 20 }, // Affected Amount
    { wch: 90 }, // Action
  ];
  ws['!views'] = [{ state: 'frozen', ySplit: 1 }];
  if (missingMap.size > 0) {
    ws['!autofilter'] = { ref: `A1:E${lastRow}` };
    fmtColumnRange(ws, 'C', 2, lastRow, INT_FMT);
    fmtColumnRange(ws, 'D', 2, lastRow, amtFmt);
  }
  XLSX.utils.book_append_sheet(wb, ws, 'Missing Budget Lines');
}
