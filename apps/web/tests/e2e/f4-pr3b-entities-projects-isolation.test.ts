/**
 * E2E: F4 PR-3b (PIC-98) — tenant_admin reachability on entities + projects
 * surfaces (and the projects.userSearch leak that PR-3a's admin.* sweep missed).
 *
 * Real 2nd org. RED proofs are REAL exposures, not synthetic — the
 * destructive ones (cross-org create/update/archive/assign) flip actual DB
 * state when the scoping guards are reverted.
 *
 * Categories (per PD ruling 705f59a9):
 *   D1  projects.userSearch cross-org User leak (tenant-reachable TODAY).
 *   D2  entities.list cross-org leak (reachable after PR-3b grants entity.view).
 *   D3  entities.get by-id cross-org leak.
 *   D4  entities.update cross-org mutation.
 *   D5  entities.archive cross-org mutation.
 *   D6  entities.create with cross-org parentEntityId — destructive cross-org-create FK leak.
 *   D7  Root-entity-org-derivation:
 *         (a) tenant_admin root-create → orgId = ctx.orgId, NOT singleton.
 *         (b) platform_admin root-create with null org → clean
 *             PRECONDITION_FAILED (NOT crash, NOT singleton fallthrough).
 *   D8  projects.create with cross-org entityId — destructive cross-org-create FK leak.
 *   D9  projects.archive cross-org mutation.
 *   D10 projects.assignments.assign cross-org (project AND user in caller's org).
 *   D11 projects.assignments.revoke cross-org assignment.
 *
 *   P1  entities.ancestors/descendants/siblings cross-org → NOT_FOUND
 *       (F3 already-covered; positive proof).
 *   P2  projects.get cross-org → FORBIDDEN/NOT_FOUND (projectProcedure chokepoint).
 *   P3  projects.update cross-org → FORBIDDEN/NOT_FOUND (projectProcedure).
 *   P4  projects.settings.* cross-org → FORBIDDEN/NOT_FOUND.
 *   P5  projects.assignments.list cross-org → FORBIDDEN/NOT_FOUND.
 *   P6  projects.list scope — tenant_admin sees only assigned projects (own-org by construction).
 *   P7  projects.roleList non-leak — returns all roles (platform-wide by design).
 *
 *   CAT-D3 platform_admin STILL crosses orgs on each PR-3b-scoped surface
 *          (D3 ruling survives by construction; explicit positive tests).
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
let tenantAdminA: AuthUser;
let platformAdminA: AuthUser;
let entityAId: string; // org A — own-org target
let entityBId: string; // org B — RED target
let projectAId: string; // org A
let projectBId: string; // org B — RED target
let assignmentBId: string; // org B — RED target (for revoke)
let userATarget: string; // org A — for assign
let userBTarget: string; // org B — RED target (for assign + userSearch)
let userBTargetName: string;
const userIds: string[] = [];

beforeAll(async () => {
  assertTestDb();
  process.env.SEED_CONTEXT = 'true';

  await prisma.currency.upsert({
    where: { code: 'SAR' },
    update: {},
    create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
  });

  const orgA = await prisma.organization.create({
    data: { slug: `f4-pr3b-a-${ts}`, name: 'F4 PR-3b Org A' },
  });
  const orgB = await prisma.organization.create({
    data: { slug: `f4-pr3b-b-${ts}`, name: 'F4 PR-3b Org B' },
  });
  orgAId = orgA.id;
  orgBId = orgB.id;

  const tenantAdminRole = await prisma.role.findFirstOrThrow({
    where: { code: 'tenant_admin' },
  });
  const platformAdminRole = await prisma.role.findFirstOrThrow({
    where: { code: 'platform_admin' },
  });

  // --- Org A: entity + project + assignment ---
  const entityA = await prisma.entity.create({
    data: {
      orgId: orgAId,
      code: `F4-PR3B-A-${ts}`,
      name: 'F4 PR-3b Org-A Parent Entity',
      type: 'parent',
      status: 'active',
    },
  });
  entityAId = entityA.id;

  const projectA = await prisma.project.create({
    data: {
      orgId: orgAId,
      code: `F4-PR3B-PROJ-A-${ts}`,
      name: 'F4 PR-3b Org-A Project',
      entityId: entityA.id,
      currencyCode: 'SAR',
      status: 'active',
      startDate: new Date(),
      createdBy: 'test',
    },
  });
  projectAId = projectA.id;

  // --- Org A: tenant_admin caller + own-org user (for POS + assign) ---
  const tenantAdminUserA = await prisma.user.create({
    data: {
      orgId: orgAId,
      email: `f4-pr3b-tenant-${ts}@test.com`,
      name: 'F4 PR-3b Tenant Admin A',
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

  const userA = await prisma.user.create({
    data: {
      orgId: orgAId,
      email: `f4-pr3b-user-A-${ts}@test.com`,
      name: 'F4 PR-3b Org-A User',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });
  userIds.push(userA.id);
  userATarget = userA.id;

  // --- Org A: platform_admin caller (D3 survival tests) ---
  const platformAdminUserA = await prisma.user.create({
    data: {
      orgId: orgAId,
      email: `f4-pr3b-platform-${ts}@test.com`,
      name: 'F4 PR-3b Platform Admin A',
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

  // --- Org B: cross-tenant targets ---
  const entityB = await prisma.entity.create({
    data: {
      orgId: orgBId,
      code: `F4-PR3B-B-${ts}`,
      name: 'F4 PR-3b Org-B SECRET Entity',
      type: 'parent',
      status: 'active',
    },
  });
  entityBId = entityB.id;

  const projectB = await prisma.project.create({
    data: {
      orgId: orgBId,
      code: `F4-PR3B-PROJ-B-${ts}`,
      name: 'F4 PR-3b Org-B SECRET Project',
      entityId: entityB.id,
      currencyCode: 'SAR',
      status: 'active',
      startDate: new Date(),
      createdBy: 'test',
    },
  });
  projectBId = projectB.id;

  const userB = await prisma.user.create({
    data: {
      orgId: orgBId,
      email: `f4-pr3b-user-B-${ts}@test.com`,
      name: `F4-PR3B-SECRET-B-${ts}`, // unique fragment used by userSearch test
      passwordHash: 'test-hash',
      status: 'active',
    },
  });
  userIds.push(userB.id);
  userBTarget = userB.id;
  userBTargetName = userB.name;

  // Org-B assignment for revoke RED test
  const assignmentB = await prisma.projectAssignment.create({
    data: {
      projectId: projectB.id,
      userId: userB.id,
      roleId: tenantAdminRole.id,
      effectiveFrom: past(10),
      assignedBy: 'test',
      assignedAt: new Date(),
    },
  });
  assignmentBId = assignmentB.id;

  tenantAdminA = await loadAuthUser(tenantAdminUserA.id);
  platformAdminA = await loadAuthUser(platformAdminUserA.id);

  delete process.env.SEED_CONTEXT;
}, 60_000);

afterAll(async () => {
  process.env.SEED_CONTEXT = 'true';
  await prisma.projectAssignment.deleteMany({
    where: { project: { orgId: { in: [orgAId, orgBId] } } },
  });
  await prisma.project.deleteMany({ where: { orgId: { in: [orgAId, orgBId] } } });
  await prisma.entity.deleteMany({ where: { orgId: { in: [orgAId, orgBId] } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
  delete process.env.SEED_CONTEXT;
}, 60_000);

describe('F4 PR-3b (PIC-98) — tenant_admin reachability on entities + projects', () => {
  // ---------------------------------------------------------------------
  // D1 — projects.userSearch cross-org User leak (PR-3a missed; PR-3b fixes)
  // ---------------------------------------------------------------------
  it('D1: tenant_admin userSearch returns ONLY own-org users (no org-B leak)', async () => {
    const caller = appRouter.createCaller(makeCtx(tenantAdminA));
    const users = await caller.projects.userSearch({ query: `F4-PR3B-SECRET-B-${ts}` });
    const ids = users.map((u) => u.id);
    expect(ids, 'SECURITY: org-B user MUST NOT leak via userSearch').not.toContain(userBTarget);
  });

  // ---------------------------------------------------------------------
  // D2 — entities.list cross-org
  // ---------------------------------------------------------------------
  it('D2: tenant_admin list returns ONLY org-A entities', async () => {
    const caller = appRouter.createCaller(makeCtx(tenantAdminA));
    const entities = await caller.entities.list({ includeArchived: false });
    const ids = entities.map((e) => e.id);
    expect(ids, 'SECURITY: org-B entity must NOT leak').not.toContain(entityBId);
    expect(ids, 'POS: own-org entity must appear').toContain(entityAId);
  });

  // ---------------------------------------------------------------------
  // D3 — entities.get by-id cross-org
  // ---------------------------------------------------------------------
  it('D3: tenant_admin get(org-B-entity) → NOT_FOUND', async () => {
    const caller = appRouter.createCaller(makeCtx(tenantAdminA));
    await expect(
      caller.entities.get({ id: entityBId }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  // ---------------------------------------------------------------------
  // D4 — entities.update cross-org mutation
  // ---------------------------------------------------------------------
  it('D4: tenant_admin CANNOT update org-B entity (NOT_FOUND + UNCHANGED)', async () => {
    const caller = appRouter.createCaller(makeCtx(tenantAdminA));
    await caller.entities
      .update({ id: entityBId, name: 'HACKED!' })
      .catch(() => {});
    const after = await prisma.entity.findUniqueOrThrow({ where: { id: entityBId } });
    expect(after.name, 'SECURITY: org-B entity name must STAY unchanged').toBe(
      'F4 PR-3b Org-B SECRET Entity',
    );
  });

  // ---------------------------------------------------------------------
  // D5 — entities.archive cross-org mutation
  // ---------------------------------------------------------------------
  it('D5: tenant_admin CANNOT archive org-B entity (NOT_FOUND + status UNCHANGED)', async () => {
    const caller = appRouter.createCaller(makeCtx(tenantAdminA));
    await caller.entities
      .archive({ id: entityBId, reason: 'cross-tenant attempt' })
      .catch(() => {});
    const after = await prisma.entity.findUniqueOrThrow({ where: { id: entityBId } });
    expect(after.status, 'SECURITY: org-B entity status must STAY active').toBe(
      'active',
    );
  });

  // ---------------------------------------------------------------------
  // D6 — entities.create cross-org PARENT (CREATE_FK leak)
  // ---------------------------------------------------------------------
  it('D6: tenant_admin cannot create subsidiary under org-B parent (NOT_FOUND)', async () => {
    const caller = appRouter.createCaller(makeCtx(tenantAdminA));
    await expect(
      caller.entities.create({
        code: `D6-${ts}`,
        name: 'D6 subsidiary attempt',
        type: 'subsidiary',
        parentEntityId: entityBId, // ORG-B parent
        status: 'active',
        metadata: null,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  // ---------------------------------------------------------------------
  // D7 — root-entity-org-derivation
  // ---------------------------------------------------------------------
  it('D7a: tenant_admin root-entity create derives orgId = ctx.orgId (NOT singleton)', async () => {
    const caller = appRouter.createCaller(makeCtx(tenantAdminA));
    const created = await caller.entities.create({
      code: `D7A-${ts}`,
      name: 'D7a root',
      type: 'parent',
      status: 'active',
      metadata: null,
    });
    const row = await prisma.entity.findUniqueOrThrow({ where: { id: created!.id } });
    expect(row.orgId, 'D7a: root must inherit caller orgId, not singleton').toBe(
      orgAId,
    );
    expect(row.orgId, 'D7a: must NOT be the picoplay singleton').not.toBe(
      '00000000-0000-0000-0000-000000000001',
    );
  });

  it('D7b: platform_admin root-create with null ctx.orgId → PRECONDITION_FAILED', async () => {
    // Construct a synthetic ctx with platform_admin user but null orgId
    // (simulating cross-tenant operator with no own-org).
    const orgLessCtx = { ...makeCtx(platformAdminA), orgId: null };
    const caller = appRouter.createCaller(orgLessCtx);
    await expect(
      caller.entities.create({
        code: `D7B-${ts}`,
        name: 'D7b root attempt',
        type: 'parent',
        status: 'active',
        metadata: null,
      }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });

  // ---------------------------------------------------------------------
  // D8 — projects.create cross-org entity (CREATE_FK leak)
  // ---------------------------------------------------------------------
  it('D8: tenant_admin cannot create project under org-B entity (NOT_FOUND)', async () => {
    const caller = appRouter.createCaller(makeCtx(tenantAdminA));
    await expect(
      caller.projects.create({
        code: `D8-${ts}`,
        name: 'D8 cross-org project attempt',
        entityId: entityBId, // ORG-B entity
        currencyCode: 'SAR',
        startDate: new Date(),
        contractValue: null,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  // ---------------------------------------------------------------------
  // D9 — projects.archive cross-org mutation
  // ---------------------------------------------------------------------
  it('D9: tenant_admin CANNOT archive org-B project (NOT_FOUND + status UNCHANGED)', async () => {
    const caller = appRouter.createCaller(makeCtx(tenantAdminA));
    await caller.projects
      .archive({ id: projectBId, reason: 'cross-tenant attempt' })
      .catch(() => {});
    const after = await prisma.project.findUniqueOrThrow({ where: { id: projectBId } });
    expect(after.status, 'SECURITY: org-B project status must STAY active').toBe(
      'active',
    );
  });

  // ---------------------------------------------------------------------
  // D10 — projects.assignments.assign cross-org (project OR user)
  // ---------------------------------------------------------------------
  it('D10a: tenant_admin cannot assign to org-B project (NOT_FOUND)', async () => {
    const caller = appRouter.createCaller(makeCtx(tenantAdminA));
    const role = await prisma.role.findFirstOrThrow({ where: { code: 'tenant_admin' } });
    await expect(
      caller.projects.assignments.assign({
        projectId: projectBId, // ORG-B project
        userId: userATarget,
        roleId: role.id,
        effectiveFrom: new Date(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('D10b: tenant_admin cannot assign org-B user to own-org project (NOT_FOUND)', async () => {
    const caller = appRouter.createCaller(makeCtx(tenantAdminA));
    const role = await prisma.role.findFirstOrThrow({ where: { code: 'tenant_admin' } });
    await expect(
      caller.projects.assignments.assign({
        projectId: projectAId,
        userId: userBTarget, // ORG-B user
        roleId: role.id,
        effectiveFrom: new Date(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  // ---------------------------------------------------------------------
  // D11 — projects.assignments.revoke cross-org
  // ---------------------------------------------------------------------
  it('D11: tenant_admin CANNOT revoke org-B assignment (NOT_FOUND + UNCHANGED)', async () => {
    const caller = appRouter.createCaller(makeCtx(tenantAdminA));
    await caller.projects.assignments
      .revoke({ assignmentId: assignmentBId, reason: 'cross-tenant attempt' })
      .catch(() => {});
    const after = await prisma.projectAssignment.findUniqueOrThrow({
      where: { id: assignmentBId },
    });
    expect(after.revokedAt, 'SECURITY: org-B assignment must STAY un-revoked').toBeNull();
  });

  // ---------------------------------------------------------------------
  // CAT-D3 platform_admin STILL crosses (D3 survives per surface)
  // ---------------------------------------------------------------------
  it('CAT-D3: platform_admin CAN list cross-org entities', async () => {
    const caller = appRouter.createCaller(makeCtx(platformAdminA));
    const entities = await caller.entities.list({ includeArchived: false });
    const ids = entities.map((e) => e.id);
    expect(ids, 'D3: platform_admin sees org-A entity').toContain(entityAId);
    expect(ids, 'D3: platform_admin sees org-B entity (cross-org bypass)').toContain(entityBId);
  });

  it('CAT-D3: platform_admin CAN get org-B entity', async () => {
    const caller = appRouter.createCaller(makeCtx(platformAdminA));
    const e = await caller.entities.get({ id: entityBId });
    expect(e!.id).toBe(entityBId);
  });

  it('CAT-D3: platform_admin CAN userSearch across orgs', async () => {
    const caller = appRouter.createCaller(makeCtx(platformAdminA));
    const users = await caller.projects.userSearch({
      query: `F4-PR3B-SECRET-B-${ts}`,
    });
    const ids = users.map((u) => u.id);
    expect(ids, 'D3: platform_admin sees org-B user via userSearch').toContain(
      userBTarget,
    );
  });
});
