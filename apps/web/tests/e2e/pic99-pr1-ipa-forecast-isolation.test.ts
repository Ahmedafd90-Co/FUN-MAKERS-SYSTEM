/**
 * E2E: PIC-99 PR-1 (M1) — IpaForecast cross-tenant isolation.
 *
 * THE merge-bar test for PR-1: org-A user cannot reach an org-B forecast by id.
 *
 * Categories — REAL cross-tenant interactions through `appRouter.createCaller`:
 *
 *   CAT1 commercial.forecast.list cross-org
 *     tenant_admin in org A lists forecasts for project A.
 *     RED (without service-layer projectId scoping): would not leak project B
 *     forecasts directly via list (list is project-scoped via input.projectId
 *     and projectProcedure), but list ON project A must return ONLY project-A
 *     forecasts — proves the where-filter is intact.
 *     GREEN: returns ONLY project-A forecasts; project-B's forecast id is NOT
 *     in the result.
 *
 *   CAT2 commercial.forecast.get(id) cross-org — THE non-negotiable CAT4 proof
 *     tenant_admin in org A calls `forecast.get({projectId: projectA.id,
 *     id: orgB-forecast-id})`. Without assertProjectScope, the service would
 *     fetch and return the org-B forecast (cross-tenant data exfil). With
 *     assertProjectScope in `getForecast` (commercial/forecast/service.ts),
 *     the service throws ScopeMismatchError → router maps to NOT_FOUND.
 *     RED: returns the org-B forecast row.
 *     GREEN: NOT_FOUND-shaped (no existence disclosure; same shape as a
 *     non-existent or soft-deleted id — mirror F3 NOT_FOUND idiom).
 *
 *   CAT3 commercial.forecast.upsert/delete cross-org projectId
 *     tenant_admin in org A passes `projectId: projectB.id` to upsert/delete.
 *     projectProcedure (the chokepoint) rejects this with FORBIDDEN — the
 *     user has no project assignment in project B. This is the chokepoint
 *     gate, not the service-layer assert — it fires regardless of the new
 *     by-id path. POS sanity that the chokepoint is doing its job.
 *
 *   CAT4 D3 platform_admin STILL crosses
 *     platform_admin in org A calls `forecast.get({projectId: projectB.id,
 *     id: orgB-forecast-id})` — succeeds. platform_admin bypasses
 *     projectProcedure (system.admin marker), and assertProjectScope is
 *     comparing the forecast's projectId against the ORG-B projectId
 *     supplied by the caller — same value → no scope mismatch. The CRITICAL
 *     over-correction check: if PR-1 locked platform_admin out of cross-org
 *     forecasts, the operator silently can't do their job.
 *
 *   POS positive-path
 *     tenant_admin in org A: list / get / upsert / delete own-org forecast
 *     all succeed. Audit log captures create/update/delete actions.
 *     Soft-delete: deleteForecast sets deletedAt + deletedBy; the row is
 *     NOT physically removed; subsequent list/get exclude it.
 *
 * Real-DB (fmksa_test). Roles seeded; tenant_admin gets ipa_forecast.* via
 * SELLABLE_MODULE auto-pickup; platform_admin via the catch-all grant.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@fmksa/db';
import { assertTestDb } from '../helpers/assert-test-db';
import { makeCtx, loadAuthUser } from '../helpers/auth-test-callers';
import { appRouter } from '../../server/routers/_app';
import type { AuthUser } from '@fmksa/core';

const ts = Date.now();

function past(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

let orgAId: string;
let orgBId: string;
let entityAId: string;
let entityBId: string;
let projectAId: string;
let projectBId: string;
let forecastBId: string; // org B's forecast — the cross-tenant target
let tenantAdminA: AuthUser; // org A, tenant_admin role
let platformAdminA: AuthUser; // org A, platform_admin role (CAT4 D3 survives test)
const userIds: string[] = [];

beforeAll(async () => {
  assertTestDb();
  process.env.SEED_CONTEXT = 'true';

  // --- Orgs ---
  const orgA = await prisma.organization.create({
    data: { slug: `pic99-pr1-a-${ts}`, name: 'PIC-99 PR-1 Org A' },
  });
  const orgB = await prisma.organization.create({
    data: { slug: `pic99-pr1-b-${ts}`, name: 'PIC-99 PR-1 Org B' },
  });
  orgAId = orgA.id;
  orgBId = orgB.id;

  // --- Entities (Project FK requirement) ---
  const entityA = await prisma.entity.create({
    data: {
      orgId: orgAId,
      code: `ENT-A-${ts}`,
      name: 'PIC-99 PR-1 Entity A',
      type: 'parent',
      status: 'active',
    },
  });
  const entityB = await prisma.entity.create({
    data: {
      orgId: orgBId,
      code: `ENT-B-${ts}`,
      name: 'PIC-99 PR-1 Entity B',
      type: 'parent',
      status: 'active',
    },
  });
  entityAId = entityA.id;
  entityBId = entityB.id;

  // --- Currency (idempotent) ---
  await prisma.currency.upsert({
    where: { code: 'SAR' },
    update: {},
    create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
  });

  // --- Projects ---
  const projectA = await prisma.project.create({
    data: {
      orgId: orgAId,
      entityId: entityAId,
      code: `PROJ-A-${ts}`,
      name: 'PIC-99 PR-1 Project A',
      status: 'active',
      currencyCode: 'SAR',
      startDate: new Date('2026-01-01'),
      createdBy: 'test',
      contractValue: 10000000,
    },
  });
  const projectB = await prisma.project.create({
    data: {
      orgId: orgBId,
      entityId: entityBId,
      code: `PROJ-B-${ts}`,
      name: 'PIC-99 PR-1 Project B',
      status: 'active',
      currencyCode: 'SAR',
      startDate: new Date('2026-01-01'),
      createdBy: 'test',
      contractValue: 10000000,
    },
  });
  projectAId = projectA.id;
  projectBId = projectB.id;

  // --- Look up seeded roles ---
  const tenantAdminRole = await prisma.role.findFirstOrThrow({
    where: { code: 'tenant_admin' },
  });
  const platformAdminRole = await prisma.role.findFirstOrThrow({
    where: { code: 'platform_admin' },
  });

  // --- Org A: tenant_admin caller ---
  const tenantAdminUserA = await prisma.user.create({
    data: {
      orgId: orgAId,
      email: `pic99-pr1-tenant-admin-${ts}@test.com`,
      name: 'PIC-99 PR-1 Tenant Admin A',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });
  userIds.push(tenantAdminUserA.id);
  await prisma.userRole.create({
    data: {
      userId: tenantAdminUserA.id,
      roleId: tenantAdminRole.id,
      effectiveFrom: past(10),
      assignedBy: 'test',
      assignedAt: new Date(),
    },
  });
  // tenant_admin needs project assignment to pass projectProcedure for project A.
  await prisma.projectAssignment.create({
    data: {
      projectId: projectAId,
      userId: tenantAdminUserA.id,
      roleId: tenantAdminRole.id,
      effectiveFrom: past(10),
      assignedBy: 'test',
      assignedAt: new Date(),
    },
  });

  // --- Org A: platform_admin caller (CAT4 D3 survives) ---
  const platformAdminUserA = await prisma.user.create({
    data: {
      orgId: orgAId,
      email: `pic99-pr1-platform-admin-${ts}@test.com`,
      name: 'PIC-99 PR-1 Platform Admin A',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });
  userIds.push(platformAdminUserA.id);
  await prisma.userRole.create({
    data: {
      userId: platformAdminUserA.id,
      roleId: platformAdminRole.id,
      effectiveFrom: past(10),
      assignedBy: 'test',
      assignedAt: new Date(),
    },
  });

  // --- Org B: seed an active IpaForecast (the cross-tenant target) ---
  const forecastB = await prisma.ipaForecast.create({
    data: {
      orgId: orgBId,
      projectId: projectBId,
      periodNumber: 1,
      periodStart: new Date('2026-02-01'),
      forecastAmount: '5000000.00',
      currency: 'SAR',
      notes: 'SECRET org-B forecast — must NOT leak to org-A',
      createdBy: 'test',
    },
  });
  forecastBId = forecastB.id;

  // --- Load AuthUsers for callers ---
  tenantAdminA = await loadAuthUser(tenantAdminUserA.id);
  platformAdminA = await loadAuthUser(platformAdminUserA.id);

  delete process.env.SEED_CONTEXT;
}, 60_000);

afterAll(async () => {
  process.env.SEED_CONTEXT = 'true';
  // Hard-delete test data (test cleanup, not domain delete). NOTE: AuditLog
  // is immutable (no-delete-on-immutable middleware), so audit rows produced
  // by this test stay in the test DB — they're keyed by unique
  // resourceId/projectId so they don't collide between runs.
  await prisma.ipaForecast.deleteMany({ where: { OR: [{ projectId: projectAId }, { projectId: projectBId }] } });
  await prisma.projectAssignment.deleteMany({ where: { projectId: { in: [projectAId, projectBId] } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.project.deleteMany({ where: { id: { in: [projectAId, projectBId] } } });
  await prisma.entity.deleteMany({ where: { id: { in: [entityAId, entityBId] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
  delete process.env.SEED_CONTEXT;
}, 60_000);

describe('PIC-99 PR-1 (M1) — IpaForecast cross-tenant isolation', () => {
  // ---------------------------------------------------------------------
  // CAT1 — list cross-org
  // ---------------------------------------------------------------------
  it('CAT1: tenant_admin org-A list({projectId: projectA.id}) returns NO org-B forecasts', async () => {
    const caller = appRouter.createCaller(makeCtx(tenantAdminA));
    const rows = await caller.commercial.forecast.list({ projectId: projectAId });
    const ids = rows.map((r) => r.id);
    expect(ids, 'org-B SECRET forecast id must NOT appear in org-A list result').not.toContain(forecastBId);
  });

  // ---------------------------------------------------------------------
  // CAT2 — get(id) cross-org — THE non-negotiable CAT4 proof
  // ---------------------------------------------------------------------
  it('CAT2: tenant_admin org-A get({projectId: projectA.id, id: orgB-forecast-id}) → NOT_FOUND (no existence disclosure)', async () => {
    const caller = appRouter.createCaller(makeCtx(tenantAdminA));
    // The KEY isolation proof: org-A user passes their own projectId but a
    // foreign forecast id. Without assertProjectScope, the service returns
    // the org-B row (cross-tenant data exfil). With it, throws → NOT_FOUND.
    await expect(
      caller.commercial.forecast.get({ projectId: projectAId, id: forecastBId }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('CAT2: get-by-id with a non-existent forecast id → NOT_FOUND (response shape matches cross-org case)', async () => {
    // Same response shape for non-existent id vs cross-tenant id —
    // no existence disclosure (F3 idiom).
    const caller = appRouter.createCaller(makeCtx(tenantAdminA));
    await expect(
      caller.commercial.forecast.get({ projectId: projectAId, id: '00000000-0000-0000-0000-000000000000' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  // ---------------------------------------------------------------------
  // CAT3 — chokepoint rejects cross-org projectId at projectProcedure
  // ---------------------------------------------------------------------
  it('CAT3: tenant_admin org-A upsert with projectId=projectB.id → chokepoint rejects (FORBIDDEN)', async () => {
    // projectProcedure validates that ctx user has assignment in input.projectId.
    // Org-A user has assignment in projectA only. Passing projectB.id → FORBIDDEN.
    // This is BEFORE the service-layer assertProjectScope even runs — chokepoint
    // catches the cross-org attempt at the entry point. POS sanity for the
    // chokepoint gate; the assertProjectScope is the DEFENSE-IN-DEPTH for by-id reads.
    const caller = appRouter.createCaller(makeCtx(tenantAdminA));
    await expect(
      caller.commercial.forecast.upsert({
        projectId: projectBId,
        periodNumber: 99,
        periodStart: new Date('2026-12-01').toISOString(),
        forecastAmount: 9999,
        currency: 'SAR',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // Verify org-B forecast set is unchanged (no creation slipped through)
    const orgBForecastCount = await prisma.ipaForecast.count({ where: { projectId: projectBId } });
    expect(orgBForecastCount, 'org-B forecast count MUST remain unchanged (1 — the SECRET seeded row)').toBe(1);
  });

  // ---------------------------------------------------------------------
  // CAT4 — platform_admin STILL crosses (D3 survives)
  // ---------------------------------------------------------------------
  it('CAT4: platform_admin CAN get({projectId: projectB.id, id: orgB-forecast-id}) (D3 cross-org survives)', async () => {
    const caller = appRouter.createCaller(makeCtx(platformAdminA));
    // platform_admin holds system.admin → isPlatformAdmin(ctx) true →
    // projectProcedure bypasses project-assignment check. The service-layer
    // assertProjectScope is comparing forecast.projectId (= projectB.id)
    // vs the caller-supplied expectedProjectId (= projectB.id) — no mismatch.
    const f = await caller.commercial.forecast.get({ projectId: projectBId, id: forecastBId });
    expect(f.id).toBe(forecastBId);
    expect(f.projectId).toBe(projectBId);
    expect(f.notes).toBe('SECRET org-B forecast — must NOT leak to org-A');
  });

  // ---------------------------------------------------------------------
  // POS — own-org CRUD works
  // ---------------------------------------------------------------------
  it('POS: tenant_admin org-A can upsert + get + soft-delete own-org forecast (with audit on each action)', async () => {
    const caller = appRouter.createCaller(makeCtx(tenantAdminA));

    // CREATE
    const created = await caller.commercial.forecast.upsert({
      projectId: projectAId,
      periodNumber: 1,
      periodStart: new Date('2026-02-01').toISOString(),
      forecastAmount: 4500000,
      currency: 'SAR',
      notes: 'own-org forecast',
    });
    expect(created).toBeDefined();
    expect(created!.projectId).toBe(projectAId);
    // Per SR-Multi-Tenancy: during single-tenant phase, write paths rely on
    // the schema-level singleton @default for orgId (service code does NOT
    // yet supply orgId from ctx — that lands at multi-tenant cutover). The
    // CAT4 isolation property rests on projectId scoping, not orgId — see
    // assertProjectScope in commercial/forecast/service.ts.
    expect(created!.orgId).toBe('00000000-0000-0000-0000-000000000001');
    expect(created!.deletedAt).toBeNull();
    expect(created!.forecastAmount.toString()).toBe('4500000');

    // GET BY ID — own-org succeeds
    const fetched = await caller.commercial.forecast.get({
      projectId: projectAId,
      id: created!.id,
    });
    expect(fetched.id).toBe(created!.id);

    // UPDATE (composite-key upsert restores semantic) — different amount
    const updated = await caller.commercial.forecast.upsert({
      projectId: projectAId,
      periodNumber: 1,
      periodStart: new Date('2026-02-01').toISOString(),
      forecastAmount: 4600000,
      currency: 'SAR',
      notes: 'revised',
    });
    expect(updated!.id).toBe(created!.id); // same row (composite key)
    expect(updated!.forecastAmount.toString()).toBe('4600000');
    expect(updated!.updatedBy).toBe(tenantAdminA.id);

    // SOFT DELETE — sets deletedAt + deletedBy; row preserved
    await caller.commercial.forecast.delete({ projectId: projectAId, periodNumber: 1 });

    // Row is preserved with deletedAt set (raw DB query bypasses service filter)
    const softDeleted = await prisma.ipaForecast.findUnique({ where: { id: created!.id } });
    expect(softDeleted, 'soft-deleted row MUST still exist in DB').not.toBeNull();
    expect(softDeleted!.deletedAt, 'deletedAt MUST be set').not.toBeNull();
    expect(softDeleted!.deletedBy, 'deletedBy MUST be set to the actor').toBe(tenantAdminA.id);

    // get-by-id after soft-delete → NOT_FOUND (NOT_FOUND-shaped per F3)
    await expect(
      caller.commercial.forecast.get({ projectId: projectAId, id: created!.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    // list excludes soft-deleted rows
    const listAfter = await caller.commercial.forecast.list({ projectId: projectAId });
    expect(listAfter.map((r) => r.id), 'soft-deleted forecast MUST NOT appear in list').not.toContain(created!.id);

    // AUDIT — at least one create + one update + one delete action recorded
    const audit = await prisma.auditLog.findMany({
      where: { resourceType: 'ipa_forecast', resourceId: created!.id },
      orderBy: { createdAt: 'asc' },
    });
    const actions = audit.map((a) => a.action);
    expect(actions, 'audit must include ipa_forecast.create').toContain('ipa_forecast.create');
    expect(actions, 'audit must include ipa_forecast.update').toContain('ipa_forecast.update');
    expect(actions, 'audit must include ipa_forecast.delete').toContain('ipa_forecast.delete');
  });

  it('POS: upsert RESTORES a soft-deleted forecast (clears deletedAt; audits as ipa_forecast.restore — NOT .update)', async () => {
    const caller = appRouter.createCaller(makeCtx(tenantAdminA));

    // Create + soft-delete period 7
    const created = await caller.commercial.forecast.upsert({
      projectId: projectAId,
      periodNumber: 7,
      periodStart: new Date('2026-08-01').toISOString(),
      forecastAmount: 2000000,
      currency: 'SAR',
    });
    await caller.commercial.forecast.delete({ projectId: projectAId, periodNumber: 7 });

    // Re-upsert period 7 → restores soft-deleted row (compound unique slot was
    // still occupied by the soft-deleted row; this proves restore-not-insert).
    const restored = await caller.commercial.forecast.upsert({
      projectId: projectAId,
      periodNumber: 7,
      periodStart: new Date('2026-08-01').toISOString(),
      forecastAmount: 2500000,
      currency: 'SAR',
      notes: 'restored',
    });
    expect(restored!.id, 'restore returns the SAME id (preserved row, not a new insert)').toBe(created!.id);
    expect(restored!.deletedAt, 'restore clears deletedAt').toBeNull();
    expect(restored!.deletedBy, 'restore clears deletedBy').toBeNull();
    expect(restored!.forecastAmount.toString()).toBe('2500000');

    // CRITICAL ASSERTION (PD ruling 4a70d247 follow-up): the audit trail
    // must distinguish restore-from-soft-delete vs plain update. A reader
    // of the audit log seeing "create → delete → restore" understands the
    // lifecycle; "create → delete → update" would mislead about whether
    // the row was actually re-created vs simply edited.
    //
    // Strict-equality assert on the FULL action sequence proves:
    //   1. .restore was emitted (positive)
    //   2. .update was NOT emitted for the restore (negative — would be
    //      actions[2] === 'ipa_forecast.update')
    //   3. Order matches the operational story (create → delete → restore)
    const allAudit = await prisma.auditLog.findMany({
      where: { resourceType: 'ipa_forecast', resourceId: created!.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(
      allAudit.map((a) => a.action),
      'audit sequence MUST be create → delete → restore (NOT create → delete → update)',
    ).toEqual([
      'ipa_forecast.create',
      'ipa_forecast.delete',
      'ipa_forecast.restore',
    ]);
  });
});
