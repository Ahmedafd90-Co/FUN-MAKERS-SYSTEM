/**
 * Project Budget export — XLSX / CSV.
 *
 *   GET /api/exports/budget?projectId=<uuid>&format=xlsx|csv
 *
 * XLSX contains four sheets:
 *   Summary              — header KPIs (baseline, revised, contingency, EI,
 *                          total budgeted, committed, actual, remaining,
 *                          total variance)
 *   Budget Lines         — one row per BudgetLine (category, budget, committed,
 *                          actual, remaining, variance, notes)
 *   Open Exceptions      — one row per open BudgetAbsorptionException
 *   Missing Budget Lines — categories surfaced by no_budget_line exceptions
 *                          that have no line on this project
 *
 * CSV flattens to the Budget Lines sheet only (the primary tabular view).
 *
 * Permission: project.view on the target project.
 */
import { accessControlService, getBudgetSummary } from '@fmksa/core';
import { prisma } from '@fmksa/db';
import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import {
  buildCsv,
  buildWorkbook,
  csvResponse,
  numOrNull,
  parseExportFormat,
  xlsxResponse,
} from '@/lib/export-helpers';

import type { NextRequest } from 'next/server';

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

    // ---- Sheet 1: Summary ----
    const summaryHeaders = ['Metric', 'Value', 'Currency'];
    const summaryRows: Record<string, unknown>[] = [
      { Metric: 'Internal Baseline', Value: summary.internalBaseline, Currency: currency },
      { Metric: 'Internal Revised', Value: summary.internalRevised, Currency: currency },
      { Metric: 'Contingency', Value: summary.contingencyAmount, Currency: currency },
      { Metric: 'EI Reserve', Value: summary.eiReserveTotal, Currency: currency },
      { Metric: 'Total Budgeted', Value: summary.totalBudgeted, Currency: currency },
      { Metric: 'Committed', Value: summary.totalCommitted, Currency: currency },
      { Metric: 'Actual', Value: summary.totalActual, Currency: currency },
      { Metric: 'Remaining', Value: summary.remainingBudget, Currency: currency },
      { Metric: 'Total Variance', Value: summary.totalVariance, Currency: currency },
    ];

    // ---- Sheet 2: Budget Lines ----
    const lineHeaders = [
      'Category',
      'Category Code',
      'Budget',
      'Committed',
      'Actual',
      'Remaining',
      'Variance',
      'Notes',
    ];
    const lineRows = summary.lines.map((l) => ({
      Category: l.categoryName,
      'Category Code': l.categoryCode,
      Budget: l.budgetAmount,
      Committed: l.committedAmount,
      Actual: l.actualAmount,
      Remaining: l.remainingAmount,
      Variance: l.varianceAmount,
      Notes: l.notes ?? '',
    }));

    // ---- Sheet 3: Open Exceptions ----
    const excHeaders = [
      'Category Code',
      'Absorption Type',
      'Reason',
      'Message',
      'Source Amount',
      'Severity',
      'Status',
      'Source Record Type',
      'Source Record Id',
      'Created At',
    ];
    const excRows = exceptions.map((e) => ({
      'Category Code': e.categoryCode ?? '',
      'Absorption Type': e.absorptionType,
      Reason: e.reasonCode,
      Message: e.message,
      'Source Amount': numOrNull(e.sourceAmount?.toString() ?? null) ?? '',
      Severity: e.severity,
      Status: e.status,
      'Source Record Type': e.sourceRecordType,
      'Source Record Id': e.sourceRecordId,
      'Created At': e.createdAt.toISOString(),
    }));

    // ---- Sheet 4: Missing Budget Lines ----
    // categories that appear on no_budget_line exceptions but have no
    // BudgetLine on this project. Aggregated per category.
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
    // Enrich with BudgetCategory name when available.
    const missingCodes = Array.from(missingMap.keys());
    const cats = missingCodes.length
      ? await prisma.budgetCategory.findMany({
          where: { code: { in: missingCodes } },
          select: { code: true, name: true },
        })
      : [];
    const nameByCode = new Map(cats.map((c) => [c.code, c.name]));
    const missingHeaders = ['Category', 'Category Code', 'Open Exceptions', 'Total Amount'];
    const missingRows = Array.from(missingMap.values()).map((m) => ({
      Category: nameByCode.get(m.code) ?? m.code,
      'Category Code': m.code,
      'Open Exceptions': m.count,
      'Total Amount': m.total,
    }));

    const format = parseExportFormat(url);
    const baseName = `${project.code}_budget_${new Date().toISOString().slice(0, 10)}`;

    if (format === 'csv') {
      return csvResponse(`${baseName}.csv`, buildCsv(lineHeaders, lineRows));
    }

    const wb = buildWorkbook([
      { name: 'Summary', headers: summaryHeaders, rows: summaryRows },
      { name: 'Budget Lines', headers: lineHeaders, rows: lineRows },
      { name: 'Open Exceptions', headers: excHeaders, rows: excRows },
      { name: 'Missing Budget Lines', headers: missingHeaders, rows: missingRows },
    ]);
    return xlsxResponse(`${baseName}.xlsx`, wb);
  } catch (err) {
    console.error('[exports/budget] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Export failed.' },
      { status: 500 },
    );
  }
}
