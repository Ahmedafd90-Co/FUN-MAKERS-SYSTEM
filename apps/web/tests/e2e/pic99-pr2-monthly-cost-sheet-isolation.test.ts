/**
 * E2E: PIC-99 PR-2 (M1) — Monthly Commercial Cost Sheet cross-tenant isolation.
 *
 * THE merge-bar test for PR-2: a portfolio-scope export must NEVER leak
 * another tenant's commercial financials into the downloaded file.
 *
 * Surface: REST route `GET /api/exports/monthly-cost-sheet`. PR-2's three-tier
 * resolution + the service-layer `expectedOrgId` filter together enforce:
 *
 *   Tier 1 — Platform-admin (system.admin):  cross-org;   raw explicit trusted
 *   Tier 2 — PMO-in-tenant (cross_project.read && !system.admin):
 *                                            org-bounded; explicit ∩ orgScoped
 *   Tier 3 — Assigned-only:                  assigned-only; explicit ∩ assigned
 *
 * Categories (PD ruling cfc36eab 3 — CSV format for decisive RED proofs):
 *
 *   CAT1 PMO no filter — workbook (CSV here) contains ONLY org-A projects.
 *     RED (unfixed): unbounded prisma.project.findMany returns ALL projects
 *                    across ALL tenants → org-B SECRET signal in CSV.
 *     GREEN (fixed): expectedOrgId=ctx.orgId scopes the service →
 *                    SECRET signal absent from CSV.
 *
 *   CAT2a PMO ?projectIds=<org-B-uuid> → 403.
 *     RED (unfixed): raw explicit list forwarded to service unbounded →
 *                    org-B data returned in 200 CSV.
 *     GREEN (fixed): service applies `where: {orgId: ctx.orgId, id IN [B]}`
 *                    → empty → route post-checks `projects.length === 0` → 403.
 *
 *   CAT2b Assigned-only ?projectIds=<org-A-uuid-NOT-assigned> → 403.
 *     Even within own tenant, you can't export a project you're not
 *     assigned to (route intersects with getAssignedProjectIds).
 *
 *   CAT3 Platform-admin ?projectIds=<org-B-uuid> → 200 + CSV has SECRET signal.
 *     D3 cross-org bypass survives — over-correction check.
 *
 *   POS-PMO PMO own-org no filter → 200 + CSV has org-A signal, NOT org-B.
 *   POS-ASSIGNED Assigned-only no filter → 200 + CSV has ONLY assigned project
 *     (NOT same-org-but-unassigned projects).
 *
 *   PERM-NEG User without commercial_dashboard.view → 403 (global gate unchanged).
 *
 *   SOFT-DELETE SEAM (PR-1 → PR-2):
 *     Pre: CSV contains forecast amount X for projectA2-period5.
 *     Soft-delete that forecast (set deletedAt in DB, mirror PR-1's
 *     deleteForecast pattern).
 *     Post: CSV no longer contains X for that row.
 *     DB still has the row (deletedAt != null) — audit trail preserved.
 *
 * Real-DB (fmksa_test). Roles seeded; `tenant_admin` (assigned-only proxy)
 * via SELLABLE auto-pickup; `platform_admin` via catch-all; PMO via a custom
 * test role granted `commercial_dashboard.view` + `cross_project.read`.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '@fmksa/db';
import { assertTestDb } from '../helpers/assert-test-db';
import { auth } from '@/lib/auth';
import { GET } from '@/app/api/exports/monthly-cost-sheet/route';
import { NextRequest } from 'next/server';

const ts = Date.now();
const ORG_B_SECRET = `PROJ-B-SECRET-${ts}`; // unique substring that MUST NOT leak

let orgAId: string;
let orgBId: string;
let entityAId: string;
let entityBId: string;
let projectA1Id: string; // org-A — assigned-user has access
let projectA2Id: string; // org-A — assigned-user does NOT have access
let projectBId: string;  // org-B — the SECRET target
let forecastA2Period5Id: string; // for the soft-delete seam test
const FORECAST_A2_P5_AMOUNT = '5012345'; // unique amount string for grep
const FORECAST_B_AMOUNT = '5999111';     // unique amount for org-B (must not appear in PMO CSV)

let pmoTestRoleId: string;
let noViewRoleId: string;
let pmoUserAId: string;
let platformAdminAId: string;
let assignedUserAId: string;
let noViewUserAId: string;
const userIds: string[] = [];

beforeAll(async () => {
  assertTestDb();
  process.env.SEED_CONTEXT = 'true';

  // --- Orgs ---
  const orgA = await prisma.organization.create({
    data: { slug: `pic99-pr2-a-${ts}`, name: 'PIC-99 PR-2 Org A' },
  });
  const orgB = await prisma.organization.create({
    data: { slug: `pic99-pr2-b-${ts}`, name: 'PIC-99 PR-2 Org B' },
  });
  orgAId = orgA.id;
  orgBId = orgB.id;

  // --- Currency ---
  await prisma.currency.upsert({
    where: { code: 'SAR' },
    update: {},
    create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
  });

  // --- Entities ---
  const entityA = await prisma.entity.create({
    data: { orgId: orgAId, code: `ENT-A-${ts}`, name: 'PR2 Ent A', type: 'parent', status: 'active' },
  });
  const entityB = await prisma.entity.create({
    data: { orgId: orgBId, code: `ENT-B-${ts}`, name: 'PR2 Ent B', type: 'parent', status: 'active' },
  });
  entityAId = entityA.id;
  entityBId = entityB.id;

  // --- Projects ---
  const projectA1 = await prisma.project.create({
    data: {
      orgId: orgAId, entityId: entityAId, code: `PROJ-A1-${ts}`, name: 'PR2 Project A1',
      status: 'active', currencyCode: 'SAR', startDate: new Date('2026-01-01'),
      createdBy: 'test', contractValue: 10000000,
    },
  });
  const projectA2 = await prisma.project.create({
    data: {
      orgId: orgAId, entityId: entityAId, code: `PROJ-A2-${ts}`, name: 'PR2 Project A2',
      status: 'active', currencyCode: 'SAR', startDate: new Date('2026-01-01'),
      createdBy: 'test', contractValue: 8000000,
    },
  });
  const projectB = await prisma.project.create({
    data: {
      orgId: orgBId, entityId: entityBId, code: ORG_B_SECRET, name: 'PR2 Project B SECRET',
      status: 'active', currencyCode: 'SAR', startDate: new Date('2026-01-01'),
      createdBy: 'test', contractValue: 9000000,
    },
  });
  projectA1Id = projectA1.id;
  projectA2Id = projectA2.id;
  projectBId = projectB.id;

  // --- Forecasts (unique amounts so grep is decisive) ---
  await prisma.ipaForecast.create({
    data: {
      orgId: orgAId, projectId: projectA1Id, periodNumber: 1,
      periodStart: new Date('2026-02-01'), forecastAmount: '1011111', currency: 'SAR', createdBy: 'test',
    },
  });
  const fa2 = await prisma.ipaForecast.create({
    data: {
      orgId: orgAId, projectId: projectA2Id, periodNumber: 5,
      periodStart: new Date('2026-06-01'), forecastAmount: FORECAST_A2_P5_AMOUNT, currency: 'SAR', createdBy: 'test',
    },
  });
  forecastA2Period5Id = fa2.id;
  await prisma.ipaForecast.create({
    data: {
      orgId: orgBId, projectId: projectBId, periodNumber: 1,
      periodStart: new Date('2026-02-01'), forecastAmount: FORECAST_B_AMOUNT, currency: 'SAR', createdBy: 'test',
    },
  });

  // --- Roles ---
  const platformAdminRole = await prisma.role.findFirstOrThrow({ where: { code: 'platform_admin' } });
  const tenantAdminRole = await prisma.role.findFirstOrThrow({ where: { code: 'tenant_admin' } });

  // Custom PMO role: commercial_dashboard.view + cross_project.read
  // (the union of perms that triggers Tier 2 PMO-in-tenant path).
  const commercialDashboardView = await prisma.permission.findFirstOrThrow({ where: { code: 'commercial_dashboard.view' } });
  const crossProjectRead = await prisma.permission.findFirstOrThrow({ where: { code: 'cross_project.read' } });
  const pmoRole = await prisma.role.create({
    data: { code: `pic99-pr2-pmo-${ts}`, name: 'PIC-99 PR-2 PMO Test', description: 'Tier 2 test', isSystem: false },
  });
  pmoTestRoleId = pmoRole.id;
  await prisma.rolePermission.createMany({
    data: [
      { roleId: pmoTestRoleId, permissionId: commercialDashboardView.id },
      { roleId: pmoTestRoleId, permissionId: crossProjectRead.id },
    ],
  });

  // No-view role: a synthetic empty-permissions role for the PERM-NEG case
  // (we need a user whose perms do NOT include commercial_dashboard.view).
  const noViewRole = await prisma.role.create({
    data: { code: `pic99-pr2-noview-${ts}`, name: 'PIC-99 PR-2 No-View', description: 'Perm-neg test', isSystem: false },
  });
  noViewRoleId = noViewRole.id;
  // intentionally NO RolePermission rows — bare role

  // --- Users ---
  const past = (days: number) => { const d = new Date(); d.setDate(d.getDate() - days); return d; };

  const platformAdminUser = await prisma.user.create({
    data: { orgId: orgAId, email: `pic99pr2-pa-${ts}@test.com`, name: 'PR2 Platform Admin', passwordHash: 'test', status: 'active' },
  });
  platformAdminAId = platformAdminUser.id;
  userIds.push(platformAdminAId);
  await prisma.userRole.create({
    data: { userId: platformAdminAId, roleId: platformAdminRole.id, effectiveFrom: past(10), assignedBy: 'test', assignedAt: new Date() },
  });

  const pmoUser = await prisma.user.create({
    data: { orgId: orgAId, email: `pic99pr2-pmo-${ts}@test.com`, name: 'PR2 PMO', passwordHash: 'test', status: 'active' },
  });
  pmoUserAId = pmoUser.id;
  userIds.push(pmoUserAId);
  await prisma.userRole.create({
    data: { userId: pmoUserAId, roleId: pmoTestRoleId, effectiveFrom: past(10), assignedBy: 'test', assignedAt: new Date() },
  });
  // PMO does NOT get project assignments — the cross_project.read perm
  // is what gives them portfolio access.

  // Assigned-only: tenant_admin role (which gives commercial_dashboard.view via
  // SELLABLE auto-pickup but NOT cross_project.read) + ProjectAssignment to A1 only.
  const assignedUser = await prisma.user.create({
    data: { orgId: orgAId, email: `pic99pr2-asn-${ts}@test.com`, name: 'PR2 Assigned', passwordHash: 'test', status: 'active' },
  });
  assignedUserAId = assignedUser.id;
  userIds.push(assignedUserAId);
  await prisma.userRole.create({
    data: { userId: assignedUserAId, roleId: tenantAdminRole.id, effectiveFrom: past(10), assignedBy: 'test', assignedAt: new Date() },
  });
  await prisma.projectAssignment.create({
    data: { projectId: projectA1Id, userId: assignedUserAId, roleId: tenantAdminRole.id, effectiveFrom: past(10), assignedBy: 'test', assignedAt: new Date() },
  });

  // No-view user
  const noViewUser = await prisma.user.create({
    data: { orgId: orgAId, email: `pic99pr2-nov-${ts}@test.com`, name: 'PR2 No-View', passwordHash: 'test', status: 'active' },
  });
  noViewUserAId = noViewUser.id;
  userIds.push(noViewUserAId);
  await prisma.userRole.create({
    data: { userId: noViewUserAId, roleId: noViewRoleId, effectiveFrom: past(10), assignedBy: 'test', assignedAt: new Date() },
  });

  delete process.env.SEED_CONTEXT;
}, 60_000);

afterAll(async () => {
  process.env.SEED_CONTEXT = 'true';
  // Clean test data (AuditLog is immutable; project/forecast deleteMany is OK)
  await prisma.ipaForecast.deleteMany({ where: { projectId: { in: [projectA1Id, projectA2Id, projectBId] } } });
  await prisma.projectAssignment.deleteMany({ where: { projectId: { in: [projectA1Id, projectA2Id, projectBId] } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.rolePermission.deleteMany({ where: { roleId: { in: [pmoTestRoleId, noViewRoleId] } } });
  await prisma.role.deleteMany({ where: { id: { in: [pmoTestRoleId, noViewRoleId] } } });
  await prisma.project.deleteMany({ where: { id: { in: [projectA1Id, projectA2Id, projectBId] } } });
  await prisma.entity.deleteMany({ where: { id: { in: [entityAId, entityBId] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
  delete process.env.SEED_CONTEXT;
}, 60_000);

// ---------------------------------------------------------------------
// Helper: invoke the REST GET handler with a mocked auth session
// ---------------------------------------------------------------------
async function callExport(opts: {
  userId: string;
  searchParams?: Record<string, string>;
}) {
  vi.mocked(auth).mockResolvedValueOnce({
    user: { id: opts.userId, email: 't', name: 't' },
    expires: '2099-01-01',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  const qs = new URLSearchParams(opts.searchParams ?? {});
  const url = `http://localhost/api/exports/monthly-cost-sheet?${qs.toString()}`;
  return await GET(new NextRequest(url));
}

describe('PIC-99 PR-2 (M1) — Monthly Cost Sheet cross-tenant isolation', () => {
  // -------------------------------------------------------------------
  // CAT1 — PMO no filter (the unbounded-portfolio leak)
  // -------------------------------------------------------------------
  it('CAT1: PMO org-A no filter → CSV contains org-A projects, NOT org-B SECRET signal', async () => {
    const res = await callExport({
      userId: pmoUserAId,
      searchParams: { format: 'csv', from: '2026-01', to: '2026-12', report: '2026-12' },
    });
    expect(res.status).toBe(200);
    const csv = await res.text();
    // ORG-A signals present (positive proof PMO sees own-org data)
    expect(csv, 'PMO must see own-org project codes').toContain(`PROJ-A1-${ts}`);
    expect(csv, 'PMO must see own-org project codes').toContain(`PROJ-A2-${ts}`);
    expect(csv, 'PMO must see own-org forecast amounts').toContain('1011111');
    // ORG-B SECRET MUST NOT appear (the load-bearing assertion)
    expect(csv, 'CAT1 RED→GREEN: org-B SECRET project code MUST NOT leak').not.toContain(ORG_B_SECRET);
    expect(csv, 'CAT1 RED→GREEN: org-B forecast amount MUST NOT leak').not.toContain(FORECAST_B_AMOUNT);
  });

  // -------------------------------------------------------------------
  // CAT2a — PMO ?projectIds=<org-B-uuid> → 403 (explicit cross-org rejected)
  // -------------------------------------------------------------------
  it('CAT2a: PMO org-A ?projectIds=<org-B-projectId> → 403 (intersection at service.where empties)', async () => {
    const res = await callExport({
      userId: pmoUserAId,
      searchParams: { format: 'csv', projectIds: projectBId },
    });
    expect(res.status, 'CAT2a RED→GREEN: 403, not 200 with org-B CSV').toBe(403);
  });

  it('CAT2a-shape: PMO org-A 403 response shape (no existence disclosure)', async () => {
    // Same 403 shape as "no accessible projects" — does not reveal whether
    // projectBId exists or whether it's cross-org. Defense-in-depth.
    const res = await callExport({
      userId: pmoUserAId,
      searchParams: { format: 'csv', projectIds: '00000000-0000-0000-0000-000000000000' },
    });
    expect(res.status).toBe(403);
  });

  // -------------------------------------------------------------------
  // CAT2b — Assigned-only ?projectIds=<unassigned-own-org> → 403
  // -------------------------------------------------------------------
  it('CAT2b: assigned-only org-A ?projectIds=<projectA2 (NOT assigned)> → 403 (route-level intersection empties)', async () => {
    const res = await callExport({
      userId: assignedUserAId,
      searchParams: { format: 'csv', projectIds: projectA2Id },
    });
    expect(res.status, 'CAT2b: even own-org, must be assigned').toBe(403);
  });

  // -------------------------------------------------------------------
  // CAT3 — Platform-admin crosses (D3 over-correction check)
  // -------------------------------------------------------------------
  it('CAT3: platform-admin ?projectIds=<org-B-projectId> → 200 + CSV has SECRET signal (D3 survives)', async () => {
    const res = await callExport({
      userId: platformAdminAId,
      searchParams: { format: 'csv', projectIds: projectBId, from: '2026-01', to: '2026-12', report: '2026-12' },
    });
    expect(res.status).toBe(200);
    const csv = await res.text();
    expect(csv, 'platform-admin must reach org-B with explicit list').toContain(ORG_B_SECRET);
    expect(csv, 'platform-admin sees org-B forecast amount').toContain(FORECAST_B_AMOUNT);
  });

  // -------------------------------------------------------------------
  // POS — PMO own-org no filter (positive path; same as CAT1 GREEN result)
  // -------------------------------------------------------------------
  it('POS-PMO: PMO no filter → returns ONLY own-org projects (counts match seeded org-A set)', async () => {
    const res = await callExport({
      userId: pmoUserAId,
      searchParams: { format: 'csv', from: '2026-01', to: '2026-12', report: '2026-12' },
    });
    expect(res.status).toBe(200);
    const csv = await res.text();
    const a1Count = (csv.match(new RegExp(`PROJ-A1-${ts}`, 'g')) ?? []).length;
    const a2Count = (csv.match(new RegExp(`PROJ-A2-${ts}`, 'g')) ?? []).length;
    expect(a1Count, 'each org-A project appears 12× (one per month) in CSV').toBeGreaterThan(0);
    expect(a2Count, 'each org-A project appears 12× (one per month) in CSV').toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------
  // POS — Assigned-only sees only assigned projects (not same-org-unassigned)
  // -------------------------------------------------------------------
  it('POS-ASSIGNED: assigned-only no filter → CSV contains ONLY A1 (assigned), NOT A2 (same-org-unassigned)', async () => {
    const res = await callExport({
      userId: assignedUserAId,
      searchParams: { format: 'csv', from: '2026-01', to: '2026-12', report: '2026-12' },
    });
    expect(res.status).toBe(200);
    const csv = await res.text();
    expect(csv).toContain(`PROJ-A1-${ts}`);
    expect(csv, 'unassigned same-org project MUST NOT appear').not.toContain(`PROJ-A2-${ts}`);
    expect(csv, 'org-B SECRET MUST NOT leak to assigned-only either').not.toContain(ORG_B_SECRET);
  });

  // -------------------------------------------------------------------
  // PERM-NEG — global permission gate
  // -------------------------------------------------------------------
  it('PERM-NEG: user without commercial_dashboard.view → 403 (global gate unchanged from PR #15)', async () => {
    const res = await callExport({
      userId: noViewUserAId,
      searchParams: { format: 'csv' },
    });
    expect(res.status).toBe(403);
  });

  // -------------------------------------------------------------------
  // SOFT-DELETE SEAM — PR-1 → PR-2 carry
  // -------------------------------------------------------------------
  it('SOFT-DELETE SEAM: soft-deleted forecast DROPS from CSV; DB row preserved with deletedAt!=null', async () => {
    // Pre: the seeded forecast for projectA2 period 5 must appear in CSV
    const pre = await callExport({
      userId: pmoUserAId,
      searchParams: { format: 'csv', from: '2026-01', to: '2026-12', report: '2026-12' },
    });
    expect(pre.status).toBe(200);
    const preCsv = await pre.text();
    expect(preCsv, 'forecast amount visible before soft-delete').toContain(FORECAST_A2_P5_AMOUNT);

    // Soft-delete the forecast (mirror PR-1's deleteForecast pattern: set
    // deletedAt + deletedBy; row stays for audit)
    await prisma.ipaForecast.update({
      where: { id: forecastA2Period5Id },
      data: { deletedAt: new Date(), deletedBy: 'test' },
    });

    // Post: amount drops from CSV (service filters deletedAt: null)
    const post = await callExport({
      userId: pmoUserAId,
      searchParams: { format: 'csv', from: '2026-01', to: '2026-12', report: '2026-12' },
    });
    expect(post.status).toBe(200);
    const postCsv = await post.text();
    // The forecast cell goes to "" (empty IPA Forecast column for that
    // project-month); the amount string MUST NOT appear.
    expect(postCsv, 'soft-deleted forecast amount MUST NOT appear in CSV').not.toContain(FORECAST_A2_P5_AMOUNT);

    // DB row preserved (audit trail honored by PR-1's soft-delete pattern)
    const dbRow = await prisma.ipaForecast.findUnique({ where: { id: forecastA2Period5Id } });
    expect(dbRow, 'soft-deleted row stays in DB').not.toBeNull();
    expect(dbRow!.deletedAt, 'deletedAt is set').not.toBeNull();
    expect(dbRow!.deletedBy, 'deletedBy is set').toBe('test');
    expect(dbRow!.forecastAmount.toString(), 'value preserved at soft-delete time').toBe(FORECAST_A2_P5_AMOUNT);
  });
});
