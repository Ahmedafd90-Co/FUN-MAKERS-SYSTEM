/**
 * Seed-coverage regression test — PIC-27.
 *
 * Closes the gap that produced the May 5 smoke-test bug: PR-A2 (PIC-13) added
 * 24 Layer 1 permission codes to the catalog but never granted them to any
 * role. master_admin therefore had 181 perms instead of all of them, and the
 * Participants tab — gated on `project_participant.view` after the M4 fix —
 * was hidden for the only user who could test it.
 *
 * The check is structural and runs after the full seed orchestration: every
 * permission in the catalog must be granted to at least one role, and
 * master_admin must specifically have every code. If a future PR adds catalog
 * codes without wiring grants, this test fails loudly and points at the gap.
 *
 * Mirrors the idempotency.test.ts pattern: real DB, runs the seed sequence in
 * dependency order, then asserts on the final state.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

import { assertTestDb } from '../helpers/assert-test-db';
import { seedCountries } from '../../src/seed/countries';
import { seedCurrencies } from '../../src/seed/currencies';
import { seedAppSettings } from '../../src/seed/app-settings';
import { seedStatusDictionaries } from '../../src/seed/status-dictionaries';
import { seedPermissions } from '../../src/seed/permissions';
import { seedRoles } from '../../src/seed/roles';
import { seedRolePermissions } from '../../src/seed/role-permissions';
import { seedCommercialPermissions } from '../../src/seed/commercial-permissions';
import { seedCommercialRolePermissions } from '../../src/seed/commercial-role-permissions';
import { seedProcurementPermissions } from '../../src/seed/procurement-permissions';
import { seedProcurementRolePermissions } from '../../src/seed/procurement-role-permissions';
import { seedLayer1Permissions } from '../../src/seed/layer1-permissions';
import { seedLayer1RolePermissions } from '../../src/seed/layer1-role-permissions';
import { seedQaTestRolePermissions } from '../../src/seed/qa-test-role-permissions';

const prisma = new PrismaClient();

/**
 * Runs the minimum seed sequence needed to populate the catalog and grants.
 * No demo data, no notifications, no workflow templates — those are out of
 * scope for permission coverage.
 */
async function runPermissionSeeds() {
  // Foundation tables required by FK constraints in roles/permissions.
  await seedCountries(prisma);
  await seedCurrencies(prisma);
  await seedAppSettings(prisma);
  await seedStatusDictionaries(prisma);

  // Permissions catalogs (additive across domains).
  await seedPermissions(prisma);
  await seedRoles(prisma);
  await seedRolePermissions(prisma);
  await seedCommercialPermissions(prisma);
  await seedCommercialRolePermissions(prisma);
  await seedProcurementPermissions(prisma);
  await seedProcurementRolePermissions(prisma);
  await seedLayer1Permissions(prisma);
  await seedLayer1RolePermissions(prisma);
  await seedQaTestRolePermissions(prisma);
}

