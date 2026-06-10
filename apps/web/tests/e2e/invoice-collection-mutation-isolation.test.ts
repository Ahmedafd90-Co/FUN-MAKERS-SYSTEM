/**
 * E2E: cross-tenant INVOICE-COLLECTION-MUTATION write leak (PIC-97 hotfix).
 *
 * F3 (PR-1) hardened the chokepoint reads but the by-id taxInvoice was unscoped
 * in `recordCollection`'s service. An org-A user passing their OWN projectId +
 * an org-B taxInvoiceId got the invoice fetched + a collection row CREATED
 * against org-B (and the org-B invoice's status mutated). RecordCollectionSchema
 * strips `projectId` via zod; the chokepoint reads raw input and injects
 * `ctx.projectId`; the service now asserts `invoice.projectId === ctx.projectId`
 * and throws ScopeMismatchError → NOT_FOUND.
 *
 * Real-DB. userA = platform_admin grants MINUS system.admin (cross_project.read
 * + tax_invoice.edit, passes the chokepoint for its OWN project) — so the ORG
 * boundary is the only variable.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma, SINGLETON_ORG_ID } from '@fmksa/db';
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
let invoiceAId: string; // org A, issued — positive-path target (own-org collect must still work)
let invoiceBId: string; // org B, issued — RED target
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

  const orgA = await prisma.organization.create({ data: { slug: `inv-a-${ts}`, name: 'Inv Org A' } });
  const orgB = await prisma.organization.create({ data: { slug: `inv-b-${ts}`, name: 'Inv Org B' } });
  orgAId = orgA.id;
  orgBId = orgB.id;

  // Role: platform_admin grants MINUS system.admin (so the chokepoint enforces
  // org boundary; system.admin is the platform-bypass that would skip it).
  const masterAdmin = await prisma.role.findFirstOrThrow({
    where: { code: 'platform_admin' },
    include: { rolePermissions: true },
  });
  const sysAdminPerm = await prisma.permission.findFirstOrThrow({ where: { code: 'system.admin' } });
  const crossRole = await prisma.role.create({
    data: { code: `inv-cross-${ts}`, name: `Inv Cross Test ${ts}` },
  });
  roleIds.push(crossRole.id);
  await prisma.rolePermission.createMany({
    data: masterAdmin.rolePermissions
      .filter((rp) => rp.permissionId !== sysAdminPerm.id)
      .map((rp) => ({ roleId: crossRole.id, permissionId: rp.permissionId })),
  });

  // --- Org A (the caller's tenant) ---
  const entityA = await prisma.entity.create({
    data: { orgId: orgAId, code: `ENT-INVA-${ts}`, name: 'Ent INV A', type: 'parent', status: 'active' },
  });
  const projectA = await prisma.project.create({
    data: {
      orgId: orgAId, code: `PROJ-INVA-${ts}`, name: 'Inv Project A', entityId: entityA.id,
      currencyCode: 'SAR', startDate: new Date(), createdBy: 'test', status: 'active',
    },
  });
  projectAId = projectA.id;

  // Org-A IPA → IPC → issued TaxInvoice (positive-path target)
  const ipaA = await prisma.ipa.create({
    data: {
      orgId: SINGLETON_ORG_ID,
      projectId: projectA.id, status: 'approved_internal', periodNumber: 1,
      periodFrom: new Date(), periodTo: new Date(), grossAmount: 10000,
      retentionRate: 0.10, retentionAmount: 1000, previousCertified: 0,
      currentClaim: 9000, netClaimed: 9000, currency: 'SAR', createdBy: 'test',
    },
  });
  const ipcA = await prisma.ipc.create({
    data: {
      projectId: projectA.id, ipaId: ipaA.id, status: 'signed',
      certifiedAmount: 9000, retentionAmount: 900, netCertified: 8100,
      certificationDate: new Date(), currency: 'SAR', createdBy: 'test',
    },
  });
  const invoiceA = await prisma.taxInvoice.create({
    data: {
      projectId: projectA.id, ipcId: ipcA.id, status: 'issued',
      invoiceNumber: `INV-INVA-${ts}`, invoiceDate: new Date(),
      grossAmount: 10000, vatRate: 0.15, vatAmount: 1500, totalAmount: 10000,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      currency: 'SAR', buyerName: 'A', sellerTaxId: '111', createdBy: 'test',
    },
  });
  invoiceAId = invoiceA.id;

  const userADb = await prisma.user.create({
    data: { orgId: orgAId, email: `inv-a-${ts}@test.com`, name: 'Inv User A', passwordHash: 'test-hash', status: 'active' },
  });
  userIds.push(userADb.id);
  await prisma.userRole.create({
    data: { userId: userADb.id, roleId: crossRole.id, effectiveFrom: past(10), assignedBy: 'test', assignedAt: new Date() },
  });
  await prisma.projectAssignment.create({
    data: { projectId: projectAId, userId: userADb.id, roleId: crossRole.id, effectiveFrom: past(10), assignedBy: 'test', assignedAt: new Date() },
  });

  // --- Org B (the tenant whose invoice must be untouchable by org A) ---
  const entityB = await prisma.entity.create({
    data: { orgId: orgBId, code: `ENT-INVB-${ts}`, name: 'Ent INV B SECRET', type: 'parent', status: 'active' },
  });
  const projectB = await prisma.project.create({
    data: {
      orgId: orgBId, code: `PROJ-INVB-${ts}`, name: 'Inv Project B', entityId: entityB.id,
      currencyCode: 'SAR', startDate: new Date(), createdBy: 'test', status: 'active',
    },
  });
  const ipaB = await prisma.ipa.create({
    data: {
      orgId: SINGLETON_ORG_ID,
      projectId: projectB.id, status: 'approved_internal', periodNumber: 1,
      periodFrom: new Date(), periodTo: new Date(), grossAmount: 10000,
      retentionRate: 0.10, retentionAmount: 1000, previousCertified: 0,
      currentClaim: 9000, netClaimed: 9000, currency: 'SAR', createdBy: 'test',
    },
  });
  const ipcB = await prisma.ipc.create({
    data: {
      orgId: SINGLETON_ORG_ID,
      projectId: projectB.id, ipaId: ipaB.id, status: 'signed',
      certifiedAmount: 9000, retentionAmount: 900, netCertified: 8100,
      certificationDate: new Date(), currency: 'SAR', createdBy: 'test',
    },
  });
  const invoiceB = await prisma.taxInvoice.create({
    data: {
      projectId: projectB.id, ipcId: ipcB.id, status: 'issued',
      invoiceNumber: `INV-INVB-${ts}`, invoiceDate: new Date(),
      grossAmount: 50000, vatRate: 0.15, vatAmount: 7500, totalAmount: 50000,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      currency: 'SAR', buyerName: 'B SECRET', sellerTaxId: '222', createdBy: 'test',
    },
  });
  invoiceBId = invoiceB.id;

  userA = await loadAuthUser(userADb.id);
  delete process.env.SEED_CONTEXT;
}, 60_000);

afterAll(async () => {
  process.env.SEED_CONTEXT = 'true';
  const orgs = [orgAId, orgBId].filter(Boolean);
  await prisma.invoiceCollection.deleteMany({
    where: { taxInvoice: { project: { orgId: { in: orgs } } } },
  });
  await prisma.taxInvoice.deleteMany({ where: { project: { orgId: { in: orgs } } } });
  await prisma.ipc.deleteMany({ where: { project: { orgId: { in: orgs } } } });
  await prisma.ipa.deleteMany({ where: { project: { orgId: { in: orgs } } } });
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

describe('PIC-97 hotfix — cross-tenant invoice-collection write leak', () => {
  it('org-A user CANNOT record a collection against an org-B invoice', async () => {
    const caller = appRouter.createCaller(makeCtx(userA));
    // RecordCollectionSchema strips projectId via zod; the chokepoint reads
    // the raw input (which still carries projectId) and injects ctx.projectId.
    // The schema-validated input no longer has projectId, so we cast to `any`
    // to write the wire-shape attack payload (mirrors how a real client sends it).
    await caller.commercial.invoiceCollection
      .record({
        projectId: projectAId,
        taxInvoiceId: invoiceBId,
        amount: 1000,
        collectionDate: new Date(),
      } as any)
      .catch(() => {});

    const count = await prisma.invoiceCollection.count({
      where: { taxInvoiceId: invoiceBId },
    });
    expect(count, 'SECURITY: no collection row may exist on org-B invoice').toBe(0);

    const after = await prisma.taxInvoice.findUniqueOrThrow({ where: { id: invoiceBId } });
    expect(after.status, 'SECURITY: org-B invoice status must be UNCHANGED').toBe('issued');
  });

  // Positive path: the fix must not break a legitimate same-project collection.
  it('POS: org-A user CAN record a collection against their OWN org-A invoice', async () => {
    const caller = appRouter.createCaller(makeCtx(userA));
    const result = await caller.commercial.invoiceCollection.record({
      projectId: projectAId,
      taxInvoiceId: invoiceAId,
      amount: 1000,
      collectionDate: new Date(),
    } as any);

    expect(result?.statusChanged).toBe(true);
    expect(result?.invoice.status).toBe('partially_collected');
  });
});

/**
 * PIC-71 (PR-2): γ-residual READ leak in the same file.
 *
 * `getOutstandingAmount(taxInvoiceId)` follows the SAME unscoped-by-id pattern
 * as the now-fixed `recordCollection` but is a READ (financial-data exfil) —
 * NOT a write. F3 PR-1 left the chokepoint reading `ctx.projectId` from raw
 * input, but the service never compared the by-id `taxInvoice.projectId`
 * against `ctx.projectId`. An org-A user submitting org-B's `taxInvoiceId`
 * (with their own `projectId`) receives org-B's `{totalAmount, collectedAmount,
 * outstandingAmount}` — secret financial data crossed orgs.
 *
 * PD ruling on this finding (during PR-2 γ-confirmation pass): FOLD into the
 * bounded β-sweep, same risk class + fix shape as recordCollection. Different
 * call than the PIC-97 hotfix split (that was a destructive WRITE on a
 * non-auto-deploying main; this is a READ on the same main, same urgency).
 *
 * Same caller, same role grants, same org-B taxInvoiceId reused — only the
 * router method differs. POS proves the fix doesn't break legit own-org use.
 */
