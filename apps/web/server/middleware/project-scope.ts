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
import { prisma } from '@fmksa/db';
import { accessControlService, auditService } from '@fmksa/core';
import { orgMatches } from './org-scope';

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
  /** PIC-97 (F3): the caller's tenant org (ctx.orgId). */
  orgId: string | null;
  /** PIC-97 (F3): platform-admin (system.admin) bypass — preserved; F4 splits it. */
  platformAdmin: boolean;
}): Promise<void> {
  const { userId, projectId, path, orgId, platformAdmin } = opts;

  // 1. Access: project assignment (org-safe by construction) OR the
  //    cross_project.read fallback (Master Admin / PMO — global today).
  const assigned = await accessControlService.isAssignedToProject(
    userId,
    projectId,
  );
  const granted =
    assigned || (await accessControlService.canReadAcrossProjects(userId));

  if (!granted) {
    await logProjectDenial(userId, projectId, path, 'not_assigned');
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: "You don't have access to this project.",
    });
  }

  // 2. PIC-97 (F3) tenant-org gate — DENY-BY-DEFAULT + FAIL-CLOSED (a null orgId
  //    on either side never passes), UNLESS the caller is a platform-admin. This
  //    is what scopes the cross_project.read fallback to the caller's org (the
  //    cross-tenant leak), centrally — no per-call-site filters downstream.
  if (!platformAdmin) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { orgId: true },
    });
    if (!orgMatches(orgId, project?.orgId, false)) {
      await logProjectDenial(userId, projectId, path, 'org_mismatch');
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: "You don't have access to this project.",
      });
    }
  }
}

/** Write the access-denied audit row for a project-scope denial. */
async function logProjectDenial(
  userId: string,
  projectId: string,
  path: string,
  reason: string,
): Promise<void> {
  await auditService.log({
    actorSource: 'user',
    actorUserId: userId,
    action: 'access_denied',
    resourceType: 'project',
    resourceId: projectId,
    projectId,
    beforeJson: {},
    afterJson: { path, reason },
  });
}
