/**
 * IPA Forecast export — XLSX / CSV.
 *
 *   GET /api/exports/forecast?projectId=<uuid>&format=xlsx|csv
 *
 * XLSX sheets:
 *   Summary — Total Forecast / To-Date Forecast / Total Actual / Variance /
 *             Attainment / This-month block
 *   Periods — per-period forecast / actual / variance / IPA status
 *
 * CSV flattens to Periods.
 *
 * Permission: ipa_forecast.view (set by the forecast lane).
 */
import { accessControlService, getForecastVsActual } from '@fmksa/core';
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
        'ipa_forecast.view',
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

    const rollup = await getForecastVsActual(projectId);

    // ---- Sheet 1: Summary ----
    const summaryHeaders = ['Metric', 'Value', 'Currency'];
    const summaryRows: Record<string, unknown>[] = [
      { Metric: 'Total Forecast', Value: numOrNull(rollup.totalForecast) ?? '', Currency: project.currencyCode },
      { Metric: 'To-Date Forecast', Value: numOrNull(rollup.toDateForecast) ?? '', Currency: project.currencyCode },
      { Metric: 'Total Actual', Value: numOrNull(rollup.totalActual) ?? '', Currency: project.currencyCode },
      { Metric: 'To-Date Variance', Value: numOrNull(rollup.toDateVariance) ?? '', Currency: project.currencyCode },
      { Metric: 'To-Date Attainment %', Value: numOrNull(rollup.toDateAttainmentPercent) ?? '', Currency: '' },
      { Metric: 'This Month — Period', Value: rollup.thisMonth.periodNumber ?? '', Currency: '' },
      { Metric: 'This Month — Period Start', Value: rollup.thisMonth.periodStart ?? '', Currency: '' },
      { Metric: 'This Month — Forecast', Value: numOrNull(rollup.thisMonth.forecastAmount) ?? '', Currency: project.currencyCode },
      { Metric: 'This Month — Actual', Value: numOrNull(rollup.thisMonth.actualAmount) ?? '', Currency: project.currencyCode },
    ];

    // ---- Sheet 2: Periods ----
    const periodHeaders = [
      'Period',
      'Period Start',
      'Forecast',
      'Actual',
      'Variance',
      'IPA Status',
      'IPA Approved',
    ];
    const periodRows = rollup.periods.map((p) => ({
      Period: p.periodNumber,
      'Period Start': p.periodStart,
      Forecast: numOrNull(p.forecastAmount) ?? '',
      Actual: numOrNull(p.actualAmount) ?? '',
      Variance: numOrNull(p.variance) ?? '',
      'IPA Status': p.ipaStatus ?? '',
      'IPA Approved': p.ipaIsApproved ? 'yes' : 'no',
    }));

    const format = parseExportFormat(url);
    const baseName = `${project.code}_forecast_${new Date().toISOString().slice(0, 10)}`;

    if (format === 'csv') {
      return csvResponse(`${baseName}.csv`, buildCsv(periodHeaders, periodRows));
    }

    const wb = buildWorkbook([
      { name: 'Summary', headers: summaryHeaders, rows: summaryRows },
      { name: 'Periods', headers: periodHeaders, rows: periodRows },
    ]);
    return xlsxResponse(`${baseName}.xlsx`, wb);
  } catch (err) {
    console.error('[exports/forecast] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Export failed.' },
      { status: 500 },
    );
  }
}
