/**
 * E2E: cross-tenant DOCUMENTS mutation + read leaks (PIC-97 hotfix).
 *
 * F3 (PR-1) hardened the documentId-keyed read (documents.get line 96 has
 * `doc.projectId !== input.projectId → NOT_FOUND`) but THREE adjacent router
 * surfaces missed the same guard:
 *   - `documents.sign`        (mutation; calls signVersion(versionId, ...) — by-id leak)
 *   - `documents.supersede`   (info-disclosure: returns `{authorized: true}`
 *                              for any documentId; /api/upload supersede
 *                              re-checks at handleSupersede route.ts:310 so
 *                              no DB mutation, but the stamp + existence
 *                              leaked)
 *   - `documents.getDownloadUrl` (READ leak; keyed on fileKey, no doc-scope
 *                              check — F3-missed)
 *
 * Each fix is ROUTER-asserted (pre-fetch + projectId check, mirror
 * documents.get line-96 idiom). Flagged for the PIC-71 (PR-2) honesty note:
 * PR-2's static AST guard ranges over service signatures; these guards are at
 * the router layer, so PR-2 marks the documents fns as router-asserted
 * exemptions rather than requiring service-level guard insertion.
 *
 * Real-DB. userA = master_admin grants MINUS system.admin (cross_project.read
 * + document.* perms, passes the chokepoint for its OWN project) — so the ORG
 * boundary is the only variable.
 *
 * POS coverage:
 *   - `supersede` POS — no storage interaction; returns metadata.
 *   - `getDownloadUrl` POS — storage signs a URL string; no GET/PUT.
 *   - `sign`        POS — SKIPPED (signVersion downloads from storage to
 *     recompute the hash; we'd need a real upload to MinIO to round-trip the
 *     POS path, which is out of scope for an isolation test). The RED path
 *     proves the router NOT_FOUND fires before signVersion runs; the
 *     documents service.test.ts integration suite already covers the legit
 *     same-project sign path against a uploaded buffer.
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
let docAId: string;
let docBId: string;
let verAId: string;
let verBId: string;
let fileKeyA: string;
let fileKeyB: string;
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

  const orgA = await prisma.organization.create({ data: { slug: `doc-a-${ts}`, name: 'Doc Org A' } });
  const orgB = await prisma.organization.create({ data: { slug: `doc-b-${ts}`, name: 'Doc Org B' } });
  orgAId = orgA.id;
  orgBId = orgB.id;

  // Role: master_admin grants MINUS system.admin (chokepoint enforces org;
  // system.admin is the platform-bypass that would skip it).
  const masterAdmin = await prisma.role.findFirstOrThrow({
    where: { code: 'master_admin' },
    include: { rolePermissions: true },
  });
  const sysAdminPerm = await prisma.permission.findFirstOrThrow({ where: { code: 'system.admin' } });
  const crossRole = await prisma.role.create({
    data: { code: `doc-cross-${ts}`, name: `Doc Cross Test ${ts}` },
  });
  roleIds.push(crossRole.id);
  await prisma.rolePermission.createMany({
    data: masterAdmin.rolePermissions
      .filter((rp) => rp.permissionId !== sysAdminPerm.id)
      .map((rp) => ({ roleId: crossRole.id, permissionId: rp.permissionId })),
  });

  // --- Org A (the caller's tenant) ---
  const entityA = await prisma.entity.create({
    data: { orgId: orgAId, code: `ENT-DOCA-${ts}`, name: 'Ent DOC A', type: 'parent', status: 'active' },
  });
  const projectA = await prisma.project.create({
    data: {
      orgId: orgAId, code: `PROJ-DOCA-${ts}`, name: 'Doc Project A', entityId: entityA.id,
      currencyCode: 'SAR', startDate: new Date(), createdBy: 'test', status: 'active',
    },
  });
  projectAId = projectA.id;

  // Org-A document + version (POS-path target)
  const docA = await prisma.document.create({
    data: {
      projectId: projectAId, title: 'Doc A', category: 'contract_attachment',
      status: 'in_review', createdBy: 'test',
    },
  });
  docAId = docA.id;
  fileKeyA = `projects/${projectAId}/documents/${docAId}/1/a.pdf`;
  const verA = await prisma.documentVersion.create({
    data: {
      documentId: docAId, versionNo: 1, fileKey: fileKeyA,
      fileHash: 'a'.repeat(64), fileSize: 100, mimeType: 'application/pdf',
      uploadedBy: 'test', uploadedAt: new Date(),
    },
  });
  verAId = verA.id;
  await prisma.document.update({ where: { id: docAId }, data: { currentVersionId: verAId } });

  const userADb = await prisma.user.create({
    data: { orgId: orgAId, email: `doc-a-${ts}@test.com`, name: 'Doc User A', passwordHash: 'test-hash', status: 'active' },
  });
  userIds.push(userADb.id);
  await prisma.userRole.create({
    data: { userId: userADb.id, roleId: crossRole.id, effectiveFrom: past(10), assignedBy: 'test', assignedAt: new Date() },
  });
  await prisma.projectAssignment.create({
    data: { projectId: projectAId, userId: userADb.id, roleId: crossRole.id, effectiveFrom: past(10), assignedBy: 'test', assignedAt: new Date() },
  });

  // --- Org B (untouchable by org A) ---
  const entityB = await prisma.entity.create({
    data: { orgId: orgBId, code: `ENT-DOCB-${ts}`, name: 'Ent DOC B SECRET', type: 'parent', status: 'active' },
  });
  const projectB = await prisma.project.create({
    data: {
      orgId: orgBId, code: `PROJ-DOCB-${ts}`, name: 'Doc Project B', entityId: entityB.id,
      currencyCode: 'SAR', startDate: new Date(), createdBy: 'test', status: 'active',
    },
  });
  const docB = await prisma.document.create({
    data: {
      projectId: projectB.id, title: 'Doc B SECRET', category: 'contract_attachment',
      status: 'in_review', createdBy: 'test',
    },
  });
  docBId = docB.id;
  fileKeyB = `projects/${projectB.id}/documents/${docBId}/1/b-SECRET.pdf`;
  const verB = await prisma.documentVersion.create({
    data: {
      documentId: docBId, versionNo: 1, fileKey: fileKeyB,
      fileHash: 'b'.repeat(64), fileSize: 200, mimeType: 'application/pdf',
      uploadedBy: 'test', uploadedAt: new Date(),
    },
  });
  verBId = verB.id;
  await prisma.document.update({ where: { id: docBId }, data: { currentVersionId: verBId } });

  userA = await loadAuthUser(userADb.id);
  delete process.env.SEED_CONTEXT;
}, 60_000);

afterAll(async () => {
  process.env.SEED_CONTEXT = 'true';
  const orgs = [orgAId, orgBId].filter(Boolean);
  // Detach currentVersion FK before deleting versions
  await prisma.document.updateMany({
    where: { project: { orgId: { in: orgs } } },
    data: { currentVersionId: null },
  });
  // DocumentSignature is immutable (append-only) — no deleteMany allowed.
  // This test never signs (RED proves sign rejection; no signatures created).
  await prisma.documentVersion.deleteMany({
    where: { document: { project: { orgId: { in: orgs } } } },
  });
  await prisma.document.deleteMany({ where: { project: { orgId: { in: orgs } } } });
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

describe('PIC-97 hotfix — cross-tenant documents mutation + read leaks', () => {
  // -----------------------------------------------------------------
  // documents.sign — by-id (versionId) write leak
  // -----------------------------------------------------------------
  it('org-A user CANNOT sign an org-B document version (NOT_FOUND, isSigned unchanged)', async () => {
    const caller = appRouter.createCaller(makeCtx(userA));
    await expect(
      caller.documents.sign({ projectId: projectAId, versionId: verBId }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const after = await prisma.documentVersion.findUniqueOrThrow({ where: { id: verBId } });
    expect(after.isSigned, 'SECURITY: org-B version must remain unsigned').toBe(false);
  });

  // -----------------------------------------------------------------
  // documents.supersede — info-disclosure + auth-stamp leak (no DB write,
  // since /api/upload re-checks; but the router returns `{authorized: true}`
  // for an org-B documentId)
  // -----------------------------------------------------------------
  it('org-A user CANNOT supersede an org-B document (NOT_FOUND, no authorized: true)', async () => {
    const caller = appRouter.createCaller(makeCtx(userA));
    await expect(
      caller.documents.supersede({
        projectId: projectAId,
        documentId: docBId,
        reason: 'cross-tenant attempt',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('POS: org-A user CAN supersede their OWN org-A document (returns authorized stamp)', async () => {
    const caller = appRouter.createCaller(makeCtx(userA));
    const result = await caller.documents.supersede({
      projectId: projectAId,
      documentId: docAId,
      reason: 'legit revision',
    });
    expect(result.authorized).toBe(true);
    expect(result.documentId).toBe(docAId);
  });

  // -----------------------------------------------------------------
  // documents.getDownloadUrl — F3-missed READ leak (keyed on fileKey)
  // -----------------------------------------------------------------
  it('org-A user CANNOT get a presigned URL for an org-B fileKey (NOT_FOUND, no URL leaked)', async () => {
    const caller = appRouter.createCaller(makeCtx(userA));
    await expect(
      caller.documents.getDownloadUrl({ projectId: projectAId, fileKey: fileKeyB }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('POS: org-A user CAN get a presigned URL for their OWN org-A fileKey', async () => {
    const caller = appRouter.createCaller(makeCtx(userA));
    const result = await caller.documents.getDownloadUrl({
      projectId: projectAId,
      fileKey: fileKeyA,
    });
    expect(typeof result.url).toBe('string');
    expect(result.url.length).toBeGreaterThan(0);
  });
});
