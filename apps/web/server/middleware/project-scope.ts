/**
 * projectScope tRPC middleware helpers — Task 1.3.12
 *
 * Enforces project isolation on every project-scoped procedure.
 * Every project-scoped input includes `projectId: z.string().uuid()`;
 * the middleware validates the caller's assignment before the resolver
 * executes.
 *
 * Access rules:
 *  1. User must be authenticated.
 *  2. Input must contain `projectId`.
 *  3. User must hold an active project assignment — OR —
 *     hold `cross_project.read` (Master Admin / PMO).
 *
 * On denial an audit log entry is written and a user-friendly FORBIDDEN
 * error is thrown. On success, `ctx.projectId` is forwarded to resolvers.
 */

import { TRPCError } from '@trpc/server';
import { accessControlService, auditService } from '@fmksa/core';

/**
 * Extracts projectId from an unknown input payload.
 *
 * Both the raw input (pre-Zod) and parsed input (post-Zod) may carry
 * `projectId`. This helper safely checks for its presence.
 */
export function extractProjectId(input: unknown): string | undefined {
  if (
    input != null &&
    typeof input === 'object' &&
    'projectId' in input &&
    typeof (input as Record<string, unknown>).projectId === 'string'
  ) {
    return (input as Record<string, unknown>).projectId as string;
  }
  return undefined;
}

/**
 * Core project-scope verification logic.
 *
 * Returns the validated projectId on success.
 * Throws TRPCError (FORBIDDEN) on denial after writing an audit log.
 * Throws TRPCError (BAD_REQUEST) when projectId is missing.
 */
export async function verifyProjectAccess(opts: {
  userId: string;
  projectId: string;
  path: string;
}): Promise<void> {
  const { userId, projectId, path } = opts;

  // Check assignment
  const assigned = await accessControlService.isAssignedToProject(
    userId,
    projectId,
  );

  if (assigned) return;

  // Fallback: Master Admin / PMO with cross_project.read
  const crossProject = await accessControlService.canReadAcrossProjects(userId);

  if (crossProject) return;

  // Deny — write audit log and throw
  await auditService.log({
    actorSource: 'user',
    actorUserId: userId,
    action: 'access_denied',
    resourceType: 'project',
    resourceId: projectId,
    projectId,
    beforeJson: {},
    afterJson: { path, reason: 'not_assigned' },
  });

  throw new TRPCError({
    code: 'FORBIDDEN',
    message: "You don't have access to this project.",
  });
}
