/**
 * Entities tRPC router — CRUD + hierarchy queries.
 */
import {
  CreateEntitySchema,
  UpdateEntitySchema,
  ArchiveEntitySchema,
  GetEntitySchema,
  ListEntitiesSchema,
  EntityIdSchema,
} from '@fmksa/contracts';
import {
  entitiesService,
  getAncestors,
  getDescendants,
  getSiblings,
} from '@fmksa/core';
import { accessControlService } from '@fmksa/core';
import { router, protectedProcedure, adminProcedure } from '../trpc';

export const entitiesRouter = router({
  list: protectedProcedure
    .input(ListEntitiesSchema)
    .query(async ({ ctx, input }) => {
      await accessControlService.requirePermission(ctx.user.id, 'entity.view');
      return entitiesService.listEntities({
        includeArchived: input.includeArchived,
      });
    }),

  get: protectedProcedure
    .input(GetEntitySchema)
    .query(async ({ ctx, input }) => {
      await accessControlService.requirePermission(ctx.user.id, 'entity.view');
      return entitiesService.getEntity(input.id);
    }),

  create: adminProcedure
    .input(CreateEntitySchema)
    .mutation(async ({ ctx, input }) => {
      await accessControlService.requirePermission(ctx.user.id, 'entity.edit');
      return entitiesService.createEntity({
        code: input.code,
        name: input.name,
        type: input.type,
        parentEntityId: input.parentEntityId ?? null,
        status: input.status,
        metadata: (input.metadata as Record<string, unknown>) ?? null,
        createdBy: ctx.user.id,
      });
    }),

  update: adminProcedure
    .input(UpdateEntitySchema)
    .mutation(async ({ ctx, input }) => {
      await accessControlService.requirePermission(ctx.user.id, 'entity.edit');
      const { id, ...rest } = input;
      return entitiesService.updateEntity(
        id,
        {
          name: rest.name,
          type: rest.type,
          parentEntityId: rest.parentEntityId,
          status: rest.status,
          metadata: (rest.metadata as Record<string, unknown>) ?? null,
        },
        ctx.user.id,
      );
    }),

  archive: adminProcedure
    .input(ArchiveEntitySchema)
    .mutation(async ({ ctx, input }) => {
      await accessControlService.requirePermission(ctx.user.id, 'entity.edit');
      return entitiesService.archiveEntity(
        input.id,
        input.reason,
        ctx.user.id,
      );
    }),

  ancestors: protectedProcedure
    .input(EntityIdSchema)
    .query(async ({ input }) => {
      return getAncestors(input.entityId);
    }),

  descendants: protectedProcedure
    .input(EntityIdSchema)
    .query(async ({ input }) => {
      return getDescendants(input.entityId);
    }),

  siblings: protectedProcedure
    .input(EntityIdSchema)
    .query(async ({ input }) => {
      return getSiblings(input.entityId);
    }),
});
