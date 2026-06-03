/**
 * E2E: ORG isolation (PIC-97 / F3) — the decisive multi-tenant proof.
 *
 * Each category is a REAL cross-tenant read through the actual appRouter (an
 * org-A session genuinely retrieving org-B rows), asserting the post-enforcement
 * isolated behaviour — RED on current main (org isolation UNENFORCED), GREEN
 * after F3. Targets are the TENANT-reachable holes (posting/budget/reconciliation
 * are platform_admin-only per PIC-92 — platform-admin surfaces, out of F3 scope):
 *
 *   CAT1 chokepoint     — projectProcedure (import.list) on an org-B project,
 *                         reached via the cross_project.read fallback (no system.admin).
 *   CAT2 optional-scope — import.listAll (projectId:null) must not leak org-B batches.
 *   CAT3 by-id          — workflow.getByRecord(org-B record) must be NOT-FOUND-shaped.
 *   CAT3b by-id         — entities.ancestors(org-B entity) must be NOT-FOUND-shaped.
 *   CAT3c by-id         — commercial.engineerInstruction.get fetches by `id` without
 *                         asserting the record's project == ctx.projectId.
 *   CAT4 system.admin   — the platform-admin (system.admin) bypass MUST SURVIVE
 *                         the enforcement (still crosses orgs). GREEN pre AND post.
 *
 * Plus positive-path: a normal org-A user can still read within org A.
 *
 * Real-DB (fmksa_test). userA holds platform_admin's grants MINUS system.admin (a
 * broad cross-project reader, no platform bypass) so resolver perm-gates pass and
 * the ORG boundary is the only variable under test.
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
let userA: AuthUser; // org A — platform_admin grants MINUS system.admin (cross_project.read, all views)
let platformAdmin: AuthUser; // org A — full platform_admin (system.admin)
let projectAId: string;
let entityAId: string;
let entityBId: string;
let importBatchBId: string;
let eiBId: string;
const wfRecordIdB = `wf-rec-B-${ts}`;

const userIds: string[] = [];
const roleIds: string[] = [];

beforeAll(async () => {
  assertTestDb();
  process.env.SEED_CONTEXT = 'true';

  await prisma.currency.upsert({
    where: { code: 'SAR' },
    update: {},
    create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
  });

  const orgA = await prisma.organization.create({
    data: { slug: `iso-a-${ts}`, name: 'Iso Org A' },
  });
  const orgB = await prisma.organization.create({
    data: { slug: `iso-b-${ts}`, name: 'Iso Org B' },
  });
  orgAId = orgA.id;
  orgBId = orgB.id;

  // Roles: userA = platform_admin perms minus system.admin; platformAdmin = platform_admin.
  const masterAdmin = await prisma.role.findFirstOrThrow({
    where: { code: 'platform_admin' },
    include: { rolePermissions: true },
  });
  const sysAdminPerm = await prisma.permission.findFirstOrThrow({
    where: { code: 'system.admin' },
  });
  const crossRole = await prisma.role.create({
    // Title-Case name (matches the seeded convention) so a concurrent roleList
    // ordering assertion (SQL ORDER BY name vs JS localeCompare) stays consistent.
    data: { code: `iso-cross-${ts}`, name: `Iso Cross Test ${ts}` },
  });
  roleIds.push(crossRole.id);
  await prisma.rolePermission.createMany({
    data: masterAdmin.rolePermissions
      .filter((rp) => rp.permissionId !== sysAdminPerm.id)
      .map((rp) => ({ roleId: crossRole.id, permissionId: rp.permissionId })),
  });

  const tpl = await prisma.workflowTemplate.findFirstOrThrow({
    where: { code: 'ipa_standard' },
    include: { steps: { orderBy: { orderIndex: 'asc' } } },
  });

  // --- Org A (the caller's tenant) ---
  const entityAParent = await prisma.entity.create({
    data: { orgId: orgAId, code: `ENT-AP-${ts}`, name: 'Ent A Parent', type: 'parent', status: 'active' },
  });
  const entityA = await prisma.entity.create({
    data: {
      orgId: orgAId,
      code: `ENT-A-${ts}`,
      name: 'Ent A',
      type: 'parent',
      status: 'active',
      parentEntityId: entityAParent.id,
    },
  });
  entityAId = entityA.id;
  const projectA = await prisma.project.create({
    data: {
      orgId: orgAId,
      code: `PROJ-A-${ts}`,
      name: 'Iso Project A',
      entityId: entityA.id,
      currencyCode: 'SAR',
      startDate: new Date(),
      createdBy: 'test',
      status: 'active',
    },
  });
  projectAId = projectA.id;
  await prisma.importBatch.create({
    data: {
      orgId: orgAId,
      projectId: projectAId,
      importType: 'ipa_history',
      sourceFileName: 'orgA.xlsx',
      sourceFileHash: `hashA-${ts}`,
      uploadedBy: 'test',
      status: 'committed',
      summaryJson: { committed: 1 },
    },
  });

  const userADb = await prisma.user.create({
    data: { orgId: orgAId, email: `iso-a-${ts}@test.com`, name: 'Iso User A', passwordHash: 'test-hash', status: 'active' },
  });
  userIds.push(userADb.id);
  await prisma.userRole.create({
    data: { userId: userADb.id, roleId: crossRole.id, effectiveFrom: past(10), assignedBy: 'test', assignedAt: new Date() },
  });
  await prisma.projectAssignment.create({
    data: { projectId: projectAId, userId: userADb.id, roleId: crossRole.id, effectiveFrom: past(10), assignedBy: 'test', assignedAt: new Date() },
  });

  const adminDb = await prisma.user.create({
    data: { orgId: orgAId, email: `iso-admin-${ts}@test.com`, name: 'Iso Platform Admin', passwordHash: 'test-hash', status: 'active' },
  });
  userIds.push(adminDb.id);
  await prisma.userRole.create({
    data: { userId: adminDb.id, roleId: masterAdmin.id, effectiveFrom: past(10), assignedBy: 'test', assignedAt: new Date() },
  });

  // --- Org B (the data org A must NOT be able to read) ---
  const entityBParent = await prisma.entity.create({
    data: { orgId: orgBId, code: `ENT-BP-${ts}`, name: 'Ent B Parent SECRET', type: 'parent', status: 'active' },
  });
  const entityB = await prisma.entity.create({
    data: {
      orgId: orgBId,
      code: `ENT-B-${ts}`,
      name: 'Ent B',
      type: 'parent',
      status: 'active',
      parentEntityId: entityBParent.id,
    },
  });
  entityBId = entityB.id;
  const projectB = await prisma.project.create({
    data: {
      orgId: orgBId,
      code: `PROJ-B-${ts}`,
      name: 'Iso Project B',
      entityId: entityB.id,
      currencyCode: 'SAR',
      startDate: new Date(),
      createdBy: 'test',
      status: 'active',
    },
  });
  const importBatchB = await prisma.importBatch.create({
    data: {
      orgId: orgBId,
      projectId: projectB.id,
      importType: 'ipa_history',
      sourceFileName: 'orgB-secret.xlsx',
      sourceFileHash: `hashB-${ts}`,
      uploadedBy: 'test',
      status: 'committed',
      summaryJson: { committed: 1 },
    },
  });
  importBatchBId = importBatchB.id;

  await prisma.workflowInstance.create({
    data: {
      orgId: orgBId,
      templateId: tpl.id,
      recordType: 'ipa',
      recordId: wfRecordIdB,
      projectId: projectB.id,
      status: 'in_progress',
      currentStepId: tpl.steps[0]?.id ?? null,
      startedBy: 'test',
      startedAt: new Date(),
    },
  });

  const eiB = await prisma.engineerInstruction.create({
    data: {
      orgId: orgBId,
      projectId: projectB.id,
      title: 'Org B EI SECRET',
      estimatedValue: 100000,
      currency: 'SAR',
      reserveRate: 0.5,
      reserveAmount: 50000,
      status: 'received',
      createdBy: 'test',
    },
  });
  eiBId = eiB.id;

  userA = await loadAuthUser(userADb.id);
  platformAdmin = await loadAuthUser(adminDb.id);

  delete process.env.SEED_CONTEXT;
});

afterAll(async () => {
  process.env.SEED_CONTEXT = 'true';
  const orgs = [orgAId, orgBId].filter(Boolean);
  await prisma.workflowInstance.deleteMany({ where: { orgId: { in: orgs } } });
  await prisma.engineerInstruction.deleteMany({ where: { orgId: { in: orgs } } });
  await prisma.importBatch.deleteMany({ where: { orgId: { in: orgs } } });
  await prisma.projectAssignment.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.project.deleteMany({ where: { orgId: { in: orgs } } });
  await prisma.entity.deleteMany({ where: { orgId: { in: orgs }, parentEntityId: { not: null } } });
  await prisma.entity.deleteMany({ where: { orgId: { in: orgs } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
  await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
  delete process.env.SEED_CONTEXT;
});

describe('PIC-97 F3 — tenant isolation (org A cannot read org B)', () => {
  it('CAT1 chokepoint: org-A user (cross_project.read, no system.admin) is DENIED a projectProcedure on an org-B project', async () => {
    const caller = appRouter.createCaller(makeCtx(userA));
    await expect(
      caller.import.list({ projectId: (await prisma.project.findFirstOrThrow({ where: { orgId: orgBId } })).id }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('CAT2 optional-scope list: import.listAll does NOT leak org-B batches to an org-A user', async () => {
    const caller = appRouter.createCaller(makeCtx(userA));
    const res = await caller.import.listAll({ take: 100 });
    expect(JSON.stringify(res)).not.toContain(importBatchBId);
  });

  it('CAT3 by-id: workflow.instances.getByRecord(org-B record) is NULL-shaped (no existence disclosure) for an org-A user', async () => {
    const caller = appRouter.createCaller(makeCtx(userA));
    // getByRecord returns null for "no instance"; a cross-org instance is shaped
    // identically (null) — indistinguishable from a record that has no workflow.
    await expect(
      caller.workflow.instances.getByRecord({ recordType: 'ipa', recordId: wfRecordIdB }),
    ).resolves.toBeNull();
  });

  it('CAT3b by-id: entities.ancestors(org-B entity) is NOT-FOUND-shaped for an org-A user', async () => {
    const caller = appRouter.createCaller(makeCtx(userA));
    await expect(
      caller.entities.ancestors({ entityId: entityBId }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('CAT3c by-id: engineerInstruction.get cannot fetch an org-B record via the unscoped id param', async () => {
    const caller = appRouter.createCaller(makeCtx(userA));
    await expect(
      caller.commercial.engineerInstruction.get({ projectId: projectAId, id: eiBId }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('CAT4 system.admin bypass SURVIVES: a platform-admin still reads across orgs (org-B entity tree)', async () => {
    const caller = appRouter.createCaller(makeCtx(platformAdmin));
    const ancestors = await caller.entities.ancestors({ entityId: entityBId });
    expect(ancestors.length).toBeGreaterThan(0);
  });

  // --- Positive path: the wall is not too high ---
  it('POS list: org-A user CAN list import batches for their OWN project', async () => {
    const caller = appRouter.createCaller(makeCtx(userA));
    const res = await caller.import.list({ projectId: projectAId });
    expect(res).toBeDefined();
  });

  it('POS by-id: org-A user CAN read their OWN org entity tree', async () => {
    const caller = appRouter.createCaller(makeCtx(userA));
    const ancestors = await caller.entities.ancestors({ entityId: entityAId });
    expect(ancestors.length).toBeGreaterThan(0);
  });

  // --- Deny-by-default / fail-closed ---
  it('FAIL-CLOSED: a null ctx.orgId is DENIED at the chokepoint even for an otherwise-authorized user', async () => {
    // userA is assigned to projectA and holds the perms — but with NO tenant
    // context, the org gate must NOT pass. Null on either side throws.
    const nullOrgCtx = { ...makeCtx(userA), orgId: null };
    const caller = appRouter.createCaller(nullOrgCtx);
    await expect(
      caller.import.list({ projectId: projectAId }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  // --- NOT-FOUND-shaping: a fake id and an org-B id are indistinguishable ---
  it('NOT-FOUND-shaped: engineerInstruction.get returns the SAME response for a fake id and an org-B id', async () => {
    const caller = appRouter.createCaller(makeCtx(userA));
    const fakeId = '00000000-0000-0000-0000-0000000000ff';
    const fake = await caller.commercial.engineerInstruction
      .get({ projectId: projectAId, id: fakeId })
      .then(() => 'resolved')
      .catch((e: { code?: string }) => e.code);
    const orgB = await caller.commercial.engineerInstruction
      .get({ projectId: projectAId, id: eiBId })
      .then(() => 'resolved')
      .catch((e: { code?: string }) => e.code);
    expect(fake).toBe('NOT_FOUND');
    expect(orgB).toBe(fake); // identical — no existence disclosure
  });

  it('NOT-FOUND-shaped: workflow.getByRecord returns the SAME (null) response for a fake record and an org-B record', async () => {
    const caller = appRouter.createCaller(makeCtx(userA));
    const fake = await caller.workflow.instances.getByRecord({
      recordType: 'ipa',
      recordId: `nonexistent-${ts}`,
    });
    const orgB = await caller.workflow.instances.getByRecord({
      recordType: 'ipa',
      recordId: wfRecordIdB,
    });
    expect(fake).toBeNull();
    expect(orgB).toBe(fake); // identical (both null) — no existence disclosure
  });
});
