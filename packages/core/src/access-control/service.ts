/**
 * Access-control service — single entry point collecting all access-control
 * methods for downstream consumers.
 */

import { getEffectiveRoles, getPermissionCodes, hasPermission } from './permissions';
import { isAssignedToProject, getAssignedProjectIds } from './project-scope';
import { canReadAcrossProjects } from './cross-project';
import { getScreenPermissions } from './screen-permissions';
import { PermissionDeniedError } from './errors';

// ---------------------------------------------------------------------------
// Task 1.3.10 — requirePermission helper
// ---------------------------------------------------------------------------

/**
 * Guard that throws `PermissionDeniedError` when the user lacks the required
 * permission.  When `projectId` is provided, the error payload includes it
 * for downstream context (the actual project-scoped check is done by the
 * `projectScope` tRPC middleware in Group C).
 *
 * Returns `void` on success — designed for use as a precondition:
 *
 * ```ts
 * await accessControlService.requirePermission(userId, 'document.upload', projectId);
 * // … proceed with the mutation
 * ```
 */
export async function requirePermission(
  userId: string,
  permissionCode: string,
  projectId?: string,
): Promise<void> {
  const granted = await hasPermission(userId, permissionCode);
  if (!granted) {
    throw new PermissionDeniedError({ permissionCode, projectId });
  }
}

// ---------------------------------------------------------------------------
// Aggregate service object
// ---------------------------------------------------------------------------

export const accessControlService = {
  getEffectiveRoles,
  getPermissionCodes,
  hasPermission,
  requirePermission,
  isAssignedToProject,
  getAssignedProjectIds,
  canReadAcrossProjects,
  getScreenPermissions,
};
