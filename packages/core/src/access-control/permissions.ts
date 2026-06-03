/**
 * Role and permission resolution.
 *
 * Core queries:
 *   - getEffectiveRoles(userId, at?)
 *   - getPermissionCodes(userId, at?)
 *   - hasPermission(userId, permissionCode, at?)
 *
 * PIC-98 PR-2 (F4): `getPermissionCodes` is THE entitlement chokepoint.
 * After assembling the raw RBAC permission set, it filters by the user's
 * organisation's enabled-modules (per the @fmksa/contracts MODULES
 * registry). Platform-always-on resources pass unchanged; sellable-module
 * permissions filtered to enabled modules; unknown resources blocked by
 * default (closed-set entitlement). RolePermission rows are NEVER mutated
 * — entitlement is a FILTER ON TOP of RBAC per PA1.C ruling.
 */

import { prisma } from '@fmksa/db';
import {
  filterPermissionsByEntitlement,
  type ModuleKey,
} from '@fmksa/contracts';

/**
 * Returns the roles that are currently effective for a user at a given point
 * in time.
 *
 * A UserRole is effective when:
 *   - effectiveFrom <= at
 *   - effectiveTo IS NULL  OR  effectiveTo > at
 *
 * The UserRole model does not carry a separate `revokedAt` column; revocation
 * is expressed by setting `effectiveTo` to the revocation timestamp.
 */
export async function getEffectiveRoles(userId: string, at: Date = new Date()) {
  const userRoles = await prisma.userRole.findMany({
    where: {
      userId,
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
    },
    include: { role: true },
  });

  return userRoles.map((ur) => ur.role);
}

/**
 * Returns the de-duplicated set of permission codes the user has at a given
 * point in time.  This is the union across all effective roles, then
 * filtered through the user's organisation's entitlement (PIC-98 PR-2).
 *
 * Pipeline:
 *   1. Resolve effective roles (UserRole rows with temporal window).
 *   2. Assemble raw RolePermission codes (the RBAC layer).
 *   3. Filter through Organization.enabledModules (the entitlement layer).
 *      - Platform-always-on permissions (system/posting/audit/…) pass
 *        unchanged.
 *      - Sellable-module permissions pass only if the owning module is in
 *        enabledModules.
 *      - Unknown resources are blocked by default — closed-set entitlement.
 *
 * The user's org is fetched via a single nested-select query (no extra
 * round-trip). RolePermission rows are NEVER mutated by this function.
 */
export async function getPermissionCodes(
  userId: string,
  at: Date = new Date(),
): Promise<string[]> {
  const roles = await getEffectiveRoles(userId, at);
  if (roles.length === 0) return [];

  const roleIds = roles.map((r) => r.id);

  const rolePermissions = await prisma.rolePermission.findMany({
    where: { roleId: { in: roleIds } },
    include: { permission: true },
  });

  const rawCodes = [
    ...new Set(rolePermissions.map((rp) => rp.permission.code)),
  ];

  // PIC-98 PR-2 (F4) — entitlement filter on top of RBAC. Fetch the user's
  // org's enabled-modules in a single nested query (1 round-trip).
  //
  // Defensive: if the user row is missing (race / soft-deleted user with
  // a still-cached session), return the raw RBAC set unchanged so the
  // caller (which should have already rejected unknown users at the
  // session boundary) gets at least an explicit upstream error rather than
  // a silently-filtered empty set.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      organization: { select: { enabledModules: true } },
    },
  });
  if (!user) return rawCodes;

  // Cast to ModuleKey[] — the DB column is TEXT[] but per PR-2 contract
  // the values are constrained to ModuleKey via the master-provisioning
  // procedure (PR-4). Unknown values from the DB are harmlessly ignored by
  // `filterPermissionsByEntitlement` (they don't match any registered
  // resource → no permissions enabled by them).
  const enabledModules = user.organization
    .enabledModules as readonly ModuleKey[];

  return filterPermissionsByEntitlement(rawCodes, enabledModules);
}

/**
 * Returns `true` when the user holds a specific permission at a given point
 * in time.
 */
export async function hasPermission(
  userId: string,
  permissionCode: string,
  at: Date = new Date(),
): Promise<boolean> {
  const codes = await getPermissionCodes(userId, at);
  return codes.includes(permissionCode);
}
