/**
 * E2E: cross-tenant IMPORT-MUTATION write leak (PIC-97 hotfix) — the decisive proof.
 *
 * F3 (PR-1) hardened the import READS (import.get checks batch.projectId === input.projectId)
 * but NOT the import MUTATIONS. `import.commit` / `reject` / `cancel` are projectProcedure
 * (chokepoint validates `input.projectId`) yet call `commitBatch(batchId)` /
 * `rejectBatch(batchId)` / `cancelBatch(batchId)` — id-only service signatures with NO
 * `batch.projectId === input.projectId` check at either layer. So an org-A user passing
 * their OWN valid projectId + an org-B batchId performs a DESTRUCTIVE cross-tenant write.
 *
 * Each test drives the REAL appRouter as an org-A session against an org-B batch, then
 * asserts the org-B batch is UNCHANGED — RED on current main (the write happened), GREEN
 * after the service-layer scope assert. reject + cancel are proven at runtime here;
 * `commit` shares the identical unscoped `commitBatch(batchId)` codepath (sweep-verified).
 *
 * Real-DB (fmksa_test). userA = platform_admin grants MINUS system.admin (cross_project.read,
 * passes the chokepoint for its OWN project) — so the ORG boundary is the only variable.
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
let userA: AuthUser;
let projectAId: string;
let batchACancelId: string; // org A, staged — positive-path (own-org cancel must still work)
let batchBRejectId: string; // org B, staged — RED target
let batchBCancelId: string; // org B, staged — RED target
let batchBValidateId: string; // org B, staged — RED target (validate)
let batchBCommitId: string; // org B, validated — RED target (commit)
let rowBId: string; // org B import row — RED target (excludeRow)
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

  const orgA = await prisma.organization.create({ data: { slug: `imp-a-${ts}`, name: 'Imp Org A' } });
  const orgB = await prisma.organization.create({ data: { slug: `imp-b-${ts}`, name: 'Imp Org B' } });
  orgAId = orgA.id;
  orgBId = orgB.id;

  // Role: platform_admin grants MINUS system.admin (cross_project.read + import.*; no platform bypass).
  const masterAdmin = await prisma.role.findFirstOrThrow({
    where: { code: 'platform_admin' },
    include: { rolePermissions: true },
  });
  const sysAdminPerm = await prisma.permission.findFirstOrThrow({ where: { code: 'system.admin' } });
  const crossRole = await prisma.role.create({
    data: { code: `imp-cross-${ts}`, name: `Imp Cross Test ${ts}` },
  });
  roleIds.push(crossRole.id);
  await prisma.rolePermission.createMany({
    data: masterAdmin.rolePermissions
      .filter((rp) => rp.permissionId !== sysAdminPerm.id)
      .map((rp) => ({ roleId: crossRole.id, permissionId: rp.permissionId })),
  });

  // --- Org A (the caller's tenant) ---
  const entityA = await prisma.entity.create({
    data: { orgId: orgAId, code: `ENT-IA-${ts}`, name: 'Ent IA', type: 'parent', status: 'active' },
  });
  const projectA = await prisma.project.create({
    data: {
      orgId: orgAId, code: `PROJ-IA-${ts}`, name: 'Imp Project A', entityId: entityA.id,
      currencyCode: 'SAR', startDate: new Date(), createdBy: 'test', status: 'active',
    },
  });
  projectAId = projectA.id;
  const batchACancel = await prisma.importBatch.create({
    data: {
      orgId: orgAId, projectId: projectA.id, importType: 'ipa_history',
      sourceFileName: 'orgA.xlsx', sourceFileHash: `hA-${ts}`, uploadedBy: 'test',
      status: 'staged', summaryJson: {},
    },
  });
  batchACancelId = batchACancel.id;

  const userADb = await prisma.user.create({
    data: { orgId: orgAId, email: `imp-a-${ts}@test.com`, name: 'Imp User A', passwordHash: 'test-hash', status: 'active' },
  });
  userIds.push(userADb.id);
  await prisma.userRole.create({
    data: { userId: userADb.id, roleId: crossRole.id, effectiveFrom: past(10), assignedBy: 'test', assignedAt: new Date() },
  });
  await prisma.projectAssignment.create({
    data: { projectId: projectAId, userId: userADb.id, roleId: crossRole.id, effectiveFrom: past(10), assignedBy: 'test', assignedAt: new Date() },
  });

  // --- Org B (the tenant whose batches must be untouchable by org A) ---
  const entityB = await prisma.entity.create({
    data: { orgId: orgBId, code: `ENT-IB-${ts}`, name: 'Ent IB SECRET', type: 'parent', status: 'active' },
  });
  const projectB = await prisma.project.create({
    data: {
      orgId: orgBId, code: `PROJ-IB-${ts}`, name: 'Imp Project B', entityId: entityB.id,
      currencyCode: 'SAR', startDate: new Date(), createdBy: 'test', status: 'active',
    },
  });
  const batchBReject = await prisma.importBatch.create({
    data: {
      orgId: orgBId, projectId: projectB.id, importType: 'ipa_history',
      sourceFileName: 'orgB-reject.xlsx', sourceFileHash: `hBr-${ts}`, uploadedBy: 'test',
      status: 'staged', summaryJson: {},
    },
  });
  batchBRejectId = batchBReject.id;
  const batchBCancel = await prisma.importBatch.create({
    data: {
      orgId: orgBId, projectId: projectB.id, importType: 'ipa_history',
      sourceFileName: 'orgB-cancel.xlsx', sourceFileHash: `hBc-${ts}`, uploadedBy: 'test',
      status: 'staged', summaryJson: {},
    },
  });
  batchBCancelId = batchBCancel.id;
  const batchBValidate = await prisma.importBatch.create({
    data: {
      orgId: orgBId, projectId: projectB.id, importType: 'ipa_history',
      sourceFileName: 'orgB-validate.xlsx', sourceFileHash: `hBv-${ts}`, uploadedBy: 'test',
      status: 'staged', summaryJson: {},
    },
  });
  batchBValidateId = batchBValidate.id;
  const batchBCommit = await prisma.importBatch.create({
    data: {
      orgId: orgBId, projectId: projectB.id, importType: 'ipa_history',
      sourceFileName: 'orgB-commit.xlsx', sourceFileHash: `hBcm-${ts}`, uploadedBy: 'test',
      status: 'validated', parserVersion: '2026.04.15.01', summaryJson: {},
    },
  });
  batchBCommitId = batchBCommit.id;
  const batchBExclude = await prisma.importBatch.create({
    data: {
      orgId: orgBId, projectId: projectB.id, importType: 'ipa_history',
      sourceFileName: 'orgB-exclude.xlsx', sourceFileHash: `hBe-${ts}`, uploadedBy: 'test',
      status: 'staged', summaryJson: {},
    },
  });
  const rowB = await prisma.importRow.create({
    data: { batchId: batchBExclude.id, rowNumber: 1, rawJson: {}, status: 'pending' },
  });
  rowBId = rowB.id;

  userA = await loadAuthUser(userADb.id);
  delete process.env.SEED_CONTEXT;
}, 60_000);

afterAll(async () => {
  process.env.SEED_CONTEXT = 'true';
  const orgs = [orgAId, orgBId].filter(Boolean);
  await prisma.importRow.deleteMany({ where: { batch: { orgId: { in: orgs } } } });
  await prisma.importBatch.deleteMany({ where: { orgId: { in: orgs } } });
  await prisma.projectAssignment.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.project.deleteMany({ where: { orgId: { in: orgs } } });
  await prisma.entity.deleteMany({ where: { orgId: { in: orgs } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
  await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
  delete process.env.SEED_CONTEXT;
}, 60_000);

describe('PIC-97 hotfix — cross-tenant import-mutation write leak', () => {
  it('org-A user CANNOT cancel an org-B batch (passing their own projectId + an org-B batchId)', async () => {
    const caller = appRouter.createCaller(makeCtx(userA));
    await caller.import.cancel({ projectId: projectAId, batchId: batchBCancelId }).catch(() => {});
    const after = await prisma.importBatch.findUniqueOrThrow({ where: { id: batchBCancelId } });
    expect(after.status, 'SECURITY: org-B batch must be UNCHANGED by an org-A cancel').toBe('staged');
  });

  it('org-A user CANNOT reject an org-B batch (passing their own projectId + an org-B batchId)', async () => {
    const caller = appRouter.createCaller(makeCtx(userA));
    await caller.import
      .reject({ projectId: projectAId, batchId: batchBRejectId, reason: 'cross-tenant attempt' })
      .catch(() => {});
    const after = await prisma.importBatch.findUniqueOrThrow({ where: { id: batchBRejectId } });
    expect(after.status, 'SECURITY: org-B batch must be UNCHANGED by an org-A reject').toBe('staged');
  });

  it('org-A user CANNOT validate an org-B batch', async () => {
    const caller = appRouter.createCaller(makeCtx(userA));
    await caller.import.validate({ projectId: projectAId, batchId: batchBValidateId }).catch(() => {});
    const after = await prisma.importBatch.findUniqueOrThrow({ where: { id: batchBValidateId } });
    expect(after.status, 'SECURITY: org-B batch must be UNCHANGED by an org-A validate').toBe('staged');
  });

  it('org-A user CANNOT commit an org-B batch (NOT-FOUND-shaped denial)', async () => {
    // commit on a 0-valid-row batch does not flip status, so a status assertion
    // is a false proof; assert the NOT-FOUND-shaped scope denial instead. On main
    // the cross-tenant commit is NOT denied (no NOT_FOUND) → RED; post-fix → GREEN.
    const caller = appRouter.createCaller(makeCtx(userA));
    await expect(
      caller.import.commit({ projectId: projectAId, batchId: batchBCommitId }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const after = await prisma.importBatch.findUniqueOrThrow({ where: { id: batchBCommitId } });
    expect(after.status, 'org-B batch must be UNCHANGED').toBe('validated');
  });

  it('org-A user CANNOT exclude an org-B import row', async () => {
    const caller = appRouter.createCaller(makeCtx(userA));
    await caller.import.excludeRow({ projectId: projectAId, rowId: rowBId }).catch(() => {});
    const after = await prisma.importRow.findUniqueOrThrow({ where: { id: rowBId } });
    expect(after.status, 'SECURITY: org-B row must be UNCHANGED by an org-A excludeRow').toBe('pending');
  });

  // Positive path: the fix must not break a legitimate same-project cancel.
  it('POS: org-A user CAN cancel their OWN org-A batch', async () => {
    const caller = appRouter.createCaller(makeCtx(userA));
    await caller.import.cancel({ projectId: projectAId, batchId: batchACancelId });
    const after = await prisma.importBatch.findUniqueOrThrow({ where: { id: batchACancelId } });
    expect(after.status).toBe('cancelled');
  });
});
