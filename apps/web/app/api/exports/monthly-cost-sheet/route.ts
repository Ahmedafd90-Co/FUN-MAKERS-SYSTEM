/**
 * Monthly Commercial Cost Sheet export — portfolio-scoped XLSX.
 *
 *   GET /api/exports/monthly-cost-sheet
 *     ?projectId=<uuid>    optional — narrow to a single project
 *     ?projectIds=a,b,c    optional — narrow to an explicit list
 *     ?from=YYYY-MM        optional — default: toMonth − 11 (trailing 12)
 *     ?to=YYYY-MM          optional — default: reportMonth
 *     ?report=YYYY-MM      optional — default: current UTC month
 *     ?format=xlsx|csv     default xlsx; csv flattens Raw Data (long form)
 *
 * Permission rule (portfolio mode):
 *   - User must hold `commercial_dashboard.view` globally (role-level).
 *   - Project set = (canReadAcrossProjects ? all : assignedProjects).
 *   - Explicit ?project(s)= filter is intersected with that set — a user
 *     cannot export projects they do not have access to.
 *   - An empty resulting project set returns 403 (not 200 empty) to make
 *     access-denied explicit.
 *
 * Output:
 *   Four-sheet workbook (Executive Summary, Monthly Project Matrix,
 *   Workflow Assumptions, Raw Data) built by monthly-cost-sheet-workbook.ts.
 *   CSV flattens to the Raw Data long form.
 */
import {
  accessControlService,
  getMonthlyCostSheet,
} from '@fmksa/core';
import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import {
  buildCsv,
  csvResponse,
  xlsxResponse,
} from '@/lib/export-helpers';
import { buildMonthlyCostSheetWorkbook } from '@/lib/monthly-cost-sheet-workbook';

import type { NextRequest } from 'next/server';

const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

function parseMonthParam(url: URL, key: string): string | undefined {
  const raw = url.searchParams.get(key);
  if (!raw) return undefined;
  if (!MONTH_REGEX.test(raw)) {
    throw new Error(`Invalid ${key} — expected YYYY-MM, got "${raw}".`);
  }
  return raw;
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }
    const userId = session.user.id;

    // ── Global permission check ────────────────────────────────────
    const hasView = await accessControlService.hasPermission(
      userId,
      'commercial_dashboard.view',
    );
    if (!hasView) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    const url = new URL(request.url);

    let fromMonth: string | undefined;
    let toMonth: string | undefined;
    let reportMonth: string | undefined;
    try {
      fromMonth = parseMonthParam(url, 'from');
      toMonth = parseMonthParam(url, 'to');
      reportMonth = parseMonthParam(url, 'report');
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Bad request.' },
        { status: 400 },
      );
    }

    // ── Resolve the project set ────────────────────────────────────
    const explicit: string[] = [];
    const single = url.searchParams.get('projectId');
    if (single) explicit.push(single);
    const csv = url.searchParams.get('projectIds');
    if (csv) {
      for (const id of csv.split(',').map((s) => s.trim()).filter(Boolean)) {
        explicit.push(id);
      }
    }

    const canReadAll = await accessControlService.canReadAcrossProjects(userId);
    let projectIds: string[] | undefined;

    if (canReadAll) {
      projectIds = explicit.length > 0 ? explicit : undefined; // undefined = all
    } else {
      const assigned = await accessControlService.getAssignedProjectIds(userId);
      if (explicit.length > 0) {
        const assignedSet = new Set(assigned);
        projectIds = explicit.filter((id) => assignedSet.has(id));
      } else {
        projectIds = assigned;
      }
      if (projectIds.length === 0) {
        return NextResponse.json(
          { error: 'No accessible projects for the current user.' },
          { status: 403 },
        );
      }
    }

    // ── Service call ───────────────────────────────────────────────
    const sheet = await getMonthlyCostSheet({
      ...(projectIds ? { projectIds } : {}),
      ...(fromMonth ? { fromMonth } : {}),
      ...(toMonth ? { toMonth } : {}),
      ...(reportMonth ? { reportMonth } : {}),
    });

    // ── CSV path: Raw Data long form only ─────────────────────────
    const format = url.searchParams.get('format')?.toLowerCase() === 'csv' ? 'csv' : 'xlsx';
    const baseName = `monthly-cost-sheet_${sheet.reportMonth}_${sheet.fromMonth}_to_${sheet.toMonth}`;

    if (format === 'csv') {
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
      const rows: Record<string, unknown>[] = [];
      for (const p of sheet.projects) {
        for (const mb of p.months) {
          rows.push({
            'Project Code': p.projectCode,
            'Project Name': p.projectName,
            Currency: p.currency,
            'Year-Month': mb.yearMonth,
            'IPA Forecast': mb.ipa.forecast ?? '',
            'IPA Achieved': mb.ipa.achieved,
            'IPA Diff': mb.ipa.diff ?? '',
            'IPA Achievement %': mb.ipa.diffPct ?? '',
            'IPC Certified': mb.ipc.achieved,
            'Invoiced (ex-VAT)': mb.invoicedExVat.achieved,
            'Invoiced (gross)': mb.invoicedGross.achieved,
            Collected: mb.collected.achieved,
          });
        }
      }
      return csvResponse(`${baseName}.csv`, buildCsv(headers, rows));
    }

    const buffer = await buildMonthlyCostSheetWorkbook(sheet);
    return xlsxResponse(`${baseName}.xlsx`, buffer);
  } catch (err) {
    console.error('[exports/monthly-cost-sheet] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Export failed.' },
      { status: 500 },
    );
  }
}
