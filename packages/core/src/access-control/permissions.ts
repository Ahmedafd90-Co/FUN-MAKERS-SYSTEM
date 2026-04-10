/**
 * Role and permission resolution.
 *
 * Core queries:
 *   - getEffectiveRoles(userId, at?)
 *   - getPermissionCodes(userId, at?)
 *   - hasPermission(userId, permissionCode, at?)
 */

import { prisma } from '@fmksa/db';

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
 * point in time.  This is the union across all effective roles.
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

  const codes = new Set(rolePermissions.map((rp) => rp.permission.code));
  return [...codes];
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
