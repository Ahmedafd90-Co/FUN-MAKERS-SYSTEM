/**
 * Approver resolution — determines which users can act on a workflow step
 * based on the step's approver rule.
 *
 * Supports four rule types:
 * - `role`         — all users holding the named role (via UserRole, effective-dated)
 * - `user`         — a specific user by UUID
 * - `project_role` — users holding the named role AND assigned to the specific project
 * - `any_of`       — union of multiple sub-rule resolutions (deduplicated)
 */

import { prisma } from '@fmksa/db';
import type { ApproverRule } from '@fmksa/contracts';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class NoApproversFoundError extends Error {
  constructor(rule: ApproverRule, projectId: string) {
    super(
      `No approvers found for rule type "${rule.type}" in project ${projectId}`,
    );
    this.name = 'NoApproversFoundError';
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve the set of user IDs that are valid approvers for the given rule
 * and project at the current point in time.
 *
 * Throws `NoApproversFoundError` if the resolved set is empty.
 */
export async function resolveApprovers(
  rule: ApproverRule,
  projectId: string,
  at: Date = new Date(),
): Promise<string[]> {
  const userIds = await resolveApproversInternal(rule, projectId, at);

  // Deduplicate
  const unique = [...new Set(userIds)];

  if (unique.length === 0) {
    throw new NoApproversFoundError(rule, projectId);
  }

  return unique;
}

/**
 * Check whether a specific user is a valid approver for the given rule
 * and project.
 */
export async function isValidApprover(
  userId: string,
  rule: ApproverRule,
  projectId: string,
  at: Date = new Date(),
): Promise<boolean> {
  try {
    const approvers = await resolveApprovers(rule, projectId, at);
    return approvers.includes(userId);
  } catch (err) {
    if (err instanceof NoApproversFoundError) return false;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Internal resolution
// ---------------------------------------------------------------------------

async function resolveApproversInternal(
  rule: ApproverRule,
  projectId: string,
  at: Date,
): Promise<string[]> {
  switch (rule.type) {
    case 'role':
      return resolveByRole(rule.roleCode, at);
    case 'user':
      return resolveByUser(rule.userId, projectId);
    case 'project_role':
      return resolveByProjectRole(rule.roleCode, projectId, at);
    case 'any_of':
      return resolveAnyOf(rule.rules, projectId, at);
  }
}

/**
 * Find all users with the named role that is currently effective.
 */
async function resolveByRole(roleCode: string, at: Date): Promise<string[]> {
  const role = await prisma.role.findUnique({ where: { code: roleCode } });
  if (!role) return [];

  const userRoles = await prisma.userRole.findMany({
    where: {
      roleId: role.id,
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
    },
    select: { userId: true },
  });

  return userRoles.map((ur) => ur.userId);
}

/**
 * Verify the specific user exists and is assigned to the project.
 */
async function resolveByUser(
  userId: string,
  projectId: string,
): Promise<string[]> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return [];

  // Check the user is assigned to the project (active, non-revoked)
  const assignment = await prisma.projectAssignment.findFirst({
    where: {
      userId,
      projectId,
      revokedAt: null,
      effectiveFrom: { lte: new Date() },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
    },
  });

  return assignment ? [userId] : [];
}

/**
 * Find users with the named role AND assigned to the specific project.
 */
async function resolveByProjectRole(
  roleCode: string,
  projectId: string,
  at: Date,
): Promise<string[]> {
  const role = await prisma.role.findUnique({ where: { code: roleCode } });
  if (!role) return [];

  // Find active project assignments with this role
  const assignments = await prisma.projectAssignment.findMany({
    where: {
      projectId,
      roleId: role.id,
      revokedAt: null,
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
    },
    select: { userId: true },
  });

  return assignments.map((a) => a.userId);
}

/**
 * Union of all sub-rule resolutions (deduplicated by the caller).
 */
async function resolveAnyOf(
  rules: ApproverRule[],
  projectId: string,
  at: Date,
): Promise<string[]> {
  const results = await Promise.all(
    rules.map((r) => resolveApproversInternal(r, projectId, at)),
  );
  return results.flat();
}
