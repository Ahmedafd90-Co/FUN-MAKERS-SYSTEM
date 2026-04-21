/**
 * Projects tRPC router — CRUD, settings, and assignments.
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
} from '@fmksa/core';
import { accessControlService } from '@fmksa/core';
import {
  router,
  protectedProcedure,
  adminProcedure,
  projectProcedure,
} from '../trpc';

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

  assign: adminProcedure
    .input(AssignProjectSchema)
    .mutation(async ({ ctx, input }) => {
      await accessControlService.requirePermission(ctx.user.id, 'user.edit');
      return projectAssignmentsService.assign({
        projectId: input.projectId,
        userId: input.userId,
        roleId: input.roleId,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo ?? null,
        assignedBy: ctx.user.id,
      });
    }),

  revoke: adminProcedure
    .input(RevokeAssignmentSchema)
    .mutation(async ({ ctx, input }) => {
      await accessControlService.requirePermission(ctx.user.id, 'user.edit');
      return projectAssignmentsService.revoke({
        assignmentId: input.assignmentId,
        reason: input.reason,
        revokedBy: ctx.user.id,
      });
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
        includeTestProjects: input.includeTestProjects,
      });
    }),

  get: projectProcedure.input(GetProjectSchema).query(async ({ ctx, input }) => {
    return projectsService.getProject(input.id, ctx.user.id);
  }),

  create: adminProcedure
    .input(CreateProjectSchema)
    .mutation(async ({ ctx, input }) => {
      await accessControlService.requirePermission(
        ctx.user.id,
        'project.create',
      );
      return projectsService.createProject({
        code: input.code,
        name: input.name,
        entityId: input.entityId,
        currencyCode: input.currencyCode,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        contractValue: input.contractValue ?? null,
        createdBy: ctx.user.id,
      });
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

  archive: adminProcedure
    .input(ArchiveProjectSchema)
    .mutation(async ({ ctx, input }) => {
      await accessControlService.requirePermission(
        ctx.user.id,
        'project.archive',
      );
      return projectsService.archiveProject(
        input.id,
        input.reason,
        ctx.user.id,
      );
    }),

  // ---------------------------------------------------------------------------
  // User search — for assignment pickers
  // ---------------------------------------------------------------------------

  userSearch: protectedProcedure
    .input(z.object({ query: z.string().min(1).max(100) }))
    .query(async ({ input }) => {
      const users = await prisma.user.findMany({
        where: {
          OR: [
            { name: { contains: input.query, mode: 'insensitive' } },
            { email: { contains: input.query, mode: 'insensitive' } },
          ],
          // Default: active users only. This is an explicit assumption —
          // inactive/locked users should generally not be assigned to projects.
          // If a business rule requires assigning non-active users, this
          // filter should be removed or made configurable.
          status: 'active',
        },
        select: { id: true, name: true, email: true, status: true },
        take: 20,
        orderBy: { name: 'asc' },
      });
      return users;
    }),

  // ---------------------------------------------------------------------------
  // Role list — for assignment pickers
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
