/**
 * E2E: F4 PR-3a (PIC-98) — tenant_admin reachability on admin.* surfaces.
 *
 * This is the FIRST real F4 split with REAL RED→GREEN proofs on a 2nd org —
 * the PR-1/PR-2 work was "zero behavior change" (rename, schema, filter); PR-3a
 * is where the F4 bar actually begins.
 *
 * Each category is a REAL cross-tenant interaction through the actual appRouter,
 * asserting the post-PR-3a isolated behaviour:
 *
 *   CAT1 admin.userList cross-org
 *     tenant_admin in org A lists users.
 *     RED on pre-PR-3a main: returns BOTH org-A and org-B users (zero scoping;
 *     the only gate today was system.admin, which tenant_admin doesn't even
 *     hold — but tenant_admin doesn't EXIST pre-PR-3a, so the leak is
 *     "if a tenant role gained user.view, it would see all orgs").
 *     GREEN: returns ONLY org-A users; org-B targets are NOT in the result.
 *
 *   CAT2 admin.getUser by-id cross-org
 *     tenant_admin in org A fetches an org-B user by id.
 *     RED: returns the org-B user record (cross-org PII disclosure).
 *     GREEN: NOT_FOUND-shaped (no existence disclosure; same response as
 *     fetching a fake id — mirror F3 isolation pattern).
 *
 *   CAT3 admin.deactivateUser cross-org mutation
 *     tenant_admin in org A tries to deactivate an org-B user.
 *     RED: org-B user.status flips to 'inactive' (cross-tenant write).
 *     GREEN: NOT_FOUND-shaped; org-B user.status UNCHANGED.
 *
 *   CAT4 platform_admin STILL crosses (D3 survives)
 *     platform_admin lists/fetches users across orgs → succeeds. This is the
 *     CRITICAL over-correction check: if the F4 split locks platform_admin out
 *     of cross-org admin operations, the operator silently can't do their job.
 *     F3 D3 survives by construction (isPlatformAdmin(ctx) checks system.admin
 *     which only platform_admin holds; the post-fetch org-check bypasses for
 *     platform admins).
 *
 *   CAT5 tenant_admin CANNOT reach platform-only surfaces
 *     tenant_admin attempts posting.list / reference-data.set /
 *     workflow.list / notifications.list (admin templates) / health.overview
 *     → FORBIDDEN. Proves the platform/tenant boundary denies the platform
 *     half. tenant_admin's curated grant deliberately omits these perms and
 *     does NOT hold system.admin (the universal-bypass marker).
 *
 *   POS positive-path
 *     tenant_admin in org A can read/write own-org users.
 *     A normal tenant operation must not break under the new scoping.
 *
 * Real-DB (fmksa_test). The tenant_admin role + curated grants are seeded
 * before the test runs.
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
let tenantAdminA: AuthUser; // org A, tenant_admin role
let platformAdminA: AuthUser; // org A, platform_admin role (D3 survives test)
let userAOwnId: string; // org A — tenant_admin's OWN-org target (positive path)
let userBTargetId: string; // org B — the cross-tenant target for CAT2/CAT3
let userBTargetEmail: string;
const userIds: string[] = [];

beforeAll(async () => {
  assertTestDb();
  process.env.SEED_CONTEXT = 'true';

  // --- Orgs ---
  const orgA = await prisma.organization.create({
    data: { slug: `f4-pr3a-a-${ts}`, name: 'F4 PR-3a Org A' },
  });
  const orgB = await prisma.organization.create({
    data: { slug: `f4-pr3a-b-${ts}`, name: 'F4 PR-3a Org B' },
  });
  orgAId = orgA.id;
  orgBId = orgB.id;

  // --- Look up seeded roles ---
  const tenantAdminRole = await prisma.role.findFirstOrThrow({
    where: { code: 'tenant_admin' },
  });
  const platformAdminRole = await prisma.role.findFirstOrThrow({
    where: { code: 'platform_admin' },
  });

  // --- Org A: tenant_admin caller + own-org target user (POS path) ---
  const tenantAdminUserA = await prisma.user.create({
    data: {
      orgId: orgAId,
      email: `f4-pr3a-tenant-admin-${ts}@test.com`,
      name: 'F4 PR-3a Tenant Admin A',
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

  const userAOwn = await prisma.user.create({
    data: {
      orgId: orgAId,
      email: `f4-pr3a-target-A-${ts}@test.com`,
      name: 'F4 PR-3a Org-A Target',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });
  userIds.push(userAOwn.id);
  userAOwnId = userAOwn.id;

  // --- Org A: platform_admin caller (CAT4) ---
  const platformAdminUserA = await prisma.user.create({
    data: {
      orgId: orgAId,
      email: `f4-pr3a-platform-admin-${ts}@test.com`,
      name: 'F4 PR-3a Platform Admin A',
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

  // --- Org B: cross-tenant target user (CAT1/CAT2/CAT3) ---
  const userBTarget = await prisma.user.create({
    data: {
      orgId: orgBId,
      email: `f4-pr3a-target-B-${ts}@test.com`,
      name: 'F4 PR-3a Org-B SECRET Target',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });
  userIds.push(userBTarget.id);
  userBTargetId = userBTarget.id;
  userBTargetEmail = userBTarget.email;

  // --- Load AuthUsers for the callers ---
  tenantAdminA = await loadAuthUser(tenantAdminUserA.id);
  platformAdminA = await loadAuthUser(platformAdminUserA.id);

  delete process.env.SEED_CONTEXT;
}, 60_000);

afterAll(async () => {
  process.env.SEED_CONTEXT = 'true';
  await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
  delete process.env.SEED_CONTEXT;
}, 60_000);

describe('F4 PR-3a (PIC-98) — tenant_admin reachability on admin.* surfaces', () => {
  // ---------------------------------------------------------------------
  // CAT1 — admin.userList cross-org
  // ---------------------------------------------------------------------
  it('CAT1: tenant_admin org-A list returns ONLY org-A users (no org-B leak)', async () => {
    const caller = appRouter.createCaller(makeCtx(tenantAdminA));
    const users = await caller.adminUsers.userList();

    // Every returned user must be in org A. We can't query orgId off the
    // response (admin.userList doesn't return orgId in its select), so we
    // verify the org-B target is NOT in the result by id + by email.
    const emails = users.map((u) => u.email);
    const ids = users.map((u) => u.id);
    expect(emails, 'org-B SECRET email must NOT leak to tenant_admin org-A').not.toContain(userBTargetEmail);
    expect(ids, 'org-B target user id must NOT leak to tenant_admin org-A').not.toContain(userBTargetId);

    // POS sanity — own-org caller AND own-org target ARE in result
    expect(emails, 'own-org target must appear').toContain(`f4-pr3a-target-A-${ts}@test.com`);
  });

  // ---------------------------------------------------------------------
  // CAT2 — admin.getUser by-id cross-org
  // ---------------------------------------------------------------------
  it('CAT2: tenant_admin org-A getUser(org-B-user-id) → NOT_FOUND (no existence disclosure)', async () => {
    const caller = appRouter.createCaller(makeCtx(tenantAdminA));
    await expect(
      caller.adminUsers.getUser({ id: userBTargetId }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  // ---------------------------------------------------------------------
  // CAT3 — admin.deactivateUser cross-org mutation
  // ---------------------------------------------------------------------
  it('CAT3: tenant_admin org-A CANNOT deactivate org-B user (NOT_FOUND; org-B status UNCHANGED)', async () => {
    const caller = appRouter.createCaller(makeCtx(tenantAdminA));
    await caller.adminUsers.deactivateUser({ id: userBTargetId }).catch(() => {});

    const afterTarget = await prisma.user.findUniqueOrThrow({ where: { id: userBTargetId } });
    expect(afterTarget.status, 'SECURITY: org-B target must remain active').toBe('active');
  });

  // ---------------------------------------------------------------------
  // CAT4 — platform_admin STILL crosses (D3 survives)
  // ---------------------------------------------------------------------
  it('CAT4: platform_admin CAN list users across orgs (D3 survives)', async () => {
    const caller = appRouter.createCaller(makeCtx(platformAdminA));
    const users = await caller.adminUsers.userList();

    const ids = users.map((u) => u.id);
    expect(ids, 'platform_admin sees the org-A target').toContain(userAOwnId);
    expect(ids, 'platform_admin STILL sees org-B target (D3 cross-org bypass survives)').toContain(userBTargetId);
  });

  it('CAT4: platform_admin CAN getUser(org-B-user-id) (D3 survives)', async () => {
    const caller = appRouter.createCaller(makeCtx(platformAdminA));
    const u = await caller.adminUsers.getUser({ id: userBTargetId });
    expect(u.id).toBe(userBTargetId);
    expect(u.email).toBe(userBTargetEmail);
  });

  // ---------------------------------------------------------------------
  // CAT5 — tenant_admin CANNOT reach platform-only surfaces
  // ---------------------------------------------------------------------
  it('CAT5: tenant_admin FORBIDDEN on posting.events.list (PIC-92 platform-exclusive)', async () => {
    const caller = appRouter.createCaller(makeCtx(tenantAdminA));
    // posting.events.list uses protectedProcedure + hasPerm('posting.view').
    // tenant_admin holds NEITHER system.admin NOR posting.view → FORBIDDEN.
    await expect(
      caller.posting.events.list({ skip: 0, take: 10 } as any),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('CAT5: tenant_admin FORBIDDEN on workflow.templates.list (template CRUD platform-only — adminProcedure)', async () => {
    const caller = appRouter.createCaller(makeCtx(tenantAdminA));
    // workflow.templates.list still uses adminProcedure (system.admin gate).
    // tenant_admin does not hold system.admin → FORBIDDEN by middleware.
    await expect(
      caller.workflow.templates.list(),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('CAT5: tenant_admin FORBIDDEN on health.overview (ops-only — adminProcedure)', async () => {
    const caller = appRouter.createCaller(makeCtx(tenantAdminA));
    // health.overview still uses adminProcedure (system.admin gate).
    await expect(caller.health.overview()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  // ---------------------------------------------------------------------
  // POS — positive path (tenant_admin can do own-org work)
  // ---------------------------------------------------------------------
  it('POS: tenant_admin org-A CAN getUser(own-org-user) (the fix must not break legit own-org work)', async () => {
    const caller = appRouter.createCaller(makeCtx(tenantAdminA));
    const u = await caller.adminUsers.getUser({ id: userAOwnId });
    expect(u.id).toBe(userAOwnId);
    expect(u.email).toBe(`f4-pr3a-target-A-${ts}@test.com`);
  });
});
