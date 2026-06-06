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
 * Permission + tenancy rules (PIC-99 PR-2 / PD ruling cfc36eab):
 *
 *   1. Global perm: `commercial_dashboard.view` (role-level).
 *
 *   2. Three-tier scope resolution:
 *
 *      Tier 1 — Platform-admin (holds `system.admin`):
 *        Cross-org operator. `expectedOrgId = null` passes through to
 *        the service; raw `?projectIds=` is trusted (D3 cross-org bypass).
 *        With no explicit list → service walks ALL projects globally.
 *
 *      Tier 2 — PMO-in-tenant (holds `cross_project.read` but NOT
 *      `system.admin`):
 *        Portfolio access bounded to OWN tenant. `expectedOrgId = ctx.orgId`,
 *        so the service applies `where.orgId = ctx.orgId` on the project
 *        list. Explicit `?projectIds=` IS forwarded to the service, but the
 *        service's where-clause intersects it with the org filter at the
 *        DB layer — so a request like `?projectIds=<org-B-uuid>` from an
 *        org-A PMO yields an empty result set (and the route returns 403,
 *        not 200 empty, to make access-denied explicit).
 *
 *      Tier 3 — Assigned-only (no portfolio permission):
 *        Project set is `getAssignedProjectIds(userId)` (transitively
 *        tenant-scoped via F3 — assignments only land within own org).
 *        Explicit `?projectIds=` is intersected with the assigned set
 *        AT THE ROUTE level (service doesn't know about assignments).
 *        Empty intersection → 403.
 *
 *   3. Empty resulting project set for non-platform-admin tiers → 403.
 *
 * Output:
 *   Four-sheet workbook (Executive Summary, Monthly Project Matrix,
 *   Workflow Assumptions, Raw Data) built by monthly-cost-sheet-workbook.ts.
 *   CSV flattens to the Raw Data long form.
 */
import {
  accessControlService,
  authService,
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

    // Single user load — gives us orgId + permissions in one query so the
    // three-tier resolution below is consistent (system.admin / cross_project.read /
    // commercial_dashboard.view all read from the same permission snapshot).
    const user = await authService.getUser(userId);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    // ── Global permission check ────────────────────────────────────
    if (!user.permissions.includes('commercial_dashboard.view')) {
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

    // ── Parse explicit project list ────────────────────────────────
    const explicit: string[] = [];
    const single = url.searchParams.get('projectId');
    if (single) explicit.push(single);
    const csv = url.searchParams.get('projectIds');
    if (csv) {
      for (const id of csv.split(',').map((s) => s.trim()).filter(Boolean)) {
        explicit.push(id);
      }
    }

    // ── Three-tier scope resolution (PD ruling cfc36eab 2a) ────────
    // Inline `hasPermission('system.admin')` per ruling 2b — same predicate
    // `isPlatformAdmin(ctx)` (the tRPC helper) computes. Must not drift.
    const isPlatformAdmin = user.permissions.includes('system.admin');
    const canReadAll = user.permissions.includes('cross_project.read');

    // expectedOrgId scopes the service's `prisma.project.findMany`. Non-null
    // means the service refuses to walk projects outside this org — defense
    // in depth, even if a future caller skips the route gate.
    const expectedOrgId: string | null = isPlatformAdmin ? null : user.orgId;

    let projectIds: string[] | undefined;

    if (isPlatformAdmin) {
      // Tier 1 — D3 cross-org operator. Raw explicit list trusted; undefined
      // = ALL projects globally.
      projectIds = explicit.length > 0 ? explicit : undefined;
    } else if (canReadAll) {
      // Tier 2 — PMO-in-tenant. expectedOrgId pins the service to ctx.orgId;
      // explicit is forwarded as-is, and the service's where-clause
      // intersects (`{orgId: ctx.orgId, id: {in: explicit}}`) at the DB layer.
      // An explicit list pointing at another tenant resolves to 0 rows,
      // which the post-call empty-result check below converts to 403.
      projectIds = explicit.length > 0 ? explicit : undefined;
    } else {
      // Tier 3 — Assigned-only. Intersection happens AT THE ROUTE because
      // the service doesn't know about ProjectAssignment.
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
      expectedOrgId,
      ...(projectIds ? { projectIds } : {}),
      ...(fromMonth ? { fromMonth } : {}),
      ...(toMonth ? { toMonth } : {}),
      ...(reportMonth ? { reportMonth } : {}),
    });

    // ── Empty-result 403 for non-platform-admin tiers ──────────────
    // Catches the PMO-with-cross-org-explicit case (service's
    // {orgId, id IN explicit} intersection yields []) and the assigned-only
    // path if a race emptied assignments mid-flight. Platform-admin gets
    // 200-empty for empty portfolios (cross-org operator can legitimately
    // query an empty universe).
    if (!isPlatformAdmin && sheet.projects.length === 0) {
      return NextResponse.json(
        { error: 'No accessible projects for the requested selection.' },
        { status: 403 },
      );
    }

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
