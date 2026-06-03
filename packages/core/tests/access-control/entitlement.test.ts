/**
 * PIC-98 PR-2 (F4) — Entitlement filter tests.
 *
 * Two layers of coverage:
 *
 * **Unit (no DB):** `filterPermissionsByEntitlement` + helpers from
 * @fmksa/contracts/modules — verify the pure entitlement logic with
 * hardcoded permission arrays. No DB or org setup needed.
 *
 * **Integration (with DB):** `getPermissionCodes` from @fmksa/core
 * access-control — verify the chokepoint actually filters with a real
 * Organization.enabledModules row. Creates a custom org with a LIMITED
 * module set (`[commercial]` only) + a user holding the full
 * platform_admin grant, then proves:
 *   - Platform-always-on perms (system/posting/audit/reconciliation/user/
 *     role/project_settings) PASS regardless of enabledModules.
 *   - commercial.* perms pass (module enabled).
 *   - procurement / budget / documents / drawings / layer1 perms are
 *     FILTERED OUT (modules not enabled).
 *
 * No cross-org RED proofs in this PR — those land in PR-3a/b/c when
 * tenant-admin reachability scoping is added.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@fmksa/db';
import {
  filterPermissionsByEntitlement,
  isPlatformAlwaysOnPermission,
  moduleForPermission,
  MODULE_KEYS,
  PLATFORM_ALWAYS_ON_RESOURCES,
  type ModuleKey,
} from '@fmksa/contracts';
import { assertTestDb } from '../helpers/assert-test-db';
import { getPermissionCodes } from '../../src/access-control/permissions';

// ---------------------------------------------------------------------------
// UNIT TESTS — pure entitlement logic, no DB
// ---------------------------------------------------------------------------

describe('PIC-98 PR-2 — entitlement registry helpers (unit, no DB)', () => {
  describe('isPlatformAlwaysOnPermission', () => {
    it('returns true for every platform-always-on resource', () => {
      for (const resource of PLATFORM_ALWAYS_ON_RESOURCES) {
        expect(isPlatformAlwaysOnPermission(`${resource}.view`), `${resource}.view should be platform-always-on`).toBe(true);
        expect(isPlatformAlwaysOnPermission(`${resource}.admin`), `${resource}.admin should be platform-always-on`).toBe(true);
      }
    });

    it('returns false for sellable-module perms', () => {
      expect(isPlatformAlwaysOnPermission('ipa.view')).toBe(false);
      expect(isPlatformAlwaysOnPermission('purchase_order.create')).toBe(false);
      expect(isPlatformAlwaysOnPermission('document.upload')).toBe(false);
      expect(isPlatformAlwaysOnPermission('drawing.view')).toBe(false);
    });

    it('returns false for unknown resources', () => {
      expect(isPlatformAlwaysOnPermission('unregistered.view')).toBe(false);
    });

    it('returns true for a bare resource name (no dot)', () => {
      expect(isPlatformAlwaysOnPermission('system')).toBe(true);
      expect(isPlatformAlwaysOnPermission('posting')).toBe(true);
    });
  });

  describe('moduleForPermission', () => {
    it('maps commercial perms to commercial module', () => {
      expect(moduleForPermission('ipa.view')).toBe('commercial');
      expect(moduleForPermission('ipc.approve')).toBe('commercial');
      expect(moduleForPermission('tax_invoice.issue')).toBe('commercial');
      expect(moduleForPermission('invoice_collection.create')).toBe('commercial');
    });

    it('maps procurement perms to procurement module', () => {
      expect(moduleForPermission('rfq.view')).toBe('procurement');
      expect(moduleForPermission('purchase_order.create')).toBe('procurement');
      expect(moduleForPermission('vendor_contract.terminate')).toBe('procurement');
      expect(moduleForPermission('item_catalog.edit')).toBe('procurement');
    });

    it('maps budget perms to budget module', () => {
      expect(moduleForPermission('budget.view')).toBe('budget');
      expect(moduleForPermission('expense.approve')).toBe('budget');
    });

    it('maps documents/drawings/layer1 perms correctly', () => {
      expect(moduleForPermission('document.upload')).toBe('documents');
      expect(moduleForPermission('drawing.review')).toBe('drawings');
      expect(moduleForPermission('intercompany_contract.create')).toBe('layer1');
      expect(moduleForPermission('prime_contract.sign')).toBe('layer1');
    });

    it('returns null for platform-always-on perms', () => {
      for (const resource of PLATFORM_ALWAYS_ON_RESOURCES) {
        expect(moduleForPermission(`${resource}.admin`)).toBeNull();
      }
    });

    it('returns null for unknown resources (closed-set entitlement)', () => {
      expect(moduleForPermission('unregistered.view')).toBeNull();
    });
  });

  describe('filterPermissionsByEntitlement', () => {
    it('platform-always-on perms pass even with NO modules enabled', () => {
      const platformPerms = [
        'system.admin',
        'posting.view',
        'posting.retry',
        'audit.view',
        'reconciliation.view',
        'user.create',
        'role.assign',
        'project_settings.edit',
      ];
      const result = filterPermissionsByEntitlement(platformPerms, []);
      expect(result.sort()).toEqual(platformPerms.sort());
    });

    it('sellable-module perms FILTERED OUT when module not enabled', () => {
      const input = ['ipa.view', 'purchase_order.create', 'document.upload'];
      const result = filterPermissionsByEntitlement(input, ['commercial']);
      // Only commercial.* perm should pass; procurement + documents filtered out
      expect(result).toEqual(['ipa.view']);
    });

    it('sellable-module perms PASS when module is enabled', () => {
      const input = ['ipa.view', 'purchase_order.create', 'document.upload'];
      const result = filterPermissionsByEntitlement(input, [
        'commercial',
        'procurement',
        'documents',
      ]);
      expect(result.sort()).toEqual(input.sort());
    });

    it('unknown-resource perms BLOCKED by default (closed-set)', () => {
      const input = ['unknown_module.view', 'ipa.view'];
      const result = filterPermissionsByEntitlement(input, ['commercial']);
      expect(result).toEqual(['ipa.view']);
    });

    it('no-op when ALL sellable modules enabled (preserves existing behaviour)', () => {
      const input = [
        'system.admin',
        'ipa.view',
        'purchase_order.create',
        'budget.view',
        'document.upload',
        'drawing.review',
        'intercompany_contract.create',
      ];
      const result = filterPermissionsByEntitlement(input, MODULE_KEYS);
      expect(result.sort()).toEqual(input.sort());
    });

    it('platform-always-on + sellable mix — only sellable filtered', () => {
      const input = [
        'system.admin',
        'posting.view',
        'ipa.view', // commercial — enabled
        'purchase_order.create', // procurement — NOT enabled
        'document.upload', // documents — NOT enabled
      ];
      const result = filterPermissionsByEntitlement(input, ['commercial']);
      expect(result.sort()).toEqual(
        ['system.admin', 'posting.view', 'ipa.view'].sort(),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// INTEGRATION TESTS — getPermissionCodes against a real DB org row
// ---------------------------------------------------------------------------

const ts = Date.now();
let limitedOrgId: string;
let limitedOrgUserId: string;
let limitedOrgRoleId: string;

describe('PIC-98 PR-2 — getPermissionCodes chokepoint filter (DB integration)', () => {
  beforeAll(async () => {
    assertTestDb();
    process.env.SEED_CONTEXT = 'true';

    // Create a custom org with LIMITED enabled-modules (only commercial).
    const org = await prisma.organization.create({
      data: {
        slug: `pic98-pr2-limited-${ts}`,
        name: 'PIC-98 PR-2 Limited Org',
        enabledModules: ['commercial'], // ONLY commercial — proves filter
      },
    });
    limitedOrgId = org.id;

    // Look up the platform_admin role (holds ALL catalog perms via
    // seedMasterAdminAllPermissions; renamed from master_admin in PR-1).
    const platformAdminRole = await prisma.role.findFirstOrThrow({
      where: { code: 'platform_admin' },
    });
    limitedOrgRoleId = platformAdminRole.id;

    // Create a user IN the limited org, grant them platform_admin role —
    // they get the full catalog from RBAC, but entitlement should filter
    // down to commercial-only + platform-always-on.
    const user = await prisma.user.create({
      data: {
        orgId: limitedOrgId,
        email: `pic98-pr2-limited-${ts}@test.com`,
        name: 'PIC-98 PR-2 Limited Org User',
        passwordHash: 'test-hash',
        status: 'active',
      },
    });
    limitedOrgUserId = user.id;

    const past10 = new Date();
    past10.setDate(past10.getDate() - 10);
    await prisma.userRole.create({
      data: {
        userId: limitedOrgUserId,
        roleId: limitedOrgRoleId,
        effectiveFrom: past10,
        assignedBy: 'test',
        assignedAt: new Date(),
      },
    });

    delete process.env.SEED_CONTEXT;
  }, 60_000);

  afterAll(async () => {
    process.env.SEED_CONTEXT = 'true';
    await prisma.userRole.deleteMany({ where: { userId: limitedOrgUserId } });
    await prisma.user.deleteMany({ where: { id: limitedOrgUserId } });
    await prisma.organization.deleteMany({ where: { id: limitedOrgId } });
    delete process.env.SEED_CONTEXT;
  }, 60_000);

  it('Platform-always-on permissions PASS through the filter (system.admin, posting.*, etc.)', async () => {
    const codes = await getPermissionCodes(limitedOrgUserId);

    // The user holds the FULL catalog at the RBAC layer (via platform_admin).
    // Platform-always-on perms must pass regardless of enabledModules.
    //
    // NOT every resource in PLATFORM_ALWAYS_ON_RESOURCES has perms seeded
    // today — e.g. `reconciliation` is router-gated by `posting.view`
    // without its own resource perms, and `project_settings` may be the
    // same. We pin specific known perms instead of iterating
    // PLATFORM_ALWAYS_ON_RESOURCES wholesale.
    expect(codes, 'system.admin (platform marker) MUST pass').toContain('system.admin');
    expect(codes, 'posting.view (PIC-92 platform-admin-exclusive) MUST pass').toContain('posting.view');

    // For every platform resource that HAS perms seeded, prove its perms
    // weren't filtered out. We compute the "platform perms held by RBAC"
    // independently of the filter to avoid pinning to seeded counts.
    const rolePerms = await prisma.rolePermission.findMany({
      where: { role: { code: 'platform_admin' } },
      include: { permission: true },
    });
    const platformPermsHeld = rolePerms
      .map((rp) => rp.permission.code)
      .filter((c) => {
        const dot = c.indexOf('.');
        const resource = dot === -1 ? c : c.slice(0, dot);
        return (PLATFORM_ALWAYS_ON_RESOURCES as readonly string[]).includes(resource);
      });
    for (const platformPerm of platformPermsHeld) {
      expect(codes, `platform-always-on perm '${platformPerm}' MUST pass the filter`).toContain(platformPerm);
    }
  });

  it('commercial.* perms PASS (module enabled)', async () => {
    const codes = await getPermissionCodes(limitedOrgUserId);
    const commercialPerms = codes.filter((c) => moduleForPermission(c) === 'commercial');
    expect(commercialPerms.length, 'expected commercial perms to pass').toBeGreaterThan(0);
    // Spot-check a known commercial perm:
    expect(codes).toContain('ipa.view');
  });

  it('Non-enabled sellable-module perms FILTERED OUT (procurement/budget/documents/drawings/layer1)', async () => {
    const codes = await getPermissionCodes(limitedOrgUserId);

    const blockedModules: ModuleKey[] = ['procurement', 'budget', 'documents', 'drawings', 'layer1'];
    for (const moduleKey of blockedModules) {
      const leakedPerms = codes.filter((c) => moduleForPermission(c) === moduleKey);
      expect(leakedPerms, `expected NO ${moduleKey}.* perms to pass the filter (org has only commercial enabled), got: ${leakedPerms.join(', ')}`).toEqual([]);
    }
  });

  it('Re-enabling a module via enabledModules update restores its perms (no role mutation)', async () => {
    // Before: codes should NOT include procurement perms (per prior test)
    const before = await getPermissionCodes(limitedOrgUserId);
    const procurementBefore = before.filter((c) => moduleForPermission(c) === 'procurement');
    expect(procurementBefore).toEqual([]);

    // Platform-admin enables procurement (this is the surface PR-4 ships;
    // here we update the column directly to prove the filter responds).
    await prisma.organization.update({
      where: { id: limitedOrgId },
      data: { enabledModules: ['commercial', 'procurement'] },
    });

    // After: procurement perms should now appear
    const after = await getPermissionCodes(limitedOrgUserId);
    const procurementAfter = after.filter((c) => moduleForPermission(c) === 'procurement');
    expect(procurementAfter.length, 'enabling procurement should expose procurement.* perms').toBeGreaterThan(0);

    // Restore to single-commercial (so the next test sees the limited state)
    await prisma.organization.update({
      where: { id: limitedOrgId },
      data: { enabledModules: ['commercial'] },
    });
  });

  it('RolePermission rows NEVER mutated by getPermissionCodes (filter-on-top invariant)', async () => {
    const before = await prisma.rolePermission.count({
      where: { roleId: limitedOrgRoleId },
    });

    await getPermissionCodes(limitedOrgUserId);

    const after = await prisma.rolePermission.count({
      where: { roleId: limitedOrgRoleId },
    });

    expect(after).toBe(before);
  });
});
