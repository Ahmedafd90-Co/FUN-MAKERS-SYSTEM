/**
 * Projects tRPC router — CRUD, settings, and assignments.
 *
 * PIC-98 PR-3b (F4):
 *   - create/archive + assignments.assign/revoke converted from adminProcedure
 *     to protectedProcedure + per-perm hasPerm (mirrors PR-3a pattern).
 *   - projects.userSearch (PR-3b D1 leak): added user.view perm gate + org-
 *     scoping (mirrors admin.userList from PR-3a — same User-read leak family
 *     that PR-3a fixed at the admin router, just in the projects router).
 *   - Service calls pass expectedOrgId = isPlatformAdmin(ctx) ? null : ctx.orgId.
 *   - ScopeMismatchError → TRPC NOT_FOUND (F3 idiom; no existence disclosure).
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { prisma } from '@fmksa/db';
import {
  CreateProjectSchema,
  UpdateProjectSchema,
  ArchiveProjectSchema,
  GetProjectSchema,
  ListProjectsSchema,
  GetProjectSettingSchema,
  SetProjectSettingSchema,
  GetAllProjectSettingsSchema,
  AssignProjectSchema,
  RevokeAssignmentSchema,
  ListAssignmentsSchema,
} from '@fmksa/contracts';
import {
  projectsService,
  projectSettingsService,
  projectAssignmentsService,
  ScopeMismatchError,
} from '@fmksa/core';
import { accessControlService } from '@fmksa/core';
import {
  router,
  protectedProcedure,
  projectProcedure,
} from '../trpc';
import { isPlatformAdmin } from '../middleware/org-scope';

/** Per-procedure permission gate. system.admin always satisfies. */
function hasPerm(
  ctx: { user: { permissions: string[] } },
  perm: string,
): boolean {
  return (
    ctx.user.permissions.includes('system.admin') ||
    ctx.user.permissions.includes(perm)
  );
}

/** Map service-layer errors to TRPC errors (NOT-FOUND-shaped on org mismatch). */
function mapProjectError(err: unknown): never {
  if (err instanceof ScopeMismatchError) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Project not found.',
      cause: err,
    });
  }
  throw err;
}

// ---------------------------------------------------------------------------
// Sub-routers
// ---------------------------------------------------------------------------

const settingsRouter = router({
  get: projectProcedure
    .input(GetProjectSettingSchema)
    .query(async ({ input }) => {
      return projectSettingsService.getSetting(input.projectId, input.key);
    }),

  set: projectProcedure
    .input(SetProjectSettingSchema)
    .mutation(async ({ ctx, input }) => {
      await accessControlService.requirePermission(
        ctx.user.id,
        'project.edit',
        input.projectId,
      );
      return projectSettingsService.setSetting(
        input.projectId,
        input.key,
        input.value as any,
        ctx.user.id,
      );
    }),

  getAll: projectProcedure
    .input(GetAllProjectSettingsSchema)
    .query(async ({ input }) => {
      return projectSettingsService.getAllSettings(input.projectId);
    }),
});

const assignmentsRouter = router({
  list: projectProcedure
    .input(ListAssignmentsSchema)
    .query(async ({ input }) => {
      return projectAssignmentsService.listAssignments({
        projectId: input.projectId,
        ...(input.at != null ? { at: input.at } : {}),
      });
    }),

  assign: protectedProcedure
    .input(AssignProjectSchema)
    .mutation(async ({ ctx, input }) => {
      if (!hasPerm(ctx, 'user.edit')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      }
      const expectedOrgId = isPlatformAdmin(ctx) ? null : ctx.orgId;
      try {
        return await projectAssignmentsService.assign({
          projectId: input.projectId,
          userId: input.userId,
          roleId: input.roleId,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: input.effectiveTo ?? null,
          assignedBy: ctx.user.id,
          expectedOrgId,
        });
      } catch (err) {
        mapProjectError(err);
      }
    }),

  revoke: protectedProcedure
    .input(RevokeAssignmentSchema)
    .mutation(async ({ ctx, input }) => {
      if (!hasPerm(ctx, 'user.edit')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      }
      const expectedOrgId = isPlatformAdmin(ctx) ? null : ctx.orgId;
      try {
        return await projectAssignmentsService.revoke({
          assignmentId: input.assignmentId,
          reason: input.reason,
          revokedBy: ctx.user.id,
          expectedOrgId,
        });
      } catch (err) {
        mapProjectError(err);
      }
    }),
});

