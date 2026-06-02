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
import { prisma } from '@fmksa/db';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { assertRecordOrgOrNotFound } from '../middleware/org-scope';

/**
 * PIC-97 (F3): assert the entity is in the caller's org — NOT-FOUND-shaped, so a
 * cross-org entity is indistinguishable from a non-existent one (no existence
 * disclosure on the by-id hierarchy reads).
 */
async function assertEntityInOrg(
  ctx: { user: { permissions: string[] } | null; orgId: string | null },
  entityId: string,
): Promise<void> {
  const entity = await prisma.entity.findUnique({
    where: { id: entityId },
    select: { orgId: true },
  });
  assertRecordOrgOrNotFound(entity, ctx, 'Entity');
}

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
    .query(async ({ ctx, input }) => {
      await assertEntityInOrg(ctx, input.entityId);
      return getAncestors(input.entityId);
    }),

  descendants: protectedProcedure
    .input(EntityIdSchema)
    .query(async ({ ctx, input }) => {
      await assertEntityInOrg(ctx, input.entityId);
      return getDescendants(input.entityId);
    }),

  siblings: protectedProcedure
    .input(EntityIdSchema)
    .query(async ({ ctx, input }) => {
      await assertEntityInOrg(ctx, input.entityId);
      return getSiblings(input.entityId);
    }),
});
