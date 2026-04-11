/**
 * entityScope tRPC middleware helpers — Task 3.1
 *
 * Enforces entity isolation on every entity-scoped procedure.
 * Entity-scoped records (Vendor, ItemCatalog, ProcurementCategory) use
 * `entityId` instead of `projectId`.
 *
 * Entity membership is derived from ProjectAssignment — NO new tables.
 *
 * Access rules:
 *  1. User must be authenticated.
 *  2. Input must contain `entityId`.
 *  3. User must hold an active project assignment where project.entityId = entityId — OR —
 *     hold `system.admin` (Master Admin).
 *  4. Aggregate all permissions from the user's roles within those assignments.
 *
 * On denial an audit log entry is written and a user-friendly FORBIDDEN
 * error is thrown. On success, `ctx.entityId` and `ctx.entityPermissions`
 * are forwarded to resolvers.
 */

import { TRPCError } from '@trpc/server';
import { prisma } from '@fmksa/db';
import { accessControlService, auditService } from '@fmksa/core';

/**
 * Extracts entityId from an unknown input payload.
 *
 * Both the raw input (pre-Zod) and parsed input (post-Zod) may carry
 * `entityId`. This helper safely checks for its presence.
 */
export function extractEntityId(input: unknown): string | undefined {
  if (
    input != null &&
    typeof input === 'object' &&
    'entityId' in input &&
    typeof (input as Record<string, unknown>).entityId === 'string'
  ) {
    return (input as Record<string, unknown>).entityId as string;
  }
  return undefined;
}

/**
 * Core entity-scope verification logic.
 *
 * Algorithm:
 *   1. Query ProjectAssignment where project.entityId = entityId AND userId = ctx.user.id
 *      - Active assignments only: effectiveFrom <= now, effectiveTo IS NULL or > now, revokedAt IS NULL
 *   2. If no assignments, check for system.admin (Master Admin cross-entity access)
 *   3. If neither, FORBIDDEN (log audit entry)
 *   4. Aggregate permissions: get all role IDs from the user's assignments within this entity,
 *      then get all permission codes from those roles (union of grants)
 *
 * Returns the aggregated entity permissions on success.
 * Throws TRPCError (FORBIDDEN) on denial after writing an audit log.
 */
export async function verifyEntityAccess(opts: {
  userId: string;
  entityId: string;
  path: string;
}): Promise<{ entityPermissions: string[] }> {
  const { userId, entityId, path } = opts;
  const now = new Date();

  // Query active assignments where the project belongs to this entity,
  // including role -> rolePermissions -> permission in ONE query
  const assignments = await prisma.projectAssignment.findMany({
    where: {
      userId,
      revokedAt: null,
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      project: {
        entityId,
      },
    },
    include: {
      role: {
        include: {
          rolePermissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  });

  if (assignments.length > 0) {
    // Aggregate all permission codes from all roles across all assignments
    const permissionCodes = new Set<string>();
    for (const assignment of assignments) {
      for (const rp of assignment.role.rolePermissions) {
        permissionCodes.add(rp.permission.code);
      }
    }
    return { entityPermissions: [...permissionCodes] };
  }

  // Fallback: Master Admin with system.admin permission
  const isAdmin = await accessControlService.hasPermission(userId, 'system.admin');

  if (isAdmin) {
    // Admin gets an empty permissions array — they bypass checks downstream
    return { entityPermissions: ['system.admin'] };
  }

  // Deny — write audit log and throw
  await auditService.log({
    actorSource: 'user',
    actorUserId: userId,
    action: 'access_denied',
    resourceType: 'entity',
    resourceId: entityId,
    projectId: null,
    beforeJson: {},
    afterJson: { path, reason: 'no_entity_assignment' },
  });

  throw new TRPCError({
    code: 'FORBIDDEN',
    message: "You don't have access to this entity.",
  });
}
