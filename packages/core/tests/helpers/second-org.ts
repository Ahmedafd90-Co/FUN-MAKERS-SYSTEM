/**
 * Reusable second-tenant fixture for multi-tenant tests (PIC-84 numbering;
 * reused by F3 enforcement later).
 *
 * Why a REAL second org (not the singleton): per-tenant numbering / scoping can
 * only be honestly proven across two distinct orgs. A collision test that runs
 * entirely inside the singleton org is theater — it re-asserts global uniqueness,
 * not per-tenant namespacing. So this builds a genuine Organization #2 plus a full
 * org-scoped context (entity + vendor + user + project), all with orgId set
 * EXPLICITLY to the target org (not relying on the singleton @default).
 */
import { prisma } from '@fmksa/db';

/** The singleton tenant (org #1). Byte-identical to schema @default + seed. */
export const SINGLETON_ORG_ID = '00000000-0000-0000-0000-000000000001';
/** A real second tenant (org #2) — distinct from the singleton. */
export const SECOND_ORG_ID = '00000000-0000-0000-0000-000000000002';

export type TenantContext = {
  orgId: string;
  userId: string;
  entityId: string;
  vendorId: string;
  projectId: string;
};

/** Ensure a real second Organization row exists. Idempotent. */
export async function ensureSecondOrg(): Promise<string> {
  await prisma.organization.upsert({
    where: { id: SECOND_ORG_ID },
    update: {},
    create: {
      id: SECOND_ORG_ID,
      slug: 'tenant-b-test',
      name: 'Tenant B (test fixture)',
    },
  });
  return SECOND_ORG_ID;
}

/**
 * Build a complete org-scoped tenant context. Every row carries an explicit
 * `orgId` so cross-tenant assertions are real, not singleton-default artefacts.
 * `tag` must be unique per call (callers pass a timestamp/random suffix).
 */
export async function createTenantContext(
  orgId: string,
  tag: string,
): Promise<TenantContext> {
  await prisma.currency.upsert({
    where: { code: 'SAR' },
    update: {},
    create: {
      code: 'SAR',
      name: 'Saudi Riyal',
      symbol: 'SR',
      decimalPlaces: 2,
    },
  });
  const user = await prisma.user.create({
    data: {
      orgId,
      email: `numbering-${tag}@test.com`,
      name: `User ${tag}`,
      passwordHash: 'test-hash',
      status: 'active',
    },
  });
  const entity = await prisma.entity.create({
    data: {
      orgId,
      code: `ENT-${tag}`,
      name: `Entity ${tag}`,
      type: 'parent',
      status: 'active',
    },
  });
  const vendor = await prisma.vendor.create({
    data: {
      orgId,
      entityId: entity.id,
      vendorCode: `VEN-${tag}`,
      name: `Vendor ${tag}`,
      status: 'active',
      createdBy: user.id,
    },
  });
  const project = await prisma.project.create({
    data: {
      orgId,
      code: `PROJ-${tag}`,
      name: `Project ${tag}`,
      entityId: entity.id,
      status: 'active',
      currencyCode: 'SAR',
      startDate: new Date(),
      createdBy: user.id,
    },
  });
  return {
    orgId,
    userId: user.id,
    entityId: entity.id,
    vendorId: vendor.id,
    projectId: project.id,
  };
}

/** FK-safe teardown of a tenant context's procurement rows + the context itself. */
export async function cleanupTenantContext(ctx: TenantContext): Promise<void> {
  await prisma.frameworkAgreement.deleteMany({
    where: { entityId: ctx.entityId },
  });
  await prisma.vendorContract.deleteMany({
    where: { projectId: ctx.projectId },
  });
  await prisma.rFQ.deleteMany({ where: { projectId: ctx.projectId } });
  await prisma.vendor.deleteMany({ where: { id: ctx.vendorId } });
  await prisma.project.deleteMany({ where: { id: ctx.projectId } });
  await prisma.entity.deleteMany({ where: { id: ctx.entityId } });
  await prisma.user.deleteMany({ where: { id: ctx.userId } });
}
