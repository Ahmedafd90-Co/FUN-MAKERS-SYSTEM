/**
 * Entities tRPC router — CRUD + hierarchy queries.
 *
 * PIC-98 PR-3b (F4): create/update/archive converted from adminProcedure to
 * protectedProcedure + per-perm hasPerm gate (mirrors PR-3a admin.ts pattern).
 * Every service call passes `expectedOrgId = isPlatformAdmin(ctx) ? null :
 * ctx.orgId` — tenant_admin sees only own-org entities, platform_admin still
 * crosses orgs (F3 D3 survives).
 *
 * NOT-FOUND-shaped denial on cross-org by-id (mirror F3 idiom):
 * ScopeMismatchError → TRPC NOT_FOUND.
 *
 * Root-entity-org-derivation (PD ruling 705f59a9): platform_admin attempting
 * to create a root entity with no orgId throws PlatformRootEntityRequiresOrgError
 * → TRPC PRECONDITION_FAILED (NOT a singleton fallthrough; clean error
 * boundary deferring to PR-4 master-provisioning).
 */
import { TRPCError } from '@trpc/server';
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
  ScopeMismatchError,
  PlatformRootEntityRequiresOrgError,
} from '@fmksa/core';
import { prisma } from '@fmksa/db';
import { router, protectedProcedure } from '../trpc';
import { assertRecordOrgOrNotFound, isPlatformAdmin } from '../middleware/org-scope';

/**
 * Per-procedure permission gate (mirrors posting.ts:42 / admin.ts hasPerm).
 * system.admin always satisfies — the platform-admin marker.
 */
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
function mapEntityError(err: unknown): never {
  if (err instanceof ScopeMismatchError) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Entity not found.',
      cause: err,
    });
  }
  if (err instanceof PlatformRootEntityRequiresOrgError) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: err.message,
      cause: err,
    });
  }
  throw err;
}

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
      if (!hasPerm(ctx, 'entity.view')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      }
      const expectedOrgId = isPlatformAdmin(ctx) ? null : ctx.orgId;
      return entitiesService.listEntities({
        includeArchived: input.includeArchived,
        expectedOrgId,
      });
    }),

  get: protectedProcedure
    .input(GetEntitySchema)
    .query(async ({ ctx, input }) => {
      if (!hasPerm(ctx, 'entity.view')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      }
      const expectedOrgId = isPlatformAdmin(ctx) ? null : ctx.orgId;
      try {
        return await entitiesService.getEntity(input.id, expectedOrgId);
      } catch (err) {
        mapEntityError(err);
      }
    }),

  create: protectedProcedure
    .input(CreateEntitySchema)
    .mutation(async ({ ctx, input }) => {
      if (!hasPerm(ctx, 'entity.edit')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      }
      const expectedOrgId = isPlatformAdmin(ctx) ? null : ctx.orgId;
      try {
        return await entitiesService.createEntity({
          code: input.code,
          name: input.name,
          type: input.type,
          parentEntityId: input.parentEntityId ?? null,
          status: input.status,
          metadata: (input.metadata as Record<string, unknown>) ?? null,
          createdBy: ctx.user.id,
          expectedOrgId,
        });
      } catch (err) {
        mapEntityError(err);
      }
    }),

  update: protectedProcedure
    .input(UpdateEntitySchema)
    .mutation(async ({ ctx, input }) => {
      if (!hasPerm(ctx, 'entity.edit')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      }
      const expectedOrgId = isPlatformAdmin(ctx) ? null : ctx.orgId;
      const { id, ...rest } = input;
      try {
        return await entitiesService.updateEntity(
          id,
          {
            name: rest.name,
            type: rest.type,
            parentEntityId: rest.parentEntityId,
            status: rest.status,
            metadata: (rest.metadata as Record<string, unknown>) ?? null,
          },
          ctx.user.id,
          expectedOrgId,
        );
      } catch (err) {
        mapEntityError(err);
      }
    }),

  archive: protectedProcedure
    .input(ArchiveEntitySchema)
    .mutation(async ({ ctx, input }) => {
      if (!hasPerm(ctx, 'entity.edit')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      }
      const expectedOrgId = isPlatformAdmin(ctx) ? null : ctx.orgId;
      try {
        return await entitiesService.archiveEntity(
          input.id,
          input.reason,
          ctx.user.id,
          expectedOrgId,
        );
      } catch (err) {
        mapEntityError(err);
      }
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
