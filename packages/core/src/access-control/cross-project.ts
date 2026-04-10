/**
 * Cross-project read check.
 *
 * Only users who hold the `cross_project.read` permission can see data
 * outside their assigned projects.
 */

import { hasPermission } from './permissions';

/**
 * Returns `true` when the user holds the `cross_project.read` permission.
 */
export async function canReadAcrossProjects(userId: string): Promise<boolean> {
  return hasPermission(userId, 'cross_project.read');
}
