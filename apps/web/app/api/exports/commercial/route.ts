/**
 * Commercial Dashboard export — XLSX / CSV.
 *
 *   GET /api/exports/commercial?projectId=<uuid>&format=xlsx|csv
 *
 * XLSX sheets:
 *   Financial KPIs   — every supported KPI with its current value + currency
 *   Forecast Periods — per-period forecast, actual IPA, variance
 *   Register Summary — total + by-status counts per record family
 *   Variations       — every Variation with subtype / status / impact
 *
 * CSV flattens to Financial KPIs (primary summary).
 *
 * Permission: commercial_dashboard.view.
 */
import {
  accessControlService,
  getCommercialDashboard,
  getFinancialKpis,
  getForecastVsActual,
} from '@fmksa/core';
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
        'commercial_dashboard.view',
        projectId,
      );
    } catch {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { code: true, name: true, currencyCode: true },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }

    const [kpis, dashboard, forecast] = await Promise.all([
      getFinancialKpis(projectId),
      getCommercialDashboard(projectId),
      // Forecast may 403 if permission gate differs — we surface null on failure.
      getForecastVsActual(projectId).catch(() => null),
    ]);

    // ---- Sheet 1: Financial KPIs ----
    const kpiHeaders = ['KPI', 'Id', 'Value', 'Currency', 'Support'];
    const kpiRows: Record<string, unknown>[] = Object.entries(kpis.kpis).map(
      ([id, k]) => ({
        KPI: k.name,
        Id: id,
        Value: k.value == null ? '' : k.value,
        Currency: project.currencyCode,
        Support: k.supportStatus,
      }),
    );

    // ---- Sheet 2: Forecast Periods ----
    const fcHeaders = [
      'Period',
      'Period Start',
      'Forecast',
      'Actual',
      'Variance',
      'IPA Status',
      'IPA Approved',
    ];
    const fcRows = (forecast?.periods ?? []).map((p) => ({
      Period: p.periodNumber,
      'Period Start': p.periodStart,
      Forecast: numOrNull(p.forecastAmount) ?? '',
      Actual: numOrNull(p.actualAmount) ?? '',
      Variance: numOrNull(p.variance) ?? '',
      'IPA Status': p.ipaStatus ?? '',
      'IPA Approved': p.ipaIsApproved ? 'yes' : 'no',
    }));

    // ---- Sheet 3: Register Summary ----
    const regHeaders = ['Record Family', 'Total', 'By Status'];
    const regRows: Record<string, unknown>[] = [];
    const families = [
      ['IPA', 'ipa'],
      ['IPC', 'ipc'],
      ['Variation', 'variation'],
      ['Cost Proposal', 'costProposal'],
      ['Tax Invoice', 'taxInvoice'],
      ['Correspondence', 'correspondence'],
    ] as const;
    for (const [label, key] of families) {
      const s = (dashboard.registerSummary as any)[key] as
        | { total: number; byStatus: Record<string, number> }
        | undefined;
      if (!s) continue;
      const statusStr = Object.entries(s.byStatus)
        .map(([k, v]) => `${k}: ${v}`)
        .join('; ');
      regRows.push({
        'Record Family': label,
        Total: s.total,
        'By Status': statusStr,
      });
    }

    // ---- Sheet 4: Variations ----
    const variations = await prisma.variation.findMany({
      where: { projectId },
      select: {
        referenceNumber: true,
        subtype: true,
        status: true,
        costImpact: true,
        approvedCostImpact: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    const varHeaders = [
      'Reference',
      'Subtype',
      'Status',
      'Cost Impact',
      'Approved Cost Impact',
      'Created At',
    ];
    const varRows = variations.map((v) => ({
      Reference: v.referenceNumber ?? '',
      Subtype: v.subtype,
      Status: v.status,
      'Cost Impact': numOrNull(v.costImpact?.toString() ?? null) ?? '',
      'Approved Cost Impact':
        numOrNull(v.approvedCostImpact?.toString() ?? null) ?? '',
      'Created At': v.createdAt.toISOString(),
    }));

    const format = parseExportFormat(url);
    const baseName = `${project.code}_commercial_${new Date().toISOString().slice(0, 10)}`;

    if (format === 'csv') {
      return csvResponse(`${baseName}.csv`, buildCsv(kpiHeaders, kpiRows));
    }

    const wb = buildWorkbook([
      { name: 'Financial KPIs', headers: kpiHeaders, rows: kpiRows },
      { name: 'Forecast Periods', headers: fcHeaders, rows: fcRows },
      { name: 'Register Summary', headers: regHeaders, rows: regRows },
      { name: 'Variations', headers: varHeaders, rows: varRows },
    ]);
    return xlsxResponse(`${baseName}.xlsx`, wb);
  } catch (err) {
    console.error('[exports/commercial] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Export failed.' },
      { status: 500 },
    );
  }
}
