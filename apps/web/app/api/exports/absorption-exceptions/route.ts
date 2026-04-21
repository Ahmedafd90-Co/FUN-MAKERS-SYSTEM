/**
 * Absorption Exceptions export — XLSX / CSV.
 *
 *   GET /api/exports/absorption-exceptions?projectId=<uuid>&format=xlsx|csv
 *       (optional: &status=open|resolved|all, default=open)
 *
 * One sheet: every BudgetAbsorptionException matching the filter on the
 * target project, with the truth-snapshot columns populated by the
 * absorbers (sourceAmount, categoryCode).
 *
 * Permission: project.view (consistent with the banner's openExceptions query).
 */
import { accessControlService } from '@fmksa/core';
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
    const statusParam = url.searchParams.get('status') ?? 'open';
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

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { code: true },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }

    const where: Record<string, unknown> = { projectId };
    if (statusParam === 'open') where.status = 'open';
    else if (statusParam === 'resolved') where.status = 'resolved';
    // 'all' → no status filter

    const exceptions = await prisma.budgetAbsorptionException.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Resolve category names for display (categoryCode is stored; name is
    // derived from BudgetCategory.code in one small batched lookup).
    const codes = Array.from(
      new Set(exceptions.map((e) => e.categoryCode).filter((c): c is string => !!c)),
    );
    const cats = codes.length
      ? await prisma.budgetCategory.findMany({
          where: { code: { in: codes } },
          select: { code: true, name: true },
        })
      : [];
    const nameByCode = new Map(cats.map((c) => [c.code, c.name]));

    const headers = [
      'Category',
      'Category Code',
      'Absorption Type',
      'Reason',
      'Message',
      'Source Amount',
      'Source Record Type',
      'Source Record Id',
      'Severity',
      'Status',
      'Created At',
      'Resolved At',
      'Resolution Note',
    ];
    const rows = exceptions.map((e) => ({
      Category: e.categoryCode ? nameByCode.get(e.categoryCode) ?? '' : '',
      'Category Code': e.categoryCode ?? '',
      'Absorption Type': e.absorptionType,
      Reason: e.reasonCode,
      Message: e.message,
      'Source Amount': numOrNull(e.sourceAmount?.toString() ?? null) ?? '',
      'Source Record Type': e.sourceRecordType,
      'Source Record Id': e.sourceRecordId,
      Severity: e.severity,
      Status: e.status,
      'Created At': e.createdAt.toISOString(),
      'Resolved At': e.resolvedAt?.toISOString() ?? '',
      'Resolution Note': e.resolutionNote ?? '',
    }));

    const format = parseExportFormat(url);
    const baseName = `${project.code}_absorption_exceptions_${statusParam}_${new Date().toISOString().slice(0, 10)}`;

    if (format === 'csv') {
      return csvResponse(`${baseName}.csv`, buildCsv(headers, rows));
    }
    const wb = buildWorkbook([{ name: 'Exceptions', headers, rows }]);
    return xlsxResponse(`${baseName}.xlsx`, wb);
  } catch (err) {
    console.error('[exports/absorption-exceptions] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Export failed.' },
      { status: 500 },
    );
  }
}
