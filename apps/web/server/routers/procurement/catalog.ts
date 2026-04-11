/**
 * ItemCatalog tRPC sub-router — entity-scoped.
 *
 * Phase 4, Task 4.6 — Module 3 Procurement Engine.
 * Permission alignment: H3 hardening patch.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  CreateCatalogItemInputSchema,
  UpdateCatalogItemInputSchema,
  EntityListFilterInputSchema,
} from '@fmksa/contracts';
import {
  createCatalogItem,
  updateCatalogItem,
  getCatalogItem,
  listCatalogItems,
  searchCatalogItems,
  deleteCatalogItem,
} from '@fmksa/core';
import { router, entityProcedure } from '../../trpc';
import { mapError, hasEntityPerm } from './_helpers';

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const catalogRouter = router({
  list: entityProcedure
    .input(EntityListFilterInputSchema.extend({ search: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      if (!hasEntityPerm(ctx, 'item_catalog.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      return listCatalogItems(input);
    }),

  get: entityProcedure
    .input(z.object({ entityId: z.string().uuid(), id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!hasEntityPerm(ctx, 'item_catalog.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await getCatalogItem(input.id, input.entityId);
      } catch (err) {
        mapError(err);
      }
    }),

  search: entityProcedure
    .input(z.object({ entityId: z.string().uuid(), query: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      if (!hasEntityPerm(ctx, 'item_catalog.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      return searchCatalogItems(input.entityId, input.query);
    }),

  create: entityProcedure
    .input(CreateCatalogItemInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!hasEntityPerm(ctx, 'item_catalog.manage'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await createCatalogItem(input, ctx.user.id);
      } catch (err) {
        mapError(err);
      }
    }),

  update: entityProcedure
    .input(UpdateCatalogItemInputSchema.extend({ entityId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!hasEntityPerm(ctx, 'item_catalog.manage'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await updateCatalogItem(input, ctx.user.id, input.entityId);
      } catch (err) {
        mapError(err);
      }
    }),

  delete: entityProcedure
    .input(z.object({ entityId: z.string().uuid(), id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!hasEntityPerm(ctx, 'item_catalog.manage'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        await deleteCatalogItem(input.id, ctx.user.id, input.entityId);
        return { success: true };
      } catch (err) {
        mapError(err);
      }
    }),
});
