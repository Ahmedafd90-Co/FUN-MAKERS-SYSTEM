/**
 * Screen permission resolution.
 *
 * Each (role, screenCode) pair can have:
 *   1. A project-specific override row  (projectId != null)
 *   2. A role-level default row          (projectId = null)
 *
 * Resolution: if a project-specific row exists for a role → use it.
 * Otherwise fall back to the role-level default. Across ALL effective roles
 * the most permissive flags win (boolean OR / union).
 */

import { prisma } from '@fmksa/db';
import { getEffectiveRoles } from './permissions';

export type ScreenPermissionResult = {
  canView: boolean;
  canEdit: boolean;
  canApprove: boolean;
};

/**
 * Returns the merged screen-level permission flags for a user on a given
 * screen, optionally scoped to a project.
 */
export async function getScreenPermissions(
  userId: string,
  screenCode: string,
  projectId?: string,
): Promise<ScreenPermissionResult> {
  const roles = await getEffectiveRoles(userId);
  if (roles.length === 0) {
    return { canView: false, canEdit: false, canApprove: false };
  }

  const roleIds = roles.map((r) => r.id);

  // Fetch all ScreenPermission rows for these roles + screenCode.
  // We need both project-specific and role-default rows.
  const rows = await prisma.screenPermission.findMany({
    where: {
      roleId: { in: roleIds },
      screenCode,
      OR: [{ projectId: projectId ?? null }, { projectId: null }],
    },
  });

  // Build a per-role resolved permission (project-specific wins over default).
  let canView = false;
  let canEdit = false;
  let canApprove = false;

  for (const roleId of roleIds) {
    const projectRow = projectId
      ? rows.find((r) => r.roleId === roleId && r.projectId === projectId)
      : undefined;
    const defaultRow = rows.find(
      (r) => r.roleId === roleId && r.projectId === null,
    );

    const effective = projectRow ?? defaultRow;
    if (effective) {
      canView = canView || effective.canView;
      canEdit = canEdit || effective.canEdit;
      canApprove = canApprove || effective.canApprove;
    }
  }

  return { canView, canEdit, canApprove };
}
