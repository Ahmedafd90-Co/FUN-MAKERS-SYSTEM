/**
 * IPA Register export — XLSX / CSV.
 *
 *   GET /api/exports/ipa?projectId=<uuid>&format=xlsx|csv
 *
 * One sheet: every IPA on the project with reference / period / amounts /
 * status / origin / created date. Matches the register view's columns.
 *
 * Permission: ipa.view (falls back to project.view + commercial scope).
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
    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId is required.' },
        { status: 400 },
      );
    }

    try {
      await accessControlService.requirePermission(
        userId,
        'ipa.view',
        projectId,
      );
    } catch {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { code: true, currencyCode: true },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }

    const ipas = await prisma.ipa.findMany({
      where: { projectId },
      orderBy: [{ periodNumber: 'asc' }, { createdAt: 'desc' }],
    });

    const headers = [
      'Reference',
      'Period',
      'Period From',
      'Period To',
      'Gross Amount',
      'Retention Rate',
      'Retention Amount',
      'Previous Certified',
      'Current Claim',
      'Advance Recovery',
      'Other Deductions',
      'Net Claimed',
      'Currency',
      'Status',
      'Origin',
      'Created At',
    ];
    const rows = ipas.map((i) => ({
      Reference: i.referenceNumber ?? '',
      Period: i.periodNumber ?? '',
      'Period From': i.periodFrom?.toISOString().slice(0, 10) ?? '',
      'Period To': i.periodTo?.toISOString().slice(0, 10) ?? '',
      'Gross Amount': numOrNull(i.grossAmount?.toString() ?? null) ?? '',
      'Retention Rate':
        numOrNull(i.retentionRate?.toString() ?? null) ?? '',
      'Retention Amount':
        numOrNull(i.retentionAmount?.toString() ?? null) ?? '',
      'Previous Certified':
        numOrNull(i.previousCertified?.toString() ?? null) ?? '',
      'Current Claim': numOrNull(i.currentClaim?.toString() ?? null) ?? '',
      'Advance Recovery':
        numOrNull(i.advanceRecovery?.toString() ?? null) ?? '',
      'Other Deductions':
        numOrNull(i.otherDeductions?.toString() ?? null) ?? '',
      'Net Claimed': numOrNull(i.netClaimed?.toString() ?? null) ?? '',
      Currency: i.currency,
      Status: i.status,
      Origin: i.origin,
      'Created At': i.createdAt.toISOString(),
    }));

    const format = parseExportFormat(url);
    const baseName = `${project.code}_ipas_${new Date().toISOString().slice(0, 10)}`;

    if (format === 'csv') {
      return csvResponse(`${baseName}.csv`, buildCsv(headers, rows));
    }
    const wb = buildWorkbook([{ name: 'IPAs', headers, rows }]);
    return xlsxResponse(`${baseName}.xlsx`, wb);
  } catch (err) {
    console.error('[exports/ipa] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Export failed.' },
      { status: 500 },
    );
  }
}
