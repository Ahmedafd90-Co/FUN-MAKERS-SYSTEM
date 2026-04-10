/**
 * Project assignment lookup.
 *
 * Checks whether a user is currently assigned to a project and retrieves
 * all project IDs the user can access.
 */

import { prisma } from '@fmksa/db';

/**
 * Returns `true` when the user holds an active (non-revoked, temporally
 * effective) assignment to the given project.
 *
 * Active means:
 *   - effectiveFrom <= at
 *   - effectiveTo IS NULL  OR  effectiveTo > at
 *   - revokedAt IS NULL
 */
export async function isAssignedToProject(
  userId: string,
  projectId: string,
  at: Date = new Date(),
): Promise<boolean> {
  const count = await prisma.projectAssignment.count({
    where: {
      userId,
      projectId,
      revokedAt: null,
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
    },
  });

  return count > 0;
}

/**
 * Returns the IDs of all projects the user is currently assigned to.
 */
export async function getAssignedProjectIds(
  userId: string,
  at: Date = new Date(),
): Promise<string[]> {
  const assignments = await prisma.projectAssignment.findMany({
    where: {
      userId,
      revokedAt: null,
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
    },
    select: { projectId: true },
    distinct: ['projectId'],
  });

  return assignments.map((a) => a.projectId);
}
