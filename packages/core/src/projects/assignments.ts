/**
 * Project assignments service — assign / revoke / list user-project
 * assignments with audit logging.
 */

import { prisma } from '@fmksa/db';
import { auditService } from '../audit/service';
import { ScopeMismatchError } from '../scope-binding';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AssignInput = {
  projectId: string;
  userId: string;
  roleId: string;
  effectiveFrom: Date;
  effectiveTo?: Date | null | undefined;
  assignedBy: string;
};

export type RevokeInput = {
  assignmentId: string;
  reason: string;
  revokedBy: string;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const projectAssignmentsService = {
  /**
   * Assign a user to a project with a specific role.
   */
  async assign(input: AssignInput & { expectedOrgId: string | null }) {
    // Validate project exists
    const project = await prisma.project.findUnique({
      where: { id: input.projectId },
      select: { id: true, orgId: true },
    });
    if (!project) {
      throw new Error(`Project "${input.projectId}" not found.`);
    }

    // PIC-98 PR-3b (F4): cross-org NOT_FOUND-shaped on project. tenant_admin
    // in org A cannot assign users to org-B projects.
    if (input.expectedOrgId !== null && project.orgId !== input.expectedOrgId) {
      throw new ScopeMismatchError('Project', input.projectId, 'org');
    }

    // Validate user exists
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, orgId: true },
    });
    if (!user) {
      throw new Error(`User "${input.userId}" not found.`);
    }

    // PIC-98 PR-3b (F4): user must also be in caller's org (can't assign
    // org-B users into org-A projects either direction).
    if (input.expectedOrgId !== null && user.orgId !== input.expectedOrgId) {
      throw new ScopeMismatchError('User', input.userId, 'org');
    }

    // Validate role exists (roles are platform-wide; no org scope needed)
    const role = await prisma.role.findUnique({
      where: { id: input.roleId },
    });
    if (!role) {
      throw new Error(`Role "${input.roleId}" not found.`);
    }

    const assignment = await prisma.$transaction(async (tx) => {
      const a = await tx.projectAssignment.create({
        data: {
          projectId: input.projectId,
          userId: input.userId,
          roleId: input.roleId,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: input.effectiveTo ?? null,
          assignedBy: input.assignedBy,
          assignedAt: new Date(),
        },
        include: {
          project: true,
          user: { select: { id: true, name: true, email: true } },
          role: { select: { id: true, code: true, name: true } },
        },
      });

      await auditService.log(
        {
          actorUserId: input.assignedBy,
          actorSource: 'user',
          action: 'project_assignment.create',
          resourceType: 'project_assignment',
          resourceId: a.id,
          projectId: input.projectId,
          beforeJson: {},
          afterJson: {
            id: a.id,
            projectId: a.projectId,
            userId: a.userId,
            roleId: a.roleId,
            effectiveFrom: a.effectiveFrom.toISOString(),
            effectiveTo: a.effectiveTo?.toISOString() ?? null,
          },
        },
        tx,
      );

      return a;
    });

    return assignment;
  },

  /**
   * Revoke a project assignment. Reason is required.
   */
  async revoke(input: RevokeInput & { expectedOrgId: string | null }) {
    if (!input.reason || input.reason.trim().length === 0) {
      throw new Error('Reason is required when revoking an assignment.');
    }

    const assignment = await prisma.$transaction(async (tx) => {
      const before = await tx.projectAssignment.findUnique({
        where: { id: input.assignmentId },
        include: { project: { select: { orgId: true } } },
      });
      if (!before) {
        throw new Error(
          `Project assignment "${input.assignmentId}" not found.`,
        );
      }

      // PIC-98 PR-3b (F4): cross-org NOT_FOUND-shaped on assignment's parent
      // project. tenant_admin in org A cannot revoke org-B assignments.
      if (
        input.expectedOrgId !== null &&
        before.project.orgId !== input.expectedOrgId
      ) {
        throw new ScopeMismatchError(
          'ProjectAssignment',
          input.assignmentId,
          'org',
        );
      }

      if (before.revokedAt) {
        throw new Error('Assignment is already revoked.');
      }

      const now = new Date();
      const updated = await tx.projectAssignment.update({
        where: { id: input.assignmentId },
        data: {
          revokedAt: now,
          revokedBy: input.revokedBy,
          reason: input.reason,
        },
        include: {
          project: true,
          user: { select: { id: true, name: true, email: true } },
          role: { select: { id: true, code: true, name: true } },
        },
      });

      await auditService.log(
        {
          actorUserId: input.revokedBy,
          actorSource: 'user',
          action: 'project_assignment.revoke',
          resourceType: 'project_assignment',
          resourceId: input.assignmentId,
          projectId: before.projectId,
          beforeJson: {
            revokedAt: null,
            revokedBy: null,
            reason: before.reason,
          },
          afterJson: {
            revokedAt: now.toISOString(),
            revokedBy: input.revokedBy,
            reason: input.reason,
          },
        },
        tx,
      );

      return updated;
    });

    return assignment;
  },

  /**
   * List active assignments for a project at a given point in time.
   */
  async listAssignments(opts: { projectId: string; at?: Date | undefined }) {
    const at = opts.at ?? new Date();

    return prisma.projectAssignment.findMany({
      where: {
        projectId: opts.projectId,
        revokedAt: null,
        effectiveFrom: { lte: at },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        role: { select: { id: true, code: true, name: true } },
      },
      orderBy: { assignedAt: 'desc' },
    });
  },
};
