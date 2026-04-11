/**
 * ProcurementCategory tRPC sub-router — entity-scoped.
 *
 * Phase 4, Task 4.6 — Module 3 Procurement Engine.
 * Permission alignment: H3 hardening patch.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  CreateCategoryInputSchema,
  UpdateCategoryInputSchema,
  EntityListFilterInputSchema,
} from '@fmksa/contracts';
import {
  createCategory,
  updateCategory,
  getCategory,
  listCategories,
  getCategoryTree,
  deleteCategory,
} from '@fmksa/core';
import { router, entityProcedure } from '../../trpc';
import { mapError, hasEntityPerm } from './_helpers';

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const categoryRouter = router({
  list: entityProcedure
    .input(EntityListFilterInputSchema.extend({ level: z.string().optional(), parentId: z.string().uuid().nullable().optional() }))
    .query(async ({ ctx, input }) => {
      if (!hasEntityPerm(ctx, 'procurement_category.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      return listCategories(input);
    }),

  get: entityProcedure
    .input(z.object({ entityId: z.string().uuid(), id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!hasEntityPerm(ctx, 'procurement_category.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await getCategory(input.id, input.entityId);
      } catch (err) {
        mapError(err);
      }
    }),

  tree: entityProcedure
    .input(z.object({ entityId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!hasEntityPerm(ctx, 'procurement_category.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      return getCategoryTree(input.entityId);
    }),

  create: entityProcedure
    .input(CreateCategoryInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!hasEntityPerm(ctx, 'procurement_category.manage'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await createCategory(input, ctx.user.id);
      } catch (err) {
        mapError(err);
      }
    }),

  update: entityProcedure
    .input(UpdateCategoryInputSchema.extend({ entityId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!hasEntityPerm(ctx, 'procurement_category.manage'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await updateCategory(input, ctx.user.id, input.entityId);
      } catch (err) {
        mapError(err);
      }
    }),

  delete: entityProcedure
    .input(z.object({ entityId: z.string().uuid(), id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!hasEntityPerm(ctx, 'procurement_category.manage'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        await deleteCategory(input.id, ctx.user.id, input.entityId);
        return { success: true };
      } catch (err) {
        mapError(err);
      }
    }),
});