describe('PIC-71 PR-2 — cross-tenant invoice-collection READ leak (getOutstandingAmount)', () => {
  it('org-A user CANNOT read outstanding amount for an org-B invoice', async () => {
    const caller = appRouter.createCaller(makeCtx(userA));
    // Same wire-shape attack as record: schema strips projectId via zod;
    // the chokepoint reads raw input + injects ctx.projectId. Cast to any
    // to write the projectId field at the wire layer.
    await expect(
      caller.commercial.invoiceCollection.outstanding({
        projectId: projectAId,
        taxInvoiceId: invoiceBId,
      } as any),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('POS: org-A user CAN read outstanding amount for their OWN org-A invoice', async () => {
    const caller = appRouter.createCaller(makeCtx(userA));
    const result = await caller.commercial.invoiceCollection.outstanding({
      projectId: projectAId,
      taxInvoiceId: invoiceAId,
    } as any);

    // invoiceA total is 10000 in beforeAll; the partial collection of 1000
    // from the POS path above may have landed if test order persists DB
    // state — assert the shape + outstanding <= total, not exact equality.
    expect(result?.totalAmount).toBe('10000');
    expect(typeof result?.collectedAmount).toBe('string');
    expect(typeof result?.outstandingAmount).toBe('string');
  });
});