beforeAll(async () => {
  // PIC-37: refuse to write seed data against any DB whose URL doesn't contain `_test`.
  assertTestDb();
  await runPermissionSeeds();
}, 60_000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Seed coverage — every catalog permission must be granted', () => {
  it('every permission in the catalog has at least one role grant', async () => {
    const allPerms = await prisma.permission.findMany({ select: { id: true, code: true } });
    expect(allPerms.length).toBeGreaterThan(0);

    const granted = await prisma.rolePermission.findMany({
      select: { permissionId: true },
      distinct: ['permissionId'],
    });
    const grantedIds = new Set(granted.map((g) => g.permissionId));

    const ungranted = allPerms.filter((p) => !grantedIds.has(p.id));

    if (ungranted.length > 0) {
      const codes = ungranted.map((p) => p.code).sort().join(', ');
      // Specific failure message per PIC-27 spec — not "expected N got M".
      expect.fail(
        `${ungranted.length} permission code(s) are in the catalog but not granted to any role: ${codes}. ` +
          `Each code must be assigned in one of: role-permissions.ts, commercial-role-permissions.ts, ` +
          `procurement-role-permissions.ts, layer1-role-permissions.ts, or qa-test-role-permissions.ts.`,
      );
    }
  });

  it('master_admin has every permission in the catalog', async () => {
    const masterAdmin = await prisma.role.findFirst({ where: { code: 'master_admin' } });
    expect(masterAdmin).not.toBeNull();

    const allPerms = await prisma.permission.findMany({ select: { id: true, code: true } });
    const adminGrants = await prisma.rolePermission.findMany({
      where: { roleId: masterAdmin!.id },
      select: { permissionId: true },
    });
    const adminIds = new Set(adminGrants.map((g) => g.permissionId));

    const missing = allPerms.filter((p) => !adminIds.has(p.id));

    if (missing.length > 0) {
      const codes = missing.map((p) => p.code).sort().join(', ');
      expect.fail(
        `master_admin role is missing ${missing.length} permission code(s) that exist in the catalog: ${codes}. ` +
          `master_admin must be granted every catalog code (this is the regression net for future drift).`,
      );
    }
  });

  it('every role-permission row resolves to a real role and permission (no orphans)', async () => {
    // Hand-crafted SQL because Prisma's API can't express "rows whose FK
    // target is missing" cleanly without N+1 queries. Catches BOTH directions
    // of orphan: dropped permissions AND dropped roles.
    const orphans = await prisma.$queryRaw<Array<{ role_id: string; permission_id: string }>>`
      SELECT rp.role_id, rp.permission_id
      FROM role_permissions rp
      LEFT JOIN roles r ON r.id = rp.role_id
      LEFT JOIN permissions p ON p.id = rp.permission_id
      WHERE r.id IS NULL OR p.id IS NULL
    `;

    if (orphans.length > 0) {
      expect.fail(
        `${orphans.length} role_permissions row(s) reference a role_id or permission_id that no longer exists. ` +
          `This indicates either a dropped role/permission or a broken seed orchestration. ` +
          `Sample orphan: roleId=${orphans[0]?.role_id}, permissionId=${orphans[0]?.permission_id}.`,
      );
    }
  });

  it('master_admin has all 24 Layer 1 codes (PIC-26 regression net)', async () => {
    // Specific guard for the May 5 smoke-test bug that motivated this PR.
    const masterAdmin = await prisma.role.findFirst({ where: { code: 'master_admin' } });
    expect(masterAdmin).not.toBeNull();

    const layer1Prefixes = [
      'project_participant.',
      'prime_contract.',
      'intercompany_contract.',
      'entity_legal_details.',
    ];

    const allLayer1 = await prisma.permission.findMany({
      where: {
        OR: layer1Prefixes.map((prefix) => ({ code: { startsWith: prefix } })),
      },
      select: { id: true, code: true },
    });

    expect(allLayer1.length).toBe(24);

    const adminGrants = await prisma.rolePermission.findMany({
      where: {
        roleId: masterAdmin!.id,
        permissionId: { in: allLayer1.map((p) => p.id) },
      },
      select: { permissionId: true },
    });

    expect(adminGrants.length).toBe(24);
  });

  it('view_only_demo role has only *.view permissions (PIC-25 fixture sanity)', async () => {
    const viewOnly = await prisma.role.findFirst({ where: { code: 'view_only_demo' } });
    expect(viewOnly).not.toBeNull();

    const grants = await prisma.rolePermission.findMany({
      where: { roleId: viewOnly!.id },
      include: { permission: true },
    });

    expect(grants.length).toBeGreaterThan(0);

    const nonViewGrants = grants.filter((g) => g.permission.action !== 'view');
    if (nonViewGrants.length > 0) {
      const codes = nonViewGrants.map((g) => g.permission.code).sort().join(', ');
      expect.fail(
        `view_only_demo has ${nonViewGrants.length} non-view permission(s): ${codes}. ` +
          `This role must contain only permissions where action='view'.`,
      );
    }
  });

  it('no_perm_demo role exists and has zero permission grants (PIC-25 fixture sanity)', async () => {
    const noPerm = await prisma.role.findFirst({ where: { code: 'no_perm_demo' } });
    expect(noPerm).not.toBeNull();

    const grants = await prisma.rolePermission.count({
      where: { roleId: noPerm!.id },
    });

    expect(grants).toBe(0);
  });
});