// ---------------------------------------------------------------------------
// Main router
// ---------------------------------------------------------------------------

export const projectsRouter = router({
  list: protectedProcedure
    .input(ListProjectsSchema)
    .query(async ({ ctx, input }) => {
      return projectsService.listProjects({
        userId: ctx.user.id,
        includeArchived: input.includeArchived,
      });
    }),

  get: projectProcedure.input(GetProjectSchema).query(async ({ ctx, input }) => {
    return projectsService.getProject(input.id, ctx.user.id);
  }),

  create: protectedProcedure
    .input(CreateProjectSchema)
    .mutation(async ({ ctx, input }) => {
      if (!hasPerm(ctx, 'project.create')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      }
      const expectedOrgId = isPlatformAdmin(ctx) ? null : ctx.orgId;
      try {
        return await projectsService.createProject({
          code: input.code,
          name: input.name,
          entityId: input.entityId,
          currencyCode: input.currencyCode,
          startDate: input.startDate,
          endDate: input.endDate ?? null,
          contractValue: input.contractValue ?? null,
          createdBy: ctx.user.id,
          expectedOrgId,
        });
      } catch (err) {
        mapProjectError(err);
      }
    }),

  update: projectProcedure
    .input(UpdateProjectSchema)
    .mutation(async ({ ctx, input }) => {
      await accessControlService.requirePermission(
        ctx.user.id,
        'project.edit',
        input.id,
      );
      const { id, ...rest } = input;
      return projectsService.updateProject(
        id,
        {
          name: rest.name,
          entityId: rest.entityId,
          currencyCode: rest.currencyCode,
          startDate: rest.startDate,
          endDate: rest.endDate,
          status: rest.status,
          contractValue: rest.contractValue,
          revisedContractValue: rest.revisedContractValue,
        },
        ctx.user.id,
      );
    }),

  archive: protectedProcedure
    .input(ArchiveProjectSchema)
    .mutation(async ({ ctx, input }) => {
      if (!hasPerm(ctx, 'project.archive')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      }
      const expectedOrgId = isPlatformAdmin(ctx) ? null : ctx.orgId;
      try {
        return await projectsService.archiveProject(
          input.id,
          input.reason,
          ctx.user.id,
          expectedOrgId,
        );
      } catch (err) {
        mapProjectError(err);
      }
    }),

  // ---------------------------------------------------------------------------
  // User search — for assignment pickers
  //
  // PIC-98 PR-3b D1: this was a tenant-reachable User-read leak (zero perm,
  // zero scoping; any authenticated caller could discover cross-org users
  // by name fragment). Fixed by mirroring admin.userList from PR-3a:
  // user.view perm gate + ctx.orgId filter for non-platform callers.
  // ---------------------------------------------------------------------------

  userSearch: protectedProcedure
    .input(z.object({ query: z.string().min(1).max(100) }))
    .query(async ({ ctx, input }) => {
      if (!hasPerm(ctx, 'user.view')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      }

      const where: Record<string, unknown> = {
        OR: [
          { name: { contains: input.query, mode: 'insensitive' } },
          { email: { contains: input.query, mode: 'insensitive' } },
        ],
        status: 'active',
      };

      // PIC-98 PR-3b D1: org-scope all User reads for non-platform callers.
      // tenant_admin sees only own-org users; platform_admin (system.admin)
      // still crosses orgs (F3 D3 survives by construction).
      if (!isPlatformAdmin(ctx) && ctx.orgId) {
        where.orgId = ctx.orgId;
      }

      const users = await prisma.user.findMany({
        where,
        select: { id: true, name: true, email: true, status: true },
        take: 20,
        orderBy: { name: 'asc' },
      });
      return users;
    }),

  // ---------------------------------------------------------------------------
  // Role list — for assignment pickers
  //
  // Roles are platform-wide by design (same taxonomy across orgs:
  // platform_admin / tenant_admin / project_manager / etc.). NOT a cross-org
  // leak — intentional sharing. PR-3b positive proof confirms this.
  // ---------------------------------------------------------------------------

  roleList: protectedProcedure
    .query(async () => {
      const roles = await prisma.role.findMany({
        where: { isSystem: true },
        select: { id: true, code: true, name: true },
        orderBy: { name: 'asc' },
      });
      return roles;
    }),

  settings: settingsRouter,
  assignments: assignmentsRouter,
});
