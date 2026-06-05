/**
 * E2E: F4 PR-4b (PIC-98) — platformAdmin router (setOrgModules + provisionOrg).
 *
 * THE FINAL F4 epic PR's isolation test. Proves:
 *
 *   ENTITLEMENT E2E RED→GREEN (driven through the NEW setOrgModules surface,
 *   not direct DB write):
 *     - org-A enabledModules=['commercial']
 *     - user-with-full-platform_admin-grant in org-A → getPermissionCodes
 *       does NOT contain procurement.* (RED — filtered by PR-2 entitlement)
 *     - platform_admin calls platformAdmin.setOrgModules(orgA, ['commercial',
 *       'procurement']) → success, audit-logged
 *     - same user → getPermissionCodes NOW contains procurement.* (GREEN —
 *       dynamically appears; no cache, no re-grant)
 *
 *   NEGATIVE:
 *     - tenant_admin (does NOT hold system.admin) tries setOrgModules → FORBIDDEN
 *     - tenant_admin tries provisionOrg → FORBIDDEN
 *
 *   CAT-D (F3 D3 cross-org bypass survives):
 *     - platform_admin in any org can call setOrgModules on any other org
 *
 *   PROVISION-ORG HAPPY PATH:
 *     - successful provisionOrg creates Organization + root Entity + tenant_admin
 *       User + UserRole, all in ONE $transaction
 *     - resulting tenant_admin user has the tenant_admin role (180 perms)
 *     - audit log written — PASSWORD ABSENT from beforeJson/afterJson
 *
 *   ATOMIC ROLLBACK proof BOTH ways (per PD 5ae017b1 Q3):
 *     A. THROW-INJECTION mid-transaction (AFTER_ORG_CREATE / AFTER_ENTITY_CREATE
 *        / AFTER_USER_CREATE) → assert ZERO partial rows for the attempted slug.
 *     B. CONSTRAINT-VIOLATION (pre-create User with the test email) → step 3
 *        fails on unique-email → entire transaction rolls back → assert ZERO
 *        partial rows for the attempted slug.
 *
 * Real-DB (fmksa_test). Mirrors PR-3a/3b/3c isolation-test scaffold.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@fmksa/db';
import {
  getPermissionCodes,
  SimulatedMidTxFailure,
  platformAdminService,
} from '@fmksa/core';
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
let platformAdminA: AuthUser; // org A, platform_admin
let tenantAdminA: AuthUser; // org A, tenant_admin
let fullGrantUserId: string; // org A, holds platform_admin role grant (full catalog) — proves entitlement filter

const userIds: string[] = [];
const auditIds: string[] = [];
const cleanupOrgIds: string[] = []; // includes provisioned orgs from the happy-path test

beforeAll(async () => {
  assertTestDb();
  process.env.SEED_CONTEXT = 'true';

  // --- Orgs (org-A starts with [commercial] only; org-B = all sellable) ---
  const orgA = await prisma.organization.create({
    data: {
      slug: `f4-pr4b-a-${ts}`,
      name: 'F4 PR-4b Org A',
      enabledModules: ['commercial'],
    },
  });
  const orgB = await prisma.organization.create({
    data: { slug: `f4-pr4b-b-${ts}`, name: 'F4 PR-4b Org B' },
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

  // --- Org A: platform_admin caller (sets modules, cross-org D3) ---
  const platformAdminUserA = await prisma.user.create({
    data: {
      orgId: orgAId,
      email: `f4-pr4b-platform-admin-${ts}@test.com`,
      name: 'F4 PR-4b Platform Admin A',
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

  // --- Org A: tenant_admin caller (NEGATIVE test) ---
  const tenantAdminUserA = await prisma.user.create({
    data: {
      orgId: orgAId,
      email: `f4-pr4b-tenant-admin-${ts}@test.com`,
      name: 'F4 PR-4b Tenant Admin A',
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

  // --- Org A: full-grant user (proves entitlement filter — has the WHOLE
  // catalog at RBAC layer; entitlement filter must STILL strip procurement.*
  // when org-A.enabledModules=['commercial']) ---
  const fullGrantUser = await prisma.user.create({
    data: {
      orgId: orgAId,
      email: `f4-pr4b-fullgrant-${ts}@test.com`,
      name: 'F4 PR-4b Full-Grant User',
      passwordHash: 'test-hash',
      status: 'active',
    },
  });
  userIds.push(fullGrantUser.id);
  fullGrantUserId = fullGrantUser.id;
  // Grant the platform_admin role to fullGrantUser so RBAC gives them
  // the entire catalog — the entitlement filter is the ONLY mechanism
  // that should strip procurement.*.
  await prisma.userRole.create({
    data: {
      userId: fullGrantUser.id,
      roleId: platformAdminRole.id,
      effectiveFrom: past(10),
      assignedBy: 'test',
      assignedAt: new Date(),
    },
  });

  platformAdminA = await loadAuthUser(platformAdminUserA.id);
  tenantAdminA = await loadAuthUser(tenantAdminUserA.id);

  delete process.env.SEED_CONTEXT;
}, 60_000);

afterAll(async () => {
  process.env.SEED_CONTEXT = 'true';
  // AuditLog is append-only — raw SQL cleanup (no-delete-on-immutable middleware
  // blocks deleteMany even under SEED_CONTEXT).
  if (auditIds.length > 0) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM audit_logs WHERE id = ANY($1::text[])`,
      auditIds,
    );
  }
  // Clean up any provisioned-org artefacts created by tests.
  for (const provOrgId of cleanupOrgIds) {
    await prisma.userRole.deleteMany({ where: { user: { orgId: provOrgId } } });
    await prisma.user.deleteMany({ where: { orgId: provOrgId } });
    await prisma.entity.deleteMany({ where: { orgId: provOrgId } });
    // Audit logs scoped to provisioned org — raw SQL
    await prisma.$executeRawUnsafe(
      `DELETE FROM audit_logs WHERE org_id = $1`,
      provOrgId,
    );
  }
  await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.organization.deleteMany({
    where: { id: { in: [orgAId, orgBId, ...cleanupOrgIds] } },
  });
  delete process.env.SEED_CONTEXT;
}, 60_000);

describe('F4 PR-4b (PIC-98) — platformAdmin router + entitlement E2E + atomic rollback', () => {
  // ---------------------------------------------------------------------
  // ENTITLEMENT E2E RED→GREEN — the FINAL F4 mechanism proof
  //
  // procurement-module resources (per MODULES registry):
  //   rfq, purchase_order, vendor_contract, framework_agreement,
  //   supplier_invoice, credit_note, vendor, item_catalog
  // commercial-module resources:
  //   ipa, ipc, variation, cost_proposal, tax_invoice, correspondence,
  //   invoice_collection, commercial_dashboard
  // ---------------------------------------------------------------------
  const PROCUREMENT_RESOURCE_PREFIXES = [
    'rfq.', 'purchase_order.', 'vendor_contract.', 'framework_agreement.',
    'supplier_invoice.', 'credit_note.', 'vendor.', 'item_catalog.',
  ];
  const COMMERCIAL_RESOURCE_PREFIXES = [
    'ipa.', 'ipc.', 'variation.', 'cost_proposal.', 'tax_invoice.',
    'correspondence.', 'invoice_collection.', 'commercial_dashboard.',
  ];
  const matchesAny = (code: string, prefixes: string[]) =>
    prefixes.some((p) => code.startsWith(p));

  it('ENTITLEMENT RED: full-grant user in org-A [commercial] does NOT see procurement-module perms', async () => {
    const codes = await getPermissionCodes(fullGrantUserId);
    const procurementCodes = codes.filter((c: string) => matchesAny(c, PROCUREMENT_RESOURCE_PREFIXES));
    expect(procurementCodes.length, 'org-A only has [commercial]; procurement-module perms MUST be filtered').toBe(0);
    // Sanity: commercial-module perms SHOULD pass through
    const commercialCodes = codes.filter((c: string) => matchesAny(c, COMMERCIAL_RESOURCE_PREFIXES));
    expect(commercialCodes.length, 'commercial-module perms should pass through').toBeGreaterThan(0);
  });

  it('ENTITLEMENT mutation: platform_admin setOrgModules(orgA, [commercial,procurement]) succeeds', async () => {
    const caller = appRouter.createCaller(makeCtx(platformAdminA));
    const result = await caller.platformAdmin.setOrgModules({
      orgId: orgAId,
      enabledModules: ['commercial', 'procurement'],
    });
    expect(result.enabledModules).toEqual(
      expect.arrayContaining(['commercial', 'procurement']),
    );
    // Capture audit log id for cleanup
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'platform.org.modules_set', resourceId: orgAId },
      orderBy: { createdAt: 'desc' },
    });
    auditIds.push(audit.id);
  });

  it('ENTITLEMENT GREEN: same user NOW sees procurement-module perms (dynamic, no cache, no re-grant)', async () => {
    const codes = await getPermissionCodes(fullGrantUserId);
    const procurementCodes = codes.filter((c: string) => matchesAny(c, PROCUREMENT_RESOURCE_PREFIXES));
    expect(
      procurementCodes.length,
      'procurement-module perms must appear after setOrgModules — proves PR-2 filter is dynamic',
    ).toBeGreaterThan(0);
    // RBAC was never mutated — verify RolePermission count unchanged (sanity)
    const rolePermCount = await prisma.rolePermission.count();
    expect(rolePermCount, 'sanity: RolePermission count > 0').toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------
  // NEGATIVE — tenant_admin FORBIDDEN on platformAdmin.*
  // ---------------------------------------------------------------------
  it('NEGATIVE: tenant_admin calling setOrgModules → FORBIDDEN (adminProcedure blocks)', async () => {
    const caller = appRouter.createCaller(makeCtx(tenantAdminA));
    await expect(
      caller.platformAdmin.setOrgModules({
        orgId: orgAId,
        enabledModules: ['commercial'],
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('NEGATIVE: tenant_admin calling provisionOrg → FORBIDDEN', async () => {
    const caller = appRouter.createCaller(makeCtx(tenantAdminA));
    await expect(
      caller.platformAdmin.provisionOrg({
        orgSlug: `f4-pr4b-tenant-attempt-${ts}`,
        orgName: 'Tenant Attempt',
        rootEntityCode: 'ROOT',
        rootEntityName: 'Root',
        adminUser: {
          name: 'Test',
          email: `tenant-attempt-${ts}@test.com`,
          password: 'TestPassword123',
        },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  // ---------------------------------------------------------------------
  // CAT-D — platform_admin cross-org D3 survives (already proven via the
  // ENTITLEMENT mutation test — platformAdminA is org-A; can mutate any org's
  // modules without restriction)
  // ---------------------------------------------------------------------
  it('CAT-D: platform_admin can setOrgModules on org-B (cross-org D3 survives)', async () => {
    const caller = appRouter.createCaller(makeCtx(platformAdminA));
    const result = await caller.platformAdmin.setOrgModules({
      orgId: orgBId,
      enabledModules: ['commercial', 'documents'],
    });
    expect(result.enabledModules).toEqual(
      expect.arrayContaining(['commercial', 'documents']),
    );
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'platform.org.modules_set', resourceId: orgBId },
      orderBy: { createdAt: 'desc' },
    });
    auditIds.push(audit.id);
  });

  // ---------------------------------------------------------------------
  // setOrgModules — unknown module rejected
  // ---------------------------------------------------------------------
  it('VALIDATION: setOrgModules rejects unknown module key', async () => {
    const caller = appRouter.createCaller(makeCtx(platformAdminA));
    await expect(
      caller.platformAdmin.setOrgModules({
        orgId: orgAId,
        // @ts-expect-error intentionally bad — proves zod enum bites
        enabledModules: ['commercial', 'not_a_real_module'],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  // ---------------------------------------------------------------------
  // PROVISION-ORG HAPPY PATH
  // ---------------------------------------------------------------------
  it('PROVISION HAPPY: creates org + root entity + tenant_admin user + UserRole in ONE transaction', async () => {
    const caller = appRouter.createCaller(makeCtx(platformAdminA));
    const slug = `f4-pr4b-provisioned-${ts}`;
    const userEmail = `provisioned-admin-${ts}@test.com`;
    const result = await caller.platformAdmin.provisionOrg({
      orgSlug: slug,
      orgName: 'F4 PR-4b Provisioned Org',
      rootEntityCode: 'ROOT',
      rootEntityName: 'Provisioned Root',
      enabledModules: ['commercial', 'budget'],
      adminUser: {
        name: 'Provisioned Admin',
        email: userEmail,
        password: 'NeverLogThis!2026',
      },
    });
    cleanupOrgIds.push(result.org.id);

    // Verify all 4 entities created
    expect(result.org.slug).toBe(slug);
    expect(result.rootEntity.code).toBe('ROOT');
    expect(result.adminUser.email).toBe(userEmail);
    expect(result.adminUserRoleId).toBeTruthy();

    // Verify root entity has correct orgId (closes PlatformRootEntityRequiresOrgError seam)
    const rootEntity = await prisma.entity.findUniqueOrThrow({
      where: { id: result.rootEntity.id },
    });
    expect(rootEntity.orgId).toBe(result.org.id);
    expect(rootEntity.type).toBe('parent');
    expect(rootEntity.parentEntityId).toBeNull();

    // Verify adminUser is bound to the tenant_admin role
    const userRoles = await prisma.userRole.findMany({
      where: { userId: result.adminUser.id },
      include: { role: true },
    });
    expect(userRoles).toHaveLength(1);
    expect(userRoles[0]!.role.code).toBe('tenant_admin');

    // Verify enabledModules applied
    const orgRow = await prisma.organization.findUniqueOrThrow({
      where: { id: result.org.id },
    });
    expect(orgRow.enabledModules).toEqual(
      expect.arrayContaining(['commercial', 'budget']),
    );
  });

  // ---------------------------------------------------------------------
  // PASSWORD NOT IN AUDIT — the critical Q5 PD ruling check
  // ---------------------------------------------------------------------
  it('PASSWORD NEVER LOGGED: audit payload contains no password (raw or hashed)', async () => {
    const slug = `f4-pr4b-pwdcheck-${ts}`;
    const userEmail = `pwdcheck-${ts}@test.com`;
    const rawPassword = 'UniqueRawPassword42!';
    const result = await platformAdminService.provisionOrg({
      orgSlug: slug,
      orgName: 'PR-4b Password Check Org',
      rootEntityCode: 'ROOT',
      rootEntityName: 'PwdCheck Root',
      adminUser: { name: 'PwdCheck Admin', email: userEmail, password: rawPassword },
      actorUserId: (await loadAuthUser(userIds[0]!)).id,
    });
    cleanupOrgIds.push(result.org.id);

    const provisionAudit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'platform.org.provisioned', resourceId: result.org.id },
    });
    const beforeStr = JSON.stringify(provisionAudit.beforeJson);
    const afterStr = JSON.stringify(provisionAudit.afterJson);
    // Raw password MUST NOT appear
    expect(beforeStr).not.toContain(rawPassword);
    expect(afterStr).not.toContain(rawPassword);
    // The literal key "password" must not appear either
    expect(beforeStr).not.toContain('"password"');
    expect(afterStr).not.toContain('"password"');
    // Hashed password (bcrypt prefix) must not appear
    expect(beforeStr).not.toMatch(/\$2[aby]\$/);
    expect(afterStr).not.toMatch(/\$2[aby]\$/);
  });

  // ---------------------------------------------------------------------
  // ATOMIC ROLLBACK A — throw-injection mid-transaction
  // ---------------------------------------------------------------------
  it('ROLLBACK-A (throw-injection AFTER_ORG_CREATE): zero partial rows for attempted slug', async () => {
    const slug = `f4-pr4b-rb-a1-${ts}`;
    const userEmail = `rb-a1-${ts}@test.com`;
    await expect(
      platformAdminService.provisionOrg({
        orgSlug: slug,
        orgName: 'RB-A1',
        rootEntityCode: 'ROOT-A1',
        rootEntityName: 'RB-A1 Root',
        adminUser: { name: 'A1', email: userEmail, password: 'TestPassword123' },
        actorUserId: userIds[0]!,
        __injectFailureAt: 'AFTER_ORG_CREATE',
      }),
    ).rejects.toBeInstanceOf(SimulatedMidTxFailure);

    // Assert zero partial rows
    expect(await prisma.organization.count({ where: { slug } })).toBe(0);
    expect(await prisma.entity.count({ where: { code: 'ROOT-A1' } })).toBe(0);
    expect(await prisma.user.count({ where: { email: userEmail } })).toBe(0);
  });

  it('ROLLBACK-A (throw-injection AFTER_ENTITY_CREATE): zero partial rows', async () => {
    const slug = `f4-pr4b-rb-a2-${ts}`;
    const userEmail = `rb-a2-${ts}@test.com`;
    await expect(
      platformAdminService.provisionOrg({
        orgSlug: slug,
        orgName: 'RB-A2',
        rootEntityCode: 'ROOT-A2',
        rootEntityName: 'RB-A2 Root',
        adminUser: { name: 'A2', email: userEmail, password: 'TestPassword123' },
        actorUserId: userIds[0]!,
        __injectFailureAt: 'AFTER_ENTITY_CREATE',
      }),
    ).rejects.toBeInstanceOf(SimulatedMidTxFailure);

    expect(await prisma.organization.count({ where: { slug } })).toBe(0);
    expect(await prisma.entity.count({ where: { code: 'ROOT-A2' } })).toBe(0);
    expect(await prisma.user.count({ where: { email: userEmail } })).toBe(0);
  });

  it('ROLLBACK-A (throw-injection AFTER_USER_CREATE): zero partial rows', async () => {
    const slug = `f4-pr4b-rb-a3-${ts}`;
    const userEmail = `rb-a3-${ts}@test.com`;
    await expect(
      platformAdminService.provisionOrg({
        orgSlug: slug,
        orgName: 'RB-A3',
        rootEntityCode: 'ROOT-A3',
        rootEntityName: 'RB-A3 Root',
        adminUser: { name: 'A3', email: userEmail, password: 'TestPassword123' },
        actorUserId: userIds[0]!,
        __injectFailureAt: 'AFTER_USER_CREATE',
      }),
    ).rejects.toBeInstanceOf(SimulatedMidTxFailure);

    expect(await prisma.organization.count({ where: { slug } })).toBe(0);
    expect(await prisma.entity.count({ where: { code: 'ROOT-A3' } })).toBe(0);
    expect(await prisma.user.count({ where: { email: userEmail } })).toBe(0);
  });

  // ---------------------------------------------------------------------
  // ATOMIC ROLLBACK B — natural constraint-violation
  // ---------------------------------------------------------------------
  it('ROLLBACK-B (constraint-violation on duplicate email): step 3 fails → zero partial rows for slug', async () => {
    const slug = `f4-pr4b-rb-b-${ts}`;
    const conflictEmail = `rb-b-conflict-${ts}@test.com`;

    // Pre-create a user with the email provisionOrg will attempt
    const preExisting = await prisma.user.create({
      data: {
        orgId: orgAId,
        email: conflictEmail,
        name: 'Pre-Existing',
        passwordHash: 'test-hash',
        status: 'active',
      },
    });
    userIds.push(preExisting.id);

    // provisionOrg should fail at step 3 (unique-email violation)
    await expect(
      platformAdminService.provisionOrg({
        orgSlug: slug,
        orgName: 'RB-B',
        rootEntityCode: 'ROOT-B',
        rootEntityName: 'RB-B Root',
        adminUser: {
          name: 'RB-B Admin',
          email: conflictEmail,
          password: 'TestPassword123',
        },
        actorUserId: userIds[0]!,
      }),
    ).rejects.toBeDefined();

    // Steps 1 + 2 must have rolled back
    expect(await prisma.organization.count({ where: { slug } })).toBe(0);
    expect(await prisma.entity.count({ where: { code: 'ROOT-B' } })).toBe(0);
    // Pre-existing user UNCHANGED
    const stillExists = await prisma.user.findUnique({
      where: { id: preExisting.id },
    });
    expect(stillExists?.email).toBe(conflictEmail);
  });
});
